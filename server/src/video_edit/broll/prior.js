// VIDEO EDIT B-ROLL PRIOR — the cheap ranking that decides which candidates earn a judge cell.
//
// WHY THIS EXISTS. A slot can return two dozen provider hits, but a contact sheet holds eight and every
// thumbnail download costs time. The prior (ANALYSIS.md §8) orders candidates using only what is known
// before any model call: lexical relevance (BM25-lite, .55), the provider's own ranking (.15, decaying
// 1/(1 + .15·rank)) and technical fit (.30). Technical failures (upscale, cover loss, too short, flat
// thumbnail) are dropped here with their reasons, so the judge never spends a cell on an unusable clip.
// It runs twice per slot: once without thumbnail stats (which to download), once with them (grey stdev).
//
// Two provider-fairness rules, for the PRIOR ONLY (never for lexical-only acceptance):
//   - the sentence side of BM25 is the slot's English visual nouns, plus content keywords only for an
//     English transcript — Spanish keywords never match English tags and would zero every candidate;
//   - a tagless Pexels hit in the provider's top 5 gets a lexical floor (.45): Pexels ranks semantically and
//     its best clips often have a bare numeric slug, which would otherwise never reach the contact sheet.
//
// CONTRACT (pure):
//   rankPrior({ slot, candidates, output, lang='en', stats:Map<key,{stdev}>|null, opts }) ->
//     { ranked:[{ candidate, key, lexical:{lexical,lexQuery,lexSentence}, lexPrior, technical, rankScore, prior }],
//       top: ranked[0..topK), dropped:[{ key, reasons }] }
//   priorOf({ lexical, rankScore, tech }, opts) -> number
//   sentenceKeywordsFor(slot, lang) -> string[]
//   candidates may be raw provider items (normalized here) or already-normalized candidates.

const { resolveScoringSettings } = require("./score_defaults");
const { lexicalScores } = require("./lexical");
const { technicalFit } = require("./technical");
const { normalizeCandidate, round, isPlain, num } = require("./common");
const lexicon = require("../director/lexicon");

function priorOf({ lexical, rankScore, tech }, p) {
  return p.wLex * (lexical == null ? p.unknownLexical : lexical) + p.wRank * rankScore + p.wTech * tech;
}

function sentenceKeywordsFor(slot, lang) {
  const nouns = Array.isArray(slot && slot.visualNouns) ? slot.visualNouns.filter((x) => typeof x === "string") : [];
  const kw = lexicon.langCode(lang) === "en" && Array.isArray(slot && slot.keywords) ? slot.keywords.filter((x) => typeof x === "string") : [];
  return [...nouns, ...kw];
}

function rankPrior({ slot = {}, candidates = [], output = {}, lang = "en", stats = null, opts = {}, settings = null } = {}) {
  const cfg = resolveScoringSettings(settings);
  const p = { ...cfg.prior, ...(isPlain(opts) ? opts : {}) };
  const techOpts = { ...cfg.technical, ...(isPlain(opts.technical) ? opts.technical : {}) };

  const seen = new Set();
  const norm = [];
  (Array.isArray(candidates) ? candidates : []).forEach((raw, i) => {
    const c = raw && typeof raw.key === "string" && raw.assetId ? raw : normalizeCandidate(raw, i);
    if (!c || seen.has(c.key)) return;
    seen.add(c.key);
    norm.push(c);
  });

  const lex = lexicalScores({
    candidates: norm, queries: slot.queries || [], sentenceKeywords: sentenceKeywordsFor(slot, lang), lang,
    weights: { query: p.lexQueryWeight, sentence: p.lexSentenceWeight }, k1: p.bm25K1, b: p.bm25B,
  });
  const needSec = num(slot.clipNeedSec) != null ? num(slot.clipNeedSec) : num(slot.outDurEstimate);

  const ranked = [];
  const dropped = [];
  norm.forEach((c, i) => {
    const st = stats && typeof stats.get === "function" ? stats.get(c.key) : null;
    const technical = technicalFit({ candidate: c, output, needSec, stdev: st ? st.stdev : null, opts: techOpts });
    if (!technical.pass) { dropped.push({ key: c.key, reasons: technical.reasons.length ? technical.reasons : ["technical"] }); return; }
    const rankScore = 1 / (1 + p.rankDecay * c.rank);
    let lexPrior = lex[i].lexical;
    if (c.provider === "pexels" && !(c.tags && c.tags.length) && c.rank < p.pexelsRankFloorTop) {
      lexPrior = Math.max(lexPrior == null ? 0 : lexPrior, p.pexelsRankFloor);
    }
    const prior = priorOf({ lexical: lexPrior, rankScore, tech: technical.tech }, p);
    ranked.push({ candidate: c, key: c.key, lexical: lex[i], lexPrior: lexPrior == null ? null : round(lexPrior), technical, rankScore: round(rankScore), prior: round(prior) });
  });
  ranked.sort((a, b) => (b.prior - a.prior) || (a.candidate.rank - b.candidate.rank) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const topK = Math.max(1, Math.floor(num(p.topK) || 8));
  return { ranked, top: ranked.slice(0, topK), dropped };
}

module.exports = { rankPrior, priorOf, sentenceKeywordsFor };
