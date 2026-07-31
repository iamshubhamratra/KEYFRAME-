// Visual FAMILIES for the frame packs — the layer the auto-picker's anti-repeat
// was missing. The brief's tone→pack table rotates by pack NAME, but for a run
// of same-subject films (e.g. several SaaS launches) it keeps landing in the
// same *visual family* (bright-minimal SaaS, or dark-premium tech), so the films
// read as "the same style" even though the pack name differs. Grouping packs by
// how they actually READ on screen lets the picker force cross-family variety.
//
// Fail-open by design: a pack not in the table is classified from its vibe text,
// and if that's inconclusive it becomes its own family (so unknown packs are
// always treated as "different" — they never block, and are never wrongly blocked).

const FAMILY_OF = {
  // bright-minimal — white/light grounds, clean product-UI look. THESE are the
  // ones that read alike; grouping them means rotation leaves the whole set.
  "nimbus-saas": "bright-minimal", "mint-launch": "bright-minimal",
  "liquid-glass": "bright-minimal", "bloom-illustrated": "bright-minimal",
  "lumen-motion": "bright-minimal", "mono-corporate": "bright-minimal",
  "prism-launch": "bright-minimal", "summit-keynote": "bright-minimal",

  // dark-premium — dark cinematic tech / fintech / product reveal.
  "flagship": "dark-premium", "brightlife": "dark-premium",
  "midnight-glass": "dark-premium", "ledger-noir": "dark-premium",
  "vault-gold": "dark-premium", "noir-spotlight": "dark-premium",
  "nova-launch": "dark-premium", "neon-premiere": "dark-premium",
  "abyssal-glow": "dark-premium", "aurora-spectrum": "dark-premium",
  "lantern-night": "dark-premium",

  // cinema — letterboxed, one-take, filmic staging.
  "longshot-cinema": "cinema", "terminal-departures": "cinema",
  "premiere-night": "cinema",

  // poster-loud — bold brutalist / risograph / kinetic-type posters.
  "blockframe": "poster-loud", "bauhaus-riot": "poster-loud",
  "bauhaus-print": "poster-loud", "broadside": "poster-loud",
  "bold-poster": "poster-loud", "brut-pop": "poster-loud",
  "coral": "poster-loud", "creative-mode": "poster-loud",
  "kinetic-bold": "poster-loud", "riso-press": "poster-loud",
  "cobalt-grid": "poster-loud",
  "hype-wave": "poster-loud", "poster-pop": "poster-loud", "story-blocks": "poster-loud",

  // editorial-quiet — serif/museum/print, warm paper, analyst-restrained.
  "atelier": "editorial-quiet", "cartesian": "editorial-quiet",
  "capsule": "editorial-quiet", "biennale-yellow": "editorial-quiet",
  "flux-analytics": "editorial-quiet", "signal-mono": "editorial-quiet",
  "blueprint-atelier": "editorial-quiet",

  // story-handmade — storybook / craft / illustrated / ink / artisanal.
  "daybreak-bakehouse": "story-handmade", "organic-garden": "story-handmade",
  "bloom-fable": "story-handmade", "fable-storybook": "story-handmade",
  "paper-tales": "story-handmade", "folk-stitch": "story-handmade",
  "claymotion": "story-handmade", "sketchnote": "story-handmade",
  "sumi-kaze": "story-handmade", "care-lavender": "story-handmade",
  "care-mint": "story-handmade", "orrery-brass": "story-handmade",

  // retro-terminal — CRT terminal / Y2K chrome.
  "terminal-amber": "retro-terminal", "terminal-green": "retro-terminal",
  "vapor-chrome": "retro-terminal",
};

// When rotating AWAY from a family, prefer the next family down this list that
// still has an available pack — ordered to keep the swap tonally plausible
// (professional families first for the professional ones; niche looks last).
const ROTATE_TO = {
  "bright-minimal": ["dark-premium", "editorial-quiet", "poster-loud", "cinema", "retro-terminal", "story-handmade"],
  "dark-premium":   ["bright-minimal", "cinema", "editorial-quiet", "poster-loud", "retro-terminal", "story-handmade"],
  "cinema":         ["dark-premium", "bright-minimal", "editorial-quiet", "poster-loud", "retro-terminal", "story-handmade"],
  "poster-loud":    ["editorial-quiet", "bright-minimal", "dark-premium", "story-handmade", "retro-terminal", "cinema"],
  "editorial-quiet":["poster-loud", "bright-minimal", "story-handmade", "dark-premium", "cinema", "retro-terminal"],
  "story-handmade": ["editorial-quiet", "poster-loud", "bright-minimal", "dark-premium", "cinema", "retro-terminal"],
  "retro-terminal": ["dark-premium", "poster-loud", "bright-minimal", "cinema", "editorial-quiet", "story-handmade"],
};

// Keyword fallback for a pack we don't have in FAMILY_OF (a future pack). Reads
// its vibe blurb. Returns null when inconclusive (caller uses pack name as family).
function classifyByVibe(vibe) {
  const v = String(vibe || "").toLowerCase();
  if (!v) return null;
  if (/terminal|crt|y2k|retro-?futur|monospace/.test(v)) return "retro-terminal";
  if (/storybook|fable|clay|stitch|embroider|sketch|sumi|watercolo|hand-?drawn|pop-?up|orrery|care/.test(v)) return "story-handmade";
  if (/brutalist|risograph|poster|kinetic|sticker|protest/.test(v)) return "poster-loud";
  if (/one-take|letterbox|cinema|departures hall/.test(v)) return "cinema";
  if (/editorial|museum|gallery|serif|parchment|analyst|chart-first|blueprint|catalog/.test(v)) return "editorial-quiet";
  if (/dark|noir|midnight|deep-?space|near-?black|glassmorph|nocturnal|fintech|bioluminescent/.test(v)) return "dark-premium";
  if (/saas|near-white|studio light|gallery white|porcelain|clean minimal|bright/.test(v)) return "bright-minimal";
  return null;
}

function familyOf(name, vibe) {
  if (!name) return "misc";
  return FAMILY_OF[name] || classifyByVibe(vibe) || `solo:${name}`;
}

// The families of a list of recent pack names, most-recent first, de-duped.
function familiesOf(names, vibeFor) {
  const out = [];
  for (const n of names || []) {
    const f = familyOf(n, vibeFor && vibeFor(n));
    if (!out.includes(f)) out.push(f);
  }
  return out;
}

/**
 * Pick a pack in a DIFFERENT family than the last film, keeping the look varied.
 *   requested       — the pack the brief LLM chose (may repeat last film's family)
 *   installed        — available pack names
 *   recentPacks      — recently-used pack names, most-recent first
 *   seed             — string (prompt) → deterministic, stable choice
 *   vibeFor(name)    — optional: pack name → vibe blurb, for the fallback classifier
 * Returns a different-family pack name, or null if none is needed / possible
 * (null ⇒ keep `requested`).
 */
function pickCrossFamily({ requested, installed, recentPacks = [], seed = "kf", vibeFor }) {
  if (!requested || !installed || !installed.length) return null;
  const lastPack = recentPacks[0];
  if (!lastPack) return null; // nothing to differ from
  const lastFam = familyOf(lastPack, vibeFor && vibeFor(lastPack));
  const reqFam = familyOf(requested, vibeFor && vibeFor(requested));
  if (reqFam !== lastFam) return null; // already different — honor the LLM's pick

  const recentFams = new Set(familiesOf(recentPacks, vibeFor));
  const famOfInstalled = (n) => familyOf(n, vibeFor && vibeFor(n));

  // Preference order: rotate-to families, dropping any used recently; then any
  // remaining family. First family with an available pack wins.
  const order = (ROTATE_TO[reqFam] || []).filter((f) => !recentFams.has(f));
  const seen = new Set(order);
  for (const n of installed) {
    const f = famOfInstalled(n);
    if (f !== reqFam && !recentFams.has(f) && !seen.has(f)) { order.push(f); seen.add(f); }
  }

  let h = 0; const s = String(seed);
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;

  for (const fam of order) {
    const pool = installed.filter((n) => famOfInstalled(n) === fam);
    if (pool.length) return pool[h % pool.length];
  }
  // Last resort: any installed pack outside the requested family.
  const anyOther = installed.filter((n) => famOfInstalled(n) !== reqFam);
  return anyOther.length ? anyOther[h % anyOther.length] : null;
}

module.exports = { FAMILY_OF, ROTATE_TO, familyOf, familiesOf, pickCrossFamily };
