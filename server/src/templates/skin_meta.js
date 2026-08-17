// SKIN METADATA MAINTENANCE — keep film_skins/_metadata.json correct across a publish.
//
// WHY THIS EXISTS. A FilmKit pack.json is DERIVED, not authored: scripts/gen-film-packs.js reads
// the skin module for the mechanical half (palette, fonts, slot geometry) and _metadata.json for
// the creative half (vibe, category, tags, audio, assets, FRAME.md body). An admin-generated
// template gets that creative half passed in directly from its validated spec — which is correct
// at emit time, and a trap afterwards, because _metadata.json never learns about it. Two things
// then go wrong the moment a template is published:
//
//   1. `npm run frames:gen` regenerates every PUBLISHED pack (unpublished admin templates are
//      skipped by design; published ones are deliberately not). With no entry to read, packFor
//      falls through to `meta.audio || {…default}` and the same for vibe/category/tags — so a
//      routine library regeneration silently overwrites a designed template's identity with
//      generic defaults. Nothing fails; the pack just quietly stops being the one that was
//      designed. `--check` cannot catch it either: it validates shape, and the wiped pack is
//      perfectly well-shaped.
//   2. scripts/apply-audio-profiles.js resolves a FilmKit pack's audio profile from this same
//      file, so a published template with no entry reports as UNPROFILED and falls back to the
//      neutral bed — the audio the designer wrote is simply not consulted.
//
// So publishing writes the entry, and unpublishing takes it back out. Same shape and same
// reasoning as baseline.js: the library's own tooling must stay honest about a template the
// admin system just added to it, and the write is best-effort — a metadata file that cannot be
// updated is a tooling problem, never a reason to refuse a publish that passed every gate.

const fs = require("node:fs");
const path = require("node:path");

const META_PATH = path.join(__dirname, "..", "services", "film_skins", "_metadata.json");

function read() {
  try { return { text: fs.readFileSync(META_PATH, "utf8") }; }
  catch { return { text: null }; }
}

// The 89 shipped entries are written by gen-film-skins.js with 2-space JSON and a trailing
// newline; matching that keeps a publish from showing up as a whole-file reformat in `git diff`.
function write(obj) {
  fs.writeFileSync(META_PATH, `${JSON.stringify(obj, null, 2)}\n`, "utf8");
}

/**
 * Upsert the creative half of a published template, in the exact shape packFor() reads.
 * Returns {changed, reason?}.
 */
function addPack(slug, spec) {
  if (!slug || !spec) return { changed: false, reason: "no spec" };
  const { text } = read();
  if (text == null) return { changed: false, reason: `${META_PATH} not found` };

  let all;
  try { all = JSON.parse(text); } catch (e) { return { changed: false, reason: `unparseable: ${e.message}` }; }

  const entry = {
    slug,
    vibe: spec.vibe,
    category: spec.category,
    tags: spec.tags,
    audio: spec.audio,
    assets: spec.assets,
    frameMd: spec.frameMdBody,
  };
  if (JSON.stringify(all[slug]) === JSON.stringify(entry)) return { changed: false, reason: "already current" };
  all[slug] = entry;
  write(all);
  return { changed: true };
}

/** Remove the entry again — an unpublished template is not part of the library's metadata. */
function removePack(slug) {
  const { text } = read();
  if (text == null) return { changed: false, reason: `${META_PATH} not found` };
  let all;
  try { all = JSON.parse(text); } catch (e) { return { changed: false, reason: `unparseable: ${e.message}` }; }
  if (!Object.prototype.hasOwnProperty.call(all, slug)) return { changed: false, reason: "no entry" };
  delete all[slug];
  write(all);
  return { changed: true };
}

module.exports = { addPack, removePack, META_PATH };
