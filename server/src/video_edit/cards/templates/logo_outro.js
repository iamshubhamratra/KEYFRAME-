// VIDEO EDIT CARD — logo_outro: the brand sign-off (RENDER.md §7).
//
// WHY THIS DESIGN. The outro is the one card allowed to take the stage, so it is a square dark panel with
// a soft accent glow, a brand-accent ring, the logo (or a monogram disc when there is no logo) inside it,
// the brand name tracking in underneath and the tagline/handle in the accent colour. The logo is copied
// into the card directory and loaded by relative path, like GSAP, so the render never touches the network.
// Motion: the panel fades in, the ring expands, the logo springs in, the name's letter-spacing tightens as
// it rises, the tagline follows, and everything settles back and fades.
//
// CONTRACT: id · version · fontRoles · defaultDims(aspect) -> { w, h } · LOGO_EXTS
//   build({ title?, subtitle?, logoPath? }, brand, fonts, { w, h, dur, lang }) -> { indexHtml, metaJson, extraFiles, layout }
//     needs a title or a logo; logoPath must be an existing .png/.jpg/.jpeg/.webp/.svg file.
//   fallbackBlocks(vars) -> [{ text, role, color }]

const fs = require("node:fs");
const path = require("node:path");
const K = require("./_common");

const id = "logo_outro";
const version = 1;
const REF = Object.freeze({ w: 1080, h: 1080 });
const fontRoles = Object.freeze({ display: "Archivo Black", body: "DM Sans", brandDisplay: true });
const DIMS = Object.freeze({ "9:16": { w: 1080, h: 1080 }, "16:9": { w: 1200, h: 900 }, "1:1": { w: 1000, h: 1000 } });
const LOGO_EXTS = Object.freeze([".png", ".jpg", ".jpeg", ".webp", ".svg"]);

function defaultDims(aspect) { return { ...(DIMS[aspect] || DIMS["9:16"]) }; }

function build(vars = {}, brand = {}, fonts = [], { w, h, dur, lang = "en" } = {}) {
  const G = K.canvas({ w, h, dur });
  const P = K.derivePalette(brand);
  const F = K.cardFonts(fonts);
  const rtl = K.isRtl(lang);
  const latin = K.scriptOf(lang) === "Latn";
  const title = K.cleanText(vars.title, 60);
  const subtitle = K.cleanText(vars.subtitle, 70);
  let logo = null;
  if (vars.logoPath) {
    const abs = path.resolve(String(vars.logoPath));
    const ext = path.extname(abs).toLowerCase();
    if (!LOGO_EXTS.includes(ext)) throw K.kitError(`logo must be one of ${LOGO_EXTS.join(" ")}`);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) throw K.kitError("logo file is missing");
    logo = { rel: `logo${ext}`, srcPath: abs };
  }
  if (!title && !logo) throw K.kitError("logo_outro needs a title or a logo");
  const k = Math.min(G.w / REF.w, G.h / REF.h);
  const side = 90 * k;
  const lsFrom = latin ? 0.12 : 0, lsTo = latin ? 0.02 : 0;

  let s = 1, ringD, ringB, markD, logoBox, gap1, gap2, tFit, tLH, sFit, sLH, blockH;
  for (let i = 0; i < 12; i++) {
    ringD = 330 * k * s; ringB = Math.max(3, 8 * k * s); markD = 236 * k * s; logoBox = 196 * k * s; gap1 = 54 * k * s; gap2 = 14 * k;
    tFit = title ? K.fitText({ text: title, chain: F.displayChain, maxWidth: G.w - 2 * side, maxLines: 2, maxSize: 90 * k * s, minSize: 34 * k, letterSpacingEm: lsFrom, lang }) : null;
    tLH = tFit ? tFit.size * 1.12 : 0;
    sFit = subtitle ? K.fitText({ text: subtitle, chain: F.bodyChain, maxWidth: G.w - 2 * side, maxLines: 1, maxSize: 40 * k * s, minSize: 20 * k, lang }) : null;
    sLH = sFit ? sFit.size * 1.3 : 0;
    blockH = ringD + (tFit ? gap1 + tFit.lines.length * tLH : 0) + (sFit ? (tFit ? gap2 : gap1) + sLH : 0);
    if (blockH <= G.h - 2 * 64 * k || s < 0.4) break;
    s *= 0.9;
  }
  const top = Math.max(0, (G.h - blockH) / 2);
  const ringX = (G.w - ringD) / 2;
  const ringCy = top + ringD / 2;
  const titleTop = top + ringD + gap1;
  const subTop = tFit ? titleTop + tFit.lines.length * tLH + gap2 : top + ringD + gap1;
  const monogram = title ? K.graphemes(K.upper(title, lang))[0] : "";
  const radius = 44 * k;

  const css = `
#lo { position: absolute; left: 0; top: 0; width: 100%; height: 100%; transform-origin: 50% 50%; }
#loBg { position: absolute; left: 0; top: 0; width: 100%; height: 100%; border-radius: ${K.px(radius)}; background: ${K.rgba(P.panel, 0.94)}; opacity: 0; }
#loRing { position: absolute; left: ${K.px(ringX)}; top: ${K.px(top)}; width: ${K.px(ringD)}; height: ${K.px(ringD)}; border-radius: 50%; border: ${K.px(ringB)} solid ${P.accentOnDark}; box-shadow: 0px 0px ${K.px(46 * k * s)} ${K.rgba(P.accentOnDark, 0.45)}, inset 0px 0px ${K.px(30 * k * s)} ${K.rgba(P.accentOnDark, 0.3)}; opacity: 0; }
#loMark { position: absolute; left: ${K.px((G.w - markD) / 2)}; top: ${K.px(ringCy - markD / 2)}; width: ${K.px(markD)}; height: ${K.px(markD)}; border-radius: 50%; overflow: hidden; display: flex; align-items: center; justify-content: center; background: ${logo ? "rgba(255,255,255,0.06)" : P.accent}; opacity: 0; }
#loLogo { display: block; width: ${K.px(logoBox)}; height: ${K.px(logoBox)}; object-fit: contain; }
#loMono { width: 100%; height: 100%; text-align: center; font-size: ${K.px(markD * 0.46)}; line-height: ${K.px(markD)}; color: ${P.onAccent}; ${F.css(F.display)} }
#loTitle { position: absolute; left: ${K.px(side)}; top: ${K.px(titleTop)}; width: ${K.px(G.w - 2 * side)}; text-align: center; font-size: ${K.px(tFit ? tFit.size : 0)}; line-height: ${K.px(tLH)}; letter-spacing: ${lsTo}em; color: ${P.textOnPanel}; direction: ${rtl ? "rtl" : "ltr"}; opacity: 0; ${F.css(F.display)} }
#loTitle .ln { height: ${K.px(tLH)}; white-space: nowrap; }
#loSub { position: absolute; left: ${K.px(side)}; top: ${K.px(subTop)}; width: ${K.px(G.w - 2 * side)}; height: ${K.px(sLH)}; line-height: ${K.px(sLH)}; text-align: center; white-space: nowrap; font-size: ${K.px(sFit ? sFit.size : 0)}; color: ${P.accentOnDark}; direction: ${rtl ? "rtl" : "ltr"}; opacity: 0; ${F.css(F.body)} }
`;
  const body = `<div id="lo">
<div id="loBg"></div>
<div id="loRing"></div>
<div id="loMark">${logo ? `<img id="loLogo" src="${logo.rel}" alt="">` : `<div id="loMono">${K.escapeHtml(monogram)}</div>`}</div>
${tFit ? `<div id="loTitle">${tFit.lines.map((l) => `<div class="ln">${K.escapeHtml(l.text)}</div>`).join("")}</div>` : ""}
${sFit ? `<div id="loSub">${K.escapeHtml(sFit.lines.map((l) => l.text).join(" "))}</div>` : ""}
</div>`;

  const entryEnd = Math.max(1.16, sFit ? 1.17 : 0);
  const T = K.cardTiming(G.dur, entryEnd);
  const titleFrom = { opacity: 0, y: 18 * k }, titleTo = { opacity: 1, y: 0, duration: T.d(0.7), ease: "power3.out" };
  if (latin) { titleFrom.letterSpacing = `${lsFrom}em`; titleTo.letterSpacing = `${lsTo}em`; }
  const script = [
    K.fromTo("#loBg", { opacity: 0, scale: 1.04 }, { opacity: 1, scale: 1, duration: T.d(0.5), ease: "power2.out" }, 0),
    K.fromTo("#loRing", { opacity: 0, scale: 0.2 }, { opacity: 1, scale: 1, duration: T.d(0.66), ease: "power3.out" }, T.at(0.1)),
    K.fromTo("#loMark", { opacity: 0, scale: 0.5 }, { opacity: 1, scale: 1, duration: T.d(0.6), ease: "back.out(1.6)" }, T.at(0.24)),
    tFit ? K.fromTo("#loTitle", titleFrom, titleTo, T.at(0.46)) : "",
    sFit ? K.fromTo("#loSub", { opacity: 0, y: 12 * k }, { opacity: 1, y: 0, duration: T.d(0.45), ease: "power2.out" }, T.at(0.72)) : "",
    K.to("#lo", { opacity: 0, scale: 0.97, duration: T.outDur, ease: "power2.in" }, T.outStart),
  ].filter(Boolean).join("\n");

  return {
    indexHtml: K.documentHtml({ w: G.w, h: G.h, dur: G.dur, lang, title: id, faces: F.faces, css, body, script }),
    metaJson: K.metaJsonFor(G),
    extraFiles: [K.gsapExtraFile(), ...(logo ? [logo] : [])],
    layout: {
      template: id,
      holdSec: [K.r3(T.holdStart + 0.05), K.r3(T.holdEnd - 0.05)],
      colors: { panel: P.panel, panelAlpha: 0.94, accent: P.accentOnDark, text: P.textOnPanel },
      boxes: { ring: K.box(ringX, top, ringD, ringD), title: tFit ? K.box(side, titleTop, G.w - 2 * side, tFit.lines.length * tLH) : null },
      samples: { transparent: K.point(6, 6), ring: K.point(G.w / 2, top + ringB / 2), panel: K.point(70 * k, G.h / 2) },
      logo: logo ? logo.rel : null,
      fonts: { title: F.display.family, subtitle: F.body.family },
      sizes: { title: tFit ? tFit.size : null, subtitle: sFit ? sFit.size : null },
      truncated: !!(tFit && tFit.truncated) || !!(sFit && sFit.truncated),
    },
  };
}

function fallbackBlocks(vars = {}) {
  return [
    { text: K.cleanText(vars.title, 60), role: "display", color: "text" },
    { text: K.cleanText(vars.subtitle, 70), role: "body", color: "accent" },
  ].filter((b) => b.text);
}

module.exports = { id, version, fontRoles, defaultDims, build, fallbackBlocks, LOGO_EXTS };
