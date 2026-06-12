// Frame-pack registry. A "frame pack" is a folder under the frames dir
// containing FRAME.md (design tokens + composition rules, YAML frontmatter +
// prose) and optionally frame-showcase.html (the canonical reference render).
//
// The selected pack's FRAME.md is injected VERBATIM into the composer system
// prompt as the authoritative design system: atoms are sacred, composition is
// free. This is how every video gets a coherent, art-directed identity
// instead of generic AI styling.

const fs = require("node:fs");
const path = require("node:path");
const config = require("../config");

function resolveFramesDir() {
  const candidates = [];
  if (config.frames && config.frames.dir) {
    candidates.push(path.resolve(config.paths.root, config.frames.dir));
  }
  candidates.push(path.resolve(config.paths.root, "frames"));
  candidates.push(path.resolve(config.paths.root, "..", "frames"));
  for (const c of candidates) {
    try { if (fs.statSync(c).isDirectory()) return c; } catch { /* keep looking */ }
  }
  return null;
}

const FRAMES_DIR = resolveFramesDir();
if (FRAMES_DIR) {
  console.log(`[frames] registry dir: ${FRAMES_DIR}`);
} else {
  console.warn(`[frames] no frames directory found — compositions will be unstyled (generic)`);
}

/** @type {Map<string, {frameMd: string, mtimeMs: number}>} */
const cache = new Map();

function frameMdPath(name) { return path.join(FRAMES_DIR, name, "FRAME.md"); }

function listPacks() {
  if (!FRAMES_DIR) return [];
  return fs.readdirSync(FRAMES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((name) => fs.existsSync(frameMdPath(name)))
    .sort();
}

function defaultPack() {
  const packs = listPacks();
  if (!packs.length) return null;
  const preferred = config.frames && config.frames.defaultPack;
  return (preferred && packs.includes(preferred)) ? preferred : packs[0];
}

// Resolve a user-requested pack name. null/"" /"auto" -> default pack.
// Unknown name -> null (caller decides whether that's a 400 or a fallback).
function resolvePack(requested) {
  const packs = listPacks();
  if (!packs.length) return null;
  if (!requested || requested === "auto") return defaultPack();
  return packs.includes(requested) ? requested : null;
}

// Load a pack's FRAME.md, mtime-cached so edits during development are
// picked up without a restart.
function getFrameMd(name) {
  if (!FRAMES_DIR || !name) return null;
  const p = frameMdPath(name);
  let st;
  try { st = fs.statSync(p); } catch { return null; }
  const hit = cache.get(name);
  if (hit && hit.mtimeMs === st.mtimeMs) return hit.frameMd;
  const frameMd = fs.readFileSync(p, "utf8");
  cache.set(name, { frameMd, mtimeMs: st.mtimeMs });
  return frameMd;
}

function getShowcasePath(name) {
  if (!FRAMES_DIR || !name) return null;
  const p = path.join(FRAMES_DIR, name, "frame-showcase.html");
  return fs.existsSync(p) ? p : null;
}

module.exports = { listPacks, defaultPack, resolvePack, getFrameMd, getShowcasePath, FRAMES_DIR };
