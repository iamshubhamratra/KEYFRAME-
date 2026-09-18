// THE DETERMINISTIC FLOOR — no LLM, no network, no async, never throws.
//
// The brief stage today makes at most two LLM calls and then throws (brief.js:319).
// On the project path that is a dead job whose user-visible error is a zod issue
// dump; on /api/generate the identical throw is swallowed and the film continues on
// the raw prompt. Identical input, opposite outcomes, neither of them good — and
// everything needed to assemble a serviceable reading is already in hand.
//
// So analysis never fails. When the model is unreachable, slow, or returns garbage
// twice, this runs instead and the pipeline proceeds on an honest, thin reading.
//
// THREE THINGS IT MAY NEVER DO:
//   - emit READY. READY carries a contract (refinedPrompt === originalPrompt AND no
//     improvements) that a heuristic has not earned.
//   - emit DISALLOWED. A refusal must never be the consequence of an outage — and
//     the request was judged in scope at submit, before this stage ever ran.
//   - emit safety `review` or `block`. Fail-open is the whole point: one provider
//     outage must not mass-block every job.
//
// AND ONE THING IT MUST ALWAYS DO: return an object AnalysisSchema.parse accepts. The
// floor is the answer when the model path has already failed, so a floor that trips a
// schema bound has nowhere left to fall. It did: refinedPrompt was the prompt
// unclipped, the schema capped it lower than the routes cap the prompt, and a
// 3000-character request threw a ZodError out of analyzePrompt. Every string below is
// therefore clipped to its schema bound here, at the source, using the schema's own
// constants — and analyzePrompt still guards this call, because "should not throw" is
// not the same promise as "cannot".

const lex = require("./template_lexicon");
const { QUALITY_DIMENSIONS, BEATS_MAX, clipRefinedPrompt } = require("./prompt_analysis_schema");

// "Scene 1:", "Beat 2 -", "3) ...", "Step 4." — two or more of these is an order.
const MARKER_RE = /^[\s>*-]*(?:(?:scene|beat|step|shot|part|chapter)\s*#?\d+|(?:\d{1,2})\s*[.)\]:-])/gim;

// Figures worth putting on screen: percentages, currency, multipliers, plain counts
// with a unit. Mirrors the shape content_density.js already looks for.
const METRIC_RE = /(\d[\d,.]*\s*(?:%|percent|x\b|k\b|m\b|bn\b|billion|million|hours?|minutes?|seconds?|days?|weeks?|months?|years?)|[$£€]\s?\d[\d,.]*)/gi;

const CTA_RE = /\b(sign up|get started|try (?:it )?free|book a demo|learn more|download|subscribe|join|buy now|contact us|visit)\b/i;

function topLabels(map, n) {
  return [...(map || [])].sort((a, b) => b[1] - a[1]).slice(0, n).map(([l]) => l);
}

// EVERY marked beat, uncapped. This is a parser, not a policy: it used to slice to 24
// here and hand fallbackAnalysis an array that could never be longer than the cap, so
// a 30-scene storyline came back as 24 beats with the order LOCKED — and the script
// directive then told the model to film those 24, in order, and nothing else. Whether
// a sequence is short enough to lock is fallbackAnalysis's decision, made against the
// same BEATS_MAX coerce() uses, and it can only make it from the real count.
function beatsFrom(prompt) {
  const lines = String(prompt).split(/\r?\n|(?=\b(?:scene|beat|step|shot)\s*#?\d+)/gi)
    .map((s) => s.trim()).filter(Boolean);
  const marked = lines.filter((l) => { MARKER_RE.lastIndex = 0; return MARKER_RE.test(l); });
  if (marked.length < 2) return [];
  return marked.map((line, i) => ({
    index: i + 1,
    // Strip the marker itself; what remains is the beat.
    beat: line.replace(/^[\s>*-]*(?:(?:scene|beat|step|shot|part|chapter)\s*#?\d+|\d{1,2})\s*[.)\]:-]?\s*/i, "").slice(0, 400) || line.slice(0, 400),
  }));
}

// Ingest objects are built elsewhere and read here without a schema, so a field that
// is not the shape we expect degrades to empty instead of throwing — `"text".join` and
// `(42).slice` are TypeErrors, and this is the code that runs when nothing else could.
const list = (x) => (Array.isArray(x) ? x : []);
const str = (x) => (typeof x === "string" ? x : "");

/**
 * Build a serviceable analysis with no model.
 * ctx: { prompt, intent, preferences, moderation }
 * Returns a plain object shaped to pass AnalysisSchema.parse + coerce with zero coercions.
 */
function fallbackAnalysis(ctx = {}) {
  ctx = ctx && typeof ctx === "object" ? ctx : {};
  const prompt = String(ctx.prompt == null ? "" : ctx.prompt).trim();
  const intent = ctx.intent && typeof ctx.intent === "object" ? ctx.intent : {};
  const w = intent.website && typeof intent.website === "object" ? intent.website : {};
  const b = intent.blog && typeof intent.blog === "object" ? intent.blog : {};

  // Everything textual we legitimately have, for label projection only.
  const corpus = [
    prompt, prompt, // the user's own words carry the weight
    str(w.title), str(w.description), list(w.headings).slice(0, 8).map(str).join(" "),
    str(b.title), str(b.excerpt).slice(0, 600),
  ].join(" ");

  let signals = {
    contentTypes: [], industries: [], vibes: [], tones: [],
    visualStyles: [], typographyStyles: [], animationStyles: [], category: "",
  };
  try {
    const p = lex.profileText(corpus);
    signals = {
      contentTypes: topLabels(p.contentTypes, 3),
      industries: topLabels(p.industries, 3),
      vibes: topLabels(p.vibes, 3),
      tones: topLabels(p.tones, 2),
      visualStyles: topLabels(p.visualStyles, 2),
      typographyStyles: topLabels(p.typographyStyles, 2),
      animationStyles: topLabels(p.animationStyles, 2),
      category: "",
    };
  } catch { /* a lexicon failure must not take the floor down with it */ }

  // The same rule coerce() applies to a model's beats, applied to the REAL count: two
  // to BEATS_MAX marked beats is an order the pipeline can keep, so it is locked; more
  // than that and the lock is released and the source is "derived", with the first
  // BEATS_MAX stored for reference. A 30-scene storyline filmed as its first 24 scenes
  // "in the user's order" is a different film wearing the user's name.
  const marked = beatsFrom(prompt);
  const sequenced = marked.length >= 2;
  const orderLocked = sequenced && marked.length <= BEATS_MAX;
  const beats = marked.slice(0, BEATS_MAX);

  // Facts come ONLY from the user's own words here — a heuristic has no business
  // attributing anything to a page it did not read. Clipped to the schema's 300: a
  // metric is whatever the regex matched, and "a run of 400 digits then %" is a match.
  const facts = [];
  const seen = new Set();
  let m;
  METRIC_RE.lastIndex = 0;
  while ((m = METRIC_RE.exec(prompt)) !== null) {
    const text = m[0].trim().slice(0, 300);
    if (seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    facts.push({ text, kind: "metric", priority: 4, source: "prompt" });
    if (facts.length >= 8) break;
  }
  const cta = prompt.match(CTA_RE);
  if (cta) facts.push({ text: cta[0].slice(0, 300), kind: "cta", priority: 2, source: "prompt" });

  // An honest read of the INPUT, not of any rewrite. Short and structureless scores
  // low because that is how much the pipeline has to infer, not as a judgement.
  const words = prompt ? prompt.split(/\s+/).length : 0;
  let score = 20;
  if (words >= 8) score += 12;
  if (words >= 20) score += 12;
  if (words >= 45) score += 8;
  // `sequenced`, not `orderLocked`: the score reads the INPUT, and a storyline too long
  // to lock is still a written sequence — the release is a pipeline limit, not a flaw
  // in what the person typed.
  if (sequenced) score += 16;
  if (signals.contentTypes.length) score += 10;
  if (signals.industries.length) score += 6;
  if (signals.vibes.length || signals.tones.length) score += 6;
  if (facts.length) score += 6;
  if (w.title || b.title) score += 8;
  score = Math.max(0, Math.min(100, score));

  const missing = [];
  if (words < 8) missing.push("intent-clarity");
  if (!signals.contentTypes.length) missing.push("video-purpose");
  if (!signals.vibes.length && !signals.tones.length) missing.push("tone");
  if (!sequenced) missing.push("story-structure");
  if (!signals.visualStyles.length) missing.push("visual-direction");

  return {
    // NEVER READY (unearned) and NEVER DISALLOWED (an outage must not refuse). A
    // STRUCTURED_STORY only when the regex actually parsed a marked sequence;
    // otherwise REFINABLE, the honest floor — the idea stands, and with no model
    // there is nothing credible to add to it.
    classification: orderLocked ? "STRUCTURED_STORY" : "REFINABLE",
    confidence: 0.25, // deliberately low: this is a floor, not a judgement
    quality: { score, missing: missing.filter((d) => QUALITY_DIMENSIONS.includes(d)).slice(0, 5) },
    analyzedPrompt: prompt.slice(0, 400),
    // The user's own words, verbatim. With no model there is nothing better to say,
    // and inventing a rewrite here would be exactly the silent replacement this
    // whole feature exists to stop. Clipped with coerce()'s own function, which leaves
    // every prompt a route accepts untouched and brings anything longer inside the
    // contract, so this object parses whatever arrived.
    refinedPrompt: clipRefinedPrompt(prompt),
    improvements: [],
    narrative: {
      orderLocked,
      source: orderLocked ? "user-authored" : "derived",
      beats,
    },
    signals,
    facts,
    inferred: [],
    safety: { verdict: "allow", category: null, reason: null },
  };
}

module.exports = { fallbackAnalysis, beatsFrom };
