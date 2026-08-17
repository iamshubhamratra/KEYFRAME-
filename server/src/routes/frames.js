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
const MINOR = new Set(["and", "of", "the", "a", "an", "to", "in", "on", "at", "for", "or", "vs"]);
const titleize = (slug) => String(slug)
  .split("-")
  .map((w, i) => (i > 0 && MINOR.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
  .join(" ");

function packMeta(name) {
  const md = frameRegistry.getFrameMd(name) || "";
  const fm = (md.match(/^---\r?\n([\s\S]*?)\r?\n---/) || [])[1] || md;
  // `label:` FIRST, then `name:`. The older packs put their human title in `name:`
  // ("BlockFrame — Frame (video / frame layer)"), but the generated packs use `name:` for the
  // SLUG and carry the title in `label:` — so reading `name:` alone titled 89 of 135 cards
  // "aerial-silk", "loom-and-weft", "vault-twelve". The picker is the shop window; a card
  // labelled with a URL fragment reads like an internal build artefact.
  let label = (fm.match(/^label:\s*"?(.+?)"?\s*$/m) || [])[1]
    || (fm.match(/^name:\s*"?(.+?)"?\s*$/m) || [])[1]
    || name;
  label = label.replace(/\s*[—-]\s*Frame.*$/i, "").trim(); // drop "— Frame (video…)"
  // Last resort: a pack whose only title IS its slug (`name: grid-dispatch`, or no front matter
  // at all) still deserves a readable card. Small joining words stay lowercase so the
  // "<noun> and <noun>" pack names read as English rather than as a header.
  if (label === name) label = titleize(name);

  const m = frameManifest.getManifest(name);
  if (m) {
    let vibe = m.vibe || "";
    if (vibe.length > 180) vibe = vibe.slice(0, 177).trimEnd() + "…";
    return {
      label,
      vibe,
      // The picker groups and labels cards by these. They come from the manifest so a pack
      // that ships no hand-authored front-end "lore" entry still renders a correct card —
      // with 116 packs installed, hand-maintaining a second table per pack is not viable.
      category: m.category || "",
      tags: Array.isArray(m.tags) ? m.tags.slice(0, 8) : [],
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

// THE URL CARRIES THE FILE'S VERSION, or a regenerated pack still shows the old card.
//
// These paths are constant — /frames/<name>/poster.jpg — and the .mp4 is served with
// `Cache-Control: public, max-age=3600` (see server.js). So after regenerating a pack's media the
// browser keeps serving what it already has: for up to an hour from its own cache, and indefinitely
// from any CDN or proxy in front of it. The files on disk were new and the picker still showed the
// old design, which is exactly what a stale poster looked like before it was ever regenerated.
//
// Appending the file's mtime makes the URL change whenever the bytes change, so a new render is a new
// URL and the cache cannot hold it. It also lets the mp4 keep its long max-age, which is what a
// picker grid wants — the same file, cached hard, until it genuinely differs.
function stamped(name, file) {
  const abs = path.join(PUBLIC_FRAMES, name, file);
  let stat;
  try { stat = fs.statSync(abs); } catch { return null; }
  return `/frames/${name}/${file}?v=${Math.round(stat.mtimeMs)}`;
}

function mediaUrls(name) {
  return { previewUrl: stamped(name, "preview.mp4"), posterUrl: stamped(name, "poster.jpg") };
}

// WHEN THIS PACK ARRIVED IN THE PUBLIC LIBRARY.
//
// The gallery orders by a hand-written PACK_ORDER and appends everything absent from it, so a
// newly published template landed near the END of its aspect section — measured on the first
// real publish: card 30 of 32, roughly the 88th card on the page. "I published it and cannot see
// it" is the predictable result, and it is a presentation defect rather than a publishing one.
//
// The pack DIRECTORY's mtime is the honest signal: publishing moves that directory from
// frames_draft/ into frames/ (templates/paths.movePackDir), which stamps it, while the 135 packs
// that shipped with the repo carry their checkout time. Reported as a plain number so the client
// can sort by it without parsing anything.
function installedAt(name) {
  const dir = frameRegistry.packDir(name);
  if (!dir) return 0;
  try { return Math.round(fs.statSync(dir).mtimeMs); } catch { return 0; }
}

// WHEN THIS PACK ARRIVED IN THE PUBLIC LIBRARY.
//
// The gallery orders by a hand-written PACK_ORDER and appends everything absent from it, so a
// newly published template landed near the END of its aspect section — measured on the first
// real publish: card 30 of 32, roughly the 88th card on the page. "I published it and cannot see
// it" is the predictable result, and it is a presentation defect rather than a publishing one.
//
// The pack DIRECTORY's mtime is the honest signal: publishing moves that directory from
// frames_draft/ into frames/ (templates/paths.movePackDir), which stamps it, while the 135 packs
// that shipped with the repo carry their checkout time. Reported as a plain number so the client
// can sort by it without parsing anything.
function installedAt(name) {
  const dir = frameRegistry.packDir(name);
  if (!dir) return 0;
  try { return Math.round(fs.statSync(dir).mtimeMs); } catch { return 0; }
}

router.get("/frames", (_req, res) => {
  const def = frameRegistry.defaultPack();
  const packs = frameRegistry.listPacks().map((name) => ({
    name,
    default: name === def,
    installedAt: installedAt(name),
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
