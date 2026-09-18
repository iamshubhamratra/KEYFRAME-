// VIDEO EDIT LIMITS — per-user request rates, create quotas and SSE stream caps.
//
// WHY THIS EXISTS. One edit costs real money (STT, vision, LLM) and minutes of a 2-core CPU, and a
// create accepts up to 500 MB. The IP-keyed limiter the template routes use cannot tell users apart
// behind one NAT and cannot stop one account from filling the disk, so edit limits are keyed by the
// authenticated user (API.md §2 step 5, §8):
//   - express-rate-limit windows per route family (create/h, ops/min, render/h, search/h) with the
//     same JSON 429 body as every other edit error (RATE_LIMITED, retryable, retryAfterSec);
//   - checkCreateQuota — the per-user and global caps a create must pass BEFORE its body is read:
//     projects, bytes, running+queued, creates per day (429 QUOTA_EXCEEDED {quota}), global creates per
//     day (429 DAILY_CAP_REACHED) and the edits storage budget (507 INSUFFICIENT_STORAGE STORAGE_CAP);
//   - a concurrent SSE stream counter (≤ maxStreamsPerUser open event streams per user).
// These are separate from the template `dailyJobCap`, which counts jobs.json only.
//
// CONTRACT:
//   createLimiters({ settings }) -> { create, ops, render, search, streams }   (middlewares + stream counter)
//   createLimiter({ name, windowMs, limit }) -> middleware (named `rateLimit_<name>`, .resetKey(userId))
//   createStreamCounter({ max }) -> { max, acquire(userId) -> release()|null, count(userId), total() }
//   checkCreateQuota({ store, userId, settings, now = Date.now, incomingBytes = 0, globalIncomingBytes = incomingBytes })
//     -> { projects, bytes, running, queued, createsToday, globalCreatesToday }   (throws EditError)
//     incomingBytes counts against the user's storage quota; globalIncomingBytes (e.g. plus every other in-flight
//     upload) against the edits storage cap.

const { EditError, toErrorBody } = require("../errors");
const { DEFAULTS } = require("../settings");

const MB = 1024 * 1024;
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

function loadRateLimit() {
  const mod = require("express-rate-limit");
  return typeof mod === "function" ? mod : (mod.rateLimit || mod.default);
}

function createLimiter({ name, windowMs, limit }) {
  const rateLimit = loadRateLimit();
  const keyOf = (userId) => `user:${userId || "anonymous"}`;
  const mw = rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => keyOf(req.userId),
    handler: (req, res) => {
      const reset = req.rateLimit && req.rateLimit.resetTime instanceof Date ? req.rateLimit.resetTime.getTime() : Date.now() + windowMs;
      const retryAfterSec = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
      res.setHeader("Retry-After", String(retryAfterSec));
      const err = new EditError("RATE_LIMITED", { status: 429, errorClass: "transient", retryable: true, extra: { limiter: name, retryAfterSec } });
      res.status(429).json(toErrorBody(err, req.requestId || null));
    },
    // Keyed by user id, not IP: the proxy / X-Forwarded-For validations do not apply.
    validate: { trustProxy: false, xForwardedForHeader: false, ip: false },
  });
  const limiter = function rateLimited(req, res, next) { return mw(req, res, next); };
  Object.defineProperty(limiter, "name", { value: `rateLimit_${name}` });
  limiter.resetKey = (userId) => mw.resetKey(keyOf(userId));
  return limiter;
}

function createStreamCounter({ max = DEFAULTS.limits.rates.maxStreamsPerUser } = {}) {
  const counts = new Map();
  const cap = Math.max(1, Number(max) || 1);
  return {
    max: cap,
    acquire(userId) {
      if (!userId) return null;
      const key = String(userId);
      const n = counts.get(key) || 0;
      if (n >= cap) return null;
      counts.set(key, n + 1);
      let released = false;
      return function releaseStream() {
        if (released) return;
        released = true;
        const m = (counts.get(key) || 1) - 1;
        if (m <= 0) counts.delete(key); else counts.set(key, m);
      };
    },
    count(userId) { return counts.get(String(userId)) || 0; },
    total() { let n = 0; for (const v of counts.values()) n += v; return n; },
  };
}

function createLimiters({ settings } = {}) {
  const rates = (settings && settings.limits && settings.limits.rates) || DEFAULTS.limits.rates;
  return {
    create: createLimiter({ name: "create", windowMs: HOUR_MS, limit: rates.createPerHour }),
    ops: createLimiter({ name: "ops", windowMs: MINUTE_MS, limit: rates.opsPerMin }),
    render: createLimiter({ name: "render", windowMs: HOUR_MS, limit: rates.renderPerHour }),
    search: createLimiter({ name: "search", windowMs: HOUR_MS, limit: rates.searchPerHour }),
    streams: createStreamCounter({ max: rates.maxStreamsPerUser }),
  };
}

function quotaError(quota, limit, retryable) {
  return new EditError("QUOTA_EXCEEDED", { status: 429, errorClass: "resource", retryable, extra: { quota, limit } });
}

// Counts pages of the owner's own list (≤ 50 per page) instead of cloning every project on disk.
function countUserProjects(store, userId, stopAt) {
  let n = 0;
  let cursor;
  for (let guard = 0; guard < 1000; guard++) {
    const page = store.list({ ownerId: userId, cursor, limit: 50 });
    n += page.projects.length;
    if (!page.nextCursor || n >= stopAt) return n;
    cursor = page.nextCursor;
  }
  return n;
}

function checkCreateQuota({ store, userId, settings, now = Date.now, incomingBytes = 0, globalIncomingBytes } = {}) {
  if (!store) throw new TypeError("video_edit/limits: store is required");
  const L = (settings && settings.limits) || DEFAULTS.limits;
  const t = now();
  const bytesOf = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 && v !== null ? Number(v) : 0);
  const extraBytes = bytesOf(incomingBytes);
  const globalExtraBytes = globalIncomingBytes === undefined ? extraBytes : Math.max(extraBytes, bytesOf(globalIncomingBytes));
  const report = { projects: 0, bytes: 0, running: 0, queued: 0, createsToday: 0, globalCreatesToday: 0 };

  if (userId) {
    report.projects = countUserProjects(store, userId, L.perUser.maxProjects);
    if (report.projects >= L.perUser.maxProjects) throw quotaError("projects", L.perUser.maxProjects, false);
    report.bytes = Number(store.userStorageBytes(userId)) || 0;
    if (report.bytes + extraBytes > L.perUser.maxBytes) throw quotaError("storage", L.perUser.maxBytes, false);
    const active = store.userActiveCounts(userId) || { running: 0, queued: 0 };
    report.running = active.running || 0;
    report.queued = active.queued || 0;
    if (report.running + report.queued >= L.perUser.maxRunning + L.perUser.maxQueued) {
      throw quotaError("active", L.perUser.maxRunning + L.perUser.maxQueued, true);
    }
    report.createsToday = store.countCreatesSince({ ownerId: userId, sinceMs: t - DAY_MS });
    if (report.createsToday >= L.perUser.createsPerDay) throw quotaError("createsPerDay", L.perUser.createsPerDay, true);
  }

  report.globalCreatesToday = store.countCreatesSince({ sinceMs: t - DAY_MS });
  if (report.globalCreatesToday >= L.global.createsPerDay) {
    throw new EditError("DAILY_CAP_REACHED", { status: 429, errorClass: "resource", retryable: true, extra: { limit: L.global.createsPerDay } });
  }

  let totalBytes = 0;
  for (const p of store.allProjects()) {
    if (p && p.status !== "DELETING") totalBytes += Number(p.storage && p.storage.bytes) || 0;
  }
  if ((totalBytes + globalExtraBytes) / MB > L.global.maxStorageMb) {
    throw new EditError("INSUFFICIENT_STORAGE", { status: 507, errorClass: "resource", retryable: true, extra: { reason: "STORAGE_CAP" } });
  }
  return report;
}

module.exports = { createLimiters, createLimiter, createStreamCounter, checkCreateQuota };
