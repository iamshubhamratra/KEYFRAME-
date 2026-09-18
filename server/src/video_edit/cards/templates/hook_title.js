// VIDEO EDIT CARD — hook_title: the opening promise, big and punchy (RENDER.md §7).
//
// WHY THIS DESIGN. The hook has ~1 s to stop the scroll, so it is the loudest card: the brand display face
// (Archivo Black by default) set uppercase at the largest size that fits three balanced lines, with a
// soft shadow so it reads over any frame and no panel to hide the speaker. One word — the given emphasis,
// else the longest — gets a brand-accent marker that wipes in behind it while the word flips to the
// on-accent colour. Motion: words pop up one by one (back-out), the marker wipes, the subtitle rises,
// and the words lift away staggered on exit.
//
// CONTRACT: id · version · fontRoles · defaultDims(aspect) -> { w, h }
//   build({ title, subtitle?, emphasis?: wordIndex|word|false }, brand, fonts, { w, h, dur, lang })
//     -> { indexHtml, metaJson, extraFiles, layout }
//   fallbackBlocks(vars) -> [{ text, role, color }]

const K = require("./_common");

const id = "hook_title";
const version = 1;
const REF = Object.freeze({ w: 1080, h: 640 });
const fontRoles = Object.freeze({ display: "Archivo Black", body: "DM Sans", brandDisplay: true });
const DIMS = Object.freeze({ "9:16": { w: 1080, h: 640 }, "16:9": { w: 1600, h: 520 }, "1:1": { w: 1080, h: 560 } });

function defaultDims(aspect) { return { ...(DIMS[aspect] || DIMS["9:16"]) }; }

function pickEmphasis(words, emphasis) {
  if (emphasis === false || emphasis === -1 || words.length < 2) return -1;
  if (Number.isInteger(emphasis)) return emphasis >= 0 && emphasis < words.length ? emphasis : -1;
  const letters = (s) => K.graphemes(String(s).replace(/[^\p{L}\p{N}]/gu, "")).length;
  if (typeof emphasis === "string" && emphasis.trim()) {
    const want = emphasis.trim().toLowerCase();
    const hit = words.findIndex((wd) => wd.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "") === want.replace(/[^\p{L}\p{N}]/gu, ""));
    if (hit >= 0) return hit;
  }
  let best = -1, bestLen = 0;
  words.forEach((wd, i) => { const n = letters(wd); if (n >= bestLen && n >= 4) { best = i; bestLen = n; } });
  return best;
}

function build(vars = {}, brand = {}, fonts = [], { w, h, dur, lang = "en" } = {}) {
  const G = K.canvas({ w, h, dur });
  const P = K.derivePalette(brand);
  const F = K.cardFonts(fonts);
  const rtl = K.isRtl(lang);
  const raw = K.cleanText(vars.title, 60);
  if (!raw) throw K.kitError("hook_title needs a title");
  const title = K.upper(raw, lang);
  const subtitle = K.cleanText(vars.subtitle, 70);
  const k = Math.min(G.w / REF.w, G.h / REF.h);
  const latin = K.scriptOf(lang) === "Latn";
  const ls = latin ? -0.01 : 0;
  const side = 64 * k, vpad = 30 * k, subGap = 22 * k;

  const sFit = subtitle ? K.fitText({ text: subtitle, chain: F.bodyChain, maxWidth: G.w - 2 * 96 * k, maxLines: 2, maxSize: 42 * k, minSize: 22 * k, lang }) : null;
  const sLH = sFit ? sFit.size * 1.28 : 0;
  const subH = sFit ? subGap + sFit.lines.length * sLH : 0;
  const lhEm = 1.06;
  let maxSize = 124 * k;
  let tFit = null;
  for (let i = 0; i < 30; i++) {
    tFit = K.fitText({ text: title, chain: F.displayChain, maxWidth: G.w - 2 * side, maxLines: 3, maxSize, minSize: 40 * k, letterSpacingEm: ls, lang });
    if (tFit.lines.length * tFit.size * lhEm + subH <= G.h - 2 * vpad || tFit.size <= 40 * k) break;
    maxSize = tFit.size * 0.94;
  }
  const LH = tFit.size * lhEm;
  const blockH = tFit.lines.length * LH + subH;
  const top = Math.max(0, (G.h - blockH) / 2);

  const allWords = tFit.lines.flatMap((l) => l.words);
  const em = pickEmphasis(allWords, vars.emphasis);

  const css = `
#htTitle { position: absolute; left: ${K.px(side)}; top: ${K.px(top)}; width: ${K.px(G.w - 2 * side)}; text-align: center; font-size: ${K.px(tFit.size)}; line-height: ${K.px(LH)}; letter-spacing: ${ls}em; color: ${P.text}; direction: ${rtl ? "rtl" : "ltr"}; ${F.css(F.display)} }
#htTitle .ln { height: ${K.px(LH)}; white-space: nowrap; }
#htTitle .w { opacity: 0; transform-origin: 50% 100%; text-shadow: 0px 4px 20px rgba(0,0,0,0.5); }
#htTitle .w.em { position: relative; isolation: isolate; }
#htMk { position: absolute; left: -0.12em; right: -0.12em; top: 0.06em; bottom: 0.04em; background: ${P.accent}; border-radius: 0.1em; z-index: -1; transform-origin: ${rtl ? "100%" : "0%"} 50%; opacity: 0; }
#htSub { position: absolute; left: ${K.px(96 * k)}; top: ${K.px(top + tFit.lines.length * LH + subGap)}; width: ${K.px(G.w - 2 * 96 * k)}; text-align: center; font-size: ${K.px(sFit ? sFit.size : 0)}; line-height: ${K.px(sLH)}; color: ${P.text}; direction: ${rtl ? "rtl" : "ltr"}; text-shadow: 0px 2px 12px rgba(0,0,0,0.55); opacity: 0; ${F.css(F.body)} }
`;

  let idx = 0;
  const linesHtml = tFit.lines.map((line) => {
    const spans = line.words.map((wd) => {
      const i = idx++;
      if (i === em) return `<span class="w em" id="htEm"><span id="htMk"></span>${K.escapeHtml(wd)}</span>`;
      return `<span class="w">${K.escapeHtml(wd)}</span>`;
    }).join(tFit.joiner ? " " : "");
    return `<div class="ln">${spans}</div>`;
  }).join("\n");
  const body = `<div id="htTitle">
${linesHtml}
</div>
${sFit ? `<div id="htSub">${sFit.lines.map((l) => K.escapeHtml(l.text)).join("<br>")}</div>` : ""}`;

  const n = Math.max(1, allWords.length);
  const st = Math.min(0.075, 0.45 / Math.max(1, n - 1));
  const wordsEnd = 0.05 + st * (n - 1) + 0.52;
  const mkAt = 0.05 + st * (n - 1) + 0.28;
  const subAt = em >= 0 ? mkAt + 0.2 : Math.max(0.3, wordsEnd - 0.2);
  const entryEnd = Math.max(wordsEnd, em >= 0 ? mkAt + 0.42 : 0, sFit ? subAt + 0.45 : 0);
  const T = K.cardTiming(G.dur, entryEnd);
  const ex = K.exitStagger(n, T.outDur, 0.025);
  const script = [
    K.fromTo("#htTitle .w", { opacity: 0, yPercent: 65, scale: 0.7 }, { opacity: 1, yPercent: 0, scale: 1, duration: T.d(0.52), ease: "back.out(1.7)", stagger: K.r3(st * T.f) }, T.at(0.05)),
    em >= 0 ? K.fromTo("#htMk", { opacity: 1, scaleX: 0 }, { opacity: 1, scaleX: 1, duration: T.d(0.42), ease: "power3.inOut" }, T.at(mkAt)) : "",
    em >= 0 ? K.fromTo("#htEm", { color: P.text, textShadow: "0px 4px 20px rgba(0,0,0,0.5)" }, { color: P.onAccent, textShadow: "0px 0px 0px rgba(0,0,0,0)", duration: T.d(0.24), ease: "power1.out" }, T.at(mkAt + 0.14)) : "",
    sFit ? K.fromTo("#htSub", { opacity: 0, y: 14 * k }, { opacity: 0.94, y: 0, duration: T.d(0.45), ease: "power2.out" }, T.at(subAt)) : "",
    K.to("#htTitle .w", { opacity: 0, yPercent: -30, duration: ex.duration, ease: "power2.in", stagger: ex.stagger }, T.outStart),
    sFit ? K.to("#htSub", { opacity: 0, duration: K.r3(T.outDur * 0.8), ease: "power2.in" }, T.outStart) : "",
  ].filter(Boolean).join("\n");

  return {
    indexHtml: K.documentHtml({ w: G.w, h: G.h, dur: G.dur, lang, title: id, faces: F.faces, css, body, script }),
    metaJson: K.metaJsonFor(G),
    extraFiles: [K.gsapExtraFile()],
    layout: {
      template: id,
      holdSec: [K.r3(T.holdStart + 0.05), K.r3(T.holdEnd - 0.05)],
      colors: { text: P.text, accent: P.accent, onAccent: P.onAccent },
      boxes: {
        title: K.box(side, top, G.w - 2 * side, tFit.lines.length * LH),
        subtitle: sFit ? K.box(96 * k, top + tFit.lines.length * LH + subGap, G.w - 2 * 96 * k, sFit.lines.length * sLH) : null,
      },
      samples: { transparent: K.point(6, 6) },
      emphasisIndex: em,
      lines: tFit.lines.map((l) => l.text),
      fonts: { title: F.display.family, subtitle: F.body.family },
      sizes: { title: tFit.size, subtitle: sFit ? sFit.size : null },
      truncated: tFit.truncated || !!(sFit && sFit.truncated),
    },
  };
}

function fallbackBlocks(vars = {}, { lang = "en" } = {}) {
  return [
    { text: K.upper(K.cleanText(vars.title, 60), lang), role: "display", color: "text" },
    { text: K.cleanText(vars.subtitle, 70), role: "body", color: "text" },
  ].filter((b) => b.text);
}

module.exports = { id, version, fontRoles, defaultDims, build, fallbackBlocks, pickEmphasis };
