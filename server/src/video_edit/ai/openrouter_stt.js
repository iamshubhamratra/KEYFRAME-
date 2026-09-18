// VIDEO EDIT OPENROUTER STT TRANSPORT — one /audio/transcriptions call, normalized and classified.
//
// WHY THIS EXISTS. The OpenRouter transcription endpoint is not wrapped by services/openrouter.js
// (that client only speaks chat), and its models disagree on nearly everything the edit depends on
// (ANALYSIS.md §1): whisper pads words with a leading space, whisper-1 returns zero-length words and
// full language names, several models reject `verbose_json` with HTTP 400, deepgram answers 200 with
// an empty (billed) transcript when it cannot detect the language. Every caller would re-learn that.
// This module sends the exact live-verified request, normalizes words / segments / language / cost,
// and turns every failure into an EditError whose class tells the chain and the breaker what to do:
//   400/404 → config (this MODEL cannot serve the request: next engine) · 401/403 → config (the KEY:
//   whole provider) · 402 → budget (the KEY) · 408/429/5xx/timeout/network → transient (429 carries
//   Retry-After ≤ 60 s) · 200 with no words while VAD says > 20 % speech → provider EMPTY_TRANSCRIPT.
// `extra.scope` = 'provider' | 'model' names which breaker the failure belongs to.
//
// CONTRACT (ANALYSIS.md §2):
//   transcribe({ model, audioPath | audioBase64, format='mp3', language?, signal, timeoutMs=180000, settings, project,
//                auth, fetchImpl, speechRatio, chunk }) -> { words:[{text,start,end}], segments:[{start,end,text}],
//                language, languageRaw, durationSec, costUsd, costKnown, billedSeconds, model, elapsedMs, raw }
//   normalizeResponse(json) · normalizeLanguage(raw) · classifyHttp(status, { model, retryAfterSec, detail })
//   checkBudget({ settings, auth, fetchImpl, project, now }) -> { remaining, limit } | null   (60 s cache per base)
//   createDirectChat({ settings, auth, fetchImpl, timeoutMs }) -> chat(opts) compatible with services/openrouter.chat,
//     used ONLY when providerBaseOverride.openrouter is set (dev/tests → mock); production islands go through
//     services/openrouter.chat.
//   openrouterBase(settings) · resetBudgetCache()
// Fault tokens (ENGINE.md §8): or_stt:{429[:retryAfter]|402|401|500|timeout} throw before the call;
// or_stt:{bad_json|no_words|segments_only|drop_fillers} shape the parsed reply so real validation runs.

const fs = require("node:fs");
const { EditError } = require("../errors");
const faults = require("../faults");

const DEFAULT_BASE = "https://openrouter.ai/api/v1";
const DEFAULT_TIMEOUT_MS = 180 * 1000;
const MIN_WORD_SEC = 0.02;
const RETRY_AFTER_MAX_SEC = 60;
const BUDGET_CACHE_MS = 60 * 1000;
const EMPTY_SPEECH_RATIO = 0.2;
const PROVIDER = "openrouter_stt";
const FILLER_TOKEN_RE = /^(?:u+m+|u+h+m*|e+r+m*|a+h+|h+m+|m+h*m+|eh+|em+|euh|heu|äh+m*|hã|ahn)$/i;

const isPlain = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const r3 = (x) => Math.round(x * 1000) / 1000;

function openrouterBase(settings) {
  const o = settings && settings.providerBaseOverride && settings.providerBaseOverride.openrouter;
  return String(o || DEFAULT_BASE).replace(/\/+$/, "");
}

function loadConfig() {
  if (process.env.VIDEO_EDIT_SKIP_CONFIG === "1") return null;
  try { return require("../../config"); } catch { return null; }
}

function resolveAuth(auth) {
  if (isPlain(auth)) return { apiKey: auth.apiKey || null, referer: auth.referer || null, title: auth.title || null };
  const cfg = loadConfig();
  const llm = (cfg && cfg.llm) || {};
  return { apiKey: llm.apiKey || process.env.OPENROUTER_API_KEY || null, referer: llm.httpReferer || null, title: llm.xTitle || null };
}

function headersFor(auth, { json = true } = {}) {
  const a = resolveAuth(auth);
  const h = {};
  if (a.apiKey) h.Authorization = `Bearer ${a.apiKey}`;
  if (a.referer) h["HTTP-Referer"] = String(a.referer);
  if (a.title) h["X-Title"] = String(a.title);
  if (json) h["Content-Type"] = "application/json";
  return h;
}

function normalizeLanguage(raw) {
  if (raw == null || raw === "") return null;
  const s = String(raw).trim();
  let code = null;
  try { code = require("../../services/caption_lang").normalizeLang(s); } catch { code = null; }
  if (code) return code;
  const m = /^([a-z]{2})(?:[-_][a-z]{2,4})?$/i.exec(s);
  return m ? m[1].toLowerCase() : null;   // "multi", full names we do not know → null
}

function sanitize(msg) {
  return String(msg == null ? "" : msg).replace(/https?:\/\/\S+/gi, "<url>").replace(/\s+/g, " ").slice(0, 200);
}

function parseRetryAfter(value, nowMs) {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (Number.isFinite(n) && n >= 0) return Math.min(RETRY_AFTER_MAX_SEC, n);
  const at = Date.parse(String(value));
  if (Number.isFinite(at)) return Math.min(RETRY_AFTER_MAX_SEC, Math.max(0, (at - nowMs) / 1000));
  return null;
}

function sttError(code, { errorClass, retryable, scope, model, httpStatus = null, detail = null, extra = {} }) {
  return new EditError(code, {
    status: errorClass === "cancelled" ? 409 : 503, errorClass, retryable, detail: detail == null ? null : sanitize(detail),
    userMessage: "The transcription service could not transcribe this audio.",
    extra: { provider: PROVIDER, model: model || null, httpStatus, scope, ...extra },
  });
}

function classifyHttp(status, { model = null, retryAfterSec = null, detail = null } = {}) {
  if (status === 401 || status === 403) return sttError("STT_AUTH", { errorClass: "config", retryable: false, scope: "provider", model, httpStatus: status, detail });
  if (status === 402) return sttError("STT_PAYMENT_REQUIRED", { errorClass: "budget", retryable: false, scope: "provider", model, httpStatus: status, detail });
  if (status === 400 || status === 404 || status === 405 || status === 415 || status === 422) {
    return sttError("STT_MODEL_UNSUPPORTED", { errorClass: "config", retryable: false, scope: "model", model, httpStatus: status, detail });
  }
  if (status === 429) {
    return sttError("STT_RATE_LIMITED", { errorClass: "transient", retryable: true, scope: "model", model, httpStatus: status, detail, extra: { retryAfterSec } });
  }
  if (status === 408 || status >= 500) return sttError("STT_HTTP", { errorClass: "transient", retryable: true, scope: "model", model, httpStatus: status, detail });
  return sttError("STT_HTTP", { errorClass: "provider", retryable: true, scope: "model", model, httpStatus: status, detail });
}

function normalizeResponse(j) {
  let rawWords = Array.isArray(j.words) ? j.words : null;
  if (!rawWords && Array.isArray(j.segments)) rawWords = j.segments.flatMap((s) => (s && Array.isArray(s.words) ? s.words : []));
  const words = [];
  for (const w of rawWords || []) {
    if (!isPlain(w)) continue;
    const rawText = w.word != null ? w.word : (w.text != null ? w.text : w.punctuated_word);
    const text = String(rawText == null ? "" : rawText).replace(/\s+/g, " ").trim();
    if (!text) continue;
    let start = Number(w.start);
    let end = Number(w.end);
    if (!Number.isFinite(start)) continue;
    if (!Number.isFinite(end)) end = start;
    start = Math.max(0, start);
    if (end - start < MIN_WORD_SEC) end = start + MIN_WORD_SEC;   // zero-length words (whisper-1) get 20 ms
    words.push({ text, start: r3(start), end: r3(end) });
  }
  const segments = [];
  for (const s of Array.isArray(j.segments) ? j.segments : []) {
    if (!isPlain(s)) continue;
    const start = Number(s.start), end = Number(s.end);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    segments.push({ start: r3(Math.max(0, start)), end: r3(Math.max(start, end)), text: String(s.text == null ? "" : s.text).trim() });
  }
  const languageRaw = j.language ?? j.detected_language ?? null;
  const usage = isPlain(j.usage) ? j.usage : null;
  const costKnown = !!usage && typeof usage.cost === "number" && Number.isFinite(usage.cost);
  const duration = Number(j.duration);
  return {
    words, segments,
    language: normalizeLanguage(languageRaw),
    languageRaw: languageRaw == null ? null : String(languageRaw).slice(0, 24),
    durationSec: Number.isFinite(duration) ? duration : null,
    costUsd: costKnown ? usage.cost : 0,
    costKnown,
    billedSeconds: usage && Number.isFinite(Number(usage.seconds)) ? Number(usage.seconds) : null,
  };
}

function fillerToken(text) {
  return FILLER_TOKEN_RE.test(String(text || "").normalize("NFKC").toLowerCase().replace(/[\p{P}]+/gu, ""));
}

async function transcribe(opts = {}) {
  const {
    model, audioPath = null, audioBase64 = null, format = "mp3", language = null, signal = null, timeoutMs = DEFAULT_TIMEOUT_MS,
    settings = null, project = null, auth = null, fetchImpl = null, speechRatio = null, chunk = null, now = Date.now,
  } = opts;
  if (typeof model !== "string" || !model) throw new EditError("STT_BAD_REQUEST", { errorClass: "bug", detail: "model required" });
  if (!audioBase64 && !audioPath) throw new EditError("STT_BAD_REQUEST", { errorClass: "bug", detail: "audio required" });

  const faultCtx = { settings, project, signal, chunk };
  await faults.maybeFail("or_stt", faultCtx);
  const shaping = faults.faultFor("or_stt", faultCtx);

  const data = audioBase64 || (await fs.promises.readFile(audioPath)).toString("base64");
  const body = { model, input_audio: { data, format }, response_format: "verbose_json", timestamp_granularities: ["word"] };
  if (language) body.language = String(language);

  const doFetch = fetchImpl || globalThis.fetch;
  const timeout = AbortSignal.timeout(Math.max(1, timeoutMs));
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const t0 = now();
  let res, text;
  try {
    res = await doFetch(`${openrouterBase(settings)}/audio/transcriptions`, {
      method: "POST", headers: headersFor(auth), body: JSON.stringify(body), signal: combined,
    });
    text = await res.text();
  } catch (e) {
    if (signal && signal.aborted) throw sttError("STT_ABORTED", { errorClass: "cancelled", retryable: false, scope: "model", model, detail: "aborted" });
    if (timeout.aborted) throw sttError("STT_TIMEOUT", { errorClass: "transient", retryable: true, scope: "model", model, detail: `timeout ${timeoutMs}ms` });
    throw sttError("STT_NETWORK", { errorClass: "transient", retryable: true, scope: "model", model, detail: (e && (e.cause && e.cause.code || e.code || e.name)) || "network" });
  }

  if (!res.ok) {
    let msg = null;
    try { const j = JSON.parse(text); msg = j && j.error && (j.error.message || j.error.code); } catch { msg = null; }
    const retryAfterSec = res.status === 429 ? parseRetryAfter(res.headers.get("retry-after"), Date.now()) : null;
    throw classifyHttp(res.status, { model, retryAfterSec, detail: msg || `HTTP ${res.status}` });
  }

  let j = null;
  if (!(shaping && shaping.mode === "bad_json")) { try { j = JSON.parse(text); } catch { j = null; } }
  if (!isPlain(j)) {
    throw sttError("STT_BAD_RESPONSE", { errorClass: "provider", retryable: true, scope: "model", model, detail: "reply is not a JSON object" });
  }
  const out = normalizeResponse(j);
  if (shaping) {
    if (shaping.mode === "no_words" || shaping.mode === "segments_only") out.words = [];
    if (shaping.mode === "no_words") out.segments = [];
    if (shaping.mode === "drop_fillers") out.words = out.words.filter((w) => !fillerToken(w.text));
  }
  if (!out.words.length && Number.isFinite(speechRatio) && speechRatio > EMPTY_SPEECH_RATIO) {
    throw sttError("EMPTY_TRANSCRIPT", {
      errorClass: "provider", retryable: true, scope: "model", model, detail: `no words while ${Math.round(speechRatio * 100)}% of the audio is speech`,
      extra: { costUsd: out.costUsd, language: out.languageRaw },
    });
  }
  return { ...out, model, elapsedMs: Math.max(0, now() - t0), raw: j };
}

// ---- budget probe (free endpoints) -------------------------------------------------------------
const budgetCache = new Map();

async function checkBudget({ settings = null, auth = null, fetchImpl = null, project = null, now = Date.now } = {}) {
  const f = faults.faultFor("budget", { settings, project });
  if (f && f.mode === "low") return { remaining: 0.1, limit: null, injected: true };
  if (f && f.mode === "exhausted") return { remaining: 0, limit: null, injected: true };
  const base = openrouterBase(settings);
  const hit = budgetCache.get(base);
  if (hit && now() - hit.at < BUDGET_CACHE_MS) return hit.value;
  const doFetch = fetchImpl || globalThis.fetch;
  const headers = headersFor(auth, { json: false });
  let perKey = null, account = null, limit = null;
  try {
    const r = await doFetch(`${base}/key`, { headers, signal: AbortSignal.timeout(10 * 1000) });
    if (r.ok) {
      const d = ((await r.json()) || {}).data || {};
      if (d.limit_remaining != null && Number.isFinite(Number(d.limit_remaining))) perKey = Number(d.limit_remaining);
      if (d.limit != null && Number.isFinite(Number(d.limit))) limit = Number(d.limit);
    }
  } catch { /* probe optional */ }
  try {
    const r = await doFetch(`${base}/credits`, { headers, signal: AbortSignal.timeout(10 * 1000) });
    if (r.ok) {
      const d = ((await r.json()) || {}).data || {};
      const c = Number(d.total_credits), u = Number(d.total_usage);
      if (Number.isFinite(c) && Number.isFinite(u)) account = c - u;
    }
  } catch { /* probe optional */ }
  // A key with a small per-key cap can still draw on the account balance: the larger value is spendable.
  const value = perKey != null || account != null ? { remaining: Math.max(perKey ?? -Infinity, account ?? -Infinity), limit } : null;
  budgetCache.set(base, { at: now(), value });
  return value;
}

function resetBudgetCache() { budgetCache.clear(); }

// ---- direct chat (override base only) ------------------------------------------------------------
function createDirectChat({ settings = null, auth = null, fetchImpl = null, timeoutMs = 120 * 1000 } = {}) {
  const base = openrouterBase(settings);
  return async function chat({ system, user, jsonMode = false, temperature = 0, model, signal } = {}) {
    const doFetch = fetchImpl || globalThis.fetch;
    const body = { model, messages: [{ role: "system", content: system }, { role: "user", content: user }], temperature, usage: { include: true } };
    if (jsonMode) body.response_format = { type: "json_object" };
    const timeout = AbortSignal.timeout(Math.max(1, timeoutMs));
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    const res = await doFetch(`${base}/chat/completions`, { method: "POST", headers: headersFor(auth), body: JSON.stringify(body), signal: combined });
    const text = await res.text();
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try { const j = JSON.parse(text); if (j && j.error && j.error.message) msg = String(j.error.message).slice(0, 200); } catch { /* keep */ }
      const e = new Error(msg);
      e.status = res.status;
      throw e;
    }
    let j;
    try { j = JSON.parse(text); } catch { const e = new Error("chat reply is not JSON"); e.status = 502; throw e; }
    const choice = j && Array.isArray(j.choices) ? j.choices[0] : null;
    const content = choice && choice.message ? choice.message.content : "";
    const out = typeof content === "string" ? content : (Array.isArray(content) ? content.map((p) => (p && p.text) || "").join("") : "");
    const usage = (j && j.usage) || {};
    return {
      text: out, model: (j && j.model) || model, tokensIn: Number(usage.prompt_tokens) || 0, tokensOut: Number(usage.completion_tokens) || 0,
      costUsd: typeof usage.cost === "number" ? usage.cost : null,
    };
  };
}

module.exports = {
  transcribe, normalizeResponse, normalizeLanguage, classifyHttp, parseRetryAfter, checkBudget, resetBudgetCache,
  createDirectChat, openrouterBase, fillerToken, PROVIDER, DEFAULT_BASE,
};
