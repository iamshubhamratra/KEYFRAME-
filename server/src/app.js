// The Express application: middleware, API routes, static files and the SPA
// fallback. Building it starts nothing — server.js owns the process (job queue,
// listen, background services), so tests can mount the app with stub queues.

const express = require("express");
const path = require("node:path");
const fs = require("node:fs");
const cookieParser = require("cookie-parser");
const config = require("./config");
const { securityHeaders, cors } = require("./middleware/security");
const { mountRoutes } = require("./routes");

// deps: { enqueue, enqueueIntake, enqueueProduction, videoEdit? }
function createApp(deps) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", true);

  app.use(securityHeaders);
  app.use(cors());

  // Edit ops batches exceed the global 64kb cap; this path-scoped parser runs first
  // (a body it parsed is skipped by the global one) and answers its own 413s as JSON.
  if (deps.videoEdit) app.use("/api/video-edits", deps.videoEdit.jsonBodyParser());
  app.use(express.json({ limit: "64kb" }));
  app.use(cookieParser());

  mountRoutes(app, deps);

  // Static: the built web app (public/dist) takes precedence; public/ serves the
  // rendered videos, frame-pack media and other generated files.
  const publicDir = path.join(config.paths.root, "public");
  const distDir = path.join(publicDir, "dist");
  const spaIndex = path.join(distDir, "index.html");
  const hasSpa = fs.existsSync(spaIndex);
  if (hasSpa) {
    app.use(express.static(distDir, { index: "index.html" }));
    console.log(`[server] serving web app from ${distDir}`);
  }
  app.use(express.static(publicDir, {
    index: false,
    setHeaders(res, filePath) {
      if (filePath.endsWith(".mp4")) {
        res.setHeader("Cache-Control", "public, max-age=3600");
        res.setHeader("Accept-Ranges", "bytes");
      }
    },
  }));

  // Unknown API paths answer JSON, never the SPA shell.
  app.use("/api", (_req, res) => res.status(404).json({ error: "not found" }));

  // SPA history fallback: the web app owns its URLs (/templates, /studio/<id>/…),
  // so a refresh or shared link on one must load index.html and let the client
  // router take it from there. Only page navigations qualify — a path with a file
  // extension is a missing asset and stays a 404.
  if (hasSpa) {
    app.get(/^\/(?!api\/|api$)[^.]*$/, (_req, res) => res.sendFile(spaIndex));
  }

  return app;
}

module.exports = { createApp };
