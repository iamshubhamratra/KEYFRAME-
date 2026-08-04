// Disk janitor. Runs every 10 minutes:
//   1. Deletes jobs/<id>/ older than 1 hour (working dirs are debug-only after done).
//   2. Deletes public/videos/*.mp4 older than videoTtlHours.
//   3. If public/videos/ exceeds maxStorageMb, deletes oldest until under cap.

const fs = require("node:fs");
const path = require("node:path");
const config = require("../config");
const db = require("../db");

const INTERVAL_MS = 10 * 60 * 1000;
const JOB_DIR_TTL_MS = 60 * 60 * 1000;

function safeReaddir(dir) {
  try { return fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return []; }
}

function statOr(file) {
  try { return fs.statSync(file); } catch { return null; }
}

function rmDir(p) {
  try { fs.rmSync(p, { recursive: true, force: true }); }
  catch (e) { console.warn(`[janitor] rm failed for ${p}: ${e.message}`); }
}

function rmFile(p) {
  try { fs.unlinkSync(p); }
  catch (e) { console.warn(`[janitor] unlink failed for ${p}: ${e.message}`); }
}

function sweepJobDirs(now) {
  const entries = safeReaddir(config.paths.jobsDir);
  let removed = 0;
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const full = path.join(config.paths.jobsDir, ent.name);
    const st = statOr(full);
    if (!st) continue;
    if (now - st.mtimeMs > JOB_DIR_TTL_MS) {
      // Never delete a job still in flight or paused awaiting human script
      // approval — its dir holds the real website screenshots/assets it will
      // render from. Only terminal jobs (done/failed) and unknown/stale dirs
      // are debug junk safe to sweep.
      let job = null;
      try { job = db.getRaw(ent.name); } catch { /* unknown dir — sweep it */ }
      if (job && job.status !== "done" && job.status !== "failed") continue;
      rmDir(full);
      removed++;
    }
  }
  return removed;
}

// Reference-video uploads are only needed during intake (and for a possible
// regenerate-from-brief); 24 hours is generous.
const UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;

function sweepUploads(now) {
  const entries = safeReaddir(config.paths.uploadsDir);
  let removed = 0;
  for (const ent of entries) {
    if (!ent.isFile()) continue;
    const full = path.join(config.paths.uploadsDir, ent.name);
    const st = statOr(full);
    if (st && now - st.mtimeMs > UPLOAD_TTL_MS) {
      rmFile(full);
      removed++;
    }
  }
  return removed;
}

// The Website Asset Intelligence per-domain harvest cache lives OUTSIDE jobsDir
// (jobs/../harvest_cache/<sha1(origin)>/), so nothing else sweeps it — evict entries
// whose manifest.fetchedAt is past the harvester TTL (fall back to dir mtime).
function sweepHarvestCache(now) {
  const cacheDir = path.join(config.paths.jobsDir, "..", "harvest_cache");
  const ttlMs = (Number(config.harvester?.cacheTtlHours) || 168) * 60 * 60 * 1000;
  let removed = 0;
  for (const ent of safeReaddir(cacheDir)) {
    if (!ent.isDirectory()) continue;
    const full = path.join(cacheDir, ent.name);
    let fetchedAt = null;
    try { fetchedAt = JSON.parse(fs.readFileSync(path.join(full, "manifest.json"), "utf8")).fetchedAt; } catch { /* unreadable */ }
    const st = statOr(full);
    const age = now - (Number(fetchedAt) || (st ? st.mtimeMs : 0));
    if (age > ttlMs) { rmDir(full); removed++; }
  }
  return removed;
}

function sweepVideos(now) {
  const ttl = config.server.videoTtlHours * 60 * 60 * 1000;
  const entries = safeReaddir(config.paths.videosDir);
  const files = [];
  let totalBytes = 0;
  let removedTtl = 0;

  for (const ent of entries) {
    if (!ent.isFile() || !(ent.name.endsWith(".mp4") || ent.name.endsWith(".srt") || ent.name.endsWith(".vtt") || ent.name.endsWith(".jpg"))) continue;
    const full = path.join(config.paths.videosDir, ent.name);
    const st = statOr(full);
    if (!st) continue;
    if (now - st.mtimeMs > ttl) {
      rmFile(full);
      removedTtl++;
      continue;
    }
    files.push({ path: full, mtime: st.mtimeMs, size: st.size });
    totalBytes += st.size;
  }

  // Enforce total size cap.
  const capBytes = config.server.maxStorageMb * 1024 * 1024;
  let removedCap = 0;
  if (totalBytes > capBytes) {
    files.sort((a, b) => a.mtime - b.mtime); // oldest first
    while (totalBytes > capBytes && files.length) {
      const victim = files.shift();
      rmFile(victim.path);
      totalBytes -= victim.size;
      removedCap++;
    }
  }
  return { removedTtl, removedCap, totalBytes };
}

function runOnce() {
  const now = Date.now();
  try {
    const jobs = sweepJobDirs(now);
    const vids = sweepVideos(now);
    const uploads = sweepUploads(now);
    const harvestCache = sweepHarvestCache(now);
    let cachePruned = 0;
    try {
      const localDb = require("./asset_sources/local_db");
      const capMb = Number(config.assetProviders?.maxCacheMb) || 1024;
      cachePruned = localDb.prune(capMb * 1024 * 1024);
    } catch { /* cache module optional */ }
    if (jobs || vids.removedTtl || vids.removedCap || uploads || cachePruned || harvestCache) {
      console.log(`[janitor] swept jobs=${jobs} videosTtl=${vids.removedTtl} videosCap=${vids.removedCap} uploads=${uploads} harvestCache=${harvestCache} cachePruned=${cachePruned} bytes=${vids.totalBytes}`);
    }
  } catch (e) {
    console.error(`[janitor] sweep failed: ${e.message}`);
  }
}

function start() {
  // Run once at boot, then on interval.
  setTimeout(runOnce, 30_000).unref();
  const t = setInterval(runOnce, INTERVAL_MS);
  t.unref();
  return () => clearInterval(t);
}

module.exports = { start, runOnce };
