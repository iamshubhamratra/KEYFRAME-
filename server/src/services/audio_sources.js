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
function padSpec(query) {
  const q = String(query).toLowerCase();
  if (/(epic|orchestral|cinemat|dramatic|trailer|hybrid|heroic)/.test(q)) {
    return { freqs: [110, 164.81, 220, 329.63], trem: 0.12, lp: 950, vol: 0.5 };    // low, wide, slow swell
  }
  if (/(upbeat|energetic|electro|synth|fast|pop|punchy|dance|driving)/.test(q)) {
    return { freqs: [220, 277.18, 329.63, 440], trem: 2.2, lp: 2400, vol: 0.45 };   // brighter, pulsing
  }
  return { freqs: [174.61, 220, 261.63, 349.23], trem: 0.18, lp: 1500, vol: 0.45 }; // warm/calm default
}

function generatePad(query, outputPath, durationSec = 75) {
  const s = padSpec(query);
  const D = Math.max(20, Math.min(180, Math.round(Number(durationSec) || 75)));
  const args = ["-y", "-v", "error"];
  for (const f of s.freqs) args.push("-f", "lavfi", "-i", `sine=frequency=${f}:duration=${D}`);
  const gains = s.freqs.map((_, i) => `[${i}:a]volume=${(0.5 - i * 0.09).toFixed(2)}[s${i}]`).join(";");
  const labels = s.freqs.map((_, i) => `[s${i}]`).join("");
  const fadeOutAt = Math.max(0, D - 4);
  args.push(
    "-filter_complex",
    `${gains};${labels}amix=inputs=${s.freqs.length}:normalize=0,` +
    `tremolo=f=${s.trem}:d=0.55,aecho=0.7:0.55:380|640:0.3|0.22,lowpass=f=${s.lp},` +
    `afade=t=in:d=2.5,afade=t=out:st=${fadeOutAt}:d=4,volume=${s.vol}`,
    "-c:a", "libmp3lame", "-q:a", "4", outputPath
  );
  return new Promise((resolve) => {
    const p = spawn("ffmpeg", args, { windowsHide: true });
    p.on("error", () => resolve(null));
    p.on("exit", (code) => resolve(code === 0 && fs.existsSync(outputPath) ? outputPath : null));
  });
}

// ---- candidate ranking ------------------------------------------------------
//
// AN HONEST LIMIT, STATED UP FRONT: nothing in this process listens to the audio. So
// "evaluate the returned tracks and select the highest-quality result" is METADATA
// ranking — length fit, tag overlap with the template's declared genre, and the
// provider's own popularity signals. It is a real improvement over "take the first hit",
// and it is not musical taste. A true fit check would need tempo/key analysis of the
// decoded audio, which is a different (and much larger) feature.
//
// It also only applies where metadata EXISTS. Freesound returns duration/tags/rating/
// downloads and is ranked. The Pixabay bridge returns a bare mp3 URL and nothing else,
// so there is nothing there to rank — for that provider the steering comes entirely from
// asking in the right ORDER, which is exactly what the template's candidate list gives us.
function scoreTrack(r, { filmSec, style }) {
  let score = 0;
  const dur = Number(r.duration) || 0;

  // LENGTH FIT dominates, because it is the one metadata field with an audible
  // consequence: a track shorter than the film is looped by the mixer (-stream_loop -1),
  // and a seam every 20 seconds is the most noticeable defect a bed can have.
  if (filmSec > 0 && dur > 0) {
    if (dur >= filmSec) score += 30 + Math.min(10, (dur - filmSec) / 12);   // covers it, mild bonus for headroom
    else score += 30 * (dur / filmSec) - 15;                                 // will loop — pay for it
  }

  // TAG OVERLAP with the template's declared genre. This is what makes the search
  // template-aware at the RANKING stage as well as the query stage.
  const tags = (Array.isArray(r.tags) ? r.tags : []).map((t) => String(t).toLowerCase());
  if (tags.length && style.length) {
    const hits = style.filter((s) => tags.some((t) => t.includes(s) || s.includes(t))).length;
    score += Math.min(30, hits * 12);
  }

  // Provider popularity signals — weak, but they separate a usable track from an
  // unlistenable upload when nothing else distinguishes two candidates.
  const rating = Number(r.avg_rating) || 0;              // 0..5
  score += Math.min(16, rating * 3.2);
  const dl = Number(r.num_downloads) || 0;
  score += Math.min(10, Math.log10(dl + 1) * 3);

  return Math.round(score * 10) / 10;
}

/**
 * fetchMusic({ candidates | query, outputPath, tracker, durationSec, style, selection })
 *   → local file path, or null.
 *
 * `candidates` is an ORDERED list of queries (services/audio_profile.musicCandidatesFor
 * builds it: template keywords first, the script's subject-derived query later). `query`
 * remains accepted as the single-query legacy form, so older callers are untouched.
 *
 * `selection` is an optional caller-owned object this fills in with what actually won —
 * { query, provider, score, rank }. The return value stays a bare path so every existing
 * caller (and the integration test's stub) keeps working; a caller that wants to VALIDATE
 * that the template steered the search passes the object. See audio_report.musicFromTemplate.
 */
async function fetchMusic({ query, candidates: candidatesIn, outputPath, tracker, durationSec, style = [], selection = null }) {
  // Normalize each candidate: callers join plan.query + plan.mood, which often repeat
  // ("epic orchestral synthwave epic orchestral synthwave hybrid") — dedupe the words.
  const normalize = (q) => {
    const words = String(q || "").toLowerCase().match(/[a-z][a-z'-]*/g) || [];
    return [...new Set(words)].join(" ").trim();
  };
  const asked = (Array.isArray(candidatesIn) && candidatesIn.length ? candidatesIn : [query])
    .map(normalize).filter(Boolean);
  const norm = asked[0] || "ambient music";
  // A broader 2-word core as a final retry — an over-specific query zeroes out Freesound
  // entirely, and widening inside the template's own vocabulary beats giving up on it.
  const core = norm.split(" ").slice(0, 2).join(" ");
  const queries = [...new Set([...asked, core, `${core.split(" ")[0]} music`])].filter(Boolean);
  const styleTags = (Array.isArray(style) ? style : []).map((s) => String(s).toLowerCase()).filter(Boolean);
  const filmSec = Number(durationSec) || 0;
  const note = (o) => { if (selection) Object.assign(selection, o); };

  // 0) Pixabay bridge — PRIMARY music source (user preference). Real Pixabay tracks (the
  // official API serves no audio); best-effort, falls through to Freesound if the bridge
  // is down/slow/dry. Asked in candidate ORDER, so the template's keywords get first
  // refusal — the only steering available on a provider that exposes no metadata.
  for (let i = 0; i < queries.length; i++) {
    const q = queries[i];
    const url = await pixabayBridge.firstAudioUrl(q, "music");
    if (url) {
      const got = await pixabayBridge.downloadToFile(url, outputPath, { minBytes: 20_000 });
      if (got) {
        if (tracker) tracker.addExternal("pixabay_music_download");
        log(`music: Pixabay bridge "${q}" (candidate ${i + 1}/${queries.length}) -> ${url.slice(0, 72)}`);
        note({ query: q, provider: "pixabay", rank: i, score: null, ranked: false });
        return got;
      }
    }
  }

  // 1) Freesound — bias to MUSIC, not foley/field-recordings. Unlike the bridge, this
  // returns real metadata, so candidates are POOLED and the best track wins rather than
  // the first one that happened to resolve.
  const pool = [];
  for (const q of queries) {
    if (tracker) tracker.addExternal("freesound_search");
    let fsResults = await freesoundSearch({ query: q, filter: "duration:[20 TO 180] tag:music", sort: "rating_desc" });
    if (!fsResults.length) {
      fsResults = await freesoundSearch({ query: q, filter: "duration:[20 TO 180]", sort: "rating_desc" });
    }
    for (const r of fsResults) pool.push({ r, q, rank: queries.indexOf(q) });
    // Enough to choose from. Pooling every candidate would spend searches to re-rank a
    // decision that is already well-supported.
    if (pool.length >= 12) break;
  }
  if (pool.length) {
    const ranked = pool
      // Earlier candidate = closer to the template's own vocabulary. A small bonus, so a
      // clearly better track from a later query can still win — this is a tie-breaker,
      // not a veto.
      .map((e) => ({ ...e, score: scoreTrack(e.r, { filmSec, style: styleTags }) + Math.max(0, 8 - e.rank * 3) }))
      .sort((a, b) => b.score - a.score);
    for (const e of ranked) {
      const got = await downloadFirstFreesoundPreview([e.r], outputPath);
      if (got) {
        if (tracker) tracker.addExternal("freesound_download");
        log(`music: Freesound "${e.q}" -> id=${e.r.id} (${(Number(e.r.duration) || 0).toFixed(0)}s, score ${e.score}, best of ${pool.length})`);
        note({ query: e.q, provider: "freesound", rank: e.rank, score: e.score, ranked: true });
        return got;
      }
    }
  }

  // 2) Internet Archive fallback (broad core query)
  if (tracker) tracker.addExternal("internet_archive_search");
  const iaUrl = await internetArchiveFirstMp3(core);
  if (iaUrl) {
    const got = await downloadSafe(iaUrl, outputPath);
    if (got) {
      if (tracker) tracker.addExternal("internet_archive_download");
      note({ query: core, provider: "internet_archive", rank: null, score: null, ranked: false });
      return got;
    }
  }

  // 3) GUARANTEED FLOOR — a synthesized ambient pad beats a silent film.
  const pad = await generatePad(norm, outputPath, durationSec);
  if (pad) {
    log(`music: all sources dry for "${norm}" — synthesized an ambient pad bed instead`);
    note({ query: norm, provider: "generated-pad", rank: null, score: null, ranked: false });
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
// Test seam: track ranking is pure and its priorities (length fit dominates, tag overlap
// second, popularity a weak tie-breaker) are asserted directly in scripts/test-audio.js.
module.exports.__test = { scoreTrack };
