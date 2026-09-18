// VIDEO EDIT CAPTION TRANSLATION — spoken-language cues -> translated cues on the same output timeline
// (RENDER.md §6 "Translation", EDIT_PLAN.md captions.setLanguage).
//
// WHY THIS EXISTS. A translated caption has no word timing: the model returns a sentence, not words
// aligned to audio. Translating cue-by-cue would also cut sentences mid-thought, which is where
// translations go wrong. So the unit is the SOURCE SENTENCE as it survives the edit (cut words gone,
// user text edits and insertions in), sent in batches of at most 60 through the app's translation
// engine (services/translate.js, fail-open), cached per sentence hash so an edit elsewhere never
// re-pays for unchanged sentences, then re-grouped into readable cues INSIDE the time that sentence
// actually occupies on the output timeline. A sentence split by a long pause keeps its pause empty:
// the translated words are spread across its kept spans proportionally to rendered width
// (chars × caption_lang.charWidth). Cues are marked timingMode 'proportional', so the ASS writer shows
// them whole with the style's entry animation and never highlights words it cannot time.
//
// CONTRACT:
//   translateTrack({ plan, sentences, words, targetLang, sourceLang?, tracker?, signal?, translateLines?,
//                    cache?, context?, style?, batchSize=60 })
//     -> Promise<{ lang, sourceLang, cues:Cue[], sourceHash, quality:0..1, cache, skipped, stats:{ sentences,
//                  cached, translated, failed, calls } }>
//     plan: resolved plan (captions.cues placed on the output timeline). sentences: analysis sentences
//     [{ id, w0, w1 }] (optional; falls back to words[i].sentenceId, then one unit per cue).
//     translateLines: injectable, default services/translate.js translateLines (loaded lazily).
//     cache: plain object { [sentenceHash]: translatedText } — read and extended in place, returned.
//     Failed / untranslated sentences keep their source text for this run and are not cached.
//     Throws EditError INVALID_LANGUAGE (input) for an unsupported target, PROC_ABORTED when signal aborts.
//   tokenize(text, lang) -> [token]   (Intl.Segmenter for ja; whitespace elsewhere; punctuation attached)
//   sentenceHash(text, sourceLang, targetLang, doNotTranslate?) -> sha1 hex

const crypto = require("node:crypto");
const { EditError } = require("../errors");
const { sha256Json } = require("../fsx");
const captionLang = require("../../services/caption_lang");
const { resolveStyle } = require("./styles");
const { buildCues, charCount } = require("./group");
const { bandsFor } = require("./place");

const FPS = 30;
const BATCH_MAX = 60;
const SPAN_GAP_SEC = 0.6;
const MAX_EXTEND_SEC = 1.5;
const PSEUDO_CONF = 0.4;

const r6 = (x) => Math.round(x * 1e6) / 1e6;
const snap = (t) => Math.round(t * FPS) / FPS;
const joinerFor = (lang) => (String(lang || "").slice(0, 2) === "ja" ? "" : " ");

function aborted() {
  return new EditError("PROC_ABORTED", { status: 409, errorClass: "cancelled", detail: "translation aborted" });
}

function sentenceHash(text, sourceLang, targetLang, doNotTranslate = []) {
  const dnt = Array.isArray(doNotTranslate) ? [...doNotTranslate].map(String).sort() : [];
  return crypto.createHash("sha1").update(JSON.stringify([String(sourceLang), String(targetLang), String(text), dnt])).digest("hex");
}

function tokenize(text, lang) {
  const s = String(text || "").trim();
  if (!s) return [];
  const code = String(lang || "").slice(0, 2);
  if (code !== "ja" && /\s/.test(s)) return s.split(/\s+/).filter(Boolean);
  if (code !== "ja") return [s];
  const tokens = [];
  const seg = new Intl.Segmenter(code, { granularity: "word" });
  let pendingLead = "";
  for (const part of seg.segment(s)) {
    const t = part.segment;
    if (!t.trim()) continue;
    if (part.isWordLike || /[\p{L}\p{N}]/u.test(t)) {
      tokens.push(pendingLead + t);
      pendingLead = "";
    } else if (tokens.length) tokens[tokens.length - 1] += t;
    else pendingLead += t;
  }
  if (pendingLead) tokens.push(pendingLead);
  return tokens;
}

// Kept words of the resolved plan, grouped by source sentence, in output order.
function sentenceUnits(plan, sentences, words, sourceLang) {
  const sentOfWord = new Map();
  for (const s of Array.isArray(sentences) ? sentences : []) {
    if (!s || s.id == null || !Number.isInteger(s.w0) || !Number.isInteger(s.w1)) continue;
    for (let i = s.w0; i <= s.w1; i++) sentOfWord.set(i, String(s.id));
  }
  const kept = [];
  const cues = (plan.captions.cues || []).filter((c) => c && !c.hidden && c.resolved && !c.resolved.collapsed);
  for (const cue of cues) {
    const cw = (cue.words || []).filter((w) => w && typeof w.text === "string" && w.text.trim() && Number.isFinite(w.outStart) && Number.isFinite(w.outEnd));
    const sids = cw.map((w) => {
      if (!Number.isInteger(w.i)) return null;
      if (sentOfWord.has(w.i)) return sentOfWord.get(w.i);
      const tw = Array.isArray(words) ? words[w.i] : null;
      return tw && tw.sentenceId != null ? String(tw.sentenceId) : null;
    });
    // Insertions (i:null) belong to the sentence of the word before them, else the one after.
    for (let k = 0; k < sids.length; k++) if (sids[k] == null && k > 0) sids[k] = sids[k - 1];
    for (let k = sids.length - 1; k >= 0; k--) if (sids[k] == null && k + 1 < sids.length) sids[k] = sids[k + 1];
    cw.forEach((w, k) => kept.push({ ...w, sid: sids[k] != null ? sids[k] : `cue:${cue.id}` }));
  }
  kept.sort((a, b) => a.outStart - b.outStart || a.outEnd - b.outEnd);

  const byId = new Map();
  for (const w of kept) {
    if (!byId.has(w.sid)) byId.set(w.sid, []);
    byId.get(w.sid).push(w);
  }
  const joiner = joinerFor(sourceLang);
  const units = [...byId.entries()].map(([id, ws]) => {
    const idx = ws.map((w) => w.i).filter(Number.isInteger);
    const spans = [];
    for (const w of ws) {
      const last = spans[spans.length - 1];
      if (last && w.outStart - last.outOut <= SPAN_GAP_SEC + 1e-9) {
        last.outOut = Math.max(last.outOut, w.outEnd);
        last.words.push(w);
      } else spans.push({ outIn: w.outStart, outOut: w.outEnd, words: [w] });
    }
    return {
      id, words: ws, spans,
      w0: idx.length ? Math.min(...idx) : null,
      text: ws.map((w) => w.text.trim()).join(joiner).trim(),
    };
  }).filter((u) => u.text);
  units.sort((a, b) => a.spans[0].outIn - b.spans[0].outIn);
  return units;
}

function srcAt(unit, t) {
  const ws = unit.words;
  for (const w of ws) {
    if (t < w.outStart - 1e-9) return w.srcStart;
    if (t <= w.outEnd + 1e-9) {
      const d = w.outEnd - w.outStart;
      return d > 0 ? w.srcStart + ((t - w.outStart) * (w.srcEnd - w.srcStart)) / d : w.srcStart;
    }
  }
  return ws[ws.length - 1].srcEnd;
}

function anchorAt(unit, t) {
  let best = null;
  for (const w of unit.words) {
    if (!Number.isInteger(w.i)) continue;
    if (w.outStart <= t + 1e-9 || best == null) best = w.i;
    if (w.outStart > t) break;
  }
  return best != null ? best : (unit.w0 != null ? unit.w0 : 0);
}

// Spread translated tokens over the unit's kept spans, proportional to rendered width.
function pseudoWords(unit, translated, lang, style, nextStart, outDuration, keyBase) {
  const tokens = tokenize(translated, lang);
  if (!tokens.length) return [];
  const meta = captionLang.langMeta(lang);
  const cw = meta && meta.charWidth ? meta.charWidth : 1;
  const weights = tokens.map((t) => Math.max(1, charCount(t, lang)) * cw);
  const total = weights.reduce((a, b) => a + b, 0);
  const spans = unit.spans.map((s) => ({ outIn: s.outIn, outOut: s.outOut }));

  // Readability: when the kept time is too short for the translated text, borrow silence after the
  // sentence (never past the next sentence, the video end, or MAX_EXTEND_SEC).
  const chars = tokens.reduce((a, t) => a + charCount(t, lang), 0);
  const have = spans.reduce((a, s) => a + (s.outOut - s.outIn), 0);
  const need = chars / (style.readingCps || 20);
  if (need > have) {
    const last = spans[spans.length - 1];
    const limit = Math.min(Number.isFinite(nextStart) ? nextStart : Infinity, last.outOut + MAX_EXTEND_SEC, Number.isFinite(outDuration) ? outDuration : Infinity);
    last.outOut = Math.max(last.outOut, Math.min(last.outOut + (need - have), limit));
  }
  const D = spans.reduce((a, s) => a + (s.outOut - s.outIn), 0);
  const locate = (frac) => {
    let rem = Math.max(0, Math.min(1, frac)) * D;
    for (let k = 0; k < spans.length; k++) {
      const d = spans[k].outOut - spans[k].outIn;
      if (rem <= d + 1e-9 || k === spans.length - 1) return { k, t: spans[k].outIn + Math.min(rem, d) };
      rem -= d;
    }
    return { k: spans.length - 1, t: spans[spans.length - 1].outOut };
  };

  const out = [];
  let acc = 0;
  let prevEnd = -Infinity;
  tokens.forEach((text, k) => {
    const a = acc / total, b = (acc + weights[k]) / total;
    acc += weights[k];
    const mid = locate((a + b) / 2);
    const span = spans[mid.k];
    const la = locate(a), lb = locate(b);
    let start = la.k === mid.k ? la.t : span.outIn;
    let end = lb.k === mid.k ? lb.t : span.outOut;
    start = Math.max(snap(start), prevEnd, snap(span.outIn));
    end = Math.min(snap(end), snap(span.outOut));
    if (end - start < 1 / FPS - 1e-9) end = start + 1 / FPS;
    prevEnd = end;
    out.push({
      key: `${keyBase}_${k}`, i: null, anchorIndex: anchorAt(unit, start), text,
      srcStart: r6(srcAt(unit, start)), srcEnd: r6(Math.max(srcAt(unit, start), srcAt(unit, end))),
      outStart: r6(start), outEnd: r6(end), emphasis: false, conf: PSEUDO_CONF, sentenceId: unit.id,
    });
  });
  return out;
}

function inheritPos(cue, sourceCues, aspect) {
  let best = null, bestOverlap = 0;
  for (const s of sourceCues) {
    if (!s.pos || !s.resolved) continue;
    const ov = Math.min(cue.resolved.outOut, s.resolved.outOut) - Math.max(cue.resolved.outIn, s.resolved.outIn);
    if (ov > bestOverlap) { bestOverlap = ov; best = s; }
  }
  if (best) return { ...best.pos };
  const b = bandsFor(aspect).bottom;
  return { x: 0.5, y: b.y, an: b.an };
}

async function translateTrack({
  plan, sentences = null, words = null, targetLang, sourceLang = null, tracker = null, signal = null,
  translateLines = null, cache = null, context = {}, style = null, batchSize = BATCH_MAX,
} = {}) {
  if (!plan || !plan.captions || !plan.output) {
    throw new EditError("INVALID_PLAN", { status: 422, errorClass: "input", detail: "translateTrack needs a resolved plan" });
  }
  const code = captionLang.normalizeLang(targetLang);
  if (!code) throw new EditError("INVALID_LANGUAGE", { status: 422, errorClass: "input", detail: `unsupported caption language '${targetLang}'` });
  const src = captionLang.normalizeLang(sourceLang) || captionLang.normalizeLang(plan.captions.sourceLanguage)
    || captionLang.normalizeLang(plan.source && plan.source.language) || captionLang.SOURCE_LANG;
  const memo = cache && typeof cache === "object" ? cache : {};
  const stats = { sentences: 0, cached: 0, translated: 0, failed: 0, calls: 0 };
  const sourceCues = (plan.captions.cues || []).filter((c) => c && !c.hidden && c.resolved && !c.resolved.collapsed);

  const units = sentenceUnits(plan, sentences, words, src);
  stats.sentences = units.length;
  const sourceHash = sha256Json({ src, code, units: units.map((u) => [u.id, u.text]) });
  if (code === src) {
    return { lang: code, sourceLang: src, cues: JSON.parse(JSON.stringify(sourceCues)), sourceHash, quality: 1, cache: memo, skipped: true, stats };
  }
  if (signal && signal.aborted) throw aborted();

  const dnt = context && Array.isArray(context.doNotTranslate) ? context.doNotTranslate : [];
  for (const u of units) u.hash = sentenceHash(u.text, src, code, dnt);
  const has = (h) => Object.prototype.hasOwnProperty.call(memo, h) && typeof memo[h] === "string" && memo[h].trim();

  const pending = new Map();
  for (const u of units) {
    if (has(u.hash)) stats.cached++;
    else if (!pending.has(u.hash)) pending.set(u.hash, u);
  }
  const fn = typeof translateLines === "function" ? translateLines : require("../../services/translate").translateLines;
  const size = Math.max(1, Math.min(BATCH_MAX, Number(batchSize) || BATCH_MAX));
  const list = [...pending.values()];
  const failed = new Set();
  for (let b = 0; b < list.length; b += size) {
    if (signal && signal.aborted) throw aborted();
    const batch = list.slice(b, b + size);
    let res = null;
    try {
      stats.calls++;
      res = await fn({ lines: batch.map((u) => ({ id: u.id, text: u.text })), targetLang: code, sourceLang: src, context, tracker, signal });
    } catch (e) {
      if (signal && signal.aborted) throw aborted();
      res = null;
    }
    const untranslated = new Set(((res && res.untranslatedIds) || []).map(String));
    for (const u of batch) {
      const t = res && res.ok !== false && res.byId && typeof res.byId[u.id] === "string" ? res.byId[u.id].trim() : "";
      if (t && !untranslated.has(u.id)) { memo[u.hash] = t; stats.translated++; }
      else failed.add(u.hash);
    }
  }
  if (signal && signal.aborted) throw aborted();

  const out = plan.output;
  const st = style || resolveStyle(plan.captions.styleId, {
    brand: plan.branding && plan.branding.palette, brandColors: plan.settings && plan.settings.brandColors,
    lang: code, aspect: out.aspect, output: out,
  });
  const outDuration = plan.timeline && Number.isFinite(plan.timeline.outDurationSec) ? plan.timeline.outDurationSec : Infinity;
  const pseudo = [];
  let okUnits = 0;
  units.forEach((u, idx) => {
    const text = has(u.hash) ? memo[u.hash] : u.text;
    if (has(u.hash)) okUnits++;
    const nextStart = idx + 1 < units.length ? units[idx + 1].spans[0].outIn : Infinity;
    const keyBase = u.w0 != null ? `x${u.w0}` : `xu${idx}`;
    pseudo.push(...pseudoWords(u, text, code, st, nextStart, outDuration, keyBase));
  });
  stats.failed = units.filter((u) => failed.has(u.hash)).length;

  const cues = buildCues(pseudo, st, { width: out.width, height: out.height }, code, {
    maxWordsPerLine: plan.settings && plan.settings.maxWordsPerLine, timing: "word",
  }).map((c) => {
    const cue = { ...c, timingMode: "proportional", hidden: false, edited: false };
    cue.pos = inheritPos(cue, sourceCues, st.aspect);
    return cue;
  });

  return {
    lang: code, sourceLang: src, cues, sourceHash,
    quality: units.length ? Math.round((okUnits / units.length) * 1000) / 1000 : 1,
    cache: memo, skipped: false, stats,
  };
}

module.exports = { translateTrack, tokenize, sentenceHash, sentenceUnits, BATCH_MAX, SPAN_GAP_SEC };
