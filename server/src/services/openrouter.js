// LLM client with cross-provider fallback.
// Exposes chat() returning { text, tokensIn, tokensOut, model }.
//
// Provider cascade (per call):
//   1. PRIMARY  — KIE AI (config.llm.primary.model, e.g. grok-4-5), premium
//      creative stages only. Two wire formats, selected by primary.api:
//      "responses" (xAI/OpenAI Responses API — the ONLY surface KIE exposes for
//      Grok) or the default OpenAI-compatible /chat/completions.
//   2. KIE ROUTE — when the stage's model id is a "kie:<route>" alias
//      (config.llm.kieRoutes), it dispatches to KIE too. That is how every
//      non-premium stage runs Gemini 3.6 Flash off KIE instead of OpenRouter.
//   3. FALLBACK — OpenRouter primary model (config.llm.model)
//   4. FALLBACK — OpenRouter secondary model (config.llm.modelFallback)
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

// ---------- KIE AI via raw fetch ----------
// One client, two roles:
//   * PRIMARY (config.llm.primary) — the premium creative stages.
//   * NAMED ROUTES (config.llm.kieRoutes) — any model id written "kie:<route>"
//     dispatches here instead of OpenRouter, so a stage names a KIE-served
//     model exactly the way it names an OpenRouter one.
//
// Three wire formats, selected by <route>.api:
//   "responses" — xAI/OpenAI Responses API, KIE's only Grok surface (verified
//     live: /chat/completions 422s "model not supported" for grok-4-5).
//     Request: { model, input:[messages], stream, temperature, text.format for
//     JSON mode }. Reply: output[] carrying a "reasoning" item (grok-4-5 is a
//     reasoning model) + a "message" item whose content[] holds
//     { type:"output_text", text }; usage is input_tokens/output_tokens (output
//     INCLUDES reasoning tokens — billed accordingly).
//   "messages" — Anthropic Messages API (Claude models — verified live against
//     https://api.kie.ai/claude/v1/messages with model:"claude-opus-5"; a bad
//     model on this same route returns KIE's usual {code,msg} 200-wrapped
//     error, so error handling is unchanged). Anthropic's shape differs from
//     both OpenAI surfaces: `system` is a TOP-LEVEL string, not a role:"system"
//     message (Anthropic rejects that role inside `messages`), and `max_tokens`
//     is REQUIRED (OpenAI treats it as optional). Reply: content[] is an array
//     of typed blocks — concatenate the "text" ones; usage is
//     input_tokens/output_tokens. No response_format/json mode exists on this
//     API — jsonMode relies on the system prompt + the tolerant extractor, the
//     same as every other stage's occasional markdown-fenced reply.
//     STREAMING IS NOT IMPLEMENTED for this shape (Anthropic's SSE event
//     sequence — message_start/content_block_delta/message_stop — was not
//     verified live): messages-api calls always go non-streamed regardless of
//     KIE_STREAM_ABOVE_MS, so this route must stay on stages whose prompt is
//     small enough to answer inside the edge's ~100-125s non-streamed window.
//   anything else — OpenAI-compatible /chat/completions (the Gemini-on-KIE
//     routes). Standard messages/choices/usage shapes, and it accepts the
//     multimodal content arrays the vision stages send (verified live with a
//     base64 data: image_url part).
//
// KIE's Cloudflare edge kills non-streamed responses that take longer than
// ~100-125s with a 524 — which is every big composer/storyboard call. STREAM
// those instead: SSE keeps bytes flowing so the edge never times out. Both
// OpenAI-shaped surfaces speak standard SSE (verified live): Responses emits
// response.output_text.delta + response.completed; /chat/completions emits
// chat.completion.chunk with choices[].delta.content then a choice-less final
// chunk carrying usage. Short stages keep the simple non-streamed path.
const KIE_STREAM_ABOVE_MS = 150_000;
const KIE_ALIAS = /^kie:(.+)$/;
// KIE bills every call in "credits", $0.005 each (200 credits = $1) — measured
// live (solved from two calls with deliberately opposite token mixes; a third
// call's prediction matched the real bill to the cent) and cross-checked
// against KIE's own published examples (Nano Banana image = 4 credits =
// $0.02). This is the ONE authoritative source of KIE spend: a static
// per-token price table already overstated one route's cost 3.3x once, and
// Claude-on-KIE makes a token-based table actively MISLEADING — every observed
// call reported a large (~26k), roughly CONSTANT `cache_creation_input_tokens`
// regardless of the actual prompt sent, so a naive $/token estimate would be
// dominated by a number that has nothing to do with what was asked. Reading
// the metered `credits_consumed` off every response sidesteps needing to
// understand that number at all.
const KIE_CREDIT_USD = 0.005;

// Resolve a "kie:<route>" model id into a complete provider descriptor. Returns
// null when the id is not an alias, or when the route has no usable key (the
// caller then falls through to OpenRouter). An alias naming a route that does
// not exist is a config typo — throw rather than silently bill a wrong model.
function kieRoute(modelId) {
  const m = KIE_ALIAS.exec(String(modelId || ""));
  if (!m) return null;
  const route = (config.llm.kieRoutes || {})[m[1]];
  if (!route) throw new Error(`llm: unknown KIE route "${m[1]}" — add it to config.llm.kieRoutes`);
  // Routes share the KIE account key by default; an entry may still carry its own.
  const apiKey = route.apiKey || config.llm.primary?.apiKey || process.env.KIE_API_KEY;
  if (!apiKey) {
    console.warn(`[kie] route ${modelId} has no API key — falling back to OpenRouter`);
    return null;
  }
  return { ...route, apiKey, alias: modelId };
}

// A 200-OK reply that is unusable: empty, or — in JSON mode — not parseable as
// an object (gemini's intermittent "lazy stop" returns finish_reason:"stop"
// with a truncated body). It is NOT an HTTP error, so callers synthesize a
// retryable one from this instead of handing the pipeline junk.
function badCompletionReason(text, jsonMode, finish, tokensOut) {
  if (!String(text || "").trim()) return `empty completion (finish=${finish}, out=${tokensOut})`;
  if (!jsonMode) return null;
  try { extractFirstJsonObject(text); return null; }
  catch { return `truncated/unparseable JSON (finish=${finish}, out=${tokensOut}, ${text.length}ch)`; }
}

async function readKieSse(resp, responsesApi) {
  const decoder = new TextDecoder();
  let buf = "", text = "", usage = null, credits = null, completed = false;
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
        if (typeof ev.credits_consumed === "number") credits = ev.credits_consumed;
        if (responsesApi) {
          if (ev.type === "response.output_text.delta" && typeof ev.delta === "string") text += ev.delta;
          else if (ev.type === "response.completed") { usage = ev.response?.usage || null; completed = true; }
          else if (ev.type === "response.failed" || ev.type === "error") {
            throw new Error(`kie stream: ${JSON.stringify(ev).slice(0, 200)}`);
          }
        } else {
          const delta = ev.choices?.[0]?.delta?.content;
          if (typeof delta === "string") text += delta;
          if (ev.usage) { usage = ev.usage; completed = true; }
          if (ev.error) throw new Error(`kie stream: ${JSON.stringify(ev.error).slice(0, 200)}`);
        }
      }
    }
  }
  if (!text) throw new Error(`kie stream: no output text received (completed=${completed})`);
  return { text, usage, credits };
}

async function callKie(p, { messages, jsonMode, temperature, maxTokens, timeoutMs, stage, signal: external }) {
  const responsesApi = p.api === "responses";
  const messagesApi = p.api === "messages";
  // Messages-api streaming is unimplemented (see the format note above) — force
  // non-streamed regardless of how long the stage's timeout budget runs.
  const streaming = !messagesApi && Number(timeoutMs) > KIE_STREAM_ABOVE_MS;
  const endpoint = responsesApi ? "responses" : messagesApi ? "messages" : "chat/completions";
  const url = `${p.baseUrl.replace(/\/$/, "")}/${endpoint}`;
  let body;
  if (responsesApi) {
    body = { model: p.model, input: messages, stream: streaming, temperature: temperature ?? config.llm.temperature };
    if (jsonMode) body.text = { format: { type: "json_object" } };
  } else if (messagesApi) {
    // Anthropic's shape: `system` is a top-level string pulled out of the
    // fixed [system, user] pair chat() always builds; `messages` carries only
    // the non-system turns (Anthropic 400s on a role:"system" message).
    // max_tokens is REQUIRED — default it rather than omit, since a caller
    // that forgot to pass one should still get a bounded, billable request
    // instead of whatever KIE's own undocumented default turns out to be.
    const sys = messages.find((m) => m.role === "system");
    const rest = messages.filter((m) => m.role !== "system");
    body = {
      model: p.model,
      system: sys?.content,
      messages: rest,
      max_tokens: maxTokens || 8192,
      temperature: temperature ?? config.llm.temperature,
    };
    // No response_format/json-mode field exists on this API — jsonMode is
    // carried entirely by the system prompt + the caller's tolerant parser.
  } else {
    body = {
      model: p.model,
      messages,
      // KIE defaults stream:true — always send it explicitly so a short stage
      // gets one JSON body and a long one gets the edge-safe SSE.
      stream: streaming,
      temperature: temperature ?? config.llm.temperature,
      ...(maxTokens ? { max_tokens: maxTokens } : {}),
    };
    if (jsonMode) body.response_format = { type: "json_object" };
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
      const { text, usage, credits } = await readKieSse(resp, responsesApi);
      const dtS = Date.now() - t0;
      const tokensInS = (responsesApi ? usage?.input_tokens : usage?.prompt_tokens) ?? 0;
      const tokensOutS = (responsesApi ? usage?.output_tokens : usage?.completion_tokens) ?? 0;
      const badS = badCompletionReason(text, jsonMode, "stream", tokensOutS);
      if (badS) { const e = new Error(`kie: ${badS}`); e.retryable = true; throw e; }
      const costUsdS = typeof credits === "number" ? credits * KIE_CREDIT_USD : null;
      const creditsS = credits == null ? "" : `, ${credits} credits ($${(costUsdS).toFixed(4)})`;
      console.log(`[kie] ${p.model} stage=${stage || "?"} ok (${dtS}ms streamed, in=${tokensInS} out=${tokensOutS}${creditsS}, ${text.length}ch)`);
      return { text, tokensIn: tokensInS, tokensOut: tokensOutS, costUsd: costUsdS, model: p.alias || p.model };
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

    let text, finish, tokensIn, tokensOut;
    if (responsesApi) {
      const msg = (Array.isArray(data.output) ? data.output : []).find((o) => o && o.type === "message");
      const part = (Array.isArray(msg?.content) ? msg.content : []).find((c) => c && c.type === "output_text");
      text = part?.text ?? "";
      finish = data.status;
      tokensIn = data.usage?.input_tokens ?? 0;
      tokensOut = data.usage?.output_tokens ?? 0;
    } else if (messagesApi) {
      // content[] is an array of typed blocks (text / tool_use / ...); concat
      // only the text ones. A JSON-mode reply is one block in practice, but a
      // model is free to add a leading acknowledgement block, so join rather
      // than index [0].
      text = (Array.isArray(data.content) ? data.content : [])
        .filter((c) => c && c.type === "text" && typeof c.text === "string")
        .map((c) => c.text)
        .join("");
      finish = data.stop_reason;
      tokensIn = data.usage?.input_tokens ?? 0;
      tokensOut = data.usage?.output_tokens ?? 0;
    } else {
      text = data.choices?.[0]?.message?.content ?? "";
      finish = data.choices?.[0]?.finish_reason;
      tokensIn = data.usage?.prompt_tokens ?? 0;
      tokensOut = data.usage?.completion_tokens ?? 0;
    }
    // Retryable rather than fatal: the KIE loop in chat() re-asks, then escalates.
    const bad = badCompletionReason(text, jsonMode, finish, tokensOut);
    if (bad) { const e = new Error(`kie: ${bad}`); e.retryable = true; throw e; }
    // The metered charge for THIS call — see KIE_CREDIT_USD above for why this
    // is trusted over any $/token estimate.
    const costUsd = typeof data.credits_consumed === "number" ? data.credits_consumed * KIE_CREDIT_USD : null;
    const credits = costUsd == null ? "" : `, ${data.credits_consumed} credits ($${costUsd.toFixed(4)})`;
    console.log(`[kie] ${p.model} stage=${stage || "?"} ok (${dt}ms, in=${tokensIn} out=${tokensOut}${credits}, ${text.length}ch)`);
    return { text, tokensIn, tokensOut, costUsd, model: p.alias || p.model };
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
  // Tokens the provider BILLED for attempts we then discarded. A "bad completion"
  // below is a 200 OK that already generated — and was charged for — its output;
  // we throw it away and retry. Only the winning attempt used to report tokens, so
  // every retry was invisible spend and the job's usage read below the real bill.
  let wastedIn = 0, wastedOut = 0, wastedCost = 0;
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
      // What OpenRouter actually charged (usage.include). null when the provider
      // omitted it, in which case callers fall back to the price-table estimate.
      const costUsd = typeof resp.usage?.cost === "number" ? resp.usage.cost : null;

      // Guard against gemini's intermittent "lazy stop" (see badCompletionReason):
      // without this the caller gets junk and re-hits the same flaky model.
      // Synthesize a retryable error so the loop retries this model, then chat()
      // escalates to the fallback.
      const wantsJson = body?.response_format?.type === "json_object";
      const badCompletion = badCompletionReason(text, wantsJson, finish, tokensOut);
      if (badCompletion) {
        console.warn(`[openrouter] ${model} stage=${stage || "?"} returned a bad completion: ${badCompletion}`);
        // billed, then thrown away
        wastedIn += tokensIn; wastedOut += tokensOut; wastedCost += costUsd || 0;
        const e = new Error(badCompletion); e.retryable = true; throw e;
      }

      const waste = wastedIn || wastedOut ? `, +${wastedIn}/${wastedOut} discarded` : "";
      const billed = costUsd == null ? "" : `, $${(costUsd + wastedCost).toFixed(6)} billed`;
      console.log(`[openrouter] ${model} stage=${stage || "?"} ok (${dt}ms, in=${tokensIn} out=${tokensOut}${waste}${billed}, ${text.length}ch)`);
      return {
        text, model,
        tokensIn: tokensIn + wastedIn,
        tokensOut: tokensOut + wastedOut,
        costUsd: costUsd == null ? null : costUsd + wastedCost,
      };
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
    // USAGE ACCOUNTING: ask OpenRouter to return what it ACTUALLY charged for this
    // call (usage.cost, in credits = USD) instead of us re-deriving it from a
    // hand-maintained price table. The table reproduced our own recorded numbers
    // almost exactly, yet the key's real daily spend ran ~4.3x higher — the tokens
    // reported for a vision call do not capture what an image actually costs. This
    // makes the bill authoritative rather than estimated, at no extra request.
    usage: { include: true },
  };
  // PER-STAGE REASONING EFFORT. Anthropic and other reasoning models accept an
  // effort hint through OpenRouter; a stage that designs something (the template
  // generator) benefits from thinking hard, while a one-line verdict stage must
  // not burn reasoning tokens. Opt-in per stage via
  // config.llm.stageEffort = { "<stage>": "low" | "medium" | "high" } so no
  // existing stage changes behaviour or cost unless it is named.
  const stageEffort = stage && config.llm.stageEffort ? config.llm.stageEffort[stage] : null;
  if (stageEffort && ["low", "medium", "high"].includes(String(stageEffort))) {
    orBody.reasoning = { effort: String(stageEffort) };
  }
  if (jsonMode) orBody.response_format = { type: "json_object" };

  // Model selection. The requested id is either an OpenRouter model or a
  // "kie:<route>" alias; an alias dispatches to KIE and leaves OpenRouter as the
  // outage fallback (the alias is not a valid OpenRouter id, so it must never be
  // sent there). Explicit `model` callers get the same treatment — the script
  // escalation model, for one, is a KIE route.
  const requested = model || (stage ? modelForStage(stage) : config.llm.model);
  const stageRoute = kieRoute(requested);
  const onKie = KIE_ALIAS.test(String(requested));
  const orPrimary = onKie
    ? [config.llm.modelFallback, config.llm.modelFast, config.llm.model].find((m) => m && !KIE_ALIAS.test(m))
    : requested;
  // The OpenRouter fallback must be an OPENROUTER model id. `llm.modelFallback`
  // is allowed to hold a "kie:" alias (the tiers get flipped from time to time —
  // KIE main / OpenRouter fallback, and back), and passing that alias through
  // verbatim sent the literal string "kie:gemini-3.6-flash" to OpenRouter as a
  // model name. OpenRouter has no such model, so the LAST line of defence was
  // guaranteed to fail — which is exactly what a user hit:
  //   "all providers failed for stage=storyboard.
  //    openrouter google/gemini-3-flash-preview: Connection error..
  //    openrouter kie:gemini-3.6-flash: Connection error."
  // Boot validation does not catch it: it only requires that at least ONE of the
  // configured models is a non-alias, which was true. So: never hand an alias to
  // OpenRouter, and keep the alias as a KIE attempt of its own (below).
  const orFallback = onKie
    ? null
    : [config.llm.modelFallback, config.llm.modelFast, config.llm.model]
        .find((m) => m && !KIE_ALIAS.test(String(m)) && m !== orPrimary) || null;
  // A "kie:" alias in the fallback slot is still a perfectly good model — it just
  // has to be dispatched through KIE. Kept so flipping the tiers in config.json
  // never silently removes the safety net.
  const fallbackKieRoute = !onKie ? kieRoute(config.llm.modelFallback) : null;

  // The KIE primary (grok-4-5) is a REASONING model — output tokens include
  // reasoning and are billed, so a trivial stage (vo_fit, a QA verdict) can burn
  // 3k+ output tokens where a flat model spends 300. Reserve the primary for the
  // PREMIUM creative stages (where deep reasoning shows up on screen) and send
  // everything else straight to its own stage model — normally the flat KIE
  // gemini route. Override with config.llm.premiumStages. usage.js mirrors this
  // split when pricing stages — keep the two in sync.
  const premiumStages = new Set(config.llm.premiumStages || ["brief", "storyboard", "script", "composer"]);
  const stagePremium = !stage || premiumStages.has(stage);
  const kieEnabled = config.llm.primary && config.llm.primary.apiKey && !model && stagePremium;

  // KIE's Cloudflare edge throws transient 524/5xx timeouts on the bigger
  // prompts (storyboard/composer), so RETRY before falling through — the
  // OpenRouter fallback is often daily-limited, so a premature fall-through
  // just fails the whole stage. Any non-retryable error (or exhausted retries)
  // still falls through. Bails immediately if the stage was cancelled.
  async function tryKie(provider, label, next) {
    const KIE_ATTEMPTS = 3;
    for (let a = 1; a <= KIE_ATTEMPTS; a++) {
      if (signal?.aborted) throw signal.reason || new Error("llm: aborted");
      try {
        return await callKie(provider, {
          messages, jsonMode, temperature: effTemp,
          maxTokens: orBody.max_tokens, timeoutMs, stage, signal,
        });
      } catch (err) {
        if (signal?.aborted) throw err;
        if (a < KIE_ATTEMPTS && isRetryable(err)) {
          const backoff = 1000 * a;
          console.warn(`[llm] KIE ${err?.status || err?.code || err?.message || err} on stage=${stage} — retry ${a}/${KIE_ATTEMPTS - 1} in ${backoff}ms`);
          await new Promise((r) => setTimeout(r, backoff));
          continue;
        }
        console.warn(`[llm] KIE ${label} failed (${err?.status || err?.message || err}); falling back to ${next}`);
        return null;
      }
    }
    return null;
  }

  const kieLabel = kieEnabled ? `kie:${config.llm.primary.model}`
                 : stageRoute ? `kie:${stageRoute.model}`
                 : stagePremium ? "none" : "none (fast stage)";
  console.log(`[llm] primary=${kieLabel}${kieEnabled && stageRoute ? ` then kie:${stageRoute.model}` : ""} fallback=${orPrimary}->${orFallback || "none"} stage=${stage || "?"} dispatching (sys=${system.length}ch user=${user.length}ch json=${jsonMode} timeout=${timeoutMs}ms)`);

  // 1. PRIMARY: the KIE premium model (grok) on the heavy creative stages.
  if (kieEnabled) {
    const hit = await tryKie(config.llm.primary, "primary",
      stageRoute ? `kie:${stageRoute.model}` : `OpenRouter ${orPrimary}`);
    if (hit) return hit;
  }

  // 2. The stage's own KIE route (e.g. gemini 3.6 flash) when its model id is a
  // "kie:" alias. Also catches a premium stage whose grok attempt just failed.
  if (stageRoute) {
    const hit = await tryKie(stageRoute, `route ${stageRoute.alias}`, `OpenRouter ${orPrimary}`);
    if (hit) return hit;
  }

  // A stage in llm.noFallbackStages is pinned to its named KIE model on
  // purpose — e.g. admin template generation runs on Claude Opus 5 ONLY, so a
  // silent drop to whatever model.js/modelFallback happens to name (a flash
  // tier, on the current config) never substitutes a materially weaker model
  // for a quality-critical, low-volume, human-supervised action. Both KIE
  // attempts (steps 1-2) already retried 3x each with backoff above, so this
  // fires only once that resilience is genuinely exhausted.
  if (stage && (config.llm.noFallbackStages || []).includes(stage)) {
    throw new Error(`llm: stage=${stage} is pinned to ${requested} (llm.noFallbackStages) and it failed after retries — refusing to silently substitute a different model.`);
  }

  // 3. FALLBACK: OpenRouter primary model. Only reachable with no OpenRouter id
  // to fall back to if every configured model is a KIE alias — say so plainly
  // rather than dispatching an alias OpenRouter cannot serve.
  if (!orPrimary) {
    throw new Error(`llm: stage=${stage || "?"} runs on ${requested} and KIE failed, but no OpenRouter fallback model is configured (llm.modelFallback)`);
  }
  try {
    return await callOnce({ body: orBody, timeoutMs, stage, model: orPrimary, signal });
  } catch (err) {
    if (signal?.aborted) throw err;
    // Escalate to the fallback model on a transient error OR a model-fatal one
    // (bad id / context overflow) — the latter won't recover by retrying the
    // same model but a different model can, so it must not collapse the stage.
    const escalatable = isRetryable(err) || isModelFatal(err);
    // 4. FALLBACK: OpenRouter secondary model.
    if (orFallback && orFallback !== orPrimary && escalatable) {
      console.warn(`[openrouter] FALLBACK: ${orPrimary} failed; switching to ${orFallback} for stage=${stage}`);
      try {
        return await callOnce({ body: orBody, timeoutMs, stage, model: orFallback, signal });
      } catch (err2) {
        // 5. LAST RESORT: a "kie:" alias configured as modelFallback — a real
        // model on a DIFFERENT provider, so it is the most useful thing left to
        // try when OpenRouter itself is unreachable.
        if (fallbackKieRoute) {
          const hit = await tryKie(fallbackKieRoute, `fallback route ${fallbackKieRoute.alias}`, "all OpenRouter models");
          if (hit) return hit;
        }
        throw new Error(`llm: all providers failed for stage=${stage}. openrouter ${orPrimary}: ${err?.status || err?.code || err?.message || err}. openrouter ${orFallback}: ${err2?.status || err2?.code || err2?.message || err2}${fallbackKieRoute ? `. kie ${fallbackKieRoute.model}: also failed` : ""}`);
      }
    }
    // No OpenRouter secondary — but a KIE-aliased modelFallback still gives us a
    // different provider to reach for before giving up on the stage entirely.
    if (fallbackKieRoute && escalatable) {
      const hit = await tryKie(fallbackKieRoute, `fallback route ${fallbackKieRoute.alias}`, `OpenRouter ${orPrimary}`);
      if (hit) return hit;
      throw new Error(`llm: all providers failed for stage=${stage}. openrouter ${orPrimary}: ${err?.status || err?.code || err?.message || err}. kie ${fallbackKieRoute.model}: also failed`);
    }
    throw err;
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
