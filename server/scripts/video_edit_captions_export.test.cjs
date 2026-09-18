// Tests for video_edit/captions/{export,translate}.js — offline, injected translator, temp dirs.
// Run: node scripts/video_edit_captions_export.test.cjs
//
// Load-bearing:
//   * SRT / VTT files parse back: sequential numbering, valid timestamps, start < end, no overlap, no blank
//     line inside a cue, VTT entities escaped — and hidden / collapsed cues are not exported;
//   * translation goes through translateLines in batches of ≤ 60 source sentences, is cached per sentence
//     hash (a second run and an unrelated edit re-pay for nothing), and the translated words land inside
//     the time the sentence occupies on the output timeline — never inside a long pause within it;
//   * a failed sentence keeps its source text and is retried next run; abort stops between batches.

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { createHarness, mkTmp, installFetchTripwire } = require("./lib/video_edit_test_utils.cjs");
const { writeSubs, subCuesFrom } = require("../src/video_edit/captions/export");
const TR = require("../src/video_edit/captions/translate");
const { resolveStyle } = require("../src/video_edit/captions/styles");
const { buildCues } = require("../src/video_edit/captions/group");
const { placeCues } = require("../src/video_edit/captions/place");
const { buildAss } = require("../src/video_edit/captions/ass");

const { t, section, run } = createHarness();
const restoreFetch = installFetchTripwire();
const tmp = mkTmp("ve-subs-");
const OUT = { aspect: "9:16", width: 1080, height: 1920 };
const FRAME = 1 / 30;
const snap = (x) => Math.round(x * 30) / 30;

// ---- SRT / VTT parsers ----------------------------------------------------------------------------
function parseTs(s, sep) {
  const m = new RegExp(`^(\\d\\d):(\\d\\d):(\\d\\d)${sep === "," ? "," : "\\."}(\\d\\d\\d)$`).exec(s);
  assert.ok(m, `bad timestamp '${s}'`);
  return ((+m[1] * 60 + +m[2]) * 60 + +m[3]) + +m[4] / 1000;
}
function parseSubs(text, kind) {
  const sep = kind === "srt" ? "," : ".";
  let body = text;
  if (kind === "vtt") {
    assert.ok(text.startsWith("WEBVTT\n\n"), "VTT header");
    body = text.slice("WEBVTT\n\n".length);
  }
  assert.ok(text.endsWith("\n"), "trailing newline");
  const blocks = body.split(/\n\n+/).map((b) => b.replace(/\n+$/, "")).filter((b) => b.length);
  let prevEnd = -1;
  return blocks.map((b, k) => {
    const lines = b.split("\n");
    assert.equal(lines[0], String(k + 1), `${kind} block ${k} numbering`);
    const tm = /^(\S+) --> (\S+)$/.exec(lines[1]);
    assert.ok(tm, `${kind} block ${k} timing line '${lines[1]}'`);
    const start = parseTs(tm[1], sep), end = parseTs(tm[2], sep);
    assert.ok(end > start, `${kind} block ${k} end > start`);
    assert.ok(start >= prevEnd - 1e-9, `${kind} block ${k} does not overlap the previous cue`);
    prevEnd = end;
    const textLines = lines.slice(2);
    assert.ok(textLines.length >= 1 && textLines.every((l) => l.trim().length), `${kind} block ${k} has non-empty text lines`);
    for (const l of textLines) assert.ok(!l.includes("-->"), `${kind} block ${k} text has no arrow`);
    if (kind === "vtt") for (const l of textLines) assert.ok(!/[<>]/.test(l) && !/&(?!amp;|lt;|gt;)/.test(l), `VTT entities escaped: ${l}`);
    return { start, end, lines: textLines };
  });
}

function cue(id, outIn, outOut, lines, extra = {}) {
  return { id, anchor: { kind: "words", w0: 0, w1: 0 }, resolved: { outIn, outOut, collapsed: false }, text: lines.join(" "), lines, words: [], timingMode: "words", pos: null, hidden: false, edited: false, ...extra };
}

// ================================================================================================
section("export — SRT / VTT");

t("writeSubs writes parseable SRT + VTT: hidden/collapsed dropped, overlaps clamped, lines kept, entities escaped", () => {
  const cues = [
    cue("c_5", 1.9, 3.5, ["Tom & <b>Jerry</b> --> next"]),
    cue("c_0", 0.5, 2.0, ["Hello there", "friend"]),
    cue("c_2", 2.0, 3.0, ["hidden"], { hidden: true }),
    { ...cue("c_3", 4.0, 5.0, ["collapsed"]), resolved: { outIn: 4, outOut: 4, collapsed: true } },
    cue("c_9", 6.0, 7.2, ["", "  spaced   words ", ""]),
    cue("c_12", 8.0, 9.0, ["   "]),
  ];
  const dir = path.join(tmp.dir, "out");
  const r = writeSubs(cues, dir, "r0001");
  assert.equal(r.count, 3);
  assert.equal(r.srt, path.join(dir, "r0001.srt"));
  const srt = parseSubs(fs.readFileSync(r.srt, "utf8"), "srt");
  const vtt = parseSubs(fs.readFileSync(r.vtt, "utf8"), "vtt");
  assert.equal(srt.length, 3); assert.equal(vtt.length, 3);
  assert.deepEqual(srt[0], { start: 0.5, end: 1.9, lines: ["Hello there", "friend"] });
  assert.deepEqual(srt[1].lines, ["Tom & <b>Jerry</b> -> next"]);
  assert.deepEqual(vtt[1].lines, ["Tom &amp; &lt;b&gt;Jerry&lt;/b&gt; --&gt; next"]);
  assert.deepEqual(srt[2], { start: 6, end: 7.2, lines: ["spaced words"] });
  assert.deepEqual(vtt.map((c) => [c.start, c.end]), srt.map((c) => [c.start, c.end]));
  assert.deepEqual(fs.readdirSync(dir).sort(), ["r0001.srt", "r0001.vtt"], "no temp files left");
});

t("frame-grid times survive the ms formatter; bad base names are rejected", () => {
  const cues = [cue("c_0", 10 / 30, 47 / 30, ["a"]), cue("c_1", 47 / 30, 3600 + 1 / 30, ["b"])];
  const subs = subCuesFrom(cues);
  assert.equal(subs.length, 2);
  const r = writeSubs(cues, path.join(tmp.dir, "grid"), "grid");
  const srt = parseSubs(fs.readFileSync(r.srt, "utf8"), "srt");
  assert.deepEqual(srt.map((c) => [c.start, c.end]), [[0.333, 1.567], [1.567, 3600.033]]);
  for (const bad of ["../x", "a/b", "", ".hidden", "x".repeat(81), "a b"]) {
    assert.throws(() => writeSubs(cues, tmp.dir, bad), (e) => e.code === "SUBS_INVALID_NAME", bad);
  }
});

// ================================================================================================
section("translate — batches, cache, proportional re-split inside kept spans");

const VOCAB = ["we", "built", "this", "editor", "for", "creators", "who", "want", "clean", "captions", "fast", "today", "and", "every", "video", "matters"];

// Source sentences on the output timeline (no cuts). `pauseIn` puts a 1.2 s pause inside that sentence.
function makeSource(nSent, { pauseIn = -1 } = {}) {
  const words = [], sentences = [];
  let tt = 0.2;
  for (let s = 0; s < nSent; s++) {
    const n = 4 + (s % 3), w0 = words.length;
    for (let k = 0; k < n; k++) {
      if (s === pauseIn && k === 2) tt += 1.2;
      // First word carries the sentence number: every sentence text is unique (identical texts dedupe).
      const text = (k === 0 ? `Item${s}` : VOCAB[(s * 7 + k * 3) % VOCAB.length]) + (k === n - 1 ? "." : "");
      words.push({ i: words.length, text, start: snap(tt), end: snap(tt + 0.3), conf: 0.95, sentenceId: `s${s}` });
      tt += 0.4;
    }
    sentences.push({ id: `s${s}`, w0, w1: words.length - 1 });
    tt += 0.3;
  }
  return { words, sentences, duration: snap(tt + 0.5) };
}

function makePlan(src, { styleId = "bold_pop" } = {}) {
  const style = resolveStyle(styleId, { lang: "en", aspect: OUT.aspect, output: OUT });
  const outWords = src.words.map((w) => ({ key: `w${w.i}`, i: w.i, text: w.text, srcStart: w.start, srcEnd: w.end, outStart: w.start, outEnd: w.end, emphasis: false, conf: w.conf, sentenceId: w.sentenceId }));
  const cues = placeCues(buildCues(outWords, style, OUT, "en", {}), { style, output: OUT });
  return {
    source: { language: "en", timing: "word" },
    output: { ...OUT },
    settings: { maxWordsPerLine: 3, brandColors: [] },
    branding: { palette: null },
    timeline: { outDurationSec: src.duration },
    captions: { enabled: true, styleId, language: "en", sourceLanguage: "en", highlight: "color", cues, translations: {} },
  };
}

const esTransform = (s) => `${s.split(" ").map((w) => `${w.replace(/\.$/, "")}ez`).join(" ")} amigo.`;

function fakeTranslator({ transform = esTransform, failIds = new Set(), throwOnCall = 0, onCall = null } = {}) {
  const calls = [];
  const fn = async ({ lines, targetLang, sourceLang, context, signal }) => {
    calls.push({ n: lines.length, ids: lines.map((l) => l.id), targetLang, sourceLang, context, hasSignal: !!signal });
    if (onCall) onCall(calls.length);
    if (throwOnCall === calls.length) throw new Error("model down");
    const byId = {}, untranslatedIds = [];
    for (const l of lines) {
      if (failIds.has(l.id)) { byId[l.id] = l.text; untranslatedIds.push(l.id); }
      else byId[l.id] = transform(l.text, targetLang);
    }
    const done = lines.length - untranslatedIds.length;
    return { ok: done > 0, language: targetLang, byId, translatedCount: done, totalCount: lines.length, scriptOkCount: done, untranslatedIds, notes: "" };
  };
  fn.calls = calls;
  return fn;
}

// Kept spans per sentence (gap > 0.6 s splits), from the source words.
function spansOf(src, sid) {
  const ws = src.words.filter((w) => w.sentenceId === sid);
  const spans = [];
  for (const w of ws) {
    const last = spans[spans.length - 1];
    if (last && w.start - last.outOut <= 0.6 + 1e-9) last.outOut = w.end;
    else spans.push({ outIn: w.start, outOut: w.end });
  }
  return spans;
}

function tokensBySentence(cues) {
  const map = new Map();
  for (const c of cues) for (const w of c.words) {
    const m = /^x(\d+)_(\d+)$/.exec(w.key);
    assert.ok(m, `translated word key '${w.key}'`);
    if (!map.has(+m[1])) map.set(+m[1], []);
    map.get(+m[1]).push({ k: +m[2], w });
  }
  for (const list of map.values()) list.sort((a, b) => a.k - b.k);
  return map;
}

t("130 sentences -> 3 translateLines calls (60/60/10); every translated token lands, in order, inside its sentence's kept time", async () => {
  const src = makeSource(130, { pauseIn: 7 });
  const plan = makePlan(src);
  const tr = fakeTranslator();
  const cache = {};
  const res = await TR.translateTrack({ plan, sentences: src.sentences, words: src.words, targetLang: "es", translateLines: tr, cache, context: { doNotTranslate: ["KEYFRAME"] } });
  assert.deepEqual(tr.calls.map((c) => c.n), [60, 60, 10]);
  assert.ok(tr.calls.every((c) => c.targetLang === "es" && c.sourceLang === "en" && c.context.doNotTranslate[0] === "KEYFRAME"));
  assert.deepEqual(res.stats, { sentences: 130, cached: 0, translated: 130, failed: 0, calls: 3 });
  assert.equal(res.quality, 1);
  assert.equal(Object.keys(cache).length, 130);
  assert.equal(res.lang, "es");
  assert.match(res.sourceHash, /^[0-9a-f]{64}$/);

  const byS = tokensBySentence(res.cues);
  assert.equal(byS.size, 130);
  src.sentences.forEach((s, idx) => {
    const text = src.words.slice(s.w0, s.w1 + 1).map((w) => w.text).join(" ");
    const expected = TR.tokenize(esTransform(text), "es");
    const got = byS.get(s.w0);
    assert.deepEqual(got.map((x) => x.w.text), expected, `sentence ${s.id} tokens`);
    const spans = spansOf(src, s.id);
    const next = idx + 1 < src.sentences.length ? src.words[src.sentences[idx + 1].w0].start : Infinity;
    const last = spans[spans.length - 1];
    let prev = -Infinity;
    for (const { w } of got) {
      assert.ok(w.outStart >= prev - 1e-9, `${s.id} words monotonic`);
      prev = w.outEnd;
      const inside = spans.some((sp) => w.outStart >= sp.outIn - FRAME - 1e-9 && w.outEnd <= sp.outOut + FRAME + 1e-9);
      const extension = w.outStart >= last.outIn - 1e-9 && w.outEnd <= Math.min(next, last.outOut + 1.5) + 1e-9;
      assert.ok(inside || extension, `${s.id} word '${w.text}' [${w.outStart}, ${w.outEnd}] inside kept spans ${JSON.stringify(spans)}`);
      assert.equal(w.i, null);
      assert.ok(w.outEnd - w.outStart >= FRAME - 1e-9);
    }
  });
  // The paused sentence: two spans, nothing drawn inside the pause.
  const paused = src.sentences[7];
  const sp = spansOf(src, paused.id);
  assert.equal(sp.length, 2, "pause splits the sentence into two kept spans");
  for (const { w } of byS.get(paused.w0)) {
    assert.ok(w.outEnd <= sp[0].outOut + FRAME + 1e-9 || w.outStart >= sp[1].outIn - FRAME - 1e-9, `word '${w.text}' [${w.outStart},${w.outEnd}] avoids the pause ${sp[0].outOut}..${sp[1].outIn}`);
  }
  assert.ok(byS.get(paused.w0).some(({ w }) => w.outStart >= sp[1].outIn - 1e-9), "text continues after the pause");
});

t("translated cues are proportional, readable, ordered, schema-shaped, positioned like the source, and render as one ASS event each", async () => {
  const src = makeSource(12);
  const plan = makePlan(src);
  const res = await TR.translateTrack({ plan, sentences: src.sentences, words: src.words, targetLang: "es", translateLines: fakeTranslator() });
  assert.ok(res.cues.length >= 12);
  const srcPos = new Set(plan.captions.cues.map((c) => JSON.stringify(c.pos)));
  res.cues.forEach((c, k) => {
    assert.equal(c.timingMode, "proportional");
    assert.match(c.id, /^c_[A-Za-z0-9_:-]{1,48}$/);
    for (const w of c.words) assert.match(w.key, /^[A-Za-z0-9_:-]{1,48}$/);
    assert.ok(c.lines.length >= 1 && c.lines.length <= 1, "bold_pop keeps one line");
    assert.ok(c.words.length <= 3, "maxWordsPerLine respected");
    assert.ok(srcPos.has(JSON.stringify(c.pos)), `pos inherited from a source cue: ${JSON.stringify(c.pos)}`);
    assert.equal(c.anchor.kind, "words");
    if (k + 1 < res.cues.length) assert.ok(c.resolved.outOut <= res.cues[k + 1].resolved.outIn + 1e-6, `cue ${k} does not overlap the next`);
  });
  // Proportional split: inside one span, a longer token never gets less time than a shorter one (1 frame slack).
  for (const list of tokensBySentence(res.cues).values()) {
    for (let a = 0; a < list.length; a++) for (let b = 0; b < list.length; b++) {
      const wa = list[a].w, wb = list[b].w;
      if (Math.abs(wa.outStart - wb.outStart) > 2) continue;
      if (wa.text.length > wb.text.length + 2) assert.ok(wa.outEnd - wa.outStart >= wb.outEnd - wb.outStart - FRAME - 1e-6, `'${wa.text}' vs '${wb.text}'`);
    }
  }
  const ass = buildAss({ cues: res.cues, style: resolveStyle("bold_pop", { lang: "es", aspect: "9:16", output: OUT }), output: OUT, lang: "es", highlight: "color" });
  assert.equal(ass.eventCount, res.cues.length, "one event per proportional cue (no word highlight)");
  const r = writeSubs(res.cues, path.join(tmp.dir, "tr"), "es");
  const subs = parseSubs(fs.readFileSync(r.srt, "utf8"), "srt");
  assert.equal(subs.length, res.cues.length);
  assert.ok(subs[0].lines[0].endsWith("ez") || subs[0].lines[0].includes("ez "), subs[0].lines[0]);
});

t("cache: a second run makes no call and yields identical cues; editing one sentence re-translates only that sentence", async () => {
  const src = makeSource(70);
  const plan = makePlan(src);
  const cache = {};
  const first = await TR.translateTrack({ plan, sentences: src.sentences, words: src.words, targetLang: "es", translateLines: fakeTranslator(), cache });
  const tr2 = fakeTranslator();
  const second = await TR.translateTrack({ plan, sentences: src.sentences, words: src.words, targetLang: "es", translateLines: tr2, cache });
  assert.equal(tr2.calls.length, 0);
  assert.equal(second.stats.cached, 70);
  assert.deepEqual(second.cues, first.cues);
  assert.equal(second.sourceHash, first.sourceHash);

  const edited = JSON.parse(JSON.stringify(plan));
  const target = edited.captions.cues.find((c) => c.words.some((w) => w.i === src.sentences[40].w0));
  target.words.find((w) => w.i === src.sentences[40].w0).text = "Rewritten";
  const tr3 = fakeTranslator();
  const third = await TR.translateTrack({ plan: edited, sentences: src.sentences, words: src.words, targetLang: "es", translateLines: tr3, cache });
  assert.deepEqual(tr3.calls.map((c) => c.ids), [["s40"]]);
  assert.notEqual(third.sourceHash, first.sourceHash);
  assert.equal(tokensBySentence(third.cues).get(src.sentences[40].w0)[0].w.text, "Rewrittenez");
});

t("failures: untranslated ids and a throwing batch keep source text, are not cached, lower quality, and are retried next run", async () => {
  const src = makeSource(125);
  const plan = makePlan(src);
  const cache = {};
  const tr = fakeTranslator({ failIds: new Set(["s3", "s4"]), throwOnCall: 2 });
  const res = await TR.translateTrack({ plan, sentences: src.sentences, words: src.words, targetLang: "es", translateLines: tr, cache });
  assert.deepEqual(tr.calls.map((c) => c.n), [60, 60, 5]);
  assert.equal(res.stats.failed, 62);
  assert.equal(res.stats.translated, 63);
  assert.equal(res.quality, Math.round((63 / 125) * 1000) / 1000);
  assert.equal(Object.keys(cache).length, 63);
  const byS = tokensBySentence(res.cues);
  const s3 = src.sentences[3];
  assert.deepEqual(byS.get(s3.w0).map((x) => x.w.text), src.words.slice(s3.w0, s3.w1 + 1).map((w) => w.text), "failed sentence shows source text");
  const retry = fakeTranslator();
  const again = await TR.translateTrack({ plan, sentences: src.sentences, words: src.words, targetLang: "es", translateLines: retry, cache });
  assert.deepEqual(retry.calls.map((c) => c.n), [60, 2], "only the 62 failed sentences are sent again");
  assert.equal(again.quality, 1);
});

t("identical sentences are sent once per run and share the translation", async () => {
  const src = makeSource(6);
  const s1 = src.sentences[1], s4 = src.sentences[4];
  assert.equal(s1.w1 - s1.w0, s4.w1 - s4.w0);
  for (let k = 0; k <= s1.w1 - s1.w0; k++) src.words[s4.w0 + k].text = src.words[s1.w0 + k].text;
  const plan = makePlan(src);
  const tr = fakeTranslator();
  const res = await TR.translateTrack({ plan, sentences: src.sentences, words: src.words, targetLang: "es", translateLines: tr });
  assert.deepEqual(tr.calls.map((c) => c.n), [5]);
  assert.equal(res.stats.translated, 5);
  assert.equal(res.quality, 1);
  const byS = tokensBySentence(res.cues);
  assert.deepEqual(byS.get(s4.w0).map((x) => x.w.text), byS.get(s1.w0).map((x) => x.w.text));
});

t("abort: an aborted signal throws PROC_ABORTED before any call, and an abort during a batch stops before the next", async () => {
  const src = makeSource(130);
  const plan = makePlan(src);
  const ac = new AbortController();
  ac.abort();
  const tr = fakeTranslator();
  await assert.rejects(TR.translateTrack({ plan, sentences: src.sentences, words: src.words, targetLang: "es", translateLines: tr, signal: ac.signal }), (e) => e.code === "PROC_ABORTED" && e.errorClass === "cancelled");
  assert.equal(tr.calls.length, 0);
  const ac2 = new AbortController();
  const tr2 = fakeTranslator({ onCall: (n) => { if (n === 1) ac2.abort(); } });
  await assert.rejects(TR.translateTrack({ plan, sentences: src.sentences, words: src.words, targetLang: "es", translateLines: tr2, signal: ac2.signal }), (e) => e.code === "PROC_ABORTED");
  assert.equal(tr2.calls.length, 1);
  assert.ok(tr2.calls[0].hasSignal, "signal forwarded to translateLines");
});

t("ja target: Intl.Segmenter tokens, no joiner, script font; hi target renders with the Devanagari face; same language and unknown language", async () => {
  const src = makeSource(3);
  const plan = makePlan(src);
  const ja = await TR.translateTrack({ plan, sentences: src.sentences, words: src.words, targetLang: "ja", translateLines: fakeTranslator({ transform: () => "これは新しいエディターです。" }) });
  assert.deepEqual(TR.tokenize("これは新しいエディターです。", "ja").join(""), "これは新しいエディターです。");
  assert.ok(TR.tokenize("これは新しいエディターです。", "ja").length >= 3);
  for (const c of ja.cues) assert.ok(!c.text.includes(" "), `ja cue text has no spaces: ${c.text}`);
  const joined = [...tokensBySentence(ja.cues).values()][0].map((x) => x.w.text).join("");
  assert.equal(joined, "これは新しいエディターです。");
  const jaAss = buildAss({ cues: ja.cues, style: resolveStyle("bold_pop", { lang: "ja", aspect: "9:16", output: OUT }), output: OUT, lang: "ja" });
  assert.deepEqual(jaAss.fonts, ["NotoSansJP-Bold.ttf"]);

  const hi = await TR.translateTrack({ plan, sentences: src.sentences, words: src.words, targetLang: "Hindi", translateLines: fakeTranslator({ transform: () => "यह नया OK संपादक है।" }) });
  assert.equal(hi.lang, "hi");
  const hiAss = buildAss({ cues: hi.cues, style: resolveStyle("bold_pop", { lang: "hi", aspect: "9:16", output: OUT }), output: OUT, lang: "hi" });
  assert.deepEqual(hiAss.fonts, ["NotoSansDevanagari-Bold.ttf", "ArchivoBlack-Regular.ttf"]);
  assert.equal(hiAss.missingGlyphs.length, 0);

  const same = fakeTranslator();
  const en = await TR.translateTrack({ plan, sentences: src.sentences, words: src.words, targetLang: "en", translateLines: same });
  assert.equal(en.skipped, true); assert.equal(same.calls.length, 0);
  assert.equal(en.cues.length, plan.captions.cues.length);
  await assert.rejects(TR.translateTrack({ plan, targetLang: "xx", translateLines: same }), (e) => e.code === "INVALID_LANGUAGE");
});

t("readability: a translation longer than its kept time borrows silence after the sentence, never past the next sentence", async () => {
  const src = makeSource(4);
  const plan = makePlan(src);
  const long = (s) => `${s} ${s} ${s} ${s} ${s}`;
  const res = await TR.translateTrack({ plan, sentences: src.sentences, words: src.words, targetLang: "es", translateLines: fakeTranslator({ transform: long }) });
  const byS = tokensBySentence(res.cues);
  src.sentences.forEach((s, idx) => {
    const spans = spansOf(src, s.id);
    const end = spans[spans.length - 1].outOut;
    const next = idx + 1 < src.sentences.length ? src.words[src.sentences[idx + 1].w0].start : src.duration;
    const lastWord = byS.get(s.w0)[byS.get(s.w0).length - 1].w;
    assert.ok(lastWord.outEnd > end + FRAME, `${s.id} extended past its last word (${lastWord.outEnd} > ${end})`);
    assert.ok(lastWord.outEnd <= Math.min(next, end + 1.5) + FRAME + 1e-9, `${s.id} stops before the next sentence (${lastWord.outEnd} <= ${next})`);
  });
});

t("sentences fall back to words[i].sentenceId, then one unit per cue; insertions join their neighbour's sentence", async () => {
  const src = makeSource(5);
  const plan = makePlan(src);
  const c0 = plan.captions.cues[0];
  c0.words.splice(1, 0, { key: "ins_a", i: null, text: "really", srcStart: c0.words[0].srcEnd, srcEnd: c0.words[0].srcEnd + 0.1, outStart: c0.words[0].outEnd, outEnd: c0.words[0].outEnd + 0.1, emphasis: false, conf: 1 });
  const units = TR.sentenceUnits(plan, null, src.words, "en");
  assert.equal(units.length, 5);
  assert.ok(units[0].text.split(" ")[1] === "really", units[0].text);
  const noWords = TR.sentenceUnits(plan, null, null, "en");
  assert.equal(noWords.length, plan.captions.cues.length, "one unit per cue without sentence data");
  const tr = fakeTranslator();
  await TR.translateTrack({ plan, words: src.words, targetLang: "es", translateLines: tr });
  assert.equal(tr.calls[0].n, 5);
  assert.ok(!Object.keys(require.cache).some((k) => /services[\\/]translate\.js$/.test(k)), "the real translate service is never loaded when injected");
});

run().then(() => {
  restoreFetch();
  tmp.cleanup();
});
