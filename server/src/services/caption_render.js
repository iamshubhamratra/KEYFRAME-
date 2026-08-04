// Caption styling injection — the single wiring point that makes burned-in
// captions render correctly in ANY language without touching the 8 delicate
// composer files.
//
// Every composer builds its own index.html (its own GSAP timeline, its own
// caption element) and hands the string to pipeline.js, which writes it and
// renders. Rather than editing each composer's caption baker, we post-process
// that finished HTML string once: inject a <style> block that (a) declares the
// language @font-face and (b) overrides the caption element's font-family and
// text direction. It targets the two caption selectors used across every
// burn-in composer:
//     scene-kit                                   -> #kfcap
//     native GSAP packs (blueprint/bloom/bauhaus/  -> #cap-text
//       terminal-departures/paper-tales)
// The 3D packs (three/flagship/brightlife) don't burn captions, so there is no
// matching element and injection is a harmless no-op for them.
//
// The TRANSLATED caption TEXT rides the existing `captionCues` array unchanged —
// every composer already renders `cue.text`. This module only fixes the FONT and
// DIRECTION, which text alone cannot. A null / Latin style returns the HTML
// byte-for-byte unchanged, so English output is identical to before.

const captionLang = require("./caption_lang");
const captionFonts = require("../fonts/caption_fonts");

// Build the caption STYLE descriptor for a language, or null when the default
// Latin stack already suffices (English + es/fr/de/pt). Shape:
//   { lang, direction, fontFamily, fontFaceCss, fontKey, charWidth, lineHeight }
// charWidth/lineHeight let the composers' char-count text-fit account for scripts that render
// wider/taller than a Latin char (CJK, Devanagari) so headlines don't overflow. Only non-Latin
// languages return a non-null style, so Latin films never see these and are unaffected.
function buildCaptionStyle(lang) {
  const meta = captionLang.langMeta(lang);
  if (!meta) return null;
  const direction = meta.dir || "ltr";
  const font = meta.font ? captionFonts.fontForScript(meta.font) : null;
  // Latin, ltr, no special font -> nothing to inject.
  if (!font && direction !== "rtl") return null;
  return {
    lang: String(lang).toLowerCase(),
    direction,
    fontFamily: font ? font.stack : null,
    fontFaceCss: font ? font.faceCss : "",
    fontKey: meta.font || null,
    charWidth: meta.charWidth || 1,
    lineHeight: meta.lineHeight || null,
  };
}

// Resolve the combined LANGUAGE STYLE for a film: the CAPTION-language style (applied
// to the caption elements) and the VIDEO-TEXT-language style (applied to ALL on-screen
// text). Either may be null (Latin/English needs no font). Returns null when neither
// language needs a font/direction, so English output stays byte-identical.
//   { caption: <style|null>, text: <style|null> }
function buildLanguageStyles(capLang, textLang, { captionsEnabled = true } = {}) {
  const caption = captionsEnabled ? buildCaptionStyle(capLang) : null;
  const text = buildCaptionStyle(textLang);
  if (!caption && !text) return null;
  return { caption, text };
}

// The caption element selectors every burn-in path uses. Kept here so there is
// one place to update when a path introduces a different id/class:
//   scene-kit                         -> #kfcap
//   native GSAP packs                 -> #cap-text
//   deterministic fallback (fallback.js) -> .cap / #cap0…  (must be covered too,
//     or a non-Latin film that falls through to the emergency template renders
//     its captions as tofu / loses RTL)
const CAPTION_SELECTORS = "#kfcap, #cap-text, .cap";
// Every text element in the document — used to swap the WHOLE film's font/direction
// into the VIDEO-TEXT language. Targets descendants directly (not just `body`) so the
// stylesheet `!important` beats each element's OWN inline/class font-family — inheriting
// from `body` alone would not override an element that sets its own font (the same bet
// the caption override relies on, now applied to all on-screen text).
const TEXT_SELECTORS = "body, body *";

// COMPLEX-SCRIPT SHAPING FIX — applied to ALL on-screen text ONLY when the video-text
// language is non-Latin (needsText). Three Chromium behaviors silently DISABLE Indic
// (Devanagari/Bengali/Tamil…) and Arabic glyph shaping — the i-matra reorder and the
// half-form/conjunct ligatures fail, so combining matras detach and jump to the front
// of the word (e.g. "शॉपिंग" → "।शोपेग"). The font is fine; the shaper never runs because
// a clipping/containment box on a small inline text run trips per-glyph fallback:
//   (a) overflow:hidden on the per-WORD mask-reveal wrapper `.kw` (flagship/brightlife —
//       each word slides up behind an overflow clip). overflow:visible restores shaping.
//   (b) clip-path:inset on the reveal wrappers `.kfw`/`.kfc` (scene-kit mask-reveal /
//       line-wipe) and `.pen-clip` (paper-tales handwriting wipe). clip-path:none restores
//       it; the accompanying opacity/yPercent tween still plays, so words still animate in.
//   (c) -webkit-background-clip:text used to paint GRADIENT emphasis words (`.kacc .kwi`
//       in flagship/brightlife, `.kfacc` in scene-kit). Dropping the text-clip lets the
//       word render in its solid accent `color` (declared alongside the gradient in every
//       composer), correctly shaped — accented, just not gradient.
// All three are inert for Latin/English (gated behind needsText), so the mask reveal, the
// handwriting wipe, and the gradient emphasis are untouched for English output.
const SHAPING_FIX =
  ".kw{overflow:visible !important;}" +
  ".kw,.kwi,.kfw,.kfc,.pen-clip{clip-path:none !important;}" +
  ".kacc .kwi,.kfacc{-webkit-text-fill-color:currentColor !important;background:none !important;filter:none !important;}";

function styleDecls(style, { withOverflow = false } = {}) {
  const decls = [];
  if (style.fontFamily) decls.push(`font-family:${style.fontFamily} !important`);
  if (style.direction === "rtl") { decls.push("direction:rtl"); decls.push("unicode-bidi:isolate"); }
  if (withOverflow) decls.push("overflow-wrap:anywhere");
  return decls;
}

// Inject the language font(s) + direction into a finished HTML document. Accepts the
// combined language style `{ caption, text }` (from buildLanguageStyles) — `text` fonts
// ALL on-screen text (video-text language), `caption` fonts the caption elements
// (caption language) and wins on them via id-specificity. Also accepts a legacy single
// caption style for back-compat. Returns the HTML unchanged when there's nothing to do
// (null style, or Latin/English with no font or RTL), so English output is byte-identical.
function injectCaptionStyle(html, style) {
  if (!html || typeof html !== "string" || !style) return html;
  // Normalize: combined { caption, text } vs a legacy single caption style.
  const combined = ("caption" in style || "text" in style) ? style : { caption: style, text: null };
  const caption = combined.caption || null;
  const text = combined.text || null;

  const needsCaption = !!(caption && (caption.fontFaceCss || caption.direction === "rtl"));
  const needsText = !!(text && (text.fontFaceCss || text.direction === "rtl"));
  if (!needsCaption && !needsText) return html;

  const faces = new Map(); // dedupe @font-face when caption + text share a language
  const rules = [];
  // Video-text language: font + direction on ALL text.
  if (needsText) {
    if (text.fontFaceCss) faces.set(text.fontKey || text.lang, text.fontFaceCss);
    rules.push(`${TEXT_SELECTORS}{${styleDecls(text).join(";")};}`);
    // Non-Latin on-screen text: neutralize the two composer effects that break
    // complex-script glyph shaping in Chromium (see SHAPING_FIX).
    rules.push(SHAPING_FIX);
  }
  // Caption language: font + direction on the caption elements (id specificity beats
  // the all-text rule, so a DIFFERENT caption language still wins on captions).
  if (needsCaption) {
    if (caption.fontFaceCss) faces.set(caption.fontKey || caption.lang, caption.fontFaceCss);
    rules.push(`${CAPTION_SELECTORS}{${styleDecls(caption, { withOverflow: true }).join(";")};}`);
  } else if (needsText) {
    // Captions are text too — keep them wrappable even when there's no separate caption language.
    rules.push(`${CAPTION_SELECTORS}{overflow-wrap:anywhere;}`);
  }

  const langAttr = (text && text.lang) || (caption && caption.lang) || "";
  const styleTag = `\n<style data-kf-caption-i18n="${langAttr}">${[...faces.values(), ...rules].join("\n")}</style>\n`;

  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, styleTag + "</head>");
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, styleTag + "</body>");
  return html + styleTag;
}

// Does a finished document contain a caption element that injectCaptionStyle can
// actually target? The @font-face + direction override only applies via
// CAPTION_SELECTORS, so a composer that emits a caption element with a different
// id/class (notably the freehand LLM remix composer) would silently render
// non-Latin captions as tofu. Callers use this to WARN instead of shipping silently.
function hasCaptionTarget(html) {
  return /id=["']kfcap["']|id=["']cap-text["']|class=["'][^"']*\bcap\b/.test(String(html || ""));
}

module.exports = { buildCaptionStyle, buildLanguageStyles, injectCaptionStyle, hasCaptionTarget, CAPTION_SELECTORS };
