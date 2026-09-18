// STAGE 0: raw input -> a normalised reading of what the person asked for.
//
// This runs in FRONT of the brief, and it is a NORMALISER, not a gate. Whether
// KEYFRAME can make the request at all was decided at submit by prompt_scope.js —
// before a job row, a queue slot or a token of spend existed — so everything that
// reaches this stage is a video KEYFRAME can make. The brief is an enrichment
// transform that must always emit a complete promo brief or throw; this stage only
// says "this is already good" (READY, the user's words byte for byte), "this is thin
// — here it is filled out" (REFINABLE), or "this is a story — keep the order"
// (STRUCTURED_STORY). It never refuses and never proposes a different film: a second
// opinion on scope, delivered after the job was accepted, would be a refusal nobody
// can see coming and nobody is accountable for.
//
// The one exception is the deterministic tier-1 screen below, kept as defence in
// depth: an entry point that bypasses the submit-time gate still gets DISALLOWED, and
// generateBrief refuses to build a brief on it.
//
// generateBrief (brief.js) runs this when the job carries no analysis, and it is the
// choke point on purpose. server.js:58-61 routes /api/generate jobs to
// pipeline.runJob, which calls generateBrief at pipeline.js:1752 and never enters
// runIntake — so a hook in runIntake would have covered /api/projects and the admin
// path only, leaving uncovered exactly the unauthenticated entry point that
// motivated having an unavoidable hook at all.
//
// THE ONE CONTRACT: this function NEVER THROWS. A model outage, a timeout, an abort
// or two unparseable replies all land on the deterministic floor. Analysis must not
// become a new way for the create screen and the pipeline to fail.
//
// "Never throws" is held in LAYERS, because the first version held it in one and the
// one leaked: the floor's AnalysisSchema.parse ran outside any try, and a prompt longer
// than the schema's refinedPrompt bound (but well inside what the routes accept) threw
// a ZodError straight out of here and failed the job. So:
//   1. the model path catches its own transport and validation failures (as before);
//   2. the floor — fallback, parse, coerce — is guarded, and a failure there drops to
//   3. minimalAnalysis(), built from literals and string clips, which calls nothing
//      that can throw;
//   4. and the whole body sits inside one more guard that returns (3), so an edit that
//      adds a throwing line anywhere above still cannot break the contract.
// A tier-1 match survives every layer as DISALLOWED: no failure, anywhere, may turn a
// deterministic refusal into a film.

const fs = require("node:fs");
const path = require("node:path");
const openrouter = require("./openrouter");
const moderation = require("./prompt_moderation");
const { fallbackAnalysis } = require("./prompt_analysis_fallback");
const {
  AnalysisSchema, coerce, minimalAnalysis, clipRefinedPrompt, SCHEMA_VERSION,
} = require("./prompt_analysis_schema");
const { extractFirstJsonObject: parseLenient } = require("./json_lenient");

// Read once at module load, like brief.js:12 and script.js:12. Editing the .md while
// the server runs has no effect until restart.
const SYSTEM = fs.readFileSync(
  path.join(__dirname, "..", "prompts", "system_prompt_analysis.md"),
  "utf8"
);

// How much ingested source text the analyst is shown. Far smaller than the brief's
// budget on purpose: this stage judges the PROMPT, and the site copy is context for
// that judgement, not the subject of it. The brief still sees everything.
const SITE_BODY_CHARS = 1200;
const BLOG_EXCERPT_CHARS = 1200;

// Ingest objects arrive here without a schema. A list field that is not an array
// becomes empty rather than a TypeError (`"text".slice(0, 10)` works, `(42).slice`
// does not), because a malformed site read is a reason to see less, not to fail.
const listOf = (x) => (Array.isArray(x) ? x : []);

function ingestContext(intent) {
  const out = {};
  const w = (intent && intent.website) || null;
  const b = (intent && intent.blog) || null;
  const v = (intent && intent.video) || null;
  if (w) {
    out.website = {
      url: w.url, title: w.title, description: w.description,
      headings: listOf(w.headings).slice(0, 10),
      bodyText: String(w.bodyText || "").slice(0, SITE_BODY_CHARS),
      sitePages: listOf(w.sitePages).slice(0, 12),
    };
  }
  if (b) {
    out.blog = {
      url: b.url, title: b.title, author: b.author,
      headings: listOf(b.headings).slice(0, 10),
      excerpt: String(b.excerpt || "").slice(0, BLOG_EXCERPT_CHARS),
    };
  }
  if (v) {
    out.video = {
      transcript: String(v.transcript || "").slice(0, 1200),
      visualStyleNotes: v.visualStyleNotes,
    };
  }
  return out;
}

// Built in code, without a model, when the deterministic tier fires. There is
// nothing to ask an LLM here and no reason to pay for the call. coerce() carries the
// tier-1 reason as safety.reason, which is the sentence generateBrief refuses with.
//
// refinedPrompt is CLIPPED before the parse. It is the prompt, and this path had the
// same leak as the floor: tier-1 content longer than the schema's bound threw a
// ZodError instead of refusing. If the parse or coerce still fails, the refusal is
// rebuilt by hand — a tier-1 match must come out DISALLOWED whatever else breaks.
function blockedAnalysis({ prompt, tier1, now }) {
  const ctx = { originalPrompt: prompt, tier1, scope: "prompt-only", now };
  try {
    const parsed = AnalysisSchema.parse({
      classification: "REFINABLE", // coerce forces DISALLOWED from ctx.tier1
      refinedPrompt: clipRefinedPrompt(prompt),
      analyzedPrompt: "",
      safety: { verdict: "allow", category: null, reason: null },
    });
    return coerce(parsed, ctx).analysis;
  } catch (e) {
    console.warn(`[analysis] tier-1 analysis could not be built normally (${String(e && e.message).slice(0, 120)}) -> minimal DISALLOWED`);
    return minimalAnalysis(ctx);
  }
}

// Text of the prompt, whatever was passed. String() itself throws on a Symbol or an
// object whose toString throws, and that would be a throw from the first line.
function promptText(p) {
  try { return String(p == null ? "" : p).trim(); } catch { return ""; }
}

// `intent.website` on an object built elsewhere. A read that throws means "not there".
function present(x, key) {
  try { return !!(x && x[key]); } catch { return false; }
}

// The last layer's answer, and the one place its shape is decided for this module.
function minimalResult(ctx, usage, why) {
  console.warn(`[analysis] fell back to the minimal analysis -> ${ctx.tier1 ? "DISALLOWED" : "REFINABLE"}`
    + (why ? ` (${String(why).slice(0, 160)})` : ""));
  return {
    analysis: minimalAnalysis(ctx),
    coercions: [],
    tokensIn: (usage && usage.tokensIn) || 0,
    tokensOut: (usage && usage.tokensOut) || 0,
    costUsd: usage && usage.costCalls ? usage.cost : null,
    via: ctx.tier1 ? "moderation" : "fallback:minimal",
  };
}

/**
 * Analyse a prompt.
 *
 * @param {object}  o
 * @param {string}  o.prompt      what the person typed
 * @param {object} [o.intent]     the full intent object when ingest has already run
 * @param {object} [o.preferences]
 * @param {string} [o.scope]      "prompt-only" | "full"
 * @param {AbortSignal} [o.signal]
 * @param {number} [o.now]        injectable clock, for tests
 * @returns {Promise<{analysis, tokensIn, tokensOut, costUsd, coercions, via}>}
 */
async function analyzePrompt(opts) {
  // Read by hand, inside a guard, rather than destructured in the signature:
  // `({ prompt } = {})` throws on analyzePrompt(null), and so does a property read on
  // an options object whose getter throws — both before any guard further down could
  // run. A reading that fails leaves the field at its default.
  let intent, preferences, signal;
  let raw = "";
  let clock = Date.now();
  let effScope = "prompt-only";
  try {
    const o = opts && typeof opts === "object" ? opts : {};
    raw = promptText(o.prompt);
    ({ intent, preferences, signal } = o);
    if (Number.isFinite(o.now)) clock = o.now;
    if (o.scope === "full") effScope = "full";
  } catch { /* a hostile options object reads as an empty one */ }

  // Built FIRST, and shared with the guard at the bottom, so whichever layer fails, the
  // last resort still knows the prompt, whether tier 1 matched and what was spent.
  const ctx = {
    originalPrompt: raw,
    tier1: null,
    scope: effScope,
    now: clock,
    hasWebsite: present(intent, "website"),
    hasBlog: present(intent, "blog"),
    hasTranscript: present(intent, "video"),
  };
  const usage = { tokensIn: 0, tokensOut: 0, cost: 0, costCalls: 0 };

  try {
    return await analyzeLayered({ raw, intent, preferences, signal, ctx, usage });
  } catch (e) {
    // Layer 4. Nothing above is expected to reach here; this is what makes that a
    // property of the code rather than a hope about it.
    return minimalResult(ctx, usage, `unexpected: ${e && e.message}`);
  }
}

async function analyzeLayered({ raw, intent, preferences, signal, ctx, usage }) {
  // ---- tier 1: deterministic, no LLM spend, the only path to DISALLOWED.
  let mod = { tier1: null, hints: [] };
  try { mod = moderation.screen(raw) || mod; } catch { /* fail-open, by design */ }
  if (mod.tier1) {
    // Recorded on the shared ctx BEFORE the analysis is built, so that if building it
    // fails every later layer still refuses.
    ctx.tier1 = mod.tier1;
    return {
      analysis: blockedAnalysis({ prompt: raw, tier1: mod.tier1, now: ctx.now }),
      tokensIn: 0, tokensOut: 0, costUsd: null, coercions: [], via: "moderation",
    };
  }
  const hints = Array.isArray(mod.hints) ? mod.hints : [];

  // The model is optional; the floor is not. A user message that cannot be built (an
  // ingest object JSON cannot serialise) skips straight to the floor.
  let user = null;
  let lastErr = "";
  try {
    user = JSON.stringify({
      prompt: raw,
      ...ingestContext(intent),
      preferences: preferences || (intent && intent.preferences) || {},
      ...(hints.length ? { moderationHints: hints.map((h) => ({ term: h.term, category: h.category })) } : {}),
    }, null, 2);
  } catch (e) {
    lastErr = `user message could not be built: ${String(e && e.message).slice(0, 200)}`;
    console.warn(`[analysis] ${lastErr}`);
  }

  let userMsg = user;

  for (let attempt = 1; user !== null && attempt <= 2; attempt++) {
    let text;
    try {
      const res = await openrouter.chat({
        system: SYSTEM,
        user: userMsg,
        jsonMode: true,
        // A stage name absent from stageModels / maxTokens / temperatureByStage /
        // premiumStages safely inherits every default. Only the timeout and the
        // output ceiling are worth pinning for this one.
        stage: "analysis",
        // Classification wants to be repeatable. An explicit temperature always
        // beats config (openrouter.js:465), so do not also try to configure it.
        temperature: 0.3,
        signal,
      });
      text = res.text;
      usage.tokensIn += res.tokensIn || 0;
      usage.tokensOut += res.tokensOut || 0;
      if (typeof res.costUsd === "number") { usage.cost += res.costUsd; usage.costCalls++; }
    } catch (e) {
      // Transport, timeout, budget or abort. The floor is the answer.
      console.warn(`[analysis] call failed on attempt ${attempt}: ${String(e && e.message).slice(0, 200)}`);
      break;
    }

    try {
      const parsed = AnalysisSchema.parse(parseLenient(text));
      const { analysis, coercions } = coerce(parsed, ctx);
      if (coercions.length) {
        console.log(`[analysis] ${analysis.classification} (score ${analysis.quality.score}, `
          + `${coercions.length} coercion(s)): ${coercions.join(" | ")}`);
      } else {
        console.log(`[analysis] ${analysis.classification} (score ${analysis.quality.score}, `
          + `confidence ${analysis.confidence}${analysis.narrative.orderLocked ? `, order locked on ${analysis.narrative.beats.length} beats` : ""})`);
      }
      return {
        analysis, coercions,
        tokensIn: usage.tokensIn, tokensOut: usage.tokensOut,
        costUsd: usage.costCalls ? usage.cost : null,
        via: `model (attempt ${attempt})`,
      };
    } catch (e) {
      lastErr = e && e.issues ? JSON.stringify(e.issues).slice(0, 600) : String(e && e.message).slice(0, 300);
      console.warn(`[analysis] attempt ${attempt} invalid: ${lastErr.slice(0, 200)}`);
      userMsg = `${user}\n\nYour previous reply failed validation:\n${lastErr}\nReturn ONLY the corrected JSON object.`;
    }
  }

  // ---- layer 2: the floor. Never a refusal, never a rewrite — and GUARDED, because
  // this is where the contract used to leak: AnalysisSchema.parse(fb) sat outside any
  // try, and a floor object that missed one schema bound threw out of the function.
  try {
    const fb = fallbackAnalysis({ prompt: raw, intent, preferences });
    const { analysis, coercions } = coerce(AnalysisSchema.parse(fb), ctx);
    console.warn(`[analysis] fell back to the deterministic floor -> ${analysis.classification}`
      + (lastErr ? ` (last error: ${lastErr.slice(0, 120)})` : ""));
    return {
      analysis, coercions,
      tokensIn: usage.tokensIn, tokensOut: usage.tokensOut,
      costUsd: usage.costCalls ? usage.cost : null,
      via: "fallback",
    };
  } catch (e) {
    // ---- layer 3: the minimal analysis. A floor failure is a bug worth a loud line,
    // never a failed job.
    const why = e && e.issues ? JSON.stringify(e.issues).slice(0, 300) : String(e && e.message).slice(0, 300);
    return minimalResult(ctx, usage, `the floor failed: ${why}`);
  }
}

module.exports = { analyzePrompt, SCHEMA_VERSION };
