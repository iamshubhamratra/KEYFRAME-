// VIDEO EDIT DSP PRIMITIVES — WAV parsing and frame features for deterministic audio analysis.
//
// WHY THIS EXISTS. EXTRACTING_AUDIO, word alignment and disfluency recovery all read the same
// 16 kHz mono PCM and need the same per-frame features (ANALYSIS.md §3): RMS in dBFS on a 10 ms
// hop / 20 ms window, zero-crossing rate, and a normalized-autocorrelation pitch strength. No local
// ML is allowed, so these are plain JS loops tuned for a 300 s file on a 2-core host: prefix sums
// make RMS/ZCR O(1) per frame, and pitch runs on a 2× decimated signal and only on frames loud
// enough to be speech. Frame i is CENTRED at (i + 0.5)·hop, matching plan/timeline.js envIndex().
//
// CONTRACT (pure):
//   readWav(bufferOrPath) -> { sampleRate, channels, bitsPerSample, samples:Int16Array (mono), durationSec }
//       (PCM 16/24/32-bit int, 32-bit float, WAVE_FORMAT_EXTENSIBLE; multi-channel downmixed; EditError WAV_INVALID)
//   frameFeatures(samples, sampleRate, { hopSec=0.01, winSec=0.02, pitch=true, pitchGateDb=-60 })
//       -> { hop, win, n, rmsDb:Float32Array, zcr:Float32Array, pitch:Float32Array }
//   percentile(values, p) · smooth(arr, frames) -> Float32Array (centred moving average)
//   goertzel(x:Float32Array, start, len, freq, sampleRate, window?) -> power (normalized)
//   hann(len) -> Float32Array (cached) · fftPower(frame:Float64Array) -> Float64Array (|X|², N/2 bins)
//   dbfs(rms) -> dB (floored at -100)

const fs = require("node:fs");
const { EditError } = require("../errors");

const DB_FLOOR = -100;

function bad(detail) { return new EditError("WAV_INVALID", { status: 422, errorClass: "input", detail }); }

function dbfs(rms) {
  if (!(rms > 0)) return DB_FLOOR;
  return Math.max(DB_FLOOR, 20 * Math.log10(rms / 32768));
}

function readWav(input) {
  const buf = Buffer.isBuffer(input) ? input : fs.readFileSync(input);
  if (buf.length < 44 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") throw bad("not a RIFF/WAVE file");
  let off = 12;
  let fmt = null;
  let dataOff = -1, dataLen = 0;
  while (off + 8 <= buf.length) {
    const id = buf.toString("ascii", off, off + 4);
    let size = buf.readUInt32LE(off + 4);
    const body = off + 8;
    if (id === "fmt ") {
      if (size < 16) throw bad("fmt chunk too small");
      let format = buf.readUInt16LE(body);
      if (format === 0xfffe && size >= 26) format = buf.readUInt16LE(body + 24);
      fmt = { format, channels: buf.readUInt16LE(body + 2), sampleRate: buf.readUInt32LE(body + 4), bits: buf.readUInt16LE(body + 14) };
    } else if (id === "data") {
      if (size === 0 || size === 0xffffffff || body + size > buf.length) size = buf.length - body;
      dataOff = body;
      dataLen = size;
      break;
    }
    off = body + size + (size % 2);
  }
  if (!fmt) throw bad("missing fmt chunk");
  if (dataOff < 0) throw bad("missing data chunk");
  const { format, channels, sampleRate, bits } = fmt;
  if (!(channels >= 1) || !(sampleRate > 0)) throw bad("bad channel count or sample rate");
  const isFloat = format === 3 && bits === 32;
  if (!(format === 1 && (bits === 16 || bits === 24 || bits === 32)) && !isFloat) throw bad(`unsupported format ${format}/${bits}`);
  const bps = bits / 8;
  const frames = Math.floor(dataLen / (bps * channels));
  const out = new Int16Array(frames);
  for (let f = 0; f < frames; f++) {
    let acc = 0;
    for (let c = 0; c < channels; c++) {
      const p = dataOff + (f * channels + c) * bps;
      let v;
      if (bits === 16) v = buf.readInt16LE(p);
      else if (bits === 24) v = buf.readIntLE(p, 3) / 256;
      else if (isFloat) v = buf.readFloatLE(p) * 32767;
      else v = buf.readInt32LE(p) / 65536;
      acc += v;
    }
    const m = Math.round(acc / channels);
    out[f] = m > 32767 ? 32767 : m < -32768 ? -32768 : m;
  }
  return { sampleRate, channels, bitsPerSample: bits, samples: out, durationSec: frames / sampleRate };
}

function frameFeatures(samples, sampleRate, { hopSec = 0.01, winSec = 0.02, pitch = true, pitchGateDb = -60 } = {}) {
  const N = samples.length;
  const hopS = sampleRate * hopSec;
  const winS = Math.max(2, Math.round(sampleRate * winSec));
  const half = (winS - hopS) / 2;
  const n = Math.max(0, Math.ceil(N / hopS));
  const sq = new Float64Array(N + 1);
  const zc = new Uint32Array(N + 1);
  for (let k = 0; k < N; k++) {
    const v = samples[k];
    sq[k + 1] = sq[k] + v * v;
    zc[k + 1] = zc[k] + (k > 0 && ((v >= 0) !== (samples[k - 1] >= 0)) ? 1 : 0);
  }
  const rmsDb = new Float32Array(n);
  const zcr = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, Math.round(i * hopS - half));
    const b = Math.min(N, a + winS);
    const cnt = b - a;
    rmsDb[i] = cnt > 0 ? dbfs(Math.sqrt((sq[b] - sq[a]) / cnt)) : DB_FLOOR;
    zcr[i] = cnt > 1 ? (zc[b] - zc[a + 1]) / (cnt - 1) : 0;
  }
  const pitchArr = new Float32Array(n);
  if (pitch && n) {
    const dec = Math.max(1, Math.floor(sampleRate / 8000));
    const sr2 = sampleRate / dec;
    const M = Math.floor(N / dec);
    const x = new Float32Array(M);
    for (let k = 0; k < M; k++) {
      let s = 0;
      for (let j = 0; j < dec; j++) s += samples[k * dec + j];
      x[k] = s / dec;
    }
    const e = new Float64Array(M + 1);
    for (let k = 0; k < M; k++) e[k + 1] = e[k] + x[k] * x[k];
    const W = Math.max(8, Math.round(sr2 * winSec));
    const lagMin = Math.max(2, Math.floor(sr2 / 400));
    const lagMax = Math.ceil(sr2 / 70);
    const hop2 = sr2 * hopSec;
    const half2 = (W - hop2) / 2;
    for (let i = 0; i < n; i++) {
      if (rmsDb[i] < pitchGateDb) continue;
      const a = Math.max(0, Math.round(i * hop2 - half2));
      if (a + W + lagMin > M) continue;
      const e0 = e[a + W] - e[a];
      if (!(e0 > 0)) continue;
      let best = 0;
      const lmax = Math.min(lagMax, M - a - W);
      for (let lag = lagMin; lag <= lmax; lag++) {
        let s = 0;
        for (let j = 0; j < W; j++) s += x[a + j] * x[a + j + lag];
        const el = e[a + lag + W] - e[a + lag];
        if (el <= 0) continue;
        const r = s / Math.sqrt(e0 * el);
        if (r > best) best = r;
      }
      pitchArr[i] = Math.min(1, best);
    }
  }
  return { hop: hopSec, win: winSec, n, rmsDb, zcr, pitch: pitchArr };
}

function percentile(values, p) {
  const len = values ? values.length : 0;
  if (!len) return null;
  const a = Float64Array.from(values).sort();
  const idx = Math.max(0, Math.min(len - 1, Math.round((len - 1) * p)));
  return a[idx];
}

function smooth(arr, frames) {
  const n = arr.length;
  const out = new Float32Array(n);
  const k = Math.max(1, Math.round(frames));
  if (k <= 1) { out.set(arr); return out; }
  const pre = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + arr[i];
  const lo = Math.floor((k - 1) / 2), hi = k - 1 - lo;
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - lo), b = Math.min(n, i + hi + 1);
    out[i] = (pre[b] - pre[a]) / (b - a);
  }
  return out;
}

const hannCache = new Map();
function hann(len) {
  if (hannCache.has(len)) return hannCache.get(len);
  const w = new Float32Array(len);
  for (let i = 0; i < len; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / Math.max(1, len - 1));
  if (hannCache.size > 16) hannCache.clear();
  hannCache.set(len, w);
  return w;
}

function goertzel(x, start, len, freq, sampleRate, window = null) {
  const w = (2 * Math.PI * freq) / sampleRate;
  const coeff = 2 * Math.cos(w);
  let s1 = 0, s2 = 0;
  for (let i = 0; i < len; i++) {
    const v = x[start + i] * (window ? window[i] : 1);
    const s0 = v + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  return Math.max(0, s1 * s1 + s2 * s2 - coeff * s1 * s2) / (len * len);
}

function fftPower(frame) {
  const N = frame.length;
  if (N & (N - 1)) throw new EditError("FFT_SIZE", { errorClass: "bug", detail: "length must be a power of two" });
  const re = Float64Array.from(frame);
  const im = new Float64Array(N);
  for (let i = 1, j = 0; i < N; i++) {
    let bit = N >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { const t = re[i]; re[i] = re[j]; re[j] = t; }
  }
  for (let size = 2; size <= N; size <<= 1) {
    const ang = (-2 * Math.PI) / size;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let s = 0; s < N; s += size) {
      let cr = 1, ci = 0;
      for (let k = 0; k < size / 2; k++) {
        const a = s + k, b = a + size / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
  const out = new Float64Array(N / 2);
  for (let i = 0; i < N / 2; i++) out[i] = re[i] * re[i] + im[i] * im[i];
  return out;
}

module.exports = { readWav, frameFeatures, percentile, smooth, goertzel, hann, fftPower, dbfs, DB_FLOOR };
