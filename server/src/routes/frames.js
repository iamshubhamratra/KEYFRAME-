// /api/frames — the frame-pack (design system) gallery.
const express = require("express");
const frames = require("../controllers/frames");

function buildRouter() {
  const router = express.Router();
  router.get("/frames", frames.index);
  router.get("/frames/:name/showcase", frames.showcase);
  return router;
}

module.exports = { buildRouter };
