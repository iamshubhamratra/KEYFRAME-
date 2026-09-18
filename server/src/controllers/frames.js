// Frame packs (design systems) for the template gallery. Picking a pack steers
// generation into that look; picking none ("auto") lets the AI choose.

const frameRegistry = require("../services/frame_registry");
const { presentPack } = require("../views/frame");

// GET /api/frames — every selectable pack, in gallery shape.
function index(_req, res) {
  const def = frameRegistry.defaultPack();
  const packs = frameRegistry.listPacks().map((name) => presentPack(name, def));
  res.json({ packs, defaultPack: def });
}

// GET /api/frames/:name/showcase — the raw showcase HTML, so the frontend can
// preview a pack in an iframe.
function showcase(req, res) {
  const name = String(req.params.name || "");
  if (!/^[a-z0-9-]{1,40}$/.test(name)) return res.status(400).json({ error: "bad pack name" });
  // A RETIRED pack (config.frames.retired) keeps its folder, so getShowcasePath
  // would still happily serve its reference render to anyone with the URL. The
  // listing already withholds showcaseUrl for it; make the endpoint agree.
  if (frameRegistry.resolvePack(name) !== name) return res.status(404).json({ error: "pack or showcase not found" });
  const p = frameRegistry.getShowcasePath(name);
  if (!p) return res.status(404).json({ error: "pack or showcase not found" });
  res.sendFile(p);
}

module.exports = { index, showcase };
