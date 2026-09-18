// VIDEO EDIT B-ROLL PERCEPTUAL HASH — dHash, grey stdev and mean colour for thumbnails, in one ffmpeg run.
//
// WHY THIS EXISTS. Stock providers return the same clip under different ids (re-uploads, Pexels vs
// Pixabay mirrors, 4K and HD entries) and near-identical frames from one shoot. Eight cells of the same
// shot waste the judge and, worse, can put the same picture in two B-roll slots. The perceptual hash is
// the same 64-bit dHash as services/asset_sources/util.imageDHashStats (9×8 area-scaled grayscale,
// row-major "left < right" bits) so hashes stay comparable with anything util computed, but:
//   - it hashes a whole slot's thumbnails in ONE ffmpeg process (split → 9×8 gray + 1×1 rgb per input →
//     vstack → rawvideo files), not one spawn per image (≈ 100 spawns per edit on Windows otherwise);
//   - it goes through engine/proc (abort signal, timeout, pid registry) with `-protocol_whitelist file`
//     and a demuxer FORCED from the file's magic bytes (ENGINE.md §4.8): a downloaded "thumbnail" is
//     untrusted and must never be probed as a playlist that fetches URLs;
//   - a batch that fails (one undecodable file) is retried file-by-file, so one bad image costs its own
//     hash, not the slot's;
//   - decompression bombs: every input carries ffmpeg `-max_pixels` (a flat 10000×10000 PNG is a few KB
//     but ~300 MB decoded), and batches are also bounded by their summed header pixel count, since every
//     input of a filtergraph is decoded at once.
//
// CONTRACT:
//   sniffImage(buf) -> 'jpeg'|'png'|'webp'|null · sniffFile(path) -> same · DEMUXERS
//   imageDims(buf) -> { width, height } | null   (jpeg/png via util.imageDimsFromBuffer, plus webp VP8/VP8L/VP8X)
//   inputArgs(file, { maxPixels=16e6 }) -> ffmpeg input args | null
//   statsFromGray(px72) -> { dhash:'<16 hex>', stdev }
//   hashImages(files, { workDir, signal, timeoutMs, pidFile, ffmpeg, batchSize=24, maxPixels=16e6, maxBatchPixels=64e6 })
//     -> Promise<[{ file, dhash|null, stdev|null, color:'#RRGGBB'|null }]>   (aligned with files; unreadable → nulls)
//     throws only on cancellation.
//   hamming(a, b) -> 0..64 (util.hammingHex) · nearestDistance(hash, hashes) -> number
//   dedupeByHash(items, { maxDistance=8, keyOf, hashOf, scoreOf }) -> { kept, removed:[{ item, dupOf, distance }] }
//     items sorted by score desc (key asc on ties); an item within maxDistance of a kept one is removed.

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const proc = require("../engine/proc");
const { isEditError } = require("../errors");
const { hammingHex, imageDimsFromBuffer } = require("../../services/asset_sources/util");
const { cancelledError } = require("./common");

const DEMUXERS = Object.freeze({ jpeg: "jpeg_pipe", png: "png_pipe", webp: "webp_pipe" });
const DEFAULT_MAX_PIXELS = 16 * 1000 * 1000;
const DEFAULT_MAX_BATCH_PIXELS = 64 * 1000 * 1000;

function webpDims(buf) {
  if (!buf || buf.length < 30 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WEBP") return null;
  const chunk = buf.toString("ascii", 12, 16);
  let width = 0, height = 0;
  if (chunk === "VP8 ") { width = buf.readUInt16LE(26) & 0x3fff; height = buf.readUInt16LE(28) & 0x3fff; }
  else if (chunk === "VP8L") { const b = buf.readUInt32LE(21); width = (b & 0x3fff) + 1; height = ((b >>> 14) & 0x3fff) + 1; }
  else if (chunk === "VP8X") { width = 1 + buf.readUIntLE(24, 3); height = 1 + buf.readUIntLE(27, 3); }
  return width > 0 && height > 0 ? { width, height } : null;
}

function imageDims(buf) {
  return webpDims(buf) || imageDimsFromBuffer(buf);
}

function sniffImage(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 && buf[4] === 0x0d && buf[5] === 0x0a) return "png";
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "webp";
  return null;
}

function sniffFile(file) {
  let fd = null;
  try {
    fd = fs.openSync(file, "r");
    const b = Buffer.alloc(16);
    const n = fs.readSync(fd, b, 0, 16, 0);
    return sniffImage(b.subarray(0, n));
  } catch { return null; } finally { if (fd != null) { try { fs.closeSync(fd); } catch { /* noop */ } } }
}

function inputArgs(file, { maxPixels = DEFAULT_MAX_PIXELS } = {}) {
  const kind = sniffFile(file);
  if (!kind) return null;
  const mp = Math.max(1, Math.floor(Number(maxPixels) || DEFAULT_MAX_PIXELS));
  return ["-max_pixels", String(mp), "-protocol_whitelist", "file", "-f", DEMUXERS[kind], "-i", `file:${path.resolve(file)}`];
}

function headerPixels(file, fallback) {
  try {
    const d = imageDims(fs.readFileSync(file));
    return d ? d.width * d.height : fallback;
  } catch { return fallback; }
}

function statsFromGray(px) {
  let bits = 0n;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) bits = (bits << 1n) | (px[r * 9 + c] < px[r * 9 + c + 1] ? 1n : 0n);
  }
  let sum = 0;
  for (let i = 0; i < 72; i++) sum += px[i];
  const mean = sum / 72;
  let acc = 0;
  for (let i = 0; i < 72; i++) { const d = px[i] - mean; acc += d * d; }
  return { dhash: bits.toString(16).padStart(16, "0"), stdev: Math.sqrt(acc / 72) };
}

const isCancel = (e, signal) => (signal && signal.aborted) || (isEditError(e) && e.errorClass === "cancelled");

async function runBatch(batch, results, { workDir, signal, timeoutMs = 30000, pidFile, ffmpeg = proc.ffmpeg }) {
  fs.mkdirSync(workDir, { recursive: true });
  const tag = crypto.randomBytes(6).toString("hex");
  const grayFile = path.join(workDir, `dh-${tag}.gray`);
  const colorFile = path.join(workDir, `dh-${tag}.rgb`);
  const script = path.join(workDir, `dh-${tag}.fcs`);
  const n = batch.length;
  const lines = [];
  batch.forEach((_, k) => {
    lines.push(`[${k}:v]split=2[s${k}a][s${k}b]`);
    lines.push(`[s${k}a]scale=9:8:flags=area,format=gray[g${k}]`);
    lines.push(`[s${k}b]scale=1:1:flags=area,format=rgb24[c${k}]`);
  });
  if (n === 1) {
    lines.push("[g0]null[gout]", "[c0]null[cout]");
  } else {
    lines.push(`${batch.map((_, k) => `[g${k}]`).join("")}vstack=inputs=${n}[gout]`);
    lines.push(`${batch.map((_, k) => `[c${k}]`).join("")}vstack=inputs=${n}[cout]`);
  }
  fs.writeFileSync(script, lines.join(";\n"));
  const args = [
    "-y", ...batch.flatMap((b) => b.args),
    "-/filter_complex", script,
    "-map", "[gout]", "-frames:v", "1", "-f", "rawvideo", `file:${grayFile}`,
    "-map", "[cout]", "-frames:v", "1", "-f", "rawvideo", `file:${colorFile}`,
  ];
  try {
    await ffmpeg(args, { signal, timeoutMs, pidFile, label: "broll-dhash" });
    const gray = fs.readFileSync(grayFile);
    const rgb = fs.readFileSync(colorFile);
    if (gray.length < 72 * n) throw new Error("short gray output");
    batch.forEach((b, k) => {
      const { dhash, stdev } = statsFromGray(gray.subarray(72 * k, 72 * k + 72));
      const color = rgb.length >= 3 * (k + 1)
        ? `#${[rgb[3 * k], rgb[3 * k + 1], rgb[3 * k + 2]].map((x) => x.toString(16).padStart(2, "0")).join("").toUpperCase()}`
        : null;
      results[b.i] = { file: results[b.i].file, dhash, stdev: Math.round(stdev * 1000) / 1000, color };
    });
  } finally {
    for (const f of [grayFile, colorFile, script]) { try { fs.unlinkSync(f); } catch { /* noop */ } }
  }
}

async function hashImages(files, opts = {}) {
  const list = Array.isArray(files) ? files : [];
  const results = list.map((file) => ({ file, dhash: null, stdev: null, color: null }));
  if (!opts.workDir) throw new TypeError("hashImages: workDir is required");
  const maxPixels = Math.max(1, Math.floor(Number(opts.maxPixels) || DEFAULT_MAX_PIXELS));
  const maxBatchPixels = Math.max(maxPixels, Math.floor(Number(opts.maxBatchPixels) || DEFAULT_MAX_BATCH_PIXELS));
  const valid = [];
  list.forEach((file, i) => {
    const args = inputArgs(file, { maxPixels });
    if (args) valid.push({ i, args, pixels: Math.min(maxPixels, headerPixels(file, maxPixels)) });
  });
  const size = Math.max(1, Math.min(64, Math.floor(opts.batchSize) || 24));
  const batches = [];
  let cur = [];
  let px = 0;
  for (const v of valid) {
    if (cur.length && (cur.length >= size || px + v.pixels > maxBatchPixels)) { batches.push(cur); cur = []; px = 0; }
    cur.push(v);
    px += v.pixels;
  }
  if (cur.length) batches.push(cur);
  for (const batch of batches) {
    if (opts.signal && opts.signal.aborted) throw cancelledError("dhash aborted");
    try {
      await runBatch(batch, results, opts);
    } catch (e) {
      if (isCancel(e, opts.signal)) throw isEditError(e) ? e : cancelledError("dhash aborted");
      if (batch.length === 1) continue;
      for (const one of batch) {
        try { await runBatch([one], results, opts); }
        catch (e2) { if (isCancel(e2, opts.signal)) throw isEditError(e2) ? e2 : cancelledError("dhash aborted"); }
      }
    }
  }
  return results;
}

const hamming = (a, b) => hammingHex(a, b);

function nearestDistance(hash, hashes) {
  let best = 64;
  if (!hash) return best;
  for (const h of hashes || []) if (h) best = Math.min(best, hammingHex(hash, h));
  return best;
}

function dedupeByHash(items, { maxDistance = 8, keyOf = (x) => x.key, hashOf = (x) => x.dhash, scoreOf = (x) => x.prior } = {}) {
  const sorted = [...(items || [])].sort((a, b) => {
    const d = (Number(scoreOf(b)) || 0) - (Number(scoreOf(a)) || 0);
    if (d) return d;
    const ka = String(keyOf(a)), kb = String(keyOf(b));
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
  const kept = [];
  const removed = [];
  for (const it of sorted) {
    const h = hashOf(it);
    let dup = null;
    if (h) {
      for (const k of kept) {
        const hk = hashOf(k);
        if (!hk) continue;
        const d = hammingHex(h, hk);
        if (d <= maxDistance) { dup = { of: keyOf(k), distance: d }; break; }
      }
    }
    if (dup) removed.push({ item: it, dupOf: dup.of, distance: dup.distance });
    else kept.push(it);
  }
  return { kept, removed };
}

module.exports = { sniffImage, sniffFile, DEMUXERS, statsFromGray, hashImages, hamming, nearestDistance, dedupeByHash, inputArgs, imageDims, webpDims };
