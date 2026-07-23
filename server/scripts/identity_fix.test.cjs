// Unit tests for the deterministic identity fixer. Run: node scripts/identity_fix.test.cjs
const assert = require("node:assert");
const { identityFix } = require("../src/services/identity_fix");

// Coral pack: warm reds/oranges + a cream + ink. A foreign teal must be remapped;
// a legitimate darker shade of the pack red must be LEFT ALONE.
const packTokens = { name: "coral", colors: { ink: "#1A1410", paper: "#FBF3EC", coral: "#F0603C", ember: "#C0331E", honey: "#E8A24A" }, fonts: ["Inter"] };

let pass = 0, fail = 0;
function test(name, fn) { try { fn(); pass++; console.log("  ok  -", name); } catch (e) { fail++; console.log("  FAIL-", name, "\n      ", e.message); } }

test("foreign teal → snapped to nearest pack token", () => {
  const html = `<div style="color:#1BA6A0">hi</div><span style="background:#1BA6A0">x</span>`;
  const r = identityFix(html, packTokens);
  assert.equal(r.remapped.length, 1, "one color remapped");
  assert.equal(r.remapped[0].from, "#1BA6A0");
  assert.equal(r.remapped[0].count, 2, "both occurrences counted");
  assert.ok(!/#1BA6A0/i.test(r.html), "teal fully replaced");
  // snapped to a pack token
  assert.ok(Object.values(packTokens.colors).map((c) => c.toUpperCase()).includes(r.remapped[0].to));
});

test("legitimate pack-hue shade is left alone", () => {
  // #D2542E is a darker coral — same hue family as #F0603C, within 40° → keep.
  const html = `<div style="color:#D2542E">on brand</div>`;
  const r = identityFix(html, packTokens);
  assert.equal(r.remapped.length, 0, "shade of a pack color not remapped");
  assert.equal(r.html, html, "html unchanged");
});

test("neutrals / washed tints are never remapped", () => {
  const html = `<div style="color:#333333;background:#F7F7F7">n</div>`;
  const r = identityFix(html, packTokens);
  assert.equal(r.remapped.length, 0, "low-saturation colors ignored");
});

test("pack tokens themselves are left alone", () => {
  const html = `<div style="color:#F0603C">brand</div>`;
  const r = identityFix(html, packTokens);
  assert.equal(r.remapped.length, 0);
});

test("near-black ink (#14130E) is NOT remapped (hue is noise)", () => {
  // scene-kit's generic light-ground ink — near-black, sat technically >0.28 but
  // perceptually neutral. Must be left alone (was over-eagerly remapped before).
  const html = `<div style="color:#14130E">body ink</div>`.repeat(3);
  const r = identityFix(html, packTokens);
  assert.equal(r.remapped.length, 0, "near-black left alone");
});

test("near-white is NOT remapped", () => {
  const html = `<div style="background:#FBF6F0">near white</div>`;
  const r = identityFix(html, packTokens);
  assert.equal(r.remapped.length, 0, "near-white left alone");
});

test("monochrome pack → no hue policing (no-op)", () => {
  const mono = { name: "noir", colors: { ink: "#111111", paper: "#EEEEEE" }, fonts: [] };
  const html = `<div style="color:#1BA6A0">teal on a mono pack</div>`;
  const r = identityFix(html, mono);
  assert.equal(r.remapped.length, 0, "monochrome pack does not police hue");
});

console.log(`\nidentity_fix: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
