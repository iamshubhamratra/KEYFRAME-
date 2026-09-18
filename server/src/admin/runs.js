// TEMPLATE RUNS — the long admin stages (generate, preview, QA) and the in-flight
// state the admin UI watches over SSE.
//
// Progress is deliberately NOT persisted: it is per-run chatter for the SSE
// stream, and the store's records are the durable truth. A restart loses the
// spinner, never the pipeline state.

const path = require("node:path");
const store = require("../models/template");
const { resolveMedia, missingSourceFiles, THUMB_NAMES, PREVIEW_NAMES } = require("./pack_install");

const S = store.STATUS;

/** @type {Map<string, {phase: string, step: string, pct: number|null, at: number}>} */
const progress = new Map();
/** @type {Map<string, string>} */
const running = new Map(); // templateId -> phase, so two clicks can't run twice

// The two long stages live in ./template_generator.js and ./template_qa.js and are
// loaded on first use, so booting the API never pays for the render toolchain.
function stages() {
  const { generateTemplate, renderPreview } = require("./template_generator");
  const { runTemplateQa } = require("./template_qa");
  return { generateTemplate, renderPreview, runTemplateQa };
}

function setProgress(id, patch) {
  const prev = progress.get(id) || { phase: null, step: "", pct: null };
  progress.set(id, { ...prev, ...patch, at: Date.now() });
}

function runWork(id, phase, fn) {
  running.set(id, phase);
  setProgress(id, { phase, step: "starting", pct: 0 });
  Promise.resolve()
    .then(fn)
    .catch((e) => console.error(`[admin/templates] ${phase} crashed for ${id}: ${e && e.message}`))
    .finally(() => running.delete(id));
}

// The callback handed to the generator/QA modules. Both `onProgress("step", 40)`
// and `onProgress({ step, pct })` work.
function progressSink(id, phase) {
  return (a, b) => {
    const patch = a && typeof a === "object"
      ? a
      : { step: String(a == null ? "" : a).slice(0, 200), pct: Number.isFinite(b) ? b : undefined };
    setProgress(id, { phase, ...patch });
  };
}

function normalizeQa(out) {
  const o = out && typeof out === "object" ? out : {};
  const errors = Array.isArray(o.errors || o.blockers || o.blocking) ? (o.errors || o.blockers || o.blocking) : [];
  const warnings = Array.isArray(o.warnings) ? o.warnings : [];
  const score = Number.isFinite(o.score) ? o.score : (Number.isFinite(o.qaScore) ? o.qaScore : null);
  const full = { ...o, errors, warnings, score, at: Date.now() };
  // The store rewrites template-store.json whole on every change, so a QA report
  // that carried frame screenshots would tax every later write. Keep the verdict,
  // drop the payload past 64KB.
  try {
    if (JSON.stringify(full).length > 64_000) return { errors, warnings, score, at: full.at, truncated: true };
  } catch { return { errors, warnings, score, at: full.at, truncated: true }; }
  return full;
}

// ---------------------------------------------------------------- stage runners
// Each starts the work in the background and returns immediately; the caller has
// already committed the state the admin UI needs and answered 202.

function startGenerate(t, v, generation, generateTemplate) {
  runWork(t.id, "generating", async () => {
    try {
      const out = await generateTemplate({
        template: store.getTemplate(t.id),
        version: v,
        prompt: generation.prompt,
        generation,
        sourceDir: store.draftSourceDir(t.slug, v.version),
        mediaDir: store.draftMediaDir(t.slug, v.version),
        onProgress: progressSink(t.id, "generating"),
      });

      // Trust but verify: a generator that reports success without leaving a
      // pack.json + FRAME.md behind would only surface as a mystery 422 at
      // publish, long after the admin stopped watching.
      const { dir, missing } = missingSourceFiles(t, v.version);
      if (missing.length) throw new Error(`generation left no ${missing.join(" + ")} in ${dir}`);

      const patch = { generationStatus: "ok", error: null };
      if (out && typeof out === "object") {
        if (out.spec || out.variant || out.generationSpec) patch.generationSpec = out.spec || out.variant || out.generationSpec;
        if (out.thumbnail) patch.thumbnail = out.thumbnail;
        if (out.previewVideo) patch.previewVideo = out.previewVideo;
      }
      store.updateVersion(t.id, v.version, patch);
      store.setStatus(t.id, S.GENERATED);
      setProgress(t.id, { phase: "generating", step: "generated", pct: 100 });
    } catch (e) {
      const msg = String(e && e.message ? e.message : e);
      store.updateVersion(t.id, v.version, { generationStatus: "failed", error: msg.slice(0, 2000) });
      try { store.setStatus(t.id, S.FAILED, { error: msg }); } catch { /* already moved on */ }
      setProgress(t.id, { phase: "generating", step: `failed: ${msg.slice(0, 160)}`, pct: 100 });
    }
  });
}

// Deliberately status-neutral: the lifecycle has no PREVIEWING state, and a
// re-render of a poster is not a change of what the template IS. It writes the
// two media refs the publish gate checks for.
function startPreview(t, v, renderPreview) {
  const mediaDir = store.draftMediaDir(t.slug, v.version);
  runWork(t.id, "previewing", async () => {
    try {
      const out = await renderPreview({
        template: store.getTemplate(t.id),
        version: v,
        sourceDir: store.draftSourceDir(t.slug, v.version),
        mediaDir,
        onProgress: progressSink(t.id, "previewing"),
      });
      const thumbRef = (out && (out.thumbnail || out.poster)) || null;
      const previewRef = (out && (out.previewVideo || out.preview || out.video)) || null;
      const thumb = resolveMedia(mediaDir, thumbRef, THUMB_NAMES);
      const preview = resolveMedia(mediaDir, previewRef, PREVIEW_NAMES);
      if (!thumb || !preview) throw new Error(`preview produced no ${!thumb ? "thumbnail" : "video"} under ${mediaDir}`);
      // Store the refs the module reported when it gave one (they may be public
      // URLs the admin UI can render directly); otherwise the resolved filename.
      const patch = { thumbnail: thumbRef || path.basename(thumb), previewVideo: previewRef || path.basename(preview) };
      store.updateVersion(t.id, v.version, patch);
      store.updateTemplate(t.id, patch);
      setProgress(t.id, { phase: "previewing", step: "preview ready", pct: 100 });
    } catch (e) {
      const msg = String(e && e.message ? e.message : e);
      console.warn(`[admin/templates] preview failed for ${t.slug}: ${msg}`);
      setProgress(t.id, { phase: "previewing", step: `failed: ${msg.slice(0, 160)}`, pct: 100 });
    }
  });
}

function startQa(t, v, runTemplateQa) {
  runWork(t.id, "qa", async () => {
    try {
      const out = await runTemplateQa({
        template: store.getTemplate(t.id),
        version: v,
        sourceDir: store.draftSourceDir(t.slug, v.version),
        mediaDir: store.draftMediaDir(t.slug, v.version),
        onProgress: progressSink(t.id, "qa"),
      });
      const results = normalizeQa(out);
      store.updateVersion(t.id, v.version, { qaResults: results, qaScore: results.score });
      // Clean QA is what makes a template reviewable; anything blocking sends it
      // back to GENERATED so the admin regenerates rather than reviews. A QA run
      // that CRASHED is different — that is FAILED, below.
      store.setStatus(t.id, results.errors.length ? S.GENERATED : S.READY_TO_PUBLISH);
      setProgress(t.id, { phase: "qa", step: results.errors.length ? `${results.errors.length} blocking issue(s)` : "clean", pct: 100 });
    } catch (e) {
      const msg = String(e && e.message ? e.message : e);
      try { store.setStatus(t.id, S.FAILED, { error: msg }); } catch { /* already moved on */ }
      setProgress(t.id, { phase: "qa", step: `failed: ${msg.slice(0, 160)}`, pct: 100 });
    }
  });
}

// A TRANSIENT STATUS WITH NOBODY WORKING IS A DEAD END.
//
// GENERATING and TESTING are held only while a run is in flight, and `running`
// lives in memory. Kill the process mid-render — a restart, a crash, an OOM —
// and the record keeps the transient status forever while nothing is running:
// generate and qa both refuse ("template is TESTING; qa is not legal from
// there"), publish refuses, and the admin has no way back. Hit once for real
// after a dev-server reload landed between setStatus(TESTING) and the verdict.
//
// Boot is exactly the moment we know nothing is in flight, so anything still
// mid-flight is stale by definition. GENERATED is the honest landing spot: the
// draft's files survive, so it can be previewed, QA'd or regenerated from there.
function sweepStaleRuns() {
  const stuck = store.listTemplates().filter((t) => t.status === S.GENERATING || t.status === S.TESTING);
  for (const t of stuck) {
    const v = t.currentVersion ? store.getVersion(t.id, t.currentVersion) : null;
    // A version that never finished generating cannot be previewed — that one
    // goes to FAILED so the UI shows why rather than offering a dead action.
    const next = v && v.generationStatus === "ok" ? S.GENERATED : S.FAILED;
    try {
      store.setStatus(t.id, next, next === S.FAILED ? { error: "interrupted by a restart" } : undefined);
      console.log(`[admin/templates] swept ${t.slug}: ${t.status} -> ${next} (no run in flight)`);
    } catch (e) {
      console.warn(`[admin/templates] could not sweep ${t.slug}: ${e.message}`);
    }
  }
}

module.exports = {
  progress, running, stages, progressSink, normalizeQa,
  startGenerate, startPreview, startQa, sweepStaleRuns,
};
