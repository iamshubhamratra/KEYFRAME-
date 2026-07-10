// FFmpeg-based audio mixer. Takes a visual MP4 and 0-or-more audio layers
// (tts, music, ambient, sfx[]) and produces a new MP4 with the audio mixed in.
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

function runFFmpeg(args, timeoutMs, { loglevel = "error" } = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", ["-hide_banner", "-nostats", "-loglevel", loglevel, ...args]);
    let stderr = "";
    proc.stderr.on("data", (d) => { stderr += d.toString(); });
    const timer = setTimeout(() => {
      try { proc.kill("SIGKILL"); } catch {}
    }, timeoutMs);
    proc.on("error", (err) => { clearTimeout(timer); reject(err); });
    proc.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) return resolve(stderr);
      reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-600)}`));
    });
  });
}

// Piecewise volume automation for the music bed. Points are absolute volumes
// ({atSec, volume}); each new level ramps in over RAMP_SEC from the point's
// start so scene-to-scene changes glide instead of stepping. Returns an ffmpeg
// volume-filter expression, or null if the points are unusable.
const RAMP_SEC = 0.9;
function envelopeExpr(points) {
  const pts = (Array.isArray(points) ? points : [])
    .map((p) => ({ at: Number(p.atSec), vol: Number(p.volume) }))
    .filter((p) => Number.isFinite(p.at) && p.at >= 0 && Number.isFinite(p.vol) && p.vol >= 0 && p.vol <= 1)
    .sort((a, b) => a.at - b.at)
    // collapse duplicate timestamps (last wins)
    .filter((p, i, a) => i === a.length - 1 || a[i + 1].at - p.at > 0.05);
  if (pts.length < 2) return null;
  if (pts[0].at > 0.05) pts.unshift({ at: 0, vol: pts[0].vol });

  let expr = String(pts[0].vol);
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1].vol, cur = pts[i].vol, at = pts[i].at;
    // From `at`: glide prev→cur over RAMP_SEC, then hold cur.
    const seg = `${prev}+(${cur}-${prev})*min((t-${at})/${RAMP_SEC},1)`;
    expr = `if(gte(t,${at}),${seg},${expr})`;
  }
  return expr;
}

// Parse the JSON block that `loudnorm=print_format=json` emits on stderr.
function parseLoudnormJson(stderrText) {
  const m = String(stderrText).match(/\{[^{}]*"input_i"[\s\S]*?\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]);
    const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : null; };
    return { integratedLufs: n(j.input_i), truePeakDb: n(j.input_tp), lra: n(j.input_lra) };
  } catch { return null; }
}

// Measure the mixed file's loudness; if it's off-target, apply a bounded gain
// trim (audio-only re-encode, video stream copied) and re-limit. Fail-open:
// any measurement/adjust error leaves the mix as-is and reports what it can.
async function normalizeLoudness(filePath, { targetLufs, timeoutMs }) {
  const report = { targetLufs, integratedLufs: null, truePeakDb: null, lra: null, gainAppliedDb: 0 };
  let measured;
  try {
    const stderr = await runFFmpeg(
      ["-i", filePath, "-map", "0:a:0",
       "-af", `loudnorm=I=${targetLufs}:TP=-1.5:LRA=11:print_format=json`,
       "-f", "null", "-"],
      timeoutMs, { loglevel: "info" },
    );
    measured = parseLoudnormJson(stderr);
  } catch (e) {
    log(`loudness measurement failed (keeping mix as-is): ${String(e.message).slice(0, 160)}`);
    return report;
  }
  if (!measured || measured.integratedLufs === null) return report;
  Object.assign(report, measured);

  const delta = targetLufs - measured.integratedLufs;
  // Within a dB of target → leave it; beyond ±12 dB the measurement is suspect
  // (near-silent or clipped input) and a blind gain would do more harm than good.
  if (Math.abs(delta) <= 1.0 || Math.abs(delta) > 12) return report;

  const gain = Math.round(delta * 10) / 10;
  const tmp = filePath + ".norm.mp4";
  try {
    await runFFmpeg(
      ["-y", "-i", filePath,
       "-map", "0:v", "-map", "0:a",
       "-c:v", "copy",
       "-af", `volume=${gain}dB,alimiter=limit=0.95:attack=5:release=50`,
       "-c:a", "aac", "-b:a", "160k",
       tmp],
      timeoutMs,
    );
    fs.renameSync(tmp, filePath);
    report.gainAppliedDb = gain;
    report.integratedLufs = Math.round((measured.integratedLufs + gain) * 10) / 10;
    log(`loudness normalized: ${measured.integratedLufs} LUFS ${gain > 0 ? "+" : ""}${gain} dB → ~${report.integratedLufs} LUFS (target ${targetLufs})`);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch {}
    log(`loudness adjust failed (keeping unnormalized mix): ${String(e.message).slice(0, 160)}`);
  }
  return report;
}

/**
 * Mix audio into a video file. Returns { path, report }.
 */
async function mix({
  videoPath,
  outputPath,
  durationSec,
  ttsPath = null,
  musicPath = null,
  musicVolume = 0.15,
  musicEnvelope = null,   // optional [{atSec, volume}] — per-scene bed automation
  ambientPath = null,     // optional soft texture bed (lowest priority layer)
  ambientVolume = 0.06,
  sfx = [],
  normalize = true,
  targetLufs = -14,
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
    layers.push({ kind: "tts", idx: nextIdx++, volume: 1.0, delayMs: 0 });
  }
  // Music + ambient are handled separately (fade + sidechain ducking), NOT as flat layers.
  let musicLayer = null;
  if (musicPath) {
    // loop so short clips cover the full duration; input-side -t bounds the read
    // (an unbounded -stream_loop -1 makes ffmpeg grind long past the output -t)
    inputs.push("-stream_loop", "-1", "-t", String(durationSec), "-i", musicPath);
    musicLayer = { idx: nextIdx++, volume: musicVolume };
  }
  let ambientLayer = null;
  if (ambientPath) {
    inputs.push("-stream_loop", "-1", "-t", String(durationSec), "-i", ambientPath);
    // Ambient is texture, never a bed: hard cap regardless of what was asked.
    ambientLayer = { idx: nextIdx++, volume: Math.min(Number(ambientVolume) || 0.06, 0.1) };
  }
  for (const s of sfx) {
    if (!s.path) continue;
    inputs.push("-i", s.path);
    layers.push({
      // Voiceover clips arrive tagged kind:"vo" so the mixer can duck music
      // under speech; everything else defaults to sfx.
      kind: s.kind || "sfx",
      idx: nextIdx++,
      volume: s.volume ?? 0.5,
      delayMs: Math.max(0, Math.round((s.startSec || 0) * 1000)),
    });
  }

  if (layers.length === 0 && !musicLayer && !ambientLayer) {
    log("no audio layers — returning original video");
    if (videoPath !== outputPath) fs.copyFileSync(videoPath, outputPath);
    return { path: outputPath, report: null };
  }

  // AUDIO HIERARCHY: voiceover is king. Music sits far below it and is ducked
  // HARD under speech; SFX are accents that sit above the music bed but below the
  // voice, and are ducked LIGHTLY under speech so a hit never covers a word;
  // ambient is texture underneath everything, ducked hard. A master limiter
  // catches peaks so no layer can ever dominate or clip. The whole point: SFX
  // never overpower the music, and neither ever buries the narration.
  const voiceLayers = layers.filter((l) => l.kind === "vo" || l.kind === "tts");
  const sfxLayers = layers.filter((l) => l.kind !== "vo" && l.kind !== "tts");
  const hasVoice = voiceLayers.length > 0;

  const parts = [`[${silenceIdx}:a]anull[silence]`];
  const mixInputs = [`[silence]`];

  // --- Voice bus: cleaned + evened out, full level into the mix, plus a boosted
  //     KEY copy that drives the ducking of music/SFX/ambient (so quieter TTS
  //     still triggers the duck). Per clip: rumble highpass → gentle compression
  //     for consistent narration loudness → presence lift for intelligibility.
  //     Forced to stereo (mono TTS duplicates to both channels = dead center). ---
  const VOICE_CLEAN =
    "highpass=f=75," +
    "acompressor=threshold=0.35:ratio=2.5:attack=10:release=180:makeup=1.4," +
    "equalizer=f=2800:width_type=q:width=1.0:g=2";

  // Who needs the ducking key? (An unconsumed filter output is an ffmpeg error,
  // so the voice chain only forks a key copy when something will consume it —
  // a voice-only mix has no duck targets and must not asplit.)
  const consumers = [];
  if (musicLayer) consumers.push("music");
  if (sfxLayers.length) consumers.push("sfx");
  if (ambientLayer) consumers.push("ambient");
  const needsKey = hasVoice && consumers.length > 0;

  const voiceKeyLabels = [];
  for (const l of voiceLayers) {
    const label = `v${l.idx}`;
    const pre = l.delayMs > 0 ? `adelay=${l.delayMs}|${l.delayMs},` : "";
    const tail = needsKey ? `asplit=2[${label}m][${label}k]` : `anull[${label}m]`;
    parts.push(
      `[${l.idx}:a]${pre}${VOICE_CLEAN},volume=${l.volume},` +
      `aresample=44100,aformat=channel_layouts=stereo,${tail}`
    );
    mixInputs.push(`[${label}m]`);
    if (needsKey) voiceKeyLabels.push(`[${label}k]`);
  }

  // One VO key bus, split to exactly as many consumers as need it (music, SFX,
  // ambient).
  const voKey = {};
  if (hasVoice && consumers.length) {
    const keyMix = voiceKeyLabels.length === 1 ? "" : `amix=inputs=${voiceKeyLabels.length}:duration=longest:normalize=0,`;
    const outs = consumers.map((_, i) => `[vok${i}]`).join("");
    parts.push(`${voiceKeyLabels.join("")}${keyMix}volume=2.0,aresample=44100,asplit=${consumers.length}${outs}`);
    consumers.forEach((c, i) => { voKey[c] = `[vok${i}]`; });
  }

  const fadeOutStart = Math.max(0, durationSec - 1.2);
  const fadeInDur = Math.min(0.8, durationSec);
  const fadeOutDur = Math.min(1.2, durationSec);

  // --- Music bed: low, faded, mid-scooped so it never masks speech, widened so
  //     the (centered) voice owns the middle of the image, and hard-ducked. ---
  const musicEnv = musicLayer ? envelopeExpr(musicEnvelope) : null;
  if (musicLayer) {
    // Per-scene automation replaces the flat bed level when the director sent one.
    const volStage = musicEnv
      ? `volume=volume='${musicEnv}':eval=frame`
      : `volume=${musicLayer.volume}`;
    parts.push(
      `[${musicLayer.idx}:a]atrim=0:${durationSec},${volStage},` +
      `equalizer=f=2500:width_type=q:width=1.2:g=-4,` +          // clear the speech band
      `aformat=channel_layouts=stereo,extrastereo=m=1.25,` +      // widen; voice stays center
      `afade=t=in:st=0:d=${fadeInDur},afade=t=out:st=${fadeOutStart}:d=${fadeOutDur},aresample=44100[muspre]`
    );
    if (voKey.music) {
      // hard duck: threshold low + high ratio → music drops well under speech
      parts.push(`[muspre]${voKey.music}sidechaincompress=threshold=0.02:ratio=12:attack=15:release=380[musfinal]`);
    } else {
      parts.push(`[muspre]anull[musfinal]`);
    }
    mixInputs.push(`[musfinal]`);
  }

  // --- Ambient bus: soft texture under everything, hard-ducked like the bed. ---
  if (ambientLayer) {
    parts.push(
      `[${ambientLayer.idx}:a]atrim=0:${durationSec},volume=${ambientLayer.volume},` +
      `aformat=channel_layouts=stereo,` +
      `afade=t=in:st=0:d=${fadeInDur},afade=t=out:st=${fadeOutStart}:d=${fadeOutDur},aresample=44100[ambpre]`
    );
    if (voKey.ambient) {
      parts.push(`[ambpre]${voKey.ambient}sidechaincompress=threshold=0.02:ratio=12:attack=15:release=380[ambfinal]`);
    } else {
      parts.push(`[ambpre]anull[ambfinal]`);
    }
    mixInputs.push(`[ambfinal]`);
  }

  // --- SFX bus: accents summed together, then lightly ducked under the voice. ---
  if (sfxLayers.length) {
    const sfxInputs = [];
    for (const l of sfxLayers) {
      const label = `s${l.idx}`;
      const chain = l.delayMs > 0 ? `adelay=${l.delayMs}|${l.delayMs},volume=${l.volume}` : `volume=${l.volume}`;
      parts.push(`[${l.idx}:a]${chain},aresample=44100,aformat=channel_layouts=stereo[${label}]`);
      sfxInputs.push(`[${label}]`);
    }
    parts.push(sfxInputs.length === 1
      ? `${sfxInputs[0]}anull[sfxpre]`
      : `${sfxInputs.join("")}amix=inputs=${sfxInputs.length}:duration=longest:normalize=0[sfxpre]`);
    if (voKey.sfx) {
      // lighter duck: accents dip under speech but stay audible
      parts.push(`[sfxpre]${voKey.sfx}sidechaincompress=threshold=0.04:ratio=5:attack=4:release=220[sfxfinal]`);
    } else {
      parts.push(`[sfxpre]anull[sfxfinal]`);
    }
    mixInputs.push(`[sfxfinal]`);
  }

  // Master: sum everything (duration=first anchors to the silent full-length
  // track), then a limiter so the combined bus can never clip or dominate.
  parts.push(`${mixInputs.join("")}amix=inputs=${mixInputs.length}:duration=first:normalize=0,alimiter=limit=0.95:attack=5:release=50[aout]`);
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

  log(`mixing ${layers.length} audio layer(s)${musicLayer ? " + music" : ""}${ambientLayer ? " + ambient" : ""}${musicEnv ? " (scene envelope)" : ""} + silence anchor into ${path.basename(outputPath)} (t=${durationSec}s)`);
  const timeoutMs = Math.max(60_000, Math.round(durationSec * 6_000));
  await runFFmpeg(args, timeoutMs);

  // Post-mix loudness: measure, and trim toward the target if meaningfully off.
  const loudness = normalize
    ? await normalizeLoudness(outputPath, { targetLufs, timeoutMs })
    : { targetLufs: null, integratedLufs: null, truePeakDb: null, lra: null, gainAppliedDb: 0 };

  const report = {
    ...loudness,
    layers: {
      voice: voiceLayers.length,
      sfx: sfxLayers.length,
      music: !!musicLayer,
      ambient: !!ambientLayer,
      musicEnvelope: !!musicEnv,
    },
    duckingActive: hasVoice && consumers.length > 0,
  };
  return { path: outputPath, report };
}

module.exports = { mix, envelopeExpr };
