// KINETIC UNIVERSE composer — a native GSAP + canvas "dark-cosmic prompt→video" film.
// The pack `kinetic-universe` (manifest renderer:"kinetic-universe") routes here from
// attemptLlmComposition, exactly like the flagship / blueprint / bloom / bauhaus /
// terminal / paper-tales composers.
//
// Ported from an imported OmniMotion/React template ("Kinetic Universe"). The React
// runtime is replaced by KEYFRAME's HyperFrames contract, but the identity is kept:
//   • a PERSISTENT animated COSMOS backdrop — drifting light beams, a perspective grid
//     floor, a parallax starfield and a vignette — painted on ONE <canvas> as a pure
//     function of the renderer's hf-seek time (deterministic; flows continuously across
//     every cut, so scene boundaries frame-match on pure Cosmos).
//   • kinetic GRADIENT type, glowing cosmic SCREEN device-frames that hold real
//     screenshots, ignition rings, converging streaks and a logo-reveal CTA.
//
// EVERYTHING is theme-driven: buildTheme(primary, secondary) derives the gradient,
// surface, border, glow and grid colors, so a brand skin recolors the WHOLE film
// (backgrounds, cards, borders, glows, streaks, chips, CTA) — not just the text.
//
// Engineering contract (identical to the other native composers): one paused GSAP
// timeline on window.__timelines["vid"]; direct-child .clip scenes on unique tracks;
// a boundary opacity:0 hard-kill per scene (the Cosmos persists behind them); ONE
// seek-safe caption node (#cap-text) driven by a single onUpdate proxy; finite repeats;
// cqw units + container-type:size (portrait-native, 9:16); hidden = opacity:0 only.
// Portrait is detected from dims (W<H); no manifest flag. Deterministic.

const { fontFaceCss, isBundled } = require("../fonts/pack_fonts");
const { isTrustedProminent, isLogo } = require("./asset_priority");
const { logoMark } = require("./logo_render");
const { plateBox } = require("./responsive");
const { charSpans, supportLine } = require("./text_fx");
const { resolveBrand } = require("./brand_kit");

const GSAP_CDN = "https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js";
// Sora/Archivo (the template's Google fonts) are NOT bundled for the CDN-free render —
// Space Grotesk is the bundled geometric display that carries the same cosmic-tech
// spirit; JetBrains Mono is the bundled prompt/mono face; Inter falls to system-ui.
const DISPLAY = "Space Grotesk";
const MONO = "JetBrains Mono";
const BODY = "Inter";

// The template's default accents when no brand is applied (violet → cyan → magenta).
const DEF_PRIMARY = "#7A5AE0";
const DEF_SECONDARY = "#22D3EE";
const DEF_TERTIARY = "#F0459B";
const GROUND = "#040509";
const GROUND_MID = "#0A0C14";

// ---- helpers -----------------------------------------------------------------
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
const r = (n) => Math.round((Number(n) || 0) * 100) / 100;
const hexToRgb = (h) => { const n = parseInt(String(h).replace("#", ""), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
function seedFrom(str) { let h = 2166136261; const s = String(str || "kinetic"); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) || 7; }

// ---- theme -------------------------------------------------------------------
// resolveBrand fits the brand accents to the near-black ground (isDark:true → lifted UP
// for contrast) and passes pack accents through untouched when no skin — so a null skin
// renders the exact default Cosmos byte-for-byte, and resolvedBrand is null (honest
// "unbranded" in the Brand panel). Applied → the three accents become the brand's, the
// derived gradient/surface/border/glow follow, and resolvedBrand echoes what was worn.
function cosmicTheme(brandSkin) {
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
    surface: `color-mix(in oklab, ${primary} 13%, ${GROUND_MID})`,
    surfaceTop: `color-mix(in oklab, ${primary} 22%, #10131d)`,
    border: `color-mix(in oklab, ${primary} 46%, transparent)`,
    line: `color-mix(in oklab, ${primary} 22%, transparent)`,
    glow: primary, glow2: secondary,
    text: "#F2F5FC", dim: "rgba(242,245,252,0.64)", faint: "rgba(242,245,252,0.34)",
    displayStack: `'${DISPLAY}', 'Inter', system-ui, sans-serif`,
    monoStack: `'${MONO}', ui-monospace, monospace`,
    bodyStack: `'${BODY}', system-ui, sans-serif`,
    fontFace, resolvedBrand,
  };
}

// ---- fixed copy (localizable) ------------------------------------------------
const STRINGS = {
  ignitionKicker: "KeyFrame · AI Video",
  generate: "Generate",
  revealKicker: "Imagine it · Generate it",
  showcaseKicker: "The feature set",
  discoveryKicker: "Text to video",
  orbitKicker: "Direct every detail",
  statementKicker: "The idea",
  ctaKicker: "Ready when you are",
  ctaButton: "Start creating free",
  ctaTagline: "Prompt to video. In seconds.",
  ctaUrl: "keyframe.ai",
  promptPlaceholder: "Describe your video…",
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
  return wordsOf(text).slice(0, 8).map((w, i) =>
    `<span class="kf-gword ${id}-gw" style="display:inline-block;opacity:0;margin:0 0.18em 0.1em 0;">${esc(w)}</span>`
  ).join("");
}

// ---- asset gate + cosmic SCREEN device-frame ---------------------------------
function screenOk(a) {
  if (!a || !a.path) return false;
  if (isLogo(a)) return false; // the logo is CTA / key-moment material, not a wall panel
  if (a.type === "video" || /\.(mp4|webm|mov)($|\?)/i.test(a.path)) return false;
  if (/\.svg($|\?)/i.test(a.path)) return false;
  return isTrustedProminent(a) || a.cdProminence === "hero" || a.cdProminence === "support";
}
function logoAssetOf(assets) {
  return (Array.isArray(assets) ? assets : []).find((a) => a && a.path && isLogo(a) && !/\.(mp4|webm|mov)($|\?)/i.test(a.path)) || null;
}

// A framed cosmic "screen" holding a real screenshot — or, with no asset, an
// intentional branded placeholder (gradient wash + faint holographic grid) so an
// empty slot still reads as designed, never blank.
function screen(id, theme, { w, h, tint, radius, asset }) {
  const c = tint || theme.primary;
  const inner = asset && asset.path
    ? `<img src="${esc(asset.path)}" alt="${esc(asset.alt || "")}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;">`
    : `<div style="position:absolute;inset:0;background:${theme.gradient2};opacity:0.42;"></div>` +
      `<div style="position:absolute;inset:0;background-image:linear-gradient(${theme.line} 1px,transparent 1px),linear-gradient(90deg,${theme.line} 1px,transparent 1px);background-size:14% 10%;opacity:0.6;"></div>` +
      `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;"><div style="width:16%;height:16%;border-radius:50%;background:${theme.gradient};box-shadow:0 0 4cqw ${c};opacity:0.85;"></div></div>`;
  return `<div id="${id}" class="kf-screen" style="width:${w};height:${h};border-radius:${radius || "2.4cqw"};position:relative;overflow:hidden;background:${theme.surface};border:0.16cqw solid ${theme.border};box-shadow:0 3cqw 8cqw -3cqw ${c}, 0 0 0 1px rgba(255,255,255,0.05) inset;">
    ${inner}
    <div style="position:absolute;left:0;right:0;top:0;height:34%;background:linear-gradient(rgba(255,255,255,0.12),transparent);pointer-events:none;"></div>
  </div>`;
}
// Portrait screenshots (ratio<0.9) get a tall phone-ish frame; else a wide 2:3/landscape card.
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


// ---- scene clip open ---------------------------------------------------------
function open(id, ctx) { return `<div class="clip kf-scene" id="${id}" data-start="${ctx.T}" data-duration="${r(ctx.L)}" data-track-index="${ctx.track}" style="opacity:0;">`; }

// ---- archetype selection -----------------------------------------------------
function archetypeFor(scene, i, total) {
  const k = String(scene.kind || "").toLowerCase();
  const p = String(scene.purpose || "").toLowerCase();
  if (i === 0 || k === "hook" || k === "title" || /hook|intro|open/.test(p)) return "ignition";
  if (i === total - 1 || k === "cta" || /cta|close|sign\s*up|subscribe|download|get\s*started/.test(p)) return "cta";
  if (k === "quote" || /quote|testimonial|manifesto/.test(p)) return "statement";
  if (k === "stat" || k === "chart" || k === "countdown" || (pickNumber(scene) && /proof|result|metric|stat|number/.test(p + k))) return "reveal";
  if (/feature|how|process|step|showcase|product|proof|demo/.test(p + k)) return "showcase";
  return "orbit";
}

// ---- scene builders ((scene, ctx, assets) -> {html, s}) ----------------------

// SCENE — IGNITION: a prompt bar types the headline, a Generate pill presses, an
// ignition ring expands and a flash lands. Opener energy.
function bIgnition(scene, ctx) {
  const { id, T, L, theme, S } = ctx;
  const prompt = String(scene.headline || scene.title || S.promptPlaceholder).slice(0, 90);
  const kick = esc(scene.kicker || S.ignitionKicker);
  // This beat rendered its headline and nothing else — the rest of the copy the script
  // wrote for the scene was dropped. supportLine takes the first line not already shown.
  const sup = supportLine(scene, [scene.kicker || S.ignitionKicker]);
  const html = `${open(id, ctx)}<div class="kf-safe">
    <div class="kf-kicker ${id}-kick" style="opacity:0;">${kick}</div>
    <div class="kf-ring ${id}-ring" style="opacity:0;"></div>
    <div class="${id}-bar" style="width:86%;opacity:0;">
      <div class="kf-promptbar">
        <span style="font-family:${theme.monoStack};font-size:3.4cqw;color:${theme.primary};">&gt;_</span>
        <div class="kf-prompttext"><span id="${id}-typed"></span><span class="${id}-caret" style="color:${theme.primary};">▋</span></div>
      </div>
      <div style="display:flex;justify-content:flex-end;margin-top:3cqw;">
        <div class="kf-btn ${id}-gen">${esc(S.generate)} ▸</div>
      </div>
    </div>
    ${sup ? `<div class="kf-body ${id}-sup" style="opacity:0;margin-top:3cqw;max-width:78%;text-align:center;">${esc(sup)}</div>` : ""}
    <div class="kf-flash ${id}-flash" style="opacity:0;"></div>
  </div></div>`;
  const chars = prompt.length;
  const s = [
    sup ? `tl.fromTo(".${id}-sup",{opacity:0,y:14},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 1.7)});` : "",
    `tl.set("#${id}",{opacity:1},${T});`,
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.4},${T});`,
    `tl.fromTo(".${id}-kick",{opacity:0,y:-18},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 0.2)});`,
    `tl.fromTo(".${id}-bar",{opacity:0,y:60,scale:0.94},{opacity:1,y:0,scale:1,duration:0.6,ease:"power3.out"},${r(T + 0.35)});`,
    // type the prompt via a scrubbed substring proxy (deterministic)
    `type("#${id}-typed",${JSON.stringify(prompt)},${r(T + 0.7)},${r(Math.max(0.8, L * 0.42))});`,
    // caret blink (finite yoyo) — stops on its own before the bar fades out
    `tl.to(".${id}-caret",{opacity:0,duration:0.42,ease:"steps(1)",yoyo:true,repeat:${reps(L * 0.6, 0.42)}},${r(T + 0.7)});`,
    // generate press + ignition
    `tl.to(".${id}-gen",{scale:0.94,duration:0.12,yoyo:true,repeat:1,ease:"power2.inOut"},${r(T + L * 0.66)});`,
    `tl.fromTo(".${id}-ring",{opacity:0.7,scale:0.1},{opacity:0,scale:2.4,duration:${r(Math.min(1.1, L * 0.22))},ease:"power2.out"},${r(T + L * 0.7)});`,
    `tl.fromTo(".${id}-flash",{opacity:0},{opacity:0.85,duration:0.12,yoyo:true,repeat:1,ease:"power2.out"},${r(T + L * 0.72)});`,
    `tl.to(".${id}-bar",{scale:0.9,opacity:0,filter:"blur(8px)",duration:0.5,ease:"power2.in",overwrite:"auto"},${r(T + L * 0.8)});`,
  ];
  return { html, s };
}

// SCENE — REVEAL: converging light streaks collapse to a shockwave, then a kinetic
// gradient headline pops in word-by-word. The signature "prompt → video" impact.
function bReveal(scene, ctx) {
  const { id, T, L, theme, S } = ctx;
  const kick = esc(scene.kicker || S.revealKicker);
  // Each streak's radial ANGLE lives on a static wrapper (CSS rotate); GSAP only ever
  // touches the inner line's scaleX/opacity, so it can never overwrite the rotation.
  const streaks = Array.from({ length: 14 }).map((_, i) => {
    const ang = (i / 14) * 360;
    const col = i % 2 ? theme.secondary : theme.primary;
    return `<div style="position:absolute;left:50%;top:50%;transform:rotate(${ang}deg);transform-origin:0 0;">` +
      `<div class="${id}-streak" style="position:absolute;left:12cqw;top:-0.2cqw;width:34cqw;height:0.4cqw;transform-origin:0 50%;opacity:0;background:linear-gradient(90deg,transparent,${col});"></div></div>`;
  }).join("");
  const html = `${open(id, ctx)}<div class="kf-safe">
    ${streaks}
    <div class="${id}-shock" style="position:absolute;left:50%;top:50%;width:20cqw;height:20cqw;margin-left:-10cqw;margin-top:-10cqw;border-radius:50%;border:0.4cqw solid ${theme.secondary};opacity:0;box-shadow:0 0 8cqw ${theme.secondary};"></div>
    <div class="kf-kicker ${id}-kick" style="opacity:0;margin-bottom:3cqw;">${kick}</div>
    <div class="kf-display kf-grad" id="${id}-head" style="text-align:center;font-size:${r(headlineSize(scene.headline, 14))}cqw;">${gradWords(id, scene.headline || scene.title || "PROMPT TO VIDEO")}</div>
    ${scene.subtext ? `<div class="kf-body ${id}-sub" style="opacity:0;margin-top:3cqw;max-width:80%;text-align:center;">${esc(scene.subtext)}</div>` : ""}
    <div class="kf-flash ${id}-flash" style="opacity:0;"></div>
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.35},${T});`,
    `tl.fromTo(".${id}-streak",{opacity:0,scaleX:0.15},{opacity:0.9,scaleX:1,duration:0.5,ease:"power2.in",stagger:0.01},${r(T + 0.15)});`,
    `tl.to(".${id}-streak",{opacity:0,duration:0.4,ease:"power2.in",overwrite:"auto"},${r(T + 0.65)});`,
    `tl.fromTo(".${id}-shock",{scale:0.1,opacity:0.9},{scale:5,opacity:0,duration:0.8,ease:"power2.out"},${r(T + 0.55)});`,
    `tl.fromTo(".${id}-flash",{opacity:0},{opacity:0.8,duration:0.1,yoyo:true,repeat:1},${r(T + 0.6)});`,
    `tl.fromTo(".${id}-kick",{opacity:0,y:-16},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 0.7)});`,
    `tl.fromTo(".${id}-gw",{opacity:0,yPercent:90,scale:0.7},{opacity:1,yPercent:0,scale:1,duration:0.55,ease:"back.out(1.7)",stagger:0.09},${r(T + 0.85)});`,
    scene.subtext ? `tl.fromTo(".${id}-sub",{opacity:0,y:18},{opacity:1,y:0,duration:0.55,ease:"power2.out"},${r(T + 1.4)});` : "",
    `tl.to("#${id}-head",{scale:1.015,duration:${r(Math.max(1.5, L - 2))},ease:"sine.inOut",yoyo:true,repeat:1,transformOrigin:"center center"},${r(T + 1.5)});`,
  ].filter(Boolean);
  return { html, s };
}

// SCENE — SHOWCASE: 1–3 cosmic SCREEN device-frames (real screenshots when present)
// on a subtle perspective wall, with a headline and feature labels. The product moment.
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
        return `<div class="${id}-hero" style="opacity:0;width:${d.w};margin:0 auto;">${screen(`${id}-s0`, theme, { w: "100%", h: `calc(var(--w) * ${d.hMul})`, tint: theme.primary, asset: one, radius: "3cqw" })}</div>`;
      })()
    : `<div style="display:flex;gap:3cqw;justify-content:center;align-items:center;perspective:1400px;">${shots.map((a, i) => {
        const d = shotDims(a, "26%", "30%");
        const tilt = (i - (shots.length - 1) / 2) * -16;
        // GSAP animates the OUTER .hero (opacity/y/scale/float); the perspective tilt is
        // static CSS on an inner wrapper GSAP never touches.
        return `<div class="${id}-hero" style="opacity:0;width:${d.w};"><div style="transform:rotateY(${tilt}deg);transform-style:preserve-3d;">${screen(`${id}-s${i}`, theme, { w: "100%", h: `calc(var(--w) * ${d.hMul})`, tint: i % 2 ? theme.secondary : theme.primary, asset: a, radius: "2.4cqw" })}</div></div>`;
      }).join("")}</div>`;
  const featHtml = feats.length
    ? `<div class="${id}-feats" style="display:flex;flex-direction:column;gap:1.4cqw;align-items:center;margin-top:4cqw;">${feats.map((f) => `<div class="kf-chip ${id}-fi" style="opacity:0;">${esc(f)}</div>`).join("")}</div>`
    : "";
  const html = `${open(id, ctx)}<div class="kf-safe">
    <div class="kf-kicker ${id}-kick" style="opacity:0;margin-bottom:2.4cqw;">${kick}</div>
    <div class="kf-h1 ${id}-head" style="opacity:0;text-align:center;font-size:${r(headlineSize(scene.headline, 7.5))}cqw;margin-bottom:4cqw;">${esc(scene.headline || scene.title || "")}</div>
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

// SCENE — DISCOVERY: scattered floating SCREEN frames (real screenshots when present)
// with a centered caption. "Your words become footage." Uses several pooled assets.
function bDiscovery(scene, ctx, sceneAssets) {
  const { id, T, L, theme, S } = ctx;
  const kick = esc(scene.kicker || S.discoveryKicker);
  const POS = [
    { x: 28, y: 40, w: 30, r: -8 }, { x: 72, y: 36, w: 26, r: 8 },
    { x: 26, y: 70, w: 27, r: 7 }, { x: 74, y: 72, w: 29, r: -8 }, { x: 50, y: 55, w: 34, r: -2 },
  ];
  const shots = (sceneAssets || []);
  // GSAP animates the OUTER .fr (opacity/scale/float via y); the centering + rotation is
  // static CSS on an inner wrapper GSAP never touches (so the float can't discard it).
  const frames = POS.map((f, i) => {
    const asset = shots[i] || null;
    return `<div class="${id}-fr" style="position:absolute;left:${f.x}%;top:${f.y}%;width:${f.w}cqw;opacity:0;"><div style="transform:translate(-50%,-50%) rotate(${f.r}deg);">${screen(`${id}-d${i}`, theme, { w: "100%", h: `${r(f.w * 1.5)}cqw`, tint: i % 2 ? theme.secondary : theme.primary, asset, radius: "2cqw" })}</div></div>`;
  }).join("");
  const html = `${open(id, ctx)}<div class="clip" style="position:absolute;inset:0;">
    ${frames}
    <div class="${id}-cap" style="position:absolute;left:0;right:0;top:12%;text-align:center;padding:0 8%;opacity:0;">
      <div class="kf-kicker" style="justify-content:center;margin-bottom:2cqw;">${kick}</div>
      <div class="kf-h1 kf-grad" style="text-align:center;font-size:${r(headlineSize(scene.headline, 8))}cqw;">${esc(scene.headline || scene.title || "")}</div>
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

// SCENE — ORBIT: a headline plus a rising stack of control/feature chips. "Direct
// every detail." The dynamic default for bullet scenes.
function bOrbit(scene, ctx) {
  const { id, T, L, theme, S } = ctx;
  const kick = esc(scene.kicker || S.orbitKicker);
  let chips = bullets(scene, 5);
  if (!chips.length) chips = wordsOf(scene.voiceover).slice(0, 3).length ? [String(scene.voiceover).slice(0, 40)] : [esc(scene.title || "")];
  const chipHtml = chips.map((c, i) =>
    `<div class="kf-chip ${id}-chip" style="opacity:0;" data-i="${i}"><span class="kf-dot" style="background:${i % 2 ? theme.secondary : theme.primary};box-shadow:0 0 1.2cqw ${i % 2 ? theme.secondary : theme.primary};"></span>${esc(c)}</div>`
  ).join("");
  const html = `${open(id, ctx)}<div class="kf-safe">
    <div class="kf-kicker ${id}-kick" style="opacity:0;margin-bottom:2.4cqw;">${kick}</div>
    <div class="kf-h1 ${id}-head" style="opacity:0;text-align:center;font-size:${r(headlineSize(scene.headline, 8.5))}cqw;margin-bottom:4.5cqw;">${esc(scene.headline || scene.title || "")}</div>
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
// When a screenshot is ASSIGNED to a quote scene (the CD hints it there), it rises in a
// glowing cosmic SCREEN frame above the line so the moment is grounded in the real product;
// with no asset the scene is byte-identical to the original pure-type statement.
function bStatement(scene, ctx, sceneAssets) {
  const { id, T, L, theme } = ctx;
  const asset = (sceneAssets && sceneAssets[0]) || null;
  const ratio = asset ? (Number(asset.ratio) || (asset.width && asset.height ? asset.width / asset.height : 0)) : 0;
  const portraitShot = ratio && ratio < 0.9;
  // Fit the frame to the CANVAS as well as to the shot. The pair below sets the plate's
  // proportions from the shot's orientation, but nothing checked the result against the
  // frame: in a 177.8cqw-tall portrait column a 62cqw wide card came out 38cqw high —
  // roughly a fifth of the height, with the rest empty. plateBox scales the pair
  // uniformly (proportions kept) and is a no-op in landscape. See services/responsive.js.
  const __fw = portraitShot ? 46 : 62;
  const __fit = plateBox(ctx.W, ctx.H, __fw, portraitShot ? __fw * 1.5 : __fw * 0.62);
  const fw = __fit.w, fh = __fit.h;
  const frame = asset
    ? `<div class="${id}-fr" style="width:${fw}cqw;margin:0 auto 4cqw;opacity:0;">${screen(`${id}-s0`, theme, { w: "100%", h: `${r(fh)}cqw`, tint: theme.primary, asset, radius: "2.6cqw" })}</div>`
    : "";
  const html = `${open(id, ctx)}<div class="kf-safe">
    ${frame}
    <div class="kf-display kf-grad ${id}-st" style="text-align:center;font-size:${r(headlineSize(scene.headline, asset ? 9 : 12))}cqw;opacity:0;">${esc(scene.headline || scene.title || "")}</div>
    ${scene.subtext ? `<div class="kf-body ${id}-sub" style="opacity:0;margin-top:3cqw;max-width:78%;text-align:center;">${esc(scene.subtext)}</div>` : ""}
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.4},${T});`,
    asset ? `tl.fromTo(".${id}-fr",{opacity:0,y:52,scale:0.9},{opacity:1,y:0,scale:1,duration:0.7,ease:"power3.out"},${r(T + 0.25)});` : "",
    asset ? `tl.to(".${id}-fr",{y:"-=1.4cqw",duration:2,ease:"sine.inOut",yoyo:true,repeat:${reps(L - 1.6, 2)},overwrite:"auto"},${r(T + 1.3)});` : "",
    `tl.fromTo(".${id}-st",{opacity:0,scale:0.8,filter:"blur(10px)"},{opacity:1,scale:1,filter:"blur(0px)",duration:0.8,ease:"power3.out"},${r(T + (asset ? 0.55 : 0.3))});`,
    scene.subtext ? `tl.fromTo(".${id}-sub",{opacity:0,y:18},{opacity:1,y:0,duration:0.55,ease:"power2.out"},${r(T + 1.0)});` : "",
    `tl.to(".${id}-st",{scale:1.02,duration:${r(Math.max(1.6, L - 1.6))},ease:"sine.inOut",yoyo:true,repeat:1,transformOrigin:"center center"},${r(T + 1.1)});`,
  ].filter(Boolean);
  return { html, s };
}

// SCENE — CTA: the logo mark assembles (the user's logo when uploaded, else a built
// keyframe glyph), the wordmark types in char-by-char, a gradient button pulses.
function bCta(scene, ctx, logo) {
  const { id, T, L, theme, S } = ctx;
  const word = String(scene.headline || scene.title || "KEYFRAME").slice(0, 20);
  const btn = esc(String(scene.emphasis || S.ctaButton).slice(0, 24));
  const tagline = esc(String(scene.subtext || S.ctaTagline).slice(0, 60));
  const url = esc(String(S.ctaUrl).toUpperCase());
  const mark = logo && logo.path
    ? logoMark(logo, { sizeCqw: 22, ground: theme.ground, glow: theme.primary, escape: esc })
    : `<div style="position:relative;width:20cqw;height:20cqw;">
        <div style="position:absolute;inset:12%;border:0.4cqw solid ${theme.border};border-radius:22%;"></div>
        <div style="position:absolute;inset:6%;border:0.4cqw solid ${theme.line};border-radius:22%;"></div>
        <div style="position:absolute;inset:0;border-radius:22%;background:${theme.gradient};box-shadow:0 0 6cqw ${theme.primary};display:flex;align-items:center;justify-content:center;">
          <div style="width:0;height:0;border-top:3.4cqw solid transparent;border-bottom:3.4cqw solid transparent;border-left:5.4cqw solid #fff;margin-left:1.2cqw;"></div>
        </div>
      </div>`;
  const chars = charSpans(word, `${id}-ch`);
  const html = `${open(id, ctx)}<div class="kf-safe">
    <div class="kf-kicker ${id}-kick" style="opacity:0;margin-bottom:2cqw;">${esc(scene.kicker || S.ctaKicker)}</div>
    <div class="${id}-mark" style="opacity:0;transform:scale(0.6);">${mark}</div>
    <div class="kf-wordmark" style="margin-top:3cqw;">${chars}</div>
    <div class="kf-body ${id}-tag" style="opacity:0;margin-top:1.6cqw;">${tagline}</div>
    <div class="kf-btn kf-btn-lg ${id}-btn" style="opacity:0;margin-top:3.4cqw;">${btn} ▸</div>
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

// finite yoyo repeat count for a segment of `t` seconds at period `c`.
function reps(t, c) { return Math.max(0, Math.floor((Number(t) || 0) / (c || 1)) - 1); }

const BUILDERS = { ignition: bIgnition, reveal: bReveal, showcase: bShowcase, discovery: bDiscovery, orbit: bOrbit, statement: bStatement, cta: bCta };

// ---- persistent COSMOS canvas (hf-seek) --------------------------------------
// One canvas painted purely from the renderer's hf-seek time: drifting light beams,
// a perspective grid floor, a parallax starfield and a vignette. Colored ONLY with
// theme.primary/secondary, so a brand skin recolors the whole backdrop. Live preview
// (non-webdriver) drives it with a rAF clock; render is hf-seek only (deterministic).
function cosmosClip(theme, dims, D, seed) {
  const W = dims.width, H = dims.height;
  const [pr, pg, pb] = hexToRgb(theme.primary);
  const [sr, sg, sb] = hexToRgb(theme.secondary);
  const [gr, gg, gb] = hexToRgb(theme.ground);
  const html = `<div id="kf-cosmos-clip" class="clip" data-start="0" data-duration="${D}" data-track-index="0" data-layout-allow-occlusion style="background:${theme.ground};">
    <canvas id="kf-cosmos" width="${W}" height="${H}" style="position:absolute;inset:0;width:100%;height:100%;"></canvas>
  </div>`;
  const script = `(function(){
  var cv=document.getElementById("kf-cosmos");if(!cv||!cv.getContext)return;var cx=cv.getContext("2d");if(!cx)return;
  var W=${W},H=${H};
  function P(a){return "rgba(${pr},${pg},${pb},"+a+")";}
  function S(a){return "rgba(${sr},${sg},${sb},"+a+")";}
  var GD="rgba(${gr},${gg},${gb},";
  var sd=${seed>>>0};function rnd(){sd=(sd*1664525+1013904223)>>>0;return sd/4294967296;}
  var N=Math.round(64*(W*H)/(1080*1920)),ST=[];
  for(var i=0;i<N;i++){ST.push({bx:rnd(),by:rnd(),depth:0.25+0.75*rnd(),sz:1+3*rnd(),warm:rnd()<0.5,ph:rnd()*6.28});}
  function beam(fx,cxp,cyp,drift,size,op){var x=cxp*W+Math.sin(drift)*W*0.12,y=cyp*H+Math.cos(drift*0.8)*H*0.06;var g=cx.createRadialGradient(x,y,0,x,y,size);g.addColorStop(0,fx(op));g.addColorStop(0.62,fx(0));cx.fillStyle=g;cx.fillRect(0,0,W,H);}
  function draw(t){
    cx.clearRect(0,0,W,H);
    beam(P,0.28,0.30,t*0.18,W*0.95,0.40);
    beam(S,0.74,0.64,t*-0.14,W*0.85,0.36);
    beam(P,0.55,0.12,t*0.10,W*0.72,0.22);
    var gh=H*0.42,top=H-gh,vp=W*0.5,gu=W*0.09,sc=(t*46)%gu;
    cx.lineWidth=1.4;
    for(var ri=0;ri<24;ri++){var f=Math.pow((ri+sc/gu)/24,1.9);var yy=top+f*gh;if(yy<top||yy>H)continue;cx.globalAlpha=0.22*(1-f);cx.strokeStyle=P(1);cx.beginPath();cx.moveTo(0,yy);cx.lineTo(W,yy);cx.stroke();}
    for(var v=-9;v<=9;v++){cx.globalAlpha=0.12;cx.strokeStyle=P(1);cx.beginPath();cx.moveTo(vp+v*gu*0.5,top);cx.lineTo(vp+v*W*0.19,H);cx.stroke();}
    cx.globalAlpha=1;
    var span=H+60;
    for(var i=0;i<ST.length;i++){var s=ST[i];var y=(s.by*span-t*(14+70*s.depth))%span;if(y<0)y+=span;y-=30;var x=s.bx*W+Math.sin(t*0.5+s.ph)*14*s.depth;var sz=s.sz*(0.5+s.depth);cx.globalAlpha=0.18+0.55*s.depth;cx.fillStyle=s.warm?P(1):S(1);cx.shadowColor=s.warm?P(1):S(1);cx.shadowBlur=sz*3.5;cx.beginPath();cx.arc(x,y,sz,0,6.283);cx.fill();}
    cx.shadowBlur=0;cx.globalAlpha=1;
    var vg=cx.createRadialGradient(W*0.5,H*0.42,Math.min(W,H)*0.18,W*0.5,H*0.42,Math.max(W,H)*0.78);
    vg.addColorStop(0,GD+"0)");vg.addColorStop(1,GD+"0.92)");cx.fillStyle=vg;cx.fillRect(0,0,W,H);
  }
  // Painted ONLY from the renderer's hf-seek time — deterministic, seek-exact, and
  // frame-capture-safe (no wall clock / rAF). The GSAP timeline's onUpdate also drives
  // it so the cosmos animates in live preview too, staying in lockstep with the scenes.
  window.KF_COSMOS=draw;window.addEventListener("hf-seek",function(e){draw((e.detail&&e.detail.time)||0);});draw(0);
})();`;
  return { html, script };
}

// ---- grain overlay (top layer) -----------------------------------------------
const GRAIN_SVG = "<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/></filter><rect width='100%' height='100%' filter='url(#n)' opacity='0.5'/></svg>";
const GRAIN_URI = "data:image/svg+xml;base64," + Buffer.from(GRAIN_SVG).toString("base64");
function grainClip(D) {
  return `<div id="kf-grain" class="clip" data-start="0" data-duration="${D}" data-track-index="40" data-layout-allow-occlusion style="pointer-events:none;background-image:url('${GRAIN_URI}');background-size:260px 260px;opacity:0.05;mix-blend-mode:overlay;"></div>`;
}

// ---- style -------------------------------------------------------------------
function styleBlock(theme, portrait) {
  const safePad = portrait ? "12% 6% 14%" : "8% 8% 10%";
  return `${theme.fontFace}
  * { box-sizing:border-box; margin:0; padding:0; }
  html, body { width:100%; height:100%; overflow:hidden; background:#000; }
  #root { position:relative; overflow:hidden; isolation:isolate; background:${theme.ground}; container-type:size; color:${theme.text}; font-family:${theme.bodyStack}; }
  .clip { position:absolute; top:0; left:0; width:100%; height:100%; overflow:hidden; }
  .kf-safe { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:${safePad}; text-align:center; }
  .kf-display { font-family:${theme.displayStack}; font-weight:800; line-height:0.94; letter-spacing:-0.03em; color:${theme.text}; }
  .kf-h1 { font-family:${theme.displayStack}; font-weight:700; line-height:1.02; letter-spacing:-0.02em; color:${theme.text}; }
  .kf-grad { background:${theme.gradient}; -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; color:transparent; }
  .kf-kicker { display:inline-flex; align-items:center; gap:0.9cqw; font-family:${theme.monoStack}; font-weight:600; font-size:2cqw; letter-spacing:0.4em; text-transform:uppercase; color:${theme.dim}; }
  .kf-body { font-family:${theme.bodyStack}; font-weight:500; font-size:2.6cqw; line-height:1.42; color:${theme.dim}; }
  .kf-wordmark { display:flex; font-family:${theme.displayStack}; font-weight:800; font-size:11cqw; letter-spacing:-0.02em; color:${theme.text}; }
  .kf-gword { will-change:transform,opacity; }
  .kf-chip { display:inline-flex; align-items:center; gap:1.4cqw; padding:1.6cqw 3cqw; border-radius:999px; background:rgba(255,255,255,0.04); border:1px solid ${theme.border}; backdrop-filter:blur(6px); font-family:${theme.monoStack}; font-weight:600; font-size:2.6cqw; letter-spacing:0.06em; color:${theme.text}; white-space:nowrap; box-shadow:0 1.4cqw 5cqw -2cqw ${theme.primary}; will-change:transform,opacity; }
  .kf-dot { width:1.4cqw; height:1.4cqw; border-radius:3px; flex:0 0 auto; }
  .kf-btn { display:inline-flex; align-items:center; gap:1cqw; padding:2.4cqw 5.4cqw; border-radius:999px; background:${theme.gradient}; color:#fff; font-family:${theme.monoStack}; font-weight:700; font-size:3cqw; letter-spacing:0.1em; text-transform:uppercase; box-shadow:0 2cqw 6cqw -1.5cqw ${theme.primary}, 0 0 4cqw -1cqw ${theme.secondary}; will-change:transform,opacity; }
  .kf-btn-lg { font-size:3.6cqw; padding:2.8cqw 6.4cqw; }
  .kf-screen { will-change:transform,opacity; }
  .kf-promptbar { display:flex; align-items:center; gap:2cqw; padding:3.4cqw 3.6cqw; border-radius:3.4cqw; background:${theme.surface}; border:0.16cqw solid ${theme.border}; box-shadow:0 4cqw 12cqw -4cqw ${theme.primary}, 0 0 0 1px rgba(255,255,255,0.05) inset; }
  .kf-prompttext { flex:1; text-align:left; font-family:${theme.monoStack}; font-size:3cqw; line-height:1.4; color:${theme.text}; min-height:3cqw; }
  .kf-ring { position:absolute; left:50%; top:50%; width:14cqw; height:14cqw; margin-left:-7cqw; margin-top:-7cqw; border-radius:50%; border:0.3cqw solid ${theme.primary}; box-shadow:0 0 8cqw ${theme.primary}; pointer-events:none; }
  .kf-flash { position:absolute; inset:0; pointer-events:none; background:radial-gradient(circle at 50% 50%, #fff, ${theme.primary} 30%, transparent 70%); mix-blend-mode:screen; }
  #caps { position:absolute; inset:0; display:flex; justify-content:center; align-items:flex-end; padding-bottom:${portrait ? "16%" : "7%"}; z-index:60; pointer-events:none; }
  #cap-pill { max-width:82%; height:fit-content; flex:0 0 auto; text-align:center; padding:1.4cqw 3cqw; opacity:0; border-radius:2cqw; background:rgba(6,8,16,0.72); border:1px solid ${theme.border}; backdrop-filter:blur(8px); }
  #cap-text { font-family:${theme.bodyStack}; font-weight:600; font-size:2.6cqw; line-height:1.35; color:${theme.text}; }`;
}

// ---- MAIN --------------------------------------------------------------------
function buildComposition({ storyboard, dims, framePack, captionCues, assets, brandSkin = null, localized = null } = {}) {
  const theme = cosmicTheme(brandSkin);
  const S = localized ? { ...STRINGS, ...localized } : STRINGS;
  const sb = storyboard || {};
  const W = (dims && dims.width) || 1080, H = (dims && dims.height) || 1920;
  const portrait = W < H;
  const scenes = Array.isArray(sb.scenes) && sb.scenes.length
    ? sb.scenes.slice(0, 12)
    : [{ id: "s1", start: 0, duration: 5, kind: "hook", headline: sb.title || "KEYFRAME" }];
  const D = r(sb.durationSec || scenes.reduce((a, s) => Math.max(a, (Number(s.start) || 0) + (Number(s.duration) || 0)), 0) || 12);
  const seed = seedFrom(sb.title || (scenes[0] && scenes[0].headline) || "kinetic");

  // ---- Assets: distribute real screenshots across DISPLAY-CAPABLE scenes -------
  // A screenshot must NEVER be stranded on a scene that can't show it (hook / cta /
  // quote). The Creative Director's per-asset `sceneId` is only a HINT: we honor it
  // when that scene can display an image, and otherwise redistribute the shot to the
  // least-loaded content scene — so every usable screenshot actually appears, no matter
  // how the CD bound them or what the storyboard's scene kinds are. The logo is reserved
  // for the CTA mark (never a wall panel). This is the fix for "no images in the video".
  const logo = logoAssetOf(assets);
  const shots = (Array.isArray(assets) ? assets : []).filter(screenOk)
    .sort((a, b) => (Number(b.cdScore) || 0) - (Number(a.cdScore) || 0));
  const baseArch = scenes.map((scene, i) => archetypeFor(scene, i, scenes.length));
  const canShow = (a) => a === "showcase" || a === "discovery" || a === "orbit" || a === "reveal" || a === "statement";
  const displayIdx = scenes.map((_, i) => i).filter((i) => canShow(baseArch[i]));
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
  const bodyParts = [], sceneScripts = [], sceneStarts = [];

  scenes.forEach((scene, i) => {
    const T = r(scene.start != null ? scene.start : scriptStart(i));
    const L = r(scene.duration || 5);
    let arch = baseArch[i];
    let sceneAssets = sceneShots[i];
    // A display-capable scene that received screenshots shows them: 3+ → a floating
    // scatter (discovery); 1–2 → a focused showcase. Scenes with none keep their base form.
    if (canShow(arch) && sceneAssets.length) {
      if (arch === "statement") { sceneAssets = sceneAssets.slice(0, 1); }   // quote keeps its identity + one grounding shot
      else if (sceneAssets.length >= 3) { arch = "discovery"; sceneAssets = sceneAssets.slice(0, 5); }
      else { arch = "showcase"; sceneAssets = sceneAssets.slice(0, portrait ? 2 : 3); }
    }
    const ctx = { id: `s${i + 1}`, T, L, E: r(T + L), i, isLast: i === scenes.length - 1, track: 2 + i, theme, S, W, H, portrait };
    const built = (BUILDERS[arch] || bOrbit)(scene, ctx, arch === "cta" ? logo : sceneAssets);
    bodyParts.push(built.html);
    sceneStarts.push(T);
    sceneScripts.push(built.s.filter(Boolean).join("\n  "));
    if (!ctx.isLast) sceneScripts.push(`kill("#${ctx.id}",${r(T + L)});`);
  });

  const cues = (Array.isArray(captionCues) ? captionCues : [])
    .filter((c) => c && c.text != null)
    .map((c) => [r(c.start != null ? c.start : c.startSec || 0), r(c.end != null ? c.end : (c.start || 0) + 2), String(c.text)]);

  const cosmos = cosmosClip(theme, { width: W, height: H }, D, seed);
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
    if(window.KF_COSMOS)window.KF_COSMOS(now); // drive the cosmos off the deterministic timeline (live preview)
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
    cosmos.html,
    bodyParts.join("\n"),
    grainClip(D),
    caps,
    `</div>`,
    `<script>`, cosmos.script, `</script>`,
    `<script>`, script, `</script>`,
    `</body>`, `</html>`,
  ].join("\n");

  const metaJson = JSON.stringify({ compositionId: "vid", width: W, height: H, fps: (dims && dims.fps) || 30, duration: D });
  // resolvedBrand echoes the accents the film actually wore (or null when no brand was
  // applied), so graph.persistWornBrand discloses the true painted palette.
  return { indexHtml, metaJson, resolvedBrand: theme.resolvedBrand };
}

module.exports = { buildComposition, STRINGS };
