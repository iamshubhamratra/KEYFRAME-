// NATURE FLOW composer — a native GSAP + canvas "organic, living-ecosystem" film.
// The pack `nature-flow` (manifest renderer:"nature-flow") routes here from
// attemptLlmComposition, exactly like the flagship / kinetic / product-showcase composers.
//
// Ported from the imported OmniMotion/React template ("Nature Flow"). The React
// runtime is replaced by KEYFRAME's HyperFrames contract, but the identity is kept:
//   • a PERSISTENT living NATURE backdrop — a soft flowing mesh gradient, two slow
//     drifting glow-waves, a hazy sun with light rays, gently falling leaves/petals, a
//     water-ripple base with widening rings and a soft vignette — painted on ONE <canvas>
//     as a pure function of the renderer's hf-seek time (deterministic; breathes
//     continuously across every cut, so scene boundaries frame-match on pure Nature).
//   • organic SERIF type; soft-rounded leaf-shaped device-frames that hold real
//     screenshots; soft feature chips; a petal-burst climax; and a logo-reveal CTA.
//
// EVERYTHING is theme-driven: natureTheme(accent) derives the flowing gradient, the
// glow-waves, the leaf colors, the accents and the CTA — so a brand skin recolors the
// WHOLE ecosystem (backgrounds, waves, leaves, frames, chips, CTA), not just text.
//
// Engineering contract (identical to the other native composers): one paused GSAP
// timeline on window.__timelines["vid"]; direct-child .clip scenes on unique tracks; a
// boundary opacity:0 hard-kill per scene (Nature persists behind them); ONE seek-safe
// caption node (#cap-text) driven by a single onUpdate proxy; finite repeats; cqw units +
// container-type:size (portrait-native, 9:16); hidden = opacity:0 only. Portrait is
// detected from dims (W<H); no manifest flag. Deterministic. GSAP is the only CDN dep.

const { fontFaceCss, isBundled } = require("../fonts/pack_fonts");
const { isTrustedProminent, isLogo } = require("./asset_priority");
const { logoMark } = require("./logo_render");
const { plateBox } = require("./responsive");
const { charSpans } = require("./text_fx");
const { resolveBrand } = require("./brand_kit");

const GSAP_CDN = "https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js";
// Fraunces (bundled) is the organic optical serif that carries the template's Newsreader
// display spirit; IBM Plex Mono is the bundled humanist mono for kickers/labels; Inter
// (the template's Nunito Sans role) falls to system-ui — no Google <link>, CDN-free render.
const DISPLAY = "Fraunces";
const MONO = "IBM Plex Mono";
const BODY = "Inter";

// The template's default organic accents when no brand is applied (leaf green → teal),
// on a deep-organic-dark ground built from the same forest darks as the source template.
const DEF_ACCENT = "#4CAF6E";
const DEF_SECONDARY = "#2E9E8F";
const GROUND = "#0A1F17";        // deep-organic ground (isDark ground reference)
const DARK_BGDEEP = "#071812";   // fixed forest darks the accent is mixed into
const DARK_DEEP = "#0B1F17";
const DARK_MID = "#10352A";
const LEAF_LIGHT = "#EAF7E8";    // cream the leaf highlight is mixed toward
const CREAM = "#F3F7EC";

// ---- helpers -----------------------------------------------------------------
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
const r = (n) => Math.round((Number(n) || 0) * 100) / 100;
const hexToRgb = (h) => { const n = parseInt(String(h).replace("#", ""), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const clamp8 = (v) => Math.max(0, Math.min(255, Math.round(v)));
const rgbToHex = ([a, b, c]) => `#${[a, b, c].map((v) => clamp8(v).toString(16).padStart(2, "0")).join("")}`;
// Linear sRGB blend: wa of a, (1-wa) of b. Used at BUILD time so the canvas gets real
// rgb (color-mix is CSS-only); mirrors the source template's oklab color-mix intent.
function mixHex(a, b, wa) {
  const [ar, ag, ab] = hexToRgb(a), [br, bg, bb] = hexToRgb(b);
  const m = (x, y) => x * wa + y * (1 - wa);
  return rgbToHex([m(ar, br), m(ag, bg), m(ab, bb)]);
}
function relLum(hex) {
  const [rr, gg, bb] = hexToRgb(hex).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * rr + 0.7152 * gg + 0.0722 * bb;
}
function seedFrom(str) { let h = 2166136261; const s = String(str || "nature"); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) || 7; }
// finite yoyo repeat count for a segment of `t` seconds at period `c`.
function reps(t, c) { return Math.max(0, Math.floor((Number(t) || 0) / (c || 1)) - 1); }

// ---- theme -------------------------------------------------------------------
// resolveBrand fits the brand accents to the deep-organic ground (isDark:true → lifted
// for contrast) and passes the pack accents through untouched when no skin — so a null
// skin renders the exact default ecosystem byte-for-byte and resolvedBrand is null (an
// honest "unbranded"). When applied, the two accents become the brand's and every
// derived value (flowing gradient, glow-waves, leaves, frames, chips, CTA) follows, and
// resolvedBrand echoes what was worn.
function natureTheme(brandSkin) {
  const fontFace = (isBundled(DISPLAY) ? fontFaceCss(DISPLAY) : "") + (isBundled(MONO) ? fontFaceCss(MONO) : "");
  let accent = DEF_ACCENT, accent2 = DEF_SECONDARY, resolvedBrand = null;
  try {
    const brand = resolveBrand(brandSkin, { ground: GROUND, isDark: true, packAccents: [DEF_ACCENT, DEF_SECONDARY] });
    if (brand.applied) {
      accent = brand.accent || accent;
      accent2 = brand.accent2 || accent2;
      resolvedBrand = {
        ...(brandSkin && typeof brandSkin === "object" ? brandSkin : {}),
        accents: [accent, accent2], emphasis: brand.emphasis, adjusted: brand.adjusted,
        dropped: brand.dropped, tier: brand.tier, applied: true,
      };
    }
  } catch { accent = DEF_ACCENT; accent2 = DEF_SECONDARY; resolvedBrand = null; }
  // The living ecosystem's derived hexes — the accent tints every forest dark and the
  // leaf highlight, so brand color repaints the whole flow (computed at build so the
  // canvas can paint them directly).
  const bgDeep = mixHex(accent, DARK_BGDEEP, 0.22);
  const deep = mixHex(accent, DARK_DEEP, 0.55);
  const mid = mixHex(accent2, DARK_MID, 0.40);
  const leaf = accent;
  const leaf2 = mixHex(accent, LEAF_LIGHT, 0.60);
  const waterEdge = mixHex(accent, "#05130D", 0.40);
  const onLeaf = relLum(leaf2) > 0.55 ? bgDeep : "#0A1F17";
  return {
    accent, accent2, bgDeep, deep, mid, leaf, leaf2, cream: CREAM, waterEdge, onLeaf,
    ink: "#F4FAF0", dim: "rgba(244,250,240,0.72)", faint: "rgba(244,250,240,0.4)",
    surface: mixHex(accent, "#0C231A", 0.14),
    accentSoft: `color-mix(in oklab, ${accent} 40%, transparent)`,
    border: `color-mix(in oklab, ${leaf2} 55%, transparent)`,
    line: `color-mix(in oklab, ${accent} 24%, transparent)`,
    gradient: `linear-gradient(120deg, ${leaf2}, ${accent})`,
    flow: `linear-gradient(165deg, ${bgDeep} 0%, ${deep} 55%, ${mid} 100%)`,
    displayStack: `'${DISPLAY}', Georgia, 'Times New Roman', serif`,
    monoStack: `'${MONO}', ui-monospace, monospace`,
    bodyStack: `'${BODY}', system-ui, sans-serif`,
    fontFace, resolvedBrand,
  };
}

// ---- fixed copy (localizable) ------------------------------------------------
const STRINGS = {
  openKicker: "Video, naturally",
  statementKicker: "The idea",
  showcaseKicker: "Watch it grow",
  bulletsKicker: "A living toolkit",
  galleryKicker: "Every angle",
  climaxKicker: "Let it flourish",
  ctaKicker: "Ready when you are",
  ctaButton: "Start creating",
  ctaTagline: "Where prompts grow into film.",
  ctaUrl: "keyframe.ai",
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
// Headline sized so long copy never overflows the portrait column.
function headlineSize(text, base) {
  const len = String(text || "").length;
  if (len > 42) return base * 0.62;
  if (len > 28) return base * 0.76;
  if (len > 18) return base * 0.88;
  return base;
}
// Split a headline into word spans for the reveal; the last word blooms in italic leaf2.
function bloomWords(id, text) {
  const ws = wordsOf(text).slice(0, 10);
  return ws.map((w, i) =>
    `<span class="nf-word ${id}-w${i === ws.length - 1 ? " nf-emph" : ""}" style="display:inline-block;opacity:0;margin:0 0.22em 0.08em 0;">${esc(w)}</span>`
  ).join("");
}

// ---- asset gate + organic LEAF device-frame ----------------------------------
function screenOk(a) {
  if (!a || !a.path) return false;
  if (isLogo(a)) return false; // the logo is CTA / key-moment material, not a leaf panel
  if (a.type === "video" || /\.(mp4|webm|mov)($|\?)/i.test(a.path)) return false;
  if (/\.svg($|\?)/i.test(a.path)) return false;
  return isTrustedProminent(a) || a.cdProminence === "hero" || a.cdProminence === "support";
}
function logoAssetOf(assets) {
  return (Array.isArray(assets) ? assets : []).find((a) => a && a.path && isLogo(a) && !/\.(mp4|webm|mov)($|\?)/i.test(a.path)) || null;
}

// A soft-rounded organic (leaf-shaped) frame holding a real screenshot — or, with no
// asset, an intentional branded placeholder (flowing gradient wash + a soft glowing node)
// so an empty slot still reads as designed, never blank. Absolutely filled; caller sizes.
function leafFrame(theme, asset, radius) {
  const rad = radius || "58% 42% 55% 45% / 55% 55% 45% 45%";
  const inner = asset && asset.path
    ? `<img src="${esc(asset.path)}" alt="${esc(asset.alt || "")}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;">`
    : `<div style="position:absolute;inset:0;background:${theme.flow};opacity:0.9;"></div>` +
      `<div style="position:absolute;inset:0;background-image:radial-gradient(circle at 50% 46%, ${theme.accentSoft}, transparent 62%);"></div>` +
      `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;"><div style="width:16%;aspect-ratio:1;border-radius:50%;background:${theme.gradient};box-shadow:0 0 4cqw ${theme.leaf2};opacity:0.9;"></div></div>`;
  return `<div class="nf-frame" style="position:absolute;inset:0;border-radius:${rad};overflow:hidden;background:${theme.surface};border:0.4cqw solid ${theme.leaf2};box-shadow:0 5cqw 13cqw -6cqw rgba(0,0,0,0.7), 0 0 7cqw -2cqw ${theme.leaf2};">
    ${inner}
    <div style="position:absolute;inset:0;background:linear-gradient(150deg, ${theme.leaf2}33, transparent 55%);mix-blend-mode:overlay;pointer-events:none;"></div>
    <div style="position:absolute;left:0;right:0;top:0;height:28%;background:linear-gradient(rgba(255,255,255,0.14),transparent);pointer-events:none;"></div>
  </div>`;
}
// A screenshot resting in a leaf frame. GSAP animates the OUTER `.${id}-frame`
// (opacity/y/scale entrance + sway); the organic rotation is static CSS on an inner
// wrapper GSAP never touches (so the sway can't discard it). `hcqw` = frame height in cqw.
function frameBlock(id, theme, { w, hcqw, asset, rot }) {
  const frame = leafFrame(theme, asset);
  const t = rot || 0;
  return `<div class="${id}-frame" style="opacity:0;width:${w};">
    <div style="position:relative;width:100%;height:${r(hcqw)}cqw;transform:rotate(${t}deg);">${frame}</div>
  </div>`;
}
// Portrait screenshots want a tall frame; wide screenshots a shorter one.
function frameHmul(asset) {
  const ratio = Number(asset && asset.ratio) || (asset && asset.width && asset.height ? asset.width / asset.height : 0);
  if (ratio && ratio < 0.9) return 1.5;   // phone / portrait shot
  if (ratio && ratio > 1.6) return 0.62;  // wide desktop / dashboard
  return 1.05;                            // square-ish default (organic frames run tall)
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
function open(id, ctx) { return `<div class="clip nf-scene" id="${id}" data-start="${ctx.T}" data-duration="${r(ctx.L)}" data-track-index="${ctx.track}" style="opacity:0;">`; }

// ---- archetype selection -----------------------------------------------------
function archetypeFor(scene, i, total) {
  const k = String(scene.kind || "").toLowerCase();
  const p = String(scene.purpose || "").toLowerCase();
  if (i === 0 || k === "hook" || k === "title" || /hook|intro|open/.test(p)) return "open";
  if (i === total - 1 || k === "cta" || /cta|close|sign\s*up|subscribe|download|get\s*started/.test(p)) return "cta";
  if (k === "quote" || /quote|testimonial|manifesto/.test(p)) return "statement";
  if (k === "stat" || k === "chart" || k === "countdown" || (pickNumber(scene) && /proof|result|metric|stat|number/.test(p + k))) return "statement";
  if (bullets(scene, 2).length >= 2) return "bullets";
  return "showcase";
}

// ---- scene builders ((scene, ctx, assets) -> {html, s}) ----------------------

// SCENE — OPEN: a calm serif title rises over the flow with a kicker and a subtitle.
// The last word blooms in italic leaf2. Gentle opener energy.
function bOpen(scene, ctx, sceneAssets) {
  const { id, T, L, S, theme, portrait } = ctx;
  const kick = esc(scene.kicker || S.openKicker);
  const title = scene.headline || scene.title || "";
  // When a hero shot is assigned, the opener shows it in a leaf frame under the title (its
  // own entrance + sway); with NO asset the title floats as before (byte-identical).
  const asset = (sceneAssets && sceneAssets[0]) || null;
  const heroHtml = asset
    ? frameBlock(id, theme, { w: fitPlateW(ctx, portrait ? 46 : 30, asset), hcqw: parseFloat(fitPlateW(ctx, portrait ? 46 : 30, asset)) * frameHmul(asset), asset, rot: -3 })
    : "";
  const html = `${open(id, ctx)}<div class="nf-safe">
    <div class="nf-kicker ${id}-kick" style="opacity:0;margin-bottom:3cqw;">${kick}</div>
    <div class="nf-display ${id}-title" style="text-align:center;font-size:${r(headlineSize(title, 12))}cqw;">${bloomWords(id, title)}</div>${asset ? `
    <div style="margin-top:4.4cqw;">${heroHtml}</div>` : ""}
    ${scene.subtext ? `<div class="nf-body ${id}-sub" style="opacity:0;margin-top:3.4cqw;max-width:82%;text-align:center;">${esc(scene.subtext)}</div>` : ""}
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.5},${T});`,
    `tl.fromTo(".${id}-kick",{opacity:0,y:-14},{opacity:1,y:0,duration:0.55,ease:"power2.out"},${r(T + 0.25)});`,
    `tl.fromTo(".${id}-title .nf-word",{opacity:0,y:26},{opacity:1,y:0,duration:0.6,ease:"power3.out",stagger:0.08},${r(T + 0.45)});`,
    asset ? `tl.fromTo(".${id}-frame",{opacity:0,y:80,scale:0.82},{opacity:1,y:0,scale:1,duration:0.85,ease:"power3.out"},${r(T + 0.9)});` : "",
    asset ? `tl.to(".${id}-frame",{rotation:2.4,y:"-=1.4cqw",duration:2.4,ease:"sine.inOut",yoyo:true,repeat:${reps(L - 2, 2.4)},transformOrigin:"center center",overwrite:"auto"},${r(T + 2)});` : "",
    scene.subtext ? `tl.fromTo(".${id}-sub",{opacity:0,y:16},{opacity:1,y:0,duration:0.55,ease:"power2.out"},${r(T + 1.05)});` : "",
    asset ? "" : `tl.to(".${id}-title",{scale:1.02,duration:${r(Math.max(1.8, L - 1.6))},ease:"sine.inOut",yoyo:true,repeat:1,transformOrigin:"center center"},${r(T + 1.3)});`,
  ].filter(Boolean);
  return { html, s };
}

// SCENE — STATEMENT: a single serene serif line settles and breathes over the flow.
// For quotes / manifestos / a lone number.
function bStatement(scene, ctx, sceneAssets) {
  const { id, T, L, S, theme, portrait } = ctx;
  const kick = scene.kicker ? esc(scene.kicker) : "";
  // A stat / proof / quote scene the CD assigned a screenshot to shows that shot in a leaf
  // frame ABOVE the serene serif line (the metric AND the dashboard together); with NO asset
  // the line renders text-only exactly as before (byte-identical branded fallback).
  const asset = (sceneAssets && sceneAssets[0]) || null;
  const pw = fitPlateW(ctx, portrait ? 54 : 36, asset);
  const frame = asset
    ? frameBlock(id, theme, { w: pw, hcqw: parseFloat(pw) * frameHmul(asset), asset, rot: -3 })
    : "";
  const html = `${open(id, ctx)}<div class="nf-safe">
    ${kick ? `<div class="nf-kicker ${id}-kick" style="opacity:0;margin-bottom:3cqw;">${kick}</div>` : ""}${asset ? `
    <div style="margin-bottom:5cqw;">${frame}</div>` : ""}
    <div class="nf-display nf-italic ${id}-st" style="text-align:center;font-size:${r(headlineSize(scene.headline, asset ? 8 : 11))}cqw;opacity:0;color:${theme.leaf2};">${esc(scene.headline || scene.title || "")}</div>
    ${scene.subtext ? `<div class="nf-body ${id}-sub" style="opacity:0;margin-top:3cqw;max-width:78%;text-align:center;">${esc(scene.subtext)}</div>` : ""}
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.5},${T});`,
    kick ? `tl.fromTo(".${id}-kick",{opacity:0,y:-14},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 0.25)});` : "",
    asset ? `tl.fromTo(".${id}-frame",{opacity:0,y:70,scale:0.82},{opacity:1,y:0,scale:1,duration:0.85,ease:"power3.out"},${r(T + 0.35)});` : "",
    asset ? `tl.to(".${id}-frame",{rotation:2.4,y:"-=1.4cqw",duration:2.4,ease:"sine.inOut",yoyo:true,repeat:${reps(L - 1.7, 2.4)},transformOrigin:"center center",overwrite:"auto"},${r(T + 1.7)});` : "",
    `tl.fromTo(".${id}-st",{opacity:0,scale:0.86,filter:"blur(8px)"},{opacity:1,scale:1,filter:"blur(0px)",duration:0.85,ease:"power3.out"},${r(T + (asset ? 0.7 : 0.4))});`,
    scene.subtext ? `tl.fromTo(".${id}-sub",{opacity:0,y:16},{opacity:1,y:0,duration:0.55,ease:"power2.out"},${r(T + 1.1)});` : "",
    `tl.to(".${id}-st",{scale:1.03,duration:${r(Math.max(1.8, L - 1.6))},ease:"sine.inOut",yoyo:true,repeat:1,transformOrigin:"center center"},${r(T + 1.25)});`,
  ].filter(Boolean);
  return { html, s };
}

// SCENE — SHOWCASE: a screenshot blooms in a leaf frame with orbiting leaves and a
// caption headline (last word in italic leaf2). The product moment (1 shot). Gentle sway.
function bShowcase(scene, ctx, sceneAssets) {
  const { id, T, L, theme, S, portrait } = ctx;
  const kick = esc(scene.kicker || S.showcaseKicker);
  const asset = (sceneAssets && sceneAssets[0]) || null;
  const hmul = frameHmul(asset) * (portrait ? 1 : 0.9);
  const pw = fitPlateW(ctx, portrait ? 58 : 38, asset);
  const html = `${open(id, ctx)}<div class="nf-safe" style="justify-content:center;">
    <div class="nf-kicker ${id}-kick" style="opacity:0;margin-bottom:4cqw;">${kick}</div>
    ${frameBlock(id, theme, { w: pw, hcqw: (portrait ? 58 : 38) * hmul, asset, rot: -3 })}
    <div class="nf-h1 ${id}-cap" style="opacity:0;margin-top:5cqw;text-align:center;font-size:${r(headlineSize(scene.headline, 7))}cqw;">${bloomWords(id, scene.headline || scene.title || "")}</div>
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.45},${T});`,
    `tl.fromTo(".${id}-kick",{opacity:0,y:-14},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 0.2)});`,
    `tl.fromTo(".${id}-frame",{opacity:0,y:80,scale:0.82},{opacity:1,y:0,scale:1,duration:0.85,ease:"power3.out"},${r(T + 0.4)});`,
    `tl.to(".${id}-frame",{rotation:2.4,y:"-=1.4cqw",duration:2.4,ease:"sine.inOut",yoyo:true,repeat:${reps(L - 1.4, 2.4)},transformOrigin:"center center",overwrite:"auto"},${r(T + 1.4)});`,
    `tl.fromTo(".${id}-cap",{opacity:0,y:18},{opacity:1,y:0,duration:0.55,ease:"power2.out"},${r(T + 1)});`,
    `tl.fromTo(".${id}-cap .nf-word",{opacity:0,y:20},{opacity:1,y:0,duration:0.5,ease:"back.out(1.5)",stagger:0.07},${r(T + 1.05)});`,
  ];
  return { html, s };
}

// SCENE — BULLETS: a headline over a rising column of soft feature chips that drift.
// "A living toolkit." The default for bullet scenes with no screenshot.
function bBullets(scene, ctx, sceneAssets) {
  const { id, T, L, S, theme, portrait } = ctx;
  const kick = esc(scene.kicker || S.bulletsKicker);
  // A feature/list scene assigned a screenshot shows it in a leaf frame ABOVE the chip stack
  // (the screenshot WITH the feature chips); with NO asset the chips render alone as before
  // (byte-identical branded fallback).
  const asset = (sceneAssets && sceneAssets[0]) || null;
  let chips = bullets(scene, 5);
  if (!chips.length) chips = [esc(scene.subtext || scene.title || "")];
  const chipHtml = chips.map((c, i) =>
    `<div class="nf-chip ${id}-chip" style="opacity:0;"><span class="nf-leafdot" style="background:${i % 2 ? theme.leaf2 : theme.leaf};box-shadow:0 0 1.2cqw ${i % 2 ? theme.leaf2 : theme.leaf};"></span>${esc(c)}</div>`
  ).join("");
  const pw = fitPlateW(ctx, portrait ? 48 : 32, asset);
  const frame = asset
    ? frameBlock(id, theme, { w: pw, hcqw: parseFloat(pw) * frameHmul(asset), asset, rot: -3 })
    : "";
  const html = `${open(id, ctx)}<div class="nf-safe">
    <div class="nf-kicker ${id}-kick" style="opacity:0;margin-bottom:2.4cqw;">${kick}</div>
    <div class="nf-h1 ${id}-head" style="opacity:0;text-align:center;font-size:${r(headlineSize(scene.headline, 7.5))}cqw;margin-bottom:${asset ? "4" : "5"}cqw;">${bloomWords(id, scene.headline || scene.title || "")}</div>${asset ? `
    <div style="margin-bottom:4.4cqw;">${frame}</div>` : ""}
    <div style="display:flex;flex-direction:column;gap:2cqw;align-items:center;">${chipHtml}</div>
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.45},${T});`,
    `tl.fromTo(".${id}-kick",{opacity:0,y:-14},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 0.2)});`,
    `tl.fromTo(".${id}-head",{opacity:0,y:22},{opacity:1,y:0,duration:0.55,ease:"power2.out"},${r(T + 0.35)});`,
    `tl.fromTo(".${id}-head .nf-word",{opacity:0,y:18},{opacity:1,y:0,duration:0.5,ease:"back.out(1.4)",stagger:0.07},${r(T + 0.4)});`,
    asset ? `tl.fromTo(".${id}-frame",{opacity:0,y:70,scale:0.82},{opacity:1,y:0,scale:1,duration:0.8,ease:"power3.out"},${r(T + 0.7)});` : "",
    asset ? `tl.to(".${id}-frame",{rotation:2.4,y:"-=1.2cqw",duration:2.3,ease:"sine.inOut",yoyo:true,repeat:${reps(L - 1.9, 2.3)},transformOrigin:"center center",overwrite:"auto"},${r(T + 1.9)});` : "",
    `tl.fromTo(".${id}-chip",{opacity:0,y:24,scale:0.9},{opacity:1,y:0,scale:1,duration:0.5,ease:"back.out(1.5)",stagger:0.14},${r(T + 0.85)});`,
    `tl.to(".${id}-chip",{y:"-=0.9cqw",duration:2.2,ease:"sine.inOut",yoyo:true,repeat:${reps(L - 1.6, 2.2)},stagger:0.12,overwrite:"auto"},${r(T + 1.7)});`,
  ].filter(Boolean);
  return { html, s };
}

// SCENE — GALLERY: a headline over a row of leaf-framed angle-views (real screenshots),
// each on a gentle organic tilt, rising and swaying. 2–3 shots. "Every angle."
function bGallery(scene, ctx, sceneAssets) {
  const { id, T, L, theme, S } = ctx;
  const kick = esc(scene.kicker || S.galleryKicker);
  const shots = (sceneAssets || []).slice(0, 3);
  const rots = shots.length === 3 ? [-6, 3, -4] : shots.length === 2 ? [-5, 4] : [0];
  const pw = shots.length >= 3 ? "26cqw" : shots.length === 2 ? "34cqw" : fitPlateW(ctx, 50, shots[0]);
  const row = `<div style="display:flex;gap:3cqw;justify-content:center;align-items:center;width:100%;">${shots.map((a, i) => {
    const hmul = frameHmul(a) * 1.2;
    return `<div style="width:${pw};text-align:center;">${frameBlock(`${id}v${i}`, theme, { w: "100%", hcqw: parseFloat(pw) * hmul, asset: a, rot: rots[i] })}<div style="font-family:${theme.monoStack};font-size:2cqw;color:${theme.dim};margin-top:2.4cqw;letter-spacing:0.14em;text-transform:uppercase;">${esc((Array.isArray(scene.onScreenText) && scene.onScreenText[i]) || "")}</div></div>`;
  }).join("")}</div>`;
  const html = `${open(id, ctx)}<div class="nf-safe">
    <div class="nf-kicker ${id}-kick" style="opacity:0;margin-bottom:2.4cqw;">${kick}</div>
    <div class="nf-h1 ${id}-head" style="opacity:0;text-align:center;font-size:${r(headlineSize(scene.headline, 7))}cqw;margin-bottom:5cqw;">${bloomWords(id, scene.headline || scene.title || "")}</div>
    ${row}
  </div></div>`;
  const frameTargets = shots.map((_, i) => `.${id}v${i}-frame`).join(",");
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.45},${T});`,
    `tl.fromTo(".${id}-kick",{opacity:0,y:-14},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 0.2)});`,
    `tl.fromTo(".${id}-head",{opacity:0,y:22},{opacity:1,y:0,duration:0.55,ease:"power2.out"},${r(T + 0.35)});`,
    `tl.fromTo(".${id}-head .nf-word",{opacity:0,y:18},{opacity:1,y:0,duration:0.5,ease:"back.out(1.4)",stagger:0.07},${r(T + 0.4)});`,
    `tl.fromTo("${frameTargets}",{opacity:0,y:64,scale:0.82},{opacity:1,y:0,scale:1,duration:0.72,ease:"power3.out",stagger:0.14},${r(T + 0.65)});`,
    `tl.to("${frameTargets}",{y:"-=1.4cqw",duration:2.1,ease:"sine.inOut",yoyo:true,repeat:${reps(L - 1.6, 2.1)},stagger:0.1,overwrite:"auto"},${r(T + 1.6)});`,
  ];
  return { html, s };
}

// SCENE — CTA: the logo mark blooms (the user's logo when uploaded, else a built leaf
// badge), the wordmark types char-by-char, an organic pill button breathes, a url settles.
function bCta(scene, ctx, logo) {
  const { id, T, L, theme, S } = ctx;
  const word = String(scene.headline || scene.title || "KEYFRAME").slice(0, 20);
  const btn = esc(String(scene.emphasis || S.ctaButton).slice(0, 24));
  const tagline = esc(String(scene.subtext || S.ctaTagline).slice(0, 60));
  const url = esc(String(S.ctaUrl));
  const mark = logo && logo.path
    ? logoMark(logo, { sizeCqw: 22, ground: theme.bgDeep, glow: theme.leaf2, escape: esc })
    : `<div style="position:relative;width:20cqw;height:20cqw;display:flex;align-items:center;justify-content:center;">
        <div style="position:absolute;inset:0;border-radius:58% 42% 55% 45% / 55% 55% 45% 45%;background:${theme.gradient};box-shadow:0 0 6cqw ${theme.leaf2};"></div>
        <div style="position:relative;width:7cqw;height:11cqw;background:${theme.onLeaf};border-radius:0 100% 0 100%;transform:rotate(-20deg);opacity:0.92;"></div>
      </div>`;
  const chars = charSpans(word, `${id}-ch`);
  const html = `${open(id, ctx)}<div class="nf-safe">
    <div class="nf-kicker ${id}-kick" style="opacity:0;margin-bottom:2.4cqw;">${esc(scene.kicker || S.ctaKicker)}</div>
    <div class="${id}-mark" style="opacity:0;">${mark}</div>
    <div class="nf-wordmark" style="margin-top:3.4cqw;">${chars}</div>
    <div class="nf-body ${id}-tag" style="opacity:0;margin-top:1.8cqw;">${tagline}</div>
    <div class="nf-btn ${id}-btn" style="opacity:0;margin-top:3.6cqw;color:${theme.onLeaf};">${btn}</div>
    <div class="${id}-url" style="opacity:0;font-family:${theme.monoStack};letter-spacing:0.2em;font-size:2.4cqw;color:${theme.faint};margin-top:2.4cqw;">${url}</div>
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.5},${T});`,
    `tl.fromTo(".${id}-kick",{opacity:0,y:-14},{opacity:1,y:0,duration:0.45,ease:"power2.out"},${r(T + 0.2)});`,
    `tl.fromTo(".${id}-mark",{opacity:0,scale:0.5,y:20},{opacity:1,scale:1,y:0,duration:0.7,ease:"back.out(1.6)"},${r(T + 0.35)});`,
    `tl.fromTo(".${id}-ch",{opacity:0,y:40},{opacity:1,y:0,duration:0.5,ease:"power3.out",stagger:0.04},${r(T + 0.75)});`,
    `tl.fromTo(".${id}-tag",{opacity:0,y:12},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 1.25)});`,
    `tl.fromTo(".${id}-btn",{opacity:0,scale:0.8},{opacity:1,scale:1,duration:0.55,ease:"back.out(1.8)"},${r(T + 1.5)});`,
    `tl.to(".${id}-btn",{scale:1.04,duration:0.9,ease:"sine.inOut",yoyo:true,repeat:${reps(L - 2.1, 0.9)},overwrite:"auto"},${r(T + 2.1)});`,
    `tl.fromTo(".${id}-url",{opacity:0},{opacity:1,duration:0.5},${r(T + 1.75)});`,
  ];
  return { html, s };
}

const BUILDERS = { open: bOpen, statement: bStatement, showcase: bShowcase, bullets: bBullets, gallery: bGallery, cta: bCta };

// ---- persistent NATURE canvas (hf-seek) --------------------------------------
// One canvas painted purely from the renderer's hf-seek time: a soft flowing mesh
// gradient, two slow drifting glow-waves, a hazy sun with light rays, gently falling
// leaves/petals, a water-ripple base with widening rings and a soft vignette. Colored
// ONLY with theme hues, so a brand skin recolors the whole ecosystem. Live preview drives
// it off the timeline; render is hf-seek only (deterministic, seek-exact, capture-safe).
function natureClip(theme, dims, D, seed) {
  const W = dims.width, H = dims.height;
  const [ar, ag, ab] = hexToRgb(theme.accent);
  const [bgr, bgg, bgb] = hexToRgb(theme.bgDeep);
  const [dpr, dpg, dpb] = hexToRgb(theme.deep);
  const [mr, mg, mb] = hexToRgb(theme.mid);
  const [lr, lg, lb] = hexToRgb(theme.leaf);
  const [l2r, l2g, l2b] = hexToRgb(theme.leaf2);
  const [cr, cg, cb] = hexToRgb(theme.cream);
  const [wr, wg, wb] = hexToRgb(theme.waterEdge);
  const html = `<div id="nf-nature-clip" class="clip" data-start="0" data-duration="${D}" data-track-index="0" data-layout-allow-occlusion style="background:${theme.bgDeep};">
    <canvas id="nf-nature" width="${W}" height="${H}" style="position:absolute;inset:0;width:100%;height:100%;"></canvas>
  </div>`;
  const script = `(function(){
  var cv=document.getElementById("nf-nature");if(!cv||!cv.getContext)return;var cx=cv.getContext("2d");if(!cx)return;
  var W=${W},H=${H};
  function LF(a){return "rgba(${lr},${lg},${lb},"+a+")";}
  function L2(a){return "rgba(${l2r},${l2g},${l2b},"+a+")";}
  function CM(a){return "rgba(${cr},${cg},${cb},"+a+")";}
  var sd=${seed >>> 0};function rnd(){sd=(sd*1664525+1013904223)>>>0;return sd/4294967296;}
  var N=Math.max(8,Math.round(16*(W*H)/(1080*1920))),LV=[];
  for(var i=0;i<N;i++){LV.push({bx:rnd(),by:rnd(),size:26+rnd()*40,spin:(rnd()-0.5)*2,ph:rnd()*6.28,warm:rnd()<0.5,fall:12+30*rnd()});}
  function leaf(x,y,s,rot,col,op){cx.save();cx.translate(x,y);cx.rotate(rot);cx.globalAlpha=op;cx.fillStyle=col;cx.beginPath();cx.moveTo(0,-s*0.5);cx.quadraticCurveTo(s*0.5,0,0,s*0.5);cx.quadraticCurveTo(-s*0.5,0,0,-s*0.5);cx.fill();cx.restore();cx.globalAlpha=1;}
  function wave(x,y,rad,col,op){var g=cx.createRadialGradient(x,y,0,x,y,rad);g.addColorStop(0,col(op));g.addColorStop(0.65,col(0));cx.fillStyle=g;cx.fillRect(0,0,W,H);}
  function draw(t){
    // flowing mesh gradient (bgDeep -> deep -> mid)
    var bg=cx.createLinearGradient(0,0,W*0.35,H);
    bg.addColorStop(0,"rgb(${bgr},${bgg},${bgb})");bg.addColorStop(0.55,"rgb(${dpr},${dpg},${dpb})");bg.addColorStop(1,"rgb(${mr},${mg},${mb})");
    cx.fillStyle=bg;cx.fillRect(0,0,W,H);
    // two slow drifting glow-waves
    wave(W*0.28+Math.sin(t*0.3)*W*0.08,H*0.30+Math.cos(t*0.26)*H*0.05,W*0.62,LF,0.5);
    wave(W*0.78+Math.sin(t*0.3+2)*W*0.08,H*0.68+Math.cos(t*0.26+2)*H*0.05,W*0.72,L2,0.32);
    // hazy sun (breathes)
    var sx=W*0.72,sy=H*0.14,srad=W*0.46,sop=0.30+0.05*Math.sin(t*0.6);
    var sg=cx.createRadialGradient(sx,sy,0,sx,sy,srad);sg.addColorStop(0,CM(sop));sg.addColorStop(0.6,CM(0));cx.fillStyle=sg;cx.fillRect(0,0,W,H);
    // light rays from the sun (sway)
    for(var ri=0;ri<7;ri++){cx.save();cx.translate(sx,sy);cx.rotate(((ri-3)*9+Math.sin(t*0.4+ri)*2)*Math.PI/180);cx.globalAlpha=0.06;cx.fillStyle=CM(1);cx.fillRect(-1.6,0,3.2,H*0.7);cx.restore();}
    cx.globalAlpha=1;
    // gently falling leaves / petals
    var span=H+80;
    for(var i=0;i<LV.length;i++){var l=LV[i];var y=(l.by*span+t*l.fall)%span;if(y<0)y+=span;y-=40;var x=l.bx*W+Math.sin(t*0.5+l.ph)*W*0.06;var rot=(t*30*l.spin+i*40)*Math.PI/180;leaf(x,y,l.size,rot,l.warm?LF(1):L2(1),0.85);}
    // water-ripple base
    var wg2=cx.createLinearGradient(0,H*0.78,0,H);wg2.addColorStop(0,"rgba(${wr},${wg},${wb},0)");wg2.addColorStop(1,"rgba(${wr},${wg},${wb},0.85)");cx.fillStyle=wg2;cx.fillRect(0,H*0.78,W,H*0.22);
    // widening ripple rings
    for(var k=0;k<3;k++){var prog=((t*0.18+k*0.34)%1);var rw=W*(0.16+prog*0.5);cx.globalAlpha=(0.16-k*0.03)*(1-prog);cx.strokeStyle=L2(1);cx.lineWidth=2;cx.beginPath();cx.ellipse(W*0.5,H*(0.9-k*0.03),rw,rw*0.18,0,0,6.283);cx.stroke();}
    cx.globalAlpha=1;
    // soft vignette
    var vg=cx.createRadialGradient(W*0.5,H*0.45,Math.min(W,H)*0.2,W*0.5,H*0.45,Math.max(W,H)*0.7);vg.addColorStop(0,"rgba(5,15,10,0)");vg.addColorStop(1,"rgba(5,15,10,0.55)");cx.fillStyle=vg;cx.fillRect(0,0,W,H);
  }
  // Painted ONLY from the renderer's hf-seek time — deterministic, seek-exact, capture-safe.
  window.KF_NATURE=draw;window.addEventListener("hf-seek",function(e){draw((e.detail&&e.detail.time)||0);});draw(0);
})();`;
  return { html, script };
}

// ---- grain overlay (top layer) -----------------------------------------------
const GRAIN_SVG = "<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/></filter><rect width='100%' height='100%' filter='url(#n)' opacity='0.5'/></svg>";
const GRAIN_URI = "data:image/svg+xml;base64," + Buffer.from(GRAIN_SVG).toString("base64");
function grainClip(D) {
  return `<div id="nf-grain" class="clip" data-start="0" data-duration="${D}" data-track-index="40" data-layout-allow-occlusion style="pointer-events:none;background-image:url('${GRAIN_URI}');background-size:260px 260px;opacity:0.04;mix-blend-mode:overlay;"></div>`;
}

// ---- style -------------------------------------------------------------------
function styleBlock(theme, portrait) {
  const safePad = portrait ? "12% 7% 14%" : "8% 8% 10%";
  return `${theme.fontFace}
  * { box-sizing:border-box; margin:0; padding:0; }
  html, body { width:100%; height:100%; overflow:hidden; background:#000; }
  #root { position:relative; overflow:hidden; isolation:isolate; background:${theme.bgDeep}; container-type:size; color:${theme.ink}; font-family:${theme.bodyStack}; }
  .clip { position:absolute; top:0; left:0; width:100%; height:100%; overflow:hidden; }
  .nf-safe { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:${safePad}; text-align:center; }
  .nf-display { font-family:${theme.displayStack}; font-weight:600; line-height:1.02; letter-spacing:-0.02em; color:${theme.ink}; }
  .nf-h1 { font-family:${theme.displayStack}; font-weight:600; line-height:1.08; letter-spacing:-0.01em; color:${theme.ink}; }
  .nf-italic { font-style:italic; }
  .nf-word { will-change:transform,opacity; }
  .nf-emph { font-style:italic; color:${theme.leaf2}; }
  .nf-kicker { display:inline-flex; align-items:center; gap:0.9cqw; font-family:${theme.monoStack}; font-weight:600; font-size:2cqw; letter-spacing:0.3em; text-transform:uppercase; color:${theme.dim}; }
  .nf-body { font-family:${theme.bodyStack}; font-weight:500; font-size:2.7cqw; line-height:1.42; color:${theme.dim}; }
  .nf-wordmark { display:flex; font-family:${theme.displayStack}; font-weight:600; font-size:11cqw; letter-spacing:-0.01em; color:${theme.ink}; }
  .nf-chip { display:inline-flex; align-items:center; gap:1.4cqw; padding:1.8cqw 3.4cqw; border-radius:999px; background:rgba(244,250,240,0.05); border:1px solid ${theme.border}; backdrop-filter:blur(6px); font-family:${theme.bodyStack}; font-weight:600; font-size:2.7cqw; letter-spacing:0.02em; color:${theme.ink}; white-space:nowrap; box-shadow:0 1.4cqw 5cqw -2cqw rgba(0,0,0,0.5); will-change:transform,opacity; }
  .nf-leafdot { width:1.6cqw; height:1.6cqw; border-radius:0 100% 0 100%; flex:0 0 auto; }
  .nf-btn { display:inline-flex; align-items:center; gap:1cqw; padding:2.8cqw 6.8cqw; border-radius:999px; background:${theme.leaf2}; font-family:${theme.bodyStack}; font-weight:800; font-size:3.4cqw; letter-spacing:0.02em; box-shadow:0 2cqw 6cqw -1.5cqw rgba(0,0,0,0.6); will-change:transform,opacity; }
  .nf-frame { will-change:transform,opacity; }
  #caps { position:absolute; inset:0; display:flex; justify-content:center; align-items:flex-end; padding-bottom:${portrait ? "16%" : "7%"}; z-index:60; pointer-events:none; }
  #cap-pill { max-width:82%; height:fit-content; flex:0 0 auto; text-align:center; padding:1.4cqw 3cqw; opacity:0; border-radius:2cqw; background:rgba(6,16,11,0.72); border:1px solid ${theme.border}; backdrop-filter:blur(8px); }
  #cap-text { font-family:${theme.bodyStack}; font-weight:600; font-size:2.6cqw; line-height:1.35; color:${theme.ink}; }`;
}

// ---- MAIN --------------------------------------------------------------------
function buildComposition({ storyboard, dims, framePack, captionCues, assets, brandSkin = null, localized = null } = {}) {
  const theme = natureTheme(brandSkin);
  const S = localized ? { ...STRINGS, ...localized } : STRINGS;
  const sb = storyboard || {};
  const W = (dims && dims.width) || 1080, H = (dims && dims.height) || 1920;
  const portrait = W < H;
  const scenes = Array.isArray(sb.scenes) && sb.scenes.length
    ? sb.scenes.slice(0, 12)
    : [{ id: "s1", start: 0, duration: 5, kind: "hook", headline: sb.title || "KEYFRAME" }];
  const D = r(sb.durationSec || scenes.reduce((a, s) => Math.max(a, (Number(s.start) || 0) + (Number(s.duration) || 0)), 0) || 12);
  const seed = seedFrom(sb.title || (scenes[0] && scenes[0].headline) || "nature");

  // ---- Assets: distribute real screenshots across DISPLAY-CAPABLE scenes -------
  // A screenshot must NEVER be stranded on a scene that can't show it (open / statement /
  // cta). The Creative Director's per-asset `sceneId` is a HINT: honored when that scene
  // can display an image, else the shot is redistributed to the least-loaded display scene
  // — so every usable screenshot actually appears. The logo is reserved for the CTA mark.
  const logo = logoAssetOf(assets);
  const shots = (Array.isArray(assets) ? assets : []).filter(screenOk)
    .sort((a, b) => (Number(b.cdScore) || 0) - (Number(a.cdScore) || 0));
  const baseArch = scenes.map((scene, i) => archetypeFor(scene, i, scenes.length));
  // EVERY content archetype hosts its assigned shot in the ecosystem's own leaf-frame
  // language — the hook (open), the stat/quote (statement), the feature-list (bullets), the
  // showcase and the gallery — only the pure CTA (logo lockup) is excluded, so a stat/quote/
  // hook scene the CD pinned a screenshot to renders it on the intended scene.
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
    // A display-capable scene that received screenshots shows them. The hook (open), stat/
    // quote (statement) and feature-list (bullets) scenes keep their identity and host ONE
    // shot in-style; a plain scene with 3+ shots becomes a gallery row; else a focused
    // showcase (the leaf hero). Scenes with none keep their base (branded fallback).
    if (canShow(arch) && sceneAssets.length) {
      if (arch === "open" || arch === "statement" || arch === "bullets") { sceneAssets = sceneAssets.slice(0, 1); }
      else if (sceneAssets.length >= 3) { arch = "gallery"; sceneAssets = sceneAssets.slice(0, 3); }
      else { arch = "showcase"; sceneAssets = sceneAssets.slice(0, 1); }
    }
    const ctx = { id: `s${i + 1}`, T, L, E: r(T + L), i, isLast: i === scenes.length - 1, track: 2 + i, theme, S, W, H, portrait };
    const built = (BUILDERS[arch] || bShowcase)(scene, ctx, arch === "cta" ? logo : sceneAssets);
    bodyParts.push(built.html);
    sceneScripts.push(built.s.filter(Boolean).join("\n  "));
    if (!ctx.isLast) sceneScripts.push(`kill("#${ctx.id}",${r(T + L)});`);
  });

  const cues = (Array.isArray(captionCues) ? captionCues : [])
    .filter((c) => c && c.text != null)
    .map((c) => [r(c.start != null ? c.start : c.startSec || 0), r(c.end != null ? c.end : (c.start || 0) + 2), String(c.text)]);

  const nature = natureClip(theme, { width: W, height: H }, D, seed);
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
    if(window.KF_NATURE)window.KF_NATURE(now);
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
    nature.html,
    bodyParts.join("\n"),
    grainClip(D),
    caps,
    `</div>`,
    `<script>`, nature.script, `</script>`,
    `<script>`, script, `</script>`,
    `</body>`, `</html>`,
  ].join("\n");

  const metaJson = JSON.stringify({ compositionId: "vid", width: W, height: H, fps: (dims && dims.fps) || 30, duration: D });
  // resolvedBrand echoes the accents the film actually wore (or null when no brand was
  // applied), so graph.persistWornBrand discloses the true painted palette.
  return { indexHtml, metaJson, resolvedBrand: theme.resolvedBrand };
}

module.exports = { buildComposition, STRINGS };
