// THE SHARED STOCK-PROVIDER HTTP CLIENT — rate limit, retry, dedup and response cache,
// as a factory any provider gateway can instantiate.
//
// WHY THIS EXISTS. Exactly one provider in this codebase was ever hardened: services/pixabay
// has a rolling-window limiter, in-flight de-duplication, jittered backoff and a response
// cache. Pexels, Openverse and Iconify each had ONE bare `fetch` with an AbortSignal — no
// limiter, no retry, no cache. That was survivable only because Pexels had no key and was
// therefore never called. The moment a second and third provider go live behind up to six
// concurrent fetch lanes x N query variants, an unprotected client is a 429 generator.
//
// WHY IT IS A NEW FILE RATHER THAN A REFACTOR OF pixabay/client.js. services/pixabay is the
// only provider with test coverage (scripts/test-pixabay.js), and it is also load-bearing for
// music and sound effects, not just images. Generalising it in place would put every one of
// those paths at risk to save one file of duplication. This module is modelled on it closely
// enough that the two can be reconciled later if that ever becomes worth doing.
//
// FIVE BEHAVIOURS, each earning its place:
//
//  1. ROLLING-WINDOW RATE LIMIT, PER PROVIDER. Separate state per provider, because the
//     ceilings are wildly different: Pexels allows thousands, while an Unsplash DEMO key
//     allows FIFTY REQUESTS PER HOUR. A shared limiter would either throttle Pexels to
//     Unsplash's ceiling or let Unsplash burn its hourly budget on one film.
//
//  2. IN-FLIGHT DE-DUPLICATION. One film asks for "office team" from several scenes and the
//     fallback ladder re-asks refined variants. Identical concurrent URLs share one promise.
//
//  3. RETRY WITH JITTERED BACKOFF, transient classes only. A 401 is a bad key: retrying it
//     three times delays the truth and spends the budget. 429 and 5xx are retried; 429
//     honours `Retry-After` when the provider sends one.
//
//  4. RESPONSE CACHE. Search responses are small and highly repeatable within a film. This
//     is also the only thing standing between a 50/hour key and a long project.
//
//  5. QUOTA AWARENESS. Providers report what is left (`X-Ratelimit-Remaining`); we read it,
//     expose it, and let a gateway refuse to spend the last of a scarce budget rather than
//     discovering the ceiling by hitting it.
//
// NEVER LOGS A KEY. Auth travels in headers here (not the query string, as Pixabay does), so
// the URL is safe to log — but header values are still never printed, and `describe()` masks.

const { UA } = require("../asset_sources/util");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class StockHttpError extends Error {
  constructor(message, meta = {}) {
    super(message);
    this.name = "StockHttpError";
    this.provider = meta.provider || null;
    this.status = meta.status ?? null;
    this.retryable = !!meta.retryable;
  }
}

/** Network failures, 429 and 5xx are transient. Everything else is our fault, not theirs. */
function classify(status, err) {
  if (err) return { retryable: /abort|timeout|network|fetch failed|ECONN|ENOTFOUND|EAI_AGAIN|socket/i.test(err.message || "") };
  if (status === 429) return { retryable: true };
  if (status >= 500) return { retryable: true };
  return { retryable: false };
}

/**
 * Build a hardened JSON client for one provider.
 *
 * @param {object} opts
 * @param {string} opts.name                       provider id, used in logs and errors
 * @param {() => string} opts.apiKey               resolved key ("" when unusable)
 * @param {() => object} [opts.authHeaders]        headers carrying the key
 * @param {() => {max:number, windowMs:number}} [opts.rateLimit]
 * @param {() => {attempts:number, baseDelayMs:number, maxDelayMs:number}} [opts.retry]
 * @param {() => number} [opts.timeoutMs]
 * @param {() => {ttlMs:number, max:number}} [opts.cache]
 */
function createClient(opts) {
  const name = opts.name;
  const log = (...a) => console.log(`[${name}]`, ...a);
  const rateLimit = opts.rateLimit || (() => ({ max: 60, windowMs: 60_000 }));
  const retryCfg = opts.retry || (() => ({ attempts: 3, baseDelayMs: 500, maxDelayMs: 4000 }));
  const timeoutMs = opts.timeoutMs || (() => 20_000);
  const cacheCfg = opts.cache || (() => ({ ttlMs: 6 * 60 * 60 * 1000, max: 500 }));

  // --- per-provider limiter state (closed over, never shared between providers)
  const stamps = [];
  let admissionQueue = Promise.resolve();
  // What the provider last told us about our own budget.
  let quota = { limit: null, remaining: null, resetAt: null };

  async function throttle() {
    const { max, windowMs } = rateLimit();
    const run = async () => {
      for (;;) {
        const now = Date.now();
        while (stamps.length && now - stamps[0] > windowMs) stamps.shift();
        if (stamps.length < max) { stamps.push(now); return; }
        const waitMs = windowMs - (now - stamps[0]) + 25;
        log(`rate limit reached (${stamps.length}/${max} per ${Math.round(windowMs / 1000)}s) — waiting ${Math.round(waitMs)}ms`);
        await sleep(waitMs);
      }
    };
    // Serialise ADMISSION so concurrent lanes cannot all observe the same free slot.
    const next = admissionQueue.then(run, run);
    admissionQueue = next.catch(() => {});
    return next;
  }

  // --- response cache: insertion-ordered Map used as an LRU (re-set on hit moves to newest)
  const cache = new Map();
  function cacheGet(k) {
    const { ttlMs } = cacheCfg();
    const e = cache.get(k);
    if (!e) return null;
    if (Date.now() - e.at > ttlMs) { cache.delete(k); return null; }
    cache.delete(k); cache.set(k, e);
    return e.body;
  }
  function cacheSet(k, body) {
    const { max } = cacheCfg();
    cache.set(k, { at: Date.now(), body });
    while (cache.size > max) cache.delete(cache.keys().next().value);
  }

  const inFlight = new Map();

  function readQuota(resp) {
    const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : null; };
    const lim = n(resp.headers.get("x-ratelimit-limit"));
    const rem = n(resp.headers.get("x-ratelimit-remaining"));
    const reset = n(resp.headers.get("x-ratelimit-reset"));
    if (lim != null) quota.limit = lim;
    if (rem != null) quota.remaining = rem;
    if (reset != null) quota.resetAt = reset > 1e11 ? reset : reset * 1000; // secs or ms
  }

  /**
   * GET a JSON endpoint. Cached, rate-limited, de-duplicated and retried.
   * @param {string} endpoint
   * @param {object} params query parameters (null/"" are omitted)
   * @param {{noCache?:boolean}} [o]
   */
  async function getJson(endpoint, params, o = {}) {
    const key = opts.apiKey ? opts.apiKey() : "";
    if (opts.apiKey && !key) throw new StockHttpError(`no ${name} API key configured`, { provider: name, retryable: false });

    const url = new URL(endpoint);
    for (const [k, v] of Object.entries(params || {})) {
      if (v != null && v !== "") url.searchParams.set(k, String(v));
    }
    const href = url.toString();

    if (!o.noCache) {
      const cached = cacheGet(href);
      if (cached) { log(`cache HIT ${href.slice(0, 96)}`); return cached; }
    }

    const joined = inFlight.get(href);
    if (joined) { log(`dedup → joining in-flight ${href.slice(0, 96)}`); return joined; }

    const task = (async () => {
      const { attempts, baseDelayMs, maxDelayMs } = retryCfg();
      let lastErr = null;
      for (let attempt = 1; attempt <= attempts; attempt++) {
        await throttle();
        const t0 = Date.now();
        let retryAfterMs = null;
        try {
          const resp = await fetch(href, {
            headers: { "User-Agent": UA, Accept: "application/json", ...(opts.authHeaders ? opts.authHeaders() : {}) },
            signal: AbortSignal.timeout(timeoutMs()),
          });
          readQuota(resp);
          const ms = Date.now() - t0;
          if (resp.ok) {
            const body = await resp.json();
            log(`ok ${ms}ms${quota.remaining != null ? ` quota ${quota.remaining}/${quota.limit ?? "?"}` : ""} ${href.slice(0, 96)}`);
            if (!o.noCache) cacheSet(href, body);
            return body;
          }
          const detail = (await resp.text().catch(() => "")).slice(0, 160);
          const { retryable } = classify(resp.status, null);
          // A provider that tells us how long to wait is worth obeying — guessing shorter
          // just spends another slot to be refused again.
          const ra = Number(resp.headers.get("retry-after"));
          if (Number.isFinite(ra) && ra > 0) retryAfterMs = Math.min(ra * 1000, 30_000);
          lastErr = new StockHttpError(`HTTP ${resp.status}${detail ? ` — ${detail}` : ""}`, { provider: name, status: resp.status, retryable });
          if (!retryable) throw lastErr;
          log(`HTTP ${resp.status} (attempt ${attempt}/${attempts}) ${detail.slice(0, 80)}`);
        } catch (e) {
          if (e instanceof StockHttpError && !e.retryable) throw e;
          const { retryable } = classify(null, e);
          lastErr = e instanceof StockHttpError ? e : new StockHttpError(e.message || String(e), { provider: name, retryable });
          if (!retryable) throw lastErr;
          log(`${e.message} (attempt ${attempt}/${attempts})`);
        }
        if (attempt < attempts) {
          const backoff = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1)) * (0.75 + Math.random() * 0.5);
          await sleep(Math.round(retryAfterMs != null ? Math.max(retryAfterMs, backoff) : backoff));
        }
      }
      throw lastErr || new StockHttpError("exhausted retries", { provider: name, retryable: true });
    })();

    inFlight.set(href, task);
    try { return await task; }
    finally { inFlight.delete(href); }
  }

  /** One cheap call that answers "is this key actually usable?" — a verdict, never a throw. */
  async function probe(endpoint, params) {
    if (opts.apiKey && !opts.apiKey()) return { ok: false, reason: "no API key configured" };
    try {
      await getJson(endpoint, params, { noCache: true });
      return { ok: true, reason: null };
    } catch (e) {
      return { ok: false, reason: e.message };
    }
  }

  return {
    getJson,
    probe,
    /** What the provider last told us about our remaining budget. */
    quota: () => ({ ...quota }),
    /** Requests issued inside the current window — the local view of the same thing. */
    windowUsage: () => {
      const { max, windowMs } = rateLimit();
      const now = Date.now();
      return { used: stamps.filter((s) => now - s <= windowMs).length, max, windowMs };
    },
    clearCache: () => cache.clear(),
    __test: { cache, inFlight, stamps, classify },
  };
}

module.exports = { createClient, StockHttpError, classify };
