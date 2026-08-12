// Shared helpers for asset providers: HTTP download with redirects,
// ffprobe-based media validation, and the dense-keyframe re-encode that
// HyperFrames' frame-by-frame seek needs.

const fs = require("node:fs");
const path = require("node:path");
const https = require("node:https");
const http = require("node:http");
const { spawn } = require("node:child_process");

const UA = "keyframe-studio/0.1 (asset fetcher)";

function download(url, outPath, { timeoutMs = 60_000, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https:") ? https : http;
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    const file = fs.createWriteStream(outPath);
    const req = client.get(url, { headers: { "User-Agent": UA, ...headers }, timeout: timeoutMs }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
        file.close(); try { fs.unlinkSync(outPath); } catch { /* noop */ }
        const loc = new URL(res.headers.location, url).toString();
        return resolve(download(loc, outPath, { timeoutMs, headers }));
      }
      if (res.statusCode !== 200) {
        file.close(); try { fs.unlinkSync(outPath); } catch { /* noop */ }
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      res.pipe(file);
      file.on("finish", () => file.close(() => resolve(outPath)));
    });
    req.on("error", (err) => {
      try { file.close(); fs.unlinkSync(outPath); } catch { /* noop */ }
      reject(err);
    });
    req.on("timeout", () => req.destroy(new Error("download timeout")));
  });
}

// ffprobe validates both images and videos: a decodable stream with real
// dimensions. Also rejects suspiciously tiny files (error pages saved as media).
function validateMedia(filePath, type) {
  return new Promise((resolve) => {
    try {
      if (fs.statSync(filePath).size < 5 * 1024) return resolve(false);
    } catch { return resolve(false); }
    const p = spawn("ffprobe", [
      "-v", "error",
      "-select_streams", "v:0",
      "-show_entries", "stream=codec_name,width,height",
      "-of", "json",
      filePath,
    ]);
    let out = "";
    p.stdout.on("data", (d) => { out += d.toString(); });
    const timer = setTimeout(() => { try { p.kill("SIGKILL"); } catch { /* noop */ } }, 20_000);
    p.on("error", () => { clearTimeout(timer); resolve(false); });
    p.on("exit", (code) => {
      clearTimeout(timer);
      if (code !== 0) return resolve(false);
      try {
        const j = JSON.parse(out);
        const s = j.streams && j.streams[0];
        resolve(Boolean(s && s.width > 0 && s.height > 0));
      } catch { resolve(false); }
    });
  });
}

// Re-encode to keyframe-dense H.264 (every 30 frames) — without this,
// HyperFrames' deterministic seek glitches on sparse-keyframe stock clips.
function reencodeForHyperframes(srcPath) {
  const tmpPath = srcPath + ".re.mp4";
  return new Promise((resolve) => {
    const p = spawn("ffmpeg", [
      "-y", "-hide_banner", "-loglevel", "error", "-i", srcPath,
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
      "-r", "30", "-g", "30", "-keyint_min", "30", "-sc_threshold", "0",
      "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an",
      tmpPath,
    ]);
    const timer = setTimeout(() => { try { p.kill("SIGKILL"); } catch { /* noop */ } }, 120_000);
    p.on("error", () => { clearTimeout(timer); try { fs.unlinkSync(tmpPath); } catch { /* noop */ } resolve(); });
    p.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        try { fs.renameSync(tmpPath, srcPath); } catch { /* keep original */ }
      } else {
        try { fs.unlinkSync(tmpPath); } catch { /* noop */ }
      }
      resolve();
    });
  });
}

// ---- Image quality analysis (ffmpeg/ffprobe — no native deps) ----
// KEYFRAME already hard-depends on ffmpeg/ffprobe for every media step, so image
// validation piggybacks on them instead of pulling in a native module (sharp):
// real dimensions + pixel format (alpha), a low-information/solid-colour guard,
// and a perceptual dHash for near-duplicate detection.
const crypto = require("node:crypto");

// Pixel formats that actually carry an alpha channel (transparency).
function pixFmtHasAlpha(pf) {
  return /\b(rgba|bgra|argb|abgr|rgba64|bgra64|yuva\d|ya8|ya16|gbrap|pal8)\b/i.test(String(pf || ""));
}

// ffprobe one image: real width/height + pixel format. null on failure.
function ffprobeImage(absPath) {
  return new Promise((resolve) => {
    const p = spawn("ffprobe", [
      "-v", "error", "-select_streams", "v:0",
      "-show_entries", "stream=width,height,pix_fmt", "-of", "json", absPath,
    ], { windowsHide: true });
    let out = "";
    p.stdout.on("data", (d) => { out += d.toString(); });
    const timer = setTimeout(() => { try { p.kill("SIGKILL"); } catch { /* noop */ } }, 15_000);
    p.on("error", () => { clearTimeout(timer); resolve(null); });
    p.on("exit", (code) => {
      clearTimeout(timer);
      if (code !== 0) return resolve(null);
      try {
        const j = JSON.parse(out);
        const s = j.streams && j.streams[0];
        resolve(s ? { width: Number(s.width) || 0, height: Number(s.height) || 0, pixFmt: String(s.pix_fmt || "") } : null);
      } catch { resolve(null); }
    });
  });
}

// Pixel dims straight out of an encoded image BUFFER — no subprocess, no native
// dep. Used where we already hold the bytes (a just-downloaded capture), so the
// caller can stamp real width/height without paying an ffprobe spawn per image.
// PNG: IHDR is fixed at byte 16/20. JPEG: walk the length-prefixed segment chain
// to the first Start-Of-Frame (0xFFC0-0xFFCF minus DHT/JPG/DAC) and read +5/+7.
// Returns null for anything else — callers fall back to ffprobeImage.
function imageDimsFromBuffer(buf) {
  if (!buf || buf.length < 24) return null;
  // PNG
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    const width = buf.readUInt32BE(16), height = buf.readUInt32BE(20);
    return width > 0 && height > 0 ? { width, height } : null;
  }
  // JPEG
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let o = 2;
    while (o + 9 < buf.length) {
      if (buf[o] !== 0xff) { o++; continue; }
      const marker = buf[o + 1];
      if (marker === 0xff) { o++; continue; }                                   // fill byte
      if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 ||
          (marker >= 0xd0 && marker <= 0xd7)) { o += 2; continue; }             // standalone
      if (marker >= 0xc0 && marker <= 0xcf &&
          marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        const height = buf.readUInt16BE(o + 5), width = buf.readUInt16BE(o + 7);
        return width > 0 && height > 0 ? { width, height } : null;
      }
      const len = buf.readUInt16BE(o + 2);
      if (len < 2) return null;
      o += 2 + len;
    }
  }
  return null;
}

// One ffmpeg pass → a 9×8 grayscale thumbnail (72 bytes). From it: a 64-bit
// dHash (row-wise adjacent-pixel comparisons) for perceptual dedup, and the
// grayscale standard deviation for the low-information/solid-colour guard.
// `seekSec` (ported from Rohit) matters only for VIDEO: frame 0 of a stock clip
// is very often a black or white fade-in, so hashing it makes every clip in the
// pool look like every other one — the perceptual dedupe would either drop
// everything or nothing. Seeking a little way in samples an actual picture.
// Images ignore it (they have one frame); default 0 keeps every existing caller
// byte-identical.
function imageDHashStats(absPath, { seekSec = 0 } = {}) {
  return new Promise((resolve) => {
    const seek = Number(seekSec) > 0 ? ["-ss", String(Number(seekSec))] : [];
    const p = spawn("ffmpeg", [
      "-v", "error", ...seek, "-i", absPath,
      "-vf", "scale=9:8:flags=area,format=gray", "-frames:v", "1", "-f", "rawvideo", "-",
    ], { windowsHide: true });
    const chunks = [];
    p.stdout.on("data", (d) => chunks.push(d));
    const timer = setTimeout(() => { try { p.kill("SIGKILL"); } catch { /* noop */ } }, 15_000);
    p.on("error", () => { clearTimeout(timer); resolve({ dhash: null, stdev: null }); });
    p.on("exit", (code) => {
      clearTimeout(timer);
      const buf = Buffer.concat(chunks);
      if (code !== 0 || buf.length < 72) return resolve({ dhash: null, stdev: null });
      const px = buf.subarray(0, 72); // 8 rows × 9 cols, row-major
      let bits = 0n;
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          bits = (bits << 1n) | (px[r * 9 + c] < px[r * 9 + c + 1] ? 1n : 0n);
        }
      }
      let sum = 0; for (let i = 0; i < 72; i++) sum += px[i];
      const mean = sum / 72;
      let varAcc = 0; for (let i = 0; i < 72; i++) { const d = px[i] - mean; varAcc += d * d; }
      resolve({ dhash: bits.toString(16).padStart(16, "0"), stdev: Math.sqrt(varAcc / 72) });
    });
  });
}

// Hamming distance between two 16-hex-char (64-bit) dHashes. 64 (max) if either
// is missing, so a hashless asset never counts as a duplicate of anything.
function hammingHex(a, b) {
  if (!a || !b) return 64;
  let x = BigInt("0x" + a) ^ BigInt("0x" + b), n = 0;
  while (x > 0n) { n += Number(x & 1n); x >>= 1n; }
  return n;
}

function md5File(absPath) {
  try { return crypto.createHash("md5").update(fs.readFileSync(absPath)).digest("hex"); }
  catch { return null; }
}

const LOW_INFO_STDEV = 5; // grayscale stdev (0–255) below this ≈ solid/near-flat

// Post-download quality gate for a raster still. Returns { ok, reason, meta }
// where meta carries real width/height/ratio/hasAlpha/dhash for downstream
// fitting + dedup. FAIL-SAFE: if ffmpeg/ffprobe can't read it we do NOT reject
// (validateMedia already proved it decodes). SVGs are vectors → always ok.
async function validateImage(absPath, { kindPref } = {}) {
  if (path.extname(absPath).toLowerCase() === ".svg") {
    return { ok: true, reason: null, meta: { vector: true, hasAlpha: true, dhash: null } };
  }
  const [probe, sig, dominantColor] = await Promise.all([ffprobeImage(absPath), imageDHashStats(absPath), imageDominantColor(absPath)]);
  const width = probe ? probe.width : 0;
  const height = probe ? probe.height : 0;
  const hasAlpha = probe ? pixFmtHasAlpha(probe.pixFmt) : false;
  const ratio = width && height ? Math.round((width / height) * 1000) / 1000 : null;
  const meta = { width, height, ratio, hasAlpha, dhash: sig.dhash, stdev: sig.stdev, dominantColor };

  // 1. Near-flat / solid colour: an error page saved as an image, a blank
  //    placeholder, or a plain-colour banner — no visual value in a film.
  if (sig.stdev != null && sig.stdev < LOW_INFO_STDEV) {
    return { ok: false, reason: `low-information image (stdev ${sig.stdev.toFixed(1)})`, meta };
  }
  // 2. A transparent icon/vector role can't be satisfied by an opaque raster.
  if (kindPref === "vector" && probe && !hasAlpha) {
    return { ok: false, reason: "opaque raster for a vector/icon role (no alpha)", meta };
  }
  // 3. Soft/low-res opaque photo: full-bleed placement at 1080p needs
  //    MIN_LONG_EDGE on the long side. Enforced only with REAL probed dims and
  //    only for opaque rasters (transparent vector/sticker art is placed small,
  //    never full-bleed). Closes the scraper hole: candidates with width:null
  //    bypass the rank-time MIN_LONG_EDGE check, so a 640px CDN preview could
  //    ship as a full-bleed hero.
  if (probe && !hasAlpha && width > 0 && height > 0 && Math.max(width, height) < MIN_LONG_EDGE) {
    return { ok: false, reason: `low-resolution (${width}x${height}; need ${MIN_LONG_EDGE}px long edge)`, meta };
  }
  return { ok: true, reason: null, meta };
}

// VIDEO's counterpart to validateImage (ported from Rohit's asset_sources/util.js).
//
// Everything the image path has had for a long time — a resolution floor, a
// usable-length floor, and a perceptual hash so the same clip fetched from two
// providers is caught — video had NONE of. A fetched clip passed exactly one
// test upstream (validateMedia: over 5KB, one decodable stream with non-zero
// dimensions), which is why video was also the only asset type with no duplicate
// detection at all. The probe is one ffprobe call and the hash is one
// seek-and-decode, so a clip now costs about what an image costs.
//
// FAIL-SAFE in the same direction as validateImage: an unreadable probe returns
// ok:true with null meta, because "we could not measure it" must never mean
// "reject it".
async function validateClip(absPath) {
  const { probeVideo, gradeClip } = require("../video_probe");
  const probe = await probeVideo(absPath);
  if (!probe || probe.ok !== true) {
    // A file ffprobe cannot open at all is already rejected by validateMedia
    // upstream; if we got here with an unreadable probe, say nothing rather than
    // double-rejecting.
    return { ok: true, reason: null, meta: null };
  }
  const grade = gradeClip(probe);
  // A third of the way in, capped so a long clip does not seek past anything
  // interesting — and past the fade-in that would otherwise be the hash.
  const seekSec = probe.durationSec ? Math.min(probe.durationSec / 3, 3) : 0;
  const { dhash, stdev } = await imageDHashStats(absPath, { seekSec });
  const meta = {
    width: probe.width, height: probe.height,
    ratio: probe.width && probe.height ? Math.round((probe.width / probe.height) * 1000) / 1000 : null,
    durationSec: probe.durationSec, fps: probe.fps, bitrateKbps: probe.bitrateKbps,
    codec: probe.codec, hasAudio: probe.hasAudio, dhash, stdev,
  };
  return { ok: grade.ok, reason: grade.ok ? null : grade.reasons.join("; "), meta };
}

// Exact (MD5) + perceptual (dHash) de-duplication across a video's asset pool.
// Replaces the old MD5-only dedup so a visually-identical re-encode (different
// bytes, same picture) is also caught. Videos/SVGs skip the perceptual pass.
function makeImageDeduper({ threshold = 10 } = {}) {
  const md5s = new Set();
  const dhashes = [];
  async function dhashFor(absPath, provided) {
    if (provided) return provided;
    if (path.extname(absPath).toLowerCase() === ".svg") return null;
    const { dhash } = await imageDHashStats(absPath);
    return dhash;
  }
  return {
    // Record a known-keep asset (e.g. a pinned screenshot) without reporting.
    async add(absPath, dhash) {
      const m = md5File(absPath); if (m) md5s.add(m);
      const d = await dhashFor(absPath, dhash); if (d) dhashes.push(d);
    },
    // "exact" | "perceptual" | null. Records the asset on a miss.
    async check(absPath, dhash) {
      const m = md5File(absPath);
      if (m && md5s.has(m)) return "exact";
      const d = await dhashFor(absPath, dhash);
      if (d) { for (const h of dhashes) if (hammingHex(d, h) <= threshold) return "perceptual"; }
      if (m) md5s.add(m);
      if (d) dhashes.push(d);
      return null;
    },
  };
}

// ---- Relevance + quality ranking for provider search candidates ----
// The retrieval layer used to use the first search hit, so a loosely-related or
// low-resolution image could win purely by position — the root of "random /
// low-quality assets". rankCandidates scores every candidate by (a) how many of
// the query's keywords appear in its tags/title/alt and (b) its resolution, then
// returns them best-first with junk-resolution dropped.
const MIN_LONG_EDGE = 900; // px — below this a still looks soft full-bleed at 1080p

function tokenize(s) {
  return [...new Set(String(s || "").toLowerCase().match(/[a-z0-9]{3,}/g) || [])];
}

// `styleKeywords` (optional) are the active pack's style words (e.g. ["neon",
// "retro"] for vapor-chrome). When supplied, a candidate whose tags carry those
// words is rewarded — on-brand imagery ranks above generic matches — without
// rejecting anything. Scoring is unchanged when no style context is passed.
function scoreCandidate(query, c, styleKeywords) {
  const q = tokenize(query);
  const text = tokenize([c.tags, c.title, c.alt].filter(Boolean).join(" "));
  let relevance;
  if (!q.length) relevance = 0.5;
  // NO KEYWORDS IS UNKNOWN RELEVANCE, NOT AVERAGE RELEVANCE. The old flat 0.35
  // outranked a candidate that genuinely matched one word of a four-word query
  // (0.25), so a provider that returns no text (the site scraper, before it
  // started carrying tags) beat every real match and its arrival order survived
  // ranking intact. Half of one matched word instead: an unlabelled candidate
  // still ranks above a labelled MISmatch (0) and below any real hit.
  else if (!text.length) relevance = 0.5 / q.length;    // provider gave no keywords
  else relevance = q.filter((w) => text.includes(w)).length / q.length;
  const longEdge = Math.max(Number(c.width) || 0, Number(c.height) || 0);
  const quality = longEdge > 0 ? Math.min(1, longEdge / 1920) : 0.4;
  const sk = Array.isArray(styleKeywords) ? styleKeywords.map((w) => String(w).toLowerCase()) : [];
  const styleMatch = (sk.length && text.length) ? sk.filter((w) => text.includes(w)).length / sk.length : 0;
  const score = sk.length
    ? relevance * 0.5 + quality * 0.25 + styleMatch * 0.25
    : relevance * 0.65 + quality * 0.35; // exact legacy behaviour with no style context
  return { score, relevance, longEdge, styleMatch };
}

// Best-first ordering. Drops candidates too small to look good full-bleed, but
// keeps them if that would leave nothing (a filled scene beats an empty one).
function rankCandidates(query, candidates, styleKeywords) {
  const scored = (candidates || [])
    .filter((c) => c && c.url)
    .map((c) => ({ c, ...scoreCandidate(query, c, styleKeywords) }))
    .sort((a, b) => b.score - a.score);
  const sharp = scored.filter((s) => s.longEdge === 0 || s.longEdge >= MIN_LONG_EDGE);
  return (sharp.length ? sharp : scored).map((s) => s.c);
}

// Dominant color of an image (Phase 6) — the average RGB via a single-pixel
// ffmpeg downscale. Cheap (one pass, same shape as imageDHashStats); used for
// palette-affinity so on-brand assets earn the prominent placements.
function imageDominantColor(absPath) {
  return new Promise((resolve) => {
    const p = spawn("ffmpeg", [
      "-v", "error", "-i", absPath,
      "-vf", "scale=1:1:flags=area,format=rgb24", "-frames:v", "1", "-f", "rawvideo", "-",
    ], { windowsHide: true });
    const chunks = [];
    p.stdout.on("data", (d) => chunks.push(d));
    const timer = setTimeout(() => { try { p.kill("SIGKILL"); } catch { /* noop */ } }, 15_000);
    p.on("error", () => { clearTimeout(timer); resolve(null); });
    p.on("exit", (code) => {
      clearTimeout(timer);
      const buf = Buffer.concat(chunks);
      if (code !== 0 || buf.length < 3) return resolve(null);
      resolve("#" + [buf[0], buf[1], buf[2]].map((x) => x.toString(16).padStart(2, "0")).join("").toUpperCase());
    });
  });
}

// Euclidean distance between two #RRGGBB colors (0 = identical, ~441 = max).
function colorDistance(a, b) {
  const pa = /^#?([0-9a-f]{6})$/i.exec(String(a || "").trim());
  const pb = /^#?([0-9a-f]{6})$/i.exec(String(b || "").trim());
  if (!pa || !pb) return Infinity;
  const na = parseInt(pa[1], 16), nb = parseInt(pb[1], 16);
  const dr = ((na >> 16) & 255) - ((nb >> 16) & 255);
  const dg = ((na >> 8) & 255) - ((nb >> 8) & 255);
  const db = (na & 255) - (nb & 255);
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

module.exports = {
  download, validateMedia, validateImage, validateClip, reencodeForHyperframes, UA,
  rankCandidates, scoreCandidate, MIN_LONG_EDGE,
  makeImageDeduper, imageDHashStats, hammingHex, pixFmtHasAlpha,
  imageDominantColor, colorDistance,
  ffprobeImage, imageDimsFromBuffer,
};
