// VIDEO EDIT MUSIC — candidate beds for the plan and the absolute volume envelope for the mixer (RENDER.md §8).
//
// WHY THIS EXISTS. The director names a mood and an energy, not a file. Turning that into something the
// mixer can loop needs a provider that is slow and often down (the local Pixabay bridge drives a real
// browser), a fallback that never leaves a film silent (audio_sources.fetchMusic ends in a synthesized
// pad), and a validation step, because a CDN can hand back an HTML error page saved as .mp3 and ffmpeg
// would only discover that mid-export. Every track that leaves here decodes, has a real duration and
// carries its provenance and licence, so the plan, the credits and the editor all read the same record.
// The plan stores its envelope on word anchors (so cuts move it); the mixer wants absolute seconds with
// few points, so envelopeFor converts and caps.
//
// CONTRACT:
//   musicCandidates({ query, mood, energy, durationSec, projectId, projectDir?, pacing?, max=3, signal?,
//                     fetchers:{ bridgeFirstAudioUrl, downloadToFile, fetchMusic }, probeDurationSec? })
//     -> Promise<Track[]>  (≤ max; Track = plan TrackSchema: { assetId, path (project-relative), provider, title?,
//                            query, mood, sourceUrl?, license, durationSec })
//     Bridge: indices 0..max-1 of one query; the first null stops (a down bridge costs one timeout, not three).
//     Only when the bridge yields nothing: fetchMusic({ query, outputPath, durationSec, seed: projectId }).
//     Files land in <project>/assets/music/<assetId>.mp3; invalid files (probe null or < MIN_TRACK_SEC) are deleted.
//     Never throws for provider failures (fail-soft); aborts throw PROC_ABORTED.
//   buildMusicQuery({ query, mood, energy, pacing }) -> string   energy word first, then mood, then query words
//   energyWord(energy) -> 'calm' | 'upbeat' | 'energetic'
//   envelopeFor(music, { resolveAnchor?, durationSec }) -> [{ atSec, volume }] (≤ 12, ascending; [] = flat music.volume)
//     music.envelope entries: { anchor, volume } resolved via resolveAnchor(anchor) -> { outIn, outOut, collapsed },
//     or entries that already carry resolved {outIn,outOut} / an 'out' anchor.

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const proc = require("../engine/proc");
const fsx = require("../fsx");
const { EditError } = require("../errors");

const MIN_TRACK_SEC = 5;
const MAX_ENVELOPE_POINTS = 12;
const RAMP_SEC = 0.9; // audio_mix.envelopeExpr glides each new level in over 0.9 s from the point
const MIN_POINT_GAP = 0.1; // audio_mix collapses points closer than 0.05 s
const PIXABAY_LICENSE = "Pixabay Content License (free for commercial use; attribution not required)";
const SYNTH_LICENSE = "Generated ambient pad (no third-party rights)";

const sha1 = (s) => crypto.createHash("sha1").update(String(s)).digest("hex");
const r3 = (x) => Math.round(x * 1000) / 1000;

function energyWord(energy) {
  const e = Number(energy);
  if (!Number.isFinite(e) || e < 0.4) return "calm";
  if (e < 0.7) return "upbeat";
  return "energetic";
}

function buildMusicQuery({ query, mood, energy, pacing } = {}) {
  const words = [];
  const add = (s) => { for (const w of String(s || "").toLowerCase().match(/[a-z][a-z'-]*/g) || []) if (!words.includes(w)) words.push(w); };
  add(energyWord(energy));
  add(mood);
  add(query);
  if (pacing === "fast" || pacing === "extra_fast") add("driving");
  const q = words.slice(0, 6).join(" ");
  return q.slice(0, 80).trim() || "calm background";
}

function defaultFetchers() {
  // pixabay_bridge has no config dependency; audio_sources pulls config, so it is loaded only when used.
  const bridge = require("../../services/pixabay_bridge");
  return {
    bridgeFirstAudioUrl: bridge.firstAudioUrl,
    downloadToFile: bridge.downloadToFile,
    fetchMusic: (args) => require("../../services/audio_sources").fetchMusic(args),
  };
}

function checkAbort(signal) {
  if (signal && signal.aborted) throw new EditError("PROC_ABORTED", { status: 409, errorClass: "cancelled", detail: "aborted" });
}

async function isLavfEncoded(file, signal) {
  try {
    const j = await proc.ffprobeJson(["-protocol_whitelist", "file", "-show_entries", "format_tags=encoder", "-of", "json", `file:${file}`], { signal, timeoutMs: 15000 });
    const enc = j && j.format && j.format.tags && (j.format.tags.encoder || j.format.tags.ENCODER);
    return typeof enc === "string" && /^Lavf/i.test(enc);
  } catch { return false; }
}

function resolveProjectDir(projectDir, projectId) {
  if (typeof projectDir === "string" && projectDir) return projectDir;
  return require("../store").getStore().projectDir(projectId);
}

async function musicCandidates({
  query, mood, energy, durationSec, projectId, projectDir, pacing, max = 3, signal, fetchers, probeDurationSec,
} = {}) {
  const f = { ...(fetchers && fetchers.bridgeFirstAudioUrl && fetchers.downloadToFile && fetchers.fetchMusic ? {} : defaultFetchers()), ...(fetchers || {}) };
  const probe = probeDurationSec || require("../../services/media").probeDurationSec;
  const dir = resolveProjectDir(projectDir, projectId);
  const musicDir = fsx.ensureDir(fsx.resolveInside(dir, "assets/music"));
  const q = buildMusicQuery({ query, mood, energy, pacing });
  const moodText = String(mood || "").slice(0, 40);
  const want = Math.max(1, Math.min(3, Number(max) || 3));
  const tracks = [];

  const validate = async (file) => {
    let d = null;
    try { d = await probe(file); } catch { d = null; }
    return Number.isFinite(d) && d >= MIN_TRACK_SEC ? d : null;
  };

  // 1. Pixabay bridge
  const seen = new Set();
  for (let index = 0; index < want && tracks.length < want; index++) {
    checkAbort(signal);
    let url = null;
    try { url = await f.bridgeFirstAudioUrl(q, "music", { index }); } catch { url = null; }
    if (!url) break;
    if (seen.has(url)) continue;
    seen.add(url);
    const assetId = `ast_${sha1(url).slice(0, 16)}`;
    const rel = `assets/music/${assetId}.mp3`;
    const abs = path.join(musicDir, `${assetId}.mp3`);
    let durationS = fs.existsSync(abs) ? await validate(abs) : null;
    if (durationS == null) {
      let got = null;
      try { got = await f.downloadToFile(url, abs, { minBytes: 20000 }); } catch { got = null; }
      checkAbort(signal);
      if (!got || !fs.existsSync(abs)) continue;
      durationS = await validate(abs);
      if (durationS == null) { try { fs.unlinkSync(abs); } catch { /* noop */ } continue; }
    }
    tracks.push({ assetId, path: rel, provider: "pixabay_bridge", query: q, mood: moodText, sourceUrl: String(url).slice(0, 2048), license: PIXABAY_LICENSE, durationSec: r3(durationS) });
  }

  // 2. fallback: audio_sources.fetchMusic (synth pad last) — only when the bridge produced nothing.
  if (!tracks.length) {
    checkAbort(signal);
    const assetId = `ast_${sha1(`fallback|${q}|${projectId || ""}|${Math.round(Number(durationSec) || 0)}`).slice(0, 16)}`;
    const rel = `assets/music/${assetId}.mp3`;
    const abs = path.join(musicDir, `${assetId}.mp3`);
    let got = null;
    try { got = await f.fetchMusic({ query: q, outputPath: abs, durationSec: Number(durationSec) || 60, seed: projectId || "" }); } catch { got = null; }
    checkAbort(signal);
    const file = got && fs.existsSync(got) ? got : null;
    const durationS = file ? await validate(file) : null;
    if (file && durationS != null) {
      if (path.resolve(file) !== path.resolve(abs)) { fs.copyFileSync(file, abs); }
      const synth = await isLavfEncoded(abs, signal);
      tracks.push(synth
        ? { assetId, path: rel, provider: "synth", title: "Ambient pad (generated)", query: q, mood: moodText, license: SYNTH_LICENSE, durationSec: r3(durationS) }
        : { assetId, path: rel, provider: "pixabay_bridge", query: q, mood: moodText, license: PIXABAY_LICENSE, durationSec: r3(durationS) });
    } else if (file) {
      try { fs.unlinkSync(file); } catch { /* noop */ }
    }
  }
  return tracks;
}

// ---- envelope -----------------------------------------------------------------------------------
function spanOf(entry, resolveAnchor) {
  if (!entry || typeof entry !== "object") return null;
  let r = null;
  if (entry.resolved && Number.isFinite(entry.resolved.outIn)) r = entry.resolved;
  else if (Number.isFinite(entry.outIn) && Number.isFinite(entry.outOut)) r = entry;
  else if (entry.anchor && entry.anchor.kind === "out") r = { outIn: entry.anchor.outIn, outOut: entry.anchor.outOut, collapsed: false };
  else if (entry.anchor && typeof resolveAnchor === "function") { try { r = resolveAnchor(entry.anchor); } catch { r = null; } }
  if (!r || r.collapsed || !Number.isFinite(r.outIn) || !Number.isFinite(r.outOut) || r.outOut <= r.outIn) return null;
  return { outIn: r.outIn, outOut: r.outOut };
}

function envelopeFor(music, { resolveAnchor, durationSec } = {}) {
  if (!music || !Array.isArray(music.envelope) || !music.envelope.length) return [];
  const D = Number.isFinite(durationSec) && durationSec > 0 ? durationSec : Infinity;
  const base = Math.min(0.3, Math.max(0, Number(music.volume) || 0.1));
  let spans = [];
  for (const e of music.envelope) {
    const s = spanOf(e, resolveAnchor);
    const vol = Number(e && e.volume);
    if (!s || !Number.isFinite(vol)) continue;
    const outIn = Math.max(0, s.outIn), outOut = Math.min(D, s.outOut);
    if (outOut - outIn < 0.05) continue;
    spans.push({ outIn, outOut, volume: Math.min(0.3, Math.max(0, vol)) });
  }
  spans.sort((a, b) => a.outIn - b.outIn || a.outOut - b.outOut);
  // later entries win where spans overlap; equal neighbours closer than two ramps merge
  const merged = [];
  for (const s of spans) {
    const last = merged[merged.length - 1];
    if (last && s.outIn < last.outOut) {
      if (Math.abs(s.volume - last.volume) < 1e-6) { last.outOut = Math.max(last.outOut, s.outOut); continue; }
      last.outOut = s.outIn;
      if (last.outOut - last.outIn < 0.05) merged.pop();
    } else if (last && Math.abs(s.volume - last.volume) < 1e-6 && s.outIn - last.outOut < 2 * RAMP_SEC) {
      last.outOut = Math.max(last.outOut, s.outOut);
      continue;
    }
    merged.push({ ...s });
  }
  spans = merged.filter((s) => Math.abs(s.volume - base) > 1e-6);
  const maxSpans = Math.floor((MAX_ENVELOPE_POINTS - 1) / 2);
  if (spans.length > maxSpans) {
    spans = spans
      .map((s, i) => ({ s, i, w: Math.abs(s.volume - base) * (s.outOut - s.outIn) }))
      .sort((a, b) => b.w - a.w || a.i - b.i)
      .slice(0, maxSpans)
      .sort((a, b) => a.i - b.i)
      .map((x) => x.s);
  }
  if (!spans.length) return [];

  const pts = [{ atSec: 0, volume: base }];
  const push = (atSec, volume) => {
    const last = pts[pts.length - 1];
    if (atSec - last.atSec < MIN_POINT_GAP) {
      if (pts.length === 1 && atSec < MIN_POINT_GAP) { last.volume = volume; return; }
      atSec = last.atSec + MIN_POINT_GAP;
    }
    if (atSec >= D) return;
    pts.push({ atSec: r3(atSec), volume });
  };
  spans.forEach((s, i) => {
    // reach the span level by its start: the glide begins one ramp earlier (never before the previous point)
    push(Math.max(0, s.outIn - RAMP_SEC), s.volume);
    const next = spans[i + 1];
    if (!next || next.outIn - s.outOut >= RAMP_SEC + MIN_POINT_GAP) push(s.outOut, base);
  });
  return pts.slice(0, MAX_ENVELOPE_POINTS);
}

module.exports = {
  musicCandidates, buildMusicQuery, energyWord, envelopeFor,
  MIN_TRACK_SEC, MAX_ENVELOPE_POINTS, PIXABAY_LICENSE, SYNTH_LICENSE,
};
