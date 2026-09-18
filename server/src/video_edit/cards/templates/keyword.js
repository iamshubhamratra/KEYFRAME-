// VIDEO EDIT CARD — keyword: one idea as a brand sticker (RENDER.md §7).
//
// WHY THIS DESIGN. A keyword card punctuates a spoken word, so it is short, graphic and brand-coloured:
// a condensed display face (Anton, uppercase) on a solid brand-accent pill, tilted -3° with a dark offset
// shadow for depth, sized to its text. Motion: the sticker slaps in (scale + rotation, back-out), the
// letters rise out of their line masks in quick succession, the shadow drops into place, and the sticker
// tips away on exit. Letters animate individually only for scripts where splitting a word is safe
// (Latin, Japanese); Devanagari and Arabic animate per word so conjuncts and joining stay intact.
//
// CONTRACT: id · version · fontRoles · defaultDims(aspect) -> { w, h }
//   build({ title }, brand, fonts, { w, h, dur, lang }) -> { indexHtml, metaJson, extraFiles, layout }
//   fallbackBlocks(vars) -> [{ text, role, color }]

const K = require("./_common");

const id = "keyword";
const version = 1;
const REF = Object.freeze({ w: 1080, h: 420 });
const fontRoles = Object.freeze({ display: "Anton", body: "DM Sans", brandDisplay: false });
const DIMS = Object.freeze({ "9:16": { w: 1080, h: 420 }, "16:9": { w: 1400, h: 400 }, "1:1": { w: 1080, h: 420 } });
const TILT_DEG = -3;

function defaultDims(aspect) { return { ...(DIMS[aspect] || DIMS["9:16"]) }; }

function build(vars = {}, brand = {}, fonts = [], { w, h, dur, lang = "en" } = {}) {
  const G = K.canvas({ w, h, dur });
  const P = K.derivePalette(brand);
  const F = K.cardFonts(fonts);
  const raw = K.cleanText(vars.title, 48);
  if (!raw) throw K.kitError("keyword needs a title");
  const text = K.upper(raw, lang);
  const k = Math.min(G.w / REF.w, G.h / REF.h);
  const script = K.scriptOf(lang);
  const perLetter = script === "Latn" || script === "Jpan";
  const ls = script === "Latn" ? 0.01 : 0;
  const padX = 46 * k, padY = 14 * k, side = 70 * k, shadowX = 12 * k, shadowY = 14 * k, lhEm = 1.14;
  const sin = Math.abs(Math.sin((TILT_DEG * Math.PI) / 180)), cos = Math.cos((TILT_DEG * Math.PI) / 180);

  let maxSize = 150 * k, fit = null, pillW = 0, pillH = 0;
  for (let i = 0; i < 30; i++) {
    fit = K.fitText({ text, chain: F.displayChain, maxWidth: G.w - 2 * side - 2 * padX, maxLines: 2, maxSize, minSize: 44 * k, letterSpacingEm: ls, lang });
    pillW = fit.width / 0.97 + 2 * padX;
    pillH = fit.lines.length * fit.size * lhEm + 2 * padY;
    const rotH = pillH * cos + pillW * sin;
    if (rotH + shadowY + 2 * 16 * k <= G.h || fit.size <= 44 * k) break;
    maxSize = fit.size * 0.93;
  }
  const LH = fit.size * lhEm;
  const pillX = (G.w - pillW) / 2;
  const pillY = (G.h - pillH) / 2 - shadowY / 2;
  const radius = Math.min(pillH / 2, 26 * k);
  const mask = 0.14 * fit.size;

  const css = `
#kw { position: absolute; left: ${K.px(pillX)}; top: ${K.px(pillY)}; width: ${K.px(pillW)}; height: ${K.px(pillH)}; transform-origin: 50% 50%; opacity: 0; }
#kwShadow { position: absolute; left: 0; top: 0; width: 100%; height: 100%; border-radius: ${K.px(radius)}; background: rgba(0,0,0,0.34); opacity: 0; }
#kwPill { position: absolute; left: 0; top: 0; width: 100%; height: 100%; border-radius: ${K.px(radius)}; background: ${P.accent}; overflow: hidden; padding: ${K.px(padY)} ${K.px(padX)}; }
#kwPill .ln { position: relative; height: ${K.px(LH + 2 * mask)}; margin: ${K.px(-mask)} 0px; padding: ${K.px(mask)} 0px; overflow: hidden; white-space: nowrap; text-align: center; font-size: ${K.px(fit.size)}; line-height: ${K.px(LH)}; letter-spacing: ${ls}em; color: ${P.onAccent}; direction: ${K.isRtl(lang) ? "rtl" : "ltr"}; ${F.css(F.display)} }
#kwPill .ch { display: inline-block; }
`;

  let units = 0;
  const linesHtml = fit.lines.map((line) => {
    const spans = line.words.map((wd) => {
      if (!perLetter) { units++; return `<span class="w ch">${K.escapeHtml(wd)}</span>`; }
      const letters = K.graphemes(wd).map((g) => { units++; return `<span class="ch">${K.escapeHtml(g)}</span>`; }).join("");
      return `<span class="w">${letters}</span>`;
    }).join(fit.joiner ? " " : "");
    return `<div class="ln">${spans}</div>`;
  }).join("\n");
  const body = `<div id="kw">
<div id="kwShadow"></div>
<div id="kwPill">
${linesHtml}
</div>
</div>`;

  const n = Math.max(1, units);
  const st = Math.min(0.035, 0.42 / Math.max(1, n - 1));
  const lettersEnd = 0.16 + st * (n - 1) + 0.44;
  const entryEnd = Math.max(0.6, lettersEnd, 0.72);
  const T = K.cardTiming(G.dur, entryEnd);
  const timeline = [
    K.fromTo("#kw", { opacity: 0, scale: 0.35, rotation: -16 }, { opacity: 1, scale: 1, rotation: TILT_DEG, duration: T.d(0.56), ease: "back.out(1.9)" }, T.at(0.04)),
    K.fromTo("#kwPill .ch", { yPercent: 110 }, { yPercent: 0, duration: T.d(0.44), ease: "power3.out", stagger: K.r3(st * T.f) }, T.at(0.16)),
    K.fromTo("#kwShadow", { opacity: 0, x: 0, y: 0 }, { opacity: 1, x: shadowX, y: shadowY, duration: T.d(0.42), ease: "power2.out" }, T.at(0.3)),
    K.to("#kw", { opacity: 0, scale: 0.86, rotation: -8, duration: T.outDur, ease: "power2.in" }, T.outStart),
  ].join("\n");

  // Pill sample: inside the left padding, vertically centred, rotated about the pill centre.
  const cx = pillX + pillW / 2, cy = pillY + pillH / 2;
  const dx = -(pillW / 2 - padX * 0.45), rad = (TILT_DEG * Math.PI) / 180;
  const sample = K.point(cx + dx * Math.cos(rad), cy + dx * Math.sin(rad));

  return {
    indexHtml: K.documentHtml({ w: G.w, h: G.h, dur: G.dur, lang, title: id, faces: F.faces, css, body, script: timeline }),
    metaJson: K.metaJsonFor(G),
    extraFiles: [K.gsapExtraFile()],
    layout: {
      template: id,
      holdSec: [K.r3(T.holdStart + 0.05), K.r3(T.holdEnd - 0.05)],
      colors: { pill: P.accent, text: P.onAccent },
      boxes: { pill: K.box(pillX, pillY, pillW, pillH) },
      samples: { transparent: K.point(6, 6), pill: sample },
      lines: fit.lines.map((l) => l.text),
      fonts: { title: F.display.family },
      sizes: { title: fit.size },
      truncated: fit.truncated,
    },
  };
}

function fallbackBlocks(vars = {}, { lang = "en" } = {}) {
  return [{ text: K.upper(K.cleanText(vars.title, 48), lang), role: "display", color: "accent" }].filter((b) => b.text);
}

module.exports = { id, version, fontRoles, defaultDims, build, fallbackBlocks };
