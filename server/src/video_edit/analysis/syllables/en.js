// English syllable estimate (ANALYSIS.md §4.4) — vowel groups with silent-e, -le and -ed rules.
//
// WHY THIS EXISTS. Island alignment distributes an island's voiced time over its words in
// proportion to syllables. The estimate only has to be proportional, not dictionary-exact, but it
// must never return 0 (a word always takes time) and must treat elongated fillers ("ummmm") as one
// syllable. It is also the fallback counter for Latin-script tokens in every other language.
//
// CONTRACT: count(word, { sp }) -> integer >= 1   (sp = spoken form, used for digits when present)

const VOWELS = /[aeiouy]+/g;

function digitsEstimate(s) {
  const d = s.replace(/[^0-9]/g, "");
  if (!d) return 0;
  return Math.max(1, Math.round(d.length * 1.5));
}

function countLatin(raw) {
  let w = String(raw || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]/g, "");
  if (!w) return 0;
  w = w.replace(/(.)\1{2,}/g, "$1");          // ummmm -> um, sooo -> so
  if (w.length <= 3) return Math.max(1, (w.match(VOWELS) || []).length);
  let n = (w.match(VOWELS) || []).length;
  if (/[^aeiouy]e$/.test(w) && !/[^aeiouy]le$/.test(w) && n > 1) n--;           // silent final e (make), not -le (table)
  if (/[^aeiouy]es$/.test(w) && !/(s|x|z|ch|sh|c|g)es$/.test(w) && n > 1) n--;  // makes, but not boxes / pages
  if (/ed$/.test(w) && !/[td]ed$/.test(w) && n > 1) n--;                        // walked, but not wanted
  if (/^y[aeiou]/.test(w) && n > 1) { /* "ye" onset y is a consonant; vowel group already merged */ }
  return Math.max(1, n);
}

function count(word, { sp } = {}) {
  const src = sp && String(sp).trim() ? String(sp) : String(word || "");
  const parts = src.split(/[\s-]+/).filter(Boolean);
  let total = 0;
  for (const p of parts) total += /[0-9]/.test(p) ? digitsEstimate(p) : countLatin(p);
  return Math.max(1, total);
}

module.exports = { count, countLatin, digitsEstimate };
