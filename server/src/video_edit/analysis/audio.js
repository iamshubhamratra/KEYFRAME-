// VIDEO EDIT AUDIO ANALYSIS — EXTRACTING_AUDIO (ANALYSIS.md §3): envelope, islands, silences, loudness, voice chain.
//
// WHY THIS EXISTS. Every downstream decision about WHERE speech is comes from here: STT chunk
// boundaries never fall inside an island, STT output is validated against island coverage, the
// island-chat fallback transcribes islands, silence cuts are built from the envelope, and the voice
// stem's cleanup chain (RENDER.md §8) is chosen from measured SNR / hum / level / sibilance. It is
// deterministic DSP on `work/audio16k.wav` (plus `work/voice48k.wav` for the 6–9 kHz sibilance band,
// which a 16 kHz file cannot carry) and one ffmpeg ebur128/astats pass — no models, no network.
// A file with almost no voiced frames is reported as `noSpeech` so the stage can park the project
// with NO_SPEECH instead of paying for transcription of silence.
//
// CONTRACT:
//   analyzePcm(pcm:{samples, sampleRate}, { maxIslandSec=8, voicePcmReader?, features? }) -> analysis (pure; no ffmpeg)
//       -> { durationSec, sampleRate, hopSec, features, floorDb, speechDb, snrDb, thresholdDb, voicedRatio, speechRatio,
//            levelStdevDb, hum, sibilance, clippingRatio, islands:[{id, startSample, endSample, start, end, voicedStart,
//            voicedEnd, split}], silences:[{start, end, dur, depthDb}], noSpeech }
//   detectIslands(features, { floorDb, speechDb, durationSec, samples, sampleRate, maxIslandSec }) -> { thresholdDb, islands }
//   silencesFrom(islands, rmsDb, { durationSec, hop }) -> silences
//   measureLoudness(absOrRel, { cwd, signal, timeoutMs, pidFile }) -> { lufs, lra, truePeakDb, astats }   (ffmpeg)
//   parseLoudness(stderr) -> { lufs, lra, truePeakDb, astats:{…Overall} }
//   detectHum(samples, sampleRate, silences) -> { hz, db, prominenceDb, notchesHz } | null
//   sibilanceRatio({ samples, sampleRate }, frames) · voiceChain(stats) -> RENDER.md chain
//   analyzeAudio({ projectDir, audioRel='work/audio16k.wav', voiceRel='work/voice48k.wav', runId, signal, pidFile,
//                  timeoutMs, onProgress, maxIslandSec, write=true })
//       -> { audio (audio.json body), envelope:Float32Array, pcm, features, noSpeech, discoveries:{silencesFound, silenceSec},
//            notices, outputs:{ audio:{path}, envelope:{path} } }
//   writeEnvelope(file, rmsDb) · readEnvelope(file) -> Float32Array · noSpeechError() -> EditError NO_SPEECH
//   AUDIO_REL · ENVELOPE_REL · DEFAULTS

const fs = require("node:fs");
const path = require("node:path");
const { EditError, isEditError } = require("../errors");
const fsx = require("../fsx");
const dsp = require("./dsp");
const { letterId } = require("./islands");

const AUDIO_REL = "analysis/audio.json";
const ENVELOPE_REL = "analysis/rms.f32";

const DEFAULTS = Object.freeze({
  hopSec: 0.01, winSec: 0.02, enterSec: 0.04, exitSec: 0.25, mergeGapSec: 0.25, padSec: 0.08, minIslandSec: 0.2,
  maxIslandSec: 8, splitSmoothSec: 0.15, splitMiddle: 0.6, noSpeechRatio: 0.02, edgeBlockSec: 0.0025,
  voicedAbsDb: -65, clipDb: -0.1,
});

const r3 = (x) => Math.round(x * 1000) / 1000;
const r2 = (x) => Math.round(x * 100) / 100;
const r1 = (x) => Math.round(x * 10) / 10;

// ---------------------------------------------------------------- levels
function levelStats(rmsDb) {
  const floorDb = dsp.percentile(rmsDb, 0.1);
  if (floorDb == null) return { floorDb: dsp.DB_FLOOR, speechDb: dsp.DB_FLOOR };
  const above = [];
  for (const v of rmsDb) if (v > floorDb + 12) above.push(v);
  const speechDb = above.length ? dsp.percentile(above, 0.6) : floorDb + 12;
  return { floorDb, speechDb };
}

// ---------------------------------------------------------------- islands
function blockDb(samples, a, b) {
  let s = 0;
  for (let k = a; k < b; k++) s += samples[k] * samples[k];
  return b > a ? dsp.dbfs(Math.sqrt(s / (b - a))) : dsp.DB_FLOOR;
}

function refineStart(samples, sr, t, thr, blockSec) {
  const blk = Math.max(8, Math.round(sr * blockSec));
  const a0 = Math.max(0, Math.round((t - 0.02) * sr));
  const a1 = Math.min(samples.length, Math.round((t + 0.03) * sr));
  for (let a = a0; a + blk <= a1; a += blk) if (blockDb(samples, a, a + blk) > thr) return a;
  return Math.round(t * sr);
}

function refineEnd(samples, sr, t, thr, blockSec) {
  const blk = Math.max(8, Math.round(sr * blockSec));
  const b1 = Math.min(samples.length, Math.round((t + 0.02) * sr));
  const b0 = Math.max(0, Math.round((t - 0.03) * sr));
  for (let b = b1; b - blk >= b0; b -= blk) if (blockDb(samples, b - blk, b) > thr) return b;
  return Math.round(t * sr);
}

function detectIslands(features, { floorDb, speechDb, durationSec, samples = null, sampleRate = 16000, maxIslandSec = DEFAULTS.maxIslandSec, opts = {} } = {}) {
  const o = { ...DEFAULTS, ...opts };
  const { rmsDb, hop, n } = features;
  const D = Number.isFinite(durationSec) ? durationSec : n * hop;
  const thresholdDb = floorDb + Math.max(6, 0.35 * (speechDb - floorDb));
  const enterF = Math.max(1, Math.round(o.enterSec / hop));
  const exitF = Math.max(1, Math.round(o.exitSec / hop));

  // hysteresis on frames
  const raw = [];
  let inside = false, run = 0, startF = 0;
  for (let i = 0; i < n; i++) {
    const up = rmsDb[i] > thresholdDb;
    if (!inside) {
      run = up ? run + 1 : 0;
      if (run >= enterF) { inside = true; startF = i - run + 1; run = 0; }
    } else {
      run = up ? 0 : run + 1;
      if (run >= exitF) { raw.push([startF, i - run + 1]); inside = false; run = 0; }
    }
  }
  if (inside) raw.push([startF, n - run]);

  // seconds, sample-exact edge refinement
  const sr = sampleRate;
  let cores = raw.map(([a, b]) => {
    let s = a * hop, e = Math.min(D, b * hop);
    if (samples) {
      s = refineStart(samples, sr, s, thresholdDb, o.edgeBlockSec) / sr;
      e = refineEnd(samples, sr, e, thresholdDb, o.edgeBlockSec) / sr;
    }
    return { start: Math.max(0, s), end: Math.min(D, Math.max(e, s)) };
  }).filter((c) => c.end > c.start);

  // merge short gaps
  const merged = [];
  for (const c of cores) {
    const last = merged[merged.length - 1];
    if (last && c.start - last.end < o.mergeGapSec) last.end = Math.max(last.end, c.end);
    else merged.push({ ...c });
  }
  cores = merged;

  // pad (never past the midpoint of a neighbouring gap), drop short
  let padded = cores.map((c, k) => {
    const prevEnd = k > 0 ? cores[k - 1].end : null;
    const nextStart = k + 1 < cores.length ? cores[k + 1].start : null;
    const lo = prevEnd == null ? 0 : (prevEnd + c.start) / 2;
    const hi = nextStart == null ? D : (c.end + nextStart) / 2;
    return { start: Math.max(lo, c.start - o.padSec), end: Math.min(hi, c.end + o.padSec), voicedStart: c.start, voicedEnd: c.end, split: false };
  }).filter((p) => p.end - p.start >= o.minIslandSec - 1e-9);

  // split long islands at the deepest smoothed dip in the middle 60 %, recursively
  const sm = dsp.smooth(rmsDb, o.splitSmoothSec / hop);
  const splitOne = (isl, depth = 0) => {
    const L = isl.end - isl.start;
    if (!(L > maxIslandSec) || depth > 40) return [isl];
    const margin = (L * (1 - o.splitMiddle)) / 2;
    const f0 = Math.max(0, Math.ceil((isl.start + margin) / hop - 0.5));
    const f1 = Math.min(n - 1, Math.floor((isl.end - margin) / hop - 0.5));
    if (f1 <= f0) return [isl];
    const centre = (isl.start + isl.end) / 2;
    let best = f0;
    for (let i = f0; i <= f1; i++) {
      if (sm[i] < sm[best] - 1e-6 || (Math.abs(sm[i] - sm[best]) <= 1e-6 && Math.abs((i + 0.5) * hop - centre) < Math.abs((best + 0.5) * hop - centre))) best = i;
    }
    const t = Math.round((best + 0.5) * hop * sr) / sr;
    const left = { start: isl.start, end: t, voicedStart: isl.voicedStart, voicedEnd: Math.min(isl.voicedEnd, t), split: true };
    const right = { start: t, end: isl.end, voicedStart: Math.max(isl.voicedStart, t), voicedEnd: isl.voicedEnd, split: true };
    return [...splitOne(left, depth + 1), ...splitOne(right, depth + 1)];
  };
  padded = padded.flatMap((p) => splitOne(p));

  const islands = padded.map((p, k) => {
    const startSample = Math.round(p.start * sr);
    const endSample = Math.round(p.end * sr);
    return {
      id: letterId(k), startSample, endSample, start: r3(startSample / sr), end: r3(endSample / sr),
      voicedStart: r3(p.voicedStart), voicedEnd: r3(p.voicedEnd), split: p.split,
    };
  });
  return { thresholdDb, islands };
}

function silencesFrom(islands, rmsDb, { durationSec, hop = DEFAULTS.hopSec } = {}) {
  const out = [];
  let cursor = 0;
  const push = (a, b) => {
    if (b - a < hop - 1e-9) return;
    const vals = [];
    for (let i = Math.max(0, Math.floor(a / hop)); i < Math.min(rmsDb.length, Math.ceil(b / hop)); i++) vals.push(rmsDb[i]);
    out.push({ start: r3(a), end: r3(b), dur: r3(b - a), depthDb: vals.length ? r1(dsp.percentile(vals, 0.5)) : null });
  };
  for (const isl of islands) {
    if (isl.start > cursor) push(cursor, isl.start);
    cursor = Math.max(cursor, isl.end);
  }
  if (durationSec > cursor) push(cursor, durationSec);
  return out;
}

// ---------------------------------------------------------------- hum (Goertzel)
function detectHum(samples, sampleRate, silences) {
  const blockLen = Math.round(sampleRate);                      // 1 s → ~1 Hz resolution
  if (samples.length < blockLen) return null;
  const x = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) x[i] = samples[i] / 32768;
  const starts = [];
  for (const s of silences || []) {
    for (let t = s.start; t + 1 <= s.end && starts.length < 20; t += 1) starts.push(Math.round(t * sampleRate));
  }
  if (starts.length < 3) {
    const count = Math.min(20, Math.floor(samples.length / blockLen));
    const step = (samples.length - blockLen) / Math.max(1, count - 1);
    for (let k = 0; k < count && starts.length < 20; k++) starts.push(Math.round(k * step));
  }
  const win = dsp.hann(blockLen);
  const eps = 1e-20;
  let best = null;
  for (const mains of [50, 60]) {
    const prom = [[], [], [], []];
    const humP = [], bandP = [];
    for (const a of starts) {
      let sumH = 0;
      for (let k = 1; k <= 4; k++) {
        const f = mains * k;
        const p = dsp.goertzel(x, a, blockLen, f, sampleRate, win);
        const side = (dsp.goertzel(x, a, blockLen, f - 4, sampleRate, win) + dsp.goertzel(x, a, blockLen, f + 4, sampleRate, win)
          + dsp.goertzel(x, a, blockLen, f - 9, sampleRate, win) + dsp.goertzel(x, a, blockLen, f + 9, sampleRate, win)) / 4;
        prom[k - 1].push(10 * Math.log10((p + eps) / (side + eps)));
        sumH += p;
      }
      let band = 0, nb = 0;
      for (let f = 1000; f <= 3000; f += 50) { band += dsp.goertzel(x, a, blockLen, f, sampleRate, win); nb++; }
      humP.push(sumH / 4);
      bandP.push(band / nb);
    }
    const medProm = prom.map((arr) => dsp.percentile(arr, 0.5));
    const prominenceDb = Math.max(...medProm);
    const level = dsp.percentile(humP, 0.5);
    const db = 10 * Math.log10((level + eps) / (dsp.percentile(bandP, 0.5) + eps));
    const cand = { hz: mains, prominenceDb, db, notchesHz: medProm.map((p, k) => (p >= 10 ? mains * (k + 1) : null)).filter(Boolean), level };
    if (!best || cand.prominenceDb > best.prominenceDb) best = cand;
  }
  // a narrow mains peak ≥ 15 dB above its ±4/9 Hz sidebands, and not digital silence
  if (!best || best.prominenceDb < 15 || !(best.level > 1e-12)) return null;
  return { hz: best.hz, db: r1(best.db), prominenceDb: r1(best.prominenceDb), notchesHz: best.notchesHz.length ? best.notchesHz : [best.hz] };
}

// ---------------------------------------------------------------- sibilance
function sibilanceRatio(reader, speechTimes) {
  if (!reader || !speechTimes.length) return 0;
  const sr = reader.sampleRate;
  const N = sr >= 32000 ? 1024 : 512;
  const win = dsp.hann(N);
  const nyq = sr / 2;
  const hiLo = 6000, hiHi = Math.min(9000, nyq - sr / N);
  let mid = 0, hi = 0;
  const frame = new Float64Array(N);
  for (const t of speechTimes) {
    const a = Math.round(t * sr - N / 2);
    if (!reader.read(a, N, frame)) continue;
    for (let i = 0; i < N; i++) frame[i] *= win[i];
    const P = dsp.fftPower(frame);
    for (let k = 1; k < P.length; k++) {
      const f = (k * sr) / N;
      if (f >= 1000 && f <= 4000) mid += P[k];
      else if (f >= hiLo && f <= hiHi) hi += P[k];
    }
  }
  return mid > 0 ? hi / mid : 0;
}

function pcmReader(pcm) {
  return {
    sampleRate: pcm.sampleRate,
    read(a, N, out) {
      if (a < 0 || a + N > pcm.samples.length) return false;
      for (let i = 0; i < N; i++) out[i] = pcm.samples[a + i] / 32768;
      return true;
    },
  };
}

// Reads frames straight from a mono/stereo PCM16 wav on disk (voice48k is ~29 MB for 300 s; never loaded whole).
function fileReader(file) {
  let fd;
  try { fd = fs.openSync(file, "r"); } catch { return null; }
  const head = Buffer.alloc(64 * 1024);
  const got = fs.readSync(fd, head, 0, head.length, 0);
  let off = 12, fmt = null, dataOff = -1, dataLen = 0;
  if (got < 44 || head.toString("ascii", 0, 4) !== "RIFF") { fs.closeSync(fd); return null; }
  while (off + 8 <= got) {
    const id = head.toString("ascii", off, off + 4);
    const size = head.readUInt32LE(off + 4);
    if (id === "fmt ") fmt = { format: head.readUInt16LE(off + 8), channels: head.readUInt16LE(off + 10), sampleRate: head.readUInt32LE(off + 12), bits: head.readUInt16LE(off + 22) };
    if (id === "data") { dataOff = off + 8; dataLen = size; break; }
    off += 8 + size + (size % 2);
  }
  if (!fmt || dataOff < 0 || fmt.bits !== 16 || (fmt.format !== 1 && fmt.format !== 0xfffe)) { fs.closeSync(fd); return null; }
  const fileSize = fs.fstatSync(fd).size;
  if (!dataLen || dataOff + dataLen > fileSize) dataLen = fileSize - dataOff;
  const ch = fmt.channels;
  const total = Math.floor(dataLen / (2 * ch));
  return {
    sampleRate: fmt.sampleRate,
    read(a, N, out) {
      if (a < 0 || a + N > total) return false;
      const b = Buffer.alloc(N * 2 * ch);
      fs.readSync(fd, b, 0, b.length, dataOff + a * 2 * ch);
      for (let i = 0; i < N; i++) out[i] = b.readInt16LE(i * 2 * ch) / 32768;
      return true;
    },
    close() { try { fs.closeSync(fd); } catch { /* noop */ } },
  };
}

// ---------------------------------------------------------------- voice chain
function voiceChain({ snrDb, floorDb, hum, levelStdevDb, sibilance }) {
  const chain = { highpassHz: 80, notchesHz: hum ? hum.notchesHz.slice(0, 4) : [], afftdn: null, dynaudnorm: false, deesser: false, targetLufs: -16 };
  if (Number.isFinite(snrDb) && snrDb < 22) chain.afftdn = { nf: Math.round(Math.max(-80, Math.min(-20, floorDb))), nr: snrDb < 14 ? 18 : 10 };
  if (levelStdevDb > 4) chain.dynaudnorm = true;
  if (sibilance > 0.35) chain.deesser = true;
  return chain;
}

// ---------------------------------------------------------------- pure analysis
function analyzePcm(pcm, { maxIslandSec = DEFAULTS.maxIslandSec, voiceReader = null, features = null } = {}) {
  const { samples, sampleRate } = pcm;
  const durationSec = samples.length / sampleRate;
  const feat = features || dsp.frameFeatures(samples, sampleRate, { hopSec: DEFAULTS.hopSec, winSec: DEFAULTS.winSec });
  const { rmsDb, zcr, pitch, n, hop } = feat;
  const { floorDb, speechDb } = levelStats(rmsDb);
  const { thresholdDb, islands } = detectIslands(feat, { floorDb, speechDb, durationSec, samples, sampleRate, maxIslandSec });
  const silences = silencesFrom(islands, rmsDb, { durationSec, hop });

  let voiced = 0;
  for (let i = 0; i < n; i++) {
    if (rmsDb[i] > floorDb + 10 && rmsDb[i] > DEFAULTS.voicedAbsDb && zcr[i] < 0.15 && pitch[i] > 0.4) voiced++;
  }
  const voicedRatio = n ? voiced / n : 0;
  const islandSec = islands.reduce((a, s) => a + (s.end - s.start), 0);

  // level stability: energy-mean of above-threshold frames per 1 s window of speech
  const windows = [];
  let acc = 0, cnt = 0, winStart = -1;
  for (let i = 0; i < n; i++) {
    if (winStart < 0 || i - winStart >= Math.round(1 / hop)) {
      if (cnt >= 30) windows.push(10 * Math.log10(acc / cnt));
      acc = 0; cnt = 0; winStart = i;
    }
    if (rmsDb[i] > thresholdDb) { acc += 10 ** (rmsDb[i] / 10); cnt++; }
  }
  if (cnt >= 30) windows.push(10 * Math.log10(acc / cnt));
  let levelStdevDb = 0;
  if (windows.length >= 3) {
    const m = windows.reduce((a, b) => a + b, 0) / windows.length;
    levelStdevDb = Math.sqrt(windows.reduce((a, b) => a + (b - m) ** 2, 0) / windows.length);
  }

  const clipLimit = 32768 * 10 ** (DEFAULTS.clipDb / 20);
  let clipped = 0;
  for (let k = 0; k < samples.length; k++) if (Math.abs(samples[k]) >= clipLimit) clipped++;

  const speechTimes = [];
  for (let i = 0; i < n && speechTimes.length < 1500; i += 5) if (rmsDb[i] > thresholdDb && zcr[i] >= 0) speechTimes.push((i + 0.5) * hop);
  const sibilance = sibilanceRatio(voiceReader || pcmReader(pcm), speechTimes);
  const hum = detectHum(samples, sampleRate, silences);
  const snrDb = speechDb - floorDb;

  return {
    durationSec: r3(durationSec), sampleRate, hopSec: hop, features: feat,
    floorDb: r1(floorDb), speechDb: r1(speechDb), snrDb: r1(snrDb), thresholdDb: r1(thresholdDb),
    voicedRatio: r3(voicedRatio), speechRatio: r3(durationSec > 0 ? islandSec / durationSec : 0), levelStdevDb: r2(levelStdevDb),
    hum, sibilance: r3(sibilance), clippingRatio: samples.length ? Number((clipped / samples.length).toFixed(6)) : 0,
    islands, silences, noSpeech: voicedRatio < DEFAULTS.noSpeechRatio,
  };
}

// ---------------------------------------------------------------- ffmpeg loudness
function parseLoudness(stderr) {
  const text = String(stderr || "");
  const at = text.lastIndexOf("Summary:");
  const summary = at >= 0 ? text.slice(at) : "";
  const num = (re, src) => {
    const m = re.exec(src);
    if (!m) return null;
    if (/inf/i.test(m[1])) return null;
    const v = Number(m[1]);
    return Number.isFinite(v) ? v : null;
  };
  const lufs = num(/\bI:\s*(-?inf|-?[\d.]+)\s*LUFS/i, summary);
  const lra = num(/\bLRA:\s*(-?inf|-?[\d.]+)\s*LU\b/i, summary);
  const tpAt = summary.indexOf("True peak:");
  const truePeakDb = tpAt >= 0 ? num(/Peak:\s*(-?inf|-?[\d.]+)\s*dBFS/i, summary.slice(tpAt)) : null;
  const astats = {};
  const ov = text.lastIndexOf("] Overall");
  if (ov >= 0) {
    for (const line of text.slice(ov).split(/\r?\n/).slice(1)) {
      const m = /\]\s*([A-Za-z][A-Za-z ]+?):\s*(-?inf|-?[\d.]+)\s*$/.exec(line);
      if (!m) continue;
      const key = m[1].trim().replace(/\s+(\w)/g, (_, c) => c.toUpperCase()).replace(/^\w/, (c) => c.toLowerCase());
      astats[key] = /inf/i.test(m[2]) ? null : Number(m[2]);
    }
  }
  return { lufs, lra, truePeakDb, astats };
}

async function measureLoudness(fileRel, { cwd, signal, timeoutMs = 120000, pidFile, lowPriority = false } = {}) {
  const proc = require("../engine/proc");
  const r = await proc.ffmpeg([
    "-loglevel", "info", "-nostats", "-protocol_whitelist", "file", "-f", "wav", "-i", `file:${String(fileRel).split(path.sep).join("/")}`,
    "-af", "ebur128=peak=true:framelog=quiet,astats=metadata=1:reset=0", "-f", "null", "-",
  ], { cwd, signal, timeoutMs, pidFile, lowPriority, label: "audio-loudness", stage: "EXTRACTING_AUDIO" });
  return parseLoudness(r.stderr);
}

// ---------------------------------------------------------------- envelope file
function writeEnvelope(file, rmsDb) {
  const buf = Buffer.alloc(rmsDb.length * 4);
  for (let i = 0; i < rmsDb.length; i++) buf.writeFloatLE(rmsDb[i], i * 4);
  fs.writeFileSync(file, buf);
}

function readEnvelope(file) {
  const buf = fs.readFileSync(file);
  const out = new Float32Array(Math.floor(buf.length / 4));
  for (let i = 0; i < out.length; i++) out[i] = buf.readFloatLE(i * 4);
  return out;
}

function noSpeechError() {
  return new EditError("NO_SPEECH", {
    status: 422, errorClass: "resource", retryable: false, stage: "EXTRACTING_AUDIO", userMessage: "No speech detected",
    extra: { retryable: false, actions: ["continue_without_transcript", "upload_another", "delete"] },
  });
}

// ---------------------------------------------------------------- stage entry
async function analyzeAudio({
  projectDir, audioRel = "work/audio16k.wav", voiceRel = "work/voice48k.wav", runId = "run", signal = null, pidFile,
  timeoutMs, onProgress, maxIslandSec = DEFAULTS.maxIslandSec, write = true, lowPriority = false,
} = {}) {
  const progress = (p) => { if (typeof onProgress === "function") { try { onProgress(p); } catch { /* enhancement */ } } };
  const audioAbs = fsx.resolveInside(projectDir, audioRel);
  if (!fs.existsSync(audioAbs)) throw new EditError("AUDIO_MISSING", { status: 409, errorClass: "resource", retryable: true, stage: "EXTRACTING_AUDIO", detail: "audio16k missing" });
  const checkAbort = () => { if (signal && signal.aborted) throw new EditError("CANCELLED", { status: 409, errorClass: "cancelled", stage: "EXTRACTING_AUDIO" }); };

  const pcm = dsp.readWav(audioAbs);
  progress(10);
  checkAbort();
  const features = dsp.frameFeatures(pcm.samples, pcm.sampleRate, { hopSec: DEFAULTS.hopSec, winSec: DEFAULTS.winSec });
  progress(45);
  checkAbort();
  let voiceReader = null;
  try {
    const voiceAbs = voiceRel ? fsx.resolveInside(projectDir, voiceRel) : null;
    if (voiceAbs && fs.existsSync(voiceAbs)) voiceReader = fileReader(voiceAbs);
  } catch { voiceReader = null; }
  let a;
  try { a = analyzePcm(pcm, { maxIslandSec, voiceReader, features }); }
  finally { if (voiceReader && voiceReader.close) voiceReader.close(); }
  progress(70);
  checkAbort();

  let loud = { lufs: null, lra: null, truePeakDb: null, astats: {} };
  const notices = [];
  try {
    loud = await measureLoudness(audioRel, { cwd: projectDir, signal, timeoutMs: timeoutMs || Math.max(30000, a.durationSec * 500), pidFile, lowPriority });
  } catch (e) {
    if (isEditError(e) && (e.code === "PROC_ABORTED" || e.errorClass === "cancelled")) throw e;
    notices.push({ code: "LOUDNESS_UNMEASURED", severity: "info", message: null });
  }
  progress(90);
  if (a.clippingRatio > 0.001) notices.push({ code: "AUDIO_CLIPPING", severity: "warn", message: null });

  const audio = {
    schemaVersion: 1, durationSec: a.durationSec, sampleRate: a.sampleRate, hopSec: a.hopSec,
    floorDb: a.floorDb, speechDb: a.speechDb, snrDb: a.snrDb, thresholdDb: a.thresholdDb,
    lufs: loud.lufs, lra: loud.lra, truePeakDb: loud.truePeakDb, clippingRatio: a.clippingRatio,
    hum: a.hum, sibilance: a.sibilance, levelStdevDb: a.levelStdevDb, voicedRatio: a.voicedRatio, speechRatio: a.speechRatio,
    noSpeech: a.noSpeech,
    voiceChain: voiceChain(a),
    islands: a.islands, silences: a.silences, envelopeFile: ENVELOPE_REL,
  };
  const internal = a.silences.filter((s) => s.start > 0 && s.end < a.durationSec && s.dur >= 0.5);
  const discoveries = { silencesFound: internal.length, silenceSec: r1(a.silences.reduce((acc, s) => acc + s.dur, 0)) };

  if (write) {
    const envAbs = fsx.resolveInside(projectDir, ENVELOPE_REL);
    fsx.ensureDir(path.dirname(envAbs));
    const tmp = `${envAbs}.tmp.${runId}.f32`;
    try {
      writeEnvelope(tmp, features.rmsDb);
      fsx.renameWithRetrySync(tmp, envAbs);
    } finally {
      try { fs.unlinkSync(tmp); } catch { /* renamed */ }
    }
    fsx.writeJsonAtomic(fsx.resolveInside(projectDir, AUDIO_REL), audio);
  }
  progress(100);
  return {
    audio, envelope: features.rmsDb, pcm, features, noSpeech: a.noSpeech, discoveries, notices,
    outputs: { audio: { path: AUDIO_REL }, envelope: { path: ENVELOPE_REL } },
  };
}

module.exports = {
  analyzeAudio, analyzePcm, detectIslands, silencesFrom, levelStats, detectHum, sibilanceRatio, voiceChain,
  parseLoudness, measureLoudness, writeEnvelope, readEnvelope, noSpeechError, pcmReader, fileReader,
  AUDIO_REL, ENVELOPE_REL, DEFAULTS,
};
