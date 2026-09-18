// German syllable estimate (ANALYSIS.md §4.4) — vowel groups with diphthong rules.
//
// Diphthongs and long vowels (ei, ie, eu, äu, au, ai, aa, ee, oo) are one nucleus; any other
// adjacent vowel pair is a hiatus (Feu-er, The-a-ter), so a vowel group longer than a known
// diphthong adds nuclei.
//
// CONTRACT: count(word, { sp }) -> integer >= 1

const en = require("./en");

const GROUPS = /[aeiouyäöü]+/g;
const DIPH = ["äu", "ei", "ie", "eu", "au", "ai", "aa", "ee", "oo", "ey", "ay"];

function groupNuclei(g) {
  let n = 0;
  for (let k = 0; k < g.length;) {
    const two = g.slice(k, k + 2);
    if (two.length === 2 && DIPH.includes(two)) k += 2; else k += 1;
    n++;
  }
  return n;
}

function countWord(raw) {
  let w = String(raw || "").toLowerCase().replace(/[^a-zäöüß0-9]/g, "");
  if (!w) return 0;
  if (/[0-9]/.test(w)) return en.digitsEstimate(w);
  w = w.replace(/(.)\1{2,}/g, "$1");
  const groups = w.match(GROUPS) || [];
  return Math.max(1, groups.reduce((a, g) => a + groupNuclei(g), 0));
}

function count(word, { sp } = {}) {
  const src = sp && String(sp).trim() ? String(sp) : String(word || "");
  const total = src.split(/[\s-]+/).filter(Boolean).reduce((a, p) => a + countWord(p), 0);
  return Math.max(1, total);
}

module.exports = { count, countWord, groupNuclei };
