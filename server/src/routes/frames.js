// GET /api/frames — list installed frame packs (design systems).
// Each pack: name, whether it's the default, and a showcase URL when the
// canonical reference render is available (served at /frames/:name/showcase).

const express = require("express");
const frameRegistry = require("../services/frame_registry");

const router = express.Router();

router.get("/frames", (_req, res) => {
  const def = frameRegistry.defaultPack();
  const packs = frameRegistry.listPacks().map((name) => ({
    name,
    default: name === def,
    showcaseUrl: frameRegistry.getShowcasePath(name) ? `/api/frames/${name}/showcase` : null,
  }));
  res.json({ packs, defaultPack: def });
});

// Serve the raw showcase HTML so the frontend can preview a pack in an iframe.
router.get("/frames/:name/showcase", (req, res) => {
  const name = String(req.params.name || "");
  if (!/^[a-z0-9-]{1,40}$/.test(name)) return res.status(400).json({ error: "bad pack name" });
  const p = frameRegistry.getShowcasePath(name);
  if (!p) return res.status(404).json({ error: "pack or showcase not found" });
  res.sendFile(p);
});

module.exports = router;
