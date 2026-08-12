// Template Director guard tests — run: node scripts/template_director.test.cjs
// Stubs the LLM so the casting model's WORST behaviours are exercised:
// invented numbers, a type that needs media when none exists, an asset that
// does not fit its slot, and three identical scenes in a row.

const path = require("node:path");
const assert = require("node:assert");

// Stub openrouter BEFORE the director requires it.
const orPath = require.resolve("../src/services/openrouter");
let STUB_REPLY = "{}";
require.cache[orPath] = {
  id: orPath, filename: orPath, loaded: true, exports: {
    chat: async () => ({ text: STUB_REPLY, tokensIn: 0, tokensOut: 0 }),
  },
};
process.env.TEMPLATE_DIRECTOR = "1";

const { directTemplate } = require("../src/services/template_director");
const momentum = require("../src/services/momentum_composer");
const V = momentum.TEMPLATE_SCENES;

const storyboard = {
  title: "Acme", durationSec: 20,
  scenes: [
    { id: "s1", start: 0, duration: 4, kind: "hook", headline: "Meet Acme" },
    { id: "s2", start: 4, duration: 4, kind: "text", purpose: "showcase", headline: "Loved by teams", emphasis: "4.9 stars from 10000 reviews" },
    { id: "s3", start: 8, duration: 4, kind: "stat", headline: "Real numbers", bullets: ["240% faster ships", "12 teams onboard"] },
    { id: "s4", start: 12, duration: 4, kind: "text", purpose: "feature", headline: "One canvas" },
    { id: "s5", start: 16, duration: 4, kind: "cta", headline: "Start today" },
  ],
};
const wideShot = { path: "shot.png", source: "website", kind: "screenshot", width: 2000, height: 1250, alt: "acme dashboard" };

let failures = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  PASS  ${name}`); }
  catch (e) { failures++; console.log(`  FAIL  ${name}\n        ${e.message}`); }
};

(async () => {
  // 1. Invented numbers are dropped; sourced ones survive.
  STUB_REPLY = JSON.stringify({
    scenes: {
      s2: { type: "gallery", slots: { badge: "10/10", badgeLabel: "user satisfaction" }, asset: null },
      s3: { type: "stats", slots: { stats: [{ v: 999, suf: "%", l: "made up" }, { v: 240, suf: "%", l: "faster ships" }] } },
    },
  });
  let { plan, report } = await directTemplate({ jobId: "t1", storyboard, assets: [wideShot], framePack: "momentum", templateScenes: V });
  check("invented badge 10/10 dropped", () => assert.strictEqual(plan.byScene.s2.slots.badge, undefined));
  check("authored label kept", () => assert.strictEqual(plan.byScene.s2.slots.badgeLabel, "user satisfaction"));
  check("invented stat 999 removed, sourced 240 kept", () => {
    const stats = plan.byScene.s3.slots.stats || [];
    assert.ok(!stats.some((s) => s.v === 999), "999 survived");
    assert.ok(stats.some((s) => s.v === 240), "240 was lost");
  });
  check("guard counted", () => assert.ok(report.unsourcedNumbers >= 2, `counted ${report.unsourcedNumbers}`));

  // 2. A media type with no usable asset never renders an empty frame.
  STUB_REPLY = JSON.stringify({ scenes: { s4: { type: "feature", slots: {}, asset: null } } });
  ({ plan } = await directTemplate({ jobId: "t2", storyboard, assets: [], framePack: "momentum", templateScenes: V }));
  check("feature without media re-cast", () => assert.notStrictEqual(plan.byScene.s4.type, "feature"));
  check("every scene still cast", () => assert.strictEqual(Object.keys(plan.byScene).length, storyboard.scenes.length));

  // 3. A wide desktop capture must not be forced into a phone bezel.
  STUB_REPLY = JSON.stringify({ scenes: { s4: { type: "mobile", slots: {}, asset: 0 } } });
  ({ plan } = await directTemplate({ jobId: "t3", storyboard, assets: [wideShot], framePack: "momentum", templateScenes: V }));
  check("wide shot rejected from phone slot", () => {
    const e = plan.byScene.s4;
    assert.ok(e.type !== "mobile" || !(e.assets || []).length, "landscape shot landed in the phone bezel");
  });

  // 4. Template grammar: opener, closer, and no three identical scenes running.
  STUB_REPLY = JSON.stringify({
    scenes: {
      s1: { type: "statement", slots: {} }, s2: { type: "statement", slots: {} },
      s3: { type: "statement", slots: {} }, s4: { type: "statement", slots: {} },
      s5: { type: "statement", slots: {} },
    },
  });
  ({ plan } = await directTemplate({ jobId: "t4", storyboard, assets: [], framePack: "momentum", templateScenes: V }));
  const types = storyboard.scenes.map((s) => plan.byScene[s.id].type);
  check("opener is the template's intro", () => assert.strictEqual(types[0], "intro"));
  check("closer is the template's cta", () => assert.strictEqual(types[types.length - 1], "cta"));
  check("no three identical scenes in a row", () => {
    for (let i = 2; i < types.length; i++) {
      assert.ok(!(types[i] === types[i - 1] && types[i] === types[i - 2]), `three ${types[i]} in a row`);
    }
  });

  // 5. A broken LLM reply must still produce a complete, renderable plan.
  STUB_REPLY = "not json at all";
  ({ plan, report } = await directTemplate({ jobId: "t5", storyboard, assets: [wideShot], framePack: "momentum", templateScenes: V }));
  check("garbage reply falls back to deterministic casting", () => {
    assert.strictEqual(Object.keys(plan.byScene).length, storyboard.scenes.length);
    assert.strictEqual(report.llmCast, 0);
  });

  console.log(failures ? `\n${failures} check(s) failed` : "\nall template_director guards hold");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
