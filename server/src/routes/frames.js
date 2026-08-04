// GET /api/frames — list installed frame packs (design systems) for the
// template-style gallery. Each pack carries a display label, a one-line vibe,
// its palette, and a preview video + poster when rendered (served statically
// from /frames/<name>/preview.mp4). Picking a pack steers generation into that
// look; picking none ("auto") lets the AI choose.

const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const config = require("../config");
const frameRegistry = require("../services/frame_registry");
const frameManifest = require("../services/frame_manifest");

const router = express.Router();

const PUBLIC_FRAMES = path.join(config.paths.root, "public", "frames");

// Display label + one-line vibe + palette for the gallery. The pack MANIFEST
// (frames/<pack>/pack.json) is the source of truth for vibe/colors/fonts +
// display font + ground — replacing this route's own duplicate FRAME.md parser
// (which had its own folded-`description:` handling). Only the human display
// LABEL still comes from FRAME.md `name:` (the manifest holds the slug, not the
// title). Falls back to FRAME.md parsing when a pack ships no manifest.
function packMeta(name) {
  const md = frameRegistry.getFrameMd(name) || "";
  const fm = (md.match(/^---\r?\n([\s\S]*?)\r?\n---/) || [])[1] || md;
  let label = (fm.match(/^name:\s*"?(.+?)"?\s*$/m) || [])[1] || name;
  label = label.replace(/\s*[—-]\s*Frame.*$/i, "").trim(); // drop "— Frame (video…)"

  const m = frameManifest.getManifest(name);
  if (m) {
    let vibe = m.vibe || "";
    if (vibe.length > 180) vibe = vibe.slice(0, 177).trimEnd() + "…";
    return {
      label,
      vibe,
      // Orientation drives the gallery's aspect CATEGORY (9:16 / 16:9 / 1:1). Portrait-native
      // packs (the imported OM templates) declare "portrait"; default is horizontal.
      orientation: m.orientation || "horizontal",
      colors: Object.values(m.colors || {}).slice(0, 6),
      fonts: m.fonts || [],
      displayFont: (m.typography && m.typography.display) || null,
      ground: (m.surface && m.surface.ground) || null,
      accents: (m.skin && m.skin.accents && m.skin.accents.length ? m.skin.accents : Object.values(m.colors || {})).slice(0, 3),
    };
  }

  // Fail-soft: no manifest -> parse FRAME.md (incl. folded `description:` block).
  let vibe = "";
  const d = fm.match(/^description:\s*>?\s*\r?\n((?:[ \t]+.+\r?\n?)+)/m);
  if (d) vibe = d[1].split(/\r?\n/).map((l) => l.trim()).filter(Boolean).join(" ");
  else vibe = (fm.match(/^description:\s*"?(.+?)"?\s*$/m) || [])[1] || "";
  vibe = vibe.replace(/\s+/g, " ").trim();
  if (vibe.length > 180) vibe = vibe.slice(0, 177).trimEnd() + "…";
  const tokens = frameRegistry.getPackTokens(name) || { colors: {}, fonts: [] };
  return { label, vibe, orientation: "horizontal", colors: Object.values(tokens.colors || {}).slice(0, 6), fonts: tokens.fonts || [], displayFont: null, ground: null, accents: [] };
}

function mediaUrls(name) {
  const dir = path.join(PUBLIC_FRAMES, name);
  const preview = fs.existsSync(path.join(dir, "preview.mp4")) ? `/frames/${name}/preview.mp4` : null;
  const poster = fs.existsSync(path.join(dir, "poster.jpg")) ? `/frames/${name}/poster.jpg` : null;
  return { previewUrl: preview, posterUrl: poster };
}

router.get("/frames", (_req, res) => {
  const def = frameRegistry.defaultPack();
  const packs = frameRegistry.listPacks().map((name) => ({
    name,
    default: name === def,
    ...packMeta(name),
    ...mediaUrls(name),
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
