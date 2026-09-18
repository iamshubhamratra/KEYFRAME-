// Tests for AI Video Edit QA media checks (src/video_edit/qa/checks.js media half + qa/index.runQa end to end):
// tiny lavfi-generated mp4s in a temp dir — one clean, one with injected black frames, one frozen, one silent, one at
// the wrong size — through the real ffprobe / single-pass black+freeze+silence scan / ebur128 fallback / A/V offset
// fallback / BT.709 frame extraction, with the vision caller injected (zero network).
// Run: node scripts/video_edit_qa_media.test.cjs

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { createHarness, mkTmp, installFetchTripwire } = require("./lib/video_edit_test_utils.cjs");
const { resetBreakers } = require("../src/video_edit/providers/breaker");
const { imageDimsFromBuffer } = require("../src/services/asset_sources/util");
const Q = require("../src/video_edit/qa/checks");
const QA = require("../src/video_edit/qa");

const { t, section, run } = createHarness();
const restoreFetch = installFetchTripwire();
const tmp = mkTmp("ve-qa-media-");
const W = 360, H = 640, SEC = 4;

function ff(args) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostdin", "-loglevel", "error", "-y", ...args], { windowsHide: true, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`fixture ffmpeg failed: ${String(r.stderr).slice(-300)}`);
}
const OUT_ARGS = ["-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-r", "30", "-c:a", "aac", "-ar", "44100", "-ac", "2", "-shortest", "-movflags", "+faststart"];
function make(name, { size = `${W}x${H}`, seconds = SEC, vf = null, audio = "sine", video = null } = {}) {
  const file = path.join(tmp.dir, `${name}.mp4`);
  const a = audio === "silent" ? `anullsrc=r=44100:cl=stereo:d=${seconds}` : `sine=frequency=330:sample_rate=44100:duration=${seconds}`;
  ff(["-f", "lavfi", "-i", video || `testsrc2=size=${size}:rate=30:duration=${seconds}`, "-f", "lavfi", "-i", a,
    ...(vf ? ["-vf", vf] : []), ...OUT_ARGS, file]);
  return file;
}

const FILES = {};
FILES.clean = make("clean");
FILES.black = make("black", { vf: "drawbox=x=0:y=0:w=iw:h=ih:color=black:t=fill:enable='between(t,1,2.5)'" });
FILES.frozen = make("frozen", { seconds: 5, video: `testsrc2=size=${W}x${H}:rate=30:duration=2`, vf: "tpad=stop_mode=clone:stop_duration=3" });
FILES.silent = make("silent", { audio: "silent" });
FILES.small = make("small", { size: "320x240" });

function planFor(seconds) {
  return {
    revision: 2, projectId: "ve_test", createdBy: "director",
    source: { width: W, height: H, durationSec: seconds, timing: "word", language: "en" },
    output: { aspect: "9:16", width: W, height: H, fps: 30 },
    settings: { captionsEnabled: false, sfxEnabled: true, autoJumpCuts: false, silencePace: "natural" },
    timeline: { pieces: [{ id: "pc_0", srcIn: 0, srcOut: seconds, outIn: 0, outOut: seconds, kind: "play", rate: 1, chunkKey: "k" }], outDurationSec: seconds },
    aRoll: { segments: [] }, cuts: [], captions: { enabled: false, cues: [] }, broll: [], effects: [], transitions: [], graphics: [], sfx: [],
    branding: { logo: null },
  };
}
const words = (seconds) => Array.from({ length: Math.floor((seconds - 0.6) / 0.5) }, (_, i) => ({ i, text: `w${i}`, start: 0.3 + i * 0.5, end: 0.3 + i * 0.5 + 0.4, conf: 0.9 }));
const pcFor = (seconds) => Q.buildContext({ plan: planFor(seconds), words: words(seconds), faces: null });
const cats = (list) => list.map((f) => `${f.category}:${f.class}:${f.severity}`);

section("qa/checks — probe + container");

t("probeMedia reads the clean fixture; checkContainer passes it and flags the wrong size as an I blocker", async () => {
  const p = await Q.probeMedia(FILES.clean);
  assert.ok(p.ok && p.video && p.audio);
  assert.ok(Math.abs(p.durationSec - SEC) < 0.05);
  assert.deepStrictEqual(Q.checkContainer(p, { width: W, height: H }), []);
  const s = await Q.probeMedia(FILES.small);
  const f = Q.checkContainer(s, { width: W, height: H });
  assert.deepStrictEqual(cats(f), ["OTHER:I:blocker"]);
  assert.ok(/320x240/.test(f[0].detail));
  const missing = await Q.probeMedia(path.join(tmp.dir, "nope.mp4"));
  assert.strictEqual(missing.ok, false);
});

section("qa/checks — single-pass black / freeze / silence scan");

t("clean fixture: no black, freeze or silence", async () => {
  const scan = await Q.scanMedia(FILES.clean, { hasAudio: true, durationSec: SEC });
  assert.deepStrictEqual([scan.black, scan.freeze, scan.silence, scan.decodeErrors], [[], [], [], 0]);
  assert.deepStrictEqual(Q.checkScans(scan, pcFor(SEC)), []);
});

t("injected black frames (1.0–2.5 s) are a BLACK_OR_BLANK_FRAME I blocker", async () => {
  const scan = await Q.scanMedia(FILES.black, { hasAudio: true, durationSec: SEC });
  assert.strictEqual(scan.black.length, 1);
  assert.ok(Math.abs(scan.black[0].start - 1) < 0.1 && Math.abs(scan.black[0].end - 2.5) < 0.1);
  assert.deepStrictEqual(cats(Q.checkScans(scan, pcFor(SEC))), ["BLACK_OR_BLANK_FRAME:I:blocker"]);
});

t("a 3 s frozen tail is a FREEZE I blocker (and nothing when a hold piece plans it)", async () => {
  const scan = await Q.scanMedia(FILES.frozen, { hasAudio: true, durationSec: 5 });
  assert.strictEqual(scan.freeze.length, 1);
  assert.ok(scan.freeze[0].end - scan.freeze[0].start > 2);
  assert.deepStrictEqual(cats(Q.checkScans(scan, pcFor(5))), ["FREEZE:I:blocker"]);
  const held = planFor(5);
  held.timeline.pieces = [{ id: "pc_0", srcIn: 0, srcOut: 2, outIn: 0, outOut: 2, kind: "play", rate: 1 }, { id: "pc_h", srcIn: 2, srcOut: 2, outIn: 2, outOut: 5, kind: "hold", rate: 1 }];
  assert.deepStrictEqual(Q.checkScans(scan, Q.buildContext({ plan: held, words: [] })), []);
});

t("silent audio: ebur128 fallback (no audio report) → LOUDNESS I blocker, plus unplanned SILENCE over speech", async () => {
  const r = await Q.runMediaChecks({ file: FILES.silent, audioReport: null, pc: pcFor(SEC) });
  assert.deepStrictEqual(cats(r.findings).sort(), ["LOUDNESS:I:blocker", "SILENCE:Q:major"]);
  assert.strictEqual(r.signals.loudness.source, "measured");
  assert.ok(r.signals.loudness.integratedLufs <= -40);
  assert.ok(r.unverified.includes("avOffset"));
});

t("the A/V offset falls back to computeAvOffset against the voice stem when the report lacks it", async () => {
  const voice = path.join(tmp.dir, "voice.wav");
  ff(["-i", FILES.clean, "-map", "0:a:0", "-ac", "1", "-ar", "48000", "-c:a", "pcm_s16le", voice]);
  const report = { integratedLufs: -14, truePeakDbtp: -1.5, lraLu: 2, postPass: { applied: false } };
  const r = await Q.runMediaChecks({ file: FILES.clean, audioReport: report, voicePath: voice, pc: pcFor(SEC) });
  assert.deepStrictEqual(r.findings, []);
  assert.ok(Number.isFinite(r.signals.avOffsetMs) && Math.abs(r.signals.avOffsetMs) < 33);
  assert.strictEqual(r.signals.loudness.source, "report");
});

t("an aborted signal cancels the scan", async () => {
  const ac = new AbortController();
  ac.abort();
  await assert.rejects(Q.scanMedia(FILES.clean, { signal: ac.signal, durationSec: SEC }), (e) => e.errorClass === "cancelled");
});

section("qa/index — runQa end to end");

function project(name, mp4, { report = true } = {}) {
  const dir = path.join(tmp.dir, name);
  fs.mkdirSync(path.join(dir, "render", "out"), { recursive: true });
  fs.mkdirSync(path.join(dir, "render", "layout"), { recursive: true });
  fs.copyFileSync(mp4, path.join(dir, "render", "out", "r1.mp4"));
  if (report) fs.writeFileSync(path.join(dir, "render", "out", "r1.audio-report.json"), JSON.stringify({ integratedLufs: -14.1, truePeakDbtp: -1.4, lraLu: 3, postPass: { applied: true }, avOffset: { ms: 4.8, envelopeCorr: 0.95 } }));
  fs.writeFileSync(path.join(dir, "render", "layout", "r1.json"), JSON.stringify({
    elements: [{ id: "logo", kind: "logo", outIn: 0, outOut: SEC, box: { x: 300, y: 90, w: 40, h: 40 } }],
    crops: [{ pieceId: "pc_0", outIn: 0, outOut: SEC, x: 0, y: 0, w: W, h: H }], output: { w: W, h: H }, durationFrames: SEC * 30,
  }));
  return dir;
}

t("clean render: verdict clean, score 100, one vision call on real BT.709 JPEG frames", async () => {
  resetBreakers();
  const dir = project("p_clean", FILES.clean);
  const seen = [];
  const callVision = async (o) => { seen.push(o); return { value: { pass: true, score: 9, issues: [] }, model: "m", costUsd: 0.001 }; };
  const rep = await QA.runQa({ projectDir: dir, renderId: "r1", plan: planFor(SEC), words: words(SEC), faces: null, lap: 0,
    project: { settings: { privacy: { allowCloudVision: true } } }, callVision, checkBudget: async () => ({ remaining: 5 }) });
  assert.deepStrictEqual(cats(rep.issues), []);
  assert.strictEqual(rep.verdict, "clean");
  assert.strictEqual(rep.score, 100);
  assert.strictEqual(rep.vision.status, "ok");
  assert.strictEqual(rep.visionUnverified, false);
  assert.strictEqual(rep.unverified, false);
  assert.strictEqual(rep.signals.durationDriftFrames, 0);
  assert.strictEqual(rep.signals.loudness.integratedLufs, -14.1);
  assert.strictEqual(seen.length, 1);
  const jpgs = fs.readdirSync(path.join(dir, "render", "qa", "r1", "lap0")).filter((n) => n.endsWith(".jpg"));
  assert.ok(jpgs.length >= 1 && jpgs.length <= 8);
  const dims = imageDimsFromBuffer(fs.readFileSync(path.join(dir, "render", "qa", "r1", "lap0", jpgs[0])));
  assert.deepStrictEqual([dims.width, dims.height], [288, 512]);
  const final = QA.finalReport([rep]);
  assert.strictEqual(final.verdict, "clean");
  assert.strictEqual(final.shippedLap, 0);
});

t("black render: blocked by an integrity blocker; repairs ask for a chunk re-encode of the black range", async () => {
  resetBreakers();
  const dir = project("p_black", FILES.black);
  const rep = await QA.runQa({ projectDir: dir, renderId: "r1", plan: planFor(SEC), words: words(SEC), faces: null, skipVision: true });
  assert.strictEqual(rep.verdict, "blocked");
  assert.ok(cats(rep.issues).includes("BLACK_OR_BLANK_FRAME:I:blocker"));
  assert.strictEqual(rep.visionUnverified, true);
  const plan = QA.planRepairs(rep, planFor(SEC), {});
  assert.strictEqual(plan.renderActions[0].level, "chunks");
  assert.ok(plan.renderActions[0].ranges[0][0] <= 1.1 && plan.renderActions[0].ranges[0][1] >= 2.4);
});

t("wrong-size render with no audio report: container I blocker and vision skipped without consent", async () => {
  resetBreakers();
  const dir = project("p_small", FILES.small, { report: false });
  let calls = 0;
  const rep = await QA.runQa({ projectDir: dir, renderId: "r1", plan: planFor(SEC), words: words(SEC), faces: null,
    project: { settings: { privacy: { allowCloudVision: false } } }, callVision: async () => { calls++; return null; } });
  assert.strictEqual(rep.verdict, "blocked");
  assert.ok(cats(rep.issues).includes("OTHER:I:blocker"));
  assert.strictEqual(rep.vision.reason, "privacy");
  assert.strictEqual(calls, 0);
  assert.strictEqual(rep.signals.loudness.source, "measured");
});

t("a missing export is an integrity blocker, not a crash", async () => {
  const dir = path.join(tmp.dir, "p_none");
  fs.mkdirSync(dir, { recursive: true });
  const rep = await QA.runQa({ projectDir: dir, renderId: "r1", plan: planFor(SEC), words: [], faces: null, skipVision: true });
  assert.strictEqual(rep.verdict, "blocked");
  assert.ok(rep.unverifiedChecks.includes("media"));
});

(async () => {
  await run();
  restoreFetch();
  tmp.cleanup();
})();
