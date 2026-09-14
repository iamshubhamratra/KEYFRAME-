// WHAT EACH PACE ACTUALLY BUDGETS — narration vs. on-screen text, side by side.
//
// The complaint this answers is "fast pace makes the film look empty". This
// prints the two budgets next to each other so the claim is arithmetic rather
// than an impression: how many words the narrator is given, and how many text
// elements the FRAME is given, at each mode.
//
//   node scripts/pace-density-report.js [durationSec]
const pacing = require("../src/services/pacing");

const D = Number(process.argv[2] || 60);
const MODES = ["relaxed", "normal", "fast", "veryFast"];

const pad = (s, n) => String(s).padEnd(n);
const num = (s, n) => String(s).padStart(n);

console.log(`\nPACE DENSITY REPORT — ${D}s film\n`);

const rows = MODES.map((k) => {
  const P = pacing.resolve(k);
  const t = pacing.sceneTargetFor(D, P);
  const wordsPerScene = pacing.wordBudget(t.sceneSec, P);
  const totalWords = wordsPerScene * t.sceneCount;
  // What the FRAME is allowed to carry, per scene, from the three budgets that
  // decide on-screen text: the bullet row, the supporting line, and the
  // narration-overlay card.
  const visualPerScene = P.bulletsMax + (P.subtextChars > 0 ? 1 : 0);
  return {
    k, P, t, wordsPerScene, totalWords, visualPerScene,
    totalBullets: P.bulletsMax * t.sceneCount,
  };
});

console.log(pad("mode", 10) + num("mult", 6) + num("scenes", 8) + num("sceneSec", 10)
  + num("cutSec", 8) + num("w/sec", 7) + num("VOw/scene", 11) + num("VOwords", 9));
console.log("-".repeat(69));
for (const r of rows) {
  console.log(pad(r.P.label, 10) + num(r.P.multiplier.toFixed(2), 6) + num(r.t.sceneCount, 8)
    + num(r.t.sceneSec, 10) + num(r.P.beatSec, 8) + num(r.P.wordsPerSec, 7)
    + num(r.wordsPerScene, 11) + num(r.totalWords, 9));
}

console.log(`\nON-SCREEN TEXT BUDGETS (what the frame may carry)\n`);
console.log(pad("mode", 10) + num("bullets", 9) + num("subtextCh", 11)
  + num("ovlWordsL", 11) + num("ovlWordsP", 11) + num("readCps", 9) + num("bulletsTotal", 14));
console.log("-".repeat(75));
for (const r of rows) {
  console.log(pad(r.P.label, 10) + num(r.P.bulletsMax, 9) + num(r.P.subtextChars, 11)
    + num(r.P.overlayMaxWordsLand, 11) + num(r.P.overlayMaxWordsPortrait, 11)
    + num(r.P.readCps, 9) + num(r.totalBullets, 14));
}

const base = rows.find((r) => r.k === "normal");
console.log(`\nRELATIVE TO NORMAL (1.00 = same as Normal)\n`);
console.log(pad("mode", 10) + num("VOwords", 9) + num("scenes", 8) + num("bullets/scene", 15)
  + num("subtextCh", 11) + num("ovlWords", 10) + num("bulletsTotal", 14));
console.log("-".repeat(78));
const rel = (a, b) => (b ? (a / b).toFixed(2) : "-");
for (const r of rows) {
  console.log(pad(r.P.label, 10)
    + num(rel(r.totalWords, base.totalWords), 9)
    + num(rel(r.t.sceneCount, base.t.sceneCount), 8)
    + num(rel(r.P.bulletsMax, base.P.bulletsMax), 15)
    + num(rel(r.P.subtextChars, base.P.subtextChars), 11)
    + num(rel(r.P.overlayMaxWordsLand, base.P.overlayMaxWordsLand), 10)
    + num(rel(r.totalBullets, base.totalBullets), 14));
}
console.log("");
