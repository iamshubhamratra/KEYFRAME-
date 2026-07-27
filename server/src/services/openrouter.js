// LLM client with cross-provider fallback.
// Exposes chat() returning { text, tokensIn, tokensOut, model, provider }.
// `model` + `provider` identify who ACTUALLY served the call, so usage.js can price
// KIE and OpenRouter at their own published rates instead of assuming one of them.
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
  // 402 (the key's daily credit limit is used up) is deliberately NOT retryable:
  // near the limit, retrying the same request only burns MORE OpenRouter calls
  // for no gain — the budget is gone. Fail fast so the stage drops to its
  // fallback instead of amplifying spend. (callOnce no longer shrink-and-retries
  // 402 either.)
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

// ---------- PRIMARY: KIE AI (Gemini 3.5 Flash) via raw fetch ----------
async function callKie({ messages, jsonMode, temperature, maxTokens, timeoutMs, stage, signal: external }) {
  const p = config.llm.primary;
  const url = `${p.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const body = {
    model: p.model,
    messages,
    stream: false, // KIE defaults stream:true — must force false for a single JSON response
    temperature: temperature ?? config.llm.temperature,
  };
  // Forward the SAME output ceiling OpenRouter gets. Omitting it makes KIE apply its own
  // LOW default (~1k tokens), which silently TRUNCATES long replies — notably multi-line
  // Devanagari/CJK translations (token-expensive scripts) — into unbalanced JSON that
  // fails to parse, dropping the whole film's on-screen text back to English (0% localized).
  if (Number(maxTokens) > 0) body.max_tokens = Number(maxTokens);
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
    return { text, tokensIn, tokensOut, model: p.model, provider: "kie" };
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
      return { text, tokensIn, tokensOut, model, provider: "openrouter" };
    } catch (err) {
      const dt = Date.now() - t0;
      const tag = err?.status || err?.code || err?.name || err?.message?.slice(0, 80) || "unknown";
      console.warn(`[openrouter] ${model} stage=${stage || "?"} FAILED after ${dt}ms: ${tag}`);
      lastErr = err;
      hardTimer();
      // The former 402 "shrink max_tokens and retry" amplification was removed:
      // near the daily limit it only spent MORE OpenRouter calls squeezing in
      // requests. 402 is now non-retryable (see isRetryable) and fails fast.
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

async function chat({ system, user, jsonMode = false, temperature, model, stage, signal }) {
  if (signal?.aborted) throw signal.reason || new Error("llm: aborted before dispatch");

  const messages = [
    { role: "system", content: system },
    { role: "user", content: user },
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

  // Explicit output ceiling, shared by BOTH providers (KIE + OpenRouter). OpenRouter
  // pre-charges affordability against max_tokens (default 65k), so an explicit cap keeps
  // requests viable as the daily credit depletes and bounds runaway reasoning; KIE needs
  // it because its OWN default cap (~1k) truncates long non-Latin translations.
  const maxTokens = Number(config.llm.maxTokens?.[stage]) || Number(config.llm.maxTokens?.default) || 12288;
  const orBody = {
    messages,
    temperature: effTemp,
    max_tokens: maxTokens,
  };
  if (jsonMode) orBody.response_format = { type: "json_object" };

  // OpenRouter model selection (used as fallback, or as primary when a caller
  // forces an explicit `model`).
  const orPrimary = model || (stage ? modelForStage(stage) : config.llm.model);
  const orFallback = config.llm.modelFallback;

  const kieEnabled = config.llm.primary && config.llm.primary.apiKey && !model;

  // Stages that must NEVER spill onto OpenRouter when KIE fails. The composer
  // (mapped to opus-4.8 — the priciest model — in config.stageModels) and the
  // storyboard send huge prompts; a single KIE 524 would otherwise dump the
  // whole prompt onto OpenRouter and drain the daily budget. For these, the
  // OpenRouter fallback is skipped entirely — a KIE failure drops the stage to
  // its deterministic fallback (scene-kit composer / script-derived storyboard).
  // An explicit `model` arg still overrides (a caller that hard-picks a model
  // genuinely wants OpenRouter). Tune via config.llm.noOpenRouterFallbackStages.
  const noOrStages = config.llm.noOpenRouterFallbackStages || ["composer", "storyboard"];
  const blockOpenRouter = !model && !!stage && noOrStages.includes(stage);

  const fallbackDesc = blockOpenRouter ? "none(KIE-only)" : `${orPrimary}->${orFallback || "none"}`;
  console.log(`[llm] primary=${kieEnabled ? `kie:${config.llm.primary.model}` : "none"} fallback=${fallbackDesc} stage=${stage || "?"} dispatching (sys=${system.length}ch user=${user.length}ch json=${jsonMode} timeout=${timeoutMs}ms)`);

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
        return await callKie({ messages, jsonMode, temperature: effTemp, maxTokens, timeoutMs, stage, signal });
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

  // KIE-only stages: do not fall through to OpenRouter (see blockOpenRouter).
  // Throwing here hands the stage to its deterministic fallback instead of
  // burning the OpenRouter daily budget on a giant composer/storyboard prompt.
  if (blockOpenRouter) {
    throw new Error(
      `llm: stage=${stage} runs KIE-only (no OpenRouter fallback); ` +
      `KIE ${kieEnabled ? "exhausted its retries" : "is not configured"}. ` +
      `Stage will use its deterministic fallback.`
    );
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
// KIE bills in credits at a standard $0.005 each (see services/usage.js).
const KIE_CREDIT_USD = 0.005;

/**
 * How much headroom is there to spend, across BOTH providers?
 *
 * TWO BUGS THIS REPLACES, which together let a job through to fail at its first
 * LLM call instead of being refused with a clear reason:
 *
 *  1. WITHIN OpenRouter it took `Math.max(perKey, account)`. Those are not
 *     alternatives — they are two independent ceilings, and spending is blocked by
 *     whichever is LOWER. A key capped at $3/day with $0.00 left on an account
 *     holding $17.34 reported "$17.34 remaining" and waved the job through, when
 *     the true headroom was zero. Within a provider the constraint is the MINIMUM.
 *
 *  2. It only ever looked at OpenRouter, which has not been the primary since KIE
 *     was wired in. A dead OpenRouter key with a funded KIE account would have been
 *     reported as broke even though every stage would have run fine on KIE — and
 *     the converse (KIE overdrawn, OpenRouter healthy) was invisible.
 *
 * ACROSS providers, `max` IS right: chat() falls back, so a job can run if EITHER
 * has headroom. The two directions are genuinely different and the old code applied
 * the wrong one in the one place it mattered.
 *
 * Returns null when nothing could be probed (never block on ignorance), else
 * { remaining, limit, openrouter, kie } where `remaining` is the best provider's
 * headroom in USD — the number the intake gate should compare against.
 */
async function checkBudget() {
  if (Date.now() - budgetCache.at < 60_000) return budgetCache.value;

  // ---- OpenRouter: the lower of the key's allowance and the account's credit.
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
  // An unset ceiling is "no constraint", NOT zero — so it must not drag the min down.
  const orRemaining = (perKey == null && account == null)
    ? null
    : Math.min(perKey ?? Infinity, account ?? Infinity);

  // ---- KIE: credit balance (can go negative when overdrawn, which is the 402).
  let kieCredits = null;
  if (config.llm.primary && config.llm.primary.apiKey) {
    try {
      const r = await fetch("https://api.kie.ai/api/v1/chat/credit", {
        headers: { Authorization: `Bearer ${config.llm.primary.apiKey}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (r.ok) { const d = await r.json(); if (Number.isFinite(Number(d.data))) kieCredits = Number(d.data); }
    } catch { /* probe optional */ }
  }
  const kieRemaining = kieCredits == null ? null : kieCredits * KIE_CREDIT_USD;

  const known = [orRemaining, kieRemaining].filter((v) => v != null);
  const remaining = known.length ? Math.max(...known) : null;

  const value = remaining == null ? null : {
    remaining,
    limit,
    openrouter: orRemaining == null ? null : { remaining: orRemaining, perKey, account, dailyLimit: limit },
    kie: kieRemaining == null ? null : { remaining: kieRemaining, credits: kieCredits },
  };
  budgetCache = { at: Date.now(), value };
  return value;
}

// Describe WHICH provider is out and what clears it — "budget exhausted" alone sent
// people to the wrong dashboard. A daily cap resets on its own; a negative KIE
// balance only clears with a top-up.
function budgetExhaustedMessage(budget) {
  const bits = [];
  const or = budget && budget.openrouter, kie = budget && budget.kie;
  if (or) {
    const capped = or.perKey != null && or.perKey <= 0.15;
    bits.push(capped
      ? `OpenRouter: the key's ${or.dailyLimit != null ? `$${or.dailyLimit}/day ` : ""}limit is used up ($${or.perKey.toFixed(2)} left today${or.account != null ? `, $${or.account.toFixed(2)} account credit unused` : ""}) — it resets on the daily boundary, or raise the limit at openrouter.ai/settings/keys`
      : `OpenRouter: $${Number(or.remaining).toFixed(2)} left — add credits at openrouter.ai/credits`);
  }
  if (kie) {
    bits.push(kie.credits <= 0
      ? `KIE: balance is ${kie.credits} credits (overdrawn) — top up at kie.ai`
      : `KIE: $${kie.remaining.toFixed(2)} left`);
  }
  return "LLM budget exhausted — no configured provider has headroom. "
    + (bits.length ? bits.join(". ") + "." : "Add credits or raise the key limits.");
}

const BUDGET_EXHAUSTED_MSG =
  "LLM budget exhausted — no configured provider has spending headroom. " +
  "An OpenRouter daily-limit key resets each day; a negative KIE balance needs a top-up.";

module.exports = { chat, modelForStage, checkBudget, budgetExhaustedMessage, BUDGET_EXHAUSTED_MSG };
