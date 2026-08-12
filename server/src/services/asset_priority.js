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

// Canonical source constants for harvested website brand assets. These are the ONE
// place the strings live — every producer (website_assets.js) and every consumer
// (tierFor/isOwned/isTrustedProminent + the CD/VLD/scene_kit gates the M2/M3 phases
// widen) references these symbols, never a literal, so the tier law can never
// silently no-op on a mismatched string (the exact drift this file exists to prevent).
//   website-brand — the site's OWN logo(s): owner content, trusted-prominent, tier 90.
//   website-asset — other harvested imagery: neutral, tier 70, prominent only via the
//                   Creative Director's visionOk (so a decorative asset can't out-slot
//                   a real product shot). Wired to pin/scene competition in M2/M3.
const WEBSITE_BRAND_SOURCE = "website-brand";
const WEBSITE_ASSET_SOURCE = "website-asset";

// Priority tiers (the product spec's numbers, used as a lexicographic MAJOR key):
//   100 upload         — the user's own files. Sovereign; never rejected, never outranked.
//    90 website-brand  — the site's own harvested LOGO(s). Owner content, above screenshots.
//    80 website        — real screenshots captured off the user's own site at ingest.
//    70 website-asset  — other harvested imagery. Prominent only once the CD approves it.
//    60 curated        — the on-style library + recolored iconify vectors ("brand-matched").
//    40 stock          — pixabay/openverse/pexels and anything else fetched from the web.
function tierFor(a) {
  const src = String((a && a.source) || "").toLowerCase();
  if (src === "upload") return 100;
  if (src === WEBSITE_BRAND_SOURCE) return 90;
  if (src === "website") return 80;
  if (src === WEBSITE_ASSET_SOURCE) return 70;
  if (src.startsWith("library:") || src === "iconify") return 60;
  return 40;
}

// Owner content: pixels the user can claim as theirs (uploads + their own site +
// their own harvested logo). Harvested non-logo imagery (website-asset) is NOT
// owner-sovereign — it may be third-party embedded, so it stays CD-deletable.
function isOwned(a) {
  const src = String((a && a.source) || "").toLowerCase();
  return src === "upload" || src === "website" || src === WEBSITE_BRAND_SOURCE;
}

// The prominent-slot admission predicate — the historical 3-way test
// (scene_kit.js prominentOk and its 7 siblings) with uploads added. Kept as ONE
// exported function so the next tier change is one line, not eight.
// NOTE: callers that also honor `__layoutDemoted` / `cdProminence` keep those
// checks local — demotion is a layout decision, not a trust decision.
function isTrustedProminent(a) {
  if (!a) return false;
  const src = String(a.source || "").toLowerCase();
  // website-brand (the harvested logo) is trusted; plain website-asset imagery is
  // NOT auto-prominent — it reaches a prominent slot only via a.visionOk (the CD
  // actually approved it), so a decorative harvested asset can't out-slot a real shot.
  //
  // "iconify" is listed explicitly alongside library:*. tierFor() has always ranked
  // the two together at tier 60 ("the on-style library + recolored iconify vectors"),
  // but this predicate only matched the `library:` PREFIX — so a recolored Iconify
  // vector was tier-60 for ranking and untrusted for admission at the same time.
  // That inconsistency made every Iconify asset unplaceable on every pipeline.
  return src === "upload" || src === "website" || src === WEBSITE_BRAND_SOURCE
    || src.startsWith("library:") || src === "iconify" || a.visionOk === true;
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

// The Asset Intelligence taxonomy — the ONE canonical set of labels the whole pipeline
// speaks, reconciling the three upstream classifiers that each emit their own vocabulary
// (website_assets.classify `assetType`, the Creative Director's `sectionType`/prominence,
// user_assets `assetType`). Order is roughly most→least specific.
const CATEGORIES = ["logo", "screenshot", "dashboard", "product", "team", "illustration", "marketing", "icon", "decorative", "background"];
const DATA_RE = /dashboard|analytics|chart|metric|graph|\bstats?\b|kpi|report/;
const TEAM_RE = /\bteam\b|people|person|colleague|customer|user|staff|portrait|worker|founder|employee/;
const PRODUCT_RE = /product|device|packaging|bottle|\bbox\b|gadget|hardware|mockup/;
const MARKETING_RE = /banner|promo|campaign|marketing|\boffer\b|\bsale\b|advert/;
// assetType (from the classifiers) → canonical category. Values not here fall to sniffing.
const ASSET_TYPE_MAP = {
  logo: "logo", team: "team", marketing: "marketing", illustration: "illustration",
  icon: "icon", decorative: "decorative", product: "product", "product-photo": "product",
  "mobile-app": "screenshot", "ui-design": "screenshot", dashboard: "dashboard",
  screenshot: "screenshot", hero: "background", image: "background",
};

// Deterministic single-label categorization of any asset. Precedence: explicit logo role
// → a classifier's assetType → source/kind (real capture, iconify/vector) → content sniff
// on alt/sectionType. Fail-open to "background" (a neutral, always-placeable label). Pure.
function categorize(a) {
  if (!a) return "background";
  const at = String(a.assetType || "").toLowerCase();
  if (isLogo(a) || at === "logo") return "logo";
  const kind = String(a.kindHint || "").toLowerCase();
  const src = String(a.source || "").toLowerCase();
  const hay = `${at} ${kind} ${String(a.alt || "").toLowerCase()} ${String(a.sectionType || "").toLowerCase()}`;
  if (ASSET_TYPE_MAP[at]) {
    // Refine a generic screenshot to a dashboard when the content reads as a data view.
    if (ASSET_TYPE_MAP[at] === "screenshot" && DATA_RE.test(hay)) return "dashboard";
    return ASSET_TYPE_MAP[at];
  }
  if (kind === "vector" || src === "iconify" || (src.startsWith("library:") && /icon/.test(hay))) return "icon";
  if (src === "website" || kind === "screenshot") return DATA_RE.test(hay) ? "dashboard" : "screenshot";
  if (DATA_RE.test(hay)) return "dashboard";
  if (TEAM_RE.test(hay)) return "team";
  if (PRODUCT_RE.test(hay)) return "product";
  if (MARKETING_RE.test(hay)) return "marketing";
  if (/illustration|vector|isometric|flat art|drawing/.test(hay)) return "illustration";
  return "background";
}

// 0..1 confidence in an asset's fit. Prefers the Creative Director's real vision signal
// (cdScore, 0..100) blended with CLIP relevance when present; else a source-tier prior
// (owned material is trusted, stock is a guess). A CD-rejected/demoted asset is capped;
// owned material is floored. Pure, fail-open to a neutral prior.
const TIER_CONFIDENCE = { 100: 0.9, 90: 0.85, 80: 0.8, 70: 0.55, 60: 0.6, 40: 0.4 };
function assetConfidence(a) {
  if (!a) return 0;
  const cd = Number.isFinite(a.cdScore) ? Math.max(0, Math.min(1, a.cdScore / 100)) : null;
  const clip = Number.isFinite(a.clipRelevance) ? Math.max(0, Math.min(1, a.clipRelevance)) : null;
  const parts = [cd, clip].filter((x) => x != null);
  let c;
  if (parts.length) {
    const base = parts.reduce((s, x) => s + x, 0) / parts.length;
    const floor = isOwned(a) ? 0.6 : (a.visionOk === true ? 0.55 : 0);
    const cap = (a.visionOk === false || a.__layoutDemoted) ? 0.5 : 1;
    c = Math.max(floor, Math.min(cap, base));
  } else {
    c = TIER_CONFIDENCE[tierFor(a)] || 0.4;
  }
  return Math.round(c * 100) / 100;
}

module.exports = { tierFor, isOwned, isTrustedProminent, rankKey, isLogo, categorize, assetConfidence, CATEGORIES, WEBSITE_BRAND_SOURCE, WEBSITE_ASSET_SOURCE };
