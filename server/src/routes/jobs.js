// /api/jobs — single-shot job status.
const express = require("express");
const jobs = require("../controllers/jobs");

function buildRouter() {
  const router = express.Router();
  router.get("/jobs/:id", jobs.show);
  router.get("/jobs/:id/stream", jobs.stream);
  return router;
}

module.exports = { buildRouter };
