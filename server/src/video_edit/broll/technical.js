// VIDEO EDIT B-ROLL TECHNICAL FIT — will this clip survive being placed in the edit?
//
// WHY THIS EXISTS. Relevance is worthless if the clip is 640 px wide for a 1080×1920 export, a 21:9
// panorama for a vertical full-screen cutaway, 2 s long for a 3 s sentence, or a flat grey frame (an
// error placeholder saved as media). Those failures are measurable without a model, so they gate the
// prior (ANALYSIS.md §8 prefilter: export upscale ≤ 1.5, cover loss ≤ 0.6 per layout box, duration ≥
// need + 0.5 s) and feed the resolution / aspect / duration terms of the final score.
// Cover loss is the scalar form of services/asset_fit.coverLoss: 1 − min(a/b, b/a) is the share of the
// cropped axis discarded when the source is cover-scaled into the box. A layout box is FULL (the output),
// PIP (a 16:9 box, pipScale × the output's short edge) or SPLIT (half the output along its long axis,
// 9:16 and 16:9 only). A clip that fails FULL but fits PIP stays a candidate; FULL is the headline
// whenever it passes, because FULL is the default layout.
//
// CONTRACT (pure):
//   layoutBox(output, layout) -> { w, h } | null
//   sourceDims(candidate) -> { w, h }   (largest rendition, else the item's own width/height)
//   resolutionScore(upscale, maxUpscale) -> 0..1
//   technicalFit({ candidate, output:{width,height}, needSec, stdev, opts }) -> {
//     pass, reasons:[upscale|aspect|short|low_information|unknown_dimensions], layout, fitLayouts:[...],
//     layouts:{ FULL|PIP|SPLIT: { pass, upscale, resolution, coverLoss, aspect, reasons } },
//     resolution, aspect, upscale, coverLoss, duration, grey, tech }
//   tech = 0.35·resolution + 0.30·aspect + 0.25·duration + 0.10·grey   (of the headline layout)

const { SCORING_DEFAULTS } = require("./score_defaults");
const { num, clamp01, round, isPlain } = require("./common");

const LAYOUTS = Object.freeze(["FULL", "PIP", "SPLIT"]);

function outputDims(output) {
  const w = num(output && output.width) || 1080;
  const h = num(output && output.height) || 1920;
  return { w, h };
}

function layoutBox(output, layout, pipScale = SCORING_DEFAULTS.technical.pipScale) {
  const { w, h } = outputDims(output);
  if (layout === "PIP") {
    const bw = Math.round(Math.min(w, h) * pipScale);
    return { w: bw, h: Math.round((bw * 9) / 16) };
  }
  if (layout === "SPLIT") {
    if (h > w) return { w, h: Math.round(h / 2) };
    if (w > h) return { w: Math.round(w / 2), h };
    return null;
  }
  return { w, h };
}

function sourceDims(c) {
  let w = num(c && c.width) || 0;
  let h = num(c && c.height) || 0;
  for (const r of (c && Array.isArray(c.renditions) ? c.renditions : [])) {
    if (isPlain(r) && num(r.width) > 0 && num(r.height) > 0 && r.width * r.height > w * h) { w = r.width; h = r.height; }
  }
  return { w, h };
}

function resolutionScore(upscale, maxUpscale) {
  if (!Number.isFinite(upscale)) return 0;
  if (upscale <= 1) return 1;
  if (upscale <= maxUpscale) return 1 - (0.4 * (upscale - 1)) / Math.max(1e-6, maxUpscale - 1);
  return clamp01(0.6 * (1 - (upscale - maxUpscale) / maxUpscale));
}

function technicalFit({ candidate, output, needSec = null, stdev = null, opts = {} } = {}) {
  const o = { ...SCORING_DEFAULTS.technical, ...(isPlain(opts) ? opts : {}) };
  const c = candidate || {};
  const src = sourceDims(c);
  const reasons = new Set();
  const layouts = {};
  const known = src.w > 0 && src.h > 0;

  for (const layout of LAYOUTS) {
    const box = layoutBox(output, layout, o.pipScale);
    if (!box) continue;
    if (!known) {
      layouts[layout] = { pass: true, upscale: null, resolution: o.unknownResolution, coverLoss: null, aspect: 0.5, reasons: ["unknown_dimensions"] };
      continue;
    }
    const upscale = Math.max(box.w / src.w, box.h / src.h) * (c.type === "image" ? o.imageZoomHeadroom : 1);
    const a = src.w / src.h;
    const bA = box.w / box.h;
    const coverLoss = 1 - Math.min(a / bA, bA / a);
    const r = [];
    if (upscale > o.maxUpscale + 1e-9) r.push("upscale");
    if (coverLoss > o.maxCoverLoss + 1e-9) r.push("aspect");
    layouts[layout] = {
      pass: r.length === 0,
      upscale: round(upscale, 3),
      resolution: round(resolutionScore(upscale, o.maxUpscale)),
      coverLoss: round(coverLoss),
      aspect: round(clamp01(1 - (coverLoss / o.maxCoverLoss) ** 2)),
      reasons: r,
    };
  }
  if (!known) reasons.add("unknown_dimensions");

  let duration;
  let durPass = true;
  if (c.type === "image") duration = o.imageDurationFit;
  else {
    const d = num(c.durationSec);
    const required = Math.max(0, num(needSec) || 0) + o.durationSlackSec;
    if (d == null) duration = 0.5;
    else if (d + 1e-9 >= required) duration = 1;
    else { duration = clamp01((d / required) ** 2); durPass = false; reasons.add("short"); }
  }

  let grey = 1;
  let greyPass = true;
  const sd = num(stdev);
  if (sd != null && sd < o.greyMinStdev) { grey = 0; greyPass = false; reasons.add("low_information"); }

  const techOf = (L) => 0.35 * L.resolution + 0.30 * L.aspect + 0.25 * duration + 0.10 * grey;
  const present = LAYOUTS.filter((l) => layouts[l]);
  const passing = present.filter((l) => layouts[l].pass);
  let head;
  if (layouts.FULL && layouts.FULL.pass) head = "FULL";
  else {
    const pool = passing.length ? passing : present;
    head = pool[0];
    for (const l of pool) if (techOf(layouts[l]) > techOf(layouts[head]) + 1e-9) head = l;
  }
  if (!passing.length) for (const r of layouts[head].reasons) reasons.add(r);
  const L = layouts[head];

  return {
    pass: passing.length > 0 && durPass && greyPass,
    reasons: [...reasons],
    layout: head,
    fitLayouts: passing,
    layouts,
    resolution: L.resolution,
    aspect: L.aspect,
    upscale: L.upscale,
    coverLoss: L.coverLoss,
    duration: round(duration),
    grey,
    tech: round(techOf(L)),
  };
}

module.exports = { technicalFit, layoutBox, sourceDims, resolutionScore, LAYOUTS };
