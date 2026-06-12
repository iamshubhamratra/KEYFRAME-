// Curated SFX resolution. The script's sfx[] names resolve to the local,
// loudness-normalized library (assets/sfx/, built by scripts/
// build_sfx_library.js) — deterministic, professional, zero randomness.
// Unknown names fall back to the nearest cue by word match, and only as a
// last resort to a live Freesound search.

const fs = require("node:fs");
const path = require("node:path");
const config = require("../config");
const { fetchSfx } = require("./audio_sources");

const SFX_DIR = path.resolve(config.paths.root, "assets", "sfx");

// Synonyms map common script phrasings onto the curated cues.
const ALIASES = {
  whoosh: "whoosh", woosh: "whoosh", sweep: "whoosh", "whoosh transition": "whoosh",
  swoosh: "swoosh", swish: "swoosh", "fast swipe": "swoosh",
  pop: "pop", bubble: "pop", "ui pop": "pop", "pop in": "pop",
  click: "click", tap: "click", "soft click": "click", "ui click": "click",
  riser: "riser", rise: "riser", "build up": "riser", buildup: "riser", build: "riser",
  impact: "impact", boom: "impact", hit: "impact", slam: "impact", "bass drop": "impact",
  sparkle: "sparkle", shimmer: "sparkle", magic: "sparkle", chime: "sparkle", twinkle: "sparkle",
  ding: "ding", bell: "ding", notification: "ding", "success ding": "ding",
  transition: "transition", "cinematic transition": "transition", "scene change": "transition",
};

function available() {
  try { return fs.readdirSync(SFX_DIR).filter((f) => f.endsWith(".mp3")).map((f) => f.replace(/\.mp3$/, "")); }
  catch { return []; }
}

// Resolve a free-text sfx name to a curated cue name, or null.
function resolveCue(name) {
  const lib = new Set(available());
  if (!lib.size) return null;
  const n = String(name || "").toLowerCase().trim();
  if (lib.has(n)) return n;
  if (ALIASES[n] && lib.has(ALIASES[n])) return ALIASES[n];
  // Word-level match: any word of the request that maps to a cue.
  for (const word of n.split(/[^a-z]+/)) {
    if (lib.has(word)) return word;
    if (ALIASES[word] && lib.has(ALIASES[word])) return ALIASES[word];
  }
  return null;
}

// Get a playable file for an sfx request. Curated first; live search last.
async function getSfx({ name, outputPath, tracker }) {
  const cue = resolveCue(name);
  if (cue) {
    const src = path.join(SFX_DIR, `${cue}.mp3`);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.copyFileSync(src, outputPath);
    return outputPath;
  }
  console.warn(`[sfx] "${name}" not in curated library — falling back to live search`);
  return fetchSfx({ query: name, outputPath, tracker });
}

function vocabulary() { return available(); }

module.exports = { getSfx, resolveCue, vocabulary };
