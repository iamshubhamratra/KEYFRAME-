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
// The same band the pacing report's own "cut cadence" check uses, so the flag
// and the check can never disagree about the same film.
const PACE_DRIFT_PCT = 25;

// `pacingReport` is the in-memory copy for a caller that has one. The graph now
// builds the pacing report and writes pacing-report.json BEFORE assembling this
// one, and hands the same object in — the two agree by construction. It used to
// be the other way round, which is why this block was permanently null on every
// film. The file read remains for anything that assembles later (a re-read of a
// finished job) and the single-shot runJob path, which writes no pacing report
// at all and correctly gets null.
function assembleQualityReport({ jobDir, qa, creativeReview, bestQa, pacingReport = null } = {}) {
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

  // ---- image gap-fill (generated images for lookups that missed) ----
  const gf = readJson(path.join(jobDir, "gap-fill.json"));
  const gapFill = gf ? {
    gaps: gf.gaps || 0, filled: gf.filled || 0,
    skippedBudget: gf.skippedBudget || 0, skippedKind: gf.skippedKind || 0,
    costUsd: gf.costUsd ?? 0,
  } : null;

  // ---- pacing (what the chosen pace asked for vs what the cut delivered) ----
  //
  // Pace is the one dimension whose failure leaves no mark on the artifact: a
  // film that quietly ignored "Fast" is still the right length, still in sync,
  // with nothing on screen to point at. Every film made before the pacing engine
  // has no report at all, so a missing file is silence, never a finding.
  const pr = pacingReport || readJson(path.join(jobDir, "pacing-report.json"));
  const pTarget = (pr && pr.target) || {};
  const pActual = (pr && pr.actual) || {};
  // A zero actual means "nothing to measure" — a renderer that declares no beat
  // count on a film with no scenes — not a 100% miss; reporting it as one would
  // bury whichever loud failure produced it.
  const drift = (target, actual) => {
    const t = Number(target), a = Number(actual);
    return (t > 0 && a > 0) ? Math.round(((a - t) / t) * 1000) / 10 : null;
  };
  const beatDrift = drift(pTarget.beatSec, pActual.avgBeatSec);
  const pacing = pr ? {
    mode: pr.mode || null,
    label: pr.label || null,
    multiplier: Number.isFinite(pr.multiplier) ? pr.multiplier : null,
    target: { sceneSec: pTarget.sceneSec ?? null, beatSec: pTarget.beatSec ?? null, words: pTarget.words ?? null },
    actual: {
      sceneSec: pActual.avgSceneSec ?? null, beatSec: pActual.avgBeatSec ?? null,
      words: pActual.words ?? null, durationSec: pActual.durationSec ?? null,
    },
    driftPct: { sceneSec: drift(pTarget.sceneSec, pActual.avgSceneSec), beatSec: beatDrift },
    clamped: Array.isArray(pr.clamped) ? pr.clamped : [],
    // The report's own verdicts, so the panel can name what failed without
    // re-deriving any of it here.
    failedChecks: (Array.isArray(pr.checks) ? pr.checks : [])
      .filter((c) => c && c.status && c.status !== "PASS").map((c) => c.name),
  } : null;
  // Only a CHOSEN pace can miss. At 1.0x the target cadence is simply today's
  // default and retimeScenesToVo has always stretched scenes past it (15s→18.8s,
  // 30s→35.7s in this repo's own logs), so flagging that drift would mark films
  // byte-identical to today's as "flagged" and crowd out the real findings.
  if (pacing && pacing.multiplier !== 1 && beatDrift != null && Math.abs(beatDrift) > PACE_DRIFT_PCT) {
    flags.push(`${pacing.label || pacing.mode} pace asked for ${pTarget.beatSec}s cuts, delivered ${pActual.avgBeatSec}s (${beatDrift > 0 ? "+" : ""}${beatDrift}%)`);
  }

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
    gapFill,
    audio,
    pacing,
    screenshots,
    assetQuality,
    templateFit,
    qa: qaOut,
  };
}

module.exports = { assembleQualityReport };
