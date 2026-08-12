// Caption fonts for non-Latin scripts. Devanagari (Hindi), Arabic, and CJK
// (Japanese) render as tofu boxes in the frame packs' Latin display faces, so
// each needs a script-specific font at render time. We bundle single-file Noto
// subsets (fontsource, OFL-licensed — one file per script, full coverage of that
// script block) and base64-inline them as @font-face — the exact offline,
// no-network, deterministic approach fonts/pack_fonts.js uses for the pack
// display faces. The renderer already proves base64 @font-face works (every
// pack ships one), so this can never fail on a font-server/path-resolution blip.
//
// Latin languages (en/es/fr/de/pt) return null: the existing Inter / pack stack
// already covers accented Latin, so there is nothing to inject and English
// renders byte-identically to before this feature.

const fs = require("node:fs");
const path = require("node:path");

// key (from caption_lang.LANGUAGES[x].font) -> { family, file }
const FONTS = {
  devanagari: { family: "Noto Sans Devanagari", file: "noto-sans-devanagari-400.woff2" },
  arabic:     { family: "Noto Sans Arabic",     file: "noto-sans-arabic-400.woff2" },
  japanese:   { family: "Noto Sans JP",         file: "noto-sans-jp-400.woff2" },
};

// Latin fallback appended after the script face so ASCII digits/punctuation and
// any mixed-in brand names stay on a clean sans instead of the script font's
// (sometimes wider) Latin glyphs.
const LATIN_FALLBACK = "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif";

const _cache = new Map();

// Returns { family, faceCss, stack } for a script key, or null for Latin/unknown.
//   family  — the @font-face family name ("Noto Sans Devanagari")
//   faceCss — the base64 @font-face rule to inject into the composed <style>
//   stack   — a ready font-family value: the script face + Latin fallback
function fontForScript(scriptKey) {
  const key = String(scriptKey || "").toLowerCase();
  if (!key || !FONTS[key]) return null;
  if (_cache.has(key)) return _cache.get(key);
  const meta = FONTS[key];
  try {
    const buf = fs.readFileSync(path.join(__dirname, "lang", meta.file));
    const b64 = buf.toString("base64");
    const faceCss = `@font-face{font-family:'${meta.family}';font-style:normal;font-weight:1 1000;font-display:block;src:url(data:font/woff2;base64,${b64}) format('woff2');}`;
    const out = { family: meta.family, faceCss, stack: `'${meta.family}', ${LATIN_FALLBACK}` };
    _cache.set(key, out);
    return out;
  } catch (e) {
    // Missing binary — return null so the caller renders in the pack font (tofu
    // risk) rather than crashing the whole render over a caption font.
    console.warn(`[caption-fonts] could not load ${meta.file}: ${e.message}`);
    return null;
  }
}

module.exports = { fontForScript, FONTS, LATIN_FALLBACK };
