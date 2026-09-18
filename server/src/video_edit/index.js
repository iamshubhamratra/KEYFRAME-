// VIDEO EDIT SUBSYSTEM ENTRY — the two hooks server.js calls, and nothing that can take boot down.
//
// WHY THIS EXISTS. server.js is shared with the template pipeline and carries uncommitted work, so the
// AI Video Edit mode plugs in through a minimal surface (API.md §1): `buildRouter()` for the
// `/api/video-edits` mount and `start()` → `stop()` for lifecycle. Both are fail-closed for the feature
// and fail-open for the server: if settings are invalid, the store cannot initialize or a module fails
// to load, the router still mounts and answers 503 EDITS_DISABLED{reason} (health says why), and
// start() logs and returns a no-op stop. Template generation never notices.
//
// Wiring: one runtime per process — resolved settings, the store, the event bus, the job queue, the
// pipeline runner, retention (deletion + sweeps) and the open-stream registry shared by the router and
// retention (a delete must close media streams before moving the directory). Tests inject any of these
// through buildRouter(deps) and never touch the singletons.
//
// CONTRACT:
//   buildRouter(deps = {}) -> express.Router   (never throws; see routes.buildRouter for deps)
//   start({ log }) -> stop()                   (idempotent; never throws) — store.init, boot recovery,
//        retention every 10 min; stop() -> Promise: stops retention, closes streams, runner.stopAll
//        (aborts runs, kills children), flushes the store
//   getRuntime() -> the runtime used by the latest buildRouter()/start() (tests)
//   errorHandler({ log }) -> JSON error middleware; mount at the prefix AFTER the router so errors
//        raised before it (the prefix express.json 413) are JSON too
//   jsonBodyParser({ limit = "256kb" }) -> express.json that answers its own errors as JSON

const express = require("express");
const { EditError, toErrorBody } = require("./errors");

const RETENTION_INTERVAL_MS = 10 * 60 * 1000;
const CORE_KEYS = ["settings", "store", "events", "queue", "runner", "engine", "retention", "streams", "renders"];

let defaultRuntime = null;
let lastRuntime = null;
let started = null;

const say = (log, level, msg) => { try { const l = log || console; (l[level] || l.log || console.log).call(l, msg); } catch { /* noop */ } };
const errCode = (e) => (e && typeof e.code === "string" ? e.code.slice(0, 64) : "INTERNAL");

function createRuntime(overrides = {}, log = console) {
  const rt = { error: null, settings: null, store: null, events: null, queue: null, runner: null, renders: null, retention: null, streams: null };
  try {
    rt.settings = overrides.settings || require("./settings").getSettings();
    if (!rt.settings || !rt.settings.enabled) {
      rt.error = (rt.settings && rt.settings.disabledReason) || "DISABLED_BY_CONFIG";
      return rt;
    }
    const isolated = CORE_KEYS.some((k) => overrides[k]);
    const { createStore, getStore } = require("./store");
    rt.store = overrides.store || (isolated ? createStore({ settings: rt.settings, log }) : getStore());
    const { createEventBus, getEventBus } = require("./events");
    rt.events = overrides.events || (isolated ? createEventBus({ store: rt.store, settings: rt.settings }) : getEventBus());
    rt.queue = overrides.queue || require("./engine/queue").createQueue({ settings: rt.settings });
    // Render jobs share the pipeline's lane and heavy slots; the pipeline's automatic first render runs inline
    // (afterPipeline) so the analysis screen shows it as the last stages of the same job.
    rt.renders = overrides.renders || require("./engine/render_jobs").createRenderJobs({
      store: rt.store, queue: rt.queue, events: rt.events, settings: rt.settings, log,
      pidFile: rt.settings.paths ? require("node:path").join(rt.settings.paths.runtimeDir, "pids.json") : undefined,
    });
    const autoRender = async (ctx) => {
      const p = rt.store.get(ctx.projectId);
      if (!p || (p.settings && p.settings.autoRender === false)) return;
      await rt.renders.runInline(ctx.projectId, { signal: ctx.signal, progress: ctx.progress, markStage: ctx.markStage });
    };
    rt.runner = overrides.runner || overrides.engine || require("./engine/runner").createRunner({ store: rt.store, queue: rt.queue, events: rt.events, settings: rt.settings, log, afterPipeline: autoRender });
    rt.streams = overrides.streams || require("./routes").createStreamRegistry();
    const closeStreams = (id) => rt.streams.closeProject(id);
    // Retention and deletion must treat a running render like a running pipeline (busy; abort waits for ffmpeg).
    const engines = {
      isActive: (id) => rt.runner.isActive(id) || !!(rt.renders && rt.renders.isActive(id)),
      abort: async (id, opts) => {
        const a = rt.renders ? await rt.renders.abortProject(id, { waitMs: (opts && opts.waitMs) || 10000 }) : false;
        const b = await rt.runner.abort(id, opts);
        return a || b;
      },
    };
    if (overrides.retention) {
      rt.retention = overrides.retention;
      if (typeof rt.retention.setCloseStreams === "function") rt.retention.setCloseStreams(closeStreams);
    } else {
      rt.retention = require("./retention").createRetention({ store: rt.store, settings: rt.settings, runner: engines, log, closeStreams });
    }
  } catch (e) {
    say(log, "error", `[video-edit] runtime init failed code=${errCode(e)}`);
    rt.error = "INIT_FAILED";
  }
  return rt;
}

function getDefaultRuntime(log) {
  if (!defaultRuntime) defaultRuntime = createRuntime({}, log);
  return defaultRuntime;
}

function disabledRouter(reason) {
  const router = express.Router();
  router.get("/health", (req, res) => {
    res.set("Cache-Control", "no-store").json({
      enabled: false, reason,
      ffmpeg: { ok: false, version: null },
      providers: { openrouterStt: false, kieStt: false, vision: false, breakers: { openrouter: "closed", kie: "closed" } },
      queue: { depth: 0, active: 0, heavyWaiting: 0 }, diskFreeMb: null, storageUsedMb: null, faultsActive: false,
    });
  });
  router.use((req, res) => {
    const err = new EditError("EDITS_DISABLED", { status: 503, errorClass: "config", retryable: false, extra: { reason } });
    res.status(503).set("Cache-Control", "no-store").json(toErrorBody(err, null));
  });
  router.videoEdit = { disabled: true, reason };
  return router;
}

function buildRouter(deps = {}) {
  const log = deps.log || console;
  let rt;
  try {
    rt = CORE_KEYS.some((k) => deps[k]) ? createRuntime(deps, log) : getDefaultRuntime(log);
  } catch (e) {
    say(log, "error", `[video-edit] runtime init crashed code=${errCode(e)}`);
    rt = { error: "INIT_FAILED" };
  }
  lastRuntime = rt;
  if (rt.error) {
    say(log, "warn", `[video-edit] router disabled reason=${rt.error}`);
    return disabledRouter(rt.error);
  }
  try {
    return require("./routes").buildRouter({
      ...deps, settings: rt.settings, store: rt.store, events: rt.events, queue: rt.queue, runner: rt.runner,
      renders: rt.renders, retention: rt.retention, streams: rt.streams, log,
    });
  } catch (e) {
    say(log, "error", `[video-edit] router build failed code=${errCode(e)}`);
    return disabledRouter("INIT_FAILED");
  }
}

function start({ log = console } = {}) {
  if (started) return started.stop;
  let stopRetention = () => {};
  let stopPromise = null;
  let rt = null;
  const stop = function stopVideoEdit({ timeoutMs = 10 * 1000 } = {}) {
    if (stopPromise) return stopPromise;
    stopPromise = (async () => {
      try { stopRetention(); } catch { /* noop */ }
      if (!rt || rt.error) return;
      try { rt.streams.closeAll(); } catch { /* noop */ }
      try { await Promise.all([rt.runner.stopAll({ timeoutMs }), rt.renders ? rt.renders.stopAll({ timeoutMs }) : null]); } catch (e) { say(log, "warn", `[video-edit] stop runner failed code=${errCode(e)}`); }
      try { rt.store.flush(); } catch { /* noop */ }
    })();
    return stopPromise;
  };
  started = { stop };
  try {
    rt = getDefaultRuntime(log);
    lastRuntime = rt;
    if (rt.error) {
      say(log, "warn", `[video-edit] not started reason=${rt.error}`);
      return stop;
    }
    rt.store.init();
    rt.recovery = Promise.resolve()
      .then(() => require("./recovery").recover({
        store: rt.store, runner: rt.runner, renders: rt.renders, settings: rt.settings, log,
        deleteProject: (id) => rt.retention.deleteProjectData(id, { actor: "recovery" }),
      }))
      .catch((e) => { say(log, "error", `[video-edit] recovery crashed code=${errCode(e)}`); return null; });
    stopRetention = rt.retention.start({ intervalMs: RETENTION_INTERVAL_MS });
    require("./engine/proc").toolVersions()
      .then((v) => { if (!v || !v.ffmpeg || !v.ffprobe) say(log, "warn", "[video-edit] ffmpeg/ffprobe not found; uploads answer 503 until installed"); })
      .catch(() => {});
    say(log, "info", "[video-edit] started");
  } catch (e) {
    say(log, "error", `[video-edit] start failed code=${errCode(e)}`);
  }
  return stop;
}

function getRuntime() { return lastRuntime; }

function errorHandler({ log = console } = {}) {
  return require("./routes").jsonErrorHandler({ log });
}

function jsonBodyParser({ limit = "256kb", log = console } = {}) {
  const parse = express.json({ limit });
  const onError = require("./routes").jsonErrorHandler({ log });
  return function videoEditJson(req, res, next) {
    parse(req, res, (err) => (err ? onError(err, req, res, next) : next()));
  };
}

module.exports = { buildRouter, start, getRuntime, errorHandler, jsonBodyParser };
