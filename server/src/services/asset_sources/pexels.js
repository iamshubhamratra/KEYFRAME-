// Pexels provider ADAPTER — the same relationship pixabay_api.js has to services/pixabay.
//
// All the HTTP behaviour (rate limiting against Pexels' 200/hour ceiling, jittered retry,
// in-flight de-duplication, the response cache, key validation) lives in services/pexels,
// built on the shared services/stock/http client. This file exists only to translate the
// normalized asset into the flat candidate shape asset_sources/index.js consumes, so the
// registry contract `{ name, types, available, search }` is unchanged and index.js needed
// no edit to gain a hardened Pexels.
//
// What it used to be: one bare `fetch` with a 20s AbortSignal and no protection of any
// kind. That was tolerable only while the key was empty and the provider was never called.

const gateway = require("../pexels");

/**
 * @returns {Promise<Array<{url,width,height,title,alt,tags,avgColor,license,sourceUrl,id}>>}
 * Resolves [] on any failure — a soft miss, never a throw. index.js catches throws as well,
 * but returning [] keeps a dead provider from writing a scary line into every film's log.
 */
async function search({ query, type, orientation, limit = 20 }) {
  const { assets, error } = await gateway.search({ query, type, orientation, limit });
  if (error && error !== "no key") console.warn(`[assets] pexels: ${error}`);
  return assets.map((a) => ({
    url: a.url,
    width: a.width,
    height: a.height,
    // Pexels' `alt` is a full descriptive sentence and is by far the strongest relevance
    // signal of the three providers. Carried on both fields because asset_score reads both.
    title: a.title,
    alt: a.alt,
    tags: a.tags,
    // Pre-download colour, so the brand axis can score a candidate before it is fetched.
    avgColor: a.avgColor,
    license: a.license,
    sourceUrl: a.pageUrl,
    // Provider-native id: the within-provider de-duplication key for the merged pool.
    id: a.id,
    provider: "pexels",
  }));
}

module.exports = {
  name: "pexels",
  types: ["image", "video"],
  available: () => gateway.hasKey(),
  search,
  // Exposed for the provider-review disclosure and the live test.
  probeKey: gateway.probeKey,
  quota: gateway.quota,
};
