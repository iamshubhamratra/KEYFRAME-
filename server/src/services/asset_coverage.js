// Asset coverage — the honesty layer for user uploads. Answers "how much of the
// finished film's visual content is the user's OWN material, and where did each
// upload land?" and DISCLOSES it (the brand-review pattern: never a gate, always
// a report). A user who uploads 12 images and sees 8 must be told what didn't fit
// and why — silent drops read as the feature being broken.
//
// Two entry points, one for each kind of composer:
//   coverageFromUsed  — the scene-kit hands back a `usedAssets` list (it knows
//                       exactly which asset filled which slot). Exact, and the
//                       basis for the pre-render repair decision.
//   coverageFromHtml  — every other composer (LLM remix, three, native plates)
//                       just writes an index.html. We scan it for each asset's
//                       path. Disclosure-only — good enough to report, never used
//                       to trigger a repair (those paths render deterministically
//                       or have their own QA loop).
//
// Pure functions, no I/O, fail-open: a malformed input yields a null/empty report,
// never a throw.

const { isLogo } = require("./asset_priority");

// The user's own uploads among the film's assets (logo excluded from the image
// count — it is reported separately as logoUsed).
function uploadImages(assets) {
  return (assets || []).filter((a) => a && a.source === "upload" && !isLogo(a));
}
function uploadLogo(assets) {
  return (assets || []).find((a) => a && a.source === "upload" && isLogo(a)) || null;
}

// Which uploaded images the film actually shows, given the set of used paths.
// `usedPaths` is a Set of jobDir-relative paths. Returns the coverage object.
function buildCoverage({ assets, usedPaths, logoUsed, logoPlacements, repairLap }) {
  const imgs = uploadImages(assets);
  const logo = uploadLogo(assets);
  const perAsset = imgs.map((a) => ({
    id: a.uploadId || null,
    path: a.path,
    assetType: a.assetType || null,
    used: usedPaths.has(a.path),
    via: usedPaths.has(a.path) ? (usedPaths.get ? usedPaths.get(a.path) : "shown") : "unused",
  }));
  const shown = perAsset.filter((p) => p.used).length;
  const total = imgs.length;
  const notes = [];
  const unusedN = total - shown;
  if (unusedN > 0) {
    notes.push(`${unusedN} of your ${total} uploaded image${total > 1 ? "s" : ""} did not fit this film — a shorter film or a template that showcases fewer assets shows less at once.`);
  }
  if (logo && !logoUsed) {
    notes.push("Your logo could not be placed by this template — it appears only on templates with an opening/CTA brand slot.");
  }
  return {
    uploadedAssets: total,
    assetsUsed: shown,
    usagePercentage: total ? Math.round((shown / total) * 100) : (logo && logoUsed ? 100 : 0),
    logoUsed: !!(logo && logoUsed),
    logoPlacements: logo && logoUsed ? (logoPlacements || []) : [],
    screenshotUsage: {
      uploaded: imgs.filter((a) => a.kindHint !== "photo").length,
      shown: perAsset.filter((p) => p.used && imgs.find((a) => a.path === p.path && a.kindHint !== "photo")).length,
    },
    perAsset,
    repairLap: repairLap || null,
    notes,
  };
}

// Scene-kit path — exact, from the kit's own usedAssets manifest.
// usedAssets: [{ path, via, uploadId, source }], logoPlacements: ["opening","cta"].
function coverageFromUsed({ assets, usedAssets, logoPlacements, repairLap }) {
  try {
    const used = new Map();
    for (const u of (usedAssets || [])) { if (u && u.path) used.set(u.path, u.via || "shown"); }
    const logoUsed = (usedAssets || []).some((u) => u && u.via === "logo");
    return buildCoverage({ assets, usedPaths: used, logoUsed, logoPlacements, repairLap });
  } catch { return null; }
}

// Any-composer path — scan the rendered HTML for each upload's path. Disclosure
// only (no `via` detail, no repair).
function coverageFromHtml({ assets, indexHtml }) {
  try {
    const html = String(indexHtml || "");
    const used = new Map();
    for (const a of (assets || [])) {
      if (a && a.source === "upload" && a.path && html.includes(a.path)) used.set(a.path, "shown");
    }
    const logo = uploadLogo(assets);
    const logoUsed = !!(logo && logo.path && html.includes(logo.path));
    // We can't know exact placements from a scan; report the fact, not the spots.
    return buildCoverage({ assets, usedPaths: used, logoUsed, logoPlacements: logoUsed ? ["shown"] : [], repairLap: null });
  } catch { return null; }
}

// Should the scene-kit re-weave once to raise coverage? Only when the user
// actually uploaded material AND the first weave under-used it (or dropped a
// placeable logo). The rebuild is ~free (no re-render); the guard keeps it from
// firing on stock-only or upload-free films.
function shouldRepair({ assets, coverage }) {
  if (!coverage) return false;
  const imgs = uploadImages(assets);
  const logo = uploadLogo(assets);
  if (!imgs.length && !logo) return false;
  if (imgs.length && coverage.usagePercentage < 60) return true;
  if (logo && !coverage.logoUsed) return true;
  return false;
}

module.exports = { coverageFromUsed, coverageFromHtml, shouldRepair, uploadImages, uploadLogo };
