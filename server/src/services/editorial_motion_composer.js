// EDITORIAL MOTION composer — a native GSAP + canvas "print-magazine kinetic type" film.
// The pack `editorial-motion` (manifest renderer:"editorial-motion") routes here from
// attemptLlmComposition, exactly like the flagship / kinetic / product-showcase composers.
//
// Ported from the imported OmniMotion/React template ("Editorial Motion"). The React
// runtime is replaced by KEYFRAME's HyperFrames contract, but the identity is kept:
//   • a PERSISTENT paper WORLD — a warm paper ground with a faint drifting column grid,
//     floating paper grain and a soft warm edge-vignette, painted on ONE <canvas> as a
//     pure function of the renderer's hf-seek time (deterministic; every cut lands on the
//     same living paper), PLUS a persistent running-head + folio CHROME (KeyFrame · the
//     issue label · Vol. 01 · url) that carries continuity across every page.
//   • oversized high-contrast SERIF headlines that reveal word-by-word (last word set in
//     brand-accent italic), hairline RULES that draw, mono section/issue labels, editorial
//     PULL-QUOTES, and FIGURE plates that hold a real screenshot behind a paper-wipe with
//     a thin rule + a mono caption; the accent STATEMENT poster page; a colophon CTA.
//
// EVERYTHING is theme-driven: editorialTheme(accent) derives the accent-text, the drawn
// rules, the pull-quote mark, the highlighted italic words, the statement field and the
// CTA — so a brand skin recolors the WHOLE film (rules, accents, highlight text, kickers,
// CTA), not just body copy. The paper ground, ink and hairline structure are the pack's
// identity and stay put.
//
// Engineering contract (identical to the other native composers): one paused GSAP
// timeline on window.__timelines["vid"]; direct-child .clip scenes on unique tracks; a
// boundary opacity:0 hard-kill per scene (the paper + chrome persist behind them); ONE
// seek-safe caption node (#cap-text) driven by a single onUpdate proxy; finite repeats;
// cqw units + container-type:size (portrait-native, 9:16); hidden = opacity:0 only.
// Portrait is detected from dims (W<H); no manifest flag. Deterministic.

const { fontFaceCss, isBundled } = require("../fonts/pack_fonts");
const { isTrustedProminent, isLogo } = require("./asset_priority");
const { logoMark } = require("./logo_render");
const { plateBox } = require("./responsive");
const { resolveBrand } = require("./brand_kit");

const GSAP_CDN = "https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js";
// Fraunces (bundled) is the high-contrast serif display carrying the template's Playfair
// spirit; Space Grotesk is the bundled grotesque for section labels / running head;
// JetBrains Mono is the bundled folio/issue-number/caption face; Inter → system-ui body.
const SERIF = "Fraunces";
const LABEL = "Space Grotesk";
const MONO = "JetBrains Mono";
const BODY = "Inter";

// The template's default spot accent + paper stock when no brand is applied.
const DEF_ACCENT = "#B4302A"; // editorial vermilion
const PAPER = "#faf9f6";
const INK = "#17150f";

// ---- helpers -----------------------------------------------------------------
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
const r = (n) => Math.round((Number(n) || 0) * 100) / 100;
const hexToRgb = (h) => { const n = parseInt(String(h).replace("#", ""), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
function relLum(hex) {
  const [rr, gg, bb] = hexToRgb(hex).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * rr + 0.7152 * gg + 0.0722 * bb;
}
function seedFrom(str) { let h = 2166136261; const s = String(str || "editorial"); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) || 7; }
// finite yoyo repeat count for a segment of `t` seconds at period `c`.
function reps(t, c) { return Math.max(0, Math.floor((Number(t) || 0) / (c || 1)) - 1); }

// ---- theme -------------------------------------------------------------------
// resolveBrand fits the brand accent to the LIGHT paper (isDark:false → darkened for
// contrast on cream) and passes the pack accent through untouched when no skin — so a
// null skin renders the exact default editorial byte-for-byte and resolvedBrand is null
// (honest "unbranded"). When applied, the single accent becomes the brand's and every
// derived value (accent-text, drawn rules, pull-quote mark, highlight italics, statement
// field, CTA arrow) follows, and resolvedBrand echoes what was worn.
function editorialTheme(brandSkin) {
  const fontFace =
    (isBundled(SERIF) ? fontFaceCss(SERIF) : "") +
    (isBundled(LABEL) ? fontFaceCss(LABEL) : "") +
    (isBundled(MONO) ? fontFaceCss(MONO) : "");
  let accent = DEF_ACCENT, resolvedBrand = null;
  try {
    const brand = resolveBrand(brandSkin, { ground: PAPER, isDark: false, packAccents: [DEF_ACCENT] });
    if (brand.applied) {
      accent = brand.accent || accent;
      resolvedBrand = {
        ...(brandSkin && typeof brandSkin === "object" ? brandSkin : {}),
        accents: [accent], emphasis: brand.emphasis, adjusted: brand.adjusted,
        dropped: brand.dropped, tier: brand.tier, applied: true,
      };
    }
  } catch { accent = DEF_ACCENT; resolvedBrand = null; }
  const onAccent = relLum(accent) > 0.55 ? INK : "#FFFFFF";
  return {
    accent, onAccent, paper: PAPER, ink: INK,
    inkSoft: "rgba(23,21,15,0.62)", inkFaint: "rgba(23,21,15,0.34)",
    // A legible accent on cream: mixed toward ink so a pale brand still reads as text.
    accentText: `color-mix(in oklab, ${accent} 82%, ${INK})`,
    // Drawn scene + chrome hairlines take the accent — brand repaints the rules.
    rule: accent,
    plateBg: "#efece4", plateBorder: INK,
    serifStack: `'${SERIF}', Georgia, 'Times New Roman', serif`,
    labelStack: `'${LABEL}', 'Inter', system-ui, sans-serif`,
    monoStack: `'${MONO}', ui-monospace, monospace`,
    bodyStack: `'${BODY}', system-ui, sans-serif`,
    fontFace, resolvedBrand,
  };
}

// ---- fixed copy (localizable) — FALLBACK labels only, no demo content ---------
const STRINGS = {
  mastheadKicker: "Issue 01 — The Feature",
  coverKicker: "Cover Story",
  promptKicker: "The Prompt",
  figureKicker: "The Plate",
  galleryKicker: "The Gallery",
  indexKicker: "The Feature Set",
  statementKicker: "The Statement",
  ctaKicker: "Your Turn",
  ctaButton: "Create with KeyFrame",
  ctaTagline: "Turn language into moving image.",
  runningHead: "KeyFrame",
  issueLabel: "The AI Video Issue",
  folioLeft: "Vol. 01",
  ctaUrl: "keyframe.ai",
  attribution: "Written by you",
};

// ---- content extraction (shared shapes) --------------------------------------
function wordsOf(t) { return String(t || "").trim().split(/\s+/).filter(Boolean); }
function bullets(scene, n) {
  let list = Array.isArray(scene.onScreenText) ? scene.onScreenText.filter(Boolean).map(String) : [];
  if (!list.length && scene.subtext) list = String(scene.subtext).split(/[.;\n•]|\s—\s/).map((s) => s.trim()).filter((s) => s.length > 2);
  return list.slice(0, n);
}
function pickNumber(scene) {
  const src = [scene.emphasis, scene.subtext, scene.headline, ...(Array.isArray(scene.onScreenText) ? scene.onScreenText : [])]
    .map((x) => String(x || "")).find((x) => /\d/.test(x)) || "";
  return /\d/.test(src);
}
// Serif headlines are large — size down as copy grows so a portrait column never overflows.
function headlineSize(text, base) {
  const len = String(text || "").length;
  if (len > 42) return base * 0.58;
  if (len > 28) return base * 0.72;
  if (len > 18) return base * 0.86;
  return base;
}
// Split a headline into serif word spans for the line-by-line reveal; the last word is
// set in accent italic (the editorial highlight). Static styling on the INNER span.
function serifWords(id, text, accentLast) {
  const ws = wordsOf(text).slice(0, 12);
  return ws.map((w, i) => {
    const hot = accentLast && i === ws.length - 1;
    return `<span class="ed-sw ${id}-sw" style="display:inline-block;opacity:0;margin:0 0.24em 0.04em 0;${hot ? "font-style:italic;" : ""}">${esc(w)}</span>`;
  }).join("");
}

// ---- asset gate + editorial FIGURE plate -------------------------------------
function screenOk(a) {
  if (!a || !a.path) return false;
  if (isLogo(a)) return false; // the logo is CTA / colophon material, not a figure plate
  if (a.type === "video" || /\.(mp4|webm|mov)($|\?)/i.test(a.path)) return false;
  if (/\.svg($|\?)/i.test(a.path)) return false;
  return isTrustedProminent(a) || a.cdProminence === "hero" || a.cdProminence === "support";
}
function logoAssetOf(assets) {
  return (Array.isArray(assets) ? assets : []).find((a) => a && a.path && isLogo(a) && !/\.(mp4|webm|mov)($|\?)/i.test(a.path)) || null;
}

// A ruled image PLATE holding a real screenshot — or, with no asset, an intentional
// branded placeholder (paper wash + faint accent tint + a ruled crop-mark) so an empty
// slot still reads as a designed figure, never blank. A `.${cid}-wipe` paper cover sits
// on top; GSAP retracts it (scaleX 1→0, origin right) to reveal the plate. Absolutely
// filled; the caller sizes the outer box.
function plate(cid, theme, asset) {
  const inner = asset && asset.path
    ? `<img src="${esc(asset.path)}" alt="${esc(asset.alt || "")}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;filter:contrast(1.04) saturate(0.96);">`
    : `<div style="position:absolute;inset:0;background:${theme.plateBg};"></div>` +
      `<div style="position:absolute;inset:0;background:${theme.accent};opacity:0.1;"></div>` +
      `<div style="position:absolute;inset:0;background-image:linear-gradient(${theme.inkFaint} 1px,transparent 1px),linear-gradient(90deg,${theme.inkFaint} 1px,transparent 1px);background-size:12% 12%;opacity:0.4;"></div>` +
      `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;"><div style="width:14%;aspect-ratio:1;border:0.4cqw solid ${theme.accent};transform:rotate(45deg);"></div></div>`;
  return `<div style="position:absolute;inset:0;overflow:hidden;background:${theme.plateBg};border:0.32cqw solid ${theme.plateBorder};">
    ${inner}
    <div class="${cid}-wipe" style="position:absolute;inset:0;background:${theme.paper};transform-origin:right center;will-change:transform;"></div>
  </div>`;
}
// Portrait shots want a taller frame; wide shots a shorter one. Returns a height multiple
// of the plate's WIDTH (in cqw).
function plateHmul(asset) {
  const ratio = Number(asset && asset.ratio) || (asset && asset.width && asset.height ? asset.width / asset.height : 0);
  if (ratio && ratio < 0.9) return 1.34;   // phone / portrait shot
  if (ratio && ratio > 1.6) return 0.62;   // wide desktop / dashboard
  return 0.82;                             // square-ish default
}

// PORTRAIT PLATE SIZING. plateHmul above fixes this pack's plate PROPORTIONS; the widths
// were literals with nothing checking the result against a 177.8cqw-tall portrait column,
// so an editorial plate sat at ~a quarter of the frame with the rest empty. plateBox scales
// the (width, height) pair uniformly — proportions preserved — and is a no-op in landscape.
function fitPlate(ctx, wCqw, asset) {
  return plateBox(ctx && ctx.W, ctx && ctx.H, wCqw, wCqw * plateHmul(asset));
}

// ---- scene clip open ---------------------------------------------------------
function open(id, ctx) { return `<div class="clip ed-scene" id="${id}" data-start="${ctx.T}" data-duration="${r(ctx.L)}" data-track-index="${ctx.track}" style="opacity:0;">`; }

// ---- archetype selection -----------------------------------------------------
function archetypeFor(scene, i, total) {
  const k = String(scene.kind || "").toLowerCase();
  const p = String(scene.purpose || "").toLowerCase();
  if (i === 0 || k === "hook" || k === "title" || /hook|intro|open|masthead/.test(p)) return "masthead";
  if (i === total - 1 || k === "cta" || /cta|close|sign\s*up|subscribe|download|get\s*started|colophon/.test(p)) return "colophon";
  if (k === "quote" || /quote|testimonial|manifesto|statement|pull/.test(p)) return "pullquote";
  if (/feature|product|showcase|demo|screenshot|gallery|hero|proof/.test(p + k)) return "figure";
  if (bullets(scene, 2).length >= 2 || (pickNumber(scene) && /stat|metric|number|result/.test(p + k))) return "index";
  return "headline";
}

// ---- scene builders ((scene, ctx, assets) -> {html, s}) ----------------------

// SCENE — MASTHEAD: the issue kicker rises, a hairline rule draws, the oversized serif
// title lands (last word in accent italic), a subtitle settles. Cover of the issue.
function bMasthead(scene, ctx, sceneAssets) {
  const { id, T, L, theme, S } = ctx;
  const kick = esc(scene.kicker || S.mastheadKicker);
  const title = scene.headline || scene.title || "";
  const asset = (sceneAssets && sceneAssets[0]) || null;
  // A hero plate lands under the cover title when the CD pins a hero shot to the opener —
  // the issue's cover image, revealed behind the paper-wipe.
  const plateFit = fitPlate(ctx, 60, asset); // plate width in cqw, fitted to the canvas
  const pw = plateFit.w, ph = plateFit.h;
  const fig = asset
    ? `<div class="${id}-fig" style="opacity:0;position:relative;width:${pw}cqw;height:${ph}cqw;margin-top:5cqw;">${plate(`${id}p`, theme, asset)}</div>`
    : "";
  const html = `${open(id, ctx)}<div class="ed-page">
    <div class="ed-kicker ${id}-kick" style="opacity:0;">${kick}</div>
    <div class="ed-rule ${id}-rule" style="width:64%;margin:4cqw 0 5cqw;transform:scaleX(0);"></div>
    <div class="ed-serif ${id}-title" style="font-size:${r(headlineSize(title, 15))}cqw;">${serifWords(id, title, true)}</div>
    ${scene.subtext ? `<div class="ed-body ${id}-sub" style="opacity:0;margin-top:4cqw;max-width:78%;">${esc(scene.subtext)}</div>` : ""}
    ${fig}
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.4},${T});`,
    `tl.fromTo(".${id}-kick",{opacity:0,y:-16},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 0.2)});`,
    `tl.fromTo(".${id}-rule",{scaleX:0},{scaleX:1,duration:0.6,ease:"power2.inOut",transformOrigin:"left center"},${r(T + 0.4)});`,
    `tl.fromTo(".${id}-sw",{opacity:0,y:28},{opacity:1,y:0,duration:0.6,ease:"power3.out",stagger:0.09},${r(T + 0.55)});`,
    scene.subtext ? `tl.fromTo(".${id}-sub",{opacity:0,y:16},{opacity:1,y:0,duration:0.55,ease:"power2.out"},${r(T + 1.2)});` : "",
    asset ? `tl.fromTo(".${id}-fig",{opacity:0,y:28},{opacity:1,y:0,duration:0.55,ease:"power3.out"},${r(T + 1.35)});` : "",
    asset ? `tl.fromTo(".${id}p-wipe",{scaleX:1},{scaleX:0,duration:0.7,ease:"power3.inOut"},${r(T + 1.55)});` : "",
    `tl.to(".${id}-title",{y:"-=0.6cqw",duration:${r(Math.max(1.6, L - 1.8))},ease:"sine.inOut",yoyo:true,repeat:1},${r(T + 1.4)});`,
  ].filter(Boolean);
  return { html, s };
}

// SCENE — HEADLINE: a mono section label, a drawn rule and a big serif headline that
// reveals word-by-word (last word accent italic), with an optional deck. The set piece.
function bHeadline(scene, ctx) {
  const { id, T, L, theme, S } = ctx;
  const kick = esc(scene.kicker || S.coverKicker);
  const title = scene.headline || scene.title || "";
  const html = `${open(id, ctx)}<div class="ed-page">
    <div class="ed-kicker ${id}-kick" style="opacity:0;margin-bottom:3.4cqw;">${kick}</div>
    <div class="ed-serif ${id}-head" style="font-size:${r(headlineSize(title, 11))}cqw;">${serifWords(id, title, true)}</div>
    <div class="ed-rule ${id}-rule" style="width:40%;margin-top:5cqw;transform:scaleX(0);"></div>
    ${scene.subtext ? `<div class="ed-deck ${id}-deck" style="opacity:0;margin-top:4cqw;max-width:80%;"><span class="ed-tick"></span>${esc(scene.subtext)}</div>` : ""}
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.35},${T});`,
    `tl.fromTo(".${id}-kick",{opacity:0,y:-14},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 0.2)});`,
    `tl.fromTo(".${id}-sw",{opacity:0,y:26},{opacity:1,y:0,duration:0.58,ease:"power3.out",stagger:0.09},${r(T + 0.4)});`,
    `tl.fromTo(".${id}-rule",{scaleX:0},{scaleX:1,duration:0.55,ease:"power2.inOut",transformOrigin:"left center"},${r(T + 0.95)});`,
    scene.subtext ? `tl.fromTo(".${id}-deck",{opacity:0,x:20},{opacity:1,x:0,duration:0.55,ease:"power2.out"},${r(T + 1.25)});` : "",
  ].filter(Boolean);
  return { html, s };
}

// SCENE — PULLQUOTE: an oversized accent quotation mark, then an italic serif statement
// that reveals word-by-word from faint to full, and an attribution rule + mono line.
function bPullquote(scene, ctx, sceneAssets) {
  const { id, T, L, theme, S } = ctx;
  const kick = esc(scene.kicker || S.promptKicker);
  const text = scene.headline || scene.title || scene.subtext || "";
  const attr = esc(String(scene.emphasis || S.attribution).slice(0, 40));
  const asset = (sceneAssets && sceneAssets[0]) || null;
  const ws = wordsOf(text).slice(0, 24).map((w) =>
    `<span class="ed-pw ${id}-pw" style="opacity:0.12;">${esc(w)} </span>`).join("");
  // A supporting ruled PLATE sits beneath the attribution when an image is assigned — a
  // real screenshot alongside the quotation, revealed behind the paper-wipe.
  const plateFit = fitPlate(ctx, 46, asset); // plate width in cqw, fitted to the canvas
  const pw = plateFit.w, ph = plateFit.h;
  const fig = asset
    ? `<div class="${id}-fig" style="opacity:0;position:relative;width:${pw}cqw;height:${ph}cqw;margin-top:5cqw;">${plate(`${id}p`, theme, asset)}</div>`
    : "";
  const html = `${open(id, ctx)}<div class="ed-page">
    <div class="ed-kicker ${id}-kick" style="opacity:0;margin-bottom:3cqw;">${kick}</div>
    <div class="ed-quote ${id}-body" style="opacity:0;font-size:${r(headlineSize(text, 8.5))}cqw;">
      <span class="ed-qmark" style="color:${theme.accentText};">&ldquo;</span>${ws}
    </div>
    <div class="${id}-attr" style="display:flex;align-items:center;gap:2.6cqw;margin-top:6cqw;opacity:0;">
      <div class="ed-rule" style="width:14cqw;flex:0 0 auto;"></div>
      <div class="ed-mono">${attr}</div>
    </div>
    ${fig}
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.4},${T});`,
    `tl.fromTo(".${id}-kick",{opacity:0,y:-14},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 0.2)});`,
    `tl.fromTo(".${id}-body",{opacity:0,y:18},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 0.4)});`,
    `tl.to(".${id}-pw",{opacity:1,duration:0.4,ease:"none",stagger:{each:${r(Math.max(0.04, (L * 0.5) / Math.max(1, wordsOf(text).length)))}}},${r(T + 0.6)});`,
    `tl.fromTo(".${id}-attr",{opacity:0,x:-18},{opacity:1,x:0,duration:0.55,ease:"power2.out"},${r(T + Math.max(1.2, L * 0.7))});`,
    asset ? `tl.fromTo(".${id}-fig",{opacity:0,y:26},{opacity:1,y:0,duration:0.5,ease:"power3.out"},${r(T + 0.7)});` : "",
    asset ? `tl.fromTo(".${id}p-wipe",{scaleX:1},{scaleX:0,duration:0.65,ease:"power3.inOut"},${r(T + 0.9)});` : "",
    asset ? `tl.to(".${id}-fig",{y:"-=0.7cqw",duration:2.1,ease:"sine.inOut",yoyo:true,repeat:${reps(L - 1.9, 2.1)},overwrite:"auto"},${r(T + 1.9)});` : "",
  ].filter(Boolean);
  return { html, s };
}

// SCENE — FIGURE: a mono section label over a single ruled PLATE (real screenshot behind
// a paper-wipe reveal) with a thin rule + mono caption, and a serif headline below.
function bFigure(scene, ctx, sceneAssets) {
  const { id, T, L, theme, S } = ctx;
  const kick = esc(scene.kicker || S.figureKicker);
  const asset = (sceneAssets && sceneAssets[0]) || null;
  const cap = esc((Array.isArray(scene.onScreenText) && scene.onScreenText[0]) || scene.emphasis || S.figureKicker);
  const title = scene.headline || scene.title || "";
  // The figure showed a kicker, a plate, ONE caption and the headline — every other line
  // the script wrote for this scene (the second/third on-screen text, the subtext) was
  // dropped, so a feature or stat beat reached the film as a picture with a title and
  // nothing explaining it. The first unused line becomes the deck under the headline.
  const deck = (() => {
    const ost = Array.isArray(scene.onScreenText) ? scene.onScreenText.filter(Boolean).map(String) : [];
    const used = new Set([String(scene.headline || ""), String(scene.title || ""), ost[0] || ""].map((x) => x.trim().toLowerCase()));
    return ost.find((t) => !used.has(String(t).trim().toLowerCase())) || (scene.subtext ? String(scene.subtext) : "");
  })();
  const plateFit = fitPlate(ctx, 84, asset); // plate width in cqw, fitted to the canvas
  const pw = plateFit.w, ph = plateFit.h;
  const html = `${open(id, ctx)}<div class="ed-page" style="justify-content:flex-start;padding-top:16%;">
    <div class="ed-kicker ${id}-kick" style="opacity:0;margin-bottom:3cqw;">${kick}</div>
    <div class="${id}-fig" style="opacity:0;position:relative;width:${pw}cqw;height:${ph}cqw;">${plate(`${id}p`, theme, asset)}</div>
    <div class="${id}-cap" style="display:flex;align-items:center;gap:2cqw;margin-top:2.4cqw;opacity:0;">
      <div class="ed-rule" style="width:8cqw;flex:0 0 auto;height:0.3cqw;"></div>
      <div class="ed-mono" style="font-size:2cqw;">${cap}</div>
    </div>
    ${title ? `<div class="ed-serif ${id}-head" style="font-size:${r(headlineSize(title, 8))}cqw;margin-top:4.5cqw;">${serifWords(id, title, true)}</div>` : ""}
    ${deck ? `<div class="ed-body ${id}-deck" style="opacity:0;margin-top:2.2cqw;max-width:80%;text-align:center;">${esc(deck)}</div>` : ""}
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.35},${T});`,
    `tl.fromTo(".${id}-kick",{opacity:0,y:-14},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 0.2)});`,
    `tl.fromTo(".${id}-fig",{opacity:0,y:30},{opacity:1,y:0,duration:0.5,ease:"power3.out"},${r(T + 0.35)});`,
    `tl.fromTo(".${id}p-wipe",{scaleX:1},{scaleX:0,duration:0.7,ease:"power3.inOut"},${r(T + 0.55)});`,
    `tl.fromTo(".${id}-cap",{opacity:0,x:-14},{opacity:1,x:0,duration:0.5,ease:"power2.out"},${r(T + 1.1)});`,
    title ? `tl.fromTo(".${id}-sw",{opacity:0,y:22},{opacity:1,y:0,duration:0.5,ease:"power3.out",stagger:0.08},${r(T + 1.3)});` : "",
    deck ? `tl.fromTo(".${id}-deck",{opacity:0,y:14},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 1.6)});` : "",
    `tl.to(".${id}-fig",{y:"-=0.8cqw",duration:2.2,ease:"sine.inOut",yoyo:true,repeat:${reps(L - 1.6, 2.2)},overwrite:"auto"},${r(T + 1.7)});`,
  ].filter(Boolean);
  return { html, s };
}

// SCENE — GALLERY: a section label over an asymmetric grid of ruled PLATES (real
// screenshots behind paper-wipes) each with a mono caption. Every angle of the issue.
function bGallery(scene, ctx, sceneAssets) {
  const { id, T, L, theme, S } = ctx;
  const kick = esc(scene.kicker || S.galleryKicker);
  const shots = (sceneAssets || []).slice(0, 4);
  // Asymmetric editorial grid inside the content band (percent of the band, not the page).
  const GRID = [
    { x: 0, y: 0, w: 56, h: 30 }, { x: 60, y: 0, w: 40, h: 30 },
    { x: 0, y: 34, w: 40, h: 34 }, { x: 44, y: 34, w: 56, h: 34 },
  ];
  const plates = shots.map((a, i) => {
    const g = GRID[i] || GRID[0];
    const cap = esc((Array.isArray(scene.onScreenText) && scene.onScreenText[i]) || `Plate 0${i + 1}`);
    return `<div class="${id}-fr" style="position:absolute;left:${g.x}%;top:${g.y}%;width:${g.w}%;opacity:0;">
      <div style="position:relative;width:100%;height:${r(g.h * 1.5)}cqw;">${plate(`${id}p${i}`, theme, a)}</div>
      <div class="ed-mono" style="font-size:1.8cqw;margin-top:1.2cqw;">${cap}</div>
    </div>`;
  }).join("");
  const wipeTargets = shots.map((_, i) => `.${id}p${i}-wipe`).join(",");
  const html = `${open(id, ctx)}<div class="ed-page" style="justify-content:flex-start;padding-top:14%;">
    <div class="ed-kicker ${id}-kick" style="opacity:0;margin-bottom:2.4cqw;">${kick}</div>
    ${scene.headline ? `<div class="ed-serif ${id}-head" style="font-size:${r(headlineSize(scene.headline, 7))}cqw;margin-bottom:4cqw;">${esc(scene.headline)}</div>` : ""}
    <div style="position:relative;width:100%;height:76cqw;">${plates}</div>
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.35},${T});`,
    `tl.fromTo(".${id}-kick",{opacity:0,y:-14},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 0.2)});`,
    scene.headline ? `tl.fromTo(".${id}-head",{opacity:0,y:16},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 0.35)});` : "",
    `tl.fromTo(".${id}-fr",{opacity:0,y:36},{opacity:1,y:0,duration:0.55,ease:"power3.out",stagger:0.14},${r(T + 0.5)});`,
    shots.length ? `tl.fromTo("${wipeTargets}",{scaleX:1},{scaleX:0,duration:0.6,ease:"power3.inOut",stagger:0.14},${r(T + 0.7)});` : "",
    `tl.to(".${id}-fr",{y:"-=0.7cqw",duration:2.1,ease:"sine.inOut",yoyo:true,repeat:${reps(L - 1.6, 2.1)},stagger:0.1,overwrite:"auto"},${r(T + 1.7)});`,
  ].filter(Boolean);
  return { html, s };
}

// SCENE — INDEX: a serif headline, a drawn rule and numbered feature rows (mono numeral in
// accent + serif title + body) divided by hairline rules. The feature set / contents page.
function bIndex(scene, ctx, sceneAssets) {
  const { id, T, L, theme, S } = ctx;
  const kick = esc(scene.kicker || S.indexKicker);
  const title = scene.headline || scene.title || "";
  const asset = (sceneAssets && sceneAssets[0]) || null;
  let rows = bullets(scene, asset ? 3 : 4);
  if (!rows.length) rows = [String(scene.subtext || title)].filter(Boolean);
  // When a screenshot is assigned, a ruled FIGURE plate sits (right-aligned, editorial
  // asymmetry) between the headline and the numbered rows — so a stat/feature-set scene
  // shows the number/rows AND the assigned dashboard shot behind a paper-wipe reveal.
  const plateFit = fitPlate(ctx, 52, asset); // plate width in cqw, fitted to the canvas
  const pw = plateFit.w, ph = plateFit.h;
  const fig = asset
    ? `<div class="${id}-fig" style="opacity:0;position:relative;width:${pw}cqw;height:${ph}cqw;align-self:flex-end;margin:3cqw 0 1cqw;">${plate(`${id}p`, theme, asset)}</div>`
    : "";
  const rowHtml = rows.map((c, i) => {
    const parts = String(c).split(/\s[—–]\s|:\s/);
    const head = parts[0];
    const body = parts.length > 1 ? parts.slice(1).join(" — ") : "";
    return `<div class="ed-row ${id}-row" style="opacity:0;">
      <div class="ed-num" style="color:${theme.accentText};">0${i + 1}</div>
      <div style="flex:1;">
        <div class="ed-rowtitle">${esc(head)}</div>
        ${body ? `<div class="ed-rowbody">${esc(body)}</div>` : ""}
      </div>
    </div>`;
  }).join("");
  const html = `${open(id, ctx)}<div class="ed-page" style="justify-content:flex-start;padding-top:15%;">
    <div class="ed-kicker ${id}-kick" style="opacity:0;margin-bottom:2.6cqw;">${kick}</div>
    ${title ? `<div class="ed-serif ${id}-head" style="font-size:${r(headlineSize(title, 9))}cqw;">${esc(title)}</div>` : ""}
    ${fig}
    <div class="ed-rule ${id}-rule" style="width:100%;margin:4cqw 0 1cqw;transform:scaleX(0);"></div>
    <div style="width:100%;">${rowHtml}</div>
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.35},${T});`,
    `tl.fromTo(".${id}-kick",{opacity:0,y:-14},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 0.2)});`,
    title ? `tl.fromTo(".${id}-head",{opacity:0,y:20},{opacity:1,y:0,duration:0.55,ease:"power3.out"},${r(T + 0.35)});` : "",
    asset ? `tl.fromTo(".${id}-fig",{opacity:0,y:26},{opacity:1,y:0,duration:0.5,ease:"power3.out"},${r(T + 0.5)});` : "",
    asset ? `tl.fromTo(".${id}p-wipe",{scaleX:1},{scaleX:0,duration:0.65,ease:"power3.inOut"},${r(T + 0.7)});` : "",
    `tl.fromTo(".${id}-rule",{scaleX:0},{scaleX:1,duration:0.55,ease:"power2.inOut",transformOrigin:"left center"},${r(T + 0.7)});`,
    `tl.fromTo(".${id}-row",{opacity:0,x:26},{opacity:1,x:0,duration:0.5,ease:"power2.out",stagger:0.16},${r(T + 0.95)});`,
    asset ? `tl.to(".${id}-fig",{y:"-=0.7cqw",duration:2.1,ease:"sine.inOut",yoyo:true,repeat:${reps(L - 1.6, 2.1)},overwrite:"auto"},${r(T + 1.7)});` : "",
  ].filter(Boolean);
  return { html, s };
}

// SCENE — COLOPHON / CTA: the logo mark (uploaded logo, else a built ruled monogram) sets
// above a section label, a drawn rule and a serif call, a solid ink button and a mono url.
function bColophon(scene, ctx, logo) {
  const { id, T, L, theme, S } = ctx;
  const kick = esc(scene.kicker || S.ctaKicker);
  const title = scene.headline || scene.title || "";
  const btn = esc(String(scene.emphasis || S.ctaButton).slice(0, 28));
  const tagline = esc(String(scene.subtext || S.ctaTagline).slice(0, 60));
  const url = esc(String(S.ctaUrl).toUpperCase());
  const mark = logo && logo.path
    ? logoMark(logo, { sizeCqw: 18, ground: theme.paper, glow: null, escape: esc })
    : `<div style="position:relative;width:16cqw;height:16cqw;border:0.4cqw solid ${theme.ink};display:flex;align-items:center;justify-content:center;">
        <div style="font-family:${theme.serifStack};font-weight:900;font-size:9cqw;line-height:1;color:${theme.accentText};">K</div>
        <div style="position:absolute;left:0;right:0;bottom:-0.4cqw;height:0.4cqw;background:${theme.accent};"></div>
      </div>`;
  const html = `${open(id, ctx)}<div class="ed-page">
    <div class="${id}-mark" style="opacity:0;margin-bottom:4cqw;">${mark}</div>
    <div class="ed-kicker ${id}-kick" style="opacity:0;margin-bottom:2.2cqw;">${kick}</div>
    <div class="ed-rule ${id}-rule" style="width:44%;margin-bottom:4cqw;transform:scaleX(0);"></div>
    <div class="ed-serif ${id}-head" style="font-size:${r(headlineSize(title, 12))}cqw;">${serifWords(id, title, true)}</div>
    <div class="ed-body ${id}-tag" style="opacity:0;margin-top:3cqw;max-width:74%;">${tagline}</div>
    <div class="ed-btn ${id}-btn" style="opacity:0;margin-top:5cqw;color:${theme.paper};">${btn} <span style="color:${theme.accent};">&rarr;</span></div>
    <div class="ed-mono ${id}-url" style="opacity:0;margin-top:3cqw;font-size:2.2cqw;">${url}</div>
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.4},${T});`,
    `tl.fromTo(".${id}-mark",{opacity:0,scale:0.7,y:16},{opacity:1,scale:1,y:0,duration:0.6,ease:"back.out(1.6)"},${r(T + 0.3)});`,
    `tl.fromTo(".${id}-kick",{opacity:0,y:-12},{opacity:1,y:0,duration:0.45,ease:"power2.out"},${r(T + 0.6)});`,
    `tl.fromTo(".${id}-rule",{scaleX:0},{scaleX:1,duration:0.55,ease:"power2.inOut",transformOrigin:"left center"},${r(T + 0.8)});`,
    `tl.fromTo(".${id}-sw",{opacity:0,y:24},{opacity:1,y:0,duration:0.55,ease:"power3.out",stagger:0.08},${r(T + 1)});`,
    `tl.fromTo(".${id}-tag",{opacity:0,y:12},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 1.5)});`,
    `tl.fromTo(".${id}-btn",{opacity:0,y:16},{opacity:1,y:0,duration:0.5,ease:"back.out(1.7)"},${r(T + 1.75)});`,
    `tl.to(".${id}-btn",{scale:1.03,duration:0.7,ease:"sine.inOut",yoyo:true,repeat:${reps(L - 2.35, 0.7)},overwrite:"auto",transformOrigin:"left center"},${r(T + 2.35)});`,
    `tl.fromTo(".${id}-url",{opacity:0},{opacity:1,duration:0.5},${r(T + 2)});`,
  ];
  return { html, s };
}

const BUILDERS = { masthead: bMasthead, headline: bHeadline, pullquote: bPullquote, figure: bFigure, gallery: bGallery, index: bIndex, colophon: bColophon };

// ---- persistent PAPER canvas (hf-seek) ---------------------------------------
// One canvas painted purely from the renderer's hf-seek time: the paper base, a faint
// drifting editorial column grid, floating paper grain and a soft warm edge-vignette.
// Tinted ONLY with theme.accent + ink over the paper, so a brand skin subtly re-tints the
// living paper. Live preview drives it off the timeline; render is hf-seek only.
function paperClip(theme, dims, D, seed) {
  const W = dims.width, H = dims.height;
  const [ar, ag, ab] = hexToRgb(theme.accent);
  const [pr, pg, pb] = hexToRgb(theme.paper);
  const [ir, ig, ib] = hexToRgb(theme.ink);
  const html = `<div id="ed-paper-clip" class="clip" data-start="0" data-duration="${D}" data-track-index="0" data-layout-allow-occlusion style="background:${theme.paper};">
    <canvas id="ed-paper" width="${W}" height="${H}" style="position:absolute;inset:0;width:100%;height:100%;"></canvas>
  </div>`;
  const script = `(function(){
  var cv=document.getElementById("ed-paper");if(!cv||!cv.getContext)return;var cx=cv.getContext("2d");if(!cx)return;
  var W=${W},H=${H};
  function A(a){return "rgba(${ar},${ag},${ab},"+a+")";}
  function I(a){return "rgba(${ir},${ig},${ib},"+a+")";}
  var PP="rgb(${pr},${pg},${pb})";
  var sd=${seed >>> 0};function rnd(){sd=(sd*1664525+1013904223)>>>0;return sd/4294967296;}
  var N=Math.round(70*(W*H)/(1080*1920)),GR=[];
  for(var i=0;i<N;i++){GR.push({x:rnd(),y:rnd(),s:0.6+1.4*rnd(),ph:rnd()*6.28});}
  var COLS=6;
  function draw(t){
    // paper base
    cx.fillStyle=PP;cx.fillRect(0,0,W,H);
    // faint editorial column guides (drift very slowly, one accent-tinted)
    var m=W*0.075,gw=(W-2*m)/COLS,dx=Math.sin(t*0.12)*W*0.006;
    for(var c=0;c<=COLS;c++){var x=m+c*gw+dx;cx.strokeStyle=(c===2)?A(0.08):I(0.04);cx.lineWidth=1;cx.beginPath();cx.moveTo(x,H*0.03);cx.lineTo(x,H*0.97);cx.stroke();}
    // slow horizontal baseline sweep (accent hairline)
    var by=H*(0.5+0.42*Math.sin(t*0.16));cx.strokeStyle=A(0.06);cx.lineWidth=1.4;cx.beginPath();cx.moveTo(m,by);cx.lineTo(W-m,by);cx.stroke();
    // floating paper grain (ink specks drifting up)
    for(var i=0;i<GR.length;i++){var d=GR[i];var y=(d.y*H-t*7)%H;if(y<0)y+=H;var op=0.03+0.05*(0.5+0.5*Math.sin(t*1.3+d.ph));cx.globalAlpha=op;cx.fillStyle=I(1);cx.beginPath();cx.arc(d.x*W,y,d.s,0,6.283);cx.fill();}
    cx.globalAlpha=1;
    // soft warm edge-vignette (darkens the paper margins back down)
    var vg=cx.createRadialGradient(W*0.5,H*0.46,Math.min(W,H)*0.28,W*0.5,H*0.5,Math.max(W,H)*0.72);
    vg.addColorStop(0,I("0"));vg.addColorStop(1,I("0.06"));cx.fillStyle=vg;cx.fillRect(0,0,W,H);
  }
  // Painted ONLY from the renderer's hf-seek time — deterministic, seek-exact, capture-safe.
  window.KF_EDIT=draw;window.addEventListener("hf-seek",function(e){draw((e.detail&&e.detail.time)||0);});draw(0);
})();`;
  return { html, script };
}

// ---- persistent running-head + folio CHROME (top layer, always on) -----------
// The through-line: KeyFrame · the issue label above a hairline rule at the top, and a
// hairline rule above Vol. 01 · url at the bottom. The rules take the accent, so brand
// repaints the chrome across the whole film.
function chromeClip(theme, S, D) {
  return `<div id="ed-chrome" class="clip" data-start="0" data-duration="${D}" data-track-index="41" data-layout-allow-occlusion style="pointer-events:none;">
    <div style="position:absolute;left:7.5%;right:7.5%;top:4.6%;">
      <div style="display:flex;justify-content:space-between;align-items:flex-end;font-family:${theme.labelStack};font-weight:700;font-size:1.9cqw;letter-spacing:0.28em;text-transform:uppercase;color:${theme.ink};padding-bottom:1.2cqw;">
        <span>${esc(S.runningHead)}</span><span style="color:${theme.inkSoft};">${esc(S.issueLabel)}</span>
      </div>
      <div style="height:0.24cqw;background:${theme.rule};"></div>
    </div>
    <div style="position:absolute;left:7.5%;right:7.5%;bottom:4.6%;">
      <div style="height:0.24cqw;background:${theme.rule};"></div>
      <div style="display:flex;justify-content:space-between;align-items:flex-start;font-family:${theme.monoStack};font-weight:500;font-size:1.7cqw;letter-spacing:0.16em;text-transform:uppercase;color:${theme.inkSoft};padding-top:1.2cqw;">
        <span>${esc(S.folioLeft)}</span><span>${esc(S.ctaUrl)}</span>
      </div>
    </div>
  </div>`;
}

// ---- grain overlay (top layer) -----------------------------------------------
const GRAIN_SVG = "<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2'/></filter><rect width='100%' height='100%' filter='url(#n)' opacity='0.5'/></svg>";
const GRAIN_URI = "data:image/svg+xml;base64," + Buffer.from(GRAIN_SVG).toString("base64");
function grainClip(D) {
  return `<div id="ed-grain" class="clip" data-start="0" data-duration="${D}" data-track-index="40" data-layout-allow-occlusion style="pointer-events:none;background-image:url('${GRAIN_URI}');background-size:240px 240px;opacity:0.05;mix-blend-mode:multiply;"></div>`;
}

// ---- style -------------------------------------------------------------------
function styleBlock(theme, portrait) {
  const pagePad = portrait ? "15% 7.5% 15%" : "12% 8% 12%";
  return `${theme.fontFace}
  * { box-sizing:border-box; margin:0; padding:0; }
  html, body { width:100%; height:100%; overflow:hidden; background:${theme.paper}; }
  #root { position:relative; overflow:hidden; isolation:isolate; background:${theme.paper}; container-type:size; color:${theme.ink}; font-family:${theme.bodyStack}; }
  .clip { position:absolute; top:0; left:0; width:100%; height:100%; overflow:hidden; }
  .ed-page { position:absolute; inset:0; display:flex; flex-direction:column; align-items:flex-start; justify-content:center; padding:${pagePad}; text-align:left; }
  .ed-serif { font-family:${theme.serifStack}; font-weight:900; line-height:0.94; letter-spacing:-0.02em; color:${theme.ink}; }
  .ed-serif .ed-sw:last-child { color:${theme.accentText}; }
  .ed-sw { will-change:transform,opacity; }
  .ed-kicker { display:inline-block; font-family:${theme.labelStack}; font-weight:700; font-size:2.1cqw; letter-spacing:0.34em; text-transform:uppercase; color:${theme.accentText}; }
  .ed-body { font-family:${theme.bodyStack}; font-weight:450; font-size:2.9cqw; line-height:1.42; color:${theme.inkSoft}; }
  .ed-deck { position:relative; font-family:${theme.bodyStack}; font-weight:450; font-size:2.9cqw; line-height:1.42; color:${theme.inkSoft}; padding-left:3.4cqw; }
  .ed-tick { position:absolute; left:0; top:0.2cqw; width:0.6cqw; height:6.4cqw; background:${theme.rule}; }
  .ed-mono { font-family:${theme.monoStack}; font-weight:500; font-size:2.2cqw; letter-spacing:0.16em; text-transform:uppercase; color:${theme.inkSoft}; }
  .ed-rule { height:0.4cqw; background:${theme.rule}; will-change:transform; }
  .ed-quote { font-family:${theme.serifStack}; font-style:italic; font-weight:500; line-height:1.16; letter-spacing:-0.01em; color:${theme.ink}; }
  .ed-qmark { font-family:${theme.serifStack}; font-style:normal; font-weight:900; font-size:1.6em; vertical-align:-0.12em; margin-right:0.06em; }
  .ed-pw { will-change:opacity; }
  .ed-row { display:flex; gap:3.4cqw; align-items:flex-start; width:100%; padding:2.8cqw 0; border-bottom:0.3cqw solid ${theme.ink}; }
  .ed-num { font-family:${theme.monoStack}; font-weight:500; font-size:4.4cqw; width:12cqw; flex:0 0 auto; }
  .ed-rowtitle { font-family:${theme.serifStack}; font-weight:700; font-size:4.8cqw; line-height:1.0; color:${theme.ink}; }
  .ed-rowbody { font-family:${theme.bodyStack}; font-weight:450; font-size:2.5cqw; line-height:1.4; color:${theme.inkSoft}; margin-top:1.2cqw; max-width:56cqw; }
  .ed-btn { display:inline-flex; align-items:center; gap:1.6cqw; padding:2.8cqw 5.4cqw; background:${theme.ink}; font-family:${theme.labelStack}; font-weight:700; font-size:3.2cqw; letter-spacing:0.1em; text-transform:uppercase; will-change:transform,opacity; }
  #caps { position:absolute; inset:0; display:flex; justify-content:center; align-items:flex-end; padding-bottom:${portrait ? "13%" : "9%"}; z-index:60; pointer-events:none; }
  #cap-pill { max-width:82%; height:fit-content; flex:0 0 auto; text-align:center; padding:1.4cqw 3cqw; opacity:0; background:${theme.ink}; border-bottom:0.3cqw solid ${theme.accent}; }
  #cap-text { font-family:${theme.monoStack}; font-weight:500; font-size:2.3cqw; letter-spacing:0.04em; line-height:1.35; color:${theme.paper}; }`;
}

// ---- MAIN --------------------------------------------------------------------
function buildComposition({ storyboard, dims, framePack, captionCues, assets, brandSkin = null, localized = null } = {}) {
  const theme = editorialTheme(brandSkin);
  const S = localized ? { ...STRINGS, ...localized } : STRINGS;
  const sb = storyboard || {};
  const W = (dims && dims.width) || 1080, H = (dims && dims.height) || 1920;
  const portrait = W < H;
  const scenes = Array.isArray(sb.scenes) && sb.scenes.length
    ? sb.scenes.slice(0, 12)
    : [{ id: "s1", start: 0, duration: 5, kind: "hook", headline: sb.title || "KEYFRAME" }];
  const D = r(sb.durationSec || scenes.reduce((a, s) => Math.max(a, (Number(s.start) || 0) + (Number(s.duration) || 0)), 0) || 12);
  const seed = seedFrom(sb.title || (scenes[0] && scenes[0].headline) || "editorial");

  // ---- Assets: distribute real screenshots across DISPLAY-CAPABLE scenes -------
  // A screenshot must NEVER be stranded on a scene that can't show it (masthead / pullquote
  // / index / colophon). The Creative Director's per-asset `sceneId` is a HINT: honored
  // when that scene can display an image, else the shot is redistributed to the least-loaded
  // display scene — so every usable screenshot actually appears. The logo is reserved for
  // the colophon mark.
  const logo = logoAssetOf(assets);
  const shots = (Array.isArray(assets) ? assets : []).filter(screenOk)
    .sort((a, b) => (Number(b.cdScore) || 0) - (Number(a.cdScore) || 0));
  const baseArch = scenes.map((scene, i) => archetypeFor(scene, i, scenes.length));
  // EVERY content archetype hosts its assigned asset in editorial language — only the
  // colophon (CTA logo lockup) stays asset-free. So the CD's per-asset sceneId hint for a
  // stat/quote/hook scene lands on that very scene instead of being redistributed away.
  const canShow = (a) => a !== "colophon";
  const displayIdx = scenes.map((_, i) => i).filter((i) => canShow(baseArch[i]));
  // Empty-guard: if nothing is display-capable but shots exist, force a middle (non-cta)
  // scene into a plate-bearing FIGURE so a usable screenshot is never dropped to text-only.
  if (!displayIdx.length && shots.length) {
    let j = baseArch.findIndex((a) => a !== "masthead" && a !== "colophon");
    if (j < 0) j = baseArch.findIndex((a) => a !== "colophon");
    if (j >= 0) { baseArch[j] = "figure"; displayIdx.push(j); }
  }
  const sceneIdOf = (i) => (scenes[i].id != null ? String(scenes[i].id) : `s${i + 1}`);
  const sceneShots = scenes.map(() => []);
  if (displayIdx.length && shots.length) {
    const leftovers = [];
    for (const a of shots) {
      const sid = a.sceneId != null ? String(a.sceneId) : null;
      const target = sid != null ? displayIdx.find((i) => sceneIdOf(i) === sid) : undefined;
      if (target != null) sceneShots[target].push(a); else leftovers.push(a);
    }
    for (const a of leftovers) {
      let best = displayIdx[0];
      for (const i of displayIdx) if (sceneShots[i].length < sceneShots[best].length) best = i;
      sceneShots[best].push(a);
    }
    for (const i of displayIdx) sceneShots[i] = sceneShots[i].slice(0, 4);
  }

  const scriptStart = (i) => scenes.slice(0, i).reduce((a, s) => a + (Number(s.duration) || 0), 0);
  const bodyParts = [], sceneScripts = [];

  scenes.forEach((scene, i) => {
    const T = r(scene.start != null ? scene.start : scriptStart(i));
    const L = r(scene.duration || 5);
    let arch = baseArch[i];
    let sceneAssets = sceneShots[i];
    // A display-capable scene that received screenshots shows them. The editorial text
    // pages (masthead / pullquote / index) KEEP their identity and host ONE plate inside
    // their own layout (a hero shot under the cover title, a supporting plate beside a
    // pull-quote, a figure over the numbered feature rows) — so a stat/quote/hook scene
    // shows the number/quote AND the assigned screenshot. Pure picture scenes promote:
    // 2+ → an asymmetric gallery grid; 1 → a focused figure plate.
    if (canShow(arch) && sceneAssets.length) {
      if (arch === "masthead" || arch === "pullquote" || arch === "index") {
        sceneAssets = sceneAssets.slice(0, 1);
      } else if (sceneAssets.length >= 2) { arch = "gallery"; sceneAssets = sceneAssets.slice(0, 4); }
      else { arch = "figure"; sceneAssets = sceneAssets.slice(0, 1); }
    }
    const ctx = { id: `s${i + 1}`, T, L, E: r(T + L), i, isLast: i === scenes.length - 1, track: 2 + i, theme, S, W, H, portrait };
    const built = (BUILDERS[arch] || bHeadline)(scene, ctx, arch === "colophon" ? logo : sceneAssets);
    bodyParts.push(built.html);
    sceneScripts.push(built.s.filter(Boolean).join("\n  "));
    if (!ctx.isLast) sceneScripts.push(`kill("#${ctx.id}",${r(T + L)});`);
  });

  const cues = (Array.isArray(captionCues) ? captionCues : [])
    .filter((c) => c && c.text != null)
    .map((c) => [r(c.start != null ? c.start : c.startSec || 0), r(c.end != null ? c.end : (c.start || 0) + 2), String(c.text)]);

  const paper = paperClip(theme, { width: W, height: H }, D, seed);
  const caps = `<div id="caps" class="clip" data-start="0" data-duration="${D}" data-track-index="50"><div id="cap-pill"><div id="cap-text"></div></div></div>`;

  const script = `(function(){
  var D=${D};
  var tl=gsap.timeline({paused:true});
  var $=function(s){return document.querySelector(s);};
  function kill(id,t){tl.set(id,{opacity:0},t);}
  function type(sel,full,at,dur){var o={n:0};tl.to(o,{n:full.length,duration:dur,ease:"none",snap:{n:1},onUpdate:function(){var e=$(sel);if(e){var s=full.slice(0,Math.round(o.n));if(e.textContent!==s)e.textContent=s;}}},at);}

  ${sceneScripts.join("\n  ")}

  var cues=${JSON.stringify(cues)};
  tl.to({},{duration:D,ease:"none",onUpdate:function(){
    var now=tl.time();
    if(window.KF_EDIT)window.KF_EDIT(now);
    var cap=$("#cap-pill"),txt=$("#cap-text");
    if(cap&&txt){var a=null;for(var k=0;k<cues.length;k++){if(now>=cues[k][0]&&now<cues[k][1]){a=cues[k];break;}}if(a){if(txt.textContent!==a[2])txt.textContent=a[2];cap.style.opacity="1";}else cap.style.opacity="0";}
  }},0);

  window.__timelines=window.__timelines||{};
  window.__timelines["vid"]=tl;
  if(typeof navigator==="undefined"||!navigator.webdriver){tl.play(0);tl.eventCallback("onComplete",function(){tl.restart();});}
})();`;

  const indexHtml = [
    `<!DOCTYPE html>`, `<html lang="en">`, `<head>`, `<meta charset="utf-8">`, `<title>vid</title>`,
    `<script src="${GSAP_CDN}"></script>`,
    `<style>`, styleBlock(theme, portrait), `</style>`, `</head>`, `<body>`,
    `<div id="root" class="composition" data-composition-id="vid" data-width="${W}" data-height="${H}" data-start="0" data-duration="${D}" style="width:${W}px;height:${H}px;">`,
    paper.html,
    bodyParts.join("\n"),
    chromeClip(theme, S, D),
    grainClip(D),
    caps,
    `</div>`,
    `<script>`, paper.script, `</script>`,
    `<script>`, script, `</script>`,
    `</body>`, `</html>`,
  ].join("\n");

  const metaJson = JSON.stringify({ compositionId: "vid", width: W, height: H, fps: (dims && dims.fps) || 30, duration: D });
  return { indexHtml, metaJson, resolvedBrand: theme.resolvedBrand };
}

module.exports = { buildComposition, STRINGS };
