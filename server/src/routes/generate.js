// POST /api/generate — validate input, enforce caps, enqueue job, return jobId.

const express = require("express");
const rateLimit = require("express-rate-limit");
const { clientIp } = require("../services/client_ip");
const { requireAuth } = require("../auth/middleware");
const { customAlphabet } = require("nanoid");
const config = require("../config");
const db = require("../db");
const { estimateEta } = require("../services/eta");

const nanoid = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 10);

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

  // Subtitles/captions are OPT-IN (default off) — users overwhelmingly dislike
  // burnt-in subtitles on short promo videos.
  out.captions = body.captions === true;

  // Visual-asset flags (all optional, default false).
  out.images = body.images === true;
  out.video = body.video === true;

  // Three.js/WebGL cinematic composer (opt-in). Default off → scene-kit.
  out.render3d = body.render3d === true || body.threeD === true;

  // Optional voice override for TTS.
  const { VALID_VOICES } = require("../services/audio_planner");
  if (body.voice != null) {
    if (typeof body.voice !== "string" || !VALID_VOICES.has(body.voice)) {
      errs.push(`voice must be one of: ${[...VALID_VOICES].join(", ")}`);
    } else {
      out.voice = body.voice;
    }
  }

  // Frame pack (design system). An explicit pack is STRICT (honored verbatim
  // through the whole pipeline). Omitted or "auto" stays null so the brief's
  // tone-matched suggestion picks the pack (pre-resolving to the default here
  // used to send every "auto" video to the same pack).
  const frameRegistry = require("../services/frame_registry");
  if (body.framePack != null && body.framePack !== "auto") {
    if (typeof body.framePack !== "string" || frameRegistry.resolvePack(body.framePack) == null) {
      errs.push(`framePack must be "auto" or one of: ${frameRegistry.listPacks().join(", ")}`);
    } else {
      out.framePack = body.framePack;
    }
  } else {
    out.framePack = null; // auto — resolved from the brief after intake
  }

  // Brand palette (optional). SAME shape + validation as /api/projects: an explicit
  // user pick that steers the composition's accents. Kept as its own field, never
  // laundered through the brief model. Absent/empty is NOT an error. Without this, the
  // /api/generate path had no way to receive a palette at all, so it rendered every
  // pack unbranded (the composers' no-op path).
  let bp = body.brandPalette;
  if (typeof bp === "string" && bp.trim() !== "") {
    try { bp = JSON.parse(bp); } catch { errs.push("brandPalette must be JSON"); bp = null; }
  }
  if (bp && typeof bp === "object") {
    const hex = (v) => (/^#[0-9a-fA-F]{6}$/.test(String(v || "")) ? String(v).toLowerCase() : null);
    const primary = hex(bp.primary);
    if (!primary) errs.push("brandPalette.primary must be #RRGGBB");
    else out.brandPalette = {
      v: 1, primary, secondary: hex(bp.secondary), accent: hex(bp.accent),
      source: ["manual", "preset", "website", "logo"].includes(bp.source) ? bp.source : "manual",
      presetId: typeof bp.presetId === "string" ? bp.presetId.slice(0, 32) : null,
      raw: Array.isArray(bp.raw) ? bp.raw.map(hex).filter(Boolean).slice(0, 6) : [],
    };
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

  // THE OLDER DOOR ONTO THE SAME STORE. /api/generate writes into the very db that
  // /api/projects reads, so leaving it open would have meant anonymous callers could still
  // create jobs — and jobs with no owner are invisible to their creator under the new rules,
  // which makes an unauthenticated create a way to write records nobody can ever reach.
  router.post("/generate", requireAuth, limiter, async (req, res) => {
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
      userId: req.userId,
      prompt: out.prompt,
      duration: out.duration,
      orientation: out.orientation,
      quality: out.quality,
      width: dims.width,
      height: dims.height,
      fps: out.fps,
      framePack: out.framePack,
      brandPalette: out.brandPalette || null,
      captions: out.captions,
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
      render3d: out.render3d,
      framePack: out.framePack,
      brandPalette: out.brandPalette || null,
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
