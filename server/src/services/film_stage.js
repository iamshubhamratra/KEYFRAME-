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
const { advanceEm, hasMetrics } = require("../fonts/font_metrics");
const { isTrustedProminent, isLogo, categorize } = require("./asset_priority");
const admission = require("./asset_admission");
const { resolveBrand } = require("./brand_kit");
const { safeArea } = require("./responsive");
const { GSAP_CDN, r, esc, hexToRgb, bullets } = require("./composer_kit");
const { tempoOf } = require("./pacing");
const { varyArchetypes } = require("./motion_planner");

// THE ENGINE REVISION, STAMPED INTO EVERY COMPOSITION (data-fk-rev on #root).
//
// Bump this on any visually meaningful engine change. It exists because of job haery2z35t: a
// film composed by a SERVER PROCESS whose require cache predated the fidelity fixes shipped that
// afternoon — the output looked like the old engine because it WAS the old engine, and proving
// that took a forensic diff of emitted-script idioms. With the stamp, `grep data-fk-rev
// jobs/<id>/index.html` answers "which engine built this?" in one line. A deliberate constant
// (never a file mtime or date): compositions must stay byte-identical across checkouts for the
// golden baseline.
// 1 = pre-fidelity · 2 = FILMKIT-FIDELITY-AUDIT fixes · 3 = provenance-gated brand address
// 4 = PHASE-2 strict-parity pass: measured font metrics replace the per-skin average advance
//     (fixes wrap-shape divergence + edge clipping), exact-wrap growth guard, labels fitted rather
//     than amputated, ghost "Metric" placeholders removed, grouped thousands in counters,
//     per-beat badge icon variants
// 5 = PHASE-2 second pass: mechanics split evenly with the native layouts per archetype family
//     (rev 4 handed a pack either all walls or all mechanics), the beat plan is named in the
//     markup (`data-fk-beat`), Toggle's per-variant timing windows, and the display face is
//     bundled with the optical-size axis the design asked for
const ENGINE_REV = 5;

// ---- geometry ----------------------------------------------------------------
// The AUTHORED reference frame — every FilmKit template is 1080×1920 (cfg.W/cfg.H) and
// every measurement in the source is a raw pixel against it. Expressed here as a fraction
// of the frame so the compositions keep their exact proportions at any output size.
//   X() — sizes, gaps, borders and every HEIGHT (cqw is always definite, so a box never
//         collapses the way a percentage height inside an auto-height parent does)
//   V() — vertical POSITION only, on a full-frame absolute layer
// THE AUTHORED STAGE IS THE SKIN'S, NOT THE OUTPUT'S.
//
// These were `const RW = 1080, RH = 1920` because every FilmKit template was portrait. They are
// now set per build from `skin.stage` so the family can also author LANDSCAPE templates, and the
// distinction that makes that safe is worth stating: RW/RH describe the frame the skin's own
// pixel numbers were measured against, NOT the frame the film is being rendered into. A
// portrait skin asked for a 1920x1080 render still keeps RW=1080 — it is laid out for portrait
// and merely being shown wide, which is the case frameSelectorAgent discloses rather than
// silently rescaling.
//
// Mutable-per-build, exactly like TSCALE below, and safe for the same reason: build() is fully
// synchronous, so two builds can never interleave. (services/templates/media.js additionally
// serialises its builds behind a single-slot gate for this reason.)
let RW = 1080, RH = 1920;
const X = (px) => `${r((Number(px) / RW) * 100)}cqw`;
const V = (px) => `${r((Number(px) / RH) * 100)}%`;
// Is the AUTHORED stage landscape? Read by film_beats to choose its wide layouts. Never asks
// about the output frame — a portrait skin stays portrait however it is rendered.
const isWide = () => RW > RH;

// Type scale keyed on the SHORT side (responsive.typeScale's law) so a landscape render
// does not blow the display type up. Portrait — the authored aspect — resolves to 1.
// Set once per build; build() is fully synchronous so this can never interleave.
let TSCALE = 1;
const F = (px) => X(Number(px) * TSCALE);

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

// The two authored stages this family supports. A skin declares one via `SKIN.stage`; anything
// else (including undefined, which is every shipped skin) is portrait.
const STAGES = { portrait: { w: 1080, h: 1920 }, landscape: { w: 1920, h: 1080 } };
function setStage(name) {
  const s = STAGES[String(name || "portrait")] || STAGES.portrait;
  RW = s.w; RH = s.h;
}

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
  // `min` is the readability floor. 3 (the default) is right for body text; DISPLAY type gets a
  // laxer 2.0 from the beats, because the guard exists to catch invisible ink (cat-nap's
  // dark-on-dark sat near ratio 1.1), not to overrule a designed pairing: ember-roast's CTA sets
  // cream on ember orange at ratio 2.9, and flooring that at 3 repainted the pack's two-tone
  // signature as monochrome ink — a fidelity loss the reference never shipped.
  const typeOn = (hex, bg, min = 3) => (ratio(hex, bg) >= min ? hex : onField(bg));

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

// THE SUFFIX IS PART OF THE NUMBER. The old pattern's suffix set (`%|x|+|k|m|bn?`) did not know
// unit words, and its lookahead only rejected LETTERS — so "340kg" backtracked to "34" (the "0"
// after "34" is not a letter), shipping a mangled figure with a mangled label ("0kg roasted…").
// Measured on the ember-roast fidelity deck: the stats beat's 340kg rendered as a "34" counter,
// and the Ring mechanic showed "32% / Metric" — three defects from one regex. Now: an ATTACHED
// run of 1–3 letters is the unit (kg, hrs, GB), the %-class may float a space, and the lookahead
// rejects digits too, which is what forces the full digit run to match.
const STAT_RE = /([$₹€£]?)\s?(\d[\d,]*(?:\.\d+)?)(?:\s?(%|x|\+)|([a-z]{1,3}))?(?![A-Za-z0-9])/i;
const statSuffix = (m) => m[3] || m[4] || "";
// KEEP LOOKING. This committed to the FIRST field containing any digit and then gave up if
// that field's number was not STAT_RE-shaped — so a scene reading
//   emphasis "6h" · subtext "92% still use it after a year, rated 4.9 out of 5"
// found nothing at all: "6h" holds a digit so it won the search, and STAT_RE rejects it
// (`h` is not in the suffix set, and a digit followed by a letter is excluded), while the 92%
// sitting in the very next field was never tried. bStats then filled the gap with a
// hardcoded "100% / Metric" — which is how the shared pack-media fixture, whose stat scene
// is exactly that shape, put an invented statistic on EVERY FilmKit pack's poster.
// Try each candidate in priority order and take the first that actually parses.
// THE REFERENCE PRINTS "1,290m", NOT "1290m".
//
// Parsing strips thousands separators to get a number (`replace(/,/g,"")`), and the beats then
// re-emitted that bare integer — so a four-figure statistic lost its grouping and read as a part
// number. The count-up needs the plain number; the DISPLAY needs the grouping back. Locale-free on
// purpose: the films are authored in en-US grouping and the composition must stay byte-identical
// across machines, so this must never consult the host locale.
function groupNum(n) {
  const v = Math.round(Number(n) || 0);
  const s = String(Math.abs(v));
  if (s.length < 4) return (v < 0 ? "-" : "") + s;
  let out = "";
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += ",";
    out += s[i];
  }
  return (v < 0 ? "-" : "") + out;
}

function pickNumber(scene) {
  const cands = [scene.emphasis, scene.subtext, scene.headline, ...(Array.isArray(scene.onScreenText) ? scene.onScreenText : [])]
    .map((x) => String(x || "")).filter((x) => /\d/.test(x));
  for (const src of cands) {
    const m = STAT_RE.exec(src);
    if (!m) continue;
    const target = Math.round(parseFloat(m[2].replace(/,/g, "")));
    if (!isFinite(target)) continue;
    return { pre: m[1] || "", target: clamp(target, 0, 100000), suf: statSuffix(m) };
  }
  return null;
}
// Shorten to a WORD boundary, and say so when something was dropped — a bare slice cuts
// mid-word and reads as a rendering fault rather than an abbreviation.
// FIT THE LABEL, DO NOT AMPUTATE IT.
//
// This capped every label at 28 characters and appended an ellipsis, so the reference's
// "hiding spots nobody has found" shipped as "hiding spots nobody has…" — measured in 38 of 48
// audited packs, the second-most-common divergence in the library. An ellipsis is a rendering
// failure the viewer can read: it says the film had more to say and the engine would not carry it.
//
// The cap is now generous enough that authored label copy passes through whole (the reference's own
// labels top out in the thirties), and the beats that draw labels already bound them with a real
// measure — `max-width` plus the CSS ellipsis as the last-resort net, or the line fitter. Truncation
// only happens for genuinely runaway strings, which is what the net is for.
const LABEL_MAX = 56;
function shortLabel(text, max = LABEL_MAX) {
  const s = String(text || "").replace(/\s+/g, " ").trim();
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
        pre: m[1] || "", target: Math.round(parseFloat(m[2].replace(/,/g, ""))), suf: statSuffix(m),
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
// LETTER-SPACING IS PART OF THE WIDTH. `em` is the face's average glyph advance, but a skin
// also tracks its display type (`titleSpace`, 0 to 0.05em across the 89 FilmKit skins) and that
// tracking is added to EVERY character. Leaving it out of the model understates the line by
// exactly the tracking ratio, so the size this function returns as "what the column holds" does
// not hold it. Measured on job o9q96ik3ra (tube-and-glow, Monoton at em 0.78 + titleSpace
// 0.05em): the headline "CREATORS" needed 658px in a 624px column — 5.4% over, almost exactly
// the 6.4% the tracking adds — and the stylesheet's overflow-wrap:anywhere safety net did what
// it is there for and broke the word, leaving an orphaned "S" on its own line.
//
// The net is not the bug; being handed a size that cannot fit is. Callers pass `track` in em.
const trackEm = (v) => { const m = /^\s*(-?\.?\d*\.?\d+)\s*em\s*$/.exec(String(v == null ? "" : v)); return m ? Number(m[1]) : 0; };
// THE REFERENCE WRAPS; IT DOES NOT SHRINK.
//
// film-kit.js sets the authored size (126/152/160px) and lets CSS wrap the line — "FIRST CRACK"
// at 126px becomes two stacked slabs, which is the poster look the whole family is built on.
// This function used to do the opposite: it kept each authored line UNWRAPPED and scaled the
// block down to the widest one, so every long headline rendered one-line and visibly smaller
// than the design (measured on the ember-roast fidelity deck: Hook ~100px vs the authored 126,
// Statement flattened from four slab lines to two small ones).
//
// Now the authored size is tried FIRST: each logical line (an authored `|` break, or the whole
// text) wraps by the advance model into as many physical lines as it needs. Only when the wrapped
// block exceeds `maxLines` — dynamic copy is unbounded, the reference decks were not — or a
// single word cannot fit the column does the size binary-search down to the largest size that
// fits. `groups` maps each physical line back to its logical line so the FilmKit signature (the
// SECOND logical line takes the accent) survives wrapping: a continuation of line 1 stays fg.
function fitLines(text, { basePx, growPx = 0, maxLines, colPx, em, upper, track = 0, family = null }) {
  const src = upper ? String(text || "").toUpperCase() : String(text || "");
  const forced = forcedLines(src);
  // MEASURED WIDTHS, NOT ONE AVERAGE PER SKIN.
  //
  // This modelled every character as `skin.em` — a single hand-tuned average advance. A single
  // average cannot predict a real wrap point: in Anton "I" is ~0.24em and "W" ~0.90em, so narrow
  // copy is over-measured (the fitter breaks early and the reference's two lines become three)
  // and wide copy is under-measured (the line overflows and clips the frame). Measured against
  // the real font bytes, 64 of 105 skins' `em` were off by more than 10% — worst Unbounded at
  // 0.52 declared vs 0.833 real (-38%, guaranteed overflow) and Big Shoulders Display at 0.41 vs
  // 0.346 (+18%, breaks early). That one approximation was the root cause of the library's two
  // largest fidelity buckets: wrap-shape divergence in 37 of 48 audited packs and edge-clipping
  // in 18. src/fonts/font_metrics.js now carries the browser's own per-character advances for
  // every bundled face (see scripts/gen-font-metrics.js).
  //
  // `em` survives as the fallback for an unbundled family and for wide scripts, which have no
  // latin metrics and keep their CJK/Indic floor. Tracking is added per character either way;
  // clamped at zero from below, because modelling negative tracking would let the fitter choose a
  // LARGER size on the strength of kerning it cannot verify.
  const wide = WIDE_SCRIPT.test(src);
  const trk = Math.max(0, Number(track) || 0);
  const measured = !wide && !!family && hasMetrics(family);
  // The safety margin existed to absorb the model's own error. With real widths 1% is enough, and
  // the reclaimed 2% is exactly the room a correctly-measured line needs to stay on one line.
  const col = colPx * (measured ? 0.99 : 0.97);
  const per = (wide ? Math.max(em, 1.05) : em) + trk;
  const advance = measured
    ? (s) => advanceEm(s, family, { track: trk, avg: em }) || 1
    : (s) => { let a = 0; for (const ch of String(s)) a += ch === " " ? per * 0.4 : per; return a || 1; };
  const spaceAdv = measured ? (advanceEm(" ", family, { track: trk, avg: em }) || per * 0.4) : per * 0.4;
  const logical = forced || (wordsOf(src).length ? [src.replace(/\s+/g, " ").trim()] : []);
  if (!logical.length) return { lines: [], groups: [], size: basePx, forced: false };
  // Greedy wrap of ONE logical line at a given size, by the same advance model the fitter
  // measures with — so what is wrapped here is exactly what fits there.
  const wrap = (line, px) => {
    const cap = col / px;                                  // em units available per line
    const words = wordsOf(line);
    const out = []; let cur = "", curA = 0;
    for (const w of words) {
      const wA = advance(w);
      if (cur && curA + spaceAdv + wA > cap) { out.push(cur); cur = w; curA = wA; }
      else if (cur) { cur += " " + w; curA += spaceAdv + wA; }
      else { cur = w; curA = wA; }
    }
    if (cur) out.push(cur);
    return out;
  };
  const layout = (px) => {
    const lines = [], groups = [];
    for (let g = 0; g < logical.length; g++) {
      for (const ln of wrap(logical[g], px)) { lines.push(ln); groups.push(g); }
    }
    return { lines, groups };
  };
  const fits = (px) => {
    const L = layout(px);
    return L.lines.length <= maxLines && L.lines.every((ln) => advance(ln) * px <= col);
  };
  let size = basePx;
  if (!fits(size)) {
    let lo = basePx * 0.3, hi = basePx;
    for (let i = 0; i < 12; i++) { const mid = (lo + hi) / 2; if (fits(mid)) lo = mid; else hi = mid; }
    size = lo;
  } else if (growPx > basePx) {
    // SOLO GROWTH MUST NOT RE-WRAP. soloSize's ceiling exists to stop short copy floating in an
    // empty frame — but growing past the point where a line breaks differently trades the
    // authored layout for a taller tower of fragments.
    //
    // The guard compares the WHOLE LINE ARRAY, not just its length. Equal line COUNT is not equal
    // wrap: "GAME MASTER / CHECKLIST." and "GAME / MASTER CHECKLIST." are both two lines and only
    // one of them is the reference's shape, and that redistribution is exactly what the audit
    // reported as broken wrap. Grow only while every line stays character-identical to the
    // authored-size layout; copy that would re-flow keeps the authored size, which is what the
    // reference renders anyway (its Title does no fitting at all — it sets the authored size and
    // lets CSS wrap).
    const base = layout(size);
    const same = (a, b) => a.length === b.length && a.every((ln, i) => ln === b[i]);
    const ok = (px) => { const L2 = layout(px); return same(L2.lines, base.lines) && L2.lines.every((ln) => advance(ln) * px <= col); };
    if (ok(growPx)) size = growPx;
    else {
      let lo = size, hi = growPx;
      for (let i = 0; i < 12; i++) { const mid = (lo + hi) / 2; if (ok(mid)) lo = mid; else hi = mid; }
      size = lo;
    }
  }
  const L = layout(size);
  return { lines: L.lines, groups: L.groups, size, forced: !!forced };
}
// The advance of one string in em, in a SKIN's display face — real measured widths when the face
// is bundled, the skin's average otherwise. For the beats that set text `nowrap` (the Morph word)
// and must therefore size by what actually fits rather than by a character count.
function advanceOf(text, skin) {
  const fam = skin && skin.display;
  const em = (skin && skin.em) || 0.6;
  const trk = trackEm(skin && skin.titleSpace);
  if (fam && hasMetrics(fam) && !WIDE_SCRIPT.test(String(text || ""))) {
    return advanceEm(text, fam, { track: trk, avg: em });
  }
  return String(text || "").length * (em + trk);
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
// Storage/CDN hosts AND stock-media providers. The stock set was missing, so a prompt-only film
// whose assets all came from providers put "pixabay.com" in the browser chrome and under the CTA
// button as if it were the advertiser's address (shipped on job haery2z35t). A provider's domain
// is never the address anyone should type.
const NOT_A_BRAND_HOST = /(^|\.)(blob\.[a-z0-9-]+-storage\.com|s3[.-][a-z0-9-]*\.amazonaws\.com|amazonaws\.com|cloudfront\.net|akamaized\.net|fastly\.net|cdn\.[a-z0-9-]+\.[a-z]+|googleusercontent\.com|githubusercontent\.com|imgix\.net|cloudinary\.com|wp\.com|shopifycdn\.com|squarespace-cdn\.com|typekit\.net|gstatic\.com|pixabay\.com|pexels\.com|unsplash\.com|openverse\.org|wikimedia\.org|wikipedia\.org|staticflickr\.com|flickr\.com|freesound\.org)$/i;
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
    // PROVENANCE, NOT A HOST LIST. Only OWNED material — the job's own site captures and the
    // user's uploads — can nominate the brand's address. A stock asset's sourceUrl names its
    // provider, and the blocklist below can never enumerate every provider: pixabay.com shipped
    // as a CTA address on haery2z35t, then stocksnap.io (via openverse) on the very next
    // confirmation run. The host list stays as a second net for owned-asset URLs that point at
    // CDNs.
    const src = String((a && a.source) || "").toLowerCase();
    if (src !== "website" && src !== "upload") continue;
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
// TREATMENT — `scene.treatment`, the one thing a storyboard scene may ask this template for.
// The vocabulary, the normalizer and the rationale live in services/treatments.js; the router
// below is where an ask is granted, and the pack's own `variants` is the only gate.
const { normalizeTreatment } = require("./treatments");

function archetypeFor(scene, i, total) {
  const k = String(scene.kind || "").toLowerCase();
  const p = String(scene.purpose || "").toLowerCase();
  // The opener and the closer are structural, not editorial — a scene cannot ask to be neither.
  if (i === 0 || k === "hook" || k === "title" || /hook|intro|open/.test(p)) return "hook";
  if (i === total - 1 || k === "cta" || /cta|close|outro|sign\s*up|subscribe|download|get\s*started/.test(p)) return "cta";
  // A native treatment names the beat directly, which is the whole point of the field: it is the
  // only thing that can tell a montage wall apart from a scroll list on identical copy.
  const want = normalizeTreatment(scene.treatment, null);
  if (want && want.kind === "native" && want.name !== "hook" && want.name !== "cta") return want.name;
  if (k === "stat" || k === "chart" || k === "countdown" || (pickNumber(scene) && /proof|result|metric|stat|number|data/.test(p + k))) return "stats";
  if (k === "quote" || /quote|testimonial|problem|pain|comparison|before/.test(p)) return "statement";
  if (/montage|gallery|showcase|angles|tour/.test(p + k)) return "montage";
  if (/feature|benefit|how|process|step|demo|product/.test(p)) return "feature";
  return "statement";
}
// Beats that can put imagery on screen. A shot must NEVER be stranded on a scene that shows
// none, so distribution only ever targets these.
// The HOOK is absent on purpose: film-kit.js's Hook renders Kicker + Title + sub and no MediaSlot,
// so no reference opener carries a picture, and ours placed one over the World's own furniture.
const CAN_SHOW = new Set(["feature", "montage", "statement", "stats"]);
// How many shots a beat can actually RENDER. Without this, surplus shots get routed onto
// beats already at capacity and silently vanish after the Creative Director paid to fetch,
// score and assign them.
const SHOT_CAPACITY = { statement: 1, stats: 1, feature: 4, montage: 4 };
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
  // Adopt the skin's AUTHORED stage before any geometry is emitted. Absent (every one of the 89
  // shipped skins) it is portrait, so RW/RH keep the values they were declared as constants with.
  setStage(skin.stage);
  require("./film_beats").setStage(RW, RH);
  // TYPE SCALE — generalised for an authored stage that is not always 1080x1920.
  //
  // X(px) renders at px/RW*W device pixels, so type is already correct whenever the output
  // matches the authored aspect and needs correcting when it does not. The old expression,
  // `min(W,H)/W`, encoded that for a 1080-wide authored stage only; for a landscape-authored
  // skin it would have shrunk every size to 56%.
  //
  // Wanted: rendered ≈ authored × (outputShort / authoredShort). Solving for TSCALE gives
  // (RW/W) × (min(W,H)/min(RW,RH)). For RW=1080, RH=1920 that reduces to (1080/W)×(min(W,H)/1080)
  // = min(W,H)/W — the previous expression exactly, which is why all 89 portrait packs are
  // byte-identical (proved by scripts/golden-composers.js).
  TSCALE = clamp((RW / W) * (Math.min(W, H) / Math.min(RW, RH)), 0.5, 1);
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
  // VARIETY MUST NOT COST THE SCENE ITS COPY.
  //
  // The variety pass re-types a scene whose archetype repeats the previous one, so two adjacent
  // Features become a Feature and a Statement. That is a deliberate product behaviour (two films
  // on one pack should differ) and the audit correctly tagged it as such — but it was DESTROYING
  // CONTENT on the way: a Feature carries a headline plus three chips and a Statement renders a
  // headline plus one line, so a swap silently dropped two authored phrases. Measured as the
  // library's single largest divergence: copy loss in 46 of 48 audited packs.
  //
  // So a scene is LOCKED against re-typing when its own copy would not survive the move: it
  // carries a list (two or more on-screen phrases, which only feature/montage render) or a support
  // line (which feature/montage have no slot for). Bare scenes — a headline and nothing else — are
  // still free to vary, which is where variety was always visible anyway.
  const listCount = (sc) => featureLines(sc, 6).length;
  const hasSub = (sc) => !!String((sc && sc.subtext) || "").trim();
  const lockedIdx = [];
  scenes.forEach((sc, i) => {
    const a = baseArch[i];
    const carriesList = listCount(sc) >= 2 && (a === "feature" || a === "montage");
    const carriesSub = hasSub(sc) && (a === "statement" || a === "hook" || a === "stats");
    if (carriesList || carriesSub) lockedIdx.push(i);
  });
  const { archetypes: varied } = varyArchetypes(baseArch, {
    pool: ["hook", "statement", "feature", "montage", "stats", "cta"],
    seedKey: scenes.map((s) => s && s.id).join("|"),
    locked: lockedIdx,
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
    // WHAT THE SCENES ASKED FOR -------------------------------------------------
    // A scene may name one treatment (see normalizeTreatment). An ask for one of THIS pack's
    // mechanics is granted outright — that is the only reliable way to tell a scroll list from a
    // montage wall on copy that is identical in every other field. An ask for a native beat has
    // already steered archetypeFor, and here it does the second half of the job: it keeps the
    // alternation from taking the layout back. Everything unasked routes exactly as before.
    const asked = new Array(scenes.length).fill(null);
    for (let i = 0; i < scenes.length; i++) {
      const a = normalizeTreatment(scenes[i] && scenes[i].treatment, declared);
      if (a) asked[i] = a;
    }

    // WHO IS EVEN ELIGIBLE ------------------------------------------------------
    const elig = [];
    for (let i = 0; i < scenes.length; i++) {
      const arch = baseArch[i];
      if (arch === "hook" || arch === "cta") continue;
      if (sceneShots[i] && sceneShots[i].length) continue;   // never displace a seated picture
      // ASKED FOR ITS OWN LAYOUT — the alternation may not overrule it.
      if (asked[i] && asked[i].kind === "native") continue;
      // AN EXPLICIT, DECLARED ASK IS NOT SUBJECT TO ARCHETYPE INFERENCE.
      //
      // MECHANIC_FOR maps an INFERRED archetype to the mechanics that can plausibly stand in for
      // it, which is a guess about a scene whose treatment nobody stated. Once a scene states one,
      // that guess has nothing left to add: a beat the design draws as a drag-and-drop card can
      // read as `kind: quote`, and gating the ask on the statement row would drop it on the floor.
      // The pack's `variants` is still the only gate that matters — an undeclared mechanic never
      // resolves at all (see normalizeTreatment), so no template can be talked into another's look.
      //
      // Ring is the one exception, and it is about truthfulness rather than routing: the gauge
      // shows ONE number swept to a target, so granting it on a scene whose copy carries a full
      // stats deck would silently drop two authored figures, and sweeping an arc to "340kg" would
      // state a proportion the film never measured.
      if (asked[i] && asked[i].kind === "mechanic") {
        const wantRing = asked[i].name === "Ring";
        let truthful = true;
        if (wantRing) {
          const deck = pickStats(scenes[i], 3, Str);
          const n1 = deck[0] || pickNumber(scenes[i]);
          truthful = deck.length < 2 && !(n1 && !(n1.suf === "%" || n1.suf === "x" || n1.target <= 100));
        }
        if (truthful) { elig.push({ i, arch, pool: [asked[i].name], ownList: false, ask: asked[i].name }); continue; }
      }
      // A STATS DECK OUTRANKS A GAUGE. The Ring mechanic is a single number swept to a target;
      // the stats beat is up to three counted figures with labels — the reference's proof
      // moment. Converting a scene whose copy parses a full deck traded the richer design for
      // the poorer one (ember-roast's "340kg / 41 cafes / 96 score" rendered as one gauge).
      // Ring stands in only when the scene yields fewer than two stats AND its number reads as
      // a share (percent/multiplier, or <=100) — an arc swept to "340kg" would be a lie.
      if (arch === "stats") {
        const deck = pickStats(scenes[i], 3, Str);
        if (deck.length >= 2) continue;
        const n1 = deck[0] || pickNumber(scenes[i]);
        if (n1 && !(n1.suf === "%" || n1.suf === "x" || n1.target <= 100)) continue;
      }
      const pool = (MECHANIC_FOR[arch] || []).filter((k) => declared[k]);
      if (!pool.length) continue;
      // Can this beat show its copy in the layout the pack designed for it?
      //   feature — headline + three chips · montage — headline + four captioned tiles
      // Those two carry a list natively; statement and stats render at most one list line.
      const ownList = (arch === "feature" || arch === "montage") && featureLines(scenes[i], 4).length >= 2;
      elig.push({ i, arch, pool, ownList, ask: null });
    }

    // HALF THE FAMILY KEEPS ITS LAYOUT, HALF SPEAKS THE MECHANIC -----------------
    //
    // Both absolutes are wrong, and re-scoring caught each of them in turn:
    //   • "a list-bearing scene always gets its mechanic" replaced abyss-dive's signature 2x2
    //     montage wall with a Scroll list and its Feature with a second typing terminal.
    //   • "a list-bearing scene NEVER gets its mechanic" then deleted alpine-post's manifest
    //     Scroll, its drag-and-drop card and its departure checklist — the mechanics ARE that
    //     pack's vocabulary, and a film without them is not that template.
    // A reference deck runs both: some Montage/Feature walls AND some mechanic beats out of the
    // same archetype. So the rule is an even split PER ARCHETYPE FAMILY, and which side a family
    // opens on is the tie-break: a family that renders its own list opens on KEEP (its wall or
    // chip-row must appear at least once), a family that cannot opens on CLAIM (the mechanic is
    // strictly more of the design than one headline). Per-family, not one global counter, so a
    // film of four statements and two features cannot spend every mechanic on the statements.
    // GRANTED ASKS COME OUT OF THE ALTERNATION ENTIRELY. They are already decided, so counting
    // them as turns would let one explicit request push an unrelated beat onto the wrong side.
    const granted = elig.filter((e) => e.ask);
    const rest = elig.filter((e) => !e.ask);
    const turn = Object.create(null);
    const claim = rest.filter((e) => {
      const t = (turn[e.arch] = (turn[e.arch] || 0) + 1) - 1;
      // WHICH SIDE A FAMILY OPENS ON — measured against the 88 reference decks, not guessed.
      //
      // Both absolutes are wrong and re-scoring caught each in turn: "a list-bearing scene always
      // gets its mechanic" replaced abyss-dive's signature montage wall with a Scroll list, and "it
      // never does" deleted alpine-post's manifest Scroll, drag-and-drop card and checklist. So the
      // split is even per family and the only question is which side each opens on.
      //
      // The decks answer it. A reference film introduces its INTERACTION first and summarises with
      // a wall or a chip row later — across the library the showcase family's first beat is a
      // mechanic and its second is the Montage, and reading it the other way round accounted for 79
      // of the substitutions on its own. The statement family runs the other way: the plain type
      // slam is the film's connective tissue and opens the run.
      //
      // Measured over all 88 decks: statement-keeps/rest-claims scores 74.4% beat agreement with
      // 354 mechanic beats against the reference's 325, and 96.1% of the reference vocabulary
      // present. Everything-keeps scores 51.8%, everything-claims 66.2% (and over-supplies by 66
      // beats), and keeping the feature family back as well 72.4%.
      const furnished = e.arch === "statement";
      return furnished ? t % 2 === 1 : t % 2 === 0;
    });

    // FLOOR — a pack that declared mechanics must speak at least one of them, or the film loses
    // the one thing the handoff promises no two templates share. The floor never spends a pack's
    // ONLY list-bearing beat: it takes a bare beat if there is one, and otherwise only reaches
    // for a list-bearing beat when an earlier one is still keeping the native layout.
    if (!claim.length && !granted.length && rest.length) {
      const bare = rest.filter((e) => !e.ownList);
      if (bare.length) claim.push(bare[bare.length - 1]);
      else if (rest.length > 1) claim.push(rest[rest.length - 1]);
    }

    // BREADTH BEFORE REPETITION. A pack declares up to four mechanics and the handoff's promise is
    // that they are ITS vocabulary; rotating blindly through each beat's pool spent two slots on
    // Notify while Morph and Toggle never appeared in the film at all (16% of the library's
    // declared-and-used mechanics were missing). Prefer one this film has not shown yet, and never
    // the one that just played; the `off` rotation still decides WHICH, so two films on one pack
    // do not open with the same mechanic.
    let used = null, n = 0;
    const seen = new Set();
    // Asks first, in scene order: they are decided, and seeding `seen` with them keeps the
    // breadth-first rule from spending an inferred slot on a mechanic the film already shows.
    for (const e of granted) {
      mechPlan[e.i] = { name: e.ask, variant: declared[e.ask] };
      seen.add(e.ask);
    }
    for (const e of claim) {
      const fresh = e.pool.filter((k) => !seen.has(k) && k !== used);
      const from = fresh.length ? fresh : e.pool.filter((k) => k !== used);
      if (!from.length) continue;
      const pick = from[(off + n) % from.length];
      n++;
      seen.add(pick); used = pick;
      mechPlan[e.i] = { name: pick, variant: declared[pick] };
    }
  }

  // ---- grounds ----------------------------------------------------------------
  // Each beat's `look.<beat>.bg` IS its ground — the source swaps the whole field per beat,
  // and that alternation is a large part of why these films do not read as one backdrop
  // with rotating copy.
  // THE GROUND BELONGS TO THE BEAT THAT IS ACTUALLY DRAWN, not to the one first inferred.
  //
  // Two rules downgrade a beat while it is being built — an empty montage wall becomes a feature,
  // and a stats beat with nothing to count becomes a feature or a statement. This read
  // `baseArch[i]`, the archetype BEFORE those downgrades, so a downgraded beat wore the wrong
  // pack ground while `lookForBeat` (below) resolved its foreground from the new one. On
  // bonsai-bench that pairs the statement's `fg: paper` with the stats beat's `bg: paper` —
  // paper on paper — and only the contrast floor saved it, repainting the type to ink and
  // shipping the pack's dramatic pine-green type slab as a plain cream page. Caught by a real
  // production render (job ormyyok2un, scenes 4 and 5); the reference-deck harness never sees it
  // because a reference Statement never needs downgrading.
  const groundOf = (i, arch) => {
    const m = mechPlan[i];
    const key = m ? look.app.bg : (look[arch || baseArch[i]] || look.statement).bg;
    return col2(theme, key);
  };

  // ---- build the scenes -------------------------------------------------------
  const startOf = (i) => scenes.slice(0, i).reduce((a, s) => a + (Number(s.duration) || 0), 0);
  const bodyParts = [], sceneScripts = [], labels = [], starts = [], durs = [], mechs = [], grounds = [], sceneFgs = [];
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
    } else if (!m && arch === "montage" && !sceneAssets.length && featureLines(scene, 4).length < 2) {
      // An empty wall is worse than one wireframe product moment — but a wall whose tiles the
      // scene NAMED is not empty: bMontage draws those captions over designed wireframe plates,
      // which is the reference's own four-slot grid. Downgrade only when there is neither a picture
      // nor an authored tile list to hang on the wall.
      arch = "feature";
    }

    // A COUNTER NEEDS SOMETHING TO COUNT. The stats beat is the pack's proof moment, and it was
    // reached on narrative role alone — so a "proof" scene whose copy carries no figure still got
    // the counter treatment, and the beat filled it with an invented one. Same shape as the empty
    // montage above: when the ingredient is missing, change the presentation rather than
    // manufacture the ingredient. `pickStats` is the same reader the beat itself uses, so the two
    // cannot disagree about whether this scene has a number.
    if (!m && arch === "stats" && !pickStats(scene, 3, Str).length) {
      arch = sceneAssets.length ? "feature" : "statement";
    }

    const ground = groundOf(i, arch);
    grounds.push(ground);
    // Does the animated world show on THIS beat? The resolved look answers it — an interaction
    // beat reads the `app` look, everything else its own. A beat that says no paints its own
    // ground (see film_beats.open), which is both the source's behaviour and what keeps its
    // authored text colour readable.
    const lookForBeat = m ? look.app : (look[arch] || look.statement);
    // The beat's RESOLVED foreground — what the chrome wears on this beat. The reference's
    // Chrome takes the scene's `fg` for both the badge disc and the brand name; display floor 2.
    sceneFgs.push(theme.typeOn(col2(theme, (lookForBeat && lookForBeat.fg) || skin.inkKey), ground, 2));
    // WHICH BUILDER DRAWS THIS BEAT — resolved before the context so the composition can name
    // it in the markup (`data-fk-beat`). That attribute is how the parity harness diffs our
    // beat plan against the reference deck without rendering a single pixel.
    const key = m ? m.name : arch;
    const ctx = {
      id: `s${i + 1}`, T, L, i, isLast: i === scenes.length - 1, track: 10 + i, beat: key,
      theme, skin, S: Str, Str, ground, address, title, look, panelR, sa: safeArea(W, H),
      // THE ADDRESS BAR IS SCENERY, BUT A PLACEHOLDER IS NOT.
      //
      // `address` falls back to the decorative default ("yourproduct.com") when the job knows no
      // real domain, and that string was printed inside the browser-chrome address pill of every
      // device frame. On a film made for a product called Thicket it reads as an unfinished
      // template, not as scenery — a viewer sees another company's placeholder. The pill, its
      // shape and its traffic lights are the scenery; the TEXT is a claim. So a device frame gets
      // the address only when one is really known, and otherwise draws an empty pill.
      realAddress: address && address !== Str.addressBar ? address : "",
      opaque: lookForBeat && lookForBeat.world === false,
    };
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
  // THE BADGE WEARS THE BEAT'S FOREGROUND, NOT THE ACCENT. The reference's Chrome paints the
  // disc with the scene's `fg` (cream on ember-roast's dark beats) and the brand name in the
  // same fg; both swap per beat. An accent disc was a visible tell against every reference
  // frame. The icon is baked once against the FIRST beat's fg; the proxy swaps disc + name per
  // scene (fgs[]), which is the part of the alternation a viewer actually reads.
  const chromeFg = sceneFgs[0] || theme.onField(grounds[0]);
  // ONE ICON VARIANT PER DISTINCT BEAT COLOURWAY.
  //
  // The icon is a build-time SVG string, and it was rendered ONCE against scene 1's ground while
  // the proxy swapped only the disc colour per beat. Every pack's icon strokes in `theme.currentBg`
  // — the colour of the field the disc sits on — so from beat 2 onward the icon was drawn in the
  // WRONG ground's colour, which on a swapped colourway is frequently the disc's own colour: the
  // glyph vanished and the badge read as an empty circle. Measured in 16 of 48 audited packs.
  //
  // Fix: emit one variant per distinct (ground, fg) pair — typically two or three for a whole film
  // — stack them in the badge, and let the seek proxy show the one belonging to the current beat.
  // No per-frame work, no new nodes at runtime, and a null-icon pack is unaffected.
  const iconKeys = grounds.map((g, i) => `${g}|${sceneFgs[i]}`);
  const uniqIcons = [...new Set(iconKeys)];
  const iconIdx = iconKeys.map((k) => uniqIcons.indexOf(k));
  const iconHtml = typeof skin.icon === "function"
    ? uniqIcons.map((k, i) => {
      const [g, f] = k.split("|");
      return `<span class="fk-ic" data-ic="${i}" style="display:${i === iconIdx[0] ? "flex" : "none"};align-items:center;justify-content:center;width:100%;height:100%;">${renderIcon(skin, theme, g, f)}</span>`;
    }).join("")
    : "";
  const chrome = `<div id="fk-chrome" class="clip" data-start="0" data-duration="${D}" data-track-index="92" data-layout-allow-occlusion style="pointer-events:none;">
    <div style="position:absolute;left:${X(72)};top:${V(56)};display:flex;align-items:center;gap:${X(15)};">
      ${skin.badge === "none" ? "" : `<div id="fk-badge" style="width:${X(47)};height:${X(47)};border-radius:${skin.badge === "square" ? X(11) : "999px"};background:${skin.badge === "outline" ? "transparent" : chromeFg};${skin.badge === "outline" ? `border:${X(2)} solid ${chromeFg};` : ""}display:flex;align-items:center;justify-content:center;overflow:hidden;">${iconHtml}</div>`}
      <span id="fk-brandname" style="font-family:${theme.displayStack};font-size:${F(31)};color:${chromeFg};">${esc(String(Str.brandName || theme.brand || "").slice(0, 24))}</span>
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
  // Thousands grouping for a COUNTING number. The resting text is already grouped at build time
  // (film_stage.groupNum); without this the counter would drop the separator the moment it began
  // and put it back only at rest. Locale-free, to match the build-time formatter exactly.
  function FKgroup(v,on){
    var s=String(Math.abs(v)),neg=v<0?"-":"";
    if(!on||s.length<4)return neg+s;
    var out="";
    for(var i=0;i<s.length;i++){if(i>0&&(s.length-i)%3===0)out+=",";out+=s[i];}
    return neg+out;
  }

  // Count-ups are driven from the seek proxy below (see the CNTS loop) with the source's own
  // curve — outCubic(seg(p, 0.12 + i*0.08, 0.75)) in PACE space, each row staggered, all
  // landing together at 75% of the action. A GSAP tween runs linearly in TIME, and the PACE
  // remap makes mid-scene action sit well ahead of mid-scene time, so a tweened count read
  // visibly behind the reference at the same timestamp. The element's RESTING text is already
  // the final value.

  ${sceneScripts.join("\n  ")}

  // ---- ONE seek-safe proxy: world, camera drift, mechanics, chrome and captions ----
  var cues=${JSON.stringify(cues)};
  var starts=${JSON.stringify(starts)};
  var durs=${JSON.stringify(durs)};
  var fgs=${JSON.stringify(sceneFgs)};
  var grounds=${JSON.stringify(grounds)};
  var worldEl=$("#fk-world"),groundEl=$("#fk-ground");
  var MECHS=${JSON.stringify(mechs)};
  var AMB=${r(skin.ambient || 1.7)};
  var MAG=${JSON.stringify({ driftX: mag.driftX, driftY: mag.driftY, driftZ: mag.driftZ, out: mag.out })};
  var ENERGY=${r(energy)};
  var capPill=$("#cap-pill"),capText=$("#cap-text"),brandEl=$("#fk-brandname"),badgeEl=$("#fk-badge");
  var BADGE_OUTLINE=${skin.badge === "outline" ? "true" : "false"};
  var ICONIDX=${JSON.stringify(iconIdx)};
  var iconEls=$$("#fk-badge .fk-ic");
  var CNTS=starts.map(function(_,d){return $$("#s"+(d+1)+" [data-count]");});
  var curCue=-1,curScene=-1;
  tl.to({},{duration:D,ease:"none",onUpdate:function(){
    var now=tl.time();
    var si=0; while(si<starts.length-1&&now+0.24>=starts[si+1])si++;
    // THE WORLD RUNS ON THE BEAT'S OWN CLOCK.
    //
    // The source renders its World INSIDE each scene's Frame and hands it that scene's progress:
    // Frame({progress: p}) -> cfg.World(theme, clock, progress, u), where p is the beat's own
    // 0..1 from Sprite. So a progress-driven prop completes ONCE PER BEAT and restarts on the next.
    // We draw one persistent world layer behind every scene and were feeding it now/D — the
    // whole FILM's progress — so those props crawled through a single pass across the entire run:
    // bonsai-bench's wire ring is strokeDashoffset: 390 * (1 - seg(p, 0.1, 0.85)) and never
    // formed, sitting at an anti-aliased sliver on the opener and ~16% by the second beat.
    // The continuous CLOCK argument is unchanged (that is the source's useTl()), so the ambient
    // sway, drift and every time-driven prop are untouched; only p is corrected.
    if(window.FK_WORLD){
      var wp=(now-starts[si])/(durs[si]||1); wp=wp<0?0:wp>1?1:wp;
      window.FK_WORLD(now*AMB, wp);
    }
    if(si!==curScene){
      curScene=si;
      // The chrome wears the BEAT'S fg, as the reference's Chrome does — name and disc both.
      if(brandEl)brandEl.style.color=fgs[si];
      if(badgeEl){if(BADGE_OUTLINE){badgeEl.style.borderColor=fgs[si];}else{badgeEl.style.background=fgs[si];}}
      // Show the icon variant drawn for THIS beat's ground/fg pair (see iconHtml).
      if(iconEls.length){var want=ICONIDX[si]||0;for(var ii=0;ii<iconEls.length;ii++)iconEls[ii].style.display=(ii===want)?"flex":"none";}
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
      // The source's drift fades toward the cut: opacity 1 - inCubic(seg(p, out, 1)) * 0.35.
      var pc=lp<=0.2?lp*2.5:lp<=0.78?0.5+(lp-0.2)*0.41379:0.74+(lp-0.78)*1.18182;
      var ot=(pc-MAG.out)/(1-MAG.out||1e-6); if(ot<0)ot=0; if(ot>1)ot=1;
      el.style.opacity=(1-ot*ot*ot*0.35).toFixed(3);
    }
    // COUNT-UPS — the source's curve, recomputed per seek: outCubic(seg(p, .12+i*.08, .75)).
    for(var c2=0;c2<CNTS.length;c2++){
      var lst=CNTS[c2]; if(!lst.length)continue;
      var lpc=(now-starts[c2])/(durs[c2]||1); if(lpc<0)lpc=0; if(lpc>1)lpc=1;
      var pcc=lpc<=0.2?lpc*2.5:lpc<=0.78?0.5+(lpc-0.2)*0.41379:0.74+(lpc-0.78)*1.18182;
      for(var ci=0;ci<lst.length;ci++){
        var elc=lst[ci];
        var a0=0.12+Math.min(ci,2)*0.08;
        var sgc=(pcc-a0)/(0.75-a0); if(sgc<0)sgc=0; if(sgc>1)sgc=1;
        var ec=1-Math.pow(1-sgc,3);
        var s2=(elc.getAttribute("data-pre")||"")+FKgroup(Math.round(ec*(parseFloat(elc.getAttribute("data-count"))||0)),elc.getAttribute("data-group"))+(elc.getAttribute("data-suffix")||"");
        if(elc.textContent!==s2)elc.textContent=s2;
      }
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
  /* OPTICAL SIZING IS LOAD-BEARING, SO IT IS DECLARED. A display family with an opsz axis (see
     scripts/font-axis-survey.js) draws a different typeface at each end of it: the reference asks
     Google for Fraunces:opsz,wght@9..144,500 and gets the high-contrast Didone cut at display
     size, while the axis default sits at 9 — the sturdy text cut, which reads as a heavy slab at
     120px. Today that resolves correctly only because auto is the CSS initial value; declaring it
     means a future rule setting none cannot silently bring the slab back. Pinning one opsz value
     instead would be wrong: the chrome lockup and a 142px headline want different cuts, and auto
     is exactly what the reference relies on. */
  #root { position:relative; overflow:hidden; isolation:isolate; container-type:size; background:${grounds[0]}; color:${theme.ink}; font-family:${theme.bodyStack}; font-optical-sizing:auto; }
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
    `<div id="root" class="composition" data-composition-id="vid" data-fk-rev="${ENGINE_REV}" data-width="${W}" data-height="${H}" data-start="0" data-duration="${D}" style="width:${W}px;height:${H}px;">`,
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
// `ground` feeds theme.currentBg (the reference's Frame sets it to the beat's bg before Chrome
// renders — icons stroke in it to contrast the fg disc they sit on); `fg` is the disc colour.
// Conflating the two painted the icon in its own disc colour and it vanished.
function renderIcon(skin, theme, ground, fg) {
  if (typeof skin.icon !== "function") return "";
  try {
    const out = skin.icon({ ...theme.c, currentBg: ground, accent: theme.accent, ink: theme.ink, paper: theme.paper }, fg, svgR);
    return out && out.__svg ? out.__svg : "";
  } catch { return ""; }
}

module.exports = {
  build, BASE_STRINGS, PRESETS,
  X, V, F, clamp, clamp01, rgba, hexToRgb, relLum, ratio, reHue, hueOf,
  // RW/RH are per-build now, so they are exposed as accessors rather than as the load-time
  // snapshot a plain `RW, RH` would have frozen. (Nothing outside this module read them, which
  // is what made the change safe; these exist so film_beats and the harnesses can ask.)
  get RW() { return RW; }, get RH() { return RH; },
  isWide, setStage, STAGES,
  seedFrom, mulberry32, buildTheme,
  wordsOf, forcedLines, featureLines, pickNumber, pickStats, shortLabel, fitLines, fitPx, soloSize, trackEm, advanceOf,
  shotOk, shotReserveOk, logoAssetOf, ratioOf, deviceFor, addressFrom, scrollPlan,
  fitFor, cropFocus, plate, wirePlate, backingPlate, frameHtml, groupNum,
  archetypeFor, CAN_SHOW, SHOT_CAPACITY, capacityOf, MECHANIC_FOR, MECHANIC_NEEDS_NO_SHOT,
  setTypeScale(v) { TSCALE = v; },
  getTypeScale() { return TSCALE; },
};
