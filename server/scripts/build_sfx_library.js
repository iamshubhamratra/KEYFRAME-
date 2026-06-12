// One-time builder for the curated SFX library. For each cue in the fixed
// vocabulary it searches Freesound with hand-tuned queries/filters, downloads
// the best-rated short take, and loudness-normalizes it to a consistent
// level. Output: server/assets/sfx/<cue>.mp3 + manifest.json.
//
//   node scripts/build_sfx_library.js
//
// Deterministic afterwards: the pipeline never searches for these again.

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const config = require("../src/config");

const OUT_DIR = path.resolve(__dirname, "..", "assets", "sfx");

// The vocabulary. Queries tuned for clean, produced UI/motion sounds —
// not field recordings.
const CUES = {
  "whoosh":    { q: "whoosh transition clean",  dur: "[0.3 TO 2.5]" },
  "swoosh":    { q: "swoosh swish fast",        dur: "[0.2 TO 2]" },
  "pop":       { q: "pop ui bubble",            dur: "[0.1 TO 1]" },
  "click":     { q: "click ui soft interface",  dur: "[0.05 TO 0.8]" },
  "riser":     { q: "riser build up cinematic", dur: "[1 TO 5]" },
  "impact":    { q: "impact hit boom cinematic",dur: "[0.3 TO 2.5]" },
  "sparkle":   { q: "sparkle shimmer magic",    dur: "[0.5 TO 3]" },
  "ding":      { q: "ding notification bell",   dur: "[0.3 TO 2]" },
  "thud":      { q: "thud soft deep",           dur: "[0.2 TO 1.5]" },
  "transition":{ q: "cinematic transition sweep", dur: "[0.5 TO 3]" },
};

function ffmpegNormalize(src, dest) {
  return new Promise((resolve, reject) => {
    const p = spawn("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", src, "-af", "loudnorm=I=-18:TP=-2:LRA=7", "-ar", "44100", "-b:a", "128k", dest]);
    p.on("error", reject);
    p.on("exit", (c) => c === 0 ? resolve() : reject(new Error(`ffmpeg exit ${c}`)));
  });
}

async function fetchCue(name, { q, dur }) {
  const token = config.audio?.freesoundToken;
  const url = new URL("https://freesound.org/apiv2/search/text/");
  url.searchParams.set("query", q);
  url.searchParams.set("filter", `duration:${dur} avg_rating:[3.8 TO *]`);
  url.searchParams.set("sort", "downloads_desc");
  url.searchParams.set("fields", "id,name,duration,previews,avg_rating,num_downloads,license");
  url.searchParams.set("page_size", "5");
  const resp = await fetch(url, { headers: { Authorization: `Token ${token}` } });
  if (!resp.ok) throw new Error(`freesound HTTP ${resp.status}`);
  const data = await resp.json();
  const hit = (data.results || [])[0];
  if (!hit) throw new Error("no results");

  const preview = hit.previews["preview-hq-mp3"] || hit.previews["preview-lq-mp3"];
  const raw = path.join(OUT_DIR, `_raw_${name}.mp3`);
  const buf = Buffer.from(await (await fetch(preview)).arrayBuffer());
  fs.writeFileSync(raw, buf);
  const dest = path.join(OUT_DIR, `${name}.mp3`);
  await ffmpegNormalize(raw, dest);
  fs.unlinkSync(raw);
  return { name, file: `${name}.mp3`, source: "freesound", sourceId: hit.id, sourceName: hit.name, license: hit.license, rating: hit.avg_rating, downloads: hit.num_downloads, durationSec: hit.duration };
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const manifest = [];
  for (const [name, spec] of Object.entries(CUES)) {
    try {
      const entry = await fetchCue(name, spec);
      manifest.push(entry);
      console.log(`✓ ${name}  <- "${entry.sourceName}" (${entry.durationSec}s, ★${entry.rating}, ${entry.downloads} downloads, ${entry.license})`);
    } catch (e) {
      console.warn(`✗ ${name}: ${e.message}`);
    }
  }
  fs.writeFileSync(path.join(OUT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`\n${manifest.length}/${Object.keys(CUES).length} cues built into ${OUT_DIR}`);
})();
