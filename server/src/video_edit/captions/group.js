// VIDEO EDIT CAPTION GROUPING — output-timeline words -> readable cues (RENDER.md §6 "Grouping").
//
// WHY THIS EXISTS. Cues are derived, never authored: every cut toggle, style change or text edit
// re-runs this over the kept words. So grouping must be (a) deterministic, (b) LOCAL — a change in
// one sentence must not re-chunk the rest of the video, or the user's per-cue edits (cueY, hidden
// cues) would silently land on different text — and (c) conservative about what a viewer can read:
// line width measured per language, a capped number of lines and words, a max on-screen time, a
// reading-speed cap, and never "3 / hours" or "Google / Calendar" split across lines or cues.
// Locality comes from hard breaks at sentence ends and pauses: the greedy packer resets there, and
// cue ids are `c_<firstSrcWordIndex>`, so a cue keeps its id as long as it starts on the same word.
//
// CONTRACT:
//   buildCues(outWords, style, output, lang, { maxWordsPerLine, timing:'word'|'approx', maxCueSec,
//             minCueSec, pauseSec, readingCps, outDurationSec }) -> Cue[] (EDIT_PLAN.md §2 shape, pos:null)
//     outWords: [{ key, i:int|null, text, srcStart, srcEnd, outStart, outEnd, emphasis, conf,
//                  sentenceId?, anchorIndex?, cueHidden? }] in display order (insertions carry i:null + anchorIndex).
//     cueHidden words (user-hidden captions) never share a unit or cue with visible words.
//   Cue spans never overlap (a cue starts no earlier than the previous one ends) and never end past outDurationSec.
//     style: captions/styles.resolveStyle(...) · output: { width, height }
//   measureText(text, style, lang) -> px · charCount(text, lang) · buildUnits(outWords, lang)
//   Rules: ≤ maxLines lines, ≤ maxWordsPerLine words / ≤ maxCharsPerLine chars / ≤ 88 % of the width
//   per line; hard break at sentence end, sentenceId change, pause > 250 ms, and (words timing) before
//   the cue would exceed 2.5 s; soft break after , ; : —; number+unit and consecutive capitalized
//   tokens are atomic; cues < 0.5 s extend into the following (then preceding) gap; cues above the
//   reading-speed cap (20 cps, 15 hi/ar, 8 ja) split at the most balanced unit boundary.
//   timingMode 'proportional' when timing is approx and the cue's mean conf < 0.5.

const { langMeta } = require("../../services/caption_lang");
const { readingCpsFor } = require("./styles");

const SIDE_MARGIN = 0.06;
const SENTENCE_END_RE = /[.?!。？！।؟…]["'”’)\]]*$/u;
const SOFT_PUNCT_RE = /[,;:—–、，]["'”’)\]]*$/u;
const TRAILING_PUNCT_RE = /[.,!?;:…"'”’)\]]+$/u;

const SPELLED_NUMBERS = new Set([
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve",
  "thirteen", "fifteen", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety",
  "hundred", "thousand", "million", "billion", "half", "dozen", "a", "an",
]);
const UNIT_WORDS = new Set([
  "%", "percent", "per", "x", "times", "am", "pm", "a.m.", "p.m.",
  "ms", "sec", "secs", "second", "seconds", "min", "mins", "minute", "minutes", "hour", "hours", "hr", "hrs",
  "day", "days", "week", "weeks", "month", "months", "year", "years",
  "k", "m", "b", "bn", "hundred", "thousand", "million", "billion", "trillion",
  "dollar", "dollars", "bucks", "euro", "euros", "pound", "pounds", "rupee", "rupees", "usd", "eur", "gbp", "inr",
  "kg", "g", "lb", "lbs", "km", "mile", "miles", "mph", "gb", "mb", "tb", "fps",
  "people", "users", "customers", "subscribers", "followers", "views", "steps", "reps",
]);
const NAME_STOPWORDS = new Set([
  "i", "the", "a", "an", "so", "and", "but", "or", "this", "that", "these", "those", "my", "we", "you", "it", "if",
  "when", "what", "how", "why", "here's", "there", "then", "now", "our", "your", "he", "she", "they", "one",
]);

const r6 = (x) => Math.round(x * 1e6) / 1e6;
const norm = (t) => String(t || "").toLowerCase().replace(TRAILING_PUNCT_RE, "").replace(/^["'“‘(\[]+/u, "");
const joinerFor = (lang) => (String(lang || "").slice(0, 2) === "ja" ? "" : " ");

function charCount(text, lang) {
  const s = String(text || "");
  return [...(joinerFor(lang) === "" ? s.replace(/\s+/g, "") : s)].length;
}

function measureText(text, style, lang) {
  const meta = langMeta(String(lang || "en").slice(0, 2));
  const cw = meta ? meta.charWidth : 1;
  const n = [...String(text || "")].length;
  return n * cw * style.font.emFactor * style.font.sizePx + Math.max(0, n - 1) * (style.font.spacing || 0);
}

const isNumberToken = (t) => {
  const n = norm(t);
  return /^[$€£₹¥]?\d[\d.,]*(%|x|k|m|b|bn)?$/i.test(n) || (SPELLED_NUMBERS.has(n) && n !== "a" && n !== "an");
};
const isUnitToken = (t) => UNIT_WORDS.has(norm(t)) || /^\d*%$/.test(norm(t));
const isCapitalized = (t) => {
  const s = String(t || "").replace(/^["'“‘(\[]+/u, "");
  if (!/^\p{Lu}/u.test(s)) return false;
  const core = norm(s);
  return core.length >= 2 && core !== "i";
};
const endsHard = (t) => SENTENCE_END_RE.test(String(t || ""));
const endsWithPunct = (t) => /[.,!?;:…、，]["'”’)\]]*$/u.test(String(t || ""));

// Atomic display units: number+unit and multi-token capitalized names never split.
function buildUnits(words, lang) {
  const units = [];
  let k = 0;
  while (k < words.length) {
    const group = [words[k]];
    const sentenceStart = k === 0 || endsHard(words[k - 1].text) || (words[k].sentenceId != null && words[k - 1].sentenceId !== words[k].sentenceId);
    let j = k;
    while (j + 1 < words.length && group.length < 3) {
      const a = words[j], b = words[j + 1];
      if (endsWithPunct(a.text)) break;
      if (!!a.cueHidden !== !!b.cueHidden) break;
      if (a.sentenceId != null && b.sentenceId != null && a.sentenceId !== b.sentenceId) break;
      const numUnit = (isNumberToken(a.text) || (group.length > 1 && isUnitToken(a.text))) && isUnitToken(b.text);
      const firstIsStop = j === k && sentenceStart && NAME_STOPWORDS.has(norm(a.text));
      const name = isCapitalized(a.text) && isCapitalized(b.text) && !firstIsStop;
      if (!numUnit && !name) break;
      group.push(b);
      j++;
    }
    units.push(makeUnit(group, lang));
    k = j + 1;
  }
  return units;
}

function makeUnit(words, lang) {
  return {
    words,
    text: words.map((w) => w.text).join(joinerFor(lang)),
    start: words[0].outStart,
    end: words[words.length - 1].outEnd,
    first: words[0],
    last: words[words.length - 1],
  };
}

function lineText(units, lang) { return units.map((u) => u.text).join(joinerFor(lang)); }
function lineWords(units) { return units.reduce((n, u) => n + u.words.length, 0); }

function makeFits(P) {
  return (line, u) => {
    if (!line.length) return true;
    const cand = [...line, u];
    const text = lineText(cand, P.lang);
    return lineWords(cand) <= P.maxWpl && charCount(text, P.lang) <= P.maxChars && measureText(text, P.style, P.lang) <= P.maxWidthPx + 1e-6;
  };
}

// Greedy line layout of a fixed unit list; null when it needs more than maxLines.
function layout(units, P) {
  const fits = makeFits(P);
  const lines = [[]];
  for (const u of units) {
    const line = lines[lines.length - 1];
    const prev = line.length ? line[line.length - 1].last : null;
    if (prev && SOFT_PUNCT_RE.test(prev.text) && lineWords(line) >= 2 && lines.length < P.maxLines) { lines.push([u]); continue; }
    if (fits(line, u)) line.push(u);
    else lines.push([u]);
  }
  return lines.length <= P.maxLines ? lines : null;
}

function pack(units, P) {
  const cues = [];
  const fits = makeFits(P);
  let cur = null;
  const open = (u) => { cur = { units: [u], lines: [[u]] }; };
  const close = () => { if (cur) cues.push(cur); cur = null; };
  for (const u of units) {
    if (cur) {
      const prevUnit = cur.units[cur.units.length - 1];
      const prev = prevUnit.last;
      const gap = u.start - prev.outEnd;
      const sentenceChange = u.first.sentenceId != null && prev.sentenceId != null && u.first.sentenceId !== prev.sentenceId;
      const tooLong = P.enforceMaxCue && u.end - cur.units[0].start > P.maxCueSec + 1e-9;
      const hideChange = !!u.first.cueHidden !== !!prev.cueHidden;
      if (endsHard(prev.text) || sentenceChange || gap > P.pauseSec + 1e-9 || tooLong || hideChange) close();
    }
    if (!cur) { open(u); continue; }
    const line = cur.lines[cur.lines.length - 1];
    const prev = cur.units[cur.units.length - 1].last;
    const cueWords = cur.units.reduce((n, x) => n + x.words.length, 0);
    if (SOFT_PUNCT_RE.test(prev.text)) {
      if (cur.lines.length < P.maxLines && lineWords(line) >= 2) { cur.lines.push([u]); cur.units.push(u); continue; }
      if (cur.lines.length >= P.maxLines && cueWords >= Math.ceil(P.capacity / 2)) { close(); open(u); continue; }
    }
    if (fits(line, u)) { line.push(u); cur.units.push(u); }
    else if (cur.lines.length < P.maxLines) { cur.lines.push([u]); cur.units.push(u); }
    else { close(); open(u); }
  }
  close();
  return cues;
}

const cueStart = (c) => c.units[0].start;
const cueEnd = (c) => c.units[c.units.length - 1].end;
const cueText = (c, lang) => c.lines.map((l) => lineText(l, lang)).join(joinerFor(lang));

function cpsOf(c, nextStart, P) {
  const start = cueStart(c), end = cueEnd(c);
  const room = Number.isFinite(nextStart) ? nextStart - start : Infinity;
  const dur = Math.max(end - start, Math.min(P.minCueSec, room));
  return charCount(cueText(c, P.lang), P.lang) / Math.max(dur, 1e-3);
}

function splitForReading(c, nextStart, P, depth = 0) {
  if (c.units.length < 2 || depth > 12 || cpsOf(c, nextStart, P) <= P.cps + 1e-9) return [c];
  const chars = c.units.map((u) => charCount(u.text, P.lang));
  const total = chars.reduce((a, b) => a + b, 0);
  let best = 1, bestDiff = Infinity, acc = 0;
  for (let s = 1; s < c.units.length; s++) {
    acc += chars[s - 1];
    const diff = Math.abs(total - 2 * acc);
    if (diff < bestDiff) { bestDiff = diff; best = s; }
  }
  const leftUnits = c.units.slice(0, best), rightUnits = c.units.slice(best);
  const leftLines = layout(leftUnits, P), rightLines = layout(rightUnits, P);
  if (!leftLines || !rightLines) return [c];
  const left = { units: leftUnits, lines: leftLines };
  const right = { units: rightUnits, lines: rightLines };
  return [...splitForReading(left, cueStart(right), P, depth + 1), ...splitForReading(right, nextStart, P, depth + 1)];
}

function buildCues(outWords, style, output, lang, opts = {}) {
  const words = (outWords || []).filter((w) => w && typeof w.text === "string" && w.text.trim() && Number.isFinite(w.outStart) && Number.isFinite(w.outEnd));
  if (!words.length) return [];
  const code = String(lang || style.lang || "en").slice(0, 2);
  const maxWpl = Math.max(1, Math.min(Number(opts.maxWordsPerLine) || style.maxWordsPerLine, style.maxWordsPerLine));
  const approx = opts.timing === "approx";
  const meanConfAll = words.reduce((s, w) => s + (Number.isFinite(w.conf) ? w.conf : 1), 0) / words.length;
  const P = {
    style, lang: code, maxWpl, maxLines: style.maxLines,
    maxChars: style.maxCharsPerLine,
    maxWidthPx: (output && output.width ? output.width : 1080) * (1 - 2 * SIDE_MARGIN),
    capacity: maxWpl * style.maxLines,
    maxCueSec: Number(opts.maxCueSec) || style.maxCueSec || 2.5,
    minCueSec: Number(opts.minCueSec) || style.minCueSec || 0.5,
    pauseSec: Number.isFinite(opts.pauseSec) ? opts.pauseSec : (style.pauseBreakSec || 0.25),
    cps: Number(opts.readingCps) || style.readingCps || readingCpsFor(code),
    enforceMaxCue: !(approx && meanConfAll < 0.5),
  };

  const units = buildUnits(words, code);
  const packed = pack(units, P);
  const split = [];
  for (let k = 0; k < packed.length; k++) {
    const nextStart = k + 1 < packed.length ? cueStart(packed[k + 1]) : Infinity;
    split.push(...splitForReading(packed[k], nextStart, P));
  }

  // Timing: cue = [first word start, last word end], never starting before the previous cue ends (overlapping
  // STT words would otherwise burn two captions at one position), extended to the minimum on-screen time but
  // never past the end of the output.
  const outDur = Number.isFinite(opts.outDurationSec) ? opts.outDurationSec : Infinity;
  const spans = split.map((c) => ({ start: cueStart(c), end: Math.min(cueEnd(c), outDur) }));
  for (let k = 0; k < spans.length; k++) {
    const s = spans[k];
    const prevEnd = k > 0 ? spans[k - 1].end : 0;
    if (s.start < prevEnd) s.start = prevEnd;
    if (s.end < s.start) s.end = s.start;
    if (s.end - s.start >= P.minCueSec - 1e-9) continue;
    const nextStart = k + 1 < spans.length ? spans[k + 1].start : Infinity;
    s.end = Math.max(s.end, Math.min(s.start + P.minCueSec, nextStart, outDur));
    if (s.end - s.start < P.minCueSec - 1e-9) s.start = Math.min(s.start, Math.max(s.end - P.minCueSec, prevEnd));
  }

  const used = new Set();
  return split.map((c, k) => {
    const cw = c.units.flatMap((u) => u.words);
    const firstSrc = cw.find((w) => Number.isInteger(w.i));
    let id = firstSrc ? `c_${firstSrc.i}` : `c_${String(cw[0].key).replace(/[^A-Za-z0-9_:-]/g, "").slice(0, 40) || k}`;
    if (used.has(id)) { let n = 2; while (used.has(`${id}_${n}`)) n++; id = `${id}_${n}`; }
    used.add(id);
    const idx = cw.map((w) => (Number.isInteger(w.i) ? w.i : Number.isInteger(w.anchorIndex) ? Math.max(0, w.anchorIndex) : null)).filter((v) => v != null);
    const w0 = idx.length ? Math.min(...idx) : 0, w1 = idx.length ? Math.max(...idx) : 0;
    const meanConf = cw.reduce((s, w) => s + (Number.isFinite(w.conf) ? w.conf : 1), 0) / cw.length;
    const lines = c.lines.map((l) => lineText(l, code));
    return {
      id,
      anchor: { kind: "words", w0, w1 },
      resolved: { outIn: r6(spans[k].start), outOut: r6(spans[k].end), collapsed: false },
      text: lines.join(joinerFor(code)),
      lines,
      words: cw.map((w) => ({
        key: String(w.key),
        i: Number.isInteger(w.i) ? w.i : null,
        text: w.text,
        srcStart: r6(w.srcStart), srcEnd: r6(w.srcEnd),
        outStart: r6(w.outStart), outEnd: r6(w.outEnd),
        emphasis: !!w.emphasis,
        conf: Math.round(Math.min(1, Math.max(0, Number.isFinite(w.conf) ? w.conf : 1)) * 1000) / 1000,
      })),
      timingMode: approx && meanConf < 0.5 ? "proportional" : "words",
      pos: null,
      hidden: false,
      edited: false,
    };
  });
}

module.exports = { buildCues, buildUnits, measureText, charCount, SIDE_MARGIN, isNumberToken, isUnitToken, isCapitalized };
