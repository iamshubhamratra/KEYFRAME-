// TEMPLATE QA — render ONE draft template, then score it.
//
// ============================ THE SCORE IS 0-100 ============================
// `score` returned from runTemplateQa() is an INTEGER 0-100, higher is better,
// and it is the number the admin dashboard prints as "Template Quality: NN/100".
// It is NOT the vision reviewer's number, and the two are easy to confuse today:
// src/agents/qa_agent.js asks the model for 0-10 and gates on `< 4`,
// services/delivery_quality.js prints that same verdict as "…/10" while carrying
// its OWN deterministic 0-100 beside it, and scripts/inspect-film.js prints the
// 0-10 verdict.score as "score N/100". Nothing here calls the vision agent and
// nothing here reads its number.
// To keep the two from ever being mistaken for one another, every result carries
// `scale:"0-100"` and a ready-made `label`; print the label, not the bare number.
//
// The score is ADVISORY. Publishing is gated on `errors.length === 0` — a
// template with a blocking finding cannot be published however high it scores,
// and a template with no blocking finding is publishable however low.
//
// ---------------------------------------------------------------------------
// Everything below reuses a gate that already exists and is already proven on
// the live fleet; this module writes NO new detectors. It only decides which of
// their findings BLOCK a publish and which are advice:
//   validator.validate      hyperframes lint (structure/time)
//   validator.runInspect    spatial occlusion
//   runtime_check           does it run + an 8-probe seek sweep (the error slate)
//   contrast_check          pixel-truth WCAG AA on settled frames
//   frame_density.scanFilm  ffmpeg ink / dead-band on the rendered MP4
//   layout_fix.layoutProbe  overlap, duplicate lines and text overrun
//   media_fill.scanCoverage declared vs filled media slots, from the built HTML
// Each finding names the check, the evidence, and the file or time it was found
// at, so an admin review is a diff and not an argument.

const fs = require("node:fs");
const path = require("node:path");

const store = require("../admin/template_store");
const frameRegistry = require("./frame_registry");
const frameManifest = require("./frame_manifest");
const validator = require("./validator");
const runtimeCheckMod = require("./runtime_check");
const contrastCheckMod = require("./contrast_check");
const frameDensity = require("./frame_density");
const layoutFix = require("./layout_fix");
const mediaFill = require("./media_fill");
const config = require("../config");
const previews = require("../../scripts/build-previews");

// Where a draft's composition is built. Deliberately NOT jobs/_previews (the
// fleet build wipes that per pack) and never inside public/.
const WORK = path.join(config.paths.jobsDir, "_templates");

// A finding costs the score this much. Calibrated so a template can carry two
// pieces of advice and still read as good (100 -> 92), while a single blocking
// finding drops it out of the "looks fine" band entirely — the score has to
// agree with the publish gate, or an admin learns to trust the wrong one.
//
// FATAL is separate because "one blocking finding" is not one severity. A film
// that fails contrast on a caption still exists and is 82% of a good template; a
// draft that never rendered, or rendered a black card, is not a template at all,
// and an 82/100 next to "cannot publish" is the kind of mixed signal that gets a
// gate overridden. These checks take the score to 0 outright.
const PENALTY = { fatal: 100, error: 18, warning: 4 };
const FATAL = new Set(["manifest", "frame-md", "render", "preview-artifact", "thumbnail-artifact", "runtime-sweep"]);

// The preview/poster floors are build-previews' own, measured constants — the
// same ones that decide which frame becomes a pack's gallery card. Reusing them
// means "good enough to publish" and "good enough to be a card" are one bar.
const { POSTER_FLOOR, DETAIL_FLOOR } = previews;
// A preview that encodes to almost nothing is a solid-colour clip, not a film.
// Measured across the 203 installed pack previews the SMALLEST is 446 KB at
// CRF 26, so this floor is nowhere near a real template — it only has to catch
// a render that produced a held frame or an empty file.
const MIN_PREVIEW_KB = 12;
const MIN_POSTER_KB = 2;

// ---------------------------------------------------------------- findings
function finding(check, evidence, at) {
  return { check, evidence: String(evidence).slice(0, 400), at: at || null };
}

// ------------------------------------------------------ draft pack resolution
//
// WHY THIS EXISTS. Every composer reaches a pack's identity through
// scene_kit.deriveTheme(framePack), and deriveTheme resolves a pack BY NAME:
//   frameManifest.getManifest(name)   -> frames/<name>/pack.json
//   frameRegistry.getPackTokens(name) -> frames/<name>/FRAME.md
// A draft is deliberately not in frames/ — publish IS the move into frames/
// (src/admin/template_store.js). So a draft rendered with the stock resolvers
// hands the composer manifest=null and tokens=null, and deriveTheme falls through
// to its generic fallback branch: a #0B1020 ground, Inter, and the three stock
// accents. QA would then be scoring a film the template never authored.
//
// So the two resolvers take a per-slug source override for the length of one
// draft render. The wrapper is installed ONCE and is a straight pass-through for
// every name that is not currently mid-render as a draft, so no other job's pack
// resolution changes. The one window that is not inert: re-rendering v2 of an
// ALREADY-PUBLISHED slug intercepts that slug for the minutes the render takes,
// so a user job that picked the live pack in that window would compose against
// v2's manifest. Single-operator admin work, and the alternative — rendering v2
// with v1's identity — would make the QA verdict a lie about the wrong file.
const DRAFT_PACK_DIRS = new Map(); // slug -> the draft's source directory
let resolversInstalled = false;

function installDraftResolvers() {
  if (resolversInstalled) return;
  resolversInstalled = true;
  const realManifest = frameManifest.getManifest;
  frameManifest.getManifest = function getManifest(name) {
    const dir = DRAFT_PACK_DIRS.get(name);
    return dir ? draftManifest(dir) : realManifest.call(this, name);
  };
  const realTokens = frameRegistry.getPackTokens;
  frameRegistry.getPackTokens = function getPackTokens(name) {
    const dir = DRAFT_PACK_DIRS.get(name);
    return dir ? draftTokens(name, dir) : realTokens.call(this, name);
  };
}

// mtime-cached exactly like frame_manifest's own loader, because deriveTheme and
// the ornament layers call it several times per composition.
const draftCache = new Map(); // dir -> { manifest, tokens, mtimeMs }
function draftFiles(dir) {
  let st;
  try { st = fs.statSync(path.join(dir, "pack.json")); } catch { return null; }
  const hit = draftCache.get(dir);
  if (hit && hit.mtimeMs === st.mtimeMs) return hit;
  let manifest = null;
  try {
    manifest = frameManifest.PackManifestSchema.parse(JSON.parse(fs.readFileSync(path.join(dir, "pack.json"), "utf8")));
  } catch (e) {
    console.warn(`[template-qa] draft pack.json invalid in ${dir}: ${e.message}`);
  }
  // MIRRORS frame_registry.getPackTokens — the same two frontmatter reads (the
  // `colors:` block and every `fontFamily:`), duplicated only because that
  // function resolves FRAME.md through frames/<name> and cannot be pointed at a
  // draft. Deriving the tokens from pack.json instead is NOT equivalent: measured
  // across the 11 catalog packs the colors match exactly, but all 11 disagree on
  // fonts (terminal-green's manifest says "Alfa Slab One", its FRAME.md still says
  // "JetBrains Mono"), and fonts are what deriveTheme builds the body stack from.
  let md = "";
  try { md = fs.readFileSync(path.join(dir, "FRAME.md"), "utf8"); } catch { /* tokens stay empty */ }
  const fm = (md.match(/^---\r?\n([\s\S]*?)\r?\n---/) || [])[1] || md;
  const colors = {};
  const colorsBlock = fm.match(/^colors:\r?\n((?:[ \t]+.+\r?\n?)+)/m);
  if (colorsBlock) {
    for (const line of colorsBlock[1].split(/\r?\n/)) {
      const m = line.match(/^[ \t]+([\w-]+):\s*"(#[0-9a-fA-F]{6})"/);
      if (m) colors[m[1]] = m[2].toUpperCase();
    }
  }
  const fonts = [...new Set([...fm.matchAll(/fontFamily:\s*"([^"]+)"/g)].map((m) => m[1]))];
  const rec = { manifest, tokens: md ? { name: path.basename(dir), colors, fonts } : null, mtimeMs: st.mtimeMs };
  draftCache.set(dir, rec);
  return rec;
}
function draftManifest(dir) { const r = draftFiles(dir); return r ? r.manifest : null; }

// The perceptual brightness of the pack's own declared ground, so the poster
// floor can be judged against the surface the template actually paints rather
// than against a light pack's. NaN when the draft declares no ground, which
// leaves the original fixed floor in force.
// The template's SUBJECT, in the order it is most likely to be a real subject
// rather than a description of the look. `category` is what a campaign stores its
// subject in; `tags` are admin-authored; the display name is the last resort. The
// generation PROMPT is deliberately not used — it is prose about palette and mood
// ("deep navy ground, one electric accent"), and querying a picture library with
// it returns pictures of navy and electricity.
function assetSubjectOf(template) {
  const t = template || {};
  const parts = [
    t.category,
    Array.isArray(t.tags) ? t.tags.slice(0, 3).join(" ") : "",
    t.name,
  ].map((s) => String(s || "").replace(/[-_]+/g, " ").trim()).filter(Boolean);
  return parts.length ? parts.join(" ").slice(0, 120) : null;
}

function draftGroundLuma(dir) {
  const m = draftManifest(dir);
  const g = m && m.surface && m.surface.ground;
  const hex = /^#?([0-9a-f]{6})$/i.exec(String(g || "").trim());
  if (!hex) return NaN;
  const n = parseInt(hex[1], 16);
  return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
}
function draftTokens(name, dir) {
  const r = draftFiles(dir);
  return r && r.tokens ? { ...r.tokens, name } : null;
}

// ---------------------------------------------------------------- draft paths
// Accepts a version NUMBER or the version record createVersion() returned, so a
// caller can pass whichever it is holding.
function resolveDraft(template, version) {
  if (!template || !store.validSlug(template.slug)) throw new Error("renderTemplatePreview needs a template with a valid slug");
  const rec = version && typeof version === "object" ? version : null;
  const n = Number(rec ? rec.version : (version != null ? version : template.currentVersion));
  if (!Number.isInteger(n) || n < 1) throw new Error(`template "${template.slug}" has no generated version to render`);
  return {
    slug: template.slug,
    version: n,
    sourceDir: (rec && rec.sourcePath) || store.draftSourceDir(template.slug, n),
    mediaDir: (rec && rec.mediaPath) || store.draftMediaDir(template.slug, n),
  };
}

const aborted = (signal) => { if (signal && signal.aborted) throw signal.reason || new Error("template preview aborted"); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Get the finished render OUT of the served videos directory and into the work
// dir. It retries because the renderer fires its gallery thumbnail off the
// destination WITHOUT awaiting it (renderer.js: generateThumbnail(...).catch()),
// so ffmpeg can still hold a read handle when we arrive and Windows refuses the
// rename — measured on the first draft run: the rename lost the race, the copy
// fallback succeeded, the unlink did not, and a 2 MB draft film was left sitting
// under /videos/. The fleet build never hits this because it deletes the render
// only after its own long ffmpeg pass. Returns `evacuated:false` when the served
// copy survived, which the caller turns into a publish blocker.
async function evacuateRender(from, to) {
  for (let i = 0; i < 5; i++) {
    try { fs.renameSync(from, to); return { path: to, evacuated: true }; }
    catch { await wait(250 * (i + 1)); }
  }
  try { fs.copyFileSync(from, to); } catch { return { path: null, evacuated: !fs.existsSync(from) }; }
  for (let i = 0; i < 5; i++) {
    try { fs.unlinkSync(from); return { path: to, evacuated: true }; }
    catch { await wait(250 * (i + 1)); }
  }
  return { path: fs.existsSync(to) ? to : null, evacuated: false };
}

// Run one gate. A checker that THROWS must never strand an admin mid-pipeline —
// every gate in this codebase is fail-open by construction — so a crash inside a
// checker is recorded exactly like a missing Chromium: the gate could not run,
// it costs no score, and the verdict says so instead of claiming a clean bill.
// This is not hypothetical: services/validator.js calls cliFor() without
// importing it from hyperframes_cli, so validate() and runInspect() throw
// ReferenceError on every call, and the first draft QA run died on the lint.
async function gate(check, at, run, skipped) {
  try { return await run(); }
  catch (e) {
    skipped.push(finding(check, `the checker itself failed: ${String(e && e.message || e).slice(0, 200)}`, at));
    return null;
  }
}

// The draft's source has to be a real pack before anything renders it: pack.json
// present and schema-valid, FRAME.md present (the registry's own liveness test —
// a folder without one is not a pack at all). Fail-CLOSED: these are errors, not
// warnings, because they are the difference between publishing a template and
// publishing an empty directory.
function checkSource(sourceDir) {
  const errors = [], passed = [];
  const packPath = path.join(sourceDir, "pack.json");
  const mdPath = path.join(sourceDir, "FRAME.md");
  if (!fs.existsSync(packPath)) {
    errors.push(finding("manifest", "the draft has no pack.json — nothing describes this template", packPath));
  } else {
    try {
      const raw = JSON.parse(fs.readFileSync(packPath, "utf8"));
      frameManifest.PackManifestSchema.parse(raw);
      passed.push(finding("manifest", `pack.json parses and validates against PackManifestSchema (name "${raw.name}")`, packPath));
    } catch (e) {
      // A zod failure stringifies as a JSON array, so its first line is literally
      // "[" — useless as evidence. Name the failing fields instead.
      const why = Array.isArray(e.issues) && e.issues.length
        ? e.issues.slice(0, 3).map((i) => `${(i.path || []).join(".") || "(root)"} — ${i.message}`).join("; ")
        : String(e.message).split("\n")[0];
      errors.push(finding("manifest", `pack.json is not a valid manifest: ${why}`, packPath));
    }
  }
  if (!fs.existsSync(mdPath)) {
    errors.push(finding("frame-md", "the draft has no FRAME.md — frame_registry.listPacks() filters on it, so publishing this would move an invisible folder into frames/", mdPath));
  } else {
    passed.push(finding("frame-md", `FRAME.md present (${Math.round(fs.statSync(mdPath).size / 1024)} KB of design system)`, mdPath));
  }
  return { errors, passed };
}

/**
 * Render the draft's preview.mp4 + poster.jpg into store.draftMediaDir(slug, v).
 *
 * Same composer routing and the same production render() the whole gallery is
 * built with (scripts/build-previews.js), so the clip an admin reviews is the
 * clip the template produces. Returns the artifact paths, the timings, and —
 * because the brief is that a template with no real thumbnail or preview CANNOT
 * be published — an `errors` array naming any artifact that is missing or below
 * build-previews' own poster floors. `ok` is false whenever that array is not.
 */
async function renderTemplatePreview({ template, version, signal } = {}) {
  const started = Date.now();
  const { slug, version: v, sourceDir, mediaDir } = resolveDraft(template, version);
  const src = checkSource(sourceDir);
  if (src.errors.length) {
    return {
      ok: false, slug, version: v, sourceDir, mediaDir,
      previewPath: null, posterPath: null, workDir: null,
      errors: src.errors, passed: src.passed, timings: { totalMs: Date.now() - started },
    };
  }

  aborted(signal);
  const workDir = path.join(WORK, `${slug}-v${v}`);
  installDraftResolvers();
  DRAFT_PACK_DIRS.set(slug, sourceDir);
  let built = null, renderError = null;
  const t0 = Date.now();
  try {
    built = await previews.buildPack(slug, {
      packDir: sourceDir,
      outDir: mediaDir,
      jobDir: workDir,
      jobId: `template-${slug}-v${v}`,
      keepWork: true,          // QA needs the composed index.html; we clear it below
      abortSignal: signal,
      // WHAT THE TEMPLATE IS ABOUT, for the curated-library queries. A campaign
      // stores its subject as the category ("cats-playing"); a hand-made template
      // has whatever the admin typed. Without this the preview carries no
      // pictures, which beats carrying the wrong ones — a fixed generic query set
      // once put a filing cabinet and a neural-network diagram in a montage.
      assetSubject: assetSubjectOf(template),
    });
  } catch (e) {
    renderError = e;
  } finally {
    DRAFT_PACK_DIRS.delete(slug);
  }
  const renderMs = Date.now() - t0;

  // THE FULL-RES RENDER IS WEB-REACHABLE. render() moves out.mp4 into
  // config.paths.videosDir, which server.js serves as static /videos/<id>.mp4 —
  // so an unpublished draft's film is fetchable by anyone who guesses the id
  // until this runs. Move it into the (unserved) work dir rather than deleting
  // it, so frame_density still measures the full-resolution film.
  let filmPath = null, evacuated = true;
  if (built && built.videoPath) {
    const moved = await evacuateRender(built.videoPath, path.join(workDir, "film.mp4"));
    filmPath = moved.path; evacuated = moved.evacuated;
    try { fs.unlinkSync(built.videoPath.replace(/\.mp4$/, ".jpg")); } catch { /* thumbnail is optional */ }
  }

  if (renderError) {
    return {
      ok: false, slug, version: v, sourceDir, mediaDir, workDir,
      previewPath: null, posterPath: null, filmPath,
      errors: [finding("render", `the draft did not render: ${String(renderError.message).slice(0, 300)}`, workDir)],
      passed: src.passed, timings: { renderMs, totalMs: Date.now() - started },
    };
  }
  aborted(signal);

  // ---- artifact floors. A missing/black/flat card is a publish blocker.
  const errors = [], passed = [...src.passed];
  if (!evacuated) {
    errors.push(finding("render-leak",
      `the full-resolution render could not be removed from ${path.basename(config.paths.videosDir)}/ — it is served as /videos/${path.basename(built.videoPath)} and this draft is not published`,
      built.videoPath));
  }
  const previewPath = built.previewOut, posterPath = built.posterOut;
  const kb = (p) => { try { return Math.round(fs.statSync(p).size / 1024); } catch { return 0; } };
  const previewKb = kb(previewPath), posterKb = kb(posterPath);

  if (previewKb < MIN_PREVIEW_KB) {
    errors.push(finding("preview-artifact",
      previewKb ? `preview.mp4 encoded to ${previewKb} KB — below the ${MIN_PREVIEW_KB} KB floor, which is a flat/solid clip, not a film`
        : "preview.mp4 was never written", previewPath));
  } else {
    passed.push(finding("preview-artifact", `preview.mp4 is ${previewKb} KB, ${built.storyboard.durationSec}s over ${built.storyboard.scenes.length} scenes, composed via ${built.via}`, previewPath));
  }

  const poster = built.poster || {};
  // WHAT "TOO DARK" ACTUALLY MEANS.
  //
  // A flat 26 luma floor asks every pack to be as bright as a light one, and a
  // deliberately dark template cannot be: its ground IS near-black, so the mean
  // luma of any honest frame sits near the ground's. Two generated packs were
  // blocked here at luma 20 — and the frame the gate called "a black rectangle"
  // was a mission-control card with HUD corner marks, an orange emphasis box and
  // two labelled panels. Plainly not a black rectangle.
  //
  // The check that carries the real intent is DETAIL (luma spread): a card is
  // dead when nothing is drawn on it, not when the ink it carries is set on a
  // dark ground. So a dark pack must clear its own ground by a real margin and
  // still satisfy the (unchanged) detail floor below; a light pack is held to
  // the original bar.
  const groundLuma = draftGroundLuma(sourceDir);
  const darkPack = Number.isFinite(groundLuma) && groundLuma < POSTER_FLOOR;
  const lumaFloor = darkPack ? Math.max(10, Math.round(groundLuma) + 4) : POSTER_FLOOR;
  if (posterKb < MIN_POSTER_KB) {
    errors.push(finding("thumbnail-artifact", posterKb ? `poster.jpg is only ${posterKb} KB` : "poster.jpg was never written", posterPath));
  } else if (Number(poster.luma) < lumaFloor) {
    errors.push(finding("thumbnail-artifact",
      `every candidate frame was dark — the best is luma ${poster.luma} against the ${lumaFloor} floor`
      + (darkPack ? ` (this pack's ground is luma ${Math.round(groundLuma)}, so the frame carries almost no lit content)` : ", so the gallery card would be a black rectangle"),
      `${posterPath} @${poster.t}s`));
  } else if (Number(poster.detail) < DETAIL_FLOOR) {
    errors.push(finding("thumbnail-artifact",
      `the chosen card frame is flat — luma spread ${poster.detail} against the ${DETAIL_FLOOR} floor, i.e. a plain slab with no type or furniture on it`,
      `${posterPath} @${poster.t}s`));
  } else {
    passed.push(finding("thumbnail-artifact",
      `poster.jpg picked at ${poster.t}s (luma ${poster.luma} ≥ ${POSTER_FLOOR}, detail ${poster.detail} ≥ ${DETAIL_FLOOR}, ground gap ${poster.groundGap ?? "n/a"})`,
      posterPath));
  }

  return {
    ok: errors.length === 0,
    slug, version: v, sourceDir, mediaDir, workDir,
    previewPath, posterPath, filmPath,
    via: built.via,
    durationSec: built.storyboard.durationSec,
    sceneCount: built.storyboard.scenes.length,
    scenes: built.storyboard.scenes,
    previewKb, posterKb, poster,
    errors, passed,
    timings: { renderMs, totalMs: Date.now() - started },
  };
}

// Did the composition actually go through the renderer the pack declared?
//
// An unroutable `renderer` value is SILENT: the routing table is a plain object
// lookup (scripts/build-previews.js PACK_RENDERERS, mirroring pipeline.js), and a
// miss falls straight through to the deterministic scene-kit. The template then
// ships as a generic film wearing its own palette — the "declared but never
// rendered" class scripts/audit-identity.js exists for. `via` is the routing
// decision the build just made, so comparing it against the manifest catches the
// miss without re-listing the renderer names here.
function checkRenderer(manifest, via, sourceDir) {
  const errors = [], warnings = [], passed = [];
  const packPath = path.join(sourceDir, "pack.json");
  const renderer = (manifest && manifest.renderer) || null;
  if (!renderer) {
    passed.push(finding("renderer-routing", `no renderer declared, and the build composed via "${via}" — the default deterministic path`, packPath));
  } else if (via !== renderer) {
    errors.push(finding("renderer-routing",
      `pack.json declares renderer "${renderer}" but the build composed via "${via}" — the name is not in the routing table, so the template's own composer never runs`,
      packPath));
  } else {
    passed.push(finding("renderer-routing", `renderer "${renderer}" is declared and the build composed through it`, packPath));
  }
  // check-slot-types is the type-conformance gate, and it only has anything to
  // check on a BUNDLED template: the defect is a compiled React scene reading an
  // authored-array prop with .map(), so a string in that slot throws and paints
  // the engine's error slate for the rest of the film. It is a fleet CLI that
  // exits the process, so it is named rather than called from here.
  if (renderer === "omelette") {
    let file = null;
    try { file = require("./omelette_adapter").templatePath((manifest && manifest.template) || (manifest && manifest.name)); } catch { /* reported below */ }
    if (!file) {
      errors.push(finding("renderer-routing",
        `renderer "omelette" needs a bundled film named by "template" (got ${JSON.stringify((manifest && manifest.template) || null)}) and no such file exists — compose throws`,
        packPath));
    } else {
      warnings.push(finding("slot-types",
        `bundled template "${path.basename(file)}" — run \`node scripts/check-slot-types.js\` before publishing; only these packs can be blanked by a prop TYPE mismatch`,
        packPath));
    }
  } else {
    passed.push(finding("slot-types", `not applicable — the slot-type gate only covers bundled (omelette) templates and this draft composes via "${via}"`, packPath));
  }
  return { errors, warnings, passed, renderer };
}

/**
 * Score one draft template.
 *
 * Pass the result of renderTemplatePreview() as `render` and this reuses that
 * render (and leaves its work dir for the caller to dispose). Omit it and this
 * renders one itself and cleans up after itself.
 *
 * Returns { score, scale, label, errors[], warnings[], passed[], skipped[],
 *           publishable, ... } — see the scale note at the top of this file.
 *   errors   BLOCK the publish. publishable === (errors.length === 0).
 *   warnings are advice; they cost score but never block.
 *   skipped  is a gate that could not run (no Chromium, no ffmpeg). It costs
 *            nothing — a checker must never fail a template on its own absence —
 *            but it is reported so a green verdict is never mistaken for a
 *            complete one.
 */
async function runTemplateQa({ template, version, render = null, signal } = {}) {
  const started = Date.now();
  const own = !render;
  const r = render || await renderTemplatePreview({ template, version, signal });

  const errors = [...(r.errors || [])];
  const warnings = [];
  const passed = [...(r.passed || [])];
  const skipped = [];

  try {
    // A render that never produced a composition cannot be probed further; the
    // artifact findings above are the whole verdict.
    if (!r.workDir || !fs.existsSync(path.join(r.workDir, "index.html"))) {
      return verdict({ r, errors, warnings, passed, skipped, started });
    }
    const jobDir = r.workDir;
    const indexHtml = fs.readFileSync(path.join(jobDir, "index.html"), "utf8");
    const metaJson = fs.readFileSync(path.join(jobDir, "meta.json"), "utf8");
    const meta = JSON.parse(metaJson);
    const manifest = draftManifest(r.sourceDir);

    // ---- renderer routing + slot types (static, free) ----
    const route = checkRenderer(manifest, r.via, r.sourceDir);
    errors.push(...route.errors); warnings.push(...route.warnings); passed.push(...route.passed);

    // ---- orientation: the record and the render must agree ----
    // /api/frames files a pack into the gallery's Horizontal or Vertical tab from
    // its poster.jpg dimensions, so a vertical template whose pack.json forgot
    // portraitNative renders 16:9 and lands in the wrong tab for good.
    const wantPortrait = template && template.orientation === "vertical";
    const isPortrait = Number(meta.height) > Number(meta.width);
    if (wantPortrait !== isPortrait && template && template.orientation !== "square") {
      errors.push(finding("orientation",
        `the template is registered "${template.orientation}" but the composition rendered ${meta.width}x${meta.height}` +
        `${wantPortrait ? ' — set "portraitNative": true in pack.json' : ' — remove "portraitNative" from pack.json'}`,
        path.join(r.sourceDir, "pack.json")));
    } else if (template && template.orientation === "square") {
      warnings.push(finding("orientation", `registered "square", but the preview build only renders 16:9 or 9:16 — this rendered ${meta.width}x${meta.height}`, path.join(r.sourceDir, "pack.json")));
    } else {
      passed.push(finding("orientation", `rendered ${meta.width}x${meta.height}, which matches the registered "${template ? template.orientation : "?"}" orientation`, path.join(jobDir, "meta.json")));
    }

    // ---- media demand: slots the composition declared vs slots it filled ----
    // A preview is composed with NO assets on purpose, so unfilled slots are
    // expected; what matters is whether the template draws a designed card in
    // their place or leaves a hole. It is advice — frame_density measures the
    // hole in pixels below, and pixels are the truth.
    const htmlPath = path.join(jobDir, "index.html");
    const cov = await gate("media-demand", htmlPath, async () => mediaFill.scanCoverage(indexHtml).totals || {}, skipped);
    if (cov) {
      // scanCoverage counts per-clip `data-media-demand` / `data-media-filled`
      // stamps, and only template_engine and momentum emit them — a bundled
      // (omelette) or hand-rolled composition carries none, so the scan finds
      // zero scenes. Measured on the motorway draft: 0 scenes, 0 demand, which
      // this used to report as "no unfilled media boxes". A gate that measured
      // nothing must not be recorded as a pass.
      if (!cov.scenes) {
        skipped.push(finding("media-demand", `the composition carries no per-clip media stamps (via "${r.via}"), so coverage cannot be counted from the HTML`, htmlPath));
      } else if (cov.emptyBoxes) {
        warnings.push(finding("media-demand",
          `${cov.emptyBoxes} unfilled media box(es) across ${cov.scenes} scene(s) (demand ${cov.demand}, filled ${cov.filled}) — with no assets supplied these render as the template's placeholder`,
          htmlPath));
      } else {
        passed.push(finding("media-demand", `no unfilled media boxes (demand ${cov.demand || 0} over ${cov.scenes || 0} scene(s))`, htmlPath));
      }
    }

    // ---- hyperframes lint ----
    aborted(signal);
    const lint = await gate("hyperframes-lint", htmlPath, () => validator.validate(jobDir, { indexHtml, metaJson }), skipped);
    if (lint && !lint.ok) {
      errors.push(finding("hyperframes-lint", `lint exited ${lint.code}: ${(lint.stderr || lint.stdout || "").trim().slice(-300)}`, htmlPath));
    } else if (lint) {
      passed.push(finding("hyperframes-lint", "the composition passes hyperframes lint", htmlPath));
    }

    // ---- spatial occlusion ----
    aborted(signal);
    const inspect = await gate("spatial-occlusion", jobDir, () => validator.runInspect(jobDir), skipped);
    if (inspect && inspect.skipped) {
      skipped.push(finding("spatial-occlusion", `hyperframes inspect could not run${inspect.note ? `: ${inspect.note}` : ""}`, jobDir));
    } else if (inspect && inspect.errors.length) {
      for (const e of inspect.errors.slice(0, 6)) {
        errors.push(finding("spatial-occlusion", `${e.code || "occlusion"}: ${e.message || JSON.stringify(e).slice(0, 200)}`, e.selector || e.at || jobDir));
      }
    } else if (inspect) {
      passed.push(finding("spatial-occlusion", "hyperframes inspect found no element occluding text, at rest or at transitions", jobDir));
    }

    // ---- does it actually run, all the way through ----
    aborted(signal);
    const rt = await gate("runtime-sweep", jobDir, () => runtimeCheckMod.runtimeCheck(jobDir), skipped);
    if (rt && rt.skipped) {
      skipped.push(finding("runtime-sweep", `runtime check could not run: ${rt.skipped}`, jobDir));
    } else if (rt && !rt.ok) {
      errors.push(finding("runtime-sweep", rt.error, rt.atSec != null ? `${htmlPath} @${rt.atSec}s` : htmlPath));
    } else if (rt) {
      passed.push(finding("runtime-sweep", "the timeline registers and 8 seek probes across the film found no error slate", htmlPath));
    }

    // ---- WCAG AA on real pixels ----
    aborted(signal);
    const cc = await gate("contrast-wcag", jobDir, () => contrastCheckMod.contrastCheck(jobDir), skipped);
    if (cc && cc.skipped) {
      skipped.push(finding("contrast-wcag", `contrast check could not run: ${cc.skipped}`, jobDir));
    } else if (cc && (cc.persistentFailures || []).length) {
      for (const f of cc.persistentFailures.slice(0, 6)) {
        errors.push(finding("contrast-wcag",
          `"${f.text}" reads ${f.bestRatio}:1 at its clearest against rgb(${f.bestBg.join(",")}) — AA needs ${f.needed}:1`,
          `${f.selector} @${f.bestTime}s`));
      }
    } else if (cc) {
      passed.push(finding("contrast-wcag", `every settled text element clears WCAG AA across ${(cc.samples || []).length} sampled frames`, jobDir));
    }

    // ---- empty slides, measured on the rendered film ----
    aborted(signal);
    const filmForDensity = r.filmPath && fs.existsSync(r.filmPath) ? r.filmPath : r.previewPath;
    if (filmForDensity && fs.existsSync(filmForDensity)) {
      const dens = await gate("frame-density", filmForDensity,
        () => frameDensity.scanFilm(filmForDensity, { scenes: r.scenes, portrait: isPortrait }), skipped);
      if (dens) {
        const empties = dens.findings.filter((f) => f.kind === "empty-frame");
        const bands = dens.findings.filter((f) => f.kind === "dead-band");
        for (const f of empties.slice(0, 6)) errors.push(finding("frame-density", `scene ${f.sceneId}: ${f.why}`, `${filmForDensity} @${f.t}s`));
        for (const f of bands.slice(0, 6)) warnings.push(finding("frame-density", `scene ${f.sceneId}: ${f.why}`, `${filmForDensity} @${f.t}s`));
        if (!dens.findings.length) {
          const min = dens.frames.reduce((a, b) => (b.inkRatio < a.inkRatio ? b : a), dens.frames[0]);
          passed.push(finding("frame-density",
            `${dens.frames.length} sampled frame(s) carry content; the emptiest is scene ${min ? min.sceneId : "?"} at ${min ? Math.round(min.inkRatio * 100) : "?"}% ink`,
            filmForDensity));
        }
      }
    } else {
      skipped.push(finding("frame-density", "no rendered film to measure", r.mediaDir));
    }

    // ---- overlap, duplicate lines, overrun ----
    aborted(signal);
    const probe = await gate("layout-overlap", jobDir, () => layoutFix.layoutProbe(jobDir), skipped);
    if (probe && probe.skipped) {
      skipped.push(finding("layout-overlap", `layout probe could not run: ${probe.skipped}`, jobDir));
    } else if (probe) {
      const la = layoutFix.analyze(probe.frames);
      for (const c of la.collisions.slice(0, 6)) {
        errors.push(finding("layout-overlap", `"${c.text}" is painted over by a graphic sitting above it`, c.selector));
      }
      // A shrink of more than 15% means the copy genuinely does not fit the box
      // the template gave it — a defect every film made from this template will
      // repeat. Anything gentler is a fit nudge, not a fault.
      for (const o of la.overruns.slice(0, 6)) {
        const pct = Math.round((1 - o.scale) * 100);
        const f = finding("layout-overrun", `"${o.text}" overruns its box and needs a ${pct}% shrink to fit (${o.fontPx}px in a ${o.linePx}px line)`, o.selector);
        (o.scale < 0.85 ? errors : warnings).push(f);
      }
      for (const d of la.duplicates.slice(0, 4)) warnings.push(finding("layout-duplicate", `"${d.text}" is rendered twice in the same frame`, d.selector));
      for (const o of la.ornaments.slice(0, 4)) warnings.push(finding("layout-overlap", "an ornament is painted across text and would have to be dropped", o.selector));
      if (!la.collisions.length && !la.overruns.length && !la.duplicates.length && !la.ornaments.length) {
        passed.push(finding("layout-overlap", `${probe.frames.length} sampled frame(s): no collision, duplicate line or overrun`, jobDir));
      }
    }

    return verdict({ r, errors, warnings, passed, skipped, started });
  } finally {
    // Only dispose of a render this call created. When the caller handed one in,
    // the work dir is theirs — but the film inside it is web-unreachable either
    // way, which is the part that matters.
    if (own) disposeTemplateWork(r);
  }
}

function verdict({ r, errors, warnings, passed, skipped, started }) {
  const cost = errors.reduce((n, e) => n + (FATAL.has(e.check) ? PENALTY.fatal : PENALTY.error), 0)
    + (warnings.length * PENALTY.warning);
  const score = Math.max(0, Math.min(100, Math.round(100 - cost)));
  return {
    slug: r.slug,
    version: r.version,
    // Read the scale note at the top of this file before printing `score`.
    scale: "0-100",
    score,
    label: `Template Quality: ${score}/100`,
    publishable: errors.length === 0,
    errors, warnings, passed, skipped,
    // Say what was actually looked at. A source-only verdict (the draft never
    // rendered) must not read like a full sweep that happened to find two faults.
    coverage: `${passed.length + errors.length + warnings.length} finding(s) from ` +
      `${new Set([...passed, ...errors, ...warnings].map((f) => f.check)).size} gate(s)` +
      (r.workDir
        ? (skipped.length ? `; ${skipped.length} gate(s) could not run` : "; every gate ran")
        : "; the draft never reached a render, so no picture gate ran"),
    previewPath: r.previewPath || null,
    posterPath: r.posterPath || null,
    mediaDir: r.mediaDir || null,
    via: r.via || null,
    durationSec: r.durationSec || null,
    durationMs: Date.now() - started,
  };
}

// Remove a draft render's scratch directory (and with it the full-resolution
// film moved out of public/videos). Safe to call twice.
function disposeTemplateWork(r) {
  if (!r || !r.workDir) return;
  try { fs.rmSync(r.workDir, { recursive: true, force: true }); } catch { /* windows handle lag; reclaimed on the next run */ }
}

module.exports = {
  renderTemplatePreview, runTemplateQa, disposeTemplateWork,
  PENALTY, MIN_PREVIEW_KB, MIN_POSTER_KB, WORK,
};
