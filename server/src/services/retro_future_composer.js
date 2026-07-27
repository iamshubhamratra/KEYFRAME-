// RETRO FUTURE composer — a native GSAP + canvas "synthwave / outrun prompt→video" film.
// The pack `retro-future` (manifest renderer:"retro-future") routes here from
// attemptLlmComposition, exactly like the flagship / kinetic / product-showcase composers.
//
// Ported from the imported OmniMotion/React template ("Retro Future"). The React runtime
// is replaced by KEYFRAME's HyperFrames contract, but the identity is kept:
//   • a PERSISTENT animated SYNTHWAVE world — a gradient sunset sky, a twinkling starfield,
//     a banded neon sun sitting on the horizon, an infinite neon perspective grid rushing
//     to the vanishing point, a glowing horizon line and CRT scanlines — painted on ONE
//     <canvas> as a pure function of the renderer's hf-seek time (deterministic; the grid
//     scrolls continuously across every cut so scene boundaries frame-match on the world).
//   • CHROME / neon display type, neon-bordered CRT/arcade screen-frames that hold real
//     screenshots, a radiating light-burst climax and a "Press Start" logo-reveal CTA.
//
// EVERYTHING is theme-driven: retroTheme(primary, secondary) derives the neon grid, the
// sun/horizon glow, the chrome type accent, the scanlines and the CTA — so a brand skin
// recolors the WHOLE film (sky, grid, sun, CRT borders, neon words, CTA), not just text.
//
// Engineering contract (identical to the other native composers): one paused GSAP timeline
// on window.__timelines["vid"]; direct-child .clip scenes on unique tracks; a boundary
// opacity:0 hard-kill per scene (the world persists behind them); ONE seek-safe caption
// node (#cap-text) driven by a single onUpdate proxy; finite repeats; cqw units +
// container-type:size (portrait-native, 9:16); hidden = opacity:0 only. Portrait is
// detected from dims (W<H); no manifest flag. Deterministic. GSAP is the only CDN.

const { fontFaceCss, isBundled } = require("../fonts/pack_fonts");
const { isTrustedProminent, isLogo } = require("./asset_priority");
const { logoMark } = require("./logo_render");
const { plateBox } = require("./responsive");
const { charSpans, supportLine } = require("./text_fx");
const { resolveBrand } = require("./brand_kit");

const GSAP_CDN = "https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js";
// Anton (bundled) is the heavy condensed display that carries the template's chrome-outrun
// headline spirit (the React source used italic Sora); JetBrains Mono is the bundled arcade
// mono face for prompts/labels/URLs; Inter → system-ui in the CDN-free render.
const DISPLAY = "Anton";
const MONO = "JetBrains Mono";
const BODY = "Inter";

// The template's default synthwave accents when no brand is applied (neon magenta → cyan)
// and the fixed dark grounds/sky bases that the accents tint.
const DEF_PRIMARY = "#FF2E97";
const DEF_SECONDARY = "#22D3EE";
const BG_DEEP = "#080316";
const SKY_TOP = "#0A0420";
const SKY_MID = "#140830";
const SKY_BOT = "#22072E";

// ---- helpers -----------------------------------------------------------------
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
const r = (n) => Math.round((Number(n) || 0) * 100) / 100;
const hexToRgb = (h) => { const n = parseInt(String(h).replace("#", ""), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
// mix hexA into hexB at weight tA (tA of A, 1-tA of B) → "r,g,b" for canvas fills.
function mixRgb(hexA, hexB, tA) {
  const a = hexToRgb(hexA), b = hexToRgb(hexB);
  return a.map((v, i) => Math.round(v * tA + b[i] * (1 - tA))).join(",");
}
function relLum(hex) {
  const [rr, gg, bb] = hexToRgb(hex).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * rr + 0.7152 * gg + 0.0722 * bb;
}
function seedFrom(str) { let h = 2166136261; const s = String(str || "retro"); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) || 7; }
// finite yoyo repeat count for a segment of `t` seconds at period `c`.
function reps(t, c) { return Math.max(0, Math.floor((Number(t) || 0) / (c || 1)) - 1); }

// ---- theme -------------------------------------------------------------------
// resolveBrand fits the brand accents to the near-black synthwave ground (isDark:true →
// lifted UP for neon contrast) and passes the pack accents through untouched when no skin —
// so a null skin renders the exact default outrun world byte-for-byte and resolvedBrand is
// null (honest "unbranded"). Applied → the two neons become the brand's and every derived
// value (sky tint, grid, sun, CRT borders, chrome accent, CTA) follows, and resolvedBrand
// echoes what was worn.
function retroTheme(brandSkin) {
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
  const onPrimary = relLum(primary) > 0.55 ? "#0A0420" : "#FFFFFF";
  return {
    primary, secondary, bgDeep: BG_DEEP, skyTop: SKY_TOP, skyMid: SKY_MID, skyBot: SKY_BOT, onPrimary,
    ink: "#FDF4FF", dim: "rgba(253,244,255,0.62)", faint: "rgba(253,244,255,0.34)",
    // outrun sky: deep purple top → secondary-tinted mid → primary-tinted horizon.
    sky: `linear-gradient(180deg, ${SKY_TOP} 0%, color-mix(in oklab, ${secondary} 30%, ${SKY_MID}) 40%, color-mix(in oklab, ${primary} 40%, ${SKY_BOT}) 74%)`,
    // chrome type: white → icy → secondary → primary (the signature reflective headline).
    chrome: `linear-gradient(180deg, #ffffff 0%, #dff3ff 38%, ${secondary} 55%, ${primary} 100%)`,
    grid: secondary, glow: primary, glow2: secondary,
    screenBg: "#0C0620",
    surface: `color-mix(in oklab, ${primary} 12%, #0C0620)`,
    border: `color-mix(in oklab, ${primary} 46%, transparent)`,
    line: `color-mix(in oklab, ${secondary} 40%, transparent)`,
    displayStack: `'${DISPLAY}', 'Arial Narrow', system-ui, sans-serif`,
    monoStack: `'${MONO}', ui-monospace, monospace`,
    bodyStack: `'${BODY}', system-ui, sans-serif`,
    fontFace, resolvedBrand,
  };
}

// ---- fixed copy (localizable) — FALLBACK LABELS ONLY (no demo content) --------
const STRINGS = {
  openKicker: "AI Video · 2026",
  promptKicker: "Insert prompt",
  showcaseKicker: "Select mode",
  revealKicker: "Outrun the",
  statsKicker: "By the numbers",
  bulletsKicker: "Direct every detail",
  climaxKicker: "Future mode",
  ctaKicker: "Insert coin",
  ctaButton: "Press Start",
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
// The first number-bearing string on the scene (for the stats archetype).
function numberOf(scene) {
  return [scene.emphasis, scene.headline, scene.subtext, ...(Array.isArray(scene.onScreenText) ? scene.onScreenText : [])]
    .map((x) => String(x || "")).find((x) => /\d/.test(x)) || "";
}
// Headline sized so long copy never overflows the portrait column.
function headlineSize(text, base) {
  const len = String(text || "").length;
  if (len > 42) return base * 0.62;
  if (len > 28) return base * 0.76;
  if (len > 18) return base * 0.88;
  return base;
}
// Split a headline into word spans for the neon reveal (each word glows + staggers in).
function neonWords(id, text) {
  return wordsOf(text).slice(0, 10).map((w) =>
    `<span class="rf-nword ${id}-nw" style="display:inline-block;opacity:0;margin:0 0.2em 0.08em 0;">${esc(w)}</span>`
  ).join("");
}

// ---- asset gate + neon CRT screen-frame --------------------------------------
function screenOk(a) {
  if (!a || !a.path) return false;
  if (isLogo(a)) return false; // the logo is CTA / key-moment material, not a CRT plate
  if (a.type === "video" || /\.(mp4|webm|mov)($|\?)/i.test(a.path)) return false;
  if (/\.svg($|\?)/i.test(a.path)) return false;
  return isTrustedProminent(a) || a.cdProminence === "hero" || a.cdProminence === "support";
}
function logoAssetOf(assets) {
  return (Array.isArray(assets) ? assets : []).find((a) => a && a.path && isLogo(a) && !/\.(mp4|webm|mov)($|\?)/i.test(a.path)) || null;
}

// A neon-bordered CRT/arcade screen holding a real screenshot — or, with no asset, an
// intentional branded placeholder (chrome/neon wash + a faint scan grid + a glowing node)
// so an empty slot still reads as designed, never blank. Absolutely filled (100%×100%);
// the caller sizes it. `tint` picks which neon owns the border/glow.
function crtFrame(theme, asset, tint) {
  const c = tint || theme.primary;
  const inner = asset && asset.path
    ? `<img src="${esc(asset.path)}" alt="${esc(asset.alt || "")}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;">`
    : `<div style="position:absolute;inset:0;background:linear-gradient(160deg, ${c}, ${theme.secondary});opacity:0.30;"></div>` +
      `<div style="position:absolute;inset:0;background-image:linear-gradient(${theme.line} 1px,transparent 1px),linear-gradient(90deg,${theme.line} 1px,transparent 1px);background-size:12% 9%;opacity:0.55;"></div>` +
      `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;"><div style="width:16%;aspect-ratio:1;border-radius:50%;background:${c};box-shadow:0 0 4cqw ${c};opacity:0.9;"></div></div>`;
  return `<div class="rf-crt" style="position:absolute;inset:0;overflow:hidden;background:${theme.screenBg};border:0.4cqw solid ${c};box-shadow:0 0 3cqw ${c}, inset 0 0 3cqw color-mix(in oklab, ${c} 40%, transparent);">
    ${inner}
    <div style="position:absolute;inset:0;background-image:repeating-linear-gradient(0deg, rgba(0,0,0,0.24) 0 1.5px, transparent 1.5px 4px);opacity:0.5;pointer-events:none;mix-blend-mode:multiply;"></div>
    <div style="position:absolute;left:0;right:0;top:0;height:30%;background:linear-gradient(rgba(255,255,255,0.14),transparent);pointer-events:none;"></div>
  </div>`;
}
// A CRT screen on an animatable outer wrapper. GSAP animates the OUTER `.${id}-crt`
// (opacity/y/scale entrance + float); the perspective tilt is static CSS on an inner
// wrapper GSAP never touches (so the float can't discard it). `hcqw` = frame height in cqw.
function crtBlock(id, theme, { w, hcqw, asset, tint, tilt }) {
  const t = tilt || 0;
  return `<div class="${id}-crt" style="opacity:0;width:${w};perspective:1500px;">
    <div style="position:relative;width:100%;height:${r(hcqw)}cqw;transform:rotateY(${t}deg);transform-style:preserve-3d;">${crtFrame(theme, asset, tint)}</div>
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
function open(id, ctx) { return `<div class="clip rf-scene" id="${id}" data-start="${ctx.T}" data-duration="${r(ctx.L)}" data-track-index="${ctx.track}" style="opacity:0;">`; }

// ---- archetype selection -----------------------------------------------------
function archetypeFor(scene, i, total) {
  const k = String(scene.kind || "").toLowerCase();
  const p = String(scene.purpose || "").toLowerCase();
  if (i === 0 || k === "hook" || k === "title" || /hook|intro|open/.test(p)) return "open";
  if (i === total - 1 || k === "cta" || /cta|close|sign\s*up|subscribe|download|get\s*started/.test(p)) return "cta";
  if (k === "stat" || k === "chart" || k === "countdown" || (pickNumber(scene) && /proof|result|metric|stat|number/.test(p + k))) return "stats";
  if (k === "quote" || /quote|testimonial|manifesto|reveal|climax/.test(p)) return "reveal";
  if (bullets(scene, 2).length >= 2) return "bullets";
  return "showcase";
}

// ---- scene builders ((scene, ctx, assets) -> {html, s}) ----------------------

// SCENE — OPEN: a chrome headline blooms over the synthwave world with a neon subtitle
// under it. Opener energy (the template's Title over RetroWorld).
function bOpen(scene, ctx) {
  const { id, T, L, theme, S } = ctx;
  const kick = esc(scene.kicker || S.openKicker);
  const title = scene.headline || scene.title || "";
  const html = `${open(id, ctx)}<div class="rf-safe">
    <div class="rf-chrome ${id}-title" style="opacity:0;text-align:center;font-size:${r(headlineSize(title, 15))}cqw;background:${theme.chrome};-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;">${esc(title)}</div>
    <div class="rf-neon ${id}-sub" style="opacity:0;margin-top:4cqw;color:${theme.secondary};text-shadow:0 0 3cqw ${theme.secondary};letter-spacing:0.3em;text-transform:uppercase;font-size:${r(headlineSize(scene.subtext || kick, 3.4))}cqw;">${esc(scene.subtext || kick)}</div>
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.4},${T});`,
    `tl.fromTo(".${id}-title",{opacity:0,y:30,scale:0.7},{opacity:1,y:0,scale:1,duration:0.7,ease:"back.out(1.6)"},${r(T + 0.3)});`,
    `tl.fromTo(".${id}-sub",{opacity:0,y:16},{opacity:1,y:0,duration:0.55,ease:"power2.out"},${r(T + 0.9)});`,
    `tl.to(".${id}-title",{scale:1.02,duration:${r(Math.max(1.6, L - 1.6))},ease:"sine.inOut",yoyo:true,repeat:1,transformOrigin:"center center"},${r(T + 1.2)});`,
  ];
  return { html, s };
}

// SCENE — REVEAL: a neon headline lands word-by-word behind a radiating light-burst and a
// white flash. The dramatic peak / statement / climax. Holds one screenshot behind if given.
function bReveal(scene, ctx, sceneAssets) {
  const { id, T, L, theme, S, portrait } = ctx;
  const kick = esc(scene.kicker || S.revealKicker);
  // This beat showed only the headline — the remaining lines the script wrote for the
  // scene were dropped. supportLine takes the first that is not already on screen.
  const supR = supportLine(scene, [scene.kicker || S.revealKicker]);
  const asset = (sceneAssets && sceneAssets[0]) || null;
  const rays = Array.from({ length: 24 }).map((_, i) => {
    const ang = (i / 24) * 360;
    const col = i % 2 ? theme.secondary : theme.primary;
    return `<div style="position:absolute;left:50%;top:44%;transform:rotate(${ang}deg);transform-origin:0 0;"><div class="${id}-ray" style="position:absolute;left:6cqw;top:-0.2cqw;width:40cqw;height:0.4cqw;transform-origin:0 50%;opacity:0;background:linear-gradient(90deg,transparent,${col});"></div></div>`;
  }).join("");
  const shotHtml = asset ? (() => {
    const hmul = frameHmul(asset);
    const pw = fitPlateW(ctx, portrait ? 44 : 30, asset);
    return `<div class="${id}-crt" style="position:absolute;left:50%;top:44%;transform:translate(-50%,-50%);width:${pw};opacity:0;"><div style="position:relative;width:100%;height:${r(parseFloat(pw) * hmul)}cqw;">${crtFrame(theme, asset, theme.primary)}</div></div>`;
  })() : "";
  const html = `${open(id, ctx)}<div class="clip" style="position:absolute;inset:0;">
    ${rays}
    <div class="${id}-burst" style="position:absolute;left:50%;top:44%;width:60cqw;height:60cqw;margin-left:-30cqw;margin-top:-30cqw;border-radius:50%;opacity:0;background:radial-gradient(circle,#fff,${theme.primary} 34%,transparent 70%);mix-blend-mode:screen;"></div>
    ${shotHtml}
    <div class="rf-neon ${id}-kick" style="position:absolute;left:0;right:0;top:${asset ? "12%" : "36%"};text-align:center;opacity:0;color:${theme.primary};text-shadow:0 0 2.4cqw ${theme.primary};letter-spacing:0.16em;text-transform:uppercase;font-size:5cqw;">${kick}</div>
    <div class="rf-chrome ${id}-tag" style="position:absolute;left:0;right:0;top:${asset ? "74%" : "48%"};text-align:center;padding:0 8%;opacity:1;font-size:${r(headlineSize(scene.headline, 12))}cqw;">${neonWords(id, scene.headline || scene.title || "")}</div>
    ${supR ? `<div class="rf-body ${id}-supr" style="position:absolute;left:0;right:0;top:86%;text-align:center;padding:0 10%;opacity:1;">${esc(supR)}</div>` : ""}
    <div class="${id}-flash" style="position:absolute;inset:0;pointer-events:none;background:#fff;opacity:0;mix-blend-mode:screen;"></div>
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.35},${T});`,
    `tl.fromTo(".${id}-ray",{opacity:0,scaleX:0.15},{opacity:0.6,scaleX:1,duration:0.6,ease:"power2.out",stagger:0.008},${r(T + 0.3)});`,
    `tl.to(".${id}-ray",{opacity:0.28,duration:${r(Math.max(1, L - 2))},ease:"sine.inOut",yoyo:true,repeat:1},${r(T + 1)});`,
    `tl.fromTo(".${id}-burst",{opacity:0,scale:0.4},{opacity:0.7,scale:1,duration:0.7,ease:"power2.out"},${r(T + 0.35)});`,
    `tl.to(".${id}-burst",{opacity:0.34,duration:${r(Math.max(1, L - 2))},ease:"sine.inOut",yoyo:true,repeat:1},${r(T + 1.1)});`,
    `tl.fromTo(".${id}-flash",{opacity:0},{opacity:0.75,duration:0.12,yoyo:true,repeat:1,ease:"power2.out"},${r(T + 0.42)});`,
    asset ? `tl.fromTo(".${id}-crt",{opacity:0,y:60,scale:0.86},{opacity:1,y:0,scale:1,duration:0.8,ease:"power3.out"},${r(T + 0.5)});` : "",
    asset ? `tl.to(".${id}-crt",{y:"-=1.2cqw",duration:2,ease:"sine.inOut",yoyo:true,repeat:${reps(L - 2, 2)},overwrite:"auto"},${r(T + 1.6)});` : "",
    `tl.fromTo(".${id}-kick",{opacity:0,y:-14},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 0.7)});`,
    `tl.fromTo(".${id}-nw",{opacity:0,y:24,scale:0.8},{opacity:1,y:0,scale:1,duration:0.5,ease:"back.out(1.7)",stagger:0.08},${r(T + 0.9)});`,
  ].filter(Boolean);
  return { html, s };
}

// SCENE — SHOWCASE: 1–3 neon CRT/arcade cabinets (real screenshots when present) rise on a
// subtle perspective wall under a neon "select mode" headline. The product moment.
function bShowcase(scene, ctx, sceneAssets) {
  const { id, T, L, theme, S, portrait } = ctx;
  const kick = esc(scene.kicker || S.showcaseKicker);
  const shots = (sceneAssets || []).slice(0, 3);
  const single = shots.length <= 1;
  const one = shots[0] || null;
  const labels = Array.isArray(scene.onScreenText) ? scene.onScreenText : [];
  // Only labels[i] paired with a plate were shown; a single-shot showcase therefore
  // dropped the rest of the scene copy. supportLine takes the first line not on screen.
  const supS = supportLine(scene, [scene.headline, scene.title, labels[0]]);
  let stage;
  if (single) {
    const hmul = frameHmul(one) * (portrait ? 1 : 0.9);
    const pw = fitPlateW(ctx, portrait ? 58 : 36, one);
    stage = `<div style="display:flex;justify-content:center;">${crtBlock(id, theme, { w: pw, hcqw: parseFloat(pw) * hmul, asset: one, tint: theme.primary, tilt: -6 })}</div>`;
  } else {
    const tilts = shots.length === 3 ? [-14, 0, 14] : [-10, 10];
    const pw = shots.length >= 3 ? "26cqw" : "34cqw";
    stage = `<div style="display:flex;gap:3cqw;justify-content:center;align-items:flex-end;perspective:1400px;width:100%;">${shots.map((a, i) => {
      const hmul = frameHmul(a) * 1.2;
      const c = i % 2 ? theme.secondary : theme.primary;
      return `<div style="text-align:center;">${crtBlock(`${id}v${i}`, theme, { w: pw, hcqw: parseFloat(pw) * hmul, asset: a, tint: c, tilt: tilts[i] })}<div style="font-family:${theme.monoStack};font-size:2cqw;color:${c};margin-top:2.4cqw;letter-spacing:0.14em;text-transform:uppercase;text-shadow:0 0 1.6cqw ${c};">${esc(labels[i] || "")}</div></div>`;
    }).join("")}</div>`;
  }
  const html = `${open(id, ctx)}<div class="rf-safe">
    <div class="rf-neon ${id}-kick" style="opacity:0;margin-bottom:2.4cqw;color:${theme.secondary};text-shadow:0 0 2.4cqw ${theme.secondary};letter-spacing:0.14em;text-transform:uppercase;font-size:5cqw;">${kick}</div>
    ${scene.headline ? `<div class="rf-h1 ${id}-head" style="opacity:0;text-align:center;font-size:${r(headlineSize(scene.headline, 6.5))}cqw;margin-bottom:5cqw;">${esc(scene.headline)}</div>` : ""}
    ${stage}
    ${supS ? `<div class="rf-body ${id}-sups" style="opacity:0;margin-top:3cqw;max-width:80%;text-align:center;">${esc(supS)}</div>` : ""}
  </div></div>`;
  const crtTargets = single ? `.${id}-crt` : shots.map((_, i) => `.${id}v${i}-crt`).join(",");
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.35},${T});`,
    `tl.fromTo(".${id}-kick",{opacity:0,y:-14},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 0.2)});`,
    scene.headline ? `tl.fromTo(".${id}-head",{opacity:0,y:22},{opacity:1,y:0,duration:0.55,ease:"power2.out"},${r(T + 0.35)});` : "",
    `tl.fromTo("${crtTargets}",{opacity:0,y:70,scale:0.86},{opacity:1,y:0,scale:1,duration:0.7,ease:"power3.out",stagger:0.14},${r(T + 0.55)});`,
    `tl.to("${crtTargets}",{y:"-=1.4cqw",duration:1.9,ease:"sine.inOut",yoyo:true,repeat:${reps(L - 1.5, 1.9)},stagger:0.1,overwrite:"auto"},${r(T + 1.5)});`,
  ].filter(Boolean);
  return { html, s };
}

// SCENE — STATS: a giant chrome/neon number ignites over the world with a label under it.
// For proof / metric / result scenes.
function bStats(scene, ctx, sceneAssets) {
  const { id, T, L, theme, S, portrait } = ctx;
  const kick = esc(scene.kicker || S.statsKicker);
  const num = numberOf(scene) || String(scene.headline || scene.title || "").slice(0, 8);
  const label = esc(String(scene.subtext || scene.headline || "").slice(0, 60));
  const asset = (sceneAssets && sceneAssets[0]) || null;
  // When the CD assigned a dashboard screenshot to this proof/metric scene, mount it in a
  // dimmed neon CRT plate BEHIND the giant chrome number (the same "screenshot behind the
  // neon headline" idea as bReveal) so the metric reads over the real product. The <img>
  // sits in an inner element GSAP never transforms; GSAP animates the outer `.${id}-crt`.
  const pw = fitPlateW(ctx, portrait ? 62 : 40, asset);
  const shotHtml = asset
    ? `<div class="${id}-crt" style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:${pw};opacity:0;"><div style="position:relative;width:100%;height:${r(parseFloat(pw) * frameHmul(asset))}cqw;filter:brightness(0.5) saturate(1.2);">${crtFrame(theme, asset, theme.secondary)}</div></div>`
    : "";
  const html = `${open(id, ctx)}<div class="rf-safe">
    ${shotHtml}
    <div class="rf-neon ${id}-kick" style="position:relative;z-index:1;opacity:0;margin-bottom:3cqw;color:${theme.secondary};text-shadow:0 0 2.4cqw ${theme.secondary};letter-spacing:0.2em;text-transform:uppercase;font-size:4cqw;">${kick}</div>
    <div class="rf-chrome ${id}-num" style="position:relative;z-index:1;opacity:0;text-align:center;font-size:${r(headlineSize(num, 26))}cqw;background:${theme.chrome};-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;${asset ? "filter:drop-shadow(0 0 3.4cqw " + theme.primary + ") drop-shadow(0 0.2cqw 0 " + theme.secondary + ");" : ""}">${esc(num)}</div>
    ${label ? `<div class="rf-body ${id}-lab" style="position:relative;z-index:1;opacity:0;margin-top:2.4cqw;max-width:80%;text-align:center;">${label}</div>` : ""}
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.4},${T});`,
    asset ? `tl.fromTo(".${id}-crt",{opacity:0,y:60,scale:0.86},{opacity:0.9,y:0,scale:1,duration:0.8,ease:"power3.out"},${r(T + 0.35)});` : "",
    asset ? `tl.to(".${id}-crt",{y:"-=1.2cqw",duration:2,ease:"sine.inOut",yoyo:true,repeat:${reps(L - 2, 2)},overwrite:"auto"},${r(T + 1.6)});` : "",
    `tl.fromTo(".${id}-kick",{opacity:0,y:-14},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 0.2)});`,
    `tl.fromTo(".${id}-num",{opacity:0,scale:0.6,filter:"blur(8px)"},{opacity:1,scale:1,filter:"blur(0px)",duration:0.75,ease:"back.out(1.7)"},${r(T + 0.4)});`,
    label ? `tl.fromTo(".${id}-lab",{opacity:0,y:16},{opacity:1,y:0,duration:0.55,ease:"power2.out"},${r(T + 1)});` : "",
    `tl.to(".${id}-num",{scale:1.03,duration:${r(Math.max(1.6, L - 1.8))},ease:"sine.inOut",yoyo:true,repeat:1,transformOrigin:"center center"},${r(T + 1.2)});`,
  ].filter(Boolean);
  return { html, s };
}

// SCENE — BULLETS: a neon headline plus a rising stack of arcade feature chips. "Direct
// every detail." The dynamic default for bullet scenes.
function bBullets(scene, ctx) {
  const { id, T, L, theme, S } = ctx;
  const kick = esc(scene.kicker || S.bulletsKicker);
  // This beat rendered its headline and nothing else — the rest of the copy the script
  // wrote for the scene was dropped. supportLine takes the first line not already shown.
  const sup = supportLine(scene, [scene.kicker || S.bulletsKicker]);
  let chips = bullets(scene, 5);
  if (!chips.length) chips = [String(scene.headline || scene.title || "")].filter(Boolean);
  const chipHtml = chips.map((c, i) =>
    `<div class="rf-chip ${id}-chip" style="opacity:0;"><span class="rf-dot" style="background:${i % 2 ? theme.secondary : theme.primary};box-shadow:0 0 1.4cqw ${i % 2 ? theme.secondary : theme.primary};"></span>${esc(c)}</div>`
  ).join("");
  const html = `${open(id, ctx)}<div class="rf-safe">
    <div class="rf-neon ${id}-kick" style="opacity:0;margin-bottom:2.4cqw;color:${theme.secondary};text-shadow:0 0 2.4cqw ${theme.secondary};letter-spacing:0.14em;text-transform:uppercase;font-size:4.4cqw;">${kick}</div>
    ${scene.headline ? `<div class="rf-h1 ${id}-head" style="opacity:0;text-align:center;font-size:${r(headlineSize(scene.headline, 7.5))}cqw;margin-bottom:4.5cqw;">${esc(scene.headline)}</div>` : ""}
    <div style="display:flex;flex-direction:column;gap:2cqw;align-items:center;">${chipHtml}</div>
    ${sup && !chipHtml ? `<div class="rf-body ${id}-sup" style="opacity:0;margin-top:2.6cqw;max-width:78%;text-align:center;">${esc(sup)}</div>` : ""}
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.35},${T});`,
    `tl.fromTo(".${id}-kick",{opacity:0,y:-16},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 0.2)});`,
    scene.headline ? `tl.fromTo(".${id}-head",{opacity:0,y:24,scale:0.94},{opacity:1,y:0,scale:1,duration:0.6,ease:"power3.out"},${r(T + 0.35)});` : "",
    `tl.fromTo(".${id}-chip",{opacity:0,y:26,scale:0.9},{opacity:1,y:0,scale:1,duration:0.5,ease:"back.out(1.6)",stagger:0.14},${r(T + 0.7)});`,
    `tl.to(".${id}-chip",{y:"-=0.9cqw",duration:2.2,ease:"sine.inOut",yoyo:true,repeat:${reps(L - 1.4, 2.2)},stagger:0.12,overwrite:"auto"},${r(T + 1.5)});`,
  ].filter(Boolean);
  return { html, s };
}

// SCENE — CTA: the logo mark assembles (the user's logo when uploaded, else a built play
// glyph), a chrome wordmark types in char-by-char, a blinking neon "Press Start" button
// pulses and a mono URL settles.
function bCta(scene, ctx, logo) {
  const { id, T, L, theme, S } = ctx;
  const word = String(scene.headline || scene.title || "KEYFRAME").slice(0, 20);
  const btn = esc(String(scene.emphasis || S.ctaButton).slice(0, 24));
  const tagline = esc(String(scene.subtext || S.ctaTagline).slice(0, 60));
  const url = esc(String(S.ctaUrl).toUpperCase());
  const mark = logo && logo.path
    ? logoMark(logo, { sizeCqw: 22, ground: theme.bgDeep, glow: theme.primary, escape: esc })
    : `<div style="position:relative;width:20cqw;height:20cqw;">
        <div style="position:absolute;inset:8%;border:0.4cqw solid ${theme.border};border-radius:20%;box-shadow:0 0 2cqw ${theme.secondary};"></div>
        <div style="position:absolute;inset:0;border-radius:20%;background:${theme.chrome};box-shadow:0 0 6cqw ${theme.primary};display:flex;align-items:center;justify-content:center;">
          <div style="width:0;height:0;border-top:3.4cqw solid transparent;border-bottom:3.4cqw solid transparent;border-left:5.4cqw solid ${theme.onPrimary};margin-left:1.2cqw;"></div>
        </div>
      </div>`;
  const chars = charSpans(word, `${id}-ch`);
  const html = `${open(id, ctx)}<div class="rf-safe">
    <div class="rf-neon ${id}-kick" style="opacity:0;margin-bottom:2.4cqw;color:${theme.secondary};text-shadow:0 0 2.4cqw ${theme.secondary};letter-spacing:0.24em;text-transform:uppercase;font-size:3.4cqw;">${esc(scene.kicker || S.ctaKicker)}</div>
    <div class="${id}-mark" style="opacity:0;">${mark}</div>
    <div class="rf-wordmark ${id}-wm" style="margin-top:3.4cqw;background:${theme.chrome};-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;">${chars}</div>
    <div class="rf-body ${id}-tag" style="opacity:0;margin-top:1.8cqw;">${tagline}</div>
    <div class="rf-btn ${id}-btn" style="opacity:0;margin-top:3.6cqw;color:${theme.primary};border:0.4cqw solid ${theme.primary};box-shadow:0 0 3cqw ${theme.primary};">▸ ${btn}</div>
    <div class="${id}-url" style="opacity:0;font-family:${theme.monoStack};letter-spacing:0.24em;font-size:2.4cqw;color:${theme.faint};margin-top:2.4cqw;">${url}</div>
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.4},${T});`,
    `tl.fromTo(".${id}-kick",{opacity:0,y:-14},{opacity:1,y:0,duration:0.45,ease:"power2.out"},${r(T + 0.2)});`,
    `tl.fromTo(".${id}-mark",{opacity:0,scale:0.6,y:20},{opacity:1,scale:1,y:0,duration:0.6,ease:"back.out(1.7)"},${r(T + 0.35)});`,
    `tl.fromTo(".${id}-ch",{opacity:0,y:60},{opacity:1,y:0,duration:0.5,ease:"power3.out",stagger:0.04},${r(T + 0.7)});`,
    `tl.fromTo(".${id}-tag",{opacity:0,y:14},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 1.2)});`,
    `tl.fromTo(".${id}-btn",{opacity:0,scale:0.8},{opacity:1,scale:1,duration:0.5,ease:"back.out(2)"},${r(T + 1.45)});`,
    // "Press Start" blink (finite yoyo) — the arcade flicker.
    `tl.to(".${id}-btn",{opacity:0.5,duration:0.5,ease:"steps(1)",yoyo:true,repeat:${reps(L - 2.05, 0.5)}},${r(T + 2.05)});`,
    `tl.fromTo(".${id}-url",{opacity:0},{opacity:1,duration:0.5},${r(T + 1.7)});`,
  ];
  return { html, s };
}

const BUILDERS = { open: bOpen, reveal: bReveal, showcase: bShowcase, stats: bStats, bullets: bBullets, cta: bCta };

// ---- persistent SYNTHWAVE world canvas (hf-seek) -----------------------------
// One canvas painted purely from the renderer's hf-seek time: the outrun sky, a twinkling
// starfield, a banded neon sun on the horizon, an infinite neon perspective grid scrolling
// to the vanishing point, a glowing horizon line, CRT scanlines and a vignette. Colored
// ONLY with theme.primary/secondary (+ the fixed dark grounds), so a brand skin recolors
// the whole world. Live preview drives it off the timeline; render is hf-seek only.
function worldClip(theme, dims, D, seed) {
  const W = dims.width, H = dims.height;
  const [pr, pg, pb] = hexToRgb(theme.primary);
  const [sr, sg, sb] = hexToRgb(theme.secondary);
  const [dr, dg, db] = hexToRgb(theme.bgDeep);
  const skyTopRgb = hexToRgb(theme.skyTop).join(","); // deep purple zenith
  const skyMid = mixRgb(theme.secondary, theme.skyMid, 0.30); // secondary-tinted mid sky
  const skyBot = mixRgb(theme.primary, theme.skyBot, 0.40);   // primary-tinted horizon sky
  const html = `<div id="rf-world-clip" class="clip" data-start="0" data-duration="${D}" data-track-index="0" data-layout-allow-occlusion style="background:${theme.bgDeep};">
    <canvas id="rf-world" width="${W}" height="${H}" style="position:absolute;inset:0;width:100%;height:100%;"></canvas>
  </div>`;
  const script = `(function(){
  var cv=document.getElementById("rf-world");if(!cv||!cv.getContext)return;var cx=cv.getContext("2d");if(!cx)return;
  var W=${W},H=${H},HZ=H*0.52;
  function P(a){return "rgba(${pr},${pg},${pb},"+a+")";}
  function S(a){return "rgba(${sr},${sg},${sb},"+a+")";}
  var GD="rgba(${dr},${dg},${db},";
  var sd=${seed >>> 0};function rnd(){sd=(sd*1664525+1013904223)>>>0;return sd/4294967296;}
  var STN=46,ST=[];for(var i=0;i<STN;i++){ST.push({x:rnd(),y:rnd()*0.5,s:1+2.4*rnd(),ph:rnd()*6.28});}
  var SUNR=W*0.34;
  function draw(t){
    // outrun sky (top -> horizon)
    var sg=cx.createLinearGradient(0,0,0,HZ);sg.addColorStop(0,"rgb(${skyTopRgb})");sg.addColorStop(0.5,"rgb(${skyMid})");sg.addColorStop(1,"rgb(${skyBot})");cx.fillStyle=sg;cx.fillRect(0,0,W,HZ);
    // deep ground below horizon
    cx.fillStyle=GD+"1)";cx.fillRect(0,HZ,W,H-HZ);
    // starfield (twinkle)
    for(var i=0;i<ST.length;i++){var st=ST[i];cx.globalAlpha=0.3+0.5*(0.5+0.5*Math.sin(t*2+st.ph));cx.fillStyle="#fff";cx.beginPath();cx.arc(st.x*W,st.y*HZ,st.s,0,6.283);cx.fill();}
    cx.globalAlpha=1;
    // banded neon sun sitting on the horizon
    cx.save();cx.beginPath();cx.rect(0,0,W,HZ);cx.clip();
    var scy=HZ-SUNR,cg=cx.createLinearGradient(0,scy-SUNR,0,scy+SUNR);cg.addColorStop(0,S(1));cg.addColorStop(1,P(1));cx.fillStyle=cg;cx.beginPath();cx.arc(W*0.5,scy,SUNR,0,6.283);cx.fill();
    // horizontal bands (thicker gaps lower) carve the retro sun
    cx.fillStyle=GD+"1)";for(var b=0;b<7;b++){var by=scy+SUNR*(0.16+b*0.12),bh=SUNR*(0.03+b*0.015);cx.fillRect(W*0.5-SUNR,by,SUNR*2,bh);}
    cx.restore();
    // neon perspective grid floor (scrolls toward the viewer)
    var top=HZ,gh=H-HZ,vp=W*0.5,gu=W*0.09,sc=(t*80)%gu;
    cx.lineWidth=2;cx.shadowColor=S(1);cx.shadowBlur=6;
    for(var ri=0;ri<24;ri++){var f=Math.pow((ri+sc/gu)/24,1.9);var yy=top+f*gh;if(yy<top||yy>H)continue;cx.globalAlpha=0.85*(1-f)+0.05;cx.strokeStyle=S(1);cx.beginPath();cx.moveTo(0,yy);cx.lineTo(W,yy);cx.stroke();}
    for(var v=-10;v<=10;v++){cx.globalAlpha=0.5;cx.strokeStyle=S(1);cx.beginPath();cx.moveTo(vp+v*gu*0.5,top);cx.lineTo(vp+v*W*0.2,H);cx.stroke();}
    cx.shadowBlur=0;cx.globalAlpha=1;
    // glowing horizon line
    cx.save();cx.shadowColor=P(1);cx.shadowBlur=24;cx.fillStyle=S(1);cx.fillRect(0,HZ-2,W,4);cx.restore();
    // CRT scanlines
    cx.globalAlpha=0.14;cx.fillStyle="#000";for(var y=0;y<H;y+=4){cx.fillRect(0,y,W,2);}cx.globalAlpha=1;
    // vignette
    var vg=cx.createRadialGradient(W*0.5,H*0.5,Math.min(W,H)*0.2,W*0.5,H*0.5,Math.max(W,H)*0.78);vg.addColorStop(0,GD+"0)");vg.addColorStop(1,GD+"0.9)");cx.fillStyle=vg;cx.fillRect(0,0,W,H);
  }
  // Painted ONLY from the renderer's hf-seek time — deterministic, seek-exact, capture-safe.
  window.KF_WORLD=draw;window.addEventListener("hf-seek",function(e){draw((e.detail&&e.detail.time)||0);});draw(0);
})();`;
  return { html, script };
}

// ---- scanline overlay (top layer) --------------------------------------------
function scanClip(D) {
  return `<div id="rf-scan" class="clip" data-start="0" data-duration="${D}" data-track-index="40" data-layout-allow-occlusion style="pointer-events:none;background-image:repeating-linear-gradient(0deg, rgba(0,0,0,0.10) 0 2px, transparent 2px 4px);opacity:0.5;mix-blend-mode:multiply;"></div>`;
}

// ---- style -------------------------------------------------------------------
function styleBlock(theme, portrait) {
  const safePad = portrait ? "12% 7% 14%" : "8% 8% 10%";
  return `${theme.fontFace}
  * { box-sizing:border-box; margin:0; padding:0; }
  html, body { width:100%; height:100%; overflow:hidden; background:#000; }
  #root { position:relative; overflow:hidden; isolation:isolate; background:${theme.bgDeep}; container-type:size; color:${theme.ink}; font-family:${theme.bodyStack}; }
  .clip { position:absolute; top:0; left:0; width:100%; height:100%; overflow:hidden; }
  .rf-safe { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:${safePad}; text-align:center; }
  .rf-chrome { font-family:${theme.displayStack}; font-weight:800; font-style:italic; line-height:0.94; letter-spacing:-0.01em; filter:drop-shadow(0 0 2.4cqw ${theme.primary}) drop-shadow(0 0.2cqw 0 ${theme.secondary}); }
  .rf-h1 { font-family:${theme.displayStack}; font-weight:700; font-style:italic; line-height:1.02; letter-spacing:0.01em; color:${theme.ink}; text-shadow:0 0 2cqw ${theme.secondary}; }
  .rf-neon { font-family:${theme.displayStack}; font-weight:700; font-style:italic; line-height:1.1; }
  .rf-nword { will-change:transform,opacity; }
  .rf-body { font-family:${theme.bodyStack}; font-weight:500; font-size:2.7cqw; line-height:1.42; color:${theme.dim}; }
  .rf-wordmark { display:flex; font-family:${theme.displayStack}; font-weight:800; font-style:italic; font-size:12cqw; letter-spacing:-0.01em; filter:drop-shadow(0 0 2.4cqw ${theme.primary}); }
  .rf-chip { display:inline-flex; align-items:center; gap:1.4cqw; padding:1.8cqw 3.4cqw; border-radius:0; background:rgba(10,4,28,0.55); border:0.24cqw solid ${theme.border}; font-family:${theme.monoStack}; font-weight:600; font-size:2.7cqw; letter-spacing:0.06em; color:${theme.ink}; white-space:nowrap; box-shadow:0 0 2cqw -0.4cqw ${theme.primary}; will-change:transform,opacity; }
  .rf-dot { width:1.6cqw; height:1.6cqw; border-radius:50%; flex:0 0 auto; }
  .rf-btn { display:inline-flex; align-items:center; gap:1cqw; padding:2.8cqw 6.4cqw; border-radius:0; background:rgba(10,4,28,0.5); font-family:${theme.displayStack}; font-style:italic; font-weight:700; font-size:4cqw; letter-spacing:0.14em; text-transform:uppercase; text-shadow:0 0 1.6cqw ${theme.primary}; will-change:transform,opacity; }
  .rf-crt { will-change:transform,opacity; }
  #caps { position:absolute; inset:0; display:flex; justify-content:center; align-items:flex-end; padding-bottom:${portrait ? "16%" : "7%"}; z-index:60; pointer-events:none; }
  #cap-pill { max-width:82%; height:fit-content; flex:0 0 auto; text-align:center; padding:1.4cqw 3cqw; opacity:0; border-radius:0; background:rgba(8,3,22,0.72); border:0.2cqw solid ${theme.border}; backdrop-filter:blur(6px); box-shadow:0 0 2cqw -0.4cqw ${theme.secondary}; }
  #cap-text { font-family:${theme.bodyStack}; font-weight:600; font-size:2.6cqw; line-height:1.35; color:${theme.ink}; }`;
}

// ---- MAIN --------------------------------------------------------------------
function buildComposition({ storyboard, dims, framePack, captionCues, assets, brandSkin = null, localized = null } = {}) {
  const theme = retroTheme(brandSkin);
  const S = localized ? { ...STRINGS, ...localized } : STRINGS;
  const sb = storyboard || {};
  const W = (dims && dims.width) || 1080, H = (dims && dims.height) || 1920;
  const portrait = W < H;
  const scenes = Array.isArray(sb.scenes) && sb.scenes.length
    ? sb.scenes.slice(0, 12)
    : [{ id: "s1", start: 0, duration: 5, kind: "hook", headline: sb.title || "KEYFRAME" }];
  const D = r(sb.durationSec || scenes.reduce((a, s) => Math.max(a, (Number(s.start) || 0) + (Number(s.duration) || 0)), 0) || 12);
  const seed = seedFrom(sb.title || (scenes[0] && scenes[0].headline) || "retro");

  // ---- Assets: distribute real screenshots across DISPLAY-CAPABLE scenes -------
  // A screenshot must NEVER be stranded on a scene that can't show it (open / stats / cta).
  // The Creative Director's per-asset `sceneId` is a HINT: honored when that scene can
  // display an image, else the shot is redistributed to the least-loaded display scene —
  // so every usable screenshot actually appears. The logo is reserved for the CTA mark.
  const logo = logoAssetOf(assets);
  const shots = (Array.isArray(assets) ? assets : []).filter(screenOk)
    .sort((a, b) => (Number(b.cdScore) || 0) - (Number(a.cdScore) || 0));
  const baseArch = scenes.map((scene, i) => archetypeFor(scene, i, scenes.length));
  const canShow = (a) => a === "showcase" || a === "reveal" || a === "bullets" || a === "stats";
  const displayIdx = scenes.map((_, i) => i).filter((i) => canShow(baseArch[i]));
  // A valuable owned screenshot must NEVER produce a fully text-only film: if archetype
  // routing left NO display-capable scene (a realistic hook/stat/stat/cta deck), force the
  // best non-cta content scene (a stat, else the hook) into a display-capable showcase.
  if (!displayIdx.length && shots.length) {
    const j = scenes.findIndex((_, i) => baseArch[i] !== "cta" && baseArch[i] !== "open");
    const k = j >= 0 ? j : scenes.findIndex((_, i) => baseArch[i] !== "cta");
    if (k >= 0) { baseArch[k] = "showcase"; displayIdx.push(k); }
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
    // A display-capable scene that received screenshots shows them: 3+ → a CRT cabinet row
    // (showcase); 1–2 → a focused CRT; a bullets scene with shots becomes a showcase; a
    // reveal keeps its neon headline with one screenshot behind. Scenes with none keep base.
    if (canShow(arch) && sceneAssets.length) {
      // A reveal keeps its neon headline over ONE screenshot; a stats scene keeps its giant
      // chrome number over ONE CRT dashboard plate — both preserve their signature identity.
      if (arch === "reveal" || arch === "stats") { sceneAssets = sceneAssets.slice(0, 1); }
      else if (sceneAssets.length >= 3) { arch = "showcase"; sceneAssets = sceneAssets.slice(0, 3); }
      else { arch = "showcase"; sceneAssets = sceneAssets.slice(0, portrait ? 2 : 3); }
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

  const world = worldClip(theme, { width: W, height: H }, D, seed);
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
    if(window.KF_WORLD)window.KF_WORLD(now);
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
    world.html,
    bodyParts.join("\n"),
    scanClip(D),
    caps,
    `</div>`,
    `<script>`, world.script, `</script>`,
    `<script>`, script, `</script>`,
    `</body>`, `</html>`,
  ].join("\n");

  const metaJson = JSON.stringify({ compositionId: "vid", width: W, height: H, fps: (dims && dims.fps) || 30, duration: D });
  return { indexHtml, metaJson, resolvedBrand: theme.resolvedBrand };
}

module.exports = { buildComposition, STRINGS };
