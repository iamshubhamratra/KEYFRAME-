// POST /api/generate — validate input, enforce caps, enqueue job, return jobId.

const express = require("express");
const rateLimit = require("express-rate-limit");
const { customAlphabet } = require("nanoid");
const config = require("../config");
const db = require("../db");
const { estimateEta } = require("../services/eta");

const nanoid = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 10);

function clientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length) return xff.split(",")[0].trim();
  return req.ip || req.socket?.remoteAddress || "unknown";
}

function validateBody(body) {
  const errs = [];
  const out = {};

  if (typeof body !== "object" || body === null) return { errs: ["body must be JSON object"], out };

  if (typeof body.prompt !== "string") errs.push("prompt must be a string");
  else {
    const p = body.prompt.trim();
    if (p.length < 10) errs.push("prompt must be at least 10 characters");
    else if (p.length > 2000) errs.push("prompt must be at most 2000 characters");
    else out.prompt = p;
  }

  const d = Number(body.duration);
  if (!Number.isFinite(d)) errs.push("duration must be a number");
  else if (d < config.server.minDurationSec) errs.push(`duration must be >= ${config.server.minDurationSec}`);
  else if (d > config.server.maxDurationSec) errs.push(`duration must be <= ${config.server.maxDurationSec}`);
  else out.duration = Math.round(d);

  const orientation = body.orientation || config.defaults.orientation;
  if (!config.orientations[orientation]) {
    errs.push(`orientation must be one of: ${Object.keys(config.orientations).join(", ")}`);
  } else {
    out.orientation = orientation;
  }

  const quality = body.quality || body.resolution || config.defaults.quality;
  if (!config.qualities[quality]) {
    errs.push(`quality must be one of: ${Object.keys(config.qualities).join(", ")}`);
  } else {
    out.quality = quality;
  }

  let fps = body.fps == null ? config.defaults.fps : Number(body.fps);
  if (!config.allowedFps.includes(fps)) {
    errs.push(`fps must be one of: ${config.allowedFps.join(", ")}`);
  } else {
    out.fps = fps;
  }

  // Audio flags (all optional, default false).
  out.tts = body.tts === true;
  out.music = body.music === true;
  out.soundEffect = body.sound_effect === true || body.soundEffect === true;

  // Visual-asset flags (all optional, default false).
  out.images = body.images === true;
  out.video = body.video === true;

  // Optional voice override for TTS.
  const { VALID_VOICES } = require("../services/audio_planner");
  if (body.voice != null) {
    if (typeof body.voice !== "string" || !VALID_VOICES.has(body.voice)) {
      errs.push(`voice must be one of: ${[...VALID_VOICES].join(", ")}`);
    } else {
      out.voice = body.voice;
    }
  }

  return { errs, out };
}

function buildRouter({ enqueue }) {
  const router = express.Router();

  const limiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: config.server.rateLimitPerHourPerIp,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => clientIp(req),
    message: { error: "rate limit exceeded", hint: "try again in an hour" },
  });

  router.post("/generate", limiter, async (req, res) => {
    const { errs, out } = validateBody(req.body || {});
    if (errs.length) return res.status(400).json({ error: "invalid request", details: errs });

    // Global daily cap.
    const since = Date.now() - 24 * 60 * 60 * 1000;
    const count = db.countJobsSince(since);
    if (count >= config.server.dailyJobCap) {
      return res.status(429).json({ error: "daily job cap reached", capacity: config.server.dailyJobCap });
    }

    const dims = config.dimensionsFor(out.orientation, out.quality);
    const jobId = nanoid();

    db.insert({
      id: jobId,
      prompt: out.prompt,
      duration: out.duration,
      orientation: out.orientation,
      quality: out.quality,
      width: dims.width,
      height: dims.height,
      fps: out.fps,
      created_at: Date.now(),
      client_ip: clientIp(req),
    });

    enqueue({
      jobId,
      prompt: out.prompt,
      duration: out.duration,
      orientation: out.orientation,
      quality: out.quality,
      width: dims.width,
      height: dims.height,
      fps: out.fps,
      tts: out.tts,
      music: out.music,
      soundEffect: out.soundEffect,
      voice: out.voice,
      images: out.images,
      video: out.video,
    });

    // Queue state *after* this insert; subtract 1 so the count represents jobs AHEAD of mine.
    const jobsAhead = Math.max(0, db.queueDepth() - 1);
    const eta = estimateEta({
      duration: out.duration,
      orientation: out.orientation,
      resolutionQuality: out.quality,
      renderQuality: config.server.renderQuality,
      cpus: config.server.detectedCpus,
      jobsAhead,
      concurrency: config.server.jobConcurrency,
    });

    return res.status(202).json({
      jobId,
      statusUrl: `/api/jobs/${jobId}`,
      jobsAhead,
      concurrency: config.server.jobConcurrency,
      estimatedRenderSec: eta.renderSec,
      estimatedWaitSec: eta.waitSec,
      estimatedTotalSec: eta.totalSec,
    });
  });

  return router;
}

module.exports = { buildRouter };
