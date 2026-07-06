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

// Resolve a user-requested pack name. Only the explicit "auto" string maps to
// the default pack; null/"" means "no choice was made" and returns null so
// callers fall through to the brief's tone-matched suggestion instead of
// silently landing every auto video on the default pack. Unknown name -> null
// (caller decides whether that's a 400 or a fallback).
function resolvePack(requested) {
  const packs = listPacks();
  if (!packs.length) return null;
  if (!requested) return null;
  if (requested === "auto") return defaultPack();
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

// One-line human "vibe" for a pack, pulled from FRAME.md frontmatter
// (description:/vibe:/tagline:/summary:). Lets the brief LLM match tone -> pack
// for EVERY installed pack, not just the few hard-coded in brief.js — so the 7
// of 10 packs with no hard-coded blurb stop being invisible to pack selection.
function getPackVibe(name) {
  const md = getFrameMd(name);
  if (!md) return null;
  const fmMatch = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const fm = fmMatch ? fmMatch[1] : md;
  const lines = fm.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(?:description|vibe|tagline|summary):\s*(.*)$/i);
    if (!m) continue;
    const inline = m[1].trim().replace(/^["']|["']$/g, "");
    // A plain inline scalar wins. A YAML folded/literal block scalar (`>` or
    // `|`, with optional `+`/`-` chomp) has an empty/indicator-only value — the
    // real text is the following indented lines. The old regex captured the bare
    // `>` for those, garbling the vibe for every pack that used a folded block.
    if (inline && !/^[>|][+-]?$/.test(inline)) return inline.slice(0, 240);
    const body = [];
    for (let j = i + 1; j < lines.length; j++) {
      if (/^\s+\S/.test(lines[j])) body.push(lines[j].trim());
      else if (/^\s*$/.test(lines[j])) body.push(""); // blank line = paragraph break
      else break; // dedent -> block ended
    }
    const folded = body.join(" ").replace(/\s+/g, " ").trim();
    return folded ? folded.slice(0, 240) : null;
  }
  return null;
}

function getShowcasePath(name) {
  if (!FRAMES_DIR || !name) return null;
  const p = path.join(FRAMES_DIR, name, "frame-showcase.html");
  return fs.existsSync(p) ? p : null;
}

// Extract machine-usable tokens from FRAME.md's YAML frontmatter: the exact
// color hexes and font families the pack permits. Used to append a hard
// "palette law" to the composer prompt — listing concrete values survives
// long-prompt attention dilution far better than prose rules do.
function getPackTokens(name) {
  const md = getFrameMd(name);
  if (!md) return null;
  const fmMatch = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const fm = fmMatch ? fmMatch[1] : md;

  const colors = {};
  const colorsBlock = fm.match(/^colors:\r?\n((?:[ \t]+.+\r?\n?)+)/m);
  if (colorsBlock) {
    for (const line of colorsBlock[1].split(/\r?\n/)) {
      const m = line.match(/^[ \t]+([\w-]+):\s*"(#[0-9a-fA-F]{6})"/);
      if (m) colors[m[1]] = m[2].toUpperCase();
    }
  }

  const fonts = [...new Set(
    [...fm.matchAll(/fontFamily:\s*"([^"]+)"/g)].map((m) => m[1])
  )];

  return { name, colors, fonts };
}

module.exports = { listPacks, defaultPack, resolvePack, getFrameMd, getShowcasePath, getPackTokens, getPackVibe, FRAMES_DIR };
