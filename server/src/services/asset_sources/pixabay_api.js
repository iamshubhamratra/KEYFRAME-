// Pixabay provider — now a thin ADAPTER over services/pixabay.
//
// This file used to own its own fetch, its own URL building and its own 20s timeout, which
// made it the third independent Pixabay integration in the codebase (alongside
// pixabay_scrape and pixabay_bridge). None of the three shared a rate limiter, a retry
// policy, a cache or an error format — so a burst of scene queries could throttle the whole
// batch, and an invalid key surfaced as a bare "pixabay HTTP 400" that nothing acted on.
// (That exact condition silently starved this pipeline: `available()` returned true, every
// search threw 400, and films shipped with one image.)
//
// The orchestrator's provider contract is UNCHANGED — { name, types, available, search },
// returning { url, width, height, tags, license, sourceUrl } — so asset_sources/index.js
// needs no edit and every existing caller behaves identically. What changed is everything
// behind it: requests are rate-limited, de-duplicated, retried with backoff, cached for 6h,
// validated against a quality floor and ranked before they reach the orchestrator.

const pixabay = require("../pixabay");
const { minImageWidth } = require("../pixabay/config");

/**
 * @param {{query:string, type:"image"|"video", orientation?:string, limit?:number}} args
 * @returns {Promise<Array<{url:string, width:number|null, height:number|null, tags:string,
 *                          license:string, sourceUrl:string|null}>>}
 */
async function search({ query, type, orientation, limit = 5 }) {
  const opts = {
    keywords: [query],
    orientation: orientation === "vertical" || orientation === "horizontal" ? orientation : "all",
    limit,
    perPage: Math.max(20, limit * 2),   // rank a real pool, then return the best `limit`
    minWidth: minImageWidth(),
  };
  const res = type === "video" ? await pixabay.searchVideos(opts) : await pixabay.searchImages(opts);

  // A hard failure is already logged by the service with its reason; the provider contract
  // expects [] so the orchestrator falls to the next provider rather than aborting the film.
  return res.assets.map((a) => ({
    url: a.url,
    width: a.width,
    height: a.height,
    tags: a.tags.join(", "),          // orchestrator's relevance ranking reads this string
    license: a.license,
    sourceUrl: a.pageUrl,
  }));
}

module.exports = {
  name: "pixabay",
  types: ["image", "video"],
  // `hasKey()` proves a key is PRESENT. services/pixabay.probeKey() proves it WORKS — use
  // that in diagnostics, never here: `available()` is called per request and must stay
  // synchronous and free.
  available: () => pixabay.hasKey(),
  search,
};
