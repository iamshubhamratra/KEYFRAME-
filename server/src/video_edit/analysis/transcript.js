// VIDEO EDIT TRANSCRIPT STRUCTURING — sentences, fillers, repeats, false starts, retakes, CTAs (ANALYSIS.md §5).
//
// WHY THIS EXISTS. Word-level STT gives a flat list of timed words. The edit needs structure: captions
// and the content model work on SENTENCES; the cut engine needs CANDIDATES (pure fillers removed at
// removeFillers:'light', discourse fillers only at 'aggressive' after the content verdict, stutters,
// false starts and retakes) with exact word ranges; the heuristic director needs CTA sentences. This is
// pure and deterministic so a re-run on the same words produces byte-identical output (checkpoints and
// plan resolution depend on it). Language-specific vocabulary lives in lexicon/<lang>.js; this module
// holds only the rules:
//   sentences: split at . ? ! 。 ？ ！ । ؟ (not ellipses / abbreviations), at pauses ≥ 0.7 s once ≥ 4 words, at a 25-word
//     cap (best comma / pause in words 16–25); sentences < 3 words merge into the nearer neighbour unless isolated by ≥ 0.5 s
//   pure fillers: lexicon match with elongation collapse (umm, uhhh, ummmm…); pause-bounded ones need ≥ 0.12 s on both sides
//   discourse fillers: candidates only when a ≥ 0.12 s pause touches them, or sentence-initial followed by a comma
//   stutter: immediate repeat of an n-gram (n ≤ 4, pure fillers skipped) within 1.5 s → REPEAT (cut first copy)
//   false start: ≤ 7-word fragment without terminal punctuation, pause ≥ 0.3 s, ≥ 60 % token LCS with what follows → FALSE_START
//   retake: Jaccard ≥ 0.6 or LCS ≥ 0.7 between sentences within 20 s → RETAKE keeping higher conf, then fewer fillers, then later
//
// CONTRACT (pure):
//   structureTranscript({ words, language='en' }) -> { words, transcript, discoveries:{ fillersFound } }
//     words[i] = { ...input, i, text, norm, start, end, conf, sentenceId, segmentId:null, isFiller, fillerKind, repeatOf, speaker:'S1' }
//     transcript = { schemaVersion, language, sentences:[{id, w0, w1, start, end, text, pauseAfter, fillerCount}],
//                    fillerCandidates:[{i, w0, w1, text, kind}], repeatCandidates:[{kind:'REPEAT'|'FALSE_START', w0, w1, keptW0}],
//                    retakeCandidates:[{kind:'RETAKE', a, b, keep, w0, w1, keptW0, jaccard, lcs}], ctaCandidates:[{sentenceId, pattern}],
//                    longPauses:[{afterWord, start, end, dur}] }
//   getLexicon(lang) · normalizeToken(text, lang) · collapseElongation(norm) · isPureFiller(norm, lex)
//   lcsLength(a, b) · isTerminal(text, lang) · matchCta(text, lang) -> patternId | null
//   TRANSCRIPT_REL · RULES

const LEXICON_LANGS = ["en", "es", "fr", "de", "pt", "hi", "ar", "ja"];
const TRANSCRIPT_REL = "analysis/transcript.json";
const WORDS_REL = "analysis/transcript.words.json";

const RULES = Object.freeze({
  sentencePauseSec: 0.7, sentenceMinWordsForPause: 4, sentenceCap: 25, shortSentenceWords: 3, isolatePauseSec: 0.5,
  fillerPauseSec: 0.12, stutterMaxN: 4, stutterWithinSec: 1.5, falseStartMaxWords: 7, falseStartPauseSec: 0.3,
  falseStartLcs: 0.6, retakeJaccard: 0.6, retakeLcs: 0.7, retakeWithinSec: 20, longPauseSec: 0.7, maxRetakes: 50,
});

const r3 = (x) => Math.round(x * 1000) / 1000;
const baseLang = (lang) => String(lang || "en").toLowerCase().split(/[-_]/)[0];

// ---------------------------------------------------------------- lexicon
const compiled = new Map();
function getLexicon(lang) {
  const code = LEXICON_LANGS.includes(baseLang(lang)) ? baseLang(lang) : "en";
  if (compiled.has(code)) return compiled.get(code);
  const raw = require(`./lexicon/${code}`);
  const norm = (s) => normalizeToken(s, code);
  const pureSet = new Set(raw.pureFillers.map(norm));
  const pureCollapsed = new Map();
  for (const f of pureSet) {
    const c = collapseElongation(f);
    pureCollapsed.set(c, Math.min(pureCollapsed.has(c) ? pureCollapsed.get(c) : Infinity, f.length));
  }
  const lex = {
    ...raw, code,
    joiner: typeof raw.joiner === "string" ? raw.joiner : " ",
    pureSet, pureCollapsed,
    pauseBoundedSet: new Set((raw.pauseBoundedFillers || []).map(norm)),
    discourse: (raw.discourseFillers || []).map((d) => String(d).split(/\s+/).map(norm).filter(Boolean)).filter((a) => a.length)
      .sort((a, b) => b.length - a.length),
    allowedRepeats: new Set((raw.allowedRepeats || []).map(norm)),
    abbreviations: new Set((raw.abbreviations || []).map((a) => norm(a).replace(/\.$/, ""))),
  };
  compiled.set(code, lex);
  return lex;
}

// ---------------------------------------------------------------- normalization
function normalizeToken(text, lang = "en") {
  let s = String(text == null ? "" : text).normalize("NFKC").toLowerCase().replace(/[’‘`´]/g, "'");
  if (baseLang(lang) === "ar" || /[؀-ۿ]/.test(s)) {
    s = s.replace(/[ً-ٰٟـ]/g, "").replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه");
  }
  s = s.replace(/^[\p{P}\p{S}\s]+|[\p{P}\p{S}\s]+$/gu, "");
  s = s.replace(/(?<![\p{L}\p{N}\p{M}])['.\-]|['.\-](?![\p{L}\p{N}\p{M}])/gu, "");
  return s.replace(/[^\p{L}\p{N}\p{M}'.\-]/gu, "");
}

function collapseElongation(norm) {
  return String(norm || "")
    .replace(/(\p{L})(?:्\1)+/gu, "$1")
    .replace(/(\p{L})\1+/gu, "$1")
    .replace(/ー+/g, "ー");
}

function isPureFiller(norm, lex) {
  if (!norm) return false;
  if (lex.pureSet.has(norm)) return true;
  const c = collapseElongation(norm);
  return lex.pureCollapsed.has(c) && norm.length >= lex.pureCollapsed.get(c);
}

const TERMINAL_RE = /[.?!。？！।؟]["'”’)\]]*$/u;
const ELLIPSIS_RE = /(\.\.\.|…)["'”’)\]]*$/u;

function isTerminal(text, lang = "en", lex = getLexicon(lang)) {
  const t = String(text || "").trim();
  if (!TERMINAL_RE.test(t) || ELLIPSIS_RE.test(t)) return false;
  if (/\.["'”’)\]]*$/.test(t)) {
    const core = normalizeToken(t, lang).replace(/\.$/, "");
    if (lex.abbreviations.has(core)) return false;
    if (lex.script === "latin" && /^\p{Lu}$/u.test(t.replace(/\.$/, ""))) return false;   // an initial: "J."
  }
  return true;
}

function lcsLength(a, b) {
  if (!a.length || !b.length) return 0;
  let prev = new Uint16Array(b.length + 1);
  let cur = new Uint16Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    [prev, cur] = [cur, prev];
  }
  return prev[b.length];
}

function matchCta(text, lang = "en") {
  const lex = getLexicon(lang);
  for (const p of lex.ctaPatterns || []) if (p.re.test(text)) return p.id;
  if (lex.code !== "en" && /[a-z]/.test(text)) {
    for (const p of getLexicon("en").ctaPatterns) if (p.re.test(text)) return p.id;
  }
  return null;
}

// ---------------------------------------------------------------- sentences
function splitSentences(words, gapAfter, lang, lex) {
  const R = RULES;
  const groups = [];
  let cur = [];
  const close = () => { if (cur.length) groups.push(cur); cur = []; };
  for (let k = 0; k < words.length; k++) {
    cur.push(k);
    if (isTerminal(words[k].text, lang, lex)) { close(); continue; }
    if (cur.length >= R.sentenceMinWordsForPause && gapAfter[k] >= R.sentencePauseSec - 1e-9) { close(); continue; }
    if (cur.length >= R.sentenceCap) {
      let cutAt = cur.length - 1;
      let best = -1;
      for (let p = 15; p < cur.length - 1; p++) {
        const w = cur[p];
        const comma = /[,;:，、،]["'”’)\]]*$/u.test(String(words[w].text || ""));
        const score = (comma ? 1 : 0) + gapAfter[w];
        if ((comma || gapAfter[w] >= 0.25) && score > best) { best = score; cutAt = p; }
      }
      const rest = cur.slice(cutAt + 1);
      cur = cur.slice(0, cutAt + 1);
      close();
      cur = rest;
    }
  }
  close();

  // merge short sentences into the nearer neighbour unless isolated by pauses
  let sentences = groups.map((g) => ({ w0: g[0], w1: g[g.length - 1] }));
  const len = (s) => s.w1 - s.w0 + 1;
  for (let guard = 0; guard < 10000; guard++) {
    const idx = sentences.findIndex((s, k) => {
      if (len(s) >= R.shortSentenceWords || sentences.length === 1) return false;
      const before = k === 0 ? Infinity : words[s.w0].start - words[sentences[k - 1].w1].end;
      const after = k === sentences.length - 1 ? Infinity : words[sentences[k + 1].w0].start - words[s.w1].end;
      return !(before >= R.isolatePauseSec - 1e-9 && after >= R.isolatePauseSec - 1e-9);
    });
    if (idx < 0) break;
    const s = sentences[idx];
    const before = idx === 0 ? Infinity : words[s.w0].start - words[sentences[idx - 1].w1].end;
    const after = idx === sentences.length - 1 ? Infinity : words[sentences[idx + 1].w0].start - words[s.w1].end;
    if (before < after) {
      sentences[idx - 1] = { w0: sentences[idx - 1].w0, w1: s.w1 };
      sentences.splice(idx, 1);
    } else {
      sentences[idx + 1] = { w0: s.w0, w1: sentences[idx + 1].w1 };
      sentences.splice(idx, 1);
    }
  }
  return sentences;
}

// ---------------------------------------------------------------- main
function structureTranscript({ words: input = [], language = "en" } = {}) {
  const lang = baseLang(language);
  const lex = getLexicon(lang);
  const R = RULES;
  const words = (Array.isArray(input) ? input : [])
    .filter((w) => w && Number.isFinite(Number(w.start)) && Number.isFinite(Number(w.end)))
    .map((w, i) => ({
      ...w, i, text: String(w.text != null ? w.text : w.w || ""), start: Number(w.start), end: Number(w.end),
      conf: Number.isFinite(w.conf) ? w.conf : 0.95,
      norm: typeof w.norm === "string" && w.norm ? w.norm : normalizeToken(w.text != null ? w.text : w.w, lang),
      sentenceId: null, segmentId: null, isFiller: false, fillerKind: null, repeatOf: null, speaker: w.speaker || "S1",
    }));
  const n = words.length;
  const m = words.map((w) => normalizeToken(w.text, lang));
  const gapAfter = words.map((w, k) => (k + 1 < n ? Math.max(0, words[k + 1].start - w.end) : Infinity));
  const gapBefore = words.map((w, k) => (k > 0 ? Math.max(0, w.start - words[k - 1].end) : Infinity));

  // sentences
  const spans = n ? splitSentences(words, gapAfter, lang, lex) : [];
  const sentenceOf = new Int32Array(n);
  spans.forEach((s, k) => { for (let i = s.w0; i <= s.w1; i++) sentenceOf[i] = k; });
  const sentenceInitial = (k) => spans[sentenceOf[k]].w0 === k;

  // fillers
  const fillerCandidates = [];
  for (let k = 0; k < n; k++) {
    const pure = isPureFiller(m[k], lex)
      || (lex.pauseBoundedSet.has(m[k]) && gapBefore[k] >= R.fillerPauseSec - 1e-9 && gapAfter[k] >= R.fillerPauseSec - 1e-9);
    if (pure) { words[k].isFiller = true; words[k].fillerKind = "pure"; fillerCandidates.push({ i: k, w0: k, w1: k, text: words[k].text, kind: "pure" }); }
  }
  for (let k = 0; k < n; k++) {
    if (words[k].isFiller) continue;
    for (const entry of lex.discourse) {
      const L = entry.length;
      if (k + L > n) continue;
      let ok = true;
      for (let j = 0; j < L; j++) if (m[k + j] !== entry[j] || words[k + j].isFiller || (j > 0 && sentenceOf[k + j] !== sentenceOf[k])) { ok = false; break; }
      if (!ok) continue;
      const last = k + L - 1;
      // A sentence-initial word always follows the sentence-boundary gap, so only a pause (or comma) AFTER it counts.
      const pauseAfter = gapAfter[last] >= R.fillerPauseSec - 1e-9;
      const touches = sentenceInitial(k)
        ? pauseAfter || /[,，、،]["'”’)\]]*$/u.test(words[last].text)
        : gapBefore[k] >= R.fillerPauseSec - 1e-9 || pauseAfter;
      if (!touches) continue;
      for (let j = k; j <= last; j++) { words[j].isFiller = true; words[j].fillerKind = "discourse"; }
      fillerCandidates.push({ i: k, w0: k, w1: last, text: words.slice(k, last + 1).map((w) => w.text).join(lex.joiner), kind: "discourse" });
      k = last;
      break;
    }
  }
  fillerCandidates.sort((a, b) => a.i - b.i);
  const pureFiller = (k) => words[k].fillerKind === "pure";

  // false starts
  const repeatCandidates = [];
  const covered = new Uint8Array(n);
  for (let k = 0; k + 1 < n; k++) {
    if (gapAfter[k] < R.falseStartPauseSec - 1e-9 || isTerminal(words[k].text, lang, lex) || covered[k]) continue;
    const S = spans[sentenceOf[k]];
    let f0 = S.w0;
    for (let j = k - 1; j >= S.w0; j--) {
      if (gapAfter[j] >= R.falseStartPauseSec - 1e-9 || isTerminal(words[j].text, lang, lex)) { f0 = j + 1; break; }
    }
    const frag = [];
    for (let j = f0; j <= k; j++) if (!pureFiller(j)) frag.push(m[j]);
    if (frag.length < 2 || frag.length > R.falseStartMaxWords) continue;
    const nextSentence = spans[sentenceOf[k + 1]];
    const nextEnd = sentenceOf[k + 1] === sentenceOf[k] ? S.w1 : nextSentence.w1;
    const next = [];
    for (let j = k + 1; j <= nextEnd && next.length < 2 * frag.length + 2; j++) if (!pureFiller(j)) next.push(m[j]);
    if (next.length < 2) continue;
    if (lcsLength(frag, next) / frag.length < R.falseStartLcs - 1e-9) continue;
    repeatCandidates.push({ kind: "FALSE_START", w0: f0, w1: k, keptW0: k + 1 });
    for (let j = f0; j <= k; j++) covered[j] = 1;
  }

  // stutters
  const seq = [];
  for (let k = 0; k < n; k++) if (!pureFiller(k) && m[k]) seq.push(k);
  for (let p = 0; p < seq.length; p++) {
    if (covered[seq[p]]) continue;
    for (let len = Math.min(R.stutterMaxN, Math.floor((seq.length - p) / 2)); len >= 1; len--) {
      const first = seq.slice(p, p + len), second = seq.slice(p + len, p + 2 * len);
      if (first.some((k) => covered[k])) continue;
      if (!first.every((k, j) => m[k] === m[second[j]])) continue;
      if (len === 1 && lex.allowedRepeats.has(m[first[0]])) continue;
      if (isTerminal(words[first[len - 1]].text, lang, lex)) continue;
      if (words[second[0]].start - words[first[len - 1]].end > R.stutterWithinSec + 1e-9) continue;
      repeatCandidates.push({ kind: "REPEAT", w0: first[0], w1: first[len - 1], keptW0: second[0] });
      first.forEach((k, j) => { words[k].repeatOf = second[j]; covered[k] = 1; });
      p += len - 1;
      break;
    }
  }
  repeatCandidates.sort((a, b) => a.w0 - b.w0);

  // sentence records
  const sentences = spans.map((s, k) => {
    const id = `s${k + 1}`;
    for (let i = s.w0; i <= s.w1; i++) words[i].sentenceId = id;
    let fillerCount = 0;
    for (let i = s.w0; i <= s.w1; i++) if (words[i].isFiller) fillerCount++;
    const next = spans[k + 1];
    return {
      id, w0: s.w0, w1: s.w1, start: r3(words[s.w0].start), end: r3(words[s.w1].end),
      text: words.slice(s.w0, s.w1 + 1).map((w) => w.text).join(lex.joiner).trim(),
      pauseAfter: next ? r3(Math.max(0, words[next.w0].start - words[s.w1].end)) : 0,
      fillerCount,
    };
  });

  // retakes
  const retakeCandidates = [];
  const tokensOf = (s) => { const t = []; for (let i = s.w0; i <= s.w1; i++) if (!words[i].isFiller && m[i]) t.push(m[i]); return t; };
  const meanConf = (s) => { let a = 0; for (let i = s.w0; i <= s.w1; i++) a += words[i].conf; return a / (s.w1 - s.w0 + 1); };
  const fullyCovered = (s) => { for (let i = s.w0; i <= s.w1; i++) if (!covered[i] && !words[i].isFiller) return false; return true; };
  for (let a = 0; a < sentences.length && retakeCandidates.length < R.maxRetakes; a++) {
    const A = sentences[a], ta = tokensOf(A);
    if (ta.length < 3 || fullyCovered(A)) continue;
    for (let b = a + 1; b < sentences.length && retakeCandidates.length < R.maxRetakes; b++) {
      const B = sentences[b];
      if (B.start - A.end > R.retakeWithinSec + 1e-9) break;
      const tb = tokensOf(B);
      if (tb.length < 3 || fullyCovered(B)) continue;
      const sa = new Set(ta), sb = new Set(tb);
      let inter = 0;
      for (const x of sa) if (sb.has(x)) inter++;
      const jaccard = inter / (sa.size + sb.size - inter);
      const lcs = lcsLength(ta, tb) / Math.max(ta.length, tb.length);
      if (jaccard < R.retakeJaccard - 1e-9 && lcs < R.retakeLcs - 1e-9) continue;
      const ca = meanConf(A), cb = meanConf(B);
      let keepB;
      if (Math.abs(ca - cb) > 0.02) keepB = cb > ca;
      else if (A.fillerCount !== B.fillerCount) keepB = B.fillerCount < A.fillerCount;
      else keepB = true;
      const cut = keepB ? A : B, kept = keepB ? B : A;
      // keep is 'a' | 'b' — the same vocabulary as ve_content retakeVerdicts and director/build_plan.js
      retakeCandidates.push({
        kind: "RETAKE", a: A.id, b: B.id, keep: keepB ? "b" : "a", keepSentenceId: kept.id, w0: cut.w0, w1: cut.w1, keptW0: kept.w0,
        jaccard: Math.round(jaccard * 1000) / 1000, lcs: Math.round(lcs * 1000) / 1000,
      });
    }
  }

  // CTAs
  const ctaCandidates = [];
  for (const s of sentences) {
    const text = m.slice(s.w0, s.w1 + 1).filter(Boolean).join(lex.joiner);
    const pattern = matchCta(text, lang);
    if (pattern) ctaCandidates.push({ sentenceId: s.id, pattern });
  }

  const longPauses = [];
  for (let k = 0; k + 1 < n; k++) {
    if (gapAfter[k] >= R.longPauseSec - 1e-9) longPauses.push({ afterWord: k, start: r3(words[k].end), end: r3(words[k + 1].start), dur: r3(gapAfter[k]) });
  }

  return {
    words,
    transcript: { schemaVersion: 1, language: lang, sentences, fillerCandidates, repeatCandidates, retakeCandidates, ctaCandidates, longPauses },
    discoveries: { fillersFound: fillerCandidates.filter((f) => f.kind === "pure").length },
  };
}

// ---------------------------------------------------------------- stage I/O
// Reads analysis/transcript.words.json (TRANSCRIBING output) unless `words` is given, structures it, and writes
// analysis/transcript.json = transcript + { timing, words } (structured words carry sentenceId / isFiller / fillerKind / repeatOf,
// and build_plan reads `timing` to widen padding for approx timing).
function analyzeTranscript({ projectDir, wordsRel = WORDS_REL, words = null, language = null, write = true } = {}) {
  const fs = require("node:fs");
  const path = require("node:path");
  const fsx = require("../fsx");
  const { EditError } = require("../errors");
  let doc = null;
  if (!Array.isArray(words)) {
    try {
      doc = JSON.parse(fs.readFileSync(fsx.resolveInside(projectDir, wordsRel), "utf8"));
    } catch (e) {
      throw new EditError("TRANSCRIPT_WORDS_MISSING", { status: 409, errorClass: "resource", retryable: true, stage: "TRANSCRIBING", detail: e && e.code ? String(e.code) : "unreadable" });
    }
  }
  const src = Array.isArray(words) ? words : doc && Array.isArray(doc.words) ? doc.words : [];
  const r = structureTranscript({ words: src, language: language || (doc && doc.language) || "en" });
  const body = { ...r.transcript, timing: (doc && doc.timing) || null, words: r.words };
  if (write) {
    const abs = fsx.resolveInside(projectDir, TRANSCRIPT_REL);
    fsx.ensureDir(path.dirname(abs));
    fsx.writeJsonAtomic(abs, body);
  }
  return { words: r.words, transcript: body, discoveries: r.discoveries, outputs: { transcript: { path: TRANSCRIPT_REL } } };
}

module.exports = {
  analyzeTranscript, WORDS_REL,
  structureTranscript, splitSentences, getLexicon, normalizeToken, collapseElongation, isPureFiller, isTerminal, lcsLength, matchCta,
  TRANSCRIPT_REL, RULES, LEXICON_LANGS,
};
