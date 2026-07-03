// Stage 2: Intent Object -> Creative Brief.
// One LLM call, zod-validated strict JSON, one repair re-ask on failure.

const fs = require("node:fs");
const path = require("node:path");
const { z } = require("zod");
const openrouter = require("./openrouter");
const frameRegistry = require("./frame_registry");

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
  brandColors: z.array(z.string().regex(HEX)).max(6).default([]),
  suggestedFramePack: z.string(),
  suggestedDuration: z.number().int().min(5).max(150),
  musicMood: z.string().min(2).max(200),
  voProfile: z.string().min(2).max(300),
});

// One-line vibe per pack, given to the LLM so suggestions are informed.
// Falls back to the pack name alone for packs without a known description.
const PACK_VIBES = {
  "blockframe": "maximalist neo-brutalist: candy pastels, 4px black borders, hard shadows, loud uppercase — playful, bold, product-launch energy",
  "biennale-yellow": "literary editorial: warm parchment, indigo ink, solar yellow blooms, serif display — elegant, cultural, slow-confidence",
  "midnight-glass": "dark glassmorphism: deep navy, frosted cards, one neon accent — premium, technical, nocturnal",
};

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
  const packs = frameRegistry.listPacks();
  const availableFramePacks = packs.map((name) => ({
    name,
    // Hard-coded blurb first, else derive a one-liner from the pack's FRAME.md
    // so the brief LLM can match tone -> pack for ALL packs (not just 3 of 10).
    vibe: PACK_VIBES[name] || frameRegistry.getPackVibe(name) || "a curated design system",
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

  for (let attempt = 1; attempt <= 2; attempt++) {
    const { text, tokensIn, tokensOut } = await openrouter.chat({
      system: SYSTEM,
      user: userMsg,
      jsonMode: true,
      stage: "brief",
      temperature: 0.6,
      signal,
    });
    totalIn += tokensIn;
    totalOut += tokensOut;

    try {
      const raw = parseLenient(text);
      const brief = BriefSchema.parse(raw);

      // Snap the suggested pack to something installed; honor explicit user choice.
      const userChoice = intent?.preferences?.framePack;
      const wanted = (userChoice && userChoice !== "auto") ? userChoice : brief.suggestedFramePack;
      brief.suggestedFramePack = frameRegistry.resolvePack(wanted) || frameRegistry.resolvePack("auto");

      const repeated = recentFramePacks[0] && recentFramePacks[0] === brief.suggestedFramePack;
      console.log(`[brief] ok on attempt ${attempt} (pack=${brief.suggestedFramePack}${repeated ? " — repeats the previous video's pack" : ""}, duration=${brief.suggestedDuration}s)`);
      return { brief, tokensIn: totalIn, tokensOut: totalOut };
    } catch (e) {
      lastErr = e instanceof z.ZodError ? JSON.stringify(e.issues).slice(0, 800) : e.message;
      console.warn(`[brief] attempt ${attempt} invalid: ${lastErr.slice(0, 300)}`);
      userMsg = `${user}\n\nYour previous reply failed validation:\n${lastErr}\nReturn ONLY the corrected JSON object.`;
    }
  }

  throw new Error(`brief generation failed after 2 attempts: ${lastErr.slice(0, 500)}`);
}

module.exports = { generateBrief, BriefSchema };
