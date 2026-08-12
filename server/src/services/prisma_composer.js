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
const { isLogo, categorize } = require("./asset_priority");
const admission = require("./asset_admission");
const { logoFilterCss } = require("./logo_render");
const { resolveBrand } = require("./brand_kit");
const { safeArea } = require("./responsive");
const { GSAP_CDN, r, esc, hexToRgb, bullets } = require("./composer_kit");

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
// The same vertical position as a NUMBER, for build-time geometry the CSS never sees
// (the seam's keep-out bands below).
const Vn = (px) => (px / RH) * 100;

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

// TONE — the same hue and saturation at a different lightness. This is what lets the
// pack add depth without a gradient: a decorative shape drawn as a darker or lighter
// TONE OF ITS OWN GROUND reads as considered, where the same shape in a fixed unrelated
// accent (a yellow disc on cream, a coral ring on jade) reads as clutter. Flat fill, no
// blur, no gradient — the identity holds.
function tone(hex, delta) {
  const [h, s, l] = rgbToHsl(hexToRgb(hex));
  return hslHex(h, s, clamp(l + delta, 0.02, 0.98));
}
// A tonal shift that always moves AWAY from mid-grey, so a shape stays visible whether
// its ground is a near-black cobalt or a bright gold.
const decorTone = (ground, strength) => tone(ground, relLum(ground) > 0.42 ? -strength : strength);
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
// REFINED 2026-07-30. The authored set was every accent at 100% saturation
// (#FF4D2E / #1B4DFF / #FFD23F / #14C98E) — fluorescent at chip scale and genuinely
// harsh as a FULL-FRAME ground, which is how this pack uses them. Two of them also
// failed as body-text fields once the type sat on them.
//
// What changed and what did not: the identity is flat saturated colour blocks, so the
// fields stay saturated — 68-84% rather than 100%, deepened and slightly warmed. The
// VALUE LADDER (a2 dark < a1 < a4 < a3 bright) is preserved and better spread
// (.074/.224/.333/.574 vs .128/.268/.439/.677), which matters because the layout was
// drawn against it and the brand mapper assigns slots by luminance.
//
// Every saturated ground now clears AA body contrast with its own best text colour:
//   a1 ink 4.90:1 · a2 paper 7.41:1 · a3 ink 11.18:1 · a4 ink 6.87:1
// The paper drops from a 100%-saturation cream to a 39% warm off-white, which stops the
// unbranded film reading as yellow-tinted.
const PAPER0 = "#F4EFE6";
const INK0 = "#14110F";
const A0 = ["#D95A3A", "#2438C8", "#EFC24A", "#1BB184"];

function prismaTheme(brandSkin) {
  const fontFace = [DISPLAY, SUB, MONO].filter(isBundled).map(fontFaceCss).join("");
  let paper = PAPER0, ink = INK0, acc = A0.slice(), resolvedBrand = null;
  try {
    const brand = resolveBrand(brandSkin, { ground: PAPER0, isDark: false, packAccents: A0 });
    const led = brandLedOf(brand, A0);
    if (brand.applied && led.length) {
      // HUE-MAPPING, slot by LUMINANCE FIT — not by ordinal position.
      //
      // Every slot keeps its authored luminance (that ladder is the pack's identity and
      // the layout was drawn against it). The only free choice is WHICH brand hue lands
      // in WHICH slot — and taking them in order was throwing the user's colours away.
      //
      // MEASURED on a violet/amber/emerald brand: amber #F59E0B (luminance .439) was the
      // second accent, so it took a2 — the pack's DARKEST slot at .128 — and reHue pinned
      // it there, emitting #8d5800. The user picked amber and the film painted dark
      // brown. Ordinal position, not colour, decided that.
      //
      // Matching each brand colour to the free slot whose authored luminance is nearest
      // its own costs nothing and removes the distortion: on that same brand, amber now
      // lands in a4 (.439 — an EXACT match, zero shift) and violet in a2 (.134 vs .128).
      // Closest pair first, so the best fits claim the slots they need; ties break on
      // index so the assignment stays deterministic across builds.
      const packH = A0.map(hueOf);
      const packL = A0.map(relLum);
      const brandH = led.map(hueOf);
      const slotHue = new Array(A0.length).fill(null);
      const pairs = [];
      for (let b = 0; b < led.length; b++) {
        for (let s = 0; s < A0.length; s++) pairs.push({ b, s, d: Math.abs(relLum(led[b]) - packL[s]) });
      }
      pairs.sort((x, y) => (x.d - y.d) || (x.b - y.b) || (x.s - y.s));
      const usedB = new Set(), usedS = new Set();
      for (const p of pairs) {
        if (usedB.has(p.b) || usedS.has(p.s)) continue;
        slotHue[p.s] = brandH[p.b]; usedB.add(p.b); usedS.add(p.s);
      }
      // Slots no brand colour claimed CYCLE back through its own hues rather than
      // inventing a new one — a4 is used as a full-frame GROUND, and a derived hue there
      // paints a whole scene in a colour the user never chose. Cycling keeps every field
      // literally on-palette (the luminance ladder already keeps them distinguishable).
      // A ONE-colour palette is the exception: cycling would make the film monochrome, so
      // it falls back to rotating the pack's own spacing off that single hue.
      const hueFor = (i) => (slotHue[i] != null ? slotHue[i]
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
  howKicker: "How it works",
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

// Wrap by ADVANCE — the same width model the size search uses — into at most `maxLines`.
// Returns null when the text cannot be made to fit at this size, which is the signal the
// search below steps down on. Greedy: a line takes the next word while it still fits.
function wrapByAdvance(words, maxAdvance, maxLines) {
  const lines = [];
  let cur = "";
  for (const w of words) {
    const cand = cur ? `${cur} ${w}` : w;
    if (cur && advanceOf(cand) > maxAdvance) {
      lines.push(cur);
      if (lines.length >= maxLines) return null;   // out of rows with words left
      cur = w;
    } else {
      cur = cand;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) return null;
  // EVERY line must fit, including one made of a single unbreakable word. A word wider
  // than the column starts a line with `cur` empty, so the check above never sees it —
  // "NORTHWIND" is 7.56em against a 5.95em column at the CTA's authored 150px and was
  // accepted as a one-line fit, then rendered off the right edge as "NORTHWIN|". The
  // size search only converges if an over-wide line is reported as a MISS.
  return lines.every((l) => advanceOf(l) <= maxAdvance) ? lines : null;
}

// THE SIZE SEARCH. Wrapping and sizing are ONE decision, so they are solved together:
// step down from the authored size and take the first that wraps inside the column in
// `maxLines` rows.
//
// WHY NOT the previous approach. It derived a CHARACTER budget from the base size
// (`col / (basePx × 0.84)`) — 8 characters per line at a 126px base — filled lines to
// that budget until `maxLines - 1`, then dumped EVERY remaining word onto the last row.
// That row's advance then set the size for the whole stack, so the shorter the budget,
// the sooner the rows ran out, the more words piled onto the last one, and the smaller
// the result: a feedback loop, not a fit. Measured on real headlines it produced 18-34%
// of the intended size — "Three days of copy-paste before anyone can decide anything."
// asked for 126px and rendered at 25px. Archivo Black mega type IS this pack, so the
// pack's signature was failing on roughly two headlines in five.
//
// Stepping by whole pixels keeps the result deterministic (no float drift between
// builds) and costs at most ~170 cheap wraps per headline.
// Below this fraction of the authored size the type has stopped being this pack's voice
// and become body copy — the point at which buying size back with an extra row is worth
// more than holding the authored row budget.
const MEGA_VOICE = 0.42;
function megaFit(text, basePx, maxLines, colPx) {
  const col = (colPx || 930) * MEGA_FILL;
  const words = wordsOf(String(text || "").toUpperCase());
  if (!words.length) return { lines: [], size: basePx };
  const fitAt = (rows) => {
    for (let s = Math.round(basePx); s >= 8; s--) {
      const lines = wrapByAdvance(words, col / s, rows);
      if (lines) return { lines, size: s };
    }
    return null;
  };
  const rows = Math.max(1, maxLines);
  let best = fitAt(rows);
  if (!best) {
    // Unbreakable single token wider than the column at any usable size: size to the
    // widest word so it still fits edge to edge rather than bleeding off the frame.
    const widest = words.reduce((a, w) => Math.max(a, advanceOf(w)), 1);
    return { lines: words.slice(0, rows), size: col / widest };
  }
  // A long headline in a NARROW column (the swatch beat's 580px text column, the phone
  // showcase's 520px) fits honestly at ~26px — correct arithmetic, but 26px Archivo Black
  // is not mega type, and the scene silently loses the pack's voice. Spend up to two
  // extra ROWS to buy the size back; the columns that hit this are the tall ones, and the
  // caption-band check covers the added height.
  for (let extra = 1; extra <= 2 && best.size < basePx * MEGA_VOICE; extra++) {
    const alt = fitAt(rows + extra);
    if (alt && alt.size > best.size) best = alt;
  }
  return best;
}

// The vertical band a mega stack occupies, as a percentage of the FRAME height.
//
// WHY THIS EXISTS. The continuity seam is a full-width saturated band that travels
// through every cut, and its anchor was a purely random 26-74% of the frame. Nothing
// stopped it landing across the headline — and when it did, the type's contrast was
// computed against the scene GROUND (onField/typeOn) while the pixels behind the glyphs
// were the SEAM. Measured on a real render: black "CONNECT ONCE." over the ultramarine
// seam is 2.2:1, well under the 3:1 large-text floor the pack enforces everywhere else.
// Builders report their mega band so the seam can be anchored in clear space instead.
//
// line-height is .86 and megaStack emits one div per line, so the block height is
// exactly lines x size x .86.
function megaBandOf(topPct, fit) {
  if (!fit || !fit.lines.length) return null;
  const hPx = fit.lines.length * fit.size * 0.86 * TSCALE;
  return { top: topPct, bottom: topPct + (hPx / RH) * 100 };
}
// Sub-display / body text shrinks on length the same way, so a long AI sentence never
// pushes a card past its box.
function fitPx(text, basePx, targetCh, floor = 0.58) {
  const len = String(text || "").length || 1;
  return basePx * clamp(targetCh / len, floor, 1);
}


// Where a mega stack ends, in authored px — the anchor every builder below flows from.
// Fixed V() constants were tuned against one headline length; a two-line hook and a
// five-line one then left wildly different gaps under the type (measured: 34%-84% of the
// frame, against a caption reserve starting at 87%). Flowing from the measured block is
// what turns "large empty area" into deliberate spacing.
const megaEnd = (topPx, fit) => topPx + (fit && fit.lines.length ? fit.lines.length * fit.size * 0.86 * TSCALE : 0);

// ---- asset gates -------------------------------------------------------------
// A SHOT is real imagery the film can showcase: not the logo, not a video, not a vector.
// Trust follows the shared tier law (uploads / the user's own site / curated / CD-approved
// stock), so nothing unverified reaches a hero slot.
function shotOk(a) {
  if (!a || !a.path) return false;
  if (isLogo(a)) return false;
  if (a.type === "video" || /\.(mp4|webm|mov)($|\?)/i.test(a.path)) return false;
  if (/\.svg($|\?)/i.test(a.path)) return false;
  // `__layoutDemoted` USED to be rejected here. This pack has no B-roll layer, so that made
  // the Visual Layout Director's demotion a DELETION — and on a prompt-only film, where the
  // whole wire is stock and the VLD trims it against its presentation budget, the pack could
  // be left with nothing to show. A demotion is a preference; displayRank honours it by
  // seating demoted material last.
  // ADMISSION IS SHARED (services/asset_admission). This line used to read a TRUST signal
  // as an ADMISSION test: web stock satisfies neither clause and the Creative Director is
  // told "when in doubt, use background", so a stock photo was never drawn at all — measured
  // as zero <img> from a wire of five good pictures. Trust now ORDERS the pool
  // (admission.displayRank); only an explicit reject is excluded.
  return admission.displayOk(a);
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

// A slot that FOLLOWS ITS ASSET instead of forcing every capture into one box.
//
// The deck badge was a fixed landscape plate, so an ultra-tall phone capture (ratio ~0.31)
// contained down to a thin strip inside it — technically uncropped, visually nothing. A
// fixed box can only ever be right for one aspect; given a target AREA and a clamp on how
// extreme a shape the layout can absorb, the slot can take the asset's own proportions and
// stay inside its row.
//   area   — the visual weight the slot should carry, in authored px^2
//   maxW/H — the row's hard limits
// Returns whole px so the CSS and any geometry derived from it agree exactly.
function fitBox(asset, { area, maxW, maxH, minW = 90, minH = 90 }) {
  const q = clamp(ratioOf(asset) || 1.35, 0.42, 2.6);
  let w = Math.sqrt(area * q), h = w / q;
  if (w > maxW) { w = maxW; h = w / q; }
  if (h > maxH) { h = maxH; w = h * q; }
  if (w < minW) { w = minW; h = Math.min(maxH, w / q); }
  if (h < minH) { h = minH; w = Math.min(maxW, h * q); }
  return { w: Math.round(w), h: Math.round(h) };
}

// THE CREATIVE DIRECTOR'S `alt` IS AN INSTRUCTION, NOT A CAPTION.
//
// It arrives as directive prose written for the composer — "the brand's OWN site logo —
// brand chip and CTA lockup only, never a full-frame image", "REAL WEBSITE SCREENS". Two
// places rendered it as user-visible text: the gallery's per-cell label, and the `alt`
// attribute of every <img>, which Chromium PAINTS when an image fails to load. A live run
// produced both at once — a broken logo showing its own instruction sheet in the hook.
//
// A caption must be short, self-contained, and free of directive grammar. Anything that
// fails those tests is not a caption, and silence beats leaking the brief.
const INSTRUCTION_RE = /\b(never|only|always|must|should|avoid|prefer|instead|lockup|full-frame|the brand's)\b|[—–]|\.\s|\.$/i;
function displayLabel(alt, max = 22) {
  const t = String(alt || "").replace(/\s+/g, " ").trim();
  if (!t || t.length > max || INSTRUCTION_RE.test(t)) return "";
  // ALL-CAPS is the other tell. Genuine alts from the pipeline are lowercase description
  // ("pricing page", "mobile app"); the director's own labels shout ("REAL WEBSITE
  // SCREENS", "THE BRAND'S OWN HERO"). Costs nothing to reject — the label is rendered
  // through text-transform:uppercase either way, so a real caption loses no styling.
  if (/[A-Z]/.test(t) && t === t.toUpperCase() && /\s/.test(t)) return "";
  return t;
}
// What an <img> should carry. Falls back to a neutral noun so a failed decode paints a
// word, not the brief. Never empty for a logo: that is the one image whose absence a
// viewer should be able to name.
const safeAlt = (alt, fallback = "") => displayLabel(alt, 60) || fallback;

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

// A DEVICE WINDOW THAT FITS ITS CAPTURE.
//
// The window height was a constant, so a capture that does not scroll was `contain`ed
// inside it and letterboxed — a 16:9 grab in an 840x660 window (ratio 1.27) renders with
// matte bands above and below, which reads as an empty screen with a small picture in it.
// A live QA pass called exactly that "an empty dark screen".
//
// Two cases, and only one of them wants a fixed height:
//   • capture TALLER than the authored window -> it scrolls, `cover` fills the width, and
//     the authored height is the viewport the pan happens inside. Keep it.
//   • capture SHORTER -> nothing to scroll, so the window takes the capture's own height
//     and the letterbox disappears. Bounded so a panorama cannot collapse the frame to a
//     slot and a near-square cannot outgrow its slot in the layout.
// Returns the height the window should use, in authored px.
function windowHeightFor(asset, boxW, authoredH, minH) {
  const q = ratioOf(asset);
  if (!asset || !asset.path || !q) return authoredH;   // wireframe plate keeps the authored box
  const natH = boxW / q;
  return Math.round(clamp(natH, minH, authoredH));
}

// The plate that lives inside a device window: either the scrolling full-width capture
// (natural height, panned by the timeline) or a static contained fit.
function plate(theme, { asset, scrollId, natH, tint }) {
  if (asset && asset.path) {
    return scrollId && natH
      ? `<div id="${scrollId}" style="position:absolute;left:0;right:0;top:0;height:${X(natH)};"><img src="${esc(asset.path)}" alt="${esc(safeAlt(asset.alt))}" style="width:100%;height:100%;object-fit:cover;object-position:top center;display:block;"></div>`
      : `<img src="${esc(asset.path)}" alt="${esc(safeAlt(asset.alt))}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;object-position:center;display:block;">`;
  }
  // Generated wireframe plate — the zero-asset path, built only from pack blocks so it
  // reads as authored. Never shown when a real capture exists.
  const inner = wirePlate(theme, tint);
  return scrollId && natH
    ? `<div id="${scrollId}" style="position:absolute;left:0;right:0;top:0;height:${X(natH)};">${inner}</div>`
    : `<div style="position:absolute;inset:0;">${inner}</div>`;
}

function wirePlate(theme, tint) {
  // ONE accent (whatever matte the slot passed) plus ink tints — the generated plate
  // must read as the same design system as the rest of the film, not a fifth palette.
  const acc = tint || theme.a3;
  const bar = (w, o) => `<div style="height:${X(30)};width:${w};border-radius:999px;background:${rgba(theme.ink, o)};flex:none;"></div>`;
  return `<div style="position:absolute;inset:0;padding:${X(34)} ${X(38)};box-sizing:border-box;display:flex;flex-direction:column;gap:${X(24)};background:${theme.paper};">
    <div style="display:flex;align-items:center;gap:${X(18)};flex:none;">
      <div style="width:${X(56)};height:${X(56)};border-radius:${X(16)};background:${acc};flex:none;"></div>
      ${bar("38%", 0.16)}
      <div style="width:${X(130)};height:${X(38)};border-radius:999px;background:${rgba(theme.ink, 0.14)};flex:none;margin-left:auto;"></div>
    </div>
    <div style="height:${X(260)};border-radius:${X(24)};background:${rgba(acc, 0.30)};flex:none;"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:${X(18)};height:${X(170)};flex:none;">
      <div style="border-radius:${X(20)};background:${rgba(theme.ink, 0.09)};"></div>
      <div style="border-radius:${X(20)};background:${rgba(acc, 0.45)};"></div>
      <div style="border-radius:${X(20)};background:${rgba(theme.ink, 0.09)};"></div>
    </div>
    ${bar("70%", 0.14)}${bar("52%", 0.14)}
    <div style="height:${X(290)};border-radius:${X(24)};background:${rgba(acc, 0.22)};flex:none;"></div>
    ${bar("60%", 0.14)}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:${X(20)};height:${X(200)};flex:none;">
      <div style="border-radius:${X(20)};background:${rgba(acc, 0.45)};"></div>
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
  // ONE OPENER, ONE CLOSER — and they are decided by POSITION, not by wording.
  //
  // These two lines used to read `i === 0 || k === "hook" || /hook|intro|open/.test(p)`, so
  // ANY scene could claim the opener by describing itself as one. The storyboard model
  // routinely does: it stamped `kind:"hook"` on scene 3 of a real film whose purpose was
  // "feature", and the substring test alone would promote a scene called "open new doors"
  // or "introducing the team".
  //
  // bHook is a fixed composition — kicker, flush-left mega stack, chip row, drawn rule — so
  // a second hook is not a variation on the opener, it IS the opener, rendered again with
  // different words. Measured on a real render: frames at 0.6s and 9.1s were structurally
  // identical (same four block positions, same left-origin rule), and the QA reviewer
  // reported it as a "groundhog set". The same hazard runs in reverse for `cta`, where a
  // middle scene whose purpose merely mentions "download" becomes a second closing lockup.
  //
  // Position is the only honest source for a structural beat: the opener is the scene that
  // opens. A middle scene that describes itself as a hook still has content, and falls
  // through to the type that content implies.
  if (i === 0) return "hook";
  if (i === total - 1) return "cta";
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
// `stats` earns its place here for the same reason it does in om_stage: archetypeFor sends
// every numeric proof line ("Trusted by 40,000 teams", "Deploy in 8 seconds") to this beat,
// so an ordinary five-scene deck resolves to hook / grid / stats / stats / cta — and with
// stats excluded exactly ONE scene could carry a capture. All three of the Creative
// Director's shots then piled onto that single scene while four rendered none. The counter
// cards keep the stage; the capture rides below them in the pack's own hard-edged card
// frame (see bStats), which is how this poster pack already presents imagery elsewhere.
const CAN_SHOW = new Set(["statement", "grid", "cards", "showcase", "gallery", "swatch", "stats", "voice"]);

// How many shots each beat can actually RENDER, matching what the dispatch below slices to
// (a beat holding 2+ is promoted to the 3-up gallery, which is why the text beats read 3).
// Distribution honours these so a shot is never assigned to a beat that will discard it.
const SHOT_CAPACITY = { stats: 1, voice: 1, showcase: 2, gallery: 3, statement: 3, grid: 4, cards: 4, swatch: 4 };
const capacityOf = (arch) => SHOT_CAPACITY[arch] || 0;

// ---- anti-repetition (pack-local) --------------------------------------------
// archetypeFor ends in a single fallthrough, so every middle scene of a text-led film
// lands on "statement" and the film reads as one backdrop with rotating copy.
//
// WHY NOT services/motion_planner.varyArchetypes. It filters whatever pool it is handed
// through a SHARED `GENERIC_ARCHETYPES` set written for the flagship vocabulary
// ("hero", "billboard", "problem", "solution"...). Intersected with THIS pack's builders
// that leaves exactly {showcase, statement} — so `cards`, `grid` and `swatch` could never
// participate no matter what was passed, and a run of identical scenes was broken, at
// best, by alternating two layouts. Extending the shared set would reach into every other
// pack's routing, so the pack decides for itself instead.
//
// Which of its own builders are safe to swap IN:
//   statement    — the default; safe unconditionally.
//   cards / grid — safe: the DEGRADE in buildComposition turns a deck with no list copy
//                  and no imagery straight back into statement.
//   showcase     — safe ONLY when real shots exist. With none it renders the GENERATED
//                  wireframe mockup, and a film should show an invented product UI at
//                  most once (that is wireScene's job, and it already picks its moment).
// Everything else is excluded on preconditions: hook/cta are structural, logos needs four
// real marks, gallery needs two shots, stats needs a number, voice is a right-aligned
// quote composition, swatch is semantically the brand beat.
const SWAP_POOL = ["statement", "cards", "grid", "showcase"];
// `profile[i]` = { deckN, hasShot } for scene i — what the scene actually HAS to show.
// A swap must not cost the scene its content: replacing a deck that holds three bullets
// with `showcase` throws all three away and shows a device mockup instead. Observed
// exactly that on a real storyboard — two adjacent `grid` scenes (archetypeFor sends both
// "3+ bullets" and "feature" there), correctly detected as a repeat, then broken by
// swapping one to showcase, which dropped its copy AND duplicated the previous scene's
// mockup and kicker. Rank first, seed second.
function varyLocal(arch, profile, canShowcase, seedKey) {
  const pool = SWAP_POOL.filter((a) => a !== "showcase" || canShowcase);
  const out = arch.slice();
  if (out.length < 3 || !pool.length) return out;
  if (/^(1|true|yes|on)$/i.test(String(process.env.KF_NO_ARCHETYPE_VARIATION || ""))) return out;
  const seed = seedFrom(seedKey);
  for (let i = 1; i < out.length - 1; i++) {
    if (out[i] !== out[i - 1]) continue;            // not a repeat — leave it alone
    if (!pool.includes(out[i])) continue;           // a data-shaped scene keeps its type
    const pf = (profile && profile[i]) || { deckN: 0, hasShot: false };
    // Prefer a replacement that also differs from the NEXT scene, so breaking one pair
    // does not simply create the next one.
    const strict = pool.filter((a) => a !== out[i - 1] && a !== out[i] && a !== out[i + 1]);
    const loose = pool.filter((a) => a !== out[i - 1] && a !== out[i]);
    const list = strict.length ? strict : loose;
    if (!list.length) continue;
    // 0 = keeps this scene's list copy · 1 = says it another way · 2 = invents a mockup
    const rank = (a) => {
      if (a === "cards" || a === "grid") return pf.deckN >= 2 ? 0 : 2;
      if (a === "statement") return 1;
      if (a === "showcase") return pf.hasShot ? 1 : 3;
      return 2;
    };
    const bestRank = Math.min(...list.map(rank));
    const tier = list.filter((a) => rank(a) === bestRank);
    out[i] = tier[(seed + i) % tier.length];
  }
  return out;
}

// ---- scene builders ((scene, ctx, sceneAssets, logo) -> {html, scroll?}) ------
// Every builder returns markup whose RESTING state is the finished frame; the `data-in`
// "from" values exist only while a tween runs, so a stalled ticker can never capture a
// blank scene. Entrance tweens are emitted generically by enterScript() below.

// OPTICAL CENTRING. Flowing content down from the measured type block fixed the
// collisions but not the balance: a scene whose copy is short still ended around 60% of
// the frame with everything above it, so the poster read top-heavy and the bottom third
// was empty. Measured across 108 scene shapes, the median gap from the lowest element to
// the caption reserve was 31.8%.
//
// The whole scene block is shifted so it sits centred in the safe band. It rides a THIRD
// wrapper — .kf-fit inside .kf-cam — because .kf-cam's transform belongs to the camera
// tween, and GSAP would overwrite any static offset written there. Clamped so the shift
// can never push content above the safe top or below the reserved caption band.
function centerOffset(ctx, top, bottom) {
  // The top needs the SAME camera solve as the bottom. A static floor is not enough:
  // the push scales content away from the focal point, so at a focal y of 46% a block
  // parked at 138px arrives at 75px — straight onto the persistent pack label at 70px,
  // which rides its own layer and never moves. A live render produced exactly that:
  // "SEE IT WORKING" and "PRISMA BLOC · FEATURE" interleaved on one baseline.
  const safeTop = Math.max((ctx.safeTopPct / 100) * RH, ctx.camTopPx);
  // CLAMP AGAINST THE CAMERA, not the static frame. Every scene rides a push that scales
  // content away from its focal point, so a block that ends inside the safe area at rest
  // does not necessarily end inside it while moving: the showcase chips sit at 83.9% and
  // a focal point at y=26% carries them to 88.8% — past the reserved caption band. The
  // usable bottom is therefore the point that is STILL clear after the push:
  //     fy + (safeBottom - fy) / camScale
  // which for a high focal point is ~82% rather than 87%. Solving for it here means the
  // centring shift pulls such a scene UP instead of merely declining to push it down.
  // A margin on top of the solve, because a builder's declared extent is an ESTIMATE:
  // auto-height text and chip rows are counted at nominal heights, so the true bottom can
  // sit a little below what was declared. 34 authored px (~1.8% of frame) absorbs that
  // without visibly raising the composition.
  const camBot = ctx.camBotPx;
  const h = bottom - top;
  if (!(h > 0)) return 0;
  const lo = safeTop - top;        // below this the block rises out of the top safe area
  const hi = camBot - bottom;      // above this it pushes into the reserved caption band
  // THE TWO BOUNDS CAN CONFLICT. A scene authored from V(150) — above the 10% safe top —
  // whose content is taller than the camera-safe band gives lo > hi: "must move down 42px
  // to respect the top" against "must not move down at all". Clamping naively takes lo and
  // shoves the block INTO the caption reserve, which is how the showcase chip row reached
  // 87.7%. The caption band is a hard reserve and a kicker sitting a little high is
  // harmless, so the bottom bound wins whenever they disagree.
  // GENUINE CONFLICT — the block is taller than the band between the camera-safe top and
  // the camera-safe bottom. Something has to give, and the two failure modes are not
  // equally bad: overrunning the BOTTOM puts content behind the caption pill, which is
  // opaque and drawn above every scene (track 96), so it is hidden. Overrunning the TOP
  // interleaves live text with the pack label and reads as corruption. The top wins.
  if (hi < lo) return Math.round(lo);
  const want = safeTop + (camBot - safeTop - h) / 2;
  return Math.round(clamp(want - top, lo, hi));
}
// `top`/`bottom` are the scene's content extent in authored px. Omit them and the scene
// is positioned exactly as authored (the CTA does this — it centres itself with flexbox).
function open(ctx, top, bottom) {
  ctx.off = (top != null && bottom != null) ? centerOffset(ctx, top, bottom) : 0;
  return `<div class="clip kf-sc" id="${ctx.id}" data-start="${ctx.T}" data-duration="${r(ctx.L)}" data-track-index="${ctx.track}" style="opacity:0;">` +
    `<div class="kf-cam" id="${ctx.id}-cam">` +
    `<div class="kf-fit"${ctx.off ? ` style="transform:translateY(${X(ctx.off)});"` : ""}>`;
}
const close = () => `</div></div></div>`;
// The seam must avoid where the type ACTUALLY lands, so the band is reported post-shift.
const bandOf = (ctx, topPx, fit) => megaBandOf(Vn(topPx + (ctx.off || 0)), fit);

// ...AND "THE TYPE" MEANS EVERYTHING THE SCENE DRAWS, NOT JUST THE MEGA STACK.
//
// `bandOf` reports the mega block alone, and the seam anchors itself at `band.bottom + 3`
// because "below the headline is where this pack's dead space is". It is not: bHook draws
// its chip row at `megaTop + megaH + 78` and its rule below that, and bStatement puts its
// subtext or chips under the type too. So the seam was aimed at the one strip of frame the
// scene was about to fill, and a 150px bar tilted up to 9° landed straight across the pills.
// The QA reviewer reported it as "decorative red bar collides with and runs directly
// behind/through the text pill container", which is exactly what it is.
//
// Every builder ALREADY knows its true extent — it passes it to `open(ctx, top, bottom)` for
// the centring clamp. This reports the same number, so the seam clears the whole composition
// rather than just its loudest part. Callers pass the identical `bottom` they hand `open`.
const bandFull = (ctx, topPx, bottomPx) => {
  const top = Vn(topPx + (ctx.off || 0));
  const bottom = Vn(bottomPx + (ctx.off || 0));
  if (!(bottom > top)) return null;
  return { top, bottom };
};

// HOOK — the opener: a mono kicker, a 3–4 line mega stack, intake chips, a drawn rule.
// Flush-left, tall type. Takes the user's logo as a small mark when one exists.
function bHook(scene, ctx, _assets, logo) {
  const { theme, S, ground } = ctx;
  const ink = theme.onField(ground);
  const mega = megaFit(scene.headline || scene.title || ctx.title, 172, 5, 930);
  const chips = bullets(scene, 3);
  const palette = [ctx.accent, theme.paper, theme.paper];
  const mark = logo && logo.path
    ? `<img data-in="pop" src="${esc(logo.path)}" alt="${esc(safeAlt(logo.alt, "logo"))}" style="${logoFilterCss(logo, ground)}height:${X(70)};width:auto;max-width:${X(300)};object-fit:contain;object-position:left center;display:block;margin-bottom:${X(24)};">`
    : "";
  // FLOW FROM THE TYPE, don't guess around it. The chips and the rule used to sit at
  // fixed V(1150) / V(1330) while the mega stack above them was free to be anywhere from
  // one line to five — so the gap under a short headline was a quarter of the frame, and
  // a full five-line headline at the authored 172px runs to 60.9% and COLLIDES with the
  // chips at 59.9%. (The old megaFit hid that by shrinking almost every headline; with
  // the fit corrected the collision is reachable, so the layout has to follow the type.)
  // megaStack's geometry is exactly lines x size x .86, known here, so both anchors are
  // derived and the composition stays balanced at any headline length.
  const megaTop = 430;
  const megaH = mega.lines.length * mega.size * 0.86 * TSCALE;
  const chipsTop = megaTop + megaH + 78;
  const ruleTop = Math.min(chipsTop + (chips.length ? 168 : 56), ctx.safeBotPx - 40);
  const html = `${open(ctx, 196, ruleTop + 14)}
    <div style="position:absolute;left:${X(80)};right:${X(80)};top:${V(196)};">
      ${mark}${kicker(theme, scene.kicker || S.hookKicker, theme.typeOn(ctx.accent, ground))}
    </div>
    <div style="position:absolute;left:${X(80)};right:${X(70)};top:${V(megaTop)};">
      ${megaStack(theme, mega, { ground, accent: ctx.accent, align: "left" })}
    </div>
    ${chips.length ? `<div style="position:absolute;left:${X(80)};right:${X(80)};top:${V(chipsTop)};display:flex;gap:${X(18)};flex-wrap:wrap;">
      ${chips.map((c, i) => chipHtml(theme, c, palette[i % palette.length])).join("")}
    </div>` : ""}
    <div data-in="draw" style="position:absolute;left:${X(80)};right:${X(80)};top:${V(ruleTop)};height:${X(14)};background:${ink};transform-origin:left center;"></div>
  ${close()}`;
  return { html, band: bandFull(ctx, 196, ruleTop + 14) };
}

// CARDS — three outlined rows, each a colour square + title + note, then a mega statement
// beneath. The problem / how-it-works beat. Rows carry a real thumbnail when the scene
// received imagery, so the deck doubles as feature proof.
function bCards(scene, ctx, sceneAssets) {
  const { theme, S, ground } = ctx;
  const rows = deck(scene, 3);
  const items = rows.length ? rows : bullets(scene, 3).map((t) => ({ title: t, note: "" }));
  const cols = [ctx.accent, theme.ink, ctx.accent];
  const mega = megaFit(scene.emphasis || scene.subtext || scene.headline || "", 126, 3, 910);
  // Rows are a flex column from V(300): each is its badge height (or the 74px glyph) plus
  // 68px of vertical padding, with a 26px gap between. Measured, so the mega below always
  // clears them by the same 86px whether the deck holds one row or three.
  const rowH = (it, i) => {
    const shot = sceneAssets && sceneAssets[i];
    const b = shot && shot.path ? fitBox(shot, { area: 168 * 126, maxW: 210, maxH: 190, minW: 96, minH: 96 }) : null;
    return Math.max(b ? b.h : 74, 74) + 68;
  };
  const megaH2 = mega.lines.length ? mega.lines.length * mega.size * 0.86 * TSCALE : 0;
  const rowsEnd = 300 + (rows.length ? rows : bullets(scene, 3).map((t) => ({ title: t, note: "" })))
    .slice(0, 3).reduce((a, it, i) => a + rowH(it, i) + (i ? 26 : 0), 0);
  const html = `${open(ctx, 196, rowsEnd + 86 + megaH2)}
    <div style="position:absolute;left:${X(80)};right:${X(80)};top:${V(196)};">${kicker(theme, scene.kicker || (/how|process|step|workflow/.test(String(scene.purpose || "").toLowerCase()) ? S.howKicker : S.problemKicker), theme.typeOn(ctx.accent, ground), "right")}</div>
    <div style="position:absolute;left:${X(80)};right:${X(80)};top:${V(300)};display:flex;flex-direction:column;gap:${X(26)};">
      ${items.map((it, i) => {
        const shot = sceneAssets && sceneAssets[i];
        // The badge takes the ASSET'S shape at a constant visual weight, so a wide
        // dashboard becomes a wide plate and a phone capture a tall one — both readable,
        // neither letterboxed into a sliver by a box that was only ever right for 4:3.
        const box = shot && shot.path ? fitBox(shot, { area: 168 * 126, maxW: 210, maxH: 190, minW: 96, minH: 96 }) : null;
        const badge = box
          ? `<div style="width:${X(box.w)};height:${X(box.h)};border-radius:${X(18)};overflow:hidden;flex:none;border:${X(4)} solid ${theme.ink};background:${rgba(cols[i % 3], 0.22)};"><img src="${esc(shot.path)}" alt="${esc(safeAlt(shot.alt))}" style="width:100%;height:100%;object-fit:contain;display:block;"></div>`
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
    ${mega.lines.length ? `<div style="position:absolute;left:${X(80)};right:${X(90)};top:${V(rowsEnd + 86)};">
      ${megaStack(theme, mega, { ground, accent: theme.paper, align: "left" })}
    </div>` : ""}
  ${close()}`;
  return { html, band: bandFull(ctx, 196, rowsEnd + 86 + megaH2) };
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

  let hero, browserH = SHOW_BROWSER.boxH, plan = { frac: 0, natH: 0 };
  if (isPhone) {
    // interior = wrapper − (border 5 + padding 20) × 2 on each axis
    const boxW = SHOW_PHONE.w - 50, boxH = SHOW_PHONE.h - 50;
    plan = scrollPlan(boxW, boxH, asset);
    hero = `<div data-in="pop" style="position:absolute;right:${X(SHOW_PHONE.right)};top:${V(SHOW_PHONE.top)};width:${X(SHOW_PHONE.w)};height:${X(SHOW_PHONE.h)};">
      ${frameHtml(theme, { device, asset, boxW, boxH, tint: ctx.soft, scrollId: plan.frac ? scrollId : null, natH: plan.natH })}
    </div>`;
  } else {
    const boxW = RW - SHOW_BROWSER.left - SHOW_BROWSER.right - 10;
    browserH = windowHeightFor(asset, boxW, SHOW_BROWSER.boxH, 380);
    plan = scrollPlan(boxW, browserH, asset);
    hero = `<div data-in="pop" style="position:absolute;left:${X(SHOW_BROWSER.left)};right:${X(SHOW_BROWSER.right)};top:${V(SHOW_BROWSER.top)};">
      ${frameHtml(theme, { device: "browser", asset, boxW, boxH: browserH, tint: ctx.soft, scrollId: plan.frac ? scrollId : null, natH: plan.natH, address })}
    </div>`;
  }
  // A decorative block carries the off-edge energy; the ASSET container never does.
  // The chips were pinned at V(1520) with a ~430px gap under the wide mega — dead space
  // AND the reason this scene's declared extent (150->1610) exceeded the camera-safe band,
  // which then forced the centring clamp to drag the whole block up into the chrome.
  // Flowed from the type, the same scene fits the band with room to spare.
  // The window is now sized to its capture, so the type below it has to follow — pinned
  // at V(1090) it would leave a 270px hole under a short window. Frame furniture is the
  // 5px border + the ~86px chrome bar + the 5px bottom border.
  const heroBottom = SHOW_BROWSER.top + 96 + browserH;
  const wideMegaTop = Math.max(heroBottom + 84, 700);
  const showChipsTop = megaEnd(wideMegaTop, megaWide) + 74;
  const showBottom = isPhone ? Math.max(SHOW_PHONE.top + SHOW_PHONE.h, 1180 + 280)
    : Math.max(megaEnd(wideMegaTop, megaWide), chips.length ? showChipsTop + 90 : 0);
  const bleed = `<div data-in="pop" style="position:absolute;left:${X(520)};right:${X(-140)};top:${V(170)};height:${X(220)};border-radius:${X(40)} 0 0 ${X(40)};background:${ctx.accent};border:${X(5)} solid ${theme.ink};border-right:none;"></div>`;
  const side = isPhone && second
    ? `<div data-in="pop" style="position:absolute;left:${X(80)};top:${V(1180)};width:${X(370)};height:${X(280)};">${frameHtml(theme, { device: "card", asset: second, tint: ctx.soft })}</div>`
    : "";

  const html = `${open(ctx, isPhone ? 196 : 150, showBottom)}
    ${isPhone ? "" : bleed}
    <div style="position:absolute;left:${X(80)};right:${X(80)};top:${V(isPhone ? 196 : 150)};">${kicker(theme, scene.kicker || S.showcaseKicker, theme.typeOn(ctx.accent, ground))}</div>
    ${isPhone ? `<div style="position:absolute;left:${X(80)};width:${X(520)};top:${V(286)};">${megaStack(theme, megaPhone, { ground, accent: ctx.accent, align: "left" })}</div>` : ""}
    ${hero}${side}
    ${isPhone ? "" : `<div style="position:absolute;left:${X(80)};right:${X(90)};top:${V(wideMegaTop)};">${megaStack(theme, megaWide, { ground, accent: ctx.accent, align: "left" })}</div>`}
    ${chips.length && !isPhone ? `<div style="position:absolute;left:${X(80)};right:${X(80)};top:${V(showChipsTop)};display:flex;gap:${X(16)};flex-wrap:wrap;">
      ${chips.map((c, i) => chipHtml(theme, c, i % 2 ? theme.paper : ctx.accent, 26)).join("")}
    </div>` : ""}
  ${close()}`;
  return { html, scroll: plan.frac ? { id: scrollId, frac: plan.frac, kind: isPhone ? "phone" : "web" } : null , band: bandFull(ctx, isPhone ? 196 : 150, showBottom) };
}

// GALLERY — 2-3 captures at their own ratios, ARRANGED to fill the frame.
//
// The row was the only arrangement, and its geometry started from a WIDTH budget: each
// cell took a share of the 920px safe column proportional to its ratio, and the height
// fell out as w/ratio. In a 9:16 frame with two 16:9 captures that resolves to 450x253
// each — a 253px row in a 1920px frame, 13% of the height for the scene's entire subject,
// with a quarter of the poster empty beneath it. QA blocked it on a live render and was
// right to.
//
// No sizing formula fixes that, because side-by-side is simply the wrong arrangement for
// wide assets in a tall frame. So compute BOTH candidate layouts at the largest size each
// can reach in the space actually available, and keep whichever displays more pixels of
// the user's imagery. For two 16:9 captures the stack wins by ~3.4x; for two tall phone
// captures the row still wins. The layout follows the assets instead of the assets being
// forced into the layout.
// The gap has to CLEAR THE PACK'S HARD SHADOW, which is offset 14px right / 16px down.
// Stacked, a 22px gap left only 6px of daylight, and card one's ink shadow fell across it
// — invisible between two light cards, but two dark captures then read as a single
// collided block (a QA pass called it exactly that). Vertically the gap must beat the 16px
// drop with room to spare; horizontally the 14px offset is already clear at 24.
const GAL_GAP_ROW = 24, GAL_GAP_STACK = 48;
function galleryLayout(shots, availH) {
  const SAFE = RW - 160;
  const qs = shots.map((a) => clamp(ratioOf(a) || 1.4, 0.42, 2.6));
  const n = shots.length;
  const rowGaps = GAL_GAP_ROW * Math.max(0, n - 1);
  const stackGaps = GAL_GAP_STACK * Math.max(0, n - 1);
  const area = (cells) => cells.reduce((t, c) => t + c.w * c.h, 0);

  // ROW — one shared height; widths follow each ratio. Bounded by the safe column and by
  // the vertical room (the label strip rides under the row, hence the reserve).
  const rowH = Math.min((SAFE - rowGaps) / qs.reduce((t, q) => t + q, 0), availH - 46);
  const row = qs.map((q, i) => ({ a: shots[i], w: rowH * q, h: rowH }));

  // STACK — one shared width; heights follow each ratio. Bounded by the vertical room.
  const stackH = qs.reduce((t, q) => t + SAFE / q, 0) + stackGaps;
  const k = Math.min(1, (availH - stackGaps) / Math.max(1, stackH - stackGaps));
  const stack = qs.map((q, i) => ({ a: shots[i], w: SAFE * k, h: (SAFE * k) / q }));

  return area(stack) > area(row)
    ? { mode: "stack", cells: stack, gap: GAL_GAP_STACK, height: stack.reduce((t, c) => t + c.h, 0) + stackGaps }
    : { mode: "row", cells: row, gap: GAL_GAP_ROW, height: rowH + 46 };
}
function bGallery(scene, ctx, sceneAssets) {
  const { theme, S, ground } = ctx;
  const shots = (sceneAssets || []).slice(0, 3);
  const mega = megaFit(scene.headline || scene.title || "", 126, 2, 910);
  const rowTop = megaEnd(250, mega) + 84;
  // The room the imagery actually has: from under the type to the safe bottom, less what
  // the optional supporting sentence needs.
  const availH = Math.max(240, ctx.camBotPx - rowTop - (scene.subtext ? 150 : 24));
  const { mode, cells, gap, height } = galleryLayout(shots, availH);
  const labels = shots.map((a) => displayLabel(a && a.alt));
  const subTop = rowTop + height + 72;
  const subBottom = subTop + (scene.subtext ? 120 : -72);
  const html = `${open(ctx, 170, subBottom)}
    <div style="position:absolute;left:${X(80)};right:${X(80)};top:${V(170)};">${kicker(theme, scene.kicker || S.galleryKicker, theme.typeOn(ctx.accent, ground))}</div>
    <div style="position:absolute;left:${X(80)};right:${X(90)};top:${V(250)};">${megaStack(theme, mega, { ground, accent: ctx.accent, align: "left" })}</div>
    <div style="position:absolute;left:${X(80)};right:${X(80)};top:${V(rowTop)};display:flex;${mode === "stack" ? "flex-direction:column;align-items:center;" : "align-items:flex-end;justify-content:center;"}gap:${X(gap)};">
      ${cells.map((c, i) => `<div data-in="pop" style="flex:none;width:${X(c.w)};">
        <div style="width:100%;height:${X(c.h)};">${frameHtml(theme, { device: "card", asset: c.a, tint: ctx.soft })}</div>
        ${mode === "row" && labels[i] ? `<div style="font-family:${theme.monoStack};font-size:${F(22)};letter-spacing:.14em;text-transform:uppercase;color:${rgba(theme.onField(ground), 0.6)};margin-top:${X(16)};text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(labels[i])}</div>` : ""}
      </div>`).join("")}
    </div>
    ${scene.subtext ? `<div data-in="up" style="position:absolute;left:${X(80)};right:${X(80)};top:${V(subTop)};font-family:${theme.bodyStack};font-weight:500;font-size:${F(fitPx(scene.subtext, 38, 120))};line-height:1.45;color:${rgba(theme.onField(ground), 0.74)};">${esc(scene.subtext)}</div>` : ""}
  ${close()}`;
  return { html, band: bandFull(ctx, 170, subBottom) };
}

// GRID — the 2×2 outlined card deck. Text mode gives each card a colour-block glyph;
// image mode fills the block with a real capture. The features beat.
function bGrid(scene, ctx, sceneAssets) {
  const { theme, S, ground } = ctx;
  const items = deck(scene, 4);
  const cells = (items.length ? items : bullets(scene, 4).map((t) => ({ title: t, note: "" }))).slice(0, 4);
  const bgs = [theme.paper, theme.paper, theme.paper, theme.paper];
  const glyphs = [ctx.accent, theme.ink, ctx.accent, theme.ink];
  const mega = megaFit(scene.headline || scene.title || "", 136, 2, 920);
  // A 2×2 grid holding one or two cards reads as a half-empty page. Below three cells the
  // deck goes SINGLE COLUMN — full-width cards with a taller art strip — so the same
  // builder fills the frame whether the script gave it two bullets or four.
  const oneCol = cells.length <= 2;
  const artH = oneCol ? 240 : 150;
  // THREE cells in a 2x2 leaves a visibly empty quadrant — the "half-empty page" this
  // fallback exists to prevent, one cell higher up. Three is a common deck size (a
  // script's three bullets), so it gets its own answer rather than a hole: the third
  // card spans BOTH columns, closing the grid as a 2-over-1.
  const spanLast = cells.length === 3;
  const deckTop = Math.max(megaEnd(290, mega) + 84, 560);
  // deck height: rows of cards, each art strip + title + padding, plus the gaps
  const deckRows = oneCol ? cells.length : Math.ceil(cells.length / 2) + (spanLast ? 0 : 0);
  const deckH = deckRows * ((cells.some((c, i) => sceneAssets && sceneAssets[i]) ? (oneCol ? 240 : 150) : 88) + 150) + Math.max(0, deckRows - 1) * 26;
  const html = `${open(ctx, 196, deckTop + deckH)}
    <div style="position:absolute;left:${X(80)};right:${X(80)};top:${V(196)};">${kicker(theme, scene.kicker || S.featuresKicker, theme.typeOn(ctx.accent, ground), "center")}</div>
    <div style="position:absolute;left:${X(80)};right:${X(80)};top:${V(290)};">${megaStack(theme, mega, { ground, accent: ctx.accent, align: "center" })}</div>
    <div style="position:absolute;left:${X(80)};right:${X(80)};top:${V(deckTop)};display:grid;grid-template-columns:${oneCol ? "1fr" : "1fr 1fr"};gap:${X(26)};">
      ${cells.map((c, i) => {
        const bg = bgs[i % 4], fg = theme.onField(bg);
        const shot = sceneAssets && sceneAssets[i];
        const art = shot && shot.path
          // The strip's HEIGHT follows the capture. A fixed strip with object-fit:cover
          // centre-cropped every screenshot — on a tall capture that meant showing a band
          // from the middle of a page, header and footer both gone. Contain keeps the
          // whole frame; letting the height track the ratio (clamped so a card cannot run
          // away) means it is contained without a letterbox in the common cases.
          ? (() => {
              const innerW = (spanLast && i === 2 ? 852 : 379);
              const q = clamp(ratioOf(shot) || 1.4, 0.5, 2.6);
              const hh = clamp(innerW / q, spanLast && i === 2 ? 170 : 130, spanLast && i === 2 ? 330 : 300);
              return `<div style="width:100%;height:${X(hh)};border-radius:${X(18)};overflow:hidden;border:${X(4)} solid ${theme.ink};background:${rgba(glyphs[i % 4], 0.18)};"><img src="${esc(shot.path)}" alt="${esc(safeAlt(shot.alt))}" style="width:100%;height:100%;object-fit:contain;display:block;"></div>`;
            })()
          : `<div style="width:${X(88)};height:${X(88)};border-radius:${i % 2 ? "50%" : X(22)};background:${glyphs[i % 4]};"></div>`;
        return `<div class="kf-card" data-in="pop" style="background:${bg};padding:${X(40)} ${X(34)};${spanLast && i === 2 ? "grid-column:1 / -1;" : ""}">
          ${art}
          <div style="font-family:${theme.subStack};font-weight:700;font-size:${F(fitPx(c.title, 50, 18))};line-height:1.04;letter-spacing:-.02em;color:${fg};margin-top:${X(24)};">${esc(c.title)}</div>
          ${c.note ? `<div style="font-family:${theme.bodyStack};font-weight:500;font-size:${F(27)};line-height:1.35;color:${rgba(fg, 0.68)};margin-top:${X(10)};">${esc(c.note)}</div>` : ""}
        </div>`;
      }).join("")}
    </div>
  ${close()}`;
  return { html, band: bandFull(ctx, 196, deckTop + deckH) };
}

// STATS — count-up numerals in outlined plates under a mega headline. The proof beat.
// A capture pinned to this beat rides BELOW the counters in the pack's own card frame —
// a flat poster pack states its imagery in hard-edged blocks, so a dimmed photographic
// wash (the right answer for the softer OM packs) would read as a different design system.
// The card budget drops from three to two to buy the room, so nothing overlaps and the
// band still clears the portrait bottom safe area. With no capture the beat is unchanged.
function bStats(scene, ctx, sceneAssets) {
  const { theme, S, ground } = ctx;
  const asset = (sceneAssets && sceneAssets[0]) || null;
  const stats = pickStats(scene, asset ? 2 : 3, S);
  const mega = megaFit(scene.headline || scene.title || "", 126, 3, 910);
  const cols = [ctx.accent, theme.paper, theme.paper];
  const statsTop = Math.max(megaEnd(280, mega) + 96, 700);
  const statsH = stats.length * 148 + Math.max(0, stats.length - 1) * 24;
  const statsBottom = asset ? Math.max(statsTop + statsH, 1330 + 240) : statsTop + statsH;
  // Two cards end near V(1200); the band below is sized to sit inside the safe area.
  const band = asset
    ? `<div data-in="pop" style="position:absolute;left:${X(80)};right:${X(80)};top:${V(1255)};height:${X(330)};">
      ${frameHtml(theme, { device: "card", asset, tint: ctx.soft })}
    </div>`
    : "";
  const html = `${open(ctx, 196, statsBottom)}
    <div style="position:absolute;left:${X(80)};right:${X(80)};top:${V(196)};">${kicker(theme, scene.kicker || S.statsKicker, theme.typeOn(ctx.accent, ground))}</div>
    <div style="position:absolute;left:${X(80)};right:${X(90)};top:${V(280)};">${megaStack(theme, mega, { ground, accent: ctx.accent, align: "left" })}</div>
    ${band}
    ${stats.length ? `<div style="position:absolute;left:${X(80)};right:${X(80)};top:${V(statsTop)};display:flex;flex-direction:column;gap:${X(24)};">
      ${stats.map((st, i) => {
        const bg = cols[i % 3], fg = theme.onField(bg);
        return `<div class="kf-card" data-in="slide" style="background:${bg};padding:${X(28)} ${X(38)};display:flex;align-items:baseline;gap:${X(24)};">
          <div style="font-family:${theme.displayStack};font-size:${F(92)};line-height:.9;letter-spacing:-.03em;color:${fg};flex:none;">${esc(st.pre)}<span data-count="${st.target}" data-suffix="${esc(st.suf)}">${st.target}${esc(st.suf)}</span></div>
          <div style="font-family:${theme.monoStack};font-size:${F(26)};letter-spacing:.14em;text-transform:uppercase;color:${rgba(fg, 0.66)};min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(st.label)}</div>
        </div>`;
      }).join("")}
    </div>` : ""}
  ${close()}`;
  return { html, band: bandFull(ctx, 196, statsBottom) };
}

// VOICE — the film's only right-aligned composition: a mega quote, a breathing waveform
// and an attribution card. Text-safe (needs no imagery at all).
const WAVE = [22, 54, 88, 40, 100, 62, 30, 76, 46, 92, 34, 68, 24, 82, 44];
// A capture pinned to the quote beat lands as a supporting band beneath the attribution,
// at a real size in the pack's card frame. It is NOT crammed into the attribution avatar:
// that circle is X(74), and a website capture squeezed into a 74px disc is the "tiny asset
// container" failure this pack is meant to avoid — the disc stays a colour mark, and the
// capture gets its own band in the clear space below the card (the quote is right-aligned
// and the wave ends well above it, so the room was already there).
function bVoice(scene, ctx, sceneAssets) {
  const { theme, S, ground } = ctx;
  const asset = (sceneAssets && sceneAssets[0]) || null;
  const mega = megaFit(scene.headline || scene.title || "", 116, 3, 920);
  const attribution = (bullets(scene, 1)[0] || scene.subtext || "").slice(0, 58);
  const waveTop = Math.max(megaEnd(280, mega) + 96, 640);
  const attrTop = waveTop + 260 + 96;
  const voiceBottom = Math.max(attrTop + (attribution ? 150 : -96), asset && asset.path ? 1330 + 240 : 0, waveTop + 260);
  // CAMERA-SAFE BOTTOM. At V(1420) + X(240) this band ended at 86.5% — inside the frame,
  // but the scene rides a 1.07x camera push that scales content away from the focal
  // point, carrying it to 87.6% and 12px INTO the reserved caption band. The static
  // number was right and the moving one was not, which is why nothing caught it. Lifting
  // the band to V(1330) leaves it clear at both ends of the push.
  const band = asset && asset.path
    ? `<div data-in="pop" style="position:absolute;left:${X(80)};right:${X(80)};top:${V(1330)};height:${X(240)};">
      ${frameHtml(theme, { device: "card", asset, tint: ctx.soft })}
    </div>`
    : "";
  const html = `${open(ctx, 196, voiceBottom)}
    ${band}
    <div style="position:absolute;left:${X(80)};right:${X(80)};top:${V(196)};">${kicker(theme, scene.kicker || S.voiceKicker, theme.typeOn(ctx.accent, ground), "right")}</div>
    <div style="position:absolute;left:${X(80)};right:${X(80)};top:${V(280)};">${megaStack(theme, mega, { ground, accent: ctx.accent, align: "right" })}</div>
    <div id="${ctx.id}-wave" style="position:absolute;left:${X(80)};right:${X(80)};top:${V(waveTop)};height:${X(260)};display:flex;align-items:center;justify-content:space-between;gap:${X(8)};">
      ${WAVE.map((h, i) => `<div data-in="bar" style="flex:1;height:${h}%;border-radius:999px;background:${i % 3 === 2 ? ctx.accent : theme.onField(ground)};transform-origin:center center;"></div>`).join("")}
    </div>
    ${attribution ? `<div class="kf-card" data-in="pop" style="position:absolute;left:${X(80)};right:${X(80)};top:${V(attrTop)};padding:${X(32)} ${X(40)};background:${theme.paper};display:flex;align-items:center;gap:${X(26)};">
      <div style="width:${X(74)};height:${X(74)};border-radius:50%;background:${ctx.accent};flex:none;"></div>
      <div style="font-family:${theme.subStack};font-weight:700;font-size:${F(fitPx(attribution, 44, 30))};line-height:1.1;color:${theme.ink};min-width:0;">${esc(attribution)}</div>
    </div>` : ""}
  ${close()}`;
  return { html, band: bandFull(ctx, 196, voiceBottom) };
}

// SWATCH — a full-bleed colour column against a right-hand text block: the brand beat,
// and the one scene that SHOWS the palette the film is wearing. With imagery assigned,
// the column's tiles become real crops instead of flat blocks.
function bSwatch(scene, ctx, sceneAssets) {
  const { theme, S, ground } = ctx;
  const tiles = [ctx.accent, decorTone(ground, 0.12), ctx.accent, theme.paper];
  const mega = megaFit(scene.headline || scene.title || "", 104, 3, 580);
  const chips = bullets(scene, 3);
  const chipCols = [theme.paper, ctx.accent, theme.paper];
  const swatchBottom = Math.max(150 + 4 * 290 + 3 * 24, chips.length ? 1200 + 90 : 0, megaEnd(250, mega));
  // OFF-EDGE BLEED IS FOR DECORATION ONLY. The column is authored to bleed past the left
  // edge (left:-60) — correct for flat colour tiles, wrong the moment a tile holds a user
  // screenshot, which is then both cropped by `cover` AND cut off by the frame. FRAME.md
  // states the rule ("a container holding a user screenshot always stays inside the safe
  // margin") and this was the one place that broke it. A tile carrying imagery pulls back
  // inside the margin and contains rather than crops; empty tiles keep the bleed, so the
  // scene loses none of its graphic edge when there is nothing to protect.
  const anyShot = (sceneAssets || []).some((a) => a && a.path);
  const colLeft = anyShot ? 54 : -60;
  const html = `${open(ctx, 150, swatchBottom)}
    <div style="position:absolute;left:${X(colLeft)};top:${V(150)};width:${X(420)};display:flex;flex-direction:column;gap:${X(24)};">
      ${tiles.map((c, i) => {
        const shot = sceneAssets && sceneAssets[i];
        const inner = shot && shot.path
          ? `<img src="${esc(shot.path)}" alt="${esc(safeAlt(shot.alt))}" style="width:100%;height:100%;object-fit:contain;display:block;">`
          : "";
        const radius = anyShot ? `${X(28)}` : `0 ${X(40)} ${X(40)} 0`;
        return `<div data-in="pop" style="height:${X(290)};border-radius:${radius};background:${shot && shot.path ? rgba(c, 0.22) : c};border:${X(5)} solid ${theme.paper};${anyShot ? "" : "border-left:none;"}overflow:hidden;flex:none;">${inner}</div>`;
      }).join("")}
    </div>
    <div style="position:absolute;left:${X(430)};right:${X(70)};top:${V(170)};">${kicker(theme, scene.kicker || S.brandKicker, theme.typeOn(ctx.accent, ground))}</div>
    <div style="position:absolute;left:${X(430)};right:${X(70)};top:${V(250)};">${megaStack(theme, mega, { ground, accent: theme.paper, align: "left" })}</div>
    ${scene.subtext ? `<div data-in="up" style="position:absolute;left:${X(430)};right:${X(70)};top:${V(780)};font-family:${theme.bodyStack};font-weight:500;font-size:${F(fitPx(scene.subtext, 36, 150))};line-height:1.45;color:${rgba(theme.onField(ground), 0.9)};">${esc(scene.subtext)}</div>` : ""}
    ${chips.length ? `<div style="position:absolute;left:${X(430)};right:${X(70)};top:${V(1200)};display:flex;flex-wrap:wrap;gap:${X(16)};">
      ${chips.map((c, i) => chipHtml(theme, c, chipCols[i % 3], 26)).join("")}
    </div>` : ""}
  ${close()}`;
  return { html, band: bandFull(ctx, 150, swatchBottom) };
}

// LOGOS — the trust wall: a grid of logo/vector marks on outlined plates with the type
// anchored bottom-right and a rule drawing right→left. Only used when real marks exist.
function bLogos(scene, ctx, marks) {
  const { theme, S, ground } = ctx;
  const cells = (marks || []).slice(0, 6);
  const mega = megaFit(scene.headline || scene.title || "", 118, 2, 920);
  const ink = theme.onField(ground);
  const html = `${open(ctx, 200, 1520 + 14)}
    <div style="position:absolute;left:${X(80)};right:${X(80)};top:${V(200)};display:grid;grid-template-columns:1fr 1fr;gap:${X(24)};">
      ${cells.map((m, i) => `<div class="kf-card" data-in="pop" style="height:${X(150)};background:${theme.paper};display:flex;align-items:center;justify-content:center;padding:${X(20)};">
        <img src="${esc(m.path)}" alt="${esc(safeAlt(m.alt, S.logoSlot))}" style="max-width:78%;max-height:68%;object-fit:contain;display:block;">
      </div>`).join("")}
    </div>
    <div style="position:absolute;left:${X(80)};right:${X(80)};top:${V(1130)};">${kicker(theme, scene.kicker || S.trustKicker, theme.typeOn(ctx.accent, ground), "right")}</div>
    <div style="position:absolute;left:${X(80)};right:${X(80)};top:${V(1210)};">${megaStack(theme, mega, { ground, accent: ctx.accent, align: "right" })}</div>
    <div data-in="draw" style="position:absolute;left:${X(400)};right:${X(80)};top:${V(1520)};height:${X(14)};background:${ink};transform-origin:right center;"></div>
  ${close()}`;
  return { html, band: bandFull(ctx, 200, 1520 + 14) };
}

// STATEMENT — the dynamic default: a left mega line with chips or a supporting sentence.
// Carries a single capture in an aspect-routed frame when one was assigned to it.
const STMT = { browserBoxH: 520, phoneW: 420, phoneH: 780 };
function bStatement(scene, ctx, sceneAssets) {
  const { theme, S, ground, address } = ctx;
  const asset = (sceneAssets && sceneAssets[0]) || null;
  const mega = megaFit(scene.headline || scene.title || "", asset ? 128 : 156, asset ? 3 : 5, 930);
  const chips = bullets(scene, 3);
  const chipCols = [ctx.accent, theme.paper, ctx.accent];
  const device = asset ? deviceFor(asset) : null;
  // Resolved BEFORE stmtBottom, which needs it: the extent this scene declares to the
  // centring clamp depends on how tall the window turned out.
  const stmtBrowserH = device === "browser" ? windowHeightFor(asset, RW - 170, STMT.browserBoxH, 320) : STMT.browserBoxH;
  const frameTop = Math.max(megaEnd(320, mega) + 88, 640);
  const stmtBottom = asset ? frameTop + (deviceFor(asset) === "phone" ? STMT.phoneH : deviceFor(asset) === "browser" ? stmtBrowserH + 120 : 560)
    : Math.max(scene.subtext ? frameTop + 40 + 130 : 0, bullets(scene, 3).length ? frameTop + 300 + 90 : 0, megaEnd(320, mega));
  const scrollId = `${ctx.id}-scroll`;
  let frame = "", plan = { frac: 0, natH: 0 };
  if (asset) {
    if (device === "phone") {
      const boxW = STMT.phoneW - 50, boxH = STMT.phoneH - 50;
      plan = scrollPlan(boxW, boxH, asset);
      frame = `<div data-in="pop" style="position:absolute;left:50%;margin-left:${X(-STMT.phoneW / 2)};top:${V(frameTop)};width:${X(STMT.phoneW)};height:${X(STMT.phoneH)};">
        ${frameHtml(theme, { device, asset, boxW, boxH, tint: ctx.soft, scrollId: plan.frac ? scrollId : null, natH: plan.natH })}
      </div>`;
    } else if (device === "browser") {
      const boxW = RW - 160 - 10;
      plan = scrollPlan(boxW, stmtBrowserH, asset);
      frame = `<div data-in="pop" style="position:absolute;left:${X(80)};right:${X(80)};top:${V(frameTop)};">
        ${frameHtml(theme, { device, asset, boxW, boxH: stmtBrowserH, tint: ctx.soft, scrollId: plan.frac ? scrollId : null, natH: plan.natH, address })}
      </div>`;
    } else {
      frame = `<div data-in="pop" style="position:absolute;left:${X(80)};right:${X(80)};top:${V(frameTop)};height:${X(560)};">
        ${frameHtml(theme, { device: "card", asset, tint: ctx.soft })}
      </div>`;
    }
  }
  const html = `${open(ctx, 196, stmtBottom)}
    <div style="position:absolute;left:${X(80)};right:${X(80)};top:${V(196)};">${kicker(theme, scene.kicker || S.showcaseKicker, theme.typeOn(ctx.accent, ground))}</div>
    <div style="position:absolute;left:${X(80)};right:${X(70)};top:${V(320)};">${megaStack(theme, mega, { ground, accent: ctx.accent, align: "left" })}</div>
    ${frame}
    ${!asset && scene.subtext ? `<div data-in="up" style="position:absolute;left:${X(80)};right:${X(80)};top:${V(frameTop + 40)};font-family:${theme.bodyStack};font-weight:500;font-size:${F(fitPx(scene.subtext, 40, 120))};line-height:1.45;color:${rgba(theme.onField(ground), 0.76)};">${esc(scene.subtext)}</div>` : ""}
    ${chips.length && !asset ? `<div style="position:absolute;left:${X(80)};right:${X(80)};top:${V(frameTop + 300)};display:flex;gap:${X(18)};flex-wrap:wrap;">
      ${chips.map((c, i) => chipHtml(theme, c, chipCols[i % 3])).join("")}
    </div>` : ""}
  ${close()}`;
  return { html, scroll: plan.frac ? { id: scrollId, frac: plan.frac, kind: device === "phone" ? "phone" : "web" } : null , band: bandFull(ctx, 196, stmtBottom) };
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
    ? `<img src="${esc(logo.path)}" alt="${esc(safeAlt(logo.alt, "logo"))}" style="${logoFilterCss(logo, theme.paper)}max-width:${X(140)};max-height:${X(140)};object-fit:contain;display:block;">`
    : `<div style="width:${X(76)};height:${X(76)};background:${ctx.accent};border-radius:${X(12)};"></div>`;
  // CENTRED IN THE SAFE AREA, not pinned to a constant. Anchored at V(420) the closing
  // frame ran out of content around 62% and left a quarter of the poster empty — the
  // single worst dead space in the pack, on the one scene a viewer looks at longest.
  // A flex column between the safe insets distributes it by construction: the stack sits
  // optically centred whatever the logo, headline length or tagline turn out to be, and
  // whatever the caption band reserves. Asymmetric emptiness reads as broken; symmetric
  // whitespace reads as designed.
  const html = `${open(ctx)}
    <div style="position:absolute;left:${X(80)};right:${X(80)};top:${ctx.safeTopPct}%;bottom:${ctx.safeBotPct}%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;">
      <div data-in="pop" style="width:${X(190)};height:${X(190)};border-radius:${X(46)};background:${theme.paper};border:${X(6)} solid ${theme.ink};margin:0 auto;display:flex;align-items:center;justify-content:center;overflow:hidden;flex:none;">${mark}</div>
      <div style="margin-top:${X(56)};width:100%;flex:none;">${megaStack(theme, mega, { ground, accent: theme.paper, align: "center" })}</div>
      <div data-in="up" style="font-family:${theme.subStack};font-weight:700;font-size:${F(fitPx(tag, 52, 40))};line-height:1.15;color:${rgba(ink, 0.9)};margin-top:${X(40)};width:100%;flex:none;">${esc(tag)}</div>
      <div data-in="pop" style="margin-top:${X(64)};display:inline-flex;align-items:center;gap:${X(20)};background:${theme.paper};border:${X(6)} solid ${theme.ink};border-radius:999px;padding:${X(26)} ${X(56)};">
        <span style="font-family:${theme.subStack};font-weight:700;font-size:${F(fitPx(btn, 52, 14))};color:${theme.ink};white-space:nowrap;">${esc(btn)}</span>
        <span class="kf-arrow" style="width:${X(28)};height:${X(28)};border-top:${X(7)} solid ${theme.ink};border-right:${X(7)} solid ${theme.ink};display:inline-block;flex:none;"></span>
      </div>
      ${url ? `<div data-in="up" style="font-family:${theme.monoStack};font-size:${F(30)};letter-spacing:.2em;text-transform:uppercase;color:${rgba(ink, 0.85)};margin-top:${X(52)};">${esc(url)}</div>` : ""}
    </div>
  ${close()}`;
  // The CTA is the one beat that fills the whole safe area by construction — a flex column
  // centred between the safe insets — so its occupied band is the safe area itself, and
  // there is no clear strip for the seam to sit in. Reporting the full span is the honest
  // answer: the seam's "no clear band" branch then parks it deliberately rather than
  // dropping a bar across the closing lockup, which is the frame a viewer looks at longest.
  return { html, band: { top: ctx.safeTopPct, bottom: 100 - ctx.safeBotPct } };
}

const BUILDERS = {
  hook: bHook, cards: bCards, showcase: bShowcase, gallery: bGallery, grid: bGrid,
  stats: bStats, voice: bVoice, swatch: bSwatch, logos: bLogos, statement: bStatement, cta: bCta,
};

// ---- motion tuning -----------------------------------------------------------
// ONE PLACE for the film's rhythm. These were scattered literals across the entrance
// builder, the cut loop and the persistent layers, so the pace could not be judged or
// changed as a whole — and it had drifted slow.
//
// What was actually costing the energy, measured on the timeline rather than guessed:
//   • a scene took ~0.70s to reach its finished frame (0.40s tween + 5 mega lines x
//     0.05s stagger). Now ~0.42s.
//   • the seam — the largest moving object on screen — re-anchored over 1.10s, so the
//     one element the eye tracks was always the slowest thing in the frame.
//   • the mid-scene punch sat at 46% of the scene, leaving ~1.6s of nothing but a linear
//     camera crawl between the entrance finishing and anything else happening.
//   • the cut itself ran 0.56s of wipe (0.26 in + 0.30 out) against scene content that
//     had already stopped moving.
//
// Faster does NOT mean snappier-to-the-point-of-jitter: durations come down, the eases
// get more aggressive at the head (expo/power4 out) so motion still decelerates into
// place, and the punch moves earlier so the gap between beats shrinks rather than the
// beats themselves becoming abrupt.
const ANIM = {
  enterDur: 0.30, popDur: 0.34, stagger: 0.035, enterLead: 0.04,
  enterEase: "expo.out", popEase: "back.out(2.1)",
  punchAt: 0.34, punchDur: 0.16, punchBack: 0.26, punchStagger: 0.03,
  wipeIn: 0.20, wipeOut: 0.24, cutLead: 0.40,
  seamSettle: 0.62, seamLead: 0.20,
  camScale: 1.085,
  countDur: 0.62, countLead: 0.18,
  scrollLead: 0.50, scrollTail: 0.75,
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
  const kinds = kindsIn(html);
  for (const k of kinds) {
    if (!FROM[k]) continue;
    const dur = k === "pop" ? ANIM.popDur : ANIM.enterDur;
    const ease = k === "pop" ? ANIM.popEase : ANIM.enterEase;
    // Kinds are offset a HAIR from each other (0.03s apart in emit order) rather than all
    // firing on the same frame. Free variety: the kicker, the mega stack and the chips
    // read as a sequence instead of one simultaneous flash, at no cost in total time.
    const at = r(T + ANIM.enterLead + out.length * 0.03);
    out.push(`tl.fromTo("#${id} [data-in='${k}']",${FROM[k]},{${TO[k]},duration:${dur},ease:"${ease}",stagger:${ANIM.stagger},immediateRender:false},${at});`);
  }
  if (/data-count=/.test(html)) out.push(`count("#${id}",${r(T + ANIM.countLead)},${ANIM.countDur});`);
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
  const SA = safeArea(W, H);
  const capBottom = r(SA.bottom * 38);
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
  const shots = all.filter(shotOk).sort(admission.byDisplayRank);
  const marks = all.filter((a) => markOk(a) && a !== logo).slice(0, 6);

  const baseArch = scenes.map((sc, i) => archetypeFor(sc, i, scenes.length));

  // ANTI-REPETITION — see varyLocal above for why this is pack-local rather than the
  // shared motion_planner helper. `showcase` only joins the pool when real shots exist.
  // Runs BEFORE asset distribution on purpose — a swap changes CAN_SHOW membership, so
  // reordering these would assign shots against a scene list that is about to change.
  // That is also why the profile carries only `deckN`: per-scene shots are not known yet,
  // and the film-wide `shots.length > 0` already gates whether showcase is eligible.
  const swapProfile = scenes.map((sc) => ({ deckN: Math.max(deck(sc, 4).length, bullets(sc, 4).length) }));
  const varied = varyLocal(baseArch, swapProfile, shots.length > 0, scenes.map((s) => s && s.id).join("|"));
  for (let vi = 0; vi < baseArch.length; vi++) baseArch[vi] = varied[vi];
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
    // Capacity-bounded, coverage first. A beat is only offered a shot it can actually draw
    // (see SHOT_CAPACITY) — the counter beat caps at one, so routing a surplus there had
    // the dispatch slice it away after the Creative Director had already paid to fetch,
    // score and assign it. And an uncovered beat outranks a second shot for a covered one:
    // spreading imagery across the film beats stacking it on whichever beat sorted first.
    for (const a of leftovers) {
      const room = (i) => sceneShots[i].length < capacityOf(baseArch[i]);
      let best = displayIdx.find((i) => !sceneShots[i].length && room(i));
      if (best == null) {
        const open = displayIdx.filter(room);
        if (open.length) {
          best = open[0];
          for (const i of open) if (sceneShots[i].length < sceneShots[best].length) best = i;
        }
      }
      if (best == null) continue;   // every display beat full — better unused than discarded
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

  // ONE LEAD ACCENT PER SCENE.
  //
  // Builders each reached into a1/a3/a4 independently, so a single frame could show a
  // vermilion square, a solar chip and a jade chip over an ultramarine ground — four
  // full-strength hues competing for one eye. That is what read as cluttered rather than
  // art-directed; a poster commits to a ground plus ONE accent and lets tone do the rest.
  //
  // Each scene now picks a single accent that genuinely separates from its own ground
  // (>=3:1 so it is also usable as TYPE; >=2.2 as a fallback for shapes). Everything else
  // in the scene draws from paper / ink / a TONE of the ground. Rotating the pick by scene
  // index keeps the film varied across its length while any one frame stays disciplined.
  const accents = grounds.map((g, i) => {
    const strong = theme.a.filter((c) => ratio(c, g) >= 3);
    const usable = strong.length ? strong : theme.a.filter((c) => ratio(c, g) >= 2.2);
    return usable.length ? usable[(satStart + i) % usable.length] : theme.paper;
  });

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
  const bodyParts = [], sceneScripts = [], labels = [], starts = [], durs = [], bands = [];

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
      // The counter beat keeps its identity and takes ONE capture for its band — promoting
      // it to a gallery would trade the proof numbers, which are the point of the scene,
      // for a row of thumbnails.
      else if (arch === "stats" || arch === "voice") sceneAssets = sceneAssets.slice(0, 1);
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

    const fy0 = parseFloat(String(FOCI[i % FOCI.length]).split(" ")[1]) || 46;
    const ctx = {
      id: `s${i + 1}`, T, L, i, isLast: i === scenes.length - 1, track: 10 + i,
      theme, S, ground, address, title,
      // This scene's single lead accent, and a soft matte derived from it. Builders take
      // colour from these plus paper/ink/tone rather than picking accents themselves.
      accent: accents[i], matte: rgba(accents[i], 0.16), soft: decorTone(grounds[i], 0.1),
      // This scene's camera focal point (vertical %), so the centring clamp can solve for
      // where content still lands AFTER the push rather than only at rest.
      focusY: fy0,
      // The safe area as builders need it: percentages for CSS insets, and the bottom as
      // an authored-frame px so a builder flowing content downward (bHook) can clamp
      // against the same boundary the caption band is measured from.
      safeTopPct: r(SA.top * 100), safeBotPct: r(SA.bottom * 100), safeBotPx: (1 - SA.bottom) * RH,
      // THE CAMERA-SAFE BOTTOM — the lowest a scene may place content and still clear the
      // reserved caption band once the push has scaled it away from the focal point:
      //     fy + (safeBottom - fy) / camScale
      // ~82% of the frame for a high focal point, not 87%. Computed once here because two
      // callers need the SAME number: centerOffset clamps against it, and a builder sizing
      // to fill the frame (bGallery) must budget against it. They disagreed once — the
      // gallery sized to 87%, the clamp could not pull it back, and 12 storyboards put
      // content in the caption band. Less CAM_MARGIN, since a builder's declared extent is
      // an estimate (auto-height text counted at nominal heights).
      camBotPx: ((fy0 + ((100 - r(SA.bottom * 100)) - fy0) / ANIM.camScale) / 100) * RH - 34,
      // ...and its mirror at the top. The pack label occupies ~70-96px on a layer that does
      // NOT ride the camera, so scene content must still clear it AFTER the push. Solving
      // `fy + (chromeTop - fy) / camScale` for a 6.5% chrome band gives ~154px at a high
      // focal point and ~220px at a low one, against the flat 138px that let it collide.
      camTopPx: ((fy0 + (6.5 - fy0) / ANIM.camScale) / 100) * RH,
    };
    const built = (BUILDERS[arch] || bStatement)(scene, ctx, arch === "logos" ? marks : sceneAssets, logo);
    bodyParts.push(built.html);
    labels.push(String(scene.kicker || scene.purpose || arch).slice(0, 22));
    starts.push(T); durs.push(L);
    bands.push(built.band || null);   // where this scene's mega type sits — the seam avoids it

    const s = [];
    // The scene reveals EARLY — while the outgoing wipe block still covers the frame — so
    // a cut never shows bare ground. 0.19s, matching the swap window: the wipe covers from
    // T-0.20 and starts leaving at T-0.18, and the old 0.16 was tuned to the slower cut,
    // so with the faster wipe it would have revealed after the block had begun to clear.
    s.push(`tl.set("#${ctx.id}",{opacity:1},${r(Math.max(0, T - 0.19))});`);
    s.push(...enterScript(ctx.id, T, built.html));

    // CAMERA — a continuous push-in / pull-back for the whole scene, alternating so the
    // film never pumps. It rides an INNER wrapper (full-frame, so its percentage y is
    // frame-relative) and that wrapper carries no CSS transform of its own, so GSAP can
    // never overwrite an authored rotation.
    const push = i % 2 === 0;
    s.push(`tl.set("#${ctx.id}-cam",{transformOrigin:"${FOCI[i % FOCI.length]}"},${r(Math.max(0, T - 0.16))});`);
    // A LINEAR camera over the whole scene is imperceptible — it reads as drift, not as a
    // move. power1.out gives it a discernible push at the head (where the entrance is
    // landing, so the two reinforce) and lets it settle, and the travel is a touch wider.
    s.push(`tl.fromTo("#${ctx.id}-cam",{scale:${push ? 1 : ANIM.camScale},y:"${push ? 1.4 : -1.4}%"},{scale:${push ? ANIM.camScale : 1},y:"${push ? -1.4 : 1.4}%",duration:${L},ease:"power1.out",immediateRender:false},${T});`);

    // MID-SCENE BEAT — moved from 46% to 34% of the scene. At 46% a 5s scene finished its
    // entrance around 0.7s and then showed nothing new until 2.3s; pulling the punch
    // forward halves that gap, and the punch itself is quicker so it reads as a snap
    // rather than a wobble. Type is never jittered; only blocks.
    if (/kf-chip|kf-card/.test(built.html)) {
      const punch = r(T + L * ANIM.punchAt);
      s.push(`tl.to("#${ctx.id} .kf-chip, #${ctx.id} .kf-card",{y:-18,rotate:function(k){return k%2?1.2:-1.2;},duration:${ANIM.punchDur},ease:"power2.out",stagger:${ANIM.punchStagger},immediateRender:false},${punch});`);
      // overwrite:"auto" — the settle deliberately catches the kick mid-flight (that
      // overlap IS the back-ease bounce), so it must claim the properties rather than
      // race the outgoing tween for them.
      s.push(`tl.to("#${ctx.id} .kf-chip, #${ctx.id} .kf-card",{y:0,rotate:0,duration:${ANIM.punchBack},ease:"back.out(2.6)",stagger:${ANIM.punchStagger},overwrite:"auto"},${r(punch + 0.14)});`);
      // A SECOND, smaller punch late in a long scene. Anything past ~6s otherwise coasts
      // on the camera alone for its whole back half.
      if (L >= 6) {
        const punch2 = r(T + L * 0.72);
        s.push(`tl.to("#${ctx.id} .kf-chip, #${ctx.id} .kf-card",{y:-9,duration:0.14,ease:"power2.out",stagger:${ANIM.punchStagger},immediateRender:false},${punch2});`);
        s.push(`tl.to("#${ctx.id} .kf-chip, #${ctx.id} .kf-card",{y:0,duration:0.22,ease:"back.out(2.4)",stagger:${ANIM.punchStagger},overwrite:"auto"},${r(punch2 + 0.12)});`);
      }
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
      // Starts sooner and runs longer: the pan used to wait 0.8s and then finish 1.2s
      // early, so a third of the scene showed a STATIC screenshot inside a device frame —
      // the exact "slide, not a demo" impression this scroll exists to avoid. Linear is
      // deliberate here: a real page scroll has no easing.
      const dur = r(Math.max(0.8, L - ANIM.scrollLead - ANIM.scrollTail));
      s.push(`tl.fromTo("#${built.scroll.id}",{yPercent:0},{yPercent:${r(-built.scroll.frac * 100 * win)},duration:${dur},ease:"none",immediateRender:false},${r(T + ANIM.scrollLead)});`);
    }
    if (!ctx.isLast) s.push(`tl.set("#${ctx.id}",{opacity:0},${r(T + L)});`);
    sceneScripts.push(s.join("\n  "));
  });

  // ---- persistent layers ------------------------------------------------------
  // GROUND + halftone dot rain + two drifting blobs. The dot colour flips with the
  // ground's luminance so the texture reads on both paper and saturated fields.
  const bg = `<div id="kf-bg" class="clip" data-start="0" data-duration="${D}" data-track-index="0" data-layout-allow-occlusion style="background:${grounds[0]};">
    <div id="kf-dots" style="position:absolute;inset:0;color:${rgba(theme.onField(grounds[0]), 0.14)};background-image:radial-gradient(currentColor ${X(3.2)},transparent ${X(3.6)});background-size:${X(26)} ${X(26)};"></div>
    <div id="kf-blob1" class="kf-shape" style="width:${X(560)};height:${X(560)};border-radius:50%;left:${X(-200)};top:${V(-110)};background:${decorTone(grounds[0], 0.085)};"></div>
    <div id="kf-blob2" class="kf-shape" style="width:${X(620)};height:${X(620)};border-radius:50%;right:${X(-230)};top:${V(1150)};border:${X(18)} solid ${decorTone(grounds[0], 0.105)};"></div>
  </div>`;

  // CONTINUITY SEAM — the one element that never leaves. It re-anchors and re-angles per
  // scene, travelling THROUGH the cut, which is what stitches the scenes into one film.
  // Positioned at top:0 and driven purely by transform, so its travel is GPU-cheap and
  // its authored angle can never be discarded by a competing CSS transform.
  const SEAM_H = 150, SEAM2_H = 26;
  // THE HOOK HAS NO SEAM. The opener is the one scene whose headline is authored to fill
  // the frame — five lines of mega type across ~38% of it — so there is frequently no
  // clear band for the seam to occupy, and it ends up crossing the very line the film
  // opens on. Measured across 64 storyboards, every unavoidable seam-over-type case was
  // the hook and no other scene.
  //
  // So the seam ARRIVES on the first cut instead of being there from frame one. That also
  // reads better than it sounds: the opener is pure type, and the continuity device
  // entering with the first block wipe gives the cut something to deliver. It is a hard
  // arrival under the covering block, never a fade — the pack does not dissolve.
  //
  // A single-scene film keeps its seam: there is no cut to bring it in, and a title card
  // with no continuity device at all is worse than one that never travels.
  const skipHookSeam = scenes.length > 1;
  const seam = `<div id="kf-seam-clip" class="clip" data-start="0" data-duration="${D}" data-track-index="4" data-layout-allow-occlusion>
    <div id="kf-seam" style="position:absolute;left:-30%;width:160%;height:${X(SEAM_H)};top:0;background:${theme.a2};opacity:${skipHookSeam ? 0 : ".9"};"></div>
    <div id="kf-seam2" style="position:absolute;left:-30%;width:160%;height:${X(SEAM2_H)};top:0;background:${theme.ink};opacity:${skipHookSeam ? 0 : ".5"};"></div>
  </div>`;
  // Seam anchors — a seeded vertical position (in OUTPUT px, so GSAP's `y` is exact),
  // angle, thickness and colour per scene. Kept clear of the reserved caption band.
  // The seam's own vertical span, as a % of the frame: its 150px bar (up to 1.6x scaleY)
  // PLUS the spread its rotation adds across a 160%-wide band. Both are needed — a 9°
  // tilt moves the far end of the bar ~7% of the frame, which is more than the bar itself.
  const SEAM_LO = 18, SEAM_HI = 80;
  const seamAt = scenes.map((_, i) => {
    const band = bands[i];
    const pick = (a, b) => a + rnd() * Math.max(0, b - a);
    // Draw the seam's SHAPE first, because its true vertical reach depends on it. A flat
    // 15% worst-case (max scaleY plus max tilt) was reserving nearly twice the room a
    // shallow, thin seam actually needs, which is why a tall headline so often left "no
    // clear band" and the seam fell back to landing across the type.
    //   bar  = 150 authored px scaled by scaleY, as a % of frame height
    //   tilt = how far a 160%-wide band's ends rise and fall at this angle
    const a = r((rnd() < 0.5 ? -1 : 1) * (3 + rnd() * 6));
    const sy = r(0.5 + rnd() * 1.1);
    const barPct = ((SEAM_H * sy) / RW) * (W / H) * 100;
    const tiltPct = ((1.6 * W * Math.abs(Math.sin((a * Math.PI) / 180))) / H) * 100;
    const SEAM_SPAN = clamp(barPct + tiltPct, 5, 22);
    let crosses = false;   // set when the type could not be cleared at any position
    let yPct = pick(SEAM_LO, SEAM_HI - SEAM_SPAN);
    if (band) {
      // Anchor the seam in CLEAR space. Below the headline is preferred — that is where
      // this pack's dead space is, so the seam does double duty as the element that
      // occupies it. Above is the fallback; if the type spans the whole frame there is
      // no clear band by definition and the seeded position stands.
      const belowFrom = band.bottom + 3, belowTo = SEAM_HI - SEAM_SPAN;
      const aboveTo = band.top - SEAM_SPAN - 3;
      const canBelow = belowFrom <= belowTo, canAbove = aboveTo >= SEAM_LO;
      if (canBelow && canAbove) yPct = rnd() < 0.62 ? pick(belowFrom, belowTo) : pick(SEAM_LO, aboveTo);
      else if (canBelow) yPct = pick(belowFrom, belowTo);
      else if (canAbove) yPct = pick(SEAM_LO, aboveTo);
      else {
        // NO CLEAR BAND — a five-line hook headline can occupy 38% of the frame with the
        // safe area either side of it too tight to hold the seam. Taking the seeded
        // position here meant the one case with no good answer got a RANDOM one, and the
        // seam crossed the headline in ~1 scene in 4. Scan instead and take the least-bad
        // placement: whichever candidate overlaps the type least, ties going lower (the
        // dead space is below). Deterministic — no rnd() consumed.
        let best = SEAM_LO, bestOv = Infinity;
        for (let y = SEAM_LO; y <= SEAM_HI - SEAM_SPAN; y += 1) {
          const ov = Math.max(0, Math.min(band.bottom, y + SEAM_SPAN) - Math.max(band.top, y));
          if (ov < bestOv - 0.01) { bestOv = ov; best = y; }
        }
        yPct = best;
        crosses = bestOv > 0.5;
      }
    }
    // COLOUR vs the scene's own GROUND. The pick was a flat 1-of-4, so the seam could
    // land on the accent the ground already is — on the yellow a3 field it simply
    // vanished. Only accents that actually separate from this ground are eligible; if
    // none do (a brand collapsed to one hue), the ink reads on every field by
    // construction.
    // When the type could not be avoided, the seam must also clear the TEXT that will sit
    // over it — a decorative band is never worth an unreadable headline. Large-text floor
    // (3:1), the same one typeOn enforces everywhere else in the pack.
    const overType = theme.onField(grounds[i]);
    let pool = [theme.a2, theme.a1, theme.a3, theme.a4].filter((c) => ratio(c, grounds[i]) >= 1.6);
    if (crosses) {
      const safe = pool.filter((c) => ratio(overType, c) >= 3);
      pool = safe.length ? safe : [grounds[i] === theme.paper ? theme.ink : theme.paper].filter((c) => ratio(overType, c) >= 3);
    }
    const c = pool.length ? pool[Math.floor(rnd() * pool.length)] : decorTone(grounds[i], 0.12);
    return { y: r((yPct / 100) * H), a, sy, c, drift: r((rnd() < 0.5 ? -1 : 1) * H * 0.014) };
  });

  const wipe = `<div id="kf-wipe-clip" class="clip" data-start="0" data-duration="${D}" data-track-index="90" data-layout-allow-occlusion style="pointer-events:none;">
    <div id="kf-wipe" style="position:absolute;left:-10%;right:-10%;top:-12%;bottom:-12%;background:${theme.a1};"></div>
  </div>`;

  // GRAIN — a 4px repeating radial gradient (not an image, not a canvas), static so it
  // costs the timeline nothing and can never desync from a seeked capture.
  const grain = `<div id="kf-grain" class="clip" data-start="0" data-duration="${D}" data-track-index="92" data-layout-allow-occlusion style="pointer-events:none;opacity:.14;mix-blend-mode:multiply;background-image:radial-gradient(${rgba(theme.ink, 0.7)} 1px,transparent 1.4px);background-size:4px 4px;"></div>`;

  // NO PROGRESS RAIL — see film_stage.js. `#kf-prog` ran the width of the frame for the whole
  // film and even re-tinted itself on every cut so the rail stayed legible against each new
  // palette; all of that effort went into a scrubber the viewer never asked for. The chrome
  // layer stays for the scene label. Guarded by `npm run test:no-playback-chrome`.
  const chrome = `<div id="kf-chrome" class="clip" data-start="0" data-duration="${D}" data-track-index="94" data-layout-allow-occlusion style="pointer-events:none;">
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
  // Ambient shapes and the progress rule follow the SCENE, so a decorative disc is always
  // a tone of the field it sits on rather than a fixed accent dropped onto whatever ground
  // happens to be there. Swapped under the wipe with the ground, so the change is unseen.
  var decA=${JSON.stringify(grounds.map((g) => decorTone(g, 0.085)))};
  var decB=${JSON.stringify(grounds.map((g) => decorTone(g, 0.105)))};
  // ...AND THE SHAPES THEMSELVES MOVE, not only their tone.
  //
  // The two discs are declared once in the markup at a fixed corner each and then only ever
  // RECOLOURED at a cut. Their one motion is a slow global yoyo (see below), which travels a
  // few percent over several seconds — so on a 3.5s beat they are, to the eye, in exactly the
  // same place in every scene of the film. A QA reviewer comparing two text beats seven
  // seconds apart reported "identical background layout, grid, and corner shapes", and it was
  // literally true: the only thing that had changed was the words.
  //
  // Each scene now gets its own placement and size, set under the wipe alongside the colour
  // swap, so the change is unseen and the set reads as re-dressed between beats. Deterministic
  // (seeded per job), and expressed as TRANSFORMS — xPercent/yPercent/scale — which compose
  // with the ambient yoyo's x/y/rotate instead of fighting it, and keep the discs off the
  // layout properties the motion-safety guard forbids animating.
  var blobA=${JSON.stringify(scenes.map(() => ({
    xp: r(-18 + rnd() * 42), yp: r(-14 + rnd() * 30), s: r(0.74 + rnd() * 0.62),
  })))};
  var blobB=${JSON.stringify(scenes.map(() => ({
    xp: r(-26 + rnd() * 34), yp: r(-22 + rnd() * 26), s: r(0.72 + rnd() * 0.7),
  })))};
  var progs=${JSON.stringify(grounds.map((g, i) => accents[i]))};
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

  // Scene 1's own dressing, parked before the timeline runs so the opener is placed by the
  // same rule as every later beat rather than sitting at the markup's default.
  gsap.set("#kf-blob1",{xPercent:blobA[0].xp,yPercent:blobA[0].yp,scale:blobA[0].s});
  gsap.set("#kf-blob2",{xPercent:blobB[0].xp,yPercent:blobB[0].yp,scale:blobB[0].s});
  // Blobs drift for the whole film on finite yoyos (the source used CSS keyframes, which
  // a frame-capturing renderer cannot reproduce deterministically).
  tl.to("#kf-blob1",{y:"-6%",x:"3%",rotate:7,duration:5.5,ease:"sine.inOut",yoyo:true,repeat:${yoyoReps(D, 5.5)},immediateRender:false},0);
  tl.to("#kf-blob2",{y:"5%",x:"-4%",rotate:-9,duration:6.5,ease:"sine.inOut",yoyo:true,repeat:${yoyoReps(D, 6.5)},immediateRender:false},0);

  for(var i=0;i<starts.length;i++){
    var at=starts[i],L=durs[i],sm=seams[i],push=(i%2===0);
    // SEAM — eases to this scene's anchor over the first second, then keeps creeping, so
    // it is always in motion and always continuous with the last cut.
    tl.to("#kf-seam",{y:sm.y,rotate:sm.a,scaleY:sm.sy,backgroundColor:sm.c,duration:${ANIM.seamSettle},ease:"expo.out"},Math.max(0,at-${ANIM.seamLead}));
    tl.to("#kf-seam",{y:sm.y+(push?-sm.drift:sm.drift),duration:Math.max(0.3,L-${ANIM.seamSettle}),ease:"sine.inOut"},at+${r(ANIM.seamSettle - 0.14)});
    tl.to("#kf-seam2",{y:sm.y+${r(H * 0.055)},rotate:sm.a,duration:${ANIM.seamSettle},ease:"expo.out"},Math.max(0,at-${r(ANIM.seamLead - 0.06)}));
    tl.to("#kf-seam2",{y:sm.y+${r(H * 0.055)}+(push?-sm.drift:sm.drift)*1.3,duration:Math.max(0.3,L-${ANIM.seamSettle}),ease:"sine.inOut"},at+${r(ANIM.seamSettle - 0.08)});

    // CUT — a hard block wipe entering from a rotating edge. The ground swaps while the
    // block FULLY covers the frame, so the colour change is never seen as a jerk: you
    // only ever see the block move. Never a dissolve.
    if(i<starts.length-1){
      var cut=at+L-${ANIM.cutLead},nx=i+1;
      tl.set("#kf-wipe",{backgroundColor:grounds[nx]},cut);
      tl.fromTo("#kf-wipe",{x:0,y:0,xPercent:dIn[dirs[i]].xPercent,yPercent:dIn[dirs[i]].yPercent},{xPercent:0,yPercent:0,duration:${ANIM.wipeIn},ease:"power3.in",immediateRender:false},cut);
      tl.set("#kf-bg",{backgroundColor:grounds[nx]},cut+0.21);
      tl.set("#kf-dots",{color:dots[nx]},cut+0.21);
      tl.set("#kf-blob1",{backgroundColor:decA[nx],xPercent:blobA[nx].xp,yPercent:blobA[nx].yp,scale:blobA[nx].s},cut+0.21);
      tl.set("#kf-blob2",{borderColor:decB[nx],xPercent:blobB[nx].xp,yPercent:blobB[nx].yp,scale:blobB[nx].s},cut+0.21);
      // The seam joins the film on the FIRST cut — set, not tweened, inside the same
      // under-cover window as the ground swap, so it is simply there when the block
      // clears. Its scene-1 anchor tween has already started by this point (it fires at
      // start-0.20), so it arrives mid-travel rather than parked.
      ${skipHookSeam ? `if(i===0){tl.set("#kf-seam",{opacity:0.9},cut+0.21);tl.set("#kf-seam2",{opacity:0.5},cut+0.21);}` : ""}
      // power3.in on the way in, power3.out on the way out — the block ACCELERATES into
      // frame and DECELERATES away, so a 0.44s cut reads harder than the old 0.56s one
      // that eased at both ends and felt like a slide.
      tl.to("#kf-wipe",{xPercent:dOut[dirs[i]].xPercent,yPercent:dOut[dirs[i]].yPercent,duration:${ANIM.wipeOut},ease:"power3.out",overwrite:"auto"},cut+0.22);
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
    var si=0; while(si<starts.length-1&&now+0.19>=starts[si+1])si++;
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
  /* Static optical-centring shift. Separate from .kf-cam because that element's transform
     is owned by the camera tween — a static offset written there would be overwritten on
     the tween's first frame. */
  .kf-fit { position:absolute; inset:0; }
  /* Ambient geometry — FLAT, never blurred. These were two blur(58cqw) radial blobs,
     which is precisely the "gradients-as-mood" this pack's own manifest and FRAME.md
     rule out ("NO glass, NO bloom, NO gradients-as-mood"); on the saturated CTA field
     they turned a flat poster into soft gradient wallpaper. A solid disc bleeding off
     one edge and an ink-weight outlined ring off the other keep the ambient colour and
     the drift while staying inside the pack's hard-edged vocabulary — and the ring sits
     low on purpose, where the composition's dead space is. */
  .kf-shape { position:absolute; will-change:transform; }
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
