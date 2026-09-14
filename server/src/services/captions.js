// Stage 12 helper: captions from the approved script's VO + the measured
// per-scene clip durations. Produces:
//   - an .srt file exported next to the MP4 (download artifact)
//   - caption cue objects (start/end/text) the composer can bake on-screen
//
// Timing model: each scene's caption spans from the scene start to
// start + measured VO duration (clamped to the scene). Long lines are split
// into balanced cue chunks so subtitles stay readable.
//
// Timing comes from the MEASURED clip, never from the planned script — pace
// changes what is written and how often the picture cuts, but a caption still
// has to land on the syllable the narrator actually spoke.

const fs = require("node:fs");
const pacing = require("./pacing");

function fmtTime(sec) {
  const ms = Math.max(0, Math.round(sec * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const r = ms % 1000;
  const pad = (n, w = 2) => String(n).padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(r, 3)}`;
}

// One cut near the middle at a word boundary — the split this file has always
// made. Returns null when there is no boundary to cut on.
function cutInTwo(t) {
  const mid = Math.floor(t.length / 2);
  let cut = t.lastIndexOf(" ", mid);
  if (cut < 10) cut = t.indexOf(" ", mid);
  if (cut < 0) return null;
  return [t.slice(0, cut).trim(), t.slice(cut).trim()];
}

// A merged or long-form line used to come out as exactly TWO chunks however
// long it was, so a 190-character line shipped as two 95-character slabs —
// three lines of subtitle each, half of it off the safe area. Keep cutting.
//
// The first cut is unconditional (that is the split that already shipped); each
// deeper cut has to earn itself, because every extra cue spends another
// lead-in: only split on while both pieces can still be READ in the share of
// the cue's seconds they would get. `availSec` is the whole line's window, so
// the recursion hands each piece its own proportional slice of it.
function splitLine(text, maxChars = 64, opts = {}) {
  const t = String(text == null ? "" : text).trim();
  if (t.length <= maxChars) return [t];
  const halves = cutInTwo(t);
  if (!halves) return [t];
  const P = pacing.resolve(opts.pacing);
  const avail = Number(opts.availSec) > 0 ? Number(opts.availSec) : 0;
  const out = [];
  for (const h of halves) {
    const share = avail * (h.length / t.length);
    if (h.length > maxChars && (!avail || readableSplit(h, share, P))) {
      out.push(...splitLine(h, maxChars, { pacing: P, availSec: share }));
    } else {
      out.push(h);
    }
  }
  return out;
}

// Would cutting this piece leave both halves readable in their own share?
function readableSplit(text, availSec, P) {
  const halves = cutInTwo(text);
  if (!halves) return false;
  return halves.every((h) => pacing.fitsCopy(h, availSec * (h.length / text.length), P));
}

// voClips: [{ sceneId, startSec, durationSec (measured), sceneDurationSec?, text }]
// Cues are clamped to their scene window (plus a small grace) and never
// overlap the next clip's start.
//
// opts (all optional; the defaults ARE the literals this function shipped with,
// so the positional callers that predate the pacing engine are unaffected):
//   pacing     — mode profile; only the readability floor in splitLine reads it
//   minCueSec  — the shortest window a cue may be given                   (0.8)
//   graceSec   — how far a caption may run past its scene                 (1.0)
//   gapSec     — the hold-off before the next clip's first cue           (0.05)
//   maxChars   — the width one cue may occupy                             (64)
function buildCues(voClips, opts = {}) {
  const P = pacing.resolve(opts.pacing);
  const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
  const minCueSec = num(opts.minCueSec, 0.8);
  const graceSec = num(opts.graceSec, 1.0);
  const gapSec = num(opts.gapSec, 0.05);
  const maxChars = num(opts.maxChars, 64);

  const clips = [...voClips].sort((a, b) => a.startSec - b.startSec);
  const cues = [];
  clips.forEach((clip, idx) => {
    if (!clip.text || !clip.text.trim()) return;

    let limit = clip.startSec + Math.max(minCueSec, clip.durationSec);
    if (clip.sceneDurationSec) limit = Math.min(limit, clip.startSec + clip.sceneDurationSec + graceSec);
    const next = clips[idx + 1];
    if (next) limit = Math.min(limit, next.startSec - gapSec);
    const total = Math.max(minCueSec, limit - clip.startSec);

    const chunks = splitLine(clip.text, maxChars, { pacing: P, availSec: total });
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

// WebVTT timestamp — like SRT but with a DOT before the milliseconds.
function fmtTimeVtt(sec) {
  return fmtTime(sec).replace(",", ".");
}

// WebVTT is the native <track> format for HTML5 <video>, YouTube, and most
// social players. Same cues as the SRT; only the header and punctuation differ.
function toVtt(cues) {
  return "WEBVTT\n\n" + cues
    .map((c, i) => `${i + 1}\n${fmtTimeVtt(c.start)} --> ${fmtTimeVtt(c.end)}\n${c.text}\n`)
    .join("\n") + "\n";
}

function writeVtt(cues, outputPath) {
  fs.writeFileSync(outputPath, toVtt(cues), "utf8");
  return outputPath;
}

module.exports = { buildCues, toSrt, writeSrt, toVtt, writeVtt };
