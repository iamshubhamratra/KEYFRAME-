// Adapter: the admin router's stage contract -> the generator/preview services.
//
// The router loads its two long stages from src/admin/ and calls them with one
// options object ({ template, version, prompt, generation, sourceDir, mediaDir,
// onProgress }), treating a THROW as failure. The services underneath were built
// to their own shapes: template_generator takes an integer version and a `brief`
// and reports failure as { ok:false, stage, error } rather than throwing, and the
// preview lives in template_qa.js (it shares that file's draft resolvers and
// build-previews plumbing) and returns absolute artifact paths.
//
// Bridging here rather than editing either side keeps the services usable from
// scripts and tests — where a returned error object beats an exception — while
// giving the router the throw-on-failure contract its error handling is written
// against.

const path = require("node:path");
const config = require("../config");
const { generateTemplateVersion } = require("../services/template_generator");
const { renderTemplatePreview } = require("../services/template_qa");

const versionNumber = (v) => (v && typeof v === "object" ? v.version : v);

// An on-disk artifact under server/public -> the URL that serves it. Derived from
// the real path rather than hardcoded, so moving the staging directory cannot
// leave the admin UI pointing at a stale URL. Returns null for anything outside
// public/ (nothing to serve) so the caller stores no ref at all.
const PUBLIC_DIR = path.join(config.paths.root, "public");
function publicUrl(abs) {
  if (!abs) return null;
  const rel = path.relative(PUBLIC_DIR, abs);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return `/${rel.split(path.sep).join("/")}`;
}

// Fold the router's split of prompt/generation back into one brief. `prompt` is
// authoritative: the router validates and defaults it before calling.
function briefFrom({ template, prompt, generation }) {
  const g = generation && typeof generation === "object" ? generation : {};
  const t = template || {};
  return {
    prompt: prompt || g.prompt,
    style: g.style,
    brandColor: g.brandColor,
    durationSec: g.durationSec,
    notes: g.notes,
    // The admin form's family picker and the auto batch's per-brief family both
    // live on `generation`; dropping it here made both silently decorative.
    family: g.family,
    // A campaign's reserved motion signature. Same reasoning as family: it is
    // stored on `generation` at create time and enforced at build time.
    pinMotion: g.pinMotion,
    name: t.name,
    orientation: t.orientation,
    category: t.category,
    tags: t.tags,
  };
}

async function generateTemplate({ template, version, prompt, generation, onProgress, signal } = {}) {
  const say = typeof onProgress === "function" ? onProgress : () => {};
  say({ step: "asking the model for a design spec", pct: 10 });

  const out = await generateTemplateVersion({
    template,
    version: versionNumber(version),
    brief: briefFrom({ template, prompt, generation }),
    signal,
  });

  // The service never throws for a model failure; the router only catches.
  if (!out || !out.ok) {
    const stage = (out && out.stage) || "generate";
    throw new Error(`${stage}: ${(out && out.error) || "generation failed"}`);
  }

  say({ step: `wrote ${out.spec.family} pack "${out.spec.label}"`, pct: 90 });
  // The router picks up `spec` as the version's generationSpec, and verifies
  // pack.json + FRAME.md landed in the staging dir itself.
  return { spec: out.spec, manifest: out.manifest, model: out.model, attempts: out.attempts };
}

async function renderPreview({ template, version, onProgress, signal } = {}) {
  const say = typeof onProgress === "function" ? onProgress : () => {};
  say({ step: "rendering a preview clip from the draft", pct: 10 });

  const out = await renderTemplatePreview({ template, version, signal });

  if (!out || !out.ok) {
    const why = (out && out.errors || []).map((e) => e.evidence || e.check || String(e)).join(" · ");
    throw new Error(why || "preview render failed");
  }

  say({ step: `preview ready (${out.sceneCount} scenes, ${out.durationSec}s)`, pct: 90 });
  // Return PUBLIC URLs, not the absolute paths the service reports and not bare
  // basenames. Draft media is written under server/public/frames-draft/, so it is
  // already servable, and the admin UI renders whatever ref it gets straight into
  // an <img>/<video> src (api.js mediaUrl only prefixes a ref beginning with
  // "/"). A basename resolved against the page instead and the detail screen
  // requested /poster.jpg — measured as four 404s in a headless walk. The
  // router's own resolver still finds the file either way: it tries the ref, then
  // the conventional names inside the version's media dir.
  return {
    thumbnail: publicUrl(out.posterPath),
    previewVideo: publicUrl(out.previewPath),
    durationSec: out.durationSec,
    sceneCount: out.sceneCount,
  };
}

module.exports = { generateTemplate, renderPreview };
