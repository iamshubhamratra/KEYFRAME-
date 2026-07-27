// PRISMA BLOC composer — a native GSAP + SVG/CSS "designed poster in motion".
// The pack `prisma-bloc` (manifest renderer:"dom-prisma") routes here from
// attemptLlmComposition, like the flagship / brightlife / blueprint / bloom / bauhaus /
// terminal / paper-tales / kinetic-universe composers.
//
// Ported from an imported design-doc template ("Prisma Bloc — KEYFRAME 9x16 Pack").
// The source shipped a fixed 10-scene, 45s demo reel with hardcoded copy; what is kept
// is the DESIGN — flat saturated colour fields that hard-cut, Archivo Black mega type
// crossing a travelling continuity seam, 4px-outlined sticker chips with hard offset
// shadows, a halftone dot rain and a grain plate — rebuilt as a fully data-driven
// composer over whatever storyboard, assets and brand the pipeline hands it.
//
// THREE ADAPTATIONS the port required (the source could not be used as-is):
//  1. NO CSS @keyframes. The source drove grain jitter, blob drift, marquee and sheen
//     from CSS animations — those run on the WALL CLOCK, which a frame-capturing
//     renderer cannot reproduce (two renders of one job would differ). Every ambient
//     layer here is a finite-repeat tween on the one seeked GSAP timeline.
//  2. NO fixed scene list. The source's 10 scenes / durations / caption strings / ground
//     colours / seam anchors were literal arrays. Here scenes come from the storyboard,
//     durations from the approved script's VO timings, captions from captionCues, and
//     the ground rotation / seam anchors / wipe edges are generated so ANY scene count
//     keeps the alternating-field rhythm.
//  3. NO hardcoded palette. The whole palette — INCLUDING the paper ground and the ink —
//     rotates onto the brand's lead hue with each colour pinned to its authored
//     luminance, so grounds, blocks, chips, outlines, seam, waveform, progress rule and
//     CTA all become the brand's at exactly the designed brightness.
//     Identity = luminance + motion + typography + layout; brand = hue.
//
// Engineering contract (identical to the other native composers): one paused GSAP
// timeline on window.__timelines["vid"]; direct-child .clip layers on unique tracks; a
// boundary opacity:0 hard-kill per scene; ONE seek-safe caption node (#cap-text) driven
// by a single onUpdate proxy; finite repeats; cqw units + container-type:size; hidden =
// inline opacity:0 only (never gsap.set); no Math.random / Date / rAF at runtime — a
// seeded PRNG picks the per-video variants at BUILD time, so re-renders are
// byte-identical. Every geometry number is resolved at build time (never measured from
// the DOM), so nothing depends on when an image happens to decode. Deterministic.

const { fontFaceCss, isBundled } = require("../fonts/pack_fonts");
const { isTrustedProminent, isLogo, categorize } = require("./asset_priority");
const { logoFilterCss } = require("./logo_render");
const { resolveBrand } = require("./brand_kit");
const { safeArea } = require("./responsive");

const GSAP_CDN = "https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js";
// The source named Caprasimo/Figtree (its own doc chrome, not the film) and Archivo
// Black / Space Grotesk / Inter / JetBrains Mono (the film). Only BUNDLED faces may be
// named: an unbundled family trips the `font_family_without_font_face` lint and silently
// collapses to the body stack. Archivo Black, Space Grotesk and JetBrains Mono are
// bundled; Inter is not, so it rides a system-ui stack exactly as the other packs do.
const DISPLAY = "Archivo Black";
const SUB = "Space Grotesk";
const MONO = "JetBrains Mono";
const BODY = "Inter";

// ---- helpers -----------------------------------------------------------------
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
const r = (n) => Math.round((Number(n) || 0) * 100) / 100;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

// The AUTHORED reference frame. Every measurement in this file is lifted from the source
// at 1080×1920 and expressed as a fraction of it, so the composition keeps its exact
// proportions at any output size instead of being re-guessed per aspect.
//   X() — anything with a WIDTH-like nature: sizes, gaps, borders, and every HEIGHT.
//         cqw is always definite, so a box never collapses the way a percentage height
//         inside an auto-height parent does.
//   V() — vertical POSITION only (top/bottom of a full-frame absolute layer).
const RW = 1080, RH = 1920;
const X = (px) => `${r((px / RW) * 100)}cqw`;
const V = (px) => `${r((px / RH) * 100)}%`;

// Type scale, keyed on the SHORT side (responsive.typeScale's law) so a landscape render
// does not blow the mega stack up. Portrait — the authored aspect — resolves to exactly
// 1, so 9:16 output is byte-identical to the authored design. Set once per build;
// buildComposition is fully synchronous, so this can never interleave between jobs.
let TSCALE = 1;
const F = (px) => X(px * TSCALE);

// finite yoyo repeat count for a `t`-second window at period `c` — never repeat:-1 (an
// infinite repeat makes the master's duration meaningless to a seeking renderer).
function reps(t, c) { return Math.max(0, Math.floor((Number(t) || 0) / (c || 1)) - 1); }
// a yoyo tween's `repeat` for a full out-and-back cycle count
const yoyoReps = (t, c) => reps(t, c) * 2 + 1;

// Deterministic PRNG (mulberry32) — BUILD-time only. It picks the per-video variants
// (wipe edge order, ground rotation offset, seam anchors) so two videos never share a
// rhythm while a re-render of the SAME job is byte-identical.
function seedFrom(str) {
  let h = 2166136261; const s = String(str || "prisma");
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

// ---- colour maths ------------------------------------------------------------
// reHue (the technique proven in blueprint / bloom / brightlife / bauhaus): rotate a
// colour onto `hue` while bisecting HSL lightness back to the SOURCE's relative
// luminance, so the recoloured value keeps its exact place in the pack's value ladder.
// Only HUE moves.
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
const LUM_PIN = 0.006;  // the true 8-bit quantization ceiling for fully-saturated hues
function reHue(hex, hue) {
  const [, s] = rgbToHsl(hexToRgb(hex));
  if (s < 0.02) return hex;                     // achromatic: nothing to rotate
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
// resolveBrand lays accents brand-first then pack, so the brand-led run ends at the first
// entry the pack already owned; [] means no brand applied.
function brandLedOf(brand, packAccents) {
  const pack = new Set(packAccents.map((a) => String(a).toLowerCase()));
  const out = [];
  for (const a of brand.accents) { if (pack.has(String(a).toLowerCase())) break; out.push(a); }
  return out;
}

// ---- theme -------------------------------------------------------------------
// The authored palette. a1..a4 are a deliberate 4-stop value ladder (mid / dark / bright
// / mid) whose SPACING is the pack's identity — under a brand skin all four, plus the
// paper ground and the ink, rotate by ONE shared delta onto the brand's lead hue, each
// pinned to its own authored luminance. So the ladder and the field spacing survive
// intact while every block, ground, chip, outline and shadow becomes the brand's.
//
// FAIL-OPEN (art_director.js:14): any resolver/reHue hiccup renders the authored palette,
// and a null skin returns the exact literals byte-for-byte with a null resolvedBrand —
// the honest "unbranded" the Brand panel shows.
const PAPER0 = "#FFF6EA";
const INK0 = "#12100E";
const A0 = ["#FF4D2E", "#1B4DFF", "#FFD23F", "#14C98E"];

function prismaTheme(brandSkin) {
  const fontFace = [DISPLAY, SUB, MONO].filter(isBundled).map(fontFaceCss).join("");
  let paper = PAPER0, ink = INK0, acc = A0.slice(), resolvedBrand = null;
  try {
    const brand = resolveBrand(brandSkin, { ground: PAPER0, isDark: false, packAccents: A0 });
    const led = brandLedOf(brand, A0);
    if (brand.applied && led.length) {
      // HUE-MAPPING, slot by slot. The brand's OWN accents take the pack's blocks in
      // order — the user's primary IS a1, their secondary IS a2 — each landing at the
      // pack's authored luminance for that slot, so the value ladder (mid / dark /
      // bright / mid) that the layout was drawn against survives untouched. Slots the
      // brand doesn't reach are carried from the last supplied hue by the pack's OWN
      // relative offset, which keeps the field spacing that stops two adjacent grounds
      // reading the same. A one-colour palette therefore still rotates the whole set.
      const packH = A0.map(hueOf);
      const brandH = led.map(hueOf);
      const last = brandH.length - 1;
      // Slots the brand doesn't reach CYCLE back through its own hues rather than
      // inventing a new one — a4 is used as a full-frame GROUND, and a derived hue there
      // paints a whole scene in a colour the user never chose. Cycling keeps every field
      // literally on-palette (the luminance ladder already keeps them distinguishable).
      // A ONE-colour palette is the exception: cycling would make the film monochrome, so
      // it falls back to rotating the pack's own spacing off that single hue.
      const hueFor = (i) => (i <= last ? brandH[i]
        : brandH.length >= 2 ? brandH[i % brandH.length]
          : brandH[0] + (packH[i] - packH[0]));
      const rot = (hex, i) => reHue(hex, ((hueFor(i) % 360) + 360) % 360);
      acc = A0.map(rot);
      // The paper is a warm near-white and the ink a near-black: rotating their HUE onto
      // the brand's LEAD at pinned luminance tints the whole field toward the brand
      // without touching the contrast the layout was drawn against. This is what makes
      // the pack read branded rather than "the same poster with different chips".
      paper = reHue(PAPER0, ((brandH[0] % 360) + 360) % 360);
      ink = reHue(INK0, ((brandH[0] % 360) + 360) % 360);
      resolvedBrand = {
        ...(brandSkin && typeof brandSkin === "object" ? brandSkin : {}),
        accents: acc.slice(0, 3), emphasis: brand.emphasis,
        adjusted: brand.adjusted, dropped: brand.dropped,
        tier: brand.tier, applied: true,
      };
    }
  } catch { paper = PAPER0; ink = INK0; acc = A0.slice(); resolvedBrand = null; }

  // Ink that actually READS on a given field. Every ground here is a full saturated
  // block, so this replaces the source's hardcoded `inkOn` array and stays correct for
  // any brand hue.
  const onField = (bg) => (ratio(ink, bg) >= ratio(paper, bg) ? ink : paper);
  // An accent used as TYPE on a field must clear 3:1 (large text); when it cannot, the
  // field's own ink takes over — so a headline line can never vanish into its ground.
  const typeOn = (hex, bg) => (ratio(hex, bg) >= 3 ? hex : onField(bg));

  return {
    paper, ink, a: acc, a1: acc[0], a2: acc[1], a3: acc[2], a4: acc[3],
    onField, typeOn,
    displayStack: `'${DISPLAY}', '${SUB}', system-ui, sans-serif`,
    subStack: `'${SUB}', system-ui, sans-serif`,
    monoStack: `'${MONO}', ui-monospace, monospace`,
    bodyStack: `'${BODY}', system-ui, sans-serif`,
    fontFace, resolvedBrand,
  };
}

// ---- fixed copy (localizable via the Localization Director) -------------------
const STRINGS = {
  packLabel: "Prisma Bloc",
  hookKicker: "Start here",
  problemKicker: "The bottleneck",
  showcaseKicker: "See it working",
  featuresKicker: "What you get",
  statsKicker: "By the numbers",
  voiceKicker: "In their words",
  galleryKicker: "Every angle",
  brandKicker: "Built around you",
  trustKicker: "Trusted by",
  ctaKicker: "Ready when you are",
  ctaButton: "Get started",
  ctaTagline: "One link away.",
  addressBar: "yourproduct.com",
  metric: "Metric",
  logoSlot: "Logo",
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

// Supporting lines for card decks — onScreenText first, then voiceover sentences, never
// repeating the headline or subtext.
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

// A card deck: {title, note} pairs. A line reading "Title — note" splits at the dash;
// otherwise the note is dropped rather than invented.
function deck(scene, n) {
  return featureLines(scene, n).map((line) => {
    const m = /^(.{2,34}?)\s*[—–:-]\s+(.{2,})$/.exec(line);
    return m ? { title: m[1].trim(), note: m[2].trim().slice(0, 54) } : { title: line.slice(0, 36), note: "" };
  });
}

// A unit suffix must not be allowed to eat the first letter of the next WORD: an
// unanchored /(%|x|k|m)?/ turned "3 minute setup" into the value "3m" with the label
// "inute setup". The lookahead forces the suffix to end the token.
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
        label: String(l).replace(m[0], "").trim().slice(0, 26) || S.metric,
      });
    }
    if (out.length >= max) break;
  }
  if (!out.length) {
    const n = pickNumber(scene);
    if (n) out.push({ ...n, label: String(scene.subtext || scene.headline || S.metric).slice(0, 26) });
  }
  return out.slice(0, max);
}

// ---- mega type fitting -------------------------------------------------------
// Archivo Black is a very wide face. MEASURED off real renders at the pack's -0.035em
// tracking, an uppercase letter advances ~0.84em and a space ~0.30em — a plain
// "characters × one constant" model is not good enough, because a line's width depends
// on how many of its characters are SPACES ("NORTHWIND" and "ANY LINK" are both 9
// characters and nowhere near the same width). Getting this wrong is not cosmetic: an
// early 0.60em guess let a 9-letter CTA wordmark bleed straight off the frame.
//
// Everything below is arithmetic off those two numbers, so the fit is derived, not fudged:
//   • wrap target = column / (baseSize × letter)  — how many characters a line may hold
//   • final size  = min(base, column / widest-line-advance)
// Column and size are both REFERENCE px converted through the same X() helper, so the fit
// holds identically at any output resolution. Animations key off ELEMENT COUNTS, never
// off text length, so dynamic copy cannot break the motion.
const MEGA_LETTER = 0.84, MEGA_SPACE = 0.30, MEGA_FILL = 0.97;
// CJK ideographs and Devanagari conjuncts advance wider than a Latin capital, and the
// video-text language is injected AFTER this composer runs (caption_render swaps the font
// at the writeIndexHtml choke point), so the fit must budget for them here or a localized
// headline overflows a column that measured fine in English.
const WIDE_SCRIPT = /[ऀ-ॿ؀-ۿ　-ヿ一-鿿가-힯]/;
const MEGA_WIDE = 1.05;
function advanceOf(s) {
  const per = WIDE_SCRIPT.test(String(s)) ? MEGA_WIDE : MEGA_LETTER;
  let a = 0;
  for (const ch of String(s)) a += ch === " " ? MEGA_SPACE : per;
  return a || 1;
}
function megaFit(text, basePx, maxLines, colPx) {
  const col = (colPx || 930) * MEGA_FILL;
  const words = wordsOf(String(text || "").toUpperCase());
  if (!words.length) return { lines: [], size: basePx };
  const target = Math.max(3, Math.floor(col / (basePx * MEGA_LETTER)));
  const lines = [];
  let cur = "";
  for (const word of words) {
    if (!cur) { cur = word; continue; }
    if ((cur + " " + word).length > target && lines.length < maxLines - 1) { lines.push(cur); cur = word; }
    else cur += " " + word;
  }
  if (cur) lines.push(cur);
  const kept = lines.slice(0, maxLines);
  const widest = kept.reduce((a, l) => Math.max(a, advanceOf(l)), 1);
  // min() only ever SHRINKS: a short headline keeps its authored size, a long one comes
  // down to exactly what the column holds. No floor is needed — even a single unbreakable
  // 30-letter word resolves to a size that fits.
  return { lines: kept, size: Math.min(basePx, col / widest) };
}
// Sub-display / body text shrinks on length the same way, so a long AI sentence never
// pushes a card past its box.
function fitPx(text, basePx, targetCh, floor = 0.58) {
  const len = String(text || "").length || 1;
  return basePx * clamp(targetCh / len, floor, 1);
}

// ---- asset gates -------------------------------------------------------------
// A SHOT is real imagery the film can showcase: not the logo, not a video, not a vector.
// Trust follows the shared tier law (uploads / the user's own site / curated / CD-approved
// stock), so nothing unverified reaches a hero slot.
function shotOk(a) {
  if (!a || !a.path) return false;
  if (isLogo(a)) return false;
  if (a.type === "video" || /\.(mp4|webm|mov)($|\?)/i.test(a.path)) return false;
  if (/\.svg($|\?)/i.test(a.path)) return false;
  if (a.__layoutDemoted) return false;
  return isTrustedProminent(a) || a.cdProminence === "hero" || a.cdProminence === "support";
}
// A MARK is logo-grade material for the trust wall: harvested/uploaded logos and clean
// recoloured vectors. These are the only assets shown small, on a plain plate.
function markOk(a) {
  if (!a || !a.path) return false;
  if (a.type === "video" || /\.(mp4|webm|mov)($|\?)/i.test(a.path)) return false;
  const cat = categorize(a);
  return cat === "logo" || cat === "icon" || /\.svg($|\?)/i.test(a.path);
}
const logoAssetOf = (assets) =>
  (Array.isArray(assets) ? assets : []).find((a) => a && a.path && isLogo(a) && !/\.(mp4|webm|mov)($|\?)/i.test(a.path)) || null;

const ratioOf = (a) => Number(a && a.ratio) || (a && a.width && a.height ? a.width / a.height : 0);
// Presentation is chosen from the asset's REAL pixels, never from the scene it landed on:
// a wide capture gets a browser, a tall one a phone, anything between an outlined card.
// This is the rule that stops a mobile screenshot being stretched into a laptop.
function deviceFor(a) {
  const q = ratioOf(a);
  if (!q) return "card";
  if (q >= 1.2) return "browser";
  // A TALL capture is genuinely ambiguous: a full-page DESKTOP screenshot (the pipeline
  // captures whole pages, so a 1440-wide site is routinely 3000px tall → ratio 0.48) and
  // a phone screen both land under 0.7. The real discriminator is the capture's own
  // pixel WIDTH — a desktop viewport is ≥1000px wide however far the page scrolls. Get
  // this wrong and a website screenshot is squeezed into a phone bezel.
  if (q <= 0.7) return (Number(a && a.width) || 0) >= 1000 ? "browser" : "phone";
  return "card";
}

// The host of the user's own site, for the browser mockup's address pill — so even the
// chrome furniture is real. Falls back to the localizable placeholder.
function addressFrom(assets, S) {
  for (const a of Array.isArray(assets) ? assets : []) {
    const u = a && a.sourceUrl;
    if (!u) continue;
    try { const h = new URL(String(u)).hostname.replace(/^www\./, ""); if (h) return h; } catch { /* not a URL */ }
  }
  return S.addressBar;
}

// ---- device frames -----------------------------------------------------------
// CONTAIN, never crop: a static capture sits on a tinted matte with object-fit:contain,
// so a tall dashboard letterboxes rather than losing its header. A capture TALLER than
// its window instead opts into the in-frame SCROLL — a still pasted into a mockup reads
// as a slide; a moving capture reads as a product demo.
//
// The scroll distance is resolved HERE, at build time, from the asset's own ratio and the
// slot's known geometry — never measured from the DOM, which would depend on whether the
// image had decoded by the time the timeline was built.
//   frac = (naturalHeight - windowHeight) / naturalHeight
// and the tween runs `yPercent: -frac*100` on the plate, which is relative to the plate's
// OWN height — so the travel is exact at any output resolution.
const SCROLL_MIN = 0.03;
function scrollPlan(boxW, boxH, asset) {
  const q = ratioOf(asset);
  // With no asset the wireframe plate is AUTHORED tall (1.75× the window) so a
  // prompt-only job still gets the live-demo scroll instead of a static block.
  const natH = asset && asset.path ? (q ? boxW / q : 0) : boxH * 1.75;
  if (!natH || natH <= boxH) return { natH: 0, frac: 0 };
  const frac = (natH - boxH) / natH;
  return frac < SCROLL_MIN ? { natH: 0, frac: 0 } : { natH, frac };
}

// The plate that lives inside a device window: either the scrolling full-width capture
// (natural height, panned by the timeline) or a static contained fit.
function plate(theme, { asset, scrollId, natH, tint }) {
  if (asset && asset.path) {
    return scrollId && natH
      ? `<div id="${scrollId}" style="position:absolute;left:0;right:0;top:0;height:${X(natH)};"><img src="${esc(asset.path)}" alt="${esc(asset.alt || "")}" style="width:100%;height:100%;object-fit:cover;object-position:top center;display:block;"></div>`
      : `<img src="${esc(asset.path)}" alt="${esc(asset.alt || "")}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;object-position:center;display:block;">`;
  }
  // Generated wireframe plate — the zero-asset path, built only from pack blocks so it
  // reads as authored. Never shown when a real capture exists.
  const inner = wirePlate(theme, tint);
  return scrollId && natH
    ? `<div id="${scrollId}" style="position:absolute;left:0;right:0;top:0;height:${X(natH)};">${inner}</div>`
    : `<div style="position:absolute;inset:0;">${inner}</div>`;
}

function wirePlate(theme, tint) {
  const bar = (w, o) => `<div style="height:${X(30)};width:${w};border-radius:999px;background:${rgba(theme.ink, o)};flex:none;"></div>`;
  return `<div style="position:absolute;inset:0;padding:${X(34)} ${X(38)};box-sizing:border-box;display:flex;flex-direction:column;gap:${X(24)};background:${theme.paper};">
    <div style="display:flex;align-items:center;gap:${X(18)};flex:none;">
      <div style="width:${X(56)};height:${X(56)};border-radius:${X(16)};background:${theme.a1};flex:none;"></div>
      ${bar("38%", 0.16)}
      <div style="width:${X(130)};height:${X(38)};border-radius:999px;background:${theme.a2};flex:none;margin-left:auto;"></div>
    </div>
    <div style="height:${X(260)};border-radius:${X(24)};background:${tint || theme.a4};flex:none;"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:${X(18)};height:${X(170)};flex:none;">
      <div style="border-radius:${X(20)};background:${rgba(theme.ink, 0.09)};"></div>
      <div style="border-radius:${X(20)};background:${theme.a3};"></div>
      <div style="border-radius:${X(20)};background:${rgba(theme.ink, 0.09)};"></div>
    </div>
    ${bar("70%", 0.14)}${bar("52%", 0.14)}
    <div style="height:${X(290)};border-radius:${X(24)};background:${theme.a1};flex:none;"></div>
    ${bar("60%", 0.14)}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:${X(20)};height:${X(200)};flex:none;">
      <div style="border-radius:${X(20)};background:${theme.a3};"></div>
      <div style="border-radius:${X(20)};background:${rgba(theme.ink, 0.09)};"></div>
    </div>
  </div>`;
}

// A device frame in the pack's language: 4–5px ink outline + hard offset shadow. `boxW`
// and `boxH` are the WINDOW's interior in reference px, so the scroll plan and the CSS
// agree by construction.
function frameHtml(theme, { device, asset, boxW, boxH, tint, scrollId, address, natH }) {
  const t = tint || theme.a3;
  if (device === "phone") {
    return `<div style="width:100%;height:100%;border-radius:${X(64)};border:${X(5)} solid ${theme.ink};background:${theme.ink};padding:${X(20)};box-sizing:border-box;box-shadow:${X(14)} ${X(16)} 0 ${rgba(theme.ink, 0.5)};position:relative;overflow:hidden;">
      <div style="position:absolute;left:0;right:0;top:${X(30)};display:flex;justify-content:center;z-index:2;"><div style="width:${X(130)};height:${X(14)};border-radius:999px;background:${rgba(theme.paper, 0.35)};"></div></div>
      <div style="position:absolute;inset:${X(25)};border-radius:${X(46)};background:${rgba(t, 0.2)};overflow:hidden;">
        ${plate(theme, { asset, scrollId, natH, tint: t })}
      </div>
    </div>`;
  }
  if (device === "browser") {
    return `<div style="width:100%;border-radius:${X(34)};border:${X(5)} solid ${theme.ink};background:${theme.paper};box-shadow:${X(14)} ${X(16)} 0 ${theme.ink};overflow:hidden;">
      <div style="display:flex;align-items:center;gap:${X(16)};padding:${X(22)} ${X(28)};border-bottom:${X(4)} solid ${theme.ink};background:${t};">
        <div style="display:flex;gap:${X(12)};flex:none;">
          <div style="width:${X(22)};height:${X(22)};border-radius:50%;background:${theme.ink};"></div>
          <div style="width:${X(22)};height:${X(22)};border-radius:50%;background:${theme.ink};opacity:.45;"></div>
          <div style="width:${X(22)};height:${X(22)};border-radius:50%;background:${theme.ink};opacity:.25;"></div>
        </div>
        <div style="flex:1;min-width:0;background:${theme.paper};border:${X(3)} solid ${theme.ink};border-radius:999px;padding:${X(9)} ${X(20)};font-family:${theme.monoStack};font-size:${F(20)};letter-spacing:.1em;text-transform:uppercase;color:${rgba(theme.ink, 0.7)};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(address || "")}</div>
      </div>
      <div style="position:relative;height:${X(boxH)};overflow:hidden;background:${rgba(t, 0.14)};">
        ${plate(theme, { asset, scrollId, natH, tint: t })}
      </div>
    </div>`;
  }
  // card — the neutral middle: an outlined plate with the pack's hard shadow.
  return `<div style="width:100%;height:100%;border-radius:${X(34)};border:${X(5)} solid ${theme.ink};background:${rgba(t, 0.2)};box-shadow:${X(14)} ${X(16)} 0 ${theme.ink};overflow:hidden;position:relative;">
    ${plate(theme, { asset, tint: t })}
  </div>`;
}

// ---- shared fragments --------------------------------------------------------
const kicker = (theme, text, color, align) =>
  `<div data-in="up" style="font-family:${theme.monoStack};font-size:${F(26)};font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:${color};text-align:${align || "left"};">${esc(text)}</div>`;

// The mega stack: one masked line per row, the last row taking an accent. Colours are
// pre-checked against the scene's ground so a line can never sink into its field.
// Takes a megaFit() result, so the wrap and the size are always decided together.
function megaStack(theme, fit, { ground, accent, align }) {
  const { lines, size } = fit;
  const acc = theme.typeOn(accent, ground);
  const ink = theme.onField(ground);
  return lines.map((l, i) => {
    const col = (i === lines.length - 1 && lines.length > 1) ? acc : ink;
    return `<div data-in="mask" style="font-family:${theme.displayStack};font-size:${F(size)};line-height:.86;letter-spacing:-.035em;text-transform:uppercase;color:${col};text-align:${align || "left"};">${esc(l)}</div>`;
  }).join("");
}

const chipHtml = (theme, text, bg, sizePx) =>
  `<span class="kf-chip" data-in="pop" style="background:${bg};color:${theme.onField(bg)};font-size:${F(sizePx || 30)};">${esc(text)}</span>`;

// ---- archetypes --------------------------------------------------------------
// The source's ten fixed acts become ten SCENE TYPES the storyboard is mapped onto. Base
// type comes from scene semantics; a scene that receives real imagery is then upgraded to
// the presentation that suits how MANY shots it got (see buildComposition).
function archetypeFor(scene, i, total) {
  const k = String(scene.kind || "").toLowerCase();
  const p = String(scene.purpose || "").toLowerCase();
  if (i === 0 || k === "hook" || k === "title" || /hook|intro|open/.test(p)) return "hook";
  if (i === total - 1 || k === "cta" || /cta|close|outro|sign\s*up|subscribe|download|get\s*started/.test(p)) return "cta";
  if (k === "quote" || /quote|testimonial|manifesto/.test(p)) return "voice";
  if (k === "stat" || k === "chart" || k === "countdown" || (pickNumber(scene) && /proof|result|metric|stat|number|data/.test(p + k))) return "stats";
  if (/brand|palette|style|identity/.test(p + k)) return "swatch";
  if (/problem|pain|comparison|before/.test(p)) return "cards";
  if (bullets(scene, 4).length >= 3 || /feature|benefit|inside/.test(p)) return "grid";
  if (/how|process|step|workflow/.test(p)) return "cards";
  return "statement";
}
// Which types can actually put a screenshot on screen. A shot must NEVER be stranded on a
// scene that shows no imagery (the bug that once left every capture unrendered), so
// distribution only ever targets these.
const CAN_SHOW = new Set(["statement", "grid", "cards", "showcase", "gallery", "swatch"]);

// ---- scene builders ((scene, ctx, sceneAssets, logo) -> {html, scroll?}) ------
// Every builder returns markup whose RESTING state is the finished frame; the `data-in`
// "from" values exist only while a tween runs, so a stalled ticker can never capture a
// blank scene. Entrance tweens are emitted generically by enterScript() below.

const open = (ctx) =>
  `<div class="clip kf-sc" id="${ctx.id}" data-start="${ctx.T}" data-duration="${r(ctx.L)}" data-track-index="${ctx.track}" style="opacity:0;">` +
  `<div class="kf-cam" id="${ctx.id}-cam">`;
const close = () => `</div></div>`;

// HOOK — the opener: a mono kicker, a 3–4 line mega stack, intake chips, a drawn rule.
// Flush-left, tall type. Takes the user's logo as a small mark when one exists.
function bHook(scene, ctx, _assets, logo) {
  const { theme, S, ground } = ctx;
  const ink = theme.onField(ground);
  const mega = megaFit(scene.headline || scene.title || ctx.title, 172, 5, 930);
  const chips = bullets(scene, 3);
  const palette = [theme.a3, theme.paper, theme.a4];
  const mark = logo && logo.path
    ? `<img data-in="pop" src="${esc(logo.path)}" alt="${esc(logo.alt || "logo")}" style="${logoFilterCss(logo, ground)}height:${X(70)};width:auto;max-width:${X(300)};object-fit:contain;object-position:left center;display:block;margin-bottom:${X(24)};">`
    : "";
  const html = `${open(ctx)}
    <div style="position:absolute;left:${X(80)};right:${X(80)};top:${V(196)};">
      ${mark}${kicker(theme, scene.kicker || S.hookKicker, theme.typeOn(theme.a1, ground))}
    </div>
    <div style="position:absolute;left:${X(80)};right:${X(70)};top:${V(430)};">
      ${megaStack(theme, mega, { ground, accent: theme.a2, align: "left" })}
    </div>
    ${chips.length ? `<div style="position:absolute;left:${X(80)};right:${X(80)};top:${V(1150)};display:flex;gap:${X(18)};flex-wrap:wrap;">
      ${chips.map((c, i) => chipHtml(theme, c, palette[i % palette.length])).join("")}
    </div>` : ""}
    <div data-in="draw" style="position:absolute;left:${X(80)};right:${X(80)};top:${V(1330)};height:${X(14)};background:${ink};transform-origin:left center;"></div>
  ${close()}`;
  return { html };
}

// CARDS — three outlined rows, each a colour square + title + note, then a mega statement
// beneath. The problem / how-it-works beat. Rows carry a real thumbnail when the scene
// received imagery, so the deck doubles as feature proof.
function bCards(scene, ctx, sceneAssets) {
  const { theme, S, ground } = ctx;
  const rows = deck(scene, 3);
  const items = rows.length ? rows : bullets(scene, 3).map((t) => ({ title: t, note: "" }));
  const cols = [theme.a1, theme.a3, theme.a4];
  const mega = megaFit(scene.emphasis || scene.subtext || scene.headline || "", 126, 3, 910);
  const html = `${open(ctx)}
    <div style="position:absolute;left:${X(80)};right:${X(80)};top:${V(196)};">${kicker(theme, scene.kicker || S.problemKicker, theme.typeOn(theme.a3, ground), "right")}</div>
    <div style="position:absolute;left:${X(80)};right:${X(80)};top:${V(300)};display:flex;flex-direction:column;gap:${X(26)};">
      ${items.map((it, i) => {
        const shot = sceneAssets && sceneAssets[i];
        const badge = shot && shot.path
          ? `<div style="width:${X(96)};height:${X(96)};border-radius:${X(18)};overflow:hidden;flex:none;border:${X(4)} solid ${theme.ink};background:${rgba(cols[i % 3], 0.3)};"><img src="${esc(shot.path)}" alt="${esc(shot.alt || "")}" style="width:100%;height:100%;object-fit:cover;display:block;"></div>`
          : `<div style="width:${X(74)};height:${X(74)};border-radius:${X(18)};background:${cols[i % 3]};flex:none;"></div>`;
        return `<div class="kf-card" data-in="slide" style="background:${theme.paper};padding:${X(34)} ${X(40)};display:flex;align-items:center;gap:${X(28)};">
          ${badge}
          <div style="min-width:0;">
            <div style="font-family:${theme.subStack};font-weight:700;font-size:${F(fitPx(it.title, 46, 26))};line-height:1.06;letter-spacing:-.02em;color:${theme.ink};">${esc(it.title)}</div>
            ${it.note ? `<div style="font-family:${theme.bodyStack};font-weight:500;font-size:${F(28)};line-height:1.3;color:${rgba(theme.ink, 0.58)};margin-top:${X(8)};">${esc(it.note)}</div>` : ""}
          </div>
        </div>`;
      }).join("")}
    </div>
    ${mega.lines.length ? `<div style="position:absolute;left:${X(80)};right:${X(90)};top:${V(1120)};">
      ${megaStack(theme, mega, { ground, accent: theme.paper, align: "left" })}
    </div>` : ""}
  ${close()}`;
  return { html };
}

// SHOWCASE — one hero capture in its aspect-routed device frame, the capture SCROLLING
// inside its window, with the headline and support chips. The product moment. Portrait
// captures sit right with the type in a left column; wide captures sit centred with the
// type beneath — two distinct compositions from one builder, chosen by the asset.
const SHOW_BROWSER = { left: 150, right: 80, top: 250, boxH: 660 };
const SHOW_PHONE = { right: 80, top: 620, w: 470, h: 940 };
function bShowcase(scene, ctx, sceneAssets) {
  const { theme, S, ground, address } = ctx;
  const asset = (sceneAssets && sceneAssets[0]) || null;
  const second = (sceneAssets && sceneAssets[1]) || null;
  // With no asset this scene is the ZERO-ASSET showcase: a browser mockup holding the
  // generated wireframe plate, which scrolls exactly like a real capture would. A
  // prompt-only job therefore still gets the pack's signature product moment instead of
  // an all-typography film.
  const device = asset ? deviceFor(asset) : "browser";
  const isPhone = device === "phone";
  const scrollId = `${ctx.id}-scroll`;
  const chips = bullets(scene, 2);
  const megaPhone = megaFit(scene.headline || scene.title || "", 118, 3, 520);
  const megaWide = megaFit(scene.headline || scene.title || "", 132, 3, 910);

  let hero, plan = { frac: 0, natH: 0 };
  if (isPhone) {
    // interior = wrapper − (border 5 + padding 20) × 2 on each axis
    const boxW = SHOW_PHONE.w - 50, boxH = SHOW_PHONE.h - 50;
    plan = scrollPlan(boxW, boxH, asset);
    hero = `<div data-in="pop" style="position:absolute;right:${X(SHOW_PHONE.right)};top:${V(SHOW_PHONE.top)};width:${X(SHOW_PHONE.w)};height:${X(SHOW_PHONE.h)};">
      ${frameHtml(theme, { device, asset, boxW, boxH, tint: theme.a3, scrollId: plan.frac ? scrollId : null, natH: plan.natH })}
    </div>`;
  } else {
    const boxW = RW - SHOW_BROWSER.left - SHOW_BROWSER.right - 10;
    plan = scrollPlan(boxW, SHOW_BROWSER.boxH, asset);
    hero = `<div data-in="pop" style="position:absolute;left:${X(SHOW_BROWSER.left)};right:${X(SHOW_BROWSER.right)};top:${V(SHOW_BROWSER.top)};">
      ${frameHtml(theme, { device: "browser", asset, boxW, boxH: SHOW_BROWSER.boxH, tint: theme.a3, scrollId: plan.frac ? scrollId : null, natH: plan.natH, address })}
    </div>`;
  }
  // A decorative block carries the off-edge energy; the ASSET container never does.
  const bleed = `<div data-in="pop" style="position:absolute;left:${X(520)};right:${X(-140)};top:${V(170)};height:${X(220)};border-radius:${X(40)} 0 0 ${X(40)};background:${theme.a4};border:${X(5)} solid ${theme.ink};border-right:none;"></div>`;
  const side = isPhone && second
    ? `<div data-in="pop" style="position:absolute;left:${X(80)};top:${V(1180)};width:${X(370)};height:${X(280)};">${frameHtml(theme, { device: "card", asset: second, tint: theme.a1 })}</div>`
    : "";

  const html = `${open(ctx)}
    ${isPhone ? "" : bleed}
    <div style="position:absolute;left:${X(80)};right:${X(80)};top:${V(isPhone ? 196 : 150)};">${kicker(theme, scene.kicker || S.showcaseKicker, theme.typeOn(theme.a2, ground))}</div>
    ${isPhone ? `<div style="position:absolute;left:${X(80)};width:${X(520)};top:${V(286)};">${megaStack(theme, megaPhone, { ground, accent: theme.a1, align: "left" })}</div>` : ""}
    ${hero}${side}
    ${isPhone ? "" : `<div style="position:absolute;left:${X(80)};right:${X(90)};top:${V(1090)};">${megaStack(theme, megaWide, { ground, accent: theme.a1, align: "left" })}</div>`}
    ${chips.length && !isPhone ? `<div style="position:absolute;left:${X(80)};right:${X(80)};top:${V(1520)};display:flex;gap:${X(16)};flex-wrap:wrap;">
      ${chips.map((c, i) => chipHtml(theme, c, i % 2 ? theme.paper : theme.a4, 26)).join("")}
    </div>` : ""}
  ${close()}`;
  return { html, scroll: plan.frac ? { id: scrollId, frac: plan.frac, kind: isPhone ? "phone" : "web" } : null };
}

// GALLERY — a row of aspect-true frames (the source's formats scene, repurposed): 2–3
// captures side by side AT THEIR OWN RATIOS, each labelled. Widths are budgeted so the
// row always fits the safe column even under the camera push; ratios stay exact.
function bGallery(scene, ctx, sceneAssets) {
  const { theme, S, ground } = ctx;
  const shots = (sceneAssets || []).slice(0, 3);
  const mega = megaFit(scene.headline || scene.title || "", 126, 2, 910);
  const GAP = 20, SAFE = RW - 160;
  const budget = SAFE - GAP * Math.max(0, shots.length - 1);
  const qs = shots.map((a) => clamp(ratioOf(a) || 1, 0.5, 1.9));
  const totalQ = qs.reduce((x, q) => x + q, 0) || 1;
  const cells = shots.map((a, i) => {
    const w = (budget * qs[i]) / totalQ;
    const h = clamp(w / qs[i], 180, 700);
    return { a, w, h, tint: [theme.a3, theme.a4, theme.paper][i % 3], label: String(a.alt || "").slice(0, 20) };
  });
  const html = `${open(ctx)}
    <div style="position:absolute;left:${X(80)};right:${X(80)};top:${V(170)};">${kicker(theme, scene.kicker || S.galleryKicker, theme.typeOn(theme.a2, ground))}</div>
    <div style="position:absolute;left:${X(80)};right:${X(90)};top:${V(250)};">${megaStack(theme, mega, { ground, accent: theme.a1, align: "left" })}</div>
    <div style="position:absolute;left:${X(80)};right:${X(80)};top:${V(780)};display:flex;align-items:flex-end;justify-content:center;gap:${X(GAP)};">
      ${cells.map((c) => `<div data-in="pop" style="flex:none;width:${X(c.w)};">
        <div style="width:100%;height:${X(c.h)};">${frameHtml(theme, { device: "card", asset: c.a, tint: c.tint })}</div>
        ${c.label ? `<div style="font-family:${theme.monoStack};font-size:${F(22)};letter-spacing:.14em;text-transform:uppercase;color:${rgba(theme.onField(ground), 0.6)};margin-top:${X(16)};text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(c.label)}</div>` : ""}
      </div>`).join("")}
    </div>
    ${scene.subtext ? `<div data-in="up" style="position:absolute;left:${X(80)};right:${X(80)};top:${V(1400)};font-family:${theme.bodyStack};font-weight:500;font-size:${F(fitPx(scene.subtext, 38, 120))};line-height:1.45;color:${rgba(theme.onField(ground), 0.74)};">${esc(scene.subtext)}</div>` : ""}
  ${close()}`;
  return { html };
}

// GRID — the 2×2 outlined card deck. Text mode gives each card a colour-block glyph;
// image mode fills the block with a real capture. The features beat.
function bGrid(scene, ctx, sceneAssets) {
  const { theme, S, ground } = ctx;
  const items = deck(scene, 4);
  const cells = (items.length ? items : bullets(scene, 4).map((t) => ({ title: t, note: "" }))).slice(0, 4);
  const bgs = [theme.a3, theme.paper, theme.paper, theme.a2];
  const glyphs = [theme.ink, theme.a1, theme.a4, theme.paper];
  const mega = megaFit(scene.headline || scene.title || "", 136, 2, 920);
  // A 2×2 grid holding one or two cards reads as a half-empty page. Below three cells the
  // deck goes SINGLE COLUMN — full-width cards with a taller art strip — so the same
  // builder fills the frame whether the script gave it two bullets or four.
  const oneCol = cells.length <= 2;
  const artH = oneCol ? 240 : 150;
  const html = `${open(ctx)}
    <div style="position:absolute;left:${X(80)};right:${X(80)};top:${V(196)};">${kicker(theme, scene.kicker || S.featuresKicker, theme.typeOn(theme.a2, ground), "center")}</div>
    <div style="position:absolute;left:${X(80)};right:${X(80)};top:${V(290)};">${megaStack(theme, mega, { ground, accent: theme.a1, align: "center" })}</div>
    <div style="position:absolute;left:${X(80)};right:${X(80)};top:${V(oneCol ? 700 : 660)};display:grid;grid-template-columns:${oneCol ? "1fr" : "1fr 1fr"};gap:${X(26)};">
      ${cells.map((c, i) => {
        const bg = bgs[i % 4], fg = theme.onField(bg);
        const shot = sceneAssets && sceneAssets[i];
        const art = shot && shot.path
          ? `<div style="width:100%;height:${X(artH)};border-radius:${X(18)};overflow:hidden;border:${X(4)} solid ${theme.ink};background:${rgba(glyphs[i % 4], 0.24)};"><img src="${esc(shot.path)}" alt="${esc(shot.alt || "")}" style="width:100%;height:100%;object-fit:cover;display:block;"></div>`
          : `<div style="width:${X(88)};height:${X(88)};border-radius:${i % 2 ? "50%" : X(22)};background:${glyphs[i % 4]};"></div>`;
        return `<div class="kf-card" data-in="pop" style="background:${bg};padding:${X(40)} ${X(34)};">
          ${art}
          <div style="font-family:${theme.subStack};font-weight:700;font-size:${F(fitPx(c.title, 50, 18))};line-height:1.04;letter-spacing:-.02em;color:${fg};margin-top:${X(24)};">${esc(c.title)}</div>
          ${c.note ? `<div style="font-family:${theme.bodyStack};font-weight:500;font-size:${F(27)};line-height:1.35;color:${rgba(fg, 0.68)};margin-top:${X(10)};">${esc(c.note)}</div>` : ""}
        </div>`;
      }).join("")}
    </div>
  ${close()}`;
  return { html };
}

// STATS — count-up numerals in outlined plates under a mega headline. The proof beat.
function bStats(scene, ctx) {
  const { theme, S, ground } = ctx;
  const stats = pickStats(scene, 3, S);
  const mega = megaFit(scene.headline || scene.title || "", 126, 3, 910);
  const cols = [theme.a1, theme.paper, theme.paper];
  const html = `${open(ctx)}
    <div style="position:absolute;left:${X(80)};right:${X(80)};top:${V(196)};">${kicker(theme, scene.kicker || S.statsKicker, theme.typeOn(theme.a2, ground))}</div>
    <div style="position:absolute;left:${X(80)};right:${X(90)};top:${V(280)};">${megaStack(theme, mega, { ground, accent: theme.a2, align: "left" })}</div>
    ${stats.length ? `<div style="position:absolute;left:${X(80)};right:${X(80)};top:${V(900)};display:flex;flex-direction:column;gap:${X(24)};">
      ${stats.map((st, i) => {
        const bg = cols[i % 3], fg = theme.onField(bg);
        return `<div class="kf-card" data-in="slide" style="background:${bg};padding:${X(28)} ${X(38)};display:flex;align-items:baseline;gap:${X(24)};">
          <div style="font-family:${theme.displayStack};font-size:${F(92)};line-height:.9;letter-spacing:-.03em;color:${fg};flex:none;">${esc(st.pre)}<span data-count="${st.target}" data-suffix="${esc(st.suf)}">${st.target}${esc(st.suf)}</span></div>
          <div style="font-family:${theme.monoStack};font-size:${F(26)};letter-spacing:.14em;text-transform:uppercase;color:${rgba(fg, 0.66)};min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(st.label)}</div>
        </div>`;
      }).join("")}
    </div>` : ""}
  ${close()}`;
  return { html };
}

// VOICE — the film's only right-aligned composition: a mega quote, a breathing waveform
// and an attribution card. Text-safe (needs no imagery at all).
const WAVE = [22, 54, 88, 40, 100, 62, 30, 76, 46, 92, 34, 68, 24, 82, 44];
function bVoice(scene, ctx) {
  const { theme, S, ground } = ctx;
  const mega = megaFit(scene.headline || scene.title || "", 116, 3, 920);
  const attribution = (bullets(scene, 1)[0] || scene.subtext || "").slice(0, 58);
  const html = `${open(ctx)}
    <div style="position:absolute;left:${X(80)};right:${X(80)};top:${V(196)};">${kicker(theme, scene.kicker || S.voiceKicker, theme.typeOn(theme.a1, ground), "right")}</div>
    <div style="position:absolute;left:${X(80)};right:${X(80)};top:${V(280)};">${megaStack(theme, mega, { ground, accent: theme.a2, align: "right" })}</div>
    <div id="${ctx.id}-wave" style="position:absolute;left:${X(80)};right:${X(80)};top:${V(880)};height:${X(260)};display:flex;align-items:center;justify-content:space-between;gap:${X(8)};">
      ${WAVE.map((h, i) => `<div data-in="bar" style="flex:1;height:${h}%;border-radius:999px;background:${i % 3 === 2 ? theme.a1 : theme.a2};transform-origin:center center;"></div>`).join("")}
    </div>
    ${attribution ? `<div class="kf-card" data-in="pop" style="position:absolute;left:${X(80)};right:${X(80)};top:${V(1250)};padding:${X(32)} ${X(40)};background:${theme.paper};display:flex;align-items:center;gap:${X(26)};">
      <div style="width:${X(74)};height:${X(74)};border-radius:50%;background:${theme.a1};flex:none;"></div>
      <div style="font-family:${theme.subStack};font-weight:700;font-size:${F(fitPx(attribution, 44, 30))};line-height:1.1;color:${theme.ink};min-width:0;">${esc(attribution)}</div>
    </div>` : ""}
  ${close()}`;
  return { html };
}

// SWATCH — a full-bleed colour column against a right-hand text block: the brand beat,
// and the one scene that SHOWS the palette the film is wearing. With imagery assigned,
// the column's tiles become real crops instead of flat blocks.
function bSwatch(scene, ctx, sceneAssets) {
  const { theme, S, ground } = ctx;
  const tiles = [theme.a1, theme.a3, theme.a4, theme.paper];
  const mega = megaFit(scene.headline || scene.title || "", 104, 3, 580);
  const chips = bullets(scene, 3);
  const chipCols = [theme.paper, theme.a1, theme.a4];
  const html = `${open(ctx)}
    <div style="position:absolute;left:${X(-60)};top:${V(150)};width:${X(420)};display:flex;flex-direction:column;gap:${X(24)};">
      ${tiles.map((c, i) => {
        const shot = sceneAssets && sceneAssets[i];
        const inner = shot && shot.path
          ? `<img src="${esc(shot.path)}" alt="${esc(shot.alt || "")}" style="width:100%;height:100%;object-fit:cover;display:block;">`
          : "";
        return `<div data-in="pop" style="height:${X(290)};border-radius:0 ${X(40)} ${X(40)} 0;background:${c};border:${X(5)} solid ${theme.paper};border-left:none;overflow:hidden;flex:none;">${inner}</div>`;
      }).join("")}
    </div>
    <div style="position:absolute;left:${X(430)};right:${X(70)};top:${V(170)};">${kicker(theme, scene.kicker || S.brandKicker, theme.typeOn(theme.a3, ground))}</div>
    <div style="position:absolute;left:${X(430)};right:${X(70)};top:${V(250)};">${megaStack(theme, mega, { ground, accent: theme.paper, align: "left" })}</div>
    ${scene.subtext ? `<div data-in="up" style="position:absolute;left:${X(430)};right:${X(70)};top:${V(780)};font-family:${theme.bodyStack};font-weight:500;font-size:${F(fitPx(scene.subtext, 36, 150))};line-height:1.45;color:${rgba(theme.onField(ground), 0.9)};">${esc(scene.subtext)}</div>` : ""}
    ${chips.length ? `<div style="position:absolute;left:${X(430)};right:${X(70)};top:${V(1200)};display:flex;flex-wrap:wrap;gap:${X(16)};">
      ${chips.map((c, i) => chipHtml(theme, c, chipCols[i % 3], 26)).join("")}
    </div>` : ""}
  ${close()}`;
  return { html };
}

// LOGOS — the trust wall: a grid of logo/vector marks on outlined plates with the type
// anchored bottom-right and a rule drawing right→left. Only used when real marks exist.
function bLogos(scene, ctx, marks) {
  const { theme, S, ground } = ctx;
  const cells = (marks || []).slice(0, 6);
  const mega = megaFit(scene.headline || scene.title || "", 118, 2, 920);
  const ink = theme.onField(ground);
  const html = `${open(ctx)}
    <div style="position:absolute;left:${X(80)};right:${X(80)};top:${V(200)};display:grid;grid-template-columns:1fr 1fr;gap:${X(24)};">
      ${cells.map((m, i) => `<div class="kf-card" data-in="pop" style="height:${X(150)};background:${i % 5 === 2 ? theme.a4 : i % 5 === 4 ? theme.a3 : theme.paper};display:flex;align-items:center;justify-content:center;padding:${X(20)};">
        <img src="${esc(m.path)}" alt="${esc(m.alt || S.logoSlot)}" style="max-width:78%;max-height:68%;object-fit:contain;display:block;">
      </div>`).join("")}
    </div>
    <div style="position:absolute;left:${X(80)};right:${X(80)};top:${V(1130)};">${kicker(theme, scene.kicker || S.trustKicker, theme.typeOn(theme.a2, ground), "right")}</div>
    <div style="position:absolute;left:${X(80)};right:${X(80)};top:${V(1210)};">${megaStack(theme, mega, { ground, accent: theme.a1, align: "right" })}</div>
    <div data-in="draw" style="position:absolute;left:${X(400)};right:${X(80)};top:${V(1520)};height:${X(14)};background:${ink};transform-origin:right center;"></div>
  ${close()}`;
  return { html };
}

// STATEMENT — the dynamic default: a left mega line with chips or a supporting sentence.
// Carries a single capture in an aspect-routed frame when one was assigned to it.
const STMT = { browserBoxH: 520, phoneW: 420, phoneH: 780 };
function bStatement(scene, ctx, sceneAssets) {
  const { theme, S, ground, address } = ctx;
  const asset = (sceneAssets && sceneAssets[0]) || null;
  const mega = megaFit(scene.headline || scene.title || "", asset ? 128 : 156, asset ? 3 : 5, 930);
  const chips = bullets(scene, 3);
  const chipCols = [theme.a3, theme.paper, theme.a4];
  const device = asset ? deviceFor(asset) : null;
  const scrollId = `${ctx.id}-scroll`;
  let frame = "", plan = { frac: 0, natH: 0 };
  if (asset) {
    if (device === "phone") {
      const boxW = STMT.phoneW - 50, boxH = STMT.phoneH - 50;
      plan = scrollPlan(boxW, boxH, asset);
      frame = `<div data-in="pop" style="position:absolute;left:50%;margin-left:${X(-STMT.phoneW / 2)};top:${V(860)};width:${X(STMT.phoneW)};height:${X(STMT.phoneH)};">
        ${frameHtml(theme, { device, asset, boxW, boxH, tint: theme.a3, scrollId: plan.frac ? scrollId : null, natH: plan.natH })}
      </div>`;
    } else if (device === "browser") {
      const boxW = RW - 160 - 10;
      plan = scrollPlan(boxW, STMT.browserBoxH, asset);
      frame = `<div data-in="pop" style="position:absolute;left:${X(80)};right:${X(80)};top:${V(900)};">
        ${frameHtml(theme, { device, asset, boxW, boxH: STMT.browserBoxH, tint: theme.a3, scrollId: plan.frac ? scrollId : null, natH: plan.natH, address })}
      </div>`;
    } else {
      frame = `<div data-in="pop" style="position:absolute;left:${X(80)};right:${X(80)};top:${V(900)};height:${X(560)};">
        ${frameHtml(theme, { device: "card", asset, tint: theme.a3 })}
      </div>`;
    }
  }
  const html = `${open(ctx)}
    <div style="position:absolute;left:${X(80)};right:${X(80)};top:${V(196)};">${kicker(theme, scene.kicker || S.showcaseKicker, theme.typeOn(theme.a1, ground))}</div>
    <div style="position:absolute;left:${X(80)};right:${X(70)};top:${V(320)};">${megaStack(theme, mega, { ground, accent: theme.a2, align: "left" })}</div>
    ${frame}
    ${!asset && scene.subtext ? `<div data-in="up" style="position:absolute;left:${X(80)};right:${X(80)};top:${V(1040)};font-family:${theme.bodyStack};font-weight:500;font-size:${F(fitPx(scene.subtext, 40, 120))};line-height:1.45;color:${rgba(theme.onField(ground), 0.76)};">${esc(scene.subtext)}</div>` : ""}
    ${chips.length && !asset ? `<div style="position:absolute;left:${X(80)};right:${X(80)};top:${V(1300)};display:flex;gap:${X(18)};flex-wrap:wrap;">
      ${chips.map((c, i) => chipHtml(theme, c, chipCols[i % 3])).join("")}
    </div>` : ""}
  ${close()}`;
  return { html, scroll: plan.frac ? { id: scrollId, frac: plan.frac, kind: device === "phone" ? "phone" : "web" } : null };
}

// CTA — the close: the user's logo (or a built mark), the wordmark, a pill button and the
// site URL, centred on a saturated field.
function bCta(scene, ctx, _assets, logo) {
  const { theme, S, ground } = ctx;
  const ink = theme.onField(ground);
  const mega = megaFit(scene.headline || scene.title || ctx.title, 150, 2, 920);
  const btn = String(scene.emphasis || S.ctaButton).slice(0, 24);
  const tag = String(scene.subtext || S.ctaTagline).slice(0, 70);
  const url = ctx.address ? String(ctx.address).toUpperCase() : "";
  const mark = logo && logo.path
    ? `<img src="${esc(logo.path)}" alt="${esc(logo.alt || "logo")}" style="${logoFilterCss(logo, theme.paper)}max-width:${X(140)};max-height:${X(140)};object-fit:contain;display:block;">`
    : `<div style="width:${X(76)};height:${X(76)};background:${theme.a2};border-radius:${X(12)};"></div>`;
  const html = `${open(ctx)}
    <div style="position:absolute;left:${X(80)};right:${X(80)};top:${V(420)};text-align:center;">
      <div data-in="pop" style="width:${X(190)};height:${X(190)};border-radius:${X(46)};background:${theme.paper};border:${X(6)} solid ${theme.ink};margin:0 auto;display:flex;align-items:center;justify-content:center;overflow:hidden;">${mark}</div>
      <div style="margin-top:${X(56)};">${megaStack(theme, mega, { ground, accent: theme.paper, align: "center" })}</div>
      <div data-in="up" style="font-family:${theme.subStack};font-weight:700;font-size:${F(fitPx(tag, 52, 40))};line-height:1.15;color:${rgba(ink, 0.9)};margin-top:${X(40)};">${esc(tag)}</div>
      <div data-in="pop" style="margin-top:${X(64)};display:inline-flex;align-items:center;gap:${X(20)};background:${theme.paper};border:${X(6)} solid ${theme.ink};border-radius:999px;padding:${X(26)} ${X(56)};">
        <span style="font-family:${theme.subStack};font-weight:700;font-size:${F(fitPx(btn, 52, 14))};color:${theme.ink};white-space:nowrap;">${esc(btn)}</span>
        <span class="kf-arrow" style="width:${X(28)};height:${X(28)};border-top:${X(7)} solid ${theme.ink};border-right:${X(7)} solid ${theme.ink};display:inline-block;flex:none;"></span>
      </div>
      ${url ? `<div data-in="up" style="font-family:${theme.monoStack};font-size:${F(30)};letter-spacing:.2em;text-transform:uppercase;color:${rgba(ink, 0.85)};margin-top:${X(52)};">${esc(url)}</div>` : ""}
    </div>
  ${close()}`;
  return { html };
}

const BUILDERS = {
  hook: bHook, cards: bCards, showcase: bShowcase, gallery: bGallery, grid: bGrid,
  stats: bStats, voice: bVoice, swatch: bSwatch, logos: bLogos, statement: bStatement, cta: bCta,
};

// ---- entrance script ---------------------------------------------------------
// The six primitives. `immediateRender:false` is load-bearing: the markup's RESTING state
// is the finished frame, so the "from" values exist only while the tween runs and a
// stalled ticker captures a complete scene, never a blank one.
const FROM = {
  mask: `{clipPath:"inset(0 100% 0 0)",y:34,skewY:2}`,
  up: `{y:92,opacity:0,filter:"blur(14px)"}`,
  pop: `{scale:0.8,opacity:0,rotate:-3}`,
  slide: `{x:-140,opacity:0,skewX:6}`,
  draw: `{scaleX:0}`,
  bar: `{scaleY:0}`,
};
const TO = {
  mask: `clipPath:"inset(0 0% 0 0)",y:0,skewY:0`,
  up: `y:0,opacity:1,filter:"blur(0px)"`,
  pop: `scale:1,opacity:1,rotate:0`,
  slide: `x:0,opacity:1,skewX:0`,
  draw: `scaleX:1`,
  bar: `scaleY:1`,
};
// Which primitives a scene actually uses is read off its OWN markup, so a builder can
// never emit a tween for a selector that does not exist (GSAP warns on a missing target
// and the runtime smoke test can fail on it).
function kindsIn(html) {
  return [...new Set((String(html).match(/data-in="([a-z]+)"/g) || []).map((m) => m.slice(9, -1)))];
}
function enterScript(id, T, html) {
  const out = [];
  for (const k of kindsIn(html)) {
    if (!FROM[k]) continue;
    const dur = k === "pop" ? 0.46 : 0.4;
    const ease = k === "pop" ? "back.out(1.7)" : "expo.out";
    out.push(`tl.fromTo("#${id} [data-in='${k}']",${FROM[k]},{${TO[k]},duration:${dur},ease:"${ease}",stagger:0.05,immediateRender:false},${r(T + 0.06)});`);
  }
  if (/data-count=/.test(html)) out.push(`count("#${id}",${r(T + 0.25)},0.85);`);
  return out;
}

// ---- MAIN --------------------------------------------------------------------
function buildComposition({ storyboard, dims, framePack, captionCues, assets, brandSkin = null, localized = null, seedKey = null } = {}) {
  const theme = prismaTheme(brandSkin);
  const S = localized ? { ...STRINGS, ...localized } : STRINGS;
  const sb = storyboard || {};
  const W = (dims && dims.width) || 1080, H = (dims && dims.height) || 1920;
  // The reserved caption band tracks the shared safe-area law rather than a literal:
  // portrait resolves to the authored 5% inset, landscape pulls the pill up to its own
  // 8% band (safeArea keys on the canvas aspect).
  const capBottom = r(safeArea(W, H).bottom * 38);
  // Type keyed on the SHORT side (responsive.typeScale's law). Portrait — the authored
  // aspect — resolves to exactly 1, so 9:16 output matches the design byte-for-byte.
  TSCALE = clamp(Math.min(W, H) / W, 0.5, 1);

  const scenes = Array.isArray(sb.scenes) && sb.scenes.length
    ? sb.scenes.slice(0, 12)
    : [{ id: "s1", start: 0, duration: 5, kind: "hook", headline: sb.title || S.packLabel }];
  const D = r(sb.durationSec
    || scenes.reduce((a, s) => Math.max(a, (Number(s.start) || 0) + (Number(s.duration) || 0)), 0) || 12);
  const rnd = mulberry32(seedFrom(seedKey || sb.title || (scenes[0] && scenes[0].headline) || "prisma"));
  const title = String(sb.title || "").slice(0, 60);
  const address = addressFrom(assets, S);

  // ---- assets: distribute real captures across DISPLAY-CAPABLE scenes ---------
  // The Creative Director's per-asset `sceneId` is a HINT, not a binding: honour it when
  // that scene can actually show an image, otherwise redistribute to the least-loaded
  // one. Without this a storyboard whose shots all landed on hook/cta/quote scenes
  // renders a film with no imagery at all.
  const all = Array.isArray(assets) ? assets : [];
  const logo = logoAssetOf(all);
  const shots = all.filter(shotOk).sort((a, b) => (Number(b.cdScore) || 0) - (Number(a.cdScore) || 0));
  const marks = all.filter((a) => markOk(a) && a !== logo).slice(0, 6);

  const baseArch = scenes.map((sc, i) => archetypeFor(sc, i, scenes.length));
  // A trust wall only earns its scene when there are enough real marks to fill it.
  if (marks.length >= 4) {
    const idx = baseArch.findIndex((a, i) => i > 0 && i < scenes.length - 1 && (a === "statement" || a === "grid"));
    if (idx >= 0) baseArch[idx] = "logos";
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
    for (const a of leftovers) {
      let best = displayIdx[0];
      for (const i of displayIdx) if (sceneShots[i].length < sceneShots[best].length) best = i;
      sceneShots[best].push(a);
    }
  }
  // The BEST capture (highest CD score) always earns the hero device frame, whatever
  // archetype its scene was typed as — so the film's strongest real screenshot is never
  // demoted to a thumbnail. One scene only; the rest follow the content rules below.
  const heroScene = new Set();
  if (shots.length) {
    const i = sceneShots.findIndex((list) => list.includes(shots[0]));
    if (i >= 0 && sceneShots[i].length === 1) heroScene.add(i);
  }
  // ZERO-ASSET PATH, first-class: a film that collected no usable imagery at all still
  // gets one product moment — a browser mockup holding the generated wireframe plate,
  // scrolling like a real capture. Placed on a mid scene whose own copy is thin enough
  // that it is not carrying the beat itself.
  const wireScene = new Set();
  if (!shots.length && scenes.length >= 3) {
    for (let i = 1; i < scenes.length - 1; i++) {
      const a = baseArch[i];
      if ((a === "statement" || a === "grid" || a === "cards")
          && Math.max(deck(scenes[i], 4).length, bullets(scenes[i], 4).length) < 3) { wireScene.add(i); break; }
    }
  }

  // ---- grounds: alternate paper → saturated so no two adjacent scenes share a field.
  // The ROTATION PATTERN is the pack's identity and is locked; only the hues inside it
  // move with the brand. The saturated pick is seeded, so two jobs don't share a rhythm.
  const satPool = [theme.a2, theme.a4, theme.a3, theme.a1];
  const satStart = Math.floor(rnd() * satPool.length);
  const grounds = scenes.map((_, i) => (i % 2 === 0 ? theme.paper : satPool[(satStart + Math.floor(i / 2)) % satPool.length]));
  // The CTA always closes on a saturated field — the one fixed beat in the pattern.
  if (scenes.length > 1) grounds[scenes.length - 1] = satPool[(satStart + 1) % satPool.length];

  // ---- wipe edges: never repeat a direction on consecutive cuts ---------------
  const EDGES = ["bottom", "left", "top", "right"];
  const dirs = [];
  let prevEdge = Math.floor(rnd() * 4);
  for (let i = 0; i < scenes.length; i++) {
    const next = (prevEdge + 1 + Math.floor(rnd() * 3)) % 4;  // any edge except the previous
    dirs.push(EDGES[next]); prevEdge = next;
  }
  // Focal point per scene so the camera drift pushes toward what the layout is about.
  const FOCI = ["50% 30%", "50% 70%", "78% 26%", "84% 58%", "50% 46%", "82% 34%", "50% 52%", "18% 40%", "80% 70%", "50% 42%"];

  // ---- build the scenes -------------------------------------------------------
  const startOf = (i) => scenes.slice(0, i).reduce((a, s) => a + (Number(s.duration) || 0), 0);
  const bodyParts = [], sceneScripts = [], labels = [], starts = [], durs = [];

  scenes.forEach((scene, i) => {
    const T = r(scene.start != null ? scene.start : startOf(i));
    const L = r(scene.duration || 4);
    const ground = grounds[i];
    let arch = baseArch[i];
    let sceneAssets = sceneShots[i];

    // A display-capable scene that received captures is upgraded to the presentation that
    // fits WHAT it got. The order matters: the aspect-routed device mockup (showcase) is
    // the pack's strongest way to present a real screenshot, so a capture only stays a
    // card THUMBNAIL when the scene's own copy is the point — three or more list items
    // that the deck exists to carry. Otherwise the shot gets the hero frame. Without this
    // precedence a "features"/"how" scene silently swallowed every capture into a 96px
    // badge and the mockups never appeared at all.
    if (wireScene.has(i)) { arch = "showcase"; sceneAssets = []; }
    else if (CAN_SHOW.has(arch) && sceneAssets.length) {
      const deckN = Math.max(deck(scene, 4).length, bullets(scene, 4).length);
      const isDeck = arch === "grid" || arch === "cards";
      if (arch === "swatch") sceneAssets = sceneAssets.slice(0, 4);
      else if (sceneAssets.length >= 2) { arch = "gallery"; sceneAssets = sceneAssets.slice(0, 3); }
      else if (isDeck && deckN >= 3 && !heroScene.has(i)) sceneAssets = sceneAssets.slice(0, 4);
      else { arch = "showcase"; sceneAssets = sceneAssets.slice(0, 2); }
    }
    // DEGRADE, never render an empty deck. A scene routed to a card type by its PURPOSE
    // ("feature", "how") but carrying neither list copy nor imagery would otherwise show
    // an empty grid; the statement type says the same thing with the pack's mega voice.
    if ((arch === "grid" || arch === "cards") && !sceneAssets.length
        && !deck(scene, 2).length && !bullets(scene, 2).length) arch = "statement";
    if (arch === "stats" && !pickStats(scene, 1, S).length) arch = "statement";

    const ctx = {
      id: `s${i + 1}`, T, L, i, isLast: i === scenes.length - 1, track: 10 + i,
      theme, S, ground, address, title,
    };
    const built = (BUILDERS[arch] || bStatement)(scene, ctx, arch === "logos" ? marks : sceneAssets, logo);
    bodyParts.push(built.html);
    labels.push(String(scene.kicker || scene.purpose || arch).slice(0, 22));
    starts.push(T); durs.push(L);

    const s = [];
    // The scene reveals 0.16s EARLY — while the outgoing wipe block still covers the
    // frame — so a cut never shows bare ground.
    s.push(`tl.set("#${ctx.id}",{opacity:1},${r(Math.max(0, T - 0.16))});`);
    s.push(...enterScript(ctx.id, T, built.html));

    // CAMERA — a continuous push-in / pull-back for the whole scene, alternating so the
    // film never pumps. It rides an INNER wrapper (full-frame, so its percentage y is
    // frame-relative) and that wrapper carries no CSS transform of its own, so GSAP can
    // never overwrite an authored rotation.
    const push = i % 2 === 0;
    s.push(`tl.set("#${ctx.id}-cam",{transformOrigin:"${FOCI[i % FOCI.length]}"},${r(Math.max(0, T - 0.16))});`);
    s.push(`tl.fromTo("#${ctx.id}-cam",{scale:${push ? 1 : 1.07},y:"${push ? 1.2 : -1.2}%"},{scale:${push ? 1.07 : 1},y:"${push ? -1.2 : 1.2}%",duration:${L},ease:"none",immediateRender:false},${T});`);

    // MID-SCENE BEAT — a second punch at 46% so the viewer gets new motion every ~1.5s
    // instead of one entrance and then dead air. Type is never jittered; only blocks.
    if (/kf-chip|kf-card/.test(built.html)) {
      s.push(`tl.to("#${ctx.id} .kf-chip, #${ctx.id} .kf-card",{y:-22,rotate:function(k){return k%2?1.4:-1.4;},duration:0.22,ease:"power2.out",stagger:0.045,immediateRender:false},${r(T + L * 0.46)});`);
      // overwrite:"auto" — the settle deliberately catches the kick mid-flight (that
      // overlap IS the back-ease bounce), so it must claim the properties rather than
      // race the outgoing tween for them.
      s.push(`tl.to("#${ctx.id} .kf-chip, #${ctx.id} .kf-card",{y:0,rotate:0,duration:0.36,ease:"back.out(2.4)",stagger:0.045,overwrite:"auto"},${r(T + L * 0.46 + 0.2)});`);
    }
    // WAVEFORM — bars breathe for the whole scene so the voice beat reads live.
    if (arch === "voice") {
      s.push(`tl.to("#${ctx.id}-wave > div",{scaleY:0.42,duration:0.36,ease:"sine.inOut",stagger:0.045,repeat:${yoyoReps(Math.max(0.8, L - 0.8), 0.72)},yoyo:true,immediateRender:false},${r(T + 0.6)});`);
    }
    // SCREENSHOT MOTION — the capture pans inside its own window. `frac` was resolved at
    // build time from the asset's real ratio and the slot's known geometry, and rides
    // yPercent (relative to the plate's OWN height), so it is exact at any resolution and
    // never depends on when the image decoded.
    if (built.scroll) {
      const win = built.scroll.kind === "phone" ? 0.9 : 1;
      const dur = r(Math.max(0.6, L - 1.2));
      s.push(`tl.fromTo("#${built.scroll.id}",{yPercent:0},{yPercent:${r(-built.scroll.frac * 100 * win)},duration:${dur},ease:"none",immediateRender:false},${r(T + 0.8)});`);
    }
    if (!ctx.isLast) s.push(`tl.set("#${ctx.id}",{opacity:0},${r(T + L)});`);
    sceneScripts.push(s.join("\n  "));
  });

  // ---- persistent layers ------------------------------------------------------
  // GROUND + halftone dot rain + two drifting blobs. The dot colour flips with the
  // ground's luminance so the texture reads on both paper and saturated fields.
  const bg = `<div id="kf-bg" class="clip" data-start="0" data-duration="${D}" data-track-index="0" data-layout-allow-occlusion style="background:${grounds[0]};">
    <div id="kf-dots" style="position:absolute;inset:0;color:${rgba(theme.onField(grounds[0]), 0.14)};background-image:radial-gradient(currentColor ${X(3.2)},transparent ${X(3.6)});background-size:${X(26)} ${X(26)};"></div>
    <div id="kf-blob1" class="kf-blob" style="width:${X(640)};height:${X(640)};left:${X(-200)};top:${V(-120)};background:${theme.a3};opacity:.5;"></div>
    <div id="kf-blob2" class="kf-blob" style="width:${X(520)};height:${X(520)};right:${X(-180)};top:${V(820)};background:${theme.a1};opacity:.42;"></div>
  </div>`;

  // CONTINUITY SEAM — the one element that never leaves. It re-anchors and re-angles per
  // scene, travelling THROUGH the cut, which is what stitches the scenes into one film.
  // Positioned at top:0 and driven purely by transform, so its travel is GPU-cheap and
  // its authored angle can never be discarded by a competing CSS transform.
  const SEAM_H = 150, SEAM2_H = 26;
  const seam = `<div id="kf-seam-clip" class="clip" data-start="0" data-duration="${D}" data-track-index="4" data-layout-allow-occlusion>
    <div id="kf-seam" style="position:absolute;left:-30%;width:160%;height:${X(SEAM_H)};top:0;background:${theme.a2};opacity:.9;"></div>
    <div id="kf-seam2" style="position:absolute;left:-30%;width:160%;height:${X(SEAM2_H)};top:0;background:${theme.ink};opacity:.5;"></div>
  </div>`;
  // Seam anchors — a seeded vertical position (in OUTPUT px, so GSAP's `y` is exact),
  // angle, thickness and colour per scene. Kept clear of the reserved caption band.
  const seamAt = scenes.map(() => {
    const yPct = 26 + rnd() * 48;                       // 26–74% of the frame
    return {
      y: r((yPct / 100) * H),
      a: r((rnd() < 0.5 ? -1 : 1) * (3 + rnd() * 6)),
      sy: r(0.5 + rnd() * 1.1),
      c: [theme.a2, theme.a1, theme.a3, theme.a4][Math.floor(rnd() * 4)],
      drift: r((rnd() < 0.5 ? -1 : 1) * H * 0.014),
    };
  });

  const wipe = `<div id="kf-wipe-clip" class="clip" data-start="0" data-duration="${D}" data-track-index="90" data-layout-allow-occlusion style="pointer-events:none;">
    <div id="kf-wipe" style="position:absolute;left:-10%;right:-10%;top:-12%;bottom:-12%;background:${theme.a1};"></div>
  </div>`;

  // GRAIN — a 4px repeating radial gradient (not an image, not a canvas), static so it
  // costs the timeline nothing and can never desync from a seeked capture.
  const grain = `<div id="kf-grain" class="clip" data-start="0" data-duration="${D}" data-track-index="92" data-layout-allow-occlusion style="pointer-events:none;opacity:.14;mix-blend-mode:multiply;background-image:radial-gradient(${rgba(theme.ink, 0.7)} 1px,transparent 1.4px);background-size:4px 4px;"></div>`;

  const chrome = `<div id="kf-chrome" class="clip" data-start="0" data-duration="${D}" data-track-index="94" data-layout-allow-occlusion style="pointer-events:none;">
    <div style="position:absolute;left:0;right:0;top:0;height:${X(10)};background:${rgba(theme.ink, 0.14)};">
      <div id="kf-prog" style="height:100%;width:100%;background:${theme.a1};transform-origin:left center;"></div>
    </div>
    <div id="kf-label" style="position:absolute;left:${X(80)};top:${V(70)};font-family:${theme.monoStack};font-size:${F(22)};letter-spacing:.2em;text-transform:uppercase;color:${rgba(theme.onField(grounds[0]), 0.55)};"></div>
  </div>`;

  // CAPTIONS — karaoke: words light up as they are spoken, on an ink pill that reads on
  // any brand ground. Unspoken words sit at 0.45 rather than 0, so even a stalled clock
  // shows a fully legible caption. The bottom 13% is reserved; no scene enters it.
  const caps = `<div id="caps" class="clip" data-start="0" data-duration="${D}" data-track-index="96" data-layout-allow-occlusion style="pointer-events:none;">
    <div id="cap-pill" style="position:absolute;left:${X(60)};right:${X(60)};bottom:${capBottom}%;display:flex;justify-content:center;opacity:0;">
      <div id="cap-text"></div>
    </div>
  </div>`;

  const cues = (Array.isArray(captionCues) ? captionCues : [])
    .filter((c) => c && c.text != null)
    .map((c) => [r(c.start != null ? c.start : c.startSec || 0), r(c.end != null ? c.end : (c.start || 0) + 2), String(c.text)]);

  // ---- the master timeline ----------------------------------------------------
  const script = `(function(){
  var D=${D};
  var tl=gsap.timeline({paused:true});
  var $=function(s){return document.querySelector(s);};
  var $$=function(s){return Array.prototype.slice.call(document.querySelectorAll(s));};

  // Count-up: a scrubbed numeric proxy, so a seek to any time shows the right number.
  // The element's RESTING text is already the final value, so a stalled ticker shows the
  // finished figure rather than a zero.
  function count(scope,at,dur){
    $$(scope+" [data-count]").forEach(function(el){
      var target=parseFloat(el.getAttribute("data-count"))||0;
      var suf=el.getAttribute("data-suffix")||"";
      var o={v:0};
      tl.to(o,{v:target,duration:dur,ease:"expo.out",immediateRender:false,onUpdate:function(){
        var s=Math.round(o.v)+suf; if(el.textContent!==s)el.textContent=s;
      }},at);
    });
  }

  ${sceneScripts.join("\n  ")}

  // ---- persistent layers ----
  var grounds=${JSON.stringify(grounds)};
  var starts=${JSON.stringify(starts)};
  var durs=${JSON.stringify(durs)};
  var labels=${JSON.stringify(labels.map((l) => String(l).toUpperCase()))};
  var inks=${JSON.stringify(grounds.map((g) => rgba(theme.onField(g), 0.55)))};
  var dots=${JSON.stringify(grounds.map((g) => rgba(theme.onField(g), 0.14)))};
  var seams=${JSON.stringify(seamAt)};
  var dirs=${JSON.stringify(dirs)};
  var dIn={bottom:{yPercent:112,xPercent:0},top:{yPercent:-112,xPercent:0},left:{xPercent:-112,yPercent:0},right:{xPercent:112,yPercent:0}};
  var dOut={bottom:{yPercent:-112,xPercent:0},top:{yPercent:112,xPercent:0},left:{xPercent:112,yPercent:0},right:{xPercent:-112,yPercent:0}};

  // Park the wipe off-frame from a CLEAN baseline — a percentage transform in the markup
  // would stack with gsap's yPercent and cancel it, leaving the block parked permanently
  // over the film.
  gsap.set("#kf-wipe",{x:0,y:0,xPercent:0,yPercent:112});
  gsap.set("#kf-seam",{y:seams[0].y,rotate:seams[0].a,scaleY:seams[0].sy});
  gsap.set("#kf-seam2",{y:seams[0].y+${r(H * 0.055)},rotate:seams[0].a});

  // Progress rule — one linear scaleX across the whole film.
  tl.fromTo("#kf-prog",{scaleX:0},{scaleX:1,duration:D,ease:"none",immediateRender:false},0);
  // Blobs drift for the whole film on finite yoyos (the source used CSS keyframes, which
  // a frame-capturing renderer cannot reproduce deterministically).
  tl.to("#kf-blob1",{y:"-6%",x:"3%",rotate:7,duration:5.5,ease:"sine.inOut",yoyo:true,repeat:${yoyoReps(D, 5.5)},immediateRender:false},0);
  tl.to("#kf-blob2",{y:"5%",x:"-4%",rotate:-9,duration:6.5,ease:"sine.inOut",yoyo:true,repeat:${yoyoReps(D, 6.5)},immediateRender:false},0);

  for(var i=0;i<starts.length;i++){
    var at=starts[i],L=durs[i],sm=seams[i],push=(i%2===0);
    // SEAM — eases to this scene's anchor over the first second, then keeps creeping, so
    // it is always in motion and always continuous with the last cut.
    tl.to("#kf-seam",{y:sm.y,rotate:sm.a,scaleY:sm.sy,backgroundColor:sm.c,duration:1.1,ease:"expo.out"},Math.max(0,at-0.2));
    tl.to("#kf-seam",{y:sm.y+(push?-sm.drift:sm.drift),duration:Math.max(0.3,L-1.1),ease:"sine.inOut"},at+0.9);
    tl.to("#kf-seam2",{y:sm.y+${r(H * 0.055)},rotate:sm.a,duration:1.1,ease:"expo.out"},Math.max(0,at-0.14));
    tl.to("#kf-seam2",{y:sm.y+${r(H * 0.055)}+(push?-sm.drift:sm.drift)*1.3,duration:Math.max(0.3,L-1.1),ease:"sine.inOut"},at+0.96);

    // CUT — a hard block wipe entering from a rotating edge. The ground swaps while the
    // block FULLY covers the frame, so the colour change is never seen as a jerk: you
    // only ever see the block move. Never a dissolve.
    if(i<starts.length-1){
      var cut=at+L-0.42,nx=i+1;
      tl.set("#kf-wipe",{backgroundColor:grounds[nx]},cut);
      tl.fromTo("#kf-wipe",{x:0,y:0,xPercent:dIn[dirs[i]].xPercent,yPercent:dIn[dirs[i]].yPercent},{xPercent:0,yPercent:0,duration:0.26,ease:"power3.inOut",immediateRender:false},cut);
      tl.set("#kf-bg",{backgroundColor:grounds[nx]},cut+0.27);
      tl.set("#kf-dots",{color:dots[nx]},cut+0.27);
      tl.to("#kf-wipe",{xPercent:dOut[dirs[i]].xPercent,yPercent:dOut[dirs[i]].yPercent,duration:0.3,ease:"power3.inOut",overwrite:"auto"},cut+0.28);
    }
  }

  // ---- one seek-safe proxy: chrome label + karaoke captions ----
  var cues=${JSON.stringify(cues)};
  var capPill=$("#cap-pill"),capText=$("#cap-text"),labelEl=$("#kf-label");
  var spans=[],curCue=-1,curScene=-1,lastLit=-1;
  var PACK=${JSON.stringify(String(S.packLabel || STRINGS.packLabel).toUpperCase())};
  var LIT=${JSON.stringify(theme.a3)},DIM=${JSON.stringify(theme.paper)};
  tl.to({},{duration:D,ease:"none",onUpdate:function(){
    var now=tl.time();
    // Chrome flips 0.22s EARLY — while the wipe still covers the frame — so its colour
    // change is hidden by the cut instead of popping after it.
    var si=0; while(si<starts.length-1&&now+0.22>=starts[si+1])si++;
    if(si!==curScene){
      curScene=si;
      if(labelEl){labelEl.textContent=PACK+" · "+labels[si];labelEl.style.color=inks[si];}
    }
    if(!capPill||!capText)return;
    var ci=-1;
    for(var k=0;k<cues.length;k++){if(now>=cues[k][0]&&now<cues[k][1]){ci=k;break;}}
    if(ci!==curCue){
      curCue=ci;lastLit=-1;
      capText.textContent="";spans=[];
      if(ci>=0){
        var ws=String(cues[ci][2]).split(/\\s+/);
        for(var w=0;w<ws.length;w++){
          if(!ws[w])continue;
          var sp=document.createElement("span");
          sp.textContent=ws[w];sp.className="cap-w";
          capText.appendChild(sp);spans.push(sp);
        }
      }
    }
    if(ci<0){capPill.style.opacity="0";return;}
    capPill.style.opacity="1";
    // The word clock is derived from the cue's OWN span, so it stays locked however
    // uneven the shot lengths are. The last ~18% is held fully lit, so a line never ends
    // mid-highlight.
    var c=cues[ci],span=Math.max(0.2,c[1]-c[0]);
    var lit=Math.min(spans.length,Math.floor(Math.max(0,((now-c[0])/span-0.04)/0.78)*spans.length));
    if(lit!==lastLit){
      lastLit=lit;
      for(var q=0;q<spans.length;q++){
        spans[q].style.opacity=(q<lit)?"1":"0.45";
        spans[q].style.color=(q===lit-1)?LIT:DIM;
      }
    }
  }},0);

  window.__timelines=window.__timelines||{};
  window.__timelines["vid"]=tl;
  if(typeof navigator==="undefined"||!navigator.webdriver){tl.play(0);tl.eventCallback("onComplete",function(){tl.restart();});}
})();`;

  const style = `${theme.fontFace}
  * { box-sizing:border-box; margin:0; padding:0; }
  html, body { width:100%; height:100%; overflow:hidden; background:${theme.ink}; }
  #root { position:relative; overflow:hidden; isolation:isolate; container-type:size; background:${theme.paper}; color:${theme.ink}; font-family:${theme.bodyStack}; }
  .clip { position:absolute; top:0; left:0; width:100%; height:100%; overflow:hidden; }
  .kf-cam { position:absolute; inset:0; will-change:transform; }
  .kf-blob { position:absolute; border-radius:50%; filter:blur(${X(58)}); will-change:transform; }
  .kf-chip { display:inline-flex; align-items:center; gap:${X(12)}; padding:${X(14)} ${X(26)}; border-radius:999px;
             font-family:${theme.bodyStack}; font-weight:600; border:${X(4)} solid ${theme.ink};
             white-space:nowrap; max-width:${X(860)}; overflow:hidden; text-overflow:ellipsis;
             will-change:transform,opacity; }
  .kf-card { border-radius:${X(34)}; border:${X(4)} solid ${theme.ink}; background:${theme.paper};
             box-shadow:${X(14)} ${X(16)} 0 ${theme.ink}; will-change:transform,opacity; }
  .kf-arrow { transform:rotate(45deg); }
  #cap-text { max-width:${X(900)}; text-align:center; font-family:${theme.subStack}; font-weight:700;
              font-size:${F(44)}; line-height:1.24; color:${theme.paper};
              background:${rgba(theme.ink, 0.9)}; padding:${X(20)} ${X(34)}; border-radius:${X(20)};
              display:flex; flex-wrap:wrap; gap:0 ${X(14)}; justify-content:center; }`;

  const indexHtml = [
    `<!DOCTYPE html>`, `<html lang="en">`, `<head>`, `<meta charset="utf-8">`, `<title>vid</title>`,
    `<script src="${GSAP_CDN}"></script>`,
    `<style>`, style, `</style>`, `</head>`, `<body>`,
    `<div id="root" class="composition" data-composition-id="vid" data-width="${W}" data-height="${H}" data-start="0" data-duration="${D}" style="width:${W}px;height:${H}px;">`,
    bg, seam,
    bodyParts.join("\n"),
    wipe, grain, chrome, caps,
    `</div>`,
    `<script>`, script, `</script>`,
    `</body>`, `</html>`,
  ].join("\n");

  const metaJson = JSON.stringify({ compositionId: "vid", width: W, height: H, fps: (dims && dims.fps) || 30, duration: D });
  // resolvedBrand echoes the palette the film ACTUALLY wore (or null when no brand was
  // applied), so graph.persistWornBrand discloses the true painted colours.
  return { indexHtml, metaJson, resolvedBrand: theme.resolvedBrand };
}

module.exports = { buildComposition, STRINGS };
