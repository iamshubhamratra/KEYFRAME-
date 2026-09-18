// Japanese weight estimate (ANALYSIS.md §4.4) — morae of the kana reading (`sp`).
//
// Every kana is one mora except small ゃゅょ/ぁぃぅぇぉ (they merge with the previous kana); small
// っ, ん and the long mark ー are one mora each. Without a kana reading, kanji are estimated at 2
// morae each. Latin tokens fall back to en.
//
// CONTRACT: count(word, { sp }) -> integer >= 1  ·  morae(kana) -> integer

const en = require("./en");

const SMALL = new Set(Array.from("ゃゅょぁぃぅぇぉゎャュョァィゥェォヮ"));
const KANA = /[ぁ-ゖァ-ヺー]/;
const KANJI = /[一-鿿㐀-䶿]/;

function morae(s) {
  let n = 0;
  for (const c of Array.from(String(s || ""))) {
    if (SMALL.has(c)) continue;
    if (KANA.test(c)) n++;
    else if (KANJI.test(c)) n += 2;
  }
  return n;
}

function countWord(raw) {
  const w = String(raw || "").normalize("NFKC");
  if (!w.trim()) return 0;
  if (KANA.test(w) || KANJI.test(w)) return Math.max(1, morae(w.replace(/ー{2,}/g, "ー")));
  return en.count(w);
}

function count(word, { sp } = {}) {
  const src = sp && String(sp).trim() ? String(sp) : String(word || "");
  return Math.max(1, src.split(/\s+/).filter(Boolean).reduce((a, p) => a + countWord(p), 0));
}

module.exports = { count, countWord, morae };
