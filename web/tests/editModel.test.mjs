// node --test web/tests/editModel.test.mjs
// Covers UX.md §7: retimeCaption mirror, mapTime across cut toggles, summarize, validateOp
// bounds, op-queue coalescing + 409 re-validation, isTypingTarget / keymap guards — plus the
// reducer's optimistic flow and the formatting/copy helpers the screens rely on.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import * as M from "../src/editModel.js";
import { createOpQueue, editorReducer, createInitialState, A, selectPendingChanges, selectShouldAutoUpdate, selectDirtyRanges } from "../src/editState.js";
import { isTypingTarget, matchShortcut, formatShortcut, ariaKeyshortcuts } from "../src/shortcuts.js";
import { fmtTc, fmtBytes, fmtBytesPair, fmtEta, fmtEtaShort, smoothEta, stageRows, statusBadge, provenanceLines, errorCopy, parseRich, defaultsLine, DEFAULT_UPLOAD_SETTINGS, costHint, noticeForView, uploadStatusLine, previewStatusLine } from "../src/editFormat.js";
import { readDeepLink, isEditId } from "../src/deepLink.js";
import { modeForView, GENERATION_MODES } from "../src/modes.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name) => JSON.parse(readFileSync(path.join(here, "fixtures", name), "utf8"));
const READY = fixture("edit-ready.json");
const PLAN = READY.plan.plan;
const WORDS = READY.transcript.words;
const EPS = 1e-6;

// ---------------------------------------------------------------- helpers
function cueFrom(texts, { start = 1, dur = 0.3, gap = 0.05, firstIndex = 0, gaps = {}, durs = {} } = {}) {
  let t = start;
  const words = texts.map((text, k) => {
    const d = durs[k] ?? dur;
    const w = { key: `w${firstIndex + k}`, i: firstIndex + k, text, srcStart: M.round3(t), srcEnd: M.round3(t + d), emphasis: false, conf: 0.95 };
    t += d + (gaps[k] ?? gap);
    return w;
  });
  return { id: `c_${firstIndex}`, anchor: { kind: "words", w0: firstIndex, w1: firstIndex + texts.length - 1 }, words, text: texts.join(" ") };
}

function assertTiming(result, cue) {
  const winStart = cue.words[0].srcStart;
  const winEnd = cue.words[cue.words.length - 1].srcEnd;
  let prevEnd = -Infinity;
  for (const w of result.words) {
    assert.ok(w.srcStart >= winStart - EPS, `starts inside the cue window (${w.srcStart} < ${winStart})`);
    assert.ok(w.srcEnd <= winEnd + EPS, `ends inside the cue window (${w.srcEnd} > ${winEnd})`);
    assert.ok(w.srcEnd >= w.srcStart - EPS, "non-negative duration");
    assert.ok(w.srcStart >= prevEnd - EPS, "monotonic, never overlapping");
    prevEnd = w.srcEnd;
  }
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- retimeCaption
describe("retimeCaption (EDIT_PLAN.md §5 mirror)", () => {
  test("case and punctuation edits keep every timing", () => {
    const cue = cueFrom(["We", "doubled", "our", "revenue."]);
    const r = M.retimeCaption(cue, "we DOUBLED our REVENUE!", { lang: "en" });
    assert.equal(r.ok, true);
    assert.equal(r.text, "we DOUBLED our REVENUE!");
    r.words.forEach((w, k) => {
      assert.equal(w.kind, "equal");
      assert.equal(w.i, cue.words[k].i);
      assert.equal(w.srcStart, cue.words[k].srcStart);
      assert.equal(w.srcEnd, cue.words[k].srcEnd);
    });
    assert.deepEqual(r.overrides.hiddenWords, []);
    assert.deepEqual(r.overrides.insertions, []);
    assert.deepEqual(Object.keys(r.overrides.wordText).sort(), ["0", "1", "3"]);
  });

  test("same-length substitution inherits the word's index and timing", () => {
    const cue = cueFrom(["We", "doubled", "our", "revenue."]);
    const r = M.retimeCaption(cue, "We tripled our revenue.", { lang: "en" });
    assert.equal(r.ok, true);
    assert.equal(r.words[1].kind, "sub");
    assert.equal(r.words[1].i, 1);
    assert.equal(r.words[1].srcStart, cue.words[1].srcStart);
    assert.equal(r.words[1].srcEnd, cue.words[1].srcEnd);
    assert.equal(r.overrides.wordText[1], "tripled");
  });

  test("1→2 split divides the span, each token ≥ 80 ms, first keeps the index", () => {
    const cue = cueFrom(["We", "doubled", "revenue."], { durs: { 2: 0.5 } });
    const r = M.retimeCaption(cue, "We doubled top line.", { lang: "en" });
    assert.equal(r.ok, true);
    assert.equal(r.words.length, 4);
    const [first, second] = r.words.slice(2);
    assert.equal(first.i, 2);
    assert.equal(second.i, null);
    assert.equal(second.afterWordIndex, 2);
    assert.equal(first.srcStart, cue.words[2].srcStart);
    assert.equal(second.srcEnd, cue.words[2].srcEnd);
    assert.ok(first.srcEnd - first.srcStart >= 0.08 - EPS);
    assert.ok(second.srcEnd - second.srcStart >= 0.08 - EPS);
    assert.equal(r.overrides.insertions.length, 1);
    assert.equal(r.overrides.insertions[0].key, second.key);
    assertTiming(r, cue);
  });

  test("pure insert lands in a wide enough gap without touching neighbours", () => {
    const cue = cueFrom(["We", "doubled", "revenue."], { gaps: { 1: 0.5 } });
    const r = M.retimeCaption(cue, "We doubled our revenue.", { lang: "en" });
    assert.equal(r.ok, true);
    const ins = r.words[2];
    assert.equal(ins.kind, "insert");
    assert.equal(ins.text, "our");
    assert.ok(ins.srcStart >= cue.words[1].srcEnd - EPS && ins.srcEnd <= cue.words[2].srcStart + EPS);
    assert.equal(r.words[1].srcEnd, cue.words[1].srcEnd);
    assert.equal(r.words[3].srcStart, cue.words[2].srcStart);
    assertTiming(r, cue);
  });

  test("pure insert borrows symmetrically when the gap is too small (neighbours keep ≥ 60 % and ≥ 80 ms)", () => {
    const cue = cueFrom(["We", "doubled", "revenue."], { gap: 0.02 });
    const r = M.retimeCaption(cue, "We doubled our revenue.", { lang: "en" });
    assert.equal(r.ok, true);
    const [prev, ins, next] = r.words.slice(1, 4);
    const prevOrig = cue.words[1], nextOrig = cue.words[2];
    assert.ok(ins.srcEnd - ins.srcStart >= 0.08 - 1e-3, "inserted word gets ≥ 80 ms");
    const prevKeep = (prev.srcEnd - prev.srcStart) / (prevOrig.srcEnd - prevOrig.srcStart);
    const nextKeep = (next.srcEnd - next.srcStart) / (nextOrig.srcEnd - nextOrig.srcStart);
    assert.ok(prevKeep >= 0.6 - 1e-3 && prev.srcEnd - prev.srcStart >= 0.08 - EPS);
    assert.ok(nextKeep >= 0.6 - 1e-3 && next.srcEnd - next.srcStart >= 0.08 - EPS);
    assert.ok(Math.abs((prevOrig.srcEnd - prev.srcEnd) - (next.srcStart - nextOrig.srcStart)) < 0.002, "borrowed evenly");
    assertTiming(r, cue);
  });

  test("insert compresses between neighbour midpoints when borrowing can't make room", () => {
    const cue = cueFrom(["a", "b"], { dur: 0.1, gap: 0 });
    const r = M.retimeCaption(cue, "a one two three b", { lang: "en" });
    assert.equal(r.ok, true);
    assert.equal(r.words.length, 5);
    assert.equal(r.words.filter((w) => w.kind === "insert").length, 3);
    assertTiming(r, cue);
  });

  test("pure delete hides the word; everyone else keeps timing", () => {
    const cue = cueFrom(["We", "doubled", "our", "revenue."]);
    const r = M.retimeCaption(cue, "We doubled revenue.", { lang: "en" });
    assert.equal(r.ok, true);
    assert.deepEqual(r.overrides.hiddenWords, [2]);
    assert.equal(r.words.length, 3);
    assert.equal(r.words[2].srcStart, cue.words[3].srcStart);
  });

  test("all-deleted and invalid texts are rejected", () => {
    const cue = cueFrom(["We", "doubled", "revenue."]);
    assert.equal(M.retimeCaption(cue, "", { lang: "en" }).code, "ALL_DELETED");
    assert.equal(M.retimeCaption(cue, "   ", { lang: "en" }).code, "ALL_DELETED");
    assert.equal(M.retimeCaption(cue, "… !!", { lang: "en" }).code, "PUNCTUATION_ONLY");
    assert.equal(M.retimeCaption(cue, "x".repeat(121), { lang: "en" }).code, "TOO_LONG");
    assert.equal(M.retimeCaption(cue, "a b c d e f g h i j k", { lang: "en" }).code, "TOO_MANY_WORDS");
    const v = M.validateOp({ type: "caption.editText", cueId: PLAN.captions.cues[0].id, text: "" }, PLAN, { words: WORDS });
    assert.equal(v.ok, false);
    assert.match(v.reason, /Hide caption/);
  });

  test("Japanese: no spaces between tokens, insertion keeps the neighbours' timing", () => {
    const cue = cueFrom(["今日", "は", "いい", "天気", "です。"], { dur: 0.25, gap: 0.03 });
    const text = "今日はとてもいい天気です。";
    const r = M.retimeCaption(cue, text, { lang: "ja" });
    assert.equal(r.ok, true);
    assert.equal(r.text, text);
    assert.equal(r.words.filter((w) => w.kind === "insert").map((w) => w.text).join(""), "とても");
    for (const w of r.words.filter((x) => x.kind === "equal")) {
      const orig = cue.words.find((o) => o.i === w.i);
      assert.ok(Math.abs(w.srcStart - orig.srcStart) < 0.2 && w.text === orig.text);
    }
    assertTiming(r, cue);
  });

  test("Arabic: substitution with attached punctuation keeps position and timing", () => {
    const cue = cueFrom(["مرحبا", "بكم", "في", "القناة"]);
    const r = M.retimeCaption(cue, "مرحبا بكم في قناتنا؟", { lang: "ar" });
    assert.equal(r.ok, true);
    assert.equal(r.words.length, 4);
    assert.deepEqual(r.words.slice(0, 3).map((w) => w.kind), ["equal", "equal", "equal"]);
    assert.equal(r.words[3].kind, "sub");
    assert.equal(r.words[3].i, 3);
    assert.ok(r.words[3].text.endsWith("؟"));
    assert.equal(r.words[3].srcStart, cue.words[3].srcStart);
    assert.equal(r.words[3].srcEnd, cue.words[3].srcEnd);
  });

  test("tokenizer glues joiners and attaches punctuation", () => {
    assert.deepEqual(M.tokenize("So the — thing is, it's 40% sign-ups! “Hello”", "en"), ["So", "the —", "thing", "is,", "it's", "40%", "sign-ups!", "“Hello”"]);
  });

  test("property: 500 random edits keep timing invariants", () => {
    const rand = mulberry32(20260914);
    const vocab = ["we", "doubled", "our", "revenue", "in", "three", "months", "customers", "call", "every", "week", "pricing", "page", "sign-ups", "forty", "percent", "honestly", "Friday"];
    const pick = (list) => list[Math.floor(rand() * list.length)];
    const allowed = new Set(["ALL_DELETED", "PUNCTUATION_ONLY", "TOO_MANY_WORDS", "TOO_LONG"]);
    let okCount = 0;
    for (let iter = 0; iter < 500; iter++) {
      const n = 3 + Math.floor(rand() * 8);
      const texts = Array.from({ length: n }, () => pick(vocab));
      const durs = {}, gaps = {};
      for (let k = 0; k < n; k++) { durs[k] = 0.08 + rand() * 0.5; gaps[k] = rand() < 0.3 ? rand() * 0.6 : rand() * 0.06; }
      const cue = cueFrom(texts, { start: rand() * 20, durs, gaps, firstIndex: Math.floor(rand() * 100) });
      let tokens = [...texts];
      const mutations = 1 + Math.floor(rand() * 3);
      for (let m = 0; m < mutations; m++) {
        const kind = Math.floor(rand() * 7);
        const at = Math.floor(rand() * Math.max(1, tokens.length));
        if (kind === 0 && tokens.length) tokens.splice(at, 1);
        else if (kind === 1) tokens.splice(at, 0, pick(vocab));
        else if (kind === 2 && tokens.length) tokens[at] = pick(vocab);
        else if (kind === 3 && tokens.length) tokens[at] = tokens[at].toUpperCase();
        else if (kind === 4 && tokens.length) tokens[at] = `${tokens[at]}${pick([",", ".", "!", "?"])}`;
        else if (kind === 5 && tokens.length) tokens.splice(at, 1, pick(vocab), pick(vocab));
        else if (kind === 6 && tokens.length > 1) tokens.splice(at, 2, pick(vocab));
      }
      if (rand() < 0.02) tokens = [];
      const text = tokens.join(" ");
      const r = M.retimeCaption(cue, text, { lang: "en" });
      if (!r.ok) {
        assert.ok(allowed.has(r.code), `unexpected rejection ${r.code} for "${text}"`);
        continue;
      }
      okCount++;
      assertTiming(r, cue);
      assert.equal(r.words.length, M.tokenize(text, "en").length);
      assert.equal(r.text, M.tokenize(text, "en").join(" "));
      const oldIdx = new Set(cue.words.map((w) => w.i));
      for (const i of r.overrides.hiddenWords) assert.ok(oldIdx.has(i));
      for (const k of Object.keys(r.overrides.wordText)) assert.ok(oldIdx.has(Number(k)));
      const keys = r.words.map((w) => w.key);
      assert.equal(new Set(keys).size, keys.length, "word keys are unique");
      const visible = new Set(r.words.map((w) => w.i).filter(Number.isInteger));
      for (const i of r.overrides.hiddenWords) assert.ok(!visible.has(i), "a hidden word is not also shown");
    }
    assert.ok(okCount > 400, `most random edits apply (${okCount})`);
  });
});

// ---------------------------------------------------------------- timeline & mapTime
describe("timeline math and mapTime across cut toggles", () => {
  test("the fixture is self-consistent with the client resolver", () => {
    const again = M.resolvePlanLocal(PLAN, { words: WORDS });
    assert.equal(again.timeline.outDurationSec, PLAN.timeline.outDurationSec);
    assert.deepEqual(M.outline(again, { words: WORDS }).summary, READY.outline.summary);
  });

  test("restoring a cut lengthens the edit and keeps B-roll and captions on their words", () => {
    const cut = PLAN.cuts.find((c) => c.kind === "REPEAT");
    const oldTm = M.planTimeMap(PLAN);
    const r = M.applyOpLocal(PLAN, { type: "cut.toggle", cutId: cut.id, enabled: false }, { words: WORDS });
    assert.equal(r.ok, true);
    const next = r.plan;
    const newTm = M.planTimeMap(next);
    const cutLen = cut.srcOut - cut.srcIn;
    const grew = next.timeline.outDurationSec - PLAN.timeline.outDurationSec;
    assert.ok(Math.abs(grew - cutLen) <= 2 / 30 + EPS, `edit grows by the cut (${grew} vs ${cutLen})`);

    const b1 = next.broll.find((b) => b.ordinal === 1);
    assert.equal(b1.resolved.outIn, newTm.srcToOutStart(WORDS[b1.anchor.w0].start));
    const oldB1 = PLAN.broll.find((b) => b.ordinal === 1);
    assert.ok(Math.abs((b1.resolved.outIn - oldB1.resolved.outIn) - grew) < 0.002);

    const cue = next.captions.cues.find((c) => c.words.some((w) => w.i === b1.anchor.w0));
    const w = cue.words.find((x) => x.i === b1.anchor.w0);
    assert.equal(w.outStart, newTm.srcToOutStart(WORDS[b1.anchor.w0].start));

    const s4 = READY.transcript.sentences.find((s) => s.id === "s4");
    const oldOut = oldTm.srcToOutStart(WORDS[s4.w0].start);
    assert.ok(Math.abs(M.mapTime(oldTm, newTm, oldOut) - newTm.srcToOutStart(WORDS[s4.w0].start)) < 0.002);

    const back = M.applyOpLocal(next, { type: "cut.toggle", cutId: cut.id, enabled: true }, { words: WORDS });
    assert.equal(back.plan.timeline.outDurationSec, PLAN.timeline.outDurationSec);
  });

  test("a time inside a re-enabled cut snaps forward to the cut's end", () => {
    const cut = PLAN.cuts.find((c) => c.kind === "REPEAT");
    const withoutCut = M.applyOpLocal(PLAN, { type: "cut.toggle", cutId: cut.id, enabled: false }, { words: WORDS }).plan;
    const tmOpen = M.planTimeMap(withoutCut);
    const tmCut = M.planTimeMap(PLAN);
    const inside = tmOpen.srcToOutStart((cut.srcIn + cut.srcOut) / 2);
    const mapped = M.mapTime(tmOpen, tmCut, inside);
    // Cut edges are quantized inward to the 30 fps grid, so "the cut's end" is the start of the
    // piece that follows it — never more than a frame before the raw srcOut.
    const after = tmCut.pieces.find((p) => p.srcIn >= cut.srcIn - EPS && p.srcIn <= cut.srcOut + EPS);
    assert.equal(mapped, after.outIn);
    assert.ok(tmCut.srcToOutStart(cut.srcOut) - mapped <= 1 / 30 + EPS);
  });

  test("minRemove drops tiny cuts; merged neighbours become one gap", () => {
    const plan = {
      source: { durationSec: 10 }, settings: { removeSilence: true, removeFillers: "light" },
      cuts: [
        { id: "a", kind: "SILENCE", srcIn: 2.0, srcOut: 2.2, enabled: true, controlledBy: "removeSilence" },
        { id: "b", kind: "SILENCE", srcIn: 4.0, srcOut: 4.6, enabled: true, controlledBy: "removeSilence" },
        { id: "c", kind: "FILLER", srcIn: 4.62, srcOut: 4.9, enabled: true, controlledBy: "removeFillers" },
      ],
    };
    const words = [{ i: 0, start: 1, end: 1.5 }, { i: 1, start: 5, end: 9 }];
    const built = M.buildPieces(plan, { words });
    assert.deepEqual(built.activeCutIds.sort(), ["b", "c"]);
    assert.equal(built.merged.length, 1);
    const off = M.buildPieces({ ...plan, settings: { ...plan.settings, removeSilence: false } }, { words });
    assert.deepEqual(off.activeCutIds, ["c"]);
  });

  test("wordAtOut finds the live word and skips cut words", () => {
    const projected = M.projectWords(PLAN, WORDS);
    const um = WORDS.find((w) => w.text === "Um,");
    assert.equal(projected[um.i].cut, true);
    const target = projected.find((p) => !p.cut && p.i === 40);
    const hit = M.wordAtOut(projected, (target.outStart + target.outEnd) / 2);
    assert.equal(hit.i, 40);
  });
});

// ---------------------------------------------------------------- summarize
describe("summarize", () => {
  test("chips mirror outline.summary with ✓ labels and panels", () => {
    const chips = M.summarize(READY.outline);
    assert.deepEqual(chips.map((c) => c.label), ["✓ CAPTIONS", "✓ 2 B-ROLLS", "✓ 2 PUNCH-INS", "✓ 2 JUMP CUTS", "✓ 2 FILLERS OUT", "✓ 4S SILENCE OUT", "✓ MUSIC", "✓ LOGO", "✓ HOOK TITLE"]);
    assert.deepEqual(chips.map((c) => c.panel), ["captions", "broll", "effects", "effects", "transcript", "transcript", "audio", "branding", "effects"]);
  });

  test("off states, singulars and the QA badge", () => {
    const noMusic = M.applyOpLocal(PLAN, { type: "music.remove" }, { words: WORDS }).plan;
    const chips = M.summarize(M.outline(noMusic, { words: WORDS }), { qaCount: 1 });
    assert.equal(chips.find((c) => c.key === "music").label, "○ MUSIC OFF");
    assert.equal(chips[chips.length - 1].label, "⚠ 1");
    const one = M.summarize({ summary: { ...READY.outline.summary, brollCount: 1, punchIns: 0 } });
    assert.equal(one.find((c) => c.key === "broll").label, "✓ 1 B-ROLL");
    assert.equal(one.find((c) => c.key === "punchIns").label, "○ NO PUNCH-INS");
  });
});

// ---------------------------------------------------------------- validateOp
describe("validateOp bounds", () => {
  const v = (op) => M.validateOp(op, PLAN, { words: WORDS }).ok;
  test("audio ranges", () => {
    assert.equal(v({ type: "music.setVolume", volumeDb: -30 }), true);
    assert.equal(v({ type: "music.setVolume", volumeDb: 0 }), true);
    assert.equal(v({ type: "music.setVolume", volumeDb: -30.5 }), false);
    assert.equal(v({ type: "music.setVolume", volumeDb: 0.5 }), false);
    assert.equal(v({ type: "music.setDucking", enabled: true, depthDb: -2 }), false);
    assert.equal(v({ type: "sfx.setVolume", id: PLAN.sfx[0].id, volumeDb: 6 }), true);
    assert.equal(v({ type: "sfx.setVolume", id: PLAN.sfx[0].id, volumeDb: 7 }), false);
    assert.equal(v({ type: "sfx.setVolume", id: "sfx_nope", volumeDb: 0 }), false);
  });
  test("effects, framing, branding", () => {
    const fx = PLAN.effects.find((e) => e.kind === "PUNCH_IN").id;
    assert.equal(v({ type: "effect.adjust", id: fx, zoom: 1.04 }), false);
    assert.equal(v({ type: "effect.adjust", id: fx, zoom: 1.4 }), true);
    assert.equal(v({ type: "effect.adjust", id: fx, zoom: 1.41 }), false);
    assert.equal(v({ type: "framing.adjust", segmentId: "seg_hook", offsetX: 1.2, offsetY: 0, zoom: 1 }), false);
    assert.equal(v({ type: "framing.adjust", segmentId: "seg_hook", offsetX: -1, offsetY: 1, zoom: 2 }), true);
    assert.equal(v({ type: "branding.setLogoPlacement", scale: 0.07 }), false);
    assert.equal(v({ type: "branding.setLogoPlacement", placement: "bl", scale: 0.2, opacity: 0.6 }), true);
    assert.equal(v({ type: "branding.setPalette", primary: "#12345g" }), false);
  });
  test("text, cuts, B-roll, output, meta", () => {
    assert.equal(v({ type: "edit.setTitle", title: "" }), false);
    assert.equal(v({ type: "edit.setTitle", title: "x".repeat(80) }), true);
    assert.equal(v({ type: "edit.setTitle", title: "x".repeat(81) }), false);
    assert.equal(v({ type: "graphic.editText", id: "gfx_hook01", title: "x".repeat(61) }), false);
    assert.equal(v({ type: "caption.editText", cueId: PLAN.captions.cues[0].id, text: "y".repeat(121) }), false);
    const cut = PLAN.cuts[0].id;
    assert.equal(v({ type: "cut.adjust", cutId: cut, padStart: 0.31, padEnd: 0 }), false);
    assert.equal(v({ type: "cut.adjust", cutId: cut, padStart: -0.05, padEnd: 0.05 }), true);
    assert.equal(v({ type: "cut.add", srcIn: 0, srcOut: PLAN.source.durationSec }), false);
    assert.equal(v({ type: "broll.remove", id: "br_growth03" }), true);
    const removed = M.applyOpLocal(PLAN, { type: "broll.remove", id: "br_growth03" }, { words: WORDS }).plan;
    assert.equal(M.validateOp({ type: "broll.remove", id: "br_growth03" }, removed).ok, false);
    assert.equal(M.validateOp({ type: "broll.restore", id: "br_growth03" }, removed).ok, true);
    assert.equal(v({ type: "broll.setTiming", id: "br_calls01", w0: 0, w1: 40 }), false);
    assert.equal(v({ type: "broll.regenerate", id: "br_calls01", query: "x" }), false);
    assert.equal(v({ type: "output.setAspect", aspect: "9:16" }), false);
    assert.equal(v({ type: "output.setAspect", aspect: "16:9" }), true);
    assert.equal(v({ type: "settings.set", key: "silencePace", value: "warp" }), false);
    assert.equal(v({ type: "nope.nothing" }), false);
  });
  test("meta: optimistic flags, coalesce keys and cost hints", () => {
    assert.equal(M.opMeta({ type: "broll.remove" }).optimistic, true);
    assert.equal(M.opMeta({ type: "broll.replace" }).optimistic, false);
    assert.equal(M.opMeta({ type: "settings.set", key: "brollIntensity" }).optimistic, false);
    assert.equal(M.coalesceKeyFor({ type: "sfx.setVolume", id: "sfx_a", volumeDb: 0 }), "sfx.setVolume:sfx_a");
    assert.equal(M.coalesceKeyFor({ type: "broll.remove", id: "x" }), null);
    for (const type of M.OP_TYPES) assert.ok(M.OP_META[type].label && typeof M.OP_META[type].optimistic === "boolean" && M.OP_META[type].costHint, type);
    assert.equal(costHint({ type: "broll.regenerate", id: "x", query: "growth chart" }), "STOCK SEARCH · NO AI");
    assert.equal(costHint({ type: "captions.setLanguage", language: "es" }), "1 AI CALL");
    assert.equal(costHint("broll.remove"), "FREE · SAVED RESULTS");
    assert.equal(M.opLabel({ type: "broll.remove", id: "br_growth03" }, PLAN), "Remove B-roll #3");
  });
});

// ---------------------------------------------------------------- op queue
describe("createOpQueue", () => {
  const ok = (rev) => ({ revision: rev, hash: `h${rev}`, applied: 1, warnings: [], invalidates: { level: "AUDIO", ranges: [] } });

  test("coalesces rapid volume changes into one request with the last value", async () => {
    const sends = [];
    let rev = 3;
    const q = createOpQueue({ initialRevision: 3, coalesceMs: 25, send: async (p) => { sends.push(p); rev += 1; return ok(rev); } });
    q.enqueue({ type: "music.setVolume", volumeDb: -10 });
    q.enqueue({ type: "music.setVolume", volumeDb: -12 });
    const r = q.enqueue({ type: "music.setVolume", volumeDb: -14 });
    assert.equal(r.coalesced, true);
    await q.whenIdle();
    assert.equal(sends.length, 1);
    assert.equal(sends[0].ops[0].volumeDb, -14);
    assert.equal(sends[0].expectedRevision, 3);
    assert.equal(q.getRevision(), 4);
  });

  test("per-id keys don't coalesce across items; expectedRevision follows responses", async () => {
    const sends = [];
    let rev = 10;
    const q = createOpQueue({ initialRevision: 10, coalesceMs: 15, send: async (p) => { sends.push(p); rev += 1; return ok(rev); } });
    q.enqueue({ type: "sfx.setVolume", id: "a", volumeDb: -3 });
    q.enqueue({ type: "sfx.setVolume", id: "b", volumeDb: -4 });
    q.enqueue({ type: "sfx.setVolume", id: "a", volumeDb: -5 });
    await q.whenIdle();
    assert.equal(sends.length, 2);
    assert.deepEqual(sends.map((s) => [s.ops[0].id, s.ops[0].volumeDb]), [["a", -5], ["b", -4]]);
    assert.deepEqual(sends.map((s) => s.expectedRevision), [10, 11]);
  });

  test("network errors retry the same batchId, then hold offline until resumed", async () => {
    const sends = [];
    let fail = 3;
    const statuses = [];
    const q = createOpQueue({
      initialRevision: 1, retryDelays: [3, 3], random: () => 0.5,
      send: async (p) => { sends.push(p); if (fail-- > 0) throw Object.assign(new Error("offline"), { status: 0 }); return ok(2); },
      onStatus: (s) => statuses.push(s.state),
    });
    q.enqueue({ type: "broll.remove", id: "br_growth03" });
    await new Promise((r) => setTimeout(r, 60));
    assert.equal(q.isHeld(), "offline");
    assert.equal(sends.length, 3);
    assert.equal(new Set(sends.map((s) => s.batchId)).size, 1, "same batchId on every retry");
    assert.ok(statuses.includes("retrying") && statuses.includes("offline"));
    q.resume();
    await q.whenIdle();
    assert.equal(sends.length, 4);
    assert.equal(sends[3].batchId, sends[0].batchId);
  });

  test("409 re-validates queued ops against the fresh plan, drops stale ones and resends the rest", async () => {
    const sends = [];
    const freshPlan = M.applyOpLocal(PLAN, { type: "broll.remove", id: "br_growth03" }, { words: WORDS }).plan;
    let revalidated = null;
    let first = true;
    const q = createOpQueue({
      initialRevision: 3, coalesceMs: 5,
      send: async (p) => {
        sends.push(p);
        if (first) { first = false; throw Object.assign(new Error("conflict"), { status: 409, code: "REVISION_CONFLICT" }); }
        return ok(p.expectedRevision + 1);
      },
      onConflict: async () => ({ revision: 5, plan: freshPlan, hash: "h5" }),
      validate: (op, plan) => M.validateOp(op, plan, { words: WORDS }),
      onRevalidated: (info) => { revalidated = info; },
    });
    q.enqueue({ type: "broll.remove", id: "br_growth03" }, { label: "Remove B-roll #3" });
    q.enqueue({ type: "music.setVolume", volumeDb: -12 });
    await q.whenIdle();
    assert.equal(sends.length, 2);
    assert.equal(revalidated.dropped.length, 1);
    assert.equal(revalidated.dropped[0].label, "Remove B-roll #3");
    assert.equal(revalidated.dropped[0].ops[0].type, "broll.remove");
    assert.equal(sends[1].ops[0].type, "music.setVolume");
    assert.equal(sends[1].expectedRevision, 5);
    assert.notEqual(sends[1].batchId, sends[0].batchId);
  });

  test("422 rejects one batch and the queue moves on; 401 holds for auth", async () => {
    const rejected = [];
    const sends = [];
    const q = createOpQueue({
      initialRevision: 1,
      send: async (p) => { sends.push(p); if (p.ops[0].type === "edit.setTitle") throw Object.assign(new Error("bad"), { status: 422, code: "INVALID_OP" }); return ok(2); },
      onRejected: (err, entry) => rejected.push(entry.ops[0].type),
    });
    q.enqueue({ type: "edit.setTitle", title: "x" });
    q.enqueue({ type: "broll.remove", id: "br_growth03" });
    await q.whenIdle();
    assert.deepEqual(rejected, ["edit.setTitle"]);
    assert.equal(sends.length, 2);

    const q2 = createOpQueue({ send: async () => { throw Object.assign(new Error("auth"), { status: 401 }); } });
    q2.enqueue({ type: "broll.remove", id: "x" });
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(q2.isHeld(), "auth");
    q2.dispose();
  });
});

// ---------------------------------------------------------------- reducer
describe("editorReducer optimistic flow", () => {
  const loaded = () => editorReducer(createInitialState({ editId: READY.project.id }), {
    type: A.LOAD_SUCCESS, view: READY.project, plan: READY.plan, transcript: READY.transcript, revisions: READY.revisions, outline: READY.outline,
  });

  test("enqueue applies locally, 422 rolls back with an inline error", () => {
    let s = loaded();
    assert.equal(s.previewRevision, 3);
    assert.equal(selectPendingChanges(s), 0);
    s = editorReducer(s, { type: A.OPS_ENQUEUED, localId: "l1", ops: [{ type: "broll.remove", id: "br_growth03" }] });
    assert.equal(M.findItem(s.plan, "broll", "br_growth03").status, "removed");
    assert.ok(s.pendingItemIds.includes("br_growth03"));
    assert.equal(selectPendingChanges(s), 1);
    s = editorReducer(s, { type: A.OPS_REJECTED, localId: "l1", error: { body: { message: "Nope." } } });
    assert.equal(M.findItem(s.plan, "broll", "br_growth03").status, "missing");
    assert.equal(s.itemErrors.br_growth03, "Nope.");
    assert.equal(selectPendingChanges(s), 0);
  });

  test("confirmed entries survive until the plan at that revision arrives; a preview render clears dirt", () => {
    let s = loaded();
    s = editorReducer(s, { type: A.OPS_ENQUEUED, localId: "l2", ops: [{ type: "broll.remove", id: "br_growth03" }] });
    s = editorReducer(s, { type: A.OPS_APPLIED, localId: "l2", response: { revision: 4, invalidates: { level: "COMPOSITE", ranges: [[27.5, 29.2]] } } });
    assert.equal(s.revision, 4);
    assert.equal(s.history.undoLabel, "Remove B-roll #3");
    assert.equal(M.findItem(s.plan, "broll", "br_growth03").status, "removed");
    assert.deepEqual(selectDirtyRanges(s), [[27.5, 29.2]]);
    assert.equal(selectShouldAutoUpdate(s), true);
    const serverPlan = M.applyOpLocal(PLAN, { type: "broll.remove", id: "br_growth03" }, { words: WORDS }).plan;
    s = editorReducer(s, { type: A.PLAN_LOADED, revision: 4, plan: serverPlan });
    assert.equal(s.entries.length, 0);
    assert.equal(M.findItem(s.plan, "broll", "br_growth03").status, "removed");
    s = editorReducer(s, { type: A.RENDER_UPDATED, render: { renderId: "rd_prev0004", kind: "preview", status: "done", planRevision: 4 } });
    assert.equal(selectPendingChanges(s), 0);
    assert.equal(s.pendingItemIds.length, 0);
    assert.equal(s.previewRevision, 4);
  });

  test("selection opens the item's panel", () => {
    const s = editorReducer(loaded(), { type: A.SELECT, selection: { kind: "sfx", id: "sfx_pop01" } });
    assert.equal(s.panel, "audio");
  });
});

// ---------------------------------------------------------------- shortcuts
describe("isTypingTarget and keymap guards", () => {
  const el = (tagName, extra = {}) => ({ tagName, getAttribute: (n) => extra.attrs?.[n] ?? null, closest: (sel) => (extra.zone && sel === "[data-kf-zone]" ? { dataset: { kfZone: extra.zone } } : null), ...extra });
  const key = (k, extra = {}) => ({ key: k, target: extra.target ?? el("BODY"), shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, ...extra });

  test("typing targets", () => {
    assert.equal(isTypingTarget(el("INPUT", { type: "text" })), true);
    assert.equal(isTypingTarget(el("INPUT", { type: "range" })), true);
    assert.equal(isTypingTarget(el("INPUT", { type: "checkbox" })), false);
    assert.equal(isTypingTarget(el("TEXTAREA")), true);
    assert.equal(isTypingTarget(el("SELECT")), true);
    assert.equal(isTypingTarget(el("DIV", { isContentEditable: true })), true);
    assert.equal(isTypingTarget(el("BUTTON")), false);
    assert.equal(isTypingTarget(null), false);
  });

  test("shortcuts never fire while typing or behind a dialog (except Esc)", () => {
    assert.equal(matchShortcut(key("k"), { mac: false }).action, "togglePlay");
    assert.equal(matchShortcut(key("k", { target: el("INPUT", { type: "text" }) }), { mac: false }), null);
    assert.equal(matchShortcut(key("Delete", { target: el("TEXTAREA") }), { mac: false }), null);
    assert.equal(matchShortcut(key("k"), { dialogOpen: true, mac: false }), null);
    assert.equal(matchShortcut(key("Escape"), { dialogOpen: true, mac: false }).action, "escape");
    assert.equal(matchShortcut(key("Escape", { target: el("INPUT", { type: "text" }) }), { mac: false }).action, "escape");
  });

  test("zones, modifiers and amounts", () => {
    assert.equal(matchShortcut(key("ArrowLeft", { target: el("BUTTON", { zone: "timeline" }) }), { mac: false }), null);
    assert.equal(matchShortcut(key("ArrowLeft", { shiftKey: true }), { mac: false }).amount, -5);
    assert.equal(matchShortcut(key("ArrowRight"), { mac: false }).amount, 1);
    assert.equal(matchShortcut(key("j"), { mac: false }).amount, -5);
    assert.equal(matchShortcut(key(" ", { target: el("BUTTON") }), { mac: false }), null);
    assert.equal(matchShortcut(key(" ", { target: el("BUTTON", { zone: "player" }) }), { mac: false }).action, "togglePlay");
    assert.equal(matchShortcut(key(","), { paused: false, mac: false }), null);
    assert.equal(matchShortcut(key("."), { paused: true, mac: false }).action, "frameForward");
    assert.equal(matchShortcut(key("z", { metaKey: true }), { mac: true }).action, "undo");
    assert.equal(matchShortcut(key("z", { ctrlKey: true }), { mac: true }), null);
    assert.equal(matchShortcut(key("Z", { ctrlKey: true, shiftKey: true }), { mac: false }).action, "redo");
    assert.equal(matchShortcut(key("y", { ctrlKey: true }), { mac: false }).action, "redo");
    assert.equal(matchShortcut(key("?", { shiftKey: true }), { mac: false }).action, "showShortcuts");
    assert.equal(matchShortcut(key("Delete"), { mac: false }).action, "removeSelected");
    assert.equal(matchShortcut(key("Enter", { target: el("BUTTON") }), { mac: false }), null);
    assert.equal(matchShortcut(key("Enter"), { mac: false }).action, "itemActions");
    assert.equal(formatShortcut("Mod+Shift+Z", { mac: true }), "⌘⇧Z");
    assert.equal(formatShortcut("Mod+Shift+Z", { mac: false }), "Ctrl+Shift+Z");
    assert.equal(ariaKeyshortcuts("togglePlay", { mac: false }), "K Space");
  });
});

// ---------------------------------------------------------------- format, links, modes
describe("format helpers, deep links and modes", () => {
  test("timecodes, sizes and ETAs", () => {
    assert.equal(fmtTc(18.24), "00:18.2");
    assert.equal(fmtTc(59.96), "01:00.0");
    assert.equal(fmtTc(12.9, { tenths: false }), "00:12");
    assert.equal(fmtBytes(430 * 1024 * 1024), "430 MB");
    assert.equal(fmtBytes(3.4 * 1024 ** 3), "3.4 GB");
    assert.equal(fmtBytesPair(180 * 1024 * 1024, 430 * 1024 * 1024), "180/430 MB");
    assert.equal(fmtEta(130), "about 2 min");
    assert.equal(fmtEta(40), "under a minute");
    assert.equal(fmtEta(10), "finishing up");
    assert.equal(fmtEtaShort(12), "~12S");
    assert.equal(smoothEta(10, 30), 12);
    assert.equal(smoothEta(10, 0), 1);
    assert.equal(uploadStatusLine({ phase: "uploading", progress: { pct: 42, loaded: 180 * 1048576, total: 430 * 1048576, rateBps: 6.1 * 1048576, etaSec: 45 } }), "UPLOADING 42% · 180/430 MB · 6.1 MB/S · ~45S");
    assert.equal(previewStatusLine({ previewRevision: 14, pendingChanges: 2 }), "PREVIEW r14 · 2 CHANGES PENDING");
    assert.equal(previewStatusLine({ previewRevision: 14, pendingChanges: 0 }), "PREVIEW UP TO DATE ✓");
    assert.equal(previewStatusLine({ render: { status: "running", pct: 64, etaSec: 12 } }), "● UPDATING 64% · ~12S");
  });

  test("stage checklist has at most one current step and nothing pending before it", () => {
    for (let n = 1; n <= 8; n++) {
      const rows = stageRows(fixture(`edit-analyzing-0${n}.json`));
      const current = rows.filter((r) => r.state === "current");
      assert.ok(current.length <= 1, `fixture ${n}`);
      const idx = rows.findIndex((r) => r.state === "current");
      if (idx > 0) assert.ok(rows.slice(0, idx).every((r) => r.state === "done"), `rows before current are done (${n})`);
      if (n > 1) assert.equal(current.length, 1, `fixture ${n} has a current step`);
    }
    assert.ok(stageRows(READY.project).every((r) => r.state === "done"));
    assert.equal(statusBadge({ status: "PROCESSING", stage: "TRANSCRIBING" }).label, "ANALYZING · TRANSCRIBING");
    assert.equal(statusBadge({ status: "CANCELLED" }).label, "STOPPED");
  });

  test("copy: rich text, defaults line, provenance, errors, notices", () => {
    assert.deepEqual(parseRich("That's a **.avi** file, *really*."), [{ text: "That's a " }, { text: ".avi", strong: true }, { text: " file, " }, { text: "really", em: true }, { text: "." }]);
    assert.equal(defaultsLine(DEFAULT_UPLOAD_SETTINGS, { sourceAspect: "9:16" }), "9:16 · BOLD CAPTIONS · AUTO LANGUAGE · MEDIUM B-ROLL · SUBTLE FX · FILLERS + SILENCE OUT · MUSIC ON");
    const lines = provenanceLines({ kind: "broll", id: "br_calls01" }, PLAN, READY.transcript);
    assert.equal(lines[0], "Added because line 4 says “we started calling five customers every single week”.");
    assert.match(lines[2], /^Picked #1 of 3 · Pexels · landscape → cropped to 9:16$/);
    assert.match(provenanceLines({ kind: "cut", id: PLAN.cuts[0].id }, PLAN, READY.transcript)[0], /s of silence removed at source \d\d:\d\d · keeps a 0.15s breath\.$/);
    assert.match(provenanceLines({ kind: "caption", id: PLAN.captions.cues[1].id }, PLAN, READY.transcript)[0], /^Words \d+–\d+ · \d\d:\d\d\.\d–\d\d:\d\d\.\d$/);
    assert.equal(provenanceLines({ kind: "logo", id: "logo" }, PLAN, READY.transcript)[0], "Top-right · 12% width · 85% opacity · whole video.");
    assert.match(errorCopy({ status: 422, body: { error: "MEDIA_REJECTED", details: { reason: "NO_AUDIO_STREAM" } } }).body, /no sound/);
    assert.equal(errorCopy({ status: 0 }).title, "OFFLINE");
    assert.equal(noticeForView({ status: "NEEDS_ATTENTION", statusReason: { code: "STT_FAILED" } }).title, "TAKE FAILED · TRANSCRIPTION");
  });

  test("deep links and modes", () => {
    assert.deepEqual(readDeepLink("?edit=ve_readydemo0000001"), { view: "aiEdit", id: "ve_readydemo0000001" });
    assert.equal(readDeepLink("?edit=../../etc"), null);
    assert.deepEqual(readDeepLink("?edits"), { view: "aiEdits" });
    assert.equal(readDeepLink(""), null);
    assert.equal(isEditId("ve_ABC"), false);
    assert.equal(modeForView("create"), GENERATION_MODES.TEMPLATE_GENERATION);
    assert.equal(modeForView("aiEdit"), GENERATION_MODES.AI_VIDEO_EDIT);
    assert.equal(modeForView("gallery"), null);
  });
});
