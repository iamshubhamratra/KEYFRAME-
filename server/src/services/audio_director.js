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
  // The 2.5 kHz notch in the music bus exists for ONE reason: to clear the vocal band
  // so speech stays intelligible over the bed. It is a cost paid for a benefit — it
  // audibly dulls the track — and with no voice there is no benefit left to pay for.
  // Carried on the plan (rather than hardcoded in audio_mix) so the mixer executes a
  // DECISION instead of an assumption, and so the report can state what was applied.
  musicMidCarveDb: -4,
  // THE REVERSE DUCK, and why it is 0 with a voice.
  //
  // With narration on, the SFX bus is already ducked UNDER the voice and the music is
  // ducked under it too — everything defers to speech, and a third relationship would just
  // pump. With narration OFF nothing arbitrates music against SFX at all: an impact and a
  // bed peak collide and the limiter sorts it out, which is what makes a music-led film's
  // accents read as mush rather than as punctuation. So in that mode only, the music
  // briefly steps aside for the accent — shallow and fast, so the bed is back before the
  // next beat.
  musicUnderSfxDuckDb: 0,
};

// ---- NARRATION MODE ----------------------------------------------------------
//
// The first decision the director makes, and the one every other decision reads.
// Not a mute switch: the two modes are different mixes with different jobs.
//
//   "on"  — VOICE-LED. The bed sits at −23 LUFS under speech, ducks 4–18 dB on VO
//           scenes, keeps the vocal-band carve, and SFX stay accents at ≈ −22 dB.
//           Priority: voiceover > important SFX > music > ambience.
//
//   "off" — MUSIC-LED. Nothing is competing with the music, so it becomes the
//           primary bus: target lifts to −18…−14 (by the pack's energyBoost), the
//           sidechain duck is bypassed entirely, the vocal carve is removed, the
//           per-scene energy curve widens so the track carries the emotional arc,
//           and SFX come forward (≈ −16 dB) to punctuate the animation.
//           Priority: music > accent SFX > ambience.
//
// The master limiter and the −1 dBTP ceiling do NOT move between modes. That is the
// whole of "the music may occupy more of the dynamic range but must never become
// harsh": only the INTEGRATED target changes, never the peak ceiling.
const NO_VO_MUSIC_LUFS = { 0: -18, 1: -16, 2: -14 };

function masterDefaultsFor(narration, profile) {
  if (narration !== "off") return { ...MASTER_DEFAULTS };
  const boost = (profile && profile.noVo && Number.isFinite(profile.noVo.energyBoost))
    ? profile.noVo.energyBoost : 1;
  return {
    ...MASTER_DEFAULTS,
    musicSoloLufs: NO_VO_MUSIC_LUFS[boost] != null ? NO_VO_MUSIC_LUFS[boost] : -16,
    musicUnderVoDuckDb: 0,   // nothing to duck under
    musicMidCarveDb: 0,      // no voice to clear
    musicUnderSfxDuckDb: -7, // the accents now punctuate the bed — see MASTER_DEFAULTS
  };
}

// Per-scene music gain (dB, delta on the music base) by scene kind — the energy
// curve used both as the LLM's guide and as the fail-open default.
const KIND_MUSIC_DB = {
  hook: 0, title: 0, "shape-motion": 1, cta: 2,
  bullet: -4, caption: -4, chart: -4, countdown: -4,
  quote: -6,
};
// WIDER with no narration. With a voice, the bed's job is to stay out of the way, so its
// range is deliberately narrow (−6…+2). With no voice the bed IS the storytelling, and a
// track that sits at one level for 30 seconds is what makes a music-only film feel flat —
// so the hook opens up, the CTA lands harder, and the dense copy scenes drop further to
// give those moments somewhere to come from (−6…+5).
const KIND_MUSIC_DB_NO_VO = {
  hook: 2, title: 2, "shape-motion": 4, cta: 5,
  bullet: -3, caption: -3, chart: -3, countdown: -3,
  quote: -6,
};
const musicDbForKind = (kind, narration) => {
  const table = narration === "off" ? KIND_MUSIC_DB_NO_VO : KIND_MUSIC_DB;
  const k = String(kind || "").toLowerCase();
  const fallback = narration === "off" ? -1 : -3;
  return k in table ? table[k] : fallback;
};

// SFX leveling per mode. With a voice these are accents UNDER speech; with none they
// are the punctuation carrying the animation, so the whole window moves up ~6 dB.
const SFX_LEVEL = {
  on:  { lo: -34, hi: -14, def: -22 },
  off: { lo: -28, hi: -10, def: -16 },
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

// ---- the Creative Director's soundtrack verdict ------------------------------
//
// The CD reviews the planned music + SFX against the film's subject and returns
// { musicAnalysis: { classification, fitScore, keep, suggestedQuery, note },
//   soundEffectAnalysis: { recommend[], reject[], note } }.
// That verdict used to stop at the database. It arrives here now, and it has two
// DETERMINISTIC consequences — the prompt also carries it, but a model that ignores
// its own brief must not be the only thing standing between a wrong-genre bed and the
// mix:
//
//   music keep:false  → the per-scene music gain is CAPPED (never raised). We cannot
//                       refetch at this point in the pipeline — the track is already on
//                       disk and the voice branch that fetched it has finished — so the
//                       honest response to "this bed doesn't fit" is to put it further
//                       under the voiceover rather than to let it lead a scene.
//   sfx reject[name]  → that cue is not accepted into the mix at all.
//
// Both rules are expressed as CEILINGS, not deltas, so applying them to an LLM plan
// that already accounted for the advice cannot double-count.
const MUSIC_MISFIT_CEILING_DB = -3;

function normalizeAdvice(musicAdvice, sfxAdvice) {
  const m = musicAdvice && typeof musicAdvice === "object" ? musicAdvice : null;
  const s = sfxAdvice && typeof sfxAdvice === "object" ? sfxAdvice : null;
  const rejected = new Set(
    (s && Array.isArray(s.reject) ? s.reject : [])
      .map((n) => String(n || "").toLowerCase().trim())
      .filter(Boolean)
  );
  const musicFits = m && typeof m.keep === "boolean" ? m.keep : null;   // null = no opinion
  if (!m && !rejected.size) return null;
  return {
    musicFits,
    musicNote: m && m.note ? String(m.note).slice(0, 160) : null,
    musicClassification: m && m.classification ? String(m.classification).slice(0, 24) : null,
    musicFitScore: m && Number.isFinite(Number(m.fitScore)) ? clamp100(m.fitScore) : null,
    suggestedQuery: m && m.suggestedQuery ? String(m.suggestedQuery).slice(0, 80) : null,
    rejected,
    recommend: (s && Array.isArray(s.recommend) ? s.recommend : []).map((n) => String(n).slice(0, 24)).slice(0, 6),
  };
}

// Apply the verdict to a finished plan (LLM-authored or default). Idempotent.
function applyAdvice(plan, advice) {
  if (!plan || !advice) return plan;
  const applied = { musicCapped: 0, sfxRejected: [] };

  if (advice.musicFits === false) {
    for (const sc of plan.scenes || []) {
      if (sc.musicGainDb > MUSIC_MISFIT_CEILING_DB) { sc.musicGainDb = MUSIC_MISFIT_CEILING_DB; applied.musicCapped++; }
    }
  }
  if (advice.rejected && advice.rejected.size) {
    for (const x of plan.sfx || []) {
      if (x.accept && advice.rejected.has(String(x.cue || "").toLowerCase().trim())) {
        x.accept = false;
        x.reason = `creative director rejected this cue${advice.musicNote ? "" : ""}`;
        applied.sfxRejected.push(x.cue);
      }
    }
  }

  // Disclosure rides the plan (persisted as audio_review): "why is the music so low?"
  // now has an answer, including the better query the director would have preferred.
  plan.creativeDirection = {
    musicFits: advice.musicFits,
    musicClassification: advice.musicClassification,
    musicFitScore: advice.musicFitScore,
    musicNote: advice.musicNote,
    suggestedQuery: advice.suggestedQuery,
    recommendedSfx: advice.recommend,
    applied,
  };
  return plan;
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

function buildUser({ subject, durationSec, digest, voClips, candidates, musicInfo, advice, narration = "on", profile = null }) {
  // NARRATION MODE leads the brief — it is the decision every other one depends on, so
  // the model must read it before it reads a single scene. The numbers are stated as
  // targets rather than left implicit: sanitizePlan enforces them either way, but a model
  // told the target authors a coherent curve instead of one that gets clamped into shape.
  const noVo = narration === "off";
  const modeBlock = [
    `NARRATION: ${noVo ? "OFF — there is NO voiceover in this film." : "ON — this film is narrated."}`,
    noVo
      ? "This is a MUSIC-LED mix. The music is the primary bus and carries the emotional arc: "
        + "aim musicSoloLufs around -16 (louder than a narrated film), set every duckDepthDb to 0 "
        + "(there is no voice to duck under), set musicMidCarveDb to 0 (the 2.5 kHz vocal-band notch "
        + "has nothing to clear), and use a WIDE per-scene musicGainDb curve so the hook opens up and "
        + "the CTA lands. Sound effects come FORWARD (about -16 dB) and punctuate the animation. "
        + "Priority: music > accent SFX > ambience. Never harsh: the true-peak ceiling does not move."
      : "This is a VOICE-LED mix. Voiceover clarity is the inviolable priority: keep musicSoloLufs "
        + "near -23, duck 4-18 dB on scenes that carry voice, keep the 2.5 kHz carve, and keep SFX "
        + "as subtle accents (about -22 dB) that never sit on a word. "
        + "Priority: voiceover > important SFX > music > ambience.",
    "",
  ];
  // The pack's audio identity — the same block that steered the music search, so the
  // director shapes a bed it knows the character of rather than guessing from a mood word.
  const profileBlock = (profile && profile.source === "manifest") ? [
    `TEMPLATE AUDIO IDENTITY (the film's visual template declares its own sound): ${JSON.stringify({
      mood: profile.mood, energy: profile.energy, tempo: profile.tempo, style: profile.style,
    })}`,
    noVo ? `With narration off this template asks for energyBoost ${profile.noVo.energyBoost} and ${profile.noVo.sfxDensity} sound-effect density. `
      + `energyBoost 0 means this template deliberately STAYS quiet without a voice — do not push it.` : "",
    "",
  ].filter(Boolean) : [];
  return buildUserBody({ subject, durationSec, digest, voClips, candidates, musicInfo, advice, modeBlock, profileBlock });
}

function buildUserBody({ subject, durationSec, digest, voClips, candidates, musicInfo, advice, modeBlock, profileBlock }) {
  // The Creative Director already judged this soundtrack against the film's subject.
  // Hand the model that verdict rather than asking it to re-derive one from metadata.
  const cdBlock = advice ? [
    "CREATIVE DIRECTOR'S VERDICT ON THIS SOUNDTRACK (treat as a brief, not a suggestion):",
    JSON.stringify({
      musicFits: advice.musicFits,
      classification: advice.musicClassification,
      fitScore: advice.musicFitScore,
      note: advice.musicNote,
      wouldPrefer: advice.suggestedQuery,
      rejectCues: [...advice.rejected],
      recommendCues: advice.recommend,
    }),
    advice.musicFits === false
      ? "The music does NOT fit. It cannot be replaced at this stage, so keep it clearly under the voiceover — do not let it lead any scene."
      : "",
    "",
  ].filter(Boolean) : [];
  return [
    `FILM SUBJECT: "${subject || "(unspecified)"}". Total duration: ${durationSec}s.`,
    "",
    ...modeBlock,
    ...profileBlock,
    ...cdBlock,
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
function sanitizePlan(raw, { digest, candidates, narration = "on", profile = null }) {
  const noVo = narration === "off";
  const D = masterDefaultsFor(narration, profile);
  const rm = (raw && raw.master) || {};
  const master = {
    voLufs: clamp(rm.voLufs, -24, -9, D.voLufs),
    voTruePeakDb: clamp(rm.voTruePeakDb, -6, -0.5, D.voTruePeakDb),
    // The music ceiling opens to −12 in no-VO mode. It stays at −14 with a voice: a bed
    // any louder than that cannot be brought back under speech by ducking alone.
    musicSoloLufs: clamp(rm.musicSoloLufs, -32, noVo ? -12 : -14, D.musicSoloLufs),
    // NOT clamped from the model in no-VO mode — pinned. A duck with no key signal is
    // not merely useless, it is a claim the report would have to call false; the mixer
    // builds no sidechain at all without a voice bus.
    musicUnderVoDuckDb: noVo ? 0 : clamp(rm.musicUnderVoDuckDb, -24, -4, D.musicUnderVoDuckDb),
    // Structural, like the duck bypass above: the mode decides whether this relationship
    // exists at all, and the model may only shape it within the mode.
    musicUnderSfxDuckDb: noVo ? clamp(rm.musicUnderSfxDuckDb, -12, -2, D.musicUnderSfxDuckDb) : 0,
    duckAttackMs: clamp(rm.duckAttackMs, 5, 200, D.duckAttackMs),
    duckReleaseMs: clamp(rm.duckReleaseMs, 100, 1200, D.duckReleaseMs),
    masterTruePeakDb: clamp(rm.masterTruePeakDb, -3, -0.3, D.masterTruePeakDb),
    musicMidCarveDb: noVo ? 0 : clamp(rm.musicMidCarveDb, -8, 0, D.musicMidCarveDb),
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
      musicGainDb: clamp(rs.musicGainDb, noVo ? -14 : -12, noVo ? 6 : 4, musicDbForKind(d.kind, narration)),
      duckDepthDb: (d.voPresent && !noVo) ? clamp(rs.duckDepthDb, 4, 18, 11) : 0,
      voPresent: d.voPresent,
    };
  });

  const lvl = noVo ? SFX_LEVEL.off : SFX_LEVEL.on;
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
      // With a voice: keep SFX clearly in the BACKGROUND — accents, not events. A louder
      // ceiling let a 2s "impact" sit under (and muddy) the voiceover onset. With no
      // voice: the same cues are the film's punctuation, so the window moves up ~6 dB.
      gainDb: clamp(rx.gainDb, lvl.lo, lvl.hi, lvl.def),
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

  return { master, scenes, sfx, score, narration, audioProfile: profileSummary(profile) };
}

// The pack identity that steered this mix, recorded ON the plan so the audio report and
// the Premiere panel can say WHY the film sounds the way it does — and so a job whose
// template declared nothing is honestly labelled `source: "neutral"` rather than
// implying a template decision nobody made.
function profileSummary(profile) {
  if (!profile) return null;
  return {
    source: profile.source,
    mood: profile.mood,
    energy: profile.energy,
    tempo: profile.tempo,
    style: profile.style,
    energyBoost: profile.noVo.energyBoost,
    sfxDensity: profile.noVo.sfxDensity,
  };
}

// Deterministic plan used when the agent is disabled or the LLM fails. Derives a
// sane per-scene music curve from scene kinds; keeps every candidate SFX at a
// modest level. This alone already fixes the "flat music" mix, fail-open.
function defaultAudioPlan(digest, candidates, durationSec, { narration = "on", profile = null } = {}) {
  const noVo = narration === "off";
  const scenes = (digest && digest.length
    ? digest
    : [{ id: "s1", kind: "hook", startSec: 0, endSec: num(durationSec, 0), animation: "", beats: [], voPresent: !noVo, voWords: 0 }]
  ).map((d) => ({
    sceneId: d.id, startSec: d.startSec, endSec: d.endSec, kind: d.kind,
    musicGainDb: musicDbForKind(d.kind, narration),
    duckDepthDb: (d.voPresent && !noVo) ? 11 : 0,
    voPresent: !!d.voPresent,
  }));
  // -22 dB, not -16: this is the same "accents, not events" ceiling sanitizePlan
  // applies to a MODEL-authored plan. At -16 the fail-open path was 6 dB LOUDER than
  // the planned path, so an audio_director outage made SFX more intrusive rather than
  // more conservative — the wrong direction for a fallback. The no-VO window is the
  // one place -16 IS correct, and it is reached through the same table either way:
  // a fail-open default must be the same FEATURE as the planned path, only dumber.
  const lvl = noVo ? SFX_LEVEL.off : SFX_LEVEL.on;
  const sfx = (candidates || []).map((c) => ({
    id: c.id, cue: c.name, accept: true, gainDb: lvl.def, atSec: c.startSec, reason: "default",
  }));
  return {
    master: masterDefaultsFor(narration, profile),
    scenes, sfx, score: null, source: "default",
    narration, audioProfile: profileSummary(profile),
  };
}

async function buildPlan({ subject, durationSec, digest, voClips, candidates, musicInfo, advice, narration, profile, tracker, signal }) {
  const user = buildUser({ subject, durationSec, digest, voClips, candidates, musicInfo, advice, narration, profile });
  const { text, tokensIn, tokensOut, model: servedModel, provider: servedBy } = await openrouter.chat({
    // No explicit `model` (that would pin the call with no fallback behind it).
    // config.js mirrors audioDirector.model into llm.primary.stageModels, which is
    // what routes this stage to its KIE model.
    system: SYSTEM, user, jsonMode: true, stage: "audio_director",
    temperature: 0.2, signal,
  });
  if (tracker) tracker.addLlm({ inputTokens: tokensIn, outputTokens: tokensOut, stage: "audio_director", model: servedModel, provider: servedBy });
  const parsed = extractFirstJsonObject(text);
  return applyAdvice(sanitizePlan(parsed, { digest, candidates, narration, profile }), advice);
}

// ---------------------------------------------------------------- main
// Thin fail-open wrapper used by all three pipeline paths: flag-gate, run,
// persist the plan to the job, and ALWAYS return a usable plan (LLM or default).
async function directAudio({
  jobId, storyboard, script, voClips, sfxClips, musicPath,
  brief, subject, durationSec, tracker, signal,
  // The Creative Director's soundtrack verdict, handed over in-band by the caller
  // (graph state / project_pipeline local). Optional: absent = today's behaviour
  // exactly, since normalizeAdvice returns null and applyAdvice is then a no-op.
  musicAdvice = null, sfxAdvice = null,
  // THE VOICEOVER DECISION — resolved by the caller from job.voiceover_enabled and
  // handed in, because it must be the FIRST thing this agent knows. Defaulting to
  // "on" keeps every existing caller (and every legacy job) on today's mix exactly.
  //
  // Deliberately NOT inferred from `voClips.length === 0`: an empty clip list also
  // means "TTS failed", and those two states deserve opposite responses — a
  // music-led remix for the film the user asked for, a disclosure for the one that
  // broke. Conflating them is how a provider outage would silently masquerade as a
  // feature. See graph.voiceAgent, which keeps the two apart at the source.
  narration = "on",
  // The frame pack's audio identity (services/audio_profile). Absent = NEUTRAL =
  // today's behaviour.
  framePack = null, audioProfile = null,
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
  const advice = normalizeAdvice(musicAdvice, sfxAdvice);
  const mode = narration === "off" ? "off" : "on";
  const profile = audioProfile || (framePack ? require("./audio_profile").profileFor(framePack) : null);
  console.log(`[audio_director] narration=${mode}${mode === "off" ? " → MUSIC-LED mix (duck bypassed, vocal carve removed)" : ""}`
    + (profile && profile.source === "manifest" ? `, template audio "${framePack}" (${profile.mood}/${profile.energy})` : ", neutral audio profile"));
  if (advice) {
    console.log(`[audio_director] creative direction: music ${advice.musicFits === false ? "does NOT fit" : advice.musicFits === true ? "fits" : "unjudged"}`
      + (advice.musicFitScore != null ? ` (${advice.musicFitScore}/100)` : "")
      + (advice.rejected.size ? `, ${advice.rejected.size} sfx cue(s) rejected` : ""));
  }

  // The advice applies to the deterministic plan too — it is the path taken when the
  // agent is disabled or the model fails, and a fallback that ignores a known-bad
  // music bed is exactly the fallback that made this call worth wiring.
  if (!ad().enabled) return applyAdvice(defaultAudioPlan(digest, candidates, dur, { narration: mode, profile }), advice);

  try {
    const plan = await buildPlan({ subject: subj, durationSec: dur, digest, voClips, candidates, musicInfo, advice, narration: mode, profile, tracker, signal });
    if (jobId) { try { db.setAudioReview(jobId, plan); } catch { /* best effort */ } }
    const kept = plan.sfx.filter((x) => x.accept).length;
    console.log(`[audio_director] job ${jobId || "?"}: ${plan.scenes.length} scene level(s), ${kept}/${plan.sfx.length} sfx kept, music@${plan.master.musicSoloLufs} LUFS, overall=${plan.score && plan.score.overall}`);
    return plan;
  } catch (e) {
    console.warn(`[audio_director] failed (${String((e && e.message) || e).slice(0, 140)}) — using default mix plan`);
    const plan = applyAdvice(defaultAudioPlan(digest, candidates, dur, { narration: mode, profile }), advice);
    if (jobId) { try { db.setAudioReview(jobId, plan); } catch { /* best effort */ } }
    return plan;
  }
}

module.exports = { directAudio, defaultAudioPlan };
// Test seam: the Creative Director's verdict is applied deterministically to BOTH the
// LLM plan and the fallback, so its idempotence is worth asserting directly.
module.exports.__test = {
  applyAdvice, normalizeAdvice, MUSIC_MISFIT_CEILING_DB,
  // The narration branch is the feature's core: both modes must be reachable
  // deterministically (no LLM) and must differ in the ways the brief specifies.
  sanitizePlan, masterDefaultsFor, musicDbForKind, SFX_LEVEL, NO_VO_MUSIC_LUFS,
};
