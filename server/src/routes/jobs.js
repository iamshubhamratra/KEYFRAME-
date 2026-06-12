// GET /api/jobs/:id — returns shaped job record + live ETA based on queue state.

const express = require("express");
const db = require("../db");
const config = require("../config");
const { estimateEta, estimateRemainingSec } = require("../services/eta");

const router = express.Router();

router.get("/jobs/:id", (req, res) => {
  const id = String(req.params.id || "").trim();
  if (!/^[0-9a-z]{6,20}$/.test(id)) {
    return res.status(400).json({ error: "invalid jobId" });
  }
  const job = db.get(id);
  if (!job) return res.status(404).json({ error: "job not found" });

  // Attach ETA fields based on status.
  if (job.status === "queued") {
    const posInQueue = db.queuePosition(id) || 1; // 1-based: 1 = next up
    const activeAhead = db.activeCount();
    const jobsAhead = activeAhead + (posInQueue - 1);

    const eta = estimateEta({
      duration: job.duration,
      orientation: job.orientation,
      resolutionQuality: job.quality || config.defaults.quality,
      renderQuality: config.server.renderQuality,
      cpus: config.server.detectedCpus,
      jobsAhead,
      concurrency: config.server.jobConcurrency,
    });

    job.queuePosition = posInQueue;
    job.jobsAhead = jobsAhead;
    job.concurrency = config.server.jobConcurrency;
    job.estimatedWaitSec = eta.waitSec;
    job.estimatedRenderSec = eta.renderSec;
    job.estimatedTotalSec = eta.totalSec;
  } else if (job.status === "running") {
    job.estimatedRemainingSec = estimateRemainingSec({
      duration: job.duration,
      orientation: job.orientation,
      resolutionQuality: job.quality || config.defaults.quality,
      renderQuality: config.server.renderQuality,
      cpus: config.server.detectedCpus,
      startedAtMs: job.startedAt,
    });
  }

  return res.json(job);
});

module.exports = router;
