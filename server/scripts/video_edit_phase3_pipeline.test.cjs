// In-process pipeline test for AI Video Edit Phase 3: VALIDATING → … → ANALYZING_CONTENT through the REAL runner.
// Run: node scripts/video_edit_phase3_pipeline.test.cjs
//
// Load-bearing: the real store / queue / runner drive the real phase-2 media handlers and the phase-3 handlers
// (analysis/audio, stt chain, transcript structuring, technical + frame sampler + ve_faces, ve_content) over a clip
// whose audio is the real 38 s speech probe, against scripts/lib/mock_ai_providers.cjs:
//   - a clean run reaches READY (PIPELINE_PARTIAL: later phases unregistered) with mai word timings, fillers,
//     a tracked face, grounded AI content, discoveries and a per-stage cost ledger — and zero KIE requests;
//   - resuming a finished project re-runs nothing: every stage is served from its checkpoint with ZERO provider calls;
//   - every STT engine failing parks the project in NEEDS_ATTENTION STT_FAILED (retry · continue without
//     transcript), and continuing without a transcript skips TRANSCRIBING and still reaches READY;
//   - vision down → faceTrack 'assumed' and content LLM down → deterministic analysis + AI_ANALYSIS_UNAVAILABLE,
//     both without failing the pipeline.
// Offline: loopback mock only (fetch tripwire), temp dirs, ffmpeg for the fixture and the media stages.

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { createHarness, mkTmp, makeSettings, silentLog } = require("./lib/video_edit_test_utils.cjs");

const tmp = mkTmp("ve-p3pipe-");
process.env.VIDEO_EDIT_DIR = path.join(tmp.dir, "_guard", "edits");
process.env.VIDEO_EDIT_INDEX = path.join(tmp.dir, "_guard", "video-edits.json");

const { startMockProviders } = require("./lib/mock_ai_providers.cjs");
const FX = require("./video_edit_fixtures.js");
const { createStore } = require("../src/video_edit/store");
const { createEventBus } = require("../src/video_edit/events");
const { createQueue } = require("../src/video_edit/engine/queue");
const { createRunner } = require("../src/video_edit/engine/runner");
const phase2 = require("../src/video_edit/engine/handlers/phase2");
const phase3 = require("../src/video_edit/engine/handlers/phase3");
const { probeStrict } = require("../src/video_edit/media/probe_strict");
const { resetBreakers } = require("../src/video_edit/providers/breaker");
const stt = require("../src/video_edit/ai/openrouter_stt");

const { t, section, run } = createHarness();
const AUTH = { apiKey: "test-key-not-a-secret" };
const P3 = ["EXTRACTING_AUDIO", "TRANSCRIBING", "ANALYZING_VIDEO", "ANALYZING_CONTENT"];

let mock, guard, probe, clip, clipSha, settings, store, runner, events;
const captured = [];
let seq = 0;
const ids = {};

function readJson(id, rel) { return JSON.parse(fs.readFileSync(store.abs(id, rel), "utf8")); }

function scriptChat() {
  mock.enqueue("chat", (ctx) => {
    const msgs = ctx.body.messages || [];
    const sys = (msgs[0] && msgs[0].content) || "";
    const user = msgs.find((m) => m && m.role === "user");
    if (/camera assistant/.test(sys)) {
      const frames = (user.content || []).filter((p) => p.type === "text" && /^FRAME /.test(p.text)).map((p) => /^FRAME ([A-Z]+)/.exec(p.text)[1]);
      return { json: { frames: frames.map((id) => ({ id, faces: [{ box_2d: [[280, 400, 700, 640]], role: "speaker", facing: "camera" }], shotType: "medium", speakerVisible: true, background: "test pattern", screenContent: null, textOnScreen: false, lighting: "good" })), overall: { setting: "studio", visualQuality: "ok" } } };
    }
    if (/story producer/.test(sys)) {
      const input = JSON.parse(String(user.content).split("INPUT:\n")[1]);
      const sids = input.sentences.map((s) => s.id);
      return {
        json: {
          summary: "A product launch plan: onboarding cut from twelve steps to four.", category: "product", audience: "product teams",
          tone: { mood: "confident", energy: 0.6, pace: "medium" },
          topics: [{ id: "t1", label: "Launch plan", sentenceIds: sids.slice(0, 2) }],
          keywords: [{ term: "onboarding", sentenceIds: sids.slice(1, 3), salience: 0.8 }],
          hook: { sentenceIds: [sids[0]], strength: 0.5 }, cta: null,
          segments: [{ id: "a", type: "HOOK", sentenceIds: [sids[0]], title: "Launch plan", importance: 0.8 }, { id: "b", type: "POINT", sentenceIds: sids.slice(1), title: "Results", importance: 0.7 }],
          visualSupport: sids.map((id, k) => ({ sentenceId: id, need: k % 2 ? 0.7 : 0.2, visualNouns: k % 2 ? ["customers using phone app"] : [], avoid: [] })),
          faceRequired: [{ sentenceId: sids[sids.length - 1], reason: "direct_address" }, { sentenceId: "s999", reason: "humor" }],
          emphasis: [], fillerVerdicts: [], retakeVerdicts: [], music: { mood: "warm acoustic", energy: 0.5 }, sfxOpportunities: [],
        },
      };
    }
    return undefined;   // island chat → the emulator
  });
}

async function newProject(projectSettings = {}) {
  seq++;
  const p = store.createProject({ ownerId: "owner-1", settings: projectSettings, consent: { thirdPartyAi: true, termsVersion: "2026-09" } });
  fs.mkdirSync(settings.paths.stagingDir, { recursive: true });
  const staged = path.join(settings.paths.stagingDir, `clip-${seq}.upload`);
  fs.copyFileSync(clip, staged);
  const pr = await probeStrict(staged, { demuxer: "mov", settings });
  await store.attachSource(p.id, { stagedPath: staged, sha256: clipSha, sizeBytes: fs.statSync(clip).size, demuxer: "mov", probe: pr, displayName: "clip.mp4" });
  return p.id;
}

async function runPipeline(id) {
  const h = await runner.enqueuePipeline(id);
  return h.done;
}

const providerCalls = () => mock.calls.filter((c) => c.route !== "key" && c.route !== "credits").length;

section("clean run");

t("VALIDATING → ANALYZING_CONTENT reaches READY with transcript, faces, content, discoveries and costs", async () => {
  resetBreakers(); stt.resetBudgetCache();
  const id = ids.clean = await newProject({});
  const res = await runPipeline(id);
  const p = store.get(id);
  assert.equal(res.status, "READY", JSON.stringify(p.statusReason));
  assert.ok(p.notices.some((n) => n.code === "PIPELINE_PARTIAL"));
  for (const s of ["VALIDATING", "COMPRESSING", ...P3]) assert.equal(p.stages[s].status, "done", `${s} ${JSON.stringify(p.stages[s].error)}`);
  assert.equal(p.stages.TRANSCRIBING.engine, "mai");
  assert.deepEqual(Object.keys(p.stages.TRANSCRIBING.outputs).sort(), ["transcript", "words"]);
  assert.deepEqual(Object.keys(p.stages.ANALYZING_VIDEO.outputs).sort(), ["faces", "video"]);

  const words = readJson(id, "analysis/transcript.words.json");
  assert.equal(words.language, "en");
  assert.equal(words.timing, "word");
  assert.ok(words.words.length > 60, `words ${words.words.length}`);
  const tr = readJson(id, "analysis/transcript.json");
  assert.ok(tr.sentences.length >= 5);
  assert.ok(tr.fillerCandidates.some((f) => /^um/i.test(f.text)), "mai kept the fillers");
  const faces = readJson(id, "analysis/faces.json");
  assert.equal(faces.mode, "tracked");
  assert.ok(faces.keyframes.length >= 8);
  const video = readJson(id, "analysis/video.json");
  assert.ok(Array.isArray(video.scenes) && video.scenes.length >= 1);
  const content = readJson(id, "analysis/content.json");
  assert.equal(content.source, "ai");
  assert.deepEqual(content.segments.flatMap((s) => s.sentenceIds), tr.sentences.map((s) => s.id), "segments cover every sentence");
  assert.ok(!content.faceRequired.some((f) => f.sentenceId === "s999"), "ungrounded id dropped");

  assert.equal(p.discoveries.language, "en");
  assert.ok(p.discoveries.words > 60 && p.discoveries.wpm > 0 && p.discoveries.fillersFound >= 2);
  assert.equal(p.discoveries.faceFound, true);
  assert.deepEqual(p.discoveries.topics, ["Launch plan"]);
  assert.ok(p.discoveries.silencesFound >= 1);
  for (const s of ["TRANSCRIBING", "ANALYZING_VIDEO", "ANALYZING_CONTENT"]) assert.ok(p.cost.byStage[s] > 0, `cost ${s}`);
  assert.ok(Math.abs(p.cost.spentUsd - Object.values(p.cost.byStage).reduce((a, b) => a + b, 0)) < 1e-9);
  assert.equal(mock.calls.filter((c) => String(c.route).startsWith("kie:")).length, 0, "KIE disabled by default");
  assert.equal(mock.count({ route: "stt", model: "microsoft/mai-transcribe-2" }), 1);
});

t("resume on a finished project: every stage cached, zero provider calls", async () => {
  const id = ids.clean;
  const before = store.get(id);
  const calls = providerCalls();
  captured.length = 0;
  const { done } = await runner.retry(id, { mode: "resume" });
  const res = await done;
  assert.equal(res.status, "READY");
  assert.equal(providerCalls(), calls, "no provider request on resume");
  const after = store.get(id);
  for (const s of P3) assert.equal(after.stages[s].finishedAt, before.stages[s].finishedAt, `${s} was re-run`);
  const cached = captured.filter((e) => e.id === id && e.type === "stage" && e.data.cached).map((e) => e.data.stage);
  for (const s of ["VALIDATING", "COMPRESSING", ...P3]) assert.ok(cached.includes(s), `${s} not reported cached`);
  assert.equal(after.cost.spentUsd, before.cost.spentUsd);
});

section("failure matrix");

t("every STT engine failing → NEEDS_ATTENTION STT_FAILED; continue without transcript → READY", async () => {
  resetBreakers(); stt.resetBudgetCache();
  const id = await newProject({ debugFaults: "or_stt:500,islands:error" });
  const res = await runPipeline(id);
  let p = store.get(id);
  assert.equal(res.status, "NEEDS_ATTENTION");
  assert.equal(p.statusReason.code, "STT_FAILED");
  assert.equal(p.statusReason.retryable, true);
  assert.ok(p.statusReason.actions.includes("retry") && p.statusReason.actions.includes("continue_without_transcript"));
  assert.equal(p.stages.TRANSCRIBING.status, "failed");
  assert.equal(p.stages.EXTRACTING_AUDIO.status, "done", "upstream checkpoint kept");
  assert.ok(!fs.existsSync(store.abs(id, "analysis/transcript.words.json")), "never an empty transcript");

  resetBreakers();
  const { done } = await runner.retry(id, { mode: "resume", continueWithout: "transcript" });
  const res2 = await done;
  p = store.get(id);
  assert.equal(res2.status, "READY", JSON.stringify(p.statusReason));
  assert.equal(p.stages.TRANSCRIBING.status, "skipped");
  assert.equal(p.stages.ANALYZING_CONTENT.status, "done");
  assert.equal(readJson(id, "analysis/content.json").source, "no_transcript");
});

t("vision down → faceTrack assumed; content LLM down → deterministic analysis; the pipeline still reaches READY", async () => {
  resetBreakers(); stt.resetBudgetCache();
  const id = await newProject({ debugFaults: "vision:429,llm:error" });
  const res = await runPipeline(id);
  const p = store.get(id);
  assert.equal(res.status, "READY", JSON.stringify(p.statusReason));
  const faces = readJson(id, "analysis/faces.json");
  assert.equal(faces.mode, "assumed");
  assert.equal(faces.reason, "vision_unavailable");
  const content = readJson(id, "analysis/content.json");
  assert.equal(content.source, "deterministic");
  assert.equal(content.visualSupport, null);
  const codes = p.notices.map((n) => n.code);
  assert.ok(codes.includes("FACE_TRACK_ASSUMED") && codes.includes("AI_ANALYSIS_UNAVAILABLE"), codes.join(","));
  assert.equal(p.stages.ANALYZING_VIDEO.engine, "assumed");
  assert.ok(p.stages.ANALYZING_CONTENT.fallbacks.some((f) => f.startsWith("content_")));
  assert.equal(p.discoveries.faceFound, false);
});

section("isolation");

t("no request left for a non-mock host; every provider call carried auth", () => {
  assert.deepEqual(guard.blocked, []);
  assert.equal(mock.state.unauthorized, 0);
});

(async () => {
  probe = FX.probeFixtures();
  if (!probe) { console.error(`missing ${FX.PROBE_DIR}/speech.wav — copy the probe sample there`); process.exitCode = 1; return; }
  mock = await startMockProviders({ truth: FX.truthFromGroundTruth(probe.groundTruth.en) });
  guard = FX.installMockOnlyFetch(new URL(mock.baseUrl).origin);
  scriptChat();
  clip = path.join(tmp.dir, "clip.mp4");
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostdin", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=30",
    "-i", probe.wav, "-map", "0:v", "-map", "1:a", "-t", "38.04", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-shortest", clip], { encoding: "utf8", windowsHide: true });
  if (r.status !== 0) throw new Error(`fixture ffmpeg failed: ${String(r.stderr).slice(-300)}`);
  clipSha = crypto.createHash("sha256").update(fs.readFileSync(clip)).digest("hex");
  settings = makeSettings(path.join(tmp.dir, "root"), { env: { VIDEO_EDIT_OPENROUTER_BASE: mock.openrouterBase, VIDEO_EDIT_KIE_BASE: mock.kieBase } });
  store = createStore({ settings, log: silentLog });
  store.init();
  const bus = createEventBus({ store, settings });
  events = { publish: (id, type, data) => { captured.push({ id, type, data }); return bus.publish(id, type, data); }, subscribe: bus.subscribe };
  const queue = createQueue({ settings, getTemplateActiveCount: () => 0, pollMs: 20 });
  runner = createRunner({
    store, queue, events, settings, log: silentLog, retryBackoffMs: [5, 10], abortGraceMs: 1500, pidFile: null,
    handlers: [(reg) => phase2.register(reg), (reg) => phase3.register(reg, { auth: AUTH, kieAuth: AUTH })],
  });
  try {
    await run();
  } finally {
    try { await runner.stopAll({ timeoutMs: 5000 }); } catch { /* noop */ }
    try { store.close(); } catch { /* noop */ }
    guard.restore();
    await mock.close();
    tmp.cleanup();
  }
})();
