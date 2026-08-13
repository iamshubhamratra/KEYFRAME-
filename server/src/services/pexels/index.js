// The Pexels gateway — the one place that speaks HTTP to Pexels.
//
// SHAPED AFTER services/pixabay, DELIBERATELY. asset_sources/pexels.js is now a thin adapter
// over this, exactly as asset_sources/pixabay_api.js adapts services/pixabay. What was there
// before was a single bare `fetch` with a 20s timeout: no rate limiter, no retry, no cache, no
// key validation. That was survivable only because the key was empty and the provider was
// therefore never actually called.
//
// IT DOES NOT RANK, AND THAT IS THE POINT. services/pixabay carries its own 0-100 ranker,
// whose output the adapter then throws away so that util.rankCandidates can re-derive a score
// with an unrelated formula — every Pixabay result is scored twice on two incomparable scales.
// Repeating that here would be worse, because Pexels and Pixabay candidates now land in the
// SAME merged pool: two internal rankers would mean the pool is sorted on numbers that do not
// mean the same thing. There is exactly one ranking authority, services/asset_score, and it
// sees every candidate from every provider. This gateway normalizes and validates; it does
// not have opinions about which picture is better.

const appConfig = require("../../config");
const { createClient } = require("../stock/http");

const ENDPOINTS = Object.freeze({
  image: "https://api.pexels.com/v1/search",
  video: "https://api.pexels.com/videos/search",
});

/** @returns {string} the resolved key, or "" when none is usable. */
function apiKey() {
  const k = appConfig.assetProviders?.pexels?.apiKey || "";
  // src/config.js already scrubs placeholders centrally; this mirrors pixabay/config.js so
  // the gateway is correct even if it is ever constructed from a raw config object.
  return /^YOUR_|^\s*$/i.test(String(k)) ? "" : String(k).trim();
}

const cfg = () => appConfig.pexels || {};

const client = createClient({
  name: "pexels",
  apiKey,
  // Pexels authenticates with the bare key in Authorization (no scheme prefix).
  authHeaders: () => ({ Authorization: apiKey() }),
  // Documented ceiling is 200 requests/hour (and 20k/month). Stay under it rather than at
  // it, and measure in the same units the provider does — a per-minute limiter would let a
  // burst spend the whole hourly allowance in three minutes and call itself compliant.
  rateLimit: () => ({
    max: Number(cfg().rateLimitMax) || 150,
    windowMs: Number(cfg().rateLimitWindowMs) || 3_600_000,
  }),
  retry: () => ({ attempts: Number(cfg().retryAttempts) || 3, baseDelayMs: 500, maxDelayMs: 4000 }),
  timeoutMs: () => Number(cfg().timeoutMs) || 20_000,
  cache: () => ({ ttlMs: Number(cfg().cacheTtlMs) || 6 * 60 * 60 * 1000, max: Number(cfg().cacheMax) || 500 }),
});

const PER_PAGE_MAX = 80; // Pexels' documented ceiling

const orientationParam = (o) =>
  o === "vertical" ? "portrait" : o === "horizontal" ? "landscape" : o === "square" ? "square" : "";

/**
 * One normalized still. Mirrors services/pixabay/types.js — fields that do not apply are
 * null, never absent, so a consumer reading `.width` never learns which provider served it.
 */
function mapPhoto(p) {
  if (!p || !p.src) return null;
  // large2x is ~1880px on the long edge and is the best quality/latency trade for a 1080p
  // film; `original` can be 6000px+ and costs seconds to download for no visible gain.
  const url = p.src.large2x || p.src.large || p.src.original;
  if (!url) return null;
  return {
    id: String(p.id),
    provider: "pexels",
    type: "image",
    // Pexels writes a real descriptive sentence into `alt` ("Abstract visualization of data
    // analytics with graphs and charts showing dynamic growth"). It is the single most
    // useful relevance signal any of the three providers returns, so it is carried as BOTH
    // title and alt — asset_score reads both and de-duplicates the tokens itself.
    title: p.alt || "",
    alt: p.alt || "",
    url,
    thumbnail: p.src.medium || p.src.small || null,
    width: Number(p.width) || null,
    height: Number(p.height) || null,
    duration: null,
    tags: [],
    // The average colour Pexels already computed. Feeds asset_score's brand axis BEFORE
    // anything is downloaded, which is the only point at which it can affect ranking.
    avgColor: p.avg_color || null,
    pageUrl: p.url || null,
    license: "Pexels License",
    photographer: p.photographer || null,
    raw: p,
  };
}

function mapVideo(v) {
  if (!v) return null;
  const files = (v.video_files || [])
    .filter((f) => f && f.file_type === "video/mp4" && f.width && f.link)
    // Closest to 1280px wide: large enough for a 1080p frame, small enough to fetch quickly.
    .sort((a, b) => Math.abs((a.width || 0) - 1280) - Math.abs((b.width || 0) - 1280));
  const pick = files[0];
  if (!pick) return null;
  return {
    id: String(v.id),
    provider: "pexels",
    type: "video",
    title: "",
    alt: "",
    url: pick.link,
    thumbnail: v.image || null,
    width: Number(pick.width) || null,
    height: Number(pick.height) || null,
    duration: Number(v.duration) || null,
    tags: [],
    avgColor: null,
    pageUrl: v.url || null,
    license: "Pexels License",
    photographer: (v.user && v.user.name) || null,
    raw: v,
  };
}

/**
 * FAIL-SOFT, like services/pixabay: resolves `{assets, error}` and never throws. A provider
 * outage must cost this provider's candidates, not the film — asset_sources/index.js catches
 * throws too, but a gateway that reports its own failure lets the caller log something useful.
 */
async function search({ query, type = "image", orientation, limit = 20 }) {
  if (!apiKey()) return { assets: [], error: "no key" };
  const endpoint = type === "video" ? ENDPOINTS.video : ENDPOINTS.image;
  const params = {
    query,
    per_page: Math.max(1, Math.min(PER_PAGE_MAX, Number(limit) || 20)),
    orientation: orientationParam(orientation) || undefined,
  };
  try {
    const body = await client.getJson(endpoint, params);
    const rows = type === "video" ? (body.videos || []) : (body.photos || []);
    const assets = rows.map(type === "video" ? mapVideo : mapPhoto).filter(Boolean);
    return { assets, error: null, total: body.total_results ?? null };
  } catch (e) {
    return { assets: [], error: e.message || String(e) };
  }
}

/** Is the configured key actually usable? A verdict for diagnostics, not control flow. */
function probeKey() {
  return client.probe(ENDPOINTS.image, { query: "test", per_page: 1 });
}

module.exports = {
  search, probeKey, mapPhoto, mapVideo, apiKey,
  hasKey: () => !!apiKey(),
  quota: client.quota,
  windowUsage: client.windowUsage,
  clearCache: client.clearCache,
  ENDPOINTS,
};
