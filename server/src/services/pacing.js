// PACING ENGINE — the one source of truth for how FAST a film is told.
//
// WHAT PACE IS. A pace is not playback speed and it is not runtime. A user who
// asks for 60 seconds gets 60 seconds at every pace; what changes is DENSITY —
// how much is said, how often the picture cuts, and how briskly things arrive.
// Four separate invariants compare the delivered film against the requested
// duration (script.validateScript, storyboard.validate, the segment-concat check
// in pipeline.renderInSegments, and video_probe's delivery blocker), so runtime
// is the one thing pace may never touch.
//
// THE TWO UNITS. The single most important idea here is that "how fast a film
// feels" is two independent numbers, and conflating them is what makes naive
// speed features break sync:
//
//   sceneSec — the NARRATION unit. One script scene = one spoken line. Scene
//     boundaries are where narration is mixed (pipeline.retimeScenesToVo), so
//     moving them is what puts audio out of step. It is floored by physics: at
//     the measured speaking rate a 2.3s scene holds under four spoken words.
//   beatSec — the CUT unit. How often the PICTURE changes. This can go to 1.6s
//     with no sync risk whatsoever, because a cut INSIDE a scene moves no scene
//     boundary and no narration.
//
// Fast therefore means: modestly shorter scenes, materially denser cuts, fewer
// authored words, quicker arrivals. That is the argument omelette_adapter.js
// already makes for itself at its own line 1328 ("keep the narration untouched
// and CUT MORE OFTEN… total duration is unchanged, so audio stays in sync") —
// this module generalises that one pack-specific trick to every renderer.
//
// NEUTRALITY IS THE SPEC. Every formula below is written so that multiplier 1.0
// evaluates to the exact literal it replaces — not approximately, exactly.
// `normal` must reproduce today's films byte for byte, and scripts/pacing.test.cjs
// asserts that field by field against a frozen snapshot of the 27 constants this
// module took over. If a byte differs, the formula is wrong, not the fixture.
//
// PURITY. No fs, no LLM, no module-level mutable state, and every returned
// object is frozen. jobConcurrency can exceed 1: two films with different paces
// run in the same process, so a profile is threaded, never stashed.

const config = require("../config");

// ---------------------------------------------------------------- the table
// The mode table lives in config.json so a deploy can retune it without a code
// change; this is the fallback so the module is usable in tests and on a config
// that predates the feature.
//
// wordsPerSec is NOT derived from the multiplier. It is a measured claim about
// how fast the narrator actually talks, and the two numbers move for different
// reasons — see the calibration note below.
const BUILTIN_MODES = {
  relaxed:  { label: "Relaxed",   multiplier: 0.80, wordsPerSec: 2.30 },
  normal:   { label: "Normal",    multiplier: 1.00, wordsPerSec: 2.60 },
  fast:     { label: "Fast",      multiplier: 1.25, wordsPerSec: 2.00 },
  veryFast: { label: "Very Fast", multiplier: 1.50, wordsPerSec: 1.70 },
};

// CALIBRATION — why `normal` keeps a number the narrator cannot hit.
//
// script.js has asserted 2.6 words/sec since it was written. Measured against
// 299 real TTS clips from this repo's own logs (clips of 4+ words, provider
// openrouter/gpt-audio-mini): median 1.60 w/s, aggregate 1.40 w/s, p90 2.00 w/s
// — 1.3% of clips reach 2.6. vo_fit.js already admits it in a comment ("TTS
// reads slower than the words/sec heuristic"), and the consequence is visible in
// the same logs: retimeScenesToVo lengthens nearly every film (15s→18.8s,
// 30s→35.7s, 150s→162.3s).
//
// `normal` keeps 2.6 anyway, because changing it would change the 1.0x path and
// neutrality is the spec. The faster modes are budgeted against the MEASURED
// rate instead — fast 2.00 is the p90 (nine clips in ten already read at or
// under it) and veryFast 1.70 is the median plus 6%, which is the budget at
// which "the voiceover finishes naturally inside its scene" stops being
// aspirational and becomes arithmetic. The universal fix — retiring 2.6 for
// every mode — is `pacing.calibration: true` in config, off by default, because
// it changes Normal and deserves its own rollout.
const CALIBRATION_FACTOR = 1.60 / 2.60;

const DEFAULT_MODE = "normal";

function table() {
  const t = (config && config.pacing && typeof config.pacing === "object") ? config.pacing : null;
  const modes = {};
  for (const [k, v] of Object.entries(t || BUILTIN_MODES)) {
    if (k === "calibration") continue;               // a flag, not a mode
    if (!v || typeof v !== "object") continue;
    if (!Number.isFinite(Number(v.multiplier))) continue;
    modes[k] = v;
  }
  return Object.keys(modes).length ? modes : BUILTIN_MODES;
}

function calibrating() {
  return !!(config && config.pacing && config.pacing.calibration === true);
}

const MODES = Object.freeze(Object.keys(table()));

// ---------------------------------------------------------------- arithmetic
const r1 = (n) => Math.round(n * 10) / 10;
const r2 = (n) => Math.round(n * 100) / 100;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

// A cut below this reads as a flicker rather than an edit, at every pace. It is
// the one number no mode may argue with.
const CUT_FLOOR_SEC = 1.6;
// A narrated scene shorter than this cannot hold a spoken clause, and both
// re-timers already floor at it. Pace does not get to lower it.
const SCENE_FLOOR_SEC = 2;

// ---------------------------------------------------------------- the profile
function build(key, row) {
  const M = Number(row.multiplier) || 1;
  const neutral = M === 1;
  const wps = r2((Number(row.wordsPerSec) || 2.6) * (calibrating() ? CALIBRATION_FACTOR : 1));

  // Arrivals (entrances, card rises, transitions, text) carry the energy, so
  // they take the multiplier whole. Ambient motion (idle floats, light sweeps)
  // takes only a third of it: a room whose furniture breathes at 1.5x reads as
  // jittery, and the contrast between a quick arrival and a calm idle is what
  // makes fast look designed instead of merely accelerated. Camera never scales
  // — a push that outruns the eye reads as a mistake at any pace.
  const arrivalFactor = M;
  const ambientFactor = 1 + (M - 1) * 0.35;

  const p = {
    key,
    label: String(row.label || key),
    multiplier: M,
    neutral,
    calibrated: calibrating(),

    // ---- narration unit -----------------------------------------------------
    wordsPerSec: wps,                                            // script.js:50
    voTolerance: neutral ? 1.35 : Math.max(1.15, r2(1.35 / M)),  // script.js:52
    sceneSec: r1(3.5 / M),                          // system_script.md "~3.5s"
    sceneMin: Math.max(SCENE_FLOOR_SEC, r1(2.5 / M)),
    sceneMax: r1(6 / M),
    sceneCap: Math.min(15, r1(15 / M)),             // storyboard clampDur upper
    // THE SCENE CEILING DOES NOT MOVE WITH PACE, and that is a sync requirement
    // rather than a conservative choice. Every renderer has a beat ceiling of its
    // own — 50 for the bundled engine, 72 (scene_fit.MAX_CLIPS) for the rest — and
    // foldScriptToRenderer merges anything above it onto shared beats. A shared
    // beat can only lead with ONE of the merged scenes while the narrator reads
    // both lines in order, so every scene demanded above the ceiling is bought
    // with time on screen showing the wrong scene's copy. Measured on a 300s film
    // when this scaled with the multiplier: 105 scenes folded to 72 and a fifth of
    // the runtime was off the voice, against 0% at Normal. Above ~70 scenes pace
    // expresses itself through the CUT unit (beatSec), which needs no fold.
    maxScenes: 70,                                  // storyboard expandToCover
    expandPace: r1(8.5 / M),                        // storyboard expandToCover
    sceneFloor: SCENE_FLOOR_SEC,

    // ---- cut unit -----------------------------------------------------------
    beatSec: Math.max(CUT_FLOOR_SEC, r1(3 / M)),        // omelette beatTarget
    // sqrt, not a straight divide: the per-part floor guards a SPLIT, and
    // halving it at 1.5x would let a two-part split land at 1.33s. sqrt puts
    // Very Fast at 1.63 — under the 2s default, still clear of the flicker floor.
    beatFloor: Math.max(CUT_FLOOR_SEC, r2(2.0 / Math.sqrt(M))),
    minCutSec: Math.max(CUT_FLOOR_SEC, r2(2.0 / Math.sqrt(M))),  // MIN_CUT_SEC
    segmentBeatSec: Math.max(CUT_FLOOR_SEC, r1(3 / M)),          // TARGET_BEAT_SEC
    // The omelette rescale at its line 3036 recomputes k = requestedD / Σdur, so
    // multiplying every beat's LENGTH there is an exact no-op on 197 of 261
    // packs. Pace has to arrive as a beat COUNT, and this is the factor that
    // shrinks the authored median so `idealBeats` asks for more of them.
    authoredPaceFactor: 1 / M,

    // ---- motion -------------------------------------------------------------
    arrivalFactor,
    ambientFactor,
    cameraFactor: 1,

    // ---- readability: the veto ---------------------------------------------
    // Roughly 13 characters a second is comfortable for display type. It barely
    // moves with pace (±15% at the extremes) because the eye does not speed up
    // when the edit does. When copy will not fit, the answer is less copy —
    // never a shorter hold.
    readCps: r2(13 * clamp(1 + (M - 1) * 0.3, 0.85, 1.15)),
    readLeadIn: 0.35,                               // script_overlay floor
    // PER-ELEMENT LENGTH SHRINKS WITH PACE — and that is correct. A shorter line
    // needs less time to read, which is what makes it survivable in a shorter
    // scene. What must NOT shrink with it is the NUMBER of elements; that is
    // `bulletsMax` below, and it used to divide by M along with these.
    overlayMaxWordsLand: Math.max(3, Math.round(5 / M)),
    overlayMaxWordsPortrait: Math.max(3, Math.round(4 / M)),
    subtextChars: Math.round(90 / M),               // text_director
  };

  // ---- content density: the second axis ------------------------------------
  // WHY THIS EXISTS. Pace used to be one knob driving one channel. `sceneSec`
  // and `wordsPerSec` both fall with M, so a Very Fast scene is given a third of
  // Normal's narration — which is the point. But every ON-SCREEN text budget
  // divided by M as well (bullets 3->2, subtext 90->60, overlay 5->3), so the
  // frame lost information at exactly the moment the voice stopped carrying it.
  // Measured at 60s: Very Fast delivered 0.51x the narration AND 0.67x the
  // bullets per scene. That is the "fast pace looks empty" report, and it is
  // arithmetic, not taste.
  //
  // THE INVERSION. A scene is a fixed amount of MEANING delivered over two
  // channels. When the spoken channel gives up words, the visual channel has to
  // pick them up or the meaning is simply gone. So density is derived from the
  // narration DEFICIT — literally how many words per scene this pace dropped
  // relative to Normal — rather than from the multiplier directly:
  //
  //   gain = Normal's words-per-scene / this pace's words-per-scene
  //
  // Normal 9.1/9.1 = 1.00, Fast 9.1/5.6 = 1.63, Very Fast 9.1/3.91 = 2.33.
  //
  // The gain is spent on MORE elements, never on longer ones. Every element
  // stays short (the per-element caps above still divide by M), and they arrive
  // in sequence rather than all at once, so a denser frame is still a readable
  // one — `maxSimultaneous` is the guard that keeps density from becoming a wall
  // of text. This is the whole reason density can rise while hold time falls.
  //
  // NEUTRAL AND BELOW ARE UNTOUCHED. gain is floored at 1, and every consumer
  // gates on multiplier > 1 (the repo's standing rule — gating on !isNeutral
  // makes Relaxed behave like Fast). At Normal and Relaxed every number below is
  // the literal it replaces, so the A/B byte-diff gate still holds.
  const NORMAL_WORDS_PER_SCENE = 3.5 * 2.6;                    // 9.1
  const wordsPerScene = Math.max(0.1, p.sceneSec * wps);
  const gain = M > 1 ? clamp(NORMAL_WORDS_PER_SCENE / wordsPerScene, 1, 2.4) : 1;

  // The bullet/pill row. sqrt(gain) rather than gain: the row is a LAYOUT with a
  // real ceiling — five pills is a designed row, eight is a list — so density
  // buys elements at a diminishing rate and tops out where the grid still reads.
  // At M <= 1 this is the previous expression exactly (Normal 3, Relaxed 3).
  const bulletsMax = M > 1
    ? clamp(Math.round(3 * Math.sqrt(gain)), 3, 5)
    : clamp(Math.round(3 / M), 1, 3);
  p.bulletsMax = bulletsMax;                        // text_director

  p.visual = Object.freeze({
    gain: r2(gain),
    // How many text elements a scene should CARRY in total, across every slot
    // (headline, support line, pills, stat, callout). The planner's target, not
    // a hard cap — `maxSimultaneous` is the cap that protects the eye.
    elements: M > 1 ? clamp(Math.round(4 * Math.sqrt(gain)), 4, 8) : 4,
    bullets: bulletsMax,
    // Structured facts the writer should surface for the frame rather than the
    // voice. These are the fields the script stage asks for and the Text
    // Director distributes; at Normal they are today's implicit 3/1/0.
    keyPoints: M > 1 ? clamp(Math.round(3 * Math.sqrt(gain)), 3, 5) : 3,
    metrics:   M > 1 ? clamp(Math.round(1 + (gain - 1) * 1.5), 1, 3) : 1,
    // READABILITY, the hard part of density. Never show more at once than the
    // eye can take in one fixation group; the rest arrives on a stagger inside
    // the same scene. Four is the designed maximum for a frame that also carries
    // a headline — beyond that a viewer scans instead of reading.
    maxSimultaneous: M > 1 ? 4 : 3,
    // NB: the gap between sequential arrivals is NOT a number here. The
    // renderers' list staggers are per-archetype design values (0.12 / 0.14 /
    // 0.16), and a single global would flatten that; they are scaled by the
    // arrival factor at their own call sites instead, like every other
    // entrance, so a denser list still lands early enough to be read.
    // Per-element length. Density is bought with SHORTER lines, and this is the
    // number that keeps that promise — a denser frame whose lines also grew
    // would fail the readability veto and get trimmed straight back.
    lineMaxChars: Math.round(58 / Math.max(1, M)),
    labelMaxChars: Math.round(24 / Math.max(1, M)),
  });

  // ---- voiceover fitting ----------------------------------------------------
  // atempoMax stays put at every pace. Speeding the read up is the BACKSTOP for
  // a line that came back long, never the mechanism for making a film fast —
  // the mechanism is authoring fewer words in the first place.
  p.vo = Object.freeze({
    rate: wps,                                                    // vo_fit:12
    tightenAt: neutral ? 1.10 : Math.max(1.02, r2(1.10 / M)),     // vo_fit:124
    hardCap: neutral ? 1.25 : Math.max(1.05, r2(1.25 / M)),       // vo_fit:141
    atempoMax: 1.18,                                              // vo_fit:143
    tail: clamp(r2(0.55 / M), 0.3, 0.75),                         // VO_TAIL
  });

  // ---- audio ----------------------------------------------------------------
  // "auto" hands the decision back to the existing avgScene heuristic, so
  // normal and relaxed-adjacent modes behave exactly as today.
  p.audio = Object.freeze({
    drive: M >= 1.25 ? "drive" : (M <= 0.8 ? "calm" : "auto"),
    sfxPerScene: r2(0.8 * M),                       // graph sfxCap
    sfxCapMax: Math.min(14, Math.round(10 * M)),    // graph sfxCap
    rampSec: r2(0.9 / M),                           // audio_mix RAMP_SEC
    envelopeSpread: M,
  });

  return Object.freeze(p);
}

const cache = new Map();

/**
 * Resolve anything a caller might be holding into a frozen pacing profile.
 * Accepts a mode key ("fast"), a job row ({pace}), an options bag ({pacing}),
 * or null/undefined/garbage — all of which fall back to the configured default.
 * A profile passed back in is returned as-is, so `resolve(resolve(x))` is safe
 * and stages can re-resolve without caring who called them.
 */
function resolve(input) {
  if (input && typeof input === "object" && input.key && input.vo && Object.isFrozen(input)) return input;
  let key = null;
  if (typeof input === "string") key = input;
  else if (input && typeof input === "object") {
    key = input.pace || input.pacing || (input.job && input.job.pace) || null;
    if (key && typeof key === "object") return resolve(key);
  }
  const modes = table();
  const fallback = (config && config.defaults && config.defaults.pace) || DEFAULT_MODE;
  const chosen = (key && modes[key]) ? key : (modes[fallback] ? fallback : DEFAULT_MODE);
  const row = modes[chosen] || BUILTIN_MODES[DEFAULT_MODE];
  const ck = `${chosen}:${calibrating() ? 1 : 0}`;
  if (!cache.has(ck)) cache.set(ck, build(chosen, row));
  return cache.get(ck);
}

/** The neutral guard. Consumers use it to take the untouched path verbatim. */
function isNeutral(p) { return !!(p && p.neutral); }

/**
 * Words that fit in `sceneSec` at this pace. `expansion` carries a language's
 * verbosity relative to English (caption_lang declares e.g. de 1.35, ja 0.7):
 * a German line needs FEWER words to fill the same seconds, so the budget is
 * divided by it. English is 1.0, so English output is unchanged by construction.
 */
function wordBudget(sceneSec, p, { expansion = 1 } = {}) {
  const prof = resolve(p);
  const sec = Math.max(0, Number(sceneSec) || 0);
  const exp = Number(expansion) > 0 ? Number(expansion) : 1;
  return Math.max(3, Math.floor((sec * prof.wordsPerSec) / exp));
}

/** Scene-count arithmetic for a film of `durationSec`, with the clamp band. */
function sceneTargetFor(durationSec, p) {
  const prof = resolve(p);
  const d = Math.max(0, Number(durationSec) || 0);
  // Past ~4 minutes the per-scene ceiling opens up (a long film is allowed long
  // beats), mirroring the storyboard's own [2,15] band.
  const sceneMax = d > 240 ? prof.sceneCap : Math.min(prof.sceneCap, prof.sceneMax);
  const raw = d > 0 ? Math.round(d / prof.sceneSec) : 0;
  return Object.freeze({
    sceneSec: prof.sceneSec,
    sceneMin: prof.sceneMin,
    sceneMax,
    sceneCount: Math.max(2, Math.min(prof.maxScenes, raw)),
  });
}

/**
 * Seconds per CUT for a renderer, given the template's own native pace. Never
 * faster than the flicker floor, and never slower than the mode asks for.
 */
function beatTargetFor(nativePace, p) {
  const prof = resolve(p);
  const native = Number(nativePace) || 0;
  return Math.max(CUT_FLOOR_SEC, Math.min(prof.beatSec, Math.max(CUT_FLOOR_SEC, native)) || prof.beatSec);
}

/** Minimum seconds a string must stay on screen to be read at this pace. */
function holdSecFor(text, p) {
  const prof = resolve(p);
  const s = String(text == null ? "" : text);
  if (!s.trim()) return 0;
  return r2(prof.readLeadIn + s.length / prof.readCps);
}

/** False means the copy is too long for the time — CUT TEXT, never speed it up. */
function fitsCopy(text, availSec, p) {
  return holdSecFor(text, p) <= (Number(availSec) || 0) + 1e-6;
}

/**
 * How many items a slot DESIGNED for `designed` may show at this pace.
 *
 * The renderers cap their lists with literals — `bullets.slice(0, 3)`, a
 * three-row strike list, a two-item callout — and those literals are layout
 * decisions, not content ones: they are how many rows the composition was drawn
 * to hold. Before this, a faster pace could raise `bulletsMax` all it liked and
 * the extra lines died at the renderer, so density never reached the frame.
 *
 * This is the one place that trades a layout's designed capacity against the
 * pace's density gain, so no renderer needs pace logic of its own and no
 * template gets a special case. It is deliberately conservative: the increase is
 * bounded by `visual.maxSimultaneous` (what the eye can take in one group), so a
 * list drawn for three shows four, never eight — and the readability veto
 * (fitCopy / scene_kit's fitCopyList) still trims anything that cannot be read
 * in the time it has.
 *
 * Neutral and slower return `designed` untouched, so every existing composition
 * is byte-identical at Normal and Relaxed.
 */
function slotCount(designed, p) {
  const n = Math.max(0, Math.floor(Number(designed) || 0));
  const prof = resolve(p);
  if (prof.multiplier <= 1 || n === 0) return n;
  return Math.max(n, Math.min(prof.visual.maxSimultaneous, Math.round(n * Math.sqrt(prof.visual.gain))));
}

/** vo_fit's thresholds for this pace. */
function voFit(p) { return resolve(p).vo; }

/** The audio director's energy dial for this pace. */
function audioFor(p) { return resolve(p).audio; }

/**
 * Compose a pack's own textfx speed with the job's pace, then re-clamp into the
 * band scene_kit already enforces — so pack identity survives the choice rather
 * than being overwritten by it.
 */
function textfxSpeed(packSpeed, p) {
  const prof = resolve(p);
  const base = Number(packSpeed) > 0 ? Number(packSpeed) : 1;
  return r2(clamp(base * prof.arrivalFactor, 0.85, 1.6));
}

/** One line for logs and the pacing report. */
function describe(p) {
  const prof = resolve(p);
  return `${prof.label} ${prof.multiplier.toFixed(2)}x — ${prof.wordsPerSec} w/s, `
    + `${prof.sceneSec}s scenes, ${prof.beatSec}s cuts`
    + (prof.calibrated ? " (calibrated)" : "");
}

module.exports = {
  MODES, DEFAULT_MODE, BUILTIN_MODES, CUT_FLOOR_SEC, SCENE_FLOOR_SEC,
  resolve, isNeutral, wordBudget, sceneTargetFor, beatTargetFor, slotCount,
  holdSecFor, fitsCopy, voFit, audioFor, textfxSpeed, describe,
};
