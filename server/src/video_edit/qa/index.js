// VIDEO EDIT QA — QUALITY_CHECK entry points: one lap's report, the repairs for it, the best lap (ENGINE.md §7).
//
// WHY THIS EXISTS. The render-stage handler owns the lap LOOP (render → QA → repair ops → re-render), because
// only it can re-render and append revisions. Everything it needs to decide inside that loop lives here
// behind three calls, so the handler never has to know which check produced which finding:
//   runQa        — measure one render: pure plan/layout checks + media scans + (budget permitting) one
//                  vision call; score, verdict and a `repairOp` label per issue;
//   planRepairs  — turn a lap report into plan ops (dry-run validated) + render-level actions;
//   pickBestLap / finalReport — rank laps and build the report that ships with the export.
// Nothing here logs transcript text or file names; the report's `detail` strings are built from numbers and ids.
//
// CONTRACT:
//   runQa({ projectDir, renderId, files?, plan, words, faces, timing, language, lap=0, previous=null, changedRanges?, planHash?,
//           settings, project, signal, tracker, callVision?, chat?, checkBudget?, mezz?, renderInfo?, withHeavy?,
//           pidFile?, cacheDir?, onCost?, onNotice?, spentUsd?, now?, skipVision?, deps? }) -> lapReport
//     files (all optional, project-relative or absolute): { mp4, audioReport, layout, voice }
//       defaults: render/out/<rid>.mp4 · render/out/<rid>.audio-report.json · render/layout/<rid>.json · (voice: none)
//     lapReport = { lap, renderId, planRevision, planHash, verdict, score, headline, issues:[finding + repairOp], counts,
//                   iBlockers, qBlockers, signals:{ loudness, durationDriftFrames, brollCoverage, faceCoveredRatio, captionCoverage,
//                   sttTiming, faceTrack, avOffsetMs }, unverified, unverifiedChecks, visionUnverified,
//                   vision:{ status, reason, calls, costUsd, frames, model, score, pass }, costUsd }
//     Throws only on cancellation (EditError class 'cancelled') and on programming errors (bad plan).
//   planRepairs(report, plan, ctx) -> { ops, renderActions, planned, skipped }      (qa/repair.js)
//   pickBestLap(laps) · finalReport(laps, { shippedLap }) · shouldContinue · shouldPromote · maxRepairLaps   (qa/verdict.js)
//   QA_CATEGORIES · REPAIRS

const fs = require("node:fs");
const path = require("node:path");
const fsx = require("../fsx");
const { isEditError } = require("../errors");
const C = require("./common");
const checks = require("./checks");
const vision = require("./vision");
const repair = require("./repair");
const V = require("./verdict");

const RID_RE = /^[A-Za-z0-9_-]{1,64}$/;

function absIn(projectDir, p) {
  if (typeof p !== "string" || !p) return null;
  if (path.isAbsolute(p)) return p;
  return fsx.resolveInside(projectDir, p);
}

// The renderer owns the planHash definition (render/compose.planHashOf); fall back to a canonical hash while it is absent.
function planHashOf(plan) {
  try { const c = require("../render/compose"); if (typeof c.planHashOf === "function") return c.planHashOf(plan); } catch { /* renderer not present */ }
  return fsx.sha256Json(plan);
}

function readJson(file) {
  if (!file) return null;
  const r = fsx.readJsonSafe(file);
  return r.ok ? r.value : null;
}

// One finding per (category, element, ~time): a deterministic finding wins over a vision one saying the same.
function dedupe(findings) {
  const out = [];
  for (const f of C.sortFindings(findings)) {
    const dup = out.find((g) => g.category === f.category && (g.elementId || null) === (f.elementId || null)
      && (g.atSec == null || f.atSec == null || Math.abs(g.atSec - f.atSec) < 0.75));
    if (dup) continue;
    out.push(f);
  }
  return out;
}

async function runQa(opts = {}) {
  const {
    projectDir, renderId, files = {}, plan, words = [], faces = null, timing = null, language = null, lap = 0, previous = null,
    changedRanges = [], settings = null, project = null, signal = null, tracker = null, mezz = null, renderInfo = null,
    withHeavy = (fn) => fn({}), pidFile, cacheDir = null, onCost = null, onNotice = null, spentUsd = null, now = Date.now,
    skipVision = false, deps = {},
  } = opts;
  if (typeof projectDir !== "string" || !projectDir) throw new Error("qa: projectDir required");
  if (!RID_RE.test(String(renderId || ""))) throw new Error("qa: renderId required");
  const mp4 = absIn(projectDir, files.mp4 || `render/out/${renderId}.mp4`);
  const reportPath = absIn(projectDir, files.audioReport || `render/out/${renderId}.audio-report.json`);
  const layoutPath = absIn(projectDir, files.layout || `render/layout/${renderId}.json`);
  const voicePath = absIn(projectDir, files.voice || null);
  const layout = readJson(layoutPath);
  const audioReport = readJson(reportPath);
  const cancelled = (e) => (signal && signal.aborted) || (isEditError(e) && e.errorClass === "cancelled");

  const pc = checks.buildContext({ plan, words, faces, layout, timing, language, mezz, projectDir, renderInfo });
  const findings = [];
  const unverifiedChecks = [];

  const planRes = checks.runPlanChecks(pc);
  findings.push(...planRes.findings);
  unverifiedChecks.push(...planRes.unverified);

  let mediaSignals = { loudness: null, durationDriftFrames: null, avOffsetMs: null };
  if (mp4 && fs.existsSync(mp4)) {
    const media = await checks.runMediaChecks({ file: mp4, audioReport, voicePath, pc, signal, cwd: projectDir, withHeavy, pidFile, deps });
    findings.push(...media.findings);
    unverifiedChecks.push(...media.unverified);
    mediaSignals = media.signals;
  } else {
    findings.push(C.makeFinding({ severity: "blocker", cls: "I", category: "OTHER", area: "container", atSec: 0,
      detail: "The export file is missing.", fix: "Re-render the export.", data: { reason: "missing_export" } }));
    unverifiedChecks.push("media");
  }

  let vis = { status: "skipped", reason: "disabled", findings: [], carried: [], frames: [], calls: 0, costUsd: 0, model: null, score: null, pass: null, visionUnverified: true };
  if (!skipVision && mp4 && fs.existsSync(mp4)) {
    try {
      vis = await vision.runVision({
        pc, file: mp4, projectDir, renderId, lap, changedRanges, previous, settings, project, signal, tracker,
        callVision: opts.callVision, chat: opts.chat, checkBudget: opts.checkBudget, cacheDir, onCost, onNotice, withHeavy, spentUsd, now, pidFile, deps,
      });
    } catch (e) {
      if (cancelled(e)) throw e;
      if (isEditError(e) && e.errorClass === "bug") throw e;
      vis = { ...vis, status: "failed", reason: isEditError(e) ? String(e.code).toLowerCase() : "vision_error" };
    }
  }
  findings.push(...vis.findings, ...(vis.carried || []));

  const issues = dedupe(findings).map((f) => ({ ...f, repairOp: repair.repairLabel(f.category, f) }));
  const s = V.scoreFindings(issues);
  const verdict = V.verdictFor({ score: s.score, iBlockers: s.iBlockers, qBlockers: s.qBlockers, majors: s.counts.majors });
  const faceTrack = faces && typeof faces.mode === "string" ? faces.mode : "assumed";
  return {
    lap, renderId, planRevision: Number.isInteger(plan.revision) ? plan.revision : null,
    planHash: typeof opts.planHash === "string" && opts.planHash ? opts.planHash : planHashOf(plan),
    verdict, score: s.score, headline: V.headlineFor(verdict, s.counts), issues, counts: s.counts, iBlockers: s.iBlockers, qBlockers: s.qBlockers,
    signals: {
      loudness: mediaSignals.loudness, durationDriftFrames: mediaSignals.durationDriftFrames, avOffsetMs: mediaSignals.avOffsetMs,
      brollCoverage: planRes.signals.brollCoverage, faceCoveredRatio: planRes.signals.faceCoveredRatio, captionCoverage: planRes.signals.captionCoverage,
      sttTiming: pc.timing, faceTrack,
    },
    unverified: unverifiedChecks.length > 0, unverifiedChecks: [...new Set(unverifiedChecks)],
    visionUnverified: !!vis.visionUnverified,
    vision: { status: vis.status, reason: vis.reason, calls: vis.calls, costUsd: vis.costUsd, frames: vis.frames, model: vis.model, score: vis.score, pass: vis.pass },
    costUsd: vis.costUsd || 0,
  };
}

function planRepairs(report, plan, ctx = {}) {
  return repair.planRepairs(report, plan, ctx);
}

module.exports = {
  runQa, planRepairs,
  pickBestLap: V.pickBestLap, finalReport: V.finalReport, shouldContinue: V.shouldContinue, shouldPromote: V.shouldPromote,
  maxRepairLaps: V.maxRepairLaps, scoreFindings: V.scoreFindings, verdictFor: V.verdictFor,
  QA_CATEGORIES: C.QA_CATEGORIES, REPAIRS: repair.REPAIRS,
};
