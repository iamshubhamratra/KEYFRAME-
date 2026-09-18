// Unit tests for video_edit/engine/progress.js.
// Run: node scripts/video_edit_progress.test.cjs
//
// Load-bearing: ffmpeg's -progress stream is parsed identically however the pipe chunks it (a
// key split mid-word, CRLF, one byte at a time), `out_time_ms` is read as MICROseconds, the bar
// never moves backwards, and the ETA ratio learned on this host survives a restart.

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { createHarness, mkTmp, makeSettings, installFetchTripwire } = require("./lib/video_edit_test_utils.cjs");
const P = require("../src/video_edit/engine/progress");
const { STAGES } = require("../src/video_edit/constants");

const { t, section, run } = createHarness();
const restoreFetch = installFetchTripwire();
const tmp = mkTmp("ve-progress-");

const STREAM = [
  "frame=10\nfps=0.0\nout_time_us=500000\nout_time_ms=500000\nout_time=00:00:00.500000\nspeed=2.0x\nprogress=continue\n",
  "frame=20\nout_time_us=N/A\nout_time_ms=1000000\nprogress=continue\n",
  "frame=25\nout_time=00:00:01.500000\nprogress=continue\n",
  "frame=15\nout_time_us=700000\nprogress=continue\n",
  "frame=40\nout_time_us=2000000\nprogress=end\n",
  "out_time_us=9000000\nprogress=continue\n",
].join("");

function collect(expected, feedChunks) {
  const got = [];
  const feed = P.createProgressParser(expected, (pct, info) => got.push({ pct, ...info }));
  feedChunks(feed);
  return got;
}

section("progress — ffmpeg -progress parser");

t("whole stream: µs keys, out_time_ms is µs, clock fallback, monotonic, end → 100, nothing after end", () => {
  const got = collect(2, (feed) => feed(STREAM));
  assert.deepEqual(got.map((g) => g.pct), [25, 50, 75, 75, 100]);
  assert.equal(got[0].outTimeSec, 0.5);
  assert.equal(got[0].speed, 2);
  assert.equal(got[1].outTimeSec, 1, "out_time_ms=1000000 is one second");
  assert.equal(got[3].outTimeSec, 0.7, "a backwards timestamp is reported...");
  assert.equal(got[3].pct, 75, "...but never moves the bar backwards");
  assert.equal(got[4].done, true);
});

t("split chunks (mid-key, mid-value, mid-newline) and byte-by-byte parse identically", () => {
  const whole = collect(2, (feed) => feed(STREAM));
  const splitAt = [3, 17, 40, 41, 90, 91, 150];
  const split = collect(2, (feed) => {
    let last = 0;
    for (const i of splitAt) { feed(STREAM.slice(last, i)); last = i; }
    feed(STREAM.slice(last));
  });
  const bytes = collect(2, (feed) => { for (const ch of STREAM) feed(ch); });
  const buffers = collect(2, (feed) => feed(Buffer.from(STREAM)));
  assert.deepEqual(split, whole);
  assert.deepEqual(bytes, whole);
  assert.deepEqual(buffers, whole);
});

t("CRLF line endings", () => {
  const got = collect(4, (feed) => feed(STREAM.replace(/\n/g, "\r\n")));
  assert.deepEqual(got.map((g) => g.pct), [12.5, 25, 37.5, 37.5, 100]);
});

t("unknown expected duration → pct null until end; never exceeds 99.9 before end", () => {
  assert.deepEqual(collect(0, (feed) => feed(STREAM)).map((g) => g.pct), [null, null, null, null, 100]);
  const over = collect(1, (feed) => feed("out_time_us=5000000\nprogress=continue\n"));
  assert.equal(over[0].pct, 99.9);
});

t("a throwing callback does not break the parser", () => {
  let calls = 0;
  const feed = P.createProgressParser(2, () => { calls++; throw new Error("boom"); });
  feed(STREAM);
  assert.equal(calls, 5);
});

section("progress — stage weights");

t("weights cover exactly the pipeline stages and sum to 100", () => {
  assert.deepEqual(Object.keys(P.STAGE_WEIGHTS), [...STAGES]);
  assert.equal(Object.values(P.STAGE_WEIGHTS).reduce((a, b) => a + b, 0), 100);
  assert.ok(Object.isFrozen(P.STAGE_WEIGHTS));
});

t("overallPct: empty, partial, skipped, complete, no double count", () => {
  assert.equal(P.overallPct({}, null, 0), 0);
  assert.equal(P.overallPct({ VALIDATING: { status: "done" } }, "COMPRESSING", 50), 8);
  assert.equal(P.overallPct({ VALIDATING: { status: "done" }, COMPRESSING: { status: "skipped" } }, "EXTRACTING_AUDIO", 0), 14);
  const all = Object.fromEntries(STAGES.map((s) => [s, { status: "done" }]));
  assert.equal(P.overallPct(all, null, 0), 100);
  assert.equal(P.overallPct(all, "QUALITY_CHECK", 10), 100, "a done current stage counts once, fully");
  assert.equal(P.overallPct({ VALIDATING: { status: "failed" } }, "VALIDATING", 250), 2, "stagePct is clamped");
  assert.equal(P.overallPct(null, "UNKNOWN", 50), 0);
});

section("progress — ETA model");

t("estimate scales with duration, pixels and cpus for CPU-bound stages only", () => {
  const s = makeSettings(tmp.dir);
  const eta = P.createEtaModel({ settings: s });
  const base = eta.estimate("COMPRESSING", { durationSec: 30, pixels: 2.07e6, cpus: 4 });
  assert.ok(base > 0);
  assert.ok(eta.estimate("COMPRESSING", { durationSec: 60, pixels: 2.07e6, cpus: 4 }) > base);
  assert.ok(eta.estimate("COMPRESSING", { durationSec: 30, pixels: 8.3e6, cpus: 4 }) > base);
  assert.ok(eta.estimate("COMPRESSING", { durationSec: 30, pixels: 2.07e6, cpus: 1 }) > base);
  const net = eta.estimate("TRANSCRIBING", { durationSec: 30, pixels: 2.07e6, cpus: 4 });
  assert.equal(eta.estimate("TRANSCRIBING", { durationSec: 30, pixels: 8.3e6, cpus: 1 }), net, "network stage ignores pixels/cpus");
  assert.equal(eta.estimate("NOPE", {}), 0);
});

t("EWMA ratio (α .3) persists to _metrics/stage-rates.json and is reloaded", () => {
  const s = makeSettings(tmp.dir);
  const eta = P.createEtaModel({ settings: s });
  const before = eta.estimate("RENDERING", { durationSec: 20, cpus: 2 });
  assert.equal(eta.save(), false, "nothing to save before a record");
  const r1 = eta.record("RENDERING", 20000, 10000);          // sample 2.0
  assert.ok(Math.abs(r1 - 1.3) < 1e-9, `ratio ${r1}`);
  const r2 = eta.record("RENDERING", 5000, 10000);           // sample 0.5
  assert.ok(Math.abs(r2 - (1.3 * 0.7 + 0.5 * 0.3)) < 1e-9, `ratio ${r2}`);
  assert.equal(eta.record("RENDERING", 0, 10000), null, "invalid samples ignored");
  assert.equal(eta.save(), true);
  const file = path.join(s.paths.metricsDir, "stage-rates.json");
  assert.ok(fs.existsSync(file));
  const reloaded = P.createEtaModel({ settings: s });
  assert.ok(Math.abs(reloaded.ratios().RENDERING.ratio - r2) < 1e-9);
  assert.equal(reloaded.ratios().RENDERING.n, 2);
  const after = reloaded.estimate("RENDERING", { durationSec: 20, cpus: 2 });
  assert.ok(Math.abs(after - before * r2) < 0.2, `${after} vs ${before} × ${r2}`);
});

t("sample ratios are clamped and a corrupt metrics file is ignored", () => {
  const s = makeSettings(path.join(tmp.dir, "corrupt"));
  fs.mkdirSync(s.paths.metricsDir, { recursive: true });
  fs.writeFileSync(path.join(s.paths.metricsDir, "stage-rates.json"), "{not json");
  const eta = P.createEtaModel({ settings: s });
  assert.deepEqual(eta.ratios(), {});
  assert.ok(eta.record("VALIDATING", 1e9, 1) <= 10);
});

t("remaining(): model only below 5 %, 50/50 blend with observed rate above", () => {
  const eta = P.createEtaModel({ file: path.join(tmp.dir, "unused.json") });
  const total = eta.estimate("TRANSCRIBING", { durationSec: 60 });
  assert.equal(eta.remaining("TRANSCRIBING", { durationSec: 60, stagePct: 0, elapsedMs: 0 }), total);
  assert.equal(eta.remaining("TRANSCRIBING", { durationSec: 60, stagePct: 4, elapsedMs: 100000 }), Math.round(total * 0.96 * 10) / 10);
  const blended = eta.remaining("TRANSCRIBING", { durationSec: 60, stagePct: 50, elapsedMs: 10000 });
  assert.equal(blended, Math.round((0.5 * total * 0.5 + 0.5 * 10) * 10) / 10);
  assert.equal(eta.remaining("TRANSCRIBING", { durationSec: 60, stagePct: 100, elapsedMs: 10000 }), 0);
});

run().finally(() => { restoreFetch(); tmp.cleanup(); });
