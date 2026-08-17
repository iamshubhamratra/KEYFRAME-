// ADMIN TEMPLATE API — create, generate, test, QA, publish.
//
// EVERY route in this file is behind requireAdmin, applied once with router.use() rather than
// per-handler. Per-handler guards are how an endpoint ends up unprotected: the guard is a thing
// you have to remember on each new route, and this router will grow. Applied at the top, a new
// route is protected by default and would have to be deliberately moved outside the router to
// escape it.
//
// Hiding the admin UI is not authorization — that is stated in the frontend too. This is the
// enforcement.

const express = require("express");
const { requireAdmin } = require("../auth/middleware");
const store = require("../templates/store");
const lifecycle = require("../templates/lifecycle");
const paths = require("../templates/paths");
const service = require("../templates/service");
const generator = require("../templates/generator");
const testRender = require("../templates/test_render");
const batch = require("../templates/batch");
const batchStore = require("../templates/batch_store");

// In-flight long-running actions, so a double-click cannot start two generations for one
// template (two concurrent film_stage builds are not safe — it keeps a module-level TSCALE).
const inFlight = new Map();

function detach(id, label, fn) {
  if (inFlight.has(id)) {
    const e = new Error(`this template is already ${inFlight.get(id)}`);
    e.status = 409;
    e.code = "BUSY";
    throw e;
  }
  inFlight.set(id, label);
  Promise.resolve()
    .then(fn)
    .catch((err) => {
      // The record already carries the failure (service.js writes it); this is the operator log.
      console.error(`[admin-templates] ${label} failed for ${id}: ${err.message}`);
    })
    .finally(() => inFlight.delete(id));
}

function send(res, err) {
  const status = err && err.status ? err.status : 500;
  const body = { error: err && err.message ? err.message : "internal error" };
  if (err && err.code) body.code = err.code;
  if (err && err.blocking) body.blocking = err.blocking;
  if (err && err.errors) body.details = err.errors;
  return res.status(status).json(body);
}

// The batch record, plus the live-ness only this process knows, and never the queue handle its
// config carries in memory (a function is not JSON, and the client has no use for it).
function shapeBatch(b) {
  if (!b) return null;
  const out = batchStore.shape(b);
  out.running = batch.isRunning(b.id);
  out.config = { ...(out.config || {}) };
  delete out.config.enqueueIntake;
  return out;
}

function shaped(rec) {
  if (!rec) return null;
  const out = store.shape(rec);
  out.busy = inFlight.get(rec.id) || null;
  // Test outcomes are resolved from the jobs table on read rather than duplicated onto the
  // record, so "the last test passed" can never be stale. See test_render.refreshTests.
  const t = testRender.refreshTests(rec);
  out.tests = t.tests;
  out.lastTest = t.lastTest;
  return out;
}

function buildRouter({ enqueueIntake }) {
  const router = express.Router();

  router.use(requireAdmin);

  // ---- collection ----

  router.get("/templates", (req, res) => {
    const status = typeof req.query.status === "string" && req.query.status !== "all" ? req.query.status : undefined;
    const rows = store.list({ status, q: req.query.q, family: req.query.family });
    res.json({
      templates: rows.map(shaped),
      // ONE ROW PER FAMILY: which version is live, which is being worked on, what QA said, how
      // many issues are open. Computed in the store so the dashboard and the detail page cannot
      // disagree about what "current" means.
      families: store.familySummaries(),
      // The lifecycle vocabulary, so the dashboard's filter pills come from the server rather
      // than a second copy of the table in the client.
      statuses: lifecycle.ALL_STATUSES,
      scenarios: testRender.scenarioList(),
      issueCategories: store.ISSUE_CATEGORIES,
      issueSeverities: store.ISSUE_SEVERITIES,
    });
  });

  router.post("/templates", (req, res) => {
    const b = req.body || {};
    const name = String(b.name || "").trim();
    if (!name) return res.status(400).json({ error: "a template name is required" });

    // Slug from the name unless one was given. Validated either way — it becomes a directory
    // name, a module filename, a renderer id and a URL segment.
    const slug = String(b.slug || name).trim().toLowerCase()
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
    const slugErr = paths.slugError(slug);
    if (slugErr) return res.status(400).json({ error: `invalid template name: ${slugErr}` });

    if (!String(b.prompt || "").trim()) return res.status(400).json({ error: "a generation prompt is required" });

    // Resolve the JOB-vocabulary orientation the client posts (horizontal|vertical|square) into
    // the PACK-vocabulary stage the manifest and the engine speak (landscape|portrait). Refused
    // HERE, at create, with the real reason — not after a generation the admin waited on.
    let stage;
    try { stage = generator.assertOrientationSupported(b.orientation || "vertical"); }
    catch (e) { return send(res, e); }

    try {
      const rec = store.create({
        slug,
        name,
        family: b.family || slug,
        version: 1,
        prompt: String(b.prompt),
        orientation: stage,
        description: b.description ? String(b.description) : "",
        category: b.category ? String(b.category) : "Animated",
        tags: Array.isArray(b.tags) ? b.tags : String(b.tags || "").split(",").map((t) => t.trim()).filter(Boolean),
        options: {
          style: b.style || null,
          brandColor: b.brandColor || null,
          duration: b.duration ? Number(b.duration) : null,
          instructions: b.instructions || null,
        },
        createdBy: req.user ? req.user.email : null,
      });
      res.status(201).json({ template: shaped(rec) });
    } catch (e) { send(res, e); }
  });

  // ---- one template ----

  router.get("/templates/:id", (req, res) => {
    const rec = store.get(req.params.id);
    if (!rec) return res.status(404).json({ error: "not found" });
    res.json({
      template: shaped(rec),
      versions: store.versions(rec.family).map(shaped),
      family: store.familySummary(rec.family),
      scenarios: testRender.scenarioList(),
      issueCategories: store.ISSUE_CATEGORIES,
      issueSeverities: store.ISSUE_SEVERITIES,
    });
  });

  // NO DIRECT EDITS TO A VERSION THAT HAS BEEN LIVE.
  //
  // The record's name, description and prompt describe the design that produced the pack; the
  // pack.json users actually render from carries its own copy, written at generation. Editing
  // the record of a published version therefore changes nothing users see and leaves the two
  // disagreeing about what is live — a published template that reads differently in the admin
  // than it renders. The version note (`changes`) is the exception: it is documentation about
  // the version rather than part of it.
  const FROZEN = new Set([lifecycle.STATUS.PUBLISHED, lifecycle.STATUS.SUPERSEDED, lifecycle.STATUS.ARCHIVED]);

  router.patch("/templates/:id", (req, res) => {
    const rec = store.get(req.params.id);
    if (!rec) return res.status(404).json({ error: "not found" });
    const b = req.body || {};
    const patch = {};
    if (b.changes !== undefined) patch.changes = String(b.changes).slice(0, 500);
    if (FROZEN.has(rec.status)) {
      const asked = ["name", "description", "category", "prompt", "tags", "options"].filter((k) => b[k] !== undefined);
      if (asked.length) {
        return res.status(409).json({
          error: `a ${rec.status} version cannot be edited (${asked.join(", ")}) — create a new version to change the design`,
          code: "VERSION_FROZEN",
        });
      }
      return res.json({ template: shaped(store.update(rec.id, patch)) });
    }
    for (const k of ["name", "description", "category", "prompt"]) if (b[k] !== undefined) patch[k] = String(b[k]);
    if (b.tags !== undefined) patch.tags = Array.isArray(b.tags) ? b.tags.map(String) : String(b.tags).split(",").map((t) => t.trim()).filter(Boolean);
    if (b.options !== undefined && b.options && typeof b.options === "object") patch.options = { ...(rec.options || {}), ...b.options };
    res.json({ template: shaped(store.update(rec.id, patch)) });
  });

  router.delete("/templates/:id", (req, res) => {
    const rec = store.get(req.params.id);
    if (!rec) return res.status(404).json({ error: "not found" });
    try {
      store.remove(rec.id);
      res.json({ ok: true });
    } catch (e) { send(res, e); }
  });

  // ---- actions ----

  router.post("/templates/:id/generate", (req, res) => {
    const rec = store.get(req.params.id);
    if (!rec) return res.status(404).json({ error: "not found" });
    if (!lifecycle.canTransition(rec.status, lifecycle.STATUS.GENERATING)) {
      return res.status(409).json({ error: `a ${rec.status} template cannot be generated`, code: "ILLEGAL_TRANSITION" });
    }
    const feedback = req.body && req.body.feedback ? String(req.body.feedback) : null;
    try {
      detach(rec.id, "generating", () => service.runGeneration({ id: rec.id, feedback }));
    } catch (e) { return send(res, e); }
    res.status(202).json({ template: shaped(store.get(rec.id)) });
  });

  router.post("/templates/:id/qa", (req, res) => {
    const rec = store.get(req.params.id);
    if (!rec) return res.status(404).json({ error: "not found" });
    if (!lifecycle.canTransition(rec.status, lifecycle.STATUS.TESTING)) {
      return res.status(409).json({ error: `a ${rec.status} template cannot be tested`, code: "ILLEGAL_TRANSITION" });
    }
    try {
      detach(rec.id, "running QA", () => service.runQa({ id: rec.id }));
    } catch (e) { return send(res, e); }
    res.status(202).json({ template: shaped(store.get(rec.id)) });
  });

  // The cheap preview tier — real frames of the real template, in seconds. Available in any
  // state where source exists, because "let me look at it" should never require a state change.
  router.post("/templates/:id/preview", (req, res) => {
    const rec = store.get(req.params.id);
    if (!rec) return res.status(404).json({ error: "not found" });
    try {
      detach(rec.id, "rendering stills", async () => {
        const r = await require("../templates/media").makeStills({ slug: rec.slug, count: Number(req.body?.count) || 4 });
        store.update(rec.id, { stills: r.stills, thumbnail: (r.stills || [])[0] || rec.thumbnail });
      });
    } catch (e) { return send(res, e); }
    res.status(202).json({ template: shaped(store.get(rec.id)) });
  });

  // A REAL film, through the real pipeline, pinned to this template.
  router.post("/templates/:id/test", (req, res) => {
    const rec = store.get(req.params.id);
    if (!rec) return res.status(404).json({ error: "not found" });
    try {
      const out = testRender.startTestRender({
        slug: rec.slug,
        scenario: (req.body && req.body.scenario) || "prompt-only",
        record: rec,
        createdBy: req.user ? req.user.email : null,
        enqueueIntake,
      });
      const tests = [{ ...out, at: Date.now() }, ...(rec.tests || [])].slice(0, 20);
      store.update(rec.id, { tests });
      res.status(202).json({ ...out, template: shaped(store.get(rec.id)) });
    } catch (e) { send(res, e); }
  });

  router.post("/templates/:id/publish", async (req, res) => {
    const rec = store.get(req.params.id);
    if (!rec) return res.status(404).json({ error: "not found" });

    // The cheap blockers answer synchronously and exactly, so the admin sees "missing
    // thumbnail" rather than watching a two-minute render end in a generic failure.
    const blockers = service.publishBlockers(rec);
    if (blockers.length) {
      store.update(rec.id, { publishBlocking: blockers });
      return res.status(409).json({ error: "cannot publish template", code: "PUBLISH_BLOCKED", blocking: blockers });
    }
    try {
      detach(rec.id, "publishing", () => service.runPublish({ id: rec.id }));
    } catch (e) { return send(res, e); }
    res.status(202).json({ template: shaped(store.get(rec.id)) });
  });

  router.post("/templates/:id/unpublish", (req, res) => {
    const rec = store.get(req.params.id);
    if (!rec) return res.status(404).json({ error: "not found" });
    try { res.json({ template: shaped(service.unpublish({ id: rec.id })) }); }
    catch (e) { send(res, e); }
  });

  router.post("/templates/:id/archive", (req, res) => {
    const rec = store.get(req.params.id);
    if (!rec) return res.status(404).json({ error: "not found" });
    try { res.json({ template: shaped(service.archive({ id: rec.id })) }); }
    catch (e) { send(res, e); }
  });

  // THE POST-PUBLISH FIX ENTRY POINT. Clones the version into a new row, a new slug and a new
  // directory; the version being fixed is not touched. Answers with the NEW row, which the UI
  // opens.
  router.post("/templates/:id/versions", (req, res) => {
    const rec = store.get(req.params.id);
    if (!rec) return res.status(404).json({ error: "not found" });
    try {
      const created = service.newVersion({
        id: rec.id,
        createdBy: req.user ? req.user.email : null,
        changes: req.body && req.body.changes ? String(req.body.changes) : "",
      });
      res.status(201).json({ template: shaped(created) });
    } catch (e) { send(res, e); }
  });

  // ROLLBACK — promote a superseded version back to live. Synchronous: no render, no QA, just
  // two status transitions and the directory moves behind them (service.rollback explains why
  // that is the right call for an emergency action).
  router.post("/templates/:id/rollback", (req, res) => {
    const rec = store.get(req.params.id);
    if (!rec) return res.status(404).json({ error: "not found" });
    try {
      const out = service.rollback({ id: rec.id, by: req.user ? req.user.email : null });
      res.json({ template: shaped(out.template), superseded: shaped(out.superseded) });
    } catch (e) { send(res, e); }
  });

  // ---- issues ----
  //
  // What a real film taught us about this template, recorded against the version it was seen on.
  // service.newVersion carries the open ones onto the version created to fix them.
  router.post("/templates/:id/issues", (req, res) => {
    const rec = store.get(req.params.id);
    if (!rec) return res.status(404).json({ error: "not found" });
    const b = req.body || {};
    try {
      const issue = store.addIssue(rec.id, {
        title: b.title,
        category: b.category,
        severity: b.severity,
        detail: b.detail,
        suggestedFix: b.suggestedFix,
        by: req.user ? req.user.email : null,
      });
      res.status(201).json({ issue, template: shaped(store.get(rec.id)) });
    } catch (e) { send(res, e); }
  });

  router.patch("/templates/:id/issues/:issueId", (req, res) => {
    const rec = store.get(req.params.id);
    if (!rec) return res.status(404).json({ error: "not found" });
    const issue = store.setIssueStatus(rec.id, req.params.issueId, req.body && req.body.status);
    if (!issue) return res.status(404).json({ error: "issue not found" });
    res.json({ issue, template: shaped(store.get(rec.id)) });
  });

  // ---- batches ----
  //
  // "Generate N templates": plan N creative directions, then run each through the SAME pipeline
  // these routes expose one at a time. The orchestrator lives in templates/batch.js; these
  // handlers only start, read and cancel it.

  router.get("/batches", (req, res) => {
    res.json({
      batches: batchStore.list({ limit: Number(req.query.limit) || 20 }).map(shapeBatch),
      thresholds: { minQuality: batch.MIN_QUALITY, minUniqueness: batch.MIN_UNIQUENESS, maxAttempts: batch.MAX_ATTEMPTS },
      scenarios: testRender.scenarioList(),
    });
  });

  router.post("/batches", (req, res) => {
    const b = req.body || {};
    const count = Math.max(1, Math.min(25, Number(b.count) || 0));
    if (!count) return res.status(400).json({ error: "how many templates? count must be 1-25" });
    const orientation = b.orientation === "landscape" || b.orientation === "horizontal" ? "landscape" : "portrait";
    try {
      const created = batch.start({
        count,
        createdBy: req.user ? req.user.email : null,
        enqueueIntake,
        config: {
          orientation,
          style: b.style ? String(b.style).slice(0, 120) : "",
          category: b.category ? String(b.category).slice(0, 60) : "",
          industry: b.industry ? String(b.industry).slice(0, 60) : "",
          animation: ["low", "medium", "high"].includes(String(b.animation)) ? String(b.animation) : "medium",
          colorDirection: b.colorDirection ? String(b.colorDirection).slice(0, 120) : "",
          duration: Number(b.duration) > 0 ? Math.min(60, Number(b.duration)) : null,
          instructions: b.instructions ? String(b.instructions).slice(0, 2000) : "",
          // LEFT UNSET ON PURPOSE. batch.scenarioFor picks the test scenario from the template's
          // own declared asset requirements — a template that wants pictures is tested with the
          // asset-rich one, because prompt-only supplies none and fails its pre-render validation
          // every time. Defaulting the field here would make that choice look explicit and
          // silently pin every template to prompt-only, which is the defect the chooser exists to
          // fix. Only a scenario the admin actually named is honoured, and only a real one.
          ...(b.testScenario && testRender.SCENARIOS[String(b.testScenario)]
            ? { testScenario: String(b.testScenario) }
            : {}),
        },
      });
      res.status(202).json({ batch: shapeBatch(created) });
    } catch (e) { send(res, e); }
  });

  router.get("/batches/:id", (req, res) => {
    const b = batchStore.get(req.params.id);
    if (!b) return res.status(404).json({ error: "not found" });
    res.json({ batch: shapeBatch(b), templates: (b.items || []).filter((i) => i.templateId).map((i) => shaped(store.get(i.templateId))).filter(Boolean) });
  });

  router.post("/batches/:id/cancel", (req, res) => {
    const b = batchStore.requestCancel(req.params.id);
    if (!b) return res.status(404).json({ error: "not found" });
    res.json({ batch: shapeBatch(b) });
  });

  // Same poll-and-diff SSE shape as the per-template stream, for the same reason.
  router.get("/batches/:id/events", (req, res) => {
    if (!batchStore.get(req.params.id)) return res.status(404).json({ error: "not found" });
    res.writeHead(200, {
      "Content-Type": "text/event-stream", "Cache-Control": "no-cache",
      Connection: "keep-alive", "X-Accel-Buffering": "no",
    });
    let last = "";
    const tick = () => {
      const b = batchStore.get(req.params.id);
      if (!b) return true;
      const shape = shapeBatch(b);
      const key = JSON.stringify([shape.status, shape.progress, shape.tally, (b.items || []).map((i) => `${i.state}${i.attempts}${i.qaScore}`)]);
      if (key !== last) { last = key; res.write(`data: ${JSON.stringify(shape)}\n\n`); }
      return shape.isTerminal;
    };
    const timer = setInterval(() => { if (tick()) { clearInterval(timer); res.end(); } }, 1500);
    tick();
    req.on("close", () => clearInterval(timer));
  });

  // ---- progress ----
  //
  // Same poll-and-diff SSE shape as /api/projects/:id/events, deliberately: the frontend
  // already knows how to consume that stream, and a second streaming idiom would be a second
  // thing to get wrong.
  router.get("/templates/:id/events", (req, res) => {
    if (!store.get(req.params.id)) return res.status(404).json({ error: "not found" });
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    let last = "";
    const send1 = () => {
      const rec = store.get(req.params.id);
      if (!rec) return true;
      const shape = shaped(rec);
      const key = `${rec.status}|${rec.progress}|${rec.progressPct}|${(rec.stills || []).length}|${rec.qa ? rec.qa.score : ""}|${shape.busy}`;
      if (key !== last) { last = key; res.write(`data: ${JSON.stringify(shape)}\n\n`); }
      // Terminal for the STREAM, not for the template: nothing is running and the state is one
      // the admin acts on next.
      return !shape.busy && [lifecycle.STATUS.PUBLISHED, lifecycle.STATUS.FAILED, lifecycle.STATUS.ARCHIVED].includes(rec.status);
    };
    if (send1()) { res.end(); return; }
    const timer = setInterval(() => {
      try { if (send1()) { clearInterval(timer); res.end(); } }
      catch { clearInterval(timer); }
    }, 1000);
    req.on("close", () => clearInterval(timer));
  });

  return router;
}

module.exports = { buildRouter };
