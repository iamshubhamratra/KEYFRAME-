// French syllable estimate (ANALYSIS.md §4.4) — vowel groups minus mute endings.
//
// Adjacent vowel letters (eau, ou, oi, ai, eu…) are one group. A final mute "e"/"es" and the verb
// ending "ent" after a consonant are not pronounced when the word has another nucleus.
//
// CONTRACT: count(word, { sp }) -> integer >= 1

const en = require("./en");

const GROUPS = /[aeiouyàâæéèêëîïôœùûüÿ]+/g;

function countWord(raw) {
  let w = String(raw || "").toLowerCase().replace(/[’']/g, " ").trim();
  if (!w) return 0;
  return w.split(/\s+/).reduce((acc, part) => {
    let p = part.replace(/[^a-zàâæçéèêëîïôœùûüÿ0-9]/g, "");
    if (!p) return acc;
    if (/[0-9]/.test(p)) return acc + en.digitsEstimate(p);
    p = p.replace(/(.)\1{2,}/g, "$1");
    let n = (p.match(GROUPS) || []).length;
    if (n > 1 && /[^aeiouyàâéèêëîïôûü]es?$/.test(p)) n--;          // mute final e / es
    else if (n > 1 && p.length > 4 && /[^aeiouy]ent$/.test(p)) n--;  // parlent (approximation)
    return acc + Math.max(1, n);
  }, 0);
}

function count(word, { sp } = {}) {
  const src = sp && String(sp).trim() ? String(sp) : String(word || "");
  const total = src.split(/[\s-]+/).filter(Boolean).reduce((a, p) => a + countWord(p), 0);
  return Math.max(1, total);
}

module.exports = { count, countWord };
