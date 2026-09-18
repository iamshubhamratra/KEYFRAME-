// VIDEO EDIT PIPELINE RUNNER — drives a project through its registered stages, and stops it on demand.
//
// WHY THIS EXISTS. The checkpoint runner (stages.js) knows how to run ONE stage safely. Something
// has to own the whole run: claim the project with a fresh runId (so any older writer is fenced
// out), move it QUEUED → PROCESSING, run the stage graph in dependency order with the independent
// branches in parallel (ANALYZING_VIDEO beside the EXTRACTING_AUDIO → … chain), keep one honest
// overall percentage + ETA, and turn the first real failure into the right parked status:
//   input → FAILED · provider | resource | config | budget | bug | exhausted transient → NEEDS_ATTENTION
//   (with statusReason.actions) · nothing left to run → READY, plus notice PIPELINE_PARTIAL when later
//   phases' stages are not registered yet.
// It also owns cancellation (ENGINE.md §5.5): a registry Map<projectId, {ac, runId, children, pendingKieTasks}>;
// cancel aborts the signal (proc.js kills ffmpeg trees), a queued job is skipped when it reaches the
// front, and after a 10 s hard deadline the status is forced to CANCELLED and the runId rotated so
// whatever the stuck run writes later is rejected by the store.
// Shutdown (stopAll) aborts without changing statuses: boot recovery resumes those projects.
//
// CONTRACT:
//   createRunner({ store, queue, events, settings, handlers, now, log, eta, retryBackoffMs, abortGraceMs,
//                  cancelDeadlineMs = 10000, pidFile }) -> {
//     enqueuePipeline(projectId, { resume=false, forceFrom=null, continueWithout=null, allowFrom=null })
//         -> Promise<{ runId, queuePosition, done: Promise<{ status, … }> }>   (idempotent while active; `done` never rejects)
//         Claims only a QUEUED project (ILLEGAL_TRANSITION 409 otherwise, so a cancel that landed first wins);
//         `allowFrom` lists other statuses the caller has already vetted and wants moved back to QUEUED.
//     cancel(projectId, { target:'pipeline'|'render' }) -> Promise<{ cancelled, forced, wasQueued }>   (NOTHING_TO_CANCEL 409)
//     retry(projectId, { stage, mode:'resume'|'force', continueWithout }) -> Promise<{ fromStage, runId, done }>
//         (NOT_RETRYABLE 422 · ILLEGAL_TRANSITION 409 · VALIDATION_FAILED 422)
//     abort(projectId, { reason, waitMs }) -> Promise<boolean>   (no status change; used by deletion)
//     isActive(projectId) · activeIds() · stopAll({ timeoutMs=10000 }) -> Promise<{ stopped, timedOut }>
//     stats() · planStages() · registry
//   }
//   handlers: undefined → default registry (phase handlers registered on first use) · array of stage defs
//             and/or register(registry) functions · a registry object.
//   afterPipeline({ projectId, runId, signal, progress(stage, pct, message, meta), markStage(stage, status) }) -> Promise
//             optional; runs inside the pipeline job after every stage succeeded and before READY (the automatic
//             first render). Its failure is never a pipeline failure; cancellation still cancels the pipeline.

const path = require("node:path");
const ids = require("../ids");
const stages = require("./stages");
const { EditError, isEditError } = require("../errors");
const { STAGE_WEIGHTS, overallPct, createEtaModel } = require("./progress");

const DEFAULT_CANCEL_DEADLINE_MS = 10 * 1000;
const PROGRESS_EVENT_MIN_MS = 500;
const CONTINUE_WITHOUT = Object.freeze(["transcript", "broll", "vision"]);
const RETRYABLE_FROM = Object.freeze(["NEEDS_ATTENTION", "CANCELLED", "READY", "COMPLETED"]);
const TOTAL_WEIGHT = Object.values(STAGE_WEIGHTS).reduce((a, b) => a + b, 0);
const HALTED = new Error("halted");

const isPlain = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const round1 = (v) => Math.round(v * 10) / 10;

function waitWithDeadline(promise, ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), Math.max(0, ms));
    Promise.resolve(promise).then(() => { clearTimeout(timer); resolve(true); }, () => { clearTimeout(timer); resolve(true); });
  });
}

function resolveRegistry(handlers) {
  if (handlers && typeof handlers.getStage === "function" && typeof handlers.listStages === "function") return handlers;
  if (Array.isArray(handlers) || typeof handlers === "function") {
    const reg = stages.createRegistry();
    for (const h of Array.isArray(handlers) ? handlers : [handlers]) {
      if (typeof h === "function") h(reg); else reg.registerStage(h);
    }
    return reg;
  }
  const reg = stages.defaultRegistry;
  // EVERY phase handler this checkout has, discovered by file name — never a hand-listed pair.
  // This used to require phase2 + phase3 explicitly, and it silently froze production at those six
  // stages when phases 4 and 5 landed: the tests inject their handlers, so they were green while the
  // real server analysed a video and then stopped without ever building an Edit Plan (`plan: null`,
  // notice PIPELINE_PARTIAL). handlers/index.js exists to answer exactly this question.
  if (!reg.listStages().length) require("./handlers").registerAll(reg);
  return reg;
}

function actionsFor(err, input) {
  if (err.extra && Array.isArray(err.extra.actions)) return err.extra.actions.map((a) => String(a).slice(0, 40)).slice(0, 8);
  if (input) return ["delete"];
  const actions = ["retry"];
  if (["STT_FAILED", "COST_CAP_REACHED", "NO_SPEECH"].includes(err.code)) actions.push("continue_without_transcript");
  actions.push("delete");
  return actions;
}

function createRunner({
  store, queue, events, settings, handlers, now = Date.now, log = console, eta, retryBackoffMs, abortGraceMs,
  cancelDeadlineMs = DEFAULT_CANCEL_DEADLINE_MS, pidFile, afterPipeline = null,
} = {}) {
  if (!store) throw new TypeError("video_edit/runner: store is required");
  if (!queue) throw new TypeError("video_edit/runner: queue is required");
  const cfg = settings || store.settings;
  const bus = events && typeof events.publish === "function" ? events : { publish: () => 0 };
  const registry = resolveRegistry(handlers);
  let etaModel = null;
  if (eta && typeof eta.estimate === "function") etaModel = eta;
  else if (eta !== null && eta !== false) { try { etaModel = createEtaModel({ settings: cfg }); } catch { etaModel = null; } }
  const procPidFile = pidFile !== undefined ? pidFile : (cfg && cfg.paths ? path.join(cfg.paths.runtimeDir, "pids.json") : undefined);

  const runs = new Map();
  const counters = { started: 0, finished: 0, fencedWrites: 0, cancelled: 0 };
  let stopping = false;

  const say = (level, msg) => { try { (log && (log[level] || log.log) || console.log).call(log, msg); } catch { /* noop */ } };
  const publish = (id, type, data) => { try { return bus.publish(id, type, data); } catch { return 0; } };
  const etaSave = () => { try { if (etaModel && typeof etaModel.save === "function") etaModel.save(); } catch { /* fail-open */ } };

  // ---- planning ------------------------------------------------------------------------------
  function planStages() {
    const defs = new Map(registry.listStages().filter((d) => stages.PIPELINE_STAGES.includes(d.name)).map((d) => [d.name, d]));
    const memo = new Map();
    const ok = (name, stack) => {
      if (memo.has(name)) return memo.get(name);
      if (stack.has(name)) throw new EditError("STAGE_GRAPH_CYCLE", { errorClass: "bug", stage: name });
      const def = defs.get(name);
      if (!def) { memo.set(name, false); return false; }
      stack.add(name);
      const r = def.deps.every((d) => ok(d, stack));
      stack.delete(name);
      memo.set(name, r);
      return r;
    };
    const runnable = stages.PIPELINE_STAGES.filter((n) => ok(n, new Set()));
    return { defs, runnable, partial: runnable.length < stages.PIPELINE_STAGES.length };
  }

  // ---- registry entries ----------------------------------------------------------------------
  function newEntry(projectId) {
    const entry = {
      projectId, runId: ids.newRunId(), ac: new AbortController(), children: new Set(), pendingKieTasks: new Set(),
      state: "queued", target: "pipeline", cancelRequested: false, cancelPromise: null, shutdown: false,
      queuePosition: null, continueWithout: [], plan: null, stagePct: new Map(), stageStarted: new Map(),
      lastProgressEventAt: 0, resolveDone: null, done: null,
    };
    entry.done = new Promise((r) => { entry.resolveDone = r; });
    return entry;
  }

  const handleOf = (entry) => ({ runId: entry.runId, queuePosition: entry.queuePosition, done: entry.done });

  function abortEntry(entry, reason) {
    if (!entry.ac.signal.aborted) entry.ac.abort(reason);
    if (entry.children.size) {
      const { killTree } = require("../../services/spawn_compat");
      for (const child of entry.children) { try { killTree(child); } catch { /* already gone */ } }
    }
    entry.pendingKieTasks.clear();
  }

  function refreshQueuePositions() {
    let pos = 0;
    for (const e of runs.values()) {
      if (e.state !== "queued" || e.cancelRequested || !e.queued) continue;
      pos++;
      if (e.queuePosition === pos) continue;
      e.queuePosition = pos;
      try { store.setProgress(e.projectId, { queuePosition: pos, message: "Waiting in queue" }); } catch { /* noop */ }
      publish(e.projectId, "progress", { status: "QUEUED", queuePosition: pos, message: "Waiting in queue" });
    }
  }

  // ---- progress ------------------------------------------------------------------------------
  function mediaFacts(project) {
    const src = project && isPlain(project.source) ? project.source : {};
    const disc = project && isPlain(project.discoveries) ? project.discoveries : {};
    const v = isPlain(src.video) ? src.video : {};
    const durationSec = Number(src.durationSec) || Number(disc.durationSec) || 30;
    const w = Number(v.width) || Number(disc.width) || 0;
    const h = Number(v.height) || Number(disc.height) || 0;
    return { durationSec, pixels: w && h ? w * h : 2.07e6, cpus: cfg && cfg.cpus };
  }

  function combinedOverall(stagesMap, current, pct, running) {
    let v = overallPct(stagesMap, current, pct);
    for (const [name, p] of running) {
      if (name === current || !STAGE_WEIGHTS[name]) continue;
      const st = stagesMap && stagesMap[name] && stagesMap[name].status;
      if (st === "done" || st === "skipped") continue;
      v += (STAGE_WEIGHTS[name] * (p / 100) / TOTAL_WEIGHT) * 100;
    }
    return round1(Math.min(100, Math.max(0, v)));
  }

  function estimateEta(entry, project, stage, stagePct, t) {
    if (!etaModel) return null;
    try {
      const facts = mediaFacts(project);
      const elapsedMs = entry.stageStarted.has(stage) ? t - entry.stageStarted.get(stage) : 0;
      let sec = etaModel.remaining(stage, { ...facts, stagePct, elapsedMs });
      for (const name of entry.plan ? entry.plan.runnable : []) {
        if (name === stage) continue;
        const st = project.stages && project.stages[name] && project.stages[name].status;
        if (st === "done" || st === "skipped") continue;
        sec += entry.stagePct.has(name) ? etaModel.estimate(name, facts) * (1 - entry.stagePct.get(name) / 100) : etaModel.estimate(name, facts);
      }
      return Math.max(0, Math.round(sec));
    } catch { return null; }
  }

  function reportProgress(entry, stage, pct, message, meta = {}) {
    if (!stage || runs.get(entry.projectId) !== entry || entry.ac.signal.aborted) return;
    const id = entry.projectId;
    const t = now();
    if (meta.started) { entry.stageStarted.set(stage, t); entry.stagePct.set(stage, 0); }
    if (Number.isFinite(pct)) entry.stagePct.set(stage, Math.max(0, Math.min(100, pct)));
    const project = store.get(id);
    if (!project) return;
    const stagePct = entry.stagePct.has(stage) ? entry.stagePct.get(stage) : 0;
    const overall = combinedOverall(project.stages, stage, stagePct, entry.stagePct);
    const etaSec = estimateEta(entry, project, stage, stagePct, t);
    const patch = { stage, stagePct: round1(stagePct), overallPct: overall, etaSec, queuePosition: null };
    if (meta.started) patch.stageStartedAt = t;
    if (message != null) patch.message = String(message).slice(0, 200);
    try { store.setProgress(id, patch); } catch { /* progress is an enhancement */ }
    const force = !!(meta.started || meta.finished || meta.waiting || message != null);
    if (force || t - entry.lastProgressEventAt >= PROGRESS_EVENT_MIN_MS) {
      entry.lastProgressEventAt = t;
      publish(id, "progress", { status: "PROCESSING", stage, stagePct: patch.stagePct, overallPct: overall, etaSec, message: patch.message });
    }
  }

  function recordEta(entry, name, record) {
    try {
      if (!etaModel || !(record && record.durationMs > 0)) return;
      const predictedSec = etaModel.estimate(name, mediaFacts(store.get(entry.projectId)));
      if (predictedSec > 0) etaModel.record(name, record.durationMs, predictedSec * 1000);
    } catch { /* fail-open */ }
  }

  function stageCtx(entry) {
    return {
      store, events: bus, queue, settings: cfg, projectId: entry.projectId, runId: entry.runId, signal: entry.ac.signal,
      log, now, retryBackoffMs, abortGraceMs, pidFile: procPidFile, tracker: null, continueWithout: entry.continueWithout,
      progress: (pct, message, meta) => reportProgress(entry, meta && meta.stage, pct, message, meta || {}),
      trackChild: (child) => { entry.children.add(child); return () => entry.children.delete(child); },
      onFenced: () => { counters.fencedWrites++; },
    };
  }

  // ---- outcomes ------------------------------------------------------------------------------
  async function finishReady(entry, plan, durationMs) {
    const id = entry.projectId;
    const runId = entry.runId;
    const lastStage = plan.runnable.length ? plan.runnable[plan.runnable.length - 1] : null;
    try {
      await store.update(id, (d) => {
        d.notices = (Array.isArray(d.notices) ? d.notices : []).filter((n) => !(n && n.code === "PIPELINE_PARTIAL"));
        d.recovery = { ...(isPlain(d.recovery) ? d.recovery : {}), count: 0 };
        d.progress = {
          ...(isPlain(d.progress) ? d.progress : {}), stage: lastStage || null, stagePct: 100,
          overallPct: overallPct(d.stages, null, 0), message: "Ready", etaSec: 0, queuePosition: null,
        };
      }, { runId });
      if (plan.partial) {
        await store.addNotice(id, { code: "PIPELINE_PARTIAL", severity: "info", stage: null, message: "Your video is prepared. AI editing steps are not available yet." }, { runId });
      }
      await store.setStatus(id, "READY", { runId, actor: "engine" });
    } catch (e) {
      if (isEditError(e) && e.code === "STALE_RUN") { counters.fencedWrites++; return { status: null, fenced: true }; }
      say("warn", `[video-edit] pipeline finish write failed project=${id} code=${(e && e.code) || "INTERNAL"}`);
      return { status: null, error: e };
    }
    publish(id, "done", { status: "READY" });
    etaSave();
    say("info", `[video-edit] pipeline READY project=${id} run=${runId} ms=${durationMs} partial=${plan.partial}`);
    return { status: "READY", partial: plan.partial };
  }

  async function failPipeline(entry, err, { addError = false } = {}) {
    const id = entry.projectId;
    const input = err.errorClass === "input";
    const next = input ? "FAILED" : "NEEDS_ATTENTION";
    const reason = {
      code: err.code,
      message: err.userMessage || null,
      retryable: input ? false : !(err.extra && err.extra.retryable === false),
      stage: err.stage || null,
      actions: actionsFor(err, input),
    };
    try {
      if (addError) await store.addError(id, err, { runId: entry.runId });
      await store.update(id, (d) => {
        d.recovery = { ...(isPlain(d.recovery) ? d.recovery : {}), count: 0 };
        d.progress = { ...(isPlain(d.progress) ? d.progress : {}), etaSec: null, queuePosition: null, message: input ? "Stopped" : "Needs attention" };
      }, { runId: entry.runId });
      await store.setStatus(id, next, { runId: entry.runId, actor: "engine", reason });
    } catch (e) {
      if (isEditError(e) && e.code === "STALE_RUN") { counters.fencedWrites++; return { status: null, fenced: true, error: err }; }
      say("error", `[video-edit] pipeline status write failed project=${id} code=${(e && e.code) || "INTERNAL"}`);
      return { status: null, error: err };
    }
    publish(id, "done", { status: next, code: err.code, stage: err.stage || undefined });
    etaSave();
    say("warn", `[video-edit] pipeline ${next} project=${id} run=${entry.runId} stage=${err.stage || "-"} code=${err.code} class=${err.errorClass}`);
    return { status: next, error: err };
  }

  // ---- the pipeline job ----------------------------------------------------------------------
  async function runPipeline(entry) {
    const id = entry.projectId;
    if (entry.ac.signal.aborted) return { status: null, skipped: true, reason: "ABORTED_WHILE_QUEUED" };
    const current = store.get(id);
    if (!current || current.runId !== entry.runId || current.status !== "QUEUED") {
      return { status: current ? current.status : null, skipped: true, reason: "SUPERSEDED" };
    }
    entry.state = "running";
    entry.queuePosition = null;
    counters.started++;
    refreshQueuePositions();
    const t0 = now();
    const signal = entry.ac.signal;

    let plan;
    try {
      await store.setStatus(id, "PROCESSING", { runId: entry.runId, actor: "engine" });
      plan = planStages();
      entry.plan = plan;
    } catch (e) {
      if (isEditError(e) && ["STALE_RUN", "ILLEGAL_TRANSITION", "NOT_FOUND"].includes(e.code)) {
        return { status: null, skipped: true, reason: e.code };
      }
      return failPipeline(entry, stages.normalizeError(e), { addError: true });
    }
    publish(id, "progress", { status: "PROCESSING", message: "Starting" });
    say("info", `[video-edit] pipeline start project=${id} run=${entry.runId} stages=${plan.runnable.length} partial=${plan.partial}`);

    const promises = new Map();
    const errors = [];
    let halted = false;
    const runNode = (name) => {
      if (promises.has(name)) return promises.get(name);
      const def = plan.defs.get(name);
      const p = (async () => {
        await Promise.all(def.deps.map(runNode));
        if (halted || signal.aborted) throw HALTED;
        try {
          const r = await stages.runStage(def, stageCtx(entry));
          if (r.status === "done") recordEta(entry, name, r.record);
          return r;
        } catch (e) {
          errors.push(isEditError(e) ? e : stages.normalizeError(e, { stage: name }));
          halted = true;   // siblings already running finish (their checkpoints are kept); nothing new starts
          throw e;
        } finally {
          entry.stagePct.delete(name);
        }
      })();
      p.catch(() => { /* observed via errors[] */ });
      promises.set(name, p);
      return p;
    };
    await Promise.allSettled(plan.runnable.map(runNode));
    counters.finished++;

    if (signal.aborted) {
      const reason = isEditError(signal.reason) ? signal.reason.code : "ABORTED";
      say("info", `[video-edit] pipeline stopped project=${id} run=${entry.runId} reason=${reason}`);
      return { status: null, aborted: true, reason };
    }
    if (errors.some((e) => e.code === "STALE_RUN")) return { status: null, fenced: true };
    if (errors.length) return failPipeline(entry, errors[0]);
    if (typeof afterPipeline === "function" && !plan.partial) {
      try {
        await afterPipeline({
          projectId: id, runId: entry.runId, signal,
          progress: (stage, pct, message, meta) => reportProgress(entry, stage, pct, message, { ...(meta || {}) }),
          markStage: (stage, status) => {
            const at = now();
            const patch = status === "running" ? { status, startedAt: at } : { status, finishedAt: at };
            store.setStage(id, stage, patch, { runId: entry.runId }).catch(() => {});
          },
        });
      } catch (e) {
        if (signal.aborted) return { status: null, aborted: true, reason: isEditError(signal.reason) ? signal.reason.code : "ABORTED" };
        say("warn", `[video-edit] after-pipeline step failed project=${id} code=${(e && e.code) || "INTERNAL"}`);
      }
      if (signal.aborted) return { status: null, aborted: true, reason: isEditError(signal.reason) ? signal.reason.code : "ABORTED" };
    }
    return finishReady(entry, plan, now() - t0);
  }

  // ---- public API ----------------------------------------------------------------------------
  async function enqueuePipeline(projectId, { resume = false, forceFrom = null, continueWithout = null, allowFrom = null } = {}) {
    if (stopping) throw new EditError("EDITS_DISABLED", { status: 503, errorClass: "config", retryable: true, extra: { reason: "SHUTTING_DOWN" } });
    const existing = runs.get(projectId);
    if (existing) return handleOf(existing);
    const project = store.get(projectId);
    if (!project) throw new EditError("NOT_FOUND", { status: 404, errorClass: "input" });
    const notQueued = () => new EditError("ILLEGAL_TRANSITION", { status: 409, errorClass: "input", extra: { from: project.status, to: "QUEUED", reason: "NOT_QUEUED" } });
    // Only QUEUED is claimable by default: a caller holding a stale "it was QUEUED" (boot recovery, a create
    // racing a cancel) must never resurrect a CANCELLED/READY/COMPLETED project.
    if (project.status !== "QUEUED" && ![].concat(allowFrom || []).includes(project.status)) throw notQueued();
    if (forceFrom != null && !stages.PIPELINE_STAGES.includes(forceFrom)) {
      throw new EditError("VALIDATION_FAILED", { status: 422, errorClass: "input", extra: { field: "stage" } });
    }
    const wanted = [].concat(continueWithout || []);
    if (wanted.some((x) => !CONTINUE_WITHOUT.includes(x))) {
      throw new EditError("VALIDATION_FAILED", { status: 422, errorClass: "input", extra: { field: "continueWithout" } });
    }

    const entry = newEntry(projectId);
    runs.set(projectId, entry);
    try {
      if (project.status !== "QUEUED") {
        const actor = project.status === "PROCESSING" ? "recovery" : "retry";
        await store.setStatus(projectId, "QUEUED", { actor, reason: actor });
      }
      const updated = await store.update(projectId, (d) => {
        if (d.status !== "QUEUED") {   // a cancel committed between our read and this lock
          throw new EditError("ILLEGAL_TRANSITION", { status: 409, errorClass: "input", extra: { from: d.status, to: "QUEUED", reason: "NOT_QUEUED" } });
        }
        d.runId = entry.runId;   // claim: every writer holding an older runId is fenced from here on
        if (forceFrom) stages.invalidateFrom(d, forceFrom, registry);
        const prev = isPlain(d.runOptions) && Array.isArray(d.runOptions.continueWithout) ? d.runOptions.continueWithout : [];
        d.runOptions = { continueWithout: [...new Set([...prev, ...wanted])], forceFrom: forceFrom || null, resume: !!resume, requestedAt: now() };
        d.progress = { ...(isPlain(d.progress) ? d.progress : {}), stagePct: 0, message: "Waiting in queue", etaSec: null, queuePosition: null };
      });
      entry.continueWithout = updated.runOptions.continueWithout;
    } catch (e) {
      if (runs.get(projectId) === entry) runs.delete(projectId);
      entry.resolveDone({ status: null, error: e });
      throw e;
    }
    if (entry.cancelRequested) {
      // cancel() landed while we were claiming the project: honour it now that the runId is ours.
      await finalizeCancel(projectId, entry);
      if (runs.get(projectId) === entry) runs.delete(projectId);
      entry.resolveDone({ status: "CANCELLED", skipped: true });
      return handleOf(entry);
    }

    entry.queued = true;
    queue.add(() => runPipeline(entry), { priority: 0, label: projectId })
      .catch((e) => {
        if (isEditError(e) && e.code === "QUEUE_CLEARED") return { status: "QUEUED", skipped: true, reason: "QUEUE_CLEARED" };
        say("error", `[video-edit] pipeline crashed project=${projectId} code=${(e && e.code) || "INTERNAL"}`);
        return { status: null, error: e };
      })
      .then((r) => {
        if (runs.get(projectId) === entry) runs.delete(projectId);
        refreshQueuePositions();
        entry.resolveDone(r);
      });
    refreshQueuePositions();
    say("info", `[video-edit] pipeline queued project=${projectId} run=${entry.runId} resume=${!!resume} force=${forceFrom || "-"}`);
    return handleOf(entry);
  }

  async function finalizeCancel(projectId, entry) {
    let changed = false;
    try {
      await store.update(projectId, (d) => {
        if (d.status !== "PROCESSING" && d.status !== "QUEUED") return;   // it finished or failed before the cancel landed
        if (entry && d.runId !== entry.runId) return;                     // a newer run owns the project
        const from = d.status;
        const stage = (isPlain(d.progress) && d.progress.stage) || null;
        d.status = "CANCELLED";
        d.statusReason = { code: "CANCELLED", message: "Processing was stopped.", retryable: true, stage, actions: ["retry", "delete"] };
        d.lastTransition = { from, to: "CANCELLED", actor: "user", reason: "CANCELLED", at: now() };
        for (const rec of Object.values(isPlain(d.stages) ? d.stages : {})) if (isPlain(rec) && rec.status === "running") rec.status = "interrupted";
        d.runId = ids.newRunId();   // fencing: late writes of the cancelled run are rejected
        d.progress = { ...(isPlain(d.progress) ? d.progress : {}), message: "Stopped", etaSec: null, queuePosition: null };
        changed = true;
      }, { actor: "user" });
    } catch (e) {
      if (!(isEditError(e) && e.code === "NOT_FOUND")) say("warn", `[video-edit] cancel write failed project=${projectId} code=${(e && e.code) || "INTERNAL"}`);
    }
    if (changed) { counters.cancelled++; publish(projectId, "done", { status: "CANCELLED" }); }
    return changed;
  }

  async function cancel(projectId, { target = "pipeline" } = {}) {
    const entry = runs.get(projectId);
    if (!entry || entry.target !== target) {
      const p = target === "pipeline" ? store.get(projectId) : null;
      if (p && p.status === "QUEUED") {
        await finalizeCancel(projectId, null);
        return { cancelled: true, forced: false, wasQueued: true };
      }
      throw new EditError("NOTHING_TO_CANCEL", { status: 409, errorClass: "input" });
    }
    if (entry.cancelPromise) return entry.cancelPromise;
    entry.cancelRequested = true;
    entry.cancelPromise = (async () => {
      const wasQueued = entry.state === "queued";
      abortEntry(entry, new EditError("CANCELLED", { status: 409, errorClass: "cancelled" }));
      let forced = false;
      if (!wasQueued) forced = !(await waitWithDeadline(entry.done, cancelDeadlineMs));
      if (wasQueued && !entry.queued) return { cancelled: true, forced: false, wasQueued: true };   // enqueue finalizes
      await finalizeCancel(projectId, entry);
      if (runs.get(projectId) === entry) runs.delete(projectId);
      refreshQueuePositions();
      say("info", `[video-edit] pipeline cancelled project=${projectId} run=${entry.runId} queued=${wasQueued} forced=${forced}`);
      return { cancelled: true, forced, wasQueued };
    })();
    return entry.cancelPromise;
  }

  async function abort(projectId, { reason = "ABORTED", waitMs = DEFAULT_CANCEL_DEADLINE_MS } = {}) {
    const entry = runs.get(projectId);
    if (!entry) return false;
    abortEntry(entry, new EditError(String(reason).slice(0, 40), { status: 409, errorClass: "cancelled" }));
    if (entry.state === "running") await waitWithDeadline(entry.done, waitMs);
    if (runs.get(projectId) === entry) runs.delete(projectId);
    refreshQueuePositions();
    return true;
  }

  async function retry(projectId, { stage = null, mode = "resume", continueWithout = null } = {}) {
    if (runs.has(projectId)) throw new EditError("ILLEGAL_TRANSITION", { status: 409, errorClass: "input", extra: { reason: "RUNNING" } });
    const p = store.get(projectId);
    if (!p) throw new EditError("NOT_FOUND", { status: 404, errorClass: "input" });
    if (mode !== "resume" && mode !== "force") throw new EditError("VALIDATION_FAILED", { status: 422, errorClass: "input", extra: { field: "mode" } });
    if (continueWithout != null && !CONTINUE_WITHOUT.includes(continueWithout)) {
      throw new EditError("VALIDATION_FAILED", { status: 422, errorClass: "input", extra: { field: "continueWithout" } });
    }
    if (p.status === "FAILED") throw new EditError("NOT_RETRYABLE", { status: 422, errorClass: "input" });
    // `retryable:false` means RUNNING THE SAME THING AGAIN IS POINTLESS — re-reading the same silent
    // audio will not find speech. It does NOT mean the project is stuck: the very same statusReason
    // offers its way out in `actions` (NO_SPEECH -> continue_without_transcript). Refusing that call
    // left the UI advertising a button the API answered 422 to, with delete as the only way forward.
    // So a `continueWithout` the parked reason itself offers is allowed through; a bare retry is not.
    if (p.status === "NEEDS_ATTENTION" && p.statusReason && p.statusReason.retryable === false) {
      const offered = Array.isArray(p.statusReason.actions) ? p.statusReason.actions : [];
      if (!(continueWithout && offered.includes(`continue_without_${continueWithout}`))) {
        throw new EditError("NOT_RETRYABLE", { status: 422, errorClass: "input", extra: { code: p.statusReason.code } });
      }
    }
    if (!RETRYABLE_FROM.includes(p.status) && p.status !== "QUEUED") {
      throw new EditError("ILLEGAL_TRANSITION", { status: 409, errorClass: "input", extra: { from: p.status, to: "QUEUED" } });
    }
    const plan = planStages();
    if (stage != null && !plan.runnable.includes(stage)) {
      throw new EditError("VALIDATION_FAILED", { status: 422, errorClass: "input", extra: { field: "stage" } });
    }
    const doneish = (n) => { const r = p.stages && p.stages[n]; return !!r && (r.status === "done" || r.status === "skipped"); };
    const fromStage = mode === "force"
      ? (stage || plan.runnable[0] || null)
      : (stage || plan.runnable.find((n) => !doneish(n)) || plan.runnable[0] || null);
    const originalGone = !!(p.source && p.source.originalDeletedAt);
    if (mode === "force" && ["VALIDATING", "COMPRESSING"].includes(fromStage) && originalGone) {
      throw new EditError("NOT_RETRYABLE", { status: 422, errorClass: "input", extra: { reason: "ORIGINAL_DELETED" } });
    }
    // Resume with no COMPRESSING checkpoint and no original: nothing can produce a mezzanine any more.
    if (mode === "resume" && originalGone && plan.runnable.includes("COMPRESSING") && !doneish("COMPRESSING")) {
      throw new EditError("NOT_RETRYABLE", { status: 422, errorClass: "input", extra: { reason: "ORIGINAL_DELETED" } });
    }
    if (p.status !== "QUEUED") await store.setStatus(projectId, "QUEUED", { actor: "retry", reason: "retry" });
    await store.update(projectId, (d) => { d.recovery = { ...(isPlain(d.recovery) ? d.recovery : {}), count: 0 }; });
    const handle = await enqueuePipeline(projectId, {
      resume: true, forceFrom: mode === "force" ? fromStage : null, continueWithout: continueWithout || null,
    });
    return { fromStage, runId: handle.runId, done: handle.done };
  }

  async function stopAll({ timeoutMs = DEFAULT_CANCEL_DEADLINE_MS } = {}) {
    stopping = true;
    try { queue.pause(); } catch { /* noop */ }
    const entries = [...runs.values()];
    for (const e of entries) {
      e.shutdown = true;
      abortEntry(e, new EditError("SHUTDOWN", { status: 503, errorClass: "cancelled", retryable: true }));
    }
    try { queue.clear(); } catch { /* noop */ }
    const running = entries.filter((e) => e.state === "running").map((e) => e.done);
    const settled = await waitWithDeadline(Promise.allSettled(running), timeoutMs);
    for (const e of entries) if (runs.get(e.projectId) === e) runs.delete(e.projectId);
    etaSave();
    try { store.flush(); } catch { /* noop */ }
    say("info", `[video-edit] runner stopped runs=${entries.length} timedOut=${!settled}`);
    return { stopped: entries.length, timedOut: !settled };
  }

  return {
    enqueuePipeline, cancel, retry, abort, stopAll, planStages, registry,
    isActive: (projectId) => runs.has(projectId),
    activeIds: () => [...runs.keys()],
    stats: () => ({ ...counters, active: runs.size }),
  };
}

module.exports = { createRunner, actionsFor, DEFAULT_CANCEL_DEADLINE_MS };
