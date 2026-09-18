// Tests for transcript structuring: analysis/transcript.js + analysis/lexicon/<lang>.js (ANALYSIS.md §5).
// Run: node scripts/video_edit_transcript.test.cjs   (pure; offline; fetch tripwire; < 2 s)
//
// Load-bearing assertions:
//  - PURE FILLERS per language match with elongation collapse ("ummmm…", "उम्म्म", "امممم", "えーーと") and never swallow a real
//    word that collapses to the same letters ("हम" = we, "ام" = or/mother); pause-bounded ones (es "este", pt "é") only between pauses.
//  - DISCOURSE FILLERS are candidates only when a ≥ 0.12 s pause touches them (or sentence-initial + comma): "I was like really
//    tired" keeps "like". Removing a real word is worse than keeping a filler.
//  - STUTTER / FALSE START / RETAKE ranges point at the copy to cut and the take to keep (director/build_plan.js consumes w0/w1/keptW0
//    and retake keep:'a'|'b').
//  - SENTENCE rules: terminal punctuation (not ellipses/abbreviations), pause ≥ 0.7 s once ≥ 4 words, 25-word cap, short-sentence merge.
//  - CTA patterns fire for hi / ar / ja (non-Latin scripts with no \b) as well as en.

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { createHarness, mkTmp, installFetchTripwire } = require("./lib/video_edit_test_utils.cjs");
const TR = require("../src/video_edit/analysis/transcript");

const { t, section, run } = createHarness();
const restoreFetch = installFetchTripwire();
const tmp = mkTmp("ve-transcript-");
const r3 = (x) => Math.round(x * 1000) / 1000;

// Word stream from a string: words separated by spaces, each 0.30 s long with 0.04 s gaps; a "+0.4" token adds 0.4 s to the next gap.
function stream(src, { dur = 0.3, gap = 0.04, conf = 0.95, t0 = 0.5 } = {}) {
  const words = [];
  let t = t0;
  let extra = 0;
  for (const tok of String(src).trim().split(/\s+/)) {
    const m = /^\+(\d+(?:\.\d+)?)$/.exec(tok);
    if (m) { extra += Number(m[1]); continue; }
    if (words.length) t += gap + extra;
    extra = 0;
    words.push({ text: tok, start: r3(t), end: r3(t + dur), conf });
    t += dur;
  }
  return words;
}

const S = (src, language = "en", opts) => TR.structureTranscript({ words: stream(src, opts), language });
const texts = (r, list) => list.map((c) => c.text);
const pureTexts = (r) => r.transcript.fillerCandidates.filter((c) => c.kind === "pure").map((c) => c.text);
const discourse = (r) => r.transcript.fillerCandidates.filter((c) => c.kind === "discourse").map((c) => [c.w0, c.w1, c.text]);
const spans = (r) => r.transcript.sentences.map((s) => [s.w0, s.w1]);

// ---------------------------------------------------------------- normalization
section("transcript.js — normalization");

t("normalizeToken strips punctuation, folds quotes / Arabic; collapseElongation shortens letter runs", () => {
  assert.strictEqual(TR.normalizeToken("Ummmm…", "en"), "ummmm");
  assert.strictEqual(TR.normalizeToken("It’s,", "en"), "it's");
  assert.strictEqual(TR.normalizeToken("\"Hello!\"", "en"), "hello");
  assert.strictEqual(TR.normalizeToken("e.g.", "en"), "e.g");
  assert.strictEqual(TR.normalizeToken("أهلاً", "ar"), "اهلا");
  assert.strictEqual(TR.normalizeToken("القناة.", "ar"), "القناه");
  assert.strictEqual(TR.collapseElongation("uhhh"), "uh");
  assert.strictEqual(TR.collapseElongation("उम्म्म"), "उम");
  assert.strictEqual(TR.collapseElongation("えーーと"), "えーと");
});

// ---------------------------------------------------------------- pure fillers
section("transcript.js — pure fillers");

t("en pure fillers incl. elongated 'ummmm…', 'uhhh'; real words that contain the letters are kept", () => {
  const r = S("So um I think uh this ummmm… works erm fine, uhhh, hmm.");
  assert.deepStrictEqual(pureTexts(r), ["um", "uh", "ummmm…", "erm", "uhhh,", "hmm."]);
  assert.strictEqual(r.discoveries.fillersFound, 6);
  const w = r.words;
  assert.ok([1, 4, 6, 8, 10, 11].every((i) => w[i].isFiller && w[i].fillerKind === "pure"), JSON.stringify(w.map((x) => [x.text, x.fillerKind])));
  assert.ok(!w[0].isFiller && !w[2].isFiller && w[0].fillerKind === null);
  const clean = S("Her umbrella was ahead of the summer crowd, mmhmm what a hum.");
  assert.deepStrictEqual(pureTexts(clean), []);
  assert.strictEqual(clean.discoveries.fillersFound, 0);
});

t("es 'este' and pt 'é' are fillers only when pause-bounded; es eh / o sea", () => {
  assert.deepStrictEqual(pureTexts(S("Quiero +0.2 este +0.2 mostrarles algo nuevo.", "es")), ["este"]);
  assert.deepStrictEqual(pureTexts(S("Quiero mostrarles este libro nuevo.", "es")), []);
  assert.deepStrictEqual(pureTexts(S("Pues eh no sé qué decir.", "es")), ["eh"]);
  assert.deepStrictEqual(discourse(S("Es caro +0.2 o sea +0.2 muy caro para nosotros.", "es")), [[2, 3, "o sea"]]);
  assert.deepStrictEqual(pureTexts(S("Isso +0.2 é +0.2 importante demais.", "pt")), ["é"]);
  assert.deepStrictEqual(pureTexts(S("Isso é importante demais.", "pt")), []);
  assert.deepStrictEqual(pureTexts(S("Então hã a gente ahn começou.", "pt")), ["hã", "ahn"]);
});

t("fr euh/heu/bah, de äh/ähm/hm", () => {
  assert.deepStrictEqual(pureTexts(S("Alors euh on commence heu maintenant bah voilà.", "fr")), ["euh", "heu", "bah"]);
  assert.deepStrictEqual(pureTexts(S("Also ähm wir fangen äh jetzt hm an.", "de")), ["ähm", "äh", "hm"]);
});

t("hi / ar / ja fillers with elongation; 'हम' (we) and 'ام' (or) are not fillers", () => {
  assert.deepStrictEqual(pureTexts(S("तो उम्म्म हम अं शुरू करते हैं।", "hi")), ["उम्म्म", "अं"]);
  assert.deepStrictEqual(pureTexts(S("हम हम्म्म यहाँ हैं।", "hi")), ["हम्म्म"]);
  assert.deepStrictEqual(pureTexts(S("امممم سنبدأ آه الآن ام غدا.", "ar")), ["امممم", "آه"]);
  assert.deepStrictEqual(pureTexts(S("えーーと 今日 は あのー 新しい 機能 を 紹介 します。", "ja")), ["えーーと", "あのー"]);
});

// ---------------------------------------------------------------- discourse fillers
section("transcript.js — discourse fillers (pause-bounded candidates only)");

t("'like' without a touching pause is a real word; with a ≥ 0.12 s pause before or after it is a candidate", () => {
  assert.deepStrictEqual(discourse(S("I was like really tired today.")), []);
  assert.deepStrictEqual(discourse(S("I was +0.2 like +0.2 really tired today.")), [[2, 2, "like"]]);
  assert.deepStrictEqual(discourse(S("I was +0.1 like really tired today.")), [[2, 2, "like"]]);
  assert.deepStrictEqual(discourse(S("I was like +0.1 really tired today.")), [[2, 2, "like"]]);
  assert.deepStrictEqual(discourse(S("I was +0.05 like really tired today.")), [], "0.09 s gap is below the 0.12 s pause");
  const r = S("I was +0.2 like +0.2 really tired today.");
  assert.strictEqual(r.words[2].fillerKind, "discourse");
  assert.strictEqual(r.discoveries.fillersFound, 0, "fillersFound counts pure fillers only");
});

t("multi-word 'you know'; sentence-initial 'So,' needs a comma or a pause after it", () => {
  assert.deepStrictEqual(discourse(S("The plan is +0.2 you know +0.2 pretty simple.")), [[3, 4, "you know"]]);
  assert.deepStrictEqual(discourse(S("So, we started early today.")), [[0, 0, "So,"]]);
  assert.deepStrictEqual(discourse(S("So we started early today.")), []);
  assert.deepStrictEqual(discourse(S("So +0.2 we started early today.")), [[0, 0, "So"]]);
  assert.deepStrictEqual(discourse(S("あの +0.2 これ は 大事 です。", "ja")), [[0, 0, "あの"]]);
  assert.deepStrictEqual(discourse(S("يعني +0.2 هذا مهم جدا.", "ar")), [[0, 0, "يعني"]]);
});

// ---------------------------------------------------------------- stutter / false start / retake
section("transcript.js — stutter, false start, retake");

const reps = (r) => r.transcript.repeatCandidates.map((c) => [c.kind, c.w0, c.w1, c.keptW0]);

t("stutter: immediate n-gram repeat (n ≤ 4) within 1.5 s → REPEAT cutting the first copy", () => {
  const r = S("And what we found was that the the onboarding flow was far too long.");
  assert.deepStrictEqual(reps(r), [["REPEAT", 6, 6, 7]]);
  assert.strictEqual(r.words[6].repeatOf, 7);
  assert.deepStrictEqual(reps(S("It's, it's honestly the biggest improvement.")), [["REPEAT", 0, 0, 1]]);
  assert.deepStrictEqual(reps(S("I think I think this works well.")), [["REPEAT", 0, 1, 2]]);
  assert.deepStrictEqual(reps(S("We cut the um the steps down.")), [["REPEAT", 2, 2, 4]], "repeat across a pure filler");
  assert.deepStrictEqual(reps(S("the +1.6 the plan works fine.")), [], "copies > 1.5 s apart");
  assert.deepStrictEqual(reps(S("This is very very good.")), [], "emphatic repeats are allowed");
  assert.deepStrictEqual(reps(S("Check this out. Out of the box it works.")), [], "never across a sentence end");
});

t("false start: ≤ 7-word fragment, pause ≥ 0.3 s, ≥ 60 % token LCS with what follows → FALSE_START", () => {
  assert.deepStrictEqual(reps(S("What we found was +0.4 what we found is that the flow was long.")), [["FALSE_START", 0, 3, 4]]);
  assert.deepStrictEqual(reps(S("What we found was +0.2 what we found is that the flow was long.")), [], "pause too short");
  assert.deepStrictEqual(reps(S("The main thing +0.4 our customers loved the new design.")), [], "low overlap");
  assert.deepStrictEqual(reps(S("We tried it. +0.4 We tried again and it worked.")), [], "a finished sentence is not a fragment");
  const long = S("When we first started building this product for teams +0.4 when we first started building it we were wrong.");
  assert.deepStrictEqual(reps(long), [], "fragment longer than 7 words");
  const mid = S("I told them +0.35 that the new plan +0.4 that our new plan is better.");
  assert.deepStrictEqual(reps(mid), [["FALSE_START", 3, 6, 7]], "fragment starts after the previous ≥ 0.3 s pause");
  // a 0.14 s gap does not delimit a fragment (7 words, LCS 4/7 < 0.6), but the exact 4-gram repeat is still cut as a stutter
  assert.deepStrictEqual(reps(S("I told them +0.1 that the new plan +0.4 that the new plan is better.")), [["REPEAT", 3, 6, 7]]);
});

const retakes = (r) => r.transcript.retakeCandidates.map((c) => [c.a, c.b, c.keep, c.w0, c.w1, c.keptW0]);

t("retake: Jaccard ≥ 0.6 / LCS ≥ 0.7 within 20 s keeps higher conf, then fewer fillers, then the later take", () => {
  const src = "The new onboarding flow takes four steps. +1.0 The new onboarding flow only takes four steps now.";
  const r = S(src);
  assert.deepStrictEqual(retakes(r), [["s1", "s2", "b", 0, 6, 7]]);
  assert.strictEqual(r.transcript.retakeCandidates[0].keepSentenceId, "s2");
  assert.ok(r.transcript.retakeCandidates[0].jaccard >= 0.6);

  const lowConfB = stream(src);
  for (let i = 7; i < lowConfB.length; i++) lowConfB[i].conf = 0.7;
  assert.deepStrictEqual(retakes(TR.structureTranscript({ words: lowConfB, language: "en" })), [["s1", "s2", "a", 7, 15, 0]]);

  const fillerInB = S("The new onboarding flow takes four steps. +1.0 The new um onboarding flow takes four steps.");
  assert.deepStrictEqual(retakes(fillerInB), [["s1", "s2", "a", 7, 14, 0]]);

  assert.deepStrictEqual(retakes(S("The new onboarding flow takes four steps. +21 The new onboarding flow only takes four steps now.")), [], "> 20 s apart");
  assert.deepStrictEqual(retakes(S("Our pricing is simple. +1.0 Our support team is great.")), [], "different sentences");
});

// ---------------------------------------------------------------- sentences
section("transcript.js — sentences");

t("split at . ? ! with sentence records (id, w0, w1, start, end, text, pauseAfter, fillerCount)", () => {
  const r = S("Hello there my friend. How are um you today? I am fine!");
  assert.deepStrictEqual(spans(r), [[0, 3], [4, 8], [9, 11]]);
  const [s1, s2] = r.transcript.sentences;
  assert.deepStrictEqual([s1.id, s1.text, s1.start, s1.end, s1.pauseAfter, s1.fillerCount], ["s1", "Hello there my friend.", 0.5, 1.82, 0.04, 0]);
  assert.strictEqual(s2.fillerCount, 1);
  assert.strictEqual(r.words[5].sentenceId, "s2");
  assert.strictEqual(r.transcript.sentences[2].pauseAfter, 0);
});

t("pause ≥ 0.7 s splits once the sentence has ≥ 4 words", () => {
  const r = S("we spent three months +0.8 testing it with real customers");
  assert.deepStrictEqual(spans(r), [[0, 3], [4, 8]]);
  assert.strictEqual(r.transcript.sentences[0].pauseAfter, 0.84);
  assert.deepStrictEqual(spans(S("we spent +0.8 three months testing it with customers")), [[0, 7]]);
  assert.deepStrictEqual(r.transcript.longPauses.map((p) => [p.afterWord, p.dur]), [[3, 0.84]]);
});

t("25-word cap splits at the best comma/pause in words 16–25", () => {
  const toks = Array.from({ length: 40 }, (_, k) => `word${k + 1}${k === 19 ? "," : ""}`);
  const r = S(toks.join(" "));
  assert.deepStrictEqual(spans(r), [[0, 19], [20, 39]]);
  const plain = S(Array.from({ length: 60 }, (_, k) => `word${k + 1}`).join(" "));
  assert.ok(plain.transcript.sentences.every((s) => s.w1 - s.w0 + 1 <= 25), JSON.stringify(spans(plain)));
  assert.deepStrictEqual(spans(plain), [[0, 24], [25, 49], [50, 59]]);
});

t("sentences < 3 words merge into the nearer neighbour unless isolated by ≥ 0.5 s pauses", () => {
  assert.deepStrictEqual(spans(S("Yes. The plan is ready now.")), [[0, 5]]);
  assert.deepStrictEqual(spans(S("Yes. +0.6 The plan is ready now.")), [[0, 0], [1, 5]]);
  assert.deepStrictEqual(spans(S("The plan is ready now. +0.6 Great. The team starts tomorrow morning.")), [[0, 4], [5, 10]]);
  assert.deepStrictEqual(spans(S("The plan is ready now. Great. +0.6 The team starts tomorrow morning.")), [[0, 5], [6, 10]]);
});

t("abbreviations, initials and ellipses do not end sentences; danda / ؟ / 。 do", () => {
  assert.deepStrictEqual(spans(S("Dr. Smith will join us today.")), [[0, 5]]);
  assert.deepStrictEqual(spans(S("Well... I think we should wait.")), [[0, 5]]);
  assert.deepStrictEqual(spans(S("We met J. Smith at the office.")), [[0, 6]]);
  assert.deepStrictEqual(spans(S("यह बहुत अच्छा है। अब हम शुरू करते हैं।", "hi")), [[0, 3], [4, 8]]);
  assert.deepStrictEqual(spans(S("هل جربت المنتج الجديد؟ لقد أعجبني كثيرا جدا.", "ar")), [[0, 3], [4, 7]]);
  const ja = S("今日 は 新しい 機能 を 紹介 します。 まず 画面 を 見て ください。", "ja");
  assert.deepStrictEqual(spans(ja), [[0, 6], [7, 11]]);
  assert.strictEqual(ja.transcript.sentences[0].text, "今日は新しい機能を紹介します。", "ja joins without spaces");
});

// ---------------------------------------------------------------- CTA
section("transcript.js — CTA patterns");

const ctas = (r) => r.transcript.ctaCandidates.map((c) => [c.sentenceId, c.pattern]);

t("CTA detection in hi / ar / ja (substring patterns on folded text) and en", () => {
  assert.deepStrictEqual(ctas(S("चैनल को सब्सक्राइब करें और बेल आइकन दबाएं।", "hi")), [["s1", "subscribe"]]);
  assert.deepStrictEqual(ctas(S("वीडियो पसंद आए तो शेयर करें।", "hi")), [["s1", "share"]]);
  assert.deepStrictEqual(ctas(S("please subscribe kar do yaar", "hi")), [["s1", "subscribe"]], "Hinglish");
  assert.deepStrictEqual(ctas(S("لا تنسوا الاشتراك في القناة.", "ar")), [["s1", "subscribe"]]);
  assert.deepStrictEqual(ctas(S("تابعونا على انستغرام للمزيد.", "ar")), [["s1", "follow"]]);
  assert.deepStrictEqual(ctas(S("チャンネル 登録 お願い します。", "ja")), [["s1", "subscribe"]]);
  assert.deepStrictEqual(ctas(S("詳しく は 概要欄 を 見て ください。", "ja")), [["s1", "link_in_bio"]]);
  assert.deepStrictEqual(ctas(S("This was a quick demo of the product. Link in bio for the full guide.")), [["s2", "link_in_bio"]]);
  assert.deepStrictEqual(ctas(S("Suscríbete al canal para más videos.", "es")), [["s1", "subscribe"]]);
  assert.deepStrictEqual(ctas(S("We follow the recipe and link ideas together.")), []);
  assert.strictEqual(TR.matchCta("smash that like button", "en"), "like");
  assert.strictEqual(TR.matchCta("قم بزيارة موقعنا", "ar"), null, "raw (unfolded) text is not matched; callers pass normalized text");
});

// ---------------------------------------------------------------- integration
section("transcript.js — determinism and stage I/O");

t("probe ground-truth phrases: um/uh fillers, 'the the' and 'It's, it's' repeats", () => {
  const truthFile = path.join(__dirname, "..", "test-fixtures", "video_edit", "probe", "ground_truth.json");
  const timeline = fs.existsSync(truthFile)
    ? JSON.parse(fs.readFileSync(truthFile, "utf8")).en.timeline.filter((p) => p.type === "speech")
    : [{ text: "And what we found was that the the onboarding flow was far too long.", expectedSpeechOnsetSec: 0, expectedSpeechOffsetSec: 4 },
      { text: "Uh...", expectedSpeechOnsetSec: 4.2, expectedSpeechOffsetSec: 5 }];
  const words = [];
  for (const p of timeline) {
    const toks = p.text.split(/\s+/);
    const step = (p.expectedSpeechOffsetSec - p.expectedSpeechOnsetSec) / toks.length;
    toks.forEach((tok, k) => words.push({ text: tok, start: r3(p.expectedSpeechOnsetSec + k * step), end: r3(p.expectedSpeechOnsetSec + (k + 0.85) * step) }));
  }
  const r = TR.structureTranscript({ words, language: "en" });
  const fillers = pureTexts(r);
  assert.ok(fillers.includes("Uh..."), JSON.stringify(fillers));
  if (timeline.length > 2) {
    assert.deepStrictEqual(fillers, ["Um...", "Uh...", "Um,"]);
    const repeated = r.transcript.repeatCandidates.filter((c) => c.kind === "REPEAT").map((c) => words[c.w0].text);
    assert.deepStrictEqual(repeated, ["the", "It's,"]);
  }
});

t("structureTranscript is deterministic and tolerates island-chat words ({w}) and bad rows", () => {
  const words = stream("So um the the plan is +0.4 the plan is simple. Subscribe for more.");
  const a = TR.structureTranscript({ words, language: "en" });
  const b = TR.structureTranscript({ words: JSON.parse(JSON.stringify(words)), language: "en" });
  assert.strictEqual(JSON.stringify(a), JSON.stringify(b));
  const island = TR.structureTranscript({ words: [{ w: "um", start: 0, end: 0.3 }, { w: "hello", start: 0.4, end: 0.8 }, { text: "bad", start: "x" }, null], language: "en-GB" });
  assert.deepStrictEqual(island.words.map((w) => [w.i, w.text, w.norm, w.isFiller, w.speaker]), [[0, "um", "um", true, "S1"], [1, "hello", "hello", false, "S1"]]);
  assert.strictEqual(island.transcript.language, "en");
  const empty = TR.structureTranscript({ words: [], language: "xx" });
  assert.deepStrictEqual([empty.transcript.sentences.length, empty.discoveries.fillersFound], [0, 0]);
});

t("analyzeTranscript reads transcript.words.json and writes analysis/transcript.json (timing + structured words)", () => {
  const dir = fs.mkdtempSync(path.join(tmp.dir, "proj-"));
  assert.throws(() => TR.analyzeTranscript({ projectDir: dir }), (e) => e.code === "TRANSCRIPT_WORDS_MISSING" && e.errorClass === "resource");
  fs.mkdirSync(path.join(dir, "analysis"));
  const words = stream("Um so this is the plan. Subscribe for more.");
  fs.writeFileSync(path.join(dir, TR.WORDS_REL), JSON.stringify({ language: "en", languageSource: "detected", timing: "approx", engines: ["islands"], words }));
  const r = TR.analyzeTranscript({ projectDir: dir });
  assert.deepStrictEqual(r.outputs, { transcript: { path: "analysis/transcript.json" } });
  const doc = JSON.parse(fs.readFileSync(path.join(dir, TR.TRANSCRIPT_REL), "utf8"));
  for (const k of ["language", "sentences", "fillerCandidates", "repeatCandidates", "retakeCandidates", "ctaCandidates", "timing", "words"]) {
    assert.ok(Object.prototype.hasOwnProperty.call(doc, k), `transcript.json has ${k}`);
  }
  assert.strictEqual(doc.timing, "approx");
  assert.deepStrictEqual(r.discoveries, { fillersFound: 1 });
  assert.deepStrictEqual(ctas({ transcript: doc }), [["s2", "subscribe"]]);
  assert.ok(doc.words.every((w) => typeof w.sentenceId === "string"));
  assert.ok(!fs.readdirSync(path.join(dir, "analysis")).some((n) => n.includes(".tmp")), "no temp files left");
});

run().finally(() => { restoreFetch(); tmp.cleanup(); });
