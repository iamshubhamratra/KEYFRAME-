// Unit tests for A/V alignment: does each scene SHOW what it SAYS, and does the
// script->display-copy adapter put the scene's own words on screen?
// Run: node scripts/av_align.test.cjs   (npm run test:align)
const assert = require("node:assert");
const { alignmentReport, sceneTexts } = require("../src/services/av_align");
const { withDisplayCopy } = require("../src/services/template_engine");

const scenes = [
  { id: "s1", purpose: "hook", voiceover: "Still hunting deals everywhere?", onScreenText: ["Deals everywhere?"] },
  { id: "s2", purpose: "context", voiceover: "Too many stores, too much time lost.", onScreenText: ["Time wasted"] },
];
const clip = (id, inner) => `<div class="clip tpl-scene" id="${id}"><div>${inner}</div></div>`;

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log("  ok  -", name); }
  catch (e) { fail++; console.log("  FAIL-", name, "\n       ", e.message); }
}

test("a film rendering each scene's own copy passes", () => {
  const html = clip("s1", "Deals everywhere?") + clip("s2", "Time wasted");
  const r = alignmentReport({ html, scenes, brand: "Flipkart" });
  assert.equal(r.matched, 2);
  assert.equal(r.issues.length, 0, "no repair issues for an aligned film");
});

test("a film rendering unrelated copy is flagged, naming the scenes", () => {
  // The real defect: pack/website copy on screen while the narration says otherwise.
  const html = clip("s1", "INDIA'S ULTIMATE One App. Everything.") + clip("s2", "Flipkart Kilos supermarket");
  const r = alignmentReport({ html, scenes, brand: "Flipkart" });
  assert.equal(r.matched, 0, "neither scene shows its own copy");
  assert.ok(r.issues.length >= 1, "issues emitted for the repair lap");
  assert.ok(r.issues.join(" ").includes("s1"), "the offending scene is named");
});

test("brand-name overlap alone does NOT count as a match", () => {
  // Scene 2 keeps the company name but swapped its entire subject.
  const s = [{ id: "s1", onScreenText: ["Flipkart Minutes"], voiceover: "Flipkart Minutes, in a flash." }];
  const html = clip("s1", "Flipkart Trade-In Reset and Exchange");
  const r = alignmentReport({ html, scenes: s, brand: "Flipkart" });
  assert.equal(r.matched, 0, "'Flipkart' is generic here and must not rescue the scene");
});

test("per-character animated text is still readable to the checker", () => {
  // Some packs wrap every letter in its own span for a typewriter effect.
  const html = clip("s1", "D e a l s e v e r y w h e r e ?") + clip("s2", "Time wasted");
  const r = alignmentReport({ html, scenes, brand: "Flipkart" });
  assert.equal(r.matched, 2, "char-split copy must not read as empty");
});

test("text typed in at runtime by the timeline counts", () => {
  // Terminal packs render an empty span and fill it from the GSAP script.
  const html = clip("s1", "<span></span>") + clip("s2", "Time wasted") +
    `<script>type("#s1-line","Deals everywhere?",0,1);</script>`;
  const r = alignmentReport({ html, scenes, brand: "Flipkart" });
  assert.equal(r.matched, 2, "typed copy must be attributed to its scene");
});

// ---- the script -> display-copy adapter ----
test("withDisplayCopy promotes the scene's own line to the headline", () => {
  // The script schema has NO headline field; builders read scene.headline and
  // otherwise fall back to the PACK's demo copy.
  const out = withDisplayCopy({ id: "s1", onScreenText: ["Deals everywhere?"] });
  assert.equal(out.headline, "Deals everywhere?");
  assert.deepEqual(out.onScreenText, [], "single line moves up rather than duplicating");
});

test("a numeric first line stays in onScreenText so stat scenes keep their figure", () => {
  const out = withDisplayCopy({ id: "s5", onScreenText: ["Up to 90% Off", "Under 199"] });
  assert.equal(out.headline, "Up to 90% Off");
  assert.ok(out.onScreenText.includes("Up to 90% Off"), "statsOf still sees the number");
});

test("an existing headline is never overwritten", () => {
  const out = withDisplayCopy({ id: "s1", headline: "Authored", onScreenText: ["Other"] });
  assert.equal(out.headline, "Authored");
});

test("a scene with no copy at all is passed through untouched", () => {
  const s = { id: "s1", voiceover: "spoken only" };
  assert.strictEqual(withDisplayCopy(s), s);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
