// Quality Director — the single, cross-dimension quality summary for a delivered
// film. The pipeline computes many quality signals but scatters them: contrast
// fixes land in contrast-report.json, audio loudness in audio/audio-report.json,
// screenshot QA in screenshot-qa.json, asset quality + template fit in the
// Creative Director review, and the vision verdict in `qa`. Nothing gathered them
// into one place the user could see. This module reads them all (fail-soft — a
// missing file just yields nulls) and returns one `qualityReport` object that the
// job record carries and the Premiere card renders.
//
// It is a pure aggregator: it makes NO model calls and never throws.

const fs = require("node:fs");
const path = require("node:path");

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}

// Floors below which a dimension is called out in `flags`. Deliberately lenient —
// these mark "worth a look", not hard failures (the pipeline already ships
// best-attempt-flagged; this only describes what shipped).
const ASSET_FLOOR = 55;      // Creative Director quality score /100
const TEMPLATE_FLOOR = 55;   // template-fit score /100
const LUFS_TARGET = -14;     // broadcast-ish loudness target
const LUFS_TOLERANCE = 3;    // ±dB before we flag loudness drift

function assembleQualityReport({ jobDir, qa, creativeReview, bestQa } = {}) {
  const flags = [];

  // ---- contrast (deterministic fixer) ----
  const cr = readJson(path.join(jobDir, "contrast-report.json"));
  const contrast = cr
    ? { checked: !!cr.checked, fixed: (cr.fixed || []).length, remaining: (cr.remaining || []).length, passes: cr.passes || 0 }
    : { checked: false, fixed: 0, remaining: 0, passes: 0 };
  if (contrast.remaining > 0) flags.push(`${contrast.remaining} text element(s) still below WCAG AA`);

  // ---- audio loudness ----
  const ar = readJson(path.join(jobDir, "audio", "audio-report.json"));
  const audio = ar && (ar.integratedLufs != null || ar.truePeakDb != null)
    ? { lufs: ar.integratedLufs, peak: ar.truePeakDb, lra: ar.lra ?? null, target: ar.targetLufs ?? LUFS_TARGET, layers: ar.layers || null }
    : null;
  if (audio && audio.lufs != null && Math.abs(audio.lufs - (audio.target || LUFS_TARGET)) > LUFS_TOLERANCE) {
    flags.push(`audio at ${audio.lufs} LUFS (target ${audio.target || LUFS_TARGET})`);
  }

  // ---- screenshot QA ----
  const sq = readJson(path.join(jobDir, "screenshot-qa.json"));
  const screenshots = sq ? { kept: sq.kept || 0, dropped: sq.dropped || 0, repinned: sq.repinned || 0, problems: sq.problems || [] } : null;
  if (screenshots && screenshots.dropped > 0) flags.push(`${screenshots.dropped} screenshot(s) dropped by QA`);

  // ---- template identity (deterministic off-palette remap) ----
  const ir = readJson(path.join(jobDir, "identity-report.json"));
  const identity = ir ? { remapped: (ir.remapped || []).length } : null;

  // ---- layout (deterministic duplicate-hide + collision-scrim) ----
  const lr = readJson(path.join(jobDir, "layout-report.json"));
  const layout = lr ? { duplicatesRemoved: lr.duplicatesRemoved || 0, collisionsScrimmed: lr.collisionsScrimmed || 0 } : null;

  // ---- asset quality floor (image generation) ----
  const af = readJson(path.join(jobDir, "asset-floor.json"));
  const assetFloor = af ? { generated: af.generated || 0, scoreBefore: af.scoreBefore ?? null, scoreAfter: af.scoreAfter ?? null } : null;

  // ---- asset quality + template fit (Creative Director) ----
  const assetQuality = (creativeReview && typeof creativeReview.qualityScore === "number") ? creativeReview.qualityScore : null;
  const templateFit = (creativeReview && creativeReview.templateCompatibility && typeof creativeReview.templateCompatibility.averageScore === "number")
    ? creativeReview.templateCompatibility.averageScore : null;
  if (assetQuality != null && assetQuality < ASSET_FLOOR) flags.push(`asset quality ${assetQuality}/100`);
  if (templateFit != null && templateFit < TEMPLATE_FLOOR) flags.push(`template fit ${templateFit}/100`);

  // ---- QA vision verdict (of the SHIPPED cut) ----
  const blockers = qa && Array.isArray(qa.issues)
    ? qa.issues.filter((i) => String(i.severity || "").toLowerCase() === "blocker")
    : [];
  const qaOut = qa
    ? { pass: qa.pass !== false, score: qa.score ?? null, skipped: !!qa.skipped, blockers: blockers.length }
    : { pass: true, score: null, skipped: true, blockers: 0 };
  if (qa && qa.pass === false) flags.push(qaOut.blockers ? `QA: ${qaOut.blockers} blocker(s)` : "QA flagged");

  const verdict = (qaOut.pass && contrast.remaining === 0 && flags.length === 0) ? "pass" : "flagged";

  return {
    verdict,
    flags,
    contrast,
    identity,
    layout,
    assetFloor,
    audio,
    screenshots,
    assetQuality,
    templateFit,
    qa: qaOut,
  };
}

module.exports = { assembleQualityReport };
