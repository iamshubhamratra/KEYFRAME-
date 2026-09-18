// Generates the AI Video Edit PIP masks in server/assets/masks from render/exprs.js PIP_MASK (RENDER.md §4 PIP).
// Run: node scripts/video_edit_gen_masks.js          (write)
//      node scripts/video_edit_gen_masks.js --check  (exit 1 when a committed PNG's pixels differ from the table)
//
// Why pre-rendered: a per-frame `geq` rounded rectangle is far too slow on this CPU, so the composite alphamerges a
// still. Masks are 8-bit grayscale (255 inside, analytic anti-aliased corners); shadows are gray+alpha PNGs (black,
// alpha = Gaussian-blurred rounded rect × opacity, shifted down by offsetY, `margin` px of canvas on every side).
// PNGs use filter 0 on every row so --check can compare pixels without depending on the zlib build's byte output.
// Also exported for tests: encodePng(w, h, channels, data) and decodePngFilter0(buf).

const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { PIP_MASK } = require("../src/video_edit/render/exprs");

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(buf) { let c = 0xffffffff; for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

// channels: 1 gray, 2 gray+alpha, 3 rgb, 4 rgba (8-bit)
function encodePng(w, h, channels, data) {
  const colorType = { 1: 0, 2: 4, 3: 2, 4: 6 }[channels];
  if (colorType === undefined || data.length !== w * h * channels) throw new Error("encodePng: bad arguments");
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = colorType; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((w * channels + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * channels + 1)] = 0;
    Buffer.from(data.buffer, data.byteOffset + y * w * channels, w * channels).copy(raw, y * (w * channels + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0)),
  ]);
}

function decodePngFilter0(buf) {
  let off = 8, w = 0, h = 0, ch = 0; const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off), type = buf.toString("ascii", off + 4, off + 8), d = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") { w = d.readUInt32BE(0); h = d.readUInt32BE(4); ch = { 0: 1, 4: 2, 2: 3, 6: 4 }[d[9]]; }
    if (type === "IDAT") idat.push(d);
    off += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(w * h * ch);
  for (let y = 0; y < h; y++) {
    const rowStart = y * (w * ch + 1);
    if (raw[rowStart] !== 0) throw new Error("decodePngFilter0: only filter 0 supported");
    raw.copy(out, y * w * ch, rowStart + 1, rowStart + 1 + w * ch);
  }
  return { w, h, channels: ch, data: out };
}

// Coverage of a rounded rect (x0,y0,rw,rh, radius r) at pixel (px,py), 4×4 supersampled for exact-enough AA.
function roundedCoverage(px, py, x0, y0, rw, rh, r) {
  const S = 4; let hit = 0;
  for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
    const x = px + (sx + 0.5) / S - x0, y = py + (sy + 0.5) / S - y0;
    if (x < 0 || y < 0 || x > rw || y > rh) continue;
    const cx = x < r ? r : x > rw - r ? rw - r : x, cy = y < r ? r : y > rh - r ? rh - r : y;
    if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) hit++;
  }
  return hit / (S * S);
}

function maskPixels(rw, rh, r) {
  const data = Buffer.alloc(rw * rh);
  for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
    const nearCorner = (x < r + 1 || x >= rw - r - 1) && (y < r + 1 || y >= rh - r - 1);
    data[y * rw + x] = nearCorner ? Math.round(255 * roundedCoverage(x, y, 0, 0, rw, rh, r)) : 255;
  }
  return data;
}

// Three box blurs ≈ Gaussian (sigma); separable, float.
function boxBlurPass(src, w, h, rad, horizontal) {
  const dst = new Float64Array(w * h), n = horizontal ? w : h, m = horizontal ? h : w, win = 2 * rad + 1;
  for (let j = 0; j < m; j++) {
    let acc = 0;
    const at = (i) => { const k = Math.min(n - 1, Math.max(0, i)); return horizontal ? src[j * w + k] : src[k * w + j]; };
    for (let i = -rad; i <= rad; i++) acc += at(i);
    for (let i = 0; i < n; i++) {
      if (horizontal) dst[j * w + i] = acc / win; else dst[i * w + j] = acc / win;
      acc += at(i + rad + 1) - at(i - rad);
    }
  }
  return dst;
}

function shadowPixels(rw, rh, r) {
  const { margin, sigma, offsetY, opacity } = PIP_MASK.shadow;
  const w = rw + 2 * margin, h = rh + 2 * margin;
  let a = new Float64Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) a[y * w + x] = roundedCoverage(x, y, margin, margin + offsetY, rw, rh, r);
  const rad = Math.max(1, Math.round((Math.sqrt((12 * sigma * sigma) / 3 + 1) - 1) / 2));
  for (let k = 0; k < 3; k++) { a = boxBlurPass(a, w, h, rad, true); a = boxBlurPass(a, w, h, rad, false); }
  const data = Buffer.alloc(w * h * 2);
  for (let i = 0; i < w * h; i++) { data[2 * i] = 0; data[2 * i + 1] = Math.round(255 * opacity * Math.min(1, a[i])); }
  return { w, h, data };
}

function allMasks() {
  const out = [];
  for (const r of PIP_MASK.radii) {
    for (const [key, [rw, rh]] of Object.entries(PIP_MASK.aspects)) {
      out.push({ file: `pip_r${r}_${key}.png`, w: rw, h: rh, channels: 1, data: maskPixels(rw, rh, r) });
      const s = shadowPixels(rw, rh, r);
      out.push({ file: `pip_r${r}_${key}_shadow.png`, w: s.w, h: s.h, channels: 2, data: s.data });
    }
  }
  return out;
}

function main() {
  const check = process.argv.includes("--check");
  fs.mkdirSync(PIP_MASK.dir, { recursive: true });
  let bad = 0;
  for (const m of allMasks()) {
    const file = path.join(PIP_MASK.dir, m.file);
    if (check) {
      let ok = false;
      try { const d = decodePngFilter0(fs.readFileSync(file)); ok = d.w === m.w && d.h === m.h && d.channels === m.channels && d.data.equals(m.data); } catch { ok = false; }
      console.log(`${ok ? "ok  " : "DIFF"} ${m.file}`);
      if (!ok) bad++;
    } else {
      const png = encodePng(m.w, m.h, m.channels, m.data);
      fs.writeFileSync(file, png);
      console.log(`wrote ${m.file} ${m.w}x${m.h} ${png.length} B`);
    }
  }
  if (bad) process.exitCode = 1;
}

if (require.main === module) main();

module.exports = { encodePng, decodePngFilter0, maskPixels, shadowPixels, allMasks };
