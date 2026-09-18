// Tests for the AI Video Edit HTTP layer: video_edit/routes.js, security/*, views.js, index.js.
// Run: node scripts/video_edit_routes.test.cjs
//
// Load-bearing (ENGINE.md §9 video_edit_routes): every route except /health requires auth, proven by
// walking router.stack and calling each route anonymously; another user's project is 404 on every
// `/:id` route; a deleted user's cookie is dead; an evil Origin is 403 WITHOUT the reflected CORS headers
// (GET and POST), and a forged cross-site multipart upload writes nothing to staging; a 300 KB JSON body
// is a JSON 413; a real lavfi upload is admitted, attached and enqueued, and replays idempotently; consent
// and container are enforced; views carry no paths or tags; media honours Range; playback tokens are
// bound to project/user/kind/key and expire; SSE streams snapshot → events and cleans up on abort; delete
// closes open streams, answers 404 immediately and removes the directory.
// Offline: loopback HTTP only, global fetch tripwire, temp dirs, injected auth + runner stub.

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
const { createHarness, mkTmp, makeSettings, makeFixture, installFetchTripwire, silentLog } = require("./lib/video_edit_test_utils.cjs");

const tmp = mkTmp("ve-routes-");
process.env.VIDEO_EDIT_DIR = path.join(tmp.dir, "_guard", "edits");
process.env.VIDEO_EDIT_INDEX = path.join(tmp.dir, "_guard", "video-edits.json");

const SERVER_ROOT = path.resolve(__dirname, "..");
const strayBefore = { edits: fs.existsSync(path.join(SERVER_ROOT, "edits")), index: fs.existsSync(path.join(SERVER_ROOT, "video-edits.json")) };

const express = require("express");
const videoEdit = require("../src/video_edit");
const routes = require("../src/video_edit/routes");
const views = require("../src/video_edit/views");
const mediaToken = require("../src/video_edit/security/media_token");
const { createStore, resetStoreSingleton } = require("../src/video_edit/store");
const { createEventBus } = require("../src/video_edit/events");
const { checkCreateQuota, createStreamCounter } = require("../src/video_edit/security/limits");
const { EditError, isEditError } = require("../src/video_edit/errors");
const { DEFAULT_SETTINGS } = require("../src/video_edit/settings_schema");

const { t, section, run } = createHarness();
const restoreFetch = installFetchTripwire();
const MB = 1024 * 1024;
const noop = () => {};

// ---- fixtures: users, env, runner stub -----------------------------------------------------------
const USERS = { "user-1": { id: "user-1" }, "user-2": { id: "user-2" }, "user-3": { id: "user-3" }, "user-4": { id: "user-4" } };
const readUserId = (req) => {
  const m = /(?:^|;\s*)ve_test_user=([^;]+)/.exec(String(req.headers.cookie || ""));
  return m ? decodeURIComponent(m[1]) : null;
};
const findUserById = (id) => USERS[id] || null;   // "user-gone" has a cookie but no account
const as = (user) => ({ cookie: `ve_test_user=${encodeURIComponent(user)}` });
const ENV = Object.freeze({ NODE_ENV: "test", OPENROUTER_API_KEY: "test-openrouter-key", SECRET_KEY: "routes-test-secret" });
const TOOLS_OK = async () => ({ ffmpeg: "8.0", ffprobe: "8.0" });
const CONSENT = { consent: { thirdPartyAi: true, termsVersion: "2026-09" } };

function makeRunnerStub() {
  const calls = { enqueue: [], cancel: [], retry: [], abort: [] };
  const active = new Set();
  return {
    calls, active,
    async enqueuePipeline(id, opts) { calls.enqueue.push({ id, opts }); return { runId: "run_stub0001", queuePosition: 1, done: Promise.resolve({ status: null }) }; },
    async cancel(id, opts) {
      calls.cancel.push({ id, opts });
      if (opts.target !== "pipeline") throw new EditError("NOTHING_TO_CANCEL", { status: 409, errorClass: "input" });
      return { cancelled: true, forced: false, wasQueued: true };
    },
    async retry(id, opts) { calls.retry.push({ id, opts }); return { fromStage: "VALIDATING", runId: "run_stub0002", done: Promise.resolve({}) }; },
    async abort(id) { calls.abort.push(id); return false; },
    isActive: (id) => active.has(id),
    activeIds: () => [...active],
    async stopAll() { return { stopped: 0, timedOut: false }; },
  };
}

// Mirrors server.js with WEB_ORIGIN unset: reflects any Origin with credentials.
function fakeGlobalCors(req, res, next) {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  return next();
}

const servers = [];
function serve(router, { jsonParser = null } = {}) {
  const app = express();
  app.use(fakeGlobalCors);
  app.use("/api/video-edits", jsonParser || express.json({ limit: "256kb" }));   // API.md §1 step 2
  app.use(express.json({ limit: "64kb" }));
  app.use("/api/video-edits", router);
  app.use("/api/video-edits", videoEdit.errorHandler({ log: silentLog }));
  app.use("/api", (req, res) => res.status(404).json({ error: "not found" }));
  const server = http.createServer(app);
  servers.push(server);
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));
}

async function makeEnv(name, { videoEdit: block, env = ENV, deps = {}, storeWrap = null } = {}) {
  const root = path.join(tmp.dir, name);
  const settings = makeSettings(root, { videoEdit: block });
  const store = createStore({ settings, log: silentLog });
  store.init();
  const events = createEventBus({ store, settings });
  const runner = makeRunnerStub();
  const streams = routes.createStreamRegistry();
  const router = videoEdit.buildRouter({
    settings, store: storeWrap ? storeWrap(store) : store, events, runner, streams, readUserId, findUserById, env,
    log: silentLog, toolVersions: TOOLS_OK, statfsFreeMb: () => 500000, ...deps,
  });
  const port = await serve(router);
  return { name, root, settings, store, events, runner, streams, router, port };
}

// ---- HTTP helpers ----------------------------------------------------------------------------------
function request(port, { method = "GET", path: p, headers = {}, body = null, timeoutMs = 60000 }) {
  return new Promise((resolve, reject) => {
    const h = { ...headers };
    if (body != null && h["content-length"] === undefined) h["content-length"] = body.length;
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
    req.setTimeout(timeoutMs, () => req.destroy(new Error("request timeout")));
    req.on("error", reject);
    if (body != null) req.write(body);
    req.end();
  });
}

function api(e, method, p, { user = null, headers = {}, json, raw, contentType } = {}) {
  const h = { ...(user ? as(user) : {}), ...headers };
  let body = null;
  if (json !== undefined) { body = Buffer.from(JSON.stringify(json)); if (!h["content-type"]) h["content-type"] = "application/json"; }
  else if (raw !== undefined) { body = raw; if (contentType) h["content-type"] = contentType; }
  return request(e.port, { method, path: `/api/video-edits${p}`, headers: h, body });
}

function multipart(parts) {
  const boundary = `----vetest${crypto.randomBytes(8).toString("hex")}`;
  const bufs = [];
  for (const part of parts) {
    let head = `--${boundary}\r\nContent-Disposition: form-data; name="${part.name}"`;
    if (part.filename !== undefined) head += `; filename="${part.filename}"\r\nContent-Type: ${part.contentType || "application/octet-stream"}`;
    bufs.push(Buffer.from(`${head}\r\n\r\n`), Buffer.isBuffer(part.data) ? part.data : Buffer.from(String(part.data)), Buffer.from("\r\n"));
  }
  bufs.push(Buffer.from(`--${boundary}--\r\n`));
  return { body: Buffer.concat(bufs), contentType: `multipart/form-data; boundary=${boundary}` };
}

function createForm({ settings = CONSENT, clientRequestId, video, filename = "/home/victim/secret clip.mp4", logo } = {}) {
  const parts = [];
  if (settings !== undefined) parts.push({ name: "settings", data: typeof settings === "string" ? settings : JSON.stringify(settings) });
  if (clientRequestId !== undefined) parts.push({ name: "clientRequestId", data: clientRequestId });
  if (video !== null) parts.push({ name: "video", filename, contentType: "video/mp4", data: video || fs.readFileSync(FIXTURE) });
  if (logo) parts.push({ name: "logo", filename: "logo.png", contentType: "image/png", data: logo });
  return multipart(parts);
}

function postCreate(e, user, form, { headers = {}, query = "" } = {}) {
  return api(e, "POST", `/${query}`, { user, headers, raw: form.body, contentType: form.contentType });
}

function openSse(port, pathname, headers = {}) {
  return new Promise((resolve, reject) => {
    const state = { status: null, headers: null, raw: "", events: [], closed: false, json: null, req: null };
    const req = http.get({ host: "127.0.0.1", port, path: pathname, headers, agent: false }, (res) => {
      state.status = res.statusCode;
      state.headers = res.headers;
      res.on("error", noop);
      if (res.statusCode !== 200) {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => { try { state.json = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { /* noop */ } state.closed = true; resolve(state); });
        return;
      }
      res.setEncoding("utf8");
      let buf = "";
      res.on("data", (chunk) => {
        state.raw += chunk;
        buf += chunk;
        let i;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const frame = buf.slice(0, i);
          buf = buf.slice(i + 2);
          let type = "message";
          const data = [];
          for (const line of frame.split("\n")) {
            if (line.startsWith("event: ")) type = line.slice(7);
            else if (line.startsWith("data: ")) data.push(line.slice(6));
          }
          if (data.length) { let parsed = null; try { parsed = JSON.parse(data.join("\n")); } catch { /* noop */ } state.events.push({ type, data: parsed }); }
        }
      });
      res.on("close", () => { state.closed = true; });
      resolve(state);
    });
    state.req = req;
    req.on("error", () => { state.closed = true; if (state.status == null) reject(new Error("sse request failed")); });
  });
}

function openHeld(port, pathname, headers = {}) {
  return new Promise((resolve, reject) => {
    const state = { status: null, closed: false, req: null, res: null };
    const req = http.get({ host: "127.0.0.1", port, path: pathname, headers, agent: false }, (res) => {
      state.status = res.statusCode;
      state.res = res;
      res.on("error", noop);
      res.pause();   // never read: keeps the server's sendFile stream open
      resolve(state);
    });
    state.req = req;
    req.on("socket", (sock) => sock.on("close", () => { state.closed = true; }));
    req.on("error", () => { state.closed = true; if (state.status == null) reject(new Error("held request failed")); });
  });
}

async function waitFor(fn, { timeoutMs = 10000, label = "condition", everyMs = 20 } = {}) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > timeoutMs) throw new Error(`timed out waiting for ${label}`);
    await new Promise((r) => setTimeout(r, everyMs));
  }
}

const stagingFiles = (e) => (fs.existsSync(e.settings.paths.stagingDir) ? fs.readdirSync(e.settings.paths.stagingDir) : []);
const listOwned = (e, ownerId) => e.store.list({ ownerId, limit: 50 }).projects;

let seedN = 0;
async function seedProject(e, ownerId, { compress = false, proxyBytes = 256 * 1024, durationSec = 6, clientRequestId = null } = {}) {
  const p = e.store.createProject({ ownerId, clientRequestId, settings: { ...DEFAULT_SETTINGS, ...CONSENT }, consent: CONSENT.consent });
  seedN++;
  const staged = path.join(e.settings.paths.stagingDir, `seed-${seedN}.upload`);
  fs.mkdirSync(path.dirname(staged), { recursive: true });
  fs.writeFileSync(staged, Buffer.alloc(1024, 7));
  await e.store.attachSource(p.id, {
    stagedPath: staged, sha256: "a".repeat(64), sizeBytes: 1024, demuxer: "mov", displayName: "seed.mp4",
    probe: { durationSec, video: { codec: "h264", width: 640, height: 360, fps: 30 }, audio: [{ codec: "aac", channels: 2, sampleRate: 48000 }] },
  });
  if (compress) {
    const dir = e.store.projectDir(p.id);
    fs.mkdirSync(path.join(dir, "work"), { recursive: true });
    const proxy = path.join(dir, "work", "proxy540.mp4");
    if (proxyBytes > 4 * MB) { fs.writeFileSync(proxy, ""); fs.truncateSync(proxy, proxyBytes); } else fs.writeFileSync(proxy, crypto.randomBytes(proxyBytes));
    fs.writeFileSync(path.join(dir, "work", "poster.jpg"), Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), crypto.randomBytes(2000)]));
    await e.store.setStage(p.id, "COMPRESSING", {
      status: "done", attempts: 1, engine: "ffmpeg",
      outputs: { proxy: { path: "work/proxy540.mp4", size: proxyBytes }, poster: { path: "work/poster.jpg" }, mezz: { path: "work/mezz.mp4", sha256: "b".repeat(64) } },
    });
  }
  return e.store.get(p.id);
}

const FORBIDDEN_VIEW_KEYS = new Set(["tags", "path", "outputs", "inputHash", "sha256", "providerTasks", "ownerId", "clientRequestId", "detail", "runId", "file", "errors", "debugFaults", "storeCorrupt", "recovery", "retention", "usage", "demuxer", "mezzanine"]);
function scanView(obj, forbiddenStrings = []) {
  const problems = [];
  const walk = (v, where) => {
    if (Array.isArray(v)) { v.forEach((x, i) => walk(x, `${where}[${i}]`)); return; }
    if (v && typeof v === "object") {
      for (const [k, x] of Object.entries(v)) {
        if (FORBIDDEN_VIEW_KEYS.has(k)) problems.push(`${where}.${k}`);
        walk(x, `${where}.${k}`);
      }
      return;
    }
    if (typeof v === "string") {
      if (/[A-Za-z]:[\\/]/.test(v) || v.includes("\\")) problems.push(`${where}: path-like`);
      for (const s of forbiddenStrings) if (v.toLowerCase().includes(String(s).toLowerCase())) problems.push(`${where}: contains ${s}`);
    }
  };
  walk(obj, "view");
  return problems;
}

function expectEditError(fn, code, status, extra = null) {
  let err = null;
  try { fn(); } catch (e) { err = e; }
  assert(err && isEditError(err), `expected EditError ${code}, got ${err && err.message}`);
  assert.strictEqual(err.code, code);
  assert.strictEqual(err.status, status);
  if (extra) for (const [k, v] of Object.entries(extra)) assert.strictEqual(err.extra && err.extra[k], v, `extra.${k}`);
  return err;
}

function expectJsonError(r, status, code) {
  assert.strictEqual(r.status, status, `expected ${status} ${code}, got ${r.status} ${r.text.slice(0, 200)}`);
  assert(r.json, `non-JSON body: ${r.text.slice(0, 120)}`);
  assert.strictEqual(r.json.error, code);
  assert.strictEqual(typeof r.json.retryable, "boolean", "every error body carries retryable");
  assert(!/at .+\(.+:\d+:\d+\)/.test(r.text), "stack trace leaked");
}

const FIXTURE = makeFixture(path.join(tmp.dir, "fixture.mp4"), { seconds: 4, size: "640x360" });
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), crypto.randomBytes(200)]);
let main;

// =================================================================================================
section("security primitives (pure)");

t("media tokens: roundtrip, tamper, wrong secret, expiry, production without secret", () => {
  const env = { NODE_ENV: "test", SECRET_KEY: "s1" };
  const pid = "ve_0123456789abcdef";
  const tok = mediaToken.signMediaToken({ projectId: pid, userId: "user-1", kind: "poster" }, { env });
  const v = mediaToken.verifyMediaToken(tok, { env });
  assert(v && v.projectId === pid && v.userId === "user-1" && v.kind === "poster" && v.key === null);

  const [part, sig] = tok.split(".");
  const payload = JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
  const forged = `${Buffer.from(JSON.stringify({ ...payload, k: "export" })).toString("base64url")}.${sig}`;
  assert.strictEqual(mediaToken.verifyMediaToken(forged, { env }), null, "payload tamper");
  const flipped = `${part}.${sig[0] === "A" ? "B" : "A"}${sig.slice(1)}`;
  assert.strictEqual(mediaToken.verifyMediaToken(flipped, { env }), null, "signature tamper");
  assert.strictEqual(mediaToken.verifyMediaToken(tok, { env: { NODE_ENV: "test", SECRET_KEY: "other" } }), null, "wrong secret");
  const old = mediaToken.signMediaToken({ projectId: pid, userId: "user-1", kind: "poster" }, { env, ttlSec: 900, now: () => Date.now() - 2 * 3600 * 1000 });
  assert.strictEqual(mediaToken.verifyMediaToken(old, { env }), null, "expired");
  assert.strictEqual(mediaToken.verifyMediaToken(`${tok}x`, { env }), null);
  assert.strictEqual(mediaToken.verifyMediaToken(123, { env }), null);
  assert.strictEqual(mediaToken.verifyMediaToken("a".repeat(2000), { env }), null);

  const prod = { NODE_ENV: "production" };
  expectEditError(() => mediaToken.signMediaToken({ projectId: pid, userId: "user-1", kind: "poster" }, { env: prod }), "EDITS_DISABLED", 503, { reason: "NO_SECRET_KEY" });
  const dev = mediaToken.signMediaToken({ projectId: pid, userId: "user-1", kind: "events" }, { env: { NODE_ENV: "test" } });
  assert.strictEqual(mediaToken.verifyMediaToken(dev, { env: prod }), null, "dev fallback secret refused in production");
  assert(mediaToken.verifyMediaToken(dev, { env: { NODE_ENV: "test" } }));
  expectEditError(() => mediaToken.signMediaToken({ projectId: pid, userId: "user-1", kind: "original" }, { env }), "VALIDATION_FAILED", 422);
  expectEditError(() => mediaToken.signMediaToken({ projectId: "ve_BAD", userId: "user-1", kind: "poster" }, { env }), "VALIDATION_FAILED", 422);
});

t("stream counter: per-user cap, idempotent release", () => {
  const c = createStreamCounter({ max: 2 });
  const a = c.acquire("u"); const b = c.acquire("u");
  assert(a && b);
  assert.strictEqual(c.acquire("u"), null);
  assert(c.acquire("v"));
  a(); a();
  assert.strictEqual(c.count("u"), 1);
  assert(c.acquire("u"));
  assert.strictEqual(c.acquire(null), null);
});

t("checkCreateQuota: projects, active, creates/day, global daily cap, storage cap", () => {
  const settings = makeSettings(path.join(tmp.dir, "quota-unit"), {
    videoEdit: { limits: { perUser: { maxProjects: 3, createsPerDay: 2, maxRunning: 1, maxQueued: 5 }, global: { createsPerDay: 4, maxStorageMb: 100 } } },
  });
  const store = createStore({ settings, log: silentLog });
  store.init();
  const later = (h) => () => Date.now() + h * 3600 * 1000;
  checkCreateQuota({ store, userId: "u1", settings });
  store.createProject({ ownerId: "u1" });
  store.createProject({ ownerId: "u1" });
  expectEditError(() => checkCreateQuota({ store, userId: "u1", settings }), "QUOTA_EXCEEDED", 429, { quota: "createsPerDay" });
  checkCreateQuota({ store, userId: "u1", settings, now: later(25) });
  store.createProject({ ownerId: "u2" });
  store.createProject({ ownerId: "u2" });
  expectEditError(() => checkCreateQuota({ store, userId: "u3", settings }), "DAILY_CAP_REACHED", 429);
  expectEditError(() => checkCreateQuota({ store, userId: "u9", settings, now: later(25), incomingBytes: 200 * MB }), "INSUFFICIENT_STORAGE", 507, { reason: "STORAGE_CAP" });
  store.createProject({ ownerId: "u1" });
  expectEditError(() => checkCreateQuota({ store, userId: "u1", settings, now: later(50) }), "QUOTA_EXCEEDED", 429, { quota: "projects" });
  const s2 = makeSettings(path.join(tmp.dir, "quota-unit2"), { videoEdit: { limits: { perUser: { maxRunning: 1, maxQueued: 1 } } } });
  const st2 = createStore({ settings: s2, log: silentLog });
  st2.init();
  st2.createProject({ ownerId: "u1" });
  st2.createProject({ ownerId: "u1" });
  const err = expectEditError(() => checkCreateQuota({ store: st2, userId: "u1", settings: s2 }), "QUOTA_EXCEEDED", 429, { quota: "active" });
  assert.strictEqual(err.retryable, true);
  store.close();
  st2.close();
});

t("views: whitelist only (no paths, tags, hashes, internals); rotation; allowedActions; cost estimate", () => {
  const p = {
    id: "ve_0123456789abcdef", ownerId: "u", clientRequestId: "c", status: "NEEDS_ATTENTION", title: null, createdAt: 1, updatedAt: 2, lastOpenedAt: 3, runId: "run_x",
    statusReason: { code: "STT_FAILED", message: "m", retryable: true, stage: "TRANSCRIBING", actions: ["retry", "continue_without_transcript", "../evil"] },
    progress: { stage: "TRANSCRIBING", stagePct: 42.44, overallPct: 31, message: "x", stageStartedAt: 5, etaSec: 9, queuePosition: 2 },
    source: {
      displayName: "clip.mp4", sizeBytes: 10, sha256: "a".repeat(64), demuxer: "mov", durationSec: 31.2,
      video: { width: 1920, height: 1080, rotation: 90, fps: 29.97, tags: { location: "+37.7" } }, audio: { codec: "aac" }, mezzanine: { path: "work/mezz.mp4" },
    },
    settings: { ...DEFAULT_SETTINGS, debugFaults: "crash:VALIDATING" },
    stages: { COMPRESSING: { status: "done", attempts: 1, outputs: { poster: { path: "work/poster.jpg" } }, inputHash: "h", engine: "ffmpeg", durationMs: 1200, fallbacks: [], providerTasks: [{ taskId: "t" }], error: { detail: "C:\\stderr" } } },
    discoveries: { durationSec: 31.2, secret: "C:\\x", hook: "hello" },
    plan: { headRevision: 0 }, renders: [{ id: "rd_abcdefgh", kind: "preview", status: "done", file: "render/out/rd_abcdefgh.mp4", sha256: "e".repeat(64) }],
    exports: { currentId: null, stale: false }, errors: [{ detail: "C:\\stderr" }], notices: [{ code: "LOW_RES", severity: "warn", stage: "VALIDATING", message: "m", at: 1 }],
    cost: { estimateUsd: 0.1, capUsd: 0.5, spentUsd: 0.01, byStage: { X: 1 } },
  };
  const v = views.toProjectView(p, { now: 10 });
  assert.deepStrictEqual(scanView(v, ["work/", "stderr", "+37.7", "render/out"]), []);
  assert.strictEqual(v.mode, "AI_VIDEO_EDIT");
  assert.strictEqual(v.source.width, 1080, "rotation 90 swaps display dims");
  assert.strictEqual(v.orientation, "portrait");
  assert.strictEqual(v.title, "clip");
  assert.strictEqual(v.posterUrl, "/api/video-edits/ve_0123456789abcdef/media/poster");
  assert.deepStrictEqual(v.statusReason.actions, ["retry", "continue_without_transcript"]);
  assert.strictEqual(v.progress.queuePosition, null, "queue position only while QUEUED");
  assert.strictEqual(v.settings.debugFaults, undefined);
  assert.deepStrictEqual(v.allowedActions, ["retry", "delete"]);
  assert.deepStrictEqual(Object.keys(v.discoveries).sort(), ["durationSec", "hook"]);
  assert.deepStrictEqual(v.stages.COMPRESSING, { status: "done", attempts: 1, fallbacks: [], engine: "ffmpeg", durationMs: 1200 });
  assert.deepStrictEqual(Object.keys(v.cost).sort(), ["capUsd", "estimateUsd", "spentUsd"]);
  const table = {
    QUEUED: ["cancel", "delete"], PROCESSING: ["cancel", "delete"], READY: ["delete"], CANCELLED: ["retry", "delete"], FAILED: ["delete"], DELETING: [],
  };
  for (const [status, want] of Object.entries(table)) assert.deepStrictEqual(views.allowedActionsFor({ status }), want, status);
  assert.deepStrictEqual(views.allowedActionsFor({ status: "COMPLETED", plan: { headRevision: 3 } }), ["render", "export", "edit", "delete"]);
  assert.deepStrictEqual(views.allowedActionsFor({ status: "NEEDS_ATTENTION", statusReason: { retryable: false } }), ["delete"]);
  assert.deepStrictEqual(views.costEstimateFor(60), { usdLow: 0.025, usdHigh: 0.09 });
  assert.deepStrictEqual(views.costEstimateFor(600, { capUsd: 0.5 }), { usdLow: 0.205, usdHigh: 0.5 });
  const prog = views.toProgress({ ...p, status: "QUEUED" });
  assert.deepStrictEqual(Object.keys(prog).sort(), ["activeRenderId", "etaSec", "overallPct", "planRevision", "queuePosition", "stage", "stagePct", "status", "updatedAt"]);
  assert.strictEqual(prog.queuePosition, 2);
});

// =================================================================================================
section("HTTP: auth, ownership, origin, body limits");

t("setup: main router on an in-process express app", async () => {
  main = await makeEnv("main", { deps: { ssePingMs: 200 } });
  const r = await api(main, "GET", "/health", { user: "user-1" });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.json.enabled, true, JSON.stringify(r.json));
  assert.deepStrictEqual(Object.keys(r.json).sort(), ["diskFreeMb", "enabled", "faultsActive", "ffmpeg", "providers", "queue", "storageUsedMb"]);
  assert.strictEqual(r.json.providers.openrouterStt, true);
  assert.strictEqual(r.json.ffmpeg.version, "8.0");
  assert(!r.text.includes("test-openrouter-key") && !r.text.includes(tmp.dir.slice(3)), "health leaks no key or path");
});

t("/health: anonymous, deleted-account and cross-origin callers get { enabled, reason? } only", async () => {
  const evil = { origin: "http://evil.example" };
  for (const [label, opts] of [["anonymous", {}], ["deleted user", { user: "user-gone" }], ["evil origin with a live cookie", { user: "user-1", headers: evil }], ["anonymous evil origin", { headers: evil }]]) {
    const r = await api(main, "GET", "/health", opts);
    assert.strictEqual(r.status, 200, label);
    assert.deepStrictEqual(r.json, { enabled: true }, `${label}: ${r.text}`);
  }
  const allowed = await api(main, "GET", "/health", { user: "user-1", headers: { origin: "http://localhost:5173" } });
  assert.strictEqual(allowed.json.ffmpeg.version, "8.0", "an allowed origin with a session gets details");
});

t("every route except /health requires auth (router.stack walk); foreign user gets 404 on every /:id route", async () => {
  const p = await seedProject(main, "user-1");
  const layers = main.router.stack;
  const healthIdx = layers.findIndex((l) => l.route && l.route.path === "/health");
  const guardIdx = layers.findIndex((l) => !l.route && l.handle.name === "originGuard");
  assert(healthIdx >= 0 && guardIdx > healthIdx, "originGuard must follow /health and precede every other route");
  const routeLayers = layers.map((l, i) => ({ l, i })).filter((x) => x.l.route && x.l.route.path !== "/health");
  assert(routeLayers.length >= 24, `expected all API.md §3 routes, got ${routeLayers.length}`);
  const multipartRoutes = new Set(main.router.videoEdit.multipartRoutes.map(([m, rp]) => `${m} ${rp}`));
  let checked = 0;
  for (const { l, i } of routeLayers) {
    const rp = l.route.path;
    assert(i > guardIdx, `${rp} is mounted before originGuard`);
    const names = l.route.stack.map((s) => s.handle.name);
    assert.strictEqual(names[0], "requireEditUser", `${rp}: auth must run first (${names.join(" → ")})`);
    if (rp.includes(":id")) {
      assert(names.indexOf("loadOwnedProject") > names.indexOf("editsEnabled"), `${rp}: ownership must follow auth/enabled (${names.join(" → ")})`);
    }
    for (const method of Object.keys(l.route.methods)) {
      const M = method.toUpperCase();
      const url = rp.replace(":id", p.id).replace(":kind", "poster").replace("/:key?", "").replace(":rid", "rd_abcdefgh");
      const call = (user) => {
        if (M === "GET") return api(main, "GET", url, { user });
        if (multipartRoutes.has(`${M} ${rp}`)) return api(main, M, url, { user, raw: Buffer.from("--x--\r\n"), contentType: "multipart/form-data; boundary=x" });
        return api(main, M, url, { user, json: {} });
      };
      expectJsonError(await call(null), 401, "AUTH_REQUIRED");
      if (rp.includes(":id")) expectJsonError(await call("user-2"), 404, "NOT_FOUND");
      checked++;
    }
  }
  assert(checked >= 24);
  expectJsonError(await api(main, "GET", "/some/unknown/path"), 401, "AUTH_REQUIRED");
  expectJsonError(await api(main, "GET", "/some/unknown/path", { user: "user-1" }), 404, "NOT_FOUND");
});

t("deleted user's cookie → 401; malformed and unknown ids → 404", async () => {
  expectJsonError(await api(main, "GET", "/", { user: "user-gone" }), 401, "AUTH_REQUIRED");
  expectJsonError(await api(main, "GET", "/capabilities", { user: "user-gone" }), 401, "AUTH_REQUIRED");
  expectJsonError(await api(main, "GET", "/not-an-id", { user: "user-1" }), 404, "NOT_FOUND");
  expectJsonError(await api(main, "GET", "/ve_0000000000000000", { user: "user-1" }), 404, "NOT_FOUND");
  expectJsonError(await api(main, "GET", "/VE_0123456789ABCDEF/progress", { user: "user-1" }), 404, "NOT_FOUND");
});

t("evil Origin → 403 without reflected CORS headers (GET and POST); allowed + same origin pass", async () => {
  const p = await seedProject(main, "user-1");
  const evil = { origin: "http://evil.example" };
  for (const r of [
    await api(main, "GET", "/", { user: "user-1", headers: evil }),
    await api(main, "GET", `/${p.id}`, { user: "user-1", headers: evil }),
    await api(main, "POST", `/${p.id}/cancel`, { user: "user-1", headers: evil, json: {} }),
    await api(main, "GET", "/", { user: "user-1", headers: { origin: "null" } }),
  ]) {
    expectJsonError(r, 403, "ORIGIN_NOT_ALLOWED");
    assert.strictEqual(r.headers["access-control-allow-origin"], undefined, "ACAO must be stripped");
    assert.strictEqual(r.headers["access-control-allow-credentials"], undefined, "ACAC must be stripped");
  }
  const dev = await api(main, "GET", "/", { user: "user-1", headers: { origin: "http://localhost:5173" } });
  assert.strictEqual(dev.status, 200);
  assert.strictEqual(dev.headers["access-control-allow-origin"], "http://localhost:5173");
  const same = await api(main, "GET", "/", { user: "user-1", headers: { origin: `http://127.0.0.1:${main.port}` } });
  assert.strictEqual(same.status, 200);
  expectJsonError(await api(main, "POST", `/${p.id}/cancel`, { user: "user-1", headers: { "sec-fetch-site": "cross-site" }, json: {} }), 403, "ORIGIN_NOT_ALLOWED");
  const cli = await api(main, "GET", "/", { user: "user-1", headers: { "sec-fetch-site": "cross-site" } });
  assert.strictEqual(cli.status, 200, "no-Origin cross-site GET (e.g. <video>) is not an origin failure");
  expectJsonError(await api(main, "POST", `/${p.id}/cancel`, { user: "user-1", raw: Buffer.from("target=pipeline"), contentType: "application/x-www-form-urlencoded" }), 415, "UNSUPPORTED_MEDIA");
  expectJsonError(await api(main, "POST", "/", { user: "user-1", json: {} }), 415, "UNSUPPORTED_MEDIA");
});

t("a forged cross-site multipart upload writes nothing to staging and creates nothing", async () => {
  const before = stagingFiles(main).length;
  const projectsBefore = listOwned(main, "user-3").length;
  const enqueues = main.runner.calls.enqueue.length;
  const form = createForm({ clientRequestId: "forged-1" });
  const r = await postCreate(main, "user-3", form, { headers: { origin: "http://evil.example" } });
  expectJsonError(r, 403, "ORIGIN_NOT_ALLOWED");
  assert.strictEqual(r.headers["access-control-allow-origin"], undefined);
  assert.strictEqual(stagingFiles(main).length, before);
  assert.strictEqual(before, 0);
  assert.strictEqual(listOwned(main, "user-3").length, projectsBefore);
  assert.strictEqual(main.runner.calls.enqueue.length, enqueues);
});

t("300 KB JSON body → 413 BODY_TOO_LARGE as JSON (prefix parser + errorHandler, and jsonBodyParser)", async () => {
  const p = await seedProject(main, "user-1");
  const big = { expectedRevision: 1, batchId: "b1", ops: "x".repeat(300 * 1024) };
  const r = await api(main, "POST", `/${p.id}/ops`, { user: "user-1", json: big });
  expectJsonError(r, 413, "BODY_TOO_LARGE");
  assert.strictEqual(r.json.retryable, false);
  const bad = await api(main, "POST", `/${p.id}/ops`, { user: "user-1", raw: Buffer.from("{nope"), contentType: "application/json" });
  expectJsonError(bad, 400, "VALIDATION_FAILED");

  const alt = express();
  alt.use("/api/video-edits", videoEdit.jsonBodyParser({ log: silentLog }));
  alt.post("/api/video-edits/echo", (req, res) => res.json({ ok: true, n: Object.keys(req.body).length }));
  const server = http.createServer(alt);
  servers.push(server);
  const port = await new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));
  const r2 = await request(port, { method: "POST", path: "/api/video-edits/echo", headers: { "content-type": "application/json" }, body: Buffer.from(JSON.stringify(big)) });
  expectJsonError(r2, 413, "BODY_TOO_LARGE");
  const ok = await request(port, { method: "POST", path: "/api/video-edits/echo", headers: { "content-type": "application/json" }, body: Buffer.from("{\"a\":1}") });
  assert.strictEqual(ok.status, 200);
});

// =================================================================================================
section("HTTP: create (admission, idempotency, consent, container)");

let created = null;

t("create with a real lavfi mp4 → 201, QUEUED, source attached, enqueued once, staging empty", async () => {
  const form = createForm({ clientRequestId: "req-abc_1", settings: { ...CONSENT, title: "My clip", removeFillers: "aggressive" } });
  const r = await postCreate(main, "user-3", form);
  assert.strictEqual(r.status, 201, r.text.slice(0, 300));
  const v = r.json.project;
  assert.match(v.id, /^ve_[0-9a-z]{16}$/);
  assert(["QUEUED", "PROCESSING"].includes(v.status), v.status);
  assert.strictEqual(v.mode, "AI_VIDEO_EDIT");
  assert.strictEqual(v.title, "My clip");
  assert.strictEqual(v.settings.removeFillers, "aggressive");
  assert.deepStrictEqual(v.source && [v.source.width, v.source.height, v.source.displayName], [640, 360, "secret clip.mp4"]);
  assert(v.source.hasAudio && Math.abs(v.source.durationSec - 4) < 0.2, JSON.stringify(v.source));
  assert(v.allowedActions.includes("cancel") && v.allowedActions.includes("delete"));
  assert(r.json.costEstimate.usdHigh > 0 && r.json.costEstimate.usdLow <= r.json.costEstimate.usdHigh);
  assert.deepStrictEqual(scanView(r.json, [tmp.dir, "original.bin", "work/", "source/"]), []);

  const stored = main.store.get(v.id);
  assert.strictEqual(stored.ownerId, "user-3");
  assert.strictEqual(stored.clientRequestId, "req-abc_1");
  assert.match(stored.source.sha256, /^[0-9a-f]{64}$/);
  assert.strictEqual(stored.source.demuxer, "mov");
  assert.strictEqual(stored.consent.thirdPartyAi, true);
  assert(fs.existsSync(main.store.abs(v.id, "source/original.bin")));
  assert(fs.existsSync(main.store.abs(v.id, "source/probe.json")));
  assert.strictEqual(fs.statSync(main.store.abs(v.id, "source/original.bin")).size, fs.statSync(FIXTURE).size);
  const enq = main.runner.calls.enqueue.filter((c) => c.id === v.id);
  assert.strictEqual(enq.length, 1);
  assert.deepStrictEqual(stagingFiles(main), []);
  created = v;
});

t("idempotent replay (same user + clientRequestId) → 200 with the same project, nothing new", async () => {
  assert(created, "depends on the create test");
  const before = listOwned(main, "user-3").length;
  const enqueues = main.runner.calls.enqueue.length;
  const r = await postCreate(main, "user-3", createForm({ clientRequestId: "req-abc_1" }));
  assert.strictEqual(r.status, 200, r.text.slice(0, 200));
  assert.strictEqual(r.json.project.id, created.id);
  assert.strictEqual(listOwned(main, "user-3").length, before);
  assert.strictEqual(main.runner.calls.enqueue.length, enqueues);
  assert.deepStrictEqual(stagingFiles(main), []);
  const hinted = await postCreate(main, "user-3", createForm({ clientRequestId: "req-abc_1" }), { query: "?clientRequestId=req-abc_1" });
  assert.strictEqual(hinted.status, 200);
  const other = await postCreate(main, "user-4", createForm({ clientRequestId: "req-abc_1", video: Buffer.from("not a video at all, just text") }));
  expectJsonError(other, 415, "UNSUPPORTED_MEDIA");   // same clientRequestId, other user: not a replay
});

t("consent missing → 422 CONSENT_REQUIRED; invalid settings → 422; missing video / bad clientRequestId → 400", async () => {
  // Every create attempt counts against the per-user create limiter (10/h) — by design; this suite
  // sends more than that for one user, so its window is reset between groups.
  main.router.videoEdit.limiters.create.resetKey("user-3");
  const before = listOwned(main, "user-3").length;
  expectJsonError(await postCreate(main, "user-3", createForm({ settings: {} })), 422, "CONSENT_REQUIRED");
  expectJsonError(await postCreate(main, "user-3", createForm({ settings: { consent: { thirdPartyAi: false, termsVersion: "x" } } })), 422, "CONSENT_REQUIRED");
  const invalid = await postCreate(main, "user-3", createForm({ settings: "{not json" }));
  expectJsonError(invalid, 422, "VALIDATION_FAILED");
  expectJsonError(await postCreate(main, "user-3", createForm({ settings: { ...CONSENT, language: "klingon" } })), 422, "VALIDATION_FAILED");
  expectJsonError(await postCreate(main, "user-3", createForm({ video: null })), 400, "VALIDATION_FAILED");
  expectJsonError(await postCreate(main, "user-3", createForm({ clientRequestId: "has space" })), 400, "VALIDATION_FAILED");
  const extra = multipart([{ name: "settings", data: JSON.stringify(CONSENT) }, { name: "evil", filename: "x.bin", data: Buffer.from("x") }]);
  expectJsonError(await postCreate(main, "user-3", extra), 400, "VALIDATION_FAILED");
  assert.strictEqual(listOwned(main, "user-3").length, before);
  assert.deepStrictEqual(stagingFiles(main), []);
});

t("bad container (text renamed .mp4, playlist) → 415 UNSUPPORTED_MEDIA, nothing kept", async () => {
  main.router.videoEdit.limiters.create.resetKey("user-3");
  const before = listOwned(main, "user-3").length;
  for (const data of [Buffer.from("hello, this is definitely not a video file\n"), Buffer.from("#EXTM3U\n#EXTINF:1,\nfile:///etc/passwd\n")]) {
    const r = await postCreate(main, "user-3", createForm({ video: data, filename: "clip.mp4" }));
    expectJsonError(r, 415, "UNSUPPORTED_MEDIA");
    assert.strictEqual(r.json.details && r.json.details.reason, "UNSUPPORTED_CONTAINER");
  }
  assert.strictEqual(listOwned(main, "user-3").length, before);
  assert.deepStrictEqual(stagingFiles(main), []);
});

t("logo: PNG kept under source/ (never served); a non-image logo → 415 and no project", async () => {
  const bad = await postCreate(main, "user-4", createForm({ clientRequestId: "logo-bad", logo: Buffer.from("<svg onload=alert(1)>") }));
  expectJsonError(bad, 415, "UNSUPPORTED_MEDIA");
  assert.strictEqual(listOwned(main, "user-4").length, 0);
  const r = await postCreate(main, "user-4", createForm({ clientRequestId: "logo-ok", logo: PNG }));
  assert.strictEqual(r.status, 201, r.text.slice(0, 300));
  const id = r.json.project.id;
  assert(fs.existsSync(main.store.abs(id, "source/logo.bin")));
  assert.strictEqual(main.store.get(id).uploads.logo.type, "png");
  expectJsonError(await api(main, "GET", `/${id}/media/logo`, { user: "user-4" }), 404, "NOT_FOUND");
  assert.deepStrictEqual(stagingFiles(main), []);
});

// =================================================================================================
section("HTTP: reads, media, tokens, SSE, lifecycle");

t("GET /:id view: no filesystem paths, tags, hashes or engine internals (even when project.json has them)", async () => {
  const p = await seedProject(main, "user-1", { compress: true });
  await main.store.update(p.id, (d) => {
    d.source.video = { ...d.source.video, tags: { location: "+37.7-122.4" } };
    d.stages.COMPRESSING.inputHash = "d".repeat(64);
    d.stages.COMPRESSING.providerTasks = [{ provider: "kie", taskId: "task-123" }];
    d.errors = [{ at: 1, stage: "COMPRESSING", code: "PROC_EXIT", class: "transient", message: "x", detail: `ffprobe stderr ${tmp.dir}\\secret.mp4` }];
    d.renders = [{ id: "rd_abcdefgh", kind: "preview", planRev: 1, status: "done", file: "render/out/rd_abcdefgh.mp4", sha256: "e".repeat(64), qa: { verdict: "review", score: 70 } }];
    d.discoveries = { durationSec: 6, secretPath: tmp.dir, topics: ["coffee"] };
  });
  const r = await api(main, "GET", `/${p.id}`, { user: "user-1" });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(scanView(r.json, [tmp.dir, "original.bin", "work/", "source/", "+37.7", "task-123", "render/out", "stderr"]), []);
  assert.strictEqual(r.json.posterUrl, `/api/video-edits/${p.id}/media/poster`);
  assert.deepStrictEqual(r.json.discoveries, { durationSec: 6, topics: ["coffee"] });
  assert.strictEqual(r.headers["cache-control"], "no-store");
  const prog = await api(main, "GET", `/${p.id}/progress`, { user: "user-1" });
  assert.strictEqual(prog.status, 200);
  assert.deepStrictEqual(Object.keys(prog.json).sort(), ["activeRenderId", "etaSec", "overallPct", "planRevision", "queuePosition", "stage", "stagePct", "status", "updatedAt"]);
});

t("GET / lists only the caller's projects, newest first, with validated paging", async () => {
  const mine = await api(main, "GET", "/?limit=50", { user: "user-1" });
  assert.strictEqual(mine.status, 200);
  assert(mine.json.projects.length >= 3);
  const own = new Set(listOwned(main, "user-1").map((p) => p.id));
  assert(mine.json.projects.every((s) => own.has(s.id)), "foreign project listed");
  assert(mine.json.projects.every((s, i, a) => i === 0 || a[i - 1].createdAt >= s.createdAt));
  assert.deepStrictEqual(scanView(mine.json, [tmp.dir]), []);
  const theirs = await api(main, "GET", "/", { user: "user-2" });
  assert.deepStrictEqual(theirs.json, { projects: [], nextCursor: null });
  const page = await api(main, "GET", "/?limit=2", { user: "user-1" });
  assert.strictEqual(page.json.projects.length, 2);
  assert(page.json.nextCursor);
  const next = await api(main, "GET", `/?limit=2&cursor=${encodeURIComponent(page.json.nextCursor)}`, { user: "user-1" });
  assert(next.json.projects.every((s) => !page.json.projects.some((x) => x.id === s.id)));
  expectJsonError(await api(main, "GET", "/?limit=0", { user: "user-1" }), 400, "VALIDATION_FAILED");
  expectJsonError(await api(main, "GET", "/?status=BOGUS", { user: "user-1" }), 400, "VALIDATION_FAILED");
  expectJsonError(await api(main, "GET", "/?cursor=garbage", { user: "user-1" }), 400, "VALIDATION_FAILED");
  const queued = await api(main, "GET", "/?status=QUEUED,READY", { user: "user-1" });
  assert(queued.json.projects.every((s) => ["QUEUED", "READY"].includes(s.status)));
  const caps = await api(main, "GET", "/capabilities", { user: "user-1" });
  assert.strictEqual(caps.status, 200);
  assert.strictEqual(caps.json.languages.length, 8);
  assert(caps.json.captionStyles.includes("bold_pop") && caps.json.defaults.settings.language === "auto");
});

let mediaProject = null;

t("media: Range → 206 with exact Content-Range and private headers; poster 200; unknown kinds 404; bad range 416", async () => {
  const p = await seedProject(main, "user-1", { compress: true, proxyBytes: 256 * 1024 });
  mediaProject = p;
  const proxyFile = main.store.abs(p.id, "work/proxy540.mp4");
  const r = await api(main, "GET", `/${p.id}/media/source-proxy`, { user: "user-1", headers: { range: "bytes=0-99" } });
  assert.strictEqual(r.status, 206, r.text.slice(0, 200));
  assert.strictEqual(r.headers["content-range"], `bytes 0-99/${256 * 1024}`);
  assert.strictEqual(r.buf.length, 100);
  assert(r.buf.equals(fs.readFileSync(proxyFile).subarray(0, 100)));
  assert.strictEqual(r.headers["cache-control"], "private, no-store");
  assert.match(r.headers["content-security-policy"], /sandbox/);
  assert.strictEqual(r.headers["x-content-type-options"], "nosniff");
  assert.strictEqual(r.headers["cross-origin-resource-policy"], undefined, "CORP only with WEB_ORIGIN");
  assert.strictEqual(r.headers["accept-ranges"], "bytes");
  const tail = await api(main, "GET", `/${p.id}/media/source-proxy`, { user: "user-1", headers: { range: "bytes=-10" } });
  assert.strictEqual(tail.status, 206);
  assert.strictEqual(tail.buf.length, 10);
  const poster = await api(main, "GET", `/${p.id}/media/poster?download=1`, { user: "user-1" });
  assert.strictEqual(poster.status, 200);
  assert.match(poster.headers["content-type"], /image\/jpeg/);
  assert.match(poster.headers["content-disposition"], /^attachment; filename="seed\.jpg"$/);
  expectJsonError(await api(main, "GET", `/${p.id}/media/source-proxy`, { user: "user-1", headers: { range: "bytes=999999999-" } }), 416, "RANGE_NOT_SATISFIABLE");
  expectJsonError(await api(main, "GET", `/${p.id}/media/export/rd_abcdefgh`, { user: "user-1" }), 404, "NOT_FOUND");
  expectJsonError(await api(main, "GET", `/${p.id}/media/original`, { user: "user-1" }), 404, "NOT_FOUND");
  expectJsonError(await api(main, "GET", `/${p.id}/media/poster/..%2F..%2Fsource%2Foriginal.bin`, { user: "user-1" }), 404, "NOT_FOUND");
  expectJsonError(await api(main, "GET", `/${p.id}/media/poster/UPPER`, { user: "user-1" }), 404, "NOT_FOUND");
  const unprocessed = await seedProject(main, "user-1");
  expectJsonError(await api(main, "GET", `/${unprocessed.id}/media/source-proxy`, { user: "user-1" }), 404, "NOT_FOUND");
});

t("playback tokens: anonymous access bound to project/user/kind/key; bad, expired or foreign tokens refused", async () => {
  const p = mediaProject;
  assert(p, "depends on the media test");
  const r = await api(main, "POST", `/${p.id}/playback-token`, { user: "user-1", json: { items: [{ kind: "source-proxy" }, { kind: "poster", download: true }, { kind: "events" }] } });
  assert.strictEqual(r.status, 200, r.text);
  assert.strictEqual(r.json.urls.length, 3);
  assert(r.json.expiresAt > Date.now() && r.json.expiresAt <= Date.now() + 5 * 60 * 1000 + 2000, "download token shortens expiry");
  const [proxyUrl, posterUrl, eventsUrl] = r.json.urls.map((u) => u.url);
  assert(proxyUrl.startsWith(`/api/video-edits/${p.id}/media/source-proxy?t=`));
  assert(posterUrl.includes("&download=1") && eventsUrl.startsWith(`/api/video-edits/${p.id}/events?t=`));

  const anon = await request(main.port, { path: proxyUrl, headers: { range: "bytes=0-9" } });
  assert.strictEqual(anon.status, 206, anon.text.slice(0, 200));
  const token = new URL(proxyUrl, "http://x").searchParams.get("t");
  expectJsonError(await request(main.port, { path: `/api/video-edits/${p.id}/media/poster?t=${token}` }), 403, "MEDIA_TOKEN_INVALID");
  const mid = token.length - 20;   // inside the signature, where every bit is significant
  const flipped = token.slice(0, mid) + (token[mid] === "A" ? "B" : "A") + token.slice(mid + 1);
  expectJsonError(await request(main.port, { path: `/api/video-edits/${p.id}/media/source-proxy?t=${flipped}` }), 403, "MEDIA_TOKEN_INVALID");
  // Same MAC bytes, different spelling (last char only carries padding bits): still refused.
  const sigPart = token.split(".")[1];
  const last = sigPart[sigPart.length - 1];
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const twin = alphabet[(alphabet.indexOf(last) & ~0b11) | ((alphabet.indexOf(last) + 1) & 0b11)];
  const nonCanonical = token.slice(0, -1) + twin;
  expectJsonError(await request(main.port, { path: `/api/video-edits/${p.id}/media/source-proxy?t=${nonCanonical}` }), 403, "MEDIA_TOKEN_INVALID");
  const expired = mediaToken.signMediaToken({ projectId: p.id, userId: "user-1", kind: "source-proxy" }, { env: ENV, now: () => Date.now() - 3600 * 1000 });
  expectJsonError(await request(main.port, { path: `/api/video-edits/${p.id}/media/source-proxy?t=${expired}` }), 403, "MEDIA_TOKEN_INVALID");
  const otherSecret = mediaToken.signMediaToken({ projectId: p.id, userId: "user-1", kind: "source-proxy" }, { env: { NODE_ENV: "test", SECRET_KEY: "nope" } });
  expectJsonError(await request(main.port, { path: `/api/video-edits/${p.id}/media/source-proxy?t=${otherSecret}` }), 403, "MEDIA_TOKEN_INVALID");
  const sibling = await seedProject(main, "user-1", { compress: true });
  const wrongProject = mediaToken.signMediaToken({ projectId: sibling.id, userId: "user-1", kind: "source-proxy" }, { env: ENV });
  expectJsonError(await request(main.port, { path: `/api/video-edits/${p.id}/media/source-proxy?t=${wrongProject}` }), 403, "MEDIA_TOKEN_INVALID");
  const foreignUser = mediaToken.signMediaToken({ projectId: p.id, userId: "user-2", kind: "source-proxy" }, { env: ENV });
  expectJsonError(await request(main.port, { path: `/api/video-edits/${p.id}/media/source-proxy?t=${foreignUser}` }), 404, "NOT_FOUND");
  const goneUser = mediaToken.signMediaToken({ projectId: p.id, userId: "user-gone", kind: "source-proxy" }, { env: ENV });
  expectJsonError(await request(main.port, { path: `/api/video-edits/${p.id}/media/source-proxy?t=${goneUser}` }), 401, "AUTH_REQUIRED");
  expectJsonError(await request(main.port, { path: `/api/video-edits/${p.id}/media/source-proxy?t=${token}`, headers: as("user-2") }), 403, "MEDIA_TOKEN_INVALID");
  expectJsonError(await request(main.port, { path: `/api/video-edits/${p.id}?t=${token}` }), 401, "AUTH_REQUIRED");
  expectJsonError(await api(main, "POST", `/${p.id}/playback-token`, { user: "user-1", json: { items: [{ kind: "original" }] } }), 422, "VALIDATION_FAILED");

  const sse = await openSse(main.port, eventsUrl);
  assert.strictEqual(sse.status, 200);
  await waitFor(() => sse.events.find((x) => x.type === "snapshot"), { label: "token snapshot" });
  sse.req.destroy();
  expectJsonError(await request(main.port, { path: `/api/video-edits/${p.id}/events?t=${token}` }), 403, "MEDIA_TOKEN_INVALID");
  await waitFor(() => main.streams.count(p.id) === 0, { label: "token stream cleanup" });
});

t("render routes are live, answer honestly before a plan exists, and stay behind auth + ownership", async () => {
  const p = await seedProject(main, "user-1");
  // Rendering is live since Phase 7 (scripts/video_edit_render.test.cjs covers real renders).
  const render = await api(main, "POST", `/${p.id}/render`, { user: "user-1", json: { kind: "preview", planRevision: 1 } });
  assert.strictEqual(render.status, 409, `render → ${render.status}`);
  assert.strictEqual(render.json.error, "NOT_READY");
  const missing = await api(main, "GET", `/${p.id}/renders/rd_abcdefgh`, { user: "user-1" });
  assert.strictEqual(missing.status, 404);
  const exps = await api(main, "GET", `/${p.id}/exports`, { user: "user-1" });
  assert.strictEqual(exps.status, 200);
  assert.deepStrictEqual(exps.json, { currentId: null, stale: false, items: [] });
  for (const [m, u, body] of [["POST", `/${p.id}/render`, { kind: "preview" }], ["GET", `/${p.id}/renders/rd_abcdefgh`], ["GET", `/${p.id}/exports`]]) {
    const other = await api(main, m, u, { user: "user-2", json: m === "POST" ? body : undefined });
    assert.strictEqual(other.status, 404, `other owner ${m} ${u} → ${other.status}`);
    const anon = await api(main, m, u, { json: m === "POST" ? body : undefined });
    assert.strictEqual(anon.status, 401, `anonymous ${m} ${u} → ${anon.status}`);
  }
});

t("SSE: retry line, snapshot, forwarded events with increasing seq, coalesced progress, ping, cleanup on abort", async () => {
  const p = await seedProject(main, "user-1");
  const s = await openSse(main.port, `/api/video-edits/${p.id}/events`, as("user-1"));
  assert.strictEqual(s.status, 200);
  assert.match(s.headers["content-type"], /^text\/event-stream/);
  assert.strictEqual(s.headers["cache-control"], "no-cache, no-transform");
  assert.strictEqual(s.headers["x-accel-buffering"], "no");
  const snap = await waitFor(() => s.events.find((x) => x.type === "snapshot"), { label: "snapshot" });
  assert(s.raw.startsWith("retry: 3000\n\n"));
  assert.strictEqual(snap.data.id, p.id);
  assert.strictEqual(snap.data.seq, 0);
  assert.deepStrictEqual(scanView(snap.data, [tmp.dir]), []);
  assert.strictEqual(main.events.listenerCount(p.id), 1);
  assert.strictEqual(main.streams.count(p.id, "sse"), 1);
  assert.strictEqual(main.router.videoEdit.limiters.streams.count("user-1"), 1);

  const seq = main.events.publish(p.id, "stage", { stage: "VALIDATING", status: "running" });
  const stage = await waitFor(() => s.events.find((x) => x.type === "stage"), { label: "stage event" });
  assert.strictEqual(stage.data.seq, seq);
  for (let i = 1; i <= 6; i++) main.events.publish(p.id, "progress", { status: "PROCESSING", stage: "VALIDATING", stagePct: i * 10 });
  main.events.publish(p.id, "discovery", { stage: "VALIDATING", discoveries: { durationSec: 6 } });
  await waitFor(() => s.events.some((x) => x.type === "discovery"), { label: "discovery" });
  await waitFor(() => { const pr = s.events.filter((x) => x.type === "progress"); return pr.length && pr[pr.length - 1].data.stagePct === 60; }, { timeoutMs: 3000, label: "latest progress" });
  const progress = s.events.filter((x) => x.type === "progress");
  assert(progress.length <= 2, `progress not coalesced (${progress.length} events for 6 publishes)`);
  const seqs = s.events.filter((x) => x.type !== "snapshot").map((x) => x.data.seq);
  assert(seqs.every((v, i) => i === 0 || v > seqs[i - 1]), `seq not increasing: ${seqs.join(",")}`);
  await waitFor(() => s.raw.includes(": ping\n\n"), { timeoutMs: 3000, label: "ping" });

  s.req.destroy();
  await waitFor(() => main.events.listenerCount(p.id) === 0 && main.streams.count(p.id) === 0 && main.router.videoEdit.limiters.streams.count("user-1") === 0, { label: "SSE cleanup" });
});

t("SSE: at most maxStreamsPerUser concurrent streams (429 JSON), slot freed on close", async () => {
  const p = await seedProject(main, "user-1");
  const url = `/api/video-edits/${p.id}/events`;
  const open = [];
  for (let i = 0; i < 3; i++) open.push(await openSse(main.port, url, as("user-1")));
  await waitFor(() => open.every((s) => s.events.some((x) => x.type === "snapshot")), { label: "3 snapshots" });
  const fourth = await openSse(main.port, url, as("user-1"));
  assert.strictEqual(fourth.status, 429);
  assert.strictEqual(fourth.json.error, "RATE_LIMITED");
  assert.strictEqual(fourth.json.retryable, true);
  const otherUser = await openSse(main.port, url, as("user-2"));
  assert.strictEqual(otherUser.status, 404);
  for (const s of open) s.req.destroy();
  await waitFor(() => main.router.videoEdit.limiters.streams.count("user-1") === 0, { label: "slots released" });
  const again = await openSse(main.port, url, as("user-1"));
  assert.strictEqual(again.status, 200);
  again.req.destroy();
  await waitFor(() => main.streams.count(p.id) === 0, { label: "cleanup" });
});

t("cancel: 202 while queued/active, 409 NOTHING_TO_CANCEL otherwise, 422 on a bad body; retry → 202", async () => {
  const p = await seedProject(main, "user-1");
  const r = await api(main, "POST", `/${p.id}/cancel`, { user: "user-1", json: {} });
  assert.strictEqual(r.status, 202, r.text);
  assert.deepStrictEqual(r.json, { cancelling: true });
  const call = main.runner.calls.cancel.filter((c) => c.id === p.id).pop();
  assert.strictEqual(call.opts.target, "pipeline");
  expectJsonError(await api(main, "POST", `/${p.id}/cancel`, { user: "user-1", json: { target: "render" } }), 409, "NOTHING_TO_CANCEL");
  expectJsonError(await api(main, "POST", `/${p.id}/cancel`, { user: "user-1", json: { target: "bogus" } }), 422, "VALIDATION_FAILED");
  const retried = await api(main, "POST", `/${p.id}/retry`, { user: "user-1", json: { mode: "force", stage: "COMPRESSING" } });
  assert.strictEqual(retried.status, 202, retried.text);
  assert.deepStrictEqual(retried.json, { fromStage: "VALIDATING" });
  assert.deepStrictEqual(main.runner.calls.retry.pop().opts, { stage: "COMPRESSING", mode: "force", continueWithout: null });
  expectJsonError(await api(main, "POST", `/${p.id}/retry`, { user: "user-1", json: { mode: "bogus" } }), 422, "VALIDATION_FAILED");
  await main.store.setStatus(p.id, "PROCESSING");
  await main.store.setStatus(p.id, "READY");
  expectJsonError(await api(main, "POST", `/${p.id}/cancel`, { user: "user-1", json: {} }), 409, "NOTHING_TO_CANCEL");
  main.runner.active.add(p.id);
  const active = await api(main, "POST", `/${p.id}/cancel`, { user: "user-1", json: {} });
  assert.strictEqual(active.status, 202);
  main.runner.active.delete(p.id);
});

t("delete: 422 without confirm; 202 → immediately 404 everywhere; open media stream destroyed; directory removed", async () => {
  const p = await seedProject(main, "user-1", { compress: true, proxyBytes: 64 * MB });
  const pdir = main.store.projectDir(p.id);
  const held = await openHeld(main.port, `/api/video-edits/${p.id}/media/source-proxy`, as("user-1"));
  assert.strictEqual(held.status, 200);
  await waitFor(() => main.streams.count(p.id, "media") === 1, { label: "media stream registered" });
  const sse = await openSse(main.port, `/api/video-edits/${p.id}/events`, as("user-1"));
  await waitFor(() => sse.events.some((x) => x.type === "snapshot"), { label: "snapshot before delete" });

  expectJsonError(await api(main, "POST", `/${p.id}/delete`, { user: "user-1", json: {} }), 422, "VALIDATION_FAILED");
  expectJsonError(await api(main, "POST", `/${p.id}/delete`, { user: "user-1", json: { confirm: "ve_0000000000000000" } }), 422, "VALIDATION_FAILED");
  const r = await api(main, "POST", `/${p.id}/delete`, { user: "user-1", json: { confirm: p.id } });
  assert.strictEqual(r.status, 202, r.text);
  assert.deepStrictEqual(r.json, { deleting: true });
  expectJsonError(await api(main, "GET", `/${p.id}`, { user: "user-1" }), 404, "NOT_FOUND");
  expectJsonError(await api(main, "GET", `/${p.id}/media/poster`, { user: "user-1" }), 404, "NOT_FOUND");
  expectJsonError(await api(main, "POST", `/${p.id}/delete`, { user: "user-1", json: { confirm: p.id } }), 404, "NOT_FOUND");
  // The server closed its side before answering 202; a paused client socket only notices once it reads.
  assert.strictEqual(main.streams.count(p.id), 0, "delete closes the project's open streams before answering");
  let received = 0;
  held.res.on("data", (c) => { received += c.length; });
  held.res.resume();
  await waitFor(() => held.closed, { timeoutMs: 5000, label: "media stream destroyed by delete" });
  assert(received < 64 * MB, `media stream was not cut (${received} bytes)`);
  await waitFor(() => sse.closed, { timeoutMs: 5000, label: "SSE closed by delete" });
  await waitFor(() => !fs.existsSync(pdir), { timeoutMs: 20000, label: "project dir moved out" });
  const trash = main.settings.paths.trashDir;
  await waitFor(() => !fs.existsSync(trash) || fs.readdirSync(trash).every((n) => !n.startsWith(p.id)), { timeoutMs: 20000, label: "trash emptied" });
  assert.strictEqual(main.store.get(p.id), null);
  const list = await api(main, "GET", "/?limit=50", { user: "user-1" });
  assert(!list.json.projects.some((s) => s.id === p.id));
  assert(main.runner.calls.abort.includes(p.id), "runner.abort called for the deleted project");
});

// =================================================================================================
section("HTTP: quotas, limits, disabled states, failure bodies");

t("quota: user at maxProjects → 429 QUOTA_EXCEEDED before the body is stored", async () => {
  const q = await makeEnv("quota", { videoEdit: { limits: { perUser: { maxProjects: 1 } } } });
  await seedProject(q, "user-1");
  const r = await postCreate(q, "user-1", createForm({ clientRequestId: "q1" }));
  expectJsonError(r, 429, "QUOTA_EXCEEDED");
  assert.strictEqual(r.json.details.quota, "projects");
  assert.deepStrictEqual(stagingFiles(q), []);
  assert.strictEqual(listOwned(q, "user-1").length, 1);
});

t("preflight: Content-Length over the cap → 413 and low disk → 507, both before multer", async () => {
  const tight = await makeEnv("tight", { videoEdit: { limits: { maxUploadMb: 1 } }, deps: { statfsFreeMb: () => 10 } });
  const big = createForm({ video: crypto.randomBytes(Math.round(2.5 * MB)) });
  expectJsonError(await postCreate(tight, "user-1", big), 413, "FILE_TOO_LARGE");
  const small = createForm({ video: crypto.randomBytes(1024) });
  expectJsonError(await postCreate(tight, "user-1", small), 507, "INSUFFICIENT_STORAGE");
  assert.deepStrictEqual(stagingFiles(tight), []);
});

// Sends the request head plus `sendBytes` of `body`, never the rest, and resolves with the response the server
// sends meanwhile (the proof that it refused without waiting for the whole upload).
function partialUpload(port, { user, form, sendBytes, chunked = false, query = "", timeoutMs = 15000 }) {
  return new Promise((resolve, reject) => {
    const headers = { ...as(user), "content-type": form.contentType };
    if (!chunked) headers["content-length"] = form.body.length;
    const req = http.request({ host: "127.0.0.1", port, method: "POST", path: `/api/video-edits/${query}`, headers, agent: false }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("error", noop);
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try { json = JSON.parse(text); } catch { json = null; }
        clearTimeout(timer);
        req.destroy();
        resolve({ status: res.statusCode, text, json });
      });
    });
    const timer = setTimeout(() => { req.destroy(); reject(new Error("no early response: the server waited for the whole body")); }, timeoutMs);
    req.on("error", noop);
    req.write(form.body.subarray(0, sendBytes));   // chunked when no content-length is set
  });
}

t("uploads: a chunked create (no Content-Length) → 411 before a byte is staged", async () => {
  const up = await makeEnv("uploads-chunked");
  const form = createForm({ clientRequestId: "chunky", video: crypto.randomBytes(2 * MB) });
  const r = await partialUpload(up.port, { user: "user-1", form, sendBytes: 256 * 1024, chunked: true });
  expectJsonError(r, 411, "LENGTH_REQUIRED");
  assert.deepStrictEqual(stagingFiles(up), []);
  assert.strictEqual(listOwned(up, "user-1").length, 0);
});

t("uploads: a logo over 5 MB → 413 {field:logo} while the body is still arriving; staging emptied", async () => {
  const up = await makeEnv("uploads-logo");
  const bigLogo = Buffer.concat([PNG, crypto.randomBytes(40 * MB)]);
  const form = createForm({ clientRequestId: "biglogo", logo: bigLogo });
  const logoStart = form.body.indexOf(bigLogo.subarray(0, 64));
  assert(logoStart > 0);
  let maxStaged = 0;
  const poll = setInterval(() => {
    for (const n of stagingFiles(up)) { try { maxStaged = Math.max(maxStaged, fs.statSync(path.join(up.settings.paths.stagingDir, n)).size); } catch { /* removed */ } }
  }, 5);
  let r;
  try {
    r = await partialUpload(up.port, { user: "user-1", form, sendBytes: logoStart + 12 * MB });   // 28 MB of it never sent
  } finally { clearInterval(poll); }
  expectJsonError(r, 413, "FILE_TOO_LARGE");
  assert.deepStrictEqual([r.json.details.field, r.json.details.limitMb], ["logo", 5]);
  assert(maxStaged <= 5 * MB + 1, `a staged file grew to ${maxStaged} bytes`);
  await waitFor(() => stagingFiles(up).length === 0, { label: "staging emptied" });
  assert.strictEqual(listOwned(up, "user-1").length, 0);
});

t("uploads: a ?clientRequestId hint must name the body's create; quotas are re-checked before admission runs", async () => {
  const realAdmission = require("../src/video_edit/media/admission");
  let admits = 0;
  const spy = { ...realAdmission, admitStagedVideo: (...a) => { admits++; return realAdmission.admitStagedVideo(...a); } };
  const h = await makeEnv("uploads-hint", { videoEdit: { limits: { perUser: { createsPerDay: 1 } } }, deps: { admission: spy } });
  await seedProject(h, "user-1", { clientRequestId: "first" });
  expectJsonError(await postCreate(h, "user-1", createForm({ clientRequestId: "second" })), 429, "QUOTA_EXCEEDED");
  const borrowed = await postCreate(h, "user-1", createForm({ clientRequestId: "second" }), { query: "?clientRequestId=first" });
  expectJsonError(borrowed, 400, "VALIDATION_FAILED");
  assert.deepStrictEqual([borrowed.json.details.field, borrowed.json.details.reason], ["clientRequestId", "HINT_MISMATCH"]);
  expectJsonError(await postCreate(h, "user-1", createForm({}), { query: "?clientRequestId=first" }), 400, "VALIDATION_FAILED");
  assert.strictEqual(admits, 0, "no ffprobe/ffmpeg for a borrowed hint");
  assert.deepStrictEqual(stagingFiles(h), []);
  const replay = await postCreate(h, "user-1", createForm({ clientRequestId: "first" }), { query: "?clientRequestId=first" });
  assert.strictEqual(replay.status, 200, replay.text.slice(0, 200));
  assert.strictEqual(listOwned(h, "user-1").length, 1);

  // Quota spent while the body uploaded (another request, another tab): refused before admission too.
  let perUserCounts = 0;
  const racy = await makeEnv("uploads-racy", {
    deps: { admission: spy },
    storeWrap: (s) => ({ ...s, countCreatesSince(q) { if (q && q.ownerId !== undefined && ++perUserCounts > 1) return 999; return s.countCreatesSince(q); } }),
  });
  const r = await postCreate(racy, "user-1", createForm({ clientRequestId: "racy-1" }));
  expectJsonError(r, 429, "QUOTA_EXCEEDED");
  assert.strictEqual(r.json.details.quota, "createsPerDay");
  assert.strictEqual(perUserCounts, 2, "checked at preflight and again after the body");
  assert.strictEqual(admits, 0);
  assert.deepStrictEqual(stagingFiles(racy), []);
});

t("rate limit: JSON 429 RATE_LIMITED keyed by user", async () => {
  const rl = await makeEnv("ratelimit", { videoEdit: { limits: { rates: { searchPerHour: 1 } } } });
  const p = await seedProject(rl, "user-1");
  // What matters here is the LIMITER, not the handler: the first call spends the only token of the hour
  // (the live phase-4b handler rejects this made-up itemId, which is fine — it got past the limiter).
  const first = await api(rl, "POST", `/${p.id}/candidates/search`, { user: "user-1", json: { itemId: "b_1", query: "coffee" } });
  assert.notStrictEqual(first.status, 429, "the first search must pass the limiter");
  const second = await api(rl, "POST", `/${p.id}/candidates/search`, { user: "user-1", json: { itemId: "b_1", query: "coffee" } });
  expectJsonError(second, 429, "RATE_LIMITED");
  assert.strictEqual(second.json.retryable, true);
  assert(Number(second.headers["retry-after"]) > 0);
  const p2 = await seedProject(rl, "user-2");
  const otherUser = await api(rl, "POST", `/${p2.id}/candidates/search`, { user: "user-2", json: {} });
  assert.notStrictEqual(otherUser.status, 429, "limits are per user");
});

t("editsEnabled: no STT key / ffmpeg missing / production without secret → 503 on work routes, reads still served", async () => {
  const noKey = await makeEnv("nokey", { env: { NODE_ENV: "test" } });
  const p = await seedProject(noKey, "user-1");
  const r = await postCreate(noKey, "user-1", createForm({}));
  expectJsonError(r, 503, "EDITS_DISABLED");
  assert.strictEqual(r.json.details.reason, "NO_STT_PROVIDER_KEY");
  assert.strictEqual((await api(noKey, "GET", "/", { user: "user-1" })).status, 200);
  assert.strictEqual((await api(noKey, "GET", `/${p.id}`, { user: "user-1" })).status, 200);
  const h = await api(noKey, "GET", "/health");
  assert.strictEqual(h.json.enabled, false);
  assert.strictEqual(h.json.reason, "NO_STT_PROVIDER_KEY");
  assert.deepStrictEqual(stagingFiles(noKey), []);

  const noFf = await makeEnv("noffmpeg", { deps: { toolVersions: async () => ({ ffmpeg: null, ffprobe: null }) } });
  const p2 = await seedProject(noFf, "user-1");
  const r2 = await api(noFf, "POST", `/${p2.id}/retry`, { user: "user-1", json: {} });
  expectJsonError(r2, 503, "EDITS_DISABLED");
  assert.strictEqual(r2.json.details.reason, "FFMPEG_MISSING");
  assert.strictEqual((await api(noFf, "GET", "/health", { user: "user-1" })).json.ffmpeg.ok, false);
  assert.deepStrictEqual((await api(noFf, "GET", "/health")).json, { enabled: false, reason: "FFMPEG_MISSING" });

  const prod = await makeEnv("prod", { env: { NODE_ENV: "production", OPENROUTER_API_KEY: "k" } });
  const p3 = await seedProject(prod, "user-1");
  const r3 = await api(prod, "POST", `/${p3.id}/retry`, { user: "user-1", json: {} });
  assert.strictEqual(r3.json.details.reason, "NO_SECRET_KEY");
  expectJsonError(await api(prod, "POST", `/${p3.id}/playback-token`, { user: "user-1", json: { items: [{ kind: "poster" }] } }), 503, "EDITS_DISABLED");
  expectJsonError(await api(prod, "GET", "/", { user: "user-1", headers: { origin: "http://localhost:5173" } }), 403, "ORIGIN_NOT_ALLOWED");
});

t("index.buildRouter: disabled settings → router answers 503 EDITS_DISABLED{reason}, health explains", async () => {
  const settings = makeSettings(path.join(tmp.dir, "disabled"), { videoEdit: { enabled: false } });
  const router = videoEdit.buildRouter({ settings, readUserId, findUserById, log: silentLog });
  assert(router.videoEdit && router.videoEdit.disabled);
  const port = await serve(router);
  const h = await request(port, { path: "/api/video-edits/health" });
  assert.strictEqual(h.status, 200);
  assert.strictEqual(h.json.enabled, false);
  assert.strictEqual(h.json.reason, "DISABLED_BY_CONFIG");
  const r = await request(port, { path: "/api/video-edits/", headers: as("user-1") });
  expectJsonError(r, 503, "EDITS_DISABLED");
  assert.strictEqual(r.json.details.reason, "DISABLED_BY_CONFIG");
  const bad = makeSettings(path.join(tmp.dir, "badcfg"), { videoEdit: { dir: "public/edits" } });
  const r2 = await request(await serve(videoEdit.buildRouter({ settings: bad, log: silentLog })), { method: "POST", path: "/api/video-edits/", headers: as("user-1") });
  expectJsonError(r2, 503, "EDITS_DISABLED");
  assert.match(r2.json.details.reason, /^DIR_INSIDE_PUBLIC$/);
});

t("unknown internal errors → 500 INTERNAL with no message, path or stack", async () => {
  const broken = await makeEnv("broken", {
    storeWrap: (s) => ({ ...s, list() { throw new Error(`boom at ${tmp.dir}\\secret\\project.json`); } }),
  });
  const r = await api(broken, "GET", "/", { user: "user-1" });
  expectJsonError(r, 500, "INTERNAL");
  assert(!r.text.includes(tmp.dir) && !r.text.includes("boom") && !r.text.includes("secret"), r.text);
  assert.match(r.json.requestId, /^req_[0-9a-z]{8}$/);
});

t("SSE: stream ends at its max life (client reconnects)", async () => {
  const short = await makeEnv("ssemax", { deps: { sseMaxLifeMs: 300, ssePingMs: 100 } });
  const p = await seedProject(short, "user-1");
  const s = await openSse(short.port, `/api/video-edits/${p.id}/events`, as("user-1"));
  await waitFor(() => s.events.some((x) => x.type === "snapshot"), { label: "snapshot" });
  await waitFor(() => s.closed, { timeoutMs: 3000, label: "max life close" });
  await waitFor(() => short.events.listenerCount(p.id) === 0 && short.router.videoEdit.limiters.streams.count("user-1") === 0, { label: "cleanup after max life" });
});

t("index.start() is idempotent, runs recovery on the singletons, and stop() resolves", async () => {
  const stop1 = videoEdit.start({ log: silentLog });
  const stop2 = videoEdit.start({ log: silentLog });
  assert.strictEqual(stop1, stop2);
  const rt = videoEdit.getRuntime();
  assert(rt && !rt.error && rt.store && rt.runner && rt.retention, `runtime error=${rt && rt.error}`);
  const report = await rt.recovery;
  assert(report && report.errors === 0 && !report.disabled, JSON.stringify(report));
  assert(fs.existsSync(process.env.VIDEO_EDIT_DIR));
  await stop1();
  await stop1();
  resetStoreSingleton();
});

// =================================================================================================
(async () => {
  let result;
  try {
    result = await run();
  } finally {
    for (const server of servers) { try { server.closeAllConnections(); server.close(); } catch { /* noop */ } }
    restoreFetch();
    const strayEdits = !strayBefore.edits && fs.existsSync(path.join(SERVER_ROOT, "edits"));
    const strayIndex = !strayBefore.index && fs.existsSync(path.join(SERVER_ROOT, "video-edits.json"));
    if (strayEdits || strayIndex) {
      console.error(`  FAIL stray files created in server/: edits=${strayEdits} index=${strayIndex}`);
      process.exitCode = 1;
    }
    await new Promise((r) => setTimeout(r, 200));
    tmp.cleanup();
  }
  if (result && result.failed) process.exitCode = 1;
})();
