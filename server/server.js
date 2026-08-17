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
const { buildRouter: buildAdminTemplatesRouter } = require("./src/routes/admin_templates");
const { requireAdmin } = require("./src/auth/middleware");
const cookieParser = require("cookie-parser");

async function loadQueue() {
  // p-queue v6 is CommonJS; v7+ is ESM. Support both.
  const mod = require("p-queue");
  return mod.default || mod;
}

// NATIVE LOAD ORDER — sharp MUST initialise before onnxruntime, or the process dies.
//
// Measured directly on this codebase: requiring `sharp` and then importing
// `@huggingface/transformers` survives; doing it the other way round segfaults with
// `GLib-GObject-CRITICAL: invalid uninstantiatable type (NULL) in cast to GObject`. Both
// pull native image libraries and the second to initialise loses.
//
// Today the graph happens to get this right — `asset_prep` (crop_engine -> sharp) runs before
// `creative_director` (CLIP -> onnxruntime) — but that is an accident of node ordering, not a
// guarantee, and a lazy `require("sharp")` reached first from the CLIP side would take down a
// render with a stack trace pointing at neither. Loading it HERE, at boot, before any request
// can reach either path, makes the order impossible to get wrong.
//
// Non-fatal: a deployment without a working sharp binary keeps running — crop_engine falls back
// to its ffmpeg edge analyzer, which is why that fallback exists.
try {
  require("sharp");
} catch (e) {
  console.warn(`[server] sharp unavailable (${e && e.message ? e.message : e}) — the crop engine will use its ffmpeg fallback`);
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

  // BOOT-TIME RECOVERY, FORCED. Both template stores sweep conservatively (by age) when loaded,
  // because CLI scripts load them too and must never declare the server's in-flight work dead.
  // Here is the one moment that reasoning does not apply: the server is starting, so nothing it
  // owns is running anywhere, and anything still marked in-flight was orphaned by a previous
  // process however recently it died.
  require("./src/templates/store").recoverInterrupted({ force: true });
  require("./src/templates/batch_store").recoverInterrupted({ force: true });

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
  // AN EMPTY ALLOWLIST IS NOT A WILDCARD IN PRODUCTION.
  //
  // This used to echo ANY request Origin back with Access-Control-Allow-Credentials: true
  // whenever WEB_ORIGIN was unset — and render.yaml left it unset. Combined with the httpOnly
  // session cookie that is a textbook cross-site request forgery surface: any page on the web
  // could call this API with the visitor's session attached and read the response. Harmless-ish
  // when the API was keyless and read-only; not harmless now that it carries an authenticated
  // admin surface that can publish templates.
  //
  // Development keeps the permissive behaviour, because the Vite dev server runs on a different
  // port and requiring WEB_ORIGIN to be set before anything works locally is a bad trade. In
  // production an unset WEB_ORIGIN now means "same-origin only", which is exactly right for the
  // all-in-one deploy and fails loudly (a CORS error in the browser console, not a silent
  // security hole) for a split deploy that forgot to configure it.
  const PROD = process.env.NODE_ENV === "production";
  if (PROD && corsAllow.length === 0) {
    console.warn("[server] WEB_ORIGIN is unset in production — cross-origin requests are refused (same-origin only). Set WEB_ORIGIN for a split frontend/API deploy.");
  }
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    const allowed = corsAllow.length ? corsAllow.includes(origin) : !PROD;
    if (origin && allowed) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      // PATCH and DELETE are here for the admin template API (edit metadata, delete a draft).
      // Without them a split frontend/API deploy passes the preflight for GET/POST and fails it
      // for exactly those two, so the admin dashboard half-works — the failure a same-origin dev
      // setup can never reproduce, because same-origin requests are not preflighted at all.
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
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
  // ADMIN — template creation, QA and publishing. Every route inside is behind requireAdmin
  // (applied with router.use, so a route added later is protected by default). Mounted under
  // its own /api/admin prefix so it is trivially auditable: everything under that path is
  // privileged, everything outside it is not.
  app.use("/api/admin", buildAdminTemplatesRouter({ enqueueIntake }));

  // ADMIN WORKING ARTIFACTS — the preview stills for templates that are not published yet.
  //
  // GUARDED, not public. These are frames of unpublished designs; serving them from the open
  // static mount would make an admin's draft work fetchable by anyone who guessed a slug, which
  // is the same leak the whole draft/published split exists to prevent — just through a
  // different door. Same-origin <img> requests carry the session cookie, so the admin UI renders
  // them normally.
  //
  // It also lives OUTSIDE jobsDir and videosDir on purpose: services/janitor.js deletes any
  // directory under jobs/ older than an hour with no db record, and evicts videos past a 24h TTL
  // and a 500MB cap. Template artifacts have to survive an admin thinking it over for a day.
  app.use("/template-work", requireAdmin, express.static(path.join(config.paths.root, "template_work"), {
    index: false,
    setHeaders(res) { res.setHeader("Cache-Control", "private, max-age=60"); },
  }));

  // Static: the built KEYFRAME web app (public/dist) takes precedence;
  // public/ still serves rendered videos and the legacy v1 UI.
  const publicDir = path.join(config.paths.root, "public");
  const distDir = path.join(publicDir, "dist");
  if (fs.existsSync(path.join(distDir, "index.html"))) {
    // SPA CACHING, THE TWO-RULE VERSION. express.static's default is `max-age=0` for
    // everything, which is wrong in both directions at once: it makes the browser
    // re-download 500 KB of content-hashed JS on every visit, while still permitting a
    // heuristically-cached index.html to keep pointing at a bundle name that no longer
    // exists — so a frontend change can be live on disk, served correctly by curl, and
    // invisible in the browser until someone thinks to hard-refresh. That is exactly the
    // shape of "I rebuilt it and still see the old UI".
    //
    //   index.html  — never cached. It is the map to everything else and it is 1 KB.
    //   /assets/*   — cached forever. Vite content-hashes the filename, so a changed file
    //                 is a different URL and can never be served stale.
    app.use(express.static(distDir, {
      index: "index.html",
      setHeaders(res, filePath) {
        if (filePath.endsWith("index.html")) {
          res.setHeader("Cache-Control", "no-cache, must-revalidate");
        } else if (/[\\/]assets[\\/]/.test(filePath)) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        }
      },
    }));
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

  try { require("./src/services/frame_manifest").validateAll(); } catch (e) { console.warn(`[manifest] boot validation skipped: ${e.message}`); }

  const server = app.listen(config.server.port, () => {
    console.log(`[server] listening on :${config.server.port}`);
    console.log(`[server] videosDir=${config.paths.videosDir}`);
    console.log(`[server] jobsDir=${config.paths.jobsDir}`);
    console.log(`[server] llm=kie:${config.llm.primary.model} heavy=${JSON.stringify(config.llm.primary.stageModels || {})}`);
    // Verify the director / stage model ids resolve at the provider. Non-blocking:
    // a bad id otherwise silently fails-open at runtime (see model_health.js).
    require("./src/services/model_health").checkModels().catch(() => {});
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
