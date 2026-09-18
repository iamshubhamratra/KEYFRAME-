// Admin templates — the admin-only build → review → publish pipeline for frame
// packs (mounted at /api/admin behind requireAdmin).
//
// Same contract as the projects flow, because it is the same problem shape — long
// work an operator watches and gates by hand: work that outlives the request
// returns 202 + a statusUrl, an SSE stream at /:id/events pushes state on change,
// an action taken in the wrong state is 409 naming the current state, and
// validation failures are `{ error, details: [] }`.

const path = require("node:path");
const { customAlphabet } = require("nanoid");
const config = require("../config");
const jobs = require("../models/job");
const store = require("../models/template");
const runs = require("../admin/runs");
const install = require("../admin/pack_install");
const autoBatch = require("../admin/auto_batch");
const {
  isTemplateId, validateCreate, validateGeneration, validatePatch, validateTestRender,
} = require("../validators/admin_template");

const nanoid = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 10);
const S = store.STATUS;
const { running, progress } = runs;

function fail(res, details) {
  return res.status(400).json({ error: "invalid request", details: Array.isArray(details) ? details : [details] });
}

function conflict(res, t, verb) {
  return res.status(409).json({
    error: `template is ${t.status}; ${verb} is not legal from there`,
    status: t.status,
    allowedNext: store.TRANSITIONS[t.status] || [],
  });
}

function busy(res, t) {
  return res.status(409).json({ error: `template is already ${running.get(t.id)}`, status: t.status });
}

// The template named by :id, or null after answering 400/404.
function mustTemplate(req, res) {
  if (!isTemplateId(req.params.id)) { res.status(400).json({ error: "bad id" }); return null; }
  const t = store.getTemplate(req.params.id);
  if (!t) { res.status(404).json({ error: "not found" }); return null; }
  return t;
}

// The long stages, loaded on first use. A load failure answers 500 naming it.
function loadStages(res) {
  try { return runs.stages(); } catch (e) {
    res.status(500).json({ error: "template stages failed to load", detail: String(e && e.message ? e.message : e) });
    return null;
  }
}

const accepted = (t, version, status) => ({
  templateId: t.id,
  version,
  status,
  statusUrl: `/api/admin/templates/${t.id}`,
  eventsUrl: `/api/admin/templates/${t.id}/events`,
});

function adminTemplatesController({ enqueueIntake } = {}) {
  // Boot is the one moment nothing is in flight: clear what a restart orphaned.
  install.sweepTestInstalls();
  runs.sweepStaleRuns();

  function create(req, res) {
    const { errs, out } = validateCreate(req.body || {});
    if (errs.length) return fail(res, errs);
    try {
      const t = store.createTemplate({ ...out, createdBy: req.user?.email || req.userId });
      // createTemplate builds `generation` from a fixed field list, so the
      // renderer family (which only the spec generator cares about) is folded in
      // afterwards rather than being silently dropped.
      if (out.family) store.updateTemplate(t.id, { generation: { ...t.generation, family: out.family } });
      res.status(201).json({ template: store.describe(t.id) });
    } catch (e) {
      const msg = String(e.message || e);
      // "already exists" / "collides with an installed pack" are state conflicts,
      // not malformed input — the admin has to pick a different slug, and a 409
      // is what tells the UI to say so rather than highlighting a bad field.
      const code = /already exists|collides/.test(msg) ? 409 : 400;
      res.status(code).json({ error: msg });
    }
  }

  function index(req, res) {
    const status = typeof req.query.status === "string" ? req.query.status : null;
    if (status && !Object.values(S).includes(status)) {
      return fail(res, `status must be one of: ${Object.values(S).join(", ")}`);
    }
    const q = typeof req.query.q === "string" ? req.query.q.slice(0, 120) : null;
    const templates = store.listTemplates({ status, q }).map((t) => ({
      ...t,
      running: running.get(t.id) || null,
    }));
    res.json({ templates });
  }

  // ---- auto generate ----
  function startAuto(req, res) {
    if (autoBatch.isRunning()) {
      return res.status(409).json({ error: "an auto batch is already running", batch: autoBatch.currentBatch() });
    }
    const requested = Math.floor(Number(req.body?.count));
    if (!Number.isFinite(requested) || requested < 1 || requested > autoBatch.MAX_BATCH) {
      return fail(res, `count must be a whole number from 1 to ${autoBatch.MAX_BATCH}`);
    }
    const requirement = typeof req.body?.requirement === "string" ? req.body.requirement.trim().slice(0, 200) : "";
    // A campaign is usually destined for ONE surface — a reel wall or a site hero
    // — so the admin picks the aspect for the whole run. "mixed" alternates.
    const orientation = ["vertical", "horizontal", "mixed"].includes(req.body?.orientation)
      ? req.body.orientation : "mixed";
    const started = autoBatch.startAutoBatch({ requested, requirement, orientation, createdBy: req.user?.email || req.userId });
    if (started.empty) {
      return res.status(409).json({ error: "every auto brief is already used — delete some templates or create one by hand" });
    }
    res.status(202).json({ batch: started.batch, statusUrl: "/api/admin/templates/auto" });
  }

  function autoStatus(_req, res) {
    res.json({ batch: autoBatch.currentBatch(), maxBatch: autoBatch.MAX_BATCH, available: autoBatch.availableAutoBriefs() });
  }

  function cancelAuto(_req, res) {
    const batch = autoBatch.cancelAutoBatch();
    if (!batch) return res.status(409).json({ error: "no auto batch is running" });
    res.json({ batch, note: "will stop after the template currently rendering" });
  }

  function show(req, res) {
    const t = mustTemplate(req, res);
    if (!t) return;
    res.json({ template: store.describe(t.id), running: running.get(t.id) || null, progress: progress.get(t.id) || null });
  }

  function update(req, res) {
    const t = mustTemplate(req, res);
    if (!t) return;
    const { errs, patch } = validatePatch(req.body || {}, t);
    if (errs.length) return fail(res, errs);
    res.json({ template: store.describe(store.updateTemplate(t.id, patch).id) });
  }

  function destroy(req, res) {
    const t = mustTemplate(req, res);
    if (!t) return;
    if (running.has(t.id)) return busy(res, t);
    let removed;
    try {
      removed = store.deleteTemplate(t.id);
    } catch (e) {
      // The store throws on PUBLISHED — that is a state conflict, not a bug.
      return res.status(409).json({ error: String(e.message || e), status: t.status });
    }
    if (!removed) return res.status(404).json({ error: "not found" });
    install.removeDraftTrees(t);
    progress.delete(t.id);
    res.json({ deleted: true, id: t.id, slug: t.slug });
  }

  // AUTHOR A WHOLE FILM, rather than a skin over an existing family.
  //
  // /generate runs the VARIANT generator: a palette and two fonts on one of the
  // hand-built renderer families. This runs the other kind of generation — the
  // model writes the film itself (its own animated world, scene components and
  // motion vocabulary), and admin/film_bundle.js compiles it into the same
  // self-contained bundle the shipped long-form templates use. See
  // services/film_author.js. Its own endpoint: the two produce different artifacts
  // validated against different contracts.
  async function authorFilm(req, res) {
    const t = mustTemplate(req, res);
    if (!t) return;
    if (running.has(t.id)) return busy(res, t);

    const body = req.body || {};
    const brief = String(body.prompt || (t.generation && t.generation.prompt) || "").trim();
    if (brief.length < 10) return fail(res, "a brief of at least 10 characters is required (send prompt, or PATCH it first)");
    const durationSec = Number(body.durationSec) > 0 ? Math.round(Number(body.durationSec)) : 300;
    const orientation = ["horizontal", "vertical", "square"].includes(body.orientation)
      ? body.orientation : (t.orientation || "horizontal");

    running.set(t.id, "author-film");
    try {
      const { authorFilm: author } = require("../services/film_author");
      const out = await author({ brief, slug: t.slug || t.name || "", durationSec, orientation });
      if (!out.ok) return fail(res, out.problems && out.problems.length ? out.problems : "the model could not produce a buildable film");
      res.json({
        ok: true,
        templateId: out.spec.templateId,
        scenes: out.spec.scenes.length,
        runtimeSec: Math.round(out.spec.scenes.reduce((a, s) => a + (Number(s.dur) || 0), 0)),
        bundleBytes: out.bytes,
        bundle: path.basename(out.file),
        overview: out.spec.overview || null,
      });
    } catch (e) {
      return fail(res, String((e && e.message) || e).slice(0, 300));
    } finally {
      running.delete(t.id);
    }
  }

  function generate(req, res) {
    const t = mustTemplate(req, res);
    if (!t) return;
    if (running.has(t.id)) return busy(res, t);

    const errs = [];
    const gen = validateGeneration(req.body || {}, errs);
    if (errs.length) return fail(res, errs);
    const generation = { ...t.generation, ...gen };
    if (!generation.prompt || generation.prompt.trim().length < 10) {
      return fail(res, "a generation prompt of at least 10 characters is required (send prompt, or PATCH it first)");
    }
    if (!store.canTransition(t.status, S.GENERATING)) return conflict(res, t, "generate");
    const stages = loadStages(res);
    if (!stages) return;

    // A finished build is an immutable record (the store's own contract), so a
    // regenerate over a successful version forks a new one; a regenerate over a
    // pending or failed attempt reuses it rather than burning a version number.
    const cur = t.currentVersion ? store.getVersion(t.id, t.currentVersion) : null;
    const v = cur && cur.generationStatus !== "ok"
      ? store.updateVersion(t.id, cur.version, { generationStatus: "pending", generationPrompt: generation.prompt, error: null })
      : store.createVersion(t.id, { generationPrompt: generation.prompt });

    store.updateTemplate(t.id, { generation });
    store.setStatus(t.id, S.GENERATING);

    // Answer first, then start the work: the admin UI switches to the SSE stream
    // on the 202, and the state it needs (GENERATING + the version number) is
    // already committed above.
    res.status(202).json(accepted(t, v.version, S.GENERATING));
    runs.startGenerate(t, v, generation, stages.generateTemplate);
  }

  function preview(req, res) {
    const t = mustTemplate(req, res);
    if (!t) return;
    if (running.has(t.id)) return busy(res, t);
    const v = t.currentVersion ? store.getVersion(t.id, t.currentVersion) : null;
    if (!v || v.generationStatus !== "ok") {
      return res.status(409).json({ error: "no generated source to preview — run generate first", status: t.status });
    }
    const stages = loadStages(res);
    if (!stages) return;

    res.status(202).json(accepted(t, v.version, t.status));
    runs.startPreview(t, v, stages.renderPreview);
  }

  function qa(req, res) {
    const t = mustTemplate(req, res);
    if (!t) return;
    if (running.has(t.id)) return busy(res, t);
    const v = t.currentVersion ? store.getVersion(t.id, t.currentVersion) : null;
    if (!v || v.generationStatus !== "ok") {
      return res.status(409).json({ error: "no generated source to QA — run generate first", status: t.status });
    }
    if (!store.canTransition(t.status, S.TESTING)) return conflict(res, t, "qa");
    const stages = loadStages(res);
    if (!stages) return;

    store.setStatus(t.id, S.TESTING);
    res.status(202).json(accepted(t, v.version, S.TESTING));
    runs.startQa(t, v, stages.runTemplateQa);
  }

  // A real test render. Reuses the production pipeline exactly as POST
  // /api/projects does — one job row, pinned to this template's pack, drained by
  // the same queue — so a test exercises the code path a customer's video takes.
  // Status-neutral on purpose: the render finishes outside this process's control
  // and is judged by eye, so a closed tab must not park a template in TESTING.
  function test(req, res) {
    const t = mustTemplate(req, res);
    if (!t) return;
    if (typeof enqueueIntake !== "function") {
      return res.status(501).json({ error: "not implemented", detail: "router was mounted without enqueueIntake" });
    }
    const v = t.currentVersion ? store.getVersion(t.id, t.currentVersion) : null;
    if (!v || v.generationStatus !== "ok") {
      return res.status(409).json({ error: "no generated source to test — run generate first", status: t.status });
    }

    const body = req.body || {};
    const { errs, prompt, duration, quality, fps } = validateTestRender(body, t);
    if (errs.length) return fail(res, errs);

    if (jobs.countJobsSince(Date.now() - 24 * 60 * 60 * 1000) >= config.server.dailyJobCap) {
      return res.status(429).json({ error: "daily job cap reached" });
    }

    // Make the draft visible to the renderer. frame_registry only sees frames/,
    // so the draft is installed there for the duration of the render, marked as a
    // test install and torn down when the job settles.
    const slot = install.testSlot(t, v);
    if (slot.occupied) {
      return res.status(409).json({
        error: `frames/${t.slug} is occupied by another pack (or an older published version) — unpublish this template before testing a newer draft`,
        status: t.status,
      });
    }

    const jobId = nanoid();
    let installed = false;
    if (!slot.ourPublished) {
      try {
        // Replace any earlier test install of ours: it may hold a different
        // version, and re-stamping the marker with THIS jobId hands teardown to
        // the newest test so the older watcher can't pull the pack mid-render.
        if (slot.ourTestInstall) install.removeTestInstall(t.slug, null);
        install.installForTest(t, v, jobId);
        installed = true;
      } catch (e) {
        return res.status(500).json({ error: "could not stage the draft pack for a test render", detail: String(e.message || e) });
      }
    }

    const dims = config.dimensionsFor(t.orientation, quality);
    try {
      jobs.insert({
        id: jobId,
        kind: "project",
        prompt,
        duration,
        orientation: t.orientation,
        quality,
        width: dims.width,
        height: dims.height,
        fps,
        framePack: t.slug,
        voiceStyle: null,
        // Autopilot: a template test wants a finished film, not a script review
        // checkpoint an admin has to babysit in another tab.
        autopilot: true,
        captionsEnabled: false,
        captionsConfig: null,
        voiceoverEnabled: body.voiceover !== false,
        brandPalette: null,
        render3d: false,
        uploadPath: null,
        userAssets: null,
        intent: {
          prompt,
          websiteUrl: null,
          blogUrl: null,
          hasReferenceVideo: false,
          hasUserAssets: null,
          adminTemplateTest: { templateId: t.id, slug: t.slug, version: v.version },
          preferences: { duration, orientation: t.orientation, voiceStyle: "auto", framePack: t.slug },
        },
        created_at: Date.now(),
        client_ip: req.ip || "admin",
      });
      enqueueIntake(jobId);
    } catch (e) {
      if (installed) install.removeTestInstall(t.slug, jobId);
      return res.status(500).json({ error: "could not queue the test render", detail: String(e.message || e) });
    }

    if (installed) install.watchTestJob(t.slug, jobId);
    store.updateVersion(t.id, v.version, { testJobIds: [...(v.testJobIds || []), jobId].slice(-20) });

    res.status(202).json({
      templateId: t.id,
      version: v.version,
      jobId,
      framePack: t.slug,
      temporarilyInstalled: installed,
      statusUrl: `/api/projects/${jobId}`,
      eventsUrl: `/api/projects/${jobId}/events`,
    });
  }

  function publish(req, res) {
    const t = mustTemplate(req, res);
    if (!t) return;
    if (running.has(t.id)) return busy(res, t);
    if (t.status !== S.READY_TO_PUBLISH) {
      return res.status(409).json({
        error: `template is ${t.status}, not ${S.READY_TO_PUBLISH}`,
        status: t.status,
        hint: t.status === S.GENERATED ? "run QA and clear its blocking issues first" : undefined,
      });
    }

    const gate = install.publishBlockers(t);
    if (gate.blocking.length) return res.status(422).json({ error: "template is not publishable", blocking: gate.blocking });

    let liveSrc;
    try {
      liveSrc = install.publishVersion(t, gate, req.user?.email || req.userId);
    } catch (e) {
      return res.status(500).json({ error: "publish failed while copying", detail: String(e.message || e) });
    }

    const v = gate.version;
    store.updateTemplate(t.id, {
      sourcePath: liveSrc,
      thumbnail: v.thumbnail || t.thumbnail,
      previewVideo: v.previewVideo || t.previewVideo,
    });
    store.setStatus(t.id, S.PUBLISHED);
    console.log(`[admin/templates] published ${t.slug} v${v.version} → ${liveSrc}`);
    res.json({ template: store.describe(t.id), publishedVersion: v.version, liveSourceDir: liveSrc });
  }

  // Takes the live copy down and returns the template to READY_TO_PUBLISH. The
  // draft and every version record survive untouched — unpublishing is a
  // retraction, not a delete.
  function unpublish(req, res) {
    const t = mustTemplate(req, res);
    if (!t) return;
    if (t.status !== S.PUBLISHED) return res.status(409).json({ error: `template is ${t.status}, not ${S.PUBLISHED}`, status: t.status });
    const result = install.takeDown(t);
    if (result.blocking) return res.status(422).json({ error: "template is not unpublishable", blocking: result.blocking });
    store.setStatus(t.id, S.READY_TO_PUBLISH);
    res.json({ template: store.describe(t.id), removed: result.removed });
  }

  function archive(req, res) {
    const t = mustTemplate(req, res);
    if (!t) return;
    if (t.status === S.ARCHIVED) return res.json({ template: store.describe(t.id) });
    // PUBLISHED → ARCHIVED is a legal transition, but archiving a template while
    // its pack still serves users would leave a retired record and a live folder
    // disagreeing. So archive takes the copy down on the way through
    // READY_TO_PUBLISH — both moves are in the store's own table.
    if (t.status === S.PUBLISHED) {
      const result = install.takeDown(t);
      if (result.blocking) return res.status(422).json({ error: "cannot archive: the live copy could not be removed", blocking: result.blocking });
      store.setStatus(t.id, S.READY_TO_PUBLISH);
    }
    try {
      store.setStatus(t.id, S.ARCHIVED);
    } catch (e) {
      return res.status(409).json({ error: String(e.message || e), status: store.getTemplate(t.id).status });
    }
    res.json({ template: store.describe(t.id) });
  }

  // A new version is an empty build slot; the published one keeps serving from
  // frames/ because publish copied it there — nothing about creating v(n+1)
  // touches the live folder.
  function createVersion(req, res) {
    const t = mustTemplate(req, res);
    if (!t) return;
    if (running.has(t.id)) return busy(res, t);
    const errs = [];
    const gen = validateGeneration(req.body || {}, errs);
    if (errs.length) return fail(res, errs);
    const v = store.createVersion(t.id, {
      generationPrompt: gen.prompt || t.generation?.prompt || "",
      generationSpec: req.body && req.body.spec ? req.body.spec : null,
    });
    if (Object.keys(gen).length) store.updateTemplate(t.id, { generation: { ...t.generation, ...gen } });
    res.status(201).json({ version: v, template: store.describe(t.id) });
  }

  // SSE — same shape as /api/projects/:id/events: poll module state on a 1s tick,
  // write a data frame only when something an operator would notice changed.
  // Closes when the template is deleted; otherwise it lives until the client
  // hangs up.
  function events(req, res) {
    if (!isTemplateId(req.params.id)) return res.status(400).json({ error: "bad id" });
    const id = req.params.id;
    if (!store.getTemplate(id)) return res.status(404).json({ error: "not found" });

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    let lastKey = "";
    let ticks = 0;
    const send = () => {
      const t = store.describe(id);
      if (!t) {
        res.write(`data: ${JSON.stringify({ id, deleted: true })}\n\n`);
        return true;
      }
      const p = progress.get(id) || null;
      const v = t.versions && t.versions[0];
      const key = [t.status, t.currentVersion, t.publishedVersion, v && v.generationStatus,
        v && v.qaResults && v.qaResults.at, v && v.thumbnail, (v && v.testJobIds || []).length,
        running.get(id) || "", p && p.step, p && p.pct].join("|");
      if (key !== lastKey) {
        lastKey = key;
        res.write(`data: ${JSON.stringify({ ...t, running: running.get(id) || null, progress: p })}\n\n`);
      }
      return false;
    };

    if (send()) { res.end(); return; }
    const timer = setInterval(() => {
      try {
        if (send()) { clearInterval(timer); res.end(); return; }
        // Comment heartbeat: an idle template can sit unchanged for minutes and
        // proxies drop a silent stream.
        if (++ticks % 25 === 0) res.write(": ka\n\n");
      } catch { clearInterval(timer); }
    }, 1000);
    req.on("close", () => clearInterval(timer));
  }

  return {
    create, index, startAuto, autoStatus, cancelAuto, show, update, destroy,
    authorFilm, generate, preview, qa, test, publish, unpublish, archive, createVersion, events,
  };
}

module.exports = adminTemplatesController;
