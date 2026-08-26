// Guard: a long film's asset budget must be spread ACROSS the timeline.
//
// The planner builds its want-list scene by scene and then trims it to a cap.
// Trimming with a plain slice() spends the whole budget on the opening scenes —
// gap-fill gives most scenes two photo needs, so a 40-scene film's 40-photo cap
// was exhausted by scene 20 and scenes 21-40 were never planned an asset at all.
// That is the "long-form videos look empty" report, and it is invisible in every
// existing test because the counts (40 planned, 40 fetched) look perfectly healthy.

const assert = require("node:assert");
const { __test_byScenePriority: byScenePriority } = require("../src/agents/graph");

let pass = 0, fail = 0;
const ok = (name, fn) => {
  try { fn(); console.log(`  ok    ${name}`); pass++; }
  catch (e) { console.error(`  FAIL  ${name}\n        ${e.message}`); fail++; }
};

// 40 scenes, 2 photo needs each, in scene order — the exact shape the planner builds.
const wants = [];
for (let i = 1; i <= 40; i++) {
  wants.push({ scene: { id: `s${i}` }, need: { role: "background" } });
  wants.push({ scene: { id: `s${i}` }, need: { role: "inset" } });
}
const scenesIn = (picked) => new Set(picked.map((w) => w.scene.id));

ok("a cap smaller than the want-list still reaches the LAST scene", () => {
  const picked = byScenePriority(wants, 40);
  assert.strictEqual(picked.length, 40, `expected 40 picks, got ${picked.length}`);
  assert.ok(scenesIn(picked).has("s40"), "s40 got no asset — the budget was spent on the opening scenes");
  assert.ok(scenesIn(picked).has("s21"), "s21 got no asset");
});

ok("every scene is served once before any scene is served twice", () => {
  const picked = byScenePriority(wants, 40);
  assert.strictEqual(scenesIn(picked).size, 40, `only ${scenesIn(picked).size}/40 scenes covered`);
});

ok("a cap below the scene count still spreads over the whole film", () => {
  const picked = byScenePriority(wants, 10);
  const ids = [...scenesIn(picked)];
  assert.strictEqual(ids.length, 10, "10 picks should touch 10 distinct scenes");
  // Must not be the first 10 scenes huddled at the front.
  const maxIdx = Math.max(...ids.map((s) => Number(s.slice(1))));
  assert.ok(maxIdx > 10, `all picks landed in the opening (highest scene s${maxIdx})`);
});

ok("a cap larger than the want-list returns everything, no duplicates", () => {
  const picked = byScenePriority(wants, 500);
  assert.strictEqual(picked.length, wants.length, "should return every want");
  assert.strictEqual(new Set(picked).size, picked.length, "returned the same want twice");
});

ok("zero/negative cap returns nothing", () => {
  assert.deepStrictEqual(byScenePriority(wants, 0), []);
  assert.deepStrictEqual(byScenePriority(wants, -3), []);
});

ok("uneven need counts per scene still round-robin", () => {
  // s1 has 3 needs, s2 has 1 — the second round must not re-serve s2.
  const uneven = [
    { scene: { id: "s1" }, need: {} }, { scene: { id: "s1" }, need: {} }, { scene: { id: "s1" }, need: {} },
    { scene: { id: "s2" }, need: {} },
  ];
  const picked = byScenePriority(uneven, 3);
  const counts = {};
  for (const w of picked) counts[w.scene.id] = (counts[w.scene.id] || 0) + 1;
  assert.strictEqual(counts.s2, 1, "s2 only has one need; it must not be served twice");
  assert.strictEqual(counts.s1, 2);
});

console.log(fail ? `\n${pass} passed, ${fail} failed` : `\nasset spread holds (${pass} checks)`);
process.exit(fail ? 1 : 0);
