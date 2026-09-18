// VIDEO EDIT KIE JOBS TRANSPORT — upload a file, create a task, poll it to a result.
//
// WHY THIS EXISTS. KIE is the only non-OpenRouter speech-to-text route (ElevenLabs Scribe), and its
// job API has three live-verified traps (ANALYSIS.md §1): uploads only work on the redpanda host
// (api.kie.ai answers 404), createTask can answer HTTP 200 with a body `code:500`, and accepted tasks
// can sit in `waiting` for > 11 minutes before failing ("upstream API service timed out") while
// credits are held. A caller that trusts HTTP status or waits for a terminal state hangs a
// transcription for minutes and pays for nothing. So this module checks the in-body code, treats a
// task that never leaves waiting/queuing for `stallMs` as stalled, caps the total wait, tolerates
// individual poll network errors, and never re-creates a task on its own — the caller persists the
// taskId before polling so a resumed run re-polls instead of paying twice (ENGINE.md §5.6).
// The completed `resultJson` shape was never observed live, so it is parsed defensively.
//
// CONTRACT (ANALYSIS.md §2):
//   kieEndpoints(settings) -> { upload, jobs }      (providerBaseOverride.kie outside production → mock)
//   uploadFile(filePath, { uploadPath='video-edit', fileName, mimeType='audio/mpeg', settings, project, auth,
//              signal, timeoutMs=60000, fetchImpl }) -> Promise<downloadUrl>
//   createTask({ model, input, settings, project, auth, signal, timeoutMs=30000, fetchImpl }) -> Promise<{ taskId, recordId }>
//   pollTask(taskId, { pollMs=3000, stallMs=60000, maxWaitMs=240000, signal, onState(state, info), settings, project,
//            auth, fetchImpl, now=Date.now, sleep }) -> Promise<{ state:'success', result, creditsConsumed, costUsd, costTimeMs }>
//   parseResultJson(v) -> object | null
//   Errors (EditError, extra.provider='kie'): KIE_UPLOAD_FAILED · KIE_CREATE_FAILED · KIE_FAIL · KIE_STALL · KIE_TIMEOUT
//   (errorClass 'provider', retryable) · KIE_AUTH (config) · KIE_PAYMENT_REQUIRED (budget) · KIE_HTTP (transient) ·
//   KIE_ABORTED (cancelled). Fault tokens kie_stt:{upload_fail|create_fail|stall|fail_state|poll_error|slow:<s>}.
// Keys come only from require('../../config') (audio.ttsKieKey · llm.primary.apiKey · KIE_API_KEY) or an
// injected `auth`; they are never logged.

const fs = require("node:fs");
const path = require("node:path");
const { EditError, isEditError } = require("../errors");
const faults = require("../faults");

const DEFAULT_UPLOAD_URL = "https://kieai.redpandaai.co/api/file-stream-upload";
const DEFAULT_JOBS_BASE = "https://api.kie.ai/api/v1/jobs";
const PROVIDER = "kie";
const KIE_CREDIT_USD = 0.005;
const POLL_REQUEST_TIMEOUT_MS = 20 * 1000;
const WAITING_STATES = new Set(["", "waiting", "queuing", "queued", "pending", "created", "submitted"]);
const FAIL_STATES = new Set(["fail", "failed", "error"]);

const isPlain = (v) => !!v && typeof v === "object" && !Array.isArray(v);

function loadConfig() {
  if (process.env.VIDEO_EDIT_SKIP_CONFIG === "1") return null;
  try { return require("../../config"); } catch { return null; }
}

function resolveKieAuth(auth) {
  if (isPlain(auth)) return { apiKey: auth.apiKey || null };
  const cfg = loadConfig();
  const key = (cfg && ((cfg.audio && cfg.audio.ttsKieKey) || (cfg.llm && cfg.llm.primary && cfg.llm.primary.apiKey))) || process.env.KIE_API_KEY || null;
  return { apiKey: key };
}

function authHeaders(auth) {
  const a = resolveKieAuth(auth);
  return a.apiKey ? { Authorization: `Bearer ${a.apiKey}` } : {};
}

function kieEndpoints(settings) {
  const override = settings && settings.providerBaseOverride && settings.providerBaseOverride.kie;
  if (override) {
    const b = String(override).replace(/\/+$/, "");
    return { upload: `${b}/api/file-stream-upload`, jobs: `${b}/api/v1/jobs` };
  }
  const stt = (settings && settings.providers && settings.providers.stt) || {};
  const upload = typeof stt.kieUploadUrl === "string" && /^https:\/\//i.test(stt.kieUploadUrl) ? stt.kieUploadUrl : DEFAULT_UPLOAD_URL;
  return { upload, jobs: DEFAULT_JOBS_BASE };
}

// Provider messages can carry signed URLs; keep only a short, URL-free diagnostic.
function sanitize(msg) {
  return String(msg == null ? "" : msg).replace(/https?:\/\/\S+/gi, "<url>").replace(/\s+/g, " ").slice(0, 200);
}

function kieError(code, { errorClass = "provider", retryable = true, detail = null, extra = {} } = {}) {
  return new EditError(code, {
    status: errorClass === "cancelled" ? 409 : 503, errorClass, retryable, detail: detail == null ? null : sanitize(detail),
    userMessage: "The transcription service could not finish.", extra: { provider: PROVIDER, ...extra },
  });
}

function httpError(status, code, detail) {
  if (status === 401 || status === 403) return kieError("KIE_AUTH", { errorClass: "config", retryable: false, detail, extra: { httpStatus: status, scope: "provider" } });
  if (status === 402) return kieError("KIE_PAYMENT_REQUIRED", { errorClass: "budget", retryable: false, detail, extra: { httpStatus: status, scope: "provider" } });
  if (status === 408 || status === 429 || status >= 500) return kieError("KIE_HTTP", { errorClass: "transient", retryable: true, detail, extra: { httpStatus: status } });
  return kieError(code, { errorClass: "provider", retryable: true, detail, extra: { httpStatus: status } });
}

function combineSignals(signal, timeoutMs) {
  const t = AbortSignal.timeout(Math.max(1, timeoutMs));
  return { timeout: t, signal: signal ? AbortSignal.any([signal, t]) : t };
}

function networkError(e, { signal, timeout, code }) {
  if (signal && signal.aborted) return kieError("KIE_ABORTED", { errorClass: "cancelled", retryable: false, detail: "aborted" });
  if (timeout && timeout.aborted) return kieError(code, { errorClass: "transient", retryable: true, detail: "timeout" });
  return kieError(code, { errorClass: "transient", retryable: true, detail: (e && (e.code || e.name)) || "network" });
}

async function readJsonBody(res) {
  const text = await res.text();
  try { return JSON.parse(text); } catch { return null; }
}

async function faultAt(site, ctx) {
  const f = faults.faultFor("kie_stt", ctx);
  if (!f) return null;
  if (f.mode === site) await faults.maybeFail("kie_stt", ctx);
  return f;
}

async function uploadFile(filePath, opts = {}) {
  const {
    uploadPath = "video-edit", fileName = null, mimeType = "audio/mpeg", settings = null, project = null, auth = null,
    signal = null, timeoutMs = 60 * 1000, fetchImpl = null,
  } = opts;
  const ctx = { settings, project, signal };
  await faultAt("upload_fail", ctx);
  const doFetch = fetchImpl || globalThis.fetch;
  const bytes = await fs.promises.readFile(filePath);
  const name = String(fileName || path.basename(filePath)).replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 60) || "audio.mp3";
  const fd = new FormData();
  fd.append("file", new Blob([bytes], { type: mimeType }), name);
  fd.append("uploadPath", String(uploadPath).replace(/[^A-Za-z0-9/_-]/g, "_").slice(0, 60));
  fd.append("fileName", name);

  const { upload } = kieEndpoints(settings);
  const s = combineSignals(signal, timeoutMs);
  let res, body;
  try {
    res = await doFetch(upload, { method: "POST", headers: authHeaders(auth), body: fd, signal: s.signal });
    body = await readJsonBody(res);
  } catch (e) {
    throw networkError(e, { signal, timeout: s.timeout, code: "KIE_UPLOAD_FAILED" });
  }
  if (!res.ok) throw httpError(res.status, "KIE_UPLOAD_FAILED", body && body.msg);
  const data = body && isPlain(body.data) ? body.data : null;
  const url = data && (data.downloadUrl || data.fileUrl || data.url);
  if (!body || (body.code != null && Number(body.code) !== 200) || body.success === false || typeof url !== "string" || !/^https?:\/\//i.test(url)) {
    throw kieError("KIE_UPLOAD_FAILED", { detail: body ? `code ${body.code} ${body.msg || ""}` : "non-JSON upload reply", extra: { bodyCode: body ? body.code : null } });
  }
  return url;
}

async function createTask(opts = {}) {
  const { model, input, settings = null, project = null, auth = null, signal = null, timeoutMs = 30 * 1000, fetchImpl = null } = opts;
  if (typeof model !== "string" || !model || !isPlain(input)) {
    throw new EditError("KIE_BAD_REQUEST", { errorClass: "bug", detail: "model and input are required" });
  }
  const ctx = { settings, project, signal };
  const f = await faultAt("create_fail", ctx);
  if (f && f.mode === "slow") await faults.maybeFail("kie_stt", ctx);
  const doFetch = fetchImpl || globalThis.fetch;
  const { jobs } = kieEndpoints(settings);
  const s = combineSignals(signal, timeoutMs);
  let res, body;
  try {
    res = await doFetch(`${jobs}/createTask`, {
      method: "POST", headers: { ...authHeaders(auth), "Content-Type": "application/json" },
      body: JSON.stringify({ model, input }), signal: s.signal,
    });
    body = await readJsonBody(res);
  } catch (e) {
    throw networkError(e, { signal, timeout: s.timeout, code: "KIE_CREATE_FAILED" });
  }
  if (!res.ok) throw httpError(res.status, "KIE_CREATE_FAILED", body && body.msg);
  // HTTP 200 with body code 500 was observed live: the body code is the real status.
  const bodyCode = body ? Number(body.code) : NaN;
  if (bodyCode === 401 || bodyCode === 403) throw httpError(bodyCode, "KIE_CREATE_FAILED", body.msg);
  if (bodyCode === 402) throw httpError(402, "KIE_CREATE_FAILED", body.msg);
  const data = body && isPlain(body.data) ? body.data : null;
  if (bodyCode !== 200 || !data || typeof data.taskId !== "string" || !data.taskId) {
    throw kieError("KIE_CREATE_FAILED", { detail: body ? `code ${body.code} ${body.msg || ""}` : "non-JSON createTask reply", extra: { bodyCode: body ? body.code : null } });
  }
  return { taskId: data.taskId, recordId: data.recordId || null };
}

function parseResultJson(v) {
  if (v == null || v === "") return null;
  if (isPlain(v)) return v;
  if (typeof v !== "string") return null;
  try {
    const parsed = JSON.parse(v);
    if (typeof parsed === "string") return parseResultJson(parsed);
    return isPlain(parsed) ? parsed : (Array.isArray(parsed) ? { words: parsed } : null);
  } catch { return null; }
}

function abortableSleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) return reject(kieError("KIE_ABORTED", { errorClass: "cancelled", retryable: false, detail: "aborted" }));
    const timer = setTimeout(() => { if (signal) signal.removeEventListener("abort", onAbort); resolve(); }, Math.max(0, ms));
    const onAbort = () => { clearTimeout(timer); reject(kieError("KIE_ABORTED", { errorClass: "cancelled", retryable: false, detail: "aborted" })); };
    if (signal) signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function pollTask(taskId, opts = {}) {
  const {
    pollMs = 3000, stallMs = 60 * 1000, maxWaitMs = 240 * 1000, signal = null, onState = null, settings = null,
    project = null, auth = null, fetchImpl = null, now = Date.now, sleep = abortableSleep,
  } = opts;
  if (typeof taskId !== "string" || !taskId) throw new EditError("KIE_BAD_REQUEST", { errorClass: "bug", detail: "taskId required" });
  const ctx = { settings, project, signal };
  const f = faults.faultFor("kie_stt", ctx);
  if (f && (f.mode === "stall" || f.mode === "fail_state")) await faults.maybeFail("kie_stt", ctx);
  const pollErrorFault = !!(f && f.mode === "poll_error");

  const doFetch = fetchImpl || globalThis.fetch;
  const { jobs } = kieEndpoints(settings);
  const headers = authHeaders(auth);
  const t0 = now();
  let sawProgress = false;
  let lastState = null;
  let pollErrors = 0;

  for (;;) {
    const elapsed = now() - t0;
    if (elapsed >= maxWaitMs) {
      throw kieError("KIE_TIMEOUT", { detail: `no result after ${Math.round(elapsed / 1000)}s`, extra: { taskState: lastState, pollErrors } });
    }
    await sleep(Math.min(pollMs, Math.max(0, maxWaitMs - elapsed)), signal);

    let data = null;
    try {
      if (pollErrorFault) throw new Error("fault-injected poll error");
      const s = combineSignals(signal, POLL_REQUEST_TIMEOUT_MS);
      const res = await doFetch(`${jobs}/recordInfo?taskId=${encodeURIComponent(taskId)}`, { headers, signal: s.signal });
      if (res.status === 401 || res.status === 403 || res.status === 402) throw httpError(res.status, "KIE_HTTP", "recordInfo");
      const body = res.ok ? await readJsonBody(res) : null;
      data = body && isPlain(body.data) ? body.data : null;
    } catch (e) {
      if (signal && signal.aborted) throw kieError("KIE_ABORTED", { errorClass: "cancelled", retryable: false, detail: "aborted" });
      if (isEditError(e) && (e.errorClass === "config" || e.errorClass === "budget")) throw e;
      data = null;   // one failed poll says nothing about the task — keep polling until stall / max wait
    }
    if (!data) {
      pollErrors++;
      if (!sawProgress && now() - t0 > stallMs) {
        throw kieError("KIE_STALL", { detail: `no task progress for ${Math.round((now() - t0) / 1000)}s`, extra: { taskState: lastState, pollErrors } });
      }
      continue;
    }

    const state = String(data.state || data.status || "").toLowerCase();
    if (state !== lastState) {
      lastState = state;
      if (typeof onState === "function") { try { onState(state, { elapsedMs: now() - t0 }); } catch { /* observer only */ } }
    }
    if (!WAITING_STATES.has(state)) sawProgress = true;

    if (state === "success") {
      const credits = Number(data.creditsConsumed);
      return {
        state,
        result: parseResultJson(data.resultJson),
        creditsConsumed: Number.isFinite(credits) ? credits : null,
        costUsd: Number.isFinite(credits) ? Math.round(credits * KIE_CREDIT_USD * 1e8) / 1e8 : 0,
        costTimeMs: Number.isFinite(Number(data.costTime)) ? Number(data.costTime) : null,
      };
    }
    if (FAIL_STATES.has(state)) {
      throw kieError("KIE_FAIL", {
        detail: data.failMsg || data.errorMessage || "task failed",
        extra: { failCode: data.failCode != null ? String(data.failCode).slice(0, 12) : null, successFlag: data.successFlag ?? null },
      });
    }
    if (!sawProgress && now() - t0 > stallMs) {
      throw kieError("KIE_STALL", { detail: `task still '${state || "waiting"}' after ${Math.round((now() - t0) / 1000)}s`, extra: { taskState: state } });
    }
  }
}

module.exports = { kieEndpoints, uploadFile, createTask, pollTask, parseResultJson, resolveKieAuth, DEFAULT_UPLOAD_URL, DEFAULT_JOBS_BASE, KIE_CREDIT_USD };
