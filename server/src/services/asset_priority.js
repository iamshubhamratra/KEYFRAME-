// Asset priority — the ONE place that says whose pixels matter more.
//
// The pipeline collects assets from four kinds of places, and they are not equally
// true to the product: the user's own uploads are the product (they chose them),
// website screenshots are the product as captured, the curated library/iconify are
// on-style but generic, and web stock is a guess. Until now that hierarchy existed
// only as scattered special-cases — a `source === "website"` here, a `library:`
// prefix there — and every score-based ranking (creative director's per-scene cap,
// the layout director's budgets) was TIER-BLIND: a lucky stock photo could outrank
// the user's own dashboard for the hero slot.
//
// tierFor/rankKey make the hierarchy explicit and arithmetic: tier first, quality
// second. A stock photo can never outrank an upload — not because a prompt asks
// nicely, but because 40*1000 + 100 < 100*1000 + 0.
//
// Pure functions, no I/O, fail-open (unknown/malformed assets read as stock).
// Shared by graph.js, creative_director.js, visual_layout_director.js and the
// composers, so the trust predicate stops being duplicated-and-drifting.

// Priority tiers (the product spec's numbers, used as a lexicographic MAJOR key):
//   100 upload    — the user's own files. Sovereign; never rejected, never outranked.
//    80 website   — real screenshots captured off the user's own site at ingest.
//    60 curated   — the on-style library + recolored iconify vectors ("brand-matched").
//    40 stock     — pixabay/openverse/pexels and anything else fetched from the web.
function tierFor(a) {
  const src = String((a && a.source) || "").toLowerCase();
  if (src === "upload") return 100;
  if (src === "website") return 80;
  if (src.startsWith("library:") || src === "iconify") return 60;
  return 40;
}

// Owner content: pixels the user can claim as theirs (uploads + their own site).
function isOwned(a) {
  const src = String((a && a.source) || "").toLowerCase();
  return src === "upload" || src === "website";
}

// The prominent-slot admission predicate — the historical 3-way test
// (scene_kit.js prominentOk and its 7 siblings) with uploads added. Kept as ONE
// exported function so the next tier change is one line, not eight.
// NOTE: callers that also honor `__layoutDemoted` / `cdProminence` keep those
// checks local — demotion is a layout decision, not a trust decision.
function isTrustedProminent(a) {
  if (!a) return false;
  const src = String(a.source || "").toLowerCase();
  return src === "upload" || src === "website" || src.startsWith("library:") || a.visionOk === true;
}

// Tier-first composite rank: tier is the major key (×1000 dwarfs any score sum),
// quality/relevance the minor. Use anywhere assets compete for a bounded slot.
// `score` is the caller's existing quality signal (cdScore + clipRelevance*30 in
// both current call sites) — pass 0 when unscored.
function rankKey(a, score) {
  return tierFor(a) * 1000 + (Number.isFinite(score) ? score : 0);
}

// The user's logo is an asset with a ROLE, not a picture of the product: it never
// competes for hero/montage/B-roll slots and gets its own key-moment treatment
// (opening chip + CTA lockup). Every generic pool must skip it.
function isLogo(a) {
  return !!a && String(a.role || "").toLowerCase() === "logo";
}

module.exports = { tierFor, isOwned, isTrustedProminent, rankKey, isLogo };
