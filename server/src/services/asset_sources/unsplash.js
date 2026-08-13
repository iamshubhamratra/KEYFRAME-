// Unsplash provider adapter — same shape as pexels.js and pixabay_api.js.
//
// STILLS ONLY. `types: ["image"]` is load-bearing, not documentation: hasProviderFor("video")
// gates the video->still downgrade in the asset planner (graph.js), so a provider that claims
// a type it cannot serve makes the planner plan video needs that nothing can ever fill.
//
// `notifyDownload` is the one addition to the provider contract this file introduces. Unsplash's
// API Guidelines require a ping to the photo's `download_location` when the image is actually
// used; the retrieval ladder calls it after a successful download. Every other provider simply
// does not define it, and the caller treats it as optional.

const gateway = require("../unsplash");

async function search({ query, type, orientation, limit = 20 }) {
  const { assets, error, skipped } = await gateway.search({ query, type, orientation, limit });
  // An exhausted hourly allowance is an expected operating condition on a demo key, not a
  // fault — say so once, quietly, rather than logging it as a failure on every want.
  if (skipped) console.log(`[assets] unsplash skipped: ${skipped}`);
  else if (error && error !== "no key") console.warn(`[assets] unsplash: ${error}`);
  return assets.map((a) => ({
    url: a.url,
    width: a.width,
    height: a.height,
    title: a.title,
    alt: a.alt,
    tags: a.tags,
    avgColor: a.avgColor,
    license: a.license,
    sourceUrl: a.pageUrl,
    id: a.id,
    provider: "unsplash",
    // Carried through so the ladder can honour the download-tracking obligation.
    downloadLocation: a.downloadLocation,
  }));
}

module.exports = {
  name: "unsplash",
  types: ["image"],
  // Two gates, not one: a key must exist AND there must be budget worth spending. Returning
  // false when the hourly allowance is nearly gone keeps the provider out of the walk
  // entirely rather than having it answer every want with an empty array.
  available: () => gateway.hasKey() && gateway.hasBudget(),
  search,
  notifyDownload: gateway.notifyDownload,
  probeKey: gateway.probeKey,
  quota: gateway.quota,
};
