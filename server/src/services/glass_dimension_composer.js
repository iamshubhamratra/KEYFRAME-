// GLASS DIMENSION composer — a native GSAP + canvas "glassmorphism depth" film.
// The pack `glass-dimension` (manifest renderer:"glass-dimension") routes here from
// attemptLlmComposition, exactly like the flagship / kinetic / product-showcase composers.
//
// Ported from the imported OmniMotion/React template ("Glass Dimension"). The React
// runtime is replaced by KEYFRAME's HyperFrames contract, but the identity is kept:
//   • a PERSISTENT animated LIGHT-FIELD backdrop — soft drifting color orbs of accent
//     light, a faint refraction grid, a slow diagonal light sweep and floating glints —
//     painted on ONE <canvas> as a pure function of the renderer's hf-seek time
//     (deterministic; flows continuously across every cut). This is the light the glass
//     refracts.
//   • layered FROSTED-GLASS panels floating in depth (backdrop-filter blur, translucent
//     fill, a 1px luminous border and a soft inner highlight). Titles, stat cards,
//     screenshots and the CTA all live INSIDE glass surfaces — premium, iOS-like depth.
//
// EVERYTHING is theme-driven: glassTheme(accent, accent2) derives the two light-field
// hues, the glass tints, the borders, the gradient and the glows — so a brand skin
// recolors the WHOLE film (the light behind the glass, the panel tints, the borders,
// the glows, the CTA), not just the text.
//
// Engineering contract (identical to the other native composers): one paused GSAP
// timeline on window.__timelines["vid"]; direct-child .clip scenes on unique tracks; a
// boundary opacity:0 hard-kill per scene (the light-field persists behind them); ONE
// seek-safe caption node (#cap-text) driven by a single onUpdate proxy; finite repeats;
// cqw units + container-type:size (portrait-native, 9:16); hidden = opacity:0 only.
// Portrait is detected from dims (W<H); no manifest flag. Deterministic.

const { fontFaceCss, isBundled } = require("../fonts/pack_fonts");
const { isTrustedProminent, isLogo } = require("./asset_priority");
const { logoMark } = require("./logo_render");
const { plateBox } = require("./responsive");
const { charSpans } = require("./text_fx");
const { resolveBrand } = require("./brand_kit");

const GSAP_CDN = "https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js";
// Space Grotesk (bundled) carries the same clean geometric spirit as the template's
// Space Grotesk display; JetBrains Mono is the bundled mono label face; Inter → system-ui.
const DISPLAY = "Space Grotesk";
const MONO = "JetBrains Mono";
const BODY = "Inter";

// The template's default light-field hues + deep ground when no brand is applied.
const DEF_PRIMARY = "#6366F1";
const DEF_SECONDARY = "#EC4899";
const BG_DEEP = "#0A0A14";

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
function seedFrom(str) { let h = 2166136261; const s = String(str || "glass"); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) || 7; }
// finite yoyo repeat count for a segment of `t` seconds at period `c`.
function reps(t, c) { return Math.max(0, Math.floor((Number(t) || 0) / (c || 1)) - 1); }

// ---- theme -------------------------------------------------------------------
// resolveBrand fits the brand accents to the deep glass ground (isDark:true → lifted for
// contrast) and passes the pack accents through untouched when no skin — so a null skin
// renders the exact default light-field byte-for-byte and resolvedBrand is null (honest
// "unbranded"). Applied → the two light-field hues become the brand's and every derived
// value (orbs, glass tint, border, gradient, glow, CTA) follows, and resolvedBrand echoes
// what was worn.
function glassTheme(brandSkin) {
  const fontFace = (isBundled(DISPLAY) ? fontFaceCss(DISPLAY) : "") + (isBundled(MONO) ? fontFaceCss(MONO) : "");
  let primary = DEF_PRIMARY, secondary = DEF_SECONDARY, resolvedBrand = null;
  try {
    const brand = resolveBrand(brandSkin, { ground: BG_DEEP, isDark: true, packAccents: [DEF_PRIMARY, DEF_SECONDARY] });
    if (brand.applied) {
      primary = brand.accent || primary;
      secondary = brand.accent2 || secondary;
      resolvedBrand = {
        ...(brandSkin && typeof brandSkin === "object" ? brandSkin : {}),
        accents: [primary, secondary], emphasis: brand.emphasis, adjusted: brand.adjusted,
        dropped: brand.dropped, tier: brand.tier, applied: true,
      };
    }
  } catch { primary = DEF_PRIMARY; secondary = DEF_SECONDARY; resolvedBrand = null; }
  const onAccent = relLum(primary) > 0.55 ? "#0A0A14" : "#FFFFFF";
  return {
    primary, secondary, bgDeep: BG_DEEP, onAccent,
    ink: "#FFFFFF", dim: "rgba(255,255,255,0.72)", faint: "rgba(255,255,255,0.40)",
    // The frosted-glass surface itself — a translucent white wash, refraction-ready.
    glass: "linear-gradient(135deg, rgba(255,255,255,0.16), rgba(255,255,255,0.05))",
    glassBorder: "rgba(255,255,255,0.28)",
    // Brand-tinted glints on the glass (the color the panel picks up from the light field).
    tintPrimary: `color-mix(in oklab, ${primary} 30%, transparent)`,
    tintSecondary: `color-mix(in oklab, ${secondary} 26%, transparent)`,
    gradient: `linear-gradient(120deg, ${primary}, ${secondary})`,
    gradient2: `linear-gradient(300deg, ${secondary}, ${primary})`,
    border: `color-mix(in oklab, ${primary} 42%, transparent)`,
    line: `color-mix(in oklab, ${primary} 22%, transparent)`,
    glow: primary, glow2: secondary,
    displayStack: `'${DISPLAY}', 'Inter', system-ui, sans-serif`,
    monoStack: `'${MONO}', ui-monospace, monospace`,
    bodyStack: `'${BODY}', system-ui, sans-serif`,
    fontFace, resolvedBrand,
  };
}

// ---- fixed copy (localizable) ------------------------------------------------
const STRINGS = {
  openKicker: "Clarity in motion",
  cardsKicker: "Depth by design",
  showcaseKicker: "In focus",
  galleryKicker: "Layers of light",
  statementKicker: "The idea",
  ctaKicker: "Ready when you are",
  ctaButton: "Start creating",
  ctaTagline: "Prompt to video. In seconds.",
  ctaUrl: "keyframe.ai",
  cardTag: "refined",
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
// Split a headline into word spans for the reveal; the last word carries the accent gradient.
function accentWords(id, text) {
  return wordsOf(text).slice(0, 10).map((w) =>
    `<span class="gd-gword ${id}-gw" style="display:inline-block;opacity:0;margin:0 0.22em 0.08em 0;">${esc(w)}</span>`
  ).join("");
}

// ---- asset gate + frosted-glass SHOT frame -----------------------------------
function screenOk(a) {
  if (!a || !a.path) return false;
  if (isLogo(a)) return false; // the logo is CTA / key-moment material, not a glass panel
  if (a.type === "video" || /\.(mp4|webm|mov)($|\?)/i.test(a.path)) return false;
  if (/\.svg($|\?)/i.test(a.path)) return false;
  return isTrustedProminent(a) || a.cdProminence === "hero" || a.cdProminence === "support";
}
function logoAssetOf(assets) {
  return (Array.isArray(assets) ? assets : []).find((a) => a && a.path && isLogo(a) && !/\.(mp4|webm|mov)($|\?)/i.test(a.path)) || null;
}

// The inner media plate: a real screenshot — or, with no asset, an intentional branded
// placeholder (gradient wash + faint refraction grid + a glowing node) so an empty slot
// still reads as designed, never blank.
function shotMedia(theme, asset, tint) {
  const c = tint || theme.primary;
  return asset && asset.path
    ? `<img src="${esc(asset.path)}" alt="${esc(asset.alt || "")}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;">`
    : `<div style="position:absolute;inset:0;background:${theme.gradient2};opacity:0.4;"></div>` +
      `<div style="position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,0.4) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.4) 1px,transparent 1px);background-size:16% 12%;opacity:0.14;"></div>` +
      `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;"><div style="width:15%;aspect-ratio:1;border-radius:50%;background:${theme.gradient};box-shadow:0 0 4cqw ${c};opacity:0.9;"></div></div>`;
}

// A FROSTED-GLASS panel — the signature surface. Translucent white wash, a 1px luminous
// border, backdrop blur, a soft inner highlight and a diagonal brand tint. `inner` is
// laid over the highlight. Absolutely filled by the caller-set size.
function glassPanel(theme, { w, h, tint, radius, blur, style, inner }) {
  return `<div class="gd-glass" style="width:${w};height:${h};border-radius:${radius || "3cqw"};position:relative;overflow:hidden;background:${theme.glass};border:0.14cqw solid ${theme.glassBorder};backdrop-filter:blur(${blur || 6}px);-webkit-backdrop-filter:blur(${blur || 6}px);box-shadow:0 5cqw 12cqw -5cqw rgba(0,0,0,0.6), inset 0 0.12cqw 0 rgba(255,255,255,0.4);${style || ""}">
    <div style="position:absolute;inset:0;pointer-events:none;background:linear-gradient(125deg, ${tint || "rgba(255,255,255,0.18)"}, transparent 55%);"></div>
    <div style="position:absolute;left:0;right:0;top:0;height:45%;pointer-events:none;background:linear-gradient(rgba(255,255,255,0.14),transparent);"></div>
    ${inner}
  </div>`;
}

// A frosted-glass SHOT frame holding a real screenshot (or branded placeholder), padded
// so the media reads as a plate floating inside the glass. `hcqw` = frame height in cqw.
function glassShot(theme, { w, hcqw, asset, tint, radius }) {
  const inner = `<div style="position:absolute;inset:2.6cqw;border-radius:2cqw;overflow:hidden;border:0.12cqw solid rgba(255,255,255,0.2);">${shotMedia(theme, asset, tint)}</div>`;
  return glassPanel(theme, { w, h: `${r(hcqw)}cqw`, tint, radius: radius || "3cqw", inner });
}
// Portrait screenshots want a tall frame; wide screenshots a shorter one (multiplier on w).
function frameHmul(asset) {
  const ratio = Number(asset && asset.ratio) || (asset && asset.width && asset.height ? asset.width / asset.height : 0);
  if (ratio && ratio < 0.9) return 1.4;   // phone / portrait shot
  if (ratio && ratio > 1.6) return 0.62;  // wide desktop / dashboard
  return 1.0;                             // square-ish default
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
function open(id, ctx) { return `<div class="clip gd-scene" id="${id}" data-start="${ctx.T}" data-duration="${r(ctx.L)}" data-track-index="${ctx.track}" style="opacity:0;">`; }

// ---- archetype selection -----------------------------------------------------
function archetypeFor(scene, i, total) {
  const k = String(scene.kind || "").toLowerCase();
  const p = String(scene.purpose || "").toLowerCase();
  if (i === 0 || k === "hook" || k === "title" || /hook|intro|open/.test(p)) return "open";
  if (i === total - 1 || k === "cta" || /cta|close|sign\s*up|subscribe|download|get\s*started/.test(p)) return "cta";
  if (k === "quote" || /quote|testimonial|manifesto/.test(p)) return "statement";
  if (k === "stat" || k === "chart" || k === "countdown" || (pickNumber(scene) && /proof|result|metric|stat|number/.test(p + k))) return "cards";
  if (bullets(scene, 2).length >= 2) return "cards";
  return "showcase";
}

// ---- scene builders ((scene, ctx, assets) -> {html, s}) ----------------------

// SCENE — OPEN: a single frosted-glass title panel scales and un-blurs into focus over
// the drifting light field. Opener energy.
function bOpen(scene, ctx, sceneAssets) {
  const { id, T, L, theme, S, portrait } = ctx;
  const kick = esc(scene.kicker || S.openKicker);
  const title = scene.headline || scene.title || "";
  // When the CD pins a hero shot to the hook, it floats in a glass plate beneath the title.
  const asset = (sceneAssets && sceneAssets[0]) || null;
  const shotW = portrait ? 58 : 42;
  const shot = asset ? glassShot(theme, { w: "100%", hcqw: shotW * frameHmul(asset), asset, tint: theme.tintSecondary }) : "";
  const inner = `<div style="position:relative;z-index:2;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;padding:6% 8%;text-align:center;">
    <div class="gd-display" style="font-size:${r(headlineSize(title, 12))}cqw;">${esc(title)}</div>
    <div class="gd-kicker" style="margin-top:3cqw;">${kick}</div>
  </div>`;
  const panel = glassPanel(theme, { w: portrait ? "82cqw" : "62cqw", h: portrait ? "30cqw" : "26cqw", tint: theme.tintPrimary, radius: "5cqw", inner });
  const html = `${open(id, ctx)}<div class="gd-center">
    <div class="${id}-panel" style="opacity:0;">${panel}</div>
    ${scene.subtext ? `<div class="gd-body ${id}-sub" style="opacity:0;margin-top:4cqw;max-width:80%;text-align:center;">${esc(scene.subtext)}</div>` : ""}
    ${asset ? `<div class="${id}-shot" style="opacity:0;width:${shotW}cqw;margin-top:5cqw;perspective:1600px;">${shot}</div>` : ""}
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.4},${T});`,
    `tl.fromTo(".${id}-panel",{opacity:0,scale:0.9,filter:"blur(24px)"},{opacity:1,scale:1,filter:"blur(0px)",duration:0.8,ease:"power3.out"},${r(T + 0.3)});`,
    scene.subtext ? `tl.fromTo(".${id}-sub",{opacity:0,y:18},{opacity:1,y:0,duration:0.55,ease:"power2.out"},${r(T + 1)});` : "",
    `tl.to(".${id}-panel",{y:"-=1.4cqw",duration:2.4,ease:"sine.inOut",yoyo:true,repeat:${reps(L - 1.4, 2.4)},overwrite:"auto"},${r(T + 1.3)});`,
    asset ? `tl.fromTo(".${id}-shot",{opacity:0,y:70,scale:0.88,filter:"blur(14px)"},{opacity:1,y:0,scale:1,filter:"blur(0px)",duration:0.8,ease:"power3.out"},${r(T + 0.8)});` : "",
    asset ? `tl.to(".${id}-shot",{y:"-=1.4cqw",duration:2.2,ease:"sine.inOut",yoyo:true,repeat:${reps(L - 1.8, 2.2)},overwrite:"auto"},${r(T + 1.6)});` : "",
  ].filter(Boolean);
  return { html, s };
}

// SCENE — STATEMENT: a single big gradient/ink line inside a wide frosted-glass panel
// that un-blurs and breathes. For quotes / manifestos.
function bStatement(scene, ctx, sceneAssets) {
  const { id, T, L, theme, S, portrait } = ctx;
  const kick = esc(scene.kicker || S.statementKicker);
  const text = scene.headline || scene.title || scene.subtext || "";
  // A supporting shot the CD assigned to the quote floats in a glass plate beneath it — the
  // testimonial reads alongside the product it praises. Panel shrinks to leave room.
  const asset = (sceneAssets && sceneAssets[0]) || null;
  const shotW = portrait ? 56 : 40;
  const shot = asset ? glassShot(theme, { w: "100%", hcqw: shotW * frameHmul(asset), asset, tint: theme.tintSecondary }) : "";
  const inner = `<div style="position:relative;z-index:2;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;padding:8% 8%;text-align:center;">
    <div class="gd-kicker" style="margin-bottom:3.4cqw;">${kick}</div>
    <div class="gd-display gd-grad" style="font-size:${r(headlineSize(text, 11))}cqw;">${esc(text)}</div>
    ${scene.subtext && scene.subtext !== text ? `<div class="gd-body" style="margin-top:3cqw;max-width:86%;">${esc(scene.subtext)}</div>` : ""}
  </div>`;
  const panelH = asset ? (portrait ? "34cqw" : "30cqw") : (portrait ? "44cqw" : "40cqw");
  const panel = glassPanel(theme, { w: portrait ? "86cqw" : "68cqw", h: panelH, tint: theme.tintPrimary, radius: "5cqw", inner });
  const html = `${open(id, ctx)}<div class="gd-center">
    <div class="${id}-panel" style="opacity:0;">${panel}</div>
    ${asset ? `<div class="${id}-shot" style="opacity:0;width:${shotW}cqw;margin-top:4.5cqw;perspective:1600px;">${shot}</div>` : ""}
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.4},${T});`,
    `tl.fromTo(".${id}-panel",{opacity:0,scale:0.82,filter:"blur(22px)"},{opacity:1,scale:1,filter:"blur(0px)",duration:0.85,ease:"back.out(1.5)"},${r(T + 0.3)});`,
    `tl.to(".${id}-panel",{scale:1.02,duration:${r(Math.max(1.6, L - 1.6))},ease:"sine.inOut",yoyo:true,repeat:1,transformOrigin:"center center"},${r(T + 1.2)});`,
    asset ? `tl.fromTo(".${id}-shot",{opacity:0,y:72,scale:0.88,filter:"blur(14px)"},{opacity:1,y:0,scale:1,filter:"blur(0px)",duration:0.8,ease:"power3.out"},${r(T + 0.85)});` : "",
    asset ? `tl.to(".${id}-shot",{y:"-=1.4cqw",duration:2.2,ease:"sine.inOut",yoyo:true,repeat:${reps(L - 1.8, 2.2)},overwrite:"auto"},${r(T + 1.7)});` : "",
  ].filter(Boolean);
  return { html, s };
}

// SCENE — SHOWCASE: a single screenshot floating inside a frosted-glass frame, rising and
// drifting, with a headline. Portrait shots (ratio<0.9) get a tall frame; wide shots a
// shorter card. The product-in-glass moment.
function bShowcase(scene, ctx, sceneAssets) {
  const { id, T, L, theme, S, portrait } = ctx;
  const kick = esc(scene.kicker || S.showcaseKicker);
  const asset = (sceneAssets && sceneAssets[0]) || null;
  const w = parseFloat(fitPlateW(ctx, portrait ? 66 : 46, asset));
  const hmul = frameHmul(asset);
  const shot = glassShot(theme, { w: "100%", hcqw: w * hmul, asset, tint: theme.tintPrimary });
  const html = `${open(id, ctx)}<div class="gd-safe" style="justify-content:center;">
    <div class="gd-kicker ${id}-kick" style="opacity:0;margin-bottom:3cqw;">${kick}</div>
    <div class="${id}-shot" style="opacity:0;width:${w}cqw;perspective:1600px;">${shot}</div>
    ${scene.headline ? `<div class="gd-h1 ${id}-cap" style="opacity:0;margin-top:5cqw;text-align:center;font-size:${r(headlineSize(scene.headline, 7))}cqw;">${accentWords(id, scene.headline)}</div>` : ""}
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.35},${T});`,
    `tl.fromTo(".${id}-kick",{opacity:0,y:-14},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 0.2)});`,
    `tl.fromTo(".${id}-shot",{opacity:0,y:90,scale:0.86,filter:"blur(14px)"},{opacity:1,y:0,scale:1,filter:"blur(0px)",duration:0.8,ease:"power3.out"},${r(T + 0.4)});`,
    `tl.to(".${id}-shot",{y:"-=1.6cqw",duration:2,ease:"sine.inOut",yoyo:true,repeat:${reps(L - 1.4, 2)},overwrite:"auto"},${r(T + 1.4)});`,
    scene.headline ? `tl.fromTo(".${id}-cap",{opacity:0,y:20},{opacity:1,y:0,duration:0.55,ease:"power2.out"},${r(T + 1)});` : "",
    scene.headline ? `tl.fromTo(".${id}-gw",{opacity:0,y:24},{opacity:1,y:0,duration:0.5,ease:"back.out(1.6)",stagger:0.07},${r(T + 1.05)});` : "",
  ].filter(Boolean);
  return { html, s };
}

// SCENE — CARDS: a headline over a stack of frosted-glass stat/feature cards, each with a
// thumbnail (real screenshot when present) and a label, sliding up with a slight rotate.
// Uses bullets (+ pooled screenshots as card thumbs). The stat/feature moment.
function bCards(scene, ctx, sceneAssets) {
  const { id, T, L, theme, S } = ctx;
  const kick = esc(scene.kicker || S.cardsKicker);
  const shots = (sceneAssets || []).slice(0, 3);
  let feats = bullets(scene, 3);
  if (!feats.length) feats = shots.map((_, i) => `${scene.headline || scene.title || ""}`.trim() || `0${i + 1}`);
  const n = Math.max(feats.length, shots.length) || 1;
  const rot = [-5, 0, 5];
  const cards = Array.from({ length: n }).map((_, i) => {
    const label = feats[i] || "";
    const asset = shots[i] || null;
    const thumb = `<div style="width:20cqw;height:20cqw;border-radius:2cqw;overflow:hidden;border:0.12cqw solid rgba(255,255,255,0.2);position:relative;flex:0 0 auto;">${shotMedia(theme, asset, i % 2 ? theme.secondary : theme.primary)}</div>`;
    const text = `<div style="text-align:left;">
      <div style="font-family:${theme.displayStack};font-weight:700;font-size:4cqw;line-height:1.05;color:${theme.ink};">${esc(label)}</div>
      <div style="font-family:${theme.monoStack};font-size:2.4cqw;color:${theme.dim};margin-top:1.4cqw;letter-spacing:0.1em;">0${i + 1} — ${esc(S.cardTag)}</div>
    </div>`;
    const inner = `<div style="position:relative;z-index:2;display:flex;align-items:center;gap:3.4cqw;height:100%;padding:3cqw;">${thumb}${text}</div>`;
    const panel = glassPanel(theme, { w: "78cqw", h: "24cqw", tint: i % 2 ? theme.tintSecondary : theme.tintPrimary, radius: "3.4cqw", inner });
    return `<div class="${id}-card" style="opacity:0;"><div style="transform:rotate(${rot[i % 3] * 0.4}deg);">${panel}</div></div>`;
  }).join("");
  const html = `${open(id, ctx)}<div class="gd-safe">
    <div class="gd-kicker ${id}-kick" style="opacity:0;margin-bottom:2.4cqw;">${kick}</div>
    <div class="gd-h1 ${id}-head" style="opacity:0;text-align:center;font-size:${r(headlineSize(scene.headline, 7))}cqw;margin-bottom:4.5cqw;">${esc(scene.headline || scene.title || "")}</div>
    <div style="display:flex;flex-direction:column;gap:2.6cqw;align-items:center;">${cards}</div>
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.35},${T});`,
    `tl.fromTo(".${id}-kick",{opacity:0,y:-16},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 0.2)});`,
    `tl.fromTo(".${id}-head",{opacity:0,y:22},{opacity:1,y:0,duration:0.55,ease:"power2.out"},${r(T + 0.35)});`,
    `tl.fromTo(".${id}-card",{opacity:0,y:60,scale:0.9,filter:"blur(10px)"},{opacity:1,y:0,scale:1,filter:"blur(0px)",duration:0.62,ease:"power3.out",stagger:0.16},${r(T + 0.6)});`,
    `tl.to(".${id}-card",{y:"-=1cqw",duration:2.2,ease:"sine.inOut",yoyo:true,repeat:${reps(L - 1.6, 2.2)},stagger:0.12,overwrite:"auto"},${r(T + 1.6)});`,
  ];
  return { html, s };
}

// SCENE — GALLERY: several frosted-glass shots scatter and float at layered depth around a
// centered caption. "Layers of light." Uses pooled screenshots (real when present).
function bGallery(scene, ctx, sceneAssets) {
  const { id, T, L, theme, S } = ctx;
  const kick = esc(scene.kicker || S.galleryKicker);
  const POS = [
    { x: 30, y: 42, w: 32, r: -8 }, { x: 71, y: 38, w: 28, r: 8 },
    { x: 34, y: 70, w: 28, r: 7 }, { x: 72, y: 72, w: 32, r: -8 }, { x: 52, y: 56, w: 34, r: -2 },
  ];
  const shots = (sceneAssets || []);
  // GSAP animates the OUTER .fr (opacity/scale/float via y); the centering + rotation are
  // static CSS on an inner wrapper GSAP never touches (so the float can't discard them).
  const frames = POS.slice(0, Math.max(3, Math.min(POS.length, shots.length || 3))).map((f, i) => {
    const asset = shots[i] || null;
    const shot = glassShot(theme, { w: "100%", hcqw: f.w * 1.3, asset, tint: i % 2 ? theme.tintSecondary : theme.tintPrimary, radius: "2.4cqw" });
    return `<div class="${id}-fr" style="position:absolute;left:${f.x}%;top:${f.y}%;width:${f.w}cqw;opacity:0;z-index:${i}"><div style="transform:translate(-50%,-50%) rotate(${f.r}deg);">${shot}</div></div>`;
  }).join("");
  const html = `${open(id, ctx)}<div class="clip" style="position:absolute;inset:0;">
    ${frames}
    <div class="${id}-cap" style="position:absolute;left:0;right:0;top:11%;text-align:center;padding:0 8%;opacity:0;z-index:20;">
      <div class="gd-kicker" style="justify-content:center;margin-bottom:2cqw;">${kick}</div>
      <div class="gd-h1 gd-grad" style="text-align:center;font-size:${r(headlineSize(scene.headline, 8))}cqw;">${esc(scene.headline || scene.title || "")}</div>
    </div>
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.35},${T});`,
    `tl.fromTo(".${id}-fr",{opacity:0,y:40,scale:0.3,filter:"blur(14px)"},{opacity:1,y:0,scale:1,filter:"blur(0px)",duration:0.62,ease:"power3.out",stagger:0.12},${r(T + 0.25)});`,
    `tl.to(".${id}-fr",{y:"+=1.4cqw",duration:2,ease:"sine.inOut",yoyo:true,repeat:${reps(L - 1.4, 2)},stagger:0.15,overwrite:"auto"},${r(T + 1.3)});`,
    `tl.fromTo(".${id}-cap",{opacity:0,y:-16},{opacity:1,y:0,duration:0.55,ease:"power2.out"},${r(T + 0.7)});`,
  ];
  return { html, s };
}

// SCENE — CTA: a frosted-glass panel holds the logo mark (the user's logo when uploaded,
// else a built play glyph), the wordmark types in char-by-char, a bright glass button
// pulses and a url settles.
function bCta(scene, ctx, logo) {
  const { id, T, L, theme, S } = ctx;
  const word = String(scene.headline || scene.title || "KEYFRAME").slice(0, 20);
  const btn = esc(String(scene.emphasis || S.ctaButton).slice(0, 24));
  const tagline = esc(String(scene.subtext || S.ctaTagline).slice(0, 60));
  const url = esc(String(S.ctaUrl).toUpperCase());
  const mark = logo && logo.path
    ? logoMark(logo, { sizeCqw: 20, ground: theme.bgDeep, glow: theme.primary, escape: esc })
    : `<div style="position:relative;width:18cqw;height:18cqw;">
        <div style="position:absolute;inset:8%;border:0.4cqw solid ${theme.border};border-radius:26%;"></div>
        <div style="position:absolute;inset:0;border-radius:26%;background:${theme.gradient};box-shadow:0 0 6cqw ${theme.primary};display:flex;align-items:center;justify-content:center;">
          <div style="width:0;height:0;border-top:3cqw solid transparent;border-bottom:3cqw solid transparent;border-left:4.8cqw solid ${theme.onAccent};margin-left:1.1cqw;"></div>
        </div>
      </div>`;
  const chars = charSpans(word, `${id}-ch`);
  const inner = `<div style="position:relative;z-index:2;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;padding:8%;text-align:center;">
    <div class="gd-kicker ${id}-kick" style="opacity:0;margin-bottom:2.4cqw;">${esc(scene.kicker || S.ctaKicker)}</div>
    <div class="${id}-mark" style="opacity:0;">${mark}</div>
    <div class="gd-wordmark" style="margin-top:3cqw;">${chars}</div>
    <div class="gd-body ${id}-tag" style="opacity:0;margin-top:1.6cqw;">${tagline}</div>
    <div class="gd-btn ${id}-btn" style="opacity:0;margin-top:3.4cqw;">${btn} →</div>
    <div class="${id}-url" style="opacity:0;font-family:${theme.monoStack};letter-spacing:0.22em;font-size:2.4cqw;color:${theme.faint};margin-top:2.4cqw;">${url}</div>
  </div>`;
  const panel = glassPanel(theme, { w: "84cqw", h: "58cqw", tint: theme.tintPrimary, radius: "5cqw", inner });
  const html = `${open(id, ctx)}<div class="gd-center">
    <div class="${id}-panel" style="opacity:0;">${panel}</div>
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.4},${T});`,
    `tl.fromTo(".${id}-panel",{opacity:0,scale:0.9,filter:"blur(20px)"},{opacity:1,scale:1,filter:"blur(0px)",duration:0.7,ease:"power3.out"},${r(T + 0.3)});`,
    `tl.fromTo(".${id}-kick",{opacity:0,y:-14},{opacity:1,y:0,duration:0.45,ease:"power2.out"},${r(T + 0.5)});`,
    `tl.fromTo(".${id}-mark",{opacity:0,scale:0.6,y:20},{opacity:1,scale:1,y:0,duration:0.6,ease:"back.out(1.7)"},${r(T + 0.6)});`,
    `tl.fromTo(".${id}-ch",{opacity:0,y:60},{opacity:1,y:0,duration:0.5,ease:"power3.out",stagger:0.04},${r(T + 0.95)});`,
    `tl.fromTo(".${id}-tag",{opacity:0,y:14},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 1.4)});`,
    `tl.fromTo(".${id}-btn",{opacity:0,scale:0.8},{opacity:1,scale:1,duration:0.5,ease:"back.out(2)"},${r(T + 1.65)});`,
    `tl.to(".${id}-btn",{scale:1.04,duration:0.7,ease:"sine.inOut",yoyo:true,repeat:${reps(L - 2.25, 0.7)},overwrite:"auto"},${r(T + 2.25)});`,
    `tl.fromTo(".${id}-url",{opacity:0},{opacity:1,duration:0.5},${r(T + 1.9)});`,
  ];
  return { html, s };
}

const BUILDERS = { open: bOpen, statement: bStatement, showcase: bShowcase, cards: bCards, gallery: bGallery, cta: bCta };

// ---- persistent LIGHT-FIELD canvas (hf-seek) ---------------------------------
// One canvas painted purely from the renderer's hf-seek time: soft drifting color orbs of
// accent light, a faint refraction grid, a slow diagonal light sweep and floating glints —
// the light the glass panels refract. Colored ONLY with theme.primary/secondary (+ the
// fixed deep ground), so a brand skin recolors the whole field. Live preview drives it off
// the timeline; render is hf-seek only (deterministic).
function glassClip(theme, dims, D, seed) {
  const W = dims.width, H = dims.height;
  const [pr, pg, pb] = hexToRgb(theme.primary);
  const [sr, sg, sb] = hexToRgb(theme.secondary);
  const [dr, dg, db] = hexToRgb(theme.bgDeep);
  const html = `<div id="gd-glass-clip" class="clip" data-start="0" data-duration="${D}" data-track-index="0" data-layout-allow-occlusion style="background:${theme.bgDeep};">
    <canvas id="gd-glass" width="${W}" height="${H}" style="position:absolute;inset:0;width:100%;height:100%;"></canvas>
  </div>`;
  const script = `(function(){
  var cv=document.getElementById("gd-glass");if(!cv||!cv.getContext)return;var cx=cv.getContext("2d");if(!cx)return;
  var W=${W},H=${H};
  function P(a){return "rgba(${pr},${pg},${pb},"+a+")";}
  function S(a){return "rgba(${sr},${sg},${sb},"+a+")";}
  var GD="rgba(${dr},${dg},${db},";
  var sd=${seed >>> 0};function rnd(){sd=(sd*1664525+1013904223)>>>0;return sd/4294967296;}
  var N=Math.round(20*(W*H)/(1080*1920)),GL=[];
  for(var i=0;i<N;i++){GL.push({x:rnd(),y:rnd(),s:1+2.2*rnd(),ph:rnd()*6.28,warm:rnd()<0.5});}
  // A soft blurred light orb — a large radial gradient that drifts and pulses.
  function orb(fx,cx0,cy0,size,drift,ph,t){
    var x=cx0*W+Math.sin(t*drift+ph)*W*0.12,y=cy0*H+Math.cos(t*drift*0.8+ph)*H*0.08;
    var rr=size*(1+0.12*Math.sin(t*0.5+ph));
    var g=cx.createRadialGradient(x,y,0,x,y,rr);g.addColorStop(0,fx(0.8));g.addColorStop(0.66,fx(0));cx.fillStyle=g;cx.fillRect(0,0,W,H);
  }
  function draw(t){
    // deep ground
    cx.fillStyle="rgb(${dr},${dg},${db})";cx.fillRect(0,0,W,H);
    // drifting accent light orbs (the light behind the glass)
    orb(P,0.28,0.30,W*0.95,0.20,0,t);
    orb(S,0.74,0.66,W*0.88,-0.16,2,t);
    orb(P,0.60,0.12,W*0.72,0.12,4,t);
    // faint refraction grid
    var gu=W*0.09;cx.globalAlpha=0.05;cx.strokeStyle="rgba(255,255,255,1)";cx.lineWidth=1;
    for(var gx=0;gx<=W;gx+=gu){cx.beginPath();cx.moveTo(gx,0);cx.lineTo(gx,H);cx.stroke();}
    for(var gy=0;gy<=H;gy+=gu){cx.beginPath();cx.moveTo(0,gy);cx.lineTo(W,gy);cx.stroke();}
    cx.globalAlpha=1;
    // slow diagonal light sweep
    var sweepX=((-30+((t*22)%160))/100)*W;
    cx.save();cx.translate(sweepX+W*0.25,H*0.5);cx.rotate(18*Math.PI/180);
    var lg=cx.createLinearGradient(-W*0.25,0,W*0.25,0);lg.addColorStop(0,"rgba(255,255,255,0)");lg.addColorStop(0.5,"rgba(255,255,255,0.06)");lg.addColorStop(1,"rgba(255,255,255,0)");
    cx.fillStyle=lg;cx.fillRect(-W*0.25,-H*0.9,W*0.5,H*1.8);cx.restore();
    // floating glints in the light
    var span=H+60;
    for(var i=0;i<GL.length;i++){var d=GL[i];var y=(d.y*span-t*(10+40*(0.5+0.5*Math.sin(d.ph))))%span;if(y<0)y+=span;y-=30;var x=d.x*W+Math.sin(t*0.5+d.ph)*14;var op=0.12+0.3*(0.5+0.5*Math.sin(t*1.6+d.ph));cx.globalAlpha=op;cx.fillStyle=d.warm?P(1):S(1);cx.shadowColor=d.warm?P(1):S(1);cx.shadowBlur=d.s*3.4;cx.beginPath();cx.arc(x,y,d.s,0,6.283);cx.fill();}
    cx.shadowBlur=0;cx.globalAlpha=1;
    // vignette back into the ground
    var vg=cx.createRadialGradient(W*0.5,H*0.45,Math.min(W,H)*0.2,W*0.5,H*0.45,Math.max(W,H)*0.78);vg.addColorStop(0,GD+"0)");vg.addColorStop(1,GD+"0.9)");cx.fillStyle=vg;cx.fillRect(0,0,W,H);
  }
  // Painted ONLY from the renderer's hf-seek time — deterministic, seek-exact, capture-safe.
  window.KF_GLASS=draw;window.addEventListener("hf-seek",function(e){draw((e.detail&&e.detail.time)||0);});draw(0);
})();`;
  return { html, script };
}

// ---- grain overlay (top layer) -----------------------------------------------
const GRAIN_SVG = "<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/></filter><rect width='100%' height='100%' filter='url(#n)' opacity='0.5'/></svg>";
const GRAIN_URI = "data:image/svg+xml;base64," + Buffer.from(GRAIN_SVG).toString("base64");
function grainClip(D) {
  return `<div id="gd-grain" class="clip" data-start="0" data-duration="${D}" data-track-index="40" data-layout-allow-occlusion style="pointer-events:none;background-image:url('${GRAIN_URI}');background-size:260px 260px;opacity:0.04;mix-blend-mode:overlay;"></div>`;
}

// ---- style -------------------------------------------------------------------
function styleBlock(theme, portrait) {
  const safePad = portrait ? "12% 7% 14%" : "8% 8% 10%";
  return `${theme.fontFace}
  * { box-sizing:border-box; margin:0; padding:0; }
  html, body { width:100%; height:100%; overflow:hidden; background:#000; }
  #root { position:relative; overflow:hidden; isolation:isolate; background:${theme.bgDeep}; container-type:size; color:${theme.ink}; font-family:${theme.bodyStack}; }
  .clip { position:absolute; top:0; left:0; width:100%; height:100%; overflow:hidden; }
  .gd-safe { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:${safePad}; text-align:center; }
  .gd-center { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:${safePad}; text-align:center; }
  .gd-display { font-family:${theme.displayStack}; font-weight:700; line-height:0.98; letter-spacing:-0.02em; color:${theme.ink}; }
  .gd-h1 { font-family:${theme.displayStack}; font-weight:700; line-height:1.04; letter-spacing:-0.02em; color:${theme.ink}; }
  .gd-grad { background:${theme.gradient}; -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; color:transparent; }
  .gd-h1 .gd-gword:last-child { color:${theme.primary}; }
  .gd-kicker { display:inline-flex; align-items:center; gap:0.9cqw; font-family:${theme.monoStack}; font-weight:600; font-size:2cqw; letter-spacing:0.32em; text-transform:uppercase; color:${theme.dim}; }
  .gd-body { font-family:${theme.bodyStack}; font-weight:500; font-size:2.7cqw; line-height:1.42; color:${theme.dim}; }
  .gd-wordmark { display:flex; font-family:${theme.displayStack}; font-weight:800; font-size:9cqw; letter-spacing:-0.02em; color:${theme.ink}; }
  .gd-gword { will-change:transform,opacity; }
  .gd-glass { will-change:transform,opacity,filter; }
  .gd-btn { display:inline-flex; align-items:center; gap:1cqw; padding:2.6cqw 6cqw; border-radius:999px; background:rgba(255,255,255,0.92); color:${theme.bgDeep}; font-family:${theme.displayStack}; font-weight:700; font-size:3.4cqw; letter-spacing:0.02em; box-shadow:0 2cqw 6cqw -1.5cqw ${theme.primary}; will-change:transform,opacity; }
  #caps { position:absolute; inset:0; display:flex; justify-content:center; align-items:flex-end; padding-bottom:${portrait ? "16%" : "7%"}; z-index:60; pointer-events:none; }
  #cap-pill { max-width:82%; height:fit-content; flex:0 0 auto; text-align:center; padding:1.4cqw 3cqw; opacity:0; border-radius:2cqw; background:rgba(255,255,255,0.1); border:1px solid ${theme.glassBorder}; backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px); }
  #cap-text { font-family:${theme.bodyStack}; font-weight:600; font-size:2.6cqw; line-height:1.35; color:${theme.ink}; }`;
}

// ---- MAIN --------------------------------------------------------------------
function buildComposition({ storyboard, dims, framePack, captionCues, assets, brandSkin = null, localized = null } = {}) {
  const theme = glassTheme(brandSkin);
  const S = localized ? { ...STRINGS, ...localized } : STRINGS;
  const sb = storyboard || {};
  const W = (dims && dims.width) || 1080, H = (dims && dims.height) || 1920;
  const portrait = W < H;
  const scenes = Array.isArray(sb.scenes) && sb.scenes.length
    ? sb.scenes.slice(0, 12)
    : [{ id: "s1", start: 0, duration: 5, kind: "hook", headline: sb.title || "KEYFRAME" }];
  const D = r(sb.durationSec || scenes.reduce((a, s) => Math.max(a, (Number(s.start) || 0) + (Number(s.duration) || 0)), 0) || 12);
  const seed = seedFrom(sb.title || (scenes[0] && scenes[0].headline) || "glass");

  // ---- Assets: distribute real screenshots across DISPLAY-CAPABLE scenes -------
  // A screenshot must NEVER be stranded on a scene that can't show it (open / statement /
  // cta). The Creative Director's per-asset `sceneId` is a HINT: honored when that scene
  // can display an image, else the shot is redistributed to the least-loaded display scene
  // — so every usable screenshot actually appears. The logo is reserved for the CTA mark.
  const logo = logoAssetOf(assets);
  const shots = (Array.isArray(assets) ? assets : []).filter(screenOk)
    .sort((a, b) => (Number(b.cdScore) || 0) - (Number(a.cdScore) || 0));
  const baseArch = scenes.map((scene, i) => archetypeFor(scene, i, scenes.length));
  // Every CONTENT archetype can host its assigned shot in the glass language (open shows a
  // hero plate under the title, statement shows a supporting plate under the quote, cards →
  // thumbs, showcase/gallery → framed shots). Only the CTA (logo lockup) is asset-free — so
  // the CD's per-scene sceneId hint is honored on the very scene it points at, whatever kind.
  const canShow = (a) => a !== "cta";
  const displayIdx = scenes.map((_, i) => i).filter((i) => canShow(baseArch[i]));
  // Belt-and-suspenders: a shot must never be stranded → force a non-cta scene display-capable.
  if (!displayIdx.length && shots.length) {
    const j = scenes.findIndex((_, i) => baseArch[i] !== "cta");
    if (j >= 0) { baseArch[j] = "showcase"; displayIdx.push(j); }
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
    for (const i of displayIdx) sceneShots[i] = sceneShots[i].slice(0, 5);
  }

  const scriptStart = (i) => scenes.slice(0, i).reduce((a, s) => a + (Number(s.duration) || 0), 0);
  const bodyParts = [], sceneScripts = [];

  scenes.forEach((scene, i) => {
    const T = r(scene.start != null ? scene.start : scriptStart(i));
    const L = r(scene.duration || 5);
    let arch = baseArch[i];
    let sceneAssets = sceneShots[i];
    // A display-capable scene that received screenshots shows them. open/statement keep their
    // own identity and host ONE plate (hero under the title, support beside the quote); cards
    // keeps its stack of thumbs; otherwise 3+ → a floating glass gallery, 1–2 → a focused
    // glass showcase.
    if (canShow(arch) && sceneAssets.length) {
      if (arch === "open" || arch === "statement") { sceneAssets = sceneAssets.slice(0, 1); }
      else if (sceneAssets.length >= 3) { arch = "gallery"; sceneAssets = sceneAssets.slice(0, 5); }
      else if (arch === "cards") { sceneAssets = sceneAssets.slice(0, 3); }
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

  const glass = glassClip(theme, { width: W, height: H }, D, seed);
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
    if(window.KF_GLASS)window.KF_GLASS(now);
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
    glass.html,
    bodyParts.join("\n"),
    grainClip(D),
    caps,
    `</div>`,
    `<script>`, glass.script, `</script>`,
    `<script>`, script, `</script>`,
    `</body>`, `</html>`,
  ].join("\n");

  const metaJson = JSON.stringify({ compositionId: "vid", width: W, height: H, fps: (dims && dims.fps) || 30, duration: D });
  // resolvedBrand echoes the accents the film actually wore (or null when no brand was
  // applied), so graph.persistWornBrand discloses the true painted palette.
  return { indexHtml, metaJson, resolvedBrand: theme.resolvedBrand };
}

module.exports = { buildComposition, STRINGS };
