// Website Asset Intelligence — the Asset Usage Report + Validation Gate (M5).
//
// Built at the POST-COMPOSITION choke point (after the final assets[] is known — the
// same locus as persistBrandCoverage/persistAssetCoverage) so it can reconcile what the
// harvester COLLECTED at intake (job.website_assets) against what actually SURVIVED to
// the composed film (the wire assets, carrying the CD's cdProminence/visionOk/
// __layoutDemoted). It also surfaces the CD RELEVANCE-DEMOTIONS the M3 review flagged as
// disclosed-nowhere: a harvested brand image the CD quietly pushed to background.
//
// The Validation Gate is a NON-BLOCKING, pure disclosure: it NEVER throws and NEVER
// gates — a fully-unbranded job legitimately reports all-false and renders normally. No
// downstream branch may read report.validation to alter flow (that would make it a
// blocking gate and violate the fail-open house rule).

const { WEBSITE_BRAND_SOURCE, WEBSITE_ASSET_SOURCE, isTrustedProminent } = require("./asset_priority");

const HARVEST_SOURCES = new Set([WEBSITE_BRAND_SOURCE, WEBSITE_ASSET_SOURCE]);
const isHarvested = (a) => !!a && HARVEST_SOURCES.has(String(a.source || ""));

// Did this harvested asset actually appear in the film (any slot, prominent or scrim)?
// Pinned harvested assets are never deleted, so being on the wire = it appeared; a
// __layoutDemoted / background one appeared only as dim B-roll.
function slotOf(a) {
  if (a.role === "logo") return "logo";            // key-moment (opening chip + CTA lockup)
  if (a.__layoutDemoted) return "background";
  if (a.visionOk === true || a.cdProminence === "hero" || a.cdProminence === "support" || isTrustedProminent(a)) return "prominent";
  return "background";
}

// One usage report. `assets` is the FINAL wire (post-CD/VLD); job.website_assets is the
// COLLECTED manifest (intake). Reconciles the two by path.
function buildAssetUsageReport({ job, assets, harvestReport, brandReview } = {}) {
  // filter(Boolean): a malformed/null manifest entry must not throw the whole build
  // (validateAssetIntelligence guards the same way — keep them consistent).
  const collected = (Array.isArray(job && job.website_assets) ? job.website_assets : []).filter(Boolean);
  const wire = (Array.isArray(assets) ? assets : []).filter(isHarvested);
  const wireByPath = new Map();
  for (const a of wire) if (a && a.path) wireByPath.set(a.path, a);

  const rowFor = (r) => {
    const w = wireByPath.get(r.path);
    const slot = w ? slotOf(w) : null;             // null = collected but not pinned to the film
    return {
      path: r.path, source: r.source, assetType: r.assetType || null,
      qualityScore: typeof r.qualityScore === "number" ? r.qualityScore : null,
      usedInScenes: w && w.sceneId != null ? [String(w.sceneId)] : [],
      slot,                                         // "logo" | "prominent" | "background" | null
      // A role:"logo" is a key-moment asset, never a relevance/background demotion — the
      // logo exclusion must apply to BOTH the __layoutDemoted and the visionOk terms, or a
      // layout-overflow-demoted logo would appear as approved AND demoted (contradictory).
      demoted: !!(w && w.role !== "logo" && (w.__layoutDemoted || w.visionOk === false)),
      colorsExtracted: Array.isArray(r.brandColors) ? r.brandColors : undefined,
    };
  };

  const byType = (pred) => collected.filter(pred).map(rowFor);

  const logos = byType((r) => r.assetType === "logo");
  const screenshots = byType((r) => r.assetType === "screenshot");
  const icons = byType((r) => r.assetType === "icon");
  const videos = byType((r) => r.assetType === "video");
  // illustrations is the CATCH-ALL for every non-logo/screenshot/icon/video harvested
  // asset (hero/product/marketing/team/illustration/decorative AND any unknown/missing
  // assetType), so assetsCollected always reconciles against the sum of the buckets — no
  // record silently drops out of every list.
  const illustrations = byType((r) => !["logo", "screenshot", "icon", "video"].includes(r.assetType));

  // Reconciliation: collected at intake vs approved (reached the film, not demoted).
  const assetsCollected = collected.length || (harvestReport && harvestReport.kept) || 0;
  const approved = wire.filter((a) => slotOf(a) !== "background" || a.role === "logo");
  const demoted = collected.map(rowFor).filter((r) => r.demoted);

  const notes = [];
  if (harvestReport && Array.isArray(harvestReport.notes)) notes.push(...harvestReport.notes);
  if (demoted.length) notes.push(`${demoted.length} harvested brand asset(s) demoted to background by the creative review (off-story / QA).`);
  if (assetsCollected && !wire.length) notes.push("Harvested assets were collected but none were pinned into the film (uploads/screenshots filled the showcase scenes).");

  return {
    assetsCollected,
    assetsApproved: approved.length,
    logos, screenshots, icons, illustrations, videos,
    brandColorsExtracted: (harvestReport && harvestReport.brandColorsExtracted) || (brandReview && brandReview.accents) || [],
    fontsExtracted: (harvestReport && harvestReport.fontsExtracted) || [],
    demotedForRelevance: demoted,
    validation: validateAssetIntelligence({ job, assets, harvestReport, brandReview }),
    notes,
  };
}

// The 7-check Validation Gate — pure disclosure, {ok, detail} each. Never throws, never
// gates. A fully-unbranded prompt-only job legitimately reports seven `false` checks.
function validateAssetIntelligence({ job, assets, harvestReport, brandReview } = {}) {
  const collected = Array.isArray(job && job.website_assets) ? job.website_assets : [];
  const wire = (Array.isArray(assets) ? assets : []).filter(isHarvested);
  const intent = (job && job.intent) || {};
  const check = (ok, detail) => ({ ok: !!ok, detail });

  const uploadLogo = Array.isArray(job && job.user_assets) && job.user_assets.some((u) => u && u.role === "logo");
  const harvestedLogo = collected.some((r) => r && r.assetType === "logo");
  const brandColors = (intent.logo && intent.logo.brandColors && intent.logo.brandColors.length)
    || (intent.website && intent.website.brandColors && intent.website.brandColors.length)
    || (brandReview && brandReview.applied);

  return {
    logoFound: check(uploadLogo || harvestedLogo, uploadLogo ? "user upload" : harvestedLogo ? "harvested from site" : "none"),
    brandColorsFound: check(brandColors, brandColors ? "resolved" : "unbranded / prompt-only"),
    screenshotsFound: check((job && job.website_screenshots || []).length > 0, `${(job && job.website_screenshots || []).length} captured`),
    assetsApproved: check(wire.some((a) => slotOf(a) !== "background" || a.role === "logo"), "≥1 harvested asset reached a prominent/logo slot"),
    assetsTagged: check(collected.length === 0 || collected.every((r) => r && r.assetType && r.kindHint), "every harvested asset classified (type + kindHint)"),
    assetsRanked: check(collected.length === 0 || collected.every((r) => r && r.source && typeof r.qualityScore === "number"), "every harvested asset tiered + quality-scored"),
    availableToTemplate: check(wire.length > 0, `${wire.length} harvested asset(s) reached the composition`),
  };
}

module.exports = { buildAssetUsageReport, validateAssetIntelligence };
