// Guard: a long film must keep the TEMPLATE'S OWN PACE, not stretch to fill.
//
// Covering a requested duration by stretching whatever beats survived produced a
// 10-minute film at 12s a beat against an authored 7.5s — every animation played
// at ~0.6x and the film read as sluggish. The beat COUNT is the free variable,
// not the beat LENGTH: pick the count nearest the template's authored pace and
// cast the script onto it, repeating interior beats when the script is short and
// dropping interior beats when it is long. The opener and closer are bookends and
// are never repeated.
//
// The engine caps the scene list at 50, so past 50 x authoredPace the beats MUST
// lengthen; that ceiling is asserted here too so it stays a known, reported limit
// rather than a surprise.

const assert = require("node:assert");
const adapter = require("../src/services/omelette_adapter");

let pass = 0, fail = 0;
const ok = (name, fn) => {
  try { fn(); console.log(`  ok    ${name}`); pass++; }
  catch (e) { console.error(`  FAIL  ${name}\n        ${e.message}`); fail++; }
};

function compose({ durationSec, nScenes, framePack = "hive-mind" }) {
  const scenes = [];
  const each = durationSec / nScenes;
  let t = 0;
  for (let i = 0; i < nScenes; i++) {
    scenes.push({
      id: `s${i + 1}`, start: t, duration: each,
      kind: i === 0 ? "title" : i === nScenes - 1 ? "cta" : "point",
      headline: `Beat ${i + 1} headline`, subtext: `Copy for beat ${i + 1}.`, voiceover: "vo",
    });
    t += each;
  }
  const built = adapter.buildComposition({
    storyboard: { title: "A film", durationSec, scenes },
    dims: { width: 1920, height: 1080, fps: 30 },
    framePack, assets: [], captionCues: null,
  });
  const blk = /<script type="__bundler\/template"[^>]*>([\s\S]*?)<\/script>/i.exec(built.indexHtml);
  const page = JSON.parse(blk[1]);
  const m = /window\.OM_SCENES\s*=\s*("(?:[^"\\]|\\.)*")\s*;/.exec(page);
  const om = JSON.parse(JSON.parse(m[1]));
  const total = om.reduce((a, s) => a + Number(s.dur), 0);
  return { om, beats: om.length, total, avg: total / om.length, meta: JSON.parse(built.metaJson).duration };
}

const ENGINE_MAX = 50;
const PACE = 7.5;   // these templates author ~7.5s beats

ok("a 300s film with a SHORT script still runs at the authored pace", () => {
  // 20 script scenes over 300s is 15s a beat if you just stretch — twice too slow.
  const r = compose({ durationSec: 300, nScenes: 20 });
  assert.ok(r.beats > 20, `beats not increased: ${r.beats}`);
  assert.ok(Math.abs(r.avg - PACE) < 2.5, `avg beat ${r.avg.toFixed(1)}s is far from the authored ${PACE}s`);
  assert.ok(Math.abs(r.total - 300) < 1.5, `total ${r.total}s != 300s`);
});

ok("a 300s film with a LONG script is trimmed, not crammed", () => {
  const r = compose({ durationSec: 300, nScenes: 60 });
  assert.ok(r.beats <= ENGINE_MAX, `${r.beats} beats exceeds the engine cap`);
  assert.ok(Math.abs(r.avg - PACE) < 2.5, `avg beat ${r.avg.toFixed(1)}s is far from ${PACE}s`);
  assert.ok(Math.abs(r.total - 300) < 1.5, `total ${r.total}s != 300s`);
});

ok("a 600s film uses every beat the engine allows", () => {
  const r = compose({ durationSec: 600, nScenes: 60 });
  // WHY THIS IS NO LONGER `=== 50`. This case feeds 60 scenes, and the adapter
  // used to reach a clean 50 by DROPPING ten of them — their narration still
  // played, over other scenes' copy (see test:alignom; that path showed the
  // wrong scene for 94% of a ten-minute film). Beats are now a partition of the
  // script: nothing is dropped, so a merged beat carries both scenes' copy and
  // costs more of the engine's 16KB scene budget, which trims a beat or two.
  // Two beats of pace is the price of the whole script reaching the screen.
  const FLOOR = ENGINE_MAX - 2;
  assert.ok(r.beats >= FLOOR && r.beats <= ENGINE_MAX,
    `expected ${FLOOR}-${ENGINE_MAX} beats, got ${r.beats}`);
  assert.ok(Math.abs(r.total - 600) < 1.5, `total ${r.total}s != 600s`);
  // Honest ceiling: 50 beats over 600s cannot be the authored pace, but it must
  // be the BEST available — i.e. no worse than duration/(beats actually used).
  assert.ok(r.avg <= 600 / FLOOR + 0.2, `avg beat ${r.avg.toFixed(1)}s is worse than the engine floor`);
});

ok("the film still covers its full duration at every length", () => {
  for (const [d, n] of [[60, 8], [180, 12], [300, 37], [480, 40], [600, 60]]) {
    const r = compose({ durationSec: d, nScenes: n });
    assert.ok(Math.abs(r.total - d) < 1.5, `${d}s film summed to ${r.total}s`);
    assert.ok(Math.abs(r.meta - d) < 1.5, `${d}s film declared ${r.meta}s in meta.json`);
  }
});

ok("no beat is shorter than the 1.2s floor at any length", () => {
  for (const [d, n] of [[60, 8], [300, 60], [600, 60]]) {
    const r = compose({ durationSec: d, nScenes: n });
    const short = r.om.filter((s) => Number(s.dur) < 1.2);
    assert.strictEqual(short.length, 0, `${d}s film has ${short.length} beat(s) under 1.2s`);
  }
});

ok("the film still opens and closes in the template's authored form", () => {
  // With 50 beats over ~39 authored shapes, shapes MUST recur — that is the
  // point of repeating interior beats. What must not drift is the film's shape:
  // it has to open on the template's own opener and close on its own closer,
  // whether the script was short (forcing repeats) or long (forcing trims).
  // The adapter picks the bookends from the template's intro/outro SLOTS
  // (classifySlots), not from raw index 0, so the invariant is stability: the
  // same template must open and close on the same shapes no matter how the
  // script's length forced the interior to be resampled.
  const cases = [[420, 6], [600, 60], [300, 37], [180, 12]];
  const seen = cases.map(([d, n]) => {
    const names = compose({ durationSec: d, nScenes: n }).om.map((s) => s.name);
    return { d, n, first: names[0], last: names[names.length - 1], names };
  });
  const { first, last } = seen[0];
  for (const s of seen) {
    assert.strictEqual(s.first, first, `${s.d}s/${s.n}sc opens on "${s.first}" but ${seen[0].d}s opens on "${first}"`);
    assert.strictEqual(s.last, last, `${s.d}s/${s.n}sc closes on "${s.last}" but ${seen[0].d}s closes on "${last}"`);
  }
  // And a repeat must never land ADJACENT to itself — back-to-back identical
  // shapes read as a stutter, which is the failure repeating could introduce.
  for (const s of seen) {
    for (let i = 1; i < s.names.length; i++) {
      assert.notStrictEqual(s.names[i], s.names[i - 1], `${s.d}s/${s.n}sc repeats "${s.names[i]}" back-to-back at beat ${i}`);
    }
  }
});

console.log(fail ? `\n${pass} passed, ${fail} failed` : `\nlong-form pace holds (${pass} checks)`);
process.exit(fail ? 1 : 0);
