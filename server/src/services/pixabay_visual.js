// Pixabay Image + Video fetcher. Uses the officially documented API:
//   https://pixabay.com/api/          (images)
//   https://pixabay.com/api/videos/   (videos)
// Rate limit: 100 requests per 60 seconds per API key.
// All functions return a local filepath on success, or null on any failure.

const fs = require("node:fs");
const path = require("node:path");
const https = require("node:https");
const http = require("node:http");
const { spawn } = require("node:child_process");
const config = require("../config");

const IMAGE_ENDPOINT = "https://pixabay.com/api/";
const VIDEO_ENDPOINT = "https://pixabay.com/api/videos/";

function log(...args) { console.log("[pixabay_visual]", ...args); }

function orientationParam(o) {
  if (o === "vertical") return "vertical";
  if (o === "horizontal") return "horizontal";
  return "all";
}

function apiJson(endpoint, params) {
  const url = new URL(endpoint);
  url.searchParams.set("key", config.audio?.pixabayKey || "");
  for (const [k, v] of Object.entries(params)) {
    if (v != null) url.searchParams.set(k, String(v));
  }
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    fetch(url.toString(), {
      headers: { "User-Agent": "video-gen/1.0" },
      signal: controller.signal,
    }).then(async (r) => {
      clearTimeout(timer);
      if (!r.ok) return reject(new Error(`HTTP ${r.status}`));
      const data = await r.json();
      resolve(data);
    }).catch((e) => { clearTimeout(timer); reject(e); });
  });
}

function download(url, outPath, timeoutMs = 60_000) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https:") ? https : http;
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    const file = fs.createWriteStream(outPath);
    const req = client.get(url, {
      headers: { "User-Agent": "video-gen/1.0" },
      timeout: timeoutMs,
    }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close(); try { fs.unlinkSync(outPath); } catch {}
        return resolve(download(res.headers.location, outPath, timeoutMs));
      }
      if (res.statusCode !== 200) {
        file.close(); try { fs.unlinkSync(outPath); } catch {}
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      res.pipe(file);
      file.on("finish", () => file.close(() => resolve(outPath)));
    });
    req.on("error", (err) => {
      try { file.close(); fs.unlinkSync(outPath); } catch {}
      reject(err);
    });
    req.on("timeout", () => { req.destroy(new Error("timeout")); });
  });
}

/**
 * Fetch a single photograph. Returns filepath on success, null on failure.
 */
async function fetchImage({ query, orientation, outputPath, tracker }) {
  try {
    if (tracker) tracker.addExternal("pixabay_image_api");
    const data = await apiJson(IMAGE_ENDPOINT, {
      q: query,
      image_type: "photo",
      orientation: orientationParam(orientation),
      per_page: 5,
      safesearch: "true",
    });
    const hits = data?.hits || [];
    if (!hits.length) {
      log(`image: no hits for "${query}"`);
      return null;
    }
    // Prefer largeImageURL (~1280px). Fall back to webformatURL.
    const pick = hits[0];
    const url = pick.largeImageURL || pick.webformatURL;
    if (!url) return null;
    log(`image: downloading "${query}" -> ${path.basename(outputPath)}`);
    return await download(url, outputPath);
  } catch (e) {
    log(`image: fetch failed for "${query}": ${e.message}`);
    return null;
  }
}

/**
 * Fetch a single stock video clip. Returns filepath on success, null on failure.
 * Picks medium size (usually 640x360 or 960x540) for reasonable file size;
 * HyperFrames will rescale to composition size at render time.
 */
// Re-encode an MP4 to dense keyframes (every 30 frames at 30 fps) so that
// HyperFrames' frame-by-frame seek works without glitches. Without this,
// Pixabay videos trigger a "sparse keyframes" warning and frames freeze /
// skip during render. Writes a new file and replaces the original.
function reencodeForHyperframes(srcPath) {
  const tmpPath = srcPath + ".re.mp4";
  return new Promise((resolve) => {
    const args = [
      "-y", "-i", srcPath,
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
      "-r", "30", "-g", "30", "-keyint_min", "30", "-sc_threshold", "0",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      "-an",
      tmpPath,
    ];
    const p = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    p.stderr.on("data", (d) => { stderr += d.toString(); });
    const timer = setTimeout(() => { try { p.kill("SIGKILL"); } catch {} }, 60_000);
    p.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        try {
          fs.renameSync(tmpPath, srcPath);
          log(`reencoded ${path.basename(srcPath)} for hyperframes (keyint=30)`);
        } catch (e) {
          log(`reencode rename failed: ${e.message}`);
        }
      } else {
        log(`reencode failed (code ${code}); keeping original. Tail: ${stderr.slice(-200)}`);
        try { fs.unlinkSync(tmpPath); } catch {}
      }
      resolve();
    });
    p.on("error", (e) => {
      clearTimeout(timer);
      log(`reencode spawn error: ${e.message}`);
      try { fs.unlinkSync(tmpPath); } catch {}
      resolve();
    });
  });
}

async function fetchVideo({ query, orientation, outputPath, tracker }) {
  try {
    if (tracker) tracker.addExternal("pixabay_video_api");
    const data = await apiJson(VIDEO_ENDPOINT, {
      q: query,
      orientation: orientationParam(orientation),
      per_page: 5,
      safesearch: "true",
    });
    const hits = data?.hits || [];
    if (!hits.length) {
      log(`video: no hits for "${query}"`);
      return null;
    }
    const pick = hits[0];
    const v = pick.videos || {};
    const url = v.medium?.url || v.small?.url || v.large?.url || v.tiny?.url;
    if (!url) return null;
    log(`video: downloading "${query}" -> ${path.basename(outputPath)}`);
    const dl = await download(url, outputPath);
    // Re-encode to hyperframes-friendly keyframes (best effort).
    await reencodeForHyperframes(dl);
    return dl;
  } catch (e) {
    log(`video: fetch failed for "${query}": ${e.message}`);
    return null;
  }
}

module.exports = { fetchImage, fetchVideo };
