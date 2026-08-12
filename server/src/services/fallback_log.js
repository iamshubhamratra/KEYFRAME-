// FALLBACK LOG — makes silent degradation countable.
//
// This codebase fails open by design: ~130 catch blocks swallow an error and
// carry on, and dozens more sites quietly substitute a default when the real
// thing is missing. Individually every one of those is right — a missing icon
// must not kill a render. Collectively they are why "quality is getting worse"
// was only ever observable by watching films: the system degrades quietly, a
// blank scene is indistinguishable from a minimal design, and nobody is paged.
//
// The fix is not to make them throw. It is to make them COUNT. A film that used
// 2 fallbacks and a film that used 24 are different films, and right now they
// look identical from the outside.
//
// Threading a recorder through 130 call sites is not realistic, and a module
// global would cross-contaminate concurrent jobs. AsyncLocalStorage gives every
// site `note()` with no plumbing and still keeps each job's tally its own.

const { AsyncLocalStorage } = require("node:async_hooks");
const fs = require("node:fs");
const path = require("node:path");

const store = new AsyncLocalStorage();

/** Severity ranks how much a fallback costs the VIEWER, not how rare it is. */
const SEVERITY = {
  // Something the audience can see is missing.
  content: 3,     // a slot that should carry copy/media resolved to nothing
  visual: 2,      // a design element degraded (placeholder art, dropped effect)
  // Invisible to the viewer, but a signal the pipeline is limping.
  quality: 1,     // a better path was available and not taken (cheaper model, skipped agent)
  info: 0,        // recorded for context only
};

/**
 * Run `fn` with a fresh tally attached to the async context.
 * Everything `fn` awaits — however deep — can `note()` into it.
 */
function runWithLog(jobId, fn) {
  return store.run({ jobId, entries: [], startedAt: Date.now() }, fn);
}

/**
 * Record that we substituted, skipped, or dropped something.
 *
 * @param {string} stage  where it happened ("omelette_adapter", "assets", …)
 * @param {string} kind   what was substituted — a STABLE slug, so it can be counted
 *                        across films ("empty-list-slot", "authored-scene-rejected")
 * @param {object} [meta] { severity, detail, scene, slot } — free-form context
 *
 * Never throws and never requires a context: calling this outside a job is a
 * no-op, so a site can be instrumented without caring who calls it.
 */
function note(stage, kind, meta = {}) {
  const ctx = store.getStore();
  if (!ctx) return;
  ctx.entries.push({
    stage: String(stage),
    kind: String(kind),
    severity: meta.severity || "quality",
    detail: meta.detail != null ? String(meta.detail).slice(0, 200) : undefined,
    scene: meta.scene,
    slot: meta.slot,
    at: Date.now() - ctx.startedAt,
  });
}

/** Everything noted so far, plus per-kind counts and a single headline score. */
function summary() {
  const ctx = store.getStore();
  if (!ctx) return null;
  const byKind = {}, byStage = {}, bySeverity = { content: 0, visual: 0, quality: 0, info: 0 };
  for (const e of ctx.entries) {
    byKind[e.kind] = (byKind[e.kind] || 0) + 1;
    byStage[e.stage] = (byStage[e.stage] || 0) + 1;
    if (bySeverity[e.severity] != null) bySeverity[e.severity]++;
  }
  // One number to trend. Weighted so ten cosmetic substitutions never look worse
  // than one empty slot — the thing the viewer actually notices.
  const score = ctx.entries.reduce((a, e) => a + (SEVERITY[e.severity] || 0), 0);
  return { jobId: ctx.jobId, total: ctx.entries.length, score, bySeverity, byKind, byStage, entries: ctx.entries };
}

/** Persist to the job dir and log a one-line verdict. Fail-open, of course. */
function writeReport(jobDir, label = "") {
  try {
    const s = summary();
    if (!s) return null;
    fs.writeFileSync(path.join(jobDir, "fallbacks.json"), JSON.stringify(s, null, 2), "utf8");
    if (s.total) {
      const top = Object.entries(s.byKind).sort((a, b) => b[1] - a[1]).slice(0, 3)
        .map(([k, n]) => `${k}x${n}`).join(", ");
      console.log(`[fallbacks] ${label}: ${s.total} substitution(s), degradation score ${s.score}`
        + ` (content ${s.bySeverity.content}, visual ${s.bySeverity.visual}) — ${top}`);
    }
    return s;
  } catch { return null; }
}

module.exports = { runWithLog, note, summary, writeReport, SEVERITY };
