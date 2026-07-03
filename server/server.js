// Entrypoint. Composes: config -> db -> p-queue -> pipeline -> express -> janitor.
// Elastic Beanstalk invokes `npm start` -> `node server.js`.

const express = require("express");
const path = require("node:path");
const fs = require("node:fs");

const config = require("./src/config");
const db = require("./src/db");
const janitor = require("./src/services/janitor");
const pipeline = require("./src/services/pipeline");
const projectPipeline = require("./src/services/project_pipeline");
const skills = require("./src/services/skills");
const catalog = require("./src/services/catalog");
const healthRouter = require("./src/routes/health");
const jobsRouter = require("./src/routes/jobs");
const framesRouter = require("./src/routes/frames");
const { buildRouter: buildGenerateRouter } = require("./src/routes/generate");
const { buildRouter: buildProjectsRouter } = require("./src/routes/projects");
const { buildRouter: buildAuthRouter } = require("./src/routes/auth");
const cookieParser = require("cookie-parser");

async function loadQueue() {
  // p-queue v6 is CommonJS; v7+ is ESM. Support both.
  const mod = require("p-queue");
  return mod.default || mod;
}

async function main() {
  // Ensure working dirs exist.
  fs.mkdirSync(config.paths.jobsDir, { recursive: true });
  fs.mkdirSync(config.paths.videosDir, { recursive: true });
  fs.mkdirSync(config.paths.uploadsDir, { recursive: true });

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

  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", true);

  // Baseline security headers. SAMEORIGIN still permits the studio's own
  // same-origin design.html landing iframe while blocking cross-origin framing
  // (clickjacking). nosniff + Referrer-Policy are safe defaults for a keyless,
  // cookieless API + static SPA.
  app.use((_req, res, next) => {
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    next();
  });

  // CORS — for split deploys the frontend (e.g. Vercel) is a different origin
  // than this API (e.g. Render). WEB_ORIGIN is a comma-separated allowlist of
  // permitted origins; if unset, any origin is allowed (the API is keyless,
  // read + create only, no cookies). Same-origin all-in-one deploys never hit this.
  const corsAllow = (process.env.WEB_ORIGIN || "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && (corsAllow.length === 0 || corsAllow.includes(origin))) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      // Auth uses an httpOnly JWT cookie; cross-origin requests must be allowed
      // to send/receive it (frontend uses fetch credentials:"include").
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Max-Age", "86400");
    }
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  app.use(express.json({ limit: "64kb" }));
  app.use(cookieParser());

  app.use(healthRouter);
  app.use("/api/auth", buildAuthRouter());
  app.use("/api", jobsRouter);
  app.use("/api", framesRouter);
  app.use("/api", buildGenerateRouter({ enqueue }));
  app.use("/api", buildProjectsRouter({ enqueueIntake, enqueueProduction }));

  // Static: the built KEYFRAME web app (public/dist) takes precedence;
  // public/ still serves rendered videos and the legacy v1 UI.
  const publicDir = path.join(config.paths.root, "public");
  const distDir = path.join(publicDir, "dist");
  if (fs.existsSync(path.join(distDir, "index.html"))) {
    app.use(express.static(distDir, { index: "index.html" }));
    console.log(`[server] serving web app from ${distDir}`);
  }
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
