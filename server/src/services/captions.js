// Stage 12 helper: captions from the approved script's VO + the measured
// per-scene clip durations. Produces:
//   - an .srt file exported next to the MP4 (download artifact)
//   - caption cue objects (start/end/text) the composer can bake on-screen
//
// Timing model: each scene's caption spans from the scene start to
// start + measured VO duration (clamped to the scene). Long lines are split
// into ≤2 balanced cue chunks so subtitles stay readable.

const fs = require("node:fs");

function fmtTime(sec) {
  const ms = Math.max(0, Math.round(sec * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const r = ms % 1000;
  const pad = (n, w = 2) => String(n).padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(r, 3)}`;
}

function splitLine(text, maxChars = 64) {
  const t = text.trim();
  if (t.length <= maxChars) return [t];
  // Split near the middle at a word boundary.
  const mid = Math.floor(t.length / 2);
  let cut = t.lastIndexOf(" ", mid);
  if (cut < 10) cut = t.indexOf(" ", mid);
  if (cut < 0) return [t];
  return [t.slice(0, cut).trim(), t.slice(cut).trim()];
}

// voClips: [{ sceneId, startSec, durationSec (measured), sceneDurationSec?, text }]
// Cues are clamped to their scene window (plus a small grace) and never
// overlap the next clip's start.
function buildCues(voClips) {
  const clips = [...voClips].sort((a, b) => a.startSec - b.startSec);
  const cues = [];
  clips.forEach((clip, idx) => {
    if (!clip.text || !clip.text.trim()) return;

    let limit = clip.startSec + Math.max(0.8, clip.durationSec);
    if (clip.sceneDurationSec) limit = Math.min(limit, clip.startSec + clip.sceneDurationSec + 1.0);
    const next = clips[idx + 1];
    if (next) limit = Math.min(limit, next.startSec - 0.05);
    const total = Math.max(0.8, limit - clip.startSec);

    const chunks = splitLine(clip.text);
    const totalChars = chunks.reduce((s, c) => s + c.length, 0);
    let t = clip.startSec;
    for (const chunk of chunks) {
      const share = total * (chunk.length / totalChars);
      cues.push({ start: t, end: t + share, text: chunk });
      t += share;
    }
  });
  return cues;
}

function toSrt(cues) {
  return cues
    .map((c, i) => `${i + 1}\n${fmtTime(c.start)} --> ${fmtTime(c.end)}\n${c.text}\n`)
    .join("\n") + "\n";
}

function writeSrt(cues, outputPath) {
  fs.writeFileSync(outputPath, toSrt(cues), "utf8");
  return outputPath;
}

module.exports = { buildCues, toSrt, writeSrt };
