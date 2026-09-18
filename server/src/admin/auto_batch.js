// AUTO BATCH — build N templates end to end (generate -> preview -> QA) from the
// curated brief pool or a campaign subject.
//
// ONE batch at a time, and the items run STRICTLY in series.
//
// Not an arbitrary choice: a preview and a QA pass each launch Chromium and
// ffmpeg and peak around 1.5-2 GB. Running three pack renders side by side on an
// 8-core box measured WORSE than one — free memory fell to 0.8 GB and not a
// single render finished in four minutes — so the batch never overlaps its own
// work. `running` is still claimed per template, which is what stops the
// single-template routes from firing at the same item mid-batch.

const crypto = require("node:crypto");
const path = require("node:path");
const store = require("../models/template");
const frameRegistry = require("../services/frame_registry");
const { planAutoBatch, POOL: AUTO_POOL, MAX_BATCH } = require("./auto_brief");
const { planCampaign } = require("./campaign");
const { resolveMedia, missingSourceFiles, THUMB_NAMES, PREVIEW_NAMES } = require("./pack_install");
const { running, stages, progressSink, normalizeQa } = require("./runs");

const S = store.STATUS;

let autoBatch = null;

// Slugs a new template may not take: both namespaces, because createTemplate
// refuses a slug that collides with either an existing template or an INSTALLED
// pack under frames/ — including a retired one, whose folder is still there
// (hence listAllPacks).
function takenSlugs() {
  return new Set([
    ...store.listTemplates().map((t) => t.slug),
    ...frameRegistry.listAllPacks(),
  ]);
}

// How many of the curated briefs are still unused — the admin UI caps its own
// count field with this so a request can't ask for more than the pool can give.
function availableAutoBriefs() {
  const taken = takenSlugs();
  return AUTO_POOL.filter((b) => !taken.has(b.slug)).length;
}

const batchPublic = (b) => b && ({
  id: b.id, count: b.items.length, requested: b.requested,
  done: b.items.filter((i) => i.stage === "done").length,
  failed: b.items.filter((i) => i.stage === "failed").length,
  currentIndex: b.currentIndex,
  running: !b.finishedAt,
  cancelled: b.cancelled,
  startedAt: b.startedAt, finishedAt: b.finishedAt,
  poolExhausted: b.poolExhausted,
  items: b.items.map((i) => ({
    slug: i.slug, name: i.name, family: i.family, orientation: i.orientation,
    templateId: i.templateId, stage: i.stage, status: i.status,
    qaScore: i.qaScore, error: i.error,
  })),
});

// Take ONE template the whole way: generate -> preview -> QA. Mirrors the three
// single-template routes' store transitions exactly; the difference is that this
// awaits each stage instead of answering 202 and walking away.
async function autoRunOne(item) {
  const { generateTemplate: gen, renderPreview: prev, runTemplateQa: qa } = stages();

  const t0 = store.getTemplate(item.templateId);
  const generation = t0.generation || {};
  const v = store.createVersion(t0.id, { generationPrompt: generation.prompt });
  item.version = v.version;

  // ---- generate ----
  item.stage = "generating";
  running.set(t0.id, "generating");
  store.setStatus(t0.id, S.GENERATING);
  try {
    const out = await gen({
      template: store.getTemplate(t0.id), version: v,
      prompt: generation.prompt, generation,
      sourceDir: store.draftSourceDir(t0.slug, v.version),
      mediaDir: store.draftMediaDir(t0.slug, v.version),
      onProgress: progressSink(t0.id, "generating"),
    });
    const { missing } = missingSourceFiles(t0, v.version);
    if (missing.length) throw new Error(`generation left no ${missing.join(" + ")}`);
    const patch = { generationStatus: "ok", error: null };
    if (out && typeof out === "object" && (out.spec || out.variant)) patch.generationSpec = out.spec || out.variant;
    store.updateVersion(t0.id, v.version, patch);
    store.setStatus(t0.id, S.GENERATED);
  } catch (e) {
    const msg = String(e && e.message ? e.message : e);
    store.updateVersion(t0.id, v.version, { generationStatus: "failed", error: msg.slice(0, 2000) });
    try { store.setStatus(t0.id, S.FAILED, { error: msg }); } catch { /* already moved */ }
    throw new Error(`generate: ${msg}`);
  } finally { running.delete(t0.id); }

  // ---- preview ---- (status-neutral, exactly as the route is)
  item.stage = "previewing";
  running.set(t0.id, "previewing");
  const mediaDir = store.draftMediaDir(t0.slug, v.version);
  try {
    const out = await prev({
      template: store.getTemplate(t0.id), version: store.getVersion(t0.id, v.version),
      sourceDir: store.draftSourceDir(t0.slug, v.version), mediaDir,
      onProgress: progressSink(t0.id, "previewing"),
    });
    const thumbRef = (out && (out.thumbnail || out.poster)) || null;
    const previewRef = (out && (out.previewVideo || out.preview || out.video)) || null;
    const thumb = resolveMedia(mediaDir, thumbRef, THUMB_NAMES);
    const preview = resolveMedia(mediaDir, previewRef, PREVIEW_NAMES);
    if (!thumb || !preview) throw new Error(`preview produced no ${!thumb ? "thumbnail" : "video"}`);
    const patch = { thumbnail: thumbRef || path.basename(thumb), previewVideo: previewRef || path.basename(preview) };
    store.updateVersion(t0.id, v.version, patch);
    store.updateTemplate(t0.id, patch);
  } catch (e) {
    throw new Error(`preview: ${String(e && e.message ? e.message : e)}`);
  } finally { running.delete(t0.id); }

  // ---- QA ----
  item.stage = "qa";
  running.set(t0.id, "qa");
  try {
    store.setStatus(t0.id, S.TESTING);
    const out = await qa({
      template: store.getTemplate(t0.id), version: store.getVersion(t0.id, v.version),
      sourceDir: store.draftSourceDir(t0.slug, v.version), mediaDir,
      onProgress: progressSink(t0.id, "qa"),
    });
    const results = normalizeQa(out);
    store.updateVersion(t0.id, v.version, { qaResults: results, qaScore: results.score });
    store.setStatus(t0.id, results.errors.length ? S.GENERATED : S.READY_TO_PUBLISH);
    item.qaScore = results.score;
    item.blockers = results.errors.length;
  } catch (e) {
    const msg = String(e && e.message ? e.message : e);
    try { store.setStatus(t0.id, S.FAILED, { error: msg }); } catch { /* already moved */ }
    throw new Error(`qa: ${msg}`);
  } finally { running.delete(t0.id); }
}

async function runAutoBatch(batch) {
  for (let i = 0; i < batch.items.length; i++) {
    if (batch.cancelled) break;
    const item = batch.items[i];
    batch.currentIndex = i;
    try {
      // Created here, not up front: a batch that reserved fifteen DRAFT rows and
      // then died would leave fifteen empty templates in the admin's library.
      const t = store.createTemplate({ ...item.create, createdBy: batch.createdBy });
      // createTemplate builds `generation` from a fixed field list, so the two
      // fields only the spec generator cares about — the renderer family and the
      // campaign's reserved motion — are folded in afterwards rather than being
      // silently dropped.
      if (item.create.family || item.create.pinMotion) {
        store.updateTemplate(t.id, {
          generation: {
            ...t.generation,
            ...(item.create.family ? { family: item.create.family } : {}),
            ...(item.create.pinMotion ? { pinMotion: item.create.pinMotion } : {}),
          },
        });
      }
      item.templateId = t.id;
      await autoRunOne(item);
      item.stage = "done";
      item.status = store.getTemplate(item.templateId).status;
      console.log(`[admin/auto] ${item.slug}: ${item.status} (QA ${item.qaScore ?? "n/a"}) [${i + 1}/${batch.items.length}]`);
    } catch (e) {
      item.stage = "failed";
      item.error = String(e && e.message ? e.message : e).slice(0, 400);
      item.status = item.templateId ? (store.getTemplate(item.templateId) || {}).status : null;
      console.warn(`[admin/auto] ${item.slug}: FAILED — ${item.error}`);
    }
  }
  batch.currentIndex = -1;
  batch.finishedAt = Date.now();
  const ok = batch.items.filter((i) => i.stage === "done").length;
  console.log(`[admin/auto] batch ${batch.id} finished: ${ok}/${batch.items.length} ok${batch.cancelled ? " (cancelled)" : ""}`);
}

function isRunning() { return !!(autoBatch && !autoBatch.finishedAt); }

// Plan and start a batch. Returns { batch } or { empty: true } when the pool (or
// campaign) has nothing left to give.
//
// A CAMPAIGN is the batch with a subject: "mars exploration", "street food".
// Each template gets a different ANGLE on it (the announcement, the numbers,
// the story…) plus its own allocated motion, so fifteen films on one subject
// are fifteen different films. With no subject the curated pool stands in,
// and both paths allocate motion the same way.
function startAutoBatch({ requested, requirement, orientation, createdBy }) {
  const taken = takenSlugs();
  const plan = requirement
    ? planCampaign({ count: requested, requirement, taken, orientation })
    : planAutoBatch({ count: requested, taken, orientation });
  if (!plan.length) return { empty: true };
  autoBatch = {
    id: crypto.randomUUID(),
    requested,
    poolExhausted: plan.length < requested,
    createdBy,
    startedAt: Date.now(), finishedAt: null, cancelled: false, currentIndex: 0,
    items: plan.map((p) => ({
      slug: p.slug, name: p.name, family: p.family, orientation: p.orientation,
      create: p, templateId: null, version: null,
      stage: "queued", status: null, qaScore: null, blockers: null, error: null,
    })),
  };
  const batch = autoBatch;
  // Snapshot before the run starts: its synchronous prefix already creates the
  // first template, and the caller reports the batch as it was accepted.
  const accepted = batchPublic(batch);
  runAutoBatch(batch).catch((e) => {
    console.error(`[admin/auto] batch crashed: ${e && e.message}`);
    batch.finishedAt = Date.now();
  });
  return { batch: accepted };
}

// Stops after the item in flight — a render is a child Chromium process, and
// tearing one down mid-encode is how half-written posters happen.
function cancelAutoBatch() {
  if (!isRunning()) return null;
  autoBatch.cancelled = true;
  return batchPublic(autoBatch);
}

const currentBatch = () => batchPublic(autoBatch);

module.exports = { MAX_BATCH, availableAutoBriefs, isRunning, startAutoBatch, cancelAutoBatch, currentBatch };
