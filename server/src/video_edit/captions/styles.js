// VIDEO EDIT CAPTION STYLES — the six burn-in presets and their per-project resolution (RENDER.md §6).
//
// WHY THIS EXISTS. Grouping (how many words fit a line), placement (how tall a cue box is), the ASS
// writer (fonts, colours, entry animation) and the QA reading-speed check must all agree on the SAME
// numbers for a style, per output aspect and per language. If each derived its own, a cue that
// group.js thinks fits one line wraps to two in libass and lands on the speaker's face. So a style
// is resolved once — script font swapped for hi/ar/ja (libass silently drops missing glyphs, so the
// right bundled TTF is not optional), brand highlight pushed to ≥ 3:1 against what it sits on via
// brand_kit (the same luminance the contrast audit uses) — and every consumer reads that object.
//
// CONTRACT:
//   STYLE_PRESETS (frozen) · STYLE_IDS · FONT_FILES · FONTS_DIR ('assets/fonts/edit', relative to server/)
//   isStyleId(id) · readingCpsFor(lang) -> 20 | 15 (hi, ar) | 8 (ja)
//   resolveStyle(id, { brand, brandColors, lang='en', aspect='9:16', output }) -> ResolvedStyle
//     brand: plan.branding.palette ({primary, accent, …}) or null; brandColors: plan.settings.brandColors
//     output: {width,height} scales pixel sizes from the 1080-short-edge reference; omitted -> reference.
//     Throws EditError INVALID_STYLE for an unknown id.
//     Text-recolouring highlights (bold_pop, single_word) that would be indistinguishable from the white text
//     (ratio < 1.25 and chroma < 40) become the brand primary when distinct, else DEFAULT_HIGHLIGHT (brand.adjusted).
//   fontFilesFor(style) -> [ttf filenames] to copy into <project>/fonts/
// Sizes are pixels at a 1080-px short edge (PlayRes = output size). `emFactor` is the average advance
// of one character in em for the face as rendered (uppercase styles measured uppercase); group.js
// measures width = chars × caption_lang charWidth × emFactor × sizePx.

const { EditError } = require("../errors");
const { langMeta } = require("../../services/caption_lang");
const { resolveBrand, nudgeToRatio, ratio } = require("../../services/brand_kit");

const FONTS_DIR = "assets/fonts/edit";
const REFERENCE_SHORT_EDGE = 1080;
const DEFAULT_HIGHLIGHT = "#ffd400";
const BLACK = "#000000";
const WHITE = "#ffffff";

const FONT_FILES = Object.freeze({
  "DM Sans": "DMSans-Bold.ttf",
  "Archivo Black": "ArchivoBlack-Regular.ttf",
  "Figtree": "Figtree-Bold.ttf",
  "Anton": "Anton-Regular.ttf",
  "Barlow Condensed": "BarlowCondensed-Bold.ttf",
  "Noto Sans Devanagari": "NotoSansDevanagari-Bold.ttf",
  "Noto Sans Arabic": "NotoSansArabic-Bold.ttf",
  "Noto Sans JP": "NotoSansJP-Bold.ttf",
});

// Script faces carry no case; emFactor is a Latin-equivalent base because caption_lang.charWidth
// already encodes how much wider the script renders than a Latin character.
const SCRIPT_FONTS = Object.freeze({
  hi: Object.freeze({ family: "Noto Sans Devanagari", emFactor: 0.56, direction: "ltr" }),
  ar: Object.freeze({ family: "Noto Sans Arabic", emFactor: 0.56, direction: "rtl" }),
  ja: Object.freeze({ family: "Noto Sans JP", emFactor: 0.5, direction: "ltr" }),
});

const deepFreeze = (o) => { if (o && typeof o === "object" && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(deepFreeze); } return o; };

const STYLE_PRESETS = deepFreeze({
  bold_pop: {
    id: "bold_pop", label: "Bold pop",
    font: { family: "Archivo Black", bold: false, sizePx: { "9:16": 76, "16:9": 64, "1:1": 68 }, spacing: 0, uppercase: true, emFactor: 0.78 },
    colors: { primary: WHITE, highlight: "brand", emphasis: "brand", outline: BLACK, shadow: BLACK, box: BLACK },
    outlinePx: 6, shadowPx: 2, box: { enabled: false, alpha: 0 },
    maxLines: 1, maxWordsPerLine: 4, maxCharsPerLine: { "9:16": 16, "16:9": 30, "1:1": 17 },
    entry: "pop", entryMs: 120, entryFrom: 0.85, highlight: "color", activeWord: "color", emphasisScale: 1.12,
  },
  clean: {
    id: "clean", label: "Clean",
    font: { family: "DM Sans", bold: true, sizePx: { "9:16": 60, "16:9": 52, "1:1": 56 }, spacing: 0, uppercase: false, emFactor: 0.56 },
    colors: { primary: WHITE, highlight: WHITE, emphasis: WHITE, outline: BLACK, shadow: BLACK, box: BLACK },
    outlinePx: 4, shadowPx: 2, box: { enabled: false, alpha: 0 },
    maxLines: 2, maxWordsPerLine: 7, maxCharsPerLine: { "9:16": 26, "16:9": 44, "1:1": 30 },
    entry: "fade", entryMs: 80, entryFrom: 1, highlight: "none", activeWord: null, emphasisScale: 1.0,
  },
  karaoke_blob: {
    id: "karaoke_blob", label: "Karaoke blob",
    font: { family: "Figtree", bold: true, sizePx: { "9:16": 68, "16:9": 58, "1:1": 62 }, spacing: 0, uppercase: false, emFactor: 0.57 },
    colors: { primary: WHITE, highlight: "brand", emphasis: WHITE, outline: BLACK, shadow: BLACK, box: BLACK },
    outlinePx: 4, shadowPx: 2, box: { enabled: false, alpha: 0 },
    maxLines: 2, maxWordsPerLine: 6, maxCharsPerLine: { "9:16": 22, "16:9": 40, "1:1": 26 },
    entry: "fade", entryMs: 80, entryFrom: 1, highlight: "blob", activeWord: "blob", emphasisScale: 1.08,
  },
  single_word: {
    id: "single_word", label: "Single word",
    font: { family: "Anton", bold: false, sizePx: { "9:16": 110, "16:9": 96, "1:1": 100 }, spacing: 0, uppercase: true, emFactor: 0.5 },
    colors: { primary: WHITE, highlight: WHITE, emphasis: "brand", outline: BLACK, shadow: BLACK, box: BLACK },
    outlinePx: 7, shadowPx: 3, box: { enabled: false, alpha: 0 },
    maxLines: 1, maxWordsPerLine: 1, maxCharsPerLine: { "9:16": 12, "16:9": 18, "1:1": 14 },
    entry: "pop", entryMs: 90, entryFrom: 0.7, highlight: "single_word", activeWord: null, emphasisScale: 1.15,
  },
  minimal_lower: {
    id: "minimal_lower", label: "Minimal lower",
    font: { family: "DM Sans", bold: true, sizePx: { "9:16": 44, "16:9": 40, "1:1": 42 }, spacing: 0, uppercase: false, emFactor: 0.56 },
    colors: { primary: WHITE, highlight: WHITE, emphasis: WHITE, outline: BLACK, shadow: BLACK, box: BLACK },
    outlinePx: 0, shadowPx: 0, box: { enabled: true, alpha: 0.55 },
    maxLines: 2, maxWordsPerLine: 8, maxCharsPerLine: { "9:16": 34, "16:9": 60, "1:1": 40 },
    entry: "fade", entryMs: 80, entryFrom: 1, highlight: "none", activeWord: null, emphasisScale: 1.0,
  },
  brand_bar: {
    id: "brand_bar", label: "Brand bar",
    font: { family: "Barlow Condensed", bold: true, sizePx: { "9:16": 64, "16:9": 56, "1:1": 60 }, spacing: 0, uppercase: false, emFactor: 0.46 },
    colors: { primary: WHITE, highlight: "brand", emphasis: WHITE, outline: BLACK, shadow: BLACK, box: "brand" },
    outlinePx: 0, shadowPx: 0, box: { enabled: true, alpha: 0.9 },
    maxLines: 2, maxWordsPerLine: 7, maxCharsPerLine: { "9:16": 30, "16:9": 52, "1:1": 34 },
    entry: "fade", entryMs: 80, entryFrom: 1, highlight: "color", activeWord: "underline", emphasisScale: 1.06,
  },
});

const STYLE_IDS = Object.freeze(Object.keys(STYLE_PRESETS));
const ASPECTS = Object.freeze(["9:16", "16:9", "1:1"]);

function isStyleId(id) { return typeof id === "string" && Object.prototype.hasOwnProperty.call(STYLE_PRESETS, id); }

function readingCpsFor(lang) {
  const l = String(lang || "en").toLowerCase().slice(0, 2);
  if (l === "ja") return 8;
  if (l === "hi" || l === "ar") return 15;
  return 20;
}

// A highlight drawn as text colour must differ visibly from the text: enough luminance contrast or enough
// chroma (a saturated pastel reads as a colour even at a low luminance ratio; #fafafa on #ffffff does not).
const TEXT_DISTINCT_RATIO = 1.25;
const TEXT_DISTINCT_CHROMA = 40;
function distinctFromText(hex, textHex) {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(String(hex || ""));
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return ratio(hex, textHex) >= TEXT_DISTINCT_RATIO || Math.max(...rgb) - Math.min(...rgb) >= TEXT_DISTINCT_CHROMA;
}

const HEX_RE = /^#?([0-9a-fA-F]{6})$/;
const normHex = (v) => { const m = HEX_RE.exec(String(v == null ? "" : v).trim()); return m ? `#${m[1].toLowerCase()}` : null; };

function brandAccent(brand, brandColors) {
  if (brand && typeof brand === "object" && !Array.isArray(brand)) {
    if (brand.source !== "default") {
      const a = normHex(brand.accent) || normHex(brand.primary);
      if (a) return { accent: a, primary: normHex(brand.primary) || a, fromBrand: true };
    }
  }
  const list = (Array.isArray(brand) ? brand : Array.isArray(brandColors) ? brandColors : []).map(normHex).filter(Boolean);
  if (list.length) return { accent: list[1] || list[0], primary: list[0], fromBrand: true };
  return { accent: DEFAULT_HIGHLIGHT, primary: DEFAULT_HIGHLIGHT, fromBrand: false };
}

function resolveStyle(id, { brand = null, brandColors = null, lang = "en", aspect = "9:16", output = null } = {}) {
  if (!isStyleId(id)) throw new EditError("INVALID_STYLE", { status: 422, errorClass: "input", detail: `unknown caption style '${id}'` });
  const asp = ASPECTS.includes(aspect) ? aspect : "9:16";
  const preset = STYLE_PRESETS[id];
  const code = String(lang || "en").toLowerCase().slice(0, 2);
  const meta = langMeta(code);
  const script = SCRIPT_FONTS[code] || null;
  const shortEdge = output && output.width > 0 && output.height > 0 ? Math.min(output.width, output.height) : REFERENCE_SHORT_EDGE;
  const scale = shortEdge / REFERENCE_SHORT_EDGE;

  const family = script ? script.family : preset.font.family;
  const font = {
    family,
    ttf: FONT_FILES[family],
    bold: preset.font.bold,
    sizePx: Math.max(8, Math.round(preset.font.sizePx[asp] * scale)),
    spacing: preset.font.spacing,
    uppercase: script ? false : preset.font.uppercase,
    emFactor: script ? script.emFactor : preset.font.emFactor,
    lineHeight: Math.max(1.2, (meta && meta.lineHeight) || 0),
    direction: script ? script.direction : (meta && meta.dir) || "ltr",
  };

  // Brand highlight, contrast-fitted to what it is drawn against.
  const { accent, primary, fromBrand } = brandAccent(brand, brandColors);
  const outline = preset.colors.outline;
  const fitted = resolveBrand(fromBrand ? { accents: [accent] } : null, { ground: outline, isDark: true, packAccents: [DEFAULT_HIGHLIGHT] });
  let highlight = preset.colors.highlight === "brand" ? fitted.accent : preset.colors.highlight;
  let emphasis = preset.colors.emphasis === "brand" ? fitted.accent : preset.colors.emphasis;
  let box = preset.colors.box;
  const adjusted = [...fitted.adjusted];
  const dropped = [...fitted.dropped];

  // bold_pop / single_word recolour the TEXT itself: a highlight that is (nearly) the white text colour is
  // invisible however well it contrasts with the outline. Use the brand primary when it is distinct, else the
  // default highlight, and disclose the substitution.
  if (id !== "karaoke_blob" && id !== "brand_bar") {
    const textColor = preset.colors.primary;
    const substitute = () => {
      if (fromBrand && primary !== accent) {
        const p = resolveBrand({ accents: [primary] }, { ground: outline, isDark: true, packAccents: [DEFAULT_HIGHLIGHT] });
        if (p.applied && distinctFromText(p.accent, textColor)) return p.accent;
      }
      return DEFAULT_HIGHLIGHT;
    };
    if (preset.colors.highlight === "brand" && !distinctFromText(highlight, textColor)) {
      const to = substitute();
      adjusted.push({ from: highlight, to, reason: "highlight vs text" });
      highlight = to;
    }
    if (preset.colors.emphasis === "brand" && !distinctFromText(emphasis, textColor)) {
      const to = substitute();
      adjusted.push({ from: emphasis, to, reason: "emphasis vs text" });
      emphasis = to;
    }
  }

  if (id === "karaoke_blob") {
    // The blob is drawn BEHIND the white active word: the text must read on the blob.
    const n = nudgeToRatio(fromBrand ? accent : DEFAULT_HIGHLIGHT, preset.colors.primary, 3);
    if (n.adjusted) adjusted.push({ from: n.from, to: n.to, reason: "blob vs text" });
    highlight = n.hex;
  }
  if (id === "brand_bar") {
    const barBase = fromBrand ? primary : "#1b1b1f";
    const bar = nudgeToRatio(barBase, preset.colors.primary, 4.5);
    if (bar.adjusted) adjusted.push({ from: bar.from, to: bar.to, reason: "bar vs text" });
    box = bar.hex;
    const underline = nudgeToRatio(fromBrand ? accent : DEFAULT_HIGHLIGHT, box, 3);
    if (underline.adjusted) adjusted.push({ from: underline.from, to: underline.to, reason: "underline vs bar" });
    highlight = underline.hex;
  }

  return {
    id,
    label: preset.label,
    lang: code,
    aspect: asp,
    font,
    colors: {
      primary: preset.colors.primary, highlight, emphasis, outline, shadow: preset.colors.shadow, box,
      highlightContrast: Math.round(ratio(highlight, id === "brand_bar" ? box : id === "karaoke_blob" ? preset.colors.primary : outline) * 100) / 100,
    },
    outlinePx: Math.round(preset.outlinePx * scale * 100) / 100,
    shadowPx: Math.round(preset.shadowPx * scale * 100) / 100,
    box: { ...preset.box },
    maxLines: preset.maxLines,
    maxWordsPerLine: preset.maxWordsPerLine,
    maxCharsPerLine: preset.maxCharsPerLine[asp],
    maxCueSec: 2.5,
    minCueSec: 0.5,
    pauseBreakSec: 0.25,
    readingCps: readingCpsFor(code),
    entry: preset.entry,
    entryMs: preset.entryMs,
    entryFrom: preset.entryFrom,
    highlight: preset.highlight,
    activeWord: preset.activeWord,
    emphasisScale: preset.emphasisScale,
    brand: { applied: fromBrand && fitted.applied, adjusted, dropped },
  };
}

function fontFilesFor(style) {
  return style && style.font && style.font.ttf ? [style.font.ttf] : [];
}

module.exports = {
  STYLE_PRESETS, STYLE_IDS, FONT_FILES, SCRIPT_FONTS, FONTS_DIR, DEFAULT_HIGHLIGHT, REFERENCE_SHORT_EDGE,
  isStyleId, readingCpsFor, resolveStyle, fontFilesFor,
};
