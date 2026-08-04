// PRODUCT SHOWCASE PRO composer — a native GSAP + canvas "commercial product-ad" film.
// The pack `product-showcase` (manifest renderer:"product-showcase") routes here from
// attemptLlmComposition, exactly like the flagship / kinetic / blueprint composers.
//
// Ported from the imported OmniMotion/React template ("Product Showcase Pro"). The React
// runtime is replaced by KEYFRAME's HyperFrames contract, but the identity is kept:
//   • a PERSISTENT animated STUDIO backdrop — a lit stage with a back-wall spotlight, a
//     floor, a horizon glow line, a floor spotlight pool, drifting light beams and
//     floating light dust — painted on ONE <canvas> as a pure function of the renderer's
//     hf-seek time (deterministic; flows continuously across every cut).
//   • a hero PRODUCT device-frame that rises with a rim-light, a reflection and a 3D
//     tilt and holds a real screenshot/upload (or an intentional branded placeholder);
//     feature CALLOUT leader-lines; a light-BURST climax; and a logo-reveal CTA.
//
// EVERYTHING is theme-driven: studioTheme(accent) derives the stage gradient, the
// spotlight/rim glow, the callout leaders, the gradient type and the CTA — so a brand
// skin recolors the WHOLE film (backgrounds, glows, frames, leaders, CTA), not just text.
//
// Engineering contract (identical to the other native composers): one paused GSAP
// timeline on window.__timelines["vid"]; direct-child .clip scenes on unique tracks; a
// boundary opacity:0 hard-kill per scene (the Studio persists behind them); ONE seek-safe
// caption node (#cap-text) driven by a single onUpdate proxy; finite repeats; cqw units +
// container-type:size (portrait-native, 9:16); hidden = opacity:0 only. Portrait is
// detected from dims (W<H); no manifest flag. Deterministic.

const { fontFaceCss, isBundled } = require("../fonts/pack_fonts");
const { varyArchetypes } = require("./motion_planner");
const { isTrustedProminent, isLogo } = require("./asset_priority");
const { logoMark } = require("./logo_render");
const { plateBox } = require("./responsive");
const { charSpans, wordCharSpans, supportLine } = require("./text_fx");
const { resolveBrand } = require("./brand_kit");
const { GSAP_CDN, r, esc, hexToRgb, relLum, longestWord, bullets, logoAssetOf, grainUri } = require("./composer_kit");

// Space Grotesk (bundled) carries the same geometric-commercial spirit as the template's
// Space Grotesk display; JetBrains Mono is the bundled mono label face; Inter → system-ui.
const DISPLAY = "Space Grotesk";
const MONO = "JetBrains Mono";
const BODY = "Inter";

// The template's default studio light + stage grounds when no brand is applied.
const DEF_ACCENT = "#FF6A3D";
const STAGE_TOP = "#0B0C12";
const STAGE_BOT = "#141620";
const BG_DEEP = "#08090F";
const FLOOR_TOP = "#101219";
const FLOOR_BOT = "#05060B";

// ---- helpers -----------------------------------------------------------------
function seedFrom(str) { let h = 2166136261; const s = String(str || "showcase"); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) || 7; }
// finite yoyo repeat count for a segment of `t` seconds at period `c`.
function reps(t, c) { return Math.max(0, Math.floor((Number(t) || 0) / (c || 1)) - 1); }

// ---- theme -------------------------------------------------------------------
// resolveBrand fits the brand accent to the dark stage (isDark:true → lifted for contrast)
// and passes the pack accent through untouched when no skin — so a null skin renders the
// exact default studio byte-for-byte and resolvedBrand is null (honest "unbranded"). When
// applied, the single accent becomes the brand's and every derived value (stage glow, rim,
// leaders, gradient, CTA) follows, and resolvedBrand echoes what was worn.
function studioTheme(brandSkin) {
  const fontFace = (isBundled(DISPLAY) ? fontFaceCss(DISPLAY) : "") + (isBundled(MONO) ? fontFaceCss(MONO) : "");
  let accent = DEF_ACCENT, resolvedBrand = null;
  try {
    const brand = resolveBrand(brandSkin, { ground: STAGE_BOT, isDark: true, packAccents: [DEF_ACCENT] });
    if (brand.applied) {
      accent = brand.accent || accent;
      resolvedBrand = {
        ...(brandSkin && typeof brandSkin === "object" ? brandSkin : {}),
        accents: [accent], emphasis: brand.emphasis, adjusted: brand.adjusted,
        dropped: brand.dropped, tier: brand.tier, applied: true,
      };
    }
  } catch { accent = DEF_ACCENT; resolvedBrand = null; }
  const onAccent = relLum(accent) > 0.55 ? "#0B0C12" : "#FFFFFF";
  return {
    accent, onAccent, stageTop: STAGE_TOP, stageBot: STAGE_BOT, bgDeep: BG_DEEP,
    floorTop: FLOOR_TOP, floorBot: FLOOR_BOT,
    ink: "#F3F5FB", dim: "rgba(243,245,251,0.66)", faint: "rgba(243,245,251,0.36)",
    productBg: "#171923", productBorder: "rgba(255,255,255,0.12)",
    gradient: `linear-gradient(120deg, ${accent}, color-mix(in oklab, ${accent} 55%, #ffffff))`,
    accentSoft: `color-mix(in oklab, ${accent} 42%, transparent)`,
    surface: `color-mix(in oklab, ${accent} 10%, #12131b)`,
    border: `color-mix(in oklab, ${accent} 40%, transparent)`,
    line: `color-mix(in oklab, ${accent} 22%, transparent)`,
    displayStack: `'${DISPLAY}', 'Inter', system-ui, sans-serif`,
    monoStack: `'${MONO}', ui-monospace, monospace`,
    bodyStack: `'${BODY}', system-ui, sans-serif`,
    fontFace, resolvedBrand,
  };
}

// ---- fixed copy (localizable) ------------------------------------------------
const STRINGS = {
  openKicker: "Now presenting",
  briefKicker: "The brief",
  heroKicker: "The hero shot",
  calloutsKicker: "Built to sell",
  galleryKicker: "Every angle",
  climaxKicker: "The reveal",
  ctaKicker: "Ready when you are",
  ctaButton: "Get started",
  ctaTagline: "Studio-grade video from a prompt.",
  ctaUrl: "keyframe.ai",
};

// ---- content extraction (shared shapes) --------------------------------------
function wordsOf(t) { return String(t || "").trim().split(/\s+/).filter(Boolean); }
function pickNumber(scene) {
  const src = [scene.emphasis, scene.subtext, scene.headline, ...(Array.isArray(scene.onScreenText) ? scene.onScreenText : [])]
    .map((x) => String(x || "")).find((x) => /\d/.test(x)) || "";
  return /\d/.test(src);
}
// Headline sized so long copy never overflows the portrait column.
// PORTRAIT FILL. The length ladder below keeps long copy from overflowing the column —
// but it is aspect-BLIND, and cqw is a fraction of WIDTH, so a headline occupies the same
// share of the line in 16:9 and 9:16 while a 9:16 frame is 177cqw TALL. Short headlines
// therefore sat as a small line in a very tall empty frame: the "under-illustrated /
// massive empty space" blocker the 9:16 audit kept finding.
//
// In portrait the slack is spent on the headlines that HAVE slack: short copy grows, long
// copy is left exactly where the ladder put it, so nothing that previously fitted starts
// to overflow.  is set once per build (see buildComposition).
let _portrait = false;
// FIT, rather than guess. The ladder below buckets by character count, which decides how
// many LINES a headline needs — not whether it fits the frame. Headlines are word spans, so
// they wrap between words and the binding constraint is the LONGEST WORD: that word cannot
// break, so if it is wider than the column it leaves the frame however many lines exist.
// Capping on the whole string instead would shrink perfectly good two-line headlines.
//
// 0.56em is the mean advance of a heavy display face; it is an estimate, so it is paired
// with a wrapping container as the safety net rather than trusted on its own.
const MEAN_ADVANCE_EM = 0.56;
const SAFE_LINE_CQW = 92;
function fitCap(text) {
  const len = longestWord(text).length;
  return len ? SAFE_LINE_CQW / (len * MEAN_ADVANCE_EM) : Infinity;
}
function headlineSize(text, base) {
  const len = String(text || "").length;
  const s = len > 42 ? base * 0.62 : len > 28 ? base * 0.76 : len > 18 ? base * 0.88 : base;
  const p = _portrait ? s * (len > 28 ? 1.0 : len > 18 ? 1.08 : 1.18) : s;
  return Math.min(p, fitCap(text));
}
// Split a headline into word spans for the reveal; the last word carries the accent.
function accentWords(id, text, accentLast) {
  const ws = wordsOf(text).slice(0, 10);
  return ws.map((w, i) =>
    `<span class="ps-gword ${id}-gw" style="display:inline-block;opacity:0;margin:0 0.22em 0.08em 0;${accentLast && i === ws.length - 1 ? "" : ""}">${esc(w)}</span>`
  ).join("");
}

// ---- asset gate + PRODUCT device-frame ---------------------------------------
function screenOk(a) {
  if (!a || !a.path) return false;
  if (isLogo(a)) return false; // the logo is CTA / key-moment material, not a product plate
  if (a.type === "video" || /\.(mp4|webm|mov)($|\?)/i.test(a.path)) return false;
  if (/\.svg($|\?)/i.test(a.path)) return false;
  return isTrustedProminent(a) || a.cdProminence === "hero" || a.cdProminence === "support";
}

// A studio-lit product frame holding a real screenshot — or, with no asset, an intentional
// branded placeholder (gradient wash + soft grid + glowing node) so an empty slot still
// reads as designed, never blank. Absolutely filled (100%×100%); the caller sizes it.
function productFrame(theme, asset, radius) {
  const inner = asset && asset.path
    ? `<img src="${esc(asset.path)}" alt="${esc(asset.alt || "")}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;">`
    : `<div style="position:absolute;inset:0;background:${theme.gradient};opacity:0.28;"></div>` +
      `<div style="position:absolute;inset:0;background-image:radial-gradient(circle at 50% 42%, ${theme.accentSoft}, transparent 62%);"></div>` +
      `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;"><div style="width:15%;aspect-ratio:1;border-radius:50%;background:${theme.gradient};box-shadow:0 0 4cqw ${theme.accent};opacity:0.9;"></div></div>`;
  return `<div class="pf" style="position:absolute;inset:0;border-radius:${radius || "5%"};overflow:hidden;background:${theme.productBg};border:0.16cqw solid ${theme.productBorder};box-shadow:0 0 7cqw -1cqw ${theme.accent}, 0 5cqw 13cqw -6cqw rgba(0,0,0,0.7);">
    ${inner}
    <div style="position:absolute;inset:0;background:linear-gradient(120deg, ${theme.accent}3a, transparent 42%);mix-blend-mode:screen;pointer-events:none;"></div>
    <div style="position:absolute;left:0;right:0;top:0;height:30%;background:linear-gradient(rgba(255,255,255,0.14),transparent);pointer-events:none;"></div>
  </div>`;
}
// A product on a turntable base with a rim-light and a fading reflection. GSAP animates the
// OUTER `.${id}-prod` (opacity/y/scale entrance + float); the 3D tilt is static CSS on an
// inner wrapper GSAP never touches (so the float can't discard it). `hcqw` = frame height
// in cqw. Portrait shots (ratio<0.9) get a taller phone frame; else a wide card.
function productBlock(id, theme, { w, hcqw, asset, tilt }) {
  const frame = productFrame(theme, asset, "6%");
  const t = tilt || 0;
  return `<div class="${id}-prod" style="opacity:0;width:${w};perspective:1600px;">
    <div style="position:relative;width:100%;height:${r(hcqw)}cqw;transform:rotateY(${t}deg);transform-style:preserve-3d;">${frame}</div>
    <div aria-hidden="true" style="position:relative;width:100%;height:${r(hcqw)}cqw;transform:scaleY(-1);opacity:0.14;margin-top:0.5cqw;-webkit-mask-image:linear-gradient(transparent 46%,#000);mask-image:linear-gradient(transparent 46%,#000);">${frame}</div>
  </div>`;
}
// Portrait screenshots want a tall frame; wide screenshots a shorter one.
function frameHmul(asset) {
  const ratio = Number(asset && asset.ratio) || (asset && asset.width && asset.height ? asset.width / asset.height : 0);
  if (ratio && ratio < 0.9) return 1.5;   // phone / portrait shot
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
function open(id, ctx) { return `<div class="clip ps-scene" id="${id}" data-start="${ctx.T}" data-duration="${r(ctx.L)}" data-track-index="${ctx.track}" style="opacity:0;">`; }

// ---- archetype selection -----------------------------------------------------
function archetypeFor(scene, i, total) {
  const k = String(scene.kind || "").toLowerCase();
  const p = String(scene.purpose || "").toLowerCase();
  if (i === 0 || k === "hook" || k === "title" || /hook|intro|open/.test(p)) return "open";
  if (i === total - 1 || k === "cta" || /cta|close|sign\s*up|subscribe|download|get\s*started/.test(p)) return "cta";
  if (k === "quote" || /quote|testimonial|manifesto/.test(p)) return "brief";
  if (k === "stat" || k === "chart" || k === "countdown" || (pickNumber(scene) && /proof|result|metric|stat|number/.test(p + k))) return "climax";
  if (bullets(scene, 2).length >= 2) return "callouts";
  return "hero";
}

// ---- scene builders ((scene, ctx, assets) -> {html, s}) ----------------------

// SCENE — OPEN: the stage lights up; a kicker, a big display title and a subtitle rise
// under the spotlight. Opener energy.
function bOpen(scene, ctx, sceneAssets) {
  const { id, T, L, theme, S, portrait } = ctx;
  const kick = esc(scene.kicker || S.openKicker);
  const title = scene.headline || scene.title || "";
  // When a hero shot is assigned, the opener shows it in a compact device frame under the
  // title (its own entrance + float); with NO asset the title floats as before (byte-identical).
  const asset = (sceneAssets && sceneAssets[0]) || null;
  const heroHtml = asset
    ? productBlock(id, theme, { w: fitPlateW(ctx, portrait ? 44 : 28, asset), hcqw: parseFloat(fitPlateW(ctx, portrait ? 44 : 28, asset)) * frameHmul(asset), asset, tilt: -6 })
    : "";
  const html = `${open(id, ctx)}<div class="ps-safe">
    <div class="ps-kicker ${id}-kick" style="opacity:0;margin-bottom:3cqw;">${kick}</div>
    <div class="ps-display ${id}-title" style="opacity:0;text-align:center;font-size:${r(headlineSize(title, 13))}cqw;">${esc(title)}</div>${asset ? `
    <div style="margin-top:4.4cqw;">${heroHtml}</div>` : ""}
    ${scene.subtext ? `<div class="ps-body ${id}-sub" style="opacity:0;margin-top:3.4cqw;max-width:82%;text-align:center;">${esc(scene.subtext)}</div>` : ""}
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.4},${T});`,
    `tl.fromTo(".${id}-kick",{opacity:0,y:-16},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 0.2)});`,
    `tl.fromTo(".${id}-title",{opacity:0,y:34,scale:0.94},{opacity:1,y:0,scale:1,duration:0.7,ease:"power3.out"},${r(T + 0.4)});`,
    asset ? `tl.fromTo(".${id}-prod",{opacity:0,y:80,scale:0.9},{opacity:1,y:0,scale:1,duration:0.8,ease:"power3.out"},${r(T + 0.7)});` : "",
    asset ? `tl.to(".${id}-prod",{y:"-=1.4cqw",duration:2.2,ease:"sine.inOut",yoyo:true,repeat:${reps(L - 1.7, 2.2)},overwrite:"auto"},${r(T + 1.7)});` : "",
    scene.subtext ? `tl.fromTo(".${id}-sub",{opacity:0,y:18},{opacity:1,y:0,duration:0.55,ease:"power2.out"},${r(T + 0.9)});` : "",
    asset ? "" : `tl.to(".${id}-title",{scale:1.02,duration:${r(Math.max(1.6, L - 1.6))},ease:"sine.inOut",yoyo:true,repeat:1,transformOrigin:"center center"},${r(T + 1.2)});`,
  ].filter(Boolean);
  return { html, s };
}

// SCENE — BRIEF: a monospace "brief" bar types the headline behind an accent rule, with a
// blinking caret. For quote / manifesto / statement scenes.
function bBrief(scene, ctx, sceneAssets) {
  const { id, T, L, theme, S, portrait } = ctx;
  const kick = esc(scene.kicker || S.briefKicker);
  // This beat showed only the headline — the remaining lines the script wrote for the
  // scene were dropped. supportLine takes the first that is not already on screen.
  const sup = supportLine(scene, [scene.kicker || S.briefKicker]);
  const text = String(scene.headline || scene.title || scene.subtext || "").slice(0, 120);
  // A supporting screenshot sits in a framed plate above the typed brief when one is
  // assigned; with NO asset the brief renders text-only exactly as before (byte-identical).
  const asset = (sceneAssets && sceneAssets[0]) || null;
  const pw = fitPlateW(ctx, portrait ? 52 : 34, asset);
  const plate = asset
    ? `<div class="${id}-prod" style="opacity:0;width:${pw};margin-bottom:5cqw;"><div style="position:relative;width:100%;height:${r(parseFloat(pw) * frameHmul(asset))}cqw;">${productFrame(theme, asset, "6%")}</div></div>`
    : "";
  const html = `${open(id, ctx)}<div class="ps-safe">
    <div class="ps-kicker ${id}-kick" style="opacity:0;margin-bottom:3.4cqw;">${kick}</div>${asset ? `
    ${plate}` : ""}
    <div class="${id}-bar" style="width:80%;opacity:0;text-align:left;">
      <div style="border-left:0.6cqw solid ${theme.accent};padding-left:4.4cqw;">
        <div class="ps-brieftext"><span id="${id}-typed"></span><span class="${id}-caret" style="color:${theme.accent};">▋</span></div>
      </div>
    </div>
    ${sup ? `<div class="ps-body ${id}-sup" style="opacity:0;margin-top:3cqw;max-width:78%;text-align:center;">${esc(sup)}</div>` : ""}
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.4},${T});`,
    `tl.fromTo(".${id}-kick",{opacity:0,y:-16},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 0.2)});`,
    asset ? `tl.fromTo(".${id}-prod",{opacity:0,y:60,scale:0.9},{opacity:1,y:0,scale:1,duration:0.8,ease:"power3.out"},${r(T + 0.3)});` : "",
    asset ? `tl.to(".${id}-prod",{y:"-=1.2cqw",duration:2.2,ease:"sine.inOut",yoyo:true,repeat:${reps(L - 1.6, 2.2)},overwrite:"auto"},${r(T + 1.6)});` : "",
    `tl.fromTo(".${id}-bar",{opacity:0,y:26},{opacity:1,y:0,duration:0.55,ease:"power3.out"},${r(T + 0.4)});`,
    `type("#${id}-typed",${JSON.stringify(text)},${r(T + 0.8)},${r(Math.max(0.8, L * 0.55))});`,
    `tl.to(".${id}-caret",{opacity:0,duration:0.42,ease:"steps(1)",yoyo:true,repeat:${reps(L * 0.7, 0.42)}},${r(T + 0.8)});`,
  ].filter(Boolean);
  return { html, s };
}

// SCENE — HERO: the product rises center on its turntable with a rim-light + reflection,
// and a caption headline lands (the last word in accent). The product moment (1 shot).
function bHero(scene, ctx, sceneAssets) {
  const { id, T, L, theme, S, portrait } = ctx;
  const kick = esc(scene.kicker || S.heroKicker);
  const asset = (sceneAssets && sceneAssets[0]) || null;
  const hmul = frameHmul(asset) * (portrait ? 1 : 0.9);
  const pw = fitPlateW(ctx, portrait ? 56 : 34, asset);
  const html = `${open(id, ctx)}<div class="ps-safe" style="justify-content:center;">
    <div class="ps-kicker ${id}-kick" style="opacity:0;margin-bottom:4cqw;">${kick}</div>
    ${productBlock(id, theme, { w: pw, hcqw: (portrait ? 56 : 34) * hmul, asset, tilt: -8 })}
    <div class="ps-h1 ${id}-cap" style="opacity:0;margin-top:5cqw;text-align:center;font-size:${r(headlineSize(scene.headline, 7))}cqw;">${accentWords(id, scene.headline || scene.title || "", true)}</div>
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.35},${T});`,
    `tl.fromTo(".${id}-kick",{opacity:0,y:-14},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 0.2)});`,
    `tl.fromTo(".${id}-prod",{opacity:0,y:110,scale:0.88},{opacity:1,y:0,scale:1,duration:0.8,ease:"power3.out"},${r(T + 0.4)});`,
    `tl.to(".${id}-prod",{y:"-=1.6cqw",duration:2,ease:"sine.inOut",yoyo:true,repeat:${reps(L - 1.4, 2)},overwrite:"auto"},${r(T + 1.4)});`,
    `tl.fromTo(".${id}-cap",{opacity:0,y:20},{opacity:1,y:0,duration:0.55,ease:"power2.out"},${r(T + 1)});`,
    `tl.fromTo(".${id}-gw",{opacity:0,y:24},{opacity:1,y:0,duration:0.5,ease:"back.out(1.6)",stagger:0.07},${r(T + 1.05)});`,
  ];
  return { html, s };
}

// SCENE — CALLOUTS: the product sits center while feature leader-lines draw out to numbered
// labels on alternating sides. Uses 1 shot + bullets.
function bCallouts(scene, ctx, sceneAssets) {
  const { id, T, L, theme, S } = ctx;
  const kick = esc(scene.kicker || S.calloutsKicker);
  const asset = (sceneAssets && sceneAssets[0]) || null;
  const feats = bullets(scene, 3);
  const hmul = frameHmul(asset);
  const rows = [0.30, 0.5, 0.7];
  const leaders = feats.map((f, i) => {
    const side = i % 2 === 0 ? -1 : 1;
    const y = rows[i] * 100;
    const labelLeft = side < 0;
    return `<div class="${id}-lead" style="opacity:0;">
      <div class="${id}-line" style="position:absolute;top:${y}%;${labelLeft ? "right:52%" : "left:52%"};width:20cqw;height:0.4cqw;background:${theme.accent};box-shadow:0 0 1.4cqw ${theme.accent};transform-origin:${labelLeft ? "right" : "left"} center;"></div>
      <div style="position:absolute;top:calc(${y}% - 0.7cqw);${labelLeft ? "right:calc(52% - 1cqw)" : "left:calc(52% - 1cqw)"};width:2cqw;height:2cqw;border-radius:50%;background:${theme.accent};box-shadow:0 0 2cqw ${theme.accent};"></div>
      <div style="position:absolute;top:calc(${y}% - 5cqw);${labelLeft ? "right:74%;text-align:right" : "left:74%;text-align:left"};max-width:22cqw;">
        <div style="font-family:${theme.monoStack};font-size:2.2cqw;color:${theme.accent};letter-spacing:0.16em;">0${i + 1}</div>
        <div style="font-family:${theme.displayStack};font-weight:700;font-size:3.2cqw;color:${theme.ink};line-height:1.15;">${esc(f)}</div>
      </div>
    </div>`;
  }).join("");
  const html = `${open(id, ctx)}<div class="clip" style="position:absolute;inset:0;">
    <div class="ps-kicker ${id}-kick" style="position:absolute;left:0;right:0;top:11%;justify-content:center;opacity:0;">${kick}</div>
    ${scene.headline ? `<div class="ps-h1 ${id}-head" style="position:absolute;left:0;right:0;top:15%;text-align:center;opacity:0;font-size:${r(headlineSize(scene.headline, 6))}cqw;padding:0 8%;">${esc(scene.headline)}</div>` : ""}
    <div class="${id}-prod" style="position:absolute;left:50%;top:52%;transform:translate(-50%,-50%);width:40cqw;perspective:1500px;opacity:0;">
      <div style="position:relative;width:100%;height:${r(40 * hmul)}cqw;">${productFrame(theme, asset, "6%")}</div>
    </div>
    ${leaders}
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.35},${T});`,
    `tl.fromTo(".${id}-kick",{opacity:0,y:-14},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 0.2)});`,
    scene.headline ? `tl.fromTo(".${id}-head",{opacity:0,y:16},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 0.3)});` : "",
    `tl.fromTo(".${id}-prod",{opacity:0,scale:0.9},{opacity:1,scale:1,duration:0.7,ease:"power3.out"},${r(T + 0.45)});`,
    feats.length ? `tl.fromTo(".${id}-lead",{opacity:0},{opacity:1,duration:0.4,stagger:0.18},${r(T + 0.9)});` : "",
    feats.length ? `tl.fromTo(".${id}-line",{scaleX:0},{scaleX:1,duration:0.5,ease:"power2.out",stagger:0.18},${r(T + 0.95)});` : "",
    `tl.to(".${id}-prod",{y:"-=1.2cqw",duration:2.2,ease:"sine.inOut",yoyo:true,repeat:${reps(L - 1.6, 2.2)},overwrite:"auto"},${r(T + 1.6)});`,
  ].filter(Boolean);
  return { html, s };
}

// SCENE — GALLERY: a headline over a row of product angle-views (real screenshots). 3 shots
// (fewer center-justified). "Every angle sells."
function bGallery(scene, ctx, sceneAssets) {
  const { id, T, L, theme, S } = ctx;
  const kick = esc(scene.kicker || S.galleryKicker);
  const shots = (sceneAssets || []).slice(0, 3);
  const tilts = shots.length === 3 ? [-14, 0, 14] : shots.length === 2 ? [-10, 10] : [0];
  const pw = shots.length >= 3 ? "26cqw" : shots.length === 2 ? "34cqw" : fitPlateW(ctx, 50, shots[0]);
  const row = `<div style="display:flex;gap:3cqw;justify-content:center;align-items:center;width:100%;">${shots.map((a, i) => {
    const hmul = frameHmul(a) * 1.2;
    return `<div style="width:${pw};text-align:center;">${productBlock(`${id}v${i}`, theme, { w: "100%", hcqw: parseFloat(pw) * hmul, asset: a, tilt: tilts[i] })}<div style="font-family:${theme.monoStack};font-size:2cqw;color:${theme.dim};margin-top:2.4cqw;letter-spacing:0.14em;text-transform:uppercase;">${esc((Array.isArray(scene.onScreenText) && scene.onScreenText[i]) || "")}</div></div>`;
  }).join("")}</div>`;
  const realHtml = `${open(id, ctx)}<div class="ps-safe">
    <div class="ps-kicker ${id}-kick" style="opacity:0;margin-bottom:2.4cqw;">${kick}</div>
    <div class="ps-h1 ${id}-head" style="opacity:0;text-align:center;font-size:${r(headlineSize(scene.headline, 7))}cqw;margin-bottom:5cqw;">${esc(scene.headline || scene.title || "")}</div>
    ${row}
  </div></div>`;
  const proTargets = shots.map((_, i) => `.${id}v${i}-prod`).join(",");
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.35},${T});`,
    `tl.fromTo(".${id}-kick",{opacity:0,y:-16},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 0.2)});`,
    `tl.fromTo(".${id}-head",{opacity:0,y:22},{opacity:1,y:0,duration:0.55,ease:"power2.out"},${r(T + 0.35)});`,
    `tl.fromTo("${proTargets}",{opacity:0,y:70,scale:0.86},{opacity:1,y:0,scale:1,duration:0.7,ease:"power3.out",stagger:0.14},${r(T + 0.6)});`,
    `tl.to("${proTargets}",{y:"-=1.4cqw",duration:1.9,ease:"sine.inOut",yoyo:true,repeat:${reps(L - 1.5, 1.9)},stagger:0.1,overwrite:"auto"},${r(T + 1.5)});`,
  ];
  return { html: realHtml, s };
}

// SCENE — CLIMAX: radiating light-rays fan out behind the product, a burst blooms, the
// product rises and a big gradient tagline lands with a flash. The dramatic peak.
function bClimax(scene, ctx, sceneAssets) {
  const { id, T, L, theme, S, portrait } = ctx;
  const asset = (sceneAssets && sceneAssets[0]) || null;
  // The burst showed its tagline and nothing else — the remaining lines the script wrote
  // for the scene were dropped. supportLine takes the first not already on screen.
  const supC = supportLine(scene, [scene.headline, scene.title, scene.emphasis]);
  const hmul = frameHmul(asset);
  const rays = Array.from({ length: 24 }).map((_, i) => {
    const ang = (i / 24) * 360;
    return `<div style="position:absolute;left:50%;top:40%;transform:rotate(${ang}deg);transform-origin:0 0;"><div class="${id}-ray" style="position:absolute;left:6cqw;top:-0.2cqw;width:40cqw;height:0.4cqw;transform-origin:0 50%;opacity:0;background:linear-gradient(90deg,${theme.accent},transparent);"></div></div>`;
  }).join("");
  const pw = fitPlateW(ctx, portrait ? 42 : 28, asset);
  const html = `${open(id, ctx)}<div class="clip" style="position:absolute;inset:0;">
    ${rays}
    <div class="${id}-burst" style="position:absolute;left:50%;top:40%;width:60cqw;height:60cqw;margin-left:-30cqw;margin-top:-30cqw;border-radius:50%;opacity:0;background:radial-gradient(circle,#fff,${theme.accent} 34%,transparent 68%);mix-blend-mode:screen;"></div>
    <div class="${id}-prod" style="position:absolute;left:50%;top:40%;transform:translate(-50%,-50%);width:${pw};opacity:0;">
      <div style="position:relative;width:100%;height:${r(parseFloat(pw) * hmul)}cqw;">${productFrame(theme, asset, "6%")}</div>
    </div>
    <div class="ps-display kf-grad ${id}-tag" style="position:absolute;left:0;right:0;top:74%;text-align:center;padding:0 8%;opacity:0;font-size:${r(headlineSize(scene.headline, 10))}cqw;">${accentWords(id, scene.headline || scene.title || "", true)}</div>
    ${supC ? `<div class="ps-body ${id}-supc" style="position:absolute;left:0;right:0;top:84%;text-align:center;padding:0 10%;opacity:0;">${esc(supC)}</div>` : ""}
    <div class="${id}-flash" style="position:absolute;inset:0;pointer-events:none;background:#fff;opacity:0;mix-blend-mode:screen;"></div>
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.35},${T});`,
    `tl.fromTo(".${id}-ray",{opacity:0,scaleX:0.15},{opacity:0.55,scaleX:1,duration:0.6,ease:"power2.out",stagger:0.008},${r(T + 0.3)});`,
    `tl.to(".${id}-ray",{opacity:0.25,duration:${r(Math.max(1, L - 2))},ease:"sine.inOut",yoyo:true,repeat:1},${r(T + 1)});`,
    `tl.fromTo(".${id}-burst",{opacity:0,scale:0.4},{opacity:0.7,scale:1,duration:0.7,ease:"power2.out"},${r(T + 0.35)});`,
    `tl.to(".${id}-burst",{opacity:0.32,duration:${r(Math.max(1, L - 2))},ease:"sine.inOut",yoyo:true,repeat:1},${r(T + 1.1)});`,
    `tl.fromTo(".${id}-flash",{opacity:0},{opacity:0.7,duration:0.12,yoyo:true,repeat:1,ease:"power2.out"},${r(T + 0.42)});`,
    `tl.fromTo(".${id}-prod",{opacity:0,y:60,scale:0.86},{opacity:1,y:0,scale:1,duration:0.8,ease:"power3.out"},${r(T + 0.5)});`,
    `tl.to(".${id}-prod",{y:"-=1.2cqw",duration:2,ease:"sine.inOut",yoyo:true,repeat:${reps(L - 2, 2)},overwrite:"auto"},${r(T + 1.6)});`,
    `tl.fromTo(".${id}-tag",{opacity:0,y:24},{opacity:1,y:0,duration:0.55,ease:"power2.out"},${r(T + 1.1)});`,
    `tl.fromTo(".${id}-gw",{opacity:0,y:24,scale:0.8},{opacity:1,y:0,scale:1,duration:0.5,ease:"back.out(1.7)",stagger:0.07},${r(T + 1.15)});`,
  ];
  return { html, s };
}

// SCENE — CTA: the logo mark assembles (the user's logo when uploaded, else a built play
// glyph), the wordmark types in char-by-char, a gradient button pulses, a url settles.
function bCta(scene, ctx, logo) {
  const { id, T, L, theme, S } = ctx;
  const word = String(scene.headline || scene.title || "KEYFRAME").slice(0, 20);
  const btn = esc(String(scene.emphasis || S.ctaButton).slice(0, 24));
  const tagline = esc(String(scene.subtext || S.ctaTagline).slice(0, 60));
  const url = esc(String(S.ctaUrl).toUpperCase());
  const mark = logo && logo.path
    ? logoMark(logo, { sizeCqw: 22, ground: theme.stageBot, glow: theme.accent, escape: esc })
    : `<div style="position:relative;width:20cqw;height:20cqw;">
        <div style="position:absolute;inset:8%;border:0.4cqw solid ${theme.border};border-radius:26%;"></div>
        <div style="position:absolute;inset:0;border-radius:26%;background:${theme.gradient};box-shadow:0 0 6cqw ${theme.accent};display:flex;align-items:center;justify-content:center;">
          <div style="width:0;height:0;border-top:3.4cqw solid transparent;border-bottom:3.4cqw solid transparent;border-left:5.4cqw solid ${theme.onAccent};margin-left:1.2cqw;"></div>
        </div>
      </div>`;
  const chars = wordCharSpans(word, `${id}-ch`);
  const html = `${open(id, ctx)}<div class="ps-safe">
    <div class="ps-kicker ${id}-kick" style="opacity:0;margin-bottom:2.4cqw;">${esc(scene.kicker || S.ctaKicker)}</div>
    <div class="${id}-mark" style="opacity:0;">${mark}</div>
    <div class="ps-wordmark" style="font-size:${r(Math.min(11, fitCap(word)))}cqw;margin-top:3.4cqw;">${chars}</div>
    <div class="ps-body ${id}-tag" style="opacity:0;margin-top:1.8cqw;">${tagline}</div>
    <div class="ps-btn ${id}-btn" style="opacity:0;margin-top:3.6cqw;color:${theme.onAccent};">${btn} ▸</div>
    <div class="${id}-url" style="opacity:0;font-family:${theme.monoStack};letter-spacing:0.24em;font-size:2.4cqw;color:${theme.faint};margin-top:2.4cqw;">${url}</div>
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.4},${T});`,
    `tl.fromTo(".${id}-kick",{opacity:0,y:-14},{opacity:1,y:0,duration:0.45,ease:"power2.out"},${r(T + 0.2)});`,
    `tl.fromTo(".${id}-mark",{opacity:0,scale:0.6,y:20},{opacity:1,scale:1,y:0,duration:0.6,ease:"back.out(1.7)"},${r(T + 0.35)});`,
    `tl.fromTo(".${id}-ch",{opacity:0,y:60},{opacity:1,y:0,duration:0.5,ease:"power3.out",stagger:0.04},${r(T + 0.7)});`,
    `tl.fromTo(".${id}-tag",{opacity:0,y:14},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 1.2)});`,
    `tl.fromTo(".${id}-btn",{opacity:0,scale:0.8},{opacity:1,scale:1,duration:0.5,ease:"back.out(2)"},${r(T + 1.45)});`,
    `tl.to(".${id}-btn",{scale:1.04,duration:0.7,ease:"sine.inOut",yoyo:true,repeat:${reps(L - 2.05, 0.7)},overwrite:"auto"},${r(T + 2.05)});`,
    `tl.fromTo(".${id}-url",{opacity:0},{opacity:1,duration:0.5},${r(T + 1.7)});`,
  ];
  return { html, s };
}

const BUILDERS = { open: bOpen, brief: bBrief, hero: bHero, callouts: bCallouts, gallery: bGallery, climax: bClimax, cta: bCta };

// ---- persistent STUDIO canvas (hf-seek) --------------------------------------
// One canvas painted purely from the renderer's hf-seek time: the lit stage, back-wall
// spotlight, floor, horizon glow, spotlight pool, drifting light beams and floating dust.
// Colored ONLY with theme.accent (+ the fixed dark grounds), so a brand skin recolors the
// whole studio. Live preview drives it off the timeline; render is hf-seek only.
function studioClip(theme, dims, D, seed) {
  const W = dims.width, H = dims.height;
  const [ar, ag, ab] = hexToRgb(theme.accent);
  const [t0r, t0g, t0b] = hexToRgb(theme.stageTop);
  const [b0r, b0g, b0b] = hexToRgb(theme.stageBot);
  const [f0r, f0g, f0b] = hexToRgb(theme.floorTop);
  const [f1r, f1g, f1b] = hexToRgb(theme.floorBot);
  const [dr, dg, db] = hexToRgb(theme.bgDeep);
  const html = `<div id="ps-studio-clip" class="clip" data-start="0" data-duration="${D}" data-track-index="0" data-layout-allow-occlusion style="background:${theme.stageBot};">
    <canvas id="ps-studio" width="${W}" height="${H}" style="position:absolute;inset:0;width:100%;height:100%;"></canvas>
  </div>`;
  const script = `(function(){
  var cv=document.getElementById("ps-studio");if(!cv||!cv.getContext)return;var cx=cv.getContext("2d");if(!cx)return;
  var W=${W},H=${H},HZ=H*0.6;
  function A(a){return "rgba(${ar},${ag},${ab},"+a+")";}
  var GD="rgba(${dr},${dg},${db},";
  var sd=${seed >>> 0};function rnd(){sd=(sd*1664525+1013904223)>>>0;return sd/4294967296;}
  var N=Math.round(24*(W*H)/(1080*1920)),DU=[];
  for(var i=0;i<N;i++){DU.push({x:rnd(),y:rnd(),s:1+2.4*rnd(),ph:rnd()*6.28});}
  function draw(t){
    // stage gradient (top -> bottom)
    var sg=cx.createLinearGradient(0,0,0,HZ);sg.addColorStop(0,"rgb(${t0r},${t0g},${t0b})");sg.addColorStop(1,"rgb(${b0r},${b0g},${b0b})");cx.fillStyle=sg;cx.fillRect(0,0,W,HZ);
    // floor
    var fg=cx.createLinearGradient(0,HZ,0,H);fg.addColorStop(0,"rgb(${f0r},${f0g},${f0b})");fg.addColorStop(1,"rgb(${f1r},${f1g},${f1b})");cx.fillStyle=fg;cx.fillRect(0,HZ,W,H-HZ);
    // back-wall spotlight (drifts)
    var wx=W*0.5+Math.sin(t*0.4)*W*0.05,wy=HZ*0.42,wr=W*0.5;
    var wg=cx.createRadialGradient(wx,wy,0,wx,wy,wr);wg.addColorStop(0,A(0.26));wg.addColorStop(0.62,A(0));cx.fillStyle=wg;cx.fillRect(0,0,W,HZ);
    // light beams from top (sway)
    for(var b=0;b<2;b++){var s=b?1:-1;cx.save();cx.translate(W*0.5,-H*0.1);cx.rotate((s*(10+Math.sin(t*0.3)*2))*Math.PI/180);var bw=W*0.34,bh=H*0.9;var bg=cx.createLinearGradient(0,0,0,bh);bg.addColorStop(0,A(0.16));bg.addColorStop(0.6,A(0));cx.fillStyle=bg;cx.fillRect(-bw/2,0,bw,bh);cx.restore();}
    // horizon glow line
    var hg=cx.createLinearGradient(0,0,W,0);hg.addColorStop(0,A(0));hg.addColorStop(0.5,A(0.5));hg.addColorStop(1,A(0));cx.fillStyle=hg;cx.fillRect(0,HZ-1.5,W,3);
    // floor spotlight pool (pulses)
    var pr=1+0.05*Math.sin(t*0.5);cx.save();cx.translate(W*0.5,HZ);cx.scale(1,0.34);var pg=cx.createRadialGradient(0,0,0,0,0,W*0.46*pr);pg.addColorStop(0,A(0.22));pg.addColorStop(0.7,A(0));cx.fillStyle=pg;cx.beginPath();cx.arc(0,0,W*0.46*pr,0,6.283);cx.fill();cx.restore();
    // floating dust in the light
    for(var i=0;i<DU.length;i++){var d=DU[i];var y=(d.y*H-t*8)%H;if(y<0)y+=H;var op=0.14+0.26*(0.5+0.5*Math.sin(t*2+d.ph));cx.globalAlpha=op;cx.fillStyle=A(1);cx.shadowColor=A(1);cx.shadowBlur=d.s*3;cx.beginPath();cx.arc(d.x*W,y,d.s,0,6.283);cx.fill();}
    cx.shadowBlur=0;cx.globalAlpha=1;
    // vignette
    var vg=cx.createRadialGradient(W*0.5,H*0.45,Math.min(W,H)*0.2,W*0.5,H*0.45,Math.max(W,H)*0.78);vg.addColorStop(0,GD+"0)");vg.addColorStop(1,GD+"0.92)");cx.fillStyle=vg;cx.fillRect(0,0,W,H);
  }
  // Painted ONLY from the renderer's hf-seek time — deterministic, seek-exact, capture-safe.
  window.KF_STUDIO=draw;window.addEventListener("hf-seek",function(e){draw((e.detail&&e.detail.time)||0);});draw(0);
})();`;
  return { html, script };
}

// ---- grain overlay (top layer) -----------------------------------------------
const GRAIN_URI = grainUri(0.9);
function grainClip(D) {
  return `<div id="ps-grain" class="clip" data-start="0" data-duration="${D}" data-track-index="40" data-layout-allow-occlusion style="pointer-events:none;background-image:url('${GRAIN_URI}');background-size:260px 260px;opacity:0.045;mix-blend-mode:overlay;"></div>`;
}

// ---- style -------------------------------------------------------------------
function styleBlock(theme, portrait) {
  const safePad = portrait ? "12% 7% 14%" : "8% 8% 10%";
  return `${theme.fontFace}
  * { box-sizing:border-box; margin:0; padding:0; }
  html, body { width:100%; height:100%; overflow:hidden; background:#000; }
  #root { position:relative; overflow:hidden; isolation:isolate; background:${theme.stageBot}; container-type:size; color:${theme.ink}; font-family:${theme.bodyStack}; }
  .clip { position:absolute; top:0; left:0; width:100%; height:100%; overflow:hidden; }
  .ps-safe { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:${safePad}; text-align:center; }
  .ps-display { font-family:${theme.displayStack}; font-weight:800; line-height:0.96; letter-spacing:-0.03em; color:${theme.ink}; }
  .ps-h1 { font-family:${theme.displayStack}; font-weight:700; line-height:1.04; letter-spacing:-0.02em; color:${theme.ink}; }
  .kf-grad { color:transparent; }
  .kf-grad .ps-gword:last-child { background:${theme.gradient}; -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; color:transparent; }
  .ps-h1 .ps-gword:last-child { color:${theme.accent}; }
  .ps-kicker { display:inline-flex; align-items:center; gap:0.9cqw; font-family:${theme.monoStack}; font-weight:600; font-size:2cqw; letter-spacing:0.38em; text-transform:uppercase; color:${theme.dim}; }
  .ps-body { font-family:${theme.bodyStack}; font-weight:500; font-size:2.7cqw; line-height:1.42; color:${theme.dim}; }
  .ps-wordmark { display:flex; flex-wrap:wrap; justify-content:center; text-align:center; gap:0 0.26em; max-width:92%; font-family:${theme.displayStack}; font-weight:800; font-size:11cqw; letter-spacing:-0.02em; color:${theme.ink}; }
  .ps-gword { will-change:transform,opacity; }
  .ps-btn { display:inline-flex; align-items:center; gap:1cqw; padding:2.8cqw 6.4cqw; border-radius:999px; background:${theme.gradient}; font-family:${theme.monoStack}; font-weight:700; font-size:3.4cqw; letter-spacing:0.08em; text-transform:uppercase; box-shadow:0 2cqw 6cqw -1.5cqw ${theme.accent}; will-change:transform,opacity; }
  .ps-brieftext { font-family:${theme.monoStack}; font-size:4cqw; line-height:1.4; color:${theme.ink}; min-height:4cqw; text-align:left; }
  .pf, .ps-prod { will-change:transform,opacity; }
  #caps { position:absolute; inset:0; display:flex; justify-content:center; align-items:flex-end; padding-bottom:${portrait ? "16%" : "7%"}; z-index:60; pointer-events:none; }
  #cap-pill { max-width:82%; height:fit-content; flex:0 0 auto; text-align:center; padding:1.4cqw 3cqw; opacity:0; border-radius:2cqw; background:rgba(6,8,16,0.72); border:1px solid ${theme.border}; backdrop-filter:blur(8px); }
  #cap-text { font-family:${theme.bodyStack}; font-weight:600; font-size:2.6cqw; line-height:1.35; color:${theme.ink}; }`;
}

// ---- MAIN --------------------------------------------------------------------
function buildComposition({ storyboard, dims, framePack, captionCues, assets, brandSkin = null, localized = null } = {}) {
  // Portrait drives the headline fill ladder (see headlineSize).
  _portrait = (dims && dims.height > dims.width) || false;
  const theme = studioTheme(brandSkin);
  const S = localized ? { ...STRINGS, ...localized } : STRINGS;
  const sb = storyboard || {};
  const W = (dims && dims.width) || 1080, H = (dims && dims.height) || 1920;
  const portrait = W < H;
  const scenes = Array.isArray(sb.scenes) && sb.scenes.length
    ? sb.scenes.slice(0, 12)
    : [{ id: "s1", start: 0, duration: 5, kind: "hook", headline: sb.title || "KEYFRAME" }];
  const D = r(sb.durationSec || scenes.reduce((a, s) => Math.max(a, (Number(s.start) || 0) + (Number(s.duration) || 0)), 0) || 12);
  const seed = seedFrom(sb.title || (scenes[0] && scenes[0].headline) || "showcase");

  // ---- Assets: distribute real screenshots across DISPLAY-CAPABLE scenes -------
  // A screenshot must NEVER be stranded on a scene that can't show it (open / brief / cta).
  // The Creative Director's per-asset `sceneId` is a HINT: honored when that scene can
  // display an image, else the shot is redistributed to the least-loaded display scene —
  // so every usable screenshot actually appears. The logo is reserved for the CTA mark.
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
  // EVERY content archetype hosts its assigned shot in the studio's own device-frame /
  // reflection / burst / plate language — only the pure CTA (logo lockup) is excluded — so
  // a stat/quote/hook scene the CD pinned a screenshot to renders it on the intended scene.
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
    // A display-capable scene that received screenshots shows them. The hook (open), quote
    // (brief), feature-callouts and stat-climax scenes keep their identity and host ONE shot
    // in-style; a plain feature with 3+ shots becomes a gallery row; else a focused hero.
    if (canShow(arch) && sceneAssets.length) {
      if (arch === "open" || arch === "brief") { sceneAssets = sceneAssets.slice(0, 1); }
      else if (sceneAssets.length >= 3) { arch = "gallery"; sceneAssets = sceneAssets.slice(0, 3); }
      else if (arch === "callouts") { sceneAssets = sceneAssets.slice(0, 1); }
      else if (arch === "climax") { sceneAssets = sceneAssets.slice(0, 1); }
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

  const studio = studioClip(theme, { width: W, height: H }, D, seed);
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
    if(window.KF_STUDIO)window.KF_STUDIO(now);
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
    studio.html,
    bodyParts.join("\n"),
    grainClip(D),
    caps,
    `</div>`,
    `<script>`, studio.script, `</script>`,
    `<script>`, script, `</script>`,
    `</body>`, `</html>`,
  ].join("\n");

  const metaJson = JSON.stringify({ compositionId: "vid", width: W, height: H, fps: (dims && dims.fps) || 30, duration: D });
  return { indexHtml, metaJson, resolvedBrand: theme.resolvedBrand };
}

module.exports = { buildComposition, STRINGS };
