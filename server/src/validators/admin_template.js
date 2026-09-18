// Request validation for the admin template pipeline (/api/admin/templates).

const config = require("../config");
const store = require("../models/template");

const TEMPLATE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isTemplateId = (id) => TEMPLATE_ID_RE.test(String(id || ""));

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

// The renderer families a spec may target, read from the pack authoring tool so
// this list can never drift from the one that actually builds packs. Fail-open:
// if the tool can't be loaded, family simply isn't validated here (the generator
// validates it again anyway).
function knownFamilies() {
  try { return Object.keys(require("../../scripts/new-pack").FAMILIES); } catch { return null; }
}

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
// Appends to `errs`; returns the accepted fields.
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

// PATCH body -> { errs, patch }. Status and slug are refused loudly rather than
// dropped: the store silently ignores them, so a UI that thinks it can rename a
// slug finds out immediately instead of shipping a no-op. Status moves only
// through the lifecycle routes.
function validatePatch(body, t) {
  if ("status" in body) return { errs: ["status is not editable — use the publish/unpublish/archive routes"], patch: null };
  if ("slug" in body) return { errs: ["slug is immutable — it is the pack's directory name in frames/"], patch: null };

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
  return { errs, patch };
}

// Body of POST /:id/test -> the render settings, defaulting to the template's own
// prompt and a 30s film.
function validateTestRender(body, t) {
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
  return { errs, prompt, duration: Math.round(d), quality, fps };
}

module.exports = { isTemplateId, validateCreate, validateGeneration, validatePatch, validateTestRender };
