// PACING — how fast the picture moves, and what changes when nobody is talking.
//
// THE DEFECT THIS ADDRESSES. `job.voiceover_enabled` reached exactly one part of the
// pipeline: audio. agents/graph.js says so outright — "the PICTURE is byte-identical
// whether narration is on or off". That was a deliberate and good property (it lets a user
// toggle narration in the Script Room without regenerating), but it also meant a music-only
// film held every shot for as long as a narrated one, cut as slowly, and moved as gently.
// A film with no voice has nothing filling those held frames, which is why it reads as slow
// even when the soundtrack is right.
//
// WHAT THIS DOES AND DELIBERATELY DOES NOT DO.
//
//   IT DOES scale the things a composer controls at COMPOSITION time: how long a cut
//   overlaps, how quickly text and elements animate in and out, how far the camera travels.
//
//   IT DOES NOT change the number of scenes or their durations. Those come from the script,
//   which is written before the composer runs and is what the user approved in the Script
//   Room. Rewriting them here would silently invalidate an approved script, and shortening a
//   beat without shortening its copy leaves twelve words on screen for two seconds.
//   Scene-count-and-duration pacing is a script-authoring change with a regeneration
//   boundary attached; it is a separate, product-gated decision (see
//   NO-VOICEOVER-AUDIO-MODE.md §6.4). Everything here is safe precisely because it leaves
//   the approved structure alone.
//
// So: same scenes, same lengths, faster motion inside them and harder cuts between them.
// That is most of the perceived speed-up, at none of the risk.
//
// Pure + deterministic. No I/O, no LLM, no randomness.

// With narration off, motion durations are multiplied by MOTION and cut overlaps by XFADE.
// Both are < 1 (quicker); CAMERA is > 1 (further travel in less time reads as energy).
//
// Chosen so the result is noticeably quicker without becoming a strobe: at 0.68 a 0.9s text
// entrance lands in 0.61s — a change any viewer feels, and still slower than the 0.4s floor
// where an entrance stops being readable and starts being a flicker.
const NO_VO = Object.freeze({ motion: 0.68, xfade: 0.62, camera: 1.35 });
const VO    = Object.freeze({ motion: 1, xfade: 1, camera: 1 });

/**
 * tempoFor({ narration, energyBoost }) → the composition tempo for this film.
 *
 * `energyBoost` is the SAME pack field the audio side reads (pack.json audio.noVo). A pack
 * that opted out of the audio lift — edition ships energyBoost 0 deliberately, to
 * stay exactly as calm with no voice — opts out of the pacing lift too. A template whose
 * whole identity is restraint should not start cutting like a sneaker ad because a checkbox
 * moved, and having one control govern both keeps sound and picture telling the same story.
 */
function tempoFor({ narration = "on", energyBoost = 1 } = {}) {
  const off = narration === "off";
  const boost = Number.isFinite(Number(energyBoost)) ? Number(energyBoost) : 1;
  if (!off || boost <= 0) {
    return Object.freeze({ ...VO, narration: off ? "off" : "on", label: off ? "music-led (pack opted out)" : "voice-led" });
  }
  // energyBoost 2 is a pack asking to be pushed harder than the default; scale the tilt
  // rather than adding a second table.
  const t = boost >= 2 ? 1.25 : 1;
  return Object.freeze({
    motion: clamp(1 - (1 - NO_VO.motion) * t, 0.5, 1),
    xfade:  clamp(1 - (1 - NO_VO.xfade)  * t, 0.45, 1),
    camera: clamp(1 + (NO_VO.camera - 1) * t, 1, 1.6),
    narration: "off",
    label: "music-led",
  });
}

/** The tempo carried on a storyboard, or the neutral one. Composers call this. */
function tempoOf(storyboard) {
  const p = storyboard && storyboard.pacing;
  if (!p || typeof p !== "object") return NEUTRAL;
  return Object.freeze({
    motion: clamp(Number(p.motion), 0.5, 1) || 1,
    xfade:  clamp(Number(p.xfade),  0.45, 1) || 1,
    camera: clamp(Number(p.camera), 1, 1.6) || 1,
    narration: p.narration === "off" ? "off" : "on",
    label: String(p.label || "voice-led").slice(0, 32),
  });
}

const NEUTRAL = Object.freeze({ ...VO, narration: "on", label: "voice-led" });

function clamp(v, lo, hi) {
  const n = Number(v);
  if (!Number.isFinite(n)) return lo === 1 ? 1 : 1;
  return Math.max(lo, Math.min(hi, n));
}

module.exports = { tempoFor, tempoOf, NEUTRAL, NO_VO };
