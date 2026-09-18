// BRAND & LANGUAGE VOCABULARY for AI Video Edit.
//
// BRAND_PRESETS are the studio-owned palettes (same six the Create screen offers, so a person's
// "Ocean" means the same colours in both modes). LANGUAGES mirrors server/src/services/
// caption_lang.js — code, English name, native name and writing direction — because captions in
// Arabic are right-to-left and every caption input must carry the right `dir`. Keep in step with
// the server; GET /capabilities returns the authoritative list and wins when present.

export const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export const BRAND_PRESETS = Object.freeze([
  Object.freeze({ id: "ocean", label: "Ocean", primary: "#3b82f6", secondary: "#06b6d4" }),
  Object.freeze({ id: "sunset", label: "Sunset", primary: "#f97316", secondary: "#ef4444" }),
  Object.freeze({ id: "forest", label: "Forest", primary: "#10b981", secondary: "#22c55e" }),
  Object.freeze({ id: "royal", label: "Royal", primary: "#6366f1", secondary: "#8b5cf6" }),
  Object.freeze({ id: "neon", label: "Neon", primary: "#ec4899", secondary: "#a855f7" }),
  Object.freeze({ id: "gold", label: "Luxury Gold", primary: "#f59e0b", secondary: "#fbbf24" }),
]);

// What "no palette" renders as: KEYFRAME's own accents (settings.brand.palette === null).
export const KEYFRAME_PALETTE = Object.freeze({ id: "keyframe", label: "KEYFRAME", primary: "#e832a8", secondary: "#23c8e0" });

export const LANGUAGES = Object.freeze([
  Object.freeze({ code: "en", name: "English", native: "English", dir: "ltr" }),
  Object.freeze({ code: "hi", name: "Hindi", native: "हिन्दी", dir: "ltr" }),
  Object.freeze({ code: "es", name: "Spanish", native: "Español", dir: "ltr" }),
  Object.freeze({ code: "fr", name: "French", native: "Français", dir: "ltr" }),
  Object.freeze({ code: "de", name: "German", native: "Deutsch", dir: "ltr" }),
  Object.freeze({ code: "pt", name: "Portuguese", native: "Português", dir: "ltr" }),
  Object.freeze({ code: "ar", name: "Arabic", native: "العربية", dir: "rtl" }),
  Object.freeze({ code: "ja", name: "Japanese", native: "日本語", dir: "ltr" }),
]);

export const LANGUAGE_CODES = Object.freeze(LANGUAGES.map((l) => l.code));

// Languages written without spaces between words: caption text is re-joined with "" not " ".
export const NO_SPACE_LANGUAGES = Object.freeze(["ja", "zh", "th"]);

export function languageMeta(code) {
  if (!code || code === "auto") return null;
  const base = String(code).toLowerCase().split(/[-_]/)[0];
  return LANGUAGES.find((l) => l.code === base) || null;
}

export const dirFor = (code) => languageMeta(code)?.dir || "auto";
export const isRtl = (code) => languageMeta(code)?.dir === "rtl";

// Caption styles (server captions/styles.js ids) with the labels the Customize panel shows.
export const CAPTION_STYLES = Object.freeze([
  Object.freeze({ id: "bold_pop", label: "BOLD POP", sub: "Big, one line, word pops" }),
  Object.freeze({ id: "clean", label: "CLEAN", sub: "Two lines, calm fade" }),
  Object.freeze({ id: "karaoke_blob", label: "KARAOKE", sub: "Active word lights up" }),
  Object.freeze({ id: "single_word", label: "SINGLE WORD", sub: "One word at a time" }),
  Object.freeze({ id: "minimal_lower", label: "MINIMAL", sub: "Small, lower third" }),
  Object.freeze({ id: "brand_bar", label: "BRAND BAR", sub: "Your colour behind the words" }),
]);

export const LOGO_CORNERS = Object.freeze([
  Object.freeze({ value: "tl", label: "TOP LEFT" }),
  Object.freeze({ value: "tr", label: "TOP RIGHT" }),
  Object.freeze({ value: "bl", label: "BOTTOM LEFT" }),
  Object.freeze({ value: "br", label: "BOTTOM RIGHT" }),
]);

export const LOGO_LIMITS = Object.freeze({ maxBytes: 5 * 1024 * 1024, types: Object.freeze(["image/png", "image/jpeg", "image/webp"]) });

export function normalizeHex(v) {
  const s = String(v || "").trim();
  const withHash = s.startsWith("#") ? s : `#${s}`;
  return HEX_RE.test(withHash) ? withHash.toLowerCase() : null;
}

export function presetById(id) {
  return BRAND_PRESETS.find((p) => p.id === id) || null;
}

// Settings-shaped palette ({primary, secondary?, source, presetId?}) for a preset id.
export function paletteFromPreset(id) {
  const p = presetById(id);
  return p ? { primary: p.primary, secondary: p.secondary, source: "preset", presetId: p.id } : null;
}

// Which option a palette value corresponds to: "keyframe" (null), a preset id, or "custom".
export function paletteChoice(palette) {
  if (!palette) return "keyframe";
  if (palette.source === "preset" && presetById(palette.presetId)) return palette.presetId;
  const match = BRAND_PRESETS.find((p) => p.primary === String(palette.primary).toLowerCase() && (!palette.secondary || p.secondary === String(palette.secondary).toLowerCase()));
  return match && palette.source === "preset" ? match.id : "custom";
}
