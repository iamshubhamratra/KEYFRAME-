// MINIMAL LUXURY composer — a native GSAP + canvas "minimalist-luxury keynote" film.
// The pack `minimal-luxury` (manifest renderer:"minimal-luxury") routes here from
// attemptLlmComposition, exactly like the flagship / kinetic / product-showcase composers.
//
// Ported from the imported OmniMotion/React template ("Minimal Luxury"). The React
// runtime is replaced by KEYFRAME's HyperFrames contract, but the identity is kept:
//   • a PERSISTENT, understated ambient backdrop — a warm ivory ground, ONE slowly
//     drifting soft accent glow, a slow soft light sweep, a whisper of fine grain and a
//     barely-there vignette — painted on ONE <canvas> as a pure function of the
//     renderer's hf-seek time (deterministic; flows unbroken across every cut). Restraint
//     is the point: the backdrop breathes, it never performs.
//   • vast negative space, a single elegant SERIF headline with fine letter-spacing, thin
//     hairline rules, wide-tracked small-cap labels, one restrained accent (a refined gold
//     by default), a thin-bordered screenshot frame with generous margin, and a minimal
//     outline-button CTA. Understated, premium — a fashion / watch-brand keynote.
//
// EVERYTHING is theme-driven: luxuryTheme(accent) derives the accent hairlines, the
// highlight word, the frame border tint, the CTA outline and the canvas glow — so a brand
// skin recolors the WHOLE film (hairlines, highlight, CTA, glow), not just text.
//
// Engineering contract (identical to the other native composers): one paused GSAP
// timeline on window.__timelines["vid"]; direct-child .clip scenes on unique tracks (2+i);
// a boundary opacity:0 hard-kill per scene (the ambient persists behind them); ONE
// seek-safe caption node (#cap-text) driven by a single onUpdate proxy; finite repeats;
// cqw units + container-type:size (portrait-native, 9:16); hidden = opacity:0 only. GSAP
// animates the OUTER element; static transforms live on an inner wrapper GSAP never
// touches. Portrait is detected from dims (W<H); no manifest flag. Deterministic.

const { fontFaceCss, isBundled } = require("../fonts/pack_fonts");
const { varyArchetypes } = require("./motion_planner");
const { isTrustedProminent, isLogo } = require("./asset_priority");
const { logoMark } = require("./logo_render");
const { plateBox } = require("./responsive");
const { charSpans, wordCharSpans, supportLine } = require("./text_fx");
const { resolveBrand } = require("./brand_kit");
const { GSAP_CDN, r, esc, hexToRgb, relLum, bullets, logoAssetOf, grainUri, displayShadow } = require("./composer_kit");

// Sora (the template's Google display) is NOT bundled for the CDN-free render — Fraunces
// is the bundled elegant serif that carries the same quiet-luxury spirit (Instrument Serif
// is its bundled fallback); IBM Plex Mono is the bundled wide-tracked small-cap LABEL face;
// Inter falls to system-ui for body.
const DISPLAY = "Fraunces";
const SERIF2 = "Instrument Serif";
const LABEL = "IBM Plex Mono";
const BODY = "Inter";

// The template's default LIGHT keynote — a warm ivory ground with a refined gold accent
// when no brand is applied. Luxury reads as ivory + thin gold hairlines + serif.
const DEF_ACCENT = "#9A7B3D"; // refined antique gold
const GROUND = "#F4F1EA";     // warm ivory
const GROUND_2 = "#E9E4D8";   // deeper ivory (vignette / frame wash)
const INK = "#1A1712";        // warm near-black ink

// ---- helpers -----------------------------------------------------------------
function seedFrom(str) { let h = 2166136261; const s = String(str || "luxury"); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) || 7; }
// finite yoyo repeat count for a segment of `t` seconds at period `c`.
function reps(t, c) { return Math.max(0, Math.floor((Number(t) || 0) / (c || 1)) - 1); }

// ---- theme -------------------------------------------------------------------
// resolveBrand fits the brand accent to the ivory ground (isDark:false → darkened for
// contrast on light) and passes the pack accent through untouched when no skin — so a
// null skin renders the exact default gold byte-for-byte and resolvedBrand is null (honest
// "unbranded"). When applied, the single accent becomes the brand's and every derived
// value (hairlines, highlight word, frame tint, CTA outline, canvas glow) follows, and
// resolvedBrand echoes what was worn.
function luxuryTheme(brandSkin) {
  const fontFace =
    (isBundled(DISPLAY) ? fontFaceCss(DISPLAY) : "") +
    (isBundled(SERIF2) ? fontFaceCss(SERIF2) : "") +
    (isBundled(LABEL) ? fontFaceCss(LABEL) : "");
  let accent = DEF_ACCENT, resolvedBrand = null;
  try {
    const brand = resolveBrand(brandSkin, { ground: GROUND, isDark: false, packAccents: [DEF_ACCENT] });
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
    accent, onAccent, ground: GROUND, ground2: GROUND_2,
    ink: INK, dim: "rgba(26,23,18,0.56)", faint: "rgba(26,23,18,0.30)",
    hair: "rgba(26,23,18,0.12)",                                    // neutral hairline rule
    hairAccent: `color-mix(in oklab, ${accent} 62%, rgba(26,23,18,0.12))`, // accent hairline
    frameBg: "#FFFFFF",
    frameBorder: `color-mix(in oklab, ${accent} 22%, rgba(26,23,18,0.14))`,
    frameShadow: "0 4cqw 11cqw -5cqw rgba(26,23,18,0.30)",
    accentSoft: `color-mix(in oklab, ${accent} 30%, transparent)`,
    displayStack: `'${DISPLAY}', '${SERIF2}', Georgia, 'Times New Roman', serif`,
    labelStack: `'${LABEL}', ui-monospace, 'SFMono-Regular', monospace`,
    bodyStack: `'${BODY}', system-ui, -apple-system, sans-serif`,
    fontFace, resolvedBrand,
  };
}

// ---- fixed copy (localizable) ------------------------------------------------
const STRINGS = {
  openLabel: "The collection",
  statementLabel: "The idea",
  heroLabel: "The piece",
  detailLabel: "In detail",
  indexLabel: "The essentials",
  galleryLabel: "Every angle",
  ctaLabel: "Ready when you are",
  ctaButton: "Start creating",
  ctaTagline: "Prompt to video. In seconds.",
  ctaUrl: "keyframe.ai",
};

// ---- content extraction (shared shapes) --------------------------------------
function wordsOf(t) { return String(t || "").trim().split(/\s+/).filter(Boolean); }
// Headline sized so long copy never overflows the portrait column (serif runs wide).
function headlineSize(text, base) {
  const len = String(text || "").length;
  if (len > 42) return base * 0.6;
  if (len > 28) return base * 0.74;
  if (len > 18) return base * 0.88;
  return base;
}
// Split a headline into word spans for a gentle reveal; the last word carries the accent.
function accentWords(id, text) {
  const ws = wordsOf(text).slice(0, 12);
  return ws.map((w) =>
    `<span class="lux-gword ${id}-gw" style="display:inline-block;opacity:0;margin:0 0.24em 0.06em 0;">${esc(w)}</span>`
  ).join("");
}

// ---- asset gate + thin-bordered luxury FRAME ---------------------------------
function screenOk(a) {
  if (!a || !a.path) return false;
  if (isLogo(a)) return false; // the logo is CTA / key-moment material, not a display plate
  if (a.type === "video" || /\.(mp4|webm|mov)($|\?)/i.test(a.path)) return false;
  if (/\.svg($|\?)/i.test(a.path)) return false;
  return isTrustedProminent(a) || a.cdProminence === "hero" || a.cdProminence === "support";
}

// A refined thin-bordered frame holding a real screenshot — or, with no asset, an
// intentional branded placeholder (deep-ivory wash + faint accent hairline + a small
// accent ring) so an empty slot still reads as designed, never blank. Absolutely filled
// (100%×100%); the caller sizes it. Generous margin is the caller's business.
function luxFrame(theme, asset, radius) {
  const inner = asset && asset.path
    ? `<img src="${esc(asset.path)}" alt="${esc(asset.alt || "")}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;">`
    : `<div style="position:absolute;inset:0;background:${theme.ground2};"></div>` +
      `<div style="position:absolute;inset:0;background-image:radial-gradient(circle at 50% 44%, ${theme.accentSoft}, transparent 60%);opacity:0.5;"></div>` +
      `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;"><div style="width:12%;aspect-ratio:1;border-radius:50%;border:0.18cqw solid ${theme.accent};opacity:0.7;"></div></div>`;
  return `<div class="pf" style="position:absolute;inset:0;border-radius:${radius || "3%"};overflow:hidden;background:${theme.frameBg};border:0.14cqw solid ${theme.frameBorder};box-shadow:${theme.frameShadow};">
    ${inner}
    <div style="position:absolute;left:0;right:0;top:0;height:26%;background:linear-gradient(rgba(255,255,255,0.5),transparent);pointer-events:none;"></div>
  </div>`;
}
// A framed piece that floats gently. GSAP animates the OUTER `.${id}-prod` (opacity/y/scale
// entrance + slow float); the frame itself is static CSS on an inner wrapper GSAP never
// touches (so the float can't discard it). `hcqw` = frame height in cqw.
function frameBlock(id, theme, { w, hcqw, asset, radius }) {
  return `<div class="${id}-prod lux-prod" style="opacity:0;width:${w};">
    <div style="position:relative;width:100%;height:${r(hcqw)}cqw;">${luxFrame(theme, asset, radius)}</div>
  </div>`;
}
// Portrait screenshots want a tall frame; wide screenshots a shorter one.
function frameHmul(asset) {
  const ratio = Number(asset && asset.ratio) || (asset && asset.width && asset.height ? asset.width / asset.height : 0);
  if (ratio && ratio < 0.9) return 1.4;   // phone / portrait shot
  if (ratio && ratio > 1.6) return 0.6;   // wide desktop / dashboard
  return 0.82;                            // square-ish default
}

// PORTRAIT PLATE SIZING. `frameHmul` above sets this pack's frame PROPORTIONS; nothing
// was checking the resulting plate against how tall the frame actually is. In a 9:16
// column (177.8cqw tall) the fixed widths below left a plate at ~20-30% of the height
// with the rest empty, and a portrait phone capture overflowed its band. plateBox scales
// the pack's own (width, height) pair uniformly — so these proportions and every
// downstream `parseFloat(pw) * frameHmul(asset)` height stay correct — and is a no-op in
// landscape, where the existing layouts were tuned. See services/responsive.js.
function fitPlateW(ctx, wCqw, asset) {
  const w0 = typeof wCqw === "string" ? parseFloat(wCqw) : Number(wCqw);
  const box = plateBox(ctx && ctx.W, ctx && ctx.H, w0, w0 * frameHmul(asset));
  return `${box.w}cqw`;
}


// ---- scene clip open ---------------------------------------------------------
function open(id, ctx) { return `<div class="clip lux-scene" id="${id}" data-start="${ctx.T}" data-duration="${r(ctx.L)}" data-track-index="${ctx.track}" style="opacity:0;">`; }

// ---- archetype selection -----------------------------------------------------
function archetypeFor(scene, i, total) {
  const k = String(scene.kind || "").toLowerCase();
  const p = String(scene.purpose || "").toLowerCase();
  if (i === 0 || k === "hook" || k === "title" || /hook|intro|open/.test(p)) return "open";
  if (i === total - 1 || k === "cta" || /cta|close|sign\s*up|subscribe|download|get\s*started/.test(p)) return "cta";
  if (k === "quote" || k === "stat" || k === "chart" || /quote|testimonial|manifesto|proof|result|metric|stat/.test(p + k)) return "statement";
  if (bullets(scene, 2).length >= 2) return "index";
  return "hero";
}

// ---- scene builders ((scene, ctx, assets) -> {html, s}) ----------------------

// SCENE — OPEN: a centered elegant serif title rises over vast whitespace, an accent
// hairline draws beneath it, and a wide-tracked small-cap label settles. Quiet opener.
function bOpen(scene, ctx, sceneAssets) {
  const { id, T, L, theme, S, portrait } = ctx;
  const label = esc(scene.kicker || S.openLabel);
  const title = scene.headline || scene.title || "";
  // The opener rendered a title and a label only — every other line the script wrote for
  // this scene was dropped. supportLine picks the first that is not already on screen.
  const sup = supportLine(scene, [scene.kicker || S.openLabel]);
  // When a hero shot is pinned to the opener, it settles in a thin-bordered luxury frame
  // beneath the title (its own entrance + slow float); with NO asset the title breathes as
  // before (byte-identical, branded fallback).
  const asset = (sceneAssets && sceneAssets[0]) || null;
  const pw = fitPlateW(ctx, portrait ? 50 : 32, asset);
  const heroHtml = asset
    ? frameBlock(id, theme, { w: pw, hcqw: parseFloat(pw) * frameHmul(asset) * 0.82, asset, radius: "4%" })
    : "";
  const html = `${open(id, ctx)}<div class="lux-safe">
    <div class="lux-h1 ${id}-title" style="text-align:center;font-size:${r(headlineSize(title, 11))}cqw;">${accentWords(id, title)}</div>
    <div class="${id}-rule lux-rule-accent" style="width:0;margin-top:5cqw;background:${theme.hairAccent};"></div>
    <div class="lux-label ${id}-label" style="opacity:0;margin-top:5cqw;">${label}</div>
    ${sup ? `<div class="lux-body ${id}-sup" style="opacity:0;margin-top:2.6cqw;max-width:74%;text-align:center;">${esc(sup)}</div>` : ""}${asset ? `
    <div style="margin-top:6cqw;">${heroHtml}</div>` : ""}
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.6},${T});`,
    `tl.fromTo(".${id}-gw",{opacity:0,y:26},{opacity:1,y:0,duration:0.9,ease:"power3.out",stagger:0.09},${r(T + 0.4)});`,
    `tl.fromTo(".${id}-rule",{width:0},{width:"14cqw",duration:0.9,ease:"power2.inOut"},${r(T + 0.9)});`,
    `tl.fromTo(".${id}-label",{opacity:0,y:12},{opacity:1,y:0,duration:0.7,ease:"power2.out"},${r(T + 1.2)});`,
    sup ? `tl.fromTo(".${id}-sup",{opacity:0,y:14},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 1.5)});` : "",
    asset ? `tl.fromTo(".${id}-prod",{opacity:0,y:56,scale:0.94},{opacity:1,y:0,scale:1,duration:0.9,ease:"power3.out"},${r(T + 1.4)});` : "",
    asset ? `tl.to(".${id}-prod",{y:"-=1.4cqw",duration:2.6,ease:"sine.inOut",yoyo:true,repeat:${reps(L - 2.4, 2.6)},overwrite:"auto"},${r(T + 2.4)});` : "",
    asset ? "" : `tl.to(".${id}-title",{scale:1.02,duration:${r(Math.max(1.8, L - 1.8))},ease:"sine.inOut",yoyo:true,repeat:1,transformOrigin:"center center"},${r(T + 1.4)});`,
  ];
  return { html, s };
}

// SCENE — STATEMENT: a single centered serif statement fades in over whitespace with a
// slow ken-burns breathe (the last word in accent). For quotes, manifestos and stats.
function bStatement(scene, ctx, sceneAssets) {
  const { id, T, L, theme, S, portrait } = ctx;
  const title = scene.headline || scene.title || scene.subtext || "";
  // When the CD assigned this stat/quote scene a screenshot, a thin-bordered luxury plate
  // sits above the serif statement (its own entrance + slow float); with NO asset the
  // statement renders text-only exactly as before (byte-identical, branded fallback).
  const asset = (sceneAssets && sceneAssets[0]) || null;
  const pw = fitPlateW(ctx, portrait ? 56 : 38, asset);
  const plate = asset
    ? frameBlock(id, theme, { w: pw, hcqw: parseFloat(pw) * frameHmul(asset) * 0.78, asset, radius: "3.4%" })
    : "";
  const html = `${open(id, ctx)}<div class="lux-safe">
    <div class="lux-label ${id}-label" style="opacity:0;margin-bottom:5cqw;">${esc(scene.kicker || S.statementLabel)}</div>${asset ? `
    <div style="margin-bottom:5cqw;">${plate}</div>` : ""}
    <div class="lux-display ${id}-st" style="text-align:center;font-size:${r(headlineSize(title, asset ? 8.4 : 12.5))}cqw;">${accentWords(id, title)}</div>
    ${scene.subtext && scene.subtext !== title ? `<div class="lux-body ${id}-sub" style="opacity:0;margin-top:4cqw;max-width:78%;text-align:center;">${esc(scene.subtext)}</div>` : ""}
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.6},${T});`,
    `tl.fromTo(".${id}-label",{opacity:0,y:-10},{opacity:1,y:0,duration:0.6,ease:"power2.out"},${r(T + 0.3)});`,
    asset ? `tl.fromTo(".${id}-prod",{opacity:0,y:56,scale:0.94},{opacity:1,y:0,scale:1,duration:0.9,ease:"power3.out"},${r(T + 0.5)});` : "",
    asset ? `tl.to(".${id}-prod",{y:"-=1.4cqw",duration:2.6,ease:"sine.inOut",yoyo:true,repeat:${reps(L - 1.6, 2.6)},overwrite:"auto"},${r(T + 1.6)});` : "",
    `tl.fromTo(".${id}-gw",{opacity:0,y:22},{opacity:1,y:0,duration:0.85,ease:"power3.out",stagger:0.1},${r(T + 0.55)});`,
    scene.subtext && scene.subtext !== title ? `tl.fromTo(".${id}-sub",{opacity:0,y:16},{opacity:1,y:0,duration:0.7,ease:"power2.out"},${r(T + 1.3)});` : "",
    asset ? "" : `tl.fromTo(".${id}-st",{scale:1.05},{scale:1,duration:${r(Math.max(2, L - 1))},ease:"sine.inOut",transformOrigin:"center center"},${r(T + 0.55)});`,
  ].filter(Boolean);
  return { html, s };
}

// SCENE — HERO: a single thin-framed piece rises and floats with a generous margin, and a
// serif caption lands beneath it (the last word in accent). The product moment (1 shot).
function bHero(scene, ctx, sceneAssets) {
  const { id, T, L, theme, S, portrait } = ctx;
  const label = esc(scene.kicker || S.heroLabel);
  const asset = (sceneAssets && sceneAssets[0]) || null;
  const hmul = frameHmul(asset);
  const pw = fitPlateW(ctx, portrait ? 58 : 36, asset);
  const html = `${open(id, ctx)}<div class="lux-safe" style="justify-content:center;">
    <div class="lux-label ${id}-label" style="opacity:0;margin-bottom:5cqw;">${label}</div>
    ${frameBlock(id, theme, { w: pw, hcqw: parseFloat(pw) * hmul, asset, radius: "4%" })}
    <div class="lux-h1 ${id}-cap" style="opacity:0;margin-top:6cqw;text-align:center;font-size:${r(headlineSize(scene.headline, 6.4))}cqw;">${accentWords(id, scene.headline || scene.title || "")}</div>
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.55},${T});`,
    `tl.fromTo(".${id}-label",{opacity:0,y:-10},{opacity:1,y:0,duration:0.6,ease:"power2.out"},${r(T + 0.3)});`,
    `tl.fromTo(".${id}-prod",{opacity:0,y:64,scale:0.94},{opacity:1,y:0,scale:1,duration:1,ease:"power3.out"},${r(T + 0.5)});`,
    `tl.to(".${id}-prod",{y:"-=1.4cqw",duration:2.6,ease:"sine.inOut",yoyo:true,repeat:${reps(L - 1.6, 2.6)},overwrite:"auto"},${r(T + 1.6)});`,
    `tl.fromTo(".${id}-cap",{opacity:0,y:18},{opacity:1,y:0,duration:0.7,ease:"power2.out"},${r(T + 1.1)});`,
    `tl.fromTo(".${id}-gw",{opacity:0,y:16},{opacity:1,y:0,duration:0.6,ease:"power2.out",stagger:0.07},${r(T + 1.15)});`,
  ];
  return { html, s };
}

// SCENE — DETAIL: a thin-framed piece at top with a slow push-in, and a hairline-separated
// feature list beneath, each line arriving in turn behind an accent dot. 1 shot + bullets.
function bDetail(scene, ctx, sceneAssets) {
  const { id, T, L, theme, S } = ctx;
  const label = esc(scene.kicker || S.detailLabel);
  const asset = (sceneAssets && sceneAssets[0]) || null;
  const feats = bullets(scene, 4);
  const hmul = frameHmul(asset) * 0.86;
  const rows = feats.map((f, i) =>
    `<div class="${id}-row" style="opacity:0;display:flex;align-items:center;gap:2.4cqw;padding:2.2cqw 0;${i < feats.length - 1 ? `border-bottom:1px solid ${theme.hair};` : ""}">
      <div style="width:1.4cqw;height:1.4cqw;border-radius:50%;background:${theme.accent};flex:0 0 auto;"></div>
      <div style="font-family:${theme.displayStack};font-weight:400;font-size:3.6cqw;color:${theme.ink};letter-spacing:-0.01em;line-height:1.2;">${esc(f)}</div>
    </div>`
  ).join("");
  const html = `${open(id, ctx)}<div class="lux-safe" style="justify-content:flex-start;">
    <div class="lux-label ${id}-label" style="opacity:0;margin-bottom:4cqw;">${label}</div>
    ${scene.headline ? `<div class="lux-h1 ${id}-head" style="opacity:0;text-align:center;font-size:${r(headlineSize(scene.headline, 6))}cqw;margin-bottom:4cqw;">${esc(scene.headline)}</div>` : ""}
    ${frameBlock(id, theme, { w: "72cqw", hcqw: 72 * hmul, asset, radius: "3.4%" })}
    <div style="width:78cqw;margin-top:6cqw;">${rows}</div>
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.55},${T});`,
    `tl.fromTo(".${id}-label",{opacity:0,y:-10},{opacity:1,y:0,duration:0.6,ease:"power2.out"},${r(T + 0.3)});`,
    scene.headline ? `tl.fromTo(".${id}-head",{opacity:0,y:16},{opacity:1,y:0,duration:0.6,ease:"power2.out"},${r(T + 0.45)});` : "",
    `tl.fromTo(".${id}-prod",{opacity:0,y:44,scale:0.96},{opacity:1,y:0,scale:1,duration:0.9,ease:"power3.out"},${r(T + 0.55)});`,
    `tl.to(".${id}-prod",{scale:1.05,duration:${r(Math.max(2, L - 1))},ease:"sine.inOut",transformOrigin:"center top"},${r(T + 0.7)});`,
    feats.length ? `tl.fromTo(".${id}-row",{opacity:0,x:-22},{opacity:1,x:0,duration:0.6,ease:"power2.out",stagger:0.16},${r(T + 1.1)});` : "",
  ].filter(Boolean);
  return { html, s };
}

// SCENE — INDEX: a headline over a spaced, hairline-separated list of essentials — no
// frame, all negative space and wide tracking. The default for bullet scenes with no shot.
function bIndex(scene, ctx) {
  const { id, T, L, theme, S } = ctx;
  const label = esc(scene.kicker || S.indexLabel);
  const items = bullets(scene, 5);
  const rows = items.map((c, i) =>
    `<div class="${id}-row" style="opacity:0;display:flex;align-items:baseline;gap:3cqw;padding:2.8cqw 0;${i < items.length - 1 ? `border-bottom:1px solid ${theme.hair};` : ""}">
      <div style="font-family:${theme.labelStack};font-size:2.4cqw;color:${theme.accent};letter-spacing:0.18em;flex:0 0 auto;">0${i + 1}</div>
      <div style="font-family:${theme.displayStack};font-weight:400;font-size:4.6cqw;color:${theme.ink};letter-spacing:-0.01em;line-height:1.16;">${esc(c)}</div>
    </div>`
  ).join("");
  const html = `${open(id, ctx)}<div class="lux-safe">
    <div class="lux-label ${id}-label" style="opacity:0;margin-bottom:3cqw;">${label}</div>
    ${scene.headline ? `<div class="lux-h1 ${id}-head" style="opacity:0;text-align:center;font-size:${r(headlineSize(scene.headline, 7))}cqw;margin-bottom:6cqw;">${accentWords(id, scene.headline)}</div>` : ""}
    <div style="width:80cqw;">${rows}</div>
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.55},${T});`,
    `tl.fromTo(".${id}-label",{opacity:0,y:-10},{opacity:1,y:0,duration:0.6,ease:"power2.out"},${r(T + 0.3)});`,
    scene.headline ? `tl.fromTo(".${id}-gw",{opacity:0,y:18},{opacity:1,y:0,duration:0.6,ease:"power2.out",stagger:0.07},${r(T + 0.45)});` : "",
    items.length ? `tl.fromTo(".${id}-row",{opacity:0,x:-20},{opacity:1,x:0,duration:0.6,ease:"power2.out",stagger:0.17},${r(T + 0.9)});` : "",
  ].filter(Boolean);
  return { html, s };
}

// SCENE — GALLERY: a headline over a row of thin-framed pieces (real screenshots), each
// under a wide-tracked small-cap label. 3 shots. "Every angle."
function bGallery(scene, ctx, sceneAssets) {
  const { id, T, L, theme, S } = ctx;
  const label = esc(scene.kicker || S.galleryLabel);
  const shots = (sceneAssets || []).slice(0, 3);
  const pw = shots.length >= 3 ? "25cqw" : shots.length === 2 ? "34cqw" : fitPlateW(ctx, 52, shots[0]);
  const row = `<div style="display:flex;gap:4cqw;justify-content:center;align-items:flex-end;width:100%;">${shots.map((a, i) => {
    const hmul = frameHmul(a) * 1.4;
    const cap = (Array.isArray(scene.onScreenText) && scene.onScreenText[i]) || "";
    return `<div style="width:${pw};text-align:center;">${frameBlock(`${id}v${i}`, theme, { w: "100%", hcqw: parseFloat(pw) * hmul, asset: a, radius: "5%" })}<div class="lux-cap-sm" style="margin-top:3cqw;">${esc(cap)}</div></div>`;
  }).join("")}</div>`;
  const html = `${open(id, ctx)}<div class="lux-safe">
    <div class="lux-label ${id}-label" style="opacity:0;margin-bottom:2.6cqw;">${label}</div>
    <div class="lux-h1 ${id}-head" style="opacity:0;text-align:center;font-size:${r(headlineSize(scene.headline, 6.6))}cqw;margin-bottom:6cqw;">${accentWords(id, scene.headline || scene.title || "")}</div>
    ${row}
  </div></div>`;
  const proTargets = shots.map((_, i) => `.${id}v${i}-prod`).join(",");
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.55},${T});`,
    `tl.fromTo(".${id}-label",{opacity:0,y:-10},{opacity:1,y:0,duration:0.6,ease:"power2.out"},${r(T + 0.3)});`,
    `tl.fromTo(".${id}-gw",{opacity:0,y:18},{opacity:1,y:0,duration:0.6,ease:"power2.out",stagger:0.07},${r(T + 0.45)});`,
    `tl.fromTo("${proTargets}",{opacity:0,y:54,scale:0.92},{opacity:1,y:0,scale:1,duration:0.85,ease:"power3.out",stagger:0.16},${r(T + 0.7)});`,
    `tl.to("${proTargets}",{y:"-=1.2cqw",duration:2.4,ease:"sine.inOut",yoyo:true,repeat:${reps(L - 1.6, 2.4)},stagger:0.12,overwrite:"auto"},${r(T + 1.7)});`,
  ];
  return { html, s };
}

// SCENE — CTA: the logo mark settles (the user's logo when uploaded, else a built serif
// monogram), the wordmark types in char-by-char, a minimal OUTLINE button pulses softly,
// a url settles. Restrained close.
function bCta(scene, ctx, logo) {
  const { id, T, L, theme, S } = ctx;
  const word = String(scene.headline || scene.title || "KEYFRAME").slice(0, 20);
  const btn = esc(String(scene.emphasis || S.ctaButton).slice(0, 24));
  const tagline = esc(String(scene.subtext || S.ctaTagline).slice(0, 60));
  const url = esc(String(S.ctaUrl));
  const mark = logo && logo.path
    ? logoMark(logo, { sizeCqw: 20, ground: theme.ground, glow: null, escape: esc })
    : `<div style="position:relative;width:16cqw;height:16cqw;display:flex;align-items:center;justify-content:center;">
        <div style="position:absolute;inset:0;border-radius:50%;border:0.16cqw solid ${theme.frameBorder};"></div>
        <div style="font-family:${theme.displayStack};font-weight:400;font-size:8cqw;color:${theme.accent};line-height:1;">${esc((word[0] || "K").toUpperCase())}</div>
      </div>`;
  const chars = wordCharSpans(word, `${id}-ch`);
  const html = `${open(id, ctx)}<div class="lux-safe">
    <div class="lux-label ${id}-label" style="opacity:0;margin-bottom:3cqw;">${esc(scene.kicker || S.ctaLabel)}</div>
    <div class="${id}-mark" style="opacity:0;">${mark}</div>
    <div class="lux-wordmark" style="margin-top:3.6cqw;">${chars}</div>
    <div class="lux-body ${id}-tag" style="opacity:0;margin-top:2cqw;">${tagline}</div>
    <div class="lux-btn ${id}-btn" style="opacity:0;margin-top:4cqw;">${btn}</div>
    <div class="${id}-url" style="opacity:0;font-family:${theme.labelStack};letter-spacing:0.24em;font-size:2.4cqw;color:${theme.faint};margin-top:3cqw;text-transform:uppercase;">${url}</div>
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.6},${T});`,
    `tl.fromTo(".${id}-label",{opacity:0,y:-10},{opacity:1,y:0,duration:0.55,ease:"power2.out"},${r(T + 0.25)});`,
    `tl.fromTo(".${id}-mark",{opacity:0,scale:0.8,y:16},{opacity:1,scale:1,y:0,duration:0.8,ease:"power3.out"},${r(T + 0.4)});`,
    `tl.fromTo(".${id}-ch",{opacity:0,y:36},{opacity:1,y:0,duration:0.6,ease:"power3.out",stagger:0.05},${r(T + 0.85)});`,
    `tl.fromTo(".${id}-tag",{opacity:0,y:12},{opacity:1,y:0,duration:0.6,ease:"power2.out"},${r(T + 1.4)});`,
    `tl.fromTo(".${id}-btn",{opacity:0,y:14},{opacity:1,y:0,duration:0.6,ease:"power2.out"},${r(T + 1.65)});`,
    `tl.to(".${id}-btn",{scale:1.03,duration:1,ease:"sine.inOut",yoyo:true,repeat:${reps(L - 2.25, 1)},transformOrigin:"center center",overwrite:"auto"},${r(T + 2.25)});`,
    `tl.fromTo(".${id}-url",{opacity:0},{opacity:1,duration:0.6},${r(T + 1.9)});`,
  ];
  return { html, s };
}

const BUILDERS = { open: bOpen, statement: bStatement, hero: bHero, detail: bDetail, index: bIndex, gallery: bGallery, cta: bCta };

// ---- persistent AMBIENT canvas (hf-seek) -------------------------------------
// One canvas painted purely from the renderer's hf-seek time: the warm ivory ground, ONE
// slowly drifting soft accent glow, a slow soft light sweep, a whisper of seeded fine grain
// and a barely-there vignette. Colored ONLY with theme.accent (+ the fixed ivory grounds),
// so a brand skin recolors the whole ambient. Understated by design. Live preview drives it
// off the timeline; render is hf-seek only (deterministic, seek-exact, capture-safe).
function ambientClip(theme, dims, D, seed) {
  const W = dims.width, H = dims.height;
  const [ar, ag, ab] = hexToRgb(theme.accent);
  const [gr, gg, gb] = hexToRgb(theme.ground);
  const [v0r, v0g, v0b] = hexToRgb(theme.ground2);
  const [ir, ig, ib] = hexToRgb(theme.ink);
  const html = `<div id="lux-bg-clip" class="clip" data-start="0" data-duration="${D}" data-track-index="0" data-layout-allow-occlusion style="background:${theme.ground};">
    <canvas id="lux-bg" width="${W}" height="${H}" style="position:absolute;inset:0;width:100%;height:100%;"></canvas>
  </div>`;
  const script = `(function(){
  var cv=document.getElementById("lux-bg");if(!cv||!cv.getContext)return;var cx=cv.getContext("2d");if(!cx)return;
  var W=${W},H=${H};
  function A(a){return "rgba(${ar},${ag},${ab},"+a+")";}
  function I(a){return "rgba(${ir},${ig},${ib},"+a+")";}
  var VG="rgba(${v0r},${v0g},${v0b},";
  var sd=${seed >>> 0};function rnd(){sd=(sd*1664525+1013904223)>>>0;return sd/4294967296;}
  var N=Math.round(30*(W*H)/(1080*1920)),MO=[];
  for(var i=0;i<N;i++){MO.push({x:rnd(),y:rnd(),s:0.6+1.4*rnd(),ph:rnd()*6.28});}
  function draw(t){
    // warm ivory ground
    cx.fillStyle="rgb(${gr},${gg},${gb})";cx.fillRect(0,0,W,H);
    // ONE drifting soft accent glow — the only color; slow and low
    var gx=W*0.5+Math.sin(t*0.12)*W*0.16,gy=H*0.42+Math.cos(t*0.1)*H*0.09;
    var gg2=cx.createRadialGradient(gx,gy,0,gx,gy,W*0.92);gg2.addColorStop(0,A(0.10));gg2.addColorStop(0.6,A(0));cx.fillStyle=gg2;cx.fillRect(0,0,W,H);
    // slow soft light sweep — a warm-white highlight drifting across the top
    var sx=W*(0.2+0.6*(0.5+0.5*Math.sin(t*0.08))),sy=H*0.2;
    var sw=cx.createRadialGradient(sx,sy,0,sx,sy,W*0.7);sw.addColorStop(0,"rgba(255,255,255,0.42)");sw.addColorStop(0.6,"rgba(255,255,255,0)");cx.fillStyle=sw;cx.fillRect(0,0,W,H);
    // a whisper of fine grain — seeded motes drifting up, barely there
    for(var i=0;i<MO.length;i++){var m=MO[i];var y=(m.y*H-t*6)%H;if(y<0)y+=H;var op=0.04+0.05*(0.5+0.5*Math.sin(t*0.9+m.ph));cx.globalAlpha=op;cx.fillStyle=I(1);cx.beginPath();cx.arc(m.x*W,y,m.s,0,6.283);cx.fill();}
    cx.globalAlpha=1;
    // barely-there vignette back into the ivory
    var vg=cx.createRadialGradient(W*0.5,H*0.44,Math.min(W,H)*0.28,W*0.5,H*0.44,Math.max(W,H)*0.82);vg.addColorStop(0,VG+"0)");vg.addColorStop(1,VG+"0.5)");cx.fillStyle=vg;cx.fillRect(0,0,W,H);
  }
  // Painted ONLY from the renderer's hf-seek time — deterministic, seek-exact, capture-safe.
  window.KF_LUX=draw;window.addEventListener("hf-seek",function(e){draw((e.detail&&e.detail.time)||0);});draw(0);
})();`;
  return { html, script };
}

// ---- grain overlay (top layer) -----------------------------------------------
const GRAIN_URI = grainUri(0.9);
function grainClip(D) {
  return `<div id="lux-grain" class="clip" data-start="0" data-duration="${D}" data-track-index="40" data-layout-allow-occlusion style="pointer-events:none;background-image:url('${GRAIN_URI}');background-size:280px 280px;opacity:0.03;mix-blend-mode:multiply;"></div>`;
}

// ---- style -------------------------------------------------------------------
function styleBlock(theme, portrait) {
  const safePad = portrait ? "15% 9% 16%" : "9% 10% 11%";
  return `${theme.fontFace}
  * { box-sizing:border-box; margin:0; padding:0; }
  html, body { width:100%; height:100%; overflow:hidden; background:#000; }
  #root { position:relative; overflow:hidden; isolation:isolate; background:${theme.ground}; container-type:size; color:${theme.ink}; font-family:${theme.bodyStack}; }
  .clip { position:absolute; top:0; left:0; width:100%; height:100%; overflow:hidden; }
  .lux-safe { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:${safePad}; text-align:center; }
  .lux-display { font-family:${theme.displayStack}; font-weight:300; line-height:1.0; letter-spacing:-0.03em; color:${theme.ink}; ${displayShadow(theme.ground)} }
  .lux-h1 { font-family:${theme.displayStack}; font-weight:400; line-height:1.08; letter-spacing:-0.02em; color:${theme.ink}; ${displayShadow(theme.ground)} }
  .lux-display .lux-gword:last-child, .lux-h1 .lux-gword:last-child { color:${theme.accent}; }
  .lux-gword { will-change:transform,opacity; }
  .lux-label { display:inline-flex; align-items:center; font-family:${theme.labelStack}; font-weight:500; font-size:2cqw; letter-spacing:0.42em; text-transform:uppercase; color:${theme.dim}; }
  .lux-cap-sm { font-family:${theme.labelStack}; font-weight:500; font-size:1.9cqw; letter-spacing:0.2em; text-transform:uppercase; color:${theme.dim}; }
  .lux-body { font-family:${theme.bodyStack}; font-weight:400; font-size:2.6cqw; line-height:1.5; color:${theme.dim}; }
  .lux-rule-accent { height:0.16cqw; border-radius:999px; background:${theme.hairAccent}; }
  .lux-wordmark { display:flex; flex-wrap:wrap; justify-content:center; text-align:center; gap:0 0.26em; max-width:92%; font-family:${theme.displayStack}; font-weight:500; font-size:10cqw; letter-spacing:-0.02em; color:${theme.ink}; }
  .lux-btn { display:inline-flex; align-items:center; justify-content:center; padding:2.6cqw 7cqw; border-radius:999px; background:transparent; border:0.16cqw solid ${theme.accent}; color:${theme.accent}; font-family:${theme.labelStack}; font-weight:500; font-size:2.8cqw; letter-spacing:0.18em; text-transform:uppercase; will-change:transform,opacity; }
  .lux-prod, .pf { will-change:transform,opacity; }
  #caps { position:absolute; inset:0; display:flex; justify-content:center; align-items:flex-end; padding-bottom:${portrait ? "16%" : "7%"}; z-index:60; pointer-events:none; }
  #cap-pill { max-width:82%; height:fit-content; flex:0 0 auto; text-align:center; padding:1.4cqw 3cqw; opacity:0; border-radius:2cqw; background:rgba(255,255,255,0.78); border:1px solid ${theme.frameBorder}; backdrop-filter:blur(6px); box-shadow:0 1cqw 4cqw -2cqw rgba(26,23,18,0.25); }
  #cap-text { font-family:${theme.bodyStack}; font-weight:500; font-size:2.5cqw; line-height:1.35; color:${theme.ink}; }`;
}

// ---- MAIN --------------------------------------------------------------------
function buildComposition({ storyboard, dims, framePack, captionCues, assets, brandSkin = null, localized = null } = {}) {
  const theme = luxuryTheme(brandSkin);
  const S = localized ? { ...STRINGS, ...localized } : STRINGS;
  const sb = storyboard || {};
  const W = (dims && dims.width) || 1080, H = (dims && dims.height) || 1920;
  const portrait = W < H;
  const scenes = Array.isArray(sb.scenes) && sb.scenes.length
    ? sb.scenes.slice(0, 12)
    : [{ id: "s1", start: 0, duration: 5, kind: "hook", headline: sb.title || "KEYFRAME" }];
  const D = r(sb.durationSec || scenes.reduce((a, s) => Math.max(a, (Number(s.start) || 0) + (Number(s.duration) || 0)), 0) || 12);
  const seed = seedFrom(sb.title || (scenes[0] && scenes[0].headline) || "luxury");

  // ---- Assets: distribute real screenshots across DISPLAY-CAPABLE scenes -------
  // A screenshot must NEVER be stranded on a scene that can't show it. The Creative
  // Director's per-asset `sceneId` is a HINT: honored when that scene can display an image,
  // else the shot is redistributed to the least-loaded display scene — so every usable
  // screenshot actually appears. The logo is reserved for the CTA mark.
  const logo = logoAssetOf(assets);
  const shots = (Array.isArray(assets) ? assets : []).filter(screenOk)
    .sort((a, b) => (Number(b.cdScore) || 0) - (Number(a.cdScore) || 0));
  const baseArch = scenes.map((scene, i) => archetypeFor(scene, i, scenes.length));
  // ANTI-REPETITION (services/motion_planner). archetypeFor above ends in a single
  // fallthrough, so every middle scene of a text-led film lands on the same type and the
  // film reads as one backdrop with rotating copy. This breaks adjacent duplicates using
  // ONLY this pack's own generic scene types — data-shaped ones (stats/chart/gallery)
  // keep their type, because their builders have preconditions a swap would violate.
  const { archetypes: __varied } = varyArchetypes(baseArch, {
    pool: Object.keys(BUILDERS),
    seedKey: scenes.map((s) => s && s.id).join("|"),
  });
  for (let __i = 0; __i < baseArch.length; __i++) baseArch[__i] = __varied[__i];
  // EVERY content archetype hosts its assigned shot in the luxury visual language (the
  // thin-bordered luxFrame): a hook (open) can show a hero shot, a stat/quote (statement)
  // shows its screenshot above the serif line, features (hero/index→detail) frame theirs —
  // only the pure CTA (logo lockup) is excluded — so a scene the CD pinned a screenshot to
  // renders it on the intended scene instead of stranding it.
  const canShow = (a) => a !== "cta";
  const displayIdx = scenes.map((_, i) => i).filter((i) => canShow(baseArch[i]));
  // Safety net: if nothing is display-capable but shots exist (a degenerate all-cta set),
  // force every non-cta scene to host, so a usable screenshot is never dropped to text-only.
  if (!displayIdx.length && shots.length) {
    for (let i = 0; i < scenes.length; i++) if (baseArch[i] !== "cta") displayIdx.push(i);
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
    for (const i of displayIdx) sceneShots[i] = sceneShots[i].slice(0, 3);
  }

  const scriptStart = (i) => scenes.slice(0, i).reduce((a, s) => a + (Number(s.duration) || 0), 0);
  const bodyParts = [], sceneScripts = [];

  scenes.forEach((scene, i) => {
    const T = r(scene.start != null ? scene.start : scriptStart(i));
    const L = r(scene.duration || 5);
    let arch = baseArch[i];
    let sceneAssets = sceneShots[i];
    // A display-capable scene that received screenshots shows them. The hook (open) and
    // stat/quote (statement) scenes keep their identity and host ONE framed shot in-style;
    // an index scene with 1–2 → a detail (frame + hairline list); 3+ → a gallery row; else
    // a focused hero. Scenes with none keep their base form (a branded placeholder / text).
    if (canShow(arch) && sceneAssets.length) {
      if (arch === "open" || arch === "statement") { sceneAssets = sceneAssets.slice(0, 1); }
      else if (sceneAssets.length >= 3) { arch = "gallery"; sceneAssets = sceneAssets.slice(0, 3); }
      else if (arch === "index") { arch = "detail"; sceneAssets = sceneAssets.slice(0, 1); }
      else { arch = "hero"; sceneAssets = sceneAssets.slice(0, 1); }
    }
    const ctx = { id: `s${i + 1}`, T, L, E: r(T + L), i, isLast: i === scenes.length - 1, track: 2 + i, theme, S, W, H, portrait };
    const built = (BUILDERS[arch] || bHero)(scene, ctx, arch === "cta" ? logo : sceneAssets);
    bodyParts.push(built.html);
    sceneScripts.push(built.s.filter(Boolean).join("\n  "));
    if (!ctx.isLast) sceneScripts.push(`kill("#${ctx.id}",${r(T + L)});`);
  });

  const cues = (Array.isArray(captionCues) ? captionCues : [])
    .filter((c) => c && c.text != null)
    .map((c) => [r(c.start != null ? c.start : c.startSec || 0), r(c.end != null ? c.end : (c.start || 0) + 2), String(c.text)]);

  const ambient = ambientClip(theme, { width: W, height: H }, D, seed);
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
    if(window.KF_LUX)window.KF_LUX(now);
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
    ambient.html,
    bodyParts.join("\n"),
    grainClip(D),
    caps,
    `</div>`,
    `<script>`, ambient.script, `</script>`,
    `<script>`, script, `</script>`,
    `</body>`, `</html>`,
  ].join("\n");

  const metaJson = JSON.stringify({ compositionId: "vid", width: W, height: H, fps: (dims && dims.fps) || 30, duration: D });
  // resolvedBrand echoes the accent the film actually wore (or null when no brand was
  // applied), so graph.persistWornBrand discloses the true painted palette.
  return { indexHtml, metaJson, resolvedBrand: theme.resolvedBrand };
}

module.exports = { buildComposition, STRINGS };
