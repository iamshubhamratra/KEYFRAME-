// GET /health
const express = require("express");
const health = require("../controllers/health");

function buildRouter() {
  const router = express.Router();
  router.get("/health", health.status);
  return router;
}

module.exports = { buildRouter };
