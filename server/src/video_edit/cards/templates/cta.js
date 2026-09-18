// VIDEO EDIT CARD — cta: the closing ask as a pressable button (RENDER.md §7).
//
// WHY THIS DESIGN. A call to action converts when it looks like something to tap: a brand-accent pill
// with the ask in the brand display face (uppercase, on-accent colour kept ≥ 4.5:1) and a drawn chevron,
// with an optional line above it in the body face. The chevron is CSS borders, not a glyph, so no bundled
// face can miss it. Motion: the line rises, the button springs in, a light sheen sweeps across it once
// and the chevron nudges forward, then the whole card shrinks away. Every tween is finite.
//
// CONTRACT: id · version · fontRoles · defaultDims(aspect) -> { w, h }
//   build({ title, subtitle? }, brand, fonts, { w, h, dur, lang }) -> { indexHtml, metaJson, extraFiles, layout }
//   fallbackBlocks(vars) -> [{ text, role, color }]

const K = require("./_common");

const id = "cta";
const version = 1;
const REF = Object.freeze({ w: 1080, h: 400 });
const fontRoles = Object.freeze({ display: "Archivo Black", body: "DM Sans", brandDisplay: true });
const DIMS = Object.freeze({ "9:16": { w: 1080, h: 400 }, "16:9": { w: 1400, h: 320 }, "1:1": { w: 1080, h: 380 } });

function defaultDims(aspect) { return { ...(DIMS[aspect] || DIMS["9:16"]) }; }

function build(vars = {}, brand = {}, fonts = [], { w, h, dur, lang = "en" } = {}) {
  const G = K.canvas({ w, h, dur });
  const P = K.derivePalette(brand);
  const F = K.cardFonts(fonts);
  const rtl = K.isRtl(lang);
  const raw = K.cleanText(vars.title, 60);
  if (!raw) throw K.kitError("cta needs a title");
  const label = K.upper(raw, lang);
  const subtitle = K.cleanText(vars.subtitle, 70);
  const k = Math.min(G.w / REF.w, G.h / REF.h);
  const ls = K.scriptOf(lang) === "Latn" ? 0.01 : 0;
  const side = 56 * k, padX = 46 * k, padY = 24 * k, gapA = 20 * k, subGap = 18 * k, vpad = 18 * k, shadowRoom = 16 * k;

  const sFit = subtitle ? K.fitText({ text: subtitle, chain: F.bodyChain, maxWidth: G.w - 2 * side, maxLines: 1, maxSize: 40 * k, minSize: 22 * k, lang }) : null;
  const sLH = sFit ? sFit.size * 1.28 : 0;
  let maxSize = 60 * k, fit = null, arrowBox = 0, btnH = 0, btnW = 0, blockH = 0;
  for (let i = 0; i < 30; i++) {
    fit = K.fitText({ text: label, chain: F.displayChain, maxWidth: G.w - 2 * side - 2 * padX - gapA - maxSize * 0.46, maxLines: 1, maxSize, minSize: 24 * k, letterSpacingEm: ls, lang });
    arrowBox = fit.size * 0.46;
    btnH = fit.size * 1.2 + 2 * padY;
    btnW = padX + fit.width / 0.97 + gapA + arrowBox + padX;
    blockH = (sFit ? sLH + subGap : 0) + btnH;
    if (blockH + 2 * vpad + shadowRoom <= G.h || fit.size <= 24 * k) break;
    maxSize = fit.size * 0.93;
  }
  const top = Math.max(0, (G.h - blockH - shadowRoom) / 2);
  const btnX = (G.w - btnW) / 2;
  const btnY = top + (sFit ? sLH + subGap : 0);
  const labelW = fit.width / 0.97;
  const labelX = rtl ? padX + arrowBox + gapA : padX;
  const arrowX = rtl ? padX : padX + labelW + gapA;
  const thick = Math.max(3, fit.size * 0.1);
  const labelLH = fit.size * 1.2;

  const css = `
#cta { position: absolute; left: 0; top: 0; width: 100%; height: 100%; transform-origin: 50% 50%; }
#ctaSub { position: absolute; left: ${K.px(side)}; top: ${K.px(top)}; width: ${K.px(G.w - 2 * side)}; height: ${K.px(sLH)}; line-height: ${K.px(sLH)}; text-align: center; white-space: nowrap; font-size: ${K.px(sFit ? sFit.size : 0)}; color: ${P.text}; text-shadow: 0px 2px 12px rgba(0,0,0,0.55); direction: ${rtl ? "rtl" : "ltr"}; opacity: 0; ${F.css(F.body)} }
#ctaBtn { position: absolute; left: ${K.px(btnX)}; top: ${K.px(btnY)}; width: ${K.px(btnW)}; height: ${K.px(btnH)}; border-radius: ${K.px(btnH / 2)}; background: ${P.accent}; overflow: hidden; box-shadow: 0px ${K.px(14 * k)} ${K.px(36 * k)} rgba(0,0,0,0.35); transform-origin: 50% 50%; opacity: 0; }
#ctaShine { position: absolute; left: 0; top: -30%; width: 28%; height: 160%; background: linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.5) 50%, rgba(255,255,255,0) 100%); }
#ctaLabel { position: absolute; left: ${K.px(labelX)}; top: ${K.px(padY)}; width: ${K.px(labelW)}; height: ${K.px(labelLH)}; line-height: ${K.px(labelLH)}; text-align: center; white-space: nowrap; font-size: ${K.px(fit.size)}; letter-spacing: ${ls}em; color: ${P.onAccent}; direction: ${rtl ? "rtl" : "ltr"}; ${F.css(F.display)} }
#ctaArrow { position: absolute; left: ${K.px(arrowX)}; top: ${K.px((btnH - arrowBox) / 2)}; width: ${K.px(arrowBox)}; height: ${K.px(arrowBox)}; }
#ctaArrow .chev { position: absolute; left: ${rtl ? "34%" : "14%"}; top: 24%; width: 52%; height: 52%; border-top: ${K.px(thick)} solid ${P.onAccent}; border-right: ${K.px(thick)} solid ${P.onAccent}; border-radius: ${K.px(thick * 0.3)}; transform: rotate(${rtl ? -135 : 45}deg); }
`;
  const body = `<div id="cta">
${sFit ? `<div id="ctaSub">${K.escapeHtml(sFit.lines.map((l) => l.text).join(" "))}</div>` : ""}
<div id="ctaBtn">
<div id="ctaShine"></div>
<div id="ctaLabel">${K.escapeHtml(fit.lines.map((l) => l.text).join(" "))}</div>
<div id="ctaArrow"><div class="chev"></div></div>
</div>
</div>`;

  const entryEnd = 1.52;
  const T = K.cardTiming(G.dur, entryEnd);
  const dir = rtl ? -1 : 1;
  const script = [
    sFit ? K.fromTo("#ctaSub", { opacity: 0, y: 14 * k }, { opacity: 1, y: 0, duration: T.d(0.4), ease: "power2.out" }, T.at(0.04)) : "",
    K.fromTo("#ctaBtn", { opacity: 0, scale: 0.6, y: 24 * k }, { opacity: 1, scale: 1, y: 0, duration: T.d(0.56), ease: "back.out(1.7)" }, T.at(0.12)),
    K.fromTo("#ctaShine", { xPercent: rtl ? 480 : -150, skewX: -20 }, { xPercent: rtl ? -150 : 480, skewX: -20, duration: T.d(0.72), ease: "power2.inOut" }, T.at(0.8)),
    K.to("#ctaArrow", { x: dir * 10 * k, duration: T.d(0.2), ease: "power1.inOut" }, T.at(0.8)),
    K.to("#ctaArrow", { x: 0, duration: T.d(0.26), ease: "power1.inOut" }, T.at(1.0)),
    K.to("#cta", { opacity: 0, scale: 0.92, duration: T.outDur, ease: "power2.in" }, T.outStart),
  ].filter(Boolean).join("\n");

  return {
    indexHtml: K.documentHtml({ w: G.w, h: G.h, dur: G.dur, lang, title: id, faces: F.faces, css, body, script }),
    metaJson: K.metaJsonFor(G),
    extraFiles: [K.gsapExtraFile()],
    layout: {
      template: id,
      holdSec: [K.r3(T.holdStart + 0.05), K.r3(T.holdEnd - 0.05)],
      colors: { button: P.accent, text: P.onAccent },
      boxes: { button: K.box(btnX, btnY, btnW, btnH), subtitle: sFit ? K.box(side, top, G.w - 2 * side, sLH) : null },
      samples: { transparent: K.point(6, 6), button: K.point(rtl ? btnX + btnW - padX * 0.4 : btnX + padX * 0.4, btnY + btnH / 2) },
      fonts: { label: F.display.family, subtitle: F.body.family },
      sizes: { label: fit.size, subtitle: sFit ? sFit.size : null },
      truncated: fit.truncated || !!(sFit && sFit.truncated),
    },
  };
}

function fallbackBlocks(vars = {}, { lang = "en" } = {}) {
  return [
    { text: K.cleanText(vars.subtitle, 70), role: "body", color: "text" },
    { text: K.upper(K.cleanText(vars.title, 60), lang), role: "display", color: "accent" },
  ].filter((b) => b.text);
}

module.exports = { id, version, fontRoles, defaultDims, build, fallbackBlocks };
