// Caption languages — the single source of truth for the supported-language
// whitelist, shared by the API validator (routes/projects.js), the Caption
// Director, and the font resolver. Phase 1 ships 8 major languages; the
// OPTIONAL set is reserved for a later phase (accepted as "known" but not yet
// wired to fonts/translation quality gates).
//
// `font` names the script family a language needs at render time (see
// fonts/caption_fonts.js). `null` means the existing Latin stack (Inter / the
// pack display face) already covers it — no special font, no injection.
// `dir` is the base text direction; Arabic renders right-to-left.
// `expansion` is the rough LENGTH multiplier vs English (German ~1.35x longer,
// CJK ~0.7x shorter) and `lineHeight` a per-script line-height floor for stacked
// marks — both DEFINED here as the single language table, CONSUMED by the layout
// follow-up (Language Director surfaces them on the plan; harmless until then).

// `expansion` — translation LENGTH ratio vs English (German ~1.35x more chars). `charWidth`
// — per-char RENDER width vs a Latin char, the factor that corrects the composers' char-count
// text-fit (Latin languages already have their length in the char count, so 1.0; CJK glyphs
// are ~2x wide but few, so char-count sizing under-shrinks them → overflow → 2.0). `lineHeight`
// — a per-script line-height floor so stacked marks (Devanagari matras, CJK) don't clip.
const LANGUAGES = {
  en: { name: "English (US)", native: "English",  dir: "ltr", font: null,          expansion: 1.0,  charWidth: 1.0,  lineHeight: null },
  hi: { name: "Hindi",        native: "हिन्दी",    dir: "ltr", font: "devanagari",  expansion: 1.1,  charWidth: 1.15, lineHeight: 1.15 },
  es: { name: "Spanish",      native: "Español",  dir: "ltr", font: null,          expansion: 1.2,  charWidth: 1.0,  lineHeight: null },
  fr: { name: "French",       native: "Français", dir: "ltr", font: null,          expansion: 1.2,  charWidth: 1.0,  lineHeight: null },
  de: { name: "German",       native: "Deutsch",  dir: "ltr", font: null,          expansion: 1.35, charWidth: 1.0,  lineHeight: null },
  pt: { name: "Portuguese",   native: "Português", dir: "ltr", font: null,          expansion: 1.2,  charWidth: 1.0,  lineHeight: null },
  ar: { name: "Arabic",       native: "العربية",   dir: "rtl", font: "arabic",      expansion: 1.15, charWidth: 1.35, lineHeight: 1.25 },
  ja: { name: "Japanese",     native: "日本語",     dir: "ltr", font: "japanese",    expansion: 0.7,  charWidth: 2.0,  lineHeight: 1.2 },
};

// Reserved for phase 2 — recognized so the API can 400 with a "coming soon"
// message instead of a generic "unknown language", but not selectable yet.
const FUTURE_LANGUAGES = {
  zh: "Chinese (Simplified)", ko: "Korean", ru: "Russian",
  it: "Italian", tr: "Turkish", id: "Indonesian",
};

// The language the script + voiceover are authored in today. Every translation
// is FROM this language; when the caption language equals it, mode is "original"
// and nothing is translated.
const SOURCE_LANG = "en";

// Accept a code ("hi") OR a display/native name ("Hindi", "हिन्दी") and resolve
// to a canonical code, or null when unsupported. The spec's user-facing config
// object uses names, so the API must take both.
function normalizeLang(input) {
  if (!input) return null;
  const raw = String(input).trim();
  const lc = raw.toLowerCase();
  if (Object.prototype.hasOwnProperty.call(LANGUAGES, lc)) return lc;
  for (const [code, meta] of Object.entries(LANGUAGES)) {
    if (meta.name.toLowerCase() === lc || meta.native.toLowerCase() === lc) return code;
  }
  return null;
}

function isSupported(code) {
  return Object.prototype.hasOwnProperty.call(LANGUAGES, String(code || "").toLowerCase());
}

function isFuture(input) {
  const lc = String(input || "").trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(FUTURE_LANGUAGES, lc)) return true;
  return Object.values(FUTURE_LANGUAGES).some((n) => n.toLowerCase() === lc);
}

// Compact list for the frontend / discovery — [{code, name, native, dir}].
function listLanguages() {
  return Object.entries(LANGUAGES).map(([code, m]) => ({ code, name: m.name, native: m.native, dir: m.dir }));
}

function langMeta(code) {
  return LANGUAGES[String(code || "").toLowerCase()] || null;
}

module.exports = { LANGUAGES, FUTURE_LANGUAGES, SOURCE_LANG, normalizeLang, isSupported, isFuture, listLanguages, langMeta };
