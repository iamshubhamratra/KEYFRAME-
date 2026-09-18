// VIDEO EDIT B-ROLL SEARCH — stock candidates for a slot (SEARCHING_BROLL) or an editor search.
//
// WHY THIS EXISTS. Retrieval is where B-roll quietly dies: a rejected key, a 429 or an empty page used
// to look identical to "nothing matched", and the edit shipped with the speaker only and no reason.
// Here every provider call goes through the same gate — search cache first (zero quota), then the
// provider's circuit breaker, then its process-wide token bucket — and every failure is classified
// (config / rate / transient) into the breaker, recorded per provider, and surfaced as a notice. Per
// query the preferred providers run side by side (Promise.allSettled), so one provider being down just
// means the next one's results are used; a video slot that finds no video at all falls back to images
// (Pexels → Pixabay → Openverse); if everything is down the slot comes back EMPTY WITH A NOTICE, never
// a throw. Only cancellation throws.
//
// Queries are cleaned with query_filter (subjectQuery + acronym whitelist), orientation follows the
// output aspect (provider filter where one exists, and fitting items ranked first), results are
// deduped by provider+id across queries and media kinds, interleaved round-robin across providers and
// queries (diversity before depth), and capped (≤ maxRawPerSlot). Slot results are written to
// `analysis/broll_raw/<slotId>.json` for SCORING_ASSETS.
//
// CONTRACT:
//   searchSlot({ slot:{ slotId, sentenceId, queries, mediaPreference }, output:{ aspect }, settings, signal, fetch,
//                tracker, keys?, cache?, project?, projectDir?, writeJson?(rel,obj), log? })
//     -> { schemaVersion, slotId, sentenceId, output:{aspect, orientation}, queries, kinds, fallbackUsed,
//          providers:{ <name>:{ status, calls, cacheHits, items, errors[] } }, counts, items:RawAsset[], notices, stats, path }
//   searchStock({ query, kind:'video'|'image'|'either', output, page, settings, signal, fetch, tracker, keys?, cache?, project? })
//     -> { query, kind, page, output, items, providers, counts, notices, stats }       (no file written)
//   searchSlots({ slots, concurrency=2, ...searchSlot opts }) -> { results, notices, stats }
//   mergeNotices(list) · orientationForAspect(aspect) · aspectRatioOf(aspect) · coverLoss(w, h, ratio)
//   provider status: 'ok' | 'unconfigured' | 'key_rejected' | 'breaker_open' | 'rate_limited' | 'error' | 'idle'
//   Breakers are named `stock_<provider>`; limiters `stock_<provider>`.

const path = require("node:path");
const fsx = require("../fsx");
const faults = require("../faults");
const { EditError, isEditError } = require("../errors");
const { getBreaker } = require("../providers/breaker");
const { getLimiter } = require("./rate_limit");
const { cacheForSettings } = require("./search_cache");
const { prepareQueries, cleanQuery } = require("./query_filter");
const { resolveRetrievalSettings } = require("./defaults");

const PROVIDERS = Object.freeze({
  pexels: require("./providers/pexels_raw"),
  pixabay: require("./providers/pixabay_raw"),
  openverse: require("./providers/openverse_raw"),
});
const LABELS = Object.freeze({ pexels: "Pexels", pixabay: "Pixabay", openverse: "Openverse" });
const STAGE = "SEARCHING_BROLL";
const MAPPER_VERSION = 1;
const SLOT_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const noopLog = { info() {}, warn() {}, error() {}, log() {} };

// ---- geometry ----------------------------------------------------------------------------------
function aspectRatioOf(aspect) {
  if (typeof aspect === "number" && aspect > 0) return aspect;
  const m = /^\s*(\d+(?:\.\d+)?)\s*[:x/]\s*(\d+(?:\.\d+)?)\s*$/.exec(String(aspect || ""));
  if (!m) return null;
  const w = Number(m[1]), h = Number(m[2]);
  return w > 0 && h > 0 ? w / h : null;
}

function orientationForAspect(aspect) {
  const r = aspectRatioOf(aspect);
  if (!r) return null;
  if (Math.abs(r - 1) <= 0.05) return "square";
  return r < 1 ? "portrait" : "landscape";
}

function coverLoss(w, h, ratio) {
  if (!(w > 0 && h > 0 && ratio > 0)) return null;
  const r = w / h;
  return 1 - Math.min(r / ratio, ratio / r);
}

// ---- keys ---------------------------------------------------------------------------------------
const str = (v) => (typeof v === "string" ? v.trim() : "");
const placeholder = (k) => (/YOUR_/.test(k) ? "" : k);

function resolveKeys(keys) {
  if (keys && typeof keys === "object") return { pexels: placeholder(str(keys.pexels)), pixabay: placeholder(str(keys.pixabay)) };
  if (process.env.VIDEO_EDIT_SKIP_CONFIG === "1") return { pexels: "", pixabay: "" };
  try {
    const config = require("../../config");
    const ap = (config && config.assetProviders) || {};
    return {
      pexels: placeholder(str(ap.pexels && ap.pexels.apiKey)),
      pixabay: placeholder(str((ap.pixabay && ap.pixabay.apiKey) || (config.audio && config.audio.pixabayKey))),
    };
  } catch { return { pexels: "", pixabay: "" }; }
}

// The template pipeline's Pixabay module latches a rejected key process-wide. Consult it only when it is
// already loaded — requiring it would load config (and server/.env) into offline tests.
function pixabayLatchedElsewhere() {
  try {
    const mod = require.cache[require.resolve("../../services/asset_sources/pixabay_api")];
    return !!(mod && mod.exports && typeof mod.exports.keyIsRejected === "function" && mod.exports.keyIsRejected());
  } catch { return false; }
}

// ---- context ------------------------------------------------------------------------------------
function cancelledError(reason) {
  if (isEditError(reason) && reason.errorClass === "cancelled") return reason;
  return new EditError("CANCELLED", { status: 409, errorClass: "cancelled", stage: STAGE });
}

function throwIfAborted(signal) {
  if (signal && signal.aborted) throw cancelledError(signal.reason);
}

function makeCtx(opts) {
  const cfg = resolveRetrievalSettings(opts.settings);
  let cache = null;
  if (opts.cache === false) cache = null;
  else if (opts.cache && typeof opts.cache.get === "function") cache = opts.cache;
  else {
    try { cache = cacheForSettings(opts.settings, cfg.cache); } catch { cache = null; }
  }
  return {
    cfg, cache,
    keys: resolveKeys(opts.keys),
    fetch: typeof opts.fetch === "function" ? opts.fetch : null,
    signal: opts.signal || null,
    settings: opts.settings || null,
    project: opts.project || null,
    tracker: opts.tracker || null,
    log: opts.log || noopLog,
    providers: {},
    stats: { fetches: 0, cacheHits: 0 },
  };
}

function providerState(ctx, p) {
  if (!ctx.providers[p]) ctx.providers[p] = { status: "idle", calls: 0, cacheHits: 0, items: 0, errors: [] };
  return ctx.providers[p];
}

// A provider's status keeps its most informative outcome across calls: any success wins, and a
// rejected key is not hidden by the breaker it opened for the next query.
const STATUS_RANK = Object.freeze({ idle: 0, unconfigured: 1, breaker_open: 2, rate_limited: 3, error: 4, key_rejected: 5, ok: 6 });
function mark(st, status) {
  if ((STATUS_RANK[status] || 0) > (STATUS_RANK[st.status] || 0)) st.status = status;
}

// ---- one provider call ------------------------------------------------------------------------
async function callProvider(ctx, p, kind, q, { orientation, page }) {
  const mod = PROVIDERS[p];
  if (!mod || !mod.kinds.includes(kind)) return [];
  const st = providerState(ctx, p);
  const { cfg } = ctx;
  const perPage = Number(cfg.perPage[p]) || 15;
  const parts = { provider: p, kind, query: q.text, orientation: orientation || "any", page, perPage, v: MAPPER_VERSION };

  if (ctx.cache) {
    const hit = ctx.cache.get(parts);
    if (hit && Array.isArray(hit.items)) {
      st.cacheHits++;
      ctx.stats.cacheHits++;
      st.items += hit.items.length;
      mark(st, "ok");
      return hit.items;
    }
  }
  if (mod.needsKey && !ctx.keys[p]) { mark(st, "unconfigured"); return []; }
  if (p === "pixabay" && pixabayLatchedElsewhere()) { mark(st, "key_rejected"); return []; }

  const breaker = getBreaker(`stock_${p}`);
  if (!breaker.canRequest()) { mark(st, "breaker_open"); return []; }

  const limiter = getLimiter(`stock_${p}`, cfg.rateLimits[p]);
  let release;
  try {
    release = await limiter.acquire({ signal: ctx.signal, maxWaitMs: cfg.rateLimitMaxWaitMs });
  } catch (e) {
    breaker.recordFailure("cancelled"); // releases a half-open probe slot; says nothing about health
    if ((ctx.signal && ctx.signal.aborted) || (isEditError(e) && e.errorClass === "cancelled")) throw cancelledError(ctx.signal && ctx.signal.reason);
    mark(st, "rate_limited");
    return [];
  }

  st.calls++;
  try {
    const fctx = { settings: ctx.settings, project: ctx.project, signal: ctx.signal, stage: STAGE };
    await faults.maybeFail("assets", fctx);
    const shaped = faults.faultFor("assets", fctx);
    let res;
    if (shaped && shaped.mode === "empty") {
      res = { items: [], rateLimit: null, injected: true };
    } else {
      ctx.stats.fetches++;
      res = await mod.search({
        query: q.text, kind, orientation, perPage, page, signal: ctx.signal, fetch: ctx.fetch, apiKey: ctx.keys[p],
        timeoutMs: cfg.timeoutMs, licenses: cfg.openverse.licenses, category: cfg.openverse.category,
        videoType: cfg.pixabay.videoType, imageType: cfg.pixabay.imageType,
      });
      if (ctx.tracker && typeof ctx.tracker.addExternal === "function") {
        try { ctx.tracker.addExternal(`${p}_search`); } catch { /* accounting is best effort */ }
      }
    }
    breaker.recordSuccess();
    const rl = res.rateLimit;
    if (rl && rl.remaining === 0 && Number(rl.resetAt) > Date.now()) {
      limiter.penalize(Math.min(Number(rl.resetAt), Date.now() + cfg.maxPenaltyMs));
    }
    const items = Array.isArray(res.items) ? res.items : [];
    if (ctx.cache && !res.injected) ctx.cache.set(parts, { items, total: res.total == null ? null : res.total }, { empty: items.length === 0 });
    st.items += items.length;
    mark(st, "ok");
    return items;
  } catch (raw) {
    const err = isEditError(raw)
      ? raw
      : new EditError("STOCK_MAPPING_FAILED", { errorClass: "bug", detail: `${p}: ${(raw && raw.name) || "error"}` });
    if (err.errorClass === "cancelled" || (ctx.signal && ctx.signal.aborted)) {
      breaker.recordFailure("cancelled");
      throw cancelledError(ctx.signal && ctx.signal.reason);
    }
    const retryAfterSec = Number(err.extra && err.extra.retryAfterSec);
    breaker.recordFailure(err.errorClass, Number.isFinite(retryAfterSec) && retryAfterSec > 0 ? { retryAfterSec } : {});
    if (err.errorClass === "transient" && Number.isFinite(retryAfterSec) && retryAfterSec > 0) {
      limiter.penalize(Date.now() + Math.min(retryAfterSec * 1000, cfg.maxPenaltyMs));
    }
    st.errors.push({ code: err.code, errorClass: err.errorClass, httpStatus: (err.extra && err.extra.httpStatus) || null });
    if (st.errors.length > 5) st.errors.splice(0, st.errors.length - 5);
    mark(st, err.errorClass === "config" ? "key_rejected" : "error");
    ctx.log.warn(`[video-edit] broll provider=${p} kind=${kind} code=${err.code} class=${err.errorClass}`);
    return [];
  } finally {
    release();
  }
}

// ---- assembly -----------------------------------------------------------------------------------
function interleave(lists) {
  const out = [];
  const max = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < max; i++) for (const l of lists) if (l[i]) out.push(l[i]);
  return out;
}

async function searchKind(ctx, kind, queries, { orientation, page }) {
  const providers = ctx.cfg.providers[kind] || [];
  const perQuery = [];
  // Queries run in order so a breaker opened by the first query spares the provider for the rest.
  for (const q of queries) {
    throwIfAborted(ctx.signal);
    const settled = await Promise.allSettled(providers.map((p) => callProvider(ctx, p, kind, q, { orientation, page })));
    const cancel = settled.find((s) => s.status === "rejected" && isEditError(s.reason) && s.reason.errorClass === "cancelled");
    if (cancel) throw cancel.reason;
    throwIfAborted(ctx.signal);
    const lists = settled.map((s) => (s.status === "fulfilled" && Array.isArray(s.value) ? s.value : []));
    perQuery.push({ kind, query: q, items: interleave(lists) });
  }
  return perQuery;
}

function assemble(groups, { ratio, maxCoverLoss, cap }) {
  const lists = groups.map((g) => g.items.map((it) => ({ it, q: g.query })));
  const seen = new Map();
  const ordered = [];
  let raw = 0;
  let duplicates = 0;
  for (const e of interleave(lists)) {
    raw++;
    const key = e.it.key || `${e.it.provider}:${e.it.providerId}`;
    const prev = seen.get(key);
    if (prev) {
      duplicates++;
      if (!prev.queries.includes(e.q.text)) prev.queries.push(e.q.text);
      continue;
    }
    const loss = coverLoss(e.it.width, e.it.height, ratio);
    const item = {
      ...e.it, key, query: e.q.text, queryKind: e.q.kind, queries: [e.q.text],
      coverLoss: loss == null ? null : Math.round(loss * 1000) / 1000,
      orientationMatch: loss == null ? null : loss <= maxCoverLoss,
    };
    seen.set(key, item);
    ordered.push(item);
  }
  const fitting = ordered.filter((x) => x.orientationMatch !== false);
  const misfit = ordered.filter((x) => x.orientationMatch === false);
  const items = [...fitting, ...misfit].slice(0, cap).map((x, i) => ({ ...x, searchRank: i + 1 }));
  return { items, counts: { raw, duplicates, unique: ordered.length, orientationMismatch: misfit.length, kept: items.length } };
}

function buildNotices(ctx, itemsCount) {
  const notices = [];
  for (const [p, st] of Object.entries(ctx.providers)) {
    const label = LABELS[p] || p;
    if (st.status === "ok" || st.status === "idle") continue;
    if (st.status === "unconfigured") {
      notices.push({ code: "BROLL_PROVIDER_UNCONFIGURED", severity: "info", stage: STAGE, provider: p, message: `${label} is not configured; other stock sources were searched.` });
    } else if (st.status === "key_rejected") {
      notices.push({ code: "BROLL_PROVIDER_REJECTED", severity: "warn", stage: STAGE, provider: p, message: `${label} rejected the API key; other stock sources were searched.` });
    } else {
      notices.push({ code: "BROLL_PROVIDER_UNAVAILABLE", severity: "info", stage: STAGE, provider: p, message: `${label} is unavailable right now; other stock sources were searched.` });
    }
  }
  const states = Object.values(ctx.providers).filter((s) => s.status !== "idle");
  if (!itemsCount && states.length && !states.some((s) => s.status === "ok")) {
    notices.push({ code: "BROLL_SEARCH_UNAVAILABLE", severity: "warn", stage: STAGE, provider: null, message: "Stock footage search is unavailable; the edit uses your footage only." });
  }
  return notices;
}

function mergeNotices(list) {
  const out = [];
  const seen = new Set();
  for (const n of Array.isArray(list) ? list : []) {
    if (!n || !n.code) continue;
    const k = `${n.code}|${n.provider || ""}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(n);
  }
  return out;
}

async function runSearch(ctx, { queries, primary, fallback, orientation, ratio, page }) {
  const groups = [];
  const kinds = [];
  for (const kind of primary) {
    kinds.push(kind);
    groups.push(...await searchKind(ctx, kind, queries, { orientation, page }));
  }
  let fallbackUsed = false;
  if (fallback.length && queries.length && !groups.some((g) => g.items.length)) {
    fallbackUsed = true;
    for (const kind of fallback) {
      if (kinds.includes(kind)) continue;
      kinds.push(kind);
      groups.push(...await searchKind(ctx, kind, queries, { orientation, page }));
    }
  }
  const { items, counts } = assemble(groups, { ratio, maxCoverLoss: ctx.cfg.maxCoverLoss, cap: ctx.cfg.maxRawPerSlot });
  return { items, counts, kinds, fallbackUsed, notices: buildNotices(ctx, items.length) };
}

function kindsFor(pref, cfg) {
  if (pref === "image") return cfg.allowImages ? { primary: ["image"], fallback: [] } : { primary: ["video"], fallback: [] };
  if (pref === "either") return { primary: cfg.allowImages ? ["video", "image"] : ["video"], fallback: [] };
  return { primary: ["video"], fallback: cfg.allowImages && cfg.imageFallback ? ["image"] : [] };
}

// ---- public API -------------------------------------------------------------------------------
async function searchSlot(opts = {}) {
  const { slot, output = null, projectDir = null, writeJson = null } = opts;
  if (!slot || typeof slot !== "object") throw new EditError("BROLL_SLOT_INVALID", { errorClass: "bug", stage: STAGE, detail: "slot required" });
  const slotId = String(slot.slotId || "");
  if (!SLOT_ID_RE.test(slotId)) throw new EditError("BROLL_SLOT_INVALID", { errorClass: "bug", stage: STAGE, detail: "bad slotId" });
  throwIfAborted(opts.signal);
  const ctx = makeCtx(opts);
  const queries = prepareQueries(slot.queries, { whitelist: ctx.cfg.queryWhitelist, max: ctx.cfg.maxQueriesPerSlot, maxChars: ctx.cfg.maxQueryChars });
  const pref = ["video", "image", "either"].includes(slot.mediaPreference) ? slot.mediaPreference : "video";
  const { primary, fallback } = kindsFor(pref, ctx.cfg);
  const aspect = output && output.aspect ? output.aspect : null;
  const orientation = orientationForAspect(aspect);
  const res = queries.length
    ? await runSearch(ctx, { queries, primary, fallback, orientation, ratio: aspectRatioOf(aspect), page: 1 })
    : { items: [], counts: { raw: 0, duplicates: 0, unique: 0, orientationMismatch: 0, kept: 0 }, kinds: [], fallbackUsed: false, notices: [] };

  const doc = {
    schemaVersion: 1, stage: STAGE, slotId, sentenceId: slot.sentenceId == null ? null : slot.sentenceId,
    mediaPreference: pref, output: { aspect, orientation }, queries, kinds: res.kinds, fallbackUsed: res.fallbackUsed,
    skipped: queries.length ? null : "NO_QUERIES", providers: ctx.providers, counts: res.counts, items: res.items,
    notices: res.notices, stats: ctx.stats, searchedAt: Date.now(),
  };
  const rel = `analysis/broll_raw/${slotId}.json`;
  let written = null;
  if (typeof writeJson === "function") {
    await writeJson(rel, doc);
    written = rel;
  } else if (typeof projectDir === "string" && projectDir) {
    const abs = fsx.resolveInside(projectDir, rel);
    fsx.ensureDir(path.dirname(abs));
    fsx.writeJsonAtomic(abs, doc);
    written = rel;
  }
  return { ...doc, path: written };
}

async function searchStock(opts = {}) {
  const { query, kind = "video", output = null, page = 1 } = opts;
  const raw = typeof query === "string" ? query.replace(/\s+/g, " ").trim() : "";
  if (raw.length < 2 || raw.length > 80) {
    throw new EditError("VALIDATION_FAILED", { status: 422, errorClass: "input", stage: STAGE, detail: "query must be 2-80 characters", extra: { field: "query" } });
  }
  if (!["video", "image", "either"].includes(kind)) {
    throw new EditError("VALIDATION_FAILED", { status: 422, errorClass: "input", stage: STAGE, detail: "bad kind", extra: { field: "kind" } });
  }
  throwIfAborted(opts.signal);
  const ctx = makeCtx(opts);
  const text = cleanQuery(raw, { whitelist: ctx.cfg.queryWhitelist, maxChars: ctx.cfg.maxQueryChars }) || raw.slice(0, ctx.cfg.maxQueryChars);
  const queries = [{ text, kind: "user", source: raw }];
  const primary = kind === "either" ? ["video", "image"] : [kind];
  const aspect = output && output.aspect ? output.aspect : null;
  const pageN = Math.max(1, Math.min(50, Math.floor(Number(page)) || 1));
  const res = await runSearch(ctx, { queries, primary, fallback: [], orientation: orientationForAspect(aspect), ratio: aspectRatioOf(aspect), page: pageN });
  return {
    query: text, kind, page: pageN, output: { aspect, orientation: orientationForAspect(aspect) },
    items: res.items, providers: ctx.providers, counts: res.counts, notices: res.notices, stats: ctx.stats,
  };
}

async function searchSlots({ slots, concurrency = 2, ...rest } = {}) {
  const list = Array.isArray(slots) ? slots : [];
  const results = new Array(list.length);
  let next = 0;
  const worker = async () => {
    while (next < list.length) {
      const i = next++;
      results[i] = await searchSlot({ ...rest, slot: list[i] });
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(8, concurrency, list.length || 1)) }, worker));
  const stats = { fetches: 0, cacheHits: 0 };
  for (const r of results) if (r) { stats.fetches += r.stats.fetches; stats.cacheHits += r.stats.cacheHits; }
  return { results, notices: mergeNotices(results.flatMap((r) => (r ? r.notices : []))), stats };
}

module.exports = {
  searchSlot, searchStock, searchSlots, mergeNotices, orientationForAspect, aspectRatioOf, coverLoss, resolveKeys,
  PROVIDERS, MAPPER_VERSION, STAGE,
};
