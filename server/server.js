// Entrypoint — owns the PROCESS: config -> job store -> p-queue -> pipelines ->
// Express app (src/app.js) -> listen -> background services -> graceful shutdown.
// Elastic Beanstalk invokes `npm start` -> `node server.js`.

const fs = require("node:fs");

const config = require("./src/config");
const jobs = require("./src/models/job");
const { createApp } = require("./src/app");
const janitor = require("./src/services/janitor");
const pipeline = require("./src/services/pipeline");
const projectPipeline = require("./src/services/project_pipeline");
const skills = require("./src/services/skills");
const pixabayBridgeDaemon = require("./src/services/pixabay_bridge_daemon");
const catalog = require("./src/services/catalog");
const { scheduleProviderSelfTest } = require("./src/services/provider_selftest");

// AI Video Edit mode (src/video_edit): its own private store, queue and routes under
// /api/video-edits. Loaded defensively — a broken edit module must never take template
// generation down (the module itself answers 503 when it cannot initialize).
let videoEdit = null;
try { videoEdit = require("./src/video_edit"); } catch (e) { console.error(`[video-edit] module load failed: ${e.message}`); }

async function loadQueue() {
  // p-queue v6 is CommonJS; v7+ is ESM. Support both.
  const mod = require("p-queue");
  return mod.default || mod;
}

// Pre-import lazily-loaded ESM packages at boot. Under `node --watch`, a
// runtime dynamic import() adds new files to the watch set and the watcher
// RESTARTS the process — which killed the server at production start
// (langgraph via agents/graph.js, transformers via asset_clip.js) and
// crash-looped every in-flight project job. Boot-time imports are safe
// (verified: watcher treats them as baseline). Fire-and-forget: neither
// package is needed before a job runs, and absence is non-fatal.
Promise.allSettled([
  import("@langchain/langgraph"),
  import("@huggingface/transformers"),
]).then((r) => {
  const failed = r.filter((x) => x.status === "rejected").length;
  console.log(`[server] lazy ESM preload done${failed ? ` (${failed} unavailable)` : ""}`);
});

async function main() {
  // Ensure working dirs exist.
  fs.mkdirSync(config.paths.jobsDir, { recursive: true });
  fs.mkdirSync(config.paths.videosDir, { recursive: true });
  fs.mkdirSync(config.paths.uploadsDir, { recursive: true });

  // Connect to Mongo (auth store) up front so a bad MONGODB_URI shows up in
  // boot logs immediately, not on some user's first signup. Non-fatal — like
  // SECRET_KEY, a misconfigured deploy should still serve everything that
  // isn't auth rather than crash-loop the whole app.
  try {
    await require("./src/services/mongo").connect();
  } catch (e) {
    console.warn(`[server] Mongo connect failed at boot (auth will error until fixed): ${e.message}`);
  }

  const PQueue = await loadQueue();
  const concurrency = Math.max(1, Number(config.server.jobConcurrency) || 1);
  const queue = new PQueue({ concurrency });
  console.log(`[server] detected ${config.server.detectedCpus} vCPUs, ${config.server.detectedMemoryMb} MB RAM`);
  console.log(`[server] job concurrency = ${concurrency}, render workers = ${config.server.renderWorkers}`);

  function enqueue(task) {
    queue.add(() => pipeline.runJob(task)).catch((e) => {
      console.error(`[queue] unhandled pipeline error: ${e.message}`);
    });
  }

  function enqueueProduction(jobId) {
    const run = config.orchestrator === "langgraph"
      ? () => require("./src/agents/graph").runProductionGraph({ jobId })
      : () => projectPipeline.runProduction({ jobId });
    queue.add(run).catch((e) => {
      console.error(`[queue] unhandled production error: ${e.message}`);
    });
  }

  function enqueueIntake(jobId, opts = {}) {
    queue.add(() => projectPipeline.runIntake({
      jobId,
      skipBrief: opts.skipBrief === true,
      onApproved: enqueueProduction, // autopilot resumes automatically
    })).catch((e) => {
      console.error(`[queue] unhandled intake error: ${e.message}`);
    });
  }

  // Resume jobs orphaned by a restart (node --watch restarts on every source
  // save; without this, each restart failed all in-flight takes).
  for (const entry of jobs.takeOrphanedTasks()) {
    if (entry.kind === "project") {
      console.log(`[server] requeuing orphaned project ${entry.jobId} (${entry.phase}) after restart`);
      if (entry.phase === "production") enqueueProduction(entry.jobId);
      else enqueueIntake(entry.jobId);
    } else {
      console.log(`[server] requeuing orphaned job ${entry.task.jobId} after restart`);
      enqueue(entry.task);
    }
  }

  const app = createApp({ enqueue, enqueueIntake, enqueueProduction, videoEdit });

  try { require("./src/services/frame_manifest").validateAll(); } catch (e) { console.warn(`[manifest] boot validation skipped: ${e.message}`); }

  const server = app.listen(config.server.port, () => {
    console.log(`[server] listening on :${config.server.port}`);
    console.log(`[server] videosDir=${config.paths.videosDir}`);
    console.log(`[server] jobsDir=${config.paths.jobsDir}`);
    console.log(`[server] model=${config.llm.model}`);
  });

  const stopJanitor = janitor.start();
  // Edit store init, boot recovery (requeue from checkpoints) and retention sweeps. Never throws.
  const stopVideoEdit = videoEdit ? videoEdit.start() : () => Promise.resolve();

  scheduleProviderSelfTest();
  // Pre-fetch HyperFrames skill docs + registry catalog in the background so
  // the first composer call doesn't block on GitHub. Non-fatal if either fails.
  skills.warmUp();
  catalog.warmUp();
  // Keep the Pixabay bridge (audio + vectors source) alive. Audio is
  // Pixabay-only by default, so a dead bridge = synth-pad music; auto-start it.
  pixabayBridgeDaemon.warmUp();

  // Graceful shutdown: let in-flight renders finish up to 30s.
  function shutdown(signal) {
    console.log(`[server] ${signal} received, shutting down`);
    stopJanitor();
    queue.pause();
    // Aborts edit runs, kills their ffmpeg children and closes SSE streams (so server.close can finish).
    const editsStopped = Promise.resolve().then(() => stopVideoEdit()).catch(() => {});
    server.close(() => {
      editsStopped.finally(() => {
        try { jobs.close(); } catch { /* noop */ }
        process.exit(0);
      });
    });
    setTimeout(() => process.exit(0), 30_000).unref();
  }
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT",  () => shutdown("SIGINT"));

  process.on("uncaughtException", (e) => {
    console.error("[uncaughtException]", e);
  });
  process.on("unhandledRejection", (e) => {
    console.error("[unhandledRejection]", e);
  });
}

main().catch((e) => {
  console.error("[server] fatal boot error:", e);
  process.exit(1);
});
