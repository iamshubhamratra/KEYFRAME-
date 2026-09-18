// VIDEO EDIT EDITING API — the handlers behind GET /:id/plan, /plan/revisions, /transcript, /candidates and
// POST /:id/ops, /undo, /redo, /settings, /candidates/search (API.md §3; EDIT_PLAN.md §5, §8; ENGINE.md §3.5).
//
// WHY THIS EXISTS. Every edit a person makes after the AI's first cut goes through these routes, and three races
// decide whether their work survives: two tabs editing the same head, a client retrying a batch whose response was
// lost, and the pipeline or a render touching the project while an edit lands. So every mutation runs under the
// project mutex (store.withLock) and in this order: re-read the project → batchId replay (the original response,
// never a second revision) → status gate (edits only where views.allowedActionsFor offers 'edit': READY /
// COMPLETED / NEEDS_ATTENTION / RENDERING with a plan) → expectedRevision fence (409 REVISION_CONFLICT with the
// head to rebase on) → applyOps on the head revision with the analysis context → commitRevision (one immutable
// revision per batch) → project bookkeeping (edit while RENDERING or after an export → exports.stale; COMPLETED →
// READY per ENGINE.md §3.3; edit.setTitle → title) → SSE `plan`. Settings changes become the same ops (the no-LLM
// re-plan rule holds: nothing on these routes calls a model), except the ones that need paid analysis again, which
// answer 409 REANALYZE_REQUIRED with an estimate until the client confirms (202, runner.retry force from the
// earliest affected stage). Responses are built only from views_plan.js whitelists.
//
// CONTRACT:
//   createEditHandlers({ store, runner, events, settings, env, now, log, basePath, brollCandidates?, callJson?, fetch?,
//                        brollKeys?, contextLoader?, searchTimeoutMs=180000 }) -> {
//     getPlan, getRevisions, getTranscript, postOps, postUndo, postRedo, postSettings, getCandidates, postCandidateSearch,
//     mediaResolvers: { 'broll-thumb': { keyed:true, resolve(project, key) -> rel|null } },
//     abortProject(projectId), contextLoader }
//   brollCandidates: undefined → broll/candidates.js when that file exists; null → B-roll routes answer 501
//     NOT_IMPLEMENTED { reason:'BROLL_MODULE_PENDING' }.
//   Edit response: { revision, hash, replayed, applied, summary, label, warnings, invalidates:{ level, ranges, estimated? },
//     costEvents, cost:{ aiCalls, fetches }, outline, canUndo, canRedo, undoLabel, redoLabel, plan? (returnPlan:true) }
//   Errors (besides API.md §9): 409 NOT_READY { reason:'NO_PLAN'|'STATUS'|'NO_TRANSCRIPT', status } · 409 NOTHING_TO_UNDO /
//     NOTHING_TO_REDO · 409 REANALYZE_REQUIRED { estimate, fromStage, keys } · 409 REANALYZE_UNAVAILABLE { reason, stage, keys } ·
//     409 STORE_CORRUPT · 422 INVALID_OP { index, reason, issues? } · 422 INVALID_PLAN · 423 PROJECT_LOCKED { reason:'SEARCH_IN_PROGRESS' } ·
//     413 BODY_TOO_LARGE · 500 REVISION_CORRUPT.

const fs = require("node:fs");
const path = require("node:path");
const { z } = require("zod");
const ids = require("../ids");
const fsx = require("../fsx");
const views = require("../views");
const { EditError, isEditError } = require("../errors");
const { faultsAllowed } = require("../faults");
const { applyOps, MAX_OPS } = require("../plan/ops");
const Rev = require("../plan/revisions");
const { SETTING_LEVELS } = require("../plan/ops_cuts");
const { createContextLoader } = require("./context");
const { computeSettingsChange, reanalysisEstimate } = require("./settings_patch");

const BROLL_CANDIDATES_FILE = path.join(__dirname, "..", "broll", "candidates.js");
const LLM_FILE = path.join(__dirname, "..", "ai", "llm.js");
const BATCH_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const OP_TYPE_RE = /^[a-z]+(?:\.[A-Za-z]+){1,3}$/;
const OP_JSON_MAX = 16 * 1024;
const BODY_MAX_BYTES = 256 * 1024;
const PLAN_CACHE_MAX = 16;
const SEARCH_TIMEOUT_MS = 180 * 1000;

const isPlain = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const errCode = (e) => (e && typeof e.code === "string" ? e.code.slice(0, 64) : "INTERNAL");

function httpError(code, status, { errorClass = "input", retryable = false, userMessage = null, extra = null } = {}) {
  return new EditError(code, { status, errorClass, retryable, userMessage, extra });
}
const notFound = () => httpError("NOT_FOUND", 404);
const conflict = (head) => httpError("REVISION_CONFLICT", 409, { retryable: true, extra: { headRevision: head } });

// ---- request bodies --------------------------------------------------------------------------
const Revision = z.number().int().min(0).max(1000000);
const BatchId = z.string().regex(BATCH_ID_RE);
const OpEnvelope = z.object({ type: z.string().max(64).regex(OP_TYPE_RE) }).passthrough()
  .refine((o) => JSON.stringify(o).length <= OP_JSON_MAX, { message: "op is too large" });
const OpsBody = z.object({
  expectedRevision: Revision, batchId: BatchId, ops: z.array(OpEnvelope).min(1).max(MAX_OPS), returnPlan: z.boolean().optional(),
}).strict();
const StepBody = z.object({ expectedRevision: Revision, batchId: BatchId.optional(), returnPlan: z.boolean().optional() }).strict();
const SettingsBody = z.object({
  expectedRevision: Revision, settings: z.record(z.string(), z.any()), confirmReanalyze: z.boolean().optional(),
  batchId: BatchId.optional(), returnPlan: z.boolean().optional(),
}).strict();
const SearchBody = z.object({
  itemId: z.string().regex(/^br_[A-Za-z0-9_-]{1,40}$/), query: z.string().trim().min(2).max(80), kind: z.enum(["video", "image"]).optional(),
}).strict();

function parseBody(schema, body) {
  const r = schema.safeParse(body === undefined || body === null ? {} : body);
  if (!r.success) {
    throw httpError("VALIDATION_FAILED", 422, {
      extra: { errors: r.error.issues.slice(0, 10).map((i) => `${i.path.length ? i.path.join(".") : "body"}: ${i.message}`) },
    });
  }
  return r.data;
}

function checkBodySize(req) {
  const n = Number(req.headers && req.headers["content-length"]);
  if (Number.isFinite(n) && n > BODY_MAX_BYTES) throw httpError("BODY_TOO_LARGE", 413, { extra: { limitBytes: BODY_MAX_BYTES } });
}

function queryInt(q, name, { min, max, def }) {
  const v = q ? q[name] : undefined;
  if (v === undefined) return def;
  if (typeof v !== "string" || !/^\d{1,7}$/.test(v) || Number(v) < min || Number(v) > max) {
    throw httpError("VALIDATION_FAILED", 400, { extra: { field: name } });
  }
  return Number(v);
}

const OP_LABELS = Object.freeze({
  "caption.editText": "Edit caption", "caption.hide": "Hide caption", "caption.show": "Show caption", "caption.setEmphasis": "Caption emphasis",
  "caption.setPosition": "Move caption", "captions.setEnabled": "Captions on/off", "captions.setStyle": "Caption style",
  "captions.setPosition": "Caption position", "captions.setLanguage": "Caption language", "cut.toggle": "Toggle cut", "cut.adjust": "Adjust cut",
  "cut.add": "Cut words", "cuts.restoreAll": "Restore cuts", "settings.set": "Change setting", "broll.replace": "Replace B-roll",
  "broll.regenerate": "New B-roll", "broll.remove": "Remove B-roll", "broll.restore": "Restore B-roll", "broll.setLayout": "B-roll layout",
  "broll.setTiming": "B-roll timing", "broll.add": "Add B-roll", "broll.setLocked": "Lock B-roll", "effect.toggle": "Toggle effect",
  "effect.adjust": "Adjust effect", "transition.set": "Transition", "graphic.editText": "Edit title card", "graphic.toggle": "Toggle title card",
  "music.change": "Change music", "music.remove": "Remove music", "music.restore": "Restore music", "music.setVolume": "Music volume",
  "music.setDucking": "Music ducking", "sfx.toggle": "Toggle sound effect", "sfx.setVolume": "Sound effect volume", "sfx.muteAll": "Sound effects on/off",
  "branding.setLogo": "Logo", "branding.removeLogo": "Remove logo", "branding.setLogoPlacement": "Logo placement", "branding.setPalette": "Brand colours",
  "framing.adjust": "Adjust framing", "framing.reset": "Reset framing", "output.setAspect": "Change aspect", "edit.setTitle": "Rename",
});

function summarizeOps(ops) {
  const types = (Array.isArray(ops) ? ops : []).map((o) => (isPlain(o) && typeof o.type === "string" ? o.type : "edit"));
  if (!types.length) return "Edit";
  const first = OP_LABELS[types[0]] || types[0].replace(/[._]/g, " ").slice(0, 40);
  return types.length === 1 ? first : `${first} + ${types.length - 1} more`;
}

function headOf(project) {
  const pl = project && isPlain(project.plan) ? project.plan : {};
  return Number.isInteger(pl.headRevision) && pl.headRevision > 0 ? pl.headRevision : 0;
}

function findBatch(project, batchId) {
  if (batchId == null) return null;
  const list = project && project.plan && Array.isArray(project.plan.batches) ? project.plan.batches : [];
  return list.find((b) => isPlain(b) && b.batchId === String(batchId) && Number.isInteger(b.rev)) || null;
}

// ---- factory ---------------------------------------------------------------------------------
function createEditHandlers(deps = {}) {
  const { store, runner, settings } = deps;
  if (!store || !runner || !settings) throw new TypeError("video_edit/editing/handlers: store, runner and settings are required");
  const events = deps.events && typeof deps.events.publish === "function" ? deps.events : { publish: () => 0 };
  const now = typeof deps.now === "function" ? deps.now : Date.now;
  const log = deps.log || console;
  const basePath = deps.basePath || views.BASE_PATH;
  const searchTimeoutMs = Number(deps.searchTimeoutMs) > 0 ? Number(deps.searchTimeoutMs) : SEARCH_TIMEOUT_MS;
  const contextLoader = deps.contextLoader || createContextLoader({ store, log });
  const planCache = new Map();   // `${projectId}:${rev}` -> revision doc (immutable, shared read-only)
  const searches = new Map();    // projectId -> { ac, searchId }
  const say = (level, msg) => { try { (log[level] || log.log || console.log).call(log, msg); } catch { /* noop */ } };

  let brollMod;
  function brollModule() {
    if (deps.brollCandidates !== undefined) return deps.brollCandidates;
    if (brollMod) return brollMod;
    if (!fs.existsSync(BROLL_CANDIDATES_FILE)) return null;   // not cached: the module may land while the server runs
    brollMod = require("../broll/candidates");                // a load error of an existing file propagates
    return brollMod;
  }

  function brollPending(req, res) {
    res.status(501).json({
      error: "NOT_IMPLEMENTED", message: "B-roll candidates are not available yet.", details: { reason: "BROLL_MODULE_PENDING" },
      retryable: false, requestId: req.requestId || null,
    });
  }

  function loadRevisionDoc(projectId, rev, hashHint = null) {
    const key = `${projectId}:${rev}`;
    const hit = planCache.get(key);
    if (hit && (!hashHint || hit.hash === hashHint)) {
      planCache.delete(key);
      planCache.set(key, hit);
      return hit;
    }
    const doc = store.loadRevision(projectId, rev);
    if (!doc) return null;
    planCache.set(key, doc);
    while (planCache.size > PLAN_CACHE_MAX) planCache.delete(planCache.keys().next().value);
    return doc;
  }

  function headDoc(project) {
    const head = headOf(project);
    const doc = head > 0 ? loadRevisionDoc(project.id, head, project.plan.headHash || null) : null;
    if (!doc || !isPlain(doc.plan)) throw httpError("REVISION_CORRUPT", 500, { errorClass: "resource", extra: { rev: head } });
    return doc;
  }

  function editGate(p) {
    if (!p || p.status === "DELETING") throw notFound();
    if (p.storeCorrupt) throw httpError("STORE_CORRUPT", 409, { errorClass: "resource" });
    const head = headOf(p);
    if (!(head > 0)) {
      throw httpError("NOT_READY", 409, { retryable: true, userMessage: "The edit is not ready yet.", extra: { reason: "NO_PLAN", status: p.status } });
    }
    if (!views.allowedActionsFor(p).includes("edit")) {
      throw httpError("NOT_READY", 409, {
        retryable: p.status === "QUEUED" || p.status === "PROCESSING",
        userMessage: "The edit can't be changed while the video is being processed.",
        extra: { reason: "STATUS", status: p.status },
      });
    }
    return head;
  }

  // Runs fn(project) under the project mutex with a fresh read and the ownership check repeated.
  function locked(req, fn) {
    const id = req.project.id;
    return store.withLock(id, async () => {
      const p = store.get(id);
      if (!p || p.status === "DELETING" || p.ownerId !== req.userId) throw notFound();
      return fn(p);
    });
  }

  async function markEdited(projectId, { title = null } = {}) {
    await store.update(projectId, (d) => {
      if (typeof title === "string" && title.trim()) d.title = title.trim().slice(0, 120);
      const exp = isPlain(d.exports) ? d.exports : { currentId: null, stale: false, history: [] };
      if (exp.currentId || d.status === "RENDERING" || d.status === "COMPLETED") exp.stale = true;
      d.exports = exp;
      if (d.status === "COMPLETED") {
        d.status = "READY";
        d.lastTransition = { from: "COMPLETED", to: "READY", actor: "user", reason: "PLAN_EDITED", at: now() };
      }
    }, { actor: "user", reason: "PLAN_EDITED" });
  }

  function storedResult({ kind, applied, summary, warnings, invalidates, costEvents, label = null }) {
    return {
      kind, applied: Number.isInteger(applied) ? applied : 0, summary: String(summary || "").slice(0, 120), label: label ? String(label).slice(0, 160) : null,
      warnings: views.eventListView(warnings), invalidates: views.invalidatesView(invalidates), costEvents: views.eventListView(costEvents),
    };
  }

  function editResponse({ projectId, commit, stored, plan, returnPlan = false, replayed = false }) {
    const s = isPlain(stored) ? stored : {};
    const fresh = store.get(projectId);
    const out = {
      revision: commit.revision,
      hash: typeof commit.hash === "string" && /^[0-9a-f]{64}$/.test(commit.hash) ? commit.hash : null,
      replayed: !!replayed,
      applied: Number.isInteger(s.applied) ? s.applied : 0,
      summary: typeof s.summary === "string" ? s.summary : null,
      label: typeof s.label === "string" ? s.label : null,
      warnings: views.eventListView(s.warnings),
      invalidates: views.invalidatesView(s.invalidates),
      costEvents: views.eventListView(s.costEvents),
      cost: views.costSummary(s.costEvents),
      outline: plan ? views.outlineView(plan) : null,
      ...views.historyFields(fresh),
    };
    if (returnPlan) {
      const doc = loadRevisionDoc(projectId, commit.revision, out.hash);
      out.plan = doc ? views.toPlanView(doc.plan, { projectId, basePath }) : null;
    }
    return out;
  }

  function replayResponse(p, hit, returnPlan) {
    let doc = null;
    try { doc = loadRevisionDoc(p.id, hit.rev, hit.hash); } catch { doc = null; }
    return editResponse({ projectId: p.id, commit: { revision: hit.rev, hash: hit.hash }, stored: hit.response, plan: doc && doc.plan, returnPlan, replayed: true });
  }

  function publishPlan(projectId, commit, author = "user") {
    try { events.publish(projectId, "plan", { headRevision: commit.revision, headHash: commit.hash, author }); } catch { /* fail-open */ }
  }

  // ---- reads -----------------------------------------------------------------------------------
  async function getPlan(req, res) {
    const p = req.project;
    const head = headOf(p);
    if (!(head > 0)) throw httpError("NOT_READY", 409, { retryable: true, userMessage: "The edit is not ready yet.", extra: { reason: "NO_PLAN", status: p.status } });
    const rev = queryInt(req.query, "rev", { min: 1, max: 1000000, def: head });
    if (rev > head) throw notFound();
    const meta = (Array.isArray(p.plan.revisions) ? p.plan.revisions : []).find((r) => isPlain(r) && r.rev === rev);
    const doc = loadRevisionDoc(p.id, rev, meta && meta.hash);
    if (!doc) throw notFound();
    const env = views.planEnvelope(doc, { projectId: p.id, basePath, head, history: views.historyFields(p) });
    // QA findings are derived from the latest checked render of this revision (never written into a revision).
    if (typeof deps.qaFindingsFor === "function" && env && env.plan && !env.plan.qa) {
      try { const q = deps.qaFindingsFor(store.get(p.id) || p, rev); if (q) env.plan.qa = q; } catch { /* enhancement */ }
    }
    res.json(env);
  }

  async function getRevisions(req, res) {
    const p = req.project;
    if (!(headOf(p) > 0)) throw httpError("NOT_READY", 409, { retryable: true, userMessage: "The edit is not ready yet.", extra: { reason: "NO_PLAN", status: p.status } });
    res.json(views.revisionsView(p));
  }

  async function getTranscript(req, res) {
    const p = req.project;
    const offset = queryInt(req.query, "offset", { min: 0, max: 1000000, def: 0 });
    const limit = queryInt(req.query, "limit", { min: 1, max: views.TRANSCRIPT_PAGE_MAX, def: views.TRANSCRIPT_PAGE_MAX });
    const tr = contextLoader.transcript(p);
    if (!tr.available) {
      throw httpError("NOT_READY", 409, { retryable: true, userMessage: "The transcript is not ready yet.", extra: { reason: "NO_TRANSCRIPT", status: p.status } });
    }
    let plan = null;
    const head = headOf(p);
    if (head > 0) {
      try { plan = headDoc(p).plan; } catch (e) { say("warn", `[video-edit] transcript without cut state project=${p.id} code=${errCode(e)}`); }
    }
    res.json(views.transcriptView({ words: tr.words, sentences: tr.sentences, language: tr.language, timing: tr.timing, plan, planRevision: plan ? head : 0, offset, limit }));
  }

  // ---- ops / undo / redo -----------------------------------------------------------------------
  async function postOps(req, res) {
    checkBodySize(req);
    const body = parseBody(OpsBody, req.body);
    const id = req.project.id;
    const out = await locked(req, async (p) => {
      const hit = findBatch(p, body.batchId);
      if (hit) return { response: replayResponse(p, hit, !!body.returnPlan), commit: null };
      const head = editGate(p);
      if (body.expectedRevision !== head) throw conflict(head);
      const doc = headDoc(p);
      const t = now();
      const ctx = contextLoader.load(p, { plan: doc.plan, ops: body.ops });
      const result = applyOps(doc.plan, body.ops, { ...ctx, now: t, batchId: body.batchId, author: "user" });
      const stored = storedResult({
        kind: "ops", applied: result.applied, summary: summarizeOps(body.ops), warnings: result.warnings,
        invalidates: result.invalidates, costEvents: result.costEvents,
      });
      const commit = await Rev.commitRevision({
        store, projectId: id, plan: result.plan, author: "user", summary: stored.summary, opsCount: result.applied,
        expectedRevision: head, batchId: body.batchId, now: t, response: stored,
      });
      await markEdited(id, { title: result.projectPatch && result.projectPatch.title });
      return { response: editResponse({ projectId: id, commit, stored, plan: result.plan, returnPlan: !!body.returnPlan }), commit };
    });
    if (out.commit) publishPlan(id, out.commit);
    res.json(out.response);
  }

  function stepHandler(direction) {
    const nothing = direction === "undo" ? "NOTHING_TO_UNDO" : "NOTHING_TO_REDO";
    return async function stepEdit(req, res) {
      const body = parseBody(StepBody, req.body);
      const id = req.project.id;
      const out = await locked(req, async (p) => {
        const hit = findBatch(p, body.batchId);
        if (hit) return { response: replayResponse(p, hit, !!body.returnPlan), commit: null };
        const head = editGate(p);
        if (body.expectedRevision !== head) throw conflict(head);
        const t = now();
        let r;
        try {
          r = await Rev[direction]({ store, projectId: id, expectedRevision: head, batchId: body.batchId || null, now: t });
        } catch (e) {
          if (isEditError(e) && e.code === nothing) {
            throw httpError(nothing, 409, { userMessage: direction === "undo" ? "Nothing to undo." : "Nothing to redo." });
          }
          throw e;
        }
        await markEdited(id);
        const doc = loadRevisionDoc(id, r.revision, r.hash);
        const stored = storedResult({
          kind: direction, applied: 0, summary: `${direction === "undo" ? "Undo" : "Redo"}: ${r.label || ""}`, label: r.label,
          warnings: [], invalidates: r.invalidates, costEvents: [],
        });
        return { response: editResponse({ projectId: id, commit: r, stored, plan: doc && doc.plan, returnPlan: !!body.returnPlan }), commit: r };
      });
      if (out.commit) publishPlan(id, out.commit);
      res.json(out.response);
    };
  }

  // ---- settings --------------------------------------------------------------------------------
  function runnableStages() {
    if (typeof runner.planStages !== "function") return null;
    try { return runner.planStages().runnable || []; } catch { return null; }
  }

  function checkActiveQuota(userId, project) {
    const L = settings.limits && settings.limits.perUser;
    if (!L || typeof store.userActiveCounts !== "function") return;
    const active = store.userActiveCounts(userId) || { running: 0, queued: 0 };
    if (!["QUEUED", "PROCESSING", "RENDERING"].includes(project.status) && active.running + active.queued >= L.maxRunning + L.maxQueued) {
      throw httpError("QUOTA_EXCEEDED", 429, { errorClass: "resource", retryable: true, extra: { quota: "active", limit: L.maxRunning + L.maxQueued } });
    }
  }

  async function persistSettings(projectId, next) {
    const capMax = settings.caps && Number.isFinite(settings.caps.maxUsdPerProject) ? settings.caps.maxUsdPerProject : null;
    await store.update(projectId, (d) => {
      const prevTitle = isPlain(d.settings) ? d.settings.title : undefined;
      d.settings = next;
      d.settingsHash = fsx.sha256Json(next);
      if (next.title !== prevTitle && typeof next.title === "string" && next.title.trim()) d.title = next.title.trim().slice(0, 120);
      if (Number.isFinite(next.maxCostUsd)) {
        d.cost = { ...(isPlain(d.cost) ? d.cost : {}), capUsd: capMax != null ? Math.min(next.maxCostUsd, capMax) : next.maxCostUsd };
      }
    }, { actor: "user" });
  }

  async function postSettings(req, res) {
    checkBodySize(req);
    const body = parseBody(SettingsBody, req.body);
    const id = req.project.id;
    const out = await locked(req, async (p) => {
      const hit = body.batchId ? findBatch(p, body.batchId) : null;
      if (hit) return { kind: "edit", response: replayResponse(p, hit, !!body.returnPlan), commit: null };
      const head = editGate(p);
      if (body.expectedRevision !== head) throw conflict(head);
      const doc = headDoc(p);
      const ctx = contextLoader.load(p, { plan: doc.plan });
      const change = computeSettingsChange({
        project: p, plan: doc.plan, patch: body.settings, allowDebugFaults: faultsAllowed(settings),
        maxUsdCap: settings.caps && settings.caps.maxUsdPerProject, transcriptMeta: ctx.transcriptMeta, content: ctx.content,
        settingKeys: Object.keys(SETTING_LEVELS),
      });
      if (change.errors) throw httpError("VALIDATION_FAILED", 422, { extra: { errors: change.errors.slice(0, 10) } });

      if (change.reanalyze) {
        const { fromStage, keys } = change.reanalyze;
        const estimate = reanalysisEstimate(p, fromStage);
        const runnable = runnableStages();
        if (!runnable || !runnable.includes(fromStage)) {
          throw httpError("REANALYZE_UNAVAILABLE", 409, {
            userMessage: "That change needs the video analysed again, which is not available right now.",
            extra: { reason: runnable ? "STAGE_NOT_AVAILABLE" : "PIPELINE_UNAVAILABLE", stage: fromStage, keys },
          });
        }
        if (p.status === "RENDERING" || (typeof runner.isActive === "function" && runner.isActive(id))) {
          throw httpError("ILLEGAL_TRANSITION", 409, { retryable: true, extra: { from: p.status, to: "QUEUED", reason: "BUSY" } });
        }
        if (!body.confirmReanalyze) {
          throw httpError("REANALYZE_REQUIRED", 409, {
            userMessage: "That change needs the video analysed again. Confirm to continue.",
            extra: { estimate, fromStage, keys },
          });
        }
        checkActiveQuota(req.userId, p);
        await persistSettings(id, change.next);
        return { kind: "requeue", fromStage, estimate, previous: p.settings, next: change.next };
      }

      let commit = { revision: head, hash: p.plan.headHash };
      let stored = storedResult({ kind: "settings", applied: 0, summary: "Settings", warnings: [], invalidates: null, costEvents: [] });
      let plan = doc.plan;
      let committed = false;
      if (change.ops.length) {
        const t = now();
        const result = applyOps(doc.plan, change.ops, { ...ctx, now: t, batchId: body.batchId || null, author: "user" });
        stored = storedResult({
          kind: "settings", applied: result.applied, summary: `Settings: ${change.changed.slice(0, 3).join(", ")}`,
          warnings: result.warnings, invalidates: result.invalidates, costEvents: result.costEvents,
        });
        commit = await Rev.commitRevision({
          store, projectId: id, plan: result.plan, author: "user", summary: stored.summary, opsCount: result.applied,
          expectedRevision: head, batchId: body.batchId || null, now: t, response: stored,
        });
        plan = result.plan;
        committed = true;
      }
      await persistSettings(id, change.next);
      if (committed) await markEdited(id);
      const response = editResponse({ projectId: id, commit, stored, plan, returnPlan: !!body.returnPlan });
      response.settings = views.settingsView(change.next);
      response.storedOnly = change.stored;
      return { kind: "edit", response, commit: committed ? commit : null };
    });

    if (out.kind === "requeue") {
      let r;
      try {
        r = await runner.retry(id, { stage: out.fromStage, mode: "force" });
      } catch (e) {
        // The analysis did not start: put the previous settings back so the project matches what is running.
        await store.update(id, (d) => { d.settings = out.previous; d.settingsHash = fsx.sha256Json(out.previous || {}); }, { actor: "user" }).catch(() => {});
        throw e;
      }
      if (r && r.done && typeof r.done.then === "function") r.done.then(undefined, () => {});
      say("info", `[video-edit] settings requeued project=${id} from=${out.fromStage}`);
      res.status(202).json({ requeuedFrom: (r && r.fromStage) || out.fromStage, estimate: out.estimate, settings: views.settingsView(out.next) });
      return;
    }
    if (out.commit) publishPlan(id, out.commit);
    res.json(out.response);
  }

  // ---- candidates ------------------------------------------------------------------------------
  async function getCandidates(req, res) {
    const mod = brollModule();
    if (!mod) return brollPending(req, res);
    const q = req.query || {};
    const ref = q.itemId !== undefined ? q.itemId : q.slotId;
    if (typeof ref !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(ref) || (q.itemId !== undefined && q.slotId !== undefined)) {
      throw httpError("VALIDATION_FAILED", 400, { extra: { field: "itemId" } });
    }
    const limit = queryInt(q, "limit", { min: 1, max: 20, def: 20 });
    const p = req.project;
    let plan = null;
    if (headOf(p) > 0) plan = headDoc(p).plan;
    const r = mod.listCandidates(p, ref, { projectDir: store.projectDir(p.id), plan, limit });
    res.json(views.candidateListView(r, { projectId: p.id, basePath }));
  }

  function judgeBlockedReason(p) {
    if (!(p.consent && p.consent.thirdPartyAi === true)) return "consent";
    const c = isPlain(p.cost) ? p.cost : {};
    if (Number(c.capUsd) > 0 && Number(c.spentUsd) >= Number(c.capUsd)) return "budget";
    return null;
  }

  async function runSearch({ project, plan, item, body, searchId, ac, mod }) {
    const id = project.id;
    const ctx = contextLoader.load(project, { plan });
    const sentence = ctx.sentences.find((s) => s.id === item.sentenceId);
    const callJson = typeof deps.callJson === "function" ? deps.callJson
      : fs.existsSync(LLM_FILE) ? (opts) => require("../ai/llm").callJson(opts) : null;
    const timer = setTimeout(() => ac.abort(new Error("search timeout")), searchTimeoutMs);
    if (timer.unref) timer.unref();
    try {
      const r = await mod.searchCandidates(project, { query: body.query, kind: body.kind || "video", itemId: item.id, judge: true }, {
        projectDir: store.projectDir(id), plan, settings, signal: ac.signal, callJson, fetch: deps.fetch, keys: deps.brollKeys,
        lang: (plan.source && plan.source.language) || "en", sentenceText: sentence ? sentence.text : null,
        judgeBlockedReason: judgeBlockedReason(project), log, now,
      });
      const live = store.get(id);
      if (!live || live.status === "DELETING" || ac.signal.aborted) return;
      const costUsd = Number(r && r.costUsd) > 0 ? Number(r.costUsd) : 0;
      if (costUsd) {
        await store.update(id, (d) => { d.cost = { ...(isPlain(d.cost) ? d.cost : {}), spentUsd: (Number(d.cost && d.cost.spentUsd) || 0) + costUsd }; }).catch(() => {});
      }
      const list = views.candidateListView({ ...r, candidates: r && r.candidates }, { projectId: id, basePath });
      events.publish(id, "candidates", {
        itemId: item.id, searchId, slotId: list.slotId, query: typeof r.query === "string" ? r.query.slice(0, 80) : body.query,
        judge: list.judge, candidates: list.candidates,
        notices: views.eventListView(r && r.notices, { max: 10 }),
      });
    } catch (e) {
      const live = store.get(id);
      if (!live || live.status === "DELETING") return;
      say("warn", `[video-edit] candidate search failed project=${id} code=${errCode(e)}`);
      events.publish(id, "candidates", {
        itemId: item.id, searchId, candidates: [], error: isEditError(e) ? e.code : (ac.signal.aborted ? "SEARCH_TIMEOUT" : "SEARCH_FAILED"),
        retryable: isEditError(e) ? !!e.retryable : true,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  async function postCandidateSearch(req, res) {
    const body = parseBody(SearchBody, req.body);
    const mod = brollModule();
    if (!mod) return brollPending(req, res);
    const id = req.project.id;
    const p = store.get(id);
    if (!p || p.ownerId !== req.userId) throw notFound();
    editGate(p);
    const doc = headDoc(p);
    const item = (doc.plan.broll || []).find((b) => b.id === body.itemId);
    if (!item) throw httpError("VALIDATION_FAILED", 422, { extra: { field: "itemId", reason: "UNKNOWN_ITEM" } });
    if (searches.has(id)) throw httpError("PROJECT_LOCKED", 423, { retryable: true, extra: { reason: "SEARCH_IN_PROGRESS" } });
    const searchId = ids.newId("srch");
    const ac = new AbortController();
    const entry = { ac, searchId };
    searches.set(id, entry);
    res.status(202).json({ searchId, itemId: item.id });
    runSearch({ project: p, plan: doc.plan, item, body, searchId, ac, mod })
      .catch((e) => say("warn", `[video-edit] candidate search crashed project=${id} code=${errCode(e)}`))
      .finally(() => { if (searches.get(id) === entry) searches.delete(id); });
  }

  // ---- media + lifecycle -----------------------------------------------------------------------
  const mediaResolvers = Object.freeze({
    "broll-thumb": {
      keyed: true,
      resolve(project, key) {
        const mod = brollModule();
        if (!mod || typeof mod.resolveThumbFile !== "function") return null;
        const r = mod.resolveThumbFile(project, key, { projectDir: store.projectDir(project.id) });
        return r && typeof r.rel === "string" ? r.rel : null;
      },
    },
  });

  function abortProject(projectId) {
    const s = searches.get(projectId);
    if (s) { try { s.ac.abort(new Error("project deleted")); } catch { /* noop */ } searches.delete(projectId); }
    for (const k of [...planCache.keys()]) if (k.startsWith(`${projectId}:`)) planCache.delete(k);
    contextLoader.forget(projectId);
  }

  return {
    getPlan, getRevisions, getTranscript, postOps, postUndo: stepHandler("undo"), postRedo: stepHandler("redo"), postSettings,
    getCandidates, postCandidateSearch, mediaResolvers, abortProject, contextLoader,
    activeSearches: () => searches.size,
  };
}

module.exports = { createEditHandlers, summarizeOps, BODY_MAX_BYTES };
