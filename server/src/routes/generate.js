// POST /api/generate — validate input, scope gate, enforce caps, enqueue job, return jobId.

const express = require("express");
const rateLimit = require("express-rate-limit");
const { customAlphabet } = require("nanoid");
const config = require("../config");
const db = require("../db");
const { estimateEta } = require("../services/eta");
const pacing = require("../services/pacing");
const {
  analyzeScope, forClient: scopeForClient, reduce: reduceScope, logDecision,
} = require("../services/prompt_scope");
const { GENERATE_PROMPT_CHARS } = require("../services/keyframe_capabilities");
const { parseClarification, mergeClarification, clientDisconnectSignal } = require("./projects");

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

  // The length bounds are read from the capability catalog, not written here: a refusal
  // from this endpoint tells the caller "send a prompt of 10 to 2000 characters", and that
  // sentence and this check must be the same numbers (see GENERATE_PROMPT_CHARS).
  const { min: PROMPT_MIN, max: PROMPT_MAX } = GENERATE_PROMPT_CHARS;
  if (typeof body.prompt !== "string") errs.push("prompt must be a string");
  else {
    const p = body.prompt.trim();
    if (p.length < PROMPT_MIN) errs.push(`prompt must be at least ${PROMPT_MIN} characters`);
    else if (p.length > PROMPT_MAX) errs.push(`prompt must be at most ${PROMPT_MAX} characters`);
    else out.prompt = p;
  }

  // CLARIFICATION — the answer to the scope gate's one question, read and merged by the
  // same helpers as POST /api/projects (routes/projects.js), so a 422 NEEDS_CLARIFICATION
  // from this endpoint is answerable rather than a dead end. Judged against THIS route's
  // prompt cap. A prompt is mandatory here, so there is never an empty original for an
  // answer to stand in for.
  {
    const { clarification, error } = parseClarification(body.clarification);
    if (error) errs.push(error);
    else if (clarification && out.prompt) {
      const merged = mergeClarification(out.prompt, clarification);
      if (merged.length > PROMPT_MAX) errs.push(`prompt and clarification together must be at most ${PROMPT_MAX} characters`);
      else { out.prompt = merged; out.clarification = clarification; }
    }
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

  // Compose mode: "premium" = the bespoke LLM composition agent (remix); absent
  // or "standard" = the deterministic scene-kit. Parity with the projects route,
  // so the single-shot endpoint can also request a premium finish.
  if (body.composeMode != null && body.composeMode !== "") {
    if (body.composeMode !== "standard" && body.composeMode !== "premium") {
      errs.push(`composeMode must be "standard" or "premium"`);
    } else {
      out.remix = body.composeMode === "premium";
    }
  }
  if (body.remix === true) out.remix = true;

  // VIDEO PACE — parity with the projects route. Same named modes, same
  // normalizer, so the two entry points cannot drift apart on what is legal.
  // Absent -> the SERVER default from config (defaults.pace), not a hardcoded
  // constant. Every other option in this validator reads its default from
  // config the same way (orientation, quality, fps), and config.js boot-
  // validates this one — a validated setting nothing reads is just a trap.
  if (body.pace == null || body.pace === "") {
    out.pace = pacing.normalizeMode(config.defaults.pace) || pacing.DEFAULT_MODE;
  } else {
    const mode = pacing.normalizeMode(body.pace);
    if (!mode) errs.push(`pace must be one of: ${Object.keys(pacing.MODES).join(", ")}`);
    else out.pace = mode;
  }

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

  // Express 4 does not await a handler; a throw after the `await` below would otherwise
  // be an unhandled rejection and a request that never answers. next() gives it the
  // same 500 a synchronous throw gets.
  router.post("/generate", limiter, (req, res, next) => {
    handleGenerate(req, res).catch(next);
  });

  async function handleGenerate(req, res) {
    const { errs, out } = validateBody(req.body || {});
    if (errs.length) return res.status(400).json({ error: "invalid request", details: errs });

    // THE SCOPE GATE — the same one as POST /api/projects (see that route and
    // services/prompt_scope.js): can KEYFRAME fulfil this by making a video? Decided
    // before the job row and before anything that costs money. Anything but SUPPORTED
    // is a 422 carrying the client projection of the decision, and creates nothing.
    // This endpoint takes a prompt only, so there are no sources for the gate to weigh
    // and no uploads to discard on refusal.
    //
    // The daily cap is checked FIRST, exactly as POST /api/projects does: on a capped day
    // every request would otherwise pay for a scope model call only to be told 429, and
    // an out-of-scope request would get a 422 when the honest answer is "no capacity
    // today". It is checked AGAIN after the gate, because the await opens a window as long
    // as the gate's budget in which concurrent requests could all pass the first check.
    const capReached = () => db.countJobsSince(Date.now() - 24 * 60 * 60 * 1000) >= config.server.dailyJobCap;
    if (capReached()) {
      return res.status(429).json({ error: "daily job cap reached", capacity: config.server.dailyJobCap });
    }

    const signal = clientDisconnectSignal(res);
    const { scope } = await analyzeScope({
      prompt: out.prompt,
      sources: {},
      preferences: { duration: out.duration, orientation: out.orientation, pace: out.pace },
      clarification: out.clarification || null,
      // A refusal tells the caller how to create a video, and THIS endpoint has no link or
      // upload fields, no languages and no script review: without the surface it was told
      // to paste a website, review the script and switch on Autopilot.
      surface: "api-generate",
      signal,
    });
    logDecision(scope, { route: "generate", ip: clientIp(req), ...(signal.aborted ? { clientGone: true } : {}) });

    // The caller hung up while the gate was deciding: it will never learn this jobId,
    // so a job made now would render for nobody.
    if (signal.aborted) return;

    if (!scope.isSupported) {
      return res.status(422).json({ error: scope.userMessage, scope: scopeForClient(scope) });
    }

    // Re-checked: nothing awaits between here and the insert, so this pair is atomic.
    if (capReached()) {
      return res.status(429).json({ error: "daily job cap reached", capacity: config.server.dailyJobCap });
    }

    const dims = config.dimensionsFor(out.orientation, out.quality);
    const jobId = nanoid();

    const task = {
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
      remix: out.remix === true,
      framePack: out.framePack,
      // Must be on the TASK, not only on the row: db.js crash recovery replays
      // this object verbatim at boot, so a pace present only on the job record
      // would silently drop back to default when the server restarts mid-job.
      pace: out.pace || null,
    };

    db.insert({
      id: jobId,
      prompt: out.prompt,
      duration: out.duration,
      orientation: out.orientation,
      quality: out.quality,
      width: dims.width,
      height: dims.height,
      fps: out.fps,
      framePack: out.framePack,
      captions: out.captions,
      pace: out.pace,
      created_at: Date.now(),
      client_ip: clientIp(req),
      // The gate's decision, for audit (prompt_scope.reduce). Deliberately NOT on
      // `task`: the task is what crash recovery replays, and a replay must not depend
      // on a verdict about a request that was already accepted.
      promptScope: reduceScope(scope),
      // Persisted so a server restart mid-job requeues the take at boot
      // instead of failing it (db.js crash recovery).
      task,
    });

    enqueue(task);

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
      // What the gate understood, and what KEYFRAME will NOT do from this request.
      scope: { status: scope.status, videoIntent: scope.videoIntent, unsupportedParts: scope.unsupportedParts },
    });
  }

  return router;
}

module.exports = { buildRouter };
