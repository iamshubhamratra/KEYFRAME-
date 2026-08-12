// template_engine guards — run: node scripts/template_engine.test.cjs
//
// Every case here is a defect QA actually blocked on a shipped film (job
// 7ntv4tvnli, poster-pop 9:16), not a hypothetical:
//   * "Free for 12 months" rendered as "FREE FORONTHS" — the unit-suffix regex
//     ate the M of "months" and the label was built by deleting that span.
//   * body copy on a saturated accent measured 3.63:1 because an 0.82 alpha was
//     applied to an ink that only cleared 4.60:1 at full strength.

const assert = require("node:assert");
const E = require("../src/services/template_engine");

let failures = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  PASS  ${name}`); }
  catch (e) { failures++; console.log(`  FAIL  ${name}\n        ${e.message}`); }
};

// ---- stat mining: a suffix must never be the next word's first letter --------
const cases = [
  ["Free for 12 months", { v: 12, suf: "", l: "FREE FOR MONTHS" }],
  ["240% faster ships", { v: 240, suf: "%", l: "FASTER SHIPS" }],
  ["12k teams onboard", { v: 12, suf: "K", l: "TEAMS ONBOARD" }],
  ["30X return on investment", { v: 30, suf: "X", l: "RETURN ON INVESTMENT" }],
  ["12 kits shipped weekly", { v: 12, suf: "", l: "KITS SHIPPED WEEKLY" }],
  ["3 million downloads", { v: 3, suf: "", l: "MILLION DOWNLOADS" }],
  ["99.9% uptime SLA", { v: 99.9, suf: "%", l: "UPTIME SLA" }],
];
for (const [input, want] of cases) {
  check(`mineStat("${input}")`, () => {
    const got = E.mineStat(input);
    assert.ok(got, "returned null");
    assert.strictEqual(got.v, want.v, `value ${got.v} != ${want.v}`);
    assert.strictEqual(got.suf, want.suf, `suffix "${got.suf}" != "${want.suf}"`);
    assert.strictEqual(got.l, want.l, `label "${got.l}" != "${want.l}"`);
  });
}
check("no label loses a letter to the suffix", () => {
  for (const s of ["Free for 12 months", "12 kits", "5 macs", "8 xylophones", "40 bags"]) {
    const got = E.mineStat(s);
    const tail = s.slice(String(s).search(/\d/)).replace(/^[\d.,]+\s*/, "").replace(/[^\w\s]/g, "").trim().toUpperCase();
    if (tail) assert.ok(got.l.includes(tail.split(/\s+/)[0]), `"${s}" → label "${got.l}" dropped a letter from "${tail}"`);
  }
});

// ---- readable(): composited text must clear the contrast target --------------
const GROUNDS = ["#c67139", "#FF4B2B", "#FFE600", "#0B0713", "#F3ECDD", "#05060A", "#3DF07E"];
check("readable() clears 4.5:1 on every pack ground it can", () => {
  for (const bg of GROUNDS) {
    const ink = E.inkOn(bg, "#141210", "#F7F5F0");
    const out = E.readable(bg, ink, 0.82);
    // Resolve whatever form it returned (hex or rgba) to its composited colour.
    const m = /rgba\((\d+),(\d+),(\d+),([\d.]+)\)/.exec(out);
    const composited = m
      ? E.flatten(`#${[m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, "0")).join("")}`, bg, Number(m[4]))
      : out;
    const ratio = E.contrastRatio(composited, bg);
    assert.ok(ratio >= 4.5, `${bg}: readable() gave ${out} → ${ratio.toFixed(2)}:1`);
  }
});
check("readable() reproduces the exact QA failure as a pass", () => {
  const bg = "#c67139";
  const before = E.contrastRatio(E.flatten("#201e1d", bg, 0.82), bg);
  const after = E.contrastRatio(E.readable(bg, "#141210", 0.82), bg);
  assert.ok(before < 4.5, `the shipped colour should fail, measured ${before.toFixed(2)}`);
  assert.ok(after >= 4.5, `the fix should pass, measured ${after.toFixed(2)}`);
});
check("inkOn() picks the higher-contrast ink, not the luminance guess", () => {
  for (const bg of GROUNDS) {
    const got = E.inkOn(bg, "#141210", "#F7F5F0");
    const other = got === "#141210" ? "#F7F5F0" : "#141210";
    assert.ok(E.contrastRatio(got, bg) >= E.contrastRatio(other, bg), `${bg}: chose the worse ink`);
  }
});

console.log(failures ? `\n${failures} check(s) failed` : "\nall template_engine guards hold");
process.exit(failures ? 1 : 0);
