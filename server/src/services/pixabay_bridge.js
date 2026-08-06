// Client for the local Pixabay bridge (../pixabay-no-node-modules) — a headless-
// Chrome scraper exposing Pixabay VECTORS + MUSIC + SOUND-EFFECTS that the
// official Pixabay API doesn't serve. The bridge drives a real browser, so it's
// SLOW; every call here is FAIL-SOFT with a generous timeout — any error/timeout
// returns empty/null so the caller falls back to its existing source (iconify /
// Freesound). Never a hard dependency: if the bridge is down, generation still works.
//
// Config: PIXABAY_BRIDGE_URL (default http://localhost:3000/api/v1),
//         PIXABAY_BRIDGE_DISABLED=1 to turn the integration off.
//
// THE PORT WAS WRONG, AND THAT IS WHY THIS WAS ALWAYS "DOWN". The default here read 3007;
// the bridge (../pixabay-no-node-modules/src/config.js) listens on 3000 and always has.
// Every call therefore failed at the socket, the fail-soft path swallowed it, and 100% of
// music and SFX came from Freesound — whose music subset is small and skews field-recording
// /documentary. A running service was being reported as absent for as long as this default
// has existed. Verified 2026-08-05: GET /api/v1/music/first-audio?q=techno on :3000 returns
// a real Pixabay CDN mp3.

const fs = require("node:fs");
const path = require("node:path");

const BASE = (process.env.PIXABAY_BRIDGE_URL || "http://localhost:3000/api/v1").replace(/\/$/, "");
const ENABLED = process.env.PIXABAY_BRIDGE_DISABLED !== "1";
// One-shot latch: a connection-level failure is announced once per process, not per query.
let unreachableWarned = false;
const bridgeReachable = () => !unreachableWarned;

// Is this a CONNECTION-level failure (the service is not there) rather than a query miss?
// Shared by both callers below — previously only the audio path recognised it, so a dead
// bridge stayed "reachable" for the entire image path.
const isOffline = (e) => /fetch failed|ECONNREFUSED|ENOTFOUND|timed out|aborted|socket hang up|EHOSTUNREACH|ETIMEDOUT/i
  .test((e && e.message) || "");

// Trip the latch once, loudly. Returns true when this call was the one that tripped it.
function markUnreachable(where) {
  if (unreachableWarned) return false;
  unreachableWarned = true;
  console.warn(
    `[pixabay-bridge] UNREACHABLE at ${BASE} (${where}) — falling back for the rest of this process. ` +
    `Pixabay is the primary source for music, SFX and vectors. Start it with ` +
    `\`cd pixabay-no-node-modules && npm install && npm start\` (repo root), ` +
    `or set PIXABAY_BRIDGE_DISABLED=1 to silence this.`
  );
  return true;
}

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
  // A dead bridge must cost ONE timeout, not one per query variant. acquire() tries up to four
  // variants per vector need at 30s each — two minutes of nothing, per need, on the critical
  // path — because this function only ever warned per query and never told anyone the service
  // was gone. The latch below is what stops the second variant from being attempted at all.
  if (!ENABLED || !query || !bridgeReachable()) return [];
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
    // A connection-level failure trips the shared latch so no further query variant — and no
    // later vector need — pays the timeout again. A genuine per-query miss stays quiet.
    if (isOffline(e)) markUnreachable("vector search");
    else console.warn(`[pixabay-bridge] vector search failed for "${query}": ${e.message}`);
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
    // A DOWN BRIDGE IS NOT A DRY SEARCH, AND THE LOG MUST NOT READ LIKE ONE.
    //
    // This is the PRIMARY source for both music and sound effects. When the service is not
    // running, every call fails identically and the pipeline falls through to Freesound —
    // correct fail-soft behaviour, but with only a per-query warning it looks like the
    // provider had nothing, so an entire film's audio can come from the fallback catalogue
    // with nobody noticing. Freesound skews field-recording/documentary, which is exactly
    // how a template-steered search still ends up sounding generic.
    //
    // A connection-level failure is therefore reported ONCE, loudly, naming the service and
    // how to start it. Per-query misses stay quiet.
    const offline = isOffline(e);
    if (offline) {
      markUnreachable(`${cat} resolve`);
    } else if (!offline) {
      console.warn(`[pixabay-bridge] ${cat} resolve failed for "${query}": ${e.message}`);
    }
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

module.exports = {
  searchVectors, firstAudioUrl, downloadToFile, bridgeReachable, BASE,
  // `enabled()` now means "is it worth calling", not merely "was it configured". The latch was
  // defined and exported here but consulted by NOBODY — asset_sources/index.js:93 gated the whole
  // vector ladder on the env flag alone, so an unreachable bridge was retried for every vector
  // need of every film. Callers that genuinely want the config flag alone read `configured`.
  enabled: () => ENABLED && bridgeReachable(),
  configured: () => ENABLED,
  // Test seam: the latch is process-wide by design, so a test that exercises the offline path
  // would otherwise poison every later assertion in the same run.
  __resetReachability: () => { unreachableWarned = false; },
};
