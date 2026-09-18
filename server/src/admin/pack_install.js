// PACK INSTALLS — moving a template's draft pack into the live library and back.
//
// WHY PUBLISH IS A DIRECTORY RENAME AND NOT A FLAG: frame_registry.listPacks() is
// a live readdirSync filtered on FRAME.md existing, with no cache — a pack is live
// the instant its folder lands in frames/. Drafts are therefore built under
// frames-draft/ and publishing stages a copy and renames it in. No consumer needs
// a status filter, and there is no half-published state to leak.

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const config = require("../config");
const jobs = require("../models/job");
const store = require("../models/template");
const frameRegistry = require("../services/frame_registry");
const { PackManifestSchema } = require("../services/frame_manifest");

// A publish/test install stamps this file into the pack folder it creates.
// UNPUBLISH and the test-install sweeper refuse to delete a directory in frames/
// that does not carry it — the one thing in this module that can destroy a live
// pack must never be able to fire on one of the 203 hand-built ones.
const MARKER = ".admin-template.json";
// Staging lives one level BELOW frames/ (frames/.publish-tmp/<slug>-<rand>/) so
// the half-copied tree is invisible to listPacks(), which only ever looks for
// frames/<name>/FRAME.md. Renaming out of it is atomic and same-volume.
const TMP_DIR = ".publish-tmp";
// A test render that never reports back (crashed worker, closed tab) must not
// leave a draft pack sitting in the live library forever.
const TEST_INSTALL_TTL_MS = 45 * 60 * 1000;

const THUMB_NAMES = ["poster.jpg", "poster.png", "thumbnail.jpg", "thumbnail.png", "thumb.jpg", "thumb.png"];
const PREVIEW_NAMES = ["preview.mp4", "preview.webm"];

// ---------------------------------------------------------------- fs helpers
function isDir(p) { try { return !!p && fs.statSync(p).isDirectory(); } catch { return false; } }
function isFile(p) { try { return !!p && fs.statSync(p).isFile(); } catch { return false; } }

// Every destructive call in this module goes through this: a path we are about to
// delete must provably sit inside the directory we think it does.
function inside(parent, child) {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return !!rel && !rel.startsWith("..") && !path.isAbsolute(rel);
}

function readMarker(dir) {
  try { return JSON.parse(fs.readFileSync(path.join(dir, MARKER), "utf8")); } catch { return null; }
}

// Copy a tree into frames/.publish-tmp/… (or public/frames/.publish-tmp/…) and
// return the staged path. The caller renames it into place, so a crash mid-copy
// leaves a temp directory nobody reads instead of a half-written live pack.
function stage(srcDir, destDir) {
  const tmp = path.join(path.dirname(destDir), TMP_DIR, `${path.basename(destDir)}-${crypto.randomBytes(4).toString("hex")}`);
  fs.mkdirSync(path.dirname(tmp), { recursive: true });
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.cpSync(srcDir, tmp, { recursive: true });
  return tmp;
}

function dropTmp(destDir) {
  const dir = path.join(path.dirname(destDir), TMP_DIR);
  try { fs.rmdirSync(dir); } catch { /* not empty / not there — another publish owns it */ }
}

// Where a version's thumbnail/preview actually is on disk. The generator may
// record an absolute path, a public URL ("/frames-draft/<slug>/v1/poster.jpg") or
// a bare filename, and publish must not fail closed on a spelling difference —
// so every plausible reading is tried, then the conventional names.
function resolveMedia(mediaDir, ref, fallbacks) {
  const tries = [];
  if (ref) {
    const s = String(ref);
    if (path.isAbsolute(s)) tries.push(s);
    else {
      tries.push(path.join(mediaDir, s.replace(/^\/+/, "")));
      tries.push(path.join(mediaDir, path.basename(s)));
      tries.push(path.join(config.paths.root, "public", s.replace(/^\/+/, "")));
    }
  }
  for (const name of fallbacks) tries.push(path.join(mediaDir, name));
  // A ref is written by the generator, not by a request — but this feeds a
  // publish gate and then a copy, so a "../.." in one must never let anything
  // outside the draft media tree count as a template's preview.
  return tries.find((p) => isFile(p) && inside(store.DRAFT_MEDIA, p)) || null;
}

// A version's generated source must have left both files the registry needs.
function missingSourceFiles(t, version) {
  const dir = store.draftSourceDir(t.slug, version);
  return { dir, missing: ["pack.json", "FRAME.md"].filter((f) => !isFile(path.join(dir, f))) };
}

// ---------------------------------------------------------------- QA verdicts
// QA results arrive from a sibling module; read the blocking list under any of the
// names it might use and treat "unreadable" as "not clean".
function qaErrors(qa) {
  if (!qa || typeof qa !== "object") return [{ message: "QA results are unreadable" }];
  const list = qa.errors || qa.blockers || qa.blocking || [];
  return Array.isArray(list) ? list : [{ message: "QA results are unreadable" }];
}
function qaText(e) {
  if (typeof e === "string") return e.slice(0, 160);
  return String((e && (e.message || e.detail || e.rule)) || "unnamed issue").slice(0, 160);
}

// ---------------------------------------------------------------- publish gate
// PUBLISH FAILS CLOSED. Every reason a template is not shippable is collected and
// returned at once as human-readable lines, because the admin's brief shows the
// exact list — a gate that returned only the first failure would make publishing
// a guessing game.
function publishBlockers(t) {
  const blocking = [];
  const v = t.currentVersion ? store.getVersion(t.id, t.currentVersion) : null;
  if (!v) {
    blocking.push("no generated version on record — run generate first");
    return { blocking, version: null };
  }

  const srcDir = store.draftSourceDir(t.slug, v.version);
  const mediaDir = store.draftMediaDir(t.slug, v.version);
  const manifestPath = path.join(srcDir, "pack.json");
  const framePath = path.join(srcDir, "FRAME.md");

  if (!isDir(srcDir)) blocking.push(`draft source directory is missing (${srcDir})`);
  if (!isFile(manifestPath)) blocking.push("draft source has no pack.json");
  if (!isFile(framePath)) blocking.push("draft source has no FRAME.md — frame_registry would not list the pack");

  if (isFile(manifestPath)) {
    try {
      const parsed = PackManifestSchema.parse(JSON.parse(fs.readFileSync(manifestPath, "utf8")));
      if (parsed.name !== t.slug) blocking.push(`pack.json name "${parsed.name}" does not match the slug "${t.slug}"`);
    } catch (e) {
      blocking.push(`pack.json fails PackManifestSchema: ${String(e && e.message ? e.message : e).split("\n")[0]}`);
    }
  }

  const thumb = resolveMedia(mediaDir, v.thumbnail || t.thumbnail, THUMB_NAMES);
  const preview = resolveMedia(mediaDir, v.previewVideo || t.previewVideo, PREVIEW_NAMES);
  if (!thumb) blocking.push("no thumbnail on this version — run preview first");
  if (!preview) blocking.push("no preview video on this version — run preview first");

  const qa = v.qaResults;
  if (!qa) blocking.push("QA has never run on this version");
  else {
    const errors = qaErrors(qa);
    if (errors.length) blocking.push(`QA reports ${errors.length} blocking issue(s): ${errors.slice(0, 5).map((e) => qaText(e)).join(" · ")}`);
  }

  // Last line of defence on the slug. createTemplate already refused a colliding
  // slug, but a hand-built pack could have landed in frames/ in the meantime, and
  // publish is a rename that would swallow it.
  const liveDir = store.liveSourceDir(t.slug);
  if (isDir(liveDir)) {
    const m = readMarker(liveDir);
    blocking.push(m && m.test === true && m.templateId === t.id
      ? `frames/${t.slug} currently holds a temporary TEST install of this template — publish once the test render has finished`
      : `frames/${t.slug} already exists — publishing would overwrite an installed pack`);
  } else if (frameRegistry.listAllPacks().includes(t.slug)) {
    blocking.push(`"${t.slug}" is already a registered pack`);
  }

  return { blocking, version: v, srcDir, mediaDir, thumb, preview };
}

// Copy a gated version into the live library. Throws on a copy failure, having
// rolled back anything it had already landed. Returns the live source dir.
function publishVersion(t, { version: v, srcDir, mediaDir }, publishedBy) {
  const liveSrc = store.liveSourceDir(t.slug);
  const liveMedia = store.liveMediaDir(t.slug);
  let mediaLanded = false;
  try {
    // Media first, source last. The pack goes live the moment its SOURCE folder
    // lands (listPacks is uncached), so its poster/preview must already be in
    // place or the gallery shows a pack with dead media.
    if (isDir(mediaDir)) {
      const tmpMedia = stage(mediaDir, liveMedia);
      fs.renameSync(tmpMedia, liveMedia);
      dropTmp(liveMedia);
      mediaLanded = true;
    }
    const tmpSrc = stage(srcDir, liveSrc);
    fs.writeFileSync(path.join(tmpSrc, MARKER), JSON.stringify({
      templateId: t.id, slug: t.slug, version: v.version, test: false,
      publishedBy, at: Date.now(),
    }, null, 2));
    fs.renameSync(tmpSrc, liveSrc);
    dropTmp(liveSrc);
  } catch (e) {
    // Roll the media back so a failed publish leaves nothing of itself behind.
    if (mediaLanded && inside(store.LIVE_MEDIA, liveMedia)) {
      try { fs.rmSync(liveMedia, { recursive: true, force: true }); } catch { /* noop */ }
    }
    throw e;
  }
  return liveSrc;
}

// Remove a template's live copy (source + media). Returns { removed } or
// { blocking } — it will not delete a directory in frames/ that this pipeline did
// not stamp, so a slug that somehow points at a hand-built pack is refused rather
// than erased.
function takeDown(t) {
  const liveSrc = store.liveSourceDir(t.slug);
  const liveMedia = store.liveMediaDir(t.slug);
  const removed = [];
  if (isDir(liveSrc)) {
    const marker = readMarker(liveSrc);
    if (!marker || marker.templateId !== t.id) {
      return { blocking: [`frames/${t.slug} carries no ${MARKER} for this template — refusing to delete a pack this pipeline did not publish`] };
    }
    if (!inside(store.LIVE_SRC, liveSrc)) return { blocking: [`${liveSrc} is not inside the frames directory`] };
    try { fs.rmSync(liveSrc, { recursive: true, force: true }); removed.push(liveSrc); }
    catch (e) { return { blocking: [`could not remove ${liveSrc}: ${e.message}`] }; }
  }
  if (isDir(liveMedia) && inside(store.LIVE_MEDIA, liveMedia)) {
    // Media is derived output; a failure here must not block the retraction that
    // already took the pack out of the registry.
    try { fs.rmSync(liveMedia, { recursive: true, force: true }); removed.push(liveMedia); }
    catch (e) { console.warn(`[admin/templates] could not remove ${liveMedia}: ${e.message}`); }
  }
  console.log(`[admin/templates] unpublished ${t.slug} (${removed.length} path(s) removed)`);
  return { removed };
}

// The record is gone, so the draft trees under frames-draft/ are unreachable
// garbage. Removing them is best-effort: a locked file must not turn a
// successful delete into a 500.
function removeDraftTrees(t) {
  for (const root of [store.DRAFT_SRC, store.DRAFT_MEDIA]) {
    const dir = path.join(root, t.slug);
    if (!inside(root, dir)) continue;
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { console.warn(`[admin/templates] draft cleanup failed for ${dir}: ${e.message}`); }
  }
}

// ---------------------------------------------------------------- test installs
// A test render goes through the REAL pipeline, and the pipeline only sees packs
// that are in frames/ — frame_registry has no notion of a staging directory. So a
// test temporarily installs the draft as a live pack, stamped with the marker
// file, and takes it down the moment the job settles. This is the one window in
// which unpublished work is reachable by pack auto-selection; it is minutes long,
// admin-triggered, and swept at boot (see sweepTestInstalls).

// Who holds frames/<slug> right now, from this template's point of view.
function testSlot(t, v) {
  const live = store.liveSourceDir(t.slug);
  const liveExists = isDir(live);
  const marker = liveExists ? readMarker(live) : null;
  const ourTestInstall = !!(marker && marker.test === true && marker.templateId === t.id);
  // The published copy IS this version, so test it exactly as a user would get
  // it — no staging, and nothing to tear down afterwards.
  const ourPublished = !!(marker && marker.test === false && marker.templateId === t.id
    && t.status === store.STATUS.PUBLISHED && marker.version === v.version);
  return { occupied: liveExists && !ourTestInstall && !ourPublished, ourTestInstall, ourPublished };
}

function installForTest(t, v, jobId) {
  const dest = store.liveSourceDir(t.slug);
  const tmp = stage(store.draftSourceDir(t.slug, v.version), dest);
  fs.writeFileSync(path.join(tmp, MARKER), JSON.stringify({
    templateId: t.id, slug: t.slug, version: v.version, test: true, jobId, at: Date.now(),
  }, null, 2));
  fs.renameSync(tmp, dest);
  dropTmp(dest);
  return dest;
}

function removeTestInstall(slug, jobId) {
  const dir = store.liveSourceDir(slug);
  const marker = readMarker(dir);
  if (!marker || marker.test !== true) return false;              // not ours — never touch it
  if (jobId && marker.jobId && marker.jobId !== jobId) return false; // a newer test owns it now
  if (!inside(store.LIVE_SRC, dir)) return false;
  try {
    fs.rmSync(dir, { recursive: true, force: true });
    console.log(`[admin/templates] removed test install frames/${slug}`);
    return true;
  } catch (e) {
    console.warn(`[admin/templates] could not remove test install frames/${slug}: ${e.message}`);
    return false;
  }
}

function watchTestJob(slug, jobId) {
  const started = Date.now();
  const timer = setInterval(() => {
    let settled = false;
    try {
      const j = jobs.getRaw(jobId);
      settled = !j || j.status === "done" || j.status === "failed";
    } catch { settled = false; }
    if (!settled && Date.now() - started < TEST_INSTALL_TTL_MS) return;
    clearInterval(timer);
    removeTestInstall(slug, jobId);
  }, 5000);
  timer.unref?.();
}

// Boot sweep. A restart kills the watcher above, so any surviving test install is
// orphaned — and an orphaned draft in frames/ is exactly the leak this design
// exists to prevent. Fail closed: the pack goes, even if that costs a requeued
// test render its pinned pack.
function sweepTestInstalls() {
  if (!store.LIVE_SRC) return;
  let removed = 0;
  let entries = [];
  try { entries = fs.readdirSync(store.LIVE_SRC, { withFileTypes: true }); } catch { return; }
  for (const d of entries) {
    if (!d.isDirectory()) continue;
    const marker = readMarker(path.join(store.LIVE_SRC, d.name));
    if (marker && marker.test === true && removeTestInstall(d.name, null)) removed++;
  }
  // Staging left behind by a publish that died mid-copy: nothing reads it, but it
  // is dead weight in frames/.
  try { fs.rmSync(path.join(store.LIVE_SRC, TMP_DIR), { recursive: true, force: true }); } catch { /* noop */ }
  try { fs.rmSync(path.join(store.LIVE_MEDIA, TMP_DIR), { recursive: true, force: true }); } catch { /* noop */ }
  if (removed) console.log(`[admin/templates] boot sweep removed ${removed} orphaned test install(s)`);
}

module.exports = {
  THUMB_NAMES, PREVIEW_NAMES,
  resolveMedia, missingSourceFiles,
  publishBlockers, publishVersion, takeDown, removeDraftTrees,
  testSlot, installForTest, removeTestInstall, watchTestJob, sweepTestInstalls,
};
