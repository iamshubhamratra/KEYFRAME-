#!/usr/bin/env node
// APPLY TEMPLATE AUDIO PROFILES — writes the `audio` block into every frames/<pack>/pack.json.
//
// This table IS the source of authorship. Each profile is derived from the pack's own
// declared identity (its `vibe`, ground, motion grammar and asset keywords) — not invented
// — so a pack's sound and its look come from the same reading. Keeping it in one file makes
// the whole set reviewable side by side, which is the only way to keep 43 templates
// distinguishable from each other; hand-editing 43 files guarantees drift.
//
// Re-runnable and idempotent: it rewrites the `audio` key and touches nothing else.
//
//   node scripts/apply-audio-profiles.js          # write
//   node scripts/apply-audio-profiles.js --check  # verify only, non-zero exit on drift
//
// AUTHORING RULES (see docs/TEMPLATE-AUDIO-IDENTITY.md):
//   · musicKeywords are ordered CALMEST FIRST. With narration off the rotation prefers the
//     later entries — that is how "more energetic" happens without a genre change.
//   · sfxPalette values MUST name a real audio_cues.CUES intent; boot validation rejects
//     anything else. The palette says what a TRANSITION/REVEAL/CTA sounds like on this
//     pack — it never decides WHETHER a cue fires (sfx_plan owns that).
//   · noVo.energyBoost 0 = this pack deliberately does not lift when narration is off.

const fs = require("node:fs");
const path = require("node:path");

const FRAMES = path.resolve(__dirname, "..", "..", "frames");

// mood · energy · tempo · style[] · musicKeywords[] (calm → driving) · sfxPalette · noVo
const PROFILES = {
  "aurora-spectrum": {
    mood: "calm", energy: "medium", tempo: "mid",
    style: ["ambient", "electronic", "corporate", "chillout"],
    musicKeywords: ["calm ambient", "soft electronic", "modern corporate", "atmospheric chillout", "uplifting technology", "flowing electronic"],
    sfxPalette: { transition: "light-sweep", ui: "soft-tap", reveal: "shimmer", data: "data-ping", cta: "logo-rise" },
    noVo: { energyBoost: 1, sfxDensity: "rich", ambient: true },
  },
  "bauhaus-print": {
    mood: "minimal", energy: "medium", tempo: "mid",
    style: ["minimal", "abstract", "jazz", "experimental"],
    musicKeywords: ["minimal abstract", "modern creative", "rhythmic ambient", "playful minimal", "upbeat minimal", "abstract percussion"],
    sfxPalette: { transition: "card-slide", ui: "pop", reveal: "gentle-impact", data: "counter-tick", cta: "cta-impact" },
    noVo: { energyBoost: 1, sfxDensity: "rich", ambient: false },
  },
  "bauhaus-riot": {
    mood: "bold", energy: "high", tempo: "fast",
    style: ["minimal", "abstract", "percussion", "modern"],
    musicKeywords: ["modern creative", "abstract minimal", "playful rhythmic", "rhythmic percussion", "bold upbeat", "driving abstract"],
    sfxPalette: { transition: "card-slide", ui: "pop", reveal: "gentle-impact", data: "counter-tick", cta: "cta-impact" },
    noVo: { energyBoost: 2, sfxDensity: "rich", ambient: false },
  },
  "biennale-yellow": {
    mood: "elegant", energy: "low", tempo: "slow",
    style: ["classical", "piano", "acoustic", "ambient"],
    musicKeywords: ["soft piano", "elegant acoustic", "gentle classical", "warm ambient", "cultural strings", "uplifting piano"],
    sfxPalette: { transition: "card-slide", ui: "soft-tap", reveal: "shimmer", data: "counter-tick", cta: "logo-rise" },
    noVo: { energyBoost: 1, sfxDensity: "normal", ambient: false },
  },
  "blockframe": {
    mood: "playful", energy: "high", tempo: "fast",
    style: ["pop", "funk", "indie", "upbeat"],
    musicKeywords: ["upbeat pop", "playful funk", "quirky indie", "bright energetic", "powerful pop", "high energy funk"],
    sfxPalette: { transition: "whoosh", ui: "pop", reveal: "gentle-impact", data: "counter-tick", cta: "cta-impact" },
    noVo: { energyBoost: 2, sfxDensity: "rich", ambient: false },
  },
  "bloom-fable": {
    mood: "gentle", energy: "low", tempo: "slow",
    style: ["acoustic", "folk", "ukulele", "storytelling"],
    musicKeywords: ["gentle acoustic", "soft ukulele", "gentle folk", "warm acoustic", "cheerful folk", "bright acoustic"],
    sfxPalette: { transition: "card-slide", ui: "soft-tap", reveal: "shimmer", data: "counter-tick", cta: "success" },
    noVo: { energyBoost: 1, sfxDensity: "rich", ambient: false },
  },
  "bloom-illustrated": {
    mood: "friendly", energy: "medium", tempo: "mid",
    style: ["acoustic", "indie", "corporate", "warm"],
    musicKeywords: ["warm acoustic", "friendly corporate", "soft indie", "optimistic acoustic", "upbeat friendly", "bright indie"],
    sfxPalette: { transition: "card-slide", ui: "pop", reveal: "shimmer", data: "counter-tick", cta: "success" },
    noVo: { energyBoost: 1, sfxDensity: "rich", ambient: false },
  },
  "blueprint-atelier": {
    mood: "technical", energy: "medium", tempo: "mid",
    style: ["minimal", "electronic", "ambient tech", "mechanical"],
    musicKeywords: ["minimal technical", "precise electronic", "ambient engineering", "mechanical minimal", "driving technical", "industrial electronic"],
    sfxPalette: { transition: "light-sweep", ui: "ui-click", reveal: "gentle-impact", data: "counter-tick", cta: "cta-impact" },
    noVo: { energyBoost: 1, sfxDensity: "rich", ambient: true },
  },
  "brightlife": {
    mood: "inspiring", energy: "medium", tempo: "mid",
    style: ["corporate", "uplifting", "electronic", "cinematic"],
    musicKeywords: ["inspiring corporate", "bright modern", "optimistic startup", "uplifting cinematic", "innovation technology", "energetic corporate"],
    sfxPalette: { transition: "light-sweep", ui: "soft-tap", reveal: "product-reveal", data: "counter-tick", cta: "logo-rise" },
    noVo: { energyBoost: 1, sfxDensity: "rich", ambient: false },
  },
  "daybreak-bakehouse": {
    mood: "warm", energy: "low", tempo: "slow",
    style: ["acoustic", "folk", "jazz", "morning"],
    musicKeywords: ["warm acoustic morning", "gentle folk", "soft cafe jazz", "handmade acoustic", "cheerful morning", "upbeat acoustic"],
    sfxPalette: { transition: "card-slide", ui: "soft-tap", reveal: "shimmer", data: "counter-tick", cta: "success" },
    noVo: { energyBoost: 1, sfxDensity: "rich", ambient: true },
  },
  "fable-storybook": {
    mood: "warm", energy: "low", tempo: "slow",
    style: ["acoustic", "folk", "storytelling", "orchestral"],
    musicKeywords: ["soft storytelling", "gentle acoustic", "warm folk", "whimsical orchestral", "cheerful folk", "bright orchestral"],
    sfxPalette: { transition: "card-slide", ui: "soft-tap", reveal: "shimmer", data: "counter-tick", cta: "success" },
    noVo: { energyBoost: 1, sfxDensity: "normal", ambient: false },
  },
  "flagship": {
    mood: "premium", energy: "medium", tempo: "mid",
    style: ["cinematic", "electronic", "ambient", "corporate"],
    musicKeywords: ["premium cinematic", "dark modern technology", "ambient electronic", "inspiring cinematic", "driving cinematic", "epic technology"],
    sfxPalette: { transition: "light-sweep", ui: "soft-tap", reveal: "product-reveal", data: "counter-tick", cta: "logo-rise" },
    noVo: { energyBoost: 1, sfxDensity: "rich", ambient: false },
  },
  "grid-dispatch": {
    mood: "precise", energy: "medium", tempo: "mid",
    style: ["minimal", "underscore", "documentary", "electronic"],
    musicKeywords: ["minimal electronic", "documentary underscore", "precise rhythmic", "modern corporate clean", "understated tension", "percussive pulse"],
    sfxPalette: { transition: "card-slide", ui: "ui-click", reveal: "gentle-impact", data: "counter-tick", cta: "cta-impact" },
    noVo: { energyBoost: 1, sfxDensity: "normal", ambient: false },
  },
  "hype-wave": {
    mood: "hype", energy: "high", tempo: "fast",
    style: ["hip hop", "trap", "pop", "electronic"],
    musicKeywords: ["upbeat pop", "energetic hip hop", "youth anthem", "powerful trap", "high energy beat", "driving beat"],
    sfxPalette: { transition: "whoosh", ui: "pop", reveal: "product-reveal", data: "counter-tick", cta: "cta-impact" },
    noVo: { energyBoost: 2, sfxDensity: "rich", ambient: false },
  },
  "kinetic-bold": {
    mood: "bold", energy: "high", tempo: "fast",
    style: ["electronic", "rock", "percussion", "modern"],
    musicKeywords: ["bold modern", "powerful electronic", "heavy percussion", "driving rock", "high energy electronic", "aggressive beat"],
    sfxPalette: { transition: "whoosh", ui: "pop", reveal: "gentle-impact", data: "counter-tick", cta: "cta-impact" },
    noVo: { energyBoost: 2, sfxDensity: "rich", ambient: false },
  },
  "lantern-night": {
    mood: "serene", energy: "low", tempo: "slow",
    style: ["ambient", "acoustic", "world", "cinematic"],
    musicKeywords: ["serene ambient", "warm night acoustic", "gentle world", "soft cinematic", "uplifting ambient", "flowing acoustic"],
    sfxPalette: { transition: "light-sweep", ui: "soft-tap", reveal: "shimmer", data: "counter-tick", cta: "logo-rise" },
    noVo: { energyBoost: 1, sfxDensity: "rich", ambient: true },
  },
  "midnight-glass": {
    mood: "premium", energy: "medium", tempo: "mid",
    style: ["electronic", "ambient", "tech", "deep house"],
    musicKeywords: ["dark premium tech", "cinematic ambient", "deep electronic", "nocturnal modern", "driving deep house", "energetic technology"],
    sfxPalette: { transition: "light-sweep", ui: "data-ping", reveal: "product-reveal", data: "counter-tick", cta: "logo-rise" },
    noVo: { energyBoost: 1, sfxDensity: "rich", ambient: false },
  },
  "mono-corporate": {
    mood: "professional", energy: "medium", tempo: "mid",
    style: ["corporate", "minimal", "electronic", "ambient"],
    musicKeywords: ["clean corporate", "minimal professional", "modern business", "confident corporate", "upbeat corporate", "driving business"],
    sfxPalette: { transition: "card-slide", ui: "ui-click", reveal: "gentle-impact", data: "counter-tick", cta: "cta-impact" },
    noVo: { energyBoost: 1, sfxDensity: "rich", ambient: false },
  },
  "motion-canvas": {
    mood: "playful", energy: "high", tempo: "fast",
    style: ["electronic", "funk", "abstract", "percussion"],
    musicKeywords: ["abstract electronic", "playful percussion", "modern groove", "rhythmic funk", "upbeat energetic", "driving groove"],
    sfxPalette: { transition: "card-slide", ui: "pop", reveal: "gentle-impact", data: "counter-tick", cta: "cta-impact" },
    noVo: { energyBoost: 2, sfxDensity: "rich", ambient: false },
  },
  "noir-spotlight": {
    mood: "dramatic", energy: "medium", tempo: "slow",
    style: ["cinematic", "orchestral", "jazz", "noir"],
    musicKeywords: ["dark cinematic", "noir jazz", "dramatic orchestral", "tension score", "building cinematic", "epic dramatic"],
    sfxPalette: { transition: "light-sweep", ui: "soft-tap", reveal: "product-reveal", data: "counter-tick", cta: "logo-rise" },
    noVo: { energyBoost: 1, sfxDensity: "rich", ambient: true },
  },
  "organic-garden": {
    mood: "warm", energy: "low", tempo: "slow",
    style: ["acoustic", "folk", "organic", "ukulele"],
    musicKeywords: ["warm acoustic", "gentle folk", "handmade organic", "soft ukulele", "cheerful acoustic", "bright folk"],
    sfxPalette: { transition: "card-slide", ui: "soft-tap", reveal: "shimmer", data: "counter-tick", cta: "success" },
    noVo: { energyBoost: 1, sfxDensity: "rich", ambient: true },
  },
  "paper-craft": {
    mood: "handmade", energy: "medium", tempo: "mid",
    style: ["acoustic", "folk", "whimsical", "indie"],
    musicKeywords: ["handmade acoustic", "whimsical folk", "playful indie", "warm handmade", "upbeat acoustic", "cheerful indie"],
    sfxPalette: { transition: "card-slide", ui: "soft-tap", reveal: "shimmer", data: "counter-tick", cta: "success" },
    noVo: { energyBoost: 1, sfxDensity: "rich", ambient: false },
  },
  "paper-tales": {
    mood: "calm", energy: "low", tempo: "slow",
    style: ["acoustic", "piano", "folk", "storytelling"],
    musicKeywords: ["acoustic storytelling", "soft piano", "gentle folk", "calm folk", "warm acoustic", "bright folk"],
    sfxPalette: { transition: "card-slide", ui: "soft-tap", reveal: "shimmer", data: "counter-tick", cta: "success" },
    noVo: { energyBoost: 1, sfxDensity: "rich", ambient: false },
  },
  "poster-pop": {
    mood: "loud", energy: "high", tempo: "fast",
    style: ["pop", "electronic", "punk", "percussion"],
    musicKeywords: ["bold pop", "powerful electronic", "loud percussive", "powerful drums", "high energy pop", "aggressive drive"],
    sfxPalette: { transition: "whoosh", ui: "pop", reveal: "gentle-impact", data: "counter-tick", cta: "cta-impact" },
    noVo: { energyBoost: 2, sfxDensity: "rich", ambient: false },
  },
  "premiere-night": {
    mood: "glamorous", energy: "medium", tempo: "mid",
    style: ["orchestral", "cinematic", "jazz", "swing"],
    musicKeywords: ["red carpet orchestral", "dramatic swing", "cinematic score", "orchestral fanfare", "building orchestral", "epic fanfare"],
    sfxPalette: { transition: "light-sweep", ui: "soft-tap", reveal: "product-reveal", data: "counter-tick", cta: "logo-rise" },
    noVo: { energyBoost: 1, sfxDensity: "rich", ambient: true },
  },
  "prisma-bloc": {
    mood: "modern", energy: "high", tempo: "fast",
    style: ["electronic", "future bass", "tech", "corporate"],
    musicKeywords: ["modern corporate", "technology electronic", "dynamic motion", "digital energetic", "future bass", "driving electronic"],
    sfxPalette: { transition: "card-slide", ui: "pop", reveal: "product-reveal", data: "counter-tick", cta: "cta-impact" },
    noVo: { energyBoost: 2, sfxDensity: "rich", ambient: false },
  },
  // The one pack whose beats are UI events — a cursor click, a callout popping onto a
  // screenshot, an arrow arriving. Bright and unhurried; the SFX mark the annotations.
  "showcase": {
    mood: "optimistic", energy: "medium", tempo: "mid",
    style: ["light electronic", "corporate", "upbeat", "clean"],
    musicKeywords: ["bright corporate", "optimistic tech", "light electronic groove", "product demo underscore", "clean modern pop", "friendly startup"],
    sfxPalette: { transition: "light-sweep", ui: "ui-click", reveal: "pop", data: "counter-tick", cta: "cta-impact" },
    noVo: { energyBoost: 1, sfxDensity: "normal", ambient: false },
  },
  "edition": {
    mood: "serious", energy: "low", tempo: "slow",
    style: ["acoustic", "documentary", "minimal", "orchestral"],
    musicKeywords: ["documentary underscore", "serious underscore", "understated piano", "reflective strings", "minimal acoustic", "thoughtful ambient"],
    sfxPalette: {"transition": "card-slide", "ui": "soft-tap", "reveal": "gentle-impact", "data": "counter-tick", "cta": "logo-rise"},
    noVo: { energyBoost: 0, sfxDensity: "normal", ambient: false },
  },
  "fight": {
    mood: "aggressive", energy: "high", tempo: "fast",
    style: ["trap", "percussion", "electronic", "cinematic"],
    musicKeywords: ["hard trap", "aggressive percussion", "fight entrance", "epic anthem", "heavy drums", "sports anthem"],
    sfxPalette: {"transition": "whoosh", "ui": "pop", "reveal": "gentle-impact", "data": "counter-tick", "cta": "cta-impact"},
    noVo: { energyBoost: 2, sfxDensity: "rich", ambient: false },
  },
  "reel": {
    mood: "energetic", energy: "high", tempo: "fast",
    style: ["pop", "electronic", "hip hop", "upbeat"],
    musicKeywords: ["catchy pop", "upbeat electronic", "social upbeat", "powerful beat", "energetic hip hop", "catchy hook"],
    sfxPalette: {"transition": "whoosh", "ui": "pop", "reveal": "pop", "data": "counter-tick", "cta": "cta-impact"},
    noVo: { energyBoost: 2, sfxDensity: "rich", ambient: false },
  },
  "showcase-vertical": {
    mood: "optimistic", energy: "medium", tempo: "mid",
    style: ["light electronic", "corporate", "upbeat", "clean"],
    musicKeywords: ["bright corporate", "optimistic tech", "light electronic groove", "product demo underscore", "clean modern pop", "friendly startup"],
    sfxPalette: {"transition": "light-sweep", "ui": "ui-click", "reveal": "pop", "data": "counter-tick", "cta": "cta-impact"},
    noVo: { energyBoost: 1, sfxDensity: "normal", ambient: false },
  },
  "flight": {
    mood: "uplifting", energy: "medium", tempo: "mid",
    style: ["cinematic", "orchestral", "electronic", "ambient"],
    musicKeywords: ["uplifting cinematic", "soaring strings", "travel adventure", "hopeful build", "open sky ambient", "inspiring modern"],
    sfxPalette: {"transition": "whoosh", "ui": "soft-tap", "reveal": "product-reveal", "data": "data-ping", "cta": "logo-rise"},
    noVo: { energyBoost: 1, sfxDensity: "normal", ambient: true },
  },
  "flight-vertical": {
    mood: "uplifting", energy: "medium", tempo: "mid",
    style: ["cinematic", "orchestral", "electronic", "ambient"],
    musicKeywords: ["uplifting cinematic", "soaring strings", "travel adventure", "hopeful build", "open sky ambient", "inspiring modern"],
    sfxPalette: {"transition": "whoosh", "ui": "soft-tap", "reveal": "product-reveal", "data": "data-ping", "cta": "logo-rise"},
    noVo: { energyBoost: 1, sfxDensity: "normal", ambient: true },
  },
  "pipeline": {
    mood: "industrious", energy: "medium", tempo: "mid",
    style: ["electronic", "percussive", "industrial", "modern"],
    musicKeywords: ["industrial rhythm", "mechanical groove", "steady percussion", "factory pulse", "technical electronic", "driving mid-tempo"],
    sfxPalette: {"transition": "card-slide", "ui": "ui-click", "reveal": "gentle-impact", "data": "counter-tick", "cta": "cta-impact"},
    noVo: { energyBoost: 1, sfxDensity: "rich", ambient: false },
  },
  "momentum": {
    mood: "driving", energy: "high", tempo: "fast",
    style: ["electronic", "percussive", "rock", "modern"],
    musicKeywords: ["driving electronic", "high energy percussion", "percussive build", "fast modern beat", "aggressive groove", "momentum pulse"],
    sfxPalette: {"transition": "whoosh", "ui": "soft-tap", "reveal": "product-reveal", "data": "counter-tick", "cta": "cta-impact"},
    noVo: { energyBoost: 2, sfxDensity: "rich", ambient: false },
  },
  "deep": {
    mood: "mysterious", energy: "low", tempo: "slow",
    style: ["ambient", "cinematic", "electronic", "atmospheric"],
    musicKeywords: ["deep ambient", "underwater atmosphere", "mysterious cinematic", "slow build", "ethereal pads", "exploration underscore"],
    sfxPalette: {"transition": "light-sweep", "ui": "soft-tap", "reveal": "shimmer", "data": "data-ping", "cta": "logo-rise"},
    noVo: { energyBoost: 1, sfxDensity: "normal", ambient: true },
  },
  "jungle": {
    mood: "playful", energy: "medium", tempo: "mid",
    style: ["acoustic", "world", "percussion", "folk"],
    musicKeywords: ["playful acoustic", "tribal percussion", "adventure folk", "warm marimba", "jungle rhythm", "curious whimsical"],
    sfxPalette: {"transition": "whoosh", "ui": "pop", "reveal": "gentle-impact", "data": "counter-tick", "cta": "success"},
    noVo: { energyBoost: 1, sfxDensity: "rich", ambient: true },
  },
  "drive": {
    mood: "warm", energy: "medium", tempo: "mid",
    style: ["indie", "rock", "electronic", "guitar"],
    musicKeywords: ["sunset drive", "indie road trip", "warm guitar groove", "open highway", "retro synthwave", "easy cruising"],
    sfxPalette: {"transition": "whoosh", "ui": "soft-tap", "reveal": "product-reveal", "data": "counter-tick", "cta": "cta-impact"},
    noVo: { energyBoost: 1, sfxDensity: "normal", ambient: true },
  },
  "fetch": {
    mood: "cheerful", energy: "medium", tempo: "mid",
    style: ["acoustic", "folk", "pop", "ukulele"],
    musicKeywords: ["happy ukulele", "cheerful acoustic", "playful whistle", "sunny folk pop", "light hearted", "feel good strum"],
    sfxPalette: {"transition": "whoosh", "ui": "pop", "reveal": "gentle-impact", "data": "counter-tick", "cta": "success"},
    noVo: { energyBoost: 1, sfxDensity: "rich", ambient: true },
  },
  "teampulse": {
    mood: "warm", energy: "medium", tempo: "mid",
    style: ["indie", "acoustic", "electronic", "modern"],
    musicKeywords: ["warm indie", "modern acoustic groove", "optimistic business", "friendly electronic", "uplifting mid tempo", "human centred"],
    sfxPalette: {"transition": "card-slide", "ui": "soft-tap", "reveal": "pop", "data": "counter-tick", "cta": "cta-impact"},
    noVo: { energyBoost: 1, sfxDensity: "normal", ambient: false },
  },
  "hacker": {
    mood: "tense", energy: "medium", tempo: "mid",
    style: ["electronic", "glitch", "synth", "dark"],
    musicKeywords: ["dark synth", "glitch electronic", "cyber tension", "hacker underscore", "driving techno", "digital pulse"],
    sfxPalette: { transition: "whoosh", ui: "ui-click", reveal: "gentle-impact", data: "data-ping", cta: "cta-impact" },
    noVo: { energyBoost: 1, sfxDensity: "rich", ambient: false },
  },
  "orbit": {
    mood: "epic", energy: "high", tempo: "mid",
    style: ["cinematic", "electronic", "orchestral", "modern"],
    musicKeywords: ["cinematic build", "epic electronic", "rising countdown", "rising tension", "space ambient", "triumphant modern"],
    sfxPalette: { transition: "whoosh", ui: "soft-tap", reveal: "product-reveal", data: "data-ping", cta: "cta-impact" },
    noVo: { energyBoost: 2, sfxDensity: "rich", ambient: true },
  },
  "slab-stage": {
    mood: "kinetic", energy: "high", tempo: "fast",
    style: ["electronic", "percussive", "modern", "driving"],
    musicKeywords: ["driving electronic", "percussive modern", "bold energetic", "driving pulse", "confident drums", "powerful electronic"],
    sfxPalette: { transition: "whoosh", ui: "soft-tap", reveal: "product-reveal", data: "data-ping", cta: "cta-impact" },
    noVo: { energyBoost: 2, sfxDensity: "rich", ambient: false },
  },
  "story-blocks": {
    mood: "underscore", energy: "high", tempo: "fast",
    style: ["electronic", "pop", "percussion", "modern"],
    musicKeywords: ["bold campaign", "modern percussion", "energetic pop", "campaign electronic", "driving beat", "high energy modern"],
    sfxPalette: { transition: "card-slide", ui: "pop", reveal: "gentle-impact", data: "counter-tick", cta: "cta-impact" },
    noVo: { energyBoost: 2, sfxDensity: "rich", ambient: false },
  },
  "terminal-departures": {
    mood: "futuristic", energy: "high", tempo: "fast",
    style: ["synthwave", "electronic", "cyber", "ambient tech"],
    musicKeywords: ["cyber electronic", "futuristic ambient", "terminal atmosphere", "synthwave arpeggio", "driving cyber", "high energy electronic"],
    sfxPalette: { transition: "light-sweep", ui: "ui-click", reveal: "product-reveal", data: "counter-tick", cta: "cta-impact" },
    noVo: { energyBoost: 2, sfxDensity: "rich", ambient: true },
  },
  "vapor-chrome": {
    mood: "retro", energy: "high", tempo: "fast",
    style: ["vaporwave", "synthwave", "electronic", "retro"],
    musicKeywords: ["vaporwave chill", "retro synthwave", "y2k electronic", "neon nostalgia", "driving synthwave", "high energy retro"],
    sfxPalette: { transition: "whoosh", ui: "pop", reveal: "shimmer", data: "data-ping", cta: "cta-impact" },
    noVo: { energyBoost: 2, sfxDensity: "rich", ambient: false },
  },
};

// ---------------------------------------------------------------- archetypes
//
// WHY THESE EXIST. Every pack above hand-authors six keywords. Six is enough to sound like
// something and not enough to sound different twice: the rotation runs out, and the packs
// that share a genre run out onto the same terms. An archetype is a SHARED FLAVOUR POOL
// that widens each pack at both ends of its energy range without touching what makes it
// itself.
//
// WHAT AN ARCHETYPE DELIBERATELY DOES NOT DO: it never contributes GENRE. `style[]` stays
// exactly as each pack authored it, because genre is what music_vocabulary leads queries
// with, and pushing a shared genre list into fifteen luxury packs would make them converge —
// the opposite of the goal. (The "guaranteed floor" the archetype was originally going to
// provide is already guaranteed: audit-music-vocabulary reports 0 dead terms.)
//
// So an archetype supplies COLOUR only: two calmer words at the front, two more driving
// words at the back. musicKeywords are ordered calmest-first, so this widens the pool from
// 6 to 10 AND deepens the driving half that narration-off draws from.
//
// Every word below is validated live by scripts/audit-music-vocabulary.js.
const ARCHETYPES = {
  tech:      { calm: ["atmospheric", "digital"],   driving: ["driving", "powerful"] },
  luxury:    { calm: ["serene", "soft"],           driving: ["dramatic", "rising"] },
  editorial: { calm: ["thoughtful", "reflective"], driving: ["percussive", "build"] },
  hype:      { calm: ["chill", "lofi"],            driving: ["heavy", "loud"] },
  warm:      { calm: ["gentle", "calm"],           driving: ["bright", "happy"] },
  retro:     { calm: ["dreamy", "chill"],          driving: ["fast", "powerful"] },
  corporate: { calm: ["clean", "soft"],            driving: ["uplifting", "dynamic"] },
  groove:    { calm: ["chill", "playful"],         driving: ["drums", "energetic"] },
};

// Derived by scoring each pack's own declared style + keywords against the archetype
// vocabularies, then hand-corrected where the score was a tie or the genre words misled
// (a funk-pop pack scores on "indie" and lands in `warm`, which is a folk pool).
// Corrections: blockframe/motion-canvas/bauhaus-riot/story-blocks -> groove,
// kinetic-bold -> hype.
const ARCHETYPE_OF = {
  "aurora-spectrum": "corporate", "bauhaus-print": "editorial", "bauhaus-riot": "groove",
  "biennale-yellow": "luxury", "blockframe": "groove", "bloom-fable": "warm",
  "bloom-illustrated": "warm", "blueprint-atelier": "tech", "brightlife": "corporate",
  "daybreak-bakehouse": "warm", "deep": "luxury", "drive": "warm", "edition": "editorial",
  "fable-storybook": "warm", "fetch": "warm", "fight": "hype", "flagship": "luxury",
  "flight": "luxury", "flight-vertical": "luxury", "grid-dispatch": "editorial",
  "hacker": "tech", "hype-wave": "hype", "jungle": "warm", "kinetic-bold": "hype",
  "lantern-night": "luxury", "midnight-glass": "tech", "momentum": "tech",
  "mono-corporate": "corporate", "motion-canvas": "groove", "noir-spotlight": "luxury",
  "orbit": "luxury", "organic-garden": "warm", "paper-craft": "warm", "paper-tales": "warm",
  "pipeline": "tech", "poster-pop": "hype", "premiere-night": "luxury",
  "prisma-bloc": "tech", "reel": "hype", "showcase": "corporate",
  "showcase-vertical": "corporate", "slab-stage": "tech", "story-blocks": "groove",
  "teampulse": "corporate", "terminal-departures": "tech", "vapor-chrome": "retro",
};

/**
 * Expand a hand-authored profile with its archetype's colour pool.
 * Order is preserved as calm -> driving, which is the contract pickMusicKeywords relies on.
 */
function resolveProfile(name, profile) {
  const arch = ARCHETYPES[ARCHETYPE_OF[name]];
  if (!arch) return profile;
  const seen = new Set();
  const keep = (list) => list.filter((k) => {
    const t = String(k).toLowerCase();
    if (seen.has(t)) return false;
    seen.add(t);
    return true;
  });
  return {
    ...profile,
    // Named in the manifest so the grouping is visible to a reader of the pack, and
    // assertable by scripts/test-music-diversity.js.
    archetype: ARCHETYPE_OF[name],
    musicKeywords: keep([...arch.calm, ...profile.musicKeywords, ...arch.driving]),
  };
}

// ---------------------------------------------------------------- apply

const check = process.argv.includes("--check");
const packs = fs.readdirSync(FRAMES, { withFileTypes: true })
  .filter((d) => d.isDirectory()).map((d) => d.name).sort();

// THE FILMKIT FAMILY AUTHORS ITS PROFILES IN ITS OWN SINGLE FILE.
//
// The table above exists so a reviewer can read every pack's sound side by side and keep
// them distinguishable — that is the stated reason it is one file rather than N. The 70
// imported FilmKit packs are authored the same way, in
// src/services/film_skins/_metadata.json, which is generated alongside their skins and has
// exactly the same side-by-side property. Reading both here keeps ONE applier and one
// drift check over all 116 packs, instead of leaving 70 of them permanently reported as
// "unprofiled" while their pack.json plainly carries an identity.
const FILM_META = path.resolve(__dirname, "..", "src", "services", "film_skins", "_metadata.json");
const FILM_PROFILES = (() => {
  try {
    const m = JSON.parse(fs.readFileSync(FILM_META, "utf8"));
    const out = {};
    for (const [slug, v] of Object.entries(m)) if (v && v.audio) out[slug] = v.audio;
    return out;
  } catch { return {}; }
})();

// AND SO DOES THE LONG-FORM FAMILY — for a reason worth stating, because it went wrong once.
//
// The 27 lf packs are generated by scripts/gen-lf-packs.js, which stamped their `audio` block
// from a NICHE_AUDIO table holding a single `default` entry, through an audioFor() that took no
// argument. Every one of them shipped byte-identical: same mood sentence, same four genres, same
// ten keywords. Because they were in NEITHER table here, this applier reported all 27 as
// "unprofiled" and walked past them — the warning was printed on every run and read as a to-do
// rather than as the evidence that a whole family had no sound of its own.
//
// Their identities now live in src/services/lf_skins/_audio.json, a sibling of the _manifest.json
// generated beside them, and gen-lf-packs.js reads the SAME file. Registering it here is what
// puts them under `--check`, so a future regeneration that flattened them again would be caught
// as DRIFT instead of passing quietly as "unprofiled".
const LF_AUDIO = path.resolve(__dirname, "..", "src", "services", "lf_skins", "_audio.json");
const LF_PROFILES = (() => {
  try {
    const m = JSON.parse(fs.readFileSync(LF_AUDIO, "utf8"));
    const out = {};
    // `_readme` is documentation living in the data file so it cannot drift away from it; keys
    // starting with "_" are never pack slugs.
    for (const [slug, v] of Object.entries(m)) if (!slug.startsWith("_") && v && v.style) out[slug] = v;
    return out;
  } catch { return {}; }
})();

let written = 0, skipped = 0, drift = 0, unknown = [];
for (const name of packs) {
  const p = path.join(FRAMES, name, "pack.json");
  if (!fs.existsSync(p)) continue;
  const authored = PROFILES[name] || FILM_PROFILES[name] || LF_PROFILES[name];
  if (!authored) { unknown.push(name); continue; }
  const profile = resolveProfile(name, authored);

  const raw = fs.readFileSync(p, "utf8");
  const manifest = JSON.parse(raw);
  const before = JSON.stringify(manifest.audio || null);
  manifest.audio = profile;
  const after = JSON.stringify(manifest.audio);
  if (before === after) { skipped++; continue; }
  if (check) { drift++; console.error(`[audio-profiles] DRIFT ${name}`); continue; }

  // Preserve the file's trailing newline convention.
  fs.writeFileSync(p, JSON.stringify(manifest, null, 2) + (raw.endsWith("\n") ? "\n" : ""), "utf8");
  written++;
}

// A pack with no entry keeps the NEUTRAL profile — today's behaviour, not a break — so
// this is a warning, not a failure. It is still worth saying loudly: an un-profiled pack
// is a template with no audio identity, which is the thing this system exists to fix.
if (unknown.length) console.warn(`[audio-profiles] ${unknown.length} pack(s) have NO profile (they fall back to NEUTRAL): ${unknown.join(", ")}`);

if (check) {
  console.log(`[audio-profiles] check: ${skipped} up to date, ${drift} drifted, ${unknown.length} unprofiled`);
  process.exit(drift ? 1 : 0);
}
console.log(`[audio-profiles] wrote ${written}, unchanged ${skipped}, unprofiled ${unknown.length} (of ${packs.length} packs)`);
