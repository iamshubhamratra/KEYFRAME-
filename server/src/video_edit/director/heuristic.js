// VIDEO EDIT HEURISTIC DIRECTOR — editorial opportunities without an LLM (EDIT_PLAN.md §6 "Heuristic director").
//
// WHY THIS EXISTS. The edit must never depend on a model being up: when ve_director (or ve_content)
// fails, is over budget or returns garbage twice, the user still gets captions, silence/filler cuts and
// a restrained, correct edit (ARCHITECTURE.md: "Guarantees an edit with captions + silence/filler cuts
// even when every LLM is down"). The fallback must also be SAFE rather than clever — it may miss good
// B-roll, but it must never cover a personal sentence or the call-to-action, so its protections are the
// same lexical rules the rhythm engine enforces. It produces the exact Opportunities shape the LLM
// director produces, so the rhythm engine, plan.opportunities and re-plans cannot tell them apart.
//
// Rules (EDIT_PLAN.md §6): hook = sentences starting in the first 4 s (strength 0.6 when the first has a
// question, number or superlative, else 0.4); CTA = the last ≤ 2 sentences matching lexicon CTA patterns;
// faceRequired when the first-person/emotional token ratio ≥ 0.3 or CTA (fillers and stutters excluded);
// B-roll on sentences with ≥ 1 TF-IDF-salient noun-like token (priority = salience · min(1, outDur/2.5);
// queries = top bigram/unigrams through query_terms.subjectQuery (+ acronym whitelist) and a category
// context from asset_taxonomy.classify; FULL, PIP when faceVisiblePct < 0.3); punch-ins on emphasis
// words (key/secret/important), superlatives, "!" and numbers; STAT on number + unit; music energetic when
// words/s > 3 or > 10 % of sentences carry "!", else calm (query `<mood> background`). Stock search is English-
// only, so for hi / ar / ja B-roll queries come from the content analysis' English visualNouns (≥ 2 needed) and a
// sentence without them gets no B-roll opportunity; whoosh SFX only
// on FULL B-roll entries. When a content analysis is supplied (ve_content succeeded, the director did
// not), its hook / CTA / faceRequired / emphasis are used instead of the lexical guesses.
//
// CONTRACT (pure, deterministic):
//   heuristicOpportunities({ content|null, sentences, words, faces, settings, lang }) -> Opportunities (source 'heuristic')
//   deterministicContent({ sentences, words, faces, lang }) -> ANALYSIS.md §7 content shape + { deterministic:true }
//   analyzeSentences({ sentences, words, lang }) -> [{ id, s, toks:[{ i, text, norm, stem, noun, weight }], ratio, salience, salient }]
//   deriveAnalysis({ content, sentences, words, profiles, lang }) -> { hookIds, hookStrength, ctaIds, ctaText, faceRequired:Map, emphasis:Set }
//   categoryFor(text) -> asset_taxonomy category, only when one of its match terms occurs as a whole word
//   faceVisiblePct(faces, sentence) -> 0..1 · HEURISTIC_RULES
//   sentences: [{ id, w0, w1, start, end, text, pauseAfter?, outDur?, faceVisiblePct? }] · words: [{ i, text, start, end, isFiller? }]

const { EditError } = require("../errors");
const { classify, CATEGORIES } = require("../../services/asset_taxonomy");
const L = require("./lexicon");
const O = require("./opportunities");

const HEURISTIC_RULES = Object.freeze({
  hookWindowSec: 4, hookStrong: 0.6, hookWeak: 0.4, ctaLastSentences: 2, faceRatio: 0.3,
  salientWeight: 0.5, noisyOr: 0.6, brollDurRefSec: 2.5, pipFaceVisible: 0.3,
  punch: Object.freeze({ emphasis: 0.75, superlative: 0.65, exclaim: 0.6, number: 0.55, contentBoost: 0.15 }),
  stat: 0.5, statHookBoost: 0.1,
  music: Object.freeze({ energeticWps: 3, exclaimDensity: 0.1, energetic: 0.75, calm: 0.35 }),
  whooshFactor: 0.8, segmentPauseSec: 1.0, segmentMaxSentences: 4,
});

const CATEGORY_CONTEXT = Object.freeze({
  saas: "software", ai: "technology", fintech: "finance", healthcare: "clinic", ecommerce: "shopping", education: "classroom",
  technology: "technology", corporate: "office", startup: "startup", marketing: "marketing",
});

const r3 = (x) => Math.round(x * 1000) / 1000;
const clamp01 = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : d; };

function invalid(detail) {
  return new EditError("INVALID_DIRECTOR_INPUT", { status: 422, errorClass: "input", detail });
}

function assertInputs(sentences, words) {
  if (!Array.isArray(sentences) || !Array.isArray(words)) throw invalid("sentences and words arrays are required");
  const seen = new Set();
  for (const s of sentences) {
    if (!s || typeof s.id !== "string" || seen.has(s.id)) throw invalid("every sentence needs a unique string id");
    seen.add(s.id);
    if (!Number.isInteger(s.w0) || !Number.isInteger(s.w1) || s.w0 < 0 || s.w1 < s.w0 || s.w1 >= words.length) throw invalid(`sentence ${s.id} has an invalid word range`);
    if (!Number.isFinite(s.start) || !Number.isFinite(s.end)) throw invalid(`sentence ${s.id} needs start/end`);
  }
}

function categoryFor(text) {
  const c = classify({ subject: String(text || "") });
  if (!c || c === "generic" || !CATEGORIES[c]) return "generic";
  const flat = (t) => String(t).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const hay = ` ${flat(text)} `;
  return CATEGORIES[c].match.some((m) => hay.includes(` ${flat(m)} `)) ? c : "generic";
}

function faceVisiblePct(faces, s) {
  if (!faces || faces.mode === "assumed" || !Array.isArray(faces.keyframes) || !faces.keyframes.length) return 1;
  const dur = Math.max(1e-6, s.end - s.start);
  let absent = 0;
  for (const r of faces.absent || []) absent += Math.max(0, Math.min(r.end, s.end) - Math.max(r.start, s.start));
  return r3(Math.max(0, 1 - absent / dur));
}

function variantOf(norm, lang) {
  const code = L.langCode(lang);
  const st = L.stem(norm, code);
  if (st !== norm) return st;
  if (!["en", "es", "pt", "fr"].includes(code) || !/\p{L}$/u.test(norm)) return null;
  return code === "en" && /(?:s|x|z|ch|sh)$/.test(norm) ? `${norm}es` : `${norm}s`;
}

function keptText(s, words, lang) {
  const joiner = L.langCode(lang) === "ja" ? "" : " ";
  return words.slice(s.w0, s.w1 + 1).filter((w) => w && !w.isFiller).map((w) => String(w.text || "").trim()).filter(Boolean).join(joiner);
}

function analyzeSentences({ sentences, words, lang = "en" }) {
  const code = L.langCode(lang);
  const profiles = sentences.map((s) => {
    const toks = [];
    let prevNorm = null;
    for (let i = s.w0; i <= s.w1; i++) {
      const w = words[i];
      const norm = w ? L.normWord(w.text) : "";
      if (!norm || w.isFiller === true) continue;
      if (norm === prevNorm) continue;                                   // stutter ("I, I")
      prevNorm = norm;
      toks.push({ i, text: w.text, norm, stem: L.stem(norm, code), noun: L.isNounLike(norm, code), weight: 0 });
    }
    const personal = toks.filter((t) => L.isFirstPerson(t.norm, code) || L.isEmotional(t.norm, code)).length;
    return { id: s.id, s, toks, ratio: toks.length ? r3(personal / toks.length) : 0, salience: 0, salient: [] };
  });
  const df = new Map();
  for (const p of profiles) for (const st of new Set(p.toks.filter((t) => t.noun).map((t) => t.stem))) df.set(st, (df.get(st) || 0) + 1);
  const N = profiles.length;
  for (const p of profiles) {
    const tf = new Map();
    for (const t of p.toks) if (t.noun) tf.set(t.stem, (tf.get(t.stem) || 0) + 1);
    for (const t of p.toks) {
      if (!t.noun) continue;
      const idf = N <= 1 ? 1 : Math.log(N / df.get(t.stem)) / Math.log(N);
      const lenBoost = /\p{Script=Latin}/u.test(t.norm) ? Math.min(1, 0.55 + 0.1 * [...t.norm].length) : 1;
      t.weight = r3(Math.min(1, idf * lenBoost * (1 + 0.25 * (tf.get(t.stem) - 1))));
    }
    const seen = new Set();
    let prod = 1;
    for (const t of p.toks) {
      if (!t.noun || seen.has(t.stem)) continue;
      seen.add(t.stem);
      prod *= 1 - HEURISTIC_RULES.noisyOr * t.weight;
    }
    p.salience = r3(1 - prod);
    p.salient = p.toks.filter((t) => t.noun && t.weight >= HEURISTIC_RULES.salientWeight);
  }
  return profiles;
}

function deriveAnalysis({ content = null, sentences, words, profiles, lang = "en" }) {
  const code = L.langCode(lang);
  const ids = new Set(sentences.map((s) => s.id));
  const keep = (arr) => (Array.isArray(arr) ? arr : []).filter((id) => ids.has(id));
  const c = content && typeof content === "object" ? content : null;
  const out = { hookIds: new Set(), hookStrength: 0, ctaIds: new Set(), ctaText: null, faceRequired: new Map(), emphasis: new Set() };
  if (!sentences.length) return out;

  // hook
  if (c && c.hook && keep(c.hook.sentenceIds).length) {
    keep(c.hook.sentenceIds).forEach((id) => out.hookIds.add(id));
    out.hookStrength = clamp01(c.hook.strength, 0.5);
  } else {
    sentences.filter((s) => s.start < HEURISTIC_RULES.hookWindowSec).forEach((s) => out.hookIds.add(s.id));
    if (!out.hookIds.size) out.hookIds.add(sentences[0].id);
    const first = profiles[0];
    const strong = /[?？؟]/.test(String(sentences[0].text || "")) || first.toks.some((t) => L.numberValue(t.norm, code) != null || L.isSuperlative(t.norm, code));
    out.hookStrength = strong ? HEURISTIC_RULES.hookStrong : HEURISTIC_RULES.hookWeak;
  }

  // CTA
  if (c && Object.prototype.hasOwnProperty.call(c, "cta")) {
    if (c.cta && keep(c.cta.sentenceIds).length) {
      keep(c.cta.sentenceIds).forEach((id) => out.ctaIds.add(id));
      out.ctaText = c.cta.text ? String(c.cta.text) : null;
    }
  } else {
    for (const s of sentences.slice(-HEURISTIC_RULES.ctaLastSentences)) {
      const text = String(s.text || keptText(s, words, code));
      const m = L.ctaMatch(text, code);
      if (!m) continue;
      out.ctaIds.add(s.id);
      out.ctaText = text.slice(m.index);
    }
  }

  // faceRequired
  if (c && Array.isArray(c.faceRequired)) {
    for (const f of c.faceRequired) if (f && ids.has(f.sentenceId)) out.faceRequired.set(f.sentenceId, String(f.reason || "personal"));
  } else {
    for (const p of profiles) if (p.ratio >= HEURISTIC_RULES.faceRatio - 1e-9) out.faceRequired.set(p.id, "personal");
  }
  for (const id of out.ctaIds) if (!out.faceRequired.has(id)) out.faceRequired.set(id, "cta");

  // emphasis words from the content analysis
  if (c && Array.isArray(c.emphasis)) {
    const byId = new Map(sentences.map((s) => [s.id, s]));
    for (const e of c.emphasis) {
      const s = e && byId.get(e.sentenceId);
      const m = s ? L.matchPhrase(words, s.w0, s.w1, e.wordText, code) : null;
      if (m) for (let i = m.w0; i <= m.w1; i++) out.emphasis.add(i);
    }
  }
  return out;
}

function lexicalPunch(p, words, code, emphasis = new Set()) {
  let best = null;
  for (const t of p.toks) {
    let pr = null, why = null;
    if (L.isEmphasisWord(t.norm, code)) { pr = HEURISTIC_RULES.punch.emphasis; why = "emphasis word"; }
    else if (L.isSuperlative(t.norm, code)) { pr = HEURISTIC_RULES.punch.superlative; why = "superlative"; }
    else if (/[!！]["'”’)]*$/u.test(String(words[t.i].text || "").trim())) { pr = HEURISTIC_RULES.punch.exclaim; why = "exclamation"; }
    else if (L.numberValue(t.norm, code) != null) { pr = HEURISTIC_RULES.punch.number; why = "number"; }
    if (pr == null) continue;
    if (emphasis.has(t.i)) pr = Math.min(1, pr + HEURISTIC_RULES.punch.contentBoost);
    if (!best || pr > best.pr + 1e-9) best = { t, pr: r3(pr), why };
  }
  return best;
}

function musicProfile(sentences, words) {
  const speech = sentences.reduce((a, s) => a + Math.max(0, s.end - s.start), 0);
  const wps = speech > 0 ? words.length / speech : 0;
  const exclaim = sentences.length ? sentences.filter((s) => /[!！]/.test(String(s.text || ""))).length / sentences.length : 0;
  const energetic = wps > HEURISTIC_RULES.music.energeticWps || exclaim > HEURISTIC_RULES.music.exclaimDensity;
  return { mood: energetic ? "energetic" : "calm", energy: energetic ? HEURISTIC_RULES.music.energetic : HEURISTIC_RULES.music.calm, wps: r3(wps), exclaim: r3(exclaim) };
}

const LATIN_LANGS = new Set(["en", "es", "fr", "de", "pt"]);

function heuristicOpportunities({ content = null, sentences, words, faces = null, settings = {}, lang = "en" } = {}) {
  assertInputs(sentences, words);
  const code = L.langCode(lang);
  const visualNouns = new Map();
  for (const v of (content && Array.isArray(content.visualSupport) ? content.visualSupport : [])) {
    if (v && typeof v.sentenceId === "string" && Array.isArray(v.visualNouns) && !visualNouns.has(v.sentenceId)) visualNouns.set(v.sentenceId, v.visualNouns);
  }
  const profiles = analyzeSentences({ sentences, words, lang: code });
  const an = deriveAnalysis({ content, sentences, words, profiles, lang: code });
  const context = CATEGORY_CONTEXT[categoryFor(sentences.map((s) => s.text).join(" "))] || null;
  const raw = { brollOpportunities: [], punchIns: [], graphics: [], sfx: [], transitions: [], music: null, hookTitle: null, ctaCard: null };

  for (const p of profiles) {
    const s = p.s;

    // B-roll: salient noun-like tokens, never on personal / CTA sentences
    if (!an.faceRequired.has(s.id) && !an.ctaIds.has(s.id) && p.salient.length) {
      const ranked = p.toks.filter((t) => t.noun && t.weight > 0)
        .sort((a, b) => b.weight - a.weight || [...b.norm].length - [...a.norm].length || a.i - b.i);
      const top = ranked[0];
      const second = ranked.find((t) => t.stem !== top.stem) || null;
      let bigram = null;
      for (let k = 0; k + 1 < p.toks.length; k++) {
        const a = p.toks[k], b = p.toks[k + 1];
        if (!a.noun || !b.noun || b.i !== a.i + 1 || a.stem === b.stem) continue;
        if (a.weight < HEURISTIC_RULES.salientWeight && b.weight < HEURISTIC_RULES.salientWeight) continue;
        if (!bigram || a.weight + b.weight > bigram.score + 1e-9) bigram = { a, b, score: a.weight + b.weight };
      }
      let queries;
      if (LATIN_LANGS.has(code)) {
        const q = [];
        if (bigram) q.push(`${bigram.a.norm} ${bigram.b.norm}`);
        q.push(top.norm);
        if (second) q.push(second.norm);
        if (context) q.push(`${top.norm} ${context}`);
        queries = O.cleanQueries(q, code);
        // one concrete noun only: its singular/plural form is still a literal, searchable alternative
        if (queries.length < 2) queries = O.cleanQueries([...q, variantOf(top.norm, code)], code);
      } else {
        // Stock libraries are searched in English (broll/query_filter keeps ASCII tokens only), so transcript
        // tokens in Devanagari / Arabic / Japanese would find nothing: use the content analysis' English visual
        // nouns for this sentence, or offer no B-roll.
        const nouns = (visualNouns.get(s.id) || []).filter((v) => typeof v === "string" && /^[\x20-\x7E]+$/.test(v));
        queries = O.cleanQueries(nouns, "en");
      }
      if (queries.length >= 2) {
        const outDur = Number.isFinite(s.outDur) ? s.outDur : Math.max(0, s.end - s.start);
        const w0 = Math.min(top.i, second ? second.i : top.i, bigram ? bigram.a.i : top.i);
        const fvp = Number.isFinite(s.faceVisiblePct) ? s.faceVisiblePct : faceVisiblePct(faces, s);
        raw.brollOpportunities.push({
          sentenceId: s.id,
          wordAnchor: { fromText: words[w0].text, toText: words[s.w1].text, w0, w1: s.w1 },
          priority: r3(p.salience * Math.min(1, outDur / HEURISTIC_RULES.brollDurRefSec)),
          layoutPreference: fvp < HEURISTIC_RULES.pipFaceVisible ? "PIP" : "FULL",
          mediaPreference: "video",
          queries,
          reason: `salient nouns: ${ranked.slice(0, 3).map((t) => t.norm).join(", ")}`,
        });
      }
    }

    // punch-in: the strongest lexical emphasis of the sentence
    const punch = lexicalPunch(p, words, code, an.emphasis);
    if (punch) raw.punchIns.push({ sentenceId: s.id, wordText: words[punch.t.i].text, w: punch.t.i, w1: punch.t.i, kind: "PUNCH_IN", priority: punch.pr, reason: punch.why });

    // STAT: number followed by a unit (or a percentage)
    for (let k = 0; k < p.toks.length; k++) {
      const a = p.toks[k];
      const v = L.numberValue(a.norm, code);
      if (v == null) continue;
      const pct = /%$/.test(a.norm);
      const b = p.toks[k + 1];
      if (!pct && !(b && b.i === a.i + 1 && L.isStatUnit(b.norm, code))) continue;
      const value = /^[$€£₹¥]?\d/.test(a.norm) ? a.norm : String(v);
      raw.graphics.push({
        kind: "STAT", sentenceId: s.id, title: pct ? value : `${value} ${b.norm}`, value, w: a.i,
        priority: r3(HEURISTIC_RULES.stat + (an.hookIds.has(s.id) ? HEURISTIC_RULES.statHookBoost : 0)), reason: "number with a unit",
      });
      break;
    }
  }

  const ordered = sentences.slice();
  const hookFirst = ordered.find((s) => an.hookIds.has(s.id));
  if (hookFirst) raw.hookTitle = { text: keptText(hookFirst, words, code), sentenceId: hookFirst.id };
  const ctaLast = ordered.filter((s) => an.ctaIds.has(s.id)).pop();
  if (ctaLast) raw.ctaCard = { text: an.ctaText || keptText(ctaLast, words, code), sentenceId: ctaLast.id };

  const mp = musicProfile(sentences, words);
  raw.music = { include: settings.musicEnabled !== false, mood: mp.mood, query: `${mp.mood} background`, energy: mp.energy, reason: `${mp.wps} words/s` };

  for (const b of raw.brollOpportunities) {
    if (b.layoutPreference !== "FULL") continue;
    raw.sfx.push({ anchor: "broll_in", ref: b.sentenceId, cue: "whoosh", priority: r3(b.priority * HEURISTIC_RULES.whooshFactor), reason: "whoosh on a full-screen B-roll entry" });
  }
  return O.finalizeOpportunities(raw, { sentences, source: "heuristic", lang: code });
}

function deterministicContent({ sentences, words, faces = null, lang = "en" } = {}) {
  assertInputs(sentences, words);
  const code = L.langCode(lang);
  const profiles = analyzeSentences({ sentences, words, lang: code });
  const an = deriveAnalysis({ content: null, sentences, words, profiles, lang: code });
  const category = categoryFor(sentences.map((s) => s.text).join(" "));
  const mp = musicProfile(sentences, words);

  const kw = new Map();
  for (const p of profiles) {
    for (const t of p.salient) {
      const cur = kw.get(t.stem) || { term: t.norm, sentenceIds: [], salience: 0 };
      if (!cur.sentenceIds.includes(p.id)) cur.sentenceIds.push(p.id);
      cur.salience = Math.max(cur.salience, t.weight);
      kw.set(t.stem, cur);
    }
  }
  const keywords = [...kw.values()].sort((a, b) => b.salience - a.salience || (a.term < b.term ? -1 : a.term > b.term ? 1 : 0)).slice(0, 12);

  // segments: leading hook run, trailing CTA run, body grouped at long pauses
  const ids = sentences.map((s) => s.id);
  let h = 0;
  while (h < ids.length && an.hookIds.has(ids[h])) h++;
  let c = ids.length;
  while (c > h && an.ctaIds.has(ids[c - 1])) c--;
  const segments = [];
  const topTerm = (sids) => {
    const k = keywords.find((x) => x.sentenceIds.some((id) => sids.includes(id)));
    return k ? k.term[0].toLocaleUpperCase() + k.term.slice(1) : null;
  };
  if (h > 0) segments.push({ id: `hs${segments.length + 1}`, type: "HOOK", sentenceIds: ids.slice(0, h), title: "Hook", importance: 0.9 });
  let group = [];
  const flush = () => {
    if (!group.length) return;
    segments.push({ id: `hs${segments.length + 1}`, type: "POINT", sentenceIds: group, title: topTerm(group) || `Part ${segments.length + 1}`, importance: 0.6 });
    group = [];
  };
  for (let k = h; k < c; k++) {
    group.push(ids[k]);
    const s = sentences[k];
    if ((Number(s.pauseAfter) || 0) >= HEURISTIC_RULES.segmentPauseSec || group.length >= HEURISTIC_RULES.segmentMaxSentences) flush();
  }
  flush();
  if (c < ids.length) segments.push({ id: `hs${segments.length + 1}`, type: "CTA", sentenceIds: ids.slice(c), title: "Call to action", importance: 0.6 });

  const emphasis = [];
  for (const p of profiles) {
    const punch = lexicalPunch(p, words, code);
    if (punch) emphasis.push({ sentenceId: p.id, wordText: words[punch.t.i].text });
  }

  return {
    deterministic: true,
    summary: "",
    category,
    audience: "",
    tone: { mood: mp.mood, energy: mp.energy, pace: mp.wps > HEURISTIC_RULES.music.energeticWps ? "fast" : "medium" },
    topics: [],
    keywords,
    hook: { sentenceIds: ids.filter((id) => an.hookIds.has(id)), strength: an.hookStrength },
    cta: an.ctaIds.size ? { sentenceIds: ids.filter((id) => an.ctaIds.has(id)), text: an.ctaText || "" } : null,
    segments,
    visualSupport: [],
    faceRequired: ids.filter((id) => an.faceRequired.has(id)).map((id) => ({ sentenceId: id, reason: an.faceRequired.get(id) })),
    emphasis,
    fillerVerdicts: [],
    retakeVerdicts: [],
    music: { mood: mp.mood, energy: mp.energy },
    sfxOpportunities: [],
    faceTrack: faces && faces.mode === "tracked" ? "tracked" : "assumed",
  };
}

module.exports = {
  HEURISTIC_RULES, CATEGORY_CONTEXT,
  heuristicOpportunities, deterministicContent, analyzeSentences, deriveAnalysis, categoryFor, faceVisiblePct, musicProfile,
};
