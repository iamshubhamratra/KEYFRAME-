// Openverse provider — free, keyless API over openly-licensed media.
// Images only (Openverse serves images + audio; no video).
// Docs: https://api.openverse.org/v1/

const UA = "keyframe-studio/0.1 (asset fetcher)";

async function search({ query, type, orientation, limit = 5 }) {
  if (type !== "image") return [];
  const url = new URL("https://api.openverse.org/v1/images/");
  url.searchParams.set("q", query);
  url.searchParams.set("page_size", String(limit));
  url.searchParams.set("mature", "false");
  if (orientation === "horizontal") url.searchParams.set("aspect_ratio", "wide");
  if (orientation === "vertical") url.searchParams.set("aspect_ratio", "tall");

  const resp = await fetch(url.toString(), {
    headers: { "User-Agent": UA, Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!resp.ok) throw new Error(`openverse HTTP ${resp.status}`);
  const data = await resp.json();

  return (data.results || [])
    .filter((r) => r.url)
    .map((r) => ({
      url: r.url,
      width: r.width || null,
      height: r.height || null,
      license: `${(r.license || "unknown").toUpperCase()} ${r.license_version || ""}`.trim(),
      sourceUrl: r.foreign_landing_url || r.url,
      title: r.title || null,
      tags: Array.isArray(r.tags) ? r.tags.map((t) => t && t.name).filter(Boolean).join(" ") : null,
    }));
}

module.exports = { name: "openverse", types: ["image"], search };
