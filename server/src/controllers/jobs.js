// Job status: GET /api/jobs/:id (with a live ETA) and its SSE stream.

const jobs = require("../models/job");
const jobView = require("../views/job");
const config = require("../config");
const { isJobId } = require("../validators/common");
const { estimateEta, estimateRemainingSec } = require("../services/eta");

// GET /api/jobs/:id — the job plus a live ETA from the queue's current state.
function show(req, res) {
  const id = String(req.params.id || "").trim();
  if (!isJobId(id)) return res.status(400).json({ error: "invalid jobId" });
  const job = jobView.present(jobs.getRaw(id));
  if (!job) return res.status(404).json({ error: "job not found" });

  if (job.status === "queued") {
    const posInQueue = jobs.queuePosition(id) || 1; // 1-based: 1 = next up
    const activeAhead = jobs.activeCount();
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
}

// GET /api/jobs/:id/stream — Server-Sent Events. Pushes status/progress changes
// live until the job reaches a terminal state, so the UI shows real-time stages
// (storyboard → assets → composing → audio → done) instead of polling.
function stream(req, res) {
  const id = String(req.params.id || "").trim();
  if (!isJobId(id)) return res.status(400).json({ error: "invalid jobId" });
  if (!jobs.getRaw(id)) return res.status(404).json({ error: "job not found" });

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
    const job = jobs.getRaw(id);
    if (!job) { send("error", { error: "job not found" }); return stop(); }
    const key = `${job.status}|${job.progress || ""}`;
    if (key !== lastKey) {
      lastKey = key;
      send("progress", { status: job.status, progress: job.progress || null, videoUrl: job.video_url || null, error: job.error || null });
    }
    if (TERMINAL.has(job.status)) { send("done", { status: job.status, videoUrl: job.video_url || null, error: job.error || null }); stop(); }
  }

  const heartbeat = setInterval(() => { if (!closed) res.write(": ping\n\n"); }, 15_000);
  const poll = setInterval(tick, 800);
  const maxLife = setTimeout(() => { send("timeout", { note: "stream closed after max lifetime" }); stop(); }, 30 * 60 * 1000);
  req.on("close", stop);
  tick(); // immediate first snapshot
}

module.exports = { show, stream };
