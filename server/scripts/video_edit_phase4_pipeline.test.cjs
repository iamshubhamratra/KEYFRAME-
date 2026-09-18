// Pipeline tests for AI Video Edit Phase 4: BUILDING_EDIT_PLAN under the real runner and store.
// Run: node scripts/video_edit_phase4_pipeline.test.cjs
//
// Load-bearing: the real runner drives the real phase-4 handler after stubbed analysis stages and turns the
// fixture's analysis artifacts into plan revision 1 on disk, with the project's head moved and an SSE `plan`
// event published; a resumed run is a pure checkpoint hit (zero director calls, no second revision); a director
// that is down is NOT an edit failure (heuristic plan, HEURISTIC_DIRECTOR notice, still READY); scored B-roll
// slots are attached to the items the rhythm engine keeps, and without them every item stays 'pending';
// cancellation mid-stage leaves CANCELLED and no half-written revision.
// Offline: temp dirs, an injected fake callJson, the global fetch is a tripwire. No ffmpeg, no network.

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { createHarness, mkTmp, makeSettings, installFetchTripwire, silentLog } = require("./lib/video_edit_test_utils.cjs");

const tmp = mkTmp("ve-phase4-");
process.env.VIDEO_EDIT_DIR = path.join(tmp.dir, "_guard", "edits");
process.env.VIDEO_EDIT_INDEX = path.join(tmp.dir, "_guard", "video-edits.json");

const { createStore } = require("../src/video_edit/store");
const { createEventBus } = require("../src/video_edit/events");
const { createQueue } = require("../src/video_edit/engine/queue");
const { createRunner } = require("../src/video_edit/engine/runner");
const { DEFAULT_SETTINGS } = require("../src/video_edit/settings_schema");
const { callJson } = require("../src/video_edit/ai/llm");
const { EditError } = require("../src/video_edit/errors");
const phase4 = require("../src/video_edit/engine/handlers/phase4");

const { t, section, run } = createHarness();
const restoreFetch = installFetchTripwire();

const FIX = path.join(__dirname, "fixtures", "video_edit");
const load = (n) => JSON.parse(fs.readFileSync(path.join(FIX, `talking_head_45s.${n}.json`), "utf8"));
const TRANSCRIPT = load("transcript");
const WORDS_DOC = load("transcript.words");
const FACES = load("faces");
const CONTENT = load("content");
const AUDIO = load("audio");
const PLAN_RAW = load("plan");
const clone = (v) => JSON.parse(JSON.stringify(v));
const readJ = (dir, rel) => JSON.parse(fs.readFileSync(path.join(dir, rel), "utf8"));

// Artifact paths are the context loader's (editing/context.js ARTIFACTS) — the same files the editing routes read.
const ARTIFACTS = Object.freeze({
  transcript: "analysis/transcript.json",
  words: "analysis/transcript.words.json",
  faces: "analysis/faces.json",
  content: "analysis/content.json",
  audio: "analysis/audio.json",
  scored: "analysis/broll_scored.json",
});

// ---- the director's reply ------------------------------------------------------------------------
// Sentence and word references come from the fixture transcript, so the sanitizer keeps them.
const DIRECTOR_REPLY = {
  brollOpportunities: [
    { sentenceId: "s10", wordAnchor: { fromText: "Google Calendar", toText: "meetings" }, priority: 1.4, layoutPreference: "FULL",
      mediaPreference: "VIDEO", queries: ["calendar app on laptop screen", "time blocks planner"], reason: "shows the method" },
    { sentenceId: "s6", wordAnchor: { fromText: "notifications", toText: "off" }, priority: 0.7, layoutPreference: "PIP",
      mediaPreference: "either", queries: ["phone face down table", "silent phone"], reason: "notifications off" },
  ],
  punchIns: [{ sentenceId: "s8", wordText: "two weeks earlier", kind: "PUNCH_IN", priority: 0.8, reason: "result" }],
  graphics: [{ kind: "STAT", sentenceId: "s8", title: "Shipped two weeks early", value: "2", priority: 0.7, reason: "result stat" }],
  sfx: [{ anchor: "broll_in", ref: "s10", cue: "whoosh", priority: 0.6, reason: "entry" }],
  music: { include: true, mood: "upbeat", query: "upbeat acoustic pop background music", energy: 0.65, reason: "tone" },
  transitions: [{ afterSentenceId: "s8", kind: "DIP_BLACK", reason: "topic change" }],
  hookTitle: { text: "The 3-hour email trap", sentenceId: "s1" },
  ctaCard: { text: "Follow for more tips", sentenceId: "s12" },
};
const chatReply = (value) => ({
  text: typeof value === "string" ? value : JSON.stringify(value),
  tokensIn: 900, tokensOut: 300, costUsd: 0.002, model: "meta/muse-spark-1.3-contributor",
});

// A callJson with the REAL parsing, repair and cost path, fed by a scripted chat. `mode` drives the failures.
function fakeDirector({ mode = "ok", gate = null } = {}) {
  const calls = [];
  const fn = async (args) => {
    calls.push(args);
    if (gate) await gate;
    if (mode === "down") throw new EditError("LLM_CALL_FAILED", { errorClass: "provider", retryable: true, stage: args.stage });
    return callJson({ ...args, chat: async () => chatReply(DIRECTOR_REPLY) });
  };
  fn.calls = calls;
  return fn;
}

// ---- stub upstream stages ------------------------------------------------------------------------
// Each writes the fixture artifact its real counterpart would, so phase 4 reads exactly what it reads in
// production and `upstreamFingerprint` has real output hashes to chew on.
const STUB_WRITES = {
  EXTRACTING_AUDIO: () => ({ audio: [ARTIFACTS.audio, AUDIO] }),
  TRANSCRIBING: () => ({ transcript: [ARTIFACTS.transcript, TRANSCRIPT], words: [ARTIFACTS.words, WORDS_DOC] }),
  ANALYZING_VIDEO: () => ({ faces: [ARTIFACTS.faces, FACES] }),
  ANALYZING_CONTENT: () => ({ content: [ARTIFACTS.content, CONTENT] }),
  SCORING_ASSETS: () => ({ scored: [ARTIFACTS.scored, scoredSlots()] }),
};

// analysis/broll_scored.json as SCORING_ASSETS writes it: the fixture plan's own assets, accepted for every
// intensity, on the two sentences the director asks for.
function scoredSlots() {
  const first = PLAN_RAW.broll[0];
  const second = PLAN_RAW.broll[1] || PLAN_RAW.broll[0];
  const slot = (sentenceId, item, n) => ({
    slotId: `sl_${sentenceId}`, sentenceId, accepted: true,
    acceptedByIntensity: { low: true, medium: true, high: true },
    judge: "ok", bestTotal: 0.8 - n * 0.05, mediaTypes: ["video"],
    best: clone(item.chosen), top: clone(item.topCandidates || [item.chosen]),
  });
  return { schemaVersion: 1, slots: [slot("s10", first, 0), slot("s6", second, 1)] };
}

function stub(name) {
  return {
    name, version: 1, heavy: false, weight: 1,
    inputHash: () => ({ stub: name }),
    budgetMs: () => 30000,
    async run(ctx) {
      const writes = STUB_WRITES[name] ? STUB_WRITES[name]() : { marker: [`analysis/stub_${name.toLowerCase()}.json`, { ok: true }] };
      const outputs = {};
      for (const [k, [rel, obj]] of Object.entries(writes)) { await ctx.writeJson(rel, obj); outputs[k] = { path: rel }; }
      return { outputs, engine: "stub" };
    },
  };
}
const UPSTREAM = ["VALIDATING", "COMPRESSING", "EXTRACTING_AUDIO", "TRANSCRIBING", "ANALYZING_VIDEO", "ANALYZING_CONTENT"];
const analysisStubs = (withBroll) => (reg) => {
  for (const n of [...UPSTREAM, ...(withBroll ? ["SEARCHING_BROLL", "SCORING_ASSETS"] : [])]) reg.registerStage(stub(n));
};

const opened = [];
// Plan-time materialization (render/materialize.materializePlan) downloads B-roll and music; offline it is a stub that
// records its calls and "downloads" by stamping local paths, or fails when told to.
function fakeMaterialize({ mode = "ok" } = {}) {
  const calls = [];
  const fn = async (plan, opts) => {
    calls.push({ revision: plan.revision, items: plan.broll.length, hasSignal: !!(opts && opts.signal) });
    if (mode === "fail") throw new EditError("BROLL_DOWNLOAD_FAILED", { errorClass: "transient" });
    for (const b of plan.broll) if (b.chosen && b.status !== "removed") { b.chosen = { ...b.chosen, path: `assets/broll/${b.chosen.assetId}.mp4` }; b.status = "ok"; }
    if (plan.music && plan.music.enabled) plan.music.track = { assetId: "ast_music00001", path: "assets/music/ast_music00001.mp3", provider: "pixabay_bridge", title: "Test Track", query: plan.music.track ? plan.music.track.query : "calm", mood: "calm", license: "Pixabay Content License", durationSec: 120 };
    return { plan, changed: true, notes: [] };
  };
  fn.calls = calls;
  return fn;
}

function env(name, { director = fakeDirector(), withBroll = true, materialize = fakeMaterialize() } = {}) {
  const root = path.join(tmp.dir, name);
  const settings = makeSettings(root);
  const store = createStore({ settings, log: silentLog });
  store.init();
  const captured = [];
  const bus = createEventBus({ store, settings });
  const events = {
    publish: (id, type, data) => { const s = bus.publish(id, type, data); captured.push({ id, type, data }); return s; },
    subscribe: bus.subscribe,
  };
  const queue = createQueue({ settings, getTemplateActiveCount: () => 0, pollMs: 20 });
  const runner = createRunner({
    store, queue, events, settings,
    handlers: [analysisStubs(withBroll), (reg) => phase4.register(reg, { callJson: director, materializePlan: materialize })],
    log: silentLog, retryBackoffMs: [5, 10], abortGraceMs: 1500,
  });
  const e = { root, settings, store, captured, queue, runner, director, materialize };
  opened.push(e);
  return e;
}

let pseq = 0;
async function newProject(store, over = {}) {
  const ps = { ...clone(DEFAULT_SETTINGS), output: { aspect: "9:16" }, ...over };
  const p = store.createProject({ ownerId: "owner-1", settings: ps, consent: { thirdPartyAi: true, termsVersion: "2026-09" } });
  pseq++;
  const staged = path.join(store.settings.paths.stagingDir, `fixture-${pseq}.upload`);
  fs.mkdirSync(path.dirname(staged), { recursive: true });
  fs.writeFileSync(staged, Buffer.alloc(2048, pseq % 250));
  await store.attachSource(p.id, {
    stagedPath: staged, sha256: crypto.createHash("sha256").update(`fx-${pseq}`).digest("hex"), sizeBytes: 2048, demuxer: "mov",
    probe: { durationSec: 44.5, video: { width: 1080, height: 1920, fps: 30 }, audio: { codec: "aac" } }, displayName: "talk.mp4",
  });
  return store.get(p.id);
}

const headPlan = (e, id) => readJ(e.store.projectDir(id), `plan/revisions/r${String(e.store.get(id).plan.headRevision).padStart(6, "0")}.json`).plan;

// =================================================================================================
section("BUILDING_EDIT_PLAN — the first plan");

t("a clean run turns the analysis into revision 1: director plan, head moved, SSE `plan`, cost booked", async () => {
  const e = env("clean");
  const p = await newProject(e.store);
  const r = await (await e.runner.enqueuePipeline(p.id)).done;
  assert.equal(r.status, "READY", `status ${r.status} ${r.error ? r.error.code : ""}`);

  const proj = e.store.get(p.id);
  assert.equal(proj.stages.BUILDING_EDIT_PLAN.status, "done");
  assert.equal(proj.stages.BUILDING_EDIT_PLAN.engine, "director");
  assert.equal(proj.plan.headRevision, 1);
  assert.match(proj.plan.headHash, /^[0-9a-f]{64}$/);
  assert.equal(e.director.calls.length, 1, "exactly one director call");
  assert.equal(e.director.calls[0].stage, "ve_director");

  const doc = readJ(e.store.projectDir(p.id), "plan/revisions/r000001.json");
  assert.equal(doc.rev, 1);
  assert.equal(doc.parent, null);
  assert.equal(doc.author, "director");
  const plan = doc.plan;
  assert.equal(plan.revision, 1);
  assert.equal(plan.createdBy, "director");
  assert.equal(plan.projectId, p.id);
  assert.equal(plan.output.aspect, "9:16");
  assert.ok(plan.timeline.outDurationSec > 0, "the timeline is resolved");
  assert.ok(plan.aRoll.segments.length > 0, "A-roll segments exist");
  assert.ok(plan.captions.cues.length > 0, "captions were laid out");
  assert.ok(plan.broll.length > 0, "the director's B-roll survived the rhythm engine");
  assert.ok(proj.cost.spentUsd > 0, "the director call is on the ledger");
  assert.equal(proj.cost.byStage.BUILDING_EDIT_PLAN > 0, true);

  const planEvent = e.captured.find((x) => x.id === p.id && x.type === "plan");
  assert.ok(planEvent, "an SSE plan event was published");
  assert.equal(planEvent.data.revision, 1);
  assert.equal(planEvent.data.createdBy, "director");
});

t("resuming a finished project re-runs nothing: checkpoint hit, zero director calls, still one revision", async () => {
  const e = env("resume");
  const p = await newProject(e.store);
  await (await e.runner.enqueuePipeline(p.id)).done;
  assert.equal(e.director.calls.length, 1);
  const before = e.store.get(p.id).plan;

  const again = await (await e.runner.enqueuePipeline(p.id, { resume: true, allowFrom: ["READY"] })).done;
  assert.equal(again.status, "READY", `status ${again.status}`);
  assert.equal(e.director.calls.length, 1, "the stage was served from its checkpoint");
  const after = e.store.get(p.id).plan;
  assert.equal(after.headRevision, 1, "no second revision");
  assert.equal(after.headHash, before.headHash, "the plan is byte-identical");
  assert.equal(fs.existsSync(path.join(e.store.projectDir(p.id), "plan/revisions/r000002.json")), false);
});

t("a director that is down is not an edit failure: heuristic plan, HEURISTIC_DIRECTOR notice, still READY", async () => {
  const e = env("nodirector", { director: fakeDirector({ mode: "down" }) });
  const p = await newProject(e.store);
  const r = await (await e.runner.enqueuePipeline(p.id)).done;
  assert.equal(r.status, "READY", `status ${r.status} ${r.error ? r.error.code : ""}`);

  const proj = e.store.get(p.id);
  assert.equal(proj.plan.headRevision, 1);
  assert.equal(proj.stages.BUILDING_EDIT_PLAN.status, "done");
  assert.equal(proj.stages.BUILDING_EDIT_PLAN.engine, "heuristic");
  const doc = readJ(e.store.projectDir(p.id), "plan/revisions/r000001.json");
  assert.equal(doc.author, "heuristic");
  assert.equal(doc.plan.createdBy, "heuristic");
  assert.ok(doc.plan.aRoll.segments.length > 0, "the heuristic still builds a real edit");
  const codes = proj.notices.map((n) => `${n.stage}:${n.code}`);
  assert.ok(codes.includes("BUILDING_EDIT_PLAN:HEURISTIC_DIRECTOR"), codes.join(","));
});

t("scored slots are attached to B-roll items; without retrieval every item stays 'pending'", async () => {
  const withSlots = env("slots");
  const a = await newProject(withSlots.store);
  assert.equal((await (await withSlots.runner.enqueuePipeline(a.id)).done).status, "READY");
  const attached = headPlan(withSlots, a.id).broll;
  assert.ok(attached.length > 0, "items were created");
  assert.ok(attached.every((b) => b.chosen && typeof b.chosen.assetId === "string"), "every item carries the slot's asset");
  assert.ok(attached.every((b) => b.candidateSetId && b.candidateSetId.startsWith("sl_")), "items name their slot");
  assert.ok(attached.some((b) => Array.isArray(b.topCandidates) && b.topCandidates.length > 0), "ranked candidates came along");

  const noSlots = env("noslots", { withBroll: false });
  const b = await newProject(noSlots.store);
  assert.equal((await (await noSlots.runner.enqueuePipeline(b.id)).done).status, "READY");
  assert.equal(noSlots.store.get(b.id).stages.BUILDING_EDIT_PLAN.status, "done");
  const pending = headPlan(noSlots, b.id).broll;
  assert.ok(pending.length > 0, "the director's opportunities still become items");
  assert.ok(pending.every((x) => x.status === "pending"), "nothing was prefetched");
  assert.ok(pending.every((x) => !x.chosen || !x.chosen.path), "and nothing claims a downloaded file");
});

t("revision 1 records the materialized assets; a failed download never fails the plan", async () => {
  const ok = env("mat-ok");
  const a = await newProject(ok.store);
  assert.equal((await (await ok.runner.enqueuePipeline(a.id)).done).status, "READY");
  assert.equal(ok.materialize.calls.length, 1, "materialized once, before the commit");
  assert.ok(ok.materialize.calls[0].hasSignal, "the stage signal is passed (cancellation reaches downloads)");
  const plan = headPlan(ok, a.id);
  const live = plan.broll.filter((b) => b.chosen);
  assert.ok(live.length > 0 && live.every((b) => b.status === "ok" && b.chosen.path.startsWith("assets/broll/")), "downloaded paths are in revision 1");
  if (plan.music) assert.equal(plan.music.track.title, "Test Track");

  const bad = env("mat-fail", { materialize: fakeMaterialize({ mode: "fail" }) });
  const b = await newProject(bad.store);
  assert.equal((await (await bad.runner.enqueuePipeline(b.id)).done).status, "READY", "materialization is fail-open");
  const p = bad.store.get(b.id);
  assert.ok((p.notices || []).some((n) => n.code === "MATERIALIZE_DEFERRED"), "the user is told the assets come at render time");
  assert.ok(headPlan(bad, b.id).broll.every((x) => x.status !== "missing"), "nothing was marked missing by a transient failure");
});

t("a forced re-run over the SAME transcript re-plans in place and keeps the user's locked elements", async () => {
  const e = env("replan");
  const p = await newProject(e.store);
  assert.equal((await (await e.runner.enqueuePipeline(p.id)).done).status, "READY");
  assert.equal(e.store.get(p.id).plan.headRevision, 1);

  // What POST /:id/settings does after the user confirms a re-analysis: force the pipeline from TRANSCRIBING.
  // The stubs write the same transcript, so the plan's anchors still mean what they meant.
  const r = await (await e.runner.retry(p.id, { stage: "TRANSCRIBING", mode: "force" })).done;
  assert.equal(r.status, "READY", `status ${r.status} ${r.error ? r.error.code : ""}`);

  const proj = e.store.get(p.id);
  assert.equal(proj.plan.headRevision, 2, "the re-analysis produced a NEW revision, not a stale head");
  assert.equal(e.director.calls.length, 2, "the director was asked again");
  const doc = readJ(e.store.projectDir(p.id), "plan/revisions/r000002.json");
  assert.equal(doc.parent, 1, "the new revision descends from the old one");
  assert.equal(doc.summary, "Re-planned after new analysis");
  assert.equal(doc.plan.revision, 2);
  assert.ok(doc.plan.aRoll.segments.length > 0 && doc.plan.captions.cues.length > 0, "the re-plan is a full plan");
  assert.equal(fs.existsSync(path.join(e.store.projectDir(p.id), "plan/revisions/r000001.json")), true, "history is never rewritten");
  assert.ok(!proj.notices.some((n) => n.code === "PLAN_REBUILT"), "nothing was thrown away");
});

t("a re-run whose transcript CHANGED builds a fresh plan instead of parking the project", async () => {
  // The forced-language case: every anchor on the old plan points at words that no longer exist, which is
  // exactly what `redirect` refuses (PLAN_BUILD_INVALID). The stage must still end READY.
  const e = env("relang");
  const p = await newProject(e.store);
  assert.equal((await (await e.runner.enqueuePipeline(p.id)).done).status, "READY");

  const dir = e.store.projectDir(p.id);
  const es = {
    ...TRANSCRIPT, language: "es",
    sentences: TRANSCRIPT.sentences.slice(0, 4).map((s, i) => ({ ...s, id: `x${i}`, w0: i * 4, w1: i * 4 + 3 })),
    words: undefined,
  };
  const esWords = { ...WORDS_DOC, language: "es", words: WORDS_DOC.words.slice(0, 16).map((w, i) => ({ ...w, text: `palabra${i}` })) };
  STUB_WRITES.TRANSCRIBING = () => ({ transcript: [ARTIFACTS.transcript, es], words: [ARTIFACTS.words, esWords] });
  try {
    const r = await (await e.runner.retry(p.id, { stage: "TRANSCRIBING", mode: "force" })).done;
    assert.equal(r.status, "READY", `status ${r.status} ${r.error ? r.error.code : ""}`);
    const proj = e.store.get(p.id);
    assert.equal(proj.plan.headRevision, 2);
    assert.equal(proj.status, "READY", "a changed transcript must never park the project");
    const doc = readJ(dir, "plan/revisions/r000002.json");
    assert.equal(doc.plan.source.language, "es", "the new plan speaks the new language");
    assert.ok(doc.plan.captions.cues.length > 0, "and it is a complete plan");
    assert.ok(proj.notices.some((n) => n.code === "PLAN_REBUILT" && n.stage === "BUILDING_EDIT_PLAN"),
      proj.notices.map((n) => n.code).join(","));
  } finally {
    STUB_WRITES.TRANSCRIBING = () => ({ transcript: [ARTIFACTS.transcript, TRANSCRIPT], words: [ARTIFACTS.words, WORDS_DOC] });
  }
});

t("cancelling while the director is thinking leaves CANCELLED and no half-written revision", async () => {
  let release;
  const gate = new Promise((r) => { release = r; });
  const e = env("cancel", { director: fakeDirector({ gate }) });
  const p = await newProject(e.store);
  const started = await e.runner.enqueuePipeline(p.id);
  for (let i = 0; i < 400 && !e.director.calls.length; i++) await new Promise((r) => setTimeout(r, 20));
  assert.equal(e.director.calls.length, 1, "the director stage is running");

  await e.runner.cancel(p.id, { target: "pipeline" });
  release();
  // `done` reports how the RUN ended (it may be skipped/superseded by the cancel); the project's own
  // status is the contract, as in video_edit_cancel.test.cjs.
  const r = await started.done;
  assert.ok(r.status !== "READY", `the run must not have completed: ${JSON.stringify(r.status)}`);
  const proj = e.store.get(p.id);
  assert.equal(proj.status, "CANCELLED", `status ${proj.status}`);
  assert.equal(proj.plan.headRevision, 0, "no revision was committed");
  assert.equal(fs.existsSync(path.join(e.store.projectDir(p.id), "plan/revisions/r000001.json")), false);
});

run().then(async (res) => {
  for (const e of opened) {
    try { await e.runner.stopAll({ timeoutMs: 2000 }); } catch { /* noop */ }
    try { e.queue.stop(); } catch { /* noop */ }
    try { e.store.stop(); } catch { /* noop */ }
  }
  restoreFetch();
  tmp.cleanup();
  process.exitCode = res.failed ? 1 : 0;
});
