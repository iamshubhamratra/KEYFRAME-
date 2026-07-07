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

// One ffmpeg pass → a 9×8 grayscale thumbnail (72 bytes). From it: a 64-bit
// dHash (row-wise adjacent-pixel comparisons) for perceptual dedup, and the
// grayscale standard deviation for the low-information/solid-colour guard.
function imageDHashStats(absPath) {
  return new Promise((resolve) => {
    const p = spawn("ffmpeg", [
      "-v", "error", "-i", absPath,
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
  return { ok: true, reason: null, meta };
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
  else if (!text.length) relevance = 0.35;              // provider gave no keywords
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
  download, validateMedia, validateImage, reencodeForHyperframes, UA,
  rankCandidates, scoreCandidate, MIN_LONG_EDGE,
  makeImageDeduper, imageDHashStats, hammingHex, pixFmtHasAlpha,
  imageDominantColor, colorDistance,
};
