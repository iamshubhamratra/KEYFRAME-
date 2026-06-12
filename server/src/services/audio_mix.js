// FFmpeg-based audio mixer. Takes a visual MP4 and 0-or-more audio layers
// (tts, music, sfx[]) and produces a new MP4 with the audio tracks mixed in.
//
// Bug we avoid: if we used `amix=duration=first` + `-shortest`, a short TTS
// clip (say 3 s) would truncate the whole video to 3 s. Instead we:
//   1. Inject an `anullsrc` silent track as the FIRST amix input, sized to
//      the requested video duration. `duration=first` now anchors to that
//      silent track, always full length.
//   2. Use `-t durationSec` as the single authoritative output length.
//   3. Do NOT pass `-shortest` — it overrides `-t` when any audio input
//      is shorter, which was our 3-sec-video bug.
// Any layer that's null or missing is skipped; if no audio at all, we
// short-circuit and return the original path.

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

function log(...args) { console.log("[audio_mix]", ...args); }

function runFFmpeg(args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", ...args]);
    let stderr = "";
    proc.stderr.on("data", (d) => { stderr += d.toString(); });
    const timer = setTimeout(() => {
      try { proc.kill("SIGKILL"); } catch {}
    }, timeoutMs);
    proc.on("error", (err) => { clearTimeout(timer); reject(err); });
    proc.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) return resolve();
      reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-600)}`));
    });
  });
}

/**
 * Mix audio into a video file.
 */
async function mix({
  videoPath,
  outputPath,
  durationSec,
  ttsPath = null,
  musicPath = null,
  musicVolume = 0.15,
  sfx = [],
}) {
  // Build layer list (entries are just metadata; input args built separately).
  const layers = [];
  const inputs = ["-i", videoPath];              // [0:v] + [0:a] if video has audio
  let nextIdx = 1;

  // Silent anchor track — same length as the video. Guarantees amix output
  // is always `durationSec` long regardless of other layers' durations.
  inputs.push(
    "-f", "lavfi",
    "-t", String(durationSec),
    "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
  );
  const silenceIdx = nextIdx++;

  if (ttsPath) {
    inputs.push("-i", ttsPath);
    layers.push({ kind: "tts", idx: nextIdx++, volume: 1.0 });
  }
  if (musicPath) {
    // Loop music so short clips cover the whole duration.
    inputs.push("-stream_loop", "-1", "-i", musicPath);
    layers.push({ kind: "music", idx: nextIdx++, volume: musicVolume });
  }
  for (const s of sfx) {
    if (!s.path) continue;
    inputs.push("-i", s.path);
    layers.push({
      kind: "sfx",
      idx: nextIdx++,
      volume: s.volume ?? 0.5,
      delayMs: Math.max(0, Math.round((s.startSec || 0) * 1000)),
    });
  }

  if (layers.length === 0) {
    log("no audio layers — returning original video");
    if (videoPath !== outputPath) fs.copyFileSync(videoPath, outputPath);
    return outputPath;
  }

  // Filter graph: silent track first, then each layer volumed + delayed.
  const parts = [`[${silenceIdx}:a]anull[silence]`];
  const mixInputs = [`[silence]`];
  for (const l of layers) {
    const label = `a${l.idx}`;
    if (l.kind === "sfx" && l.delayMs > 0) {
      parts.push(`[${l.idx}:a]adelay=${l.delayMs}|${l.delayMs},volume=${l.volume}[${label}]`);
    } else {
      parts.push(`[${l.idx}:a]volume=${l.volume}[${label}]`);
    }
    mixInputs.push(`[${label}]`);
  }
  // duration=first anchors to the silent track (full video length).
  parts.push(`${mixInputs.join("")}amix=inputs=${layers.length + 1}:duration=first:normalize=0[aout]`);
  const filter = parts.join(";");

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const args = [
    "-y",
    ...inputs,
    "-filter_complex", filter,
    "-map", "0:v",
    "-map", "[aout]",
    "-c:v", "copy",
    "-c:a", "aac",
    "-b:a", "160k",
    "-t", String(durationSec),       // authoritative output length
    // Intentionally NO -shortest — it would re-truncate to shortest stream.
    outputPath,
  ];

  log(`mixing ${layers.length} audio layer(s) + silence anchor into ${path.basename(outputPath)} (t=${durationSec}s)`);
  const timeoutMs = Math.max(60_000, Math.round(durationSec * 6_000));
  await runFFmpeg(args, timeoutMs);
  return outputPath;
}

module.exports = { mix };
