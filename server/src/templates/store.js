// TEMPLATE STORE — lifecycle + metadata for admin-authored templates.
//
// A standalone JSON store, which is this repo's established pattern for a new entity
// (auth/store.js, asset_sources/local_db.js, music_history.js all use the identical
// debounced tmp+rename idiom). It is deliberately NOT part of db.js: that store's boot
// recovery force-fails every `queued`/`running` row, so a GENERATING template would be
// orphaned by a restart; its `shape()` is a hand-maintained whitelist that would hide every
// new field; and its `countJobsSince` ignores `kind` while enforcing the 100/day job cap, so
// generating templates would start returning 429 to real users.
//
// THE RECORD IS METADATA, NOT AUTHORITY. Whether a template is visible to users is decided
// by which directory its pack lives in (templates/paths.js), never by the `status` field
// here. This file keeps the two in step; if it ever fails to, the filesystem wins and the
// safe outcome (invisible) is the default.

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const config = require("../config");
const paths = require("./paths");
const lifecycle = require("./lifecycle");

const DIR = path.join(config.paths.root, "data");
const FILE = path.join(DIR, "templates.json");

let state = { templates: [] };
try {
  const parsed = JSON.parse(fs.readFileSync(FILE, "utf8"));
  if (parsed && Array.isArray(parsed.templates)) state.templates = parsed.templates;
} catch { /* fresh store */ }

// CRASH RECOVERY — the thing this file's own header criticised db.js for doing to a template and
// then failed to do itself.
//
// GENERATING and TESTING are in-flight statuses held by a promise in the process. If the process
// dies mid-run, the row keeps that status forever and becomes UNREACHABLE: lifecycle.TRANSITIONS
// allows only GENERATED/FAILED out of GENERATING and nothing the admin can click performs those;
// ACTIONS offers "cancel", for which no route exists; and DELETABLE excludes both statuses, so the
// row cannot even be removed. Its slug is then permanently refused by store.create and by
// paths.existsAnywhere — a graveyard row holding a good name.
//
// FAILED is the honest landing place: it already offers retry, regenerate and delete.
// A LIVE ROW AND AN ORPHANED ONE LOOK IDENTICAL — except for age.
//
// This store is a file, and many short-lived processes read it: the test scripts, one-off `node -e`
// checks, the pack generators. Every one of them loads this module while the SERVER may be
// mid-generation. An unconditional sweep at load therefore has a process with no in-flight work
// declaring another process's in-flight work dead — which would mark a running batch's template
// FAILED and leave the orchestrator writing to a row it no longer owns.
//
// The distinguishing signal is `updatedAt`: every stage of a generation writes progress, so a live
// row is touched continuously and an orphaned one stops the moment its process died. Anything
// quiet for longer than this is not running anywhere.
const STALE_MS = 30 * 60 * 1000;

/**
 * @param {{force?: boolean}} opts `force` sweeps every in-flight row regardless of age, and is for
 * the SERVER at boot only — it is the process that owns this work, so if it is starting up,
 * nothing else is running any of it.
 */
function recoverInterrupted({ force = false, ids = null } = {}) {
  let n = 0;
  const now = Date.now();
  const only = ids ? new Set(ids) : null;      // the guard's scalpel: sweep these rows and no others
  for (const t of state.templates) {
    if (only && !only.has(t.id)) continue;
    if (t.status === lifecycle.STATUS.GENERATING || t.status === lifecycle.STATUS.TESTING) {
      if (!force && now - (t.updatedAt || 0) < STALE_MS) continue;
      // Read the previous status BEFORE overwriting it — reading it after always reports
      // "generating", because the comparison is then against FAILED.
      const was = t.status === lifecycle.STATUS.TESTING ? "testing" : "generating";
      t.status = lifecycle.STATUS.FAILED;
      t.error = `interrupted by a server restart while ${was}`;
      t.progress = "Interrupted";
      t.progressPct = 100;
      t.updatedAt = Date.now();
      n++;
    }
  }
  if (n) {
    console.warn(`[templates] ${n} template(s) were in-flight at shutdown — marked FAILED so they can be retried or deleted`);
    flush();
  }
}

let writeTimer = null;
function persist() {
  if (writeTimer) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    flush();
  }, 50);
  if (writeTimer.unref) writeTimer.unref();
}

// Synchronous write, used by persist() and by every operation that must be durable BEFORE
// it returns (any transition that moved a directory).
function flush() {
  try {
    fs.mkdirSync(DIR, { recursive: true });
    const tmp = FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2), "utf8");
    fs.renameSync(tmp, FILE);
    return true;
  } catch (e) {
    console.warn(`[templates] store write failed: ${e.message}`);
    return false;
  }
}

// ---------------------------------------------------------------- read

const byId = (id) => state.templates.find((t) => t.id === id) || null;
const bySlug = (slug) => state.templates.find((t) => t.slug === slug) || null;

function get(id) { return byId(id); }
function getBySlug(slug) { return bySlug(slug); }

// Every slug this store knows about, whatever its status. The pack generator consults this
// so a bulk `gen-film-packs` run cannot materialise an unpublished template into frames/.
function knownSlugs() { return state.templates.map((t) => t.slug); }
function unpublishedSlugs() {
  return state.templates.filter((t) => t.status !== lifecycle.STATUS.PUBLISHED).map((t) => t.slug);
}

function list({ status, q, family, limit = 200 } = {}) {
  let rows = state.templates.slice();
  if (status) {
    const wanted = Array.isArray(status) ? status : [status];
    rows = rows.filter((t) => wanted.includes(t.status));
  }
  if (family) rows = rows.filter((t) => t.family === family);
  if (q) {
    const needle = String(q).trim().toLowerCase();
    if (needle) {
      rows = rows.filter((t) =>
        String(t.name || "").toLowerCase().includes(needle)
        || String(t.slug || "").toLowerCase().includes(needle)
        || (Array.isArray(t.tags) && t.tags.some((tag) => String(tag).toLowerCase().includes(needle))));
    }
  }
  rows.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return rows.slice(0, limit);
}

// All versions of one family, oldest first — the version history panel.
function versions(family) {
  return state.templates
    .filter((t) => t.family === family)
    .sort((a, b) => (a.version || 0) - (b.version || 0));
}

function nextVersion(family) {
  const rows = versions(family);
  return rows.length ? Math.max(...rows.map((t) => Number(t.version) || 1)) + 1 : 1;
}

// The one row of a family that is currently live, if any.
//
// EXACTLY ONE. Nothing structurally prevented two versions of a family from being PUBLISHED at
// once — publishing v2 left v1 in frames/, so the gallery listed both under the same name and a
// user's "auto" pick could land on either. service.runPublish now supersedes the incumbent using
// this lookup, and publishedSiblings() below is what it asks with.
function publishedOf(family) {
  return state.templates.find((t) => t.family === family && t.status === lifecycle.STATUS.PUBLISHED) || null;
}

// Every live row of a family EXCEPT the given id — plural on purpose, so a store that somehow
// already holds two live rows is repaired by the next publish rather than half-repaired.
function publishedSiblings(family, exceptId) {
  return state.templates.filter((t) => t.family === family && t.id !== exceptId && t.status === lifecycle.STATUS.PUBLISHED);
}

// ---------------------------------------------------------------- issues
//
// WHAT A REAL FILM TAUGHT US ABOUT A TEMPLATE, kept where the fix will happen. A defect found by
// watching a generated video ("the screenshot is too small at 9:16") is the single most valuable
// input to the next version, and before this it lived nowhere — the admin either fixed it from
// memory or lost it. Issues are recorded against the VERSION they were seen on and carried
// forward, still open, onto the version created to fix them.
const ISSUE_CATEGORIES = Object.freeze([
  "layout", "typography", "animation", "assets", "brand", "responsive", "audio", "rendering", "performance", "other",
]);
const ISSUE_SEVERITIES = Object.freeze(["low", "medium", "high", "critical"]);

function addIssue(id, { title, category, severity, detail, suggestedFix, by, fromVersion } = {}) {
  const rec = byId(id);
  if (!rec) return null;
  const text = String(title || "").trim();
  if (!text) {
    const e = new Error("an issue needs a title");
    e.code = "BAD_ISSUE";
    e.status = 400;
    throw e;
  }
  const issue = {
    id: crypto.randomUUID(),
    title: text.slice(0, 200),
    category: ISSUE_CATEGORIES.includes(String(category)) ? String(category) : "other",
    severity: ISSUE_SEVERITIES.includes(String(severity)) ? String(severity) : "medium",
    detail: String(detail || "").slice(0, 4000),
    suggestedFix: String(suggestedFix || "").slice(0, 2000),
    status: "open",
    // Which version it was SEEN on. Survives being carried forward, so v4 still shows that the
    // defect was first observed on v2.
    fromVersion: Number(fromVersion) || Number(rec.version) || 1,
    by: by || null,
    at: Date.now(),
    resolvedAt: null,
  };
  rec.issues = [issue, ...(Array.isArray(rec.issues) ? rec.issues : [])].slice(0, 200);
  rec.updatedAt = Date.now();
  flush();
  return issue;
}

function setIssueStatus(id, issueId, status) {
  const rec = byId(id);
  if (!rec || !Array.isArray(rec.issues)) return null;
  const issue = rec.issues.find((i) => i.id === issueId);
  if (!issue) return null;
  issue.status = status === "resolved" ? "resolved" : "open";
  issue.resolvedAt = issue.status === "resolved" ? Date.now() : null;
  rec.updatedAt = Date.now();
  flush();
  return issue;
}

function openIssues(rec) {
  return (Array.isArray(rec && rec.issues) ? rec.issues : []).filter((i) => i.status !== "resolved");
}

// ---------------------------------------------------------------- family rollup
//
// One row per template family for the dashboard: which version is live, which is being worked on,
// what QA said, how many issues are open. Computed here rather than in the client so the two
// cannot disagree about what "current" means.
function familySummary(family) {
  const rows = versions(family);
  if (!rows.length) return null;
  const live = rows.find((t) => t.status === lifecycle.STATUS.PUBLISHED) || null;
  const draft = rows
    .filter((t) => ![lifecycle.STATUS.PUBLISHED, lifecycle.STATUS.SUPERSEDED, lifecycle.STATUS.ARCHIVED].includes(t.status))
    .sort((a, b) => (b.version || 0) - (a.version || 0))[0] || null;
  const newest = rows[rows.length - 1];
  const head = live || draft || newest;
  return {
    family,
    name: head.name,
    orientation: head.orientation,
    versionCount: rows.length,
    published: live ? { id: live.id, version: live.version, slug: live.slug, publishedAt: live.publishedAt, qaScore: live.qa ? live.qa.score : null } : null,
    draft: draft ? { id: draft.id, version: draft.version, slug: draft.slug, status: draft.status, qaScore: draft.qa ? draft.qa.score : null } : null,
    openIssues: rows.reduce((n, t) => n + openIssues(t).length, 0),
    lastTest: head.lastTest || null,
    updatedAt: Math.max(...rows.map((t) => t.updatedAt || 0)),
  };
}

function familySummaries() {
  const seen = new Set();
  const out = [];
  for (const t of state.templates) {
    if (seen.has(t.family)) continue;
    seen.add(t.family);
    const s = familySummary(t.family);
    if (s) out.push(s);
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

// ---------------------------------------------------------------- write

function create({ slug, name, family, version, prompt, options, orientation, description, category, tags, createdBy }) {
  paths.assertSlug(slug);
  if (bySlug(slug)) {
    const e = new Error(`a template with slug "${slug}" already exists`);
    e.code = "SLUG_TAKEN";
    e.status = 409;
    throw e;
  }
  // A slug that already names a pack on disk but has no record is a LEGACY pack (one of the
  // 135 shipped ones). Refusing it protects them from being overwritten by a generation.
  if (paths.existsAnywhere(slug)) {
    const e = new Error(`"${slug}" is an existing template directory — choose another name`);
    e.code = "SLUG_TAKEN";
    e.status = 409;
    throw e;
  }
  const now = Date.now();
  const rec = {
    id: crypto.randomUUID(),
    slug,
    family: family || slug,
    version: Number(version) || 1,
    status: lifecycle.STATUS.DRAFT,
    name: String(name || slug),
    description: description ? String(description) : "",
    category: category ? String(category) : "Animated",
    tags: Array.isArray(tags) ? tags.map(String).slice(0, 12) : [],
    orientation: orientation || "portrait",
    renderer: paths.rendererIdFor(slug),
    sourcePath: path.posix.join("src/services/film_skins", paths.skinFileName(slug)),
    prompt: String(prompt || ""),
    options: options && typeof options === "object" ? options : {},
    spec: null,
    capabilities: null,
    assetRequirements: null,
    audio: null,
    thumbnail: null,
    previewVideo: null,
    stills: [],
    qa: null,
    tests: [],
    // The resolved outcome of the most recent test render (test_render.refreshTests reads the job
    // back out of db.js). Publishing consults it; the dashboard shows it.
    lastTest: null,
    // Defects observed on this version, carried forward by service.newVersion.
    issues: [],
    error: null,
    // VERSION LINEAGE. `parentId` is the row this one was cloned from, which is what makes the
    // history a chain rather than a list that happens to share a family name; `changes` is the
    // admin's own note about what this version is for.
    parentId: null,
    changes: "",
    supersededAt: null,
    supersededBy: null,
    createdBy: createdBy || null,
    createdAt: now,
    updatedAt: now,
    publishedAt: null,
    archivedAt: null,
  };
  state.templates.push(rec);
  flush();
  return rec;
}

// Patch metadata WITHOUT touching status. Status only ever moves through transition().
function update(id, patch = {}) {
  const rec = byId(id);
  if (!rec) return null;
  for (const [k, v] of Object.entries(patch)) {
    if (k === "id" || k === "slug" || k === "status" || k === "family" || k === "version" || k === "createdAt") continue;
    rec[k] = v;
  }
  rec.updatedAt = Date.now();
  persist();
  return rec;
}

// THE ONLY WAY STATUS CHANGES.
//
// Order matters and is chosen for the safe failure: the directory moves FIRST, then the
// record is written. A successful move with a failed record write leaves the filesystem
// correct (which is what decides visibility) and the metadata stale. The reverse order
// could mark a template PUBLISHED while its pack is still in the draft root — a row that
// claims to be live and is not. On a record-write failure the move is rolled back.
function transition(id, to, patch = {}) {
  const rec = byId(id);
  if (!rec) {
    const e = new Error("template not found");
    e.code = "NOT_FOUND";
    e.status = 404;
    throw e;
  }
  lifecycle.assertTransition(rec.status, to);

  const fromKind = lifecycle.rootKindFor(rec.status);
  const toKind = lifecycle.rootKindFor(to);
  let moved = false;
  if (fromKind !== toKind) {
    paths.ensureDraftRoot();
    paths.movePackDir(rec.slug, fromKind, toKind);
    moved = true;
  }

  const prev = { ...rec };
  try {
    rec.status = to;
    for (const [k, v] of Object.entries(patch)) {
      if (k === "id" || k === "slug" || k === "status" || k === "createdAt") continue;
      rec[k] = v;
    }
    rec.updatedAt = Date.now();
    if (to === lifecycle.STATUS.PUBLISHED) { rec.publishedAt = Date.now(); rec.supersededAt = null; rec.supersededBy = null; }
    if (to === lifecycle.STATUS.SUPERSEDED) rec.supersededAt = Date.now();
    if (to === lifecycle.STATUS.ARCHIVED) rec.archivedAt = Date.now();
    if (to !== lifecycle.STATUS.FAILED) rec.error = patch.error !== undefined ? patch.error : null;
    if (!flush()) throw new Error("could not persist the template record");
  } catch (err) {
    Object.assign(rec, prev);
    if (moved) {
      try { paths.movePackDir(rec.slug, toKind, fromKind); }
      catch (e2) { console.error(`[templates] ROLLBACK FAILED for ${rec.slug}: ${e2.message} — pack dir is in the ${toKind} root but the record says ${prev.status}`); }
    }
    throw err;
  }
  return rec;
}

// Mark a generation/test failure without going through a caller's try/catch every time.
function fail(id, message) {
  const rec = byId(id);
  if (!rec) return null;
  const msg = String(message || "unknown error").slice(0, 2000);
  if (!lifecycle.canTransition(rec.status, lifecycle.STATUS.FAILED)) {
    // Already terminal (PUBLISHED/ARCHIVED) — record the error, keep the status.
    rec.error = msg;
    rec.updatedAt = Date.now();
    persist();
    return rec;
  }
  return transition(id, lifecycle.STATUS.FAILED, { error: msg });
}

function remove(id) {
  const rec = byId(id);
  if (!rec) return false;
  if (!lifecycle.canDelete(rec.status)) {
    const e = new Error(`a ${rec.status} template cannot be deleted`);
    e.code = "ILLEGAL_DELETE";
    e.status = 409;
    throw e;
  }
  // Remove artifacts before the record, so a partial failure leaves a row pointing at the
  // leftovers rather than orphaned files nothing knows about.
  try { paths.safeRmDir(paths.dirForRootKind(rec.slug, lifecycle.rootKindFor(rec.status))); } catch { /* already gone */ }
  try { paths.safeRmDir(paths.packMediaDir(rec.slug)); } catch { /* never existed */ }
  try { paths.safeRmDir(paths.workDir(rec.slug)); } catch { /* never existed */ }
  try {
    const skin = paths.skinPath(rec.slug);
    paths.assertWritable(skin);
    fs.rmSync(skin, { force: true });
  } catch { /* never existed */ }
  state.templates = state.templates.filter((t) => t.id !== id);
  flush();
  return true;
}

// A record plus the things the UI derives from it, so the client never re-implements the
// lifecycle table. `sourceExists` is measured, not assumed — a missing directory is exactly
// the condition that must block a publish.
function shape(rec) {
  if (!rec) return null;
  const rootKind = lifecycle.rootKindFor(rec.status);
  let sourceExists = false;
  try { sourceExists = fs.existsSync(path.join(paths.dirForRootKind(rec.slug, rootKind), "pack.json")); } catch { /* stays false */ }
  let skinExists = false;
  try { skinExists = fs.existsSync(paths.skinPath(rec.slug)); } catch { /* stays false */ }
  return {
    ...rec,
    issues: Array.isArray(rec.issues) ? rec.issues : [],
    actions: lifecycle.actionsFor(rec.status),
    canDelete: lifecycle.canDelete(rec.status),
    isPublic: rec.status === lifecycle.STATUS.PUBLISHED,
    openIssueCount: openIssues(rec).length,
    rootKind,
    sourceExists,
    skinExists,
  };
}

// RUN IT. The function above was written, documented and never called — so every restart left
// GENERATING/TESTING rows exactly as unreachable as its own comment says they are. At module load
// it runs in its CONSERVATIVE form (age-based), because this module is loaded by short-lived
// scripts as well as by the server; server.js calls it again with force:true at boot, which is the
// one moment nothing else can be running.
recoverInterrupted();

module.exports = {
  FILE, ISSUE_CATEGORIES, ISSUE_SEVERITIES, recoverInterrupted,
  get, getBySlug, list, versions, nextVersion, publishedOf, publishedSiblings, knownSlugs, unpublishedSlugs,
  create, update, transition, fail, remove, shape, flush,
  addIssue, setIssueStatus, openIssues, familySummary, familySummaries,
};
