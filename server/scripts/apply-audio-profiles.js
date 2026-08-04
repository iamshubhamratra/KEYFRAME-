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
  "ai-laboratory": {
    mood: "clinical", energy: "high", tempo: "fast",
    style: ["electronic", "techno", "ambient tech", "idm"],
    musicKeywords: ["ambient technology", "research laboratory", "electronic minimal", "neural tech", "driving electronic", "dark techno pulse"],
    sfxPalette: { transition: "light-sweep", ui: "data-ping", reveal: "product-reveal", data: "counter-tick", cta: "cta-impact" },
    noVo: { energyBoost: 1, sfxDensity: "rich", ambient: true },
  },
  "aurora-motion": {
    mood: "dreamy", energy: "medium", tempo: "mid",
    style: ["ambient", "chillout", "cinematic", "downtempo"],
    musicKeywords: ["ambient dreamy", "soft cinematic pad", "atmospheric chillout", "aurora ambient", "flowing electronic", "uplifting ambient"],
    sfxPalette: { transition: "light-sweep", ui: "soft-tap", reveal: "shimmer", data: "data-ping", cta: "logo-rise" },
    noVo: { energyBoost: 1, sfxDensity: "rich", ambient: true },
  },
  "aurora-spectrum": {
    mood: "calm", energy: "medium", tempo: "mid",
    style: ["ambient", "electronic", "corporate", "chillout"],
    musicKeywords: ["calm ambient", "soft electronic", "modern corporate", "gradient chillout", "uplifting technology", "flowing electronic"],
    sfxPalette: { transition: "light-sweep", ui: "soft-tap", reveal: "shimmer", data: "data-ping", cta: "logo-rise" },
    noVo: { energyBoost: 1, sfxDensity: "rich", ambient: true },
  },
  "bauhaus-print": {
    mood: "minimal", energy: "medium", tempo: "mid",
    style: ["minimal", "abstract", "jazz", "experimental"],
    musicKeywords: ["minimal abstract", "modern creative", "geometric ambient", "playful minimal", "upbeat minimal", "abstract percussion"],
    sfxPalette: { transition: "card-slide", ui: "pop", reveal: "gentle-impact", data: "counter-tick", cta: "cta-impact" },
    noVo: { energyBoost: 1, sfxDensity: "rich", ambient: false },
  },
  "bauhaus-riot": {
    mood: "bold", energy: "high", tempo: "fast",
    style: ["minimal", "abstract", "percussion", "modern"],
    musicKeywords: ["modern creative", "abstract minimal", "playful geometric", "rhythmic percussion", "bold upbeat", "driving abstract"],
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
    musicKeywords: ["upbeat pop", "playful funk", "quirky indie", "bright energetic", "punchy pop", "high energy funk"],
    sfxPalette: { transition: "whoosh", ui: "pop", reveal: "gentle-impact", data: "counter-tick", cta: "cta-impact" },
    noVo: { energyBoost: 2, sfxDensity: "rich", ambient: false },
  },
  "bloom-fable": {
    mood: "gentle", energy: "low", tempo: "slow",
    style: ["acoustic", "folk", "ukulele", "storytelling"],
    musicKeywords: ["gentle acoustic", "soft ukulele", "storybook folk", "warm acoustic", "cheerful folk", "bright acoustic"],
    sfxPalette: { transition: "card-slide", ui: "soft-tap", reveal: "shimmer", data: "counter-tick", cta: "success" },
    noVo: { energyBoost: 1, sfxDensity: "rich", ambient: false },
  },
  "bloom-illustrated": {
    mood: "friendly", energy: "medium", tempo: "mid",
    style: ["acoustic", "indie pop", "corporate", "warm"],
    musicKeywords: ["warm acoustic", "friendly corporate", "soft indie pop", "optimistic acoustic", "upbeat friendly", "bright indie pop"],
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
    musicKeywords: ["warm acoustic morning", "gentle folk", "soft cafe jazz", "artisan acoustic", "cheerful morning", "upbeat acoustic"],
    sfxPalette: { transition: "card-slide", ui: "soft-tap", reveal: "shimmer", data: "counter-tick", cta: "success" },
    noVo: { energyBoost: 1, sfxDensity: "rich", ambient: true },
  },
  "digital-universe": {
    mood: "futuristic", energy: "high", tempo: "fast",
    style: ["electronic", "synthwave", "tech", "cinematic"],
    musicKeywords: ["digital electronic", "futuristic technology", "cinematic electronic", "data pulse", "driving synth", "high energy electronic"],
    sfxPalette: { transition: "light-sweep", ui: "data-ping", reveal: "product-reveal", data: "counter-tick", cta: "cta-impact" },
    noVo: { energyBoost: 2, sfxDensity: "rich", ambient: true },
  },
  "editorial-motion": {
    mood: "refined", energy: "medium", tempo: "mid",
    style: ["jazz", "piano", "editorial", "acoustic"],
    musicKeywords: ["refined piano", "editorial jazz", "elegant acoustic", "sophisticated minimal", "upbeat jazz", "driving editorial"],
    sfxPalette: { transition: "card-slide", ui: "soft-tap", reveal: "gentle-impact", data: "counter-tick", cta: "logo-rise" },
    noVo: { energyBoost: 1, sfxDensity: "rich", ambient: false },
  },
  "fable-storybook": {
    mood: "warm", energy: "low", tempo: "slow",
    style: ["acoustic", "folk", "storytelling", "orchestral"],
    musicKeywords: ["soft storytelling", "gentle acoustic", "warm folk", "whimsical orchestral", "cheerful folk", "bright storybook"],
    sfxPalette: { transition: "card-slide", ui: "soft-tap", reveal: "shimmer", data: "counter-tick", cta: "success" },
    noVo: { energyBoost: 1, sfxDensity: "normal", ambient: false },
  },
  "flagship": {
    mood: "premium", energy: "medium", tempo: "mid",
    style: ["cinematic", "electronic", "ambient", "corporate"],
    musicKeywords: ["premium cinematic", "dark modern technology", "ambient electronic", "keynote cinematic", "driving cinematic", "epic technology"],
    sfxPalette: { transition: "light-sweep", ui: "soft-tap", reveal: "product-reveal", data: "counter-tick", cta: "logo-rise" },
    noVo: { energyBoost: 1, sfxDensity: "rich", ambient: false },
  },
  "grid-dispatch": {
    mood: "precise", energy: "medium", tempo: "mid",
    style: ["minimal", "editorial", "documentary", "electronic"],
    musicKeywords: ["minimal electronic", "documentary underscore", "precise rhythmic", "modern corporate clean", "understated tension", "editorial pulse"],
    sfxPalette: { transition: "card-slide", ui: "ui-click", reveal: "gentle-impact", data: "counter-tick", cta: "cta-impact" },
    noVo: { energyBoost: 1, sfxDensity: "normal", ambient: false },
  },
  "glass-dimension": {
    mood: "premium", energy: "medium", tempo: "mid",
    style: ["ambient", "electronic", "chillout", "modern"],
    musicKeywords: ["ambient premium", "soft electronic", "frosted chillout", "modern atmospheric", "flowing electronic", "uplifting modern"],
    sfxPalette: { transition: "light-sweep", ui: "soft-tap", reveal: "shimmer", data: "data-ping", cta: "logo-rise" },
    noVo: { energyBoost: 1, sfxDensity: "rich", ambient: true },
  },
  "hype-wave": {
    mood: "hype", energy: "high", tempo: "fast",
    style: ["hip hop", "trap", "pop", "electronic"],
    musicKeywords: ["upbeat pop", "energetic hip hop", "youth anthem", "punchy trap", "high energy hype", "driving beat"],
    sfxPalette: { transition: "whoosh", ui: "pop", reveal: "product-reveal", data: "counter-tick", cta: "cta-impact" },
    noVo: { energyBoost: 2, sfxDensity: "rich", ambient: false },
  },
  "kinetic-bold": {
    mood: "bold", energy: "high", tempo: "fast",
    style: ["electronic", "rock", "percussion", "modern"],
    musicKeywords: ["bold modern", "punchy electronic", "kinetic percussion", "driving rock", "high energy electronic", "aggressive beat"],
    sfxPalette: { transition: "whoosh", ui: "pop", reveal: "gentle-impact", data: "counter-tick", cta: "cta-impact" },
    noVo: { energyBoost: 2, sfxDensity: "rich", ambient: false },
  },
  "kinetic-universe": {
    mood: "cosmic", energy: "high", tempo: "fast",
    style: ["cinematic", "electronic", "ambient", "space"],
    musicKeywords: ["cosmic ambient", "space cinematic", "deep electronic", "epic cinematic", "driving electronic", "powerful trailer"],
    sfxPalette: { transition: "light-sweep", ui: "data-ping", reveal: "product-reveal", data: "counter-tick", cta: "logo-rise" },
    noVo: { energyBoost: 2, sfxDensity: "rich", ambient: true },
  },
  "lantern-night": {
    mood: "serene", energy: "low", tempo: "slow",
    style: ["ambient", "acoustic", "world", "cinematic"],
    musicKeywords: ["serene ambient", "warm night acoustic", "gentle world", "soft cinematic", "uplifting ambient", "flowing acoustic"],
    sfxPalette: { transition: "light-sweep", ui: "soft-tap", reveal: "shimmer", data: "counter-tick", cta: "logo-rise" },
    noVo: { energyBoost: 1, sfxDensity: "rich", ambient: true },
  },
  "living-city": {
    mood: "nocturnal", energy: "high", tempo: "fast",
    style: ["synthwave", "electronic", "lofi", "cyberpunk"],
    musicKeywords: ["night city lofi", "neon synthwave", "urban electronic", "cyberpunk atmosphere", "driving synthwave", "high energy neon"],
    sfxPalette: { transition: "whoosh", ui: "data-ping", reveal: "product-reveal", data: "counter-tick", cta: "cta-impact" },
    noVo: { energyBoost: 2, sfxDensity: "rich", ambient: true },
  },
  "longshot-cinema": {
    mood: "cinematic", energy: "medium", tempo: "slow",
    style: ["cinematic", "orchestral", "ambient", "score"],
    musicKeywords: ["cinematic score", "slow orchestral", "atmospheric film", "tension cinematic", "building orchestral", "epic cinematic"],
    sfxPalette: { transition: "light-sweep", ui: "soft-tap", reveal: "gentle-impact", data: "counter-tick", cta: "logo-rise" },
    noVo: { energyBoost: 1, sfxDensity: "rich", ambient: true },
  },
  "midnight-glass": {
    mood: "premium", energy: "medium", tempo: "mid",
    style: ["electronic", "ambient", "tech", "deep house"],
    musicKeywords: ["dark premium tech", "cinematic ambient", "deep electronic", "nocturnal modern", "driving deep house", "energetic technology"],
    sfxPalette: { transition: "light-sweep", ui: "data-ping", reveal: "product-reveal", data: "counter-tick", cta: "logo-rise" },
    noVo: { energyBoost: 1, sfxDensity: "rich", ambient: false },
  },
  "minimal-luxury": {
    mood: "refined", energy: "low", tempo: "slow",
    style: ["piano", "ambient", "classical", "minimal"],
    musicKeywords: ["minimal piano", "refined ambient", "quiet luxury", "elegant classical", "uplifting minimal", "flowing piano"],
    sfxPalette: { transition: "light-sweep", ui: "soft-tap", reveal: "shimmer", data: "counter-tick", cta: "logo-rise" },
    // energyBoost 0 — restraint IS this pack's identity. Vast negative space and quiet
    // motion do not become punchy because nobody is talking; the mix still opens up
    // (music target rises, duck bypassed), but the track stays as quiet as the picture.
    noVo: { energyBoost: 0, sfxDensity: "normal", ambient: false },
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
  "nature-flow": {
    mood: "calm", energy: "low", tempo: "slow",
    style: ["acoustic", "ambient", "organic", "world"],
    musicKeywords: ["calm nature ambient", "organic acoustic", "gentle wellness", "soft ambient", "uplifting organic", "flowing acoustic"],
    sfxPalette: { transition: "light-sweep", ui: "soft-tap", reveal: "shimmer", data: "counter-tick", cta: "success" },
    noVo: { energyBoost: 1, sfxDensity: "rich", ambient: true },
  },
  "neo-dashboard": {
    mood: "technical", energy: "medium", tempo: "mid",
    style: ["electronic", "tech", "corporate", "minimal"],
    musicKeywords: ["modern technology", "clean electronic", "saas corporate", "data driven tech", "driving electronic", "energetic technology"],
    sfxPalette: { transition: "light-sweep", ui: "ui-click", reveal: "product-reveal", data: "counter-tick", cta: "cta-impact" },
    noVo: { energyBoost: 1, sfxDensity: "rich", ambient: false },
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
    musicKeywords: ["handmade acoustic", "whimsical folk", "playful indie", "warm papercraft", "upbeat acoustic", "cheerful indie"],
    sfxPalette: { transition: "card-slide", ui: "soft-tap", reveal: "shimmer", data: "counter-tick", cta: "success" },
    noVo: { energyBoost: 1, sfxDensity: "rich", ambient: false },
  },
  "paper-tales": {
    mood: "calm", energy: "low", tempo: "slow",
    style: ["acoustic", "piano", "folk", "storytelling"],
    musicKeywords: ["acoustic storytelling", "soft piano", "gentle folk", "calm storybook", "warm acoustic", "bright folk"],
    sfxPalette: { transition: "card-slide", ui: "soft-tap", reveal: "shimmer", data: "counter-tick", cta: "success" },
    noVo: { energyBoost: 1, sfxDensity: "rich", ambient: false },
  },
  "poster-pop": {
    mood: "loud", energy: "high", tempo: "fast",
    style: ["pop", "electronic", "punk", "percussion"],
    musicKeywords: ["bold pop", "punchy electronic", "loud kinetic", "statement beat", "high energy pop", "aggressive drive"],
    sfxPalette: { transition: "whoosh", ui: "pop", reveal: "gentle-impact", data: "counter-tick", cta: "cta-impact" },
    noVo: { energyBoost: 2, sfxDensity: "rich", ambient: false },
  },
  "premiere-night": {
    mood: "glamorous", energy: "medium", tempo: "mid",
    style: ["orchestral", "cinematic", "jazz", "swing"],
    musicKeywords: ["red carpet orchestral", "glamorous swing", "cinematic score", "premiere fanfare", "building orchestral", "epic fanfare"],
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
  "prism-launch": {
    mood: "modern", energy: "medium", tempo: "mid",
    style: ["electronic", "corporate", "modern", "pop"],
    musicKeywords: ["modern studio", "clean product", "bright electronic", "corporate launch", "upbeat modern", "energetic launch"],
    sfxPalette: { transition: "light-sweep", ui: "soft-tap", reveal: "product-reveal", data: "counter-tick", cta: "logo-rise" },
    noVo: { energyBoost: 1, sfxDensity: "rich", ambient: false },
  },
  "product-showcase": {
    mood: "premium", energy: "medium", tempo: "mid",
    style: ["cinematic", "electronic", "commercial", "corporate"],
    musicKeywords: ["premium commercial", "product cinematic", "modern advertising", "studio electronic", "driving commercial", "epic product"],
    sfxPalette: { transition: "light-sweep", ui: "soft-tap", reveal: "product-reveal", data: "counter-tick", cta: "cta-impact" },
    noVo: { energyBoost: 2, sfxDensity: "rich", ambient: false },
  },
  "retro-future": {
    mood: "retro", energy: "high", tempo: "fast",
    style: ["synthwave", "retrowave", "outrun", "electronic"],
    musicKeywords: ["synthwave retro", "80s electronic", "outrun neon", "retrowave arpeggio", "driving synthwave", "high energy outrun"],
    sfxPalette: { transition: "whoosh", ui: "data-ping", reveal: "product-reveal", data: "counter-tick", cta: "cta-impact" },
    noVo: { energyBoost: 2, sfxDensity: "rich", ambient: true },
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
    musicKeywords: ["documentary underscore", "serious editorial", "understated piano", "reflective strings", "minimal acoustic", "thoughtful ambient"],
    sfxPalette: {"transition": "card-slide", "ui": "soft-tap", "reveal": "gentle-impact", "data": "counter-tick", "cta": "logo-rise"},
    noVo: { energyBoost: 0, sfxDensity: "normal", ambient: false },
  },
  "fight": {
    mood: "aggressive", energy: "high", tempo: "fast",
    style: ["trap", "percussion", "electronic", "cinematic"],
    musicKeywords: ["hard trap", "aggressive percussion", "fight entrance", "epic hype", "heavy drums", "sports anthem"],
    sfxPalette: {"transition": "whoosh", "ui": "pop", "reveal": "gentle-impact", "data": "counter-tick", "cta": "cta-impact"},
    noVo: { energyBoost: 2, sfxDensity: "rich", ambient: false },
  },
  "reel": {
    mood: "energetic", energy: "high", tempo: "fast",
    style: ["pop", "electronic", "hip hop", "upbeat"],
    musicKeywords: ["viral pop", "upbeat electronic", "social trending", "punchy beat", "energetic hip hop", "catchy hook"],
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
    musicKeywords: ["driving electronic", "high energy percussion", "kinetic build", "fast modern beat", "aggressive groove", "momentum pulse"],
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
    style: ["indie", "rock", "electronic", "americana"],
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
    musicKeywords: ["warm indie", "modern acoustic groove", "optimistic workplace", "friendly electronic", "uplifting mid tempo", "human centred"],
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
    musicKeywords: ["cinematic build", "epic electronic", "launch countdown", "rising tension", "space ambient", "triumphant modern"],
    sfxPalette: { transition: "whoosh", ui: "soft-tap", reveal: "product-reveal", data: "data-ping", cta: "cta-impact" },
    noVo: { energyBoost: 2, sfxDensity: "rich", ambient: true },
  },
  "slab-stage": {
    mood: "kinetic", energy: "high", tempo: "fast",
    style: ["electronic", "percussive", "modern", "driving"],
    musicKeywords: ["driving electronic", "percussive modern", "bold energetic", "kinetic pulse", "confident drums", "punchy electronic"],
    sfxPalette: { transition: "whoosh", ui: "soft-tap", reveal: "product-reveal", data: "data-ping", cta: "cta-impact" },
    noVo: { energyBoost: 2, sfxDensity: "rich", ambient: false },
  },
  "story-blocks": {
    mood: "editorial", energy: "high", tempo: "fast",
    style: ["electronic", "pop", "percussion", "modern"],
    musicKeywords: ["bold editorial", "modern percussion", "kinetic pop", "campaign electronic", "driving beat", "high energy modern"],
    sfxPalette: { transition: "card-slide", ui: "pop", reveal: "gentle-impact", data: "counter-tick", cta: "cta-impact" },
    noVo: { energyBoost: 2, sfxDensity: "rich", ambient: false },
  },
  "summit-keynote": {
    mood: "professional", energy: "medium", tempo: "mid",
    style: ["corporate", "orchestral", "ambient", "piano"],
    musicKeywords: ["executive corporate", "professional ambient", "confident piano", "keynote corporate", "uplifting corporate", "driving business"],
    sfxPalette: { transition: "light-sweep", ui: "soft-tap", reveal: "gentle-impact", data: "counter-tick", cta: "logo-rise" },
    noVo: { energyBoost: 1, sfxDensity: "rich", ambient: false },
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

// ---------------------------------------------------------------- apply

const check = process.argv.includes("--check");
const packs = fs.readdirSync(FRAMES, { withFileTypes: true })
  .filter((d) => d.isDirectory()).map((d) => d.name).sort();

let written = 0, skipped = 0, drift = 0, unknown = [];
for (const name of packs) {
  const p = path.join(FRAMES, name, "pack.json");
  if (!fs.existsSync(p)) continue;
  const profile = PROFILES[name];
  if (!profile) { unknown.push(name); continue; }

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
