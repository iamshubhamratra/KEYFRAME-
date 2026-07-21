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

const LANGUAGES = {
  en: { name: "English (US)", native: "English",  dir: "ltr", font: null },
  hi: { name: "Hindi",        native: "हिन्दी",    dir: "ltr", font: "devanagari" },
  es: { name: "Spanish",      native: "Español",  dir: "ltr", font: null },
  fr: { name: "French",       native: "Français", dir: "ltr", font: null },
  de: { name: "German",       native: "Deutsch",  dir: "ltr", font: null },
  pt: { name: "Portuguese",   native: "Português", dir: "ltr", font: null },
  ar: { name: "Arabic",       native: "العربية",   dir: "rtl", font: "arabic" },
  ja: { name: "Japanese",     native: "日本語",     dir: "ltr", font: "japanese" },
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
