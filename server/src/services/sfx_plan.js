// SFX PLANNING — which sound effects a film may actually fire, and when.
//
// THE DEFECT THIS REPLACES (one line, in graph.voiceAgent):
//
//   for (const sc of script.scenes)
//     for (const name of (sc.sfx || []))
//       if (sfxWanted.length < 2) sfxWanted.push({ name, startSec: sc.start - 0.12 });
//
// Two independent problems, both audible in the audited 30-second film:
//
//   1) DOCUMENT ORDER, HARD CAP OF 2. The two cues kept are simply the first two the
//      script happens to mention. In the audited film that was "impact" at 0.0s and
//      "whoosh" at 3.4s — both inside the first four seconds, and then 26 seconds of
//      nothing. Seven scenes had requested cues; five were silently discarded because
//      of where they sat in the array, not because of what they were.
//   2) NOTHING TIED THEM TO THE PICTURE. A cue fired at its scene's start whether or
//      not anything on screen moved at that moment, which is exactly what "random
//      sound effects unrelated to on-screen actions" describes. A "ding" over a scene
//      with no reveal, or a "riser" that builds to nothing, reads as noise.
//
// This module answers both: every candidate cue must be SUPPORTED by something the
// composition actually does at that moment, survivors are SPREAD across the runtime
// instead of clustered, and everything dropped is reported with a reason so the
// disclosure can say why the film is quieter than the script asked for.
//
// Pure + deterministic (no I/O, no LLM). The Audio Director still curates what
// survives — this decides what is even eligible to reach it.

// Cue families and what each one NEEDS to be true on screen to be worth firing.
//   cut      — a scene boundary (every composer animates an entrance there)
//   reveal   — something arrives mid-scene: an asset plate, a stat, an emphasis word
//   build    — only meaningful heading INTO a climax (the CTA / final scene)
//   never    — a bed/ambience, not an event; belongs to the music track, not SFX
const FAMILIES = [
  { rx: /^(impact|hit|thud|boom|slam|stomp|punch)$/i,               needs: "cut" },
  { rx: /^(whoosh|swoosh|swipe|transition|woosh|pass|sweep)$/i,     needs: "cut" },
  { rx: /^(riser|rise|build|buildup|ramp|uplifter)$/i,              needs: "build" },
  { rx: /^(ding|chime|bell|ping|notify|success|tick|click|pop|blip)$/i, needs: "reveal" },
  { rx: /^(sparkle|shimmer|twinkle|magic|glitter|glow)$/i,          needs: "reveal" },
  { rx: /^(type|typing|keyboard|keys|keystroke)$/i,                 needs: "reveal" },
  { rx: /^(ambient|ambience|room|crowd|nature|rain|wind|drone|hum)$/i, needs: "never" },
];

function familyFor(name) {
  const n = String(name || "").trim().toLowerCase();
  for (const f of FAMILIES) if (f.rx.test(n)) return f.needs;
  // Unknown cue names get the safest treatment a real cue can have: they must at
  // least land on a cut, where the picture always moves.
  return "cut";
}

// Does this scene actually SHOW something arriving? A stat number, an assigned
// visual, an emphasis word or a second line of on-screen text all mean the
// composition animates an element in mid-scene — a reveal a sound can land on.
function sceneHasReveal(scene, assetsByScene) {
  const ost = Array.isArray(scene.onScreenText) ? scene.onScreenText.filter(Boolean) : [];
  const hasNumber = ost.some((t) => /\d/.test(String(t))) || /\d/.test(String(scene.emphasis || ""));
  const hasAsset = !!(assetsByScene && assetsByScene.get(scene.id) || []).length;
  const hasSecondLine = ost.length >= 2;
  const p = String(scene.purpose || "").toLowerCase();
  const revealPurpose = /proof|stat|feature|how|result|metric/.test(p);
  return hasNumber || hasAsset || hasSecondLine || revealPurpose;
}

function isClimax(scene, i, total) {
  const p = String(scene.purpose || "").toLowerCase();
  return i >= total - 2 || /cta|close|outro|sign\s*up|download|subscribe|get\s*started/.test(p);
}

/**
 * Plan the film's SFX.
 *
 * @param {object[]} scenes        the approved script scenes (id/start/duration/purpose/sfx/onScreenText)
 * @param {Map}      assetsByScene sceneId -> assets assigned there (for the reveal test)
 * @param {number}   durationSec   film runtime, drives how many cues the film can carry
 * @returns {{ cues: {name,startSec,sceneId,support}[], dropped: {name,sceneId,reason}[], budget:number }}
 */
function planSfx({ scenes = [], assetsByScene = new Map(), durationSec = 30 } = {}) {
  const list = Array.isArray(scenes) ? scenes : [];
  const dropped = [];
  const eligible = [];

  // BUDGET scales with runtime instead of being a flat 2. Roughly one accent per
  // six seconds, floored at 2 and capped at 6 — enough to punctuate a film without
  // the "wall of sound" the old comment (rightly) worried about.
  const budget = Math.max(2, Math.min(6, Math.round((Number(durationSec) || 30) / 6)));

  list.forEach((sc, i) => {
    const cues = Array.isArray(sc.sfx) ? sc.sfx : [];
    const start = Number(sc.start) || 0;
    const dur = Number(sc.duration) || 0;
    const hasReveal = sceneHasReveal(sc, assetsByScene);
    const climax = isClimax(sc, i, list.length);
    let takenInScene = 0;

    for (const raw of cues) {
      const name = String(raw || "").trim();
      if (!name) continue;
      const needs = familyFor(name);

      if (needs === "never") {
        dropped.push({ name, sceneId: sc.id, reason: "ambience belongs to the music bed, not an SFX hit" });
        continue;
      }
      // ONE accent per scene. Two hits inside four seconds is clutter no matter how
      // well chosen, and the script routinely asks for pairs ("whoosh"+"sparkle").
      if (takenInScene >= 1) {
        dropped.push({ name, sceneId: sc.id, reason: "scene already carries an accent" });
        continue;
      }
      if (needs === "build" && !climax) {
        dropped.push({ name, sceneId: sc.id, reason: "a riser that builds to nothing — scene is not a climax" });
        continue;
      }
      if (needs === "reveal" && !hasReveal) {
        dropped.push({ name, sceneId: sc.id, reason: "no on-screen reveal for the sound to land on" });
        continue;
      }

      // WHEN. A cut-family cue punctuates the TRANSITION, so it lands slightly BEFORE
      // the boundary (the pre-existing -120ms nudge, kept: it stops the hit muddying
      // the next line's first word). A reveal-family cue belongs where the element
      // actually arrives, which every composer stages ~30% into the scene. A build
      // runs INTO the climax, so it starts early enough to be heard rising.
      let at = Math.max(0, start - 0.12);
      let support = "scene cut";
      if (needs === "reveal") { at = start + Math.min(1.2, dur * 0.3); support = "element reveal"; }
      else if (needs === "build") { at = Math.max(0, start - 0.9); support = "build into the climax"; }

      eligible.push({ name, startSec: Math.round(at * 100) / 100, sceneId: sc.id, needs, support });
      takenInScene++;
    }
  });

  // SPREAD, not first-come. Sort by time, then walk keeping a minimum gap so the
  // survivors punctuate the whole film rather than piling into the opening — the
  // exact failure of the old document-order cap.
  eligible.sort((a, b) => a.startSec - b.startSec);
  const minGap = Math.max(2.5, (Number(durationSec) || 30) / (budget * 2));

  // RESERVE THE CLIMAX. A greedy time-ordered walk spends its budget on whatever
  // happens first, so the one cue with the clearest job — the build into the CTA —
  // was the first thing dropped. Hold a slot for it so the film's ending lands.
  const climaxCue = [...eligible].reverse().find((c) => c.needs === "build")
    || [...eligible].reverse().find((c) => c.startSec >= (Number(durationSec) || 30) * 0.75);
  const walkBudget = climaxCue ? budget - 1 : budget;

  const cues = [];
  let lastAt = -Infinity, lastName = null;
  for (const c of eligible) {
    if (climaxCue && c === climaxCue) continue; // placed after the walk
    if (cues.length >= walkBudget) { dropped.push({ name: c.name, sceneId: c.sceneId, reason: "over the film's SFX budget" }); continue; }
    if (c.startSec - lastAt < minGap) { dropped.push({ name: c.name, sceneId: c.sceneId, reason: `too close to the previous accent (<${minGap.toFixed(1)}s)` }); continue; }
    // Never fire the same sound twice in a row — repetition reads as a glitch.
    if (c.name.toLowerCase() === String(lastName || "").toLowerCase()) {
      dropped.push({ name: c.name, sceneId: c.sceneId, reason: "same cue as the previous accent" });
      continue;
    }
    cues.push(c);
    lastAt = c.startSec;
    lastName = c.name;
  }
  if (climaxCue) {
    if (climaxCue.startSec - lastAt >= minGap * 0.6) cues.push(climaxCue);
    else dropped.push({ name: climaxCue.name, sceneId: climaxCue.sceneId, reason: "too close to the previous accent" });
  }
  cues.sort((a, b) => a.startSec - b.startSec);
  return { cues, dropped, budget };
}

module.exports = { planSfx, familyFor, sceneHasReveal };
