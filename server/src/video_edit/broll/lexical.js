// VIDEO EDIT B-ROLL LEXICAL RELEVANCE — BM25-lite between a slot's intent and a candidate's text.
//
// WHY THIS EXISTS. Before any model sees a thumbnail, the prior has to decide which ≤ 12 of up to 24
// provider hits are worth a download and a judge cell, and when the judge is unavailable the lexical
// score IS the relevance signal (ANALYSIS.md §8: accept only with lex ≥ .5). Provider text is short and
// noisy (Pixabay comma tags, a Pexels URL slug, Openverse titles), so this is a small BM25 over the
// candidate pool with three pragmatic twists:
//   - field weights (tags 1.0 > title/alt .8 > slug .6) and a pool IDF softened to 0.6–1.0, so a query
//     word every candidate carries still counts (a raw IDF would zero "calendar" when all 8 hits have it);
//     a PEXELS slug weighs like tags (1.0): Pexels videos have no tags and the slug is its own title, so a
//     .6 slug capped a perfect Pexels match below a Pixabay tag hit;
//   - relevance is measured against the SLOT's queries only, never the query that fetched the candidate:
//     a clip always matches its own query, so a cliché fetched by a weak query ('productivity') would
//     score as relevant as an on-topic one;
//   - a stemming-lite per language (en/es/fr/de/pt), applied identically to query and document, plus an
//     English stem because provider tags are English whatever the transcript language;
//   - scripts without Latin letters (hi/ar/ja queries) can only match candidate text in that script —
//     typically provider-translated `localizedTags` — and are UNSCORED (not zero) when the candidate has
//     none, so a Japanese query never makes every English-tagged clip look irrelevant.
// Scores are normalized to 0..1 as the weighted share of query terms a candidate covers.
//
// CONTRACT (pure):
//   analyzeText(text, lang) -> [{ raw, latin:boolean, keys:string[] }]   (stopwords, noise and 1-char Latin dropped)
//   stemLite(token, lang) -> string
//   buildDoc(candidate, lang) -> { tf:Map<key, weightedTf>, len, nonLatin:boolean, empty:boolean }
//   lexicalScores({ candidates, queries, sentenceKeywords, lang, weights:{query, sentence}, k1, b })
//     -> [{ lexical:0..1|null, lexQuery:0..1|null, lexSentence:0..1|null }]  aligned with candidates
//     lexQuery = the best of the slot queries (candidate.query is display/debug only and never scored);
//     a group with no scorable token is null (skipped), not 0.

const lexicon = require("../director/lexicon");
const { round } = require("./common");

const NOISE = new Set(["video", "videos", "footage", "stock", "photo", "photos", "image", "images", "picture", "pictures",
  "free", "hd", "uhd", "royalty", "clip", "clips", "pexels", "pixabay", "openverse"]);
const FIELD_WEIGHTS = Object.freeze({ tags: 1.0, localizedTags: 1.0, title: 0.8, alt: 0.8, text: 0.6 });

const segmenters = new Map();
function segmenter(code) {
  let s = segmenters.get(code);
  if (!s) { s = new Intl.Segmenter(code, { granularity: "word" }); segmenters.set(code, s); }
  return s;
}

const LATIN_TOKEN = /^[\p{Script=Latin}\p{N}'’.-]+$/u;
const isLatinToken = (t) => LATIN_TOKEN.test(t);
const foldLatin = (t) => t.normalize("NFD").replace(/\p{M}+/gu, "").normalize("NFC");

const CONSONANT_DOUBLE = /([b-df-hj-np-tv-z])\1$/;
function undouble(s) { return CONSONANT_DOUBLE.test(s) && !/(ll|ss|zz)$/.test(s) ? s.slice(0, -1) : s; }

function stemEn(t) {
  let s = t;
  if (s.length > 4 && s.endsWith("ies")) s = `${s.slice(0, -3)}y`;
  else if (s.length > 4 && /(ss|x|ch|sh|z)es$/.test(s)) s = s.slice(0, -2);
  else if (s.length > 3 && s.endsWith("s") && !/(ss|us|is)$/.test(s)) s = s.slice(0, -1);
  if (s.length > 5 && s.endsWith("ing")) s = undouble(s.slice(0, -3));
  else if (s.length > 4 && s.endsWith("ed")) s = undouble(s.slice(0, -2));
  if (s.length > 3 && s.endsWith("e")) s = s.slice(0, -1);
  return s;
}

function stemIberian(t) {
  let s = t;
  if (s.length > 6 && s.endsWith("ciones")) s = s.slice(0, -2);            // notificaciones -> notificacion
  else if (s.length > 5 && s.endsWith("coes")) s = `${s.slice(0, -4)}cao`; // notificacoes (folded ções) -> notificacao
  else if (s.length > 4 && /[^aeiou]es$/.test(s)) s = s.slice(0, -2);      // reuniones -> reunion
  else if (s.length > 4 && s.endsWith("s")) s = s.slice(0, -1);
  if (s.length > 4 && /[aoe]$/.test(s)) s = s.slice(0, -1);                // gender / final vowel
  return s;
}

function stemFr(t) {
  let s = t;
  if (s.length > 4 && s.endsWith("aux")) s = `${s.slice(0, -3)}al`;
  else if (s.length > 4 && /[sx]$/.test(s)) s = s.slice(0, -1);
  if (s.length > 4 && s.endsWith("e")) s = s.slice(0, -1);
  return s;
}

function stemDe(t) {
  if (t.length <= 5) return t;
  for (const suf of ["ern", "en", "er", "es", "e", "s"]) {
    if (t.endsWith(suf) && t.length - suf.length >= 4) return t.slice(0, -suf.length);
  }
  return t;
}

function stemLite(token, lang) {
  const t = String(token || "");
  if (!isLatinToken(t) || t.length <= 3 || /^\d/.test(t)) return t;
  switch (lexicon.langCode(lang)) {
    case "es": case "pt": return stemIberian(t);
    case "fr": return stemFr(t);
    case "de": return stemDe(t);
    default: return stemEn(t); // en, and Latin words (brands, English nouns) inside hi/ar/ja text
  }
}

function isStop(t, code) {
  return NOISE.has(t) || lexicon.LEXICON.en.stopwords.has(t) || lexicon.lexiconFor(code).stopwords.has(t);
}

function analyzeText(text, lang) {
  const code = lexicon.langCode(lang);
  const s = String(text == null ? "" : text).normalize("NFKC")
    .replace(/[_/|,;:+#&()[\]{}"“”«»]+/g, " ")
    .replace(/(?<=\p{L})-(?=\p{L})/gu, " ");
  const out = [];
  for (const seg of segmenter(code).segment(s)) {
    if (!seg.isWordLike) continue;
    const lower = seg.segment.toLowerCase().replace(/^['’.-]+|['’.-]+$/g, "");
    if (!lower) continue;
    const latin = isLatinToken(lower);
    const raw = latin ? foldLatin(lower) : lower;
    if (latin && raw.length < 2) continue;
    if (isStop(lower, code) || isStop(raw, code)) continue;
    const keys = latin ? [...new Set([stemLite(raw, code), stemLite(raw, "en")])] : [raw];
    out.push({ raw, latin, keys });
  }
  return out;
}

function uniqueTokens(tokens) {
  const seen = new Set();
  return tokens.filter((t) => (seen.has(t.raw) ? false : (seen.add(t.raw), true)));
}

function buildDoc(c, lang) {
  const tf = new Map();
  let len = 0;
  let nonLatin = false;
  const fields = [
    ["tags", Array.isArray(c && c.tags) ? c.tags.join(" , ") : ""],
    ["localizedTags", Array.isArray(c && c.localizedTags) ? c.localizedTags.join(" , ") : ""],
    ["title", c && c.title], ["alt", c && c.alt], ["text", c && c.text],
  ];
  for (const [name, text] of fields) {
    if (!text) continue;
    const w = name === "text" && c && c.provider === "pexels" ? FIELD_WEIGHTS.tags : FIELD_WEIGHTS[name];
    for (const tok of analyzeText(text, lang)) {
      if (!tok.latin) nonLatin = true;
      for (const k of tok.keys) tf.set(k, (tf.get(k) || 0) + w);
      len += w;
    }
  }
  return { tf, len, nonLatin, empty: tf.size === 0 };
}

function lexicalScores({ candidates = [], queries = [], sentenceKeywords = [], lang = "en", weights = null, k1 = 1.2, b = 0.5 } = {}) {
  const wq = weights && Number.isFinite(weights.query) ? weights.query : 0.7;
  const ws = weights && Number.isFinite(weights.sentence) ? weights.sentence : 0.3;
  const docs = candidates.map((c) => buildDoc(c, lang));
  const N = Math.max(1, docs.length);
  const df = new Map();
  for (const d of docs) for (const k of d.tf.keys()) df.set(k, (df.get(k) || 0) + 1);
  const avgLen = docs.reduce((a, d) => a + d.len, 0) / N || 1;
  const idfMax = Math.log(1 + (N + 0.5) / 0.5);

  const qGroups = (Array.isArray(queries) ? queries : []).map((q) => uniqueTokens(analyzeText(q, lang))).filter((g) => g.length);
  const kw = Array.isArray(sentenceKeywords) ? sentenceKeywords.join(" , ") : String(sentenceKeywords || "");
  const sGroup = uniqueTokens(analyzeText(kw, lang));

  function groupScore(tokens, doc) {
    if (doc.empty) return null;
    let numer = 0, denom = 0;
    for (const tok of tokens) {
      if (!tok.latin && !doc.nonLatin) continue; // unscorable: no text in this script on the candidate
      let tf = 0, dfk = 0;
      for (const k of tok.keys) { tf = Math.max(tf, doc.tf.get(k) || 0); dfk = Math.max(dfk, df.get(k) || 0); }
      const idf = Math.log(1 + (N - dfk + 0.5) / (dfk + 0.5));
      const w = 0.6 + 0.4 * Math.min(1, idf / idfMax);
      const tfn = tf > 0 ? (tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * doc.len) / avgLen)) : 0;
      numer += w * Math.min(1, tfn);
      denom += w;
    }
    return denom > 0 ? numer / denom : null;
  }

  return docs.map((doc) => {
    let lexQuery = null;
    for (const g of qGroups) {
      const s = groupScore(g, doc);
      if (s != null && (lexQuery == null || s > lexQuery)) lexQuery = s;
    }
    const lexSentence = sGroup.length ? groupScore(sGroup, doc) : null;
    let lexical = null;
    if (lexQuery != null && lexSentence != null) lexical = (wq * lexQuery + ws * lexSentence) / (wq + ws);
    else if (lexQuery != null) lexical = lexQuery;
    else if (lexSentence != null) lexical = lexSentence;
    return {
      lexical: lexical == null ? null : round(lexical),
      lexQuery: lexQuery == null ? null : round(lexQuery),
      lexSentence: lexSentence == null ? null : round(lexSentence),
    };
  });
}

module.exports = { analyzeText, stemLite, buildDoc, lexicalScores, isLatinToken };
