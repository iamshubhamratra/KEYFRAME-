// Spanish syllable estimate (ANALYSIS.md §4.4) — vowel nuclei with diphthong / hiatus rules.
//
// Strong vowels (a e o, and accented á é ó í ú) form separate nuclei; a weak vowel (i u ü, final y)
// next to another vowel joins it in a diphthong unless the weak vowel carries an accent (hiatus:
// "día" = 2). The u of que/qui/gue/gui is silent. Digits and non-Spanish tokens fall back to en.
//
// CONTRACT: count(word, { sp }) -> integer >= 1

const en = require("./en");

const STRONG = new Set(["a", "e", "o", "á", "é", "ó", "í", "ú"]);
const WEAK = new Set(["i", "u", "ü", "y"]);

function nuclei(w, { strong = STRONG, weak = WEAK } = {}) {
  let n = 0;
  let prev = null;          // 's' strong, 'w' weak, null consonant
  for (let k = 0; k < w.length; k++) {
    const c = w[k];
    const isY = c === "y";
    const kind = strong.has(c) ? "s" : (weak.has(c) && (!isY || k === w.length - 1 || !/[aeiouáéíóú]/.test(w[k + 1] || ""))) ? "w" : null;
    if (!kind) { prev = null; continue; }
    if (prev === null) n++;
    else if (prev === "s" && kind === "s") n++;            // hiatus: two strong vowels
    prev = kind;
  }
  return n;
}

function countWord(raw, opts) {
  let w = String(raw || "").toLowerCase().replace(/[^a-záéíóúüñ0-9]/g, "");
  if (!w) return 0;
  if (/[0-9]/.test(w)) return en.digitsEstimate(w);
  w = w.replace(/(.)\1{2,}/g, "$1");
  w = w.replace(/([qg])u([eiéí])/g, "$1$2");                 // que, qui, gue, gui: silent u
  return Math.max(1, nuclei(w, opts));
}

function count(word, { sp } = {}) {
  const src = sp && String(sp).trim() ? String(sp) : String(word || "");
  const total = src.split(/[\s-]+/).filter(Boolean).reduce((a, p) => a + countWord(p), 0);
  return Math.max(1, total);
}

module.exports = { count, countWord, nuclei, STRONG, WEAK };
