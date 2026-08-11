// ASSET PLACEMENT — which picture goes in which BOX.
//
// ─────────────────────────────────────────────────────────────────────────────────────
// THE QUESTION NOBODY WAS ASKING
//
// Four stages each answered part of it and none answered this one:
//
//   creative_director      "which scene does this asset support?"     -> asset.sceneId
//   visual_layout_director "is any scene left with nothing?"          -> spreadAcrossScenes
//   asset_reuse            "is any SLOT still empty at the end?"      -> clones into the gap
//   the composer           "what do I draw here?"                     -> its own private
//                                                                        capacity table
//
// A scene is not a box. `template_media` resolves the film's real boxes — id, scene, role,
// pixel size, aspect, objectFit and PRIORITY — and until now that structure reached the
// collection budget, the fetch ranker, the reuse optimizer and the pre-render gate, but never
// the decision of which collected asset lands in which of them. Within a scene the order was
// whatever `.sort((a,b) => b.cdScore - a.cdScore)` produced, so a 1600×900 marketing photo
// and a tall phone capture competed for a 2.03:1 hero plate on relevance score alone, and the
// tall one won if the model happened to like it more.
//
// That is the "assets are collected but placed badly" complaint stated precisely: not a
// collection failure and not a rendering failure, but a missing assignment.
//
// ─────────────────────────────────────────────────────────────────────────────────────
// WHAT THIS DOES
//
// A deterministic assignment of the UNIQUE asset pool to the film's boxes, most important box
// first. For each box it scores every unspent candidate on the six things a human would look
// at — does it show the right KIND of thing, is it the right SHAPE, is it big enough, is it
// good enough, is it the asset the director already tied to this beat, and is it the user's
// own material — and seats the winner.
//
// It deliberately does NOT do reuse. `asset_reuse` already owns that (clone-with-variation,
// a 2-appearance ceiling, a 3-scene gap) and it runs immediately after, filling whatever this
// leaves empty. The split is the point: this stage decides where the unique pictures go, that
// stage decides how to cover what is left.
//
// HOW THE DECISION REACHES THE COMPOSER. No composer takes a placement argument — there are
// 125 of them across two shared engines and twenty one-offs, and threading a new parameter
// through all of them is how a change like this dies. Instead the decision is projected onto
// the three fields every composer ALREADY reads:
//
//     asset.sceneId       — which beat draws it            (all of them)
//     asset.__slotWeight  — seat order within that beat    (via admission.displayRank)
//     asset.cropFocus     — where it is anchored           (via crop_engine.focusFor)
//
// so the assignment is honoured everywhere without touching a single composer.
//
// PURE + FAIL-OPEN (THE HOUSE LAW): no I/O, no LLM, no randomness. Any throw returns the
// assets untouched and the film renders exactly as it did before.

const admission = require("./asset_admission");
const { isLogo, tierFor, isOwned } = require("./asset_priority");
const { compareForSlot, meetsFloor } = require("./asset_quality");
const crop = require("./crop_engine");

const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

// ---------------------------------------------------------------- kind matching

// Which internal categories (asset_priority.categorize) satisfy a requirement's purpose.
// A miss is a PENALTY, never a veto: a box with a wrong-kind picture reads far better than a
// box with none, and the alternative — refusing to seat anything — is the empty-plate defect
// this whole file exists to remove.
const PURPOSE_CATEGORIES = {
  screenshot: ["screenshot", "dashboard"],
  productImage: ["product", "marketing", "background", "illustration"],
  person: ["team"],
  place: ["background", "marketing"],
  object: ["product", "background", "illustration"],
  icon: ["icon", "illustration"],
  logo: ["logo"],
  background: ["background", "marketing"],
};

// Sources that ARE the thing a screenshot requirement wants, whatever the classifier said.
const CAPTURE_SOURCES = new Set(["website", "upload"]);

function kindScore(asset, req) {
  const want = String(req.assetType || "productImage");
  const cat = String(asset.category || "");
  const wanted = PURPOSE_CATEGORIES[want] || [];
  if (wanted.includes(cat)) return 1;
  // A real capture satisfies a screenshot box even when the classifier called it something
  // else — provenance is stronger evidence here than a keyword sniff of the alt text.
  if (want === "screenshot" && CAPTURE_SOURCES.has(String(asset.source || "")) && asset.kindHint !== "photo") return 0.95;
  if (want === "person" && /people|person|team|portrait|man|woman|hands?/i.test(String(asset.alt || ""))) return 0.7;
  // Neighbouring purposes: a product photo standing in for a place, an illustration for an
  // object. Related enough that a viewer reads it as intentional.
  if ((want === "productImage" || want === "object" || want === "place" || want === "background")
      && ["product", "marketing", "background", "illustration", "team"].includes(cat)) return 0.6;
  return 0.25;
}

// ---------------------------------------------------------------- shape + size

/**
 * How well does this picture's shape suit the box? Scored on the RATIO OF RATIOS, so a 16:9
 * photo in a 16:9 box is 1 and the penalty grows with the mismatch in either direction.
 *
 * A `contain` box is exempt — nothing is cropped there, so shape costs nothing but letterbox.
 * A `cover` box is where this matters: the further the aspects diverge, the more of the
 * picture is cut away, and past about 2x the subject usually leaves the frame entirely.
 */
function aspectScore(asset, req) {
  if (!req.preferredAspect || req.objectFit === "contain") return 0.8;
  const a = num(asset.ratio, 0) || (num(asset.width) && num(asset.height) ? asset.width / asset.height : 0);
  if (!a) return 0.5;                       // unmeasured: neutral, never punished
  const want = num(req.preferredAspect, 1);
  const r = a > want ? a / want : want / a; // >= 1
  if (r <= 1.15) return 1;
  if (r >= 3) return 0;
  return clamp01(1 - (r - 1.15) / 1.85);
}

/**
 * Is it big enough for the box? Below the requirement's minimum the picture is being upscaled,
 * which is the "blurry hero" defect. Unmeasured assets score neutral rather than being
 * punished for a probe that never ran.
 */
function resolutionScore(asset, req) {
  const w = num(asset.width, 0), h = num(asset.height, 0);
  if (!w || !h) return 0.6;
  const needW = num(req.minWidth, 0), needH = num(req.minHeight, 0);
  if (!needW || !needH) return 0.8;
  const ratio = Math.min(w / needW, h / needH);
  if (ratio >= 1) return 1;
  if (ratio <= 0.4) return 0;
  return clamp01((ratio - 0.4) / 0.6);
}

// ---------------------------------------------------------------- scoring

// Weights. Tier is NOT here — it is applied as a separate multiplier below so it can never be
// out-traded by a stack of small bonuses (the house law: the user's own material wins).
const W = { kind: 30, aspect: 20, resolution: 15, quality: 20, affinity: 15 };

function scoreCandidate(asset, req) {
  const kind = kindScore(asset, req);
  const aspect = aspectScore(asset, req);
  const resolution = resolutionScore(asset, req);
  const quality = clamp01(num(asset.qualityScore, 50) / 100);
  // The Creative Director already tied this asset to a beat, and the planner fetched it FOR
  // that beat. Honour that unless the shape or kind makes it wrong — this is what stops the
  // assignment from shuffling a carefully-chosen picture across the film.
  const affinity = String(asset.sceneId ?? "") === String(req.sceneId) ? 1 : 0;

  const parts = {
    kind: Math.round(kind * W.kind),
    aspect: Math.round(aspect * W.aspect),
    resolution: Math.round(resolution * W.resolution),
    quality: Math.round(quality * W.quality),
    affinity: Math.round(affinity * W.affinity),
  };
  let score = parts.kind + parts.aspect + parts.resolution + parts.quality + parts.affinity;

  // A CRITICAL box must not hold a picture the grader called unusable. `meetsFloor` is the
  // existing rule (asset_quality.MIN_GRADE_FOR); applying it as a heavy penalty rather than a
  // veto keeps the box fillable when the whole pool is weak — an honest last resort beats a
  // blank hero, and the pre-render gate reports it either way.
  if (req.priority === "critical" && !meetsFloor(asset, "critical")) score -= 35;
  if (asset.__duplicateOf) score -= 12;
  if (asset.__layoutDemoted) score -= 10;

  return { score, parts };
}

// ---------------------------------------------------------------- the comparator
//
// THE HOUSE LAW IS "TIER FIRST", AND IT NEEDS ONE QUALIFICATION HERE.
//
// Everywhere else in the pipeline an asset competes against another asset for the same KIND
// of role, so `tier × 1000 + score` is exactly right: the user's own dashboard must beat a
// stock dashboard, always. Here an asset competes for a specific BOX, and boxes want
// different kinds of picture — so applying tier first, unqualified, produces this:
//
//     a `person` box, wanting a photograph of somebody, is handed the user's tall phone
//     screenshot, because tier 80 beats tier 40 before shape or subject is even consulted.
//
// Measured on a realistic wire: kind 8/30, shape 0/20 — a 0.46:1 capture cropped into a
// 1.56:1 box — while a well-shot 16:9 photograph of a freelancer at a desk was pushed onto a
// screenshot box two scenes later. Both boxes ended up wrong, from one comparison.
//
// So COMPATIBILITY is the major key and tier is the second. Read it as: the user's material
// wins every box it genuinely suits, and does not get wasted on the boxes it does not.
// Within a band the law is untouched — a compatible upload still beats compatible stock.
const COMPATIBLE = 0.6;

function compareCandidates(a, va, b, vb, req) {
  const ba = kindScore(a, req) >= COMPATIBLE ? 1 : 0;
  const bb = kindScore(b, req) >= COMPATIBLE ? 1 : 0;
  if (ba !== bb) return bb - ba;                       // compatible first
  const ta = tierFor(a), tb = tierFor(b);
  if (ta !== tb) return tb - ta;                       // then the house law
  if (va.score !== vb.score) return vb.score - va.score;
  return compareForSlot(a, b, req.priority);           // then the shared tie-break
}

// ---------------------------------------------------------------- main

/**
 * @param {object[]} assets        the wire (mutated in place: sceneId / __slotWeight / cropFocus)
 * @param {object[]} requirements  asset_requirements.planRequirements() output
 * @param {object[]} scenes        the storyboard's scenes (for timing when a scene changes)
 * @returns {{ assets, placements, review }}
 */
function placeAssets({ assets, requirements, scenes = [], dims = null } = {}) {
  const list = Array.isArray(assets) ? assets : [];
  const reqs = Array.isArray(requirements) ? requirements : [];
  const empty = { assets: list, placements: [], review: null };
  if (!list.length || !reqs.length) return empty;

  try {
    const sceneById = new Map();
    (Array.isArray(scenes) ? scenes : []).forEach((sc, i) => {
      sceneById.set(sc && sc.id != null ? String(sc.id) : `s${i + 1}`, sc);
    });

    // The logo is never a picture slot — it is the pack's own brand lockup, fed by
    // find(isLogo). Videos are excluded for the same reason every composer excludes them.
    const pool = list.filter((a) => admission.displayOk(a, { allowVector: true }));

    // Boxes in filling order: most important first, ties broken by scene so an early beat
    // wins over a late one of equal weight. THIS ORDER IS THE PRODUCT RULE — "the best asset
    // in the best box" is true because the best box chooses first, not because of a special
    // case anywhere downstream.
    const order = reqs.slice().sort((a, b) =>
      (num(b.weight, 40) - num(a.weight, 40))
      || (num(a.sceneIndex, 99) - num(b.sceneIndex, 99))
      || String(a.id).localeCompare(String(b.id)));

    const spent = new Set();
    const placements = [];
    const perScene = new Map();

    for (const req of order) {
      // A requirement satisfied by owned material only (an un-degraded screenshot/logo box on
      // a job that has captures) still competes here — the captures ARE in the pool, and
      // kindScore is what routes them to it.
      let best = null;
      for (const a of pool) {
        if (spent.has(a)) continue;
        if (isLogo(a) && req.assetType !== "logo") continue;
        if (!isLogo(a) && req.assetType === "logo") continue;
        const v = scoreCandidate(a, req);
        if (!best) { best = { a, v }; continue; }
        if (compareCandidates(a, v, best.a, best.v, req) < 0) best = { a, v };
      }
      if (!best) continue;

      const a = best.a;
      spent.add(a);

      // ---- PROJECT THE DECISION ONTO WHAT COMPOSERS ALREADY READ ----------------------
      const fromScene = a.sceneId != null ? String(a.sceneId) : null;
      const scene = sceneById.get(String(req.sceneId));
      a.sceneId = scene && scene.id != null ? scene.id : req.sceneId;
      // Timing rides with the scene or the picture animates in a window it no longer occupies
      // — the same correction visual_layout_director.spreadAcrossScenes makes when it moves one.
      if (scene) {
        if (scene.start != null) a.startSec = scene.start;
        if (scene.duration != null) a.durationSec = scene.duration;
      }
      // Seat order WITHIN the beat. admission.displayRank reads this, so the asset assigned to
      // the scene's most important box is the one the composer draws first — which is the
      // position every composer treats as its hero.
      a.__slotWeight = num(req.weight, 40);
      a.__placement = {
        placeholderId: req.placeholderId || null,
        requirementId: req.id,
        sceneId: String(req.sceneId),
        priority: req.priority,
        objectFit: req.objectFit,
        aspect: req.preferredAspect || null,
      };
      // Anchor the crop for the box it ACTUALLY landed in. crop_engine analysed several
      // aspects during preparation (asset_prep) and stored them per aspect; until the box was
      // known, the composer could only ask for the nearest to its own guess.
      if (req.preferredAspect && req.objectFit !== "contain") {
        const focus = crop.focusFor(a, req.preferredAspect * 1000, 1000, null);
        if (focus) a.cropFocus = focus;
      }

      const k = String(req.sceneId);
      perScene.set(k, (perScene.get(k) || 0) + 1);
      placements.push({
        requirementId: req.id,
        placeholderId: req.placeholderId || null,
        sceneId: String(req.sceneId),
        priority: req.priority,
        asset: a.path,
        source: a.source || null,
        movedFrom: fromScene && fromScene !== String(req.sceneId) ? fromScene : null,
        score: best.v.score,
        parts: best.v.parts,
        why: `${req.assetType} box, ${req.priority}`
          + ` — kind ${best.v.parts.kind}/${W.kind}, shape ${best.v.parts.aspect}/${W.aspect},`
          + ` size ${best.v.parts.resolution}/${W.resolution}, quality ${best.v.parts.quality}/${W.quality}`
          + (best.v.parts.affinity ? ", already assigned to this beat" : ""),
      });
    }

    const filledIds = new Set(placements.map((p) => p.requirementId));
    const unfilled = reqs.filter((r) => !filledIds.has(r.id));
    const unplaced = pool.filter((a) => !spent.has(a) && !isLogo(a));

    const review = {
      requirements: reqs.length,
      placed: placements.length,
      // What the film still cannot show. asset_reuse runs next and closes what it can under
      // the 2-appearance ceiling; whatever survives BOTH is what the pre-render gate reports.
      unfilled: unfilled.map((r) => ({ id: r.id, sceneId: r.sceneId, priority: r.priority, assetType: r.assetType, required: !!r.required })),
      unfilledCritical: unfilled.filter((r) => r.priority === "critical").length,
      unfilledRequired: unfilled.filter((r) => r.required).length,
      // Assets with nowhere to go. A non-zero number here is not waste: the composers have
      // per-beat capacity beyond the declared contract on some packs, and the reserve is what
      // fills a beat the contract did not know about.
      surplus: unplaced.length,
      moved: placements.filter((p) => p.movedFrom).length,
      scenesCovered: perScene.size,
      placements,
    };
    return { assets: list, placements, review };
  } catch (e) {
    console.warn(`[asset_placement] skipped (${String(e && e.message).slice(0, 160)}) — assets keep their existing scene assignment`);
    return empty;
  }
}

/** A compact, loggable one-liner. */
function describePlacement(review) {
  if (!review) return "no placement";
  return `${review.placed}/${review.requirements} box(es) filled`
    + ` · ${review.scenesCovered} scene(s) covered`
    + (review.moved ? ` · ${review.moved} reassigned` : "")
    + (review.surplus ? ` · ${review.surplus} surplus` : "")
    + (review.unfilledCritical ? ` · ${review.unfilledCritical} CRITICAL box empty` : "")
    + (review.unfilledRequired ? ` · ${review.unfilledRequired} required box empty` : "");
}

module.exports = { placeAssets, describePlacement, scoreCandidate, compareCandidates, aspectScore, resolutionScore, kindScore };
