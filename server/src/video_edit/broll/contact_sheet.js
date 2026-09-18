// VIDEO EDIT B-ROLL CONTACT SHEET — untrusted thumbnails in, one labelled ≤ 640 px JPEG grid out.
//
// WHY THIS EXISTS. The judge (ve_broll_judge) sees candidates, never videos: llm_guard allows ≤ 8 images
// per call, ≤ 640 px long edge, ≤ 1.5 MB base64 total, and the judge batches up to 3 slots per call. One
// grid per slot with cells lettered A..H is what fits, and letters (not numbers) are what models echo
// back reliably (ANALYSIS.md §1: numeric ids were rewritten). This module:
//   - downloads provider thumbnails through broll/safe_fetch (https only, public addresses only, pinned DNS,
//     ≤ 3 re-validated redirects — Openverse thumbnails can be arbitrary third-party hosts) with a byte cap, a
//     timeout, a content-type allow-list AND a magic-byte sniff (an HTML error page served as image/jpeg is
//     rejected), header dimensions REQUIRED and capped (≤ 4096 px, ≤ 16 MP: decompression bombs), written
//     atomically — thumbnails are attacker-controllable bytes that ffmpeg will decode;
//   - picks video strip frames at 25 / 50 / 75 % of the provider's preview pictures;
//   - renders the grid in one ffmpeg pass: landscape cells (2 columns × ≤ 4 rows of 320×160: the 50 % frame
//     large at 213×160, the 25 % and 75 % frames stacked beside it) or, for a portrait edit, portrait cells
//     (4 columns × ≤ 2 rows of 160×320: the 50 % frame large on top at 160×213, the 25 % and 75 % frames side
//     by side below); a still fills the cell; each cell is outlined and its letter burned with drawtext from a bundled OFL font
//     (server/assets/fonts/edit). ffmpeg runs with cwd = the font dir so the filter script needs no
//     Windows path escaping, inputs use forced demuxers + `-protocol_whitelist file`.
//
// CONTRACT:
//   downloadThumb({ url, dest, fetch, lookup, signal, maxBytes, timeoutMs, maxEdge, maxPixels }) -> { ok, file, kind, bytes, width, height, reason }
//     reasons: bad_url | blocked | network | timeout | http_<status> | content_type | too_large | magic | dimensions
//     throws EditError CANCELLED only when `signal` aborts.
//   frameUrls(candidate) -> [https] (video: ≤ 3 strip frames in time order; image: [first thumb])
//   representativeIndex(frameCount) -> index of the 50 % frame
//   sheetFilter({ cells:[{ letter, inputs:[int] }], cellW, cellH, cols, fontFile, fontSize }) -> { script, width, height }
//   buildContactSheet({ cells:[{ letter:'A'..'H', frames:[abs 1..3] }], outFile, workDir, fontDir, fontFile, cellW, cellH,
//     cols, maxLongEdge, quality, fontSize, signal, timeoutMs, pidFile, ffmpeg }) -> { file, width, height, bytes, letters }
//   mapLimit(items, limit, fn) -> results in input order
//   DEFAULT_FONT_DIR

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const proc = require("../engine/proc");
const fsx = require("../fsx");
const { EditError, isEditError } = require("../errors");
const { sniffImage, inputArgs, imageDims } = require("./dhash");
const { cancelledError, num } = require("./common");
const { SCORING_DEFAULTS } = require("./score_defaults");
const { safeFetch } = require("./safe_fetch");

const DEFAULT_FONT_DIR = path.resolve(__dirname, "..", "..", "..", "assets", "fonts", "edit");
const MAX_CELLS = 8;
const ALLOWED_CONTENT_TYPE = /^image\/(jpeg|jpg|pjpeg|png|webp)\s*(;|$)/;
const MAX_THUMB_ASPECT = 4;

async function mapLimit(items, limit, fn) {
  const list = Array.isArray(items) ? items : [];
  const out = new Array(list.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(Math.floor(limit) || 1, list.length)) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= list.length) return;
      out[i] = await fn(list[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

async function readCapped(res, maxBytes) {
  if (res.body && typeof res.body.getReader === "function") {
    const reader = res.body.getReader();
    const chunks = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) { try { await reader.cancel(); } catch { /* noop */ } return null; }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks);
  }
  const ab = await res.arrayBuffer();
  return ab.byteLength > maxBytes ? null : Buffer.from(ab);
}

async function downloadThumb({
  url, dest, fetch: fetchImpl = null, lookup = null, signal = null, maxBytes = SCORING_DEFAULTS.sheet.thumbMaxBytes,
  timeoutMs = SCORING_DEFAULTS.sheet.thumbTimeoutMs, maxEdge = SCORING_DEFAULTS.sheet.thumbMaxEdge, maxPixels = SCORING_DEFAULTS.sheet.thumbMaxPixels,
} = {}) {
  const fail = (reason) => ({ ok: false, file: null, kind: null, bytes: 0, width: null, height: null, reason });
  if (signal && signal.aborted) throw cancelledError("thumbnail download aborted");
  if (typeof url !== "string" || url.length > 2048 || !/^https:\/\/[^\s]+$/i.test(url)) return fail("bad_url");
  if (typeof dest !== "string" || !dest) throw new TypeError("downloadThumb: dest is required");
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(new Error("thumbnail timeout")), Math.max(1, timeoutMs));
  if (typeof timer.unref === "function") timer.unref();
  const sig = signal ? AbortSignal.any([signal, ac.signal]) : ac.signal;
  try {
    let res;
    try {
      res = await safeFetch(url, { fetch: fetchImpl, lookup, signal: sig, headers: { Accept: "image/jpeg,image/png,image/webp" } });
    } catch (e) {
      if (signal && signal.aborted) throw cancelledError("thumbnail download aborted");
      if (isEditError(e) && e.code === "BROLL_URL_BLOCKED") return fail(e.extra && e.extra.reason === "bad_url" ? "bad_url" : "blocked");
      return fail(ac.signal.aborted ? "timeout" : "network");
    }
    if (!res || !res.ok) return fail(`http_${res ? Number(res.status) || 0 : 0}`);
    const headers = res.headers && typeof res.headers.get === "function" ? res.headers : { get: () => null };
    const ctype = String(headers.get("content-type") || "").toLowerCase().trim();
    if (ctype && !ALLOWED_CONTENT_TYPE.test(ctype)) return fail("content_type");
    const len = num(headers.get("content-length"));
    if (len != null && len > maxBytes) return fail("too_large");
    let buf;
    try { buf = await readCapped(res, maxBytes); } catch {
      if (signal && signal.aborted) throw cancelledError("thumbnail download aborted");
      return fail(ac.signal.aborted ? "timeout" : "network");
    }
    if (!buf) return fail("too_large");
    const kind = sniffImage(buf);
    if (!kind) return fail("magic");
    const dims = imageDims(buf);
    // Unknown dimensions are refused: the header is the only decode-size guard before ffmpeg sees the bytes.
    if (!dims || dims.width > maxEdge || dims.height > maxEdge || dims.width * dims.height > maxPixels
      || dims.width / dims.height > MAX_THUMB_ASPECT || dims.height / dims.width > MAX_THUMB_ASPECT) return fail("dimensions");
    const file = `${dest.replace(/\.(jpe?g|png|webp)$/i, "")}.${kind === "jpeg" ? "jpg" : kind}`;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
    fs.writeFileSync(tmp, buf);
    try { fsx.renameWithRetrySync(tmp, file); } catch (e) { try { fs.unlinkSync(tmp); } catch { /* noop */ } throw e; }
    return { ok: true, file, kind, bytes: buf.length, width: dims.width, height: dims.height, reason: null };
  } finally {
    clearTimeout(timer);
  }
}

function frameUrls(c) {
  const thumbs = c && Array.isArray(c.thumbs) ? c.thumbs : [];
  if (!c || c.type !== "video") return thumbs.length ? [thumbs[0]] : [];
  if (Array.isArray(c.strip) && c.strip.length) return [...new Set(c.strip)].slice(0, 3);
  const pictures = Array.isArray(c.pictures) && c.pictures.length ? c.pictures : (thumbs.length >= 3 ? thumbs.slice(1) : []);
  if (!pictures.length) return thumbs.length ? [thumbs[0]] : [];
  if (pictures.length <= 2) return [...pictures];
  const n = pictures.length;
  const idx = [...new Set([Math.floor(n * 0.25), Math.floor(n * 0.5), Math.floor(n * 0.75)].map((i) => Math.min(n - 1, i)))];
  return idx.map((i) => pictures[i]);
}

function representativeIndex(count) { return count >= 3 ? 1 : 0; }

function fit(input, w, h, label) {
  return `[${input}:v]scale=${w}:${h}:force_original_aspect_ratio=decrease:flags=area,`
    + `pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=0x1e1e1e,setsar=1,format=rgb24[${label}]`;
}

function sheetFilter({ cells, cellW = 320, cellH = 160, cols = 2, fontFile, fontSize = 28 }) {
  const lines = [];
  const portrait = cellH > cellW;
  cells.forEach((cell, k) => {
    const ins = cell.inputs;
    if (portrait && ins.length >= 3) {
      // Portrait cell: 50 % frame large on top, 25 % and 75 % frames side by side below.
      const bigH = Math.round((cellH * 2) / 3);
      const smallH = cellH - bigH;
      const w1 = Math.floor(cellW / 2);
      lines.push(fit(ins[1], cellW, bigH, `a${k}`), fit(ins[0], w1, smallH, `b${k}`), fit(ins[2], cellW - w1, smallH, `c${k}`));
      lines.push(`[b${k}][c${k}]hstack=inputs=2[bc${k}]`, `[a${k}][bc${k}]vstack=inputs=2[v${k}]`);
    } else if (portrait && ins.length === 2) {
      const h1 = Math.floor(cellH / 2);
      lines.push(fit(ins[0], cellW, h1, `a${k}`), fit(ins[1], cellW, cellH - h1, `b${k}`));
      lines.push(`[a${k}][b${k}]vstack=inputs=2[v${k}]`);
    } else if (ins.length >= 3) {
      const bigW = Math.round((cellW * 2) / 3);
      const smallW = cellW - bigW;
      const h1 = Math.floor(cellH / 2);
      lines.push(fit(ins[1], bigW, cellH, `a${k}`), fit(ins[0], smallW, h1, `b${k}`), fit(ins[2], smallW, cellH - h1, `c${k}`));
      lines.push(`[b${k}][c${k}]vstack=inputs=2[bc${k}]`, `[a${k}][bc${k}]hstack=inputs=2[v${k}]`);
    } else if (ins.length === 2) {
      const half = Math.floor(cellW / 2);
      lines.push(fit(ins[0], half, cellH, `a${k}`), fit(ins[1], cellW - half, cellH, `b${k}`));
      lines.push(`[a${k}][b${k}]hstack=inputs=2[v${k}]`);
    } else {
      lines.push(fit(ins[0], cellW, cellH, `v${k}`));
    }
    lines.push(`[v${k}]drawbox=x=0:y=0:w=iw:h=ih:color=0x000000@0.9:t=2,`
      + `drawtext=fontfile=${fontFile}:text=${cell.letter}:x=8:y=6:fontsize=${fontSize}:fontcolor=white:`
      + `box=1:boxcolor=0x000000@0.75:boxborderw=6[L${k}]`);
  });
  const n = cells.length;
  const colsUsed = Math.min(cols, n);
  const rows = Math.ceil(n / cols);
  if (n === 1) lines.push("[L0]format=yuvj420p[out]");
  else {
    const layout = cells.map((_, k) => `${(k % cols) * cellW}_${Math.floor(k / cols) * cellH}`).join("|");
    lines.push(`${cells.map((_, k) => `[L${k}]`).join("")}xstack=inputs=${n}:layout=${layout}:fill=0x101010,format=yuvj420p[out]`);
  }
  return { script: lines.join(";\n"), width: colsUsed * cellW, height: rows * cellH };
}

async function buildContactSheet(opts = {}) {
  const s = SCORING_DEFAULTS.sheet;
  const {
    cells = [], outFile, workDir, fontDir = DEFAULT_FONT_DIR, fontFile = s.fontFile, cellW = s.cellW, cellH = s.cellH,
    cols = s.cols, maxLongEdge = s.maxLongEdge, quality = s.quality, fontSize = s.fontSize, signal = null,
    timeoutMs = 60000, pidFile, ffmpeg = proc.ffmpeg,
  } = opts;
  const bug = (detail) => new EditError("BROLL_SHEET_INVALID", { errorClass: "bug", detail });
  if (!Array.isArray(cells) || cells.length < 1 || cells.length > MAX_CELLS) throw bug("1..8 cells required");
  if (typeof outFile !== "string" || !outFile || typeof workDir !== "string" || !workDir) throw bug("outFile and workDir required");
  if (!/^[A-Za-z0-9._-]+\.(ttf|otf)$/.test(String(fontFile))) throw bug("font file name");
  if (!fs.existsSync(path.join(fontDir, fontFile))) {
    throw new EditError("BROLL_SHEET_FONT_MISSING", { status: 503, errorClass: "config", detail: fontFile });
  }
  const letters = new Set();
  const inputs = [];
  const layoutCells = cells.map((cell) => {
    const letter = String(cell && cell.letter);
    if (!/^[A-H]$/.test(letter) || letters.has(letter)) throw bug("cell letters must be unique A..H");
    letters.add(letter);
    const frames = (Array.isArray(cell.frames) ? cell.frames : []).slice(0, 3);
    if (!frames.length) throw bug(`cell ${letter} has no frames`);
    const idx = frames.map((f) => {
      const args = inputArgs(f);
      if (!args) throw bug(`cell ${letter} frame is not a jpeg/png/webp`);
      inputs.push(...args);
      return inputs.filter((a) => a === "-i").length - 1;
    });
    return { letter, inputs: idx };
  });
  const { script, width, height } = sheetFilter({ cells: layoutCells, cellW, cellH, cols, fontFile, fontSize });
  if (Math.max(width, height) > maxLongEdge) throw bug(`sheet ${width}x${height} exceeds ${maxLongEdge}px`);

  fs.mkdirSync(workDir, { recursive: true });
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  const tag = crypto.randomBytes(6).toString("hex");
  const scriptFile = path.join(workDir, `sheet-${tag}.fcs`);
  const tmpOut = path.join(workDir, `sheet-${tag}.jpg`);
  fs.writeFileSync(scriptFile, script);
  try {
    await ffmpeg([
      "-y", ...inputs, "-/filter_complex", scriptFile, "-map", "[out]", "-frames:v", "1",
      "-c:v", "mjpeg", "-q:v", String(quality), "-f", "image2", "-update", "1", `file:${tmpOut}`,
    ], { cwd: fontDir, signal, timeoutMs, pidFile, label: "broll-sheet" });
    const buf = fs.readFileSync(tmpOut);
    const dims = imageDims(buf);
    if (sniffImage(buf) !== "jpeg" || !dims || dims.width !== width || dims.height !== height) {
      throw new EditError("BROLL_SHEET_BAD_OUTPUT", { errorClass: "transient", retryable: true, detail: dims ? `${dims.width}x${dims.height}` : "undecodable" });
    }
    fsx.renameWithRetrySync(tmpOut, outFile);
    return { file: outFile, width, height, bytes: buf.length, letters: layoutCells.map((c) => c.letter) };
  } catch (e) {
    if (signal && signal.aborted && !(isEditError(e) && e.errorClass === "cancelled")) throw cancelledError("sheet aborted");
    throw e;
  } finally {
    for (const f of [scriptFile, tmpOut]) { try { fs.unlinkSync(f); } catch { /* noop */ } }
  }
}

module.exports = { downloadThumb, frameUrls, representativeIndex, sheetFilter, buildContactSheet, mapLimit, DEFAULT_FONT_DIR };
