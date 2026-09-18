// Tests for island word alignment and syllable counters: analysis/word_timing.js + analysis/syllables/<lang>.js (ANALYSIS.md §4.4).
// Run: node scripts/video_edit_alignment.test.cjs   (offline; fetch tripwire; the real-speech cases need test-fixtures/video_edit/probe)
//
// Load-bearing assertions:
//  - REAL SPEECH: aligning the probe's ground-truth phrase words to the islands analysis/audio.js finds puts every phrase's first
//    word within a median 150 ms of its measured onset (en and es). This is the accuracy the islands fallback promises
//    (`timing:'approx'`), and what cut padding for approx timing is sized against.
//  - PAUSE FORCING: every pause dip ≥ 150 ms inside an aligned span has a word boundary within ±250 ms, so no word straddles a pause.
//  - The DP beats the syllable prior when the prior is wrong (boundaries land on the pauses), and never fails when the duration
//    constraints are infeasible (elongated fillers).
//  - conf is monotone non-increasing in |Δ| between the prior and the snapped boundary (×0.6 without a dip).
//  - Syllable counters return the right count on sample words for all 8 languages and never 0.

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { createHarness, installFetchTripwire } = require("./lib/video_edit_test_utils.cjs");
const dsp = require("../src/video_edit/analysis/dsp");
const A = require("../src/video_edit/analysis/audio");
const WT = require("../src/video_edit/analysis/word_timing");

const { t, section, run } = createHarness();
const restoreFetch = installFetchTripwire();
const PROBE_DIR = path.join(__dirname, "..", "test-fixtures", "video_edit", "probe");
const HOP = 0.01;
const near = (actual, expected, tol, what) => assert.ok(Math.abs(actual - expected) <= tol, `${what}: ${actual} not within ±${tol} of ${expected}`);
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };

// Envelope (dB per 10 ms) at `floor` with [start, end, dB] segments painted on top.
function envFrom(segments, durSec, floor = -80) {
  const env = new Float32Array(Math.round(durSec / HOP)).fill(floor);
  for (const [a, b, db] of segments) for (let i = Math.round(a / HOP); i < Math.round(b / HOP); i++) env[i] = db;
  return env;
}

// ---------------------------------------------------------------- syllables
section("syllables/<lang>.js — counters");

const SAMPLES = {
  en: { make: 1, table: 2, walked: 1, wanted: 2, boxes: 2, pages: 2, ummmm: 1, uhhh: 1, beautiful: 3, onboarding: 3, customers: 3, honestly: 3, minutes: 2, through: 1, subscribe: 2 },
  es: { "día": 2, hola: 2, que: 1, ciudad: 2, resultados: 4, "esperábamos": 5, guerra: 2, servicio: 3, "país": 2, "ahí": 2, muy: 1, reales: 3 },
  pt: { "saída": 3, "não": 1, "coração": 3, "então": 2, obrigado: 4, pessoas: 3 },
  fr: { bonjour: 2, merci: 2, eau: 1, "téléphone": 3, euh: 1, oiseau: 2, "aujourd'hui": 3 },
  de: { feuer: 2, theater: 3, "häuser": 2, bier: 1, "ähm": 1, schmetterling: 3, entschuldigung: 4, kaffee: 2 },
  hi: { "नमस्ते": 3, "कमल": 2, "भारत": 2, "हम्म": 1, "उम्म": 1, "किताब": 2, matlab: 2 },
  ar: { "مرحبا": 3, "شكرا": 2, "كتاب": 2, "اممم": 1, "آه": 1 },
  ja: { "ありがとう": 5, "えーと": 3, "えーーーと": 3, "東京": 4, "チャンネル": 4 },
};

t("syllable counters per language on sample words", () => {
  const wrong = [];
  for (const [lang, words] of Object.entries(SAMPLES)) {
    for (const [w, n] of Object.entries(words)) {
      const got = WT.syllableCount(w, lang);
      if (got !== n) wrong.push(`${lang}:${w}=${got} (want ${n})`);
    }
  }
  assert.deepStrictEqual(wrong, []);
});

t("spoken forms (sp) drive digits and kanji; unknown / regional languages fall back; never 0", () => {
  assert.strictEqual(WT.syllableCount("12", "en", { sp: "twelve" }), 1);
  assert.strictEqual(WT.syllableCount("2026", "en", { sp: "twenty twenty-six" }), 5);
  assert.strictEqual(WT.syllableCount("今日", "ja", { sp: "きょう" }), 2);
  assert.strictEqual(WT.syllableCount("学校", "ja", { sp: "がっこう" }), 4);
  assert.strictEqual(WT.syllableCount("wonderful", "xx"), 3);
  assert.strictEqual(WT.syllableCount("wonderful", "en-US"), 3);
  assert.strictEqual(WT.syllableCount("resultados", "es-MX"), 4);
  assert.deepStrictEqual(Object.keys(WT.SYLLABLE_COUNTERS).sort(), ["ar", "de", "en", "es", "fr", "hi", "ja", "pt"]);
  for (const lang of Object.keys(WT.SYLLABLE_COUNTERS)) {
    for (const w of ["", "—", "!!!", "x", "42"]) assert.ok(WT.syllableCount(w, lang) >= 1, `${lang} "${w}" must count ≥ 1`);
  }
});

t("word weights: syllables × filler 1.8 × trailing punctuation 1.3 × cut-off 0.6", () => {
  near(WT.wordWeight({ w: "Um...", filler: true }, "en").weight, 2.34, 1e-9, "filler + ellipsis");
  near(WT.wordWeight({ w: "plan." }, "en").weight, 1.3, 1e-9, "punctuation");
  near(WT.wordWeight({ text: "minutes," }, "en").weight, 2.6, 1e-9, "comma");
  near(WT.wordWeight({ w: "onboarding" }, "en").weight, 3, 1e-9, "plain");
  near(WT.wordWeight({ w: "prod", cut: true }, "en").weight, 0.6, 1e-9, "cut-off");
  near(WT.wordWeight({ text: "um", isFiller: true }, "en").weight, 1.8, 1e-9, "isFiller alias");
});

// ---------------------------------------------------------------- confidence
section("word_timing.js — confidence");

t("boundary conf is monotone non-increasing in |Δ|, symmetric, 0 at ≥ 3σ, × 0.6 without a dip, scaled by island conf", () => {
  for (const sigma of [0.08, 0.14, 0.35]) {
    let prev = Infinity;
    for (let k = 0; k <= 60; k++) {
      const d = (k / 60) * 4 * sigma;
      const c = WT.boundaryConf(d, sigma, { islandConf: 0.9 });
      assert.ok(c <= prev + 1e-12, `σ=${sigma} Δ=${d}: ${c} > ${prev}`);
      prev = c;
      assert.strictEqual(WT.boundaryConf(-d, sigma, { islandConf: 0.9 }), c);
      near(WT.boundaryConf(d, sigma, { hasDip: false, islandConf: 0.9 }), c * 0.6, 1e-12, "no-dip factor");
      assert.ok(c >= 0 && c <= 0.9);
    }
    near(WT.boundaryConf(0, sigma, { islandConf: 0.9 }), 0.9, 1e-12, "Δ = 0 keeps the island conf");
    near(WT.boundaryConf(1.5 * sigma, sigma), 0.5, 1e-9, "half at 1.5σ");
    assert.strictEqual(WT.boundaryConf(3 * sigma, sigma), 0);
    assert.strictEqual(WT.boundaryConf(10 * sigma, sigma), 0);
  }
});

t("end to end: the word conf falls as the real pause moves away from the syllable prior", () => {
  let prev = Infinity;
  for (const d of [0, 0.1, 0.2, 0.3, 0.4]) {
    const c = 1.0 + d;                                                  // prior boundary at 1.0 s (two 2-syllable words over 0–2 s)
    const env = envFrom([[0, 2, -20], [c - 0.1, c + 0.1, -80]], 2.5);
    const out = WT.alignIsland({ words: [{ w: "alpha" }, { w: "gamma" }], start: 0, end: 2, env, floorDb: -80, speechDb: -20, conf: 0.9 });
    near(out[0].end, c - 0.1, 0.02, `d=${d} boundary snapped to the pause start`);
    near(out[1].start, c + 0.1, 0.02, `d=${d} next word starts at the pause end`);
    assert.ok(out[0].conf <= prev + 1e-9, `d=${d}: conf ${out[0].conf} rose above ${prev}`);
    prev = out[0].conf;
  }
  assert.ok(prev < 0.9 * 0.75, `conf at 400 ms drift is clearly reduced (${prev})`);
});

// ---------------------------------------------------------------- DP on synthetic envelopes
section("word_timing.js — dips and DP");

t("findDips: pause runs (below max(floor + 6, speech − 30) for ≥ 60 ms) vs plain dips (≥ 4 dB, < speech − 3)", () => {
  const env = envFrom([[0, 3, -20], [1.0, 1.3, -80]], 3);
  for (let k = -10; k <= 10; k++) env[200 + k] = -20 - 12 * (1 - Math.abs(k) / 10);   // V dip to −32 dB at 2.0 s
  env[250] = -22;                                                                    // 2 dB ripple: not a dip
  const dips = WT.findDips(env, 0.1, 2.9, { floorDb: -80, speechDb: -20 });
  const pauses = dips.filter((d) => d.pause);
  const plain = dips.filter((d) => !d.pause);
  assert.strictEqual(pauses.length, 1, JSON.stringify(dips));
  near(pauses[0].start, 1.0, 0.011, "pause start");
  near(pauses[0].end, 1.3, 0.011, "pause end");
  assert.ok(pauses[0].dur >= 0.28 && pauses[0].depth > 40, JSON.stringify(pauses[0]));
  assert.strictEqual(plain.length, 1, JSON.stringify(plain));
  near(plain[0].t, 2.005, 0.011, "plain dip time");
  assert.ok(plain[0].depth >= 4);
  const tooShort = envFrom([[0, 3, -20], [1.0, 1.04, -80]], 3);
  assert.strictEqual(WT.findDips(tooShort, 0.1, 2.9, { floorDb: -80, speechDb: -20 }).filter((d) => d.pause).length, 0, "40 ms is not a pause");
  // a gated breath 40 dB under speech with a digital-silence floor: a pause only with the speech-relative clamp
  const breath = envFrom([[0, 3, -20], [1.0, 1.3, -60]], 3);
  assert.strictEqual(WT.findDips(breath, 0.1, 2.9, { floorDb: -100, speechDb: -20 }).filter((d) => d.pause).length, 1);
  assert.strictEqual(WT.findDips(breath, 0.1, 2.9, { floorDb: -100, speechDb: -20, pauseBelowSpeechDb: null }).filter((d) => d.pause).length, 0);
});

t("the DP snaps boundaries to pauses the syllable prior misses (hello | wonderful | world)", () => {
  // prior (2:3:1 syllables over 0.3–3.1 s) puts boundaries at 1.23 / 2.63 s; the pauses are at 0.9–1.2 and 1.8–2.1 s
  const env = envFrom([[0.3, 0.9, -20], [1.2, 1.8, -20], [2.1, 3.1, -20]], 3.5);
  const out = WT.alignIsland({ words: [{ w: "hello" }, { w: "wonderful" }, { w: "world" }], start: 0.2, end: 3.3, env, floorDb: -80, speechDb: -20, conf: 0.9 });
  assert.deepStrictEqual(out.map((w) => w.text), ["hello", "wonderful", "world"]);
  [[0.3, 0.9], [1.2, 1.8], [2.1, 3.1]].forEach(([s, e], k) => {
    near(out[k].start, s, 0.02, `${out[k].text} start`);
    near(out[k].end, e, 0.02, `${out[k].text} end`);
  });
  assert.deepStrictEqual(out.map((w) => [w.snap.startDip, w.snap.endDip]), [["edge", "pause"], ["pause", "pause"], ["pause", "edge"]]);
  assert.deepStrictEqual(out.map((w) => w.syll), [2, 3, 1]);
  assert.ok(out.every((w) => w.conf > 0 && w.conf <= 0.9), JSON.stringify(out.map((w) => w.conf)));
});

t("infeasible duration constraints relax instead of failing; empty and single-word islands", () => {
  const env = envFrom([[0, 3.6, -20]], 4);
  const out = WT.alignIsland({ words: [{ w: "ummmm", filler: true }, { w: "ok" }], start: 0, end: 3.6, env, floorDb: -80, speechDb: -20 });
  assert.strictEqual(out.length, 2);
  assert.strictEqual(out[0].start, 0);
  assert.strictEqual(out[1].end, 3.6);
  assert.ok(out[0].end > out[0].start && out[0].end <= out[1].start && out[1].end > out[1].start, JSON.stringify(out));
  assert.deepStrictEqual(WT.alignIsland({ words: [], start: 0, end: 1, env, floorDb: -80, speechDb: -20 }), []);
  const one = WT.alignIsland({ words: [{ w: "hi", sp: "hi" }], start: 0, end: 3.6, env: envFrom([[0.5, 1.0, -20]], 4), floorDb: -80, speechDb: -20 });
  near(one[0].start, 0.5, 0.011, "single word starts at voiced onset");
  near(one[0].end, 1.0, 0.011, "single word ends at voiced offset");
  assert.strictEqual(one[0].sp, "hi", "input fields are kept");
  const noEnv = WT.alignIsland({ words: [{ w: "a" }, { w: "b" }], start: 1, end: 2, env: null, floorDb: null, speechDb: null });
  assert.deepStrictEqual(noEnv.map((w) => [w.start, w.end]), [[1, 1.5], [1.5, 2]]);
});

t("alignIslands flattens islands in order; refineEdges (word engines) extends into voiced energy, clamps, min 40 ms", () => {
  const env = envFrom([[1.0, 2.0, -20], [2.05, 2.5, -20]], 3);
  const flat = WT.alignIslands([{ start: 0.9, end: 2.05, words: [{ w: "alpha" }] }, { start: 2.0, end: 2.6, words: [{ w: "beta" }], conf: 0.5 }], env, { floorDb: -80, speechDb: -20 });
  assert.deepStrictEqual(flat.map((w) => w.text), ["alpha", "beta"]);
  assert.ok(flat[1].conf <= 0.5);
  const words = [{ text: "alpha", start: 1.1, end: 1.8 }, { text: "beta", start: 2.1, end: 2.3 }, { text: "gamma", start: 2.7, end: 2.7 }];
  const out = WT.refineEdges(words, env, { floorDb: -80, speechDb: -20 });
  near(out[0].start, 1.0, 0.011, "start extends backward ≤ 120 ms while RMS > floor + 10");
  near(out[0].end, 1.95, 0.011, "end extends forward ≤ 150 ms");
  near(out[1].start, 2.05, 0.011, "second word start");
  assert.ok(out[1].start >= out[0].end, "clamped to the previous word");
  near(out[2].end - out[2].start, 0.04, 1e-9, "zero-length word gets the 40 ms minimum");
  assert.strictEqual(words[0].start, 1.1, "input not mutated");
});

// ---------------------------------------------------------------- real speech
section("word_timing.js — real speech probe (DP alignment with ground-truth phrase words)");

const TRUTH = path.join(PROBE_DIR, "ground_truth.json");
const FILLERS = new Set(["um", "uh"]);

// Alignment spans: the islands a phrase overlaps (phrases straddling a split are merged), then optionally merged across short gaps.
function spansFor(islands, phrases, { mergeGapSec = 0 } = {}) {
  const spans = [];
  for (const p of phrases) {
    const hit = islands.filter((s) => s.end > p.expectedSpeechOnsetSec && s.start < p.expectedSpeechOffsetSec - 0.05);
    assert.ok(hit.length, `phrase ${p.id} has no island`);
    const span = { start: Math.min(...hit.map((h) => h.start)), end: Math.max(...hit.map((h) => h.end)), phrases: [p] };
    const last = spans[spans.length - 1];
    if (last && span.start <= last.end + mergeGapSec + 1e-9) { last.end = Math.max(last.end, span.end); last.phrases.push(p); }
    else spans.push(span);
  }
  return spans;
}

function alignProbe(file, lang, { mergeGapSec = 0 } = {}) {
  const pcm = dsp.readWav(path.join(PROBE_DIR, file));
  const a = A.analyzePcm(pcm);
  const env = a.features.rmsDb;
  const phrases = JSON.parse(fs.readFileSync(TRUTH, "utf8"))[lang].timeline.filter((x) => x.type === "speech");
  const spans = spansFor(a.islands, phrases, { mergeGapSec });
  const errors = [];
  const aligned = [];
  const started = Date.now();
  for (const span of spans) {
    const words = [];
    const firsts = [];
    for (const p of span.phrases) {
      firsts.push({ id: p.id, idx: words.length, onset: p.expectedSpeechOnsetSec });
      for (const tok of p.text.split(/\s+/)) words.push({ w: tok, filler: FILLERS.has(tok.toLowerCase().replace(/[^a-z]/g, "")) });
    }
    const out = WT.alignIsland({ words, start: span.start, end: span.end, env, floorDb: a.floorDb, speechDb: a.speechDb, thresholdDb: a.thresholdDb, lang, conf: 0.9 });
    for (const f of firsts) errors.push({ id: f.id, err: out[f.idx].start - f.onset });
    aligned.push({ span, out });
  }
  return { a, env, errors, aligned, ms: Date.now() - started };
}

const report = (errors) => errors.map((e) => `${e.id}:${Math.round(e.err * 1000)}ms`).join(" ");

if (fs.existsSync(TRUTH) && fs.existsSync(path.join(PROBE_DIR, "speech.wav"))) {
  t("probe speech.wav (en, 38 s, fillers): median first-word onset error ≤ 150 ms", () => {
    const r = alignProbe("speech.wav", "en");
    const abs = r.errors.map((e) => Math.abs(e.err));
    assert.strictEqual(r.errors.length, 9);
    assert.ok(median(abs) <= 0.15, `median ${median(abs)} — ${report(r.errors)}`);
    assert.ok(abs.filter((x) => x <= 0.15).length >= 7, `most phrases within 150 ms — ${report(r.errors)}`);
    assert.ok(r.ms < 1000, `alignment took ${r.ms} ms`);
    for (const { out } of r.aligned) {
      for (let k = 0; k < out.length; k++) {
        assert.ok(out[k].end > out[k].start, `word ${out[k].text} has positive duration`);
        if (k) assert.ok(out[k].start >= out[k - 1].end - 1e-9, `words overlap at ${out[k].text}`);
        assert.ok(out[k].conf >= 0 && out[k].conf <= 0.9);
      }
    }
  });

  if (fs.existsSync(path.join(PROBE_DIR, "speech_es.wav")) && JSON.parse(fs.readFileSync(TRUTH, "utf8")).es) {
    t("probe speech_es.wav (es, digital-silence floor): median first-word onset error ≤ 150 ms", () => {
      const r = alignProbe("speech_es.wav", "es");
      const abs = r.errors.map((e) => Math.abs(e.err));
      assert.strictEqual(r.errors.length, 3);
      assert.ok(median(abs) <= 0.15, `median ${median(abs)} — ${report(r.errors)}`);
    });
  }

  // A boundary snapped onto a pause sits at the pause (the words end/start at its edges, which for a 600 ms pause are > 250 ms from
  // its centre), so the property is stated the way the DP encodes it: no word straddles a long pause by more than 250 ms each side.
  t("probe spans merged across short gaps: every ≥ 150 ms pause dip has a word boundary within ±250 ms", () => {
    const r = alignProbe("speech.wav", "en", { mergeGapSec: 0.5 });
    assert.ok(r.aligned.length < 9, "spans really were merged");
    let checked = 0;
    for (const { out } of r.aligned) {
      const vs = out[0].start, ve = out[out.length - 1].end;
      const pauses = WT.findDips(r.env, vs + 0.02, ve - 0.02, { floorDb: r.a.floorDb, speechDb: r.a.speechDb }).filter((d) => d.pause && d.dur >= 0.15 - 1e-9);
      for (const p of pauses) {
        checked++;
        const straddler = out.find((w) => w.start < p.t - 0.25 - 1e-9 && w.end > p.t + 0.25 + 1e-9);
        assert.ok(!straddler, `pause ${p.start}–${p.end} is inside word "${straddler && straddler.text}" ${straddler && [straddler.start, straddler.end]}`);
        assert.ok(out.some((w) => Math.abs(w.end - p.start) <= 0.25 + 1e-9 || Math.abs(w.start - p.end) <= 0.25 + 1e-9), `no word edge near pause ${p.start}–${p.end}`);
      }
      for (let k = 1; k < out.length; k++) assert.ok(out[k].start >= out[k - 1].end - 1e-9, `overlap at ${out[k].text}`);
    }
    assert.ok(checked >= 3, `probe spans contain long pauses (${checked})`);
  });
} else {
  t("probe alignment (SKIPPED: test-fixtures/video_edit/probe missing)", () => {});
}

run().finally(() => { restoreFetch(); });
