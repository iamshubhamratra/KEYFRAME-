// Guard: on a BUNDLED-TEMPLATE film, does the screen show the scene being spoken?
//
// test:align covers the family/scene-kit path — it reads `.clip.tpl-scene`
// markup, which the omelette adapter does not emit. So the 167 packs on the
// omelette renderer (every long-form template among them) have never had an
// alignment gate at all, and a defect that made 94% of a ten-minute film show
// the wrong scene's copy shipped completely green.
//
// WHAT WENT WRONG, so this stays fixed. The adapter chose its beat COUNT from the
// template's authored pace and then forced the script into that count: too many
// scenes were dropped by an even stride, too few were CYCLED. Either way the
// voiceover kept the script's clock — voiceAgent places each clip at its scene's
// own `start` — while the picture was re-timed to the template's. Nothing carried
// the new beat boundaries back to the audio, so nothing could notice. Measured
// before the fix: 600s/70 scenes -> 4% of the runtime showed the scene being
// narrated, and 37 of the 70 scenes never reached the screen at all.
//
// The invariant is a partition, not a pace: a beat may SPLIT a scene (boundaries
// preserved) or MERGE whole adjacent scenes (boundaries preserved). It may never
// drop one, repeat one, or slide a boundary off a scene edge.

const assert = require("node:assert");
const adapter = require("../src/services/omelette_adapter");
const { fitScenes } = require("../src/services/scene_fit");
// pipeline.sceneCapFor() returns this for any pack on the omelette renderer.
const OMELETTE_BEAT_CAP = 50;

let pass = 0, fail = 0;
const ok = (name, fn) => {
  try { fn(); console.log(`  ok    ${name}`); pass++; }
  catch (e) { console.error(`  FAIL  ${name}\n        ${e.message}`); fail++; }
};

// Varied scene lengths on purpose: equal-length scenes let a stride+rescale
// accidentally land back in place, which hides the defect.
function varied(n, total) {
  const out = [];
  let sum = 0;
  for (let i = 0; i < n; i++) { const d = 3 + ((i * 7) % 9); out.push(d); sum += d; }
  const k = total / sum;
  return out.map((d) => Math.round(d * k * 100) / 100);
}

/** Build a film whose every scene tags its own copy, and report what a viewer sees. */
function measure({ template, total, durations }) {
  const scenes = [];
  let t = 0;
  durations.forEach((d, i) => {
    const tag = `MARK${String(i + 1).padStart(3, "0")}`;
    scenes.push({
      id: `s${i + 1}`, start: Math.round(t * 100) / 100, duration: d,
      kind: i === 0 ? "title" : i === durations.length - 1 ? "cta" : "point",
      headline: `${tag} headline`,
      subtext: `${tag} supporting line for this beat.`,
      voiceover: `${tag} narration for scene ${i + 1}.`,
    });
    t += d;
  });

  // The fold the pipeline applies before the storyboard and the VO exist. Every
  // scene survives it — two scenes that must share a frame are merged into one
  // scene, so they also share one narration clip.
  const folded = fitScenes(scenes, OMELETTE_BEAT_CAP);
  let t2 = 0;
  for (const sc of folded) { sc.start = Math.round(t2 * 100) / 100; t2 = Math.round((t2 + (Number(sc.duration) || 0)) * 100) / 100; }

  const built = adapter.buildComposition({
    storyboard: { title: "Alignment probe", durationSec: total, scenes: folded, brand: "Probe" },
    dims: { width: 1920, height: 1080, fps: 30 },
    template, assets: [],
  });

  const blk = /<script type="__bundler\/template"[^>]*>([\s\S]*?)<\/script>/i.exec(built.indexHtml);
  assert.ok(blk, "built film carries no __bundler/template block");
  const page = JSON.parse(blk[1]);
  const m = /window\.OM_SCENES\s*=\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")\s*;/.exec(page);
  assert.ok(m, "built film exposes no OM_SCENES");
  const lit = m[1];
  const beats = JSON.parse(lit[0] === '"' ? JSON.parse(lit) : lit.slice(1, -1).replace(/\\'/g, "'").replace(/\\\\/g, "\\"));

  // Which script scene does each beat carry? A beat may legitimately carry more
  // than one after a merge, so collect every tag it shows.
  const tagsOf = (b) => [...new Set((JSON.stringify(b).match(/MARK(\d\d\d)/g) || []).map((s) => parseInt(s.slice(4), 10)))];
  const rows = [];
  let bt = 0;
  for (const b of beats) {
    const dur = Number(b.dur) || 0;
    rows.push({ start: bt, end: bt + dur, tags: tagsOf(b) });
    bt = Math.round((bt + dur) * 100) / 100;
  }

  const shown = new Set(rows.flatMap((r) => r.tags));
  const spokenAt = (T) => {
    for (let i = 0; i < scenes.length; i++) {
      if (T >= scenes[i].start && T < scenes[i].start + scenes[i].duration) return i + 1;
    }
    return scenes.length;
  };
  const showingAt = (T) => {
    for (const r of rows) if (T >= r.start && T < r.end) return r.tags;
    return rows.length ? rows[rows.length - 1].tags : [];
  };

  let match = 0;
  const secs = Math.floor(total);
  for (let T = 0; T < secs; T++) if (showingAt(T).includes(spokenAt(T))) match++;

  return {
    sceneCount: scenes.length, beatCount: beats.length,
    filmSec: Math.round(bt * 100) / 100,
    neverShown: scenes.length - shown.size,
    matchPct: Math.round((100 * match) / secs),
    longestBeat: Math.round(Math.max(...rows.map((r) => r.end - r.start)) * 10) / 10,
  };
}

// The shapes that actually ship: a reel, a short, and the two long-form lengths.
//
// `minMatch` / `maxUnshown` are a RATCHET: they hold the line at what has been
// measured, so the numbers can only improve.
//
// Before this guard existed: 33 / 42 / 13 / 25 / 4 / 11 percent respectively,
// with 5, 9, 14, 20, 37 and 0 scenes narrated but never shown.
//
// 2026-08-24: THE LAST GAP CLOSED UPSTREAM, exactly where the note here said it
// belonged. A 60-70 scene script could never give every scene its own beat under
// the engine's 50-beat / 16KB ceiling, so the adapter merged — and a merged beat
// leads with one of its two scenes while the other one is being spoken. The
// script is now folded to the renderer's beat ceiling BEFORE the storyboard and
// the voiceover are built (pipeline.foldScriptToRenderer / sceneCapFor), so two
// scenes that must share a frame also share one narration clip and one boundary.
// `fold` mirrors that here: without it this file measures a path production no
// longer takes. End-to-end coverage lives in `npm run check:av-sync`.
const CASES = [
  { label: "30s reel",        template: "FetchVertical", total: 30,  n: 10, minMatch: 95, maxUnshown: 0 },
  { label: "60s short",       template: "FetchVertical", total: 60,  n: 20, minMatch: 95, maxUnshown: 0 },
  { label: "90s explainer",   template: "HiveMind",      total: 90,  n: 26, minMatch: 95, maxUnshown: 1 },
  { label: "300s long-form",  template: "HiveMind",      total: 300, n: 60, minMatch: 90, maxUnshown: 6 },
  { label: "600s long-form",  template: "HiveMind",      total: 600, n: 70, minMatch: 85, maxUnshown: 10 },
  // Fewer scenes than the template wants beats — the CYCLE path, which repeated
  // interior scenes and desynced a film without dropping anything at all.
  { label: "300s, few scenes", template: "HiveMind",     total: 300, n: 20, minMatch: 95, maxUnshown: 0 },
];

const results = [];
for (const c of CASES) {
  const r = measure({ template: c.template, total: c.total, durations: varied(c.n, c.total) });
  results.push({ ...c, ...r });
}

console.log("\n  case              script  beats  never-shown  screen-matches-voice");
for (const r of results) {
  console.log(`  ${r.label.padEnd(17)} ${String(r.sceneCount).padStart(5)}  ${String(r.beatCount).padStart(5)}  ${String(r.neverShown).padStart(11)}  ${String(r.matchPct + "%").padStart(20)}`);
}
console.log("");

// 1 — NOTHING THE SCRIPT WROTE MAY VANISH. Where the script fits the engine's
// beat ceiling this is absolute: a scene that is narrated but never shown is copy
// the user paid for, read aloud over a picture of something else.
for (const r of results) {
  ok(`${r.label}: every scene's copy reaches the screen`, () => {
    assert.ok(r.neverShown <= r.maxUnshown,
      `${r.neverShown} of ${r.sceneCount} scenes are narrated but never shown (allowed ${r.maxUnshown})`);
  });
}

// 2 — THE SCREEN SHOWS WHAT IS BEING SAID. Never quite 100% even at best: a beat
// boundary can land mid-second, and a merged beat spans two scenes but can only
// lead with one.
for (const r of results) {
  ok(`${r.label}: the screen shows the scene being spoken`, () => {
    assert.ok(r.matchPct >= r.minMatch,
      `only ${r.matchPct}% of the runtime shows the scene being narrated (floor ${r.minMatch}%)`);
  });
}

// 3 — the film still covers its full requested length (the frozen-tail guard).
for (const r of results) {
  ok(`${r.label}: the film spans its full duration`, () => {
    assert.ok(Math.abs(r.filmSec - r.total) <= 1.5, `film runs ${r.filmSec}s for a ${r.total}s job`);
  });
}

// 4 — NO BEAT MAY SWALLOW THE FILM. Covering the duration is not the same as
// cutting through it: a shed pass that folded every surplus beat into the same
// neighbour produced a single 68.6s held frame while the narration ran through
// eleven scenes. Total runtime was still exact, so check 3 stayed green and the
// stall was invisible — the frozen tail again, wearing a different hat.
for (const r of results) {
  ok(`${r.label}: no single beat swallows the film`, () => {
    const cap = Math.max(20, (r.total / Math.max(1, r.beatCount)) * 3);
    assert.ok(r.longestBeat <= cap,
      `longest beat is ${r.longestBeat}s in a ${r.total}s film of ${r.beatCount} beats (cap ${Math.round(cap)}s)`);
  });
}

console.log(fail ? `\n${fail} failing` : `\nbundled-template films show what they say (${pass} checks)`);
process.exit(fail ? 1 : 0);
