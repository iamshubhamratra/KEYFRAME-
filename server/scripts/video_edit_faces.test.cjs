// Tests for AI Video Edit face analysis: analysis/track_smooth.js, analysis/frame_sampler.js, analysis/faces.js (ve_faces).
// Run: node scripts/video_edit_faces.test.cjs
//
// Load-bearing: the face track that framing and crop math interpolate is built only from VALID boxes (nested
// `box_2d:[[…]]` flattened, tiny / huge / wrong-aspect boxes rejected), one primary face per frame with IoU
// continuity, Hampel-filtered, bridged across gaps ≤ 6 s, never interpolated across a scene cut, with absent and
// multi-face ranges; the sampler spends ≤ 24 frames on shot starts, a uniform floor and motion, and extracts
// them in one ffmpeg run at ≤ 640 px; ve_faces labels frames with letters, escalates a batch whose boxes mostly
// fail (or whose ids are hallucinated) to the escalation model, tolerates missing frames, and degrades every
// failure — privacy off, outage, 402, cost cap, low budget — to faceTrack 'assumed' without throwing.
// Offline: scripts/lib/mock_ai_providers.cjs behind a fetch tripwire; ffmpeg on a lavfi clip; temp dirs only.

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { createHarness, mkTmp, makeSettings, makeFixture } = require("./lib/video_edit_test_utils.cjs");

const tmp = mkTmp("ve-faces-");
process.env.VIDEO_EDIT_DIR = path.join(tmp.dir, "_guard", "edits");
process.env.VIDEO_EDIT_INDEX = path.join(tmp.dir, "_guard", "video-edits.json");

const { startMockProviders } = require("./lib/mock_ai_providers.cjs");
const FX = require("./video_edit_fixtures.js");
const track = require("../src/video_edit/analysis/track_smooth");
const sampler = require("../src/video_edit/analysis/frame_sampler");
const faces = require("../src/video_edit/analysis/faces");
const timeline = require("../src/video_edit/plan/timeline");
const stt = require("../src/video_edit/ai/openrouter_stt");
const { getBreaker, resetBreakers } = require("../src/video_edit/providers/breaker");

const { t, section, run } = createHarness();
const AUTH = { apiKey: "test-key-not-a-secret" };
const LITE = "google/gemini-3.5-flash-lite";
const FLASH = "google/gemini-3.5-flash";
const W = 640, H = 360, D = 20;

let mock, guard, clip, projSeq = 0;
let visionReply = null;   // (model, frames:[{id,t}]) -> reply object

function framesOf(body) {
  const user = (body.messages || []).find((m) => m && m.role === "user");
  const parts = user && Array.isArray(user.content) ? user.content : [];
  const frames = [];
  for (const p of parts) {
    const m = p && p.type === "text" ? /^FRAME ([A-Z]+) t=([\d.]+)s$/.exec(p.text || "") : null;
    if (m) frames.push({ id: m[1], t: Number(m[2]) });
  }
  return { frames, images: parts.filter((p) => p && p.type === "image_url"), parts };
}

function fresh() {
  mock.reset();
  resetBreakers();
  stt.resetBudgetCache();
  visionReply = (model, frames) => ({ frames: frames.map((f) => okFrame(f)), overall: { setting: "test studio", visualQuality: "good" } });
  mock.enqueue("chat", (ctx) => {
    const sys = ((ctx.body.messages || [])[0] || {}).content || "";
    if (!/camera assistant/.test(sys)) return undefined;
    const { frames } = framesOf(ctx.body);
    return { json: visionReply(ctx.body.model, frames) };
  });
}

// A speaker head drifting right slowly: pixel aspect 0.8 on a 640x360 frame.
function headBox(t, { nested = false, x = 380 } = {}) {
  const x0 = Math.round(x + t * 5);
  const box = [300, x0, 700, x0 + 240];
  return nested ? [box] : box;
}
function okFrame(f, extra = {}) {
  return { id: f.id, faces: [{ box_2d: headBox(f.t), role: "speaker", facing: "camera" }], shotType: "medium", speakerVisible: true, background: "test pattern", screenContent: null, textOnScreen: false, lighting: "good", ...extra };
}

function settingsFor(videoEdit = {}) {
  return makeSettings(path.join(tmp.dir, "root"), { env: { VIDEO_EDIT_OPENROUTER_BASE: mock.openrouterBase, VIDEO_EDIT_KIE_BASE: mock.kieBase }, videoEdit });
}

function newProjectDir() {
  const dir = path.join(tmp.dir, `p${++projSeq}`);
  fs.mkdirSync(path.join(dir, "work"), { recursive: true });
  fs.mkdirSync(path.join(dir, "analysis"), { recursive: true });
  fs.copyFileSync(clip, path.join(dir, "work", "proxy540.mp4"));
  return dir;
}

const VIDEO = Object.freeze({
  durationSec: D, width: W, height: H, fps: 30,
  scenes: [{ start: 0, end: 8, score: 0 }, { start: 8, end: D, score: 30 }], sceneChanges: [{ t: 8, score: 30 }],
  ydif: Array.from({ length: 100 }, (_, k) => ({ t: k * 0.2, v: k === 70 ? 40 : (k === 30 ? 35 : 2) })),
});

function analyze(extra = {}) {
  const projectDir = extra.projectDir || newProjectDir();
  return faces.analyzeFaces({
    projectDir, settings: extra.settings || settingsFor(), project: extra.project || null, video: VIDEO, durationSec: D, width: W, height: H, fps: 30,
    runId: "run_test", pidFile: null, auth: AUTH, cacheDir: path.join(projectDir, "analysis", "llm-cache"), ...extra,
  }).then((r) => ({ ...r, projectDir }));
}

const chatCalls = (model) => mock.calls.filter((c) => c.route === "chat" && (!model || c.model === model));

// ------------------------------------------------------------------------------------------------
section("track_smooth: boxes");

t("flattenBox accepts flat, nested, pair-nested, string and wrapped boxes; rejects the rest", () => {
  assert.deepEqual(track.flattenBox([1, 2, 3, 4]), [1, 2, 3, 4]);
  assert.deepEqual(track.flattenBox([[1, 2, 3, 4]]), [1, 2, 3, 4]);
  assert.deepEqual(track.flattenBox([[[1, 2, 3, 4]]]), [1, 2, 3, 4]);
  assert.deepEqual(track.flattenBox([[1, 2], [3, 4]]), [1, 2, 3, 4]);
  assert.deepEqual(track.flattenBox(["10", "20", "30", "40"]), [10, 20, 30, 40]);
  assert.deepEqual(track.flattenBox({ box_2d: [[5, 6, 7, 8]] }), [5, 6, 7, 8]);
  for (const bad of [null, [1, 2, 3], [1, 2, 3, "x"], [NaN, 1, 2, 3], "1,2,3,4", [[1, 2, 3, 4], [5, 6, 7, 8]]]) assert.equal(track.flattenBox(bad), null);
});

t("validateBox clamps to the frame, fixes swapped corners, enforces head height 3–70 % and pixel aspect 0.55–1.5", () => {
  const v = track.validateBox([-50, 400, 600, 1200], { frameW: 1920, frameH: 1080 });
  assert.ok(!v.ok && v.reason === "aspect", "clamped to x1=1000 → 0.6·1920 wide vs 0.6·1080 tall is too wide");
  const ok = track.validateBox([700, 620, 300, 380], { frameW: W, frameH: H });
  assert.ok(ok.ok, ok.reason);
  assert.deepEqual([ok.box.y0, ok.box.x0, ok.box.y1, ok.box.x1], [0.3, 0.38, 0.7, 0.62]);
  assert.ok(Math.abs(ok.cx - 0.5) < 1e-9 && Math.abs(ok.cy - 0.5) < 1e-9 && Math.abs(ok.h - 0.4) < 1e-9);
  assert.equal(track.validateBox([500, 500, 520, 520], { frameW: W, frameH: H }).reason, "too_small");
  assert.equal(track.validateBox([0, 100, 900, 700], { frameW: W, frameH: H }).reason, "too_large");
  assert.equal(track.validateBox([300, 400, 700, 430], { frameW: W, frameH: H }).reason, "aspect");
  assert.equal(track.validateBox([300, 400, 300, 600], { frameW: W, frameH: H }).reason, "empty");
});

t("hampel replaces a single spike by the window median and leaves steady noise alone", () => {
  const vals = [0.5, 0.502, 0.499, 0.9, 0.501, 0.5, 0.498];
  const h = track.hampel(vals);
  assert.deepEqual(h.outliers, [3]);
  assert.ok(Math.abs(h.values[3] - 0.5) < 0.005);
  assert.deepEqual(track.hampel([0.5, 0.5001, 0.4999, 0.5, 0.5002]).outliers, []);
});

section("track_smooth: track");

const frameAt = (t, boxes) => ({ t, faces: boxes.map((b) => ({ box_2d: b, role: "speaker", facing: "camera" })) });

t("a one-frame jump of the speaker box is filtered; keyframes stay on the steady track", () => {
  const frames = [0, 2, 4, 6, 8, 10, 12].map((ts) => frameAt(ts, [ts === 6 ? [300, 700, 700, 940] : [300, 380, 700, 620]]));
  const tr = track.smoothTrack({ frames, durationSec: 14, frameW: W, frameH: H });
  assert.equal(tr.mode, "tracked");
  assert.ok(tr.stats.outliers >= 1);
  const k6 = tr.keyframes.find((k) => k.t === 6);
  assert.ok(Math.abs(k6.cx - 0.5) < 0.01, `spike kept: ${k6.cx}`);
  assert.ok(tr.keyframes.every((k) => Math.abs(k.cx - 0.5) < 0.01));
  assert.deepEqual(tr.absent, []);
});

t("primary face keeps IoU continuity when a larger 'speaker' box appears elsewhere", () => {
  const A = [300, 100, 640, 340];
  const B = [150, 600, 800, 1000];   // bigger (65 % of the frame height), far right
  const frames = [0, 1, 2, 3, 4].map((ts) => frameAt(ts, ts >= 2 ? [A, B] : [A]));
  const tr = track.smoothTrack({ frames, durationSec: 5, frameW: W, frameH: H });
  assert.ok(tr.primary.every((p) => p.cx < 0.3), JSON.stringify(tr.primary.map((p) => p.cx)));
  assert.equal(tr.multiFace.length, 1);
  assert.ok(tr.multiFace[0].start <= 2 && tr.multiFace[0].end >= 4);
});

t("gaps ≤ 6 s are bridged; longer gaps become absent ranges starting at the first missing frame", () => {
  const box = [300, 380, 700, 620];
  const frames = [
    frameAt(0, [box]), frameAt(2, [box]), frameAt(4, []), frameAt(7, [box]),            // 5 s gap bridged
    frameAt(9, []), frameAt(12, []), frameAt(15, []), frameAt(16, [box]), frameAt(18, [box]),  // 9 s gap
  ];
  const tr = track.smoothTrack({ frames, durationSec: 20, frameW: W, frameH: H });
  assert.deepEqual(tr.absent, [{ start: 9, end: 16 }]);
  assert.deepEqual(timeline.faceAt(tr, 12), timeline.faceAt({ mode: "assumed" }, 12), "absent → default framing");
  assert.ok(Math.abs(timeline.faceAt(tr, 5).cx - 0.5) < 0.01, "bridged gap interpolates");
});

t("scene change resets the track: a hold keyframe just before the cut, the new position at the cut", () => {
  const left = [300, 100, 700, 340];
  const right = [300, 600, 700, 840];
  const frames = [0.3, 3, 6, 8.3, 11, 14].map((ts) => frameAt(ts, [ts < 8 ? left : right]));
  const tr = track.smoothTrack({ frames, sceneChanges: [{ t: 8 }], durationSec: 16, frameW: W, frameH: H });
  const before = timeline.faceAt(tr, 7.99);
  const after = timeline.faceAt(tr, 8.0);
  assert.ok(before.cx < 0.35 && after.cx > 0.7, `before ${before.cx} after ${after.cx}`);
  assert.ok(tr.keyframes.some((k) => Math.abs(k.t - 7.999) < 1e-6));
  assert.ok(tr.keyframes.some((k) => k.t === 8));
  assert.ok(tr.keyframes.every((k, i) => i === 0 || k.t > tr.keyframes[i - 1].t), "strictly increasing keyframes");
});

t("a shot without detections is absent; no valid boxes at all → mode assumed", () => {
  const box = [300, 380, 700, 620];
  const tr = track.smoothTrack({ frames: [frameAt(1, [box]), frameAt(4, [box]), frameAt(12, []), frameAt(15, [])], sceneChanges: [10], durationSec: 18, frameW: W, frameH: H });
  assert.deepEqual(tr.absent, [{ start: 10, end: 18 }]);
  const none = track.smoothTrack({ frames: [frameAt(1, [[1, 1, 2, 2]]), frameAt(2, [])], durationSec: 3, frameW: W, frameH: H });
  assert.equal(none.mode, "assumed");
  assert.equal(none.stats.invalidBoxes, 1);
});

t("a lone non-speaker face counts; with several unlabelled faces nothing is guessed", () => {
  const one = track.smoothTrack({ frames: [{ t: 1, faces: [{ box_2d: [300, 380, 700, 620], role: "other" }] }], durationSec: 2, frameW: W, frameH: H });
  assert.equal(one.mode, "tracked");
  const two = track.smoothTrack({ frames: [{ t: 1, faces: [{ box_2d: [300, 100, 700, 340], role: "other" }, { box_2d: [300, 600, 700, 840], role: "other" }] }], durationSec: 2, frameW: W, frameH: H });
  assert.equal(two.mode, "assumed");
  assert.equal(two.multiFace.length, 1);
});

// ------------------------------------------------------------------------------------------------
section("frame_sampler");

t("frameBudget: clamp(ceil(D/2.5), 8, 24), capped by maxFaceFrames and the frame count", () => {
  assert.equal(sampler.frameBudget(5), 8);
  assert.equal(sampler.frameBudget(30), 12);
  assert.equal(sampler.frameBudget(120), 24);
  assert.equal(sampler.frameBudget(120, { maxFaceFrames: 10 }), 10);
  assert.equal(sampler.frameBudget(0.1, { fps: 30 }), 3);
  assert.equal(sampler.frameBudget(0), 0);
});

t("planFrames: shot starts + 0.3 s, uniform floor, motion peaks; unique sorted frame indices inside the video", () => {
  const plan = sampler.planFrames({ durationSec: D, fps: 30, video: VIDEO });
  assert.equal(plan.length, sampler.frameBudget(D));
  assert.deepEqual(plan.map((f) => f.id), plan.map((_, k) => String.fromCharCode(65 + k)));
  assert.ok(plan.some((f) => Math.abs(f.t - 0.3) < 0.04) && plan.some((f) => Math.abs(f.t - 8.3) < 0.04), "scene starts");
  assert.ok(plan.some((f) => f.reason === "motion" && Math.abs(f.t - 14) < 0.05), "highest YDIF sample");
  assert.ok(plan.every((f, i) => f.frame >= 0 && f.frame < D * 30 && (i === 0 || f.frame > plan[i - 1].frame)));
  assert.ok(plan.every((f) => Math.abs(f.t - f.frame / 30) < 1e-3));
  const noData = sampler.planFrames({ durationSec: 6, fps: 25, video: null });
  assert.equal(noData.length, 8);
});

t("imageSize keeps the long edge ≤ 640 px (portrait) and 384 px wide landscape", () => {
  assert.deepEqual(sampler.imageSize(1920, 1080), { width: 384, height: 216 });
  assert.deepEqual(sampler.imageSize(1080, 1920), { width: 360, height: 640 });
  assert.deepEqual(sampler.imageSize(720, 720), { width: 384, height: 384 });
});

t("extractFrames: one ffmpeg run → work/frames/f<idx>.jpg JPEGs, temp dir removed", async () => {
  const dir = newProjectDir();
  const plan = sampler.planFrames({ durationSec: D, fps: 30, video: VIDEO });
  const out = await sampler.extractFrames({ projectDir: dir, frames: plan, fps: 30, width: W, height: H, runId: "run_x", pidFile: null });
  assert.equal(out.length, plan.length);
  for (const f of out) {
    const buf = fs.readFileSync(path.join(dir, f.file));
    assert.equal(buf.readUInt16BE(0), 0xffd8, "JPEG magic");
    assert.ok(buf.length < 120 * 1024);
    assert.equal(f.width, 384);
  }
  assert.deepEqual(fs.readdirSync(path.join(dir, "work", "frames")).filter((n) => n.startsWith("tmp")), []);
});

// ------------------------------------------------------------------------------------------------
section("ve_faces (mock OpenRouter)");

t("happy path: letter-labelled batches of ≤ 6 images, nested boxes flattened, track + semantics + cost written", async () => {
  fresh();
  visionReply = (model, frames) => ({ frames: frames.map((f, k) => ({ ...okFrame(f), faces: [{ box_2d: headBox(f.t, { nested: k % 2 === 0 }), role: "speaker", facing: "camera" }], textOnScreen: f.t > 15 })), overall: { setting: "studio", visualQuality: "good" } });
  const r = await analyze();
  const calls = chatCalls();
  const n = sampler.frameBudget(D);
  assert.equal(calls.length, Math.ceil(n / 6));
  assert.ok(calls.every((c) => c.model === LITE && c.status === 200));
  assert.equal(r.faces.mode, "tracked");
  assert.equal(r.faces.stats.invalidBoxes, 0, "nested boxes are valid after flattening");
  assert.equal(r.faces.stats.detections, n);
  assert.ok(r.faces.keyframes.length >= n);
  assert.ok(r.faces.keyframes.every((k) => k.cx > 0.45 && k.cx < 0.75 && Math.abs(k.cy - 0.5) < 1e-6 && Math.abs(k.h - 0.4) < 1e-6));
  assert.equal(r.faces.frames.length, n);
  assert.ok(r.faces.frames.every((f) => f.shotType === "medium" && f.speakerVisible === true && f.background === "test pattern"));
  assert.deepEqual(r.faces.overall, { setting: "studio", visualQuality: "good" });
  assert.equal(r.discoveries.faceFound, true);
  assert.ok(r.discoveries.onScreenText.length === 1 && r.discoveries.onScreenText[0][1] === D);
  assert.ok(Math.abs(r.costUsd - calls.length * 0.00022) < 1e-7);
  const onDisk = JSON.parse(fs.readFileSync(path.join(r.projectDir, faces.FACES_REL), "utf8"));
  assert.deepEqual(onDisk.keyframes, r.faces.keyframes);
  assert.equal(r.notices.length, 0);
});

t("the request carries FRAME <letter> t=… labels, JPEG data URIs and nothing else", async () => {
  fresh();
  let seen = null;
  visionReply = (model, frames) => ({ frames: frames.map((f) => okFrame(f)) });
  mock.reset();
  mock.enqueue("chat", (ctx) => {
    seen = seen || framesOf(ctx.body);
    return { json: visionReply(ctx.body.model, framesOf(ctx.body).frames) };
  });
  await analyze();
  assert.ok(seen.frames.length === 6 && seen.images.length === 6);
  assert.ok(seen.images.every((p) => /^data:image\/jpeg;base64,/.test(p.image_url.url)));
  assert.ok(seen.parts.every((p) => p.type === "text" || p.type === "image_url"));
  assert.equal(seen.frames[0].id, "A");
});

t("a re-run over the same frames is served from the llm cache: zero new calls", async () => {
  fresh();
  const dir = newProjectDir();
  await analyze({ projectDir: dir });
  const before = chatCalls().length;
  const r2 = await analyze({ projectDir: dir });
  assert.equal(chatCalls().length, before);
  assert.equal(r2.faces.mode, "tracked");
  assert.equal(r2.costUsd, 0);
});

t("> 1/3 invalid boxes in a batch → that batch is re-asked of the escalation model", async () => {
  fresh();
  visionReply = (model, frames) => ({
    frames: frames.map((f) => (model === LITE ? { ...okFrame(f), faces: [{ box_2d: [500, 500, 505, 504], role: "speaker" }] } : okFrame(f))),
  });
  const r = await analyze();
  const batches = Math.ceil(sampler.frameBudget(D) / 6);
  assert.equal(chatCalls(LITE).length, batches);
  assert.equal(chatCalls(FLASH).length, batches);
  assert.equal(r.escalations, batches);
  assert.equal(r.faces.mode, "tracked");
  assert.equal(r.faces.stats.invalidBoxes, 0, "the escalated boxes replaced the invalid ones");
  assert.deepEqual(r.faces.models, [FLASH]);
});

t("missing frames are tolerated (no data ≠ no face); the track bridges them", async () => {
  fresh();
  visionReply = (model, frames) => ({ frames: frames.filter((f) => f.id !== "C").map((f) => okFrame(f)) });
  const r = await analyze();
  assert.equal(chatCalls(FLASH).length, 0, "a missing frame alone does not escalate");
  assert.equal(r.faces.stats.missingFrames, 1);
  assert.equal(r.faces.frames.find((f) => f.id === "C").missing, true);
  assert.equal(r.faces.mode, "tracked");
  assert.deepEqual(r.faces.absent, []);
});

t("vision:hallucinated_ids → schema rejects renamed ids, repair fails, escalation answers", async () => {
  fresh();
  const project = { settings: { debugFaults: "vision:hallucinated_ids" }, cost: { spentUsd: 0 } };
  const r = await analyze({ project });
  const batches = Math.ceil(sampler.frameBudget(D) / 6);
  assert.equal(chatCalls(LITE).length, batches * 2, "one repair re-ask per batch");
  assert.ok(mock.calls.filter((c) => c.route === "chat" && c.model === LITE).some((c) => c.status === 200));
  assert.equal(chatCalls(FLASH).length, batches);
  assert.equal(r.faces.mode, "tracked");
});

t("privacy.allowCloudVision:false → assumed with zero requests and no frames extracted", async () => {
  fresh();
  const r = await analyze({ project: { settings: { privacy: { allowCloudVision: false } } } });
  assert.equal(r.faces.mode, "assumed");
  assert.equal(r.faces.reason, "privacy");
  assert.equal(mock.calls.length, 0);
  assert.ok(!fs.existsSync(path.join(r.projectDir, "work", "frames")));
  assert.deepEqual(r.notices.map((n) => [n.code, n.severity]), [["FACE_TRACK_ASSUMED", "info"]]);
  assert.equal(r.discoveries.faceFound, false);
});

t("vision outage (both models 503) → assumed, no throw; the shared chat provider breaker stays closed", async () => {
  fresh();
  mock.setChatModel(LITE, { status: 503 });
  mock.setChatModel(FLASH, { status: 503 });
  mock.reset();   // drop the scripted vision responder so setChatModel statuses apply
  mock.setChatModel(LITE, { status: 503 });
  mock.setChatModel(FLASH, { status: 503 });
  const r = await analyze();
  assert.equal(r.faces.mode, "assumed");
  assert.equal(r.faces.reason, "vision_unavailable");
  assert.ok(r.notices.some((n) => n.code === "FACE_TRACK_ASSUMED" && n.severity === "warn"));
  assert.equal(getBreaker("openrouter_chat").state().state, "closed", "island chat / content keep working");
  assert.ok(getBreaker(`openrouter_chat:${LITE}`).state().failures >= 2, "the outage is recorded on the model's own breaker");
  assert.ok(fs.existsSync(path.join(r.projectDir, faces.FACES_REL)));
});

t("402 → budget: the provider breaker opens until midnight; the next project skips vision with zero requests", async () => {
  fresh();
  mock.reset();
  mock.setChatModel(LITE, { status: 402 });
  const r = await analyze();
  assert.equal(r.faces.reason, "budget");
  assert.equal(chatCalls(FLASH).length, 0, "no escalation after a budget failure");
  assert.ok(chatCalls(LITE).length <= 2, "at most the two batches already in flight");
  assert.equal(getBreaker("openrouter_chat").state().state, "open");
  const before = mock.calls.length;
  const r2 = await analyze();
  assert.equal(r2.faces.reason, "breaker");
  assert.equal(mock.calls.length, before);
});

t("cost cap reached or budget below minBudgetRemaining → assumed before any paid call", async () => {
  fresh();
  const capped = await analyze({ project: { settings: {}, cost: { spentUsd: 0.5, capUsd: 0.5 } } });
  assert.equal(capped.faces.reason, "cost_cap");
  assert.equal(chatCalls().length, 0);
  fresh();
  mock.setBudget({ limitRemaining: 0.05, totalCredits: 10, totalUsage: 9.99 });
  const low = await analyze();
  assert.equal(low.faces.reason, "budget");
  assert.equal(chatCalls().length, 0);
});

section("isolation");

t("no request left for a non-mock host; every provider call carried auth", () => {
  assert.deepEqual(guard.blocked, []);
  assert.equal(mock.state.unauthorized, 0);
});

// ------------------------------------------------------------------------------------------------
(async () => {
  mock = await startMockProviders({});
  guard = FX.installMockOnlyFetch(new URL(mock.baseUrl).origin);
  clip = makeFixture(path.join(tmp.dir, "clip.mp4"), { seconds: D, size: `${W}x${H}` });
  try {
    await run();
  } finally {
    guard.restore();
    await mock.close();
    tmp.cleanup();
  }
})();
