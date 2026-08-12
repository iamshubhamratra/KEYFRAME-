// SLAB STAGE composer — a native GSAP + DOM "one continuously moving stage" film.
// The pack `slab-stage` (manifest renderer:"slab-stage") routes here through the
// table-dispatched NATIVE_PACK_COMPOSERS map in pipeline.js.
//
// ─────────────────────────────────────────────────────────────────────────────────────
// PROVENANCE — the sibling of grid-dispatch, and deliberately its opposite
//
// Adapted from the imported OmniMotion/React template "Keyframe Slab" (Modernist design
// system, same import as grid-dispatch). HyperFrames cannot render React, so the DESIGN and
// the MOTION were ported and the runtime was not.
//
// The two imports shipped together but are not variations on one look, and this file leans
// into that: grid-dispatch is FLAT, printed, mono-accent, and its camera settles before every
// cut. Slab Stage is DIMENSIONAL, dark-capable, two-accent, and its camera never settles at
// all. Two packs that move the same way are one pack with two skins.
//
// KEPT (the identity):
//   • ONE CONTINUOUS CAMERA. Pan, breath and drift run off the FILM clock, not the scene
//     clock, so the move carries straight through every cut — the piece reads as one take
//     rather than a stack of pages. Each cut adds a short whip that resolves.
//   • SLABS — flat 3D planes on a shared vanishing point, rotated on Y and X, depth-scaled
//     and depth-shadowed, each BREATHING ON ITS OWN PHASE so nothing sits perfectly still.
//   • KARAOKE TYPE — copy arrives word by word; the live word snaps large in the accent,
//     spoken words hold back, unspoken sit fainter, each attack carrying a blur smear.
//   • GHOST TYPE — the live word echoed as huge outlined letters, tiled and drifting.
//   • Line-art PROPS that draw themselves on via stroke-dash.
//   • Alternating light/dark grounds, two accents, the brand-gradient CUT BAR, the progress
//     bar and the corner wordmark block.
//
// DROPPED (demo content or incompatible runtime):
//   • React, dc-runtime, the tweaks panel, window.OM_SCENES, the name-keyed SCENE_MAP.
//   • `AppUI` — the source drew a FAKE PRODUCT INTERFACE for this tool ("STEP 01 — BRIEF",
//     "Reading your product", "yourproduct.com", "3 COLOURS", "12 screenshots"). That is an
//     advertisement for the generator inside a customer's film. Deleted outright rather than
//     adapted: the slabs now carry the customer's REAL screenshots, which is what the slot
//     was always for.
//   • Every hardcoded string, incl. the wordmark "KEYFRAME" and "One prompt in. A finished
//     film out." Copy is derived from the script; STRINGS holds neutral furniture only.
//   • The author-supplied `say[]` word timings — karaoke timing is now derived from each
//     scene's own duration, so any script length completes inside its beat.
//
// ENGINEERING CONTRACT (shared with the other native composers): one paused GSAP timeline on
// window.__timelines["vid"] · direct-child .clip scenes on UNIQUE tracks · the clip root
// carries visibility ONLY, .sb-stage carries the transition transform and .sb-cam the camera,
// so no two systems ever animate one transform · a hard opacity:0 kill per scene · finite
// repeats via Math.floor · ONE seek-safe caption node · deterministic (no rAF, no wall clock).
//
// Word reveals use the .kw/.kwi convention — caption_render.js's SHAPING_FIX neutralises
// overflow/clip-path on exactly those names for non-Latin video text.

const { fontFaceCss, isBundled } = require("../fonts/pack_fonts");
const { isLogo } = require("./asset_priority");
const admission = require("./asset_admission");
const { logoMark } = require("./logo_render");
const { supportLine } = require("./text_fx");
const { resolveBrand } = require("./brand_kit");
const { GSAP_CDN, r, esc, hexToRgb, relLum, longestWord, bullets, logoAssetOf, resolveBrandName } = require("./composer_kit");

const DISPLAY = "Archivo";
const MONO = "JetBrains Mono";

// ---- geometry (authored in px on a 1080x1920 stage) --------------------------
const STAGE_W = 1080;
const U = (px) => Math.round((px / STAGE_W) * 10000) / 100;   // px -> cqw
const M = U(80);
// The camera scales and pans its layer, so the content column is inset well inside the
// page margin (see .sb-col). COL_W is that column's real width — every type measurement
// must use it, never the page grid, or copy is sized for room it does not have.
// The camera is calm enough now (see camera()) that the page margin itself is a safe
// column, which is what the reference uses.
const COL_INSET = M;
const COL_W = Math.round((100 - COL_INSET * 2) * 100) / 100;
// THE CAMERA NARROWS THE COLUMN. Its base scale is 1.11 with a 0.024 breath on top, so the
// layer the type sits on is always larger than the frame — a line measured against the full
// column reaches the edge and gets cut. A real job rendered "DASHBOARD / S" and clipped the
// closing wordmark this way. Every MEASURED display run divides by this; the column itself
// stays put so the layout geometry still matches the reference.
const CAM_SAFE = 1.15;
const SAFE_W = Math.round((COL_W / CAM_SAFE) * 100) / 100;
const XFADE = 0.48;
// THE REFERENCE RHYTHM. The source does not centre a column — it pins each band to an
// absolute Y on the 1920-tall stage, which is what gives the film its editorial
// down-the-page cadence instead of a stack of vertically-centred slides. These are the
// authored positions, converted once.
const Y_KICK = U(420);   // 22% — the mono kicker
const Y_BODY = U(486);   // 25% — the supporting line under it
const Y_KAR  = U(690);   // 36% — the karaoke band
const Y_ROWS = U(940);   // 49% — enumerated rows
const Y_META = U(1240);  // 65% — the three-column meta row
const Y_SLAB = U(150);   //  8% — slabs hang from the TOP, copy sits under them

// ---- deterministic helpers ---------------------------------------------------
function seedFrom(str) { let h = 2166136261; const s = String(str || "slab"); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) || 7; }
function mulberry(seed) { let a = seed >>> 0; return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hex2 = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
const rgbHex = (a) => `#${hex2(a[0])}${hex2(a[1])}${hex2(a[2])}`;
const rgba = (h, a) => { const c = hexToRgb(h); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; };
const pad2 = (n) => String(n).padStart(2, "0");
function mixHex(a, b, t) {
  const [r1, g1, b1] = hexToRgb(a), [r2, g2, b2] = hexToRgb(b);
  return rgbHex([r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t]);
}
// HSL round-trip, used only for `partner()`.
function toHsl(h) {
  const c = hexToRgb(h).map((v) => v / 255);
  const mx = Math.max(...c), mn = Math.min(...c), d = mx - mn;
  let H = 0;
  if (d) {
    if (mx === c[0]) H = ((c[1] - c[2]) / d) % 6;
    else if (mx === c[1]) H = (c[2] - c[0]) / d + 2;
    else H = (c[0] - c[1]) / d + 4;
  }
  return [((H * 60) + 360) % 360, mx ? d / mx : 0, (mx + mn) / 2];
}
function hslHex(H, S, L) {
  H = ((H % 360) + 360) % 360;
  const C = (1 - Math.abs(2 * L - 1)) * S, X = C * (1 - Math.abs(((H / 60) % 2) - 1)), m = L - C / 2;
  let p = [0, 0, 0];
  if (H < 60) p = [C, X, 0]; else if (H < 120) p = [X, C, 0]; else if (H < 180) p = [0, C, X];
  else if (H < 240) p = [0, X, C]; else if (H < 300) p = [X, 0, C]; else p = [C, 0, X];
  return rgbHex([(p[0] + m) * 255, (p[1] + m) * 255, (p[2] + m) * 255]);
}
// The SECOND accent when a brand supplies only one: a wide hue rotation at the same energy.
// Ported from the source template, which uses it for exactly this purpose — the pack's whole
// look assumes two voices, and falling back to the pack's own blue would drop an off-brand
// hue into a branded film.
function partner(h) { const p = toHsl(h); return hslHex(p[0] + 148, Math.max(0.6, p[1]), Math.min(0.6, Math.max(0.42, p[2]))); }

const PAPER = "#F3F2F2";
const INK = "#201E1D";
const ACCENT = "#EC3013";
// ACCENT2 IS DERIVED, NOT DECLARED. The source states the contract outright: "3 values =
// one brand colour (partner derived); 4 = an explicit brand pair." The reference render
// this pack is modelled on used the THREE-value palette, so its second voice is
// partner(#EC3013) — a spring green — not the blue that ships in the four-value variant.
// The first port hardcoded the blue, which is why it read red/blue against a red/green
// reference. Deriving it here also makes ONE rule hold everywhere: a single colour always
// grows its own partner, whether it comes from the pack or from a brand.
const ACCENT2 = partner(ACCENT);

// ---- theme -------------------------------------------------------------------
// This pack ALTERNATES light and dark grounds by design, so the accent has to read against
// both. resolveBrand is asked to fit the LIGHT ground (the harder of the two on a saturated
// accent), then ensureMid clamps it into a band that clears paper AND near-black.
function slabTheme(brandSkin) {
  const fontFace = (isBundled(DISPLAY) ? fontFaceCss(DISPLAY) : "") + (isBundled(MONO) ? fontFaceCss(MONO) : "");
  let a1 = ACCENT, a2 = ACCENT2, resolvedBrand = null;
  try {
    const brand = resolveBrand(brandSkin, { ground: PAPER, isDark: false, packAccents: [ACCENT, ACCENT2] });
    if (brand.applied && brand.accent) {
      a1 = ensureMid(brand.accent);
      // DERIVE the second voice when the BRAND only gave one. resolveBrand backfills accent2
      // from packAccents, so `brand.accent2` is truthy even for a single-accent skin — taking
      // it would drop this pack's own red into, say, a blue-branded film, which is exactly
      // the off-brand hue partner() exists to avoid. Only honour accent2 when the skin
      // itself carried a second colour; otherwise rotate off the brand's own hue.
      const skinAccents = (brandSkin && Array.isArray(brandSkin.accents) ? brandSkin.accents : []).filter(Boolean);
      a2 = ensureMid(skinAccents.length >= 2 && brand.accent2 ? brand.accent2 : partner(a1));
      resolvedBrand = {
        ...(brandSkin && typeof brandSkin === "object" ? brandSkin : {}),
        accents: [a1, a2],
        emphasis: brand.emphasis, adjusted: brand.adjusted, dropped: brand.dropped,
        tier: brand.tier, applied: true,
      };
    }
  } catch { a1 = ACCENT; a2 = ACCENT2; resolvedBrand = null; }
  return {
    a1, a2, paper: PAPER, ink: INK,
    dark: mixHex(INK, "#000000", 0.34),
    displayStack: `'${DISPLAY}', 'Helvetica Neue', Arial, sans-serif`,
    monoStack: `'${MONO}', ui-monospace, monospace`,
    fontFace, resolvedBrand,
  };
}
// Keep an accent inside a luminance band that reads on BOTH grounds this pack uses. A very
// dark brand vanishes on near-black; a very light one vanishes on paper. Preserves hue.
// Push a colour into a luminance window, preserving hue. Used to grade the accents for the
// ground a given scene sits on.
function forceLum(hex, lo, hi) {
  let [rr, gg, bb] = hexToRgb(hex);
  for (let i = 0; i < 26 && relLum(rgbHex([rr, gg, bb])) < lo; i++) { rr += (255 - rr) * 0.1; gg += (255 - gg) * 0.1; bb += (255 - bb) * 0.1; }
  for (let i = 0; i < 26 && relLum(rgbHex([rr, gg, bb])) > hi; i++) { rr *= 0.92; gg *= 0.92; bb *= 0.92; }
  return rgbHex([rr, gg, bb]);
}
function ensureMid(hex, lo = 0.16, hi = 0.52) {
  let [rr, gg, bb] = hexToRgb(hex);
  for (let i = 0; i < 22 && relLum(rgbHex([rr, gg, bb])) < lo; i++) { rr += (255 - rr) * 0.12; gg += (255 - gg) * 0.12; bb += (255 - bb) * 0.12; }
  for (let i = 0; i < 22 && relLum(rgbHex([rr, gg, bb])) > hi; i++) { rr *= 0.9; gg *= 0.9; bb *= 0.9; }
  return rgbHex([rr, gg, bb]);
}
// Per-scene surface: alternating grounds, each tinted with the two accents from opposite
// corners. `dark` scenes carry the accent pools hotter, which is what keeps them from
// reading as simply "the light scene, inverted".
function surfaceOf(th, dark) {
  const base = dark ? th.dark : th.paper;
  const ink = dark ? th.paper : th.ink;
  // ACCENTS ARE RE-FITTED PER SURFACE. This is the fix for a real QA blocker: the karaoke
  // alternates its live word between the two accents, and a pair fitted once against the
  // LIGHT ground put a dark blue word on a near-black scene ("KILLS fails WCAG contrast").
  // A pack that renders two grounds has to grade its accents for whichever ground the scene
  // is actually on — lift toward white on dark, deepen toward ink on light. Hue is preserved
  // either way, so the brand still reads as itself.
  const onDark = (h) => forceLum(h, 0.34, 0.86);
  const onLight = (h) => forceLum(h, 0.06, 0.40);
  const fit = dark ? onDark : onLight;
  return {
    dark, base, ink,
    a1: fit(th.a1), a2: fit(th.a2),
    muted: rgba(ink, 0.56),
    grid: rgba(ink, dark ? 0.09 : 0.08),
    ground: `radial-gradient(95% 62% at ${dark ? "26% 14%" : "20% 10%"}, ${mixHex(base, th.a1, dark ? 0.22 : 0.14)} 0%, transparent 70%),`
      + `radial-gradient(85% 58% at ${dark ? "84% 86%" : "88% 88%"}, ${mixHex(base, th.a2, dark ? 0.19 : 0.12)} 0%, transparent 72%),`
      + base,
    slabBg: dark ? mixHex(th.dark, "#FFFFFF", 0.07) : "#FFFFFF",
  };
}

// ---- fixed copy --------------------------------------------------------------
// Neutral furniture only. The source's wordmark ("KEYFRAME"), tagline and fake product-UI
// labels are gone — see the provenance note.
const STRINGS = { slot: "SLAB" };

// ---- copy derivation ---------------------------------------------------------
function wordsOf(t) { return String(t || "").trim().split(/\s+/).filter(Boolean); }
function hasNumber(scene) {
  return [scene.emphasis, scene.subtext, scene.headline, ...(Array.isArray(scene.onScreenText) ? scene.onScreenText : [])]
    .some((x) => /\d/.test(String(x || "")));
}
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
function brandOf(title) {
  const s = String(title || "").trim();
  if (!s) return "";
  const head = s.split(/\s+[–—|·]\s+|\s+-\s+|:\s+/)[0].trim() || s;
  const pick = head.length >= 2 ? head : s;
  if (pick.length <= 22) return pick;
  return pick.slice(0, 22).replace(/\s+\S*$/, "").trim() || pick.slice(0, 22);
}

// ---- type --------------------------------------------------------------------
// Uppercase Archivo 800 — the same advance the grid-dispatch port had to correct upward
// after a real headline rendered clipped. Kept in step deliberately: both packs set the same
// face at the same weight in the same case.
// 0.70, MEASURED OFF A RENDER — not estimated. The value went 0.52 -> 0.62 after an earlier
// clip, and 0.62 STILL under-measured: a delivered film cut its closing wordmark to
// "NORTHWIN". Working backwards from those pixels — the run occupied >=86.4cqw of layout
// where 0.62 predicted 76.4 — uppercase Archivo at weight 800 advances ~0.70em per glyph.
// Both packs set the same face at the same weight in the same case, so they share the number;
// change it in both or neither.
const MEAN_ADVANCE_EM = 0.70;
const FIT_SAFETY = 0.94;
function fitLines(text, maxLineCqw, maxSizeCqw, maxLines = 3) {
  const w = wordsOf(text);
  if (!w.length) return { lines: [], size: maxSizeCqw };
  let best = null;
  for (let n = 1; n <= maxLines; n++) {
    const per = Math.ceil(w.length / n);
    const lines = [];
    for (let i = 0; i < n; i++) { const seg = w.slice(i * per, (i + 1) * per).join(" "); if (seg) lines.push(seg); }
    const longest = lines.reduce((a, b) => (b.length > a.length ? b : a), "");
    const size = Math.min(maxSizeCqw, (maxLineCqw * FIT_SAFETY) / Math.max(1, longest.length * MEAN_ADVANCE_EM));
    if (!best || size > best.size) best = { lines, size };
    if (size >= maxSizeCqw * 0.62) break;
  }
  return { lines: best.lines, size: r(best.size) };
}
function fitCap(text, lineCqw) {
  const len = longestWord(text).length;
  return len ? (lineCqw * FIT_SAFETY) / (len * MEAN_ADVANCE_EM) : Infinity;
}

// ---- KARAOKE -----------------------------------------------------------------
// THE PACK'S SIGNATURE, and the piece that needed the most rethinking.
//
// The source read author-written `say[{t, txt, hold}]` arrays — a human had timed every word
// by hand. A generated script has no such thing, so timing is DERIVED: the line is given the
// first ~62% of the scene so it always completes inside its own beat, however long the copy
// runs, and `hold` is floored so a short line still feels deliberate rather than frantic.
//
// Emitted as real DOM with per-word GSAP tweens (three states: unspoken -> live -> spoken)
// rather than a scrubbed proxy, so seeking to any frame lands the correct state.
// THE LINE REFLOWS. THAT IS THE EFFECT.
//
// The reference sets each word at `134 * s` px, where s is 1 for the live word and 0.5 for
// every other — so when the live word advances, the whole line RE-WRAPS around it. The first
// port animated `scale` instead, which is visually similar on one word and structurally
// wrong for the line: a CSS transform does not change the layout box, so every word kept its
// full-size footprint and the band rendered as scattered type with holes where the shrunken
// words used to be. Animating fontSize costs a layout per frame and is the whole look.
//
// SIZE IS DERIVED FROM THE COPY, not passed in as a constant. A generated headline can be
// three times the length of the reference's hand-written one, and a fixed 134px ran four
// lines deep — straight through the record rows below it. `maxLines` is the band's real
// budget and the size is solved against it.
function karSize(text, colCqw, maxSizeCqw, maxLines) {
  const len = String(text || "").length;
  if (!len) return maxSizeCqw;
  // Only ONE word is full size; the rest sit at half. ~0.62 of the nominal run is what the
  // line actually occupies, and FIT_SAFETY covers the inter-word gaps.
  const eff = len * MEAN_ADVANCE_EM * 0.62;
  const byRun = (colCqw * FIT_SAFETY * Math.max(1, maxLines)) / eff;
  // THE LONGEST WORD IS ITS OWN CONSTRAINT. Sizing by the total run alone let a single long
  // token overflow the column and break mid-word — a real job rendered "DASHBOARD / S" and
  // "POSTGRES://PRO / D". A word is atomic; whatever the run says, the live word at FULL
  // size must still fit one line, or the band wraps inside it.
  const byWord = (colCqw * FIT_SAFETY) / Math.max(1, longestWord(text).length * MEAN_ADVANCE_EM);
  return r(Math.max(U(28), Math.min(maxSizeCqw, byRun, byWord)));
}
function karaoke(id, th, sf, text, T, L, sizeCqw, maxLines) {
  const w = wordsOf(text).slice(0, 14);
  if (!w.length) return { html: "", s: [], words: [] };
  const span = Math.max(0.6, L * 0.62);
  const hold = Math.max(0.16, Math.min(0.4, span / w.length));
  const big = karSize(text, SAFE_W, sizeCqw, maxLines || 2);
  const small = r(big * 0.5);
  const html = `<div class="sb-kar">${w.map((x, i) =>
    `<span class="kw sb-kw"><span class="kwi ${id}-w${i} sb-kwi" style="font-size:${small}cqw;">${esc(x)}</span></span>`).join("")}</div>`;
  const s = [];
  w.forEach((x, i) => {
    const at = r(T + 0.12 + i * hold);
    // arrive LIVE: full size, accent, smeared — the line reflows around it
    s.push(`tl.fromTo(".${id}-w${i}",{opacity:0,yPercent:60,filter:"blur(${r(U(14))}px)",fontSize:"${small}cqw"},{opacity:1,yPercent:0,filter:"blur(0px)",fontSize:"${big}cqw",color:"${i % 2 ? sf.a2 : sf.a1}",duration:0.3,ease:"power3.out"},${at});`);
    // settle back so the NEXT word is the one that reads as live
    if (i < w.length - 1) {
      s.push(`tl.to(".${id}-w${i}",{fontSize:"${small}cqw",color:"${rgba(sf.ink, 0.34)}",duration:0.26,ease:"power2.out"},${r(at + hold)});`);
    }
  });
  return { html, s, words: w, hold, span, big, small };
}

// ---- assets ------------------------------------------------------------------
function screenOk(a) {
  if (!a || !a.path) return false;
  if (isLogo(a)) return false;
  if (a.type === "video" || /\.(mp4|webm|mov)($|\?)/i.test(a.path)) return false;
  if (/\.svg($|\?)/i.test(a.path)) return false;
  // ADMISSION IS SHARED (services/asset_admission). This line used to read a TRUST signal
  // as an ADMISSION test: web stock satisfies neither clause and the Creative Director is
  // told "when in doubt, use background", so a stock photo was never drawn at all — measured
  // as zero <img> from a wire of five good pictures. Trust now ORDERS the pool
  // (admission.displayRank); only an explicit reject is excluded.
  return admission.displayOk(a);
}
const ratioOf = (a) => Number(a && a.ratio) || (a && a.width && a.height ? a.width / a.height : 0);
// Same provenance rule as grid-dispatch: stock prints black and white, the user's own
// material keeps its colour, because that material IS the brand and not decoration.
const BRAND_SOURCES = new Set(["upload", "website", "website-brand", "website-asset"]);
const isOwnAsset = (a) => !!a && (BRAND_SOURCES.has(String(a.source || "")) || String(a.role || "") === "logo");
const assetFilter = (a) => (isOwnAsset(a) ? "none" : "grayscale(1) contrast(1.05)");

// The content-derived crop anchor for a cover-fit box. Lazy + defensive: the crop engine is
// optional infrastructure and this composer must render without it.
function slabCropFocus(asset, w, h, fallback) {
  try { return require("./crop_engine").focusFor(asset, w, h, fallback); }
  catch { return (asset && asset.cropFocus) || fallback; }
}

// ONE slab: a flat 3D plane carrying a screenshot. Sized from the asset's own ratio; the 3D
// rotation is STATIC CSS on an inner wrapper GSAP never animates, so the float/entrance
// tweens on the outer can never discard it (gsap_css_transform_conflict).
// COVER WHEN THE CROP IS CHEAP, CONTAIN WHEN IT IS NOT — the same rule grid-dispatch uses.
// A plane that resizes itself to each asset is a plane that lands somewhere different in
// every film, and this composition is built on two planes at KNOWN sizes on a shared
// vanishing point. So the plane is fixed and the picture fills it; only a picture whose
// shape is hopeless for the box letterboxes instead of being destroyed.
const CROP_TOLERANCE = 0.5;
function slabFit(asset, boxRatio) {
  const ar = ratioOf(asset);
  if (!ar || !boxRatio) return "cover";
  return Math.abs(Math.log(ar / boxRatio)) > CROP_TOLERANCE ? "contain" : "cover";
}
function slab(id, cls, th, sf, { asset, wCqw, hCqw, ry = -14, rx = 5, rot = 0, label, W, H, depth = 0 }) {
  const barH = label ? U(52) : 0;
  const box = { w: r(wCqw), h: r(hCqw), mediaH: r(hCqw - barH) };
  const mode = slabFit(asset, box.mediaH > 0 ? box.w / box.mediaH : 0);
  const dim = 1 - depth * 0.16;
  const media = asset && asset.path
    // CONTAIN never crops, so the anchor only matters on the cover branch (slabFit decides).
    ? `<img src="${esc(asset.path)}" alt="${esc(asset.alt || "")}" style="display:block;width:${box.w}cqw;height:${r(box.mediaH)}cqw;object-fit:${mode};object-position:${mode === "cover" ? slabCropFocus(asset, box.w, box.mediaH, "center top") : "center top"};background:${sf.slabBg};filter:${assetFilter(asset)};">`
    : `<div style="width:${box.w}cqw;height:${r(box.mediaH)}cqw;background:${sf.slabBg};"></div>`;
  return {
    w: box.w, h: box.h,
    html: `<div class="${cls}" style="width:${box.w}cqw;opacity:0;">
      <div style="transform:rotateY(${r(ry)}deg) rotateX(${r(rx)}deg) rotate(${r(rot)}deg);transform-style:preserve-3d;">
        <div class="sb-slab" style="width:${box.w}cqw;background:${sf.slabBg};border:${r(U(2))}cqw solid ${rgba(sf.ink, 0.85)};box-shadow:0 ${r(U(50) * dim)}cqw ${r(U(120) * dim)}cqw ${rgba(th.ink, 0.3 * dim)}, 0 ${r(U(6))}cqw ${r(U(18))}cqw ${rgba(th.ink, 0.16)};">
          ${label ? `<div class="sb-bar" style="height:${r(barH)}cqw;background:${th.a1};color:${relLum(th.a1) > 0.45 ? th.ink : "#FFFFFF"};"><span>${esc(label)}</span><span style="opacity:0.75;">${esc(ratioTag(asset))}</span></div>` : ""}
          <div style="overflow:hidden;">${media}</div>
        </div>
      </div>
    </div>`,
  };
}
function ratioTag(a) {
  const rr = ratioOf(a);
  return rr ? `${Math.round(rr * 100) / 100}:1` : "";
}

// ---- props (line art, drawn on) ----------------------------------------------
// Behind the content, one per scene, chosen by seed. Pure SVG with a stroke-dash sweep — no
// raster, no canvas, and it costs one tween.
function prop(id, kind, sf, th) {
  const st = rgba(sf.ink, sf.dark ? 0.46 : 0.3);
  const D = 6400;
  const common = `fill="none" stroke="${st}" stroke-width="2.5" stroke-dasharray="${D}" stroke-dashoffset="${D}"`;
  if (kind === "rings") {
    return `<svg class="sb-prop ${id}-prop" viewBox="0 0 1200 1200" style="left:${r(U(-60))}cqw;top:${r(U(300))}cqw;width:${r(U(1200))}cqw;height:${r(U(1200))}cqw;">
      ${[560, 440, 320, 200].map((rr, i) => `<circle cx="600" cy="600" r="${rr}" ${common} stroke="${i === 1 ? rgba(th.a1, 0.55) : i === 2 ? rgba(th.a2, 0.5) : st}" stroke-width="${i === 1 ? 4 : 2.5}" class="${id}-pd"/>`).join("")}
    </svg>`;
  }
  if (kind === "burst") {
    return `<svg class="sb-prop ${id}-prop" viewBox="0 0 1200 1200" style="left:${r(U(-60))}cqw;top:${r(U(320))}cqw;width:${r(U(1200))}cqw;height:${r(U(1200))}cqw;">
      ${Array.from({ length: 24 }).map((_, i) => {
        const a = (i / 24) * Math.PI * 2, r0 = 220, r1 = 220 + 340 * (i % 3 === 0 ? 1 : 0.6);
        return `<line x1="${r(600 + Math.cos(a) * r0)}" y1="${r(600 + Math.sin(a) * r0)}" x2="${r(600 + Math.cos(a) * r1)}" y2="${r(600 + Math.sin(a) * r1)}" stroke="${i % 6 === 0 ? rgba(th.a1, 0.6) : i % 6 === 3 ? rgba(th.a2, 0.55) : st}" stroke-width="3" stroke-dasharray="${D}" stroke-dashoffset="${D}" class="${id}-pd"/>`;
      }).join("")}
    </svg>`;
  }
  return `<svg class="sb-prop ${id}-prop" viewBox="0 0 1400 1400" style="left:${r(U(-180))}cqw;top:${r(U(240))}cqw;width:${r(U(1400))}cqw;height:${r(U(1400))}cqw;">
    <circle cx="700" cy="700" r="640" ${common} class="${id}-pd"/>
    <circle cx="700" cy="700" r="560" ${common} class="${id}-pd"/>
    ${Array.from({ length: 12 }).map((_, i) => {
      const a = (i / 12) * Math.PI * 2;
      return `<line x1="${r(700 + Math.cos(a) * 560)}" y1="${r(700 + Math.sin(a) * 560)}" x2="${r(700 + Math.cos(a) * 500)}" y2="${r(700 + Math.sin(a) * 500)}" stroke="${st}" stroke-width="6" stroke-dasharray="${D}" stroke-dashoffset="${D}" class="${id}-pd"/>`;
    }).join("")}
  </svg>`;
}
const PROP_KINDS = ["clock", "rings", "burst"];

function reps(t, c) { return Math.max(0, Math.floor((Number(t) || 0) / (c || 1)) - 1); }

// ---- transition library ------------------------------------------------------
// A DEPTH and DIMENSION vocabulary — flips, dives, folds, shuffles — plus the source's
// signature cut bar. Deliberately disjoint from grid-dispatch's flat shutters and rules.
const TRANSITIONS = [
  { name: "cut-bar", build: ({ o, n, t, x, id, track, th }) => ({
      html: `<div class="clip" id="${id}" data-start="${r(t)}" data-duration="${r(x * 1.3)}" data-track-index="${track}" data-layout-allow-occlusion style="pointer-events:none;overflow:hidden;">
        <div class="${id}-b" style="position:absolute;inset:0;background:linear-gradient(96deg,${th.a1},${th.a2});"></div></div>`,
      js: [
        `tl.fromTo(".${id}-b",{xPercent:-100},{xPercent:100,duration:${r(x * 1.15)},ease:"power2.inOut"},${r(t)});`,
        `tl.set("${o}",{opacity:0},${r(t + x * 0.55)});`,
        `tl.set("${n}",{opacity:1},${r(t + x * 0.55)});`,
      ] }) },
  { name: "slab-flip", build: ({ o, n, t, x }) => ({ js: [
      `tl.to("${o}",{rotationY:-82,scale:0.8,opacity:0,duration:${r(x)},ease:"power3.in"},${r(t)});`,
      `tl.fromTo("${n}",{rotationY:78,scale:0.82,opacity:0},{rotationY:0,scale:1,opacity:1,duration:${r(x * 1.2)},ease:"power3.out"},${r(t)});`,
    ] }) },
  { name: "depth-dive", build: ({ o, n, t, x }) => ({ js: [
      `tl.to("${o}",{scale:2.2,opacity:0,filter:"blur(${r(U(16))}px)",duration:${r(x)},ease:"power3.in"},${r(t)});`,
      `tl.fromTo("${n}",{scale:0.5,opacity:0,filter:"blur(${r(U(20))}px)"},{scale:1,opacity:1,filter:"blur(0px)",duration:${r(x * 1.2)},ease:"expo.out"},${r(t)});`,
    ] }) },
  { name: "fold-away", build: ({ o, n, t, x }) => ({ js: [
      `tl.to("${o}",{rotationX:74,yPercent:-24,opacity:0,duration:${r(x)},ease:"power3.in",transformOrigin:"50% 0%"},${r(t)});`,
      `tl.fromTo("${n}",{rotationX:-68,yPercent:22,opacity:0},{rotationX:0,yPercent:0,opacity:1,duration:${r(x * 1.2)},ease:"power3.out",transformOrigin:"50% 100%"},${r(t)});`,
    ] }) },
  { name: "whip-pan", build: ({ o, n, t, x }) => ({ js: [
      `tl.to("${o}",{xPercent:-58,rotation:-3,opacity:0,filter:"blur(${r(U(18))}px)",duration:${r(x * 0.9)},ease:"power3.in"},${r(t)});`,
      `tl.fromTo("${n}",{xPercent:62,rotation:3,opacity:0,filter:"blur(${r(U(20))}px)"},{xPercent:0,rotation:0,opacity:1,filter:"blur(0px)",duration:${r(x * 1.15)},ease:"expo.out"},${r(t + x * 0.12)});`,
    ] }) },
  { name: "stack-shuffle", build: ({ o, n, t, x }) => ({ js: [
      `tl.to("${o}",{xPercent:-16,yPercent:-10,rotation:-5,scale:0.86,opacity:0,duration:${r(x)},ease:"power3.in"},${r(t)});`,
      `tl.fromTo("${n}",{xPercent:18,yPercent:12,rotation:5,scale:0.88,opacity:0},{xPercent:0,yPercent:0,rotation:0,scale:1,opacity:1,duration:${r(x * 1.2)},ease:"back.out(1.3)"},${r(t)});`,
    ] }) },
  { name: "swing-out", build: ({ o, n, t, x }) => ({ js: [
      `tl.to("${o}",{rotation:9,xPercent:34,yPercent:8,opacity:0,duration:${r(x)},ease:"power3.in",transformOrigin:"0% 100%"},${r(t)});`,
      `tl.fromTo("${n}",{rotation:-8,xPercent:-30,yPercent:-6,opacity:0},{rotation:0,xPercent:0,yPercent:0,opacity:1,duration:${r(x * 1.2)},ease:"power3.out",transformOrigin:"100% 0%"},${r(t)});`,
    ] }) },
  { name: "shutter-3d", build: ({ o, n, t, x, id, track, th }) => ({
      html: `<div class="clip" id="${id}" data-start="${r(t)}" data-duration="${r(x * 1.25)}" data-track-index="${track}" data-layout-allow-occlusion style="pointer-events:none;">
        ${[0, 1, 2, 3].map((k) => `<div class="${id}-s" style="position:absolute;left:0;top:${r(k * 25)}%;width:100%;height:${r(25.4)}%;background:${k % 2 ? th.a2 : th.a1};transform:scaleX(0);transform-origin:${k % 2 ? "right" : "left"} center;"></div>`).join("")}</div>`,
      js: [
        `tl.to(".${id}-s",{scaleX:1,duration:${r(x * 0.42)},ease:"power2.inOut",stagger:0.05},${r(t)});`,
        `tl.to(".${id}-s",{scaleX:0,duration:${r(x * 0.42)},ease:"power2.inOut",stagger:0.05},${r(t + x * 0.66)});`,
        `tl.set("${o}",{opacity:0},${r(t + x * 0.6)});`,
        `tl.set("${n}",{opacity:1},${r(t + x * 0.6)});`,
      ] }) },
];
const AFFINITY = {
  close: ["depth-dive", "cut-bar", "shutter-3d"],
  panel: ["slab-flip", "stack-shuffle", "swing-out"],
  gallery: ["depth-dive", "slab-flip", "fold-away"],
  figure: ["cut-bar", "shutter-3d", "whip-pan"],
};
function dealTransitions(archetypes, seed) {
  const rnd = mulberry(seed);
  const out = [], recent = [];
  for (let i = 0; i < Math.max(0, archetypes.length - 1); i++) {
    const want = AFFINITY[archetypes[i + 1]] || [];
    const fresh = (list) => list.filter((tr) => !recent.includes(tr.name));
    let pool = fresh(TRANSITIONS.filter((tr) => want.includes(tr.name)));
    if (!pool.length) pool = fresh(TRANSITIONS);
    if (!pool.length) pool = TRANSITIONS.slice();
    const pick = pool[Math.floor(rnd() * pool.length) % pool.length];
    out.push(pick); recent.push(pick.name);
    if (recent.length > 3) recent.shift();
  }
  return out;
}

// ---- scene shell -------------------------------------------------------------
// Four layers, one job each: .clip (visibility) · .sb-stage (transition transform) ·
// .sb-cam (the continuous camera) · content. The furniture — grid, prop, wordmark block,
// progress bar — sits OUTSIDE the camera layer where it should not swim with the pan.
function open(ctx, inner) {
  const { id, th, sf } = ctx;
  const dur = r(Math.max(0.1, ctx.clipDur));
  const grid = [1, 2, 3, 4, 5].map((i) => `<div style="position:absolute;left:${r((100 / 6) * i)}%;top:0;bottom:0;width:1px;background:${sf.grid};"></div>`).join("")
    + [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => `<div style="position:absolute;top:${r((100 / 11) * i)}%;left:0;right:0;height:1px;background:${sf.grid};"></div>`).join("");
  const glow = ctx.glow > 0
    // THE GLOW POOLS, IT DOES NOT FLOOD. The reference's accent bloom sits under the type on
    // a ground that stays dark; at the ported alphas it washed the whole close to a pale
    // field and left paper-white type on it with almost no contrast — on the last frame of
    // every film. Halved, and pulled in from `closest-side` so it stays a pool of light.
    ? `<div class="sb-glow" style="background:radial-gradient(closest-side, ${rgba(sf.a1, 0.26 * ctx.glow)}, transparent 62%),radial-gradient(closest-side at 62% 58%, ${rgba(sf.a2, 0.2 * ctx.glow)}, transparent 60%);"></div>`
    : "";
  // THE SPOKEN WORD DOES NOT SWIM. The reference renders <Karaoke> OUTSIDE the camera layer,
  // so the stage drifts behind a line that stays nailed to the frame. Putting it inside is
  // both wrong to the reference and a legibility bug: the camera's base scale is 1.11 with a
  // 30px pan, which drags a margin-width column past the edge on every breath.
  return `<div class="clip sb-scene" id="${id}" data-start="${r(ctx.T)}" data-duration="${dur}" data-track-index="${ctx.track}"${ctx.noBackdrop ? " data-no-backdrop" : ""} style="opacity:0;background:${sf.ground};">
    <div class="sb-stage ${id}-stage">
      <div class="sb-cam ${id}-cam">
        ${grid}
        ${ctx.prop}
        ${glow}
        ${inner}
      </div>
      ${ctx.karHtml || ""}
      ${ctx.cut ? `<div class="sb-cut ${id}-cut" style="background:linear-gradient(${ctx.dir > 0 ? "96deg" : "276deg"},${th.a1},${th.a2});"></div>` : ""}
      <div class="sb-mark">
        <div class="${id}-dia" style="width:${r(U(14))}cqw;height:${r(U(14))}cqw;background:${sf.a1};"></div>
        <div style="font-weight:800;font-size:${r(U(22))}cqw;letter-spacing:0.3em;color:${sf.ink};">${esc(ctx.brand)}</div>
      </div>
    </div>
  </div>`;
}


// ---- ghost type --------------------------------------------------------------
// The live word echoed as huge outlined letters, tiled and drifting. Behind everything.
function ghost(id, sf, th, word) {
  if (!word) return "";
  const gc = rgba(th.a2, sf.dark ? 0.2 : 0.15);
  return `<div class="sb-ghost">${[0, 1, 2].map((i) =>
    `<div class="${id}-gh" style="left:${r(U(-60 + i * 40))}cqw;top:${r(U(120 + i * 620))}cqw;-webkit-text-stroke:${r(U(2))}cqw ${gc};">${esc(word)}</div>`).join("")}</div>`;
}

// ---- the three-column meta row ----------------------------------------------
// A SIGNATURE ELEMENT OF THIS PACK that the first port omitted entirely. The reference sets
// a small letterspaced accent LABEL over a bold ink VALUE, three across, pinned near the
// lower third — it is what makes the frames read as a spec sheet in motion rather than a
// headline with a picture under it.
//
// The reference's own labels were film facts about the generator ("FROM / ONE PROMPT").
// Those market the wrong product, so the label is a sequence index — language-free and never
// invented — while the VALUE carries the script's actual line.
function metaRow(id, th, sf, items, yCqw) {
  // A meta VALUE is a figure, not a sentence. The reference's are two or three words; a full
  // bullet wraps to three lines and stops reading as a spec column at all.
  items = items.map((x) => String(x || "").trim()).filter((x) => x && x.length <= 26);
  if (!items.length) return "";
  return `<div class="sb-meta" style="top:${r(yCqw || Y_META)}cqw;left:${COL_INSET}cqw;right:${COL_INSET}cqw;">${items.slice(0, 3).map((v, i) =>
    `<div class="${id}-mt" style="opacity:0;flex:1 1 0;min-width:0;">
       <div class="sb-mlab" style="color:${i === 1 ? sf.a2 : sf.a1};">${pad2(i + 1)}</div>
       <div class="sb-mval" style="color:${sf.ink};">${esc(String(v).toUpperCase())}</div>
     </div>`).join("")}</div>`;
}
const metaTween = (id, T) => `tl.fromTo(".${id}-mt",{opacity:0,y:"2cqw"},{opacity:1,y:0,duration:0.46,ease:"power3.out",stagger:0.12},${r(T + 0.9)});`;

// A row splits into a LABEL and a right-aligned VALUE when the line carries a measurable
// tail ("Deploy in 8 seconds" -> "Deploy in" / "8 seconds"). The reference's rows are
// label-plus-figure, and that column is what makes them read as records rather than bullets.
// No tail, no value — the row simply renders as a label, never an invented figure.
function splitRow(text) {
  const s = String(text || "").trim();
  const m = s.match(/^(.+?)[\s:—–-]+((?:[^\s]*\d[^\s]*)(?:\s+[A-Za-z%]+)?)\s*$/);
  if (m && m[1] && m[1].split(/\s+/).length >= 1) return [m[1].trim(), m[2].trim()];
  return [s, ""];
}

//
// EIGHT NAMED SCENES, IN ORDER — a scene-for-scene port of the reference's SCENE_MAP
// (`templete-design/2 new templetes/slab-scenes.jsx`), matched against its own render at
// `screenshot/Keyframe Slab.mp4`.
//
//   1 HOOK        light · ghost · burst   kicker + line high, karaoke at 36%, meta row
//   2 PROBLEM     DARK  · ghost · clock   karaoke lifted to 27%, struck record rows below
//   3 PROMISE     light · ghost · rings   karaoke ALONE — the one purely typographic beat
//   4 BRAND       DARK  · glow  · rings   the wordmark boxed and stamped, a mono line under
//   5 TOUR READ   light · slabs           a blurred wide slab behind a sharp tall one
//   6 TOUR SCRIPT light · slabs           the pair mirrored, second accent on the bar
//   7 TOUR RENDER light · slabs           the pair again, drifting the other way
//   8 CLOSE       DARK  · glow            wordmark, sub-head, gradient action, address
//
// WHAT THE FIRST PORT GOT WRONG, AND WHY IT LOOKED LIKE A DIFFERENT FILM
//   • THE GROUND PHASE IS PER ROLE, NOT ALTERNATING. `i % 2` cannot produce the reference's
//     light-dark-light-dark-light-light-light-dark: the three tour scenes run light back to
//     back so the slabs read as one continuous walkthrough. Alternating split them up.
//   • THE CAMERA NEVER SETTLES. The reference runs pan, breath and rotation off the GLOBAL
//     clock — `1.11 + 0.024·sin(T·0.34)`, `sin(T·0.23)·30` — so the move carries straight
//     through every cut and the film reads as one long take. A per-scene push that eases to
//     rest (which is grid-dispatch's idea, and right there) makes eight separate shots.
//   • ONE CUT, NOT EIGHT. The reference's only transition is a brand bar crossing the frame
//     in 0.26s. An eight-move library is a different film's vocabulary.
//   • The base camera scale of 1.11 means THE STAGE IS ALWAYS ZOOMED — see the SAFE AREA
//     note on `.sb-col`. Every measured column must clear the camera's excursion.

// Per-role stage settings, quoted from the reference's own <Shell> props.
const ROLE = {
  hook:       { dark: false, ghost: true,  glow: 0,    prop: "burst", capY: U(690) },
  problem:    { dark: true,  ghost: true,  glow: 0,    prop: "clock", capY: U(520) },
  promise:    { dark: false, ghost: true,  glow: 0,    prop: "rings", capY: U(690) },
  brand:      { dark: true,  ghost: false, glow: 0.85, prop: "rings", capY: U(690) },
  tourRead:   { dark: false, ghost: false, glow: 0,    prop: null,    capY: U(1160) },
  tourScript: { dark: false, ghost: false, glow: 0,    prop: null,    capY: U(1160) },
  tourRender: { dark: false, ghost: false, glow: 0,    prop: null,    capY: U(1160) },
  close:      { dark: true,  ghost: false, glow: 0.9,  prop: null,    capY: 0 },
};

// ---- scene builders ((scene, ctx, assets) -> {html, s}) ----------------------

// HOOK — a mono kicker and a supporting line high in the frame, the karaoke band at 36%, a
// frame-filling prop drawing itself behind, and the three-column meta row at 65%.
function sHook(scene, ctx, sceneAssets) {
  const { id, th, sf, T, L } = ctx;
  const kick = String(scene.emphasis || ctx.brand || "").toUpperCase().slice(0, 34);
  const body = supportLine(scene, [scene.headline || ""]) || String(scene.subtext || "").trim();
  const kar = karaoke(id, th, sf, scene.headline || scene.title || ctx.brand || "", T, L, U(120), 2);
  ctx.karHtml = `<div class="sb-karwrap" style="top:${r(ctx.capY)}cqw;color:${sf.ink};">${kar.html}</div>`;
  const html = open(ctx, `
    ${ctx.ghostHtml(kar.words[0] || "")}
    ${kick ? `<div class="sb-kick ${id}-kick" style="position:absolute;left:${COL_INSET}cqw;top:${r(U(420))}cqw;color:${sf.a1};opacity:0;">${esc(kick)}</div>` : ""}
    ${body ? `<div class="sb-body ${id}-body" style="position:absolute;left:${COL_INSET}cqw;top:${r(U(478))}cqw;width:${r(Math.min(COL_W, U(760)))}cqw;color:${rgba(sf.ink, 0.7)};opacity:0;">${esc(body)}</div>` : ""}
    ${metaRow(id, th, sf, bullets(scene, 3), U(1520))}`);
  const s = [
    `tl.set("#${id}",{opacity:1},${r(T)});`,
    kick ? `tl.fromTo(".${id}-kick",{opacity:0,y:"1.8cqw"},{opacity:1,y:0,duration:0.5,ease:"power3.out"},${r(T)});` : "",
    body ? `tl.fromTo(".${id}-body",{opacity:0,y:"1.4cqw"},{opacity:1,y:0,duration:0.5,ease:"power3.out"},${r(T + 0.4)});` : "",
    ...kar.s,
    metaTween(id, T),
  ].filter(Boolean);
  return { html, s };
}

// PROBLEM — the dark beat. The karaoke lifts to 27% so the lower half can carry a record of
// the script's own points, each a numbered row with a right-aligned figure and a rule under.
function sProblem(scene, ctx) {
  const { id, th, sf, T, L } = ctx;
  const kar = karaoke(id, th, sf, scene.headline || scene.title || "", T, L, U(120), 2);
  ctx.karHtml = `<div class="sb-karwrap" style="top:${r(ctx.capY)}cqw;color:${sf.ink};">${kar.html}</div>`;
  const rows = bullets(scene, 3).map(splitRow);
  const html = open(ctx, `
    ${ctx.ghostHtml(kar.words[0] || "")}
    ${rows.map(([lab, val], j) => `<div class="sb-row ${id}-row" style="position:absolute;left:${COL_INSET}cqw;right:${COL_INSET}cqw;top:${r(U(940) + j * U(104))}cqw;border-bottom-color:${rgba(sf.ink, 0.25)};opacity:0;">
      <span class="sb-rnum" style="color:${sf.a1};">${pad2(j + 1)}</span>
      <span class="sb-rlab" style="color:${sf.ink};">${esc(String(lab).toUpperCase())}</span>
      ${val ? `<span class="sb-rval" style="color:${rgba(sf.ink, 0.55)};">${esc(String(val).toUpperCase())}</span>` : ""}
    </div>`).join("")}`);
  const s = [
    `tl.set("#${id}",{opacity:1},${r(T)});`,
    ...kar.s,
    rows.length ? `tl.fromTo(".${id}-row",{opacity:0,x:"3.7cqw"},{opacity:1,x:0,duration:0.5,ease:"power3.out",stagger:0.16},${r(T + 0.6)});` : "",
  ].filter(Boolean);
  return { html, s };
}

// PROMISE — the reference's boldest choice: a whole beat carrying nothing but the spoken
// line and a ring prop drawing behind it. Resisting the urge to fill this frame is the
// point; it is the breath between the problem and the brand.
function sPromise(scene, ctx) {
  const { id, th, sf, T, L } = ctx;
  const kar = karaoke(id, th, sf, scene.headline || scene.title || "", T, L, U(134), 4);
  ctx.karHtml = `<div class="sb-karwrap" style="top:${r(ctx.capY)}cqw;color:${sf.ink};">${kar.html}</div>`;
  const html = open(ctx, `
    ${ctx.ghostHtml(kar.words[0] || "")}
`);
  return { html, s: [`tl.set("#${id}",{opacity:1},${r(T)});`, ...kar.s] };
}

// BRAND — the wordmark stamped inside a heavy outlined box on the dark ground, with the
// accent pools blooming behind it, and one mono line underneath.
function sBrand(scene, ctx, logo) {
  const { id, th, sf, T, L } = ctx;
  const kar = karaoke(id, th, sf, scene.headline || scene.title || "", T, L, U(110), 2);
  ctx.karHtml = `<div class="sb-karwrap" style="top:${r(ctx.capY)}cqw;color:${sf.ink};">${kar.html}</div>`;
  const word = String(ctx.brand || scene.title || "").slice(0, 22);
  const wSize = r(Math.min(U(116), ((COL_W - U(108)) * FIT_SAFETY) / Math.max(1, word.length * MEAN_ADVANCE_EM)));
  const line = String(scene.emphasis || scene.subtext || "").toUpperCase().slice(0, 44);
  const mark = logo && logo.path
    ? `<div class="${id}-logo" style="position:absolute;left:${COL_INSET}cqw;top:${r(U(880))}cqw;opacity:0;">${logoMark(logo, { sizeCqw: 14, ground: sf.base, glow: null, escape: esc })}</div>`
    : "";
  const html = open(ctx, `
    ${mark}
    <div class="${id}-box" style="position:absolute;left:${COL_INSET}cqw;top:${r(U(1020))}cqw;padding:${r(U(34))}cqw ${r(U(54))}cqw;border:${r(U(3))}cqw solid ${rgba(sf.ink, 0.9)};background:${rgba(th.ink, 0.35)};display:inline-block;">
      <div style="font-weight:800;font-size:${r(wSize)}cqw;line-height:1;letter-spacing:-0.03em;text-transform:uppercase;color:${sf.ink};white-space:nowrap;">${esc(word)}</div>
    </div>
    ${line ? `<div class="sb-kick ${id}-line" style="position:absolute;left:${COL_INSET}cqw;top:${r(U(1250))}cqw;color:${rgba(sf.ink, 0.7)};font-size:${r(U(26))}cqw;opacity:0;">${esc(line)}</div>` : ""}`);
  const s = [
    `tl.set("#${id}",{opacity:1},${r(T)});`,
    ...kar.s,
    mark ? `tl.fromTo(".${id}-logo",{opacity:0,y:"1.6cqw"},{opacity:1,y:0,duration:0.5,ease:"power3.out"},${r(T + 0.5)});` : "",
    `tl.fromTo(".${id}-box",{scale:0,opacity:0},{scale:1,opacity:1,duration:0.7,ease:"back.out(2.2)",transformOrigin:"left center"},${r(T + 0.15)});`,
    line ? `tl.fromTo(".${id}-line",{opacity:0},{opacity:1,duration:0.5,ease:"power3.out"},${r(T + 0.85)});` : "",
  ].filter(Boolean);
  return { html, s };
}

// TOUR — the pack's signature frame, and the reason it is called Slab. Two planes on a shared
// vanishing point: a WIDE one set back, softened and slightly out of focus, and a TALL one in
// front, sharp, wearing an accent bar. Both drift for the whole beat, so the frame is a slow
// dolly past two screens rather than a slide with two pictures on it.
//
// `variant` mirrors the pair left/right and swaps which accent the front bar wears, so the
// three tour scenes read as one walkthrough seen from three positions — the reference's
// TourRead / TourScript / TourRender in order.
function sTour(scene, ctx, sceneAssets, variant) {
  const { id, th, sf, T, L, W, H } = ctx;
  const shots = sceneAssets || [];
  const kar = karaoke(id, th, sf, scene.headline || scene.title || "", T, L, U(96), 2);
  ctx.karHtml = `<div class="sb-karwrap" style="top:${r(ctx.capY)}cqw;color:${sf.ink};">${kar.html}</div>`;
  const flip = variant === 1 ? -1 : 1;
  const backLeft = shots.length < 2 ? U(100) : (variant === 1 ? U(430) : U(40));
  const frontLeft = variant === 1 ? U(70) : U(500);

  // The back plane is wide (3:2 / 16:9), the front is tall (9:16) — quoted from the source.
  // The reference's own plane sizes: a 700x470 wide one set back, a 470x790 tall one in
  // front. Alone, the wide plane grows to 880x600 and moves to the middle of the stage —
  // one plane parked in a corner reads as the edge of a composition, not the composition.
  const solo = shots.length < 2;
  const back = slab(`${id}-b`, `${id}-sb ${id}-back`, th, sf, {
    asset: shots[0] || null, wCqw: solo ? U(880) : U(700), hCqw: solo ? U(600) : U(470),
    ry: (solo ? -13 : -20) * flip, rx: solo ? 6 : 8, rot: (solo ? -2 : -3) * flip,
    label: `${STRINGS.slot} ${pad2(ctx.i + 1)}A`, W, H, depth: solo ? 0.4 : 1.4,
  });
  const front = shots[1]
    ? slab(`${id}-f`, `${id}-sb ${id}-front`, th, sf, {
        asset: shots[1], wCqw: U(470), hCqw: U(790),
        ry: -16 * flip, rx: 5, rot: 2 * flip, label: `${STRINGS.slot} ${pad2(ctx.i + 1)}B`, W, H, depth: 0.5,
      })
    : null;

  const html = open(ctx, `
    <div class="sb-3d">
      <div class="${id}-back" style="position:absolute;left:${r(backLeft)}cqw;top:${r(U(150))}cqw;">${back.html}</div>
      ${front ? `<div class="${id}-front" style="position:absolute;left:${r(frontLeft)}cqw;top:${r(U(230))}cqw;">${front.html}</div>` : ""}
    </div>
    ${metaRow(id, th, sf, bullets(scene, 3), U(1520))}`);

  // THE DRIFT IS THE SHOT. One long linear move per plane, opposed so the parallax reads.
  const drift = Math.max(1.2, L - 0.2);
  const s = [
    `tl.set("#${id}",{opacity:1},${r(T)});`,
    `tl.fromTo(".${id}-back",{opacity:0,y:"4cqw"},{opacity:${solo ? 1 : 0.85},y:0,duration:0.6,ease:"power3.out"},${r(T)});`,
    `tl.fromTo(".${id}-back",{x:0},{x:"${r((solo ? -5.6 : -17.6) * flip)}cqw",duration:${r(drift)},ease:"none"},${r(T + 0.1)});`,
    front ? `tl.fromTo(".${id}-front",{opacity:0,y:"5cqw"},{opacity:1,y:0,duration:0.62,ease:"power3.out"},${r(T + 0.18)});` : "",
    front ? `tl.fromTo(".${id}-front",{x:0},{x:"${r(7.4 * flip)}cqw",duration:${r(drift)},ease:"none"},${r(T + 0.28)});` : "",
    ...kar.s,
    metaTween(id, T),
  ].filter(Boolean);
  return { html, s };
}

// CLOSE — the sign-off. No karaoke here: the reference's closing beat carries no spoken line
// under the wordmark, and running one would collide with 148px display type.
function sClose(scene, ctx, logo) {
  const { id, th, sf, T, L } = ctx;
  const word = String(ctx.brand || scene.title || "").slice(0, 22);
  const wSize = r(Math.min(U(148), (COL_W * FIT_SAFETY) / Math.max(1, word.length * MEAN_ADVANCE_EM)));
  const sub = String(scene.subtext || "").trim();
  const url = domainOf(scene.subtext) || domainOf(scene.emphasis) || domainOf(ctx.title);
  const subNoUrl = url ? wordsOf(sub).filter((w) => !w.toLowerCase().replace(/^https?:\/\//, "").replace(/[.,;:]+$/, "").startsWith(url.toLowerCase())).join(" ").trim() : sub;
  const action = String(scene.emphasis || "").trim().slice(0, 18);
  const onGrad = relLum(th.a1) > 0.45 ? th.ink : "#FFFFFF";
  const mark = logo && logo.path
    ? `<div class="${id}-logo" style="position:absolute;left:${COL_INSET}cqw;top:${r(U(520))}cqw;opacity:0;">${logoMark(logo, { sizeCqw: 15, ground: sf.base, glow: null, escape: esc })}</div>`
    : "";
  const html = open(ctx, `
    ${mark}
    <div style="position:absolute;left:${COL_INSET}cqw;right:${COL_INSET}cqw;top:${r(U(700))}cqw;">
      <div class="kw sb-mask" style="height:${r(wSize * 1.06)}cqw;">
        <div class="kwi ${id}-w" style="font-weight:800;font-size:${r(wSize)}cqw;line-height:${r(wSize * 1.06)}cqw;letter-spacing:-0.035em;text-transform:uppercase;color:${sf.ink};white-space:nowrap;">${esc(word)}</div>
      </div>
      ${subNoUrl ? `<div class="${id}-sub" style="margin-top:${r(U(30))}cqw;font-weight:400;font-size:${r(U(40))}cqw;line-height:1.3;color:${rgba(sf.ink, 0.85)};max-width:${r(Math.min(COL_W, U(800)))}cqw;opacity:0;">${esc(subNoUrl)}</div>` : ""}
    </div>
    ${action ? `
    <div class="${id}-btn" style="position:absolute;left:${COL_INSET}cqw;top:${r(U(1140))}cqw;width:${r(Math.min(COL_W, U(560)))}cqw;height:${r(U(124))}cqw;background:linear-gradient(96deg,${sf.a1},${sf.a2});transform:scaleX(0);transform-origin:left center;"></div>
    <div class="${id}-btxt" style="position:absolute;left:${COL_INSET}cqw;top:${r(U(1140))}cqw;width:${r(Math.min(COL_W, U(560)))}cqw;height:${r(U(124))}cqw;overflow:hidden;opacity:0;">
      <div style="position:absolute;left:${r(U(30))}cqw;top:${r(U(40))}cqw;font-weight:800;font-size:${r(Math.min(U(42), (U(360) * FIT_SAFETY) / Math.max(1, action.length * MEAN_ADVANCE_EM)))}cqw;letter-spacing:-0.02em;text-transform:uppercase;color:${onGrad};">${esc(action)}</div>
      <div class="${id}-arr" style="position:absolute;left:${r(U(400))}cqw;top:${r(U(48))}cqw;width:${r(U(64))}cqw;height:${r(U(6))}cqw;background:${onGrad};"></div>
      <div class="${id}-arr" style="position:absolute;left:${r(U(436))}cqw;top:${r(U(32))}cqw;width:${r(U(38))}cqw;height:${r(U(38))}cqw;border-top:${r(U(6))}cqw solid ${onGrad};border-right:${r(U(6))}cqw solid ${onGrad};transform:rotate(45deg);"></div>
    </div>` : ""}
    ${url ? `<div class="${id}-url" style="position:absolute;left:${COL_INSET}cqw;top:${r(U(1330))}cqw;font-weight:800;font-size:${r(Math.min(U(46), (COL_W * FIT_SAFETY) / Math.max(1, url.length * MEAN_ADVANCE_EM)))}cqw;letter-spacing:-0.02em;color:${sf.ink};opacity:0;">${esc(url)}</div>` : ""}`);
  const s = [
    `tl.set("#${id}",{opacity:1},${r(T)});`,
    mark ? `tl.fromTo(".${id}-logo",{opacity:0,y:"1.6cqw"},{opacity:1,y:0,duration:0.5,ease:"power3.out"},${r(T + 0.2)});` : "",
    `tl.fromTo(".${id}-w",{yPercent:110},{yPercent:0,duration:0.6,ease:"power3.out"},${r(T + 0.1)});`,
    subNoUrl ? `tl.fromTo(".${id}-sub",{opacity:0,y:"1.4cqw"},{opacity:1,y:0,duration:0.5,ease:"power3.out"},${r(T + 0.45)});` : "",
    action ? `tl.fromTo(".${id}-btn",{scaleX:0},{scaleX:1,duration:0.5,ease:"power3.inOut",transformOrigin:"left center"},${r(T + 0.55)});` : "",
    action ? `tl.fromTo(".${id}-btxt",{opacity:0},{opacity:1,duration:0.35,ease:"none"},${r(T + 0.8)});` : "",
    action ? `tl.fromTo(".${id}-arr",{x:0,opacity:1},{x:"${r(U(34))}cqw",opacity:0.3,duration:1.5,ease:"none",repeat:${reps(Math.max(0, L - 1.0), 1.5)}},${r(T + 1.0)});` : "",
    url ? `tl.fromTo(".${id}-url",{opacity:0,y:"1.2cqw"},{opacity:1,y:0,duration:0.45,ease:"power3.out"},${r(T + 1.0)});` : "",
  ].filter(Boolean);
  return { html, s };
}

// ---- the continuous camera ---------------------------------------------------
// THE PACK'S DEFINING MOVE, and the one the first port replaced with the wrong idea.
//
// The reference drives pan, breath and roll from the GLOBAL clock:
//     scale = 1.11 + 0.024·sin(T·0.34) + whip·0.07
//     x     = sin(T·0.23)·30 + whip·64·dir
//     y     = cos(T·0.18)·22 − whip·40
//     rot   = sin(T·0.13)·0.5 + whip·0.9·dir
// so the move carries straight through every cut — the film is one moving stage, not eight
// pages. On top of that each cut gets a short whip (a cubic decay over 0.34s) that resolves,
// the way a camera settles after an operator reframes. Direction alternates by scene parity,
// which is also what flips the transform origin.
//
// GSAP has no sine, so the curve is SAMPLED into a chain of linear segments — fine at 0.4s
// steps for a 0.34 rad/s oscillation, and finer across the whip where the curve is steep.
// Each segment starts exactly where the last ended, so no two tweens on this element ever
// overlap (overlapping_gsap_tweens).
function cameraTweens(ctx) {
  const { id, T, L, i } = ctx;
  const dir = i % 2 ? -1 : 1;
  const org = dir > 0 ? "38% 44%" : "62% 52%";
  const at = (lt) => {
    const g = T + lt;
    const whip = Math.pow(1 - Math.min(1, lt / 0.34), 3);
    return {
      s: 1.11 + 0.024 * Math.sin(g * 0.34) + whip * 0.07,
      x: U(Math.sin(g * 0.23) * 30 + whip * 64 * dir),
      y: U(Math.cos(g * 0.18) * 22 - whip * 40),
      rot: Math.sin(g * 0.13) * 0.5 + whip * 0.9 * dir,
    };
  };
  // Dense across the whip, coarse after it — the sine alone needs very few samples.
  const marks = [0, 0.09, 0.18, 0.27, 0.36];
  for (let t = 0.76; t < L; t += 0.4) marks.push(t);
  marks.push(L);
  const keep = marks.filter((t, k) => t <= L && (k === 0 || t > marks[k - 1]));

  const v0 = at(0);
  const out = [`tl.set(".${id}-cam",{transformOrigin:"${org}",scale:${r(v0.s)},x:"${r(v0.x)}cqw",y:"${r(v0.y)}cqw",rotation:${r(v0.rot)}},${r(T)});`];
  for (let k = 1; k < keep.length; k++) {
    const t0 = keep[k - 1], t1 = keep[k], v = at(t1);
    out.push(`tl.to(".${id}-cam",{scale:${r(v.s)},x:"${r(v.x)}cqw",y:"${r(v.y)}cqw",rotation:${r(v.rot)},duration:${r(t1 - t0)},ease:"none"},${r(T + t0)});`);
  }
  return out;
}

// The chrome's own two continuous runs, both on the global clock like the camera: the
// footer diamond keeps rotating and the progress rule keeps filling ACROSS the cut. Stepping
// either per scene is instantly legible as eight separate clips.
function chromeTweens(ctx, D) {
  const { id, T, L } = ctx;
  const p0 = D > 0 ? T / D : 0, p1 = D > 0 ? Math.min(1, (T + L) / D) : 0;
  // The `.<id>-prog` fill that used to lead this list is gone (see the note at the masthead).
  // The slowly rotating diamond stays — it is the pack's signature mark, not a playhead: it
  // never reaches an end state and encodes nothing about position in the film.
  return [
    `tl.fromTo(".${id}-dia",{rotation:${r(45 + T * 10)}},{rotation:${r(45 + (T + L) * 10)},duration:${r(L)},ease:"none"},${r(T)});`,
  ];
}

const BUILDERS = {
  hook: sHook, problem: sProblem, promise: sPromise, brand: sBrand,
  tourRead: (sc, ctx, a) => sTour(sc, ctx, a, 0),
  tourScript: (sc, ctx, a) => sTour(sc, ctx, a, 1),
  tourRender: (sc, ctx, a) => sTour(sc, ctx, a, 2),
  close: sClose,
};
const MIDDLE = ["problem", "promise", "brand", "tourRead", "tourScript", "tourRender"];

// A tour scene is TWO planes; every other role draws none. Assigning by role rather than by
// beat is what keeps a picture from landing on a layout that will never paint it.
function slotsFor(role) { return /^tour/.test(role) ? 2 : 0; }
const SLOT_SHAPES = { tourRead: [1.5, 0.5625], tourScript: [1.5, 0.5625], tourRender: [1.5, 0.5625] };

const LEAD = ["problem", "promise", "brand"];   // the talking beats, in reference order
const TOURS = ["tourRead", "tourScript", "tourRender"];

function canCarry(role, scene) {
  if (role === "problem") return bullets(scene, 3).length >= 2;
  return wordsOf(scene.headline || scene.title || "").length >= 2;
}

// THE TOUR COUNT IS DECIDED BY THE PICTURES, NOT BY POSITION.
//
// Walking the six middle roles in order works for an eight-beat film and starves a five-beat
// one: the three talking beats come first, so a short film picks problem/promise/brand, never
// reaches a tour, and every collected screenshot is dropped on the floor (caught by
// `test:portrait` as droppedInstances — a film that gathered four assets and drew none).
//
// So the middles are split. ONE TOUR BEAT PER PICTURE (capped at the reference's three), so
// the assets SPREAD across scenes rather than doubling up in one — the guard's other rule is
// that they must reach at least three scenes, and reserving a beat per *pair* reached only
// two. Whatever middles remain lead with the talking beats. On a full eight-beat film with
// six pictures this reproduces the reference exactly:
// hook · problem · promise · brand · read · script · render · close.
function assignRoles(scenes, shotCount) {
  const n = scenes.length;
  if (n === 1) return ["hook"];
  const roles = new Array(n).fill(null);
  roles[0] = "hook";
  roles[n - 1] = "close";
  const mid = n - 2;
  if (mid <= 0) return roles;
  const tours = Math.max(0, Math.min(3, mid, Number(shotCount) || 0));
  const lead = mid - tours;
  let li = 0;
  for (let k = 0; k < mid; k++) {
    const i = k + 1;
    if (k < lead) {
      let pick = null;
      for (let step = 0; step < LEAD.length; step++) {
        const cand = LEAD[(li + step) % LEAD.length];
        if (canCarry(cand, scenes[i])) { pick = cand; li = (li + step + 1) % LEAD.length; break; }
      }
      // Nothing fit: `promise` degrades most gracefully — it needs only a spoken line.
      roles[i] = pick || "promise";
    } else {
      roles[i] = TOURS[(k - lead) % TOURS.length];
    }
  }
  return roles;
}

// ---- style -------------------------------------------------------------------
function styleBlock(th, portrait) {
  return `${th.fontFace}
  * { box-sizing:border-box; margin:0; padding:0; }
  html, body { width:100%; height:100%; overflow:hidden; background:${th.dark}; }
  #root { position:relative; overflow:hidden; isolation:isolate; background:${th.paper}; container-type:size; font-family:${th.displayStack}; }
  .clip { position:absolute; top:0; left:0; width:100%; height:100%; overflow:hidden; }
  .sb-scene { perspective:${r(U(2400))}cqw; }
  .sb-stage { position:absolute; inset:0; transform-style:preserve-3d; will-change:transform,opacity; }
  .sb-cam { position:absolute; inset:0; will-change:transform; }
  .sb-3d { position:absolute; inset:0; transform-style:preserve-3d; }
  /* SAFE AREA. The camera's BASE scale is 1.11 and it pans up to 30px either way, so a
     margin-width column is pushed off the edge — content has to clear the excursion, not
     the page margin. Verified against a render that clipped words at both edges. */
  .sb-col { position:absolute; left:${COL_INSET}cqw; right:${COL_INSET}cqw; top:${r(U(250))}cqw; bottom:${r(U(330))}cqw; display:flex; flex-direction:column; justify-content:center; }
  .sb-karwrap { position:absolute; left:${COL_INSET}cqw; right:${COL_INSET}cqw; z-index:20; }
  .sb-prop { position:absolute; pointer-events:none; }
  .sb-ghost { position:absolute; inset:0; overflow:hidden; pointer-events:none; }
  .sb-ghost > div { position:absolute; font-weight:800; font-size:${r(U(300))}cqw; line-height:1; letter-spacing:-0.05em; text-transform:uppercase; color:transparent; white-space:nowrap; }
  .sb-glow { position:absolute; left:50%; top:${r(U(860))}cqw; width:${r(U(1500))}cqw; height:${r(U(1500))}cqw; margin-left:${r(U(-750))}cqw; margin-top:${r(U(-750))}cqw; pointer-events:none; }
  /* The cut: one brand bar crossing the frame. The reference's ONLY transition. */
  .sb-cut { position:absolute; left:0; top:0; bottom:0; width:100%; pointer-events:none; z-index:40; }
  /* .kw / .kwi are the names caption_render.js's SHAPING_FIX targets. */
  .kw { display:inline-block; overflow:hidden; vertical-align:bottom; }
  .sb-mask { display:block; overflow:hidden; }
  .kwi { display:inline-block; will-change:transform,opacity; }
  .sb-head { font-weight:800; letter-spacing:-0.04em; text-transform:uppercase; white-space:nowrap; }
  .sb-kar { display:flex; flex-wrap:wrap; align-items:baseline; gap:0 ${r(U(22))}cqw; max-width:100%; font-weight:800; letter-spacing:-0.04em; text-transform:uppercase; line-height:1.06; }
  .sb-kwi { display:inline-block; }
  .sb-kar .kw { padding-bottom:0.08em; max-width:100%; }
  /* A word is atomic: never let the flex line break inside one. karSize guarantees the
     live word fits the column, and this makes an unexpected token overflow visibly
     rather than silently splitting across two lines. */
  .sb-kar .kwi { white-space:nowrap; }
  .sb-kwi { transform-origin:left bottom; }
  .sb-kick { display:inline-block; font-family:${th.monoStack}; font-weight:600; font-size:${r(U(21))}cqw; letter-spacing:0.28em; }
  .sb-body { font-weight:500; font-size:${r(U(30))}cqw; line-height:1.42; }
  .sb-lede { font-weight:600; font-size:${r(U(40))}cqw; line-height:1.2; letter-spacing:-0.015em; }
  .sb-meta { position:absolute; display:flex; gap:${r(U(48))}cqw; }
  .sb-mlab { font-family:${th.monoStack}; font-weight:600; font-size:${r(U(19))}cqw; letter-spacing:0.22em; }
  .sb-mval { margin-top:${r(U(13))}cqw; font-weight:700; font-size:${r(U(31))}cqw; line-height:1.1; letter-spacing:-0.01em; overflow-wrap:anywhere; }
  .sb-rnum { font-family:${th.monoStack}; font-weight:600; font-size:${r(U(21))}cqw; letter-spacing:0.2em; flex:0 0 auto; }
  .sb-rlab { flex:1 1 auto; font-weight:700; font-size:${r(U(40))}cqw; line-height:1.06; letter-spacing:-0.02em; overflow-wrap:anywhere; }
  .sb-rval { flex:0 0 auto; font-weight:700; font-size:${r(U(31))}cqw; line-height:1.1; white-space:nowrap; }
  .sb-row { display:flex; align-items:baseline; gap:${r(U(20))}cqw; padding:${r(U(16))}cqw 0; border-bottom:${r(U(2))}cqw solid; }
  .sb-slab { overflow:hidden; will-change:transform,opacity; }
  .sb-bar { display:flex; align-items:center; justify-content:space-between; padding:0 ${r(U(18))}cqw; font-family:${th.monoStack}; font-weight:600; font-size:${r(U(20))}cqw; letter-spacing:0.2em; text-transform:uppercase; }
  .sb-mark { position:absolute; left:${M}cqw; bottom:${r(U(78))}cqw; display:flex; align-items:center; gap:${r(U(14))}cqw; z-index:30; }
  /* The caption rides just above the footer wordmark, never over the karaoke band. */
  #caps { position:absolute; inset:0; display:flex; justify-content:center; align-items:flex-end; padding:0 ${M}cqw ${portrait ? "9%" : "7%"}; z-index:60; pointer-events:none; }
  #cap-pill { max-width:84%; height:fit-content; flex:0 0 auto; text-align:center; padding:${r(U(12))}cqw ${r(U(22))}cqw; opacity:0; }
  #cap-text { font-weight:600; font-size:${r(U(27))}cqw; line-height:1.32; }`;
}

// ---- MAIN --------------------------------------------------------------------
// IT CUTS, AND THE BAR COVERS THE CUT. Scene N's clip ends exactly where N+1 begins; the
// incoming scene draws a brand bar that crosses the frame in its first 0.26s. That is the
// reference's whole transition vocabulary, and it works because the camera, the progress
// rule and the footer diamond all keep running straight through the boundary.
function buildComposition({ storyboard, dims, framePack, captionCues, assets, brandSkin = null, localized = null, seedKey = null } = {}) {
  const th = slabTheme(brandSkin);
  const S = localized ? { ...STRINGS, ...localized } : STRINGS;
  const sb = storyboard || {};
  const W = (dims && dims.width) || 1080, H = (dims && dims.height) || 1920;
  const portrait = W < H;
  const title = String(sb.title || "").trim();
  const scenes = Array.isArray(sb.scenes) && sb.scenes.length
    ? sb.scenes.slice(0, 12)
    : [{ id: "s1", start: 0, duration: 5, kind: "hook", headline: title }];
  // After `scenes`, because the brand may have to be recovered from a scene's own address.
  const brand = resolveBrandName(title, scenes);
  const D = r(sb.durationSec || scenes.reduce((a, x) => Math.max(a, (Number(x.start) || 0) + (Number(x.duration) || 0)), 0) || 12);

  const logo = logoAssetOf(assets);
  const shots = (Array.isArray(assets) ? assets : []).filter(screenOk)
    .sort(admission.byDisplayRank);

  const roles = assignRoles(scenes, shots.length);
  const sceneIdOf = (i) => (scenes[i].id != null ? String(scenes[i].id) : `s${i + 1}`);
  const sceneShots = scenes.map(() => []);

  // BREADTH BEFORE DEPTH: every tour scene's back plane before any tour scene's front plane,
  // so three pictures fill three scenes rather than crowding one. Within a rank the earlier
  // scene picks first, and the pick blends the Creative Director's rank, its sceneId hint and
  // how far the asset's shape is from the plane it would fill.
  const slots = [];
  const maxSlots = Math.max(0, ...roles.map(slotsFor));
  for (let rank = 0; rank < maxSlots; rank++) {
    roles.forEach((role, i) => {
      if (slotsFor(role) <= rank) return;
      const shapes = SLOT_SHAPES[role] || [];
      slots.push({ i, target: shapes[rank] || shapes[0] || 1.5 });
    });
  }
  const taken = new Set();
  for (const slot of slots) {
    let pick = -1, best = -Infinity;
    for (let a = 0; a < shots.length; a++) {
      if (taken.has(a)) continue;
      const ar = ratioOf(shots[a]) || slot.target;
      const misfit = Math.abs(Math.log(ar / slot.target));
      const hint = String(shots[a].sceneId != null ? shots[a].sceneId : "") === sceneIdOf(slot.i) ? 4 : 0;
      const score = (Number(shots[a].cdScore) || 0) + hint - 2.5 * misfit;
      if (score > best) { best = score; pick = a; }
    }
    if (pick < 0) break;
    taken.add(pick);
    sceneShots[slot.i].push(shots[pick]);
  }

  const scriptStart = (i) => scenes.slice(0, i).reduce((a, x) => a + (Number(x.duration) || 0), 0);
  const bodyParts = [], sceneScripts = [];

  scenes.forEach((scene, i) => {
    const T = r(scene.start != null ? scene.start : scriptStart(i));
    const L = r(scene.duration || 5);
    const isLast = i === scenes.length - 1;
    const clipDur = isLast ? Math.max(0.1, D - T) : L;
    const role = roles[i] || "promise";
    const cfg = ROLE[role] || ROLE.promise;
    const sf = surfaceOf(th, cfg.dark);
    const dir = i % 2 ? -1 : 1;
    const ctx = {
      id: `s${i + 1}`, T, L, clipDur, i, isLast, track: 2 + i, th, sf, S, W, H, portrait,
      title, brand: (brand || String(scene.purpose || "") || "").toUpperCase().slice(0, 22) || "FILM",
      total: scenes.length, capY: cfg.capY,
      prop: cfg.prop ? prop(`s${i + 1}`, cfg.prop, sf, th) : "",
      glow: cfg.glow,
      // Only the roles the reference gives a ghost layer get one, and it echoes the karaoke's
      // own first word — never invented text.
      ghostHtml: (word) => (cfg.ghost ? ghost(`s${i + 1}`, sf, th, word) : ""),
      cut: i > 0,
      noBackdrop: role === "close",
      dir,
    };
    const built = (BUILDERS[role] || sPromise)(scene, ctx, role === "close" || role === "brand" ? logo : sceneShots[i]);
    bodyParts.push(built.html);

    const cutJs = ctx.cut
      ? [`tl.fromTo(".${ctx.id}-cut",{xPercent:${r(dir > 0 ? 100 : -100)}},{xPercent:${r(dir > 0 ? -100 : 100)},duration:0.26,ease:"none"},${r(T)});`,
         `tl.set(".${ctx.id}-cut",{opacity:0},${r(T + 0.26)});`]
      : [];
    const propJs = cfg.prop
      ? [`tl.fromTo(".${ctx.id}-pd",{strokeDashoffset:6400},{strokeDashoffset:0,duration:${r(Math.min(1.2, L * 0.5))},ease:"power2.inOut",stagger:0.01},${r(T)});`,
         `tl.fromTo(".${ctx.id}-prop",{rotation:0},{rotation:${r(L * (cfg.prop === "clock" ? 9 : 5))},duration:${r(L)},ease:"none",transformOrigin:"50% 50%"},${r(T)});`]
      : [];
    const ghostJs = cfg.ghost
      ? [`tl.fromTo(".${ctx.id}-gh",{y:0},{y:"${r(U(-9 * L))}cqw",duration:${r(L)},ease:"none"},${r(T)});`]
      : [];

    sceneScripts.push([...built.s, ...cutJs, ...propJs, ...ghostJs, ...cameraTweens(ctx), ...chromeTweens(ctx, D),
      `tl.set("#cap-text",{color:"${sf.ink}"},${r(T)});`,
      `tl.set("#cap-pill",{background:"${rgba(sf.base, 0.72)}"},${r(T)});`,
    ].filter(Boolean).join("\n  "));
    sceneScripts.push(`kill("#${ctx.id}",${r(T + clipDur)});`);
  });

  const cues = (Array.isArray(captionCues) ? captionCues : [])
    .filter((c) => c && c.text != null)
    .map((c) => [r(c.start != null ? c.start : c.startSec || 0), r(c.end != null ? c.end : (c.start || 0) + 2), String(c.text)]);

  const caps = `<div id="caps" class="clip" data-start="0" data-duration="${D}" data-track-index="50"><div id="cap-pill"><div id="cap-text"></div></div></div>`;

  const script = `(function(){
  var D=${D};
  var tl=gsap.timeline({paused:true});
  var $=function(s){return document.querySelector(s);};
  function kill(id,t){tl.set(id,{opacity:0},t);}

  ${sceneScripts.join("\n  ")}

  var cues=${JSON.stringify(cues)};
  tl.to({},{duration:D,ease:"none",onUpdate:function(){
    var now=tl.time();
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
    `<style>`, styleBlock(th, portrait), `</style>`, `</head>`, `<body>`,
    `<div id="root" class="composition" data-composition-id="vid" data-width="${W}" data-height="${H}" data-start="0" data-duration="${D}" style="width:${W}px;height:${H}px;">`,
    bodyParts.join("\n"),
    caps,
    `</div>`,
    `<script>`, script, `</script>`,
    `</body>`, `</html>`,
  ].join("\n");

  const metaJson = JSON.stringify({ compositionId: "vid", width: W, height: H, fps: (dims && dims.fps) || 30, duration: D });
  return { indexHtml, metaJson, resolvedBrand: th.resolvedBrand };
}

module.exports = { buildComposition, STRINGS };
// Test seam: the spine and the sampled camera decide the whole film before a tag is emitted.
module.exports.__test = { assignRoles, canCarry, slotsFor, LEAD, TOURS, cameraTweens, slabTheme, surfaceOf, partner, brandOf, splitRow, isOwnAsset, ROLE, MIDDLE, U };
