// RESUMABLE full-gallery preview rebuild.
//
// build-previews.js rebuilds every pack in one process. That is fine for a
// handful of packs and wrong for all 203: the run takes hours, and a single
// interruption (a killed shell, a machine sleep, a crash on pack 5 of 203)
// loses everything done so far with no way to continue except starting over.
// One such run died at pack 5 with exit 127 — the pack itself rebuilt fine on
// its own, so nothing was wrong with the work, only with betting hours of it on
// one uninterrupted process.
//
// This drives build-previews.js ONE PACK PER CHILD PROCESS and treats the output
// files as the progress ledger: a pack counts as done when its preview.mp4 is
// newer than the pass stamp. So re-running after any interruption picks up
// exactly where it stopped, and a crash costs one pack instead of the run.
//
//   node scripts/rebuild-previews.js          # start (or resume) a pass
//   node scripts/rebuild-previews.js --fresh  # forget the stamp, rebuild all
//   node scripts/rebuild-previews.js --status # what is left, no building
//
// Verification is part of the job, not an afterthought: build-previews reports
// "ok" on a write that produced an UNPLAYABLE file (measured — one preview came
// out 1.5MB with no moov atom and was still counted a success). Every clip is
// probed after it is written, and a pack that does not decode is retried once
// and then reported.

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const FRAMES = path.join(ROOT, "..", "frames");
const PUBLIC = path.join(ROOT, "public", "frames");
const STAMP = path.join(ROOT, "framecheck", "preview-pass.json");

const args = process.argv.slice(2);
const fresh = args.includes("--fresh");
const statusOnly = args.includes("--status");

function packs() {
  return fs.readdirSync(FRAMES)
    .filter((d) => fs.existsSync(path.join(FRAMES, d, "pack.json")))
    .sort();
}

function stamp() {
  if (!fresh) {
    try { return JSON.parse(fs.readFileSync(STAMP, "utf8")).startedAt; } catch { /* first run */ }
  }
  const startedAt = Date.now();
  fs.mkdirSync(path.dirname(STAMP), { recursive: true });
  fs.writeFileSync(STAMP, JSON.stringify({ startedAt }, null, 2), "utf8");
  return startedAt;
}

/** Done = the clip exists, is newer than the pass, and actually decodes. */
function doneSince(pack, since) {
  const mp4 = path.join(PUBLIC, pack, "preview.mp4");
  let st;
  try { st = fs.statSync(mp4); } catch { return false; }
  if (st.mtimeMs < since) return false;
  return probe(mp4) != null;
}

/** Duration in seconds, or null when the file will not decode. */
function probe(mp4) {
  const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", mp4],
    { encoding: "utf8", windowsHide: true });
  const d = parseFloat(String(r.stdout || "").trim());
  return isFinite(d) && d > 0 ? d : null;
}

function build(pack) {
  const r = spawnSync(process.execPath, [path.join(__dirname, "build-previews.js"), pack],
    { encoding: "utf8", windowsHide: true, cwd: ROOT });
  return r.status === 0;
}

const since = stamp();
const list = packs();
const todo = list.filter((p) => !doneSince(p, since));

console.log(`[rebuild] ${list.length} pack(s); ${list.length - todo.length} already done this pass; ${todo.length} to go`);
if (statusOnly) { console.log(todo.join(", ")); process.exit(0); }

const failed = [];
let n = 0;
for (const pack of todo) {
  n++;
  const t0 = Date.now();
  let ok = build(pack);
  let dur = ok ? probe(path.join(PUBLIC, pack, "preview.mp4")) : null;
  if (ok && dur == null) {
    // Written but unplayable — the exact failure build-previews counts as success.
    console.log(`[rebuild] ${pack}: wrote an UNPLAYABLE clip, retrying once`);
    ok = build(pack);
    dur = ok ? probe(path.join(PUBLIC, pack, "preview.mp4")) : null;
  }
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  if (dur != null) {
    console.log(`[rebuild] ${String(n).padStart(3)}/${todo.length} ${pack} ✓ ${dur.toFixed(1)}s clip (${secs}s)`);
  } else {
    failed.push(pack);
    console.log(`[rebuild] ${String(n).padStart(3)}/${todo.length} ${pack} ✗ FAILED (${secs}s)`);
  }
}

console.log(`[rebuild] pass complete: ${todo.length - failed.length} built, ${failed.length} failed`);
if (failed.length) {
  console.log(`[rebuild] failed: ${failed.join(", ")}`);
  process.exit(1);
}
