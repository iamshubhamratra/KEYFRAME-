// GET /api/jobs/:id — returns shaped job record + live ETA based on queue state.

const express = require("express");
const db = require("../db");
const config = require("../config");
const { estimateEta, estimateRemainingSec } = require("../services/eta");
const { requireJobAccess } = require("../auth/ownership");

const router = express.Router();

// SAME GUARD AS /api/projects/:id, because it is the same record. This route calls the same
// db.get() and returns the same shaped object — prompt, brief, script and all — so securing the
// newer door and leaving this one open would have been decoration rather than a fix. Both now
// go through the one ownership check.
router.get("/jobs/:id", requireJobAccess, (req, res) => {
  const id = String(req.params.id || "").trim();
  const job = db.get(id);

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

// GET /api/jobs/:id/stream — Server-Sent Events. Pushes status/progress changes
// live until the job reaches a terminal state, so the UI shows real-time stages
// (storyboard → assets → composing → audio → done) instead of polling (#12).
// Additive: the polling GET above still works for clients that don't use SSE.
router.get("/jobs/:id/stream", requireJobAccess, (req, res) => {
  const id = String(req.params.id || "").trim();

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no", // stop proxy (nginx) buffering so events flush immediately
  });
  res.write("retry: 3000\n\n");

  const TERMINAL = new Set(["done", "completed", "failed", "error"]);
  let lastKey = "";
  let closed = false;

  function stop() {
    if (closed) return;
    closed = true;
    clearInterval(poll); clearInterval(heartbeat); clearTimeout(maxLife);
    try { res.end(); } catch { /* noop */ }
  }
  const send = (event, data) => { if (!closed) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); };

  function tick() {
    if (closed) return;
    const job = db.get(id);
    if (!job) { send("error", { error: "job not found" }); return stop(); }
    const key = `${job.status}|${job.progress || ""}`;
    if (key !== lastKey) {
      lastKey = key;
      send("progress", { status: job.status, progress: job.progress || null, videoUrl: job.videoUrl || null, error: job.error || null });
    }
    if (TERMINAL.has(job.status)) { send("done", { status: job.status, videoUrl: job.videoUrl || null, error: job.error || null }); stop(); }
  }

  const heartbeat = setInterval(() => { if (!closed) res.write(": ping\n\n"); }, 15_000);
  const poll = setInterval(tick, 800);
  const maxLife = setTimeout(() => { send("timeout", { note: "stream closed after max lifetime" }); stop(); }, 30 * 60 * 1000);
  req.on("close", stop);
  tick(); // immediate first snapshot
});

module.exports = router;
