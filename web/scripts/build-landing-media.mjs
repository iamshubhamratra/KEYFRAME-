// Builds the landing page's real video clips (web/public/landing/*.mp4 + .jpg).
//
// The landing (public/design.html) is a static doc served by the FRONTEND host,
// so on the Vercel/Render split it cannot reach the backend's /frames or
// /videos — every clip it shows has to ship inside web/public. This cuts a short
// muted loop out of each source (a template's preview.mp4, or a film the
// pipeline really rendered), re-encodes it small for autoplay grids, and grabs a
// poster from the same window.
//
// The curated list lives in ./landing-media.json:
//   { "out": "wall-slow-pour", "src": "frames/slow-pour/preview.mp4",
//     "segments": [[3.5, 14.5]], "width": 854 }
// Optional "poster": source second for the still (default 1.5s into segment 0).
// `src` is relative to server/public. `segments` are [start, end] seconds joined
// in order — several segments splice a template's strong beats together and
// skip the weak ones between them (most previews hold a grey placeholder
// screen or a long static end card). `width` is the output width (height keeps
// aspect). Run from web/:  npm run build:landing-media [-- <out> ...]
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const SERVER_PUBLIC = path.resolve(here, "../../server/public");
const OUT_DIR = path.resolve(here, "../public/landing");
const clips = JSON.parse(fs.readFileSync(path.join(here, "landing-media.json"), "utf8"));
const only = new Set(process.argv.slice(2));

function ff(args) {
  const r = spawnSync("ffmpeg", ["-v", "error", "-y", ...args], { encoding: "utf8" });
  if (r.status !== 0) throw new Error((r.stderr || "").trim() || `ffmpeg exited ${r.status}`);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
let built = 0;
const failed = [];
for (const c of clips) {
  if (only.size && !only.has(c.out)) continue;
  const src = path.join(SERVER_PUBLIC, c.src);
  const mp4 = path.join(OUT_DIR, `${c.out}.mp4`);
  const jpg = path.join(OUT_DIR, `${c.out}.jpg`);
  try {
    if (!fs.existsSync(src)) throw new Error(`missing source ${src}`);
    const segs = c.segments;
    if (!Array.isArray(segs) || !segs.length || segs.some((s) => !(s[1] > s[0]))) throw new Error("bad segments");
    const scale = `scale=${c.width}:-2:flags=lanczos`;
    // Each segment is trimmed and re-timed to 0, then the pieces are concatenated.
    // -an because every landing clip autoplays muted (a silent track would only
    // add bytes); faststart so playback begins before the download finishes.
    const graph = segs.map(([a, b], i) =>
      `[0:v]trim=start=${a}:end=${b},setpts=PTS-STARTPTS,${scale},fps=30,format=yuv420p[s${i}]`).join(";")
      + ";" + segs.map((_, i) => `[s${i}]`).join("") + `concat=n=${segs.length}:v=1:a=0[out]`;
    ff(["-i", src, "-filter_complex", graph, "-map", "[out]", "-an",
      "-c:v", "libx264", "-preset", "slow", "-crf", String(c.crf || 28), "-profile:v", "high",
      "-movflags", "+faststart", mp4]);
    // Poster = a settled frame (templates open on an entrance wipe or fade, and
    // headlines get light-sweep glints, so the very first frames make a poor
    // poster). `poster` pins an exact source second when a reviewed frame is
    // known to be clean; otherwise 1.5s into the first segment.
    const posterT = c.poster ?? Math.min(segs[0][0] + 1.5, segs[0][1] - 0.1);
    ff(["-ss", String(posterT), "-i", src, "-frames:v", "1", "-vf", scale, "-q:v", "5", jpg]);
    const kb = (f) => Math.round(fs.statSync(f).size / 1024);
    const secs = segs.reduce((n, [a, b]) => n + (b - a), 0);
    console.log(`${c.out.padEnd(26)} ${secs.toFixed(1).padStart(5)}s ${String(kb(mp4)).padStart(5)} KB  poster ${kb(jpg)} KB`);
    built++;
  } catch (e) {
    failed.push(c.out);
    console.error(`${c.out}: ${e.message}`);
  }
}
console.log(`built ${built} clip(s)${failed.length ? `, FAILED: ${failed.join(", ")}` : ""}`);
if (failed.length) process.exitCode = 1;
