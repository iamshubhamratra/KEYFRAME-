// VIDEO EDIT STAGES — the stage graph, the handler registry and the checkpoint runner.
//
// WHY THIS EXISTS. An edit pipeline is a dozen stages, several of them paid (STT, LLM, vision)
// and several CPU-heavy (ffmpeg). A restart, a cancel, a transient provider hiccup or a user's
// "retry" must never redo — or re-pay for — work whose inputs have not changed. So every stage
// runs through one checkpoint runner (ENGINE.md §5.1):
//   - SKIP when the stored record is `done`, its inputHash (stage + version + the handler's own
//     input fingerprint) matches — or the stage says it is `pinned` (its inputs can never be read
//     again, e.g. the original was deleted) — and every recorded output still exists with the same
//     size and hash (full sha256 for JSON, size + first/last 1 MB for media — cheap on large files);
//   - otherwise run the handler under a BUDGET (AbortSignal.any of the run's cancel signal and a
//     timeout), inside a heavy-CPU slot when the stage is heavy, with up to 3 ATTEMPTS for
//     `transient` errors;
//   - record the stage with runId fencing (a cancelled/superseded run cannot write), publish
//     `stage` / `discovery` events, and normalize every throw into an EditError;
//   - after every recorded stage, refresh `storage.bytes` from the project directory so quotas see
//     the derived media (mezzanine, proxy, wavs), not just the upload (fail-open).
// Handlers are registered, not imported, so later phases add stages without touching the runner,
// and an early phase simply has fewer registered stages (the runner reports PIPELINE_PARTIAL).
//
// CONTRACT:
//   registerStage({ name, version, deps, heavy, weight, maxAttempts?, inputHash(ctx), budgetMs(ctx), run(ctx), skip?(ctx),
//                  pinned?(ctx) -> truthy: reuse an intact `done` checkpoint even if inputHash/version changed })
//   getStage(name) · listStages() · resetRegistry()          (default registry, used by the real runner)
//   createRegistry() -> { registerStage, getStage, listStages, resetRegistry }   (isolated, for tests)
//   runStage(def, ctx) -> Promise<{ status:'done'|'cached'|'skipped', record, result? }>
//     ctx: { store, projectId, runId, settings?, events?, queue?, signal?, log?, now?, progress?(pct, msg, meta),
//            force?, retryBackoffMs?, abortGraceMs?, tracker?, pidFile?, continueWithout?, trackChild?, onFenced? }
//     handler ctx: { project, projectId, projectDir, settings, runId, signal, attempt, slot, lowPriority, budgetMs,
//            log, emit(type,data), progress(pct,msg), tracker, faults, abs(rel), readJson(rel), writeJson(rel,obj),
//            updateProject(mutator), upstream(deps), now, pidFile, continueWithout, trackChild(child) }
//     handler result: { outputs:{name:{path}}, engine?, fallbacks?, discoveries?, notices?, costUsd? }
//   computeInputHash(def, ctx) · outputsIntact(ctx, outputs) · upstreamFingerprint(project, deps)
//   descendantsOf(stage, registry) · invalidateFrom(projectDraft, stage, registry) · normalizeError(e, { stage })
//   GRAPH · PIPELINE_STAGES · RENDER_STAGES · STAGE_MESSAGES

const fs = require("node:fs");
const path = require("node:path");
const fsx = require("../fsx");
const faults = require("../faults");
const { EditError, isEditError } = require("../errors");
const { STAGES } = require("../constants");
const { STAGE_WEIGHTS } = require("./progress");

const GRAPH = Object.freeze({
  VALIDATING: Object.freeze([]),
  COMPRESSING: Object.freeze(["VALIDATING"]),
  EXTRACTING_AUDIO: Object.freeze(["COMPRESSING"]),
  TRANSCRIBING: Object.freeze(["EXTRACTING_AUDIO"]),
  ANALYZING_VIDEO: Object.freeze(["COMPRESSING"]),
  ANALYZING_CONTENT: Object.freeze(["TRANSCRIBING"]),
  SEARCHING_BROLL: Object.freeze(["ANALYZING_CONTENT"]),
  SCORING_ASSETS: Object.freeze(["SEARCHING_BROLL"]),
  BUILDING_EDIT_PLAN: Object.freeze(["SCORING_ASSETS", "ANALYZING_VIDEO"]),
  PREPARING_RENDER: Object.freeze(["BUILDING_EDIT_PLAN"]),
  RENDERING: Object.freeze(["PREPARING_RENDER"]),
  POST_PROCESSING: Object.freeze(["RENDERING"]),
  QUALITY_CHECK: Object.freeze(["POST_PROCESSING"]),
});
const PIPELINE_STAGES = Object.freeze(STAGES.slice(0, STAGES.indexOf("BUILDING_EDIT_PLAN") + 1));
const RENDER_STAGES = Object.freeze(STAGES.slice(STAGES.indexOf("PREPARING_RENDER")));

const STAGE_MESSAGES = Object.freeze({
  VALIDATING: "Checking the footage", COMPRESSING: "Preparing your video", EXTRACTING_AUDIO: "Listening to the audio",
  TRANSCRIBING: "Transcribing", ANALYZING_VIDEO: "Looking at the video", ANALYZING_CONTENT: "Understanding the story",
  SEARCHING_BROLL: "Finding B-roll", SCORING_ASSETS: "Choosing the best shots", BUILDING_EDIT_PLAN: "Building the edit",
  PREPARING_RENDER: "Preparing the render", RENDERING: "Rendering", POST_PROCESSING: "Mixing the sound",
  QUALITY_CHECK: "Checking the result",
});

const MAX_ATTEMPTS = 3;
const DEFAULT_BUDGET_MS = 10 * 60 * 1000;
const MIN_BUDGET_MS = 20;
const DEFAULT_BACKOFF_MS = Object.freeze([1000, 3000]);
const DEFAULT_ABORT_GRACE_MS = 6000;

const isPlain = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const noopLog = { info() {}, warn() {}, error() {}, log() {} };

// ---- registry --------------------------------------------------------------------------------
function createRegistry() {
  const defs = new Map();

  function registerStage(def) {
    if (!isPlain(def)) throw new TypeError("stages.registerStage: definition object required");
    const { name } = def;
    if (!STAGES.includes(name)) throw new TypeError("stages.registerStage: unknown stage name");
    if (typeof def.run !== "function") throw new TypeError(`stages.registerStage(${name}): run() required`);
    if (typeof def.inputHash !== "function") throw new TypeError(`stages.registerStage(${name}): inputHash() required`);
    const deps = Array.isArray(def.deps) ? [...new Set(def.deps)] : [...(GRAPH[name] || [])];
    for (const d of deps) {
      if (!STAGES.includes(d) || d === name) throw new TypeError(`stages.registerStage(${name}): bad dependency`);
    }
    const norm = Object.freeze({
      name,
      version: Number.isInteger(def.version) && def.version > 0 ? def.version : 1,
      deps: Object.freeze(deps),
      heavy: !!def.heavy,
      weight: Number.isFinite(def.weight) ? def.weight : (STAGE_WEIGHTS[name] || 0),
      inputHash: def.inputHash,
      budgetMs: typeof def.budgetMs === "function" ? def.budgetMs : () => DEFAULT_BUDGET_MS,
      run: def.run,
      skip: typeof def.skip === "function" ? def.skip : null,
      pinned: typeof def.pinned === "function" ? def.pinned : null,
      maxAttempts: Number.isInteger(def.maxAttempts) && def.maxAttempts > 0 ? Math.min(def.maxAttempts, MAX_ATTEMPTS) : MAX_ATTEMPTS,
    });
    defs.set(name, norm);
    return norm;
  }

  return {
    registerStage,
    getStage: (name) => defs.get(name) || null,
    listStages: () => STAGES.filter((n) => defs.has(n)).map((n) => defs.get(n)),
    resetRegistry: () => defs.clear(),
  };
}

const defaultRegistry = createRegistry();

// ---- hashing & outputs -----------------------------------------------------------------------
function upstreamFingerprint(project, deps) {
  const out = {};
  for (const d of deps || []) {
    const r = project && isPlain(project.stages) ? project.stages[d] : null;
    out[d] = r && isPlain(r.outputs)
      ? Object.fromEntries(Object.entries(r.outputs).map(([k, v]) => [k, v && v.sha256 ? v.sha256 : null]))
      : null;
  }
  return out;
}

async function computeInputHash(def, ctx) {
  let raw;
  try {
    raw = await def.inputHash(ctx);
  } catch (e) {
    if (isEditError(e)) { if (!e.stage) e.stage = def.name; throw e; }
    throw new EditError("STAGE_INPUT_HASH_FAILED", { errorClass: "bug", stage: def.name, detail: e && e.message });
  }
  return fsx.sha256Json({ stage: def.name, version: def.version, input: raw === undefined ? null : raw });
}

const isJsonPath = (p) => /\.json$/i.test(String(p));
const hashOutput = (abs, rel) => (isJsonPath(rel) ? fsx.sha256File(abs) : fsx.partialSha(abs));

function toProjectRel(projectDir, p) {
  if (typeof p !== "string" || !p) throw new EditError("STAGE_OUTPUT_MISSING", { errorClass: "bug", detail: "output path missing" });
  let rel = p;
  if (path.isAbsolute(p)) {
    rel = path.relative(projectDir, p);
    if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) throw new EditError("PATH_ESCAPE", { status: 400, errorClass: "bug", detail: "output outside project" });
  }
  return rel.split(path.sep).join("/");
}

async function outputsIntact(ctx, outputs) {
  if (!isPlain(outputs)) return false;
  for (const rec of Object.values(outputs)) {
    if (!isPlain(rec) || typeof rec.path !== "string" || !Number.isFinite(rec.size) || typeof rec.sha256 !== "string") return false;
    let abs;
    try { abs = ctx.abs(rec.path); } catch { return false; }
    let st;
    try { st = await fs.promises.stat(abs); } catch { return false; }
    if (!st.isFile() || st.size !== rec.size) return false;
    let sha = null;
    try { sha = await hashOutput(abs, rec.path); } catch { return false; }
    if (sha !== rec.sha256) return false;
  }
  return true;
}

async function describeOutputs(ctx, outputs, stage) {
  const out = {};
  if (outputs == null) return out;
  if (!isPlain(outputs)) throw new EditError("STAGE_BAD_RESULT", { errorClass: "bug", stage, detail: "outputs must be an object" });
  for (const [name, v] of Object.entries(outputs)) {
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(name)) throw new EditError("STAGE_BAD_RESULT", { errorClass: "bug", stage, detail: "output name" });
    const rel = toProjectRel(ctx.projectDir, v && v.path);
    const abs = ctx.abs(rel);
    let st;
    try { st = await fs.promises.stat(abs); } catch { st = null; }
    if (!st || !st.isFile()) throw new EditError("STAGE_OUTPUT_MISSING", { errorClass: "bug", stage, detail: `output ${name} missing` });
    out[name] = { path: rel, size: st.size, sha256: await hashOutput(abs, rel), hashKind: isJsonPath(rel) ? "full" : "partial" };
  }
  return out;
}

// ---- graph helpers ---------------------------------------------------------------------------
function descendantsOf(stage, registry = defaultRegistry) {
  const depsOf = (n) => { const d = registry && registry.getStage(n); return d ? d.deps : (GRAPH[n] || []); };
  const out = new Set([stage]);
  for (let grew = true; grew;) {
    grew = false;
    for (const n of STAGES) {
      if (!out.has(n) && depsOf(n).some((x) => out.has(x))) { out.add(n); grew = true; }
    }
  }
  return STAGES.filter((n) => out.has(n));
}

// Mutates a project DRAFT (inside store.update): the stage and everything downstream of it lose
// their checkpoint; upstream checkpoints are untouched, so a forced re-run never redoes them.
function invalidateFrom(project, stage, registry = defaultRegistry) {
  const names = descendantsOf(stage, registry);
  if (!isPlain(project.stages)) project.stages = {};
  for (const n of names) {
    const r = project.stages[n];
    if (isPlain(r)) { r.status = "pending"; r.inputHash = null; }
  }
  return names;
}

// ---- errors ----------------------------------------------------------------------------------
function normalizeError(e, { stage = null } = {}) {
  if (isEditError(e)) { if (!e.stage && stage) e.stage = stage; return e; }
  const code = e && e.code;
  if (e && (e.name === "AbortError" || code === "ABORT_ERR")) return new EditError("CANCELLED", { status: 409, errorClass: "cancelled", stage });
  if (code === "ENOSPC") return new EditError("INSUFFICIENT_STORAGE", { status: 507, errorClass: "resource", retryable: true, stage, detail: "ENOSPC" });
  if (["EMFILE", "EBUSY", "EAGAIN", "ECONNRESET", "ETIMEDOUT"].includes(code)) {
    return new EditError("STAGE_IO_BUSY", { status: 503, errorClass: "transient", retryable: true, stage, detail: code });
  }
  if (code === "MODULE_NOT_FOUND") return new EditError("STAGE_MODULE_MISSING", { status: 503, errorClass: "config", stage, detail: "module missing" });
  return new EditError("STAGE_CRASHED", { errorClass: "bug", retryable: true, stage, detail: e && e.message ? e.message : String(e) });
}

function cancelledError(stage, reason) {
  if (isEditError(reason) && reason.errorClass === "cancelled") {
    return new EditError(reason.code, { status: reason.status, errorClass: "cancelled", retryable: reason.retryable, stage });
  }
  return new EditError("CANCELLED", { status: 409, errorClass: "cancelled", stage });
}

function errorSummary(err) {
  return {
    code: err.code, class: err.errorClass, message: String(err.userMessage || err.message || "").slice(0, 300),
    retryable: !!err.retryable, detail: err.detail != null ? String(err.detail).slice(-500) : null,
  };
}

// ---- abort helpers ---------------------------------------------------------------------------
function abortableSleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) return reject(signal.reason);
    const timer = setTimeout(() => { if (signal) signal.removeEventListener("abort", onAbort); resolve(); }, ms);
    const onAbort = () => { clearTimeout(timer); reject(signal.reason); };
    if (signal) signal.addEventListener("abort", onAbort, { once: true });
  });
}

// Settle with the handler's own outcome, but never hang on a handler that ignores its signal:
// after an abort it gets `graceMs` to wind down (children dying, temp files removed), then we move on.
function raceAbort(promise, signal, graceMs) {
  promise.catch(() => { /* observed below; never unhandled */ });
  if (!signal) return promise;
  return new Promise((resolve, reject) => {
    let done = false;
    let graceTimer = null;
    const finish = (fn, v) => {
      if (done) return;
      done = true;
      clearTimeout(graceTimer);
      signal.removeEventListener("abort", onAbort);
      fn(v);
    };
    const onAbort = () => { graceTimer = setTimeout(() => finish(reject, signal.reason), Math.max(0, graceMs)); };
    promise.then((v) => finish(resolve, v), (e) => finish(reject, e));
    if (signal.aborted) onAbort(); else signal.addEventListener("abort", onAbort, { once: true });
  });
}

// ---- storage accounting ------------------------------------------------------------------------
// Quotas (security/limits) sum `storage.bytes`; the upload alone understates a project several times
// once the mezzanine, proxy and wavs exist. Skips the write when nothing changed.
async function refreshStorageBytes(store, projectId, projectDir, runId) {
  let bytes;
  try { bytes = fsx.dirSizeBytes(projectDir); } catch { return null; }
  if (!Number.isFinite(bytes)) return null;
  const cur = store.get(projectId);
  if (!cur || (isPlain(cur.storage) && cur.storage.bytes === bytes)) return bytes;
  await store.update(projectId, (d) => { d.storage = { ...(isPlain(d.storage) ? d.storage : {}), bytes }; }, { runId });
  return bytes;
}

// ---- runner ----------------------------------------------------------------------------------
function withDefaults(ctx) {
  if (!ctx || !ctx.store || !ctx.projectId) throw new TypeError("stages.runStage: ctx.store and ctx.projectId are required");
  const store = ctx.store;
  const events = ctx.events && typeof ctx.events.publish === "function" ? ctx.events : { publish: () => 0 };
  const log = ctx.log || noopLog;
  const settings = ctx.settings || store.settings;
  const progress = typeof ctx.progress === "function" ? ctx.progress : (pct, message, meta = {}) => {
    const patch = { stage: meta.stage || null };
    if (Number.isFinite(pct)) patch.stagePct = Math.round(pct * 10) / 10;
    if (message != null) patch.message = message;
    if (meta.started) patch.stageStartedAt = Date.now();
    try { store.setProgress(ctx.projectId, patch); } catch { /* progress is an enhancement */ }
  };
  return {
    ...ctx, store, events, log, settings, progress,
    now: typeof ctx.now === "function" ? ctx.now : Date.now,
    retryBackoffMs: Array.isArray(ctx.retryBackoffMs) ? ctx.retryBackoffMs : DEFAULT_BACKOFF_MS,
    abortGraceMs: Number.isFinite(ctx.abortGraceMs) ? ctx.abortGraceMs : DEFAULT_ABORT_GRACE_MS,
    projectDir: store.projectDir(ctx.projectId),
  };
}

function handlerCtx(c, def, { project, attempt, signal, slot, budgetMs }) {
  const { store, projectId, runId, settings } = c;
  const stage = def.name;
  return {
    project, projectId, projectDir: c.projectDir, settings, runId, signal, attempt, stage, budgetMs,
    slot, lowPriority: !!(slot && slot.lowPriority),
    log: c.log,
    now: c.now,
    store, events: c.events, queue: c.queue || null,
    tracker: c.tracker || null,
    pidFile: c.pidFile,
    continueWithout: Array.isArray(c.continueWithout) ? c.continueWithout : [],
    emit: (type, data) => { try { return c.events.publish(projectId, type, data); } catch { return 0; } },
    progress: (pct, message) => c.progress(pct, message == null ? null : message, { stage }),
    faults: {
      maybeFail: (point, extra = {}) => faults.maybeFail(point, { settings, project, signal, stage, ...extra }),
      faultFor: (point, extra = {}) => faults.faultFor(point, { settings, project, ...extra }),
    },
    abs: (rel) => store.abs(projectId, rel),
    readJson: (rel) => { const r = fsx.readJsonSafe(store.abs(projectId, rel)); return r.ok ? r.value : null; },
    writeJson: async (rel, obj) => {
      await faults.maybeFail("disk", { settings, project, signal, stage });
      const file = store.abs(projectId, rel);
      fsx.ensureDir(path.dirname(file));
      fsx.writeJsonAtomic(file, obj);
      return rel;
    },
    updateProject: (mutator) => store.update(projectId, mutator, { runId }),
    upstream: (deps) => upstreamFingerprint(project, deps || def.deps),
    trackChild: (child) => { if (typeof c.trackChild === "function") return c.trackChild(child); return () => {}; },
  };
}

async function attemptOnce(def, c, { project, attempt }) {
  const baseCtx = handlerCtx(c, def, { project, attempt, signal: c.signal || null, slot: null, budgetMs: null });
  let rawBudget;
  try { rawBudget = Number(def.budgetMs(baseCtx)); } catch { rawBudget = NaN; }
  const scale = Number(c.settings && c.settings.budgetScale) > 0 ? Number(c.settings.budgetScale) : 1;
  const budgetMs = Math.max(MIN_BUDGET_MS, Math.round((Number.isFinite(rawBudget) && rawBudget > 0 ? rawBudget : DEFAULT_BUDGET_MS) * scale));
  const budgetAc = new AbortController();
  const signal = c.signal ? AbortSignal.any([c.signal, budgetAc.signal]) : budgetAc.signal;
  let timer = null;

  const exec = async (slot) => {
    // The budget starts when the work starts — never while queued for a heavy slot.
    timer = setTimeout(() => budgetAc.abort(new EditError("STAGE_TIMEOUT", { status: 504, errorClass: "resource", retryable: true, stage: def.name })), budgetMs);
    if (def.heavy && slot && slot.waitedMs > 0) c.progress(0, STAGE_MESSAGES[def.name] || null, { stage: def.name });
    const hctx = handlerCtx(c, def, { project, attempt, signal, slot: slot || { lowPriority: false, waitedMs: 0, threads: null }, budgetMs });
    const work = (async () => {
      await faults.maybeFail(`slow:${def.name}`, { settings: c.settings, project, signal, stage: def.name });
      await faults.maybeFail(`crash:${def.name}`, { settings: c.settings, project, signal, stage: def.name });
      return def.run(hctx);
    })();
    return raceAbort(work, signal, c.abortGraceMs);
  };

  try {
    if (def.heavy && c.queue && typeof c.queue.heavy === "function") {
      return await c.queue.heavy(exec, {
        label: `${c.projectId}:${def.name}`,
        signal: c.signal || null,
        onWait: () => c.progress(0, "Waiting for render capacity", { stage: def.name, waiting: true }),
      });
    }
    return await exec(null);
  } catch (e) {
    if (c.signal && c.signal.aborted) throw cancelledError(def.name, c.signal.reason);
    if (budgetAc.signal.aborted) {
      throw new EditError("STAGE_TIMEOUT", { status: 504, errorClass: "resource", retryable: true, stage: def.name, detail: `budget ${budgetMs}ms`, extra: { budgetMs } });
    }
    throw normalizeError(e, { stage: def.name });
  } finally {
    clearTimeout(timer);
  }
}

async function runStage(def, ctxIn) {
  const c = withDefaults(ctxIn);
  const { store, projectId, runId } = c;
  const name = def.name;
  const publish = (type, data) => { try { c.events.publish(projectId, type, data); } catch { /* fail-open */ } };
  const safeWrite = async (p) => {
    try { await p; } catch (e) {
      if (isEditError(e) && e.code === "STALE_RUN" && typeof c.onFenced === "function") c.onFenced();
    }
  };

  let project = store.get(projectId);
  if (!project) throw new EditError("NOT_FOUND", { status: 404, errorClass: "input", stage: name });
  if (c.signal && c.signal.aborted) throw cancelledError(name, c.signal.reason);

  let inputHash;
  const startedAt = c.now();
  const hctx = handlerCtx(c, def, { project, attempt: 0, signal: c.signal || null, slot: null, budgetMs: null });
  try {
    inputHash = await computeInputHash(def, hctx);
    if (def.skip) {
      const why = await def.skip(hctx);
      if (why) {
        const record = { status: "skipped", stageVersion: def.version, inputHash, startedAt, finishedAt: c.now(), durationMs: 0, error: null, attempts: 0, engine: null, fallbacks: [typeof why === "string" ? why.slice(0, 40) : "skipped"] };
        await store.setStage(projectId, name, record, { runId });
        publish("stage", { stage: name, status: "skipped" });
        return { status: "skipped", record };
      }
    }
  } catch (raw) {
    const err = normalizeError(raw, { stage: name });
    if (err.code === "STALE_RUN") throw err;
    await safeWrite(store.setStage(projectId, name, { status: "failed", stageVersion: def.version, finishedAt: c.now(), error: errorSummary(err) }, { runId }));
    await safeWrite(store.addError(projectId, err, { runId }));
    publish("stage", { stage: name, status: "failed", code: err.code });
    throw err;
  }

  const prev = isPlain(project.stages) ? project.stages[name] : null;
  if (!c.force && prev && prev.status === "done") {
    const matches = prev.inputHash === inputHash && prev.stageVersion === def.version;
    let pinned = false;
    if (!matches && def.pinned) {
      try { pinned = !!(await def.pinned(hctx)); } catch { pinned = false; }
    }
    if ((matches || pinned) && await outputsIntact({ abs: (rel) => store.abs(projectId, rel) }, prev.outputs)) {
      publish("stage", { stage: name, status: "done", cached: true, engine: prev.engine || undefined });
      c.log.info(`[video-edit] stage cached project=${projectId} stage=${name} pinned=${pinned}`);
      return { status: "cached", record: prev };
    }
  }

  await store.setStage(projectId, name, {
    status: "running", stageVersion: def.version, inputHash, startedAt, finishedAt: 0, durationMs: 0,
    attempts: 0, error: null, engine: null, fallbacks: [], costUsd: 0,
  }, { runId });
  publish("stage", { stage: name, status: "running" });
  c.progress(0, STAGE_MESSAGES[name] || null, { stage: name, started: true });

  for (let attempt = 1; ; attempt++) {
    project = store.get(projectId) || project;
    try {
      const result = await attemptOnce(def, c, { project, attempt });
      const res = isPlain(result) ? result : {};
      const outputs = await describeOutputs({ projectDir: c.projectDir, abs: (rel) => store.abs(projectId, rel) }, res.outputs, name);
      const fallbacks = Array.isArray(res.fallbacks) ? res.fallbacks.map((f) => String(f).slice(0, 60)).slice(0, 10) : [];
      const costUsd = Number.isFinite(res.costUsd) && res.costUsd > 0 ? res.costUsd : 0;

      if (isPlain(res.discoveries) && Object.keys(res.discoveries).length) {
        await store.setDiscoveries(projectId, res.discoveries, { runId });
        publish("discovery", { stage: name, discoveries: res.discoveries });
      }
      for (const n of Array.isArray(res.notices) ? res.notices.slice(0, 10) : []) {
        await store.addNotice(projectId, { ...n, stage: n && n.stage ? n.stage : name }, { runId });
      }
      if (costUsd > 0) {
        await store.update(projectId, (d) => {
          d.cost = isPlain(d.cost) ? d.cost : { estimateUsd: 0, capUsd: 0, spentUsd: 0, byStage: {} };
          d.cost.spentUsd = (Number(d.cost.spentUsd) || 0) + costUsd;
          d.cost.byStage = isPlain(d.cost.byStage) ? d.cost.byStage : {};
          d.cost.byStage[name] = (Number(d.cost.byStage[name]) || 0) + costUsd;
        }, { runId });
      }

      const finishedAt = c.now();
      const record = {
        status: "done", stageVersion: def.version, inputHash, outputs, engine: res.engine ? String(res.engine).slice(0, 40) : null,
        attempts: attempt, startedAt, finishedAt, durationMs: Math.max(0, finishedAt - startedAt), fallbacks, error: null, costUsd,
      };
      // Checkpoint last (ENGINE.md I4): outputs are on disk and hashed before the record says done.
      await store.setStage(projectId, name, record, { runId });
      await safeWrite(refreshStorageBytes(store, projectId, c.projectDir, runId));
      publish("stage", { stage: name, status: "done", engine: record.engine || undefined, fallback: fallbacks[0] });
      c.progress(100, null, { stage: name, finished: true });
      c.log.info(`[video-edit] stage done project=${projectId} stage=${name} ms=${record.durationMs} attempts=${attempt}`);
      return { status: "done", record, result: res };
    } catch (raw) {
      const err = normalizeError(raw, { stage: name });
      if (err.code === "STALE_RUN") {
        if (typeof c.onFenced === "function") c.onFenced();
        throw err;
      }
      if (err.errorClass === "cancelled" || (c.signal && c.signal.aborted)) {
        const cerr = err.errorClass === "cancelled" ? err : cancelledError(name, c.signal && c.signal.reason);
        await safeWrite(store.setStage(projectId, name, { status: "interrupted", attempts: attempt, finishedAt: c.now(), error: null }, { runId }));
        publish("stage", { stage: name, status: "interrupted", code: cerr.code });
        c.log.info(`[video-edit] stage interrupted project=${projectId} stage=${name} code=${cerr.code}`);
        throw cerr;
      }
      if (err.errorClass === "transient" && attempt < def.maxAttempts) {
        await safeWrite(store.setStage(projectId, name, { attempts: attempt, error: errorSummary(err) }, { runId }));
        publish("stage", { stage: name, status: "retrying", code: err.code, attempt });
        c.log.warn(`[video-edit] stage retry project=${projectId} stage=${name} attempt=${attempt} code=${err.code}`);
        const wait = c.retryBackoffMs[Math.min(attempt - 1, c.retryBackoffMs.length - 1)] || 0;
        try { await abortableSleep(wait, c.signal); }
        catch (reason) {
          const cerr = cancelledError(name, reason);
          await safeWrite(store.setStage(projectId, name, { status: "interrupted", attempts: attempt, finishedAt: c.now() }, { runId }));
          publish("stage", { stage: name, status: "interrupted", code: cerr.code });
          throw cerr;
        }
        continue;
      }
      await safeWrite(store.setStage(projectId, name, {
        status: "failed", attempts: attempt, finishedAt: c.now(), durationMs: Math.max(0, c.now() - startedAt), error: errorSummary(err),
      }, { runId }));
      await safeWrite(store.addError(projectId, err, { runId }));
      publish("stage", { stage: name, status: "failed", code: err.code });
      c.log.warn(`[video-edit] stage failed project=${projectId} stage=${name} attempts=${attempt} code=${err.code} class=${err.errorClass}`);
      throw err;
    }
  }
}

module.exports = {
  createRegistry,
  registerStage: (def) => defaultRegistry.registerStage(def),
  getStage: (name) => defaultRegistry.getStage(name),
  listStages: () => defaultRegistry.listStages(),
  resetRegistry: () => defaultRegistry.resetRegistry(),
  defaultRegistry,
  runStage, computeInputHash, outputsIntact, upstreamFingerprint, descendantsOf, invalidateFrom, normalizeError, refreshStorageBytes,
  GRAPH, PIPELINE_STAGES, RENDER_STAGES, STAGE_MESSAGES, MAX_ATTEMPTS,
};
