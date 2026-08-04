// KINETIC UNIVERSE composer — a native GSAP + canvas cinematic launch film, portrait-first.
// The pack `kinetic-universe` (manifest renderer:"kinetic-universe") routes here from
// attemptLlmComposition, exactly like the flagship / blueprint / bloom / bauhaus /
// terminal / paper-tales composers.
//
// ─────────────────────────────────────────────────────────────────────────────────────
// WHAT THIS IS, AND WHAT IT REPLACED
//
// v1 was a port of an imported OmniMotion demo reel whose SUBJECT WAS THE TOOL ITSELF.
// Three consequences shaped the rewrite, and each one is an architectural fix, not a tweak:
//
//   1. THE FILM ADVERTISED THE WRONG PRODUCT. Twelve fixed strings — "KeyFrame · AI Video",
//      "keyframe.ai", "Prompt to video. In seconds.", "Start creating free" — rendered into
//      every customer's video, and scene 1 typed a prompt into a prompt bar, which is this
//      tool's product metaphor rather than the customer's story. Copy is now DERIVED from
//      the script (see deriveCopy); STRINGS keeps one neutral fallback for localization.
//
//   2. THERE WAS NO TRANSITION SYSTEM. Every cut was the same `fromTo(opacity 0→1, 0.4s)`
//      pasted into each builder, plus a hard `kill()` at the boundary — so scenes never
//      coexisted and a cut could not be anything but a crossfade. Scenes now OVERLAP by
//      XFADE on their (already unique) tracks, and a library of 12 transitions is dealt
//      out by a no-repeat sequencer. Legal because hyperframes' overlapping_clips_same_track
//      keys its conflict map by TRACK: overlap is only an error when clips share one.
//
//   3. PLATE GEOMETRY WAS ARITHMETICALLY WRONG. Width came from a percentage of a stage
//      while height came from `calc(var(--w) * mul)`, so the two scaled off different bases
//      and the plate's aspect drifted from the art direction — measured 2.22 → 1.32, a 68%
//      distortion that then re-cropped the screenshot through object-fit:cover. Plates are
//      now sized from the ASSET'S OWN ratio through responsive.fitMediaCqw, which returns
//      both numbers from one ratio so that drift is unrepresentable, and rendered
//      object-fit:contain so an unknown ratio letterboxes rather than crops.
//
// ─────────────────────────────────────────────────────────────────────────────────────
// IDENTITY (preserved and deepened)
//
//   • A PERSISTENT COSMOS on ONE <canvas>, painted purely from the renderer's hf-seek time:
//     nebula fields, drifting light beams, a perspective grid floor, a THREE-PLANE parallax
//     starfield, constellation lines, and a warp impulse fired at every cut so the backdrop
//     REACTS to the edit. Deterministic — never rAF/performance.now (the linter rejects
//     both, and a wall clock would desync frame capture).
//   • Kinetic gradient type, glowing device plates holding real screenshots, ignition rings,
//     converging streaks, a logo-reveal CTA.
//   • Brand-TINTED cosmos: the ground keeps its deep-space near-black but carries the brand
//     hue, and beams/nebula/grid/stars/plates/chips/CTA are all brand-driven — so any brand,
//     including a grey or white one, still reads as Kinetic Universe.
//   • THREE accents in rotation. v1 computed a tertiary, reported it in resolvedBrand, and
//     painted it zero times (measured 24 : 3 : 0 across a five-scene film). Each scene now
//     takes the next accent, so the palette actually cycles.
//
// ─────────────────────────────────────────────────────────────────────────────────────
// ENGINEERING CONTRACT (shared with the other native composers)
//
//   one paused GSAP timeline on window.__timelines["vid"] · direct-child .clip scenes on
//   UNIQUE tracks · the clip root carries visibility ONLY (opacity), an inner .kf-stage
//   carries every transform, so GSAP never fights a CSS transform (gsap_css_transform_conflict)
//   and never touches a clip's visibility props (gsap_animates_clip_element) · a hard
//   opacity:0 kill per scene · finite repeats via Math.floor (gsap_repeat_ceil_overshoot) ·
//   ONE seek-safe caption node (#cap-text) on a single onUpdate proxy · cqw units +
//   container-type:size · hidden = opacity:0 only · deterministic throughout.
//
//   Word reveals use the .kw/.kwi/.kacc class convention ON PURPOSE: caption_render.js's
//   SHAPING_FIX neutralizes overflow/clip-path/background-clip on exactly those names when
//   the video-text language is non-Latin. v1's own `.kf-grad`/`.kf-gword` names were NOT in
//   that list, so gradient headlines silently broke Devanagari/Arabic glyph shaping.

const { fontFaceCss, isBundled } = require("../fonts/pack_fonts");
const { varyArchetypes } = require("./motion_planner");
const { isTrustedProminent, isLogo } = require("./asset_priority");
const { logoMark } = require("./logo_render");
const { fitMediaCqw } = require("./responsive");
const { wordCharSpans, supportLine } = require("./text_fx");
const { resolveBrand } = require("./brand_kit");
const { GSAP_CDN, r, esc, hexToRgb, relLum, longestWord, bullets, logoAssetOf, grainUri } = require("./composer_kit");

// Sora/Archivo (the imported template's Google fonts) are NOT bundled for the CDN-free
// render — Space Grotesk is the bundled geometric display carrying the same cosmic-tech
// spirit; JetBrains Mono is the bundled mono; Inter falls to system-ui.
const DISPLAY = "Space Grotesk";
const MONO = "JetBrains Mono";
const BODY = "Inter";

// The pack's own accents when no brand is applied (violet → cyan → magenta).
const DEF_ACCENTS = ["#7A5AE0", "#22D3EE", "#F0459B"];
// The deep-space base. Brand tinting lifts a HUE into this without lifting the value —
// see tintGround: the result is always near-black, which is what keeps a pale or neutral
// brand from producing a washed-out film.
const BASE_GROUND = [4, 5, 9];
const BASE_GROUND_MID = [10, 12, 20];

// How long two scenes coexist during a cut. Long enough for a transition to read as a
// designed move rather than a dissolve; short enough that the overlapping pair never
// looks like two competing layouts.
const XFADE = 0.46;

// ---- deterministic helpers ---------------------------------------------------
function seedFrom(str) { let h = 2166136261; const s = String(str || "kinetic"); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) || 7; }
function mulberry(seed) { let a = seed >>> 0; return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hex2 = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
const rgbHex = (a) => `#${hex2(a[0])}${hex2(a[1])}${hex2(a[2])}`;
const pad2 = (n) => String(n).padStart(2, "0");

// Lift a brand HUE into the deep ground without lifting its VALUE. `amt` is small on
// purpose: at 0.055 a magenta brand yields #100711 and a blue one #060B16 — both still
// unmistakably deep space, both unmistakably that brand's deep space. This is the whole
// mechanism behind "tinted cosmos": tint the hue, never the luminance.
function tintGround(base, accentHex, amt) {
  const [ar, ag, ab] = hexToRgb(accentHex);
  return rgbHex([base[0] + ar * amt, base[1] + ag * amt, base[2] + ab * amt]);
}

// Guarantee a colour reads against the near-black ground. resolveBrand already lifts
// accents for a dark ground, but a user can hand us a very dark primary directly and a
// #101010 glow on a #060606 ground is an invisible film. Lifts toward white until it
// clears the floor, preserving hue.
function ensureLift(hex, minLum = 0.18) {
  let [rr, gg, bb] = hexToRgb(hex);
  for (let i = 0; i < 24 && relLum(rgbHex([rr, gg, bb])) < minLum; i++) {
    rr += (255 - rr) * 0.12; gg += (255 - gg) * 0.12; bb += (255 - bb) * 0.12;
  }
  return rgbHex([rr, gg, bb]);
}

// ---- theme -------------------------------------------------------------------
// resolveBrand fits the brand accents to the near-black ground (isDark:true → lifted UP for
// contrast) and passes pack accents through untouched when there is no skin — so a null skin
// renders the default cosmos and resolvedBrand is null (an honest "unbranded" in the Brand
// panel). Applied → the three accents become the brand's and the whole universe follows.
//
// resolvedBrand reports ONLY accents the film actually wears. v1 reported a three-accent
// palette while painting one, which made the brand-coverage disclosure over-report; here all
// three are genuinely used (see accentOf), so the report is true by construction.
function cosmicTheme(brandSkin) {
  const fontFace = (isBundled(DISPLAY) ? fontFaceCss(DISPLAY) : "") + (isBundled(MONO) ? fontFaceCss(MONO) : "");
  let accents = DEF_ACCENTS.slice();
  let resolvedBrand = null;
  try {
    const brand = resolveBrand(brandSkin, { ground: rgbHex(BASE_GROUND), isDark: true, packAccents: DEF_ACCENTS });
    if (brand.applied) {
      // A brand may only supply one or two stops. Rather than fall back to a pack accent
      // (which would drop an off-brand violet into a magenta film), derive the missing
      // stops from the ones we have by hue-rotating toward the next pack accent — the
      // film stays polychrome AND stays on-brand.
      const a1 = ensureLift(brand.accent || DEF_ACCENTS[0]);
      const a2 = ensureLift(brand.accent2 || blend(a1, DEF_ACCENTS[1], 0.5));
      const a3 = ensureLift(brand.accent3 || blend(a2, a1, 0.5));
      accents = [a1, a2, a3];
      resolvedBrand = {
        ...(brandSkin && typeof brandSkin === "object" ? brandSkin : {}),
        accents, emphasis: brand.emphasis, adjusted: brand.adjusted, dropped: brand.dropped,
        tier: brand.tier, applied: true,
      };
    }
  } catch { accents = DEF_ACCENTS.slice(); resolvedBrand = null; }

  const primary = accents[0];
  const ground = tintGround(BASE_GROUND, primary, 0.055);
  const groundMid = tintGround(BASE_GROUND_MID, primary, 0.10);
  return {
    accents, primary, ground, groundMid,
    text: "#F2F5FC", dim: "rgba(242,245,252,0.66)", faint: "rgba(242,245,252,0.34)",
    displayStack: `'${DISPLAY}', 'Inter', system-ui, sans-serif`,
    monoStack: `'${MONO}', ui-monospace, monospace`,
    bodyStack: `'${BODY}', system-ui, sans-serif`,
    fontFace, resolvedBrand,
  };
}
function blend(a, b, t) {
  const [r1, g1, b1] = hexToRgb(a), [r2, g2, b2] = hexToRgb(b);
  return rgbHex([r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t]);
}

// A scene's local palette. THIS is what makes the film polychrome: scene i leads with
// accents[i % 3] and pairs it with the next stop, so violet → cyan → magenta cycles across
// the edit instead of one accent carrying 90% of the frames.
function accentOf(theme, i) {
  const a = theme.accents[i % theme.accents.length];
  const b = theme.accents[(i + 1) % theme.accents.length];
  return {
    a, b,
    gradient: `linear-gradient(118deg, ${a}, ${b})`,
    gradientSoft: `linear-gradient(300deg, ${b}, ${a})`,
    surface: `color-mix(in oklab, ${a} 12%, ${theme.groundMid})`,
    border: `color-mix(in oklab, ${a} 46%, transparent)`,
    line: `color-mix(in oklab, ${a} 20%, transparent)`,
  };
}

// ---- fixed copy --------------------------------------------------------------
// ONE neutral string. Everything else the film says now comes from the script. Kept as an
// export because pipeline.composerStringsFor maps this pack's STRINGS into the localization
// pass — a key that vanishes cannot be translated, and a key that markets the wrong product
// should never have existed.
const STRINGS = { ctaButton: "Get started" };

// ---- copy derivation ---------------------------------------------------------
function wordsOf(t) { return String(t || "").trim().split(/\s+/).filter(Boolean); }
function hasNumber(scene) {
  return [scene.emphasis, scene.subtext, scene.headline, ...(Array.isArray(scene.onScreenText) ? scene.onScreenText : [])]
    .some((x) => /\d/.test(String(x || "")));
}
// The numeral a stat scene should set huge — the script's own `emphasis` when it carries
// one, else the first number-bearing token of the headline.
function statToken(scene) {
  const em = String(scene.emphasis || "").trim();
  if (em && /\d/.test(em) && em.length <= 12) return em;
  const m = String(scene.headline || "").match(/[^\s]*\d[^\s]*/);
  return m && m[0].length <= 12 ? m[0] : "";
}
const domainOf = (s) => {
  const m = String(s || "").match(/\b([a-z0-9][a-z0-9-]*\.(?:[a-z]{2,}))(?:\/\S*)?\b/i);
  return m ? m[1] : "";
};

// THE KICKER PROBLEM, SOLVED WITHOUT INVENTING COPY.
//
// A kicker is a real design element — the small mono label that gives a frame its editorial
// footing — but v1 filled it with English product marketing ("The feature set", "Direct
// every detail"), which is both wrong for the customer and untranslatable in spirit.
//
// Two sources that are always correct and never invented: the film's OWN title (the brand),
// and a numeric progress marker. The marker is language-free by construction, which means it
// is also correct in every localized cut — no glossary, no translation, no leakage.
// The BRAND out of a page title. A storyboard title is often the site's whole <title> —
// "Linear – The system for product development" — and a blind slice(0,28) cut it mid-word to
// "LINEAR – THE SYSTEM FOR PROD", which is the same clipped-copy defect as a truncated chip,
// just in the kicker. Site titles are conventionally "Brand <sep> tagline", so take the brand;
// if there is no separator, fall back to cutting on a WORD boundary, never inside one.
function brandOf(title) {
  const s = String(title || "").trim();
  if (!s) return "";
  // A colon binds to the word before it ("GitHub: Let us build…"), so it needs no leading
  // space; the dash/pipe/bullet forms always carry one on both sides.
  const head = s.split(/\s+[–—|·]\s+|\s+-\s+|:\s+/)[0].trim() || s;
  const pick = head.length >= 2 ? head : s;
  if (pick.length <= 28) return pick;
  return pick.slice(0, 28).replace(/\s+\S*$/, "").trim() || pick.slice(0, 28);
}
function kickerFor(i, total, arch, title) {
  if (i === 0 || arch === "cta") return brandOf(title).toUpperCase();
  return `${pad2(i + 1)} / ${pad2(total)}`;
}

// ---- type scale --------------------------------------------------------------
// A headline is word spans, so it wraps between words and the binding constraint is the
// LONGEST WORD: that word cannot break, so if it is wider than the column it leaves the
// frame however many lines exist. Capping on the whole string instead would shrink perfectly
// good two-line headlines. 0.56em is the mean advance of a heavy display face — an estimate,
// so it is paired with a wrapping container as the safety net rather than trusted alone.
const MEAN_ADVANCE_EM = 0.56;
const SAFE_LINE_CQW = 90;
function fitCap(text) {
  const len = longestWord(text).length;
  return len ? SAFE_LINE_CQW / (len * MEAN_ADVANCE_EM) : Infinity;
}
// Length ladder decides how many LINES the copy needs; portrait then spends its slack on the
// headlines that HAVE slack (short copy grows, long copy stays put), so nothing that fitted
// before starts to overflow. `portrait` is passed explicitly — v1 held it in module-level
// mutable state, which is safe only for as long as the build stays synchronous.
function headlineSize(text, base, portrait) {
  const len = String(text || "").length;
  const s = len > 42 ? base * 0.60 : len > 28 ? base * 0.74 : len > 18 ? base * 0.87 : base;
  const p = portrait ? s * (len > 28 ? 1.02 : len > 18 ? 1.10 : 1.20) : s;
  return r(Math.min(p, fitCap(text)));
}

// Chip type steps down as the line lengthens, so a short label keeps its confident weight
// while a full sentence still lands as one or two tidy lines instead of a wall. Paired with
// the wrapping .kf-chip rule — this is the aesthetic half, that one is the correctness half.
function chipFont(text) {
  const n = String(text || "").length;
  return n > 44 ? 2.0 : n > 30 ? 2.2 : n > 20 ? 2.4 : 2.6;
}

// Words wrapped for a MASK reveal: an overflow-hidden outer that GSAP never touches, and an
// inner the timeline slides up from below it. `.kw`/`.kwi` are the names caption_render's
// SHAPING_FIX knows — see the header note; renaming them silently breaks Indic/Arabic.
function maskWords(cls, text, { accent = false, max = 14 } = {}) {
  return wordsOf(text).slice(0, max).map((w) =>
    `<span class="kw${accent ? " kacc" : ""}"><span class="kwi ${cls}">${esc(w)}</span></span>`
  ).join(" ");
}

// ---- asset gate + media plates -----------------------------------------------
function screenOk(a) {
  if (!a || !a.path) return false;
  if (isLogo(a)) return false;                                   // the logo is CTA material, not a wall panel
  if (a.type === "video" || /\.(mp4|webm|mov)($|\?)/i.test(a.path)) return false;
  if (/\.svg($|\?)/i.test(a.path)) return false;
  return isTrustedProminent(a) || a.cdProminence === "hero" || a.cdProminence === "support";
}
const ratioOf = (a) => Number(a && a.ratio) || (a && a.width && a.height ? a.width / a.height : 0);

// Device chrome chosen from the shot's real proportions, so a mobile capture gets a phone,
// a desktop capture a browser, and a square product shot a clean card. v1 bucketed on a
// single `<0.9` test, which gave a 1:1 product photo and a 2.4:1 panorama the same frame.
const CHROME = {
  phone:   { barCqw: 0,   padCqw: 0.9, radius: 6.0 },
  browser: { barCqw: 4.0, padCqw: 0.0, radius: 2.6 },
  card:    { barCqw: 0,   padCqw: 0.0, radius: 2.8 },
};
function chromeFor(asset) {
  const rr = ratioOf(asset);
  if (rr && rr < 0.78) return "phone";
  if (rr && rr > 1.25) return "browser";
  return "card";
}

// ONE plate, sized from the ASSET'S OWN ratio inside the caller's box. Returns its measured
// { w, h } in cqw so the caller can lay out around a real number instead of guessing.
//
// object-fit:contain, always. With a box derived from the true ratio, contain fills the frame
// exactly; when the ratio is unknown it letterboxes into the neutral guess. Either way it
// cannot crop — which is the requirement, and which `cover` could never satisfy.
// HERO CROP BUDGET — the most of an image's width the hero slot may sacrifice to gain height.
//
// A 9:16 frame is 177.78cqw tall; a 1.518 desktop capture at the full 92cqw safe width is only
// 60.6cqw tall, i.e. 34% of the frame, and reaching 50% would need 135cqw of width — 135% of
// the frame. The height simply is not obtainable from a wide source without discarding some
// image, so the only real question is HOW MUCH, and that is a budget rather than a yes/no.
//
// MEASURED, NOT GUESSED. A first pass set this to 0.30 (~49% of frame height) and the render
// showed exactly why that is too much: a webpage's text begins near its left edge, so a
// CENTRED 30% crop cut headings open — "The product development system" arrived as "product
// development / em for teams and agents". Bigger, but broken; strictly worse than small and
// whole.
//
// So the crop is bounded at 0.14 AND anchored left-top, which puts the entire loss on the
// RIGHT margin — the side a page fills with padding and secondary nav rather than the column
// its headings start in. That buys ~40% of frame height against 34% uncropped: a real gain,
// honestly small, and it never eats a word. Applied ONLY to the hero slot and ONLY to wide
// assets; every other plate stays pixel-complete via object-fit:contain.
const HERO_CROP = 0.14;

function mediaPlate(id, cls, th, acc, { asset, maxWFrac, maxHFrac, tilt = 0, glow = 1, hero = false }) {
  const kind = chromeFor(asset);
  const ch = CHROME[kind];
  const chromeH = ch.barCqw + ch.padCqw * 2;
  const box = fitMediaCqw(th.W, th.H, ratioOf(asset), { maxWFrac, maxHFrac, chromeHCqw: chromeH });
  // The media sits INSIDE the padding, so its height must derive from the padded width, not
  // the plate's. Deriving it from box.w instead drifts the rendered aspect by the padding
  // ratio — measured 0.645 against a 0.667 source, which is exactly the small, invisible
  // kind of distortion this rewrite exists to eliminate.
  const innerW = r(box.w - ch.padCqw * 2);
  let innerH = r(innerW / (box.ratio || 1.6));
  let fit = "contain";
  // Hero slot + wide source: grow the window toward the height budget, spending at most
  // HERO_CROP of the width, and switch to cover/top so the extra height is real image rather
  // than letterbox. Never shrinks the plate — `tallH` is only adopted when it is taller.
  if (hero && (box.ratio || 0) > 1.2) {
    const frameH = ((th.H || 16) / (th.W || 9)) * 100;
    const budgetH = Math.max(0, maxHFrac * frameH - chromeH);
    const cropH = innerW / ((1 - HERO_CROP) * box.ratio);
    const tallH = r(Math.min(budgetH, cropH));
    if (tallH > innerH) { innerH = tallH; fit = "cover"; }
  }

  const bar = kind === "browser"
    ? `<div style="height:${ch.barCqw}cqw;display:flex;align-items:center;gap:0.7cqw;padding:0 1.5cqw;background:${acc.surface};border-bottom:1px solid ${acc.line};">
         <span style="width:0.85cqw;height:0.85cqw;border-radius:50%;background:${acc.a};opacity:0.85;"></span>
         <span style="width:0.85cqw;height:0.85cqw;border-radius:50%;background:${acc.b};opacity:0.6;"></span>
         <span style="width:0.85cqw;height:0.85cqw;border-radius:50%;background:${th.faint};"></span>
         <span style="flex:1;height:1.5cqw;margin-left:1cqw;border-radius:999px;background:${acc.line};"></span>
       </div>`
    : "";
  const notch = kind === "phone"
    ? `<div style="position:absolute;left:50%;top:1.3cqw;width:14%;height:1.1cqw;margin-left:-7%;border-radius:999px;background:rgba(0,0,0,0.55);z-index:2;"></div>`
    : "";
  const media = asset && asset.path
    ? `<img src="${esc(asset.path)}" alt="${esc(asset.alt || "")}" style="display:block;width:${innerW}cqw;height:${innerH}cqw;object-fit:${fit};object-position:left top;background:${th.ground};">`
    : "";

  // The static tilt lives on an inner wrapper GSAP never animates; GSAP owns only the outer's
  // opacity/scale/float. Putting both on one element is gsap_css_transform_conflict, which
  // silently discards the rotation.
  return {
    w: box.w, h: box.h,
    html: `<div class="${cls}" style="width:${box.w}cqw;opacity:0;">
      <div style="${tilt ? `transform:rotate(${tilt}deg) ;` : ""}">
        <div id="${id}" class="kf-plate" style="width:${box.w}cqw;border-radius:${ch.radius}cqw;overflow:hidden;position:relative;background:${acc.surface};border:0.16cqw solid ${acc.border};padding:${ch.padCqw}cqw;box-shadow:0 ${r(2.4 * glow)}cqw ${r(7 * glow)}cqw -2.5cqw ${acc.a}, 0 0 0 1px rgba(255,255,255,0.05) inset;">
          ${notch}${bar}${media}
          <div style="position:absolute;left:0;right:0;top:0;height:32%;background:linear-gradient(rgba(255,255,255,0.10),transparent);pointer-events:none;"></div>
        </div>
      </div>
    </div>`,
  };
}

// ---- motion vocabulary -------------------------------------------------------
// v1 hardcoded an ease per builder, so a census of the whole film came back power2.out ×11 /
// power3.out ×6 / sine.inOut ×5 — three eases for thirty tweens, which is what "predictable"
// actually measures as. Entrances and ambients are now a vocabulary the scene draws from,
// rotated by seed with an adjacent-scene guard.
const ENTRANCES = {
  rise:    (s, t, d) => `tl.fromTo("${s}",{opacity:0,y:"6cqw"},{opacity:1,y:0,duration:${r(d)},ease:"power3.out",stagger:0.07},${r(t)});`,
  maskUp:  (s, t, d) => `tl.fromTo("${s}",{yPercent:118,opacity:0},{yPercent:0,opacity:1,duration:${r(d)},ease:"expo.out",stagger:0.055},${r(t)});`,
  popIn:   (s, t, d) => `tl.fromTo("${s}",{opacity:0,scale:0.62,y:"3cqw"},{opacity:1,scale:1,y:0,duration:${r(d)},ease:"back.out(1.8)",stagger:0.07},${r(t)});`,
  blurIn:  (s, t, d) => `tl.fromTo("${s}",{opacity:0,filter:"blur(9px)",scale:1.09},{opacity:1,filter:"blur(0px)",scale:1,duration:${r(d)},ease:"power2.out",stagger:0.06},${r(t)});`,
  slideIn: (s, t, d) => `tl.fromTo("${s}",{opacity:0,x:"-7cqw"},{opacity:1,x:0,duration:${r(d)},ease:"power3.out",stagger:0.08},${r(t)});`,
  unfold:  (s, t, d) => `tl.fromTo("${s}",{opacity:0,rotationX:62,y:"4cqw",transformOrigin:"50% 0%"},{opacity:1,rotationX:0,y:0,duration:${r(d)},ease:"power3.out",stagger:0.08},${r(t)});`,
  swing:   (s, t, d) => `tl.fromTo("${s}",{opacity:0,rotation:-7,x:"5cqw",scale:0.9},{opacity:1,rotation:0,x:0,scale:1,duration:${r(d)},ease:"back.out(1.5)",stagger:0.07},${r(t)});`,
};
const ENTRANCE_KEYS = Object.keys(ENTRANCES);

// Continuous ambient life. Every one is a finite yoyo (gsap_infinite_repeat) on a GPU-cheap
// property, sized so it reads as breathing rather than drifting.
const AMBIENTS = {
  float:   (s, t, d, k) => `tl.to("${s}",{y:"-=1.5cqw",duration:${r(d)},ease:"sine.inOut",yoyo:true,repeat:${k},stagger:0.12,overwrite:"auto"},${r(t)});`,
  sway:    (s, t, d, k) => `tl.to("${s}",{x:"+=1.1cqw",rotation:0.7,duration:${r(d)},ease:"sine.inOut",yoyo:true,repeat:${k},stagger:0.15,overwrite:"auto"},${r(t)});`,
  breathe: (s, t, d, k) => `tl.to("${s}",{scale:1.028,duration:${r(d)},ease:"sine.inOut",yoyo:true,repeat:${k},transformOrigin:"center center",overwrite:"auto"},${r(t)});`,
  bob:     (s, t, d, k) => `tl.to("${s}",{y:"+=1.2cqw",duration:${r(d)},ease:"sine.inOut",yoyo:true,repeat:${k},stagger:0.1,overwrite:"auto"},${r(t)});`,
};
const AMBIENT_KEYS = Object.keys(AMBIENTS);

// finite yoyo repeat count for a segment of `t` seconds at period `c`. Math.floor, never
// ceil — gsap_repeat_ceil_overshoot exists because ceil runs the cycle past the clip.
function reps(t, c) { return Math.max(0, Math.floor((Number(t) || 0) / (c || 1)) - 1); }

// ---- transition library ------------------------------------------------------
// Each entry choreographs ONE cut across the XFADE window in which both scenes are alive.
// `o` / `n` are the outgoing / incoming STAGE selectors (never the clip roots). `warp` is the
// impulse handed to the cosmos canvas so the backdrop reacts to this specific cut.
//
// Only GPU-friendly properties: transform, opacity, filter:blur, clip-path. No layout
// properties are animated anywhere in this file, which is what keeps a 1080×1920 Chromium
// capture from re-flowing on every frame.
const TRANSITIONS = [
  { name: "warp-through", warp: 1.00, build: ({ o, n, t, x }) => ({ js: [
      `tl.to("${o}",{scale:2.75,opacity:0,filter:"blur(14px)",duration:${r(x)},ease:"power3.in"},${r(t)});`,
      `tl.fromTo("${n}",{scale:0.44,opacity:0,filter:"blur(18px)"},{scale:1,opacity:1,filter:"blur(0px)",duration:${r(x * 1.2)},ease:"expo.out"},${r(t)});`,
    ] }) },
  { name: "depth-pull", warp: 0.85, build: ({ o, n, t, x }) => ({ js: [
      `tl.to("${o}",{scale:0.34,opacity:0,filter:"blur(10px)",duration:${r(x)},ease:"power3.in"},${r(t)});`,
      `tl.fromTo("${n}",{scale:1.85,opacity:0,filter:"blur(13px)"},{scale:1,opacity:1,filter:"blur(0px)",duration:${r(x * 1.2)},ease:"expo.out"},${r(t)});`,
    ] }) },
  { name: "iris", warp: 0.55, build: ({ o, n, t, x }) => ({ js: [
      `tl.fromTo("${o}",{clipPath:"circle(82% at 50% 46%)"},{clipPath:"circle(0% at 50% 46%)",duration:${r(x)},ease:"power2.inOut"},${r(t)});`,
      `tl.set("${o}",{opacity:0},${r(t + x)});`,
      `tl.fromTo("${n}",{clipPath:"circle(0% at 50% 46%)",opacity:1},{clipPath:"circle(96% at 50% 46%)",duration:${r(x * 1.15)},ease:"power3.out"},${r(t)});`,
    ] }) },
  { name: "shape-morph", warp: 0.6, build: ({ o, n, t, x }) => ({ js: [
      `tl.fromTo("${o}",{clipPath:"inset(0% 0% 0% 0% round 0cqw)"},{clipPath:"inset(40% 40% 40% 40% round 26cqw)",opacity:0,duration:${r(x)},ease:"power3.in"},${r(t)});`,
      `tl.fromTo("${n}",{clipPath:"inset(44% 44% 44% 44% round 28cqw)",opacity:0},{clipPath:"inset(0% 0% 0% 0% round 0cqw)",opacity:1,duration:${r(x * 1.2)},ease:"power3.out"},${r(t)});`,
    ] }) },
  { name: "blur-push", warp: 0.75, build: ({ o, n, t, x }) => ({ js: [
      `tl.to("${o}",{xPercent:-26,opacity:0,filter:"blur(12px)",duration:${r(x)},ease:"power3.in"},${r(t)});`,
      `tl.fromTo("${n}",{xPercent:30,opacity:0,filter:"blur(14px)"},{xPercent:0,opacity:1,filter:"blur(0px)",duration:${r(x * 1.15)},ease:"expo.out"},${r(t)});`,
    ] }) },
  { name: "layer-split", warp: 0.9, build: ({ o, n, t, x, id, track, acc }) => ({
      html: `<div class="clip" id="${id}" data-start="${r(t)}" data-duration="${r(x * 1.3)}" data-track-index="${track}" data-layout-allow-occlusion style="pointer-events:none;">
        <div class="${id}-ln" style="position:absolute;left:0;right:0;top:50%;height:0.34cqw;margin-top:-0.17cqw;background:linear-gradient(90deg,transparent,${acc.a},${acc.b},transparent);opacity:0;box-shadow:0 0 5cqw ${acc.a};"></div></div>`,
      js: [
        `tl.to("${o}",{scaleY:0.006,opacity:0.9,duration:${r(x * 0.5)},ease:"power3.in",transformOrigin:"center center"},${r(t)});`,
        `tl.set("${o}",{opacity:0},${r(t + x * 0.5)});`,
        `tl.fromTo(".${id}-ln",{opacity:0,scaleX:0.2},{opacity:1,scaleX:1,duration:${r(x * 0.4)},ease:"power2.out"},${r(t + x * 0.25)});`,
        `tl.to(".${id}-ln",{opacity:0,duration:${r(x * 0.45)},ease:"power2.in"},${r(t + x * 0.65)});`,
        `tl.fromTo("${n}",{scaleY:0.006,opacity:1},{scaleY:1,opacity:1,duration:${r(x * 0.62)},ease:"power3.out",transformOrigin:"center center"},${r(t + x * 0.48)});`,
      ] }) },
  { name: "perspective-flip", warp: 0.7, build: ({ o, n, t, x }) => ({ js: [
      `tl.to("${o}",{rotationY:-74,scale:0.82,opacity:0,duration:${r(x)},ease:"power3.in"},${r(t)});`,
      `tl.fromTo("${n}",{rotationY:72,scale:0.84,opacity:0},{rotationY:0,scale:1,opacity:1,duration:${r(x * 1.2)},ease:"power3.out"},${r(t)});`,
    ] }) },
  { name: "light-wipe", warp: 0.8, build: ({ o, n, t, x, id, track, acc }) => ({
      html: `<div class="clip" id="${id}" data-start="${r(t)}" data-duration="${r(x * 1.4)}" data-track-index="${track}" data-layout-allow-occlusion style="pointer-events:none;overflow:hidden;">
        <div class="${id}-bar" style="position:absolute;top:-25%;left:0;width:46%;height:150%;transform-origin:50% 50%;background:linear-gradient(100deg,transparent,${acc.a}88,#ffffffcc,${acc.b}88,transparent);filter:blur(1.2cqw);opacity:0.95;"></div></div>`,
      js: [
        // The sweep tweens POSITION only and the bar's resting opacity is inline, so the fade
        // below is the sole opacity tween on this element. Carrying opacity through the sweep
        // as well made the two overlap for ~0.07s (overlapping_gsap_tweens) — two tweens
        // fighting for one property is a seek-order hazard, not just a lint nit.
        `tl.fromTo(".${id}-bar",{xPercent:-240,rotation:9},{xPercent:360,rotation:9,duration:${r(x * 1.25)},ease:"power2.inOut"},${r(t)});`,
        `tl.to(".${id}-bar",{opacity:0,duration:0.14,ease:"none"},${r(t + x * 1.25)});`,
        `tl.to("${o}",{opacity:0,x:"-5cqw",filter:"blur(6px)",duration:${r(x * 0.7)},ease:"power2.in"},${r(t + x * 0.22)});`,
        `tl.fromTo("${n}",{opacity:0,x:"6cqw"},{opacity:1,x:0,duration:${r(x * 0.85)},ease:"power3.out"},${r(t + x * 0.34)});`,
      ] }) },
  { name: "ribbon-sweep", warp: 0.65, build: ({ o, n, t, x, id, track, acc }) => ({
      html: `<div class="clip" id="${id}" data-start="${r(t)}" data-duration="${r(x * 1.4)}" data-track-index="${track}" data-layout-allow-occlusion style="pointer-events:none;overflow:hidden;">
        ${[0, 1, 2, 3, 4].map((k) => `<div class="${id}-rb" style="position:absolute;left:0;top:${k * 20}%;width:100%;height:20.4%;background:${k % 2 ? acc.gradientSoft : acc.gradient};opacity:0.9;"></div>`).join("")}</div>`,
      js: [
        `tl.fromTo(".${id}-rb",{xPercent:-105},{xPercent:0,duration:${r(x * 0.5)},ease:"power3.out",stagger:0.045},${r(t)});`,
        `tl.to(".${id}-rb",{xPercent:105,duration:${r(x * 0.55)},ease:"power3.in",stagger:0.045},${r(t + x * 0.66)});`,
        `tl.to("${o}",{opacity:0,duration:0.14,ease:"none"},${r(t + x * 0.5)});`,
        `tl.fromTo("${n}",{opacity:0,scale:1.05},{opacity:1,scale:1,duration:${r(x * 0.7)},ease:"power2.out"},${r(t + x * 0.55)});`,
      ] }) },
  { name: "particle-dissolve", warp: 0.95, build: ({ o, n, t, x, id, track, acc, rnd }) => {
      const dots = Array.from({ length: 20 }).map((_, k) => {
        const ang = (k / 20) * 360 + rnd() * 12, dist = 16 + rnd() * 26, sz = r(0.5 + rnd() * 1.1);
        const dx = r(Math.cos(ang * Math.PI / 180) * dist), dy = r(Math.sin(ang * Math.PI / 180) * dist);
        return `<div class="${id}-pt" data-dx="${dx}" data-dy="${dy}" style="position:absolute;left:50%;top:46%;width:${sz}cqw;height:${sz}cqw;border-radius:50%;background:${k % 2 ? acc.a : acc.b};box-shadow:0 0 1.6cqw ${k % 2 ? acc.a : acc.b};opacity:0;"></div>`;
      }).join("");
      return {
        html: `<div class="clip" id="${id}" data-start="${r(t)}" data-duration="${r(x * 1.4)}" data-track-index="${track}" data-layout-allow-occlusion style="pointer-events:none;">${dots}</div>`,
        js: [
          `burst(".${id}-pt",${r(t)},${r(x * 1.1)});`,
          `tl.to("${o}",{opacity:0,filter:"blur(9px)",scale:1.09,duration:${r(x * 0.8)},ease:"power2.in"},${r(t)});`,
          `tl.fromTo("${n}",{opacity:0,scale:0.93,filter:"blur(8px)"},{opacity:1,scale:1,filter:"blur(0px)",duration:${r(x)},ease:"power3.out"},${r(t + x * 0.28)});`,
        ] };
    } },
  { name: "liquid-slide", warp: 0.6, build: ({ o, n, t, x }) => ({ js: [
      `tl.fromTo("${o}",{yPercent:0,borderRadius:"0% 0% 0% 0%"},{yPercent:-40,opacity:0,borderRadius:"44% 44% 0% 0%",filter:"blur(6px)",duration:${r(x)},ease:"power3.inOut"},${r(t)});`,
      `tl.fromTo("${n}",{yPercent:44,opacity:0,borderRadius:"0% 0% 44% 44%"},{yPercent:0,opacity:1,borderRadius:"0% 0% 0% 0%",duration:${r(x * 1.25)},ease:"power3.out"},${r(t)});`,
    ] }) },
  { name: "orbit-swing", warp: 0.7, build: ({ o, n, t, x }) => ({ js: [
      `tl.to("${o}",{rotation:-11,xPercent:-20,yPercent:7,scale:0.88,opacity:0,duration:${r(x)},ease:"power3.in"},${r(t)});`,
      `tl.fromTo("${n}",{rotation:10,xPercent:22,yPercent:-7,scale:0.9,opacity:0},{rotation:0,xPercent:0,yPercent:0,scale:1,opacity:1,duration:${r(x * 1.2)},ease:"back.out(1.4)"},${r(t)});`,
    ] }) },
];

// Deal transitions across the edit. Two rules, and they are the whole difference between
// "varied" and "random":
//   • NO REPEAT WITHIN 3 CUTS — the viewer cannot predict the next move, but the film still
//     has a vocabulary rather than a shuffle.
//   • AFFINITY — a cut INTO a product moment pushes through depth (the product arrives),
//     a cut into the CTA warps (arrival), a cut out of a quote breaks (release). Coherence
//     comes from the transition meaning something about the scenes it joins.
const AFFINITY = {
  cta:       ["warp-through", "iris", "particle-dissolve"],
  showcase:  ["depth-pull", "perspective-flip", "light-wipe"],
  discovery: ["depth-pull", "shape-morph", "orbit-swing"],
  statement: ["iris", "shape-morph", "liquid-slide"],
  reveal:    ["warp-through", "layer-split", "particle-dissolve"],
};
function dealTransitions(archetypes, seed) {
  const rnd = mulberry(seed);
  const out = [], recent = [];
  for (let i = 0; i < Math.max(0, archetypes.length - 1); i++) {
    const want = AFFINITY[archetypes[i + 1]] || [];
    // Compare by NAME. Filtering the transition OBJECTS against a list of names silently
    // matches nothing, which leaves the no-repeat guarantee inert and lets the same move
    // land on two consecutive cuts — the exact predictability this library exists to break.
    const fresh = (list) => list.filter((t) => !recent.includes(t.name));
    let pool = fresh(TRANSITIONS.filter((t) => want.includes(t.name)));
    if (!pool.length) pool = fresh(TRANSITIONS);
    if (!pool.length) pool = TRANSITIONS.slice();
    const pick = pool[Math.floor(rnd() * pool.length) % pool.length];
    out.push(pick);
    recent.push(pick.name);
    if (recent.length > 3) recent.shift();
  }
  return out;
}

// ---- scene shell -------------------------------------------------------------
// The clip root carries VISIBILITY only; the inner .kf-stage carries every transform. That
// split is what makes overlapping transitions legal AND lint-clean: the framework owns the
// clip, GSAP owns the stage, and the two never touch the same property.
function open(ctx, inner, { safe = true } = {}) {
  const dur = r(Math.max(0.1, ctx.clipDur));
  return `<div class="clip kf-scene" id="${ctx.id}" data-start="${r(ctx.T)}" data-duration="${dur}" data-track-index="${ctx.track}" style="opacity:0;">
    <div class="kf-stage ${ctx.id}-stage">${safe ? `<div class="kf-safe">${inner}</div>` : inner}</div>
  </div>`;
}
// Kicker markup — shared by every archetype so the editorial footing is consistent.
function kicker(ctx, text) {
  if (!text) return "";
  return `<div class="kf-kicker ${ctx.id}-kick" style="opacity:0;"><span class="kf-kdot" style="background:${ctx.acc.a};box-shadow:0 0 1.2cqw ${ctx.acc.a};"></span>${esc(text)}</div>`;
}

// ---- archetype selection -----------------------------------------------------
function archetypeFor(scene, i, total) {
  const k = String(scene.kind || "").toLowerCase();
  const p = String(scene.purpose || "").toLowerCase();
  if (i === 0 || k === "hook" || k === "title" || /hook|intro|open/.test(p)) return "ignition";
  if (i === total - 1 || k === "cta" || /cta|close|sign\s*up|subscribe|download|get\s*started/.test(p)) return "cta";
  if (k === "quote" || /quote|testimonial|manifesto/.test(p)) return "statement";
  if (k === "stat" || k === "chart" || k === "countdown" || (hasNumber(scene) && /proof|result|metric|stat|number/.test(p + k))) return "reveal";
  if (/feature|how|process|step|showcase|product|proof|demo/.test(p + k)) return "showcase";
  return "orbit";
}

// ---- scene builders ((scene, ctx, assets) -> {html, s}) ----------------------

// SCENE — IGNITION (opener). A title card with real weight: the brand kicker, a mega masked
// headline, a support line, an ignition ring and a light burst, with accent satellites in
// orbit. v1 typed a prompt into a prompt bar — this tool's product metaphor, in a film about
// somebody else's product. The energy is kept; the advertisement is gone.
function bIgnition(scene, ctx) {
  const { id, T, L, th, acc, ent, amb } = ctx;
  const head = scene.headline || scene.title || ctx.title || "";
  const sup = supportLine(scene, [ctx.kick]);
  const sats = [0, 1, 2, 3].map((k) => {
    const ang = k * 90 + 24, dist = 30 + (k % 2) * 8;
    return `<div class="${id}-sat" style="position:absolute;left:50%;top:46%;width:1.5cqw;height:1.5cqw;margin:-0.75cqw 0 0 -0.75cqw;border-radius:50%;background:${k % 2 ? acc.a : acc.b};box-shadow:0 0 2.4cqw ${k % 2 ? acc.a : acc.b};opacity:0;" data-dx="${r(Math.cos(ang * Math.PI / 180) * dist)}" data-dy="${r(Math.sin(ang * Math.PI / 180) * dist)}"></div>`;
  }).join("");
  const html = open(ctx, `
    ${sats}
    <div class="kf-ring ${id}-ring" style="opacity:0;border-color:${acc.a};box-shadow:0 0 8cqw ${acc.a};"></div>
    <div class="kf-ring ${id}-ring2" style="opacity:0;border-color:${acc.b};box-shadow:0 0 6cqw ${acc.b};"></div>
    ${kicker(ctx, ctx.kick)}
    <div class="kf-display ${id}-head" style="font-size:${headlineSize(head, 13.5, ctx.portrait)}cqw;margin-top:3cqw;">${maskWords(`${id}-w`, head, { accent: true })}</div>
    ${sup ? `<div class="kf-body ${id}-sup" style="opacity:0;margin-top:3.4cqw;max-width:80%;">${esc(sup)}</div>` : ""}
    <div class="kf-rule ${id}-rule" style="background:${acc.gradient};opacity:0;"></div>
    <div class="kf-flash ${id}-flash" style="opacity:0;background:radial-gradient(circle at 50% 46%, #fff, ${acc.a} 28%, transparent 68%);"></div>`);
  const s = [
    // THE OPENER MUST BE COMPOSED EARLY. The QA reviewer always samples 0.6s (an empty
    // opening frame is a known failure mode) and flagged this card as "under-illustrated with
    // excessive empty space" — not because the layout was sparse, but because at 0.6s the
    // headline was still arriving. The beats below land the kicker, the type and the rule
    // inside that window; the ambient life then continues for the rest of the scene.
    `tl.set("#${id}",{opacity:1},${r(T)});`,
    `tl.fromTo(".${id}-ring",{opacity:0.85,scale:0.08},{opacity:0,scale:2.6,duration:0.9,ease:"power2.out"},${r(T + 0.04)});`,
    `tl.fromTo(".${id}-ring2",{opacity:0.6,scale:0.05},{opacity:0,scale:3.4,duration:1.15,ease:"power2.out"},${r(T + 0.18)});`,
    `tl.fromTo(".${id}-flash",{opacity:0},{opacity:0.55,duration:0.12,yoyo:true,repeat:1,ease:"power2.out"},${r(T + 0.05)});`,
    `orbit(".${id}-sat",${r(T + 0.1)},${r(Math.max(1.2, L - 0.5))});`,
    `tl.fromTo(".${id}-kick",{opacity:0,y:"-2cqw",letterSpacing:"0.9em"},{opacity:1,y:0,letterSpacing:"0.4em",duration:0.42,ease:"power3.out"},${r(T + 0.06)});`,
    ENTRANCES[ent](`.${id}-w`, T + 0.16, 0.5),
    `tl.fromTo(".${id}-rule",{opacity:0,scaleX:0},{opacity:1,scaleX:1,duration:0.5,ease:"power3.out",transformOrigin:"left center"},${r(T + 0.5)});`,
    sup ? `tl.fromTo(".${id}-sup",{opacity:0,y:"2cqw"},{opacity:1,y:0,duration:0.42,ease:"power2.out"},${r(T + 0.56)});` : "",
    AMBIENTS[amb](`.${id}-head`, T + 1.4, 2.6, reps(L - 1.4, 2.6)),
  ].filter(Boolean);
  return { html, s };
}

// SCENE — REVEAL. Converging light streaks collapse into a shockwave, then the payload lands:
// a huge numeral when the script gave us one (stat scenes finally look like stat scenes), else
// a kinetic gradient headline. The signature impact beat.
function bReveal(scene, ctx, sceneAssets) {
  const { id, T, L, th, acc, ent, amb } = ctx;
  const head = scene.headline || scene.title || "";
  const stat = statToken(scene);
  // A stat beat that the director also bound a shot to keeps BOTH: the numeral stays the
  // focal point and the plate grounds it in the real product, sized small enough that it
  // supports the number rather than competing with it.
  const asset = (sceneAssets && sceneAssets[0]) || null;
  const plate = asset ? mediaPlate(`${id}-p0`, `${id}-fr`, th, acc, { asset, maxWFrac: 0.66, maxHFrac: 0.30, glow: 0.9 }) : null;
  const streaks = Array.from({ length: 18 }).map((_, i) => {
    const ang = (i / 18) * 360;
    const col = i % 3 === 0 ? acc.b : acc.a;
    // The radial ANGLE is static CSS on a wrapper; GSAP only ever touches the inner line's
    // scaleX/opacity, so it can never overwrite the rotation.
    return `<div style="position:absolute;left:50%;top:46%;transform:rotate(${r(ang)}deg);transform-origin:0 0;">` +
      `<div class="${id}-streak" style="position:absolute;left:11cqw;top:-0.2cqw;width:${r(30 + (i % 4) * 6)}cqw;height:${i % 3 === 0 ? 0.5 : 0.3}cqw;transform-origin:0 50%;opacity:0;background:linear-gradient(90deg,transparent,${col});"></div></div>`;
  }).join("");
  const payload = stat
    ? `<div class="kf-stat ${id}-stat" style="opacity:0;background:${acc.gradient};-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;">${esc(stat)}</div>
       <div class="kf-h2 ${id}-lede" style="opacity:0;margin-top:1.6cqw;max-width:84%;">${esc(String(head).replace(stat, "").trim() || head)}</div>`
    : `<div class="kf-display" style="font-size:${headlineSize(head, 13, ctx.portrait)}cqw;">${maskWords(`${id}-w`, head, { accent: true })}</div>`;
  const html = open(ctx, `
    ${streaks}
    <div class="${id}-shock" style="position:absolute;left:50%;top:46%;width:20cqw;height:20cqw;margin:-10cqw 0 0 -10cqw;border-radius:50%;border:0.4cqw solid ${acc.b};opacity:0;box-shadow:0 0 8cqw ${acc.b};"></div>
    ${kicker(ctx, ctx.kick)}
    <div style="margin-top:2.6cqw;">${payload}</div>
    ${plate ? `<div style="margin-top:3.6cqw;">${plate.html}</div>` : ""}
    ${scene.subtext && !stat ? `<div class="kf-body ${id}-sub" style="opacity:0;margin-top:3cqw;max-width:82%;">${esc(scene.subtext)}</div>` : ""}
    <div class="kf-flash ${id}-flash" style="opacity:0;background:radial-gradient(circle at 50% 46%, #fff, ${acc.b} 30%, transparent 70%);"></div>`);
  const s = [
    `tl.set("#${id}",{opacity:1},${r(T)});`,
    `tl.fromTo(".${id}-streak",{opacity:0,scaleX:0.1},{opacity:0.95,scaleX:1,duration:0.5,ease:"power2.in",stagger:0.008},${r(T + 0.1)});`,
    `tl.to(".${id}-streak",{opacity:0,scaleX:0.2,duration:0.38,ease:"power2.in",overwrite:"auto"},${r(T + 0.6)});`,
    `tl.fromTo(".${id}-shock",{scale:0.08,opacity:0.95},{scale:5.4,opacity:0,duration:0.85,ease:"power2.out"},${r(T + 0.5)});`,
    `tl.fromTo(".${id}-flash",{opacity:0},{opacity:0.7,duration:0.1,yoyo:true,repeat:1},${r(T + 0.55)});`,
    `tl.fromTo(".${id}-kick",{opacity:0,y:"-2cqw"},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 0.62)});`,
    stat
      ? `tl.fromTo(".${id}-stat",{opacity:0,scale:0.5,filter:"blur(12px)"},{opacity:1,scale:1,filter:"blur(0px)",duration:0.8,ease:"back.out(1.6)"},${r(T + 0.75)});`
      : ENTRANCES[ent](`.${id}-w`, T + 0.75, 0.72),
    stat ? `tl.fromTo(".${id}-lede",{opacity:0,y:"2cqw"},{opacity:1,y:0,duration:0.55,ease:"power2.out"},${r(T + 1.15)});` : "",
    plate ? `tl.fromTo(".${id}-fr",{opacity:0,y:"5cqw",scale:0.9},{opacity:1,y:0,scale:1,duration:0.7,ease:"power3.out"},${r(T + 1.25)});` : "",
    plate ? `tl.to(".${id}-fr",{y:"-=1.2cqw",duration:2.2,ease:"sine.inOut",yoyo:true,repeat:${reps(L - 1.9, 2.2)},overwrite:"auto"},${r(T + 1.9)});` : "",
    scene.subtext && !stat ? `tl.fromTo(".${id}-sub",{opacity:0,y:"2cqw"},{opacity:1,y:0,duration:0.55,ease:"power2.out"},${r(T + 1.3)});` : "",
    AMBIENTS[amb](stat ? `.${id}-stat` : `.${id}-w`, T + 1.5, 2.4, reps(L - 1.5, 2.4)),
  ].filter(Boolean);
  return { html, s };
}

// SCENE — SHOWCASE (the product moment). One HERO plate, or two on staggered depth planes.
// Capped at two by design: the brief is 1–2 large assets per frame, and the distributor
// spreads the overflow to other scenes rather than shrinking everything to fit one.
function bShowcase(scene, ctx, sceneAssets) {
  const { id, T, L, th, acc, ent, amb } = ctx;
  const shots = (sceneAssets || []).slice(0, 2);
  const feats = bullets(scene, 3);
  const head = scene.headline || scene.title || "";
  const compact = feats.length > 0;

  let stage = "";
  if (shots.length >= 2) {
    // DEPTH PAIR: a back plate lifted and inset, a front plate overlapping it. Both large —
    // the point of the pair is two readable products, not two thumbnails.
    // A DOMINANT front plate and a smaller depth accent behind it, rather than two
    // near-equal midsize cards. Equal weights read as a contact sheet and leave neither
    // screenshot legible at 9:16; a clear hierarchy gives the eye one subject and uses the
    // column properly. (Widths are the binding constraint here — see the note on bShowcase.)
    const back = mediaPlate(`${id}-p1`, `${id}-hero ${id}-back`, th, acc, { asset: shots[1], maxWFrac: 0.56, maxHFrac: compact ? 0.28 : 0.32, tilt: 3.4, glow: 0.7 });
    const front = mediaPlate(`${id}-p0`, `${id}-hero ${id}-front`, th, acc, { asset: shots[0], maxWFrac: 0.80, maxHFrac: compact ? 0.38 : 0.44, tilt: -2.6, glow: 1.2 });
    stage = `<div style="position:relative;width:100%;height:${r(Math.max(back.h, front.h) + 14)}cqw;">
      <div style="position:absolute;right:2%;top:0;">${back.html}</div>
      <div style="position:absolute;left:2%;top:${r(Math.max(6, back.h * 0.24))}cqw;">${front.html}</div>
    </div>`;
  } else if (shots.length === 1) {
    const hero = mediaPlate(`${id}-p0`, `${id}-hero`, th, acc, { asset: shots[0], maxWFrac: 0.92, maxHFrac: compact ? 0.50 : 0.62, glow: 1.25, hero: true });
    stage = `<div style="display:flex;justify-content:center;width:100%;">${hero.html}</div>`;
  }

  const featHtml = feats.length
    // width:100% IS LEAD, NOT TRIM. `.kf-safe` is align-items:center, so an intermediate stack
    // is shrink-to-fit — and a percentage max-width on the chips inside then resolves against
    // that COLLAPSED box rather than the content column, squeezing 26-character labels until
    // they clipped mid-word. Giving the stack a definite width is what makes the chip's own
    // max-width mean what it says. (Belt and braces: .kf-chip also wraps now.)
    ? `<div style="display:flex;flex-direction:column;gap:1.5cqw;align-items:center;width:100%;margin-top:${shots.length ? 3.4 : 5}cqw;">${feats.map((f, k) =>
        `<div class="kf-chip ${id}-fi" style="opacity:0;font-size:${chipFont(f)}cqw;border-color:${k % 2 ? acc.border : acc.line};box-shadow:0 1.4cqw 5cqw -2.4cqw ${k % 2 ? acc.b : acc.a};"><span class="kf-dot" style="background:${k % 2 ? acc.b : acc.a};box-shadow:0 0 1.2cqw ${k % 2 ? acc.b : acc.a};"></span>${esc(f)}</div>`).join("")}</div>`
    : "";
  const html = open(ctx, `
    ${kicker(ctx, ctx.kick)}
    <div class="kf-h1 ${id}-head" style="opacity:0;font-size:${headlineSize(head, shots.length ? 7.2 : 9.4, ctx.portrait)}cqw;margin:1.8cqw 0 ${shots.length ? 3.6 : 2}cqw;">${esc(head)}</div>
    ${stage}
    ${featHtml}`);
  const s = [
    `tl.set("#${id}",{opacity:1},${r(T)});`,
    `tl.fromTo(".${id}-kick",{opacity:0,y:"-2cqw"},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 0.14)});`,
    `tl.fromTo(".${id}-head",{opacity:0,y:"2.4cqw"},{opacity:1,y:0,duration:0.58,ease:"power3.out"},${r(T + 0.26)});`,
    shots.length >= 2
      ? `tl.fromTo(".${id}-back",{opacity:0,y:"7cqw",scale:0.84,rotationX:10},{opacity:1,y:0,scale:1,rotationX:0,duration:0.72,ease:"power3.out"},${r(T + 0.44)});
  tl.fromTo(".${id}-front",{opacity:0,y:"9cqw",scale:0.86,rotationX:12},{opacity:1,y:0,scale:1,rotationX:0,duration:0.78,ease:"power3.out"},${r(T + 0.6)});`
      : shots.length ? ENTRANCES[ent](`.${id}-hero`, T + 0.46, 0.8) : "",
    shots.length ? AMBIENTS[amb](`.${id}-hero`, T + 1.5, 2.2, reps(L - 1.5, 2.2)) : "",
    feats.length ? `tl.fromTo(".${id}-fi",{opacity:0,x:"-2.4cqw",scale:0.94},{opacity:1,x:0,scale:1,duration:0.46,ease:"back.out(1.7)",stagger:0.13},${r(T + (shots.length ? 1.0 : 0.7))});` : "",
  ].filter(Boolean);
  return { html, s };
}

// SCENE — DISCOVERY. Two plates on distinct depth planes with the copy floated over them —
// the "your product, in orbit" beat. v1 scattered FIVE frames at 26–34cqw each (26–34% of the
// frame width, all force-cropped to a fixed 1.5 multiplier); two large ones read as a designed
// composition instead of a contact sheet.
function bDiscovery(scene, ctx, sceneAssets) {
  const { id, T, L, th, acc, amb } = ctx;
  const shots = (sceneAssets || []).slice(0, 2);
  const head = scene.headline || scene.title || "";
  const far = shots[1] ? mediaPlate(`${id}-d1`, `${id}-fr ${id}-far`, th, acc, { asset: shots[1], maxWFrac: 0.46, maxHFrac: 0.24, tilt: 5.5, glow: 0.6 }) : null;
  const near = shots[0] ? mediaPlate(`${id}-d0`, `${id}-fr ${id}-near`, th, acc, { asset: shots[0], maxWFrac: 0.88, maxHFrac: 0.46, tilt: -3.5, glow: 1.3, hero: true }) : null;
  const html = open(ctx, `
    <div style="position:absolute;inset:0;">
      ${far ? `<div style="position:absolute;right:4%;top:16%;opacity:0.94;">${far.html}</div>` : ""}
      ${near ? `<div style="position:absolute;left:4%;bottom:14%;">${near.html}</div>` : ""}
    </div>
    <div class="${id}-cap" style="position:absolute;left:0;right:0;top:${far ? "6%" : "16%"};padding:0 7%;opacity:0;text-align:center;">
      ${kicker(ctx, ctx.kick)}
      <div class="kf-h1" style="font-size:${headlineSize(head, 8.2, ctx.portrait)}cqw;margin-top:2cqw;text-shadow:0 0.4cqw 2.4cqw ${th.ground};">${esc(head)}</div>
    </div>`, { safe: false });
  const s = [
    `tl.set("#${id}",{opacity:1},${r(T)});`,
    far ? `tl.fromTo(".${id}-far",{opacity:0,y:"-6cqw",scale:0.82,filter:"blur(6px)"},{opacity:0.94,y:0,scale:1,filter:"blur(0px)",duration:0.8,ease:"power3.out"},${r(T + 0.2)});` : "",
    near ? `tl.fromTo(".${id}-near",{opacity:0,y:"9cqw",scale:0.86},{opacity:1,y:0,scale:1,duration:0.82,ease:"power3.out"},${r(T + 0.36)});` : "",
    `tl.fromTo(".${id}-cap",{opacity:0,y:"-2.4cqw"},{opacity:1,y:0,duration:0.6,ease:"power2.out"},${r(T + 0.55)});`,
    `tl.fromTo(".${id}-kick",{opacity:0},{opacity:1,duration:0.4},${r(T + 0.6)});`,
    // PARALLAX: the far plane drifts against the near one, so the composition has depth in
    // motion and not only in stacking order.
    far ? `tl.to(".${id}-far",{y:"-=2.2cqw",x:"+=1.2cqw",duration:3,ease:"sine.inOut",yoyo:true,repeat:${reps(L - 1.2, 3)},overwrite:"auto"},${r(T + 1.2)});` : "",
    near ? AMBIENTS[amb](`.${id}-near`, T + 1.3, 2.3, reps(L - 1.3, 2.3)) : "",
  ].filter(Boolean);
  return { html, s };
}

// SCENE — ORBIT. Headline plus a rising stack of chips, ringed by an accent orbit. The
// default for bullet-led copy.
function bOrbit(scene, ctx) {
  const { id, T, L, th, acc, ent, amb } = ctx;
  const head = scene.headline || scene.title || "";
  let chips = bullets(scene, 4);
  if (!chips.length) {
    const sup = supportLine(scene, [head]);
    chips = sup ? [sup] : [];
  }
  const rings = [0, 1].map((k) =>
    `<div class="${id}-ring${k}" style="position:absolute;left:50%;top:46%;width:${68 + k * 26}cqw;height:${68 + k * 26}cqw;margin:-${(68 + k * 26) / 2}cqw 0 0 -${(68 + k * 26) / 2}cqw;border-radius:50%;border:0.14cqw solid ${k ? acc.line : acc.border};opacity:0;"></div>`).join("");
  const chipHtml = chips.map((c, i) =>
    `<div class="kf-chip ${id}-chip" style="opacity:0;font-size:${chipFont(c)}cqw;border-color:${i % 2 ? acc.border : acc.line};box-shadow:0 1.4cqw 5cqw -2.4cqw ${i % 2 ? acc.b : acc.a};"><span class="kf-dot" style="background:${i % 2 ? acc.b : acc.a};box-shadow:0 0 1.2cqw ${i % 2 ? acc.b : acc.a};"></span>${esc(c)}</div>`).join("");
  const html = open(ctx, `
    ${rings}
    ${kicker(ctx, ctx.kick)}
    <div class="kf-display ${id}-head" style="font-size:${headlineSize(head, 9.6, ctx.portrait)}cqw;margin:2cqw 0 4.6cqw;">${maskWords(`${id}-w`, head, { accent: true })}</div>
    ${chipHtml ? `<div style="display:flex;flex-direction:column;gap:2cqw;align-items:center;width:100%;">${chipHtml}</div>` : ""}`);
  const s = [
    `tl.set("#${id}",{opacity:1},${r(T)});`,
    `tl.fromTo(".${id}-ring0",{opacity:0,scale:0.7,rotation:0},{opacity:1,scale:1,rotation:26,duration:${r(Math.max(1.6, L))},ease:"none"},${r(T + 0.1)});`,
    `tl.fromTo(".${id}-ring1",{opacity:0,scale:0.8,rotation:0},{opacity:1,scale:1,rotation:-20,duration:${r(Math.max(1.6, L))},ease:"none"},${r(T + 0.1)});`,
    `tl.fromTo(".${id}-kick",{opacity:0,y:"-2cqw"},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 0.16)});`,
    ENTRANCES[ent](`.${id}-w`, T + 0.32, 0.7),
    chipHtml ? `tl.fromTo(".${id}-chip",{opacity:0,y:"3cqw",scale:0.9},{opacity:1,y:0,scale:1,duration:0.5,ease:"back.out(1.7)",stagger:0.13},${r(T + 0.72)});` : "",
    chipHtml ? AMBIENTS[amb](`.${id}-chip`, T + 1.6, 2.4, reps(L - 1.6, 2.4)) : "",
  ].filter(Boolean);
  return { html, s };
}

// SCENE — STATEMENT. A single centred gradient line that breathes, with an oversized quote
// glyph and an optional grounding plate when the director bound a shot to the quote.
function bStatement(scene, ctx, sceneAssets) {
  const { id, T, L, th, acc, amb } = ctx;
  const asset = (sceneAssets && sceneAssets[0]) || null;
  const head = scene.headline || scene.title || "";
  // A PORTRAIT shot is height-bound, so a landscape-shaped budget starves it: at maxHFrac
  // 0.30 a 0.46-ratio phone capture came out 25% of the frame width. Give a tall shot a tall
  // budget and it lands near 44% of the frame height, which is what "large asset" means here.
  const tall = ratioOf(asset) > 0 && ratioOf(asset) < 0.9;
  const plate = asset
    ? mediaPlate(`${id}-p0`, `${id}-fr`, th, acc, { asset, maxWFrac: tall ? 0.56 : 0.74, maxHFrac: tall ? 0.50 : 0.34, glow: 1.0 })
    : null;
  // THE GLYPH BELONGS TO A QUOTE, NOT TO AN ARCHETYPE. varyArchetypes can move ANY scene into
  // `statement` to break an adjacent repeat, so keying the quotation mark off the archetype
  // stamped a giant “ onto ordinary feature copy. Key it off what the script actually said.
  const isQuote = /quote|testimonial|manifesto/.test(`${scene.kind || ""} ${scene.purpose || ""}`.toLowerCase());
  const html = open(ctx, `
    ${isQuote ? `<div class="${id}-quote" style="position:absolute;left:6%;top:16%;font-family:${th.displayStack};font-weight:800;font-size:34cqw;line-height:0.7;color:${acc.a};opacity:0;">&ldquo;</div>` : ""}
    ${plate ? `<div style="margin-bottom:4.4cqw;">${plate.html}</div>` : ""}
    <div class="kf-display ${id}-st" style="font-size:${headlineSize(head, asset ? (tall ? 7.8 : 8.6) : 11.6, ctx.portrait)}cqw;">${maskWords(`${id}-w`, head, { accent: true })}</div>
    ${scene.subtext ? `<div class="kf-body ${id}-sub" style="opacity:0;margin-top:3.2cqw;max-width:78%;${isQuote ? "letter-spacing:0.18em;text-transform:uppercase;font-size:2.2cqw;" : ""}">${esc(scene.subtext)}</div>` : ""}`);
  const s = [
    `tl.set("#${id}",{opacity:1},${r(T)});`,
    isQuote ? `tl.fromTo(".${id}-quote",{opacity:0,scale:0.6,rotation:-8},{opacity:0.22,scale:1,rotation:0,duration:0.9,ease:"power3.out"},${r(T + 0.12)});` : "",
    plate ? `tl.fromTo(".${id}-fr",{opacity:0,y:"6cqw",scale:0.9},{opacity:1,y:0,scale:1,duration:0.72,ease:"power3.out"},${r(T + 0.24)});` : "",
    plate ? `tl.to(".${id}-fr",{y:"-=1.4cqw",duration:2.2,ease:"sine.inOut",yoyo:true,repeat:${reps(L - 1.5, 2.2)},overwrite:"auto"},${r(T + 1.3)});` : "",
    `tl.fromTo(".${id}-w",{yPercent:115,opacity:0,filter:"blur(6px)"},{yPercent:0,opacity:1,filter:"blur(0px)",duration:0.72,ease:"expo.out",stagger:0.06},${r(T + (asset ? 0.5 : 0.28))});`,
    scene.subtext ? `tl.fromTo(".${id}-sub",{opacity:0,y:"2cqw"},{opacity:1,y:0,duration:0.55,ease:"power2.out"},${r(T + 1.1)});` : "",
    AMBIENTS[amb](`.${id}-st`, T + 1.3, 2.8, reps(L - 1.3, 2.8)),
  ].filter(Boolean);
  return { html, s };
}

// SCENE — CTA. The logo mark assembles (the user's own logo when uploaded, else a built
// glyph), the wordmark types in, a gradient button pulses. Every string here is derived —
// the button from the script's `emphasis`, the URL from a domain found in the copy, the
// tagline from the subtext. Nothing is invented, and nothing names this tool.
function bCta(scene, ctx, logo) {
  const { id, T, L, th, acc, S } = ctx;
  const word = String(scene.headline || scene.title || ctx.title || "").slice(0, 24);
  const btn = String(scene.emphasis || S.ctaButton || "").slice(0, 24);
  const url = domainOf(scene.subtext) || domainOf(scene.emphasis) || domainOf(ctx.title);
  const rawTag = String(scene.subtext || "").trim();
  const tagline = rawTag && rawTag !== url ? rawTag.slice(0, 72) : "";
  const mark = logo && logo.path
    ? logoMark(logo, { sizeCqw: 22, ground: th.ground, glow: acc.a, escape: esc })
    : `<div style="position:relative;width:20cqw;height:20cqw;">
        <div style="position:absolute;inset:12%;border:0.4cqw solid ${acc.border};border-radius:22%;"></div>
        <div style="position:absolute;inset:6%;border:0.4cqw solid ${acc.line};border-radius:22%;"></div>
        <div style="position:absolute;inset:0;border-radius:22%;background:${acc.gradient};box-shadow:0 0 6cqw ${acc.a};display:flex;align-items:center;justify-content:center;">
          <div style="width:0;height:0;border-top:3.4cqw solid transparent;border-bottom:3.4cqw solid transparent;border-left:5.4cqw solid #fff;margin-left:1.2cqw;"></div>
        </div>
      </div>`;
  const html = open(ctx, `
    <div class="kf-ring ${id}-halo" style="opacity:0;width:52cqw;height:52cqw;margin:-26cqw 0 0 -26cqw;border-color:${acc.line};box-shadow:0 0 10cqw ${acc.a};"></div>
    ${kicker(ctx, ctx.kick)}
    <div class="${id}-mark" style="opacity:0;margin-top:2.4cqw;">${mark}</div>
    <div class="kf-wordmark" style="font-size:${r(Math.min(10.5, fitCap(word)))}cqw;margin-top:3cqw;">${wordCharSpans(word, `${id}-ch`)}</div>
    ${tagline ? `<div class="kf-body ${id}-tag" style="opacity:0;margin-top:1.8cqw;max-width:80%;">${esc(tagline)}</div>` : ""}
    ${btn ? `<div class="kf-btn ${id}-btn" style="opacity:0;margin-top:3.6cqw;background:${acc.gradient};box-shadow:0 2cqw 6cqw -1.5cqw ${acc.a}, 0 0 4cqw -1cqw ${acc.b};">${esc(btn)} <span style="opacity:0.8;">&#9656;</span></div>` : ""}
    ${url ? `<div class="${id}-url" style="opacity:0;font-family:${th.monoStack};letter-spacing:0.24em;font-size:2.3cqw;color:${th.faint};margin-top:2.2cqw;">${esc(url.toUpperCase())}</div>` : ""}`);
  const s = [
    `tl.set("#${id}",{opacity:1},${r(T)});`,
    `tl.fromTo(".${id}-halo",{opacity:0,scale:0.5},{opacity:1,scale:1,duration:1.1,ease:"power3.out"},${r(T + 0.1)});`,
    `tl.fromTo(".${id}-kick",{opacity:0,y:"-2cqw"},{opacity:1,y:0,duration:0.45,ease:"power2.out"},${r(T + 0.18)});`,
    `tl.fromTo(".${id}-mark",{opacity:0,scale:0.55,y:"2.4cqw",rotation:-10},{opacity:1,scale:1,y:0,rotation:0,duration:0.7,ease:"back.out(1.8)"},${r(T + 0.3)});`,
    `tl.fromTo(".${id}-ch",{opacity:0,y:"5cqw",rotationX:70},{opacity:1,y:0,rotationX:0,duration:0.55,ease:"power3.out",stagger:0.035},${r(T + 0.68)});`,
    tagline ? `tl.fromTo(".${id}-tag",{opacity:0,y:"1.6cqw"},{opacity:1,y:0,duration:0.5,ease:"power2.out"},${r(T + 1.18)});` : "",
    btn ? `tl.fromTo(".${id}-btn",{opacity:0,scale:0.78},{opacity:1,scale:1,duration:0.52,ease:"back.out(2)"},${r(T + 1.42)});` : "",
    btn ? `tl.to(".${id}-btn",{scale:1.045,duration:0.72,ease:"sine.inOut",yoyo:true,repeat:${reps(L - 2.0, 0.72)},overwrite:"auto"},${r(T + 2.0)});` : "",
    url ? `tl.fromTo(".${id}-url",{opacity:0,letterSpacing:"0.5em"},{opacity:1,letterSpacing:"0.24em",duration:0.6,ease:"power2.out"},${r(T + 1.66)});` : "",
    `tl.to(".${id}-halo",{scale:1.05,duration:2.6,ease:"sine.inOut",yoyo:true,repeat:${reps(L - 1.2, 2.6)},overwrite:"auto"},${r(T + 1.2)});`,
  ].filter(Boolean);
  return { html, s };
}

const BUILDERS = { ignition: bIgnition, reveal: bReveal, showcase: bShowcase, discovery: bDiscovery, orbit: bOrbit, statement: bStatement, cta: bCta };

// ---- persistent COSMOS canvas (hf-seek) --------------------------------------
// ONE canvas painted purely from the renderer's hf-seek time. Six layers, back to front:
// nebula fields · light beams · perspective grid floor · three parallax star planes ·
// constellation lines · vignette. Coloured ONLY from the theme accents, so a brand skin
// repaints the entire backdrop.
//
// WARP IMPULSES are the piece that ties the backdrop to the EDIT: every cut is baked in as
// [time, intensity], and warpAt(t) decays over ~0.55s, driving beam brightness, star streak
// length, grid scroll speed and a chromatic ring. The universe reacts when the film cuts,
// which is what stops the backdrop reading as wallpaper behind a slideshow.
//
// Deterministic by construction: a pure function of t, no rAF and no wall clock (the linter
// rejects both, and either would desync frame capture).
function cosmosClip(theme, dims, D, seed, cuts, sceneWindows) {
  const W = dims.width, H = dims.height;
  const [a1r, a1g, a1b] = hexToRgb(theme.accents[0]);
  const [a2r, a2g, a2b] = hexToRgb(theme.accents[1]);
  const [a3r, a3g, a3b] = hexToRgb(theme.accents[2]);
  const [gr, gg, gb] = hexToRgb(theme.ground);
  const html = `<div id="kf-cosmos-clip" class="clip" data-start="0" data-duration="${D}" data-track-index="0" data-layout-allow-occlusion style="background:${theme.ground};">
    <canvas id="kf-cosmos" width="${W}" height="${H}" style="position:absolute;inset:0;width:100%;height:100%;"></canvas>
  </div>`;
  const script = `(function(){
  var cv=document.getElementById("kf-cosmos");if(!cv||!cv.getContext)return;var cx=cv.getContext("2d");if(!cx)return;
  var W=${W},H=${H};
  function A1(a){return "rgba(${a1r},${a1g},${a1b},"+a+")";}
  function A2(a){return "rgba(${a2r},${a2g},${a2b},"+a+")";}
  function A3(a){return "rgba(${a3r},${a3g},${a3b},"+a+")";}
  var GD="rgba(${gr},${gg},${gb},";
  var CUTS=${JSON.stringify(cuts)};            // [[time,intensity],...] — one per edit
  var SCN=${JSON.stringify(sceneWindows)};     // [[start,end,camDir],...] — camera per scene
  var sd=${seed >>> 0};function rnd(){sd=(sd*1664525+1013904223)>>>0;return sd/4294967296;}
  // Three parallax planes. depth 0 = far (slow, dim, small), 2 = near (fast, bright, large).
  var AREA=(W*H)/(1080*1920),ST=[];
  var COUNT=[Math.round(46*AREA),Math.round(30*AREA),Math.round(18*AREA)];
  for(var p=0;p<3;p++){for(var i=0;i<COUNT[p];i++){ST.push({p:p,bx:rnd(),by:rnd(),d:0.2+0.4*p+0.4*rnd(),sz:(0.7+0.9*p)+2.2*rnd(),c:rnd(),ph:rnd()*6.28});}}
  var NEB=[];for(var i=0;i<4;i++){NEB.push({x:rnd(),y:rnd(),s:0.5+rnd()*0.7,sp:0.05+rnd()*0.09,ph:rnd()*6.28,c:i%3});}
  // Impulse from the nearest PRECEDING cut, decaying over 0.55s. Pure function of t.
  function warpAt(t){var w=0;for(var i=0;i<CUTS.length;i++){var d=t-CUTS[i][0];if(d>=0&&d<0.55){var k=1-d/0.55;w=Math.max(w,CUTS[i][1]*k*k);}}return w;}
  // Slow lateral camera drift whose direction flips per scene, so the world feels handled
  // by an operator rather than looped.
  function camAt(t){var x=0;for(var i=0;i<SCN.length;i++){if(t>=SCN[i][0]&&t<SCN[i][1]){var u=(t-SCN[i][0])/Math.max(0.1,SCN[i][1]-SCN[i][0]);x=SCN[i][2]*(u-0.5);break;}}return x;}
  function nebula(t){for(var i=0;i<NEB.length;i++){var n=NEB[i];
    var x=(n.x+Math.sin(t*n.sp+n.ph)*0.10)*W,y=(n.y+Math.cos(t*n.sp*0.8+n.ph)*0.07)*H,rr=Math.max(W,H)*0.52*n.s;
    var g=cx.createRadialGradient(x,y,0,x,y,rr);var f=n.c===0?A1:n.c===1?A2:A3;
    g.addColorStop(0,f(0.16));g.addColorStop(0.55,f(0.045));g.addColorStop(1,f(0));cx.fillStyle=g;cx.fillRect(0,0,W,H);}}
  function beam(fx,cxp,cyp,drift,size,op){var x=cxp*W+Math.sin(drift)*W*0.12,y=cyp*H+Math.cos(drift*0.8)*H*0.06;
    var g=cx.createRadialGradient(x,y,0,x,y,size);g.addColorStop(0,fx(op));g.addColorStop(0.62,fx(0));cx.fillStyle=g;cx.fillRect(0,0,W,H);}
  function draw(t){
    var wp=warpAt(t),cam=camAt(t)*W*0.035;
    cx.clearRect(0,0,W,H);
    nebula(t);
    beam(A1,0.28,0.30,t*0.18,W*0.95,0.34+0.30*wp);
    beam(A2,0.74,0.64,t*-0.14,W*0.85,0.30+0.26*wp);
    beam(A3,0.55,0.12,t*0.10,W*0.72,0.18+0.22*wp);
    // perspective grid floor — scroll accelerates on a cut
    var gh=H*0.42,top=H-gh,vp=W*0.5+cam,gu=W*0.09,sc=((t*46)+(wp*90))%gu;
    cx.lineWidth=1.4;
    for(var ri=0;ri<24;ri++){var f=Math.pow((ri+sc/gu)/24,1.9);var yy=top+f*gh;if(yy<top||yy>H)continue;
      cx.globalAlpha=(0.20+0.16*wp)*(1-f);cx.strokeStyle=A1(1);cx.beginPath();cx.moveTo(0,yy);cx.lineTo(W,yy);cx.stroke();}
    for(var v=-9;v<=9;v++){cx.globalAlpha=0.11+0.09*wp;cx.strokeStyle=A1(1);cx.beginPath();cx.moveTo(vp+v*gu*0.5,top);cx.lineTo(vp+v*W*0.19,H);cx.stroke();}
    cx.globalAlpha=1;
    // three parallax star planes; the near plane STREAKS during a warp
    var span=H+60,near=[];
    for(var i=0;i<ST.length;i++){var s=ST[i];
      var y=(s.by*span-t*(10+64*s.d))%span;if(y<0)y+=span;y-=30;
      var x=s.bx*W+Math.sin(t*0.5+s.ph)*13*s.d-cam*(0.3+s.d);
      var sz=s.sz*(0.45+s.d*0.75);
      cx.globalAlpha=0.14+0.5*s.d;
      var col=s.c<0.34?A1(1):s.c<0.67?A2(1):A3(1);
      cx.fillStyle=col;cx.shadowColor=col;cx.shadowBlur=sz*3.2;
      // A warp STREAK, not a bar. At 26x the star radius the near plane rendered as coloured
      // confetti over the cut; 12x with the alpha pulled down reads as motion blur on stars
      // that are already there — the effect is meant to sell speed, not to become the subject.
      if(s.p===2&&wp>0.12){var len=sz*(2+12*wp);cx.globalAlpha*=0.62;cx.beginPath();cx.moveTo(x,y);cx.lineTo(x,y+len);cx.lineWidth=sz*1.25;cx.strokeStyle=col;cx.stroke();}
      else {cx.beginPath();cx.arc(x,y,sz,0,6.283);cx.fill();}
      if(s.p===2)near.push([x,y]);}
    cx.shadowBlur=0;
    // constellation lines across the near plane only — cheap, and it reads as "universe"
    cx.lineWidth=1;cx.strokeStyle=A2(1);
    for(var i=0;i<near.length;i++){for(var j=i+1;j<near.length;j++){
      var dx=near[i][0]-near[j][0],dy=near[i][1]-near[j][1],dd=dx*dx+dy*dy,lim=(W*0.20)*(W*0.20);
      if(dd<lim){cx.globalAlpha=0.16*(1-dd/lim);cx.beginPath();cx.moveTo(near[i][0],near[i][1]);cx.lineTo(near[j][0],near[j][1]);cx.stroke();}}}
    cx.globalAlpha=1;
    // chromatic pulse on the cut, then the vignette
    if(wp>0.02){var pr=Math.min(W,H)*(0.18+0.9*(1-wp));var pg2=cx.createRadialGradient(W*0.5,H*0.46,pr*0.6,W*0.5,H*0.46,pr*1.9);
      pg2.addColorStop(0,A2(0));pg2.addColorStop(0.75,A2(0.10*wp));pg2.addColorStop(1,A1(0));cx.fillStyle=pg2;cx.fillRect(0,0,W,H);}
    var vg=cx.createRadialGradient(W*0.5,H*0.42,Math.min(W,H)*0.20,W*0.5,H*0.42,Math.max(W,H)*0.78);
    vg.addColorStop(0,GD+"0)");vg.addColorStop(1,GD+"0.90)");cx.fillStyle=vg;cx.fillRect(0,0,W,H);
  }
  // hf-seek drives the render (deterministic, seek-exact, frame-capture-safe); the GSAP
  // timeline's onUpdate ALSO drives it so the cosmos animates in live preview, in lockstep.
  window.KF_COSMOS=draw;window.addEventListener("hf-seek",function(e){draw((e.detail&&e.detail.time)||0);});draw(0);
})();`;
  return { html, script };
}

// ---- grain overlay (top layer) -----------------------------------------------
const GRAIN_URI = grainUri(0.9);
function grainClip(D) {
  return `<div id="kf-grain" class="clip" data-start="0" data-duration="${D}" data-track-index="40" data-layout-allow-occlusion style="pointer-events:none;background-image:url('${GRAIN_URI}');background-size:260px 260px;opacity:0.05;mix-blend-mode:overlay;"></div>`;
}

// ---- style -------------------------------------------------------------------
function styleBlock(theme, portrait) {
  const safePad = portrait ? "11% 6% 15%" : "8% 8% 10%";
  return `${theme.fontFace}
  * { box-sizing:border-box; margin:0; padding:0; }
  html, body { width:100%; height:100%; overflow:hidden; background:#000; }
  #root { position:relative; overflow:hidden; isolation:isolate; background:${theme.ground}; container-type:size; color:${theme.text}; font-family:${theme.bodyStack}; }
  .clip { position:absolute; top:0; left:0; width:100%; height:100%; overflow:hidden; }
  .kf-scene { perspective:1500px; }
  .kf-stage { position:absolute; inset:0; transform-origin:50% 46%; will-change:transform,opacity,filter; }
  .kf-safe { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:${safePad}; text-align:center; }
  .kf-display { font-family:${theme.displayStack}; font-weight:800; line-height:0.96; letter-spacing:-0.03em; color:${theme.text}; max-width:96%; }
  .kf-h1 { font-family:${theme.displayStack}; font-weight:700; line-height:1.04; letter-spacing:-0.02em; color:${theme.text}; max-width:94%; }
  .kf-h2 { font-family:${theme.displayStack}; font-weight:600; font-size:4.2cqw; line-height:1.16; letter-spacing:-0.01em; color:${theme.dim}; }
  .kf-stat { font-family:${theme.displayStack}; font-weight:800; font-size:26cqw; line-height:0.86; letter-spacing:-0.045em; }
  /* .kw / .kwi / .kacc are the names caption_render.js's SHAPING_FIX targets — a non-Latin
     video-text language relies on overflow/background-clip being neutralised HERE. */
  .kw { display:inline-block; overflow:hidden; vertical-align:bottom; padding:0 0.06em 0.1em 0; }
  .kwi { display:inline-block; will-change:transform,opacity; }
  .kacc .kwi { background:linear-gradient(118deg, ${theme.accents[0]}, ${theme.accents[1]}); -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; color:${theme.accents[0]}; }
  .kf-kicker { display:inline-flex; align-items:center; gap:0.9cqw; font-family:${theme.monoStack}; font-weight:600; font-size:2cqw; letter-spacing:0.4em; text-transform:uppercase; color:${theme.dim}; }
  .kf-kdot { width:0.9cqw; height:0.9cqw; border-radius:50%; flex:0 0 auto; }
  .kf-body { font-family:${theme.bodyStack}; font-weight:500; font-size:2.7cqw; line-height:1.44; color:${theme.dim}; }
  .kf-rule { width:16cqw; height:0.34cqw; border-radius:999px; margin-top:3cqw; }
  .kf-wordmark { display:flex; flex-wrap:wrap; justify-content:center; text-align:center; gap:0 0.26em; max-width:92%; font-family:${theme.displayStack}; font-weight:800; letter-spacing:-0.02em; color:${theme.text}; }
  /* A CHIP WRAPS, IT NEVER CLIPS. The first cut of this pack set nowrap + overflow:hidden +
     text-overflow:ellipsis, which trades an overflow for a TRUNCATION — and the QA vision
     reviewer correctly called that a blocker on a real film ("Product development syst").
     The script's onScreenText lines are whole sentences, not labels, so any single-line pill
     is one long bullet away from losing words. Wrapping keeps every word; overflow-wrap
     stops a pathological unbroken token from escaping the frame either way. */
  .kf-chip { display:inline-flex; align-items:center; gap:1.4cqw; padding:1.5cqw 3cqw; border-radius:3cqw; background:color-mix(in oklab, ${theme.accents[0]} 7%, rgba(255,255,255,0.035)); border:1px solid transparent; backdrop-filter:blur(6px); font-family:${theme.monoStack}; font-weight:600; font-size:2.6cqw; line-height:1.32; letter-spacing:0.04em; color:${theme.text}; max-width:90%; text-align:left; white-space:normal; overflow-wrap:anywhere; will-change:transform,opacity; }
  .kf-dot { width:1.3cqw; height:1.3cqw; border-radius:3px; flex:0 0 auto; align-self:flex-start; margin-top:0.5cqw; }
  .kf-btn { display:inline-flex; align-items:center; gap:1cqw; padding:2.7cqw 6.2cqw; border-radius:999px; color:#fff; font-family:${theme.monoStack}; font-weight:700; font-size:3.4cqw; letter-spacing:0.1em; text-transform:uppercase; will-change:transform,opacity; }
  .kf-plate { will-change:transform,opacity; }
  .kf-ring { position:absolute; left:50%; top:46%; width:16cqw; height:16cqw; margin:-8cqw 0 0 -8cqw; border-radius:50%; border:0.3cqw solid transparent; pointer-events:none; }
  .kf-flash { position:absolute; inset:0; pointer-events:none; mix-blend-mode:screen; }
  #caps { position:absolute; inset:0; display:flex; justify-content:center; align-items:flex-end; padding-bottom:${portrait ? "16%" : "7%"}; z-index:60; pointer-events:none; }
  #cap-pill { max-width:82%; height:fit-content; flex:0 0 auto; text-align:center; padding:1.4cqw 3cqw; opacity:0; border-radius:2cqw; background:color-mix(in oklab, ${theme.ground} 82%, transparent); border:1px solid color-mix(in oklab, ${theme.accents[0]} 38%, transparent); backdrop-filter:blur(8px); }
  #cap-text { font-family:${theme.bodyStack}; font-weight:600; font-size:2.6cqw; line-height:1.35; color:${theme.text}; }`;
}

// ---- MAIN --------------------------------------------------------------------
function buildComposition({ storyboard, dims, framePack, captionCues, assets, brandSkin = null, localized = null, seedKey = null } = {}) {
  const theme = cosmicTheme(brandSkin);
  const S = localized ? { ...STRINGS, ...localized } : STRINGS;
  const sb = storyboard || {};
  const W = (dims && dims.width) || 1080, H = (dims && dims.height) || 1920;
  const portrait = W < H;
  theme.W = W; theme.H = H;
  const title = String(sb.title || "").trim();
  const scenes = Array.isArray(sb.scenes) && sb.scenes.length
    ? sb.scenes.slice(0, 12)
    : [{ id: "s1", start: 0, duration: 5, kind: "hook", headline: title }];
  const D = r(sb.durationSec || scenes.reduce((a, s) => Math.max(a, (Number(s.start) || 0) + (Number(s.duration) || 0)), 0) || 12);
  const seed = seedFrom(`${seedKey || ""}|${title || (scenes[0] && scenes[0].headline) || "kinetic"}`);
  const rnd = mulberry(seed);

  // ---- Assets: distribute real screenshots across DISPLAY-CAPABLE scenes -------
  // A screenshot must NEVER be stranded on a scene that cannot show it (hook / cta / quote).
  // The Creative Director's per-asset `sceneId` is only a HINT: honour it when that scene can
  // display an image, otherwise redistribute to the least-loaded content scene — so every
  // usable screenshot appears regardless of how the CD bound them. The logo is reserved for
  // the CTA mark. This is the fix for "no images in the video", kept from v1.
  //
  // CHANGED: the per-scene cap is now TWO, not five. The brief is 1–2 large assets per frame,
  // and a plate only reads as a product when it is large — so overflow is SPREAD to other
  // display scenes rather than crammed into one, which also raises the "assets reach ≥3
  // scenes" figure the portrait regression guard measures.
  const logo = logoAssetOf(assets);
  const shots = (Array.isArray(assets) ? assets : []).filter(screenOk)
    .sort((a, b) => (Number(b.cdScore) || 0) - (Number(a.cdScore) || 0));
  const baseArch = scenes.map((scene, i) => archetypeFor(scene, i, scenes.length));
  // ANTI-REPETITION (services/motion_planner). archetypeFor ends in a single fallthrough, so
  // every middle scene of a text-led film lands on the same type and the film reads as one
  // backdrop with rotating copy. This breaks adjacent duplicates using ONLY this pack's own
  // scene types.
  const { archetypes: varied } = varyArchetypes(baseArch, {
    pool: Object.keys(BUILDERS),
    seedKey: scenes.map((s) => s && s.id).join("|"),
  });
  for (let i = 0; i < baseArch.length; i++) baseArch[i] = varied[i];

  const canShow = (a) => a === "showcase" || a === "discovery" || a === "orbit" || a === "reveal" || a === "statement";
  const displayIdx = scenes.map((_, i) => i).filter((i) => canShow(baseArch[i]));
  const sceneIdOf = (i) => (scenes[i].id != null ? String(scenes[i].id) : `s${i + 1}`);
  const PER_SCENE_CAP = 2;
  const sceneShots = scenes.map(() => []);
  if (displayIdx.length && shots.length) {
    const leftovers = [];
    for (const a of shots) {
      const sid = a.sceneId != null ? String(a.sceneId) : null;
      const target = sid != null ? displayIdx.find((i) => sceneIdOf(i) === sid) : undefined;
      if (target != null && sceneShots[target].length < PER_SCENE_CAP) sceneShots[target].push(a);
      else leftovers.push(a);
    }
    for (const a of leftovers) {
      // Least-loaded first, so shots SPREAD across scenes before any scene takes a second.
      let best = null;
      for (const i of displayIdx) {
        if (sceneShots[i].length >= PER_SCENE_CAP) continue;
        if (best === null || sceneShots[i].length < sceneShots[best].length) best = i;
      }
      if (best !== null) sceneShots[best].push(a);
    }
  }

  const scriptStart = (i) => scenes.slice(0, i).reduce((a, s) => a + (Number(s.duration) || 0), 0);

  // Resolve every scene's timing + archetype FIRST — the transition dealer needs the whole
  // sequence before it can guarantee no repeat within three cuts, and the cosmos needs the
  // cut times before it can bake its warp impulses.
  const plan = scenes.map((scene, i) => {
    const T = r(scene.start != null ? scene.start : scriptStart(i));
    const L = r(scene.duration || 5);
    let arch = baseArch[i];
    let sceneAssets = sceneShots[i];
    if (canShow(arch) && sceneAssets.length) {
      // A quote and a STAT both keep their identity and take one grounding shot. v1 converted
      // every asset-bearing scene to a showcase, which silently threw away the huge numeral
      // that is the entire reason the script marked the scene a stat in the first place.
      if (arch === "statement" || (arch === "reveal" && statToken(scene))) sceneAssets = sceneAssets.slice(0, 1);
      else if (sceneAssets.length >= 2) arch = "discovery";
      else arch = "showcase";
    } else {
      sceneAssets = [];
      // NO EMPTY PLACEHOLDERS. v1 drew a gradient+grid box whenever a display scene had no
      // asset, so an assetless film shipped decorated blanks. A scene with nothing to show
      // is now a TYPOGRAPHIC scene — orbit for list copy, statement for a single line —
      // which is a composition rather than an apology.
      if (arch === "showcase" || arch === "discovery") arch = bullets(scene, 2).length ? "orbit" : "statement";
    }
    return { scene, i, T, L, arch, sceneAssets };
  });

  const transitions = dealTransitions(plan.map((p) => p.arch), seed);
  const cuts = transitions.map((t, i) => [r(plan[i + 1].T), r(t.warp)]);
  const sceneWindows = plan.map((p, i) => [r(p.T), r(p.T + p.L), (i % 2 ? -1 : 1) * (0.6 + rnd() * 0.8)]);

  const bodyParts = [], overlayParts = [], sceneScripts = [];
  let prevEnt = -1, prevAmb = -1;

  plan.forEach((p, i) => {
    const { scene, T, L, arch, sceneAssets } = p;
    const isLast = i === scenes.length - 1;
    // The clip lives XFADE past its own end so the outgoing scene is still alive while the
    // incoming one arrives — the window a transition needs. Unique tracks make the overlap
    // legal (overlapping_clips_same_track keys by track).
    const clipDur = Math.min(D - T, isLast ? L : L + XFADE);
    // Rotate the motion vocabulary, never repeating the previous scene's choice.
    let e = Math.floor(rnd() * ENTRANCE_KEYS.length); if (e === prevEnt) e = (e + 1) % ENTRANCE_KEYS.length; prevEnt = e;
    let m = Math.floor(rnd() * AMBIENT_KEYS.length); if (m === prevAmb) m = (m + 1) % AMBIENT_KEYS.length; prevAmb = m;
    const acc = accentOf(theme, i);
    const ctx = {
      id: `s${i + 1}`, T, L, clipDur, i, isLast, track: 2 + i, th: theme, acc, S, W, H, portrait,
      title, kick: kickerFor(i, scenes.length, arch, title),
      ent: ENTRANCE_KEYS[e], amb: AMBIENT_KEYS[m],
    };
    const built = (BUILDERS[arch] || bOrbit)(scene, ctx, arch === "cta" ? logo : sceneAssets);
    bodyParts.push(built.html);
    sceneScripts.push(built.s.filter(Boolean).join("\n  "));

    // The cut OUT of this scene.
    if (!isLast) {
      const tr = transitions[i];
      const at = plan[i + 1].T;
      const piece = tr.build({
        o: `.${ctx.id}-stage`, n: `.s${i + 2}-stage`, t: at, x: XFADE,
        id: `tx${i + 1}`, track: 20 + i, acc, theme, rnd,
      });
      if (piece.html) overlayParts.push(piece.html);
      sceneScripts.push(piece.js.join("\n  "));
    }
    // The hard kill — required after any exit (gsap_exit_missing_hard_kill) and the reason
    // non-linear seeking can never leave a stale scene on screen.
    sceneScripts.push(`kill("#${ctx.id}",${r(T + clipDur)});`);
  });

  const cues = (Array.isArray(captionCues) ? captionCues : [])
    .filter((c) => c && c.text != null)
    .map((c) => [r(c.start != null ? c.start : c.startSec || 0), r(c.end != null ? c.end : (c.start || 0) + 2), String(c.text)]);

  const cosmos = cosmosClip(theme, { width: W, height: H }, D, seed, cuts, sceneWindows);
  const caps = `<div id="caps" class="clip" data-start="0" data-duration="${D}" data-track-index="50"><div id="cap-pill"><div id="cap-text"></div></div></div>`;

  const script = `(function(){
  var D=${D};
  var tl=gsap.timeline({paused:true});
  var $=function(s){return document.querySelector(s);};
  function kill(id,t){tl.set(id,{opacity:0},t);}
  // Fly elements out along their own baked vector — used by the particle-dissolve transition
  // and the opener's orbiting satellites. The vector is a data-attribute rather than a CSS
  // transform, so GSAP owns the transform outright and cannot be fighting one (see
  // gsap_css_transform_conflict).
  function burst(sel,at,dur){var ns=document.querySelectorAll(sel);for(var i=0;i<ns.length;i++){var el=ns[i];
    var dx=parseFloat(el.getAttribute("data-dx"))||0,dy=parseFloat(el.getAttribute("data-dy"))||0;
    tl.fromTo(el,{opacity:0,x:0,y:0,scale:0.2},{opacity:1,x:dx+"cqw",y:dy+"cqw",scale:1,duration:dur*0.55,ease:"power2.out"},at+i*0.012);
    tl.to(el,{opacity:0,scale:0.3,duration:dur*0.45,ease:"power2.in"},at+dur*0.5);}}
  function orbit(sel,at,dur){var ns=document.querySelectorAll(sel);for(var i=0;i<ns.length;i++){var el=ns[i];
    var dx=parseFloat(el.getAttribute("data-dx"))||0,dy=parseFloat(el.getAttribute("data-dy"))||0;
    tl.fromTo(el,{opacity:0,x:0,y:0,scale:0.3},{opacity:0.9,x:dx+"cqw",y:dy+"cqw",scale:1,duration:0.85,ease:"power3.out"},at+i*0.07);
    tl.to(el,{x:dx*0.86+"cqw",y:dy*0.86+"cqw",duration:2.4,ease:"sine.inOut",yoyo:true,repeat:Math.max(0,Math.floor(dur/2.4)-1),overwrite:"auto"},at+1);}}

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
    overlayParts.join("\n"),
    grainClip(D),
    caps,
    `</div>`,
    `<script>`, cosmos.script, `</script>`,
    `<script>`, script, `</script>`,
    `</body>`, `</html>`,
  ].join("\n");

  const metaJson = JSON.stringify({ compositionId: "vid", width: W, height: H, fps: (dims && dims.fps) || 30, duration: D });
  // resolvedBrand echoes the accents the film actually wore (or null when no brand was
  // applied), so graph.persistWornBrand discloses the true painted palette. All three are
  // genuinely painted now (accentOf rotates them per scene), so this no longer over-reports.
  return { indexHtml, metaJson, resolvedBrand: theme.resolvedBrand };
}

module.exports = { buildComposition, STRINGS };
// Test seam. The transition sequencer is the one part of this composer whose OUTPUT is not
// visible in the emitted document by inspection — several transitions are pure GSAP with no
// markup of their own, so "which cut got which move" cannot be recovered by grepping the
// HTML. Exposing the dealer lets the variety guarantee (no repeat within three cuts, and
// affinity to the incoming archetype) be asserted directly instead of guessed at.
module.exports.__test = { dealTransitions, TRANSITIONS, accentOf, cosmicTheme, kickerFor, statToken, domainOf };
