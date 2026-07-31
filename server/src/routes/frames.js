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
  return { label, vibe, colors: Object.values(tokens.colors || {}).slice(0, 6), fonts: tokens.fonts || [], displayFont: null, ground: null, accents: [] };
}

// Preview/poster URLs carry a ?v=<mtime> version tag: the files are served with
// Cache-Control: max-age=3600 under a FIXED path, so without the tag a browser
// keeps showing a stale clip for up to an hour after previews are regenerated
// (scripts/build-previews.js). The mtime changes on every regen → new URL →
// instant cache bust, while unchanged files stay fully cacheable.
function mediaUrls(name) {
  const dir = path.join(PUBLIC_FRAMES, name);
  const tagged = (file) => {
    try {
      const st = fs.statSync(path.join(dir, file));
      return `/frames/${name}/${file}?v=${Math.floor(st.mtimeMs).toString(36)}`;
    } catch { return null; }
  };
  return { previewUrl: tagged("preview.mp4"), posterUrl: tagged("poster.jpg") };
}

// Reads a JPEG's pixel dimensions straight from its SOF marker — no ffprobe
// subprocess, no image lib. Scans the length-prefixed segment chain (SOI, APPn,
// DQT…) until the first Start-Of-Frame (0xFFC0–0xFFCF, minus DHT/JPG/DAC), where
// height/width sit at byte offsets +5/+7. Returns null on anything non-standard.
function jpegDims(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let o = 2;
  while (o + 9 < buf.length) {
    if (buf[o] !== 0xff) { o++; continue; }
    const marker = buf[o + 1];
    if (marker === 0xff) { o++; continue; }                                // padding
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 ||
        (marker >= 0xd0 && marker <= 0xd7)) { o += 2; continue; }          // standalone
    if (marker >= 0xc0 && marker <= 0xcf &&
        marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { width: buf.readUInt16BE(o + 7), height: buf.readUInt16BE(o + 5) };
    }
    const len = buf.readUInt16BE(o + 2);
    if (len < 2) return null;
    o += 2 + len;
  }
  return null;
}

// True when a pack's clip is portrait (9:16-native — the reel/story packs) so
// the gallery can group it separately and render it in a vertical card instead
// of cropping a tall clip into a 16:9 box. We read the poster.jpg header (same
// aspect as preview.mp4, far cheaper than probing the video) and cache the
// verdict by mtime, so a pack costs one header parse until its preview is
// regenerated — and a new portrait pack is picked up automatically.
const _portraitCache = new Map();
function isPortrait(name) {
  const file = path.join(PUBLIC_FRAMES, name, "poster.jpg");
  let st;
  try { st = fs.statSync(file); } catch { return false; }
  const hit = _portraitCache.get(file);
  if (hit && hit.mtime === st.mtimeMs) return hit.portrait;
  let portrait = false;
  try {
    const dims = jpegDims(fs.readFileSync(file));
    if (dims && dims.width > 0) portrait = dims.height > dims.width * 1.1;
  } catch { /* fail-open: treat unreadable posters as landscape */ }
  _portraitCache.set(file, { mtime: st.mtimeMs, portrait });
  return portrait;
}

router.get("/frames", (_req, res) => {
  const def = frameRegistry.defaultPack();
  const packs = frameRegistry.listPacks().map((name) => ({
    name,
    default: name === def,
    ...packMeta(name),
    ...mediaUrls(name),
    portrait: isPortrait(name),
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
