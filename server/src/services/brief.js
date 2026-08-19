// Stage 2: Intent Object -> Creative Brief.
// One LLM call, zod-validated strict JSON, one repair re-ask on failure.

const fs = require("node:fs");
const path = require("node:path");
const { z } = require("zod");
const openrouter = require("./openrouter");
const frameRegistry = require("./frame_registry");
const frameManifest = require("./frame_manifest");

const SYSTEM = fs.readFileSync(
  path.join(__dirname, "..", "prompts", "system_brief.md"),
  "utf8"
);

const HEX = /^#[0-9a-fA-F]{6}$/;

const BriefSchema = z.object({
  improvedPrompt: z.string().min(20).max(1400),
  // The concrete, SHOOTABLE subject (what stock searches should show) — e.g.
  // "golden retriever dog", "skincare products on marble". Optional so older
  // cached briefs and forgetful models still validate; graph falls back to a
  // frequency heuristic when absent.
  subject: z.string().min(2).max(120).optional(),
  audience: z.string().min(2).max(400),
  tone: z.string().min(2).max(300),
  goal: z.string().min(2).max(400),
  keyMessages: z.array(z.string().min(1).max(400)).min(1).max(8),
  mustIncludeFacts: z.array(z.string().min(1).max(500)).max(12),
  // THE NARRATIVE SPINE. The script prompt has always asked for a Hook -> Problem -> Pain ->
  // Solution -> Proof -> Result -> CTA arc, but the brief handed it only `keyMessages` — a
  // flat list — so the writer had to infer the tension from a bag of bullet points, and on a
  // prompt-only job there was nothing to infer it from. These four carry the shape explicitly.
  // ALL OPTIONAL: briefs cached before this existed, and models that skip them, still validate.
  problem: z.string().max(400).default(""),
  solution: z.string().max(400).default(""),
  benefits: z.array(z.string().min(1).max(200)).max(6).default([]),
  cta: z.string().max(120).default(""),
  brandColors: z.array(z.string().regex(HEX)).max(6).default([]),
  suggestedFramePack: z.string(),
  suggestedDuration: z.number().int().min(5).max(320),
  musicMood: z.string().min(2).max(200),
  voProfile: z.string().min(2).max(300),
});

// One-line vibe per pack, given to the LLM so suggestions are informed.
// Falls back to the pack name alone for packs without a known description.
// EMPTY BY DESIGN since the four packs it described were removed. The lookup below already
// falls back to the pack manifest vibe and then the FRAME.md description, which is how the
// other 120-odd packs have always been offered to the model.
const PACK_VIBES = {};

const { extractFirstJsonObject: parseLenient } = require("./json_lenient");

// Packs used by the user's most recent jobs (deduped, newest first). Given to
// the brief LLM on "auto" so back-to-back videos rotate looks instead of every
// tech prompt landing on the same pack. Best-effort — an empty list is fine.
function recentlyUsedPacks(limit = 3) {
  try {
    const db = require("../db");
    const used = db.listRecent({ limit: 10 })
      .map((j) => j.framePack)
      .filter(Boolean);
    return [...new Set(used)].slice(0, limit);
  } catch {
    return [];
  }
}

async function generateBrief({ intent, signal }) {
  // OFFER ONLY THE PACKS THAT CAN SERVE THIS FILM'S LENGTH.
  //
  // The model was handed all 159 installed packs with no filter, and 27 of them are five-minute
  // templates. For a 30-second brief that is 27 candidates the frame selector will immediately
  // reroute away from; for a 300-second one the other 132 are the ineligible ones, and they are
  // the overwhelming majority — so the model would name a short pack almost every time and the
  // Script Room would show the user a template their film cannot use.
  //
  // A reroute is not a silent fix here: it lands as a disclosure on the job, so a bad suggestion
  // costs the user an explanation about a choice they never made. Filtering the menu is cheaper
  // and more honest than correcting the answer.
  //
  // Fail-open in both directions: an unknown duration filters nothing, and if the filter would
  // empty the list we fall back to the full one rather than hand the model no vocabulary at all.
  const requested = Number(intent?.preferences?.duration) || 0;
  const allPacks = frameRegistry.listPacks();
  const eligible = requested > 0
    ? allPacks.filter((name) => frameManifest.packFitsDuration(name, requested))
    : allPacks;
  const packs = eligible.length ? eligible : allPacks;
  const availableFramePacks = packs.map((name) => ({
    name,
    // The pack manifest is the source of truth (Phase 3). It already folds in the
    // hand-authored PACK_VIBES blurb (for the 7 packs that have one) and the real
    // FRAME.md description for the rest, so a single read covers every pack. Fall
    // back to the legacy tables for any pack that ships no manifest (fail-soft).
    vibe: frameManifest.getManifest(name)?.vibe
      || PACK_VIBES[name]
      || frameRegistry.getPackVibe(name)
      || "a curated design system",
  }));

  // Only relevant on "auto" — an explicit user choice is echoed verbatim anyway.
  const userChose = intent?.preferences?.framePack && intent.preferences.framePack !== "auto";
  const recentFramePacks = userChose ? [] : recentlyUsedPacks();

  const user = JSON.stringify(
    { ...intent, availableFramePacks, ...(recentFramePacks.length ? { recentFramePacks } : {}) },
    null, 2
  );

  let totalIn = 0, totalOut = 0;
  let lastErr = "";
  let userMsg = user;
  // WHO ACTUALLY SERVED THE CALL. chat() falls back across providers (KIE primary ->
  // OpenRouter), and they bill at very different rates. Returning these lets the
  // caller's tracker.addLlm price the stage correctly; without them usage.priceFor
  // fell through to DEFAULT_MODEL_PRICE and over-costed every intake stage ~3.3x.
  let servedModel = null, servedBy = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const { text, tokensIn, tokensOut, model, provider } = await openrouter.chat({
      system: SYSTEM,
      user: userMsg,
      jsonMode: true,
      stage: "brief",
      temperature: 0.6,
      signal,
    });
    totalIn += tokensIn;
    totalOut += tokensOut;
    servedModel = model || servedModel;
    servedBy = provider || servedBy;

    try {
      const raw = parseLenient(text);
      const brief = BriefSchema.parse(raw);

      // BRAND COLOURS ARE EVIDENCE, NOT TASTE. The schema validates hex SHAPE only, so
      // a model that ignores rule 3 and picks "colors matching the tone" produces a
      // palette indistinguishable from a real extraction. Downstream that fiction
      // reached the storyboard palette, and would have skinned an unbranded film in an
      // invented identity if the Art Director had not separately refused the "inferred"
      // tier. Enforce it here instead of trusting the prompt: with no extracted source,
      // brandColors is empty, and only colours the site ACTUALLY showed survive.
      const extracted = (intent && intent.website && Array.isArray(intent.website.brandColors))
        ? intent.website.brandColors.map((c) => String(c).toLowerCase())
        : [];
      const before = brief.brandColors.length;
      brief.brandColors = extracted.length
        ? brief.brandColors.filter((c) => extracted.includes(String(c).toLowerCase()))
        : [];
      if (before && !brief.brandColors.length) {
        console.log(`[brief] dropped ${before} invented brand colour(s) — none came from the analysed site`);
      }

      // Snap the suggested pack to something installed; honor explicit user choice.
      const userChoice = intent?.preferences?.framePack;
      const wanted = (userChoice && userChoice !== "auto") ? userChoice : brief.suggestedFramePack;
      brief.suggestedFramePack = frameRegistry.resolvePack(wanted) || frameRegistry.resolvePack("auto");

      const repeated = recentFramePacks[0] && recentFramePacks[0] === brief.suggestedFramePack;
      console.log(`[brief] ok on attempt ${attempt} (pack=${brief.suggestedFramePack}${repeated ? " — repeats the previous video's pack" : ""}, duration=${brief.suggestedDuration}s)`);
      return { brief, tokensIn: totalIn, tokensOut: totalOut, model: servedModel, provider: servedBy };
    } catch (e) {
      lastErr = e instanceof z.ZodError ? JSON.stringify(e.issues).slice(0, 800) : e.message;
      console.warn(`[brief] attempt ${attempt} invalid: ${lastErr.slice(0, 300)}`);
      userMsg = `${user}\n\nYour previous reply failed validation:\n${lastErr}\nReturn ONLY the corrected JSON object.`;
    }
  }

  throw new Error(`brief generation failed after 2 attempts: ${lastErr.slice(0, 500)}`);
}

module.exports = { generateBrief, BriefSchema };
