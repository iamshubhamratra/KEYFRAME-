// VIDEO EDIT CAPTION RE-TIMING — turn a user's cue text edit into word overrides (EDIT_PLAN.md §5
// "Caption re-timing").
//
// WHY THIS EXISTS. Captions are derived from transcript words on every resolve, so a text edit cannot
// be stored as "the cue now says X": the next cut toggle would re-chunk the cue and lose it. It must
// be stored per WORD (wordText overrides, insertions with their own source times, hidden words) so the
// edit survives re-grouping, cut toggles and aspect changes. The hard part is timing: fixing a typo
// or the case of a word must not move a single highlight, a one-word substitution must inherit the
// original word's slot, and genuinely new words need plausible times that keep the karaoke highlight
// monotonic and never bleed into the neighbouring cues. This module is that mapping — pure,
// deterministic, no clock, no ids beyond deterministic insertion keys.
//
// CONTRACT:
//   retimeCueEdit(cue, newText, { lang='en', neighbours:{ prev, next }, insertions=[], keyPrefix,
//                 existingKeys=[], maxTokens, edgePadSec=0.25, keptRanges=null })
//     keptRanges: [[srcIn, srcOut]] that play in the output (time-map play/speed pieces). When given, a pure insert
//     whose gap crosses a cut is placed against the neighbour on the kept side, and split spans are divided in kept
//     time, so new words do not land in removed footage. Omitted = the whole source plays.
//     -> { wordText:{ [srcIndex]:text }, insertions:[Insertion], hiddenWords:[int], removedInsertionKeys:[key],
//          words:[{ key, i, text, srcStart, srcEnd, emphasis }], window:{ lo, hi }, dirty:{ srcStart, srcEnd },
//          tokenCount, unchanged }
//   cue: a derived cue (words carry key, i|null, text, srcStart, srcEnd, emphasis). All times are SOURCE seconds.
//   neighbours.prev / next: the neighbouring cues (or a number: prev source end / next source start) or null.
//   insertions: the plan's current overrides.insertions (to keep afterWordIndex/order of existing keys).
//   The patch lists EVERY insertion of this cue: callers drop removedInsertionKeys + keys of this cue, then add.
//   Throws EditError INVALID_CAPTION_EDIT (422) with extra.reason 'all_deleted' | 'punctuation_only' |
//   'too_many_tokens' | 'token_too_long' | 'empty_cue'.
//   tokenize(text, lang, { oldNorms }) -> [{ text, norm, joined }] · normKey(text) · lcsAlign(a, b)
//
// Algorithm: tokens from Intl.Segmenter (whitespace chunks for spaced scripts, segmenter words for
// ja/zh/th/…, merged back to old word boundaries); trailing punctuation joins the previous token; compare
// on NFKC + lowercase + strip \p{P}. LCS old words vs new tokens. Equal tokens keep timing, index and
// emphasis. Delete+insert blocks are substitutions: same length pairwise; different length splits the
// deleted span proportionally to characters (≥ 80 ms each) — the first token inherits the slot, the rest
// become insertions. Pure inserts go into the gap if it holds 80 ms per token, else borrow from the
// neighbouring words (each keeps ≥ 60 % and ≥ 80 ms), else compress between their midpoints. Pure
// deletes hide the word. A final clamp keeps starts strictly increasing, ends non-decreasing, and all
// times inside the cue window (the cue's word extent padded ≤ edgePadSec, never past the neighbours).
// NOTE: a transcript word keeps its transcript end even when it inherits only part of a split span; the
// highlight intervals of RENDER.md §6 run from word start to the next word start, so the split is still
// what the viewer sees.

const { EditError } = require("../errors");

const MIN_TOKEN_SEC = 0.08;
const KEEP_FRACTION = 0.6;
const START_STEP = 1e-4;
const NATURAL_SEC_PER_CHAR = 0.065;
const NATURAL_MAX_TOKEN_SEC = 0.5;
const LEADING_ORDER_BASE = 500;
const MAX_INSERTION_CHARS = 60;
const NO_SPACE_LANGS = new Set(["ja", "zh", "th", "lo", "km", "my"]);
const PUNCT_RE = /[\p{P}\s]/gu;

const r6 = (x) => Math.round(x * 1e6) / 1e6;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function fail(reason, detail) {
  return new EditError("INVALID_CAPTION_EDIT", { status: 422, errorClass: "input", detail: detail || reason, extra: { reason } });
}

function normKey(text) {
  return String(text == null ? "" : text).normalize("NFKC").toLowerCase().replace(PUNCT_RE, "");
}

function segmenterFor(lang) {
  const code = String(lang || "en").toLowerCase();
  try { return new Intl.Segmenter(code === "und" ? "en" : code, { granularity: "word" }); }
  catch { return new Intl.Segmenter("en", { granularity: "word" }); }
}

// Tokens with `joined` = no whitespace separated this token from the previous one.
function tokenize(text, lang = "en", { oldNorms = null } = {}) {
  const code = String(lang || "en").toLowerCase().slice(0, 2);
  const spaced = !NO_SPACE_LANGS.has(code);
  const tokens = [];
  let prefix = "";
  let sawSpace = true;
  for (const seg of segmenterFor(lang).segment(String(text == null ? "" : text).normalize("NFC"))) {
    const s = seg.segment;
    if (/^\s+$/u.test(s)) { sawSpace = true; continue; }
    const punctOnly = normKey(s) === "";
    const last = tokens[tokens.length - 1];
    if (punctOnly) {
      if (last && !sawSpace) last.text += s;
      else if (last && spaced && sawSpace && !seg.isWordLike) {
        // standalone punctuation chunk ("—"): trailing punctuation attaches to the previous token
        last.text += ` ${s}`;
      } else prefix += s;
      if (!last) sawSpace = false;
      continue;
    }
    if (last && !sawSpace && (spaced || !seg.isWordLike)) {
      last.text += s;
    } else {
      tokens.push({ text: prefix ? `${prefix}${sawSpace && spaced ? " " : ""}${s}` : s, joined: !!last && !sawSpace });
      prefix = "";
    }
    sawSpace = false;
  }
  if (prefix && tokens.length) tokens[tokens.length - 1].text += prefix;
  for (const tk of tokens) tk.norm = normKey(tk.text);

  // No-space scripts: merge adjacent segmenter words back into the original word boundaries.
  if (!spaced && oldNorms && oldNorms.size) {
    const merged = [];
    for (let k = 0; k < tokens.length;) {
      let took = 1;
      for (let n = Math.min(6, tokens.length - k); n >= 2; n--) {
        const run = tokens.slice(k, k + n);
        if (run.slice(1).every((x) => x.joined) && oldNorms.has(run.map((x) => x.norm).join(""))) { took = n; break; }
      }
      const run = tokens.slice(k, k + took);
      merged.push({ text: run.map((x) => x.text).join(""), norm: run.map((x) => x.norm).join(""), joined: run[0].joined });
      k += took;
    }
    return merged;
  }
  return tokens;
}

// LCS alignment: [{ op:'equal', a, b } | { op:'delete', a } | { op:'insert', b }] (deletes before inserts).
function lcsAlign(a, b) {
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) {
    dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  }
  const out = [];
  let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j] && dp[i][j] === dp[i + 1][j + 1] + 1) { out.push({ op: "equal", a: i++, b: j++ }); }
    else if (i < n && (j >= m || dp[i + 1][j] >= dp[i][j + 1])) out.push({ op: "delete", a: i++ });
    else out.push({ op: "insert", b: j++ });
  }
  return out;
}

const chars = (t) => Math.max(1, [...normKey(t)].length);

// Span for n new tokens next to fixed neighbours L / R (either may be null), inside [lo, hi].
function placeSpan({ n, a, b, L, R, lo, hi, weights, pureInsert }) {
  const need = MIN_TOKEN_SEC * n;
  const gL = clamp(L ? L.srcEnd : lo, lo, hi), gR = clamp(R ? R.srcStart : hi, gL, hi);
  let s = clamp(a, gL, gR), e = clamp(b, s, gR);
  if (pureInsert) {
    const natural = weights.reduce((acc, w) => acc + clamp(NATURAL_SEC_PER_CHAR * w, MIN_TOKEN_SEC, NATURAL_MAX_TOKEN_SEC), 0);
    if (e - s > natural) { if (L) e = s + natural; else s = e - natural; }
  }
  if (e - s >= need - 1e-9) return [s, e];
  if (gR - gL >= need - 1e-9) {
    const extra = need - (e - s);
    let left = Math.min(s - gL, extra / 2);
    const right = Math.min(gR - e, extra - left);
    left = Math.min(s - gL, extra - right);
    return [s - left, e + right];
  }
  const availL = L ? Math.max(0, L.srcEnd - (L.srcStart + Math.max(KEEP_FRACTION * (L.srcEnd - L.srcStart), MIN_TOKEN_SEC))) : 0;
  const availR = R ? Math.max(0, (R.srcEnd - Math.max(KEEP_FRACTION * (R.srcEnd - R.srcStart), MIN_TOKEN_SEC)) - R.srcStart) : 0;
  if (gR - gL + availL + availR >= need - 1e-9) {
    const short = need - (gR - gL);
    let takeL = Math.min(availL, short / 2);
    const takeR = Math.min(availR, short - takeL);
    takeL = Math.min(availL, short - takeR);
    return [Math.max(lo, gL - takeL), Math.min(hi, gR + takeR)];
  }
  const mL = L ? (L.srcStart + L.srcEnd) / 2 : gL;
  const mR = R ? (R.srcStart + R.srcEnd) / 2 : gR;
  return [clamp(mL, lo, hi), clamp(Math.max(mL, mR), lo, hi)];
}

// ---- kept source ranges (the output's play/speed pieces): new words must land in time that plays
function normalizeKept(list) {
  if (!Array.isArray(list)) return null;
  const sorted = list.filter((x) => Array.isArray(x) && Number.isFinite(x[0]) && Number.isFinite(x[1]) && x[1] > x[0])
    .map((x) => [x[0], x[1]]).sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const [a, b] of sorted) {
    const last = out[out.length - 1];
    if (last && a <= last[1] + 1e-9) last[1] = Math.max(last[1], b); else out.push([a, b]);
  }
  return out;
}
const rangeOf = (K, t) => K.find(([a, b]) => t >= a - 1e-9 && t <= b + 1e-9) || null;
function keptLen(K, a, b) {
  let s = 0;
  for (const [x, y] of K) s += Math.max(0, Math.min(b, y) - Math.max(a, x));
  return s;
}
// Source time reached after `d` seconds of kept time from `a`. Starts skip to the next range at a range end;
// ends stay on it.
function keptAdvance(K, a, d, { end = false } = {}) {
  let left = d;
  for (const [x, y] of K) {
    if (y <= a + 1e-12) continue;
    const from = Math.max(a, x);
    const room = y - from;
    if (end ? left <= room + 1e-12 : left < room - 1e-12) return from + left;
    left -= room;
  }
  return null;
}

function splitSpan([s, e], weights, K = null) {
  const total = weights.reduce((x, y) => x + y, 0);
  const need = MIN_TOKEN_SEC * weights.length;
  const lenOf = (dur, w) => (dur >= need - 1e-9 ? MIN_TOKEN_SEC + ((dur - need) * w) / total : (dur * w) / total);
  const keptDur = K ? keptLen(K, s, e) : 0;
  if (K && keptDur > 1e-6 && keptDur < e - s - 1e-9) {
    // the span crosses a cut: split it in kept time so no part falls inside removed footage
    let acc = 0;
    return weights.map((w) => {
      const len = lenOf(keptDur, w);
      const a = keptAdvance(K, s, acc), b = keptAdvance(K, s, acc + len, { end: true });
      acc += len;
      let srcStart = a == null ? e : a;
      let srcEnd = b == null ? e : Math.max(srcStart, b);
      // a part that still straddles a cut keeps only the kept range holding most of it (its midpoint must play)
      const r0 = rangeOf(K, srcStart), r1 = rangeOf(K, srcEnd);
      if (r0 && r1 && r0 !== r1) {
        if (r0[1] - srcStart >= srcEnd - r1[0]) srcEnd = r0[1]; else srcStart = r1[0];
      }
      return { srcStart, srcEnd };
    });
  }
  const dur = Math.max(0, e - s);
  let t = s;
  return weights.map((w) => {
    const len = lenOf(dur, w);
    const piece = { srcStart: t, srcEnd: t + len };
    t += len;
    return piece;
  });
}

function neighbourEdge(nb, which) {
  if (nb == null) return null;
  if (Number.isFinite(nb)) return nb;
  const ws = nb && Array.isArray(nb.words) ? nb.words : [];
  if (!ws.length) return null;
  return which === "end" ? Math.max(...ws.map((w) => w.srcEnd)) : Math.min(...ws.map((w) => w.srcStart));
}

// Starts strictly increasing (free tokens redistributed between fixed starts), ends non-decreasing, inside [lo, hi].
function clampSequence(seq, lo, hi) {
  for (let k = 0; k < seq.length;) {
    if (seq[k].fixed) { k++; continue; }
    let j = k;
    while (j < seq.length && !seq[j].fixed) j++;
    const prevFixed = k > 0 ? seq[k - 1] : null;
    const nextFixed = j < seq.length ? seq[j] : null;
    const A = prevFixed ? prevFixed.srcStart : lo;
    const B = nextFixed ? nextFixed.srcStart : hi;
    const run = seq.slice(k, j);
    let ok = true;
    let last = prevFixed ? A : lo - START_STEP;
    for (const tk of run) {
      if (!(tk.srcStart >= lo - 1e-9 && tk.srcStart >= last + START_STEP - 1e-9 && tk.srcStart < B - 1e-9)) { ok = false; break; }
      last = tk.srcStart;
    }
    if (!ok) {
      const m = run.length;
      run.forEach((tk, q) => {
        tk.srcStart = prevFixed ? A + ((B - A) * (q + 1)) / (m + 1) : lo + ((B - lo) * q) / (m + 1);
      });
    }
    k = j;
  }
  for (let k = seq.length - 1; k >= 0; k--) {
    const tk = seq[k];
    if (tk.fixed) continue;
    const nextEnd = k + 1 < seq.length ? seq[k + 1].srcEnd : hi;
    tk.srcEnd = Math.min(tk.srcEnd, nextEnd, hi);
  }
  let prevEnd = -Infinity;
  for (const tk of seq) {
    if (!tk.fixed) tk.srcEnd = Math.min(hi, Math.max(tk.srcEnd, tk.srcStart + START_STEP, prevEnd));
    prevEnd = Math.max(prevEnd, tk.srcEnd);
  }
  for (const tk of seq) { tk.srcStart = r6(tk.srcStart); tk.srcEnd = r6(tk.srcEnd); }
}

function retimeCueEdit(cue, newText, opts = {}) {
  const {
    lang = "en", neighbours = {}, insertions = [], keyPrefix = null, existingKeys = [], maxTokens = null, edgePadSec = 0.25, keptRanges = null,
  } = opts;
  const K = normalizeKept(keptRanges);
  const old = cue && Array.isArray(cue.words) ? cue.words.filter((w) => w && Number.isFinite(w.srcStart) && Number.isFinite(w.srcEnd)) : [];
  if (!old.length) throw fail("empty_cue", "cue has no timed words");
  const code = String(lang || "en").toLowerCase().slice(0, 2);
  const joiner = NO_SPACE_LANGS.has(code) ? "" : " ";

  const oldNorms = new Set(old.map((w) => normKey(w.text)).filter(Boolean));
  const rawText = String(newText == null ? "" : newText).trim();
  if (!rawText) throw fail("all_deleted", "use caption.hide to remove a whole caption");
  const tokens = tokenize(rawText, lang, { oldNorms });
  if (!tokens.length) throw fail("punctuation_only", "caption text has no words");
  if (Number.isInteger(maxTokens) && tokens.length > maxTokens) throw fail("too_many_tokens", `${tokens.length} words > ${maxTokens}`);

  // Window: the cue's word extent, padded into the neighbouring gaps, never past the neighbour cues.
  const W0 = Math.min(...old.map((w) => w.srcStart)), W1 = Math.max(...old.map((w) => w.srcEnd));
  const prevEnd = neighbourEdge(neighbours.prev, "end");
  const nextStart = neighbourEdge(neighbours.next, "start");
  const lo = r6(Math.max(0, W0 - edgePadSec, prevEnd == null ? -Infinity : Math.min(prevEnd, W0)));
  const hi = r6(Math.min(W1 + edgePadSec, nextStart == null ? Infinity : Math.max(nextStart, W1)));

  const insByKey = new Map((insertions || []).map((x) => [x.key, x]));
  const align = lcsAlign(old.map((w) => normKey(w.text)), tokens.map((t) => t.norm));

  // Blocks: equal steps and maximal change blocks between them.
  const steps = [];
  for (const s of align) {
    if (s.op === "equal") { steps.push({ equal: true, a: s.a, b: s.b }); continue; }
    let blk = steps[steps.length - 1];
    if (!blk || blk.equal) { blk = { equal: false, dels: [], ins: [] }; steps.push(blk); }
    (s.op === "delete" ? blk.dels : blk.ins).push(s.op === "delete" ? s.a : s.b);
  }

  const seq = [];          // realized tokens in display order
  const hidden = [];
  const pendingPlacement = [];
  const slotOf = (w, text) => ({
    key: w.key, i: Number.isInteger(w.i) ? w.i : null, text, srcStart: w.srcStart, srcEnd: w.srcEnd,
    emphasis: !!w.emphasis, fixed: true, oldKey: w.key,
  });
  const dropOld = (w) => { if (Number.isInteger(w.i)) hidden.push(w.i); };

  for (let k = 0; k < steps.length; k++) {
    const st = steps[k];
    if (st.equal) { seq.push(slotOf(old[st.a], tokens[st.b].text)); continue; }
    const D = st.dels.map((a) => old[a]);
    const I = st.ins.map((b) => tokens[b]);
    if (!I.length) { D.forEach(dropOld); continue; }
    if (D.length === I.length) { D.forEach((w, q) => seq.push(slotOf(w, I[q].text))); continue; }
    const startIdx = seq.length;
    const weights = I.map((t) => chars(t.text));
    if (D.length) {
      const first = slotOf(D[0], I[0].text);
      if (first.i === null) first.fixed = false;
      seq.push(first);
      D.slice(1).forEach(dropOld);
      I.slice(1).forEach((t) => seq.push({ key: null, i: null, text: t.text, srcStart: 0, srcEnd: 0, emphasis: false, fixed: false }));
      pendingPlacement.push({ startIdx, n: I.length, a: D[0].srcStart, b: D[D.length - 1].srcEnd, weights, pureInsert: false });
    } else {
      I.forEach((t) => seq.push({ key: null, i: null, text: t.text, srcStart: 0, srcEnd: 0, emphasis: false, fixed: false }));
      pendingPlacement.push({ startIdx, n: I.length, weights, pureInsert: true });
    }
  }
  if (!seq.length) throw fail("all_deleted", "use caption.hide to remove a whole caption");

  // Place change blocks (their neighbours are equal tokens, whose timing is final).
  for (const p of pendingPlacement) {
    let L = p.startIdx > 0 ? seq[p.startIdx - 1] : null;
    let R = p.startIdx + p.n < seq.length ? seq[p.startIdx + p.n] : null;
    let loP = lo, hiP = hi;
    if (K && p.pureInsert) {
      // The gap between the neighbours crosses a cut (e.g. a removed filler right after the previous word):
      // insert against the neighbour whose kept range leaves more room, borrowing only from that neighbour.
      const a0 = L ? L.srcEnd : lo, b0 = R ? R.srcStart : hi;
      if (b0 > a0 && keptLen(K, a0, b0) < b0 - a0 - 1e-6) {
        const rL = L ? rangeOf(K, (L.srcStart + L.srcEnd) / 2) : null;
        const rR = R ? rangeOf(K, (R.srcStart + R.srcEnd) / 2) : null;
        const roomL = rL ? Math.max(0, Math.min(b0, rL[1]) - a0) : -1;
        const roomR = rR ? Math.max(0, b0 - Math.max(a0, rR[0])) : -1;
        if (rL && roomL >= roomR) { hiP = Math.min(hi, Math.max(a0, rL[1])); R = null; }
        else if (rR) { loP = Math.max(lo, Math.min(b0, rR[0])); L = null; }
      }
    }
    const a = p.pureInsert ? (L ? L.srcEnd : loP) : p.a;
    const b = p.pureInsert ? (R ? R.srcStart : hiP) : p.b;
    const span = placeSpan({ n: p.n, a, b, L, R, lo: loP, hi: hiP, weights: p.weights, pureInsert: p.pureInsert });
    const parts = splitSpan(span, p.weights, K);
    for (let q = 0; q < p.n; q++) {
      const tk = seq[p.startIdx + q];
      if (tk.fixed) continue;          // a transcript word inheriting the slot keeps its own timing
      tk.srcStart = parts[q].srcStart;
      tk.srcEnd = parts[q].srcEnd;
    }
  }
  clampSequence(seq, lo, hi);

  // Keys, anchors and orders for insertion tokens.
  const used = new Set([...(existingKeys || []), ...old.map((w) => w.key)]);
  const prefix = (keyPrefix || `ins_${String(cue.id || "cue").replace(/^c_/, "")}`).replace(/[^A-Za-z0-9_:-]/g, "").slice(0, 40) || "ins";
  const safePrefix = /^[A-Za-z]/.test(prefix) ? prefix : `ins_${prefix}`;
  let counter = 0;
  const mint = () => { let key; do { key = `${safePrefix}_${counter++}`; } while (used.has(key) || /^w\d+$/.test(key)); used.add(key); return key; };

  const firstSlot = seq.find((tk) => tk.i !== null);
  const fallbackAnchor = (() => {
    const known = old.map((w) => (w.i === null && insByKey.has(w.key) ? insByKey.get(w.key).afterWordIndex : null)).find((v) => v != null);
    if (known != null) return known;
    return cue.anchor && Number.isInteger(cue.anchor.w0) ? cue.anchor.w0 : -1;
  })();
  const outInsertions = [];
  let anchor = null;
  let orderAfter = new Map();
  for (const tk of seq) {
    if (tk.i !== null) { anchor = tk.i; continue; }
    if ([...tk.text].length > MAX_INSERTION_CHARS) throw fail("token_too_long", "a new word is longer than 60 characters");
    const leading = anchor === null;
    const after = leading ? (firstSlot ? firstSlot.i - 1 : fallbackAnchor) : anchor;
    const base = leading && firstSlot ? LEADING_ORDER_BASE : 0;
    const n = orderAfter.get(`${after}|${base}`) || 0;
    orderAfter.set(`${after}|${base}`, n + 1);
    if (!tk.key) tk.key = mint();
    outInsertions.push({ key: tk.key, afterWordIndex: Math.max(-1, after), order: Math.min(1000, base + n), text: tk.text, srcStart: tk.srcStart, srcEnd: tk.srcEnd });
  }

  const wordText = {};
  for (const tk of seq) {
    if (tk.i === null) continue;
    const prev = old.find((w) => w.key === tk.oldKey);
    if (prev && prev.text !== tk.text) wordText[String(tk.i)] = tk.text;
  }
  const keptKeys = new Set(seq.map((tk) => tk.key));
  const removedInsertionKeys = old.filter((w) => w.i === null && !keptKeys.has(w.key)).map((w) => w.key);
  const unchanged = !Object.keys(wordText).length && !hidden.length && !removedInsertionKeys.length
    && seq.length === old.length && seq.every((tk, q) => tk.key === old[q].key && tk.text === old[q].text);

  return {
    wordText,
    insertions: outInsertions,
    hiddenWords: [...new Set(hidden)].sort((x, y) => x - y),
    removedInsertionKeys,
    words: seq.map((tk) => ({ key: tk.key, i: tk.i, text: tk.text, srcStart: tk.srcStart, srcEnd: tk.srcEnd, emphasis: tk.emphasis })),
    text: seq.map((tk) => tk.text).join(joiner),
    window: { lo, hi },
    dirty: { srcStart: r6(Math.min(W0, ...seq.map((tk) => tk.srcStart))), srcEnd: r6(Math.max(W1, ...seq.map((tk) => tk.srcEnd))) },
    tokenCount: tokens.length,
    unchanged,
  };
}

module.exports = { retimeCueEdit, tokenize, normKey, lcsAlign, MIN_TOKEN_SEC, KEEP_FRACTION, NO_SPACE_LANGS };
