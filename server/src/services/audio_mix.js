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
// RAMPED, not stepped. The previous expression was nested `if(between(t,…))`, so the
// per-scene music gain changed INSTANTLY at every boundary — a −5 dB → +2 dB jump in one
// sample, which is a click. That is the reported "abrupt audio transitions between
// scenes", and it was arithmetic rather than taste.
//
// Each boundary now crosses over a RAMP (default 400ms, shortened if scenes are tight),
// so the bed lifts into the CTA and settles under dense narration the way a hand on a
// fader would do it. Still a pure function of `t` — the `volume` filter evaluates this
// per frame, and the renderer may seek anywhere.
const MUSIC_RAMP_SEC = 0.4;
function buildMusicEnvExpr(scenes) {
  const segs = (scenes || [])
    .filter((s) => Number.isFinite(s.startSec) && Number.isFinite(s.endSec) && s.endSec > s.startSec)
    .sort((a, b) => a.startSec - b.startSec);
  if (!segs.length) return "1.0";
  if (segs.length === 1) return String(dbToLin(segs[0].musicGainDb));

  // Build from the last segment backwards so the nesting reads as "if we are in this
  // ramp … else if in this hold … else <the rest>".
  let expr = String(dbToLin(segs[segs.length - 1].musicGainDb));
  for (let i = segs.length - 1; i >= 1; i--) {
    const prev = segs[i - 1], cur = segs[i];
    const a = dbToLin(prev.musicGainDb), b = dbToLin(cur.musicGainDb);
    // Ramp sits just BEFORE the boundary so the new level is reached as the scene opens.
    const ramp = Math.max(0.12, Math.min(MUSIC_RAMP_SEC, (cur.endSec - cur.startSec) * 0.35, (prev.endSec - prev.startSec) * 0.35));
    const t0 = r1(Math.max(prev.startSec, cur.startSec - ramp)), t1 = r1(cur.startSec);
    const span = Math.max(0.01, t1 - t0);
    // linear interpolate a→b across [t0,t1], hold b from t1 on (handled by the outer else)
    expr = `if(lt(t,${t0}),${a},if(lt(t,${t1}),${a}+(${b}-${a})*(t-${t0})/${r1(span)},${expr}))`;
  }
  // Everything before the first scene sits at its level.
  return `if(lt(t,${r1(segs[0].startSec)}),${dbToLin(segs[0].musicGainDb)},${expr})`;
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
  // THREE-way split, not two: the voice is the duck key for the music AND for the SFX
  // bus. The mix doctrine has always said VO > SFX > music, but only music was ever
  // ducked — so an accepted cue at −14 dB could sit straight on top of a word. See
  // AUDIO-AUDIT-2026-07-28.md §2.
  let voMaster = null, voKey = null, voKeySfx = null;
  if (voLabels.length === 1) {
    parts.push(`${voLabels[0]}asplit=3[vomaster][vokey][vokeysfx]`);
    voMaster = "[vomaster]"; voKey = "[vokey]"; voKeySfx = "[vokeysfx]";
  } else if (voLabels.length > 1) {
    parts.push(`${voLabels.join("")}amix=inputs=${voLabels.length}:duration=longest:normalize=0,aresample=44100[vomix]`);
    parts.push(`[vomix]asplit=3[vomaster][vokey][vokeysfx]`);
    voMaster = "[vomaster]"; voKey = "[vokey]"; voKeySfx = "[vokeysfx]";
  }

  // Every output of the asplit above MUST be consumed or ffmpeg deadlocks waiting on the
  // unread branch. Track it rather than reasoning about it inline: the music duck is now
  // conditional on the plan's depth (music-led mode sets it to 0), which means "there is
  // a voice bus" no longer implies "the key is used". Sinks are emitted once, below.
  let voKeyUsed = false, voKeySfxUsed = false;

  // ---- Music: normalize to a known base, shape per-scene, carve mids, fade,
  // then duck under the VO key (scene-aware depth). ----
  let musFinal = null;
  if (musicIdx !== null) {
    const soloLufs = Number.isFinite(m.musicSoloLufs) ? m.musicSoloLufs : -23;
    const env = buildMusicEnvExpr(audioPlan.scenes);
    const fadeOutStart = Math.max(0, durationSec - 1.2);
    const fadeInDur = Math.min(0.8, durationSec);
    const fadeOutDur = Math.min(1.2, durationSec);
    // THE VOCAL-BAND CARVE IS NOW A DECISION, NOT A CONSTANT. This notch at 2.5 kHz
    // exists solely to keep speech intelligible over the bed — it costs the track real
    // presence, and with narration off there is no speech to protect. The Audio Director
    // sets musicMidCarveDb to 0 in music-led mode; a plan that predates the field (or an
    // absent director) falls back to the historical -4, so nothing changes for a
    // narrated film. 0 dB emits no filter at all rather than a no-op equalizer.
    const carveDb = Number.isFinite(m.musicMidCarveDb) ? m.musicMidCarveDb : -4;
    const carve = carveDb < 0 ? `equalizer=f=2500:t=q:w=1.2:g=${carveDb},` : "";
    parts.push(
      `[${musicIdx}:a]atrim=0:${durationSec},loudnorm=I=${soloLufs}:TP=-2:LRA=11,aresample=44100,` +
      `volume=volume='${env}':eval=frame,${carve}` +
      `afade=t=in:st=0:d=${fadeInDur},afade=t=out:st=${fadeOutStart}:d=${fadeOutDur}[muspre]`
    );
    // A duck needs BOTH a key bus and a non-zero depth. The depth check is what makes
    // the director's `musicUnderVoDuckDb: 0` mean something: without it, a plan that
    // says "do not duck" would still build a sidechain (at ratio 4, the clamp floor)
    // and gently pump the bed against a voice bus that carries nothing.
    const duckDbRaw = Math.abs(Number.isFinite(m.musicUnderVoDuckDb) ? m.musicUnderVoDuckDb : -11);
    if (voKey && duckDbRaw > 0) {
      const duckDb = duckDbRaw;
      const ratio = Math.max(4, Math.min(20, Math.round(duckDb * 0.9)));
      const attack = Math.round(Number.isFinite(m.duckAttackMs) ? m.duckAttackMs : 40);
      const release = Math.round(Number.isFinite(m.duckReleaseMs) ? m.duckReleaseMs : 500);
      parts.push(`[muspre]${voKey}sidechaincompress=threshold=0.05:ratio=${ratio}:attack=${attack}:release=${release}:makeup=1[musfinal]`);
      voKeyUsed = true;
    } else {
      parts.push(`[muspre]anull[musfinal]`);
    }
    musFinal = "[musfinal]";
  }

  // ---- SFX BUS: only director-accepted cues, conditioned, summed, then ducked under
  // the voice. Previously each cue got `adelay` + `volume` and nothing else — no fades,
  // no high-pass, no ducking — which is why cues of different origins landed at wildly
  // different perceived levels and could sit on top of a word.
  const planSfx = new Map((audioPlan.sfx || []).map((x) => [Number(x.id), x]));
  const sfxLabels = [];
  for (const s of sfxList) {
    const dec = planSfx.get(s.candidateIndex);
    if (dec && dec.accept === false) continue; // director rejected this cue
    const gain = dec && Number.isFinite(dec.gainDb) ? dbToLin(dec.gainDb) : (s.volume ?? 0.5);
    const delayMs = dec && Number.isFinite(dec.atSec) ? Math.max(0, Math.round(dec.atSec * 1000)) : s.delayMs;
    const lbl = `sfx${s.candidateIndex}`;
    const delay = delayMs > 0 ? `adelay=${delayMs}|${delayMs},` : "";
    // highpass: web-sourced cues carry sub-bass rumble that only muddies the voice and
    // eats master headroom. The short in-fade kills the edge click on a hard-cut file.
    parts.push(`[${s.idx}:a]highpass=f=60,afade=t=in:st=0:d=0.004,volume=${gain},aresample=44100,${delay}anull[${lbl}]`);
    sfxLabels.push(`[${lbl}]`);
  }

  // Sum the cues into ONE bus and duck the whole bus under the voice. Ducking each cue
  // separately would need a key per cue; one bus is both cheaper and more correct — it is
  // how a real desk does it. Gentler than the music duck (SFX are meant to be heard, just
  // never over a word), and skipped entirely when there is no voice to protect.
  let sfxBus = null;
  if (sfxLabels.length) {
    parts.push(`${sfxLabels.join("")}amix=inputs=${sfxLabels.length}:duration=longest:normalize=0,aresample=44100[sfxpre]`);
    if (voKeySfx) {
      parts.push(`[sfxpre]${voKeySfx}sidechaincompress=threshold=0.08:ratio=6:attack=15:release=260:makeup=1[sfxbus]`);
      voKeySfxUsed = true;
    } else {
      parts.push(`[sfxpre]anull[sfxbus]`);
    }
    sfxBus = "[sfxbus]";
  }

  // Terminate every key branch nothing consumed. Three ways this happens, and only the
  // last one was previously handled: no music at all (the duck had nothing to apply to —
  // a latent stall whenever TTS succeeded and every music source came up dry), a plan
  // that asked for zero duck depth, and no surviving SFX.
  if (voKey && !voKeyUsed) parts.push(`${voKey}anullsink`);
  if (voKeySfx && !voKeySfxUsed) parts.push(`${voKeySfx}anullsink`);

  // Nothing to mix (e.g. only rejected SFX) — leave the video untouched.
  if (!voMaster && !musFinal && !sfxBus) {
    log("plan: no audible layers — returning original video");
    if (videoPath !== outputPath) fs.copyFileSync(videoPath, outputPath);
    return outputPath;
  }

  const mixInputs = ["[silence]"];
  if (voMaster) mixInputs.push(voMaster);
  if (musFinal) mixInputs.push(musFinal);
  if (sfxBus) mixInputs.push(sfxBus);
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
  const noVo = audioPlan.narration === "off";
  log(`plan mix [${noVo ? "MUSIC-LED (no narration)" : "voice-led"}]: ${voLabels.length} vo, music=${musicIdx !== null}`
    + `${musicIdx !== null ? `@${Number.isFinite(m.musicSoloLufs) ? m.musicSoloLufs : -23} LUFS` : ""}, `
    + `${kept}/${sfxList.length} sfx, duck=${voKeyUsed ? "on" : "bypassed"}, `
    + `carve=${(Number.isFinite(m.musicMidCarveDb) ? m.musicMidCarveDb : -4) < 0 ? "on" : "off"} `
    + `into ${path.basename(outputPath)} (t=${durationSec}s)`);
  const timeoutMs = Math.max(90_000, Math.round(durationSec * 8_000));
  await runFFmpeg(args, timeoutMs);
  return outputPath;
}

module.exports = { mix };
// Test seam: the music envelope is pure and its step-vs-ramp behaviour is asserted directly.
module.exports.__test = { buildMusicEnvExpr };
