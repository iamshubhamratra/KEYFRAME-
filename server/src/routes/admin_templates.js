// ADMIN TEMPLATE ROUTES — the admin-only build → review → publish pipeline for
// frame packs. Mounted at /api/admin; every route sits behind requireAdmin.
//
//   POST   /api/admin/templates              create (DRAFT)
//   GET    /api/admin/templates              list  (?status= &q=)
//   GET    /api/admin/templates/:id          describe (template + versions)
//   PATCH  /api/admin/templates/:id          edit metadata
//   DELETE /api/admin/templates/:id          delete (409 while PUBLISHED)
//   POST   /api/admin/templates/:id/generate | /preview | /qa | /test
//   POST   /api/admin/templates/:id/publish  | /unpublish | /archive
//   POST   /api/admin/templates/:id/versions
//   GET    /api/admin/templates/:id/events   SSE progress
//
// WHY THIS MIRRORS routes/projects.js: same problem shape — long work an operator
// watches and gates by hand. So the same contract: work that outlives the request
// returns 202 + a statusUrl, an SSE stream at /:id/events pushes state on change,
// an action taken in the wrong state is 409 naming the current state, and
// validation failures are `{ error, details: [] }`.
//
// WHY PUBLISH IS A DIRECTORY RENAME AND NOT A FLAG: frame_registry.listPacks() is
// a live readdirSync filtered on FRAME.md existing, with no cache — a pack is live
// the instant its folder lands in frames/. Drafts are therefore built under
// frames-draft/ and publishing stages a copy and renames it in. No consumer needs
// a status filter, and there is no half-published state to leak.
//
// The two long stages (generation, QA) live in src/admin/template_generator.js and
// src/admin/template_qa.js and are required LAZILY inside their handlers: they are
// authored in parallel with this router, and a module that is missing or renamed
// must degrade to one 501 on one route, not take the whole admin API down at boot.

const express = require("express");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { customAlphabet } = require("nanoid");
const config = require("../config");
const db = require("../db");
const store = require("../admin/template_store");
const { requireAdmin } = require("../auth/middleware");
const frameRegistry = require("../services/frame_registry");
const { PackManifestSchema } = require("../services/frame_manifest");
const { planAutoBatch, POOL: AUTO_POOL, MAX_BATCH: MAX_AUTO_BATCH } = require("../admin/auto_brief");
const { planCampaign, THEMES: CAMPAIGN_THEMES } = require("../admin/campaign");

// How many of the curated briefs are still unused — the admin UI caps its own
// count field with this so a request can't ask for more than the pool can give.
function availableAutoBriefs() {
  const taken = new Set([
    ...store.listTemplates().map((t) => t.slug),
    ...frameRegistry.listPacks(),
  ]);
  return AUTO_POOL.filter((b) => !taken.has(b.slug)).length;
}

const nanoid = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 10);
const S = store.STATUS;

// A publish/test install stamps this file into the pack folder it creates.
// UNPUBLISH and the test-install sweeper refuse to delete a directory in frames/
// that does not carry it — the one thing in this file that can destroy a live
// pack must never be able to fire on one of the 203 hand-built ones.
const MARKER = ".admin-template.json";
// Staging lives one level BELOW frames/ (frames/.publish-tmp/<slug>-<rand>/) so
// the half-copied tree is invisible to listPacks(), which only ever looks for
// frames/<name>/FRAME.md. Renaming out of it is atomic and same-volume.
const TMP_DIR = ".publish-tmp";
// A test render that never reports back (crashed worker, closed tab) must not
// leave a draft pack sitting in the live library forever.
const TEST_INSTALL_TTL_MS = 45 * 60 * 1000;

const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------- lazy stages
// Accept the handful of names the generator/QA modules could reasonably export.
// A naming mismatch between two agents building the same pipeline should be a
// rename, not an outage — and if none match, the admin gets a 501 that says
// exactly which file needs which export.
const GENERATE_FNS = ["generateTemplate", "generate", "runGeneration", "run"];
const PREVIEW_FNS = ["renderPreview", "buildPreview", "generatePreview", "preview"];
const QA_FNS = ["runQa", "runQA", "qaTemplate", "runTemplateQa", "run"];

function loadStage(res, moduleName, names) {
  let mod;
  try {
    mod = require(`../admin/${moduleName}`);
  } catch (e) {
    // MODULE_NOT_FOUND also fires when the module exists but one of ITS requires
    // is missing — only the first case is "not built yet", so they get different
    // codes rather than one misleading 501.
    if (e && e.code === "MODULE_NOT_FOUND" && String(e.message).includes(moduleName)) {
      res.status(501).json({ error: "not implemented", detail: `src/admin/${moduleName}.js is not installed yet` });
      return null;
    }
    res.status(500).json({ error: `${moduleName} failed to load`, detail: String(e && e.message ? e.message : e) });
    return null;
  }
  const fn = names.map((n) => mod && mod[n]).find((f) => typeof f === "function");
  if (!fn) {
    res.status(501).json({ error: "not implemented", detail: `src/admin/${moduleName}.js exports none of: ${names.join(", ")}` });
    return null;
  }
  return fn;
}

// ---------------------------------------------------------------- in-flight state
// Progress is deliberately NOT persisted: it is per-run chatter for the SSE
// stream, and the store's records are the durable truth. A restart loses the
// spinner, never the pipeline state.
/** @type {Map<string, {phase: string, step: string, pct: number|null, at: number}>} */
const progress = new Map();
/** @type {Map<string, string>} */
const running = new Map(); // templateId -> phase, so two clicks can't run twice

function setProgress(id, patch) {
  const prev = progress.get(id) || { phase: null, step: "", pct: null };
  progress.set(id, { ...prev, ...patch, at: Date.now() });
}

function runWork(id, phase, fn) {
  running.set(id, phase);
  setProgress(id, { phase, step: "starting", pct: 0 });
  Promise.resolve()
    .then(fn)
    .catch((e) => console.error(`[admin/templates] ${phase} crashed for ${id}: ${e && e.message}`))
    .finally(() => running.delete(id));
}

// The callback handed to the generator/QA modules. Both `onProgress("step", 40)`
// and `onProgress({ step, pct })` work, because guessing wrong about a sibling
// module's calling convention should not silently blank the admin's progress bar.
function progressSink(id, phase) {
  return (a, b) => {
    const patch = a && typeof a === "object"
      ? a
      : { step: String(a == null ? "" : a).slice(0, 200), pct: Number.isFinite(b) ? b : undefined };
    setProgress(id, { phase, ...patch });
  };
}

// ---------------------------------------------------------------- fs helpers
function isDir(p) { try { return !!p && fs.statSync(p).isDirectory(); } catch { return false; } }
function isFile(p) { try { return !!p && fs.statSync(p).isFile(); } catch { return false; } }

// Every destructive call in this file goes through this: a path we are about to
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

const THUMB_NAMES = ["poster.jpg", "poster.png", "thumbnail.jpg", "thumbnail.png", "thumb.jpg", "thumb.png"];
const PREVIEW_NAMES = ["preview.mp4", "preview.webm"];

// ---------------------------------------------------------------- validation
function fail(res, details) {
  return res.status(400).json({ error: "invalid request", details: Array.isArray(details) ? details : [details] });
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function validateCreate(body) {
  const errs = [];
  const out = {};
  if (typeof body !== "object" || body === null) return { errs: ["body must be JSON object"], out };

  const name = String(body.name || "").trim();
  if (name.length < 2 || name.length > 80) errs.push("name must be 2-80 characters");
  else out.name = name;

  if (body.slug != null && body.slug !== "") {
    if (!store.validSlug(body.slug)) errs.push(`slug "${body.slug}" must be lowercase words separated by single dashes (a-z0-9-)`);
    else out.slug = body.slug;
  }

  if (!store.ORIENTATIONS.includes(body.orientation)) errs.push(`orientation must be one of: ${store.ORIENTATIONS.join(", ")}`);
  else out.orientation = body.orientation;

  out.description = String(body.description || "").trim().slice(0, 600);
  out.category = body.category ? String(body.category).trim().slice(0, 60) : null;
  if (body.tags != null) {
    if (!Array.isArray(body.tags)) errs.push("tags must be an array of strings");
    else out.tags = body.tags.map((t) => String(t).trim().slice(0, 40)).filter(Boolean).slice(0, 12);
  }

  Object.assign(out, validateGeneration(body, errs));
  return { errs, out };
}

// The admin's build intent. Empty at create is fine — /generate is where a prompt
// becomes mandatory, so an admin can file a template now and brief it later.
function validateGeneration(body, errs) {
  const out = {};
  if (body.prompt != null && body.prompt !== "") {
    const p = String(body.prompt).trim();
    if (p.length > 4000) errs.push("prompt must be at most 4000 characters");
    else out.prompt = p;
  }
  if (body.style != null && body.style !== "") out.style = String(body.style).slice(0, 200);
  if (body.family != null && body.family !== "") {
    const fams = knownFamilies();
    if (fams && !fams.includes(String(body.family))) errs.push(`family must be one of: ${fams.join(", ")}`);
    else out.family = String(body.family);
  }
  if (body.brandColor != null && body.brandColor !== "") {
    if (!HEX_RE.test(String(body.brandColor))) errs.push("brandColor must be #RRGGBB");
    else out.brandColor = String(body.brandColor).toLowerCase();
  }
  if (body.durationSec != null && body.durationSec !== "") {
    const d = Number(body.durationSec);
    if (!Number.isFinite(d) || d < config.server.minDurationSec || d > config.server.maxDurationSec) {
      errs.push(`durationSec must be ${config.server.minDurationSec}-${config.server.maxDurationSec}`);
    } else out.durationSec = Math.round(d);
  }
  if (body.notes != null && body.notes !== "") out.notes = String(body.notes).slice(0, 2000);
  return out;
}

// The renderer families a spec may target, read from the pack authoring tool so
// this list can never drift from the one that actually builds packs. Fail-open:
// if the tool can't be loaded, family simply isn't validated here (the generator
// validates it again anyway).
function knownFamilies() {
  try { return Object.keys(require("../../scripts/new-pack").FAMILIES); } catch { return null; }
}

// ---------------------------------------------------------------- lookups
function mustTemplate(req, res) {
  if (!ID_RE.test(String(req.params.id || ""))) { res.status(400).json({ error: "bad id" }); return null; }
  const t = store.getTemplate(req.params.id);
  if (!t) { res.status(404).json({ error: "not found" }); return null; }
  return t;
}

function conflict(res, t, verb) {
  return res.status(409).json({
    error: `template is ${t.status}; ${verb} is not legal from there`,
    status: t.status,
    allowedNext: store.TRANSITIONS[t.status] || [],
  });
}

function busy(res, t) {
  return res.status(409).json({ error: `template is already ${running.get(t.id)}`, status: t.status });
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
  } else if (frameRegistry.listPacks().includes(t.slug)) {
    blocking.push(`"${t.slug}" is already a registered pack`);
  }

  return { blocking, version: v, srcDir, mediaDir, thumb, preview };
}

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
function normalizeQa(out) {
  const o = out && typeof out === "object" ? out : {};
  const errors = Array.isArray(o.errors || o.blockers || o.blocking) ? (o.errors || o.blockers || o.blocking) : [];
  const warnings = Array.isArray(o.warnings) ? o.warnings : [];
  const score = Number.isFinite(o.score) ? o.score : (Number.isFinite(o.qaScore) ? o.qaScore : null);
  const full = { ...o, errors, warnings, score, at: Date.now() };
  // The store rewrites template-store.json whole on every change, so a QA report
  // that carried frame screenshots would tax every later write. Keep the verdict,
  // drop the payload past 64KB.
  try {
    if (JSON.stringify(full).length > 64_000) return { errors, warnings, score, at: full.at, truncated: true };
  } catch { return { errors, warnings, score, at: full.at, truncated: true }; }
  return full;
}

// ---------------------------------------------------------------- test installs
// A test render goes through the REAL pipeline, and the pipeline only sees packs
// that are in frames/ — frame_registry has no notion of a staging directory. So a
// test temporarily installs the draft as a live pack, stamped with the marker
// file, and takes it down the moment the job settles. This is the one window in
// which unpublished work is reachable by pack auto-selection; it is minutes long,
// admin-triggered, and swept at boot (see sweepTestInstalls).
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
      const j = db.get(jobId);
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

// ---------------------------------------------------------------- router
// ---------------------------------------------------------------- auto batch
// ONE batch at a time, and the items run STRICTLY in series.
//
// Not an arbitrary choice: a preview and a QA pass each launch Chromium and
// ffmpeg and peak around 1.5-2 GB. Running three pack renders side by side on an
// 8-core box measured WORSE than one — free memory fell to 0.8 GB and not a
// single render finished in four minutes — so the batch never overlaps its own
// work. `running` is still claimed per template, which is what stops the
// single-template routes from firing at the same item mid-batch.
let autoBatch = null;

const batchPublic = (b) => b && ({
  id: b.id, count: b.items.length, requested: b.requested,
  done: b.items.filter((i) => i.stage === "done").length,
  failed: b.items.filter((i) => i.stage === "failed").length,
  currentIndex: b.currentIndex,
  running: !b.finishedAt,
  cancelled: b.cancelled,
  startedAt: b.startedAt, finishedAt: b.finishedAt,
  poolExhausted: b.poolExhausted,
  items: b.items.map((i) => ({
    slug: i.slug, name: i.name, family: i.family, orientation: i.orientation,
    templateId: i.templateId, stage: i.stage, status: i.status,
    qaScore: i.qaScore, error: i.error,
  })),
});

// Same module lookup as loadStage, but for a non-HTTP caller: throws instead of
// writing a 501, so a missing stage fails the ITEM rather than the batch.
function requireStage(moduleName, names) {
  const mod = require(`../admin/${moduleName}`);
  const fn = names.map((n) => mod && mod[n]).find((f) => typeof f === "function");
  if (!fn) throw new Error(`src/admin/${moduleName}.js exports none of: ${names.join(", ")}`);
  return fn;
}

// Take ONE template the whole way: generate -> preview -> QA. Mirrors the three
// single-template routes' store transitions exactly; the difference is that this
// awaits each stage instead of answering 202 and walking away.
async function autoRunOne(item) {
  const gen = requireStage("template_generator", GENERATE_FNS);
  const prev = requireStage("template_generator", PREVIEW_FNS);
  const qa = requireStage("template_qa", QA_FNS);

  const t0 = store.getTemplate(item.templateId);
  const generation = t0.generation || {};
  const v = store.createVersion(t0.id, { generationPrompt: generation.prompt });
  item.version = v.version;

  // ---- generate ----
  item.stage = "generating";
  running.set(t0.id, "generating");
  store.setStatus(t0.id, S.GENERATING);
  try {
    const out = await gen({
      template: store.getTemplate(t0.id), version: v,
      prompt: generation.prompt, generation,
      sourceDir: store.draftSourceDir(t0.slug, v.version),
      mediaDir: store.draftMediaDir(t0.slug, v.version),
      onProgress: progressSink(t0.id, "generating"),
    });
    const dir = store.draftSourceDir(t0.slug, v.version);
    const missing = ["pack.json", "FRAME.md"].filter((f) => !isFile(path.join(dir, f)));
    if (missing.length) throw new Error(`generation left no ${missing.join(" + ")}`);
    const patch = { generationStatus: "ok", error: null };
    if (out && typeof out === "object" && (out.spec || out.variant)) patch.generationSpec = out.spec || out.variant;
    store.updateVersion(t0.id, v.version, patch);
    store.setStatus(t0.id, S.GENERATED);
  } catch (e) {
    const msg = String(e && e.message ? e.message : e);
    store.updateVersion(t0.id, v.version, { generationStatus: "failed", error: msg.slice(0, 2000) });
    try { store.setStatus(t0.id, S.FAILED, { error: msg }); } catch { /* already moved */ }
    throw new Error(`generate: ${msg}`);
  } finally { running.delete(t0.id); }

  // ---- preview ---- (status-neutral, exactly as the route is)
  item.stage = "previewing";
  running.set(t0.id, "previewing");
  const mediaDir = store.draftMediaDir(t0.slug, v.version);
  try {
    const out = await prev({
      template: store.getTemplate(t0.id), version: store.getVersion(t0.id, v.version),
      sourceDir: store.draftSourceDir(t0.slug, v.version), mediaDir,
      onProgress: progressSink(t0.id, "previewing"),
    });
    const thumbRef = (out && (out.thumbnail || out.poster)) || null;
    const previewRef = (out && (out.previewVideo || out.preview || out.video)) || null;
    const thumb = resolveMedia(mediaDir, thumbRef, THUMB_NAMES);
    const preview = resolveMedia(mediaDir, previewRef, PREVIEW_NAMES);
    if (!thumb || !preview) throw new Error(`preview produced no ${!thumb ? "thumbnail" : "video"}`);
    const patch = { thumbnail: thumbRef || path.basename(thumb), previewVideo: previewRef || path.basename(preview) };
    store.updateVersion(t0.id, v.version, patch);
    store.updateTemplate(t0.id, patch);
  } catch (e) {
    throw new Error(`preview: ${String(e && e.message ? e.message : e)}`);
  } finally { running.delete(t0.id); }

  // ---- QA ----
  item.stage = "qa";
  running.set(t0.id, "qa");
  try {
    store.setStatus(t0.id, S.TESTING);
    const out = await qa({
      template: store.getTemplate(t0.id), version: store.getVersion(t0.id, v.version),
      sourceDir: store.draftSourceDir(t0.slug, v.version), mediaDir,
      onProgress: progressSink(t0.id, "qa"),
    });
    const results = normalizeQa(out);
    store.updateVersion(t0.id, v.version, { qaResults: results, qaScore: results.score });
    store.setStatus(t0.id, results.errors.length ? S.GENERATED : S.READY_TO_PUBLISH);
    item.qaScore = results.score;
    item.blockers = results.errors.length;
  } catch (e) {
    const msg = String(e && e.message ? e.message : e);
    try { store.setStatus(t0.id, S.FAILED, { error: msg }); } catch { /* already moved */ }
    throw new Error(`qa: ${msg}`);
  } finally { running.delete(t0.id); }
}

async function runAutoBatch(batch) {
  for (let i = 0; i < batch.items.length; i++) {
    if (batch.cancelled) break;
    const item = batch.items[i];
    batch.currentIndex = i;
    try {
      // Created here, not up front: a batch that reserved fifteen DRAFT rows and
      // then died would leave fifteen empty templates in the admin's library.
      const t = store.createTemplate({ ...item.create, createdBy: batch.createdBy });
      // createTemplate builds `generation` from a fixed field list, so the two
      // fields only the spec generator cares about — the renderer family and the
      // campaign's reserved motion — are folded in afterwards rather than being
      // silently dropped.
      if (item.create.family || item.create.pinMotion) {
        store.updateTemplate(t.id, {
          generation: {
            ...t.generation,
            ...(item.create.family ? { family: item.create.family } : {}),
            ...(item.create.pinMotion ? { pinMotion: item.create.pinMotion } : {}),
          },
        });
      }
      item.templateId = t.id;
      await autoRunOne(item);
      item.stage = "done";
      item.status = store.getTemplate(item.templateId).status;
      console.log(`[admin/auto] ${item.slug}: ${item.status} (QA ${item.qaScore ?? "n/a"}) [${i + 1}/${batch.items.length}]`);
    } catch (e) {
      item.stage = "failed";
      item.error = String(e && e.message ? e.message : e).slice(0, 400);
      item.status = item.templateId ? (store.getTemplate(item.templateId) || {}).status : null;
      console.warn(`[admin/auto] ${item.slug}: FAILED — ${item.error}`);
    }
  }
  batch.currentIndex = -1;
  batch.finishedAt = Date.now();
  const ok = batch.items.filter((i) => i.stage === "done").length;
  console.log(`[admin/auto] batch ${batch.id} finished: ${ok}/${batch.items.length} ok${batch.cancelled ? " (cancelled)" : ""}`);
}

// A TRANSIENT STATUS WITH NOBODY WORKING IS A DEAD END.
//
// GENERATING and TESTING are held only while a run is in flight, and `running`
// lives in memory. Kill the process mid-render — a restart, a crash, an OOM —
// and the record keeps the transient status forever while nothing is running:
// generate and qa both refuse ("template is TESTING; qa is not legal from
// there"), publish refuses, and the admin has no way back. Hit once for real
// after a dev-server reload landed between setStatus(TESTING) and the verdict.
//
// Boot is exactly the moment we know nothing is in flight, so anything still
// mid-flight is stale by definition. GENERATED is the honest landing spot: the
// draft's files survive, so it can be previewed, QA'd or regenerated from there.
function sweepStaleRuns() {
  const stuck = store.listTemplates().filter((t) => t.status === S.GENERATING || t.status === S.TESTING);
  for (const t of stuck) {
    const v = t.currentVersion ? store.getVersion(t.id, t.currentVersion) : null;
    // A version that never finished generating cannot be previewed — that one
    // goes to FAILED so the UI shows why rather than offering a dead action.
    const next = v && v.generationStatus === "ok" ? S.GENERATED : S.FAILED;
    try {
      store.setStatus(t.id, next, next === S.FAILED ? { error: "interrupted by a restart" } : undefined);
      console.log(`[admin/templates] swept ${t.slug}: ${t.status} -> ${next} (no run in flight)`);
    } catch (e) {
      console.warn(`[admin/templates] could not sweep ${t.slug}: ${e.message}`);
    }
  }
}

function buildRouter({ enqueueIntake } = {}) {
  const router = express.Router();
  sweepTestInstalls();
  sweepStaleRuns();

  router.use(requireAdmin);

  // ---- create ------------------------------------------------------------
  router.post("/templates", (req, res) => {
    const { errs, out } = validateCreate(req.body || {});
    if (errs.length) return fail(res, errs);
    try {
      const t = store.createTemplate({ ...out, createdBy: req.user?.email || req.userId });
      // createTemplate builds `generation` from a fixed field list, so the
      // renderer family (which only the spec generator cares about) is folded in
      // afterwards rather than being silently dropped.
      if (out.family) store.updateTemplate(t.id, { generation: { ...t.generation, family: out.family } });
      res.status(201).json({ template: store.describe(t.id) });
    } catch (e) {
      const msg = String(e.message || e);
      // "already exists" / "collides with an installed pack" are state conflicts,
      // not malformed input — the admin has to pick a different slug, and a 409
      // is what tells the UI to say so rather than highlighting a bad field.
      const code = /already exists|collides/.test(msg) ? 409 : 400;
      res.status(code).json({ error: msg });
    }
  });

  // ---- list / read -------------------------------------------------------
  router.get("/templates", (req, res) => {
    const status = typeof req.query.status === "string" ? req.query.status : null;
    if (status && !Object.values(S).includes(status)) {
      return fail(res, `status must be one of: ${Object.values(S).join(", ")}`);
    }
    const q = typeof req.query.q === "string" ? req.query.q.slice(0, 120) : null;
    const templates = store.listTemplates({ status, q }).map((t) => ({
      ...t,
      running: running.get(t.id) || null,
    }));
    res.json({ templates });
  });

  // ---- auto generate -----------------------------------------------------
  // REGISTERED BEFORE /templates/:id ON PURPOSE. Express matches in order, so
  // "auto" would otherwise be read as a template id and rejected by ID_RE with a
  // baffling 400 "bad id".
  router.post("/templates/auto", (req, res) => {
    if (autoBatch && !autoBatch.finishedAt) {
      return res.status(409).json({ error: "an auto batch is already running", batch: batchPublic(autoBatch) });
    }
    const requested = Math.floor(Number(req.body?.count));
    if (!Number.isFinite(requested) || requested < 1 || requested > MAX_AUTO_BATCH) {
      return fail(res, `count must be a whole number from 1 to ${MAX_AUTO_BATCH}`);
    }
    // Both namespaces, because createTemplate refuses a slug that collides with
    // either an existing template or an INSTALLED pack under frames/.
    const taken = new Set([
      ...store.listTemplates().map((t) => t.slug),
      ...frameRegistry.listPacks(),
    ]);
    // A CAMPAIGN is the batch with a subject: "mars exploration", "street food".
    // Each template gets a different ANGLE on it (the announcement, the numbers,
    // the story…) plus its own allocated motion, so fifteen films on one subject
    // are fifteen different films. With no subject the curated pool stands in,
    // and both paths allocate motion the same way.
    const requirement = typeof req.body?.requirement === "string" ? req.body.requirement.trim().slice(0, 200) : "";
    // A campaign is usually destined for ONE surface — a reel wall or a site hero
    // — so the admin picks the aspect for the whole run. "mixed" alternates.
    const orientation = ["vertical", "horizontal", "mixed"].includes(req.body?.orientation)
      ? req.body.orientation : "mixed";
    const plan = requirement
      ? planCampaign({ count: requested, requirement, taken, orientation })
      : planAutoBatch({ count: requested, taken, orientation });
    if (!plan.length) {
      return res.status(409).json({ error: "every auto brief is already used — delete some templates or create one by hand" });
    }
    autoBatch = {
      id: crypto.randomUUID(),
      requested,
      poolExhausted: plan.length < requested,
      createdBy: req.user?.email || req.userId,
      startedAt: Date.now(), finishedAt: null, cancelled: false, currentIndex: 0,
      items: plan.map((p) => ({
        slug: p.slug, name: p.name, family: p.family, orientation: p.orientation,
        create: p, templateId: null, version: null,
        stage: "queued", status: null, qaScore: null, blockers: null, error: null,
      })),
    };
    res.status(202).json({ batch: batchPublic(autoBatch), statusUrl: "/api/admin/templates/auto" });
    runAutoBatch(autoBatch).catch((e) => {
      console.error(`[admin/auto] batch crashed: ${e && e.message}`);
      autoBatch.finishedAt = Date.now();
    });
  });

  router.get("/templates/auto", (_req, res) => {
    res.json({ batch: batchPublic(autoBatch), maxBatch: MAX_AUTO_BATCH, available: availableAutoBriefs() });
  });

  // Stops after the item in flight — a render is a child Chromium process, and
  // tearing one down mid-encode is how half-written posters happen.
  router.post("/templates/auto/cancel", (_req, res) => {
    if (!autoBatch || autoBatch.finishedAt) return res.status(409).json({ error: "no auto batch is running" });
    autoBatch.cancelled = true;
    res.json({ batch: batchPublic(autoBatch), note: "will stop after the template currently rendering" });
  });

  router.get("/templates/:id", (req, res) => {
    const t = mustTemplate(req, res);
    if (!t) return;
    res.json({ template: store.describe(t.id), running: running.get(t.id) || null, progress: progress.get(t.id) || null });
  });

  // ---- edit --------------------------------------------------------------
  router.patch("/templates/:id", (req, res) => {
    const t = mustTemplate(req, res);
    if (!t) return;
    const body = req.body || {};
    // The store silently drops these; rejecting loudly instead means a UI that
    // thinks it can rename a slug finds out immediately rather than shipping a
    // no-op. Status moves only through the lifecycle routes.
    if ("status" in body) return fail(res, "status is not editable — use the publish/unpublish/archive routes");
    if ("slug" in body) return fail(res, "slug is immutable — it is the pack's directory name in frames/");

    const errs = [];
    const patch = {};
    if (body.name != null) {
      const name = String(body.name).trim();
      if (name.length < 2 || name.length > 80) errs.push("name must be 2-80 characters");
      else patch.name = name;
    }
    if (body.orientation != null) {
      if (!store.ORIENTATIONS.includes(body.orientation)) errs.push(`orientation must be one of: ${store.ORIENTATIONS.join(", ")}`);
      else patch.orientation = body.orientation;
    }
    if (body.description != null) patch.description = String(body.description).trim().slice(0, 600);
    if (body.category != null) patch.category = String(body.category).trim().slice(0, 60) || null;
    if (body.tags != null) {
      if (!Array.isArray(body.tags)) errs.push("tags must be an array of strings");
      else patch.tags = body.tags.map((x) => String(x).trim().slice(0, 40)).filter(Boolean).slice(0, 12);
    }
    for (const key of ["capabilities", "assetRequirements", "audioConfiguration"]) {
      if (body[key] == null) continue;
      if (typeof body[key] !== "object" || Array.isArray(body[key])) errs.push(`${key} must be an object`);
      else patch[key] = body[key];
    }
    // generation is patched as a whole object (updateTemplate assigns shallowly),
    // so merge onto what is already there instead of dropping unset fields.
    const gen = validateGeneration(body, errs);
    if (Object.keys(gen).length) patch.generation = { ...t.generation, ...gen };

    if (errs.length) return fail(res, errs);
    res.json({ template: store.describe(store.updateTemplate(t.id, patch).id) });
  });

  // ---- delete ------------------------------------------------------------
  router.delete("/templates/:id", (req, res) => {
    const t = mustTemplate(req, res);
    if (!t) return;
    if (running.has(t.id)) return busy(res, t);
    let removed;
    try {
      removed = store.deleteTemplate(t.id);
    } catch (e) {
      // The store throws on PUBLISHED — that is a state conflict, not a bug.
      return res.status(409).json({ error: String(e.message || e), status: t.status });
    }
    if (!removed) return res.status(404).json({ error: "not found" });
    // The record is gone, so the draft trees under frames-draft/ are unreachable
    // garbage. Removing them is best-effort: a locked file must not turn a
    // successful delete into a 500.
    for (const root of [store.DRAFT_SRC, store.DRAFT_MEDIA]) {
      const dir = path.join(root, t.slug);
      if (!inside(root, dir)) continue;
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { console.warn(`[admin/templates] draft cleanup failed for ${dir}: ${e.message}`); }
    }
    progress.delete(t.id);
    res.json({ deleted: true, id: t.id, slug: t.slug });
  });

  // ---- generate ----------------------------------------------------------
  router.post("/templates/:id/generate", (req, res) => {
    const t = mustTemplate(req, res);
    if (!t) return;
    if (running.has(t.id)) return busy(res, t);

    const errs = [];
    const gen = validateGeneration(req.body || {}, errs);
    if (errs.length) return fail(res, errs);
    const generation = { ...t.generation, ...gen };
    if (!generation.prompt || generation.prompt.trim().length < 10) {
      return fail(res, "a generation prompt of at least 10 characters is required (send prompt, or PATCH it first)");
    }
    if (!store.canTransition(t.status, S.GENERATING)) return conflict(res, t, "generate");

    const fn = loadStage(res, "template_generator", GENERATE_FNS);
    if (!fn) return;

    // A finished build is an immutable record (the store's own contract), so a
    // regenerate over a successful version forks a new one; a regenerate over a
    // pending or failed attempt reuses it rather than burning a version number.
    const cur = t.currentVersion ? store.getVersion(t.id, t.currentVersion) : null;
    const v = cur && cur.generationStatus !== "ok"
      ? store.updateVersion(t.id, cur.version, { generationStatus: "pending", generationPrompt: generation.prompt, error: null })
      : store.createVersion(t.id, { generationPrompt: generation.prompt });

    store.updateTemplate(t.id, { generation });
    store.setStatus(t.id, S.GENERATING);

    // Answer first, then start the work: the admin UI switches to the SSE stream
    // on the 202, and the state it needs (GENERATING + the version number) is
    // already committed above.
    res.status(202).json({
      templateId: t.id,
      version: v.version,
      status: S.GENERATING,
      statusUrl: `/api/admin/templates/${t.id}`,
      eventsUrl: `/api/admin/templates/${t.id}/events`,
    });

    runWork(t.id, "generating", async () => {
      try {
        const out = await fn({
          template: store.getTemplate(t.id),
          version: v,
          prompt: generation.prompt,
          generation,
          sourceDir: store.draftSourceDir(t.slug, v.version),
          mediaDir: store.draftMediaDir(t.slug, v.version),
          onProgress: progressSink(t.id, "generating"),
        });

        // Trust but verify: a generator that reports success without leaving a
        // pack.json + FRAME.md behind would only surface as a mystery 422 at
        // publish, long after the admin stopped watching.
        const dir = store.draftSourceDir(t.slug, v.version);
        const missing = ["pack.json", "FRAME.md"].filter((f) => !isFile(path.join(dir, f)));
        if (missing.length) throw new Error(`generation left no ${missing.join(" + ")} in ${dir}`);

        const patch = { generationStatus: "ok", error: null };
        if (out && typeof out === "object") {
          if (out.spec || out.variant || out.generationSpec) patch.generationSpec = out.spec || out.variant || out.generationSpec;
          if (out.thumbnail) patch.thumbnail = out.thumbnail;
          if (out.previewVideo) patch.previewVideo = out.previewVideo;
        }
        store.updateVersion(t.id, v.version, patch);
        store.setStatus(t.id, S.GENERATED);
        setProgress(t.id, { phase: "generating", step: "generated", pct: 100 });
      } catch (e) {
        const msg = String(e && e.message ? e.message : e);
        store.updateVersion(t.id, v.version, { generationStatus: "failed", error: msg.slice(0, 2000) });
        try { store.setStatus(t.id, S.FAILED, { error: msg }); } catch { /* already moved on */ }
        setProgress(t.id, { phase: "generating", step: `failed: ${msg.slice(0, 160)}`, pct: 100 });
      }
    });
  });

  // ---- preview + thumbnail ----------------------------------------------
  // Deliberately status-neutral: the lifecycle has no PREVIEWING state, and a
  // re-render of a poster is not a change of what the template IS. It writes the
  // two media refs the publish gate checks for.
  router.post("/templates/:id/preview", (req, res) => {
    const t = mustTemplate(req, res);
    if (!t) return;
    if (running.has(t.id)) return busy(res, t);
    const v = t.currentVersion ? store.getVersion(t.id, t.currentVersion) : null;
    if (!v || v.generationStatus !== "ok") {
      return res.status(409).json({ error: "no generated source to preview — run generate first", status: t.status });
    }
    const fn = loadStage(res, "template_generator", PREVIEW_FNS);
    if (!fn) return;

    const mediaDir = store.draftMediaDir(t.slug, v.version);
    res.status(202).json({
      templateId: t.id,
      version: v.version,
      status: t.status,
      statusUrl: `/api/admin/templates/${t.id}`,
      eventsUrl: `/api/admin/templates/${t.id}/events`,
    });

    runWork(t.id, "previewing", async () => {
      try {
        const out = await fn({
          template: store.getTemplate(t.id),
          version: v,
          sourceDir: store.draftSourceDir(t.slug, v.version),
          mediaDir,
          onProgress: progressSink(t.id, "previewing"),
        });
        const thumbRef = (out && (out.thumbnail || out.poster)) || null;
        const previewRef = (out && (out.previewVideo || out.preview || out.video)) || null;
        const thumb = resolveMedia(mediaDir, thumbRef, THUMB_NAMES);
        const preview = resolveMedia(mediaDir, previewRef, PREVIEW_NAMES);
        if (!thumb || !preview) throw new Error(`preview produced no ${!thumb ? "thumbnail" : "video"} under ${mediaDir}`);
        // Store the refs the module reported when it gave one (they may be public
        // URLs the admin UI can render directly); otherwise the resolved filename.
        const patch = { thumbnail: thumbRef || path.basename(thumb), previewVideo: previewRef || path.basename(preview) };
        store.updateVersion(t.id, v.version, patch);
        store.updateTemplate(t.id, patch);
        setProgress(t.id, { phase: "previewing", step: "preview ready", pct: 100 });
      } catch (e) {
        const msg = String(e && e.message ? e.message : e);
        console.warn(`[admin/templates] preview failed for ${t.slug}: ${msg}`);
        setProgress(t.id, { phase: "previewing", step: `failed: ${msg.slice(0, 160)}`, pct: 100 });
      }
    });
  });

  // ---- QA ----------------------------------------------------------------
  router.post("/templates/:id/qa", (req, res) => {
    const t = mustTemplate(req, res);
    if (!t) return;
    if (running.has(t.id)) return busy(res, t);
    const v = t.currentVersion ? store.getVersion(t.id, t.currentVersion) : null;
    if (!v || v.generationStatus !== "ok") {
      return res.status(409).json({ error: "no generated source to QA — run generate first", status: t.status });
    }
    if (!store.canTransition(t.status, S.TESTING)) return conflict(res, t, "qa");
    const fn = loadStage(res, "template_qa", QA_FNS);
    if (!fn) return;

    store.setStatus(t.id, S.TESTING);
    res.status(202).json({
      templateId: t.id,
      version: v.version,
      status: S.TESTING,
      statusUrl: `/api/admin/templates/${t.id}`,
      eventsUrl: `/api/admin/templates/${t.id}/events`,
    });

    runWork(t.id, "qa", async () => {
      try {
        const out = await fn({
          template: store.getTemplate(t.id),
          version: v,
          sourceDir: store.draftSourceDir(t.slug, v.version),
          mediaDir: store.draftMediaDir(t.slug, v.version),
          onProgress: progressSink(t.id, "qa"),
        });
        const results = normalizeQa(out);
        store.updateVersion(t.id, v.version, { qaResults: results, qaScore: results.score });
        // Clean QA is what makes a template reviewable; anything blocking sends it
        // back to GENERATED so the admin regenerates rather than reviews. A QA run
        // that CRASHED is different — that is FAILED, below.
        store.setStatus(t.id, results.errors.length ? S.GENERATED : S.READY_TO_PUBLISH);
        setProgress(t.id, { phase: "qa", step: results.errors.length ? `${results.errors.length} blocking issue(s)` : "clean", pct: 100 });
      } catch (e) {
        const msg = String(e && e.message ? e.message : e);
        try { store.setStatus(t.id, S.FAILED, { error: msg }); } catch { /* already moved on */ }
        setProgress(t.id, { phase: "qa", step: `failed: ${msg.slice(0, 160)}`, pct: 100 });
      }
    });
  });

  // ---- real test render --------------------------------------------------
  // Reuses the production pipeline exactly as POST /api/projects does — one job
  // row, pinned to this template's pack, drained by the same queue — so a test
  // exercises the code path a customer's video takes, not a simulation of it.
  // Status-neutral on purpose: the render finishes outside this process's control
  // and is judged by eye, so a closed tab must not park a template in TESTING.
  router.post("/templates/:id/test", (req, res) => {
    const t = mustTemplate(req, res);
    if (!t) return;
    if (typeof enqueueIntake !== "function") {
      return res.status(501).json({ error: "not implemented", detail: "router was mounted without enqueueIntake" });
    }
    const v = t.currentVersion ? store.getVersion(t.id, t.currentVersion) : null;
    if (!v || v.generationStatus !== "ok") {
      return res.status(409).json({ error: "no generated source to test — run generate first", status: t.status });
    }

    const body = req.body || {};
    const errs = [];
    const prompt = String(body.prompt || t.generation?.prompt || "").trim()
      || `A short promotional video showcasing the ${t.name} template.`;
    if (prompt.length < 10) errs.push("prompt must be at least 10 characters");
    const d = body.duration == null ? Math.min(30, config.server.maxDurationSec) : Number(body.duration);
    if (!Number.isFinite(d) || d < config.server.minDurationSec || d > config.server.maxDurationSec) {
      errs.push(`duration must be ${config.server.minDurationSec}-${config.server.maxDurationSec} seconds`);
    }
    const quality = body.quality || config.defaults.quality;
    if (!config.qualities[quality]) errs.push(`quality must be one of: ${Object.keys(config.qualities).join(", ")}`);
    const fps = body.fps == null ? config.defaults.fps : Number(body.fps);
    if (!config.allowedFps.includes(fps)) errs.push(`fps must be one of: ${config.allowedFps.join(", ")}`);
    if (errs.length) return fail(res, errs);

    if (db.countJobsSince(Date.now() - 24 * 60 * 60 * 1000) >= config.server.dailyJobCap) {
      return res.status(429).json({ error: "daily job cap reached" });
    }

    // Make the draft visible to the renderer. frame_registry only sees frames/,
    // so the draft is installed there for the duration of the render, marked as a
    // test install and torn down when the job settles.
    const live = store.liveSourceDir(t.slug);
    const liveExists = isDir(live);
    const marker = liveExists ? readMarker(live) : null;
    const ourTestInstall = !!(marker && marker.test === true && marker.templateId === t.id);
    // The published copy IS this version, so test it exactly as a user would get
    // it — no staging, and nothing to tear down afterwards.
    const ourPublished = !!(marker && marker.test === false && marker.templateId === t.id
      && t.status === S.PUBLISHED && marker.version === v.version);
    if (liveExists && !ourTestInstall && !ourPublished) {
      return res.status(409).json({
        error: `frames/${t.slug} is occupied by another pack (or an older published version) — unpublish this template before testing a newer draft`,
        status: t.status,
      });
    }

    const jobId = nanoid();
    let installed = false;
    if (!ourPublished) {
      try {
        // Replace any earlier test install of ours: it may hold a different
        // version, and re-stamping the marker with THIS jobId hands teardown to
        // the newest test so the older watcher can't pull the pack mid-render.
        if (ourTestInstall) removeTestInstall(t.slug, null);
        installForTest(t, v, jobId);
        installed = true;
      } catch (e) {
        return res.status(500).json({ error: "could not stage the draft pack for a test render", detail: String(e.message || e) });
      }
    }

    const dims = config.dimensionsFor(t.orientation, quality);
    try {
      db.insert({
        id: jobId,
        kind: "project",
        prompt,
        duration: Math.round(d),
        orientation: t.orientation,
        quality,
        width: dims.width,
        height: dims.height,
        fps,
        framePack: t.slug,
        voiceStyle: null,
        // Autopilot: a template test wants a finished film, not a script review
        // checkpoint an admin has to babysit in another tab.
        autopilot: true,
        captionsEnabled: false,
        captionsConfig: null,
        voiceoverEnabled: body.voiceover !== false,
        brandPalette: null,
        render3d: false,
        uploadPath: null,
        userAssets: null,
        intent: {
          prompt,
          websiteUrl: null,
          blogUrl: null,
          hasReferenceVideo: false,
          hasUserAssets: null,
          adminTemplateTest: { templateId: t.id, slug: t.slug, version: v.version },
          preferences: { duration: Math.round(d), orientation: t.orientation, voiceStyle: "auto", framePack: t.slug },
        },
        created_at: Date.now(),
        client_ip: req.ip || "admin",
      });
      enqueueIntake(jobId);
    } catch (e) {
      if (installed) removeTestInstall(t.slug, jobId);
      return res.status(500).json({ error: "could not queue the test render", detail: String(e.message || e) });
    }

    if (installed) watchTestJob(t.slug, jobId);
    store.updateVersion(t.id, v.version, { testJobIds: [...(v.testJobIds || []), jobId].slice(-20) });

    res.status(202).json({
      templateId: t.id,
      version: v.version,
      jobId,
      framePack: t.slug,
      temporarilyInstalled: installed,
      statusUrl: `/api/projects/${jobId}`,
      eventsUrl: `/api/projects/${jobId}/events`,
    });
  });

  // ---- publish -----------------------------------------------------------
  router.post("/templates/:id/publish", (req, res) => {
    const t = mustTemplate(req, res);
    if (!t) return;
    if (running.has(t.id)) return busy(res, t);
    if (t.status !== S.READY_TO_PUBLISH) {
      return res.status(409).json({
        error: `template is ${t.status}, not ${S.READY_TO_PUBLISH}`,
        status: t.status,
        hint: t.status === S.GENERATED ? "run QA and clear its blocking issues first" : undefined,
      });
    }

    const gate = publishBlockers(t);
    if (gate.blocking.length) return res.status(422).json({ error: "template is not publishable", blocking: gate.blocking });

    const { version: v, srcDir, mediaDir } = gate;
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
        publishedBy: req.user?.email || req.userId, at: Date.now(),
      }, null, 2));
      fs.renameSync(tmpSrc, liveSrc);
      dropTmp(liveSrc);
    } catch (e) {
      // Roll the media back so a failed publish leaves nothing of itself behind.
      if (mediaLanded && inside(store.LIVE_MEDIA, liveMedia)) {
        try { fs.rmSync(liveMedia, { recursive: true, force: true }); } catch { /* noop */ }
      }
      return res.status(500).json({ error: "publish failed while copying", detail: String(e.message || e) });
    }

    store.updateTemplate(t.id, {
      sourcePath: liveSrc,
      thumbnail: v.thumbnail || t.thumbnail,
      previewVideo: v.previewVideo || t.previewVideo,
    });
    store.setStatus(t.id, S.PUBLISHED);
    console.log(`[admin/templates] published ${t.slug} v${v.version} → ${liveSrc}`);
    res.json({ template: store.describe(t.id), publishedVersion: v.version, liveSourceDir: liveSrc });
  });

  // ---- unpublish ---------------------------------------------------------
  // Takes the live copy down and returns the template to READY_TO_PUBLISH. The
  // draft and every version record survive untouched — unpublishing is a
  // retraction, not a delete.
  router.post("/templates/:id/unpublish", (req, res) => {
    const t = mustTemplate(req, res);
    if (!t) return;
    if (t.status !== S.PUBLISHED) return res.status(409).json({ error: `template is ${t.status}, not ${S.PUBLISHED}`, status: t.status });
    const result = takeDown(t);
    if (result.blocking) return res.status(422).json({ error: "template is not unpublishable", blocking: result.blocking });
    store.setStatus(t.id, S.READY_TO_PUBLISH);
    res.json({ template: store.describe(t.id), removed: result.removed });
  });

  // ---- archive -----------------------------------------------------------
  router.post("/templates/:id/archive", (req, res) => {
    const t = mustTemplate(req, res);
    if (!t) return;
    if (t.status === S.ARCHIVED) return res.json({ template: store.describe(t.id) });
    // PUBLISHED → ARCHIVED is a legal transition, but archiving a template while
    // its pack still serves users would leave a retired record and a live folder
    // disagreeing. So archive takes the copy down on the way through
    // READY_TO_PUBLISH — both moves are in the store's own table.
    if (t.status === S.PUBLISHED) {
      const result = takeDown(t);
      if (result.blocking) return res.status(422).json({ error: "cannot archive: the live copy could not be removed", blocking: result.blocking });
      store.setStatus(t.id, S.READY_TO_PUBLISH);
    }
    try {
      store.setStatus(t.id, S.ARCHIVED);
    } catch (e) {
      return res.status(409).json({ error: String(e.message || e), status: store.getTemplate(t.id).status });
    }
    res.json({ template: store.describe(t.id) });
  });

  // ---- versions ----------------------------------------------------------
  // A new version is an empty build slot; the published one keeps serving from
  // frames/ because publish copied it there — nothing about creating v(n+1)
  // touches the live folder.
  router.post("/templates/:id/versions", (req, res) => {
    const t = mustTemplate(req, res);
    if (!t) return;
    if (running.has(t.id)) return busy(res, t);
    const errs = [];
    const gen = validateGeneration(req.body || {}, errs);
    if (errs.length) return fail(res, errs);
    const v = store.createVersion(t.id, {
      generationPrompt: gen.prompt || t.generation?.prompt || "",
      generationSpec: req.body && req.body.spec ? req.body.spec : null,
    });
    if (Object.keys(gen).length) store.updateTemplate(t.id, { generation: { ...t.generation, ...gen } });
    res.status(201).json({ version: v, template: store.describe(t.id) });
  });

  // ---- SSE ---------------------------------------------------------------
  // Same shape as /api/projects/:id/events: poll module state on a 1s tick, write
  // a data frame only when something an operator would notice changed. Closes
  // when the template is deleted; otherwise it lives until the client hangs up.
  router.get("/templates/:id/events", (req, res) => {
    if (!ID_RE.test(String(req.params.id || ""))) return res.status(400).json({ error: "bad id" });
    const id = req.params.id;
    if (!store.getTemplate(id)) return res.status(404).json({ error: "not found" });

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    let lastKey = "";
    let ticks = 0;
    const send = () => {
      const t = store.describe(id);
      if (!t) {
        res.write(`data: ${JSON.stringify({ id, deleted: true })}\n\n`);
        return true;
      }
      const p = progress.get(id) || null;
      const v = t.versions && t.versions[0];
      const key = [t.status, t.currentVersion, t.publishedVersion, v && v.generationStatus,
        v && v.qaResults && v.qaResults.at, v && v.thumbnail, (v && v.testJobIds || []).length,
        running.get(id) || "", p && p.step, p && p.pct].join("|");
      if (key !== lastKey) {
        lastKey = key;
        res.write(`data: ${JSON.stringify({ ...t, running: running.get(id) || null, progress: p })}\n\n`);
      }
      return false;
    };

    if (send()) { res.end(); return; }
    const timer = setInterval(() => {
      try {
        if (send()) { clearInterval(timer); res.end(); return; }
        // Comment heartbeat: an idle template can sit unchanged for minutes and
        // proxies drop a silent stream.
        if (++ticks % 25 === 0) res.write(": ka\n\n");
      } catch { clearInterval(timer); }
    }, 1000);
    req.on("close", () => clearInterval(timer));
  });

  return router;
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

module.exports = { buildRouter };
