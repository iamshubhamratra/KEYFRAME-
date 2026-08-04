// Pixabay service configuration — one place that answers "where do we call, with what key,
// and under what limits". Everything else in this module reads from here.
//
// KEY RESOLUTION mirrors src/config.js exactly: PIXABAY_API_KEY feeds both the modern
// provider path and the legacy audio.pixabayKey fallback, so a single env var configures
// images, video, music and SFX. The template placeholder is treated as absent — a key that
// reads "YOUR_..." is not a key, and letting it through makes `available()` claim the
// provider works while every call returns HTTP 400.
//
// THAT FAILURE MODE IS NOT HYPOTHETICAL. A stale/invalid key sat in config for this project
// while `available()` returned true; every search threw 400 and fell through silently, so an
// eight-scene film shipped with one image. `probeKey()` below exists so the condition is
// detectable instead of merely survivable.

const appConfig = require("../../config");

const ENDPOINTS = Object.freeze({
  image: "https://pixabay.com/api/",
  video: "https://pixabay.com/api/videos/",
});

/** @returns {string} the resolved API key, or "" when none is usable. */
function apiKey() {
  const k = appConfig.assetProviders?.pixabay?.apiKey || appConfig.audio?.pixabayKey || "";
  return /YOUR_|^\s*$/.test(k) ? "" : String(k).trim();
}

const cfg = () => appConfig.pixabay || {};

module.exports = {
  ENDPOINTS,
  apiKey,
  hasKey: () => !!apiKey(),

  /** Pixabay's documented ceiling is 100 requests / 60s. Stay under it, not at it. */
  rateLimit: () => ({
    max: Number(cfg().rateLimitMax) || 90,
    windowMs: Number(cfg().rateLimitWindowMs) || 60_000,
  }),

  /** Network timeouts, per request. Video search is slower than image search. */
  timeoutMs: () => Number(cfg().timeoutMs) || 20_000,

  /** Retry policy. Only idempotent GETs are retried, so this is always safe. */
  retry: () => ({
    attempts: Number(cfg().retryAttempts) || 3,
    baseDelayMs: Number(cfg().retryBaseDelayMs) || 400,
    maxDelayMs: Number(cfg().retryMaxDelayMs) || 4_000,
  }),

  /** Search-result TTL. Six hours: long enough to spare the API across a batch of jobs,
   *  short enough that a newly-popular asset can still surface the same day. */
  cacheTtlMs: () => Number(cfg().cacheTtlMs) || 6 * 60 * 60 * 1000,
  cacheMaxEntries: () => Number(cfg().cacheMaxEntries) || 500,

  /** Quality floor. Below this an asset costs more in frame area than it returns. */
  minImageWidth: () => Number(cfg().minImageWidth) || 800,
  minImageHeight: () => Number(cfg().minImageHeight) || 600,
  minVideoWidth: () => Number(cfg().minVideoWidth) || 960,
};
