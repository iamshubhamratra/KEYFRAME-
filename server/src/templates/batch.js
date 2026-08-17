// BATCH ORCHESTRATOR — plan N directions, then run each one through the EXISTING single-template
// pipeline, one at a time, publishing only what earns it.
//
// WHAT THIS FILE IS NOT. It is not a second template generator. Every step below is the same call
// the admin's own buttons make: service.runGeneration, service.runQa, media.makeStills,
// test_render.startTestRender, service.runPublish. If a rule changes there — a new publish
// blocker, a new QA check, the version lifecycle — the batch inherits it, because there is only
// one implementation of each.
//
// WHY IT IS STRICTLY SEQUENTIAL. Not caution: film_stage and film_beats hold per-build module
// state (RW/RH, TSCALE, PAD/COL/WIDE, set by build() and read by every beat). Two concurrent
// buildComposition calls would interleave and produce two wrong films — silently, since neither
// would throw. One template at a time is the only safe arrangement, and it is also the polite one:
// the shared p-queue that renders customers' videos is untouched except by test renders, which
// enter it as ordinary jobs and are throttled by it like anything else.
//
// THE LOOP, PER TEMPLATE:
//
//   direction -> generate -> validate -> UNIQUENESS -> stills -> test render -> deep QA
//             -> (auto-fix and retry, up to MAX_ATTEMPTS)
//             -> publish, or reject, or fail — and on to the next one
//
// A failure never stops the batch (§15/§20), and nothing skips QA (§4). A rejection for similarity
// is not a failure: it is the feature working, and it feeds the next attempt a brief that names
// exactly what collided.

const store = require("./store");
const lifecycle = require("./lifecycle");
const paths = require("./paths");
const batchStore = require("./batch_store");
const strategy = require("./strategy");
const fingerprint = require("./fingerprint");
const service = require("./service");
const testRender = require("./test_render");

const qa = () => require("./qa");
const media = () => require("./media");

// Two regenerations after the first attempt. A third has never fixed anything a second did not:
// the failures that survive two informed retries are structural, and the honest move is to record
// them and spend the time on the next direction (§13).
const MAX_ATTEMPTS = 3;

// The uniqueness floor, on the CALIBRATED scale (see fingerprint.js): 100 means "at least as
// distinct as the median pair of shipped packs", 0 means "identical to something that exists".
// 80 rejects roughly the most-similar sixth of the shipped library, which is the right place for a
// gate that exists to stop the library filling up with siblings.
const MIN_UNIQUENESS = 80;

// A template that renders and passes every blocking check can still be thin. The publish gate
// (qa.isPublishable) is the hard floor; this is the batch's own quality bar on top of it, because
// an unattended run should hold a higher standard than a human clicking publish on one template
// they have looked at (§12).
const MIN_QUALITY = 85;

const inFlightBatches = new Map();   // batchId -> promise, so two runs cannot start for one batch

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function log(batchId, msg) { console.log(`[template-batch ${String(batchId).slice(0, 8)}] ${msg}`); }

// ---------------------------------------------------------------- naming

// A slug the store will accept, derived from the direction's name, kept unique against everything
// installed. Names come from the strategy step (§24) — "Prism Motion", never "Template 3".
function slugFor(name, index) {
  let base = String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  if (!base || base.length < 3) base = `batch-template-${index}`;
  if (!paths.slugError(base) && !paths.existsAnywhere(base) && !store.getBySlug(base)) return base;
  for (let n = 2; n < 60; n++) {
    const candidate = `${base}-${n}`.slice(0, 46);
    if (!paths.slugError(candidate) && !paths.existsAnywhere(candidate) && !store.getBySlug(candidate)) return candidate;
  }
  return `${base}-${Date.now().toString(36).slice(-5)}`;
}

// ---------------------------------------------------------------- one template

// Everything that happens to a single direction. Returns the item's terminal state; throws only if
// the batch itself should stop (it never does — every per-template failure is caught here).
async function runOne({ batchId, item, direction, config }) {
  const B = batchStore;
  const cancelled = () => (B.get(batchId) || {}).cancelRequested;
  const setItem = (patch) => B.updateItem(batchId, item.index, patch);

  let rec = null;
  let rejection = null;
  // THE BRIEF THE NEXT ATTEMPT WILL BE GENERATED FROM, set by whichever gate refused this one.
  // There is exactly one regeneration per attempt, at the top of the loop, and it consumes this.
  // (Regenerating inside a gate's own branch AND falling through to the loop's generation runs the
  // model twice and throws away the more informed of the two answers.)
  let pendingFeedback = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (cancelled()) { setItem({ state: B.ITEM.CANCELLED, finishedAt: Date.now() }); return B.ITEM.CANCELLED; }
    setItem({ state: B.ITEM.GENERATING, attempts: attempt, startedAt: item.startedAt || Date.now(), error: null });

    try {
      // --- the record. Created once; retries regenerate INTO it rather than making a new one, so
      // a rejected attempt leaves no orphan row and no orphan directory.
      if (!rec) {
        const slug = slugFor(direction.name, item.index);
        rec = store.create({
          slug,
          name: direction.name,
          prompt: strategy.briefFor({ direction, config, rejection: null }),
          orientation: config.orientation === "landscape" ? "landscape" : "portrait",
          description: direction.identity || "",
          category: direction.category,
          tags: direction.tags,
          createdBy: config.createdBy || null,
          options: { batchId, batchIndex: item.index, direction: direction.name },
        });
        setItem({ slug, templateId: rec.id, name: direction.name, direction });
        log(batchId, `#${item.index} "${direction.name}" -> ${slug}`);
      }

      // --- GENERATE (the ordinary single-template path). On a retry the brief carries the reason
      // the last attempt was refused — a uniqueness collision named dimension by dimension, or the
      // QA report's own `fix` lines. That is the whole mechanism behind "auto-fix": no new agent,
      // just the designer model re-briefed with its own defects.
      if (pendingFeedback) store.update(rec.id, { prompt: pendingFeedback });
      await service.runGeneration({ id: rec.id, feedback: pendingFeedback });
      pendingFeedback = null;
      rec = store.get(rec.id);
      if (rec.status === lifecycle.STATUS.FAILED) throw new Error(rec.error || "generation failed");

      // --- UNIQUENESS, before a single frame is rendered. It is the cheapest gate in the pipeline
      // (pure arithmetic over the spec) and the most likely to reject, so it runs first.
      if (cancelled()) { setItem({ state: B.ITEM.CANCELLED, finishedAt: Date.now() }); return B.ITEM.CANCELLED; }
      const peers = publishedPeersOf(batchId, item.index);
      const score = fingerprint.scoreAgainst(rec.spec, {
        meta: { slug: rec.slug, name: rec.name, category: rec.category, tags: rec.tags, stage: rec.orientation },
        peers,
      });
      setItem({ uniqueness: score.uniqueness, similarTo: score.nearest ? score.nearest.name : null });
      if (score.uniqueness < MIN_UNIQUENESS) {
        rejection = score;
        pendingFeedback = strategy.briefFor({ direction, config, rejection: score });
        log(batchId, `#${item.index} uniqueness ${score.uniqueness} (${score.similarity}% like ${score.nearest && score.nearest.slug}) — regenerating`);
        if (attempt === MAX_ATTEMPTS) {
          setItem({ state: B.ITEM.REJECTED, finishedAt: Date.now(), error: `too similar to "${score.nearest && score.nearest.name}" (${score.similarity}%) after ${attempt} attempts` });
          return B.ITEM.REJECTED;
        }
        continue;
      }
      rejection = null;

      // --- STILLS. Cheap, and the thumbnail the result card shows.
      setItem({ state: B.ITEM.TESTING });
      try { await media().makeStills({ slug: rec.slug, count: 4 }); }
      catch (e) { log(batchId, `#${item.index} stills failed (${e.message.slice(0, 80)}) — continuing`); }

      // --- TEST RENDER, through the real pipeline. Publishing requires one (service.publishBlockers
      // enforces it), so the batch has to run it and WAIT for the verdict.
      if (cancelled()) { setItem({ state: B.ITEM.CANCELLED, finishedAt: Date.now() }); return B.ITEM.CANCELLED; }
      const test = await runTestAndWait({ batchId, rec, config });
      if (!test.ok) {
        if (attempt === MAX_ATTEMPTS) {
          setItem({ state: B.ITEM.FAILED, finishedAt: Date.now(), error: `test render ${test.reason}` });
          return B.ITEM.FAILED;
        }
        log(batchId, `#${item.index} test render ${test.reason} — regenerating`);
        continue;
      }

      // --- DEEP QA. The same report the publish gate re-runs; nothing here can skip it.
      if (cancelled()) { setItem({ state: B.ITEM.CANCELLED, finishedAt: Date.now() }); return B.ITEM.CANCELLED; }
      setItem({ state: B.ITEM.QUALITY_CHECK });
      const { qa: report } = await service.runQa({ id: rec.id });
      setItem({ qaScore: report ? report.score : null });
      const publishable = qa().isPublishable(report);

      if (!publishable.ok || (report.score || 0) < MIN_QUALITY) {
        const why = !publishable.ok
          ? publishable.blocking.map((b) => `${b.id}: ${b.detail}`).join(" | ")
          : `quality ${report.score}/100 is below the batch floor of ${MIN_QUALITY}`;
        if (attempt === MAX_ATTEMPTS) {
          setItem({ state: B.ITEM.FAILED, finishedAt: Date.now(), error: why.slice(0, 600) });
          return B.ITEM.FAILED;
        }
        // AUTO-FIX. The QA report becomes the next attempt's brief, in the model's own terms —
        // every check carries a `fix` line written for exactly this purpose. This is the "template
        // improvement agent" the spec asks for: the designer model, re-briefed with its own
        // defects. The regeneration itself happens once, at the top of the next iteration.
        rejection = null;
        const fixes = (publishable.blocking || []).concat(report.warnings || []).slice(0, 8)
          .map((b) => `- ${b.detail}${b.fix ? ` FIX: ${b.fix}` : ""}`).join("\n");
        pendingFeedback = `The previous version of this template failed its quality checks. Fix these specifically, and change nothing else about the design:\n${fixes}`;
        log(batchId, `#${item.index} QA ${report.score} — regenerating with ${(publishable.blocking || []).length} blocker(s)`);
        continue;
      }

      // --- PUBLISH. Through the ordinary gate, which re-runs QA fail-closed, requires the poster
      // and preview, moves the directory last, and supersedes any previous version of the family.
      if (cancelled()) { setItem({ state: B.ITEM.CANCELLED, finishedAt: Date.now() }); return B.ITEM.CANCELLED; }
      setItem({ state: B.ITEM.PUBLISHING });
      await service.runPublish({ id: rec.id });
      const after = store.get(rec.id);
      if (after.status !== lifecycle.STATUS.PUBLISHED) throw new Error(`publish finished but the record is ${after.status}`);

      // The library changed, so the next template must be compared against a library that includes
      // this one — otherwise a batch can publish two near-identical templates in a row.
      fingerprint.invalidateLibrary();
      setItem({ state: B.ITEM.PUBLISHED, finishedAt: Date.now(), qaScore: report.score, error: null });
      log(batchId, `#${item.index} PUBLISHED ${rec.slug} (QA ${report.score}, uniqueness ${score.uniqueness})`);
      return B.ITEM.PUBLISHED;
    } catch (err) {
      // KEEP THE BLOCKER LIST. The publish gate refuses with a structured `blocking` array whose
      // entries each say what is wrong and how to fix it; `err.message` is the useless half
      // ("cannot publish template"). Discarding the useful half cost a whole diagnosis — the batch
      // reported a generic failure while the record's own evidence was overwritten by the retry
      // that followed.
      const blockers = Array.isArray(err && err.blocking) && err.blocking.length
        ? ` — ${err.blocking.map((b) => `${b.id}: ${b.detail}`).join(" | ")}`
        : "";
      const msg = `${String((err && err.message) || err)}${blockers}`.slice(0, 900);
      if (attempt === MAX_ATTEMPTS) {
        setItem({ state: B.ITEM.FAILED, finishedAt: Date.now(), error: msg });
        log(batchId, `#${item.index} FAILED after ${attempt} attempt(s): ${msg.slice(0, 160)}`);
        return B.ITEM.FAILED;
      }
      log(batchId, `#${item.index} attempt ${attempt} failed (${msg.slice(0, 120)}) — retrying`);
      setItem({ error: msg });
      await sleep(1000);
    }
  }
  setItem({ state: B.ITEM.FAILED, finishedAt: Date.now() });
  return B.ITEM.FAILED;
}

// SCRATCH, SWEPT. Every QA run writes a composed page plus its stress variants and their PNGs into
// template_work/<slug>/ — 47MB had accumulated across 129 slugs before this existed, and a batch
// multiplies that by the number of attempts. It is pure scratch: qa.js deletes the directory at the
// START of every run precisely because a stale artifact would read as a fresh result, so removing
// it after a template reaches its verdict loses nothing and keeps an unattended run from filling
// the disk.
//
// It touches ONE directory under ONE allowlisted root. Nothing here can reach a pack directory, a
// composer module or a published poster — the things that are not regenerable.
function sweepWorkArtifacts(slug) {
  if (!slug) return;
  try { paths.safeRmDir(paths.workDir(slug)); }
  catch (e) { console.warn(`[template-batch] could not sweep template_work/${slug}: ${e.message}`); }
}

// The specs of templates this batch has already published — peers the uniqueness check must see
// even before the library cache is refreshed.
function publishedPeersOf(batchId, exceptIndex) {
  const b = batchStore.get(batchId);
  if (!b) return [];
  const out = [];
  for (const it of b.items || []) {
    if (it.index === exceptIndex || !it.templateId) continue;
    const rec = store.get(it.templateId);
    if (!rec || !rec.spec) continue;
    out.push(fingerprint.fingerprint(rec.spec, { slug: rec.slug, name: rec.name, category: rec.category, tags: rec.tags, stage: rec.orientation }));
  }
  return out;
}

// Start a test render and wait for the pipeline to finish it.
//
// The render runs on the SHARED job queue, so this waits rather than polling hard: the batch has
// nothing useful to do until the film exists, and jumping the queue would put template work ahead
// of customers' videos.
// TEST A TEMPLATE WITH THE KIND OF JOB IT WAS DESIGNED FOR.
//
// Found by running this for real: the first batch template failed its test render on
// `criticalPlaceholdersFilled` — "1 of 1 critical slot(s) are EMPTY". The default scenario is
// prompt-only, which supplies NO imagery by design, so a template that declares a critical picture
// slot cannot pass it. Every such template would have burned three full pipeline runs and been
// marked FAILED for doing exactly what a good template does.
//
// So the scenario is chosen from the template's own declared asset requirements: a template that
// wants pictures is tested with the asset-rich website scenario, and only a genuinely typographic
// one is tested prompt-only. An explicit choice from the admin still wins.
function scenarioFor(rec, config) {
  if (config.testScenario) return config.testScenario;
  const needs = rec && rec.assetRequirements ? Number(rec.assetRequirements.requiredAssetCount) || 0 : 0;
  return needs > 0 ? "website" : "prompt-only";
}

async function runTestAndWait({ batchId, rec, config, timeoutMs = 15 * 60 * 1000 }) {
  const enqueue = config.enqueueIntake;
  if (typeof enqueue !== "function") return { ok: false, reason: "no queue available to run a test render" };
  let started;
  try {
    started = testRender.startTestRender({
      slug: rec.slug,
      scenario: scenarioFor(rec, config),
      record: rec,
      createdBy: config.createdBy || null,
      enqueueIntake: enqueue,
    });
  } catch (e) { return { ok: false, reason: `could not start: ${e.message}` }; }

  store.update(rec.id, { tests: [{ ...started, at: Date.now() }, ...(rec.tests || [])].slice(0, 20) });

  // WAIT FOR *THIS* RENDER, not for "the most recent test with a verdict".
  //
  // `refreshTests().lastTest` returns the newest test that has REACHED a verdict — which, while a
  // fresh one is still queued, is the PREVIOUS attempt's. On a retry that made this function return
  // the old failure within one poll: attempts 2 and 3 of a real run each "completed" in 15 seconds
  // and re-reported attempt 1's error. The started job's own id is the only thing worth polling.
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((batchStore.get(batchId) || {}).cancelRequested) return { ok: false, reason: "cancelled" };
    await sleep(4000);
    const mine = testRender.refreshTests(store.get(rec.id)).tests.find((t) => t.projectId === started.projectId);
    if (!mine) continue;
    if (mine.state === "done") return { ok: true, projectId: started.projectId };
    if (mine.state === "failed") return { ok: false, reason: `failed: ${String(mine.error || "").slice(0, 200)}` };
    if (mine.state === "empty") return { ok: false, reason: "finished with no video" };
    if (mine.state === "gone") return { ok: false, reason: "the job record disappeared" };
  }
  return { ok: false, reason: "timed out" };
}

// ---------------------------------------------------------------- the batch

async function runBatch({ batchId }) {
  const B = batchStore;
  const b = B.get(batchId);
  if (!b) throw Object.assign(new Error("batch not found"), { status: 404, code: "NOT_FOUND" });

  B.update(batchId, { status: B.STATUS.PLANNING, startedAt: Date.now(), progress: "Planning the design directions" });
  log(batchId, `planning ${b.requestedCount} direction(s)`);

  // --- STRATEGY. One call, N directions, aware of what the library already holds.
  try {
    const lib = fingerprint.loadLibrary();
    const { directions, usage } = await strategy.planBatch({
      count: b.requestedCount,
      config: {
        ...b.config,
        existingNames: lib.map((x) => x.name).filter(Boolean),
      },
    });
    B.update(batchId, { plan: directions, planUsage: usage });
    directions.forEach((d, i) => B.updateItem(batchId, i + 1, { direction: d, name: d.name }));
    log(batchId, `plan: ${directions.map((d) => d.name).join(", ")}`);
  } catch (e) {
    B.update(batchId, { status: B.STATUS.FAILED, error: `the design strategy could not be planned: ${e.message}`, completedAt: Date.now(), progress: "Failed" });
    log(batchId, `planning FAILED: ${e.message}`);
    return B.shape(B.get(batchId));
  }

  // --- THE LOOP. Strictly one at a time (see the header for why that is a correctness
  // requirement, not a courtesy).
  for (const item of B.get(batchId).items) {
    const fresh = B.get(batchId);
    if (fresh.cancelRequested) {
      B.updateItem(batchId, item.index, { state: B.ITEM.CANCELLED, finishedAt: Date.now() });
      continue;
    }
    B.update(batchId, {
      status: B.STATUS.GENERATING,
      currentTemplate: item.index,
      progress: `Template ${item.index} of ${fresh.requestedCount}: ${item.direction ? item.direction.name : "…"}`,
    });
    await runOne({
      batchId,
      item,
      direction: (B.get(batchId).items.find((x) => x.index === item.index) || {}).direction || { name: `Direction ${item.index}`, structure: {} },
      config: fresh.config,
    });
    // The verdict is in; the scratch that produced it is no longer evidence of anything.
    sweepWorkArtifacts((B.get(batchId).items.find((x) => x.index === item.index) || {}).slug);
  }

  const status = B.finalStatusFor(B.get(batchId));
  const t = B.tally(B.get(batchId));
  B.update(batchId, {
    status,
    completedAt: Date.now(),
    currentTemplate: null,
    progress: `${t.published} published, ${t.rejected} rejected, ${t.failed} failed`,
  });
  log(batchId, `${status}: ${t.published}/${t.requested} published, ${t.rejected} rejected, ${t.failed} failed, avg quality ${t.avgQuality ?? "-"}, avg uniqueness ${t.avgUniqueness ?? "-"}`);
  return B.shape(B.get(batchId));
}

// Start a batch detached. One run per batch id, and — because of the module-state constraint — one
// running batch per process; a second start is refused rather than queued, so the admin gets an
// immediate, honest answer instead of a run that silently waits.
function start({ count, config, createdBy, enqueueIntake }) {
  const running = [...inFlightBatches.keys()];
  if (running.length) {
    const e = new Error("another template batch is already running — template builds cannot run concurrently");
    e.status = 409;
    e.code = "BATCH_BUSY";
    e.batchId = running[0];
    throw e;
  }
  const n = Math.max(1, Math.min(25, Number(count) || 1));
  const b = batchStore.create({ count: n, config: { ...config, createdBy }, createdBy });

  // THE QUEUE HANDLE RIDES IN MEMORY, NEVER ON DISK. A function cannot be JSON, so it is attached
  // to the in-memory record and silently dropped by every flush — which is what we want: a config
  // read back after a restart describes the run without pretending it can still reach a queue that
  // died with the process. Attached BEFORE the run starts, so nothing in the orchestrator can read
  // a config that has not got it yet.
  batchStore.get(b.id).config = { ...b.config, enqueueIntake };

  const p = runBatch({ batchId: b.id })
    .catch((e) => {
      batchStore.update(b.id, { status: batchStore.STATUS.FAILED, error: String(e.message || e), completedAt: Date.now() });
      console.error(`[template-batch] ${b.id} crashed: ${e.message}`);
    })
    .finally(() => inFlightBatches.delete(b.id));
  inFlightBatches.set(b.id, p);
  return b;
}

function isRunning(id) { return inFlightBatches.has(id); }

module.exports = {
  start, runBatch, runOne, slugFor, isRunning, scenarioFor, sweepWorkArtifacts,
  MAX_ATTEMPTS, MIN_UNIQUENESS, MIN_QUALITY,
};
