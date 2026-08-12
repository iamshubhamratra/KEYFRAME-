// Per-job usage + cost tracker. Records:
//   - LLM token usage (primary KIE grok-4-5 on the heavy creative stages /
//     KIE gemini-3.6-flash everywhere else): input + output tokens, call count
//   - TTS token usage (openai/gpt-4o-mini-tts via OpenRouter): input chars + estimated output audio tokens
//   - External API call counts (Pixabay images/videos, Freesound, Internet Archive,
//     Hyperframes render/lint, OpenRouter TTS)
//
// Pricing (per 1M tokens, USD):
//   Mixed setup — each stage is priced by the model it ACTUALLY runs on
//   (resolved from config.llm.premiumStages + stageModels), not one flat rate.
//   The heavy creative stages (brief/storyboard/script/composer) run on KIE
//   grok-4-5; EVERY other stage — directors, qa, vision, vo_fit — on KIE
//   gemini-3.6-flash (a "kie:" alias in the stage table, priced under that same
//   key here). OpenRouter serves only the outage fallback and TTS.
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
  "google/gemini-3.1-flash-lite": { in: 0.25, out: 1.50 }, // legacy (pre-policy vo_fit/director records)
  "google/gemini-2.5-flash":      { in: 0.30, out: 2.50 },
  "google/gemini-3-flash-preview":{ in: 0.50, out: 3.00 }, // MAIN tier (brief/storyboard/script/composer/vision/qa/template_director)
  "google/gemini-3.5-flash-lite": { in: 0.30, out: 2.50 }, // LIGHT tier (transcribe/vo_fit/art+text director/screenshot_director)
  "google/gemini-3.5-flash":      { in: 1.50, out: 9.00 }, // legacy default (pre-KIE-gemini job records)
  // DEFAULT — every non-premium stage, served by KIE.
  // MEASURED, not assumed. KIE bills in credits (`credits_consumed` on every
  // chat response) at $0.005/credit — 200 credits = $1, cross-checked against
  // KIE's own published examples (Nano Banana image = 4 credits = $0.02).
  // Solved from two live calls with deliberately opposite token mixes:
  //     1121 in +  292 out -> 0.23 credits
  //     6650 in +    1 out -> 0.60 credits
  //   => ~90 credits per 1M input, ~441 per 1M output.
  // Verified against a third call (6666 in + 62 out): predicts 0.628, billed 0.63.
  // The previous $1.50/$7.50 here was a placeholder from before the rate was
  // known and overstated real KIE spend by ~3.3x, so every per-job cost this
  // app reported for a non-premium stage was inflated.
  "kie:gemini-3.6-flash":         { in: 0.45, out: 2.21 },
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
// to its stage-table model, which may be an OpenRouter id or a "kie:" alias —
// either way the id is the pricing key, so price it there. Outage fallbacks
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
  // Rebuild from a previously persisted computeCosts() snapshot so a later phase
  // CONTINUES the same bill instead of opening a new one.
  //
  // A project job is billed in two phases: runIntake (ingest -> brief -> script)
  // and runProduction / runProductionGraph. Each used to construct its own empty
  // tracker, and production's db.markDone({usage}) then OVERWROTE the intake
  // usage that markScriptReview had already stored. Net effect: every finished
  // job under-reported by the entire cost of its brief and script — those stages
  // appeared in no job record at all, which is why the per-job figures read far
  // below what the providers actually billed.
  static from(snapshot) {
    const t = new UsageTracker();
    if (!snapshot || typeof snapshot !== "object") return t;
    for (const s of Array.isArray(snapshot.byStage) ? snapshot.byStage : []) {
      const stage = String((s && s.stage) || "other");
      const b = (t.byStage[stage] ||= {
        inputTokens: 0, outputTokens: 0, callCount: 0,
        actualUsd: 0, actualCalls: 0, estIn: 0, estOut: 0,
      });
      const inTok = Number(s.inputTokens) || 0;
      const outTok = Number(s.outputTokens) || 0;
      const calls = Number(s.callCount) || 0;
      const aCalls = Number(s.actualCalls) || 0;
      b.inputTokens += inTok;
      b.outputTokens += outTok;
      b.callCount += calls;
      b.actualUsd += Number(s.actualUsd) || 0;
      b.actualCalls += aCalls;
      // estIn/estOut aren't persisted; reconstruct the un-measured share so the
      // rehydrated bucket reprices to the same figure it was written with.
      const estShare = calls > 0 ? Math.max(0, calls - aCalls) / calls : 1;
      b.estIn += Math.round(inTok * estShare);
      b.estOut += Math.round(outTok * estShare);
    }
    const llm = snapshot.llm || {};
    t.llm.inputTokens = Number(llm.inputTokens) || 0;
    t.llm.outputTokens = Number(llm.outputTokens) || 0;
    t.llm.callCount = Number(llm.callCount) || 0;
    const tts = snapshot.tts || {};
    t.tts.inputChars = Number(tts.inputChars) || 0;
    t.tts.inputTokensEst = Number(tts.inputTokensEst) || 0;
    t.tts.outputTokensEst = Number(tts.outputTokensEst) || 0;
    t.tts.callCount = Number(tts.callCount) || 0;
    // Generated images: the snapshot only carries the summed cost, so restore it
    // as an already-measured "actual" charge rather than re-estimating per image.
    const img = snapshot.imageGen || {};
    t.imageGen.count       = Number(img.count) || 0;
    t.imageGen.actualUsd   = Number(img.costUsd) || 0;
    t.imageGen.actualCount = t.imageGen.count;
    t.imageGen.model       = img.model || null;
    t.external = { ...(snapshot.external || {}) };
    return t;
  }

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
    // Gap-filler image generation. Priced from the provider's reported cost, so
    // this line is "actual" whenever OpenRouter answered with usage.cost.
    this.imageGen = { count: 0, actualUsd: 0, actualCount: 0, estCount: 0, model: null };
    this.external = {}; // apiName -> callCount
  }

  // LLM (OpenRouter chat completions). Pass `stage` to attribute the tokens to
  // a pipeline stage (brief/script/storyboard/assets/audio/composer/qa/…) for
  // the per-stage breakdown; defaults to "other" when a caller omits it.
  // `costUsd` is what the provider ACTUALLY charged (OpenRouter usage accounting).
  // When present it is used verbatim; the price table is only consulted for calls
  // that came back without one (the KIE path, or a provider that omitted it). This
  // is why the estimate and the real bill could disagree ~4.3x: a vision call's
  // reported tokens do not capture what its images cost.
  addLlm({ inputTokens = 0, outputTokens = 0, stage = "other", costUsd = null } = {}) {
    const i = inputTokens || 0;
    const o = outputTokens || 0;
    this.llm.inputTokens  += i;
    this.llm.outputTokens += o;
    this.llm.callCount    += 1;
    const b = (this.byStage[stage] ||= {
      inputTokens: 0, outputTokens: 0, callCount: 0,
      actualUsd: 0, actualCalls: 0, estIn: 0, estOut: 0,
    });
    b.inputTokens  += i;
    b.outputTokens += o;
    b.callCount    += 1;
    if (typeof costUsd === "number" && Number.isFinite(costUsd)) {
      b.actualUsd   += costUsd;
      b.actualCalls += 1;
    } else {
      // No reported cost — these tokens still have to be priced from the table.
      b.estIn  += i;
      b.estOut += o;
    }
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

  // Generated images (OpenRouter /api/v1/images). NOT free — and previously
  // invisible: the old KIE Flux path only called addExternal(), which is
  // documented above as a free counter, so every generated image was unbilled in
  // the job's cost report. `costUsd` is OpenRouter's REAL reported charge
  // (usage.cost); the estimate is only used when a response omits it.
  addImageGen({ count = 1, costUsd = null, model = null } = {}) {
    const n = Math.max(0, Number(count) || 0);
    this.imageGen.count += n;
    if (typeof costUsd === "number" && Number.isFinite(costUsd)) {
      this.imageGen.actualUsd += costUsd;
      this.imageGen.actualCount += n;
    } else {
      this.imageGen.estCount += n;
    }
    if (model) this.imageGen.model = model;
    this.addExternal("openrouter_image");
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
        // Only calls that reported no real cost get priced from the table. Legacy
        // buckets (rehydrated from records written before usage accounting) have
        // no est/actual split, so fall back to pricing everything.
        const hasSplit = b.estIn != null || b.actualCalls;
        const estIn  = hasSplit ? (b.estIn  || 0) : b.inputTokens;
        const estOut = hasSplit ? (b.estOut || 0) : b.outputTokens;
        const inUsd  = (estIn  * pr.in)  / 1e6;
        const outUsd = (estOut * pr.out) / 1e6;
        const actual = b.actualUsd || 0;
        llmInUsd  += inUsd;
        llmOutUsd += outUsd + actual;   // real charges ride with output for totals
        const calls = b.callCount;
        return {
          stage,
          model,
          inputTokens:  b.inputTokens,
          outputTokens: b.outputTokens,
          totalTokens:  b.inputTokens + b.outputTokens,
          callCount:    calls,
          costUsd:      round(inUsd + outUsd + actual),
          // How much of this line is measured rather than guessed.
          costSource:   b.actualCalls === calls && calls > 0 ? "actual"
                      : b.actualCalls ? "mixed" : "estimated",
          actualUsd:    round(actual),
          actualCalls:  b.actualCalls || 0,
        };
      })
      .sort((a, b) => b.costUsd - a.costUsd);

    const ttsInUsd   = (this.tts.inputTokensEst  * PRICING.tts.inputPerMillionUsd)  / 1e6;
    const ttsOutUsd  = (this.tts.outputTokensEst * PRICING.tts.outputPerMillionUsd) / 1e6;
    // Generated images: real reported charges, plus the table estimate for any
    // call that came back without one.
    const imgEstUsd  = this.imageGen.estCount * (Number(config.imageGen?.estUsdPerImage) || 0.034);
    const imgUsd     = this.imageGen.actualUsd + imgEstUsd;
    const total      = llmInUsd + llmOutUsd + ttsInUsd + ttsOutUsd + imgUsd;

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
      imageGen: {
        count:        this.imageGen.count,
        model:        this.imageGen.model,
        costUsd:      round(imgUsd),
        costSource:   this.imageGen.estCount === 0 && this.imageGen.count > 0 ? "actual"
                    : this.imageGen.actualCount ? "mixed" : "estimated",
      },
      external:      { ...this.external },
      totalCostUsd:  round(total),
    };
  }

  toJSON() { return this.computeCosts(); }
}

module.exports = { UsageTracker, PRICING };
