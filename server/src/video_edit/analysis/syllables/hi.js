// Hindi syllable estimate (ANALYSIS.md §4.4) — Devanagari grapheme clusters via Intl.Segmenter.
//
// Each grapheme cluster that carries a letter (consonant + matra, independent vowel, conjunct) is
// roughly one akshara/syllable. Clusters that end in a virama (a dead consonant) add none, and the
// inherent schwa of a bare final consonant is dropped (कमल = ka-mal = 2). Latin-script tokens
// (Hinglish) fall back to en.
//
// CONTRACT: count(word, { sp }) -> integer >= 1

const en = require("./en");

const LETTER = /[ऄ-हक़-ॡॲ-ॿ]/;
const MATRA_OR_SIGN = /[ऺ-ौॎॏॕ-ॗॢॣऀ-ः]$/;
const VIRAMA_END = /्$/;
const INDEPENDENT_VOWEL = /^[ऄ-औॠॡ]/;

let segmenter = null;
function graphemes(s) {
  try {
    if (!segmenter) segmenter = new Intl.Segmenter("hi", { granularity: "grapheme" });
    return [...segmenter.segment(s)].map((x) => x.segment);
  } catch {
    return Array.from(s);
  }
}

function countDevanagari(w) {
  const clusters = graphemes(w).filter((g) => LETTER.test(g) && !VIRAMA_END.test(g));
  let n = clusters.length;
  if (n > 1) {
    const last = clusters[n - 1];
    if (!MATRA_OR_SIGN.test(last) && !INDEPENDENT_VOWEL.test(last)) n--;   // final schwa deletion
  }
  return n;
}

function countWord(raw) {
  const w = String(raw || "").normalize("NFC");
  if (!w.trim()) return 0;
  if (/[ऀ-ॿ]/.test(w)) return Math.max(1, countDevanagari(w.replace(/[^ऀ-ॿ]/g, "")));
  if (/[0-9०-९]/.test(w)) return en.digitsEstimate(w.replace(/[०-९]/g, "1"));
  return en.count(w);
}

function count(word, { sp } = {}) {
  const src = sp && String(sp).trim() ? String(sp) : String(word || "");
  const total = src.split(/[\s-]+/).filter(Boolean).reduce((a, p) => a + countWord(p), 0);
  return Math.max(1, total);
}

module.exports = { count, countWord, graphemes };
