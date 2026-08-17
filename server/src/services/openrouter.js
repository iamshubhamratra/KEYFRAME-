// LLM client — per-stage model routing across two providers.
// Exposes chat() returning { text, tokensIn, tokensOut, model, provider }.
// `model` + `provider` identify who ACTUALLY served the call, so usage.js can price
// each stage at the rate of the model that answered it.
//
// Model cascade (per call):
//   1. config.llm.primary.stageModels[stage]  (heavy stages -> grok-4-5)
//      falling back to config.llm.primary.model (gemini-3-6-flash) for every other stage
//   2. config.llm.primary.fallbackModel — tried once if the first one fails outright.
//   3. throw — the stage drops to its DETERMINISTIC fallback (scene-kit composer /
//      script-derived storyboard). This is the codebase's fail-open law.
//
// TWO PROVIDERS. Every model is declared in config.llm.primary.models with an optional
// `provider` ("kie" by default, or "openrouter"). KIE serves the heavy and vision
// stages; OpenRouter serves the cheap TEXT-ONLY light tier (vo_fit, art_director,
// dressing, and the legacy assets/audio planners) where a 15x cheaper model is worth
// more than a marginally better one, and where every stage already fails open.
//
// Because fallbackModel is a KIE model, the cascade crosses providers automatically:
// an OpenRouter light stage that flakes lands on gemini-3-6-flash rather than dropping
// to its template. config.llm.baseUrl / llm.apiKey are the OpenRouter credential — they
// also still serve TTS (services/tts.js) and the OpenRouter half of checkBudget().
//
// TWO WIRE PROTOCOLS, because KIE does not serve both models the same way:
//   - "openai"    — https://api.kie.ai/<slug>-openai/v1/chat/completions. Standard
//                   OpenAI chat completions. Serves the gemini family (incl. vision).
//   - "responses" — https://api.kie.ai/grok/v1/responses. xAI's Responses API: the
//                   messages go in `input`, the ceiling is `max_output_tokens`, JSON mode
//                   is `text.format`, and the reply is an `output[]` array of reasoning +
//                   message parts. grok-4-5 is ONLY available here — every
//                   `grok-*-openai/v1` slug returns 422 "The model is not supported".
//
// KIE quirk handled here (BOTH protocols): KIE returns transport-level errors as HTTP
// 200 with a JSON body {code, msg, data} (code !== 200). An SDK would treat that as a
// success and yield empty content, so we use raw fetch and inspect the body explicitly,
// mapping code -> err.status so isRetryable() works.

const config = require("../config");
const { extractFirstJsonObject } = require("./json_lenient");

const KIE = config.llm.primary || {};

// The KIE model id for a stage. Kept exported under the old name because usage.js
// re-exports it and scripts/backfill-usage.js prices historical jobs through it.
function modelForStage(stage) {
  const table = KIE.stageModels || {};
  const kind = stage ? table[stage] : null;
  if (!kind || kind === "default") return KIE.model;
  if (kind === "fast") return KIE.modelFast || KIE.model;
  return kind; // a literal KIE model id, e.g. "grok-4-5" for the composer
}

// Where a model lives, how it must be spoken to, and WHOSE KEY pays for it.
//
// PROVIDER vs PROTOCOL — two independent axes that used to be the same axis:
//   provider — who bills the call and which credential it carries.
//     "kie" (default)  -> llm.primary.apiKey
//     "openrouter"     -> llm.apiKey (the key that already serves TTS)
//   protocol — the wire dialect ("openai" chat/completions, or xAI "responses").
// OpenRouter speaks the same OpenAI dialect as KIE's gemini slugs, so a cheap
// OpenRouter model is reachable without a second transport — only a second key.
// Declared per-model in llm.primary.models[id].provider.
function endpointFor(modelId) {
  const entry = (KIE.models || {})[modelId];
  if (entry && entry.baseUrl) {
    const provider = entry.provider === "openrouter" ? "openrouter" : "kie";
    return {
      baseUrl: String(entry.baseUrl).replace(/\/$/, ""),
      protocol: entry.protocol || "openai",
      provider,
      apiKey: provider === "openrouter" ? config.llm.apiKey : KIE.apiKey,
      // `reasoning: false` in the model entry suppresses a reasoning model's thinking
      // trace. Not a micro-optimisation — MEASURED on qwen3.7-flash's vo_fit call:
      // 1961 output tokens of thinking for a 7-token answer, which at $0.13/1M still
      // costs 4x what gemini-3-6-flash charges for the same rewrite at $2.25/1M.
      // The cheap tier is only cheap if the token COUNT stays small; per-token price
      // alone is a trap for short-output stages. Same answer either way (verified).
      reasoning: entry.reasoning,
    };
  }
  // Back-compat with the single-model primary shape (baseUrl + model, no models map).
  if (KIE.baseUrl) {
    return { baseUrl: String(KIE.baseUrl).replace(/\/$/, ""), protocol: "openai", provider: "kie", apiKey: KIE.apiKey };
  }
  throw new Error(`llm: no endpoint configured for model "${modelId}" (add it to llm.primary.models)`);
}

function isRetryable(err) {
  // Empty / truncated-JSON completions are flagged retryable by assertUsable() — a
  // 200-OK reply with nothing in it is not an HTTP error, so we synthesize one.
  if (err?.retryable === true) return true;
  const status = err?.status || err?.response?.status;
  if (status === 429) return true;
  // 402 (out of credit) is deliberately NOT retryable: retrying the same request only
  // burns more calls for no gain. It still escalates to the fallback MODEL below.
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

// A 200-OK reply that is unusable: empty, or — in JSON mode — truncated/unbalanced.
// Observed on gemini-3-6-flash roughly 1 call in 5 (identical requests then succeed),
// so this MUST be retryable: with no cross-provider fallback left, treating a flake as
// fatal would collapse the stage to its deterministic template on the first hiccup.
function assertUsable({ text, jsonMode, finish, tokensOut, modelId }) {
  let bad = null;
  if (!String(text || "").trim()) {
    bad = `empty completion (finish=${finish}, out=${tokensOut})`;
  } else if (jsonMode) {
    try { extractFirstJsonObject(text); }
    catch { bad = `truncated/unparseable JSON (finish=${finish}, out=${tokensOut}, ${text.length}ch)`; }
  }
  if (bad) {
    const e = new Error(`${modelId}: ${bad}`);
    e.retryable = true;
    throw e;
  }
}

// xAI's Responses API names its content parts differently from OpenAI's chat format.
// Heavy (grok) stages are text-only today, so this is defensive: a vision payload that
// slipped onto the responses protocol is translated rather than silently rejected.
function toResponsesInput(messages) {
  return messages.map((m) => {
    if (!Array.isArray(m.content)) return { role: m.role, content: m.content };
    const parts = m.content.map((p) => {
      if (p && p.type === "image_url") {
        return { type: "input_image", image_url: p.image_url?.url || p.image_url };
      }
      if (p && p.type === "text") return { type: "input_text", text: p.text };
      return p;
    });
    return { role: m.role, content: parts };
  });
}

// ---------- model call (both providers, both protocols) ----------
async function callModel({ modelId, messages, jsonMode, temperature, maxTokens, timeoutMs, stage, signal: external }) {
  const { baseUrl, protocol, provider, apiKey, reasoning } = endpointFor(modelId);
  if (!apiKey) {
    throw new Error(
      `llm: model "${modelId}" is declared provider="${provider}" but its key is missing ` +
      `(${provider === "openrouter" ? "llm.apiKey / OPENROUTER_API_KEY" : "llm.primary.apiKey / KIE_API_KEY"}).`
    );
  }
  const responses = protocol === "responses";
  // ANTHROPIC MESSAGES — the third dialect, and the only way to reach Claude on KIE.
  //
  // Probed directly against the provider: KIE serves Claude at https://api.kie.ai/claude/v1
  // under Anthropic's own /messages contract. It is NOT reachable through the OpenAI slug
  // convention the gemini family uses — `claude-*-openai/v1`, `claude/v1/chat/completions` and
  // every variant return 422 "The model is not supported".
  //
  // AND THE OPENAI SLUG IS A TRAP, not merely a dead end: posting model:"claude-opus-5" to
  // .../gemini-3-6-flash-openai/v1/chat/completions returns HTTP 200 with a normal completion,
  // because that endpoint routes on the PATH and ignores the model field. A config that named
  // Claude against a gemini baseUrl would look correct, cost money and silently serve Gemini.
  const anthropic = protocol === "anthropic";
  const url = responses ? `${baseUrl}/responses`
    : anthropic ? `${baseUrl}/messages`
      : `${baseUrl}/chat/completions`;

  // Anthropic takes the system prompt as a TOP-LEVEL parameter, not as a messages entry — a
  // {role:"system"} left in the array is rejected. chat() always builds [system, user], so it is
  // split back out here rather than at every call site.
  const sysMsg = anthropic ? messages.find((m) => m.role === "system") : null;
  const convo = anthropic ? messages.filter((m) => m.role !== "system") : messages;

  // KIE defaults stream:true on BOTH protocols — it must be forced off or the body
  // comes back as an SSE event stream instead of one JSON object.
  const body = responses
    ? {
        model: modelId,
        stream: false,
        input: toResponsesInput(messages),
        temperature: temperature ?? config.llm.temperature,
      }
    : anthropic
      ? {
          model: modelId,
          stream: false,
          messages: convo,
          ...(sysMsg && sysMsg.content ? { system: String(sysMsg.content) } : {}),
          temperature: temperature ?? config.llm.temperature,
        }
      : {
          model: modelId,
          messages,
          stream: false,
          temperature: temperature ?? config.llm.temperature,
        };

  // Always send the output ceiling. Omitting it makes KIE apply its OWN low default
  // (~1k tokens), which silently TRUNCATES long replies — notably multi-line
  // Devanagari/CJK translations — into unbalanced JSON that fails to parse, dropping
  // the whole film's on-screen text back to English (0% localized).
  if (Number(maxTokens) > 0) {
    if (responses) body.max_output_tokens = Number(maxTokens);
    else body.max_tokens = Number(maxTokens);
  } else if (anthropic) {
    // Anthropic REQUIRES max_tokens — omitting it is a 400, unlike the other two dialects
    // where it merely lets the provider apply its own low default.
    body.max_tokens = Number(config.llm.maxTokens?.default) || 12288;
  }
  if (jsonMode) {
    if (responses) body.text = { format: { type: "json_object" } };
    // Anthropic has no response_format / JSON mode. The system prompts that use jsonMode
    // already instruct "return one JSON object and nothing else", and json_lenient's
    // extractFirstJsonObject tolerates a prose wrapper — which is how every caller reads the
    // reply anyway. Sending response_format here would be a 400.
    else if (!anthropic) body.response_format = { type: "json_object" };
  }
  // OpenRouter's unified reasoning control. Only `enabled:false` is honored here —
  // `effort:"minimal"` still emitted 1245 thinking tokens in testing, and
  // `max_tokens:0` is rejected outright (HTTP 400) by the upstream provider.
  if (provider === "openrouter" && reasoning === false) {
    body.reasoning = { enabled: false };
  }

  const { signal, clear: hardTimer } = withTimeoutSignal(external, timeoutMs, `${provider} call timed out`);
  const t0 = Date.now();
  try {
    const headers = {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    };
    // Anthropic's API version pin. KIE proxies it through; without it the upstream can pick a
    // different default contract. (Probed: KIE's own 401 body explicitly names the Authorization
    // header, so Bearer is right here — `x-api-key`, Anthropic's own convention, is rejected.)
    if (anthropic) headers["anthropic-version"] = "2023-06-01";
    // OpenRouter attributes traffic by these two; both already live in config for TTS.
    if (provider === "openrouter") {
      if (config.llm.httpReferer) headers["HTTP-Referer"] = config.llm.httpReferer;
      if (config.llm.xTitle) headers["X-Title"] = config.llm.xTitle;
    }
    const resp = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal });
    const dt = Date.now() - t0;
    const rawText = await resp.text();

    let data;
    try {
      data = JSON.parse(rawText);
    } catch {
      const err = new Error(`${provider}: non-JSON response (HTTP ${resp.status}): ${rawText.slice(0, 200)}`);
      err.status = resp.status;
      throw err;
    }

    // KIE returns transport errors in-body with HTTP 200: {code, msg, data}.
    if (data && typeof data.code === "number" && data.code !== 200) {
      const err = new Error(`${provider}: API error ${data.code} — ${data.msg || "unknown"}`);
      err.status = data.code; // 429/5xx -> retryable via isRetryable()
      throw err;
    }
    // OpenRouter's equivalent: HTTP 200 carrying {error:{code,message}} and no choices.
    // Without this the reply reads as an empty completion — retried three times and
    // then blamed on the model, when the real cause was a 402 or a bad key.
    if (data && data.error && typeof data.error === "object") {
      const err = new Error(`${provider}: API error ${data.error.code || "?"} — ${data.error.message || "unknown"}`);
      err.status = Number(data.error.code) || resp.status;
      throw err;
    }
    if (!resp.ok) {
      const err = new Error(`${provider}: HTTP ${resp.status} — ${rawText.slice(0, 200)}`);
      err.status = resp.status;
      throw err;
    }

    let text, tokensIn, tokensOut, finish;
    if (responses) {
      // output[] interleaves reasoning and message parts; only the message carries text.
      const messagesOut = (data.output || []).filter((o) => o && o.type === "message");
      text = messagesOut
        .flatMap((m) => (m.content || [])
          .filter((c) => c && typeof c.text === "string")
          .map((c) => c.text))
        .join("");
      tokensIn = data.usage?.input_tokens ?? 0;
      tokensOut = data.usage?.output_tokens ?? 0;
      finish = data.status || data.incomplete_details?.reason || "?";
    } else if (anthropic) {
      // content[] is a list of blocks; only the text ones carry the reply (a thinking-enabled
      // model also emits `thinking` blocks, which must not be concatenated into the answer).
      text = (data.content || [])
        .filter((c) => c && c.type === "text" && typeof c.text === "string")
        .map((c) => c.text)
        .join("");
      tokensIn = data.usage?.input_tokens ?? 0;
      tokensOut = data.usage?.output_tokens ?? 0;
      finish = data.stop_reason || "?";
    } else {
      text = data.choices?.[0]?.message?.content ?? "";
      tokensIn = data.usage?.prompt_tokens ?? 0;
      tokensOut = data.usage?.completion_tokens ?? 0;
      finish = data.choices?.[0]?.finish_reason || "?";
    }

    assertUsable({ text, jsonMode, finish, tokensOut, modelId });

    console.log(`[${provider}] ${modelId} stage=${stage || "?"} ok (${dt}ms, in=${tokensIn} out=${tokensOut}, ${text.length}ch)`);
    return { text, tokensIn, tokensOut, model: modelId, provider };
  } catch (err) {
    const dt = Date.now() - t0;
    const tag = err?.status || err?.code || err?.name || err?.message?.slice(0, 80) || "unknown";
    console.warn(`[${provider}] ${modelId} stage=${stage || "?"} FAILED after ${dt}ms: ${tag}`);
    throw err;
  } finally {
    hardTimer();
  }
}

async function chat({ system, user, jsonMode = false, temperature, model, stage, signal }) {
  if (signal?.aborted) throw signal.reason || new Error("llm: aborted before dispatch");
  // A per-model key check lives in callModel(); this only rejects the case where
  // NEITHER provider is configured, so an OpenRouter-served light stage is not
  // blocked by a missing KIE key it never uses.
  if (!KIE.apiKey && !config.llm.apiKey) {
    throw new Error("llm: no provider configured (llm.primary.apiKey / KIE_API_KEY, or llm.apiKey / OPENROUTER_API_KEY).");
  }

  const messages = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
  // Per-stage timeout: the composer authors a ~25KB document from a ~140KB prompt and is
  // legitimately slow — a flat 180s times it out and re-sends the giant prompt on retry.
  const timeoutMs = Math.max(
    10_000,
    Number(config.llm.requestTimeoutByStage?.[stage]) || Number(config.llm.requestTimeoutMs) || 90_000
  );

  // Per-stage temperature: a distilled, decision-table-driven stage (composer) should
  // TRANSCRIBE its recipe, not improvise. Explicit caller arg always wins.
  const effTemp = temperature ?? config.llm.temperatureByStage?.[stage] ?? config.llm.temperature;

  const maxTokens = Number(config.llm.maxTokens?.[stage]) || Number(config.llm.maxTokens?.default) || 12288;

  // An explicit `model` arg pins the call to that model with no fallback (no caller
  // does this today; it exists for one-off scripts). Otherwise: stage model -> fallback.
  //
  // The fallback is a KIE model, so for a stage pinned to an OpenRouter model this
  // chain now CROSSES PROVIDERS — a cheap model that flakes, 402s, or returns
  // unparseable JSON lands on gemini-3-6-flash instead of collapsing the stage to its
  // deterministic template. That resilience is free and is the reason a light tier is
  // safe to run on a second provider at all.
  const primaryModel = model || modelForStage(stage);
  const useFallback = !model && KIE.fallbackModel && KIE.fallbackModel !== primaryModel;
  const chain = useFallback ? [primaryModel, KIE.fallbackModel] : [primaryModel];

  console.log(`[llm] ${chain.join(" -> ")} stage=${stage || "?"} dispatching (sys=${system.length}ch user=${typeof user === "string" ? user.length : "multipart"}ch json=${jsonMode} timeout=${timeoutMs}ms)`);

  const ATTEMPTS = 3;
  let lastErr;
  for (let i = 0; i < chain.length; i++) {
    const modelId = chain[i];
    // KIE's Cloudflare edge throws transient 524/5xx timeouts on the bigger prompts
    // (storyboard/composer), so retry the SAME model before switching.
    for (let a = 1; a <= ATTEMPTS; a++) {
      if (signal?.aborted) throw signal.reason || new Error("llm: aborted");
      try {
        return await callModel({ modelId, messages, jsonMode, temperature: effTemp, maxTokens, timeoutMs, stage, signal });
      } catch (err) {
        if (signal?.aborted) throw err;
        lastErr = err;
        if (a < ATTEMPTS && isRetryable(err)) {
          const backoff = 1000 * a;
          console.warn(`[llm] ${modelId} ${err?.status || err?.code || err?.message || err} on stage=${stage} — retry ${a}/${ATTEMPTS - 1} in ${backoff}ms`);
          await new Promise((r) => setTimeout(r, backoff));
          continue;
        }
        break;
      }
    }
    const next = chain[i + 1];
    if (next) {
      console.warn(`[llm] FALLBACK: ${modelId} failed (${lastErr?.status || lastErr?.message || lastErr}); switching to ${next} for stage=${stage}`);
    }
  }

  throw new Error(
    `llm: all models failed for stage=${stage} (${chain.join(", ")}). ` +
    `Last error: ${lastErr?.status || lastErr?.code || lastErr?.message || lastErr}. ` +
    `Stage will use its deterministic fallback.`
  );
}

// Budget probe (free endpoints, 60s cache). Returns { remaining, limit } in
// USD, or null when the probe fails — callers must treat null as "unknown,
// proceed".
//
// Both providers are still probed: KIE serves every LLM stage, and OpenRouter still
// bills the voiceover (services/tts.js), so a dead OpenRouter key is a real failure
// even though no LLM call touches it any more.
let budgetCache = { at: 0, value: null };
// KIE bills in credits at a standard $0.005 each (see services/usage.js).
const KIE_CREDIT_USD = 0.005;

/**
 * How much headroom is there to spend, across BOTH providers?
 *
 * WITHIN a provider the constraint is the MINIMUM of its ceilings: a key capped at
 * $3/day with $0.00 left on an account holding $17.34 has zero headroom, not $17.34.
 *
 * ACROSS providers `max` is right — a job can run if either has headroom (KIE for the
 * LLM stages, OpenRouter for the voiceover).
 *
 * Returns null when nothing could be probed (never block on ignorance), else
 * { remaining, limit, openrouter, kie }.
 */
async function checkBudget() {
  if (Date.now() - budgetCache.at < 60_000) return budgetCache.value;

  // ---- OpenRouter (TTS + historical): the lower of the key's allowance and the account credit.
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
  if (KIE.apiKey) {
    try {
      const r = await fetch("https://api.kie.ai/api/v1/chat/credit", {
        headers: { Authorization: `Bearer ${KIE.apiKey}` },
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
  if (kie) {
    bits.push(kie.credits <= 0
      ? `KIE (every LLM stage): balance is ${kie.credits} credits (overdrawn) — top up at kie.ai`
      : `KIE: $${kie.remaining.toFixed(2)} left`);
  }
  if (or) {
    const capped = or.perKey != null && or.perKey <= 0.15;
    bits.push(capped
      ? `OpenRouter (voiceover): the key's ${or.dailyLimit != null ? `$${or.dailyLimit}/day ` : ""}limit is used up ($${or.perKey.toFixed(2)} left today${or.account != null ? `, $${or.account.toFixed(2)} account credit unused` : ""}) — it resets on the daily boundary, or raise the limit at openrouter.ai/settings/keys`
      : `OpenRouter (voiceover): $${Number(or.remaining).toFixed(2)} left — add credits at openrouter.ai/credits`);
  }
  return "LLM budget exhausted — no configured provider has headroom. "
    + (bits.length ? bits.join(". ") + "." : "Add credits or raise the key limits.");
}

const BUDGET_EXHAUSTED_MSG =
  "LLM budget exhausted — no configured provider has spending headroom. " +
  "A negative KIE balance needs a top-up; an OpenRouter daily-limit key resets each day.";

module.exports = { chat, modelForStage, checkBudget, budgetExhaustedMessage, BUDGET_EXHAUSTED_MSG };
