// AURORA MOTION composer — a native GSAP + canvas "ambient aurora" film.
// The pack `aurora-motion` (manifest renderer:"aurora-motion") routes here from
// attemptLlmComposition, exactly like the flagship / kinetic / product-showcase /
// blueprint / bloom / bauhaus / terminal / paper-tales composers.
//
// Ported from the imported OmniMotion/React template ("Aurora Motion"). The React
// runtime is replaced by KEYFRAME's HyperFrames contract, but the identity is kept:
//   • a PERSISTENT animated AURORA SKY backdrop — flowing ribbons/curtains of accent
//     light drifting over a dark sky, soft mesh-gradient blooms on lissajous paths and
//     luminous motes — painted on ONE <canvas> as a pure function of the renderer's
//     hf-seek time (deterministic; flows continuously across every cut, so scene
//     boundaries frame-match on pure Aurora).
//   • minimal, elegant kinetic TYPOGRAPHY floating over the light: glass badges, big
//     gradient statements, frosted-glass SCREEN frames that hold real screenshots,
//     glass feature cards and a luminous logo-reveal CTA.
//
// EVERYTHING is theme-driven: auroraTheme(brandSkin) derives the two mesh accents and
// every gradient, glow, glass tint and CTA from them — so a brand skin recolors the
// WHOLE film: the aurora ribbons, the mesh blooms, the background wash and every accent,
// not just the text. The aurora canvas is the signature and it is fully brand-colored.
//
// Engineering contract (identical to the other native composers): one paused GSAP
// timeline on window.__timelines["vid"]; direct-child .clip scenes on unique tracks
// (2+i); a backdrop track 0; a boundary opacity:0 hard-kill per scene (the Aurora
// persists behind them); ONE seek-safe caption node (#cap-text) driven by a single
// onUpdate proxy; finite repeats; cqw units + container-type:size (portrait-native,
// 9:16); hidden = opacity:0 only; all from-states via gsap.fromTo. GSAP animates the
// OUTER element; static transforms live on an INNER wrapper GSAP never touches.
// Portrait is detected from dims (W<H); no manifest flag. Deterministic.

const { fontFaceCss, isBundled } = require("../fonts/pack_fonts");
const { varyArchetypes } = require("./motion_planner");
const { isTrustedProminent, isLogo } = require("./asset_priority");
const { logoMark } = require("./logo_render");
const { plateBox } = require("./responsive");
const { charSpans, wordCharSpans } = require("./text_fx");
const { resolveBrand } = require("./brand_kit");
const { GSAP_CDN, r, esc, hexToRgb, longestWord, bullets, logoAssetOf, grainUri, displayShadow } = require("./composer_kit");

// Sora (the template's Google display face) is NOT bundled for the CDN-free render —
// Space Grotesk is the bundled geometric display that carries the same soft-futuristic
// spirit; JetBrains Mono is the bundled mono face; Inter falls to system-ui.
const DISPLAY = "Space Grotesk";
const MONO = "JetBrains Mono";
const BODY = "Inter";

// The template's default aurora accents when no brand is applied (violet → teal).
const DEF_PRIMARY = "#8B5CF6";
const DEF_SECONDARY = "#2DD4BF";
const BG_DEEP = "#080611";
const BG_TOP = "#0E0A1E";

// ---- helpers -----------------------------------------------------------------
const mix = (a, b, t) => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t));
function seedFrom(str) { let h = 2166136261; const s = String(str || "aurora"); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) || 7; }
// finite yoyo repeat count for a segment of `t` seconds at period `c`.
function reps(t, c) { return Math.max(0, Math.floor((Number(t) || 0) / (c || 1)) - 1); }

// ---- theme -------------------------------------------------------------------
// resolveBrand fits the brand accents to the near-black sky (isDark:true → lifted UP
// for contrast) and passes the pack accents through untouched when no skin — so a null
// skin renders the exact default Aurora byte-for-byte, and resolvedBrand is null (honest
// "unbranded" in the Brand panel). Applied → the two accents become the brand's, every
// derived value (mesh, ribbons, blooms, gradient, glass tint, CTA) follows, and
// resolvedBrand echoes what was worn.
function auroraTheme(brandSkin) {
  const fontFace = (isBundled(DISPLAY) ? fontFaceCss(DISPLAY) : "") + (isBundled(MONO) ? fontFaceCss(MONO) : "");
  let primary = DEF_PRIMARY, secondary = DEF_SECONDARY, resolvedBrand = null;
  try {
    const brand = resolveBrand(brandSkin, { ground: BG_DEEP, isDark: true, packAccents: [DEF_PRIMARY, DEF_SECONDARY] });
    if (brand.applied) {
      primary = brand.accent || primary;
      secondary = brand.accent2 || secondary;
      resolvedBrand = {
        ...(brandSkin && typeof brandSkin === "object" ? brandSkin : {}),
        accents: [primary, secondary],
        emphasis: brand.emphasis, adjusted: brand.adjusted, dropped: brand.dropped,
        tier: brand.tier, applied: true,
      };
    }
  } catch { primary = DEF_PRIMARY; secondary = DEF_SECONDARY; resolvedBrand = null; }
  const blend = `color-mix(in oklab, ${primary}, ${secondary})`;
  return {
    primary, secondary, blend, bgDeep: BG_DEEP, bgTop: BG_TOP,
    gradient: `linear-gradient(120deg, ${primary}, ${secondary})`,
    gradient3: `linear-gradient(120deg, ${primary}, ${secondary}, ${primary})`,
    ink: "#F4F2FF", dim: "rgba(244,242,255,0.68)", faint: "rgba(244,242,255,0.4)",
    glassBg: "rgba(255,255,255,0.07)", glassBorder: "rgba(255,255,255,0.18)",
    glassSoft: "rgba(255,255,255,0.05)",
    border: `color-mix(in oklab, ${primary} 40%, transparent)`,
    displayStack: `'${DISPLAY}', 'Inter', system-ui, sans-serif`,
    monoStack: `'${MONO}', ui-monospace, monospace`,
    bodyStack: `'${BODY}', system-ui, sans-serif`,
    fontFace, resolvedBrand,
  };
}

// ---- fixed copy (localizable) ------------------------------------------------
const STRINGS = {
  openKicker: "✦ KeyFrame AI",
  statementKicker: "Prompt to video",
  showcaseKicker: "Elegantly capable",
  bulletsKicker: "What it does",
  ctaKicker: "Ready when you are",
  ctaButton: "Start creating",
  ctaTagline: "Beautiful motion, from a prompt.",
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
// Split a headline into gradient word spans for the kinetic reveal.
function gradWords(id, text) {
  return wordsOf(text).slice(0, 8).map((w) =>
    `<span class="au-gword ${id}-gw" style="display:inline-block;opacity:0;margin:0 0.2em 0.1em 0;">${esc(w)}</span>`
  ).join("");
}

// ---- asset gate + frosted-glass SCREEN frame ---------------------------------
function screenOk(a) {
  if (!a || !a.path) return false;
  if (isLogo(a)) return false; // the logo is CTA / key-moment material, not a floating frame
  if (a.type === "video" || /\.(mp4|webm|mov)($|\?)/i.test(a.path)) return false;
  if (/\.svg($|\?)/i.test(a.path)) return false;
  return isTrustedProminent(a) || a.cdProminence === "hero" || a.cdProminence === "support";
}

// A frosted-glass "screen" floating in the aurora, holding a real screenshot — or, with
// no asset, an intentional branded placeholder (aurora gradient wash + a soft luminous
// node) so an empty slot still reads as designed, never blank.
function screen(id, theme, { w, h, tint, radius, asset }) {
  const c = tint || theme.primary;
  const inner = asset && asset.path
    ? `<img src="${esc(asset.path)}" alt="${esc(asset.alt || "")}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;">`
    : `<div style="position:absolute;inset:0;background:${theme.gradient};opacity:0.4;"></div>` +
      `<div style="position:absolute;inset:0;background-image:radial-gradient(circle at 50% 42%, color-mix(in oklab, ${c} 46%, transparent), transparent 64%);"></div>` +
      `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;"><div style="width:16%;aspect-ratio:1;border-radius:50%;background:${theme.gradient};box-shadow:0 0 4cqw ${c};opacity:0.9;"></div></div>`;
  return `<div id="${id}" class="au-screen" style="width:${w};height:${h};border-radius:${radius || "2.6cqw"};position:relative;overflow:hidden;background:${theme.glassSoft};border:0.16cqw solid ${theme.glassBorder};box-shadow:0 4cqw 10cqw -4cqw ${c}, inset 0 1px 0 rgba(255,255,255,0.22);">
    ${inner}
    <div style="position:absolute;left:0;right:0;top:0;height:32%;background:linear-gradient(rgba(255,255,255,0.14),transparent);pointer-events:none;"></div>
  </div>`;
}
// Portrait screenshots (ratio<0.9) get a tall phone-ish frame; else a wide landscape card.
// PORTRAIT PLATE SIZING. This pack sizes a plate through the `--w` custom property:
// the wrapper takes a PERCENTAGE of it and the height is `calc(var(--w) * hMul)`. So
// `--w` is the single scalar the whole plate derives from — and nothing was checking
// the result against a 177.8cqw-tall portrait column, leaving plates at roughly a
// fifth of the frame. Scaling `--w` by the fit factor moves the whole plate together
// and leaves every percentage and calc() downstream correct. No-op in landscape.
function fitWVar(ctx, wCqw, widthPct, hMul) {
  const effW = wCqw * (parseFloat(widthPct) / 100);
  const box = plateBox(ctx && ctx.W, ctx && ctx.H, effW, wCqw * hMul);
  return `${Math.round(wCqw * (box.scaled || 1) * 100) / 100}cqw`;
}

function shotDims(asset, portraitW, wideW) {
  const ratio = Number(asset && asset.ratio) || (asset && asset.width && asset.height ? asset.width / asset.height : 0);
  if (ratio && ratio < 0.9) return { w: portraitW, hMul: 1.5 };
  return { w: wideW, hMul: 0.62 };
}

// ---- scene clip open ---------------------------------------------------------
function open(id, ctx) { return `<div class="clip au-scene" id="${id}" data-start="${ctx.T}" data-duration="${r(ctx.L)}" data-track-index="${ctx.track}" style="opacity:0;">`; }

// ---- archetype selection -----------------------------------------------------
function archetypeFor(scene, i, total) {
  const k = String(scene.kind || "").toLowerCase();
  const p = String(scene.purpose || "").toLowerCase();
  if (i === 0 || k === "hook" || k === "title" || /hook|intro|open/.test(p)) return "open";
  if (i === total - 1 || k === "cta" || /cta|close|sign\s*up|subscribe|download|get\s*started/.test(p)) return "cta";
  if (/feature|how|process|step|showcase|product|proof|demo|gallery/.test(p + k)) return "showcase";
  if (bullets(scene, 2).length >= 2) return "bullets";
  if (k === "quote" || k === "stat" || k === "chart" || pickNumber(scene) || /quote|testimonial|manifesto|reveal|statement/.test(p)) return "statement";
  return "statement";
}

// ---- scene builders ((scene, ctx, assets) -> {html, s}) ----------------------

// SCENE — OPEN: a glass badge floats up, a big display title rises, a subtitle settles.
// Calm opener over the aurora. When the CD pinned a hero screenshot to the hook, it
// rides in the composer's own frosted-glass screen() frame beneath the title (same
// visual language as bShowcase's single-shot path); with no asset the opener is
// byte-identical text (${shotHtml} is "" and its two tweens filter out).
function bOpen(scene, ctx, sceneAssets) {
  const { id, T, L, theme, S, portrait } = ctx;
  const kick = esc(scene.kicker || S.openKicker);
  const title = scene.headline || scene.title || "";
  const one = (sceneAssets || [])[0] || null;
  const d = one ? shotDims(one, portrait ? "56%" : "40%", portrait ? "78%" : "60%") : null;
  const shotHtml = one
    ? `<div class="${id}-fr" style="opacity:0;width:${d.w};margin:5cqw auto 0;--w:${fitWVar(ctx, portrait ? 56 : 40, d.w, d.hMul)};">${screen(`${id}-s0`, theme, { w: "100%", h: `calc(var(--w) * ${d.hMul})`, tint: theme.primary, asset: one, radius: "3.2cqw" })}</div>`
    : "";
  const html = `${open(id, ctx)}<div class="au-safe">
    <div class="au-badge ${id}-badge" style="opacity:0;margin-bottom:5cqw;">${kick}</div>
    <div class="au-display ${id}-title" style="opacity:0;text-align:center;font-size:${r(headlineSize(title, 13))}cqw;">${esc(title)}</div>
    ${shotHtml}${scene.subtext ? `<div class="au-body ${id}-sub" style="opacity:0;margin-top:3.4cqw;max-width:82%;text-align:center;">${esc(scene.subtext)}</div>` : ""}
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.5},${T});`,
    `tl.fromTo(".${id}-badge",{opacity:0,y:-16},{opacity:1,y:0,duration:0.6,ease:"power2.out"},${r(T + 0.25)});`,
    `tl.fromTo(".${id}-title",{opacity:0,y:26,scale:0.96},{opacity:1,y:0,scale:1,duration:0.9,ease:"power3.out"},${r(T + 0.5)});`,
    one ? `tl.fromTo(".${id}-fr",{opacity:0,y:60,scale:0.9},{opacity:1,y:0,scale:1,duration:0.8,ease:"power3.out"},${r(T + 0.9)});` : "",
    one ? `tl.to(".${id}-fr",{y:"-=1.4cqw",duration:2.2,ease:"sine.inOut",yoyo:true,repeat:${reps(L - 1.6, 2.2)},overwrite:"auto"},${r(T + 1.7)});` : "",
    scene.subtext ? `tl.fromTo(".${id}-sub",{opacity:0,y:16},{opacity:1,y:0,duration:0.6,ease:"power2.out"},${r(T + 1.1)});` : "",
    `tl.to(".${id}-title",{y:"-=1cqw",duration:${r(Math.max(1.8, L - 1.8))},ease:"sine.inOut",yoyo:true,repeat:1},${r(T + 1.4)});`,
  ].filter(Boolean);
  return { html, s };
}

// SCENE — STATEMENT: a single big gradient statement floats up and breathes over the
// aurora. The signature "big type over aurora" moment (quotes, reveals, stats).
function bStatement(scene, ctx) {
  const { id, T, L, theme, S } = ctx;
  const kick = esc(scene.kicker || S.statementKicker);
  const html = `${open(id, ctx)}<div class="au-safe">
    <div class="au-kicker ${id}-kick" style="opacity:0;margin-bottom:3.4cqw;">${kick}</div>
    <div class="au-display au-grad ${id}-st" style="text-align:center;font-size:${r(headlineSize(scene.headline, 13))}cqw;">${gradWords(id, scene.headline || scene.title || "PURE MOTION")}</div>
    ${scene.subtext ? `<div class="au-body ${id}-sub" style="opacity:0;margin-top:3.4cqw;max-width:80%;text-align:center;">${esc(scene.subtext)}</div>` : ""}
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.5},${T});`,
    `tl.fromTo(".${id}-kick",{opacity:0,y:-16},{opacity:1,y:0,duration:0.6,ease:"power2.out"},${r(T + 0.3)});`,
    `tl.fromTo(".${id}-gw",{opacity:0,y:34,scale:0.82,filter:"blur(6px)"},{opacity:1,y:0,scale:1,filter:"blur(0px)",duration:0.8,ease:"power3.out",stagger:0.1},${r(T + 0.55)});`,
    scene.subtext ? `tl.fromTo(".${id}-sub",{opacity:0,y:16},{opacity:1,y:0,duration:0.6,ease:"power2.out"},${r(T + 1.3)});` : "",
    `tl.to(".${id}-st",{scale:1.02,duration:${r(Math.max(1.8, L - 1.8))},ease:"sine.inOut",yoyo:true,repeat:1,transformOrigin:"center center"},${r(T + 1.4)});`,
  ].filter(Boolean);
  return { html, s };
}

// SCENE — SHOWCASE: frosted-glass SCREEN frames (real screenshots when present) float
// in the light under a headline, drifting on a gentle finite sine. The product moment.
function bShowcase(scene, ctx, sceneAssets) {
  const { id, T, L, theme, S, portrait } = ctx;
  const kick = esc(scene.kicker || S.showcaseKicker);
  const shots = (sceneAssets || []).slice(0, 3);
  const feats = bullets(scene, 3);
  const single = shots.length <= 1;
  const one = shots[0] || null;
  // GSAP animates the OUTER .au-fr (opacity/y/scale + float); the perspective tilt is
  // static CSS on an inner wrapper GSAP never touches (so the float can't discard it).
  // Hoisted so the stage's `--w` below can be fitted with the SAME dims the plate uses
  // — that custom property is what both the width percentage and the height calc()
  // resolve against, so the two must agree.
  const singleD = single ? shotDims(one, portrait ? "60%" : "40%", portrait ? "82%" : "62%") : null;
  const wall = single
    ? (() => {
        const d = singleD;
        return `<div class="${id}-fr" style="opacity:0;width:${d.w};margin:0 auto;">${screen(`${id}-s0`, theme, { w: "100%", h: `calc(var(--w) * ${d.hMul})`, tint: theme.primary, asset: one, radius: "3.2cqw" })}</div>`;
      })()
    : `<div style="display:flex;gap:3cqw;justify-content:center;align-items:center;perspective:1500px;">${shots.map((a, i) => {
        const d = shotDims(a, "28%", "32%");
        const tilt = (i - (shots.length - 1) / 2) * -14;
        return `<div class="${id}-fr" style="opacity:0;width:${d.w};"><div style="transform:rotateY(${tilt}deg);transform-style:preserve-3d;">${screen(`${id}-s${i}`, theme, { w: "100%", h: `calc(var(--w) * ${d.hMul})`, tint: i % 2 ? theme.secondary : theme.primary, asset: a, radius: "2.6cqw" })}</div></div>`;
      }).join("")}</div>`;
  const featHtml = feats.length
    ? `<div style="display:flex;flex-direction:column;gap:1.8cqw;align-items:center;margin-top:4.5cqw;">${feats.map((f) => `<div class="au-chip ${id}-fi" style="opacity:0;">${esc(f)}</div>`).join("")}</div>`
    : "";
  const html = `${open(id, ctx)}<div class="au-safe">
    <div class="au-kicker ${id}-kick" style="opacity:0;margin-bottom:2.6cqw;">${kick}</div>
    ${scene.headline ? `<div class="au-h1 ${id}-head" style="opacity:0;text-align:center;font-size:${r(headlineSize(scene.headline, 7.5))}cqw;margin-bottom:5cqw;">${esc(scene.headline)}</div>` : ""}
    <div class="${id}-stage" style="--w:${single ? fitWVar(ctx, portrait ? 60 : 40, singleD.w, singleD.hMul) : "28cqw"};width:100%;">${wall}</div>
    ${featHtml}
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.4},${T});`,
    `tl.fromTo(".${id}-kick",{opacity:0,y:-16},{opacity:1,y:0,duration:0.55,ease:"power2.out"},${r(T + 0.2)});`,
    scene.headline ? `tl.fromTo(".${id}-head",{opacity:0,y:20},{opacity:1,y:0,duration:0.6,ease:"power2.out"},${r(T + 0.4)});` : "",
    `tl.fromTo(".${id}-fr",{opacity:0,y:80,scale:0.86},{opacity:1,y:0,scale:1,duration:0.85,ease:"power3.out",stagger:0.16},${r(T + 0.6)});`,
    `tl.to(".${id}-fr",{y:"-=1.8cqw",duration:2.2,ease:"sine.inOut",yoyo:true,repeat:${reps(L - 1.6, 2.2)},stagger:0.12,overwrite:"auto"},${r(T + 1.6)});`,
    feats.length ? `tl.fromTo(".${id}-fi",{opacity:0,y:18},{opacity:1,y:0,duration:0.5,ease:"back.out(1.6)",stagger:0.14},${r(T + 1.3)});` : "",
  ].filter(Boolean);
  return { html, s };
}

// SCENE — BULLETS: a headline over a rising stack of frosted-glass feature cards, each
// with a luminous gradient icon and a label. The dynamic default for bullet scenes.
function bBullets(scene, ctx) {
  const { id, T, L, theme, S } = ctx;
  const kick = esc(scene.kicker || S.bulletsKicker);
  let items = bullets(scene, 4);
  if (!items.length) items = [String(scene.headline || scene.title || "")];
  const cards = items.map((c, i) => {
    const parts = String(c).split(/\s+[–—-]\s+|:\s+/);
    const t1 = esc(parts[0] || c);
    const t2 = parts[1] ? esc(parts.slice(1).join(" ")) : "";
    return `<div class="au-card ${id}-card" style="opacity:0;" data-i="${i}">
      <div class="au-icon" style="background:${i % 2 ? theme.gradient : `linear-gradient(135deg, ${theme.secondary}, ${theme.primary})`};box-shadow:0 0 3cqw ${i % 2 ? theme.secondary : theme.primary};"></div>
      <div style="text-align:left;">
        <div style="font-family:${theme.displayStack};font-weight:700;font-size:3.4cqw;color:${theme.ink};line-height:1.12;">${t1}</div>
        ${t2 ? `<div style="font-family:${theme.bodyStack};font-size:2.6cqw;color:${theme.dim};margin-top:0.6cqw;">${t2}</div>` : ""}
      </div>
    </div>`;
  }).join("");
  const html = `${open(id, ctx)}<div class="au-safe">
    <div class="au-kicker ${id}-kick" style="opacity:0;margin-bottom:2.6cqw;">${kick}</div>
    ${scene.headline ? `<div class="au-h1 ${id}-head" style="opacity:0;text-align:center;font-size:${r(headlineSize(scene.headline, 7.5))}cqw;margin-bottom:5cqw;">${esc(scene.headline)}</div>` : ""}
    <div style="display:flex;flex-direction:column;gap:2.4cqw;align-items:stretch;width:82%;">${cards}</div>
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.4},${T});`,
    `tl.fromTo(".${id}-kick",{opacity:0,y:-16},{opacity:1,y:0,duration:0.55,ease:"power2.out"},${r(T + 0.2)});`,
    scene.headline ? `tl.fromTo(".${id}-head",{opacity:0,y:22,scale:0.96},{opacity:1,y:0,scale:1,duration:0.6,ease:"power3.out"},${r(T + 0.4)});` : "",
    `tl.fromTo(".${id}-card",{opacity:0,y:34,scale:0.94},{opacity:1,y:0,scale:1,duration:0.6,ease:"back.out(1.5)",stagger:0.16},${r(T + 0.75)});`,
    `tl.to(".${id}-card",{y:"-=0.9cqw",duration:2.4,ease:"sine.inOut",yoyo:true,repeat:${reps(L - 1.6, 2.4)},stagger:0.12,overwrite:"auto"},${r(T + 1.7)});`,
  ].filter(Boolean);
  return { html, s };
}

// SCENE — CTA: the logo mark assembles (the user's logo when uploaded, else a built
// aurora glyph), the wordmark types in char-by-char, a gradient button pulses, a URL
// settles. The close.
function bCta(scene, ctx, logo) {
  const { id, T, L, theme, S } = ctx;
  const word = String(scene.headline || scene.title || "KEYFRAME").slice(0, 20);
  const btn = esc(String(scene.emphasis || S.ctaButton).slice(0, 24));
  const tagline = esc(String(scene.subtext || S.ctaTagline).slice(0, 60));
  const url = esc(String(S.ctaUrl).toUpperCase());
  const mark = logo && logo.path
    ? logoMark(logo, { sizeCqw: 22, ground: theme.bgDeep, glow: theme.primary, escape: esc })
    : `<div style="position:relative;width:20cqw;height:20cqw;">
        <div style="position:absolute;inset:0;border-radius:50%;background:${theme.gradient};box-shadow:0 0 7cqw ${theme.primary};filter:blur(0.4cqw);opacity:0.9;"></div>
        <div style="position:absolute;inset:22%;border-radius:50%;background:radial-gradient(circle at 40% 34%, #fff, transparent 62%);opacity:0.8;"></div>
        <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;font-family:${theme.displayStack};font-weight:800;font-size:9cqw;">✦</div>
      </div>`;
  const chars = wordCharSpans(word, `${id}-ch`);
  const html = `${open(id, ctx)}<div class="au-safe">
    <div class="au-kicker ${id}-kick" style="opacity:0;margin-bottom:2.4cqw;">${esc(scene.kicker || S.ctaKicker)}</div>
    <div class="${id}-mark" style="opacity:0;">${mark}</div>
    <div class="au-wordmark" style="font-size:${r(Math.min(11, fitCap(word)))}cqw;margin-top:3.4cqw;">${chars}</div>
    <div class="au-body ${id}-tag" style="opacity:0;margin-top:1.8cqw;">${tagline}</div>
    <div class="au-btn ${id}-btn" style="opacity:0;margin-top:3.6cqw;">${btn} ✦</div>
    <div class="${id}-url" style="opacity:0;font-family:${theme.monoStack};letter-spacing:0.24em;font-size:2.4cqw;color:${theme.faint};margin-top:2.4cqw;">${url}</div>
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.5},${T});`,
    `tl.fromTo(".${id}-kick",{opacity:0,y:-14},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 0.25)});`,
    `tl.fromTo(".${id}-mark",{opacity:0,scale:0.6,y:20},{opacity:1,scale:1,y:0,duration:0.7,ease:"back.out(1.7)"},${r(T + 0.4)});`,
    `tl.fromTo(".${id}-ch",{opacity:0,y:50},{opacity:1,y:0,duration:0.55,ease:"power3.out",stagger:0.05},${r(T + 0.8)});`,
    `tl.fromTo(".${id}-tag",{opacity:0,y:14},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 1.35)});`,
    `tl.fromTo(".${id}-btn",{opacity:0,scale:0.8},{opacity:1,scale:1,duration:0.55,ease:"back.out(2)"},${r(T + 1.6)});`,
    `tl.to(".${id}-btn",{scale:1.04,duration:0.8,ease:"sine.inOut",yoyo:true,repeat:${reps(L - 2.2, 0.8)},overwrite:"auto"},${r(T + 2.2)});`,
    `tl.fromTo(".${id}-url",{opacity:0},{opacity:1,duration:0.5},${r(T + 1.85)});`,
  ];
  return { html, s };
}

const BUILDERS = { open: bOpen, statement: bStatement, showcase: bShowcase, bullets: bBullets, cta: bCta };

// ---- persistent AURORA SKY canvas (hf-seek) ----------------------------------
// One canvas painted purely from the renderer's hf-seek time: a deep sky wash, soft
// mesh-gradient blooms drifting on lissajous paths, flowing aurora ribbons/curtains of
// accent light, luminous motes and a vignette. Colored ONLY with theme.primary/secondary
// (+ their blend), so a brand skin recolors the WHOLE sky. Live preview drives it off the
// timeline's onUpdate; render is hf-seek only (deterministic, seek-exact, capture-safe).
function auroraClip(theme, dims, D, seed) {
  const W = dims.width, H = dims.height;
  const P = hexToRgb(theme.primary);
  const Se = hexToRgb(theme.secondary);
  const Bl = mix(P, Se, 0.5);
  const dp = hexToRgb(theme.bgDeep);
  const tp = hexToRgb(theme.bgTop);
  // 5-stop mesh, alternating the two accents with their blend (source AuroraSky.mesh).
  const mesh = [P, Se, Bl, P, Se];
  const meshJs = JSON.stringify(mesh);
  // ribbon color palette (primary / blend / secondary).
  const ribs = JSON.stringify([P, Bl, Se]);
  const html = `<div id="au-sky-clip" class="clip" data-start="0" data-duration="${D}" data-track-index="0" data-layout-allow-occlusion style="background:${theme.bgDeep};">
    <canvas id="au-sky" width="${W}" height="${H}" style="position:absolute;inset:0;width:100%;height:100%;"></canvas>
  </div>`;
  const script = `(function(){
  var cv=document.getElementById("au-sky");if(!cv||!cv.getContext)return;var cx=cv.getContext("2d");if(!cx)return;
  var W=${W},H=${H};
  var MESH=${meshJs},RIB=${ribs};
  function C(a,al){return "rgba("+a[0]+","+a[1]+","+a[2]+","+al+")";}
  var sd=${seed >>> 0};function rnd(){sd=(sd*1664525+1013904223)>>>0;return sd/4294967296;}
  function hs(n){var s=Math.sin(n*127.1+311.7)*43758.5453;return s-Math.floor(s);}
  // mesh blooms — soft radial gradients drifting on lissajous paths (deterministic).
  var BL=MESH.map(function(c,i){return {c:c,bx:0.2+0.6*hs(i*1.7),by:0.2+0.6*hs(i*2.3),fx:0.10+hs(i*3)*0.16,fy:0.08+hs(i*4)*0.14,ph:hs(i*5)*6.28,sz:0.7+hs(i*6)*0.7};});
  // aurora ribbons — flowing luminous curtains.
  var RB=[];for(var q=0;q<3;q++){RB.push({c:RIB[q%RIB.length],base:0.34+0.16*q,amp:H*(0.05+0.02*q),f:(1.2+0.5*q)/W,sp:0.14+0.05*q,drop:H*(0.34-0.05*q),op:0.32-0.05*q,ph:hs(q*11)*6.28});}
  // luminous motes.
  var N=Math.round(18*(W*H)/(1080*1920)),MO=[];
  for(var i=0;i<N;i++){MO.push({x:hs(i*7.1),y:hs(i*8.3),s:2+hs(i*9)*3,ph:hs(i)*6.28});}
  function ribbon(rb,t){
    var top=H*10,steps=44;
    cx.beginPath();
    for(var i=0;i<=steps;i++){var x=i/steps*W;var y=rb.base*H+Math.sin(x*rb.f+t*rb.sp+rb.ph)*rb.amp+Math.sin(x*rb.f*2.3-t*rb.sp*0.7+rb.ph)*rb.amp*0.5;if(y<top)top=y;if(i===0)cx.moveTo(x,y);else cx.lineTo(x,y);}
    for(var j=steps;j>=0;j--){var x2=j/steps*W;var y2=rb.base*H+Math.sin(x2*rb.f+t*rb.sp+rb.ph)*rb.amp+Math.sin(x2*rb.f*2.3-t*rb.sp*0.7+rb.ph)*rb.amp*0.5+rb.drop;cx.lineTo(x2,y2);}
    cx.closePath();
    var g=cx.createLinearGradient(0,top,0,top+rb.drop);g.addColorStop(0,C(rb.c,0));g.addColorStop(0.12,C(rb.c,rb.op));g.addColorStop(1,C(rb.c,0));
    cx.fillStyle=g;cx.fill();
  }
  function draw(t){
    // deep sky wash
    var bg=cx.createLinearGradient(0,0,0,H);bg.addColorStop(0,"rgb(${tp[0]},${tp[1]},${tp[2]})");bg.addColorStop(1,"rgb(${dp[0]},${dp[1]},${dp[2]})");cx.fillStyle=bg;cx.fillRect(0,0,W,H);
    // mesh blooms (screen)
    cx.globalCompositeOperation="lighter";
    for(var b=0;b<BL.length;b++){var m=BL[b];var x=(m.bx+Math.sin(t*m.fx+m.ph)*0.18)*W;var y=(m.by+Math.cos(t*m.fy+m.ph)*0.16)*H;var sz=W*m.sz*(1+0.1*Math.sin(t*0.5+b));var g=cx.createRadialGradient(x,y,0,x,y,sz*0.5);g.addColorStop(0,C(m.c,0.5));g.addColorStop(0.6,C(m.c,0));cx.fillStyle=g;cx.fillRect(0,0,W,H);}
    // aurora ribbons
    for(var rr=0;rr<RB.length;rr++)ribbon(RB[rr],t);
    cx.globalCompositeOperation="source-over";
    // luminous motes rising
    for(var i=0;i<MO.length;i++){var d=MO[i];var yy=(d.y*H-t*10)%H;if(yy<0)yy+=H;var op=0.2+0.3*(0.5+0.5*Math.sin(t*1.5+d.ph));cx.globalAlpha=op;cx.fillStyle="rgba(255,255,255,1)";cx.shadowColor="rgba(255,255,255,1)";cx.shadowBlur=d.s*3;cx.beginPath();cx.arc(d.x*W,yy,d.s,0,6.283);cx.fill();}
    cx.shadowBlur=0;cx.globalAlpha=1;
    // vignette back into the sky
    var vg=cx.createRadialGradient(W*0.5,H*0.4,Math.min(W,H)*0.2,W*0.5,H*0.4,Math.max(W,H)*0.8);vg.addColorStop(0,"rgba(${dp[0]},${dp[1]},${dp[2]},0)");vg.addColorStop(1,"rgba(${dp[0]},${dp[1]},${dp[2]},0.92)");cx.fillStyle=vg;cx.fillRect(0,0,W,H);
  }
  // Painted ONLY from the renderer's hf-seek time — deterministic, seek-exact, and
  // frame-capture-safe (no wall clock / rAF). The GSAP timeline's onUpdate also drives
  // it so the aurora animates in live preview too, in lockstep with the scenes.
  window.KF_AURORA=draw;window.addEventListener("hf-seek",function(e){draw((e.detail&&e.detail.time)||0);});draw(0);
})();`;
  return { html, script };
}

// ---- grain overlay (top layer) -----------------------------------------------
const GRAIN_URI = grainUri(0.9);
function grainClip(D) {
  return `<div id="au-grain" class="clip" data-start="0" data-duration="${D}" data-track-index="40" data-layout-allow-occlusion style="pointer-events:none;background-image:url('${GRAIN_URI}');background-size:260px 260px;opacity:0.04;mix-blend-mode:overlay;"></div>`;
}

// ---- style -------------------------------------------------------------------
function styleBlock(theme, portrait) {
  const safePad = portrait ? "12% 7% 14%" : "8% 8% 10%";
  return `${theme.fontFace}
  * { box-sizing:border-box; margin:0; padding:0; }
  html, body { width:100%; height:100%; overflow:hidden; background:#000; }
  #root { position:relative; overflow:hidden; isolation:isolate; background:${theme.bgDeep}; container-type:size; color:${theme.ink}; font-family:${theme.bodyStack}; }
  .clip { position:absolute; top:0; left:0; width:100%; height:100%; overflow:hidden; }
  .au-safe { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:${safePad}; text-align:center; }
  .au-display { font-family:${theme.displayStack}; font-weight:800; line-height:0.98; letter-spacing:-0.03em; color:${theme.ink}; ${displayShadow(theme.ground)} }
  .au-h1 { font-family:${theme.displayStack}; font-weight:700; line-height:1.04; letter-spacing:-0.02em; color:${theme.ink}; ${displayShadow(theme.ground)} }
  .au-grad .au-gword { background:${theme.gradient3}; -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; color:transparent; }
  .au-gword { will-change:transform,opacity; }
  .au-badge { display:inline-flex; align-items:center; gap:0.9cqw; font-family:${theme.monoStack}; font-weight:600; font-size:2.4cqw; letter-spacing:0.24em; text-transform:uppercase; color:${theme.ink}; padding:1.6cqw 4cqw; border-radius:999px; background:${theme.glassBg}; border:1px solid ${theme.glassBorder}; backdrop-filter:blur(18px); box-shadow:inset 0 1px 0 rgba(255,255,255,0.2); }
  .au-kicker { display:inline-flex; align-items:center; gap:0.9cqw; font-family:${theme.monoStack}; font-weight:600; font-size:2cqw; letter-spacing:0.32em; text-transform:uppercase; color:${theme.dim}; }
  .au-body { font-family:${theme.bodyStack}; font-weight:500; font-size:2.7cqw; line-height:1.42; color:${theme.dim}; }
  .au-wordmark { display:flex; flex-wrap:wrap; justify-content:center; text-align:center; gap:0 0.26em; max-width:92%; font-family:${theme.displayStack}; font-weight:700; font-size:11cqw; letter-spacing:-0.02em; color:${theme.ink}; }
  .au-chip { display:inline-flex; align-items:center; gap:1.4cqw; padding:1.6cqw 3.4cqw; border-radius:999px; background:${theme.glassBg}; border:1px solid ${theme.glassBorder}; backdrop-filter:blur(14px); font-family:${theme.monoStack}; font-weight:600; font-size:2.6cqw; letter-spacing:0.06em; color:${theme.ink}; white-space:nowrap; will-change:transform,opacity; }
  .au-card { display:flex; align-items:center; gap:2.6cqw; padding:2.6cqw 3cqw; border-radius:3.4cqw; background:${theme.glassBg}; border:1px solid ${theme.glassBorder}; backdrop-filter:blur(18px); box-shadow:0 3cqw 9cqw -4cqw ${theme.primary}, inset 0 1px 0 rgba(255,255,255,0.2); will-change:transform,opacity; }
  .au-icon { width:9cqw; height:9cqw; border-radius:2.4cqw; flex:0 0 auto; }
  .au-btn { display:inline-flex; align-items:center; gap:1cqw; padding:2.8cqw 6.8cqw; border-radius:999px; background:${theme.gradient}; color:#fff; font-family:${theme.displayStack}; font-weight:700; font-size:3.6cqw; letter-spacing:0.02em; box-shadow:0 3cqw 8cqw -2cqw ${theme.primary}; will-change:transform,opacity; }
  .au-screen { will-change:transform,opacity; }
  #caps { position:absolute; inset:0; display:flex; justify-content:center; align-items:flex-end; padding-bottom:${portrait ? "16%" : "7%"}; z-index:60; pointer-events:none; }
  #cap-pill { max-width:82%; height:fit-content; flex:0 0 auto; text-align:center; padding:1.4cqw 3cqw; opacity:0; border-radius:2cqw; background:rgba(8,6,17,0.72); border:1px solid ${theme.glassBorder}; backdrop-filter:blur(8px); }
  #cap-text { font-family:${theme.bodyStack}; font-weight:600; font-size:2.6cqw; line-height:1.35; color:${theme.ink}; }`;
}

// ---- MAIN --------------------------------------------------------------------
function buildComposition({ storyboard, dims, framePack, captionCues, assets, brandSkin = null, localized = null } = {}) {
  // Portrait drives the headline fill ladder (see headlineSize).
  _portrait = (dims && dims.height > dims.width) || false;
  const theme = auroraTheme(brandSkin);
  const S = localized ? { ...STRINGS, ...localized } : STRINGS;
  const sb = storyboard || {};
  const W = (dims && dims.width) || 1080, H = (dims && dims.height) || 1920;
  const portrait = W < H;
  const scenes = Array.isArray(sb.scenes) && sb.scenes.length
    ? sb.scenes.slice(0, 12)
    : [{ id: "s1", start: 0, duration: 5, kind: "hook", headline: sb.title || "KEYFRAME" }];
  const D = r(sb.durationSec || scenes.reduce((a, s) => Math.max(a, (Number(s.start) || 0) + (Number(s.duration) || 0)), 0) || 12);
  const seed = seedFrom(sb.title || (scenes[0] && scenes[0].headline) || "aurora");

  // ---- Assets: distribute real screenshots across DISPLAY-CAPABLE scenes -------
  // A screenshot must NEVER be stranded on a scene that can't show it (open / cta). The
  // Creative Director's per-asset `sceneId` is only a HINT: honored when that scene can
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
  // Display-capable = showcase/statement/bullets (promoted to glass frames when they hold
  // shots). The hook ("open") is ALSO a valid host — it shows a single hero shot in its own
  // frame without losing its opener identity — so every content archetype except the pure
  // CTA can carry its assigned asset. The logo stays reserved for the CTA mark.
  const canShow = (a) => a === "showcase" || a === "statement" || a === "bullets";
  const canHostHero = (a) => a === "open";
  const displayIdx = scenes.map((_, i) => i).filter((i) => canShow(baseArch[i]) || canHostHero(baseArch[i]));
  // Guarantee a landing slot: if shots exist but nothing is display-capable (a degenerate
  // all-CTA deck), coerce one non-CTA scene into a showcase so a usable screenshot is never
  // dropped — matching the "every usable screenshot actually appears" contract above.
  if (shots.length && !displayIdx.length) {
    const j = scenes.findIndex((_, i) => i !== scenes.length - 1);
    const idx = j < 0 ? 0 : j;
    baseArch[idx] = "showcase";
    displayIdx.push(idx);
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
    // A display-capable scene that received screenshots shows them as floating glass
    // frames (a showcase); 1–3 shots. Scenes with none keep their base form (statement /
    // bullets), so a text-only aurora scene never forces an empty frame.
    if (canShow(arch) && sceneAssets.length) {
      arch = "showcase";
      sceneAssets = sceneAssets.slice(0, portrait ? 3 : 3);
    } else if (canHostHero(arch) && sceneAssets.length) {
      // The hook keeps its opener identity and shows ONE hero shot in its glass frame.
      sceneAssets = sceneAssets.slice(0, 1);
    }
    const ctx = { id: `s${i + 1}`, T, L, E: r(T + L), i, isLast: i === scenes.length - 1, track: 2 + i, theme, S, W, H, portrait };
    const built = (BUILDERS[arch] || bStatement)(scene, ctx, arch === "cta" ? logo : sceneAssets);
    bodyParts.push(built.html);
    sceneScripts.push(built.s.filter(Boolean).join("\n  "));
    if (!ctx.isLast) sceneScripts.push(`kill("#${ctx.id}",${r(T + L)});`);
  });

  const cues = (Array.isArray(captionCues) ? captionCues : [])
    .filter((c) => c && c.text != null)
    .map((c) => [r(c.start != null ? c.start : c.startSec || 0), r(c.end != null ? c.end : (c.start || 0) + 2), String(c.text)]);

  const sky = auroraClip(theme, { width: W, height: H }, D, seed);
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
    if(window.KF_AURORA)window.KF_AURORA(now); // drive the aurora off the deterministic timeline (live preview)
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
    sky.html,
    bodyParts.join("\n"),
    grainClip(D),
    caps,
    `</div>`,
    `<script>`, sky.script, `</script>`,
    `<script>`, script, `</script>`,
    `</body>`, `</html>`,
  ].join("\n");

  const metaJson = JSON.stringify({ compositionId: "vid", width: W, height: H, fps: (dims && dims.fps) || 30, duration: D });
  // resolvedBrand echoes the accents the film actually wore (or null when no brand was
  // applied), so graph.persistWornBrand discloses the true painted palette.
  return { indexHtml, metaJson, resolvedBrand: theme.resolvedBrand };
}

module.exports = { buildComposition, STRINGS };
