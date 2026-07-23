// Unit tests for the screenshot QA fix logic (re-pin mismatches / drop errors),
// stubbing the vision inspector. Run: node scripts/screenshot_qa.test.cjs
const assert = require("node:assert");
const { qaGateScreenshots } = require("../src/services/screenshot_qa");

const script = { scenes: [
  { id: 1, purpose: "hook", start: 0, duration: 3, voiceover: "messy thoughts" },
  { id: 2, purpose: "feature", start: 3, duration: 4, voiceover: "capture ideas fast" },
  { id: 3, purpose: "pricing", start: 7, duration: 4, voiceover: "simple plans, free to start" },
] };
const shot = (sceneId, base) => ({ path: `assets/images/${base}.png`, type: "image", source: "website", sceneId, startSec: 0, durationSec: 3, alt: base });
const stub = (verdicts) => async () => verdicts; // returns fixed verdicts aligned to shotIdx order

let pass = 0, fail = 0;
async function test(name, fn) { try { await fn(); pass++; console.log("  ok  -", name); } catch (e) { fail++; console.log("  FAIL-", name, "\n      ", e.message); } }

(async () => {
  // 1. A good pricing screenshot pinned to the FEATURES scene → re-pinned to the pricing scene.
  await test("mismatched shot re-pinned to the scene it fits", async () => {
    const assets = [shot(2, "pricing_shot")]; // pinned to scene 2 (features), but it's a pricing page
    const out = await qaGateScreenshots({
      assets, jobDir: "/nonexistent", subject: "note app", script,
      _inspect: stub([{ pass: true, matchesScene: false, bestSceneId: 3, sees: "pricing table" }]),
    });
    assert.equal(out.length, 1, "shot kept");
    assert.equal(String(out[0].sceneId), "3", "re-pinned to scene 3");
    assert.equal(out[0].startSec, 7, "timing updated to scene 3");
  });

  // 2. A broken capture → dropped.
  await test("error capture dropped", async () => {
    const assets = [shot(2, "broken")];
    const out = await qaGateScreenshots({
      assets, jobDir: "/nonexistent", subject: "note app", script,
      _inspect: stub([{ pass: false, problem: "error-page", sees: "404 not found" }]),
    });
    assert.equal(out.length, 0, "broken shot removed");
  });

  // 3. Mismatch with NO fitting scene → dropped (wrong-scene shot worse than a vector).
  await test("mismatch with no fitting scene dropped", async () => {
    const assets = [shot(2, "random")];
    const out = await qaGateScreenshots({
      assets, jobDir: "/nonexistent", subject: "note app", script,
      _inspect: stub([{ pass: true, matchesScene: false, bestSceneId: null, sees: "careers page" }]),
    });
    assert.equal(out.length, 0, "unmatchable shot removed");
  });

  // 4. Good, on-topic shot → kept untouched.
  await test("good on-topic shot kept", async () => {
    const assets = [shot(2, "features")];
    const out = await qaGateScreenshots({
      assets, jobDir: "/nonexistent", subject: "note app", script,
      _inspect: stub([{ pass: true, matchesScene: true, bestSceneId: null, sees: "feature grid" }]),
    });
    assert.equal(out.length, 1);
    assert.equal(String(out[0].sceneId), "2", "stays on its scene");
  });

  // 5. Re-pin target already claimed by another kept shot → the mismatch is dropped, not double-pinned.
  await test("cannot re-pin onto an already-claimed scene", async () => {
    const assets = [shot(3, "good_pricing"), shot(2, "also_pricing")];
    const out = await qaGateScreenshots({
      assets, jobDir: "/nonexistent", subject: "note app", script,
      _inspect: stub([
        { pass: true, matchesScene: true, bestSceneId: null, sees: "pricing" },          // shot A: fine on scene 3
        { pass: true, matchesScene: false, bestSceneId: 3, sees: "pricing" },            // shot B wants scene 3 (taken)
      ]),
    });
    assert.equal(out.length, 1, "the duplicate-target shot is dropped");
    assert.equal(out[0].alt, "good_pricing", "the original scene-3 shot is the survivor");
  });

  console.log(`\nscreenshot_qa: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
