// Client for the local Pixabay bridge (../pixabay-no-node-modules) — a headless-
// Chrome scraper exposing Pixabay VECTORS + MUSIC + SOUND-EFFECTS that the
// official Pixabay API doesn't serve. The bridge drives a real browser, so it's
// SLOW; every call here is FAIL-SOFT with a generous timeout — any error/timeout
// returns empty/null so the caller falls back to its existing source (iconify /
// Freesound). Never a hard dependency: if the bridge is down, generation still works.
//
// Config: PIXABAY_BRIDGE_URL (default http://localhost:3007/api/v1),
//         PIXABAY_BRIDGE_DISABLED=1 to turn the integration off.

const fs = require("node:fs");
const path = require("node:path");

const BASE = (process.env.PIXABAY_BRIDGE_URL || "http://localhost:3007/api/v1").replace(/\/$/, "");
const ENABLED = process.env.PIXABAY_BRIDGE_DISABLED !== "1";

async function getJson(url, timeoutMs) {
  const resp = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { "User-Agent": "keyframe-studio/1.0 (pixabay-bridge)" },
  });
  if (!resp.ok) throw new Error(`bridge HTTP ${resp.status}`);
  return resp.json();
}

// Vector search -> [{ url, id, tags, license, sourceUrl }]. `url` is the direct
// public CDN previewURL (a ~1280px PNG), downloadable without the browser.
async function searchVectors(query, { limit = 20, timeoutMs = 30_000 } = {}) {
  if (!ENABLED || !query) return [];
  try {
    const data = await getJson(`${BASE}/vectors/search?q=${encodeURIComponent(query)}`, timeoutMs);
    const items = Array.isArray(data.items) ? data.items : [];
    return items
      .filter((it) => it && typeof it.previewURL === "string" && /^https?:/.test(it.previewURL))
      .slice(0, limit)
      .map((it) => ({
        url: it.previewURL,
        id: String(it.id || ""),
        tags: String(it.title || ""),
        license: "Pixabay Content License",
        sourceUrl: it.pageURL || null,
      }));
  } catch (e) {
    console.warn(`[pixabay-bridge] vector search failed for "${query}": ${e.message}`);
    return [];
  }
}

// First playable track's direct mp3 URL for a music/sfx query, or null.
// category: "music" | "sfx" | "sound-effects".
async function firstAudioUrl(query, category, { index = 0, timeoutMs = 45_000 } = {}) {
  if (!ENABLED || !query) return null;
  const cat = category === "sfx" || category === "sound-effects" ? "sound-effects" : "music";
  try {
    const url = `${BASE}/${cat}/first-audio?q=${encodeURIComponent(query)}&index=${index}`;
    const data = await getJson(url, timeoutMs);
    return data && typeof data.mp3Url === "string" && /^https?:/.test(data.mp3Url) ? data.mp3Url : null;
  } catch (e) {
    console.warn(`[pixabay-bridge] ${cat} resolve failed for "${query}": ${e.message}`);
    return null;
  }
}

// Download a public CDN URL (vector PNG / mp3) to a file. Returns outPath or null.
async function downloadToFile(url, outPath, { timeoutMs = 60_000, minBytes = 2_000 } = {}) {
  try {
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "follow",
      headers: { "User-Agent": "keyframe-studio/1.0", Accept: "*/*" },
    });
    if (!resp.ok) return null;
    const buf = Buffer.from(await resp.arrayBuffer());
    if (buf.length < minBytes) return null;
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, buf);
    return outPath;
  } catch {
    return null;
  }
}

module.exports = { searchVectors, firstAudioUrl, downloadToFile, enabled: () => ENABLED, BASE };
