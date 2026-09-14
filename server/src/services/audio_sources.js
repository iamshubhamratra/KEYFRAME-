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
const { spawn } = require("node:child_process");
const config = require("../config");

const pixabayBridge = require("./pixabay_bridge");

// Pixabay-only mode (PIXABAY_ONLY=1): drop the Freesound + Internet-Archive
// fallbacks so every real track/effect comes from Pixabay (via the bridge).
// Music still falls to the synthesized ambient pad so a dry result never ships
// a silent film; SFX is optional, so a dry result just means no effect.
//
// AUDIO Pixabay-only is now OPT-IN (user: "Freesound is terrible" was the old
// default, but Pixabay bridge is frequently dry for specific music queries on
// short horizontal films — e.g. "hand claps foot stomps rock energetic anthem"
// — and the synthetic pad fallback sounds worse than Freesound's real loops.
// Short horizontal films are 15-30s and the pad's 75s sine bed is especially
// noticeable. Default is now Freesound fallback ON; set AUDIO_PIXABAY_ONLY=1
// to force Pixabay-only (pad fallback). This flag is audio-scoped — it does NOT
// touch the image/vector providers (that's the separate PIXABAY_ONLY, which also
// strips Openverse/Iconify).
const AUDIO_PIXABAY_ONLY = process.env.AUDIO_PIXABAY_ONLY === "1";
const PIXABAY_ONLY = process.env.PIXABAY_ONLY === "1" || AUDIO_PIXABAY_ONLY;

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

// ---------- Generated ambient bed (the guaranteed music floor) ----------
// When every source comes up dry, synthesize a soft ambient pad with ffmpeg
// instead of shipping a silent film. Layered detuned sines + slow tremolo +
// echo + lowpass ≈ an unobtrusive synth bed; the mixer ducks it under VO like
// any other music track. License-free by construction. Mood keyed off the query.
function padSpec(query, seed = "") {
  const q = String(query).toLowerCase();
  // Seed jitter — two videos with the same mood still get slightly different beds
  // when they fall to the pad, fixing "same synthetic BGM on every short".
  const jitter = seed ? (seedIndex(seed, 100) / 100) : 0; // 0..0.99
  const detune = (jitter - 0.5) * 8; // -4..+4 Hz spread
  const lpJitter = Math.round((jitter - 0.5) * 200); // -100..+100 Hz
  const tremJitter = (jitter - 0.5) * 0.06; // ±0.03
  if (/(epic|orchestral|cinemat|dramatic|trailer|hybrid|heroic)/.test(q)) {
    return { freqs: [110+detune, 164.81+detune, 220+detune, 329.63+detune], trem: 0.12+tremJitter, lp: 950+lpJitter, vol: 0.5 };
  }
  if (/(upbeat|energetic|electro|synth|fast|pop|punchy|dance|driving)/.test(q)) {
    return { freqs: [220+detune, 277.18+detune, 329.63+detune, 440+detune], trem: 2.2+tremJitter, lp: 2400+lpJitter, vol: 0.45 };
  }
  return { freqs: [174.61+detune, 220+detune, 261.63+detune, 349.23+detune], trem: 0.18+tremJitter, lp: 1500+lpJitter, vol: 0.45 };
}

// Clamp the seed-jittered pad values into ffmpeg-legal ranges. tremolo rejects
// f < 0.1 outright ("Value 0.090000 for parameter 'f' out of range"), which made
// ffmpeg exit non-zero and turned the guaranteed music floor into a SILENT film
// on the epic/cinematic bed (trem 0.12 - jitter 0.03). Clamp; never trust the
// jitter arithmetic to stay in range. Pinned by scripts/audio_music.test.cjs.
function padParams(query, seed = "") {
  const s = padSpec(query, seed);
  return {
    ...s,
    trem: Math.min(20000, Math.max(0.1, Number(s.trem) || 0.18)),
    lp: Math.min(20000, Math.max(200, Math.round(Number(s.lp) || 1500))),
  };
}

function generatePad(query, outputPath, durationSec = 75, seed = "") {
  const s = padParams(query, seed);
  const trem = s.trem, lp = s.lp;
  const D = Math.max(20, Math.min(180, Math.round(Number(durationSec) || 75)));
  const args = ["-y", "-v", "error"];
  for (const f of s.freqs) args.push("-f", "lavfi", "-i", `sine=frequency=${f}:duration=${D}`);
  const gains = s.freqs.map((_, i) => `[${i}:a]volume=${(0.5 - i * 0.09).toFixed(2)}[s${i}]`).join(";");
  const labels = s.freqs.map((_, i) => `[s${i}]`).join("");
  const fadeOutAt = Math.max(0, D - 4);
  args.push(
    "-filter_complex",
    `${gains};${labels}amix=inputs=${s.freqs.length}:normalize=0,` +
    `tremolo=f=${trem.toFixed(3)}:d=0.55,aecho=0.7:0.55:380|640:0.3|0.22,lowpass=f=${lp},` +
    `afade=t=in:d=2.5,afade=t=out:st=${fadeOutAt}:d=4,volume=${s.vol}`,
    "-c:a", "libmp3lame", "-q:a", "4", outputPath
  );
  return new Promise((resolve) => {
    const p = spawn("ffmpeg", args, { windowsHide: true });
    p.on("error", () => resolve(null));
    p.on("exit", (code) => resolve(code === 0 && fs.existsSync(outputPath) ? outputPath : null));
  });
}

// Stable per-video index into a provider's result list, so two videos with the
// SAME mood query still get DIFFERENT tracks (the root cause of "every video has
// the same BGM" was always taking result #0). Derived from the job's seed.
function seedIndex(seed, spread = 8) {
  const s = String(seed || "");
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return spread > 0 ? h % spread : 0;
}

// Derive the widening ladder for a music query, most-specific -> broadest.
// Callers join plan.query + plan.mood, which often repeat ("epic orchestral
// synthwave epic orchestral synthwave hybrid"), so dedupe the words first.
//
// Two things this has to get right, both learned the hard way:
//  - The GENRE sits at the TAIL of a director query ("hand claps foot stomps
//    rock energetic anthem"). Retrying only the HEAD ("hand claps") came up dry
//    on every source, so every short shipped the synthetic pad.
//  - Widening must stay MUSICAL. Broadening from the head ("hand music") pulls
//    in field recordings, and once those pad the pool the seed rotation lands on
//    "Lake Night.wav" instead of a bed. Head terms are used ONLY when the query
//    names no genre at all, where they are the sole signal.
// Pinned by scripts/audio_music.test.cjs.
const GENRE_WORD = /^(epic|orchestral|cinematic|dramatic|trailer|hybrid|heroic|upbeat|energetic|electro|electronic|synth|synthwave|fast|pop|punchy|dance|driving|rock|anthem|ambient|calm|warm|chill|lofi|corporate|inspiring|uplifting|motivational|acoustic|folk|jazz|funk|blues|soul|hiphop|trap|edm|house|techno|indie|piano|guitar|strings|beat|groove|rhythm)$/;

function musicQueryCandidates(query) {
  const words = String(query || "").toLowerCase().match(/[a-z][a-z'-]*/g) || [];
  const norm = [...new Set(words)].join(" ").trim() || String(query || "ambient music");
  const core = norm.split(" ").slice(0, 2).join(" ") || norm;
  const tail = words.slice(-2).join(" ") || core;
  const genres = [...new Set(words.filter((w) => GENRE_WORD.test(w)))];
  const genrePair = genres.slice(-2).join(" ");
  const genreQueries = genres.slice(-3).reverse().map((g) => `${g} music`);
  const candidates = [...new Set([
    norm,
    tail,
    genrePair,
    `${tail} music`,
    ...genreQueries,
    genres.length ? null : core,
    "upbeat instrumental music",
  ].filter(Boolean))];
  const pixabayQueries = [...new Set([norm, tail, genrePair || core].filter(Boolean))];
  return { norm, core, tail, genres, candidates, pixabayQueries };
}

async function fetchMusic({ query, outputPath, tracker, durationSec, seed }) {
  const { norm, core, tail, candidates, pixabayQueries } = musicQueryCandidates(query);

  // 0) Pixabay bridge — PRIMARY music source (user preference). Real Pixabay
  // tracks (the official API serves no audio); best-effort, falls through to
  // Freesound if the bridge is down/slow/dry. VARY the pick: try a seed-derived
  // result index first (so each video gets a different track for the same mood),
  // then fall back to #0. This is the fix for "same BGM in every video".
  const variant = seedIndex(seed, 8);
  const indices = [...new Set([variant, 0])];
  for (const q of pixabayQueries) {
    for (const idx of indices) {
      const url = await pixabayBridge.firstAudioUrl(q, "music", { index: idx });
      if (url) {
        const got = await pixabayBridge.downloadToFile(url, outputPath, { minBytes: 20_000 });
        if (got) {
          if (tracker) tracker.addExternal("pixabay_music_download");
          log(`music: Pixabay bridge "${q}" [idx ${idx}] -> ${url.slice(0, 72)}`);
          return got;
        }
      }
    }
  }

  // PIXABAY_ONLY: skip the Freesound + Internet-Archive fallbacks entirely and
  // drop straight to the synthesized ambient pad, so any real track came from
  // Pixabay above.
  if (PIXABAY_ONLY) {
    const pad = await generatePad(norm, outputPath, durationSec, seed);
    if (pad) {
      log(`music: PIXABAY_ONLY, Pixabay dry for "${norm}" — synthesized ambient pad bed instead`);
      return pad;
    }
    log(`music: PIXABAY_ONLY and no Pixabay track for "${norm}"; skipping`);
    return null;
  }

  // 1) Freesound — bias to MUSIC, not foley/field-recordings; widen the query
  // stepwise before giving up on the source. Seed-varies the pick so the
  // same mood doesn't always return the same loop on short horizontal films.
  // Short films (15-30s) need shorter loops — accept 10s+ beds, not just 20s+.
  const durFilter = Number(durationSec) > 0 && Number(durationSec) <= 40 ? "duration:[10 TO 180]" : "duration:[20 TO 180]";
  // Build a POOL across candidate queries rather than committing to the first
  // one that returns anything. A narrow genre query often returns a SINGLE hit
  // ("energetic anthem" -> 1 result), and rotating a 1-element list is a no-op —
  // which is why every short still shipped the same track after the seed fix.
  // Widening until the pool has room to rotate is what actually buys variety.
  // Pool order stays most-specific-first, so the rotation still lands on a
  // relevant track; broader candidates only pad out the tail.
  const POOL_TARGET = 12;
  const pool = [];
  const seen = new Set();
  const addAll = (rs) => {
    for (const r of rs) {
      if (!r || r.id == null || seen.has(r.id)) continue;
      seen.add(r.id);
      pool.push(r);
    }
  };
  for (const q of candidates) {
    if (pool.length >= POOL_TARGET) break;
    if (tracker) tracker.addExternal("freesound_search");
    let fsResults = await freesoundSearch({
      query: q,
      filter: `${durFilter} tag:music`,
      sort: "rating_desc",
      pageSize: 30,
    });
    if (!fsResults.length) {
      fsResults = await freesoundSearch({
        query: q,
        filter: durFilter,
        sort: "rating_desc",
        pageSize: 30,
      });
    }
    addAll(fsResults);
  }
  if (pool.length) {
    const startIdx = seedIndex(seed, pool.length);
    // Rotate the pool so the same mood returns a different track per video
    const rotated = [...pool.slice(startIdx), ...pool.slice(0, startIdx)];
    log(`music: freesound pool=${pool.length}, seed start=${startIdx}`);
    const fsHit = await downloadFirstFreesoundPreview(rotated, outputPath);
    if (fsHit) {
      if (tracker) tracker.addExternal("freesound_download");
      return fsHit;
    }
  }

  // 2) Internet Archive fallback (broad tail query — genre, not percussion)
  if (tracker) tracker.addExternal("internet_archive_search");
  const iaQuery = tail !== core ? tail : core;
  const iaUrl = await internetArchiveFirstMp3(iaQuery);
  if (iaUrl) {
    const got = await downloadSafe(iaUrl, outputPath);
    if (got) {
      if (tracker) tracker.addExternal("internet_archive_download");
      return got;
    }
  }

  // 3) GUARANTEED FLOOR — a synthesized ambient pad beats a silent film.
  const pad = await generatePad(norm, outputPath, durationSec, seed);
  if (pad) {
    log(`music: all sources dry for "${norm}" — synthesized an ambient pad bed instead`);
    return pad;
  }

  log(`music: no source available for "${norm}"; skipping`);
  return null;
}

async function fetchSfx({ query, outputPath, tracker }) {
  // 0) Pixabay bridge — PRIMARY sfx source (user preference). Falls through to
  // Freesound on any miss.
  const bridgeUrl = await pixabayBridge.firstAudioUrl(query, "sound-effects");
  if (bridgeUrl) {
    const got = await pixabayBridge.downloadToFile(bridgeUrl, outputPath, { minBytes: 2_000 });
    if (got) {
      if (tracker) tracker.addExternal("pixabay_sfx_download");
      log(`sfx: Pixabay bridge "${query}" -> ${bridgeUrl.slice(0, 72)}`);
      return got;
    }
  }

  // PIXABAY_ONLY: no Freesound fallback — SFX is optional, so a dry Pixabay
  // result just means no effect for this cue.
  if (PIXABAY_ONLY) {
    log(`sfx: PIXABAY_ONLY, Pixabay dry for "${query}"; skipping`);
    return null;
  }

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
// Test surface — pure helpers, no network. See scripts/audio_music.test.cjs.
module.exports.__test = { musicQueryCandidates, padParams, padSpec, seedIndex };
