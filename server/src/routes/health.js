// GET /health — used by EB's ELB health check.

const express = require("express");
const fs = require("node:fs");
const db = require("../db");
const config = require("../config");

const router = express.Router();

function diskFreeMb(dir) {
  try {
    const st = fs.statfsSync ? fs.statfsSync(dir) : null;
    if (!st) return null;
    return Math.round((st.bavail * st.bsize) / (1024 * 1024));
  } catch { return null; }
}

router.get("/health", (_req, res) => {
  res.json({
    ok: true,
    queueDepth: db.queueDepth(),
    activeJobs: db.activeCount(),
    diskFreeMb: diskFreeMb(config.paths.videosDir),
    uptimeSec: Math.round(process.uptime()),
    version: "1.0.0",
  });
});

module.exports = router;
