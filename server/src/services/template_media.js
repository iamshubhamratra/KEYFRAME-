// TEMPLATE MEDIA — what shape each placeholder actually is, in pixels, before anything is
// chosen to go in it.
//
// THE MISSING MODULE. Two files in this repo already import this one by name:
//
//     crop_engine.js:27   "…the distinct slot ratios `template_media.resolveMediaPlan`
//                          says this film actually needs — typically two or three"
//     preflight.js:49     "@param {object} args.mediaPlan  the chosen template's resolved
//                          slot contract (services/template_media.resolveMediaPlan)"
//
// It was never written. That is the whole reason the content-aware crop engine sits dead
// in the tree with exactly one caller: it was designed to be driven by a slot contract
// that did not exist, so nothing could tell it which aspect ratios to analyse for.
//
// WHY THE NUMBER WAS MISSING. A composer sizes a media box by mixing units — the hero
// plate in the charged family is `width:45cqw; top:13%; bottom:13%`, where `cqw` is a
// percentage of the container's WIDTH and `%` is a percentage of its HEIGHT. The box is
// therefore 864x799 at 1920x1080 (aspect 1.08) and 950x730 at 1080x1920 (aspect 1.30),
// and NOTHING COMPUTES EITHER NUMBER. The shape is an accident of the render dimensions.
// Downstream, `template_engine.shapeForWant` (:309) is the only geometry any selector
// sees, and it is a binary portrait-or-landscape predicate:
//
//     if (want === "phone")   return isPortraitAsset;
//     if (want === "desktop") return (x) => !isPortraitAsset(x);
//
// So a 2732x1800 website capture (aspect 1.518) was "compatible" with a 1.08 box, and
// `object-fit:cover` then discarded 28.5% of its width — cutting the site's navigation
// mid-word on both edges of every frame of a shipped film.
//
// WHAT A TEMPLATE DECLARES NOW. Beside the `mediaSlots` map it already publishes, a
// composer adds `mediaGeometry`: the box each slot draws, as FRACTIONS of the canvas, per
// orientation. Fractions rather than pixels because one declaration then serves 16:9,
// 9:16 and every long-form variant, and because it is the form the composer's own CSS is
// already written in.
//
//     const mediaSlots = { chargeplate: ["desktop"], gridburst: ["photo", "photo"] };
//     const mediaGeometry = {
//       chargeplate: {
//         land: [{ wFrac: 0.45, hFrac: 0.74, importance: "hero", flex: [1.20, 1.75] }],
//         port: [{ wFrac: 0.88, hFrac: 0.38, importance: "hero", flex: [1.10, 1.70] }],
//       },
//     };
//
// `flex` is the part that actually removes the crop. It says: this design tolerates the
// plate being any shape between these two ratios, so take the shape the picture already
// has. A 1.518 capture in a slot free to sit in [1.20, 1.75] becomes a 1.518 box and the
// crop is zero — a crop you never take beats the cleverest crop you do.
//
// DECLARING NOTHING IS SAFE. A composer with no `mediaGeometry` yields slots with no
// dimensions, and asset_fit degrades to its content-class default — which still stops
// cropping logos and still uses a real focal point instead of the literal `top center`.
// Adopting this module can only improve a call site, never regress one.
//
// KEPT HONEST BY MEASUREMENT, NOT BY TRUST. `scripts/audit-slot-fit.js` renders every
// pack in headless Chrome and reads the real painted box off the live layout. A
// declaration that drifts from the CSS is a test failure, not a silent lie.

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Aspect buckets are rounded to this many decimals before they are handed to the crop
// engine, which keys its cache the same way — 1.7777 and 1.7778 are one analysis.
const ASPECT_PRECISION = 2;

/**
 * @typedef {object} SlotSpec
 * @property {string}  id          "<sceneId>.<sceneType>.<index>" — unique within a film
 * @property {string}  sceneId
 * @property {string}  sceneType   the archetype drawing it
 * @property {number}  index       position within the scene's slot list
 * @property {string}  want        "desktop" | "phone" | "photo" | "logo" | "vector"
 * @property {number}  w           box width in px at this film's dimensions
 * @property {number}  h           box height in px
 * @property {number}  aspect      w / h
 * @property {[number,number]|null} flex   aspect band the box may reshape within
 * @property {string}  importance  "hero" | "support" | "accent"
 * @property {string}  fit         "auto" | "cover" | "contain"
 * @property {number}  minPx       shortest source side that reads at this size
 * @property {string[]|null} allow content classes this slot accepts
 */

// What each `want` string means, geometrically, when a template says nothing more.
// These are defaults, not opinions about a specific design — a composer that declares
// `mediaGeometry` overrides every one of them.
const WANT_DEFAULTS = {
  desktop: { importance: "hero", fit: "auto", allow: ["ui", "photo"], minPx: 900 },
  phone: { importance: "hero", fit: "auto", allow: ["ui", "photo"], minPx: 480 },
  photo: { importance: "support", fit: "auto", allow: null, minPx: 600 },
  logo: { importance: "accent", fit: "contain", allow: ["logo", "vector"], minPx: 120 },
  vector: { importance: "accent", fit: "contain", allow: ["vector", "logo"], minPx: 120 },
};

/** The minimum source resolution that still reads sharp in a box this size. */
function minPxFor(want, boxW, boxH) {
  const base = (WANT_DEFAULTS[want] || WANT_DEFAULTS.photo).minPx;
  const box = Math.max(num(boxW, 0), num(boxH, 0));
  return box > 0 ? Math.round(Math.max(base * 0.5, box)) : base;
}

/**
 * HOW MANY PICTURES THIS BEAT SHOWS, WHICH IS NOT THE SAME NUMBER IN BOTH ORIENTATIONS.
 *
 * `family.mediaSlots` is a flat map — one slot list per scene type, resolved without ever
 * seeing the film's dimensions. That is why a four-across media wall becomes four slivers
 * in 9:16: the count was decided for 16:9 and portrait inherited it. Several composers
 * already work around it in CSS by stacking the same four tiles vertically, which trades
 * slivers for a scroll of postage stamps.
 *
 * A family may now publish `mediaSlotsPortrait` for the types whose count should change
 * when the frame is tall. Declaring nothing keeps today's behaviour exactly.
 *
 * Fewer, bigger is almost always right in portrait: a 1080-wide frame has room for one
 * picture that can be read, or two that cannot.
 */
function wantsFor(family, sceneType, dims) {
  const W = num(dims && dims.width, 1920), H = num(dims && dims.height, 1080);
  const port = family && family.mediaSlotsPortrait;
  if (W < H && port && Array.isArray(port[sceneType])) return port[sceneType];
  return (family && family.mediaSlots && family.mediaSlots[sceneType]) || [];
}

/**
 * Resolve ONE scene type's media slots into real pixel specs.
 *
 * @param {object} family    the composer module (reads .mediaSlots and .mediaGeometry)
 * @param {string} sceneType the archetype
 * @param {object} dims      { width, height } of the film
 * @param {object} [opts]    { sceneId, wants } — `wants` overrides family.mediaSlots
 * @returns {SlotSpec[]}
 */
function resolveSlots(family, sceneType, dims, { sceneId = null, wants = null } = {}) {
  const W = num(dims && dims.width, 1920), H = num(dims && dims.height, 1080);
  const land = W >= H;
  const list = Array.isArray(wants) ? wants : wantsFor(family, sceneType, { width: W, height: H });
  if (!list.length) return [];

  const geoAll = (family && family.mediaGeometry) || null;
  const geoType = geoAll && geoAll[sceneType] ? geoAll[sceneType] : null;
  // A geometry table may be keyed by orientation, or be a flat array that serves both.
  const geo = Array.isArray(geoType) ? geoType : (geoType ? (land ? geoType.land : geoType.port) : null);

  return list.map((want, i) => {
    const w0 = String(want || "photo");
    const d = WANT_DEFAULTS[w0] || WANT_DEFAULTS.photo;
    const g = Array.isArray(geo) ? (geo[i] || geo[geo.length - 1] || null) : null;
    const boxW = g ? Math.round(clamp(num(g.wFrac, 0), 0, 1) * W) : 0;
    const boxH = g ? Math.round(clamp(num(g.hFrac, 0), 0, 1) * H) : 0;
    const flex = g && Array.isArray(g.flex) && g.flex.length === 2 ? [num(g.flex[0], 0), num(g.flex[1], 0)] : null;
    return {
      id: `${sceneId || "s"}.${sceneType}.${i}`,
      sceneId: sceneId || null,
      sceneType,
      index: i,
      want: w0,
      w: boxW, h: boxH,
      aspect: boxW > 0 && boxH > 0 ? Math.round((boxW / boxH) * 1000) / 1000 : 0,
      flex: flex && flex[0] > 0 && flex[1] >= flex[0] ? flex : null,
      importance: (g && g.importance) || d.importance,
      fit: (g && g.fit) || d.fit,
      minPx: (g && num(g.minPx, 0)) || minPxFor(w0, boxW, boxH),
      allow: (g && g.allow) || d.allow,
    };
  });
}

/**
 * THE FILM'S WHOLE SLOT CONTRACT — every placeholder the chosen template will draw, with
 * its real geometry, plus the distinct aspect ratios the crop engine must analyse for.
 *
 * `crop_engine.annotateAssets` takes those aspects and produces one focal point per
 * (image, aspect) pair, because the best crop of an image is a property of the (image,
 * box) PAIR and not of the image. A film typically needs two or three distinct ratios, so
 * this keeps the analysis bounded no matter how many scenes there are.
 *
 * @param {object} args
 * @param {object} args.family    the composer module
 * @param {object[]} args.scenes  [{ id, type }] — the routed scene list, when known
 * @param {object} args.dims      { width, height }
 * @returns {{ slots: SlotSpec[], aspects: number[], byScene: Map<string, SlotSpec[]>, demand: number }}
 */
function resolveMediaPlan({ family = null, scenes = [], dims = null } = {}) {
  const byScene = new Map();
  const slots = [];
  for (const sc of (Array.isArray(scenes) ? scenes : [])) {
    if (!sc) continue;
    const type = sc.type || sc.sceneType;
    if (!type) continue;
    const s = resolveSlots(family, type, dims, { sceneId: sc.id || sc.sceneId || null, wants: sc.wants || null });
    if (!s.length) continue;
    byScene.set(String(sc.id || sc.sceneId || slots.length), s);
    slots.push(...s);
  }
  const aspects = [...new Set(
    slots.map((s) => s.aspect).filter((a) => a > 0.05 && a < 20)
      .map((a) => Number(a.toFixed(ASPECT_PRECISION))),
  )].sort((a, b) => a - b);
  // THE SHAPE services/preflight.js HAS BEEN WAITING FOR.
  //
  // preflight.js:267 carries a whole gate keyed on `mediaPlan.placeholders` — critical
  // slots filled, quality in the hero box, authored-versus-derived severity — and it has
  // never run once, because `mediaPlan` is always null: the module it names in its own
  // JSDoc (`services/template_media.resolveMediaPlan`) did not exist. Emitting the shape
  // it expects is what switches that gate on.
  //
  // `source` decides how loud a miss is. "authored" means the template DECLARED its
  // geometry, so an empty critical box is a real defect the pack can be held to;
  // "derived" means we are working from want-strings alone and the slot list is a floor.
  const authored = !!(family && family.mediaGeometry);
  const placeholders = slots.map((s) => ({
    id: s.id,
    sceneId: s.sceneId,
    kind: (s.want === "logo" || s.want === "vector") ? "logos" : s.want,
    priority: s.importance === "hero" ? "critical" : "normal",
    fitContain: s.fit === "contain",
    w: s.w, h: s.h, aspect: s.aspect, minPx: s.minPx,
  }));
  return { slots, aspects, byScene, demand: slots.length, placeholders, source: authored ? "authored" : "derived" };
}

// THE 255 PACKS THAT CANNOT DECLARE — MEASURED INSTEAD.
//
// 197 packs render a bundled template this repo does not author, and 50 more are long-form
// FilmKit skins whose geometry lives in generated files; neither can publish a
// `mediaGeometry`. Without one, the crop engine was handed a hardcoded guess
// ([1.6, 1.0, 0.75] in landscape) and analysed three ratios those films never draw — so
// every focal point it produced for 82% of the library was computed for the wrong box.
//
// These are not guesses. Each row is the set of box aspects `scripts/audit-slot-fit.js`
// actually MEASURED in headless Chrome for that renderer, taken as the four most frequent
// shapes it paints. Regenerate after a template change with:
//
//   npm run audit:slotfit:long   &&   node scripts/audit-slot-fit.js --help
//
// A declared `mediaGeometry` always wins; this only fills the gap where there can be none.
const MEASURED_ASPECTS = {
  "bauhaus-riot": { land: [0.73,1.15,1.61,1.74], port: [0.78,1.35,1.54,1.65] },
  "bloom-fable": { land: [0.69,1.18,1.2,1.66], port: [1.34,1.38,1.59,1.65] },
  "blueprint": { land: [0.7,1.46,1.76], port: [0.73,1.51,1.52] },
  // PORTRAIT REGENERATED FOR ENGINE_REV 6. The old row was one list used at both aspects, and
  // its 2.18 was literally the broken statement box (936/430) that the portrait pass deleted —
  // so the crop engine was computing focal points for a shape no film draws any more, and none
  // for the shapes they do. These are measured off scripts/film-portrait-audit.js across six
  // skins x 16 beats: captures land at 1.52-1.60, wide stills at ~1.72, portrait stills at
  // ~0.66 (the framed pattern), montage tiles at ~0.81. Landscape is untouched because the
  // landscape compositions are byte-identical (scripts/golden-composers.js).
  "film-*": { land: [0.45,0.65,1.2,2.18], port: [0.66,0.81,1.55,1.72] },
  "genesis": { land: [1,1.56,1.73], port: [1,1.82,1.85] },
  "momentum": { land: [1,1.57,1.83,2.55], port: [0.87,1,1.11] },
  "omelette": { land: [1,1.57,1.62,1.78], port: [1,1.57,1.62,1.78] },
  "showcase": { land: [1,1.72,2.04], port: [1,1.52,1.53] },
};

/**
 * THE ONE CALL A PIPELINE SHOULD MAKE. Declaration first, measurement second, and the
 * generic guess only when a renderer is neither declared nor measured — which is now only
 * a renderer added since the last audit run.
 */
function aspectsFor(rendererKey, composerOrFamily, dims) {
  const declared = aspectsForFamily(composerOrFamily, dims);
  if (declared.length) return declared;
  const measured = measuredAspectsFor(rendererKey, dims);
  if (measured.length) return measured;
  const W = num(dims && dims.width, 1920), H = num(dims && dims.height, 1080);
  return W >= H ? [1.6, 1.0, 0.75] : [1.5, 0.9, 2.6];
}

/** The measured shapes a renderer paints, when it cannot declare them. */
function measuredAspectsFor(rendererKey, dims) {
  const W = num(dims && dims.width, 1920), H = num(dims && dims.height, 1080);
  const k = String(rendererKey || "");
  const row = MEASURED_ASPECTS[k] || (/^film-/.test(k) ? MEASURED_ASPECTS["film-*"] : null);
  if (!row) return [];
  return (W >= H ? row.land : row.port) || [];
}

/**
 * Every aspect ratio a family COULD need, without knowing which scenes will be routed.
 * Used when the crop engine must run before routing is settled — analysing three ratios
 * that might not be used is far cheaper than analysing none and cropping blind.
 */
function aspectsForFamily(family, dims) {
  // ACCEPT A COMPOSER MODULE AS WELL AS A FAMILY. Three call sites passed the module —
  // `PACK_RENDERERS[key].composer` — where the family object was wanted, and because the
  // module has no `mediaSlots` this returned [] and the caller silently fell through to a
  // hardcoded guess set, on packs that DID declare their geometry. Taking either shape is
  // the fix that cannot be got wrong again.
  if (family && !family.mediaSlots && family.FAMILY) family = family.FAMILY;
  const types = Object.keys((family && family.mediaSlots) || {});
  const all = [];
  for (const t of types) all.push(...resolveSlots(family, t, dims).map((s) => s.aspect));
  return [...new Set(all.filter((a) => a > 0.05 && a < 20).map((a) => Number(a.toFixed(ASPECT_PRECISION))))]
    .sort((a, b) => a - b);
}

/**
 * The CSS box for a slot whose shape was resolved against a real asset.
 *
 * Keeps the design's own anchoring — a plate pinned to the right edge stays pinned to the
 * right edge — and gives the difference back to the layout as symmetric space rather than
 * taking it out of the picture. Returns the SAME declaration shape the composer wrote by
 * hand, so adopting it is a substitution and not a rewrite.
 *
 * @param {object} band  the authored band: { side, top, bottom, width } in cqw / fractions
 * @param {object} box   the fitted box from asset_fit.resolveBox: { w, h }
 * @param {object} dims  { width, height }
 * @param {string} align "left" | "right" | "stretch"
 * @param {string} anchor "center" (give the reclaimed space back symmetrically) or
 *                        "start" (keep the band's top edge — for a plate the design pinned
 *                        under a headline, where growing space upward would collide)
 */
function boxCss(band, box, dims, align = "left", anchor = "center") {
  const W = num(dims && dims.width, 1920), H = num(dims && dims.height, 1080);
  const side = num(band && band.side, 6);
  const top0 = num(band && band.top, 0.13);
  const bot0 = num(band && band.bottom, 0.13);
  const wcqw = num(band && band.width, 45);
  const bandH = Math.max(0.05, 1 - top0 - bot0);
  const boxW = num(box && box.w, 0), boxH = num(box && box.h, 0);
  // Nothing measurable — hand back exactly what the composer would have written.
  if (!(boxW > 0 && boxH > 0)) {
    return align === "stretch"
      ? `left:${side}cqw;right:${side}cqw;top:${(top0 * 100).toFixed(2)}%;bottom:${(bot0 * 100).toFixed(2)}%;`
      : `${align}:${side}cqw;top:${(top0 * 100).toFixed(2)}%;bottom:${(bot0 * 100).toFixed(2)}%;width:${wcqw}cqw;`;
  }
  const hFrac = clamp(boxH / H, 0.05, bandH);
  const top = anchor === "start" ? top0 : clamp(top0 + (bandH - hFrac) / 2, 0.01, 0.94);
  const wFrac = clamp(boxW / W, 0.05, 1 - side / 100 * 2);
  return align === "stretch"
    ? `left:${((1 - wFrac) / 2 * 100).toFixed(2)}%;width:${(wFrac * 100).toFixed(2)}%;top:${(top * 100).toFixed(2)}%;height:${(hFrac * 100).toFixed(2)}%;`
    : `${align}:${side}cqw;top:${(top * 100).toFixed(2)}%;height:${(hFrac * 100).toFixed(2)}%;width:${(wFrac * 100).toFixed(2)}%;`;
}

module.exports = {
  WANT_DEFAULTS, ASPECT_PRECISION,
  resolveSlots, resolveMediaPlan, aspectsForFamily, boxCss, minPxFor, wantsFor,
  MEASURED_ASPECTS, measuredAspectsFor, aspectsFor,
};
