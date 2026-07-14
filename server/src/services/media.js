// Shared media helpers (ffprobe/ffmpeg). Single source of truth used by the TTS
// and VO-fit stages (probeDurationSec) and by the vision-based stages — the
// asset relevance gate and the Creative Director agent — which both need a small
// JPEG thumbnail of an image or a video frame (thumbBase64).

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

// Duration (seconds) of an audio/video file via ffprobe. Resolves NULL on any
// failure (not 0) — callers distinguish "couldn't measure" from a real 0s clip
// and fall back to an estimate (e.g. vo_fit's `?? targetSec`).
function probeDurationSec(filePath) {
  return new Promise((resolve) => {
    const p = spawn("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      filePath,
    ]);
    let out = "";
    p.stdout.on("data", (d) => { out += d.toString(); });
    const timer = setTimeout(() => { try { p.kill("SIGKILL"); } catch { /* noop */ } resolve(null); }, 15_000);
    p.on("error", () => { clearTimeout(timer); resolve(null); });
    p.on("exit", (code) => {
      clearTimeout(timer);
      const s = parseFloat(String(out).trim());
      resolve(code === 0 && Number.isFinite(s) ? s : null);
    });
  });
}

// Run ffmpeg, resolving true/false on exit code (never throws). Shared by the
// thumbnailer below.
function ff(args) {
  return new Promise((resolve) => {
    const p = spawn("ffmpeg", args, { windowsHide: true });
    p.on("error", () => resolve(false));
    p.on("exit", (code) => resolve(code === 0));
  });
}

// Small base64 JPEG (≤maxWidth px wide) of an image, or of a frame ~1s into a
// video — keeps a downstream vision LLM call cheap regardless of source size.
// Resolves NULL on any failure (missing ffmpeg, unreadable file, empty output)
// so every caller can fail-open. Used by asset_vision.js and creative_director.js.
async function thumbBase64(absPath, isVideo, { maxWidth = 384 } = {}) {
  const tmp = path.join(os.tmpdir(), `kf-thumb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`);
  const vf = `scale=${maxWidth}:-2`;
  const args = isVideo
    ? ["-y", "-v", "error", "-ss", "1", "-i", absPath, "-frames:v", "1", "-vf", vf, "-q:v", "6", tmp]
    : ["-y", "-v", "error", "-i", absPath, "-frames:v", "1", "-vf", vf, "-q:v", "6", tmp];
  const ok = await ff(args);
  if (!ok || !fs.existsSync(tmp)) return null;
  try {
    const b64 = fs.readFileSync(tmp).toString("base64");
    return b64.length > 200 ? b64 : null;
  } finally {
    try { fs.unlinkSync(tmp); } catch { /* noop */ }
  }
}

module.exports = { probeDurationSec, ff, thumbBase64 };
