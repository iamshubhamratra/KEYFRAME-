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
 *
 * When `audioPlan` (from the Audio Director) is supplied, a broadcast-quality
 * mastering chain is used (per-scene music envelope, loudness-normalized VO,
 * scene-aware ducking, curated SFX, limiter). If the plan mix errors for any
 * reason it falls back to the basic mix below. Without a plan, the basic mix
 * (flat music volume + one global sidechain) runs exactly as before.
 */
async function mix({
  videoPath,
  outputPath,
  durationSec,
  ttsPath = null,
  musicPath = null,
  musicVolume = 0.15,
  sfx = [],
  audioPlan = null,
}) {
  if (audioPlan) {
    try {
      return await mixWithPlan({ videoPath, outputPath, durationSec, ttsPath, musicPath, sfx, audioPlan });
    } catch (e) {
      log(`plan mix failed (${e.message}) — falling back to basic mix`);
      // fall through to the basic mixer below (never lose the audio over a plan bug)
    }
  }
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
  // Music is handled separately (fade + sidechain ducking), NOT as a flat layer.
  let musicLayer = null;
  if (musicPath) {
    inputs.push("-stream_loop", "-1", "-i", musicPath); // loop so short clips cover full duration
    musicLayer = { idx: nextIdx++, volume: musicVolume };
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

  if (layers.length === 0 && !musicLayer) {
    log("no audio layers — returning original video");
    if (videoPath !== outputPath) fs.copyFileSync(videoPath, outputPath);
    return outputPath;
  }

  // Voice = TTS + VO clips; these key the music ducking AND mix into the output.
  const voiceLayers = layers.filter((l) => l.kind === "vo" || l.kind === "tts");
  const duck = !!musicLayer && voiceLayers.length > 0;

  // Filter graph: silent anchor first, then each layer volumed + delayed.
  const parts = [`[${silenceIdx}:a]anull[silence]`];
  const mixInputs = [`[silence]`];
  const keyLabels = []; // VO copies that drive the sidechain key bus

  for (const l of layers) {
    const label = `a${l.idx}`;
    const chain = l.delayMs > 0
      ? `adelay=${l.delayMs}|${l.delayMs},volume=${l.volume}`
      : `volume=${l.volume}`;
    const isVoice = l.kind === "vo" || l.kind === "tts";
    if (duck && isVoice) {
      // Split each VO: one copy to the final mix, one to the duck key.
      parts.push(`[${l.idx}:a]${chain},aresample=44100,asplit=2[${label}m][${label}k]`);
      mixInputs.push(`[${label}m]`);
      keyLabels.push(`[${label}k]`);
    } else {
      parts.push(`[${l.idx}:a]${chain}[${label}]`);
      mixInputs.push(`[${label}]`);
    }
  }

  if (musicLayer) {
    // Fade in/out so music never starts or ends abruptly. atrim gives the
    // afade-out a defined endpoint on the infinite stream_loop input.
    const fadeOutStart = Math.max(0, durationSec - 1.2);
    const fadeInDur = Math.min(0.8, durationSec);
    const fadeOutDur = Math.min(1.2, durationSec);
    parts.push(
      `[${musicLayer.idx}:a]atrim=0:${durationSec},volume=${musicLayer.volume},` +
      `afade=t=in:st=0:d=${fadeInDur},afade=t=out:st=${fadeOutStart}:d=${fadeOutDur},aresample=44100[muspre]`
    );
    if (duck) {
      // Build the VO key bus, then duck music under speech (sidechain compressor).
      if (keyLabels.length === 1) {
        parts.push(`${keyLabels[0]}aresample=44100[vokey]`);
      } else {
        parts.push(`${keyLabels.join("")}amix=inputs=${keyLabels.length}:duration=longest:normalize=0,aresample=44100[vokey]`);
      }
      parts.push(`[muspre][vokey]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=400[musfinal]`);
    } else {
      parts.push(`[muspre]anull[musfinal]`);
    }
    mixInputs.push(`[musfinal]`);
  }

  // duration=first anchors to the silent track (full video length).
  parts.push(`${mixInputs.join("")}amix=inputs=${mixInputs.length}:duration=first:normalize=0[aout]`);
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

// ---------------------------------------------------------------------------
// Plan-driven mastering mixer (Audio Director). Builds a real broadcast chain:
//   VO  : per-clip compressor + presence EQ + loudness-normalize -> duck key + master
//   MUS : loudness-normalize -> per-scene energy envelope -> mid-carve EQ -> fades
//         -> sidechain-duck under the VO -> master
//   SFX : only director-accepted cues, placed on beats, leveled in dB -> master
//   OUT : amix -> true-peak limiter
// ---------------------------------------------------------------------------

const dbToLin = (db) => Math.round(Math.pow(10, Number(db || 0) / 20) * 1000) / 1000;
const r1 = (n) => Math.round((Number(n) || 0) * 10) / 10;

// Piecewise, time-varying music gain (linear) built from the per-scene energy
// curve — evaluated per audio frame by the `volume` filter's expression.
function buildMusicEnvExpr(scenes) {
  const segs = (scenes || [])
    .filter((s) => Number.isFinite(s.startSec) && Number.isFinite(s.endSec) && s.endSec > s.startSec)
    .sort((a, b) => a.startSec - b.startSec);
  if (!segs.length) return "1.0";
  let expr = "1.0"; // gaps between scenes sit at the normalized base
  for (let i = segs.length - 1; i >= 0; i--) {
    const s = segs[i];
    expr = `if(between(t,${r1(s.startSec)},${r1(s.endSec)}),${dbToLin(s.musicGainDb)},${expr})`;
  }
  return expr;
}

async function mixWithPlan({ videoPath, outputPath, durationSec, ttsPath, musicPath, sfx, audioPlan }) {
  const m = audioPlan.master || {};
  const inputs = ["-i", videoPath];
  let nextIdx = 1;

  inputs.push("-f", "lavfi", "-t", String(durationSec), "-i", "anullsrc=channel_layout=stereo:sample_rate=44100");
  const silenceIdx = nextIdx++;

  const voice = [];   // { idx, delayMs }
  const sfxList = [];  // { idx, delayMs, volume, candidateIndex }
  if (ttsPath) { inputs.push("-i", ttsPath); voice.push({ idx: nextIdx++, delayMs: 0 }); }
  let musicIdx = null;
  if (musicPath) { inputs.push("-stream_loop", "-1", "-i", musicPath); musicIdx = nextIdx++; }
  let candCount = 0;
  for (const s of sfx) {
    if (!s.path) continue;
    inputs.push("-i", s.path);
    const idx = nextIdx++;
    const kind = s.kind || "sfx";
    const delayMs = Math.max(0, Math.round((s.startSec || 0) * 1000));
    if (kind === "vo" || kind === "tts") voice.push({ idx, delayMs });
    else sfxList.push({ idx, delayMs, volume: s.volume ?? 0.5, candidateIndex: candCount++ });
  }

  const parts = [`[${silenceIdx}:a]anull[silence]`];

  // ---- VO bus: normalize each clip individually (silence gaps would skew a
  // summed-bus measurement), then sum + split into master feed and duck key. ----
  const voLabels = [];
  const voLufs = Number.isFinite(m.voLufs) ? m.voLufs : -16;
  const voTp = Number.isFinite(m.voTruePeakDb) ? m.voTruePeakDb : -1.5;
  voice.forEach((v, i) => {
    const lbl = `vo${i}`;
    const delay = v.delayMs > 0 ? `,adelay=${v.delayMs}|${v.delayMs}` : "";
    parts.push(
      `[${v.idx}:a]acompressor=threshold=0.125:ratio=3:attack=5:release=120,` +
      `highpass=f=90,equalizer=f=3000:t=q:w=1:g=3,` +
      `loudnorm=I=${voLufs}:TP=${voTp}:LRA=11,aresample=44100${delay}[${lbl}]`
    );
    voLabels.push(`[${lbl}]`);
  });
  let voMaster = null, voKey = null;
  if (voLabels.length === 1) {
    parts.push(`${voLabels[0]}asplit=2[vomaster][vokey]`);
    voMaster = "[vomaster]"; voKey = "[vokey]";
  } else if (voLabels.length > 1) {
    parts.push(`${voLabels.join("")}amix=inputs=${voLabels.length}:duration=longest:normalize=0,aresample=44100[vomix]`);
    parts.push(`[vomix]asplit=2[vomaster][vokey]`);
    voMaster = "[vomaster]"; voKey = "[vokey]";
  }

  // ---- Music: normalize to a known base, shape per-scene, carve mids, fade,
  // then duck under the VO key (scene-aware depth). ----
  let musFinal = null;
  if (musicIdx !== null) {
    const soloLufs = Number.isFinite(m.musicSoloLufs) ? m.musicSoloLufs : -23;
    const env = buildMusicEnvExpr(audioPlan.scenes);
    const fadeOutStart = Math.max(0, durationSec - 1.2);
    const fadeInDur = Math.min(0.8, durationSec);
    const fadeOutDur = Math.min(1.2, durationSec);
    parts.push(
      `[${musicIdx}:a]atrim=0:${durationSec},loudnorm=I=${soloLufs}:TP=-2:LRA=11,aresample=44100,` +
      `volume=volume='${env}':eval=frame,equalizer=f=2500:t=q:w=1.2:g=-4,` +
      `afade=t=in:st=0:d=${fadeInDur},afade=t=out:st=${fadeOutStart}:d=${fadeOutDur}[muspre]`
    );
    if (voKey) {
      const duckDb = Math.abs(Number.isFinite(m.musicUnderVoDuckDb) ? m.musicUnderVoDuckDb : -11);
      const ratio = Math.max(4, Math.min(20, Math.round(duckDb * 0.9)));
      const attack = Math.round(Number.isFinite(m.duckAttackMs) ? m.duckAttackMs : 40);
      const release = Math.round(Number.isFinite(m.duckReleaseMs) ? m.duckReleaseMs : 500);
      parts.push(`[muspre]${voKey}sidechaincompress=threshold=0.05:ratio=${ratio}:attack=${attack}:release=${release}:makeup=1[musfinal]`);
    } else {
      parts.push(`[muspre]anull[musfinal]`);
    }
    musFinal = "[musfinal]";
  }

  // ---- SFX: only director-accepted cues, re-leveled (dB) and re-timed (beats). ----
  const planSfx = new Map((audioPlan.sfx || []).map((x) => [Number(x.id), x]));
  const sfxLabels = [];
  for (const s of sfxList) {
    const dec = planSfx.get(s.candidateIndex);
    if (dec && dec.accept === false) continue; // director rejected this cue
    const gain = dec && Number.isFinite(dec.gainDb) ? dbToLin(dec.gainDb) : (s.volume ?? 0.5);
    const delayMs = dec && Number.isFinite(dec.atSec) ? Math.max(0, Math.round(dec.atSec * 1000)) : s.delayMs;
    const lbl = `sfx${s.candidateIndex}`;
    const delay = delayMs > 0 ? `adelay=${delayMs}|${delayMs},` : "";
    parts.push(`[${s.idx}:a]${delay}volume=${gain},aresample=44100[${lbl}]`);
    sfxLabels.push(`[${lbl}]`);
  }

  // Nothing to mix (e.g. only rejected SFX) — leave the video untouched.
  if (!voMaster && !musFinal && !sfxLabels.length) {
    log("plan: no audible layers — returning original video");
    if (videoPath !== outputPath) fs.copyFileSync(videoPath, outputPath);
    return outputPath;
  }

  const mixInputs = ["[silence]"];
  if (voMaster) mixInputs.push(voMaster);
  if (musFinal) mixInputs.push(musFinal);
  mixInputs.push(...sfxLabels);
  parts.push(`${mixInputs.join("")}amix=inputs=${mixInputs.length}:duration=first:normalize=0[premaster]`);
  const limit = dbToLin(Number.isFinite(m.masterTruePeakDb) ? m.masterTruePeakDb : -1.0);
  parts.push(`[premaster]alimiter=level=false:limit=${limit},aresample=44100[aout]`);

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
    "-t", String(durationSec),
    outputPath,
  ];
  const kept = sfxLabels.length;
  log(`plan mix: ${voLabels.length} vo, music=${musicIdx !== null}, ${kept}/${sfxList.length} sfx, VO@${voLufs} LUFS into ${path.basename(outputPath)} (t=${durationSec}s)`);
  const timeoutMs = Math.max(90_000, Math.round(durationSec * 8_000));
  await runFFmpeg(args, timeoutMs);
  return outputPath;
}

module.exports = { mix };
