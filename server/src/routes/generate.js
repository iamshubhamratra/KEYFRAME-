// /api/generate — the single-shot pipeline.
const express = require("express");
const generateController = require("../controllers/generate");
const { hourlyJobLimit } = require("../middleware/rate_limit");

function buildRouter({ enqueue }) {
  const generate = generateController({ enqueue });
  const router = express.Router();
  router.post("/generate", hourlyJobLimit(), generate.create);
  return router;
}

module.exports = { buildRouter };
