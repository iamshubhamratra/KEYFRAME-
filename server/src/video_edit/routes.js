// VIDEO EDIT HTTP ROUTES — /api/video-edits, the only door between a browser and an edit project.
//
// WHY THIS EXISTS. Every other /api route in KEYFRAME is anonymous; this one serves people's own raw
// footage, spends AI money and accepts 500 MB uploads. So every route except /health runs the same
// fixed chain (API.md §2), and the order is the security property:
//   requestContext → GET /health → originGuard (before ANY body is stored) → requireEditUser →
//   editsEnabled → per-route rate limit → loadOwnedProject (404 for unknown AND foreign ids) → handler
//   → JSON error handler (never a stack trace, never a path).
// The create route adds, in this order: preflight (Content-Length REQUIRED (411), disk and quotas counting
// every upload still in flight — before the body) → multer into `_staging` via media/admission's storage
// engine (video ≤ maxUploadMb, logo ≤ 5 MB, request total ≤ maxUploadMb + 1 MB, each enforced as the bytes
// arrive) → `?clientRequestId` hint must equal the body's → idempotency → quotas again with the real sizes →
// settings + consent → strict admission (probe + policy + decode samples) → store.createProject +
// attachSource → runner.enqueuePipeline. Every rejection removes staged files. A client that disconnects
// during admission aborts the probe children and creates nothing (clientDisconnectSignal, as routes/projects.js).
// /health answers anonymous (and cross-origin) callers with `{ enabled, reason? }` only; ffmpeg version, disk,
// storage, queue and provider details need a signed-in user on an allowed origin.
//
// Phase-2 routes are live: health, capabilities, create, list, view, progress, events (SSE), cancel,
// retry, delete, playback-token and media (source-proxy, poster). Phase-4b editing routes are live
// (editing/handlers.js): plan, plan/revisions, transcript, ops, undo, redo, settings, candidates,
// candidates/search, and media kind broll-thumb. Render, renders, exports and logo are mounted with the
// FULL middleware chain and answer 501 NOT_IMPLEMENTED, so the security suite already covers them and
// Phase 7 only swaps the handler.
//
// CONTRACT:
//   buildRouter(deps) -> express.Router, with router.videoEdit = { streams, limiters, multipartRoutes, edit }
//     (`edit` is the editing/handlers.js instance this router owns: its plan cache, context loader and
//      in-flight candidate searches, exposed for shutdown and tests)
//     deps: { settings, store, runner (required; `engine` accepted as an alias) · events, queue, retention, streams, limiters, readUserId,
//             findUserById, verifyMediaToken, mediaSecret, env=process.env, now=Date.now, log=console,
//             toolVersions, statfsFreeMb, admission, basePath='/api/video-edits', ssePingMs=15000,
//             sseMaxLifeMs=1800000, brollCandidates, callJson, fetch, brollKeys, contextLoader }
//   jsonErrorHandler({ log }) -> (err, req, res, next)
//   createStreamRegistry() -> { add(projectId, res, kind) -> remove(), count(projectId?, kind?),
//                               closeProject(projectId) -> Promise<n>, closeAll() -> n }
//   clientDisconnectSignal(res) -> AbortSignal
// Logs carry request ids, project ids, codes and durations only.

const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const multer = require("multer");
const { z } = require("zod");
const ids = require("./ids");
const fsx = require("./fsx");
const views = require("./views");
const mediaToken = require("./security/media_token");
const { EditError, isEditError, toErrorBody } = require("./errors");
const { STATUSES, ACTIVE_STATUSES } = require("./constants");
const { normalizeSettings, DEFAULT_SETTINGS, CAPTION_STYLES, LANGUAGES } = require("./settings_schema");
const { faultsAllowed } = require("./faults");
const { originGuard, allowedOrigins, normalizeOrigin } = require("./security/origin_guard");
const { requireEditUser, loadOwnedProject, readEditUser } = require("./security/owner");
const { createLimiters, checkCreateQuota } = require("./security/limits");
const { createEditHandlers } = require("./editing/handlers");

const MB = 1024 * 1024;
const CLIENT_REQUEST_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const MEDIA_KEY_RE = mediaToken.KEY_RE;
const LOGO_MAX_BYTES = 5 * MB;
const SSE_PING_MS = 15 * 1000;
const SSE_MAX_LIFE_MS = 30 * 60 * 1000;
const SSE_PROGRESS_MIN_MS = 500;
const TOKEN_TTL_SEC = 900;
const DOWNLOAD_TOKEN_TTL_SEC = 300;
const CONSENT_TERMS_VERSION = "2026-09";
const MULTIPART_ROUTES = Object.freeze([Object.freeze(["POST", "/"]), Object.freeze(["POST", "/:id/logo"])]);
const VIDEO_CODECS = Object.freeze(["h264", "hevc", "vp8", "vp9", "av1", "mpeg4", "prores"]);
const AUDIO_CODECS = Object.freeze(["aac", "mp3", "opus", "vorbis", "pcm_s16le", "pcm_s24le", "pcm_f32le", "alac", "flac", "ac3", "eac3"]);

const isPlain = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const errCode = (e) => (e && typeof e.code === "string" ? e.code.slice(0, 64) : "INTERNAL");
function delay(ms) {
  return new Promise((resolve) => { const t = setTimeout(resolve, ms); if (t.unref) t.unref(); });
}

// ---- errors ----------------------------------------------------------------------------------
function httpError(code, status, { errorClass = "input", retryable = false, userMessage = null, extra = null } = {}) {
  return new EditError(code, { status, errorClass, retryable, userMessage, extra });
}

function badRequest(field, reason = null) {
  return httpError("VALIDATION_FAILED", 400, { extra: reason ? { field, reason } : { field } });
}

function sendError(req, res, err) {
  if (res.headersSent || res.destroyed) {
    try { if (!res.writableEnded) res.destroy(); } catch { /* noop */ }
    return;
  }
  res.status(isEditError(err) ? err.status : 500).json(toErrorBody(err, req.requestId || null));
}

const MULTIPART_MESSAGE_RE = /^(Unexpected end of form|Multipart: Boundary not found|Malformed part header|Unexpected end of multipart data|Request aborted|Request closed)/;

// Framework errors (body-parser, multer, busboy) → EditError; anything else stays unknown (500 INTERNAL).
function toEditError(err) {
  if (isEditError(err)) return err;
  if (!err || typeof err !== "object") return null;
  if (err instanceof multer.MulterError || err.name === "MulterError") {
    if (err.code === "LIMIT_FILE_SIZE") return httpError("FILE_TOO_LARGE", 413, { extra: { field: err.field || null } });
    return httpError("VALIDATION_FAILED", 400, { extra: { reason: err.code, field: err.field || null } });
  }
  if (err.type === "entity.too.large") return httpError("BODY_TOO_LARGE", 413, { extra: { limitBytes: Number(err.limit) || null } });
  if (err.type === "entity.parse.failed") return httpError("VALIDATION_FAILED", 400, { extra: { reason: "INVALID_JSON" } });
  if (err.type === "charset.unsupported" || err.type === "encoding.unsupported") {
    return httpError("UNSUPPORTED_MEDIA", 415, { userMessage: "Unsupported request encoding.", extra: { reason: "CONTENT_ENCODING" } });
  }
  if (err.type === "request.aborted" || err.type === "request.size.invalid") return httpError("UPLOAD_ABORTED", 400, { retryable: true });
  if (typeof err.message === "string" && MULTIPART_MESSAGE_RE.test(err.message)) {
    return httpError("VALIDATION_FAILED", 400, { extra: { reason: "MALFORMED_MULTIPART" } });
  }
  if (Number.isInteger(err.status) && err.status >= 400 && err.status < 500 && err.expose) {
    return httpError("VALIDATION_FAILED", err.status, { extra: { reason: "BAD_REQUEST" } });
  }
  return null;
}

function jsonErrorHandler({ log = console } = {}) {
  return function videoEditErrorHandler(err, req, res, next) {
    void next;
    const e = toEditError(err);
    const requestId = req.requestId || null;
    try {
      if (!e) (log.error || log.log || console.error).call(log, `[video-edit] request failed requestId=${requestId} code=${errCode(err)}`);
      else if (e.status >= 500) (log.warn || log.log || console.warn).call(log, `[video-edit] request error requestId=${requestId} code=${e.code}`);
    } catch { /* logging must not break the response */ }
    if (res.headersSent || res.destroyed) {
      try { if (!res.writableEnded) res.destroy(); } catch { /* noop */ }
      return;
    }
    res.removeHeader("Content-Disposition");
    res.status(e ? e.status : 500).json(toErrorBody(e || err, requestId));
  };
}

// ---- helpers ---------------------------------------------------------------------------------
function wrap(fn) {
  const handler = function (req, res, next) {
    let r;
    try { r = fn(req, res, next); } catch (e) { return next(e); }
    if (r && typeof r.then === "function") r.then(undefined, next);
    return undefined;
  };
  Object.defineProperty(handler, "name", { value: fn.name || "handler" });
  return handler;
}

function parseBody(schema, body) {
  const input = body === undefined || body === null ? {} : body;
  const r = schema.safeParse(input);
  if (!r.success) {
    throw httpError("VALIDATION_FAILED", 422, {
      extra: { errors: r.error.issues.slice(0, 10).map((i) => `${i.path.length ? i.path.join(".") : "body"}: ${i.message}`) },
    });
  }
  return r.data;
}

// Copied from routes/projects.js (not imported: that module loads config and the template pipeline).
// req 'close' fires as soon as the body is consumed on Node 22; only the RESPONSE closing before it
// finished means the client left.
function clientDisconnectSignal(res) {
  const ac = new AbortController();
  const gone = () => { if (!ac.signal.aborted && !res.writableEnded) ac.abort(new Error("client disconnected")); };
  res.on("close", gone);
  if (res.destroyed || (res.socket && res.socket.destroyed)) gone();
  return ac.signal;
}

function createStreamRegistry() {
  const byProject = new Map();

  function add(projectId, res, kind = "media") {
    let set = byProject.get(projectId);
    if (!set) { set = new Set(); byProject.set(projectId, set); }
    const entry = { res, kind };
    set.add(entry);
    let removed = false;
    return function removeStream() {
      if (removed) return;
      removed = true;
      set.delete(entry);
      if (!set.size && byProject.get(projectId) === set) byProject.delete(projectId);
    };
  }

  function count(projectId, kind) {
    const sets = projectId == null ? [...byProject.values()] : [byProject.get(projectId)].filter(Boolean);
    let n = 0;
    for (const s of sets) for (const e of s) if (!kind || e.kind === kind) n++;
    return n;
  }

  function closeEntry(e) {
    try {
      if (e.kind === "sse" && !e.res.writableEnded) e.res.end();
      else e.res.destroy();
    } catch { /* already gone */ }
  }

  // Resolves once every response has closed AND the file streams behind res.sendFile have had time
  // to release their handles — on Windows a directory with an open file cannot be renamed to _trash.
  async function closeProject(projectId) {
    const set = byProject.get(projectId);
    if (!set || !set.size) return 0;
    const list = [...set];
    byProject.delete(projectId);
    const closed = list.map((e) => new Promise((resolve) => {
      if (e.res.destroyed) return resolve();
      e.res.once("close", resolve);
      const t = setTimeout(resolve, 1000);
      if (t.unref) t.unref();
    }));
    for (const e of list) closeEntry(e);
    await Promise.all(closed);
    await new Promise((r) => setImmediate(r));
    await delay(150);
    return list.length;
  }

  function closeAll() {
    let n = 0;
    for (const set of byProject.values()) for (const e of set) { closeEntry(e); n++; }
    byProject.clear();
    return n;
  }

  return { add, count, closeProject, closeAll };
}

function makeEnabledCheck({ settings, env, toolVersions }) {
  async function reason(level) {
    if (!settings || !settings.enabled) return (settings && settings.disabledReason) || "DISABLED_BY_CONFIG";
    if (level === "read") return null;
    if (env.NODE_ENV === "production" && !env.SECRET_KEY && !env.JWT_SECRET) return "NO_SECRET_KEY";
    let tools = null;
    try { tools = await toolVersions(); } catch { tools = null; }
    if (!tools || !tools.ffmpeg || !tools.ffprobe) return "FFMPEG_MISSING";
    if (!env.OPENROUTER_API_KEY && !env.KIE_API_KEY) return "NO_STT_PROVIDER_KEY";
    return null;
  }
  return { reason };
}

function editsEnabled(check, level) {
  return function editsEnabled(req, res, next) {
    check.reason(level).then((reason) => {
      if (!reason) return next();
      return sendError(req, res, httpError("EDITS_DISABLED", 503, { errorClass: "config", retryable: true, extra: { reason } }));
    }, next);
  };
}

function languageList() {
  let table = null;
  try { table = require("../services/caption_lang").LANGUAGES; } catch { table = null; }
  return LANGUAGES.map((code) => {
    const m = table && isPlain(table[code]) ? table[code] : {};
    return { code, name: m.name || code, native: m.native || code, dir: m.dir === "rtl" ? "rtl" : "ltr" };
  });
}

function asciiFilename(project, ext) {
  const raw = project.title || (project.source && project.source.displayName) || "video";
  const base = String(raw).normalize("NFKD").replace(/[^\x20-\x7e]/g, "").replace(/["\\/:*?<>|;%]/g, "")
    .replace(/\.[A-Za-z0-9]{1,5}$/, "").trim().slice(0, 60);
  return `${base || "video"}${/^\.[a-z0-9]{1,5}$/i.test(ext) ? ext.toLowerCase() : ""}`;
}

async function sniffImage(file) {
  const buf = Buffer.alloc(16);
  let n = 0;
  let fh = null;
  try {
    fh = await fs.promises.open(file, "r");
    ({ bytesRead: n } = await fh.read(buf, 0, 16, 0));
  } catch { return null; }
  finally { if (fh) await fh.close().catch(() => {}); }
  const b = buf.subarray(0, n);
  if (b.length >= 8 && b.readUInt32BE(0) === 0x89504e47 && b.readUInt32BE(4) === 0x0d0a1a0a) return "png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b.length >= 12 && b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP") return "webp";
  return null;
}

// Media kinds resolvable in this phase. Paths come from project.json checkpoints, never from the URL.
function stageOutputRel(project, stage, output, fallbackRel) {
  const rec = isPlain(project.stages) ? project.stages[stage] : null;
  if (!isPlain(rec) || rec.status !== "done") return null;
  const out = isPlain(rec.outputs) ? rec.outputs[output] : null;
  if (isPlain(out) && typeof out.path === "string" && out.path) return out.path;
  return fallbackRel;
}
const MEDIA_RESOLVERS = Object.freeze({
  "source-proxy": { keyed: false, resolve: (p) => stageOutputRel(p, "COMPRESSING", "proxy", "work/proxy540.mp4") },
  poster: { keyed: false, resolve: (p) => stageOutputRel(p, "COMPRESSING", "poster", "work/poster.jpg") },
});

// ---- request bodies --------------------------------------------------------------------------
const CancelBody = z.object({
  target: z.enum(["pipeline", "render"]).default("pipeline"),
  renderId: z.string().regex(/^rd_[0-9a-z]{8}$/).optional(),
}).strip();
const RetryBody = z.object({
  stage: z.string().regex(/^[A-Z][A-Z_]{2,40}$/).optional(),
  mode: z.enum(["resume", "force"]).default("resume"),
  continueWithout: z.enum(["transcript", "broll", "vision"]).optional(),
}).strip();
const DeleteBody = z.object({ confirm: z.string().max(64) }).strip();
const TokenBody = z.object({
  items: z.array(z.object({
    kind: z.enum([...mediaToken.TOKEN_KINDS]),
    key: z.string().regex(MEDIA_KEY_RE).nullable().optional(),
    download: z.boolean().optional(),
  }).strip()).min(1).max(20),
}).strip();

// ---- router ----------------------------------------------------------------------------------
function buildRouter(deps = {}) {
  const { settings, store } = deps;
  const runner = deps.runner || deps.engine;   // API.md §1 names the injectable `engine`
  if (!settings || !settings.paths || !store || !runner) throw new TypeError("video_edit/routes: settings, store and runner are required");
  const events = deps.events && typeof deps.events.subscribe === "function"
    ? deps.events : { publish: () => 0, subscribe: () => () => {}, listenerCount: () => 0 };
  const queue = deps.queue || null;
  const env = deps.env || process.env;
  const now = typeof deps.now === "function" ? deps.now : Date.now;
  const log = deps.log || console;
  const basePath = deps.basePath || views.BASE_PATH;
  const streams = deps.streams || createStreamRegistry();
  const limiters = deps.limiters || createLimiters({ settings });
  const toolVersions = typeof deps.toolVersions === "function" ? deps.toolVersions : () => require("./engine/proc").toolVersions();
  const statfsFreeMb = typeof deps.statfsFreeMb === "function" ? deps.statfsFreeMb : fsx.statfsFreeMb;
  const ssePingMs = Number(deps.ssePingMs) > 0 ? Number(deps.ssePingMs) : SSE_PING_MS;
  const sseMaxLifeMs = Number(deps.sseMaxLifeMs) > 0 ? Number(deps.sseMaxLifeMs) : SSE_MAX_LIFE_MS;
  const closeStreams = (projectId) => streams.closeProject(projectId);
  let retention = deps.retention || null;
  if (retention && typeof retention.setCloseStreams === "function") retention.setCloseStreams(closeStreams);
  const getRetention = () => retention || (retention = require("./retention").createRetention({ store, settings, runner, log, closeStreams }));
  let admissionMod = deps.admission || null;
  const admission = () => admissionMod || (admissionMod = require("./media/admission"));
  const check = makeEnabledCheck({ settings, env, toolVersions });
  const inflight = new Map();   // `${userId}\0${clientRequestId}` -> Promise<projectId|null>

  const say = (level, msg) => { try { (log[level] || log.log || console.log).call(log, msg); } catch { /* noop */ } };
  const viewOf = (project, extra = {}) => views.toProjectView(project, { now: now(), basePath, ...extra });
  const livePosition = (id) => { try { return queue && typeof queue.position === "function" ? queue.position(id) : null; } catch { return null; } };

  const authOpts = { readUserId: deps.readUserId, findUserById: deps.findUserById, verifyMediaToken: deps.verifyMediaToken, tokenSecret: deps.mediaSecret, env, now };
  const auth = requireEditUser(authOpts);
  const authOrToken = requireEditUser({ ...authOpts, allowToken: true });
  const healthViewer = readEditUser(authOpts);
  const readOk = editsEnabled(check, "read");
  const workOk = editsEnabled(check, "work");
  const owned = loadOwnedProject({ store, now });
  const ownedTouch = loadOwnedProject({ store, now, touch: true });

  // Phase-4b editing surface. Built once per router so its plan cache, context loader and in-flight
  // candidate searches live as long as the router does; `deps` overrides are what the tests inject.
  const edit = createEditHandlers({
    store, runner, events, settings, env, now, log, basePath,
    brollCandidates: deps.brollCandidates,
    callJson: deps.callJson,
    fetch: deps.fetch,
    brollKeys: deps.brollKeys,
    contextLoader: deps.contextLoader,
    qaFindingsFor: (p, rev) => (rh ? rh.qaFindingsFor(p, rev) : null),
  });
  // Render surface (render/, engine/render_jobs): preview/export requests, render records, exports, logo upload.
  const renders = deps.renders || null;
  const rh = renders ? require("./render_routes").createRenderHandlers({ store, renders, settings, log, now, events }) : null;
  // `broll-thumb` is served by the editing module; the phase-2 kinds stay in the module constant.
  const mediaResolvers = { ...MEDIA_RESOLVERS, ...(edit.mediaResolvers || {}), ...(rh ? rh.mediaResolvers : {}) };

  function notImplemented(req, res) {
    res.status(501).json({ error: "NOT_IMPLEMENTED", message: "This part of AI video editing is not available yet.", retryable: false, requestId: req.requestId || null });
  }

  function streamSlot(req, res, next) {
    const release = limiters.streams.acquire(req.userId);
    if (!release) {
      return sendError(req, res, httpError("RATE_LIMITED", 429, { errorClass: "transient", retryable: true, extra: { limiter: "streams", max: limiters.streams.max } }));
    }
    res.on("close", release);
    return next();
  }

  // ---- health / capabilities -----------------------------------------------------------------
  // /health runs before originGuard and auth (a load balancer must reach it), and the global CORS reflects any
  // Origin. The ffmpeg build that parses uploads, live free disk and queue depth help an attacker time a
  // disk-fill or pick a demuxer CVE, so they go only to a signed-in user on an allowed (or no) Origin.
  async function healthDetailsAllowed(req) {
    const origin = req.headers.origin;
    if (origin !== undefined) {
      const n = normalizeOrigin(Array.isArray(origin) ? origin[0] : origin);
      if (!n || !allowedOrigins(req, { env }).has(n)) return false;
    }
    try { return !!(await healthViewer(req)); } catch { return false; }
  }

  async function health(req, res) {
    let reason = null;
    try { reason = await check.reason("work"); } catch { reason = "HEALTH_CHECK_FAILED"; }
    if (!(await healthDetailsAllowed(req))) return res.json(reason ? { enabled: false, reason } : { enabled: true });
    const out = {
      enabled: false,
      ffmpeg: { ok: false, version: null },
      providers: { openrouterStt: false, kieStt: false, vision: false, breakers: { openrouter: "closed", kie: "closed" } },
      queue: { depth: 0, active: 0, heavyWaiting: 0 },
      diskFreeMb: null,
      storageUsedMb: null,
      faultsActive: false,
    };
    out.enabled = !reason;
    if (reason) out.reason = reason;
    try {
      const v = await toolVersions();
      out.ffmpeg = { ok: !!(v && v.ffmpeg && v.ffprobe), version: (v && v.ffmpeg) || null };
    } catch { /* defaults */ }
    const order = (settings.providers && settings.providers.stt && settings.providers.stt.order) || [];
    out.providers.openrouterStt = !!env.OPENROUTER_API_KEY && order.includes("openrouter");
    out.providers.kieStt = !!env.KIE_API_KEY && order.includes("kie");
    out.providers.vision = !!(env.OPENROUTER_API_KEY || env.KIE_API_KEY);
    try {
      const { getBreaker } = require("./providers/breaker");
      out.providers.breakers = { openrouter: getBreaker("openrouter").state().state, kie: getBreaker("kie").state().state };
    } catch { /* defaults */ }
    if (queue) {
      try { out.queue = { depth: queue.depth(), active: queue.active(), heavyWaiting: queue.heavyWaiting() }; } catch { /* defaults */ }
    }
    try { out.diskFreeMb = statfsFreeMb(settings.paths.dir); } catch { out.diskFreeMb = null; }
    try {
      const bytes = store.allProjects().reduce((n, p) => n + (Number(p && p.storage && p.storage.bytes) || 0), 0);
      out.storageUsedMb = Math.round(bytes / MB);
    } catch { out.storageUsedMb = null; }
    out.faultsActive = !!(faultsAllowed(settings) && settings.faults && settings.faults.global);
    return res.json(out);
  }

  async function capabilities(req, res) {
    const L = settings.limits;
    let visionAvailable = !!(env.OPENROUTER_API_KEY || env.KIE_API_KEY);
    try {
      if (visionAvailable && !env.KIE_API_KEY) visionAvailable = require("./providers/breaker").getBreaker("openrouter").state().state !== "open";
    } catch { /* keep key-based answer */ }
    res.json({
      limits: {
        maxUploadMb: L.maxUploadMb, minDurationSec: L.minDurationSec, maxDurationSec: L.maxDurationSec,
        minShortEdge: L.minShortEdge, warnShortEdge: L.warnShortEdge, maxLongEdge: L.maxLongEdge,
        minFps: L.minFps, maxFps: L.maxFps, maxAudioStreams: L.maxAudioStreams, logoMaxMb: LOGO_MAX_BYTES / MB,
        containers: ["mp4", "mov", "m4v", "mkv", "webm"], videoCodecs: [...VIDEO_CODECS], audioCodecs: [...AUDIO_CODECS],
        perUser: { maxProjects: L.perUser.maxProjects, maxBytes: L.perUser.maxBytes, maxRunning: L.perUser.maxRunning, maxQueued: L.perUser.maxQueued, createsPerDay: L.perUser.createsPerDay },
      },
      languages: languageList(),
      captionStyles: [...CAPTION_STYLES],
      defaults: { settings: DEFAULT_SETTINGS },
      costPerMinuteUsd: { ...views.COST_PER_MINUTE_USD },
      visionAvailable,
      stockVideoAvailable: !!(env.PEXELS_API_KEY || env.PIXABAY_API_KEY),
      consentTermsVersion: CONSENT_TERMS_VERSION,
    });
  }

  // ---- create --------------------------------------------------------------------------------
  // Bytes of uploads admitted by preflight whose response has not finished yet: concurrent creates each pass
  // a statfs taken before any of them wrote a byte, so they reserve their Content-Length until they end.
  const inflightUploads = { total: 0, byUser: new Map() };
  function reserveUpload(userId, bytes) {
    const n = Number(bytes) > 0 ? Number(bytes) : 0;
    if (!n) return () => {};
    inflightUploads.total += n;
    inflightUploads.byUser.set(userId, (inflightUploads.byUser.get(userId) || 0) + n);
    let released = false;
    return function releaseUpload() {
      if (released) return;
      released = true;
      inflightUploads.total = Math.max(0, inflightUploads.total - n);
      const left = (inflightUploads.byUser.get(userId) || 0) - n;
      if (left > 0) inflightUploads.byUser.set(userId, left); else inflightUploads.byUser.delete(userId);
    };
  }

  async function createPreflight(req, res, next) {
    const pre = admission().preflightUpload(req, {
      settings, store: null, statfsFreeMb, now, requireContentLength: true, reservedBytes: inflightUploads.total,
    });
    // Optional replay hint: a retry of a create whose response was lost must not be refused by the
    // quota it already consumed. createEdit refuses a hint that differs from the body's clientRequestId,
    // and re-checks quotas before admission, so a borrowed hint buys no ffprobe/ffmpeg work.
    const hint = typeof req.query.clientRequestId === "string" && CLIENT_REQUEST_ID_RE.test(req.query.clientRequestId) ? req.query.clientRequestId : null;
    const replay = hint ? store.findByClientRequestId(req.userId, hint) : null;
    if (!replay) {
      checkCreateQuota({
        store, userId: req.userId, settings, now,
        incomingBytes: pre.contentLength + (inflightUploads.byUser.get(req.userId) || 0),
        globalIncomingBytes: pre.contentLength + inflightUploads.total,
      });
    }
    const release = reserveUpload(req.userId, pre.contentLength);
    res.once("finish", release);
    res.once("close", release);
    next();
  }

  // multer (2.x) removes the staged files as soon as the engine refuses a part, but holds next(err) until the
  // client has sent the whole body. A 413 is answered at once instead, with Connection: close, so a 500 MB
  // "logo" costs neither disk nor the rest of its bandwidth; multer's later next(err) finds headers sent.
  function refuseUploadEarly(req, err) {
    const res = req.res;
    if (!res || res.headersSent || res.destroyed) return;
    try { res.setHeader("Connection", "close"); } catch { /* noop */ }
    sendError(req, res, err);
  }

  function earlyRefusingStorage(storage) {
    return {
      _handleFile(req, file, cb) {
        storage._handleFile(req, file, (err, info) => {
          if (err && isEditError(err) && err.status === 413) refuseUploadEarly(req, err);
          cb(err, info);
        });
      },
      _removeFile: (req, file, cb) => storage._removeFile(req, file, cb),
      maxBytes: storage.maxBytes,
    };
  }

  let uploader = null;
  function multerUpload(req, res, next) {
    try {
      if (!uploader) {
        const storage = earlyRefusingStorage(admission().createStagingStorage({ settings, fieldMaxBytes: { logo: LOGO_MAX_BYTES } }));
        uploader = multer({
          storage,
          // fileSize one byte above the engine's cap so the engine (which deletes the partial file) trips first.
          limits: { fileSize: storage.maxBytes + 1, files: 2, fields: 8, fieldSize: 64 * 1024, parts: 12, fieldNameSize: 100, headerPairs: 100 },
        }).fields([{ name: "video", maxCount: 1 }, { name: "logo", maxCount: 1 }]);
      }
    } catch (e) { return next(e); }
    return uploader(req, res, (err) => {
      if (!err) return next();
      admission().discardStaged(req.files, { settings }).catch(() => 0).then(() => next(err));
      return undefined;
    });
  }

  async function findReplay(userId, clientRequestId, key) {
    const existing = store.findByClientRequestId(userId, clientRequestId);
    if (existing) return existing;
    const pending = inflight.get(key);
    if (!pending) return null;
    const id = await pending;
    return id ? store.get(id) : null;
  }

  async function checkLogo(file) {
    if (!(Number(file.size) <= LOGO_MAX_BYTES)) throw httpError("FILE_TOO_LARGE", 413, { extra: { field: "logo", limitMb: LOGO_MAX_BYTES / MB } });
    const type = await sniffImage(file.path);
    if (!type) {
      throw httpError("UNSUPPORTED_MEDIA", 415, { userMessage: "The logo must be a PNG, JPEG or WebP image.", extra: { field: "logo", reason: "LOGO_FORMAT" } });
    }
    file.imageType = type;
  }

  // The logo is an enhancement: failing to keep it never fails the create. It stays under source/
  // (never served) until the branding phase re-encodes it with ffmpeg.
  async function attachLogo(id, file) {
    try {
      if (!fsx.isInsidePath(settings.paths.stagingDir, file.path, { allowEqual: false })) throw new Error("logo outside staging");
      fsx.renameWithRetrySync(file.path, store.abs(id, "source/logo.bin"));
      await store.update(id, (d) => {
        d.uploads = { ...(isPlain(d.uploads) ? d.uploads : {}), logo: { status: "pending", type: file.imageType, sizeBytes: Number(file.size) || 0, receivedAt: now() } };
      });
    } catch (e) {
      say("warn", `[video-edit] logo not kept project=${id} code=${errCode(e)}`);
      try { await store.addNotice(id, { code: "LOGO_NOT_SAVED", severity: "warn", stage: null, message: "The logo could not be saved; add it again in the editor." }); } catch { /* noop */ }
    }
  }

  async function admitAndCreate({ userId, video, logo, clientRequestId, value, signal }) {
    const admitted = await admission().admitStagedVideo(video, { settings, signal, log });
    if (signal.aborted) throw httpError("UPLOAD_ABORTED", 400, { retryable: true });
    checkCreateQuota({ store, userId, settings, now, incomingBytes: admitted.sizeBytes });
    const project = store.createProject({
      ownerId: userId, clientRequestId, settings: value, title: value.title || null,
      consent: { thirdPartyAi: true, termsVersion: value.consent.termsVersion || null, at: now() },
    });
    const id = project.id;
    const estimate = views.costEstimateFor(admitted.probe && admitted.probe.durationSec, { capUsd: project.cost && project.cost.capUsd });
    try {
      await store.attachSource(id, {
        stagedPath: video.path, sha256: admitted.sha256, sizeBytes: admitted.sizeBytes, demuxer: admitted.demuxer,
        probe: admitted.probe, displayName: admitted.displayName,
      });
      await store.update(id, (d) => { d.cost = { ...(isPlain(d.cost) ? d.cost : {}), estimateUsd: estimate.usdHigh }; });
    } catch (e) {
      say("warn", `[video-edit] create rolled back project=${id} code=${errCode(e)}`);
      try { await store.purge(id); } catch { /* retention sweeps the leftovers */ }
      throw e;
    }
    if (logo) await attachLogo(id, logo);
    let queuePosition = null;
    try {
      const handle = await runner.enqueuePipeline(id, { resume: false });
      if (handle && Number.isInteger(handle.queuePosition)) queuePosition = handle.queuePosition;
      if (handle && handle.done && typeof handle.done.then === "function") handle.done.then(undefined, () => {});
    } catch (e) {
      // The project is QUEUED on disk; boot recovery enqueues it if this process is shutting down.
      say("warn", `[video-edit] enqueue deferred project=${id} code=${errCode(e)}`);
    }
    return { id, queuePosition, estimate };
  }

  async function createEdit(req, res) {
    const started = Date.now();
    const files = isPlain(req.files) ? req.files : {};
    const video = Array.isArray(files.video) ? files.video[0] || null : null;
    const logo = Array.isArray(files.logo) ? files.logo[0] || null : null;
    const signal = clientDisconnectSignal(res);
    const discard = () => admission().discardStaged(req.files, { settings }).catch(() => 0);
    try {
      const body = req.body || {};
      const clientRequestId = body.clientRequestId === undefined || body.clientRequestId === "" ? null : body.clientRequestId;
      if (clientRequestId !== null && (typeof clientRequestId !== "string" || !CLIENT_REQUEST_ID_RE.test(clientRequestId))) throw badRequest("clientRequestId");
      // The hint let preflight skip quotas; it is honoured only for the create it names.
      const hint = req.query ? req.query.clientRequestId : undefined;
      if (hint !== undefined && hint !== clientRequestId) throw badRequest("clientRequestId", "HINT_MISMATCH");
      if (!video) throw badRequest("video", "MISSING_FILE");
      if (body.settings !== undefined && typeof body.settings !== "string") throw badRequest("settings");

      const key = clientRequestId ? `${req.userId} ${clientRequestId}` : null;
      if (key) {
        const existing = await findReplay(req.userId, clientRequestId, key);
        if (existing) {
          await discard();
          const estimate = views.costEstimateFor(existing.source && existing.source.durationSec, { capUsd: existing.cost && existing.cost.capUsd });
          say("info", `[video-edit] create replayed project=${existing.id}`);
          return res.status(200).json({ project: viewOf(existing), costEstimate: estimate });
        }
      }

      // Not a replay: quotas with the real staged sizes, BEFORE any probe or decode child runs (the preflight
      // may have trusted a replay hint, and quotas can be spent by other requests while this body uploaded).
      const stagedBytes = (f) => (f && Number(f.size) > 0 ? Number(f.size) : 0);
      checkCreateQuota({ store, userId: req.userId, settings, now, incomingBytes: stagedBytes(video) + stagedBytes(logo) });

      const norm = normalizeSettings(body.settings === undefined ? {} : body.settings, {
        allowDebugFaults: faultsAllowed(settings), maxUsdCap: settings.caps && settings.caps.maxUsdPerProject,
      });
      if (!norm.ok) throw httpError("VALIDATION_FAILED", 422, { extra: { errors: norm.errors.slice(0, 10) } });
      if (!norm.value.consent || norm.value.consent.thirdPartyAi !== true) throw httpError("CONSENT_REQUIRED", 422);
      if (logo) await checkLogo(logo);

      const work = admitAndCreate({ userId: req.userId, video, logo, clientRequestId, value: norm.value, signal });
      if (key) {
        inflight.set(key, work.then((r) => r.id, () => null));
        const clear = () => { inflight.delete(key); };
        work.then(clear, clear);
      }
      const { id, queuePosition, estimate } = await work;
      await discard();
      say("info", `[video-edit] project admitted project=${id} ms=${Date.now() - started}`);
      return res.status(201).json({ project: viewOf(store.get(id), { queuePosition }), costEstimate: estimate });
    } catch (e) {
      await discard();
      throw e;
    }
  }

  // ---- reads ---------------------------------------------------------------------------------
  async function listEdits(req, res) {
    const q = req.query || {};
    let limit = 20;
    if (q.limit !== undefined) {
      if (typeof q.limit !== "string" || !/^\d{1,3}$/.test(q.limit) || Number(q.limit) < 1 || Number(q.limit) > 50) throw badRequest("limit");
      limit = Number(q.limit);
    }
    let status;
    if (q.status !== undefined) {
      if (typeof q.status !== "string") throw badRequest("status");
      status = q.status.split(",").map((s) => s.trim()).filter(Boolean);
      if (!status.length || status.some((s) => !STATUSES.includes(s))) throw badRequest("status");
    }
    let cursor;
    if (q.cursor !== undefined) {
      if (typeof q.cursor !== "string" || q.cursor.length > 100) throw badRequest("cursor");
      cursor = q.cursor || undefined;
    }
    const page = store.list({ ownerId: req.userId, status, cursor, limit });
    res.json({ projects: page.projects.map((p) => views.toSummary(p, { basePath })), nextCursor: page.nextCursor || null });
  }

  async function getEdit(req, res) {
    // opening an edit whose preview predates the current renderer queues a fresh one (engine/render_jobs.js)
    if (renders && typeof renders.refreshStalePreview === "function") renders.refreshStalePreview(req.project.id);
    res.json(viewOf(req.project, { queuePosition: livePosition(req.project.id) }));
  }

  async function getProgress(req, res) {
    res.json(views.toProgress(req.project, { queuePosition: livePosition(req.project.id) }));
  }

  async function streamEvents(req, res) {
    const id = req.project.id;
    if (req.mediaToken && req.mediaToken.kind !== "events") throw httpError("MEDIA_TOKEN_INVALID", 403);
    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("X-Accel-Buffering", "no");
    res.setHeader("Connection", "keep-alive");
    if (typeof res.flushHeaders === "function") res.flushHeaders();
    try { req.socket.setNoDelay(true); req.socket.setKeepAlive(true); } catch { /* noop */ }

    let closed = false;
    let pendingProgress = null;
    let progressTimer = null;
    let lastProgressAt = 0;
    const write = (chunk) => {
      if (closed || res.writableEnded || res.destroyed) return false;
      try { res.write(chunk); return true; } catch { return false; }
    };
    const send = (type, data) => write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
    const flushProgress = () => {
      if (progressTimer) { clearTimeout(progressTimer); progressTimer = null; }
      if (!pendingProgress) return;
      lastProgressAt = Date.now();
      const data = pendingProgress;
      pendingProgress = null;
      send("progress", data);
    };
    const onEvent = (evt) => {
      if (!evt || typeof evt.type !== "string" || !/^[a-z_]{1,32}$/.test(evt.type)) return;
      let data = isPlain(evt.data) ? evt.data : { seq: evt.seq };
      if (evt.type === "discovery") {
        // Handlers publish raw discoveries; the stream gets the same whitelist as GET /:id (views.js).
        const raw = isPlain(data.discoveries) ? data.discoveries : data;
        data = {
          stage: typeof data.stage === "string" && /^[A-Z][A-Z0-9_]{1,40}$/.test(data.stage) ? data.stage : null,
          discoveries: views.discoveriesView(raw), seq: data.seq,
        };
      }
      if (evt.type === "progress") {
        pendingProgress = data;   // coalesce: ≤ 2 progress events per second per stream (API.md §5)
        const wait = SSE_PROGRESS_MIN_MS - (Date.now() - lastProgressAt);
        if (wait <= 0) flushProgress();
        else if (!progressTimer) progressTimer = setTimeout(flushProgress, wait);
        return;
      }
      if (pendingProgress) flushProgress();   // keep seq order: the older progress goes first
      send(evt.type, data);
    };

    // Subscribe and snapshot in the same tick: nothing can be published in between.
    const unsubscribe = events.subscribe(id, onEvent);
    const removeStream = streams.add(id, res, "sse");
    let ping = null;
    let maxLife = null;
    const cleanup = () => {
      if (closed) return;
      closed = true;
      clearInterval(ping);
      clearTimeout(maxLife);
      clearTimeout(progressTimer);
      unsubscribe();
      removeStream();
    };
    write("retry: 3000\n\n");
    // Snapshot seq 0 is the baseline; bus events carry their own increasing seq.
    send("snapshot", { ...viewOf(store.get(id) || req.project, { queuePosition: livePosition(id) }), seq: 0 });
    ping = setInterval(() => write(": ping\n\n"), ssePingMs);
    maxLife = setTimeout(() => { flushProgress(); cleanup(); try { res.end(); } catch { /* noop */ } }, sseMaxLifeMs);
    res.on("close", cleanup);
    if (res.destroyed || (res.socket && res.socket.destroyed)) cleanup();
  }

  // ---- lifecycle -----------------------------------------------------------------------------
  async function cancelEdit(req, res) {
    const body = parseBody(CancelBody, req.body);
    const p = req.project;
    if (body.target === "pipeline" && !(runner.isActive(p.id) || p.status === "QUEUED")) {
      throw httpError("NOTHING_TO_CANCEL", 409);
    }
    if (body.target === "render") {
      if (!renders) throw httpError("NOTHING_TO_CANCEL", 409);
      await renders.cancel(p.id, { renderId: body.renderId || null });
      return res.status(202).json({ cancelling: true });
    }
    const pending = Promise.resolve().then(() => runner.cancel(p.id, { target: body.target, renderId: body.renderId || null }));
    // cancel() can take up to its hard deadline; surface only an immediate refusal.
    const early = await Promise.race([pending.then(() => null, (e) => e || new Error("cancel failed")), delay(50).then(() => null)]);
    if (early) throw early;
    pending.then(
      (r) => say("info", `[video-edit] cancel settled project=${p.id} forced=${!!(r && r.forced)}`),
      (e) => say("warn", `[video-edit] cancel failed project=${p.id} code=${errCode(e)}`),
    );
    res.status(202).json({ cancelling: true });
  }

  async function retryEdit(req, res) {
    const body = parseBody(RetryBody, req.body);
    const p = req.project;
    const L = settings.limits.perUser;
    const active = store.userActiveCounts(req.userId) || { running: 0, queued: 0 };
    if (!ACTIVE_STATUSES.includes(p.status) && active.running + active.queued >= L.maxRunning + L.maxQueued) {
      throw httpError("QUOTA_EXCEEDED", 429, { errorClass: "resource", retryable: true, extra: { quota: "active", limit: L.maxRunning + L.maxQueued } });
    }
    const r = await runner.retry(p.id, { stage: body.stage || null, mode: body.mode, continueWithout: body.continueWithout || null });
    if (r && r.done && typeof r.done.then === "function") r.done.then(undefined, () => {});
    res.status(202).json({ fromStage: (r && r.fromStage) || null });
  }

  async function deleteEdit(req, res) {
    const body = parseBody(DeleteBody, req.body);
    const id = req.project.id;
    if (body.confirm !== id) throw httpError("VALIDATION_FAILED", 422, { extra: { field: "confirm" } });
    // DELETING is persisted before answering: from here on every route answers 404.
    await store.beginDelete(id, { actor: "user" });
    // An in-flight candidate search holds a fetch and caches this project's plan; drop both before the data goes.
    try { edit.abortProject(id); } catch { /* deletion must not fail on a cache */ }
    try { if (renders) await renders.abortProject(id); } catch { /* renders stop on their own signal */ }
    await closeStreams(id);
    getRetention().deleteProjectData(id, { actor: "user" }).then(
      (r) => say("info", `[video-edit] delete finished project=${id} removed=${!!(r && r.removed)}`),
      (e) => say("warn", `[video-edit] delete failed project=${id} code=${errCode(e)}`),
    );
    res.status(202).json({ deleting: true });
  }

  async function playbackToken(req, res) {
    const body = parseBody(TokenBody, req.body);
    const id = req.project.id;
    const nowSec = Math.floor(now() / 1000);
    let expiresAt = Infinity;
    const urls = body.items.map((item) => {
      const key = item.key || null;
      const ttlSec = item.download ? DOWNLOAD_TOKEN_TTL_SEC : TOKEN_TTL_SEC;
      const token = mediaToken.signMediaToken({ projectId: id, userId: req.userId, kind: item.kind, key }, { ttlSec, secret: deps.mediaSecret, env, now });
      expiresAt = Math.min(expiresAt, (nowSec + ttlSec) * 1000);
      const route = item.kind === "events" ? `${basePath}/${id}/events` : `${basePath}/${id}/media/${item.kind}${key ? `/${key}` : ""}`;
      return { kind: item.kind, key, url: `${route}?t=${encodeURIComponent(token)}${item.download && item.kind !== "events" ? "&download=1" : ""}` };
    });
    res.json({ urls, expiresAt });
  }

  async function serveMedia(req, res, next) {
    const p = req.project;
    const kind = req.params.kind;
    const key = req.params.key === undefined ? null : req.params.key;
    const notReady = () => httpError("NOT_FOUND", 404);
    if (!mediaToken.MEDIA_KINDS.includes(kind)) throw notReady();
    if (key !== null && !MEDIA_KEY_RE.test(key)) throw notReady();
    if (req.mediaToken && (req.mediaToken.kind !== kind || (req.mediaToken.key || null) !== key)) throw httpError("MEDIA_TOKEN_INVALID", 403);
    const resolver = mediaResolvers[kind];
    if (!resolver || resolver.keyed !== (key !== null)) throw notReady();
    const rel = resolver.resolve(p, key);
    if (!rel) throw notReady();

    let abs;
    try { abs = store.abs(p.id, rel); } catch { throw notReady(); }
    let st;
    try { st = await fs.promises.stat(abs); } catch { throw notReady(); }
    if (!st.isFile()) throw notReady();
    const projectDir = store.projectDir(p.id);
    const relForSend = path.relative(projectDir, abs).split(path.sep).join("/");

    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Security-Policy", "sandbox; default-src 'none'");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (String(env.WEB_ORIGIN || "").trim()) res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    if (req.query.download === "1") res.setHeader("Content-Disposition", `attachment; filename="${asciiFilename(p, path.extname(rel))}"`);

    const removeStream = streams.add(p.id, res, "media");
    res.on("close", removeStream);
    res.sendFile(relForSend, { root: projectDir, dotfiles: "deny", acceptRanges: true, etag: true, cacheControl: false, lastModified: true }, (err) => {
      removeStream();
      if (!err) return;
      if (res.headersSent || res.destroyed || ["ECONNABORTED", "ECONNRESET", "EPIPE"].includes(err.code)) return;
      res.removeHeader("Content-Disposition");
      if (err.status === 416 || err.statusCode === 416) {
        const cr = err.headers && (err.headers["Content-Range"] || err.headers["content-range"]);
        if (cr) res.setHeader("Content-Range", cr);
        sendError(req, res, httpError("RANGE_NOT_SATISFIABLE", 416, { userMessage: "The requested range is not available." }));
        return;
      }
      if (err.status === 404 || err.statusCode === 404 || err.code === "ENOENT") { sendError(req, res, notReady()); return; }
      next(err);
    });
  }

  // ---- wiring (order is the security contract; see header) -----------------------------------
  const router = express.Router();
  router.use(function requestContext(req, res, next) {
    req.requestId = ids.newId("req");
    res.setHeader("X-Request-Id", req.requestId);
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  router.get("/health", wrap(health));
  router.use(originGuard({ settings, env }));

  router.get("/capabilities", auth, readOk, wrap(capabilities));
  router.post("/", auth, workOk, limiters.create, wrap(createPreflight), multerUpload, wrap(createEdit));
  router.get("/", auth, readOk, wrap(listEdits));
  router.get("/:id", auth, readOk, ownedTouch, wrap(getEdit));
  router.get("/:id/progress", auth, readOk, owned, wrap(getProgress));
  router.get("/:id/events", authOrToken, readOk, streamSlot, owned, wrap(streamEvents));
  router.get("/:id/plan", auth, readOk, owned, wrap(edit.getPlan));
  router.get("/:id/plan/revisions", auth, readOk, owned, wrap(edit.getRevisions));
  router.get("/:id/transcript", auth, readOk, owned, wrap(edit.getTranscript));
  router.post("/:id/ops", auth, workOk, limiters.ops, owned, wrap(edit.postOps));
  router.post("/:id/undo", auth, workOk, limiters.ops, owned, wrap(edit.postUndo));
  router.post("/:id/redo", auth, workOk, limiters.ops, owned, wrap(edit.postRedo));
  router.post("/:id/settings", auth, workOk, limiters.ops, owned, wrap(edit.postSettings));
  router.get("/:id/candidates", auth, readOk, owned, wrap(edit.getCandidates));
  router.post("/:id/candidates/search", auth, workOk, limiters.search, owned, wrap(edit.postCandidateSearch));
  router.post("/:id/render", auth, workOk, limiters.render, owned, rh ? wrap(rh.postRender) : notImplemented);
  router.get("/:id/renders/:rid", auth, readOk, owned, rh ? wrap(rh.getRender) : notImplemented);
  router.get("/:id/exports", auth, readOk, owned, rh ? wrap(rh.getExports) : notImplemented);
  router.post("/:id/cancel", auth, readOk, limiters.ops, owned, wrap(cancelEdit));
  router.post("/:id/retry", auth, workOk, limiters.ops, owned, wrap(retryEdit));
  router.post("/:id/delete", auth, readOk, limiters.ops, owned, wrap(deleteEdit));
  router.post("/:id/logo", auth, workOk, limiters.ops, owned, ...(rh ? [rh.logoUpload, wrap(rh.postLogo)] : [notImplemented]));
  router.post("/:id/playback-token", auth, readOk, limiters.ops, owned, wrap(playbackToken));
  router.get("/:id/media/:kind/:key?", authOrToken, readOk, owned, wrap(serveMedia));

  // Unknown paths under the prefix: anonymous callers learn nothing about which routes exist.
  router.use(auth, function notFound(req, res) { sendError(req, res, httpError("NOT_FOUND", 404)); });
  router.use(jsonErrorHandler({ log }));

  router.videoEdit = { streams, limiters, multipartRoutes: MULTIPART_ROUTES, edit };
  return router;
}

module.exports = { buildRouter, jsonErrorHandler, createStreamRegistry, clientDisconnectSignal, toEditError, MULTIPART_ROUTES };
