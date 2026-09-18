// VIDEO EDIT FRAME SAMPLER — which ≤ 24 frames of a video the vision model gets to see, and extracting them.
//
// WHY THIS EXISTS. Face boxes are the most expensive per-item analysis in the pipeline (one image ≈ the cost of a
// minute of STT) and the face track can only be as good as the frames it was built from. So the budget is small
// and spent deliberately (ANALYSIS.md §6):
//   N = min(maxFaceFrames, clamp(ceil(duration / 2.5), 8, 24)) frames, never more than the video has;
//   1. one frame 0.3 s into every shot (framing resets at cuts; a new shot may have a new subject),
//   2. a uniform floor across the whole video (no long stretch without a look),
//   3. the remaining budget at the highest-motion samples (signalstats YDIF from analysis/video.json) —
//      where the speaker moves, the track needs evidence;
//   frames closer than a minimum gap are merged, times snapped to real frame indices.
// Extraction is ONE ffmpeg run over the 540p proxy with `select='eq(n\,F1)+…'` (forced demuxer, file: path,
// -protocol_whitelist file) into a temp dir, then renamed to `work/frames/f<idx>.jpg`. Images are sized so the
// long edge never exceeds the payload guard's 640 px: landscape 384 px wide (the live-verified probe size),
// portrait 384 px wide capped at 640 px tall.
//
// CONTRACT:
//   frameBudget(durationSec, { maxFaceFrames=24, fps, frameCount }) -> N
//   planFrames({ durationSec, fps, video, maxFaceFrames }) -> [{ id:'A'…, idx, t, frame, reason:'scene'|'uniform'|'motion' }]
//   imageSize(width, height, { imageWidth=384, maxLongEdge=640 }) -> { width, height }   (even)
//   extractFrames({ projectDir, proxyRel='work/proxy540.mp4', frames, fps, width, height, imageWidth, runId, signal, pidFile,
//                   timeoutMs, lowPriority, threads }) -> [{ ...frame, file:'work/frames/f<idx>.jpg', width, height }]
//   FRAMES_DIR · SAMPLER_DEFAULTS

const fs = require("node:fs");
const path = require("node:path");
const { EditError } = require("../errors");
const fsx = require("../fsx");
const { letterId } = require("./islands");

const FRAMES_DIR = "work/frames";
const RUN_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const SAMPLER_DEFAULTS = Object.freeze({
  secondsPerFrame: 2.5, minFrames: 8, maxFrames: 24, sceneOffsetSec: 0.3, sceneShare: 0.6, motionShare: 0.25,
  imageWidth: 384, maxLongEdge: 640, jpegQ: 4,
});

const r3 = (x) => Math.round(x * 1000) / 1000;
const isPlain = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const even = (n) => Math.max(2, 2 * Math.round(n / 2));

function frameBudget(durationSec, { maxFaceFrames = SAMPLER_DEFAULTS.maxFrames, fps = 30, frameCount = null } = {}) {
  const D = Number(durationSec) > 0 ? Number(durationSec) : 0;
  if (!D) return 0;
  const base = Math.min(SAMPLER_DEFAULTS.maxFrames, Math.max(SAMPLER_DEFAULTS.minFrames, Math.ceil(D / SAMPLER_DEFAULTS.secondsPerFrame)));
  const cap = Number.isInteger(maxFaceFrames) && maxFaceFrames > 0 ? maxFaceFrames : SAMPLER_DEFAULTS.maxFrames;
  const frames = Number(frameCount) > 0 ? Number(frameCount) : Math.floor(D * (Number(fps) > 0 ? Number(fps) : 30));
  return Math.max(1, Math.min(base, cap, frames));
}

function planFrames({ durationSec, fps = 30, video = null, maxFaceFrames = SAMPLER_DEFAULTS.maxFrames } = {}) {
  const D = Number(durationSec) > 0 ? Number(durationSec) : Number(video && video.durationSec) || 0;
  const F = Number(fps) > 0 ? Number(fps) : Number(video && video.fps) > 0 ? Number(video.fps) : 30;
  const totalFrames = Math.max(1, Math.floor(D * F));
  const N = frameBudget(D, { maxFaceFrames, fps: F, frameCount: totalFrames });
  if (!N) return [];
  const lastT = Math.max(0, (totalFrames - 1) / F);
  const minGap = Math.max(1 / F, Math.min(1.0, (0.4 * D) / N));
  const picked = [];
  const tooClose = (t) => picked.some((p) => Math.abs(p.t - t) < minGap);
  const add = (t, reason) => {
    if (picked.length >= N) return false;
    const tt = Math.max(0, Math.min(lastT, t));
    if (tooClose(tt)) return false;
    picked.push({ t: tt, reason });
    return true;
  };

  // 1. scene starts (+0.3 s, never past the shot's middle); the longest shots first when there are too many.
  const scenes = isPlain(video) && Array.isArray(video.scenes) ? video.scenes.filter((s) => isPlain(s) && Number(s.end) > Number(s.start)) : [];
  const sceneCap = Math.max(1, Math.ceil(N * SAMPLER_DEFAULTS.sceneShare));
  const byLength = scenes.slice().sort((a, b) => (b.end - b.start) - (a.end - a.start) || a.start - b.start).slice(0, sceneCap);
  for (const s of byLength.sort((a, b) => a.start - b.start)) {
    add(Math.min(Number(s.start) + SAMPLER_DEFAULTS.sceneOffsetSec, (Number(s.start) + Number(s.end)) / 2), "scene");
  }
  if (!picked.length) add(Math.min(SAMPLER_DEFAULTS.sceneOffsetSec, D / 2), "scene");

  // 2. uniform floor, leaving ~a quarter of the budget for motion.
  const motionReserve = Math.floor(N * SAMPLER_DEFAULTS.motionShare);
  const uniformCount = Math.max(0, N - picked.length - motionReserve);
  for (let k = 0; k < uniformCount; k++) add(((k + 0.5) * D) / uniformCount, "uniform");

  // 3. highest-motion samples.
  const ydif = isPlain(video) && Array.isArray(video.ydif) ? video.ydif.filter((s) => isPlain(s) && Number.isFinite(Number(s.t)) && Number.isFinite(Number(s.v))) : [];
  for (const s of ydif.slice().sort((a, b) => b.v - a.v || a.t - b.t)) {
    if (picked.length >= N) break;
    add(Number(s.t), "motion");
  }
  // 4. still short (no motion data, tiny clip): fill the largest gaps.
  for (let guard = 0; picked.length < N && guard < N * 4; guard++) {
    const ts = [0, ...picked.map((p) => p.t).sort((a, b) => a - b), lastT];
    let best = null;
    for (let i = 0; i + 1 < ts.length; i++) if (!best || ts[i + 1] - ts[i] > best.gap) best = { gap: ts[i + 1] - ts[i], mid: (ts[i] + ts[i + 1]) / 2 };
    if (!best || best.gap < 2 / F) break;
    if (!add(best.mid, "uniform")) picked.push({ t: best.mid, reason: "uniform" });
  }

  const seen = new Set();
  const out = [];
  for (const p of picked.sort((a, b) => a.t - b.t)) {
    const frame = Math.max(0, Math.min(totalFrames - 1, Math.round(p.t * F)));
    if (seen.has(frame)) continue;
    seen.add(frame);
    out.push({ frame, t: r3(frame / F), reason: p.reason });
  }
  return out.map((f, idx) => ({ id: letterId(idx), idx, ...f }));
}

function imageSize(width, height, { imageWidth = SAMPLER_DEFAULTS.imageWidth, maxLongEdge = SAMPLER_DEFAULTS.maxLongEdge } = {}) {
  const W = Number(width) > 0 ? Number(width) : 16;
  const H = Number(height) > 0 ? Number(height) : 9;
  const iw = Math.min(Number(imageWidth) > 0 ? Number(imageWidth) : SAMPLER_DEFAULTS.imageWidth, maxLongEdge);
  let w = iw;
  let h = (iw * H) / W;
  if (h > maxLongEdge) { h = maxLongEdge; w = (maxLongEdge * W) / H; }
  return { width: even(w), height: even(h) };
}

async function extractFrames({
  projectDir, proxyRel = "work/proxy540.mp4", frames, fps = 30, width, height, imageWidth = SAMPLER_DEFAULTS.imageWidth,
  runId = "run", signal = null, pidFile, timeoutMs, lowPriority = false, threads = null,
} = {}) {
  const proc = require("../engine/proc");
  if (!Array.isArray(frames) || !frames.length) return [];
  if (!RUN_ID_RE.test(String(runId))) throw new EditError("FRAMES_BAD_INPUT", { errorClass: "bug", stage: "ANALYZING_VIDEO", detail: "runId" });
  const proxyAbs = fsx.resolveInside(projectDir, proxyRel);
  if (!fs.existsSync(proxyAbs)) throw new EditError("PROXY_MISSING", { status: 409, errorClass: "resource", retryable: true, stage: "ANALYZING_VIDEO", detail: "proxy missing" });
  const size = imageSize(width, height, { imageWidth });
  const sorted = frames.slice().sort((a, b) => a.frame - b.frame);
  const tmpRel = `${FRAMES_DIR}/tmp.${runId}`;
  const tmpAbs = fsx.resolveInside(projectDir, tmpRel);
  const outDir = fsx.resolveInside(projectDir, FRAMES_DIR);
  await fsx.rmWithRetry(tmpAbs, { attempts: 3 });
  fsx.ensureDir(tmpAbs);
  const select = sorted.map((f) => `eq(n\\,${Math.max(0, Math.floor(f.frame))})`).join("+");
  const args = [
    "-protocol_whitelist", "file", "-f", "mov", "-i", `file:${proxyRel.split(path.sep).join("/")}`, "-an", "-sn", "-dn",
    "-vf", `select='${select}',scale=${size.width}:${size.height}:flags=bicubic,setsar=1`,
    "-fps_mode", "passthrough", "-frames:v", String(sorted.length), "-q:v", String(SAMPLER_DEFAULTS.jpegQ),
  ];
  if (threads) args.push("-threads", String(threads));
  args.push(`file:${tmpRel}/s%03d.jpg`);
  try {
    await proc.ffmpeg(args, {
      cwd: projectDir, signal, pidFile, lowPriority, label: "frame-sampler", stage: "ANALYZING_VIDEO",
      timeoutMs: timeoutMs || 120000,
    });
    const produced = fs.readdirSync(tmpAbs).filter((n) => /^s\d{3}\.jpg$/.test(n)).sort();
    const out = [];
    for (let k = 0; k < Math.min(produced.length, sorted.length); k++) {
      const f = sorted[k];
      const rel = `${FRAMES_DIR}/f${String(f.idx).padStart(3, "0")}.jpg`;
      const dest = fsx.resolveInside(projectDir, rel);
      try { fs.unlinkSync(dest); } catch { /* not there */ }
      fsx.renameWithRetrySync(path.join(tmpAbs, produced[k]), dest);
      out.push({ ...f, file: rel, width: size.width, height: size.height });
    }
    if (outDir) fsx.ensureDir(outDir);
    return out.sort((a, b) => a.idx - b.idx);
  } finally {
    await fsx.rmWithRetry(tmpAbs, { attempts: 3 });
  }
}

module.exports = { frameBudget, planFrames, imageSize, extractFrames, FRAMES_DIR, SAMPLER_DEFAULTS };
