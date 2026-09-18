// Arabic syllable estimate (ANALYSIS.md §4.4) — consonant letters / 2.2 + long vowels.
//
// Unvocalized Arabic writes consonants and long vowels only; short vowels are implied, so roughly
// one syllable per 2.2 consonants plus one per long vowel letter (ا و ي ى non-initial, آ anywhere).
// Harakat are ignored, elongated letters are collapsed (اممم = one filler syllable).
//
// CONTRACT: count(word, { sp }) -> integer >= 1

const en = require("./en");

const HARAKAT = /[ً-ٰٟـ]/g;     // diacritics + tatweel
const ARABIC_LETTER = /[ء-يٱ-ۓ]/;

function countWord(raw) {
  let w = String(raw || "").normalize("NFC").replace(HARAKAT, "");
  if (!w.trim()) return 0;
  if (!/[؀-ۿ]/.test(w)) return /[0-9٠-٩]/.test(w) ? en.digitsEstimate(w.replace(/[٠-٩]/g, "1")) : en.count(w);
  const letters = Array.from(w).filter((c) => ARABIC_LETTER.test(c));
  const collapsed = letters.filter((c, k) => k === 0 || c !== letters[k - 1]);
  let consonants = 0, longVowels = 0;
  collapsed.forEach((c, k) => {
    const next = collapsed[k + 1];
    if (c === "آ") longVowels++;
    else if (k > 0 && (c === "ا" || c === "ى")) longVowels++;
    else if (k > 0 && (c === "و" || c === "ي") && next !== "ا" && next !== "و" && next !== "ي") longVowels++;
    else consonants++;
  });
  return Math.max(1, Math.round(consonants / 2.2 + longVowels));
}

function count(word, { sp } = {}) {
  const src = sp && String(sp).trim() ? String(sp) : String(word || "");
  const total = src.split(/[\s-]+/).filter(Boolean).reduce((a, p) => a + countWord(p), 0);
  return Math.max(1, total);
}

module.exports = { count, countWord };
