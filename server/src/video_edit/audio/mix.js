// VIDEO EDIT FINAL MIX — voice stem + music + SFX onto the composite, delivered at −14 LUFS / TP ≤ −1 dBTP
// (RENDER.md §8).
//
// WHY THIS EXISTS. `services/audio_mix.mix` is the one mixer the product trusts (ducking, SFX bus,
// silent anchor, stream-copied video), so a music or SFX edit re-runs only this step. But spike S7
// measured two gaps we must close around it without touching it: its master limiter lets true peak sit
// at −0.5…0.0 dBTP, and its loudness report is stale whenever its gain step fires (reported −14 / −8.85,
// measured −13.5 / 0.0). So this module calls mix(), re-measures, runs an audio-only true-peak post-pass
// (video packets copied untouched), re-measures again and writes the MEASURED numbers — plus the
// voice-vs-output A/V offset — to the audio report QA reads.
//
// CONTRACT:
//   mixFinal({ compositePath, voicePath, music:{ path, volume, envelope:[{atSec, volume}], startOffsetSec }|null,
//              sfx:[{ path, startSec, volume }], durationSec, outPath, runId?, signal?, projectDir?, targetLufs=-14, deps? })
//     -> { path: outPath, reportPath, report }
//     Relative paths resolve against projectDir. Writes <outPath minus .mp4>.audio-report.json (RENDER.md:
//     render/out/<rid>.audio-report.json). Temp files are <outPath>.*.tmp.<runId>.* and are always removed.
//     Throws EditError MIX_INPUT_MISSING | MIX_FAILED | PROC_ABORTED | PROC_* | LOUDNESS_UNMEASURED.
//     Limitation: audio_mix.mix spawns its own ffmpeg and takes no signal; an abort is honoured before and
//     right after it. It also hardcodes music fades (0.8 s in / 1.2 s out), so fadeInSec/fadeOutSec are unused.
//   computeAvOffset({ voicePath, mixedPath, signal, maxSec=60 }) -> { ms, method, envelopeLagMs, envelopeCorr,
//              sampleLagMs, sampleCorr, containerAudioMinusVideoStartMs, analysedSec }   (+ = audio late)
//   audioReportPathFor(outPath) · POST_PASS_CHAINS · TP_CEILING_DB

const fs = require("node:fs");
const path = require("node:path");
const proc = require("../engine/proc");
const fsx = require("../fsx");
const { EditError, isEditError } = require("../errors");
const { newRunId } = require("../ids");
const V = require("./voice");

const REPORT_VERSION = 1;
const TP_CEILING_DB = -1.0;
const LOUDNESS_TOLERANCE_LU = 1.5;
// First entry is RENDER.md §8 verbatim (S7: I −13.7, TP −1.4). The later entries only run when AAC
// re-encoding still overshoots the ceiling: S7's −2.0 dBTP ceiling, then a 4× oversampled limiter.
const POST_PASS_CHAINS = Object.freeze([
  Object.freeze({ id: "alimiter-0.841", af: "alimiter=limit=0.841:attack=5:release=50:level=disabled:latency=1" }),
  Object.freeze({ id: "alimiter-0.794", af: "alimiter=limit=0.794:attack=5:release=50:level=disabled:latency=1" }),
  Object.freeze({ id: "os4-alimiter-0.708", af: "aresample=176400,alimiter=limit=0.708:attack=5:release=50:level=disabled:latency=1,aresample=44100" }),
]);
const AAC_ARGS = ["-c:a", "aac", "-b:a", "160k", "-ar", "44100", "-ac", "2"];

const r2 = (x) => (Number.isFinite(x) ? Math.round(x * 100) / 100 : null);
const jsonNum = (x) => (Number.isFinite(x) ? x : null);

function audioReportPathFor(outPath) {
  return `${String(outPath).replace(/\.mp4$/i, "")}.audio-report.json`;
}

function abortedError() {
  return new EditError("PROC_ABORTED", { status: 409, errorClass: "cancelled", retryable: false, detail: "aborted" });
}
function checkAbort(signal) { if (signal && signal.aborted) throw abortedError(); }

function rmQuiet(p) { try { fs.unlinkSync(p); } catch { /* absent */ } }

// ---- A/V offset ---------------------------------------------------------------------------------
const AV_SR = 16000;
const ENV_WIN = 160; // 10 ms
const ENV_HOP = 16;  // 1 ms

async function decodeMonoS16(file, outFile, { signal, maxSec }) {
  await proc.ffmpeg(["-y", ...V.inputArgs(file), "-map", "0:a:0", "-t", V.fmt6(maxSec), "-af", "pan=mono|c0=c0",
    "-ac", "1", "-ar", String(AV_SR), "-f", "s16le", "-c:a", "pcm_s16le", outFile], { signal, timeoutMs: 120000, label: "av-decode" });
  const b = fs.readFileSync(outFile);
  const n = Math.floor(b.length / 2);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = b.readInt16LE(i * 2) / 32768;
  return x;
}

function envelope(x) {
  const m = Math.max(0, Math.floor((x.length - ENV_WIN) / ENV_HOP));
  const e = new Float64Array(m);
  for (let k = 0; k < m; k++) {
    let s = 0;
    const o = k * ENV_HOP;
    for (let i = 0; i < ENV_WIN; i++) { const v = x[o + i]; s += v * v; }
    e[k] = Math.sqrt(s / ENV_WIN);
  }
  return e;
}

// Normalized cross-correlation of a[i] with b[i + lag] over i in [0, len).
function ncc(a, b, lag, len) {
  const i0 = Math.max(0, -lag), i1 = Math.min(len, a.length, b.length - lag);
  if (i1 - i0 < 16) return -2;
  let sa = 0, sb = 0;
  for (let i = i0; i < i1; i++) { sa += a[i]; sb += b[i + lag]; }
  const n = i1 - i0, ma = sa / n, mb = sb / n;
  let num = 0, da = 0, db = 0;
  for (let i = i0; i < i1; i++) { const u = a[i] - ma, v = b[i + lag] - mb; num += u * v; da += u * u; db += v * v; }
  return da > 0 && db > 0 ? num / Math.sqrt(da * db) : -2;
}

function bestLag(a, b, lo, hi, len) {
  const cs = new Map();
  let best = { lag: 0, c: -2 };
  for (let lag = lo; lag <= hi; lag++) {
    const c = ncc(a, b, lag, len);
    cs.set(lag, c);
    if (c > best.c) best = { lag, c };
  }
  // parabolic refinement around the peak
  const cm = cs.get(best.lag - 1), cp = cs.get(best.lag + 1);
  let frac = 0;
  if (Number.isFinite(cm) && Number.isFinite(cp) && cm > -2 && cp > -2) {
    const den = cm - 2 * best.c + cp;
    if (den < 0) frac = Math.max(-0.5, Math.min(0.5, 0.5 * (cm - cp) / den));
  }
  return { lag: best.lag + frac, c: best.c };
}

async function computeAvOffset({ voicePath, mixedPath, signal, maxSec = 60, runId } = {}) {
  const rid = runId || newRunId();
  const refTmp = `${mixedPath}.avref.tmp.${rid}.pcm`;
  const mixTmp = `${mixedPath}.avmix.tmp.${rid}.pcm`;
  try {
    const a = await decodeMonoS16(voicePath, refTmp, { signal, maxSec });
    const b = await decodeMonoS16(mixedPath, mixTmp, { signal, maxSec });
    const ea = envelope(a), eb = envelope(b);
    const env = bestLag(ea, eb, -300, 300, ea.length);
    const envLagMs = env.lag * (ENV_HOP / AV_SR) * 1000;
    // sample-level refinement ±4 ms around the envelope estimate, first 12 s
    const center = Math.round(env.lag * ENV_HOP);
    const fineLen = Math.min(a.length, 12 * AV_SR);
    const fine = bestLag(a, b, center - 64, center + 64, fineLen);
    const sampleLagMs = (fine.lag / AV_SR) * 1000;

    const probe = await proc.ffprobeJson(["-protocol_whitelist", "file", "-f", "mov", "-show_entries", "stream=codec_type,start_time", "-of", "json", `file:${mixedPath}`], { signal, timeoutMs: 20000 });
    const streams = probe.streams || [];
    const vs = streams.find((s) => s.codec_type === "video"), as = streams.find((s) => s.codec_type === "audio");
    const containerMs = ((Number(as && as.start_time) || 0) - (Number(vs && vs.start_time) || 0)) * 1000;
    const useSample = fine.c >= 0.3 && Math.abs(sampleLagMs - envLagMs) <= 4.5;
    const lagMs = useSample ? sampleLagMs : envLagMs;
    return {
      ms: r2(containerMs + lagMs),
      method: useSample ? "rms-envelope-xcorr+sample-xcorr" : "rms-envelope-xcorr",
      envelopeLagMs: r2(envLagMs), envelopeCorr: r2(env.c),
      sampleLagMs: r2(sampleLagMs), sampleCorr: r2(fine.c),
      containerAudioMinusVideoStartMs: r2(containerMs),
      analysedSec: r2(Math.min(a.length, b.length) / AV_SR),
    };
  } finally {
    rmQuiet(refTmp); rmQuiet(mixTmp);
  }
}

// ---- main ---------------------------------------------------------------------------------------
async function mixFinal({
  compositePath, voicePath, music = null, sfx = [], durationSec, outPath, runId, signal, projectDir = null,
  targetLufs = -14, deps = {},
} = {}) {
  const audioMix = deps.audioMix || require("../../services/audio_mix");
  const rid = runId || newRunId();
  const abs = (p) => (path.isAbsolute(p) ? p : path.resolve(projectDir || process.cwd(), p));
  const missing = (what, p) => new EditError("MIX_INPUT_MISSING", { status: 409, errorClass: "input", detail: `${what}: ${p ? path.basename(String(p)) : "(none)"}` });

  if (!compositePath || !fs.existsSync(abs(compositePath))) throw missing("composite", compositePath);
  if (!voicePath || !fs.existsSync(abs(voicePath))) throw missing("voice stem", voicePath);
  if (!Number.isFinite(durationSec) || durationSec <= 0) throw new EditError("MIX_FAILED", { errorClass: "bug", detail: "durationSec must be > 0" });
  if (typeof outPath !== "string" || !outPath) throw new EditError("MIX_FAILED", { errorClass: "bug", detail: "outPath is required" });

  const out = abs(outPath);
  fsx.ensureDir(path.dirname(out));
  const composite = abs(compositePath);
  const voice = abs(voicePath);
  const notes = [];
  const timingsMs = {};
  const tmps = [];
  const tmp = (tag, ext) => { const p = `${out}.${tag}.tmp.${rid}.${ext}`; tmps.push(p); return p; };
  const timeoutMs = Math.max(60000, Math.round(durationSec * 6000));

  try {
    checkAbort(signal);
    // Music: optional, fail-open (a missing bed never blocks an export).
    let musicPath = null, musicVolume = 0.11, musicEnvelope = null;
    if (music && music.path) {
      const mp = abs(music.path);
      if (!fs.existsSync(mp)) {
        notes.push("music file missing — mixed without music");
      } else {
        musicPath = mp;
        const v = Number(music.volume);
        musicVolume = Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.11;
        if (Array.isArray(music.envelope) && music.envelope.length >= 2) musicEnvelope = music.envelope.map((p) => ({ atSec: Number(p.atSec), volume: Number(p.volume) }));
        const off = Number(music.startOffsetSec);
        if (Number.isFinite(off) && off > 0.001) {
          const t0 = Date.now();
          const trimmed = tmp("music", "wav");
          await proc.ffmpeg(["-y", "-ss", V.fmt6(off), ...V.inputArgs(mp), "-map", "0:a:0", "-vn", "-c:a", "pcm_s16le", "-ar", "44100", "-ac", "2", trimmed],
            { signal, timeoutMs, label: "music-offset" });
          musicPath = trimmed;
          timingsMs.musicOffset = Date.now() - t0;
        }
      }
    }
    const sfxLayers = [];
    for (const s of Array.isArray(sfx) ? sfx : []) {
      if (!s || !s.path) continue;
      const sp = abs(s.path);
      const at = Number(s.startSec);
      if (!fs.existsSync(sp)) { notes.push(`sfx missing: ${path.basename(sp)}`); continue; }
      if (!Number.isFinite(at) || at < 0 || at >= durationSec) { notes.push(`sfx outside the timeline: ${path.basename(sp)}`); continue; }
      const vol = Number(s.volume);
      sfxLayers.push({ path: sp, startSec: at, volume: Number.isFinite(vol) ? Math.min(1, Math.max(0, vol)) : 0.3, kind: "sfx" });
    }

    // 1. audio_mix.mix — video stream-copied; the voice stem is always passed (mix drops the input audio).
    checkAbort(signal);
    const mixOut = tmp("mix", "mp4");
    let mixResult;
    let t0 = Date.now();
    try {
      mixResult = await audioMix.mix({
        videoPath: composite, outputPath: mixOut, durationSec, ttsPath: voice, musicPath, musicVolume, musicEnvelope,
        sfx: sfxLayers, normalize: true, targetLufs,
      });
    } catch (e) {
      if (isEditError(e)) throw e;
      throw new EditError("MIX_FAILED", { errorClass: "transient", retryable: true, detail: String((e && e.message) || e) });
    }
    timingsMs.mix = Date.now() - t0;
    rmQuiet(`${mixOut}.norm.mp4`);
    checkAbort(signal);
    if (!fs.existsSync(mixOut)) throw new EditError("MIX_FAILED", { errorClass: "transient", retryable: true, detail: "mix produced no file" });

    // 2. measure what mix() actually produced.
    t0 = Date.now();
    const pre = await V.measureEbur128(mixOut, { signal, timeoutMs });
    timingsMs.measurePre = Date.now() - t0;

    // 3. true-peak post-pass (audio-only re-encode, video packets copied) or a faststart remux.
    const postPass = { applied: false, ceilingDbtp: TP_CEILING_DB, reason: null, attempts: [], chosen: null, ok: true };
    let finalTmp;
    t0 = Date.now();
    if (!Number.isFinite(pre.truePeakDbtp) || pre.truePeakDbtp > TP_CEILING_DB) {
      postPass.applied = true;
      postPass.reason = `mix() true peak ${pre.truePeakDbtp} dBTP > ${TP_CEILING_DB}`;
      let best = null;
      for (let i = 0; i < POST_PASS_CHAINS.length; i++) {
        const c = POST_PASS_CHAINS[i];
        const candidate = tmp(`tp${i}`, "mp4");
        await proc.ffmpeg(["-y", ...V.inputArgs(mixOut, { format: "mov" }), "-map", "0:v:0", "-map", "0:a:0", "-c:v", "copy",
          "-af", c.af, ...AAC_ARGS, "-movflags", "+faststart", candidate], { signal, timeoutMs, label: "tp-postpass" });
        const m = await V.measureEbur128(candidate, { signal, timeoutMs });
        postPass.attempts.push({ chain: c.id, filter: c.af, integratedLufs: m.integratedLufs, truePeakDbtp: jsonNum(m.truePeakDbtp), lraLu: m.lraLu });
        if (!best || m.truePeakDbtp < best.tp) best = { file: candidate, tp: m.truePeakDbtp, id: c.id };
        if (m.truePeakDbtp <= TP_CEILING_DB) { best = { file: candidate, tp: m.truePeakDbtp, id: c.id }; break; }
      }
      postPass.chosen = best.id;
      postPass.ok = best.tp <= TP_CEILING_DB;
      finalTmp = best.file;
    } else {
      finalTmp = tmp("faststart", "mp4");
      await proc.ffmpeg(["-y", ...V.inputArgs(mixOut, { format: "mov" }), "-map", "0:v:0", "-map", "0:a:0", "-c", "copy", "-movflags", "+faststart", finalTmp],
        { signal, timeoutMs, label: "faststart" });
    }
    timingsMs.postPass = Date.now() - t0;
    checkAbort(signal);
    fsx.renameWithRetrySync(finalTmp, out);

    // 4. re-measure the delivered file; these are the only loudness numbers QA may use.
    t0 = Date.now();
    const fin = await V.measureEbur128(out, { signal, timeoutMs });
    timingsMs.measureFinal = Date.now() - t0;

    // 5. A/V offset of the voice in the delivered file (fail-open: a failed measurement is reported as null).
    t0 = Date.now();
    let avOffset = null;
    try { avOffset = await computeAvOffset({ voicePath: voice, mixedPath: out, signal, runId: rid }); }
    catch (e) {
      if (isEditError(e) && e.code === "PROC_ABORTED") throw e;
      notes.push(`A/V offset not measured: ${isEditError(e) ? e.code : "error"}`);
    }
    timingsMs.avOffset = Date.now() - t0;

    const report = {
      version: REPORT_VERSION,
      targetLufs,
      integratedLufs: fin.integratedLufs,
      truePeakDbtp: jsonNum(fin.truePeakDbtp),
      lraLu: fin.lraLu,
      loudnessOk: Math.abs(fin.integratedLufs - targetLufs) <= LOUDNESS_TOLERANCE_LU,
      truePeakOk: Number.isFinite(fin.truePeakDbtp) && fin.truePeakDbtp <= TP_CEILING_DB,
      measuredWith: "ebur128=peak=true",
      preMeasured: { integratedLufs: pre.integratedLufs, truePeakDbtp: jsonNum(pre.truePeakDbtp), lraLu: pre.lraLu },
      postPass,
      avOffset,
      mixReport: mixResult && mixResult.report ? { ...mixResult.report, stale: true } : null,
      inputs: {
        durationSec, voice: path.basename(voice), music: musicPath ? path.basename(abs(music.path)) : null, musicVolume: musicPath ? musicVolume : null,
        musicEnvelopePoints: musicEnvelope ? musicEnvelope.length : 0, sfx: sfxLayers.map((s) => ({ file: path.basename(s.path), startSec: s.startSec, volume: s.volume })),
      },
      videoStream: "copied",
      notes,
      timingsMs,
    };
    const reportPath = audioReportPathFor(out);
    fsx.writeJsonAtomic(reportPath, report);
    return { path: out, reportPath, report };
  } finally {
    for (const p of tmps) if (p !== out) rmQuiet(p);
  }
}

module.exports = { mixFinal, computeAvOffset, audioReportPathFor, POST_PASS_CHAINS, TP_CEILING_DB, LOUDNESS_TOLERANCE_LU };
