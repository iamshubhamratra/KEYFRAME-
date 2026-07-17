// Screenshot Intelligence — the DETERMINISTIC intake pre-filter.
//
// Puppeteer captures website screenshots mechanically (ingest/website.js). This
// runs right after, BEFORE they become assets, and prunes the two kinds of shot
// that are unusable no matter what the downstream Creative Director thinks:
//   • BLANK / low-information — a near-solid page (error page, un-rendered
//     section, plain banner). Reused from validateImage's stdev<5 gate.
//   • DUPLICATE — the hero and a scrolled section that captured the same fold.
//     Reused from makeImageDeduper (MD5 exact + dHash perceptual, Hamming<=10),
//     keeping the STRONGEST of each near-duplicate group (most visual detail).
//
// It is deterministic by DESIGN — there is deliberately NO vision/LLM call here.
// The semantic checks the spec asks for (popup residue, loading skeletons, broken
// UI) are folded into the Creative Director's EXISTING batched vision pass over
// these exact pixels (creative_director.js) — adding a second vision pass at
// intake would double per-screenshot model cost over pixels the CD re-inspects.
// DO NOT import an LLM here. This module only ever spawns ffmpeg/ffprobe (no
// native image deps, per the repo policy).
//
// FAIL-OPEN, like every stage: a probe/ffmpeg failure KEEPS the shot (unknown is
// not bad), and pruning to zero is an already-supported outcome (auth walls hit
// it today — stock/brand fill the film). Never throws.

const path = require("node:path");
const { validateImage, makeImageDeduper } = require("./asset_sources/util");

// Rank by detail (stdev from imageDHashStats, surfaced on validateImage.meta):
// a busier screenshot carries more product story than a sparse one, and — for
// near-duplicates — the higher-detail shot is the one worth keeping.
function strength(p) { return typeof p.stdev === "number" ? p.stdev : 0; }

// Filter the captured screenshot paths down to the clean, non-duplicate keepers.
// `shots` is the ordered absolute-path list (hero first), i.e. website.screenshotPaths.
// Returns { keptShots:[{ path, ratio }], review } — keptShots preserves the
// ORIGINAL order (hero first) so the downstream scene-pinning order is unchanged.
async function filterScreenshots({ shots } = {}) {
  const list = Array.isArray(shots) ? shots.filter(Boolean) : [];
  const review = { captured: list.length, kept: 0, dropped: [], suppressed: [], demoted: [], notes: [] };
  if (!list.length) return { keptShots: [], review };

  // 1) Validate each shot (blank/low-info) and gather stdev/dhash/ratio in ONE
  //    ffmpeg/ffprobe pass (validateImage does probe + dHash + dominant color).
  //    Fail-open: a validation error is treated as OK (keep) with zero strength.
  const probed = await Promise.all(list.map(async (abs, i) => {
    let ok = true, meta = null;
    try { const v = await validateImage(abs); ok = v.ok; meta = v.meta; } catch { ok = true; meta = null; }
    return {
      abs, i, ok,
      stdev: meta && meta.stdev != null ? meta.stdev : 0,
      dhash: meta ? meta.dhash : null,
      ratio: meta && meta.ratio != null ? meta.ratio : null,
    };
  }));

  // 2) Drop blanks (validateImage ok:false === low-information / near-solid).
  const nonBlank = [];
  for (const p of probed) {
    if (!p.ok) review.dropped.push({ path: path.basename(p.abs), reason: "blank" });
    else nonBlank.push(p);
  }

  // 3) Keep-strongest dedup. Process STRONGEST-first (stdev desc, original order
  //    — hero — as the tie-break): the deduper records the first sighting and
  //    reports later near-duplicates, so the most-detailed member of a duplicate
  //    group is the one recorded (kept) and the weaker copies are dropped.
  const order = nonBlank.slice().sort((a, b) => (strength(b) - strength(a)) || (a.i - b.i));
  const deduper = makeImageDeduper();
  const keep = new Set();
  for (const p of order) {
    let dup = null;
    try { dup = await deduper.check(p.abs, p.dhash); } catch { dup = null; }
    if (dup) review.dropped.push({ path: path.basename(p.abs), reason: "duplicate" });
    else keep.add(p.i);
  }

  // 4) Emit the keepers in ORIGINAL order (hero first).
  const keptShots = probed.filter((p) => keep.has(p.i)).map((p) => ({ path: p.abs, ratio: p.ratio }));
  review.kept = keptShots.length;
  const blanks = review.dropped.filter((d) => d.reason === "blank").length;
  const dups = review.dropped.filter((d) => d.reason === "duplicate").length;
  if (review.dropped.length) {
    review.notes.push(`Dropped ${review.dropped.length} of ${review.captured} captured screenshot(s)${blanks ? ` — ${blanks} blank/low-detail` : ""}${dups ? ` — ${dups} near-duplicate` : ""}. Kept the strongest.`);
  }
  return { keptShots, review };
}

module.exports = { filterScreenshots };
