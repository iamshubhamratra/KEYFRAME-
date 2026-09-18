// VIDEO EDIT B-ROLL SLOTS — which sentences are worth a stock search, and what to search for.
//
// WHY THIS EXISTS. Searching and judging are the slow, rate-limited, paid part of B-roll, so they run
// ONCE per project, before the director, over a slot set that already covers every intensity the user
// might pick later (ANALYSIS.md §8): the HIGH item budget for the output duration + 30 %. The director
// then only chooses among sentences that have an accepted candidate, and switching Low → High never
// refetches. A slot must also respect the moments the rhythm engine will protect anyway — a sentence
// the speaker must deliver on camera (faceRequired: sincere, personal, humor, direct address, CTA), the
// CTA, the hook guard (no cutaway in the first 1.5 s at High), screen-content sections — or its search
// is wasted. Queries come ONLY from the content analysis' visual nouns (concrete, filmable, English by
// prompt contract) cleaned by broll/query_filter (subjectQuery + prepositions/adjectives/gerunds dropped +
// the acronym whitelist shared with retrieval). Content `keywords` are abstract and in the transcript's
// language ("productivity", "almacén"): they never become stock queries — English-indexed providers
// answer them with handshakes and charts — and only travel to the judge as context. A slot with fewer
// than two noun queries gets the broader head-noun form of a long one ('person city street' → 'city
// street'). When content analysis failed, a TF-IDF salience over noun-like tokens stands in for `need`
// (EDIT_PLAN.md §6 heuristic director), with lexicon-based CTA and first-person-emotional faceRequired;
// those transcript-language terms are searched with the provider's locale (queryLang) where one exists
// (es/fr/de/pt/ja), and dropped where none does (hi/ar), since a Devanagari query on an English index
// returns noise. Low-ranked slots get a smaller query budget (quota: Pexels is shared server-wide).
//
// CONTRACT (pure):
//   buildSlots({ content, sentences, words, faces, settings, output, transcript, lang, serverSettings }) -> {
//     schemaVersion:1, source:'content'|'heuristic', lang, enabled, outputDurationSec, cap, hookGuardSec, needMin,
//     slots:[{ slotId:'sl_<sentenceId>', sentenceId, w0, w1, start, end, outStart, outEnd, outDurEstimate, clipNeedSec,
//              queries:string[≤3], queryBudget:1..3, queryLang, visualNouns:string[≤4], mediaPreference:'video'|'either',
//              need, importance, priority, rank, text, keywords (judge context only), avoid }],
//     excluded:[{ sentenceId, reason:'low_need'|'face_required'|'cta'|'hook_guard'|'screen_content'|'no_query'|'cap'|'disabled' }] }
//   settings = project settings (broll.enabled / allowImages); output = { durationSec? }
//   capFor(outputDurationSec, cfg) -> int · cleanQuery(text, { whitelist, lang }) -> string
//   heuristicSalience(sentences, lang) -> Map<sentenceId, { salience, terms, bigrams }>
//   SLOTS_REL = 'analysis/broll_slots.json'

const lexicon = require("../director/lexicon");
const { resolveRetrievalSettings } = require("./defaults");
const { cleanQuery: filterQuery, headQuery, MANNER } = require("./query_filter");
const { resolveScoringSettings } = require("./score_defaults");
const { isPlain, num, clamp, clamp01, round, safeSlotId } = require("./common");

const SLOTS_REL = "analysis/broll_slots.json";
const IMAGE_FRIENDLY = /\b(chart|graph|diagram|infographic|map|logo|document|screenshot|statistic|stats|photo|photograph|portrait|painting|poster|illustration|blueprint|spreadsheet|receipt|invoice)s?\b/i;

const hasNonLatinLetters = (s) => [...String(s)].some((ch) => /\p{L}/u.test(ch) && !/\p{Script=Latin}/u.test(ch));
// Languages whose stock search can be localized (Pexels `locale`, Pixabay `lang`); others search English only.
const LOCALIZED_SEARCH = new Set(["en", "es", "fr", "de", "pt", "ja"]);

// Manner adverbs subjectQuery does not list ("slowly", "steadily"): direction words, never a stock subject.
const dropManner = (q) => q.split(" ").filter((w) => w && !MANNER.has(w.toLowerCase())).join(" ");

// whitelist undefined → retrieval's default acronym whitelist (query_filter); [] disables it.
function cleanQuery(text, { whitelist, lang = "en" } = {}) {
  const s = String(text == null ? "" : text).normalize("NFKC").replace(/\s+/g, " ").trim();
  if (!s) return "";
  const code = lexicon.langCode(lang);
  if (hasNonLatinLetters(s)) {
    const toks = lexicon.tokenize(s, code).filter((t) => !lexicon.isStopword(t.norm, code)).map((t) => t.text);
    const joined = (toks.length ? toks : [s]).join(code === "ja" ? "" : " ");
    return joined.slice(0, 60).trim();
  }
  // ASCII text: exactly what retrieval will send (query_filter: subjectQuery + canonical acronyms).
  if (!/[^\x00-\x7F]/.test(s)) return dropManner(filterQuery(dropManner(s), { whitelist, maxChars: 60 }));
  const out = [];
  for (const raw of s.split(" ")) {
    const bare = raw.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
    if (!bare) continue;
    if (/[^\x00-\x7F]/.test(bare)) {
      // Accented Latin (es/fr/de/pt): subjectQuery's ASCII regex would cut "reunión" to "reuni".
      const norm = bare.toLowerCase();
      if (norm.length >= 3 && !lexicon.isStopword(norm, code)) out.push(norm);
      continue;
    }
    const q = filterQuery(bare, { whitelist, maxChars: 60 });
    if (q) out.push(q);
  }
  return [...new Set(out)].slice(0, 3).join(" ").slice(0, 60).trim();
}

function capFor(outputDurationSec, cfg) {
  const c = isPlain(cfg) && isPlain(cfg.rhythmHigh) && isPlain(cfg.slots) ? cfg : resolveScoringSettings(null);
  const d = Math.max(0, Number(outputDurationSec) || 0);
  return Math.max(1, Math.ceil(c.rhythmHigh.itemsPer60 * (d / 60) * c.slots.headroom - 1e-9));
}

function normSentences(list) {
  return (Array.isArray(list) ? list : [])
    .filter(isPlain)
    .map((s) => ({
      id: s.id == null ? null : String(s.id),
      w0: Number.isInteger(s.w0) ? s.w0 : null,
      w1: Number.isInteger(s.w1) ? s.w1 : null,
      start: num(s.start), end: num(s.end),
      text: typeof s.text === "string" ? s.text : "",
      pauseAfter: Math.max(0, num(s.pauseAfter) || 0),
    }))
    .filter((s) => s.id && s.start != null && s.end != null && s.end >= s.start)
    .sort((a, b) => a.start - b.start);
}

function fillerSeconds(words, sents) {
  const out = new Map();
  const list = Array.isArray(words) ? words : [];
  const byIndex = new Map();
  list.forEach((w, k) => { if (isPlain(w)) byIndex.set(Number.isInteger(w.i) ? w.i : k, w); });
  for (const s of sents) {
    let sec = 0;
    if (s.w0 != null && s.w1 != null) {
      for (let i = s.w0; i <= s.w1; i++) {
        const w = byIndex.get(i);
        if (w && w.isFiller && num(w.start) != null && num(w.end) != null) sec += Math.max(0, w.end - w.start);
      }
    }
    out.set(s.id, sec);
  }
  return out;
}

function heuristicSalience(sents, lang) {
  const code = lexicon.langCode(lang);
  const docs = sents.map((s) => {
    const toks = lexicon.tokenize(s.text, code);
    const nouns = [];
    toks.forEach((t, idx) => { if (lexicon.isNounLike(t.norm, code)) nouns.push({ idx, text: t.text, key: lexicon.stem(t.norm, code) }); });
    return { s, n: toks.length, nouns };
  });
  const df = new Map();
  for (const d of docs) for (const k of new Set(d.nouns.map((x) => x.key))) df.set(k, (df.get(k) || 0) + 1);
  const S = Math.max(1, docs.length);
  const per = new Map();
  let globalMax = 0;
  for (const d of docs) {
    const tf = new Map();
    for (const x of d.nouns) tf.set(x.key, (tf.get(x.key) || 0) + 1);
    const scored = [...tf.entries()]
      .map(([key, count]) => ({ key, text: d.nouns.find((x) => x.key === key).text, score: (count / Math.max(1, d.n)) * Math.log(1 + S / df.get(key)) }))
      .sort((a, b) => (b.score - a.score) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    const bigrams = [];
    for (let j = 1; j < d.nouns.length; j++) if (d.nouns[j].idx === d.nouns[j - 1].idx + 1) bigrams.push(`${d.nouns[j - 1].text} ${d.nouns[j].text}`);
    const top = scored.length ? scored[0].score : 0;
    globalMax = Math.max(globalMax, top);
    per.set(d.s.id, { raw: top, terms: scored.map((x) => x.text), bigrams });
  }
  for (const v of per.values()) v.salience = globalMax > 0 ? round(v.raw / globalMax) : 0;
  return per;
}

function screenContentShare(faces, s) {
  const frames = faces && Array.isArray(faces.frames) ? faces.frames : [];
  let total = 0, screen = 0;
  for (const f of frames) {
    if (!isPlain(f)) continue;
    const t = num(f.t != null ? f.t : (f.atSec != null ? f.atSec : f.time));
    if (t == null || t < s.start || t > s.end) continue;
    total++;
    if (typeof f.screenContent === "string" && f.screenContent.trim()) screen++;
  }
  return total ? screen / total : 0;
}

function buildSlots({ content = null, sentences = null, words = [], faces = null, settings = null, output = null, transcript = null, lang = null, serverSettings = null } = {}) {
  const cfg = resolveScoringSettings(serverSettings);
  const whitelist = resolveRetrievalSettings(serverSettings).queryWhitelist;
  const code = lexicon.langCode(lang || (transcript && transcript.language) || "en");
  const sents = normSentences(Array.isArray(sentences) && sentences.length ? sentences : (transcript && transcript.sentences));
  const broll = settings && isPlain(settings.broll) ? settings.broll : {};
  const enabled = broll.enabled !== false;
  const allowImages = broll.allowImages !== false;
  const useContent = isPlain(content) && Array.isArray(content.visualSupport);
  const high = cfg.rhythmHigh;

  const fillers = fillerSeconds(words, sents);
  const timing = new Map();
  let acc = 0;
  for (const s of sents) {
    const dur = Math.max(0, s.end - s.start - (fillers.get(s.id) || 0));
    timing.set(s.id, { outStart: acc, outEnd: acc + dur, dur });
    acc += dur + Math.min(s.pauseAfter, cfg.slots.keepGapSec);
  }
  const outputDurationSec = num(output && output.durationSec) > 0 ? num(output.durationSec) : round(acc, 3);
  const cap = capFor(outputDurationSec, cfg);
  const base = {
    schemaVersion: 1, source: useContent ? "content" : "heuristic", lang: code, enabled, outputDurationSec, cap,
    hookGuardSec: high.hookGuardSec, needMin: cfg.slots.needMin,
  };
  if (!enabled) return { ...base, slots: [], excluded: sents.map((s) => ({ sentenceId: s.id, reason: "disabled" })) };

  const ids = new Set(sents.map((s) => s.id));
  const need = new Map();
  const nouns = new Map();
  const avoid = new Map();
  const faceRequired = new Set();
  const cta = new Set();
  const importance = new Map();
  const keywords = new Map();

  if (useContent) {
    for (const v of content.visualSupport) {
      if (!isPlain(v) || !ids.has(String(v.sentenceId))) continue;
      const sid = String(v.sentenceId);
      const n = clamp01(num(v.need) || 0);
      if (need.has(sid) && need.get(sid) >= n) continue;
      need.set(sid, n);
      nouns.set(sid, (Array.isArray(v.visualNouns) ? v.visualNouns : []).filter((x) => typeof x === "string").slice(0, 4));
      avoid.set(sid, (Array.isArray(v.avoid) ? v.avoid : []).filter((x) => typeof x === "string").map((x) => x.slice(0, 60)).slice(0, 4));
    }
    for (const f of Array.isArray(content.faceRequired) ? content.faceRequired : []) if (isPlain(f)) faceRequired.add(String(f.sentenceId));
    if (isPlain(content.cta) && Array.isArray(content.cta.sentenceIds)) for (const sid of content.cta.sentenceIds) cta.add(String(sid));
    for (const seg of Array.isArray(content.segments) ? content.segments : []) {
      if (!isPlain(seg) || !Array.isArray(seg.sentenceIds)) continue;
      const imp = clamp01(num(seg.importance) != null ? num(seg.importance) : cfg.slots.defaultImportance);
      for (const sid of seg.sentenceIds) {
        const k = String(sid);
        if (seg.type === "CTA") cta.add(k);
        importance.set(k, Math.max(importance.get(k) || 0, imp));
      }
    }
    for (const kw of Array.isArray(content.keywords) ? content.keywords : []) {
      if (!isPlain(kw) || typeof kw.term !== "string" || !Array.isArray(kw.sentenceIds)) continue;
      for (const sid of kw.sentenceIds) { const k = String(sid); keywords.set(k, [...(keywords.get(k) || []), kw.term]); }
    }
  } else {
    const sal = heuristicSalience(sents, code);
    // Transcript-language terms: searchable only where the providers localize the query (or it is English).
    const searchable = (x) => (LOCALIZED_SEARCH.has(code) ? (code !== "en" || !hasNonLatinLetters(x)) : !hasNonLatinLetters(x));
    for (const s of sents) {
      const h = sal.get(s.id);
      need.set(s.id, h ? h.salience : 0);
      nouns.set(s.id, h ? [...h.bigrams.slice(0, 1), ...h.terms.slice(0, 3)].filter(searchable) : []);
      importance.set(s.id, clamp01(timing.get(s.id).dur / 2.5));
      const toks = lexicon.tokenize(s.text, code);
      const fp = toks.filter((t) => lexicon.isFirstPerson(t.norm, code) || lexicon.isEmotional(t.norm, code)).length;
      if (toks.length && fp / toks.length >= cfg.slots.heuristicFaceRatio) faceRequired.add(s.id);
    }
    for (const s of sents.slice(-2)) if (lexicon.ctaMatch(s.text, code)) cta.add(s.id);
  }
  for (const c of transcript && Array.isArray(transcript.ctaCandidates) ? transcript.ctaCandidates : []) {
    if (isPlain(c) && c.sentenceId != null) cta.add(String(c.sentenceId));
  }

  const excluded = [];
  const eligible = [];
  for (const s of sents) {
    const n = need.get(s.id) || 0;
    const t = timing.get(s.id);
    let reason = null;
    if (n < cfg.slots.needMin - 1e-9) reason = "low_need";
    else if (faceRequired.has(s.id)) reason = "face_required";
    else if (cta.has(s.id)) reason = "cta";
    else if (t.outEnd - Math.max(t.outStart, high.hookGuardSec) < high.minItemSec - 1e-9) reason = "hook_guard";
    else if (screenContentShare(faces, s) >= cfg.slots.screenContentRatio) reason = "screen_content";
    let queries = [];
    if (!reason) {
      // Visual nouns only — never content keywords (abstract, transcript language).
      for (const src of nouns.get(s.id) || []) {
        const q = cleanQuery(src, { whitelist, lang: code });
        if (q && !queries.includes(q)) queries.push(q);
        if (queries.length >= cfg.slots.maxQueries) break;
      }
      if (queries.length && queries.length < 2) {
        for (const q of [...queries]) {
          const broad = headQuery(q);
          if (broad && !queries.includes(broad) && queries.length < cfg.slots.maxQueries) queries.push(broad);
        }
      }
      if (!queries.length) reason = "no_query";
    }
    const slotId = safeSlotId(`sl_${s.id}`);
    if (!reason && !slotId) reason = "no_query";
    if (reason) { excluded.push({ sentenceId: s.id, reason }); continue; }
    const imp = importance.has(s.id) ? importance.get(s.id) : cfg.slots.defaultImportance;
    const kw = [...new Set((keywords.get(s.id) || []).map((x) => String(x).slice(0, 40)))].slice(0, 8);
    eligible.push({
      slotId, sentenceId: s.id, w0: s.w0, w1: s.w1, start: s.start, end: s.end,
      outStart: round(t.outStart, 3), outEnd: round(t.outEnd, 3), outDurEstimate: round(t.dur, 3),
      clipNeedSec: round(clamp(t.dur, high.minItemSec, high.maxItemSec), 3),
      queries, queryBudget: queries.length, queryLang: useContent ? "en" : code,
      visualNouns: (nouns.get(s.id) || []).map((x) => String(x).slice(0, 60)).slice(0, 4),
      mediaPreference: allowImages && [...(nouns.get(s.id) || []), ...queries].some((x) => IMAGE_FRIENDLY.test(x)) ? "either" : "video",
      need: round(n), importance: round(imp), priority: round(n * imp),
      rank: 0, text: s.text.slice(0, 300), keywords: kw, avoid: avoid.get(s.id) || [],
    });
  }
  eligible.sort((a, b) => (b.priority - a.priority) || (a.start - b.start));
  const slots = eligible.slice(0, cap);
  for (const extra of eligible.slice(cap)) excluded.push({ sentenceId: extra.sentenceId, reason: "cap" });
  // Query budget by rank: the top half of the slot set can use every query; the rest of the HIGH budget two;
  // the +30 % headroom slots (only ever used when better ones fail) one. Stock quota is shared server-wide.
  const topHalf = Math.ceil(cap * 0.5);
  const highBudget = Math.max(topHalf, Math.ceil(cap / Math.max(1, cfg.slots.headroom)));
  slots.forEach((s, i) => {
    s.rank = i;
    const budget = i < topHalf ? cfg.slots.maxQueries : (i < highBudget ? 2 : 1);
    s.queryBudget = Math.max(1, Math.min(s.queries.length, budget));
  });
  return { ...base, slots, excluded };
}

module.exports = { buildSlots, capFor, cleanQuery, heuristicSalience, SLOTS_REL };
