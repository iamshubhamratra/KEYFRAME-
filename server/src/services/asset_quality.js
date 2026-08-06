// ASSET QUALITY ENGINE — one 0-100 number and one grade per asset, so "the best image
// goes in the best slot" becomes arithmetic instead of hope.
//
// WHAT WAS MISSING. The pipeline already had THREE opinions about an asset and no way to
// combine them into a ranking a slot could use:
//   • `asset_priority.tierFor`   — WHOSE pixels these are (upload > site > curated > stock)
//   • `creative_director.cdScore` — whether a model thinks the picture suits the film
//   • `asset_priority.assetConfidence` — a blend of the two, 0..1
// None of them looks at the PICTURE. A 320x200 JPEG artefact and a 2732x1800 crisp capture
// are indistinguishable to every one of them if they come from the same source and the
// director liked both. That is why a poor asset can reach a hero slot: nothing in the
// ranking chain could tell that it was poor.
//
// The pixel evidence, meanwhile, was already being COMPUTED and thrown away. Every fetched
// image goes through `asset_sources/util.validateImage`, which measures width, height,
// ratio, alpha, a perceptual hash, the grayscale standard deviation and a
// variance-of-Laplacian SHARPNESS (util.js:224). Of those, `graph.assetSearchAgent` copies
// six onto the wire and drops `sharpness` and `stdev` on the floor (graph.js:742-750) —
// one line before the consumers that would have wanted them, which is the same defect the
// comment right there describes having already fixed once for `dhash`/`dominantColor`.
//
// So this module mostly RECOVERS signal rather than computing new signal. It measures only
// what is genuinely absent, and it is a no-op cost on the happy path.
//
// CALIBRATED, NOT GUESSED. Every threshold below was measured against the real images in
// this repository's job directories:
//
//   asset                          WxH          sharpness   stdev
//   ingest/website_mobile.png      1170x2532    5415.7      36.2
//   ingest/website_section2.png    2732x1800    4321.1      59.1
//   ingest/website.png             2732x1800    2947.6      34.0
//   ingest/website_section3.png    2732x1800    1000.5      17.2   <- a near-blank page section
//   brand_assets/a32.webp          875x985       388.5      22.9
//   uploads/u1.png (solid fill)    800x500         0.0       0.9   <- already hard-rejected
//
// Screenshots carry text and UI chrome, so their Laplacian variance runs several times a
// photograph's; the thresholds are therefore normalized PER KIND. A single global cutoff
// would call every photograph blurry.
//
// TIER IS A FLOOR, NEVER A CEILING. `asset_priority` states the house law: a stock photo
// can never outrank a user upload, "not because a prompt asks nicely, but because
// 40*1000 + 100 < 100*1000 + 0". This module does not overturn that. A blurry upload is
// still the user's upload and still outranks stock — but it is graded honestly, so the
// placement stage can put the user's SHARP upload in the hero and the soft one in a
// supporting slot instead of picking whichever came first.
//
// PURE + FAIL-OPEN. `scoreAsset` is synchronous and pure over already-measured metadata.
// `measureMissing` is the only async part, and every failure degrades to "unknown", which
// scores NEUTRAL — an unmeasurable image is never treated as a bad one.

const { tierFor, isOwned, isLogo, categorize } = require("./asset_priority");

// ---------------------------------------------------------------- calibration

// Variance-of-Laplacian bands, per kind. `soft` is where a viewer starts to notice; `crisp`
// is where more sharpness stops helping. Between them the score ramps linearly.
const SHARPNESS_BANDS = {
  screenshot: { soft: 400, crisp: 2800 },  // text + UI chrome: high baseline
  photo: { soft: 120, crisp: 900 },        // continuous tone: much lower baseline
  vector: { soft: 0, crisp: 1 },           // vectors are resolution-independent
};

// Grayscale standard deviation. Below `flat` the image carries no information (a solid
// banner, a blank page section); above `rich` it is visually dense. util.validateImage
// already HARD-REJECTS below 5, so this band only grades what survived that.
const STDEV_BANDS = { flat: 12, rich: 34 };

// Bits per pixel of the stored file. Very low bpp on a large image is the signature of
// heavy re-compression (the classic "found on the web twice" artefact). Very high is
// simply a PNG and carries no penalty.
const BPP_BANDS = { poor: 0.35, fine: 1.2 };

// Effective resolution, expressed as the LINEAR pixel budget an asset brings to the slot it
// must fill. 1.0 means the image has exactly as many pixels across as the slot needs; below
// 1.0 it is being upscaled and will look soft no matter how sharp the source was.
const SCALE_BANDS = { starved: 0.55, ample: 1.15 };

// Grade cutoffs on the final 0-100 score.
const GRADES = [
  ["hero", 78],
  ["high", 62],
  ["medium", 45],
  ["low", 28],
  ["reject", -Infinity],
];
const GRADE_RANK = { hero: 4, high: 3, medium: 2, low: 1, reject: 0 };

// Component weights. They sum to 100 so a component's weight is readable as "how many
// points of the final score this can move".
const W = {
  resolution: 20,
  sharpness: 22,
  information: 12,
  compression: 8,
  color: 8,
  subject: 10,
  editorial: 20,
};

// ---------------------------------------------------------------- helpers

// Numeric coercion with a REAL default. The obvious one-liner is wrong here:
// `Number(null)` and `Number(false)` are both 0, and 0 is finite, so
// `num(slot && slot.areaShare, 0.33)` returned 0 whenever `slot` was absent — which made
// every slot one pixel wide and every resolution score a perfect 20/20. Caught by the
// first end-to-end run ("into ~1px slot (x2217.57)"). Absent must mean absent.
const num = (v, d = null) => {
  if (v === null || v === undefined || v === "" || typeof v === "boolean") return d;
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
const clamp01 = (v) => Math.max(0, Math.min(1, v));
// Linear ramp from lo->0 to hi->1, with a neutral 0.6 for an unmeasurable input. Neutral is
// deliberately above the midpoint: "we could not measure this" must not read as "this is bad".
function ramp(v, lo, hi) {
  if (v == null || !Number.isFinite(v)) return 0.6;
  if (hi <= lo) return 0.6;
  return clamp01((v - lo) / (hi - lo));
}

/**
 * The measurement KIND for an asset — which calibration band applies. Deliberately coarser
 * than `asset_priority.categorize`: a dashboard and a landing-page capture are the same
 * measurement problem even though they are different editorial categories.
 */
function measureKind(a) {
  const cat = categorize(a);
  if (cat === "icon" || cat === "logo") return "vector";
  if (cat === "screenshot" || cat === "dashboard") return "screenshot";
  if (String(a && a.kindHint || "") === "vector") return "vector";
  if (/\.(svg|svgz)($|\?)/i.test(String(a && a.path || ""))) return "vector";
  return "photo";
}

// ---------------------------------------------------------------- components

// How much resolution this asset brings to the slot it must fill. With no slot, judge it
// against a 1080p-class frame — the smallest thing this pipeline renders.
function resolutionScore(a, slot, frame) {
  const w = num(a && a.width), h = num(a && a.height);
  if (!w || !h) return { v: 0.6, note: "dimensions unknown" };
  if (measureKind(a) === "vector") return { v: 1, note: "vector — resolution-independent" };

  const framePx = (num(frame && frame.width, 1920) * num(frame && frame.height, 1080));
  // `areaShare` is the fraction of the frame this slot occupies (template_media annotates
  // it). Falling back to a third of the frame keeps this meaningful when no plan exists.
  const share = num(slot && slot.areaShare, 0.33);
  const slotPx = Math.max(1, framePx * share);
  // Compare LINEAR pixel density, not area: halving both dimensions quarters the area but
  // only halves the perceived resolution, and it is the linear figure a viewer sees.
  const scale = Math.sqrt((w * h) / slotPx);
  return {
    v: ramp(scale, SCALE_BANDS.starved, SCALE_BANDS.ample),
    note: `${w}x${h} into ~${Math.round(Math.sqrt(slotPx))}px slot (x${scale.toFixed(2)})`,
  };
}

function sharpnessScore(a, kind) {
  const s = num(a && a.sharpness);
  const band = SHARPNESS_BANDS[kind] || SHARPNESS_BANDS.photo;
  if (kind === "vector") return { v: 1, note: "vector" };
  if (s == null) return { v: 0.6, note: "not measured" };
  return { v: ramp(s, band.soft, band.crisp), note: `laplacian ${Math.round(s)} (soft<${band.soft})` };
}

function informationScore(a) {
  const sd = num(a && a.stdev);
  if (sd == null) return { v: 0.6, note: "not measured" };
  return { v: ramp(sd, STDEV_BANDS.flat, STDEV_BANDS.rich), note: `stdev ${sd.toFixed(1)}` };
}

function compressionScore(a) {
  const bpp = num(a && a.bpp);
  if (bpp == null) return { v: 0.6, note: "not measured" };
  // Above `fine` there is no further credit — a lossless PNG is not "better" than a good JPEG.
  return { v: ramp(Math.min(bpp, BPP_BANDS.fine), BPP_BANDS.poor, BPP_BANDS.fine), note: `${bpp.toFixed(2)} bpp` };
}

// Colour balance from the dominant colour already computed at fetch time. Two failure modes
// are penalized: a near-neutral mud (nothing to look at, and it will disappear against any
// pack ground) and a fully-blown single hue (a flat colour card posing as a photograph).
// Everything in between scores full marks — this is a guard, not a taste test.
function colorScore(a) {
  const hex = String(a && a.dominantColor || "");
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) return { v: 0.7, note: "no dominant colour" };
  const r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const v = max / 255;
  const sat = max === 0 ? 0 : (max - min) / max;
  if (sat > 0.94 && v > 0.94) return { v: 0.35, note: `blown-out ${hex}` };
  if (sat < 0.05 && (v < 0.10 || v > 0.96)) return { v: 0.45, note: `near-monochrome ${hex}` };
  return { v: 1, note: hex };
}

// Does the image have a SUBJECT, or is it uniformly busy? `subjectFocus` is the fraction of
// total edge energy that falls inside the best crop window — measured for free while the
// crop engine is already analysing the image (crop_engine.subjectConcentration), so this
// costs nothing extra when cropping ran. Neutral when it did not.
function subjectScore(a) {
  const c = num(a && a.subjectFocus);
  if (c == null) return { v: 0.6, note: "not measured" };
  // 1/aspect-share would be the uniform baseline; anything meaningfully above it means the
  // detail clusters somewhere, which is what "has a subject" means for a crop.
  return { v: clamp01((c - 0.35) / 0.45), note: `energy concentration ${(c * 100).toFixed(0)}%` };
}

// The EDITORIAL opinion — the pipeline's existing signals, unchanged in meaning. This is
// the one component that is not about pixels, and it is capped at 20 points on purpose: a
// director's enthusiasm should not be able to promote a 200px artefact into a hero.
function editorialScore(a) {
  const cd = num(a && a.cdScore);
  const clip = num(a && a.clipRelevance);
  const parts = [];
  if (cd != null) parts.push(clamp01(cd > 1 ? cd / 100 : cd));
  if (clip != null) parts.push(clamp01(clip));
  if (!parts.length) {
    // No model has looked at it. Owned material gets the benefit of the doubt; stock does not.
    return { v: isOwned(a) ? 0.75 : 0.5, note: "unreviewed" };
  }
  let v = parts.reduce((s, x) => s + x, 0) / parts.length;
  if (a && a.visionOk === false) v = Math.min(v, 0.4);
  if (a && a.__layoutDemoted) v = Math.min(v, 0.5);
  return { v, note: `cd ${cd == null ? "-" : Math.round(cd)}${clip == null ? "" : ` clip ${clip.toFixed(2)}`}` };
}

// ---------------------------------------------------------------- main

/**
 * Score ONE asset, optionally against the slot it is being considered for.
 *
 * @param {object} a       the wire asset
 * @param {object} opts
 * @param {object} opts.slot   a resolved placeholder from template_media (optional)
 * @param {object} opts.frame  { width, height } of the render (optional)
 * @returns {{score:number, grade:string, kind:string, tier:number, parts:object, reasons:string[], vetoes:string[]}}
 */
function scoreAsset(a, { slot = null, frame = null } = {}) {
  const kind = measureKind(a);
  const tier = tierFor(a);

  const comp = {
    resolution: resolutionScore(a, slot, frame),
    sharpness: sharpnessScore(a, kind),
    information: informationScore(a),
    compression: compressionScore(a),
    color: colorScore(a),
    subject: subjectScore(a),
    editorial: editorialScore(a),
  };

  let score = 0;
  const parts = {};
  for (const k of Object.keys(W)) {
    const pts = W[k] * comp[k].v;
    parts[k] = Math.round(pts * 10) / 10;
    score += pts;
  }
  score = Math.round(score);

  // --- floors and vetoes -------------------------------------------------------------
  const vetoes = [];
  // A logo is not judged as a picture: it is a mark, placed contain-fit, and its "quality"
  // is whether it is the right logo. Grading one against photographic sharpness would
  // demote every clean wordmark. It always grades `high` and is never rejected.
  if (isLogo(a)) {
    return {
      score: Math.max(score, 70), grade: "high", kind, tier,
      parts, reasons: ["logo — graded as a brand mark, not a photograph"], vetoes,
    };
  }
  // THE TIER FLOOR. Owned material (the user's uploads, their own site capture, their own
  // harvested logo) is never REJECTED by a pixel measurement. The user chose it; the most
  // this engine may do is rank it below their better material.
  if (isOwned(a) && score < GRADES[3][1]) {
    score = GRADES[3][1];
    vetoes.push("tier floor: owned material is never rejected on pixel evidence alone");
  }
  // Hard technical failures that no editorial score should be able to lift. These mirror
  // the gates validateImage already applies at fetch time, restated here because an asset
  // can also arrive by upload or harvest, which do not pass through that gate.
  const sd = num(a && a.stdev);
  if (sd != null && sd < 5 && !isOwned(a)) {
    score = Math.min(score, 20);
    vetoes.push(`near-flat image (stdev ${sd.toFixed(1)})`);
  }
  if (a && a.__duplicateOf) {
    score = Math.min(score, 22);
    vetoes.push(`perceptual duplicate of ${a.__duplicateOf}`);
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const grade = GRADES.find(([, cut]) => score >= cut)[0];

  const reasons = Object.keys(W)
    .sort((x, y) => parts[y] - parts[x])
    .slice(0, 3)
    .map((k) => `${k} ${parts[k]}/${W[k]} (${comp[k].note})`);

  return { score, grade, kind, tier, parts, reasons, vetoes };
}

/**
 * Annotate a whole list in place with `qualityScore` / `qualityGrade` / `qualityParts`.
 * Returns a compact histogram for the logs and the disclosure UI.
 */
function scoreAssets(assets, { frame = null } = {}) {
  const list = Array.isArray(assets) ? assets : [];
  const hist = { hero: 0, high: 0, medium: 0, low: 0, reject: 0 };
  for (const a of list) {
    if (!a || !a.path) continue;
    try {
      const r = scoreAsset(a, { frame });
      a.qualityScore = r.score;
      a.qualityGrade = r.grade;
      a.qualityParts = r.parts;
      a.qualityReasons = r.reasons;
      if (r.vetoes.length) a.qualityVetoes = r.vetoes;
      hist[r.grade]++;
    } catch {
      // FAIL-OPEN: an unscoreable asset keeps whatever it had and reads as medium, so a
      // scoring bug can never delete a film's visuals.
      a.qualityScore = a.qualityScore != null ? a.qualityScore : 50;
      a.qualityGrade = a.qualityGrade || "medium";
      hist.medium++;
    }
  }
  return hist;
}

/**
 * THE PLACEMENT RULE, as a single comparator.
 *
 * Sorts assets best-first for a slot of the given priority. Tier remains the major key —
 * that is the house law and this does not touch it — but WITHIN a tier the quality score
 * now decides, which is the whole point: the user's sharp dashboard beats the user's blurry
 * one for the hero, and neither can be displaced by a lucky stock photo.
 *
 * The one place tier is deliberately softened is a CRITICAL slot: there, an asset graded
 * `reject` is pushed behind everything acceptable regardless of tier, because a critical
 * slot showing a broken picture is worse than a critical slot showing a decent stock one.
 * That is a bounded, explicit exception rather than a general reordering.
 */
function compareForSlot(x, y, slotPriority = "medium") {
  const critical = slotPriority === "critical";
  const bad = (a) => (a.qualityGrade === "reject" ? 1 : 0);
  if (critical) {
    const d = bad(x) - bad(y);
    if (d) return d;                       // an acceptable asset first, whatever its tier
  }
  const tx = tierFor(x), ty = tierFor(y);
  if (tx !== ty) return ty - tx;
  const qx = num(x && x.qualityScore, 50), qy = num(y && y.qualityScore, 50);
  if (qx !== qy) return qy - qx;
  return String(x && x.path || "").localeCompare(String(y && y.path || ""));
}

/** Is this asset good enough for a slot of this priority? */
const MIN_GRADE_FOR = { critical: "high", high: "medium", medium: "low", low: "reject" };
function meetsFloor(a, slotPriority = "medium") {
  const need = GRADE_RANK[MIN_GRADE_FOR[slotPriority] || "low"];
  const has = GRADE_RANK[(a && a.qualityGrade) || "medium"];
  return has >= need;
}

// ---------------------------------------------------------------- measurement top-up

/**
 * Measure the signals an asset is MISSING, in place. On the happy path this is a no-op:
 * everything here is already computed by `asset_sources/util.validateImage` at fetch time
 * and simply needs to survive onto the wire. It exists for the paths that skip that gate —
 * user uploads, harvested brand assets, and pinned website captures — so those are not
 * silently scored as "unmeasured" while stock is scored properly.
 *
 * Bounded concurrency, ffmpeg only, every failure swallowed.
 */
// MEASUREMENT CACHE. `validateImage` spawns FOUR ffmpeg processes per image (probe, dHash,
// dominant colour, sharpness) — about a second each on a real capture, and on a warm run with
// every crop already cached that became the single largest remaining cost in preparation.
// The measurements are pure functions of the file's BYTES, so they cache exactly like crops
// do: content-addressed, shared across every job that ever sees the same picture, stored
// beside the crop cache. Fail-open at every step — a cache miss is never worth a lost film.
const MEASURE_CACHE_DIR = (() => {
  try { return require("node:path").join(require("../config").paths.root, "asset_cache", "measure"); }
  catch { return null; }
})();

function measureCacheFile(hash) {
  const path = require("node:path");
  return MEASURE_CACHE_DIR ? path.join(MEASURE_CACHE_DIR, hash.slice(0, 2), `${hash}.json`) : null;
}
function readMeasureCache(hash) {
  try {
    const f = measureCacheFile(hash);
    if (!f) return null;
    const j = JSON.parse(require("node:fs").readFileSync(f, "utf8"));
    return j && typeof j === "object" ? j : null;
  } catch { return null; }
}
function writeMeasureCache(hash, meta) {
  try {
    const f = measureCacheFile(hash);
    if (!f) return;
    const fs = require("node:fs"), path = require("node:path");
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, JSON.stringify(meta));
  } catch { /* a cache miss is never worth a failed render */ }
}
function contentHash(absPath) {
  try {
    const fs = require("node:fs");
    return require("node:crypto").createHash("md5").update(fs.readFileSync(absPath)).digest("hex");
  } catch { return null; }
}

async function measureMissing(assets, { jobDir, concurrency = 3 } = {}) {
  const fs = require("node:fs");
  const path = require("node:path");
  const list = (Array.isArray(assets) ? assets : []).filter((a) => {
    if (!a || !a.path || a.type === "video") return false;
    if (/\.(svg|svgz)($|\?)/i.test(String(a.path))) return false;
    return a.sharpness == null || a.stdev == null || a.width == null || a.bpp == null;
  });
  if (!list.length) return { measured: 0, cached: 0, failed: 0, ms: 0 };

  const t0 = Date.now();
  const report = { measured: 0, cached: 0, failed: 0, ms: 0 };
  const { validateImage } = require("./asset_sources");
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= list.length) return;
      const a = list[i];
      const abs = jobDir ? path.join(jobDir, a.path) : a.path;
      try {
        if (!fs.existsSync(abs)) { report.failed++; continue; }
        const hash = contentHash(abs);
        const hit = hash ? readMeasureCache(hash) : null;
        const v = hit ? { meta: hit } : await validateImage(abs);
        const m = (v && v.meta) || {};
        if (!hit && hash && m.width) writeMeasureCache(hash, m);
        if (a.width == null && m.width) a.width = m.width;
        if (a.height == null && m.height) a.height = m.height;
        if (a.ratio == null && m.ratio) a.ratio = m.ratio;
        if (a.sharpness == null && m.sharpness != null) a.sharpness = m.sharpness;
        if (a.stdev == null && m.stdev != null) a.stdev = m.stdev;
        if (a.dhash == null && m.dhash) a.dhash = m.dhash;
        if (a.dominantColor == null && m.dominantColor) a.dominantColor = m.dominantColor;
        if (a.bpp == null && m.width && m.height) {
          try {
            const bytes = fs.statSync(abs).size;
            a.bpp = Math.round(((bytes * 8) / (m.width * m.height)) * 100) / 100;
          } catch { /* size is optional */ }
        }
        if (hit) report.cached++; else report.measured++;
      } catch { report.failed++; }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  report.ms = Date.now() - t0;
  return report;
}

module.exports = {
  scoreAsset, scoreAssets, compareForSlot, meetsFloor, measureMissing, measureKind,
  GRADES, GRADE_RANK, W, SHARPNESS_BANDS, STDEV_BANDS, BPP_BANDS, SCALE_BANDS, MIN_GRADE_FOR,
};
