// Per-job usage + cost tracker. Records:
//   - LLM token usage (primary KIE Gemini 3.5 Flash / fallback OpenRouter MiniMax):
//     input + output tokens, call count
//   - TTS token usage (openai/gpt-4o-mini-tts via OpenRouter): input chars + estimated output audio tokens
//   - External API call counts (Pixabay images/videos, Freesound, Internet Archive,
//     Hyperframes render/lint, OpenRouter TTS)
//
// Pricing (per 1M tokens, USD):
//   The LLM cost uses the PRIMARY provider's rates (KIE Gemini 3.5 Flash), which
//   serves the vast majority of calls. On the rare fallback to OpenRouter MiniMax
//   the true rate differs (input ~0.96 / output ~4.00), so cost is approximate
//   for those calls only.
//   Gemini 3.5 Flash (KIE, primary):  input 0.45   output 2.70
//   gpt-4o-mini-tts:                  input 0.60   output 12.00
// Everything else is free.

const PRICING = {
  llm: {
    inputPerMillionUsd:  0.45,
    outputPerMillionUsd: 2.70,
  },
  tts: {
    inputPerMillionUsd:  0.60,
    outputPerMillionUsd: 12.00,
  },
};

function round(n, decimals = 6) {
  const p = Math.pow(10, decimals);
  return Math.round(n * p) / p;
}

class UsageTracker {
  constructor() {
    this.llm = { inputTokens: 0, outputTokens: 0, callCount: 0 };
    this.tts = {
      inputChars: 0,
      inputTokensEst: 0,
      outputTokensEst: 0,
      callCount: 0,
    };
    this.external = {}; // apiName -> callCount
  }

  // LLM (MiniMax M3 via OpenRouter chat completions)
  addLlm({ inputTokens = 0, outputTokens = 0 } = {}) {
    this.llm.inputTokens  += inputTokens  || 0;
    this.llm.outputTokens += outputTokens || 0;
    this.llm.callCount    += 1;
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
    const llmInUsd   = (this.llm.inputTokens  * PRICING.llm.inputPerMillionUsd)  / 1e6;
    const llmOutUsd  = (this.llm.outputTokens * PRICING.llm.outputPerMillionUsd) / 1e6;
    const ttsInUsd   = (this.tts.inputTokensEst  * PRICING.tts.inputPerMillionUsd)  / 1e6;
    const ttsOutUsd  = (this.tts.outputTokensEst * PRICING.tts.outputPerMillionUsd) / 1e6;
    const total      = llmInUsd + llmOutUsd + ttsInUsd + ttsOutUsd;

    return {
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
