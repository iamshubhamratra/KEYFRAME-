// DESIGN FINGERPRINT — how different is this template from every other one, measured.
//
// THE PROBLEM THIS SOLVES. Ask a model for ten templates and you get ten of the same template:
// same stacked composition, same camera set, same entrance, a different accent colour each time.
// That is the failure mode the batch generator exists to avoid, and prose in a prompt ("make them
// genuinely different") does not prevent it — nothing measures whether it worked.
//
// So diversity is measured, not requested. Every FilmKit template — the 89 shipped skins and every
// generated one — is the SAME data structure (film_skins/<slug>.js exports SKIN, and a validated
// TemplateSpec is that structure before it is written to disk). One extractor therefore reads both
// a candidate design and the installed library, which is what makes "is this new?" answerable
// against the whole catalogue rather than only against the current batch.
//
// WHY THIS IS DETERMINISTIC AND NOT AN LLM. A model scoring its own output for novelty is the
// least reliable judge available: it is not reproducible, it costs a call per comparison, and it
// cannot see the 126 packs already installed. Every dimension below is a number read off the
// design, so the same pair always scores the same, a rejection can be explained in terms the
// generator can act on ("your camera set and entrance are identical to star-watch"), and comparing
// against the entire library costs nothing.
//
// THE DIMENSIONS ARE THE PRODUCT SPEC'S. §6 lists composition, layout, typography, animation,
// transitions, colour, asset placement, background, shape language, camera, scene structure and
// motion timing. Each maps to fields the engine actually renders from, so a design that scores as
// different IS different on screen — not merely different in its description.

const path = require("node:path");
const fs = require("node:fs");
const stage = require("../services/film_stage");
const paths = require("./paths");

// ---------------------------------------------------------------- primitives

const BEATS = ["hook", "statement", "feature", "montage", "stats", "cta", "app"];

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const clamp01 = (v) => Math.max(0, Math.min(1, v));

// Hue in turns (0..1), so 350° and 10° are close rather than opposite.
function hueTurn(hex) {
  try { return clamp01(stage.hueOf(hex) / 360); } catch { return 0; }
}
function lumaOf(hex) {
  try { return clamp01(stage.relLum(hex)); } catch { return 0; }
}

// Circular distance on a 0..1 turn.
const hueDist = (a, b) => { const d = Math.abs(a - b) % 1; return Math.min(d, 1 - d) * 2; };

// Jaccard distance over small sets — the right measure for "which cameras/mechanics/layers does
// this design use", where ORDER matters far less than membership.
function setDist(a, b) {
  const A = new Set(a.filter(Boolean).map(String));
  const B = new Set(b.filter(Boolean).map(String));
  if (!A.size && !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return 1 - inter / (A.size + B.size - inter);
}

// Ordered-sequence distance, for the things where order IS the design: the camera CYCLE and the
// per-beat ground alternation both read differently when the same members are rearranged.
function seqDist(a, b) {
  const n = Math.max(a.length, b.length);
  if (!n) return 0;
  let diff = 0;
  for (let i = 0; i < n; i++) if (String(a[i]) !== String(b[i])) diff++;
  return diff / n;
}

const numDist = (a, b, scale) => clamp01(Math.abs(num(a) - num(b)) / (scale || 1));

function vecDist(a, b, scale) {
  const n = Math.max(a.length, b.length);
  if (!n) return 0;
  let s = 0;
  for (let i = 0; i < n; i++) s += numDist(a[i], b[i], scale);
  return clamp01(s / n);
}

// ---------------------------------------------------------------- extraction

// Read a design (a validated spec, or a loaded SKIN — they are the same shape) into the twelve
// vectors the comparison is made of. Everything is normalised here so the distance functions
// never have to know what a `top` or an `em` means.
function fingerprint(design, meta = {}) {
  const d = design || {};
  const palette = typeof d.palette === "function" ? d.palette({}) : (d.palette || {});
  const look = d.look || {};
  const beat = (k) => look[k] || {};
  const hex = (roleOrHex) => {
    const v = palette[roleOrHex];
    return typeof v === "string" ? v : (typeof roleOrHex === "string" && roleOrHex[0] === "#" ? roleOrHex : null);
  };

  const roles = Object.keys(palette);
  const hues = roles.map((k) => palette[k]).filter((h) => typeof h === "string").map(hueTurn).sort((a, b) => a - b);
  const lumas = roles.map((k) => palette[k]).filter((h) => typeof h === "string").map(lumaOf).sort((a, b) => a - b);

  const stageH = String(d.stage || meta.stage || "portrait") === "landscape" ? 1080 : 1920;
  const tops = BEATS.map((k) => num(beat(k).top) / stageH);        // where copy sits, as a fraction
  const sizes = BEATS.map((k) => num(beat(k).size) / 220);          // display type scale
  const worlds = BEATS.map((k) => (beat(k).world ? 1 : 0));         // the backdrop alternation
  const grounds = BEATS.map((k) => String(beat(k).bg || ""));       // which ground each beat paints
  const aligns = BEATS.map((k) => String(beat(k).align || "left"));

  const mag = d.mag || {};
  const boxes = d.boxes || {};
  const world = (d.world && Array.isArray(d.world.layers)) ? d.world.layers : [];

  return {
    id: meta.id || meta.slug || d.label || "",
    slug: meta.slug || "",
    name: meta.name || d.label || meta.slug || "",
    source: meta.source || "spec",

    // 1 COMPOSITION — where things sit in the frame, beat by beat.
    composition: { tops, aligns, stage: String(d.stage || meta.stage || "portrait") },

    // 2 LAYOUT — the picture geometry the spec declares (see film_beats.mediaBoxes).
    layout: {
      feature: [num(boxes.feature && boxes.feature.w, 0.867), num(boxes.feature && boxes.feature.h, 0.306)],
      montage: num(boxes.montage && boxes.montage.h, 0.152),
      statement: num(boxes.statement && boxes.statement.h, 0.224),
    },

    // 3 TYPOGRAPHY — the face pair is the loudest signal in the whole design.
    typography: {
      display: String(d.display || ""),
      body: String(d.body || ""),
      mono: String(d.mono || ""),
      metrics: [num(d.em, 0.55) / 0.9, num(d.titleLine, 1.05) / 1.4],
      sizes,
    },

    // 4 ANIMATION — entrances and how far things travel.
    animation: {
      presets: [String(d.titlePreset || ""), String(d.itemPreset || "")],
      magnitude: [num(mag.x), num(mag.y), num(mag.rot), num(mag.skew), num(mag.zin), num(mag.zout)],
      energy: [num(d.energy, 1), num(d.ambient, 1.5) / 3],
    },

    // 5 CAMERA / TRANSITIONS — the cycle, as a set AND as an order.
    camera: { cams: (d.cams || []).map(String), cadence: [num(d.camMul, 3) / 6, num(d.camOff, 0) / 6] },

    // 6 COLOUR — hue spread, lightness spread, and whether the ground is dark.
    color: { hues, lumas, dark: d.dark ? 1 : 0, ground: String((d.ground && d.ground.kind) || "flat") },

    // 7 ASSET PLACEMENT — card and tile treatments, which is how pictures are presented.
    assets: {
      card: String((beat("feature").card && beat("feature").card.v) || ""),
      chips: String((beat("feature").chips && beat("feature").chips.v) || ""),
      tile: String((beat("montage").tile && beat("montage").tile.v) || "tile"),
      radii: [num(beat("feature").card && beat("feature").card.r, 28) / 40, num(beat("montage").tile && beat("montage").tile.r, 22) / 40],
    },

    // 8 BACKGROUND — the animated world, by layer kind and density.
    background: { kinds: world.map((l) => String(l.kind)), count: clamp01(world.length / 6) },

    // 9 SHAPE LANGUAGE
    shape: { badge: String(d.badge || ""), icon: String((d.icon && d.icon.shape) || ""), stroke: (d.icon && d.icon.stroke) ? 1 : 0 },

    // 10 SCENE STRUCTURE — which interaction mechanics the pack owns.
    structure: { variants: Object.entries(d.variants || {}).map(([k, v]) => `${k}:${v}`), worlds, grounds },

    // 11 MOTION TIMING — the in/out shape of every entrance.
    timing: [num(mag.inn, 0.24), num(mag.out, 0.82), num(mag.slide, 0.24), num(mag.driftZ, 0.045) * 10],

    // 12 SUBJECT — category and tags. Weak on its own; useful for spotting "another SaaS blue one".
    subject: { category: String(meta.category || d.category || ""), tags: (meta.tags || d.tags || []).map((t) => String(t).toLowerCase()) },

    // Kept for reporting, never compared.
    hexes: roles.map((k) => palette[k]).filter((h) => typeof h === "string"),
  };
}

// ---------------------------------------------------------------- comparison

// The weights say what "a different template" MEANS. Typography, colour and composition are what a
// viewer names first, so they carry the most; shape language and subject are corroborating detail.
// They sum to 1, so a similarity is directly a percentage.
const WEIGHTS = Object.freeze({
  typography: 0.16,
  color: 0.15,
  composition: 0.13,
  animation: 0.12,
  camera: 0.10,
  structure: 0.09,
  background: 0.08,
  assets: 0.07,
  layout: 0.05,
  timing: 0.03,
  shape: 0.01,
  subject: 0.01,
});

// Per-dimension distance in 0..1, where 1 is "shares nothing".
function dimensionDistances(a, b) {
  const fontPair = (x) => `${x.typography.display}|${x.typography.body}`;
  return {
    typography: clamp01(
      (fontPair(a) === fontPair(b) ? 0 : (a.typography.display === b.typography.display || a.typography.body === b.typography.body ? 0.55 : 1)) * 0.6
      + vecDist(a.typography.metrics, b.typography.metrics, 1) * 0.2
      + vecDist(a.typography.sizes, b.typography.sizes, 1) * 0.2),
    color: clamp01(
      vecDist(a.color.hues, b.color.hues, 1) * 0.5
      + vecDist(a.color.lumas, b.color.lumas, 1) * 0.2
      + (a.color.dark === b.color.dark ? 0 : 1) * 0.2
      + (a.color.ground === b.color.ground ? 0 : 1) * 0.1),
    composition: clamp01(
      vecDist(a.composition.tops, b.composition.tops, 0.6) * 0.7
      + seqDist(a.composition.aligns, b.composition.aligns) * 0.2
      + (a.composition.stage === b.composition.stage ? 0 : 1) * 0.1),
    animation: clamp01(
      seqDist(a.animation.presets, b.animation.presets) * 0.5
      + vecDist(a.animation.magnitude, b.animation.magnitude, 1) * 0.3
      + vecDist(a.animation.energy, b.animation.energy, 1) * 0.2),
    camera: clamp01(setDist(a.camera.cams, b.camera.cams) * 0.7 + seqDist(a.camera.cams, b.camera.cams) * 0.2 + vecDist(a.camera.cadence, b.camera.cadence, 1) * 0.1),
    structure: clamp01(setDist(a.structure.variants, b.structure.variants) * 0.5 + seqDist(a.structure.worlds, b.structure.worlds) * 0.25 + seqDist(a.structure.grounds, b.structure.grounds) * 0.25),
    background: clamp01(setDist(a.background.kinds, b.background.kinds) * 0.8 + numDist(a.background.count, b.background.count, 1) * 0.2),
    assets: clamp01(
      (a.assets.card === b.assets.card ? 0 : 1) * 0.4
      + (a.assets.chips === b.assets.chips ? 0 : 1) * 0.2
      + (a.assets.tile === b.assets.tile ? 0 : 1) * 0.2
      + vecDist(a.assets.radii, b.assets.radii, 1) * 0.2),
    layout: clamp01(vecDist(a.layout.feature, b.layout.feature, 0.5) * 0.6 + numDist(a.layout.montage, b.layout.montage, 0.25) * 0.2 + numDist(a.layout.statement, b.layout.statement, 0.3) * 0.2),
    timing: vecDist(a.timing, b.timing, 1),
    shape: clamp01(((a.shape.badge === b.shape.badge ? 0 : 1) + (a.shape.icon === b.shape.icon ? 0 : 1) + (a.shape.stroke === b.shape.stroke ? 0 : 1)) / 3),
    subject: clamp01((a.subject.category === b.subject.category ? 0.4 : 1) * 0.5 + setDist(a.subject.tags, b.subject.tags) * 0.5),
  };
}

/** similarity(a, b) -> { similarity, uniqueness, dimensions, sharedWith } — all 0..100. */
function compare(a, b) {
  const dist = dimensionDistances(a, b);
  let weighted = 0;
  for (const [k, w] of Object.entries(WEIGHTS)) weighted += w * (1 - dist[k]);
  const similarity = Math.round(clamp01(weighted) * 100);
  return {
    similarity,
    uniqueness: 100 - similarity,
    dimensions: Object.fromEntries(Object.entries(dist).map(([k, v]) => [k, Math.round((1 - v) * 100)])),
  };
}

// The dimensions this candidate shares most with its nearest neighbour, worst first — the text a
// regeneration brief is built from, so a rejection tells the model what to change.
function overlapNotes(cmp, other) {
  return Object.entries(cmp.dimensions)
    .filter(([, v]) => v >= 70)
    .sort((x, y) => y[1] - x[1])
    .slice(0, 4)
    .map(([k, v]) => `${k} ${v}% like "${other.name || other.slug}"`);
}

// ---------------------------------------------------------------- the library
//
// Every installed pack that CAN be fingerprinted, which is every FilmKit skin: the shipped ones and
// everything this system has ever generated. A hand-written composer (scene_kit, om_stage, the
// bespoke ports) has no SKIN to read, so it contributes its manifest's palette and fonts only —
// enough to catch "another dark blue Inter template", not enough to compare motion. Better a
// partial comparison than pretending those packs do not exist.
let _libCache = null;
let _libStamp = 0;

function loadLibrary({ maxAgeMs = 60000 } = {}) {
  const now = Date.now();
  if (_libCache && now - _libStamp < maxAgeMs) return _libCache;

  const out = [];
  const skinDir = path.join(__dirname, "..", "services", "film_skins");
  let files = [];
  try { files = fs.readdirSync(skinDir).filter((f) => f.endsWith(".js") && !f.startsWith("_")); } catch { /* none installed */ }
  for (const f of files) {
    const slug = f.replace(/\.js$/, "").replace(/_/g, "-");
    try {
      const mod = require(path.join(skinDir, f));
      if (!mod || !mod.SKIN) continue;
      out.push(fingerprint(mod.SKIN, { slug, name: mod.SKIN.label || slug, source: "skin" }));
    } catch { /* a skin that will not load is the composer scan's problem, not ours */ }
  }

  // The rest of the registry, from pack.json — colours, fonts and tags only.
  try {
    const registry = require("../services/frame_registry");
    const manifest = require("../services/frame_manifest");
    const seen = new Set(out.map((x) => x.slug));
    for (const slug of registry.listPacks()) {
      if (seen.has(slug)) continue;
      const m = manifest.getManifest(slug);
      if (!m) continue;
      const palette = {};
      for (const [k, v] of Object.entries(m.colors || {})) if (typeof v === "string" && v[0] === "#") palette[k] = v;
      out.push(fingerprint(
        { palette, display: (m.fonts || [])[0] || "", body: (m.fonts || [])[1] || "", dark: !!(m.surface && !m.surface.lightCinematic) },
        { slug, name: m.label || slug, source: "manifest", category: m.category, tags: m.tags },
      ));
    }
  } catch { /* the registry is optional here */ }

  _libCache = out;
  _libStamp = now;
  return out;
}

function invalidateLibrary() { _libCache = null; }

// CALIBRATION — what a similarity number MEANS, measured against the library rather than assumed.
//
// Raw similarity is not a usable gate on its own, and the data says why. Every FilmKit pack is one
// engine wearing a different skin: seven fixed beats, one camera vocabulary, one preset vocabulary.
// Measured across the 92 shipped skins, a pack's nearest neighbour sits at 69-82% similar
// (p25 75, p50 77, p90 82) — so a raw ">= 80 uniqueness" threshold, read as "similarity <= 20",
// would reject ALL 92 templates the library already ships, including ones nobody would call alike.
// That is precisely the mistake qa.js's brand.contrast made and documents.
//
// So the reported score is calibrated: BASELINE is where a typical distinct pair of shipped packs
// sits, and a candidate at or below it scores 100. A clone (100% similar — verified: a template
// and its own cloned version score exactly that) scores 0. In between is linear. A threshold of 80
// then means "meaningfully more distinct than the median shipped pair", which is a claim about
// this library rather than a number pulled out of the air.
const BASELINE_SIMILARITY = 77;      // p50 of nearest-neighbour similarity across the shipped skins
const CLONE_SIMILARITY = 100;

function uniquenessScore(similarity) {
  const s = Math.max(0, Math.min(100, Number(similarity) || 0));
  if (s <= BASELINE_SIMILARITY) return 100;
  return Math.round(100 * (1 - (s - BASELINE_SIMILARITY) / (CLONE_SIMILARITY - BASELINE_SIMILARITY)));
}

/**
 * Score a candidate design against the batch so far AND the installed library.
 *
 * Returns { uniqueness, rawUniqueness, similarity, nearest, dimensions, notes, comparedAgainst }.
 * The comparison is against the SINGLE most similar neighbour, never an average — a design is only
 * as novel as its closest twin, and averaging lets one near-duplicate hide behind ninety unrelated
 * packs. `uniqueness` is the calibrated 0-100 score above; `rawUniqueness` is 100 - similarity,
 * kept for reporting so the underlying measurement is never hidden behind its calibration.
 */
function scoreAgainst(design, { meta = {}, peers = [], includeLibrary = true } = {}) {
  const me = design && design.composition ? design : fingerprint(design, meta);
  const others = [
    ...peers.map((p) => (p && p.composition ? p : fingerprint(p, {}))),
    ...(includeLibrary ? loadLibrary() : []),
  ].filter((o) => o && o.slug !== me.slug);

  let worst = { similarity: -1 };
  let nearest = null;
  for (const o of others) {
    const cmp = compare(me, o);
    if (cmp.similarity > worst.similarity) { worst = cmp; nearest = o; }
  }
  if (!nearest) return { uniqueness: 100, rawUniqueness: 100, similarity: 0, nearest: null, dimensions: {}, notes: [], comparedAgainst: 0 };
  return {
    uniqueness: uniquenessScore(worst.similarity),
    rawUniqueness: worst.uniqueness,
    similarity: worst.similarity,
    nearest: { slug: nearest.slug, name: nearest.name, source: nearest.source },
    dimensions: worst.dimensions,
    notes: overlapNotes(worst, nearest),
    comparedAgainst: others.length,
  };
}

module.exports = {
  fingerprint, compare, scoreAgainst, loadLibrary, invalidateLibrary,
  uniquenessScore, dimensionDistances, WEIGHTS, BEATS, BASELINE_SIMILARITY,
};
