// MOTION CANVAS composer — a native GSAP + canvas "abstract motion-graphics" film.
// The pack `motion-canvas` (manifest renderer:"motion-canvas") routes here from
// attemptLlmComposition, exactly like the flagship / kinetic / product-showcase /
// blueprint / bloom / bauhaus / terminal / paper-tales composers.
//
// Ported from the imported OmniMotion/React template ("Motion Canvas"). The React
// runtime is replaced by KEYFRAME's HyperFrames contract, but the identity is kept:
//   • a PERSISTENT animated SHAPE-FIELD backdrop — a drifting dot grid and big bold
//     geometric shapes (a ringed circle, a spun square, a triangle, a tilted block)
//     that drift and rotate on a cream canvas — painted on ONE <canvas> as a pure
//     function of the renderer's hf-seek time (deterministic; flows continuously
//     across every cut, so scene boundaries frame-match on pure ShapeField).
//   • bold kinetic TYPE that snaps and sweeps, screenshots MASKED into bold shape
//     frames (a hard offset accent shadow), animated stat BARS, rising chips and a
//     logo-reveal CTA. Confident, punchy, contemporary — designer-reel energy.
//
// EVERYTHING is theme-driven: canvasTheme(shapeA, shapeB) colors the shapes, strokes,
// fills, frame shadows, bars, chips, the accent type and the CTA — so a brand skin
// recolors the WHOLE film (every shape, stroke, fill and accent), not just the text.
// The cream CANVAS itself is the template's identity luminance (not the brand's to
// touch — brand steers HUE, the ground steers luminance), per brand_kit's contract.
//
// Engineering contract (identical to the other native composers): one paused GSAP
// timeline on window.__timelines["vid"]; direct-child .clip scenes on unique tracks;
// a boundary opacity:0 hard-kill per scene (the ShapeField persists behind them); ONE
// seek-safe caption node (#cap-text) driven by a single onUpdate proxy; finite repeats;
// cqw units + container-type:size (portrait-native, 9:16); hidden = opacity:0 only.
// GSAP animates the OUTER element; static transforms live on an INNER wrapper it never
// touches. Portrait is detected from dims (W<H); no manifest flag. Deterministic.

const { fontFaceCss, isBundled } = require("../fonts/pack_fonts");
const { isTrustedProminent, isLogo } = require("./asset_priority");
const { logoMark } = require("./logo_render");
const { plateBox } = require("./responsive");
const { charSpans } = require("./text_fx");
const { resolveBrand } = require("./brand_kit");

const GSAP_CDN = "https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js";
// Archivo Black (bundled) is the punchy poster grotesque that carries the template's
// bold motion-graphics headlines; JetBrains Mono is the bundled label/kicker face;
// Inter falls to system-ui for supporting copy. No Google <link> — bundled only.
const DISPLAY = "Archivo Black";
const MONO = "JetBrains Mono";
const BODY = "Inter";

// The template's default cream canvas + two shape accents when no brand is applied.
const GROUND = "#F2EDE3";
const INK = "#17130F";
const PAPER = "#FFFFFF";
const DEF_SHAPE_A = "#FF5A3C"; // vermilion
const DEF_SHAPE_B = "#2C6BED"; // cobalt

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
function seedFrom(str) { let h = 2166136261; const s = String(str || "motion"); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) || 7; }
// finite yoyo repeat count for a segment of `t` seconds at period `c`.
function reps(t, c) { return Math.max(0, Math.floor((Number(t) || 0) / (c || 1)) - 1); }

// ---- theme -------------------------------------------------------------------
// resolveBrand fits the brand accents to the CREAM ground (isDark:false → darkened
// for contrast when needed) and passes the pack accents through untouched when no
// skin — so a null skin renders the exact default cream reel byte-for-byte and
// resolvedBrand is null (honest "unbranded"). When applied, the two shape accents
// become the brand's and every derived value (shapes, strokes, fills, frame shadows,
// bars, chips, accent type, CTA) follows, and resolvedBrand echoes what was worn.
function canvasTheme(brandSkin) {
  const fontFace = (isBundled(DISPLAY) ? fontFaceCss(DISPLAY) : "") + (isBundled(MONO) ? fontFaceCss(MONO) : "");
  let shapeA = DEF_SHAPE_A, shapeB = DEF_SHAPE_B, resolvedBrand = null;
  try {
    const brand = resolveBrand(brandSkin, { ground: GROUND, isDark: false, packAccents: [DEF_SHAPE_A, DEF_SHAPE_B] });
    if (brand.applied) {
      shapeA = brand.accent || shapeA;
      shapeB = brand.accent2 || shapeB;
      resolvedBrand = {
        ...(brandSkin && typeof brandSkin === "object" ? brandSkin : {}),
        accents: [shapeA, shapeB], emphasis: brand.emphasis, adjusted: brand.adjusted,
        dropped: brand.dropped, tier: brand.tier, applied: true,
      };
    }
  } catch { shapeA = DEF_SHAPE_A; shapeB = DEF_SHAPE_B; resolvedBrand = null; }
  const onA = relLum(shapeA) > 0.55 ? INK : "#FFFFFF";
  const onB = relLum(shapeB) > 0.55 ? INK : "#FFFFFF";
  return {
    shapeA, shapeB, shapeC: INK, onA, onB,
    ground: GROUND, ink: INK, paper: PAPER,
    dim: "rgba(23,19,15,0.6)", faint: "rgba(23,19,15,0.38)",
    line: "rgba(23,19,15,0.14)",
    gradient: `linear-gradient(120deg, ${shapeA}, ${shapeB})`,
    displayStack: `'${DISPLAY}', 'Inter', system-ui, sans-serif`,
    monoStack: `'${MONO}', ui-monospace, monospace`,
    bodyStack: `'${BODY}', system-ui, sans-serif`,
    fontFace, resolvedBrand,
  };
}

// ---- fixed copy (localizable) — FALLBACK LABELS ONLY -------------------------
const STRINGS = {
  openKicker: "Motion Canvas",
  showcaseKicker: "Built to play",
  kineticKicker: "Make it move",
  statsKicker: "By the numbers",
  bulletsKicker: "The kit",
  ctaKicker: "Ready when you are",
  ctaButton: "Start creating",
  ctaTagline: "Motion graphics from a prompt.",
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
// Split a headline into word spans for the sweep; the last word carries the accent.
function accentWords(id, text) {
  return wordsOf(text).slice(0, 8).map((w) =>
    `<span class="mc-word ${id}-gw" style="display:block;opacity:0;">${esc(w)}</span>`
  ).join("");
}

// ---- asset gate + bold SHAPE-MASK frame --------------------------------------
function screenOk(a) {
  if (!a || !a.path) return false;
  if (isLogo(a)) return false; // the logo is CTA / key-moment material, not a shape panel
  if (a.type === "video" || /\.(mp4|webm|mov)($|\?)/i.test(a.path)) return false;
  if (/\.svg($|\?)/i.test(a.path)) return false;
  return isTrustedProminent(a) || a.cdProminence === "hero" || a.cdProminence === "support";
}
function logoAssetOf(assets) {
  return (Array.isArray(assets) ? assets : []).find((a) => a && a.path && isLogo(a) && !/\.(mp4|webm|mov)($|\?)/i.test(a.path)) || null;
}
// Portrait screenshots (ratio<0.9) get a tall frame; wide shots a shorter one.
function frameHmul(asset) {
  const ratio = Number(asset && asset.ratio) || (asset && asset.width && asset.height ? asset.width / asset.height : 0);
  if (ratio && ratio < 0.9) return 1.5;   // phone / portrait shot
  if (ratio && ratio > 1.6) return 0.64;  // wide desktop / dashboard
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

// A bold shape-masked frame holding a real screenshot — or, with no asset, an
// intentional branded placeholder (accent wash + a ringed shape) so an empty slot
// still reads as designed, never blank. Filled 100%×100%; the caller sizes it.
function shapeScreen(idn, theme, { w, h, asset, radius, shadow }) {
  const sh = shadow || theme.shapeA;
  const inner = asset && asset.path
    ? `<img src="${esc(asset.path)}" alt="${esc(asset.alt || "")}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;">`
    : `<div style="position:absolute;inset:0;background:${theme.gradient};opacity:0.92;"></div>` +
      `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;"><div style="width:32%;aspect-ratio:1;border-radius:50%;border:1cqw solid ${theme.paper};"></div></div>`;
  return `<div id="${idn}" class="mc-screen" style="width:${w};height:${h};border-radius:${radius || "2cqw"};position:relative;overflow:hidden;background:${theme.paper};border:0.5cqw solid ${theme.ink};box-shadow:1.4cqw 1.4cqw 0 ${sh};">
    ${inner}
    <div style="position:absolute;left:0;right:0;top:0;height:28%;background:linear-gradient(rgba(255,255,255,0.18),transparent);pointer-events:none;"></div>
  </div>`;
}
// A statically-tilted shape-mask frame (GSAP transforms the OUTER wrapper the caller
// gives class `.${id}-shot`; this inner div carries only the static rotate). Reuses
// shapeScreen so a stat/quote/bullet/hook scene hosts its assigned shot in the exact
// bold accent-shadow frame the showcase scene uses — same identity, no new visual.
function shotFrame(idn, theme, { w, asset, tilt, shadow }) {
  const hcqw = r(parseFloat(w) * frameHmul(asset));
  return `<div style="transform:rotate(${tilt || 0}deg);">${shapeScreen(idn, theme, { w: "100%", h: `${hcqw}cqw`, asset, radius: "2.6cqw", shadow: shadow || theme.shapeA })}</div>`;
}

// ---- scene clip open ---------------------------------------------------------
function open(id, ctx) { return `<div class="clip mc-scene" id="${id}" data-start="${ctx.T}" data-duration="${r(ctx.L)}" data-track-index="${ctx.track}" style="opacity:0;">`; }

// ---- archetype selection -----------------------------------------------------
function archetypeFor(scene, i, total) {
  const k = String(scene.kind || "").toLowerCase();
  const p = String(scene.purpose || "").toLowerCase();
  if (i === 0 || k === "hook" || k === "title" || /hook|intro|open/.test(p)) return "open";
  if (i === total - 1 || k === "cta" || /cta|close|sign\s*up|subscribe|download|get\s*started/.test(p)) return "cta";
  if (k === "stat" || k === "chart" || k === "countdown" || (pickNumber(scene) && /proof|result|metric|stat|number|data/.test(p + k))) return "stats";
  if (/feature|product|showcase|demo|screenshot|gallery|proof/.test(p + k)) return "showcase";
  if (k === "quote" || /quote|testimonial|manifesto|statement/.test(p)) return "kinetic";
  if (bullets(scene, 2).length >= 2) return "bullets";
  return "kinetic";
}

// ---- scene builders ((scene, ctx, assets) -> {html, s}) ----------------------

// SCENE — OPEN: bold shapes snap in around a big display title, a mono studio label
// TYPES in, and an accent bar wipes off the title. Opener energy.
function bOpen(scene, ctx, sceneAssets) {
  const { id, T, L, theme, S, portrait } = ctx;
  const kick = String(scene.kicker || S.openKicker).slice(0, 40);
  const title = scene.headline || scene.title || "";
  // When the CD pins a hero shot to the hook, it settles into a tilted shape-frame under
  // the title (its own entrance + float); with NO asset the opener is byte-identical.
  const asset = (sceneAssets && sceneAssets[0]) || null;
  const pw = fitPlateW(ctx, portrait ? 44 : 28, asset);
  const shot = asset
    ? `<div class="${id}-shot" style="opacity:0;width:${pw};margin:4.4cqw auto 0;">${shotFrame(`${id}sh`, theme, { w: pw, asset, tilt: -6, shadow: theme.shapeA })}</div>`
    : "";
  const html = `${open(id, ctx)}<div class="mc-safe">
    <div class="${id}-sh" style="opacity:0;position:absolute;left:15%;top:29%;width:14cqw;height:14cqw;border-radius:50%;background:${theme.shapeA};"></div>
    <div class="${id}-sh" style="opacity:0;position:absolute;right:17%;top:25%;width:11cqw;height:11cqw;"><div style="width:100%;height:100%;background:${theme.shapeB};transform:rotate(45deg);"></div></div>
    <div class="${id}-sh" style="opacity:0;position:absolute;right:22%;bottom:29%;width:0;height:0;border-left:6cqw solid transparent;border-right:6cqw solid transparent;border-bottom:10cqw solid ${theme.shapeA};"></div>
    <div class="mc-kicker ${id}-kick" style="opacity:0;margin-bottom:3cqw;"><span id="${id}-typed"></span><span class="${id}-caret" style="color:${theme.shapeA};">▋</span></div>
    <div style="position:relative;overflow:hidden;">
      <div class="mc-display ${id}-title" style="opacity:0;text-align:center;font-size:${r(headlineSize(title, 13))}cqw;">${esc(title)}</div>
      <div class="${id}-wipe" style="position:absolute;inset:0;background:${theme.shapeA};transform-origin:right;"></div>
    </div>${asset ? `
    ${shot}` : ""}
    ${scene.subtext ? `<div class="mc-body ${id}-sub" style="opacity:0;margin-top:3.4cqw;max-width:82%;text-align:center;">${esc(scene.subtext)}</div>` : ""}
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.4},${T});`,
    `tl.fromTo(".${id}-kick",{opacity:0,y:-16},{opacity:1,y:0,duration:0.45,ease:"power2.out"},${r(T + 0.2)});`,
    `type("#${id}-typed",${JSON.stringify(kick)},${r(T + 0.3)},${r(Math.max(0.5, Math.min(1.4, L * 0.3)))});`,
    `tl.to(".${id}-caret",{opacity:0,duration:0.42,ease:"steps(1)",yoyo:true,repeat:${reps(L * 0.6, 0.42)}},${r(T + 0.3)});`,
    `tl.fromTo(".${id}-sh",{opacity:0,scale:0.2},{opacity:1,scale:1,duration:0.6,ease:"back.out(1.9)",stagger:0.1},${r(T + 0.35)});`,
    `tl.set(".${id}-title",{opacity:1},${r(T + 0.62)});`,
    `tl.fromTo(".${id}-wipe",{scaleX:1},{scaleX:0,duration:0.6,ease:"power3.inOut"},${r(T + 0.62)});`,
    asset ? `tl.fromTo(".${id}-shot",{opacity:0,y:70,scale:0.86},{opacity:1,y:0,scale:1,duration:0.7,ease:"back.out(1.5)"},${r(T + 0.95)});` : "",
    asset ? `tl.to(".${id}-shot",{y:"-=1.4cqw",duration:2.2,ease:"sine.inOut",yoyo:true,repeat:${reps(L - 1.9, 2.2)},overwrite:"auto"},${r(T + 1.9)});` : "",
    scene.subtext ? `tl.fromTo(".${id}-sub",{opacity:0,y:18},{opacity:1,y:0,duration:0.55,ease:"power2.out"},${r(T + 1.3)});` : "",
    `tl.to(".${id}-sh",{y:"-=1cqw",duration:2,ease:"sine.inOut",yoyo:true,repeat:${reps(L - 1.4, 2)},stagger:0.12,overwrite:"auto"},${r(T + 1.4)});`,
  ].filter(Boolean);
  return { html, s };
}

// SCENE — SHOWCASE: 1–3 real screenshots MASKED into bold shape frames (a hard offset
// accent shadow, varied shape masks), a headline and feature chips. The product moment.
function bShowcase(scene, ctx, sceneAssets) {
  const { id, T, L, theme, S, portrait } = ctx;
  const kick = esc(scene.kicker || S.showcaseKicker);
  const shots = (sceneAssets || []).slice(0, 3);
  const feats = bullets(scene, 3);
  const single = shots.length <= 1;
  const masks = ["50%", "34% 66% 60% 40% / 42% 40% 60% 58%", "2cqw"];
  const tilts = shots.length === 3 ? [-6, 0, 6] : shots.length === 2 ? [-5, 5] : [0];
  let wall;
  if (single) {
    const a = shots[0] || null;
    const hmul = frameHmul(a) * (portrait ? 1 : 0.9);
    const pw = fitPlateW(ctx, portrait ? 58 : 40, a);
    wall = `<div class="${id}-cell" style="opacity:0;width:${pw};margin:0 auto;"><div style="transform:rotate(-3deg);">${shapeScreen(`${id}s0`, theme, { w: "100%", h: `${r(parseFloat(pw) * hmul)}cqw`, asset: a, radius: "3cqw", shadow: theme.shapeA })}</div></div>`;
  } else {
    const pw = shots.length >= 3 ? "26cqw" : "34cqw";
    wall = `<div style="display:flex;gap:4cqw;justify-content:center;align-items:center;width:100%;">${shots.map((a, i) => {
      const hmul = frameHmul(a) * 1.05;
      return `<div class="${id}-cell" style="opacity:0;width:${pw};text-align:center;"><div style="transform:rotate(${tilts[i]}deg);">${shapeScreen(`${id}s${i}`, theme, { w: "100%", h: `${r(parseFloat(pw) * hmul)}cqw`, asset: a, radius: masks[i % masks.length], shadow: i % 2 ? theme.shapeB : theme.shapeA })}</div>${(Array.isArray(scene.onScreenText) && scene.onScreenText[i]) ? `<div style="font-family:${theme.monoStack};font-size:2cqw;color:${theme.dim};margin-top:2.2cqw;letter-spacing:0.12em;text-transform:uppercase;">${esc(scene.onScreenText[i])}</div>` : ""}</div>`;
    }).join("")}</div>`;
  }
  const featHtml = (single && feats.length)
    ? `<div class="${id}-feats" style="display:flex;flex-wrap:wrap;gap:1.6cqw;justify-content:center;margin-top:4.5cqw;">${feats.map((f, i) => `<div class="mc-chip ${id}-fi" style="opacity:0;"><span class="mc-dot" style="background:${i % 2 ? theme.shapeB : theme.shapeA};"></span>${esc(f)}</div>`).join("")}</div>`
    : "";
  const html = `${open(id, ctx)}<div class="mc-safe">
    <div class="mc-kicker ${id}-kick" style="opacity:0;margin-bottom:2.4cqw;">${kick}</div>
    <div class="mc-h1 ${id}-head" style="opacity:0;text-align:center;font-size:${r(headlineSize(scene.headline, 7))}cqw;margin-bottom:4.5cqw;">${esc(scene.headline || scene.title || "")}</div>
    ${wall}
    ${featHtml}
  </div></div>`;
  const cells = shots.length ? shots.map((_, i) => `.${id}-cell`).slice(0, 1).join(",") : `.${id}-cell`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.35},${T});`,
    `tl.fromTo(".${id}-kick",{opacity:0,y:-16},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 0.2)});`,
    `tl.fromTo(".${id}-head",{opacity:0,y:22},{opacity:1,y:0,duration:0.55,ease:"power2.out"},${r(T + 0.35)});`,
    `tl.fromTo(".${id}-cell",{opacity:0,y:80,scale:0.84},{opacity:1,y:0,scale:1,duration:0.7,ease:"back.out(1.5)",stagger:0.14},${r(T + 0.6)});`,
    `tl.to(".${id}-cell",{y:"-=1.5cqw",duration:1.9,ease:"sine.inOut",yoyo:true,repeat:${reps(L - 1.6, 1.9)},stagger:0.1,overwrite:"auto"},${r(T + 1.5)});`,
    feats.length ? `tl.fromTo(".${id}-fi",{opacity:0,y:20,scale:0.9},{opacity:1,y:0,scale:1,duration:0.45,ease:"back.out(1.6)",stagger:0.12},${r(T + 1.2)});` : "",
  ].filter(Boolean);
  void cells;
  return { html, s };
}

// SCENE — KINETIC: a big type sweep — an accent ring expands behind while headline
// words snap up one by one, the last word in accent. The signature reel beat / quotes.
function bKinetic(scene, ctx, sceneAssets) {
  const { id, T, L, theme, S, portrait } = ctx;
  const kick = esc(scene.kicker || S.kineticKicker);
  // A quote/statement scene the CD assigned a supporting shot to mounts it in a tilted
  // shape-frame beside/above the type sweep; with NO asset the ring + words are byte-identical.
  const asset = (sceneAssets && sceneAssets[0]) || null;
  const pw = fitPlateW(ctx, portrait ? 50 : 32, asset);
  const shot = asset
    ? `<div class="${id}-shot" style="opacity:0;width:${pw};margin:0 auto 5cqw;">${shotFrame(`${id}sh`, theme, { w: pw, asset, tilt: 4, shadow: theme.shapeB })}</div>`
    : "";
  const html = `${open(id, ctx)}<div class="mc-safe">
    <div class="${id}-ring" style="opacity:0;position:absolute;left:50%;top:50%;width:22cqw;height:22cqw;margin-left:-11cqw;margin-top:-11cqw;border-radius:50%;border:1.4cqw solid ${theme.shapeA};"></div>
    <div class="mc-kicker ${id}-kick" style="opacity:0;margin-bottom:3.4cqw;">${kick}</div>${asset ? `
    ${shot}` : ""}
    <div class="mc-kinetic" style="text-align:center;font-size:${r(headlineSize(scene.headline, asset ? 11 : 15))}cqw;">${accentWords(id, scene.headline || scene.title || "MAKE IT MOVE")}</div>
    ${scene.subtext ? `<div class="mc-body ${id}-sub" style="opacity:0;margin-top:3.4cqw;max-width:80%;text-align:center;">${esc(scene.subtext)}</div>` : ""}
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.35},${T});`,
    `tl.fromTo(".${id}-ring",{opacity:0.9,scale:0.15},{opacity:0,scale:4,duration:0.9,ease:"power2.out"},${r(T + 0.25)});`,
    `tl.fromTo(".${id}-kick",{opacity:0,y:-16},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 0.35)});`,
    asset ? `tl.fromTo(".${id}-shot",{opacity:0,y:70,scale:0.86},{opacity:1,y:0,scale:1,duration:0.7,ease:"back.out(1.5)"},${r(T + 0.5)});` : "",
    asset ? `tl.to(".${id}-shot",{y:"-=1.4cqw",duration:2.2,ease:"sine.inOut",yoyo:true,repeat:${reps(L - 1.7, 2.2)},overwrite:"auto"},${r(T + 1.7)});` : "",
    `tl.fromTo(".${id}-gw",{opacity:0,yPercent:80,scale:0.8},{opacity:1,yPercent:0,scale:1,duration:0.55,ease:"back.out(1.7)",stagger:0.1},${r(T + 0.55)});`,
    scene.subtext ? `tl.fromTo(".${id}-sub",{opacity:0,y:18},{opacity:1,y:0,duration:0.55,ease:"power2.out"},${r(T + 1.3)});` : "",
    `tl.to(".mc-kinetic .${id}-gw:last-child",{scale:1.04,duration:${r(Math.max(1.4, L - 1.8))},ease:"sine.inOut",yoyo:true,repeat:1,transformOrigin:"center center"},${r(T + 1.4)});`,
  ].filter(Boolean);
  return { html, s };
}

// SCENE — STATS: animated horizontal BARS grow left-to-right in alternating accents
// behind a headline, each with its label and any extracted number. The proof beat.
function bStats(scene, ctx, sceneAssets) {
  const { id, T, L, theme, S, portrait } = ctx;
  const kick = esc(scene.kicker || S.statsKicker);
  // When the CD pins a dashboard shot to the proof scene, it sits in a shape-frame ABOVE
  // the growing bars so the metric AND the real screen read together; no asset → bars only.
  const asset = (sceneAssets && sceneAssets[0]) || null;
  const spw = fitPlateW(ctx, portrait ? 46 : 32, asset);
  const shot = asset
    ? `<div class="${id}-shot" style="opacity:0;width:${spw};margin:0 auto 4.4cqw;">${shotFrame(`${id}sh`, theme, { w: spw, asset, tilt: -3, shadow: theme.shapeB })}</div>`
    : "";
  let items = bullets(scene, 4);
  if (!items.length) { const e = scene.emphasis || scene.headline; if (e) items = [String(e)]; }
  const fr = [0.92, 0.72, 0.55, 0.42];
  const rows = items.map((it, i) => {
    const col = i % 2 ? theme.shapeB : theme.shapeA;
    const m = String(it).match(/\d[\d.,]*%?/);
    const num = m ? m[0] : "";
    const label = (m ? String(it).replace(m[0], "") : String(it)).trim() || String(it);
    return `<div class="${id}-row" style="opacity:0;display:flex;align-items:center;gap:2.4cqw;margin:1.8cqw 0;">
      <div style="flex:0 0 28%;text-align:right;font-family:${theme.bodyStack};font-weight:700;font-size:2.6cqw;color:${theme.ink};line-height:1.15;">${esc(label)}</div>
      <div style="flex:1;height:5.4cqw;background:${theme.paper};border:0.4cqw solid ${theme.ink};border-radius:1cqw;overflow:hidden;position:relative;">
        <div class="${id}-fill" style="position:absolute;left:0;top:0;bottom:0;width:${Math.round(fr[i % 4] * 100)}%;background:${col};transform-origin:left;transform:scaleX(0);"></div>
      </div>
      ${num ? `<div style="flex:0 0 auto;font-family:${theme.displayStack};font-size:3.6cqw;color:${col};">${esc(num)}</div>` : ""}
    </div>`;
  }).join("");
  const html = `${open(id, ctx)}<div class="mc-safe" style="justify-content:center;">
    <div class="mc-kicker ${id}-kick" style="opacity:0;margin-bottom:2.6cqw;">${kick}</div>
    ${scene.headline ? `<div class="mc-h1 ${id}-head" style="opacity:0;text-align:center;font-size:${r(headlineSize(scene.headline, 7))}cqw;margin-bottom:${asset ? "4cqw" : "5cqw"};">${esc(scene.headline)}</div>` : ""}${asset ? `
    ${shot}` : ""}
    <div style="width:88%;">${rows}</div>
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.35},${T});`,
    `tl.fromTo(".${id}-kick",{opacity:0,y:-16},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 0.2)});`,
    scene.headline ? `tl.fromTo(".${id}-head",{opacity:0,y:22},{opacity:1,y:0,duration:0.55,ease:"power2.out"},${r(T + 0.35)});` : "",
    asset ? `tl.fromTo(".${id}-shot",{opacity:0,y:70,scale:0.86},{opacity:1,y:0,scale:1,duration:0.7,ease:"back.out(1.5)"},${r(T + 0.5)});` : "",
    asset ? `tl.to(".${id}-shot",{y:"-=1.2cqw",duration:2,ease:"sine.inOut",yoyo:true,repeat:${reps(L - 1.7, 2)},overwrite:"auto"},${r(T + 1.7)});` : "",
    items.length ? `tl.fromTo(".${id}-row",{opacity:0,x:-24},{opacity:1,x:0,duration:0.5,ease:"power2.out",stagger:0.16},${r(T + 0.6)});` : "",
    items.length ? `tl.fromTo(".${id}-fill",{scaleX:0},{scaleX:1,duration:0.8,ease:"power3.out",stagger:0.16},${r(T + 0.75)});` : "",
  ].filter(Boolean);
  return { html, s };
}

// SCENE — BULLETS: a headline over a rising stack of feature chips (paper cards with a
// hard offset accent shadow and a colored dot). The dynamic default for bullet scenes.
function bBullets(scene, ctx, sceneAssets) {
  const { id, T, L, theme, S, portrait } = ctx;
  const kick = esc(scene.kicker || S.bulletsKicker);
  // A feature scene the CD pinned a screenshot to shows it in a shape-frame ABOVE the chip
  // stack (the screenshot WITH its feature chips); no asset → the chip stack is byte-identical.
  const asset = (sceneAssets && sceneAssets[0]) || null;
  const bpw = portrait ? "48cqw" : "32cqw";
  const shot = asset
    ? `<div class="${id}-shot" style="opacity:0;width:${bpw};margin:0 auto 4.4cqw;">${shotFrame(`${id}sh`, theme, { w: bpw, asset, tilt: -3, shadow: theme.shapeA })}</div>`
    : "";
  let chips = bullets(scene, 5);
  if (!chips.length) chips = [String(scene.subtext || scene.title || "").slice(0, 40)].filter(Boolean);
  const chipHtml = chips.map((c, i) =>
    `<div class="mc-chip mc-chip-lg ${id}-chip" style="opacity:0;"><span class="mc-dot" style="background:${i % 2 ? theme.shapeB : theme.shapeA};"></span>${esc(c)}</div>`
  ).join("");
  const html = `${open(id, ctx)}<div class="mc-safe">
    <div class="mc-kicker ${id}-kick" style="opacity:0;margin-bottom:2.4cqw;">${kick}</div>
    <div class="mc-h1 ${id}-head" style="opacity:0;text-align:center;font-size:${r(headlineSize(scene.headline, 8))}cqw;margin-bottom:${asset ? "4cqw" : "4.5cqw"};">${esc(scene.headline || scene.title || "")}</div>${asset ? `
    ${shot}` : ""}
    <div style="display:flex;flex-direction:column;gap:2.2cqw;align-items:center;">${chipHtml}</div>
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.35},${T});`,
    `tl.fromTo(".${id}-kick",{opacity:0,y:-16},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 0.2)});`,
    `tl.fromTo(".${id}-head",{opacity:0,y:24,scale:0.94},{opacity:1,y:0,scale:1,duration:0.6,ease:"power3.out"},${r(T + 0.35)});`,
    asset ? `tl.fromTo(".${id}-shot",{opacity:0,y:70,scale:0.86},{opacity:1,y:0,scale:1,duration:0.7,ease:"back.out(1.5)"},${r(T + 0.55)});` : "",
    asset ? `tl.to(".${id}-shot",{y:"-=1.2cqw",duration:2,ease:"sine.inOut",yoyo:true,repeat:${reps(L - 1.7, 2)},overwrite:"auto"},${r(T + 1.7)});` : "",
    `tl.fromTo(".${id}-chip",{opacity:0,y:28,scale:0.9},{opacity:1,y:0,scale:1,duration:0.5,ease:"back.out(1.6)",stagger:0.14},${r(T + 0.7)});`,
    `tl.to(".${id}-chip",{y:"-=0.9cqw",duration:2.2,ease:"sine.inOut",yoyo:true,repeat:${reps(L - 1.4, 2.2)},stagger:0.12,overwrite:"auto"},${r(T + 1.5)});`,
  ].filter(Boolean);
  return { html, s };
}

// SCENE — CTA: the logo mark assembles (the user's logo when uploaded, else a built
// shape mark), the wordmark types in char-by-char, an accent button pulses, a url settles.
function bCta(scene, ctx, logo) {
  const { id, T, L, theme, S } = ctx;
  const word = String(scene.headline || scene.title || "KEYFRAME").slice(0, 20);
  const btn = esc(String(scene.emphasis || S.ctaButton).slice(0, 24));
  const tagline = esc(String(scene.subtext || S.ctaTagline).slice(0, 60));
  const url = esc(String(S.ctaUrl).toUpperCase());
  const mark = logo && logo.path
    ? logoMark(logo, { sizeCqw: 20, ground: theme.ground, glow: null, escape: esc })
    : `<div style="position:relative;width:18cqw;height:18cqw;">
        <div style="position:absolute;left:0;top:12%;width:52%;height:52%;border-radius:50%;background:${theme.shapeA};"></div>
        <div style="position:absolute;right:0;bottom:6%;width:46%;height:46%;background:${theme.shapeB};transform:rotate(45deg);"></div>
      </div>`;
  const chars = charSpans(word, `${id}-ch`);
  const html = `${open(id, ctx)}<div class="mc-safe">
    <div class="mc-kicker ${id}-kick" style="opacity:0;margin-bottom:2.4cqw;">${esc(scene.kicker || S.ctaKicker)}</div>
    <div class="${id}-mark" style="opacity:0;">${mark}</div>
    <div class="mc-wordmark" style="margin-top:3.2cqw;">${chars}</div>
    <div class="mc-body ${id}-tag" style="opacity:0;margin-top:1.8cqw;">${tagline}</div>
    <div class="mc-btn ${id}-btn" style="opacity:0;margin-top:3.6cqw;color:${theme.onA};">${btn} →</div>
    <div class="${id}-url" style="opacity:0;font-family:${theme.monoStack};letter-spacing:0.22em;font-size:2.4cqw;color:${theme.faint};margin-top:2.4cqw;">${url}</div>
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.4},${T});`,
    `tl.fromTo(".${id}-kick",{opacity:0,y:-14},{opacity:1,y:0,duration:0.45,ease:"power2.out"},${r(T + 0.2)});`,
    `tl.fromTo(".${id}-mark",{opacity:0,scale:0.5,rotation:-20},{opacity:1,scale:1,rotation:0,duration:0.6,ease:"back.out(1.8)"},${r(T + 0.35)});`,
    `tl.fromTo(".${id}-ch",{opacity:0,y:60},{opacity:1,y:0,duration:0.5,ease:"power3.out",stagger:0.04},${r(T + 0.7)});`,
    `tl.fromTo(".${id}-tag",{opacity:0,y:14},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 1.2)});`,
    `tl.fromTo(".${id}-btn",{opacity:0,scale:0.8},{opacity:1,scale:1,duration:0.5,ease:"back.out(2)"},${r(T + 1.45)});`,
    `tl.to(".${id}-btn",{scale:1.04,duration:0.7,ease:"sine.inOut",yoyo:true,repeat:${reps(L - 2.05, 0.7)},overwrite:"auto"},${r(T + 2.05)});`,
    `tl.fromTo(".${id}-url",{opacity:0},{opacity:1,duration:0.5},${r(T + 1.7)});`,
  ];
  return { html, s };
}

const BUILDERS = { open: bOpen, showcase: bShowcase, kinetic: bKinetic, stats: bStats, bullets: bBullets, cta: bCta };

// ---- persistent SHAPE-FIELD canvas (hf-seek) ---------------------------------
// One canvas painted purely from the renderer's hf-seek time: a drifting dot grid and
// big bold geometric shapes (a ringed circle, a spun square, a triangle, a tilted
// block). Colored ONLY with theme.shapeA/shapeB on the cream ground, so a brand skin
// recolors the whole field. Live preview drives it off the timeline; render is
// hf-seek only (deterministic, seek-exact, capture-safe).
function shapeFieldClip(theme, dims, D, seed) {
  const W = dims.width, H = dims.height;
  const [ar, ag, ab] = hexToRgb(theme.shapeA);
  const [br, bg, bb] = hexToRgb(theme.shapeB);
  const [gr, gg, gb] = hexToRgb(theme.ground);
  const [lr, lg, lb] = hexToRgb(theme.ink);
  const html = `<div id="mc-field-clip" class="clip" data-start="0" data-duration="${D}" data-track-index="0" data-layout-allow-occlusion style="background:${theme.ground};">
    <canvas id="mc-field" width="${W}" height="${H}" style="position:absolute;inset:0;width:100%;height:100%;"></canvas>
  </div>`;
  const script = `(function(){
  var cv=document.getElementById("mc-field");if(!cv||!cv.getContext)return;var cx=cv.getContext("2d");if(!cx)return;
  var W=${W},H=${H};
  function A(a){return "rgba(${ar},${ag},${ab},"+a+")";}
  function B(a){return "rgba(${br},${bg},${bb},"+a+")";}
  var BG="rgb(${gr},${gg},${gb})",LN="rgba(${lr},${lg},${lb},";
  var sd=${seed >>> 0};function rnd(){sd=(sd*1664525+1013904223)>>>0;return sd/4294967296;}
  var ph0=rnd()*6.28,ph1=rnd()*6.28,ph2=rnd()*6.28,ph3=rnd()*6.28;
  var GS=W*0.07;
  function draw(t){
    cx.fillStyle=BG;cx.fillRect(0,0,W,H);
    // drifting dot grid
    var ox=Math.sin(t*0.2+ph0)*10,oy=(t*6)%GS;cx.fillStyle=LN+"0.5)";
    for(var yy=-GS+oy;yy<H+GS;yy+=GS){for(var xx=-GS+ox;xx<W+GS;xx+=GS){cx.beginPath();cx.arc(xx,yy,2,0,6.283);cx.fill();}}
    // big ringed circle (A), drifts + breathes
    cx.save();cx.globalAlpha=0.9;cx.strokeStyle=A(1);cx.lineWidth=W*0.02;var s0=1+0.06*Math.sin(t*0.5+ph0);cx.beginPath();cx.arc(W*0.2,H*0.2+Math.sin(t*0.4+ph0)*30,W*0.17*s0,0,6.283);cx.stroke();cx.restore();
    // spun square (B), top-right
    cx.save();cx.translate(W*0.86,H*0.12);cx.rotate(t*0.5+ph1);cx.globalAlpha=0.85;cx.fillStyle=B(1);var sq=W*0.2;cx.fillRect(-sq/2,-sq/2,sq,sq);cx.restore();
    // triangle (A), bottom-right
    cx.save();cx.translate(W*0.75,H*0.82);cx.rotate(t*0.3+ph2);cx.globalAlpha=0.9;cx.fillStyle=A(1);var ts=W*0.22;cx.beginPath();cx.moveTo(0,-ts*0.6);cx.lineTo(ts*0.55,ts*0.42);cx.lineTo(-ts*0.55,ts*0.42);cx.closePath();cx.fill();cx.restore();
    // tilted block (B), bottom-left
    cx.save();cx.translate(W*0.1,H*0.86);cx.rotate((45+Math.sin(t*0.6+ph3)*20)*Math.PI/180);cx.globalAlpha=0.8;cx.fillStyle=B(1);var s2=W*0.14;cx.fillRect(-s2/2,-s2/2,s2,s2);cx.restore();
    cx.globalAlpha=1;
  }
  // Painted ONLY from the renderer's hf-seek time — deterministic, seek-exact and
  // frame-capture-safe. The GSAP timeline's onUpdate also drives it in live preview.
  window.KF_CANVAS=draw;window.addEventListener("hf-seek",function(e){draw((e.detail&&e.detail.time)||0);});draw(0);
})();`;
  return { html, script };
}

// ---- grain overlay (top layer) -----------------------------------------------
const GRAIN_SVG = "<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/></filter><rect width='100%' height='100%' filter='url(#n)' opacity='0.5'/></svg>";
const GRAIN_URI = "data:image/svg+xml;base64," + Buffer.from(GRAIN_SVG).toString("base64");
function grainClip(D) {
  return `<div id="mc-grain" class="clip" data-start="0" data-duration="${D}" data-track-index="40" data-layout-allow-occlusion style="pointer-events:none;background-image:url('${GRAIN_URI}');background-size:260px 260px;opacity:0.04;mix-blend-mode:multiply;"></div>`;
}

// ---- style -------------------------------------------------------------------
function styleBlock(theme, portrait) {
  const safePad = portrait ? "12% 7% 14%" : "8% 8% 10%";
  return `${theme.fontFace}
  * { box-sizing:border-box; margin:0; padding:0; }
  html, body { width:100%; height:100%; overflow:hidden; background:${theme.ground}; }
  #root { position:relative; overflow:hidden; isolation:isolate; background:${theme.ground}; container-type:size; color:${theme.ink}; font-family:${theme.bodyStack}; }
  .clip { position:absolute; top:0; left:0; width:100%; height:100%; overflow:hidden; }
  .mc-safe { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:${safePad}; text-align:center; }
  .mc-display { font-family:${theme.displayStack}; font-weight:800; line-height:0.94; letter-spacing:-0.03em; color:${theme.ink}; }
  .mc-h1 { font-family:${theme.displayStack}; font-weight:700; line-height:1.02; letter-spacing:-0.02em; color:${theme.ink}; }
  .mc-kinetic { font-family:${theme.displayStack}; font-weight:800; line-height:0.9; letter-spacing:-0.03em; color:${theme.ink}; text-transform:uppercase; }
  .mc-kinetic .mc-word:last-child { color:${theme.shapeA}; }
  .mc-word { will-change:transform,opacity; }
  .mc-kicker { display:inline-flex; align-items:center; gap:0.6cqw; font-family:${theme.monoStack}; font-weight:600; font-size:2cqw; letter-spacing:0.34em; text-transform:uppercase; color:${theme.dim}; }
  .mc-body { font-family:${theme.bodyStack}; font-weight:500; font-size:2.7cqw; line-height:1.42; color:${theme.dim}; }
  .mc-wordmark { display:flex; font-family:${theme.displayStack}; font-weight:800; font-size:11cqw; letter-spacing:-0.02em; color:${theme.ink}; }
  .mc-chip { display:inline-flex; align-items:center; gap:1.4cqw; padding:1.8cqw 3.2cqw; border-radius:1.4cqw; background:${theme.paper}; border:0.4cqw solid ${theme.ink}; font-family:${theme.bodyStack}; font-weight:700; font-size:2.6cqw; letter-spacing:0.01em; color:${theme.ink}; white-space:nowrap; box-shadow:0.7cqw 0.7cqw 0 ${theme.shapeA}; will-change:transform,opacity; }
  .mc-chip-lg { font-size:3cqw; padding:2.2cqw 4cqw; }
  .mc-dot { width:1.8cqw; height:1.8cqw; border-radius:50%; flex:0 0 auto; }
  .mc-btn { display:inline-flex; align-items:center; gap:1cqw; padding:2.8cqw 6.4cqw; border-radius:999px; background:${theme.shapeA}; font-family:${theme.displayStack}; font-weight:700; font-size:3.4cqw; letter-spacing:0.02em; box-shadow:0.9cqw 0.9cqw 0 ${theme.ink}; will-change:transform,opacity; }
  .mc-screen { will-change:transform,opacity; }
  #caps { position:absolute; inset:0; display:flex; justify-content:center; align-items:flex-end; padding-bottom:${portrait ? "16%" : "7%"}; z-index:60; pointer-events:none; }
  #cap-pill { max-width:82%; height:fit-content; flex:0 0 auto; text-align:center; padding:1.4cqw 3cqw; opacity:0; border-radius:1.6cqw; background:${theme.ink}; border:0.4cqw solid ${theme.shapeA}; }
  #cap-text { font-family:${theme.bodyStack}; font-weight:600; font-size:2.6cqw; line-height:1.35; color:${theme.paper}; }`;
}

// ---- MAIN --------------------------------------------------------------------
function buildComposition({ storyboard, dims, framePack, captionCues, assets, brandSkin = null, localized = null } = {}) {
  const theme = canvasTheme(brandSkin);
  const S = localized ? { ...STRINGS, ...localized } : STRINGS;
  const sb = storyboard || {};
  const W = (dims && dims.width) || 1080, H = (dims && dims.height) || 1920;
  const portrait = W < H;
  const scenes = Array.isArray(sb.scenes) && sb.scenes.length
    ? sb.scenes.slice(0, 12)
    : [{ id: "s1", start: 0, duration: 5, kind: "hook", headline: sb.title || "KEYFRAME" }];
  const D = r(sb.durationSec || scenes.reduce((a, s) => Math.max(a, (Number(s.start) || 0) + (Number(s.duration) || 0)), 0) || 12);
  const seed = seedFrom(sb.title || (scenes[0] && scenes[0].headline) || "motion");

  // ---- Assets: distribute real screenshots across DISPLAY-CAPABLE scenes -------
  // A screenshot must NEVER be stranded on a scene that can't show it (open / kinetic /
  // stats / bullets / cta). The Creative Director's per-asset `sceneId` is a HINT:
  // honored when that scene can display an image, else the shot is redistributed to the
  // least-loaded showcase scene — so every usable screenshot actually appears. The logo
  // is reserved for the CTA mark (never a shape panel).
  const logo = logoAssetOf(assets);
  const shots = (Array.isArray(assets) ? assets : []).filter(screenOk)
    .sort((a, b) => (Number(b.cdScore) || 0) - (Number(a.cdScore) || 0));
  const baseArch = scenes.map((scene, i) => archetypeFor(scene, i, scenes.length));
  // EVERY content archetype hosts its assigned shot in the composer's own bold shape-mask
  // frame (open / showcase / kinetic / stats / bullets) — only the pure CTA (logo lockup) is
  // excluded — so a stat/quote/bullet/hook scene the CD pinned a screenshot to renders it on
  // the intended scene instead of stranding the shot on one showcase scene.
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
    // A showcase scene shows up to 3 shots in bold shape masks; the hook (open), quote
    // (kinetic), stat (stats) and feature (bullets) scenes each host ONE shot in-style in
    // their own shape-frame. A scene with none renders its intentional branded/text design.
    // The logo is CTA-only (never a shape panel).
    if (canShow(arch)) sceneAssets = (sceneAssets || []).slice(0, arch === "showcase" ? 3 : 1);
    else sceneAssets = [];
    const ctx = { id: `s${i + 1}`, T, L, E: r(T + L), i, isLast: i === scenes.length - 1, track: 2 + i, theme, S, W, H, portrait };
    const built = (BUILDERS[arch] || bKinetic)(scene, ctx, arch === "cta" ? logo : sceneAssets);
    bodyParts.push(built.html);
    sceneScripts.push(built.s.filter(Boolean).join("\n  "));
    if (!ctx.isLast) sceneScripts.push(`kill("#${ctx.id}",${r(T + L)});`);
  });

  const cues = (Array.isArray(captionCues) ? captionCues : [])
    .filter((c) => c && c.text != null)
    .map((c) => [r(c.start != null ? c.start : c.startSec || 0), r(c.end != null ? c.end : (c.start || 0) + 2), String(c.text)]);

  const field = shapeFieldClip(theme, { width: W, height: H }, D, seed);
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
    if(window.KF_CANVAS)window.KF_CANVAS(now); // drive the shape-field off the deterministic timeline (live preview)
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
    field.html,
    bodyParts.join("\n"),
    grainClip(D),
    caps,
    `</div>`,
    `<script>`, field.script, `</script>`,
    `<script>`, script, `</script>`,
    `</body>`, `</html>`,
  ].join("\n");

  const metaJson = JSON.stringify({ compositionId: "vid", width: W, height: H, fps: (dims && dims.fps) || 30, duration: D });
  // resolvedBrand echoes the accents the film actually wore (or null when no brand was
  // applied), so graph.persistWornBrand discloses the true painted palette.
  return { indexHtml, metaJson, resolvedBrand: theme.resolvedBrand };
}

module.exports = { buildComposition, STRINGS };
