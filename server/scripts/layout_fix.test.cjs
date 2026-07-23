// Unit tests for the deterministic layout fixer (node-side logic; the Chromium
// probe is exercised by the round-trip harness). Run: node scripts/layout_fix.test.cjs
const assert = require("node:assert");
const { analyze, applyFixes, overlapFrac } = require("../src/services/layout_fix");

const FRAME = 1280 * 720;
const box = (selector, kind, text, x, y, w, h, hasSolidBg = false) =>
  ({ selector, kind, text, normText: text.toLowerCase(), bbox: { x, y, w, h }, areaFrac: (w * h) / FRAME, hasSolidBg });

let pass = 0, fail = 0;
function test(name, fn) { try { fn(); pass++; console.log("  ok  -", name); } catch (e) { fail++; console.log("  FAIL-", name, "\n      ", e.message); } }

// 1. Duplicate text on two DISTINCT elements → the smaller (redundant) is marked, keeper kept.
test("duplicate distinct selectors → redundant marked 'all', keeper untouched", () => {
  const frames = [{ boxes: [
    box("h1.kfhead", "text", "Scattered ideas?", 100, 100, 400, 60),
    box("p.kfsub", "text", "Scattered ideas?", 100, 200, 200, 30),
  ] }];
  const f = analyze(frames);
  assert.equal(f.duplicates.length, 1, "one redundant");
  assert.equal(f.duplicates[0].selector, "p.kfsub", "keeps the larger h1, hides the p");
  assert.equal(f.duplicates[0].mode, "all");
  const html = `<h1 class="kfhead">Scattered ideas?</h1><p class="kfsub">Scattered ideas?</p>`;
  const r = applyFixes(html, f);
  assert.equal(r.duplicatesRemoved, 1);
  assert.ok(/<p class="kfsub"[^>]*visibility:hidden/.test(r.html), "redundant <p> hidden");
  assert.ok(/<h1 class="kfhead">Scattered ideas\?/.test(r.html), "keeper <h1> untouched");
});

// 2. Identical repeated element → keep the first, hide the rest (keepOne).
test("identical siblings → keepOne hides all but the first", () => {
  const frames = [{ boxes: [
    box("span.dup", "text", "Hi there", 10, 10, 100, 20),
    box("span.dup", "text", "Hi there", 10, 40, 100, 20),
  ] }];
  const f = analyze(frames);
  assert.equal(f.duplicates[0].mode, "keepOne");
  const html = `<span class="dup">Hi there</span><span class="dup">Hi there</span>`;
  const r = applyFixes(html, f);
  assert.equal(r.duplicatesRemoved, 1, "one copy hidden");
  assert.equal((r.html.match(/visibility:hidden/g) || []).length, 1, "exactly one hidden");
});

// 3. Text sitting on top of a graphic with no solid backing → scrim.
test("text over a graphic → scrim chip added", () => {
  const frames = [{ boxes: [
    box("h1.kfhead", "text", "Big Title", 100, 100, 300, 60, false),
    box("img.kftile", "graphic", "", 80, 80, 360, 200),
  ] }];
  const f = analyze(frames);
  assert.equal(f.collisions.length, 1, "one collision");
  const html = `<div><h1 class="kfhead">Big Title</h1><img class="kftile" src="x.jpg"></div>`;
  const r = applyFixes(html, f);
  assert.equal(r.collisionsScrimmed, 1);
  assert.ok(/background-color:rgba\(15,16,20/.test(r.html), "scrim chip applied to the text");
});

// 3b. Text over a FULL-BLEED background graphic → NOT a collision (this was the
//     24-false-positives bug: scene-kit layers text over a full-bleed canvas/bg).
test("text over a full-bleed background → NOT scrimmed", () => {
  const frames = [{ boxes: [
    box("h1.kfhead", "text", "On the hero", 100, 100, 300, 60, false),
    box("div.bg", "graphic", "", 0, 0, 1280, 720), // full-bleed background (areaFrac 1.0)
  ] }];
  const f = analyze(frames);
  assert.equal(f.collisions.length, 0, "full-bleed background is not a collision obstacle");
});

// 4. Text over a graphic but it ALREADY has a solid background → left alone.
test("text with solid backing over a graphic → NOT scrimmed", () => {
  const frames = [{ boxes: [
    box("h1.kfhead", "text", "On a panel", 100, 100, 300, 60, true),
    box("img.kftile", "graphic", "", 80, 80, 360, 200),
  ] }];
  const f = analyze(frames);
  assert.equal(f.collisions.length, 0, "already backed → no scrim");
});

// 5. No duplicates, no overlaps → nothing changed.
test("clean frame → no findings", () => {
  const frames = [{ boxes: [
    box("h1.kfhead", "text", "Only headline", 100, 100, 300, 60),
    box("img.kftile", "graphic", "", 700, 400, 200, 150),
  ] }];
  const f = analyze(frames);
  assert.equal(f.duplicates.length, 0);
  assert.equal(f.collisions.length, 0);
});

// 6. overlapFrac math.
test("overlapFrac — half-covered text = 0.5", () => {
  const t = { x: 0, y: 0, w: 100, h: 100 };
  const g = { x: 50, y: 0, w: 100, h: 100 };
  assert.ok(Math.abs(overlapFrac(t, g) - 0.5) < 0.001);
});

console.log(`\nlayout_fix: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
