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

// THE DRAFT ROOT — where admin-authored templates live until they are published.
//
// PUBLISHING IS A DIRECTORY MOVE, NOT A FLAG. listPacks() below scans FRAMES_DIR and nothing
// else, and six independent user-facing paths read listPacks(): the /api/frames gallery, the
// explicit-pick validation in both create routes, the brief's pack vocabulary (which offers
// every pack to the auto-selection model), rotatedDefaultPack() (which returns the first
// alphabetical unused pack — an early-sorting draft slug would otherwise become the default
// on the next auto job), and the frame-selector's fitting/affordable/clean reroutes (which
// can swap a user onto a pack they never chose). A `status` field would have to be read
// correctly by all six to be safe. A separate root is safe even if this file is the only
// thing that ever knows about it.
//
// Content resolution below is deliberately root-agnostic: a draft resolves its FRAME.md,
// pack.json, media contract and audio profile exactly as a published pack does, so it can be
// built, rendered and QA'd before it is ever visible. It simply is never LISTED.
const DRAFT_DIR = (() => {
  const configured = config.frames && config.frames.draftDir;
  if (configured) return path.resolve(config.paths.root, configured);
  if (FRAMES_DIR) return path.join(path.dirname(FRAMES_DIR), "frames_draft");
  return path.resolve(config.paths.root, "..", "frames_draft");
})();

/** @type {Map<string, {frameMd: string, mtimeMs: number, path: string}>} */
const cache = new Map();

function publishedFrameMd(name) { return FRAMES_DIR ? path.join(FRAMES_DIR, name, "FRAME.md") : null; }
function draftFrameMd(name) { return DRAFT_DIR ? path.join(DRAFT_DIR, name, "FRAME.md") : null; }

// The directory a pack's files live in, published root first. Returns null when the pack
// exists in neither root. This is the single resolver every content lookup goes through, so
// adding a root later means editing one function.
function packDir(name) {
  if (!name) return null;
  const pub = publishedFrameMd(name);
  if (pub && fs.existsSync(pub)) return path.dirname(pub);
  const draft = draftFrameMd(name);
  if (draft && fs.existsSync(draft)) return path.dirname(draft);
  return null;
}

function frameMdPath(name) {
  const dir = packDir(name);
  return dir ? path.join(dir, "FRAME.md") : (publishedFrameMd(name) || "");
}

function listIn(dir) {
  if (!dir) return [];
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
  return entries
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((name) => fs.existsSync(path.join(dir, name, "FRAME.md")))
    .sort();
}

// PUBLISHED PACKS ONLY. Every user-facing consumer calls this; none of them needs to know
// the draft root exists. Admin tooling calls listAllPacks()/listDraftPacks() explicitly.
function listPacks() { return listIn(FRAMES_DIR); }

function listDraftPacks() { return listIn(DRAFT_DIR); }

function listAllPacks() { return [...new Set([...listPacks(), ...listDraftPacks()])].sort(); }

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

// Admin-only resolver: accepts a DRAFT pack as well as a published one. Used by the admin
// router and by the admin test-render path, which must be able to point a real job at a
// template that is deliberately invisible to everyone else. Never call this from a user
// route — resolvePack() above is the one that keeps drafts unreachable.
function resolveAnyPack(requested) {
  if (!requested) return null;
  if (requested === "auto") return defaultPack();
  return packDir(requested) ? requested : null;
}

function isPublished(name) { return !!name && listPacks().includes(name); }
function isDraft(name) { return !!name && listDraftPacks().includes(name); }

// Load a pack's FRAME.md, mtime-cached so edits during development are
// picked up without a restart. The cache key carries the resolved PATH as well as the
// mtime: publishing moves a pack between roots without touching its bytes, so an
// mtime-only check would keep serving the pre-move entry.
function getFrameMd(name) {
  if (!name) return null;
  const p = frameMdPath(name);
  if (!p) return null;
  let st;
  try { st = fs.statSync(p); } catch { return null; }
  const hit = cache.get(name);
  if (hit && hit.mtimeMs === st.mtimeMs && hit.path === p) return hit.frameMd;
  const frameMd = fs.readFileSync(p, "utf8");
  cache.set(name, { frameMd, mtimeMs: st.mtimeMs, path: p });
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
  const dir = packDir(name);
  if (!dir) return null;
  const p = path.join(dir, "frame-showcase.html");
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

module.exports = {
  listPacks, defaultPack, resolvePack, getFrameMd, getShowcasePath, getPackTokens, getPackVibe, FRAMES_DIR,
  // Draft-aware surface (admin only — see the comment on DRAFT_DIR).
  DRAFT_DIR, packDir, listDraftPacks, listAllPacks, resolveAnyPack, isPublished, isDraft,
};
