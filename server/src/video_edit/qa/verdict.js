// VIDEO EDIT QA VERDICT — score, verdict, best-lap ledger and the final report (ENGINE.md §7).
//
// WHY THIS EXISTS. A repair lap can make an export worse (a replaced clip that is uglier, a moved caption
// that now covers a card), and an integrity blocker must never be promoted however good the rest looks.
// So every lap is scored with one fixed formula, laps are ranked with one fixed order (the pattern of the
// template pipeline's best-lap ledger in agents/graph.js), and the export that ships is the best lap — not
// the last one. The final report is the same family as services/delivery_quality.js (`verdict`, `score`,
// `headline`, `issues`, `counts`, `signals`) so the UI can render both with one component.
//
// CONTRACT:
//   scoreFindings(findings) -> { score, counts:{ blockers, majors, minors }, iBlockers, qBlockers }
//     score = clamp(100 − 30·Iblockers − 15·Qblockers − 6·majors − 2·minors, 0, 100)
//   verdictFor({ score, iBlockers, qBlockers, majors }) -> 'blocked'|'weak'|'review'|'clean'
//     blocked: any I blocker · weak: score < 50 or ≥ 2 Q blockers · review: score < 80 or any Q blocker / major · else clean
//   headlineFor(verdict, counts) -> string
//   compareLaps(a, b) -> number (< 0 when a ranks better): no I blocker, fewer Q blockers, higher score, later lap
//   pickBestLap(laps) -> lap | null
//   lapSummary(lapReport) -> { lap, renderId, planRevision, planHash, verdict, score, counts, iBlockers, qBlockers, visionUnverified }
//   maxRepairLaps({ cpus, durationSec }) -> 1 | 2          (1 when cpus < 4 and D > 90 s)
//   shouldContinue(laps, { maxLaps, opsPlanned, budgetOk=true }) -> { continue:boolean, reason }
//   shouldPromote(candidate, current) -> boolean   (exports.currentId moves only to a render without I blockers and,
//                                                   for the same planHash, a score ≥ current's)
//   finalReport(laps, { shippedLap? }) -> ENGINE.md §7 final shape
//     { verdict, score, headline, issues:[{ severity, class, category, area, atSec, elementId, detail, fix, repairOp }],
//       counts, signals, laps:[lapSummary], shippedLap, unverified, visionUnverified, restoreRevision }

const C = require("./common");

function scoreFindings(findings) {
  let iBlockers = 0, qBlockers = 0, majors = 0, minors = 0;
  for (const f of Array.isArray(findings) ? findings : []) {
    if (!f) continue;
    if (f.severity === "blocker") { if (f.class === "I") iBlockers++; else qBlockers++; }
    else if (f.severity === "major") majors++;
    else if (f.severity === "minor") minors++;
  }
  const score = C.clamp(100 - 30 * iBlockers - 15 * qBlockers - 6 * majors - 2 * minors, 0, 100);
  return { score, counts: { blockers: iBlockers + qBlockers, majors, minors }, iBlockers, qBlockers };
}

function verdictFor({ score, iBlockers = 0, qBlockers = 0, majors = 0 }) {
  if (iBlockers > 0) return "blocked";
  if (score < 50 || qBlockers >= 2) return "weak";
  if (score < 80 || qBlockers > 0 || majors > 0) return "review";
  return "clean";
}

function headlineFor(verdict, counts) {
  const c = counts || { blockers: 0, majors: 0, minors: 0 };
  const n = c.blockers + c.majors + c.minors;
  if (verdict === "clean") return n ? `No significant issues; ${n} small thing${n === 1 ? "" : "s"} noted.` : "No quality issues detected.";
  if (verdict === "blocked") return "The export failed its integrity checks and was not delivered.";
  if (verdict === "weak") return `The automated review flagged ${c.blockers ? `${c.blockers} blocking issue${c.blockers === 1 ? "" : "s"}` : "significant problems"}. Review before sharing.`;
  return `Delivered with ${n} thing${n === 1 ? "" : "s"} worth checking.`;
}

function compareLaps(a, b) {
  const ai = a.iBlockers > 0 ? 1 : 0, bi = b.iBlockers > 0 ? 1 : 0;
  if (ai !== bi) return ai - bi;
  if (a.qBlockers !== b.qBlockers) return a.qBlockers - b.qBlockers;
  if (a.score !== b.score) return b.score - a.score;
  return (b.lap || 0) - (a.lap || 0);
}

function pickBestLap(laps) {
  const list = (Array.isArray(laps) ? laps : []).filter((l) => l && Number.isFinite(l.score));
  if (!list.length) return null;
  return list.slice().sort(compareLaps)[0];
}

function lapSummary(l) {
  return {
    lap: l.lap, renderId: l.renderId || null, planRevision: l.planRevision == null ? null : l.planRevision, planHash: l.planHash || null,
    verdict: l.verdict, score: l.score, counts: l.counts, iBlockers: l.iBlockers, qBlockers: l.qBlockers,
    visionUnverified: !!l.visionUnverified, opsApplied: Number.isFinite(l.opsApplied) ? l.opsApplied : null,
  };
}

function maxRepairLaps({ cpus, durationSec } = {}) {
  return Number(cpus) < 4 && Number(durationSec) > 90 ? 1 : 2;
}

function shouldContinue(laps, { maxLaps = 2, opsPlanned = 0, budgetOk = true } = {}) {
  const list = Array.isArray(laps) ? laps : [];
  const last = list[list.length - 1];
  if (!last) return { continue: false, reason: "no_laps" };
  if (!last.counts || (last.counts.blockers === 0 && last.counts.majors === 0)) return { continue: false, reason: "clean" };
  if (list.length > maxLaps) return { continue: false, reason: "max_laps" };
  if (!opsPlanned) return { continue: false, reason: "no_repairs" };
  if (!budgetOk) return { continue: false, reason: "budget" };
  // "score fails to improve twice": two consecutive laps without beating the best score before them
  let fails = 0, best = -Infinity;
  for (const l of list) { if (l.score > best) { best = l.score; fails = 0; } else fails++; }
  if (fails >= 2) return { continue: false, reason: "no_improvement" };
  return { continue: true, reason: null };
}

function shouldPromote(candidate, current) {
  if (!candidate || candidate.iBlockers > 0) return false;
  if (!current) return true;
  if (candidate.planHash && current.planHash && candidate.planHash === current.planHash) return candidate.score >= current.score;
  return true;
}

function finalReport(laps, { shippedLap } = {}) {
  const list = (Array.isArray(laps) ? laps : []).filter(Boolean);
  const best = shippedLap != null ? list.find((l) => l.lap === shippedLap) || pickBestLap(list) : pickBestLap(list);
  if (!best) {
    return {
      verdict: "review", score: null, headline: "Quality checks did not run.", issues: [], counts: { blockers: 0, majors: 0, minors: 0 },
      signals: {}, laps: [], shippedLap: null, unverified: true, visionUnverified: true, restoreRevision: null,
    };
  }
  const last = list[list.length - 1];
  return {
    verdict: best.verdict, score: best.score, headline: best.headline || headlineFor(best.verdict, best.counts),
    issues: (best.issues || []).map((f) => ({
      severity: f.severity, class: f.class, category: f.category, area: f.area, atSec: f.atSec, elementId: f.elementId,
      detail: f.detail, fix: f.fix, repairOp: f.repairOp || null,
    })),
    counts: best.counts, signals: best.signals || {},
    laps: list.map(lapSummary), shippedLap: best.lap,
    unverified: !!best.unverified, visionUnverified: !!best.visionUnverified,
    // An earlier lap ships: the lead appends a `restore` revision so the plan head matches the export.
    restoreRevision: last && last.lap !== best.lap && best.planRevision != null ? best.planRevision : null,
  };
}

module.exports = {
  scoreFindings, verdictFor, headlineFor, compareLaps, pickBestLap, lapSummary, maxRepairLaps, shouldContinue, shouldPromote, finalReport,
};
