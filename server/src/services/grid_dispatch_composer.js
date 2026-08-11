// GRID DISPATCH composer — a native GSAP + DOM Swiss-modernist "dispatch sheet in motion".
// The pack `grid-dispatch` (manifest renderer:"grid-dispatch") routes here through the
// table-dispatched NATIVE_PACK_COMPOSERS map in pipeline.js.
//
// ─────────────────────────────────────────────────────────────────────────────────────
// PROVENANCE — a SCENE-FOR-SCENE port of the reference render
//
// Ported from the imported OmniMotion/React template "Keyframe Grid Dispatch"
// (`templete-design/2 new templetes/keyframe-scenes.jsx`) built on the Modernist design
// system, and matched against its own render, `screenshot/Keyframe Grid Dispatch.mp4`.
//
// The FIRST port of this pack generalised the reference into six archetypes chosen per beat.
// It reproduced the design system faithfully and the FILM not at all: same typeface, same
// palette, same rules — different picture in every frame. This version ports the seven
// authored scenes one for one, at their authored geometry, and maps the script's beats into
// their slots. That is the whole difference, and it is the point.
//
//   1 HERO HOOK   accent poster field · masked headline · hero panel · tick row · spec list
//   2 PROBLEM     the field COLLAPSES INTO A RULE · struck-through index · bar row · stamp
//   3 SOLUTION    typed input field · wide panel · device mock · four floating spec cards
//   4 FEATURES    the grid splits on a drawn cross · four quadrants, each alive · strip panel
//   5 BENEFITS    two comparison bars to scale · counting figures · a drawn series
//   6 PROOF       masked pull-quote · attribution · marker row · wide panel · counting metric
//   7 CALL        full-bleed accent · wordmark · rule · action block · closing ticks
//
// WHAT THE REFERENCE DOES THAT A GENERIC COMPOSER WILL NEVER GUESS
//   • IT CUTS. `<SceneStage transition="cut">` — no crossfade, no shutter, no wipe. The
//     film's continuity comes from a PERSISTENT STAGE (ground, six column rules, top/bottom
//     2px rules, wordmark, counter, progress line) plus a camera that settles back to rest
//     BEFORE the cut, so every scene change lands on identical geometry. The previous port
//     shipped an eight-move transition library, which is a different film's idea.
//   • The column hairlines are INSIDE the camera, so they push with the frame; the rules and
//     running head are outside it, so they never move. That split is the whole illusion.
//   • The chrome is globally timed: the diamond rotates on `45 + t*12` and the accent
//     progress bar tracks whole-film progress. Per scene those must RESUME the global value
//     or a hard cut stutters visibly.
//   • Scene 2 opens on scene 1's poster field and collapses it into a hairline; scene 7 opens
//     on scene 6's metric block and grows it to full bleed. Cuts that carry a shape across
//     are why the film reads as one sheet rather than seven posters.
//
// DROPPED (all of it demo content or an incompatible runtime):
//   • React, dc-runtime (<x-dc>/<x-import>), the tweaks panel and the motion editor.
//   • <image-slot> author-drag placeholders -> real <img> from the asset wire.
//   • The Google-Fonts <link> — this render is CDN-free; Archivo is bundled (base64
//     @font-face in fonts/pack_fonts.js) so the 400/600/800 hierarchy actually resolves.
//   • EVERY hardcoded string and every invented figure. The source was a demo whose SUBJECT
//     WAS THIS TOOL — "MAKE THE / LAUNCH FILM / IN ONE PROMPT", "keyframe.studio", a 4.9 star
//     rating, "1,842 REVIEWS", "12,400 films rendered", a seven-point growth curve. Shipping
//     any of it would advertise the wrong product, or invent proof, inside a customer's film.
//     Where a device NEEDED data the script cannot supply, the device is GATED on real data
//     and the layout closes over the gap — see `benefits` (series) and `proof` (rating).
//
// ─────────────────────────────────────────────────────────────────────────────────────
// UNITS. The source is authored in absolute px against a 1080x1920 stage. KEYFRAME lays out
// in cqw against `container-type:size`, where 1cqw = 1% of the container WIDTH — so on a
// 1080-wide stage 1cqw = 10.8px exactly. U() does that conversion once, which lets the
// authored geometry (a 64px margin, a 2px rule, a 142px band inset, a 524px poster field)
// port faithfully AND stay correct at any output size. Never hardcode a px value in this file.
//
// TIME. The reference's scenes are authored against a ~5s beat. A generated scene may be
// shorter, so every authored cue is scaled by `k = min(1, L/5)`: the choreography COMPRESSES
// to fit but never stretches, which keeps the reference's rhythm on a longer beat and simply
// holds the settled frame. Ambient loops use the true L.
//
// ENGINEERING CONTRACT (shared with the other native composers):
//   one paused GSAP timeline on window.__timelines["vid"] · direct-child .clip scenes on
//   UNIQUE tracks · the clip root carries visibility ONLY (opacity), inner layers carry the
//   drift and camera transforms, so GSAP never fights a CSS transform
//   (gsap_css_transform_conflict) and never touches a clip's visibility props
//   (gsap_animates_clip_element) · a hard opacity:0 kill per scene · finite repeats via
//   Math.floor (gsap_repeat_ceil_overshoot) · ONE seek-safe caption node (#cap-text) on a
//   single onUpdate proxy · deterministic throughout (no rAF, no wall clock).
//
//   Word reveals use the .kw/.kwi class convention ON PURPOSE: caption_render.js's
//   SHAPING_FIX neutralises overflow/clip-path on exactly those names when the video-text
//   language is non-Latin. A bespoke class name would silently break Devanagari/Arabic.

const { fontFaceCss, isBundled } = require("../fonts/pack_fonts");
const { isLogo } = require("./asset_priority");
const admission = require("./asset_admission");
const { logoMark } = require("./logo_render");
const { supportLine } = require("./text_fx");
const { resolveBrand } = require("./brand_kit");
const { GSAP_CDN, r, esc, hexToRgb, relLum, longestWord, bullets, logoAssetOf, resolveBrandName } = require("./composer_kit");

const DISPLAY = "Archivo";      // bundled (variable 400-900) — the whole system is set in it
const MONO = "JetBrains Mono";  // spec figures + registration marks

// Modernist's authored palette. A mono scheme by design: the readme is explicit that no
// second accent was chosen, and adding one would break the discipline that gives the look
// its authority. Brand skinning replaces the ONE accent wholesale.
const PAPER = "#F3F2F2";
const PAPER_2 = "#E7E5E4";
const INK = "#201E1D";
const ACCENT = "#EC3013";

// ---- geometry (authored in px on a 1080x1920 stage; U converts once) ---------
const STAGE_W = 1080;
const STAGE_H = 1920;
const U = (px) => Math.round((px / STAGE_W) * 10000) / 100;   // px -> cqw, 2dp
const M = U(64);          // page margin            -> 5.93cqw
const GW = U(1080 - 128); // grid width             -> 88.15cqw
const COL = U((1080 - 128) / 6); // one column      -> 14.69cqw
const cx = (i) => r(M + COL * i); // column edge i, in cqw
const RULE = U(2);        // the system's rule weight
const BAND = U(142);      // the ruled viewport band inset, top and bottom

// The reference's authored beat. Every cue below is quoted in the source's own seconds and
// scaled by min(1, L/REF_BEAT) so a short generated scene still completes its choreography.
const REF_BEAT = 5.0;

// The ruled band's own edges, in cqw. Scenes size their panels against the REAL space left
// between the block above and the block below, instead of the reference's fixed constants —
// which assumed a denser script and left generated beats sitting on bare paper.
// WHEN A SCENE HAS A PICTURE, THE PICTURE IS THE SCENE.
//
// The reference's furniture (quote, attribution, marker row, two rules, a section label, a
// metric footer) was authored for a poster that carries a modest plate. Reproducing all of
// it on a 9:16 phone frame left the product shot at four to eight percent of the frame, and
// the quality review is unambiguous that a product shot needs to dominate. So an
// asset-bearing scene RESERVES its plate first — a share of the ruled band — and the copy
// above it is trimmed to whatever remains. Scenes with no picture keep the full furniture.
const PLATE_SHARE = 0.52;      // of the band's height, reserved before any copy is placed
const BAND_TOP = BAND;
const BAND_BOT = r(100 * (STAGE_H / STAGE_W) - BAND);
const BAND_H = r(BAND_BOT - BAND);
// The vertical room a plate is entitled to, given the copy stack that must sit above it.
const plateRoom = (topY, footH = 0) => Math.max(BAND_H * 0.34, BAND_BOT - U(18) - topY - footH);

// ---- deterministic helpers ---------------------------------------------------
function seedFrom(str) { let h = 2166136261; const s = String(str || "grid"); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) || 7; }
function mulberry(seed) { let a = seed >>> 0; return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hex2 = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
const rgbHex = (a) => `#${hex2(a[0])}${hex2(a[1])}${hex2(a[2])}`;
const rgba = (h, a) => { const c = hexToRgb(h); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; };
const pad2 = (n) => String(n).padStart(2, "0");
function mixHex(a, b, t) {
  const [r1, g1, b1] = hexToRgb(a), [r2, g2, b2] = hexToRgb(b);
  return rgbHex([r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t]);
}

// ---- theme -------------------------------------------------------------------
// A LIGHT pack, so resolveBrand is asked to fit the accent to PAPER (isDark:false → the
// accent is pushed DOWN in luminance for contrast against a near-white ground). This is the
// mirror image of the dark packs and it matters: an unadjusted pastel brand is invisible on
// #F3F2F2, and Modernist's whole structure hangs off one accent being emphatic.
function gridTheme(brandSkin) {
  const fontFace = (isBundled(DISPLAY) ? fontFaceCss(DISPLAY) : "") + (isBundled(MONO) ? fontFaceCss(MONO) : "");
  let accent = ACCENT, resolvedBrand = null;
  try {
    const brand = resolveBrand(brandSkin, { ground: PAPER, isDark: false, packAccents: [ACCENT] });
    if (brand.applied && brand.accent) {
      accent = ensureInk(brand.accent);
      resolvedBrand = {
        ...(brandSkin && typeof brandSkin === "object" ? brandSkin : {}),
        // ONE accent reported, because one accent is what the film wears. Reporting a
        // palette the composition never paints is how a brand-coverage disclosure starts
        // lying — the mistake kinetic-universe v1 made with its unused tertiary.
        accents: [accent],
        emphasis: brand.emphasis, adjusted: brand.adjusted, dropped: brand.dropped,
        tier: brand.tier, applied: true,
      };
    }
  } catch { accent = ACCENT; resolvedBrand = null; }
  return {
    accent, paper: PAPER, paper2: PAPER_2, ink: INK,
    // Tints derived from the ONE accent — the readme's instruction is to prefer ramp steps
    // over ad-hoc mixes, so these are the ramp: a wash, a hairline and a pressed state.
    wash: mixHex(PAPER, accent, 0.10),
    hair: mixHex(PAPER_2, accent, 0.22),
    deep: mixHex(accent, INK, 0.34),
    muted: mixHex(INK, PAPER, 0.42),
    faint: rgba(INK, 0.14),
    displayStack: `'${DISPLAY}', 'Helvetica Neue', Arial, sans-serif`,
    monoStack: `'${MONO}', ui-monospace, monospace`,
    fontFace, resolvedBrand,
  };
}
// Guarantee the accent reads AS an accent on near-white paper. A very light brand (pastel
// yellow, ice blue) would otherwise vanish into the ground and take the poster fields, rules
// and CTA block with it. Darkens toward ink, preserving hue, until it clears the floor.
function ensureInk(hex, maxLum = 0.42) {
  let [rr, gg, bb] = hexToRgb(hex);
  for (let i = 0; i < 24 && relLum(rgbHex([rr, gg, bb])) > maxLum; i++) { rr *= 0.9; gg *= 0.9; bb *= 0.9; }
  return rgbHex([rr, gg, bb]);
}
// Text that must sit ON the accent field. Modernist prints white on its red, but a brand may
// hand us a pale accent where paper-on-paper would be unreadable.
const onAccent = (th) => (relLum(th.accent) > 0.45 ? th.ink : "#FFFFFF");

// ---- fixed copy --------------------------------------------------------------
// Neutral, localizable furniture ONLY. Every one of these is a LABEL on the film's own
// structure — never a claim, never a product name. The source template's marketing strings
// are gone; see the provenance note at the top of this file.
const STRINGS = {
  slot: "ASSET",       // spec bar: "ASSET 01"
  format: "FORMAT",    // spec list label
  scenes: "SCENES",
  runtime: "RUNTIME",
  scene: "SCENE",      // running head: "SCENE 03 / 07"
  index: "INDEX",      // the enumerated-list scene's kicker
  figure: "FIGURE",    // the stat scene's kicker
  record: "RECORD",    // the quote scene's kicker
  detail: "DETAIL",    // the feature grid's kicker
  compare: "COMPARE",  // the benefit bars' kicker
  points: "POINTS",    // section rule: "03 POINTS"
  hero: "HERO", ref: "REF", proof: "PROOF", source: "SOURCE", screen: "SCREEN",
};

// ---- copy derivation ---------------------------------------------------------
function wordsOf(t) { return String(t || "").trim().split(/\s+/).filter(Boolean); }
function hasNumber(scene) {
  return [scene.emphasis, scene.subtext, scene.headline, ...(Array.isArray(scene.onScreenText) ? scene.onScreenText : [])]
    .some((x) => /\d/.test(String(x || "")));
}
// Every numeric token in a scene, in order, with its unit suffix kept ("40x", "96%", "12K").
// The comparison bars and the counting figures are built from these and NOTHING else, so a
// scene without numbers simply does not get them.
function numbersIn(scene) {
  const pool = [scene.emphasis, scene.headline, scene.subtext, ...(Array.isArray(scene.onScreenText) ? scene.onScreenText : []), ...bullets(scene, 6)]
    .map((x) => String(x || "")).join("  ");
  const out = [];
  const re = /(\d[\d,.]*)\s*([%×xX]|[A-Za-z]{1,3}\b)?/g;
  let m;
  while ((m = re.exec(pool)) && out.length < 6) {
    const value = m[1].replace(/[.,]$/, "");
    if (!value) continue;
    let suffix = (m[2] || "").trim();
    if (/^(and|the|of|to|in|a|an|is|by)$/i.test(suffix)) suffix = "";
    out.push({ value, suffix: suffix.slice(0, 2), n: Number(value.replace(/,/g, "")) || 0 });
  }
  return out;
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
// The BRAND out of a page title. Site titles are conventionally "Brand <sep> tagline"; a
// blind character slice cuts words in half (a defect this program already shipped once on
// kinetic-universe, as "LINEAR – THE SYSTEM FOR PROD").
function brandOf(title) {
  const s = String(title || "").trim();
  if (!s) return "";
  const head = s.split(/\s+[–—|·]\s+|\s+-\s+|:\s+/)[0].trim() || s;
  const pick = head.length >= 2 ? head : s;
  if (pick.length <= 24) return pick;
  return pick.slice(0, 24).replace(/\s+\S*$/, "").trim() || pick.slice(0, 24);
}

// Split a headline into the 1-3 mask lines the poster field wants. The source template took
// author-inserted "/" separators; a generated script has none, so balance by word count.
function posterLines(text, max = 3) {
  const w = wordsOf(text);
  if (!w.length) return [];
  const n = Math.min(max, w.length <= 3 ? 1 : w.length <= 6 ? 2 : 3);
  const per = Math.ceil(w.length / n);
  const out = [];
  for (let i = 0; i < n; i++) out.push(w.slice(i * per, (i + 1) * per).join(" "));
  return out.filter(Boolean);
}
// A quadrant/card wants a short TITLE and a running BODY. A generated bullet is one run of
// prose, so split it where the writer already put a break; if there is none, the whole line
// is the title and the card carries no body rather than an arbitrary truncation.
function splitTitleBody(text, titleWords = 4) {
  const s = String(text || "").trim();
  if (!s) return { title: "", body: "" };
  const cap = (x) => (x ? x.charAt(0).toUpperCase() + x.slice(1) : x);
  // AN EXPLICIT BREAK BEATS A FULL STOP. Trying `. ` in the same alternation lets an
  // initial win: "Priya N. — Head of Finance" split on the period after "N", which put the
  // dash at the head of the role line ("— HEAD OF FINANCE"). Dashes and colons are what a
  // writer uses to separate a label from its detail, so they are tried first and alone.
  const hard = s.match(/^(.{4,46}?)\s*[—–:·|]\s*(.+)$/);
  // Strip a dangling comma, never a period — "Priya N." is an initial, not a sentence end.
  if (hard) return { title: hard[1].trim().replace(/[,;]$/, ""), body: cap(hard[2].trim()) };
  const stop = s.match(/^(.{8,46}?)\.\s+(.+)$/);
  if (stop) return { title: stop[1].trim(), body: cap(stop[2].trim()) };
  const w = wordsOf(s);
  if (w.length <= titleWords) return { title: s, body: "" };
  return { title: w.slice(0, titleWords).join(" "), body: cap(w.slice(titleWords).join(" ")) };
}
// Pull a leading figure off a list row so it can be set right-aligned the way the reference
// sets its durations. Returns "" when the row has no figure — the column then stays empty
// rather than inventing one.
function rowFigure(text) {
  const m = String(text || "").match(/(\d[\d,.]*\s*(?:%|×|x|[A-Za-z]{1,8})?)\s*$/);
  if (m && m[1] && /\d/.test(m[1]) && m[1].length <= 12) {
    return { label: String(text).slice(0, m.index).trim().replace(/[,;:—–-]\s*$/, ""), fig: m[1].trim() };
  }
  return { label: String(text || "").trim(), fig: "" };
}

// LINES AND SIZE TOGETHER, MEASURED AGAINST THE COLUMN THEY WILL OCCUPY.
//
// Splitting by word count and sizing separately is what clipped a real headline to "YOUR
// WHOLE STA": the split is blind to width, and the size was derived from the longest WORD
// against the full grid — but these lines are `white-space:nowrap` inside an overflow:hidden
// mask, so the binding constraint is the longest LINE against whatever column that block
// actually gets (narrower, on the hook, because the registration square reserves a corner).
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
    // BIGGEST WINS, ALWAYS — no early exit. Stopping at "large enough" (0.62 of the cap) let
    // a headline settle for two lines at 70px when three would have carried the reference's
    // 100px. Modernist's poster type is the loudest thing in the frame; a display line that
    // stops short of the column is the single clearest tell that this is not the reference.
    // Ties keep the FEWER lines, since `>` only replaces on a strict improvement.
    if (!best || size > best.size) best = { lines, size };
  }
  return { lines: best.lines, size: r(best.size) };
}

// ---- type scale --------------------------------------------------------------
// 0.62, not the 0.52 first used. Every headline in this pack is UPPERCASE Archivo at weight
// 800, and caps are markedly wider than the mixed-case mean — at 0.52 a real headline
// estimated as exactly fitting its column and rendered as "YOUR WHOLE ST". The estimate is
// paired with SAFETY below rather than trusted alone, because an advance width that is
// measured in the browser is not available to a build-time composer.
// 0.70, MEASURED OFF A RENDER — not estimated. The value went 0.52 -> 0.62 after an earlier
// clip, and 0.62 STILL under-measured: a delivered film cut its closing wordmark to
// "NORTHWIN". Working backwards from those pixels — the run occupied >=86.4cqw of layout
// where 0.62 predicted 76.4 — uppercase Archivo at weight 800 advances ~0.70em per glyph.
// Both packs set the same face at the same weight in the same case, so they share the number;
// change it in both or neither.
const MEAN_ADVANCE_EM = 0.70;
const FIT_SAFETY = 0.94;
// The camera pushes to 1.085 inside a scene, so a display line measured against the FULL
// grid reaches the frame edge at peak push and gets cut — a real job clipped the closing
// wordmark to "NORTHWIN". Measured display runs use this narrowed width; the grid itself
// is unchanged, so the ported geometry still lands where the reference put it.
const CAM_SAFE = 1.09;
const SAFE_GW = Math.round((GW / CAM_SAFE) * 100) / 100;
function fitCap(text, lineCqw) {
  const len = longestWord(text).length;
  return len ? (lineCqw || GW) / (len * MEAN_ADVANCE_EM) : Infinity;
}
// A single line that must not exceed a column: shrink from the authored size until the whole
// string fits. Used everywhere the reference set a fixed px size on generated copy.
function fitOne(text, lineCqw, maxSizeCqw) {
  const len = String(text || "").length;
  if (!len) return maxSizeCqw;
  return r(Math.min(maxSizeCqw, (lineCqw * FIT_SAFETY) / (len * MEAN_ADVANCE_EM)));
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

// WHOSE PICTURE IS THIS? Modernist prints photography in pure black and white, and that rule
// is right for DECORATION — it is what keeps the sheet flat and graphic. It is wrong for the
// user's own material: a website capture, an upload or a logo IS the brand, and greyscaling
// it tells the viewer their product looks like that. So the rule is applied by PROVENANCE,
// which is already on the wire as `source`.
const BRAND_SOURCES = new Set(["upload", "website", "website-brand", "website-asset"]);
const isOwnAsset = (a) => !!a && (BRAND_SOURCES.has(String(a.source || "")) || String(a.role || "") === "logo");
const assetFilter = (a) => (isOwnAsset(a) ? "none" : "grayscale(1) contrast(1.08)");

// The content-derived crop anchor for a cover-fit box of (w x h). Lazy + defensive: the
// crop engine is optional infrastructure and this composer must render without it.
function cropFocus(asset, w, h, fallback) {
  try { return require("./crop_engine").focusFor(asset, w, h, fallback); }
  catch { return (asset && asset.cropFocus) || fallback; }
}

// The aspect label the spec bar prints. Real ratios, named where a designer would name them.
function ratioLabel(a) {
  const rr = ratioOf(a);
  if (!rr) return "";
  const known = [[16 / 9, "16:9"], [3 / 2, "3:2"], [4 / 3, "4:3"], [1, "1:1"], [3 / 4, "3:4"], [2 / 3, "2:3"], [9 / 16, "9:16"]];
  let best = known[0], d = Infinity;
  for (const k of known) { const dd = Math.abs(k[0] - rr); if (dd < d) { d = dd; best = k; } }
  if (d / rr < 0.09) return best[1];
  // A tall asset reads as "1:3.2", never "0.31:1" — a spec bar prints ratios the way a
  // printer states them, and a leading zero looks like a rounding error on the sheet.
  return rr >= 1 ? `${Math.round(rr * 100) / 100}:1` : `1:${Math.round((1 / rr) * 10) / 10}`;
}

// ONE asset panel at the reference's OWN geometry: an absolutely-placed bordered rectangle
// with a technical spec header bar.
//
// COVER, NOT CONTAIN — and this is a deliberate reversal of the previous port. Deriving the
// box from the asset's ratio is what keeps a picture uncropped, but it also means the panel
// is a different size in every film, and the reference's whole composition is built on the
// panel being exactly where it was drawn (the tick row sits 40px under the hero; the spec
// list sits under that). A box that breathes drags the entire lower half of the frame with
// it. So the BOX is fixed and the picture fills it.
//
// The crop is cheap because the authored boxes were chosen for the content they hold: the
// hero is 952x626 = 1.52:1, which is a desktop screenshot (1.518) almost exactly. Where a
// crop must happen it is anchored `center top`, so what is lost is the bottom of a page,
// never its masthead — the lesson HERO_CROP taught on kinetic-universe.
// A panel with no picture is a HOLE in a fixed-geometry composition, and a grey rectangle
// announces the hole. So an unfilled slot becomes a DESIGNED graphic instead: an accent block
// carrying the scene's own index and label, at the same size the picture would have had. It
// reads as a deliberate plate in the sequence rather than a failed image — which is exactly
// what the quality review asks for ("an empty state that is a designed graphic, not a blank
// plate"). It is still Modernist: flat field, one accent, zero radius.
// NO EMPTY ASSET CONTAINERS, IN ANY FORM.
//
// Two attempts at a "designed empty state" were both rejected by the quality review: a flat
// accent block read as "a large red block dominating the frame without supporting product
// imagery", and a typographic plate read as "a container contains a placeholder number
// instead of visual media". The review is right and the lesson is general — a frame labelled
// ASSET NN promises a picture, and any substitute reads as a failed load. A slot with no
// picture is therefore not drawn at all; the scene composes as a typographic beat, which is a
// legitimate Modernist frame rather than a broken one.
function emptyPlate() { return ""; }

// THE BOX IS SIZED TO THE PICTURE AND TO THE GAP — this is the fix for three separate quality
// blockers at once ("massive empty space", "screenshot rendered too small", "image is tiny
// with excessive blank backdrop").
//
// The previous approach fixed the box at a constant ported from the reference and letterboxed
// anything that did not match. That compounds badly: a small box AND a shrunken image inside
// it. A real job put a 1:2.2 screenshot at roughly SEVEN PERCENT of frame area, where the
// review wants a product shot at fifty.
//
// Now the panel fits the asset's own ratio inside whatever space the scene has, filling ONE
// dimension exactly — so the border hugs the picture (no internal letterbox, ever) and the box
// grows to consume the slack instead of leaving paper. A tall asset therefore yields a TALL,
// NARROW panel; the caller puts the scene's copy beside it rather than under it, which is how
// the reference composes its own device screen.
// How far a `fill` plate may be widened past its picture's own shape, as a ratio multiplier.
// 1.5 lets a 0.46 phone capture render at 0.69 — two thirds of the grid instead of under a
// half — while still keeping two thirds of the image's height. Beyond this a tall capture
// starts losing the content it was collected for.
const MAX_FILL_CROP = 1.5;

// The plate's box. By default it carries the PICTURE's shape, which is deliberate: a tall
// capture becomes a tall narrow plate rather than a small picture letterboxed inside a wide
// box, and an earlier review blocked a film for exactly that ("product UI screenshot rendered
// too small"). The pack's answer to the width a narrow plate frees is its own idiom —
// "BESIDE A NARROW PLATE, UNDER A WIDE ONE" (see `asideMain` in the main scene, which moves
// the card deck into that column).
//
// `fill` is for the callers that have NOTHING to put beside it. Four of the five did not, so a
// portrait capture simply left bare paper: measured on a real render, the figure scene's plate
// came out 40.73 of 88.15cqw — 46% of the grid, 54% of it empty — and QA blocked the film for
// "massive empty space on the right side of the canvas". Those callers now widen the plate
// toward the slot, bounded by MAX_FILL_CROP.
//
// Widening only ever CROPS, never stretches, and it is safe now in a way it was not before:
// every asset reaches the composer carrying a content-derived `cropFocus` (services/crop_engine),
// so the height given up is taken from the edge furthest from the subject rather than split
// evenly around a guessed centre. The main scene does NOT pass `fill` — its aside still wants
// the narrow plate.
function panelBox(asset, availW, availH, { chromeH = 0, fill = false } = {}) {
  const inner = Math.max(U(60), availH - chromeH);
  let ar = ratioOf(asset) || 1.5;
  if (fill) {
    const slotAr = availW / inner;
    // Only ever widen toward the slot. A picture already wider than its box is left alone —
    // narrowing it would give back width the layout has no other use for.
    if (slotAr > ar) ar = Math.min(slotAr, ar * MAX_FILL_CROP);
  }
  let w = availW, h = w / ar;
  if (h > inner) { h = inner; w = h * ar; }
  // Never so narrow it reads as a thumbnail: below this a portrait asset is better shown
  // taller than the nominal gap, which the callers allow for by passing a generous availH.
  if (w < availW * 0.34) { w = availW * 0.34; h = w / ar; }
  return { w: r(Math.min(w, availW)), h: r(h + chromeH), mediaH: r(h), portrait: w < availW * 0.72 };
}

// ONE asset panel. The box comes from panelBox, so the image ALWAYS fills it — `cover` here
// costs nothing because the box already carries the asset's ratio, and it guarantees no
// paper shows through inside the frame.
function fixedPanel(id, th, { asset, x, y, w, h, slot, note, focus, optional, label }) {
  if (!(asset && asset.path)) {
    return emptyPlate();
  }
  const barH = U(46);
  const lbl = `${STRINGS.slot} ${pad2(slot || 1)}${note ? ` — ${String(note).toUpperCase()}` : ""}`;
  // The panel knows its own box, so the crop is computed for THIS shape rather than the
  // image's generic one — the same picture keeps a different region in a tall spec panel
  // than in a wide one, which is the whole reason crops are per-placeholder.
  const media = `<img src="${esc(asset.path)}" alt="${esc(asset.alt || "")}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:${cropFocus(asset, w, h - barH, focus || "center top")};background:${th.paper};filter:${assetFilter(asset)};">`;
  return `<div class="${id}-panel gd-panel" style="left:${r(x)}cqw;top:${r(y)}cqw;width:${r(w)}cqw;height:${r(h)}cqw;">
    <div class="gd-bar" style="height:${r(barH)}cqw;">
      <span>${esc(lbl)}</span><span style="color:${th.accent};">${esc(ratioLabel(asset))}</span>
    </div>
    <div style="position:absolute;left:0;right:0;top:${r(barH)}cqw;bottom:0;overflow:hidden;">
      <div class="${id}-zoom" style="position:absolute;inset:0;">${media}</div>
    </div>
  </div>`;
}
// A bare framed picture with no spec bar — the reference's device screen and attribution
// portrait. Same cover discipline.
function bareShot(id, th, { asset, x, y, w, h, border, focus }) {
  const media = asset && asset.path
    ? `<img src="${esc(asset.path)}" alt="${esc(asset.alt || "")}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:${cropFocus(asset, w, h, focus || "center top")};background:${th.paper};filter:${assetFilter(asset)};">`
    : `<div style="position:absolute;inset:0;background:${th.accent};"></div>`;
  return `<div class="${id}-shot" style="position:absolute;left:${r(x)}cqw;top:${r(y)}cqw;width:${r(w)}cqw;height:${r(h)}cqw;border:${r(border || RULE)}cqw solid ${th.ink};background:${th.paper};overflow:hidden;">
    <div class="${id}-zoom" style="position:absolute;inset:0;">${media}</div>
  </div>`;
}

// ---- motion vocabulary -------------------------------------------------------
// The reference declares "exactly three motion helpers" and uses nothing else. They map onto
// GSAP's curves exactly: eo(t)=1-(1-t)^3 is power3.out, eio is the cubic in-out, and bk with
// c=2.4 is back.out(2.4). Quoting the source's own constant matters — 1.9 (the previous
// port's guess) lands the stamps and counters visibly softer than the reference.
const ENTER = "power3.out";    // MOTION.enter — arrive + settle
const DRAW = "power3.inOut";   // MOTION.draw  — rules, wipes, masks
const POP = "back.out(2.4)";   // MOTION.pop   — stamps, counters, registration marks

// A headline that rises out of a hard-edged mask. Modernist type never fades in.
// .kw/.kwi are the names caption_render's SHAPING_FIX targets — see the header note.
function maskLines(cls, lines, sizeCqw, lhFactor = 1.08) {
  return lines.map((l) =>
    `<div class="kw gd-mask" style="height:${r(sizeCqw * lhFactor)}cqw;">
       <div class="kwi ${cls}" style="font-size:${r(sizeCqw)}cqw;line-height:${r(sizeCqw * lhFactor)}cqw;">${esc(l)}</div>
     </div>`
  ).join("");
}
// finite yoyo repeat count — Math.floor, never ceil (gsap_repeat_ceil_overshoot).
function reps(t, c) { return Math.max(0, Math.floor((Number(t) || 0) / (c || 1)) - 1); }

// The camera. The reference builds it as translate(-fx*(S-1), -fy*(S-1)) scale(S) with
// transform-origin 0 0, which is precisely a scale about the stage point (fx, fy) — so it
// ports to a transform-origin percentage and two chained tweens. It ramps in and settles
// back to REST inside the scene, which is what lets the film cut without ever cutting on a
// moving frame.
//
// The tweens are chained end-to-start so they never overlap (overlapping_gsap_tweens).
function camera(id, k, at, { s, x, y, i0, i1, o0, o1 }, L) {
  // THE PUSH MUST NOT SHOVE THE HEADLINE OUT OF THE BAND.
  //
  // Scaling about a point LOW in the frame lifts everything above it — and the band clips
  // whatever rises past its top edge, so the reference's y=1520 origin at 1.09 carried a
  // scene's own headline off the top of the frame. A delivered film was flagged for exactly
  // that ("headline text clipped at top edge").
  //
  // The authored origins are kept in spirit but clamped: no lower than 32% of the frame, and
  // no more than 1.07. Content at the band top (142px) then lands at ~160px under the worst
  // combination — inside the band with margin — while the move still reads as a push.
  const MAX_ORIGIN_Y = 32, MAX_SCALE = 1.07;
  const ox = r((x / STAGE_W) * 100);
  const oy = r(Math.min(MAX_ORIGIN_Y, (y / STAGE_H) * 100));
  s = Math.min(s, MAX_SCALE);
  const org = `${ox}% ${oy}%`;
  let inAt = at + i0 * k, inD = Math.max(0.12, (i1 - i0) * k);
  let outAt = Math.max(inAt + inD, at + o0 * k), outD = Math.max(0.12, (o1 - o0) * k);
  // THE CUT MUST LAND ON A SETTLED FRAME. Scaling the authored cues by k alone can finish
  // the settle a few frames before the scene ends — and a scene whose push is still easing
  // out when it cuts is the exact defect the persistent stage exists to avoid. The reference
  // holds ~0.5s of rest; hold at least 0.25s, sliding the whole schedule earlier to buy it.
  if (L != null) {
    const over = (outAt + outD) - (at + L - 0.25);
    if (over > 0) {
      const room = Math.max(0, inAt - at);
      const shift = Math.min(over, room);
      inAt -= shift; outAt -= shift;
      const rest = over - shift;
      if (rest > 0) {   // still long: squeeze the two moves rather than clip the settle
        const total = inD + outD, keep = Math.max(0.24, total - rest);
        const f = keep / total;
        inD *= f; outD *= f; outAt = Math.max(inAt + inD, outAt - rest * (1 - f));
        outAt = Math.min(outAt, at + L - 0.25 - outD);
      }
    }
  }
  return [
    `tl.fromTo(".${id}-cam",{scale:1},{scale:${r(s)},duration:${r(inD)},ease:"${DRAW}",transformOrigin:"${org}"},${r(inAt)});`,
    `tl.to(".${id}-cam",{scale:1,duration:${r(outD)},ease:"${DRAW}",transformOrigin:"${org}"},${r(outAt)});`,
  ];
}

// ---- scene shell -------------------------------------------------------------
// Four nested layers, each owning exactly one job:
//   .clip      — visibility (the framework's), never transformed
//   .gd-band   — the clipped ruled viewport, in STAGE coordinates, never transformed
//   .gd-drift  — the whole-film ambient scale (the reference's `gs`)
//   .gd-cam    — the scene's own push
// The column hairlines live INSIDE .gd-cam, and the rules / running head OUTSIDE the band —
// that split is what makes the grid push while the page furniture stays nailed down.
function open(ctx, inner) {
  const dur = r(Math.max(0.1, ctx.clipDur));
  return `<div class="clip gd-scene" id="${ctx.id}" data-start="${r(ctx.T)}" data-duration="${dur}" data-track-index="${ctx.track}"${ctx.noBackdrop ? " data-no-backdrop" : ""} style="opacity:0;">
    ${ctx.bleed || ""}
    <div class="gd-band">
      <div class="${ctx.id}-drift gd-drift">
        <div class="gd-cam ${ctx.id}-cam">
          ${ctx.cols}
          ${inner}
        </div>
      </div>
    </div>
    ${ctx.chrome}
  </div>`;
}

// The five faint column hairlines. Authored at top 140 / height 1638 — i.e. exactly the
// ruled band — and carried by the camera.
function columnsFor(th, tone) {
  return [1, 2, 3, 4, 5].map((k) =>
    `<div style="position:absolute;left:${cx(k)}cqw;top:${r(U(140))}cqw;height:${r(U(1638))}cqw;width:1px;background:${tone || th.faint};"></div>`).join("");
}

// The persistent page furniture: top rule + accent progress line, bottom rule, the rotating
// diamond and wordmark, and the running head with scene counter and timecode.
//
// GLOBAL TIME, RESUMED PER SCENE. The reference reads `tl.time()` every frame for the diamond
// angle and the progress bar. Under hard cuts each scene is a separate element, so each one
// must START at the global value and tween to the next — otherwise the diamond snaps back to
// 45° at every cut, which is exactly the kind of tell that makes a cut read as a slideshow.
function chromeFor(ctx, th, total, inkColor) {
  const ink = inkColor || th.ink;
  const soft = inkColor ? rgba(inkColor, 0.6) : th.muted;
  return `<div class="gd-chrome ${ctx.id}-chrome">
    <div class="gd-rule-top" style="background:${ink};"></div>
    <div class="${ctx.id}-prog gd-prog" style="background:${th.accent};"></div>
    <div class="gd-rule-bot" style="background:${ink};"></div>
    <div class="gd-word" style="color:${ink};">
      <span class="${ctx.id}-dia gd-dia" style="background:${th.accent};"></span>
      <span>${esc(ctx.brand)}</span>
    </div>
    <div class="gd-head" style="color:${soft};">${esc(STRINGS.scene)} ${pad2(ctx.i + 1)} / ${pad2(total)}&nbsp;&nbsp;&nbsp;${esc(timecode(ctx.T))}</div>
  </div>`;
}
// The chrome's own two continuous animations, quoted from the reference's global clock.
function chromeTweens(ctx, D) {
  const { id, T, L } = ctx;
  const p0 = D > 0 ? T / D : 0, p1 = D > 0 ? Math.min(1, (T + L) / D) : 0;
  return [
    `tl.fromTo(".${id}-prog",{scaleX:${r(p0)}},{scaleX:${r(p1)},duration:${r(L)},ease:"none",transformOrigin:"left center"},${r(T)});`,
    `tl.fromTo(".${id}-dia",{rotation:${r(45 + T * 12)}},{rotation:${r(45 + (T + L) * 12)},duration:${r(L)},ease:"none"},${r(T)});`,
    `tl.fromTo(".${id}-drift",{scale:${r(1 + 0.012 * p0)}},{scale:${r(1 + 0.012 * p1)},duration:${r(L)},ease:"none",transformOrigin:"50% 50%"},${r(T)});`,
  ];
}

// ---- reference furniture -----------------------------------------------------
// A dispatch sheet states its own position on the reel. mm:ss of the scene's true start.
function timecode(t) {
  const s = Math.max(0, Math.round(Number(t) || 0));
  return `${pad2(Math.floor(s / 60))}:${pad2(s % 60)}`;
}
// The row of registration marks: one square per scene, filled up to the current one, so the
// row doubles as a position indicator. Belongs to the SHEET, so it renders whether or not the
// scene received an asset.
function markerRow(id, th, total, at, x, y, size) {
  const n = Math.min(8, Math.max(2, total));
  const sz = size || U(26), gap = U(12);
  return `<div style="position:absolute;left:${r(x)}cqw;top:${r(y)}cqw;display:flex;gap:${r(gap)}cqw;">${
    Array.from({ length: n }).map((_, k) =>
      `<span class="${id}-mk" style="width:${r(sz)}cqw;height:${r(sz)}cqw;display:inline-block;flex:0 0 auto;background:${k <= at ? th.accent : rgba(th.ink, 0.25)};"></span>`).join("")}</div>`;
}
// A section label flanked by rules that draw outward from it — the reference's way of
// captioning a band without a heading.
function sectionLabel(id, th, text, x, y, w) {
  if (!text) return "";
  return `<div class="${id}-sect gd-sect" style="left:${r(x)}cqw;top:${r(y)}cqw;width:${r(w)}cqw;">
    <span class="gd-sline" style="background:${th.faint};"></span>
    <span style="color:${th.muted};white-space:nowrap;">${esc(text)}</span>
    <span class="gd-sline" style="background:${th.faint};"></span>
  </div>`;
}
// The four line icons the feature grid sets above each title. Ported outline-for-outline;
// chosen by keyword so the mark means something about the point it labels.
const ICONS = {
  aperture: `<circle cx="12" cy="12" r="9"/><path d="M14 12 20.5 8.5M12 10 8.5 3.7M10 12 3.5 15.5M12 14l3.5 6.3"/>`,
  check: `<rect x="3" y="3" width="18" height="18"/><path d="m7.5 12 3 3 6-6.5"/>`,
  mic: `<rect x="9" y="2.5" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21.5"/>`,
  lock: `<rect x="4" y="10.5" width="16" height="10.5"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/>`,
};
const ICON_ORDER = ["aperture", "check", "mic", "lock"];
function iconFor(text, i) {
  const s = String(text || "").toLowerCase();
  // WORD BOUNDARIES, NOT SUBSTRINGS. Unanchored, "art" matched inside "ch-art" and every
  // chart feature drew the aperture mark — two identical icons side by side in a grid whose
  // whole job is to differentiate four points.
  if (/(secure|security|privacy|lock|protect|compliance|encrypt|safe)/.test(s)) return "lock";
  if (/(voice|audio|speak|sound|call|listen|record|narration)/.test(s)) return "mic";
  if (/(check|approve|verify|review|quality|test|confirm|accurate|publish)/.test(s)) return "check";
  if (/(design|brand|visual|art|look|style|colou?rs?|image|theme)/.test(s)) return "aperture";
  return ICON_ORDER[i % ICON_ORDER.length];
}
function icon(kind, color, sizeCqw) {
  return `<svg viewBox="0 0 24 24" width="${r(sizeCqw)}" height="${r(sizeCqw)}" style="width:${r(sizeCqw)}cqw;height:${r(sizeCqw)}cqw;display:block;" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${ICONS[kind] || ICONS.aperture}</svg>`;
}

// ══════════════════════════════════════════════════════════════════════════════
// SCENE 1 — HERO HOOK
// The accent poster field wipes across the grid, the headline rises out of hard masks in
// paper-on-accent, a registration square spins in, the hero panel wipes open, the tick row
// stamps and the film's own spec list prints below.
// ══════════════════════════════════════════════════════════════════════════════
function sHook(scene, ctx, sceneAssets) {
  const { id, th, k, at, du, W, H } = ctx;
  const head = scene.headline || scene.title || ctx.brand || "";
  const fg = onAccent(th);
  // Authored: 3 lines at 100px/108px in a 524px field, inset 32 left with an 84px square
  // reserving the right corner.
  const colW = GW - U(64) - U(104);
  const fit = fitLines(head, colW, U(100), 3);
  const lines = fit.lines.length ? fit.lines : [String(head || "").toUpperCase()];
  const lh = fit.size * 1.08;
  const fieldY = U(176), fieldH = U(96) + lines.length * lh + U(104);
  const asset = (sceneAssets || [])[0] || null;

  // Everything downstream hangs off the field, exactly as the reference's fixed numbers do:
  // at three lines this reproduces 728 / 1440 / 1494 / 1544 / 1590 to the pixel.
  const panelY = fieldY + fieldH + U(28);
  // Everything under the panel is a known, fixed stack; whatever is left between the field
  // and that stack belongs to the picture. On a short headline this is far MORE than the
  // authored 672px, which is what turns the reference's bare lower half into a filled frame.
  const hookFoot = U(26) + U(40) + U(54) + U(50) + U(46) + U(104);
  const panelH = plateRoom(panelY, hookFoot);
  // fill: the hook's plate is the only thing in its row — nothing sits beside it.
  const hookBox = panelBox(asset, GW, panelH, { chromeH: U(46), fill: true });
  const tickY = panelY + hookBox.h + U(40);
  const sectY = tickY + U(54), ruleY = sectY + U(50), specY = ruleY + U(46);
  const spec = [
    [ctx.S.format, `${W}×${H}`],
    [ctx.S.scenes, pad2(ctx.total)],
    [ctx.S.runtime, ctx.runtime],
  ];
  const kicker = `${ctx.S.scene} ${pad2(ctx.i + 1)} / ${pad2(ctx.total)}`;

  const html = open(ctx, `
    <div class="${id}-field" style="position:absolute;left:${M}cqw;top:${r(fieldY)}cqw;width:${GW}cqw;height:${r(fieldH)}cqw;background:${th.accent};transform:scaleX(0);transform-origin:left center;"></div>
    <div style="position:absolute;left:${M}cqw;top:${r(fieldY)}cqw;width:${GW}cqw;height:${r(fieldH)}cqw;overflow:hidden;">
      <div class="${id}-kick gd-kicker" style="position:absolute;left:${r(U(32))}cqw;top:${r(U(36))}cqw;color:${rgba(fg, 0.78)};opacity:0;">${esc(kicker)}</div>
      <div style="position:absolute;left:${r(U(32))}cqw;top:${r(U(96))}cqw;width:${r(colW)}cqw;color:${fg};">
        ${maskLines(`${id}-l`, lines, fit.size)}
      </div>
      <div class="${id}-sq" style="position:absolute;right:${r(U(32))}cqw;top:${r(U(300))}cqw;width:${r(U(84))}cqw;height:${r(U(84))}cqw;border:${r(U(3))}cqw solid ${rgba(fg, 0.9)};"></div>
      <div class="${id}-fr" style="position:absolute;left:${r(U(32))}cqw;top:${r(fieldH - U(68))}cqw;width:${r(U(220))}cqw;height:${r(U(4))}cqw;background:${fg};transform:scaleX(0);transform-origin:left center;"></div>
    </div>

    ${fixedPanel(id, th, { asset, x: M, y: panelY, w: hookBox.w, h: hookBox.h, slot: 1, note: ctx.S.hero })}

    ${markerRow(id, th, ctx.total, ctx.i, M, tickY, U(26))}
    ${sectionLabel(id, th, `${pad2(ctx.total)} ${ctx.S.scenes} · ${ctx.runtime}`, M, sectY, GW)}
    <div class="${id}-hr" style="position:absolute;left:${M}cqw;top:${r(ruleY)}cqw;width:${GW}cqw;height:${RULE}cqw;background:${th.ink};transform:scaleX(0);transform-origin:left center;"></div>
    ${spec.map(([lab, val], j) => `<div class="${id}-sp" style="position:absolute;left:${cx(j * 2)}cqw;top:${r(specY)}cqw;width:${r(COL * 2 - U(30))}cqw;opacity:0;">
      <div style="font-family:${th.monoStack};font-weight:600;font-size:${r(U(18))}cqw;letter-spacing:0.22em;color:${th.accent};">${esc(lab)}</div>
      <div style="margin-top:${r(U(14))}cqw;font-family:${th.displayStack};font-weight:700;font-size:${r(U(26))}cqw;letter-spacing:-0.01em;color:${th.ink};">${esc(val)}</div>
    </div>`).join("")}`);

  const s = [
    `tl.set("#${id}",{opacity:1},${r(ctx.T)});`,
    `tl.fromTo(".${id}-field",{scaleX:0},{scaleX:1,duration:${du(0.62)},ease:"${DRAW}",transformOrigin:"left center"},${at(0.12)});`,
    `tl.fromTo(".${id}-kick",{opacity:0,x:"-1.4cqw"},{opacity:1,x:0,duration:${du(0.4)},ease:"${ENTER}"},${at(0.55)});`,
    `tl.fromTo(".${id}-l",{yPercent:110},{yPercent:0,duration:${du(0.6)},ease:"${ENTER}",stagger:${du(0.13)}},${at(0.5)});`,
    `tl.fromTo(".${id}-sq",{scale:0,rotation:45},{scale:1,rotation:${r(45 + 0.6 * 9)},duration:${du(0.6)},ease:"${POP}"},${at(1.0)});`,
    `tl.to(".${id}-sq",{rotation:${r(45 + Math.max(6, ctx.L * 9))},duration:${r(Math.max(0.4, ctx.L - 1.6 * k))},ease:"none"},${at(1.6)});`,
    `tl.fromTo(".${id}-fr",{scaleX:0},{scaleX:1,duration:${du(0.5)},ease:"${DRAW}",transformOrigin:"left center"},${at(1.05)});`,
    // `fixedPanel` returns an emptyPlate when there is no picture, so neither `-panel` nor
    // `-zoom` exists on a pictureless hook — these two were emitted regardless. Found by
    // scripts/test-dead-tweens.js.
    asset ? `tl.fromTo(".${id}-panel",{clipPath:"inset(0% 100% 0% 0%)"},{clipPath:"inset(0% 0% 0% 0%)",duration:${du(0.5)},ease:"${DRAW}"},${at(0.3)});` : "",
    asset ? `tl.fromTo(".${id}-zoom",{scale:1},{scale:1.07,duration:${r(Math.max(1.2, ctx.L - 0.8 * k))},ease:"${DRAW}",transformOrigin:"50% 50%"},${at(0.8)});` : "",
    `tl.fromTo(".${id}-mk",{scale:0},{scale:1,duration:${du(0.4)},ease:"${POP}",stagger:${du(0.06)}},${at(1.7)});`,
    `tl.fromTo(".${id}-sect",{opacity:0},{opacity:1,duration:${du(0.4)},ease:"none"},${at(2.1)});`,
    `tl.fromTo(".${id}-hr",{scaleX:0},{scaleX:1,duration:${du(0.5)},ease:"${DRAW}",transformOrigin:"left center"},${at(2.2)});`,
    `tl.fromTo(".${id}-sp",{opacity:0,y:"2.2cqw"},{opacity:1,y:0,duration:${du(0.5)},ease:"${ENTER}",stagger:${du(0.1)}},${at(2.4)});`,
    ...camera(id, k, ctx.T, { s: 1.085, x: 540, y: 1060, i0: 2.5, i1: 2.9, o0: 3.9, o1: 4.5 }, ctx.L),
  ];
  return { html, s, carry: { kind: "field", y: fieldY, h: fieldH } };
}

// ══════════════════════════════════════════════════════════════════════════════
// SCENE 2 — PROBLEM
// Opens on scene 1's poster field and COLLAPSES it into a hairline. A struck-through index
// of the script's own points, a bar row, and a closing accent stamp.
// ══════════════════════════════════════════════════════════════════════════════
function sProblem(scene, ctx) {
  const { id, th, k, at, du } = ctx;
  const fg = onAccent(th);
  const head = scene.headline || scene.title || "";
  const hf = fitLines(head, GW, U(90), 2);
  const rows = bullets(scene, 4).map(rowFigure);
  // The stamp is the beat's last word, and an empty one leaves a third of the sheet bare.
  // emphasis is the writer's own pull-quote when there is one; subtext is the same beat's
  // closing sentence. Both are the script's — nothing here is invented to fill the block.
  const stamp = String(scene.emphasis || scene.subtext || "").trim().slice(0, 72);
  const sf = stamp ? fitLines(stamp, GW - U(64), U(92), 2) : { lines: [], size: U(92) };

  // The carried field: at t=0 it is EXACTLY scene 1's poster field, then it collapses to a
  // 6px rule at y=394. Reproduced from the same numbers, so the cut is invisible.
  const c0 = ctx.carryIn && ctx.carryIn.kind === "field" ? ctx.carryIn : { y: U(176), h: U(524) };
  // The carried field rests BELOW the headline, not at the reference's fixed 394px — a
  // three-line headline reaches past that and the rule lands across the type.
  const headBottom = U(190) + hf.lines.length * hf.size * 1.1;
  const carryRest = Math.max(U(394), headBottom + U(26));
  const rowH = U(172), rowY = Math.max(U(440), carryRest + U(46));
  const barsY = rowY + rows.length * rowH + U(46);
  const stampY = Math.min(U(1360), barsY + U(140));

  const html = open(ctx, `
    <div class="${id}-carry" style="position:absolute;left:${M}cqw;width:${GW}cqw;background:${th.accent};top:${r(c0.y)}cqw;height:${r(c0.h)}cqw;"></div>
    <div style="position:absolute;left:${M}cqw;top:${r(U(190))}cqw;width:${GW}cqw;">
      ${hf.lines.map((l, j) => `<div class="kw gd-mask" style="height:${r(hf.size * 1.1)}cqw;">
        <div class="kwi ${id}-l" style="font-size:${r(hf.size)}cqw;line-height:${r(hf.size * 1.1)}cqw;color:${j ? th.accent : th.ink};">${esc(l)}</div>
      </div>`).join("")}
    </div>

    ${rows.map((row, j) => {
      const y = rowY + j * rowH;
      const labSize = fitOne(row.label, GW - (row.fig ? U(240) : 0), U(56));
      // A STRIKETHROUGH STRIKES THE WORDS, NOT THE PAGE.
      //
      // The bar was drawn at the full grid width and pinned to a fixed y, so on a short row
      // it shot metres past the text as a free-floating accent rule — and on the first row it
      // landed directly under the scene's own headline, reading as a rule attached to it. The
      // review called exactly that: "red decorative accent lines overlap and collide with
      // headline text". Both dimensions now come from the type it is striking: the measured
      // run of the label, and the optical centre of its caps.
      // No rule is drawn through the type at all — see the note on the removed strike bar.
      return `<div class="${id}-row" style="position:absolute;left:${M}cqw;top:${r(y)}cqw;width:${GW}cqw;height:${r(rowH)}cqw;opacity:0;">
        <div style="position:absolute;left:0;top:${r(U(10))}cqw;font-family:${th.monoStack};font-weight:600;font-size:${r(U(20))}cqw;letter-spacing:0.22em;color:${th.accent};">${pad2(j + 1)}</div>
        <div class="${id}-st" style="position:absolute;left:0;top:${r(U(44) + labSize * 0.34)}cqw;width:${r(U(22))}cqw;height:${r(U(22))}cqw;background:${th.accent};transform:scale(0);"></div>
        <div style="position:absolute;left:${r(U(38))}cqw;top:${r(U(44))}cqw;font-family:${th.displayStack};font-weight:800;font-size:${r(labSize)}cqw;line-height:1.05;letter-spacing:-0.03em;text-transform:uppercase;color:${rgba(th.ink, 0.55)};">${esc(row.label)}</div>
        ${row.fig ? `<div style="position:absolute;left:0;top:${r(U(62))}cqw;width:${GW}cqw;text-align:right;font-family:${th.displayStack};font-weight:700;font-size:${r(U(40))}cqw;letter-spacing:-0.01em;text-transform:uppercase;color:${rgba(th.ink, 0.5)};">${esc(row.fig)}</div>` : ""}
        <div class="${id}-rl" style="position:absolute;left:0;top:${r(U(140))}cqw;width:${GW}cqw;height:${RULE}cqw;background:${rgba(th.ink, 0.3)};transform:scaleX(0);transform-origin:left center;"></div>
      </div>`;
    }).join("")}

    ${rows.length ? sectionLabel(id, th, `${pad2(rows.length)} ${ctx.S.points}`, M, barsY - U(46), GW) : ""}
    ${[0, 1, 2, 3, 4, 5, 6].map((j) => `<div class="${id}-bar" style="position:absolute;left:${r(M + j * (GW / 7))}cqw;top:${r(barsY)}cqw;width:${r(GW / 7 - U(8))}cqw;height:${r(U(44))}cqw;background:${j < 6 ? rgba(th.ink, 0.85) : th.accent};transform:scaleY(0);transform-origin:top center;"></div>`).join("")}

    ${stamp ? `
    <div class="${id}-stamp" style="position:absolute;left:${M}cqw;top:${r(stampY)}cqw;width:${GW}cqw;height:${r(U(54) + sf.lines.length * sf.size * 1.17 + U(54))}cqw;background:${th.accent};transform:scaleY(0);transform-origin:top center;"></div>
    <div style="position:absolute;left:${M}cqw;top:${r(stampY)}cqw;width:${GW}cqw;overflow:hidden;">
      <div style="padding:${r(U(54))}cqw ${r(U(32))}cqw;color:${fg};">${maskLines(`${id}-sl`, sf.lines, sf.size, 1.17)}</div>
    </div>` : ""}`);

  const s = [
    `tl.set("#${id}",{opacity:1},${r(ctx.T)});`,
    // `y`, not `top`. The bar is parked at c0.y by its inline style, so the slide is a pure
    // delta — and `top` snaps to integer device pixels during layout, which stutters under the
    // seek-by-frame capture engine. `height` stays: the collapse IS a size change, and the
    // renderer accepts it.
    `tl.fromTo(".${id}-carry",{y:0,height:"${r(c0.h)}cqw"},{y:"${r(carryRest - c0.y)}cqw",height:"${r(U(6))}cqw",duration:${du(0.5)},ease:"${DRAW}"},${at(0.02)});`,
    `tl.fromTo(".${id}-l",{yPercent:110},{yPercent:0,duration:${du(0.5)},ease:"${ENTER}",stagger:${du(0.11)}},${at(0.42)});`,
    rows.length ? `tl.fromTo(".${id}-row",{opacity:0,x:"-3cqw"},{opacity:1,x:0,duration:${du(0.5)},ease:"${ENTER}",stagger:${du(0.13)}},${at(0.5)});` : "",
    rows.length ? `tl.fromTo(".${id}-rl",{scaleX:0},{scaleX:1,duration:${du(0.45)},ease:"${DRAW}",transformOrigin:"left center",stagger:${du(0.13)}},${at(0.6)});` : "",
    rows.length ? `tl.fromTo(".${id}-st",{scale:0},{scale:1,duration:${du(0.35)},ease:"${POP}",stagger:${du(0.07)}},${at(2.25)});` : "",
    rows.length ? `tl.fromTo(".${id}-sect",{opacity:0},{opacity:1,duration:${du(0.35)},ease:"none"},${at(1.55)});` : "",
    `tl.fromTo(".${id}-bar",{scaleY:0},{scaleY:1,duration:${du(0.35)},ease:"${POP}",transformOrigin:"top center",stagger:${du(0.045)}},${at(1.7)});`,
    stamp ? `tl.fromTo(".${id}-stamp",{scaleY:0},{scaleY:1,duration:${du(0.45)},ease:"${DRAW}",transformOrigin:"top center"},${at(2.55)});` : "",
    stamp ? `tl.fromTo(".${id}-sl",{yPercent:110},{yPercent:0,duration:${du(0.45)},ease:"${ENTER}",stagger:${du(0.1)}},${at(2.85)});` : "",
    ...camera(id, k, ctx.T, { s: 1.09, x: 540, y: 1520, i0: 2.85, i1: 3.25, o0: 4.35, o1: 4.9 }, ctx.L),
  ].filter(Boolean);
  return { html, s };
}

// ══════════════════════════════════════════════════════════════════════════════
// SCENE 3 — SOLUTION
// A typed input field with an accent action, a flash on commit, the wide generated panel,
// then the grid re-forms around a device screen and four floating spec cards.
// ══════════════════════════════════════════════════════════════════════════════
function sSolution(scene, ctx, sceneAssets) {
  const { id, th, k, at, du } = ctx;
  const fg = onAccent(th);
  const shots = sceneAssets || [];
  // AN INPUT FIELD SHOWS AN ADDRESS. Falling back to the brand printed "BOARD DECKS IN AN"
  // inside a URL bar with a GENERATE button beside it — a control that states something
  // false about the product. No address, no field; the beat keeps its headline and cards.
  const url = domainOf(scene.subtext) || domainOf(scene.emphasis) || domainOf(ctx.title) || ctx.url || "";
  const action = String(scene.emphasis || "").trim().slice(0, 12).toUpperCase() || ctx.S.scene;
  const cards = bullets(scene, 4);
  const head = scene.headline || scene.title || "";

  const fieldY = U(232), fieldH = U(116);
  const panelY = url ? U(412) : U(300);
  // The plate takes everything down to the card deck. A tall capture therefore becomes a
  // TALL, NARROW plate rather than a wide box with the picture letterboxed inside it — the
  // defect the review flagged as "product UI screenshot rendered too small".
  const panelAvail = plateRoom(panelY, cards.length ? U(430) : U(40));
  const mainBox = panelBox(shots[0] || null, GW, panelAvail, { chromeH: U(46) });
  const panelH = mainBox.h;
  const ruleY = U(962), deckY = U(1030);
  const devW = U(430), devH = U(710);
  // BESIDE A NARROW PLATE, UNDER A WIDE ONE. This is the reference's own device+cards
  // composition, chosen by the picture's shape rather than hardcoded — and it is what keeps
  // a tall screenshot at full height without leaving the rest of the row blank.
  const asideMain = mainBox.portrait && !shots[1];
  const cardX = asideMain ? M + mainBox.w + U(28) : (shots[1] ? M + U(470) : M);
  const cardW = asideMain ? GW - mainBox.w - U(28) : (shots[1] ? GW - U(470) : GW);
  const cardDeckH = asideMain ? mainBox.h : devH;
  const cardH = cards.length ? Math.min(U(190), (cardDeckH - U(20) * (cards.length - 1)) / Math.max(1, cards.length)) : U(160);
  const cardGap = cards.length > 1 ? (cardDeckH - cards.length * cardH) / (cards.length - 1) : 0;
  const urlSize = fitOne(url, GW - U(300), U(40));

  const html = open(ctx, `
    <div class="${id}-kick gd-kicker" style="position:absolute;left:${M}cqw;top:${r(U(192))}cqw;color:${th.accent};opacity:0;">${esc(ctx.S.scene)} ${pad2(ctx.i + 1)}</div>
    ${url ? `<div class="${id}-input" style="position:absolute;left:${M}cqw;top:${r(fieldY)}cqw;width:${GW}cqw;height:${r(fieldH)}cqw;border:${RULE}cqw solid ${th.ink};display:flex;align-items:center;transform:scaleX(0);transform-origin:left center;">
      <div style="flex:1;padding:0 ${r(U(26))}cqw;font-family:${th.displayStack};font-weight:600;font-size:${r(urlSize)}cqw;letter-spacing:-0.01em;color:${th.ink};white-space:nowrap;overflow:hidden;">
        <span class="${id}-typed" style="clip-path:inset(0 100% 0 0);display:inline-block;">${esc(url)}</span><span class="${id}-caret" style="color:${th.accent};">▌</span>
      </div>
      <div style="width:${r(U(250))}cqw;height:100%;background:${th.accent};color:${fg};display:flex;align-items:center;padding-left:${r(U(24))}cqw;font-family:${th.displayStack};font-weight:800;font-size:${r(U(24))}cqw;letter-spacing:0.18em;">${esc(action)}</div>
    </div>` : ""}
    ${url ? `<div class="${id}-flash" style="position:absolute;left:${M}cqw;top:${r(fieldY)}cqw;width:${GW}cqw;height:${r(fieldH)}cqw;background:${th.accent};opacity:0;"></div>` : ""}

    ${fixedPanel(id, th, { asset: shots[0] || null, x: M, y: panelY, w: mainBox.w, h: mainBox.h, slot: 1, note: ctx.S.hero, label: ctx.S.hero })}

    <div class="${id}-hr" style="position:absolute;left:${M}cqw;top:${r(ruleY)}cqw;width:${GW}cqw;height:${RULE}cqw;background:${th.ink};transform:scaleX(0);transform-origin:left center;"></div>
    ${sectionLabel(id, th, head ? String(head).toUpperCase().slice(0, 46) : `${pad2(ctx.total)} ${ctx.S.scenes}`, M, ruleY + U(24), GW)}

    ${shots[1] ? `<div class="${id}-dev" style="position:absolute;left:${M}cqw;top:${r(deckY)}cqw;width:${r(devW)}cqw;height:${r(devH)}cqw;border:${r(U(3))}cqw solid ${th.ink};background:${th.paper};opacity:0;">
      <div style="position:absolute;left:50%;top:${r(U(12))}cqw;width:${r(U(120))}cqw;height:${r(U(8))}cqw;background:${th.ink};transform:translateX(-50%);"></div>
      <div style="position:absolute;left:${r(U(14))}cqw;top:${r(U(34))}cqw;right:${r(U(14))}cqw;bottom:${r(U(14))}cqw;overflow:hidden;">
        <div class="${id}-dzoom" style="position:absolute;inset:0;">${
          shots[1] && shots[1].path
            ? `<img src="${esc(shots[1].path)}" alt="${esc(shots[1].alt || "")}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:${cropFocus(shots[1], devW, devH, "center top")};background:${th.paper};filter:${assetFilter(shots[1])};">`
            : `<div style="position:absolute;inset:0;background:${th.accent};"></div>`
        }</div>
      </div>
    </div>` : ""}

    ${cards.map((c, j) => `<div class="${id}-cd" style="position:absolute;left:${r(cardX)}cqw;top:${r((asideMain ? panelY : deckY) + j * (cardH + cardGap))}cqw;width:${r(cardW)}cqw;height:${r(cardH)}cqw;border:${RULE}cqw solid ${th.ink};background:${th.paper};padding:${r(U(22))}cqw ${r(U(24))}cqw;opacity:0;overflow:hidden;">
      <div style="font-family:${th.monoStack};font-weight:600;font-size:${r(U(18))}cqw;letter-spacing:0.22em;color:${th.accent};">${pad2(j + 1)}</div>
      <div style="margin-top:${r(U(16))}cqw;font-family:${th.displayStack};font-weight:700;font-size:${r(U(30))}cqw;line-height:1.14;letter-spacing:-0.02em;text-transform:uppercase;color:${th.ink};overflow-wrap:anywhere;padding-right:${r(U(28))}cqw;">${esc(c)}</div>
      <div style="position:absolute;right:${r(U(24))}cqw;bottom:${r(U(22))}cqw;width:${r(U(22))}cqw;height:${r(U(22))}cqw;background:${th.accent};"></div>
    </div>`).join("")}`);

  const s = [
    `tl.set("#${id}",{opacity:1},${r(ctx.T)});`,
    `tl.fromTo(".${id}-kick",{opacity:0,x:"-1.2cqw"},{opacity:1,x:0,duration:${du(0.35)},ease:"${ENTER}"},${at(0.05)});`,
    url ? `tl.fromTo(".${id}-input",{scaleX:0},{scaleX:1,duration:${du(0.4)},ease:"${DRAW}",transformOrigin:"left center"},${at(0.05)});` : "",
    // The URL types itself: a clip-path wipe stepped per character, which is deterministic
    // and needs no per-frame string slicing.
    url ? `tl.fromTo(".${id}-typed",{clipPath:"inset(0 100% 0 0)"},{clipPath:"inset(0 0% 0 0)",duration:${du(1.0)},ease:"steps(${Math.max(4, Math.min(40, String(url).length))})"},${at(0.35)});` : "",
    url ? `tl.fromTo(".${id}-caret",{opacity:1},{opacity:0,duration:${du(0.2)},ease:"steps(1)",yoyo:true,repeat:${reps(1.5 * k, 0.2 * k || 0.2)}},${at(0)});` : "",
    url ? `tl.set(".${id}-caret",{opacity:0},${at(1.5)});` : "",
    url ? `tl.fromTo(".${id}-flash",{opacity:0.9},{opacity:0,duration:${du(0.4)},ease:"none"},${at(1.3)});` : "",
    shots[0] ? `tl.fromTo(".${id}-panel",{clipPath:"inset(0% 100% 0% 0%)"},{clipPath:"inset(0% 0% 0% 0%)",duration:${du(0.55)},ease:"${DRAW}"},${at(1.4)});` : "",
    shots[0] ? `tl.fromTo(".${id}-zoom",{scale:1},{scale:1.07,duration:${r(Math.max(1.2, ctx.L - 1.7 * k))},ease:"${DRAW}",transformOrigin:"50% 50%"},${at(1.7)});` : "",
    `tl.fromTo(".${id}-hr",{scaleX:0},{scaleX:1,duration:${du(0.45)},ease:"${DRAW}",transformOrigin:"left center"},${at(2.05)});`,
    `tl.fromTo(".${id}-sect",{opacity:0},{opacity:1,duration:${du(0.35)},ease:"none"},${at(2.15)});`,
    shots[1] ? `tl.fromTo(".${id}-dev",{opacity:0,y:"4.6cqw"},{opacity:1,y:0,duration:${du(0.5)},ease:"${ENTER}"},${at(2.28)});` : "",
    shots[1] ? `tl.fromTo(".${id}-dzoom",{scale:1},{scale:1.06,duration:${r(Math.max(1.0, ctx.L - 2.45 * k))},ease:"${DRAW}",transformOrigin:"50% 50%"},${at(2.45)});` : "",
    cards.length ? `tl.fromTo(".${id}-cd",{opacity:0,x:"6.5cqw"},{opacity:1,x:0,duration:${du(0.45)},ease:"${ENTER}",stagger:${du(0.11)}},${at(2.5)});` : "",
    ...camera(id, k, ctx.T, { s: 1.09, x: 540, y: 300, i0: 0.55, i1: 0.9, o0: 1.35, o1: 1.75 }, ctx.L),
  ].filter(Boolean);
  return { html, s };
}

// ══════════════════════════════════════════════════════════════════════════════
// SCENE 4 — FEATURES
// The grid splits on a drawn cross into four quadrants. Each carries an index, a line icon,
// a title and a body — and each has its own small ambient animation, so the frame is never
// still. A wide strip panel closes the scene.
// ══════════════════════════════════════════════════════════════════════════════
function sFeatures(scene, ctx, sceneAssets) {
  const { id, th, k, at, du } = ctx;
  const head = scene.headline || scene.title || "";
  const hf = fitLines(head, GW, U(90), 1);
  const items = bullets(scene, 4).map(splitTitleBody);
  const asset = (sceneAssets || [])[0] || null;

  const gridY = U(300), qw = GW / 2;
  // A picture halves the grid: two points beside it read better than four squeezed above a
  // strip, and it is the only way the plate reaches a size the review accepts.
  const shown = asset ? items.slice(0, 2) : items;
  const rows = Math.max(1, Math.ceil(shown.length / 2));
  // THE GRID TAKES WHAT IT NEEDS, THE PLATE TAKES THE REST. At the authored 588px a
  // two-row grid consumed the whole band and left the strip sixteen cqw — the review's
  // "product reference image is tiny". The rows now shrink to whatever is left after a
  // real plate is reserved, and never grow past the authored height.
  const STRIP_RESERVE = asset ? r(BAND_H * PLATE_SHARE) : U(120);
  const gridAvail = BAND_BOT - U(24) - gridY - STRIP_RESERVE;
  const qh = Math.max(U(300), Math.min(U(588), gridAvail / rows));
  const gridH = rows * qh;
  const stripY = gridY + gridH + U(54);
  // The authored 200px strip carried a wide editor capture; a generated beat often has two
  // features, not four, so a whole quadrant row goes spare. The plate takes it — a strip at
  // ten percent of frame is what the review called "tiny with excessive blank backdrop".
  const stripAvail = plateRoom(stripY, U(30));
  // fill: the strip spans the grid under the quadrant devices; nothing shares its row.
  const stripBox = panelBox(asset, GW, stripAvail, { chromeH: U(46), fill: true });
  const stripH = stripBox.h;

  // The four ambient devices, one per quadrant, quoted from the reference. Each is finite and
  // deterministic — no rAF, no wall clock.
  function ambient(j) {
    const bx = U(34), by = Math.max(U(210), qh - U(94)), bw = qw - U(68);
    if (j === 0) return `<div style="position:absolute;left:${r(bx)}cqw;top:${r(by)}cqw;width:${r(bw)}cqw;height:${r(U(50))}cqw;">
      ${[0, 1, 2, 3, 4].map((m) => `<div style="position:absolute;left:${r(m * U(62))}cqw;top:0;width:${r(U(50))}cqw;height:${r(U(50))}cqw;background:${rgba(th.ink, 0.16)};"></div>`).join("")}
      <div class="${id}-a0" style="position:absolute;left:0;top:0;width:${r(U(50))}cqw;height:${r(U(50))}cqw;background:${th.accent};"></div></div>`;
    if (j === 1) return `<div style="position:absolute;left:${r(bx)}cqw;top:${r(by)}cqw;width:${r(bw)}cqw;height:${r(U(50))}cqw;">
      ${[0, 1, 2].map((m) => `<div class="${id}-a1" style="position:absolute;left:0;top:${r(m * U(20))}cqw;height:${r(U(6))}cqw;width:${r(U(140) + m * U(60))}cqw;background:${m === 2 ? th.accent : rgba(th.ink, 0.3)};transform:scaleX(0);transform-origin:left center;"></div>`).join("")}</div>`;
    if (j === 2) return `<div style="position:absolute;left:${r(bx)}cqw;top:${r(by)}cqw;width:${r(bw)}cqw;height:${r(U(54))}cqw;display:flex;align-items:flex-end;gap:${r(U(12))}cqw;">
      ${Array.from({ length: 14 }).map((_, m) => `<div class="${id}-a2" style="width:${r(U(12))}cqw;height:${r(U(54))}cqw;background:${m % 4 === 0 ? th.accent : rgba(th.ink, 0.35)};transform:scaleY(0.25);transform-origin:bottom center;"></div>`).join("")}</div>`;
    return `<div style="position:absolute;left:${r(bx)}cqw;top:${r(by)}cqw;display:flex;gap:${r(U(14))}cqw;align-items:center;">
      <div class="${id}-a3" style="width:${r(U(50))}cqw;height:${r(U(50))}cqw;background:${th.accent};"></div>
      <div style="width:${r(U(50))}cqw;height:${r(U(50))}cqw;border:${RULE}cqw solid ${th.ink};"></div>
      <div style="width:${r(U(50))}cqw;height:${r(U(50))}cqw;background:${rgba(th.ink, 0.16)};"></div></div>`;
  }

  const html = open(ctx, `
    <div style="position:absolute;left:${M}cqw;top:${r(U(190))}cqw;width:${GW}cqw;color:${th.ink};">
      ${maskLines(`${id}-l`, hf.lines, hf.size, 1.11)}
    </div>
    <div class="${id}-hr" style="position:absolute;left:${M}cqw;top:${r(U(296))}cqw;width:${GW}cqw;height:${RULE}cqw;background:${th.ink};transform:scaleX(0);transform-origin:left center;"></div>

    <div class="${id}-vx" style="position:absolute;left:${r(M + qw)}cqw;top:${r(gridY)}cqw;width:${RULE}cqw;height:${r(gridH)}cqw;background:${th.ink};transform:scaleY(0);transform-origin:top center;"></div>
    ${rows > 1 ? `<div class="${id}-hx" style="position:absolute;left:${M}cqw;top:${r(gridY + qh)}cqw;width:${GW}cqw;height:${RULE}cqw;background:${th.ink};transform:scaleX(0);transform-origin:left center;"></div>` : ""}

    ${shown.map((it, j) => {
      const cl = j % 2, rw = Math.floor(j / 2);
      const tSize = fitOne(it.title, qw - U(76), U(44));
      return `<div class="${id}-q" style="position:absolute;left:${r(M + cl * qw)}cqw;top:${r(gridY + rw * qh)}cqw;width:${r(qw)}cqw;height:${r(qh)}cqw;padding:${r(U(38))}cqw ${r(U(34))}cqw;opacity:0;overflow:hidden;">
        <div style="font-family:${th.monoStack};font-weight:600;font-size:${r(U(18))}cqw;letter-spacing:0.22em;color:${th.accent};">${pad2(j + 1)}</div>
        <div class="${id}-ic" style="margin-top:${r(U(26))}cqw;">${icon(iconFor(it.title + " " + it.body, j), th.ink, U(52))}</div>
        <div style="margin-top:${r(U(26))}cqw;font-family:${th.displayStack};font-weight:800;font-size:${r(tSize)}cqw;line-height:1.08;letter-spacing:-0.03em;text-transform:uppercase;color:${th.ink};">${esc(it.title)}</div>
        ${it.body ? `<div style="margin-top:${r(U(18))}cqw;font-family:${th.displayStack};font-weight:400;font-size:${r(U(27))}cqw;line-height:1.4;color:${rgba(th.ink, 0.7)};max-width:${r(qw - U(76))}cqw;">${esc(it.body)}</div>` : ""}
        ${ambient(j)}
      </div>`;
    }).join("")}

    ${sectionLabel(id, th, `${pad2(shown.length)} ${ctx.S.points}`, M, stripY - U(46), GW)}
    ${fixedPanel(id, th, { asset, x: M, y: stripY, w: stripBox.w, h: stripBox.h, slot: ctx.i + 1, note: ctx.S.ref, focus: "center center", label: ctx.S.ref })}`);

  const s = [
    `tl.set("#${id}",{opacity:1},${r(ctx.T)});`,
    `tl.fromTo(".${id}-l",{yPercent:110},{yPercent:0,duration:${du(0.5)},ease:"${ENTER}"},${at(0.08)});`,
    `tl.fromTo(".${id}-hr",{scaleX:0},{scaleX:1,duration:${du(0.5)},ease:"${DRAW}",transformOrigin:"left center"},${at(0.3)});`,
    `tl.fromTo(".${id}-vx",{scaleY:0},{scaleY:1,duration:${du(0.5)},ease:"${DRAW}",transformOrigin:"top center"},${at(0.5)});`,
    rows > 1 ? `tl.fromTo(".${id}-hx",{scaleX:0},{scaleX:1,duration:${du(0.5)},ease:"${DRAW}",transformOrigin:"left center"},${at(0.62)});` : "",
    shown.length ? `tl.fromTo(".${id}-q",{opacity:0,y:"3cqw"},{opacity:1,y:0,duration:${du(0.55)},ease:"${ENTER}",stagger:${du(0.18)}},${at(0.62)});` : "",
    shown.length ? `tl.fromTo(".${id}-ic",{scale:0},{scale:1,duration:${du(0.5)},ease:"${POP}",transformOrigin:"left top",stagger:${du(0.18)}},${at(0.77)});` : "",
    // The four ambient devices. Each is a single finite tween so nothing overlaps.
    shown.length > 0 ? `tl.fromTo(".${id}-a0",{x:0},{x:"${r(U(62) * 4)}cqw",duration:${r(Math.max(1.2, ctx.L - 1.4 * k))},ease:"steps(4)"},${at(1.4)});` : "",
    shown.length > 1 ? `tl.fromTo(".${id}-a1",{scaleX:0},{scaleX:1,duration:${du(0.5)},ease:"${DRAW}",transformOrigin:"left center",stagger:${du(0.18)}},${at(1.5)});` : "",
    shown.length > 2 ? `tl.fromTo(".${id}-a2",{scaleY:0.25},{scaleY:1,duration:0.62,ease:"sine.inOut",transformOrigin:"bottom center",stagger:{each:0.07,yoyo:true,repeat:${reps(Math.max(0, ctx.L - 1.5 * k), 1.24)}},yoyo:true,repeat:${reps(Math.max(0, ctx.L - 1.5 * k), 1.24)}},${at(1.5)});` : "",
    shown.length > 3 ? `tl.fromTo(".${id}-a3",{scale:0.9},{scale:1,duration:0.55,ease:"sine.inOut",transformOrigin:"50% 50%",yoyo:true,repeat:${reps(Math.max(0, ctx.L - 1.5 * k), 1.1)}},${at(1.5)});` : "",
    `tl.fromTo(".${id}-sect",{opacity:0},{opacity:1,duration:${du(0.4)},ease:"none"},${at(1.75)});`,
    asset ? `tl.fromTo(".${id}-panel",{clipPath:"inset(0% 100% 0% 0%)"},{clipPath:"inset(0% 0% 0% 0%)",duration:${du(0.5)},ease:"${DRAW}"},${at(1.85)});` : "",
    ...camera(id, k, ctx.T, { s: 1.07, x: 540, y: 1080, i0: 1.15, i1: 1.7, o0: 3.4, o1: 4.2 }, ctx.L),
  ].filter(Boolean);
  return { html, s };
}

// ══════════════════════════════════════════════════════════════════════════════
// SCENE 5 — BENEFITS
// Two comparison bars drawn TO SCALE from the scene's own two figures, then counting
// figures on the grid, then a drawn series.
//
// EVERY NUMBER HERE IS THE SCRIPT'S. The reference hardcodes "21 DAYS -> 12 MINUTES", three
// stats and a seven-point curve. None of that can be invented for a customer's film, so each
// device is GATED: two figures or no bars, three figures or no series. When a device is
// withheld the space goes to the ones that remain — the layout closes, it does not gap.
// ══════════════════════════════════════════════════════════════════════════════
function sBenefits(scene, ctx, sceneAssets) {
  const { id, th, k, at, du } = ctx;
  const head = scene.headline || scene.title || "";
  const hf = fitLines(head, GW, U(90), 2);
  const nums = numbersIn(scene);
  const asset = (sceneAssets || [])[0] || null;

  // TWO BARS ONLY WHEN THE COPY ACTUALLY MAKES A COMPARISON.
  //
  // The reference's bars are a hand-authored before/after ("21 DAYS / BECOMES 12 MIN"), and
  // drawing them from "the first two numbers in the beat" is not the same thing: it happily
  // set 92% against 40 sources at a 1:2.3 scale, which compares nothing and states a ratio
  // that means nothing. So the device is gated on the WRITER having made the comparison —
  // a transition word in the beat's own copy — and otherwise the figures simply stand.
  const comparative = /\b(becomes?|from|to|versus|vs\.?|instead of|down to|up from|was|now|before|after|cut to|reduced to)\b/i
    .test(`${scene.headline || ""} ${scene.emphasis || ""} ${scene.subtext || ""}`);
  const pair = comparative && nums.length >= 2 && nums[0].n > 0 && nums[1].n > 0 ? [nums[0], nums[1]] : null;
  const big = pair ? Math.max(pair[0].n, pair[1].n) : 0;
  const wideFrac = 1;
  const thinFrac = pair ? Math.max(0.03, Math.min(pair[0].n, pair[1].n) / big) : 0.03;
  const hi = pair ? (pair[0].n >= pair[1].n ? pair[0] : pair[1]) : null;
  const lo = pair ? (pair[0].n >= pair[1].n ? pair[1] : pair[0]) : null;
  const stats = nums.slice(0, 3);

  // NO DRAWN SERIES. The reference closes this scene on a seven-point growth curve, and
  // there is no honest way to derive one from a generated script: a marketing beat's figures
  // are unrelated quantities, not observations over time, so joining them with a line draws
  // a trend nobody claimed. The tail takes a panel instead — the pack's own furniture when
  // no picture reached it.
  let y = U(452);
  const barsTop = y;
  if (pair) y += U(346);
  const statsRuleY = y, statsY = y + U(40);
  y = statsY + (stats.length ? U(200) : 0);
  const tailY = y + U(40);
  const tailH = Math.max(U(260), U(1690) - tailY);

  const html = open(ctx, `
    <div style="position:absolute;left:${M}cqw;top:${r(U(190))}cqw;width:${GW}cqw;">
      ${hf.lines.map((l, j) => `<div class="kw gd-mask" style="height:${r(hf.size * 1.11)}cqw;">
        <div class="kwi ${id}-l" style="font-size:${r(hf.size)}cqw;line-height:${r(hf.size * 1.11)}cqw;color:${j ? th.accent : th.ink};">${esc(l)}</div>
      </div>`).join("")}
    </div>

    ${pair ? `
    <div class="${id}-lab1 gd-kicker" style="position:absolute;left:${M}cqw;top:${r(barsTop)}cqw;color:${rgba(th.ink, 0.6)};opacity:0;font-size:${r(U(20))}cqw;">${esc(ctx.S.compare)}</div>
    <div class="${id}-b1" style="position:absolute;left:${M}cqw;top:${r(barsTop + U(34))}cqw;width:${r(GW * wideFrac)}cqw;height:${r(U(78))}cqw;background:${rgba(th.ink, 0.86)};transform:scaleX(0);transform-origin:left center;"></div>
    <div class="${id}-v1" style="position:absolute;left:${r(M + U(24))}cqw;top:${r(barsTop + U(54))}cqw;font-family:${th.displayStack};font-weight:800;font-size:${r(U(38))}cqw;letter-spacing:-0.02em;color:${th.paper};opacity:0;">${esc(hi.value + hi.suffix)}</div>
    <div class="${id}-lab2 gd-kicker" style="position:absolute;left:${M}cqw;top:${r(barsTop + U(154))}cqw;color:${th.accent};opacity:0;font-size:${r(U(20))}cqw;">${esc(ctx.S.figure)}</div>
    <div class="${id}-b2" style="position:absolute;left:${M}cqw;top:${r(barsTop + U(188))}cqw;width:${r(Math.max(U(26), GW * thinFrac))}cqw;height:${r(U(78))}cqw;background:${th.accent};transform:scaleX(0);transform-origin:left center;"></div>
    <div class="${id}-r2" style="position:absolute;left:${r(M + Math.max(U(26), GW * thinFrac))}cqw;top:${r(barsTop + U(226))}cqw;width:${r(U(210))}cqw;height:${RULE}cqw;background:${th.accent};transform:scaleX(0);transform-origin:left center;"></div>
    <div class="${id}-v2" style="position:absolute;left:${r(M + Math.max(U(26), GW * thinFrac) + U(226))}cqw;top:${r(barsTop + U(200))}cqw;font-family:${th.displayStack};font-weight:800;font-size:${r(U(38))}cqw;letter-spacing:-0.02em;color:${th.ink};opacity:0;">${esc(lo.value + lo.suffix)}</div>
    <div class="${id}-scale gd-kicker" style="position:absolute;left:${M}cqw;top:${r(barsTop + U(294))}cqw;color:${rgba(th.ink, 0.45)};opacity:0;font-size:${r(U(18))}cqw;">${esc(ctx.S.compare)} · 1:${r(Math.round((big / Math.max(1, Math.min(pair[0].n, pair[1].n))) * 10) / 10)}</div>` : ""}

    <div class="${id}-hr" style="position:absolute;left:${M}cqw;top:${r(statsRuleY)}cqw;width:${GW}cqw;height:${RULE}cqw;background:${th.ink};transform:scaleX(0);transform-origin:left center;"></div>
    ${stats.map((st, j) => `<div class="${id}-st" style="position:absolute;left:${cx(j * 2)}cqw;top:${r(statsY)}cqw;width:${r(COL * 2 - U(24))}cqw;opacity:0;">
      <div style="font-family:${th.displayStack};font-weight:800;font-size:${r(fitOne(st.value + st.suffix, COL * 2 - U(24), U(88)))}cqw;line-height:1;letter-spacing:-0.045em;color:${th.ink};">${esc(st.value + st.suffix)}</div>
      <div style="margin-top:${r(U(16))}cqw;font-family:${th.monoStack};font-weight:600;font-size:${r(U(19))}cqw;line-height:1.3;letter-spacing:0.16em;text-transform:uppercase;color:${rgba(th.ink, 0.6)};">${esc(ctx.S.figure)} ${pad2(j + 1)}</div>
    </div>`).join("")}

    <div class="${id}-hr2" style="position:absolute;left:${M}cqw;top:${r(tailY - U(40))}cqw;width:${GW}cqw;height:${RULE}cqw;background:${th.ink};transform:scaleX(0);transform-origin:left center;"></div>
    ${sectionLabel(id, th, `${pad2(stats.length)} ${ctx.S.figure}`, M, tailY - U(16), GW)}
    ${(() => {
      // fill: the tail plate closes the figure scene with the stats stacked ABOVE it, so the
      // column beside it is bare. This is the scene QA blocked for "massive empty space on the
      // right side of the canvas" — measured at 40.73 of 88.15cqw.
      const b = panelBox(asset, GW, plateRoom(tailY + U(30)), { chromeH: U(46), fill: true });
      return fixedPanel(id, th, { asset, x: M, y: tailY + U(30), w: b.w, h: b.h, slot: ctx.i + 1, note: ctx.S.proof, focus: "center center", label: ctx.S.proof });
    })()}`);

  const s = [
    `tl.set("#${id}",{opacity:1},${r(ctx.T)});`,
    `tl.fromTo(".${id}-l",{yPercent:110},{yPercent:0,duration:${du(0.5)},ease:"${ENTER}",stagger:${du(0.12)}},${at(0.08)});`,
    pair ? `tl.fromTo(".${id}-lab1",{opacity:0},{opacity:1,duration:${du(0.35)},ease:"none"},${at(0.42)});` : "",
    pair ? `tl.fromTo(".${id}-b1",{scaleX:0},{scaleX:1,duration:${du(0.6)},ease:"${DRAW}",transformOrigin:"left center"},${at(0.42)});` : "",
    pair ? `tl.fromTo(".${id}-v1",{opacity:0},{opacity:1,duration:${du(0.35)},ease:"${ENTER}"},${at(0.78)});` : "",
    pair ? `tl.fromTo(".${id}-lab2",{opacity:0},{opacity:1,duration:${du(0.35)},ease:"none"},${at(1.15)});` : "",
    pair ? `tl.fromTo(".${id}-b2",{scaleX:0},{scaleX:1,duration:${du(0.45)},ease:"${DRAW}",transformOrigin:"left center"},${at(1.15)});` : "",
    pair ? `tl.fromTo(".${id}-r2",{scaleX:0},{scaleX:1,duration:${du(0.35)},ease:"${DRAW}",transformOrigin:"left center"},${at(1.45)});` : "",
    pair ? `tl.fromTo(".${id}-v2",{opacity:0},{opacity:1,duration:${du(0.35)},ease:"${ENTER}"},${at(1.6)});` : "",
    pair ? `tl.fromTo(".${id}-scale",{opacity:0},{opacity:1,duration:${du(0.4)},ease:"none"},${at(1.8)});` : "",
    `tl.fromTo(".${id}-hr",{scaleX:0},{scaleX:1,duration:${du(0.45)},ease:"${DRAW}",transformOrigin:"left center"},${at(1.9)});`,
    stats.length ? `tl.fromTo(".${id}-st",{opacity:0,y:"2cqw"},{opacity:1,y:0,duration:${du(0.4)},ease:"${ENTER}",stagger:${du(0.16)}},${at(2.0)});` : "",
    `tl.fromTo(".${id}-hr2",{scaleX:0},{scaleX:1,duration:${du(0.45)},ease:"${DRAW}",transformOrigin:"left center"},${at(2.25)});`,
    `tl.fromTo(".${id}-sect",{opacity:0},{opacity:1,duration:${du(0.35)},ease:"none"},${at(2.28)});`,
    asset ? `tl.fromTo(".${id}-panel",{clipPath:"inset(0% 100% 0% 0%)"},{clipPath:"inset(0% 0% 0% 0%)",duration:${du(0.55)},ease:"${DRAW}"},${at(2.4)});` : "",
    asset ? `tl.fromTo(".${id}-zoom",{scale:1},{scale:1.05,duration:${r(Math.max(1.0, ctx.L - 2.6 * k))},ease:"${DRAW}",transformOrigin:"50% 50%"},${at(2.6)});` : "",
    ...camera(id, k, ctx.T, { s: 1.06, x: 540, y: 1330, i0: 2.6, i1: 3.1, o0: 4.5, o1: 5.2 }, ctx.L),
  ].filter(Boolean);
  return { html, s };
}

// ══════════════════════════════════════════════════════════════════════════════
// SCENE 6 — PROOF
// The masked pull-quote, an attribution with a portrait, the marker row, a wide panel, and
// a counting metric on an accent block — which is the shape scene 7 opens on.
//
// The reference's five-star rating and "1,842 REVIEWS" are GONE. A rating a customer never
// gave is a fabricated review, not a design device; the marker row takes the same position
// and weight and states something true (this scene's place in the film).
// ══════════════════════════════════════════════════════════════════════════════
function sProof(scene, ctx, sceneAssets) {
  const { id, th, k, at, du } = ctx;
  const fg = onAccent(th);
  const shots = sceneAssets || [];
  // Typographic quotes, because this layout IS the pull-quote and the reference sets them.
  // Punctuation around the script's own line — not added content.
  const raw = String(scene.headline || scene.title || "").trim().replace(/^[\u201C\u201D\u2018\u2019"']+|[\u201C\u201D\u2018\u2019"']+$/g, "");
  const quote = raw ? `\u201C${raw}\u201D` : "";
  const attrib = String(scene.subtext || "").trim();
  const who = attrib ? splitTitleBody(attrib, 3) : { title: "", body: "" };
  const metric = statToken(scene);
  // BOTH assigned shots must be drawn. Picking the portrait by a ratio WINDOW leaves a scene
  // holding two wide captures with nowhere to put the second — placed, never rendered. So the
  // squarest of the two takes the attribution frame and the other takes the wall; with only
  // one shot there is no attribution frame to fill and it goes to the wall.
  const squarest = shots.slice().sort((a, b) => Math.abs(ratioOf(a) - 1) - Math.abs(ratioOf(b) - 1))[0] || null;
  const portrait = shots.length >= 2 ? squarest : null;
  const wall = shots.find((a) => a !== portrait) || null;
  // Sized AFTER the shots are known: a picture buys its room out of the quote.
  const qf = fitLines(quote, GW, U(74), wall ? 2 : 3);

  const qTop = U(250), qH = qf.lines.length * qf.size * 1.24;
  const ruleY = qTop + qH + U(40);
  const attY = ruleY + U(46);
  const markY = attY + (attrib || portrait ? U(150) : U(16));
  const showMarks = !wall;   // the plate earns that row back
  const wallRuleY = markY + (showMarks ? U(96) : U(10));
  const wallY = wallRuleY + U(62);
  // The metric block is a fixed-height footer pinned to the bottom of the band, so the plate
  // gets everything between the section rule and it — rather than being squeezed into what
  // the reference's absolute 1440px start happened to leave.
  const metH = metric ? U(260) : 0;
  const wallAvail = plateRoom(wallY, metric ? metH + U(26) : 0);
  // fill: the wall plate sits above a pinned metric footer, with nothing to either side.
  const wallBox = panelBox(wall, GW, wallAvail, { chromeH: U(46), fill: true });
  const wallH = wallBox.h;
  const metY = wallY + wallH + U(26);

  const html = open(ctx, `
    <div class="${id}-kick gd-kicker" style="position:absolute;left:${M}cqw;top:${r(U(192))}cqw;color:${th.accent};opacity:0;">${esc(ctx.S.record)}</div>
    <div style="position:absolute;left:${M}cqw;top:${r(qTop)}cqw;width:${GW}cqw;color:${th.ink};">
      ${maskLines(`${id}-q`, qf.lines, qf.size, 1.24)}
    </div>
    <div class="${id}-hr" style="position:absolute;left:${M}cqw;top:${r(ruleY)}cqw;width:${GW}cqw;height:${RULE}cqw;background:${th.ink};transform:scaleX(0);transform-origin:left center;"></div>

    ${attrib || portrait ? `<div class="${id}-att" style="position:absolute;left:${M}cqw;top:${r(attY)}cqw;width:${GW}cqw;display:flex;align-items:center;gap:${r(U(26))}cqw;opacity:0;">
      ${portrait ? `<div style="position:relative;width:${r(U(112))}cqw;height:${r(U(112))}cqw;border:${RULE}cqw solid ${th.ink};overflow:hidden;flex:0 0 auto;">
        <img src="${esc(portrait.path)}" alt="${esc(portrait.alt || "")}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:${cropFocus(portrait, 1, 1, "center center")};background:${th.paper};filter:${assetFilter(portrait)};">
      </div>` : ""}
      ${attrib ? `<div>
        <div style="font-family:${th.displayStack};font-weight:700;font-size:${r(fitOne(who.title, GW - U(180), U(36)))}cqw;line-height:1.1;letter-spacing:-0.02em;color:${th.ink};">${esc(who.title)}</div>
        ${who.body ? `<div style="margin-top:${r(U(10))}cqw;font-family:${th.monoStack};font-weight:600;font-size:${r(U(20))}cqw;letter-spacing:0.18em;text-transform:uppercase;color:${rgba(th.ink, 0.6)};">${esc(who.body)}</div>` : ""}
      </div>` : ""}
    </div>` : ""}

    ${showMarks ? markerRow(id, th, ctx.total, ctx.i, M, markY, U(44)) : ""}

    <div class="${id}-hr2" style="position:absolute;left:${M}cqw;top:${r(wallRuleY)}cqw;width:${GW}cqw;height:${RULE}cqw;background:${th.ink};transform:scaleX(0);transform-origin:left center;"></div>
    ${sectionLabel(id, th, `${ctx.S.source} · ${pad2(ctx.i + 1)} / ${pad2(ctx.total)}`, M, wallRuleY + U(24), GW)}
    ${fixedPanel(id, th, { asset: wall, x: M, y: wallY, w: wallBox.w, h: wallBox.h, slot: ctx.i + 1, note: ctx.S.proof, focus: "center center", label: ctx.S.proof })}

    ${metric ? `
    <div class="${id}-met" style="position:absolute;left:${M}cqw;top:${r(metY)}cqw;width:${GW}cqw;height:${r(metH)}cqw;background:${th.accent};transform:scaleX(0);transform-origin:left center;"></div>
    <div style="position:absolute;left:${M}cqw;top:${r(metY)}cqw;width:${GW}cqw;height:${r(metH)}cqw;overflow:hidden;">
      <div class="${id}-mlab gd-kicker" style="position:absolute;left:${r(U(32))}cqw;top:${r(U(44))}cqw;color:${rgba(fg, 0.8)};opacity:0;font-size:${r(U(20))}cqw;">${esc(ctx.S.figure)}</div>
      <div class="${id}-mval" style="position:absolute;left:${r(U(32))}cqw;top:${r(U(96))}cqw;font-family:${th.displayStack};font-weight:800;font-size:${r(fitOne(metric, GW - U(64), U(150)))}cqw;line-height:1;letter-spacing:-0.05em;text-transform:uppercase;color:${fg};opacity:0;">${esc(metric)}</div>
    </div>` : ""}`);

  const s = [
    `tl.set("#${id}",{opacity:1},${r(ctx.T)});`,
    `tl.fromTo(".${id}-kick",{opacity:0,x:"-1.2cqw"},{opacity:1,x:0,duration:${du(0.35)},ease:"${ENTER}"},${at(0.05)});`,
    `tl.fromTo(".${id}-q",{yPercent:110},{yPercent:0,duration:${du(0.6)},ease:"${ENTER}",stagger:${du(0.14)}},${at(0.15)});`,
    `tl.fromTo(".${id}-hr",{scaleX:0},{scaleX:1,duration:${du(0.5)},ease:"${DRAW}",transformOrigin:"left center"},${at(0.7)});`,
    attrib || portrait ? `tl.fromTo(".${id}-att",{opacity:0,y:"1.6cqw"},{opacity:1,y:0,duration:${du(0.45)},ease:"${ENTER}"},${at(0.75)});` : "",
    showMarks ? `tl.fromTo(".${id}-mk",{scale:0},{scale:1,duration:${du(0.35)},ease:"${POP}",stagger:${du(0.07)}},${at(1.0)});` : "",
    `tl.fromTo(".${id}-hr2",{scaleX:0},{scaleX:1,duration:${du(0.45)},ease:"${DRAW}",transformOrigin:"left center"},${at(1.7)});`,
    `tl.fromTo(".${id}-sect",{opacity:0},{opacity:1,duration:${du(0.35)},ease:"none"},${at(1.8)});`,
    wall ? `tl.fromTo(".${id}-panel",{clipPath:"inset(0% 100% 0% 0%)"},{clipPath:"inset(0% 0% 0% 0%)",duration:${du(0.55)},ease:"${DRAW}"},${at(1.95)});` : "",
    wall ? `tl.fromTo(".${id}-zoom",{scale:1},{scale:1.04,duration:${r(Math.max(1.0, ctx.L - 2.2 * k))},ease:"${DRAW}",transformOrigin:"50% 50%"},${at(2.2)});` : "",
    metric ? `tl.fromTo(".${id}-met",{scaleX:0},{scaleX:1,duration:${du(0.5)},ease:"${DRAW}",transformOrigin:"left center"},${at(2.5)});` : "",
    metric ? `tl.fromTo(".${id}-mlab",{opacity:0},{opacity:1,duration:${du(0.35)},ease:"none"},${at(2.78)});` : "",
    metric ? `tl.fromTo(".${id}-mval",{opacity:0,y:"2cqw"},{opacity:1,y:0,duration:${du(0.4)},ease:"${ENTER}"},${at(2.82)});` : "",
    ...camera(id, k, ctx.T, { s: 1.055, x: 540, y: 1590, i0: 2.6, i1: 3.05, o0: 4.1, o1: 4.7 }, ctx.L),
  ].filter(Boolean);
  return { html, s, carry: metric ? { kind: "metric", y: metY, h: metH } : null };
}

// ══════════════════════════════════════════════════════════════════════════════
// SCENE 7 — CALL TO ACTION
// The accent grows OUT of scene 6's metric block to full bleed, the grid persists in
// reverse, and the sheet signs itself: wordmark, rule, sub-head, an action block with a
// travelling arrow, the address, and the closing tick row.
// ══════════════════════════════════════════════════════════════════════════════
function sCall(scene, ctx, logo) {
  const { id, th, k, at, du } = ctx;
  const fg = onAccent(th);
  const word = String(ctx.brand || scene.title || "").slice(0, 26);
  const line2 = String(scene.headline || scene.emphasis || "").trim();
  const sub = String(scene.subtext || "").trim();
  const url = domainOf(scene.subtext) || domainOf(scene.emphasis) || domainOf(ctx.title);
  // The address is printed on its own line below, so leaving it inside the sub-head prints
  // it twice — which reads as a typo, not a design.
  // Drop the address out of the sub-head word by word — it is printed on its own line
  // below, and leaving it in prints it twice, which reads as a typo rather than a design.
  // Word-wise, not by regex, so a URL containing regex metacharacters needs no escaping.
  const subNoUrl = url
    ? wordsOf(sub).filter((w) => !w.toLowerCase().replace(/^https?:\/\//, "").replace(/[.,;:]+$/, "").startsWith(url.toLowerCase())).join(" ").trim()
    : sub;
  const tagline = subNoUrl && subNoUrl !== url ? subNoUrl.slice(0, 96) : "";
  const action = String(scene.emphasis || "").trim().slice(0, 18);
  const c0 = ctx.carryIn && ctx.carryIn.kind === "metric" ? ctx.carryIn : { y: U(1440), h: U(300) };

  const wSize = fitOne(word, SAFE_GW, U(152));
  const l2 = line2 ? fitLines(line2, SAFE_GW, U(104), 2) : { lines: [], size: U(104) };
  // THE MARK RESERVES ITS OWN ROOM. Both blocks were pinned to constants, so a logo tall
  // enough to reach past 620px sat on top of the wordmark — a delivered film was flagged for
  // the badge colliding with the headline. The headline now starts BELOW the mark's real
  // extent plus an explicit gap, and the mark is only drawn when there is room for it.
  const MARK_CQW = U(150), MARK_GAP = U(46);
  const markTop = U(470);
  const hasMark = !!(logo && logo.path);
  const headTop = Math.max(U(620), hasMark ? markTop + MARK_CQW + MARK_GAP : 0);
  const headH = wSize * 1.1 + l2.lines.length * l2.size * 1.12;
  const ruleY = headTop + headH + U(30);
  const subY = ruleY + U(46);
  const btnY = U(1180), btnW = U(620), btnH = U(132);

  // Height-capped and given its own row, so `headTop` above can reserve exactly this much.
  const mark = hasMark
    ? `<div class="${id}-mark" style="position:absolute;left:${M}cqw;top:${r(markTop)}cqw;height:${r(MARK_CQW)}cqw;display:flex;align-items:center;opacity:0;">${logoMark(logo, { sizeCqw: 14, ground: th.accent, glow: null, escape: esc })}</div>`
    : "";

  // The closing field is FULL BLEED, so it sits outside the band clip: at t=0 it is exactly
  // scene 6's metric block, then it grows to the whole frame.
  // PARKED FULL BLEED and CLIPPED back to scene 6's metric block, rather than parked at the
  // block and grown on left/right/top/bottom. Inset properties re-flow the layer every frame and
  // snap to integer device pixels; clip-path is composited and interpolates sub-pixel.
  ctx.bleedInset = `inset(${r(c0.y)}cqw ${M}cqw ${r(100 * (STAGE_H / STAGE_W) - (c0.y + c0.h))}cqw ${M}cqw)`;
  ctx.bleed = `<div class="${id}-bleed" style="position:absolute;inset:0;clip-path:${ctx.bleedInset};background:${th.accent};"></div>`;

  const html = open(ctx, `
    ${mark}
    <div style="position:absolute;left:${M}cqw;top:${r(headTop)}cqw;width:${GW}cqw;color:${fg};">
      <div class="kw gd-mask" style="height:${r(wSize * 1.1)}cqw;">
        <div class="kwi ${id}-w" style="font-size:${r(wSize)}cqw;line-height:${r(wSize * 1.1)}cqw;letter-spacing:-0.02em;">${esc(word)}</div>
      </div>
      ${maskLines(`${id}-w`, l2.lines, l2.size, 1.12)}
    </div>
    <div class="${id}-hr" style="position:absolute;left:${M}cqw;top:${r(ruleY)}cqw;width:${GW}cqw;height:${r(U(4))}cqw;background:${rgba(fg, 0.55)};transform:scaleX(0);transform-origin:left center;"></div>
    ${tagline ? `<div class="${id}-sub" style="position:absolute;left:${M}cqw;top:${r(subY)}cqw;width:${r(GW - U(120))}cqw;font-family:${th.displayStack};font-weight:400;font-size:${r(U(40))}cqw;line-height:1.35;color:${rgba(fg, 0.9)};opacity:0;">${esc(tagline)}</div>` : ""}

    ${action ? `
    <div class="${id}-btn" style="position:absolute;left:${M}cqw;top:${r(btnY)}cqw;width:${r(btnW)}cqw;height:${r(btnH)}cqw;background:${fg};transform:scaleX(0);transform-origin:left center;"></div>
    <div class="${id}-btxt" style="position:absolute;left:${M}cqw;top:${r(btnY)}cqw;width:${r(btnW)}cqw;height:${r(btnH)}cqw;overflow:hidden;opacity:0;">
      <div style="position:absolute;left:${r(U(30))}cqw;top:${r(U(44))}cqw;font-family:${th.displayStack};font-weight:800;font-size:${r(fitOne(action, btnW - U(200), U(44)))}cqw;letter-spacing:-0.02em;color:${th.accent};text-transform:uppercase;">${esc(action)}</div>
      <div class="${id}-arr" style="position:absolute;left:${r(U(470))}cqw;top:${r(U(52))}cqw;width:${r(U(70))}cqw;height:${r(U(6))}cqw;background:${th.accent};"></div>
      <div class="${id}-arr" style="position:absolute;left:${r(U(508))}cqw;top:${r(U(34))}cqw;width:${r(U(42))}cqw;height:${r(U(42))}cqw;border-top:${r(U(6))}cqw solid ${th.accent};border-right:${r(U(6))}cqw solid ${th.accent};transform:rotate(45deg);"></div>
    </div>` : ""}

    ${url ? `<div class="${id}-url" style="position:absolute;left:${M}cqw;top:${r(U(1370))}cqw;font-family:${th.displayStack};font-weight:800;font-size:${r(fitOne(url, SAFE_GW, U(58)))}cqw;letter-spacing:-0.02em;color:${fg};opacity:0;">${esc(url)}</div>` : ""}
    <div class="${id}-foot gd-kicker" style="position:absolute;left:${M}cqw;top:${r(U(1460))}cqw;width:${GW}cqw;color:${rgba(fg, 0.75)};opacity:0;font-size:${r(U(20))}cqw;">${esc(ctx.S.runtime)} ${esc(ctx.runtime)} · ${pad2(ctx.total)} ${esc(ctx.S.scenes)}</div>

    ${[0, 1, 2, 3, 4, 5].map((j) => `<div class="${id}-tk" style="position:absolute;left:${r(cx(j) + U(4))}cqw;top:${r(U(1560))}cqw;width:${r(U(30))}cqw;height:${r(U(30))}cqw;background:${fg};"></div>`).join("")}
    <div class="${id}-bsq" style="position:absolute;right:${M}cqw;top:${r(U(1548))}cqw;width:${r(U(120))}cqw;height:${r(U(120))}cqw;border:${r(U(4))}cqw solid ${rgba(fg, 0.9)};"></div>`);

  const s = [
    `tl.set("#${id}",{opacity:1},${r(ctx.T)});`,
    `tl.fromTo(".${id}-bleed",{clipPath:"${ctx.bleedInset}"},{clipPath:"inset(0cqw 0cqw 0cqw 0cqw)",duration:${du(0.6)},ease:"${DRAW}"},${at(0.04)});`,
    mark ? `tl.fromTo(".${id}-mark",{opacity:0,y:"2cqw"},{opacity:1,y:0,duration:${du(0.5)},ease:"${ENTER}"},${at(0.42)});` : "",
    `tl.fromTo(".${id}-w",{yPercent:112},{yPercent:0,duration:${du(0.5)},ease:"${ENTER}",stagger:${du(0.13)}},${at(0.55)});`,
    `tl.fromTo(".${id}-hr",{scaleX:0},{scaleX:1,duration:${du(0.5)},ease:"${DRAW}",transformOrigin:"left center"},${at(0.92)});`,
    tagline ? `tl.fromTo(".${id}-sub",{opacity:0,y:"1.2cqw"},{opacity:1,y:0,duration:${du(0.45)},ease:"${ENTER}"},${at(1.05)});` : "",
    action ? `tl.fromTo(".${id}-btn",{scaleX:0},{scaleX:1,duration:${du(0.45)},ease:"${DRAW}",transformOrigin:"left center"},${at(1.28)});` : "",
    action ? `tl.fromTo(".${id}-btxt",{opacity:0},{opacity:1,duration:${du(0.3)},ease:"none"},${at(1.5)});` : "",
    action ? `tl.fromTo(".${id}-arr",{x:0,opacity:1},{x:"${r(U(40))}cqw",opacity:0.3,duration:1.6,ease:"none",repeat:${reps(Math.max(0, ctx.L - 1.6 * k), 1.6)}},${at(1.6)});` : "",
    url ? `tl.fromTo(".${id}-url",{opacity:0,y:"1.4cqw"},{opacity:1,y:0,duration:${du(0.4)},ease:"${ENTER}"},${at(1.68)});` : "",
    `tl.fromTo(".${id}-foot",{opacity:0},{opacity:1,duration:${du(0.4)},ease:"none"},${at(1.85)});`,
    `tl.fromTo(".${id}-tk",{scale:0},{scale:1,duration:${du(0.4)},ease:"${POP}",stagger:${du(0.06)}},${at(2.0)});`,
    `tl.fromTo(".${id}-bsq",{scale:0,rotation:45},{scale:1,rotation:${r(45 + 2.25 * 8)},duration:${du(0.5)},ease:"${POP}"},${at(2.25)});`,
    `tl.to(".${id}-bsq",{rotation:${r(45 + Math.max(8, ctx.L * 8))},duration:${r(Math.max(0.4, ctx.L - 2.75 * k))},ease:"none"},${at(2.75)});`,
    ...camera(id, k, ctx.T, { s: 1.07, x: 540, y: 1246, i0: 1.5, i1: 1.9, o0: 2.7, o1: 3.3 }, ctx.L),
  ].filter(Boolean);
  return { html, s };
}

// ---- the spine ---------------------------------------------------------------
// SEVEN NAMED SCENES, IN ORDER. The reference's SCENE_MAP is a fixed sequence and this is
// its port: the first beat is always the hook, the last always the call, and the middle
// beats walk the five middle layouts in their authored order.
//
// A layout is SKIPPED, never faked, when the beat cannot carry it — `benefits` without a
// number would draw bars from nothing, and `problem` without a list would print an empty
// index. The cursor walks forward either way, so scene ORDER is preserved: a film may show
// four of the five middle scenes, never a reshuffle.
const BUILDERS = { hook: sHook, problem: sProblem, solution: sSolution, features: sFeatures, benefits: sBenefits, proof: sProof, call: sCall };
const MIDDLE = ["problem", "solution", "features", "benefits", "proof"];

// HOW MANY PICTURES THE LAYOUT WILL ACTUALLY DRAW — not how many it could take.
//
// `benefits` is the trap: it draws a panel ONLY when it has too few figures for the series,
// so a flat capacity of 1 hands it a shot that the series then paints over. That is an asset
// placed and never drawn, which is exactly the defect `test:portrait` counts as a dropped
// instance (and which this program already shipped once on slab-stage).
// THE SHAPE EACH SLOT WANTS, in the order the layout draws them. Ratio matters as much as
// rank here: the hero box is 1.52:1, and dropping a 0.31:1 capture into it crops away four
// fifths of the picture and prints "0.31:1" on the spec bar as evidence.
const SLOT_SHAPES = {
  hook: [1.52],                 // 952 x 626 under the bar
  solution: [1.83, 0.5625],     // the wide panel, then the device screen
  features: [4.76],             // the strip
  benefits: [2.27],
  proof: [1.0, 2.27],           // the attribution frame, then the wall
  problem: [], call: [],
};

function slotsFor(role, scene) {
  if (role === "hook") return 1;
  if (role === "solution") return 2;
  if (role === "features") return 1;
  if (role === "benefits") return 1;   // the tail panel, always drawn (the series is gone)
  if (role === "proof") return 2;
  return 0;   // problem and call draw no panel
}

function canCarry(role, scene, hasAsset) {
  const list = bullets(scene, 4).length;
  if (role === "problem") return list >= 2;
  if (role === "features") return list >= 2;
  if (role === "benefits") return numbersIn(scene).length >= 2;
  if (role === "solution") return hasAsset || !!domainOf(scene.subtext) || !!domainOf(scene.emphasis) || list >= 1;
  if (role === "proof") return wordsOf(scene.headline || scene.title || "").length >= 3;
  return true;
}
function assignRoles(scenes, hasAssetAt) {
  const n = scenes.length;
  if (n === 1) return ["hook"];
  const roles = new Array(n).fill(null);
  roles[0] = "hook";
  roles[n - 1] = "call";
  let cur = 0;
  for (let i = 1; i < n - 1; i++) {
    let pick = null;
    for (let step = 0; step < MIDDLE.length; step++) {
      const cand = MIDDLE[(cur + step) % MIDDLE.length];
      if (canCarry(cand, scenes[i], hasAssetAt(i))) { pick = cand; cur = (cur + step + 1) % MIDDLE.length; break; }
    }
    // Nothing fit: take the next layout anyway. `proof` degrades most gracefully — it needs
    // only a headline, which every beat has.
    if (!pick) { pick = "proof"; cur = (cur + 1) % MIDDLE.length; }
    roles[i] = pick;
  }
  return roles;
}

// ---- style -------------------------------------------------------------------
function styleBlock(th, portrait) {
  return `${th.fontFace}
  * { box-sizing:border-box; margin:0; padding:0; }
  html, body { width:100%; height:100%; overflow:hidden; background:${th.paper}; }
  #root { position:relative; overflow:hidden; isolation:isolate; background:${th.paper}; container-type:size; color:${th.ink}; font-family:${th.displayStack}; }
  .clip { position:absolute; top:0; left:0; width:100%; height:100%; overflow:hidden; }
  .gd-scene { background:${th.paper}; }
  /* The ruled band IS the viewport: the clip window stays in stage coordinates on an
     untransformed parent while the children carry the drift and the camera push. */
  .gd-band { position:absolute; inset:0; overflow:hidden; clip-path:inset(${BAND}cqw 0 ${BAND}cqw 0); }
  .gd-drift { position:absolute; inset:0; will-change:transform; }
  .gd-cam { position:absolute; inset:0; will-change:transform; }
  .gd-chrome { position:absolute; inset:0; pointer-events:none; }
  .gd-rule-top { position:absolute; left:${M}cqw; right:${M}cqw; top:${BAND}cqw; height:${RULE}cqw; }
  .gd-prog { position:absolute; left:${M}cqw; width:${GW}cqw; top:${BAND}cqw; height:${RULE}cqw; transform:scaleX(0); transform-origin:left center; }
  .gd-rule-bot { position:absolute; left:${M}cqw; right:${M}cqw; bottom:${BAND}cqw; height:${RULE}cqw; }
  .gd-word { position:absolute; left:${M}cqw; top:${r(U(78))}cqw; display:flex; align-items:center; gap:${r(U(16))}cqw; font-family:${th.displayStack}; font-weight:800; font-size:${r(U(28))}cqw; letter-spacing:0.3em; text-transform:uppercase; }
  .gd-dia { width:${r(U(18))}cqw; height:${r(U(18))}cqw; display:inline-block; flex:0 0 auto; }
  .gd-head { position:absolute; left:${M}cqw; right:${M}cqw; top:${r(U(84))}cqw; text-align:right; font-family:${th.monoStack}; font-weight:600; font-size:${r(U(20))}cqw; letter-spacing:0.22em; text-transform:uppercase; }
  /* .kw / .kwi are the names caption_render.js's SHAPING_FIX targets — a non-Latin
     video-text language relies on the overflow being neutralised HERE. */
  .kw { display:block; overflow:hidden; }
  .gd-mask { display:block; overflow:hidden; }
  .kwi { display:block; font-family:${th.displayStack}; font-weight:800; letter-spacing:-0.035em; text-transform:uppercase; white-space:nowrap; will-change:transform; }
  .gd-kicker { display:inline-block; font-family:${th.monoStack}; font-weight:600; font-size:${r(U(22))}cqw; letter-spacing:0.28em; text-transform:uppercase; }
  .gd-sect { position:absolute; display:flex; align-items:center; gap:${r(U(16))}cqw; font-family:${th.monoStack}; font-weight:600; font-size:${r(U(19))}cqw; letter-spacing:0.24em; text-transform:uppercase; opacity:0; }
  .gd-sline { flex:1 1 auto; height:1px; }
  /* Asset panel — a bordered rectangle with a technical spec header. Zero radius, 2px rule. */
  .gd-panel { position:absolute; border:${RULE}cqw solid ${th.ink}; background:${th.paper}; overflow:hidden; will-change:transform,opacity; }
  .gd-bar { display:flex; align-items:center; justify-content:space-between; padding:0 ${r(U(14))}cqw; border-bottom:${RULE}cqw solid ${th.ink}; font-family:${th.monoStack}; font-weight:600; font-size:${r(U(18))}cqw; letter-spacing:0.2em; text-transform:uppercase; color:${th.ink}; background:${th.paper}; }
  /* THE CAPTION BELONGS IN THE BOTTOM MARGIN, NOT OVER THE SHEET. Centred 15% up, the pill
     sat on top of the spec cards, the strip panel and the tick row in turn. The reference
     prints it as plain type below the bottom rule, flush left on the margin — so there is
     nothing to occlude and nothing to un-Modernist. Its COLOUR is set per scene from the
     timeline, because the closing beat is a full-bleed accent field. */
  #caps { position:absolute; inset:0; display:flex; justify-content:flex-start; align-items:flex-end; padding:0 ${M}cqw ${portrait ? "2.4%" : "6%"}; z-index:60; pointer-events:none; }
  #cap-pill { max-width:${GW}cqw; height:fit-content; flex:0 0 auto; text-align:left; opacity:0; }
  #cap-text { font-family:${th.displayStack}; font-weight:600; font-size:${r(U(30))}cqw; line-height:1.28; letter-spacing:-0.01em; color:${th.ink}; }`;
}

// ---- MAIN --------------------------------------------------------------------
// IT CUTS. There is no crossfade and no transition overlay: a scene's clip ends exactly where
// the next begins. That is the reference's own `transition="cut"`, and it is only legible
// because the chrome is identical across the cut and the camera has settled before it.
function buildComposition({ storyboard, dims, framePack, captionCues, assets, brandSkin = null, localized = null, seedKey = null } = {}) {
  const th = gridTheme(brandSkin);
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
  const seed = seedFrom(`${seedKey || ""}|${title || (scenes[0] && scenes[0].headline) || "grid"}`);
  const runtime = `${Math.floor(D / 60)}:${pad2(Math.round(D % 60))}`;
  const filmUrl = scenes.map((sc) => domainOf(sc.subtext) || domainOf(sc.emphasis)).find(Boolean) || domainOf(title) || "";

  const logo = logoAssetOf(assets);
  const shots = (Array.isArray(assets) ? assets : []).filter(screenOk)
    .sort(admission.byDisplayRank);

  // Roles first, then assets — because how many pictures a scene can hold is a property of
  // the LAYOUT it was given, not of the beat. Assigning the other way round is what produced
  // the previous port's stranded shots (placed on a beat that draws no panel).
  const roles = assignRoles(scenes, () => shots.length > 0);
  const sceneIdOf = (i) => (scenes[i].id != null ? String(scenes[i].id) : `s${i + 1}`);
  const sceneShots = scenes.map(() => []);

  // SLOT BY SLOT, IN SCENE ORDER. Every drawable box is enumerated with the shape it wants,
  // then filled with the best remaining asset — where "best" blends the Creative Director's
  // rank, the asset's own sceneId hint, and how badly the picture would have to be cropped
  // to fill that box. Visiting slots in scene order keeps the opener's first pick, which is
  // what ranking alone used to guarantee; the fit term is what stops a phone screenshot
  // landing in a 1.52:1 hero frame while a matching capture sits two scenes away.
  // BREADTH BEFORE DEPTH. Slots are visited in RANK order — every scene's first box, in
  // scene order, before any scene's second. Walking scene by scene instead lets the solution
  // beat take two pictures while three later scenes get none, which is a film that front-
  // loads its imagery and then goes blank (and which the portrait guard fails on
  // `scenesWithAsset`). Within a rank, scene order still gives the opener first pick.
  const slots = [];
  const maxSlots = Math.max(0, ...roles.map((role, i) => slotsFor(role, scenes[i])));
  for (let rank = 0; rank < maxSlots; rank++) {
    roles.forEach((role, i) => {
      if (slotsFor(role, scenes[i]) <= rank) return;
      const shapes = SLOT_SHAPES[role] || [];
      slots.push({ i, target: shapes[rank] || shapes[0] || 1.5 });
    });
  }
  const taken = new Set();
  for (const slot of slots) {
    let pick = -1, bestScore = -Infinity;
    for (let a = 0; a < shots.length; a++) {
      if (taken.has(a)) continue;
      const ar = ratioOf(shots[a]) || slot.target;
      const misfit = Math.abs(Math.log(ar / slot.target));
      // The Creative Director's sceneId is a strong hint about RELEVANCE, so it outweighs a
      // mild shape mismatch — but not an extreme one, where honouring it would either crop
      // the picture to nothing or letterbox it into a slot another asset fills edge to edge.
      const hint = String(shots[a].sceneId != null ? shots[a].sceneId : "") === sceneIdOf(slot.i) ? 4 : 0;
      const score = (Number(shots[a].cdScore) || 0) + hint - 2.5 * misfit;
      if (score > bestScore) { bestScore = score; pick = a; }
    }
    if (pick < 0) break;   // out of pictures — remaining slots draw the sheet's furniture
    taken.add(pick);
    sceneShots[slot.i].push(shots[pick]);
  }

  const scriptStart = (i) => scenes.slice(0, i).reduce((a, x) => a + (Number(x.duration) || 0), 0);
  const bodyParts = [], sceneScripts = [];
  let carry = null;

  scenes.forEach((scene, i) => {
    const T = r(scene.start != null ? scene.start : scriptStart(i));
    const L = r(scene.duration || 5);
    const isLast = i === scenes.length - 1;
    const clipDur = isLast ? Math.max(0.1, D - T) : L;
    const role = roles[i] || "proof";
    // The authored beat, compressed only when the generated scene is shorter than it.
    const k = Math.min(1, L / REF_BEAT);
    const ctx = {
      id: `s${i + 1}`, T, L, clipDur, i, isLast, track: 2 + i, th, S, W, H, portrait, k,
      at: (sec) => r(T + sec * k),
      du: (sec) => r(Math.max(0.06, sec * k)),
      title, brand: (brand || String(scene.purpose || "") || "").toUpperCase().slice(0, 22) || "FILM",
      total: scenes.length, runtime, carryIn: carry, bleed: "", url: filmUrl, noBackdrop: role === "call",
    };
    ctx.cols = columnsFor(th, role === "call" ? rgba(onAccent(th), 0.25) : th.faint);
    ctx.chrome = chromeFor(ctx, th, scenes.length, role === "call" ? onAccent(th) : th.ink);
    const built = (BUILDERS[role] || sProof)(scene, ctx, role === "call" ? logo : sceneShots[i]);
    bodyParts.push(built.html);
    // The caption is ONE node for the whole film (seek-safe, and the single choke point
    // multilang injection targets), so its colour is switched on the timeline per scene —
    // the closing beat is a full-bleed accent field where ink would be unreadable.
    const capTint = role === "call" ? onAccent(th) : th.ink;
    sceneScripts.push([...built.s, ...chromeTweens(ctx, D), `tl.set("#cap-text",{color:"${capTint}"},${r(T)});`].filter(Boolean).join("\n  "));
    sceneScripts.push(`kill("#${ctx.id}",${r(T + clipDur)});`);
    carry = built.carry || null;
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
// Test seam: the spine's role assignment and the number extraction decide what a film looks
// like before a single tag is emitted, so both have to be measurable without rendering.
module.exports.__test = { assignRoles, canCarry, resolveBrandName, numbersIn, rowFigure, splitTitleBody, gridTheme, brandOf, posterLines, ratioLabel, isOwnAsset, iconFor, U, slotsFor, MIDDLE };
