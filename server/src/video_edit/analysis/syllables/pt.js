// Portuguese syllable estimate (ANALYSIS.md §4.4) — vowel nuclei with diphthong rules.
//
// Same nucleus model as Spanish plus nasal vowels (ã õ â ê ô): "ão", "ãe", "õe" are single
// diphthongs; accented í ú break a diphthong (hiatus: "saída" = 3); qu/gu before e/i is silent.
//
// CONTRACT: count(word, { sp }) -> integer >= 1

const en = require("./en");
const es = require("./es");

const STRONG = new Set(["a", "e", "o", "á", "é", "ó", "í", "ú", "ã", "õ", "â", "ê", "ô", "à"]);
const WEAK = new Set(["i", "u", "ü", "y"]);

function countWord(raw) {
  let w = String(raw || "").toLowerCase().replace(/[^a-záéíóúãõâêôàçü0-9]/g, "");
  if (!w) return 0;
  if (/[0-9]/.test(w)) return en.digitsEstimate(w);
  w = w.replace(/(.)\1{2,}/g, "$1");
  w = w.replace(/([qg])u([eiéí])/g, "$1$2");
  w = w.replace(/ão|ãe|õe/g, "ã");                             // nasal diphthongs = one nucleus
  return Math.max(1, es.nuclei(w, { strong: STRONG, weak: WEAK }));
}

function count(word, { sp } = {}) {
  const src = sp && String(sp).trim() ? String(sp) : String(word || "");
  const total = src.split(/[\s-]+/).filter(Boolean).reduce((a, p) => a + countWord(p), 0);
  return Math.max(1, total);
}

module.exports = { count, countWord };
