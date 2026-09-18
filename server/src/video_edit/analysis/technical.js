// VIDEO EDIT TECHNICAL VIDEO ANALYSIS — the ffmpeg half of ANALYZING_VIDEO (ANALYSIS.md §6).
//
// WHY THIS EXISTS. The director, framing and QA need facts about the footage that no model should be
// paid for: where the shots change (framing resets, jump-cut alternation), black and frozen stretches
// (never cut to them, QA excludes them), letterboxing (crop math), exposure and motion (shaky ranges
// get no punch-ins; the frame sampler spends its budget on high-motion frames). One ffmpeg pass over
// the 540p proxy computes all of it with scdet / blackdetect / freezedetect / cropdetect / signalstats
// writing `metadata=print` files that are parsed here. Inputs are forced-demuxer `file:` paths with
// `-protocol_whitelist file` (ENGINE.md §4.8); temp files live in `analysis/tech.tmp.<runId>/`.
//
// CONTRACT:
//   analyzeTechnical({ projectDir, proxyRel='work/proxy540.mp4', durationSec?, width?, height?, fps?, runId, signal, pidFile,
//                      timeoutMs, onProgress, lowPriority, threads, write=true })
//       -> { video (analysis/video.json body), discoveries:{ sceneCount, letterbox }, outputs:{ video:{path} } }
//   video = { schemaVersion, durationSec, width, height, fps, sampleStepSec, scenes:[{start,end,score}], sceneChanges:[{t,score}],
//             black:[{start,end,dur}], freezes:[{start,end,dur}], letterbox:{top,bottom,left,right,crop,detected}|null,
//             exposure:{ yavgMean, yavgP10, yavgP90, satavgMean, underexposed, overexposed, jumps:[{t, from, to}] },
//             ydif:[{t, v}], shaky:[{start, end, meanYdif}] }
//   parseMetadataPrint(text) -> [{ frame, pts, t, kv }]
//   summarizeTechnical({ sceneFrames, signalFrames, cropFrames, durationSec, width, height, fps }) -> video   (pure)
//   VIDEO_REL · SCENE_THRESHOLD

const fs = require("node:fs");
const path = require("node:path");
const { EditError } = require("../errors");
const fsx = require("../fsx");
const dsp = require("./dsp");

const VIDEO_REL = "analysis/video.json";
const SCENE_THRESHOLD = 10;
const SIGNAL_EVERY = 5;
const CROP_EVERY = 15;
const RUN_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

const r3 = (x) => Math.round(x * 1000) / 1000;
const r2 = (x) => Math.round(x * 100) / 100;

function parseMetadataPrint(text) {
  const frames = [];
  let cur = null;
  for (const line of String(text || "").split(/\r?\n/)) {
    const head = /^frame:(\d+)\s+pts:(-?\d+)\s+pts_time:(-?[\d.]+)/.exec(line);
    if (head) {
      cur = { frame: Number(head[1]), pts: Number(head[2]), t: Number(head[3]), kv: {} };
      frames.push(cur);
      continue;
    }
    const kv = /^([\w.]+)=(.*)$/.exec(line.trim());
    if (kv && cur) {
      const v = Number(kv[2]);
      cur.kv[kv[1]] = Number.isFinite(v) ? v : kv[2];
    }
  }
  return frames;
}

function pairRanges(frames, startKey, endKey, durationSec) {
  const out = [];
  let open = null;
  for (const f of frames) {
    if (f.kv[startKey] != null && open == null) open = Number(f.kv[startKey]);
    if (f.kv[endKey] != null && open != null) {
      const end = Number(f.kv[endKey]);
      if (end > open) out.push({ start: r3(open), end: r3(end), dur: r3(end - open) });
      open = null;
      if (f.kv[startKey] != null && Number(f.kv[startKey]) >= end) open = Number(f.kv[startKey]);
    }
  }
  if (open != null && durationSec > open) out.push({ start: r3(open), end: r3(durationSec), dur: r3(durationSec - open), open: true });
  return out;
}

function summarizeTechnical({ sceneFrames = [], signalFrames = [], cropFrames = [], durationSec, width = null, height = null, fps = 30 }) {
  const D = Number(durationSec) || 0;
  const sceneChanges = sceneFrames
    .filter((f) => f.kv["lavfi.scd.time"] != null && Number(f.kv["lavfi.scd.time"]) > 0)
    .map((f) => ({ t: r3(Number(f.kv["lavfi.scd.time"])), score: r2(Number(f.kv["lavfi.scd.score"]) || 0) }));
  const scenes = [];
  let s0 = 0, score0 = 0;
  for (const c of sceneChanges) {
    if (c.t - s0 < 1 / fps) continue;
    scenes.push({ start: r3(s0), end: c.t, score: score0 });
    s0 = c.t; score0 = c.score;
  }
  if (D > s0 || !scenes.length) scenes.push({ start: r3(s0), end: r3(Math.max(D, s0)), score: score0 });

  const black = pairRanges(sceneFrames, "lavfi.black_start", "lavfi.black_end", D);
  const freezes = pairRanges(sceneFrames, "lavfi.freezedetect.freeze_start", "lavfi.freezedetect.freeze_end", D);

  let letterbox = null;
  const lastCrop = [...cropFrames].reverse().find((f) => f.kv["lavfi.cropdetect.x2"] != null);
  if (lastCrop && width > 0 && height > 0) {
    const k = lastCrop.kv;
    const x1 = Number(k["lavfi.cropdetect.x1"]), x2 = Number(k["lavfi.cropdetect.x2"]);
    const y1 = Number(k["lavfi.cropdetect.y1"]), y2 = Number(k["lavfi.cropdetect.y2"]);
    if (x2 > x1 && y2 > y1) {
      const top = y1, bottom = Math.max(0, height - 1 - y2), left = x1, right = Math.max(0, width - 1 - x2);
      letterbox = {
        top, bottom, left, right,
        crop: { x: Number(k["lavfi.cropdetect.x"]), y: Number(k["lavfi.cropdetect.y"]), w: Number(k["lavfi.cropdetect.w"]), h: Number(k["lavfi.cropdetect.h"]) },
        detected: top + bottom >= 0.04 * height || left + right >= 0.04 * width,
      };
    }
  }

  const samples = signalFrames
    .filter((f) => f.kv["lavfi.signalstats.YAVG"] != null)
    .map((f) => ({ t: r3(f.t), yavg: Number(f.kv["lavfi.signalstats.YAVG"]), ydif: Number(f.kv["lavfi.signalstats.YDIF"]) || 0, satavg: Number(f.kv["lavfi.signalstats.SATAVG"]) || 0 }));
  const yavgs = samples.map((s) => s.yavg);
  const nearScene = (t, win = 0.25) => sceneChanges.some((c) => Math.abs(c.t - t) <= win);
  const inBlack = (t) => black.some((b) => t >= b.start - 0.1 && t <= b.end + 0.1);
  const jumps = [];
  for (let i = 1; i < samples.length; i++) {
    const d = samples[i].yavg - samples[i - 1].yavg;
    if (Math.abs(d) >= 35 && !nearScene(samples[i].t) && !inBlack(samples[i].t)) jumps.push({ t: samples[i].t, from: r2(samples[i - 1].yavg), to: r2(samples[i].yavg) });
  }
  const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
  const yavgMean = mean(yavgs);
  const exposure = {
    yavgMean: yavgMean == null ? null : r2(yavgMean), yavgP10: yavgs.length ? r2(dsp.percentile(yavgs, 0.1)) : null,
    yavgP90: yavgs.length ? r2(dsp.percentile(yavgs, 0.9)) : null, satavgMean: samples.length ? r2(mean(samples.map((s) => s.satavg))) : null,
    underexposed: yavgMean != null && yavgMean < 50, overexposed: yavgMean != null && yavgMean > 205, jumps: jumps.slice(0, 50),
  };

  // shaky: 1 s windows whose mean YDIF reaches the P90 (and an absolute floor), with no scene change or black inside
  const shaky = [];
  const ydifVals = samples.map((s) => s.ydif);
  if (samples.length >= 6) {
    const thr = Math.max(dsp.percentile(ydifVals, 0.9), 6);
    const ranges = [];
    for (let i = 0; i < samples.length; i++) {
      const t0 = samples[i].t;
      let j = i, sum = 0, cnt = 0;
      while (j < samples.length && samples[j].t < t0 + 1 - 1e-6) { sum += samples[j].ydif; cnt++; j++; }
      if (cnt < 3 || samples[j - 1].t - t0 < 0.5) continue;
      const t1 = r3(Math.min(D || Infinity, t0 + 1));
      if (sum / cnt < thr) continue;
      if (sceneChanges.some((c) => c.t >= t0 - 0.25 && c.t <= t1 + 0.25)) continue;
      if (black.some((b) => b.start < t1 && b.end > t0)) continue;
      ranges.push({ start: t0, end: t1, sum, cnt });
    }
    for (const r of ranges) {
      const last = shaky[shaky.length - 1];
      if (last && r.start <= last.end + 1e-6) { last.end = Math.max(last.end, r.end); last._s += r.sum; last._c += r.cnt; }
      else shaky.push({ start: r.start, end: r.end, _s: r.sum, _c: r.cnt });
    }
    for (const s of shaky) { s.meanYdif = r2(s._s / s._c); delete s._s; delete s._c; }
  }

  return {
    schemaVersion: 1, durationSec: r3(D), width, height, fps, sampleStepSec: r3(SIGNAL_EVERY / fps),
    scenes, sceneChanges, black, freezes, letterbox, exposure,
    ydif: samples.map((s) => ({ t: s.t, v: r2(s.ydif) })), shaky,
  };
}

async function probeProxy(proxyRel, { cwd, signal, pidFile }) {
  const proc = require("../engine/proc");
  const j = await proc.ffprobeJson(["-protocol_whitelist", "file", "-f", "mov", "-show_format", "-show_streams", "-of", "json", `file:${proxyRel}`],
    { cwd, signal, pidFile, timeoutMs: 20000, label: "tech-probe", stage: "ANALYZING_VIDEO" });
  const v = Array.isArray(j.streams) ? j.streams.find((s) => s && s.codec_type === "video") : null;
  const rate = v && typeof v.avg_frame_rate === "string" ? v.avg_frame_rate.split("/").map(Number) : null;
  return {
    durationSec: Number(j.format && j.format.duration) || Number(v && v.duration) || 0,
    width: v ? Number(v.width) : null, height: v ? Number(v.height) : null,
    fps: rate && rate[1] ? rate[0] / rate[1] : 30,
  };
}

async function analyzeTechnical({
  projectDir, proxyRel = "work/proxy540.mp4", durationSec, width, height, fps, runId = "run", signal = null, pidFile,
  timeoutMs, onProgress, lowPriority = false, threads = null, write = true,
} = {}) {
  const proc = require("../engine/proc");
  if (!RUN_ID_RE.test(String(runId))) throw new EditError("TECH_BAD_INPUT", { errorClass: "bug", stage: "ANALYZING_VIDEO", detail: "runId" });
  const proxyAbs = fsx.resolveInside(projectDir, proxyRel);
  if (!fs.existsSync(proxyAbs)) throw new EditError("PROXY_MISSING", { status: 409, errorClass: "resource", retryable: true, stage: "ANALYZING_VIDEO", detail: "proxy missing" });
  const rel = proxyRel.split(path.sep).join("/");
  let facts = { durationSec, width, height, fps };
  if (!(durationSec > 0) || !(width > 0) || !(height > 0)) facts = { ...(await probeProxy(rel, { cwd: projectDir, signal, pidFile })), ...Object.fromEntries(Object.entries(facts).filter(([, v]) => v > 0)) };
  const F = facts.fps > 0 ? facts.fps : 30;

  const tmpRel = `analysis/tech.tmp.${runId}`;
  const tmpAbs = fsx.resolveInside(projectDir, tmpRel);
  fsx.ensureDir(tmpAbs);
  const files = { scene: `${tmpRel}/scene.txt`, signal: `${tmpRel}/signal.txt`, crop: `${tmpRel}/crop.txt` };
  const graph = [
    "[0:v:0]split=3[a][b][c]",
    `[a]scdet=threshold=${SCENE_THRESHOLD},blackdetect=d=0.3:pix_th=0.10,freezedetect=n=-60dB:d=1,metadata=mode=print:file=${files.scene}[o]`,
    `[b]select=not(mod(n\\,${SIGNAL_EVERY})),signalstats,metadata=mode=print:file=${files.signal},nullsink`,
    `[c]select=not(mod(n\\,${CROP_EVERY})),cropdetect=round=2,metadata=mode=print:file=${files.crop},nullsink`,
  ].join(";");
  const args = ["-protocol_whitelist", "file", "-f", "mov", "-i", `file:${rel}`, "-an", "-sn", "-dn", "-filter_complex", graph, "-map", "[o]"];
  if (threads) args.push("-threads", String(threads));
  args.push("-f", "null", "-");
  try {
    await proc.ffmpeg(args, {
      cwd: projectDir, signal, pidFile, lowPriority, label: "tech-analysis", stage: "ANALYZING_VIDEO",
      timeoutMs: timeoutMs || Math.max(60000, facts.durationSec * 3000),
      expectedDurationSec: facts.durationSec || undefined,
      onProgress: typeof onProgress === "function" ? (pct) => onProgress(Math.min(95, pct * 0.95)) : undefined,
    });
    const read = (f) => { try { return fs.readFileSync(fsx.resolveInside(projectDir, f), "utf8"); } catch { return ""; } };
    const video = summarizeTechnical({
      sceneFrames: parseMetadataPrint(read(files.scene)), signalFrames: parseMetadataPrint(read(files.signal)),
      cropFrames: parseMetadataPrint(read(files.crop)), durationSec: facts.durationSec, width: facts.width, height: facts.height, fps: r3(F),
    });
    if (write) fsx.writeJsonAtomic(fsx.resolveInside(projectDir, VIDEO_REL), video);
    if (typeof onProgress === "function") { try { onProgress(100); } catch { /* enhancement */ } }
    return {
      video,
      discoveries: { sceneCount: video.scenes.length, letterbox: !!(video.letterbox && video.letterbox.detected) },
      outputs: { video: { path: VIDEO_REL } },
    };
  } finally {
    await fsx.rmWithRetry(tmpAbs, { attempts: 3 });
  }
}

module.exports = { analyzeTechnical, summarizeTechnical, parseMetadataPrint, VIDEO_REL, SCENE_THRESHOLD };
