// Pixabay official API provider (images + videos). Key-gated:
// config.assetProviders.pixabay.apiKey (falls back to legacy
// config.audio.pixabayKey). Rate limit: 100 req / 60s.

const config = require("../../config");
const { UA } = require("./util");

function apiKey() {
  const k = config.assetProviders?.pixabay?.apiKey || config.audio?.pixabayKey || "";
  return /YOUR_/.test(k) ? "" : k; // ignore the template placeholder
}

function orientationParam(o) {
  if (o === "vertical") return "vertical";
  if (o === "horizontal") return "horizontal";
  return "all";
}

// Pixabay rejects q longer than 100 characters with HTTP 400. Composed queries
// (subject + planner query + pack photoMod) can exceed that, so trim on a word
// boundary — dropping trailing style terms beats erroring out of the provider.
const MAX_QUERY_LEN = 100;
function clampQuery(q) {
  const s = String(q || "").trim();
  if (s.length <= MAX_QUERY_LEN) return s;
  const cut = s.slice(0, MAX_QUERY_LEN);
  const sp = cut.lastIndexOf(" ");
  return (sp > 0 ? cut.slice(0, sp) : cut).trim();
}

async function apiJson(endpoint, params) {
  const url = new URL(endpoint);
  url.searchParams.set("key", apiKey());
  for (const [k, v] of Object.entries(params)) {
    if (v != null) url.searchParams.set(k, String(v));
  }
  const resp = await fetch(url.toString(), {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(20_000),
  });
  if (!resp.ok) throw new Error(`pixabay HTTP ${resp.status}`);
  return resp.json();
}

async function search({ query, type, orientation, limit = 5 }) {
  if (!apiKey()) return [];

  if (type === "image") {
    const data = await apiJson("https://pixabay.com/api/", {
      // "all" = photos + illustrations + vectors, so a query adaptively returns
      // the right kind (a "developer desk" → photo, a "rocket icon" → vector).
      q: clampQuery(query), image_type: "all",
      orientation: orientationParam(orientation),
      per_page: limit, safesearch: "true",
    });
    return (data.hits || []).map((h) => ({
      // fullHDURL (1920px) when the account exposes it; else largeImageURL
      // (1280px). Prefer the larger so full-bleed stills stay sharp at 1080p.
      url: h.fullHDURL || h.largeImageURL || h.webformatURL,
      width: h.imageWidth, height: h.imageHeight,
      tags: h.tags, // comma-separated keywords — drives relevance ranking
      license: "Pixabay Content License",
      sourceUrl: h.pageURL,
    })).filter((c) => c.url);
  }

  if (type === "video") {
    const data = await apiJson("https://pixabay.com/api/videos/", {
      q: clampQuery(query),
      orientation: orientationParam(orientation),
      per_page: limit, safesearch: "true",
    });
    return (data.hits || []).map((h) => {
      const v = h.videos || {};
      const pick = v.medium || v.small || v.large || v.tiny;
      return pick && pick.url ? {
        url: pick.url,
        width: pick.width, height: pick.height,
        tags: h.tags,
        license: "Pixabay Content License",
        sourceUrl: h.pageURL,
      } : null;
    }).filter(Boolean);
  }

  return [];
}

module.exports = { name: "pixabay", types: ["image", "video"], available: () => !!apiKey(), search };
