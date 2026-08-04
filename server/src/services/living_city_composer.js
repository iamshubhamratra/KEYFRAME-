// LIVING CITY composer — a native GSAP + canvas "neon skyline at night" film.
// The pack `living-city` (manifest renderer:"living-city") routes here from
// attemptLlmComposition, exactly like the product-showcase / kinetic / flagship
// composers.
//
// Ported from the imported OmniMotion/React template ("Living City"). The React
// runtime is replaced by KEYFRAME's HyperFrames contract, but the identity is kept:
//   • a PERSISTENT animated CITY backdrop — a dusk sky gradient, a moon and a parallax
//     starfield, a glowing horizon, two layers of building SILHOUETTES with twinkling
//     lit windows, a road band and drifting traffic light-streaks — painted on ONE
//     <canvas> as a pure function of the renderer's hf-seek time (deterministic; flows
//     continuously across every cut, so scene boundaries frame-match on the living city).
//   • screenshots shown as glowing holographic BILLBOARDS/screens against the skyline;
//     neon signage titles; neon stat numbers; feature billboards; and a logo-reveal CTA.
//
// EVERYTHING is theme-driven: cityTheme(accent) derives the sky glow, the building
// silhouettes, the lit windows, the traffic streaks, the billboard neon, the horizon
// glow and the CTA — so a brand skin recolors the WHOLE city (sky, lights, windows,
// accents), not just the text.
//
// Engineering contract (identical to the other native composers): one paused GSAP
// timeline on window.__timelines["vid"]; direct-child .clip scenes on unique tracks; a
// boundary opacity:0 hard-kill per scene (the City persists behind them); ONE seek-safe
// caption node (#cap-text) driven by a single onUpdate proxy; finite repeats; cqw units +
// container-type:size (portrait-native, 9:16); hidden = opacity:0 only. Portrait is
// detected from dims (W<H); no manifest flag. Deterministic.

const { fontFaceCss, isBundled } = require("../fonts/pack_fonts");
const { varyArchetypes } = require("./motion_planner");
const { isTrustedProminent, isLogo } = require("./asset_priority");
const { logoMark } = require("./logo_render");
const { charSpans, wordCharSpans } = require("./text_fx");
const { resolveBrand } = require("./brand_kit");
const { mediaBoxCqw } = require("./responsive");
const { GSAP_CDN, r, esc, hexToRgb, relLum, longestWord, bullets, logoAssetOf, grainUri } = require("./composer_kit");

// Sora (the template's Google display) is NOT bundled for the CDN-free render — Space
// Grotesk is the bundled geometric display that carries the same neon-sign spirit;
// JetBrains Mono is the bundled prompt/mono face; Inter falls to system-ui.
const DISPLAY = "Space Grotesk";
const MONO = "JetBrains Mono";
const BODY = "Inter";

// The template's default city neon when no brand is applied (cyan).
const DEF_ACCENT = "#22D3EE";
// Fixed dark city grounds (the night). Recolored ONLY by mixing the accent into them.
const BG_DEEP = "#04050C";
const SKY_TOP = "#05060F";
const SKY_MID = "#0A0A1E";  // accent 16% mixed in for the mid sky
const SKY_BOT = "#160A24";  // accent 34% mixed in for the low sky
const FAR_BASE = "#0C0E1E"; // accent 20% mixed in for far buildings
const NEAR = "#080912";     // near buildings (no mix — the dark foreground)
const ROAD_TOP = "#06060E"; // accent 22% mixed in for the road glow
const ROAD_BOT = "#04040A";
const WIN_WARM = "#FFE4A0"; // window base (accent 40% mixed in → lit-window hue)

// ---- helpers -----------------------------------------------------------------
// Linear RGB mix — `ta` is the fraction of colour a (approximates CSS color-mix for canvas).
function mixRgb(a, b, ta) {
  const A = hexToRgb(a), B = hexToRgb(b), t = Math.max(0, Math.min(1, ta));
  return [Math.round(A[0] * t + B[0] * (1 - t)), Math.round(A[1] * t + B[1] * (1 - t)), Math.round(A[2] * t + B[2] * (1 - t))];
}
const rgbStr = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;
function seedFrom(str) { let h = 2166136261; const s = String(str || "city"); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) || 7; }
// finite yoyo repeat count for a segment of `t` seconds at period `c`.
function reps(t, c) { return Math.max(0, Math.floor((Number(t) || 0) / (c || 1)) - 1); }

// ---- theme -------------------------------------------------------------------
// resolveBrand fits the brand accent to the near-black night ground (isDark:true → lifted
// for contrast) and passes the pack accent through untouched when no skin — so a null skin
// renders the exact default city byte-for-byte and resolvedBrand is null (honest
// "unbranded"). When applied, the single accent becomes the brand's and every derived value
// (sky glow, silhouettes, windows, traffic, billboards, CTA) follows, and resolvedBrand
// echoes what was worn.
function cityTheme(brandSkin) {
  const fontFace = (isBundled(DISPLAY) ? fontFaceCss(DISPLAY) : "") + (isBundled(MONO) ? fontFaceCss(MONO) : "");
  let accent = DEF_ACCENT, resolvedBrand = null;
  try {
    const brand = resolveBrand(brandSkin, { ground: BG_DEEP, isDark: true, packAccents: [DEF_ACCENT] });
    if (brand.applied) {
      accent = brand.accent || accent;
      resolvedBrand = {
        ...(brandSkin && typeof brandSkin === "object" ? brandSkin : {}),
        accents: [accent], emphasis: brand.emphasis, adjusted: brand.adjusted,
        dropped: brand.dropped, tier: brand.tier, applied: true,
      };
    }
  } catch { accent = DEF_ACCENT; resolvedBrand = null; }
  const onAccent = relLum(accent) > 0.55 ? "#05060F" : "#04050C";
  return {
    accent, onAccent, bgDeep: BG_DEEP, neon: accent,
    // Sky as three vertical stops (accent mixed into the mid & low sky).
    skyTop: SKY_TOP, skyMid: SKY_MID, skyBot: SKY_BOT,
    farBase: FAR_BASE, near: NEAR, roadTop: ROAD_TOP, roadBot: ROAD_BOT, winWarm: WIN_WARM,
    ink: "#F4F6FF", dim: "rgba(244,246,255,0.66)", faint: "rgba(244,246,255,0.38)",
    holoBg: "#060814",
    neonSoft: `color-mix(in oklab, ${accent} 40%, transparent)`,
    sky: `linear-gradient(180deg, ${SKY_TOP} 0%, color-mix(in oklab, ${accent} 16%, ${SKY_MID}) 55%, color-mix(in oklab, ${accent} 34%, ${SKY_BOT}) 100%)`,
    gradient: `linear-gradient(120deg, ${accent}, color-mix(in oklab, ${accent} 55%, #ffffff))`,
    surface: `color-mix(in oklab, ${accent} 12%, #0a0c18)`,
    border: `color-mix(in oklab, ${accent} 46%, transparent)`,
    line: `color-mix(in oklab, ${accent} 22%, transparent)`,
    displayStack: `'${DISPLAY}', 'Inter', system-ui, sans-serif`,
    monoStack: `'${MONO}', ui-monospace, monospace`,
    bodyStack: `'${BODY}', system-ui, sans-serif`,
    fontFace, resolvedBrand,
  };
}

// ---- fixed copy (localizable) ------------------------------------------------
const STRINGS = {
  openKicker: "The city of creation",
  billboardKicker: "Now generating",
  statsKicker: "By the numbers",
  bulletsKicker: "District tools",
  statementKicker: "The idea",
  ctaKicker: "Ready when you are",
  ctaButton: "Enter the city",
  ctaTagline: "Prompt to video. In seconds.",
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
// The CTA wordmark is laid out as a flex ROW of per-character spans, so it can never
// wrap — it just runs off both edges of the frame. At the pack's fixed 11cqw that
// happens at about nine characters in portrait; the audited CTA read "Download Wispr
// Flow" (19) and lost the "D" and the "w" off-screen. Size it from the character count
// instead, with a floor that keeps it a display line rather than body copy.
//
// 0.62 is the display face's measured advance per character per 1cqw of font-size,
// taken off the rendered frame: "Download Wispr Flow" (19 chars) at the pack's 11cqw
// measured ~130cqw wide against a 92cqw safe column. So the fitting size is
// 92 / (n * 0.62) ≈ 148/n, capped at the pack's own 11cqw for short marks.
function wordmarkSize(word) {
  const n = Math.max(1, String(word || "").length);
  return Math.round(Math.max(4.2, Math.min(11, 148 / n)) * 100) / 100;
}

// Split a headline into neon word spans for the reveal; the last word carries the accent.
function neonWords(id, text) {
  const ws = wordsOf(text).slice(0, 10);
  return ws.map((w, i) =>
    `<span class="lc-nword ${id}-nw${i === ws.length - 1 ? " lc-nlast" : ""}" style="display:inline-block;opacity:0;margin:0 0.22em 0.08em 0;">${esc(w)}</span>`
  ).join("");
}
// Split a stat line into its number part and its label.
function splitStat(s) {
  const m = String(s || "").match(/^\s*([^A-Za-zÀ-￿]*\d[\d.,]*\s*[%+xX×kKmMbB$€£]*)\s*(.*)$/);
  if (m && m[1].trim()) return [m[1].trim(), m[2].trim()];
  return [String(s || ""), ""];
}

// ---- asset gate + holographic BILLBOARD frame --------------------------------
function screenOk(a) {
  if (!a || !a.path) return false;
  if (isLogo(a)) return false; // the logo is CTA / key-moment material, not a billboard plate
  if (a.type === "video" || /\.(mp4|webm|mov)($|\?)/i.test(a.path)) return false;
  if (/\.svg($|\?)/i.test(a.path)) return false;
  return isTrustedProminent(a) || a.cdProminence === "hero" || a.cdProminence === "support";
}

// A glowing holographic billboard holding a real screenshot — or, with no asset, an
// intentional branded placeholder (neon gradient wash + holo grid + glowing node) so an
// empty slot still reads as designed, never blank. Absolutely filled; the caller sizes it.
function holoFrame(theme, asset, radius) {
  const inner = asset && asset.path
    ? `<img src="${esc(asset.path)}" alt="${esc(asset.alt || "")}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;">`
    : `<div style="position:absolute;inset:0;background:${theme.gradient};opacity:0.30;"></div>` +
      `<div style="position:absolute;inset:0;background-image:linear-gradient(${theme.line} 1px,transparent 1px),linear-gradient(90deg,${theme.line} 1px,transparent 1px);background-size:14% 10%;opacity:0.55;"></div>` +
      `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;"><div style="width:16%;aspect-ratio:1;border-radius:50%;background:${theme.gradient};box-shadow:0 0 4cqw ${theme.neon};opacity:0.9;"></div></div>`;
  return `<div class="lc-holo" style="position:absolute;inset:0;border-radius:${radius || "2cqw"};overflow:hidden;background:${theme.holoBg};border:0.3cqw solid ${theme.neon};box-shadow:0 0 3cqw ${theme.neon}, inset 0 0 3cqw ${theme.neonSoft};">
    ${inner}
    <div style="position:absolute;left:0;right:0;top:0;height:30%;background:linear-gradient(${theme.neonSoft},transparent);mix-blend-mode:screen;pointer-events:none;"></div>
    <div style="position:absolute;left:0;right:0;top:50%;height:0.3cqw;background:${theme.neon};opacity:0.4;pointer-events:none;"></div>
  </div>`;
}
// Portrait screenshots want a tall billboard; wide screenshots a shorter one.
function frameHmul(asset) {
  const ratio = Number(asset && asset.ratio) || (asset && asset.width && asset.height ? asset.width / asset.height : 0);
  if (ratio && ratio < 0.9) return 1.4;   // phone / portrait shot
  if (ratio && ratio > 1.6) return 0.6;   // wide desktop / dashboard
  return 0.82;                            // square-ish default
}
const assetRatio = (a) => Number(a && a.ratio) || (a && a.width && a.height ? a.width / a.height : 0) || 1.6;

// The billboard's real size, fitted to BOTH the width and height budgets of the
// actual canvas (see responsive.mediaBoxCqw). The old `w = portrait ? 74 : 56` with
// a ratio-derived height gave a 16:9 screenshot 25% of a 9:16 frame's height and left
// the rest empty — the single biggest cause of the "large empty space" defect.
function plate(ctx, asset) {
  const { dims } = ctx;
  if (!dims || !dims.width || !dims.height) {
    const w = ctx.portrait ? 74 : 56;
    return { w, h: r(w * frameHmul(asset)), frameH: ctx.portrait ? 177.8 : 56.25 };
  }
  return mediaBoxCqw(dims.width, dims.height, assetRatio(asset));
}

// SUPPORTING COPY. The storyboard hands every scene a headline plus subtext and the
// rest of its onScreenText, and the script model reliably fills all of them — the
// audited film's scenes each carried 2–3 lines. The billboard/open builders rendered
// only the headline and dropped the rest on the floor, which is why scenes read as a
// picture floating in the dark with two words under it. This renders what the script
// already wrote.
function supportCopy(scene, id, theme, skipFirst) {
  const lines = [];
  const ost = Array.isArray(scene.onScreenText) ? scene.onScreenText.filter(Boolean).map(String) : [];
  const head = String(scene.headline || scene.title || "").trim().toLowerCase();
  for (const t of ost) {
    const s = String(t).trim();
    if (!s || s.toLowerCase() === head) continue;
    if (skipFirst && lines.length === 0 && ost.indexOf(t) === 0) continue;
    lines.push(s);
  }
  if (!lines.length && scene.subtext) lines.push(String(scene.subtext));
  if (!lines.length) return { html: "", targets: null };
  const html = `<div style="display:flex;flex-direction:column;gap:1.6cqw;align-items:center;margin-top:2.6cqw;">${
    lines.slice(0, 3).map((t, i) => i === 0
      ? `<div class="lc-body ${id}-sup" style="opacity:0;text-align:center;max-width:82%;font-size:3.4cqw;">${esc(t)}</div>`
      : `<div class="lc-chip ${id}-sup" style="opacity:0;"><span class="lc-dot" style="background:${theme.neon};box-shadow:0 0 1.2cqw ${theme.neon};"></span>${esc(t)}</div>`
    ).join("")
  }</div>`;
  return { html, targets: `.${id}-sup` };
}

// ---- scene clip open ---------------------------------------------------------
function open(id, ctx) { return `<div class="clip lc-scene" id="${id}" data-start="${ctx.T}" data-duration="${r(ctx.L)}" data-track-index="${ctx.track}" style="opacity:0;">`; }

// ---- archetype selection -----------------------------------------------------
function archetypeFor(scene, i, total) {
  const k = String(scene.kind || "").toLowerCase();
  const p = String(scene.purpose || "").toLowerCase();
  if (i === 0 || k === "hook" || k === "title" || /hook|intro|open/.test(p)) return "open";
  if (i === total - 1 || k === "cta" || /cta|close|sign\s*up|subscribe|download|get\s*started/.test(p)) return "cta";
  if (k === "quote" || /quote|testimonial|manifesto/.test(p)) return "statement";
  if (k === "stat" || k === "chart" || k === "countdown" || (pickNumber(scene) && /proof|result|metric|stat|number/.test(p + k))) return "stats";
  if (bullets(scene, 2).length >= 2) return "bullets";
  return "billboard";
}

// ---- scene builders ((scene, ctx, assets) -> {html, s}) ----------------------

// SCENE — OPEN: the skyline glows; a neon sign title and a mono subtitle rise over the
// city. Establishing energy.
function bOpen(scene, ctx, sceneAssets) {
  const { id, T, L, theme, S, portrait } = ctx;
  const kick = esc(scene.kicker || S.openKicker);
  const title = scene.headline || scene.title || "";
  // When a hero shot is pinned to the opener, it rises as a glowing billboard under the
  // title (its own entrance + float); with NO asset the title breathes as before.
  const asset = (sceneAssets && sceneAssets[0]) || null;
  // The opener carries a big title, so its plate takes a smaller share of the column
  // than the billboard's — but it is still fitted to the real canvas rather than a
  // fixed cqw width whose height nobody checked.
  const full = plate(ctx, asset);
  const box = { w: r(full.w * 0.78), h: r(full.h * 0.78) };
  const sup = supportCopy(scene, id, theme, true);
  const html = `${open(id, ctx)}<div class="lc-safe">
    <div class="lc-neon lc-title ${id}-title" style="opacity:0;text-align:center;font-size:${r(headlineSize(title, 13))}cqw;">${esc(title)}</div>
    <div class="lc-kicker ${id}-kick" style="opacity:0;margin-top:3.4cqw;">${kick}</div>${asset ? `
    <div class="${id}-holo" style="opacity:0;position:relative;width:${box.w}cqw;height:${box.h}cqw;margin-top:4.4cqw;">${holoFrame(theme, asset, "2cqw")}</div>` : ""}
    ${sup.html}
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.4},${T});`,
    `tl.fromTo(".${id}-title",{opacity:0,y:34,scale:0.94},{opacity:1,y:0,scale:1,duration:0.75,ease:"power3.out"},${r(T + 0.3)});`,
    `tl.fromTo(".${id}-kick",{opacity:0,y:16},{opacity:1,y:0,duration:0.55,ease:"power2.out"},${r(T + 0.85)});`,
    asset ? `tl.fromTo(".${id}-holo",{opacity:0,y:70,scale:0.88},{opacity:1,y:0,scale:1,duration:0.8,ease:"power3.out"},${r(T + 1.05)});` : "",
    asset ? `tl.to(".${id}-holo",{y:"-=1.4cqw",duration:2,ease:"sine.inOut",yoyo:true,repeat:${reps(L - 1.9, 2)},overwrite:"auto"},${r(T + 1.9)});` : "",
    asset ? "" : `tl.to(".${id}-title",{scale:1.02,duration:${r(Math.max(1.6, L - 1.6))},ease:"sine.inOut",yoyo:true,repeat:1,transformOrigin:"center center"},${r(T + 1.2)});`,
    sup.targets ? `tl.fromTo("${sup.targets}",{opacity:0,y:16},{opacity:1,y:0,duration:0.5,ease:"power2.out",stagger:0.12},${r(T + 1.5)});` : "",
  ].filter(Boolean);
  return { html, s };
}

// SCENE — BILLBOARD: a big glowing holographic billboard on a support pole holds a real
// screenshot (or a branded placeholder), a mono kicker glows above and a neon caption
// lands below. The screenshot moment (1 shot).
function bBillboard(scene, ctx, sceneAssets) {
  const { id, T, L, theme, S } = ctx;
  const kick = esc(scene.kicker || S.billboardKicker);
  const asset = (sceneAssets && sceneAssets[0]) || null;
  const box = plate(ctx, asset);
  // The support pole only earns its height when there is room left over; in portrait
  // with a properly-sized plate it would otherwise push the caption off the safe area.
  const poleH = box.h < box.frameH * 0.42 ? 7 : 3;
  const sup = supportCopy(scene, id, theme, true);
  const html = `${open(id, ctx)}<div class="lc-safe" style="justify-content:center;">
    <div class="lc-kicker ${id}-kick" style="opacity:0;margin-bottom:3.4cqw;">▸ ${kick}</div>
    <div class="${id}-holo" style="opacity:0;width:${box.w}cqw;">
      <div style="position:relative;width:100%;height:${box.h}cqw;">${holoFrame(theme, asset, "2cqw")}</div>
      <div aria-hidden="true" style="width:0.9cqw;height:${poleH}cqw;margin:0 auto;background:linear-gradient(${theme.near},${theme.roadBot});box-shadow:0 0 1cqw ${theme.neonSoft};"></div>
    </div>
    ${scene.headline ? `<div class="lc-neon lc-h1 ${id}-cap" style="opacity:0;margin-top:2.4cqw;text-align:center;font-size:${r(headlineSize(scene.headline, 7))}cqw;">${neonWords(id, scene.headline)}</div>` : ""}
    ${sup.html}
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.35},${T});`,
    `tl.fromTo(".${id}-kick",{opacity:0,y:-14},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 0.2)});`,
    `tl.fromTo(".${id}-holo",{opacity:0,y:70,scale:0.88},{opacity:1,y:0,scale:1,duration:0.8,ease:"power3.out"},${r(T + 0.4)});`,
    `tl.to(".${id}-holo",{y:"-=1.6cqw",duration:2,ease:"sine.inOut",yoyo:true,repeat:${reps(L - 1.4, 2)},overwrite:"auto"},${r(T + 1.4)});`,
    scene.headline ? `tl.fromTo(".${id}-nw",{opacity:0,y:24},{opacity:1,y:0,duration:0.5,ease:"back.out(1.6)",stagger:0.07},${r(T + 1.05)});` : "",
    sup.targets ? `tl.fromTo("${sup.targets}",{opacity:0,y:18},{opacity:1,y:0,duration:0.5,ease:"power2.out",stagger:0.12},${r(T + 1.4)});` : "",
  ].filter(Boolean);
  return { html, s };
}

// SCENE — STATS: big neon numbers glow over the skyline like a district ticker. Up to three
// stat cells (from onScreenText) or one hero number. For stat / metric / countdown scenes.
function bStats(scene, ctx, sceneAssets) {
  const { id, T, L, theme, S, portrait } = ctx;
  const kick = esc(scene.kicker || S.statsKicker);
  const head = scene.headline || scene.title || "";
  const asset = (sceneAssets && sceneAssets[0]) || null;
  let items = Array.isArray(scene.onScreenText) ? scene.onScreenText.filter(Boolean).map(String).slice(0, 3) : [];
  if (!items.length) items = [String(scene.emphasis || head || "")];
  const cells = items.map((it, i) => {
    const [num, label] = splitStat(it);
    return `<div class="${id}-stat" style="opacity:0;text-align:center;">
      <div class="lc-neon lc-stat" style="font-size:${r(items.length >= 3 ? 12 : items.length === 2 ? 15 : 18)}cqw;">${esc(num)}</div>
      ${label ? `<div class="lc-body" style="margin-top:1.4cqw;">${esc(label)}</div>` : ""}
    </div>`;
  }).join("");
  const cellsRow = `<div style="display:flex;gap:${items.length >= 3 ? "5cqw" : "9cqw"};justify-content:center;align-items:flex-start;flex-wrap:wrap;">${cells}</div>`;
  // With a dashboard/proof shot assigned, the number(s) read as a LIVE district ticker over
  // the real screenshot: a full holo billboard behind a scrim with the neon number(s) in
  // front — proof scene shows the dashboard AND the metric. No asset → the numbers alone.
  const box = plate(ctx, asset);
  const body = asset
    ? `<div class="${id}-holo" style="opacity:0;position:relative;width:${box.w}cqw;height:${box.h}cqw;">
      <div style="position:absolute;inset:0;">${holoFrame(theme, asset, "2cqw")}</div>
      <div aria-hidden="true" style="position:absolute;inset:0;background:rgba(4,5,12,0.46);border-radius:2cqw;pointer-events:none;"></div>
      <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:6cqw;">${cellsRow}</div>
    </div>`
    : cellsRow;
  const html = `${open(id, ctx)}<div class="lc-safe">
    <div class="lc-kicker ${id}-kick" style="opacity:0;margin-bottom:1cqw;">${kick}</div>
    ${head && items.length > 1 ? `<div class="lc-h1 ${id}-head" style="opacity:0;text-align:center;font-size:${r(headlineSize(head, 6))}cqw;margin-bottom:4cqw;">${esc(head)}</div>` : ""}
    ${body}
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.35},${T});`,
    `tl.fromTo(".${id}-kick",{opacity:0,y:-14},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 0.2)});`,
    head && items.length > 1 ? `tl.fromTo(".${id}-head",{opacity:0,y:18},{opacity:1,y:0,duration:0.55,ease:"power2.out"},${r(T + 0.35)});` : "",
    asset ? `tl.fromTo(".${id}-holo",{opacity:0,y:60,scale:0.9},{opacity:1,y:0,scale:1,duration:0.8,ease:"power3.out"},${r(T + 0.4)});` : "",
    asset ? `tl.to(".${id}-holo",{y:"-=1.4cqw",duration:2,ease:"sine.inOut",yoyo:true,repeat:${reps(L - 1.6, 2)},overwrite:"auto"},${r(T + 1.6)});` : "",
    `tl.fromTo(".${id}-stat",{opacity:0,y:40,scale:0.7},{opacity:1,y:0,scale:1,duration:0.7,ease:"back.out(1.5)",stagger:0.16},${r(T + 0.55)});`,
    asset ? "" : `tl.to(".${id}-stat",{y:"-=0.9cqw",duration:2,ease:"sine.inOut",yoyo:true,repeat:${reps(L - 1.5, 2)},stagger:0.1,overwrite:"auto"},${r(T + 1.5)});`,
  ].filter(Boolean);
  return { html, s };
}

// SCENE — BULLETS: a neon headline over a row of holographic feature billboards (real
// screenshots when present) with numbered neon labels — or, with no assets, a rising stack
// of neon feature rows. "District tools."
function bBullets(scene, ctx, sceneAssets) {
  const { id, T, L, theme, S } = ctx;
  const kick = esc(scene.kicker || S.bulletsKicker);
  const head = scene.headline || scene.title || "";
  const feats = bullets(scene, 3);
  const shots = (sceneAssets || []).slice(0, 3);
  let bodyHtml, targets;
  if (shots.length) {
    // A single shot gets the full fitted plate rather than the 52cqw a 3-up row would
    // use — with one billboard there is no row to overflow.
    const pw = shots.length >= 3 ? "27cqw" : shots.length === 2 ? "34cqw" : `${plate(ctx, shots[0]).w}cqw`;
    bodyHtml = `<div style="display:flex;gap:3cqw;justify-content:center;align-items:flex-start;width:100%;">${shots.map((a, i) => {
      const hcqw = parseFloat(pw) * frameHmul(a) * 1.15;
      const label = (Array.isArray(scene.onScreenText) && scene.onScreenText[i]) || feats[i] || "";
      return `<div class="${id}-fi" style="opacity:0;width:${pw};text-align:center;">
        <div style="position:relative;width:100%;height:${r(hcqw)}cqw;">${holoFrame(theme, a, "1.6cqw")}</div>
        <div style="font-family:${theme.monoStack};font-size:2cqw;color:${theme.neon};letter-spacing:0.16em;margin-top:2.2cqw;">0${i + 1}</div>
        ${label ? `<div style="font-family:${theme.displayStack};font-weight:700;font-size:2.8cqw;color:${theme.ink};line-height:1.15;margin-top:0.6cqw;">${esc(label)}</div>` : ""}
      </div>`;
    }).join("")}</div>`;
    // Labels are mapped 1:1 onto plates, so a scene with three feature lines and one
    // screenshot rendered ONE label and silently dropped the other two — the film lost
    // copy the script had written. Any leftover lines continue as neon chips under the
    // row, which is the same treatment the no-asset branch below already gives them.
    const rest = feats.slice(shots.length);
    if (rest.length) {
      bodyHtml += `<div style="display:flex;flex-direction:column;gap:1.8cqw;align-items:center;margin-top:3cqw;">${rest.map((f) =>
        `<div class="lc-chip ${id}-fi" style="opacity:0;"><span class="lc-dot" style="background:${theme.neon};box-shadow:0 0 1.2cqw ${theme.neon};"></span>${esc(f)}</div>`
      ).join("")}</div>`;
    }
    targets = `.${id}-fi`;
  } else {
    const rows = (feats.length ? feats : [head]).slice(0, 5);
    bodyHtml = `<div style="display:flex;flex-direction:column;gap:2cqw;align-items:center;">${rows.map((f) =>
      `<div class="lc-chip ${id}-fi" style="opacity:0;"><span class="lc-dot" style="background:${theme.neon};box-shadow:0 0 1.2cqw ${theme.neon};"></span>${esc(f)}</div>`
    ).join("")}</div>`;
    targets = `.${id}-fi`;
  }
  const html = `${open(id, ctx)}<div class="lc-safe">
    <div class="lc-kicker ${id}-kick" style="opacity:0;margin-bottom:2.4cqw;">${kick}</div>
    ${head ? `<div class="lc-neon lc-h1 ${id}-head" style="opacity:0;text-align:center;font-size:${r(headlineSize(head, 7))}cqw;margin-bottom:5cqw;">${esc(head)}</div>` : ""}
    ${bodyHtml}
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.35},${T});`,
    `tl.fromTo(".${id}-kick",{opacity:0,y:-16},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 0.2)});`,
    head ? `tl.fromTo(".${id}-head",{opacity:0,y:22},{opacity:1,y:0,duration:0.55,ease:"power2.out"},${r(T + 0.35)});` : "",
    `tl.fromTo("${targets}",{opacity:0,y:60,scale:0.86},{opacity:1,y:0,scale:1,duration:0.65,ease:"power3.out",stagger:0.14},${r(T + 0.6)});`,
    `tl.to("${targets}",{y:"-=1.2cqw",duration:2,ease:"sine.inOut",yoyo:true,repeat:${reps(L - 1.5, 2)},stagger:0.1,overwrite:"auto"},${r(T + 1.5)});`,
  ].filter(Boolean);
  return { html, s };
}

// SCENE — STATEMENT: a single centered neon statement breathes over the skyline, with an
// optional subtitle. For quotes / manifestos.
function bStatement(scene, ctx, sceneAssets) {
  const { id, T, L, theme, portrait } = ctx;
  const asset = (sceneAssets && sceneAssets[0]) || null;
  // A supporting screenshot backs the quote as a dimmed holo billboard, the neon statement
  // glowing over it; with NO asset the statement breathes alone (byte-identical).
  const stTxt = `<div class="lc-neon lc-title ${id}-st" style="text-align:center;font-size:${r(headlineSize(scene.headline, asset ? 9 : 12))}cqw;opacity:0;">${esc(scene.headline || scene.title || "")}</div>
    ${scene.subtext ? `<div class="lc-body ${id}-sub" style="opacity:0;margin-top:3cqw;max-width:80%;text-align:center;">${esc(scene.subtext)}</div>` : ""}`;
  const box = plate(ctx, asset);
  const body = asset
    ? `<div class="${id}-holo" style="opacity:0;position:relative;width:${box.w}cqw;height:${box.h}cqw;">
      <div style="position:absolute;inset:0;">${holoFrame(theme, asset, "2cqw")}</div>
      <div aria-hidden="true" style="position:absolute;inset:0;background:rgba(4,5,12,0.52);border-radius:2cqw;pointer-events:none;"></div>
      <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:7cqw;">${stTxt}</div>
    </div>`
    : stTxt;
  const html = `${open(id, ctx)}<div class="lc-safe">
    ${body}
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.4},${T});`,
    asset ? `tl.fromTo(".${id}-holo",{opacity:0,y:56,scale:0.9},{opacity:1,y:0,scale:1,duration:0.8,ease:"power3.out"},${r(T + 0.3)});` : "",
    asset ? `tl.to(".${id}-holo",{y:"-=1.2cqw",duration:2,ease:"sine.inOut",yoyo:true,repeat:${reps(L - 1.6, 2)},overwrite:"auto"},${r(T + 1.6)});` : "",
    `tl.fromTo(".${id}-st",{opacity:0,scale:0.82,filter:"blur(10px)"},{opacity:1,scale:1,filter:"blur(0px)",duration:0.8,ease:"power3.out"},${r(T + 0.3)});`,
    scene.subtext ? `tl.fromTo(".${id}-sub",{opacity:0,y:18},{opacity:1,y:0,duration:0.55,ease:"power2.out"},${r(T + 1.0)});` : "",
    asset ? "" : `tl.to(".${id}-st",{scale:1.02,duration:${r(Math.max(1.6, L - 1.6))},ease:"sine.inOut",yoyo:true,repeat:1,transformOrigin:"center center"},${r(T + 1.1)});`,
  ].filter(Boolean);
  return { html, s };
}

// SCENE — CTA: the logo mark lights up (the user's logo when uploaded, else a built play
// glyph), the neon wordmark types in char-by-char, a neon button pulses and a url settles.
function bCta(scene, ctx, logo) {
  const { id, T, L, theme, S } = ctx;
  const word = String(scene.headline || scene.title || "KEYFRAME").slice(0, 20);
  const btn = esc(String(scene.emphasis || S.ctaButton).slice(0, 24));
  const tagline = esc(String(scene.subtext || S.ctaTagline).slice(0, 60));
  const url = esc(String(S.ctaUrl).toUpperCase());
  const mark = logo && logo.path
    ? logoMark(logo, { sizeCqw: 22, ground: theme.bgDeep, glow: theme.neon, escape: esc })
    : `<div style="position:relative;width:20cqw;height:20cqw;">
        <div style="position:absolute;inset:8%;border:0.4cqw solid ${theme.border};border-radius:26%;"></div>
        <div style="position:absolute;inset:0;border-radius:26%;background:${theme.gradient};box-shadow:0 0 6cqw ${theme.neon};display:flex;align-items:center;justify-content:center;">
          <div style="width:0;height:0;border-top:3.4cqw solid transparent;border-bottom:3.4cqw solid transparent;border-left:5.4cqw solid ${theme.onAccent};margin-left:1.2cqw;"></div>
        </div>
      </div>`;
  const chars = wordCharSpans(word, `${id}-ch`);
  const html = `${open(id, ctx)}<div class="lc-safe">
    <div class="lc-kicker ${id}-kick" style="opacity:0;margin-bottom:2.4cqw;">${esc(scene.kicker || S.ctaKicker)}</div>
    <div class="${id}-mark" style="opacity:0;">${mark}</div>
    <div class="lc-neon lc-wordmark" style="margin-top:3.4cqw;font-size:${wordmarkSize(word)}cqw;">${chars}</div>
    <div class="lc-body ${id}-tag" style="opacity:0;margin-top:1.8cqw;">${tagline}</div>
    <div class="lc-btn ${id}-btn" style="opacity:0;margin-top:3.6cqw;color:${theme.onAccent};">${btn} →</div>
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

const BUILDERS = { open: bOpen, billboard: bBillboard, stats: bStats, bullets: bBullets, statement: bStatement, cta: bCta };

// ---- persistent CITY canvas (hf-seek) ----------------------------------------
// One canvas painted purely from the renderer's hf-seek time: the dusk sky, a moon, a
// parallax starfield, a horizon glow, two layers of building silhouettes with twinkling
// lit windows, the road band and drifting traffic streaks. Colored ONLY by mixing
// theme.accent into the fixed night grounds, so a brand skin recolors the whole city. Live
// preview drives it off the timeline; render is hf-seek only.
function cityClip(theme, dims, D, seed) {
  const W = dims.width, H = dims.height;
  const [ar, ag, ab] = hexToRgb(theme.accent);
  const skyT = rgbStr(hexToRgb(theme.skyTop));
  const skyM = rgbStr(mixRgb(theme.accent, theme.skyMid, 0.16));
  const skyB = rgbStr(mixRgb(theme.accent, theme.skyBot, 0.34));
  const farC = rgbStr(mixRgb(theme.accent, theme.farBase, 0.20));
  const nearC = rgbStr(hexToRgb(theme.near));
  const roadT = rgbStr(mixRgb(theme.accent, theme.roadTop, 0.22));
  const roadB = rgbStr(hexToRgb(theme.roadBot));
  const winC = rgbStr(mixRgb(theme.accent, theme.winWarm, 0.40));
  const [dr, dg, db] = hexToRgb(theme.bgDeep);
  const html = `<div id="lc-city-clip" class="clip" data-start="0" data-duration="${D}" data-track-index="0" data-layout-allow-occlusion style="background:${theme.bgDeep};">
    <canvas id="lc-city" width="${W}" height="${H}" style="position:absolute;inset:0;width:100%;height:100%;"></canvas>
  </div>`;
  const script = `(function(){
  var cv=document.getElementById("lc-city");if(!cv||!cv.getContext)return;var cx=cv.getContext("2d");if(!cx)return;
  var W=${W},H=${H},GY=H*0.86;
  function A2(a){return "rgba(${ar},${ag},${ab},"+a+")";}
  var GD="rgba(${dr},${dg},${db},";
  var WIN="${winC}";
  var sd=${seed >>> 0};function rnd(){sd=(sd*1664525+1013904223)>>>0;return sd/4294967296;}
  function cl(v,a,b){return v<a?a:(v>b?b:v);}
  // deterministic building layers (x, width, height, base-lit, phase) — like the source hash layers.
  function mkLayer(n){var arr=[],x=-0.04;for(var i=0;i<n;i++){var w=0.05+rnd()*0.07;arr.push({x:x,w:w,h:0.3+rnd()*0.62,lit:0.4+rnd()*0.6,sp:rnd()});x+=w+0.012+rnd()*0.02;}return arr;}
  var FAR=mkLayer(16),NEAR=mkLayer(12);
  var NS=Math.round(40*(W*H)/(1080*1920)),ST=[];
  for(var i=0;i<NS;i++){ST.push({x:rnd(),y:rnd()*0.5,s:1+rnd()*2,ph:rnd()*6.28});}
  var TR=[];for(var i=0;i<14;i++){TR.push({seed:rnd(),dir:i%2?1:-1,lane:i%3,warm:i%2===0,sp:0.05+rnd()*0.09});}
  function bld(layer,color,baseY,maxH,cell,flick,t,ga){
    cx.save();cx.globalAlpha=ga;
    for(var i=0;i<layer.length;i++){var b=layer[i];var bh=b.h*maxH;var bx=b.x*W;var bw=b.w*W;var by=baseY-bh;
      cx.fillStyle=color;cx.fillRect(bx,by,bw,bh);
      cx.save();cx.shadowColor=A2(1);cx.shadowBlur=8;cx.fillStyle=A2(0.85);cx.fillRect(bx,by,bw,2);cx.restore();
      var lit=cl(b.lit+flick*Math.sin(t*2+b.sp*20),0,1);
      cx.fillStyle=WIN;
      for(var yy=by+cell*0.6; yy<by+bh-cell*0.3; yy+=cell){
        for(var xx=bx+cell*0.5; xx<bx+bw-cell*0.3; xx+=cell){
          var hh=Math.sin((xx*0.7+yy*1.3+b.sp*40))*43758.5;hh=hh-Math.floor(hh);
          cx.globalAlpha=ga*0.5*lit*(0.35+0.65*hh);
          cx.fillRect(xx,yy,cell*0.34,cell*0.5);
        }
      }
      cx.globalAlpha=ga;
    }
    cx.restore();
  }
  function draw(t){
    // sky
    var sg=cx.createLinearGradient(0,0,0,H);sg.addColorStop(0,"${skyT}");sg.addColorStop(0.55,"${skyM}");sg.addColorStop(1,"${skyB}");cx.fillStyle=sg;cx.fillRect(0,0,W,H);
    // moon
    var mx=W*0.74,my=H*0.12,mr=W*0.08;var mg=cx.createRadialGradient(mx-mr*0.25,my-mr*0.25,0,mx,my,mr);mg.addColorStop(0,"#ffffff");mg.addColorStop(1,A2(0.9));
    cx.save();cx.globalAlpha=0.9;cx.shadowColor=A2(1);cx.shadowBlur=60;cx.fillStyle=mg;cx.beginPath();cx.arc(mx,my,mr,0,6.283);cx.fill();cx.restore();
    // stars (twinkle)
    for(var i=0;i<ST.length;i++){var s=ST[i];cx.globalAlpha=0.25+0.5*(0.5+0.5*Math.sin(t*2+s.ph));cx.fillStyle="#ffffff";cx.beginPath();cx.arc(s.x*W,s.y*H,s.s,0,6.283);cx.fill();}
    cx.globalAlpha=1;
    // horizon glow
    var hy=GY-H*0.2;var hg=cx.createRadialGradient(W*0.5,GY,0,W*0.5,GY,W*0.7);hg.addColorStop(0,A2(0.4));hg.addColorStop(0.6,A2(0));cx.fillStyle=hg;cx.fillRect(0,hy,W,GY-hy+H*0.05);
    // far building layer (softer)
    bld(FAR,"${farC}",GY-H*0.02,H*0.42,W*0.024,0.18,t,0.72);
    // near building layer
    bld(NEAR,"${nearC}",GY,H*0.6,W*0.032,0.14,t,1);
    // road band
    var rg=cx.createLinearGradient(0,GY,0,H);rg.addColorStop(0,"${roadT}");rg.addColorStop(1,"${roadB}");cx.fillStyle=rg;cx.fillRect(0,GY,W,H-GY);
    // traffic streaks
    for(var i=0;i<TR.length;i++){var c=TR[i];var u=(t*c.sp+c.seed)%1;var x=c.dir>0?u*W:(1-u)*W;var y=GY+H*0.03+c.lane*H*0.035;var col=c.warm?"#fff6e0":A2(1);
      cx.save();cx.globalAlpha=0.85;cx.shadowColor=col;cx.shadowBlur=10;var lg=cx.createLinearGradient(x-40,0,x+40,0);
      if(c.dir>0){lg.addColorStop(0,"rgba(0,0,0,0)");lg.addColorStop(1,col);}else{lg.addColorStop(0,col);lg.addColorStop(1,"rgba(0,0,0,0)");}
      cx.fillStyle=lg;cx.fillRect(x-40,y,80,3);cx.restore();}
    cx.globalAlpha=1;
    // vignette
    var vg=cx.createRadialGradient(W*0.5,H*0.4,Math.min(W,H)*0.22,W*0.5,H*0.4,Math.max(W,H)*0.8);vg.addColorStop(0,GD+"0)");vg.addColorStop(1,GD+"0.9)");cx.fillStyle=vg;cx.fillRect(0,0,W,H);
  }
  // Painted ONLY from the renderer's hf-seek time — deterministic, seek-exact, capture-safe.
  window.KF_CITY=draw;window.addEventListener("hf-seek",function(e){draw((e.detail&&e.detail.time)||0);});draw(0);
})();`;
  return { html, script };
}

// ---- grain overlay (top layer) -----------------------------------------------
const GRAIN_URI = grainUri(0.9);
function grainClip(D) {
  return `<div id="lc-grain" class="clip" data-start="0" data-duration="${D}" data-track-index="40" data-layout-allow-occlusion style="pointer-events:none;background-image:url('${GRAIN_URI}');background-size:260px 260px;opacity:0.045;mix-blend-mode:overlay;"></div>`;
}

// ---- style -------------------------------------------------------------------
function styleBlock(theme, portrait) {
  const safePad = portrait ? "12% 7% 14%" : "8% 8% 10%";
  return `${theme.fontFace}
  * { box-sizing:border-box; margin:0; padding:0; }
  html, body { width:100%; height:100%; overflow:hidden; background:#000; }
  #root { position:relative; overflow:hidden; isolation:isolate; background:${theme.bgDeep}; container-type:size; color:${theme.ink}; font-family:${theme.bodyStack}; }
  .clip { position:absolute; top:0; left:0; width:100%; height:100%; overflow:hidden; }
  .lc-safe { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:${safePad}; text-align:center; }
  .lc-neon { font-family:${theme.displayStack}; font-weight:800; color:#fff; text-shadow:0 0 1cqw ${theme.neon}, 0 0 3cqw ${theme.neon}, 0 0 6cqw ${theme.neon}; }
  .lc-title { line-height:0.98; letter-spacing:-0.02em; }
  .lc-h1 { line-height:1.04; letter-spacing:-0.02em; font-weight:700; }
  .lc-stat { line-height:0.9; letter-spacing:-0.02em; }
  .lc-nlast { color:${theme.neon}; }
  .lc-kicker { display:inline-flex; align-items:center; gap:0.9cqw; font-family:${theme.monoStack}; font-weight:600; font-size:2cqw; letter-spacing:0.32em; text-transform:uppercase; color:${theme.dim}; }
  .lc-body { font-family:${theme.bodyStack}; font-weight:500; font-size:2.7cqw; line-height:1.42; color:${theme.dim}; }
  .lc-wordmark { display:flex; flex-wrap:wrap; justify-content:center; text-align:center; gap:0 0.26em; max-width:92%; font-size:11cqw; letter-spacing:-0.02em; }
  .lc-nword { will-change:transform,opacity; }
  .lc-chip { display:inline-flex; align-items:center; gap:1.4cqw; padding:1.8cqw 3.4cqw; border-radius:999px; background:rgba(6,8,20,0.55); border:1px solid ${theme.border}; backdrop-filter:blur(6px); font-family:${theme.monoStack}; font-weight:600; font-size:2.7cqw; letter-spacing:0.04em; color:${theme.ink}; white-space:nowrap; box-shadow:0 1.4cqw 5cqw -2cqw ${theme.neon}; will-change:transform,opacity; }
  .lc-dot { width:1.4cqw; height:1.4cqw; border-radius:50%; flex:0 0 auto; }
  .lc-btn { display:inline-flex; align-items:center; gap:1cqw; padding:2.8cqw 6.4cqw; border-radius:12px; background:${theme.neon}; font-family:${theme.displayStack}; font-weight:700; font-size:3.6cqw; letter-spacing:0.02em; box-shadow:0 0 5cqw ${theme.neon}; will-change:transform,opacity; }
  .lc-holo { will-change:transform,opacity; }
  #caps { position:absolute; inset:0; display:flex; justify-content:center; align-items:flex-end; padding-bottom:${portrait ? "16%" : "7%"}; z-index:60; pointer-events:none; }
  #cap-pill { max-width:82%; height:fit-content; flex:0 0 auto; text-align:center; padding:1.4cqw 3cqw; opacity:0; border-radius:2cqw; background:rgba(6,8,16,0.72); border:1px solid ${theme.border}; backdrop-filter:blur(8px); }
  #cap-text { font-family:${theme.bodyStack}; font-weight:600; font-size:2.6cqw; line-height:1.35; color:${theme.ink}; }`;
}

// ---- MAIN --------------------------------------------------------------------
function buildComposition({ storyboard, dims, framePack, captionCues, assets, brandSkin = null, localized = null } = {}) {
  // Portrait drives the headline fill ladder (see headlineSize).
  _portrait = (dims && dims.height > dims.width) || false;
  const theme = cityTheme(brandSkin);
  const S = localized ? { ...STRINGS, ...localized } : STRINGS;
  const sb = storyboard || {};
  const W = (dims && dims.width) || 1080, H = (dims && dims.height) || 1920;
  const portrait = W < H;
  const scenes = Array.isArray(sb.scenes) && sb.scenes.length
    ? sb.scenes.slice(0, 12)
    : [{ id: "s1", start: 0, duration: 5, kind: "hook", headline: sb.title || "KEYFRAME" }];
  const D = r(sb.durationSec || scenes.reduce((a, s) => Math.max(a, (Number(s.start) || 0) + (Number(s.duration) || 0)), 0) || 12);
  const seed = seedFrom(sb.title || (scenes[0] && scenes[0].headline) || "city");

  // ---- Assets: distribute real screenshots across DISPLAY-CAPABLE scenes -------
  // A screenshot must NEVER be stranded on a scene that can't show it (open / stats / cta).
  // The Creative Director's per-asset `sceneId` is a HINT: honored when that scene can
  // display an image, else the shot is redistributed to the least-loaded display scene —
  // so every usable screenshot actually appears as a billboard. The logo is reserved for
  // the CTA mark.
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
  // EVERY content archetype hosts its assigned shot in the city's own holo-billboard
  // language (open/stats/statement/billboard/bullets) — only the pure CTA (logo lockup) is
  // excluded — so a stat/quote/hook scene the CD pinned a screenshot to renders it on the
  // intended scene instead of stranding the sceneId hint on a synthetic graphic.
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
    // A display-capable scene that received screenshots shows them: 3+ → a billboard row
    // (bullets); a bullets scene keeps its labelled holos; else a focused single billboard.
    // Scenes with none keep their base form.
    if (canShow(arch) && sceneAssets.length) {
      // The hook (open), stat (stats) and quote (statement) scenes keep their identity and
      // host ONE shot in-style (number/quote over the billboard); a plain feature with 3+
      // shots becomes a billboard row (bullets); else a focused single billboard.
      if (arch === "open" || arch === "stats" || arch === "statement") { sceneAssets = sceneAssets.slice(0, 1); }
      else if (sceneAssets.length >= 3) { arch = "bullets"; sceneAssets = sceneAssets.slice(0, 3); }
      else if (arch === "bullets") { sceneAssets = sceneAssets.slice(0, 3); }
      else { arch = "billboard"; sceneAssets = sceneAssets.slice(0, 1); }
    }
    const ctx = { id: `s${i + 1}`, T, L, E: r(T + L), i, isLast: i === scenes.length - 1, track: 2 + i, theme, S, W, H, portrait, dims: { width: W, height: H } };
    const built = (BUILDERS[arch] || bBillboard)(scene, ctx, arch === "cta" ? logo : sceneAssets);
    bodyParts.push(built.html);
    sceneScripts.push(built.s.filter(Boolean).join("\n  "));
    if (!ctx.isLast) sceneScripts.push(`kill("#${ctx.id}",${r(T + L)});`);
  });

  const cues = (Array.isArray(captionCues) ? captionCues : [])
    .filter((c) => c && c.text != null)
    .map((c) => [r(c.start != null ? c.start : c.startSec || 0), r(c.end != null ? c.end : (c.start || 0) + 2), String(c.text)]);

  const city = cityClip(theme, { width: W, height: H }, D, seed);
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
    if(window.KF_CITY)window.KF_CITY(now);
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
    city.html,
    bodyParts.join("\n"),
    grainClip(D),
    caps,
    `</div>`,
    `<script>`, city.script, `</script>`,
    `<script>`, script, `</script>`,
    `</body>`, `</html>`,
  ].join("\n");

  const metaJson = JSON.stringify({ compositionId: "vid", width: W, height: H, fps: (dims && dims.fps) || 30, duration: D });
  return { indexHtml, metaJson, resolvedBrand: theme.resolvedBrand };
}

module.exports = { buildComposition, STRINGS };
