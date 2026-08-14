// Pack-aware asset styling — a lightweight bridge until the Phase 3 pack manifest
// supplies these directly from FRAME.md. Maps each frame pack to:
//   photoMod  : extra query words that bias stock photos toward the pack's look
//   iconStyle : the Iconify collection family matching the pack (line/solid/duotone/soft)
//   keywords  : style terms that reward on-style candidates during ranking
//
// A pack not listed here falls back to a NEUTRAL profile (no over-narrowing).

// EMPTY BY DESIGN since the eleven packs it described were removed. Every row named one of
// them. The table and the NEUTRAL fallback below are kept because that fallback is the
// documented behaviour for any unlisted pack — a pack with no row simply gets no photo
// modifier and no style keywords, which is what the ~120 packs never listed here always got.
const PACK_STYLE = {};

const NEUTRAL = { photoMod: "", iconStyle: "line", keywords: [] };

// The pack manifest (frames/<pack>/pack.json) is the source of truth for a pack's
// asset-styling bias (Phase 3). Read it first; fall back to the hardcoded
// PACK_STYLE table (from which the manifest was extracted) for any pack that ships
// no manifest, then to a neutral profile. Required lazily to avoid a require cycle
// and so a missing frames dir degrades gracefully.
function styleFor(framePack) {
  if (framePack && framePack !== "auto") {
    try {
      const a = require("./frame_manifest").getManifest(framePack)?.assets;
      if (a) return { photoMod: a.photoMod, iconStyle: a.iconStyle, keywords: a.keywords };
    } catch { /* fall through to legacy table */ }
  }
  return PACK_STYLE[framePack] || NEUTRAL;
}

// Choose a hex color to recolor Iconify icons with, from a pack's tokens
// (frame_registry.getPackTokens → { colors: {name: "#HEX"} }). Prefers an
// accent/brand color, then ink/text, then any color. null when no tokens.
function iconColorFor(packTokens) {
  if (!packTokens || !packTokens.colors) return null;
  const colors = packTokens.colors;
  const keys = Object.keys(colors);
  const byName = (re) => keys.find((k) => re.test(k));
  const key = byName(/accent|primary|brand|amber|gold|beam|ember|highlight/i)
    || byName(/ink|text|fg|foreground/i);
  const vals = Object.values(colors);
  return (key && colors[key]) || vals[1] || vals[0] || null;
}

module.exports = { styleFor, iconColorFor, PACK_STYLE };
