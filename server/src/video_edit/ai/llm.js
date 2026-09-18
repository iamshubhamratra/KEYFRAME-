// VIDEO EDIT LLM TRANSPORT — one validated, cached, cost-tracked JSON call.
//
// WHY THIS EXISTS. Every AI stage of the edit (ve_content, ve_director, ve_broll_judge, ve_faces,
// ve_qa, islands chat) needs the same five things from a model call, and each one is a bug when a
// stage hand-rolls it: (1) a lenient parse, because models append junk after valid JSON even in
// json mode; (2) a schema gate, because a plan built from an unvalidated reply corrupts the single
// source of truth; (3) exactly ONE repair re-ask that tells the model what failed, because a blind
// retry repeats the same mistake and a loop burns budget; (4) the object envelope, because
// gemini-flash-lite returned a top-level array for an object schema (ANALYSIS.md §1); (5) cost +
// cache, because a resumed pipeline must never pay twice for the same prompt (ENGINE.md §5.6).
// It also surfaces the silent model substitution openrouter.chat() may perform (MODEL_FALLBACK).
//
// CONTRACT (ANALYSIS.md §2):
//   callJson({ stage, system, user, schema, model=null, temperature=0, tracker, signal, promptVersion,
//              cacheDir, chat=require('../../services/openrouter').chat (lazy), now=Date.now,
//              onNotice, onCost, guard })
//     -> { value, model, costUsd, tokensIn, tokensOut, cached, modelFallback, attempts, notices }
//   - user: string or array of content parts (assertPayload-checked).
//   - schema: anything with safeParse (zod). Parsed output (`data`) is returned as `value`.
//   - tracker.addLlm({ inputTokens, outputTokens, stage, costUsd }) per provider call; onCost(entry)
//     receives the same per call plus { model, attempt } for the project ledger.
//   - cache: <cacheDir>/<sha256(model|stage|promptVersion|canonicalJson({system,user,temperature}))>.json,
//     read only when it still passes the schema; hits cost nothing and report cached:true.
//   - notices: [{ code:'MODEL_FALLBACK', stage, requested, used }] (also sent to onNotice).
//   Errors (EditError): LLM_BAD_REQUEST (bug) · LLM_ABORTED (cancelled) · LLM_CALL_FAILED
//   (transient|provider|config|budget) · LLM_INVALID_JSON (provider, retryable) after the repair fails.

const path = require("node:path");
const crypto = require("node:crypto");
const { EditError } = require("../errors");
const { canonicalJson, readJsonSafe, writeJsonAtomic, ensureDir } = require("../fsx");
const { extractFirstJsonObject } = require("../../services/json_lenient");
const { assertPayload } = require("./llm_guard");

const MAX_ISSUE_CHARS = 800;

function badRequest(detail) {
  return new EditError("LLM_BAD_REQUEST", { errorClass: "bug", retryable: false, detail });
}

function formatIssues(issues) {
  const text = (issues || [])
    .map((i) => `${i.path && i.path.length ? i.path.join(".") : "(root)"}: ${i.message}`)
    .join("; ");
  return text.slice(0, MAX_ISSUE_CHARS);
}

// Parse + envelope + schema. Returns { ok, value, issues } — never throws.
function parseReply(text, schema) {
  let obj;
  try { obj = extractFirstJsonObject(String(text == null ? "" : text)); }
  catch (e) { return { ok: false, issues: `reply is not JSON (${String(e.message).slice(0, 120)})` }; }
  if (Array.isArray(obj)) return { ok: false, issues: "(root): the reply is a top-level JSON array; return a single JSON object envelope" };
  if (!obj || typeof obj !== "object") return { ok: false, issues: "(root): the reply must be a JSON object" };
  const parsed = schema.safeParse(obj);
  if (!parsed.success) return { ok: false, issues: formatIssues(parsed.error.issues) };
  return { ok: true, value: parsed.data };
}

function repairUser(user, issues) {
  const note = `Your previous reply failed validation: ${issues} Return ONLY the corrected JSON object.`;
  if (typeof user === "string") return `${user}\n\n${note}`;
  return [...user, { type: "text", text: note }];
}

function classifyChatError(err) {
  const status = Number(err && (err.status || (err.response && err.response.status))) || 0;
  const msg = String((err && err.message) || "");
  if (status === 402 || /budget|insufficient credit|spend limit/i.test(msg)) return "budget";
  if (status === 401 || status === 403 || status === 404) return "config";
  if (status === 408 || status === 429 || (status >= 500 && status < 600)) return "transient";
  if (/timeout|timed out|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|socket hang up|network|connection error/i.test(msg)) return "transient";
  return "provider";
}

function cacheKey({ model, stage, promptVersion, system, user, temperature }) {
  const input = canonicalJson({ system, user, temperature });
  return crypto.createHash("sha256")
    .update(`${model || "stage-default"}|${stage}|${promptVersion == null ? "0" : promptVersion}|${input}`)
    .digest("hex");
}

async function callJson(opts = {}) {
  const {
    stage, system, user, schema, model = null, temperature = 0, tracker = null, signal = null,
    promptVersion = null, cacheDir = null, now = Date.now, onNotice = null, onCost = null,
    guard = {},
  } = opts;
  if (typeof stage !== "string" || !stage) throw badRequest("stage is required");
  if (typeof system !== "string") throw badRequest("system must be a string");
  if (typeof user !== "string" && !Array.isArray(user)) throw badRequest("user must be a string or an array of parts");
  if (!schema || typeof schema.safeParse !== "function") throw badRequest("schema must expose safeParse");
  assertPayload(user, guard);

  const chat = typeof opts.chat === "function" ? opts.chat : require("../../services/openrouter").chat;
  const key = cacheKey({ model, stage, promptVersion, system, user, temperature });
  const cacheFile = cacheDir ? path.join(cacheDir, `${key}.json`) : null;

  if (cacheFile) {
    const hit = readJsonSafe(cacheFile);
    if (hit.ok && hit.value && typeof hit.value === "object" && "value" in hit.value) {
      const parsed = schema.safeParse(hit.value.value);
      if (parsed.success) {
        return {
          value: parsed.data, model: hit.value.model || model, costUsd: 0, tokensIn: 0, tokensOut: 0,
          cached: true, modelFallback: false, attempts: 0, notices: [],
        };
      }
    }
  }

  const notices = [];
  let costUsd = 0, tokensIn = 0, tokensOut = 0, usedModel = model, modelFallback = false;
  let currentUser = user;
  let lastIssues = "";

  for (let attempt = 1; attempt <= 2; attempt++) {
    if (signal && signal.aborted) throw new EditError("LLM_ABORTED", { errorClass: "cancelled", stage });
    let res;
    try {
      res = await chat({ stage, system, user: currentUser, jsonMode: true, temperature, model: model || undefined, signal: signal || undefined });
    } catch (err) {
      if ((signal && signal.aborted) || (err && err.name === "AbortError")) {
        throw new EditError("LLM_ABORTED", { errorClass: "cancelled", stage, detail: err && err.message });
      }
      const cls = classifyChatError(err);
      throw new EditError("LLM_CALL_FAILED", {
        errorClass: cls, retryable: cls === "transient", stage, detail: err && err.message,
        userMessage: "The AI service could not be reached.",
      });
    }
    res = res || {};
    const inT = Number(res.tokensIn) || 0, outT = Number(res.tokensOut) || 0, cost = Number(res.costUsd) || 0;
    tokensIn += inT; tokensOut += outT; costUsd += cost;
    if (res.model) usedModel = res.model;
    if (tracker && typeof tracker.addLlm === "function") {
      tracker.addLlm({ inputTokens: inT, outputTokens: outT, stage, costUsd: cost });
    }
    if (typeof onCost === "function") onCost({ stage, model: res.model || model, costUsd: cost, tokensIn: inT, tokensOut: outT, attempt });

    if (model && res.model && res.model !== model && !modelFallback) {
      modelFallback = true;
      const notice = { code: "MODEL_FALLBACK", stage, requested: model, used: res.model };
      notices.push(notice);
      if (typeof onNotice === "function") onNotice(notice);
    }

    const parsed = parseReply(res.text, schema);
    if (parsed.ok) {
      const out = {
        value: parsed.value, model: usedModel, costUsd: Math.round(costUsd * 1e8) / 1e8, tokensIn, tokensOut,
        cached: false, modelFallback, attempts: attempt, notices,
      };
      if (cacheFile) {
        try {
          ensureDir(cacheDir);
          writeJsonAtomic(cacheFile, {
            key, stage, model: usedModel, requestedModel: model, promptVersion, createdAt: Number(now()) || 0,
            value: parsed.value, costUsd: out.costUsd, tokensIn, tokensOut,
          });
        } catch { /* a cache write failure must never fail a paid, successful call */ }
      }
      return out;
    }
    lastIssues = parsed.issues;
    currentUser = repairUser(user, lastIssues);
  }

  throw new EditError("LLM_INVALID_JSON", {
    errorClass: "provider", retryable: true, stage, detail: lastIssues,
    userMessage: "The AI reply could not be understood.",
    extra: { costUsd: Math.round(costUsd * 1e8) / 1e8, tokensIn, tokensOut, model: usedModel },
  });
}

module.exports = { callJson, parseReply, repairUser, classifyChatError, cacheKey, formatIssues };
