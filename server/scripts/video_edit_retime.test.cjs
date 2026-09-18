// Unit tests for caption re-timing (src/video_edit/captions/retime.js, EDIT_PLAN.md §5 "Caption re-timing").
// Run: node scripts/video_edit_retime.test.cjs   (offline; fetch tripwire; < 5 s)
//
// Load-bearing assertions:
//  - FREE EDITS: case / punctuation-only edits keep every word's timing and index (only display text changes).
//  - SLOT INHERITANCE: a substitution keeps the original word's slot; a 1→2 split gives each part ≥ 80 ms.
//  - INSERTIONS: gap → borrow (neighbours keep ≥ 60 % and ≥ 80 ms) → compress, in that order.
//  - PROPERTY: over 500 random edits of real fixture cues, realized word starts are strictly increasing, ends
//    non-decreasing, everything stays inside the cue window, and the window never crosses a neighbouring cue.
//  - SCRIPTS: Japanese segmentation merges back to the original word boundaries; Arabic passes through intact.

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { createHarness, installFetchTripwire } = require("./lib/video_edit_test_utils.cjs");
const { isEditError } = require("../src/video_edit/errors");
const R = require("../src/video_edit/captions/retime");
const { InsertionSchema } = require("../src/video_edit/plan/schema");

const { t, section, run } = createHarness();
const restoreFetch = installFetchTripwire();

const FIX = path.join(__dirname, "fixtures", "video_edit");
const WORDS = JSON.parse(fs.readFileSync(path.join(FIX, "talking_head_45s.transcript.words.json"), "utf8")).words;
const EPS = 1e-6;

const idxOf = (text, from = 0) => { for (let i = from; i < WORDS.length; i++) if (WORDS[i].text === text) return i; throw new Error(`no word ${text}`); };
const cueFrom = (i0, i1) => ({
  id: `c_${i0}`, anchor: { kind: "words", w0: i0, w1: i1 },
  words: WORDS.slice(i0, i1 + 1).map((w) => ({ key: `w${w.i}`, i: w.i, text: w.text, srcStart: w.start, srcEnd: w.end, emphasis: false })),
});
const synthCue = (spec, id = "c_0") => ({
  id, anchor: { kind: "words", w0: spec[0][0], w1: spec[spec.length - 1][0] },
  words: spec.map(([i, text, s, e]) => ({ key: `w${i}`, i, text, srcStart: s, srcEnd: e, emphasis: false })),
});
const reasonOf = (fn) => { try { fn(); } catch (e) { assert.ok(isEditError(e), e && e.stack); assert.equal(e.status, 422); return e.extra.reason; } return null; };

function assertRealizable(res, cue, { prevEnd = null, nextStart = null } = {}) {
  const ws = res.words;
  for (let k = 0; k < ws.length; k++) {
    assert.ok(ws[k].srcEnd > ws[k].srcStart - EPS, `word ${k} ends before it starts`);
    assert.ok(ws[k].srcStart >= res.window.lo - EPS && ws[k].srcEnd <= res.window.hi + EPS, `word ${k} outside window`);
    if (k > 0) {
      assert.ok(ws[k].srcStart > ws[k - 1].srcStart + EPS / 10, `starts not increasing at ${k}: ${ws[k - 1].srcStart} → ${ws[k].srcStart}`);
      assert.ok(ws[k].srcEnd >= ws[k - 1].srcEnd - EPS, `ends decreasing at ${k}`);
    }
  }
  const W0 = Math.min(...cue.words.map((w) => w.srcStart)), W1 = Math.max(...cue.words.map((w) => w.srcEnd));
  assert.ok(res.window.lo <= W0 + EPS && res.window.hi >= W1 - EPS, "window must contain the original cue");
  if (prevEnd != null) assert.ok(res.window.lo >= Math.min(prevEnd, W0) - EPS, "window crosses the previous cue");
  if (nextStart != null) assert.ok(res.window.hi <= Math.max(nextStart, W1) + EPS, "window crosses the next cue");
  const orig = new Map(cue.words.map((w) => [w.key, w]));
  for (const w of ws) {
    if (w.i === null) continue;
    const o = orig.get(`w${w.i}`);
    assert.ok(o, `word ${w.i} not from this cue`);
    assert.equal(w.srcStart, o.srcStart, "a transcript word keeps its start");
    assert.equal(w.srcEnd, o.srcEnd, "a transcript word keeps its end");
  }
  const keys = new Set();
  for (const ins of res.insertions) {
    assert.ok(InsertionSchema.safeParse(ins).success, `invalid insertion ${JSON.stringify(ins)}`);
    assert.ok(!keys.has(ins.key), "duplicate insertion key");
    keys.add(ins.key);
  }
}

// ======================================================================== tokenization
section("captions/retime — tokenization");

t("trailing punctuation joins the previous token; comparison ignores case and punctuation", () => {
  const toks = R.tokenize("Hello, world — it's 3.5 e-mail!", "en");
  assert.deepEqual(toks.map((x) => x.text), ["Hello,", "world —", "it's", "3.5", "e-mail!"]);
  assert.equal(R.normKey("Ｈｅｌｌｏ,"), "hello");
  assert.equal(R.normKey("..."), "");
  assert.deepEqual(R.lcsAlign(["a", "b", "c"], ["a", "x", "c"]).map((s) => s.op), ["equal", "delete", "insert", "equal"]);
});

// ======================================================================== free edits
section("captions/retime — equal tokens");

t("case / punctuation-only edit keeps all timings and indices", () => {
  const i0 = idxOf("I,"), cue = cueFrom(i0, i0 + 8);
  const upper = cue.words.map((w) => w.text.toUpperCase()).join(" ").replace(/\.$/, "!");
  const res = R.retimeCueEdit(cue, upper, { lang: "en" });
  assert.equal(res.insertions.length, 0);
  assert.equal(res.hiddenWords.length, 0);
  assert.equal(res.words.length, cue.words.length);
  res.words.forEach((w, k) => {
    assert.equal(w.i, cue.words[k].i);
    assert.equal(w.srcStart, cue.words[k].srcStart);
    assert.equal(w.srcEnd, cue.words[k].srcEnd);
  });
  assert.equal(res.wordText[String(cue.words[cue.words.length - 1].i)], "DAY!");
  assertRealizable(res, cue);
  const same = R.retimeCueEdit(cue, cue.words.map((w) => w.text).join(" "), { lang: "en" });
  assert.equal(same.unchanged, true);
  assert.deepEqual([same.wordText, same.insertions, same.hiddenWords], [{}, [], []]);
});

t("emphasis survives on equal tokens and new words get none", () => {
  const i0 = idxOf("I,"), cue = cueFrom(i0, i0 + 8);
  cue.words[5].emphasis = true;
  const res = R.retimeCueEdit(cue, `${cue.words.map((w) => w.text).join(" ")} really`, { lang: "en" });
  assert.equal(res.words[5].emphasis, true);
  assert.equal(res.words[res.words.length - 1].emphasis, false);
});

// ======================================================================== substitutions
section("captions/retime — substitutions");

t("a single substitution inherits the word's slot", () => {
  const i0 = idxOf("I,"), cue = cueFrom(i0, i0 + 8);
  const iCheck = idxOf("check");
  const res = R.retimeCueEdit(cue, cue.words.map((w) => (w.i === iCheck ? "read" : w.text)).join(" "), { lang: "en" });
  assert.deepEqual(res.wordText, { [iCheck]: "read" });
  assert.deepEqual([res.insertions, res.hiddenWords], [[], []]);
  const w = res.words.find((x) => x.i === iCheck);
  assert.deepEqual([w.srcStart, w.srcEnd], [WORDS[iCheck].start, WORDS[iCheck].end]);
  assertRealizable(res, cue);
});

t("1→2 substitution splits the span by characters with ≥ 80 ms per part", () => {
  const i0 = idxOf("changed"), cue = cueFrom(i0, idxOf("rule."));
  const iEvery = idxOf("everything");
  const word = WORDS[iEvery];
  assert.ok(word.end - word.start >= 0.2, "fixture precondition: long word");
  const res = R.retimeCueEdit(cue, cue.words.map((w) => (w.i === iEvery ? "all things" : w.text)).join(" "), { lang: "en" });
  assert.deepEqual(res.wordText, { [iEvery]: "all" });
  assert.equal(res.insertions.length, 1);
  const ins = res.insertions[0];
  assert.deepEqual([ins.text, ins.afterWordIndex], ["things", iEvery]);
  assert.ok(ins.srcStart - word.start >= 0.08 - EPS, `first part ${ins.srcStart - word.start}`);
  assert.ok(ins.srcEnd - ins.srcStart >= 0.08 - EPS, `second part ${ins.srcEnd - ins.srcStart}`);
  assert.ok(ins.srcEnd <= word.end + EPS, "split stays inside the replaced span");
  const share = (ins.srcStart - word.start) / (word.end - word.start);
  assert.ok(share > 0.3 && share < 0.5, `'all'(3) vs 'things'(6) share ${share}`);
  assertRealizable(res, cue);
});

t("2→1 substitution keeps the first slot and hides the rest", () => {
  const i0 = idxOf("changed"), cue = cueFrom(i0, idxOf("rule."));
  const iFor = idxOf("for", i0), iMe = iFor + 1;
  const text = cue.words.filter((w) => w.i !== iMe).map((w) => (w.i === iFor ? "personally" : w.text)).join(" ");
  const res = R.retimeCueEdit(cue, text, { lang: "en" });
  assert.deepEqual(res.wordText, { [iFor]: "personally" });
  assert.deepEqual(res.hiddenWords, [iMe]);
  assert.equal(res.insertions.length, 0);
  assertRealizable(res, cue);
});

// ======================================================================== insertions / deletions
section("captions/retime — insertions and deletions");

t("insertion goes into a gap that holds 80 ms per token", () => {
  const cue = synthCue([[0, "we", 1.0, 1.2], [1, "shipped", 1.5, 1.8], [2, "it", 1.84, 2.0]]);
  const res = R.retimeCueEdit(cue, "we finally shipped it", { lang: "en" });
  assert.equal(res.insertions.length, 1);
  const ins = res.insertions[0];
  assert.deepEqual([ins.text, ins.afterWordIndex, ins.order], ["finally", 0, 0]);
  assert.ok(ins.srcStart >= 1.2 - EPS && ins.srcEnd <= 1.5 + EPS, "inside the gap");
  assert.ok(ins.srcEnd - ins.srcStart >= 0.08 - EPS);
  assertRealizable(res, cue);
});

t("insertion borrows symmetrically when the gap is too small (neighbours keep ≥ 60 % and ≥ 80 ms)", () => {
  const iFor = idxOf("for"), cue = cueFrom(idxOf("changed"), idxOf("rule."));
  const L = WORDS[iFor], Rw = WORDS[iFor + 1];
  assert.ok(Rw.start - L.end < 0.08, "fixture precondition: small gap");
  const res = R.retimeCueEdit(cue, cue.words.map((w) => (w.i === iFor ? "for, and" : w.text)).join(" ").replace("for, and", "for and"), { lang: "en" });
  const ins = res.insertions.find((x) => x.text === "and");
  assert.ok(ins, JSON.stringify(res.insertions));
  assert.ok(ins.srcEnd - ins.srcStart >= 0.08 - EPS, `duration ${ins.srcEnd - ins.srcStart}`);
  assert.ok(ins.srcStart < L.end && ins.srcEnd > Rw.start, "borrowed from both neighbours");
  const keepL = ins.srcStart - L.start, keepR = Rw.end - ins.srcEnd;
  assert.ok(keepL >= Math.max(0.6 * (L.end - L.start), 0.08) - EPS, `left keeps ${keepL}`);
  assert.ok(keepR >= Math.max(0.6 * (Rw.end - Rw.start), 0.08) - EPS, `right keeps ${keepR}`);
  assertRealizable(res, cue);
});

t("insertion compresses between neighbour midpoints when nothing can be borrowed", () => {
  const cue = synthCue([[0, "go", 1.0, 1.06], [1, "now", 1.06, 1.12]]);
  const res = R.retimeCueEdit(cue, "go right here right now", { lang: "en", neighbours: { prev: 1.0, next: 1.12 } });
  assert.equal(res.insertions.length, 3);
  for (const ins of res.insertions) {
    assert.ok(ins.srcStart > 1.0 && ins.srcStart < 1.06, `start ${ins.srcStart} between the neighbour starts`);
    assert.ok(ins.srcEnd <= 1.12 + EPS);
  }
  assert.deepEqual(res.insertions.map((x) => x.order), [0, 1, 2]);
  assertRealizable(res, cue, { prevEnd: 1.0, nextStart: 1.12 });
});

t("a leading insertion uses the gap after the previous cue and never crosses it", () => {
  const cue = synthCue([[5, "we", 2.0, 2.2], [6, "won", 2.24, 2.5]], "c_5");
  const res = R.retimeCueEdit(cue, "and we won", { lang: "en", neighbours: { prev: 1.9, next: 2.9 } });
  const ins = res.insertions[0];
  assert.deepEqual([ins.afterWordIndex, ins.order >= 500], [4, true]);
  assert.ok(ins.srcStart >= 1.9 - EPS && ins.srcEnd <= 2.0 + EPS, JSON.stringify(ins));
  assertRealizable(res, cue, { prevEnd: 1.9, nextStart: 2.9 });
});

t("deleting a word hides only that word; everyone else keeps timing", () => {
  const i0 = idxOf("I,"), cue = cueFrom(i0, i0 + 8);
  const iOnly = idxOf("only");
  const res = R.retimeCueEdit(cue, cue.words.filter((w) => w.i !== iOnly).map((w) => w.text).join(" "), { lang: "en" });
  assert.deepEqual([res.hiddenWords, res.wordText, res.insertions], [[iOnly], {}, []]);
  assert.equal(res.words.length, cue.words.length - 1);
  assertRealizable(res, cue);
});

t("existing insertions keep their key when equal and are reported when deleted", () => {
  const cue = synthCue([[0, "we", 1.0, 1.2], [1, "shipped", 1.5, 1.8]]);
  cue.words.splice(1, 0, { key: "ins_0_0", i: null, text: "finally", srcStart: 1.22, srcEnd: 1.45, emphasis: false });
  const inserts = [{ key: "ins_0_0", afterWordIndex: 0, order: 0, text: "finally", srcStart: 1.22, srcEnd: 1.45 }];
  const kept = R.retimeCueEdit(cue, "We FINALLY shipped", { lang: "en", insertions: inserts, existingKeys: ["ins_0_0"] });
  assert.deepEqual(kept.insertions.map((x) => [x.key, x.text, x.srcStart]), [["ins_0_0", "FINALLY", 1.22]]);
  assert.deepEqual(kept.removedInsertionKeys, []);
  const gone = R.retimeCueEdit(cue, "we shipped", { lang: "en", insertions: inserts, existingKeys: ["ins_0_0"] });
  assert.deepEqual([gone.insertions, gone.removedInsertionKeys, gone.hiddenWords], [[], ["ins_0_0"], []]);
  const fresh = R.retimeCueEdit(cue, "we finally really shipped", { lang: "en", insertions: inserts, existingKeys: ["ins_0_0"] });
  assert.ok(fresh.insertions.every((x) => x.key === "ins_0_0" || x.key !== "ins_0_0"));
  assert.equal(new Set(fresh.insertions.map((x) => x.key)).size, 2, "new key never collides with an existing one");
});

t("all-deleted, punctuation-only and over-long edits are rejected with reasons", () => {
  const cue = cueFrom(0, 5);
  assert.equal(reasonOf(() => R.retimeCueEdit(cue, "   ", { lang: "en" })), "all_deleted");
  assert.equal(reasonOf(() => R.retimeCueEdit(cue, "", { lang: "en" })), "all_deleted");
  assert.equal(reasonOf(() => R.retimeCueEdit(cue, "... !!", { lang: "en" })), "punctuation_only");
  assert.equal(reasonOf(() => R.retimeCueEdit(cue, Array.from({ length: 17 }, (_, k) => `w${k}x`).join(" "), { lang: "en", maxTokens: 16 })), "too_many_tokens");
  assert.equal(reasonOf(() => R.retimeCueEdit(cue, `Most ${"a".repeat(61)} people`, { lang: "en" })), "token_too_long");
  assert.equal(reasonOf(() => R.retimeCueEdit({ id: "c_1", words: [] }, "x", {})), "empty_cue");
});

// ======================================================================== scripts
section("captions/retime — Japanese and Arabic");

const JA = synthCue([[0, "今日", 0, 0.3], [1, "は", 0.3, 0.5], [2, "とても", 0.5, 0.9], [3, "大事な", 0.9, 1.3], [4, "話", 1.3, 1.6], [5, "を", 1.6, 1.7], [6, "します。", 1.7, 2.2]]);

t("Japanese: segmenter tokens merge back to word boundaries; edits join without spaces", () => {
  const oldNorms = new Set(JA.words.map((w) => R.normKey(w.text)));
  assert.deepEqual(R.tokenize("今日はとても大事な話をします。", "ja", { oldNorms }).map((x) => x.text), JA.words.map((w) => w.text));
  const same = R.retimeCueEdit(JA, "今日はとても大事な話をします。", { lang: "ja" });
  assert.equal(same.unchanged, true);
  const res = R.retimeCueEdit(JA, "今日はとても大切な話をします。", { lang: "ja" });
  assert.deepEqual(res.wordText, { 3: "大切" });
  assert.deepEqual(res.insertions.map((x) => [x.text, x.afterWordIndex]), [["な", 3]]);
  assert.equal(res.text, "今日はとても大切な話をします。");
  assert.ok(!res.text.includes(" "));
  assertRealizable(res, JA);
  const punct = R.retimeCueEdit(JA, "今日はとても大事な話をします！", { lang: "ja" });
  assert.deepEqual([punct.wordText, punct.insertions], [{ 6: "します！" }, []]);
});

t("Arabic: words and Arabic punctuation pass through untouched; substitutions keep slots", () => {
  const AR = synthCue([[0, "مرحبا،", 0, 0.5], [1, "كيف", 0.55, 0.9], [2, "حالك؟", 0.95, 1.5]]);
  const toks = R.tokenize("مرحبا، كيف حالك؟", "ar");
  assert.deepEqual(toks.map((x) => x.text), ["مرحبا،", "كيف", "حالك؟"]);
  assert.equal(R.retimeCueEdit(AR, "مرحبا، كيف حالك؟", { lang: "ar" }).unchanged, true);
  const res = R.retimeCueEdit(AR, "مرحبا، كيفك حالك؟", { lang: "ar" });
  assert.deepEqual([res.wordText, res.insertions, res.hiddenWords], [{ 1: "كيفك" }, [], []]);
  assert.equal(res.text, "مرحبا، كيفك حالك؟");
  assertRealizable(res, AR);
});

// ======================================================================== property
section("captions/retime — property test");

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

t("500 random edits: monotonic, inside the cue window, never overlapping neighbouring cues", () => {
  const VOCAB = ["really", "so", "a", "big", "Team", "email", "inbox", "super-fast", "10%", "okay", "it's", "wow!", "then", "focus"];
  let applied = 0, rejected = 0, withIns = 0, withHidden = 0, withSplit = 0;
  for (let seed = 1; seed <= 500; seed++) {
    const rand = mulberry32(seed);
    const pick = (arr) => arr[Math.floor(rand() * arr.length)];
    const len = 2 + Math.floor(rand() * 9);
    const i0 = Math.floor(rand() * (WORDS.length - len));
    const cue = cueFrom(i0, i0 + len - 1);
    const prevEnd = i0 > 0 ? WORDS[i0 - 1].end : null;
    const nextStart = i0 + len < WORDS.length ? WORDS[i0 + len].start : null;
    let toks = cue.words.map((w) => w.text);
    const edits = 1 + Math.floor(rand() * 4);
    for (let e = 0; e < edits; e++) {
      const kind = Math.floor(rand() * 5);
      const k = Math.floor(rand() * Math.max(1, toks.length));
      if (kind === 0 && toks.length) toks[k] = rand() < 0.5 ? toks[k].toUpperCase() : `${toks[k].replace(/[.,!?]+$/, "")}${pick([",", ".", "!", ""])}`;
      else if (kind === 1 && toks.length) toks.splice(k, 1);
      else if (kind === 2) toks.splice(Math.floor(rand() * (toks.length + 1)), 0, ...Array.from({ length: 1 + Math.floor(rand() * 3) }, () => pick(VOCAB)));
      else if (kind === 3 && toks.length) toks.splice(k, 1, ...Array.from({ length: 1 + Math.floor(rand() * 3) }, () => pick(VOCAB)));
      else if (kind === 4 && toks.length > 1) { const j = Math.floor(rand() * toks.length); [toks[k], toks[j]] = [toks[j], toks[k]]; }
    }
    const text = toks.join(" ");
    let res;
    try {
      res = R.retimeCueEdit(cue, text, { lang: "en", neighbours: { prev: prevEnd, next: nextStart }, maxTokens: 2 * cue.words.length + 4 });
    } catch (e) {
      assert.ok(isEditError(e) && e.status === 422, `seed ${seed}: ${e && e.stack}`);
      const reason = e.extra.reason;
      if (reason === "all_deleted") assert.equal(text.trim(), "", `seed ${seed}: all_deleted for '${text}'`);
      else assert.equal(reason, "too_many_tokens", `seed ${seed}: unexpected ${reason}`);
      rejected++;
      continue;
    }
    applied++;
    assertRealizable(res, cue, { prevEnd, nextStart });
    assert.deepEqual(res.words.map((w) => R.normKey(w.text)), R.tokenize(text, "en").map((x) => x.norm), `seed ${seed}: tokens lost`);
    const idx = new Set(cue.words.map((w) => w.i));
    assert.ok(res.hiddenWords.every((i) => idx.has(i)), `seed ${seed}: hid a word outside the cue`);
    assert.ok(res.hiddenWords.every((i) => !res.words.some((w) => w.i === i)), `seed ${seed}: hidden word still shown`);
    for (const ins of res.insertions) assert.ok(ins.afterWordIndex >= i0 - 1 && ins.afterWordIndex <= i0 + len - 1, `seed ${seed}: insertion anchored outside the cue`);
    if (res.insertions.length) withIns++;
    if (res.hiddenWords.length) withHidden++;
    if (res.insertions.some((x) => Object.prototype.hasOwnProperty.call(res.wordText, String(x.afterWordIndex)))) withSplit++;
  }
  assert.ok(applied >= 450 && withIns > 150 && withHidden > 80 && withSplit > 30, `weak coverage: applied ${applied}, rejected ${rejected}, ins ${withIns}, hidden ${withHidden}, split ${withSplit}`);
});

// ======================================================================== review regressions (Phase 4a)
section("captions/retime — kept ranges (review regression)");

const midKept = (K, s, e) => K.some(([a, b]) => (s + e) / 2 >= a && (s + e) / 2 < b);

t("a word inserted next to a removed filler lands in footage that plays, with ≥ 80 ms of it", () => {
  const cue = synthCue([[0, "We", 0.5, 0.71], [1, "shipped", 0.74, 1.21]]);
  const kept = [[0.333333, 1.233333], [1.566667, 2.266667]];
  const free = R.retimeCueEdit(cue, "We shipped it", { lang: "en", neighbours: { prev: null, next: 1.6 } });
  assert.ok(!midKept(kept, free.insertions[0].srcStart, free.insertions[0].srcEnd), "precondition: without kept ranges the word sits in the cut");
  const res = R.retimeCueEdit(cue, "We shipped it", { lang: "en", neighbours: { prev: null, next: 1.6 }, keptRanges: kept });
  const ins = res.insertions[0];
  assert.ok(midKept(kept, ins.srcStart, ins.srcEnd), JSON.stringify(ins));
  const keptLen = kept.reduce((s, [a, b]) => s + Math.max(0, Math.min(b, ins.srcEnd) - Math.max(a, ins.srcStart)), 0);
  assert.ok(keptLen >= R.MIN_TOKEN_SEC - 1e-6, `only ${keptLen}s of the word plays`);
  assertRealizable(res, cue, { nextStart: 1.6 });
});

t("a substitution whose span crosses a cut is split in kept time", () => {
  const cue = synthCue([[0, "alpha", 0.5, 0.8], [1, "beta", 1.3, 1.6]]);
  const kept = [[0.3, 0.9], [1.2, 2.0]];
  const res = R.retimeCueEdit(cue, "one two three four", { lang: "en", keptRanges: kept });
  assert.equal(res.insertions.length, 3);
  for (const ins of res.insertions) assert.ok(midKept(kept, ins.srcStart, ins.srcEnd), JSON.stringify(ins));
  assertRealizable(res, cue);
  const plain = R.retimeCueEdit(cue, "one two three four", { lang: "en" });
  assert.deepEqual(plain.words.map((w) => w.text), res.words.map((w) => w.text), "kept ranges never change the tokens");
});

run().then(() => { restoreFetch(); });
