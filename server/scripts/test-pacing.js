#!/usr/bin/env node
// NO-VOICEOVER PACING — the picture moves faster when nobody is talking.
//
// The property being defended in BOTH directions:
//   · narration off must visibly quicken the motion and tighten the cuts;
//   · it must NOT touch scene count, scene starts or scene durations, because those are the
//     approved script's and rewriting them silently invalidates what the user signed off in
//     the Script Room.
//
// Composers are pure functions of (storyboard, dims, ...), so this compares two real
// compositions built from ONE storyboard that differs only in its pacing stamp.

const assert = require("node:assert");
const { tempoFor, tempoOf, NEUTRAL } = require("../src/services/pacing");
const profileSvc = require("../src/services/audio_profile");

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ok  ${name}`); }
  catch (e) { failed++; console.log(`  FAIL ${name}\n       ${e.message}`); }
}

const storyboard = (pacing) => ({
  title: "Northwind Payments",
  durationSec: 30,
  orientation: "portrait",
  pacing,
  scenes: [
    { id: "s1", start: 0,  duration: 5, kind: "hook",   headline: "Every frame counts", subtext: "northwind.com" },
    { id: "s2", start: 5,  duration: 5, kind: "bullet", headline: "Built for scale",    bullets: ["Fast", "Safe", "Simple"] },
    { id: "s3", start: 10, duration: 5, kind: "chart",  headline: "99.99% uptime",      emphasis: "99.99%" },
    { id: "s4", start: 15, duration: 5, kind: "bullet", headline: "One integration",    bullets: ["APIs", "SDKs"] },
    { id: "s5", start: 20, duration: 5, kind: "quote",  headline: "Loved by teams",     subtext: "“It just works”" },
    { id: "s6", start: 25, duration: 5, kind: "cta",    headline: "Start today",        subtext: "northwind.com" },
  ],
});

const DIMS = { width: 1080, height: 1920 };

// One pack per composition family, and what the tempo can reach in each.
//
//   om_port_kit   — every builder's timing flows through ctx.du(), so motion AND cuts scale
//   om_stage      — the engine already divides entrances by a skin `energy`, so both scale
//   om_scene_cuts — CUTS ONLY. These twelve composers author their inner durations as
//                   literals across dozens of sites per file with no shared helper, so
//                   there is no honest choke point to scale. Stated here rather than
//                   quietly asserted away: they get tighter cuts, not quicker interiors.
const PACKS = [
  { pack: "edition",        mod: "../src/services/edition_composer",        family: "om_port_kit",   motion: true },
  // om_stage draws its cuts as a full-frame cover on ONE track rather than as an overlap
  // between two clips, so its clip durations are fixed by design — its cut tightening shows
  // up in the wipe tweens, which the entrance metric already covers.
  { pack: "hype-wave",      mod: "../src/services/om_skins/hype_wave",     family: "om_stage",      motion: true, clipCuts: false },
  { pack: "motion-canvas",  mod: "../src/services/motion_canvas_composer", family: "om_scene_cuts", motion: false },
  { pack: "paper-craft",    mod: "../src/services/paper_craft_composer",   family: "om_scene_cuts", motion: false },
];

// Every duration GSAP is told to animate for, in document order.
const durations = (html) => (String(html).match(/duration:\s*([0-9.]+)/g) || [])
  .map((m) => Number(m.split(":")[1]));

// ENTRANCES AND EXITS ONLY. A film's animated time is dominated by AMBIENT tweens that
// deliberately span a whole beat — the drift, the slow scale, the looping decor. Those are a
// bed and must NOT shorten; shortening them would leave the frame still for the remainder.
// "Text animations appear and exit more quickly" is a claim about the SHORT tweens, so that
// is what the metric measures. Without this split, a 5s drift buries a 0.3s saving.
const ENTRANCE_MAX = 1.5;
const entrances = (html) => durations(html).filter((d) => d > 0 && d <= ENTRANCE_MAX);
const sum = (a) => a.reduce((x, y) => x + y, 0);

function build(mod, pack, pacing) {
  const composer = require(mod);
  return composer.buildComposition({
    storyboard: storyboard(pacing), dims: DIMS, framePack: pack,
    assets: [], captionCues: [], seedKey: "pacing-test",
  });
}

console.log("no-voiceover pacing\n");

// ---------------------------------------------------------------- the profile
test("narration on is exactly neutral", () => {
  const t = tempoFor({ narration: "on" });
  assert.strictEqual(t.motion, 1);
  assert.strictEqual(t.xfade, 1);
  assert.strictEqual(t.camera, 1);
});

test("narration off quickens motion and cuts, and widens camera travel", () => {
  const t = tempoFor({ narration: "off", energyBoost: 1 });
  assert.ok(t.motion < 1 && t.motion >= 0.5, `motion ${t.motion}`);
  assert.ok(t.xfade < 1 && t.xfade >= 0.45, `xfade ${t.xfade}`);
  assert.ok(t.camera > 1 && t.camera <= 1.6, `camera ${t.camera}`);
});

test("energyBoost 2 is pushed harder than 1", () => {
  const a = tempoFor({ narration: "off", energyBoost: 1 });
  const b = tempoFor({ narration: "off", energyBoost: 2 });
  assert.ok(b.motion < a.motion, "boost 2 must move quicker");
  assert.ok(b.camera > a.camera, "boost 2 must travel further");
});

test("a pack that opted out of the audio lift also opts out of the pacing lift", () => {
  // ONE control governs both, so sound and picture never disagree about the film's energy.
  const t = tempoFor({ narration: "off", energyBoost: 0 });
  assert.strictEqual(t.motion, 1);
  assert.strictEqual(t.xfade, 1);
  const ml = profileSvc.profileFor("edition");
  assert.strictEqual(ml.noVo.energyBoost, 0, "edition is the pack that ships this opt-out");
});

test("a storyboard with no pacing stamp is neutral, not broken", () => {
  assert.deepStrictEqual(tempoOf({}), NEUTRAL);
  assert.deepStrictEqual(tempoOf(null), NEUTRAL);
  assert.deepStrictEqual(tempoOf({ pacing: "nonsense" }), NEUTRAL);
});

test("a hostile pacing stamp is clamped, never obeyed", () => {
  const t = tempoOf({ pacing: { motion: 0.001, xfade: -5, camera: 99 } });
  assert.ok(t.motion >= 0.5 && t.xfade >= 0.45 && t.camera <= 1.6, JSON.stringify(t));
});

// ---------------------------------------------------------------- real compositions
// Composers return { indexHtml, metaJson, resolvedBrand } — the timeline lives in indexHtml.
const html = (b) => b.indexHtml || b.html || b.body || "";
const clipDurs = (h) => (String(h).match(/data-duration="([0-9.]+)"/g) || []).map((m) => Number(m.split('"')[1]));
const clipStarts = (h) => (String(h).match(/data-start="([0-9.]+)"/g) || []).join(",");

for (const { pack, mod, family, motion, clipCuts = true } of PACKS) {
  const on = html(build(mod, pack, tempoFor({ narration: "on" })));
  const off = html(build(mod, pack, tempoFor({ narration: "off", energyBoost: 1 })));

  if (clipCuts) {
    test(`${pack} (${family}): cuts tighten with no narration`, () => {
      const a = clipDurs(on), b = clipDurs(off);
      assert.ok(a.length >= 2, `expected clips, saw ${a.length}`);
      assert.strictEqual(a.length, b.length, "scene COUNT must not change");
      // A clip lives its own crossfade past its beat, so a tighter cut shortens the CLIP.
      b.forEach((x, i) => assert.ok(x <= a[i] + 0.001, `clip ${i} grew: ${a[i]} -> ${x}`));
      assert.ok(sum(b) < sum(a), `no cut tightened at all: ${sum(a).toFixed(2)} -> ${sum(b).toFixed(2)}`);
    });
  }

  test(`${pack} (${family}): scene structure is IDENTICAL — pacing never rewrites the approved script`, () => {
    assert.strictEqual(clipStarts(on), clipStarts(off), "scene START times must not move");
  });

  if (motion) {
    test(`${pack} (${family}): entrances and exits get measurably quicker`, () => {
      const dOn = entrances(on), dOff = entrances(off);
      assert.ok(dOn.length > 5, `expected short tweens, saw ${dOn.length}`);
      assert.ok(sum(dOff) < sum(dOn) * 0.9,
        `entrance time must drop >=10%: on ${sum(dOn).toFixed(2)}s vs off ${sum(dOff).toFixed(2)}s`);
    });

    test(`${pack} (${family}): ambient motion is NOT shortened`, () => {
      // The complement of the test above, and the thing that stops "faster" becoming
      // "emptier": a bed tween that spans its beat must still span its beat.
      const longOn = durations(on).filter((d) => d > ENTRANCE_MAX);
      const longOff = durations(off).filter((d) => d > ENTRANCE_MAX);
      assert.ok(sum(longOff) >= sum(longOn) * 0.98,
        `ambient time collapsed: ${sum(longOn).toFixed(1)}s -> ${sum(longOff).toFixed(1)}s`);
    });
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
