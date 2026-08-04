// PAPER CRAFT composer — a native GSAP + canvas "layered cut-paper / papercraft" film.
// The pack `paper-craft` (manifest renderer:"paper-craft") routes here from
// attemptLlmComposition, exactly like the flagship / kinetic / product-showcase composers.
//
// Ported from the imported OmniMotion/React template ("Paper Craft"). The React runtime is
// replaced by KEYFRAME's HyperFrames contract, but the identity is kept:
//   • a PERSISTENT animated PAPER backdrop — a warm cream ground carrying soft drifting
//     cut-paper shapes with soft drop-shadows, a paper grain and a soft top light —
//     painted on ONE <canvas> as a pure function of the renderer's hf-seek time
//     (deterministic; flows continuously across every cut, so scene boundaries frame-match
//     on the same paper).
//   • layered construction-paper sheets, pop-up / fold-in reveals with a tactile bounce,
//     screenshots PASTED onto paper photo-cards with a soft shadow and a slight rotation,
//     paper chips, a confetti-free pop headline and a paper-button CTA.
//
// EVERYTHING is theme-driven: paperTheme(accent) derives every paper tint (paper1/paper2/
// paperDeep), the accent-ink emphasis, the highlight sheet, the cut-out photo wash and the
// CTA button — so a brand skin recolors the WHOLE collage, not just the text. The paper is
// a warm LIGHT ground (isDark:false); the brand accent is fit UP/DOWN to read on it.
//
// Engineering contract (identical to the other native composers): one paused GSAP timeline
// on window.__timelines["vid"]; direct-child .clip scenes on unique tracks; a boundary
// opacity:0 hard-kill per scene (the paper persists behind them); ONE seek-safe caption
// node (#cap-text) driven by a single onUpdate proxy; finite repeats; cqw units +
// container-type:size (portrait-native, 9:16); hidden = opacity:0 only. GSAP animates the
// OUTER wrapper; the static paper rotation lives on an INNER wrapper GSAP never touches.
// Portrait is detected from dims (W<H); no manifest flag. Deterministic.

const { fontFaceCss, isBundled } = require("../fonts/pack_fonts");
const { varyArchetypes } = require("./motion_planner");
const { isTrustedProminent, isLogo } = require("./asset_priority");
const { logoMark } = require("./logo_render");
const { plateBox } = require("./responsive");
const { charSpans, wordCharSpans, supportLine } = require("./text_fx");
const { resolveBrand } = require("./brand_kit");
const { GSAP_CDN, r, esc, hexToRgb, relLum, longestWord, bullets, logoAssetOf, grainUri } = require("./composer_kit");

// Bricolage Grotesque (bundled) is the friendly rounded display that carries the template's
// Poppins spirit; Fraunces (bundled) is the warm serif that stands in for the handwritten
// Caveat accents; IBM Plex Mono is the bundled numeral/label face; Inter → system-ui.
const DISPLAY = "Bricolage Grotesque";
const SERIF = "Fraunces";
const MONO = "IBM Plex Mono";
const BODY = "Inter";

// The template's default warm papers when no brand is applied.
const DEF_ACCENT = "#E07A3F";
const CREAM = "#f1e7d3";
const INK = "#40352a";
// Paper tint bases the accent is mixed INTO (warm off-whites), lifted from the source.
const PAPER1_BASE = "#f4ecdb";
const PAPER2_BASE = "#f0e4cd";
const PAPERDEEP_BASE = "#efe2c8";

// ---- helpers -----------------------------------------------------------------
// sRGB mix of two hexes (canvas can't do color-mix); wa is the accent weight.
function mixRgb(aHex, bHex, wa) { const a = hexToRgb(aHex), b = hexToRgb(bHex); return [0, 1, 2].map((i) => Math.round(a[i] * wa + b[i] * (1 - wa))); }
const rgbStr = (a) => `${a[0]},${a[1]},${a[2]}`;
function seedFrom(str) { let h = 2166136261; const s = String(str || "papercraft"); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) || 7; }
// finite yoyo repeat count for a segment of `t` seconds at period `c`.
function reps(t, c) { return Math.max(0, Math.floor((Number(t) || 0) / (c || 1)) - 1); }

// ---- theme -------------------------------------------------------------------
// resolveBrand fits the brand accent to the warm CREAM paper (isDark:false → nudged for
// contrast on a LIGHT ground) and passes the pack accent through untouched when no skin —
// so a null skin renders the exact default paper byte-for-byte and resolvedBrand is null
// (honest "unbranded"). When applied, the single accent becomes the brand's and every
// derived value (every paper tint, the accent ink, the highlight, the photo wash, the CTA
// button) follows, and resolvedBrand echoes what was worn.
function paperTheme(brandSkin) {
  const fontFace = (isBundled(DISPLAY) ? fontFaceCss(DISPLAY) : "") + (isBundled(SERIF) ? fontFaceCss(SERIF) : "") + (isBundled(MONO) ? fontFaceCss(MONO) : "");
  let accent = DEF_ACCENT, resolvedBrand = null;
  try {
    const brand = resolveBrand(brandSkin, { ground: CREAM, isDark: false, packAccents: [DEF_ACCENT] });
    if (brand.applied) {
      accent = brand.accent || accent;
      resolvedBrand = {
        ...(brandSkin && typeof brandSkin === "object" ? brandSkin : {}),
        accents: [accent], emphasis: brand.emphasis, adjusted: brand.adjusted,
        dropped: brand.dropped, tier: brand.tier, applied: true,
      };
    }
  } catch { accent = DEF_ACCENT; resolvedBrand = null; }
  const onAccent = relLum(accent) > 0.6 ? INK : "#ffffff";
  return {
    accent, onAccent, cream: CREAM, ink: INK,
    inkSoft: "rgba(64,53,42,0.6)", inkFaint: "rgba(64,53,42,0.34)",
    paper1: `color-mix(in oklab, ${accent} 14%, ${PAPER1_BASE})`,
    paper2: `color-mix(in oklab, ${accent} 34%, ${PAPER2_BASE})`,
    paperDeep: `color-mix(in oklab, ${accent} 60%, ${PAPERDEEP_BASE})`,
    accentInk: `color-mix(in oklab, ${accent} 72%, ${INK})`,
    accentSoft: `color-mix(in oklab, ${accent} 42%, transparent)`,
    highlight: `color-mix(in oklab, ${accent} 22%, #ffffff)`,
    gradient: `linear-gradient(120deg, ${accent}, color-mix(in oklab, ${accent} 62%, #ffffff))`,
    photoPaper: "#fbf6ec",
    tape: "rgba(255,255,255,0.5)",
    shadow: "0 3cqw 5.6cqw -2.6cqw rgba(74,54,34,0.5)",
    shadowSm: "0 1.4cqw 3cqw -1.6cqw rgba(74,54,34,0.45)",
    displayStack: `'${DISPLAY}', 'Inter', system-ui, sans-serif`,
    serifStack: `'${SERIF}', Georgia, serif`,
    monoStack: `'${MONO}', ui-monospace, monospace`,
    bodyStack: `'${BODY}', system-ui, sans-serif`,
    // Canvas RGB precomputes (color-mix isn't available on <canvas>).
    cvCream: rgbStr(hexToRgb(CREAM)), cvInk: rgbStr(hexToRgb(INK)), cvAccent: rgbStr(hexToRgb(accent)),
    cvPaper1: rgbStr(mixRgb(accent, PAPER1_BASE, 0.14)),
    cvPaper2: rgbStr(mixRgb(accent, PAPER2_BASE, 0.34)),
    cvPaperDeep: rgbStr(mixRgb(accent, PAPERDEEP_BASE, 0.6)),
    fontFace, resolvedBrand,
  };
}

// ---- fixed copy (localizable) ------------------------------------------------
const STRINGS = {
  openKicker: "Made by hand",
  popupKicker: "Cut & folded",
  showcaseKicker: "Pasted in",
  bulletsKicker: "In the kit",
  statementKicker: "The idea",
  ctaKicker: "Ready when you are",
  ctaButton: "Start creating",
  ctaTagline: "Your story, crafted.",
  ctaUrl: "keyframe.ai",
};

// ---- content extraction (shared shapes) --------------------------------------
function wordsOf(t) { return String(t || "").trim().split(/\s+/).filter(Boolean); }
function pickNumber(scene) {
  const src = [scene.emphasis, scene.subtext, scene.headline, ...(Array.isArray(scene.onScreenText) ? scene.onScreenText : [])]
    .map((x) => String(x || "")).find((x) => /\d/.test(x)) || "";
  return /\d/.test(src);
}
// The first short numeric token to spotlight (e.g. "10x", "99%"), else "".
function numberOf(scene) {
  const src = [scene.emphasis, ...(Array.isArray(scene.onScreenText) ? scene.onScreenText : []), scene.headline, scene.subtext]
    .map((x) => String(x || "")).find((x) => /\d/.test(x)) || "";
  const m = src.match(/[$€£]?\d[\d.,]*\s?(?:%|x|k|m|b|\+|st|nd|rd|th)?/i);
  return m ? m[0].trim() : "";
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
// Split a headline into word spans for the reveal; the last word carries the accent ink.
function accentWords(id, text) {
  const ws = wordsOf(text).slice(0, 10);
  return ws.map((w) =>
    `<span class="pc-gword ${id}-gw" style="display:inline-block;opacity:0;margin:0 0.22em 0.08em 0;">${esc(w)}</span>`
  ).join("");
}

// ---- asset gate + PAPER photo-card -------------------------------------------
function screenOk(a) {
  if (!a || !a.path) return false;
  if (isLogo(a)) return false; // the logo is CTA / key-moment material, not a photo plate
  if (a.type === "video" || /\.(mp4|webm|mov)($|\?)/i.test(a.path)) return false;
  if (/\.svg($|\?)/i.test(a.path)) return false;
  return isTrustedProminent(a) || a.cdProminence === "hero" || a.cdProminence === "support";
}
// Portrait screenshots want a taller card; wide ones a shorter one.
function frameHmul(asset) {
  const ratio = Number(asset && asset.ratio) || (asset && asset.width && asset.height ? asset.width / asset.height : 0);
  if (ratio && ratio < 0.9) return 1.34;  // phone / portrait shot
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

// A paper "photo" — a real screenshot PASTED onto a warm paper card with a soft shadow, a
// slight rotation and a strip of tape — or, with no asset, an intentional branded
// placeholder (paper wash + a glowing accent node) so an empty slot still reads as designed,
// never blank. GSAP animates the OUTER `.cls`; the paper rotation is static CSS on the inner
// wrapper GSAP never touches (so the float can't discard it). `w` is card width in cqw.
function photoCard(theme, { cls, w, asset, label, tape, rot }) {
  const hmul = frameHmul(asset);
  const imgH = r(w * hmul);
  const pad = r(w * 0.05);
  const capH = r(w * 0.14);
  const inner = asset && asset.path
    ? `<img src="${esc(asset.path)}" alt="${esc(asset.alt || "")}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;">`
    : `<div style="position:absolute;inset:0;background:${theme.paper2};"></div>` +
      `<div style="position:absolute;inset:0;background-image:radial-gradient(circle at 50% 42%, ${theme.accentSoft}, transparent 62%);"></div>` +
      `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;"><div style="width:22%;aspect-ratio:1;border-radius:50%;background:${theme.gradient};box-shadow:${theme.shadowSm};opacity:0.9;"></div></div>`;
  const tapeEl = tape ? `<div class="pc-tape" style="position:absolute;left:50%;top:-2.4cqw;width:${r(w * 0.3)}cqw;height:4cqw;margin-left:${r(-w * 0.15)}cqw;transform:rotate(-6deg);"></div>` : "";
  return `<div class="${cls}" style="opacity:0;width:${w}cqw;">
    <div class="pc-polaroid" style="transform:rotate(${rot || 0}deg);padding:${pad}cqw;padding-bottom:${r(pad + capH)}cqw;">
      ${tapeEl}
      <div class="pc-slot" style="height:${imgH}cqw;">${inner}</div>
      ${label ? `<div class="pc-caphand">${esc(label)}</div>` : ""}
    </div>
  </div>`;
}

// ---- scene clip open ---------------------------------------------------------
function open(id, ctx) { return `<div class="clip pc-scene" id="${id}" data-start="${ctx.T}" data-duration="${r(ctx.L)}" data-track-index="${ctx.track}" style="opacity:0;">`; }

// ---- archetype selection -----------------------------------------------------
function archetypeFor(scene, i, total) {
  const k = String(scene.kind || "").toLowerCase();
  const p = String(scene.purpose || "").toLowerCase();
  if (i === 0 || k === "hook" || k === "title" || /hook|intro|open/.test(p)) return "open";
  if (i === total - 1 || k === "cta" || /cta|close|sign\s*up|subscribe|download|get\s*started/.test(p)) return "cta";
  if (k === "quote" || /quote|testimonial|manifesto/.test(p)) return "statement";
  if (k === "stat" || k === "chart" || k === "countdown" || (pickNumber(scene) && /proof|result|metric|stat|number/.test(p + k))) return "popup";
  if (bullets(scene, 2).length >= 2) return "bullets";
  return "showcase";
}

// ---- scene builders ((scene, ctx, assets) -> {html, s}) ----------------------

// SCENE — OPEN: a big paper title card folds up under a soft light; a handwritten-serif
// kicker rises above and a handwritten subtitle settles below. Opener energy.
function bOpen(scene, ctx, sceneAssets) {
  const { id, T, L, S, portrait } = ctx;
  const kick = esc(scene.kicker || S.openKicker);
  const title = scene.headline || scene.title || "";
  const asset = (sceneAssets && sceneAssets[0]) || null;
  // A hero shot pinned to the hook is pasted as a taped paper card beneath the title.
  const heroCard = asset
    ? `<div style="margin-top:5cqw;">${photoCard(ctx.theme, { cls: `${id}-ph`, w: portrait ? 52 : 38, asset, label: "", tape: true, rot: 2 })}</div>`
    : "";
  const html = `${open(id, ctx)}<div class="pc-safe">
    <div class="pc-kicker ${id}-kick" style="opacity:0;margin-bottom:4cqw;">${kick}</div>
    <div class="${id}-card" style="opacity:0;">
      <div class="pc-sheet pc-titlecard" style="transform:rotate(-1.5deg);">
        <div class="pc-display" style="text-align:center;font-size:${r(headlineSize(title, 12))}cqw;">${accentWords(id, title)}</div>
      </div>
    </div>
    ${scene.subtext ? `<div class="pc-hand ${id}-sub" style="opacity:0;margin-top:4cqw;transform:rotate(-1.5deg);max-width:80%;text-align:center;">${esc(scene.subtext)}</div>` : ""}
    ${heroCard}
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.4},${T});`,
    `tl.fromTo(".${id}-kick",{opacity:0,y:-16},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 0.2)});`,
    `tl.fromTo(".${id}-card",{opacity:0,y:60,rotationX:-70,scale:0.94},{opacity:1,y:0,rotationX:0,scale:1,duration:0.8,ease:"back.out(1.5)",transformOrigin:"top center"},${r(T + 0.4)});`,
    `tl.fromTo(".${id}-gw",{opacity:0,y:20},{opacity:1,y:0,duration:0.45,ease:"back.out(1.6)",stagger:0.06},${r(T + 0.9)});`,
    scene.subtext ? `tl.fromTo(".${id}-sub",{opacity:0,y:18},{opacity:1,y:0,duration:0.55,ease:"power2.out"},${r(T + 1.2)});` : "",
    asset ? `tl.fromTo(".${id}-ph",{opacity:0,y:70,rotationX:60,scale:0.9},{opacity:1,y:0,rotationX:0,scale:1,duration:0.75,ease:"back.out(1.5)",transformOrigin:"bottom center"},${r(T + 1.1)});` : "",
    asset ? `tl.to(".${id}-ph",{y:"-=1.4cqw",duration:1.9,ease:"sine.inOut",yoyo:true,repeat:${reps(L - 2, 1.9)},overwrite:"auto"},${r(T + 2)});` : "",
    `tl.to(".${id}-card",{rotation:1.2,duration:${r(Math.max(1.6, L - 1.6))},ease:"sine.inOut",yoyo:true,repeat:1,transformOrigin:"center center"},${r(T + 1.3)});`,
  ].filter(Boolean);
  return { html, s };
}

// SCENE — POPUP: a stat or headline POPS UP off the page — a big numeral on a paper disc
// (when the scene carries a number) or the headline words each fold up on their own paper
// chips (last word on the accent sheet). The signature papercraft pop.
function bPopup(scene, ctx, sceneAssets) {
  const { id, T, L, theme, S, portrait } = ctx;
  const kick = esc(scene.kicker || S.popupKicker);
  const num = numberOf(scene);
  const asset = (sceneAssets && sceneAssets[0]) || null;
  // When a dashboard/screenshot is assigned, paste it as a taped paper card beneath the
  // number disc (or chips) so the proof scene shows the real product AND its metric.
  const photo = asset
    ? `<div style="margin-top:${num ? "5cqw" : "6cqw"};">${photoCard(theme, { cls: `${id}-ph`, w: parseFloat(fitPlateW(ctx, portrait ? 56 : 40, asset)), asset, label: "", tape: true, rot: 2 })}</div>`
    : "";
  const photoIn = asset
    ? [`tl.fromTo(".${id}-ph",{opacity:0,y:70,rotationX:60,scale:0.9},{opacity:1,y:0,rotationX:0,scale:1,duration:0.75,ease:"back.out(1.5)",transformOrigin:"bottom center"},${r(T + 1.3)});`,
       `tl.to(".${id}-ph",{y:"-=1.4cqw",duration:2,ease:"sine.inOut",yoyo:true,repeat:${reps(L - 2.2, 2)},overwrite:"auto"},${r(T + 2.2)});`]
    : [];
  if (num) {
    const cap = esc(scene.headline || scene.title || scene.subtext || "");
  // This beat rendered its headline and nothing else — the rest of the copy the script
  // wrote for the scene was dropped. supportLine takes the first line not already shown.
    const sup = supportLine(scene, [scene.headline, scene.title]);
    const html = `${open(id, ctx)}<div class="pc-safe">
      <div class="pc-kicker ${id}-kick" style="opacity:0;margin-bottom:4cqw;">${kick}</div>
      <div class="${id}-disc" style="opacity:0;">
        <div class="pc-sheet pc-disc" style="transform:rotate(-2deg);">
          <div class="pc-statnum">${esc(num)}</div>
        </div>
      </div>
      ${cap ? `<div class="pc-hand ${id}-cap" style="opacity:0;margin-top:5cqw;max-width:78%;text-align:center;transform:rotate(-1deg);">${cap}</div>` : ""}
      ${sup ? `<div class="pc-hand ${id}-sup" style="opacity:0;margin-top:2.4cqw;max-width:74%;text-align:center;font-size:2.8cqw;">${esc(sup)}</div>` : ""}
      ${photo}
    </div></div>`;
    const s = [
      `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.4},${T});`,
      `tl.fromTo(".${id}-kick",{opacity:0,y:-16},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 0.2)});`,
      `tl.fromTo(".${id}-disc",{opacity:0,y:80,rotationX:70,scale:0.7},{opacity:1,y:0,rotationX:0,scale:1,duration:0.8,ease:"back.out(1.6)",transformOrigin:"bottom center"},${r(T + 0.4)});`,
      cap ? `tl.fromTo(".${id}-cap",{opacity:0,y:18},{opacity:1,y:0,duration:0.55,ease:"power2.out"},${r(T + 1.1)});` : "",
      sup ? `tl.fromTo(".${id}-sup",{opacity:0,y:14},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 1.45)});` : "",
      `tl.to(".${id}-disc",{y:"-=1.4cqw",duration:2,ease:"sine.inOut",yoyo:true,repeat:${reps(L - 1.4, 2)},overwrite:"auto"},${r(T + 1.4)});`,
      ...photoIn,
    ].filter(Boolean);
    return { html, s };
  }
  const words = wordsOf(scene.headline || scene.title || "").slice(0, 4);
  const chips = words.map((w, i) => {
    const accent = i === words.length - 1;
    return `<div class="${id}-word" style="opacity:0;">
      <div class="pc-sheet pc-wordchip ${accent ? "pc-wordchip-accent" : ""}" style="transform:rotate(${i % 2 ? 1.5 : -1.5}deg);">
        <div class="pc-display" style="font-size:${r(Math.min(13, headlineSize(scene.headline, 13)))}cqw;line-height:1;color:${accent ? theme.onAccent : theme.ink};">${esc(w)}</div>
      </div>
    </div>`;
  }).join("");
  const sup2 = supportLine(scene, [scene.headline, scene.title]);
  const html = `${open(id, ctx)}<div class="pc-safe">
    <div class="pc-kicker ${id}-kick" style="opacity:0;margin-bottom:3.4cqw;">${kick}</div>
    <div class="pc-wordstack">${chips}</div>
    ${sup2 ? `<div class="pc-hand ${id}-sup2" style="opacity:0;margin-top:3cqw;max-width:76%;text-align:center;font-size:2.8cqw;">${esc(sup2)}</div>` : ""}
    ${photo}
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.4},${T});`,
    `tl.fromTo(".${id}-kick",{opacity:0,y:-16},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 0.2)});`,
    `tl.fromTo(".${id}-word",{opacity:0,rotationX:88,y:20},{opacity:1,rotationX:0,y:0,duration:0.6,ease:"back.out(1.6)",stagger:0.14,transformOrigin:"bottom center"},${r(T + 0.4)});`,
    `tl.to(".${id}-word",{y:"-=0.8cqw",duration:2.2,ease:"sine.inOut",yoyo:true,repeat:${reps(L - 1.6, 2.2)},stagger:0.1,overwrite:"auto"},${r(T + 1.6)});`,
    ...photoIn,
  ].filter(Boolean);
  return { html, s };
}

// SCENE — SHOWCASE: real screenshots PASTED onto paper photo-cards with soft shadows and
// slight rotations. One shot → a big taped card; 2–3 → a scrapbook row with numbered
// handwritten labels. A headline sits above. The product moment.
function bShowcase(scene, ctx, sceneAssets) {
  const { id, T, L, theme, S, portrait } = ctx;
  const kick = esc(scene.kicker || S.showcaseKicker);
  const shots = (sceneAssets || []).slice(0, 3);
  const labels = Array.isArray(scene.onScreenText) ? scene.onScreenText : [];
  const single = shots.length <= 1;
  let stage;
  if (single) {
    const a = shots[0] || null;
    const w = parseFloat(fitPlateW(ctx, portrait ? 64 : 44, a));
    stage = `<div class="pc-stage">${photoCard(theme, { cls: `${id}-ph`, w, asset: a, label: labels[0] || "", tape: true, rot: -2 })}</div>`;
  } else {
    const w = shots.length >= 3 ? 28 : 36;
    const rots = shots.length >= 3 ? [-6, 3, -3] : [-5, 4];
    stage = `<div class="pc-row">${shots.map((a, i) =>
      `<div class="pc-rowcell">
        ${photoCard(theme, { cls: `${id}-ph`, w, asset: a, label: labels[i] || "", tape: i === 0, rot: rots[i] || 0 })}
        <div class="pc-rownum">0${i + 1}</div>
      </div>`
    ).join("")}</div>`;
  }
  const html = `${open(id, ctx)}<div class="pc-safe">
    <div class="pc-kicker ${id}-kick" style="opacity:0;margin-bottom:2.4cqw;">${kick}</div>
    ${scene.headline ? `<div class="pc-h1 ${id}-head" style="opacity:0;text-align:center;font-size:${r(headlineSize(scene.headline, 7))}cqw;margin-bottom:5cqw;">${accentWords(id, scene.headline)}</div>` : ""}
    ${stage}
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.35},${T});`,
    `tl.fromTo(".${id}-kick",{opacity:0,y:-16},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 0.2)});`,
    scene.headline ? `tl.fromTo(".${id}-head",{opacity:0,y:20},{opacity:1,y:0,duration:0.55,ease:"power2.out"},${r(T + 0.35)});` : "",
    scene.headline ? `tl.fromTo(".${id}-gw",{opacity:0,y:16},{opacity:1,y:0,duration:0.45,ease:"back.out(1.5)",stagger:0.05},${r(T + 0.4)});` : "",
    `tl.fromTo(".${id}-ph",{opacity:0,y:80,rotationX:60,scale:0.9},{opacity:1,y:0,rotationX:0,scale:1,duration:0.75,ease:"back.out(1.5)",stagger:0.14,transformOrigin:"bottom center"},${r(T + 0.6)});`,
    `tl.to(".${id}-ph",{y:"-=1.4cqw",duration:1.9,ease:"sine.inOut",yoyo:true,repeat:${reps(L - 1.5, 1.9)},stagger:0.1,overwrite:"auto"},${r(T + 1.5)});`,
  ].filter(Boolean);
  return { html, s };
}

// SCENE — BULLETS: a headline over a rising stack of paper chips (rounded paper tags with a
// soft shadow, an accent dot and a slight alternating rotation). The kit / feature list.
function bBullets(scene, ctx, sceneAssets) {
  const { id, T, L, theme, S, portrait } = ctx;
  const kick = esc(scene.kicker || S.bulletsKicker);
  const asset = (sceneAssets && sceneAssets[0]) || null;
  let chips = bullets(scene, 5);
  if (!chips.length) chips = [String(scene.subtext || scene.title || "").slice(0, 40)].filter(Boolean);
  const chipHtml = chips.map((c, i) =>
    `<div class="pc-chip ${id}-chip" style="opacity:0;transform:rotate(${i % 2 ? 1.4 : -1.4}deg);"><span class="pc-dot"></span>${esc(c)}</div>`
  ).join("");
  // The feature screenshot is pasted as a taped paper card between the headline and the
  // chip stack — the feature scene shows its product AND keeps its list.
  const photo = asset
    ? `<div style="margin-bottom:5cqw;">${photoCard(theme, { cls: `${id}-ph`, w: portrait ? 54 : 40, asset, label: "", tape: true, rot: -2 })}</div>`
    : "";
  const html = `${open(id, ctx)}<div class="pc-safe">
    <div class="pc-kicker ${id}-kick" style="opacity:0;margin-bottom:2.4cqw;">${kick}</div>
    <div class="pc-h1 ${id}-head" style="opacity:0;text-align:center;font-size:${r(headlineSize(scene.headline, 8))}cqw;margin-bottom:5cqw;">${accentWords(id, scene.headline || scene.title || "")}</div>
    ${photo}
    <div class="pc-chipstack">${chipHtml}</div>
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.35},${T});`,
    `tl.fromTo(".${id}-kick",{opacity:0,y:-16},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 0.2)});`,
    `tl.fromTo(".${id}-head",{opacity:0,y:22},{opacity:1,y:0,duration:0.55,ease:"power2.out"},${r(T + 0.35)});`,
    `tl.fromTo(".${id}-gw",{opacity:0,y:16},{opacity:1,y:0,duration:0.45,ease:"back.out(1.5)",stagger:0.05},${r(T + 0.4)});`,
    asset ? `tl.fromTo(".${id}-ph",{opacity:0,y:70,rotationX:60,scale:0.9},{opacity:1,y:0,rotationX:0,scale:1,duration:0.7,ease:"back.out(1.5)",transformOrigin:"bottom center"},${r(T + 0.6)});` : "",
    asset ? `tl.to(".${id}-ph",{y:"-=1.2cqw",duration:2,ease:"sine.inOut",yoyo:true,repeat:${reps(L - 1.6, 2)},overwrite:"auto"},${r(T + 1.6)});` : "",
    `tl.fromTo(".${id}-chip",{opacity:0,y:40,rotationX:55,scale:0.9},{opacity:1,y:0,rotationX:0,scale:1,duration:0.55,ease:"back.out(1.6)",stagger:0.14,transformOrigin:"bottom center"},${r(T + 0.75)});`,
    `tl.to(".${id}-chip",{y:"-=0.8cqw",duration:2.2,ease:"sine.inOut",yoyo:true,repeat:${reps(L - 1.5, 2.2)},stagger:0.12,overwrite:"auto"},${r(T + 1.6)});`,
  ].filter(Boolean);
  return { html, s };
}

// SCENE — STATEMENT: a single centered statement on an accent paper banner that breathes,
// with a handwritten subtitle. For quotes / manifestos.
function bStatement(scene, ctx, sceneAssets) {
  const { id, T, L, theme, portrait } = ctx;
  const asset = (sceneAssets && sceneAssets[0]) || null;
  // A supporting image assigned to a quote/manifesto scene is pasted as a taped paper card
  // beneath the accent banner — the testimonial reads over/beside the real product.
  const photo = asset
    ? `<div style="margin-top:5cqw;">${photoCard(theme, { cls: `${id}-ph`, w: portrait ? 52 : 38, asset, label: "", tape: true, rot: 2 })}</div>`
    : "";
  const html = `${open(id, ctx)}<div class="pc-safe">
    <div class="${id}-banner" style="opacity:0;">
      <div class="pc-sheet pc-banner" style="transform:rotate(-2deg);">
        <div class="pc-display" style="text-align:center;font-size:${r(headlineSize(scene.headline, 10))}cqw;">${esc(scene.headline || scene.title || "")}</div>
      </div>
    </div>
    ${scene.subtext ? `<div class="pc-hand ${id}-sub" style="opacity:0;margin-top:5cqw;max-width:78%;text-align:center;transform:rotate(-1deg);">${esc(scene.subtext)}</div>` : ""}
    ${photo}
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.4},${T});`,
    `tl.fromTo(".${id}-banner",{opacity:0,scale:0.8,rotationX:50,y:30},{opacity:1,scale:1,rotationX:0,y:0,duration:0.8,ease:"back.out(1.5)",transformOrigin:"bottom center"},${r(T + 0.3)});`,
    scene.subtext ? `tl.fromTo(".${id}-sub",{opacity:0,y:18},{opacity:1,y:0,duration:0.55,ease:"power2.out"},${r(T + 1.0)});` : "",
    asset ? `tl.fromTo(".${id}-ph",{opacity:0,y:70,rotationX:60,scale:0.9},{opacity:1,y:0,rotationX:0,scale:1,duration:0.75,ease:"back.out(1.5)",transformOrigin:"bottom center"},${r(T + 1.1)});` : "",
    asset ? `tl.to(".${id}-ph",{y:"-=1.4cqw",duration:2,ease:"sine.inOut",yoyo:true,repeat:${reps(L - 2, 2)},overwrite:"auto"},${r(T + 2)});` : "",
    `tl.to(".${id}-banner",{scale:1.02,duration:${r(Math.max(1.6, L - 1.6))},ease:"sine.inOut",yoyo:true,repeat:1,transformOrigin:"center center"},${r(T + 1.1)});`,
  ].filter(Boolean);
  return { html, s };
}

// SCENE — CTA: a paper wordmark card folds in (the user's logo when uploaded, else a built
// paper play-glyph), a handwritten tagline settles, an accent paper button wobbles and a
// url mono-label lands.
function bCta(scene, ctx, logo) {
  const { id, T, L, theme, S } = ctx;
  const word = String(scene.headline || scene.title || "KEYFRAME").slice(0, 20);
  const btn = esc(String(scene.emphasis || S.ctaButton).slice(0, 24));
  const tagline = esc(String(scene.subtext || S.ctaTagline).slice(0, 60));
  const url = esc(String(S.ctaUrl).toUpperCase());
  const mark = logo && logo.path
    ? logoMark(logo, { sizeCqw: 20, ground: theme.cream, extraFilter: `drop-shadow(${theme.shadowSm})`, escape: esc })
    : `<div class="pc-sheet pc-glyph" style="transform:rotate(-3deg);">
        <div style="width:0;height:0;border-top:3.4cqw solid transparent;border-bottom:3.4cqw solid transparent;border-left:5.4cqw solid ${theme.onAccent};margin-left:1.2cqw;"></div>
      </div>`;
  const chars = wordCharSpans(word, `${id}-ch`);
  const html = `${open(id, ctx)}<div class="pc-safe">
    <div class="pc-kicker ${id}-kick" style="opacity:0;margin-bottom:2.4cqw;">${esc(scene.kicker || S.ctaKicker)}</div>
    <div class="${id}-mark" style="opacity:0;">${mark}</div>
    <div class="pc-wordmark" style="font-size:${r(Math.min(11, fitCap(word)))}cqw;margin-top:3.4cqw;">${chars}</div>
    <div class="pc-hand ${id}-tag" style="opacity:0;margin-top:2cqw;">${tagline}</div>
    <div class="pc-btn ${id}-btn" style="opacity:0;margin-top:4cqw;color:${theme.onAccent};">${btn} ▸</div>
    <div class="${id}-url" style="opacity:0;font-family:${theme.monoStack};letter-spacing:0.22em;font-size:2.4cqw;color:${theme.inkFaint};margin-top:2.6cqw;">${url}</div>
  </div></div>`;
  const s = [
    `tl.fromTo("#${id}",{opacity:0},{opacity:1,duration:0.4},${T});`,
    `tl.fromTo(".${id}-kick",{opacity:0,y:-14},{opacity:1,y:0,duration:0.45,ease:"power2.out"},${r(T + 0.2)});`,
    `tl.fromTo(".${id}-mark",{opacity:0,scale:0.6,y:20,rotationX:50},{opacity:1,scale:1,y:0,rotationX:0,duration:0.6,ease:"back.out(1.7)",transformOrigin:"bottom center"},${r(T + 0.35)});`,
    `tl.fromTo(".${id}-ch",{opacity:0,y:60},{opacity:1,y:0,duration:0.5,ease:"power3.out",stagger:0.04},${r(T + 0.7)});`,
    `tl.fromTo(".${id}-tag",{opacity:0,y:14},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 1.2)});`,
    `tl.fromTo(".${id}-btn",{opacity:0,scale:0.8},{opacity:1,scale:1,duration:0.5,ease:"back.out(2)"},${r(T + 1.45)});`,
    `tl.to(".${id}-btn",{rotation:2,duration:0.8,ease:"sine.inOut",yoyo:true,repeat:${reps(L - 2.05, 0.8)},transformOrigin:"center center",overwrite:"auto"},${r(T + 2.05)});`,
    `tl.fromTo(".${id}-url",{opacity:0},{opacity:1,duration:0.5},${r(T + 1.7)});`,
  ];
  return { html, s };
}

const BUILDERS = { open: bOpen, popup: bPopup, showcase: bShowcase, bullets: bBullets, statement: bStatement, cta: bCta };

// ---- persistent PAPER canvas (hf-seek) ---------------------------------------
// One canvas painted purely from the renderer's hf-seek time: the warm cream ground, a few
// soft drifting cut-paper shapes with soft drop-shadows, a paper grain and a soft top light.
// Colored ONLY with the theme's precomputed paper tints (mixes of the accent), so a brand
// skin recolors the whole collage. Live preview drives it off the timeline; render is
// hf-seek only (deterministic, seek-exact, capture-safe).
function paperClip(theme, dims, D, seed) {
  const W = dims.width, H = dims.height;
  const html = `<div id="pc-paper-clip" class="clip" data-start="0" data-duration="${D}" data-track-index="0" data-layout-allow-occlusion style="background:rgb(${theme.cvCream});">
    <canvas id="pc-paper" width="${W}" height="${H}" style="position:absolute;inset:0;width:100%;height:100%;"></canvas>
  </div>`;
  const script = `(function(){
  var cv=document.getElementById("pc-paper");if(!cv||!cv.getContext)return;var g=cv.getContext("2d");if(!g)return;
  var W=${W},H=${H};
  var CREAM="rgb(${theme.cvCream})",INK="${theme.cvInk}";
  var P1="rgb(${theme.cvPaper1})",P2="rgb(${theme.cvPaper2})",PD="rgb(${theme.cvPaperDeep})";
  var sd=${seed >>> 0};function rnd(){sd=(sd*1664525+1013904223)>>>0;return sd/4294967296;}
  // sparse paper-grain speckle (deterministic positions)
  var GN=Math.round(220*(W*H)/(1080*1920)),GR=[];
  for(var i=0;i<GN;i++){GR.push({x:rnd(),y:rnd(),a:0.02+0.05*rnd()});}
  // soft-shadowed cut-paper blob (organic ellipse)
  function blob(col,cx,cy,size,ph,aspect){
    var x=cx*W+Math.sin(t*0.3+ph)*W*0.02,y=cy*H+Math.cos(t*0.24+ph)*H*0.015,rot=Math.sin(t*0.2+ph)*0.08;
    g.save();
    g.shadowColor="rgba("+INK+",0.16)";g.shadowBlur=size*0.1;g.shadowOffsetY=size*0.035;
    g.fillStyle=col;g.beginPath();g.ellipse(x,y,size*0.5,size*0.5*aspect,rot,0,6.283);g.fill();
    g.restore();
  }
  var t=0;
  function draw(tt){
    t=tt;
    g.fillStyle=CREAM;g.fillRect(0,0,W,H);
    blob(P1,0.20,0.16,W*0.72,0.0,0.86);
    blob(P2,0.86,0.44,W*0.56,2.0,0.94);
    blob(P1,0.34,0.90,W*0.64,4.0,0.9);
    blob(PD,0.72,0.82,W*0.3,1.2,0.92);
    // paper grain
    for(var i=0;i<GR.length;i++){var s=GR[i];g.fillStyle="rgba("+INK+","+s.a+")";g.fillRect(s.x*W,s.y*H,2,2);}
    // soft top light
    var tg=g.createRadialGradient(W*0.5,H*0.22,0,W*0.5,H*0.22,Math.max(W,H)*0.7);
    tg.addColorStop(0,"rgba(255,250,235,0.42)");tg.addColorStop(0.6,"rgba(255,250,235,0)");g.fillStyle=tg;g.fillRect(0,0,W,H);
    // gentle warm vignette (light ground → very subtle)
    var vg=g.createRadialGradient(W*0.5,H*0.46,Math.min(W,H)*0.32,W*0.5,H*0.46,Math.max(W,H)*0.82);
    vg.addColorStop(0,"rgba("+INK+",0)");vg.addColorStop(1,"rgba("+INK+",0.14)");g.fillStyle=vg;g.fillRect(0,0,W,H);
  }
  // Painted ONLY from the renderer's hf-seek time — deterministic, seek-exact, capture-safe.
  window.KF_PAPER=draw;window.addEventListener("hf-seek",function(e){draw((e.detail&&e.detail.time)||0);});draw(0);
})();`;
  return { html, script };
}

// ---- grain overlay (top layer) -----------------------------------------------
const GRAIN_URI = grainUri(0.85);
function grainClip(D) {
  return `<div id="pc-grain" class="clip" data-start="0" data-duration="${D}" data-track-index="40" data-layout-allow-occlusion style="pointer-events:none;background-image:url('${GRAIN_URI}');background-size:240px 240px;opacity:0.06;mix-blend-mode:multiply;"></div>`;
}

// ---- style -------------------------------------------------------------------
function styleBlock(theme, portrait) {
  const safePad = portrait ? "12% 7% 14%" : "8% 8% 10%";
  return `${theme.fontFace}
  * { box-sizing:border-box; margin:0; padding:0; }
  html, body { width:100%; height:100%; overflow:hidden; background:${theme.cream}; }
  #root { position:relative; overflow:hidden; isolation:isolate; background:${theme.cream}; container-type:size; color:${theme.ink}; font-family:${theme.bodyStack}; }
  .clip { position:absolute; top:0; left:0; width:100%; height:100%; overflow:hidden; }
  .pc-safe { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:${safePad}; text-align:center; perspective:1400px; }
  .pc-display { font-family:${theme.displayStack}; font-weight:800; line-height:0.98; letter-spacing:-0.02em; color:${theme.ink}; }
  .pc-h1 { font-family:${theme.displayStack}; font-weight:700; line-height:1.06; letter-spacing:-0.015em; color:${theme.ink}; }
  .pc-h1 .pc-gword:last-child, .pc-display .pc-gword:last-child { color:${theme.accentInk}; }
  .pc-gword { will-change:transform,opacity; }
  .pc-kicker { display:inline-flex; align-items:center; gap:0.9cqw; font-family:${theme.serifStack}; font-style:italic; font-weight:600; font-size:3cqw; letter-spacing:0.02em; color:${theme.accentInk}; }
  .pc-hand { font-family:${theme.serifStack}; font-style:italic; font-weight:500; font-size:4cqw; line-height:1.3; color:${theme.accentInk}; }
  .pc-sheet { position:relative; background:${theme.paper2}; border-radius:2.4cqw; box-shadow:${theme.shadow}; }
  .pc-titlecard { padding:5cqw 7cqw; }
  .pc-banner { padding:4cqw 7cqw; background:${theme.accent}; }
  .pc-banner .pc-display { color:${theme.onAccent}; }
  .pc-wordstack { display:flex; flex-direction:column; align-items:center; gap:2.2cqw; }
  .pc-wordchip { padding:1.6cqw 4cqw; }
  .pc-wordchip-accent { background:${theme.accent}; }
  .pc-disc { width:44cqw; height:44cqw; border-radius:50%; background:${theme.paperDeep}; display:flex; align-items:center; justify-content:center; }
  .pc-statnum { font-family:${theme.displayStack}; font-weight:800; font-size:16cqw; line-height:1; color:${theme.accentInk}; letter-spacing:-0.03em; }
  .pc-polaroid { position:relative; background:${theme.photoPaper}; border-radius:1.4cqw; box-shadow:${theme.shadow}; }
  .pc-slot { position:relative; width:100%; overflow:hidden; border-radius:0.8cqw; background:${theme.paper2}; }
  .pc-tape { background:${theme.tape}; box-shadow:0 0.4cqw 1.2cqw rgba(74,54,34,0.18); border-left:1px dashed rgba(74,54,34,0.15); border-right:1px dashed rgba(74,54,34,0.15); }
  .pc-caphand { font-family:${theme.serifStack}; font-style:italic; font-weight:600; font-size:3cqw; color:${theme.accentInk}; text-align:center; margin-top:1.4cqw; }
  .pc-stage { display:flex; justify-content:center; align-items:center; width:100%; }
  .pc-row { display:flex; gap:3cqw; justify-content:center; align-items:flex-start; width:100%; }
  .pc-rowcell { display:flex; flex-direction:column; align-items:center; }
  .pc-rownum { font-family:${theme.serifStack}; font-style:italic; font-weight:700; font-size:3.4cqw; color:${theme.accentInk}; margin-top:1.6cqw; }
  .pc-chipstack { display:flex; flex-direction:column; gap:2.2cqw; align-items:center; }
  .pc-chip { display:inline-flex; align-items:center; gap:1.6cqw; padding:2cqw 3.6cqw; border-radius:2cqw; background:${theme.paper1}; box-shadow:${theme.shadowSm}; font-family:${theme.displayStack}; font-weight:600; font-size:3cqw; color:${theme.ink}; white-space:nowrap; will-change:transform,opacity; }
  .pc-dot { width:1.8cqw; height:1.8cqw; border-radius:50%; background:${theme.accent}; box-shadow:${theme.shadowSm}; flex:0 0 auto; }
  .pc-wordmark { display:flex; flex-wrap:wrap; justify-content:center; text-align:center; gap:0 0.26em; max-width:92%; font-family:${theme.displayStack}; font-weight:800; font-size:11cqw; letter-spacing:-0.02em; color:${theme.ink}; }
  .pc-glyph { width:20cqw; height:20cqw; border-radius:22%; background:${theme.gradient}; display:flex; align-items:center; justify-content:center; box-shadow:${theme.shadow}; }
  .pc-btn { display:inline-flex; align-items:center; gap:1cqw; padding:2.8cqw 6.4cqw; border-radius:999px; background:${theme.accent}; font-family:${theme.displayStack}; font-weight:700; font-size:3.4cqw; letter-spacing:0.02em; box-shadow:${theme.shadow}; will-change:transform,opacity; }
  .pc-polaroid, .pc-sheet, .pc-chip { will-change:transform,opacity; }
  #caps { position:absolute; inset:0; display:flex; justify-content:center; align-items:flex-end; padding-bottom:${portrait ? "16%" : "7%"}; z-index:60; pointer-events:none; }
  #cap-pill { max-width:82%; height:fit-content; flex:0 0 auto; text-align:center; padding:1.4cqw 3cqw; opacity:0; border-radius:2cqw; background:${theme.photoPaper}; box-shadow:${theme.shadowSm}; }
  #cap-text { font-family:${theme.bodyStack}; font-weight:600; font-size:2.6cqw; line-height:1.35; color:${theme.ink}; }`;
}

// ---- MAIN --------------------------------------------------------------------
function buildComposition({ storyboard, dims, framePack, captionCues, assets, brandSkin = null, localized = null } = {}) {
  // Portrait drives the headline fill ladder (see headlineSize).
  _portrait = (dims && dims.height > dims.width) || false;
  const theme = paperTheme(brandSkin);
  const S = localized ? { ...STRINGS, ...localized } : STRINGS;
  const sb = storyboard || {};
  const W = (dims && dims.width) || 1080, H = (dims && dims.height) || 1920;
  const portrait = W < H;
  const scenes = Array.isArray(sb.scenes) && sb.scenes.length
    ? sb.scenes.slice(0, 12)
    : [{ id: "s1", start: 0, duration: 5, kind: "hook", headline: sb.title || "KEYFRAME" }];
  const D = r(sb.durationSec || scenes.reduce((a, s) => Math.max(a, (Number(s.start) || 0) + (Number(s.duration) || 0)), 0) || 12);
  const seed = seedFrom(sb.title || (scenes[0] && scenes[0].headline) || "papercraft");

  // ---- Assets: distribute real screenshots across DISPLAY-CAPABLE scenes -------
  // A screenshot must NEVER be stranded on a scene that can't paste it (open / bullets /
  // statement / cta). The Creative Director's per-asset `sceneId` is a HINT: honored when
  // that scene can display an image, else the shot is redistributed to the least-loaded
  // display scene — so every usable screenshot actually appears. The logo is reserved for
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
  // EVERY content archetype pastes its assigned shot onto paper in the collage's own
  // photo-card / disc / banner / chip language — only the pure CTA (logo lockup) is
  // excluded — so a stat/quote/bullet/hook scene the CD pinned a screenshot to renders it
  // on the intended scene instead of stranding the shot on the one showcase card.
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
    // A content scene that received screenshots pastes them onto paper IN ITS OWN language:
    // showcase → a taped card (1) or a scrapbook row (2–3); popup keeps its stat disc and
    // pastes the shot behind/beside the number; bullets keeps its chips and pastes a photo
    // above; statement keeps its banner quote over a photo; open shows a hero card under the
    // title. Only the base "showcase" widens to 3 shots; the rest host one. None with a shot
    // is collapsed away, so the stat's number / quote / chips survive next to the image.
    if (canShow(arch) && sceneAssets.length) {
      sceneAssets = sceneAssets.slice(0, arch === "showcase" ? 3 : 1);
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

  const paper = paperClip(theme, { width: W, height: H }, D, seed);
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
    if(window.KF_PAPER)window.KF_PAPER(now);
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
    paper.html,
    bodyParts.join("\n"),
    grainClip(D),
    caps,
    `</div>`,
    `<script>`, paper.script, `</script>`,
    `<script>`, script, `</script>`,
    `</body>`, `</html>`,
  ].join("\n");

  const metaJson = JSON.stringify({ compositionId: "vid", width: W, height: H, fps: (dims && dims.fps) || 30, duration: D });
  return { indexHtml, metaJson, resolvedBrand: theme.resolvedBrand };
}

module.exports = { buildComposition, STRINGS };
