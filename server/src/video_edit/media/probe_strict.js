// VIDEO EDIT STRICT PROBE — decide what an uploaded file IS before anything else touches it.
//
// WHY THIS EXISTS. An upload is attacker-controlled bytes. Left to its defaults, ffprobe/ffmpeg will
// follow an HLS playlist (#EXTM3U) or an ffconcat script to other files or URLs, pick whatever
// demuxer content sniffing suggests, and report every tag the file carries (GPS location, device
// serials, owner names). services/video_probe.probeVideo is fail-open and tuned for trusted stock
// clips, so it is the wrong tool at the front door. This module is fail-closed and narrow:
//   1. sniffContainer reads the first 64 bytes itself and admits only ISO-BMFF (demuxer `mov`) or
//      EBML (`matroska`). Playlists, concat scripts, images, RIFF and TS are rejected before any
//      child process is spawned.
//   2. probeStrict runs ffprobe with the demuxer FORCED, `-protocol_whitelist file` and a `file:` URL,
//      validates the JSON with zod (unknown keys, including every `tags` block, are dropped) and
//      reduces it to the facts the engine needs.
//   3. applyPolicy maps those facts onto the API.md §8 limits using the §9 MEDIA_REJECTED reasons.
//   4. decodeSamples really decodes half a second at start / middle / end: a valid header over a
//      truncated or corrupt body probes fine and would otherwise fail minutes later in COMPRESSING.
//
// CONTRACT (ENGINE.md §4 steps 3–5, API.md §8–9):
//   sniffContainer(filePath) -> Promise<'mov'|'matroska'>   EditError UNSUPPORTED_MEDIA 415 {reason:UNSUPPORTED_CONTAINER}
//   sniffBuffer(buf) -> 'mov'|'matroska'                     same rules, pure
//   probeStrict(filePath, { demuxer, timeoutMs=20000, signal, settings, project }) -> Promise<ProbeInfo>
//        EditError MEDIA_REJECTED 422 {reason: UNDECODABLE | PROBE_TIMEOUT}; PROC_ABORTED / PROC_SPAWN pass through
//   applyPolicy(probe, limits) -> { ok, reason|null, status, warnings:[string], details|null }
//   policyError(result) -> EditError (415 UNSUPPORTED_MEDIA for UNSUPPORTED_CONTAINER, else 422 MEDIA_REJECTED)
//   decodeSamples(filePath, { demuxer, durationSec, signal, timeoutMs=20000, settings }) -> Promise<void>
//        EditError MEDIA_REJECTED 422 {reason: UNDECODABLE}
//   ProbeInfo = { formatName, durationSec, bitrateKbps, sizeBytes, streamCount, videoStreamCount,
//     video: { index, codec, width, height, displayWidth, displayHeight, rotation, sar, fps, rFps, avgFps,
//              vfr, interlaced, hdr, pixFmt, colorTransfer, colorPrimaries, colorSpace, colorRange, startTime } | null,
//     audio: [{ index, codec, channels, sampleRate, startTime }], ignoredStreams: [{ type, codec }] }
//   startTime = the stream's start_time in seconds (null when ffprobe gives none); normalize only stream-copies
//   a video that starts at 0.
// No filename, path or tag value is ever logged or placed in an error's user-facing fields.

const fs = require("node:fs");
const path = require("node:path");
const { z } = require("zod");
const { EditError } = require("../errors");
const proc = require("../engine/proc");
const { DEFAULTS } = require("../settings");

const DEMUXERS = Object.freeze(["mov", "matroska"]);
const ISO_BOX_TYPES = new Set(["ftyp", "moov", "mdat", "wide", "free", "skip", "pnot"]);
const IMAGE_BRANDS = new Set(["heic", "heix", "mif1", "msf1", "avif"]);
const EBML_MAGIC = 0x1a45dfa3;

const VIDEO_CODECS = new Set(["h264", "hevc", "vp8", "vp9", "av1", "mpeg4", "prores"]);
const AUDIO_CODECS = new Set(["aac", "mp3", "opus", "vorbis", "pcm_s16le", "pcm_s24le", "pcm_f32le", "alac", "flac", "ac3", "eac3"]);
const INTERLACED_ORDERS = new Set(["tt", "bb", "tb", "bt"]);
const HDR_TRANSFERS = new Set(["smpte2084", "arib-std-b67"]);

const REASON_MESSAGES = Object.freeze({
  UNSUPPORTED_CONTAINER: "Not a supported video: use an MP4, MOV, MKV or WebM file.",
  DURATION_TOO_LONG: "Not a supported video: it is too long.",
  DURATION_TOO_SHORT: "Not a supported video: it is too short.",
  RESOLUTION_TOO_LOW: "Not a supported video: the resolution is too low.",
  RESOLUTION_TOO_HIGH: "Not a supported video: the resolution is too high.",
  FRAME_RATE_OUT_OF_RANGE: "Not a supported video: the frame rate is not supported.",
  NO_VIDEO_STREAM: "Not a supported video: the file has no video track.",
  NO_AUDIO_STREAM: "Not a supported video: the file has no audio track.",
  MULTIPLE_VIDEO_STREAMS: "Not a supported video: the file has more than one video track.",
  TOO_MANY_STREAMS: "Not a supported video: the file has too many tracks.",
  UNSUPPORTED_CODEC: "Not a supported video: the video or audio format is not supported.",
  UNDECODABLE: "Not a supported video: the file is damaged or incomplete.",
  PROBE_TIMEOUT: "The video could not be checked in time; try again.",
  WORKLOAD_TOO_LARGE: "Not a supported video: it is too large to process (shorten it or lower the resolution).",
  BITRATE_TOO_HIGH: "Not a supported video: the bitrate is too high.",
});

// ---- errors ----------------------------------------------------------------------------------
function mediaError(reason, { detail = null, details = null } = {}) {
  const unsupported = reason === "UNSUPPORTED_CONTAINER";
  const timeout = reason === "PROBE_TIMEOUT";
  return new EditError(unsupported ? "UNSUPPORTED_MEDIA" : "MEDIA_REJECTED", {
    status: unsupported ? 415 : 422,
    errorClass: timeout ? "transient" : "input",
    retryable: timeout,
    stage: "VALIDATING",
    detail,
    userMessage: REASON_MESSAGES[reason] || null,
    extra: { reason, ...(details && typeof details === "object" ? details : {}) },
  });
}

function policyError(result) {
  return mediaError(result && result.reason ? result.reason : "UNDECODABLE", { details: result && result.details });
}

// Probe / decode child failures → admission reasons. Cancellation and a missing tool are not a
// verdict on the file, so they pass through untouched.
function mapProcError(e, { timeoutReason }) {
  if (!e || e.name !== "EditError") return mediaError("UNDECODABLE", { detail: "unexpected probe failure" });
  if (e.code === "PROC_ABORTED" || e.code === "PROC_SPAWN") return e;
  if (e.code === "PROC_TIMEOUT" || e.code === "PROC_STALL") return mediaError(timeoutReason, { detail: e.code });
  if (e.code === "PROC_EXIT" || e.code === "PROC_BAD_OUTPUT") return mediaError("UNDECODABLE", { detail: e.detail });
  return e;
}

// ---- magic bytes -----------------------------------------------------------------------------
function sniffBuffer(buf) {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.alloc(0);
  if (b.length >= 4 && b.readUInt32BE(0) === EBML_MAGIC) return "matroska";
  if (b.length >= 8) {
    const size = b.readUInt32BE(0);
    const type = b.toString("latin1", 4, 8);
    if (ISO_BOX_TYPES.has(type) && (size === 0 || size === 1 || size >= 8)) {
      if (type === "ftyp") {
        if (b.length < 12) throw mediaError("UNSUPPORTED_CONTAINER", { detail: "short ftyp" });
        const brand = b.toString("latin1", 8, 12);
        if (IMAGE_BRANDS.has(brand)) throw mediaError("UNSUPPORTED_CONTAINER", { detail: "image brand" });
      }
      return "mov";
    }
  }
  throw mediaError("UNSUPPORTED_CONTAINER", { detail: b.length ? "unknown magic" : "empty file" });
}

async function sniffContainer(filePath) {
  const buf = Buffer.alloc(64);
  let n = 0;
  let fh = null;
  try {
    fh = await fs.promises.open(filePath, "r");
    ({ bytesRead: n } = await fh.read(buf, 0, 64, 0));
  } catch (e) {
    throw mediaError("UNSUPPORTED_CONTAINER", { detail: e && e.code ? e.code : "unreadable" });
  } finally {
    if (fh) { try { await fh.close(); } catch { /* noop */ } }
  }
  return sniffBuffer(buf.subarray(0, n));
}

// ---- ffprobe JSON schema ---------------------------------------------------------------------
// Only the keys below survive parsing. `tags` (and everything else) is stripped by zod, so no tag
// value can reach probe.json, project.json or a log line.
const numLike = z.union([z.number(), z.string().max(64)]).nullish();
const shortStr = (max = 64) => z.string().max(max).optional();

const StreamSchema = z.object({
  index: z.number().int().nonnegative(),
  codec_type: shortStr(32),
  codec_name: shortStr(64),
  codec_tag_string: shortStr(64),
  width: z.number().int().optional(),
  height: z.number().int().optional(),
  sample_aspect_ratio: shortStr(32),
  pix_fmt: shortStr(32),
  field_order: shortStr(32),
  color_transfer: shortStr(32),
  color_primaries: shortStr(32),
  color_space: shortStr(32),
  color_range: shortStr(16),
  r_frame_rate: shortStr(32),
  avg_frame_rate: shortStr(32),
  channels: z.number().int().optional(),
  sample_rate: numLike,
  start_time: numLike,
  duration: numLike,
  bit_rate: numLike,
  disposition: z.object({ attached_pic: z.number().int().optional() }).optional(),
  side_data_list: z.array(z.object({ side_data_type: shortStr(64), rotation: z.number().optional() })).max(64).optional(),
});

const ProbeJsonSchema = z.object({
  streams: z.array(StreamSchema).max(4096).default([]),
  format: z.object({
    format_name: shortStr(128),
    duration: numLike,
    bit_rate: numLike,
    size: numLike,
    nb_streams: z.number().int().optional(),
  }).optional(),
  error: z.object({ code: z.number().optional(), string: shortStr(512) }).optional(),
});

const num = (v) => {
  if (v === null || v === undefined || v === "" || typeof v === "boolean") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const round3 = (n) => (n == null ? null : Math.round(n * 1000) / 1000);
const token = (s, max = 32) => (typeof s === "string" && /^[A-Za-z0-9_.,\- ]{1,128}$/.test(s) ? s.slice(0, max) : null);

function parseRate(s) {
  if (typeof s !== "string") return null;
  const [a, b] = s.split("/");
  const n = Number(a), d = b === undefined ? 1 : Number(b);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d <= 0 || n <= 0) return null;
  return n / d;
}

function parseRatio(s) {
  if (typeof s !== "string") return null;
  const [a, b] = s.split(":");
  const n = Number(a), d = Number(b);
  if (!Number.isFinite(n) || !Number.isFinite(d) || n <= 0 || d <= 0) return null;
  return n / d;
}

// ffprobe reports the display matrix as a counter-clockwise angle. ffmpeg's autorotate only acts
// on right angles, so anything else is treated as unrotated (that is what the mezzanine will show).
function normalizeRotation(sideData) {
  const m = Array.isArray(sideData) ? sideData.find((d) => d && typeof d.rotation === "number") : null;
  if (!m) return 0;
  const snapped = Math.round(m.rotation / 90) * 90;
  if (Math.abs(m.rotation - snapped) > 1) return 0;
  return ((snapped % 360) + 360) % 360;
}

function isAttachedPic(s) { return !!(s.disposition && s.disposition.attached_pic === 1); }

function buildProbeInfo(json, { sizeBytes }) {
  const streams = json.streams;
  const fmt = json.format || {};
  const videos = streams.filter((s) => s.codec_type === "video" && !isAttachedPic(s));
  const audios = streams.filter((s) => s.codec_type === "audio");

  let video = null;
  const v = videos[0];
  if (v) {
    const width = Number.isInteger(v.width) && v.width > 0 ? v.width : null;
    const height = Number.isInteger(v.height) && v.height > 0 ? v.height : null;
    const rotation = normalizeRotation(v.side_data_list);
    const sar = parseRatio(v.sample_aspect_ratio);
    let displayWidth = width, displayHeight = height;
    if (width && sar && Math.abs(sar - 1) > 1e-3) displayWidth = Math.max(1, Math.round(width * sar));
    if (rotation === 90 || rotation === 270) [displayWidth, displayHeight] = [displayHeight, displayWidth];
    const rFps = parseRate(v.r_frame_rate);
    const avgFps = parseRate(v.avg_frame_rate);
    const colorTransfer = token(v.color_transfer);
    video = {
      index: v.index,
      codec: token(v.codec_name),
      width, height, displayWidth, displayHeight, rotation,
      sar: sar ? round3(sar) : null,
      fps: round3(avgFps || rFps),
      rFps: round3(rFps),
      avgFps: round3(avgFps),
      vfr: !!(rFps && avgFps && Math.abs(rFps - avgFps) / avgFps > 0.01),
      interlaced: INTERLACED_ORDERS.has(v.field_order),
      hdr: HDR_TRANSFERS.has(colorTransfer),
      pixFmt: token(v.pix_fmt),
      colorTransfer,
      colorPrimaries: token(v.color_primaries),
      colorSpace: token(v.color_space),
      colorRange: token(v.color_range, 16),
      startTime: round3(num(v.start_time)),
    };
  }

  const ignoredStreams = streams
    .filter((s) => !(videos.includes(s) || audios.includes(s)))
    .slice(0, 16)
    .map((s) => ({ type: isAttachedPic(s) ? "attached_pic" : (token(s.codec_type) || "unknown"), codec: token(s.codec_name) || token(s.codec_tag_string) || null }));

  const streamDurations = streams.map((s) => num(s.duration)).filter((d) => d != null && d > 0);
  const fmtDuration = num(fmt.duration);
  const durationSec = fmtDuration != null && fmtDuration > 0 ? fmtDuration : (streamDurations.length ? Math.max(...streamDurations) : null);
  const bitRate = num(fmt.bit_rate);

  return {
    formatName: token(fmt.format_name, 128),
    durationSec: round3(durationSec),
    bitrateKbps: bitRate != null && bitRate > 0 ? Math.round(bitRate / 1000)
      : (durationSec > 0 && sizeBytes > 0 ? Math.round((sizeBytes * 8) / durationSec / 1000) : null),
    sizeBytes,
    streamCount: streams.length,
    videoStreamCount: videos.length,
    video,
    audio: audios.map((a) => ({
      index: a.index,
      codec: token(a.codec_name),
      channels: Number.isInteger(a.channels) && a.channels > 0 ? a.channels : null,
      sampleRate: num(a.sample_rate),
      startTime: round3(num(a.start_time)),
    })),
    ignoredStreams,
  };
}

// ---- probe -----------------------------------------------------------------------------------
const pidFileFor = (settings) => (settings && settings.paths && settings.paths.runtimeDir ? path.join(settings.paths.runtimeDir, "pids.json") : undefined);

function baseArgs(demuxer) {
  return ["-v", "error", "-protocol_whitelist", "file", "-f", demuxer, "-probesize", "32M", "-analyzeduration", "30M"];
}

function assertDemuxer(demuxer) {
  if (!DEMUXERS.includes(demuxer)) throw mediaError("UNSUPPORTED_CONTAINER", { detail: "demuxer not allowed" });
}

async function probeStrict(filePath, { demuxer, timeoutMs = 20000, signal, settings, project = null } = {}) {
  assertDemuxer(demuxer);
  const abs = path.resolve(String(filePath || ""));
  let sizeBytes;
  try { sizeBytes = fs.statSync(abs).size; }
  catch { throw mediaError("UNDECODABLE", { detail: "file missing" }); }
  const common = { timeoutMs, signal, stage: "VALIDATING", pidFile: pidFileFor(settings), maxStdoutBytes: 2e6 };

  let raw;
  try {
    raw = await proc.ffprobeJson(
      [...baseArgs(demuxer), "-show_format", "-show_streams", "-show_error", "-of", "json", `file:${abs}`],
      { ...common, label: "probe", fault: { point: "probe", settings, project } },
    );
  } catch (e) { throw mapProcError(e, { timeoutReason: "PROBE_TIMEOUT" }); }

  const parsed = ProbeJsonSchema.safeParse(raw);
  if (!parsed.success) throw mediaError("UNDECODABLE", { detail: "probe output failed validation" });
  if (parsed.data.error) throw mediaError("UNDECODABLE", { detail: parsed.data.error.string || "probe error" });

  const info = buildProbeInfo(parsed.data, { sizeBytes });

  // Some muxers (live-recorded MKV, fragmented MP4) write no duration at all. Count the video packets
  // rather than trusting a 0; if even that yields nothing there is no timeline to edit.
  if (!(info.durationSec > 0) && info.video) {
    let counted = null;
    try {
      const r = await proc.ffprobeJson(
        [...baseArgs(demuxer), "-count_packets", "-select_streams", "v:0", "-show_entries", "stream=nb_read_packets,avg_frame_rate,r_frame_rate", "-of", "json", `file:${abs}`],
        { ...common, label: "probe-count" },
      );
      const s = r && Array.isArray(r.streams) ? r.streams[0] : null;
      const packets = s ? num(s.nb_read_packets) : null;
      const fps = s ? (parseRate(s.avg_frame_rate) || parseRate(s.r_frame_rate)) : null;
      if (packets > 0 && fps > 0) counted = packets / fps;
    } catch (e) { throw mapProcError(e, { timeoutReason: "PROBE_TIMEOUT" }); }
    if (!(counted > 0)) throw mediaError("UNDECODABLE", { detail: "duration unknown" });
    info.durationSec = round3(counted);
    if (info.bitrateKbps == null && sizeBytes > 0) info.bitrateKbps = Math.round((sizeBytes * 8) / counted / 1000);
  }
  return info;
}

// ---- policy ----------------------------------------------------------------------------------
function applyPolicy(probe, limits) {
  const L = { ...DEFAULTS.limits, ...(limits && typeof limits === "object" ? limits : {}) };
  const warnings = [];
  const fail = (reason, details = null) => ({ ok: false, reason, status: reason === "UNSUPPORTED_CONTAINER" ? 415 : 422, warnings, details });
  if (!probe || typeof probe !== "object") return fail("UNDECODABLE");

  const family = String(probe.formatName || "").split(",");
  const isMov = family.includes("mov") || family.includes("mp4");
  const isMkv = family.includes("matroska") || family.includes("webm");
  if (!isMov && !isMkv) return fail("UNSUPPORTED_CONTAINER");

  if (probe.streamCount > L.maxStreams) return fail("TOO_MANY_STREAMS", { limit: L.maxStreams, actual: probe.streamCount });
  const v = probe.video;
  if (!v) return fail("NO_VIDEO_STREAM");
  if (probe.videoStreamCount > 1) return fail("MULTIPLE_VIDEO_STREAMS", { actual: probe.videoStreamCount });
  const audio = Array.isArray(probe.audio) ? probe.audio : [];
  if (!audio.length) return fail("NO_AUDIO_STREAM");
  if (audio.length > L.maxAudioStreams) return fail("TOO_MANY_STREAMS", { limit: L.maxAudioStreams, actual: audio.length });
  if (!VIDEO_CODECS.has(v.codec)) return fail("UNSUPPORTED_CODEC", { stream: "video", codec: v.codec || null });
  // Only the first audio stream is ever mapped; the others are ignored, so only it must decode.
  if (!AUDIO_CODECS.has(audio[0].codec)) return fail("UNSUPPORTED_CODEC", { stream: "audio", codec: audio[0].codec || null });

  const d = Number(probe.durationSec);
  if (!(d > 0) || d < L.minDurationSec) return fail("DURATION_TOO_SHORT", { limit: L.minDurationSec, actual: d > 0 ? d : 0 });
  if (d > L.maxDurationSec) return fail("DURATION_TOO_LONG", { limit: L.maxDurationSec, actual: d });

  const w = Number(v.displayWidth || v.width), h = Number(v.displayHeight || v.height);
  if (!(w > 0 && h > 0)) return fail("RESOLUTION_TOO_LOW", { limit: L.minShortEdge, actual: 0 });
  const shortEdge = Math.min(w, h), longEdge = Math.max(w, h);
  if (shortEdge < L.minShortEdge) return fail("RESOLUTION_TOO_LOW", { limit: L.minShortEdge, actual: shortEdge });
  if (longEdge > L.maxLongEdge) return fail("RESOLUTION_TOO_HIGH", { limit: L.maxLongEdge, actual: longEdge });

  const fps = Number(v.avgFps || v.fps || v.rFps);
  if (!(fps > 0) || fps < L.minFps || fps > L.maxFps) return fail("FRAME_RATE_OUT_OF_RANGE", { min: L.minFps, max: L.maxFps, actual: fps > 0 ? fps : 0 });

  const workload = w * h * fps * d;
  if (workload > L.maxWorkload) return fail("WORKLOAD_TOO_LARGE", { limit: L.maxWorkload, actual: Math.round(workload) });
  if (Number(probe.bitrateKbps) > L.maxBitrateKbps) return fail("BITRATE_TOO_HIGH", { limit: L.maxBitrateKbps, actual: probe.bitrateKbps });

  if (shortEdge < L.warnShortEdge) warnings.push("LOW_RESOLUTION");
  if (v.vfr) warnings.push("VFR");
  if (v.interlaced) warnings.push("INTERLACED");
  if (v.hdr) warnings.push("HDR");
  if (v.rotation) warnings.push("ROTATED");
  if (audio.length > 1) warnings.push("EXTRA_AUDIO_STREAMS_IGNORED");
  if (Array.isArray(probe.ignoredStreams) && probe.ignoredStreams.length) warnings.push("IGNORED_STREAMS");
  return { ok: true, reason: null, status: 200, warnings, details: null };
}

// ---- decode samples --------------------------------------------------------------------------
function sampleTimes(durationSec) {
  const d = Number(durationSec);
  const raw = d > 0 ? [0, d / 2, Math.max(0, d - 1)] : [0];
  const seen = new Set();
  return raw.map((x) => Math.round(x * 1000) / 1000).filter((x) => (seen.has(x) ? false : seen.add(x)));
}

async function decodeSamples(filePath, { demuxer, durationSec, signal, timeoutMs = 20000, settings } = {}) {
  assertDemuxer(demuxer);
  const abs = path.resolve(String(filePath || ""));
  for (const at of sampleTimes(durationSec)) {
    try {
      await proc.ffmpeg([
        "-v", "error", "-xerror", "-protocol_whitelist", "file", "-f", demuxer, "-ss", at.toFixed(3), "-i", `file:${abs}`,
        "-t", "0.5", "-map", "0:v:0", "-map", "0:a:0", "-f", "null", "-",
      ], { timeoutMs, signal, stage: "VALIDATING", label: "decode-sample", lowPriority: true, pidFile: pidFileFor(settings) });
    } catch (e) { throw mapProcError(e, { timeoutReason: "UNDECODABLE" }); }
  }
}

module.exports = {
  sniffContainer, sniffBuffer, probeStrict, applyPolicy, policyError, decodeSamples, parseRate, sampleTimes,
  mediaError, DEMUXERS, VIDEO_CODECS, AUDIO_CODECS, IMAGE_BRANDS, REASON_MESSAGES,
};
