// VIDEO EDIT STT CHUNKER — where to cut long audio for transcription, and the audio bytes for each piece.
//
// WHY THIS EXISTS. OpenRouter accepted a 608 s / 3.25 MB base64 body in one call (ANALYSIS.md §1), so
// every default-limit upload (≤ 540 s) is ONE chunk: fewer calls, no seams, no cross-chunk language
// drift. Longer audio must be split, and a cut inside a word makes both halves mis-transcribe that
// word, so cuts go at the midpoint of the longest silence near each target boundary (fallback: the
// deepest smoothed RMS dip), never inside a speech island. Chunks are disjoint and carry their source
// offset so words can be moved back onto the source timeline.
// readWavInfo parses only the WAV header, so the chain learns the duration without loading the PCM;
// island clip extraction is analysis/islands.js.
//
// CONTRACT:
//   planChunks({ durationSec, islands=[], silences=null, envelope=null, targetSec=240, maxSec=540, windowSec=30 })
//     -> [{ index, start, end }]            (pure; seconds rounded to 16 kHz samples, 6 decimals)
//   complementOf(islands, start, end) -> [{ start, end }]
//   encodeChunk({ projectDir, wavRel='work/audio16k.wav', chunk, signal, timeoutMs, pidFile, lowPriority, runId })
//     -> Promise<{ rel, abs, bytes }>   ffmpeg (engine/proc.js) → work/chunks/c<n>.mp3, mp3 16 kHz mono 48 kbps
//   readWavInfo(file) -> { sampleRate, channels, bitsPerSample, blockAlign, dataOffset, dataBytes, durationSec }
//   deepestDip(envelope, lo, hi, islands) -> seconds | null   (150 ms-smoothed RMS minimum, outside islands when possible)

const fs = require("node:fs");
const path = require("node:path");
const fsx = require("../../fsx");
const { EditError } = require("../../errors");

const WAV_REL = "work/audio16k.wav";
const SAMPLE_RATE = 16000;
const SMOOTH_SEC = 0.15;

const r6 = (x) => Math.round(x * 1e6) / 1e6;
const snapSample = (t, sr = SAMPLE_RATE) => r6(Math.round(t * sr) / sr);

function complementOf(islands, start, end) {
  const out = [];
  let cursor = start;
  const sorted = (islands || []).filter((i) => i && Number.isFinite(i.start) && Number.isFinite(i.end)).sort((a, b) => a.start - b.start);
  for (const isl of sorted) {
    if (isl.end <= cursor) continue;
    if (isl.start >= end) break;
    if (isl.start > cursor) out.push({ start: cursor, end: isl.start });
    cursor = Math.max(cursor, isl.end);
  }
  if (cursor < end) out.push({ start: cursor, end });
  return out;
}

function insideIsland(t, islands) {
  return (islands || []).some((i) => t > i.start + 1e-6 && t < i.end - 1e-6);
}

function deepestDip(envelope, lo, hi, islands) {
  const rms = envelope && envelope.rms;
  if (!rms || !rms.length) return null;
  const hop = envelope.hop || 0.01;
  const half = Math.max(1, Math.round(SMOOTH_SEC / hop / 2));
  const i0 = Math.max(0, Math.ceil(lo / hop)), i1 = Math.min(rms.length - 1, Math.floor(hi / hop));
  let best = null, bestOut = null;
  for (let i = i0; i <= i1; i++) {
    let sum = 0, n = 0;
    for (let k = Math.max(0, i - half); k <= Math.min(rms.length - 1, i + half); k++) { sum += rms[k]; n++; }
    const v = sum / n;
    const t = (i + 0.5) * hop;
    if (best == null || v < best.v) best = { v, t };
    if (!insideIsland(t, islands) && (bestOut == null || v < bestOut.v)) bestOut = { v, t };
  }
  return (bestOut || best) ? (bestOut || best).t : null;
}

function planChunks({ durationSec, islands = [], silences = null, envelope = null, targetSec = 240, maxSec = 540, windowSec = 30 } = {}) {
  const D = Number(durationSec);
  if (!Number.isFinite(D) || D <= 0) throw new EditError("STT_BAD_REQUEST", { errorClass: "bug", detail: "planChunks: durationSec must be > 0" });
  const target = Math.max(1, Math.min(Number(targetSec) || 240, Number(maxSec) || 540));
  const max = Math.max(target, Number(maxSec) || 540);
  if (D <= max + 1e-9) return [{ index: 0, start: 0, end: r6(D) }];

  const sil = Array.isArray(silences) && silences.length ? silences : complementOf(islands, 0, D);
  const cuts = [0];
  let last = 0;
  while (D - last > max + 1e-9) {
    const ideal = last + target;
    const lo = Math.max(last + 1, ideal - windowSec);
    const hi = Math.min(last + max, ideal + windowSec, D - 1);
    let best = null;
    for (const s of sil) {
      const a = Math.max(s.start, lo), b = Math.min(s.end, hi);
      if (!(b - a > 0)) continue;
      const mid = (a + b) / 2;
      const len = b - a;
      if (!best || len > best.len + 1e-9 || (Math.abs(len - best.len) <= 1e-9 && Math.abs(mid - ideal) < Math.abs(best.mid - ideal))) best = { len, mid };
    }
    let cut = best ? best.mid : deepestDip(envelope, lo, hi, islands);
    if (!Number.isFinite(cut)) cut = Math.min(hi, Math.max(lo, ideal));
    cut = snapSample(Math.min(hi, Math.max(lo, cut)));
    if (cut <= last) cut = snapSample(Math.min(D, last + max));
    cuts.push(cut);
    last = cut;
  }
  cuts.push(r6(D));
  const chunks = [];
  for (let k = 0; k + 1 < cuts.length; k++) chunks.push({ index: k, start: cuts[k], end: cuts[k + 1] });
  return chunks;
}

// ---- WAV --------------------------------------------------------------------------------------
function readWavInfo(file) {
  const fd = fs.openSync(file, "r");
  try {
    const head = Buffer.alloc(Math.min(64 * 1024, fs.fstatSync(fd).size));
    fs.readSync(fd, head, 0, head.length, 0);
    return parseWavHeader(head, fs.fstatSync(fd).size);
  } finally { fs.closeSync(fd); }
}

function parseWavHeader(buf, fileSize) {
  const bad = (d) => new EditError("AUDIO_WAV_INVALID", { errorClass: "bug", detail: d });
  if (buf.length < 12 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") throw bad("not a RIFF/WAVE file");
  let off = 12, fmt = null;
  while (off + 8 <= buf.length) {
    const id = buf.toString("ascii", off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === "fmt ") {
      fmt = { format: buf.readUInt16LE(off + 8), channels: buf.readUInt16LE(off + 10), sampleRate: buf.readUInt32LE(off + 12), blockAlign: buf.readUInt16LE(off + 20), bitsPerSample: buf.readUInt16LE(off + 22) };
    } else if (id === "data") {
      if (!fmt) throw bad("data before fmt");
      const dataOffset = off + 8;
      const dataBytes = Math.min(size === 0xffffffff || size === 0 ? fileSize - dataOffset : size, fileSize - dataOffset);
      if (fmt.bitsPerSample !== 16 || (fmt.format !== 1 && fmt.format !== 0xfffe)) throw bad("expected 16-bit PCM");
      return { ...fmt, dataOffset, dataBytes, durationSec: dataBytes / fmt.blockAlign / fmt.sampleRate };
    }
    off += 8 + size + (size % 2);
  }
  throw bad("no data chunk");
}

// ---- encode -----------------------------------------------------------------------------------
async function encodeChunk({ projectDir, wavRel = WAV_REL, chunk, signal = null, timeoutMs = null, pidFile, lowPriority = false, runId = null } = {}) {
  if (!chunk || !Number.isFinite(chunk.start) || !(chunk.end > chunk.start)) {
    throw new EditError("STT_BAD_REQUEST", { errorClass: "bug", detail: "encodeChunk: chunk {index,start,end} required" });
  }
  const { ffmpeg } = require("../../engine/proc");
  const rel = `work/chunks/c${chunk.index}.mp3`;
  const abs = fsx.resolveInside(projectDir, rel);
  const tmpRel = `work/chunks/c${chunk.index}.tmp.${String(runId || process.pid).replace(/[^A-Za-z0-9_]/g, "")}.mp3`;
  const tmpAbs = fsx.resolveInside(projectDir, tmpRel);
  fsx.resolveInside(projectDir, wavRel);
  fsx.ensureDir(path.dirname(abs));
  const dur = chunk.end - chunk.start;
  try {
    await ffmpeg([
      "-y", "-protocol_whitelist", "file", "-f", "wav",
      "-ss", chunk.start.toFixed(6), "-t", dur.toFixed(6), "-i", `file:${wavRel}`,
      "-map", "0:a:0", "-vn", "-ac", "1", "-ar", "16000", "-c:a", "libmp3lame", "-b:a", "48k", "-f", "mp3", `file:${tmpRel}`,
    ], { cwd: projectDir, signal, timeoutMs: timeoutMs || Math.round(60 * 1000 + dur * 500), pidFile, lowPriority, stage: "TRANSCRIBING", label: "ffmpeg-stt-chunk" });
    fsx.renameWithRetrySync(tmpAbs, abs);
  } finally {
    try { fs.unlinkSync(tmpAbs); } catch { /* renamed or never written */ }
  }
  return { rel, abs, bytes: fs.statSync(abs).size };
}

module.exports = {
  planChunks, complementOf, encodeChunk, readWavInfo, parseWavHeader, deepestDip,
  WAV_REL, SAMPLE_RATE,
};
