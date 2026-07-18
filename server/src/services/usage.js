// Per-job usage + cost tracker. Records:
//   - LLM token usage (primary KIE Gemini 3.5 Flash / fallback OpenRouter MiniMax):
//     input + output tokens, call count
//   - TTS token usage (openai/gpt-4o-mini-tts via OpenRouter): input chars + estimated output audio tokens
//   - External API call counts (Pixabay images/videos, Freesound, Internet Archive,
//     Hyperframes render/lint, OpenRouter TTS)
//
// Pricing (per 1M tokens, USD):
//   Mixed setup — each stage is priced by the model it ACTUALLY runs on
//   (resolved from config.llm.stageModels), not one flat rate. The composer
//   (~90% of tokens) runs on deepseek; the cheap stages on gemini-flash-lite.
//   TTS (openai/gpt-audio-mini) is estimated separately.
// Everything else is free.

const config = require("../config");

// Per-model OpenRouter prices (USD per 1M tokens). Unknown ids fall back to
// DEFAULT_MODEL_PRICE. Keep in sync with config.json's models when they change.
const MODEL_PRICING = {
  "z-ai/glm-5.2":                 { in: 0.95, out: 3.00 },
  "z-ai/glm-5.1":                 { in: 0.98, out: 3.08 },
  "z-ai/glm-4.6v":                { in: 0.30, out: 0.90 },
  "z-ai/glm-4.6":                 { in: 0.43, out: 1.74 },
  "google/gemini-2.5-flash-lite": { in: 0.10, out: 0.40 },
  "google/gemini-2.5-flash":      { in: 0.30, out: 2.50 },
  "google/gemini-3.5-flash":      { in: 0.30, out: 2.50 },
  "grok-4-5":                     { in: 0.80, out: 2.40 }, // KIE (kie.ai/grok-4-5); output incl. reasoning tokens
  "gemini-3-5-flash":             { in: 0.30, out: 2.50 }, // KIE gemini (legacy primary)
  "deepseek/deepseek-v4-pro":     { in: 0.44, out: 0.87 },
  "deepseek/deepseek-v4-flash":   { in: 0.09, out: 0.18 },
  "moonshotai/kimi-k2.6":         { in: 0.66, out: 3.50 },
  "anthropic/claude-opus-4.8":    { in: 5.00, out: 25.0 },
  "minimax/minimax-m3":           { in: 0.30, out: 1.20 },
};
const DEFAULT_MODEL_PRICE = { in: 0.30, out: 2.50 };

// Resolve the model a stage runs on (mirrors openrouter's dispatch but kept
// local to avoid a require cycle). The KIE primary serves ONLY the premium
// creative stages (config.llm.premiumStages, default brief/storyboard/script/
// composer — keep in sync with openrouter.js); every other stage goes straight
// to the OpenRouter stage-table model, so price it there. Outage fallbacks
// (premium stage served by OpenRouter because KIE was down) still price as the
// primary — a rare overestimate we accept to avoid threading the actual model
// through every tracker call site.
function modelForStage(stage) {
  const llm = config.llm || {};
  const premium = new Set(llm.premiumStages || ["brief", "storyboard", "script", "composer"]);
  if (llm.primary && llm.primary.apiKey && llm.primary.model && premium.has(stage)) return llm.primary.model;
  const kind = (llm.stageModels || {})[stage] || "default";
  if (kind === "fast") return llm.modelFast || llm.model;
  if (kind === "default") return llm.model;
  return kind; // literal model id (e.g. composer)
}
function priceFor(model) { return MODEL_PRICING[model] || DEFAULT_MODEL_PRICE; }

const PRICING = {
  tts: {
    inputPerMillionUsd:  0.60,
    outputPerMillionUsd: 2.40,
  },
};

function round(n, decimals = 6) {
  const p = Math.pow(10, decimals);
  return Math.round(n * p) / p;
}

class UsageTracker {
  constructor() {
    this.llm = { inputTokens: 0, outputTokens: 0, callCount: 0 };
    // Per-stage LLM token buckets: stage -> { inputTokens, outputTokens, callCount }.
    // Lets the cost report show WHERE the tokens went (composer + repairs usually
    // dominate). Repair laps re-bill the composer, so its bucket also reveals churn.
    this.byStage = {};
    this.tts = {
      inputChars: 0,
      inputTokensEst: 0,
      outputTokensEst: 0,
      callCount: 0,
    };
    this.external = {}; // apiName -> callCount
  }

  // LLM (OpenRouter chat completions). Pass `stage` to attribute the tokens to
  // a pipeline stage (brief/script/storyboard/assets/audio/composer/qa/…) for
  // the per-stage breakdown; defaults to "other" when a caller omits it.
  addLlm({ inputTokens = 0, outputTokens = 0, stage = "other" } = {}) {
    const i = inputTokens || 0;
    const o = outputTokens || 0;
    this.llm.inputTokens  += i;
    this.llm.outputTokens += o;
    this.llm.callCount    += 1;
    const b = (this.byStage[stage] ||= { inputTokens: 0, outputTokens: 0, callCount: 0 });
    b.inputTokens  += i;
    b.outputTokens += o;
    b.callCount    += 1;
    this.addExternal("openrouter_chat");
  }

  // TTS (openai/gpt-4o-mini-tts via OpenRouter /api/v1/tts).
  // The endpoint returns raw audio bytes — no usage metadata is surfaced,
  // so we estimate:
  //   inputTokens  ≈ ceil(inputChars / 4)              (English ~4 chars/token)
  //   outputTokens ≈ round(spokenSec * 50 tok/sec)     (OpenAI audio tokens,
  //                                                     ~3000/minute per OpenAI docs)
  // If `spokenSec` is not provided we estimate from `inputChars` at ~15 chars/sec speech.
  addTts({ inputChars = 0, spokenSec } = {}) {
    const chars = Math.max(0, Number(inputChars) || 0);
    const inputTokensEst = Math.ceil(chars / 4);
    const estSec = spokenSec != null ? Number(spokenSec) : (chars / 15);
    const outputTokensEst = Math.max(0, Math.round(estSec * 50));
    this.tts.inputChars      += chars;
    this.tts.inputTokensEst  += inputTokensEst;
    this.tts.outputTokensEst += outputTokensEst;
    this.tts.callCount       += 1;
    this.addExternal("openrouter_tts");
  }

  // Any other external API call (free, but worth counting for transparency).
  addExternal(name) {
    const k = String(name || "unknown");
    this.external[k] = (this.external[k] || 0) + 1;
  }

  computeCosts() {
    // Price each stage by the model it actually ran on, then sum — so the
    // composer's deepseek tokens and the cheap stages' flash-lite tokens are
    // billed at their real rates (not one flat rate).
    let llmInUsd = 0, llmOutUsd = 0;
    const byStage = Object.entries(this.byStage)
      .map(([stage, b]) => {
        const model = modelForStage(stage);
        const pr    = priceFor(model);
        const inUsd  = (b.inputTokens  * pr.in)  / 1e6;
        const outUsd = (b.outputTokens * pr.out) / 1e6;
        llmInUsd  += inUsd;
        llmOutUsd += outUsd;
        return {
          stage,
          model,
          inputTokens:  b.inputTokens,
          outputTokens: b.outputTokens,
          totalTokens:  b.inputTokens + b.outputTokens,
          callCount:    b.callCount,
          costUsd:      round(inUsd + outUsd),
        };
      })
      .sort((a, b) => b.costUsd - a.costUsd);

    const ttsInUsd   = (this.tts.inputTokensEst  * PRICING.tts.inputPerMillionUsd)  / 1e6;
    const ttsOutUsd  = (this.tts.outputTokensEst * PRICING.tts.outputPerMillionUsd) / 1e6;
    const total      = llmInUsd + llmOutUsd + ttsInUsd + ttsOutUsd;

    return {
      byStage,
      llm: {
        inputTokens:   this.llm.inputTokens,
        outputTokens:  this.llm.outputTokens,
        callCount:     this.llm.callCount,
        inputCostUsd:  round(llmInUsd),
        outputCostUsd: round(llmOutUsd),
        totalCostUsd:  round(llmInUsd + llmOutUsd),
      },
      tts: {
        inputChars:       this.tts.inputChars,
        inputTokensEst:   this.tts.inputTokensEst,
        outputTokensEst:  this.tts.outputTokensEst,
        callCount:        this.tts.callCount,
        inputCostUsd:     round(ttsInUsd),
        outputCostUsd:    round(ttsOutUsd),
        totalCostUsd:     round(ttsInUsd + ttsOutUsd),
      },
      external:      { ...this.external },
      totalCostUsd:  round(total),
    };
  }

  toJSON() { return this.computeCosts(); }
}

module.exports = { UsageTracker, PRICING };
