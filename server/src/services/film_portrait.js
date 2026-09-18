// FILM PORTRAIT — the 9:16 composition system for the FilmKit beats.
//
// WHY THIS FILE EXISTS
//
// The portrait beats in film_beats.js were transcribed from a 1080x1920 reference deck as
// "a copy block at an authored `top`, and — on the two beats that carry one — a picture at a
// second authored `top`". That is a POSITION SYSTEM, not a composition system, and at 9:16 it
// fails in one specific, measurable way:
//
//   bStatement pinned its picture at `top:V(1180); height:X(430)` — 61.46% down a 1920-tall
//   frame, 22.4% of its height. The copy above it was clamped to `top:V(420)` (21.88%) and
//   ran out at roughly 46%. Between them sat FIFTEEN PERCENT OF THE FRAME holding nothing,
//   and the picture itself, drawn `object-fit:contain` into a box whose aspect (936/430 =
//   2.18) matched no capture the pipeline produces (a website shot is 2732x1800 = 1.52),
//   letterboxed to ~70% of the box width. Net: the asset occupied 14% of the frame where the
//   feature beat's identical asset occupies 30%, and a 2732px-wide page rendered at ~650px
//   is not readable at any bitrate.
//
// The fix is not to move the picture up. Three things have to change together:
//
//   1. GEOMETRY IS DERIVED, NOT AUTHORED. A plate's height comes from the room the copy
//      actually leaves and from the ASSET'S OWN RATIO, so the box never letterboxes and never
//      strands a band of empty ground. `band()` + `mediaShape()` below.
//   2. ONE BEAT HAS SEVERAL COMPOSITIONS. A two-minute film draws `statement` four or five
//      times; four identical frames read as a slide deck. `patternFor()` rotates a beat
//      through a set of layouts deterministically, so the film varies without randomness.
//   3. THE FRAME IS FILLED WITH INFORMATION, NOT PADDING. Each pattern carries an eyebrow, a
//      headline, support copy and a rail (chips / a caption / a stat strip) drawn from the
//      scene's OWN fields — never invented, and dropped entirely when the scene has none.
//
// LANDSCAPE NEVER REACHES THIS FILE. film_beats guards every call with `!WIDE`, so a
// stage:"landscape" skin renders byte-identically to before.
//
// UNITS. Everything here is AUTHORED PIXELS against the portrait stage (1080x1920), the same
// coordinate space film_beats already writes in. Callers convert with film_stage's X() (a
// width or a height, emitted as cqw) and V() (a `top`, emitted as %). Heights go through X()
// because cqw is the only unit that is definite inside an auto-height parent — that is a
// film_stage invariant, not a choice made here.

const S = require("./film_stage");
const { X, V, F, rgba, clamp } = S;
const { esc } = require("./composer_kit");

// ---- stage ---------------------------------------------------------------------
// Mirrors film_beats.setStage: mutable module state, set once per synchronous build.
let RW = 1080, RH = 1920, PAD = 72, COL = 936;
function setStage(rw, rh) {
  RW = rw || 1080; RH = rh || 1920;
  PAD = Math.round(RW * (72 / 1080));
  COL = RW - PAD * 2;
}

// THE SAFE BAND. A composition lives between these two lines.
//
// The top inset is smaller than the copy blocks' authored `top` values (250..630) on purpose:
// those are art direction and stay honoured, but a pattern that leads with a picture needs to
// start above them. The bottom inset is the one film_beats' montage already measured against
// (`bottomSafe = 170`) plus a little, because the QA reviewer blocked a shipped frame for a
// card sitting "very close to the bottom edge".
const SAFE_TOP = () => Math.round(RH * 0.069);      // 132 @1920
// 0.115 rather than 0.094: measured at the smaller inset, six beats ran their last block to
// 91% of the frame — inside the band every vertical platform paints its own chrome over
// (responsive.js reserves 0.13 for exactly this), and on a pack whose world draws furniture
// along the bottom it put copy on top of the furniture. The QA reviewer blocked a shipped
// frame for a card "very close to the bottom edge"; this is that line, drawn once.
const SAFE_BOT = () => Math.round(RH * 0.115);      // 221 @1920
function band() {
  const top = SAFE_TOP(), bot = RH - SAFE_BOT();
  return { top, bot, h: bot - top };
}

// ---- measurement ---------------------------------------------------------------
// A layout that derives geometry has to know how tall its copy is BEFORE it emits it.
// film_stage.fitLines already returns the wrapped lines and the size it settled on, so a
// display block's height is exact, not estimated.
function titleMetrics(skin, txt, { size, sizeMax = 0, maxLines = 4, colPx = null, upper = false }) {
  const fit = S.fitLines(txt, {
    basePx: size, growPx: sizeMax, maxLines, colPx: colPx || COL,
    em: skin.em, family: skin.display, upper, track: S.trackEm(skin.titleSpace),
  });
  const lh = skin.titleLine || 1.04;
  return { ...fit, h: Math.round(fit.lines.length * fit.size * lh) };
}

// Body copy wraps in the browser, so its height is a MODEL, not a measurement. The model is
// deliberately generous (0.5em average advance, one extra line of slack) because
// under-estimating pushes a plate down into the copy, while over-estimating only costs a plate
// a few pixels of height.
function bodyMetrics(txt, px, colPx, lh = 1.45) {
  const t = String(txt || "");
  if (!t) return { h: 0, lines: 0 };
  const perLine = Math.max(8, Math.floor((colPx || COL) / (px * 0.5)));
  const lines = Math.max(1, Math.ceil(t.length / perLine));
  return { h: Math.round(lines * px * lh), lines };
}

// GROW DISPLAY TYPE INTO A HEIGHT BUDGET — RE-WRAPPING ALLOWED.
//
// `fitLines` grows a headline only while the line array stays character-identical (its own
// note explains why: a growth pass that re-flows trades the authored wrap for a taller tower of
// fragments). That guard is right for a headline sitting above a picture, and wrong for a beat
// whose type IS the composition: a pull quote at 9:16 kept the reference's two lines and
// therefore kept the reference's SIZE, filling 40% of a 1920-tall frame.
//
// Here the line count is a variable. For each plausible count the largest size that both fits
// the measure and stays inside the budget is computed, and the tallest result wins — so short
// copy grows and re-wraps, and long copy is left exactly where `fitLines` would have put it.
function fillType(text, { maxPx, minPx, colPx, lh = 1.16, room, em, family, upper = false, track = 0, maxLines = 5 }) {
  const base = { colPx, em, family, upper, track };
  let best = null;
  for (let n = 1; n <= maxLines; n++) {
    const cap = Math.floor(room / (n * lh));
    const px = Math.min(maxPx, cap);
    if (px < minPx) continue;
    const f = S.fitLines(text, { ...base, basePx: px, maxLines: n });
    if (!f.lines.length || f.lines.length > n) continue;
    const h = f.lines.length * f.size * lh;
    if (h > room + 1) continue;
    if (!best || h > best.h) best = { ...f, h: Math.round(h) };
  }
  if (best) return best;
  const f = S.fitLines(text, { ...base, basePx: minPx, maxLines });
  return { ...f, h: Math.round(f.lines.length * f.size * lh) };
}

// ---- media geometry ------------------------------------------------------------
// THE PLATE TAKES THE PICTURE'S SHAPE.
//
// The defect this replaces is a box with a fixed aspect holding a picture with a different
// one: `contain` then letterboxes (the shipped 2.18 box round a 1.52 capture wasted 30% of its
// width) and `cover` crops away whatever the shot existed to show. Both are avoidable — give
// the BOX the picture's aspect and the two fits become the same operation.
//
// It cannot always be given: a 0.66 phone capture at full column width wants 1418px of height,
// which does not exist under a headline. So the box aspect is CLAMPED to a band around the
// asset's own, and only the residue inside that band is resolved by cropping — never more than
// `CROP_BAND`, which is a crop a designer would make by hand.
// HOW FAR A BOX MAY DEPART FROM ITS PICTURE'S OWN SHAPE, and it depends entirely on what the
// picture IS. A photograph is a texture: every editor crops one, and 28% off an edge is a
// decision, not a loss. A SCREENSHOT is words and controls laid out to the pixel — the first
// column cropped off a capture turns "YC Startups" into "C Startups", which is a rendering
// fault the viewer can read. Measured on the first pass of this redesign: a 1.518 capture in a
// full-bleed 1.256 box lost 17% of its width and chopped the headline it existed to show.
const CROP_PHOTO = 0.28;
const CROP_CAPTURE = 0.06;
const DEFAULT_RATIO = 1.6;                                // an unknown ratio is a real case

// Assets that must never be cropped, whatever the room: a logo loses its meaning at the edges.
const NEVER_CROP = new Set(["logo", "icon", "mark"]);
// A capture is anything whose content is TYPE — a product UI, a web page, a document.
const CAPTURE_KINDS = new Set(["screenshot", "ui", "site", "web", "document", "chart", "diagram"]);
const PHOTO_KINDS = new Set(["photo", "illustration", "people", "texture"]);
function isCapture(a) {
  const kind = String((a && (a.kindHint || a.assetType || a.role)) || "").toLowerCase();
  if (CAPTURE_KINDS.has(kind)) return true;
  if (PHOTO_KINDS.has(kind)) return false;
  const src = String((a && a.source) || "").toLowerCase();
  return src === "website" || src === "upload";
}
function cropBandFor(a) { return isCapture(a) ? CROP_CAPTURE : CROP_PHOTO; }

function ratioOf(a) {
  const r = Number(a && a.ratio) || (a && a.width && a.height ? Number(a.width) / Number(a.height) : 0);
  return r > 0 ? r : 0;
}

/**
 * Fit a plate for `asset` inside (maxW x maxH), in authored px.
 *
 * @returns {{w,h,ratio,assetRatio,fit,pos,natH,frac,cropped}}
 *   w,h        the plate box
 *   fit        "cover" | "contain"
 *   pos        object-position for a cover fit (focal point aware)
 *   natH,frac  a scroll plan when the picture is genuinely taller than its box
 *   cropped    how much of the asset the box hides, 0..1 — for the caller's own guards
 */
function mediaShape(asset, { maxW, maxH, minH = 0, ratioHint = 0, bleed = false } = {}) {
  const aR = ratioOf(asset) || Number(ratioHint) || DEFAULT_RATIO;
  const kind = String((asset && (asset.kindHint || asset.assetType || asset.role)) || "").toLowerCase();
  const noCrop = NEVER_CROP.has(kind);
  const capture = isCapture(asset);
  const cband = noCrop ? 0 : cropBandFor(asset);
  const W = Math.max(1, Math.round(maxW));
  const Hmax = Math.max(1, Math.round(maxH));

  // The box the asset would like: full width at its own aspect.
  let w = W, h = Math.round(W / aR);

  if (h > Hmax) {
    // Not enough vertical room. Two ways out, in order of how much of the design they cost:
    //   (a) crop inside the band — the box keeps the full width and hides the residue;
    //   (b) narrow the box — the picture keeps every pixel and the plate stops being full-bleed.
    // For a capture (b) is almost always the answer, because its band is six percent.
    const shallowest = Math.round(W / (aR / (1 - cband)));  // the shortest crop the band allows
    if (cband > 0 && Hmax >= shallowest) {
      h = Hmax;                                             // crop the residue, keep the width
    } else {
      h = Hmax;
      w = Math.round(h * aR);                               // narrow instead of over-cropping
      if (w > W) { w = W; h = Math.round(W / aR); }
    }
  } else if (h < minH && minH <= Hmax) {
    // A picture WIDER than the slot leaves a short plate floating in the band. Deepen the box
    // — a crop off the top and bottom, which is the crop a designer makes on a wide photograph
    // — rather than leaving the ground bare, but only inside the same band. A capture's band is
    // narrow enough that this is nearly a no-op for one, which is correct: a short plate is a
    // smaller loss than a beheaded interface.
    const deepest = Math.round(W / (aR * (1 - cband)));
    h = clamp(minH, h, Math.min(deepest, Hmax));
  }

  const boxR = w / Math.max(1, h);
  // A box within a couple of percent of the asset's own aspect crops nothing, so `cover` is
  // exact and keeps the plate full. Outside that, `cover` is still right for anything the crop
  // engine can focus, and `contain` is kept for the assets that must show whole.
  const fit = noCrop ? "contain" : "cover";
  const cropped = Math.max(0, 1 - Math.min(boxR, aR) / Math.max(boxR, aR));

  // Focal point: the crop engine knows where the subject is; `cropFocus` falls back to the
  // asset's own hint and then to a sensible default. A website capture reads top-down, so its
  // default focus is the top of the page (the hero), never the middle of the body copy.
  const fallback = capture ? "50% 6%" : "center";
  const pos = fit === "cover" ? S.cropFocus(asset, w, h, fallback) : "center";

  // A capture that is much taller than its box can PAN instead of being cropped blind.
  const plan = S.scrollPlan(w, h, asset);

  return { w, h, ratio: Math.round(boxR * 1000) / 1000, assetRatio: aR, fit, pos, natH: plan.natH, frac: plan.frac, cropped };
}

// ---- composition patterns ------------------------------------------------------
//
// A beat names the FAMILY of layouts it can legitimately draw; the rotation picks one per
// scene so a long film never repeats a composition back to back. Deterministic in the scene's
// own index and the film's seed — the build is synchronous and re-renders must be
// byte-identical, so nothing here may consult Math.random or the clock.

const FAMILY = {
  // Beats that carry one hero picture.
  feature: ["poster", "showcase", "overlap", "framed"],
  // A feature that earned two. `duo` is the only composition that draws both.
  feature2: ["duo"],
  statement: ["immersive", "bandsplit", "framed", "showcase"],
  // Beats that carry several.
  stats: ["poster"],
  // Pure-type beats. `manifesto` fills the band with the copy the scene actually has.
  hook: ["manifesto"],
  quote: ["manifesto"],
  body: ["manifesto"],
  cta: ["manifesto"],
};
// `montage` is deliberately ABSENT. The wall is a grid, not one of these single-plate
// arrangements, and film_beats draws it with its own `fillColumn` pass — naming it here would
// hand a caller `poster` as the silent fallback, which is the dead-config failure mode this
// engine already carries a scar for (84 packs animating a node no builder drew).

// A pattern that cannot hold THIS asset is skipped rather than drawn badly.
//   • bandsplit and immersive bleed to the frame edges, so a tall asset in them would either
//     tower past the band or be cropped to a letterbox — they take landscape-ish shapes only.
//   • overlap prints the headline across the plate's top edge, which needs a plate deep
//     enough that the type does not cover the subject.
// PHOTOGRAPHS BLEED; SCREENSHOTS GET A FRAME.
//
// The two bleeding patterns run the picture to the frame edges, so the BOX'S aspect is
// dictated by the frame and the picture has to meet it. A photograph can — that is what a crop
// is for. A capture cannot: it arrives at 1.52, a full-bleed band is 1.26, and the 17% of width
// that has to go takes the first word of every line with it. So a capture routes to the framed
// compositions, where the plate takes the capture's own shape and the ground takes the
// difference.
function patternFits(name, { ratio, capture, headLines }) {
  if (name === "bandsplit") return !capture && ratio >= 1.15;
  // IMMERSIVE NEEDS A PICTURE THAT CAN BE TALL. The plate runs the full frame width, so its
  // height is fixed by the asset's aspect: at 1.71 that is a third of the frame, of which the
  // scrim takes the lower two fifths — an "immersive" hero showing a fifth of a frame, which is
  // less picture than `poster` gives at 90% width and no scrim at all. Above ~1.35 the wide
  // patterns are strictly better, so the pattern declines the asset rather than under-serving it.
  if (name === "immersive") return !capture && ratio >= 0.5 && ratio <= 1.35;
  if (name === "overlap") return headLines <= 2;
  return true;
}

function patternFor(beat, { index = 0, seed = 0, asset = null, ratio = 0, headLines = 2, allow = null } = {}) {
  const fam = (allow || FAMILY[beat] || ["poster"]).slice();
  if (!asset && beat !== "montage") return "manifesto";
  const r = ratio || ratioOf(asset) || DEFAULT_RATIO;
  const ctx = { ratio: r, capture: isCapture(asset), headLines };
  const start = (Math.abs(Number(seed) || 0) + index) % fam.length;
  for (let k = 0; k < fam.length; k++) {
    const name = fam[(start + k) % fam.length];
    if (patternFits(name, ctx)) return name;
  }
  return fam[0];
}

// ---- drawing helpers -----------------------------------------------------------

// The gradient that lets type sit on a picture. Two stops of the beat's OWN ground, so the
// scrim reads as the frame closing over the image rather than as a grey wash.
// The gradient that lets type sit on a picture. Two stops of the beat's OWN ground, so the
// scrim reads as the frame closing over the image rather than as a grey wash — and it is a
// SHORT band on purpose. The first pass ran it across half the plate at 0.62, which dimmed the
// picture everywhere and still left the type on a mid-tone: both jobs done badly. A tight ramp
// to opaque keeps the picture bright above it and the copy fully legible below.
function scrim(ground) {
  return `linear-gradient(to bottom, ${rgba(ground, 0)} 0%, ${rgba(ground, 0.55)} 42%, ${rgba(ground, 0.92)} 74%, ${rgba(ground, 1)} 100%)`;
}

// The plate itself, in the pack's own card language (`look.<beat>.card.v`). This is the
// treatment the reference's "perfect" frame uses — a white matte with a soft drop — restated
// so every pattern can draw it at any size.
function plateHtml(theme, skin, {
  shape, asset, cardV = "frame", radius = 24, bg = null, tint = null,
  matte = 0, id = null, scrollId = null, di = 2, kb = null, sweepId = null,
}) {
  const t = tint || theme.accent;
  const rad = radius == null ? 24 : radius;
  const shadow = cardV === "glow"
    ? `border:${X(2)} solid ${rgba(t, 0.55)};box-shadow:0 0 ${X(44)} ${rgba(t, 0.25)}, 0 ${X(28)} ${X(56)} ${rgba("#000000", 0.5)};`
    : cardV === "paper"
      ? `box-shadow:0 ${X(26)} ${X(54)} ${rgba("#140f0a", 0.3)};`
      : cardV === "tilt"
        ? `box-shadow:0 ${X(30)} ${X(62)} ${rgba("#0a0a0c", 0.4)};`
        : `box-shadow:0 ${X(30)} ${X(62)} ${rgba("#0a0a0c", 0.38)};`;
  const matteBg = cardV === "paper" ? "#ffffff" : (bg || theme.surface || "#ffffff");
  const inner = innerPlate(theme, { shape, asset, tint: t, radius: Math.max(4, rad - (matte ? 10 : 8)), id, scrollId, kb })
    + (sweepId ? sweepHtml(sweepId, theme.paper || "#ffffff") : "");
  if (matte > 0) {
    return `<div${di == null ? "" : ` data-in="item" data-i="${di}"`} style="width:${X(shape.w)};height:${X(shape.h)};border-radius:${X(rad)};padding:${X(matte)};box-sizing:border-box;background:${matteBg};${shadow}position:relative;">${inner}</div>`;
  }
  return `<div${di == null ? "" : ` data-in="item" data-i="${di}"`} style="width:${X(shape.w)};height:${X(shape.h)};border-radius:${X(rad)};overflow:hidden;position:relative;background:${rgba(t, 0.18)};${shadow}">${inner}</div>`;
}

// The picture inside a plate. `kb` attaches a ken-burns id so the timeline can drift it —
// the RESTING state is the finished frame, so a stalled ticker still captures a full plate.
function innerPlate(theme, { shape, asset, tint, radius, id, scrollId, kb }) {
  const wrapOpen = `<div style="position:relative;width:100%;height:100%;border-radius:${X(radius)};overflow:hidden;background:${rgba(tint, 0.14)};">`;
  if (!asset || !asset.path) return `${wrapOpen}${S.wirePlate(theme, tint)}</div>`;
  const imgStyle = `position:absolute;inset:0;width:100%;height:100%;object-fit:${shape.fit};object-position:${shape.pos};display:block;`;
  // A capture taller than its plate pans instead of being cropped blind.
  if (scrollId && shape.frac) {
    return `${wrapOpen}<div id="${scrollId}" style="position:absolute;left:0;right:0;top:0;height:${X(shape.natH)};"><img src="${esc(asset.path)}" alt="${esc(asset.alt || "")}" style="width:100%;height:100%;object-fit:cover;object-position:${shape.pos};display:block;"></div></div>`;
  }
  const kbAttr = kb ? ` id="${kb}"` : "";
  const kbStyle = kb ? "will-change:transform;transform-origin:50% 50%;" : "";
  return `${wrapOpen}<img${kbAttr} src="${esc(asset.path)}" alt="${esc(asset.alt || "")}" style="${imgStyle}${kbStyle}"></div>`;
}

// A KEN BURNS on a plate: a slow, continuous scale+drift for the beat's whole length. The
// amplitude is small on purpose — this is the camera breathing, not a zoom effect — and the
// FROM state is the larger one so the resting frame (scale 1) is the fully-composed picture.
function kenBurnsTween(id, L, T, i = 0) {
  const dir = i % 4;
  const from = { scale: 1.085, x: dir === 1 ? "-1.2%" : dir === 3 ? "1.2%" : "0%", y: dir === 0 ? "1%" : dir === 2 ? "-1%" : "0%" };
  return `tl.fromTo("#${id}",{scale:${from.scale},xPercent:${parseFloat(from.x)},yPercent:${parseFloat(from.y)}},`
    + `{scale:1,xPercent:0,yPercent:0,duration:${Math.max(1.2, L * 0.92)},ease:"none",immediateRender:false},${T});`;
}

// A LIGHT SWEEP across a plate — one pass, timed to the beat. Pure decoration, so it is drawn
// as a sibling overlay and never touches the picture's own box.
function sweepHtml(id, tint) {
  return `<div id="${id}" style="position:absolute;inset:0;pointer-events:none;overflow:hidden;border-radius:inherit;">`
    + `<div style="position:absolute;top:-20%;bottom:-20%;width:36%;left:-45%;transform:skewX(-14deg);`
    + `background:linear-gradient(90deg, ${rgba(tint, 0)} 0%, ${rgba(tint, 0.28)} 50%, ${rgba(tint, 0)} 100%);"></div></div>`;
}
function sweepTween(id, L, T) {
  return `tl.fromTo("#${id} > div",{xPercent:0},{xPercent:420,duration:${Math.max(0.9, Math.min(1.9, L * 0.3))},ease:"power2.inOut",immediateRender:false},${(T + Math.min(1.6, L * 0.28)).toFixed(2)});`;
}

// An accent slab set behind a plate — depth, in the pack's own colour, at no legibility cost.
function shimHtml(shape, tint, { dx = 26, dy = 26, alpha = 0.26, radius = 24 } = {}) {
  return `<div data-in="item" data-i="1" style="position:absolute;left:${X(dx)};top:${X(dy)};width:${X(shape.w)};height:${X(shape.h)};border-radius:${X(radius)};background:${rgba(tint, alpha)};"></div>`;
}

// A RAIL — the supporting information strip under (or over) a plate. Chips, a caption, a
// micro-stat row: whatever the scene actually carries. Never drawn empty.
function railHtml(theme, skin, items, { v = "pill", colors, fill, di = 4, center = false, maxW = null } = {}) {
  const list = (items || []).filter(Boolean);
  if (!list.length) return "";
  const cols = colors && colors.length ? colors : [theme.accent];
  return `<div style="display:flex;flex-wrap:wrap;gap:${X(16)};justify-content:${center ? "center" : "flex-start"};">`
    + list.map((c, i) => {
      const col = cols[i % cols.length];
      const css = v === "outline" ? `border:${X(2)} solid ${col};color:${col};border-radius:${X(10)};background:transparent;`
        : v === "square" ? `background:${col};color:${fill};border-radius:${X(8)};transform:rotate(${(i % 2) * 2 - 1}deg);`
          : `background:${col};color:${fill};border-radius:999px;`;
      return `<span data-in="item" data-i="${di + i}" style="padding:${X(14)} ${X(27)};font-family:${theme.bodyStack};font-weight:800;font-size:${F(27)};white-space:nowrap;max-width:${X(maxW || COL - 40)};overflow:hidden;text-overflow:ellipsis;${css}">${esc(c)}</span>`;
    }).join("") + `</div>`;
}

// A METRIC STRIP — the densest honest way to fill a rail when the scene carries figures.
// Draws nothing when the scene has none; a fabricated statistic is worse than an empty rail.
function metricStripHtml(theme, skin, stats, { fg, cols, di = 4, rule = true }) {
  const list = (stats || []).filter((s) => s && (s.target || s.target === 0));
  if (!list.length) return "";
  return `<div style="display:flex;gap:${X(40)};align-items:flex-end;">`
    + list.slice(0, 3).map((st, i) => {
      const c = cols[i % cols.length];
      return `<div data-in="rise" data-i="${di + i}" style="flex:1 1 0;min-width:0;${rule ? `border-top:${X(4)} solid ${rgba(c, 0.85)};padding-top:${X(18)};` : ""}">
        <div style="font-family:${theme.displayStack};font-size:${F(64)};line-height:0.95;color:${c};font-variant-numeric:tabular-nums;white-space:nowrap;"><span data-count="${st.target}" data-suffix="${esc(st.suf || "")}" data-pre="${esc(st.pre || "")}" data-group="1">${esc(st.pre || "")}${S.groupNum(st.target)}${esc(st.suf || "")}</span></div>
        <div style="font-family:${theme.bodyStack};font-weight:700;font-size:${F(26)};color:${rgba(fg, 0.72)};margin-top:${X(10)};line-height:1.3;">${esc(st.label || "")}</div>
      </div>`;
    }).join("") + `</div>`;
}

// A CAPTION rail — a ruled line of support copy. The quietest of the three, for a beat whose
// only spare copy is a sentence.
function captionHtml(theme, text, { fg, accent, di = 4, px = 30 }) {
  const t = String(text || "").trim();
  if (!t) return "";
  return `<div data-in="rise" data-i="${di}" style="border-left:${X(6)} solid ${accent};padding-left:${X(26)};font-family:${theme.bodyStack};font-weight:600;font-size:${F(px)};line-height:1.44;color:${rgba(fg, 0.82)};max-width:${X(COL)};">${esc(t)}</div>`;
}

// A CHAPTER MARK — the scene's place in the film, drawn as a hairline + index. Long-form
// needs way-finding; this is the cheapest honest form of it and it costs no invented copy.
// A CHAPTER MARK, NOT A PROGRESS BAR.
//
// The first version drew the index, then a rule spanning the remaining width, then the label —
// which at 9:16 is a full-width horizontal line low in the frame, and that is a scrubber. The
// engine forbids playback chrome outright (film_stage.js: a progress rail must never be
// re-added), and a motif that merely LOOKS like one fails the same test. The rule is now a
// fixed 64px tick between two pieces of type, and the index is set in the display face so it
// reads as a chapter number rather than a timecode.
function chapterHtml(theme, { fg, index, total, label }) {
  if (!total || total < 6) return "";                        // short films do not need chapters
  const n = String(index + 1).padStart(2, "0");
  return `<div data-in="rise" data-i="8" style="display:flex;align-items:baseline;gap:${X(16)};color:${rgba(fg, 0.52)};">`
    + `<span style="font-family:${theme.displayStack};font-size:${F(34)};line-height:1;">${n}</span>`
    + `<span style="width:${X(64)};height:${X(3)};background:${rgba(fg, 0.32)};align-self:center;flex:none;"></span>`
    + (label
      ? `<span style="font-family:${theme.bodyStack};font-weight:800;font-size:${F(21)};letter-spacing:.22em;max-width:${X(420)};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-transform:uppercase;">${esc(label)}</span>`
      : `<span style="font-family:${theme.bodyStack};font-weight:800;font-size:${F(21)};letter-spacing:.22em;">${String(total).padStart(2, "0")}</span>`)
    + `</div>`;
}

// ---- the vertical stack --------------------------------------------------------
//
// The one arithmetic every pattern shares: given the blocks a beat wants to draw and the room
// the band offers, where does the column start and how much height does the picture get?
//
// `anchor` is the pack's authored `look.<beat>.top` — art direction that stays honoured
// wherever it fits. When the stack is too tall for it, the column slides UP toward the safe
// top rather than letting the last block fall off the bottom, and only if that is still not
// enough does the plate give up height.
function solveStack({ anchor, fixedH, gaps, mediaMin = 0, mediaMax = Infinity, floorPad = 0 }) {
  const B = band();
  const floor = B.bot - floorPad;
  const chrome = fixedH + gaps;

  // THE PICTURE TAKES THE ROOM FIRST. `anchor` is the pack's authored `look.<beat>.top`, and
  // those numbers (250..630) were chosen for a TYPE-ONLY column — bound-volume's statement
  // authors 610, which is 32% of the frame. Honouring it literally on a media beat pushed a
  // 580px plate down to 40% and left the top third empty, which is the same defect as before
  // with the sign flipped.
  //
  // So the plate is sized first, against its own band, and the finished block is then placed
  // OPTICALLY — a little above true centre, where the eye expects a composition's mass to sit.
  // `anchor` survives as a CEILING: art direction may push a block down when there is room for
  // it, and can never push it to the point where the picture would shrink.
  const room = Math.max(0, floor - B.top - chrome);
  const media = clamp(room, Math.min(mediaMin, room), mediaMax);
  const total = chrome + media;
  const optical = B.top + Math.round(Math.max(0, B.h - total) * 0.40);
  const top = clamp(Math.min(Math.round(anchor), optical), B.top, Math.max(B.top, floor - total));
  return { top: Math.round(top), media: Math.max(0, Math.round(media)), floor, band: B };
}

module.exports = {
  setStage, band, SAFE_TOP, SAFE_BOT,
  titleMetrics, bodyMetrics, fillType,
  mediaShape, ratioOf, isCapture, cropBandFor, CROP_PHOTO, CROP_CAPTURE, DEFAULT_RATIO,
  patternFor, patternFits, FAMILY,
  scrim, plateHtml, innerPlate, shimHtml, sweepHtml, sweepTween, kenBurnsTween,
  railHtml, metricStripHtml, captionHtml, chapterHtml,
  solveStack,
  get PAD() { return PAD; },
  get COL() { return COL; },
  get RW() { return RW; },
  get RH() { return RH; },
};
