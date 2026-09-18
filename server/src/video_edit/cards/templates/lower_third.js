// VIDEO EDIT CARD — lower_third: a name + role strap (RENDER.md §7).
//
// WHY THIS DESIGN. A lower third sits over a talking face, so it must read in under a second and never
// cover the face: a compact dark panel (0.9 opacity, so it holds on any footage) sized to its text,
// anchored bottom-left (bottom-right for RTL), with the brand accent as a vertical bar and as the
// subtitle colour. Motion: the panel wipes open from the bar side, the bar grows, the name rises word by
// word out of a mask, the role slides in after it, and the whole strap slides back out.
//
// CONTRACT: id · version · fontRoles · defaultDims(aspect) -> { w, h }
//   build({ title, subtitle? }, brand, fonts, { w, h, dur, lang }) -> { indexHtml, metaJson, extraFiles, layout }
//   fallbackBlocks(vars) -> [{ text, role, color }]   (ASS fallback content, cards/render.js)

const K = require("./_common");

const id = "lower_third";
const version = 1;
const REF = Object.freeze({ w: 1080, h: 340 });
const fontRoles = Object.freeze({ display: "Figtree", body: "DM Sans", brandDisplay: false });
const DIMS = Object.freeze({ "9:16": { w: 1080, h: 340 }, "16:9": { w: 1400, h: 280 }, "1:1": { w: 1080, h: 320 } });

function defaultDims(aspect) { return { ...(DIMS[aspect] || DIMS["9:16"]) }; }

function build(vars = {}, brand = {}, fonts = [], { w, h, dur, lang = "en" } = {}) {
  const G = K.canvas({ w, h, dur });
  const P = K.derivePalette(brand);
  const F = K.cardFonts(fonts);
  const rtl = K.isRtl(lang);
  const title = K.cleanText(vars.title, 60);
  if (!title) throw K.kitError("lower_third needs a title");
  const subtitle = K.cleanText(vars.subtitle, 70);
  const k = Math.min(G.w / REF.w, G.h / REF.h);

  const ml = 56 * k, bar = 12 * k, pl = 38 * k, pr = 46 * k, pt = 22 * k, pb = 26 * k, gap = 2 * k, radius = 22 * k, below = 34 * k;
  const maxText = G.w - 2 * ml - bar - pl - pr;
  const tFit = K.fitText({ text: title, chain: F.displayChain, maxWidth: maxText, maxLines: 1, maxSize: 64 * k, minSize: 28 * k, lang });
  const sFit = subtitle ? K.fitText({ text: subtitle, chain: F.bodyChain, maxWidth: maxText, maxLines: 1, maxSize: 36 * k, minSize: 20 * k, lang }) : null;
  const tLH = tFit.size * 1.25;
  const sLH = sFit ? sFit.size * 1.3 : 0;
  const textW = Math.max(tFit.width, sFit ? sFit.width : 0);
  const panelW = Math.min(G.w - 2 * ml, Math.max(320 * k, bar + pl + textW / 0.97 + pr));
  const panelH = pt + tLH + (sFit ? gap + sLH : 0) + pb;
  const panelX = rtl ? G.w - ml - panelW : ml;
  const panelY = Math.max(4 * k, G.h - below - panelH);
  const barX = rtl ? panelW - bar : 0;
  const textX = rtl ? pr : bar + pl;
  const textBoxW = panelW - bar - pl - pr;
  const mask = 0.12 * tFit.size;

  const css = `
#lt { position: absolute; left: ${K.px(panelX)}; top: ${K.px(panelY)}; width: ${K.px(panelW)}; height: ${K.px(panelH)}; filter: drop-shadow(0px ${K.px(12 * k)} ${K.px(16 * k)} rgba(0,0,0,0.34)); }
#ltPanel { position: absolute; left: 0; top: 0; width: 100%; height: 100%; border-radius: ${K.px(radius)}; overflow: hidden; background: ${K.rgba(P.panel, 0.9)}; opacity: 0; }
#ltBar { position: absolute; left: ${K.px(barX)}; top: 0; width: ${K.px(bar)}; height: 100%; background: ${P.accentOnDark}; transform-origin: 50% 100%; }
#ltTitle { position: absolute; left: ${K.px(textX)}; top: ${K.px(pt - mask)}; width: ${K.px(textBoxW)}; height: ${K.px(tLH + 2 * mask)}; padding: ${K.px(mask)} 0px; overflow: hidden; white-space: nowrap; font-size: ${K.px(tFit.size)}; line-height: ${K.px(tLH)}; color: ${P.textOnPanel}; text-align: ${rtl ? "right" : "left"}; direction: ${rtl ? "rtl" : "ltr"}; ${F.css(F.display)} }
#ltTitle .w { opacity: 0; }
#ltSub { position: absolute; left: ${K.px(textX)}; top: ${K.px(pt + tLH + gap)}; width: ${K.px(textBoxW)}; height: ${K.px(sLH)}; white-space: nowrap; font-size: ${K.px(sFit ? sFit.size : 0)}; line-height: ${K.px(sLH)}; color: ${P.accentOnDark}; text-align: ${rtl ? "right" : "left"}; direction: ${rtl ? "rtl" : "ltr"}; opacity: 0; ${F.css(F.body)} }
`;

  const words = tFit.lines.length ? tFit.lines[0].words : [];
  const wordHtml = words.map((wd) => `<span class="w">${K.escapeHtml(wd)}</span>`).join(tFit.joiner ? " " : "");
  const body = `<div id="lt">
<div id="ltPanel">
<div id="ltBar"></div>
<div id="ltTitle">${wordHtml}</div>
${sFit ? `<div id="ltSub">${K.escapeHtml(sFit.lines.map((l) => l.text).join(" "))}</div>` : ""}
</div>
</div>`;

  const n = Math.max(1, words.length);
  const st = Math.min(0.055, 0.3 / Math.max(1, n - 1));
  const titleAt = 0.22, titleEnd = titleAt + st * (n - 1) + 0.5;
  const subAt = titleAt + st * (n - 1) + 0.12;
  const entryEnd = Math.max(0.6, titleEnd, sFit ? subAt + 0.45 : 0);
  const T = K.cardTiming(G.dur, entryEnd);
  const R = K.r2(radius);
  const closed = rtl ? `inset(0% 0% 0% 100% round ${R}px)` : `inset(0% 100% 0% 0% round ${R}px)`;
  const open = `inset(0% 0% 0% 0% round ${R}px)`;
  // The strap's shadow is a drop-shadow filter on the group, so it follows the wipe instead of sitting
  // on its own box ahead of it.
  const script = [
    K.fromTo("#ltPanel", { opacity: 0, clipPath: closed }, { opacity: 1, clipPath: open, duration: T.d(0.55), ease: "power3.out" }, T.at(0.04)),
    K.fromTo("#ltBar", { scaleY: 0 }, { scaleY: 1, duration: T.d(0.42), ease: "power2.out" }, T.at(0.14)),
    K.fromTo("#ltTitle .w", { yPercent: 110, opacity: 0 }, { yPercent: 0, opacity: 1, duration: T.d(0.5), ease: "power3.out", stagger: K.r3(st * T.f) }, T.at(titleAt)),
    sFit ? K.fromTo("#ltSub", { x: (rtl ? 18 : -18) * k, opacity: 0 }, { x: 0, opacity: 1, duration: T.d(0.45), ease: "power2.out" }, T.at(subAt)) : "",
    K.to("#lt", { x: (rtl ? 40 : -40) * k, opacity: 0, duration: T.outDur, ease: "power2.in" }, T.outStart),
  ].filter(Boolean).join("\n");

  const indexHtml = K.documentHtml({ w: G.w, h: G.h, dur: G.dur, lang, title: id, faces: F.faces, css, body, script });
  return {
    indexHtml,
    metaJson: K.metaJsonFor(G),
    extraFiles: [K.gsapExtraFile()],
    layout: {
      template: id,
      holdSec: [K.r3(T.holdStart + 0.05), K.r3(T.holdEnd - 0.05)],
      colors: { panel: P.panel, panelAlpha: 0.9, accent: P.accentOnDark, text: P.textOnPanel },
      boxes: {
        panel: K.box(panelX, panelY, panelW, panelH),
        bar: K.box(panelX + barX, panelY, bar, panelH),
        title: K.box(panelX + textX, panelY + pt, textBoxW, tLH),
        subtitle: sFit ? K.box(panelX + textX, panelY + pt + tLH + gap, textBoxW, sLH) : null,
      },
      samples: {
        transparent: K.point(rtl ? 6 : G.w - 6, 6),
        panel: K.point(panelX + (rtl ? pr * 0.5 : panelW - pr * 0.5), panelY + panelH - pb * 0.45),
        accent: K.point(panelX + barX + bar / 2, panelY + panelH / 2),
      },
      fonts: { title: F.display.family, subtitle: F.body.family },
      sizes: { title: tFit.size, subtitle: sFit ? sFit.size : null },
      truncated: tFit.truncated || !!(sFit && sFit.truncated),
    },
  };
}

function fallbackBlocks(vars = {}) {
  return [
    { text: K.cleanText(vars.title, 60), role: "display", color: "text" },
    { text: K.cleanText(vars.subtitle, 70), role: "body", color: "accent" },
  ].filter((b) => b.text);
}

module.exports = { id, version, fontRoles, defaultDims, build, fallbackBlocks };
