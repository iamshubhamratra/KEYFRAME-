// ASSET DISTRIBUTION — replayed against the real 9:16 films that exposed the defect.
// See VIDEO-QUALITY-AUDIT-2026-07-28.md.
//
//   node scripts/test-layout-spread.js        (npm run test:spread)

const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "kf-spread-"));
const config = require("../src/config");
config.paths.dbFile = path.join(TMP, "jobs.json");

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}\n      ${e.message}`); failed++; }
}

const { directLayout } = require("../src/services/visual_layout_director");

const mkScenes = (n) => Array.from({ length: n }, (_, i) => ({
  id: `s${i + 1}`, start: i * 4, duration: 4, purpose: i === 0 ? "hook" : i === n - 1 ? "cta" : "feature",
  onScreenText: [`Line ${i + 1}`], headline: `Line ${i + 1}`,
}));
// Assets shaped like the real wire records (source drives tier + trust).
const mkAsset = (p, sceneId, source, extra = {}) => ({
  path: p, type: "image", source, sceneId, startSec: 0, durationSec: 4,
  visionOk: true, cdProminence: "support", cdScore: 88, width: 1280, height: 720, ratio: 1.78, ...extra,
});
const coverage = (assets, scenes) => new Set(assets.filter((a) => a.sceneId != null && !/logo/.test(String(a.role || ""))).map((a) => String(a.sceneId))).size;

console.log("\nAsset distribution (9:16 quality audit)\n");

// The exact assignment recorded for job 755o2m8g21 (daybreak-bakehouse, layout score 41).
test("replays 755o2m8g21: 3 covered scenes of 9 → every asset gets its own scene", () => {
  const scenes = mkScenes(9);
  const assets = [
    mkAsset("uploads/logo.png", "s9", "upload", { role: "logo" }),
    mkAsset("ingest/brand_assets/a9.png", "s1", "website-asset"),
    mkAsset("ingest/brand_assets/a10.jpg", "s1", "website-asset", { visionOk: false, cdProminence: "background", cdScore: 86 }),
    mkAsset("assets/images/site_0.png", "s1", "website", { cdProminence: "hero", cdScore: 92 }),
    mkAsset("assets/images/site_1.png", "s2", "website"),
    mkAsset("assets/images/site_2.png", "s5", "website"),
  ];
  const before = coverage(assets, scenes);
  assert.strictEqual(before, 3, `fixture should reproduce the real film's 3 covered scenes, got ${before}`);
  const { review } = directLayout({ storyboard: { scenes }, script: { scenes }, assets, framePack: null, dims: { width: 720, height: 1280, fps: 30 } });
  const after = coverage(assets, scenes);
  assert.ok(after > before, `distribution did nothing (${before} → ${after})`);
  assert.strictEqual(after, 5, `five non-logo visuals should cover five scenes, got ${after}`);
  assert.ok(review.redistributed >= 2, `expected redistribution to be reported, got ${review.redistributed}`);
  assert.ok(review.emptyScenes < 6, `empty scenes should drop from 6, got ${review.emptyScenes}`);
});

test("the strongest visual keeps its scene — only the surplus moves", () => {
  const scenes = mkScenes(5);
  const hero = mkAsset("hero.png", "s1", "website", { cdProminence: "hero", cdScore: 97 });
  const weak = mkAsset("weak.png", "s1", "website", { cdScore: 70 });
  const assets = [hero, weak];
  directLayout({ storyboard: { scenes }, script: { scenes }, assets, framePack: null, dims: { width: 720, height: 1280, fps: 30 } });
  assert.strictEqual(String(hero.sceneId), "s1", "the hero must not be relocated");
  assert.notStrictEqual(String(weak.sceneId), "s1", "the surplus asset should have moved to an empty scene");
});

test("a moved asset takes its scene's timing with it", () => {
  const scenes = mkScenes(4);
  const a = mkAsset("a.png", "s1", "website", { cdProminence: "hero", cdScore: 95 });
  const b = mkAsset("b.png", "s1", "website", { cdScore: 80, startSec: 0, durationSec: 4 });
  directLayout({ storyboard: { scenes }, script: { scenes }, assets: [a, b], framePack: null, dims: { width: 720, height: 1280, fps: 30 } });
  const dest = scenes.find((s) => String(s.id) === String(b.sceneId));
  assert.ok(dest, "moved asset points at a real scene");
  assert.strictEqual(b.startSec, dest.start, "startSec must follow the asset to its new scene");
  assert.strictEqual(b.durationSec, dest.duration, "durationSec must follow too");
});

test("the logo is never relocated — it is key-moment material, not a scene filler", () => {
  const scenes = mkScenes(5);
  const logo = mkAsset("uploads/logo.png", "s5", "upload", { role: "logo" });
  const a = mkAsset("a.png", "s1", "website", { cdProminence: "hero", cdScore: 95 });
  const b = mkAsset("b.png", "s1", "website", { cdScore: 80 });
  directLayout({ storyboard: { scenes }, script: { scenes }, assets: [logo, a, b], framePack: null, dims: { width: 720, height: 1280, fps: 30 } });
  assert.strictEqual(String(logo.sceneId), "s5", "the logo stayed put");
});

test("an asset moves to the NEAREST empty scene, not across the film", () => {
  const scenes = mkScenes(8);
  const a = mkAsset("a.png", "s2", "website", { cdProminence: "hero", cdScore: 95 });
  const b = mkAsset("b.png", "s2", "website", { cdScore: 80 });
  // s1 and s8 are both empty; s1 is adjacent to the asset's home.
  const keep = mkAsset("k.png", "s3", "website", { cdScore: 90 });
  directLayout({ storyboard: { scenes }, script: { scenes }, assets: [a, b, keep], framePack: null, dims: { width: 720, height: 1280, fps: 30 } });
  assert.strictEqual(String(b.sceneId), "s1", `expected the adjacent empty scene, got ${b.sceneId}`);
});

test("an already-spread film is left alone (no churn)", () => {
  const scenes = mkScenes(4);
  const assets = [mkAsset("a.png", "s1", "website"), mkAsset("b.png", "s2", "website"), mkAsset("c.png", "s3", "website")];
  const before = assets.map((a) => String(a.sceneId));
  const { review } = directLayout({ storyboard: { scenes }, script: { scenes }, assets, framePack: null, dims: { width: 720, height: 1280, fps: 30 } });
  assert.deepStrictEqual(assets.map((a) => String(a.sceneId)), before);
  assert.strictEqual(review.redistributed, 0);
});

test("more assets than scenes still doubles up rather than dropping any", () => {
  const scenes = mkScenes(3);
  const assets = [
    mkAsset("a.png", "s1", "website"), mkAsset("b.png", "s1", "website"),
    mkAsset("c.png", "s1", "website"), mkAsset("d.png", "s1", "website"),
  ];
  directLayout({ storyboard: { scenes }, script: { scenes }, assets, framePack: null, dims: { width: 720, height: 1280, fps: 30 } });
  assert.strictEqual(assets.length, 4, "no asset may be discarded");
  assert.strictEqual(coverage(assets, scenes), 3, "all three scenes should be covered");
});

fs.rmSync(TMP, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
