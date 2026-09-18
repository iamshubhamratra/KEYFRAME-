// VIDEO EDIT FAULT INJECTION — deterministic failures for tests and dev, inert in production.
//
// WHY THIS EXISTS. The failure matrix (ENGINE.md §6) is the product: STT falls back per chunk,
// vision failure degrades framing, a crashed stage resumes from checkpoints. None of that can be
// trusted unless each path is exercised on demand. Faults are injected at the lowest real call
// sites (provider modules, engine/proc.js) rather than by mocking fetch globally, so the genuine
// retry / breaker / fallback code runs. Production ignores every token unless the operator sets
// VIDEO_EDIT_FAULTS_ALLOW=1 — a client's `settings.debugFaults` can never break a real edit.
//
// CONTRACT (ENGINE.md §8):
//   faultsAllowed(settings) -> boolean
//   parseFaults(str) -> Map<key, { mode, arg }>   (map.invalid = [token] for dropped tokens)
//      keys: or_stt · kie_stt · islands · vision · llm · budget · assets · render · card · disk ·
//            probe · normalize · crash:<STAGE> · slow:<STAGE>
//   activeFaults({ settings, project }) -> Map     global VIDEO_EDIT_FAULTS overlaid by project.settings.debugFaults
//   faultFor(point, ctx) -> { mode, arg } | null   for data-shaping faults (bad_json, drop_fillers, …)
//   maybeFail(point, { settings, project, signal, chunk }) -> Promise<void>
//      throws the EditError the real failure would raise, or sleeps for slow faults.

const { EditError } = require("./errors");
const { STAGES } = require("./constants");

const NUM = /^\d+(\.\d+)?$/;
const INT = /^\d+$/;

// area -> mode -> arg rule: null (no arg), "opt-int", "int", "num"
const GRAMMAR = Object.freeze({
  or_stt: { 429: "opt-int", 402: null, 401: null, 500: null, timeout: null, bad_json: null, no_words: null, segments_only: null, drop_fillers: null },
  kie_stt: { upload_fail: null, create_fail: null, stall: null, fail_state: null, poll_error: null, slow: "num" },
  islands: { error: null, invalid_json: null, approx_drift: "num" },
  vision: { 429: null, 402: null, timeout: null, invalid_json: null, hallucinated_ids: null },
  llm: { error: null, invalid_json: null, budget: null },
  budget: { low: null, exhausted: null, cap: "num" },
  assets: { http500: null, empty: null, keyRejected: null },
  render: { exit1: null, hang: null, chunk: "int" },
  disk: { full: null },
  probe: { timeout: null },
  normalize: { exit1: null },
});

function faultsAllowed(settings) {
  if (settings && settings.faults && typeof settings.faults.allow === "boolean") return settings.faults.allow;
  return process.env.NODE_ENV !== "production" || process.env.VIDEO_EDIT_FAULTS_ALLOW === "1";
}

function checkArg(rule, arg) {
  if (rule === null) return arg === undefined;
  if (rule === "opt-int") return arg === undefined || INT.test(arg);
  if (rule === "int") return arg !== undefined && INT.test(arg);
  if (rule === "num") return arg !== undefined && NUM.test(arg);
  return false;
}

function parseToken(token) {
  const parts = token.split(":");
  const area = parts[0];
  if (area === "card" && parts.length === 1) return ["card", { mode: "fail", arg: null }];
  if (area === "crash") {
    if (parts.length === 2 && STAGES.includes(parts[1])) return [`crash:${parts[1]}`, { mode: "crash", arg: parts[1] }];
    return null;
  }
  if (area === "slow") {
    if (parts.length === 3 && STAGES.includes(parts[1]) && NUM.test(parts[2])) return [`slow:${parts[1]}`, { mode: "slow", arg: Number(parts[2]) }];
    return null;
  }
  const modes = GRAMMAR[area];
  if (!modes || parts.length < 2 || parts.length > 3) return null;
  const mode = parts[1];
  if (!Object.prototype.hasOwnProperty.call(modes, mode)) return null;
  const arg = parts[2];
  if (!checkArg(modes[mode], arg)) return null;
  return [area, { mode, arg: arg === undefined ? null : Number(arg) }];
}

function parseFaults(str) {
  const map = new Map();
  map.invalid = [];
  if (typeof str !== "string" || !str.trim()) return map;
  for (const raw of str.split(",")) {
    const token = raw.trim();
    if (!token) continue;
    const parsed = token.length <= 80 ? parseToken(token) : null;
    if (parsed) map.set(parsed[0], parsed[1]); else map.invalid.push(token.slice(0, 80));
  }
  return map;
}

function activeFaults({ settings, project } = {}) {
  const out = new Map();
  out.invalid = [];
  if (!faultsAllowed(settings)) return out;
  const layers = [
    settings && settings.faults ? settings.faults.global : null,
    project ? ((project.settings && project.settings.debugFaults) || project.debugFaults || null) : null,
  ];
  for (const layer of layers) {
    const m = parseFaults(layer);
    for (const [k, v] of m) out.set(k, v);
    out.invalid.push(...m.invalid);
  }
  return out;
}

function faultFor(point, ctx = {}) {
  return activeFaults(ctx).get(point) || null;
}

function abortError(stage) {
  return new EditError("PROC_ABORTED", { status: 409, errorClass: "cancelled", stage, detail: "fault-injected wait aborted" });
}

function abortableSleep(ms, signal, stage) {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) return reject(abortError(stage));
    const timer = setTimeout(() => { cleanup(); resolve(); }, ms);
    const onAbort = () => { clearTimeout(timer); cleanup(); reject(abortError(stage)); };
    const cleanup = () => { if (signal) signal.removeEventListener("abort", onAbort); };
    if (signal) signal.addEventListener("abort", onAbort, { once: true });
  });
}

const injected = "fault-injected";
const providerOf = (point) => ({ or_stt: "openrouter", kie_stt: "kie", islands: "openrouter", vision: "openrouter", llm: "openrouter", assets: "stock" }[point] || point);

function httpError(point, httpStatus, extra = {}) {
  const provider = providerOf(point);
  if (httpStatus === 429) return new EditError("PROVIDER_RATE_LIMITED", { status: 503, errorClass: "transient", retryable: true, detail: injected, extra: { provider, httpStatus, ...extra } });
  if (httpStatus === 402) return new EditError("PROVIDER_PAYMENT_REQUIRED", { status: 503, errorClass: "budget", retryable: false, detail: injected, extra: { provider, httpStatus } });
  if (httpStatus === 401 || httpStatus === 403) return new EditError("PROVIDER_AUTH", { status: 503, errorClass: "config", retryable: false, detail: injected, extra: { provider, httpStatus } });
  return new EditError("PROVIDER_HTTP", { status: 503, errorClass: "transient", retryable: true, detail: injected, extra: { provider, httpStatus } });
}

// Returns the error the real failure would raise, "sleep:<ms>", "hang", "crash", or null (shaping-only / not applicable).
function outcomeFor(point, fault, ctx) {
  const { mode, arg } = fault;
  const stage = ctx.stage || null;
  switch (point) {
    case "probe":
      return new EditError("PROC_TIMEOUT", { status: 504, errorClass: "transient", retryable: true, stage: "VALIDATING", detail: injected });
    case "normalize":
      return new EditError("PROC_EXIT", { status: 500, errorClass: "transient", retryable: true, stage: "COMPRESSING", detail: `${injected}: exit 1`, extra: { exitCode: 1 } });
    case "disk":
      return new EditError("INSUFFICIENT_STORAGE", { status: 507, errorClass: "resource", retryable: true, stage, detail: `${injected}: ENOSPC` });
    case "card":
      return new EditError("CARD_RENDER_FAILED", { status: 500, errorClass: "provider", retryable: false, stage: "PREPARING_RENDER", detail: injected });
    case "or_stt":
      if (mode === "429") return httpError(point, 429, arg != null ? { retryAfterSec: arg } : {});
      if (mode === "402" || mode === "401" || mode === "500") return httpError(point, Number(mode));
      if (mode === "timeout") return new EditError("PROVIDER_TIMEOUT", { status: 504, errorClass: "transient", retryable: true, detail: injected, extra: { provider: "openrouter" } });
      return null;
    case "vision":
      if (mode === "429" || mode === "402") return httpError(point, Number(mode));
      if (mode === "timeout") return new EditError("PROVIDER_TIMEOUT", { status: 504, errorClass: "transient", retryable: true, detail: injected, extra: { provider: "openrouter" } });
      return null;
    case "kie_stt":
      if (mode === "upload_fail") return new EditError("PROVIDER_UPLOAD_FAILED", { errorClass: "provider", detail: injected, extra: { provider: "kie" } });
      if (mode === "create_fail") return new EditError("PROVIDER_CREATE_FAILED", { errorClass: "provider", detail: injected, extra: { provider: "kie" } });
      if (mode === "fail_state") return new EditError("PROVIDER_TASK_FAILED", { errorClass: "provider", detail: injected, extra: { provider: "kie" } });
      if (mode === "stall") return new EditError("PROVIDER_STALL", { errorClass: "provider", detail: injected, extra: { provider: "kie" } });
      if (mode === "poll_error") return httpError(point, 500);
      if (mode === "slow") return `sleep:${Math.round(arg * 1000)}`;
      return null;
    case "islands":
      return mode === "error" ? new EditError("PROVIDER_HTTP", { errorClass: "provider", detail: injected, extra: { provider: "openrouter" } }) : null;
    case "llm":
      if (mode === "error") return new EditError("PROVIDER_HTTP", { errorClass: "provider", detail: injected, extra: { provider: "openrouter" } });
      if (mode === "budget") return new EditError("AI_BUDGET_EXHAUSTED", { status: 429, errorClass: "budget", detail: injected });
      return null;
    case "budget":
      return mode === "exhausted" ? new EditError("AI_BUDGET_EXHAUSTED", { status: 429, errorClass: "budget", detail: injected }) : null;
    case "assets":
      if (mode === "http500") return httpError(point, 500);
      if (mode === "keyRejected") return httpError(point, 401);
      return null;
    case "render":
      if (mode === "exit1") return new EditError("PROC_EXIT", { errorClass: "transient", retryable: true, stage: "RENDERING", detail: `${injected}: exit 1`, extra: { exitCode: 1 } });
      if (mode === "chunk") return Number(ctx.chunk) === arg ? new EditError("PROC_EXIT", { errorClass: "transient", retryable: true, stage: "RENDERING", detail: `${injected}: chunk`, extra: { exitCode: 1, chunk: arg } }) : null;
      if (mode === "hang") return "hang";
      return null;
    default:
      if (point.startsWith("crash:")) return "crash";
      if (point.startsWith("slow:")) return `sleep:${Math.round(arg * 1000)}`;
      return null;
  }
}

async function maybeFail(point, ctx = {}) {
  if (typeof point !== "string" || !point) return;
  const fault = faultFor(point, ctx);
  if (!fault) return;
  const outcome = outcomeFor(point, fault, ctx);
  if (!outcome) return;
  if (outcome instanceof EditError) throw outcome;
  if (outcome === "crash") {
    const stage = point.slice("crash:".length);
    // Hard mode kills the process like a real crash (recovery e2e); default throws so unit tests survive.
    if (process.env.VIDEO_EDIT_FAULT_CRASH_EXIT === "1") process.kill(process.pid, "SIGKILL");
    throw new EditError("FAULT_CRASH", { status: 500, errorClass: "bug", retryable: false, stage, detail: injected });
  }
  if (outcome === "hang") {
    await abortableSleep(10 * 60 * 1000, ctx.signal, "RENDERING");
    return;
  }
  if (outcome.startsWith("sleep:")) {
    await abortableSleep(Number(outcome.slice(6)), ctx.signal, point.startsWith("slow:") ? point.slice(5) : null);
  }
}

module.exports = { faultsAllowed, parseFaults, activeFaults, faultFor, maybeFail, GRAMMAR };
