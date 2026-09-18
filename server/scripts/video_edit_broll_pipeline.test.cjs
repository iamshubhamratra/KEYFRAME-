// Pipeline tests for AI Video Edit B-roll: phase-5 stage handlers under the real runner, acquisition of the
// chosen asset, the route-facing candidates helpers and credits.
// Run: node scripts/video_edit_broll_pipeline.test.cjs
//
// Load-bearing: SEARCHING_BROLL → SCORING_ASSETS run inside the real runner after (stubbed) analysis stages and
// write slots, raw hits, candidates and the scored summary; a resumed run is a pure checkpoint hit (zero stock
// or judge calls) and an intensity change never refetches stock; every provider down or an injected empty page
// ends READY with NO_BROLL_FOUND (B-roll never parks the project); a failed or fault-injected judge degrades to
// lexical-only and says so; acquisition refuses a non-video body served as video/mp4; the candidates view never
// leaks a server path; credits list exactly the used third-party assets.
// Offline: stock APIs and thumbnails go to an injected fake fetch (recorded-shape fixtures in
// fixtures/video_edit_broll + ffmpeg lavfi pictures), the judge is a fake callJson, the global fetch is a tripwire.

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { createHarness, mkTmp, makeSettings, makeFixture, installFetchTripwire, silentLog } = require("./lib/video_edit_test_utils.cjs");

const tmp = mkTmp("ve-broll-pipe-");
process.env.VIDEO_EDIT_DIR = path.join(tmp.dir, "_guard", "edits");
process.env.VIDEO_EDIT_INDEX = path.join(tmp.dir, "_guard", "video-edits.json");

const { createStore } = require("../src/video_edit/store");
const { createEventBus } = require("../src/video_edit/events");
const { createQueue } = require("../src/video_edit/engine/queue");
const { createRunner } = require("../src/video_edit/engine/runner");
const faults = require("../src/video_edit/faults");
const phase5 = require("../src/video_edit/engine/handlers/phase5");
const { acquireChosen, chooseRendition, targetShortEdge } = require("../src/video_edit/broll/acquire");
const { listCandidates, searchCandidates, resolveThumbFile, KEY_RE, USER_SLOTS_REL } = require("../src/video_edit/broll/candidates");
const { buildCreditLines, writeCredits } = require("../src/video_edit/broll/credits");
const { assetIdFor } = require("../src/video_edit/broll/common");
const { hashImages, hamming } = require("../src/video_edit/broll/dhash");
const { AssetRefSchema } = require("../src/video_edit/plan/schema");
const { EditError, isEditError } = require("../src/video_edit/errors");
const { resetBreakers } = require("../src/video_edit/providers/breaker");
const { resetLimiters } = require("../src/video_edit/broll/rate_limit");
const { DEFAULT_SETTINGS } = require("../src/video_edit/settings_schema");
const fsx = require("../src/video_edit/fsx");

const { t, section, run } = createHarness();
const restoreFetch = installFetchTripwire();
const tripwire = globalThis.fetch;
let globalFetchCalls = 0;
globalThis.fetch = (...args) => { globalFetchCalls++; return tripwire(...args); };

const FX = path.join(__dirname, "fixtures");
const fx = (name) => JSON.parse(fs.readFileSync(path.join(FX, "video_edit", `talking_head_45s.${name}.json`), "utf8"));
const bx = (name) => JSON.parse(fs.readFileSync(path.join(FX, "video_edit_broll", name), "utf8"));
const clone = (v) => JSON.parse(JSON.stringify(v));
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `expected ${a} ≈ ${b}`);
const readJ = (dir, rel) => JSON.parse(fs.readFileSync(path.join(dir, rel), "utf8"));
const shaOf = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const KEYS = Object.freeze({ pexels: "test-pexels-key", pixabay: "test-pixabay-key" });
const state = {};
let seq = 0;
const scratch = (name) => { const d = path.join(tmp.dir, `${name}-${++seq}`); fs.mkdirSync(d, { recursive: true }); return d; };

async function rejects(p, check) {
  try { await (typeof p === "function" ? p() : p); } catch (e) { check(e); return e; }
  throw new Error("expected a rejection");
}

// ---- generated pictures ------------------------------------------------------------------------------
const PIC = path.join(tmp.dir, "pics");
fs.mkdirSync(PIC, { recursive: true });
function ff(args) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostdin", "-loglevel", "error", "-y", ...args], { windowsHide: true, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${String(r.stderr).slice(-400)}`);
}
const SOURCES = ["testsrc2=s=320x180:r=1", "mandelbrot=s=320x180:r=1", "smptebars=s=320x180:r=1", "sierpinski=s=320x180:r=1:seed=3",
  "rgbtestsrc=s=320x180:r=1", "cellauto=s=320x180:r=1:rule=110:random_seed=5"];
const TRANSFORMS = [["n", "null"], ["h", "hflip"], ["v", "vflip"], ["x", "negate"]];
let POOL = null;
async function pictures() {
  if (POOL) return POOL;
  const graph = [];
  const outs = [];
  SOURCES.forEach((_, i) => {
    graph.push(`[${i}:v]split=${TRANSFORMS.length}${TRANSFORMS.map(([k]) => `[s${i}${k}]`).join("")}`);
    for (const [k, f] of TRANSFORMS) {
      graph.push(`[s${i}${k}]${f}[o${i}${k}]`);
      outs.push("-map", `[o${i}${k}]`, "-frames:v", "1", "-q:v", "3", path.join(PIC, `p${i}${k}.jpg`));
    }
  });
  ff([...SOURCES.flatMap((s) => ["-f", "lavfi", "-i", s]), "-filter_complex", graph.join(";"), ...outs]);
  const files = fs.readdirSync(PIC).filter((f) => /^p\d[nhvx]\.jpg$/.test(f)).sort().map((f) => path.join(PIC, f));
  const hs = await hashImages(files, { workDir: scratch("pool"), pidFile: null });
  POOL = [];
  for (const h of hs) if (h.dhash && h.stdev >= 5 && POOL.every((p) => hamming(p.dhash, h.dhash) > 12)) POOL.push(h);
  assert.ok(POOL.length >= 6, `picture pool too small (${POOL.length})`);
  return POOL;
}

// ---- fake network ------------------------------------------------------------------------------------
const FIXTURE_FOR = {
  pexels_video: "pexels_videos.json", pexels_image: "pexels_photos.json",
  pixabay_video: "pixabay_videos.json", pixabay_image: "pixabay_images.json", openverse_image: "openverse_images.json",
};
function routeKey(u) {
  if (u.hostname === "api.pexels.com") return u.pathname.startsWith("/videos") ? "pexels_video" : "pexels_image";
  if (u.hostname === "pixabay.com" && u.pathname.startsWith("/api")) return u.pathname.startsWith("/api/videos") ? "pixabay_video" : "pixabay_image";
  if (u.hostname === "api.openverse.org" && !/\/thumb\/?$/.test(u.pathname)) return "openverse_image";
  return "thumb";
}
const jsonResponse = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });
const bytesResponse = (buf, type, status = 200) => new Response(buf, { status, headers: { "content-type": type, "content-length": String(buf.length) } });

function fakeFetch({ stockStatus = 200 } = {}) {
  const calls = [];
  const assigned = new Map();
  const fn = async (url, init = {}) => {
    const u = new URL(url);
    calls.push(u.toString());
    if (init.signal && init.signal.aborted) throw init.signal.reason || new Error("aborted");
    const route = routeKey(u);
    if (route !== "thumb") return stockStatus === 200 ? jsonResponse(bx(FIXTURE_FOR[route])) : jsonResponse({ error: "upstream" }, stockStatus);
    if (!assigned.has(u.toString())) assigned.set(u.toString(), POOL[assigned.size % POOL.length].file);
    return bytesResponse(fs.readFileSync(assigned.get(u.toString())), "image/jpeg");
  };
  fn.calls = calls;
  fn.stock = () => calls.filter((c) => routeKey(new URL(c)) !== "thumb").length;
  return fn;
}

// ---- fake judge (same wire shape broll/judge.js sends) -----------------------------------------------
function batchOf(user) {
  return (Array.isArray(user) ? user : []).filter((p) => p.type === "text" && /^SLOT /.test(p.text)).map((p) => ({
    slotId: /^SLOT (\S+)/.exec(p.text)[1],
    letters: [...((/Letters on this sheet: (.*)$/m.exec(p.text) || [])[1] || "").matchAll(/\b([A-Z]{1,2}) \((?:video|photo)/g)].map((m) => m[1]),
  }));
}
const rating = (id) => ({ id, relevance: 8, literalMatch: true, quality: 7, issues: [], composition: 7, bestLayout: "FULL" });
function fakeJudge({ costUsd = 0.0006, fail = null } = {}) {
  const calls = [];
  const fn = async (opts) => {
    calls.push(opts);
    if (fail) throw fail(opts, calls.length);
    const reply = { slots: batchOf(opts.user).map((s) => ({ slotId: s.slotId, cands: s.letters.map(rating) })) };
    const parsed = opts.schema.safeParse(reply);
    if (!parsed.success) throw new EditError("LLM_INVALID_JSON", { errorClass: "provider", retryable: true, extra: { costUsd } });
    return { value: parsed.data, model: opts.model, costUsd, tokensIn: 900, tokensOut: 120, cached: false };
  };
  fn.calls = calls;
  return fn;
}

// ---- runner environment ------------------------------------------------------------------------------
const STUB_WRITES = {
  TRANSCRIBING: () => ({ transcript: [phase5.TRANSCRIPT_REL, fx("transcript")], words: [phase5.WORDS_REL, fx("transcript.words")] }),
  ANALYZING_VIDEO: () => ({ faces: [phase5.FACES_REL, fx("faces")] }),
  ANALYZING_CONTENT: () => ({ content: [phase5.CONTENT_REL, fx("content")] }),
};
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
const analysisStubs = (reg) => {
  for (const n of ["VALIDATING", "COMPRESSING", "EXTRACTING_AUDIO", "TRANSCRIBING", "ANALYZING_VIDEO", "ANALYZING_CONTENT"]) reg.registerStage(stub(n));
};

const opened = [];
function env(name, deps) {
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
    store, queue, events, settings, handlers: [analysisStubs, (reg) => phase5.register(reg, deps)],
    log: silentLog, retryBackoffMs: [5, 10], abortGraceMs: 1500,
  });
  const e = { root, settings, store, captured, queue, runner };
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
    probe: { durationSec: 45, video: { width: 1080, height: 1920, fps: 30 }, audio: { codec: "aac" } }, displayName: "talk.mp4",
  });
  return store.get(p.id);
}

// Stage-level context (handler contract, ENGINE.md §5.1) with REAL fault injection bound to the project.
function stageCtx(projectDir, project, settings, extra = {}) {
  return {
    project, projectId: project.id, projectDir, settings, runId: "run_test", signal: null, attempt: 3,
    log: silentLog, now: Date.now, tracker: null, pidFile: null, progress: () => {}, emit: () => 0, continueWithout: [],
    faults: {
      maybeFail: (point, x = {}) => faults.maybeFail(point, { settings, project, ...x }),
      faultFor: (point, x = {}) => faults.faultFor(point, { settings, project, ...x }),
    },
    abs: (rel) => fsx.resolveInside(projectDir, rel),
    readJson: (rel) => { const r = fsx.readJsonSafe(fsx.resolveInside(projectDir, rel)); return r.ok ? r.value : null; },
    writeJson: async (rel, obj) => { const f = fsx.resolveInside(projectDir, rel); fsx.ensureDir(path.dirname(f)); fsx.writeJsonAtomic(f, obj); return rel; },
    ...extra,
  };
}
function seededProject(projectDir, over = {}) {
  fs.mkdirSync(path.join(projectDir, "analysis"), { recursive: true });
  for (const [name, rel] of [["content", phase5.CONTENT_REL], ["transcript", phase5.TRANSCRIPT_REL], ["transcript.words", phase5.WORDS_REL], ["faces", phase5.FACES_REL]]) {
    fs.writeFileSync(path.join(projectDir, rel), JSON.stringify(fx(name)));
  }
  return {
    id: "ve_broll0000000001",
    settings: { ...clone(DEFAULT_SETTINGS), output: { aspect: "9:16" } },
    source: { durationSec: 45, video: { width: 1080, height: 1920 } },
    stages: {
      TRANSCRIBING: { status: "done", outputs: { words: { path: phase5.WORDS_REL, sha256: "w1" } } },
      ANALYZING_VIDEO: { status: "done", outputs: { faces: { path: phase5.FACES_REL, sha256: "f1" } } },
      ANALYZING_CONTENT: { status: "done", outputs: { content: { path: phase5.CONTENT_REL, sha256: "c1" } } },
    },
    cost: { spentUsd: 0, capUsd: 0.5 },
    ...over,
  };
}

// =====================================================================================================
section("phase-5 under the runner");

t("register: SEARCHING_BROLL waits for content AND video analysis; intensity never changes the search hash", async () => {
  const [SEARCH, SCORE] = phase5.stages({ keys: KEYS });
  assert.deepEqual([...SEARCH.deps], ["ANALYZING_CONTENT", "ANALYZING_VIDEO"]);
  assert.deepEqual([...SCORE.deps], ["SEARCHING_BROLL"]);
  const root = scratch("hash");
  const settings = makeSettings(root);
  const p = seededProject(root);
  const h = (proj, extra) => fsx.sha256Json(SEARCH.inputHash(stageCtx(root, proj, settings, extra)));
  const base = h(p);
  assert.equal(h({ ...p, settings: { ...p.settings, broll: { ...p.settings.broll, intensity: "high" } } }), base, "intensity must not refetch");
  assert.equal(h({ ...p, settings: { ...p.settings, exportProfile: "export720" } }), base, "export size must not refetch");
  assert.notEqual(h({ ...p, settings: { ...p.settings, output: { aspect: "16:9" } } }), base, "aspect changes the search");
  assert.notEqual(h(p, { continueWithout: ["broll"] }), base);
  const [SEARCH2] = phase5.stages({ keys: { pexels: "", pixabay: "k" } });
  assert.notEqual(fsx.sha256Json(SEARCH2.inputHash(stageCtx(root, p, settings))), base, "configured providers are part of the hash");
  const sh = (proj) => fsx.sha256Json(SCORE.inputHash(stageCtx(root, proj, settings)));
  assert.notEqual(sh({ ...p, settings: { ...p.settings, broll: { ...p.settings.broll, intensity: "high" } } }), sh(p), "scoring records acceptance for the chosen intensity");
});

t("happy path: analysis → SEARCHING_BROLL → SCORING_ASSETS writes slots, raw hits, candidates, summary, ledger; READY", async () => {
  resetBreakers();
  resetLimiters();
  await pictures();
  const fetchImpl = fakeFetch();
  const judge = fakeJudge();
  const e = env("happy", { fetch: fetchImpl, callJson: judge, keys: KEYS, cache: false });
  const p = await newProject(e.store);
  const r = await (await e.runner.enqueuePipeline(p.id)).done;
  assert.equal(r.status, "READY", `status ${r.status} ${r.error ? r.error.code : ""}`);
  const proj = e.store.get(p.id);
  const dir = e.store.projectDir(p.id);
  for (const s of ["SEARCHING_BROLL", "SCORING_ASSETS"]) assert.equal(proj.stages[s].status, "done", s);
  assert.equal(proj.stages.SEARCHING_BROLL.engine, "stock");
  assert.equal(proj.stages.SCORING_ASSETS.engine, "judge");

  const slots = readJ(dir, phase5.SLOTS_REL);
  assert.ok(slots.slots.length >= 3, `slots ${slots.slots.length}`);
  const manifest = readJ(dir, phase5.SEARCH_REL);
  assert.equal(manifest.counts.slots, slots.slots.length);
  assert.deepEqual(manifest.providersDown, []);
  const summary = readJ(dir, "analysis/broll_scored.json");
  assert.equal(summary.slots.length, slots.slots.length);
  for (const s of summary.slots) {
    assert.ok(fs.existsSync(path.join(dir, "analysis", "broll_raw", `${s.slotId}.json`)));
    const cand = readJ(dir, `broll/candidates/${s.slotId}.json`);
    assert.ok(cand.candidates.length > 0 && cand.candidates.length <= 8);
    for (const ref of cand.candidates) AssetRefSchema.parse(ref);
  }
  assert.ok(summary.counts.accepted >= 1, "something accepted");
  assert.equal(proj.discoveries.brollSlots, slots.slots.length);
  assert.ok(proj.discoveries.brollCandidates > 0);
  assert.equal(proj.discoveries.brollMoments, summary.counts.accepted);
  assert.equal(proj.discoveries.brollAccepted, summary.counts.accepted);

  assert.ok(judge.calls.length >= 1);
  near(proj.cost.byStage.SCORING_ASSETS, 0.0006 * judge.calls.length);
  const ledger = readJ(dir, phase5.LEDGER_REL);
  assert.equal(ledger.calls, judge.calls.length);
  near(ledger.totalUsd, proj.stages.SCORING_ASSETS.costUsd);
  assert.ok(ledger.entries.every((x) => x.stage === "ve_broll_judge" && x.costUsd > 0));
  const codes = proj.notices.map((n) => n.code);
  assert.ok(codes.includes("PIPELINE_PARTIAL"));
  assert.ok(!codes.includes("NO_BROLL_FOUND") && !codes.includes("STOCK_PROVIDER_DOWN"), codes.join(","));
  state.happy = { e, p, dir, fetchImpl, judge };
});

t("re-run resumes from checkpoints: zero stock, thumbnail or judge calls; an intensity change re-scores without refetching stock", async () => {
  const { e, p, dir, fetchImpl, judge } = state.happy;
  const before = e.store.get(p.id);
  const calls0 = { fetch: fetchImpl.calls.length, stock: fetchImpl.stock(), judge: judge.calls.length };
  const scoredSha = shaOf(path.join(dir, "analysis/broll_scored.json"));
  const mark = e.captured.length;
  const again = await e.runner.retry(p.id, { mode: "resume" });
  const r = await again.done;
  assert.equal(r.status, "READY");
  assert.equal(fetchImpl.calls.length, calls0.fetch, "no network at all");
  assert.equal(judge.calls.length, calls0.judge, "no judge calls");
  const after = e.store.get(p.id);
  for (const s of ["SEARCHING_BROLL", "SCORING_ASSETS"]) assert.equal(after.stages[s].finishedAt, before.stages[s].finishedAt, `${s} not re-run`);
  assert.equal(shaOf(path.join(dir, "analysis/broll_scored.json")), scoredSha);
  const cached = e.captured.slice(mark).filter((x) => x.type === "stage" && x.data.cached).map((x) => x.data.stage);
  assert.ok(cached.includes("SEARCHING_BROLL") && cached.includes("SCORING_ASSETS"), cached.join(","));

  await e.store.update(p.id, (d) => { d.settings.broll = { ...d.settings.broll, intensity: "high" }; });
  const r2 = await (await e.runner.retry(p.id, { mode: "resume" })).done;
  assert.equal(r2.status, "READY");
  const after2 = e.store.get(p.id);
  assert.equal(fetchImpl.stock(), calls0.stock, "intensity change never refetches stock");
  assert.equal(after2.stages.SEARCHING_BROLL.finishedAt, before.stages.SEARCHING_BROLL.finishedAt);
  assert.notEqual(after2.stages.SCORING_ASSETS.finishedAt, before.stages.SCORING_ASSETS.finishedAt, "scoring re-ran");
  assert.equal(readJ(dir, "analysis/broll_scored.json").intensity, "high");
});

t("every stock provider returns 500: READY with STOCK_PROVIDER_DOWN + NO_BROLL_FOUND, no judge call", async () => {
  resetBreakers();
  resetLimiters();
  const fetchImpl = fakeFetch({ stockStatus: 500 });
  const judge = fakeJudge();
  const e = env("down", { fetch: fetchImpl, callJson: judge, keys: KEYS, cache: false });
  const p = await newProject(e.store);
  const r = await (await e.runner.enqueuePipeline(p.id)).done;
  assert.equal(r.status, "READY", `status ${r.status} ${r.error ? r.error.code : ""}`);
  const proj = e.store.get(p.id);
  const dir = e.store.projectDir(p.id);
  assert.equal(proj.stages.SEARCHING_BROLL.status, "done");
  assert.equal(proj.stages.SCORING_ASSETS.status, "done");
  assert.ok(fetchImpl.stock() > 0);
  const codes = proj.notices.map((n) => `${n.stage}:${n.code}`);
  assert.ok(codes.includes("SEARCHING_BROLL:STOCK_PROVIDER_DOWN"), codes.join(","));
  assert.ok(codes.includes("SEARCHING_BROLL:NO_BROLL_FOUND"), codes.join(","));
  assert.ok(codes.includes("SCORING_ASSETS:NO_BROLL_FOUND"), codes.join(","));
  const down = proj.notices.find((n) => n.code === "STOCK_PROVIDER_DOWN");
  assert.match(down.message, /Pexels/);
  assert.ok(proj.stages.SEARCHING_BROLL.fallbacks.some((f) => /^providers_down:/.test(f)));
  assert.deepEqual(readJ(dir, phase5.SEARCH_REL).providersDown.sort(), ["openverse", "pexels", "pixabay"]);
  assert.equal(readJ(dir, "analysis/broll_scored.json").counts.accepted, 0);
  assert.equal(judge.calls.length, 0);
  assert.equal(proj.discoveries.brollCandidates, 0);
  resetBreakers();
});

t("fault points assets:empty and assets:http500 (project debugFaults): no provider request, the stage still succeeds with notices", async () => {
  await pictures();
  for (const token of ["assets:empty", "assets:http500"]) {
    resetBreakers();
    resetLimiters();
    const root = scratch(token.replace(":", "-"));
    const settings = makeSettings(root);
    const project = seededProject(root);
    project.settings.debugFaults = token;
    const fetchImpl = fakeFetch();
    const [SEARCH, SCORE] = phase5.stages({ fetch: fetchImpl, callJson: fakeJudge(), keys: KEYS, cache: false });
    const ctx = stageCtx(root, project, settings);
    const sr = await SEARCH.run(ctx);
    assert.equal(fetchImpl.stock(), 0, `${token}: provider fetched`);
    assert.equal(sr.discoveries.brollCandidates, 0);
    const codes = sr.notices.map((n) => n.code);
    assert.ok(codes.includes("NO_BROLL_FOUND"), `${token}: ${codes}`);
    if (token === "assets:http500") assert.ok(codes.includes("STOCK_PROVIDER_DOWN"), codes.join(","));
    else assert.ok(!codes.includes("STOCK_PROVIDER_DOWN"), codes.join(","));
    const sc = await SCORE.run(ctx);
    assert.equal(sc.engine, "lexical");
    assert.ok(sc.notices.some((n) => n.code === "NO_BROLL_FOUND"));
  }
  resetBreakers();
});

t("judge down (provider error) → lexical + technical only, flagged judge:'unavailable' with BROLL_JUDGE_UNAVAILABLE", async () => {
  resetBreakers();
  resetLimiters();
  await pictures();
  const root = scratch("judge-down");
  const settings = makeSettings(root);
  const project = seededProject(root);
  const judge = fakeJudge({ fail: () => new EditError("LLM_CALL_FAILED", { errorClass: "provider", retryable: true, detail: "upstream 502" }) });
  const [SEARCH, SCORE] = phase5.stages({ fetch: fakeFetch(), callJson: judge, keys: KEYS, cache: false });
  const ctx = stageCtx(root, project, settings);
  await SEARCH.run(ctx);
  const sc = await SCORE.run(ctx);
  assert.ok(judge.calls.length >= 1, "the judge was tried");
  assert.equal(sc.engine, "lexical");
  assert.deepEqual(sc.fallbacks, ["judge_unavailable"]);
  assert.ok(sc.notices.some((n) => n.code === "BROLL_JUDGE_UNAVAILABLE"));
  assert.equal(sc.costUsd, 0);
  const summary = readJ(root, "analysis/broll_scored.json");
  assert.equal(summary.judge, "unavailable");
  for (const s of summary.slots) {
    assert.equal(s.judge, "unavailable");
    const cand = readJ(root, `broll/candidates/${s.slotId}.json`);
    assert.equal(cand.judge, "unavailable");
    for (const ref of cand.candidates) assert.equal(ref.scores.judgeRelevance, null);
    for (const det of Object.values(cand.details)) if (det.accepted) assert.equal(det.rule, "lexical_only");
  }
  assert.equal(readJ(root, phase5.LEDGER_REL).calls, 0);
  resetBreakers();
});

t("fault point judge:error (and judge:budget) → zero judge calls, lexical-only; judge:invalid_json escalates then degrades", async () => {
  await pictures();
  for (const [token, expectCalls] of [["judge:error", 0], ["judge:budget", 0], ["judge:invalid_json", 0]]) {
    resetBreakers();
    resetLimiters();
    const root = scratch(token.replace(":", "-"));
    const settings = makeSettings(root);
    const project = seededProject(root);
    project.settings.debugFaults = token;
    assert.equal(phase5.judgeFaultMode({ settings, project }), token.split(":")[1]);
    const judge = fakeJudge();
    const [SEARCH, SCORE] = phase5.stages({ fetch: fakeFetch(), callJson: judge, keys: KEYS, cache: false });
    const ctx = stageCtx(root, project, settings);
    await SEARCH.run(ctx);
    const sc = await SCORE.run(ctx);
    assert.equal(judge.calls.length, expectCalls, token);
    assert.equal(sc.engine, "lexical", token);
    assert.ok(sc.notices.some((n) => n.code === "BROLL_JUDGE_UNAVAILABLE"), token);
    if (token === "judge:invalid_json") assert.ok(sc.notices.some((n) => n.code === "JUDGE_ESCALATED"), sc.notices.map((n) => n.code).join(","));
  }
  // Production ignores the token.
  assert.equal(phase5.judgeFaultMode({ settings: { faults: { allow: false } }, project: { settings: { debugFaults: "judge:error" } } }), null);
  resetBreakers();
});

t("an unexpected scoring failure degrades to an empty summary with notices instead of failing the project", async () => {
  const root = scratch("degrade");
  const settings = makeSettings(root);
  const project = seededProject(root);
  const [SEARCH, SCORE] = phase5.stages({ fetch: fakeFetch(), callJson: fakeJudge(), keys: KEYS, cache: false });
  const ctx = stageCtx(root, project, settings);
  await SEARCH.run(ctx);
  const broken = stageCtx(root, project, settings, { abs: () => { throw new EditError("DISK_WEIRD", { errorClass: "resource" }); } });
  const sc = await SCORE.run(broken);
  assert.equal(sc.engine, "none");
  assert.deepEqual(sc.fallbacks, ["error:DISK_WEIRD"]);
  assert.ok(sc.notices.some((n) => n.code === "BROLL_UNAVAILABLE"));
  assert.equal(readJ(root, "analysis/broll_scored.json").degraded, "DISK_WEIRD");
  // A transient error on an early attempt is left to the runner's retries.
  const transient = stageCtx(root, project, settings, { attempt: 1, abs: () => { throw new EditError("FLAKY", { errorClass: "transient" }); } });
  await rejects(() => SCORE.run(transient), (e2) => assert.equal(e2.code, "FLAKY"));
});

// =====================================================================================================
section("acquire");

const refFor = (provider, providerId, type, over = {}) => ({
  assetId: assetIdFor(provider, providerId), provider, providerId: String(providerId), type, path: null, thumbPath: null,
  sourceUrl: `https://www.${provider}.com/x/${providerId}/`, license: "Pexels License", attribution: "Video by Tester on Pexels",
  width: 1920, height: 1080, durationSec: type === "video" ? 2 : null, trimInSec: 0, dhash: null, tags: [],
  scores: { lexical: 0.5, judgeRelevance: 8, judgeQuality: 7, issues: [], resolution: 1, aspect: 0.5, composition: 0.8, brand: 0.5, duration: 1, diversity: 1, total: 0.7 },
  ...over,
});

t("chooseRendition: smallest covering the profile, else the largest; unknown sizes take the provider's last", async () => {
  const r = [
    { quality: "sd", width: 640, height: 360, link: "https://v.test/sd.mp4" },
    { quality: "hd", width: 1920, height: 1080, link: "https://v.test/hd.mp4" },
    { quality: "uhd", width: 3840, height: 2160, link: "https://v.test/uhd.mp4" },
    { quality: "bad", width: 9999, height: 9999, link: "http://insecure.test/x.mp4" },
  ];
  assert.equal(chooseRendition(r, { targetShort: 540 }).quality, "hd");
  assert.equal(chooseRendition(r, { targetShort: 1080 }).quality, "hd");
  assert.equal(chooseRendition(r, { targetShort: 360 }).quality, "sd");
  assert.equal(chooseRendition([r[0], r[2]], { targetShort: 1080 }).quality, "uhd");
  assert.equal(chooseRendition([r[0]], { targetShort: 1080 }).quality, "sd");
  assert.equal(chooseRendition([{ link: "https://a.test/1" }, { link: "https://a.test/2" }]).link, "https://a.test/2");
  assert.equal(chooseRendition([r[3]]), null);
  assert.equal(targetShortEdge({ profile: "export720" }), 720);
  assert.equal(targetShortEdge({ profile: "export1080", output: { width: 720, height: 1280 } }), 720);
  assert.equal(targetShortEdge({ profile: "export1080", type: "image" }), 1166);
});

t("acquireChosen: real mp4 → assets/broll/<assetId>.mp4 with probed facts + sha1; second call reuses without a request", async () => {
  const dir = scratch("acq-video");
  const settings = makeSettings(dir);
  const clip = makeFixture(path.join(dir, "clip.mp4"), { seconds: 2, size: "640x360" });
  const body = fs.readFileSync(clip);
  const calls = [];
  const fetchImpl = async (url) => { calls.push(url); return bytesResponse(body, "video/mp4"); };
  const ref = refFor("pexels", 101, "video");
  const renditions = [
    { quality: "sd", width: 640, height: 360, link: "https://videos.pexels.test/sd.mp4" },
    { quality: "hd", width: 1280, height: 720, link: "https://videos.pexels.test/hd.mp4" },
  ];
  const res = await acquireChosen({ projectDir: dir, assetRef: ref, profile: "export720", renditions, fetch: fetchImpl, settings, pidFile: null });
  assert.deepEqual(calls, ["https://videos.pexels.test/hd.mp4"]);
  assert.equal(res.reused, false);
  assert.equal(res.assetRef.path, `assets/broll/${ref.assetId}.mp4`);
  assert.equal(res.sha1, crypto.createHash("sha1").update(body).digest("hex"));
  assert.equal(res.bytes, body.length);
  assert.deepEqual([res.assetRef.width, res.assetRef.height], [640, 360], "probed, not the provider's claim");
  near(res.assetRef.durationSec, 2, 0.1);
  assert.equal(res.rendition.quality, "hd");
  AssetRefSchema.parse(res.assetRef);
  assert.ok(fs.existsSync(path.join(dir, res.assetRef.path)));
  assert.deepEqual(fs.readdirSync(path.join(dir, "assets", "broll")).filter((f) => f.endsWith(".part")), []);
  const again = await acquireChosen({ projectDir: dir, assetRef: ref, profile: "export720", renditions, fetch: fetchImpl, settings, pidFile: null });
  assert.equal(again.reused, true);
  assert.equal(calls.length, 1);
  assert.equal(again.sha1, res.sha1);
});

t("acquireChosen rejects an HTML page served as video/mp4, oversize bodies and 4xx; 5xx is transient; nothing is left behind", async () => {
  const dir = scratch("acq-bad");
  const settings = makeSettings(dir);
  const html = Buffer.from(`<!DOCTYPE html><html><body>${"Access denied. ".repeat(900)}</body></html>`);
  const ref = refFor("pixabay", 202, "video");
  const renditions = [{ quality: "large", width: 1920, height: 1080, link: "https://cdn.pixabay.test/v.mp4" }];
  const go = (fetchImpl, extra = {}) => acquireChosen({ projectDir: dir, assetRef: ref, renditions, fetch: fetchImpl, settings, pidFile: null, ...extra });
  await rejects(() => go(async () => bytesResponse(html, "video/mp4")), (e) => {
    assert.equal(e.code, "BROLL_ASSET_REJECTED");
    assert.equal(e.extra.reason, "magic");
    assert.equal(e.errorClass, "provider");
  });
  await rejects(() => go(async () => bytesResponse(html, "text/html")), (e) => assert.equal(e.extra.reason, "content_type"));
  await rejects(() => go(async () => bytesResponse(Buffer.alloc(5000, 1), "video/mp4"), { maxBytes: 1000 }), (e) => assert.equal(e.extra.reason, "too_large"));
  await rejects(() => go(async () => new Response(new Uint8Array(3000), { status: 200, headers: { "content-type": "video/mp4" } }), { maxBytes: 1000 }), (e) => assert.equal(e.extra.reason, "too_large"));
  await rejects(() => go(async () => jsonResponse({}, 404)), (e) => { assert.equal(e.code, "BROLL_ASSET_REJECTED"); assert.equal(e.extra.reason, "http_404"); });
  await rejects(() => go(async () => jsonResponse({}, 503)), (e) => { assert.equal(e.code, "BROLL_DOWNLOAD_FAILED"); assert.equal(e.errorClass, "transient"); });
  await rejects(() => go(async () => { throw new TypeError("socket hang up"); }), (e) => assert.equal(e.extra.reason, "network"));
  await rejects(() => acquireChosen({ projectDir: dir, assetRef: ref, renditions: [], fetch: async () => bytesResponse(html, "video/mp4"), settings }), (e) => assert.equal(e.code, "BROLL_ASSET_UNAVAILABLE"));
  const ac = new AbortController();
  ac.abort();
  await rejects(() => go(async () => bytesResponse(html, "video/mp4"), { signal: ac.signal }), (e) => assert.equal(e.code, "CANCELLED"));
  const left = fs.existsSync(path.join(dir, "assets", "broll")) ? fs.readdirSync(path.join(dir, "assets", "broll")) : [];
  assert.deepEqual(left, [], `left behind: ${left}`);
});

t("acquireChosen stills: a real photo is kept; a flat grey placeholder and a tiny thumbnail are rejected", async () => {
  const dir = scratch("acq-image");
  const settings = makeSettings(dir);
  const photo = path.join(dir, "photo.jpg");
  ff(["-f", "lavfi", "-i", "testsrc2=s=1280x720:r=1", "-frames:v", "1", "-q:v", "3", photo]);
  const grey = path.join(dir, "grey.jpg");
  ff(["-f", "lavfi", "-i", "color=c=0x808080:s=1280x720:r=1", "-frames:v", "1", "-q:v", "3", grey]);
  const tiny = path.join(dir, "tiny.jpg");
  ff(["-f", "lavfi", "-i", "testsrc2=s=320x180:r=1", "-frames:v", "1", "-q:v", "3", tiny]);
  const serve = (file) => async () => bytesResponse(fs.readFileSync(file), "image/jpeg");
  const renditions = [{ quality: "large2x", width: 1280, height: 720, link: "https://images.pexels.test/p.jpeg" }];
  const ok = await acquireChosen({ projectDir: dir, assetRef: refFor("pexels", 303, "image"), renditions, fetch: serve(photo), settings, pidFile: null });
  assert.equal(ok.assetRef.path, `assets/broll/${assetIdFor("pexels", 303)}.jpg`);
  assert.deepEqual([ok.assetRef.width, ok.assetRef.height, ok.assetRef.durationSec], [1280, 720, null]);
  AssetRefSchema.parse(ok.assetRef);
  await rejects(() => acquireChosen({ projectDir: dir, assetRef: refFor("pexels", 304, "image"), renditions, fetch: serve(grey), settings, pidFile: null }),
    (e) => assert.equal(e.extra.reason, "low_information"));
  await rejects(() => acquireChosen({ projectDir: dir, assetRef: refFor("pexels", 305, "image"), renditions, fetch: serve(tiny), settings, pidFile: null }),
    (e) => assert.equal(e.extra.reason, "resolution"));
  await rejects(() => acquireChosen({ projectDir: dir, assetRef: refFor("pexels", 306, "image"), renditions, fetch: async () => bytesResponse(fs.readFileSync(photo), "video/mp4"), settings, pidFile: null }),
    (e) => assert.equal(e.extra.reason, "content_type"));
});

t("acquireChosen finds renditions for a scored candidate from broll/candidates (no renditions passed)", async () => {
  const { dir, e } = state.happy;
  const summary = readJ(dir, "analysis/broll_scored.json");
  let ref = null;
  for (const s of summary.slots) {
    ref = readJ(dir, `broll/candidates/${s.slotId}.json`).candidates.find((c) => c.type === "video" && c.provider === "pexels");
    if (ref) break;
  }
  assert.ok(ref, "a scored pexels video exists");
  const clip = makeFixture(path.join(scratch("clip2"), "clip.mp4"), { seconds: 2, size: "480x270" });
  const urls = [];
  const res = await acquireChosen({
    projectDir: dir, assetRef: ref, profile: "export1080", settings: e.settings, pidFile: null,
    fetch: async (url) => { urls.push(url); return bytesResponse(fs.readFileSync(clip), "video/mp4"); },
  });
  assert.equal(urls.length, 1);
  assert.match(urls[0], /^https:\/\//);
  assert.equal(res.assetRef.assetId, ref.assetId);
  assert.ok(fs.existsSync(path.join(dir, res.assetRef.path)));
});

// =====================================================================================================
section("candidates helpers");

t("listCandidates: by slot or BrollItem id, ≤ 20, media keys only — no server path anywhere; resolveThumbFile maps keys back", async () => {
  const { e, p, dir } = state.happy;
  const project = { id: p.id, settings: e.store.get(p.id).settings };
  const summary = readJ(dir, "analysis/broll_scored.json");
  const slot = summary.slots.find((s) => s.top.length > 1) || summary.slots[0];
  const list = listCandidates(project, slot.slotId, { projectDir: dir });
  assert.equal(list.slotId, slot.slotId);
  assert.ok(list.candidates.length > 0 && list.candidates.length <= 20);
  const json = JSON.stringify(list);
  for (const bad of [dir, tmp.dir, dir.split(path.sep).join("/"), "broll/thumbs", "thumbPath", "frames", "assets/broll"]) {
    assert.ok(!json.includes(bad), `leaks ${bad}`);
  }
  assert.ok(!/(^|[^A-Za-z])[A-Za-z]:(\\\\|\/(?!\/))/.test(json), "no drive letters");
  assert.ok(!/\\\\/.test(json), "no backslashes");
  for (const c of list.candidates) {
    assert.ok(c.thumbKey && KEY_RE.test(c.thumbKey), `thumbKey ${c.thumbKey}`);
    const thumb = resolveThumbFile(project, c.thumbKey, { projectDir: dir });
    assert.ok(thumb && /^broll\/thumbs\//.test(thumb.rel) && fs.existsSync(path.join(dir, thumb.rel)));
    assert.match(thumb.contentType, /^image\//);
    for (const u of [c.sourceUrl, c.previewUrl, c.author && c.author.url].filter(Boolean)) assert.match(u, /^https:\/\//);
    assert.ok(c.score.total != null && c.license);
  }
  const plan = { broll: [{ id: "br_0001", sentenceId: slot.sentenceId, candidateSetId: null, status: "ok", chosen: { assetId: list.candidates[0].id } }] };
  const byItem = listCandidates(project, "br_0001", { projectDir: dir, plan });
  assert.equal(byItem.slotId, slot.slotId);
  assert.equal(byItem.candidates[0].used, true);
  assert.ok(byItem.candidates.slice(1).every((c) => !c.used));
  assert.equal(listCandidates(project, slot.slotId, { projectDir: dir, limit: 1 }).candidates.length, 1);
  for (const bad of ["../analysis/broll_scored", "nope", "br_missing", "", null]) {
    assert.throws(() => listCandidates(project, bad, { projectDir: dir, plan }), (err) => err.code === "NOT_FOUND");
  }
  for (const bad of ["../../project", "UPPER", "a/b", "ast_does_not_exist"]) assert.equal(resolveThumbFile(project, bad, { projectDir: dir }), null);
  state.plan = plan;
  state.slot = slot;
});

t("searchCandidates: editor search → scored user slot (≤ 8, judged), persisted, pipeline summary untouched, no paths", async () => {
  const { e, p, dir } = state.happy;
  resetBreakers();
  resetLimiters();
  const project = { id: p.id, settings: e.store.get(p.id).settings };
  const scoredSha = shaOf(path.join(dir, "analysis/broll_scored.json"));
  const fetchImpl = fakeFetch();
  const judge = fakeJudge();
  const limited = [];
  const r = await searchCandidates(project, { query: "fresh bread in an oven", kind: "video", itemId: "br_0001" }, {
    projectDir: dir, plan: state.plan, settings: e.settings, fetch: fetchImpl, callJson: judge, keys: KEYS, cache: false,
    output: { aspect: "9:16", width: 1080, height: 1920 }, sentenceText: "We bake every loaf at dawn.",
    rateLimit: async (info) => { limited.push(info); },
  });
  assert.equal(limited.length, 1);
  assert.match(r.slotId, /^us_[0-9a-f]{12}$/);
  assert.equal(r.judge, "ok");
  assert.equal(judge.calls.length, 1);
  near(r.costUsd, 0.0006);
  assert.ok(r.candidates.length > 0 && r.candidates.length <= 8);
  assert.ok(fs.existsSync(path.join(dir, "broll", "candidates", `${r.slotId}.json`)));
  assert.ok(fs.existsSync(path.join(dir, "broll", "user_searches", `${r.slotId}.json`)));
  assert.ok(readJ(dir, USER_SLOTS_REL).slots.some((s) => s.slotId === r.slotId && s.itemId === "br_0001"));
  assert.equal(shaOf(path.join(dir, "analysis/broll_scored.json")), scoredSha, "pipeline summary untouched");
  const json = JSON.stringify(r);
  assert.ok(!json.includes(dir), "no project dir");
  assert.ok(!json.includes("broll/thumbs"), "no thumb path");
  assert.ok(!/(^|[^A-Za-z])[A-Za-z]:(\\\\|\/(?!\/))/.test(json), "no drive letters");
  assert.equal(listCandidates(project, r.slotId, { projectDir: dir }).candidates.length, r.candidates.length);

  const noJudge = fakeJudge();
  const r2 = await searchCandidates(project, { query: "customers queue", kind: "either", judge: false }, {
    projectDir: dir, settings: e.settings, fetch: fakeFetch(), callJson: noJudge, keys: KEYS, cache: false, output: { aspect: "9:16", width: 1080, height: 1920 },
  });
  assert.equal(noJudge.calls.length, 0);
  assert.equal(r2.judge, "unavailable");
  assert.ok(!r2.notices.some((n) => n.code === "BROLL_JUDGE_UNAVAILABLE"));
  await rejects(() => searchCandidates(project, { query: "x" }, { projectDir: dir, settings: e.settings, fetch: fakeFetch(), keys: KEYS, cache: false }),
    (err) => assert.equal(err.code, "VALIDATION_FAILED"));
});

// =====================================================================================================
section("credits");

t("credits: every used third-party asset once (removed/missing/user skipped), author links from details, no line injection", async () => {
  const pex = refFor("pexels", 1, "video", { attribution: "Video by Mikhail Nilov on Pexels", sourceUrl: "https://www.pexels.com/video/bread-1/", license: "Pexels License" });
  const pix = refFor("pixabay", 2, "image", { attribution: "Image by jdoe from Pixabay", sourceUrl: "https://pixabay.com/photos/queue-2/", license: "Pixabay Content License" });
  const ov = refFor("openverse", "abc", "image", { attribution: "\"Bakery\" by Ann is licensed under CC BY 2.0.", sourceUrl: "https://www.flickr.com/photos/ann/3", license: "CC BY 2.0" });
  const removed = refFor("pexels", 9, "video", { attribution: "Video by Nobody on Pexels" });
  const plan = {
    broll: [
      { id: "b1", status: "ok", chosen: pex }, { id: "b2", status: "pending", chosen: pix }, { id: "b3", status: "removed", chosen: removed },
      { id: "b4", status: "ok", chosen: pex }, { id: "b5", status: "ok", chosen: ov }, { id: "b6", status: "missing", chosen: null },
      { id: "b7", status: "ok", chosen: { ...pex, assetId: "ast_user0001", provider: "user" } },
    ],
    music: { enabled: true, track: { provider: "pixabay_bridge", title: "Warm Morning", license: "Pixabay Content License", sourceUrl: "https://pixabay.com/music/warm-7/" } },
    sfx: [
      { enabled: true, cue: "whoosh", attribution: "Whoosh by Foley Co\nInjected: line", license: "CC BY 4.0" },
      { enabled: true, cue: "pop", attribution: null, license: "CC0" },
      { enabled: false, cue: "ding", attribution: "Ding by X", license: "CC BY 4.0" },
    ],
  };
  const details = { [pex.assetId]: { author: { name: "Mikhail Nilov", url: "https://www.pexels.com/@mikhail-nilov" } } };
  const { lines, counts } = buildCreditLines(plan, { details });
  assert.deepEqual(counts, { broll: 3, music: 1, sfx: 1 });
  assert.deepEqual(lines, [
    "Credits",
    "",
    "Stock footage and images:",
    "- Video by Mikhail Nilov (https://www.pexels.com/@mikhail-nilov) on Pexels — https://www.pexels.com/video/bread-1/ — Pexels License",
    "- Image by jdoe on Pixabay — https://pixabay.com/photos/queue-2/ — Pixabay Content License",
    "- \"Bakery\" by Ann is licensed under CC BY 2.0. — https://www.flickr.com/photos/ann/3",
    "",
    "Music:",
    "- Warm Morning — Pixabay — Pixabay Content License — https://pixabay.com/music/warm-7/",
    "",
    "Sound effects:",
    "- Whoosh by Foley Co Injected: line (whoosh) — CC BY 4.0",
    "",
  ]);
  assert.deepEqual(buildCreditLines({ broll: [], sfx: [] }).lines, ["Credits", "", "No third-party media was used in this video.", ""]);

  const dir = scratch("credits");
  fs.mkdirSync(path.join(dir, "broll", "candidates"), { recursive: true });
  fs.writeFileSync(path.join(dir, "broll", "candidates", "sl_s1.json"), JSON.stringify({ candidates: [], details: { [pix.assetId]: { author: { name: "Jane Doe", url: "https://pixabay.com/users/jdoe-42/" } } } }));
  const w = writeCredits(plan, dir);
  assert.equal(w.path, "credits.txt");
  const body = fs.readFileSync(path.join(dir, "credits.txt"), "utf8");
  assert.ok(body.endsWith("CC BY 4.0\n"));
  assert.ok(body.includes("- Image by Jane Doe (https://pixabay.com/users/jdoe-42/) on Pixabay"), body);
  assert.ok(!/^Injected/m.test(body));
  assert.equal(body.split("\n").length, 13);
});

t("offline: the global fetch was never called", async () => {
  assert.equal(globalFetchCalls, 0);
});

run().finally(async () => {
  for (const e of opened) {
    try { await e.runner.stopAll({ timeoutMs: 2000 }); } catch { /* noop */ }
    try { e.store.close(); } catch { /* noop */ }
  }
  restoreFetch();
  tmp.cleanup();
  setTimeout(() => process.exit(process.exitCode || 0), 50).unref();
});
