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

function scoreCandidate(query, c) {
  const q = tokenize(query);
  const text = tokenize([c.tags, c.title, c.alt].filter(Boolean).join(" "));
  let relevance;
  if (!q.length) relevance = 0.5;
  else if (!text.length) relevance = 0.35;              // provider gave no keywords
  else relevance = q.filter((w) => text.includes(w)).length / q.length;
  const longEdge = Math.max(Number(c.width) || 0, Number(c.height) || 0);
  const quality = longEdge > 0 ? Math.min(1, longEdge / 1920) : 0.4;
  return { score: relevance * 0.65 + quality * 0.35, relevance, longEdge };
}

// Best-first ordering. Drops candidates too small to look good full-bleed, but
// keeps them if that would leave nothing (a filled scene beats an empty one).
function rankCandidates(query, candidates) {
  const scored = (candidates || [])
    .filter((c) => c && c.url)
    .map((c) => ({ c, ...scoreCandidate(query, c) }))
    .sort((a, b) => b.score - a.score);
  const sharp = scored.filter((s) => s.longEdge === 0 || s.longEdge >= MIN_LONG_EDGE);
  return (sharp.length ? sharp : scored).map((s) => s.c);
}

module.exports = { download, validateMedia, reencodeForHyperframes, UA, rankCandidates, scoreCandidate, MIN_LONG_EDGE };
