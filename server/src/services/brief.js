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
  "summit-keynote": "executive pitch light: porcelain grounds, deep navy ink, one cobalt beam + champagne gold, floating glass panels, 3D data constellation — for investor pitches, keynotes, founder stories, B2B decks",
  "prism-launch": "white-studio product reveal: gallery white, carbon display type, iridescent prism gradients, one ember-hot CTA, rotating 3D shards — for product launches, release ads, feature announcements",
  "fable-storybook": "warm storybook: parchment, ink-brown serif spirit, watercolor terracotta/sage/dusk washes, paper planes + firefly orbs in gentle 3D — for narratives, brand stories, emotional arcs, journeys",
  "longshot-cinema": "one-take cinema: graphite stage, tungsten amber + beam blue, letterboxed continuous camera travel with live timecode, pop-up stat figures, animated product mocks, light sweeps — for trailers, hype reels, cinematic announcements",
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
      let snapped = frameRegistry.resolvePack(wanted);
      if (!snapped) {
        // Rotation-aware fallback (identity system): an unresolvable suggestion
        // used to land EVERY auto video on the one global default pack — a
        // template monoculture on auto traffic. Pick deterministically from the
        // installed set instead, skipping the recently-used packs so consecutive
        // auto videos don't share a look.
        const recent = new Set(recentFramePacks || []);
        const pool = packs.filter((p) => !recent.has(p));
        const pickFrom = pool.length ? pool : packs;
        let h = 0; const seedStr = String(intent?.prompt || wanted || "kf");
        for (let i = 0; i < seedStr.length; i++) h = (h * 31 + seedStr.charCodeAt(i)) >>> 0;
        snapped = pickFrom[h % pickFrom.length] || frameRegistry.resolvePack("auto");
        console.log(`[brief] suggestion "${wanted}" not installed → rotation fallback picked ${snapped}`);
      }
      brief.suggestedFramePack = snapped;

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
