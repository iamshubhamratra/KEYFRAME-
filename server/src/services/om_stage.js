// OM STAGE — the shared composer engine behind the seven imported "Animated video
// template" packs (organic-garden, lantern-night, daybreak-bakehouse, story-blocks,
// poster-pop, premiere-night, hype-wave).
//
// WHY ONE ENGINE. The seven arrived as seven self-contained React/`dc-runtime` bundles,
// but they are one film built seven ways: every file exports the SAME six-beat
// `SCENE_MAP` (Hook / Statement / Feature / Montage / Stats / CTA), the same per-scene
// `progress` 0..1 contract, the same `Frame` wrapper (persistent world backdrop → camera
// layer → chrome), the same `MediaSlot` drop target, and the same `theme` shape. What
// actually differs is the WORLD (petals, lanterns, sunrise, panels, poster, premiere,
// hype), the palette, the fonts and the cut. So the beats, layout, asset routing, text
// fitting, captions and timeline live here ONCE, and each pack ships a ~200-line SKIN.
// Seven copies of this file would have been seven places to fix every future bug.
//
// THE PORT. React + a wall-clock ticker cannot be rendered by HyperFrames, so the
// runtime is replaced by KEYFRAME's contract while the DESIGN is kept intact:
//   • per-scene `progress` → a paused GSAP timeline seeked by the renderer
//   • the world's continuous `clock` → ONE <canvas> painted purely from hf-seek time
//     (the deterministic pattern proven in kinetic_universe_composer), also driven off
//     the timeline's onUpdate so it animates in live preview
//   • the fixed six `OM_SCENES` → whatever the storyboard hands us; the six beats map
//     1:1 onto KEYFRAME's own scene purposes, which is why this port fits so cleanly
//   • `MediaSlot`'s "DROP IMAGE TO REPLACE" dashed box → real assets in real device
//     frames, with the dashed box gone entirely (a placeholder must never ship)
//   • `OM_TWEAKS` brand colours → the Art Director's skin, hue-rotated onto the pack's
//     authored luminances so a brand recolours the whole world, not just the text
//
// Engineering contract (identical to every other native composer): one paused GSAP
// timeline on window.__timelines["vid"]; direct-child .clip layers on unique tracks; a
// boundary opacity:0 hard-kill per scene; ONE seek-safe caption node (#cap-text) driven
// by a single onUpdate proxy; finite repeats; cqw units + container-type:size; hidden =
// inline opacity:0 only (never gsap.set); no Math.random / Date / rAF at runtime.

const { fontFaceCss, isBundled } = require("../fonts/pack_fonts");
const { isTrustedProminent, isLogo, categorize } = require("./asset_priority");
const { resolveBrand } = require("./brand_kit");
const { safeArea } = require("./responsive");

const GSAP_CDN = "https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js";

// ---- helpers -----------------------------------------------------------------
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
const r = (n) => Math.round((Number(n) || 0) * 100) / 100;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

// The AUTHORED reference frame — every source template is 1080×1920, and every
// measurement below is lifted from them and expressed as a fraction of it, so the
// compositions keep their exact proportions at any output size.
//   X() — sizes, gaps, borders and every HEIGHT (cqw is always definite, so a box never
//         collapses the way a percentage height inside an auto-height parent does)
//   V() — vertical POSITION only, on a full-frame absolute layer
const RW = 1080, RH = 1920;
const X = (px) => `${r((px / RW) * 100)}cqw`;
const V = (px) => `${r((px / RH) * 100)}%`;

// Type scale keyed on the SHORT side (responsive.typeScale's law) so a landscape render
// does not blow the display type up. Portrait — the authored aspect — resolves to 1.
// Set once per build; build() is fully synchronous so this can never interleave.
let TSCALE = 1;
const F = (px) => X(px * TSCALE);

const reps = (t, c) => Math.max(0, Math.floor((Number(t) || 0) / (c || 1)) - 1);
const yoyoReps = (t, c) => reps(t, c) * 2 + 1;

// Deterministic PRNG — BUILD time only, so re-renders are byte-identical while two jobs
// never share a rhythm.
function seedFrom(str) {
  let h = 2166136261; const s = String(str || "om");
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) || 7;
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- colour maths (shared with the other native packs) ------------------------
const hexToRgb = (h) => { const n = parseInt(String(h).replace("#", ""), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const toHex2 = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
const relLum = (h) => {
  const [r0, g0, b0] = hexToRgb(h).map((v) => v / 255);
  const f = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * f(r0) + 0.7152 * f(g0) + 0.0722 * f(b0);
};
const ratio = (a, b) => { const la = relLum(a), lb = relLum(b); const [hi, lo] = la > lb ? [la, lb] : [lb, la]; return (hi + 0.05) / (lo + 0.05); };
const rgbToHsl = ([r0, g0, b0]) => {
  r0 /= 255; g0 /= 255; b0 /= 255;
  const mx = Math.max(r0, g0, b0), mn = Math.min(r0, g0, b0), l = (mx + mn) / 2, d = mx - mn;
  if (!d) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r0 ? (g0 - b0) / d + (g0 < b0 ? 6 : 0) : mx === g0 ? (b0 - r0) / d + 2 : (r0 - g0) / d + 4;
  return [h * 60, s, l];
};
const hslHex = (h, s, l) => {
  if (!s) return `#${toHex2(l * 255).repeat(3)}`;
  const t = (((h % 360) + 360) % 360) / 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const ch = (x) => { if (x < 0) x += 1; if (x > 1) x -= 1; if (x < 1 / 6) return p + (q - p) * 6 * x; if (x < 0.5) return q; if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6; return p; };
  return `#${toHex2(ch(t + 1 / 3) * 255)}${toHex2(ch(t) * 255)}${toHex2(ch(t - 1 / 3) * 255)}`;
};
const hueOf = (hex) => rgbToHsl(hexToRgb(hex))[0];
const LUM_PIN = 0.006;
// Rotate onto `hue` while bisecting HSL lightness back to the SOURCE's relative
// luminance, so a recoloured value keeps its exact place in the pack's value ladder.
function reHue(hex, hue) {
  const [, s] = rgbToHsl(hexToRgb(hex));
  if (s < 0.02) return hex;
  const target = relLum(hex);
  let lo = 0, hi = 1;
  for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (relLum(hslHex(hue, s, mid)) < target) lo = mid; else hi = mid; }
  const l = (lo + hi) / 2;
  let out = hex, err = Infinity;
  for (const dl of [0, -1 / 255, 1 / 255]) {
    const cand = hslHex(hue, s, l + dl);
    const e = Math.abs(relLum(cand) - target);
    if (e < err) { err = e; out = cand; }
  }
  return err <= LUM_PIN ? out : hex;
}
const rgba = (hex, a) => { const c = hexToRgb(hex); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; };
function brandLedOf(brand, packAccents) {
  const pack = new Set(packAccents.map((a) => String(a).toLowerCase()));
  const out = [];
  for (const a of brand.accents) { if (pack.has(String(a).toLowerCase())) break; out.push(a); }
  return out;
}

// ---- theme -------------------------------------------------------------------
// A skin declares its authored palette; the brand's own accents are hue-mapped onto it
// SLOT BY SLOT (primary→accent, secondary→accent2, …), each landing at that slot's
// authored luminance. The ground and ink rotate onto the brand's LEAD hue at pinned
// luminance too — that is what makes the whole world (petals, lanterns, sunrise beams,
// poster blocks, spotlights) read branded rather than "the same film with new text".
// Slots the brand doesn't reach cycle back through its hues, so a full-frame ground is
// never painted in a colour the user did not choose; a one-colour palette is the
// exception and rotates by the pack's own spacing so the film doesn't go monochrome.
//
// FAIL-OPEN (art_director.js:14): any resolver/reHue hiccup renders the authored
// palette, and a null skin returns the exact literals with a null resolvedBrand.
function buildTheme(skin, brandSkin) {
  const faces = [skin.display, skin.body, skin.mono].filter(Boolean).filter(isBundled);
  const fontFace = [...new Set(faces)].map(fontFaceCss).join("");
  const P0 = skin.palette;                       // authored, ordered
  const keys = Object.keys(P0);
  let out = { ...P0 }, resolvedBrand = null;
  try {
    const packAccents = skin.accents.map((k) => P0[k]);
    const brand = resolveBrand(brandSkin, { ground: P0[skin.groundKey], isDark: !!skin.dark, packAccents });
    const led = brandLedOf(brand, packAccents);
    if (brand.applied && led.length) {
      const brandH = led.map(hueOf);
      const packH = packAccents.map(hueOf);
      const last = brandH.length - 1;
      const hueFor = (i) => (i <= last ? brandH[i]
        : brandH.length >= 2 ? brandH[i % brandH.length]
          : brandH[0] + (packH[i] - packH[0]));
      // accent slots take the brand's hues in order
      skin.accents.forEach((k, i) => { out[k] = reHue(P0[k], ((hueFor(i) % 360) + 360) % 360); });
      // every remaining colour (grounds, surfaces, ink, glows) rotates onto the LEAD
      const lead = ((brandH[0] % 360) + 360) % 360;
      for (const k of keys) if (!skin.accents.includes(k)) out[k] = reHue(P0[k], lead);
      resolvedBrand = {
        ...(brandSkin && typeof brandSkin === "object" ? brandSkin : {}),
        accents: skin.accents.slice(0, 3).map((k) => out[k]),
        emphasis: brand.emphasis, adjusted: brand.adjusted, dropped: brand.dropped,
        tier: brand.tier, applied: true,
      };
    }
  } catch { out = { ...P0 }; resolvedBrand = null; }

  const ground = out[skin.groundKey];
  const ink = out[skin.inkKey];
  const paper = out[skin.paperKey || skin.groundKey];
  // Ink that actually READS on a given field — replaces every source template's
  // hardcoded light/dark assumption and stays correct for any brand hue.
  const onField = (bg) => (ratio(ink, bg) >= ratio(paper, bg) ? ink : paper);
  const typeOn = (hex, bg) => (ratio(hex, bg) >= 3 ? hex : onField(bg));

  return {
    c: out, ground, ink, paper, onField, typeOn,
    accent: out[skin.accents[0]], accent2: out[skin.accents[1]] || out[skin.accents[0]],
    accent3: out[skin.accents[2]] || out[skin.accents[1]] || out[skin.accents[0]],
    displayStack: `'${skin.display}', ${skin.displayFallback || "Georgia, serif"}`,
    bodyStack: `'${skin.body}', system-ui, sans-serif`,
    monoStack: skin.mono ? `'${skin.mono}', ui-monospace, monospace` : "ui-monospace, monospace",
    fontFace, resolvedBrand, dark: !!skin.dark,
  };
}

// ---- shared strings (a skin overrides any of these) --------------------------
const BASE_STRINGS = {
  hookKicker: "Start here",
  statementKicker: "The problem",
  featureKicker: "See it working",
  montageKicker: "Every angle",
  statsKicker: "By the numbers",
  ctaKicker: "Ready when you are",
  ctaButton: "Get started",
  ctaTagline: "One link away.",
  addressBar: "yourproduct.com",
  metric: "Metric",
  tiles: ["Home", "Detail", "Mobile", "Dashboard"],
};

// ---- content extraction ------------------------------------------------------
const wordsOf = (t) => String(t || "").trim().split(/\s+/).filter(Boolean);

function bullets(scene, n) {
  let list = Array.isArray(scene.onScreenText) ? scene.onScreenText.filter(Boolean).map(String) : [];
  if (!list.length && scene.subtext) {
    list = String(scene.subtext).split(/[.;\n•]|\s—\s/).map((s) => s.trim()).filter((s) => s.length > 2);
  }
  return list.slice(0, n);
}
function featureLines(scene, n) {
  let src = Array.isArray(scene.onScreenText) ? scene.onScreenText.filter(Boolean).map(String) : [];
  if (src.length < 2 && scene.voiceover) src = src.concat(String(scene.voiceover).split(/[.!?;\n]|\s—\s/));
  const head = String(scene.headline || "").toLowerCase().trim();
  const sub = String(scene.subtext || "").toLowerCase().trim();
  const seen = new Set(), out = [];
  for (const s of src) {
    const t = String(s).replace(/\s+/g, " ").trim();
    const k = t.toLowerCase();
    if (t.length >= 3 && t.length <= 72 && k !== head && k !== sub && !seen.has(k)) { seen.add(k); out.push(t); }
  }
  return out.slice(0, n);
}
// The source templates use "|" inside a title to force a line break — honoured when the
// storyboard happens to carry one, otherwise the fitter wraps.
const forcedLines = (t) => (String(t || "").includes("|") ? String(t).split("|").map((s) => s.trim()).filter(Boolean) : null);

const STAT_RE = /([$₹€£]?)\s?(\d[\d,]*(?:\.\d+)?)\s?(%|x|\+|k|m|bn?)?(?![A-Za-z])/i;
function pickNumber(scene) {
  const src = [scene.emphasis, scene.subtext, scene.headline, ...(Array.isArray(scene.onScreenText) ? scene.onScreenText : [])]
    .map((x) => String(x || "")).find((x) => /\d/.test(x)) || "";
  const m = STAT_RE.exec(src);
  if (!m) return null;
  const target = Math.round(parseFloat(m[2].replace(/,/g, "")));
  if (!isFinite(target)) return null;
  return { pre: m[1] || "", target: clamp(target, 0, 100000), suf: m[3] || "" };
}
function pickStats(scene, max, S) {
  const out = [];
  for (const l of (Array.isArray(scene.onScreenText) ? scene.onScreenText : [])) {
    const m = STAT_RE.exec(String(l));
    if (m && isFinite(parseFloat(m[2].replace(/,/g, "")))) {
      out.push({
        pre: m[1] || "", target: Math.round(parseFloat(m[2].replace(/,/g, ""))), suf: m[3] || "",
        label: String(l).replace(m[0], "").trim().slice(0, 28) || S.metric,
      });
    }
    if (out.length >= max) break;
  }
  if (!out.length) {
    const n = pickNumber(scene);
    if (n) out.push({ ...n, label: String(scene.subtext || scene.headline || S.metric).slice(0, 28) });
  }
  return out.slice(0, max);
}

// ---- display-type fitting ----------------------------------------------------
// Each skin declares its display face's average advance (em per character) — Anton is
// condensed at ~0.44, Archivo Black is very wide at ~0.84, and a single shared constant
// would either clip one or leave the other timid. Spaces are ~0.34em of that face.
// Both the wrap target and the final size derive from those numbers:
//   wrap target = column / (baseSize × em)
//   final size  = min(base, column / widest-line-advance)
// Animations key off ELEMENT COUNTS, never off text length, so dynamic copy cannot break
// the motion. Non-Latin scripts budget wider (the video-text language is injected AFTER
// this composer runs, at the writeIndexHtml choke point).
const WIDE_SCRIPT = /[ऀ-ॿ؀-ۿ　-ヿ一-鿿가-힯]/;
function fitLines(text, { basePx, maxLines, colPx, em, upper }) {
  const src = upper ? String(text || "").toUpperCase() : String(text || "");
  const forced = forcedLines(src);
  const col = colPx * 0.97;
  const per = WIDE_SCRIPT.test(src) ? Math.max(em, 1.05) : em;
  const advance = (s) => { let a = 0; for (const ch of String(s)) a += ch === " " ? per * 0.4 : per; return a || 1; };
  let lines;
  if (forced) {
    lines = forced.slice(0, maxLines);
  } else {
    const words = wordsOf(src);
    if (!words.length) return { lines: [], size: basePx };
    const target = Math.max(4, Math.floor(col / (basePx * per)));
    lines = []; let cur = "";
    for (const w of words) {
      if (!cur) { cur = w; continue; }
      if ((cur + " " + w).length > target && lines.length < maxLines - 1) { lines.push(cur); cur = w; }
      else cur += " " + w;
    }
    if (cur) lines.push(cur);
    lines = lines.slice(0, maxLines);
  }
  const widest = lines.reduce((a, l) => Math.max(a, advance(l)), 1);
  // min() only ever SHRINKS: short copy keeps the authored size, long copy comes down to
  // exactly what the column holds, so nothing can overflow the safe margin.
  return { lines, size: Math.min(basePx, col / widest) };
}
// Body/sub copy shrinks on length the same way.
function fitPx(text, basePx, targetCh, floor = 0.58) {
  const len = String(text || "").length || 1;
  return basePx * clamp(targetCh / len, floor, 1);
}

// ---- asset gates + presentation ----------------------------------------------
function shotOk(a) {
  if (!a || !a.path) return false;
  if (isLogo(a)) return false;
  if (a.type === "video" || /\.(mp4|webm|mov)($|\?)/i.test(a.path)) return false;
  if (/\.svg($|\?)/i.test(a.path)) return false;
  if (a.__layoutDemoted) return false;
  return isTrustedProminent(a) || a.cdProminence === "hero" || a.cdProminence === "support";
}
function markOk(a) {
  if (!a || !a.path) return false;
  if (a.type === "video" || /\.(mp4|webm|mov)($|\?)/i.test(a.path)) return false;
  const cat = categorize(a);
  return cat === "logo" || cat === "icon" || /\.svg($|\?)/i.test(a.path);
}
const logoAssetOf = (assets) =>
  (Array.isArray(assets) ? assets : []).find((a) => a && a.path && isLogo(a) && !/\.(mp4|webm|mov)($|\?)/i.test(a.path)) || null;

const ratioOf = (a) => Number(a && a.ratio) || (a && a.width && a.height ? a.width / a.height : 0);
// Presentation comes from the asset's REAL pixels, never from the scene. A TALL capture
// is ambiguous — the pipeline captures whole pages, so a 1440-wide site is routinely
// 3000px tall — and the discriminator is the capture's own WIDTH: a desktop viewport is
// ≥1000px wide however far the page scrolls. Get this wrong and a website screenshot is
// squeezed into a phone bezel.
function deviceFor(a) {
  const q = ratioOf(a);
  if (!q) return "card";
  if (q >= 1.2) return "browser";
  if (q <= 0.7) return (Number(a && a.width) || 0) >= 1000 ? "browser" : "phone";
  return "card";
}
function addressFrom(assets, S) {
  for (const a of Array.isArray(assets) ? assets : []) {
    const u = a && a.sourceUrl;
    if (!u) continue;
    try { const h = new URL(String(u)).hostname.replace(/^www\./, ""); if (h) return h; } catch { /* not a URL */ }
  }
  return S.addressBar;
}

// The in-frame capture pan. Travel is resolved HERE, at build time, from the asset's own
// ratio and the slot's known geometry — never measured from the DOM, which would depend
// on whether the image had decoded when the timeline was built. It rides yPercent
// (relative to the plate's OWN height), so it is exact at any output resolution.
const SCROLL_MIN = 0.03;
function scrollPlan(boxW, boxH, asset) {
  const q = ratioOf(asset);
  // With no asset the wireframe plate is AUTHORED tall so a prompt-only job still gets
  // the live-demo scroll rather than a static block.
  const natH = asset && asset.path ? (q ? boxW / q : 0) : boxH * 1.7;
  if (!natH || natH <= boxH) return { natH: 0, frac: 0 };
  const frac = (natH - boxH) / natH;
  return frac < SCROLL_MIN ? { natH: 0, frac: 0 } : { natH, frac };
}

// The plate inside a device window: the scrolling full-width capture, a static contained
// fit, or — with no asset — a generated wireframe built from the pack's own colours so an
// empty slot still reads as designed. The source's dashed "DROP IMAGE TO REPLACE" box is
// deliberately gone: a placeholder must never reach a rendered film.
function plate(theme, { asset, scrollId, natH, tint }) {
  if (asset && asset.path) {
    return scrollId && natH
      ? `<div id="${scrollId}" style="position:absolute;left:0;right:0;top:0;height:${X(natH)};"><img src="${esc(asset.path)}" alt="${esc(asset.alt || "")}" style="width:100%;height:100%;object-fit:cover;object-position:top center;display:block;"></div>`
      : `<img src="${esc(asset.path)}" alt="${esc(asset.alt || "")}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;object-position:center;display:block;">`;
  }
  const wire = wirePlate(theme, tint);
  return scrollId && natH
    ? `<div id="${scrollId}" style="position:absolute;left:0;right:0;top:0;height:${X(natH)};">${wire}</div>`
    : `<div style="position:absolute;inset:0;">${wire}</div>`;
}
function wirePlate(theme, tint) {
  const t = tint || theme.accent;
  const bar = (w, o) => `<div style="height:${X(28)};width:${w};border-radius:999px;background:${rgba(theme.ink, o)};flex:none;"></div>`;
  return `<div style="position:absolute;inset:0;padding:${X(32)} ${X(36)};box-sizing:border-box;display:flex;flex-direction:column;gap:${X(22)};background:${theme.paper};">
    <div style="display:flex;align-items:center;gap:${X(18)};flex:none;">
      <div style="width:${X(52)};height:${X(52)};border-radius:${X(14)};background:${t};flex:none;"></div>
      ${bar("38%", 0.14)}
      <div style="width:${X(120)};height:${X(36)};border-radius:999px;background:${rgba(theme.accent2, 0.85)};flex:none;margin-left:auto;"></div>
    </div>
    <div style="height:${X(250)};border-radius:${X(22)};background:${rgba(t, 0.8)};flex:none;"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:${X(16)};height:${X(150)};flex:none;">
      <div style="border-radius:${X(18)};background:${rgba(theme.ink, 0.08)};"></div>
      <div style="border-radius:${X(18)};background:${rgba(theme.accent2, 0.7)};"></div>
      <div style="border-radius:${X(18)};background:${rgba(theme.ink, 0.08)};"></div>
    </div>
    ${bar("70%", 0.12)}${bar("52%", 0.12)}
    <div style="height:${X(260)};border-radius:${X(22)};background:${rgba(theme.accent2, 0.55)};flex:none;"></div>
    ${bar("60%", 0.12)}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:${X(18)};height:${X(180)};flex:none;">
      <div style="border-radius:${X(18)};background:${rgba(t, 0.6)};"></div>
      <div style="border-radius:${X(18)};background:${rgba(theme.ink, 0.08)};"></div>
    </div>
  </div>`;
}

// A device frame in the SKIN's language. `skin.frameStyle` picks the chrome: "soft"
// (rounded, shadowed — the organic packs), "hard" (thick outline + offset shadow — the
// poster/hype packs) or "cinema" (thin bright edge on a dark house).
function frameHtml(theme, skin, { device, asset, boxH, tint, scrollId, address, natH }) {
  const t = tint || theme.accent;
  const S = skin.frameStyle || "soft";
  const shell = S === "hard"
    ? `border:${X(5)} solid ${theme.ink};box-shadow:${X(12)} ${X(14)} 0 ${theme.ink};`
    : S === "cinema"
      ? `border:${X(2)} solid ${rgba(theme.accent, 0.55)};box-shadow:0 ${X(30)} ${X(70)} ${rgba("#000000", 0.55)}, 0 0 ${X(40)} ${rgba(theme.accent, 0.25)};`
      : `box-shadow:0 ${X(34)} ${X(72)} ${rgba(theme.ink, 0.26)};`;
  const rad = S === "hard" ? 20 : 28;

  if (device === "phone") {
    return `<div style="width:100%;height:100%;border-radius:${X(50)};background:${theme.ink};padding:${X(14)};box-sizing:border-box;${shell}position:relative;overflow:hidden;">
      <div style="position:absolute;left:0;right:0;top:${X(24)};display:flex;justify-content:center;z-index:2;"><div style="width:${X(110)};height:${X(24)};border-radius:999px;background:${theme.ink};"></div></div>
      <div style="position:absolute;inset:${X(14)};border-radius:${X(38)};background:${rgba(t, 0.18)};overflow:hidden;">
        ${plate(theme, { asset, scrollId, natH, tint: t })}
      </div>
    </div>`;
  }
  if (device === "browser") {
    return `<div style="width:100%;border-radius:${X(rad + 6)};background:${theme.ink};padding:${X(12)};box-sizing:border-box;${shell}overflow:hidden;">
      <div style="display:flex;align-items:center;gap:${X(12)};padding:${X(4)} ${X(8)} ${X(12)};">
        <div style="display:flex;gap:${X(9)};flex:none;">
          <div style="width:${X(14)};height:${X(14)};border-radius:999px;background:${rgba(theme.paper, 0.9)};"></div>
          <div style="width:${X(14)};height:${X(14)};border-radius:999px;background:${rgba(theme.paper, 0.4)};"></div>
          <div style="width:${X(14)};height:${X(14)};border-radius:999px;background:${rgba(theme.paper, 0.28)};"></div>
        </div>
        <div style="flex:1;min-width:0;background:${rgba(theme.paper, 0.14)};border-radius:999px;padding:${X(6)} ${X(16)};font-family:${theme.bodyStack};font-weight:600;font-size:${F(19)};letter-spacing:.06em;color:${rgba(theme.paper, 0.72)};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(address || "")}</div>
      </div>
      <div style="position:relative;height:${X(boxH)};border-radius:${X(rad)};overflow:hidden;background:${rgba(t, 0.14)};">
        ${plate(theme, { asset, scrollId, natH, tint: t })}
      </div>
    </div>`;
  }
  return `<div style="width:100%;height:100%;border-radius:${X(rad)};${shell}overflow:hidden;position:relative;background:${rgba(t, 0.18)};">
    ${plate(theme, { asset, tint: t })}
  </div>`;
}

// ---- archetypes --------------------------------------------------------------
// The source's six fixed acts. They map 1:1 onto KEYFRAME's storyboard purposes, which is
// exactly why this family of templates ports so cleanly.
function archetypeFor(scene, i, total) {
  const k = String(scene.kind || "").toLowerCase();
  const p = String(scene.purpose || "").toLowerCase();
  if (i === 0 || k === "hook" || k === "title" || /hook|intro|open/.test(p)) return "hook";
  if (i === total - 1 || k === "cta" || /cta|close|outro|sign\s*up|subscribe|download|get\s*started/.test(p)) return "cta";
  if (k === "stat" || k === "chart" || k === "countdown" || (pickNumber(scene) && /proof|result|metric|stat|number|data/.test(p + k))) return "stats";
  if (k === "quote" || /quote|testimonial|problem|pain|comparison|before/.test(p)) return "statement";
  if (/montage|gallery|showcase|angles|tour/.test(p + k)) return "montage";
  if (/feature|benefit|how|process|step|demo|product/.test(p)) return "feature";
  return "statement";
}
// Beats that can put imagery on screen. A shot must NEVER be stranded on a scene that
// shows none, so distribution only ever targets these.
const CAN_SHOW = new Set(["hook", "feature", "montage", "statement"]);

// ---- shared scene fragments --------------------------------------------------
const PAD = 72;                                     // the source templates' safe margin
const COL = RW - PAD * 2;

const kicker = (theme, text, color, align) =>
  `<div data-in="rise" style="font-family:${theme.bodyStack};font-weight:800;font-size:${F(26)};letter-spacing:.22em;text-transform:uppercase;color:${color};text-align:${align || "left"};">${esc(text)}</div>`;

// The display stack: one line per row, each its own animated element. `mark` underlines /
// rings the emphasis word when the skin asks for it.
function headStack(theme, skin, fit, { color, accent, align, markLast }) {
  const { lines, size } = fit;
  return lines.map((l, i) => {
    const isMark = markLast && i === lines.length - 1 && lines.length > 1;
    return `<div data-in="rise" style="font-family:${theme.displayStack};font-size:${F(size)};line-height:${skin.headLine || 1.02};letter-spacing:${skin.headTrack || "-0.01em"};${skin.headTransform ? `text-transform:${skin.headTransform};` : ""}color:${isMark ? accent : color};text-align:${align || "left"};position:relative;">${esc(l)}</div>`;
  }).join("");
}

const chipHtml = (theme, skin, text) => {
  const hard = skin.frameStyle === "hard";
  return `<span class="om-chip" data-in="pop" style="background:${skin.chipBg ? theme.c[skin.chipBg] : theme.paper};color:${theme.onField(skin.chipBg ? theme.c[skin.chipBg] : theme.paper)};${hard ? `border:${X(4)} solid ${theme.ink};box-shadow:${X(8)} ${X(9)} 0 ${theme.ink};` : `border:${X(2)} solid ${rgba(theme.ink, 0.14)};box-shadow:0 ${X(10)} ${X(24)} ${rgba(theme.ink, 0.1)};`}">
    <span style="width:${X(16)};height:${X(16)};border-radius:999px;background:${theme.accent};flex:none;"></span>${esc(text)}</span>`;
};

// ---- scene builders ----------------------------------------------------------
// Every builder returns markup whose RESTING state is the finished frame; the `data-in`
// "from" values exist only while a tween runs, so a stalled ticker can never capture a
// blank scene.
const open = (ctx) =>
  `<div class="clip om-sc" id="${ctx.id}" data-start="${ctx.T}" data-duration="${r(ctx.L)}" data-track-index="${ctx.track}" style="opacity:0;">` +
  `<div class="om-cam" id="${ctx.id}-cam">`;
const close = () => `</div></div>`;

// HOOK — kicker, the big title stack, a sub line, and (when a capture landed here) an
// inline device frame. The opener.
function bHook(scene, ctx, sceneAssets, logo) {
  const { theme, skin, S, address } = ctx;
  const asset = (sceneAssets && sceneAssets[0]) || null;
  const fit = fitLines(scene.headline || scene.title || ctx.title, {
    basePx: skin.sizes.hook, maxLines: asset ? 3 : 4, colPx: COL, em: skin.em, upper: skin.headUpper,
  });
  const sub = String(scene.subtext || "").slice(0, 120);
  const scrollId = `${ctx.id}-scroll`;
  let frame = "", plan = { frac: 0, natH: 0 };
  if (asset) {
    const device = deviceFor(asset);
    const boxW = device === "phone" ? 380 : COL - 24, boxH = device === "phone" ? 680 : 460;
    plan = scrollPlan(boxW, boxH, asset);
    frame = `<div data-in="pop" style="position:absolute;left:${X(device === "phone" ? 350 : PAD)};right:${X(device === "phone" ? 350 : PAD)};top:${V(1080)};${device === "phone" ? `height:${X(730)};` : ""}">
      ${frameHtml(theme, skin, { device, asset, boxH, tint: theme.accent, scrollId: plan.frac ? scrollId : null, natH: plan.natH, address })}
    </div>`;
  }
  const mark = logo && logo.path
    ? `<img data-in="pop" src="${esc(logo.path)}" alt="${esc(logo.alt || "logo")}" style="height:${X(64)};width:auto;max-width:${X(280)};object-fit:contain;object-position:left center;display:block;margin-bottom:${X(22)};">`
    : "";
  const html = `${open(ctx)}
    <div style="position:absolute;left:${X(PAD)};right:${X(PAD)};top:${V(asset ? 300 : 520)};">
      ${mark}${kicker(theme, scene.kicker || S.hookKicker, theme.typeOn(theme.accent, ctx.ground))}
      <div style="margin-top:${X(28)};">${headStack(theme, skin, fit, { color: theme.onField(ctx.ground), accent: theme.typeOn(theme.accent, ctx.ground), align: "left", markLast: true })}</div>
      ${sub ? `<div data-in="rise" style="font-family:${theme.bodyStack};font-weight:500;font-size:${F(fitPx(sub, 40, 90))};line-height:1.35;color:${rgba(theme.onField(ctx.ground), 0.68)};margin-top:${X(32)};max-width:${X(760)};">${esc(sub)}</div>` : ""}
    </div>
    ${frame}
  ${close()}`;
  return { html, scroll: plan.frac ? { id: scrollId, frac: plan.frac } : null };
}

// STATEMENT — a rule, a big statement in the display face, a supporting line. The
// problem / quote beat. Text-safe: needs no imagery at all.
function bStatement(scene, ctx, sceneAssets) {
  const { theme, skin, S } = ctx;
  const asset = (sceneAssets && sceneAssets[0]) || null;
  const fit = fitLines(scene.headline || scene.title || "", {
    basePx: skin.sizes.statement, maxLines: asset ? 3 : 4, colPx: COL, em: skin.em, upper: skin.headUpper,
  });
  const sub = String(scene.subtext || "").slice(0, 140);
  const attribution = bullets(scene, 1)[0] || "";
  const frame = asset
    ? `<div data-in="pop" style="position:absolute;left:${X(PAD)};right:${X(PAD)};top:${V(1180)};height:${X(430)};">
        ${frameHtml(theme, skin, { device: "card", asset, tint: theme.accent2 })}
      </div>`
    : "";
  const html = `${open(ctx)}
    <div style="position:absolute;left:${X(PAD)};right:${X(PAD)};top:${V(asset ? 380 : 620)};">
      <div data-in="draw" style="width:${X(96)};height:${X(10)};border-radius:999px;background:${theme.typeOn(theme.accent, ctx.ground)};margin-bottom:${X(42)};transform-origin:left center;"></div>
      ${headStack(theme, skin, fit, { color: theme.onField(ctx.ground), accent: theme.typeOn(theme.accent, ctx.ground), align: "left", markLast: true })}
      ${sub ? `<div data-in="rise" style="font-family:${theme.bodyStack};font-weight:500;font-size:${F(fitPx(sub, 38, 100))};line-height:1.38;color:${rgba(theme.onField(ctx.ground), 0.66)};margin-top:${X(36)};max-width:${X(780)};">${esc(sub)}</div>` : ""}
      ${attribution && !sub ? `<div data-in="rise" style="font-family:${theme.bodyStack};font-weight:700;font-size:${F(34)};color:${theme.typeOn(theme.accent, ctx.ground)};margin-top:${X(32)};">${esc(attribution)}</div>` : ""}
    </div>
    ${frame}
  ${close()}`;
  return { html };
}

// FEATURE — the product moment: a headline over one hero capture in its aspect-routed
// device frame (the capture SCROLLING inside its window), with support chips beneath.
function bFeature(scene, ctx, sceneAssets) {
  const { theme, skin, S, address } = ctx;
  const asset = (sceneAssets && sceneAssets[0]) || null;
  const device = asset ? deviceFor(asset) : "browser";
  const isPhone = device === "phone";
  const fit = fitLines(scene.headline || scene.title || "", {
    basePx: skin.sizes.feature, maxLines: 2, colPx: COL, em: skin.em, upper: skin.headUpper,
  });
  const chips = bullets(scene, 3);
  const scrollId = `${ctx.id}-scroll`;
  const boxW = isPhone ? 400 : COL - 24, boxH = isPhone ? 720 : 560;
  const plan = scrollPlan(boxW, boxH, asset);
  const html = `${open(ctx)}
    <div style="position:absolute;left:${X(PAD)};right:${X(PAD)};top:${V(300)};">
      ${kicker(theme, scene.kicker || S.featureKicker, theme.typeOn(theme.accent, ctx.ground))}
      <div style="margin-top:${X(22)};">${headStack(theme, skin, fit, { color: theme.onField(ctx.ground), accent: theme.typeOn(theme.accent, ctx.ground), align: "left", markLast: true })}</div>
    </div>
    <div data-in="pop" style="position:absolute;left:${X(isPhone ? 340 : PAD)};right:${X(isPhone ? 340 : PAD)};top:${V(760)};${isPhone ? `height:${X(760)};` : ""}">
      ${frameHtml(theme, skin, { device, asset, boxH, tint: theme.accent, scrollId: plan.frac ? scrollId : null, natH: plan.natH, address })}
    </div>
    ${chips.length ? `<div style="position:absolute;left:${X(PAD)};right:${X(PAD)};top:${V(1460)};display:flex;flex-wrap:wrap;gap:${X(18)};justify-content:center;">
      ${chips.map((c) => chipHtml(theme, skin, c)).join("")}
    </div>` : ""}
  ${close()}`;
  return { html, scroll: plan.frac ? { id: scrollId, frac: plan.frac } : null };
}

// MONTAGE — the 2×2 tile wall. Real captures fill the tiles; a tile with no capture gets
// a coloured block from the pack's own palette rather than an empty hole.
function bMontage(scene, ctx, sceneAssets) {
  const { theme, skin, S } = ctx;
  const shots = (sceneAssets || []).slice(0, 4);
  const labels = bullets(scene, 4);
  const fit = fitLines(scene.headline || scene.title || "", {
    basePx: skin.sizes.montage, maxLines: 2, colPx: COL, em: skin.em, upper: skin.headUpper,
  });
  const tints = [theme.accent, theme.accent2, theme.accent3, theme.accent];
  const n = Math.max(shots.length, Math.min(4, Math.max(2, labels.length)));
  const cells = Array.from({ length: n }, (_, i) => ({ a: shots[i] || null, label: labels[i] || (S.tiles[i] || ""), tint: tints[i % 4] }));
  const html = `${open(ctx)}
    <div style="position:absolute;left:${X(PAD)};right:${X(PAD)};top:${V(300)};">
      ${kicker(theme, scene.kicker || S.montageKicker, theme.typeOn(theme.accent, ctx.ground))}
      <div style="margin-top:${X(22)};">${headStack(theme, skin, fit, { color: theme.onField(ctx.ground), accent: theme.typeOn(theme.accent, ctx.ground), align: "left", markLast: true })}</div>
    </div>
    <div style="position:absolute;left:${X(PAD)};right:${X(PAD)};top:${V(720)};display:grid;grid-template-columns:${cells.length <= 2 ? "1fr" : "1fr 1fr"};gap:${X(24)};">
      ${cells.map((c) => `<div data-in="pop" style="height:${X(cells.length <= 2 ? 380 : 290)};position:relative;">
        ${frameHtml(theme, skin, { device: "card", asset: c.a, tint: c.tint })}
        ${c.label ? `<div style="position:absolute;left:${X(18)};bottom:${X(18)};font-family:${theme.bodyStack};font-weight:700;font-size:${F(24)};letter-spacing:.06em;padding:${X(8)} ${X(16)};border-radius:999px;background:${rgba(theme.ink, 0.72)};color:${theme.paper};max-width:80%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(c.label)}</div>` : ""}
      </div>`).join("")}
    </div>
  ${close()}`;
  return { html };
}

// STATS — animated counters in the display face with their labels. The proof beat.
function bStats(scene, ctx) {
  const { theme, skin, S } = ctx;
  const stats = pickStats(scene, 3, S);
  const fit = fitLines(scene.headline || scene.title || "", {
    basePx: skin.sizes.stats, maxLines: 2, colPx: COL, em: skin.em, upper: skin.headUpper,
  });
  const hard = skin.frameStyle === "hard";
  const html = `${open(ctx)}
    <div style="position:absolute;left:${X(PAD)};right:${X(PAD)};top:${V(340)};">
      ${kicker(theme, scene.kicker || S.statsKicker, theme.typeOn(theme.accent, ctx.ground))}
      <div style="margin-top:${X(22)};">${headStack(theme, skin, fit, { color: theme.onField(ctx.ground), accent: theme.typeOn(theme.accent, ctx.ground), align: "left", markLast: true })}</div>
    </div>
    <div style="position:absolute;left:${X(PAD)};right:${X(PAD)};top:${V(820)};display:flex;flex-direction:column;gap:${X(28)};">
      ${stats.map((st) => `<div data-in="rise" style="display:flex;align-items:center;gap:${X(36)};background:${theme.paper};border-radius:${X(hard ? 20 : 30)};padding:${X(30)} ${X(42)};${hard ? `border:${X(4)} solid ${theme.ink};box-shadow:${X(10)} ${X(12)} 0 ${theme.ink};` : `border:${X(2)} solid ${rgba(theme.ink, 0.1)};box-shadow:0 ${X(16)} ${X(36)} ${rgba(theme.ink, 0.07)};`}">
        <div style="font-family:${theme.displayStack};font-size:${F(112)};line-height:.9;color:${theme.typeOn(theme.accent, theme.paper)};flex:none;">${esc(st.pre)}<span data-count="${st.target}" data-suffix="${esc(st.suf)}">${st.target}${esc(st.suf)}</span></div>
        <div style="font-family:${theme.bodyStack};font-weight:600;font-size:${F(fitPx(st.label, 36, 22))};line-height:1.2;color:${rgba(theme.onField(theme.paper), 0.7)};min-width:0;">${esc(st.label)}</div>
      </div>`).join("")}
    </div>
  ${close()}`;
  return { html };
}

// CTA — the logo lockup, the closing line, a pill button and the URL.
function bCta(scene, ctx, _assets, logo) {
  const { theme, skin, S } = ctx;
  const fit = fitLines(scene.headline || scene.title || ctx.title, {
    basePx: skin.sizes.cta, maxLines: 2, colPx: COL, em: skin.em, upper: skin.headUpper,
  });
  const btn = String(scene.emphasis || S.ctaButton).slice(0, 26);
  const url = ctx.address || "";
  const ink = theme.onField(ctx.ground);
  const hard = skin.frameStyle === "hard";
  const mark = logo && logo.path
    ? `<img src="${esc(logo.path)}" alt="${esc(logo.alt || "logo")}" style="max-width:${X(110)};max-height:${X(110)};object-fit:contain;display:block;">`
    : `<div style="width:${X(58)};height:${X(58)};border-radius:${X(14)};background:${theme.accent2};"></div>`;
  const html = `${open(ctx)}
    <div style="position:absolute;left:${X(PAD)};right:${X(PAD)};top:${V(560)};">
      <div data-in="pop" style="width:${X(150)};height:${X(150)};border-radius:${X(hard ? 28 : 999)};background:${theme.paper};display:flex;align-items:center;justify-content:center;overflow:hidden;margin-bottom:${X(44)};${hard ? `border:${X(5)} solid ${theme.ink};box-shadow:${X(10)} ${X(12)} 0 ${theme.ink};` : `box-shadow:0 ${X(20)} ${X(44)} ${rgba(theme.ink, 0.18)};`}">${mark}</div>
      ${headStack(theme, skin, fit, { color: ink, accent: theme.typeOn(theme.accent, ctx.ground), align: "left", markLast: true })}
      <div data-in="pop" style="display:inline-flex;align-items:center;gap:${X(18)};margin-top:${X(52)};padding:${X(26)} ${X(50)};border-radius:999px;background:${theme.accent};color:${theme.onField(theme.accent)};font-family:${theme.displayStack};font-size:${F(fitPx(btn, 46, 16))};${hard ? `border:${X(5)} solid ${theme.ink};box-shadow:${X(9)} ${X(10)} 0 ${theme.ink};` : ""}">
        ${esc(btn)}<span style="width:${X(24)};height:${X(24)};border-top:${X(6)} solid currentColor;border-right:${X(6)} solid currentColor;display:inline-block;flex:none;transform:rotate(45deg);"></span>
      </div>
      ${url ? `<div data-in="rise" style="font-family:${theme.bodyStack};font-weight:700;font-size:${F(38)};letter-spacing:.04em;color:${theme.typeOn(theme.accent, ctx.ground)};margin-top:${X(44)};">${esc(url)}</div>` : ""}
    </div>
  ${close()}`;
  return { html };
}

const BUILDERS = { hook: bHook, statement: bStatement, feature: bFeature, montage: bMontage, stats: bStats, cta: bCta };

// ---- entrance primitives -----------------------------------------------------
// The source's `M.rise` / `M.pop` / `M.draw`, restated as GSAP. `immediateRender:false`
// is load-bearing: the markup's RESTING state is the finished frame, so a stalled ticker
// captures a complete scene rather than a blank one.
const FROM = {
  rise: `{y:44,opacity:0}`,
  pop: `{scale:0.82,opacity:0}`,
  draw: `{scaleX:0}`,
};
const TO = {
  rise: `y:0,opacity:1`,
  pop: `scale:1,opacity:1`,
  draw: `scaleX:1`,
};
function kindsIn(html) {
  return [...new Set((String(html).match(/data-in="([a-z]+)"/g) || []).map((m) => m.slice(9, -1)))];
}
function enterScript(id, T, html, energy) {
  const out = [];
  for (const k of kindsIn(html)) {
    if (!FROM[k]) continue;
    const dur = k === "pop" ? 0.5 : 0.46;
    const ease = k === "pop" ? "back.out(1.6)" : "power3.out";
    out.push(`tl.fromTo("#${id} [data-in='${k}']",${FROM[k]},{${TO[k]},duration:${r(dur / energy)},ease:"${ease}",stagger:${r(0.07 / energy)},immediateRender:false},${r(T + 0.08)});`);
  }
  if (/data-count=/.test(html)) out.push(`count("#${id}",${r(T + 0.3)},0.9);`);
  return out;
}

// ---- covered cuts ------------------------------------------------------------
// The source templates cut in three ways: a coverless PUSH (content drives through the
// boundary), a hard block WIPE, and the theatre COVERS (doors / iris / blinds). A skin
// names the ones it wants and they rotate; the ground swaps while the frame is covered,
// so a colour change is never seen as a jerk.
function cutLayer(theme, kind) {
  if (kind === "doors") {
    return `<div id="om-cut" class="clip" data-start="0" data-duration="__D__" data-track-index="88" data-layout-allow-occlusion style="pointer-events:none;">
      <div id="om-cut-a" style="position:absolute;top:-2%;bottom:-2%;left:0;width:51%;background:transparent;"></div>
      <div id="om-cut-b" style="position:absolute;top:-2%;bottom:-2%;right:0;width:51%;background:transparent;"></div>
    </div>`;
  }
  if (kind === "blinds") {
    const bands = Array.from({ length: 5 }, (_, i) =>
      `<div class="om-blind" style="flex:1;background:transparent;transform-origin:${i % 2 ? "bottom" : "top"};"></div>`).join("");
    return `<div id="om-cut" class="clip" data-start="0" data-duration="__D__" data-track-index="88" data-layout-allow-occlusion style="pointer-events:none;display:flex;flex-direction:column;">${bands}</div>`;
  }
  if (kind === "iris") {
    return `<div id="om-cut" class="clip" data-start="0" data-duration="__D__" data-track-index="88" data-layout-allow-occlusion style="pointer-events:none;">
      <div id="om-cut-a" style="position:absolute;inset:-2%;background:transparent;"></div>
    </div>`;
  }
  // wipe (also the coverless "push" skin's fallback, parked off-frame and never shown)
  return `<div id="om-cut" class="clip" data-start="0" data-duration="__D__" data-track-index="88" data-layout-allow-occlusion style="pointer-events:none;">
    <div id="om-cut-a" style="position:absolute;left:-8%;right:-8%;top:-10%;bottom:-10%;background:transparent;"></div>
  </div>`;
}
// The tweens for one cut at time `cut`, covering the boundary and revealing the next
// ground. Returns [] for "push" — that skin's cut IS the camera, so no cover is drawn.
function cutScript(kind, cut, nextGround, idx) {
  if (kind === "push") return [];
  if (kind === "doors") {
    return [
      `tl.set("#om-cut-a",{backgroundColor:${JSON.stringify(nextGround)}},${r(cut)});`,
      `tl.set("#om-cut-b",{backgroundColor:${JSON.stringify(nextGround)}},${r(cut)});`,
      `tl.fromTo("#om-cut-a",{xPercent:-104},{xPercent:0,duration:0.26,ease:"power3.inOut",immediateRender:false},${r(cut)});`,
      `tl.fromTo("#om-cut-b",{xPercent:104},{xPercent:0,duration:0.26,ease:"power3.inOut",immediateRender:false},${r(cut)});`,
      `tl.to("#om-cut-a",{xPercent:-104,duration:0.3,ease:"power3.inOut",overwrite:"auto"},${r(cut + 0.3)});`,
      `tl.to("#om-cut-b",{xPercent:104,duration:0.3,ease:"power3.inOut",overwrite:"auto"},${r(cut + 0.3)});`,
    ];
  }
  if (kind === "blinds") {
    return [
      `tl.set("#om-cut .om-blind",{backgroundColor:${JSON.stringify(nextGround)}},${r(cut)});`,
      `tl.fromTo("#om-cut .om-blind",{scaleY:0},{scaleY:1,duration:0.26,ease:"power2.inOut",stagger:0.03,immediateRender:false},${r(cut)});`,
      `tl.to("#om-cut .om-blind",{scaleY:0,duration:0.3,ease:"power2.inOut",stagger:0.03,overwrite:"auto"},${r(cut + 0.32)});`,
    ];
  }
  if (kind === "iris") {
    return [
      `tl.set("#om-cut-a",{backgroundColor:${JSON.stringify(nextGround)}},${r(cut)});`,
      `tl.fromTo("#om-cut-a",{clipPath:"circle(0% at 50% 50%)"},{clipPath:"circle(122% at 50% 50%)",duration:0.28,ease:"power2.inOut",immediateRender:false},${r(cut)});`,
      `tl.to("#om-cut-a",{clipPath:"circle(0% at 50% 50%)",duration:0.3,ease:"power2.inOut",overwrite:"auto"},${r(cut + 0.32)});`,
    ];
  }
  // wipe — a hard block driving in from an edge and out the opposite side. The edge
  // ROTATES per cut (bottom → left → top → right), because a wipe that always arrives
  // from the same side is the fastest way to make a film read as a template.
  const EDGE_IN = [{ x: 0, y: 112 }, { x: -112, y: 0 }, { x: 0, y: -112 }, { x: 112, y: 0 }];
  const e = EDGE_IN[(idx || 0) % 4], out = { x: -e.x, y: -e.y };
  return [
    `tl.set("#om-cut-a",{backgroundColor:${JSON.stringify(nextGround)}},${r(cut)});`,
    `tl.fromTo("#om-cut-a",{xPercent:${e.x},yPercent:${e.y}},{xPercent:0,yPercent:0,duration:0.26,ease:"power3.inOut",immediateRender:false},${r(cut)});`,
    `tl.to("#om-cut-a",{xPercent:${out.x},yPercent:${out.y},duration:0.3,ease:"power3.inOut",overwrite:"auto"},${r(cut + 0.3)});`,
  ];
}
// The cover's RESTING (invisible) state, emitted as timeline `set`s rather than a bare
// gsap.set(). A bare set runs once at script eval and did NOT survive the renderer's
// seeking — the wipe cover sat over the entire film, visible everywhere EXCEPT during the
// cuts (where its own tweens took over). Parking on the timeline at t=0 and again after
// every cut exit means the resting state is re-asserted by any seek, forward or backward.
function cutRest(kind) {
  if (kind === "doors") return [["#om-cut-a", "{xPercent:-104}"], ["#om-cut-b", "{xPercent:104}"]];
  if (kind === "blinds") return [["#om-cut .om-blind", "{scaleY:0}"]];
  if (kind === "iris") return [["#om-cut-a", `{clipPath:"circle(0% at 50% 50%)"}`]];
  return [["#om-cut-a", "{x:0,y:0,xPercent:0,yPercent:112}"]];
}
function cutParkAt(kind, t) {
  if (kind === "push") return [];
  // Position AND colour. Position alone proved insufficient — a cover whose transform the
  // renderer does not apply must still be invisible, so outside its own 0.64s window it
  // carries no colour at all. The cut itself paints it (tl.set backgroundColor) on entry.
  return cutRest(kind).map(([sel, props]) =>
    `tl.set("${sel}",${props},${r(t)});tl.set("${sel}",{backgroundColor:"rgba(0,0,0,0)"},${r(t)});`);
}

// ---- camera ------------------------------------------------------------------
// The source's `cam(kind, p, energy)` — a per-scene move so the film never reads as a
// slideshow. Restated as one GSAP fromTo per scene on an inner wrapper (which carries no
// CSS transform of its own, so GSAP can never overwrite an authored rotation).
// AMPLITUDES ARE A SAFE-AREA BUDGET, not just taste. The camera translates the whole
// scene, so its excursion is subtracted from every margin the beats were drawn against —
// a ±5% drift at energy 1.25 moves a kicker 6% up, straight into the band a skin's world
// decorations live in. Held to ±3% vertical / ±4% horizontal so authored clearances hold
// for every skin, whatever its energy.
const CAMS = {
  left: { x: [-4, 2], y: [0, 0], s: [1, 1], rot: [-2, 0] },
  right: { x: [4, -2], y: [0, 0], s: [1, 1], rot: [2, 0] },
  up: { x: [0, 0], y: [3, -2], s: [1, 1], rot: [0, 0] },
  drop: { x: [0, 0], y: [-3, 2], s: [1, 1], rot: [1, 0] },
  zoom: { x: [0, 0], y: [1, 0], s: [0.92, 1.05], rot: [0, 0] },
  // A scale-out starts ZOOMED IN, which pushes the safe margin toward the frame edge —
  // 1.12 put a left-aligned block within 16px of it, so the opening scale is held to 1.08.
  scaleout: { x: [0, 0], y: [0, 0], s: [1.08, 1], rot: [-1, 0] },
  swing: { x: [-3.5, 2], y: [0, 0], s: [1, 1.04], rot: [-3, 1] },
  dolly: { x: [0, 0], y: [0, 0], s: [1, 1.07], rot: [0, 0] },
};

// ---- MAIN --------------------------------------------------------------------
function build(skin, { storyboard, dims, framePack, captionCues, assets, brandSkin = null, localized = null, seedKey = null } = {}) {
  const theme = buildTheme(skin, brandSkin);
  const S = { ...BASE_STRINGS, ...(skin.strings || {}), ...(localized || {}) };
  const sb = storyboard || {};
  const W = (dims && dims.width) || 1080, H = (dims && dims.height) || 1920;
  TSCALE = clamp(Math.min(W, H) / W, 0.5, 1);
  const capBottom = r(safeArea(W, H).bottom * 38);

  const scenes = Array.isArray(sb.scenes) && sb.scenes.length
    ? sb.scenes.slice(0, 12)
    : [{ id: "s1", start: 0, duration: 5, kind: "hook", headline: sb.title || skin.label }];
  const D = r(sb.durationSec
    || scenes.reduce((a, s) => Math.max(a, (Number(s.start) || 0) + (Number(s.duration) || 0)), 0) || 12);
  const rnd = mulberry32(seedFrom(seedKey || sb.title || (scenes[0] && scenes[0].headline) || skin.id));
  const title = String(sb.title || "").slice(0, 60);
  const address = addressFrom(assets, S);
  const energy = skin.energy || 1;

  // ---- assets: distribute captures across DISPLAY-CAPABLE beats ---------------
  // The Creative Director's per-asset `sceneId` is a HINT, not a binding: honour it when
  // that scene can actually show an image, otherwise redistribute to the least-loaded
  // one. Without this a storyboard whose shots all landed on stats/cta scenes renders a
  // film with no imagery at all.
  const all = Array.isArray(assets) ? assets : [];
  const logo = logoAssetOf(all);
  const shots = all.filter(shotOk).sort((a, b) => (Number(b.cdScore) || 0) - (Number(a.cdScore) || 0));

  const baseArch = scenes.map((sc, i) => archetypeFor(sc, i, scenes.length));
  // A montage beat only earns its tile wall when there is enough real imagery to fill it;
  // with 3+ captures, promote a middle scene so the wall actually happens.
  if (shots.length >= 3 && !baseArch.includes("montage")) {
    const idx = baseArch.findIndex((a, i) => i > 0 && i < scenes.length - 1 && a === "statement");
    if (idx >= 0) baseArch[idx] = "montage";
  }
  const displayIdx = scenes.map((_, i) => i).filter((i) => CAN_SHOW.has(baseArch[i]));
  const sceneIdOf = (i) => (scenes[i].id != null ? String(scenes[i].id) : `s${i + 1}`);
  const sceneShots = scenes.map(() => []);
  if (displayIdx.length && shots.length) {
    const leftovers = [];
    for (const a of shots) {
      const sid = a.sceneId != null ? String(a.sceneId) : null;
      const target = sid != null ? displayIdx.find((i) => sceneIdOf(i) === sid) : undefined;
      if (target != null) sceneShots[target].push(a); else leftovers.push(a);
    }
    // The montage wall wants MULTIPLE shots; feed it before evening out the rest.
    for (const a of leftovers) {
      const montage = displayIdx.find((i) => baseArch[i] === "montage" && sceneShots[i].length < 4);
      let best = montage != null ? montage : displayIdx[0];
      if (montage == null) for (const i of displayIdx) if (sceneShots[i].length < sceneShots[best].length) best = i;
      sceneShots[best].push(a);
    }
  }
  // A "feature" beat with no capture at all still shows the product moment — the browser
  // frame holding the generated wireframe, scrolling like a real one. The source called
  // this the zero-asset path and it is first-class here too.

  // ---- grounds ---------------------------------------------------------------
  // The skin owns its ground rotation (a poster pack swaps a full field per scene; a
  // world pack keeps one ground and lets the backdrop carry the change).
  // The pattern is the skin's (adjacent entries never repeat); the seeded OFFSET is the
  // job's, so two videos on the same pack never open on the same field. A cyclic rotation
  // preserves the no-repeat property, including at the wrap.
  const gOff = Math.floor(rnd() * skin.grounds.length);
  const grounds = scenes.map((_, i) => theme.c[skin.grounds[(i + gOff) % skin.grounds.length]]);

  // ---- build the scenes ------------------------------------------------------
  const startOf = (i) => scenes.slice(0, i).reduce((a, s) => a + (Number(s.duration) || 0), 0);
  const bodyParts = [], sceneScripts = [], labels = [], starts = [], durs = [];
  const camOrder = skin.cams || ["drop", "left", "swing", "right", "zoom", "scaleout"];
  // Declared before the loop: the scene hand-off below needs to know whether this pack
  // cuts under a cover or pushes through.
  const cutKinds = skin.cuts || ["wipe"];
  // Same idea for the camera order — the moves are the skin's, the sequence is the job's.
  const camOff = Math.floor(rnd() * camOrder.length);

  scenes.forEach((scene, i) => {
    const T = r(scene.start != null ? scene.start : startOf(i));
    const L = r(scene.duration || 4);
    const ground = grounds[i];
    let arch = baseArch[i];
    let sceneAssets = sceneShots[i];

    // A beat that received captures is upgraded to the presentation that fits how MANY it
    // got: 2+ becomes the tile wall, 1 becomes the hero device frame. A statement keeps
    // its identity and takes at most one grounding shot.
    if (CAN_SHOW.has(arch) && sceneAssets.length) {
      if (arch === "montage") sceneAssets = sceneAssets.slice(0, 4);
      else if (arch === "statement") sceneAssets = sceneAssets.slice(0, 1);
      else if (sceneAssets.length >= 2 && arch !== "hook") { arch = "montage"; sceneAssets = sceneAssets.slice(0, 4); }
      else sceneAssets = sceneAssets.slice(0, 1);
    } else if (arch === "montage" && !sceneAssets.length) {
      arch = "feature";     // an empty wall is worse than one wireframe product moment
    }

    const ctx = { id: `s${i + 1}`, T, L, i, isLast: i === scenes.length - 1, track: 10 + i, theme, skin, S, ground, address, title };
    const built = (BUILDERS[arch] || bStatement)(scene, ctx, arch === "cta" ? null : sceneAssets, logo);
    bodyParts.push(built.html);
    labels.push(String(scene.kicker || scene.purpose || arch).slice(0, 22));
    starts.push(T); durs.push(L);

    const s = [];
    // SCENE HAND-OFF. With a COVERED cut the swap happens while the cover fully hides the
    // frame (closed at cut+0.26, reopening from cut+0.30), so both the reveal and the kill
    // must land inside that window — killing at the scene's own end would be seen through
    // an already-opening cover. A COVERLESS push has no cover to hide behind, so it uses
    // the source's short cross-fade instead and the camera move carries the cut.
    const covered = cutKinds[0] !== "push";
    if (covered) {
      s.push(`tl.set("#${ctx.id}",{opacity:1},${r(Math.max(0, T - 0.18))});`);
    } else {
      s.push(`tl.fromTo("#${ctx.id}",{opacity:0},{opacity:1,duration:0.22,ease:"power2.out",immediateRender:false},${r(Math.max(0, T - 0.12))});`);
    }
    s.push(...enterScript(ctx.id, T, built.html, energy));

    // CAMERA — a continuous move for the whole scene so nothing ever sits still.
    const cam = CAMS[camOrder[(i + camOff) % camOrder.length]] || CAMS.drop;
    s.push(`tl.fromTo("#${ctx.id}-cam",{xPercent:${r(cam.x[0] * energy)},yPercent:${r(cam.y[0] * energy)},scale:${cam.s[0]},rotate:${r(cam.rot[0] * energy)}},{xPercent:${r(cam.x[1] * energy)},yPercent:${r(cam.y[1] * energy)},scale:${cam.s[1]},rotate:${r(cam.rot[1] * energy)},duration:${L},ease:"none",immediateRender:false},${T});`);

    // SCREENSHOT MOTION — the capture pans inside its own window.
    if (built.scroll) {
      s.push(`tl.fromTo("#${built.scroll.id}",{yPercent:0},{yPercent:${r(-built.scroll.frac * 100)},duration:${r(Math.max(0.6, L - 1.2))},ease:"none",immediateRender:false},${r(T + 0.8)});`);
    }
    if (!ctx.isLast) {
      if (covered) {
        s.push(`tl.set("#${ctx.id}",{opacity:0},${r(T + L - 0.17)});`);
      } else {
        // A fade-out alone is not enough: a non-linear seek can land after the tween and
        // keep stale visibility, so the hard kill on the boundary is mandatory
        // (hyperframes `gsap_exit_missing_hard_kill`).
        s.push(`tl.to("#${ctx.id}",{opacity:0,duration:0.22,ease:"power2.in",overwrite:"auto"},${r(T + L - 0.22)});`);
        s.push(`tl.set("#${ctx.id}",{opacity:0},${r(T + L)});`);
      }
    }
    sceneScripts.push(s.join("\n  "));
  });

  // ---- the persistent WORLD ---------------------------------------------------
  // Exactly the source's continuously-running backdrop, but painted on ONE canvas purely
  // from the renderer's hf-seek time — deterministic and seek-exact. The GSAP timeline's
  // onUpdate drives it too, so it also animates in live preview.
  //
  // SKIN CONTRACT — a world's draw(t) MUST begin by clearing (or fully repainting) the
  // canvas. It is called on every seek, and a renderer worker seeks a whole RANGE of
  // frames into the same canvas: without the clear, translucent layers accumulate frame
  // on frame until they saturate, and — because the workers cover different ranges — they
  // accumulate DIFFERENTLY in each, which quietly breaks determinism too. Five of the
  // seven skins shipped without it and painted their films into a solid colour wash.
  const world = skin.world({ theme, W, H, rgba, seed: Math.floor(rnd() * 1e9) });
  const worldClip = `<div id="om-world" class="clip" data-start="0" data-duration="${D}" data-track-index="0" data-layout-allow-occlusion style="background:${grounds[0]};">
    <canvas id="om-canvas" width="${W}" height="${H}" style="position:absolute;inset:0;width:100%;height:100%;"></canvas>
    ${world.html || ""}
  </div>`;

  // A coverless "push" pack emits NO cover layer at all. Emitting one and simply not
  // animating it parks a full-frame accent block on top of the entire film — which is
  // exactly what happened the first time this ran.
  const cut = cutKinds[0] === "push" ? "" : cutLayer(theme, cutKinds[0]).replace("__D__", String(D));

  const chrome = `<div id="om-chrome" class="clip" data-start="0" data-duration="${D}" data-track-index="92" data-layout-allow-occlusion style="pointer-events:none;">
    <div style="position:absolute;left:0;right:0;top:0;height:${X(8)};background:${rgba(theme.ink, 0.16)};">
      <div id="om-prog" style="height:100%;width:100%;background:${theme.accent};transform-origin:left center;"></div>
    </div>
    <div style="position:absolute;left:${X(PAD)};top:${V(60)};display:flex;align-items:center;gap:${X(16)};">
      <div style="width:${X(40)};height:${X(40)};border-radius:999px;background:${theme.accent};flex:none;"></div>
      <span id="om-label" style="font-family:${theme.displayStack};font-size:${F(32)};color:${theme.onField(grounds[0])};"></span>
    </div>
  </div>`;

  // CAPTIONS — one seek-safe node on a plate that reads on any brand ground. The bottom
  // band is reserved; no beat places content in it.
  const caps = `<div id="caps" class="clip" data-start="0" data-duration="${D}" data-track-index="94" data-layout-allow-occlusion style="pointer-events:none;">
    <div id="cap-pill" style="position:absolute;left:${X(56)};right:${X(56)};bottom:${capBottom}%;display:flex;justify-content:center;opacity:0;">
      <div id="cap-text"></div>
    </div>
  </div>`;

  const cues = (Array.isArray(captionCues) ? captionCues : [])
    .filter((c) => c && c.text != null)
    .map((c) => [r(c.start != null ? c.start : c.startSec || 0), r(c.end != null ? c.end : (c.start || 0) + 2), String(c.text)]);

  // ---- cut + ground scripts ---------------------------------------------------
  const cutLines = [];
  // Park every cover at t=0 so the resting state is asserted by the timeline itself.
  for (const k of new Set(cutKinds)) cutLines.push(...cutParkAt(k, 0));
  for (let i = 0; i < scenes.length - 1; i++) {
    const at = starts[i] + durs[i] - 0.44;
    const kind = cutKinds[i % cutKinds.length];
    cutLines.push(...cutScript(kind, at, grounds[i + 1], i));
    // …and re-park once the exit has finished, so the next interval is covered too.
    cutLines.push(...cutParkAt(kind, at + 0.64));
    // The ground swaps while the frame is covered (or, for a coverless push, on the cut).
    cutLines.push(`tl.set("#om-world",{backgroundColor:${JSON.stringify(grounds[i + 1])}},${r(at + (kind === "push" ? 0.0 : 0.26))});`);
  }

  const script = `(function(){
  var D=${D};
  var tl=gsap.timeline({paused:true});
  var $=function(s){return document.querySelector(s);};
  var $$=function(s){return Array.prototype.slice.call(document.querySelectorAll(s));};

  // Count-up: a scrubbed numeric proxy, so a seek to any time shows the right number. The
  // element's RESTING text is already the final value, so a stalled ticker shows the
  // finished figure rather than a zero.
  function count(scope,at,dur){
    $$(scope+" [data-count]").forEach(function(el){
      var target=parseFloat(el.getAttribute("data-count"))||0;
      var suf=el.getAttribute("data-suffix")||"";
      var o={v:0};
      tl.to(o,{v:target,duration:dur,ease:"power3.out",immediateRender:false,onUpdate:function(){
        var s=Math.round(o.v)+suf; if(el.textContent!==s)el.textContent=s;
      }},at);
    });
  }

  ${sceneScripts.join("\n  ")}

  ${cutLines.join("\n  ")}

  tl.fromTo("#om-prog",{scaleX:0},{scaleX:1,duration:D,ease:"none",immediateRender:false},0);

  // ---- one seek-safe proxy: the world clock, the chrome label and the captions ----
  var cues=${JSON.stringify(cues)};
  var starts=${JSON.stringify(starts)};
  var labels=${JSON.stringify(labels.map((l) => String(l).toUpperCase()))};
  var inks=${JSON.stringify(grounds.map((g) => theme.onField(g)))};
  var capPill=$("#cap-pill"),capText=$("#cap-text"),labelEl=$("#om-label");
  var curCue=-1,curScene=-1;
  tl.to({},{duration:D,ease:"none",onUpdate:function(){
    var now=tl.time();
    if(window.OM_WORLD)window.OM_WORLD(now);
    var si=0; while(si<starts.length-1&&now+0.24>=starts[si+1])si++;
    if(si!==curScene){
      curScene=si;
      if(labelEl){labelEl.textContent=labels[si];labelEl.style.color=inks[si];}
    }
    if(!capPill||!capText)return;
    var ci=-1;
    for(var k=0;k<cues.length;k++){if(now>=cues[k][0]&&now<cues[k][1]){ci=k;break;}}
    if(ci!==curCue){
      curCue=ci;
      capText.textContent=ci>=0?cues[ci][2]:"";
      capPill.style.opacity=ci>=0?"1":"0";
    }
  }},0);

  window.__timelines=window.__timelines||{};
  window.__timelines["vid"]=tl;
  if(typeof navigator==="undefined"||!navigator.webdriver){tl.play(0);tl.eventCallback("onComplete",function(){tl.restart();});}
})();`;

  const style = `${theme.fontFace}
  * { box-sizing:border-box; margin:0; padding:0; }
  html, body { width:100%; height:100%; overflow:hidden; background:${theme.ink}; }
  #root { position:relative; overflow:hidden; isolation:isolate; container-type:size; background:${grounds[0]}; color:${theme.ink}; font-family:${theme.bodyStack}; }
  .clip { position:absolute; top:0; left:0; width:100%; height:100%; overflow:hidden; }
  .om-cam { position:absolute; inset:0; will-change:transform; }
  .om-chip { display:inline-flex; align-items:center; gap:${X(12)}; padding:${X(14)} ${X(26)}; border-radius:999px;
             font-family:${theme.bodyStack}; font-weight:700; font-size:${F(28)};
             white-space:nowrap; max-width:${X(820)}; overflow:hidden; text-overflow:ellipsis;
             will-change:transform,opacity; }
  #cap-text { max-width:${X(900)}; text-align:center; font-family:${theme.bodyStack}; font-weight:700;
              font-size:${F(40)}; line-height:1.26; color:${theme.paper};
              background:${rgba(theme.ink, 0.88)}; padding:${X(18)} ${X(32)}; border-radius:${X(18)}; }
  ${skin.css ? skin.css(theme, { X, V, F, rgba }) : ""}`;

  const indexHtml = [
    `<!DOCTYPE html>`, `<html lang="en">`, `<head>`, `<meta charset="utf-8">`, `<title>vid</title>`,
    `<script src="${GSAP_CDN}"></script>`,
    `<style>`, style, `</style>`, `</head>`, `<body>`,
    `<div id="root" class="composition" data-composition-id="vid" data-width="${W}" data-height="${H}" data-start="0" data-duration="${D}" style="width:${W}px;height:${H}px;">`,
    worldClip,
    bodyParts.join("\n"),
    cut, chrome, caps,
    `</div>`,
    `<script>`, world.script, `</script>`,
    `<script>`, script, `</script>`,
    `</body>`, `</html>`,
  ].join("\n");

  const metaJson = JSON.stringify({ compositionId: "vid", width: W, height: H, fps: (dims && dims.fps) || 30, duration: D });
  return { indexHtml, metaJson, resolvedBrand: theme.resolvedBrand };
}

// A skin's world() gets these so it can paint without re-deriving colour maths.
module.exports = { build, BASE_STRINGS, rgba, hexToRgb, X, V };
