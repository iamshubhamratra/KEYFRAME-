// POST /api/generate — the single-shot pipeline: validate, enforce caps, enqueue,
// answer with the jobId and an ETA.

const { customAlphabet } = require("nanoid");
const config = require("../config");
const jobs = require("../models/job");
const logger = require("../services/logger");
const { estimateEta } = require("../services/eta");
const { validateGenerate } = require("../validators/generate");
const { clientIp } = require("../middleware/rate_limit");

const nanoid = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 10);

function generateController({ enqueue }) {
  function create(req, res) {
    const { errs, out } = validateGenerate(req.body || {});
    if (errs.length) return res.status(400).json({ error: "invalid request", details: errs });

    // Global daily cap.
    const since = Date.now() - 24 * 60 * 60 * 1000;
    if (jobs.countJobsSince(since) >= config.server.dailyJobCap) {
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
      // Pace belongs in the TASK, not only in the row: boot crash-recovery
      // replays `j.task` verbatim (models/job.js), so a field that lives only on
      // the row is silently dropped from every requeued job — which is what
      // happens to `out.captions` today. A requeued "fast" job must still come
      // back fast.
      pace: out.pace,
    };

    jobs.insert({
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
      // Persisted so a server restart mid-job requeues the take at boot
      // instead of failing it (models/job.js crash recovery).
      task,
    });

    enqueue(task);

    // One greppable line for the defect this route used to cause silently. The
    // pipeline's own "job accepted" prints the same flags, but only once a worker
    // picks the job up and it cannot tell an omitted flag from an explicit false —
    // which is the whole distinction here. `omittedFlags` counts the three the
    // caller never sent, so a film that is still blind or silent WITH flags
    // omitted means the defaults above regressed, and it reads at WARN.
    const omittedFlags = ["images", "tts", "music"].filter((k) => (req.body || {})[k] == null).length;
    const blind = !out.images && !out.video;
    const silent = !out.tts && !out.music && !out.soundEffect;
    logger.child({ tag: "generate", jobId })[blind || silent ? "warn" : "info"](
      `job accepted${blind ? " — NO PICTURE SOURCE" : ""}${silent ? " — NO AUDIO" : ""}`,
      {
        duration: out.duration, orientation: out.orientation, pace: out.pace,
        images: out.images, video: out.video,
        tts: out.tts, music: out.music, sfx: out.soundEffect, captions: out.captions,
        omittedFlags,
      },
    );

    // Queue state *after* this insert; subtract 1 so the count represents jobs AHEAD of mine.
    const jobsAhead = Math.max(0, jobs.queueDepth() - 1);
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
  }

  return { create };
}

module.exports = generateController;
