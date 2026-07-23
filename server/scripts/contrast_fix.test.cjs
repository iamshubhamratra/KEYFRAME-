// Unit tests for the deterministic contrast fixer. Run: node scripts/contrast_fix.test.cjs
const assert = require("node:assert");
const { contrastFix, ratioOf } = require("../src/services/contrast_fix");

const theme = {
  ground: "#F3EDE2", ink: "#14130E", isDark: false,
  accents: ["#B23A2E", "#1E5AA8", "#C9A227"],
};
const packTokens = { name: "test", colors: { ink: "#14130E", paper: "#F3EDE2", ember: "#B23A2E", cobalt: "#1E5AA8", honey: "#C9A227" }, fonts: ["Inter"] };
const LIGHT_BG = [243, 237, 226];

let pass = 0, fail = 0;
function test(name, fn) { try { fn(); pass++; console.log("  ok  -", name); } catch (e) { fail++; console.log("  FAIL-", name, "\n      ", e.message); } }

// 1. Recolor a low-contrast label located by #id.
test("recolor by #id — light text on light ground → dark on-palette", () => {
  const html = `<div><h1 id="lbl" class="kfhead" style="color:#EDE6D6">NEXT-GEN AI</h1></div>`;
  const r = contrastFix(html, [{ selector: "#lbl", text: "NEXT-GEN AI", needed: 4.5, bestRatio: 1.1, bestFg: [237, 230, 214], bestBg: LIGHT_BG, transparentFill: false }], { theme, packTokens });
  assert.equal(r.fixed.length, 1, "one fix");
  assert.equal(r.unfixable.length, 0, "no unfixable");
  assert.ok(["recolor", "recolor-neutral"].includes(r.fixed[0].strategy), "recolor strategy, got " + r.fixed[0].strategy);
  assert.ok(r.fixed[0].predictedRatio >= 4.5, "predicted clears AA: " + r.fixed[0].predictedRatio);
  assert.ok(/data-cc-fixed="1"/.test(r.html), "marker added");
  assert.ok(/color:#[0-9A-F]{6} !important/i.test(r.html), "color !important applied");
});

// 2. Gradient-clipped emphasis → un-clip to solid.
test("gradient emphasis (transparentFill) → un-clip", () => {
  const html = `<h1><span class="kfw kfacc" style="-webkit-text-fill-color:transparent;background-image:linear-gradient(#EEE,#DDD);-webkit-background-clip:text">glow</span></h1>`;
  const r = contrastFix(html, [{ selector: "span.kfw.kfacc", text: "glow", needed: 3, bestRatio: 1.3, bestFg: [230, 230, 230], bestBg: LIGHT_BG, transparentFill: true }], { theme, packTokens });
  assert.equal(r.fixed.length, 1);
  assert.equal(r.fixed[0].strategy, "unclip-gradient", "got " + r.fixed[0].strategy);
  assert.ok(/-webkit-background-clip:border-box !important/.test(r.html), "un-clipped");
  assert.ok(r.fixed[0].predictedRatio >= 3, "clears large-text AA");
});

// 3. Bare-tag selector with text disambiguation (distinct opening tags → only the
//    text-matched one is edited; a sibling <p> with different styling is left alone).
test("bare tag selector + text match → recolor only the matched element", () => {
  const html = `<p style="color:#111">first, already readable</p><p style="color:#DAD3C4">the failing line</p>`;
  const r = contrastFix(html, [{ selector: "p", text: "the failing line", needed: 4.5, bestRatio: 1.6, bestFg: [218, 211, 196], bestBg: LIGHT_BG, transparentFill: false }], { theme, packTokens });
  assert.equal(r.fixed.length, 1, "one fix");
  assert.equal((r.html.match(/data-cc-fixed/g) || []).length, 1, "only matched element edited");
  assert.ok(/color:#111">first, already readable/.test(r.html), "sibling <p> untouched");
});

// 4. Unlocatable element → unfixable, html untouched.
test("no matching element → unfixable, html unchanged", () => {
  const html = `<h1 id="a">hello</h1>`;
  const r = contrastFix(html, [{ selector: "#ghost", text: "nope", needed: 4.5, bestRatio: 1, bestFg: [200, 200, 200], bestBg: LIGHT_BG }], { theme, packTokens });
  assert.equal(r.fixed.length, 0);
  assert.equal(r.unfixable.length, 1);
  assert.equal(r.html, html, "html untouched");
});

// 5. Already-fixed element (prior recolor didn't stick) → escalate to scrim.
test("already data-cc-fixed → escalate to scrim chip", () => {
  const html = `<h2 id="cta" data-cc-fixed="1" style="color:#B23A2E !important">Buy now</h2>`;
  const r = contrastFix(html, [{ selector: "#cta", text: "Buy now", needed: 4.5, bestRatio: 2.0, bestFg: [178, 58, 46], bestBg: [180, 60, 48], transparentFill: false }], { theme, packTokens });
  assert.equal(r.fixed.length, 1);
  assert.equal(r.fixed[0].strategy, "scrim", "got " + r.fixed[0].strategy);
  assert.ok(/background-color:#[0-9A-F]{6} !important/i.test(r.html), "scrim chip bg");
  assert.ok(r.fixed[0].predictedRatio >= 4.5, "chip clears AA");
});

// 6. Multiple identical opening tags → all fixed by one edit.
test("repeated identical element → all copies fixed", () => {
  const html = `<span class="tag" style="color:#DDD">X</span>...<span class="tag" style="color:#DDD">X</span>`;
  const r = contrastFix(html, [{ selector: "span.tag", text: "X", needed: 4.5, bestRatio: 1.2, bestFg: [221, 221, 221], bestBg: LIGHT_BG }], { theme, packTokens });
  assert.equal((r.html.match(/data-cc-fixed/g) || []).length, 2, "both copies edited");
});

// 7. Idempotency: a second identical pass is a stable no-op on the fixed element.
test("idempotent — re-running does not corrupt the tag", () => {
  const html = `<h1 id="lbl" style="color:#EDE6D6">NEXT-GEN AI</h1>`;
  const f = [{ selector: "#lbl", text: "NEXT-GEN AI", needed: 4.5, bestRatio: 1.1, bestFg: [237, 230, 214], bestBg: LIGHT_BG }];
  const once = contrastFix(html, f, { theme, packTokens });
  const twice = contrastFix(once.html, f, { theme, packTokens });
  assert.equal((twice.html.match(/data-cc-fixed/g) || []).length, 1, "no duplicate marker");
  assert.equal((twice.html.match(/style=/g) || []).length, 1, "single style attribute");
});

// 8. WCAG math sanity — matches known values.
test("ratioOf math sanity (black/white = 21)", () => {
  assert.ok(Math.abs(ratioOf([0, 0, 0], [255, 255, 255]) - 21) < 0.01);
});

console.log(`\ncontrast_fix: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
