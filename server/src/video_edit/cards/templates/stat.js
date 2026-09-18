// VIDEO EDIT CARD — stat: a number that counts up, with its meaning under it (RENDER.md §7).
//
// WHY THIS DESIGN. A stat lands when the viewer watches it arrive, so the value counts up as an odometer:
// every digit is a vertical strip of numerals behind a fixed-width window, and the strips roll to their
// final digit (the units spin twice, the tens once, higher places straight to the digit). The count is
// pure transform tweens — no onUpdate text writes — so every frame depends only on the timeline position,
// however the renderer seeks. Windows are as wide as the widest numeral of the face (from the TTF), so
// columns never jitter. The value is set in the brand accent on a dark rounded panel, an accent rule grows
// under it, and the label rises word by word. A value with no digits pops in as static text.
//
// CONTRACT: id · version · fontRoles · defaultDims(aspect) -> { w, h }
//   build({ value, title?, subtitle? }, brand, fonts, { w, h, dur, lang }) -> { indexHtml, metaJson, extraFiles, layout }
//   parseValue(value) -> { prefix, parts:[{ kind:'digit', d } | { kind:'static', text }], suffix, digits } | null
//   fallbackBlocks(vars) -> [{ text, role, color }]

const K = require("./_common");

const id = "stat";
const version = 1;
const REF = Object.freeze({ w: 1080, h: 620 });
const fontRoles = Object.freeze({ display: "Archivo Black", body: "DM Sans", brandDisplay: true });
const DIMS = Object.freeze({ "9:16": { w: 1080, h: 620 }, "16:9": { w: 1200, h: 600 }, "1:1": { w: 1080, h: 620 } });
const MAX_DIGITS = 9;

function defaultDims(aspect) { return { ...(DIMS[aspect] || DIMS["9:16"]) }; }

const VALUE_RE = /^(\D*?)(\d{1,3}(?:[,  ]\d{3})+|\d+)(?:([.,])(\d{1,3}))?(\D*)$/u;

function parseValue(value) {
  const s = K.cleanText(value, 16);
  const m = VALUE_RE.exec(s);
  if (!m) return null;
  const [, prefix, intPart, decSep, decimals, suffix] = m;
  const parts = [];
  for (const ch of intPart) parts.push(/\d/.test(ch) ? { kind: "digit", d: Number(ch) } : { kind: "static", text: ch });
  if (decSep) {
    parts.push({ kind: "static", text: decSep });
    for (const ch of decimals) parts.push({ kind: "digit", d: Number(ch) });
  }
  const digits = parts.filter((p) => p.kind === "digit").length;
  if (!digits || digits > MAX_DIGITS) return null;
  return { prefix, parts, suffix, digits, text: s };
}

function build(vars = {}, brand = {}, fonts = [], { w, h, dur, lang = "en" } = {}) {
  const G = K.canvas({ w, h, dur });
  const P = K.derivePalette(brand);
  const F = K.cardFonts(fonts);
  const rtl = K.isRtl(lang);
  const valueText = K.cleanText(vars.value, 16);
  if (!valueText) throw K.kitError("stat needs a value");
  const label = K.cleanText(vars.title, 60);
  const subtitle = K.cleanText(vars.subtitle, 70);
  const parsed = parseValue(valueText);
  const k = Math.min(G.w / REF.w, G.h / REF.h);
  const side = 40 * k, padX = 64 * k, padT = 34 * k, padB = 40 * k, barGap = 16 * k, barH = 8 * k, barW = 96 * k, labelGap = 22 * k, subGap = 8 * k;
  const maxContentW = G.w - 2 * side - 2 * padX;

  const lFit = label ? K.fitText({ text: label, chain: F.bodyChain, maxWidth: maxContentW, maxLines: 2, maxSize: 46 * k, minSize: 24 * k, lang }) : null;
  const lLH = lFit ? lFit.size * 1.25 : 0;
  const sFit = subtitle ? K.fitText({ text: subtitle, chain: F.bodyChain, maxWidth: maxContentW, maxLines: 1, maxSize: 30 * k, minSize: 18 * k, lang }) : null;
  const sLH = sFit ? sFit.size * 1.3 : 0;
  const below = barGap + barH + (lFit ? labelGap + lFit.lines.length * lLH : 0) + (sFit ? subGap + sLH : 0);

  // Value size: width of the digit windows + static glyphs, and the vertical budget.
  // Digit windows are one tight line tall (cap-height numerals never clip, whichever vertical metrics the
  // browser uses), so a rolling strip shows at most slivers of the neighbouring numerals.
  const chain = F.displayChain;
  const cellEm = K.tightLineEm(F.display.metrics);
  let digitEm = 0;
  for (let d = 0; d <= 9; d++) digitEm = Math.max(digitEm, K.measureEm(String(d), chain));
  const staticText = parsed ? [parsed.prefix, ...parsed.parts.filter((p) => p.kind === "static").map((p) => p.text), parsed.suffix].join("") : valueText;
  const widthEm = parsed ? K.measureEm(staticText, chain) + parsed.digits * digitEm : K.measureEm(valueText, chain);
  const vByWidth = (maxContentW * 0.97) / Math.max(0.1, widthEm);
  const vByHeight = (G.h - 2 * 12 * k - padT - padB - below) / cellEm;
  const vSize = Math.floor(Math.max(36 * k, Math.min(210 * k, vByWidth, vByHeight)));
  const vH = vSize * cellEm;
  const valueW = widthEm * vSize;

  const contentW = Math.max(valueW, lFit ? lFit.width / 0.97 : 0, sFit ? sFit.width / 0.97 : 0, barW);
  const panelW = Math.min(G.w - 2 * side, Math.max(520 * k, contentW + 2 * padX));
  const panelH = padT + vH + below + padB;
  const panelX = (G.w - panelW) / 2;
  const panelY = Math.max(0, (G.h - panelH) / 2);
  const barY = padT + vH + barGap;
  const labelY = barY + barH + labelGap;
  const subY = labelY + (lFit ? lFit.lines.length * lLH : 0) + subGap;

  const css = `
#stP { position: absolute; left: ${K.px(panelX)}; top: ${K.px(panelY)}; width: ${K.px(panelW)}; height: ${K.px(panelH)}; opacity: 0; }
#stBg { position: absolute; left: 0; top: 0; width: 100%; height: 100%; border-radius: ${K.px(36 * k)}; background: ${K.rgba(P.panel, 0.86)}; box-shadow: 0px ${K.px(18 * k)} ${K.px(44 * k)} rgba(0,0,0,0.32); }
#stVal { position: absolute; left: 0; top: ${K.px(padT)}; width: 100%; height: ${K.px(vH)}; display: flex; justify-content: center; direction: ltr; font-size: ${K.px(vSize)}; line-height: ${K.px(vH)}; color: ${P.accentOnDark}; ${F.css(F.display)} }
#stVal .sv { display: block; height: ${K.px(vH)}; line-height: ${K.px(vH)}; white-space: pre; }
#stVal .dg { position: relative; display: block; width: ${K.px(digitEm * vSize)}; height: ${K.px(vH)}; overflow: hidden; }
#stVal .strip { position: absolute; left: 0; top: 0; width: 100%; }
#stVal .strip span { display: block; height: ${K.px(vH)}; line-height: ${K.px(vH)}; text-align: center; }
#stBar { position: absolute; left: ${K.px((panelW - barW) / 2)}; top: ${K.px(barY)}; width: ${K.px(barW)}; height: ${K.px(barH)}; border-radius: ${K.px(barH / 2)}; background: ${P.accentOnDark}; transform-origin: 50% 50%; }
#stLabel { position: absolute; left: ${K.px(padX)}; top: ${K.px(labelY)}; width: ${K.px(panelW - 2 * padX)}; text-align: center; font-size: ${K.px(lFit ? lFit.size : 0)}; line-height: ${K.px(lLH)}; color: ${P.textOnPanel}; direction: ${rtl ? "rtl" : "ltr"}; ${F.css(F.body)} }
#stLabel .ln { height: ${K.px(lLH)}; white-space: nowrap; }
#stLabel .w { opacity: 0; }
#stSub { position: absolute; left: ${K.px(padX)}; top: ${K.px(subY)}; width: ${K.px(panelW - 2 * padX)}; height: ${K.px(sLH)}; text-align: center; white-space: nowrap; font-size: ${K.px(sFit ? sFit.size : 0)}; line-height: ${K.px(sLH)}; color: ${P.textOnPanel}; direction: ${rtl ? "rtl" : "ltr"}; opacity: 0; ${F.css(F.body)} }
`;

  // Digit strips.
  const strips = [];
  let valueHtml;
  if (parsed) {
    const pieces = [];
    if (parsed.prefix) pieces.push(`<span class="sv">${K.escapeHtml(parsed.prefix)}</span>`);
    let i = 0;
    for (const part of parsed.parts) {
      if (part.kind === "static") { pieces.push(`<span class="sv">${K.escapeHtml(part.text)}</span>`); continue; }
      const place = parsed.digits - 1 - i;
      const spins = place === 0 ? 2 : place === 1 ? 1 : 0;
      const cells = [];
      for (let s = 0; s < spins; s++) for (let d = 0; d <= 9; d++) cells.push(d);
      for (let d = 0; d <= part.d; d++) cells.push(d);
      strips.push({ id: `stS${i}`, cells: cells.length });
      pieces.push(`<span class="dg"><span class="strip" id="stS${i}">${cells.map((d) => `<span>${d}</span>`).join("")}</span></span>`);
      i++;
    }
    if (parsed.suffix) pieces.push(`<span class="sv">${K.escapeHtml(parsed.suffix)}</span>`);
    valueHtml = pieces.join("");
  } else {
    valueHtml = `<span class="sv">${K.escapeHtml(valueText)}</span>`;
  }

  const labelHtml = lFit ? lFit.lines.map((l) => `<div class="ln">${l.words.map((wd) => `<span class="w">${K.escapeHtml(wd)}</span>`).join(lFit.joiner ? " " : "")}</div>`).join("\n") : "";
  const body = `<div id="stP">
<div id="stBg"></div>
<div id="stVal">${valueHtml}</div>
<div id="stBar"></div>
${lFit ? `<div id="stLabel">\n${labelHtml}\n</div>` : ""}
${sFit ? `<div id="stSub">${K.escapeHtml(sFit.lines.map((l) => l.text).join(" "))}</div>` : ""}
</div>`;

  const rollAt = 0.16, rollDur = 1.15, rollStagger = 0.05;
  const rollEnd = parsed ? rollAt + rollStagger * (strips.length - 1) + rollDur : 0.62;
  const nLabel = lFit ? lFit.lines.reduce((a, l) => a + l.words.length, 0) : 0;
  const lst = Math.min(0.04, 0.3 / Math.max(1, nLabel - 1));
  const labelAt = 0.62;
  const entryEnd = Math.max(rollEnd, 0.95, lFit ? labelAt + lst * (nLabel - 1) + 0.4 : 0, sFit ? 1.2 : 0);
  const T = K.cardTiming(G.dur, entryEnd);
  const lines = [
    K.fromTo("#stP", { opacity: 0, scale: 0.94, y: 16 * k }, { opacity: 1, scale: 1, y: 0, duration: T.d(0.42), ease: "power2.out" }, T.at(0.02)),
  ];
  if (parsed) {
    strips.forEach((s, i) => {
      lines.push(K.fromTo(`#${s.id}`, { y: 0 }, { y: -(s.cells - 1) * vH, duration: T.d(rollDur), ease: "power3.out" }, T.at(rollAt + i * rollStagger)));
    });
  } else {
    lines.push(K.fromTo("#stVal", { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1, duration: T.d(0.5), ease: "back.out(1.6)" }, T.at(0.12)));
  }
  lines.push(K.fromTo("#stBar", { scaleX: 0 }, { scaleX: 1, duration: T.d(0.45), ease: "power3.out" }, T.at(0.5)));
  if (lFit) lines.push(K.fromTo("#stLabel .w", { opacity: 0, y: 12 * k }, { opacity: 1, y: 0, duration: T.d(0.4), ease: "power2.out", stagger: K.r3(lst * T.f) }, T.at(labelAt)));
  if (sFit) lines.push(K.fromTo("#stSub", { opacity: 0 }, { opacity: 0.8, duration: T.d(0.4), ease: "power2.out" }, T.at(0.8)));
  lines.push(K.to("#stP", { opacity: 0, y: -14 * k, duration: T.outDur, ease: "power2.in" }, T.outStart));

  return {
    indexHtml: K.documentHtml({ w: G.w, h: G.h, dur: G.dur, lang, title: id, faces: F.faces, css, body, script: lines.join("\n") }),
    metaJson: K.metaJsonFor(G),
    extraFiles: [K.gsapExtraFile()],
    layout: {
      template: id,
      holdSec: [K.r3(T.holdStart + 0.05), K.r3(T.holdEnd - 0.05)],
      rollSec: parsed ? [K.r3(T.at(rollAt)), K.r3(T.at(rollAt + rollStagger * (strips.length - 1)) + T.d(rollDur))] : null,
      colors: { panel: P.panel, panelAlpha: 0.86, accent: P.accentOnDark, text: P.textOnPanel },
      boxes: {
        panel: K.box(panelX, panelY, panelW, panelH),
        value: K.box(panelX + (panelW - valueW) / 2, panelY + padT, valueW, vH),
        bar: K.box(panelX + (panelW - barW) / 2, panelY + barY, barW, barH),
        label: lFit ? K.box(panelX + padX, panelY + labelY, panelW - 2 * padX, lFit.lines.length * lLH) : null,
      },
      samples: {
        transparent: K.point(6, 6),
        panel: K.point(panelX + 22 * k, panelY + panelH / 2),
        accent: K.point(panelX + panelW / 2, panelY + barY + barH / 2),
      },
      value: parsed ? { digits: parsed.digits, strips: strips.length } : { digits: 0, strips: 0 },
      fonts: { value: F.display.family, label: F.body.family },
      sizes: { value: vSize, label: lFit ? lFit.size : null },
      truncated: !!(lFit && lFit.truncated) || !!(sFit && sFit.truncated),
    },
  };
}

function fallbackBlocks(vars = {}) {
  return [
    { text: K.cleanText(vars.value, 16), role: "display", color: "accent" },
    { text: K.cleanText(vars.title, 60), role: "body", color: "text" },
    { text: K.cleanText(vars.subtitle, 70), role: "body", color: "text" },
  ].filter((b) => b.text);
}

module.exports = { id, version, fontRoles, defaultDims, build, fallbackBlocks, parseValue };
