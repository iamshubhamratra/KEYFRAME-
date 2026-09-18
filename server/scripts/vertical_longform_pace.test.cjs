// GATE: a vertical long-form film must keep cutting, and landscape must not move.
//
// The defect this locks out reached finished films: two 180s vertical jobs (blunt-object,
// deep-field-article) rendered eighteen clips of EXACTLY 10.0s each — one held frame per ~24-word
// block of narration — and the job had `pace: "very-fast"` selected, which asks for 2.33s scenes.
// Nothing was broken in the pacing engine; the FilmKit skin's authored deck length (`maxScenes: 18`)
// reached services/pacing.js as the renderer ceiling and overrode the mode 4x, silently.
//
// So the rule has two halves and BOTH are load-bearing:
//   VERTICAL   a portrait film-* pack plans against pacing.VERTICAL_FILM_SCENE_CAP, so a 3-minute
//              film cuts every ~3s instead of every 10s, and the renderer actually DRAWS those beats
//              (the film_stage backstop slice must agree with the pipeline's cap, or scenes whose
//              narration was already mixed get sliced away onto a neighbour's frame).
//   LANDSCAPE  unchanged. A wide frame carries a held shot far better than a phone does, and the
//              skins keep their authored deck length there. This half is the non-regression gate.
//
// Structural only: no browser, no network, no render.
const assert = require("node:assert");
const path = require("node:path");

const pacing = require("../src/services/pacing");
const pipeline = require("../src/services/pipeline");
const filmStage = require("../src/services/film_stage");

// A pack from each routing family. `blunt-object` is one of the two that shipped the defect.
const FILM_PACK = "blunt-object";
let passed = 0, failed = 0;
function t(name, fn) {
  try { fn(); passed++; console.log(`  ok  ${name}`); }
  catch (e) { failed++; process.exitCode = 1; console.error(`  FAIL ${name}\n       ${e && e.message ? e.message : e}`); }
}

console.log("\nvertical long-form pace");

t("a film-* pack draws more beats in vertical than in landscape", () => {
  const land = pipeline.sceneCapFor(FILM_PACK);
  const vert = pipeline.sceneCapFor(FILM_PACK, { vertical: true });
  assert.strictEqual(land, 18, "landscape keeps the skin's authored deck length");
  assert.strictEqual(vert, pacing.VERTICAL_FILM_SCENE_CAP, "vertical uses the pacing engine's ceiling");
  assert.ok(vert > land, `vertical ceiling ${vert} must exceed the authored ${land}`);
});

t("the vertical ceiling stays inside the engine's clip limit", () => {
  const { MAX_CLIPS } = require("../src/services/scene_fit");
  assert.ok(pacing.VERTICAL_FILM_SCENE_CAP <= MAX_CLIPS,
    `${pacing.VERTICAL_FILM_SCENE_CAP} beats exceeds the engine's ${MAX_CLIPS}-clip ceiling`);
});

t("180s vertical: the slides cut at ~3s, not 10s — at every pace mode", () => {
  const cap = pipeline.sceneCapFor(FILM_PACK, { vertical: true });
  for (const mode of ["very-fast", "fast", "normal"]) {
    const r = pacing.resolve(mode, { durationSec: 180, orientation: "vertical", rendererSceneCap: cap });
    assert.ok(r.scene.targetSec <= 3.6,
      `${mode}: ${r.scene.targetSec}s a slide (was 10.0s before the vertical ceiling)`);
    assert.ok(r.scene.count >= 50, `${mode}: only ${r.scene.count} scenes`);
    // Readability outranks pace everywhere in this engine: a slide no one can read is a bug at any speed.
    assert.ok(r.scene.targetSec >= pacing.SCENE_MIN_SEC,
      `${mode}: ${r.scene.targetSec}s is below the ${pacing.SCENE_MIN_SEC}s engine floor`);
    assert.ok(pacing.sceneWordCeiling(r, r.scene.targetSec) >= 5,
      `${mode}: ${pacing.sceneWordCeiling(r, r.scene.targetSec)} words a scene is too thin to narrate`);
  }
});

t("landscape is untouched: 180s still plans the skin's authored 18 scenes", () => {
  const cap = pipeline.sceneCapFor(FILM_PACK);
  const r = pacing.resolve("very-fast", { durationSec: 180, orientation: "landscape", rendererSceneCap: cap });
  assert.strictEqual(r.scene.count, 18);
  assert.strictEqual(r.scene.targetSec, 10);
});

t("the renderer DRAWS every planned beat — the backstop slice agrees with the pipeline", () => {
  const cap = pipeline.sceneCapFor(FILM_PACK, { vertical: true });
  const cfg = pacing.resolve("very-fast", { durationSec: 180, orientation: "vertical", rendererSceneCap: cap });
  const n = cfg.scene.count;
  const each = 180 / n;
  const scenes = Array.from({ length: n }, (_, i) => ({
    id: `s${i + 1}`, start: +(i * each).toFixed(3), duration: +each.toFixed(3),
    kind: i === 0 ? "hook" : i === n - 1 ? "cta" : "feature",
    headline: `Beat ${i + 1}`, subtext: `Line ${i + 1}.`, bullets: ["Fast", "Simple"],
  }));
  const skin = require(path.join("..", "src", "services", "film_skins", "blunt_object.js"));
  const built = filmStage.build(skin.SKIN || skin, {
    storyboard: { title: "Gate", durationSec: 180, scenes, pacing: cfg },
    dims: { width: 1080, height: 1920, fps: 30 },
    framePack: FILM_PACK,
    assets: [],
  });
  const html = built.indexHtml || "";
  const durs = [...html.matchAll(/data-start="[\d.]+"\s+data-duration="([\d.]+)"/g)].map((m) => +m[1]);
  // Full-runtime background clips are scenery, not slides.
  const slides = durs.filter((d) => d < 180 * 0.9);
  assert.strictEqual(slides.length, n, `planned ${n} beats, drew ${slides.length}`);
  assert.ok(Math.max(...slides) <= 3.6, `longest slide ${Math.max(...slides)}s`);
});

console.log(`\n${passed} passed, ${failed} failed${failed ? " — WITH FAILURES" : ""}\n`);
