// DIGITAL UNIVERSE composer — a native GSAP + canvas "data-cosmos prompt→video" film.
// The pack `digital-universe` (manifest renderer:"digital-universe") routes here from
// attemptLlmComposition, exactly like the flagship / kinetic / product-showcase /
// blueprint / bloom / bauhaus / terminal / paper-tales composers.
//
// Ported from the imported OmniMotion/React template ("Digital Universe"). The React
// runtime is replaced by KEYFRAME's HyperFrames contract, but the identity is re-imagined
// as a DIGITAL/DATA COSMOS — you are INSIDE a computer, not looking at a starry sky:
//   • a PERSISTENT animated DATA-SPACE backdrop — a slow-drifting PARTICLE DEPTH FIELD
//     that flies toward the camera, faint NETWORK connecting-lines strung between the
//     nearest particles, a receding dotted 3D DATA-GRID corridor (floor + ceiling) that
//     converges to a central vanishing point, and two soft accent data-nebula glows —
//     painted on ONE <canvas> as a pure function of the renderer's hf-seek time
//     (deterministic; flows continuously across every cut, so boundaries frame-match).
//   • kinetic GRADIENT type, glowing screenshot DATA-PANEL device-frames (HUD corner
//     brackets + a grid overlay + a scan-line), a forming data-core, converging data
//     streams and a logo-reveal CTA.
//
// EVERYTHING is theme-driven: dataTheme(primary, secondary, tertiary) derives the gradient,
// surface, border, glow, grid and particle colors, so a brand skin recolors the WHOLE film
// (data-space, particles, grid, network lines, panels, chips, CTA) — not just the text.
//
// Engineering contract (identical to the other native composers): one paused GSAP
// timeline on window.__timelines["vid"]; direct-child .clip scenes on unique tracks;
// a boundary opacity:0 hard-kill per scene (the data-space persists behind them); ONE
// seek-safe caption node (#cap-text) driven by a single onUpdate proxy; finite repeats;
// cqw units + container-type:size (portrait-native, 9:16); hidden = opacity:0 only.
// Portrait is detected from dims (W<H); no manifest flag. Deterministic. GSAP only CDN.

const { fontFaceCss, isBundled } = require("../fonts/pack_fonts");
const { isTrustedProminent, isLogo } = require("./asset_priority");
const { logoMark } = require("./logo_render");
const { plateBox } = require("./responsive");
const { charSpans } = require("./text_fx");
const { resolveBrand } = require("./brand_kit");

const GSAP_CDN = "https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js";
// Sora (the template's Google display font) is NOT bundled for the CDN-free render —
// Space Grotesk is the bundled geometric display that carries the same digital-tech
// spirit; JetBrains Mono is the bundled data/mono face; Inter falls to system-ui.
const DISPLAY = "Space Grotesk";
const MONO = "JetBrains Mono";
const BODY = "Inter";

// The template's default accents when no brand is applied (electric blue → data teal →
// violet). Distinct from Kinetic Universe's violet/cyan/magenta so the two read apart.
const DEF_PRIMARY = "#4F7CFF";
const DEF_SECONDARY = "#22E0C8";
const DEF_TERTIARY = "#A66BFF";
const GROUND = "#05070F";
const GROUND_MID = "#0B0E1A";

// ---- helpers -----------------------------------------------------------------
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
const r = (n) => Math.round((Number(n) || 0) * 100) / 100;
const hexToRgb = (h) => { const n = parseInt(String(h).replace("#", ""), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
function seedFrom(str) { let h = 2166136261; const s = String(str || "digital"); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) || 7; }
// finite yoyo repeat count for a segment of `t` seconds at period `c`.
function reps(t, c) { return Math.max(0, Math.floor((Number(t) || 0) / (c || 1)) - 1); }

// ---- theme -------------------------------------------------------------------
// resolveBrand fits the brand accents to the near-black data-ground (isDark:true → lifted
// UP for contrast) and passes pack accents through untouched when no skin — so a null skin
// renders the exact default data-space byte-for-byte, and resolvedBrand is null (honest
// "unbranded" in the Brand panel). Applied → the three accents become the brand's, the
// derived gradient/surface/border/grid/glow follow, and resolvedBrand echoes what was worn.
function dataTheme(brandSkin) {
  const fontFace = (isBundled(DISPLAY) ? fontFaceCss(DISPLAY) : "") + (isBundled(MONO) ? fontFaceCss(MONO) : "");
  let primary = DEF_PRIMARY, secondary = DEF_SECONDARY, tertiary = DEF_TERTIARY, resolvedBrand = null;
  try {
    const brand = resolveBrand(brandSkin, { ground: GROUND, isDark: true, packAccents: [DEF_PRIMARY, DEF_SECONDARY, DEF_TERTIARY] });
    if (brand.applied) {
      primary = brand.accent || primary;
      secondary = brand.accent2 || secondary;
      tertiary = brand.accent3 || tertiary;
      resolvedBrand = {
        ...(brandSkin && typeof brandSkin === "object" ? brandSkin : {}),
        accents: [primary, secondary, tertiary],
        emphasis: brand.emphasis, adjusted: brand.adjusted, dropped: brand.dropped,
        tier: brand.tier, applied: true,
      };
    }
  } catch { primary = DEF_PRIMARY; secondary = DEF_SECONDARY; tertiary = DEF_TERTIARY; resolvedBrand = null; }
  return {
    primary, secondary, tertiary, ground: GROUND, groundMid: GROUND_MID,
    gradient: `linear-gradient(120deg, ${primary}, ${secondary})`,
    gradient2: `linear-gradient(300deg, ${secondary}, ${primary})`,
    surface: `color-mix(in oklab, ${primary} 12%, ${GROUND_MID})`,
    surfaceTop: `color-mix(in oklab, ${primary} 22%, #10131d)`,
    border: `color-mix(in oklab, ${primary} 46%, transparent)`,
    line: `color-mix(in oklab, ${secondary} 24%, transparent)`,
    glow: primary, glow2: secondary,
    text: "#EEF1FF", dim: "rgba(238,241,255,0.66)", faint: "rgba(238,241,255,0.36)",
    displayStack: `'${DISPLAY}', 'Inter', system-ui, sans-serif`,
    monoStack: `'${MONO}', ui-monospace, monospace`,
    bodyStack: `'${BODY}', system-ui, sans-serif`,
    fontFace, resolvedBrand,
  };
}

// ---- fixed copy (localizable) ------------------------------------------------
const STRINGS = {
  openKicker: "KeyFrame · A universe of video",
  bootLabel: "Initializing",
  revealKicker: "Prompt to video",
  showcaseKicker: "Inside the system",
  scatterKicker: "Every prompt, a world",
  orbitKicker: "Direct every detail",
  statementKicker: "The idea",
  ctaKicker: "Ready when you are",
  ctaButton: "Explore the universe",
  ctaTagline: "Prompt to video. In seconds.",
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
// Split a headline into gradient word spans for the kinetic reveal.
function gradWords(id, text) {
  return wordsOf(text).slice(0, 8).map((w) =>
    `<span class="du-gword ${id}-gw" style="display:inline-block;opacity:0;margin:0 0.18em 0.1em 0;">${esc(w)}</span>`
  ).join("");
}

// ---- asset gate + DATA-PANEL device-frame ------------------------------------
function screenOk(a) {
  if (!a || !a.path) return false;
  if (isLogo(a)) return false; // the logo is CTA / key-moment material, not a data panel
  if (a.type === "video" || /\.(mp4|webm|mov)($|\?)/i.test(a.path)) return false;
  if (/\.svg($|\?)/i.test(a.path)) return false;
  return isTrustedProminent(a) || a.cdProminence === "hero" || a.cdProminence === "support";
}
function logoAssetOf(assets) {
  return (Array.isArray(assets) ? assets : []).find((a) => a && a.path && isLogo(a) && !/\.(mp4|webm|mov)($|\?)/i.test(a.path)) || null;
}

// A framed "data panel" holding a real screenshot — HUD corner brackets, a top sheen and a
// scan-line so it reads as a live monitor inside the machine. With no asset it shows an
// intentional branded placeholder (gradient wash + holographic grid + a glowing node) so an
// empty slot still reads as designed, never blank.
function dataPanel(id, theme, { w, h, tint, radius, asset }) {
  const c = tint || theme.primary;
  const inner = asset && asset.path
    ? `<img src="${esc(asset.path)}" alt="${esc(asset.alt || "")}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;">`
    : `<div style="position:absolute;inset:0;background:${theme.gradient2};opacity:0.4;"></div>` +
      `<div style="position:absolute;inset:0;background-image:linear-gradient(${theme.line} 1px,transparent 1px),linear-gradient(90deg,${theme.line} 1px,transparent 1px);background-size:12% 9%;opacity:0.6;"></div>` +
      `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;"><div style="width:16%;height:16%;border-radius:22%;background:${theme.gradient};box-shadow:0 0 4cqw ${c};opacity:0.9;"></div></div>`;
  const brackets = ["top:0.8cqw;left:0.8cqw;border-top:0.3cqw solid;border-left:0.3cqw solid",
    "top:0.8cqw;right:0.8cqw;border-top:0.3cqw solid;border-right:0.3cqw solid",
    "bottom:0.8cqw;left:0.8cqw;border-bottom:0.3cqw solid;border-left:0.3cqw solid",
    "bottom:0.8cqw;right:0.8cqw;border-bottom:0.3cqw solid;border-right:0.3cqw solid"]
    .map((s) => `<div style="position:absolute;width:3cqw;height:3cqw;${s} ${c};pointer-events:none;"></div>`).join("");
  return `<div id="${id}" class="du-panel" style="width:${w};height:${h};border-radius:${radius || "2cqw"};position:relative;overflow:hidden;background:${theme.surface};border:0.16cqw solid ${theme.border};box-shadow:0 3cqw 8cqw -3cqw ${c}, 0 0 0 1px rgba(255,255,255,0.05) inset;">
    ${inner}
    <div style="position:absolute;left:0;right:0;top:0;height:34%;background:linear-gradient(rgba(255,255,255,0.1),transparent);pointer-events:none;"></div>
    <div style="position:absolute;left:0;right:0;top:0;height:0.3cqw;background:${c};opacity:0.5;pointer-events:none;"></div>
    ${brackets}
  </div>`;
}
// Portrait screenshots (ratio<0.9) get a tall phone-ish frame; else a wide landscape card.
// PORTRAIT PLATE SIZING. The panel widths below are literals and the height is a
// `calc(width * hMul)` — width units on both axes, with nothing checking the result
// against how tall the frame is. In a 9:16 column (177.8cqw) a 54cqw panel holding a
// wide capture came out ~31cqw high, under a fifth of the frame, and the rest rendered
// as empty background. This returns the pack's own proportions scaled to fit the real
// canvas; it is a no-op in landscape. See services/responsive.js.
function duPlate(ctx, wPortrait, wLandscape, asset) {
  const portrait = ctx && ctx.portrait;
  const w0 = portrait ? wPortrait : wLandscape;
  const box = plateBox(ctx && ctx.W, ctx && ctx.H, w0, w0 * shotDims(asset, "58%", "80%").hMul);
  return { w: `${box.w}cqw`, h: `${box.h}cqw` };
}

function shotDims(asset, portraitW, wideW) {
  const ratio = Number(asset && asset.ratio) || (asset && asset.width && asset.height ? asset.width / asset.height : 0);
  if (ratio && ratio < 0.9) return { w: portraitW, hMul: 1.55 };
  return { w: wideW, hMul: 0.62 };
}

// PORTRAIT PLATE SIZING for the `--w` custom property this pack sizes plates through:
// the wrapper takes a PERCENTAGE of it and the height is `calc(var(--w) * hMul)`, so
// `--w` is the one scalar the whole plate derives from. Nothing was checking the result
// against a 177.8cqw-tall portrait column, leaving a lone screenshot at roughly a fifth
// of the frame. Scaling `--w` moves the plate as a unit and leaves every percentage and
// calc() downstream correct. No-op in landscape. See services/responsive.js.
function fitWVar(ctx, wCqw, widthPct, hMul) {
  const effW = wCqw * (parseFloat(widthPct) / 100);
  const box = plateBox(ctx && ctx.W, ctx && ctx.H, effW, wCqw * hMul);
  return `${Math.round(wCqw * (box.scaled || 1) * 100) / 100}cqw`;
}


// A forming "data-core" glyph — concentric rings + a gradient node with a grid face. The
// digital-cosmos answer to the template's forming planet. GSAP scales the OUTER wrapper.
function dataCore(theme, size) {
  return `<div style="position:relative;width:${size};height:${size};">
    <div style="position:absolute;inset:0;border-radius:26%;border:0.4cqw solid ${theme.border};box-shadow:0 0 4cqw ${theme.glow};"></div>
    <div style="position:absolute;inset:12%;border-radius:22%;border:0.3cqw solid ${theme.line};"></div>
    <div style="position:absolute;inset:24%;border-radius:20%;background:${theme.gradient};box-shadow:0 0 6cqw ${theme.glow};overflow:hidden;">
      <div style="position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,0.25) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.25) 1px,transparent 1px);background-size:22% 22%;opacity:0.5;"></div>
    </div>
  </div>`;
}

// ---- scene clip open ---------------------------------------------------------
function open(id, ctx) { return `<div class="clip du-scene" id="${id}" data-start="${ctx.T}" data-duration="${r(ctx.L)}" data-track-index="${ctx.track}" style="opacity:0;">`; }

// ---- archetype selection -----------------------------------------------------
function archetypeFor(scene, i, total) {
  const k = String(scene.kind || "").toLowerCase();
  const p = String(scene.purpose || "").toLowerCase();
  if (i === 0 || k === "hook" || k === "title" || /hook|intro|open/.test(p)) return "open";
  if (i === total - 1 || k === "cta" || /cta|close|sign\s*up|subscribe|download|get\s*started/.test(p)) return "cta";
  if (k === "quote" || /quote|testimonial|manifesto/.test(p)) return "statement";
  if (k === "stat" || k === "chart" || k === "countdown" || (pickNumber(scene) && /proof|result|metric|stat|number/.test(p + k))) return "reveal";
  if (/feature|how|process|step|showcase|product|proof|demo/.test(p + k)) return "showcase";
  return "orbit";
}

// ---- scene builders ((scene, ctx, assets) -> {html, s}) ----------------------

// SCENE — OPEN: the data-space boots — a data-core forms with a flash, then a kicker, a big
// display title and a subtitle rise. Opener energy.
function bOpen(scene, ctx, sceneAssets) {
  const { id, T, L, theme, S, portrait } = ctx;
  const kick = esc(scene.kicker || S.openKicker);
  const title = scene.headline || scene.title || "";
  // A hook may host a hero screenshot: a single assigned shot rides in a data-panel below
  // the title (the outer .${id}-fr wrapper is what GSAP transforms; the <img> lives in the
  // inner dataPanel GSAP never touches). No asset → the original opener is byte-identical.
  const one = (sceneAssets || [])[0] || null;
  const shotHtml = one
    ? `<div class="${id}-fr" style="opacity:0;width:${duPlate(ctx, 54, 40, one).w};margin:4cqw auto 0;">${dataPanel(`${id}-hp`, theme, { w: "100%", h: duPlate(ctx, 54, 40, one).h, tint: theme.primary, asset: one, radius: "3cqw" })}</div>`
    : "";
  const html = `${open(id, ctx)}<div class="du-safe">
    <div class="${id}-core" style="opacity:0;">${dataCore(theme, "30cqw")}</div>
    <div class="du-kicker ${id}-kick" style="opacity:0;margin-top:5cqw;">${kick}</div>
    <div class="du-display ${id}-title" style="opacity:0;text-align:center;margin-top:3cqw;font-size:${r(headlineSize(title, 12))}cqw;">${esc(title)}</div>${shotHtml}
    ${scene.subtext ? `<div class="du-body ${id}-sub" style="opacity:0;margin-top:3cqw;max-width:82%;text-align:center;">${esc(scene.subtext)}</div>` : ""}
    <div class="du-flash ${id}-flash" style="opacity:0;"></div>
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.4},${T});`,
    `tl.fromTo(".${id}-core",{opacity:0,scale:0.2,filter:"blur(10px)"},{opacity:1,scale:1,filter:"blur(0px)",duration:0.7,ease:"back.out(1.5)"},${r(T + 0.25)});`,
    `tl.fromTo(".${id}-flash",{opacity:0},{opacity:0.8,duration:0.12,yoyo:true,repeat:1,ease:"power2.out"},${r(T + 0.5)});`,
    `tl.fromTo(".${id}-kick",{opacity:0,y:-16},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 0.7)});`,
    `tl.fromTo(".${id}-title",{opacity:0,y:34,scale:0.94},{opacity:1,y:0,scale:1,duration:0.7,ease:"power3.out"},${r(T + 0.9)});`,
    one ? `tl.fromTo(".${id}-fr",{opacity:0,y:60,scale:0.9},{opacity:1,y:0,scale:1,duration:0.8,ease:"power3.out"},${r(T + 1.2)});` : "",
    one ? `tl.to(".${id}-fr",{y:"-=1.4cqw",duration:2.2,ease:"sine.inOut",yoyo:true,repeat:${reps(L - 2, 2.2)},overwrite:"auto"},${r(T + 2)});` : "",
    scene.subtext ? `tl.fromTo(".${id}-sub",{opacity:0,y:18},{opacity:1,y:0,duration:0.55,ease:"power2.out"},${r(T + 1.4)});` : "",
    `tl.to(".${id}-core",{rotation:6,duration:${r(Math.max(1.6, L - 1.4))},ease:"sine.inOut",yoyo:true,repeat:1,transformOrigin:"center center"},${r(T + 1.4)});`,
  ].filter(Boolean);
  return { html, s };
}

// SCENE — REVEAL: converging DATA STREAMS collapse to a shockwave, then a kinetic gradient
// headline pops in word-by-word. The signature "prompt → video" impact.
function bReveal(scene, ctx, sceneAssets) {
  const { id, T, L, theme, S, portrait } = ctx;
  const kick = esc(scene.kicker || S.revealKicker);
  // A stat/proof scene assigned a screenshot shows it in a data-panel BEHIND/above the
  // gradient number, preserving the reveal identity (number + dashboard together). No
  // asset → the original converging-streams reveal is byte-identical.
  const one = (sceneAssets || [])[0] || null;
  const panelHtml = one
    ? `<div class="${id}-panel" style="opacity:0;width:${duPlate(ctx, 52, 40, one).w};margin:0 auto 4cqw;">${dataPanel(`${id}-p`, theme, { w: "100%", h: duPlate(ctx, 52, 40, one).h, tint: theme.secondary, asset: one, radius: "3cqw" })}</div>`
    : "";
  // Each stream's radial ANGLE lives on a static wrapper (CSS rotate); GSAP only ever
  // touches the inner line's scaleX/opacity, so it can never overwrite the rotation.
  const streams = Array.from({ length: 16 }).map((_, i) => {
    const ang = (i / 16) * 360;
    const col = i % 2 ? theme.secondary : theme.primary;
    return `<div style="position:absolute;left:50%;top:50%;transform:rotate(${ang}deg);transform-origin:0 0;">` +
      `<div class="${id}-stream" style="position:absolute;left:12cqw;top:-0.2cqw;width:34cqw;height:0.4cqw;transform-origin:0 50%;opacity:0;background:linear-gradient(90deg,transparent,${col});"></div></div>`;
  }).join("");
  const html = `${open(id, ctx)}<div class="du-safe">
    ${streams}
    <div class="${id}-shock" style="position:absolute;left:50%;top:50%;width:20cqw;height:20cqw;margin-left:-10cqw;margin-top:-10cqw;border-radius:50%;border:0.4cqw solid ${theme.secondary};opacity:0;box-shadow:0 0 8cqw ${theme.secondary};"></div>
    <div class="du-kicker ${id}-kick" style="opacity:0;margin-bottom:3cqw;">${kick}</div>${panelHtml}
    <div class="du-display du-grad" id="${id}-head" style="text-align:center;font-size:${r(headlineSize(scene.headline, 14))}cqw;">${gradWords(id, scene.headline || scene.title || "INFINITE FRAMES")}</div>
    ${scene.subtext ? `<div class="du-body ${id}-sub" style="opacity:0;margin-top:3cqw;max-width:80%;text-align:center;">${esc(scene.subtext)}</div>` : ""}
    <div class="du-flash ${id}-flash" style="opacity:0;"></div>
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.35},${T});`,
    `tl.fromTo(".${id}-stream",{opacity:0,scaleX:0.15},{opacity:0.9,scaleX:1,duration:0.5,ease:"power2.in",stagger:0.01},${r(T + 0.15)});`,
    `tl.to(".${id}-stream",{opacity:0,duration:0.4,ease:"power2.in",overwrite:"auto"},${r(T + 0.65)});`,
    `tl.fromTo(".${id}-shock",{scale:0.1,opacity:0.9},{scale:5,opacity:0,duration:0.8,ease:"power2.out"},${r(T + 0.55)});`,
    `tl.fromTo(".${id}-flash",{opacity:0},{opacity:0.8,duration:0.1,yoyo:true,repeat:1},${r(T + 0.6)});`,
    `tl.fromTo(".${id}-kick",{opacity:0,y:-16},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 0.7)});`,
    one ? `tl.fromTo(".${id}-panel",{opacity:0,scale:0.85,y:30},{opacity:1,scale:1,y:0,duration:0.7,ease:"back.out(1.5)"},${r(T + 0.75)});` : "",
    `tl.fromTo(".${id}-gw",{opacity:0,yPercent:90,scale:0.7},{opacity:1,yPercent:0,scale:1,duration:0.55,ease:"back.out(1.7)",stagger:0.09},${r(T + 0.85)});`,
    scene.subtext ? `tl.fromTo(".${id}-sub",{opacity:0,y:18},{opacity:1,y:0,duration:0.55,ease:"power2.out"},${r(T + 1.4)});` : "",
    `tl.to("#${id}-head",{scale:1.015,duration:${r(Math.max(1.5, L - 2))},ease:"sine.inOut",yoyo:true,repeat:1,transformOrigin:"center center"},${r(T + 1.5)});`,
  ].filter(Boolean);
  return { html, s };
}

// SCENE — SHOWCASE: 1–3 DATA-PANEL device-frames (real screenshots when present) on a
// subtle perspective wall, with a headline and feature labels. The product moment.
function bShowcase(scene, ctx, sceneAssets) {
  const { id, T, L, theme, S } = ctx;
  const kick = esc(scene.kicker || S.showcaseKicker);
  const shots = (sceneAssets || []).slice(0, 3);
  const feats = bullets(scene, 3);
  const single = shots.length <= 1;
  const one = shots[0] || null;
  // Hoisted so the stage's `--w` below fits against the SAME dims the plate uses —
  // that property is what both the width percentage and the height calc() resolve against.
  const singleD = single ? shotDims(one, "58%", "80%") : null;
  const wall = single
    ? (() => {
        const d = singleD;
        return `<div class="${id}-hero" style="opacity:0;width:${d.w};margin:0 auto;">${dataPanel(`${id}-s0`, theme, { w: "100%", h: `calc(var(--w) * ${d.hMul})`, tint: theme.primary, asset: one, radius: "3cqw" })}</div>`;
      })()
    : `<div style="display:flex;gap:3cqw;justify-content:center;align-items:center;perspective:1400px;">${shots.map((a, i) => {
        const d = shotDims(a, "26%", "30%");
        const tilt = (i - (shots.length - 1) / 2) * -16;
        // GSAP animates the OUTER .hero (opacity/y/scale/float); the perspective tilt is
        // static CSS on an inner wrapper GSAP never touches.
        return `<div class="${id}-hero" style="opacity:0;width:${d.w};"><div style="transform:rotateY(${tilt}deg);transform-style:preserve-3d;">${dataPanel(`${id}-s${i}`, theme, { w: "100%", h: `calc(var(--w) * ${d.hMul})`, tint: i % 2 ? theme.secondary : theme.primary, asset: a, radius: "2cqw" })}</div></div>`;
      }).join("")}</div>`;
  const featHtml = feats.length
    ? `<div class="${id}-feats" style="display:flex;flex-direction:column;gap:1.4cqw;align-items:center;margin-top:4cqw;">${feats.map((f) => `<div class="du-chip ${id}-fi" style="opacity:0;"><span class="du-dot" style="background:${theme.primary};box-shadow:0 0 1.2cqw ${theme.primary};"></span>${esc(f)}</div>`).join("")}</div>`
    : "";
  const html = `${open(id, ctx)}<div class="du-safe">
    <div class="du-kicker ${id}-kick" style="opacity:0;margin-bottom:2.4cqw;">${kick}</div>
    <div class="du-h1 ${id}-head" style="opacity:0;text-align:center;font-size:${r(headlineSize(scene.headline, 7.5))}cqw;margin-bottom:4cqw;">${esc(scene.headline || scene.title || "")}</div>
    <div class="${id}-stage" style="--w:${single ? fitWVar(ctx, 58, singleD.w, singleD.hMul) : "26cqw"};width:100%;">${wall}</div>
    ${featHtml}
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.35},${T});`,
    `tl.fromTo(".${id}-kick",{opacity:0,y:-16},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 0.2)});`,
    `tl.fromTo(".${id}-head",{opacity:0,y:22},{opacity:1,y:0,duration:0.55,ease:"power2.out"},${r(T + 0.35)});`,
    `tl.fromTo(".${id}-hero",{opacity:0,y:70,scale:0.86,rotationX:8},{opacity:1,y:0,scale:1,rotationX:0,duration:0.7,ease:"power3.out",stagger:0.14},${r(T + 0.55)});`,
    `tl.to(".${id}-hero",{y:"-=1.6cqw",duration:1.8,ease:"sine.inOut",yoyo:true,repeat:${reps(L - 1.5, 1.8)},stagger:0.1,overwrite:"auto"},${r(T + 1.4)});`,
    feats.length ? `tl.fromTo(".${id}-fi",{opacity:0,x:-20},{opacity:1,x:0,duration:0.45,ease:"back.out(1.6)",stagger:0.14},${r(T + 1.2)});` : "",
  ].filter(Boolean);
  return { html, s };
}

// SCENE — SCATTER: scattered floating DATA-PANEL frames (real screenshots when present)
// with a centered caption. "Every prompt, a world." Uses several pooled assets.
function bScatter(scene, ctx, sceneAssets) {
  const { id, T, L, theme, S } = ctx;
  const kick = esc(scene.kicker || S.scatterKicker);
  const POS = [
    { x: 28, y: 40, w: 30, r: -8 }, { x: 72, y: 36, w: 26, r: 8 },
    { x: 26, y: 70, w: 27, r: 7 }, { x: 74, y: 72, w: 29, r: -8 }, { x: 50, y: 55, w: 34, r: -2 },
  ];
  const shots = (sceneAssets || []);
  // GSAP animates the OUTER .fr (opacity/scale/float via y); the centering + rotation is
  // static CSS on an inner wrapper GSAP never touches (so the float can't discard it).
  const frames = POS.map((f, i) => {
    const asset = shots[i] || null;
    return `<div class="${id}-fr" style="position:absolute;left:${f.x}%;top:${f.y}%;width:${f.w}cqw;opacity:0;"><div style="transform:translate(-50%,-50%) rotate(${f.r}deg);">${dataPanel(`${id}-d${i}`, theme, { w: "100%", h: `${r(f.w * 1.5)}cqw`, tint: i % 2 ? theme.secondary : theme.primary, asset, radius: "1.6cqw" })}</div></div>`;
  }).join("");
  const html = `${open(id, ctx)}<div class="clip" style="position:absolute;inset:0;">
    ${frames}
    <div class="${id}-cap" style="position:absolute;left:0;right:0;top:12%;text-align:center;padding:0 8%;opacity:0;">
      <div class="du-kicker" style="justify-content:center;margin-bottom:2cqw;">${kick}</div>
      <div class="du-h1 du-grad" style="text-align:center;font-size:${r(headlineSize(scene.headline, 8))}cqw;">${esc(scene.headline || scene.title || "")}</div>
    </div>
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.35},${T});`,
    `tl.fromTo(".${id}-fr",{opacity:0,y:40,scale:0.2},{opacity:1,y:0,scale:1,duration:0.6,ease:"power3.out",stagger:0.12},${r(T + 0.25)});`,
    `tl.to(".${id}-fr",{y:"+=1.4cqw",duration:2,ease:"sine.inOut",yoyo:true,repeat:${reps(L - 1.4, 2)},stagger:0.15,overwrite:"auto"},${r(T + 1.3)});`,
    `tl.fromTo(".${id}-cap",{opacity:0,y:-16},{opacity:1,y:0,duration:0.55,ease:"power2.out"},${r(T + 0.7)});`,
  ];
  return { html, s };
}

// SCENE — ORBIT: a headline plus a rising stack of control/feature chips. "Direct every
// detail." The dynamic default for bullet scenes.
function bOrbit(scene, ctx) {
  const { id, T, L, theme, S } = ctx;
  const kick = esc(scene.kicker || S.orbitKicker);
  let chips = bullets(scene, 5);
  if (!chips.length) chips = wordsOf(scene.voiceover).slice(0, 3).length ? [String(scene.voiceover).slice(0, 40)] : [esc(scene.title || "")];
  const chipHtml = chips.map((c, i) =>
    `<div class="du-chip ${id}-chip" style="opacity:0;" data-i="${i}"><span class="du-dot" style="background:${i % 2 ? theme.secondary : theme.primary};box-shadow:0 0 1.2cqw ${i % 2 ? theme.secondary : theme.primary};"></span>${esc(c)}</div>`
  ).join("");
  const html = `${open(id, ctx)}<div class="du-safe">
    <div class="du-kicker ${id}-kick" style="opacity:0;margin-bottom:2.4cqw;">${kick}</div>
    <div class="du-h1 ${id}-head" style="opacity:0;text-align:center;font-size:${r(headlineSize(scene.headline, 8.5))}cqw;margin-bottom:4.5cqw;">${esc(scene.headline || scene.title || "")}</div>
    <div style="display:flex;flex-direction:column;gap:2cqw;align-items:center;">${chipHtml}</div>
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.35},${T});`,
    `tl.fromTo(".${id}-kick",{opacity:0,y:-16},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 0.2)});`,
    `tl.fromTo(".${id}-head",{opacity:0,y:24,scale:0.94},{opacity:1,y:0,scale:1,duration:0.6,ease:"power3.out"},${r(T + 0.35)});`,
    `tl.fromTo(".${id}-chip",{opacity:0,y:26,scale:0.9},{opacity:1,y:0,scale:1,duration:0.5,ease:"back.out(1.6)",stagger:0.14},${r(T + 0.7)});`,
    `tl.to(".${id}-chip",{y:"-=0.9cqw",duration:2.2,ease:"sine.inOut",yoyo:true,repeat:${reps(L - 1.4, 2.2)},stagger:0.12,overwrite:"auto"},${r(T + 1.5)});`,
  ];
  return { html, s };
}

// SCENE — STATEMENT: a single centered gradient statement that breathes. For quotes.
function bStatement(scene, ctx, sceneAssets) {
  const { id, T, L, theme, portrait } = ctx;
  // A quote/testimonial scene assigned a supporting image shows it in a data-panel ABOVE
  // the quotation (image + words together). No asset → the original quote is byte-identical.
  const one = (sceneAssets || [])[0] || null;
  const panelHtml = one
    ? `<div class="${id}-panel" style="opacity:0;width:${duPlate(ctx, 48, 36, one).w};margin:0 auto 5cqw;">${dataPanel(`${id}-p`, theme, { w: "100%", h: duPlate(ctx, 48, 36, one).h, tint: theme.primary, asset: one, radius: "3cqw" })}</div>`
    : "";
  const html = `${open(id, ctx)}<div class="du-safe">${panelHtml}
    <div class="du-display du-grad ${id}-st" style="text-align:center;font-size:${r(headlineSize(scene.headline, 12))}cqw;opacity:0;">${esc(scene.headline || scene.title || "")}</div>
    ${scene.subtext ? `<div class="du-body ${id}-sub" style="opacity:0;margin-top:3cqw;max-width:78%;text-align:center;">${esc(scene.subtext)}</div>` : ""}
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.4},${T});`,
    one ? `tl.fromTo(".${id}-panel",{opacity:0,scale:0.85,y:30},{opacity:1,scale:1,y:0,duration:0.7,ease:"back.out(1.5)"},${r(T + 0.25)});` : "",
    `tl.fromTo(".${id}-st",{opacity:0,scale:0.8,filter:"blur(10px)"},{opacity:1,scale:1,filter:"blur(0px)",duration:0.8,ease:"power3.out"},${r(T + 0.3)});`,
    scene.subtext ? `tl.fromTo(".${id}-sub",{opacity:0,y:18},{opacity:1,y:0,duration:0.55,ease:"power2.out"},${r(T + 1.0)});` : "",
    `tl.to(".${id}-st",{scale:1.02,duration:${r(Math.max(1.6, L - 1.6))},ease:"sine.inOut",yoyo:true,repeat:1,transformOrigin:"center center"},${r(T + 1.1)});`,
  ].filter(Boolean);
  return { html, s };
}

// SCENE — CTA: the logo mark assembles (the user's logo when uploaded, else a built
// data-core glyph), the wordmark types in char-by-char, a gradient button pulses.
function bCta(scene, ctx, logo) {
  const { id, T, L, theme, S } = ctx;
  const word = String(scene.headline || scene.title || "KEYFRAME").slice(0, 20);
  const btn = esc(String(scene.emphasis || S.ctaButton).slice(0, 24));
  const tagline = esc(String(scene.subtext || S.ctaTagline).slice(0, 60));
  const url = esc(String(S.ctaUrl).toUpperCase());
  const mark = logo && logo.path
    ? logoMark(logo, { sizeCqw: 22, ground: theme.ground, glow: theme.primary, escape: esc })
    : `<div style="width:20cqw;height:20cqw;">${dataCore(theme, "20cqw")}</div>`;
  const chars = charSpans(word, `${id}-ch`);
  const html = `${open(id, ctx)}<div class="du-safe">
    <div class="du-kicker ${id}-kick" style="opacity:0;margin-bottom:2cqw;">${esc(scene.kicker || S.ctaKicker)}</div>
    <div class="${id}-mark" style="opacity:0;transform:scale(0.6);">${mark}</div>
    <div class="du-wordmark" style="margin-top:3cqw;">${chars}</div>
    <div class="du-body ${id}-tag" style="opacity:0;margin-top:1.6cqw;">${tagline}</div>
    <div class="du-btn du-btn-lg ${id}-btn" style="opacity:0;margin-top:3.4cqw;">${btn} →</div>
    <div class="${id}-url" style="opacity:0;font-family:${theme.monoStack};letter-spacing:0.24em;font-size:2.4cqw;color:${theme.faint};margin-top:2cqw;">${url}</div>
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

const BUILDERS = { open: bOpen, reveal: bReveal, showcase: bShowcase, scatter: bScatter, orbit: bOrbit, statement: bStatement, cta: bCta };

// ---- persistent DATA-SPACE canvas (hf-seek) ----------------------------------
// One canvas painted purely from the renderer's hf-seek time: a particle depth field
// flying toward the camera, network connecting-lines between the nearest particles, a
// receding dotted 3D data-grid corridor (floor + ceiling) and two soft accent nebula
// glows. Colored ONLY with theme.primary/secondary, so a brand skin recolors the whole
// backdrop. The GSAP timeline's onUpdate also drives it so it animates in live preview.
function dataspaceClip(theme, dims, D, seed) {
  const W = dims.width, H = dims.height;
  const [pr, pg, pb] = hexToRgb(theme.primary);
  const [sr, sg, sb] = hexToRgb(theme.secondary);
  const [gr, gg, gb] = hexToRgb(theme.ground);
  const html = `<div id="du-space-clip" class="clip" data-start="0" data-duration="${D}" data-track-index="0" data-layout-allow-occlusion style="background:${theme.ground};">
    <canvas id="du-space" width="${W}" height="${H}" style="position:absolute;inset:0;width:100%;height:100%;"></canvas>
  </div>`;
  const script = `(function(){
  var cv=document.getElementById("du-space");if(!cv||!cv.getContext)return;var cx=cv.getContext("2d");if(!cx)return;
  var W=${W},H=${H},CXp=W*0.5,CYp=H*0.5;
  function P(a){return "rgba(${pr},${pg},${pb},"+a+")";}
  function S(a){return "rgba(${sr},${sg},${sb},"+a+")";}
  var GD="rgba(${gr},${gg},${gb},";
  var sd=${seed >>> 0};function rnd(){sd=(sd*1664525+1013904223)>>>0;return sd/4294967296;}
  // particle depth field — each particle is a data-point in a 3D volume flying toward us.
  var N=Math.round(80*(W*H)/(1080*1920)),PT=[];
  for(var i=0;i<N;i++){PT.push({bx:(rnd()*2-1),by:(rnd()*2-1),z0:rnd(),warm:rnd()<0.5,ph:rnd()*6.28});}
  function nebula(fx,cxp,cyp,drift,size,op){var x=cxp*W+Math.sin(drift)*W*0.10,y=cyp*H+Math.cos(drift*0.8)*H*0.05;var g=cx.createRadialGradient(x,y,0,x,y,size);g.addColorStop(0,fx(op));g.addColorStop(0.62,fx(0));cx.fillStyle=g;cx.fillRect(0,0,W,H);}
  function draw(t){
    cx.clearRect(0,0,W,H);
    // deep data-ground + two drifting accent nebula clouds
    cx.fillStyle="rgb(${gr},${gg},${gb})";cx.fillRect(0,0,W,H);
    nebula(P,0.30,0.34,t*0.16,W*0.9,0.20);
    nebula(S,0.72,0.68,t*-0.13,W*0.8,0.16);
    // receding dotted 3D data-grid corridor (floor + ceiling) converging to center
    var ROWS=13,scr=(t*0.35)%1;
    for(var ri=0;ri<ROWS;ri++){
      var f=Math.pow((ri+scr)/ROWS,2.2);
      var yF=CYp+f*(H*0.5),yC=CYp-f*(H*0.5);
      var spread=W*0.5*(0.14+f*0.96),op=0.30*(1-f);
      if(op<=0.01)continue;
      cx.fillStyle=S(op);
      for(var cj=-6;cj<=6;cj++){var x=CXp+cj*spread/6;var ds=1+f*2.4;
        cx.beginPath();cx.arc(x,yF,ds,0,6.283);cx.fill();
        cx.beginPath();cx.arc(x,yC,ds,0,6.283);cx.fill();}
    }
    // project particles (perspective tunnel)
    var A=[],TH=W*0.15;
    for(var i2=0;i2<PT.length;i2++){var s=PT[i2];
      var z=s.z0-t*0.05;z=z-Math.floor(z);var zz=0.06+z*0.94;var k=0.62/zz;
      var x=CXp+s.bx*W*0.5*k,y=CYp+s.by*H*0.5*k,close=1-zz;
      if(x<-40||x>W+40||y<-40||y>H+40)continue;
      A.push({x:x,y:y,close:close,warm:s.warm,ph:s.ph});
    }
    // network connecting-lines between the nearest bright particles
    cx.lineWidth=1.1;
    for(var a1=0;a1<A.length;a1++){var p1=A[a1];if(p1.close<0.28)continue;
      for(var a2=a1+1;a2<A.length;a2++){var p2=A[a2];if(p2.close<0.28)continue;
        var dx=p1.x-p2.x,dy=p1.y-p2.y,dd=Math.sqrt(dx*dx+dy*dy);
        if(dd<TH){var lo=0.22*(1-dd/TH)*Math.min(p1.close,p2.close);
          cx.strokeStyle=P(lo);cx.beginPath();cx.moveTo(p1.x,p1.y);cx.lineTo(p2.x,p2.y);cx.stroke();}
      }
    }
    // particles — small glowing data squares
    for(var a3=0;a3<A.length;a3++){var p=A[a3];var sz=1.2+p.close*3.4;
      var op2=0.2+0.6*p.close+0.15*Math.sin(t*2+p.ph);
      cx.globalAlpha=Math.max(0,Math.min(1,op2));
      cx.fillStyle=p.warm?P(1):S(1);cx.shadowColor=p.warm?P(1):S(1);cx.shadowBlur=sz*3;
      cx.fillRect(p.x-sz,p.y-sz,sz*2,sz*2);
    }
    cx.shadowBlur=0;cx.globalAlpha=1;
    // vignette back into the ground
    var vg=cx.createRadialGradient(W*0.5,H*0.44,Math.min(W,H)*0.16,W*0.5,H*0.44,Math.max(W,H)*0.78);
    vg.addColorStop(0,GD+"0)");vg.addColorStop(1,GD+"0.94)");cx.fillStyle=vg;cx.fillRect(0,0,W,H);
  }
  // Painted ONLY from the renderer's hf-seek time — deterministic, seek-exact, and
  // frame-capture-safe (no wall clock / rAF). The GSAP timeline's onUpdate also drives it
  // so the data-space animates in live preview too, staying in lockstep with the scenes.
  window.KF_DIGIVERSE=draw;window.addEventListener("hf-seek",function(e){draw((e.detail&&e.detail.time)||0);});draw(0);
})();`;
  return { html, script };
}

// ---- grain overlay (top layer) -----------------------------------------------
const GRAIN_SVG = "<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/></filter><rect width='100%' height='100%' filter='url(#n)' opacity='0.5'/></svg>";
const GRAIN_URI = "data:image/svg+xml;base64," + Buffer.from(GRAIN_SVG).toString("base64");
function grainClip(D) {
  return `<div id="du-grain" class="clip" data-start="0" data-duration="${D}" data-track-index="40" data-layout-allow-occlusion style="pointer-events:none;background-image:url('${GRAIN_URI}');background-size:260px 260px;opacity:0.05;mix-blend-mode:overlay;"></div>`;
}

// ---- style -------------------------------------------------------------------
function styleBlock(theme, portrait) {
  const safePad = portrait ? "12% 6% 14%" : "8% 8% 10%";
  return `${theme.fontFace}
  * { box-sizing:border-box; margin:0; padding:0; }
  html, body { width:100%; height:100%; overflow:hidden; background:#000; }
  #root { position:relative; overflow:hidden; isolation:isolate; background:${theme.ground}; container-type:size; color:${theme.text}; font-family:${theme.bodyStack}; }
  .clip { position:absolute; top:0; left:0; width:100%; height:100%; overflow:hidden; }
  .du-safe { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:${safePad}; text-align:center; }
  .du-display { font-family:${theme.displayStack}; font-weight:800; line-height:0.94; letter-spacing:-0.03em; color:${theme.text}; }
  .du-h1 { font-family:${theme.displayStack}; font-weight:700; line-height:1.02; letter-spacing:-0.02em; color:${theme.text}; }
  .du-grad { background:${theme.gradient}; -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; color:transparent; }
  .du-kicker { display:inline-flex; align-items:center; gap:0.9cqw; font-family:${theme.monoStack}; font-weight:600; font-size:2cqw; letter-spacing:0.4em; text-transform:uppercase; color:${theme.dim}; }
  .du-body { font-family:${theme.bodyStack}; font-weight:500; font-size:2.6cqw; line-height:1.42; color:${theme.dim}; }
  .du-wordmark { display:flex; font-family:${theme.displayStack}; font-weight:800; font-size:11cqw; letter-spacing:-0.02em; color:${theme.text}; }
  .du-gword { will-change:transform,opacity; }
  .du-chip { display:inline-flex; align-items:center; gap:1.4cqw; padding:1.6cqw 3cqw; border-radius:999px; background:rgba(255,255,255,0.04); border:1px solid ${theme.border}; backdrop-filter:blur(6px); font-family:${theme.monoStack}; font-weight:600; font-size:2.6cqw; letter-spacing:0.06em; color:${theme.text}; white-space:nowrap; box-shadow:0 1.4cqw 5cqw -2cqw ${theme.primary}; will-change:transform,opacity; }
  .du-dot { width:1.4cqw; height:1.4cqw; border-radius:3px; flex:0 0 auto; }
  .du-btn { display:inline-flex; align-items:center; gap:1cqw; padding:2.4cqw 5.4cqw; border-radius:999px; background:${theme.gradient}; color:#fff; font-family:${theme.monoStack}; font-weight:700; font-size:3cqw; letter-spacing:0.1em; text-transform:uppercase; box-shadow:0 2cqw 6cqw -1.5cqw ${theme.primary}, 0 0 4cqw -1cqw ${theme.secondary}; will-change:transform,opacity; }
  .du-btn-lg { font-size:3.6cqw; padding:2.8cqw 6.4cqw; }
  .du-panel { will-change:transform,opacity; }
  .du-flash { position:absolute; inset:0; pointer-events:none; background:radial-gradient(circle at 50% 46%, #fff, ${theme.primary} 30%, transparent 68%); mix-blend-mode:screen; }
  #caps { position:absolute; inset:0; display:flex; justify-content:center; align-items:flex-end; padding-bottom:${portrait ? "16%" : "7%"}; z-index:60; pointer-events:none; }
  #cap-pill { max-width:82%; height:fit-content; flex:0 0 auto; text-align:center; padding:1.4cqw 3cqw; opacity:0; border-radius:2cqw; background:rgba(6,8,16,0.72); border:1px solid ${theme.border}; backdrop-filter:blur(8px); }
  #cap-text { font-family:${theme.bodyStack}; font-weight:600; font-size:2.6cqw; line-height:1.35; color:${theme.text}; }`;
}

// ---- MAIN --------------------------------------------------------------------
function buildComposition({ storyboard, dims, framePack, captionCues, assets, brandSkin = null, localized = null } = {}) {
  const theme = dataTheme(brandSkin);
  const S = localized ? { ...STRINGS, ...localized } : STRINGS;
  const sb = storyboard || {};
  const W = (dims && dims.width) || 1080, H = (dims && dims.height) || 1920;
  const portrait = W < H;
  const scenes = Array.isArray(sb.scenes) && sb.scenes.length
    ? sb.scenes.slice(0, 12)
    : [{ id: "s1", start: 0, duration: 5, kind: "hook", headline: sb.title || "KEYFRAME" }];
  const D = r(sb.durationSec || scenes.reduce((a, s) => Math.max(a, (Number(s.start) || 0) + (Number(s.duration) || 0)), 0) || 12);
  const seed = seedFrom(sb.title || (scenes[0] && scenes[0].headline) || "digital");

  // ---- Assets: distribute real screenshots across DISPLAY-CAPABLE scenes -------
  // A screenshot must NEVER be stranded on a scene that can't show it (open / cta / quote).
  // The Creative Director's per-asset `sceneId` is only a HINT: we honor it when that scene
  // can display an image, and otherwise redistribute the shot to the least-loaded content
  // scene — so every usable screenshot actually appears, no matter how the CD bound them or
  // what the storyboard's scene kinds are. The logo is reserved for the CTA mark (never a
  // data panel).
  const logo = logoAssetOf(assets);
  const shots = (Array.isArray(assets) ? assets : []).filter(screenOk)
    .sort((a, b) => (Number(b.cdScore) || 0) - (Number(a.cdScore) || 0));
  const baseArch = scenes.map((scene, i) => archetypeFor(scene, i, scenes.length));
  // EVERY content archetype is display-capable (hook/open, showcase, scatter, orbit, the
  // stat/proof reveal, and the quote statement) — only the pure CTA is not. So the CD's
  // per-asset sceneId hint for a stat/quote/hook scene resolves onto that very scene and
  // its builder renders the assigned screenshot in-frame, instead of the shot being
  // redistributed to a generic showcase.
  const canShow = (a) => a !== "cta";
  const displayIdx = scenes.map((_, i) => i).filter((i) => canShow(baseArch[i]));
  // Empty-guard: a valuable owned screenshot must never yield a text-only film. If nothing
  // is display-capable yet shots exist, force a middle (non-cta) scene into showcase.
  if (shots.length && !displayIdx.length) {
    let j = baseArch.findIndex((a, i) => a !== "cta" && i > 0 && i < scenes.length - 1);
    if (j < 0) j = baseArch.findIndex((a) => a !== "cta");
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
    // A display-capable scene that received screenshots shows them IN ITS OWN LANGUAGE.
    // The identity archetypes (hook/open hero, stat/proof reveal, quote statement) keep
    // their form and host ONE shot in a data-panel; a plain feature/orbit scene becomes a
    // focused showcase (1–2 shots) or a floating scatter (3+). Scenes with none are unchanged.
    if (canShow(arch) && sceneAssets.length) {
      if (arch === "open" || arch === "reveal" || arch === "statement") {
        sceneAssets = sceneAssets.slice(0, 1);
      } else if (sceneAssets.length >= 3) { arch = "scatter"; sceneAssets = sceneAssets.slice(0, 5); }
      else { arch = "showcase"; sceneAssets = sceneAssets.slice(0, portrait ? 2 : 3); }
    }
    const ctx = { id: `s${i + 1}`, T, L, E: r(T + L), i, isLast: i === scenes.length - 1, track: 2 + i, theme, S, W, H, portrait };
    const built = (BUILDERS[arch] || bOrbit)(scene, ctx, arch === "cta" ? logo : sceneAssets);
    bodyParts.push(built.html);
    sceneScripts.push(built.s.filter(Boolean).join("\n  "));
    if (!ctx.isLast) sceneScripts.push(`kill("#${ctx.id}",${r(T + L)});`);
  });

  const cues = (Array.isArray(captionCues) ? captionCues : [])
    .filter((c) => c && c.text != null)
    .map((c) => [r(c.start != null ? c.start : c.startSec || 0), r(c.end != null ? c.end : (c.start || 0) + 2), String(c.text)]);

  const dataspace = dataspaceClip(theme, { width: W, height: H }, D, seed);
  const caps = `<div id="caps" class="clip" data-start="0" data-duration="${D}" data-track-index="50"><div id="cap-pill"><div id="cap-text"></div></div></div>`;

  const script = `(function(){
  var D=${D};
  var tl=gsap.timeline({paused:true});
  var $=function(s){return document.querySelector(s);};
  function kill(id,t){tl.set(id,{opacity:0},t);}
  // scrub a substring of full text across [at, at+dur] — deterministic typing.
  function type(sel,full,at,dur){var o={n:0};tl.to(o,{n:full.length,duration:dur,ease:"none",snap:{n:1},onUpdate:function(){var e=$(sel);if(e){var s=full.slice(0,Math.round(o.n));if(e.textContent!==s)e.textContent=s;}}},at);}

  ${sceneScripts.join("\n  ")}

  var cues=${JSON.stringify(cues)};
  tl.to({},{duration:D,ease:"none",onUpdate:function(){
    var now=tl.time();
    if(window.KF_DIGIVERSE)window.KF_DIGIVERSE(now); // drive the data-space off the deterministic timeline (live preview)
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
    dataspace.html,
    bodyParts.join("\n"),
    grainClip(D),
    caps,
    `</div>`,
    `<script>`, dataspace.script, `</script>`,
    `<script>`, script, `</script>`,
    `</body>`, `</html>`,
  ].join("\n");

  const metaJson = JSON.stringify({ compositionId: "vid", width: W, height: H, fps: (dims && dims.fps) || 30, duration: D });
  // resolvedBrand echoes the accents the film actually wore (or null when no brand was
  // applied), so graph.persistWornBrand discloses the true painted palette.
  return { indexHtml, metaJson, resolvedBrand: theme.resolvedBrand };
}

module.exports = { buildComposition, STRINGS };
