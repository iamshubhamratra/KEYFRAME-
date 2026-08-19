// Guard: a long-form film must SPAN the whole requested duration.
//
// The omelette adapter sheds beats to fit the engine's hard limits (50 scenes,
// 16KB of OM_SCENES): it slices the storyboard, strips gallery walls, trims copy
// and finally splices whole scenes out. Every one of those took its seconds with
// it, so the composition declared less time than the job asked for. hyperframes
// captured the short composition, the mixer laid the full-length voiceover over
// it, and the picture froze on its last frame while the narrator kept talking —
// a 300s job stuck at 2:45.
//
// Nothing failed: lint passed, contrast passed, the render "succeeded". Only
// watching the video showed it. Hence this test.

const assert = require("node:assert");
const adapter = require("../src/services/omelette_adapter");

let pass = 0, fail = 0;
const ok = (name, fn) => {
  try { fn(); console.log(`  ok    ${name}`); pass++; }
  catch (e) { console.error(`  FAIL  ${name}\n        ${e.message}`); fail++; }
};

function storyboardOf(nScenes, durationSec) {
  const each = durationSec / nScenes;
  const scenes = [];
  let t = 0;
  for (let i = 0; i < nScenes; i++) {
    scenes.push({
      id: `s${i + 1}`, start: Math.round(t * 100) / 100, duration: Math.round(each * 100) / 100,
      kind: i === 0 ? "title" : i === nScenes - 1 ? "cta" : "point",
      headline: `Beat ${i + 1} headline about the subject`,
      subtext: `Supporting line for beat ${i + 1} carrying real sentence-length copy.`,
      voiceover: `This is the narration for beat ${i + 1}.`,
      onScreenText: [`Beat ${i + 1}`],
    });
    t += each;
  }
  return { title: "A long-form film", durationSec, scenes };
}

/** Build through the real adapter and read back what the film declares. */
function declaredDuration({ nScenes, durationSec, framePack }) {
  const built = adapter.buildComposition({
    storyboard: storyboardOf(nScenes, durationSec),
    dims: { width: 1920, height: 1080, fps: 30 },
    framePack,
    assets: [],
    captionCues: null,
  });
  const meta = JSON.parse(built.metaJson);
  const m = /data-duration="([0-9.]+)"/.exec(built.indexHtml);
  return { meta: meta.duration, attr: m ? Number(m[1]) : null, html: built.indexHtml };
}

/** The beats the engine will actually play.
 *  OM_SCENES is a JSON string assigned inside the page, and that whole page is
 *  itself JSON-encoded inside the `__bundler/template` block — so reading it back
 *  means decoding twice, the same way the engine does. */
function playedScenes(html) {
  const blk = /<script type="__bundler\/template"[^>]*>([\s\S]*?)<\/script>/i.exec(html);
  assert.ok(blk, "no __bundler/template block in the composed page");
  const page = JSON.parse(blk[1]);
  const m = /window\.OM_SCENES\s*=\s*("(?:[^"\\]|\\.)*")\s*;/.exec(page);
  assert.ok(m, "no OM_SCENES assignment inside the template page");
  const payload = JSON.parse(m[1]);           // -> the JSON text the film parses
  return { scenes: JSON.parse(payload), bytes: payload.length };
}

const near = (a, b, tol, what) =>
  assert.ok(Math.abs(a - b) <= tol, `${what}: got ${a}, expected ~${b} (±${tol})`);

// 60 scenes / 600s is the shape that broke: well past the 50-scene slice AND
// past 16KB, so both shedding paths run.
ok("a 600s / 60-scene film declares the full 600s", () => {
  const d = declaredDuration({ nScenes: 60, durationSec: 600, framePack: "allotment" });
  near(d.meta, 600, 1.5, "meta.json duration");
  near(d.attr, 600, 1.5, "data-duration attribute");
});

ok("a 300s / 40-scene film declares the full 300s", () => {
  const d = declaredDuration({ nScenes: 40, durationSec: 300, framePack: "field-notes" });
  near(d.meta, 300, 1.5, "meta.json duration");
  near(d.attr, 300, 1.5, "data-duration attribute");
});

ok("a short 30s film is unaffected", () => {
  const d = declaredDuration({ nScenes: 8, durationSec: 30, framePack: "allotment" });
  near(d.meta, 30, 1.5, "meta.json duration");
});

ok("meta.json and the composition attribute agree", () => {
  const d = declaredDuration({ nScenes: 55, durationSec: 480, framePack: "hive-mind" });
  assert.ok(d.attr !== null, "no data-duration attribute emitted");
  near(d.meta, d.attr, 0.05, "meta vs attribute");
  near(d.meta, 480, 1.5, "meta.json duration");
});

ok("the scene payload still respects the engine's 16KB / 50-scene caps", () => {
  const d = declaredDuration({ nScenes: 60, durationSec: 600, framePack: "allotment" });
  const { scenes, bytes } = playedScenes(d.html);
  assert.ok(bytes < 16384, `OM_SCENES is ${bytes} bytes — over the engine's 16KB cap`);
  assert.ok(scenes.length <= 50, `${scenes.length} scenes — over the engine's 50-scene cap`);
});

ok("the played beats themselves sum to the requested duration", () => {
  const d = declaredDuration({ nScenes: 60, durationSec: 600, framePack: "allotment" });
  const { scenes } = playedScenes(d.html);
  const tooShort = scenes.filter((s) => Number(s.dur) < 1.2);
  assert.strictEqual(tooShort.length, 0, `${tooShort.length} beat(s) under the 1.2s floor`);
  const sum = scenes.reduce((a, s) => a + Number(s.dur), 0);
  near(sum, 600, 1.5, "summed beat durations");
});

console.log(fail ? `\n${pass} passed, ${fail} failed` : `\nlong-form duration holds (${pass} checks)`);
process.exit(fail ? 1 : 0);
