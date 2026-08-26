// MORE SCENES THAN A RENDERER CAN DRAW: MERGE THEM, NEVER TRUNCATE THEM.
//
// Every composer built its clip list with a bare `sb.scenes.slice(0, N)` — 30 in
// template_engine (15 families + 7 dedicated ports), 30 in momentum and showcase,
// 14 in genesis, 12 in bauhaus/bloom/blueprint. Those numbers were written when a
// film was 30 seconds long and the request cap was 180s. The request cap is now
// 600s, and a 600s script is ~70 scenes.
//
// A truncation is not a styling choice, because THE VOICEOVER IS SYNTHESIZED PER
// SCENE and mixed at that scene's own start (pipeline.retimeScenesToVo). A scene
// the renderer dropped is still narrated — over whatever frame was on screen when
// the film ran out of beats. Measured on a 300s / 50-scene script: the picture's
// last new copy landed at 176s and the remaining ~2 minutes of narration played
// over one held frame. Nothing failed; every gate measures the composition, and
// the composition was internally consistent, just short.
//
// The rule here is a PARTITION, not a pace — the same rule the omelette adapter
// arrived at for bundled templates:
//   - every beat boundary falls on a scene boundary,
//   - every scene belongs to exactly one beat,
//   - a beat's duration is the sum of its members', so the film still spans the
//     whole runtime and the narration still lands inside the beat that carries
//     its words.
// Nothing is dropped and nothing repeats, so the picture and the voiceover stay
// on the same clock by construction rather than by luck.

// The ceiling a renderer can hold. scene_kit draws a 70-scene film uncapped in
// production, so this is a guard against a pathological storyboard (script.js
// admits up to 200 scenes), not a design limit. It sits ABOVE the longest real
// script on purpose: 600s is the longest film the server accepts and normalizes
// to ~70 scenes, so a real film never merges at all and every scene keeps its
// own beat. Merging is correct, but a beat that carries two scenes can only lead
// with one of them — measured at a 60 ceiling, a 600s film still lost 4-10
// scenes' headlines to a neighbour's frame.
const MAX_CLIPS = 72;

const r2 = (n) => Math.round(Number(n) * 100) / 100;

function listOf(v) { return Array.isArray(v) ? v.filter(Boolean).map(String) : []; }
function listArr(v) { return Array.isArray(v) ? v.filter(Boolean) : []; }

/**
 * Fold a contiguous run of scenes into ONE scene that spans their combined time.
 * The run's first scene leads (it is the one whose narration opens the beat); the
 * others' lead lines follow its own supporting copy, so the frame still shows the
 * words being spoken first and the absorbed beats' words below them.
 */
function mergeRun(run) {
  if (!Array.isArray(run) || run.length === 0) return null;
  if (run.length === 1) return run[0];
  const head = run[0];
  const rest = run.slice(1);
  const leadOf = (s) => String((s && (s.headline || s.title)) || "").trim();
  // OWN COPY FIRST. Putting the absorbed scenes' headlines at the FRONT of the
  // list is what made a merged beat's chips and rows read out the NEXT scene's
  // line while the current one was still being spoken.
  const dedupe = (arr) => {
    const seen = new Set();
    return arr.filter((x) => { const k = String(x).toLowerCase().trim(); if (!k || seen.has(k)) return false; seen.add(k); return true; });
  };
  const bullets = dedupe([...listOf(head.bullets), ...rest.map(leadOf).filter(Boolean)]);
  const onScreen = dedupe([...listOf(head.onScreenText), ...rest.flatMap((s) => listOf(s.onScreenText))]);
  return {
    ...head,
    duration: r2(run.reduce((a, s) => a + Math.max(0, Number(s && s.duration) || 0), 0)),
    bullets: bullets.slice(0, 6),
    onScreenText: onScreen.slice(0, 6),
    voiceover: run.map((s) => String((s && s.voiceover) || "").trim()).filter(Boolean).join(" "),
    // A SCRIPT scene also carries what it wants FETCHED. Keeping only the head's
    // needs would quietly halve a merged beat's media demand, so the run's needs
    // are unioned (to their schema caps) when the head has the field at all.
    ...(head.assetNeeds !== undefined ? { assetNeeds: run.flatMap((s) => listArr(s && s.assetNeeds)).slice(0, 3) } : {}),
    ...(head.sfx !== undefined ? { sfx: dedupe(run.flatMap((s) => listOf(s && s.sfx))).slice(0, 2) } : {}),
    // What the caller needs to know to split this clip back onto its members'
    // own boundaries if it can (see partsOf).
    __merged: run.length,
    __members: run.map((s) => ({
      id: s && s.id != null ? String(s.id) : null,
      duration: r2(Math.max(0, Number(s && s.duration) || 0)),
      headline: leadOf(s),
      subtext: String((s && s.subtext) || "").trim(),
      bullets: listOf(s && s.bullets),
    })),
  };
}

/**
 * Reduce a scene list to at most `max` entries without losing any of it.
 *
 * The opener and the closer are the film's authored bookends and are never
 * merged away while there is interior left to absorb the reduction. The interior
 * is partitioned into contiguous runs of near-equal COUNT, so the loss is spread
 * across the film instead of piling onto the tail.
 */
function fitScenes(scenes, max = MAX_CLIPS) {
  const list = Array.isArray(scenes) ? scenes.filter(Boolean) : [];
  const n = list.length;
  if (!n) return list;
  const want = Math.max(1, Math.floor(max) || MAX_CLIPS);
  if (n <= want) return list;
  if (want === 1) return [mergeRun(list)];
  if (want === 2) return [list[0], mergeRun(list.slice(1))];

  const first = list[0];
  const last = list[n - 1];
  const mid = list.slice(1, n - 1);
  const needMid = want - 2;
  if (!mid.length) return [first, last];
  if (needMid >= mid.length) return list;

  const out = [first];
  const base = Math.floor(mid.length / needMid);
  const extra = mid.length % needMid;        // the first `extra` runs take one more
  let at = 0;
  for (let g = 0; g < needMid; g++) {
    const size = base + (g < extra ? 1 : 0);
    out.push(mergeRun(mid.slice(at, at + size)));
    at += size;
  }
  out.push(last);
  return out;
}

/**
 * The member scenes of a (possibly merged) scene, each with its own offset INSIDE
 * the clip. A renderer that can cut inside a clip uses this to put each member's
 * own words on screen exactly while that member is being narrated; a renderer
 * that cannot simply ignores it and shows the head's copy for the whole beat.
 */
function partsOf(scene) {
  const members = scene && Array.isArray(scene.__members) ? scene.__members : null;
  if (!members || members.length < 2) {
    return [{ at: 0, duration: r2(Math.max(0, Number(scene && scene.duration) || 0)), scene }];
  }
  const out = [];
  let at = 0;
  for (const m of members) {
    out.push({
      at: r2(at),
      duration: m.duration,
      scene: { ...scene, headline: m.headline || scene.headline, title: m.headline || scene.title, subtext: m.subtext || scene.subtext, bullets: m.bullets.length ? m.bullets : scene.bullets },
    });
    at = r2(at + m.duration);
  }
  return out;
}

module.exports = { fitScenes, mergeRun, partsOf, MAX_CLIPS };
