// The Unsplash gateway — the one place that speaks HTTP to Unsplash.
//
// Unsplash differs from the other two providers in four ways that the shared contract did not
// previously have to express, and each one is a real constraint rather than a detail:
//
//  1. FIFTY REQUESTS PER HOUR on a demo key. Pixabay allows 100/minute and Pexels 200/hour;
//     an Unsplash demo application allows 50 PER HOUR, and the ceiling is per application,
//     not per film. One 8-scene video with three query variants and a refinement lap can
//     spend the entire hourly budget by itself. That is why this provider is treated as a
//     COMPLEMENT that improves a pool when it is available, never a dependency: it declines
//     to spend its last few requests (see `reserve`), and every failure path is silent.
//
//  2. `Client-ID` AUTH. The key is an ACCESS key sent as `Authorization: Client-ID <key>`,
//     not a bare token (Pexels) and not a query parameter (Pixabay).
//
//  3. A DOWNLOAD-TRACKING OBLIGATION. The API Guidelines require that when an image is
//     actually used, the endpoint at `links.download_location` is pinged. This is a licence
//     term, not an optimisation — see `notifyDownload`, which the retrieval ladder calls
//     after a download succeeds. Fire-and-forget: it must never delay or fail a render.
//
//  4. NO VIDEO. Unsplash serves stills only, so the provider declares `types: ["image"]`.
//     Getting this wrong would be quietly expensive: hasProviderFor("video") gates the
//     video->still downgrade in the asset planner, and a provider that claims video it
//     cannot serve makes the planner plan needs nothing can fill.

const appConfig = require("../../config");
const { createClient } = require("../stock/http");

const ENDPOINTS = Object.freeze({
  search: "https://api.unsplash.com/search/photos",
});

/** @returns {string} the resolved access key, or "" when none is usable. */
function apiKey() {
  const k = appConfig.assetProviders?.unsplash?.apiKey || "";
  return /^YOUR_|^\s*$/i.test(String(k)) ? "" : String(k).trim();
}

const cfg = () => appConfig.unsplash || {};

// How many requests to leave unspent in the window. With a 50/hour demo ceiling, running the
// budget to zero means the NEXT film gets nothing at all and — worse — that the failure
// arrives as a 403 in the middle of a render rather than as a clean "skip this provider".
// NOT `Number(cfg().reserve) ?? 5`. `??` only catches null and undefined, and Number(undefined)
// is NaN — which is neither — so the unconfigured case yielded NaN, every comparison against it
// was false, and `hasBudget()` returned false forever: the provider disabled itself completely
// and silently. The same `Number()` trap is documented in asset_quality.js, which learned it
// the same way. `||` would be wrong too, since 0 is a legitimate reserve.
const RESERVE = () => {
  const v = Number(cfg().reserve);
  return Number.isFinite(v) && v >= 0 ? v : 5;
};

const client = createClient({
  name: "unsplash",
  apiKey,
  authHeaders: () => ({ Authorization: `Client-ID ${apiKey()}`, "Accept-Version": "v1" }),
  // Demo tier is 50/hour; production keys are 5000/hour. Default to just under the demo
  // ceiling and let config raise it — guessing high on a demo key means every request past
  // the fiftieth is a 403, and the limiter exists precisely so we never find that out live.
  rateLimit: () => ({
    max: Number(cfg().rateLimitMax) || 45,
    windowMs: Number(cfg().rateLimitWindowMs) || 3_600_000,
  }),
  retry: () => ({ attempts: Number(cfg().retryAttempts) || 2, baseDelayMs: 800, maxDelayMs: 5000 }),
  timeoutMs: () => Number(cfg().timeoutMs) || 20_000,
  // A long TTL matters more here than anywhere else: with 50 requests an hour, the cache is
  // most of the provider's usable capacity.
  cache: () => ({ ttlMs: Number(cfg().cacheTtlMs) || 12 * 60 * 60 * 1000, max: Number(cfg().cacheMax) || 500 }),
});

const PER_PAGE_MAX = 30; // Unsplash's documented ceiling (Pexels allows 80)
const TARGET_LONG_EDGE = 1920;

const orientationParam = (o) =>
  o === "vertical" ? "portrait" : o === "horizontal" ? "landscape" : o === "square" ? "squarish" : "";

/**
 * Is there budget left worth spending? Consulted before every search.
 *
 * Two sources agree or we take the pessimistic one: what Unsplash last told us
 * (`X-Ratelimit-Remaining`) and what our own rolling window has counted. The header is
 * authoritative but only exists after the first call of a process; the local count covers
 * the gap.
 */
function hasBudget() {
  const q = client.quota();
  if (q.remaining != null && q.remaining <= RESERVE()) return false;
  const w = client.windowUsage();
  return w.used < Math.max(0, w.max - RESERVE());
}

/**
 * One normalized still. Same envelope as the Pexels gateway and services/pixabay/types.js.
 */
function mapPhoto(p) {
  if (!p || !p.urls) return null;
  // `raw` is the un-resized original with imgix parameters available, so we ask for exactly
  // the size this pipeline renders instead of downloading a 6000px original (slow, and no
  // visible gain at 1080p) or accepting `regular`'s fixed 1080px (soft when used full-bleed).
  const base = p.urls.raw || p.urls.full || p.urls.regular;
  if (!base) return null;
  const url = p.urls.raw
    ? `${base}${base.includes("?") ? "&" : "?"}w=${TARGET_LONG_EDGE}&q=80&fm=jpg&fit=max`
    : base;

  // Report the dimensions we will ACTUALLY receive, not the original's. The aspect ratio is
  // preserved by fit=max, but the long edge is what the quality axis scores, and claiming
  // 6000px for a file we asked to be 1920px would overstate every Unsplash candidate.
  const ow = Number(p.width) || null, oh = Number(p.height) || null;
  let width = ow, height = oh;
  if (ow && oh) {
    const longEdge = Math.max(ow, oh);
    if (longEdge > TARGET_LONG_EDGE) {
      const k = TARGET_LONG_EDGE / longEdge;
      width = Math.round(ow * k);
      height = Math.round(oh * k);
    }
  }

  return {
    id: String(p.id),
    provider: "unsplash",
    type: "image",
    // Unsplash splits its description in two: `description` is the photographer's own caption
    // (often null) and `alt_description` is the machine-generated one (almost always present).
    // Both are relevance signal, so both are carried.
    title: p.description || p.alt_description || "",
    alt: p.alt_description || p.description || "",
    url,
    thumbnail: p.urls.small || p.urls.thumb || null,
    width, height,
    duration: null,
    tags: Array.isArray(p.tags) ? p.tags.map((t) => String(t.title || "").toLowerCase()).filter(Boolean) : [],
    // Unsplash computes a dominant colour for every photo — the brand axis can use it before
    // anything is downloaded.
    avgColor: p.color || null,
    pageUrl: (p.links && p.links.html) || null,
    license: "Unsplash License",
    photographer: (p.user && p.user.name) || null,
    // Required by the API Guidelines when the image is actually used. Carried on the
    // candidate so the retrieval ladder can fire it at download time.
    downloadLocation: (p.links && p.links.download_location) || null,
    raw: p,
  };
}

/**
 * FAIL-SOFT: resolves `{assets, error}` and never throws. An exhausted budget is reported as
 * a normal empty result with a reason, not as an error — running out of a 50/hour allowance
 * is an expected operating condition here, not a fault.
 */
async function search({ query, type = "image", orientation, limit = 20 }) {
  if (!apiKey()) return { assets: [], error: "no key" };
  if (type !== "image") return { assets: [], error: null };   // stills only, by contract
  if (!hasBudget()) {
    const q = client.quota();
    return { assets: [], error: null, skipped: `hourly budget reserved (${q.remaining ?? "?"} left)` };
  }
  const params = {
    query,
    per_page: Math.max(1, Math.min(PER_PAGE_MAX, Number(limit) || 20)),
    orientation: orientationParam(orientation) || undefined,
    content_filter: "high",
  };
  try {
    const body = await client.getJson(ENDPOINTS.search, params);
    const assets = (body.results || []).map(mapPhoto).filter(Boolean);
    return { assets, error: null, total: body.total ?? null };
  } catch (e) {
    return { assets: [], error: e.message || String(e) };
  }
}

/**
 * The Unsplash API Guidelines' download-tracking requirement: when a photo is actually used,
 * ping the endpoint the search result handed us. Fire-and-forget by design — this is a
 * licence obligation, but it is not worth one millisecond of a render's critical path, and a
 * failed ping must never turn a good picture into a failed fetch.
 */
function notifyDownload(candidate) {
  const loc = candidate && (candidate.downloadLocation || candidate.download_location);
  if (!loc || !apiKey()) return;
  // Deliberately NOT awaited and deliberately not rate-limited through the search client:
  // this is a tracking side effect, and blocking a download behind an hourly search budget
  // would be exactly backwards.
  fetch(loc, { headers: { Authorization: `Client-ID ${apiKey()}`, "Accept-Version": "v1" }, signal: AbortSignal.timeout(8000) })
    .catch(() => { /* tracking is best-effort; never surface it */ });
}

function probeKey() {
  return client.probe(ENDPOINTS.search, { query: "test", per_page: 1 });
}

module.exports = {
  search, probeKey, notifyDownload, mapPhoto, apiKey,
  hasKey: () => !!apiKey(),
  hasBudget,
  quota: client.quota,
  windowUsage: client.windowUsage,
  clearCache: client.clearCache,
  ENDPOINTS, TARGET_LONG_EDGE,
};
