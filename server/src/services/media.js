// Shared media probing helpers (ffprobe). Single source of truth used by the TTS
// and VO-fit stages — previously each had its own near-identical copy of
// probeDurationSec (requirement #3, remove duplicate code).

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

module.exports = { probeDurationSec };
