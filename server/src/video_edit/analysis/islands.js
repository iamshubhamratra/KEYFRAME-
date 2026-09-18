// VIDEO EDIT SPEECH ISLANDS — letter ids, in-memory WAV extraction and batching (ANALYSIS.md §4.4).
//
// WHY THIS EXISTS. When word-level STT fails (or leaves voiced gaps), speech islands are sent to an
// audio-capable chat model as short WAV clips. Two live-verified facts shape this module: models
// rewrite numeric ids under low reasoning effort (`i1` → `i100:00`), so islands are named with
// LETTERS (A…Z, AA…); and the payload guard only accepts short clips, so extraction is sample-exact
// from the 16 kHz PCM already in memory — no ffmpeg, no temp files, nothing written to disk.
//
// CONTRACT (pure):
//   letterId(n) -> 'A' | … | 'Z' | 'AA' …        letterIndex(id) -> n | -1
//   encodeWav(int16Samples, sampleRate) -> Buffer (RIFF/WAVE PCM s16le mono)
//   extractIslands(pcm:{samples:Int16Array, sampleRate}, islands, { contextSec=0, maxSec=null, durationSec })
//       -> [{ id, start, end, startSample, endSample, durationSec, wav:Buffer }]   (start/end include context)
//   islandsFromRegions(regions:[{start,end}], { contextSec=0.2, durationSec, sampleRate=16000 })
//       -> [{ id, start, end, startSample, endSample, regionStart, regionEnd }]   (letter ids, merged overlaps)
//   batchIslands(islands, { batchMaxSec=30, batchMaxIslands=10 }) -> island[][]   (order kept)
//   toBase64Wav(wav) -> string

const { EditError } = require("../errors");

function letterId(n) {
  if (!Number.isInteger(n) || n < 0) throw new EditError("INVALID_ISLAND_ID", { errorClass: "bug", detail: String(n) });
  let s = "";
  let x = n + 1;
  while (x > 0) {
    const r = (x - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
}

function letterIndex(id) {
  if (typeof id !== "string" || !/^[A-Z]{1,6}$/.test(id)) return -1;
  let x = 0;
  for (const c of id) x = x * 26 + (c.charCodeAt(0) - 64);
  return x - 1;
}

function encodeWav(samples, sampleRate) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write("WAVE", 8, "ascii");
  buf.write("fmt ", 12, "ascii");
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);                 // PCM
  buf.writeUInt16LE(1, 22);                 // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36, "ascii");
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(samples[i], 44 + i * 2);
  return buf;
}

const r3 = (x) => Math.round(x * 1000) / 1000;

function extractIslands(pcm, islands, { contextSec = 0, maxSec = null, durationSec } = {}) {
  if (!pcm || !(pcm.samples instanceof Int16Array) || !(pcm.sampleRate > 0)) {
    throw new EditError("INVALID_PCM", { errorClass: "bug", detail: "extractIslands needs {samples:Int16Array, sampleRate}" });
  }
  const sr = pcm.sampleRate;
  const total = pcm.samples.length;
  const D = Number.isFinite(durationSec) ? durationSec : total / sr;
  return (islands || []).map((isl, k) => {
    let start = Math.max(0, Number(isl.start) - contextSec);
    let end = Math.min(D, Number(isl.end) + contextSec);
    if (Number.isFinite(maxSec) && maxSec > 0 && end - start > maxSec) end = start + maxSec;
    const startSample = Math.max(0, Math.min(total, Math.round(start * sr)));
    const endSample = Math.max(startSample, Math.min(total, Math.round(end * sr)));
    const wav = encodeWav(pcm.samples.subarray(startSample, endSample), sr);
    return {
      id: typeof isl.id === "string" && letterIndex(isl.id) >= 0 ? isl.id : letterId(k),
      start: r3(startSample / sr), end: r3(endSample / sr), startSample, endSample,
      durationSec: r3((endSample - startSample) / sr), wav,
    };
  });
}

function islandsFromRegions(regions, { contextSec = 0.2, durationSec = Infinity, sampleRate = 16000 } = {}) {
  const sorted = (regions || [])
    .filter((r) => r && Number.isFinite(r.start) && Number.isFinite(r.end) && r.end > r.start)
    .map((r) => ({ regionStart: r.start, regionEnd: r.end, start: Math.max(0, r.start - contextSec), end: Math.min(durationSec, r.end + contextSec) }))
    .sort((a, b) => a.start - b.start);
  const merged = [];
  for (const r of sorted) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) {
      last.end = Math.max(last.end, r.end);
      last.regionEnd = Math.max(last.regionEnd, r.regionEnd);
    } else merged.push({ ...r });
  }
  return merged.map((r, k) => ({
    id: letterId(k), start: r3(r.start), end: r3(r.end),
    startSample: Math.round(r.start * sampleRate), endSample: Math.round(r.end * sampleRate),
    regionStart: r3(r.regionStart), regionEnd: r3(r.regionEnd),
  }));
}

function batchIslands(islands, { batchMaxSec = 30, batchMaxIslands = 10 } = {}) {
  const batches = [];
  let cur = [];
  let sec = 0;
  for (const isl of islands || []) {
    const d = Math.max(0, Number(isl.end) - Number(isl.start));
    if (cur.length && (cur.length >= batchMaxIslands || sec + d > batchMaxSec)) { batches.push(cur); cur = []; sec = 0; }
    cur.push(isl);
    sec += d;
  }
  if (cur.length) batches.push(cur);
  return batches;
}

function toBase64Wav(wav) { return Buffer.isBuffer(wav) ? wav.toString("base64") : ""; }

module.exports = { letterId, letterIndex, encodeWav, extractIslands, islandsFromRegions, batchIslands, toBase64Wav };
