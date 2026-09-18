// Tests for the AI Video Edit editing API (Phase 4b): editing/handlers.js, editing/context.js,
// editing/settings_patch.js, views_plan.js and their wiring in routes.js.
// Run: node scripts/video_edit_plan_routes.test.cjs   (offline: loopback HTTP only, fetch tripwire, temp dirs; < 60 s)
//
// Load-bearing assertions:
//  - GET /:id/plan never leaks a file path, a hash (sha1 chunk keys, dHashes, card hashes, prompt hashes), a server
//    directory or the temp root — deep-scanned over plan + outline — and B-roll thumbnails are media URLs the
//    media route actually serves.
//  - POST /:id/ops: r1 → r2 changes the outline and publishes SSE `plan`; a stale expectedRevision is 409 with the
//    head; an invalid op is 422 naming its index and changes nothing; a replayed batchId returns the original
//    response without a new revision; two concurrent batches on the same head serialize (one 200, one 409).
//  - undo / redo create new revisions whose outline equals their target.
//  - POST /:id/settings: an intensity change re-plans through ops with ZERO model calls; a spoken-language change is
//    409 REANALYZE_REQUIRED until confirmed, then 202 + runner.retry(force) from TRANSCRIBING.
//  - Gates: anonymous 401, other user 404, evil Origin 403, ops flood 429, PROCESSING 409, RENDERING edits mark exports
//    stale, COMPLETED edits return to READY.
//  - Candidates: whitelisted views with thumb URLs; search is 202 + SSE `candidates`; a missing B-roll module is 501.

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { createHarness, mkTmp, makeSettings, installFetchTripwire, silentLog } = require("./lib/video_edit_test_utils.cjs");

const tmp = mkTmp("ve-plan-routes-");
process.env.VIDEO_EDIT_DIR = path.join(tmp.dir, "_guard", "edits");
process.env.VIDEO_EDIT_INDEX = path.join(tmp.dir, "_guard", "video-edits.json");

const express = require("express");
const routes = require("../src/video_edit/routes");
const { createStore } = require("../src/video_edit/store");
const { createEventBus } = require("../src/video_edit/events");
const { DEFAULT_SETTINGS } = require("../src/video_edit/settings_schema");
const { resolvePlan } = require("../src/video_edit/plan/resolve");
const Rev = require("../src/video_edit/plan/revisions");
const realCandidates = require("../src/video_edit/broll/candidates");
const { computeSettingsChange, needsContentVerdicts } = require("../src/video_edit/editing/settings_patch");
const { createContextLoader } = require("../src/video_edit/editing/context");

const { t, section, run } = createHarness();
const restoreFetch = installFetchTripwire();
const noop = () => {};

// ---- fixtures -----------------------------------------------------------------------------------
const FIX = path.join(__dirname, "fixtures", "video_edit");
const load = (n) => JSON.parse(fs.readFileSync(path.join(FIX, `talking_head_45s.${n}.json`), "utf8"));
const WORDS_DOC = load("transcript.words");
const TRANSCRIPT = load("transcript");
const FACES = load("faces");
const CONTENT = load("content");
const AUDIO = load("audio");
const PLAN_RAW = load("plan");
const NOW = 1757800100000;
const clone = (v) => JSON.parse(JSON.stringify(v));

const USERS = { "user-1": { id: "user-1" }, "user-2": { id: "user-2" } };
const readUserId = (req) => {
  const m = /(?:^|;\s*)ve_test_user=([^;]+)/.exec(String(req.headers.cookie || ""));
  return m ? decodeURIComponent(m[1]) : null;
};
const findUserById = (id) => USERS[id] || null;
const ENV = Object.freeze({ NODE_ENV: "test", OPENROUTER_API_KEY: "test-openrouter-key", SECRET_KEY: "plan-routes-test-secret" });
const TOOLS_OK = async () => ({ ffmpeg: "8.0", ffprobe: "8.0" });
const CONSENT = { consent: { thirdPartyAi: true, termsVersion: "2026-09" } };
const PIPELINE = ["VALIDATING", "COMPRESSING", "EXTRACTING_AUDIO", "TRANSCRIBING", "ANALYZING_VIDEO", "ANALYZING_CONTENT", "SEARCHING_BROLL", "SCORING_ASSETS", "BUILDING_EDIT_PLAN"];

function makeRunnerStub() {
  const calls = { retry: [], enqueue: [] };
  return {
    calls,
    async enqueuePipeline(id, opts) { calls.enqueue.push({ id, opts }); return { runId: "run_stub0001", queuePosition: 1, done: Promise.resolve({}) }; },
    async cancel() { return { cancelled: true, forced: false, wasQueued: false }; },
    async retry(id, opts) { calls.retry.push({ id, opts }); return { fromStage: opts.stage, runId: "run_stub0002", done: Promise.resolve({}) }; },
    async abort() { return false; },
    isActive: () => false,
    activeIds: () => [],
    planStages: () => ({ runnable: PIPELINE, partial: false }),
    async stopAll() { return { stopped: 0, timedOut: false }; },
  };
}

const servers = [];
function serve(router) {
  const app = express();
  app.use("/api/video-edits", express.json({ limit: "256kb" }));
  app.use("/api/video-edits", router);
  app.use("/api/video-edits", routes.jsonErrorHandler({ log: silentLog }));
  const server = http.createServer(app);
  servers.push(server);
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));
}

async function makeEnv(name, { videoEdit, deps = {} } = {}) {
  const root = path.join(tmp.dir, name);
  const settings = makeSettings(root, { videoEdit });
  const store = createStore({ settings, log: silentLog });
  store.init();
  const events = createEventBus({ store, settings });
  const runner = makeRunnerStub();
  const router = routes.buildRouter({
    settings, store, events, runner, readUserId, findUserById, env: ENV, log: silentLog, toolVersions: TOOLS_OK, statfsFreeMb: () => 500000, ...deps,
  });
  const port = await serve(router);
  return { name, root, settings, store, events, runner, router, port };
}

function request(port, { method = "GET", path: p, headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const h = { ...headers };
    if (body != null) h["content-length"] = body.length;
    const req = http.request({ host: "127.0.0.1", port, method, path: p, headers: h, agent: false }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("error", noop);
      res.on("end", () => {
        const buf = Buffer.concat(chunks);
        let json = null;
        try { json = JSON.parse(buf.toString("utf8")); } catch { json = null; }
        resolve({ status: res.statusCode, headers: res.headers, buf, text: buf.toString("utf8"), json });
      });
    });
    req.setTimeout(60000, () => req.destroy(new Error("request timeout")));
    req.on("error", reject);
    if (body != null) req.write(body);
    req.end();
  });
}

function api(e, method, p, { user = null, json, headers = {} } = {}) {
  const h = { ...(user ? { cookie: `ve_test_user=${encodeURIComponent(user)}` } : {}), ...headers };
  let body = null;
  if (json !== undefined) { body = Buffer.from(JSON.stringify(json)); h["content-type"] = "application/json"; }
  return request(e.port, { method, path: `/api/video-edits${p}`, headers: h, body });
}

function expectJsonError(r, status, code) {
  assert.strictEqual(r.status, status, `expected ${status} ${code}, got ${r.status} ${r.text.slice(0, 300)}`);
  assert(r.json, `non-JSON body: ${r.text.slice(0, 120)}`);
  assert.strictEqual(r.json.error, code, r.text.slice(0, 300));
  assert.strictEqual(typeof r.json.retryable, "boolean");
  assert(!/at .+\(.+:\d+:\d+\)/.test(r.text), "stack trace leaked");
}

async function waitFor(fn, { timeoutMs = 10000, label = "condition" } = {}) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > timeoutMs) throw new Error(`timed out waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}

const writeJson = (dir, rel, obj) => { const f = path.join(dir, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(obj)); };

let seedN = 0;
async function seedEdit(e, ownerId, { status = "READY", analysis = true, plan = true } = {}) {
  const p = e.store.createProject({ ownerId, settings: { ...clone(DEFAULT_SETTINGS), ...CONSENT }, consent: CONSENT.consent });
  seedN++;
  const staged = path.join(e.settings.paths.stagingDir, `seed-${seedN}.upload`);
  fs.mkdirSync(path.dirname(staged), { recursive: true });
  fs.writeFileSync(staged, Buffer.alloc(1024, 7));
  await e.store.attachSource(p.id, {
    stagedPath: staged, sha256: "a".repeat(64), sizeBytes: 1024, demuxer: "mov", displayName: "talk.mp4",
    probe: { durationSec: 44.5, video: { codec: "h264", width: 1080, height: 1920, fps: 30 }, audio: [{ codec: "aac", channels: 2, sampleRate: 48000 }] },
  });
  const dir = e.store.projectDir(p.id);
  if (analysis) {
    writeJson(dir, "analysis/transcript.json", TRANSCRIPT);
    writeJson(dir, "analysis/transcript.words.json", WORDS_DOC);
    writeJson(dir, "analysis/faces.json", FACES);
    writeJson(dir, "analysis/content.json", CONTENT);
    writeJson(dir, "analysis/audio.json", AUDIO);
    const item = PLAN_RAW.broll[0];
    writeJson(dir, `broll/candidates/${item.candidateSetId}.json`, {
      schemaVersion: 1, slotId: item.candidateSetId, sentenceId: item.sentenceId, judge: "ok", bestAssetId: item.chosen.assetId,
      queries: item.queries, candidates: item.topCandidates, details: { [item.chosen.assetId]: { accepted: true, letter: "A" } },
    });
    fs.mkdirSync(path.join(dir, "broll", "thumbs"), { recursive: true });
    fs.writeFileSync(path.join(dir, item.chosen.thumbPath), Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(600, 3)]));
  }
  await e.store.setStatus(p.id, "PROCESSING");
  if (plan) {
    const raw = clone(PLAN_RAW);
    raw.projectId = p.id;
    const resolved = resolvePlan(raw, { words: WORDS_DOC.words, sentences: TRANSCRIPT.sentences, faces: FACES, mezz: { w: 1080, h: 1920 }, now: NOW });
    await Rev.commitRevision({ store: e.store, projectId: p.id, plan: resolved, author: "director", summary: "AI edit", expectedRevision: 0, now: NOW });
  }
  if (status === "PROCESSING") return e.store.get(p.id);
  await e.store.setStatus(p.id, "READY");
  if (status === "RENDERING" || status === "COMPLETED") await e.store.setStatus(p.id, "RENDERING");
  if (status === "COMPLETED") await e.store.setStatus(p.id, "COMPLETED");
  return e.store.get(p.id);
}

const opsBody = (expectedRevision, batchId, ops, extra = {}) => ({ expectedRevision, batchId, ops, ...extra });
const head = (e, id) => e.store.get(id).plan.headRevision;

// Deep scan: forbidden keys anywhere, path-like / server-dir / temp-root / hash-like strings anywhere.
const FORBIDDEN_KEYS = new Set(["path", "thumbPath", "sha1", "sha256", "mapHash", "chunkKey", "cardHash", "dhash", "ttf", "transcriptHash", "promptHash", "sourceHash", "tags", "detail", "file", "analysisVersion"]);
function scanDeep(obj) {
  const tmpA = tmp.dir.toLowerCase();
  const tmpB = tmpA.replace(/\\/g, "/");
  const problems = [];
  const walk = (v, where) => {
    if (Array.isArray(v)) { v.forEach((x, i) => walk(x, `${where}[${i}]`)); return; }
    if (v && typeof v === "object") {
      for (const [k, x] of Object.entries(v)) {
        if (FORBIDDEN_KEYS.has(k)) problems.push(`${where}.${k}: forbidden key`);
        walk(x, `${where}.${k}`);
      }
      return;
    }
    if (typeof v !== "string") return;
    const s = v.toLowerCase();
    // Drive letters are a SINGLE leading letter ("c:/…", "C:\…"); unanchored it also matched every
    // "https://…", and API.md §3 keeps `previewUrl` in the candidates view on purpose.
    if (/^[a-z]:[\\/]/.test(s) || s.includes("\\")) problems.push(`${where}: path-like '${v.slice(0, 60)}'`);
    if (s.includes("/edits/") || s.includes("server")) problems.push(`${where}: server dir '${v.slice(0, 60)}'`);
    if (s.includes(tmpA) || s.includes(tmpB)) problems.push(`${where}: temp root`);
    if (/^(assets|broll|render|analysis|work|source)\//.test(s)) problems.push(`${where}: project-relative path '${v}'`);
    if (/\b[0-9a-f]{32,}\b/.test(s)) problems.push(`${where}: hash-like '${v.slice(0, 70)}'`);
  };
  walk(obj, "view");
  return problems;
}

let main = null;
let limited = null;

// =================================================================================================
section("reads");

t("GET plan: envelope + outline; no paths, hashes or server dirs anywhere in plan/outline; thumbnails are servable media URLs", async () => {
  main = await makeEnv("main");
  const p = await seedEdit(main, "user-1");
  const r = await api(main, "GET", `/${p.id}/plan`, { user: "user-1" });
  assert.strictEqual(r.status, 200, r.text.slice(0, 300));
  assert.strictEqual(r.json.revision, 1);
  assert.match(r.json.hash, /^[0-9a-f]{64}$/);
  assert.strictEqual(r.json.isHead, true);
  assert.strictEqual(r.json.author, "director");
  assert.strictEqual(r.json.canUndo, false);
  assert(r.json.outline && r.json.outline.tracks.broll.length === 3, "outline lists B-roll");
  assert.deepStrictEqual(scanDeep({ plan: r.json.plan, outline: r.json.outline }), []);
  assert(!r.text.toLowerCase().includes(tmp.dir.toLowerCase()) && !r.text.includes("/edits/"), "raw body leaks no directory");
  assert.deepStrictEqual(Object.keys(r.json.plan.source).sort(), ["durationSec", "fps", "height", "language", "timing", "width"]);
  const chosen = r.json.plan.broll[0].chosen;
  assert.strictEqual(chosen.thumbUrl, `/api/video-edits/${p.id}/media/broll-thumb/${chosen.assetId}`);
  assert.strictEqual(chosen.downloaded, true);
  assert.strictEqual(typeof r.json.plan.graphics[0].render.ready, "boolean");
  assert(r.json.plan.cuts.length === 12 && r.json.plan.captions.cues.length > 0, "plan content intact");
  const thumb = await request(main.port, { path: chosen.thumbUrl, headers: { cookie: "ve_test_user=user-1" } });
  assert.strictEqual(thumb.status, 200);
  assert.match(String(thumb.headers["content-type"]), /image\/jpeg/);
  expectJsonError(await request(main.port, { path: `/api/video-edits/${p.id}/media/broll-thumb/ast_unknown`, headers: { cookie: "ve_test_user=user-1" } }), 404, "NOT_FOUND");
  expectJsonError(await api(main, "GET", `/${p.id}/plan?rev=2`, { user: "user-1" }), 404, "NOT_FOUND");
  expectJsonError(await api(main, "GET", `/${p.id}/plan?rev=abc`, { user: "user-1" }), 400, "VALIDATION_FAILED");
  const byRev = await api(main, "GET", `/${p.id}/plan?rev=1`, { user: "user-1" });
  assert.deepStrictEqual(byRev.json.outline, r.json.outline);
});

t("GET plan/revisions: head, hashes and undo/redo flags", async () => {
  const p = await seedEdit(main, "user-1");
  const r = await api(main, "GET", `/${p.id}/plan/revisions`, { user: "user-1" });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.json.head, 1);
  assert.strictEqual(r.json.revisions.length, 1);
  assert.deepStrictEqual(Object.keys(r.json.revisions[0]).sort(), ["author", "createdAt", "hash", "opsCount", "parent", "rev", "summary"]);
  assert.strictEqual(r.json.canUndo, false);
  assert.strictEqual(r.json.canRedo, false);
});

t("GET transcript: words with sentence ids, filler flags and cut state from the head plan; paging; NOT_READY without a transcript", async () => {
  const p = await seedEdit(main, "user-1");
  const r = await api(main, "GET", `/${p.id}/transcript`, { user: "user-1" });
  assert.strictEqual(r.status, 200, r.text.slice(0, 200));
  assert.strictEqual(r.json.totalWords, WORDS_DOC.words.length);
  assert.strictEqual(r.json.words.length, WORDS_DOC.words.length);
  assert.strictEqual(r.json.language, "en");
  assert.strictEqual(r.json.planRevision, 1);
  assert(r.json.words.every((w) => typeof w.sentenceId === "string"), "every word has a sentence");
  assert(r.json.words.some((w) => w.isFiller), "fillers flagged");
  assert(r.json.words.some((w) => w.cut && /^cut_/.test(w.cutId)), "some words are cut by the head plan");
  assert(r.json.words.some((w) => !w.cut), "most words are kept");
  assert.strictEqual(r.json.sentences.length, TRANSCRIPT.sentences.length);
  assert(r.json.sentences.every((s) => ["none", "partial", "full"].includes(s.cut)));
  assert.deepStrictEqual(scanDeep(r.json), []);
  const page = await api(main, "GET", `/${p.id}/transcript?offset=120&limit=50`, { user: "user-1" });
  assert.strictEqual(page.json.words.length, WORDS_DOC.words.length - 120);
  assert.strictEqual(page.json.nextOffset, null);
  assert.strictEqual(page.json.words[0].i, 120);
  const first = await api(main, "GET", `/${p.id}/transcript?limit=50`, { user: "user-1" });
  assert.strictEqual(first.json.nextOffset, 50);
  expectJsonError(await api(main, "GET", `/${p.id}/transcript?limit=0`, { user: "user-1" }), 400, "VALIDATION_FAILED");
  const bare = await seedEdit(main, "user-1", { analysis: false, plan: false });
  const nr = await api(main, "GET", `/${bare.id}/transcript`, { user: "user-1" });
  expectJsonError(nr, 409, "NOT_READY");
  assert.strictEqual(nr.json.details.reason, "NO_TRANSCRIPT");
  expectJsonError(await api(main, "GET", `/${bare.id}/plan`, { user: "user-1" }), 409, "NOT_READY");
});

// =================================================================================================
section("ops · undo · redo");

let opsProject = null;
let firstResponse = null;

t("ops happy path r1 → r2: outline changes, SSE plan event, head moves, returnPlan is whitelisted", async () => {
  opsProject = await seedEdit(main, "user-1");
  const id = opsProject.id;
  const seen = [];
  const unsubscribe = main.events.subscribe(id, (evt) => seen.push(evt));
  const before = await api(main, "GET", `/${id}/plan`, { user: "user-1" });
  const r = await api(main, "POST", `/${id}/ops`, { user: "user-1", json: opsBody(1, "b-remove-1", [{ type: "broll.remove", id: "br_0001" }], { returnPlan: true }) });
  unsubscribe();
  assert.strictEqual(r.status, 200, r.text.slice(0, 400));
  firstResponse = r.json;
  assert.strictEqual(r.json.revision, 2);
  assert.match(r.json.hash, /^[0-9a-f]{64}$/);
  assert.strictEqual(r.json.applied, 1);
  assert.strictEqual(r.json.replayed, false);
  assert.strictEqual(r.json.invalidates.level, "COMPOSITE");
  assert.strictEqual(r.json.canUndo, true);
  assert.strictEqual(r.json.summary, "Remove B-roll");
  assert.strictEqual(r.json.outline.tracks.broll.length, before.json.outline.tracks.broll.length - 1);
  assert(r.json.outline.summary.brollCount < before.json.outline.summary.brollCount);
  assert.notDeepStrictEqual(r.json.outline, before.json.outline);
  assert.strictEqual(r.json.plan.revision, 2);
  assert.strictEqual(r.json.plan.broll.find((b) => b.id === "br_0001").status, "removed");
  assert.deepStrictEqual(scanDeep({ plan: r.json.plan, outline: r.json.outline, warnings: r.json.warnings, costEvents: r.json.costEvents }), []);
  assert.strictEqual(head(main, id), 2);
  const evt = seen.find((x) => x.type === "plan");
  assert(evt, "SSE plan event published");
  assert.strictEqual(evt.data.headRevision, 2);
  assert.strictEqual(evt.data.headHash, r.json.hash);
  assert.strictEqual(evt.data.author, "user");
});

t("409 REVISION_CONFLICT carries the head revision", async () => {
  const r = await api(main, "POST", `/${opsProject.id}/ops`, { user: "user-1", json: opsBody(1, "b-stale", [{ type: "broll.remove", id: "br_0002" }]) });
  expectJsonError(r, 409, "REVISION_CONFLICT");
  assert.strictEqual(r.json.details.headRevision, 2);
  assert.strictEqual(head(main, opsProject.id), 2);
});

t("422 INVALID_OP names the failing op index and commits nothing", async () => {
  const r = await api(main, "POST", `/${opsProject.id}/ops`, {
    user: "user-1",
    json: opsBody(2, "b-invalid", [{ type: "broll.remove", id: "br_0002" }, { type: "cut.toggle", cutId: "cut_nope", enabled: true }]),
  });
  expectJsonError(r, 422, "INVALID_OP");
  assert.strictEqual(r.json.details.index, 1);
  assert.strictEqual(typeof r.json.details.reason, "string");
  assert.strictEqual(head(main, opsProject.id), 2);
  const unknown = await api(main, "POST", `/${opsProject.id}/ops`, { user: "user-1", json: opsBody(2, "b-unknown", [{ type: "nope.op" }]) });
  expectJsonError(unknown, 422, "INVALID_OP");
  assert.strictEqual(unknown.json.details.index, 0);
});

t("batchId replay returns the original response and creates no revision", async () => {
  const r = await api(main, "POST", `/${opsProject.id}/ops`, { user: "user-1", json: opsBody(1, "b-remove-1", [{ type: "broll.remove", id: "br_0001" }]) });
  assert.strictEqual(r.status, 200, r.text.slice(0, 300));
  assert.strictEqual(r.json.replayed, true);
  assert.strictEqual(r.json.revision, firstResponse.revision);
  assert.strictEqual(r.json.hash, firstResponse.hash);
  assert.deepStrictEqual(r.json.invalidates, firstResponse.invalidates);
  assert.deepStrictEqual(r.json.outline, firstResponse.outline);
  assert.strictEqual(r.json.applied, 1);
  assert.strictEqual(head(main, opsProject.id), 2);
});

t("undo / redo create new revisions equal to their targets; nothing left → 409", async () => {
  const id = opsProject.id;
  const r1 = await api(main, "GET", `/${id}/plan?rev=1`, { user: "user-1" });
  const u = await api(main, "POST", `/${id}/undo`, { user: "user-1", json: { expectedRevision: 2 } });
  assert.strictEqual(u.status, 200, u.text.slice(0, 300));
  assert.strictEqual(u.json.revision, 3);
  assert.deepStrictEqual(u.json.outline, r1.json.outline);
  assert.strictEqual(u.json.canRedo, true);
  assert.strictEqual(u.json.label, "Remove B-roll");
  assert.strictEqual(typeof u.json.invalidates.level, "string");
  const staleUndo = await api(main, "POST", `/${id}/undo`, { user: "user-1", json: { expectedRevision: 2 } });
  expectJsonError(staleUndo, 409, "REVISION_CONFLICT");
  const rd = await api(main, "POST", `/${id}/redo`, { user: "user-1", json: { expectedRevision: 3, batchId: "redo-1" } });
  assert.strictEqual(rd.status, 200, rd.text.slice(0, 300));
  assert.strictEqual(rd.json.revision, 4);
  assert.deepStrictEqual(rd.json.outline, firstResponse.outline);
  assert.strictEqual(rd.json.canRedo, false);
  const replay = await api(main, "POST", `/${id}/redo`, { user: "user-1", json: { expectedRevision: 3, batchId: "redo-1" } });
  assert.strictEqual(replay.status, 200);
  assert.strictEqual(replay.json.replayed, true);
  assert.strictEqual(replay.json.revision, 4);
  expectJsonError(await api(main, "POST", `/${id}/redo`, { user: "user-1", json: { expectedRevision: 4 } }), 409, "NOTHING_TO_REDO");
  const hist = await api(main, "GET", `/${id}/plan/revisions`, { user: "user-1" });
  assert.deepStrictEqual(hist.json.revisions.map((x) => x.rev), [4, 3, 2, 1]);
});

t("concurrent ops on the same head serialize: one commits, the other gets 409", async () => {
  const p = await seedEdit(main, "user-1");
  const [a, b] = await Promise.all([
    api(main, "POST", `/${p.id}/ops`, { user: "user-1", json: opsBody(1, "race-a", [{ type: "broll.remove", id: "br_0001" }]) }),
    api(main, "POST", `/${p.id}/ops`, { user: "user-1", json: opsBody(1, "race-b", [{ type: "broll.remove", id: "br_0002" }]) }),
  ]);
  assert.deepStrictEqual([a.status, b.status].sort(), [200, 409], `${a.text.slice(0, 200)} | ${b.text.slice(0, 200)}`);
  const loser = a.status === 409 ? a : b;
  assert.strictEqual(loser.json.error, "REVISION_CONFLICT");
  assert.strictEqual(loser.json.details.headRevision, 2);
  assert.strictEqual(head(main, p.id), 2);
});

t("envelope validation: unknown keys, empty ops, bad batchId → 422; oversize body → 413", async () => {
  const p = await seedEdit(main, "user-1");
  expectJsonError(await api(main, "POST", `/${p.id}/ops`, { user: "user-1", json: { ...opsBody(1, "v1", [{ type: "broll.remove", id: "br_0001" }]), sneaky: true } }), 422, "VALIDATION_FAILED");
  expectJsonError(await api(main, "POST", `/${p.id}/ops`, { user: "user-1", json: opsBody(1, "v2", []) }), 422, "VALIDATION_FAILED");
  expectJsonError(await api(main, "POST", `/${p.id}/ops`, { user: "user-1", json: opsBody(1, "bad id!", [{ type: "broll.remove", id: "br_0001" }]) }), 422, "VALIDATION_FAILED");
  expectJsonError(await api(main, "POST", `/${p.id}/ops`, { user: "user-1", json: { expectedRevision: "1", batchId: "v3", ops: [{ type: "broll.remove", id: "br_0001" }] } }), 422, "VALIDATION_FAILED");
  const huge = await api(main, "POST", `/${p.id}/ops`, { user: "user-1", json: opsBody(1, "v4", [{ type: "caption.editText", cueId: "c_0", text: "x".repeat(300 * 1024) }]) });
  expectJsonError(huge, 413, "BODY_TOO_LARGE");
  assert.strictEqual(head(main, p.id), 1);
});

// =================================================================================================
section("settings");

t("settings: B-roll / effects intensity re-plan through ops with zero model calls and persist the settings", async () => {
  let modelCalls = 0;
  const env = await makeEnv("settings", { deps: { callJson: async () => { modelCalls++; throw new Error("no model calls on settings"); } } });
  const p = await seedEdit(env, "user-1");
  const r = await api(env, "POST", `/${p.id}/settings`, { user: "user-1", json: { expectedRevision: 1, settings: { broll: { intensity: "high" }, effects: { intensity: "dynamic" } } } });
  assert.strictEqual(r.status, 200, r.text.slice(0, 400));
  assert.strictEqual(r.json.revision, 2);
  assert.strictEqual(r.json.applied, 2);
  const replanned = r.json.warnings.filter((w) => w.code === "REPLANNED");
  assert(replanned.length >= 1, `REPLANNED warning expected: ${JSON.stringify(r.json.warnings).slice(0, 300)}`);
  assert(replanned.every((w) => w.engine === "rhythm"), "the deterministic rhythm engine re-planned");
  assert.strictEqual(modelCalls, 0, "no LLM call");
  assert.strictEqual(r.json.settings.broll.intensity, "high");
  assert.deepStrictEqual(scanDeep({ outline: r.json.outline, warnings: r.json.warnings, costEvents: r.json.costEvents }), []);
  const stored = env.store.get(p.id);
  assert.strictEqual(stored.settings.broll.intensity, "high");
  assert.strictEqual(stored.settings.effects.intensity, "dynamic");
  const plan = await api(env, "GET", `/${p.id}/plan`, { user: "user-1" });
  assert.strictEqual(plan.json.plan.settings.brollIntensity, "high");
  assert.strictEqual(plan.json.plan.settings.effects, "dynamic");
  // a stored-only change makes no revision
  const only = await api(env, "POST", `/${p.id}/settings`, { user: "user-1", json: { expectedRevision: 2, settings: { exportProfile: "export720" } } });
  assert.strictEqual(only.status, 200, only.text.slice(0, 300));
  assert.strictEqual(only.json.revision, 2);
  assert.strictEqual(only.json.applied, 0);
  assert.deepStrictEqual(only.json.storedOnly, ["exportProfile"]);
  assert.strictEqual(env.store.get(p.id).settings.exportProfile, "export720");
  const bad = await api(env, "POST", `/${p.id}/settings`, { user: "user-1", json: { expectedRevision: 2, settings: { broll: { intensity: "extreme" } } } });
  expectJsonError(bad, 422, "VALIDATION_FAILED");
  expectJsonError(await api(env, "POST", `/${p.id}/settings`, { user: "user-1", json: { expectedRevision: 1, settings: { captions: { enabled: false } } } }), 409, "REVISION_CONFLICT");
  expectJsonError(await api(env, "POST", `/${p.id}/settings`, { user: "user-1", json: { expectedRevision: 2, settings: { consent: { thirdPartyAi: false } } } }), 422, "VALIDATION_FAILED");
  assert.strictEqual(modelCalls, 0);
});

t("settings: spoken language needs re-analysis — 409 REANALYZE_REQUIRED with an estimate, then 202 requeue on confirm", async () => {
  const p = await seedEdit(main, "user-1");
  const r = await api(main, "POST", `/${p.id}/settings`, { user: "user-1", json: { expectedRevision: 1, settings: { language: "es" } } });
  expectJsonError(r, 409, "REANALYZE_REQUIRED");
  assert.strictEqual(r.json.details.fromStage, "TRANSCRIBING");
  assert.deepStrictEqual(r.json.details.keys, ["language"]);
  assert(r.json.details.estimate.sec > 0 && r.json.details.estimate.usdHigh >= r.json.details.estimate.usdLow);
  assert.strictEqual(main.store.get(p.id).settings.language, "auto", "nothing stored before confirmation");
  const ok = await api(main, "POST", `/${p.id}/settings`, { user: "user-1", json: { expectedRevision: 1, settings: { language: "es" }, confirmReanalyze: true } });
  assert.strictEqual(ok.status, 202, ok.text.slice(0, 300));
  assert.strictEqual(ok.json.requeuedFrom, "TRANSCRIBING");
  assert.strictEqual(ok.json.settings.language, "es");
  const call = main.runner.calls.retry.find((c) => c.id === p.id);
  assert.deepStrictEqual(call.opts, { stage: "TRANSCRIBING", mode: "force" });
  assert.strictEqual(main.store.get(p.id).settings.language, "es");
});

t("settings unit: aggressive fillers need ve_content verdicts only for unjudged discourse candidates; mapping to ops", () => {
  const project = { settings: { ...clone(DEFAULT_SETTINGS), ...CONSENT }, source: { durationSec: 44.5, video: { width: 1920, height: 1080 } } };
  const plan = resolvePlan(clone(PLAN_RAW), { words: WORDS_DOC.words, sentences: TRANSCRIPT.sentences, faces: FACES, now: NOW });
  const meta = { fillerCandidates: [{ i: 3, text: "like", kind: "discourse" }] };
  assert.strictEqual(needsContentVerdicts({ transcriptMeta: meta, content: { fillerVerdicts: [] } }), true);
  assert.strictEqual(needsContentVerdicts({ transcriptMeta: meta, content: { fillerVerdicts: [{ wordIndex: 3, isFiller: true }] } }), false);
  assert.strictEqual(needsContentVerdicts({ transcriptMeta: meta, content: { deterministic: true, fillerVerdicts: [{ wordIndex: 3, isFiller: true }] } }), true);
  assert.strictEqual(needsContentVerdicts({ transcriptMeta: { fillerCandidates: [{ i: 3, kind: "pure" }] }, content: null }), false);
  const agg = computeSettingsChange({ project, plan, patch: { removeFillers: "aggressive" }, transcriptMeta: meta, content: null });
  assert.deepStrictEqual(agg.reanalyze, { fromStage: "ANALYZING_CONTENT", keys: ["removeFillers"] });
  const judged = computeSettingsChange({ project, plan, patch: { removeFillers: "aggressive" }, transcriptMeta: meta, content: { fillerVerdicts: [{ wordIndex: 3, isFiller: true }] } });
  assert.strictEqual(judged.reanalyze, null);
  assert.deepStrictEqual(judged.ops, [{ type: "settings.set", key: "removeFillers", value: "aggressive" }]);
  const mixed = computeSettingsChange({ project, plan, patch: { captions: { styleId: "clean", maxWordsPerLine: 2 }, sfx: { enabled: false }, output: { aspect: "source" }, privacy: { allowCloudVision: false }, goals: "more energy" } });
  assert.deepStrictEqual(mixed.ops.map((o) => o.type).sort(), ["captions.setStyle", "output.setAspect", "sfx.muteAll"]);
  assert.strictEqual(mixed.ops.find((o) => o.type === "output.setAspect").aspect, "16:9");
  assert.deepStrictEqual(mixed.stored.sort(), ["goals", "privacy.allowCloudVision"]);
  assert.strictEqual(mixed.reanalyze, null);
  const both = computeSettingsChange({ project, plan, patch: { language: "fr", privacy: { allowCloudVision: false } } });
  assert.strictEqual(both.reanalyze.fromStage, "TRANSCRIBING");
  assert.ok(computeSettingsChange({ project, plan, patch: { consent: { thirdPartyAi: false, termsVersion: "x" } } }).errors);
});

// =================================================================================================
section("gates & security");

const EDIT_ROUTES = (id) => [
  ["GET", `/${id}/plan`], ["GET", `/${id}/plan/revisions`], ["GET", `/${id}/transcript`], ["GET", `/${id}/candidates?itemId=br_0001`],
  ["POST", `/${id}/ops`, opsBody(1, "sec-1", [{ type: "broll.remove", id: "br_0001" }])], ["POST", `/${id}/undo`, { expectedRevision: 1 }],
  ["POST", `/${id}/redo`, { expectedRevision: 1 }], ["POST", `/${id}/settings`, { expectedRevision: 1, settings: { captions: { enabled: false } } }],
  ["POST", `/${id}/candidates/search`, { itemId: "br_0001", query: "phone on desk" }],
];

t("anonymous → 401 and another user's project → 404 on every editing route (nothing changes)", async () => {
  const p = await seedEdit(main, "user-1");
  for (const [m, u, body] of EDIT_ROUTES(p.id)) {
    expectJsonError(await api(main, m, u, { json: m === "POST" ? body : undefined }), 401, "AUTH_REQUIRED");
    expectJsonError(await api(main, m, u, { user: "user-2", json: m === "POST" ? body : undefined }), 404, "NOT_FOUND");
  }
  assert.strictEqual(head(main, p.id), 1);
  assert.deepStrictEqual(main.store.get(p.id).settings.captions.enabled, true);
});

t("evil Origin → 403 on reads and mutations", async () => {
  const p = await seedEdit(main, "user-1");
  const evil = { origin: "https://evil.example" };
  expectJsonError(await api(main, "GET", `/${p.id}/plan`, { user: "user-1", headers: evil }), 403, "ORIGIN_NOT_ALLOWED");
  expectJsonError(await api(main, "POST", `/${p.id}/ops`, { user: "user-1", headers: evil, json: opsBody(1, "evil-1", [{ type: "broll.remove", id: "br_0001" }]) }), 403, "ORIGIN_NOT_ALLOWED");
  expectJsonError(await api(main, "POST", `/${p.id}/settings`, { user: "user-1", headers: evil, json: { expectedRevision: 1, settings: { captions: { enabled: false } } } }), 403, "ORIGIN_NOT_ALLOWED");
  assert.strictEqual(head(main, p.id), 1);
});

t("status gates: PROCESSING → 409 NOT_READY; no plan → 409 NOT_READY", async () => {
  const busy = await seedEdit(main, "user-1", { status: "PROCESSING" });
  const r = await api(main, "POST", `/${busy.id}/ops`, { user: "user-1", json: opsBody(1, "busy-1", [{ type: "broll.remove", id: "br_0001" }]) });
  expectJsonError(r, 409, "NOT_READY");
  assert.strictEqual(r.json.details.reason, "STATUS");
  assert.strictEqual(r.json.details.status, "PROCESSING");
  expectJsonError(await api(main, "POST", `/${busy.id}/settings`, { user: "user-1", json: { expectedRevision: 1, settings: { captions: { enabled: false } } } }), 409, "NOT_READY");
  expectJsonError(await api(main, "POST", `/${busy.id}/undo`, { user: "user-1", json: { expectedRevision: 1 } }), 409, "NOT_READY");
  assert.strictEqual(head(main, busy.id), 1);
  assert.strictEqual((await api(main, "GET", `/${busy.id}/plan`, { user: "user-1" })).status, 200, "reads stay available while processing");
  const empty = await seedEdit(main, "user-1", { plan: false });
  const nr = await api(main, "POST", `/${empty.id}/ops`, { user: "user-1", json: opsBody(0, "empty-1", [{ type: "broll.remove", id: "br_0001" }]) });
  expectJsonError(nr, 409, "NOT_READY");
  assert.strictEqual(nr.json.details.reason, "NO_PLAN");
});

t("RENDERING accepts ops and marks exports stale; an edit after COMPLETED returns the project to READY", async () => {
  const rendering = await seedEdit(main, "user-1", { status: "RENDERING" });
  const r = await api(main, "POST", `/${rendering.id}/ops`, { user: "user-1", json: opsBody(1, "rend-1", [{ type: "broll.remove", id: "br_0001" }]) });
  assert.strictEqual(r.status, 200, r.text.slice(0, 300));
  let s = main.store.get(rendering.id);
  assert.strictEqual(s.status, "RENDERING");
  assert.strictEqual(s.exports.stale, true);
  const done = await seedEdit(main, "user-1", { status: "COMPLETED" });
  const c = await api(main, "POST", `/${done.id}/ops`, { user: "user-1", json: opsBody(1, "done-1", [{ type: "edit.setTitle", title: "My better title" }]) });
  assert.strictEqual(c.status, 200, c.text.slice(0, 300));
  s = main.store.get(done.id);
  assert.strictEqual(s.status, "READY");
  assert.strictEqual(s.exports.stale, true);
  assert.strictEqual(s.title, "My better title");
});

t("429 RATE_LIMITED on an ops flood (per user)", async () => {
  limited = await makeEnv("limited", { videoEdit: { limits: { rates: { opsPerMin: 3 } } } });
  const p = await seedEdit(limited, "user-1");
  const statuses = [];
  for (let i = 0; i < 5; i++) {
    const r = await api(limited, "POST", `/${p.id}/ops`, { user: "user-1", json: opsBody(1, `flood-${i}`, [{ type: "broll.setLocked", id: "br_0003", locked: i % 2 === 0 }]) });
    statuses.push(r.status);
    if (r.status === 429) {
      expectJsonError(r, 429, "RATE_LIMITED");
      assert(Number(r.headers["retry-after"]) > 0);
    }
  }
  assert.deepStrictEqual(statuses.slice(3), [429, 429], statuses.join(","));
  const p2 = await seedEdit(limited, "user-2");
  const other = await api(limited, "POST", `/${p2.id}/ops`, { user: "user-2", json: opsBody(1, "other-1", [{ type: "broll.remove", id: "br_0001" }]) });
  assert.strictEqual(other.status, 200, "limits are per user");
});

// =================================================================================================
section("candidates");

t("GET candidates by itemId: whitelisted views with thumb URLs; bad ids → 400/404", async () => {
  const p = await seedEdit(main, "user-1");
  const r = await api(main, "GET", `/${p.id}/candidates?itemId=br_0001&limit=5`, { user: "user-1" });
  assert.strictEqual(r.status, 200, r.text.slice(0, 300));
  assert(r.json.candidates.length >= 1);
  const c = r.json.candidates[0];
  assert.strictEqual(c.thumbUrl, `/api/video-edits/${p.id}/media/broll-thumb/${c.id}`);
  assert.strictEqual(c.used, true);
  assert.deepStrictEqual(scanDeep(r.json), []);
  expectJsonError(await api(main, "GET", `/${p.id}/candidates`, { user: "user-1" }), 400, "VALIDATION_FAILED");
  expectJsonError(await api(main, "GET", `/${p.id}/candidates?itemId=br_9999`, { user: "user-1" }), 404, "NOT_FOUND");
});

t("POST candidates/search → 202, one search at a time (423), results over SSE `candidates`, cost booked", async () => {
  let release;
  const gate = new Promise((r) => { release = r; });
  const calls = [];
  const stub = {
    listCandidates: realCandidates.listCandidates,
    resolveThumbFile: realCandidates.resolveThumbFile,
    async searchCandidates(project, req, opts) {
      calls.push({ req, hasSignal: !!opts.signal, lang: opts.lang });
      await gate;
      return {
        slotId: "us_abc123", itemId: req.itemId, query: req.query, kind: "video", judge: "ok", costUsd: 0.002, providers: { pexels: "ok" },
        notices: [{ code: "BROLL_JUDGE_OK", severity: "info", message: "ok" }],
        candidates: [{ id: "ast_new0001", provider: "pexels", type: "video", durationSec: 6, w: 1080, h: 1920, thumbKey: "ast_new0001", previewUrl: "https://videos.example/p.mp4", sourceUrl: "https://www.pexels.com/video/1/", author: null, license: "Pexels License", attribution: null, score: { total: 0.71 }, issues: [], accepted: true, used: false }],
      };
    },
  };
  const env = await makeEnv("search", { deps: { brollCandidates: stub } });
  const p = await seedEdit(env, "user-1");
  const seen = [];
  const unsubscribe = env.events.subscribe(p.id, (evt) => seen.push(evt));
  const r = await api(env, "POST", `/${p.id}/candidates/search`, { user: "user-1", json: { itemId: "br_0001", query: "phone face down" } });
  assert.strictEqual(r.status, 202, r.text.slice(0, 300));
  assert.match(r.json.searchId, /^srch_[0-9a-z]{8}$/);
  expectJsonError(await api(env, "POST", `/${p.id}/candidates/search`, { user: "user-1", json: { itemId: "br_0001", query: "another" } }), 423, "PROJECT_LOCKED");
  expectJsonError(await api(env, "POST", `/${p.id}/candidates/search`, { user: "user-1", json: { itemId: "br_0404", query: "x y" } }), 422, "VALIDATION_FAILED");
  release();
  const evt = await waitFor(() => seen.find((x) => x.type === "candidates"), { label: "candidates event" });
  unsubscribe();
  assert.strictEqual(evt.data.searchId, r.json.searchId);
  assert.strictEqual(evt.data.itemId, "br_0001");
  assert.strictEqual(evt.data.candidates[0].thumbUrl, `/api/video-edits/${p.id}/media/broll-thumb/ast_new0001`);
  assert.deepStrictEqual(scanDeep(evt.data), []);
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].hasSignal, true);
  assert.strictEqual(calls[0].lang, "en");
  await waitFor(() => env.store.get(p.id).cost.spentUsd >= 0.002, { label: "cost booked" });
  await waitFor(() => env.router.videoEdit.edit.activeSearches() === 0, { label: "search slot released" });
});

t("B-roll module pending → 501 NOT_IMPLEMENTED with reason BROLL_MODULE_PENDING", async () => {
  const env = await makeEnv("pending", { deps: { brollCandidates: null } });
  const p = await seedEdit(env, "user-1");
  for (const [m, u, body] of [["GET", `/${p.id}/candidates?itemId=br_0001`], ["POST", `/${p.id}/candidates/search`, { itemId: "br_0001", query: "phone" }]]) {
    const r = await api(env, m, u, { user: "user-1", json: body });
    assert.strictEqual(r.status, 501, `${m} ${u} → ${r.status}`);
    assert.strictEqual(r.json.error, "NOT_IMPLEMENTED");
    assert.strictEqual(r.json.details.reason, "BROLL_MODULE_PENDING");
  }
});

t("context loader: artifacts cached per version, candidates only for replace/regenerate items", async () => {
  const p = await seedEdit(main, "user-1");
  const loader = createContextLoader({ store: main.store, log: silentLog });
  const plan = main.store.loadRevision(p.id, 1).plan;
  const a = loader.load(main.store.get(p.id), { plan, ops: [{ type: "broll.replace", id: "br_0001", candidateId: "x" }, { type: "broll.remove", id: "br_0002" }] });
  assert.strictEqual(a.words.length, WORDS_DOC.words.length);
  assert.strictEqual(a.sentences.length, TRANSCRIPT.sentences.length);
  assert(a.faces && a.content && a.available.transcript);
  assert.deepStrictEqual(Object.keys(a.candidates), ["br_0001"]);
  const b = loader.load(main.store.get(p.id), { plan });
  assert.strictEqual(a.words, b.words, "cached while artifacts are unchanged");
  fs.writeFileSync(path.join(main.store.projectDir(p.id), "analysis", "content.json"), JSON.stringify({ ...CONTENT, summary: "changed" }));
  const c = loader.load(main.store.get(p.id), { plan });
  assert.strictEqual(c.content.summary, "changed", "reloaded after the artifact changed");
});

// =================================================================================================
(async () => {
  let result;
  try {
    result = await run();
  } finally {
    for (const server of servers) { try { server.closeAllConnections(); server.close(); } catch { /* noop */ } }
    for (const e of [main, limited]) { try { if (e) e.store.close(); } catch { /* noop */ } }
    restoreFetch();
    await new Promise((r) => setTimeout(r, 200));
    tmp.cleanup();
  }
  if (result && result.failed) process.exitCode = 1;
})();
