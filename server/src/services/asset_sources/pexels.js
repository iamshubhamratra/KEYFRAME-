// Pexels provider (images + videos). Key-gated: config.assetProviders.pexels.apiKey.
// Free API with attribution appreciated. Docs: https://www.pexels.com/api/

const config = require("../../config");

function apiKey() { return config.assetProviders?.pexels?.apiKey || ""; }

async function pexelsJson(url) {
  const resp = await fetch(url, {
    headers: { Authorization: apiKey() },
    signal: AbortSignal.timeout(20_000),
  });
  if (!resp.ok) throw new Error(`pexels HTTP ${resp.status}`);
  return resp.json();
}

async function search({ query, type, orientation, limit = 5 }) {
  if (!apiKey()) return [];
  const orient = orientation === "vertical" ? "portrait" : orientation === "horizontal" ? "landscape" : "";

  if (type === "image") {
    const u = new URL("https://api.pexels.com/v1/search");
    u.searchParams.set("query", query);
    u.searchParams.set("per_page", String(limit));
    if (orient) u.searchParams.set("orientation", orient);
    const data = await pexelsJson(u.toString());
    return (data.photos || []).map((p) => ({
      url: p.src?.large2x || p.src?.large || p.src?.original,
      width: p.width, height: p.height,
      title: p.alt, // Pexels' human description — drives relevance ranking
      license: "Pexels License",
      sourceUrl: p.url,
    })).filter((c) => c.url);
  }

  if (type === "video") {
    const u = new URL("https://api.pexels.com/videos/search");
    u.searchParams.set("query", query);
    u.searchParams.set("per_page", String(limit));
    if (orient) u.searchParams.set("orientation", orient);
    const data = await pexelsJson(u.toString());
    return (data.videos || []).map((v) => {
      const files = (v.video_files || [])
        .filter((f) => f.file_type === "video/mp4" && f.width)
        .sort((a, b) => Math.abs((a.width || 0) - 1280) - Math.abs((b.width || 0) - 1280));
      const pick = files[0];
      return pick ? {
        url: pick.link,
        width: pick.width, height: pick.height,
        license: "Pexels License",
        sourceUrl: v.url,
      } : null;
    }).filter(Boolean);
  }

  return [];
}

module.exports = { name: "pexels", types: ["image", "video"], available: () => !!apiKey(), search };
