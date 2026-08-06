// SHOWCASE — an annotated product-tour film, native GSAP + DOM.
//
// PROVENANCE. Ported from an imported OM/React template ("showcase-film.jsx", 1920x1080,
// SCENE_MAP = Intro/Tour/Detail/Mobile/Montage/Proof/CTA, transition="cut"). The reference's
// LAYOUT, RHYTHM and DEVICE VOCABULARY are reproduced scene for scene; none of its marketing
// copy is. Every string this file prints is either derived from the storyboard or is a
// neutral, localizable label on the film's own structure (see STRINGS).
//
// WHAT MAKES IT DIFFERENT. It is the library's first LANDSCAPE-authored pack and its most
// screenshot-hungry: ten image slots across seven beats, shown inside real device chrome
// (browser frame with a URL bar, phone frame with a notch) and annotated the way a product
// tour annotates — drawn curved arrows, numbered callout bubbles, a pulsing highlight box
// and a cursor that travels and clicks. Light, optimistic, high-key: near-white paper, five
// blurred colour blobs, a 52px grid, and paper planes crossing the sky.
//
// THE EMPTY-FRAME LAW. The reference draws a dashed "DROP IMAGE TO REPLACE" placeholder in
// any unfilled slot. That is right for an editor and wrong for a delivered film: this program
// has already had two designed empty states rejected by QA ("large red block dominates
// frame", then "placeholder number instead of visual media"). So a device frame is drawn ONLY
// around a real picture. Beats that cannot get one either fall back to a type-only layout
// that wants no frame (intro, tour) or are skipped entirely (detail, mobile, montage), and
// the montage re-lays its grid to the number of pictures it actually has — 6, 5, 4, 3 or 2 —
// rather than tiling six boxes and leaving four of them hollow.
//
// THE CAMERA NARROWS THE FRAME. `scam` scales its own layer to 1.03, so the usable width is
// 1/1.03 of the stage and every measured type run must divide by CAM_SAFE — the same law
// slab-stage was rebuilt around after a delivered film clipped its headline.
// ─────────────────────────────────────────────────────────────────────────────────────

const { fontFaceCss, isBundled } = require("../fonts/pack_fonts");
const { logoMark } = require("./logo_render");
const { resolveBrand } = require("./brand_kit");
const { GSAP_CDN, r, esc, hexToRgb, relLum, bullets, logoAssetOf, resolveBrandName } = require("./composer_kit");

const DISPLAY = "Space Grotesk";   // bundled — headlines, body, callouts, the CTA pill
const MONO = "JetBrains Mono";     // bundled — eyebrows, URL bar, stat labels, chrome

// ---- the sheet ---------------------------------------------------------------
const BG = "#EEF1F7";
const PANEL = "#FFFFFF";
const INK = "#131722";
const SUB = "#5B6472";
const LINE = "#D9DEE8";
const ACCENT = "#2F6BFF";

const STAGE_W = 1920;
const STAGE_H = 1080;
const U = (px) => Math.round((px / STAGE_W) * 10000) / 100;   // px -> cqw, 2dp
const VH = U(STAGE_H);                                        // 56.25cqw — the stage's height

// The reference beat. A generated scene shorter than this compresses the authored rhythm
// rather than truncating it; a longer one holds on the settled frame.
const REF_BEAT = 4.4;

// The camera scales its own layer to 1.03, so 3% of every edge is off-frame for the whole
// scene. Anything MEASURED (a fitted headline, a wrapped body) divides by this.
const CAM_SAFE = 1.03;

// ---- small helpers -----------------------------------------------------------
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const hex2 = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
const rgbHex = (a) => `#${hex2(a[0])}${hex2(a[1])}${hex2(a[2])}`;
const rgba = (h, a) => { const c = hexToRgb(h); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; };
const pad2 = (n) => String(n).padStart(2, "0");
const lerp = (a, b, t) => a + (b - a) * t;
function mixHex(a, b, t) {
  const x = hexToRgb(a), y = hexToRgb(b);
  return rgbHex([lerp(x[0], y[0], t), lerp(x[1], y[1], t), lerp(x[2], y[2], t)]);
}
// Finite repeat count for an ambient loop, so nothing runs past the scene it belongs to.
const reps = (span, dur) => Math.max(0, Math.floor(span / Math.max(0.001, dur)) - 1);
function seedFrom(str) {
  let h = 2166136261; const s = String(str || "showcase");
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) || 7;
}

// ---- colour ------------------------------------------------------------------
function rgbToHsl([rr, gg, bb]) {
  rr /= 255; gg /= 255; bb /= 255;
  const mx = Math.max(rr, gg, bb), mn = Math.min(rr, gg, bb), d = mx - mn;
  let h = 0; const l = (mx + mn) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d !== 0) {
    if (mx === rr) h = ((gg - bb) / d) % 6;
    else if (mx === gg) h = (bb - rr) / d + 2;
    else h = (rr - gg) / d + 4;
  }
  return [(h * 60 + 360) % 360, clamp01(s), clamp01(l)];
}
function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const t = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return rgbHex([(t[0] + m) * 255, (t[1] + m) * 255, (t[2] + m) * 255]);
}
// The reference hardcodes four of its five blob hues and its highlight yellow, so a branded
// film wore its accent in exactly one blob and read as the stock template everywhere else.
// Deriving the companions as hue rotations of the accent keeps the reference's colourful,
// optimistic wash while making the WHOLE backdrop move when the brand changes.
const spin = (hex, deg, dl = 0) => { const [h, s, l] = rgbToHsl(hexToRgb(hex)); return hslToHex(h + deg, Math.max(0.42, s), clamp01(l + dl)); };
// Guarantee the accent reads on near-white paper: a pastel brand would otherwise vanish into
// the ground and take the CTA pill, the arrows and the callout chips with it.
function ensureInk(hex, maxLum = 0.46) {
  let [rr, gg, bb] = hexToRgb(hex);
  for (let i = 0; i < 24 && relLum(rgbHex([rr, gg, bb])) > maxLum; i++) { rr *= 0.9; gg *= 0.9; bb *= 0.9; }
  return rgbHex([rr, gg, bb]);
}
const onAccent = (th) => (relLum(th.accent) > 0.55 ? th.ink : "#FFFFFF");

function showcaseTheme(brandSkin) {
  const fontFace = (isBundled(DISPLAY) ? fontFaceCss(DISPLAY) : "") + (isBundled(MONO) ? fontFaceCss(MONO) : "");
  let accent = ACCENT, resolvedBrand = null;
  try {
    const brand = resolveBrand(brandSkin, { ground: BG, isDark: false, packAccents: [ACCENT] });
    if (brand.applied && brand.accent) {
      accent = ensureInk(brand.accent);
      resolvedBrand = {
        ...(brandSkin && typeof brandSkin === "object" ? brandSkin : {}),
        accents: [accent],
        emphasis: brand.emphasis, adjusted: brand.adjusted, dropped: brand.dropped,
        tier: brand.tier, applied: true,
      };
    }
  } catch { accent = ACCENT; resolvedBrand = null; }
  return {
    accent, bg: BG, panel: PANEL, ink: INK, sub: SUB, line: LINE,
    // The highlight/marker hue — the reference's fixed #FFC53D, rotated off the accent so a
    // branded film's marks belong to its palette.
    mark: spin(accent, 168, 0.12),
    // The four companion blobs. Spread around the wheel from the accent, kept light.
    blobs: [accent, spin(accent, 42, 0.06), spin(accent, 128, 0.04), spin(accent, 196, 0.1), spin(accent, 288, 0.02)],
    wash: mixHex(BG, accent, 0.08),
    displayStack: `'${DISPLAY}', 'Helvetica Neue', Arial, sans-serif`,
    monoStack: `'${MONO}', ui-monospace, monospace`,
    fontFace, resolvedBrand,
  };
}

// ---- fixed copy --------------------------------------------------------------
// Neutral, localizable furniture ONLY — every one of these labels the film's own structure.
// Never a claim, never a product name.
const STRINGS = {
  tour: "GUIDED TOUR",
  feature: "FEATURE",
  how: "HOW IT WORKS",
  mobile: "ON MOBILE",
  everything: "EVERYTHING",
  numbers: "BY THE NUMBERS",
  start: "GET STARTED",
  scene: "SCENE",
  of: "OF",
};

// ---- text --------------------------------------------------------------------
const wordsOf = (t) => String(t || "").trim().split(/\s+/).filter(Boolean);
// Trim to at most `max` characters ON A WORD BOUNDARY. A bare slice() cuts mid-word, and a
// button reading "REPLACE MESSY SPREADSH" is indistinguishable from clipped text — QA blocked
// a delivered film for exactly that. (This pack predates om_port_kit, hence the local copy.)
function clampWords(text, max) {
  const s = String(text || "").trim();
  if (s.length <= max) return s;
  const words = wordsOf(s);
  let out = words[0] || "";
  for (let i = 1; i < words.length && `${out} ${words[i]}`.length <= max; i++) out += ` ${words[i]}`;
  return out;
}

// Space Grotesk 700, mixed case, measured against a render rather than estimated. The two
// prior ports both shipped a too-low advance and clipped a headline before the number was
// corrected off actual pixels; 0.55 is the conservative side of the measurement.
const MEAN_ADVANCE_EM = 0.55;
const FIT_SAFETY = 0.95;

// Wrap `text` into at most `maxLines` lines that each fit `maxLineCqw`, shrinking the type
// only after wrapping has done what it can. Returns the lines and the size they fit at.
function fitLines(text, maxLineCqw, maxSizeCqw, maxLines = 3) {
  const words = wordsOf(text);
  if (!words.length) return { lines: [], size: maxSizeCqw };
  const width = (s, size) => s.length * MEAN_ADVANCE_EM * size;
  for (let n = 1; n <= maxLines; n++) {
    // Greedy balance: aim for n roughly equal lines.
    const target = Math.ceil(words.length / n);
    const lines = [];
    for (let i = 0; i < words.length; i += target) lines.push(words.slice(i, i + target).join(" "));
    if (lines.length > n) continue;
    const longest = lines.reduce((a, l) => Math.max(a, l.length), 0);
    const size = Math.min(maxSizeCqw, (maxLineCqw * FIT_SAFETY) / (longest * MEAN_ADVANCE_EM));
    // Accept the first line count that does not force the type below 62% of its authored
    // size — past that the layout is better served by another line than by smaller type.
    if (size >= maxSizeCqw * 0.62 || n === maxLines) return { lines, size: Math.max(size, maxSizeCqw * 0.4) };
  }
  return { lines: [text], size: maxSizeCqw * 0.4 };
}
// One line, shrunk to fit. Never wraps — for URLs, brand words and button labels.
function fitOne(text, lineCqw, maxSizeCqw) {
  const n = String(text || "").length || 1;
  return Math.max(U(11), Math.min(maxSizeCqw, (lineCqw * FIT_SAFETY) / (n * MEAN_ADVANCE_EM)));
}

const domainOf = (s) => {
  const m = String(s || "").match(/\b((?:[a-z0-9-]+\.)+(?:com|io|ai|app|co|dev|net|org|so|xyz|studio|design|tech|cloud|sh|me))\b/i);
  return m ? m[1].toLowerCase() : "";
};

// Numbers a stat card can print, with whatever unit was attached to them.
function numbersIn(scene) {
  const text = [scene.emphasis, scene.headline, scene.subtext, scene.body].filter(Boolean).join(" · ");
  const out = [];
  const re = /(\d[\d.,]*)\s*(%|x|k\+?|m\+?|b\+?|★|\/\s*\d+|hrs?|days?|min(?:ute)?s?|sec(?:ond)?s?)?/gi;
  let m;
  while ((m = re.exec(text)) && out.length < 3) {
    const v = m[1].replace(/,$/, "");
    if (!v || v.length > 6) continue;
    out.push({ v, suffix: (m[2] || "").trim() });
  }
  return out;
}
// The label under a stat — the nearest words that are NOT the figure itself. Dropping the
// numeric token matters: the card already prints the number in 96px type, so a label lifted
// verbatim off "12K+ teams" renders as "12K+" above "12K+ TEAMS", which reads as a layout bug
// rather than as a caption.
const NUMERIC_TOKEN = /^[\d.,]+\s*(%|x|k\+?|m\+?|b\+?|★)?$/i;
function statLabel(scene, i) {
  const list = bullets(scene, 3);
  const clean = (s) => wordsOf(s).filter((w) => !NUMERIC_TOKEN.test(w)).slice(0, 2).join(" ").toUpperCase().slice(0, 16);
  if (list[i]) return clean(list[i]);
  return clean(scene.subtext || scene.headline || "");
}

// ---- assets ------------------------------------------------------------------
const ratioOf = (a) => Number(a && a.ratio) || (a && a.width && a.height ? a.width / a.height : 0);
function screenOk(a) {
  if (!a || !a.path) return false;
  if (String(a.role || "") === "logo") return false;
  const k = String(a.kind || a.type || "");
  return k !== "audio" && k !== "video";
}
const BRAND_SOURCES = new Set(["upload", "website", "website-brand", "website-asset"]);
const isOwnAsset = (a) => !!a && (BRAND_SOURCES.has(String(a.source || "")) || String(a.role || "") === "logo");

// A picture filling a box, cropped from its centre. Showcase is a HIGH-KEY, full-colour
// template — unlike grid-dispatch there is no grayscale-by-provenance rule here, because a
// desaturated screenshot inside browser chrome reads as a broken page rather than a style.
function shotFill(asset, { focus = "center center", w = 0, h = 0 } = {}) {
  return `<img src="${esc(asset.path)}" alt="${esc(asset.alt || "")}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:${cropFocus(asset, w, h, focus)};display:block;background:${PANEL};">`;
}

// The content-derived crop anchor for a cover-fit box. Lazy + defensive: the crop engine is
// optional infrastructure and this composer must render without it. Content truth outranks
// the call site's literal — those literals ("center top") are generic defaults written
// before anything had measured the picture.
function cropFocus(asset, w, h, fallback) {
  try { return require("./crop_engine").focusFor(asset, w, h, fallback); }
  catch { return (asset && asset.cropFocus) || fallback; }
}

// ---- device chrome -----------------------------------------------------------
const BAR_H = U(46);   // the browser frame's title bar, in cqw

// A browser window around a real picture. `w`/`h` are the OUTER box in cqw.
function browserFrame(th, { cls, x, y, w, h, url, inner, z = 2 }) {
  return `<div class="${cls}" style="position:absolute;left:${r(x)}cqw;top:${r(y)}cqw;width:${r(w)}cqw;height:${r(h)}cqw;z-index:${z};border-radius:${r(U(16))}cqw;overflow:hidden;background:${th.panel};border:1px solid ${th.line};box-shadow:0 ${r(U(40))}cqw ${r(U(90))}cqw ${rgba(th.ink, 0.18)};display:flex;flex-direction:column;">
    <div style="height:${r(BAR_H)}cqw;flex-shrink:0;background:#F6F8FC;border-bottom:1px solid ${th.line};display:flex;align-items:center;gap:${r(U(8))}cqw;padding:0 ${r(U(18))}cqw;">
      ${["#FF5F57", "#FEBC2E", "#28C840"].map((c) => `<span style="width:${r(U(12))}cqw;height:${r(U(12))}cqw;border-radius:50%;background:${c};flex:0 0 auto;"></span>`).join("")}
      <div style="margin-left:${r(U(14))}cqw;flex:1 1 auto;max-width:${r(U(420))}cqw;height:${r(U(26))}cqw;border-radius:${r(U(13))}cqw;background:#EAEEF5;display:flex;align-items:center;padding:0 ${r(U(14))}cqw;font-family:${th.monoStack};font-size:${r(U(12))}cqw;color:${th.sub};overflow:hidden;white-space:nowrap;">${esc(url || "")}</div>
    </div>
    <div style="flex:1 1 auto;min-height:0;position:relative;overflow:hidden;">${inner}</div>
  </div>`;
}

// A phone around a real picture. `w`/`h` are the OUTER device in cqw.
function phoneFrame(th, { cls, x, y, w, h, inner, z = 2 }) {
  const pad = U(12);
  return `<div class="${cls}" style="position:absolute;left:${r(x)}cqw;top:${r(y)}cqw;width:${r(w)}cqw;height:${r(h)}cqw;z-index:${z};border-radius:${r(U(46))}cqw;padding:${r(pad)}cqw;background:${th.ink};box-shadow:0 ${r(U(40))}cqw ${r(U(90))}cqw ${rgba(th.ink, 0.28)};">
    <div style="position:absolute;top:${r(U(24))}cqw;left:50%;transform:translateX(-50%);width:${r(U(100))}cqw;height:${r(U(26))}cqw;border-radius:${r(U(26))}cqw;background:${th.ink};z-index:3;"></div>
    <div style="width:100%;height:100%;border-radius:${r(U(34))}cqw;overflow:hidden;background:${th.panel};position:relative;">${inner}</div>
  </div>`;
}

// ---- annotation vocabulary ---------------------------------------------------
// Everything here is authored in STAGE PIXELS and drawn into a 1920x1080 SVG viewBox, so the
// reference's own coordinates port across unchanged.
const SVG_OPEN = `<svg viewBox="0 0 ${STAGE_W} ${STAGE_H}" preserveAspectRatio="none" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible;">`;

// A curved arrow that draws itself, with an arrowhead that pops on at the end.
function arrowSvg(cls, from, to, bend, color, width = 5) {
  const mx = (from[0] + to[0]) / 2, my = (from[1] + to[1]) / 2;
  const dx = to[0] - from[0], dy = to[1] - from[1], len = Math.hypot(dx, dy) || 1;
  const cx = mx - (dy / len) * bend, cy = my + (dx / len) * bend;
  const ang = (Math.atan2(to[1] - cy, to[0] - cx) * 180) / Math.PI;
  const L = 1600;
  const d = `M${r(from[0])} ${r(from[1])} Q ${r(cx)} ${r(cy)} ${r(to[0])} ${r(to[1])}`;
  const head = `M2 0 L-20 -12 L-13 0 L-20 12 Z`;
  // OUTLINED, BECAUSE IT IS DRAWN OVER A PICTURE WE DID NOT CHOOSE. A bare accent stroke
  // disappears the moment it crosses a screenshot that happens to be the same hue — and the
  // arrow is the one element whose whole job is to point at that screenshot. The white casing
  // under it is what every real annotation tool does, for exactly this reason.
  return `${SVG_OPEN}
    <path class="${cls}-p" d="${d}" fill="none" stroke="#FFFFFF" stroke-width="${width + 4}" stroke-linecap="round" stroke-dasharray="${L}" stroke-dashoffset="${L}" opacity="0.92"></path>
    <path class="${cls}-p" d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-dasharray="${L}" stroke-dashoffset="${L}"></path>
    <g class="${cls}-h" transform="translate(${r(to[0])} ${r(to[1])}) rotate(${r(ang)})" style="transform-box:view-box;transform-origin:${r(to[0])}px ${r(to[1])}px;">
      <path d="${head}" fill="none" stroke="#FFFFFF" stroke-width="5" stroke-linejoin="round" opacity="0.92"></path>
      <path d="${head}" fill="${color}"></path>
    </g>
  </svg>`;
}

// A numbered label bubble. `align:"right"` hangs it off the LEFT of x, so a callout near the
// right edge stays on the sheet.
function calloutHtml(cls, th, { x, y, num, text, align = "left" }) {
  return `<div class="${cls}" style="position:absolute;left:${r(U(x))}cqw;top:${r(U(y))}cqw;${align === "right" ? "translate:-100% 0;" : ""}display:flex;align-items:center;gap:${r(U(10))}cqw;padding:${r(U(10))}cqw ${r(U(16))}cqw ${r(U(10))}cqw ${r(U(10))}cqw;background:${th.ink};color:#fff;border-radius:${r(U(12))}cqw;box-shadow:0 ${r(U(10))}cqw ${r(U(30))}cqw ${rgba(th.ink, 0.3)};white-space:nowrap;opacity:0;z-index:8;">
    <span style="width:${r(U(26))}cqw;height:${r(U(26))}cqw;border-radius:${r(U(8))}cqw;background:${th.accent};display:grid;place-items:center;font-family:${th.monoStack};font-weight:700;font-size:${r(U(14))}cqw;color:${onAccent(th)};flex:0 0 auto;">${esc(num)}</span>
    <span style="font-family:${th.displayStack};font-weight:600;font-size:${r(U(20))}cqw;">${esc(text)}</span>
  </div>`;
}

// A pulsing box drawn around a region of the shot beneath it.
function highlightHtml(cls, th, { x, y, w, h }) {
  return `<div class="${cls}" style="position:absolute;left:${r(U(x))}cqw;top:${r(U(y))}cqw;width:${r(U(w))}cqw;height:${r(U(h))}cqw;border-radius:${r(U(12))}cqw;border:${r(U(3))}cqw solid ${th.accent};box-shadow:0 0 0 ${r(U(6))}cqw ${rgba(th.accent, 0.14)};pointer-events:none;z-index:7;transform-origin:left center;transform:scaleX(0);"></div>`;
}

// A cursor that travels from -> to and leaves a click ripple.
function cursorSvg(cls, th, from, to) {
  return `${SVG_OPEN}
    <circle class="${cls}-r" cx="${r(to[0])}" cy="${r(to[1])}" r="10" fill="none" stroke="${th.accent}" stroke-width="3" opacity="0"></circle>
    <g class="${cls}-c" transform="translate(${r(from[0])} ${r(from[1])})" opacity="0">
      <path d="M0 0 L0 26 L7 19 L12 30 L16 28 L11 18 L20 18 Z" fill="#fff" stroke="${th.ink}" stroke-width="2" stroke-linejoin="round"></path>
    </g>
  </svg>`;
}
// The cursor tween pair: travel, then ripple. Authored in stage px, emitted as an x/y delta.
function cursorTweens(cls, ctx, from, to, at0, dur) {
  const { at, du } = ctx;
  return [
    `tl.set(".${cls}-c",{opacity:1},${at(at0)});`,
    `tl.to(".${cls}-c",{x:${r(to[0] - from[0])},y:${r(to[1] - from[1])},duration:${du(dur)},ease:"power2.inOut"},${at(at0)});`,
    `tl.fromTo(".${cls}-r",{opacity:1,attr:{r:10}},{opacity:0,attr:{r:52},duration:${du(0.5)},ease:"power2.out"},${at(at0 + dur)});`,
  ];
}

// ---- backdrop + sky ----------------------------------------------------------
// Five soft colour blobs and a 52px grid, under everything the scene draws.
//
// THEY ARE GRADIENTS, NOT BLURRED CIRCLES. The reference paints each blob as its own div
// under `filter:blur(52px)`. Five of those per scene across seven scenes is 35 heavy-overlay
// elements, and the renderer's lint flags that against a field report where a composition
// carrying ~40 of them captured SOLID BLACK for the first half of the render — reproducing
// identically through every capture path, so the capture layer itself is the offender. A
// radial-gradient with a soft stop IS a blurred circle, costs no filter, and collapses the
// five divs into two drifting layers: 14 elements across the film instead of 35.
const BLOB_SPEC = [
  { w: 660, x: -190, y: -250, o: 0.17, layer: 0 },
  { w: 560, x: 1430, y: -230, o: 0.16, layer: 1 },
  { w: 520, x: -170, y: 700, o: 0.15, layer: 0 },
  { w: 600, x: 1370, y: 640, o: 0.17, layer: 1 },
  { w: 440, x: 780, y: 800, o: 0.11, layer: 0 },
];
// One CSS background per layer: every blob in it becomes a radial-gradient centred on the
// circle the reference drew, fading to nothing at its own radius.
function blobLayer(th, layer) {
  return BLOB_SPEC.map((b, i) => ({ b, hue: th.blobs[i % th.blobs.length] }))
    .filter(({ b }) => b.layer === layer)
    .map(({ b, hue }) => {
      const cx = ((b.x + b.w / 2) / STAGE_W) * 100, cy = ((b.y + b.w / 2) / STAGE_H) * 100;
      const rx = (b.w / STAGE_W) * 100 * 0.78;
      return `radial-gradient(circle ${r(rx)}% at ${r(cx)}% ${r(cy)}%, ${rgba(hue, b.o)} 0%, ${rgba(hue, b.o * 0.55)} 42%, ${rgba(hue, 0)} 72%)`;
    }).join(",");
}
// The ambient sky is drawn INSIDE the backdrop and UNDER the 52px grid, so the grid's rules
// cross it. That is what settles it as background texture rather than as a layer competing
// with the copy — a plane passing behind a headline has to read as wallpaper, not as an
// object landing on the type.
function backdropHtml(id, th) {
  return `<div style="position:absolute;inset:0;background:linear-gradient(160deg, ${th.bg} 0%, #FFFFFF 52%, ${th.bg} 100%);overflow:hidden;">
    <div class="${id}-bl0" style="position:absolute;inset:${r(-U(120))}cqw;background:${blobLayer(th, 0)};"></div>
    <div class="${id}-bl1" style="position:absolute;inset:${r(-U(120))}cqw;background:${blobLayer(th, 1)};"></div>
    ${skyHtml(id, th)}
    <div style="position:absolute;inset:0;background-image:linear-gradient(${rgba(th.ink, 0.045)} 1px, transparent 1px),linear-gradient(90deg, ${rgba(th.ink, 0.045)} 1px, transparent 1px);background-size:${r(U(52))}cqw ${r(U(52))}cqw;opacity:0.5;"></div>
  </div>`;
}
// The two layers drift against each other, which is what sold the reference's independent
// blobs — the eye reads relative motion, not absolute.
function backdropTweens(id, ctx) {
  return [
    `tl.to(".${id}-bl0",{x:"${r(U(28))}cqw",y:"${r(U(24))}cqw",duration:9.1,ease:"sine.inOut",repeat:${reps(ctx.L, 9.1)},yoyo:true},${r(ctx.T)});`,
    `tl.to(".${id}-bl1",{x:"${r(-U(26))}cqw",y:"${r(-U(22))}cqw",duration:11.3,ease:"sine.inOut",repeat:${reps(ctx.L, 11.3)},yoyo:true},${r(ctx.T)});`,
  ];
}

// Paper planes on dashed trails, a flock of birds and floaty dots — the reference's ambient
// layer, re-expressed as finite GSAP loops instead of a per-frame clock.
const SKY_DOTS = [[300, 520], [1600, 470], [900, 300], [1420, 830], [500, 840], [1150, 640], [720, 470]];
// NO TRAIL. The reference tows each plane on a 168px dashed line. On a landscape stage those
// trails cross the headline band in almost every layout, and this program has already learned
// what that costs: grid-dispatch's emphasis bar was removed outright because QA reads ANY line
// through type as a collision, regardless of what the line is. The glyph alone keeps the
// reference's charm and carries no line to strike anything through.
function planeG(cls, color, x, y, rot, scale = 1) {
  return `<g class="${cls}" transform="translate(${x} ${y}) rotate(${rot}) scale(${scale})">
    <path d="M24 0 L-20 -15 L-7 0 L-20 15 Z" fill="${color}"></path>
    <path d="M-7 0 L-20 -15 L-11 0 Z" fill="${rgba("#000000", 0.16)}"></path>
  </g>`;
}
function skyHtml(id, th) {
  const dots = SKY_DOTS.map((d, i) => `<circle class="${id}-dot" cx="${d[0]}" cy="${d[1]}" r="${7 + (i % 3) * 3}" fill="${th.blobs[i % th.blobs.length]}" opacity="0.5"></circle>`).join("");
  const birds = [0, 1, 2, 3, 4].map((i) => `<g transform="translate(${i * 96} ${150 + (i % 3) * 24}) scale(${(1 - (i % 3) * 0.12).toFixed(2)})" stroke="${rgba(th.ink, 0.42)}" stroke-width="4" stroke-linecap="round" fill="none"><path d="M-19 0 Q -10 -12 0 0"></path><path d="M19 0 Q 10 -12 0 0"></path></g>`).join("");
  // Held at 0.55 and flown along the frame's top and bottom thirds. There is no horizontal
  // band that is free of type in EVERY layout — the detail and montage headlines sit at 96
  // while the mobile eyebrow sits at 300 — so the answer is to make a crossing cheap rather
  // than to try to route around all seven layouts at once.
  return `${SVG_OPEN.replace("pointer-events:none;", "pointer-events:none;opacity:0.55;")}
    ${dots}
    <g class="${id}-flock" transform="translate(-200 0)">${birds}</g>
    ${planeG(`${id}-p1`, th.accent, -260, 210, -9)}
    ${planeG(`${id}-p2`, th.blobs[1], 2180, 862, 171)}
  </svg>`;
}
function skyTweens(id, ctx) {
  const cross = 16;   // seconds for one plane to cross the full stage
  return [
    `tl.to(".${id}-dot",{y:-16,duration:3.2,ease:"sine.inOut",repeat:${reps(ctx.L, 3.2)},yoyo:true,stagger:0.18},${r(ctx.T)});`,
    `tl.to(".${id}-flock",{x:2320,duration:${cross + 6},ease:"none",repeat:${reps(ctx.L, cross + 6)}},${r(ctx.T)});`,
    `tl.to(".${id}-p1",{x:2440,y:40,duration:${cross},ease:"none",repeat:${reps(ctx.L, cross)}},${r(ctx.T)});`,
    `tl.to(".${id}-p2",{x:-2440,y:-30,duration:${cross + 4},ease:"none",repeat:${reps(ctx.L, cross + 4)}},${r(ctx.T)});`,
  ];
}

// ---- chrome ------------------------------------------------------------------
// The tour HUD: a brand badge, the beat's label, and a progress rule. It sits OUTSIDE the
// camera layer and is identical across every cut — which is the only reason the reference's
// hard cuts read as cuts rather than as jumps.
function chromeHtml(id, th, { brand, label, i, total }) {
  const initial = (brand || "S").trim().charAt(0).toUpperCase() || "S";
  return `<div class="sc-chrome">
    <div style="position:absolute;top:${r(U(46))}cqw;left:${r(U(60))}cqw;display:flex;align-items:center;gap:${r(U(14))}cqw;">
      <span style="width:${r(U(30))}cqw;height:${r(U(30))}cqw;border-radius:${r(U(9))}cqw;background:${th.accent};display:grid;place-items:center;color:${onAccent(th)};font-family:${th.displayStack};font-weight:700;font-size:${r(U(18))}cqw;flex:0 0 auto;">${esc(initial)}</span>
      <span style="font-family:${th.displayStack};font-weight:700;font-size:${r(U(22))}cqw;color:${th.ink};letter-spacing:-0.01em;white-space:nowrap;">${esc(brand)}</span>
      ${label ? `<span style="font-family:${th.monoStack};font-size:${r(U(13))}cqw;letter-spacing:0.14em;color:${th.sub};text-transform:uppercase;white-space:nowrap;">／ ${esc(label)}</span>` : ""}
    </div>
    <div style="position:absolute;top:${r(U(52))}cqw;right:${r(U(60))}cqw;font-family:${th.monoStack};font-size:${r(U(13))}cqw;letter-spacing:0.18em;color:${th.sub};">${esc(STRINGS.scene)} ${pad2(i + 1)} ${esc(STRINGS.of)} ${pad2(total)}</div>
    <div style="position:absolute;bottom:${r(U(52))}cqw;left:${r(U(60))}cqw;right:${r(U(60))}cqw;height:${r(U(4))}cqw;border-radius:${r(U(4))}cqw;background:${rgba(th.ink, 0.08)};overflow:hidden;">
      <div class="${id}-prog" style="width:100%;height:100%;border-radius:${r(U(4))}cqw;background:${th.accent};transform:scaleX(0);transform-origin:left center;"></div>
    </div>
  </div>`;
}
// The progress rule fills across the WHOLE film, so it is driven from absolute time.
function chromeTweens(ctx, D) {
  const from = ctx.T / Math.max(0.001, D), to = (ctx.T + ctx.clipDur) / Math.max(0.001, D);
  return [
    `tl.fromTo(".${ctx.id}-prog",{scaleX:${r(from)}},{scaleX:${r(to)},duration:${r(ctx.clipDur)},ease:"none"},${r(ctx.T)});`,
  ];
}

// ---- the camera --------------------------------------------------------------
// The reference's `scam`: a slide-push in, a slow 3% scale across the whole beat, a slide-push
// out. The opacity dip at each end is what gives the hard cut its breath — the scene's own
// background and chrome stay lit underneath it.
function cameraTweens(id, ctx) {
  const { L } = ctx;
  // Authored as a FRACTION of the beat, not a constant: a 2-second scene given the reference's
  // 0.55s push would spend half its life arriving.
  const IN = Math.min(0.55, L * 0.12), OUT = Math.max(0.1, L * 0.12);
  const tail = Math.max(0.1, L - OUT);
  return [
    `tl.fromTo("#${id} .sc-cam",{x:"${r(U(200))}cqw",opacity:0},{x:0,opacity:1,duration:${r(IN)},ease:"power3.out"},${r(ctx.T)});`,
    `tl.fromTo("#${id} .sc-cam",{scale:1},{scale:1.03,duration:${r(L)},ease:"sine.inOut"},${r(ctx.T)});`,
    `tl.to("#${id} .sc-cam",{x:"${r(-U(200))}cqw",opacity:0,duration:${r(OUT)},ease:"power2.in"},${r(ctx.T + tail)});`,
    // HARD KILL ON THE FADED ELEMENT ITSELF. Killing the scene root is not enough: a non-linear
    // seek landing after the camera's exit tween would otherwise restore stale visibility on
    // `.sc-cam` while the root is hidden, and the renderer's lint fails the composition for it.
    `tl.set("#${id} .sc-cam",{opacity:0},${r(ctx.T + ctx.clipDur)});`,
  ];
}

// The scene shell. Background and chrome sit outside `.sc-cam`; everything the beat draws
// sits inside it.
function open(ctx, inner) {
  const { id, th } = ctx;
  return `<div id="${id}" class="clip sc-scene" data-start="${r(ctx.T)}" data-duration="${r(ctx.clipDur)}" data-track-index="${ctx.track}" style="opacity:0;">
  <div class="sc-cam">
    ${backdropHtml(id, th)}
    ${inner}
  </div>
  ${chromeHtml(id, th, { brand: ctx.brand, label: ctx.label, i: ctx.i, total: ctx.total })}
</div>`;
}
const ambient = (ctx) => [...backdropTweens(ctx.id, ctx), ...skyTweens(ctx.id, ctx)];

// ══════════════════════════════════════════════════════════════════════════════
// STATEMENT — the layout for a beat that has no picture.
//
// WHY IT EXISTS. Avoiding a hollow device frame is only half the problem. The first cut of
// this pack fell back to "the same beat, minus the screenshot", and QA blocked two frames of
// a delivered film for it: "under-illustrated frame with massive empty space around headline"
// and "frame lacks supporting visual elements and leaves large empty areas". An empty FRAME
// is the same defect as an empty PANEL — it just fails at a different scale.
//
// So a pictureless beat gets a layout designed to be pictureless: oversized type that scales
// to the room it has, an accent rule, and the beat's own bullets set as a full-width ruled
// list running to the foot of the stage. Every word of it comes from the script — the fill is
// real content given real weight, not decoration invented to cover a hole.
function sStatement(scene, ctx, _shots, { centred = false } = {}) {
  const { id, th, at, du } = ctx;
  const eyebrow = String(scene.kicker || scene.purpose || ctx.label || "").toUpperCase().slice(0, 34);
  const list = bullets(scene, 4);
  const body = String(scene.subtext || scene.body || "").slice(0, 140);

  const colW = centred ? U(1440) : U(1560);
  const left = centred ? U(240) : U(96);
  // Fewer lines of copy below means the headline is allowed to grow into the space instead of
  // leaving it blank — the type is what fills a frame that has no picture to fill it.
  const headMax = list.length ? U(126) : U(158);
  const head = fitLines(scene.headline || scene.title || "", colW / CAM_SAFE, headMax, 3);

  let y = U(226);
  const eyeH = eyebrow ? U(40) : 0;
  const headH = head.lines.length * head.size * 1.02;
  const ruleY = y + eyeH + headH + U(34);
  const bodyY = ruleY + U(44);
  const listY = bodyY + (body ? U(78) : U(10));
  // The list divides whatever room is left, so three bullets and one bullet both reach the
  // foot of the stage rather than both hugging the top of it.
  const rowH = list.length ? Math.max(U(74), (U(910) - listY) / list.length) : 0;

  const rows = list.map((b, i) => `<div class="${id}-row" style="position:absolute;left:${r(left)}cqw;top:${r(listY + i * rowH)}cqw;width:${r(colW)}cqw;height:${r(rowH)}cqw;display:flex;align-items:center;gap:${r(U(20))}cqw;border-top:1px solid ${rgba(th.ink, 0.14)};opacity:0;">
      <span style="width:${r(U(12))}cqw;height:${r(U(12))}cqw;border-radius:50%;background:${th.accent};flex:0 0 auto;"></span>
      <span style="font-family:${th.displayStack};font-weight:600;font-size:${r(U(30))}cqw;line-height:1.25;color:${th.ink};">${esc(String(b).slice(0, 78))}</span>
    </div>`).join("");

  const html = open(ctx, `
    <div class="${id}-head" style="position:absolute;left:${r(left)}cqw;top:${r(y)}cqw;width:${r(colW)}cqw;${centred ? "text-align:center;" : ""}opacity:0;">
      ${eyebrow ? `<div style="font-family:${th.monoStack};font-size:${r(U(17))}cqw;letter-spacing:0.22em;color:${th.accent};text-transform:uppercase;margin-bottom:${r(U(16))}cqw;">${esc(eyebrow)}</div>` : ""}
      <div style="font-family:${th.displayStack};font-weight:700;font-size:${r(head.size)}cqw;line-height:1.02;letter-spacing:-0.03em;color:${th.ink};">${head.lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join("")}</div>
    </div>
    <div class="${id}-rule" style="position:absolute;left:${r(centred ? U(660) : left)}cqw;top:${r(ruleY)}cqw;width:${r(centred ? U(600) : U(560))}cqw;height:${r(U(6))}cqw;background:${th.accent};transform:scaleX(0);transform-origin:${centred ? "center" : "left"} center;"></div>
    ${body ? `<div class="${id}-body" style="position:absolute;left:${r(left)}cqw;top:${r(bodyY)}cqw;width:${r(colW)}cqw;${centred ? "text-align:center;" : ""}font-family:${th.displayStack};font-weight:400;font-size:${r(U(30))}cqw;line-height:1.45;color:${th.sub};opacity:0;">${esc(body)}</div>` : ""}
    ${rows}`);

  const s = [
    `tl.set("#${id}",{opacity:1},${r(ctx.T)});`,
    `tl.fromTo(".${id}-head",{opacity:0,y:"${r(U(46))}cqw"},{opacity:1,y:0,duration:${du(0.75)},ease:"back.out(1.4)"},${at(0.25)});`,
    `tl.fromTo(".${id}-rule",{scaleX:0},{scaleX:1,duration:${du(0.6)},ease:"power3.inOut"},${at(0.9)});`,
    body ? `tl.fromTo(".${id}-body",{opacity:0,y:"${r(U(20))}cqw"},{opacity:1,y:0,duration:${du(0.5)},ease:"power3.out"},${at(1.1)});` : "",
    list.length ? `tl.fromTo(".${id}-row",{opacity:0,x:"${r(U(-30))}cqw"},{opacity:1,x:0,duration:${du(0.5)},ease:"power3.out",stagger:${du(0.2)}},${at(1.35)});` : "",
    ...cameraTweens(id, ctx),
    ...ambient(ctx),
  ].filter(Boolean);
  return { html, s };
}

// ══════════════════════════════════════════════════════════════════════════════
// SCENE 1 — INTRO
// Centred eyebrow and headline, then the hero screenshot rises into a browser window from
// below the frame while a cursor travels up into it. With no picture, the type takes the
// whole stage rather than a browser window being drawn around nothing.
// ══════════════════════════════════════════════════════════════════════════════
function sIntro(scene, ctx, shots) {
  const { id, th, at, du } = ctx;
  const shot = shots[0] || null;
  // NO PICTURE, NO INTRO LAYOUT. Without the hero window this beat is two short lines of type
  // floating in the middle of a 1920x1080 frame — the exact composition QA blocked. The
  // statement layout is built for that case, so hand it over rather than degrade into it.
  if (!shot) return sStatement(scene, ctx, shots, { centred: true });

  const eyebrow = String(scene.kicker || scene.purpose || STRINGS.tour).toUpperCase().slice(0, 34);
  const headText = scene.headline || scene.title || ctx.title;
  const headMax = U(104), headTop = U(150);
  const head = fitLines(headText, (U(1520) / CAM_SAFE), headMax, 2);

  const boxW = U(1120), boxH = U(590), boxX = U(400) /* centred: (1920-1120)/2 */;
  const frame = shot
    ? browserFrame(th, { cls: `${id}-hero`, x: boxX, y: U(400), w: boxW, h: boxH, url: ctx.url, inner: shotFill(shot) })
    : "";

  const html = open(ctx, `
    <div class="${id}-head" style="position:absolute;left:${r(U(200))}cqw;width:${r(U(1520))}cqw;top:${r(headTop)}cqw;text-align:center;opacity:0;">
      <div style="font-family:${th.monoStack};font-size:${r(U(18))}cqw;letter-spacing:0.22em;color:${th.accent};text-transform:uppercase;margin-bottom:${r(U(14))}cqw;">${esc(eyebrow)}</div>
      <div style="font-family:${th.displayStack};font-weight:700;font-size:${r(head.size)}cqw;line-height:0.98;letter-spacing:-0.03em;color:${th.ink};">${head.lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join("")}</div>
    </div>
    ${frame}
    ${shot ? cursorSvg(`${id}-cur`, th, [1180, 900], [980, 640]) : ""}`);

  const s = [
    `tl.set("#${id}",{opacity:1},${r(ctx.T)});`,
    `tl.fromTo(".${id}-head",{opacity:0,y:"${r(U(44))}cqw"},{opacity:1,y:0,duration:${du(0.7)},ease:"back.out(1.5)"},${at(0.25)});`,
    shot ? `tl.fromTo(".${id}-hero",{y:"${r(U(520))}cqw",scale:0.94,opacity:0},{y:0,scale:1,opacity:1,duration:${du(1.4)},ease:"back.out(1.2)"},${at(0.7)});` : "",
    ...(shot ? cursorTweens(`${id}-cur`, ctx, [1180, 900], [980, 640], 2.1, 1.6) : []),
    ...cameraTweens(id, ctx),
    ...ambient(ctx),
  ].filter(Boolean);
  return { html, s };
}

// ══════════════════════════════════════════════════════════════════════════════
// SCENE 2 — TOUR
// Copy holds the left column; the screenshot slides in from the right inside a browser
// window and slowly zooms toward a focal point while a highlight box, an arrow and a numbered
// callout land on it in sequence. Without a picture the copy column widens and the
// annotation vocabulary is withheld — arrows pointing at nothing is the worse failure.
// ══════════════════════════════════════════════════════════════════════════════
function sTour(scene, ctx, shots) {
  const { id, th, at, du } = ctx;
  const shot = shots[0] || null;
  // Same rule as the intro: this layout is a copy column BESIDE a screenshot. Take the
  // screenshot away and it is a headline in the top-left corner of an empty stage.
  if (!shot) return sStatement(scene, ctx, shots, { centred: false });

  const eyebrow = String(scene.kicker || scene.purpose || STRINGS.feature).toUpperCase().slice(0, 30);
  const colW = U(560);
  const head = fitLines(scene.headline || scene.title || "", colW / CAM_SAFE, U(76), 3);
  const body = String(scene.subtext || scene.body || "").slice(0, 150);
  const list = bullets(scene, 3);
  const callout = list[0] ? wordsOf(list[0]).slice(0, 3).join(" ") : "";

  const html = open(ctx, `
    <div class="${id}-copy" style="position:absolute;left:${r(U(96))}cqw;top:${r(U(190))}cqw;width:${r(colW)}cqw;opacity:0;z-index:4;">
      <div style="font-family:${th.monoStack};font-size:${r(U(16))}cqw;letter-spacing:0.2em;color:${th.accent};margin-bottom:${r(U(14))}cqw;text-transform:uppercase;">${esc(eyebrow)}</div>
      <div style="font-family:${th.displayStack};font-weight:700;font-size:${r(head.size)}cqw;line-height:0.98;letter-spacing:-0.02em;color:${th.ink};">${head.lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join("")}</div>
      ${body ? `<div style="margin-top:${r(U(22))}cqw;font-family:${th.displayStack};font-weight:400;font-size:${r(U(22))}cqw;line-height:1.5;color:${th.sub};max-width:${r(U(440))}cqw;">${esc(body)}</div>` : ""}
    </div>
    ${shot ? browserFrame(th, {
    cls: `${id}-win`, x: U(830), y: U(200), w: U(1000), h: U(620), url: ctx.url,
    inner: `<div class="${id}-zoom" style="position:absolute;inset:0;transform-origin:68% 40%;">${shotFill(shot)}</div>`,
  }) : ""}
    ${shot ? highlightHtml(`${id}-hl`, th, { x: 1300, y: 330, w: 330, h: 150 }) : ""}
    ${shot ? arrowSvg(`${id}-ar`, [720, 470], [1290, 400], -90, th.accent) : ""}
    ${shot && callout ? calloutHtml(`${id}-co`, th, { x: 470, y: 470, num: "1", text: callout }) : ""}`);

  const s = [
    `tl.set("#${id}",{opacity:1},${r(ctx.T)});`,
    `tl.fromTo(".${id}-copy",{opacity:0,y:"${r(U(40))}cqw"},{opacity:1,y:0,duration:${du(0.7)},ease:"back.out(1.5)"},${at(0.35)});`,
    shot ? `tl.fromTo(".${id}-win",{x:"${r(U(900))}cqw"},{x:0,duration:${du(1.1)},ease:"back.out(1.1)"},${at(0.25)});` : "",
    shot ? `tl.fromTo(".${id}-zoom",{scale:1},{scale:1.4,duration:${du(2.4)},ease:"power1.inOut"},${at(1.3)});` : "",
    shot ? `tl.fromTo(".${id}-hl",{scaleX:0},{scaleX:1,duration:${du(0.5)},ease:"back.out(1.6)"},${at(1.6)});` : "",
    shot ? `tl.to(".${id}-hl",{boxShadow:"0 0 0 ${r(U(12))}cqw ${rgba(th.accent, 0.1)}",duration:0.9,ease:"sine.inOut",repeat:${reps(Math.max(0, ctx.L - 1.6 * ctx.k), 0.9)},yoyo:true},${at(1.9)});` : "",
    shot ? `tl.to(".${id}-ar-p",{strokeDashoffset:0,duration:${du(0.7)},ease:"power2.out"},${at(1.85)});` : "",
    shot ? `tl.fromTo(".${id}-ar-h",{scale:0},{scale:1,duration:${du(0.3)},ease:"back.out(2.4)"},${at(2.4)});` : "",
    shot && callout ? `tl.fromTo(".${id}-co",{opacity:0,scale:0.5},{opacity:1,scale:1,duration:${du(0.45)},ease:"back.out(2.4)"},${at(2.1)});` : "",
    ...cameraTweens(id, ctx),
    ...ambient(ctx),
  ].filter(Boolean);
  return { html, s };
}

// ══════════════════════════════════════════════════════════════════════════════
// SCENE 3 — DETAIL
// One large screenshot, centred, with up to three numbered annotations drawn onto it in
// sequence — the beat that makes the film read as a TOUR rather than a montage. Requires both
// a picture and something to say about it, so it is skipped rather than faked.
// ══════════════════════════════════════════════════════════════════════════════
function sDetail(scene, ctx, shots) {
  const { id, th, at, du } = ctx;
  const shot = shots[0] || null;
  const head = fitLines(scene.headline || scene.title || "", U(1400) / CAM_SAFE, U(58), 1);
  // Anchors authored against the reference's own three-spot composition, with the first pushed
  // clear of the window's title bar. The window opens at y=250 and its chrome runs to 296, so
  // the reference's ay=300 put the callout ON the URL bar — annotating the browser rather than
  // the product, which is the one thing this beat exists not to do.
  const SPOTS = [
    { ax: 560, ay: 380, tx: 980, ty: 400, bend: -60, align: "left" },
    { ax: 560, ay: 600, tx: 1000, ty: 590, bend: 60, align: "left" },
    { ax: 1560, ay: 790, tx: 1360, ty: 690, bend: -60, align: "right" },
  ];
  const list = bullets(scene, 3).slice(0, 3);
  const spots = SPOTS.slice(0, Math.max(1, list.length));

  const html = open(ctx, `
    <div class="${id}-head" style="position:absolute;left:${r(U(260))}cqw;width:${r(U(1400))}cqw;top:${r(U(96))}cqw;text-align:center;opacity:0;z-index:6;">
      <div style="font-family:${th.displayStack};font-weight:700;font-size:${r(head.size)}cqw;letter-spacing:-0.02em;color:${th.ink};">${esc(head.lines.join(" "))}</div>
    </div>
    ${shot ? browserFrame(th, { cls: `${id}-win`, x: U(370), y: U(250), w: U(1180), h: U(660), url: ctx.url, inner: shotFill(shot) }) : ""}
    ${spots.map((sp, i) => arrowSvg(`${id}-ar${i}`, [sp.ax, sp.ay], [sp.tx, sp.ty], sp.bend, th.accent)).join("")}
    ${spots.map((sp, i) => (list[i] ? calloutHtml(`${id}-co${i}`, th, { x: sp.ax, y: sp.ay - 20, num: String(i + 1), text: wordsOf(list[i]).slice(0, 3).join(" "), align: sp.align }) : "")).join("")}`);

  const s = [
    `tl.set("#${id}",{opacity:1},${r(ctx.T)});`,
    `tl.fromTo(".${id}-head",{opacity:0,y:"${r(U(36))}cqw"},{opacity:1,y:0,duration:${du(0.6)},ease:"back.out(1.5)"},${at(0.25)});`,
    shot ? `tl.fromTo(".${id}-win",{opacity:0,scale:0.95},{opacity:1,scale:1,duration:${du(1.0)},ease:"back.out(1.1)"},${at(0.3)});` : "",
    ...spots.flatMap((sp, i) => [
      `tl.to(".${id}-ar${i}-p",{strokeDashoffset:0,duration:${du(0.55)},ease:"power2.out"},${at(1.4 + i * 0.62)});`,
      `tl.fromTo(".${id}-ar${i}-h",{scale:0},{scale:1,duration:${du(0.28)},ease:"back.out(2.4)"},${at(1.85 + i * 0.62)});`,
      list[i] ? `tl.fromTo(".${id}-co${i}",{opacity:0,scale:0.5},{opacity:1,scale:1,duration:${du(0.4)},ease:"back.out(2.4)"},${at(1.6 + i * 0.62)});` : "",
    ]).filter(Boolean),
    ...cameraTweens(id, ctx),
    ...ambient(ctx),
  ].filter(Boolean);
  return { html, s };
}

// ══════════════════════════════════════════════════════════════════════════════
// SCENE 4 — MOBILE
// The phone rises from the bottom on the left, copy sets right-aligned on the right, and a
// cursor taps the screen. Wants a PORTRAIT picture — a 16:9 desktop capture dropped into a
// 0.46:1 phone screen is cropped to a vertical sliver, so the slot asks for that shape and
// the beat is skipped when nothing close is available.
// ══════════════════════════════════════════════════════════════════════════════
function sMobile(scene, ctx, shots) {
  const { id, th, at, du } = ctx;
  const shot = shots[0] || null;
  const eyebrow = String(scene.kicker || STRINGS.mobile).toUpperCase().slice(0, 30);
  const head = fitLines(scene.headline || scene.title || "", U(620) / CAM_SAFE, U(82), 3);
  const list = bullets(scene, 2);
  const callout = list[0] ? wordsOf(list[0]).slice(0, 3).join(" ") : "";

  const html = open(ctx, `
    <div class="${id}-copy" style="position:absolute;right:${r(U(130))}cqw;top:${r(U(300))}cqw;width:${r(U(620))}cqw;text-align:right;opacity:0;z-index:4;">
      <div style="font-family:${th.monoStack};font-size:${r(U(16))}cqw;letter-spacing:0.2em;color:${th.accent};margin-bottom:${r(U(14))}cqw;text-transform:uppercase;">${esc(eyebrow)}</div>
      <div style="font-family:${th.displayStack};font-weight:700;font-size:${r(head.size)}cqw;line-height:0.98;letter-spacing:-0.02em;color:${th.ink};">${head.lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join("")}</div>
    </div>
    ${shot ? phoneFrame(th, { cls: `${id}-ph`, x: U(380), y: U(130), w: U(372), h: U(780), inner: shotFill(shot, { focus: "center top" }) }) : ""}
    ${shot ? arrowSvg(`${id}-ar`, [820, 420], [610, 380], 50, th.accent) : ""}
    ${shot && callout ? calloutHtml(`${id}-co`, th, { x: 840, y: 400, num: "1", text: callout }) : ""}
    ${shot ? cursorSvg(`${id}-cur`, th, [900, 780], [566, 620]) : ""}`);

  const s = [
    `tl.set("#${id}",{opacity:1},${r(ctx.T)});`,
    `tl.fromTo(".${id}-copy",{opacity:0,y:"${r(U(40))}cqw"},{opacity:1,y:0,duration:${du(0.7)},ease:"back.out(1.5)"},${at(0.5)});`,
    shot ? `tl.fromTo(".${id}-ph",{y:"${r(U(820))}cqw"},{y:0,duration:${du(1.25)},ease:"back.out(1.1)"},${at(0.3)});` : "",
    shot ? `tl.to(".${id}-ar-p",{strokeDashoffset:0,duration:${du(0.6)},ease:"power2.out"},${at(1.55)});` : "",
    shot ? `tl.fromTo(".${id}-ar-h",{scale:0},{scale:1,duration:${du(0.28)},ease:"back.out(2.4)"},${at(2.05)});` : "",
    shot && callout ? `tl.fromTo(".${id}-co",{opacity:0,scale:0.5},{opacity:1,scale:1,duration:${du(0.4)},ease:"back.out(2.4)"},${at(1.75)});` : "",
    ...(shot ? cursorTweens(`${id}-cur`, ctx, [900, 780], [566, 620], 2.0, 1.3) : []),
    ...cameraTweens(id, ctx),
    ...ambient(ctx),
  ].filter(Boolean);
  return { html, s };
}

// ══════════════════════════════════════════════════════════════════════════════
// SCENE 5 — MONTAGE
// Every screen at once: tiles fly in from staggered directions under a centred headline.
//
// THE GRID FITS THE PICTURES, NOT THE OTHER WAY ROUND. The reference tiles a fixed six. With
// four assets that leaves two hollow browser windows, which is precisely the empty-container
// defect QA has already blocked twice on this program — so the layout is chosen by how many
// pictures actually arrived, and the beat is skipped below two.
// ══════════════════════════════════════════════════════════════════════════════
const TILE_GRIDS = {
  2: [{ x: 96, y: 250, w: 864, h: 580 }, { x: 984, y: 250, w: 840, h: 580 }],
  3: [{ x: 96, y: 250, w: 560, h: 580 }, { x: 672, y: 250, w: 560, h: 580 }, { x: 1248, y: 250, w: 576, h: 580 }],
  4: [{ x: 96, y: 250, w: 864, h: 320 }, { x: 984, y: 250, w: 840, h: 320 },
    { x: 96, y: 606, w: 864, h: 320 }, { x: 984, y: 606, w: 840, h: 320 }],
  5: [{ x: 96, y: 250, w: 560, h: 320 }, { x: 672, y: 250, w: 560, h: 320 }, { x: 1248, y: 250, w: 576, h: 320 },
    { x: 96, y: 606, w: 864, h: 320 }, { x: 984, y: 606, w: 840, h: 320 }],
  6: [{ x: 96, y: 250, w: 540, h: 320 }, { x: 670, y: 250, w: 380, h: 320 }, { x: 1084, y: 250, w: 740, h: 320 },
    { x: 96, y: 606, w: 380, h: 320 }, { x: 510, y: 606, w: 620, h: 320 }, { x: 1164, y: 606, w: 660, h: 320 }],
};
const TILE_DIRS = [[-1, 0], [0, -1], [1, 0], [0, 1], [0, 1], [1, 1]];

function sMontage(scene, ctx, shots) {
  const { id, th, at, du } = ctx;
  const n = Math.min(6, shots.length);
  const grid = TILE_GRIDS[n] || TILE_GRIDS[2];
  const head = fitLines(scene.headline || scene.title || "", U(1400) / CAM_SAFE, U(66), 1);

  // The tile is the positioned box; the window inside it is pinned to that box's own origin,
  // so the fly-in transform lives on ONE node and the chrome never drifts against its picture.
  const tiles = grid.map((t, i) => `<div class="${id}-t${i}" style="position:absolute;left:${r(U(t.x))}cqw;top:${r(U(t.y))}cqw;width:${r(U(t.w))}cqw;height:${r(U(t.h))}cqw;opacity:0;">
      ${browserFrame(th, { cls: `${id}-tf${i}`, x: 0, y: 0, w: U(t.w), h: U(t.h), url: ctx.url, inner: shotFill(shots[i]), z: 1 })}
    </div>`).join("");

  const html = open(ctx, `
    <div class="${id}-head" style="position:absolute;left:${r(U(260))}cqw;width:${r(U(1400))}cqw;top:${r(U(96))}cqw;text-align:center;opacity:0;z-index:6;">
      <div style="font-family:${th.displayStack};font-weight:700;font-size:${r(head.size)}cqw;letter-spacing:-0.02em;color:${th.ink};">${esc(head.lines.join(" "))}</div>
    </div>
    <div class="${id}-drift" style="position:absolute;inset:0;">${tiles}</div>`);

  const s = [
    `tl.set("#${id}",{opacity:1},${r(ctx.T)});`,
    `tl.fromTo(".${id}-head",{opacity:0,y:"${r(U(36))}cqw"},{opacity:1,y:0,duration:${du(0.55)},ease:"back.out(1.5)"},${at(0.2)});`,
    ...grid.map((t, i) => {
      const d = TILE_DIRS[i] || [0, 1];
      return `tl.fromTo(".${id}-t${i}",{opacity:0,x:"${r(d[0] * U(500))}cqw",y:"${r(d[1] * U(400))}cqw",scale:0.9},{opacity:1,x:0,y:0,scale:1,duration:${du(1.0)},ease:"back.out(1.3)"},${at(0.55 + i * 0.26)});`;
    }),
    `tl.to(".${id}-drift",{y:"${r(U(10))}cqw",duration:3.4,ease:"sine.inOut",repeat:${reps(ctx.L, 3.4)},yoyo:true},${at(1.0)});`,
    ...cameraTweens(id, ctx),
    ...ambient(ctx),
  ].filter(Boolean);
  return { html, s };
}

// ══════════════════════════════════════════════════════════════════════════════
// SCENE 6 — PROOF
// Three panel cards pop in under a centred headline, each counting a real figure up from
// zero. Needs at least two numbers in the beat — a proof card printing an invented statistic
// is the exact defect the agent audit closed, so nothing here is fabricated.
// ══════════════════════════════════════════════════════════════════════════════
function sProof(scene, ctx) {
  const { id, th, at, du } = ctx;
  const stats = numbersIn(scene).slice(0, 3);
  const head = fitLines(scene.headline || scene.title || "", U(1400) / CAM_SAFE, U(80), 2);
  const cardW = stats.length >= 3 ? U(400) : U(480);

  const cards = stats.map((st, i) => `<div class="${id}-c${i}" style="background:${th.panel};border:1px solid ${th.line};border-radius:${r(U(24))}cqw;box-shadow:0 ${r(U(20))}cqw ${r(U(50))}cqw ${rgba(th.ink, 0.1)};padding:${r(U(44))}cqw ${r(U(40))}cqw;text-align:center;width:${r(cardW)}cqw;opacity:0;">
      <div style="font-family:${th.displayStack};font-weight:700;font-size:${r(U(96))}cqw;line-height:1;letter-spacing:-0.03em;color:${th.accent};white-space:nowrap;"><span class="${id}-n${i}">0</span>${esc(st.suffix)}</div>
      <div style="font-family:${th.monoStack};font-size:${r(U(16))}cqw;letter-spacing:0.16em;color:${th.sub};margin-top:${r(U(10))}cqw;white-space:nowrap;overflow:hidden;">${esc(statLabel(scene, i))}</div>
    </div>`).join("");

  const html = open(ctx, `
    <div class="${id}-head" style="position:absolute;left:${r(U(260))}cqw;width:${r(U(1400))}cqw;top:${r(U(200))}cqw;text-align:center;opacity:0;">
      <div style="font-family:${th.displayStack};font-weight:700;font-size:${r(head.size)}cqw;line-height:1.04;letter-spacing:-0.02em;color:${th.ink};">${head.lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join("")}</div>
    </div>
    <div style="position:absolute;left:0;right:0;top:${r(U(430))}cqw;display:flex;justify-content:center;align-items:flex-start;gap:${r(U(50))}cqw;">${cards}</div>`);

  const s = [
    `tl.set("#${id}",{opacity:1},${r(ctx.T)});`,
    `tl.fromTo(".${id}-head",{opacity:0,y:"${r(U(36))}cqw"},{opacity:1,y:0,duration:${du(0.6)},ease:"back.out(1.5)"},${at(0.2)});`,
    // THE TRUE FIGURE HOLDS FOR MOST OF THE BEAT. A count-up is standard motion design, but
    // every frame before it lands prints a number that is not the real one — and this film is
    // frame-sampled by review. Running the last card home by ~2.0s of a 4.4s beat means the
    // great majority of sampled frames show the figure the script actually claimed.
    ...stats.flatMap((st, i) => {
      const num = Number(String(st.v).replace(/,/g, "")) || 0;
      const dp = String(st.v).includes(".") ? 1 : 0;   // keep whatever precision the source carried
      return [
        `tl.fromTo(".${id}-c${i}",{opacity:0,scale:0.6},{opacity:1,scale:1,duration:${du(0.45)},ease:"back.out(2.4)"},${at(0.7 + i * 0.28)});`,
        `tl.fromTo(".${id}-n${i}",{innerText:0},{innerText:${num},duration:${du(0.7)},ease:"power2.out",snap:{innerText:${dp ? 0.1 : 1}},onUpdate:function(){var e=document.querySelector(".${id}-n${i}");if(e)e.textContent=Number(e.textContent).toFixed(${dp});}},${at(0.82 + i * 0.28)});`,
      ];
    }),
    ...cameraTweens(id, ctx),
    ...ambient(ctx),
  ].filter(Boolean);
  return { html, s };
}

// ══════════════════════════════════════════════════════════════════════════════
// SCENE 7 — CALL TO ACTION
// The mark pops, the headline rises, then the accent pill and the address arrive together.
// Everything is centred on the stage: this is the one beat with no asset panel, so the type
// carries it. The logo tile is drawn only when a logo exists.
// ══════════════════════════════════════════════════════════════════════════════
function sCall(scene, ctx, logo) {
  const { id, th, at, du } = ctx;
  const hasMark = !!(logo && logo.path);
  const headText = scene.headline || scene.emphasis || ctx.title || ctx.brand;
  const head = fitLines(headText, U(1500) / CAM_SAFE, U(118), 2);
  const action = clampWords(String(scene.emphasis || ""), 20) || STRINGS.start;
  const url = ctx.url || domainOf(scene.subtext) || domainOf(scene.emphasis);

  const mark = hasMark
    ? `<div class="${id}-logo" style="width:${r(U(132))}cqw;height:${r(U(132))}cqw;border-radius:${r(U(30))}cqw;background:${th.panel};border:1px solid ${th.line};box-shadow:0 ${r(U(20))}cqw ${r(U(50))}cqw ${rgba(th.ink, 0.12)};overflow:hidden;padding:${r(U(16))}cqw;margin-bottom:${r(U(30))}cqw;display:flex;align-items:center;justify-content:center;opacity:0;">${logoMark(logo, { sizeCqw: U(96), ground: th.panel, glow: null, escape: esc })}</div>`
    : "";

  const html = open(ctx, `
    <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 ${r(U(210))}cqw;">
      ${mark}
      <div class="${id}-head" style="font-family:${th.displayStack};font-weight:700;font-size:${r(head.size)}cqw;line-height:0.98;letter-spacing:-0.03em;color:${th.ink};text-align:center;opacity:0;">${head.lines.map((l) => `<span style="display:block;">${esc(l)}</span>`).join("")}</div>
      <div class="${id}-pill" style="margin-top:${r(U(40))}cqw;display:flex;align-items:center;gap:${r(U(22))}cqw;opacity:0;">
        <div style="display:inline-flex;align-items:center;gap:${r(U(12))}cqw;padding:${r(U(20))}cqw ${r(U(42))}cqw;border-radius:${r(U(14))}cqw;background:${th.accent};color:${onAccent(th)};font-family:${th.displayStack};font-weight:600;font-size:${r(fitOne(action, U(420), U(28)))}cqw;box-shadow:0 ${r(U(14))}cqw ${r(U(34))}cqw ${rgba(th.accent, 0.4)};white-space:nowrap;text-transform:uppercase;">${esc(action)} <span class="${id}-arw" style="font-size:${r(U(30))}cqw;display:inline-block;">→</span></div>
        ${url ? `<div style="font-family:${th.monoStack};font-size:${r(U(20))}cqw;letter-spacing:0.1em;color:${th.sub};white-space:nowrap;">${esc(url)}</div>` : ""}
      </div>
    </div>`);

  const s = [
    `tl.set("#${id}",{opacity:1},${r(ctx.T)});`,
    hasMark ? `tl.fromTo(".${id}-logo",{opacity:0,scale:0.4},{opacity:1,scale:1,duration:${du(0.8)},ease:"back.out(2.0)"},${at(0.3)});` : "",
    `tl.fromTo(".${id}-head",{opacity:0,y:"${r(U(50))}cqw"},{opacity:1,y:0,duration:${du(0.8)},ease:"back.out(1.5)"},${at(0.55)});`,
    `tl.fromTo(".${id}-pill",{opacity:0,scale:0.5},{opacity:1,scale:1,duration:${du(0.6)},ease:"back.out(2.2)"},${at(1.3)});`,
    `tl.to(".${id}-arw",{x:"${r(U(10))}cqw",duration:0.8,ease:"sine.inOut",repeat:${reps(Math.max(0, ctx.L - 1.9 * ctx.k), 0.8)},yoyo:true},${at(1.9)});`,
    ...cameraTweens(id, ctx),
    ...ambient(ctx),
  ].filter(Boolean);
  return { html, s };
}

// ---- the spine ---------------------------------------------------------------
// SEVEN NAMED SCENES, IN ORDER — the reference's SCENE_MAP is a fixed sequence and this is
// its port. The first beat is always the intro, the last always the call, and the middle
// beats walk the five middle layouts in their authored order. A layout is SKIPPED, never
// faked, when the beat cannot carry it; the cursor walks forward either way, so scene ORDER
// is always preserved — a film may show three of the five middle layouts, never a reshuffle.
const BUILDERS = {
  intro: sIntro, tour: sTour, detail: sDetail, mobile: sMobile, montage: sMontage, proof: sProof, call: sCall,
  statement: (sc, ctx, sh) => sStatement(sc, ctx, sh, { centred: false }),
  "statement-c": (sc, ctx, sh) => sStatement(sc, ctx, sh, { centred: true }),
};
const MIDDLE = ["tour", "detail", "mobile", "montage", "proof"];

// How many pictures each layout will actually DRAW, and the shape each of its boxes wants.
// Ratio matters as much as rank: the phone screen is 0.46:1, and a 1.78:1 desktop capture
// dropped into it is cropped to a vertical sliver of itself.
const SLOT_SHAPES = {
  intro: [1120 / (590 - 46)],                 // 2.06 — the hero window's inner area
  tour: [1000 / (620 - 46)],                  // 1.74
  detail: [1180 / (660 - 46)],                // 1.92
  mobile: [348 / 756],                        // 0.46 — the phone screen
  montage: [1.97, 1.39, 2.70, 1.39, 2.26, 2.41],
  proof: [], call: [], statement: [], "statement-c": [],
};
function slotsFor(role, available) {
  if (role === "montage") return Math.min(6, Math.max(0, available));
  if (role === "intro" || role === "tour" || role === "detail" || role === "mobile") return 1;
  return 0;
}
function canCarry(role, scene, freeShots) {
  const list = bullets(scene, 4).length;
  if (role === "tour") return freeShots >= 1;
  if (role === "detail") return freeShots >= 1 && list >= 1;
  if (role === "mobile") return freeShots >= 1;
  if (role === "montage") return freeShots >= 2;
  if (role === "proof") return numbersIn(scene).length >= 2;
  return true;
}
// `freeShots` is the count still unclaimed when this beat is reached, so a five-scene film
// with two pictures does not promise the montage six boxes it will never fill.
function assignRoles(scenes, totalShots) {
  const n = scenes.length;
  if (n === 1) return ["intro"];
  const roles = new Array(n).fill(null);
  roles[0] = "intro";
  roles[n - 1] = "call";
  let budget = Math.max(0, totalShots - 1);   // the intro takes the first picture
  let cur = 0, dry = 0;
  for (let i = 1; i < n - 1; i++) {
    let pick = null;
    for (let step = 0; step < MIDDLE.length; step++) {
      const cand = MIDDLE[(cur + step) % MIDDLE.length];
      if (canCarry(cand, scenes[i], budget)) { pick = cand; cur = (cur + step + 1) % MIDDLE.length; break; }
    }
    // NOTHING FIT — the film has run out of pictures, so the beat gets the STATEMENT layout,
    // which is designed to be pictureless rather than degraded into being pictureless.
    // Alternating its two alignments matters more than it looks: an asset-poor film that
    // prints the identical composition three and four times running reads as a stuck render
    // rather than as a design.
    if (!pick) { pick = dry++ % 2 ? "statement-c" : "statement"; cur = (cur + 1) % MIDDLE.length; }
    roles[i] = pick;
    budget = Math.max(0, budget - slotsFor(pick, budget));
  }
  return roles;
}

// ---- style -------------------------------------------------------------------
function styleBlock(th) {
  return `${th.fontFace}
  * { box-sizing:border-box; margin:0; padding:0; }
  html, body { width:100%; height:100%; overflow:hidden; background:${th.bg}; }
  #root { position:relative; overflow:hidden; isolation:isolate; background:${th.bg}; container-type:size; color:${th.ink}; font-family:${th.displayStack}; }
  .clip { position:absolute; top:0; left:0; width:100%; height:100%; overflow:hidden; }
  .sc-scene { background:${th.bg}; }
  /* The camera layer. Everything the beat draws rides it; the background wash and the tour
     HUD do not, which is what makes the reference's hard cuts read as cuts. */
  .sc-cam { position:absolute; inset:0; will-change:transform, opacity; transform-origin:center center; }
  .sc-chrome { position:absolute; inset:0; pointer-events:none; z-index:40; }
  /* .kw / .kwi are the names caption_render.js's SHAPING_FIX targets — a non-Latin video-text
     language relies on the overflow being neutralised HERE. */
  .kw { display:block; overflow:hidden; }
  .kwi { display:block; will-change:transform; }
  /* The caption sits in the bottom margin, clear of the progress rule, and is one node for
     the whole film — seek-safe, and the single choke point multilang injection targets. */
  #caps { position:absolute; inset:0; display:flex; justify-content:center; align-items:flex-end; padding:0 ${r(U(160))}cqw ${r(U(96))}cqw; z-index:60; pointer-events:none; }
  #cap-pill { max-width:${r(U(1400))}cqw; height:fit-content; flex:0 0 auto; text-align:center; opacity:0; background:${rgba("#FFFFFF", 0.88)}; border-radius:${r(U(12))}cqw; padding:${r(U(12))}cqw ${r(U(24))}cqw; box-shadow:0 ${r(U(8))}cqw ${r(U(24))}cqw ${rgba(th.ink, 0.12)}; }
  #cap-text { font-family:${th.displayStack}; font-weight:600; font-size:${r(U(30))}cqw; line-height:1.3; letter-spacing:-0.01em; color:${th.ink}; }`;
}

// ---- MAIN --------------------------------------------------------------------
// IT CUTS. There is no crossfade and no transition overlay: a scene's clip ends exactly where
// the next begins. That is the reference's own `transition="cut"`, and it is only legible
// because the chrome is identical across the cut and the camera has pushed out before it.
function buildComposition({ storyboard, dims, framePack, captionCues, assets, brandSkin = null, localized = null, seedKey = null } = {}) {
  const th = showcaseTheme(brandSkin);
  const S = localized ? { ...STRINGS, ...localized } : STRINGS;
  const sb = storyboard || {};
  const W = (dims && dims.width) || STAGE_W, H = (dims && dims.height) || STAGE_H;
  const title = String(sb.title || "").trim();
  const scenes = Array.isArray(sb.scenes) && sb.scenes.length
    ? sb.scenes.slice(0, 12)
    : [{ id: "s1", start: 0, duration: 5, kind: "hook", headline: title }];
  // After `scenes`, because the brand may have to be recovered from a scene's own address.
  const brand = resolveBrandName(title, scenes) || "SHOWCASE";
  const D = r(sb.durationSec || scenes.reduce((a, x) => Math.max(a, (Number(x.start) || 0) + (Number(x.duration) || 0)), 0) || 12);
  const filmUrl = scenes.map((sc) => domainOf(sc.subtext) || domainOf(sc.emphasis)).find(Boolean) || domainOf(title) || `${String(brand).toLowerCase().replace(/[^a-z0-9]/g, "")}.com`;

  const logo = logoAssetOf(assets);
  const shots = (Array.isArray(assets) ? assets : []).filter(screenOk)
    .sort((a, b) => (Number(b.cdScore) || 0) - (Number(a.cdScore) || 0));

  // Roles first, then assets — how many pictures a beat can hold is a property of the LAYOUT
  // it was given, not of the beat. Assigning the other way round is what produced the
  // previous ports' stranded shots (placed on a beat that draws no panel).
  const roles = assignRoles(scenes, shots.length);
  const sceneIdOf = (i) => (scenes[i].id != null ? String(scenes[i].id) : `s${i + 1}`);
  const sceneShots = scenes.map(() => []);

  // BREADTH BEFORE DEPTH. Every scene's first box, in scene order, before any scene's second
  // — otherwise the montage takes six pictures and three later beats get none, which is a
  // film that front-loads its imagery and then goes blank.
  const slots = [];
  const maxSlots = Math.max(0, ...roles.map((role) => slotsFor(role, shots.length)));
  for (let rank = 0; rank < maxSlots; rank++) {
    roles.forEach((role, i) => {
      if (slotsFor(role, shots.length) <= rank) return;
      const shapes = SLOT_SHAPES[role] || [];
      slots.push({ i, target: shapes[rank] || shapes[0] || 1.6 });
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
      // mild shape mismatch — but not an extreme one, where honouring it would crop the
      // picture to nothing while another asset fills the slot edge to edge. The phone screen
      // is where this bites hardest, so misfit is weighted heavily.
      const hint = String(shots[a].sceneId != null ? shots[a].sceneId : "") === sceneIdOf(slot.i) ? 4 : 0;
      const own = isOwnAsset(shots[a]) ? 3 : 0;
      const score = (Number(shots[a].cdScore) || 0) + hint + own - 3 * misfit;
      if (score > bestScore) { bestScore = score; pick = a; }
    }
    if (pick < 0) break;   // out of pictures — the remaining layouts fall back to type
    taken.add(pick);
    sceneShots[slot.i].push(shots[pick]);
  }

  const scriptStart = (i) => scenes.slice(0, i).reduce((a, x) => a + (Number(x.duration) || 0), 0);
  const LABELS = { intro: S.tour, tour: S.feature, detail: S.how, mobile: S.mobile, montage: S.everything, proof: S.numbers, call: S.start };
  const bodyParts = [], sceneScripts = [];

  scenes.forEach((scene, i) => {
    const T = r(scene.start != null ? scene.start : scriptStart(i));
    const L = r(scene.duration || 5);
    const isLast = i === scenes.length - 1;
    const clipDur = isLast ? Math.max(0.1, D - T) : L;
    let role = roles[i] || "tour";
    // LAST GATE BEFORE DRAWING. Roles were assigned against a BUDGET; this is the beat's
    // actual hand. A montage that ended up with one picture, or a mobile/detail beat with
    // none, would draw hollow device frames — so it degrades to `tour`, the one middle layout
    // that is complete without a picture.
    const got = sceneShots[i].length;
    if ((role === "montage" && got < 2) || ((role === "mobile" || role === "detail") && got < 1)) role = "statement";
    const k = Math.min(1, L / REF_BEAT);
    const ctx = {
      id: `s${i + 1}`, T, L, clipDur, i, isLast, track: 2 + i, th, S, W, H, k,
      at: (sec) => r(T + sec * k),
      du: (sec) => r(Math.max(0.06, sec * k)),
      title, brand: String(brand).slice(0, 22),
      label: LABELS[role] || "", total: scenes.length, url: filmUrl,
    };
    const built = (BUILDERS[role] || BUILDERS.statement)(scene, ctx, role === "call" ? logo : sceneShots[i]);
    bodyParts.push(built.html);
    sceneScripts.push([...built.s, ...chromeTweens(ctx, D)].filter(Boolean).join("\n  "));
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
    `<style>`, styleBlock(th), `</style>`, `</head>`, `<body>`,
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
// like before a single pixel is drawn, so both are asserted directly.
module.exports.__test = {
  assignRoles, canCarry, slotsFor, numbersIn, fitLines, fitOne, showcaseTheme, statLabel,
  domainOf, screenOk, isOwnAsset, U, MIDDLE, SLOT_SHAPES, TILE_GRIDS, spin,
};
