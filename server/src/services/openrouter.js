// LLM client with cross-provider fallback.
// Exposes chat() returning { text, tokensIn, tokensOut, model }.
//
// Provider cascade (per call):
//   1. PRIMARY  — KIE AI (Gemini 3.5 Flash), OpenAI-compatible /chat/completions
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
  return config.llm.model;
}

function isRetryable(err) {
  const status = err?.status || err?.response?.status;
  if (status === 429) return true;
  if (status >= 500 && status < 600) return true;
  const code = err?.code || err?.cause?.code || err?.name;
  if (code === "ETIMEDOUT" || code === "ECONNRESET" || code === "ENOTFOUND" ||
      code === "APIConnectionTimeoutError" || code === "AbortError") return true;
  if (err?.message && /\btimed out\b|\baborted\b/i.test(err.message)) return true;
  return false;
}

// Combine an optional external AbortSignal (e.g. the pipeline stage budget) with
// a per-call timeout, so EITHER firing cancels the in-flight request promptly.
function withTimeoutSignal(external, timeoutMs, timeoutMsg) {
  const timeoutAc = new AbortController();
  const timer = setTimeout(() => timeoutAc.abort(new Error(timeoutMsg)), timeoutMs);
  const signal = external ? AbortSignal.any([external, timeoutAc.signal]) : timeoutAc.signal;
  return { signal, clear: () => clearTimeout(timer) };
}

// ---------- PRIMARY: KIE AI (Gemini 3.5 Flash) via raw fetch ----------
async function callKie({ messages, jsonMode, temperature, timeoutMs, stage, signal: external }) {
  const p = config.llm.primary;
  const url = `${p.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const body = {
    model: p.model,
    messages,
    stream: false, // KIE defaults stream:true — must force false for a single JSON response
    temperature: temperature ?? config.llm.temperature,
  };
  if (jsonMode) body.response_format = { type: "json_object" };

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

    const text = data.choices?.[0]?.message?.content ?? "";
    if (!text) {
      throw new Error(`kie: empty content in response: ${rawText.slice(0, 200)}`);
    }
    const tokensIn = data.usage?.prompt_tokens ?? 0;
    const tokensOut = data.usage?.completion_tokens ?? 0;
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
async function callOnce({ body, timeoutMs, stage, model, signal: external }) {
  const { signal, clear: hardTimer } = withTimeoutSignal(external, timeoutMs, "call timed out");
  const t0 = Date.now();
  try {
    const resp = await client.chat.completions.create({ ...body, model }, { signal });
    const dt = Date.now() - t0;
    const text = resp.choices?.[0]?.message?.content ?? "";
    const tokensIn = resp.usage?.prompt_tokens ?? 0;
    const tokensOut = resp.usage?.completion_tokens ?? 0;
    console.log(`[openrouter] ${model} stage=${stage || "?"} ok (${dt}ms, in=${tokensIn} out=${tokensOut}, ${text.length}ch)`);
    return { text, tokensIn, tokensOut, model };
  } catch (err) {
    const dt = Date.now() - t0;
    const tag = err?.status || err?.code || err?.name || err?.message?.slice(0, 80) || "unknown";
    console.warn(`[openrouter] ${model} stage=${stage || "?"} FAILED after ${dt}ms: ${tag}`);
    throw err;
  } finally {
    hardTimer();
  }
}

async function chat({ system, user, jsonMode = false, temperature, model, stage, signal }) {
  if (signal?.aborted) throw signal.reason || new Error("llm: aborted before dispatch");

  const messages = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
  const timeoutMs = Math.max(10_000, Number(config.llm.requestTimeoutMs) || 90_000);

  const orBody = {
    messages,
    temperature: temperature ?? config.llm.temperature,
  };
  if (jsonMode) orBody.response_format = { type: "json_object" };

  // OpenRouter model selection (used as fallback, or as primary when a caller
  // forces an explicit `model`).
  const orPrimary = model || (stage ? modelForStage(stage) : config.llm.model);
  const orFallback = config.llm.modelFallback;

  const kieEnabled = config.llm.primary && config.llm.primary.apiKey && !model;

  console.log(`[llm] primary=${kieEnabled ? `kie:${config.llm.primary.model}` : "none"} fallback=${orPrimary}->${orFallback || "none"} stage=${stage || "?"} dispatching (sys=${system.length}ch user=${user.length}ch json=${jsonMode} timeout=${timeoutMs}ms)`);

  // 1. PRIMARY: KIE Gemini. Any failure falls through to OpenRouter — UNLESS the
  // external signal fired (the whole stage is being cancelled; don't start more work).
  if (kieEnabled) {
    try {
      return await callKie({ messages, jsonMode, temperature, timeoutMs, stage, signal });
    } catch (err) {
      if (signal?.aborted) throw err;
      console.warn(`[llm] KIE primary failed (${err?.status || err?.message || err}); falling back to OpenRouter ${orPrimary}`);
    }
  }

  // 2. FALLBACK: OpenRouter primary model.
  try {
    return await callOnce({ body: orBody, timeoutMs, stage, model: orPrimary, signal });
  } catch (err) {
    if (signal?.aborted) throw err;
    if (!orFallback || orFallback === orPrimary || !isRetryable(err)) throw err;
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

module.exports = { chat, modelForStage };
