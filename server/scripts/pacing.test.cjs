#!/usr/bin/env node
// PACING ENGINE GUARDS — run: npm run test:pacing
//
// The first block is the one that matters: NEUTRALITY. The pacing engine took
// over 27 constants that were previously written literally in nine modules, and
// `normal` has to reproduce every one of them exactly. Not approximately —
// exactly, because a rounding difference (0.5/1.0 vs 0.5) changes the emitted
// GSAP source and therefore every rendered frame of every existing film.
//
// The snapshot below is the pre-change source of truth, each entry carrying the
// file:line it was lifted from. If a value here has to change to make the suite
// pass, the formula is wrong — not the fixture.

const assert = require("node:assert");
const pacing = require("../src/services/pacing");

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log(`  ok    ${name}`); }
  catch (e) { fail++; console.log(`  FAIL  ${name}\n        ${e.message}`); }
}

// ---------------------------------------------------------------- neutrality
const TODAY = {
  "script.js:50 WORDS_PER_SEC":            ["wordsPerSec", 2.6],
  "script.js:52 VO_TOLERANCE":             ["voTolerance", 1.35],
  "system_script.md:38 scene seconds":     ["sceneSec", 3.5],
  "system_script.md:45 scene min":         ["sceneMin", 2.5],
  "system_script.md:45 scene max":         ["sceneMax", 6],
  "storyboard.js:49 clampDur upper":       ["sceneCap", 15],
  "storyboard.js:162 expandToCover max":   ["maxScenes", 70],
  "storyboard.js:162 expandToCover pace":  ["expandPace", 8.5],
  "pipeline.js:1502 scene floor":          ["sceneFloor", 2],
  "omelette_adapter.js:1365 beatTarget":   ["beatSec", 3],
  "omelette_adapter.js:1481 part floor":   ["beatFloor", 2],
  "omelette_adapter.js:321 MIN_CUT_SEC":   ["minCutSec", 2],
  "omelette_adapter.js:2696 TARGET_BEAT":  ["segmentBeatSec", 3],
  "omelette authored pace factor":         ["authoredPaceFactor", 1],
  "motion arrival factor":                 ["arrivalFactor", 1],
  "motion ambient factor":                 ["ambientFactor", 1],
  "camera factor (never scales)":          ["cameraFactor", 1],
  "script_overlay.js:70 maxWords land":    ["overlayMaxWordsLand", 5],
  "script_overlay.js:70 maxWords portrait":["overlayMaxWordsPortrait", 4],
  "script_overlay.js:87 phrase floor":     ["readLeadIn", 0.35],
  "text_director.js:76 bullets":           ["bulletsMax", 3],
  "text_director.js:67 subtext chars":     ["subtextChars", 90],
};
const TODAY_VO = {
  "vo_fit.js:12 targetWords rate": ["rate", 2.6],
  "vo_fit.js:124 tighten trigger": ["tightenAt", 1.10],
  "vo_fit.js:141 hard cap":        ["hardCap", 1.25],
  "vo_fit.js:143 atempo ceiling":  ["atempoMax", 1.18],
  "pipeline.js:1485 VO_TAIL":      ["tail", 0.55],
};
const TODAY_AUDIO = {
  "graph.js:1419 sfx per scene": ["sfxPerScene", 0.8],
  "graph.js:1419 sfx cap":       ["sfxCapMax", 10],
  "audio_mix.js:42 RAMP_SEC":    ["rampSec", 0.9],
  "envelope spread":             ["envelopeSpread", 1],
};

const N = pacing.resolve("normal");

for (const [source, [field, value]] of Object.entries(TODAY)) {
  test(`normal reproduces ${source}`, () => assert.strictEqual(N[field], value));
}
for (const [source, [field, value]] of Object.entries(TODAY_VO)) {
  test(`normal reproduces ${source}`, () => assert.strictEqual(N.vo[field], value));
}
for (const [source, [field, value]] of Object.entries(TODAY_AUDIO)) {
  test(`normal reproduces ${source}`, () => assert.strictEqual(N.audio[field], value));
}
test("normal is flagged neutral", () => assert.ok(pacing.isNeutral(N)));
test("normal hands audio drive back to the existing heuristic", () => assert.strictEqual(N.audio.drive, "auto"));
test("normal readCps is the 13 c/s base", () => assert.strictEqual(N.readCps, 13));

// ---------------------------------------------------------------- resolution
test("unknown / missing / junk all fall back to the default", () => {
  for (const junk of [undefined, null, "", "turbo", 42, {}, { pace: "nope" }, []]) {
    assert.strictEqual(pacing.resolve(junk).key, "normal", `input ${JSON.stringify(junk)}`);
  }
});
test("a job row resolves by its pace column", () => {
  assert.strictEqual(pacing.resolve({ id: "x", pace: "fast" }).key, "fast");
});
test("a legacy job row with no pace column resolves neutral", () => {
  assert.strictEqual(pacing.resolve({ id: "x", duration: 30 }).key, "normal");
});
test("resolve is idempotent (a profile passed back returns itself)", () => {
  const p = pacing.resolve("veryFast");
  assert.strictEqual(pacing.resolve(p), p);
});
test("an opts bag carrying {pacing} resolves", () => {
  assert.strictEqual(pacing.resolve({ pacing: "relaxed" }).key, "relaxed");
});
test("profiles are frozen — a consumer cannot repaint another film's pace", () => {
  const p = pacing.resolve("fast");
  assert.ok(Object.isFrozen(p) && Object.isFrozen(p.vo) && Object.isFrozen(p.audio));
  assert.throws(() => { "use strict"; p.beatSec = 99; });
});
test("every configured mode builds", () => {
  assert.ok(pacing.MODES.length >= 4);
  for (const k of pacing.MODES) assert.strictEqual(pacing.resolve(k).key, k);
});

// ---------------------------------------------------------------- monotonicity
const ORDER = ["relaxed", "normal", "fast", "veryFast"];
test("faster modes mean shorter scenes and denser cuts, monotonically", () => {
  const p = ORDER.map((k) => pacing.resolve(k));
  for (let i = 1; i < p.length; i++) {
    assert.ok(p[i].sceneSec < p[i - 1].sceneSec, `sceneSec ${ORDER[i]}`);
    assert.ok(p[i].beatSec <= p[i - 1].beatSec, `beatSec ${ORDER[i]}`);
    assert.ok(p[i].multiplier > p[i - 1].multiplier, `multiplier ${ORDER[i]}`);
  }
});
test("faster modes author fewer words for the same runtime", () => {
  const words = (k) => {
    const p = pacing.resolve(k), t = pacing.sceneTargetFor(60, p);
    return t.sceneCount * pacing.wordBudget(t.sceneSec, p);
  };
  assert.ok(words("veryFast") < words("fast"), "veryFast < fast");
  assert.ok(words("fast") < words("normal"), "fast < normal");
});
test("no mode may cut below the flicker floor", () => {
  for (const k of pacing.MODES) {
    const p = pacing.resolve(k);
    assert.ok(p.beatSec >= pacing.CUT_FLOOR_SEC, `${k} beatSec`);
    assert.ok(p.beatFloor >= pacing.CUT_FLOOR_SEC, `${k} beatFloor`);
    assert.ok(p.minCutSec >= pacing.CUT_FLOOR_SEC, `${k} minCutSec`);
  }
});
test("no mode may narrate a scene below the 2s floor", () => {
  for (const k of pacing.MODES) {
    assert.ok(pacing.resolve(k).sceneMin >= pacing.SCENE_FLOOR_SEC, k);
    assert.strictEqual(pacing.resolve(k).sceneFloor, 2, k);
  }
});
test("atempo stays a backstop at every pace — never the mechanism", () => {
  for (const k of pacing.MODES) assert.strictEqual(pacing.voFit(k).atempoMax, 1.18, k);
});
test("ambient motion scales less than arrivals (contrast is the point)", () => {
  for (const k of pacing.MODES) {
    const p = pacing.resolve(k);
    if (p.multiplier > 1) assert.ok(p.ambientFactor < p.arrivalFactor, k);
    assert.strictEqual(p.cameraFactor, 1, `${k} camera must never scale`);
  }
});

// ---------------------------------------------------------------- readability
test("readability barely moves with pace — the eye does not speed up", () => {
  for (const k of pacing.MODES) {
    const cps = pacing.resolve(k).readCps;
    assert.ok(cps >= 13 * 0.85 - 1e-9 && cps <= 13 * 1.15 + 1e-9, `${k} readCps ${cps}`);
  }
});
test("holdSecFor grows with the text and is empty-safe", () => {
  const p = pacing.resolve("fast");
  assert.strictEqual(pacing.holdSecFor("", p), 0);
  assert.strictEqual(pacing.holdSecFor(null, p), 0);
  assert.ok(pacing.holdSecFor("a much longer headline than the other one", p) > pacing.holdSecFor("short", p));
});
test("fitsCopy vetoes copy that cannot be read in the time", () => {
  const p = pacing.resolve("veryFast");
  const long = "A headline far too long to be read inside a beat and a half of screen time";
  assert.ok(!pacing.fitsCopy(long, 1.6, p));
  assert.ok(pacing.fitsCopy("Ship faster", 4, p));
});
// ------------------------------------------------------- the density contract
// SUPERSEDES "a fast film asks for LESS copy, not faster reading".
//
// That test pinned bulletsMax as FALLING with pace, alongside subtextChars and
// the overlay word caps. It was the design decision behind the "fast pace looks
// empty" report: the narration budget and every on-screen text budget divided by
// the same multiplier, so a Very Fast scene got 0.51x the words AND 0.67x the
// pills — the frame lost information exactly where the voice stopped carrying
// it. The contract now splits those two directions apart.
test("a fast film shortens each ELEMENT, never the element count", () => {
  const n = pacing.resolve("normal");
  for (const k of ["fast", "veryFast"]) {
    const f = pacing.resolve(k);
    // Per element: shorter, so it can be read in a shorter scene.
    assert.ok(f.subtextChars < n.subtextChars, `${k} subtextChars`);
    assert.ok(f.overlayMaxWordsLand <= n.overlayMaxWordsLand, `${k} overlay words`);
    assert.ok(f.visual.lineMaxChars <= n.visual.lineMaxChars, `${k} lineMaxChars`);
    // Per scene: MORE elements, because the narration gave words up.
    assert.ok(f.bulletsMax > n.bulletsMax, `${k} bulletsMax ${f.bulletsMax} !> ${n.bulletsMax}`);
    assert.ok(f.visual.elements > n.visual.elements, `${k} elements`);
    assert.ok(f.visual.keyPoints >= n.visual.keyPoints, `${k} keyPoints`);
  }
});
test("visual gain tracks the narration deficit, not the multiplier", () => {
  const n = pacing.resolve("normal");
  assert.strictEqual(n.visual.gain, 1, "normal has no deficit to make up");
  const f = pacing.resolve("fast"), vf = pacing.resolve("veryFast");
  // Very Fast drops more narration than Fast, so it owes the frame more.
  assert.ok(vf.visual.gain > f.visual.gain, `${vf.visual.gain} !> ${f.visual.gain}`);
  assert.ok(f.visual.gain > 1);
  // …and the deficit really is the ratio of words-per-scene against Normal.
  const wps = (p) => p.sceneSec * p.wordsPerSec;
  assert.ok(Math.abs(f.visual.gain - wps(n) / wps(f)) < 0.02, "fast gain matches the word ratio");
});
test("density never becomes a wall of text", () => {
  for (const k of pacing.MODES) {
    const p = pacing.resolve(k);
    // Whatever a scene CARRIES, only a readable group is on screen at once.
    assert.ok(p.visual.maxSimultaneous <= 4, `${k} maxSimultaneous`);

  }
  // READING PRESSURE MUST NOT RISE WITH PACE. A max-length element already needs
  // longer than one scene at Normal (58 chars = 4.8s of reading in a 3.5s scene)
  // — that overhang is pre-existing, is why scene_kit's fitCopyList veto exists,
  // and is survivable because elements persist and arrive on a stagger. What
  // density must not do is make it WORSE, so the ratio is the contract: the time
  // a full-length line needs, over the time the scene gives it.
  const pressure = (p) => pacing.holdSecFor("x".repeat(p.visual.lineMaxChars), p) / p.sceneSec;
  const n = pressure(pacing.resolve("normal"));
  for (const k of ["fast", "veryFast"]) {
    const f = pressure(pacing.resolve(k));
    assert.ok(f <= n + 1e-9, `${k} reading pressure ${f.toFixed(3)} > normal ${n.toFixed(3)}`);
  }
});
test("slotCount leaves every layout untouched at neutral and below", () => {
  for (const k of ["relaxed", "normal"]) {
    for (const designed of [0, 1, 2, 3, 4, 6]) {
      assert.strictEqual(pacing.slotCount(designed, k), designed, `${k} slot(${designed})`);
    }
  }
});
test("slotCount widens a layout only within what the eye can group", () => {
  for (const k of ["fast", "veryFast"]) {
    const p = pacing.resolve(k);
    assert.ok(pacing.slotCount(3, p) > 3, `${k} should widen a 3-slot row`);
    for (const designed of [1, 2, 3, 4, 6]) {
      const n = pacing.slotCount(designed, p);
      assert.ok(n >= designed, `${k} slot(${designed}) must never shrink a layout`);
      // Never past the group size — a row drawn for three shows four, not eight.
      assert.ok(n <= Math.max(designed, p.visual.maxSimultaneous), `${k} slot(${designed}) = ${n}`);
    }
  }
});
test("relaxed and normal keep today's density exactly", () => {
  for (const k of ["relaxed", "normal"]) {
    const p = pacing.resolve(k);
    assert.strictEqual(p.visual.gain, 1, `${k} gain`);
    assert.strictEqual(p.visual.elements, 4, `${k} elements`);
    assert.strictEqual(p.visual.maxSimultaneous, 3, `${k} maxSimultaneous`);
    assert.strictEqual(p.bulletsMax, 3, `${k} bulletsMax`);
  }
});

// ---------------------------------------------------------------- budgets
test("wordBudget floors at 3 words even for a sliver of a scene", () => {
  assert.strictEqual(pacing.wordBudget(0.1, "veryFast"), 3);
  assert.strictEqual(pacing.wordBudget(0, "normal"), 3);
});
test("wordBudget at normal reproduces vo_fit's own arithmetic", () => {
  for (const sec of [2, 3.5, 4, 7.5, 12]) {
    assert.strictEqual(pacing.wordBudget(sec, "normal"), Math.max(3, Math.floor(sec * 2.6)), `${sec}s`);
  }
});
test("a verbose language gets FEWER words for the same seconds", () => {
  const de = pacing.wordBudget(4, "normal", { expansion: 1.35 });
  const en = pacing.wordBudget(4, "normal", { expansion: 1 });
  assert.ok(de < en, `${de} !< ${en}`);
  assert.strictEqual(en, pacing.wordBudget(4, "normal"), "english must be unchanged by construction");
});
test("sceneTargetFor never returns fewer than 2 scenes or more than the cap", () => {
  for (const k of pacing.MODES) {
    const p = pacing.resolve(k);
    assert.ok(pacing.sceneTargetFor(1, p).sceneCount >= 2, `${k} tiny film`);
    assert.ok(pacing.sceneTargetFor(600, p).sceneCount <= p.maxScenes, `${k} long film`);
    assert.ok(pacing.sceneTargetFor(0, p).sceneCount >= 2, `${k} zero`);
  }
});
test("beatTargetFor respects a template's own slower native pace floor", () => {
  const p = pacing.resolve("veryFast");
  assert.ok(pacing.beatTargetFor(7.5, p) <= p.beatSec);
  assert.ok(pacing.beatTargetFor(0, p) >= pacing.CUT_FLOOR_SEC);
  assert.ok(pacing.beatTargetFor(1.0, p) >= pacing.CUT_FLOOR_SEC, "never below the flicker floor");
});
test("textfxSpeed composes with the pack and stays in scene_kit's band", () => {
  for (const k of pacing.MODES) {
    for (const packSpeed of [0.85, 1, 1.3, 1.6]) {
      const v = pacing.textfxSpeed(packSpeed, k);
      assert.ok(v >= 0.85 && v <= 1.6, `${k}/${packSpeed} -> ${v}`);
    }
  }
  assert.strictEqual(pacing.textfxSpeed(1.2, "normal"), 1.2, "normal must not move a pack's own speed");
});
test("describe() names the mode and its numbers", () => {
  assert.match(pacing.describe("fast"), /Fast 1\.25x/);
});

// ------------------------------------------------- the timeline at every pace
// Every other storyboard suite calls normalizeTimeline with no profile, i.e. only
// ever at Normal — which is exactly how a Very Fast film that could not reach its
// own runtime shipped undetected. A split HALVES a scene but floors each half at
// 2s, so densifying an 8-scene 30s film produced 16 x 2.0s = 32s, the rescale
// could not get back under 30s, validate() rejected it, and generateStoryboard
// threw after burning all three attempts. This walks the grid of director answers
// the prompt actually asks for and insists the timeline still adds up.
const storyboard = require("../src/services/storyboard");
function directorAnswer(n, total) {
  const scenes = []; let t = 0; const d = total / n;
  for (let i = 0; i < n; i++) {
    scenes.push({
      id: `s${i + 1}`, start: Math.round(t * 10) / 10, duration: d, kind: "point",
      headline: `Headline ${i + 1}`, subtext: `Supporting line ${i + 1}.`,
      bullets: ["first point", "second point"],
      voiceover: `Narration ${i + 1}. A second sentence for scene ${i + 1}.`,
    });
    t += d;
  }
  return { title: "T", scenes };
}
test("every pace can still reach its runtime (prompt-legal director answers)", () => {
  const bad = [];
  for (const total of [10, 15, 18, 20, 25, 30, 45, 50, 60, 75, 90, 120, 180, 300, 600]) {
    for (const n of [Math.max(2, Math.ceil(total / 4)), Math.max(2, Math.ceil(total / 8)), Math.max(2, Math.ceil(total / 12))]) {
      if (total / n > 15) continue;                       // outside the prompt's own band
      for (const mode of pacing.MODES) {
        const sb = directorAnswer(n, total);
        storyboard.normalizeTimeline(sb, total, mode);
        const sum = Math.round(sb.scenes.reduce((a, s) => a + s.duration, 0) * 10) / 10;
        if (Math.abs(sum - total) > 0.2) bad.push(`${mode} ${total}s/${n}sc -> ${sb.scenes.length}sc/${sum}s`);
        const floor = sb.scenes.some((s) => s.duration < pacing.SCENE_FLOOR_SEC - 1e-9);
        if (floor) bad.push(`${mode} ${total}s/${n}sc broke the ${pacing.SCENE_FLOOR_SEC}s floor`);
      }
    }
  }
  assert.deepStrictEqual(bad.slice(0, 6), [], `${bad.length} timeline(s) cannot reach their runtime`);
});
test("normalizeTimeline is idempotent at every pace", () => {
  for (const mode of pacing.MODES) {
    const sb = directorAnswer(8, 30);
    storyboard.normalizeTimeline(sb, 30, mode);
    const once = sb.scenes.map((s) => `${s.id}:${s.duration}`).join(",");
    storyboard.normalizeTimeline(sb, 30, mode);
    const twice = sb.scenes.map((s) => `${s.id}:${s.duration}`).join(",");
    assert.strictEqual(twice, once, `${mode} re-normalized to a different timeline`);
  }
});
test("only the faster modes densify — relaxed and normal keep the director's count", () => {
  const counts = {};
  for (const mode of pacing.MODES) {
    const sb = directorAnswer(8, 30);
    storyboard.normalizeTimeline(sb, 30, mode);
    counts[mode] = sb.scenes.length;
  }
  assert.strictEqual(counts.relaxed, counts.normal, "relaxed must not densify");
  assert.ok(counts.fast >= counts.normal, "fast must not be sparser than normal");
  assert.ok(counts.veryFast >= counts.fast, "veryFast must not be sparser than fast");
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
