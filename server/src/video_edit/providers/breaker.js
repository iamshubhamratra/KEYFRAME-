// PROVIDER CIRCUIT BREAKER — stop hammering a provider that is down, out of credit or misconfigured.
//
// WHY THIS EXISTS. STT runs per chunk and several projects can transcribe at once. Without a
// process-wide memory of provider health, a 402 (out of credit) or 401 (bad key) is rediscovered
// by every chunk of every project — each paying a timeout before falling back to KIE. The breaker
// makes the first failure everyone's knowledge: config errors open for 1 h, budget errors until
// the caller's deadline (UTC midnight for daily caps) or 60 min, rate limits honour Retry-After,
// and repeated transient failures open with exponential backoff. After the window one half-open
// probe is let through; its outcome closes or re-opens the circuit.
//
// CONTRACT:
//   getBreaker(name, { now }) -> { canRequest(), recordSuccess(), recordFailure(errorClass, { retryAfterSec, untilMs }),
//                                  state() -> { state:'closed'|'open'|'half-open', openUntil, failures } }
//   resetBreakers()   (tests)
// errorClass 'input' | 'bug' | 'cancelled' never trips the breaker — they say nothing about provider health.

const CONFIG_OPEN_MS = 60 * 60 * 1000;
const BUDGET_OPEN_MS = 60 * 60 * 1000;
const TRANSIENT_THRESHOLD = 3;
const TRANSIENT_BASE_MS = 30 * 1000;
const TRANSIENT_MAX_MS = 5 * 60 * 1000;
const RETRY_AFTER_MAX_SEC = 60;
const IGNORED = new Set(["input", "bug", "cancelled"]);

const breakers = new Map();

function createBreaker(name, clock) {
  let now = clock;
  let failures = 0;       // consecutive failures since the last success
  let trips = 0;          // consecutive openings (drives backoff)
  let openUntil = 0;
  let isOpen = false;
  let probing = false;

  const t = () => now();

  function open(untilMs) {
    isOpen = true;
    probing = false;
    openUntil = Math.max(openUntil, untilMs);
  }

  const api = {
    name,
    setClock(fn) { if (typeof fn === "function") now = fn; },
    canRequest() {
      if (!isOpen) return true;
      if (t() < openUntil) return false;
      if (probing) return false;
      probing = true;            // half-open: exactly one probe
      return true;
    },
    recordSuccess() {
      failures = 0; trips = 0; isOpen = false; probing = false; openUntil = 0;
    },
    recordFailure(errorClass, { retryAfterSec, untilMs } = {}) {
      if (IGNORED.has(errorClass)) { probing = false; return api.state(); }
      failures++;
      const at = t();
      if (Number.isFinite(untilMs) && untilMs > at) { open(untilMs); trips++; return api.state(); }
      if (errorClass === "config") { open(at + CONFIG_OPEN_MS); trips++; return api.state(); }
      if (errorClass === "budget") { open(at + BUDGET_OPEN_MS); trips++; return api.state(); }
      if (Number.isFinite(retryAfterSec) && retryAfterSec > 0) {
        open(at + Math.min(retryAfterSec, RETRY_AFTER_MAX_SEC) * 1000);
        trips++;
        return api.state();
      }
      const wasProbe = isOpen && probing;
      if (wasProbe || failures >= TRANSIENT_THRESHOLD) {
        const ms = Math.min(TRANSIENT_MAX_MS, TRANSIENT_BASE_MS * 2 ** trips);
        openUntil = 0;
        open(at + ms);
        trips++;
      }
      return api.state();
    },
    state() {
      if (!isOpen) return { state: "closed", openUntil: null, failures };
      return { state: t() < openUntil ? "open" : "half-open", openUntil, failures };
    },
  };
  return api;
}

function getBreaker(name, { now } = {}) {
  const key = String(name || "default");
  let b = breakers.get(key);
  if (!b) {
    b = createBreaker(key, typeof now === "function" ? now : Date.now);
    breakers.set(key, b);
  } else if (typeof now === "function") {
    b.setClock(now);
  }
  return b;
}

function resetBreakers() { breakers.clear(); }

// Next UTC midnight — callers pass it as `untilMs` for daily-cap failures.
function nextUtcMidnight(ms = Date.now()) {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
}

module.exports = { getBreaker, resetBreakers, nextUtcMidnight };
