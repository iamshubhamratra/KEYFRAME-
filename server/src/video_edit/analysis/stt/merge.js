// VIDEO EDIT STT MERGE — per-chunk engine output → one clean word list on the source timeline.
//
// WHY THIS EXISTS. Every downstream consumer (cuts, captions, fillers, QA "cut inside a word") indexes
// words by position and trusts their times. Engines return words relative to their chunk, with
// punctuation sometimes as separate tokens, occasional multi-word tokens, zero-length or overlapping
// spans, and edges that stop short of the audible end of the word (ANALYSIS.md §4.3). Merging once,
// deterministically, means every later stage sees: source-relative seconds, monotonic order, trailing
// punctuation attached to its word, one token per word, ≥ 40 ms per word, edges refined to the RMS
// envelope (plan/timeline.refineWordEdges — the same helper the timeline uses), a per-word conf and
// the chunk/engine that produced it.
//
// CONTRACT (pure):
//   mergeChunks(chunks:[{ index, start, end, engine, model, language, timing, words:[{text,start,end,conf?,isFiller?}] }],
//               { envelope:{rms,hop}?, floorDb?, speechDb?, minWordSec=0.04 })
//     -> { words:[{ text, start, end, conf, chunk, engine, isFiller? }], timing:'word'|'approx', engines:[key], language, languageVotes }
//   finalizeWords(words) -> [{ i, text, norm, start, end, conf, chunk, engine, isFiller? }]  (sorted, re-indexed)
//   normText(text) · attachPunctuation(words) · splitSpaced(words) · enforceMinDuration(words, minSec) · ENGINE_CONF

const timeline = require("../../plan/timeline");

const ENGINE_CONF = Object.freeze({ mai: 0.95, whisper_turbo: 0.95, deepgram: 0.95, kie: 0.95 });
const PUNCT_ONLY_RE = /^[\p{P}\p{S}]+$/u;
const EDGE_SLACK_SEC = 0.25;

const r3 = (x) => Math.round(x * 1000) / 1000;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function normText(text) {
  return String(text == null ? "" : text).normalize("NFKC").toLowerCase().replace(/[\p{P}]+/gu, "").replace(/\s+/g, " ").trim();
}

function attachPunctuation(words) {
  const out = [];
  for (const w of words) {
    if (PUNCT_ONLY_RE.test(w.text)) {
      if (out.length) out[out.length - 1] = { ...out[out.length - 1], text: out[out.length - 1].text + w.text };
      continue;   // leading punctuation with no word before it carries no sound and no meaning
    }
    out.push(w);
  }
  return out;
}

function splitSpaced(words) {
  const out = [];
  for (const w of words) {
    const tokens = w.text.split(/\s+/).filter(Boolean);
    if (tokens.length <= 1) { out.push(tokens.length ? { ...w, text: tokens[0] } : w); continue; }
    const total = tokens.reduce((a, t) => a + Math.max(1, t.length), 0);
    let cursor = w.start;
    const span = Math.max(0, w.end - w.start);
    tokens.forEach((t, k) => {
      const len = (span * Math.max(1, t.length)) / total;
      const end = k === tokens.length - 1 ? w.end : cursor + len;
      out.push({ ...w, text: t, start: r3(cursor), end: r3(end) });
      cursor = end;
    });
  }
  return out;
}

function enforceMinDuration(words, minSec = 0.04) {
  const out = words.map((w) => ({ ...w }));
  for (let k = 0; k < out.length; k++) {
    const w = out[k];
    if (w.end - w.start >= minSec - 1e-9) continue;
    w.end = r3(w.start + minSec);
    const next = out[k + 1];
    if (next && next.start < w.end) {
      next.start = w.end;
      if (next.end < next.start) next.end = next.start;
    }
  }
  return out;
}

function mergeChunks(chunks, { envelope = null, floorDb = null, speechDb = null, minWordSec = 0.04 } = {}) {
  const sorted = (chunks || []).filter(Boolean).slice().sort((a, b) => a.index - b.index);
  let all = [];
  const engines = [];
  const votes = new Map();
  let approx = false;
  for (const c of sorted) {
    if (c.engine && !engines.includes(c.engine)) engines.push(c.engine);
    if (c.timing === "approx") approx = true;
    const dur = Math.max(0, c.end - c.start);
    let kept = 0;
    for (const w of Array.isArray(c.words) ? c.words : []) {
      const text = String(w && w.text != null ? w.text : "").trim();
      const s = Number(w && w.start), e = Number(w && w.end);
      if (!text || !Number.isFinite(s)) continue;
      if (s > dur + EDGE_SLACK_SEC || (Number.isFinite(e) && e < -EDGE_SLACK_SEC)) continue;   // trimmed: outside its chunk
      const start = clamp(s, 0, dur);
      const end = clamp(Number.isFinite(e) ? e : s, start, dur);
      const conf = Number.isFinite(w.conf) ? clamp(w.conf, 0, 1) : (ENGINE_CONF[c.engine] != null ? ENGINE_CONF[c.engine] : 0.95);
      const word = { text, start: r3(c.start + start), end: r3(c.start + end), conf, chunk: c.index, engine: c.engine || null };
      if (w.isFiller === true) word.isFiller = true;
      if (w.inserted === true) word.inserted = true;
      all.push(word);
      kept++;
    }
    const lang = typeof c.language === "string" && c.language ? c.language : null;
    if (lang && kept) votes.set(lang, (votes.get(lang) || 0) + kept);
  }
  all.sort((a, b) => a.start - b.start || a.end - b.end);
  all = splitSpaced(attachPunctuation(all)).filter((w) => w.text);

  // Monotonic, non-overlapping: a word never ends after its successor starts.
  for (let k = 1; k < all.length; k++) {
    const prev = all[k - 1], w = all[k];
    if (w.start < prev.start) w.start = prev.start;
    if (prev.end > w.start) prev.end = r3(Math.max(prev.start, w.start));
    if (w.end < w.start) w.end = w.start;
  }

  const rms = envelope && envelope.rms;
  if (rms && rms.length && Number.isFinite(floorDb)) {
    all = timeline.refineWordEdges(all, rms, { floorDb, speechDb, approx, hop: envelope.hop || 0.01 });
  }
  all = enforceMinDuration(all, minWordSec);

  let language = null, best = 0;
  for (const [lang, n] of votes) if (n > best) { best = n; language = lang; }
  return { words: all, timing: approx ? "approx" : "word", engines, language, languageVotes: Object.fromEntries(votes) };
}

function finalizeWords(words) {
  return (words || [])
    .filter((w) => w && String(w.text || "").trim() && Number.isFinite(w.start) && Number.isFinite(w.end))
    .slice()
    .sort((a, b) => a.start - b.start || a.end - b.end)
    .map((w, i) => {
      const out = {
        i, text: String(w.text).trim(), norm: normText(w.text), start: r3(w.start), end: r3(Math.max(w.start, w.end)),
        conf: Number.isFinite(w.conf) ? Math.round(clamp(w.conf, 0, 1) * 1000) / 1000 : 0.95,
        chunk: Number.isInteger(w.chunk) ? w.chunk : 0, engine: w.engine || null,
      };
      if (w.isFiller === true) out.isFiller = true;
      if (w.inserted === true) out.inserted = true;
      return out;
    });
}

module.exports = { mergeChunks, finalizeWords, normText, attachPunctuation, splitSpaced, enforceMinDuration, ENGINE_CONF };
