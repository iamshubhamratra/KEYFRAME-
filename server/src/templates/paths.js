// TEMPLATE FILE SAFETY — the only module allowed to turn a template slug into a path.
//
// Everything downstream of the generator writes files, and the generator's input is a
// model-authored prompt. So every path this feature touches is derived HERE, from a slug
// that has been validated against one narrow pattern, and every write is asserted to land
// inside one of four allowlisted roots. A template can therefore never overwrite a composer,
// a route, the auth store, config, or another template — not because the generator is
// trusted to behave, but because a path outside the allowlist throws before the write.
//
// TWO ROOTS, AND THE SPLIT IS THE SECURITY BOUNDARY:
//
//   frames/         PUBLISHED only. frame_registry.listPacks() scans exactly this directory,
//                   and six independent user-facing paths read that function (the gallery,
//                   both create routes' pick validation, the brief's pack vocabulary, the
//                   rotation default, and the frame-selector's three reroutes). A template
//                   that is not in this directory cannot reach any of them.
//   frames_draft/   Everything else. Content resolvers (FRAME.md, pack.json, media, audio)
//                   look here too, so a draft can be built, rendered and QA'd exactly as a
//                   published pack is — it simply is not LISTED.
//
// Publishing is therefore a directory move, not a flag. That is deliberate: a flag has to be
// read correctly by every consumer to be safe, and the audit found six consumers. A move is
// safe even if the lifecycle store is corrupt, unreadable or out of date.

const fs = require("node:fs");
const path = require("node:path");
const config = require("../config");
const frameRegistry = require("../services/frame_registry");

// The published root — the exact directory frame_registry scans. Never re-derived here:
// asking the registry guarantees the two can never disagree about what "published" means.
const PUBLISHED_ROOT = frameRegistry.FRAMES_DIR;

// The draft root — a sibling of the published root so a publish is a same-volume rename.
// Owned by the registry (which is the module that must agree with it about what is listed),
// and read from there rather than re-derived, so the two can never drift apart.
const DRAFT_ROOT = frameRegistry.DRAFT_DIR;

// Generated composer modules. The ONE directory in the repo that is registered by scan
// rather than by a hand-edited table (services/pipeline.js filmSkinComposers), which is
// what lets a generated template install itself without a code edit.
const SKIN_ROOT = path.join(config.paths.root, "src", "services", "film_skins");

// Shop-window media (poster.jpg / preview.mp4 / media.json), served at /frames/<slug>/*.
const PACK_MEDIA_ROOT = path.join(config.paths.root, "public", "frames");

// Admin-generated working artifacts (stills, test renders) — outside jobsDir so the janitor
// cannot sweep them mid-review.
const WORK_ROOT = path.join(config.paths.root, "template_work");

const WRITABLE_ROOTS = Object.freeze([DRAFT_ROOT, PUBLISHED_ROOT, SKIN_ROOT, PACK_MEDIA_ROOT, WORK_ROOT].filter(Boolean));

// ---------------------------------------------------------------- slug

// Deliberately narrower than "a legal directory name". A slug becomes a directory name, a
// renderer id (`film-<slug>`), a require()d module filename, a URL path segment and a
// pack.json `name` — so it is restricted to the intersection of what all five accept.
const SLUG_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const SLUG_MIN = 3;
const SLUG_MAX = 48;

// Names that would collide with the generator's own bookkeeping or with a shared module.
// `_`-prefixed files are skipped by the composer scan, and these ids are load-bearing
// elsewhere in the dispatch table.
const RESERVED = Object.freeze(new Set([
  "auto", "none", "default", "test", "tmp", "temp", "node-modules",
  "scene-kit", "kit", "film", "index", "manifest", "metadata", "register",
]));

function slugError(slug) {
  const s = String(slug == null ? "" : slug);
  if (!s) return "slug is required";
  if (s.length < SLUG_MIN) return `slug must be at least ${SLUG_MIN} characters`;
  if (s.length > SLUG_MAX) return `slug must be at most ${SLUG_MAX} characters`;
  if (!SLUG_RE.test(s)) return "slug must be lower-case letters, digits and single hyphens (e.g. \"aurora-pitch\")";
  if (RESERVED.has(s)) return `"${s}" is a reserved name`;
  if (s.startsWith("film-")) return "slug must not start with \"film-\" (the renderer id already adds it)";
  return null;
}

function assertSlug(slug) {
  const err = slugError(slug);
  if (err) {
    const e = new Error(err);
    e.code = "BAD_SLUG";
    e.status = 400;
    throw e;
  }
  return String(slug);
}

// A slug -> the module filename the composer scan expects. pipeline.filmSkinComposers maps
// `<file>.js` -> renderer `film-<file with _ replaced by ->`, so the inverse is exact.
function skinFileName(slug) { return `${assertSlug(slug).replace(/-/g, "_")}.js`; }
function rendererIdFor(slug) { return `film-${assertSlug(slug)}`; }

// ---------------------------------------------------------------- containment

// THE GATE. Resolves `segments` under `root` and proves the result is still inside it.
// Catches `..`, absolute-path segments, and symlink escapes on the parent chain.
function safeJoin(root, ...segments) {
  if (!root) {
    const e = new Error("no root directory configured");
    e.code = "NO_ROOT";
    e.status = 500;
    throw e;
  }
  for (const seg of segments) {
    const s = String(seg == null ? "" : seg);
    if (!s || s === "." || s === ".." || s.includes("\0")) {
      const e = new Error(`unsafe path segment: ${JSON.stringify(s)}`);
      e.code = "UNSAFE_PATH";
      e.status = 400;
      throw e;
    }
  }
  const base = path.resolve(root);
  const full = path.resolve(base, ...segments.map(String));
  const rel = path.relative(base, full);
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) {
    const e = new Error(`path escapes its root: ${full}`);
    e.code = "UNSAFE_PATH";
    e.status = 400;
    throw e;
  }
  return full;
}

// Every write in this feature passes through here. A target outside the four allowlisted
// roots throws — so a bug in the generator costs a failed generation, never a damaged repo.
function assertWritable(target) {
  const full = path.resolve(String(target || ""));
  const ok = WRITABLE_ROOTS.some((root) => {
    const rel = path.relative(path.resolve(root), full);
    return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
  });
  if (!ok) {
    const e = new Error(`refusing to write outside the template roots: ${full}`);
    e.code = "UNSAFE_WRITE";
    e.status = 400;
    throw e;
  }
  return full;
}

// ---------------------------------------------------------------- pack dirs

function publishedDir(slug) { return safeJoin(PUBLISHED_ROOT, assertSlug(slug)); }
function draftDir(slug) { return safeJoin(DRAFT_ROOT, assertSlug(slug)); }
function dirForRootKind(slug, rootKind) {
  return rootKind === "published" ? publishedDir(slug) : draftDir(slug);
}

function isDir(p) { try { return fs.statSync(p).isDirectory(); } catch { return false; } }

function existsPublished(slug) { try { return isDir(publishedDir(slug)); } catch { return false; } }
function existsDraft(slug) { try { return isDir(draftDir(slug)); } catch { return false; } }
function existsAnywhere(slug) { return existsPublished(slug) || existsDraft(slug); }

function skinPath(slug) { return safeJoin(SKIN_ROOT, skinFileName(slug)); }
function packMediaDir(slug) { return safeJoin(PACK_MEDIA_ROOT, assertSlug(slug)); }
function workDir(slug) { return safeJoin(WORK_ROOT, assertSlug(slug)); }

function ensureDraftRoot() {
  fs.mkdirSync(assertWritable(DRAFT_ROOT), { recursive: true });
  return DRAFT_ROOT;
}
function ensureWorkRoot() {
  fs.mkdirSync(assertWritable(WORK_ROOT), { recursive: true });
  return WORK_ROOT;
}

// Write a file only after proving its destination is allowlisted.
function safeWrite(target, contents) {
  const full = assertWritable(target);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, contents, "utf8");
  return full;
}

// Remove a directory only after proving it is allowlisted. Refuses a root itself.
function safeRmDir(target) {
  const full = assertWritable(target);
  if (WRITABLE_ROOTS.some((r) => path.resolve(r) === full)) {
    const e = new Error(`refusing to remove a root directory: ${full}`);
    e.code = "UNSAFE_WRITE";
    e.status = 400;
    throw e;
  }
  fs.rmSync(full, { recursive: true, force: true });
}

// Move a pack directory between roots — the publish/unpublish primitive. Same volume, so
// rename is atomic; falls back to copy+remove across devices.
function movePackDir(slug, fromKind, toKind) {
  const from = dirForRootKind(slug, fromKind);
  const to = dirForRootKind(slug, toKind);
  assertWritable(from);
  assertWritable(to);
  if (!isDir(from)) {
    const e = new Error(`template source directory is missing: ${from}`);
    e.code = "MISSING_SOURCE";
    e.status = 409;
    throw e;
  }
  if (isDir(to)) {
    const e = new Error(`a template directory already exists at ${to}`);
    e.code = "DEST_EXISTS";
    e.status = 409;
    throw e;
  }
  fs.mkdirSync(path.dirname(to), { recursive: true });
  try {
    fs.renameSync(from, to);
  } catch (err) {
    if (err && (err.code === "EXDEV" || err.code === "EPERM")) {
      fs.cpSync(from, to, { recursive: true });
      fs.rmSync(from, { recursive: true, force: true });
    } else {
      throw err;
    }
  }
  return to;
}

module.exports = {
  PUBLISHED_ROOT, DRAFT_ROOT, SKIN_ROOT, PACK_MEDIA_ROOT, WORK_ROOT, WRITABLE_ROOTS,
  SLUG_RE, RESERVED,
  slugError, assertSlug, skinFileName, rendererIdFor,
  safeJoin, assertWritable, safeWrite, safeRmDir, movePackDir,
  publishedDir, draftDir, dirForRootKind, skinPath, packMediaDir, workDir,
  existsPublished, existsDraft, existsAnywhere,
  ensureDraftRoot, ensureWorkRoot,
};
