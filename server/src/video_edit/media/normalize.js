// VIDEO EDIT NORMALIZE — turn whatever the user uploaded into the one shape the engine edits.
//
// WHY THIS EXISTS. Every later stage (transcription chunks, face sampling, cut rendering, QA frame
// grabs) is far simpler and more exact when it can assume ONE source format: an H.264 yuv420p,
// square-pixel, unrotated, progressive, SDR, constant-30-fps MP4 whose long edge is ≤1920 and whose
// timeline starts at 0. Phones deliver rotated HEVC at 29.97 VFR, cameras deliver interlaced or HDR
// footage, screen recorders deliver odd dimensions. So COMPRESSING produces, once:
//   work/mezz.mp4       the edit master (x264 veryfast crf 18, g 30, AAC 48 kHz stereo, faststart)
//   work/voice48k.wav   pcm_s16le 48 kHz mono, for the voice stem and loudness work
//   work/audio16k.wav   pcm_s16le 16 kHz mono, for VAD and STT chunking
//   work/proxy540.mp4   short edge 540 (ultrafast crf 26, g 15), the only video the browser plays
//   work/poster.jpg     the brightest of 5 sampled frames, long edge 640
// Mezzanine and wavs come out of one decode through one filter graph, so they share a timeline
// sample-for-sample. All metadata and chapters are dropped (-map_metadata -1, -map_chapters -1),
// so no GPS or device tag survives into anything the engine serves. Every output is written as
// `*.tmp.<runId>.*` and renamed only after its pass succeeds; a crash leaves temp files, never a
// half-written final (ENGINE.md §3.4 I4). Temp files of this run are removed in `finally`.
//
// CONTRACT (ENGINE.md §4 step 7):
//   normalizeSource({ projectDir, sourceRel='source/original.bin', demuxer, probe, runId, signal, onProgress,
//                     settings, project, tolerant=false, threads, timeoutMs })
//     -> Promise<{ copied, mezz:{ path, sha256, width, height, fps, durationSec }, proxy:{ path },
//                  voice48k:{ path }, audio16k:{ path }, poster:{ path } }>      (paths relative to projectDir)
//     onProgress(pct 0..100, { step: 'mezz'|'proxy'|'poster' }) is monotonic.
//     Errors: engine/proc codes (PROC_EXIT transient, PROC_TIMEOUT, PROC_STALL, PROC_ABORTED),
//     INSUFFICIENT_STORAGE 507 on ENOSPC, UNDECODABLE (input) when a `tolerant` retry still hits
//     decode errors, NORMALIZE_OUTPUT_INVALID when the mezzanine does not verify.
//   planNormalize(probe) -> { copy, width, height, videoFilter }   pure; exported for tests and ETA
// `tolerant` is the failure matrix's single retry: `-fflags +genpts -err_detect ignore_err`, and it never stream-copies.
// Stream copy keeps the source's timestamps, so it is planned only when the video AND first audio stream start
// within half a frame of 0 (a screen recorder's 0.5 s video offset would otherwise shift every frame index);
// the transcode path pads the start through the fps filter. The mezzanine's video start is verified after muxing.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { EditError } = require("../errors");
const fsx = require("../fsx");
const proc = require("../engine/proc");
const ids = require("../ids");
const { parseRate } = require("./probe_strict");

const TARGET_FPS = 30;
const HALF_FRAME_SEC = 0.5 / TARGET_FPS;
const MEZZ_LONG_EDGE = 1920;
const PROXY_SHORT_EDGE = 540;
const POSTER_LONG_EDGE = 640;
const POSTER_SAMPLES = 5;
const RUN_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const SOURCE_REL_RE = /^[A-Za-z0-9_\-./]{1,200}$/;
const ZSCALE_PRIMARIES = new Set(["bt2020", "bt709"]);
const ZSCALE_MATRIX = new Set(["bt2020nc", "bt2020c", "bt709"]);

const OUT = Object.freeze({
  mezz: "work/mezz.mp4", voice48k: "work/voice48k.wav", audio16k: "work/audio16k.wav",
  proxy: "work/proxy540.mp4", poster: "work/poster.jpg",
});
const tmpName = (rel, runId) => `${rel}.tmp.${runId}${path.extname(rel)}`;

const even = (n) => Math.max(2, 2 * Math.round(n / 2));
const round3 = (n) => Math.round(n * 1000) / 1000;

function fitLongEdge(w, h, maxLong) {
  const scale = Math.min(1, maxLong / Math.max(w, h));
  return { width: even(w * scale), height: even(h * scale) };
}
function fitShortEdge(w, h, maxShort) {
  const scale = Math.min(1, maxShort / Math.min(w, h));
  return { width: even(w * scale), height: even(h * scale) };
}

function tonemapFilter(v) {
  const tin = v.colorTransfer === "arib-std-b67" ? "arib-std-b67" : "smpte2084";
  const pin = ZSCALE_PRIMARIES.has(v.colorPrimaries) ? v.colorPrimaries : "bt2020";
  const min = ZSCALE_MATRIX.has(v.colorSpace) ? v.colorSpace : "bt2020nc";
  const rin = v.colorRange === "pc" ? "pc" : "tv";
  return `zscale=tin=${tin}:pin=${pin}:min=${min}:rin=${rin}:t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,`
    + "tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv";
}

// Unknown (null) start times are not assumed to be 0: the copy path is only for sources proven aligned.
function startsAtZero(s) {
  if (s === null || s === undefined || s === "" || typeof s === "boolean") return false;
  const n = Number(s);
  return Number.isFinite(n) && Math.abs(n) <= HALF_FRAME_SEC;
}

function planNormalize(probe) {
  const v = probe && probe.video;
  const a0 = probe && Array.isArray(probe.audio) ? probe.audio[0] : (probe && probe.audio && typeof probe.audio === "object" ? probe.audio : null);
  const w = v && Number(v.displayWidth || v.width), h = v && Number(v.displayHeight || v.height);
  if (!(w > 0 && h > 0)) throw new EditError("NORMALIZE_BAD_PROBE", { status: 500, errorClass: "bug", stage: "COMPRESSING", detail: "probe has no video dimensions" });
  const { width, height } = fitLongEdge(w, h, MEZZ_LONG_EDGE);
  const rotation = Number(v.rotation) || 0;
  const fps = Number(v.avgFps || v.fps || v.rFps);
  const rFps = Number(v.rFps || fps);
  const squarePixels = !v.sar || Math.abs(Number(v.sar) - 1) < 1e-3;
  const copy = v.codec === "h264" && v.pixFmt === "yuv420p" && !v.vfr && !v.interlaced && !v.hdr && rotation === 0 && squarePixels
    && Math.abs(fps - TARGET_FPS) < 0.005 && Math.abs(rFps - TARGET_FPS) < 0.005
    && v.width % 2 === 0 && v.height % 2 === 0 && Math.max(v.width, v.height) <= MEZZ_LONG_EDGE
    && startsAtZero(v.startTime) && (!a0 || startsAtZero(a0.startTime));
  // Deinterlace BEFORE scaling: resizing woven fields blends them and defeats field detection.
  // Rotation is applied by ffmpeg's autorotate ahead of this graph, so width/height are display dims.
  const chain = [];
  if (v.interlaced) chain.push("yadif");
  chain.push(`scale=${width}:${height}`, "setsar=1");
  if (v.hdr) chain.push(tonemapFilter(v));
  chain.push(`fps=${TARGET_FPS}`, "format=yuv420p");
  return { copy, width, height, videoFilter: chain.join(",") };
}

function progressReporter(onProgress) {
  let best = 0;
  return (from, to, pct, step) => {
    if (typeof onProgress !== "function" || !(pct >= 0)) return;
    const overall = Math.round((from + ((to - from) * Math.min(100, pct)) / 100) * 10) / 10;
    if (overall < best) return;
    best = overall;
    try { onProgress(overall, { step }); } catch { /* progress is an enhancement */ }
  };
}

function mapFfmpegError(e, { tolerant, stage }) {
  if (!e || e.name !== "EditError") return e;
  const detail = String(e.detail || "");
  if (/No space left on device/i.test(detail)) {
    return new EditError("INSUFFICIENT_STORAGE", { status: 507, errorClass: "resource", retryable: true, stage, detail: "ENOSPC" });
  }
  if (tolerant && e.code === "PROC_EXIT" && /Invalid data found|corrupt|error while decoding|Invalid NAL/i.test(detail)) {
    return new EditError("UNDECODABLE", { status: 422, errorClass: "input", retryable: false, stage, detail: e.detail, userMessage: "The video is damaged and could not be processed." });
  }
  return e;
}

function renameInto(projectDir, fromRel, toRel) {
  fsx.renameWithRetrySync(path.join(projectDir, fromRel), path.join(projectDir, toRel));
}

function requireFile(projectDir, rel, minBytes, what) {
  let size = 0;
  try { size = fs.statSync(path.join(projectDir, rel)).size; } catch { size = 0; }
  if (size < minBytes) throw new EditError("NORMALIZE_OUTPUT_INVALID", { status: 500, errorClass: "transient", retryable: true, stage: "COMPRESSING", detail: `${what} missing or empty` });
  return size;
}

async function normalizeSource({
  projectDir, sourceRel = "source/original.bin", demuxer, probe, runId, signal, onProgress, settings,
  project = null, tolerant = false, threads, timeoutMs, log = console,
} = {}) {
  const stage = "COMPRESSING";
  if (typeof projectDir !== "string" || !fs.existsSync(projectDir)) throw new EditError("NORMALIZE_BAD_INPUT", { errorClass: "bug", stage, detail: "projectDir missing" });
  if (demuxer !== "mov" && demuxer !== "matroska") throw new EditError("NORMALIZE_BAD_INPUT", { errorClass: "bug", stage, detail: "demuxer" });
  if (typeof sourceRel !== "string" || !SOURCE_REL_RE.test(sourceRel)) throw new EditError("NORMALIZE_BAD_INPUT", { errorClass: "bug", stage, detail: "sourceRel" });
  const rid = runId == null ? ids.newRunId() : String(runId);
  if (!RUN_ID_RE.test(rid)) throw new EditError("NORMALIZE_BAD_INPUT", { errorClass: "bug", stage, detail: "runId" });

  const srcAbs = fsx.resolveInside(projectDir, sourceRel);
  if (!fs.existsSync(srcAbs)) throw new EditError("SOURCE_MISSING", { status: 500, errorClass: "resource", stage, detail: "source missing" });
  const workAbs = fsx.resolveInside(projectDir, "work");
  fsx.ensureDir(workAbs);

  const plan = planNormalize(probe);
  const copy = plan.copy && !tolerant;   // the tolerant retry always re-encodes (it also recovers a bad copy)
  const D = Number(probe.durationSec) > 0 ? Number(probe.durationSec) : 60;
  const cpus = (settings && settings.cpus) || (os.availableParallelism ? os.availableParallelism() : os.cpus().length) || 1;
  const threadCount = String(Number.isInteger(threads) && threads > 0 ? threads : Math.max(1, Math.min(4, cpus)));
  const scale = (settings && Number(settings.budgetScale)) || 1;
  const px = Math.max(1, (Number(probe.video.width) * Number(probe.video.height)) / 2.07e6);
  const cf = Math.max(0.5, 4 / cpus);
  const mezzTimeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : Math.max(120, 3 * D * px * cf) * scale * 1000;
  const pidFile = settings && settings.paths ? path.join(settings.paths.runtimeDir, "pids.json") : undefined;
  const report = progressReporter(onProgress);
  const src = `file:${sourceRel.split(path.sep).join("/")}`;
  const common = { cwd: projectDir, signal, stage, lowPriority: true, pidFile };
  const T = {
    mezz: tmpName(OUT.mezz, rid), voice48k: tmpName(OUT.voice48k, rid), audio16k: tmpName(OUT.audio16k, rid),
    proxy: tmpName(OUT.proxy, rid), poster: tmpName(OUT.poster, rid),
  };
  const started = Date.now();

  try {
    // ---- pass 1: mezzanine + both wavs from a single decode ---------------------------------
    const input = ["-y", "-protocol_whitelist", "file"];
    if (tolerant) input.push("-fflags", "+genpts", "-err_detect", "ignore_err");
    input.push("-f", demuxer, "-i", src);
    const audioGraph = "[0:a:0]aresample=async=1:first_pts=0,asplit=3[am][av][aa]";
    const graph = copy ? audioGraph : `[0:v:0]${plan.videoFilter}[vm];${audioGraph}`;
    const strip = ["-map_metadata", "-1", "-map_chapters", "-1"];
    const videoOut = copy
      ? ["-c:v", "copy"]
      : ["-fps_mode", "cfr", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-g", String(TARGET_FPS), "-pix_fmt", "yuv420p", "-threads", threadCount];
    await proc.ffmpeg([
      ...input, "-filter_complex", graph,
      "-map", copy ? "0:v:0" : "[vm]", "-map", "[am]", "-dn", "-sn", ...strip, ...videoOut,
      "-c:a", "aac", "-ar", "48000", "-ac", "2", "-movflags", "+faststart", "-f", "mp4", T.mezz,
      "-map", "[av]", ...strip, "-c:a", "pcm_s16le", "-ar", "48000", "-ac", "1", "-f", "wav", T.voice48k,
      "-map", "[aa]", ...strip, "-c:a", "pcm_s16le", "-ar", "16000", "-ac", "1", "-f", "wav", T.audio16k,
    ], {
      ...common, label: "normalize-mezz", timeoutMs: mezzTimeoutMs, expectedDurationSec: D,
      onProgress: (pct) => report(0, 75, pct, "mezz"),
      fault: { point: "normalize", settings, project },
    }).catch((e) => { throw mapFfmpegError(e, { tolerant, stage }); });

    requireFile(projectDir, T.mezz, 1024, "mezzanine");
    requireFile(projectDir, T.voice48k, 45, "voice48k");
    requireFile(projectDir, T.audio16k, 45, "audio16k");
    renameInto(projectDir, T.mezz, OUT.mezz);
    renameInto(projectDir, T.voice48k, OUT.voice48k);
    renameInto(projectDir, T.audio16k, OUT.audio16k);

    const verify = await proc.ffprobeJson([
      "-v", "error", "-protocol_whitelist", "file", "-f", "mov", "-show_format", "-show_streams", "-of", "json", `file:${OUT.mezz}`,
    ], { ...common, label: "normalize-verify", timeoutMs: 20000 });
    const mv = Array.isArray(verify.streams) ? verify.streams.find((x) => x && x.codec_type === "video") : null;
    const mezzDuration = Number(verify.format && verify.format.duration);
    if (!mv || !(mv.width > 0) || !(mv.height > 0) || !(mezzDuration > 0)) {
      throw new EditError("NORMALIZE_OUTPUT_INVALID", { status: 500, errorClass: "transient", retryable: true, stage, detail: "mezzanine did not verify" });
    }
    const mezzVideoStart = Number(mv.start_time);
    if (Number.isFinite(mezzVideoStart) && Math.abs(mezzVideoStart) > HALF_FRAME_SEC) {
      // Transient: the tolerant retry re-encodes, which pads the timeline to start at 0.
      throw new EditError("NORMALIZE_OUTPUT_INVALID", { status: 500, errorClass: "transient", retryable: true, stage, detail: "mezzanine video does not start at 0" });
    }
    const mezz = {
      path: OUT.mezz,
      sha256: await fsx.sha256File(path.join(projectDir, OUT.mezz)),
      width: mv.width,
      height: mv.height,
      fps: round3(parseRate(mv.avg_frame_rate) || parseRate(mv.r_frame_rate) || 0),
      durationSec: round3(mezzDuration),
    };
    report(0, 75, 100, "mezz");

    // ---- pass 2: browser proxy --------------------------------------------------------------
    const proxyDims = fitShortEdge(mezz.width, mezz.height, PROXY_SHORT_EDGE);
    await proc.ffmpeg([
      "-y", "-protocol_whitelist", "file", "-f", "mov", "-i", `file:${OUT.mezz}`,
      "-map", "0:v:0", "-map", "0:a:0", "-vf", `scale=${proxyDims.width}:${proxyDims.height},setsar=1`,
      "-c:v", "libx264", "-preset", "ultrafast", "-crf", "26", "-g", "15", "-pix_fmt", "yuv420p", "-threads", threadCount,
      "-c:a", "aac", "-b:a", "96k", "-ac", "2", ...strip, "-movflags", "+faststart", "-f", "mp4", T.proxy,
    ], {
      ...common, label: "normalize-proxy", timeoutMs: Math.max(60, 1.5 * mezz.durationSec * cf) * scale * 1000,
      expectedDurationSec: mezz.durationSec, onProgress: (pct) => report(75, 95, pct, "proxy"),
    }).catch((e) => { throw mapFfmpegError(e, { tolerant: false, stage }); });
    requireFile(projectDir, T.proxy, 1024, "proxy");
    renameInto(projectDir, T.proxy, OUT.proxy);

    // ---- pass 3: poster ---------------------------------------------------------------------
    await makePoster({ projectDir, mezz, rid, common, signal });
    report(95, 100, 100, "poster");

    if (typeof log === "object" && log) {
      const pid = path.basename(projectDir);
      try { (log.info || log.log).call(log, `[video-edit] normalize done${ids.isProjectId(pid) ? ` project=${pid}` : ""} copied=${copy} durationSec=${mezz.durationSec} tookMs=${Date.now() - started}`); } catch { /* noop */ }
    }
    return {
      copied: copy,
      mezz,
      proxy: { path: OUT.proxy },
      voice48k: { path: OUT.voice48k },
      audio16k: { path: OUT.audio16k },
      poster: { path: OUT.poster },
    };
  } finally {
    await removeRunTemps(workAbs, rid);
  }
}

// Five frames spread over the clip, each measured with signalstats; the brightest becomes the
// poster (a talking head's first frame is often black or mid-blink). One ffmpeg, five inputs.
async function makePoster({ projectDir, mezz, rid, common, signal }) {
  const dims = fitLongEdge(mezz.width, mezz.height, POSTER_LONG_EDGE);
  const cands = Array.from({ length: POSTER_SAMPLES }, (_, i) => ({
    at: (mezz.durationSec * (i + 0.5)) / POSTER_SAMPLES,
    jpg: `work/poster.cand${i}.tmp.${rid}.jpg`,
    stats: `work/poster.yavg${i}.tmp.${rid}.txt`,
  }));
  const args = ["-y"];
  for (const c of cands) args.push("-ss", c.at.toFixed(3), "-protocol_whitelist", "file", "-f", "mov", "-i", `file:${OUT.mezz}`);
  cands.forEach((c, i) => {
    args.push("-map", `${i}:v:0`, "-frames:v", "1",
      "-vf", `scale=${dims.width}:${dims.height},setsar=1,signalstats,metadata=mode=print:key=lavfi.signalstats.YAVG:file=${c.stats}`,
      "-q:v", "3", "-f", "image2", "-update", "1", c.jpg);
  });
  let best = null;
  try {
    await proc.ffmpeg(args, { ...common, label: "normalize-poster", timeoutMs: 60000 });
    for (const c of cands) {
      let size = 0, yavg = -1;
      try { size = fs.statSync(path.join(projectDir, c.jpg)).size; } catch { continue; }
      try {
        const m = /lavfi\.signalstats\.YAVG=([\d.]+)/.exec(fs.readFileSync(path.join(projectDir, c.stats), "utf8"));
        if (m) yavg = Number(m[1]);
      } catch { /* unmeasured candidates still beat no poster */ }
      if (size > 0 && (!best || yavg > best.yavg)) best = { ...c, yavg };
    }
  } catch (e) {
    if (e && e.code === "PROC_ABORTED") throw e;
    best = null;   // fall through to the single-frame fallback
  }
  if (best) { renameInto(projectDir, best.jpg, OUT.poster); return; }

  const fallback = tmpName(OUT.poster, rid);
  if (signal && signal.aborted) throw new EditError("PROC_ABORTED", { status: 409, errorClass: "cancelled", stage: "COMPRESSING" });
  await proc.ffmpeg([
    "-y", "-protocol_whitelist", "file", "-f", "mov", "-i", `file:${OUT.mezz}`, "-map", "0:v:0", "-frames:v", "1",
    "-vf", `scale=${dims.width}:${dims.height},setsar=1`, "-q:v", "3", "-f", "image2", "-update", "1", fallback,
  ], { ...common, label: "normalize-poster", timeoutMs: 30000 });
  requireFile(projectDir, fallback, 1, "poster");
  renameInto(projectDir, fallback, OUT.poster);
}

async function removeRunTemps(workAbs, rid) {
  let names = [];
  try { names = fs.readdirSync(workAbs); } catch { return; }
  const marker = `.tmp.${rid}.`;
  for (const n of names) {
    if (!n.includes(marker)) continue;
    await fsx.rmWithRetry(path.join(workAbs, n), { attempts: 3 });
  }
}

module.exports = { normalizeSource, planNormalize, fitLongEdge, fitShortEdge, OUTPUTS: OUT, HALF_FRAME_SEC };
