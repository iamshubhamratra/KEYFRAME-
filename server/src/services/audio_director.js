// Audio Director agent — the final audio authority between Scene/Animation
// Planning and the render's audio mix. It reviews the whole soundtrack plan
// (voiceover clips, music mood, candidate sound effects) against the scene-by-
// scene story and returns an AUDIO PLAN: broadcast loudness targets, a per-scene
// music-energy curve, scene-aware ducking, and curated (accept/reject/re-timed)
// sound effects — plus a quality score. It thinks in dB/LUFS like a mixing
// engineer; the deterministic ffmpeg mixer (audio_mix.js) executes the plan.
//
// It supersedes the old "flat music volume + one fixed sidechain" mix, which made
// voiceover, music, and SFX compete. Voiceover clarity is the inviolable priority.
//
// FAIL-OPEN by design (mirrors creative_director.js): if the agent is disabled or
// the LLM errors, `directAudio` returns a deterministic DEFAULT plan derived from
// the scene kinds — so the mix is always improved and a render never blocks.

const fs = require("node:fs");
const path = require("node:path");
const config = require("../config");
const db = require("../db");
const openrouter = require("./openrouter");
const { extractFirstJsonObject } = require("./json_lenient");

const SYSTEM = fs.readFileSync(
  path.join(__dirname, "..", "prompts", "system_audio_director.md"),
  "utf8"
);

function ad() {
  return config.audioDirector || { enabled: true, model: "google/gemini-3.1-flash-lite" };
}

// ---- numeric guards ----------------------------------------------------------
const num = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const clamp = (v, lo, hi, d) => Math.max(lo, Math.min(hi, num(v, d)));
const clamp100 = (v) => Math.max(0, Math.min(100, Math.round(num(v, 0))));
const round1 = (n) => Math.round(num(n, 0) * 10) / 10;

// Broadcast-correct master defaults (web video). See system_audio_director.md.
const MASTER_DEFAULTS = {
  voLufs: -16, voTruePeakDb: -1.5,
  musicSoloLufs: -23, musicUnderVoDuckDb: -11,
  duckAttackMs: 40, duckReleaseMs: 500,
  masterTruePeakDb: -1.0,
};

// Per-scene music gain (dB, delta on the music base) by scene kind — the energy
// curve used both as the LLM's guide and as the fail-open default.
const KIND_MUSIC_DB = {
  hook: 0, title: 0, "shape-motion": 1, cta: 2,
  bullet: -4, caption: -4, chart: -4, countdown: -4,
  quote: -6,
};
const musicDbForKind = (kind) => {
  const k = String(kind || "").toLowerCase();
  return k in KIND_MUSIC_DB ? KIND_MUSIC_DB[k] : -3;
};

// Compact scene list the director keys on: kind/animation/beats from the
// storyboard, VO presence + measured word count from the synthesized clips.
function sceneDigest(scenes, voClips, durationSec) {
  const voBySc = new Map((voClips || []).map((c) => [String(c.sceneId), c]));
  const list = (scenes || []).map((sc, i) => {
    const id = sc.id != null ? sc.id : `s${i + 1}`;
    const start = round1(num(sc.start, 0));
    const dur = num(sc.duration, 0);
    const vo = voBySc.get(String(id));
    const end = round1(Math.min(num(durationSec, start + dur) || (start + dur), start + dur));
    const beats = Array.isArray(sc.beats)
      ? sc.beats.map((b) => round1(start + num(b && b.at, 0))).filter((t) => t >= start).slice(0, 5)
      : [];
    return {
      id,
      kind: String(sc.kind || "bullet").slice(0, 16),
      startSec: start,
      endSec: end > start ? end : round1(start + Math.max(0.1, dur)),
      animation: String(sc.animation || "").slice(0, 20),
      beats,
      voPresent: !!vo,
      voWords: vo && vo.text ? String(vo.text).split(/\s+/).filter(Boolean).length : 0,
    };
  });
  return list;
}

// Candidate SFX (already fetched) the director curates. `id` is the index into
// the sfxClips array — the same order the mixer appends the kind:"sfx" layers,
// so the plan's per-id decisions map straight onto the mixer inputs.
function sfxCandidates(sfxClips) {
  return (sfxClips || []).map((c, i) => ({
    id: i,
    name: String((c && (c.name || c.cue)) || "sfx").slice(0, 24),
    startSec: round1(num(c && c.startSec, 0)),
  }));
}

function buildUser({ subject, durationSec, digest, voClips, candidates, musicInfo }) {
  return [
    `FILM SUBJECT: "${subject || "(unspecified)"}". Total duration: ${durationSec}s.`,
    "",
    `SCENES (id, kind, timing, animation, beat times, voiceover presence + word count):`,
    JSON.stringify(digest),
    "",
    `VOICEOVER CLIPS (measured): ${JSON.stringify((voClips || []).map((c) => ({ sceneId: c.sceneId, startSec: round1(c.startSec), durationSec: round1(c.durationSec) })))}`,
    "",
    `MUSIC: ${musicInfo.present ? `a track was fetched, mood "${musicInfo.mood || "unspecified"}"` : "no music track"}.`,
    "",
    `CANDIDATE SOUND EFFECTS (curate by id): ${JSON.stringify(candidates)}`,
    "",
    `Return the AudioPlan JSON: master loudness targets, one scenes[] entry per scene above (music energy curve + duck depth), one sfx[] decision per candidate id, and a quality score. JSON only.`,
  ].join("\n");
}

// Coerce whatever the model returned into a fully-formed, in-range AudioPlan with
// exactly one scenes[] entry per scene and one sfx[] entry per candidate.
function sanitizePlan(raw, { digest, candidates }) {
  const rm = (raw && raw.master) || {};
  const master = {
    voLufs: clamp(rm.voLufs, -24, -9, MASTER_DEFAULTS.voLufs),
    voTruePeakDb: clamp(rm.voTruePeakDb, -6, -0.5, MASTER_DEFAULTS.voTruePeakDb),
    musicSoloLufs: clamp(rm.musicSoloLufs, -32, -14, MASTER_DEFAULTS.musicSoloLufs),
    musicUnderVoDuckDb: clamp(rm.musicUnderVoDuckDb, -24, -4, MASTER_DEFAULTS.musicUnderVoDuckDb),
    duckAttackMs: clamp(rm.duckAttackMs, 5, 200, MASTER_DEFAULTS.duckAttackMs),
    duckReleaseMs: clamp(rm.duckReleaseMs, 100, 1200, MASTER_DEFAULTS.duckReleaseMs),
    masterTruePeakDb: clamp(rm.masterTruePeakDb, -3, -0.3, MASTER_DEFAULTS.masterTruePeakDb),
  };

  const rawScenes = new Map(
    (Array.isArray(raw && raw.scenes) ? raw.scenes : []).map((s) => [String(s && s.sceneId), s])
  );
  const scenes = digest.map((d) => {
    const rs = rawScenes.get(String(d.id)) || {};
    return {
      sceneId: d.id,
      startSec: d.startSec,
      endSec: d.endSec,
      kind: d.kind,
      musicGainDb: clamp(rs.musicGainDb, -12, 4, musicDbForKind(d.kind)),
      duckDepthDb: d.voPresent ? clamp(rs.duckDepthDb, 4, 18, 11) : 0,
      voPresent: d.voPresent,
    };
  });

  const rawSfx = new Map(
    (Array.isArray(raw && raw.sfx) ? raw.sfx : []).map((x) => [Number(x && x.id), x])
  );
  const sfx = candidates.map((c) => {
    const rx = rawSfx.get(c.id) || {};
    const accept = typeof rx.accept === "boolean" ? rx.accept : true;
    return {
      id: c.id,
      cue: c.name,
      accept,
      // Keep SFX clearly in the BACKGROUND — accents, not events. A louder ceiling
      // let a 2s "impact" sit under (and muddy) the voiceover onset.
      gainDb: clamp(rx.gainDb, -34, -14, -22),
      atSec: clamp(rx.atSec, 0, 1e9, c.startSec),
      reason: String(rx.reason || "").slice(0, 120),
    };
  });

  const rsc = (raw && raw.score) || {};
  const score = {
    voiceoverClarity: clamp100(rsc.voiceoverClarity),
    musicBalance: clamp100(rsc.musicBalance),
    sfxQuality: clamp100(rsc.sfxQuality),
    synchronization: clamp100(rsc.synchronization),
    emotionalImpact: clamp100(rsc.emotionalImpact),
    overall: clamp100(rsc.overall),
  };

  return { master, scenes, sfx, score };
}

// Deterministic plan used when the agent is disabled or the LLM fails. Derives a
// sane per-scene music curve from scene kinds; keeps every candidate SFX at a
// modest level. This alone already fixes the "flat music" mix, fail-open.
function defaultAudioPlan(digest, candidates, durationSec) {
  const scenes = (digest && digest.length
    ? digest
    : [{ id: "s1", kind: "hook", startSec: 0, endSec: num(durationSec, 0), animation: "", beats: [], voPresent: true, voWords: 0 }]
  ).map((d) => ({
    sceneId: d.id, startSec: d.startSec, endSec: d.endSec, kind: d.kind,
    musicGainDb: musicDbForKind(d.kind),
    duckDepthDb: d.voPresent ? 11 : 0,
    voPresent: !!d.voPresent,
  }));
  const sfx = (candidates || []).map((c) => ({
    id: c.id, cue: c.name, accept: true, gainDb: -16, atSec: c.startSec, reason: "default",
  }));
  return { master: { ...MASTER_DEFAULTS }, scenes, sfx, score: null, source: "default" };
}

async function buildPlan({ subject, durationSec, digest, voClips, candidates, musicInfo, tracker, signal }) {
  const user = buildUser({ subject, durationSec, digest, voClips, candidates, musicInfo });
  const { text, tokensIn, tokensOut } = await openrouter.chat({
    system: SYSTEM, user, jsonMode: true, stage: "audio_director",
    model: ad().model, temperature: 0.2, signal,
  });
  if (tracker) tracker.addLlm({ inputTokens: tokensIn, outputTokens: tokensOut, stage: "audio_director" });
  const parsed = extractFirstJsonObject(text);
  return sanitizePlan(parsed, { digest, candidates });
}

// ---------------------------------------------------------------- main
// Thin fail-open wrapper used by all three pipeline paths: flag-gate, run,
// persist the plan to the job, and ALWAYS return a usable plan (LLM or default).
async function directAudio({
  jobId, storyboard, script, voClips, sfxClips, musicPath,
  brief, subject, durationSec, tracker, signal,
}) {
  const scenes = (storyboard && Array.isArray(storyboard.scenes) && storyboard.scenes.length)
    ? storyboard.scenes
    : (script && Array.isArray(script.scenes) ? script.scenes : []);
  const dur = num(durationSec, 0)
    || num(storyboard && storyboard.durationSec, 0)
    || (scenes.reduce((m, s) => Math.max(m, num(s.start, 0) + num(s.duration, 0)), 0));
  const digest = sceneDigest(scenes, voClips, dur);
  const candidates = sfxCandidates(sfxClips);
  const musicInfo = {
    present: !!musicPath,
    mood: String((script && script.music && script.music.mood) || (brief && brief.mood) || "").slice(0, 40),
  };
  const subj = String(subject || (brief && brief.subject) || "").trim();

  if (!ad().enabled) return defaultAudioPlan(digest, candidates, dur);

  try {
    const plan = await buildPlan({ subject: subj, durationSec: dur, digest, voClips, candidates, musicInfo, tracker, signal });
    if (jobId) { try { db.setAudioReview(jobId, plan); } catch { /* best effort */ } }
    const kept = plan.sfx.filter((x) => x.accept).length;
    console.log(`[audio_director] job ${jobId || "?"}: ${plan.scenes.length} scene level(s), ${kept}/${plan.sfx.length} sfx kept, overall=${plan.score && plan.score.overall}`);
    return plan;
  } catch (e) {
    console.warn(`[audio_director] failed (${String((e && e.message) || e).slice(0, 140)}) — using default mix plan`);
    return defaultAudioPlan(digest, candidates, dur);
  }
}

module.exports = { directAudio, defaultAudioPlan };
