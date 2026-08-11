// ASSET ADMISSION — the ONE place that decides whether a collected asset may be DRAWN,
// and in what order the admitted ones are seated.
//
// ─────────────────────────────────────────────────────────────────────────────────────
// THE DEFECT THIS FILE EXISTS TO FIX
//
// Twelve composers carried a byte-identical copy of this predicate:
//
//     function shotOk(a) {
//       ...type gates...
//       return isTrustedProminent(a) || a.cdProminence === "hero" || a.cdProminence === "support";
//     }
//
// Read the last line as an ADMISSION test, which is how every one of them used it: an asset
// is drawn only if its SOURCE is trusted (upload / the user's own site capture / the curated
// library / iconify) or the Creative Director explicitly promoted it. Web stock — pixabay,
// openverse, pexels; `tierFor` 40 — is none of those. So a stock photo reaches the screen
// only when the CD says `hero` or `support`, and `system_creative_director.md` tells the
// model, in as many words, **"When in doubt, use `background`."**
//
// `background` was documented as "usable only as a dimmed, scrimmed backdrop behind content",
// which is a scene_kit concept: the kit has a B-roll layer. The other 96 packs do not. There,
// `background` does not mean dimmed — it means NOT RENDERED.
//
// Measured directly, six scenes and five stock photos in (probe across the composer families):
//
//     pack              unreviewed  background  support  hero  curated  screenshot
//     abyss-dive             0           0         5       5      5         5
//     organic-garden         0           0         5       5      5         5
//     grid-dispatch          0           0         5       5      5         5
//     motion-canvas          0           0         5       5      5         5
//     paper-craft            0           0         5       5      5         5
//
// Zero images. A text-only film, from a wire that carried five perfectly good pictures.
//
// It compounds three ways, and each one is a path the pipeline takes on purpose:
//   1. The CD's per-scene prominence cap demotes everything past `cdMaxPerScene` (2) to
//      `background` — creative_director.js:562.
//   2. The Visual Layout Director demotes everything past its presentation BUDGET to
//      `background` + `__layoutDemoted` — visual_layout_director.js:248-254. On film_stage a
//      `__layoutDemoted` asset falls to `shotReserveOk`, which ALSO requires trust, so a
//      demoted stock photo fails both gates and is dropped without a trace.
//   3. An asset the CD never reviewed (chunk failure, budget exhaustion, a top-up or a reuse
//      clone added after the review) keeps no prominence at all — creative_director.js:398
//      returns early on `if (!v)` — and is therefore also invisible.
//
// Every stage upstream of this — the template media contract, the duration budget, the
// aspect-ranked fetch, the pixel quality grade, the content-aware crop, the reuse optimizer's
// slot filling — spends real work on assets that this line then silently discards.
//
// ─────────────────────────────────────────────────────────────────────────────────────
// THE RULE
//
// TRUST IS AN ORDERING SIGNAL, NOT AN ADMISSION TEST.
//
//   displayOk(a)     — may this be drawn at all? Type gates + EXPLICIT rejections only.
//   prominentOk(a)   — may it take the most important box on the scene? The historical
//                      trust test, unchanged, now used for what its name always claimed.
//   displayRank(a)   — seat order. Tier stays the ×1e6 major key (the house law), then
//                      prominence, then measured pixel quality, then the CD's score.
//
// So the strongest asset still wins the hero box, a demoted one still sits behind everything
// better, and an asset nobody vouched for still fills a slot that would otherwise render as
// an empty plate. The only assets excluded are the ones something actually judged unusable.
//
// PURE + FAIL-OPEN (THE HOUSE LAW): no I/O, no config, no randomness. Every predicate
// answers for a malformed asset without throwing.

const { isTrustedProminent, isLogo, tierFor } = require("./asset_priority");

const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };

const VIDEO_RE = /\.(mp4|webm|mov)($|\?)/i;
const VECTOR_RE = /\.svg($|\?)/i;

/** Is this wire entry a moving-image asset? (Type field OR extension — both occur.) */
function isVideoAsset(a) {
  return !!a && (a.type === "video" || VIDEO_RE.test(String(a.path || "")));
}

/** Is this wire entry an SVG? Most dedicated renderers cannot letterbox one into a plate. */
function isVectorAsset(a) {
  return !!a && VECTOR_RE.test(String(a.path || ""));
}

/**
 * WAS THIS ASSET ACTUALLY JUDGED UNUSABLE?
 *
 * The verdicts that mean "do not draw this", each written by a stage that looked at the asset
 * and made a decision — as opposed to a stage that merely failed to vouch for it. Absence of
 * approval is NOT a rejection; that conflation is the whole defect above.
 *
 *   __rejected          the Creative Director rejected it AND deleted the file
 *   __captureUnusable   a screenshot mechanically broken by an overlay/loading state
 *   __missingFile       preflight's self-heal found no file on disk
 *
 * `cdProminence === "reject"` is DELIBERATELY NOT on that list, and the distinction is the
 * whole reason this function exists rather than a one-line check.
 *
 * The Creative Director rejects two classes of asset and treats them differently on purpose
 * (creative_director.js:441-467): web stock is deleted from disk and stamped `__rejected`,
 * while OWNER CONTENT — the user's uploads, their own site captures, their harvested logo —
 * "is never deleted, at worst demoted to background". That asset keeps `cdProminence:"reject"`
 * because the verdict is real, but the file is still there and the tier law says those pixels
 * are the user's and the pipeline does not get to throw them away.
 *
 * Reading the prominence verdict as an admission test would therefore delete, from the film,
 * exactly the material the user supplied — the failure mode this module was written to end,
 * reintroduced against the one tier that can least afford it. A rejected upload is ranked last
 * (displayRank scores `reject` at 0 and the layout demotion below it) and is drawn only if a
 * box would otherwise be empty.
 */
function isRejected(a) {
  if (!a) return true;
  return a.__rejected === true
    || a.__captureUnusable === true
    || a.__missingFile === true;
}

/**
 * MAY THIS ASSET BE DRAWN AT ALL?
 *
 * @param {object} a                  the wire asset
 * @param {object} [opts]
 * @param {boolean} [opts.allowLogo]    logos are key-moment material with their own
 *                                      treatment (opening chip / CTA lockup); a generic
 *                                      picture pool must skip them. Set true for the
 *                                      lockup itself.
 * @param {boolean} [opts.allowVideo]   most native composers are stills-only.
 * @param {boolean} [opts.allowVector]  most native composers cannot draw an arbitrary SVG
 *                                      stretched into a plate; the scene-kit can.
 */
function displayOk(a, opts = {}) {
  if (!a || !a.path) return false;
  if (!opts.allowLogo && isLogo(a)) return false;
  if (!opts.allowVideo && isVideoAsset(a)) return false;
  if (!opts.allowVector && isVectorAsset(a)) return false;
  return !isRejected(a);
}

/**
 * MAY THIS ASSET TAKE THE SCENE'S MOST IMPORTANT BOX?
 *
 * The historical predicate, byte-for-byte — trusted source, or the Creative Director
 * promoted it. It is no longer allowed to decide whether the asset appears; only whether
 * it appears FIRST. A demoted asset is never prominent even if its source is trusted:
 * the demotion is exactly the statement "something better should take the good slot".
 */
function prominentOk(a) {
  if (!displayOk(a)) return false;
  if (a.__layoutDemoted === true) return false;
  // An explicit `reject` verdict bars the good slots even for owner content, whose FILE is
  // never deleted (see isRejected). The tier law protects the user's pixels from deletion; it
  // does not oblige the film to open on a picture the director called unusable.
  if (String(a.cdProminence || "") === "reject") return false;
  return isTrustedProminent(a) || a.cdProminence === "hero" || a.cdProminence === "support";
}

// Seat-order weights. Tier is the ×1e6 major key so the house law is untouched: a stock
// photo can never be seated ahead of the user's own upload, however sharp it is. Prominence
// is the ×1e3 middle key — it is the signal that used to be an admission test and is now a
// preference. Everything below that is measured evidence.
// `reject` sits BELOW `background`: an asset the director called unusable is seated only when
// the alternative is an empty box. It is still ahead of nothing, which is the point.
const PROMINENCE_WEIGHT = { hero: 3, support: 2, background: 0, reject: -2 };

/**
 * SEAT ORDER — higher is seated earlier, so the best asset lands in the box a viewer looks
 * at first. Deliberately a single number rather than a comparator so a composer can drop it
 * into an existing `.sort(byScore)` with no other change.
 *
 * `asset_quality.compareForSlot` remains the authority when a real PLACEHOLDER with a
 * declared priority is in play (it softens tier on a critical slot so a `reject`-graded
 * asset cannot hold the hero box). This is the pool-ordering rule for composers that seat
 * from a flat list, which is most of them.
 */
function displayRank(a) {
  if (!a) return -Infinity;
  const prominence = PROMINENCE_WEIGHT[String(a.cdProminence || "")] ?? (isTrustedProminent(a) ? 1 : 0);
  const demoted = a.__layoutDemoted === true ? -1 : 0;
  // A near-duplicate is real material, but it should fill a minor box rather than compete
  // for a hero with the copy it duplicates. asset_prep marks the weaker of the pair.
  const duplicate = a.__duplicateOf ? -1 : 0;
  return tierFor(a) * 1e6
    + (prominence + demoted + duplicate) * 1e3
    // WHICH BOX THE PLACEMENT AGENT GAVE IT (services/asset_placement). Composers seat a
    // scene's pictures in the order they arrive in the sorted pool, so this is how "the best
    // asset in the best box" survives the trip into a composer that knows nothing about
    // boxes. Sits below prominence and above pixel quality: it is a decision made WITH the
    // quality grade in hand, so it should not be re-litigated by the grade alone.
    // 15..100 x 8 = 120..800, the same order of magnitude as the quality term it precedes.
    + num(a.__slotWeight, 0) * 8
    + num(a.qualityScore, 50) * 10
    + num(a.cdScore, 0)
    + (typeof a.clipRelevance === "number" ? a.clipRelevance * 30 : 0);
}

/** `Array.prototype.sort` comparator for `displayRank`, best first. */
function byDisplayRank(x, y) {
  const d = displayRank(y) - displayRank(x);
  if (d) return d;
  return String((x && x.path) || "").localeCompare(String((y && y.path) || ""));
}

/**
 * THE ADMITTED POOL, ORDERED — the one call a composer needs.
 *
 * Returns `{ primary, reserve, all }`:
 *   primary — everything not demoted, best first. Seat these.
 *   reserve — the demoted ones, best first. Seat these only once every box that could hold
 *             a better picture already has one. A demotion is a preference, and honouring it
 *             as a deletion is what emptied the films.
 *   all     — primary followed by reserve, which is what a flat-pool composer wants.
 */
function admit(assets, opts = {}) {
  const list = (Array.isArray(assets) ? assets : []).filter((a) => displayOk(a, opts));
  const primary = list.filter((a) => a.__layoutDemoted !== true).sort(byDisplayRank);
  const reserve = list.filter((a) => a.__layoutDemoted === true).sort(byDisplayRank);
  return { primary, reserve, all: [...primary, ...reserve] };
}

module.exports = {
  displayOk, prominentOk, displayRank, byDisplayRank, admit,
  isRejected, isVideoAsset, isVectorAsset,
};
