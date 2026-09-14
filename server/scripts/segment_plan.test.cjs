// Guard: does the long-form segmenter cut a film into parts SAFELY?
//
// Long bundled-template films are rendered as several compositions and joined,
// because the engine hard-rejects an OM_SCENES list over 50 entries (measured:
// a full 50-entry list at 8.7KB renders, a 52-entry one is refused, and a LEAN
// 200-entry list at 6.7KB is refused too — it is the COUNT, not the bytes).
//
// Everything here protects one of two things:
//   SYNC — the audio is mixed once, over the joined picture. A cut may fall only
//          on a scene boundary; no scene may be dropped, duplicated, reordered,
//          or have its duration changed, or the back half slides out of sync.
//   FORM — the film opens once and signs off once, however many parts it is
//          built from. Four parts each laying down the title card and the CTA is
//          a film that introduces itself four times.
//
// Run: node scripts/segment_plan.test.cjs   (npm run test:segments)
const assert = require("node:assert");
const adapter = require("../src/services/omelette_adapter");
const { planFilmSegments, ENGINE_MAX_SCENES } = adapter;

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log("  ok  -", name); }
  catch (e) { fail++; console.log("  FAIL-", name, "\n       ", e.message); }
}

// Varied scene lengths on purpose: equal lengths let a bad split land back in
// place by accident and hide the defect.
function film(n, total) {
  const raw = [];
  let sum = 0;
  for (let i = 0; i < n; i++) { const d = 3 + ((i * 7) % 9); raw.push(d); sum += d; }
  const k = total / sum;
  const durs = raw.map((d) => Math.round(d * k * 100) / 100);
  const scenes = [];
  let t = 0;
  durs.forEach((d, i) => {
    scenes.push({
      id: `s${i + 1}`, start: Math.round(t * 100) / 100, duration: d,
      headline: `Headline ${i + 1}`,
      subtext: `Supporting line ${i + 1}.`,
      bullets: [`Point ${i + 1}A`, `Point ${i + 1}B`],
      voiceover: `Narration ${i + 1}.`,
    });
    t = Math.round((t + d) * 100) / 100;
  });
  return { title: "probe", brand: "Probe", durationSec: Math.round(t * 100) / 100, scenes };
}

const LONG = [
  ["300s", 300, 50],
  ["480s", 480, 50],
  ["600s", 600, 50],
];
const SHORT = [
  ["30s reel", "FetchVertical", 30, 10],
  ["60s short", "FetchVertical", 60, 20],
  ["150s", "HiveMind", 150, 40],
];

// ---------- short films must be left completely alone ----------

test("films that fit one composition are NOT segmented", () => {
  for (const [label, tpl, total, n] of SHORT) {
    const p = planFilmSegments({ storyboard: film(n, total), template: tpl });
    assert.equal(p.count, 1, `${label} was split into ${p.count} parts`);
    assert.equal(p.segments[0].bookends.intro, true);
    assert.equal(p.segments[0].bookends.outro, true);
  }
});

test("a film too short to split is returned whole", () => {
  const p = planFilmSegments({ storyboard: film(3, 600), template: "HiveMind" });
  assert.equal(p.count, 1, "3 scenes cannot make two parts of two");
});

test("a missing or unreadable template never throws — it just does not split", () => {
  const p = planFilmSegments({ storyboard: film(50, 600), template: "NoSuchTemplateHere" });
  assert.equal(p.count, 1);
  assert.match(p.reason, /not found/);
});

// ---------- long films split, and the split preserves the film ----------

test("long films are split into more than one part", () => {
  for (const [label, total, n] of LONG) {
    const p = planFilmSegments({ storyboard: film(n, total), template: "HiveMind" });
    assert.ok(p.count >= 2, `${label} produced ${p.count} part(s)`);
  }
});

test("SYNC: every scene survives exactly once, in order, untouched", () => {
  for (const [label, total, n] of LONG) {
    const sb = film(n, total);
    const p = planFilmSegments({ storyboard: sb, template: "HiveMind" });
    const flat = p.segments.flatMap((s) => s.scenes);
    assert.equal(flat.length, sb.scenes.length, `${label}: scene count changed`);
    assert.deepEqual(flat.map((s) => s.id), sb.scenes.map((s) => s.id), `${label}: order or membership changed`);
    for (let i = 0; i < flat.length; i++) {
      assert.equal(flat[i].duration, sb.scenes[i].duration, `${label}: scene ${flat[i].id} duration changed`);
    }
  }
});

test("SYNC: the parts add up to the film's full runtime", () => {
  for (const [label, total, n] of LONG) {
    const sb = film(n, total);
    const p = planFilmSegments({ storyboard: sb, template: "HiveMind" });
    const sum = p.segments.reduce((a, s) => a + s.durationSec, 0);
    assert.ok(Math.abs(sum - sb.durationSec) < 0.05, `${label}: parts total ${sum}s, film is ${sb.durationSec}s`);
  }
});

test("SYNC: each part starts where the previous one ended", () => {
  for (const [label, total, n] of LONG) {
    const sb = film(n, total);
    const p = planFilmSegments({ storyboard: sb, template: "HiveMind" });
    let at = 0;
    for (const s of p.segments) {
      assert.ok(Math.abs(s.startSec - at) < 0.05, `${label}: part starts at ${s.startSec}s, expected ${at}s`);
      // …and its first scene's absolute start agrees with that offset.
      assert.ok(Math.abs(Number(s.scenes[0].start) - s.startSec) < 0.05,
        `${label}: first scene starts at ${s.scenes[0].start}s inside a part beginning ${s.startSec}s`);
      at = Math.round((at + s.durationSec) * 100) / 100;
    }
  }
});

test("FORM: exactly one part opens the film and one closes it", () => {
  for (const [label, total, n] of LONG) {
    const p = planFilmSegments({ storyboard: film(n, total), template: "HiveMind" });
    assert.equal(p.segments.filter((s) => s.bookends.intro).length, 1, `${label}: not exactly one opener`);
    assert.equal(p.segments.filter((s) => s.bookends.outro).length, 1, `${label}: not exactly one closer`);
    assert.equal(p.segments[0].bookends.intro, true, `${label}: the opener is not the first part`);
    assert.equal(p.segments[p.segments.length - 1].bookends.outro, true, `${label}: the closer is not the last part`);
  }
});

test("every part has enough scenes to be a film rather than a slide", () => {
  for (const [label, total, n] of LONG) {
    const p = planFilmSegments({ storyboard: film(n, total), template: "HiveMind" });
    for (const s of p.segments) assert.ok(s.scenes.length >= 2, `${label}: a part has ${s.scenes.length} scene(s)`);
  }
});

// ---------- the point of the exercise: no part may exceed the engine ----------

test("no part builds a scene list over the engine's hard ceiling", () => {
  const readBeats = (html) => {
    const blk = /<script type="__bundler\/template"[^>]*>([\s\S]*?)<\/script>/i.exec(html);
    const page = JSON.parse(blk[1]);
    const m = /window\.OM_SCENES\s*=\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")\s*;/.exec(page);
    const lit = m[1];
    return JSON.parse(lit[0] === '"' ? JSON.parse(lit) : lit.slice(1, -1).replace(/\\'/g, "'").replace(/\\\\/g, "\\"));
  };
  const sb = film(50, 600);
  const p = planFilmSegments({ storyboard: sb, template: "HiveMind" });
  let total = 0;
  for (const s of p.segments) {
    const built = adapter.buildComposition({
      storyboard: { ...sb, durationSec: s.durationSec, scenes: s.scenes },
      dims: { width: 1920, height: 1080, fps: 30 },
      template: "HiveMind", assets: [], bookends: s.bookends,
    });
    const beats = readBeats(built.indexHtml);
    assert.ok(beats.length <= ENGINE_MAX_SCENES,
      `a part built ${beats.length} beats, over the engine's ${ENGINE_MAX_SCENES} ceiling — the film would render an error slate`);
    total += beats.length;
  }
  // …and the whole point: the split buys beats the single composition could not.
  const single = adapter.buildComposition({
    storyboard: sb, dims: { width: 1920, height: 1080, fps: 30 }, template: "HiveMind", assets: [],
  });
  const before = readBeats(single.indexHtml).length;
  assert.ok(total > before * 1.5,
    `segmenting bought too little: ${before} beats -> ${total} (expected a large gain, or the pace budget has regressed)`);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
