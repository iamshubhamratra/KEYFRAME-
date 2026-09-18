// Tests for the AI Video Edit audio + brand render modules: audio/{voice,mix,music,sfx}.js and brand/brand.js.
// Run: node scripts/video_edit_audio_render.test.cjs
//
// Load-bearing, all measured on real media (ffmpeg/ffprobe), offline, in a temp project:
//   - voice stem: sample count = Σ frames × 1600 (+ pads, speed pieces, holds); sample-exact piece offsets;
//     no clicks at mid-vowel joints (max |Δ| within ±1 ms ≤ 3× neighbourhood median) while a no-fade control
//     does click; −16 ± 0.5 LUFS by an independent ebur128 run; cache hit on the same inputs; the full
//     analysis chain adds no lag.
//   - mixFinal: −14 ± 1.5 LU, TP ≤ −1.0 dBTP, report == an independent ebur128 run, A/V offset ≤ 33 ms (and
//     within 2 ms of an independent waveform xcorr), video packets bit-identical to the composite — once on a
//     calm stem (no post-pass needed) and once on a hot, transient-heavy stem that forces the TP post-pass.
//   - music candidates with injected fetchers (invalid download rejected; bridge down → fetchMusic pad);
//     envelope points ≤ 12; SFX licence lookup; logo palette from opaque pixels only; SVG rasterized or fail-open.
//
// config.js loads server/.env and db.js opens the database, so the services that require them
// (sfx_library, audio_sources, art_director) are loaded against require.cache stubs below.

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const { spawnSync } = require("node:child_process");
const { createHarness, mkTmp, installFetchTripwire } = require("./lib/video_edit_test_utils.cjs");

const SERVER_ROOT = path.resolve(__dirname, "..");
const SRC = path.join(SERVER_ROOT, "src");
function stubModule(rel, exportsObj) {
  const file = require.resolve(path.join(SRC, rel));
  const m = new Module(file, null);
  m.filename = file;
  m.loaded = true;
  m.exports = exportsObj;
  require.cache[file] = m;
}
stubModule("config.js", { paths: { root: SERVER_ROOT }, audio: {}, llm: {}, artDirector: { enabled: false } });
stubModule("db.js", { setBrandReview() {} });
stubModule("services/openrouter.js", { chat: async () => { throw new Error("no LLM in tests"); } });
stubModule("services/frame_manifest.js", { getManifest: () => null });

const V = require("../src/video_edit/audio/voice");
const MX = require("../src/video_edit/audio/mix");
const MU = require("../src/video_edit/audio/music");
const SX = require("../src/video_edit/audio/sfx");
const B = require("../src/video_edit/brand/brand");
const schema = require("../src/video_edit/plan/schema");
const brandKit = require("../src/services/brand_kit");
const { isEditError } = require("../src/video_edit/errors");

const { t, section, run } = createHarness();
const restoreFetch = installFetchTripwire();
const tmp = mkTmp("ve-audio-");
const PROJ = path.join(tmp.dir, "proj");
fs.mkdirSync(path.join(PROJ, "work"), { recursive: true });
const measured = {};

// ---- helpers ------------------------------------------------------------------------------------
function ff(args, { stdout = false } = {}) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostdin", "-loglevel", "error", ...args], { windowsHide: true, maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${String(r.stderr).slice(-500)}`);
  return stdout ? r.stdout : r;
}
function ffprobe(args) {
  const r = spawnSync("ffprobe", ["-v", "error", "-of", "json", ...args], { windowsHide: true, encoding: "utf8", maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error(`ffprobe failed: ${r.stderr}`);
  return JSON.parse(r.stdout);
}
// Independent EBU R128 run (own spawn, own parser).
function ebur128(file) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-map", "0:a:0", "-af", "ebur128=peak=true", "-f", "null", "-"], { windowsHide: true, encoding: "utf8", maxBuffer: 1 << 26 });
  const s = r.stderr.slice(r.stderr.lastIndexOf("Summary:"));
  const num = (re) => { const m = s.match(re); return m ? Number(m[1]) : NaN; };
  return { I: num(/I:\s+(-?[\d.]+) LUFS/), LRA: num(/LRA:\s+(-?[\d.]+) LU/), TP: num(/Peak:\s+(-?[\d.]+) dBFS/) };
}
function readWavS16(p) {
  const b = fs.readFileSync(p);
  let off = 12, fmt = null, data = null;
  while (off + 8 <= b.length) {
    const id = b.toString("ascii", off, off + 4), sz = b.readUInt32LE(off + 4);
    if (id === "fmt ") fmt = { tag: b.readUInt16LE(off + 8), ch: b.readUInt16LE(off + 10), sr: b.readUInt32LE(off + 12), bits: b.readUInt16LE(off + 22) };
    if (id === "data") { data = b.subarray(off + 8, off + 8 + Math.min(sz, b.length - off - 8)); break; }
    off += 8 + sz + (sz & 1);
  }
  assert.ok(fmt && fmt.bits === 16 && data, `not an s16 wav: ${p}`);
  const n = Math.floor(data.length / 2 / fmt.ch);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = data.readInt16LE(i * 2 * fmt.ch) / 32768;
  return { sr: fmt.sr, ch: fmt.ch, x };
}
function decodeF32(file, { sr = 48000, af = "pan=mono|c0=c0" } = {}) {
  const buf = ff(["-i", file, "-map", "0:a:0", "-af", af, "-ac", "1", "-ar", String(sr), "-f", "f32le", "-"], { stdout: true });
  return new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 4)).slice();
}
function median(arr) { const a = Float64Array.from(arr).sort(); return a.length ? a[Math.floor((a.length - 1) / 2)] : NaN; }
function nccAt(a, a0, b, b0, len) {
  let sa = 0, sb = 0;
  for (let i = 0; i < len; i++) { sa += a[a0 + i]; sb += b[b0 + i]; }
  const ma = sa / len, mb = sb / len;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < len; i++) { const u = a[a0 + i] - ma, v = b[b0 + i] - mb; num += u * v; da += u * u; db += v * v; }
  return num / Math.sqrt(da * db);
}
function bestLag(a, a0, b, b0, len, lo, hi, step = 1) {
  let best = { lag: 0, c: -2 };
  for (let lag = lo; lag <= hi; lag += step) { const c = nccAt(a, a0, b, b0 + lag, len); if (c > best.c) best = { lag, c }; }
  return best;
}
// RMS envelope (10 ms window, 1 ms hop at 48 kHz) — phase-insensitive, so it measures delay, not filter phase.
function envelope48(x) {
  const W = 480, H = 48, m = Math.floor((x.length - W) / H), e = new Float64Array(Math.max(0, m));
  for (let k = 0; k < m; k++) { let s = 0; for (let i = 0; i < W; i++) s += x[k * H + i] ** 2; e[k] = Math.sqrt(s / W); }
  return e;
}
function hexDist(a, b) {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const x = p(a), y = p(b);
  return Math.abs(x[0] - y[0]) + Math.abs(x[1] - y[1]) + Math.abs(x[2] - y[2]);
}
function makeComposite(file, frames) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  ff(["-y", "-f", "lavfi", "-i", "testsrc2=size=540x960:rate=30", "-frames:v", String(frames), "-c:v", "libx264", "-preset", "ultrafast", "-crf", "30",
    "-pix_fmt", "yuv420p", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv", "-r", "30",
    "-video_track_timescale", "30000", "-bf", "0", "-g", "60", "-movflags", "+faststart", "-an", file]);
  return file;
}
function videoPackets(file) {
  return String(ff(["-i", file, "-map", "0:v:0", "-c", "copy", "-f", "framemd5", "-"], { stdout: true })).split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#")).map((l) => l.split(",").map((s) => s.trim()));
}
async function expectCode(promise, code) {
  try { await promise; } catch (e) { assert.ok(isEditError(e), `expected EditError, got ${e && e.stack}`); assert.equal(e.code, code); return e; }
  throw new Error(`expected ${code}`);
}

// Shared checks for a delivered mix: report == independent ebur128, loudness/TP targets, A/V, video packets, container.
function verifyMix({ result, compositePath, voicePath, durationFrames, label }) {
  const out = result.path;
  const rep = JSON.parse(fs.readFileSync(result.reportPath, "utf8"));
  assert.deepEqual(rep, JSON.parse(JSON.stringify(result.report)));
  const e = ebur128(out);
  const m = {
    independent: e, report: { I: rep.integratedLufs, TP: rep.truePeakDbtp, LRA: rep.lraLu }, preMeasured: rep.preMeasured,
    postPass: { applied: rep.postPass.applied, chosen: rep.postPass.chosen, attempts: rep.postPass.attempts.map((a) => [a.chain, a.integratedLufs, a.truePeakDbtp]) },
    mixReportStale: rep.mixReport && { I: rep.mixReport.integratedLufs, TP: rep.mixReport.truePeakDb, gainAppliedDb: rep.mixReport.gainAppliedDb },
    avOffset: rep.avOffset, timingsMs: rep.timingsMs,
  };
  measured[label] = m;
  assert.ok(Math.abs(e.I - -14) <= 1.5, `final ${e.I} LUFS`);
  assert.ok(e.TP <= -1.0, `final TP ${e.TP} dBTP`);
  assert.equal(rep.integratedLufs, e.I);
  assert.equal(rep.truePeakDbtp, e.TP);
  assert.equal(rep.lraLu, e.LRA);
  assert.equal(rep.truePeakOk, true);
  assert.equal(rep.loudnessOk, true);

  // A/V: module report and an independent 48 kHz waveform xcorr (voice [2 s, 8 s] vs the mix's left channel).
  assert.ok(rep.avOffset && Math.abs(rep.avOffset.ms) <= 33, `A/V offset ${rep.avOffset && rep.avOffset.ms} ms`);
  const voice = decodeF32(voicePath), mixA = decodeF32(out);
  const coarse = bestLag(voice, 96000, mixA, 96000, 288000, -1600, 1600, 8);
  const fine = bestLag(voice, 96000, mixA, 96000, 288000, coarse.lag - 8, coarse.lag + 8);
  const streams = ffprobe(["-show_entries", "stream=codec_type,start_time", out]).streams;
  const container = (Number(streams.find((s) => s.codec_type === "audio").start_time) - Number(streams.find((s) => s.codec_type === "video").start_time)) * 1000;
  const independentMs = container + (fine.lag / 48000) * 1000;
  m.avIndependentMs = +independentMs.toFixed(2);
  m.avIndependentCorr = +fine.c.toFixed(3);
  assert.ok(Math.abs(independentMs) <= 33, `independent A/V ${independentMs} ms`);
  assert.ok(Math.abs(independentMs - rep.avOffset.ms) <= 2, `report ${rep.avOffset.ms} ms vs independent ${independentMs.toFixed(2)} ms`);

  // Video: packet data bit-identical to the composite.
  const pa = videoPackets(compositePath), pb = videoPackets(out);
  assert.equal(pa.length, durationFrames);
  assert.equal(pb.length, pa.length, `packet count ${pb.length} vs ${pa.length}`);
  for (let i = 0; i < pa.length; i++) assert.deepEqual([pb[i][4], pb[i][5]], [pa[i][4], pa[i][5]], `packet ${i} differs`);
  m.videoPacketsIdentical = pa.length;
  m.videoTimestampsIdentical = pa.every((p, i) => p[1] === pb[i][1] && p[2] === pb[i][2]);

  const probe = ffprobe(["-show_entries", "stream=codec_type,codec_name,sample_rate,channels:format=duration", out]);
  const au = probe.streams.find((s) => s.codec_type === "audio");
  assert.equal(au.codec_name, "aac");
  assert.equal(Number(au.sample_rate), 44100);
  assert.equal(Number(au.channels), 2);
  assert.ok(Math.abs(Number(probe.format.duration) - durationFrames / 30) <= 0.05, `duration ${probe.format.duration} vs ${durationFrames / 30}`);
  assert.deepEqual(fs.readdirSync(path.dirname(out)).filter((f) => /\.tmp\./.test(f)), [], "temp files left next to the output");
  return rep;
}

// ---- speech-like source (same formula in JS to place cuts mid-vowel) -------------------------------
const SRC_SEC = 24;
const phase = (t) => 3.6 * t - 0.68209 * Math.cos(2 * Math.PI * 0.21 * t);
const frac = (v) => v - Math.floor(v);
const gate = (t) => Math.sin(2 * Math.PI * 0.31 * t) + 0.6 * Math.sin(2 * Math.PI * 0.83 * t + 1.3) > -0.55;
const syl = (t) => Math.sin(Math.PI * frac(phase(t))) ** 2;
const noiseOn = (t) => frac(phase(t) * 0.5) > 0.8;
const P_EXPR = "(3.6*t-0.68209*cos(2*PI*0.21*t))";
const F_EXPR = "(2*PI*(110*t-7.5071*cos(2*PI*0.53*t)-1.12344*cos(2*PI*1.7*t)))";
const SPEECH_EXPR = `gt(sin(2*PI*0.31*t)+0.6*sin(2*PI*0.83*t+1.3),-0.55)*(pow(sin(PI*mod(${P_EXPR},1)),2)*(0.30*sin(${F_EXPR})+0.18*sin(2*${F_EXPR})+0.10*sin(3*${F_EXPR})+0.05*sin(5*${F_EXPR}))+0.05*(2*random(0)-1)*gt(mod(${P_EXPR}*0.5,1),0.8))`;
// A cut is "mid-vowel" when voiced, inside a loud part of the syllable, and no fricative noise within ±60 ms
// (white noise has |Δ| comparable to its amplitude, which is not what a click detector should flag).
const speechy = (F) => {
  const tt = F / 30;
  if (!(gate(tt - 0.1) && gate(tt) && gate(tt + 0.1) && syl(tt) > 0.45)) return false;
  for (let d = -0.06; d <= 0.0601; d += 0.01) if (noiseOn(tt + d)) return false;
  return true;
};
function nearSpeechy(F) { for (let d = 0; d < 25; d++) { if (speechy(F + d)) return F + d; if (speechy(F - d)) return F - d; } throw new Error(`no mid-vowel frame near ${F}`); }

let PIECES, JOINTS, EXPECTED_SAMPLES, PLAY_SEGMENTS, stemPlain;
const CHAIN_PLAIN = { highpassHz: 80, notchesHz: [], afftdn: null, dynaudnorm: false, deesser: false };

section("voice stem — cut, joints, loudness, cache");

t("fixture: 24 s speech-like voice48k.wav (pcm_s16le 48 kHz mono)", async () => {
  ff(["-y", "-f", "lavfi", "-i", `aevalsrc=exprs='${SPEECH_EXPR}':s=48000:d=${SRC_SEC}`, "-ac", "1", "-c:a", "pcm_s16le", path.join(PROJ, "work", "voice48k.wav")]);
  const s = ffprobe(["-show_entries", "stream=sample_rate,channels,duration_ts", path.join(PROJ, "work", "voice48k.wav")]).streams[0];
  assert.equal(Number(s.sample_rate), 48000);
  assert.equal(Number(s.duration_ts), SRC_SEC * 48000);
  const e0 = nearSpeechy(102), s1 = nearSpeechy(180), e1 = nearSpeechy(270), s2 = nearSpeechy(345), e2 = nearSpeechy(489), s3 = nearSpeechy(540);
  PIECES = [
    { srcInS: 12 / 30, srcOutS: e0 / 30, rate: 1, padS: 0 },
    { srcInS: s1 / 30, srcOutS: e1 / 30, rate: 1, padS: 0 },
    { srcInS: s2 / 30, srcOutS: e2 / 30, rate: 1, padS: 0 },
    { srcInS: s3 / 30, srcOutS: 600 / 30, rate: 1, padS: 0.3 },       // FREEZE after this piece (apad 9 frames)
    { srcInS: 620 / 30, srcOutS: 680 / 30, rate: 1.5, padS: 0 },     // SPEED 1.5× → round(60/1.5) = 40 frames
    { srcInS: 680 / 30, srcOutS: 680 / 30, rate: 1, padS: 0.2 },      // hold piece: 6 frames of silence
  ];
  PLAY_SEGMENTS = [[12, e0], [s1, e1], [s2, e2]];
  const frames = (e0 - 12) + (e1 - s1) + (e2 - s2) + (600 - s3) + 9 + 40 + 6;
  EXPECTED_SAMPLES = frames * 1600;
  JOINTS = [(e0 - 12) * 1600, (e0 - 12 + e1 - s1) * 1600, (e0 - 12 + e1 - s1 + e2 - s2) * 1600];
  measured.voiceFrames = frames;
  measured.cutFrames = { e0, s1, e1, s2, e2, s3 };
});

t("stem sample count = Σ frames × 1600 (pads, speed, hold) and −16 ± 0.5 LUFS (independent ebur128)", async () => {
  const t0 = Date.now();
  stemPlain = await V.buildVoiceStem({ projectDir: PROJ, pieces: PIECES, chain: CHAIN_PLAIN, runId: "run_voice001" });
  measured.voiceBuildMs = Date.now() - t0;
  assert.equal(stemPlain.cached, false);
  assert.equal(stemPlain.samples, EXPECTED_SAMPLES);
  const st = ffprobe(["-show_entries", "stream=sample_rate,channels,codec_name,duration_ts", stemPlain.path]).streams[0];
  assert.equal(st.codec_name, "pcm_s16le");
  assert.equal(Number(st.sample_rate), 48000);
  assert.equal(Number(st.channels), 1);
  assert.equal(Number(st.duration_ts), EXPECTED_SAMPLES, `duration_ts ${st.duration_ts} != ${EXPECTED_SAMPLES}`);
  assert.equal(readWavS16(stemPlain.path).x.length, EXPECTED_SAMPLES);
  const e = ebur128(stemPlain.path);
  measured.voiceStem = { lufs: e.I, tp: e.TP, lra: e.LRA, reportedLufs: stemPlain.lufs, gainDb: stemPlain.gainDb };
  assert.ok(Math.abs(e.I - -16) <= 0.5, `stem ${e.I} LUFS`);
  assert.equal(stemPlain.lufs, e.I);
  assert.ok(fs.readdirSync(path.dirname(stemPlain.path)).every((f) => !/\.tmp\./.test(f)), "temp files left behind");
});

t("piece offsets are sample-exact (xcorr of each play piece vs the identically high-passed source peaks at lag 0)", async () => {
  // The stem is high-passed at 80 Hz; compare against the same filter so its phase response cancels out.
  const src = decodeF32(path.join(PROJ, "work", "voice48k.wav"), { af: "highpass=f=80" });
  const stem = readWavS16(stemPlain.path).x;
  let outStart = 0;
  const lags = [];
  for (const [inF, outF] of PLAY_SEGMENTS) {
    const len = Math.min(24000, (outF - inF) * 1600 - 4000);
    const best = bestLag(src, inF * 1600 + 2000, stem, outStart + 2000, len, -48, 48);
    lags.push({ lag: best.lag, c: Math.round(best.c * 10000) / 10000 });
    assert.equal(best.lag, 0, `piece at src frame ${inF}: lag ${best.lag} samples`);
    assert.ok(best.c > 0.99, `corr ${best.c}`);
    outStart += (outF - inF) * 1600;
  }
  measured.pieceLags = lags;
});

t("mid-vowel joints are click-free (max |Δ| ±1 ms ≤ 3× neighbourhood median); a no-fade control clicks", async () => {
  const joints = (x) => JOINTS.map((J) => {
    let maxD = 0;
    for (let i = J - 48; i <= J + 48; i++) maxD = Math.max(maxD, Math.abs(x[i] - x[i - 1]));
    const ring = []; let rms = 0;
    for (let i = J - 2400; i < J - 240; i++) { ring.push(Math.abs(x[i] - x[i - 1])); rms += x[i] * x[i]; }
    for (let i = J + 240; i < J + 2400; i++) { ring.push(Math.abs(x[i] - x[i - 1])); rms += x[i] * x[i]; }
    const med = median(ring);
    return { J, maxD, med, ratio: maxD / Math.max(med, 1e-5), ringRms: Math.sqrt(rms / ring.length) };
  });
  const faded = joints(readWavS16(stemPlain.path).x);
  const nofadeStem = await V.buildVoiceStem({ projectDir: PROJ, pieces: PIECES.map((p) => ({ ...p, fadeMs: 0 })), chain: CHAIN_PLAIN, runId: "run_voice002" });
  const control = joints(readWavS16(nofadeStem.path).x);
  measured.joints = { faded: faded.map((j) => +j.ratio.toFixed(2)), noFadeControl: control.map((j) => +j.ratio.toFixed(2)), ringRms: faded.map((j) => +j.ringRms.toFixed(3)) };
  for (const j of faded) {
    assert.ok(j.ringRms > 0.02, `joint ${j.J} is not inside speech (ring rms ${j.ringRms})`);
    assert.ok(j.maxD <= 3 * j.med, `click at ${j.J}: max|Δ| ${j.maxD.toFixed(4)} > 3 × median ${j.med.toFixed(4)}`);
  }
  assert.ok(control.filter((j) => j.ratio > 3).length >= 2, `detector control did not click: ${control.map((j) => j.ratio.toFixed(2))}`);
});

t("same inputs hit the cache; a chain change is a new key; sub-frame jitter snaps to the same key", async () => {
  const t0 = Date.now();
  const again = await V.buildVoiceStem({ projectDir: PROJ, pieces: PIECES, chain: CHAIN_PLAIN, runId: "run_voice003" });
  measured.voiceCacheHitMs = Date.now() - t0;
  assert.equal(again.cached, true);
  assert.equal(again.key, stemPlain.key);
  assert.equal(again.lufs, stemPlain.lufs);
  const k1 = V.voiceKey({ pieces: PIECES, chain: CHAIN_PLAIN, sourceSha: "x" });
  assert.notEqual(V.voiceKey({ pieces: PIECES, chain: { ...CHAIN_PLAIN, deesser: true }, sourceSha: "x" }), k1);
  assert.equal(V.voiceKey({ pieces: PIECES.map((p) => ({ ...p, srcInS: p.srcInS + 0.004 })), chain: CHAIN_PLAIN, sourceSha: "x" }), k1);
});

t("full analysis chain (notches + afftdn + dynaudnorm + deesser): exact length, −16 ± 0.5 LUFS, envelope lag ≤ 1 ms", async () => {
  const chain = { highpassHz: 80, notchesHz: [120, 180], afftdn: { nf: -45, nr: 10 }, dynaudnorm: true, deesser: true };
  const t0 = Date.now();
  const full = await V.buildVoiceStem({ projectDir: PROJ, pieces: PIECES, chain, runId: "run_voice004" });
  measured.voiceFullChainMs = Date.now() - t0;
  assert.equal(Number(ffprobe(["-show_entries", "stream=duration_ts", full.path]).streams[0].duration_ts), EXPECTED_SAMPLES);
  const e = ebur128(full.path);
  assert.ok(Math.abs(e.I - -16) <= 0.5, `full chain ${e.I} LUFS`);
  const ea = envelope48(readWavS16(stemPlain.path).x), eb = envelope48(readWavS16(full.path).x);
  const n = Math.min(ea.length, eb.length) - 400;
  const best = bestLag(ea, 200, eb, 200, n - 200, -150, 150);
  const afftdnDelay = await V.afftdnDelaySamples("afftdn=nf=-45:nr=10:tn=1");
  measured.fullChain = { lufs: e.I, tp: e.TP, envelopeLagMs: best.lag, envelopeCorr: +best.c.toFixed(3), afftdnDelaySamples: afftdnDelay };
  assert.ok(afftdnDelay > 0 && afftdnDelay < 24000, `afftdn delay calibration ${afftdnDelay}`);
  assert.match(fs.readFileSync(path.join(PROJ, "render", "cache", "voice", `${full.key}.fcs`), "utf8"), new RegExp(`apad=pad_len=${afftdnDelay},afftdn=.*atrim=start_sample=${afftdnDelay}`));
  assert.ok(best.c > 0.8, `envelope corr ${best.c}`);
  assert.ok(Math.abs(best.lag) <= 1, `full chain delays the stem by ${best.lag} ms`);
});

t("abort before spawning → PROC_ABORTED; no pieces → VOICE_EMPTY", async () => {
  const ac = new AbortController();
  ac.abort();
  await expectCode(V.buildVoiceStem({ projectDir: PROJ, pieces: [{ srcInS: 1, srcOutS: 2 }], chain: CHAIN_PLAIN, signal: ac.signal }), "PROC_ABORTED");
  await expectCode(V.buildVoiceStem({ projectDir: PROJ, pieces: [{ srcInS: 1, srcOutS: 1 }], chain: CHAIN_PLAIN }), "VOICE_EMPTY");
});

section("final mix — loudness, true peak, A/V offset, video copy");

let durationFrames, compositePath;

t("fixtures: composite (540×960, bt709, frames = stem frames) and a 30 s sine-chord music bed", async () => {
  durationFrames = EXPECTED_SAMPLES / 1600;
  compositePath = makeComposite(path.join(PROJ, "render", "cache", "composite", "c_test.mp4"), durationFrames);
  fs.mkdirSync(path.join(PROJ, "assets", "music"), { recursive: true });
  const chord = (d) => `0.12*(sin(2*PI*${261.63 * d}*t)+0.8*sin(2*PI*${329.63 * d}*t)+0.7*sin(2*PI*${392 * d}*t))*(0.75+0.25*cos(2*PI*2*t))`;
  ff(["-y", "-f", "lavfi", "-i", `aevalsrc=exprs='${chord(1)}|${chord(1.003)}':s=48000:d=30:c=stereo`, "-c:a", "pcm_s16le", path.join(PROJ, "assets", "music", "chord.wav")]);
  assert.equal(videoPackets(compositePath).length, durationFrames);
});

t("mixFinal (calm stem + music envelope + 2 SFX): targets met, report == independent ebur128, A/V ≤ 33 ms, video identical", async () => {
  const durationSec = durationFrames / 30;
  const envelope = MU.envelopeFor({ volume: 0.11, envelope: [
    { anchor: { kind: "out", outIn: 0, outOut: 1.5 }, volume: 0.15 },
    { anchor: { kind: "out", outIn: 9, outOut: 12 }, volume: 0.06 },
  ] }, { durationSec });
  const whoosh = SX.resolveSfx("whoosh", { projectDir: PROJ });
  const pop = SX.resolveSfx("pop", { projectDir: PROJ });
  const t0 = Date.now();
  const result = await MX.mixFinal({
    compositePath, voicePath: stemPlain.path, projectDir: PROJ, durationSec, outPath: path.join(PROJ, "render", "out", "rd_test0001.mp4"), runId: "run_mix0001",
    music: { path: "assets/music/chord.wav", volume: 0.11, envelope, startOffsetSec: 0.5 },
    sfx: [{ path: whoosh.path, startSec: 3.0, volume: 0.3 }, { path: pop.path, startSec: 7.2, volume: 0.25 }],
  });
  assert.equal(result.reportPath, path.join(PROJ, "render", "out", "rd_test0001.audio-report.json"));
  verifyMix({ result, compositePath, voicePath: stemPlain.path, durationFrames, label: "mixCalm" });
  measured.mixCalm.totalMs = Date.now() - t0;
  measured.mixCalm.envelopePoints = envelope.length;
});

t("mixFinal (hot transient-heavy stem): mix() TP > −1 dBTP → true-peak post-pass → TP ≤ −1.0, video still identical", async () => {
  const proj = path.join(tmp.dir, "proj_hot");
  fs.mkdirSync(path.join(proj, "work"), { recursive: true });
  // plosive-like 2.2 kHz bursts (≈ 1 ms decay) every 0.731 s on top of the speech-like signal
  ff(["-y", "-f", "lavfi", "-i", `aevalsrc=exprs='${SPEECH_EXPR}+0.9*exp(-2500*mod(t,0.731))*sin(2*PI*2200*t)':s=48000:d=15`, "-ac", "1", "-c:a", "pcm_s16le", path.join(proj, "work", "voice48k.wav")]);
  const stem = await V.buildVoiceStem({ projectDir: proj, pieces: [{ srcInS: 0, srcOutS: 15 }], chain: CHAIN_PLAIN, runId: "run_hot0001" });
  assert.equal(stem.samples, 450 * 1600);
  const frames = 450;
  const comp = makeComposite(path.join(proj, "render", "cache", "composite", "c_hot.mp4"), frames);
  fs.mkdirSync(path.join(proj, "assets", "music"), { recursive: true });
  fs.copyFileSync(path.join(PROJ, "assets", "music", "chord.wav"), path.join(proj, "assets", "music", "chord.wav"));
  const impact = SX.resolveSfx("impact", { projectDir: proj });
  const t0 = Date.now();
  const result = await MX.mixFinal({
    compositePath: comp, voicePath: stem.path, projectDir: proj, durationSec: frames / 30, outPath: path.join(proj, "render", "out", "rd_hot0001.mp4"), runId: "run_mixhot01",
    music: { path: "assets/music/chord.wav", volume: 0.16, envelope: [] },
    sfx: [{ path: impact.path, startSec: 5.0, volume: 0.45 }],
  });
  const rep = verifyMix({ result, compositePath: comp, voicePath: stem.path, durationFrames: frames, label: "mixHot" });
  measured.mixHot.totalMs = Date.now() - t0;
  measured.mixHot.stem = { lufs: stem.lufs, tp: stem.truePeakDb };
  assert.ok(rep.preMeasured.truePeakDbtp > -1.0, `fixture did not exercise the post-pass (mix() TP ${rep.preMeasured.truePeakDbtp})`);
  assert.equal(rep.postPass.applied, true);
  assert.ok(rep.postPass.attempts.length >= 1);
});

t("mixFinal input errors: missing composite → MIX_INPUT_MISSING; report path naming", async () => {
  await expectCode(MX.mixFinal({ compositePath: "render/cache/composite/nope.mp4", voicePath: stemPlain.path, projectDir: PROJ, durationSec: 1, outPath: "render/out/x.mp4" }), "MIX_INPUT_MISSING");
  assert.equal(MX.audioReportPathFor("render/out/rd_1.mp4"), "render/out/rd_1.audio-report.json");
});

section("music candidates (injected fetchers) and envelope");

const GOOD_URL = "https://cdn.test.invalid/good-track.mp3";
const BAD_URL = "https://cdn.test.invalid/html-error.mp3";

t("bridge: invalid download rejected and deleted, valid track kept with provenance + licence (TrackSchema)", async () => {
  const goodMp3 = path.join(tmp.dir, "good.mp3");
  ff(["-y", "-f", "lavfi", "-i", "sine=frequency=220:sample_rate=44100:duration=12", "-c:a", "libmp3lame", "-q:a", "5", goodMp3]);
  const proj = path.join(tmp.dir, "proj_music1");
  const calls = [], downloads = [];
  const tracks = await MU.musicCandidates({
    query: "tech product", mood: "uplifting", energy: 0.8, durationSec: 40, projectId: "ve_0123456789abcdef", projectDir: proj,
    fetchers: {
      bridgeFirstAudioUrl: async (q, cat, { index }) => { calls.push({ q, cat, index }); return [BAD_URL, GOOD_URL, null][index] || null; },
      downloadToFile: async (url, out) => {
        downloads.push(url);
        fs.mkdirSync(path.dirname(out), { recursive: true });
        if (url === GOOD_URL) fs.copyFileSync(goodMp3, out); else fs.writeFileSync(out, Buffer.alloc(30000, "<html>502 Bad Gateway</html>"));
        return out;
      },
      fetchMusic: async () => { throw new Error("fetchMusic must not run when the bridge produced a track"); },
    },
  });
  assert.equal(calls[0].q.split(" ")[0], "energetic");
  assert.equal(calls[0].cat, "music");
  assert.deepEqual(calls.map((c) => c.index), [0, 1, 2]);
  assert.deepEqual(downloads, [BAD_URL, GOOD_URL]);
  assert.equal(tracks.length, 1);
  const tr = tracks[0];
  schema.TrackSchema.parse(tr);
  assert.equal(tr.provider, "pixabay_bridge");
  assert.equal(tr.sourceUrl, GOOD_URL);
  assert.match(tr.license, /Pixabay/);
  assert.ok(Math.abs(tr.durationSec - 12) < 0.2, `duration ${tr.durationSec}`);
  assert.ok(fs.existsSync(path.join(proj, tr.path)));
  assert.deepEqual(fs.readdirSync(path.join(proj, "assets", "music")), [path.basename(tr.path)], "the invalid file must be deleted");
  measured.music = { query: calls[0].q, track: tr };
});

t("bridge down → one bridge call, fetchMusic pad (seeded by projectId) → still one track; invalid pad → none", async () => {
  const proj = path.join(tmp.dir, "proj_music2");
  let bridgeCalls = 0, fetchArgs = null;
  const fetchers = {
    bridgeFirstAudioUrl: async () => { bridgeCalls++; return null; },
    downloadToFile: async () => { throw new Error("no download when the bridge is down"); },
    fetchMusic: async (args) => {
      fetchArgs = args;
      ff(["-y", "-f", "lavfi", "-i", "sine=frequency=174.61:sample_rate=44100:duration=20", "-c:a", "libmp3lame", "-q:a", "6", args.outputPath]);
      return args.outputPath;
    },
  };
  const tracks = await MU.musicCandidates({ query: "piano", mood: "calm", energy: 0.2, durationSec: 42, projectId: "ve_padpadpadpadpadp", projectDir: proj, fetchers });
  assert.equal(bridgeCalls, 1);
  assert.equal(tracks.length, 1);
  schema.TrackSchema.parse(tracks[0]);
  assert.equal(tracks[0].provider, "synth");
  assert.equal(tracks[0].license, MU.SYNTH_LICENSE);
  assert.equal(fetchArgs.seed, "ve_padpadpadpadpadp");
  assert.equal(fetchArgs.durationSec, 42);
  assert.equal(fetchArgs.query.split(" ")[0], "calm");
  measured.musicFallback = tracks[0];

  const bad = await MU.musicCandidates({
    query: "piano", mood: "calm", energy: 0.2, durationSec: 42, projectId: "ve_badbadbadbadbadb", projectDir: path.join(tmp.dir, "proj_music3"),
    fetchers: { ...fetchers, fetchMusic: async (args) => { fs.writeFileSync(args.outputPath, "not audio at all"); return args.outputPath; } },
  });
  assert.deepEqual(bad, []);
  assert.deepEqual(fs.readdirSync(path.join(tmp.dir, "proj_music3", "assets", "music")), []);
});

t("envelopeFor: absolute ascending points, ramp lead, collapsed anchors dropped, ≤ 12 points under overflow", async () => {
  const words = [{ start: 1.0, end: 1.4 }, { start: 5.0, end: 6.0 }];
  const resolveAnchor = (a) => (a.kind === "words" ? { outIn: words[a.w0].start, outOut: words[a.w1].end, collapsed: false } : { outIn: 0, outOut: 0, collapsed: true });
  const pts = MU.envelopeFor({ volume: 0.1, envelope: [{ anchor: { kind: "words", w0: 1, w1: 1 }, volume: 0.06 }, { anchor: { kind: "src", srcIn: 1, srcOut: 2 }, volume: 0.2 }] }, { resolveAnchor, durationSec: 20 });
  assert.deepEqual(pts, [{ atSec: 0, volume: 0.1 }, { atSec: 4.1, volume: 0.06 }, { atSec: 6, volume: 0.1 }]);
  assert.deepEqual(MU.envelopeFor({ volume: 0.1, envelope: [] }, { durationSec: 10 }), []);
  const many = Array.from({ length: 20 }, (_, i) => ({ anchor: { kind: "out", outIn: 2 + i * 4, outOut: 3 + i * 4 + (i % 3) }, volume: i % 2 ? 0.05 : 0.16 }));
  const capped = MU.envelopeFor({ volume: 0.1, envelope: many }, { durationSec: 90 });
  assert.ok(capped.length <= 12 && capped.length >= 3, `points ${capped.length}`);
  for (let i = 1; i < capped.length; i++) assert.ok(capped[i].atSec - capped[i - 1].atSec >= 0.1 - 1e-9, "points must ascend ≥ 0.1 s apart");
  const expr = require("../src/services/audio_mix").envelopeExpr(capped);
  assert.ok(expr && expr.split("if(").length - 1 === capped.length - 1, "audio_mix keeps every point");
  assert.equal(MU.buildMusicQuery({ query: "Calm piano calm", mood: "calm", energy: 0.1 }), "calm piano");
  measured.envelopeOverflowPoints = capped.length;
});

section("sfx library lookup");

t("resolveSfx copies the curated file and returns its licence/attribution (SfxSchema fields)", async () => {
  const w = SX.resolveSfx("whoosh", { projectDir: PROJ });
  assert.equal(w.path, "assets/sfx/whoosh.mp3");
  assert.equal(fs.statSync(w.absPath).size, fs.statSync(path.join(SX.SFX_DIR, "whoosh.mp3")).size);
  assert.match(w.license, /^CC BY 3\.0/);
  assert.match(w.attribution, /Whoosh Simple Low/);
  assert.match(w.attribution, /freesound\.org\/s\/365154/);
  schema.SfxSchema.parse({ id: "sfx_t1", cue: w.cue, path: w.path, anchor: { elementId: "br_1", edge: "in", offsetSec: 0 }, resolved: null, volume: 0.3,
    license: w.license, attribution: w.attribution, enabled: true, reason: "test", origin: "ai", locked: false });
  const s = SX.resolveSfx("swoosh", { projectDir: PROJ });
  assert.match(s.license, /^CC0 1\.0/);
  assert.equal(s.attribution, null);
  assert.equal(SX.resolveSfx("boom", { projectDir: PROJ }).cue, "impact");
  assert.equal(SX.resolveSfx("kazoo solo", { projectDir: PROJ }), null);
  assert.deepEqual(SX.creditsFor([w, s, w]), [w.attribution]);
  measured.sfx = { whoosh: [w.license, w.attribution], swoosh: [s.license, s.attribution] };
});

section("brand — logo palette and resolved palette");

t("transparent PNG: colours only from opaque pixels (hidden green under alpha 0 and a 39 % yellow are ignored)", async () => {
  const png = path.join(tmp.dir, "logo.png");
  const inRed = "between(X,20,119)*between(Y,20,119)", inBlue = "between(X,20,179)*between(Y,150,179)", inYel = "between(X,130,189)*between(Y,20,119)";
  const ch = (red, blue, yel, bg) => `'if(${inRed},${red},if(${inBlue},${blue},if(${inYel},${yel},${bg})))'`;
  ff(["-y", "-f", "lavfi", "-i", "color=c=black:s=200x200:d=1", "-vf", `format=rgba,geq=r=${ch(224, 29, 255, 0)}:g=${ch(36, 78, 212, 255)}:b=${ch(94, 216, 0, 0)}:a=${ch(255, 255, 100, 0)}`,
    "-frames:v", "1", "-pix_fmt", "rgba", png]);
  const raw = ff(["-i", png, "-f", "rawvideo", "-pix_fmt", "rgba", "-"], { stdout: true });
  assert.deepEqual([...raw.subarray((5 * 200 + 5) * 4, (5 * 200 + 5) * 4 + 4)], [0, 255, 0, 0], "fixture must hide green under alpha 0");
  const pal = await B.extractLogoPalette(png);
  measured.logoPng = pal;
  assert.equal(pal.skipped, null);
  assert.ok(pal.colors.some((c) => hexDist(c, "#e0245e") <= 24), `red missing: ${pal.colors}`);
  assert.ok(pal.colors.some((c) => hexDist(c, "#1d4ed8") <= 24), `blue missing: ${pal.colors}`);
  for (const c of [...pal.colors, ...pal.neutrals]) {
    assert.ok(hexDist(c, "#00ff00") > 120, `hidden green leaked: ${c}`);
    assert.ok(hexDist(c, "#ffd400") > 120, `semi-transparent yellow leaked: ${c}`);
  }
  // control: the same pixels read alpha-blind do surface the hidden green
  const blind = Buffer.from(raw); for (let i = 3; i < blind.length; i += 4) blind[i] = 255;
  assert.ok(B.paletteFromRgba(blind, 200, 200, 4).colors.some((c) => hexDist(c, "#00ff00") <= 24), "control: alpha-blind decode should see green");
});

t("SVG logo: rasterized headlessly (or fail-open with a reason); a non-SVG fails open", async () => {
  const svg = path.join(tmp.dir, "logo.svg");
  fs.writeFileSync(svg, `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><circle cx="30" cy="50" r="25" fill="#7c3aed"/><rect x="60" y="20" width="35" height="60" fill="#f59e0b"/></svg>`);
  const t0 = Date.now();
  const pal = await B.extractLogoPalette(svg, { timeoutMs: 90000 });
  measured.logoSvg = { ...pal, ms: Date.now() - t0 };
  if (pal.rasterized) {
    assert.equal(pal.skipped, null);
    assert.ok(pal.colors.some((c) => hexDist(c, "#7c3aed") <= 24), `violet missing: ${pal.colors}`);
    assert.ok(pal.colors.some((c) => hexDist(c, "#f59e0b") <= 24), `amber missing: ${pal.colors}`);
    assert.ok(pal.opaqueRatio > 0.2 && pal.opaqueRatio < 0.6, `opaque ratio ${pal.opaqueRatio}`);
  } else {
    assert.deepEqual(pal.colors, []);
    assert.ok(typeof pal.skipped === "string" && pal.skipped.length > 0);
  }
  const broken = path.join(tmp.dir, "broken.svg");
  fs.writeFileSync(broken, "this is not an svg");
  const b = await B.extractLogoPalette(broken);
  assert.deepEqual(b.colors, []);
  assert.match(b.skipped, /svg not rasterized/);
});

t("resolveEditBrand: user > logo > default, accent ≥ 3:1 on the caption outline, schema-valid", async () => {
  const P = schema.BrandingSchema.shape.palette;
  const user = B.resolveEditBrand({ userPalette: ["#1d4ed8", "#e0245e"], logoPalette: ["#7c3aed"] });
  P.parse(user);
  assert.equal(user.source, "user");
  assert.equal(user.primary, "#1d4ed8");
  assert.ok(brandKit.ratio(user.accent, "#000000") >= 3, `accent ${user.accent}`);
  assert.ok(["#ffffff", "#14130e"].includes(user.onAccent));

  const dark = B.resolveEditBrand({ userPalette: { primary: "#1e3a8a" } });
  P.parse(dark);
  assert.ok(brandKit.ratio("#1e3a8a", "#000000") < 3, "fixture colour must start below 3:1");
  assert.ok(brandKit.ratio(dark.accent, "#000000") >= 3, `dark accent not lifted: ${dark.accent}`);
  assert.notEqual(dark.accent, "#1e3a8a");

  const logo = B.resolveEditBrand({ logoPalette: measured.logoPng });
  P.parse(logo);
  assert.equal(logo.source, "logo");
  assert.ok(measured.logoPng.colors.some((c) => hexDist(c, logo.primary) <= 2), `logo primary ${logo.primary} not from the logo`);

  assert.deepEqual(B.resolveEditBrand({ logoPalette: ["#000000", "#ffffff"] }), { ...schema.DEFAULT_PALETTE });
  assert.deepEqual(B.resolveEditBrand({}), { ...schema.DEFAULT_PALETTE });
  measured.brand = { user, dark, logo };
});

(async () => {
  const started = Date.now();
  const { failed } = await run();
  restoreFetch();
  measured.totalMs = Date.now() - started;
  console.log("MEASURED " + JSON.stringify(measured, null, 1));
  tmp.cleanup();
  process.exitCode = failed ? 1 : 0;
})();
