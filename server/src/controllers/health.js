// GET /health — used by the load balancer's health check.

const fs = require("node:fs");
const jobs = require("../models/job");
const config = require("../config");

function diskFreeMb(dir) {
  try {
    const st = fs.statfsSync ? fs.statfsSync(dir) : null;
    if (!st) return null;
    return Math.round((st.bavail * st.bsize) / (1024 * 1024));
  } catch { return null; }
}

function status(_req, res) {
  res.json({
    ok: true,
    queueDepth: jobs.queueDepth(),
    activeJobs: jobs.activeCount(),
    diskFreeMb: diskFreeMb(config.paths.videosDir),
    uptimeSec: Math.round(process.uptime()),
    version: "1.0.0",
  });
}

module.exports = { status };
