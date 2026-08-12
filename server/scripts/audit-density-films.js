// CENSUS OVER REAL FILMS — the control for the preview census.
//
// audit-density.js scans pack PREVIEWS, which are built with thin demo copy and
// few or no assets. That makes its 57-of-81 result ambiguous: it could be packs
// that lay out badly, or it could be previews starved of content. Same metric,
// same thresholds, run over films that had a real brief, real assets and real
// scene timings, tells us which.
//
// Scene boundaries come from each job's own script, so every sample lands 60%
// into a real scene instead of blind every-3-seconds — the same input the
// pipeline gate gets, and the reason this is the trustworthy number of the two.
//
//   node scripts/audit-density-films.js

const fs = require("node:fs");
const path = require("node:path");
const { scanFilm } = require("../src/services/frame_density");

const ROOT = path.join(__dirname, "..");
const VIDEOS = path.join(ROOT, "public", "videos");

function scenesOf(job) {
  let s = job.script;
  if (typeof s === "string") { try { s = JSON.parse(s); } catch { return null; } }
  const list = s && (s.scenes || s.beats);
  if (!Array.isArray(list) || !list.length) return null;
  const out = list
    .map((x, i) => ({ id: x.id != null ? x.id : i + 1, start: Number(x.start), duration: Number(x.duration) }))
    .filter((x) => isFinite(x.start) && isFinite(x.duration) && x.duration > 0);
  return out.length ? out : null;
}

(async () => {
  let jobs;
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(ROOT, "jobs.json"), "utf8"));
    jobs = Array.isArray(raw) ? raw : Object.values(raw);
  } catch (e) { console.error("cannot read jobs.json:", e.message); process.exit(2); }

  const rows = [];
  for (const job of jobs) {
    if (!job || !job.id) continue;
    const mp4 = path.join(VIDEOS, `${job.id}.mp4`);
    if (!fs.existsSync(mp4)) continue;
    const scenes = scenesOf(job);
    const portrait = !(Number(job.width) >= Number(job.height));
    let res = null;
    try { res = await scanFilm(mp4, { scenes: scenes || [], portrait, durationSec: job.duration }); }
    catch (e) { continue; }
    if (!res || !res.frames.length) continue;
    const ink = res.frames.map((f) => f.inkRatio);
    rows.push({
      id: job.id,
      pack: job.frame_pack || "(auto)",
      scenes: scenes ? scenes.length : 0,
      sampled: res.frames.length,
      meanInk: ink.reduce((a, b) => a + b, 0) / ink.length,
      sparse: res.findings.length,
      worst: res.findings[0] ? res.findings[0].why : "",
    });
  }

  if (!rows.length) { console.log("no rendered films with jobs.json records found"); return; }
  rows.sort((a, b) => b.sparse - a.sparse || a.meanInk - b.meanInk);

  console.log("film".padEnd(13) + "pack".padEnd(20) + "sc".padEnd(4) + "smp".padEnd(5) + "ink".padEnd(6) + "sparse");
  console.log("-".repeat(62));
  for (const r of rows) {
    console.log(r.id.padEnd(13) + String(r.pack).slice(0, 19).padEnd(20)
      + String(r.scenes).padEnd(4) + String(r.sampled).padEnd(5)
      + `${Math.round(r.meanInk * 100)}%`.padEnd(6) + (r.sparse || ""));
  }
  const withScenes = rows.filter((r) => r.scenes > 0);
  const flagged = rows.filter((r) => r.sparse);
  const sceneFlagged = withScenes.filter((r) => r.sparse);
  console.log("-".repeat(62));
  console.log(`${rows.length} real film(s); ${flagged.length} with sparse scene(s)`);
  if (withScenes.length) {
    console.log(`of the ${withScenes.length} with REAL scene boundaries: ${sceneFlagged.length} sparse `
      + `(${Math.round((sceneFlagged.length / withScenes.length) * 100)}%)`);
  }
  const mean = rows.reduce((a, r) => a + r.meanInk, 0) / rows.length;
  console.log(`real-film mean ink coverage: ${Math.round(mean * 100)}%   (preview census measured 24%)`);
  const worst = flagged.slice(0, 5);
  if (worst.length) {
    console.log("\nworst:");
    for (const w of worst) console.log(`  ${w.id} [${w.pack}] — ${w.worst}`);
  }
})();
