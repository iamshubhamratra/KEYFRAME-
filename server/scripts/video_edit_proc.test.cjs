// Unit tests for video_edit/engine/proc.js — real ffmpeg children, killed on purpose.
// Run: node scripts/video_edit_proc.test.cjs
//
// Load-bearing: an endless `ffmpeg -f lavfi -i testsrc2 -f null -` is killed by timeout, by stall
// watchdog and by an abort signal within 5 s each; the child is really gone when the promise
// settles; and _runtime/pids.json holds the pid while it runs and nothing afterwards.

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { createHarness, mkTmp, makeFixture, installFetchTripwire, isAlive } = require("./lib/video_edit_test_utils.cjs");
const proc = require("../src/video_edit/engine/proc");
const { isEditError } = require("../src/video_edit/errors");

const { t, section, run } = createHarness();
const restoreFetch = installFetchTripwire();
const tmp = mkTmp("ve-proc-");
const pidFile = path.join(tmp.dir, "_runtime", "pids.json");
const ENDLESS = ["-re", "-f", "lavfi", "-i", "testsrc2=size=320x240:rate=30", "-nostats", "-f", "null", "-"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function expectReject(promise, code) {
  try { await promise; } catch (e) {
    assert.ok(isEditError(e), `expected EditError, got ${e && e.stack}`);
    assert.equal(e.code, code, `expected ${code}, got ${e.code} (${e.detail})`);
    return e;
  }
  throw new Error(`expected ${code}`);
}

// Poll the registry until the child shows up; returns its pid.
async function pidWhileRunning(label) {
  for (let i = 0; i < 100; i++) {
    const hit = proc.readPidRegistry(pidFile).find((p) => p.label === label);
    if (hit) return hit.pid;
    await sleep(20);
  }
  throw new Error(`pid for ${label} never registered`);
}

async function assertGone(pid) {
  for (let i = 0; i < 20 && isAlive(pid); i++) await sleep(100);
  assert.equal(isAlive(pid), false, `pid ${pid} still alive`);
  assert.ok(!proc.readPidRegistry(pidFile).some((p) => p.pid === pid), "registry still lists the pid");
}

section("proc — kills");

t("timeout kills an endless ffmpeg within 5 s (PROC_TIMEOUT) and cleans the registry", async () => {
  const t0 = Date.now();
  const p = proc.ffmpeg(ENDLESS, { timeoutMs: 1200, pidFile, label: "t-timeout" });
  const pid = await pidWhileRunning("t-timeout");
  assert.equal(isAlive(pid), true);
  const e = await expectReject(p, "PROC_TIMEOUT");
  assert.equal(e.errorClass, "transient");
  assert.ok(Date.now() - t0 < 1200 + 5000, `took ${Date.now() - t0}ms`);
  await assertGone(pid);
});

t("stall watchdog kills a silent ffmpeg (PROC_STALL)", async () => {
  const t0 = Date.now();
  const p = proc.ffmpeg(ENDLESS, { stallMs: 900, timeoutMs: 60000, pidFile, label: "t-stall" });
  const pid = await pidWhileRunning("t-stall");
  await expectReject(p, "PROC_STALL");
  assert.ok(Date.now() - t0 < 900 + 5000, `took ${Date.now() - t0}ms`);
  await assertGone(pid);
});

t("abort signal kills within 5 s (PROC_ABORTED); pre-aborted never spawns", async () => {
  const ac = new AbortController();
  const p = proc.ffmpeg(ENDLESS, { signal: ac.signal, timeoutMs: 60000, pidFile, label: "t-abort", lowPriority: true });
  const pid = await pidWhileRunning("t-abort");
  await sleep(300);
  const t0 = Date.now();
  ac.abort();
  const e = await expectReject(p, "PROC_ABORTED");
  assert.equal(e.errorClass, "cancelled");
  assert.ok(Date.now() - t0 < 5000, `abort took ${Date.now() - t0}ms`);
  await assertGone(pid);

  const done = new AbortController();
  done.abort();
  await expectReject(proc.ffmpeg(ENDLESS, { signal: done.signal, pidFile, label: "t-pre" }), "PROC_ABORTED");
  assert.ok(!proc.readPidRegistry(pidFile).some((x) => x.label === "t-pre"));
});

t("stdout cap kills a flood (PROC_EXIT reason STDOUT_LIMIT)", async () => {
  const e = await expectReject(proc.ffmpeg(["-f", "lavfi", "-i", "testsrc2=size=320x240:rate=30", "-f", "rawvideo", "-"], { maxStdoutBytes: 200000, timeoutMs: 20000, pidFile, label: "t-flood" }), "PROC_EXIT");
  assert.equal(e.extra.reason, "STDOUT_LIMIT");
});

section("proc — exits and output");

t("non-zero exit → PROC_EXIT with the stderr tail as detail (≤600 chars)", async () => {
  const missing = path.join(tmp.dir, "does-not-exist.mp4");
  const e = await expectReject(proc.ffmpeg(["-i", `file:${missing}`, "-f", "null", "-"], { timeoutMs: 20000, pidFile, label: "t-exit" }), "PROC_EXIT");
  assert.ok(e.detail && e.detail.length > 0 && e.detail.length <= 600, `detail: ${e.detail}`);
  assert.notEqual(e.extra.exitCode, 0);
});

t("missing binary → PROC_SPAWN (config)", async () => {
  const e = await expectReject(proc.runProcess("ve-no-such-binary-xyz", ["-version"], { pidFile, timeoutMs: 5000 }), "PROC_SPAWN");
  assert.equal(e.errorClass, "config");
});

t("successful ffmpeg reports parsed progress ending at 100", async () => {
  const pcts = [];
  const r = await proc.ffmpeg(["-f", "lavfi", "-i", "testsrc2=size=160x120:rate=30:duration=2", "-f", "null", "-"], {
    expectedDurationSec: 2, onProgress: (pct) => pcts.push(pct), timeoutMs: 30000, pidFile, label: "t-ok",
  });
  assert.equal(r.code, 0);
  assert.ok(r.durationMs >= 0);
  assert.ok(pcts.length >= 1, "at least one progress callback");
  assert.equal(pcts[pcts.length - 1], 100);
  for (let i = 1; i < pcts.length; i++) assert.ok(pcts[i] >= pcts[i - 1] || pcts[i] === null || pcts[i - 1] === null);
});

t("a progress run does not accumulate or cap stdout: -progress output far above maxStdoutBytes never kills it", async () => {
  const pcts = [];
  // Before the fix every -progress chunk counted against maxStdoutBytes, so a long encode died with STDOUT_LIMIT.
  const r = await proc.ffmpeg(["-f", "lavfi", "-i", "testsrc2=size=160x120:rate=30:duration=2", "-f", "null", "-"], {
    expectedDurationSec: 2, onProgress: (pct) => pcts.push(pct), maxStdoutBytes: 64, timeoutMs: 30000, pidFile, label: "t-progress-cap",
  });
  assert.equal(r.code, 0);
  assert.equal(r.stdout, "", "progress output is streamed to the parser, not kept");
  assert.equal(pcts[pcts.length - 1], 100);
  // An explicit captureStdout keeps the cap for callers that do want stdout.
  const e = await expectReject(proc.ffmpeg(["-f", "lavfi", "-i", "testsrc2=size=160x120:rate=30:duration=2", "-f", "null", "-"], {
    expectedDurationSec: 2, onProgress: () => {}, captureStdout: true, maxStdoutBytes: 64, timeoutMs: 30000, pidFile, label: "t-progress-capture",
  }), "PROC_EXIT");
  assert.equal(e.extra.reason, "STDOUT_LIMIT");
});

t("onStdoutLine receives complete lines", async () => {
  const lines = [];
  await proc.runProcess("ffmpeg", ["-hide_banner", "-version"], { onStdoutLine: (l) => lines.push(l), pidFile, timeoutMs: 10000 });
  assert.ok(/^ffmpeg version/.test(lines[0]), lines[0]);
});

t("ffprobeJson parses a lavfi fixture", async () => {
  const file = makeFixture(path.join(tmp.dir, "fixture.mp4"), { seconds: 1 });
  const j = await proc.ffprobeJson(["-show_streams", "-show_format", "-of", "json", `file:${file}`], { timeoutMs: 20000, pidFile });
  assert.equal(j.streams.filter((s) => s.codec_type === "video").length, 1);
  assert.equal(j.streams.filter((s) => s.codec_type === "audio").length, 1);
});

t("toolVersions finds ffmpeg and ffprobe and caches the answer", async () => {
  const v = await proc.toolVersions();
  assert.ok(v.ffmpeg && v.ffprobe, JSON.stringify(v));
  assert.strictEqual(proc.toolVersions(), proc.toolVersions());
});

t("fault option injects before spawning", async () => {
  const settings = { faults: { allow: true, global: "normalize:exit1" } };
  await expectReject(proc.ffmpeg(ENDLESS, { fault: { point: "normalize", settings }, pidFile, label: "t-fault" }), "PROC_EXIT");
  assert.ok(!proc.readPidRegistry(pidFile).some((x) => x.label === "t-fault"));
});

t("registry is empty after every child settled", async () => {
  assert.ok(fs.existsSync(pidFile));
  assert.deepEqual(proc.readPidRegistry(pidFile), []);
});

run().finally(() => { restoreFetch(); tmp.cleanup(); });
