// FILM STAGE — the shared composer engine behind the 70 imported "FilmKit" packs.
//
// WHY ONE ENGINE. The handoff (templete-design/keyframe-handoff) ships 86 templates, and
// 70 of them are ONE film built seventy ways: every one is a `FilmKit.make(cfg)` call
// against the same `source/film-kit.js`. What differs per template is the cfg — its
// palette, its type pairing, its camera set, its per-beat `look`, its animated `World`,
// and WHICH of the ten interaction mechanics it uses. So the beats, layout, asset
// routing, text fitting, captions and timeline live here ONCE, and each pack ships a
// skin that is very nearly a transcription of its cfg.
//
// This is the same shape as services/om_stage.js, which ports the SEVEN hand-built films
// from the same handoff. The two are deliberately separate: om_stage is calibrated
// against seven shipped packs with golden tests, and the FilmKit family needs ten scene
// types om_stage has never had. Sharing the helpers would have meant editing a file that
// seven live packs render through.
//
// ── THE PORT ────────────────────────────────────────────────────────────────────────
// React + a wall-clock ticker cannot be rendered by HyperFrames, so the runtime is
// replaced by KEYFRAME's contract while the DESIGN is kept intact:
//
//   • per-scene `progress` 0..1  → a paused GSAP timeline seeked by the renderer
//   • the entrance PRESETS        → the same curves as real GSAP fromTo tweens
//   • `makeCam`                   → a GSAP entrance/exit on .fk-cam + a drift on .fk-drift
//   • the ten interaction beats   → recomputed per seek in ONE proxy onUpdate, exactly as
//                                   the source recomputes them per frame. They are pure
//                                   functions of scene-local progress, so this is
//                                   seek-exact rather than merely seek-safe.
//   • `cfg.World`                 → RUN VERBATIM. The world functions are pure functions
//                                   of (theme, t, progress, utils) with no Math.random and
//                                   no Date anywhere in the 70 packs (verified), so the
//                                   authored source is embedded unmodified and re-evaluated
//                                   on every seek against an SVG-DOM shim. This is the
//                                   highest-fidelity option available: the backdrop is not
//                                   a reinterpretation, it is the original function.
//   • `MediaSlot`'s dashed        → real assets in real device frames. A "DROP IMAGE TO
//     "DROP IMAGE TO REPLACE"       REPLACE" placeholder must never reach a rendered film.
//   • `OM_TWEAKS` brand colours   → the Art Director's skin, hue-rotated onto the pack's
//                                   authored luminances so a brand recolours the whole
//                                   world, not just the text.
//
// Engineering contract (identical to every other native composer): one paused GSAP
// timeline on window.__timelines["vid"]; direct-child .clip layers on unique tracks; a
// boundary opacity:0 hard-kill per scene; ONE seek-safe caption node (#cap-text) driven by
// a single onUpdate proxy; finite repeats; cqw units + container-type:size; hidden =
// inline opacity:0 only (never gsap.set); no Math.random / Date / rAF at runtime.

const { fontFaceCss, isBundled } = require("../fonts/pack_fonts");
const { isTrustedProminent, isLogo, categorize } = require("./asset_priority");
const admission = require("./asset_admission");
const { resolveBrand } = require("./brand_kit");
const { safeArea } = require("./responsive");
const { GSAP_CDN, r, esc, hexToRgb, bullets } = require("./composer_kit");
const { tempoOf } = require("./pacing");
const { varyArchetypes } = require("./motion_planner");

// ---- geometry ----------------------------------------------------------------
// The AUTHORED reference frame — every FilmKit template is 1080×1920 (cfg.W/cfg.H) and
// every measurement in the source is a raw pixel against it. Expressed here as a fraction
// of the frame so the compositions keep their exact proportions at any output size.
//   X() — sizes, gaps, borders and every HEIGHT (cqw is always definite, so a box never
//         collapses the way a percentage height inside an auto-height parent does)
//   V() — vertical POSITION only, on a full-frame absolute layer
const RW = 1080, RH = 1920;
const X = (px) => `${r((Number(px) / RW) * 100)}cqw`;
const V = (px) => `${r((Number(px) / RH) * 100)}%`;

// Type scale keyed on the SHORT side (responsive.typeScale's law) so a landscape render
// does not blow the display type up. Portrait — the authored aspect — resolves to 1.
// Set once per build; build() is fully synchronous so this can never interleave.
let TSCALE = 1;
const F = (px) => X(Number(px) * TSCALE);

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

// Deterministic PRNG — BUILD time only, so re-renders are byte-identical while two jobs
// never share a rhythm.
function seedFrom(str) {
  let h = 2166136261; const s = String(str || "fk");
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

// ---- colour maths -------------------------------------------------------------
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
// Rotate onto `hue` while bisecting HSL lightness back to the SOURCE's relative luminance,
// so a recoloured value keeps its exact place in the pack's value ladder.
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

// ---- theme --------------------------------------------------------------------
// A skin declares its authored palette (the cfg's `palette({})` defaults); the brand's own
// accents are hue-mapped onto it SLOT BY SLOT, each landing at that slot's authored
// luminance. Every non-accent colour rotates onto the brand's LEAD hue at pinned
// luminance, which is what makes the whole world — steam curls, jellyfish, marquee rails —
// read branded rather than "the same film with new text".
//
// FAIL-OPEN: any resolver/reHue hiccup renders the authored palette, and a null skin
// returns the exact literals with a null resolvedBrand.
function buildTheme(skin, brandSkin) {
  const faces = [skin.display, skin.body, skin.mono].filter(Boolean).filter(isBundled);
  const fontFace = [...new Set(faces)].map(fontFaceCss).join("");
  const P0 = typeof skin.palette === "function" ? skin.palette({}) : { ...skin.palette };
  const keys = Object.keys(P0);
  const accents = (skin.accents && skin.accents.length ? skin.accents : keys.slice(0, 2)).filter((k) => P0[k]);
  let out = { ...P0 }, resolvedBrand = null;
  try {
    const packAccents = accents.map((k) => P0[k]);
    const brand = resolveBrand(brandSkin, { ground: P0[skin.groundKey], isDark: !!skin.dark, packAccents });
    const led = brandLedOf(brand, packAccents);
    if (brand.applied && led.length) {
      const brandH = led.map(hueOf);
      const packH = packAccents.map(hueOf);
      const last = brandH.length - 1;
      const hueFor = (i) => (i <= last ? brandH[i]
        : brandH.length >= 2 ? brandH[i % brandH.length]
          : brandH[0] + (packH[i] - packH[0]));
      accents.forEach((k, i) => { out[k] = reHue(P0[k], ((hueFor(i) % 360) + 360) % 360); });
      const lead = ((brandH[0] % 360) + 360) % 360;
      for (const k of keys) if (!accents.includes(k)) out[k] = reHue(P0[k], lead);
      resolvedBrand = {
        ...(brandSkin && typeof brandSkin === "object" ? brandSkin : {}),
        accents: accents.slice(0, 3).map((k) => out[k]),
        emphasis: brand.emphasis, adjusted: brand.adjusted, dropped: brand.dropped,
        tier: brand.tier, applied: true,
      };
    }
  } catch { out = { ...P0 }; resolvedBrand = null; }

  const ground = out[skin.groundKey];
  const ink = out[skin.inkKey];
  const paper = out[skin.paperKey || skin.groundKey];
  // Ink that actually READS on a given field — replaces every source template's hardcoded
  // light/dark assumption and stays correct for any brand hue.
  const onField = (bg) => (ratio(ink, bg) >= ratio(paper, bg) ? ink : paper);
  const typeOn = (hex, bg) => (ratio(hex, bg) >= 3 ? hex : onField(bg));

  const theme = {
    ...out,                       // the world source reads theme.<paletteKey> DIRECTLY
    c: out, ground, ink, paper, onField, typeOn,
    accent: out[accents[0]], accent2: out[accents[1]] || out[accents[0]],
    accent3: out[accents[2]] || out[accents[1]] || out[accents[0]],
    displayStack: `'${skin.display}', ${skin.displayFallback || "Georgia, serif"}`,
    bodyStack: `'${skin.body}', ${skin.bodyFallback || "system-ui, sans-serif"}`,
    monoStack: skin.mono ? `'${skin.mono}', ui-monospace, monospace` : "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontFace, resolvedBrand, dark: !!skin.dark,
    brand: skin.brandName || skin.label,
  };
  return theme;
}

// ---- shared strings (a skin overrides any of these) ---------------------------
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
  // interaction-beat furniture
  slot: "DROP HERE",
  done: "DONE",
  stamp: "OK",
  prompt: "",
};

// ---- content extraction -------------------------------------------------------
const wordsOf = (t) => String(t || "").trim().split(/\s+/).filter(Boolean);
const forcedLines = (t) => (String(t || "").includes("|") ? String(t).split("|").map((s) => s.trim()).filter(Boolean) : null);

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
// Shorten to a WORD boundary, and say so when something was dropped — a bare slice cuts
// mid-word and reads as a rendering fault rather than an abbreviation.
const LABEL_MAX = 28;
function shortLabel(text, max = LABEL_MAX) {
  const s = String(text || "").trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const at = cut.lastIndexOf(" ");
  const base = at > max * 0.5 ? cut.slice(0, at) : cut;
  return base.replace(/[\s,;:.!-]+$/, "") + "…";
}
function pickStats(scene, max, S) {
  const out = [];
  for (const l of (Array.isArray(scene.onScreenText) ? scene.onScreenText : [])) {
    const m = STAT_RE.exec(String(l));
    if (m && isFinite(parseFloat(m[2].replace(/,/g, "")))) {
      out.push({
        pre: m[1] || "", target: Math.round(parseFloat(m[2].replace(/,/g, ""))), suf: m[3] || "",
        label: shortLabel(String(l).replace(m[0], "").trim()) || S.metric,
      });
    }
    if (out.length >= max) break;
  }
  if (!out.length) {
    const n = pickNumber(scene);
    if (n) out.push({ ...n, label: shortLabel(scene.subtext || scene.headline || S.metric) });
  }
  return out.slice(0, max);
}

// ---- display-type fitting -----------------------------------------------------
// Each skin declares its display face's average advance (em per character) — Anton is
// condensed at ~0.44, Archivo Black is very wide at ~0.84, and a single shared constant
// would either clip one or leave the other timid. Animations key off ELEMENT COUNTS,
// never off text length, so dynamic copy cannot break the motion.
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
function fitPx(text, basePx, targetCh, floor = 0.58) {
  const len = String(text || "").length || 1;
  return basePx * clamp(targetCh / len, floor, 1);
}

/**
 * A TEXT-ONLY BEAT FILLS THE FRAME IT WAS GIVEN.
 *
 * `fitLines` above returns `Math.min(basePx, col / widest)` — it only ever SHRINKS. That is
 * exactly right when a beat holds a picture: the authored size was chosen to leave room for
 * one, and long copy comes down to fit the column. It is wrong when the beat holds NO picture,
 * because the authored size still reserves the picture's share of the canvas and short copy
 * keeps it — so the frame renders as type floating in the space a photograph was meant to
 * occupy.
 *
 * Measured on real renders, twice, and the reviewer named it both times: "massive empty space
 * and under-illustrated layout covering under 40% of canvas", and "excessive empty canvas area
 * above and below central text elements — scale up counter component to fill 60% width".
 *
 * On a prompt-only film roughly half the beats are text-only whatever the collection stage
 * achieves, so this is not an edge case, it is the common case.
 *
 * Raising the CEILING is all this does. `fitLines` still shrinks whatever it is handed, so
 * long copy is unaffected and nothing can overflow the safe column; only short copy on an
 * empty beat grows. The grown size is additionally capped so a full `maxLines` block cannot
 * run past `capFrac` of the frame height and into the caption band.
 */
const SOLO_GROW = 1.45;
function soloSize(basePx, hasAsset, { maxLines = 4, lineHeight = 1.04, capFrac = 0.54 } = {}) {
  const base = Number(basePx) || 0;
  if (hasAsset || !base) return base;
  const vertical = (RH * capFrac) / Math.max(1, maxLines * lineHeight);
  return Math.max(base, Math.min(base * SOLO_GROW, vertical));
}

// ---- asset gates + presentation ----------------------------------------------
// ADMISSION IS SHARED (services/asset_admission). This used to end in
//     return isTrustedProminent(a) || a.cdProminence === "hero" || a.cdProminence === "support";
// which reads a TRUST signal as an admission test: web stock is trusted by nothing, and the
// Creative Director is told "when in doubt, use background", so a stock photo was simply not
// drawn. Measured on this engine: five good photos in, zero <img> out. Trust now orders the
// pool (displayRank) instead of emptying it; only an explicit reject is excluded.
function shotOk(a) {
  return admission.displayOk(a) && a.__layoutDemoted !== true;
}
// THE RESERVE — captures the Visual Layout Director demoted past its presentation budget.
// VLD's contract is "no asset is discarded"; this pack family has no B-roll layer, so
// without a reserve a demotion would be a deletion. Distribution is coverage-first, so a
// reserve asset is only reached once every beat that could hold a better one already has it.
// It used to require `isTrustedProminent` as well, so a DEMOTED STOCK photo failed the
// primary gate for being untrusted and the reserve gate for the same reason — the one
// combination that made the reserve's own promise ("no asset is discarded") untrue.
function shotReserveOk(a) {
  return admission.displayOk(a) && a.__layoutDemoted === true;
}
const logoAssetOf = (assets) =>
  (Array.isArray(assets) ? assets : []).find((a) => a && a.path && isLogo(a) && !/\.(mp4|webm|mov)($|\?)/i.test(a.path)) || null;

const ratioOf = (a) => Number(a && a.ratio) || (a && a.width && a.height ? a.width / a.height : 0);
// Presentation comes from the asset's REAL pixels, never from the scene. A TALL capture is
// ambiguous — the pipeline captures whole pages — and the discriminator is the capture's
// own WIDTH: a desktop viewport is >=1000px wide however far the page scrolls.
function deviceFor(a) {
  const q = ratioOf(a);
  if (!q) return "card";
  if (q >= 1.2) return "browser";
  if (q <= 0.7) return (Number(a && a.width) || 0) >= 1000 ? "browser" : "phone";
  return "card";
}
const NOT_A_BRAND_HOST = /(^|\.)(blob\.[a-z0-9-]+-storage\.com|s3[.-][a-z0-9-]*\.amazonaws\.com|amazonaws\.com|cloudfront\.net|akamaized\.net|fastly\.net|cdn\.[a-z0-9-]+\.[a-z]+|googleusercontent\.com|githubusercontent\.com|imgix\.net|cloudinary\.com|wp\.com|shopifycdn\.com|squarespace-cdn\.com|typekit\.net|gstatic\.com)$/i;
// The address the film puts on screen. The brand's OWN domain wins and is already known —
// graph.js derives it from the job's websiteUrl and passes it through `localized` as
// ctaUrl. Asset sourceUrls are the fallback, minus storage/CDN hosts, which are never the
// address anyone should type.
function addressFrom(assets, S) {
  const brand = String((S && S.ctaUrl) || "").trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/.*$/, "");
  if (brand) return brand;
  for (const a of Array.isArray(assets) ? assets : []) {
    const u = a && a.sourceUrl;
    if (!u) continue;
    try {
      const h = new URL(String(u)).hostname.replace(/^www\./, "");
      if (h && !NOT_A_BRAND_HOST.test(h)) return h;
    } catch { /* not a URL */ }
  }
  return S.addressBar;
}

// The in-frame capture pan. Travel is resolved at BUILD time from the asset's own ratio and
// the slot's known geometry — never measured from the DOM, which would depend on whether the
// image had decoded when the timeline was built.
const SCROLL_MIN = 0.03;
function scrollPlan(boxW, boxH, asset) {
  const q = ratioOf(asset);
  const natH = asset && asset.path ? (q ? boxW / q : 0) : boxH * 1.7;
  if (!natH || natH <= boxH) return { natH: 0, frac: 0 };
  const frac = (natH - boxH) / natH;
  return frac < SCROLL_MIN ? { natH: 0, frac: 0 } : { natH, frac };
}

// FIT BY WHAT THE ASSET IS. `contain` is correct for a SCREENSHOT — cropping a UI cuts off
// the very thing the shot exists to show — but it is wrong for a photograph, which is a
// texture that every editor crops. Anything unclassified stays on the conservative `contain`.
const PHOTO_KINDS = new Set(["photo", "illustration", "people", "texture"]);
function cropFocus(asset, w, h, fallback) {
  try { return require("./crop_engine").focusFor(asset, w, h, fallback); }
  catch { return (asset && asset.cropFocus) || fallback; }
}
function fitFor(asset) {
  const hint = String((asset && (asset.kindHint || asset.assetType)) || "").toLowerCase();
  if (PHOTO_KINDS.has(hint)) return "cover";
  if (hint === "screenshot") return "contain";
  const src = String((asset && asset.source) || "").toLowerCase();
  if (src === "website" || src === "upload") return "contain";
  return src ? "cover" : "contain";
}
function plate(theme, { asset, scrollId, natH, tint }) {
  if (asset && asset.path) {
    const fit = fitFor(asset);
    return scrollId && natH
      ? `<div id="${scrollId}" style="position:absolute;left:0;right:0;top:0;height:${X(natH)};"><img src="${esc(asset.path)}" alt="${esc(asset.alt || "")}" style="width:100%;height:100%;object-fit:cover;object-position:top center;display:block;"></div>`
      : `<img src="${esc(asset.path)}" alt="${esc(asset.alt || "")}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:${fit};object-position:${fit === "cover" ? cropFocus(asset, 0, 0, "center") : "center"};display:block;">`;
  }
  const wire = wirePlate(theme, tint);
  return scrollId && natH
    ? `<div id="${scrollId}" style="position:absolute;left:0;right:0;top:0;height:${X(natH)};">${wire}</div>`
    : `<div style="position:absolute;inset:0;">${wire}</div>`;
}
// A generated wireframe built from the pack's OWN colours, so an empty slot still reads as
// designed. The source's dashed "DROP IMAGE TO REPLACE" box is deliberately gone.
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
// A capture used as a BACKDROP rather than as a subject. Blur (not opacity alone) is what
// destroys the capture's own glyph legibility while keeping the impression of a product
// screen, and the plate fades its own ALPHA with a mask so it makes no assumption about the
// colour behind it — every pack draws a live world between the ground and the copy.
const PLATE_MASK = "linear-gradient(to bottom,rgba(0,0,0,0) 0%,rgba(0,0,0,1) 22%,rgba(0,0,0,1) 78%,rgba(0,0,0,0) 100%)";
function backingPlate(asset, top, height) {
  return `<div style="position:absolute;left:0;right:0;top:${top};height:${height};overflow:hidden;-webkit-mask-image:${PLATE_MASK};mask-image:${PLATE_MASK};">
      <img src="${esc(asset.path)}" alt="${esc(asset.alt || "")}" style="width:100%;height:100%;object-fit:cover;object-position:center;opacity:.22;filter:blur(${X(9)});transform:scale(1.06);display:block;">
    </div>`;
}

// The device frame, in the SKIN's card language. FilmKit's `look.<beat>.card.v` picks the
// treatment: "tilt" (rotated + dropped), "glow" (accent halo), "paper" (white card) or
// "frame" (the plain shadowed default).
function frameHtml(theme, skin, { device, asset, boxH, tint, scrollId, address, natH, cardV, radius }) {
  const t = tint || theme.accent;
  const v = cardV || "frame";
  const rad = radius == null ? 24 : radius;
  const shell = v === "glow"
    ? `border:${X(2)} solid ${rgba(t, 0.55)};box-shadow:0 0 ${X(44)} ${rgba(t, 0.25)}, 0 ${X(28)} ${X(56)} ${rgba("#000000", 0.5)};`
    : v === "paper"
      ? `box-shadow:0 ${X(26)} ${X(54)} ${rgba("#140f0a", 0.3)};`
      : v === "tilt"
        ? `box-shadow:0 ${X(30)} ${X(62)} ${rgba("#0a0a0c", 0.4)};`
        : `box-shadow:0 ${X(30)} ${X(62)} ${rgba("#0a0a0c", 0.38)};`;
  const shellBg = v === "paper" ? "#ffffff" : theme.ink;

  if (device === "phone") {
    return `<div style="width:100%;height:100%;border-radius:${X(50)};background:${theme.ink};padding:${X(14)};box-sizing:border-box;${shell}position:relative;overflow:hidden;">
      <div style="position:absolute;left:0;right:0;top:${X(24)};display:flex;justify-content:center;z-index:2;"><div style="width:${X(110)};height:${X(24)};border-radius:999px;background:${theme.ink};"></div></div>
      <div style="position:absolute;inset:${X(14)};border-radius:${X(38)};background:${rgba(t, 0.18)};overflow:hidden;">
        ${plate(theme, { asset, scrollId, natH, tint: t })}
      </div>
    </div>`;
  }
  if (device === "browser") {
    return `<div style="width:100%;border-radius:${X(rad + 6)};background:${shellBg};padding:${X(12)};box-sizing:border-box;${shell}overflow:hidden;">
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
  // THE CARD FRAME MUST SCROLL LIKE THE OTHER TWO.
  //
  // This branch called `plate(theme, { asset, tint: t })` — dropping `scrollId` and `natH`,
  // which are exactly the two arguments that make `plate` draw the scrolling wrapper. The
  // caller had already decided a scroll was warranted (`bHook`/`bFeature` compute
  // `scrollPlan` from the asset, then RETURN `scroll: {id, frac}` so the timeline emits a
  // `tl.fromTo("#<id>", …)` tween), so on every card-ratio capture the film animated a node
  // that was never rendered: 84 packs, one dead selector each, caught by test:dead-tweens.
  //
  // It was invisible until now only because the trust gate meant the hook rarely held a
  // picture at all. Passing the two arguments through is the whole fix — a tall capture in a
  // card frame now scrolls, which is what the caller asked for.
  return `<div style="width:100%;height:100%;border-radius:${X(rad)};${shell}overflow:hidden;position:relative;background:${rgba(t, 0.18)};">
    ${plate(theme, { asset, scrollId, natH, tint: t })}
  </div>`;
}

// ---- archetypes ---------------------------------------------------------------
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
// Beats that can put imagery on screen. A shot must NEVER be stranded on a scene that shows
// none, so distribution only ever targets these.
const CAN_SHOW = new Set(["hook", "feature", "montage", "statement", "stats"]);
// How many shots a beat can actually RENDER. Without this, surplus shots get routed onto
// beats already at capacity and silently vanish after the Creative Director paid to fetch,
// score and assign them.
const SHOT_CAPACITY = { hook: 1, statement: 1, stats: 1, feature: 4, montage: 4 };
const capacityOf = (arch) => SHOT_CAPACITY[arch] || 0;

// ── MECHANIC ROUTING ────────────────────────────────────────────────────────────
// The source authors its interaction beats EXPLICITLY in OM_SCENES; KEYFRAME generates its
// storyboard, so the mapping has to be derived. Each template's cfg declares exactly which
// mechanics it owns (`variants`), and the README's promise is that no two templates share a
// mechanism — so a pack that never declared `Typing` must never render a typewriter.
//
// A core archetype therefore keeps its slot in the film's narrative and is EXPRESSED as one
// of the mechanics this pack actually declared. The rotation is seeded per job, so two films
// on one template use different subsets in a different order — which is what the source's
// hand-authored 15-scene decks do by construction.
const MECHANIC_FOR = {
  // archetype  → the mechanics that can legitimately stand in for it
  statement: ["Morph", "Notify", "Toggle", "Swipe"],
  feature: ["Typing", "Code", "Cursor", "DragDrop"],
  montage: ["Scroll", "Swipe"],
  stats: ["Ring"],
};
const MECHANIC_NEEDS_NO_SHOT = new Set(["Morph", "Notify", "Toggle", "Swipe", "Typing", "Code", "Cursor", "DragDrop", "Scroll", "Ring"]);

// ---- entrance presets ---------------------------------------------------------
// film-kit.js's nine PRESETS, restated as GSAP fromTo vars. The curves are exact:
// outQuint === power4.out, outExpo === expo.out, outCubic === power2.out, and the source's
// outBack uses overshoot c = 2.0, which is GSAP's back.out(2).
//
// `dur` and `stagger` are FRACTIONS OF SCENE LENGTH in the source, where a scene is ~3s.
// A KEYFRAME scene can be twice that, and a proportional entrance would then crawl — so
// they are scaled by the scene but clamped to the band the design was tuned in.
const PRESETS = {
  slam: { dur: 0.28, st: 0.055, ease: "expo.out", from: { opacity: 0, scale: 2.2, rotation: -4 } },
  bounce: { dur: 0.34, st: 0.06, ease: "back.out(2)", from: { opacity: 0, y: 110, scale: 0.7 } },
  rise: { dur: 0.38, st: 0.055, ease: "power4.out", from: { opacity: 0, y: 46 } },
  streak: { dur: 0.30, st: 0.05, ease: "expo.out", from: { opacity: 0, x: 150, skewX: -12 } },
  stamp: { dur: 0.32, st: 0.06, ease: "back.out(2)", from: { opacity: 0, scale: 1.7, rotation: 6 } },
  drowse: { dur: 0.46, st: 0.07, ease: "power4.out", from: { opacity: 0, y: 34 } },
  machete: { dur: 0.36, st: 0.055, ease: "power4.out", from: { opacity: 0, x: -90, skewX: -6 } },
  flip: { dur: 0.40, st: 0.06, ease: "power4.out", from: { opacity: 0, y: 30, scaleY: 0.2 }, origin: "bottom left" },
  pop: { dur: 0.40, st: 0.06, ease: "back.out(2)", from: { opacity: 0, scale: 0.6 } },
};

// The source's `makeCam` kinds, as an entrance offset + an exit slide. The big push is an
// ENTRANCE (offscreen -> 0), so unlike a resting drift it costs the layout no safe area;
// the persistent world layer behind the camera is what the viewer sees during it, exactly
// as in the original.
function camVarsFor(kind, m, W, H, energy) {
  const k = Math.min(energy, 1.15);
  const z = { x: 0, y: 0, rotation: 0, skewX: 0, scale: 1, opacity: 1 };
  const from = { ...z, opacity: 1 }, exit = { x: 0, y: 0 };
  switch (kind) {
    case "pushL": from.x = W * k * m.x; exit.x = -W * m.slide; from.rotation = 3 * m.rot; from.skewX = -m.skew; break;
    case "pushR": from.x = -W * k * m.x; exit.x = W * m.slide; from.rotation = -3 * m.rot; from.skewX = m.skew; break;
    case "pushU": from.y = H * k * m.y; exit.y = -H * m.slide * 0.8; break;
    case "pushD": from.y = -H * k * m.y; exit.y = H * m.slide * 0.8; break;
    case "zoomIn": from.scale = 1 + m.zin; from.opacity = 0; from.rotation = -3 * m.rot; break;
    case "zoomOut": from.scale = 1 - m.zout; from.opacity = 0; from.rotation = 5 * m.rot; break;
    case "spin": from.scale = 1 - 0.3; from.opacity = 0; from.rotation = 10 * m.rot; break;
    case "hopU": from.y = H * k * m.y; exit.y = -H * 0.22; from.rotation = 3 * m.rot; break;
    case "drop": from.y = -H * k * m.y; exit.y = H * 0.22; from.scale = 1 + 0.12; break;
    default: from.opacity = 0; break;
  }
  return { from, exit };
}

// PACE is the source's time remap: the first 20% of a scene carries 50% of the action, the
// long middle coasts, the last 22% snaps. `seg(p,a,b)` runs on PACE(p), so a camera window
// stated in ACTION space has to be inverted back into TIME to become a GSAP duration.
const PACE = (p) => (p <= 0.2 ? p * 2.5 : p <= 0.78 ? 0.5 + (p - 0.2) * 0.41379 : 0.74 + (p - 0.78) * 1.18182);
function paceInv(y) {
  if (y <= 0.5) return y / 2.5;
  if (y <= 0.74) return 0.2 + (y - 0.5) / 0.41379;
  return 0.78 + (y - 0.74) / 1.18182;
}

// Every element carrying data-in becomes one fromTo. Elements are found by attribute rather
// than by a generated id so a builder can emit as many as it likes without bookkeeping.
const IN_RE = /data-in="([a-z]+)"\s+data-i="(\d+)"/g;
function enterScript(id, T, L, html, skin, W, H) {
  const seen = new Map();
  let mm;
  IN_RE.lastIndex = 0;
  while ((mm = IN_RE.exec(html))) {
    const key = `${mm[1]}|${mm[2]}`;
    if (!seen.has(key)) seen.set(key, { role: mm[1], i: Number(mm[2]) });
  }
  const out = [];
  for (const [, { role, i }] of seen) {
    const name = role === "title" ? (skin.titlePreset || "rise")
      : role === "item" ? (skin.itemPreset || "pop")
        : role;
    const P = PRESETS[name] || PRESETS.rise;
    const dur = clamp(P.dur * L, 0.34, 1.35);
    const delay = clamp(P.st * L, 0.05, 0.28) * i;
    const from = { ...P.from };
    // The source's px offsets are against its authored 1080x1920 frame, so they scale with
    // the real output rather than being emitted as literal pixels.
    if (from.x != null) from.x = r((from.x / RW) * W);
    if (from.y != null) from.y = r((from.y / RH) * H);
    const vars = Object.entries(from).map(([kk, vv]) => `${kk}:${vv}`).join(",");
    const to = ["opacity:1", from.x != null ? "x:0" : "", from.y != null ? "y:0" : "",
      from.scale != null ? "scale:1" : "", from.scaleY != null ? "scaleY:1" : "",
      from.rotation != null ? "rotation:0" : "", from.skewX != null ? "skewX:0" : ""]
      .filter(Boolean).join(",");
    // SINGLE quotes inside the attribute selector: the selector is emitted inside a
    // double-quoted JS string literal, so a nested double quote closes it early and the
    // whole timeline script fails to parse — which renders a blank video.
    const sel = `#${id} [data-in='${role}'][data-i='${i}']`;
    if (P.origin) out.push(`tl.set("${sel}",{transformOrigin:"${P.origin}"},0);`);
    out.push(`tl.fromTo("${sel}",{${vars}},{${to},duration:${r(dur)},ease:"${P.ease}",immediateRender:false},${r(T + delay)});`);
  }
  return out;
}

// ---- MAIN ---------------------------------------------------------------------
function build(skin, { storyboard, dims, framePack, captionCues, assets, brandSkin = null, localized = null, seedKey = null } = {}) {
  const { BUILDERS } = require("./film_beats");          // required here: film_beats requires us back
  const { SVG_SHIM, UTILS_SHIM, MECHANICS_SHIM } = require("./film_runtime");

  const theme = buildTheme(skin, brandSkin);
  const Str = { ...BASE_STRINGS, ...(skin.strings || {}), ...(localized || {}) };
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
  const address = addressFrom(assets, Str);
  const tempo = tempoOf(sb);
  const energy = (skin.energy || 1) / (tempo.motion || 1);

  // The look table, with `app` defaulted exactly as the source's `A()` does.
  const look = { ...skin.look };
  if (!look.app) {
    look.app = {
      bg: look.statement.bg, fg: look.statement.fg, hi: look.hook.hi,
      cardBg: (look.feature.card && look.feature.card.bg) || "ink",
      line: (look.feature.card && look.feature.card.line) || "paper",
      world: false, upper: look.statement.upper,
    };
  }
  const panelR = (look.feature.card && look.feature.card.r != null) ? Math.max(10, look.feature.card.r) : 22;

  // ---- assets: distribute captures across DISPLAY-CAPABLE beats ---------------
  const all = Array.isArray(assets) ? assets : [];
  const logo = logoAssetOf(all);
  // SEAT ORDER IS TIER-FIRST, NOT cdScore-FIRST. Ordering by `cdScore` alone let a lucky
  // stock photo take the hero beat ahead of the user's own dashboard, and left an asset the
  // CD never scored (a reuse clone, a top-up, anything added after the review) at 0 — dead
  // last behind everything, however good its pixels. displayRank keeps tier as the major
  // key (the house law), then prominence, then the measured pixel grade, then the CD score.
  const byScore = admission.byDisplayRank;
  const primaryShots = all.filter(shotOk).sort(byScore);
  const reserveShots = all.filter(shotReserveOk).sort(byScore);
  const shots = [...primaryShots, ...reserveShots];

  const baseArch = scenes.map((sc, i) => archetypeFor(sc, i, scenes.length));
  const { archetypes: varied } = varyArchetypes(baseArch, {
    pool: ["hook", "statement", "feature", "montage", "stats", "cta"],
    seedKey: scenes.map((s) => s && s.id).join("|"),
  });
  for (let i = 0; i < baseArch.length; i++) baseArch[i] = varied[i];
  if (primaryShots.length >= 3 && !baseArch.includes("montage")) {
    const idx = baseArch.findIndex((a, i) => i > 0 && i < scenes.length - 1 && a === "statement");
    if (idx >= 0) baseArch[idx] = "montage";
  }

  // PICTURES ARE SEATED BEFORE MECHANICS ARE CHOSEN.
  //
  // The source decks run 15-18 hand-authored scenes, so they can afford a Typing beat and a
  // Feature beat and a Montage wall. A KEYFRAME film is five to eight scenes, and routing
  // scenes to mechanics FIRST — which is what this did — spent half of them on beats that
  // draw no imagery: the portrait asset guard measured 1 of 5 scenes showing a picture on 22
  // packs, with collected assets left unplaced.
  //
  // So distribution runs first over EVERY display-capable beat, and mechanics then claim only
  // the beats that came out empty. That is not a compromise between the two goals, it is the
  // best of both: no asset is ever displaced, and the beats that would otherwise have been a
  // bare text slide become the pack's most distinctive moment instead.
  const declared = skin.variants || {};
  const mechPlan = new Array(scenes.length).fill(null);
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
    // COVERAGE BEFORE DEPTH — every display beat earns its FIRST shot before any beat earns
    // a second; only then does the montage wall accumulate the surplus.
    const room = (i) => sceneShots[i].length < capacityOf(baseArch[i]);
    const holds = (i, a) => sceneShots[i].some((x) => x && a && x.path === a.path);
    const free = (i, a) => room(i) && !holds(i, a);
    for (const a of leftovers) {
      let best = displayIdx.find((i) => baseArch[i] === "montage" && !sceneShots[i].length);
      if (best == null) best = displayIdx.find((i) => !sceneShots[i].length && free(i, a));
      if (best == null) best = displayIdx.find((i) => baseArch[i] === "montage" && free(i, a));
      if (best == null) {
        const openIdx = displayIdx.filter((i) => free(i, a));
        if (openIdx.length) {
          best = openIdx[0];
          for (const i of openIdx) if (sceneShots[i].length < sceneShots[best].length) best = i;
        }
      }
      if (best == null) best = displayIdx.find((i) => capacityOf(baseArch[i]) >= 4 && !holds(i, a));
      if (best == null) continue;
      sceneShots[best].push(a);
    }
  }

  // ---- MECHANIC ROUTING (after seating) ---------------------------------------
  // Express an EMPTY archetype as one of the mechanics THIS pack declared. A pack that never
  // declared `Typing` never renders a typewriter — the handoff's promise is that no two
  // templates share a mechanism, and that promise lives in `variants`.
  //
  // The hook keeps its layout unconditionally (it is the opener and carries the brand lockup)
  // and so does the cta (it carries the logo and the address). Everything between is fair game
  // when it holds no picture.
  {
    const off = Math.floor(rnd() * 7);
    let used = null, n = 0;
    for (let i = 0; i < scenes.length; i++) {
      const arch = baseArch[i];
      if (arch === "hook" || arch === "cta") continue;
      if (sceneShots[i] && sceneShots[i].length) continue;   // never displace a seated picture
      const pool = (MECHANIC_FOR[arch] || []).filter((k) => declared[k]);
      if (!pool.length) continue;
      const pick = pool[(off + n) % pool.length];
      n++;
      if (pick === used) continue;                            // never the same mechanic twice running
      used = pick;
      mechPlan[i] = { name: pick, variant: declared[pick] };
    }
  }

  // ---- grounds ----------------------------------------------------------------
  // Each beat's `look.<beat>.bg` IS its ground — the source swaps the whole field per beat,
  // and that alternation is a large part of why these films do not read as one backdrop
  // with rotating copy.
  const groundOf = (i) => {
    const m = mechPlan[i];
    const key = m ? look.app.bg : (look[baseArch[i]] || look.statement).bg;
    return col2(theme, key);
  };

  // ---- build the scenes -------------------------------------------------------
  const startOf = (i) => scenes.slice(0, i).reduce((a, s) => a + (Number(s.duration) || 0), 0);
  const bodyParts = [], sceneScripts = [], labels = [], starts = [], durs = [], mechs = [], grounds = [];
  const camOrder = skin.cams && skin.cams.length ? skin.cams : ["pushL", "zoomIn", "hopU", "pushR", "zoomOut", "drop"];
  const camMul = skin.camMul || 5, camOffBase = skin.camOff || 1;
  const camOff = Math.floor(rnd() * camOrder.length);
  const mag = Object.assign({ x: 1, y: 1, rot: 1, skew: 0, zin: 0.5, zout: 0.4, driftX: 8, driftY: 7, driftZ: 0.055, slide: 0.27, inn: 0.23, out: 0.81 }, skin.mag || {});
  const innT = paceInv(mag.inn), outT = paceInv(mag.out);

  scenes.forEach((scene, i) => {
    const T = r(scene.start != null ? scene.start : startOf(i));
    const L = r(scene.duration || 4);
    let arch = baseArch[i];
    let sceneAssets = sceneShots[i];
    const m = mechPlan[i];

    // AN OFF-TOPIC PICTURE IS WORSE THAN NO PICTURE — BUT ONLY WHEN IT IS THE WHOLE SCENE.
    //
    // The Creative Director already judges every asset and records the verdict: on job
    // zwq8nrrpht the s6 wire carried sees:"person walking away outdoors holding bottle",
    // cdScore:38, floorPassed:false, visionOk:false — and __rejected:false. Everything
    // downstream treats visionOk:false as a RANKING penalty (asset_priority caps the score at
    // 0.5, asset_quality at 0.4) and nothing treats it as a reason not to show the thing, so
    // it became the sole visual of a beat about understanding complex topics. This engine had
    // no relevance gate at all — unlike scene_kit, om_stage, flagship, brightlife and
    // blueprint, which all consult visionOk before promoting an asset.
    //
    // The gate is deliberately narrow, because the wide version is a known regression:
    // om_stage.shotReserveOk carries the scar — "on a prompt-only film every asset is stock,
    // so the trim did not drop the WEAK stock, it dropped ALL of it, and a film whose whole
    // wire was demoted rendered no pictures whatever". So a rejected asset is dropped ONLY
    // when it would be the ONE picture in the beat; where it is one tile among several it
    // still earns its place, ranked last as it already is. Owned material (uploads, site
    // captures) is never dropped — that is the tier law.
    const { isOwned } = require("./asset_priority");
    const offTopic = (a) => a && !isOwned(a) && a.visionOk === false && a.floorPassed === false;
    if (!m && CAN_SHOW.has(arch) && sceneAssets.length === 1 && offTopic(sceneAssets[0])) {
      sceneAssets = [];
    }

    if (!m && CAN_SHOW.has(arch) && sceneAssets.length) {
      if (arch === "montage") sceneAssets = sceneAssets.slice(0, 4);
      else if (arch === "statement" || arch === "stats") sceneAssets = sceneAssets.slice(0, 1);
      else if (sceneAssets.length >= 2 && arch !== "hook") { arch = "montage"; sceneAssets = sceneAssets.slice(0, 4); }
      else sceneAssets = sceneAssets.slice(0, 1);
    } else if (!m && arch === "montage" && !sceneAssets.length) {
      arch = "feature";          // an empty wall is worse than one wireframe product moment
    }

    const ground = groundOf(i);
    grounds.push(ground);
    // Does the animated world show on THIS beat? The resolved look answers it — an interaction
    // beat reads the `app` look, everything else its own. A beat that says no paints its own
    // ground (see film_beats.open), which is both the source's behaviour and what keeps its
    // authored text colour readable.
    const lookForBeat = m ? look.app : (look[arch] || look.statement);
    const ctx = {
      id: `s${i + 1}`, T, L, i, isLast: i === scenes.length - 1, track: 10 + i,
      theme, skin, S: Str, Str, ground, address, title, look, panelR, sa: safeArea(W, H),
      opaque: lookForBeat && lookForBeat.world === false,
    };
    const key = m ? m.name : arch;
    const built = (BUILDERS[key] || BUILDERS.statement)(scene, ctx, arch === "cta" ? null : sceneAssets, logo, m && m.variant);
    bodyParts.push(built.html);
    labels.push(String(scene.kicker || scene.purpose || arch).slice(0, 22));
    starts.push(T); durs.push(L);
    if (built.mech) mechs.push({ ...built.mech, T, L });

    const s = [];
    // One scene on screen at a time, as the source's SceneStage does. A short crossfade
    // covers the swap; the camera move is what actually reads as the cut.
    s.push(`tl.fromTo("#${ctx.id}",{opacity:0},{opacity:1,duration:0.2,ease:"power2.out",immediateRender:false},${r(Math.max(0, T - 0.1))});`);
    s.push(...enterScript(ctx.id, T, L, built.html, skin, W, H));

    // CAMERA — the source's per-scene move, indexed exactly as it indexes (sc.index * camMul
    // + camOff), with a per-job rotation on top so two films on one pack differ.
    const kind = camOrder[(i * camMul + camOffBase + camOff) % camOrder.length];
    const cv = camVarsFor(kind, mag, W, H, energy);
    const inDur = clamp(innT * L, 0.28, 1.5);
    const outDur = clamp((1 - outT) * L, 0.25, 1.2);
    const fromStr = Object.entries(cv.from).map(([kk, vv]) => `${kk}:${r(vv)}`).join(",");
    s.push(`tl.fromTo("#${ctx.id}-cam",{${fromStr}},{x:0,y:0,rotation:0,skewX:0,scale:1,opacity:1,duration:${r(inDur)},ease:"power4.out",immediateRender:false},${T});`);
    if (!ctx.isLast && (cv.exit.x || cv.exit.y)) {
      s.push(`tl.to("#${ctx.id}-cam",{x:${r(cv.exit.x)},y:${r(cv.exit.y)},duration:${r(outDur)},ease:"power2.in",immediateRender:false},${r(T + L - outDur)});`);
    }

    if (built.scroll) {
      s.push(`tl.fromTo("#${built.scroll.id}",{yPercent:0},{yPercent:${r(-built.scroll.frac * 100)},duration:${r(Math.max(0.6, L - 1.2))},ease:"none",immediateRender:false},${r(T + 0.8)});`);
    }
    if (!ctx.isLast) {
      // A fade-out alone is not enough: a non-linear seek can land after the tween and keep
      // stale visibility, so the hard kill on the boundary is mandatory.
      s.push(`tl.to("#${ctx.id}",{opacity:0,duration:0.2,ease:"power2.in",overwrite:"auto"},${r(T + L - 0.2)});`);
      s.push(`tl.set("#${ctx.id}",{opacity:0},${r(T + L)});`);
    }
    sceneScripts.push(s.join("\n  "));
  });

  // ---- the persistent WORLD ---------------------------------------------------
  // The authored function, embedded unmodified and re-evaluated on every seek. `ambient`
  // is the source's clock multiplier — the world runs on film time x ambient, exactly as
  // `useTl()` did.
  const worldSrc = skin.World ? String(skin.World) : null;
  const groundCss = skin.groundCss ? String(skin.groundCss) : null;
  const worldClip = `<div id="fk-world" class="clip" data-start="0" data-duration="${D}" data-track-index="0" data-layout-allow-occlusion style="background:${grounds[0]};">
    <div id="fk-ground" style="position:absolute;inset:0;"></div>
    <svg id="fk-svg" width="${W}" height="${H}" viewBox="0 0 ${RW} ${RH}" preserveAspectRatio="xMidYMid slice" style="position:absolute;inset:0;width:100%;height:100%;"></svg>
  </div>`;

  // NO PROGRESS RAIL. A `#fk-prog` fill used to run across the top of every film, scaling 0->1
  // over the whole duration on a track above the picture. It was never a design decision — the
  // idiom was copied from engine to engine (om_stage, prisma, om_port_kit, grid-dispatch,
  // slab-stage all grew one) and it is baked into the exported MP4, not preview chrome. A
  // finished advertisement does not wear a scrubber: the bar was the single clearest tell that
  // a KEYFRAME film was a "render" rather than a film.
  //
  // The chrome layer itself STAYS — it carries the brand badge and brand name, which are the
  // reason it exists. Only the rail and the band it sat in are gone. Guarded by
  // `npm run test:no-playback-chrome`, which rebuilds every pack and fails on both the naming
  // and the shape of a progress fill, so re-adding one cannot pass silently.
  const chrome = `<div id="fk-chrome" class="clip" data-start="0" data-duration="${D}" data-track-index="92" data-layout-allow-occlusion style="pointer-events:none;">
    <div style="position:absolute;left:${X(72)};top:${V(56)};display:flex;align-items:center;gap:${X(15)};">
      ${skin.badge === "none" ? "" : `<div style="width:${X(47)};height:${X(47)};border-radius:${skin.badge === "square" ? X(11) : "999px"};background:${skin.badge === "outline" ? "transparent" : theme.accent};${skin.badge === "outline" ? `border:${X(2)} solid ${theme.accent};` : ""}display:flex;align-items:center;justify-content:center;overflow:hidden;">${renderIcon(skin, theme, grounds[0])}</div>`}
      <span id="fk-brandname" style="font-family:${theme.displayStack};font-size:${F(31)};color:${theme.onField(grounds[0])};">${esc(String(Str.brandName || theme.brand || "").slice(0, 24))}</span>
    </div>
  </div>`;

  const caps = `<div id="caps" class="clip" data-start="0" data-duration="${D}" data-track-index="94" data-layout-allow-occlusion style="pointer-events:none;">
    <div id="cap-pill" style="position:absolute;left:${X(56)};right:${X(56)};bottom:${capBottom}%;display:flex;justify-content:center;opacity:0;">
      <div id="cap-text"></div>
    </div>
  </div>`;

  const cues = (Array.isArray(captionCues) ? captionCues : [])
    .filter((c) => c && c.text != null)
    .map((c) => [r(c.start != null ? c.start : c.startSec || 0), r(c.end != null ? c.end : (c.start || 0) + 2), String(c.text)]);

  // Every non-function palette value the world source reads as `theme.<key>`, plus the
  // resolved roles. The world sees the BRAND-ROTATED palette, which is what makes a magenta
  // brand grow a magenta garden rather than recolouring the headline alone.
  const worldTheme = { ...theme.c, energy, brand: theme.brand, currentBg: grounds[0], accent: theme.accent, accent2: theme.accent2, ink: theme.ink, paper: theme.paper };

  const script = `(function(){
  var D=${D};
  var tl=gsap.timeline({paused:true});
  var $=function(s){return document.querySelector(s);};
  var $$=function(s){return Array.prototype.slice.call(document.querySelectorAll(s));};

  // Count-up: a scrubbed numeric proxy, so a seek to any time shows the right number. The
  // element's RESTING text is already the final value.
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
  ${starts.map((t, i) => `count("#s${i + 1}",${r(t + 0.25)},${r(Math.max(0.8, durs[i] * 0.6))});`).join("\n  ")}

  ${sceneScripts.join("\n  ")}

  // ---- ONE seek-safe proxy: world, camera drift, mechanics, chrome and captions ----
  var cues=${JSON.stringify(cues)};
  var starts=${JSON.stringify(starts)};
  var durs=${JSON.stringify(durs)};
  var inks=${JSON.stringify(grounds.map((g) => theme.onField(g)))};
  var grounds=${JSON.stringify(grounds)};
  var worldEl=$("#fk-world"),groundEl=$("#fk-ground");
  var MECHS=${JSON.stringify(mechs)};
  var AMB=${r(skin.ambient || 1.7)};
  var MAG=${JSON.stringify({ driftX: mag.driftX, driftY: mag.driftY, driftZ: mag.driftZ, out: mag.out })};
  var ENERGY=${r(energy)};
  var capPill=$("#cap-pill"),capText=$("#cap-text"),brandEl=$("#fk-brandname");
  var curCue=-1,curScene=-1;
  tl.to({},{duration:D,ease:"none",onUpdate:function(){
    var now=tl.time();
    if(window.FK_WORLD)window.FK_WORLD(now*AMB, now/D);
    var si=0; while(si<starts.length-1&&now+0.24>=starts[si+1])si++;
    if(si!==curScene){
      curScene=si;
      if(brandEl)brandEl.style.color=inks[si];
      // THE GROUND IS PER BEAT. Each beat's look.<beat>.bg IS its field — the source swaps the
      // whole ground per beat, and every beat's text colour is authored against ITS OWN field.
      // Painting one ground for the whole film therefore does not merely lose the alternation:
      // it renders any beat authored for a light field as dark-on-dark. cat-nap's feature beat
      // is drawn in #241d2e for a #f6efe4 ground, and on a night ground it vanished entirely.
      if(worldEl){worldEl.style.backgroundColor=grounds[si];}
      if(groundEl&&window.FK_GROUND){try{groundEl.style.background=window.FK_GROUND(grounds[si]);}catch(e){}}
    }
    // CAMERA DRIFT — the source's continuous sine drift, on its own wrapper so it can never
    // fight the GSAP entrance/exit transform on the camera wrapper above it.
    for(var d=0;d<starts.length;d++){
      var el=document.getElementById("s"+(d+1)+"-drift"); if(!el)continue;
      var lp=(now-starts[d])/(durs[d]||1); if(lp<0)lp=0; if(lp>1)lp=1;
      var dx=Math.sin(now*AMB*0.34)*MAG.driftX*ENERGY-lp*14;
      var dy=Math.cos(now*AMB*0.46)*MAG.driftY*ENERGY;
      var dz=1+lp*MAG.driftZ*ENERGY;
      el.style.transform="translate("+dx.toFixed(2)+"px,"+dy.toFixed(2)+"px) scale("+dz.toFixed(4)+")";
    }
    // INTERACTION MECHANICS — recomputed from scene-local progress, exactly as the source
    // recomputes them per frame. Seek-exact in both directions.
    for(var mi=0;mi<MECHS.length;mi++){
      var m=MECHS[mi];
      var lp2=(now-m.T)/(m.L||1); if(lp2<0)lp2=0; if(lp2>1)lp2=1;
      var fn=FKMECH[m.kind]; if(fn)fn(m,lp2,now*AMB);
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

  const worldScript = `(function(){
${SVG_SHIM}
${UTILS_SHIM}
${MECHANICS_SHIM}
var THEME=${JSON.stringify(worldTheme)};
var U={rgba:rgba,seg:FKseg,segRaw:FKsegRaw,clamp01:FKclamp01,lerp:FKlerp,ease:FKease,W:${RW},H:${RH}};
${worldSrc ? `var World=${worldSrc};` : "var World=null;"}
${groundCss ? `var GroundCss=${groundCss};` : "var GroundCss=null;"}
var SVG=document.getElementById("fk-svg");
var GROUND=document.getElementById("fk-ground");
if(GroundCss){window.FK_GROUND=function(bg){return GroundCss(THEME,bg);};}
if(GroundCss&&GROUND){try{GROUND.style.background=GroundCss(THEME,${JSON.stringify(grounds[0])});}catch(e){}}
// Painted ONLY from the timeline's seek time — deterministic and seek-exact. The source
// rebuilt this subtree every animation frame; so does this, from the same function.
function FKdraw(t,p){
  if(!World||!SVG)return;
  while(SVG.firstChild)SVG.removeChild(SVG.firstChild);
  try{
    var out=World(THEME,t,p,U);
    if(out&&out.__fkel)SVG.appendChild(out.node);
    else if(Array.isArray(out)){for(var i=0;i<out.length;i++)if(out[i]&&out[i].__fkel)SVG.appendChild(out[i].node);}
  }catch(e){}
}
window.FK_WORLD=FKdraw;
window.addEventListener("hf-seek",function(e){FKdraw(((e.detail&&e.detail.time)||0)*${r(skin.ambient || 1.7)},((e.detail&&e.detail.time)||0)/${D});});
FKdraw(0,0);
window.FKMECH=FKMECH;
})();`;

  const style = `${theme.fontFace}
  * { box-sizing:border-box; margin:0; padding:0; }
  html, body { width:100%; height:100%; overflow:hidden; background:${theme.ink}; }
  #root { position:relative; overflow:hidden; isolation:isolate; container-type:size; background:${grounds[0]}; color:${theme.ink}; font-family:${theme.bodyStack}; }
  .clip { position:absolute; top:0; left:0; width:100%; height:100%; overflow:hidden; }
  .fk-cam { position:absolute; inset:0; will-change:transform; }
  .fk-drift { position:absolute; inset:0; will-change:transform; }
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
    chrome, caps,
    `</div>`,
    `<script>`, worldScript, `</script>`,
    `<script>`, script, `</script>`,
    `</body>`, `</html>`,
  ].join("\n");

  const metaJson = JSON.stringify({ compositionId: "vid", width: W, height: H, fps: (dims && dims.fps) || 30, duration: D });
  return { indexHtml, metaJson, resolvedBrand: theme.resolvedBrand };
}

// A `look` colour is a palette KEY or a literal hex the source inlined.
function col2(theme, s) {
  return (typeof s === "string" && s[0] === "#") ? s : (theme.c && theme.c[s]) || theme[s] || s;
}

// A build-time React.createElement that emits an SVG STRING. Each pack's `icon` is a small
// pure function of (theme, fg, R) — its own chrome mark — so it can be rendered once here
// rather than shipped to the browser. Same prop translation as the runtime shim.
const SVG_ATTR = {
  strokeWidth: "stroke-width", strokeLinecap: "stroke-linecap", strokeLinejoin: "stroke-linejoin",
  strokeDasharray: "stroke-dasharray", strokeDashoffset: "stroke-dashoffset", fillRule: "fill-rule",
  fillOpacity: "fill-opacity", strokeOpacity: "stroke-opacity", clipPath: "clip-path",
  textAnchor: "text-anchor", fontFamily: "font-family", fontSize: "font-size", fontWeight: "font-weight",
  letterSpacing: "letter-spacing", stopColor: "stop-color", stopOpacity: "stop-opacity",
  dominantBaseline: "dominant-baseline", vectorEffect: "vector-effect", viewBox: "viewBox",
  preserveAspectRatio: "preserveAspectRatio", gradientUnits: "gradientUnits",
};
const VOID_SVG = new Set(["path", "circle", "rect", "line", "ellipse", "polygon", "polyline", "stop", "use", "image"]);
function svgR(type, props, ...kids) {
  const tag = typeof type === "string" ? type : "g";
  const attrs = [];
  if (props) {
    for (const k of Object.keys(props)) {
      if (k === "key" || k === "children" || k === "ref") continue;
      const v = props[k];
      if (v == null || v === false) continue;
      attrs.push(`${SVG_ATTR[k] || k}="${esc(String(v))}"`);
    }
  }
  const flat = [];
  const push = (c) => {
    if (c == null || c === false || c === true) return;
    if (Array.isArray(c)) { c.forEach(push); return; }
    flat.push(typeof c === "object" && c.__svg ? c.__svg : esc(String(c)));
  };
  kids.forEach(push);
  if (props && props.children !== undefined) push(props.children);
  const inner = flat.join("");
  const open = `<${tag}${attrs.length ? " " + attrs.join(" ") : ""}>`;
  const out = (!inner && VOID_SVG.has(tag)) ? `<${tag}${attrs.length ? " " + attrs.join(" ") : ""}/>` : `${open}${inner}</${tag}>`;
  return { __svg: out };
}
svgR.Fragment = "g";
function renderIcon(skin, theme, fg) {
  if (typeof skin.icon !== "function") return "";
  try {
    const out = skin.icon({ ...theme.c, currentBg: fg, accent: theme.accent, ink: theme.ink, paper: theme.paper }, fg, svgR);
    return out && out.__svg ? out.__svg : "";
  } catch { return ""; }
}

module.exports = {
  build, BASE_STRINGS, PRESETS,
  X, V, F, RW, RH, clamp, clamp01, rgba, hexToRgb, relLum, ratio, reHue, hueOf,
  seedFrom, mulberry32, buildTheme,
  wordsOf, forcedLines, featureLines, pickNumber, pickStats, shortLabel, fitLines, fitPx, soloSize,
  shotOk, shotReserveOk, logoAssetOf, ratioOf, deviceFor, addressFrom, scrollPlan,
  fitFor, cropFocus, plate, wirePlate, backingPlate, frameHtml,
  archetypeFor, CAN_SHOW, SHOT_CAPACITY, capacityOf, MECHANIC_FOR, MECHANIC_NEEDS_NO_SHOT,
  setTypeScale(v) { TSCALE = v; },
  getTypeScale() { return TSCALE; },
};
