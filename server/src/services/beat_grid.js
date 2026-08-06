// BEAT GRID — where the music's pulse actually falls, so an accent can land on it.
//
// THE GAP THIS FILLS. Sound effects were placed against the PICTURE (a scene cut, an element
// reveal — services/sfx_plan.js decides that, and decides it well). Nothing ever placed them
// against the MUSIC. In a narrated film that hardly matters: the voice is the rhythm and the
// bed is underneath it. In a music-led film the bed IS the rhythm, so a whoosh landing 180ms
// off the beat is the difference between a cut that feels authored and one that feels
// approximate — the "visually synchronized with the soundtrack" the brief asks for.
//
// HOW IT WORKS, AND WHAT IT HONESTLY IS. ffmpeg decodes the track's KICK BAND (60-180Hz) to
// a low-rate mono PCM stream; this module builds an energy envelope from that, then
// autocorrelates the envelope to find the period that best explains it, and picks the phase
// whose grid sits on the most energy. That is a tempo ESTIMATE from percussive energy — good
// on anything with a drum, weak on a free-tempo ambient pad, and it knows the difference:
// a weak correlation returns null and callers leave their cues exactly where the picture put
// them. It never invents a grid it cannot see.
//
// Deterministic: same file in, same grid out. No randomness, no model.

const { spawn } = require("node:child_process");

const SR = 8000;              // plenty for a kick band, and ~30s fits in 480KB
const HOP = 128;              // 62.5 envelope samples/sec
const MIN_BPM = 70, MAX_BPM = 180;
// Below this the envelope has no repeating pulse worth trusting (a pad, a drone, a field
// recording). Tuned so a straight four-on-the-floor scores ~0.5+ and an ambient wash ~0.1.
const MIN_CONFIDENCE = 0.22;

function log(...a) { console.log("[beat_grid]", ...a); }

/** Decode the kick band to mono s16le PCM. Resolves null on any ffmpeg problem. */
function decodeKickBand(path, seconds) {
  return new Promise((resolve) => {
    const args = [
      "-v", "error", "-i", path,
      "-t", String(Math.max(4, Math.min(180, Math.round(seconds || 60)))),
      "-af", "highpass=f=60,lowpass=f=180",
      "-ac", "1", "-ar", String(SR), "-f", "s16le", "-",
    ];
    const p = spawn("ffmpeg", args, { windowsHide: true });
    const chunks = [];
    let bytes = 0;
    p.stdout.on("data", (d) => { chunks.push(d); bytes += d.length; });
    p.on("error", () => resolve(null));
    p.on("exit", (code) => resolve(code === 0 && bytes > SR ? Buffer.concat(chunks) : null));
  });
}

/** RMS per hop, then half-wave-rectified first difference — the standard onset envelope. */
function onsetEnvelope(pcm) {
  const n = Math.floor(pcm.length / 2);
  const frames = Math.floor(n / HOP);
  const rms = new Float64Array(frames);
  for (let f = 0; f < frames; f++) {
    let acc = 0;
    for (let i = 0; i < HOP; i++) {
      const s = pcm.readInt16LE((f * HOP + i) * 2) / 32768;
      acc += s * s;
    }
    rms[f] = Math.sqrt(acc / HOP);
  }
  const env = new Float64Array(frames);
  for (let f = 1; f < frames; f++) env[f] = Math.max(0, rms[f] - rms[f - 1]);

  // PERCUSSIVENESS, measured BEFORE normalizing — and the reason this is here.
  //
  // Normalizing divides by the largest onset. On a track with no transients at all (a drone,
  // a sustained pad) the largest "onset" is codec noise a few parts in ten thousand, and
  // dividing by it turns that noise into a full-scale signal that autocorrelates beautifully:
  // the detector reported 75 BPM at confidence 0.98 for a pure sine wave. Scale-invariant, so
  // it does not punish a quiet track — it only asks whether anything actually hits.
  let mx = 0, meanRms = 0;
  for (let f = 0; f < frames; f++) { if (env[f] > mx) mx = env[f]; meanRms += rms[f]; }
  meanRms = frames ? meanRms / frames : 0;
  const percussiveness = meanRms > 0 ? mx / meanRms : 0;

  if (mx > 0) for (let f = 0; f < frames; f++) env[f] /= mx;
  return { env, percussiveness };
}

// Below this, nothing in the track hits hard enough to be called a beat.
const MIN_PERCUSSIVENESS = 0.25;

/** Autocorrelation over the plausible beat-period range. */
function bestPeriod(env) {
  const fps = SR / HOP;
  const lo = Math.round((60 / MAX_BPM) * fps);
  const hi = Math.round((60 / MIN_BPM) * fps);
  if (env.length < hi * 3) return null;

  let best = null;
  let mean = 0;
  for (let i = 0; i < env.length; i++) mean += env[i];
  mean /= env.length;

  for (let lag = lo; lag <= hi; lag++) {
    let num = 0, den = 0;
    for (let i = 0; i + lag < env.length; i++) {
      num += (env[i] - mean) * (env[i + lag] - mean);
      den += (env[i] - mean) ** 2;
    }
    const score = den > 0 ? num / den : 0;
    if (!best || score > best.score) best = { lag, score };
  }
  if (!best || best.score < MIN_CONFIDENCE) return null;
  return { periodSec: best.lag / fps, confidence: Math.min(1, best.score) };
}

/** The offset (0..period) whose grid collects the most onset energy. */
function bestPhase(env, periodSec) {
  const fps = SR / HOP;
  const lag = periodSec * fps;
  let best = { phase: 0, energy: -1 };
  const steps = Math.max(8, Math.round(lag));
  for (let s = 0; s < steps; s++) {
    const off = (s / steps) * lag;
    let acc = 0;
    for (let k = 0; ; k++) {
      const idx = Math.round(off + k * lag);
      if (idx >= env.length) break;
      acc += env[idx];
    }
    if (acc > best.energy) best = { phase: off / fps, energy: acc };
  }
  return best.phase;
}

/**
 * analyze(musicPath, { durationSec }) → { bpm, periodSec, phaseSec, confidence } | null
 *
 * null means "this track has no pulse I can see" — callers must treat that as "leave the
 * cues where the picture put them", never as a reason to guess.
 */
async function analyze(musicPath, { durationSec = 60 } = {}) {
  if (!musicPath) return null;
  try {
    const pcm = await decodeKickBand(musicPath, durationSec);
    if (!pcm) return null;
    const { env, percussiveness } = onsetEnvelope(pcm);
    if (percussiveness < MIN_PERCUSSIVENESS) return null;
    const per = bestPeriod(env);
    if (!per) return null;
    const phaseSec = bestPhase(env, per.periodSec);
    const bpm = Math.round(600 / per.periodSec) / 10;
    return { bpm, periodSec: per.periodSec, phaseSec, confidence: Math.round(per.confidence * 100) / 100 };
  } catch {
    return null;
  }
}

/**
 * snapCues(cues, grid, { window }) → { cues, moved, maxShift }
 *
 * Moves each cue to the nearest beat, but ONLY if that beat is within `window`. A cue further
 * out was placed against something on screen that does not coincide with the music, and
 * dragging it there would break the picture sync that sfx_plan worked to establish — the
 * point is to make the two agree where they nearly already do, not to overrule the edit.
 *
 * Cue ORDER and the minimum gap between cues are preserved: a snap that reordered two accents
 * or collapsed them onto one beat would undo sfx_plan's spread.
 */
function snapCues(cues, grid, { window = 0.12, minGap = 0.35 } = {}) {
  const list = Array.isArray(cues) ? cues : [];
  if (!grid || !grid.periodSec) return { cues: list, moved: 0, maxShift: 0 };

  const nearestBeat = (t) => {
    const k = Math.round((t - grid.phaseSec) / grid.periodSec);
    return grid.phaseSec + Math.max(0, k) * grid.periodSec;
  };

  let moved = 0, maxShift = 0, lastAt = -Infinity;
  const out = list.map((c) => {
    const at = Number(c.startSec) || 0;
    const beat = nearestBeat(at);
    const shift = Math.abs(beat - at);
    if (shift > window || beat < 0 || beat - lastAt < minGap) { lastAt = Math.max(lastAt, at); return c; }
    if (shift > 0.0005) { moved++; maxShift = Math.max(maxShift, shift); }
    lastAt = beat;
    return { ...c, startSec: Math.round(beat * 1000) / 1000, beatSnapped: shift > 0.0005 };
  });
  return { cues: out, moved, maxShift: Math.round(maxShift * 1000) / 1000 };
}

module.exports = { analyze, snapCues, MIN_CONFIDENCE, MIN_PERCUSSIVENESS };
module.exports.__test = { onsetEnvelope, bestPeriod, bestPhase, SR, HOP };
