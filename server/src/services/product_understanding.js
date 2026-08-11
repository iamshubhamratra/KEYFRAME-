// PRODUCT UNDERSTANDING — the stage that stops a bare prompt from producing a bare film.
//
// ─────────────────────────────────────────────────────────────────────────────────────
// WHY THIS EXISTS
//
// Intake has always been one LLM call: intent -> brief (services/brief.js). That is enough
// when a WEBSITE was ingested, because `understandWebsite` supplies title, description,
// headings, body text, a colour palette, typography and real screenshots — hundreds of words
// of ground truth the brief can distil and the script can quote.
//
// On the PROMPT-ONLY path there is no such signal, and the brief is asked to distil a single
// sentence into audience / tone / goal / keyMessages / mustIncludeFacts. `system_brief.md`
// rule 1 then — correctly — forbids inventing anything:
//
//     "If the inputs contain no hard facts, return an empty array — do NOT invent
//      statistics, dates, customer names, or product claims."
//
// So `mustIncludeFacts` comes back empty, `keyMessages` come back as paraphrases of the one
// sentence, and `system_script.md` rule 3 ("Facts only from the brief") leaves the writer
// with nothing concrete to say. The result is the filler the user reported: "Discover a
// better way. Built for you. Get started today." — over stock photos chosen from those same
// empty words.
//
// The anti-invention rule is right and stays. What was missing is the distinction it elides:
//
//     CATEGORY KNOWLEDGE is not invention.  SPECIFIC CLAIMS are.
//
// Knowing that an expense app photographs receipts and files them by category, that a coffee
// roastery roasts and grinds and brews, that a logistics dashboard shows shipments on a map —
// that is reasoning any competent writer does, and it is what makes a script concrete. Making
// up "saves 6 hours a month" or "trusted by 12,000 teams" is fabrication. This stage is
// allowed the first and forbidden the second, and it must declare every inference it made
// (`inferred[]`) so downstream stages know which sentences may be SPOKEN as fact and which
// may only shape the imagery.
//
// ─────────────────────────────────────────────────────────────────────────────────────
// WHAT IT PRODUCES
//
// A structured product model: category, what it does, audience, problem, solution, features
// (each with `provenBy` — what a camera would have to show), benefits, differentiators,
// proofPoints (stated-only), takeaway, cta, and a `visualVocabulary` of literal, shootable
// subjects with an asset type and a priority.
//
// Two consumers, and the second is the point:
//   • the BRIEF gets a rich intent instead of one sentence, so its keyMessages are real.
//   • the ASSET REQUIREMENT PLANNER gets `visualVocabulary` — concrete search subjects tied
//     to beats and ranked by importance — instead of deriving stock queries by stripping
//     stopwords out of a `visualDirection` sentence (graph.js deriveQuery), which is how
//     "scalable growth" became a search for trading charts.
//
// RUNS ONLY WHERE THE GAP IS. A job that ingested a website or a reference video already has
// ground truth; spending a call to infer what the site states would be worse, not better. See
// `shouldRun`.
//
// FAIL-OPEN (THE HOUSE LAW): any error returns null and intake proceeds exactly as before.

const fs = require("node:fs");
const path = require("node:path");
const { z } = require("zod");
const openrouter = require("./openrouter");
const { extractFirstJsonObject: parseLenient } = require("./json_lenient");

const SYSTEM = fs.readFileSync(path.join(__dirname, "..", "prompts", "system_product.md"), "utf8");

const ASSET_TYPES = ["screenshot", "productImage", "person", "object", "place", "icon"];
const PRIORITIES = ["critical", "high", "medium"];

const FeatureSchema = z.object({
  name: z.string().min(2).max(80),
  whatItDoes: z.string().min(2).max(220).default(""),
  // What a camera would show to PROVE this feature. The field that turns a feature list
  // into an asset plan — a feature with no provenBy cannot be filmed, only asserted.
  provenBy: z.string().min(2).max(220).default(""),
});

const VisualSchema = z.object({
  subject: z.string().min(2).max(220),
  why: z.string().max(220).default(""),
  assetType: z.enum(ASSET_TYPES).default("object"),
  priority: z.enum(PRIORITIES).default("high"),
});

const ProductSchema = z.object({
  productName: z.string().max(120).default(""),
  category: z.string().min(2).max(120),
  whatItDoes: z.string().min(2).max(300),
  audience: z.string().min(2).max(300),
  problem: z.string().min(2).max(300),
  solution: z.string().min(2).max(300),
  features: z.array(FeatureSchema).max(8).default([]),
  benefits: z.array(z.string().min(1).max(160)).max(8).default([]),
  differentiators: z.array(z.string().min(1).max(220)).max(6).default([]),
  proofPoints: z.array(z.string().min(1).max(300)).max(10).default([]),
  takeaway: z.string().max(300).default(""),
  cta: z.string().max(80).default(""),
  visualVocabulary: z.array(VisualSchema).max(12).default([]),
  tone: z.string().max(200).default(""),
  confidence: z.enum(["stated", "inferred", "mixed"]).default("mixed"),
  inferred: z.array(z.string().min(1).max(300)).max(20).default([]),
});

// Concept nouns that produce stock junk when searched literally. The script prompt already
// bans them for `assetNeeds`; the same ban has to hold here, because `visualVocabulary`
// feeds the collector directly and a banned word would arrive pre-laundered as a "subject".
const BANNED_SUBJECT = /\b(digital screen|ai interface|technology background|cyber|futuristic|innovation|synergy|transformation|solution[s]?\b|concept)\b/i;

/**
 * SHOULD THIS STAGE RUN?
 *
 * Only when the job has no richer ground truth. A website ingest or a video transcript is
 * evidence; inferring over the top of evidence spends a call to make the brief LESS grounded.
 *
 * A website whose ingest FAILED (no title and no body text) counts as prompt-only — that is
 * the case where the film would otherwise ship on nothing at all, and it is exactly where the
 * inference is worth the most.
 */
function shouldRun(intent) {
  if (!intent) return false;
  const prompt = String(intent.prompt || "").trim();
  if (prompt.length < 3) return false;                       // nothing to reason from
  const site = intent.website || null;
  const siteHasSignal = !!site && (
    String(site.bodyText || "").trim().length > 200
    || (Array.isArray(site.headings) && site.headings.length >= 3)
  );
  if (siteHasSignal) return false;
  const vid = intent.video || null;
  const vidHasSignal = !!vid && String(vid.transcript || "").trim().length > 200;
  if (vidHasSignal) return false;
  return true;
}

/** Drop visual entries that would send the collector after concept junk. */
function cleanVisuals(list) {
  const seen = new Set();
  const out = [];
  for (const v of Array.isArray(list) ? list : []) {
    const subject = String(v.subject || "").trim();
    if (!subject || BANNED_SUBJECT.test(subject)) continue;
    const key = subject.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...v, subject });
  }
  return out;
}

/**
 * A compact prose rendering of the model, for prompts that take text rather than JSON
 * (the script stage's `languageDirective` slot, the storyboard prompt). Deliberately states
 * the inference boundary in the text itself, so a model reading only this still knows which
 * lines it may speak as fact.
 */
function describe(model) {
  if (!model) return "";
  const lines = [];
  lines.push(`PRODUCT UNDERSTANDING (${model.confidence})`);
  if (model.productName) lines.push(`Name: ${model.productName}`);
  lines.push(`Category: ${model.category}`);
  lines.push(`What it does: ${model.whatItDoes}`);
  lines.push(`Audience: ${model.audience}`);
  lines.push(`Problem: ${model.problem}`);
  lines.push(`Solution: ${model.solution}`);
  if (model.features.length) {
    lines.push("Features (and what proves each on camera):");
    for (const f of model.features) lines.push(`  - ${f.name}: ${f.whatItDoes}${f.provenBy ? ` [show: ${f.provenBy}]` : ""}`);
  }
  if (model.benefits.length) lines.push(`Benefits: ${model.benefits.join(" · ")}`);
  if (model.differentiators.length) lines.push(`Different because: ${model.differentiators.join(" · ")}`);
  if (model.takeaway) lines.push(`One thing to remember: ${model.takeaway}`);
  if (model.cta) lines.push(`Call to action: ${model.cta}`);
  if (model.proofPoints.length) {
    lines.push(`STATED FACTS (quotable verbatim): ${model.proofPoints.join(" · ")}`);
  } else {
    lines.push("STATED FACTS: none — the user supplied no numbers or claims, so the script must not use any.");
  }
  if (model.inferred.length) {
    lines.push(`INFERRED (shape the story and the imagery with these, but never present them as the user's own claims): ${model.inferred.join(" · ")}`);
  }
  return lines.join("\n");
}

/**
 * Run the stage. Returns `{ product, tokensIn, tokensOut, model, provider }` or null.
 * Never throws — intake must survive a dead provider exactly as it did before.
 */
async function understandProduct({ intent, signal } = {}) {
  if (!shouldRun(intent)) return null;

  const hints = {};
  if (intent.website && (intent.website.title || intent.website.description)) {
    hints.website = { title: intent.website.title || "", description: intent.website.description || "" };
  }
  if (intent.userAssets && intent.userAssets.inventory) hints.uploadedAssets = intent.userAssets.inventory;
  if (intent.video && intent.video.transcript) hints.transcriptExcerpt = String(intent.video.transcript).slice(0, 600);

  const user = JSON.stringify({
    prompt: intent.prompt || "",
    preferences: intent.preferences || {},
    ...(Object.keys(hints).length ? { hints } : {}),
  }, null, 2);

  let totalIn = 0, totalOut = 0, servedModel = null, servedBy = null, lastErr = "";
  let userMsg = user;

  for (let attempt = 1; attempt <= 2; attempt++) {
    let res;
    try {
      res = await openrouter.chat({
        system: SYSTEM, user: userMsg, jsonMode: true,
        stage: "product", temperature: 0.4, signal,
      });
    } catch (e) {
      console.warn(`[product] call failed (${String(e.message).slice(0, 160)}) — continuing without a product model`);
      return null;
    }
    totalIn += res.tokensIn; totalOut += res.tokensOut;
    servedModel = res.model || servedModel; servedBy = res.provider || servedBy;

    try {
      const product = ProductSchema.parse(parseLenient(res.text));
      product.visualVocabulary = cleanVisuals(product.visualVocabulary);

      // PROOF POINTS ARE EVIDENCE, NOT TASTE — the same enforcement brief.js applies to
      // brandColours, for the same reason. The schema validates SHAPE, so a model that
      // ignores the rule returns invented statistics that are indistinguishable from real
      // ones downstream. A stated fact must appear, in substance, in what the user typed.
      const promptText = String(intent.prompt || "").toLowerCase();
      const before = product.proofPoints.length;
      product.proofPoints = product.proofPoints.filter((p) => {
        const words = String(p).toLowerCase().match(/[a-z0-9][a-z0-9.%$+-]*/g) || [];
        const solid = words.filter((w) => w.length > 3 || /\d/.test(w));
        if (!solid.length) return false;
        const hits = solid.filter((w) => promptText.includes(w)).length;
        return hits / solid.length >= 0.6;
      });
      if (before && !product.proofPoints.length) {
        console.log(`[product] dropped ${before} proof point(s) — none traced to what the user actually wrote`);
      }

      console.log(`[product] ok on attempt ${attempt} — ${product.category}`
        + ` · ${product.features.length} feature(s), ${product.visualVocabulary.length} visual(s)`
        + ` · ${product.proofPoints.length} stated fact(s), ${product.inferred.length} inference(s)`);
      return { product, tokensIn: totalIn, tokensOut: totalOut, model: servedModel, provider: servedBy };
    } catch (e) {
      lastErr = e instanceof z.ZodError ? JSON.stringify(e.issues).slice(0, 600) : e.message;
      console.warn(`[product] attempt ${attempt} invalid: ${String(lastErr).slice(0, 240)}`);
      userMsg = `${user}\n\nYour previous reply failed validation:\n${lastErr}\nReturn ONLY the corrected JSON object.`;
    }
  }
  // FAIL-OPEN: a film without a product model is the film we shipped yesterday. A film that
  // failed to render because this stage could not parse JSON is a regression.
  console.warn(`[product] giving up after 2 attempts — continuing without a product model`);
  return null;
}

module.exports = { understandProduct, shouldRun, describe, ProductSchema };
