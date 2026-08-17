// ADMIN TEMPLATE STORE — the lifecycle and versioning record for templates that
// are being built, tested and published by an admin.
//
// WHY A THIRD STORE. This app has no database: state lives in two JSON files,
// jobs.json (db.js) and auth-store.json (auth/store.js). Neither can host this —
// db.js is a Map keyed by job id with job-shaped records and destructive boot
// recovery, and auth-store is users/otps. So this mirrors the same proven shape
// (module state + debounced atomic tmp->rename write) rather than introducing a
// database for ~200 rows and a handful of admins. auth/store.js is the blueprint;
// swap the module body for a real DB later and keep this API.
//
// WHY A PACK'S STATUS IS NOT A FIELD IN pack.json. `frame_registry.listPacks()`
// is a live readdirSync with no cache, filtered on FRAME.md existing — a pack is
// live the INSTANT its folder lands in frames/. Every consumer (auto-selection,
// the brief's tone match, the gallery, preview building) relies on that
// invariant. So a draft never goes in frames/ at all: it is built in a staging
// directory, and PUBLISH is an atomic move. Nothing downstream needs a status
// filter, and there is no way for half-built work to leak to users.

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const config = require("../config");

const FILE = path.join(config.paths.root, "template-store.json");

// ---------------------------------------------------------------- lifecycle
const STATUS = {
  DRAFT: "DRAFT",
  GENERATING: "GENERATING",
  GENERATED: "GENERATED",
  TESTING: "TESTING",
  READY_TO_PUBLISH: "READY_TO_PUBLISH",
  PUBLISHED: "PUBLISHED",
  FAILED: "FAILED",
  ARCHIVED: "ARCHIVED",
};

// The ONLY legal moves. An admin action that is not in this table is rejected
// with the reason, so a UI bug can never park a template in a state the pipeline
// cannot reason about (e.g. PUBLISHED without ever having rendered).
const TRANSITIONS = {
  DRAFT:            ["GENERATING", "ARCHIVED"],
  GENERATING:       ["GENERATED", "FAILED"],
  GENERATED:        ["TESTING", "GENERATING", "READY_TO_PUBLISH", "FAILED", "ARCHIVED"],
  TESTING:          ["READY_TO_PUBLISH", "GENERATED", "FAILED"],
  READY_TO_PUBLISH: ["PUBLISHED", "TESTING", "GENERATING", "ARCHIVED"],
  // Unpublishing returns a template to the last reviewable state, never to DRAFT
  // — its source and media still exist and are still valid.
  PUBLISHED:        ["READY_TO_PUBLISH", "ARCHIVED"],
  FAILED:           ["GENERATING", "ARCHIVED"],
  ARCHIVED:         ["READY_TO_PUBLISH"],
};

function canTransition(from, to) {
  return Array.isArray(TRANSITIONS[from]) && TRANSITIONS[from].includes(to);
}

// ---------------------------------------------------------------- persistence
let state = { templates: [], versions: [] };
try {
  const parsed = JSON.parse(fs.readFileSync(FILE, "utf8"));
  if (parsed && typeof parsed === "object") {
    state.templates = Array.isArray(parsed.templates) ? parsed.templates : [];
    state.versions = Array.isArray(parsed.versions) ? parsed.versions : [];
  }
} catch { /* fresh store */ }

let writeTimer = null;
function persist() {
  if (writeTimer) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    try {
      const tmp = FILE + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(state, null, 2), "utf8");
      fs.renameSync(tmp, FILE);
    } catch (e) {
      console.warn(`[templates] store write failed: ${e.message}`);
    }
  }, 50);
}

// ---------------------------------------------------------------- helpers
// A slug is a directory name under frames/ — it becomes a filesystem path and a
// pack id, so it is validated hard rather than sanitised quietly. No dots, no
// separators, no leading dash: a generated template must never be able to name
// itself "../../server/src" or shadow an existing pack.
const SLUG_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
function slugify(name) {
  return String(name || "")
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}
function validSlug(slug) { return typeof slug === "string" && slug.length >= 2 && SLUG_RE.test(slug); }

const ORIENTATIONS = ["vertical", "horizontal", "square"];

// ---------------------------------------------------------------- paths
// Draft source and media live OUTSIDE the directories the app serves from, so
// nothing can list or route to them. Publish moves source into frames/ and media
// into public/frames/<slug>/, which is exactly where the registry and the
// gallery already look.
const ROOT = config.paths.root;
const DRAFT_SRC = path.join(ROOT, "..", "frames-draft");
const DRAFT_MEDIA = path.join(ROOT, "public", "frames-draft");
const LIVE_SRC = require("../services/frame_registry").FRAMES_DIR;
const LIVE_MEDIA = path.join(ROOT, "public", "frames");

function draftSourceDir(slug, version) { return path.join(DRAFT_SRC, slug, `v${version}`); }
function draftMediaDir(slug, version) { return path.join(DRAFT_MEDIA, slug, `v${version}`); }
function liveSourceDir(slug) { return path.join(LIVE_SRC, slug); }
function liveMediaDir(slug) { return path.join(LIVE_MEDIA, slug); }

// ---------------------------------------------------------------- templates
function listTemplates({ status = null, q = null } = {}) {
  let out = state.templates.slice();
  if (status) out = out.filter((t) => t.status === status);
  if (q) {
    const needle = String(q).toLowerCase();
    out = out.filter((t) =>
      String(t.name || "").toLowerCase().includes(needle)
      || String(t.slug || "").toLowerCase().includes(needle)
      || (t.tags || []).some((x) => String(x).toLowerCase().includes(needle)));
  }
  return out.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}
function getTemplate(id) { return state.templates.find((t) => t.id === id) || null; }
function getTemplateBySlug(slug) { return state.templates.find((t) => t.slug === slug) || null; }

function createTemplate({ name, slug, description, orientation, category, tags, prompt, style, brandColor, durationSec, notes, createdBy }) {
  const finalSlug = validSlug(slug) ? slug : slugify(name);
  if (!validSlug(finalSlug)) throw new Error(`invalid slug "${finalSlug}" — use lowercase words separated by single dashes`);
  if (getTemplateBySlug(finalSlug)) throw new Error(`a template with slug "${finalSlug}" already exists`);
  // A generated template must never overwrite one of the 203 hand-built packs.
  if (fs.existsSync(liveSourceDir(finalSlug))) throw new Error(`slug "${finalSlug}" collides with an installed pack in frames/`);
  if (!ORIENTATIONS.includes(orientation)) throw new Error(`orientation must be one of ${ORIENTATIONS.join(", ")}`);

  const now = Date.now();
  const t = {
    id: crypto.randomUUID(),
    name: String(name || "").trim(),
    slug: finalSlug,
    description: String(description || "").trim(),
    status: STATUS.DRAFT,
    orientation,
    category: String(category || "").trim() || null,
    tags: Array.isArray(tags) ? tags.map(String).slice(0, 12) : [],
    currentVersion: 0,          // 0 until the first generation succeeds
    publishedVersion: null,     // which version is live in frames/
    thumbnail: null,
    previewVideo: null,
    sourcePath: null,
    capabilities: {},
    assetRequirements: {},
    audioConfiguration: {},
    // The admin's original intent, kept so "regenerate" and "new version" can
    // reuse it without the admin retyping the brief.
    generation: {
      prompt: String(prompt || "").trim(),
      style: style || null,
      brandColor: brandColor || null,
      durationSec: durationSec || null,
      notes: notes || null,
    },
    lastError: null,
    createdBy: createdBy || null,
    createdAt: now,
    updatedAt: now,
    publishedAt: null,
  };
  state.templates.push(t);
  persist();
  return t;
}

function updateTemplate(id, patch) {
  const t = getTemplate(id);
  if (!t) throw new Error("template not found");
  // status is only ever moved through setStatus, so a PATCH cannot skip the
  // state machine; slug is immutable because it is a live filesystem path.
  const { status, slug, id: _id, createdAt, ...safe } = patch || {};
  Object.assign(t, safe, { updatedAt: Date.now() });
  persist();
  return t;
}

function setStatus(id, next, { error = null } = {}) {
  const t = getTemplate(id);
  if (!t) throw new Error("template not found");
  if (t.status === next) return t;
  if (!canTransition(t.status, next)) {
    throw new Error(`illegal transition ${t.status} → ${next}`);
  }
  t.status = next;
  t.updatedAt = Date.now();
  if (next === STATUS.FAILED) t.lastError = error ? String(error).slice(0, 2000) : t.lastError;
  if (next === STATUS.GENERATING) t.lastError = null;
  if (next === STATUS.PUBLISHED) { t.publishedAt = Date.now(); t.publishedVersion = t.currentVersion; }
  if (next === STATUS.READY_TO_PUBLISH && t.publishedVersion != null && t.publishedAt) {
    // Unpublished: the live copy is gone, so stop advertising it as published.
    t.publishedVersion = null;
  }
  persist();
  return t;
}

function deleteTemplate(id) {
  const t = getTemplate(id);
  if (!t) return false;
  if (t.status === STATUS.PUBLISHED) throw new Error("unpublish before deleting");
  state.templates = state.templates.filter((x) => x.id !== id);
  state.versions = state.versions.filter((v) => v.templateId !== id);
  persist();
  return true;
}

// ---------------------------------------------------------------- versions
// A version is an immutable build record. Publishing v2 never edits v1: both
// keep their own source and media directories, so the live pack can be rolled
// back by publishing the older version again.
function listVersions(templateId) {
  return state.versions.filter((v) => v.templateId === templateId).sort((a, b) => b.version - a.version);
}
function getVersion(templateId, version) {
  return state.versions.find((v) => v.templateId === templateId && v.version === Number(version)) || null;
}

function createVersion(templateId, { generationPrompt, generationSpec } = {}) {
  const t = getTemplate(templateId);
  if (!t) throw new Error("template not found");
  const version = (listVersions(templateId)[0]?.version || 0) + 1;
  const v = {
    id: crypto.randomUUID(),
    templateId,
    version,
    sourcePath: draftSourceDir(t.slug, version),
    mediaPath: draftMediaDir(t.slug, version),
    thumbnail: null,
    previewVideo: null,
    generationPrompt: generationPrompt || t.generation.prompt || "",
    generationSpec: generationSpec || null,
    generationStatus: "pending",
    qaScore: null,
    qaResults: null,
    testJobIds: [],
    createdAt: Date.now(),
  };
  state.versions.push(v);
  t.currentVersion = version;
  t.updatedAt = Date.now();
  persist();
  return v;
}

function updateVersion(templateId, version, patch) {
  const v = getVersion(templateId, version);
  if (!v) throw new Error("version not found");
  const { id: _id, templateId: _t, version: _v, createdAt, ...safe } = patch || {};
  Object.assign(v, safe);
  const t = getTemplate(templateId);
  if (t) t.updatedAt = Date.now();
  persist();
  return v;
}

// The admin-facing view: a template plus its versions, with the live/draft split
// made explicit so the dashboard never has to infer it.
function describe(id) {
  const t = getTemplate(id);
  if (!t) return null;
  const versions = listVersions(id);
  return {
    ...t,
    versions,
    isLive: t.status === STATUS.PUBLISHED && fs.existsSync(liveSourceDir(t.slug)),
    liveSourceDir: liveSourceDir(t.slug),
    draftSourceDir: t.currentVersion ? draftSourceDir(t.slug, t.currentVersion) : null,
  };
}

module.exports = {
  STATUS, TRANSITIONS, canTransition, ORIENTATIONS,
  slugify, validSlug,
  listTemplates, getTemplate, getTemplateBySlug, createTemplate, updateTemplate, setStatus, deleteTemplate,
  listVersions, getVersion, createVersion, updateVersion, describe,
  draftSourceDir, draftMediaDir, liveSourceDir, liveMediaDir,
  DRAFT_SRC, DRAFT_MEDIA, LIVE_SRC, LIVE_MEDIA,
};
