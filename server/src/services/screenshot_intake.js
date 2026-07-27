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

// Rank by detail, breaking near-duplicate ties toward the CRISPER capture: stdev
// (overall busy-ness) PLUS a bounded sharpness term (variance-of-Laplacian, from
// validateImage.meta). When the hero and a scrolled section grab the same fold, the
// IN-FOCUS / settled copy — higher sharpness — is the one kept, and the softer
// mid-scroll copy is the near-duplicate that drops.
//
// Sharpness is used only RELATIVELY (within a same-content dup group), never as an
// absolute blur-reject: measured, a valid MINIMAL screenshot can score LOWER than a
// blurry BUSY one (flat design has few edges; blurred detail still has many soft ones),
// so an absolute floor would false-reject clean minimal captures. Bounded at +50 so it
// only ever breaks ties, never reorders genuinely different-detail shots.
function strength(p) {
  const sd = typeof p.stdev === "number" ? p.stdev : 0;
  const sh = typeof p.sharpness === "number" ? Math.min(p.sharpness, 1000) / 20 : 0; // 0..50
  return sd + sh;
}

// Filter the captured screenshot paths down to the clean, non-duplicate keepers.
// `shots` is the ordered absolute-path list (hero first), i.e. website.screenshotPaths.
// Returns { keptShots:[{ path, ratio }], review } — keptShots preserves the
// ORIGINAL order (hero first) so the downstream scene-pinning order is unchanged.
//
// `deduper` is optional and INJECTABLE: the caller can pass ONE shared makeImageDeduper
// instance so the harvested-asset prune (website_assets.js) cross-dedups against these
// kept screenshots — a harvested hero that also appears in a page screenshot is dropped.
// After this returns, the deduper holds every KEPT screenshot's hashes. Omitted ⇒ a
// fresh local deduper (backward-compatible).
// `shots` accepts either a plain path string (legacy) or the capture record the
// rebuilt ingest now emits: { path, clean, kind, heading, obstructions,
// maxCoveragePct, contentScore }. Normalizing here keeps both callers working while
// letting the gate act on capture-time DOM truth.
function normalizeShot(s) {
  if (typeof s === "string") return { path: s, clean: null, kind: null, heading: "", obstructions: [], maxCoveragePct: null, contentScore: null };
  if (s && typeof s === "object" && s.path) {
    return {
      path: s.path,
      clean: typeof s.clean === "boolean" ? s.clean : null,
      kind: s.kind || null,
      heading: s.heading || "",
      obstructions: Array.isArray(s.obstructions) ? s.obstructions : [],
      maxCoveragePct: Number.isFinite(s.maxCoveragePct) ? s.maxCoveragePct : null,
      contentScore: Number.isFinite(s.contentScore) ? s.contentScore : null,
    };
  }
  return null;
}

async function filterScreenshots({ shots, deduper } = {}) {
  const list = (Array.isArray(shots) ? shots : []).map(normalizeShot).filter(Boolean);
  const review = { captured: list.length, kept: 0, dropped: [], suppressed: [], demoted: [], notes: [] };
  if (!list.length) return { keptShots: [], review };

  // 0) OBSTRUCTED — reject before anything else. `clean:false` is the capture
  //    stage reporting, from live DOM geometry, that it could not clear what was
  //    covering the page (a consent bar, a modal, a chat widget). This is the check
  //    whose absence let three cookie-bannered captures become the "product
  //    screenshots" of a shipped film: the old pipeline had no way to know, because
  //    a path string carries no quality signal, and the only downstream lever
  //    (the CD's demote) still rendered them.
  //
  //    Deliberately a HARD DROP, not a demotion: someone else's UI across the frame
  //    is not something a smaller slot or a dimmer treatment can rescue.
  const usable = [];
  for (const s of list) {
    if (s.clean === false) {
      const what = s.obstructions[0];
      review.dropped.push({
        path: path.basename(s.path),
        reason: "obstructed",
        obstruction: what ? what.kind : "overlay",
        coveragePct: s.maxCoveragePct,
      });
      continue;
    }
    usable.push(s);
  }
  if (!usable.length) {
    review.notes.push(`All ${review.captured} capture(s) were obstructed by page overlays (consent/modal/chat) that could not be dismissed — none were usable as product visuals.`);
    return { keptShots: [], review };
  }

  // 1) Validate each shot (blank/low-info) and gather stdev/dhash/ratio in ONE
  //    ffmpeg/ffprobe pass (validateImage does probe + dHash + dominant color).
  //    Fail-open: a validation error is treated as OK (keep) with zero strength.
  const probed = await Promise.all(usable.map(async (shot, i) => {
    const abs = shot.path;
    let ok = true, meta = null;
    try { const v = await validateImage(abs); ok = v.ok; meta = v.meta; } catch { ok = true; meta = null; }
    return {
      abs, i, ok, shot,
      stdev: meta && meta.stdev != null ? meta.stdev : 0,
      sharpness: meta && meta.sharpness != null ? meta.sharpness : null,
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
  const dd = deduper || makeImageDeduper();
  const keep = new Set();
  for (const p of order) {
    let dup = null;
    try { dup = await dd.check(p.abs, p.dhash); } catch { dup = null; }
    if (dup) review.dropped.push({ path: path.basename(p.abs), reason: "duplicate" });
    else keep.add(p.i);
  }

  // 4) Emit the keepers in ORIGINAL order (hero first), carrying the capture
  //    metadata forward — `kind`/`heading` let the asset planner pin a section to
  //    the scene it actually illustrates instead of round-robining blindly.
  const keptShots = probed.filter((p) => keep.has(p.i)).map((p) => ({
    path: p.abs,
    ratio: p.ratio,
    kind: p.shot.kind,
    heading: p.shot.heading,
    contentScore: p.shot.contentScore,
  }));
  review.kept = keptShots.length;
  const blanks = review.dropped.filter((d) => d.reason === "blank").length;
  const dups = review.dropped.filter((d) => d.reason === "duplicate").length;
  const obst = review.dropped.filter((d) => d.reason === "obstructed").length;
  if (review.dropped.length) {
    review.notes.push(`Dropped ${review.dropped.length} of ${review.captured} captured screenshot(s)${obst ? ` — ${obst} obstructed by an overlay` : ""}${blanks ? ` — ${blanks} blank/low-detail` : ""}${dups ? ` — ${dups} near-duplicate` : ""}. Kept the strongest.`);
  }
  return { keptShots, review };
}

module.exports = { filterScreenshots };
