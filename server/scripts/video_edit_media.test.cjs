// Unit tests for video_edit/media (probe_strict, admission, normalize) — real ffmpeg, lavfi fixtures.
// Run: node scripts/video_edit_media.test.cjs
//
// Load-bearing: nothing that is not ISO-BMFF or EBML ever reaches ffprobe (playlists, ffconcat
// scripts and renamed images are refused on magic bytes, proven by pointing ffprobe/ffmpeg at a
// binary that does not exist); every API.md §9 MEDIA_REJECTED reason is reachable; a probe never
// carries a tag; a truncated file is UNDECODABLE before a project exists; the staging engine never
// writes past its byte cap and leaves no partial file; and normalize always yields CFR 30 yuv420p,
// even dimensions ≤1920, upright, tag-free output plus mono 48 k / 16 k wavs, a proxy and a poster.

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { PassThrough } = require("node:stream");
const { createHarness, mkTmp, makeSettings, installFetchTripwire, silentLog } = require("./lib/video_edit_test_utils.cjs");

const tmp = mkTmp("ve-media-");
// Anything that falls back to the settings singleton (e.g. proc's default pid registry) must land in
// the temp dir, never in server/edits.
process.env.VIDEO_EDIT_DIR = path.join(tmp.dir, "singleton-edits");
process.env.VIDEO_EDIT_INDEX = path.join(tmp.dir, "singleton-index.json");
const SERVER_EDITS = path.join(__dirname, "..", "edits");
const serverEditsExisted = fs.existsSync(SERVER_EDITS);

const probeStrict = require("../src/video_edit/media/probe_strict");
const admission = require("../src/video_edit/media/admission");
const { normalizeSource, planNormalize } = require("../src/video_edit/media/normalize");
const { isEditError, toErrorBody } = require("../src/video_edit/errors");
const { createStore } = require("../src/video_edit/store");
const { DEFAULTS } = require("../src/video_edit/settings");

const { t, section, run } = createHarness();
const restoreFetch = installFetchTripwire();
const MB = 1024 * 1024;
const FX = path.join(tmp.dir, "fx");
fs.mkdirSync(FX, { recursive: true });
const settings = makeSettings(path.join(tmp.dir, "root"), { videoEdit: { limits: { minDurationSec: 1 } } });

// ---- helpers ---------------------------------------------------------------------------------
const fx = (name) => path.join(FX, name);
function ff(args) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostdin", "-loglevel", "error", "-y", ...args], { cwd: FX, windowsHide: true, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`fixture ffmpeg failed: ${String(r.stderr).slice(-400)}`);
}
function ffprobe(file) {
  const r = spawnSync("ffprobe", ["-v", "error", "-show_format", "-show_streams", "-of", "json", file], { windowsHide: true, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`ffprobe failed: ${String(r.stderr).slice(-300)}`);
  return JSON.parse(r.stdout);
}
const SRC = (size, rate, dur) => ["-f", "lavfi", "-i", `testsrc2=size=${size}:rate=${rate}:duration=${dur}`];
const TONE = (dur) => ["-f", "lavfi", "-i", `sine=frequency=440:sample_rate=48000:duration=${dur}`];
const H264 = ["-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p"];
const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

let stageSeq = 0;
function stage(s, fixtureName, originalname) {
  fs.mkdirSync(s.paths.stagingDir, { recursive: true });
  const p = path.join(s.paths.stagingDir, `t${++stageSeq}.upload`);
  fs.copyFileSync(fx(fixtureName), p);
  return { path: p, size: fs.statSync(p).size, originalname: originalname || fixtureName };
}

async function rejects(promise, code, reason) {
  try { await (typeof promise === "function" ? promise() : promise); } catch (e) {
    assert.ok(isEditError(e), `expected EditError ${code}, got ${e && e.stack}`);
    assert.equal(e.code, code, `expected ${code}, got ${e.code} (reason=${e.extra && e.extra.reason}; ${e.detail})`);
    if (reason) assert.equal(e.extra && e.extra.reason, reason, `expected reason ${reason}, got ${e.extra && e.extra.reason} (${e.detail})`);
    return e;
  }
  throw new Error(`expected ${code}${reason ? `/${reason}` : ""}`);
}
function throwsCode(fn, code, reason) {
  try { fn(); } catch (e) {
    assert.ok(isEditError(e), String(e && e.stack));
    assert.equal(e.code, code);
    if (reason) assert.equal(e.extra && e.extra.reason, reason);
    return e;
  }
  throw new Error(`expected ${code}`);
}
async function admit(fixtureName, s = settings, originalname) {
  const file = stage(s, fixtureName, originalname);
  try { return await admission.admitStagedVideo(file, { settings: s, log: silentLog }); }
  finally { await admission.discardStaged(file, { settings: s }); }
}

// ---- fixtures --------------------------------------------------------------------------------
section("fixtures");

t("lavfi fixtures generate", () => {
  ff([...SRC("640x360", 30, 2.5), ...TONE(2.5), ...H264, "-c:a", "aac", "-shortest",
    "-metadata", "title=SecretTitle", "-metadata", "comment=SecretComment", "-metadata:s:v:0", "language=fra", "ok.mp4"]);
  ff(["-display_rotation", "90", "-i", "ok.mp4", "-map", "0", "-c", "copy", "-timecode", "00:00:00:00", "-f", "mov", "rot.mov"]);
  ff([...SRC("640x360", 30, 2.5), ...TONE(2.5), "-c:v", "libvpx-vp9", "-deadline", "realtime", "-cpu-used", "8", "-b:v", "400k", "-c:a", "libopus", "-shortest", "w.webm"]);
  fs.writeFileSync(fx("s.srt"), "1\n00:00:00,000 --> 00:00:01,000\nhello\n");
  fs.writeFileSync(fx("font.ttf"), "not really a font");
  ff(["-i", "ok.mp4", "-i", "s.srt", "-map", "0", "-map", "1", "-c", "copy", "-c:s", "srt", "-attach", "font.ttf", "-metadata:s:t", "mimetype=application/x-truetype-font", "k.mkv"]);
  ff(["-f", "lavfi", "-i", "color=c=red:s=64x64", "-frames:v", "1", "cover.png"]);
  ff([...TONE(3), "-i", "cover.png", "-map", "0", "-map", "1", "-c:a", "aac", "-c:v", "png", "-disposition:v:0", "attached_pic", "cov.m4a"]);
  ff([...SRC("640x360", 30, 2.5), ...H264, "noaudio.mp4"]);
  // Screen-recorder shape: h264 CFR 30 video whose stream starts 0.5 s after the audio.
  ff([...TONE(3), "-c:a", "aac", "tone3.m4a"]);
  ff(["-itsoffset", "0.5", "-i", "noaudio.mp4", "-i", "tone3.m4a", "-map", "0:v", "-map", "1:a", "-c", "copy", "offset.mp4"]);
  ff(["-i", "ok.mp4", "-i", "ok.mp4", "-map", "0:v", "-map", "1:v", "-map", "0:a", "-c", "copy", "two.mp4"]);
  ff([...SRC("320x240", 30, 2.5), ...TONE(2.5), ...H264, "-c:a", "aac", "-shortest", "small.mp4"]);
  ff([...SRC("640x360", 24, 1.5), ...TONE(1.5), ...H264, "-c:a", "aac", "-shortest", "-video_track_timescale", "720", "s24.mp4"]);
  ff([...SRC("640x360", 30, 1.5), ...TONE(1.5), ...H264, "-c:a", "aac", "-shortest", "-video_track_timescale", "720", "s30.mp4"]);
  fs.writeFileSync(fx("list.txt"), "file 's24.mp4'\nfile 's30.mp4'\n");
  ff(["-f", "concat", "-safe", "0", "-i", "list.txt", "-c", "copy", "vfr.mp4"]);
  ff([...SRC("640x360", 30, 2.5), ...TONE(2.5), "-vf", "setfield=tff", "-flags", "+ilme+ildct", ...H264, "-c:a", "aac", "-shortest", "inter.mp4"]);
  ff([...SRC("2000x1124", 25, 2), ...TONE(2),
    "-vf", "setfield=tff,setparams=color_trc=smpte2084:color_primaries=bt2020:colorspace=bt2020nc:range=tv,format=yuv420p10le",
    "-flags", "+ilme+ildct", "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac", "-shortest", "big.mp4"]);
  const okBuf = fs.readFileSync(fx("ok.mp4"));   // moov at the end (no faststart)
  fs.writeFileSync(fx("trunc.mp4"), okBuf.subarray(0, Math.floor(okBuf.length * 0.5)));
  ff(["-i", "ok.mp4", "-map", "0", "-c", "copy", "-movflags", "+faststart", "fs.mp4"]);
  const fsBuf = fs.readFileSync(fx("fs.mp4"));   // moov first: probes fine, body cut
  fs.writeFileSync(fx("truncfs.mp4"), fsBuf.subarray(0, Math.floor(fsBuf.length * 0.55)));
  fs.writeFileSync(fx("notes.txt"), "just some notes, definitely not a video\n");
  fs.writeFileSync(fx("playlist.mp4"), "#EXTM3U\n#EXT-X-VERSION:3\n#EXTINF:2.0,\nhttp://127.0.0.1:9/x.ts\n");
  fs.writeFileSync(fx("concat.mp4"), "ffconcat version 1.0\nfile 'ok.mp4'\n");
  fs.copyFileSync(fx("cover.png"), fx("pic.mp4"));
  const heic = Buffer.alloc(40);
  heic.writeUInt32BE(24, 0); heic.write("ftyp", 4, "latin1"); heic.write("heic", 8, "latin1"); heic.write("mif1heic", 16, "latin1");
  fs.writeFileSync(fx("photo.mp4"), heic);
  fs.writeFileSync(fx("empty.mp4"), Buffer.alloc(0));
});

// ---- magic bytes -----------------------------------------------------------------------------
section("probe_strict — magic bytes");

function box(type, brand = "isom") {
  const b = Buffer.alloc(32);
  b.writeUInt32BE(24, 0); b.write(type, 4, "latin1"); b.write(brand, 8, "latin1");
  return b;
}

t("ISO-BMFF box types → mov, EBML → matroska, image brands refused", () => {
  for (const type of ["ftyp", "moov", "mdat", "wide", "free", "skip", "pnot"]) assert.equal(probeStrict.sniffBuffer(box(type)), "mov", type);
  assert.equal(probeStrict.sniffBuffer(box("ftyp", "qt  ")), "mov");
  assert.equal(probeStrict.sniffBuffer(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81])), "matroska");
  for (const brand of ["heic", "heix", "mif1", "msf1", "avif"]) {
    const e = throwsCode(() => probeStrict.sniffBuffer(box("ftyp", brand)), "UNSUPPORTED_MEDIA", "UNSUPPORTED_CONTAINER");
    assert.equal(e.status, 415);
  }
});

t("playlists, ffconcat, XML, RIFF, TS, PNG, short and empty buffers → 415", () => {
  const samples = [
    Buffer.from("#EXTM3U\n#EXTINF:1,\nx.ts\n"), Buffer.from("ffconcat version 1.0\n"), Buffer.from("<?xml version=\"1.0\"?><MPD/>"),
    Buffer.from("RIFF\x24\x00\x00\x00WAVEfmt "), Buffer.from([0x47, 0x40, 0x00, 0x10, 0x00, 0x00, 0xb0, 0x0d]),
    fs.readFileSync(fx("cover.png")), Buffer.from("moo"), Buffer.alloc(0),
  ];
  for (const b of samples) throwsCode(() => probeStrict.sniffBuffer(b), "UNSUPPORTED_MEDIA", "UNSUPPORTED_CONTAINER");
});

t("renamed txt / #EXTM3U / ffconcat / PNG / HEIC / empty uploads are refused without spawning ffprobe or ffmpeg", async () => {
  const prev = { probe: process.env.VIDEO_EDIT_FFPROBE, mpeg: process.env.VIDEO_EDIT_FFMPEG };
  // If admission spawned anything, it would fail with PROC_SPAWN instead of UNSUPPORTED_MEDIA.
  process.env.VIDEO_EDIT_FFPROBE = fx("no-such-ffprobe.exe");
  process.env.VIDEO_EDIT_FFMPEG = fx("no-such-ffmpeg.exe");
  try {
    for (const name of ["notes.txt", "playlist.mp4", "concat.mp4", "pic.mp4", "photo.mp4", "empty.mp4"]) {
      const e = await rejects(admit(name), "UNSUPPORTED_MEDIA", "UNSUPPORTED_CONTAINER");
      assert.equal(e.status, 415, name);
    }
    // Sanity: the same override does make a real spawn fail loudly.
    await rejects(probeStrict.probeStrict(fx("ok.mp4"), { demuxer: "mov", settings }), "PROC_SPAWN");
  } finally {
    if (prev.probe === undefined) delete process.env.VIDEO_EDIT_FFPROBE; else process.env.VIDEO_EDIT_FFPROBE = prev.probe;
    if (prev.mpeg === undefined) delete process.env.VIDEO_EDIT_FFMPEG; else process.env.VIDEO_EDIT_FFMPEG = prev.mpeg;
  }
  assert.deepEqual(fs.readdirSync(settings.paths.stagingDir), []);
});

// ---- real probes -----------------------------------------------------------------------------
section("probe_strict + admission — real files");

t("valid mp4 (h264+aac) is admitted: probe facts, warnings, sha256, sanitized name, no tags", async () => {
  const res = await admit("ok.mp4", settings, "C:\\Users\\me\\Videos\\my\u202Eclip\u0007 final.mp4");
  assert.equal(res.demuxer, "mov");
  const { probe } = res;
  assert.ok(probe.formatName.includes("mov"));
  assert.equal(probe.streamCount, 2);
  assert.equal(probe.videoStreamCount, 1);
  assert.ok(Math.abs(probe.durationSec - 2.5) < 0.1, `duration ${probe.durationSec}`);
  assert.equal(probe.video.codec, "h264");
  assert.equal(probe.video.width, 640); assert.equal(probe.video.height, 360);
  assert.equal(probe.video.displayWidth, 640); assert.equal(probe.video.displayHeight, 360);
  assert.equal(probe.video.rotation, 0);
  assert.equal(probe.video.fps, 30);
  assert.equal(probe.video.pixFmt, "yuv420p");
  assert.deepEqual([probe.video.vfr, probe.video.interlaced, probe.video.hdr], [false, false, false]);
  assert.equal(probe.audio.length, 1);
  assert.deepEqual(probe.audio[0], { index: 1, codec: "aac", channels: 1, sampleRate: 48000, startTime: 0 });
  assert.equal(probe.video.startTime, 0);
  assert.ok(probe.bitrateKbps > 0);
  assert.deepEqual(res.warnings, ["LOW_RESOLUTION"]);
  assert.equal(res.sha256, sha(fs.readFileSync(fx("ok.mp4"))));
  assert.equal(res.sizeBytes, fs.statSync(fx("ok.mp4")).size);
  assert.equal(res.displayName, "myclip final.mp4");
  const text = JSON.stringify(probe);
  assert.ok(!/Secret|fra|tags/i.test(text), `probe leaked tags: ${text}`);
});

t("mov with display rotation 90 swaps display dims; tmcd data stream is ignored", async () => {
  const { probe, warnings } = await admit("rot.mov");
  assert.equal(probe.video.rotation, 90);
  assert.deepEqual([probe.video.width, probe.video.height], [640, 360]);
  assert.deepEqual([probe.video.displayWidth, probe.video.displayHeight], [360, 640]);
  assert.ok(probe.ignoredStreams.some((s) => s.type === "data" && s.codec === "tmcd"), JSON.stringify(probe.ignoredStreams));
  assert.ok(warnings.includes("ROTATED") && warnings.includes("IGNORED_STREAMS"), warnings.join());
});

t("webm (vp9+opus) is admitted through the matroska demuxer", async () => {
  const { demuxer, probe } = await admit("w.webm");
  assert.equal(demuxer, "matroska");
  assert.ok(probe.formatName.includes("matroska"));
  assert.equal(probe.video.codec, "vp9");
  assert.equal(probe.audio[0].codec, "opus");
});

t("mkv subtitle and attachment streams are ignored, not rejected", async () => {
  const { demuxer, probe } = await admit("k.mkv");
  assert.equal(demuxer, "matroska");
  const types = probe.ignoredStreams.map((s) => s.type).sort();
  assert.deepEqual(types, ["attachment", "subtitle"]);
  assert.equal(probe.videoStreamCount, 1);
});

t("audio-only m4a with cover art → NO_VIDEO_STREAM (attached_pic never counts as video)", async () => {
  const probe = await probeStrict.probeStrict(fx("cov.m4a"), { demuxer: "mov", settings });
  assert.equal(probe.video, null);
  assert.ok(probe.ignoredStreams.some((s) => s.type === "attached_pic"));
  const e = await rejects(admit("cov.m4a"), "MEDIA_REJECTED", "NO_VIDEO_STREAM");
  assert.equal(e.status, 422);
  assert.equal(e.errorClass, "input");
});

t("video without audio → NO_AUDIO_STREAM", async () => {
  await rejects(admit("noaudio.mp4"), "MEDIA_REJECTED", "NO_AUDIO_STREAM");
});

t("two video streams → MULTIPLE_VIDEO_STREAMS", async () => {
  const e = await rejects(admit("two.mp4"), "MEDIA_REJECTED", "MULTIPLE_VIDEO_STREAMS");
  assert.equal(e.extra.actual, 2);
});

t("short edge below 360 → RESOLUTION_TOO_LOW", async () => {
  const e = await rejects(admit("small.mp4"), "MEDIA_REJECTED", "RESOLUTION_TOO_LOW");
  assert.equal(e.extra.actual, 240);
});

t("duration above a lowered maxDurationSec (settings override) → DURATION_TOO_LONG", async () => {
  const tight = makeSettings(path.join(tmp.dir, "root-tight"), { videoEdit: { limits: { minDurationSec: 1, maxDurationSec: 2 } } });
  const e = await rejects(admit("ok.mp4", tight), "MEDIA_REJECTED", "DURATION_TOO_LONG");
  assert.equal(e.extra.limit, 2);
  assert.deepEqual(toErrorBody(e, "req1").details.reason, "DURATION_TOO_LONG");
});

t("truncated mp4 with no moov → UNDECODABLE at probe", async () => {
  await rejects(admit("trunc.mp4"), "MEDIA_REJECTED", "UNDECODABLE");
});

t("truncated faststart mp4 probes fine but fails sample decode → UNDECODABLE", async () => {
  const probe = await probeStrict.probeStrict(fx("truncfs.mp4"), { demuxer: "mov", settings });
  assert.ok(probe.video && probe.durationSec > 2);
  await rejects(probeStrict.decodeSamples(fx("truncfs.mp4"), { demuxer: "mov", durationSec: probe.durationSec, settings }), "MEDIA_REJECTED", "UNDECODABLE");
  await rejects(admit("truncfs.mp4"), "MEDIA_REJECTED", "UNDECODABLE");
});

t("VFR (24 → 30 fps concat), interlaced and HDR flags are detected", async () => {
  const vfr = await probeStrict.probeStrict(fx("vfr.mp4"), { demuxer: "mov", settings });
  assert.equal(vfr.video.vfr, true, `r=${vfr.video.rFps} avg=${vfr.video.avgFps}`);
  const inter = await probeStrict.probeStrict(fx("inter.mp4"), { demuxer: "mov", settings });
  assert.equal(inter.video.interlaced, true);
  assert.equal(inter.video.vfr, false);
  const big = await probeStrict.probeStrict(fx("big.mp4"), { demuxer: "mov", settings });
  assert.equal(big.video.hdr, true);
  assert.equal(big.video.colorTransfer, "smpte2084");
  assert.equal(big.video.interlaced, true);
  assert.equal(big.video.fps, 25);
  const policy = probeStrict.applyPolicy(big, settings.limits);
  assert.equal(policy.ok, true, policy.reason);
  assert.ok(policy.warnings.includes("HDR") && policy.warnings.includes("INTERLACED"), policy.warnings.join());
});

t("probe:timeout fault → MEDIA_REJECTED PROBE_TIMEOUT (transient, retryable)", async () => {
  const faulty = makeSettings(path.join(tmp.dir, "root-fault"), { env: { VIDEO_EDIT_FAULTS: "probe:timeout" } });
  const e = await rejects(probeStrict.probeStrict(fx("ok.mp4"), { demuxer: "mov", settings: faulty }), "MEDIA_REJECTED", "PROBE_TIMEOUT");
  assert.equal(e.retryable, true);
  const prod = makeSettings(path.join(tmp.dir, "root-fault-prod"), { env: { VIDEO_EDIT_FAULTS: "probe:timeout", NODE_ENV: "production" } });
  const probe = await probeStrict.probeStrict(fx("ok.mp4"), { demuxer: "mov", settings: prod });
  assert.equal(probe.video.codec, "h264");
});

t("probeStrict refuses a demuxer outside the allowlist", async () => {
  await rejects(probeStrict.probeStrict(fx("ok.mp4"), { demuxer: "hls", settings }), "UNSUPPORTED_MEDIA", "UNSUPPORTED_CONTAINER");
  await rejects(probeStrict.decodeSamples(fx("ok.mp4"), { demuxer: "concat", durationSec: 2 }), "UNSUPPORTED_MEDIA", "UNSUPPORTED_CONTAINER");
});

// ---- pure policy -----------------------------------------------------------------------------
section("probe_strict — policy table (pure)");

const baseProbe = () => ({
  formatName: "mov,mp4,m4a,3gp,3g2,mj2", durationSec: 30, bitrateKbps: 5000, sizeBytes: 1e7, streamCount: 2, videoStreamCount: 1,
  video: { index: 0, codec: "h264", width: 1920, height: 1080, displayWidth: 1920, displayHeight: 1080, rotation: 0, sar: 1, fps: 30, rFps: 30, avgFps: 30, vfr: false, interlaced: false, hdr: false, pixFmt: "yuv420p", startTime: 0 },
  audio: [{ index: 1, codec: "aac", channels: 2, sampleRate: 48000, startTime: 0 }], ignoredStreams: [],
});
const withProbe = (mut) => { const p = baseProbe(); mut(p); return probeStrict.applyPolicy(p, DEFAULTS.limits); };

t("every limit maps to its API.md §9 reason", () => {
  assert.deepEqual(probeStrict.applyPolicy(baseProbe(), DEFAULTS.limits), { ok: true, reason: null, status: 200, warnings: [], details: null });
  const cases = [
    [(p) => { p.formatName = "hls,applehttp"; }, "UNSUPPORTED_CONTAINER", 415],
    [(p) => { p.streamCount = 17; }, "TOO_MANY_STREAMS", 422],
    [(p) => { p.video = null; p.videoStreamCount = 0; }, "NO_VIDEO_STREAM", 422],
    [(p) => { p.videoStreamCount = 3; }, "MULTIPLE_VIDEO_STREAMS", 422],
    [(p) => { p.audio = []; }, "NO_AUDIO_STREAM", 422],
    [(p) => { p.audio = Array.from({ length: 5 }, (_, i) => ({ index: i + 1, codec: "aac" })); p.streamCount = 6; }, "TOO_MANY_STREAMS", 422],
    [(p) => { p.video.codec = "mjpeg"; }, "UNSUPPORTED_CODEC", 422],
    [(p) => { p.audio[0].codec = "amr_nb"; }, "UNSUPPORTED_CODEC", 422],
    [(p) => { p.durationSec = 2; }, "DURATION_TOO_SHORT", 422],
    [(p) => { p.durationSec = null; }, "DURATION_TOO_SHORT", 422],
    [(p) => { p.durationSec = 301; }, "DURATION_TOO_LONG", 422],
    [(p) => { p.video.displayWidth = 640; p.video.displayHeight = 352; }, "RESOLUTION_TOO_LOW", 422],
    [(p) => { p.video.displayWidth = 4100; p.video.displayHeight = 2000; }, "RESOLUTION_TOO_HIGH", 422],
    [(p) => { p.video.avgFps = 10; p.video.fps = 10; }, "FRAME_RATE_OUT_OF_RANGE", 422],
    [(p) => { p.video.avgFps = 144; p.video.fps = 144; }, "FRAME_RATE_OUT_OF_RANGE", 422],
    [(p) => { p.video.displayWidth = 3840; p.video.displayHeight = 2160; p.video.avgFps = 60; p.durationSec = 300; }, "WORKLOAD_TOO_LARGE", 422],
    [(p) => { p.bitrateKbps = 250000; }, "BITRATE_TOO_HIGH", 422],
  ];
  for (const [mut, reason, status] of cases) {
    const r = withProbe(mut);
    assert.equal(r.ok, false, reason);
    assert.equal(r.reason, reason);
    assert.equal(r.status, status, reason);
  }
});

t("soft findings are warnings, not rejections", () => {
  const r = withProbe((p) => {
    p.video.displayWidth = 1280; p.video.displayHeight = 640; p.video.vfr = true; p.video.interlaced = true; p.video.hdr = true;
    p.video.rotation = 90; p.audio.push({ index: 2, codec: "ac3" }); p.streamCount = 4; p.ignoredStreams = [{ type: "data", codec: "tmcd" }];
  });
  assert.equal(r.ok, true, r.reason);
  assert.deepEqual(r.warnings, ["LOW_RESOLUTION", "VFR", "INTERLACED", "HDR", "ROTATED", "EXTRA_AUDIO_STREAMS_IGNORED", "IGNORED_STREAMS"]);
});

t("policyError → 415 UNSUPPORTED_MEDIA / 422 MEDIA_REJECTED with a safe error body", () => {
  const container = probeStrict.policyError({ ok: false, reason: "UNSUPPORTED_CONTAINER", status: 415 });
  assert.deepEqual([container.code, container.status], ["UNSUPPORTED_MEDIA", 415]);
  const e = probeStrict.policyError({ ok: false, reason: "BITRATE_TOO_HIGH", status: 422, details: { limit: 200000, actual: 250000 } });
  const body = toErrorBody(e, "rq");
  assert.equal(body.error, "MEDIA_REJECTED");
  assert.deepEqual(body.details, { reason: "BITRATE_TOO_HIGH", limit: 200000, actual: 250000 });
  assert.equal(body.retryable, false);
  assert.ok(!("detail" in body));
});

t("decode sample times: 0, middle, end − 1 s (deduped for short clips)", () => {
  assert.deepEqual(probeStrict.sampleTimes(2.5), [0, 1.25, 1.5]);
  assert.deepEqual(probeStrict.sampleTimes(1), [0, 0.5]);
  assert.deepEqual(probeStrict.sampleTimes(null), [0]);
});

// ---- staging storage -------------------------------------------------------------------------
section("admission — staging storage engine");

function handle(storage, file) {
  return new Promise((resolve) => storage._handleFile({}, file, (err, info) => resolve({ err, info })));
}

t("streams to _staging/<nanoid>.upload with sha256 + size; client name never used; _removeFile unlinks", async () => {
  const s = makeSettings(path.join(tmp.dir, "root-stage"));
  const storage = admission.createStagingStorage({ settings: s });
  const stream = new PassThrough();
  const file = { fieldname: "video", originalname: "..\\..\\evil.mp4", stream };
  const data = crypto.randomBytes(300 * 1024);
  const pending = handle(storage, file);
  stream.write(data.subarray(0, 100000));
  stream.write(data.subarray(100000));
  stream.end();
  const { err, info } = await pending;
  assert.equal(err, null);
  assert.match(path.basename(info.path), /^[0-9a-z]{21}\.upload$/);
  assert.equal(path.dirname(info.path), s.paths.stagingDir);
  assert.equal(info.size, data.length);
  assert.equal(info.sha256, sha(data));
  assert.equal(file.sha256, info.sha256);
  assert.ok(fs.readFileSync(info.path).equals(data));
  await new Promise((r) => storage._removeFile({}, { path: info.path }, r));
  assert.equal(fs.existsSync(info.path), false);
  // _removeFile never touches a path outside staging
  const outside = path.join(tmp.dir, "outside.bin");
  fs.writeFileSync(outside, "keep");
  await new Promise((r) => storage._removeFile({}, { path: outside }, r));
  assert.equal(fs.existsSync(outside), true);
});

t("byte cap: overflow stops writing, deletes the partial file, reports FILE_TOO_LARGE 413 and drains the part", async () => {
  const s = makeSettings(path.join(tmp.dir, "root-cap"));
  const storage = admission.createStagingStorage({ settings: s, maxBytes: 64 * 1024 });
  const stream = new PassThrough();
  const ended = new Promise((r) => stream.once("end", r));
  const pending = handle(storage, { fieldname: "video", originalname: "big.mp4", stream });
  for (let i = 0; i < 16; i++) stream.write(crypto.randomBytes(16 * 1024));
  stream.end();
  const { err } = await pending;
  assert.ok(isEditError(err), String(err));
  assert.deepEqual([err.code, err.status], ["FILE_TOO_LARGE", 413]);
  await ended;   // the rest of the part was consumed, so busboy would never stall
  assert.deepEqual(fs.readdirSync(s.paths.stagingDir), []);
});

function postMultipart(port, content, filename = "clip.mp4") {
  const boundary = `----ve${crypto.randomBytes(8).toString("hex")}`;
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="clientRequestId"\r\n\r\nabc_123\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="video"; filename="${filename}"\r\nContent-Type: video/mp4\r\n\r\n`),
    content,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: "127.0.0.1", port, method: "POST", path: "/up", agent: false,
      headers: { "content-type": `multipart/form-data; boundary=${boundary}`, "content-length": body.length },
    }, (res) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (d) => { text += d; });
      res.on("end", () => { try { resolve({ status: res.statusCode, json: JSON.parse(text) }); } catch (e) { reject(e); } });
    });
    req.on("error", reject);
    req.end(body);
  });
}

function handleOn(storage, req, file) {
  return new Promise((resolve) => storage._handleFile(req, file, (err, info) => resolve({ err, info })));
}

t("per-field cap (logo) and per-request total cap trip as the bytes arrive, whatever Content-Length said", async () => {
  const s = makeSettings(path.join(tmp.dir, "root-fieldcap"));
  const storage = admission.createStagingStorage({ settings: s, maxBytes: 4 * MB, fieldMaxBytes: { logo: 1 * MB }, requestMaxBytes: 3 * MB });
  assert.deepEqual([storage.maxBytes, storage.fieldMaxBytes.logo, storage.requestMaxBytes], [4 * MB, 1 * MB, 3 * MB]);
  assert.equal(admission.createStagingStorage({ settings: s, maxBytes: 4 * MB }).requestMaxBytes, 5 * MB, "default request cap = maxBytes + 1 MB");

  const logo = new PassThrough();
  const logoEnded = new Promise((r) => logo.once("end", r));
  const pendingLogo = handleOn(storage, {}, { fieldname: "logo", originalname: "l.png", stream: logo });
  for (let i = 0; i < 8; i++) logo.write(crypto.randomBytes(256 * 1024));   // 2 MB, within the file cap, over the logo cap
  logo.end();
  const lr = await pendingLogo;
  assert.ok(isEditError(lr.err), String(lr.err));
  assert.deepEqual([lr.err.code, lr.err.status, lr.err.extra.field, lr.err.extra.limitMb], ["FILE_TOO_LARGE", 413, "logo", 1]);
  await logoEnded;
  assert.deepEqual(fs.readdirSync(s.paths.stagingDir), [], "the partial logo is gone");

  // Two parts of one request (e.g. a chunked body with no Content-Length): each under its cap, together over.
  const req = {};
  const one = new PassThrough();
  const first = handleOn(storage, req, { fieldname: "video", originalname: "a.mp4", stream: one });
  one.end(crypto.randomBytes(2 * MB));
  assert.equal((await first).err, null);
  const two = new PassThrough();
  const second = handleOn(storage, req, { fieldname: "extra", originalname: "b.mp4", stream: two });
  two.end(crypto.randomBytes(2 * MB));
  const sr = await second;
  assert.deepEqual([sr.err && sr.err.code, sr.err && sr.err.extra.reason], ["FILE_TOO_LARGE", "REQUEST_TOO_LARGE"]);
  assert.equal(fs.readdirSync(s.paths.stagingDir).length, 1, "only the first part stays staged (multer removes it on abort)");
  const other = new PassThrough();
  const third = handleOn(storage, {}, { fieldname: "video", originalname: "c.mp4", stream: other });
  other.end(crypto.randomBytes(2 * MB));
  assert.equal((await third).err, null, "the budget is per request");
});

t("real multer + express (loopback): oversized part → 413 with empty staging; small part → staged with sha256", async () => {
  const express = require("express");
  const multer = require("multer");
  const s = makeSettings(path.join(tmp.dir, "root-multer"));
  const storage = admission.createStagingStorage({ settings: s, maxBytes: 1 * MB });
  const app = express();
  app.post("/up", multer({ storage, limits: { files: 2, fields: 8, fieldSize: 64 * 1024, parts: 12 } }).single("video"), (req, res) => {
    res.json({ size: req.file.size, sha256: req.file.sha256, name: path.basename(req.file.path), crid: req.body.clientRequestId });
  });
  app.use((err, req, res, next) => { res.status(err.status || 500).json({ error: err.code || "INTERNAL" }); });   // eslint-disable-line no-unused-vars
  const server = await new Promise((r) => { const srv = app.listen(0, "127.0.0.1", () => r(srv)); });
  try {
    const { port } = server.address();
    const big = await postMultipart(port, crypto.randomBytes(3 * MB));
    assert.equal(big.status, 413);
    assert.equal(big.json.error, "FILE_TOO_LARGE");
    assert.deepEqual(fs.readdirSync(s.paths.stagingDir).filter((n) => n.endsWith(".upload")), []);
    const content = crypto.randomBytes(200 * 1024);
    const small = await postMultipart(port, content, "../../../etc/passwd");
    assert.equal(small.status, 200, JSON.stringify(small.json));
    assert.equal(small.json.size, content.length);
    assert.equal(small.json.sha256, sha(content));
    assert.equal(small.json.crid, "abc_123");
    assert.match(small.json.name, /^[0-9a-z]{21}\.upload$/);
    assert.ok(fs.readFileSync(path.join(s.paths.stagingDir, small.json.name)).equals(content));
  } finally {
    await new Promise((r) => server.close(r));
  }
});

// ---- preflight & cleanup ---------------------------------------------------------------------
section("admission — preflight, quotas, cleanup");

const reqWith = (cl) => ({ headers: cl == null ? {} : { "content-length": String(cl) } });
const bigDisk = () => 1e9;

function fakeStore({ projects = [], active = { running: 0, queued: 0 }, userCreates = 0, globalCreates = 0, userBytes = 0 } = {}) {
  return {
    allProjects: () => projects,
    userActiveCounts: () => active,
    userStorageBytes: () => userBytes,
    countCreatesSince: ({ ownerId }) => (ownerId ? userCreates : globalCreates),
  };
}

t("Content-Length above cap + 1 MB → 413 before the body; at the boundary it passes", () => {
  const e = throwsCode(() => admission.preflightUpload(reqWith(501 * MB + 1), { settings, statfsFreeMb: bigDisk }), "FILE_TOO_LARGE");
  assert.equal(e.status, 413);
  const ok = admission.preflightUpload(reqWith(501 * MB), { settings, statfsFreeMb: bigDisk });
  assert.equal(ok.contentLength, 501 * MB);
  assert.equal(admission.preflightUpload(reqWith(null), { settings, statfsFreeMb: bigDisk }).contentLength, null);
});

t("requireContentLength: a chunked (length-less) upload → 411 before the body; reservedBytes raise disk need", () => {
  const e = throwsCode(() => admission.preflightUpload({ headers: { "transfer-encoding": "chunked" } }, { settings, statfsFreeMb: bigDisk, requireContentLength: true }), "LENGTH_REQUIRED");
  assert.equal(e.status, 411);
  throwsCode(() => admission.preflightUpload(reqWith("12abc"), { settings, statfsFreeMb: bigDisk, requireContentLength: true }), "LENGTH_REQUIRED");
  assert.equal(admission.preflightUpload(reqWith(MB), { settings, statfsFreeMb: bigDisk, requireContentLength: true }).contentLength, MB);
  // 4 × (100 MB + 400 MB in flight) + 1024 MB = 3024 MB
  assert.equal(admission.preflightUpload(reqWith(100 * MB), { settings, statfsFreeMb: () => 3024, reservedBytes: 400 * MB }).needMb, 3024);
  throwsCode(() => admission.preflightUpload(reqWith(100 * MB), { settings, statfsFreeMb: () => 3023, reservedBytes: 400 * MB }), "INSUFFICIENT_STORAGE");
});

t("mocked statfs below max(4×CL + 1 GB, free-disk floor) → 507; statfs unavailable → skipped", () => {
  const cl = 400 * MB;   // 4×400 MB + 1024 MB = 2624 MB needed
  const e = throwsCode(() => admission.preflightUpload(reqWith(cl), { settings, statfsFreeMb: () => 2623 }), "INSUFFICIENT_STORAGE");
  assert.equal(e.status, 507);
  assert.equal(admission.preflightUpload(reqWith(cl), { settings, statfsFreeMb: () => 2624 }).needMb, 2624);
  throwsCode(() => admission.preflightUpload(reqWith(MB), { settings, statfsFreeMb: () => 2047 }), "INSUFFICIENT_STORAGE");   // floor 2048
  assert.equal(admission.preflightUpload(reqWith(cl), { settings, statfsFreeMb: () => null }).freeMb, null);
  assert.equal(admission.preflightUpload(reqWith(cl), { settings, statfsFreeMb: () => { throw new Error("nope"); } }).freeMb, null);
});

t("quotas from store counters → 429 QUOTA_EXCEEDED {quota} / DAILY_CAP_REACHED; global storage cap → 507", () => {
  const opts = (store) => ({ settings, store, userId: "u1", statfsFreeMb: bigDisk });
  const mine = (n, status = "READY") => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, ownerId: "u1", status, storage: { bytes: 0 } }));
  const check = (store, code, quota) => {
    const e = throwsCode(() => admission.preflightUpload(reqWith(10 * MB), opts(store)), code);
    assert.equal(e.status, code === "INSUFFICIENT_STORAGE" ? 507 : 429);
    if (quota) assert.equal(e.extra.quota, quota);
    return e;
  };
  check(fakeStore({ projects: mine(20) }), "QUOTA_EXCEEDED", "projects");
  admission.preflightUpload(reqWith(10 * MB), opts(fakeStore({ projects: [...mine(19), ...mine(5, "DELETING")] })));
  check(fakeStore({ userBytes: 3 * 1024 ** 3 - MB }), "QUOTA_EXCEEDED", "storage");
  const active = check(fakeStore({ active: { running: 1, queued: 2 } }), "QUOTA_EXCEEDED", "active");
  assert.equal(active.retryable, true);
  admission.preflightUpload(reqWith(10 * MB), opts(fakeStore({ active: { running: 0, queued: 2 } })));
  check(fakeStore({ userCreates: 10 }), "QUOTA_EXCEEDED", "createsPerDay");
  check(fakeStore({ globalCreates: 50 }), "DAILY_CAP_REACHED");
  check(fakeStore({ projects: [{ id: "x", ownerId: "u9", status: "READY", storage: { bytes: 20480 * MB } }] }), "INSUFFICIENT_STORAGE");
});

t("real store counters: a user at maxProjects is refused, another user is not", () => {
  const s = makeSettings(path.join(tmp.dir, "root-quota"), { videoEdit: { limits: { perUser: { maxProjects: 2 } } } });
  const store = createStore({ settings: s, log: silentLog });
  store.init();
  try {
    store.createProject({ ownerId: "u1", consent: { thirdPartyAi: true } });
    store.createProject({ ownerId: "u1", consent: { thirdPartyAi: true } });
    const e = throwsCode(() => admission.preflightUpload(reqWith(MB), { settings: s, store, userId: "u1", statfsFreeMb: bigDisk }), "QUOTA_EXCEEDED");
    assert.equal(e.extra.quota, "projects");
    admission.preflightUpload(reqWith(MB), { settings: s, store, userId: "u2", statfsFreeMb: bigDisk });
  } finally { store.close(); }
});

t("discardStaged removes staged files only and accepts a file, a list, or multer's req.files map", async () => {
  const s = makeSettings(path.join(tmp.dir, "root-discard"));
  fs.mkdirSync(s.paths.stagingDir, { recursive: true });
  const a = path.join(s.paths.stagingDir, "a.upload"), b = path.join(s.paths.stagingDir, "b.upload"), c = path.join(s.paths.stagingDir, "c.upload");
  for (const p of [a, b, c]) fs.writeFileSync(p, "x");
  const outside = path.join(tmp.dir, "precious.bin");
  fs.writeFileSync(outside, "keep");
  const sneaky = path.join(s.paths.stagingDir, "..", "..", "precious2.bin");
  fs.writeFileSync(sneaky, "keep");
  const removed = await admission.discardStaged([{ path: a }, outside, { video: [{ path: b }], logo: [{ path: sneaky }] }, null, { path: s.paths.stagingDir }], { settings: s });
  assert.equal(removed, 2);
  assert.deepEqual([fs.existsSync(a), fs.existsSync(b), fs.existsSync(c)], [false, false, true]);
  assert.equal(fs.existsSync(outside), true);
  assert.equal(fs.existsSync(sneaky), true);
  assert.equal(fs.existsSync(s.paths.stagingDir), true);
  assert.equal(await admission.discardStaged(c, { settings: s }), 1);
});

t("sanitizeDisplayName: basename, NFC, control + bidi stripped, ≤80 units without a split surrogate", () => {
  assert.equal(admission.sanitizeDisplayName("C:\\Users\\me\\a\u202Eb\u2066c\u0000d.mp4"), "abcd.mp4");
  assert.equal(admission.sanitizeDisplayName("/home/x/Cafe\u0301.mov"), "Caf\u00e9.mov");
  assert.equal(admission.sanitizeDisplayName("\u202A\u202C"), "video");
  assert.equal(admission.sanitizeDisplayName(null), "video");
  const long = `${"a".repeat(79)}\u{1F600}rest.mp4`;
  const clean = admission.sanitizeDisplayName(long);
  assert.equal(clean, "a".repeat(79));
  assert.ok(clean.length <= 80);
});

// ---- normalize -------------------------------------------------------------------------------
section("normalize");

function makeProject(name, fixtureName) {
  const dir = path.join(tmp.dir, "projects", name);
  fs.mkdirSync(path.join(dir, "source"), { recursive: true });
  fs.copyFileSync(fx(fixtureName), path.join(dir, "source", "original.bin"));
  return dir;
}

const ALLOWED_FORMAT_TAGS = ["major_brand", "minor_version", "compatible_brands", "encoder"];

async function assertNormalized(dir, out, { width, height }) {
  const mezzFile = path.join(dir, "work", "mezz.mp4");
  assert.equal(out.mezz.path, "work/mezz.mp4");
  const m = ffprobe(mezzFile);
  const v = m.streams.find((x) => x.codec_type === "video");
  const audio = m.streams.filter((x) => x.codec_type === "audio");
  assert.equal(m.streams.length, 2, `mezz streams: ${m.streams.map((x) => x.codec_type).join()}`);
  assert.equal(v.codec_name, "h264");
  assert.equal(v.pix_fmt, "yuv420p");
  assert.equal(v.r_frame_rate, "30/1");
  assert.equal(v.avg_frame_rate, "30/1");
  assert.deepEqual([v.width, v.height], [width, height]);
  assert.ok(v.width % 2 === 0 && v.height % 2 === 0 && Math.max(v.width, v.height) <= 1920);
  assert.ok(!(v.side_data_list || []).some((d) => d.rotation), "rotation side data survived");
  assert.equal(audio.length, 1);
  assert.deepEqual([audio[0].codec_name, audio[0].sample_rate, audio[0].channels], ["aac", "48000", 2]);
  for (const k of Object.keys((m.format && m.format.tags) || {})) assert.ok(ALLOWED_FORMAT_TAGS.includes(k), `unexpected format tag ${k}`);
  assert.ok(!/Secret|"fra"|timecode/i.test(JSON.stringify(m)), "metadata survived normalize");
  assert.deepEqual([out.mezz.width, out.mezz.height, out.mezz.fps], [width, height, 30]);
  assert.ok(out.mezz.durationSec > 1.5);
  assert.equal(out.mezz.sha256, sha(fs.readFileSync(mezzFile)));

  for (const [rel, rate] of [[out.voice48k.path, "48000"], [out.audio16k.path, "16000"]]) {
    const w = ffprobe(path.join(dir, rel));
    assert.equal(w.streams.length, 1, rel);
    assert.deepEqual([w.streams[0].codec_name, w.streams[0].sample_rate, w.streams[0].channels], ["pcm_s16le", rate, 1], rel);
  }
  assert.deepEqual([out.voice48k.path, out.audio16k.path], ["work/voice48k.wav", "work/audio16k.wav"]);

  const p = ffprobe(path.join(dir, out.proxy.path));
  const pv = p.streams.find((x) => x.codec_type === "video");
  assert.equal(Math.min(pv.width, pv.height), Math.min(540, width, height));
  assert.ok(pv.width % 2 === 0 && pv.height % 2 === 0);
  assert.ok(p.streams.some((x) => x.codec_type === "audio"), "proxy has no audio");
  assert.ok(!/Secret/i.test(JSON.stringify(p)));

  const poster = fs.readFileSync(path.join(dir, out.poster.path));
  assert.deepEqual([poster[0], poster[1]], [0xff, 0xd8], "poster is not a JPEG");
  const ps = ffprobe(path.join(dir, out.poster.path)).streams[0];
  assert.equal(Math.max(ps.width, ps.height), Math.min(640, Math.max(width, height)));

  assert.deepEqual(fs.readdirSync(path.join(dir, "work")).filter((n) => n.includes(".tmp.")), [], "temp files left behind");
}

t("planNormalize: stream copy only for h264 yuv420p CFR 30 SDR unrotated ≤1920; dims fit and stay even", () => {
  const v = (patch) => ({ video: { ...baseProbe().video, ...patch } });
  assert.equal(planNormalize(v({})).copy, true);
  for (const patch of [{ avgFps: 29.97, fps: 29.97, rFps: 29.97 }, { codec: "hevc" }, { rotation: 90, displayWidth: 1080, displayHeight: 1920 },
    { vfr: true }, { interlaced: true }, { hdr: true }, { pixFmt: "yuv420p10le" }, { width: 2560, height: 1440, displayWidth: 2560, displayHeight: 1440 }, { sar: 1.333 },
    { startTime: 0.5 }, { startTime: -0.1 }, { startTime: null }, { startTime: undefined }]) {
    assert.equal(planNormalize(v(patch)).copy, false, JSON.stringify(patch));
  }
  assert.equal(planNormalize(v({ startTime: 0.01 })).copy, true, "within half a frame");
  const withAudio = (start) => ({ ...baseProbe(), audio: [{ ...baseProbe().audio[0], startTime: start }] });
  assert.equal(planNormalize(withAudio(0)).copy, true);
  assert.equal(planNormalize(withAudio(0.5)).copy, false, "audio offset");
  assert.equal(planNormalize(withAudio(null)).copy, false, "unknown audio start");
  assert.deepEqual((({ width, height }) => [width, height])(planNormalize(v({ rotation: 90, displayWidth: 1080, displayHeight: 1920 }))), [1080, 1920]);
  assert.deepEqual((({ width, height }) => [width, height])(planNormalize(v({ width: 3840, height: 2160, displayWidth: 3840, displayHeight: 2160 }))), [1920, 1080]);
  assert.deepEqual((({ width, height }) => [width, height])(planNormalize(v({ width: 1279, height: 719, displayWidth: 1279, displayHeight: 719 }))), [1280, 720]);
  const chain = planNormalize(v({ interlaced: true, hdr: true, colorTransfer: "arib-std-b67" })).videoFilter;
  assert.ok(chain.startsWith("yadif,scale="), chain);
  assert.ok(chain.includes("zscale=tin=arib-std-b67") && chain.endsWith("fps=30,format=yuv420p"), chain);
});

t("h264 CFR 30 source takes the stream-copy path; audio re-muxed, tags stripped, wavs mono 48 k / 16 k, proxy, poster", async () => {
  const dir = makeProject("copy", "ok.mp4");
  const probe = await probeStrict.probeStrict(fx("ok.mp4"), { demuxer: "mov", settings });
  const pcts = [];
  const out = await normalizeSource({ projectDir: dir, demuxer: "mov", probe, runId: "run_copy0001", settings, onProgress: (p, info) => pcts.push([p, info.step]), log: silentLog });
  assert.equal(out.copied, true);
  await assertNormalized(dir, out, { width: 640, height: 360 });
  const values = pcts.map((x) => x[0]);
  assert.ok(values.length >= 2 && values.every((x, i) => i === 0 || x >= values[i - 1]), `progress not monotonic: ${values}`);
  assert.equal(values[values.length - 1], 100);
});

t("video stream starting at 0.5 s is re-encoded, not copied: mezzanine video starts at 0 and spans the audio", async () => {
  const dir = makeProject("offset", "offset.mp4");
  const probe = await probeStrict.probeStrict(fx("offset.mp4"), { demuxer: "mov", settings });
  assert.ok(Math.abs(probe.video.startTime - 0.5) < 0.01, `video startTime ${probe.video.startTime}`);
  assert.equal(probe.audio[0].startTime, 0);
  assert.equal(planNormalize(probe).copy, false);
  const out = await normalizeSource({ projectDir: dir, demuxer: "mov", probe, runId: "run_offs0001", settings, log: silentLog });
  assert.equal(out.copied, false);
  await assertNormalized(dir, out, { width: 640, height: 360 });
  const m = ffprobe(path.join(dir, "work", "mezz.mp4"));
  const v = m.streams.find((x) => x.codec_type === "video");
  const a = m.streams.find((x) => x.codec_type === "audio");
  assert.ok(Math.abs(Number(v.start_time)) <= 1 / 60, `mezz video start_time ${v.start_time}`);
  assert.ok(Math.abs(Number(v.duration) - Number(a.duration)) < 0.1, `video ${v.duration}s vs audio ${a.duration}s`);
  assert.ok(Math.abs(Number(v.nb_frames) - 90) <= 2, `frames ${v.nb_frames}: the 0.5 s lead is padded, not dropped`);
});

t("the tolerant retry never stream-copies, even for a copy-eligible source", async () => {
  const dir = makeProject("tolerant", "ok.mp4");
  const probe = await probeStrict.probeStrict(fx("ok.mp4"), { demuxer: "mov", settings });
  assert.equal(planNormalize(probe).copy, true);
  const out = await normalizeSource({ projectDir: dir, demuxer: "mov", probe, runId: "run_tol00001", settings, tolerant: true, log: silentLog });
  assert.equal(out.copied, false);
  await assertNormalized(dir, out, { width: 640, height: 360 });
});

t("rotated mov is re-encoded upright: 640×360 @90° → 360×640, CFR 30, tmcd and tags dropped", async () => {
  const dir = makeProject("rot", "rot.mov");
  const probe = await probeStrict.probeStrict(fx("rot.mov"), { demuxer: "mov", settings });
  const out = await normalizeSource({ projectDir: dir, demuxer: "mov", probe, runId: "run_rot00001", settings, log: silentLog });
  assert.equal(out.copied, false);
  await assertNormalized(dir, out, { width: 360, height: 640 });
});

t("HDR + interlaced 25 fps 2000×1124 → tonemapped, deinterlaced, 1920×1080 CFR 30", async () => {
  const dir = makeProject("hdr", "big.mp4");
  const probe = await probeStrict.probeStrict(fx("big.mp4"), { demuxer: "mov", settings });
  const out = await normalizeSource({ projectDir: dir, demuxer: "mov", probe, runId: "run_hdr00001", settings, log: silentLog });
  assert.equal(out.copied, false);
  await assertNormalized(dir, out, { width: 1920, height: 1080 });
  const v = ffprobe(path.join(dir, "work", "mezz.mp4")).streams.find((x) => x.codec_type === "video");
  assert.notEqual(v.color_transfer, "smpte2084");
  assert.ok(!v.field_order || v.field_order === "progressive", `field_order ${v.field_order}`);
});

t("webm source normalizes through the matroska demuxer", async () => {
  const dir = makeProject("webm", "w.webm");
  const probe = await probeStrict.probeStrict(fx("w.webm"), { demuxer: "matroska", settings });
  const out = await normalizeSource({ projectDir: dir, demuxer: "matroska", probe, runId: "run_webm0001", settings, log: silentLog });
  assert.equal(out.copied, false);
  await assertNormalized(dir, out, { width: 640, height: 360 });
});

t("normalize:exit1 fault → PROC_EXIT; no final outputs, no temp files", async () => {
  const faulty = makeSettings(path.join(tmp.dir, "root-nfault"), { env: { VIDEO_EDIT_FAULTS: "normalize:exit1" } });
  const dir = makeProject("fault", "ok.mp4");
  const probe = await probeStrict.probeStrict(fx("ok.mp4"), { demuxer: "mov", settings });
  await rejects(normalizeSource({ projectDir: dir, demuxer: "mov", probe, runId: "run_fault001", settings: faulty, log: silentLog }), "PROC_EXIT");
  assert.deepEqual(fs.readdirSync(path.join(dir, "work")), []);
});

t("abort mid-normalize → PROC_ABORTED and this run's temp files are removed", async () => {
  const dir = makeProject("abort", "big.mp4");
  const probe = await probeStrict.probeStrict(fx("big.mp4"), { demuxer: "mov", settings });
  const ac = new AbortController();
  setTimeout(() => ac.abort(), 400);
  const started = Date.now();
  await rejects(normalizeSource({ projectDir: dir, demuxer: "mov", probe, runId: "run_abort001", settings, signal: ac.signal, log: silentLog }), "PROC_ABORTED");
  assert.ok(Date.now() - started < 8000, `abort took ${Date.now() - started}ms`);
  assert.deepEqual(fs.readdirSync(path.join(dir, "work")).filter((n) => n.includes(".tmp.")), []);
});

t("bad inputs are refused before any spawn (demuxer, runId, sourceRel escape)", async () => {
  const dir = makeProject("bad", "ok.mp4");
  const probe = baseProbe();
  await rejects(normalizeSource({ projectDir: dir, demuxer: "hls", probe, settings }), "NORMALIZE_BAD_INPUT");
  await rejects(normalizeSource({ projectDir: dir, demuxer: "mov", probe, runId: "run;rm", settings }), "NORMALIZE_BAD_INPUT");
  await rejects(normalizeSource({ projectDir: dir, demuxer: "mov", probe, sourceRel: "../ok.mp4", settings }), "PATH_ESCAPE");
});

t("nothing leaked outside the temp dir", () => {
  if (!serverEditsExisted) assert.equal(fs.existsSync(SERVER_EDITS), false, "server/edits was created");
});

run().then(() => {
  restoreFetch();
  tmp.cleanup();
});
