// VIDEO EDIT STOCK HTTP — one GET-JSON path for every raw stock provider, with classified errors.
//
// WHY THIS EXISTS. The circuit breaker and the fallback chain only work if every provider failure
// arrives with the SAME classification: a rejected key must open the breaker for an hour (config),
// a 429 must honour Retry-After, a 5xx or timeout is transient, a malformed body is a provider fault,
// and a cancel is never a provider failure at all. Each provider hand-rolling fetch would drift. This
// module also never puts a URL (Pixabay keys ride in the query string) or a response body in an error.
//
// CONTRACT:
//   getJson({ provider, url, headers, fetch, signal, timeoutMs=15000, resetMode:'epoch'|'delta', now })
//     -> { status, json, rateLimit:{ limit, remaining, resetAt }|null }
//     throws EditError: CANCELLED (cancelled) · STOCK_TIMEOUT / STOCK_NETWORK / STOCK_HTTP 5xx·408 (transient)
//            STOCK_RATE_LIMITED 429 (transient, extra.retryAfterSec) · STOCK_AUTH 401/403/400-invalid-key (config)
//            STOCK_BAD_QUERY other 400 (input) · STOCK_BAD_RESPONSE non-JSON 2xx (provider) · STOCK_HTTP other (provider)
//   readRateLimit(headers, { resetMode, now }) · parseRetryAfter(value, nowMs) · helpers below

const { EditError } = require("../../errors");
const { UA } = require("../../../services/asset_sources/util");

const num = (v) => {
  if (v === null || v === undefined || v === "" || typeof v === "boolean") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function headerGet(headers, name) {
  if (!headers) return null;
  if (typeof headers.get === "function") return headers.get(name);
  const k = Object.keys(headers).find((h) => h.toLowerCase() === name.toLowerCase());
  return k ? headers[k] : null;
}

function parseRetryAfter(value, nowMs = Date.now()) {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (Number.isFinite(n)) return Math.max(0, Math.ceil(n));
  const d = Date.parse(String(value));
  return Number.isFinite(d) ? Math.max(0, Math.ceil((d - nowMs) / 1000)) : null;
}

// Pexels X-Ratelimit-Reset = epoch seconds; Pixabay X-RateLimit-Reset = seconds until the window resets.
function readRateLimit(headers, { resetMode = "epoch", now = Date.now } = {}) {
  const limit = num(headerGet(headers, "x-ratelimit-limit"));
  const remaining = num(headerGet(headers, "x-ratelimit-remaining"));
  const reset = num(headerGet(headers, "x-ratelimit-reset"));
  if (limit == null && remaining == null && reset == null) return null;
  let resetAt = null;
  if (reset != null) {
    if (reset > 1e11) resetAt = reset;                        // epoch ms
    else if (reset > 1e9 || resetMode === "epoch") resetAt = reset * 1000; // epoch seconds
    else resetAt = now() + reset * 1000;                       // delta seconds
  }
  return { limit, remaining, resetAt };
}

function stockError(code, { provider, errorClass, httpStatus = null, retryable, extra = {}, detail }) {
  return new EditError(code, {
    status: 503, errorClass, retryable: retryable === undefined ? errorClass === "transient" : retryable,
    detail: detail || `${provider}${httpStatus ? ` HTTP ${httpStatus}` : ""}`,
    userMessage: "Stock footage search is unavailable right now.",
    extra: { provider, ...(httpStatus ? { httpStatus } : {}), ...extra },
  });
}

function cancelled(provider) {
  return new EditError("CANCELLED", { status: 409, errorClass: "cancelled", detail: `${provider} request aborted` });
}

function errorForStatus(provider, status, body, headers, rateLimit, now) {
  if (status === 401 || status === 403) return stockError("STOCK_AUTH", { provider, errorClass: "config", httpStatus: status });
  if (status === 400) {
    if (/invalid api key|api[_ ]?key|authenticat|unauthori/i.test(body || "")) {
      return stockError("STOCK_AUTH", { provider, errorClass: "config", httpStatus: status });
    }
    return stockError("STOCK_BAD_QUERY", { provider, errorClass: "input", httpStatus: status });
  }
  if (status === 429) {
    let retryAfterSec = parseRetryAfter(headerGet(headers, "retry-after"), now());
    if (retryAfterSec == null && rateLimit && rateLimit.resetAt) retryAfterSec = Math.max(1, Math.ceil((rateLimit.resetAt - now()) / 1000));
    return stockError("STOCK_RATE_LIMITED", {
      provider, errorClass: "transient", httpStatus: 429, extra: retryAfterSec != null ? { retryAfterSec } : {},
    });
  }
  if (status === 408 || (status >= 500 && status < 600)) return stockError("STOCK_HTTP", { provider, errorClass: "transient", httpStatus: status });
  return stockError("STOCK_HTTP", { provider, errorClass: "provider", httpStatus: status });
}

async function getJson({ provider, url, headers = {}, fetch: fetchImpl = null, signal = null, timeoutMs = 15000, resetMode = "epoch", now = Date.now } = {}) {
  const doFetch = typeof fetchImpl === "function" ? fetchImpl : globalThis.fetch;
  if (signal && signal.aborted) throw cancelled(provider);
  const timeout = AbortSignal.timeout(Math.max(1, Number(timeoutMs) || 15000));
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const failOnAbort = (e) => {
    if (signal && signal.aborted) return cancelled(provider);
    if (timeout.aborted || (e && e.name === "TimeoutError")) {
      return stockError("STOCK_TIMEOUT", { provider, errorClass: "transient", detail: `${provider} timeout ${timeoutMs}ms` });
    }
    return null;
  };

  let res;
  try {
    res = await doFetch(url, { method: "GET", headers: { "User-Agent": UA, Accept: "application/json", ...headers }, signal: combined, redirect: "follow" });
  } catch (e) {
    throw failOnAbort(e) || stockError("STOCK_NETWORK", { provider, errorClass: "transient", detail: `${provider} network ${(e && (e.cause && e.cause.code)) || (e && e.name) || "error"}` });
  }
  const status = Number(res && res.status) || 0;
  const rateLimit = readRateLimit(res && res.headers, { resetMode, now });
  if (status >= 200 && status < 300) {
    let json;
    try { json = await res.json(); }
    catch (e) {
      throw failOnAbort(e) || stockError("STOCK_BAD_RESPONSE", { provider, errorClass: "provider", httpStatus: status, detail: `${provider} non-JSON body` });
    }
    if (!json || typeof json !== "object" || Array.isArray(json)) {
      throw stockError("STOCK_BAD_RESPONSE", { provider, errorClass: "provider", httpStatus: status, detail: `${provider} unexpected body` });
    }
    return { status, json, rateLimit };
  }
  let body = "";
  try { body = String(await res.text()).slice(0, 300); } catch { /* body is a bonus */ }
  throw errorForStatus(provider, status, body, res && res.headers, rateLimit, now);
}

// ---- mapping helpers shared by the raw providers ----------------------------------------------
function httpsUrl(u) {
  if (typeof u !== "string" || u.length > 2048) return null;
  try {
    const p = new URL(u);
    return p.protocol === "https:" ? p.toString() : null;
  } catch { return null; }
}

// "https://www.pexels.com/video/woman-typing-on-a-laptop-3129671/" -> "woman typing on a laptop"
function slugWords(pageUrl) {
  try {
    const segs = new URL(String(pageUrl)).pathname.split("/").filter(Boolean);
    const last = segs[segs.length - 1] || "";
    const words = last.replace(/-?\d+$/, "").split("-").filter((w) => w && /[a-z]/i.test(w));
    if (words.length === 1 && words[0].toLowerCase() === "id") return "";
    return words.join(" ").toLowerCase().slice(0, 200);
  } catch { return ""; }
}

function fileTypeFromUrl(u, fallback = "image/jpeg") {
  const m = /\.([a-z0-9]{2,5})(?:[?#]|$)/i.exec(String(u || ""));
  const ext = m ? m[1].toLowerCase() : "";
  return { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", mp4: "video/mp4", webm: "video/webm" }[ext] || fallback;
}

function bySize(a, b) {
  const pa = (a.width || 0) * (a.height || 0), pb = (b.width || 0) * (b.height || 0);
  return pa - pb || (a.sizeBytes || 0) - (b.sizeBytes || 0);
}

// 25 / 50 / 75 % pictures of an ordered list (null when fewer than one picture).
function stripOf(pictures) {
  const n = Array.isArray(pictures) ? pictures.length : 0;
  if (!n) return null;
  return [0.25, 0.5, 0.75].map((f) => pictures[Math.min(n - 1, Math.floor(n * f))]);
}

const clampInt = (v, lo, hi, dflt) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt;
};

function unconfigured(provider) {
  return new EditError("STOCK_UNCONFIGURED", { status: 503, errorClass: "config", detail: `${provider} key missing`, extra: { provider } });
}

module.exports = {
  getJson, readRateLimit, parseRetryAfter, errorForStatus, headerGet,
  httpsUrl, slugWords, fileTypeFromUrl, bySize, stripOf, clampInt, num, unconfigured,
};
