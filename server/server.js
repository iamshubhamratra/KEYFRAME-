// Entrypoint. Composes: config -> db -> p-queue -> pipeline -> express -> janitor.
// Elastic Beanstalk invokes `npm start` -> `node server.js`.

const express = require("express");
const path = require("node:path");
const fs = require("node:fs");

const config = require("./src/config");
const db = require("./src/db");
const janitor = require("./src/services/janitor");
const pipeline = require("./src/services/pipeline");
const skills = require("./src/services/skills");
const catalog = require("./src/services/catalog");
const healthRouter = require("./src/routes/health");
const jobsRouter = require("./src/routes/jobs");
const { buildRouter: buildGenerateRouter } = require("./src/routes/generate");

async function loadQueue() {
  // p-queue v6 is CommonJS; v7+ is ESM. Support both.
  const mod = require("p-queue");
  return mod.default || mod;
}

async function main() {
  // Ensure working dirs exist.
  fs.mkdirSync(config.paths.jobsDir, { recursive: true });
  fs.mkdirSync(config.paths.videosDir, { recursive: true });

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

  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", true);
  app.use(express.json({ limit: "64kb" }));

  app.use(healthRouter);
  app.use("/api", jobsRouter);
  app.use("/api", buildGenerateRouter({ enqueue }));

  // Static: frontend + rendered videos.
  const publicDir = path.join(config.paths.root, "public");
  app.use(express.static(publicDir, {
    index: "index.html",
    setHeaders(res, filePath) {
      if (filePath.endsWith(".mp4")) {
        res.setHeader("Cache-Control", "public, max-age=3600");
        res.setHeader("Accept-Ranges", "bytes");
      }
    },
  }));

  // SPA-ish 404 JSON for /api/*.
  app.use("/api", (_req, res) => res.status(404).json({ error: "not found" }));

  const server = app.listen(config.server.port, () => {
    console.log(`[server] listening on :${config.server.port}`);
    console.log(`[server] videosDir=${config.paths.videosDir}`);
    console.log(`[server] jobsDir=${config.paths.jobsDir}`);
    console.log(`[server] model=${config.llm.model}`);
  });

  const stopJanitor = janitor.start();

  // Pre-fetch HyperFrames skill docs + registry catalog in the background so
  // the first composer call doesn't block on GitHub. Non-fatal if either fails.
  skills.warmUp();
  catalog.warmUp();

  // Graceful shutdown: let in-flight renders finish up to 30s.
  function shutdown(signal) {
    console.log(`[server] ${signal} received, shutting down`);
    stopJanitor();
    queue.pause();
    server.close(() => {
      try { db.close(); } catch { /* noop */ }
      process.exit(0);
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
