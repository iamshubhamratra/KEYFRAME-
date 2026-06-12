// Audio (music + SFX) fetcher.
//
// Primary: Freesound.org API v2 with token auth.
//   - https://freesound.org/apiv2/search/text/   (search)
//   - previews[preview-hq-mp3]                   (download URL — no auth on CDN)
//   - Token auth only (no OAuth required for previews).
//   - Massive catalog, covers both music loops and SFX.
//
// Fallback (music only): Internet Archive public search API.
//
// All functions return a local filepath on success, null on failure.
// Nothing throws.

const fs = require("node:fs");
const path = require("node:path");
const config = require("../config");

const FREESOUND_BASE = "https://freesound.org/apiv2";

function log(...args) { console.log("[audio_sources]", ...args); }

// ---------- low-level HTTP helpers ----------

async function downloadBinary(url, outPath, { timeoutMs = 60_000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      headers: {
        "User-Agent": "video-gen/1.0",
        "Accept": "audio/mpeg,audio/*,*/*;q=0.8",
      },
      redirect: "follow",
      signal: controller.signal,
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const buf = Buffer.from(await resp.arrayBuffer());
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, buf);
    return outPath;
  } finally { clearTimeout(timer); }
}

async function downloadSafe(url, outPath) {
  try {
    const p = await downloadBinary(url, outPath);
    const size = fs.statSync(p).size;
    if (size < 5000) {
      try { fs.unlinkSync(p); } catch {}
      log(`download too small (${size} bytes): ${url}`);
      return null;
    }
    return p;
  } catch (e) {
    log(`download failed (${e.message}): ${url}`);
    return null;
  }
}

async function fetchJson(url, { headers = {}, timeoutMs = 20_000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": "video-gen/1.0", ...headers },
      signal: controller.signal,
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  } finally { clearTimeout(timer); }
}

// ---------- Freesound (primary) ----------

async function freesoundSearch({ query, filter, sort, pageSize = 10 }) {
  const token = config.audio?.freesoundToken;
  if (!token) {
    log("no freesound token configured; skipping");
    return [];
  }
  const url = new URL(`${FREESOUND_BASE}/search/text/`);
  url.searchParams.set("query", query);
  url.searchParams.set("fields", "id,name,duration,previews,license,tags,avg_rating,num_downloads");
  url.searchParams.set("page_size", String(pageSize));
  if (filter) url.searchParams.set("filter", filter);
  if (sort)   url.searchParams.set("sort", sort);

  try {
    const data = await fetchJson(url.toString(), {
      headers: { Authorization: `Token ${token}` },
    });
    const results = Array.isArray(data.results) ? data.results : [];
    log(`freesound "${query}" -> ${results.length} result(s)`);
    return results;
  } catch (e) {
    log(`freesound search failed: ${e.message}`);
    return [];
  }
}

async function downloadFirstFreesoundPreview(results, outputPath) {
  for (const r of results) {
    const previews = r?.previews || {};
    const url = previews["preview-hq-mp3"] || previews["preview-lq-mp3"];
    if (!url) continue;
    const got = await downloadSafe(url, outputPath);
    if (got) {
      log(`picked freesound id=${r.id} (${r.name?.slice(0, 40)}, ${r.duration?.toFixed(1)}s)`);
      return got;
    }
  }
  return null;
}

// ---------- Internet Archive (music fallback) ----------

const IA_MUSIC_COLLECTIONS = ["netlabels", "audio_music", "opensource_audio"];

async function iaSearchIdentifiers(query) {
  const colClause = IA_MUSIC_COLLECTIONS.map((c) => `collection:(${c})`).join(" OR ");
  const q = `mediatype:(audio) AND (${colClause}) AND (${query}) AND NOT collection:(podcasts)`;
  const url = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(q)}&fl[]=identifier&sort[]=downloads+desc&rows=10&output=json`;
  try {
    const data = await fetchJson(url);
    return (data?.response?.docs || []).map((d) => d.identifier).filter(Boolean);
  } catch (e) {
    log(`ia search failed: ${e.message}`);
    return [];
  }
}

async function iaFindMp3Url(identifier) {
  try {
    const meta = await fetchJson(`https://archive.org/metadata/${encodeURIComponent(identifier)}`);
    const files = meta?.files || [];
    const mp3s = files.filter((f) =>
      f?.name && /\.mp3$/i.test(f.name) && !/_sample|_preview|_clip|_small/i.test(f.name)
    );
    const sized = mp3s
      .map((f) => ({ ...f, _size: Number(f.size) || 0 }))
      .filter((f) => f._size === 0 || f._size < 20 * 1024 * 1024)
      .sort((a, b) => (a._size || 0) - (b._size || 0));
    const pick = sized[0] || mp3s[0];
    if (!pick) return null;
    return `https://archive.org/download/${encodeURIComponent(identifier)}/${encodeURIComponent(pick.name)}`;
  } catch (e) {
    log(`ia metadata failed for ${identifier}: ${e.message}`);
    return null;
  }
}

async function internetArchiveFirstMp3(query) {
  const ids = await iaSearchIdentifiers(query);
  for (const id of ids) {
    const url = await iaFindMp3Url(id);
    if (url) {
      log(`ia picked ${id} for "${query}"`);
      return url;
    }
  }
  return null;
}

// ---------- Public API ----------

async function fetchMusic({ query, outputPath, tracker }) {
  // 1) Freesound
  if (tracker) tracker.addExternal("freesound_search");
  const fsResults = await freesoundSearch({
    query,
    filter: "duration:[20 TO 180]",
    sort: "rating_desc",
  });
  const fsHit = await downloadFirstFreesoundPreview(fsResults, outputPath);
  if (fsHit) {
    if (tracker) tracker.addExternal("freesound_download");
    return fsHit;
  }

  // 2) Internet Archive fallback
  if (tracker) tracker.addExternal("internet_archive_search");
  const iaUrl = await internetArchiveFirstMp3(query);
  if (iaUrl) {
    const got = await downloadSafe(iaUrl, outputPath);
    if (got) {
      if (tracker) tracker.addExternal("internet_archive_download");
      return got;
    }
  }

  log(`music: no source available for "${query}"; skipping`);
  return null;
}

async function fetchSfx({ query, outputPath, tracker }) {
  if (tracker) tracker.addExternal("freesound_search");
  const results = await freesoundSearch({
    query,
    filter: "duration:[0.1 TO 8]",
    sort: "rating_desc",
  });
  const got = await downloadFirstFreesoundPreview(results, outputPath);
  if (got) {
    if (tracker) tracker.addExternal("freesound_download");
    return got;
  }

  log(`sfx: no source available for "${query}"; skipping`);
  return null;
}

module.exports = { fetchMusic, fetchSfx };
