// Pack-aware asset styling — a lightweight bridge until the Phase 3 pack manifest
// supplies these directly from FRAME.md. Maps each frame pack to:
//   photoMod  : extra query words that bias stock photos toward the pack's look
//   iconStyle : the Iconify collection family matching the pack (line/solid/duotone/soft)
//   keywords  : style terms that reward on-style candidates during ranking
//
// A pack not listed here falls back to a NEUTRAL profile (no over-narrowing).

const PACK_STYLE = {
  "blockframe":        { photoMod: "bold graphic pop art",            iconStyle: "solid",   keywords: ["bold", "graphic", "colorful"] },
  "biennale-yellow":   { photoMod: "editorial fine art",              iconStyle: "line",    keywords: ["editorial", "art", "minimal"] },
  "midnight-glass":    { photoMod: "dark moody premium technology",   iconStyle: "duotone", keywords: ["dark", "premium", "tech", "glow"] },
  "noir-spotlight":    { photoMod: "cinematic high contrast dramatic",iconStyle: "solid",   keywords: ["cinematic", "dramatic", "dark"] },
  "vapor-chrome":      { photoMod: "neon synthwave retro future",     iconStyle: "duotone", keywords: ["neon", "retro", "vaporwave", "glow"] },
  "aurora-spectrum":   { photoMod: "gradient aurora abstract",        iconStyle: "duotone", keywords: ["gradient", "abstract", "calm"] },
  "bauhaus-print":     { photoMod: "bauhaus geometric primary color", iconStyle: "solid",   keywords: ["geometric", "poster", "primary"] },
  "kinetic-bold":      { photoMod: "bold minimal high energy",        iconStyle: "solid",   keywords: ["bold", "minimal", "energetic"] },
  "mono-corporate":    { photoMod: "clean minimal professional office",iconStyle: "line",   keywords: ["clean", "professional", "corporate", "minimal"] },
  "bloom-illustrated": { photoMod: "soft illustrated pastel friendly",iconStyle: "soft",    keywords: ["illustrated", "soft", "pastel", "warm"] },
  "longshot-cinema":   { photoMod: "cinematic film still moody",      iconStyle: "line",    keywords: ["cinematic", "film", "moody"] },
  "summit-keynote":    { photoMod: "clean corporate keynote professional", iconStyle: "line", keywords: ["clean", "corporate", "professional"] },
  "prism-launch":      { photoMod: "modern product studio iridescent",iconStyle: "duotone", keywords: ["modern", "studio", "vibrant"] },
  "fable-storybook":   { photoMod: "warm storybook watercolor illustrated", iconStyle: "soft", keywords: ["watercolor", "illustrated", "warm", "soft"] },
};

const NEUTRAL = { photoMod: "", iconStyle: "line", keywords: [] };

function styleFor(framePack) {
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
