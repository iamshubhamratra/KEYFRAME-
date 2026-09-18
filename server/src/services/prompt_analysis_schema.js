// PROMPT ANALYSIS — the output contract, in ONE file on purpose.
//
// zod's z.object SILENTLY STRIPS unknown keys. brief.js:210 relies on that
// deliberately, and it is the right behaviour — but it means a system prompt that
// asks for a field the schema does not carry produces a model that dutifully emits
// it, a .parse() that PASSES, and a field that is GONE with no error and no log
// line. Keeping the schema, the coercion rules and the two projections together is
// what makes that trap a single reviewed diff instead of a scatter of parse sites.
//
// WHAT THIS STAGE IS. Scope is decided at submit, before a job row exists, by
// prompt_scope.js. A request that reaches the analyser has already been judged to be
// a video KEYFRAME can make, so the analyser is a NORMALISER: it restates an in-scope
// request — untouched when it is good, filled out when it is thin, in the user's own
// order when they wrote one. Its contract therefore carries no refusal and no
// alternative film. A normaliser that could still say "not this one" would be a
// second, unaccountable gate running after the job was accepted and billed.
//
// THE GOVERNING PRINCIPLE OF coerce(): every rule fails toward the user's own
// words, and NO coercion may ever turn a prompt into a refusal. DISALLOWED survives
// only as the deterministic tier-1 moderation verdict (ctx.tier1) — defence in depth
// for an entry point that bypasses the submit-time gate. A model returning garbage
// must never thereby cause a refusal.

const { z } = require("zod");

const SCHEMA_VERSION = 1;

// How long a client-held analysis stays acceptable on a create. Long enough for a
// user to read the panel, edit their preferences and submit; short enough that a
// tab left open overnight re-analyses rather than shipping a stale reading.
const TTL_MS = 60 * 60 * 1000;

// What a MODEL may answer. Three readings of a request that is already in scope.
const MODEL_CLASSIFICATIONS = ["READY", "REFINABLE", "STRUCTURED_STORY"];

// Every value a coerced analysis can carry: the model's three, plus DISALLOWED, which
// only coerce() can set and only from a deterministic tier-1 match. Mirrors
// prompt_scope.js, where STATUSES and MODEL_STATUSES draw the same line.
const CLASSIFICATIONS = [...MODEL_CLASSIFICATIONS, "DISALLOWED"];

// Labels this stage emitted before scope moved upstream. They still arrive: a job
// stored before the change, a client that cached an analysis, a model still primed on
// the old prompt. Both named a request that is — by the time it reaches this stage —
// in scope, so both mean "a valid idea that wants a fuller expression": REFINABLE.
// A Map, not an object literal, so a label can never resolve through the prototype.
const LEGACY_CLASSIFICATIONS = new Map([
  ["INCOMPLETE", "REFINABLE"],
  ["UNSUITABLE", "REFINABLE"],
]);

// The dimensions the analysis judges. Enumerated because `quality.missing` is a
// closed vocabulary — free-text "missing" entries are unusable by any consumer and
// unrenderable in a UI that has to name them.
const QUALITY_DIMENSIONS = [
  "intent-clarity", "topic-clarity", "story-structure", "scene-sequence", "audience",
  "video-purpose", "tone", "visual-direction", "assets", "duration", "orientation",
  "voiceover", "on-screen-text", "brand-info", "factual-completeness",
];

const FACT_KINDS = ["metric", "cta", "callout", "keyword", "fact"];
const FACT_SOURCES = ["prompt", "website", "blog", "transcript", "inferred"];
const AXIS_KEYS = ["contentTypes", "industries", "vibes", "tones", "visualStyles", "typographyStyles", "animationStyles"];

// THE LONGEST refinedPrompt THE CONTRACT ACCEPTS — equal to the longest prompt any
// entry point accepts, derived from those caps rather than chosen.
//
// READY's contract is refinedPrompt === the user's words, byte for byte, so a cap
// below the longest accepted prompt makes a CORRECT READY reply invalid by
// construction. POST /api/projects accepts 4000 characters (routes/projects.js, for
// the prompt alone and for the prompt merged with a clarification answer), and so
// does the admin template-test route; /api/generate accepts 2000. This used to be
// 1800, under all three. A 3000-character prompt therefore failed zod on both model
// attempts however well the model answered, fell to the floor — which echoes the
// user's words, all 3000 characters of them — and the floor's own parse threw a
// ZodError out of the one function whose whole contract is that it never throws,
// failing the job. Measured before the fix: 3000 and 4000 characters, with the model
// down, invalid twice, or answering a correct READY echo — six runs, six throws.
//
// Raising a route's cap means raising this in the same diff; the test file asserts
// the two agree.
const REFINED_PROMPT_MAX = 4000;

// How many beats an order lock can hold, and how many are STORED. It is deliberately
// NOT a parse-time bound on narrative.beats — see coerce() rule 6.
const BEATS_MAX = 24;

const labelArray = () => z.array(z.string().max(40)).max(12).default([]);

const AnalysisSchema = z.object({
  // Accepted as ANY string and settled in coerce(). A strict enum here turned a
  // slightly-off label ("Structured Story", a retired one) into a whole repair lap —
  // a second billed model call to fix a word that code can fix for free.
  classification: z.string(),
  confidence: z.number().min(0).max(1).default(0.5),

  quality: z.object({
    score: z.number().int().min(0).max(100).default(50),
    missing: z.array(z.string().max(40)).max(15).default([]),
  }).default({}),

  // What we understood the request to BE — distinct from what we will make.
  // A user who dislikes the rewrite needs something to point at.
  analyzedPrompt: z.string().max(400).default(""),

  // The KEYFRAME-optimised prompt. For READY this EQUALS originalPrompt, which is why
  // the bound is the longest accepted prompt and not a size someone liked.
  // NOTE: this is INPUT to the brief model, never assigned to improvedPrompt.
  refinedPrompt: z.string().max(REFINED_PROMPT_MAX).default(""),

  improvements: z.array(z.object({
    what: z.string().max(200),
    why: z.string().max(300).default(""),
  })).max(5).default([]),

  narrative: z.object({
    orderLocked: z.boolean().default(false),
    source: z.enum(["user-authored", "derived"]).default("derived"),
    // NO COUNT BOUND HERE, on purpose. This was .max(24), which made coerce()'s
    // "more than 24 beats -> release the lock" rule unreachable from the model path:
    // a faithful reading of a 30-scene storyline failed zod and bought a billed repair
    // lap whose error text ("too_big, maximum 24") invites the model to cut scenes
    // until it fits; and when both attempts failed, the floor answered — and it too
    // kept 24 and LOCKED them. Either way the script was told to film a 24-beat prefix
    // of a 30-beat story, in order. Too many beats is a decision (release the lock,
    // store the first BEATS_MAX), and coerce() makes it for free on the first reply.
    // Memory is not a reason for a bound either: the reply has already been read and
    // JSON-parsed by the time zod sees it, and the stage's output-token ceiling is
    // what bounds that.
    beats: z.array(z.object({
      index: z.number().int().min(1),
      beat: z.string().max(400),
      mustShow: z.string().max(200).optional(),
      mustSay: z.string().max(200).optional(),
    })).default([]),
  }).default({}),

  signals: z.object({
    contentTypes: labelArray(), industries: labelArray(), vibes: labelArray(),
    tones: labelArray(), visualStyles: labelArray(), typographyStyles: labelArray(),
    animationStyles: labelArray(),
    category: z.string().max(40).default(""),
  }).default({}),

  facts: z.array(z.object({
    text: z.string().max(300),
    kind: z.enum(FACT_KINDS).default("fact"),
    priority: z.number().int().min(1).max(5).default(3),
    source: z.enum(FACT_SOURCES).default("inferred"),
  })).max(30).default([]),

  // What we filled in rather than interrogating the user about.
  inferred: z.array(z.object({
    field: z.string().max(60),
    value: z.string().max(200),
    why: z.string().max(200).default(""),
  })).max(8).default([]),

  // Replaced server-side in coerce(). A model may express an opinion here; only the
  // deterministic tier can actually block.
  safety: z.object({
    verdict: z.enum(["allow", "review", "block"]).default("allow"),
    category: z.string().max(60).nullable().default(null),
    reason: z.string().max(300).nullable().default(null),
  }).default({}),
});

const norm = (x) => String(x == null ? "" : x).trim();
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
// coerce() also runs on the repair path, where the object has NOT been through
// zod — so a nested field can be a string, a number or null. `x || {}` is not
// enough: it keeps a truthy string, and assigning a property to a primitive is a
// silent no-op that surfaces later as "cannot read properties of undefined".
const obj = (x) => (x && typeof x === "object" && !Array.isArray(x) ? x : {});
const arr = (x) => (Array.isArray(x) ? x : []);

/**
 * Bring any text inside REFINED_PROMPT_MAX, cutting at a sentence boundary when one
 * falls in the back half of the allowance — a raw slice hands the brief half a word,
 * and a boundary in the front half would throw away more of the person's words than
 * the half-word it saves. Text already inside the bound is returned untouched.
 *
 * ONE function for coerce() AND the floor, so the two can never disagree about where
 * a cut falls: a floor that clipped differently would earn a coercion on its own
 * output, and a floor that did not clip at all is how a long prompt used to throw.
 * PURE. NEVER THROWS.
 */
function clipRefinedPrompt(text) {
  let s;
  try { s = typeof text === "string" ? text : norm(text); } catch { s = ""; }
  if (s.length <= REFINED_PROMPT_MAX) return s;
  const cut = s.slice(0, REFINED_PROMPT_MAX);
  const dot = cut.lastIndexOf(". ");
  return (dot >= REFINED_PROMPT_MAX / 2 ? cut.slice(0, dot + 1) : cut).trim();
}

/**
 * Normalise a parsed analysis into something every consumer can trust.
 * PURE. NEVER THROWS. Returns { analysis, coercions } — coercions is a string list
 * for the log, because "why did it rewrite my story" has to be answerable.
 *
 * ctx: { originalPrompt, tier1, scope, now, hasWebsite, hasBlog, hasTranscript }
 */
function coerce(parsed, ctx = {}) {
  const c = [];
  ctx = obj(ctx);
  // The deep copy keeps coerce PURE. It is guarded, and forced to a plain object,
  // because the repair path can hand over anything: a bare string or number would
  // otherwise make every property write below a silent no-op and the first nested
  // read a TypeError, and a cyclic or BigInt-bearing value makes stringify throw.
  let a;
  try { a = obj(JSON.parse(JSON.stringify(parsed == null ? {} : parsed))); }
  catch { a = {}; c.push("unserialisable analysis -> rebuilt from nothing"); }
  const originalPrompt = norm(ctx.originalPrompt);

  // 1. Classification is settled here, never by the schema. Case and spacing are
  //    normalised, retired labels map to what they now mean, and anything else is
  //    REFINABLE at zero confidence. Never coerce INTO a refusal: DISALLOWED is
  //    carried to rules 2-3, which keep it only on a tier-1 match.
  {
    const raw = a.classification;
    const up = norm(raw).toUpperCase().replace(/[\s-]+/g, "_");
    if (MODEL_CLASSIFICATIONS.includes(up) || up === "DISALLOWED") {
      if (raw !== up) c.push(`classification normalised to ${up}`);
      a.classification = up;
    } else if (LEGACY_CLASSIFICATIONS.has(up)) {
      a.classification = LEGACY_CLASSIFICATIONS.get(up);
      c.push(`legacy classification ${up} -> ${a.classification} (scope is decided at submit; a request that reaches analysis is in scope)`);
    } else {
      a.classification = "REFINABLE"; a.confidence = 0;
      c.push(`classification ${JSON.stringify(norm(raw).slice(0, 40))} unrecognised -> REFINABLE @ confidence 0`);
    }
  }

  // 2. Safety is decided server-side. The deterministic tier is the ONLY blocker.
  //    The tier-1 reason is written for a person and never echoes the prompt, so it
  //    is carried as safety.reason — the sentence brief.js refuses with.
  if (ctx.tier1) {
    a.classification = "DISALLOWED";
    a.safety = { verdict: "block", category: ctx.tier1.category, reason: ctx.tier1.reason };
    a.improvements = [];
    a.refinedPrompt = originalPrompt;
    c.push(`tier-1 rule ${ctx.tier1.rule} -> DISALLOWED`);
  } else if (a.safety && a.safety.verdict === "block") {
    // A hallucinating model must not be able to mass-refuse.
    a.safety.verdict = "review";
    c.push("model asked to block without a tier-1 match -> downgraded to review (allow-and-record)");
  }

  // 3. DISALLOWED without a tier-1 match is the same failure from the other side.
  if (a.classification === "DISALLOWED" && !ctx.tier1) {
    a.classification = "REFINABLE";
    a.safety = obj(a.safety); a.safety.verdict = "review";
    c.push("DISALLOWED without a tier-1 match -> REFINABLE @ review");
  }

  // 4-5. READY carries a contract: refinedPrompt === originalPrompt AND no improvements.
  if (a.classification === "READY") {
    if (norm(a.refinedPrompt) !== originalPrompt) {
      if (arr(a.improvements).length) {
        a.classification = "REFINABLE";
        c.push("READY with a rewrite -> REFINABLE (rewrite kept; the user is shown why)");
      } else {
        a.refinedPrompt = originalPrompt;
        c.push("READY with an unexplained rewrite -> refinedPrompt reset to the user's words");
      }
    }
    if (a.classification === "READY" && arr(a.improvements).length) {
      a.classification = "REFINABLE";
      c.push("READY with improvements -> REFINABLE (improvements kept)");
    }
  }

  // 6-9. The narrative lock.
  //
  // Sorted and renumbered BEFORE the cap, so the beats that survive storage are the
  // first BEATS_MAX in the person's order — capping first kept whichever 24 the model
  // happened to list first. More than BEATS_MAX beats releases the lock AND makes the
  // source "derived": the stored beats are a prefix, and a prefix labelled
  // "user-authored" would tell the script and the brief that the person's story is
  // those 24 scenes. This rule is reachable from the model path only because the
  // schema no longer bounds the count (see AnalysisSchema.narrative.beats); the floor
  // applies the same rule to the markers it counts (prompt_analysis_fallback.js).
  a.narrative = obj(a.narrative);
  if (typeof a.narrative.orderLocked !== "boolean") a.narrative.orderLocked = false;
  if (a.narrative.source !== "user-authored") a.narrative.source = "derived";
  a.narrative.beats = arr(a.narrative.beats).filter((b) => b && typeof b === "object");
  if (a.narrative.beats.length) {
    a.narrative.beats.sort((x, y) => (Number(x.index) || 0) - (Number(y.index) || 0));
    a.narrative.beats.forEach((b, i) => { b.index = i + 1; });
  }
  if (a.narrative.beats.length > BEATS_MAX) {
    const total = a.narrative.beats.length;
    a.narrative.beats = a.narrative.beats.slice(0, BEATS_MAX);
    const wasLocked = a.narrative.orderLocked;
    a.narrative.orderLocked = false;
    a.narrative.source = "derived";
    c.push(`${total} beats (more than ${BEATS_MAX}) -> the first ${BEATS_MAX} stored`
      + (wasLocked ? " and the order lock released (a half-kept order is worse than none)" : ""));
  }
  if (a.narrative.orderLocked && a.narrative.beats.length < 2) {
    a.narrative.orderLocked = false; a.narrative.source = "derived";
    c.push("order lock with fewer than 2 beats -> released (one beat is not an order)");
  }
  if (a.classification === "STRUCTURED_STORY" && !a.narrative.orderLocked) {
    a.classification = "REFINABLE";
    c.push("STRUCTURED_STORY without a surviving order lock -> REFINABLE (the lock is the load-bearing half)");
  }

  // 10-11. Signals must speak the matcher's language or they are noise.
  // A label outside AXES can never appear in a pack's supply map, so it could only
  // ever be a penalty if it reached a demand map.
  let axes = null;
  try { axes = require("./template_lexicon").AXES; } catch { axes = null; }
  a.signals = obj(a.signals);
  let dropped = 0;
  for (const axis of AXIS_KEYS) {
    let list = arr(a.signals[axis]);
    if (axes && axes[axis]) {
      const canon = new Map(Object.keys(axes[axis]).map((k) => [k.toLowerCase(), k]));
      const kept = [];
      for (const raw of list) {
        const hit = canon.get(String(raw || "").trim().toLowerCase());
        if (hit) { if (!kept.includes(hit)) kept.push(hit); } else dropped++;
      }
      list = kept;
    }
    a.signals[axis] = list.slice(0, 6);
  }
  if (dropped) c.push(`${dropped} signal label(s) outside the lexicon dropped`);

  // 12-13. Fact provenance — the same reasoning that justified the brand-colour
  // filter at brief.js:220-235: a fact cannot be sourced to a site never fetched.
  let unsourced = 0;
  a.facts = arr(a.facts).filter((f) => {
    if (!f || !FACT_SOURCES.includes(f.source)) { unsourced++; return false; }
    if (f.source === "website" && !ctx.hasWebsite) { unsourced++; return false; }
    if (f.source === "blog" && !ctx.hasBlog) { unsourced++; return false; }
    if (f.source === "transcript" && !ctx.hasTranscript) { unsourced++; return false; }
    return true;
  });
  if (unsourced) c.push(`${unsourced} fact(s) dropped for unverifiable provenance`);
  if (a.facts.length > 20) {
    a.facts.sort((x, y) => (Number(y.priority) || 0) - (Number(x.priority) || 0));
    a.facts = a.facts.slice(0, 20);
    c.push("facts truncated to 20 by priority");
  }

  // 14-15. refinedPrompt always ends up as usable TEXT. Off the zod path it can be a
  // number or an array, and an array of 2000 entries survives every check above only
  // to throw at .trim() below — so it becomes a string first.
  if (typeof a.refinedPrompt !== "string") a.refinedPrompt = norm(a.refinedPrompt);
  if (!norm(a.refinedPrompt)) {
    a.refinedPrompt = originalPrompt;
    if (a.classification === "READY") a.classification = "REFINABLE";
    c.push("empty refinedPrompt -> fell back to the user's words");
  }
  if (a.refinedPrompt.length > REFINED_PROMPT_MAX) {
    a.refinedPrompt = clipRefinedPrompt(a.refinedPrompt);
    c.push("refinedPrompt truncated at a sentence boundary");
    // Rules 4-5 run before this one and may have just reset a READY to the user's
    // words; if those words are longer than the contract holds (a prompt from a path
    // with no cap, or a cap raised without this one), the clip breaks READY's byte-
    // for-byte promise. The reading is still the person's own words, so REFINABLE —
    // never a refusal, and never a READY that lies.
    if (a.classification === "READY") {
      a.classification = "REFINABLE";
      c.push("READY whose words had to be clipped -> REFINABLE (no longer byte for byte)");
    }
  }

  // 16-19. Bounds.
  a.quality = obj(a.quality);
  a.quality.score = clamp(Math.round(Number(a.quality.score) || 0), 0, 100);
  a.quality.missing = arr(a.quality.missing)
    .filter((m) => QUALITY_DIMENSIONS.includes(m)).slice(0, 5);
  a.confidence = Number.isFinite(a.confidence) ? clamp(a.confidence, 0, 1) : 0.5;
  a.improvements = arr(a.improvements)
    .filter((i) => i && norm(i.what)).slice(0, 5);
  a.inferred = arr(a.inferred).filter((i) => i && typeof i === "object").slice(0, 8);
  a.safety = obj(a.safety);
  if (!["allow", "review", "block"].includes(a.safety.verdict)) a.safety.verdict = "allow";
  a.analyzedPrompt = norm(a.analyzedPrompt).slice(0, 400);

  // 20. LAST, always: the fields code owns. A model-supplied originalPrompt was
  // already stripped by zod; this sets the real one. It is what the create-route
  // acceptance check keys off, so it can never be model-controlled.
  a.originalPrompt = originalPrompt;
  a.v = SCHEMA_VERSION;
  a.scope = ctx.scope === "full" ? "full" : "prompt-only";
  a.expiresAt = Number(ctx.now || 0) + TTL_MS;
  a.override = false;

  return { analysis: a, coercions: c };
}

/**
 * THE LAST RESORT — a complete, valid, coerced-shape analysis built by hand.
 *
 * analyzePrompt's contract is that it never throws, and the floor under the model
 * (prompt_analysis_fallback.js -> AnalysisSchema.parse -> coerce) is ordinary code: it
 * reads an ingest object it did not build, and it has thrown before — a long prompt
 * sailed past a schema bound and the floor's own parse threw out of the function.
 * This is what runs when THAT happens. So it calls nothing that can throw: no zod, no
 * coerce, no lexicon, no regex over the prompt — only string clips and literals.
 *
 * It is the honest minimum: REFINABLE at confidence 0 on the person's own words
 * (clipped only if they exceed the contract), no beats, no signals, no facts, never a
 * rewrite. With ctx.tier1 it is the DISALLOWED reading coerce() rule 2 would give,
 * because the one thing a failure must never do is turn a deterministic refusal into
 * a film. The test file holds it to the contract: it parses, and coerce() leaves it
 * alone.
 *
 * ctx: { originalPrompt, tier1, scope, now }. PURE. NEVER THROWS.
 */
function minimalAnalysis(ctx) {
  let c = {};
  let words = "";
  try { c = obj(ctx); words = norm(c.originalPrompt); } catch { c = {}; words = ""; }
  const tier1 = c.tier1 && typeof c.tier1 === "object" ? c.tier1 : null;
  const now = Number(c.now);
  const text = (v, max) => (typeof v === "string" ? v.slice(0, max) : null);
  return {
    classification: tier1 ? "DISALLOWED" : "REFINABLE",
    confidence: 0,
    quality: { score: 0, missing: [] },
    // Trimmed after the slice, as coerce()'s bounds rules (16-19) leave it, so a coerce
    // pass over this object has nothing to change.
    analyzedPrompt: words.slice(0, 400).trim(),
    refinedPrompt: clipRefinedPrompt(words),
    improvements: [],
    narrative: { orderLocked: false, source: "derived", beats: [] },
    signals: {
      contentTypes: [], industries: [], vibes: [], tones: [],
      visualStyles: [], typographyStyles: [], animationStyles: [], category: "",
    },
    facts: [],
    inferred: [],
    safety: tier1
      ? { verdict: "block", category: text(tier1.category, 60), reason: text(tier1.reason, 300) }
      : { verdict: "allow", category: null, reason: null },
    originalPrompt: words,
    v: SCHEMA_VERSION,
    scope: c.scope === "full" ? "full" : "prompt-only",
    expiresAt: (Number.isFinite(now) ? now : 0) + TTL_MS,
    override: false,
  };
}

/**
 * What gets STORED on the job and attached as brief.analysis. Drops the parts that
 * only the interactive panel needs, because db.shape() re-serves the brief whole on
 * every 1500 ms poll and jobs.json is rewritten in full on every change.
 */
function reduce(analysis) {
  if (!analysis) return null;
  const a = analysis;
  return {
    v: a.v, scope: a.scope, expiresAt: a.expiresAt, override: !!a.override,
    classification: a.classification,
    confidence: a.confidence,
    quality: { score: a.quality.score, missing: a.quality.missing },
    originalPrompt: a.originalPrompt,
    analyzedPrompt: a.analyzedPrompt,
    refinedPrompt: a.refinedPrompt,
    improvements: a.improvements,
    narrative: a.narrative,
    signals: a.signals,
    facts: a.facts,
    inferred: a.inferred,
    safety: a.safety,
  };
}

/**
 * What db.shape() publishes. GET /api/projects/:id is UNAUTHENTICATED, so the
 * internal scoring, the confidence and the matcher signals stay off the wire.
 */
function forClient(analysis) {
  if (!analysis) return null;
  const a = analysis;
  return {
    classification: a.classification,
    originalPrompt: a.originalPrompt,
    analyzedPrompt: a.analyzedPrompt,
    refinedPrompt: a.refinedPrompt,
    improvements: a.improvements || [],
    inferred: a.inferred || [],
    orderLocked: !!(a.narrative && a.narrative.orderLocked),
    beatCount: (a.narrative && a.narrative.beats ? a.narrative.beats.length : 0),
  };
}

module.exports = {
  SCHEMA_VERSION, TTL_MS, CLASSIFICATIONS, MODEL_CLASSIFICATIONS, QUALITY_DIMENSIONS,
  FACT_KINDS, FACT_SOURCES, AXIS_KEYS, REFINED_PROMPT_MAX, BEATS_MAX,
  AnalysisSchema, coerce, reduce, forClient, clipRefinedPrompt, minimalAnalysis,
};
