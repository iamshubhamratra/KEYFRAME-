// KEYFRAME project routes — the script-checkpoint flow.
//
//   POST /api/projects               create; runs intake; pauses at script_review
//   GET  /api/projects/:id           full state incl. brief + script + warnings
//   POST /api/projects/:id/approve   resume production with (edited) script
//   POST /api/projects/:id/regenerate  re-run from "brief" or "script"
//
// Phase 3 turns the create route multipart (video upload + URL ingest); for
// now it accepts JSON with a prompt (and optional websiteUrl, ignored until
// the ingest workers land).

const express = require("express");
const path = require("node:path");
const rateLimit = require("express-rate-limit");
const multer = require("multer");
const { customAlphabet } = require("nanoid");
const config = require("../config");
const db = require("../db");
const frameRegistry = require("../services/frame_registry");
const { validateScript, normalizeScript } = require("../services/script");

const nanoid = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 10);

// Reference-video uploads (multipart). JSON bodies bypass multer entirely.
const VIDEO_MIMES = new Set(["video/mp4", "video/quicktime", "video/webm"]);
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, config.paths.uploadsDir),
    filename: (_req, file, cb) => {
      const ext = (path.extname(file.originalname) || ".mp4").toLowerCase().slice(0, 8);
      cb(null, `${nanoid()}${ext}`);
    },
  }),
  limits: { fileSize: (config.ingest?.maxUploadMb || 200) * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (VIDEO_MIMES.has(file.mimetype)) cb(null, true);
    else cb(new Error(`unsupported video type ${file.mimetype} (mp4/mov/webm only)`));
  },
});

function maybeMultipart(req, res, next) {
  if (req.is("multipart/form-data")) {
    upload.single("referenceVideo")(req, res, (err) => {
      if (err) return res.status(400).json({ error: "upload failed", details: [err.message] });
      next();
    });
  } else {
    next();
  }
}

function clientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length) return xff.split(",")[0].trim();
  return req.ip || req.socket?.remoteAddress || "unknown";
}

function validateCreate(body, { hasUpload = false } = {}) {
  const errs = [];
  const out = {};
  if (typeof body !== "object" || body === null) return { errs: ["body must be JSON object"], out };

  // Multi-modal: at least one of prompt / referenceVideo / websiteUrl.
  out.prompt = "";
  if (typeof body.prompt === "string" && body.prompt.trim()) {
    const p = body.prompt.trim();
    if (p.length < 10) errs.push("prompt, when given, must be at least 10 characters");
    else if (p.length > 4000) errs.push("prompt must be at most 4000 characters");
    else out.prompt = p;
  }

  if (typeof body.websiteUrl === "string" && body.websiteUrl.trim()) {
    const u = body.websiteUrl.trim().slice(0, 2000);
    if (!/^https?:\/\/.+\..+/i.test(u)) errs.push("websiteUrl must be a valid http(s) URL");
    else out.websiteUrl = u;
  }

  if (!out.prompt && !out.websiteUrl && !hasUpload) {
    errs.push("provide at least one of: prompt, websiteUrl, referenceVideo");
  }

  const d = body.duration == null ? 30 : Number(body.duration);
  if (!Number.isFinite(d) || d < config.server.minDurationSec || d > config.server.maxDurationSec) {
    errs.push(`duration must be ${config.server.minDurationSec}-${config.server.maxDurationSec} seconds`);
  } else {
    out.duration = Math.round(d);
  }

  const orientation = body.orientation || config.defaults.orientation;
  if (!config.orientations[orientation]) errs.push(`orientation must be one of: ${Object.keys(config.orientations).join(", ")}`);
  else out.orientation = orientation;

  const quality = body.quality || config.defaults.quality;
  if (!config.qualities[quality]) errs.push(`quality must be one of: ${Object.keys(config.qualities).join(", ")}`);
  else out.quality = quality;

  let fps = body.fps == null ? config.defaults.fps : Number(body.fps);
  if (!config.allowedFps.includes(fps)) errs.push(`fps must be one of: ${config.allowedFps.join(", ")}`);
  else out.fps = fps;

  out.voiceStyle = typeof body.voiceStyle === "string" ? body.voiceStyle.slice(0, 200) : null;
  out.autopilot = body.autopilot === true || body.autopilot === "true";
  out.captions = !(body.captions === false || body.captions === "false"); // default on

  if (body.framePack != null && body.framePack !== "auto") {
    if (typeof body.framePack !== "string" || frameRegistry.resolvePack(body.framePack) == null) {
      errs.push(`framePack must be "auto" or one of: ${frameRegistry.listPacks().join(", ")}`);
    } else {
      out.framePack = body.framePack;
    }
  } else {
    out.framePack = "auto"; // brief suggests; registry default as last resort
  }

  return { errs, out };
}

function buildRouter({ enqueueIntake, enqueueProduction }) {
  const router = express.Router();

  const limiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: config.server.rateLimitPerHourPerIp,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => clientIp(req),
    message: { error: "rate limit exceeded", hint: "try again in an hour" },
  });

  router.post("/projects", limiter, maybeMultipart, (req, res) => {
    const uploadPath = req.file ? req.file.path : null;
    const { errs, out } = validateCreate(req.body || {}, { hasUpload: !!uploadPath });
    if (errs.length) return res.status(400).json({ error: "invalid request", details: errs });

    const since = Date.now() - 24 * 60 * 60 * 1000;
    if (db.countJobsSince(since) >= config.server.dailyJobCap) {
      return res.status(429).json({ error: "daily job cap reached" });
    }

    const dims = config.dimensionsFor(out.orientation, out.quality);
    const jobId = nanoid();

    db.insert({
      id: jobId,
      kind: "project",
      prompt: out.prompt,
      duration: out.duration,
      orientation: out.orientation,
      quality: out.quality,
      width: dims.width,
      height: dims.height,
      fps: out.fps,
      framePack: out.framePack === "auto" ? null : out.framePack,
      voiceStyle: out.voiceStyle,
      autopilot: out.autopilot,
      captionsEnabled: out.captions,
      uploadPath,
      intent: {
        prompt: out.prompt,
        websiteUrl: out.websiteUrl || null,
        hasReferenceVideo: !!uploadPath,
        preferences: {
          duration: out.duration,
          orientation: out.orientation,
          voiceStyle: out.voiceStyle || "auto",
          framePack: out.framePack,
        },
      },
      created_at: Date.now(),
      client_ip: clientIp(req),
    });

    enqueueIntake(jobId);

    res.status(202).json({
      projectId: jobId,
      statusUrl: `/api/projects/${jobId}`,
      autopilot: out.autopilot,
      nextStep: out.autopilot
        ? "pipeline will run end-to-end automatically"
        : "poll statusUrl until status=script_review, then POST .../approve",
    });
  });

  router.get("/projects", (req, res) => {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    res.json({ projects: db.listRecent({ limit: 30, status }) });
  });

  router.get("/projects/:id", (req, res) => {
    if (!/^[0-9a-z]{6,20}$/.test(req.params.id)) return res.status(400).json({ error: "bad id" });
    const job = db.get(req.params.id);
    if (!job) return res.status(404).json({ error: "not found" });
    res.json(job);
  });

  router.post("/projects/:id/approve", (req, res) => {
    if (!/^[0-9a-z]{6,20}$/.test(req.params.id)) return res.status(400).json({ error: "bad id" });
    const raw = db.getRaw(req.params.id);
    if (!raw) return res.status(404).json({ error: "not found" });
    if (raw.status !== "script_review") {
      return res.status(409).json({ error: `project is "${raw.status}", not script_review` });
    }

    // Accept an edited script, or approve the stored draft as-is.
    let script = raw.script;
    if (req.body && req.body.script) {
      script = normalizeScript(req.body.script, { targetDuration: raw.duration });
      const check = validateScript(script, { targetDuration: raw.duration });
      if (!check.ok) {
        return res.status(400).json({ error: "edited script failed validation", details: check.errors, warnings: check.warnings });
      }
    }

    db.markApproved(req.params.id, { script });
    enqueueProduction(req.params.id);
    res.status(202).json({ projectId: req.params.id, status: "queued", statusUrl: `/api/projects/${req.params.id}` });
  });

  router.post("/projects/:id/regenerate", (req, res) => {
    if (!/^[0-9a-z]{6,20}$/.test(req.params.id)) return res.status(400).json({ error: "bad id" });
    const raw = db.getRaw(req.params.id);
    if (!raw) return res.status(404).json({ error: "not found" });
    const from = (req.body && req.body.from) || "script";
    if (!["brief", "script"].includes(from)) {
      return res.status(400).json({ error: 'from must be "brief" or "script"' });
    }
    if (raw.status !== "script_review" && raw.status !== "failed") {
      return res.status(409).json({ error: `project is "${raw.status}"; regenerate only from script_review or failed` });
    }
    if (from === "script" && !raw.brief) {
      return res.status(409).json({ error: "no brief on record; regenerate from=brief instead" });
    }

    db.markRequeued(req.params.id, { clearBrief: from === "brief", progress: `regenerate_${from}` });
    enqueueIntake(req.params.id, { skipBrief: from === "script" });
    res.status(202).json({ projectId: req.params.id, status: "queued", from });
  });

  return router;
}

module.exports = { buildRouter };
