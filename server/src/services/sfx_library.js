// Curated SFX resolution. The script's sfx[] names resolve to the local,
// loudness-normalized library (assets/sfx/, built by scripts/
// build_sfx_library.js) — deterministic, professional, zero randomness.
// Unknown names fall back to the nearest cue by word match, and only as a
// last resort to a live Freesound search.

const fs = require("node:fs");
const path = require("node:path");
const config = require("../config");
const { fetchSfx } = require("./audio_sources");
const { CUES, resolveIntent, conditionCue } = require("./audio_cues");

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

// Get a playable file for a cue.
//
// CURATED FIRST — restoring this module's own stated contract. The previous order asked
// Pixabay for the word first and fell back to the library only when the web was dry, so
// the sound of a "whoosh" was literally the first search hit for "whoosh": different every
// run, arbitrary character, and ungated (the Pixabay path checked `minBytes: 2000` and
// nothing else). That single inversion is the origin of "random / generic / inconsistent"
// sound design. See AUDIO-AUDIT-2026-07-28.md §0.
//
// `name` may be a script's free-text cue OR an intent from audio_cues.CUES. Either way it
// resolves to an INTENT first, so the file chosen is decided by meaning, not by keyword.
//
// Whatever the source, the file is then CONDITIONED (peak-normalized, de-silenced,
// bounded, edge-faded) so the director's dB decisions mean the same thing for every cue —
// including fixing the shipped library's own defect, where `impact` measured 8 dB below
// every other cue.
async function getSfx({ name, outputPath, tracker, allowWeb = true }) {
  const intent = resolveIntent(name);
  const spec = intent ? CUES[intent] : null;
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  // 1) the curated cue for this intent
  if (spec) {
    const src = path.join(SFX_DIR, `${spec.file}.mp3`);
    try {
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, outputPath);
        const c = await conditionCue(outputPath, intent);
        if (c.ok) return outputPath;
        console.warn(`[sfx] curated "${spec.file}" rejected by conditioning: ${c.reason}`);
      }
    } catch (e) { console.warn(`[sfx] curated copy failed for "${intent}": ${e.message}`); }
  }

  // 2) the web, as a FALLBACK, and only for a cue we understand well enough to search for
  if (allowWeb) {
    const query = (spec && spec.query) || String(name || "").trim();
    if (query) {
      const got = await fetchSfx({ query, outputPath, tracker }).catch(() => null);
      if (got) {
        const c = await conditionCue(outputPath, intent || "whoosh");
        if (c.ok) {
          console.log(`[sfx] "${name}" → web "${query}"${c.conditioned ? ` (conditioned ${c.gainDb > 0 ? "+" : ""}${c.gainDb} dB)` : ""}`);
          return outputPath;
        }
        // A fetched file that conditions out as silence is worse than no cue at all.
        console.warn(`[sfx] web cue for "${query}" rejected: ${c.reason}`);
        try { fs.unlinkSync(outputPath); } catch { /* noop */ }
      }
    }
  }
  return null;
}

function vocabulary() { return available(); }

module.exports = { getSfx, resolveCue, vocabulary };
