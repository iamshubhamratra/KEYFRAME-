// The ONE place that speaks HTTP to Pixabay.
//
// Everything above this file (service, providers, audio) goes through `getJson`. That is
// what makes rate limiting, retry and de-duplication actually hold: a limiter that some
// callers bypass is not a limiter.
//
// FOUR BEHAVIOURS, and each exists because of a specific failure:
//
//  1. RATE LIMIT — Pixabay allows 100 req/60s and answers 429 past it. A film can issue
//     dozens of searches in a burst (one per scene, plus fallback queries), so requests
//     QUEUE against a rolling window instead of racing and getting the whole batch throttled.
//
//  2. IN-FLIGHT DE-DUPLICATION — the same query is very often requested twice in one job
//     (two scenes want "office team", the fallback ladder retries a term). Identical
//     concurrent URLs share ONE promise, so N callers cost one request.
//
//  3. RETRY WITH BACKOFF — only for transient classes (network, timeout, 429, 5xx). A 400
//     is a bad key or a bad parameter; retrying it three times just delays the failure and
//     burns the rate-limit budget. Retrying non-idempotent work would be unsafe; these are
//     all GETs, so it is not.
//
//  4. HONEST ERRORS — a 400 from Pixabay reads "Invalid API key" in the BODY, not the
//     status text. That message is surfaced, because the alternative ("pixabay HTTP 400")
//     is what let an invalid key sit unnoticed while every search silently returned nothing.

const { ENDPOINTS, apiKey, timeoutMs, retry, rateLimit } = require("./config");
const { UA } = require("../asset_sources/util");

const log = (...a) => console.log("[pixabay]", ...a);

// ---------------------------------------------------------------- rate limiter
// A rolling window, not a token bucket: Pixabay's limit is "N requests in the last 60s",
// and a bucket would let a burst through at the window edge.
const stamps = [];
let queue = Promise.resolve();

async function throttle() {
  const { max, windowMs } = rateLimit();
  const run = async () => {
    for (;;) {
      const now = Date.now();
      while (stamps.length && now - stamps[0] > windowMs) stamps.shift();
      if (stamps.length < max) { stamps.push(now); return; }
      const waitMs = windowMs - (now - stamps[0]) + 25;
      log(`rate limit reached (${stamps.length}/${max}) — waiting ${Math.round(waitMs)}ms`);
      await sleep(waitMs);
    }
  };
  // Serialise ADMISSION so concurrent callers cannot all observe the same free slot.
  const next = queue.then(run, run);
  queue = next.catch(() => {});
  return next;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- error classification
class PixabayError extends Error {
  /** @param {string} message @param {{status?:number, retryable?:boolean}} [meta] */
  constructor(message, meta = {}) {
    super(message);
    this.name = "PixabayError";
    this.status = meta.status ?? null;
    this.retryable = !!meta.retryable;
  }
}

/** Network-level failures and 429/5xx are transient; 4xx (except 429) is our fault. */
function classify(status, err) {
  if (err) return { retryable: /abort|timeout|network|fetch failed|ECONN|ENOTFOUND|EAI_AGAIN/i.test(err.message || "") };
  if (status === 429) return { retryable: true };
  if (status >= 500) return { retryable: true };
  return { retryable: false };
}

// ---------------------------------------------------------------- in-flight dedup
/** @type {Map<string, Promise<any>>} */
const inFlight = new Map();

/**
 * GET a Pixabay endpoint as JSON. Rate-limited, de-duplicated and retried.
 * Throws PixabayError; never returns a partial body.
 *
 * @param {string} endpoint
 * @param {Record<string, string|number|boolean|null|undefined>} params
 * @returns {Promise<any>}
 */
async function getJson(endpoint, params) {
  const key = apiKey();
  if (!key) throw new PixabayError("no API key configured", { retryable: false });

  const url = new URL(endpoint);
  url.searchParams.set("key", key);
  for (const [k, v] of Object.entries(params || {})) {
    if (v != null && v !== "") url.searchParams.set(k, String(v));
  }
  const href = url.toString();
  // The key is in the URL, so it must never reach a log line.
  const safe = href.replace(/key=[^&]+/, "key=***");

  const hit = inFlight.get(href);
  if (hit) { log(`dedup → joining in-flight ${safe.slice(0, 96)}`); return hit; }

  const task = (async () => {
    const { attempts, baseDelayMs, maxDelayMs } = retry();
    let lastErr = null;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      await throttle();
      const t0 = Date.now();
      try {
        const resp = await fetch(href, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(timeoutMs()) });
        const ms = Date.now() - t0;
        if (resp.ok) {
          const body = await resp.json();
          log(`ok ${ms}ms hits=${body.totalHits ?? body.total ?? "?"} ${safe.slice(0, 96)}`);
          return body;
        }
        // The reason lives in the body ("[ERROR 400] Invalid API key"), not the status line.
        const detail = (await resp.text().catch(() => "")).slice(0, 160);
        const { retryable } = classify(resp.status, null);
        lastErr = new PixabayError(`HTTP ${resp.status}${detail ? ` — ${detail}` : ""}`, { status: resp.status, retryable });
        if (!retryable) throw lastErr;
        log(`HTTP ${resp.status} (attempt ${attempt}/${attempts}) ${detail.slice(0, 80)}`);
      } catch (e) {
        if (e instanceof PixabayError && !e.retryable) throw e;
        const { retryable } = classify(null, e);
        lastErr = e instanceof PixabayError ? e : new PixabayError(e.message || String(e), { retryable });
        if (!retryable) throw lastErr;
        log(`${e.message} (attempt ${attempt}/${attempts})`);
      }
      if (attempt < attempts) {
        // Exponential backoff with jitter — a fixed delay makes concurrent callers retry in
        // lockstep and hit the same limit again.
        const delay = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1)) * (0.75 + Math.random() * 0.5);
        await sleep(Math.round(delay));
      }
    }
    throw lastErr || new PixabayError("exhausted retries", { retryable: true });
  })();

  inFlight.set(href, task);
  try { return await task; }
  finally { inFlight.delete(href); }
}

/**
 * One cheap call that answers "is this key actually usable?". Returns a plain verdict rather
 * than throwing, because callers use it for diagnostics, not control flow.
 * @returns {Promise<{ok: boolean, reason: string|null}>}
 */
async function probeKey() {
  if (!apiKey()) return { ok: false, reason: "no API key configured" };
  try {
    await getJson(ENDPOINTS.image, { q: "test", per_page: 3 });
    return { ok: true, reason: null };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

module.exports = { getJson, probeKey, PixabayError, __test: { classify, inFlight, stamps } };
