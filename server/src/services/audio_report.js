// AUDIO VALIDATION REPORT — the deterministic check on the finished soundtrack.
//
// The Audio Director already returns a self-assessed `score` block. That is the model
// grading its own homework: it reports what it INTENDED, not what the film received, and
// it cannot see that two cues resolved to the same sound or that a cue was placed on a
// scene that no longer exists. This module checks the actual plan against the actual
// scenes and cues, deterministically, and answers the questions the brief asks:
//
//   is every accepted effect mapped to a real scene?
//   are there duplicates, or effects with no visual justification?
//   is the voice protected (ducking on, levels sane)?
//   is the loudness normalized and the master safe?
//
// Fail-open by contract (THE LAW): a disclosure never blocks a render. Every field
// degrades to a null/false rather than throwing.

const round = (n) => Math.round(Number(n) || 0);

/**
 * buildAudioReport({ plan, sfxClips, scenes, musicPath, musicMood, voClips })
 *   → the report object (safe to persist and to show a user)
 */
function buildAudioReport({
  plan, sfxClips = [], scenes = [], musicPath = null, musicMood = "", voClips = [],
  // The flexible-audio inputs. All optional and all defaulting to the pre-feature
  // reading, so an older caller produces exactly the report it did before.
  narration = "on", voiceoverRequested = true, profile = null, musicSelection = null,
} = {}) {
  const noVo = narration === "off";
  const decisions = new Map((plan && Array.isArray(plan.sfx) ? plan.sfx : []).map((x) => [Number(x.id), x]));
  const sceneIds = new Set((scenes || []).map((s) => (s && s.id != null ? String(s.id) : null)).filter(Boolean));

  const accepted = [];
  const rejected = [];
  (sfxClips || []).forEach((clip, i) => {
    const dec = decisions.get(i);
    const entry = {
      cue: clip.name || "sfx",
      requested: clip.requested && clip.requested !== clip.name ? clip.requested : undefined,
      sceneId: clip.sceneId != null ? String(clip.sceneId) : null,
      atSec: dec && Number.isFinite(dec.atSec) ? Math.round(dec.atSec * 100) / 100 : clip.startSec,
      gainDb: dec && Number.isFinite(dec.gainDb) ? dec.gainDb : null,
      support: clip.support || null,
      reason: dec && dec.reason ? String(dec.reason).slice(0, 120) : null,
    };
    if (dec && dec.accept === false) rejected.push(entry); else accepted.push(entry);
  });

  // EVERY EFFECT MAPPED TO A SCENE. An accepted cue whose sceneId is missing or no longer
  // in the scene list is exactly the "effect with no relationship to what is on screen"
  // the brief describes.
  const unmapped = accepted.filter((a) => !a.sceneId || !sceneIds.has(a.sceneId));
  // NO DUPLICATES. Same cue twice is the "repetitive effects" complaint; the planner
  // already forbids it back-to-back, this catches it anywhere in the film.
  const seen = new Map();
  for (const a of accepted) seen.set(a.cue, (seen.get(a.cue) || 0) + 1);
  const duplicates = [...seen.entries()].filter(([, n]) => n > 1).map(([cue, n]) => ({ cue, count: n }));
  // NO UNJUSTIFIED EFFECTS. `support` records what on screen the cue lands on.
  const unjustified = accepted.filter((a) => !a.support);
  // SPACING. Two hits inside 400ms read as one messy noise.
  const times = accepted.map((a) => Number(a.atSec) || 0).sort((x, y) => x - y);
  let tooClose = 0;
  for (let i = 1; i < times.length; i++) if (times[i] - times[i - 1] < 0.4) tooClose++;

  const master = (plan && plan.master) || {};
  const voLufs = Number.isFinite(master.voLufs) ? master.voLufs : null;
  const duckDb = Number.isFinite(master.musicUnderVoDuckDb) ? master.musicUnderVoDuckDb : null;
  const musicLufs = Number.isFinite(master.musicSoloLufs) ? master.musicSoloLufs : null;
  const ducking = !!(voClips || []).length && Math.abs(duckDb || 0) >= 4;
  // The SFX bus is ducked under the voice whenever there IS a voice (audio_mix builds the
  // sidechain unconditionally in that case), so this reports the mix's real behaviour.
  const sfxDucked = !!(voClips || []).length;

  // ---- FLEXIBLE-AUDIO CHECKS ------------------------------------------------------
  //
  // 1. VOICEOVER RESPECTED. The one check that catches BOTH failure directions at once:
  //    a toggle that did nothing (narration off, clips present) and a silent TTS failure
  //    (narration on, script had lines, no clips). Both are "the film does not have the
  //    voice state the user asked for", and neither was previously detectable.
  const scriptWantedVo = (scenes || []).some((s) => s && typeof s.voiceover === "string" && s.voiceover.trim());
  const voiceoverRespected = noVo
    ? (voClips || []).length === 0
    : (!voiceoverRequested || !scriptWantedVo || (voClips || []).length > 0);

  // 2. MUSIC FROM TEMPLATE. Did the pack's own vocabulary actually steer the search, or
  //    did this fall back to the script's subject-derived query? `musicSelection.query` is
  //    what WON, not what was asked — a template keyword that returned nothing and lost to
  //    a later candidate must not be reported as a template-steered choice.
  //    MEASURE AGAINST WHAT WAS ASKED, NOT AGAINST A SAMPLE OF IT. `musicSelection.keywords`
  //    is pickMusicKeywords' output: ONE OR TWO rotated musicKeywords phrasings, kept for the
  //    log line. It is not the search. The search is `candidates` — music_vocabulary.queryLadder
  //    — which deliberately LEADS with the genre terms from the pack's `style[]` because those
  //    are "the deep pool; this is what guarantees the search is never empty". So the query most
  //    likely to WIN was structurally absent from the list this check compared against.
  //
  //    Measured on job zwq8nrrpht (alpine-post): the winning query was "horn", a genre term off
  //    style:["alpine horn",...]. The template steered the search exactly as designed, and this
  //    line reported musicSource:"script-fallback", raised a blocking issue, and docked six
  //    points. `candidates` was already being passed in and never read.
  //
  //    The script's own subject query rides in the SAME ladder (queryLadder reserves a slot for
  //    it), so it is excluded here — otherwise every film would look template-steered.
  const profiled = !!(profile && profile.source === "manifest");
  // Still reported under templateAudio below — it is what a human recognises as this
  // template's sound. It is simply no longer what the verdict is measured against.
  const keywords = (musicSelection && Array.isArray(musicSelection.keywords)) ? musicSelection.keywords : [];
  const wonQuery = String((musicSelection && musicSelection.query) || "").toLowerCase();
  const hasLadder = !!(musicSelection && Array.isArray(musicSelection.candidates) && musicSelection.candidates.length);
  const subject = String((musicSelection && musicSelection.scriptQuery) || "").trim().toLowerCase();
  // fetchMusic normalizes a candidate (lowercase, de-duplicated words) before searching, so the
  // winner is compared on the same footing.
  const norm = (q) => [...new Set(String(q || "").toLowerCase().match(/[a-z][a-z'-]*/g) || [])].join(" ");
  const wonNorm = norm(wonQuery);
  let musicFromTemplate;
  if (hasLadder) {
    // The ladder holds the LITERAL strings that were searched, so identity is the right test:
    // a pair ("techno driving") is itself an entry, not a prefix of one.
    const templateAsked = musicSelection.candidates
      .map((q) => String(q || "").trim().toLowerCase())
      .filter((q) => q && q !== subject);
    musicFromTemplate = profiled && !!wonNorm && templateAsked.some((q) => norm(q) === wonNorm);
  } else {
    // LEGACY SHAPE — a caller that passes only `keywords` (the 1-2 phrasings). There the winner
    // is often a pair BUILT from a keyword ("future bass" -> "future bass driving"), so identity
    // would under-report. Keep the original containment reading for that path exactly.
    musicFromTemplate = profiled && !!wonQuery
      && keywords.some((k) => k && wonQuery.includes(String(k).toLowerCase().split(" ")[0]));
  }
  const musicSource = !musicPath ? "none"
    : !profiled ? "script-fallback"
      : musicFromTemplate ? "template"
        : "script-fallback";

  // 3. DUCKING CORRECT FOR THE MODE. Ducking is not simply "on = good": with no voice a
  //    non-zero duck depth is a sidechain keyed off silence, which the mixer would have to
  //    either ignore or pump against nothing. Correctness is mode-dependent, so the check is.
  const duckingCorrect = noVo ? Math.abs(duckDb || 0) === 0 : ducking || !(voClips || []).length;

  // 4. NO-VO ENERGY. Did the music-led mix actually open up, or did the mode flip without
  //    changing the mix? -20 LUFS is the boundary: anything at or below it is still a
  //    voice-led bed sitting under narration that does not exist.
  const noVoEnergy = !noVo ? null : (musicLufs != null && musicLufs > -20);

  // The fifth check — "captions survived a narration-free film" — deliberately does NOT
  // live here. This report is built by the Audio Director node, which runs BEFORE the
  // timeline writes any cues, so any verdict it rendered would be a guess. It lives at
  // the point the cues exist instead: the caption record carries `timing: "measured" |
  // "estimated"` (graph.timelineAgent), which is both the check and the disclosure.

  const issues = [];
  if (unmapped.length) issues.push(`${unmapped.length} effect(s) are not mapped to a scene`);
  if (duplicates.length) issues.push(`${duplicates.map((d) => `${d.cue}×${d.count}`).join(", ")} repeated`);
  if (unjustified.length) issues.push(`${unjustified.length} effect(s) fire with no on-screen action`);
  if (tooClose) issues.push(`${tooClose} pair(s) of effects land within 400ms`);
  if (!noVo && (voClips || []).length && !ducking) issues.push("music is not ducked under the voiceover");
  if (!musicPath) issues.push("no music bed");
  if (!voiceoverRespected) {
    issues.push(noVo
      ? "voiceover was disabled but narration clips reached the mix"
      : "voiceover was requested but no narration reached the mix");
  }
  if (!duckingCorrect) issues.push(noVo ? "a duck was planned with no voice to key it" : "ducking is not configured for a narrated film");
  if (noVoEnergy === false) issues.push(`music-led mix but the bed is still at ${musicLufs} LUFS — it was not brought forward`);
  if (profiled && musicPath && !musicFromTemplate) issues.push("music did not come from the template's keywords (fell back to the script query)");

  // Deterministic quality score — what the film HAS, not what a model hoped for. Starts
  // at 100 and pays for each defect the brief names.
  let score = 100;
  score -= unmapped.length * 12;
  score -= duplicates.reduce((s, d) => s + (d.count - 1) * 8, 0);
  score -= unjustified.length * 8;
  score -= tooClose * 6;
  if (!noVo && (voClips || []).length && !ducking) score -= 20;
  if (!musicPath) score -= 10;
  if (!accepted.length && (sfxClips || []).length) score -= 5;   // everything rejected
  // The user's explicit choice being ignored is the most serious defect this report can
  // find — it is the difference between the film they asked for and a different one.
  if (!voiceoverRespected) score -= 25;
  if (!duckingCorrect) score -= 12;
  if (noVoEnergy === false) score -= 10;
  // A profiled pack whose music came from the script query is a shortfall, not a fault:
  // the bed exists and plays, it just is not the template's own voice.
  if (profiled && musicPath && !musicFromTemplate) score -= 6;
  score = Math.max(0, Math.min(100, score));

  return {
    backgroundMusic: musicPath ? (String(musicMood || "").trim() || "unspecified mood") : null,
    soundEffects: accepted.length,
    sceneMatches: accepted.filter((a) => a.sceneId && sceneIds.has(a.sceneId)).length,
    voiceoverDucking: ducking,
    sfxDucking: sfxDucked,
    audioNormalization: Number.isFinite(voLufs),
    duplicateEffects: duplicates.reduce((s, d) => s + (d.count - 1), 0),
    qualityScore: round(score),
    // ---- flexible audio ----
    narration,                 // "on" | "off" — the mix this film was built as
    voiceoverRespected,        // the user's toggle produced the film they asked for
    duckingCorrect,            // ducking matches the mode (not merely "is on")
    noVoEnergy,                // null when narrated; else did the bed actually come forward
    musicSource,               // "template" | "script-fallback" | "none"
    musicFromTemplate,
    musicQuery: (musicSelection && musicSelection.query) || null,
    musicProvider: (musicSelection && musicSelection.provider) || null,
    // Whether the winning track was chosen by METADATA RANKING or was simply the first
    // usable hit. Only Freesound exposes duration/tags to rank on; stating which happened
    // keeps "we evaluate and select the best result" from over-claiming on the providers
    // where no such evaluation is possible.
    musicRanked: !!(musicSelection && musicSelection.ranked),
    templateAudio: profiled
      ? { mood: profile.mood, energy: profile.energy, tempo: profile.tempo, style: profile.style, keywords }
      : null,
    // Detail, for the Premiere panel and for debugging a film that sounds wrong.
    targets: {
      voLufs,
      musicSoloLufs: musicLufs,
      duckDb,
      midCarveDb: Number.isFinite(master.musicMidCarveDb) ? master.musicMidCarveDb : null,
      masterTruePeakDb: Number.isFinite(master.masterTruePeakDb) ? master.masterTruePeakDb : null,
    },
    accepted,
    rejected,
    issues,
    directorScore: (plan && plan.score) || null,
  };
}

module.exports = { buildAudioReport };
