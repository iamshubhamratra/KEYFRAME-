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
//   { lang, direction, fontFamily, fontFaceCss, fontKey }
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
  };
}

// The caption element selectors every burn-in path uses. Kept here so there is
// one place to update when a path introduces a different id/class:
//   scene-kit                         -> #kfcap
//   native GSAP packs                 -> #cap-text
//   deterministic fallback (fallback.js) -> .cap / #cap0…  (must be covered too,
//     or a non-Latin film that falls through to the emergency template renders
//     its captions as tofu / loses RTL)
const CAPTION_SELECTORS = "#kfcap, #cap-text, .cap";

// Inject the language font + direction override into a finished HTML document.
// Returns the HTML unchanged when there is nothing to do (null style, or a style
// with neither a font nor an RTL requirement).
function injectCaptionStyle(html, captionStyle) {
  if (!html || typeof html !== "string" || !captionStyle) return html;
  const hasFont = !!captionStyle.fontFaceCss;
  const isRtl = captionStyle.direction === "rtl";
  if (!hasFont && !isRtl) return html;

  const rules = [];
  if (captionStyle.fontFamily) rules.push(`font-family:${captionStyle.fontFamily} !important`);
  if (isRtl) { rules.push("direction:rtl"); rules.push("unicode-bidi:isolate"); }
  // Long unbroken runs (CJK, URLs, hashtags) must never overflow the caption
  // pill — allow a break anywhere as a safety net. Latin word wrapping is
  // unaffected because normal wrapping still prefers spaces.
  rules.push("overflow-wrap:anywhere");

  const blocks = [];
  if (hasFont) blocks.push(captionStyle.fontFaceCss);
  // `!important` in a stylesheet rule beats the composers' inline caption
  // font (`#kfcap` uses an inline `font:` shorthand; the override still wins).
  blocks.push(`${CAPTION_SELECTORS}{${rules.join(";")};}`);

  const styleTag = `\n<style data-kf-caption-i18n="${captionStyle.lang || ""}">${blocks.join("\n")}</style>\n`;

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

module.exports = { buildCaptionStyle, injectCaptionStyle, hasCaptionTarget, CAPTION_SELECTORS };
