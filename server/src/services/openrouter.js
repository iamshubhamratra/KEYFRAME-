// LLM client with cross-provider fallback.
// Exposes chat() returning { text, tokensIn, tokensOut, model }.
//
// Provider cascade (per call):
//   1. PRIMARY  — KIE AI (config.llm.primary.model, e.g. grok-4-5). Two wire
//      formats, selected by primary.api: "responses" (xAI/OpenAI Responses API —
//      the ONLY surface KIE exposes for Grok) or the default OpenAI-compatible
//      /chat/completions (the older Gemini-on-KIE route).
//   2. FALLBACK — OpenRouter primary model (config.llm.model, e.g. minimax-m3)
//   3. FALLBACK — OpenRouter secondary model (config.llm.modelFallback)
//
// Any failure of the KIE primary (timeout / 429 / 5xx / auth / empty body)
// transparently falls back to OpenRouter so a single provider outage never
// takes down the pipeline.
//
// KIE quirk handled here: KIE returns transport-level errors as HTTP 200 with
// a JSON body {code, msg, data} (code !== 200). The OpenAI SDK would treat that
// as a success and yield empty content, so we use raw fetch for KIE and inspect
// the body explicitly, mapping code -> err.status so isRetryable() works.
//
// OpenAI SDK's internal retries are disabled (maxRetries: 0) to prevent hidden
// stacking that caused 1000s hangs in earlier iterations.

const OpenAI = require("openai");
const config = require("../config");
const { extractFirstJsonObject } = require("./json_lenient");

const client = new OpenAI({
  apiKey: config.llm.apiKey,
  baseURL: config.llm.baseUrl,
  timeout: config.llm.requestTimeoutMs,
  maxRetries: 0,
  defaultHeaders: {
    "HTTP-Referer": config.llm.httpReferer,
    "X-Title": config.llm.xTitle,
  },
});

function modelForStage(stage) {
  const table = config.llm.stageModels || {};
  const kind = table[stage] || "default";
  if (kind === "fast") return config.llm.modelFast || config.llm.model;
  if (kind === "default") return config.llm.model;
  // Any other value is treated as a literal OpenRouter model id, so a single
  // heavy stage (the composer) can run on a stronger model than the cheap
  // default used for planning. e.g. stageModels.composer = "anthropic/claude-..."
  return kind;
}

function isRetryable(err) {
  // Empty / truncated-JSON completions are flagged retryable by callOnce (gemini
  // "lazy stop" returns finish_reason:"stop" with a near-empty body — not an HTTP
  // error, so we synthesize one to drive a retry + model fallback).
  if (err?.retryable === true) return true;
  const status = err?.status || err?.response?.status;
  if (status === 429) return true;
  // 402 = the key's daily credit limit can't cover this model's max_tokens
  // ceiling — the much cheaper fallback model usually still fits.
  if (status === 402) return true;
  if (status >= 500 && status < 600) return true;
  const code = err?.code || err?.cause?.code || err?.name;
  if (code === "ETIMEDOUT" || code === "ECONNRESET" || code === "ENOTFOUND" ||
      code === "APIConnectionTimeoutError" || code === "AbortError") return true;
  if (err?.message && /\btimed out\b|\baborted\b/i.test(err.message)) return true;
  return false;
}

// A hard "this MODEL can't serve this request" error: an unknown/removed model
// id, or the prompt overflowing the model's context window. Retrying the SAME
// model is futile (so isRetryable stays false — no wasted same-model retries),
// but a DIFFERENT fallback model may well succeed. These must ESCALATE to the
// fallback instead of collapsing the stage — e.g. the composer dropping straight
// to the bland deterministic template when gemini could have composed the video.
function isModelFatal(err) {
  const status = err?.status || err?.response?.status;
  // 400/404 = bad id / context overflow. 403 = a premium model (e.g. opus)
  // intermittently refused by OpenRouter policy/routing — a DIFFERENT fallback
  // model serves it, so escalate instead of collapsing to the bland template.
  if (status === 400 || status === 403 || status === 404) return true;
  const msg = String(err?.message || "").toLowerCase();
  return /context length|maximum context|context_length_exceeded|no endpoints|not a valid model|model.*not found|no such model/.test(msg);
}

// Combine an optional external AbortSignal (e.g. the pipeline stage budget) with
// a per-call timeout, so EITHER firing cancels the in-flight request promptly.
function withTimeoutSignal(external, timeoutMs, timeoutMsg) {
  const timeoutAc = new AbortController();
  const timer = setTimeout(() => timeoutAc.abort(new Error(timeoutMsg)), timeoutMs);
  const signal = external ? AbortSignal.any([external, timeoutAc.signal]) : timeoutAc.signal;
  return { signal, clear: () => clearTimeout(timer) };
}

// ---------- PRIMARY: KIE AI via raw fetch ----------
// primary.api === "responses": xAI/OpenAI Responses API (KIE's only Grok
// surface — verified live: /chat/completions 422s "model not supported" for
// grok-4-5, /responses works). Request: { model, input:[messages], stream,
// temperature, text.format for JSON mode }. Reply: output[] carrying a
// "reasoning" item (grok-4-5 is a reasoning model) + a "message" item whose
// content[] holds { type:"output_text", text }; usage is input_tokens/
// output_tokens (output INCLUDES reasoning tokens — billed accordingly).
// Any other primary.api value = legacy OpenAI-compatible /chat/completions.
// KIE's Cloudflare edge kills non-streamed responses that take longer than
// ~100-125s with a 524 — which is every big composer/storyboard call on a
// reasoning model. STREAM those instead: SSE keeps bytes flowing so the edge
// never times out. Verified live: KIE emits standard OpenAI Responses-API SSE
// (response.output_text.delta carrying {delta}, response.completed carrying
// usage). Short stages keep the simple non-streamed path.
const KIE_STREAM_ABOVE_MS = 150_000;

async function readKieSse(resp) {
  const decoder = new TextDecoder();
  let buf = "", text = "", usage = null, completed = false;
  for await (const chunk of resp.body) {
    buf += decoder.decode(chunk, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const block = buf.slice(0, idx); buf = buf.slice(idx + 2);
      for (const line of block.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        let ev;
        try { ev = JSON.parse(payload); } catch { continue; }
        if (ev.type === "response.output_text.delta" && typeof ev.delta === "string") text += ev.delta;
        else if (ev.type === "response.completed") { usage = ev.response?.usage || null; completed = true; }
        else if (ev.type === "response.failed" || ev.type === "error") {
          throw new Error(`kie stream: ${JSON.stringify(ev).slice(0, 200)}`);
        }
      }
    }
  }
  if (!text) throw new Error(`kie stream: no output_text received (completed=${completed})`);
  return { text, usage };
}

async function callKie({ messages, jsonMode, temperature, timeoutMs, stage, signal: external }) {
  const p = config.llm.primary;
  const responsesApi = p.api === "responses";
  const streaming = responsesApi && Number(timeoutMs) > KIE_STREAM_ABOVE_MS;
  const url = `${p.baseUrl.replace(/\/$/, "")}/${responsesApi ? "responses" : "chat/completions"}`;
  const body = responsesApi
    ? {
        model: p.model,
        input: messages,
        stream: streaming,
        temperature: temperature ?? config.llm.temperature,
      }
    : {
        model: p.model,
        messages,
        stream: false, // KIE defaults stream:true — must force false for a single JSON response
        temperature: temperature ?? config.llm.temperature,
      };
  if (jsonMode) {
    if (responsesApi) body.text = { format: { type: "json_object" } };
    else body.response_format = { type: "json_object" };
  }

  const { signal, clear: hardTimer } = withTimeoutSignal(external, timeoutMs, "kie call timed out");
  const t0 = Date.now();
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${p.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal,
    });

    // Streaming path (long stages): accumulate SSE deltas. Errors still arrive
    // as JSON (in-body {code,msg} or HTTP status) — detect by content-type.
    if (streaming && resp.ok && String(resp.headers.get("content-type") || "").includes("text/event-stream")) {
      const { text, usage } = await readKieSse(resp);
      const dtS = Date.now() - t0;
      const tokensInS = usage?.input_tokens ?? 0;
      const tokensOutS = usage?.output_tokens ?? 0;
      console.log(`[kie] ${p.model} stage=${stage || "?"} ok (${dtS}ms streamed, in=${tokensInS} out=${tokensOutS}, ${text.length}ch)`);
      return { text, tokensIn: tokensInS, tokensOut: tokensOutS, model: p.model };
    }

    const dt = Date.now() - t0;
    const rawText = await resp.text();

    let data;
    try {
      data = JSON.parse(rawText);
    } catch {
      const err = new Error(`kie: non-JSON response (HTTP ${resp.status}): ${rawText.slice(0, 200)}`);
      err.status = resp.status;
      throw err;
    }

    // KIE returns transport errors in-body with HTTP 200: {code, msg, data}.
    if (data && typeof data.code === "number" && data.code !== 200) {
      const err = new Error(`kie: API error ${data.code} — ${data.msg || "unknown"}`);
      err.status = data.code; // 429/5xx -> retryable via isRetryable()
      throw err;
    }
    if (!resp.ok) {
      const err = new Error(`kie: HTTP ${resp.status} — ${rawText.slice(0, 200)}`);
      err.status = resp.status;
      throw err;
    }

    let text;
    if (responsesApi) {
      const msg = (Array.isArray(data.output) ? data.output : []).find((o) => o && o.type === "message");
      const part = (Array.isArray(msg?.content) ? msg.content : []).find((c) => c && c.type === "output_text");
      text = part?.text ?? "";
    } else {
      text = data.choices?.[0]?.message?.content ?? "";
    }
    if (!text) {
      throw new Error(`kie: empty content in response: ${rawText.slice(0, 200)}`);
    }
    const tokensIn = (responsesApi ? data.usage?.input_tokens : data.usage?.prompt_tokens) ?? 0;
    const tokensOut = (responsesApi ? data.usage?.output_tokens : data.usage?.completion_tokens) ?? 0;
    console.log(`[kie] ${p.model} stage=${stage || "?"} ok (${dt}ms, in=${tokensIn} out=${tokensOut}, ${text.length}ch)`);
    return { text, tokensIn, tokensOut, model: p.model };
  } catch (err) {
    const dt = Date.now() - t0;
    const tag = err?.status || err?.code || err?.name || err?.message?.slice(0, 80) || "unknown";
    console.warn(`[kie] ${p.model} stage=${stage || "?"} FAILED after ${dt}ms: ${tag}`);
    throw err;
  } finally {
    hardTimer();
  }
}

// ---------- FALLBACK: OpenRouter via OpenAI SDK ----------
// Retries transient failures (429/402/5xx/timeout) on the SAME model with
// backoff before giving up — Gemini's OpenAI-compat endpoint throws frequent
// transient 503s, and without this a single 503 on a composer repair lap kills
// the whole composition (falling back to the deterministic template).
async function callOnce({ body, timeoutMs, stage, model, signal: external }) {
  const MAX_ATTEMPTS = 3;
  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (external?.aborted) throw external.reason || new Error("call aborted");
    const { signal, clear: hardTimer } = withTimeoutSignal(external, timeoutMs, "call timed out");
    const t0 = Date.now();
    try {
      const resp = await client.chat.completions.create({ ...body, model }, { signal });
      const dt = Date.now() - t0;
      const text = resp.choices?.[0]?.message?.content ?? "";
      const finish = resp.choices?.[0]?.finish_reason;
      const tokensIn = resp.usage?.prompt_tokens ?? 0;
      const tokensOut = resp.usage?.completion_tokens ?? 0;

      // Guard against gemini's intermittent "lazy stop": a 200-OK response
      // (finish_reason usually "stop") whose body is empty or — in JSON mode — a
      // truncated/unbalanced object. It is NOT an HTTP error, so without this the
      // caller gets junk and re-hits the same flaky model. Synthesize a retryable
      // error so the loop retries this model, then chat() escalates to the fallback.
      const wantsJson = body?.response_format?.type === "json_object";
      let badCompletion = null;
      if (!text.trim()) {
        badCompletion = `empty completion (finish=${finish}, out=${tokensOut})`;
      } else if (wantsJson) {
        try { extractFirstJsonObject(text); }
        catch { badCompletion = `truncated/unparseable JSON (finish=${finish}, out=${tokensOut}, ${text.length}ch)`; }
      }
      if (badCompletion) {
        console.warn(`[openrouter] ${model} stage=${stage || "?"} returned a bad completion: ${badCompletion}`);
        const e = new Error(badCompletion); e.retryable = true; throw e;
      }

      console.log(`[openrouter] ${model} stage=${stage || "?"} ok (${dt}ms, in=${tokensIn} out=${tokensOut}, ${text.length}ch)`);
      return { text, tokensIn, tokensOut, model };
    } catch (err) {
      const dt = Date.now() - t0;
      const tag = err?.status || err?.code || err?.name || err?.message?.slice(0, 80) || "unknown";
      console.warn(`[openrouter] ${model} stage=${stage || "?"} FAILED after ${dt}ms: ${tag}`);
      lastErr = err;
      hardTimer();
      // 402 affordability: OpenRouter pre-charges against max_tokens, and its
      // error names the exact ceiling it CAN afford ("...can only afford N").
      // A finished composition needs ~10-15k output tokens — far below the 50k
      // default ceiling — so shrink and retry instead of failing three times
      // with the identical unaffordable request.
      if (attempt < MAX_ATTEMPTS && err?.status === 402 && !external?.aborted) {
        const afford = Number((String(err?.message || "").match(/can only afford (\d+)/i) || [])[1]);
        if (Number.isFinite(afford) && afford >= 6000 && afford < body.max_tokens) {
          body.max_tokens = Math.floor(afford * 0.9);
          console.warn(`[openrouter] ${model} 402 affordability — shrinking max_tokens to ${body.max_tokens} and retrying`);
          continue;
        }
      }
      if (attempt < MAX_ATTEMPTS && isRetryable(err) && !external?.aborted) {
        const backoff = 1500 * attempt;
        console.warn(`[openrouter] ${model} transient ${tag} — retry ${attempt}/${MAX_ATTEMPTS - 1} in ${backoff}ms`);
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }
      throw err;
    } finally {
      hardTimer();
    }
  }
  throw lastErr;
}

async function chat({ system, user, userSuffix, jsonMode = false, temperature, model, stage, signal }) {
  if (signal?.aborted) throw signal.reason || new Error("llm: aborted before dispatch");

  // userSuffix: a small variable tail (e.g. the composer's lint-repair
  // feedback) appended after a large constant prefix, so providers can
  // prompt-cache the prefix across repair laps. Previously this param was
  // silently DROPPED — composer repair attempts re-sent the identical prompt
  // with no feedback, so the model could never fix what lint flagged.
  const userContent = userSuffix && typeof user === "string" ? `${user}\n\n${userSuffix}` : user;
  const messages = [
    { role: "system", content: system },
    { role: "user", content: userContent },
  ];
  // Per-stage timeout: the composer authors a ~25KB document from a ~140KB
  // prompt and is legitimately slow (deepseek ~170s) — a flat 180s times it out
  // and re-sends the giant prompt on retry. Heavy stages get a longer ceiling.
  const timeoutMs = Math.max(
    10_000,
    Number(config.llm.requestTimeoutByStage?.[stage]) || Number(config.llm.requestTimeoutMs) || 90_000
  );

  // Per-stage temperature: a distilled, decision-table-driven stage (composer)
  // should TRANSCRIBE its recipe, not improvise — low temp makes a cheap model
  // copy defaults instead of inventing variance. Explicit caller arg always wins.
  const effTemp = temperature ?? config.llm.temperatureByStage?.[stage] ?? config.llm.temperature;

  const orBody = {
    messages,
    temperature: effTemp,
    // Explicit output ceiling: OpenRouter pre-charges affordability against
    // max_tokens (default 65k), so an explicit cap keeps requests viable as
    // the daily credit limit depletes — and bounds runaway reasoning.
    max_tokens: Number(config.llm.maxTokens?.[stage]) || Number(config.llm.maxTokens?.default) || 12288,
  };
  if (jsonMode) orBody.response_format = { type: "json_object" };

  // OpenRouter model selection (used as fallback, or as primary when a caller
  // forces an explicit `model`).
  const orPrimary = model || (stage ? modelForStage(stage) : config.llm.model);
  const orFallback = config.llm.modelFallback;

  // The KIE primary (grok-4-5) is a REASONING model — output tokens include
  // reasoning and are billed, so a trivial stage (vo_fit, a QA verdict) can burn
  // 3k+ output tokens where the flat fallback model spends 300. Reserve the
  // primary for the PREMIUM creative stages (where deep reasoning shows up on
  // screen) and send everything else straight to the cheap OpenRouter model.
  // Override with config.llm.premiumStages. usage.js mirrors this split when
  // pricing stages — keep the two in sync.
  const premiumStages = new Set(config.llm.premiumStages || ["brief", "storyboard", "script", "composer"]);
  const stagePremium = !stage || premiumStages.has(stage);
  const kieEnabled = config.llm.primary && config.llm.primary.apiKey && !model && stagePremium;

  console.log(`[llm] primary=${kieEnabled ? `kie:${config.llm.primary.model}` : (stagePremium ? "none" : "none (fast stage)")} fallback=${orPrimary}->${orFallback || "none"} stage=${stage || "?"} dispatching (sys=${system.length}ch user=${user.length}ch json=${jsonMode} timeout=${timeoutMs}ms)`);

  // 1. PRIMARY: KIE Gemini. KIE's Cloudflare edge throws transient 524/5xx
  // timeouts on the bigger prompts (storyboard/composer), so RETRY it a couple of
  // times before falling back — the OpenRouter fallback is often daily-limited, so
  // a premature fall-through just fails the whole stage. Any non-retryable error
  // (or exhausted retries) still falls through. Skip if the stage was cancelled.
  if (kieEnabled) {
    const KIE_ATTEMPTS = 3;
    for (let a = 1; a <= KIE_ATTEMPTS; a++) {
      if (signal?.aborted) throw signal.reason || new Error("llm: aborted");
      try {
        return await callKie({ messages, jsonMode, temperature: effTemp, timeoutMs, stage, signal });
      } catch (err) {
        if (signal?.aborted) throw err;
        const canRetry = a < KIE_ATTEMPTS && isRetryable(err);
        if (canRetry) {
          const backoff = 1000 * a;
          console.warn(`[llm] KIE ${err?.status || err?.code || err?.message || err} on stage=${stage} — retry ${a}/${KIE_ATTEMPTS - 1} in ${backoff}ms`);
          await new Promise((r) => setTimeout(r, backoff));
          continue;
        }
        console.warn(`[llm] KIE primary failed (${err?.status || err?.message || err}); falling back to OpenRouter ${orPrimary}`);
        break;
      }
    }
  }

  // 2. FALLBACK: OpenRouter primary model.
  try {
    return await callOnce({ body: orBody, timeoutMs, stage, model: orPrimary, signal });
  } catch (err) {
    if (signal?.aborted) throw err;
    // Escalate to the fallback model on a transient error OR a model-fatal one
    // (bad id / context overflow) — the latter won't recover by retrying the
    // same model but a different model can, so it must not collapse the stage.
    if (!orFallback || orFallback === orPrimary || !(isRetryable(err) || isModelFatal(err))) throw err;
    // 3. FALLBACK: OpenRouter secondary model.
    console.warn(`[openrouter] FALLBACK: ${orPrimary} failed; switching to ${orFallback} for stage=${stage}`);
    try {
      return await callOnce({ body: orBody, timeoutMs, stage, model: orFallback, signal });
    } catch (err2) {
      const e = new Error(`llm: all providers failed for stage=${stage}. openrouter ${orPrimary}: ${err?.status || err?.code || err?.message || err}. openrouter ${orFallback}: ${err2?.status || err2?.code || err2?.message || err2}`);
      throw e;
    }
  }
}

// Budget probe (free endpoints, 60s cache). Returns { remaining, limit } in
// USD, or null when the probe fails — callers must treat null as "unknown,
// proceed". True spendable budget is the LARGER of the per-key remaining
// (/key.limit_remaining) and the account balance (/credits: total - usage):
// a key can show a low per-key cap reading yet still draw from the account's
// credits (verified: calls succeed against a $53 account whose key reports
// $0.004 remaining). Using the max avoids falsely blocking a funded account.
let budgetCache = { at: 0, value: null };
async function checkBudget() {
  if (Date.now() - budgetCache.at < 60_000) return budgetCache.value;
  const base = config.llm.baseUrl.replace(/\/$/, "");
  const hdr = { Authorization: `Bearer ${config.llm.apiKey}` };
  let perKey = null, account = null, limit = null;
  try {
    const r = await fetch(`${base}/key`, { headers: hdr, signal: AbortSignal.timeout(10_000) });
    if (r.ok) { const d = (await r.json()).data || {}; perKey = d.limit_remaining ?? null; limit = d.limit ?? null; }
  } catch { /* probe optional */ }
  try {
    const r = await fetch(`${base}/credits`, { headers: hdr, signal: AbortSignal.timeout(10_000) });
    if (r.ok) { const d = (await r.json()).data || {}; const c = Number(d.total_credits), u = Number(d.total_usage); if (Number.isFinite(c) && Number.isFinite(u)) account = c - u; }
  } catch { /* probe optional */ }
  const remaining = (perKey != null || account != null) ? Math.max(perKey ?? 0, account ?? 0) : null;
  budgetCache = { at: Date.now(), value: remaining == null ? null : { remaining, limit } };
  return budgetCache.value;
}

const BUDGET_EXHAUSTED_MSG =
  "LLM budget exhausted — the OpenRouter key's spend limit is used up. " +
  "Daily-limit keys reset automatically each day; otherwise add credits or raise the key's limit at openrouter.ai/settings/keys.";

module.exports = { chat, modelForStage, checkBudget, BUDGET_EXHAUSTED_MSG };
