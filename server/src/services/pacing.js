// THE PACING ENGINE — one source of truth for how DENSE a film is.
//
// HISTORY — this file used to be only the bottom third of itself.
//
// It began as the NO-VOICEOVER TEMPO TILT: tempoFor()/tempoOf() below, which
// exist because `job.voiceover_enabled` reached only the audio stage, so a
// music-only film held every shot as long as a narrated one and read as slow.
// That tilt was correct and is preserved here verbatim — but it was also DEAD:
// nothing in the pipeline ever wrote `storyboard.pacing`, so tempoOf() (its one
// caller, services/film_stage.js:54) always returned NEUTRAL.
//
// The mode engine above it now feeds that vocabulary instead of duplicating it
// (see tempoForPacing), so the tilt finally runs — and there is still exactly
// ONE place in the codebase that decides how fast a film moves.
//
// WHAT "PACE" MEANS HERE (read this before touching a number below)
//
// Pace is NOT playback speed. Nothing in this file ever speeds up a finished
// MP4, and nothing here makes the narrator talk faster — a sped-up read is the
// single most obvious tell of a fake "fast" video, and `speechRate` below is
// deliberately a constant of the VOICE, never a function of the mode.
//
// Pace is INFORMATION DENSITY at a FIXED runtime. The user still asks for a 60s
// film and still gets 60s. What the mode changes is what those 60 seconds are
// spent on:
//
//   faster  ->  fewer narrated words, more cuts, quicker entrances
//   slower  ->  more narrated words, fewer cuts, longer holds
//
// A "Fast" 60s film is not a "Normal" 60s film compressed; it is a film that was
// WRITTEN with less to say and MORE to show. That is why the mode has to reach
// all the way back to the script prompt — see wordBudget() — instead of being
// applied as a post-process. Everything downstream (scene lengths, motion
// timing, music energy) then follows from the same object.
//
// THE PRECEDENCE ORDER — when two of these fight, the earlier one wins:
//
//   1. READABILITY. A line that cannot be read is a bug at every pace.
//      minReadableSec() is a floor no mode may lower. If the copy does not fit
//      the time, the copy gets shorter — the reader never gets faster.
//   2. MEASURED NARRATION. A scene must contain the audio actually synthesized
//      for it (+ tail). We keep this cheap by making the script short enough up
//      front rather than by trimming audio afterwards.
//   3. THE PACED TARGET. scene.targetSec is an aspiration, not a contract.
//   4. TOTAL RUNTIME. Drift is absorbed by redistribution across scenes.
//
// EXTENDING THIS LATER (Cinematic / Storytelling / Social / Educational / ...)
// A mode is just a row in MODES. `multiplier` is the cut-rate/energy dial and
// `narrationDensity` is the how-talky dial, and they are INDEPENDENT — which is
// the whole point of keeping two numbers instead of one. A "Documentary" mode is
// low multiplier + high density (slow cuts, lots of narration); "Social" is high
// multiplier + low density (fast cuts, barely any words). Neither needs a code
// change outside this file.

// ---------------------------------------------------------------------------
// SPEECH — a property of the VOICE, never of the mode.
// ---------------------------------------------------------------------------

// Words a neutral English TTS voice speaks per second at its natural rate.
// This is the same 2.6 the script prompt and services/script.js have always
// used; it lives here now so there is ONE of it. It is a starting estimate:
// observedUtteranceCost() re-derives it from real synthesized audio, and the
// pacing report records both so the constant can be re-calibrated from data
// rather than from opinion.
//
// MEASURED AND KEPT. A least-squares fit over 15 shipped films
// (clipSec = 0.41 x words + 0.87) puts the MARGINAL rate at 2.42 w/s — 7% under
// this, well inside the report's tolerance. The rate was never the problem; see
// UTTERANCE_FIXED_SEC below for what was.
const BASE_SPEECH_RATE = 2.6;

// Seconds an utterance costs BEFORE its first word — and after its last.
//
// THE TERM THIS MODEL USED TO BE MISSING, and the reason paced films ran long.
//
// Narration time is not `words / rate`. Every synthesized line pays a fixed
// cost that does not scale with its length: onset before the first phoneme,
// final lengthening on the last syllable, and the terminal fall a TTS voice puts
// at the end of a sentence. Measured on the delivered mp3s, not asserted:
//
//   15 films, least squares   clipSec = 0.41 x words + 0.87
//   45 clips on disk, 3 words   2.41s actual vs 1.15s at a pure 2.6 w/s (2.1x)
//   45 clips on disk, 2 words   2.21s actual vs 0.77s (2.9x)
//
// ffmpeg silencedetect finds nothing at -45dB on these clips, so this is speech
// shape, not padding a trim pass could recover.
//
// WHY IT MATTERS MOST TO THIS FEATURE. Pace's own dial is MORE CUTS, so a faster
// mode spends the same runtime across more, shorter utterances — and multiplies
// exactly the term the old model omitted. A `very-fast` 90s film budgeted 136
// words, was handed a 3-words-per-scene ceiling, and shipped 61 words as 21
// identical three-word lines ("Agents take action." / "Meet the stack.").
//
// Held slightly under the fitted 0.87 because the budget is an editorial target
// and vo_fit tightens overruns at production time: erring toward a shade more
// narration is the recoverable direction.
const UTTERANCE_FIXED_SEC = 0.85;

// Below this a line is not worth speaking: at 4 words the fixed cost above is
// already ~47% of the clip, and under it the scene spends more time on the
// voice's onset and fall than on words. This is an EDITORIAL floor stated to the
// script model, not a validator gate — the fix for a scene that cannot hold four
// words is to give it no line at all and let the next scene carry the thought,
// which is what the pacing directive now asks for.
const MIN_UTTERANCE_WORDS = 4;

// The language scripts are AUTHORED in. Mirrors caption_lang.SOURCE_LANG —
// duplicated as a constant rather than imported so this module keeps requiring
// nothing (config.js requires it at boot, before most of the tree exists).
const SCRIPT_LANG = "en";

// Per-language speaking rate (words/sec).
//
// The WORD BUDGET always uses SCRIPT_LANG's rate, because the budget constrains
// the script the model writes and that script is English; the voiceover language
// only decides how the TRANSLATION is spoken, and its word count is not the one
// being budgeted. The other entries are carried as `voiceSpeechRate` so the
// report can compare an expectation against the takes that were really measured.
//
// Deliberately coarse — vo_fit measures the real take and tightens, so an
// imperfect estimate costs a retake at worst, never a broken film. Missing
// language -> BASE_SPEECH_RATE.
const SPEECH_RATE_BY_LANG = {
  en: 2.6,
  es: 2.7,   // fast syllable rate, low information per syllable
  pt: 2.6,
  fr: 2.5,
  de: 2.2,   // long compounds, fewer words for the same content
  hi: 2.3,
  ar: 2.3,
  ja: 2.9,   // short words, mora-timed
};

// ---------------------------------------------------------------------------
// READABILITY — floors that NO mode may lower. See precedence rule 1.
// ---------------------------------------------------------------------------

// Characters a viewer reads per second off a moving frame. 17 CPS is the
// broadcast subtitle standard for adults; display typography on a motion frame
// is read no faster, because the frame is also moving.
const READ_CHARS_PER_SEC = 17;
// Time to notice a line exists and start reading it, before any reading happens.
const READ_RECOGNITION_SEC = 0.45;
// A line under this never reads as text, only as a flash — regardless of length.
const READ_MIN_SEC = 0.9;
// Past this a single line is just sitting there; more time will not help it.
const READ_MAX_SEC = 4.0;

// ---------------------------------------------------------------------------
// VISUAL DENSITY — the SECOND axis. Pace shortens the NARRATION; it must not
// also empty the FRAME.
// ---------------------------------------------------------------------------
//
// THE BUG THIS EXISTS TO FIX. Measured across 39 shipped jobs in jobs.json:
//
//   pace        VO words/sec   on-screen words/sec   on-screen words/SCENE
//   relaxed        2.03              0.77                   3.29
//   normal         2.05              1.21                   4.05
//   fast           1.29              1.27                   4.17
//   very-fast      1.03              1.17                   3.39
//
// Narration density halves from relaxed to very-fast — that is the feature
// working. But the visual channel does NOT rise to take up the slack; per FRAME
// it FALLS. A shipped 90s very-fast film (job 2vs0z2cpkv) ran 39 scenes of 2.3s
// where a typical frame was the whole of:
//
//   VO "Start with brains."   on-screen "1. The Brain: LLM"
//
// while its own brief carried "LangGraph orchestrates reliable multi-step agents
// as graphs" and four more messages like it, none of which reached the screen.
// Total information delivered per second DROPPED ~30% at very-fast: the film
// said less AND showed less. "Fast" has to mean concise narration over a DENSE
// frame, not a near-empty one.
//
// WHY MORE TEXT IS NOT LESS READABLE. minSceneSec() below takes the MAX of the
// per-line floors, never their sum, because lines that share a frame are read
// CONCURRENTLY — that was already this engine's model. So the readable capacity
// of a frame is bounded by its LONGEST element, not by how many it carries. The
// density dial is therefore:
//
//   faster -> MORE elements, each SHORTER
//
// which is the one shape that raises information per frame while leaving
// precedence rule 1 completely untouched. A 2.3s very-fast frame can hold a
// 14-char kicker, a 31-char headline and three 22-char labels — six things to
// look at, every one of them inside its own readable floor — where today it
// holds three words.
//
// `elements` is the per-frame TARGET (kicker + headline + subtext + labels), and
// it RISES with pace. It replaces the old `maxOnScreenLines`, which fell with
// pace (4/4/3/3) and was the number the script prompt and the text director both
// read as a CAP — i.e. the mechanism that made a fast film thinner. At `normal`
// it is still 4, so the default film is untouched.
//
// The per-element LENGTH ceiling is not a mode constant: it is derived per scene
// from the readability floors by visualCapacity(), so it stays correct at any
// duration, and a mode can never argue a line into being unreadable.

// Longest a single on-screen element may be, as a fraction of what the scene's
// own readable ceiling allows. Held under 1 so an element lands comfortably
// inside its floor rather than exactly on it — a line that needs every
// millisecond of its scene is one retime away from being unreadable.
const VISUAL_LINE_SAFETY = 0.85;
// A display line under this many characters is a label, not a line. Floors the
// derived ceiling so even a 2s scene may carry real words.
const VISUAL_MIN_CHARS = 14;
// Past this an on-screen line stops being display typography and becomes a
// paragraph — the "wall of text" failure, which no amount of scene time fixes.
const VISUAL_MAX_CHARS = 120;
// Share of a scene's readable ceiling each ROLE may spend. The headline is the
// one thing that must land, so it gets the most; labels are scanned, not read,
// so they stay short at every pace.
const VISUAL_ROLE_SHARE = { kicker: 0.34, headline: 1.0, subtext: 0.9, bullet: 0.62 };

// ---------------------------------------------------------------------------
// ENGINE FLOORS — physical limits of the renderer/composers, not taste.
// ---------------------------------------------------------------------------

// services/pipeline.js clampSceneDur and the storyboard's [2,15] clamp. A scene
// under 2s cannot hold an entrance plus a hold plus an exit.
const SCENE_MIN_SEC = 2.0;
// The script/storyboard schema ceiling. Long-form needs the headroom.
const SCENE_MAX_SEC = 15.0;
// Under ~1.6s a beat reads as a flicker rather than a cut (omelette_adapter).
const BEAT_FLOOR_SEC = 1.6;
// The script prompt's authored default: ~one scene per 3.5s on a short film.
const SCENE_BASE_SEC = 3.5;
// Past this the film is long-form and earns its length from DEEPER scenes, not
// from more of them (system_script.md rule 2).
const LONGFORM_AT_SEC = 240;
// The scene-count ceiling the script prompt asks for on long films.
const LONGFORM_SCENE_CAP = 70;
// HOW MANY BEATS A VERTICAL FilmKit FILM MAY DRAW.
//
// A FilmKit skin declares its own authored length (`skin.maxScenes`, 18 on the article packs, 12 by
// library default). That number is the DECK's length — how many shapes the pack was designed around —
// and on a short film it is never the binding constraint. On a long one it is the only constraint:
// services/pipeline.js sceneCapFor hands it to resolve() as `rendererSceneCap`, and a 180s film capped
// at 18 scenes gets scenes of 180/18 = 10.0s. Measured on two finished 180s vertical jobs: eighteen
// clips of exactly 10.0s, each carrying a ~24-word block of narration over one motionless frame. The
// user had selected Very Fast — which asks for 2.33s scenes — and the cap silently overrode it 4x.
//
// A phone is the frame that carries a held shot worst, so vertical gets its own ceiling: enough beats
// that a 3-minute film still cuts every ~3s. LANDSCAPE IS DELIBERATELY UNCHANGED — a wide frame holds a
// shot far better, and the skins keep their authored deck length there.
//
// 60, not scene_fit's 72: at 72 a 180s film lands on 2.57s scenes whose narration ceiling is 5 words,
// and it collides with LONGFORM_SCENE_CAP anyway. 60 buys 3.0s scenes with a ~6-word line each.
// Past ~3.5 minutes the ceiling binds again (300s -> 5.0s, 600s -> 8.3s); reaching 3s there needs cuts
// INSIDE a narrated scene, which is what omelette_adapter.js partView does for the bundled templates.
const VERTICAL_FILM_SCENE_CAP = 60;

// ---------------------------------------------------------------------------
// THE MODES
// ---------------------------------------------------------------------------
//
// `multiplier`       cut-rate / energy dial. Scene target = base / multiplier.
// `narrationDensity` fraction of runtime carrying speech. THE word-budget dial.
//                    It sets BOTH how much runtime is speech and how many scenes
//                    carry a line, and the budget is what is left of the first
//                    after the second has paid UTTERANCE_FIXED_SEC each.
//
//                    A 60s film lands ~115 / 105 / 78 / 55 words across the four
//                    modes. Those numbers used to be ~144 / 140 / 111 / 90,
//                    matching bands the brief asked for — but those bands were
//                    written from the same model that omitted the per-utterance
//                    cost, and are not reachable: 140 words in 16 lines needs
//                    13.6s of onsets plus 53.8s of speech, i.e. 67s of a 60s
//                    film. The lower numbers are what a 60s film can actually
//                    say. Still DERIVED, so they stay correct at any duration
//                    and any voice.
// `voTailSec`        breathing room after a line before the scene may cut.
// `visual`           THE SECOND DENSITY DIAL, and the counterweight to the first.
//                    `elements` is how many text elements a FRAME should carry
//                    and it RISES with pace; `bullets` is the label-row share of
//                    that; `density` is the film-level multiplier the visual copy
//                    budget is scaled by. Independent of narrationDensity ON
//                    PURPOSE — see the VISUAL DENSITY block above. The per-element
//                    LENGTH ceiling is never a mode constant: visualCapacity()
//                    derives it from the scene's own readability floor.
// `motion`           differential animation scaling — see scaleTiming().
//                    Entrances and transitions carry the energy; ambient drift
//                    and camera do NOT scale, because a fast film whose camera
//                    is also frantic reads as chaotic instead of energetic.
//                    That contrast IS the design.
// `audio`            hints for the score. `energy` and `bpm` steer the audio
//                    director's PROMPT (audioDirection); `searchTerm` is a word
//                    added to the stock-music SEARCH on the graph path, which
//                    picks its bed inline and never calls that director.
//                    Empty at normal so the query is unchanged by default.
//
//                    There is deliberately NO music-volume term here. A mode
//                    should change what the bed IS, not how loud it is: the mix
//                    already clamps music to [0.06,0.16] under a voice, so a
//                    +/-0.02 nudge would be erased by the clamp on most films
//                    and would fight the ducking logic on the rest.
const MODES = {
  relaxed: {
    key: "relaxed",
    label: "Relaxed",
    blurb: "Room to breathe — longer holds, gentler motion, a fuller narration.",
    multiplier: 0.80,
    // 0.92, not the 0.95 this started at, and a 0.65s tail rather than 0.75s.
    //
    // WHY: retimeScenesToVo is a MONOTONE STRETCH (services/pipeline.js) — it
    // grows a scene to contain max(2, planned, measuredVO + tail) and can never
    // shrink one. So every narrated scene whose line plus tail exceeds its plan
    // pushes the whole film past the runtime the user asked for. More words on
    // FEWER, longer scenes is the worst combination for that, and at 0.95/0.75s
    // Relaxed projected ~18% long — worse than the ~15% the default already runs
    // (a known, documented overshoot: agents/graph.js notes a 30s request
    // delivering 33-34s). A mode this feature ADDS must not be sloppier about
    // runtime than the behaviour it inherited.
    //
    // It also reads truer. "Relaxed" is room to breathe, not more talking: the
    // mode's character is longer holds and fewer cuts, and buying that with a
    // fuller script is what made it overshoot. Still above normal's 0.90, so the
    // narration is genuinely fuller — just not at the cost of the clock.
    // Locked by the runtime-overshoot test in scripts/pacing.test.cjs.
    narrationDensity: 0.92,
    voTailSec: 0.65,
    // Longer holds mean each element may be FULLER, so relaxed carries the same
    // element count as normal and spends its extra scene time on longer lines
    // (visualCapacity derives that from the scene length, not from here).
    visual: { elements: 4, bullets: 3, density: 0.95 },
    motion: { entrance: 0.80, transition: 0.80, stagger: 0.85, ambient: 1.0, camera: 1.0 },
    audio: { energy: "calm", bpm: [70, 100], searchTerm: "calm" },
  },
  normal: {
    key: "normal",
    label: "Normal",
    blurb: "The balanced default — the pacing KEYFRAME has always produced.",
    multiplier: 1.00,
    narrationDensity: 0.90,
    voTailSec: 0.55,
    // IDENTITY. 4 elements / 3 bullets is exactly what `maxOnScreenLines: 4`
    // resolved to before this axis existed (the text director's cap was
    // maxOnScreenLines - 1), so the default film's copy budget is unchanged.
    visual: { elements: 4, bullets: 3, density: 1.0 },
    // IDENTITY. Every factor is exactly 1 and every prompt directive is empty, so
    // picking no pace contributes NOTHING: motion, scene sizing and the prompts
    // are what they were before this module existed. That is a test, not a hope —
    // see scripts/pacing.test.cjs.
    //
    // The one thing identity no longer covers is the WORD BUDGET, and on purpose.
    // It is computed from the shared model in resolve(), which now charges each
    // spoken line UTTERANCE_FIXED_SEC — a correction that had to reach `normal`
    // too, because default-pace films were the worst runtime overshooters in the
    // measured data (30s requested, 39.0s delivered). See the note at the top of
    // scripts/pacing.test.cjs.
    motion: { entrance: 1.0, transition: 1.0, stagger: 1.0, ambient: 1.0, camera: 1.0 },
    audio: { energy: "steady", bpm: [90, 120], searchTerm: "" },
  },
  fast: {
    key: "fast",
    label: "Fast",
    blurb: "Punchy — shorter narration, quicker cuts, sharper entrances.",
    multiplier: 1.25,
    narrationDensity: 0.71,
    voTailSec: 0.42,
    // The narration gave up ~20% of its words here (0.90 -> 0.71); the frame
    // takes that information back. One more element than normal, still three
    // labels, each one shorter because the scene is shorter — never fewer.
    visual: { elements: 5, bullets: 3, density: 1.30 },
    motion: { entrance: 1.28, transition: 1.32, stagger: 1.35, ambient: 1.0, camera: 1.06 },
    audio: { energy: "energetic", bpm: [115, 140], searchTerm: "energetic" },
  },
  "very-fast": {
    key: "very-fast",
    label: "Very Fast",
    blurb: "Maximum energy — minimal narration, rapid cuts, hard-hitting motion.",
    multiplier: 1.50,
    narrationDensity: 0.58,
    voTailSec: 0.34,
    // The densest frame in the system, and the one the old model emptied hardest.
    // Narration is down to 0.58 of runtime, so the picture carries the film: six
    // things to look at, four of them short scannable labels. Every one of them
    // is still length-checked against the scene's own readable floor.
    visual: { elements: 6, bullets: 4, density: 1.55 },
    motion: { entrance: 1.55, transition: 1.62, stagger: 1.7, ambient: 1.0, camera: 1.12 },
    audio: { energy: "high", bpm: [128, 160], searchTerm: "high energy" },
  },
};

const DEFAULT_MODE = "normal";

// Aliases the API accepts, so a client spelling it any reasonable way works.
// "1.0"/"1.25" are accepted because the UI labels the modes by multiplier.
const ALIASES = {
  slow: "relaxed", calm: "relaxed", "0.8": "relaxed", "0.8x": "relaxed",
  default: "normal", standard: "normal", balanced: "normal", "1": "normal", "1.0": "normal", "1x": "normal", "1.0x": "normal",
  quick: "fast", punchy: "fast", "1.25": "fast", "1.25x": "fast",
  veryfast: "very-fast", very_fast: "very-fast", "very fast": "very-fast",
  fastest: "very-fast", max: "very-fast", "1.5": "very-fast", "1.5x": "very-fast",
};

// Accept a mode key, a label, an alias, or a bare multiplier. Returns a
// canonical key, or null when the input is not a pace at all (so callers can
// tell "absent" from "invalid" and the route can 400 on the latter).
function normalizeMode(input) {
  if (input == null || input === "") return null;
  const raw = String(input).trim().toLowerCase();
  if (MODES[raw]) return raw;
  if (ALIASES[raw]) return ALIASES[raw];
  // A number that matches a mode's multiplier exactly (0.8 / 1 / 1.25 / 1.5).
  const n = Number(raw);
  if (Number.isFinite(n)) {
    const hit = Object.values(MODES).find((m) => Math.abs(m.multiplier - n) < 1e-9);
    if (hit) return hit.key;
  }
  return null;
}

function listModes() {
  return Object.values(MODES).map((m) => ({
    key: m.key, label: m.label, blurb: m.blurb, multiplier: m.multiplier,
    default: m.key === DEFAULT_MODE,
  }));
}

const r2 = (n) => Math.round(Number(n) * 100) / 100;
const r1 = (n) => Math.round(Number(n) * 10) / 10;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

// ---------------------------------------------------------------------------
// READABILITY
// ---------------------------------------------------------------------------

// The shortest time `text` may be on screen and still be readable.
//
// INDEPENDENT OF PACE ON PURPOSE. This is the floor precedence rule 1 protects:
// no mode may make a line less readable, so when a fast film cannot fit its copy
// the fix is LESS COPY, never a faster read. Callers enforce that by comparing
// this against the scene length and shortening the text.
function minReadableSec(text) {
  const chars = String(text == null ? "" : text).trim().length;
  if (!chars) return 0;
  return r2(clamp(READ_RECOGNITION_SEC + chars / READ_CHARS_PER_SEC, READ_MIN_SEC, READ_MAX_SEC));
}

// The floor for a whole scene: long enough for its longest line to be read.
// Lines are read CONCURRENTLY (they are on screen together), so this is the max
// of the per-line floors, not their sum — plus the engine's own 2s floor.
function minSceneSec(lines) {
  const arr = Array.isArray(lines) ? lines : [lines];
  const longest = arr.reduce((m, l) => Math.max(m, minReadableSec(l)), 0);
  return r2(Math.max(SCENE_MIN_SEC, longest));
}

// Does this scene's copy fit its time? The QA gate and the text director both
// ask this. `over` is how many seconds short we are, so a caller can decide
// between lengthening the scene and cutting words.
function checkReadability(lines, sceneSec) {
  const need = minSceneSec(lines);
  const have = Number(sceneSec) || 0;
  return { ok: have + 0.05 >= need, need, have: r2(have), over: r2(Math.max(0, need - have)) };
}

// ---------------------------------------------------------------------------
// VISUAL CAPACITY — how much copy a frame of this length can actually hold.
// ---------------------------------------------------------------------------

/**
 * THE FIT ORACLE. Answers "how many elements, and how long may each one be, on a
 * scene of `sceneSec` at this pace" — the question a content-density system has
 * to ask before it puts a word on screen, and the one nothing in the pipeline
 * could answer before.
 *
 * It is the INVERSE of minReadableSec(): that turns a line into the time it
 * needs, this turns the time available into the line it will take. The two are
 * checked against each other by scripts/pacing.test.cjs, so a line built to this
 * ceiling can never fail that floor.
 *
 * COUNT comes from the mode; LENGTH comes from the clock. That split is the
 * whole design: a fast film gets MORE elements (the mode says so) that are each
 * SHORTER (the clock says so), and the total information on the frame goes UP
 * while every individual line stays inside the readability floor no mode may
 * lower.
 *
 * Template-agnostic on purpose — it knows about time and characters, not about
 * packs, orientations or layouts. A 9:16 frame and a 16:9 frame of the same
 * duration have the same READING capacity; how many of these elements a given
 * template chooses to lay out is the composer's business, and every composer
 * already clips to its own slot widths.
 *
 * @param {object} pacing   a resolved pacing config (or anything carrying
 *                          `.readability`; missing values fall back to the
 *                          module floors, so it is safe to call with `null`).
 * @param {number} sceneSec the scene's own length — ALWAYS prefer the real,
 *                          retimed duration over the mode's target.
 * @returns {{sceneSec:number, maxChars:number, maxElements:number, bullets:number,
 *            roles:{kicker:number, headline:number, subtext:number, bullet:number}}}
 */
function visualCapacity(pacing, sceneSec) {
  const R = (pacing && pacing.readability) || {};
  const cps = Number(R.charsPerSec) > 0 ? Number(R.charsPerSec) : READ_CHARS_PER_SEC;
  const recog = Number.isFinite(Number(R.recognitionSec)) ? Number(R.recognitionSec) : READ_RECOGNITION_SEC;
  const maxSec = Number(R.maxSec) > 0 ? Number(R.maxSec) : READ_MAX_SEC;

  // A scene never earns reading time past READ_MAX_SEC — beyond that the line is
  // just sitting there (the same ceiling minReadableSec() clamps to), so a
  // long-form 9s scene does not get to carry a 140-character paragraph.
  const sec = clamp(Number(sceneSec) || SCENE_MIN_SEC, SCENE_MIN_SEC, maxSec);
  const readable = Math.max(0, sec - recog) * cps * VISUAL_LINE_SAFETY;
  const maxChars = Math.round(clamp(readable, VISUAL_MIN_CHARS, VISUAL_MAX_CHARS));

  const T = (pacing && pacing.text) || {};
  const maxElements = Math.max(2, Math.round(Number(T.elementsPerScene) || MODES[DEFAULT_MODE].visual.elements));
  const bullets = Math.max(1, Math.round(Number(T.bulletsPerScene) || MODES[DEFAULT_MODE].visual.bullets));

  const role = (share) => Math.round(clamp(maxChars * share, VISUAL_MIN_CHARS, VISUAL_MAX_CHARS));
  return {
    sceneSec: r2(sec),
    maxChars,
    maxElements,
    bullets,
    roles: {
      kicker: Math.min(role(VISUAL_ROLE_SHARE.kicker), 18),   // the chip's own hard width
      headline: role(VISUAL_ROLE_SHARE.headline),
      subtext: role(VISUAL_ROLE_SHARE.subtext),
      bullet: role(VISUAL_ROLE_SHARE.bullet),
    },
  };
}

/**
 * Clip one line to what its role can hold on a scene of this length, on a WORD
 * boundary. The one function every producer of on-screen copy should route
 * through, so "readable" is enforced in a single place rather than re-derived
 * (and re-approximated) by each director.
 *
 * NEVER CUTS INSIDE A WORD. A hard slice is how "LangGraph orchestrates
 * reliable multi-step agents" became the on-screen line "LangGraph orchest",
 * which reads as a rendering bug rather than an edit — and a viewer cannot tell
 * the difference between a truncated line and a broken renderer. So when the
 * text cannot reach the ceiling on a word boundary this returns "" and the
 * caller drops the element (or condenses it first and asks again). An empty slot
 * is a smaller defect than a mangled one.
 */
function fitVisualLine(text, sceneSec, role = "bullet", pacing = null) {
  const t = String(text == null ? "" : text).replace(/\s+/g, " ").trim();
  if (!t) return "";
  const cap = visualCapacity(pacing, sceneSec);
  const n = cap.roles[role] != null ? cap.roles[role] : cap.maxChars;
  if (t.length <= n) return t;
  const cut = t.slice(0, n + 1);
  const sp = cut.lastIndexOf(" ");
  if (sp <= 0) return "";                       // one word, longer than the slot
  const out = cut.slice(0, sp).replace(/[\s,;:.–—-]+$/, "");
  // A clip that leaves less than half the slot is a stub, not a label — and a
  // fragment that short has usually lost the noun that made it worth showing.
  return out.length >= Math.max(3, n * 0.5) ? out : "";
}

// ---------------------------------------------------------------------------
// RESOLVE — build the one object every subsystem reads.
// ---------------------------------------------------------------------------

/**
 * @param {string|object} mode  a mode key/alias, or an already-resolved pacing
 *                              object (re-resolving one is a no-op, so callers
 *                              can pass whatever they were handed).
 * @param {object} opts
 *   durationSec      the film's target runtime — scene sizing is duration-aware
 *                    because long-form earns its length from deeper scenes.
 *   voiceover        false -> a music-led film; the word budget is 0 and pace
 *                    expresses itself through cuts, motion and music only.
 *   language         voiceover language code, for the speech rate.
 *   speechRate       measured override (see observedSpeechRate) — wins over the
 *                    language table, which is only an estimate.
 *   orientation      "vertical" cuts a little quicker; a phone carries a held
 *                    frame far worse than a wide one does (omelette_adapter).
 */
function resolve(mode, opts = {}) {
  // Idempotent: handed an already-resolved object, re-resolve from its mode so
  // a value that has been through the graph state can be safely re-derived.
  if (mode && typeof mode === "object" && mode.v === 1 && mode.mode) {
    if (opts.durationSec == null) return mode;
    mode = mode.mode;
  }

  const key = normalizeMode(mode) || DEFAULT_MODE;
  const M = MODES[key];
  const durationSec = Math.max(1, Number(opts.durationSec) || 30);
  const voiceover = opts.voiceover !== false;
  const lang = String(opts.language || "en").toLowerCase();
  const vertical = String(opts.orientation || "") === "vertical";

  // TWO RATES, because two different languages are involved.
  //
  // The BUDGET constrains a script the model writes in the AUTHORING language,
  // which is English today (caption_lang.SOURCE_LANG) — translation to the
  // voiceover language happens later, in the Localization Director. Counting
  // ENGLISH words at, say, Hindi's 2.3 w/s was wrong twice over: those words are
  // not the ones that get spoken, and their count is not the translated count.
  // So the budget uses the authoring rate, and the VOICE's own rate is carried
  // separately for the report to reason about the delivered audio.
  //
  // An explicitly MEASURED rate always wins — it is the real thing, observed.
  const authoringRate = SPEECH_RATE_BY_LANG[SCRIPT_LANG] || BASE_SPEECH_RATE;
  const voiceRate = SPEECH_RATE_BY_LANG[lang] || BASE_SPEECH_RATE;
  const speechRate = Number(opts.speechRate) > 0 ? Number(opts.speechRate) : authoringRate;

  // ---- scene sizing -------------------------------------------------------
  // Base scene length is duration-aware BEFORE pace touches it: a 600s film is
  // authored at ~8.6s a scene (600/70), not at 3.5s, or it would want 170 scenes
  // and blow the schema cap. Pace then scales that base.
  const baseSceneSec = durationSec > LONGFORM_AT_SEC
    ? durationSec / LONGFORM_SCENE_CAP
    : SCENE_BASE_SEC;
  let sceneTargetSec = baseSceneSec / M.multiplier;

  // A faster pace wants more scenes, but the schema caps the list. Past the cap
  // the extra cuts simply cannot exist, so the target is walked back to what the
  // cap allows and `cutRateCapped` records that the mode was not fully honoured
  // — pace then lives in motion and narration density instead. Reported, never
  // silent: a capped film that claimed its mode would be a lie in the QA report.
  const wantScenes = Math.max(2, Math.round(durationSec / sceneTargetSec));
  // THE RENDERER'S OWN CEILING, when the caller knows which pack will draw the
  // film (services/pipeline.js sceneCapFor: 50 for omelette, a FilmKit skin's
  // own `maxScenes` — commonly 12 — for film-*, else 72).
  //
  // Without it this planned against a 70-scene ceiling the renderer does not
  // have, and foldScriptToRenderer merged the overflow afterwards. Folding keeps
  // every word, but merged scenes SHARE ONE NARRATION CLIP — so the film was
  // authored with lines the cut could never give their own beat, and
  // `cutRateCapped` reported "not capped" about a film that was about to be.
  //
  // Passed in as a number rather than looked up: services/pipeline.js already
  // requires this module, so reaching back for sceneCapFor would be a cycle.
  const rendererCap = Number(opts.rendererSceneCap) > 0 ? Math.floor(opts.rendererSceneCap) : Infinity;
  const maxScenes = Math.min(LONGFORM_SCENE_CAP, rendererCap, Math.floor(durationSec / SCENE_MIN_SEC));
  const sceneCount = Math.max(2, Math.min(wantScenes, maxScenes));
  const cutRateCapped = wantScenes > maxScenes;
  // RE-DERIVE THE TARGET FROM THE COUNT WE ACTUALLY LANDED ON — always, not only
  // when the cap bit. The count is clamped at BOTH ends, and the floor of 2 bites
  // on very short films: a 5s Normal film wants round(5/3.5) = 1 scene, gets
  // floored to 2, and then advertised `2 scenes @ 3.5s` — a 7s plan for a 5s
  // film. The script prompt prints both numbers, so the model was being handed
  // a target that does not add up to its own runtime.
  //
  // The `count` is the honest quantity (it is bounded by real engine limits);
  // targetSec is the derived one, so targetSec yields to it.
  sceneTargetSec = durationSec / sceneCount;

  sceneTargetSec = r2(clamp(sceneTargetSec, SCENE_MIN_SEC, SCENE_MAX_SEC));

  // The aspirational per-scene ceiling — tighter than the schema's hard 15s so a
  // fast film does not sit on one frame. Long-form keeps the full headroom.
  const sceneMaxSec = r2(clamp(
    durationSec > LONGFORM_AT_SEC ? SCENE_MAX_SEC : sceneTargetSec * 1.8,
    SCENE_MIN_SEC, SCENE_MAX_SEC
  ));

  // ---- the word budget ----------------------------------------------------
  //
  // narrationSec = the runtime given to speech. Of that, each narrated scene
  // spends UTTERANCE_FIXED_SEC on its own onset and terminal fall before a
  // single word is said; only what is LEFT converts to words at `speechRate`.
  //
  //   wordBudget = (durationSec x density - narratedScenes x fixed) x rate
  //
  // This used to be `durationSec x rate x density`, which is that formula with
  // the fixed term deleted — and deleting it is why paced films overshot by
  // +12.2% on average across 19 shipped reports. The old total was not merely
  // optimistic, it was UNSPENDABLE: the per-scene ceiling could not reach it in
  // 27 of 28 mode x duration combinations, so the model obeyed the ceiling (the
  // concrete number) and delivered as little as 45% of its stated budget.
  //
  // narratedScenes rounds UP so the overhead is never understated; a film with
  // more silent beats than this simply comes in under budget, which is the safe
  // direction. Voiceover off -> zero, and the film is carried by picture.
  const narratedScenes = voiceover
    ? Math.min(sceneCount, Math.max(1, Math.ceil(sceneCount * M.narrationDensity)))
    : 0;
  const narrationSec = durationSec * M.narrationDensity;
  const wordBudget = voiceover
    ? Math.max(0, Math.round((narrationSec - narratedScenes * UTTERANCE_FIXED_SEC) * speechRate))
    : 0;

  return {
    v: 1,
    mode: key,
    label: M.label,
    blurb: M.blurb,
    multiplier: M.multiplier,

    // context this was resolved against — kept so a consumer can tell whether
    // the object it holds was built for the film it is looking at.
    targetDurationSec: r2(durationSec),
    orientation: opts.orientation || null,
    language: lang,
    voiceover,

    // narration
    // The rate the WORD BUDGET is computed at — the authoring language's, or a
    // measured one when the caller has real audio to go on.
    speechRate: r2(speechRate),
    speechRateSource: Number(opts.speechRate) > 0 ? "measured" : "authoring",
    // The rate the film will actually be SPOKEN at. Equal to speechRate for an
    // English-voiced film; different when the film is dubbed. Carried for the
    // report, which compares it against what the takes really measured — that
    // comparison is how these estimates get re-tuned from data.
    voiceSpeechRate: r2(voiceRate),
    narrationDensity: M.narrationDensity,
    wordBudget,
    // How many of `scene.count` are expected to carry a line. The budget is
    // charged UTTERANCE_FIXED_SEC for each of them, so it is part of the budget's
    // derivation rather than a display value — the directive states it, and the
    // report needs it to say whether the film used the shape it was budgeted.
    narratedSceneCount: narratedScenes,
    utteranceFixedSec: UTTERANCE_FIXED_SEC,

    // scenes
    scene: {
      targetSec: sceneTargetSec,
      minSec: SCENE_MIN_SEC,
      maxSec: sceneMaxSec,
      hardMaxSec: SCENE_MAX_SEC,
      count: sceneCount,
      cutRateCapped,
      // WHICH ceiling bit, so the disclosure can say something actionable
      // instead of just "capped". null when nothing capped the mode.
      cutRateCappedBy: !cutRateCapped ? null
        : (rendererCap <= LONGFORM_SCENE_CAP && rendererCap <= Math.floor(durationSec / SCENE_MIN_SEC) ? "renderer"
          : (LONGFORM_SCENE_CAP <= Math.floor(durationSec / SCENE_MIN_SEC) ? "scene-ceiling" : "min-scene-length")),
      rendererSceneCap: Number.isFinite(rendererCap) ? rendererCap : null,
      // storyboard.expandToCover's editorial "split anything projected longer
      // than this" bar. Its 8.5s default is a NORMAL-pace number for long films;
      // scaling it is what makes a fast long-form film actually cut more.
      storyboardPaceSec: r2(clamp(8.5 / M.multiplier, 3.0, 12.0)),
      // omelette_adapter's per-beat target. Vertical already caps at 3s there;
      // pace tightens it further but never below the flicker floor.
      beatTargetSec: r2(Math.max(BEAT_FLOOR_SEC, (vertical ? 3.0 : 4.0) / M.multiplier)),
      beatFloorSec: BEAT_FLOOR_SEC,
    },

    // voiceover fitting
    vo: {
      tailSec: M.voTailSec,
      // vo_fit tightens (LLM rewrite) above this, which is what we WANT to
      // happen rather than atempo — the rewrite keeps the read natural.
      tightenAbove: 1.10,
      // and only speeds/trims past this. Unchanged by mode: these are quality
      // floors for the VOICE, and the mode has no business lowering them.
      hardCapRatio: 1.25,
      maxAtempo: 1.18,
    },

    // motion — consumed by scaleTiming()
    motion: { ...M.motion },

    // readability floors (constant across modes — precedence rule 1)
    readability: {
      charsPerSec: READ_CHARS_PER_SEC,
      recognitionSec: READ_RECOGNITION_SEC,
      minSec: READ_MIN_SEC,
      maxSec: READ_MAX_SEC,
    },

    // ON-SCREEN COPY — the visual channel's own budget.
    //
    // This used to be one number, `maxOnScreenLines`, that FELL as pace rose
    // (4/4/3/3) and was read as a cap by both the script prompt and the text
    // director. That is the mechanism that emptied fast frames; see the VISUAL
    // DENSITY block at the top. It now RISES, and the length ceilings that keep
    // it readable are derived per scene instead of asserted per mode.
    //
    // `maxOnScreenLines` is kept as the same-named alias so every existing
    // consumer keeps working unchanged — at `normal` it is still 4.
    text: {
      maxOnScreenLines: M.visual.elements,
      // Elements a frame should carry: kicker + headline + subtext + labels.
      elementsPerScene: M.visual.elements,
      // How many of those are label/bullet slots.
      bulletsPerScene: M.visual.bullets,
      // Relative visual information per second, against normal = 1.0.
      density: M.visual.density,
      // Longest a single element of each role may be in a TARGET-LENGTH scene.
      // Derived from the readability floors, so no mode can argue a line into
      // being unreadable. Per-scene values come from visualCapacity().
      ...(() => {
        const cap = visualCapacity({ scene: { targetSec: sceneTargetSec }, readability: {
          charsPerSec: READ_CHARS_PER_SEC, recognitionSec: READ_RECOGNITION_SEC,
          minSec: READ_MIN_SEC, maxSec: READ_MAX_SEC,
        } }, sceneTargetSec);
        return {
          maxElementChars: cap.maxChars,
          maxHeadlineChars: cap.roles.headline,
          maxSubtextChars: cap.roles.subtext,
          maxBulletChars: cap.roles.bullet,
          maxKickerChars: cap.roles.kicker,
        };
      })(),
      // FILM-LEVEL VISUAL COPY BUDGET, the counterpart of `wordBudget`.
      //
      // Derived exactly like the word budget is — from the shape of the film
      // rather than asserted — so it stays right at any duration: every scene
      // carries `elements` items averaging half their own length ceiling.
      //
      // It is a TARGET, not a cap: the per-element readability ceiling is the
      // thing that actually binds, and this number exists so the report can say
      // whether a film used the frame it was given.
      charBudget: Math.round(
        sceneCount * M.visual.elements
        * Math.max(VISUAL_MIN_CHARS, Math.min(VISUAL_MAX_CHARS,
            (sceneTargetSec - READ_RECOGNITION_SEC) * READ_CHARS_PER_SEC * VISUAL_LINE_SAFETY)) * 0.5
      ),
    },

    // Deep enough: `bpm` is a nested ARRAY, and a shallow spread would hand every
    // job in the process the SAME array instance out of the module table. Nothing
    // mutates it today, which is exactly the kind of thing that stops being true
    // quietly.
    audio: { ...M.audio, bpm: [...M.audio.bpm] },
  };
}

// The pacing every pre-pacing film was implicitly built at.
function defaults(opts = {}) { return resolve(DEFAULT_MODE, opts); }

// ---------------------------------------------------------------------------
// MOTION — differential timing scale.
// ---------------------------------------------------------------------------

// Which TIMING keys are TIME (scale them) and which are SPACE or CHARACTER
// (never scale them). Getting this wrong is how a fast film starts looking
// cheap: shrinking `textRise` makes the motion smaller, not faster, and touching
// an ease changes the film's whole personality.
//
// AMBIENT AND CAMERA DELIBERATELY DO NOT SCALE (their factors are 1.0 in every
// mode). Fast entrances against an unhurried camera is the contrast that makes a
// quick film read as *composed*; scaling everything equally is exactly the
// "artificially accelerated" look the feature exists to avoid.
const TIMING_SCALE_KEYS = {
  textDur: "entrance",
  textStagger: "stagger",
  cardDur: "entrance",
  transDur: "transition",
  overlap: "transition",
  idleCycle: "ambient",
  sweepEvery: "ambient",
  camPush: "camera",
};

/**
 * Scale a motion_presets TIMING table for a pace. Returns a NEW object — never
 * mutates the shared table, because two jobs render concurrently
 * (config.server.jobConcurrency) and a mutated module-level table would leak one
 * film's pace into the other's frames.
 *
 * Durations DIVIDE by their factor (a bigger factor = quicker motion); `camPush`
 * is a DISTANCE (6% of frame) so it MULTIPLIES — a faster film pushes a little
 * further in the same beat rather than covering less ground.
 */
function scaleTiming(TIMING, pacing) {
  const p = (pacing && pacing.motion) ? pacing.motion : MODES[DEFAULT_MODE].motion;
  const out = { ...TIMING };
  for (const [key, factorName] of Object.entries(TIMING_SCALE_KEYS)) {
    if (typeof TIMING[key] !== "number") continue;
    const f = Number(p[factorName]) || 1;
    if (f === 1) continue;                       // identity stays byte-identical
    out[key] = key === "camPush"
      ? Math.round(TIMING[key] * f * 10000) / 10000
      : Math.round((TIMING[key] / f) * 1000) / 1000;
  }
  return out;
}

// ---------------------------------------------------------------------------
// SCRIPT-SIDE HELPERS
// ---------------------------------------------------------------------------

// Words that fit in `sceneSec` at this pace. Used by the script validator's
// per-scene warning and by the prompt's word-ceiling table, so the model is
// told the same rule it will be judged against.
// What ONE narrated scene of this length can hold.
//
// Two changes from the version that shipped with this feature, both forced by
// the same measurement (see UTTERANCE_FIXED_SEC):
//
// 1. The fixed cost is SUBTRACTED before words are counted, instead of the whole
//    scene converting at `rate`. A 2.31s Very Fast scene does not hold 2.31s of
//    speech; it holds 2.31 - 0.85 = 1.46s of it.
// 2. `narrationDensity` is GONE from here. Silence is budgeted once, as whole
//    silent scenes (resolve()'s narratedScenes) — charging it again inside every
//    narrated scene was double-counting, and it is what pushed the ceiling below
//    the budget's own per-scene share.
//
// And it rounds UP, not down. This is a CEILING: rounding it down forbids a line
// the film-level budget has already paid for, and flooring a per-scene value and
// then multiplying it by the scene count is precisely how 27 of 28 mode/duration
// pairs ended up advertising a total no script could legally reach.
//
// The invariant that ties the two together — ceiling(targetSec) x narratedScenes
// >= wordBudget, at every mode and duration — is locked by scripts/pacing.test.cjs.
function sceneWordCeiling(pacing, sceneSec) {
  const rate = (pacing && pacing.speechRate) || BASE_SPEECH_RATE;
  const fixed = (pacing && Number(pacing.utteranceFixedSec)) || UTTERANCE_FIXED_SEC;
  const speakable = (Number(sceneSec) || 0) - fixed;
  return Math.max(1, Math.ceil(speakable * rate));
}

// The word-ceiling table the script prompt shows the model, built from THIS
// film's pace so the prompt can never drift from the validator.
function wordCeilingTable(pacing) {
  // CENTRED ON THE SCENE LENGTH THIS FILM WILL ACTUALLY USE, not anchored to the
  // engine's 2s floor. Anchoring to the floor and spanning 4s produced a 2-6s
  // table for a long-form film whose scenes are ~8.6s — every row was below the
  // shortest scene the model was being asked to write, so the one part of the
  // directive with concrete numbers in it was useless exactly where the budget
  // is hardest to hit.
  const target = pacing.scene.targetSec;
  const lo = Math.max(pacing.scene.minSec, r1(target * 0.7));
  const hi = Math.min(pacing.scene.hardMaxSec, Math.max(lo + 1, r1(target * 1.4)));
  // Five rows across the band, whatever the band's width — a long-form table
  // steps in ~2.4s, a short-form one in ~0.5s, and both stay readable.
  const steps = [];
  const n = 5;
  for (let i = 0; i < n; i++) steps.push(r1(lo + ((hi - lo) * i) / (n - 1)));
  return [...new Set(steps)].map((s) => ({ sceneSec: s, maxWords: sceneWordCeiling(pacing, s) }));
}

// The block injected into the script prompt. This is the ONLY place the model is
// told about pace, and it is generated from the same object the validator uses —
// so "the prompt said 110 words and the validator wanted 90" cannot happen.
function scriptDirective(pacing) {
  if (!pacing || pacing.mode === DEFAULT_MODE) {
    // Normal is the prompt's own authored default, and system_script.md's VO-fit
    // table is now built from sceneWordCeiling() — the SAME function this
    // directive's table comes from, checked against it by scripts/pacing.test.cjs.
    // So at the default there is genuinely nothing to add: the base prompt
    // already states the model. Saying it twice would only give the model two
    // tables to reconcile.
    return "";
  }
  const t = wordCeilingTable(pacing);
  const rows = t.map((x) => `   | ${x.sceneSec}s | ~${x.maxWords} |`).join("\n");
  const faster = pacing.multiplier > 1;
  return [
    "",
    `## PACING DIRECTIVE — ${pacing.label.toUpperCase()} (${pacing.multiplier}x)`,
    "",
    "This OVERRIDES the scene-length and VO-word guidance in the sections above.",
    "The runtime is unchanged; what changes is how much is said and how often we cut.",
    "",
    `- TOTAL VOICEOVER BUDGET: **${pacing.wordBudget} words** across the whole film`,
    `  (${pacing.targetDurationSec}s x ${pacing.narrationDensity} narrated = ${r1(pacing.targetDurationSec * pacing.narrationDensity)}s of speech,`,
    `  minus ${pacing.narratedSceneCount} x ${pacing.utteranceFixedSec}s that each spoken line spends on its own`,
    `  opening and closing, at ${pacing.speechRate} words/sec).`,
    `  Sum every scene's \`voiceover\` — the total must land at or under this. This is the hard one.`,
    `- SCENE COUNT: about **${pacing.scene.count} scenes**, averaging **${pacing.scene.targetSec}s** each`,
    `  (min ${pacing.scene.minSec}s, keep under ~${pacing.scene.maxSec}s).`,
    `- ABOUT **${pacing.narratedSceneCount}** of those scenes speak; the other ${Math.max(0, pacing.scene.count - pacing.narratedSceneCount)} carry picture and type alone.`,
    `- PER-SCENE VO CEILING at this pace:`,
    "",
    "   | Scene length | Max VO words |",
    "   |---|---|",
    rows,
    "",
    faster
      ? [
          `This is a ${pacing.label.toLowerCase()} cut. Say LESS and SHOW MORE — that is the whole brief.`,
          "Protect, in this order: (1) the main message, (2) product facts and numbers from",
          "`mustIncludeFacts`, (3) the key benefit, (4) the CTA. Cut, in this order: repetition,",
          "explanation of something already shown, long wind-ups, connective filler, and any",
          "sentence that restates the previous one.",
          "",
          "Do NOT compress by deleting whole beats at random or by writing telegraphic fragments —",
          "the line still has to sound like a person talking. Write the SHORTER SENTENCE, not the",
          "clipped one: \"Tax-ready in seconds.\" beats \"It is ready for tax in just seconds.\"",
          "A scene may carry NO voiceover at all (`\"\"`) and land on picture and on-screen type",
          `alone — at this pace that is a good beat, not a missing one. Aim for roughly ${Math.max(0, pacing.scene.count - pacing.narratedSceneCount)} of them.`,
          "",
          "SPEND THE BUDGET ON FEWER, FULLER LINES — never spread it thin across every scene.",
          `A spoken line costs ~${pacing.utteranceFixedSec}s of onset and terminal fall before its first word,`,
          "so a two- or three-word line spends most of its scene not speaking, and a run of them",
          "reads as a stuttering list rather than a script. If a scene cannot carry a line of at",
          `least ${MIN_UTTERANCE_WORDS} words, give it NO line and let the next one say the whole thought.`,
          "",
          "SAYING LESS IS NOT SHOWING LESS. The narration gets shorter; the FRAME gets",
          `DENSER. Write MORE \`onScreenText\`, not less — about ${pacing.text.elementsPerScene} short lines per scene, each`,
          `at most ~${pacing.text.maxElementChars} characters so it can be read inside a ${pacing.scene.targetSec}s frame. Short lines`,
          "sharing a frame are read at the same time, so several of them cost no more",
          "reading time than one — what makes a line unreadable is its LENGTH, never how",
          "many other lines are beside it.",
          "",
          "Give each scene a HIERARCHY rather than one floating line: the idea, then the",
          "fact or number that proves it, then one or two scannable labels. Pull those",
          "from `keyMessages` and `mustIncludeFacts` — the words the brief already gave",
          "you and the narration no longer has room to speak. Never invent a fact, and",
          "never print the voiceover line on screen: the frame carries what the voice",
          "does NOT have time to say.",
        ].join("\n")
      : [
          "This is a relaxed cut. There is room to let ideas land — a fuller narration, longer",
          "holds, and scenes that finish their thought rather than cutting away from it.",
          "Use the extra words on clarity and warmth, not on repetition or padding.",
          "",
          `The frame still has to carry its own weight: about ${pacing.text.elementsPerScene} \`onScreenText\` lines per scene,`,
          `up to ~${pacing.text.maxElementChars} characters each (the longer holds buy longer lines, not fewer). Give each`,
          "scene a hierarchy — the idea, the fact or number that proves it, then a label or",
          "two — drawn from `keyMessages` and `mustIncludeFacts`. Never print the voiceover",
          "line on screen; the frame shows what the voice does not say.",
        ].join("\n"),
    "",
  ].join("\n");
}

// The same instruction, one line, for prompts that only have room for a hint
// (storyboard, text director, composer).
function shortDirective(pacing) {
  if (!pacing || pacing.mode === DEFAULT_MODE) return "";
  return `Pacing: ${pacing.label} (${pacing.multiplier}x) — about ${pacing.scene.count} scenes averaging ${pacing.scene.targetSec}s`
    + (pacing.voiceover ? `, total voiceover budget ${pacing.wordBudget} words` : ", no voiceover (picture and music carry it)")
    + `, ${pacing.multiplier > 1 ? "tight and energetic" : pacing.multiplier < 1 ? "unhurried, let beats land" : "balanced"}.`;
}

/**
 * THE VISUAL DENSITY DIRECTIVE — the frame's brief, for every prompt that writes
 * on-screen copy (storyboard, text director, composer).
 *
 * Deliberately NOT empty at the default. scriptDirective/shortDirective/
 * audioDirection all return "" at `normal` so a default-pace film's prompts stay
 * byte-identical to the pre-pacing ones — that identity is a locked test. This
 * directive is a different thing: it is not a statement about PACE, it is the
 * frame's copy contract, and a normal-pace film was being under-filled too
 * (measured: 4.05 on-screen words per scene, against slots for four elements).
 *
 * Callers that must preserve prompt identity at the default should gate on the
 * mode themselves; callers that want a well-filled frame should always send it.
 *
 * @param {object} pacing   resolved config
 * @param {object} opts     .sceneSec  size the ceilings against a specific scene
 *                          .compact   one-line form, for prompts with no room
 */
function visualDirective(pacing, opts = {}) {
  if (!pacing || !pacing.text) return "";
  const sec = Number(opts.sceneSec) > 0 ? Number(opts.sceneSec) : pacing.scene.targetSec;
  const cap = visualCapacity(pacing, sec);
  const n = cap.maxElements;

  if (opts.compact) {
    return `On-screen copy: ~${n} elements per scene (kicker + headline + support + ${cap.bullets} labels), `
      + `no element over ~${cap.maxChars} characters so it reads inside a ${r1(sec)}s frame.`;
  }
  return [
    "",
    "## ON-SCREEN COPY BUDGET",
    "",
    `Every scene carries about **${n} text elements**, not one line:`,
    `- \`kicker\`   — a label, ≤${cap.roles.kicker} chars`,
    `- \`headline\` — the scene's one idea, ≤${cap.roles.headline} chars`,
    `- \`subtext\`  — the fact, number or mechanism that PROVES the headline, ≤${cap.roles.subtext} chars`,
    `- \`bullets\`  — ${cap.bullets} scannable labels, ≤${cap.roles.bullet} chars each`,
    "",
    `These share one ${r1(sec)}s frame and are read AT THE SAME TIME, so ${n} short lines cost no`,
    "more reading time than one — length is what makes a line unreadable, never count.",
    "Stay inside the character ceilings and the frame is dense AND readable.",
    "",
    "The frame is not the narration. It carries what the voice does NOT have time to",
    "say: the numbers, the feature names, the proof points, the labels. Mine those from",
    "`keyMessages` and `mustIncludeFacts`. Never restate the voiceover line on screen,",
    "and never invent a fact the brief did not supply.",
    "",
  ].join("\n");
}

// Music/SFX direction for the audio planner.
function audioDirection(pacing) {
  // Empty at the default, exactly like scriptDirective and shortDirective: a
  // normal-pace film's audio prompt must be byte-identical to the pre-feature
  // one. This guard used to test only `!pacing`, so the default mode still
  // appended a paragraph telling the model the film was "steady, 90-120 BPM".
  if (!pacing || pacing.mode === DEFAULT_MODE) return "";
  const [lo, hi] = pacing.audio.bpm;
  return `Pacing is ${pacing.label} (${pacing.multiplier.toFixed(2)}x) and the film's energy is ${pacing.audio.energy}. `
    + `Pick a bed around ${lo}-${hi} BPM that carries that energy. `
    + (pacing.voiceover
        ? "The narration still has to sit clearly on top — energy comes from the track's character, not its level."
        : "There is no narration, so the music and SFX carry the whole film — pick something with real movement.");
}

// ---------------------------------------------------------------------------
// MEASUREMENT — close the loop on the estimate.
// ---------------------------------------------------------------------------

// Words per second actually achieved by the synthesized takes. Feeding this back
// is what makes the budget "calculated from the real TTS rate" rather than from
// a constant someone typed once. Returns null when there is not enough audio to
// draw a conclusion from.
function observedSpeechRate(clips) {
  let words = 0, sec = 0;
  for (const c of (clips || [])) {
    const t = String((c && c.text) || "").trim();
    const d = Number(c && c.durationSec) || 0;
    if (!t || d <= 0) continue;
    words += (t.match(/\S+/g) || []).length;
    sec += d;
  }
  if (sec < 3 || words < 8) return null;      // too little signal to trust
  return r2(words / sec);
}

/**
 * Fit `clipSec = words / rate + fixedSec` to the takes that were really made.
 *
 * WHY THIS EXISTS RATHER THAN observedSpeechRate ALONE. That function divides
 * TOTAL words by TOTAL seconds, which folds the per-utterance cost into the rate
 * — so its answer moves with how many CLIPS the film has, which is the pace dial
 * itself. Measured across 15 shipped films, its output correlated with
 * clips-per-word at r = -0.75 and read 1.18-2.06 w/s on a voice whose real
 * marginal rate is ~2.42. It reported the pace mode back as a property of the
 * voice, and the report told the reader to re-tune BASE_SPEECH_RATE from it.
 *
 * Two parameters need spread in the x axis, not just many points: a film whose
 * lines are all three words fits a vertical line and yields a nonsense slope, so
 * a sample that cannot separate the two terms returns null and the checks that
 * depend on it go `null` (not applicable) rather than guessing.
 */
function observedUtteranceCost(clips) {
  const pts = [];
  for (const c of (clips || [])) {
    const w = (String((c && c.text) || "").trim().match(/\S+/g) || []).length;
    const d = Number(c && c.durationSec) || 0;
    if (w > 0 && d > 0) pts.push([w, d]);
  }
  const distinct = new Set(pts.map((p) => p[0]));
  if (pts.length < 6 || distinct.size < 3) return null;
  const n = pts.length;
  let sw = 0, sd = 0, sww = 0, swd = 0;
  for (const [w, d] of pts) { sw += w; sd += d; sww += w * w; swd += w * d; }
  const den = n * sww - sw * sw;
  if (!den) return null;
  const slope = (n * swd - sw * sd) / den;        // seconds per word
  // A slope outside this is not a speaking rate — it is a broken sample (one
  // outlier clip, a mislabelled take). Refuse rather than report a fantasy.
  if (!(slope > 0.05 && slope < 2)) return null;
  return {
    rate: r2(1 / slope),
    fixedSec: r2((sd - slope * sw) / n),
    clips: n,
    spread: distinct.size,
  };
}

// Total words in a script's voiceover — the thing measured against wordBudget.
function scriptWordCount(script) {
  const scenes = (script && Array.isArray(script.scenes)) ? script.scenes : [];
  return scenes.reduce((n, s) => n + ((String(s.voiceover || "").match(/\S+/g) || []).length), 0);
}

// ---------------------------------------------------------------------------
// THE PACING REPORT — did the film actually come out at the pace it promised?
// ---------------------------------------------------------------------------
//
// DISCLOSURE, NOT A GATE. Every check here runs on the FINISHED film and none of
// them block delivery — matching the delivery probe's policy, and for the same
// reason: a pacing complaint is a judgement about craft, and refusing to hand
// over a rendered film over a judgement is worse than handing it over with the
// judgement attached. The value is that "the Fast video came out 8 seconds long
// and half of it is silent" becomes a line in a report instead of something the
// user has to notice for themselves.
//
// Every check is fail-open: a missing input makes a check `null` (not
// applicable), never a failure.

const CHECK = (ok, detail) => ({ ok, detail });

/**
 * @param {object} a
 *   pacing            the resolved config the film was built to
 *   script            the final script (scenes with duration + voiceover)
 *   voClips           measured VO clips [{sceneId, startSec, durationSec, text}]
 *   captionCues       final cues [{start, end, text}]
 *   actualDurationSec ffprobe'd duration of the delivered MP4
 *   targetDurationSec what the user asked for
 */
function report({ pacing: P, script, voClips, captionCues, actualDurationSec, targetDurationSec } = {}) {
  if (!P) return null;
  const scenes = (script && Array.isArray(script.scenes)) ? script.scenes : [];
  const clips = Array.isArray(voClips) ? voClips : [];
  const cues = Array.isArray(captionCues) ? captionCues : [];
  const target = Number(targetDurationSec) || P.targetDurationSec;
  // Rounded at the door. The probe hands over a raw float and this value is
  // interpolated straight into check details, which reach the user through
  // delivery_quality — "35.317006802721085s delivered against 30s requested" is
  // the report reciting its own float precision at someone reading about a film.
  const actual = Number(actualDurationSec) ? r2(Number(actualDurationSec)) : null;

  const checks = {};

  // 1. RUNTIME. The film should land on the duration the user asked for. The
  //    tolerance is generous because retimeScenesToVo legitimately stretches
  //    scenes to contain measured narration — a known, documented overshoot.
  checks.duration = actual == null ? null : (() => {
    const drift = r2(actual - target);
    const pct = target ? Math.abs(drift) / target : 0;
    return CHECK(pct <= 0.12, `${actual}s delivered against ${target}s requested (${drift >= 0 ? "+" : ""}${drift}s)`);
  })();

  // 2. NARRATION LOAD. Did the script honour its word budget, and did the voice
  //    come in at the rate the budget assumed? The OBSERVED rate is the honest
  //    input to re-tuning the estimate, so it is reported whether or not the
  //    check passes.
  const words = scriptWordCount(script);
  const observed = observedSpeechRate(clips);
  checks.wordBudget = !P.voiceover || !P.wordBudget ? null
    : CHECK(words <= P.wordBudget * 1.15,
        `${words} words spoken against a ${P.wordBudget}-word budget`
        + (P.narratedSceneCount ? ` across ${clips.length || "?"}/${P.narratedSceneCount} budgeted lines` : ""));
  // NOTE the blended words-per-second used to be quoted here. It is not a
  // speaking rate (see observedUtteranceCost), and printing it beside the
  // marginal rate the speechRate check reports put two different numbers for the
  // same voice two lines apart in one report. The rate belongs to that check.

  // THE CALIBRATION CHECKS — the two constants the budget is built out of, each
  // graded against the SAME take, and separately, because they fail for
  // different reasons and have different fixes.
  //
  // This used to be one check fed by `observed` (total words / total seconds).
  // That number is not a speaking rate: it blends the marginal rate with the
  // per-utterance cost in a proportion set by how many clips the film has, which
  // is the pace dial. It failed on 18 of 19 shipped reports and told the reader
  // to re-tune BASE_SPEECH_RATE — a change that would have cut every word budget
  // by a third while leaving the real cause untouched. `fit` separates the two
  // terms so each can be judged, and re-tuned, on its own.
  const fit = observedUtteranceCost(clips);

  checks.speechRate = !fit ? null : (() => {
    const ratio = fit.rate / P.speechRate;
    return CHECK(ratio >= 0.8 && ratio <= 1.25,
      `the voice spoke ${fit.rate} words/sec at the margin against the ${P.speechRate} the budget assumes `
      + `(${Math.round((ratio - 1) * 100)}%, fitted over ${fit.clips} takes). `
      + `Re-tune BASE_SPEECH_RATE in services/pacing.js from measurements like this one rather than from the estimate.`);
  })();

  // The term that used to be missing entirely. A film pays this once per spoken
  // line, so an under-estimate here costs `narratedSceneCount x error` seconds —
  // and costs it hardest at the fastest modes, which have the most lines.
  checks.utteranceCost = !fit ? null : (() => {
    const budgeted = Number(P.utteranceFixedSec) || UTTERANCE_FIXED_SEC;
    const drift = r2(fit.fixedSec - budgeted);
    return CHECK(Math.abs(drift) <= 0.35,
      `each spoken line cost ${fit.fixedSec}s of onset and terminal fall against the ${budgeted}s budgeted `
      + `(${drift >= 0 ? "+" : ""}${drift}s x ${P.narratedSceneCount || "?"} lines `
      + `= ${r2(drift * (P.narratedSceneCount || 0))}s of runtime). `
      + `Re-tune UTTERANCE_FIXED_SEC in services/pacing.js if this holds across films.`);
  })();

  // 3. HOW HARD THE NARRATION PUSHED THE CUT.
  //
  //    NOT "does each line fit its scene" — that would be a tautology. This runs
  //    after retimeScenesToVo, which GROWS every scene until its line fits, so
  //    containment is guaranteed by construction and a check for it can only
  //    ever pass. The honest question is what that guarantee COST: how many
  //    scenes had to be stretched past the pace's target to hold their line.
  //    That is the real "the script was too wordy for the pace it was written
  //    to" signal, and it is what makes a fast film come out long.
  const byScene = new Map(scenes.map((s) => [String(s.id), s]));
  const stretched = clips.filter((c) => {
    const sc = byScene.get(String(c.sceneId));
    return sc && (Number(sc.duration) || 0) > P.scene.targetSec * 1.35;
  });
  checks.voStretch = !clips.length ? null
    : CHECK(stretched.length <= Math.ceil(clips.length * 0.25),
        stretched.length
          ? `${stretched.length}/${clips.length} narrated scene(s) had to stretch past the ${P.scene.targetSec}s target to hold their line`
          : `no scene had to stretch past the ${P.scene.targetSec}s target to hold its line`);

  // 4. DEAD AIR. A scene that is much longer than its narration with nothing to
  //    say is the "visual continues after the voice stopped" failure. Only
  //    counted on NARRATED scenes: a deliberately silent beat is a good beat,
  //    especially at a fast pace.
  const durById = new Map(clips.map((c) => [String(c.sceneId), Number(c.durationSec) || 0]));
  // The threshold SCALES WITH THE MODE'S SCENE LENGTH. It was
  // `max(2.5, tailSec * 3)`, where the per-mode term (1.95 / 1.65 / 1.26 / 1.02)
  // is below 2.5 at every mode — so the mode never actually influenced it and a
  // 2.4s hang on a 2.3s Very Fast scene, which doubles its length, read as fine.
  // Half the paced scene target is the honest bar: dead air is dead relative to
  // how long a beat is supposed to be.
  const deadAirSec = Math.max(1.2, P.scene.targetSec * 0.5);
  const dead = scenes.filter((s) => {
    const vo = durById.get(String(s.id));
    return vo != null && vo > 0 && (Number(s.duration) || 0) - vo > deadAirSec;
  });
  checks.deadAir = !clips.length ? null
    : CHECK(dead.length === 0,
        dead.length ? `${dead.length} narrated scene(s) hold more than ${r2(deadAirSec)}s past their line: ${dead.slice(0, 3).map((s) => s.id).join(", ")}`
                    : `no narrated scene outlives its line by more than ${r2(deadAirSec)}s`);

  // 5. READABILITY. Precedence rule 1, measured on the delivered cut.
  // Graded over every display field. This read `s.onScreenText` alone — a SCRIPT
  // key that services/storyboard.js alignToScript did not put on a storyboard
  // scene at all, so on the graph and project paths this check has been scoring
  // an empty array and passing every film it ever graded.
  const displayLines = (s) => [s.headline, s.subtext, s.kicker, ...(s.bullets || []), ...(s.onScreenText || [])]
    .map((x) => String(x == null ? "" : x).trim()).filter(Boolean);
  const unreadable = scenes.filter((s) => !checkReadability(displayLines(s), s.duration).ok);
  checks.readability = CHECK(unreadable.length === 0,
    unreadable.length ? `${unreadable.length} scene(s) show text too briefly to read: ${unreadable.slice(0, 3).map((s) => s.id).join(", ")}`
                      : `all ${scenes.length} scene(s) hold their text long enough to read`);

  // 6. CAPTION SYNC. Cues must be ordered, non-overlapping, and inside the film.
  checks.captionSync = !cues.length ? null : (() => {
    let overlaps = 0, outside = 0;
    for (let i = 0; i < cues.length; i++) {
      if (cues[i].end < cues[i].start) overlaps++;
      if (i && cues[i].start + 0.001 < cues[i - 1].end) overlaps++;
      if (actual != null && cues[i].end > actual + 0.5) outside++;
    }
    return CHECK(overlaps === 0 && outside === 0,
      overlaps || outside ? `${overlaps} overlapping/inverted cue(s), ${outside} past the end of the film`
                          : `${cues.length} cues, in order and inside the film`);
  })();

  // 7. CUT RATE. Did the film actually cut at the rate the mode asked for? This
  //    is the check that catches a mode silently doing nothing.
  checks.cutRate = !scenes.length ? null : (() => {
    const avg = r2(scenes.reduce((n, s) => n + (Number(s.duration) || 0), 0) / scenes.length);
    // Wide tolerance: measured scene length is downstream of VO stretching, so
    // it legitimately runs longer than the plan. This is here to catch a mode
    // that did nothing at all, not to police a half-second.
    const ok = avg <= P.scene.targetSec * 1.6 + 0.5;
    const why = {
      renderer: `the pack's renderer draws at most ${P.scene.rendererSceneCap} scenes`,
      "scene-ceiling": `the ${LONGFORM_SCENE_CAP}-scene ceiling`,
      "min-scene-length": `the ${SCENE_MIN_SEC}s minimum scene length`,
    }[P.scene.cutRateCappedBy];
    return CHECK(ok, `${scenes.length} scenes averaging ${avg}s against a ${P.scene.targetSec}s target`
      + (why ? ` (the mode could not add every cut it wanted — ${why})` : ""));
  })();

  const entries = Object.entries(checks).filter(([, v]) => v !== null);
  const failed = entries.filter(([, v]) => !v.ok).map(([k]) => k);

  return {
    v: 1,
    mode: P.mode,
    label: P.label,
    multiplier: P.multiplier,
    targetSec: target,
    actualSec: actual,
    voiceoverSec: clips.length ? r2(clips.reduce((n, c) => n + (Number(c.durationSec) || 0), 0)) : null,
    scenes: scenes.length,
    words,
    wordBudget: P.wordBudget,
    narratedScenes: P.narratedSceneCount ?? null,
    // The BLENDED figure (total words / total clip seconds). Kept because it is
    // what the delivered audio actually averaged, but it is NOT a speaking rate
    // and nothing is graded against it — see observedUtteranceCost.
    observedSpeechRate: observed,
    assumedSpeechRate: P.speechRate,
    // The separated terms, when the sample could support the fit.
    observedMarginalRate: fit ? fit.rate : null,
    observedUtteranceSec: fit ? fit.fixedSec : null,
    assumedUtteranceSec: P.utteranceFixedSec ?? UTTERANCE_FIXED_SEC,
    cutRateCapped: P.scene.cutRateCapped,
    cutRateCappedBy: P.scene.cutRateCappedBy,
    rendererSceneCap: P.scene.rendererSceneCap,
    checks,
    pass: failed.length === 0,
    failed,
  };
}

// One-line-per-check rendering for the server log.
function formatReport(rep) {
  if (!rep) return "";
  const rows = [
    `Pacing:    ${rep.label} ${rep.multiplier}x`,
    `Target:    ${rep.targetSec}s`,
    `Actual:    ${rep.actualSec == null ? "(not measured)" : rep.actualSec + "s"}`,
    `Voiceover: ${rep.voiceoverSec == null ? "(none)" : rep.voiceoverSec + "s"}`,
    `Scenes:    ${rep.scenes}${rep.narratedScenes == null ? "" : ` (${rep.narratedScenes} budgeted to speak)`}`,
    `Words:     ${rep.words}${rep.wordBudget ? ` / ${rep.wordBudget} budget` : ""}`,
    `Voice:     ${rep.observedMarginalRate == null
      ? `${rep.observedSpeechRate == null ? "(not measured)" : rep.observedSpeechRate + " w/s blended"} — too few distinct line lengths to separate the terms`
      : `${rep.observedMarginalRate} w/s + ${rep.observedUtteranceSec}s/line (assumed ${rep.assumedSpeechRate} + ${rep.assumedUtteranceSec}s)`}`,
  ];
  for (const [name, c] of Object.entries(rep.checks)) {
    if (!c) { rows.push(`${(name + ":").padEnd(11)}SKIP`); continue; }
    rows.push(`${(name + ":").padEnd(11)}${c.ok ? "PASS" : "FAIL"} — ${c.detail}`);
  }
  return rows.join("\n  ");
}

// ---------------------------------------------------------------------------
// THE COMPOSITION TEMPO TILT (originally this file's whole contents)
// ---------------------------------------------------------------------------
//
// Scales what a composer controls at COMPOSITION time: how long a cut overlaps,
// how quickly elements animate, how far the camera travels. It does NOT change
// the number of scenes or their durations — those come from the script the user
// approved in the Script Room, and rewriting them here would silently invalidate
// an approved script and leave twelve words on screen for two seconds.
//
// That division of labour still holds. The MODE engine above changes scene
// count and length, but it does so BEFORE the script is written — at authoring
// time, on the near side of the approval boundary. This tilt stays on the far
// side, where only motion may move. Pure, deterministic, no I/O.

// With narration off, motion durations are multiplied by MOTION and cut overlaps
// by XFADE. Both are < 1 (quicker); CAMERA is > 1 (further travel in less time
// reads as energy).
//
// Chosen so the result is noticeably quicker without becoming a strobe: at 0.68
// a 0.9s text entrance lands in 0.61s — a change any viewer feels, and still
// slower than the 0.4s floor where an entrance stops being readable and starts
// being a flicker.
const NO_VO = Object.freeze({ motion: 0.68, xfade: 0.62, camera: 1.35 });
const VO    = Object.freeze({ motion: 1, xfade: 1, camera: 1 });

// CLAMP RANGES. Originally one-sided — motion/xfade capped at 1 and camera
// floored at 1 — because the only thing that existed was "quicker with no
// voice". A Relaxed film needs the other half of each range (motion > 1 is
// SLOWER, camera < 1 travels LESS), and a one-sided clamp would have silently
// pinned Relaxed back to exactly Normal, which is the kind of bug that looks
// like "the feature does nothing".
//
// Widening cannot change any existing behaviour: tempoFor() only ever emits
// values inside the ORIGINAL range, and nothing else wrote `storyboard.pacing`
// before now. Asserted in scripts/pacing.test.cjs.
const TEMPO_BOUNDS = {
  motion: [0.5, 1.6],
  xfade:  [0.45, 1.6],
  camera: [0.8, 1.6],
};

function clampTempo(v, [lo, hi]) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 1;
  return Math.max(lo, Math.min(hi, n));
}

/**
 * tempoFor({ narration, energyBoost }) -> the composition tempo for this film.
 *
 * `energyBoost` is the SAME pack field the audio side reads (pack.json
 * audio.noVo). A pack that opted out of the audio lift — edition ships
 * energyBoost 0 deliberately, to stay exactly as calm with no voice — opts out
 * of the pacing lift too. A template whose whole identity is restraint should
 * not start cutting like a sneaker ad because a checkbox moved, and having one
 * control govern both keeps sound and picture telling the same story.
 *
 * UNCHANGED from the original file. Do not retune without a reason.
 */
function tempoFor({ narration = "on", energyBoost = 1 } = {}) {
  const off = narration === "off";
  const boost = Number.isFinite(Number(energyBoost)) ? Number(energyBoost) : 1;
  if (!off || boost <= 0) {
    return Object.freeze({ ...VO, narration: off ? "off" : "on", label: off ? "music-led (pack opted out)" : "voice-led" });
  }
  // energyBoost 2 is a pack asking to be pushed harder than the default; scale
  // the tilt rather than adding a second table.
  const t = boost >= 2 ? 1.25 : 1;
  return Object.freeze({
    motion: clampTempo(1 - (1 - NO_VO.motion) * t, [0.5, 1]),
    xfade:  clampTempo(1 - (1 - NO_VO.xfade)  * t, [0.45, 1]),
    camera: clampTempo(1 + (NO_VO.camera - 1) * t, [1, 1.6]),
    narration: "off",
    label: "music-led",
  });
}

/**
 * The tempo for a film at a given PACE, optionally also with narration off.
 *
 * This is what finally feeds `storyboard.pacing`. The two effects COMPOSE
 * multiplicatively: a Fast film with no voiceover is quicker than either alone,
 * which is right — both reasons to move faster are present at once.
 *
 * The mode's factors are expressed as "how much quicker" (entrance 1.28 = 28%
 * quicker), while this vocabulary is "multiply the duration by" — so they enter
 * as reciprocals.
 */
function tempoForPacing(pacing, { narration = "on", energyBoost = 1 } = {}) {
  const base = tempoFor({ narration, energyBoost });
  if (!pacing || pacing.mode === DEFAULT_MODE) return base;
  const m = pacing.motion || MODES[DEFAULT_MODE].motion;
  return Object.freeze({
    motion: clampTempo(base.motion / (Number(m.entrance) || 1), TEMPO_BOUNDS.motion),
    xfade:  clampTempo(base.xfade  / (Number(m.transition) || 1), TEMPO_BOUNDS.xfade),
    camera: clampTempo(base.camera * (Number(m.camera) || 1), TEMPO_BOUNDS.camera),
    narration: base.narration,
    label: `${pacing.mode}${base.narration === "off" ? " music-led" : ""}`.slice(0, 32),
  });
}

/**
 * Attach a film's pace to the storyboard, NON-ENUMERABLY.
 *
 * The storyboard is the one object every composition path already receives, so
 * it is the right carrier — but it is ALSO fed verbatim to language models:
 * services/composer.js serializes it into the premium composition prompt, and
 * services/audio_planner.js serializes a subset into the audio prompt. A plain
 * assignment therefore dumped ~1.3KB of resolved config into an LLM prompt that
 * has no use for it, on every job, changing the default-pace prompt and paying
 * for the tokens.
 *
 * Non-enumerable fixes every such serializer at once rather than hunting them
 * one at a time: `JSON.stringify` and `{...spread}` skip these keys, while
 * `storyboard.paceConfig` and `tempoOf(storyboard)` read them exactly as before.
 * `configurable` so a QA repair lap can re-attach without throwing.
 *
 * The storyboard is never persisted as JSON, so nothing depends on these
 * surviving a serialization round trip.
 */
function setPaceOnStoryboard(storyboard, paceConfig, tempo) {
  if (!storyboard || typeof storyboard !== "object") return storyboard;
  const hide = (key, value) => Object.defineProperty(storyboard, key, {
    value, enumerable: false, configurable: true, writable: true,
  });
  if (paceConfig) hide("paceConfig", paceConfig);
  if (tempo) hide("pacing", tempo);
  return storyboard;
}

/**
 * Copy a storyboard's hidden pace onto a DERIVED storyboard.
 *
 * THE COST OF HIDING THEM. Non-enumerable keeps the config out of every
 * serializer, but `{...storyboard}` skips non-enumerable properties too — and
 * the pipeline derives storyboards by spread in two places, both on the repair
 * path: agents/graph.js adds `__qaIssuesToFix` for a QA repair lap, and
 * services/pipeline.js adds `__lintFeedback` for a composer lint retry. Without
 * this call the first lap of a Fast film is paced and every repair lap silently
 * is not — the worst possible shape for a bug, because it only appears on the
 * films that already needed fixing.
 *
 * Call this on any object derived from a storyboard.
 */
function carryPace(from, to) {
  if (!from || !to || typeof to !== "object") return to;
  return setPaceOnStoryboard(to, from.paceConfig, from.pacing);
}

/** The tempo carried on a storyboard, or the neutral one. Composers call this. */
function tempoOf(storyboard) {
  const p = storyboard && storyboard.pacing;
  if (!p || typeof p !== "object") return NEUTRAL;
  return Object.freeze({
    motion: clampTempo(p.motion, TEMPO_BOUNDS.motion),
    xfade:  clampTempo(p.xfade,  TEMPO_BOUNDS.xfade),
    camera: clampTempo(p.camera, TEMPO_BOUNDS.camera),
    narration: p.narration === "off" ? "off" : "on",
    label: String(p.label || "voice-led").slice(0, 32),
  });
}

const NEUTRAL = Object.freeze({ ...VO, narration: "on", label: "voice-led" });

module.exports = {
  MODES, DEFAULT_MODE,
  BASE_SPEECH_RATE, UTTERANCE_FIXED_SEC, MIN_UTTERANCE_WORDS, SPEECH_RATE_BY_LANG, SCRIPT_LANG,
  SCENE_MIN_SEC, SCENE_MAX_SEC, BEAT_FLOOR_SEC, SCENE_BASE_SEC, LONGFORM_AT_SEC, LONGFORM_SCENE_CAP,
  VERTICAL_FILM_SCENE_CAP,
  normalizeMode, listModes, resolve, defaults,
  minReadableSec, minSceneSec, checkReadability,
  visualCapacity, fitVisualLine, visualDirective,
  VISUAL_LINE_SAFETY, VISUAL_MIN_CHARS, VISUAL_MAX_CHARS, VISUAL_ROLE_SHARE,
  scaleTiming, TIMING_SCALE_KEYS,
  sceneWordCeiling, wordCeilingTable,
  scriptDirective, shortDirective, audioDirection,
  observedSpeechRate, observedUtteranceCost, scriptWordCount,
  report, formatReport,
  // the composition tempo tilt — unchanged public surface, now actually fed
  tempoFor, tempoForPacing, tempoOf, NEUTRAL, NO_VO, TEMPO_BOUNDS, setPaceOnStoryboard, carryPace,
};
