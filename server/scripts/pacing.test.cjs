// Unit tests for the pacing engine (src/services/pacing.js).
// Run: node scripts/pacing.test.cjs   (npm run test:pacing)
//
// The load-bearing assertion is IDENTITY: at `normal`, the MODE contributes
// nothing — every factor is 1, every prompt directive is empty, and scaleTiming()
// returns a table equal to the one it was given. That is what makes "picking no
// pace changes nothing" enforceable rather than aspirational — if anyone retunes
// the normal row, this test fails and they have to mean it.
//
// NOTE what identity does NOT cover, since it used to and the distinction now
// matters: the WORD BUDGET. It was `duration x rate x density` at every mode,
// which is a model with no term for what an utterance costs before its first
// word, and correcting it moved `normal` too. That correction is not the mode
// asserting itself at the default — the mode still asserts nothing — it is the
// shared model getting less wrong, and it reaches the default-pace prompt
// (system_script.md) as well. Default-pace films were the worst overshooters in
// the shipped data, so leaving them on the broken model to preserve a byte
// comparison would have been preserving the bug.
//
// The second load-bearing assertion is READABILITY: no mode, at any duration,
// may produce a floor below the readable minimum. That is precedence rule 1, and
// it is the rule a "make it faster" change is most likely to quietly break.

const assert = require("node:assert");
const P = require("../src/services/pacing");
const { TIMING } = require("../src/services/motion_presets");

let passed = 0;
function t(name, fn) {
  try { fn(); passed++; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`  FAIL ${name}\n       ${e.message}`); process.exitCode = 1; }
}

console.log("\npacing — mode resolution");

t("every mode key resolves to itself", () => {
  for (const k of Object.keys(P.MODES)) assert.equal(P.normalizeMode(k), k);
});

t("aliases, labels, and bare multipliers resolve", () => {
  assert.equal(P.normalizeMode("Very Fast"), "very-fast");
  assert.equal(P.normalizeMode("veryfast"), "very-fast");
  assert.equal(P.normalizeMode("1.5"), "very-fast");
  assert.equal(P.normalizeMode("1.5x"), "very-fast");
  assert.equal(P.normalizeMode(1.25), "fast");
  assert.equal(P.normalizeMode("SLOW"), "relaxed");
  assert.equal(P.normalizeMode("0.8"), "relaxed");
  assert.equal(P.normalizeMode(1), "normal");
});

t("absent and invalid are distinguishable (null, so a route can 400)", () => {
  assert.equal(P.normalizeMode(null), null);
  assert.equal(P.normalizeMode(""), null);
  assert.equal(P.normalizeMode("turbo"), null);
  assert.equal(P.normalizeMode("2.0"), null);   // not a mode we offer
});

t("resolve() is idempotent — a resolved object re-resolves to itself", () => {
  const a = P.resolve("fast", { durationSec: 60 });
  assert.strictEqual(P.resolve(a), a);
  const b = P.resolve(a, { durationSec: 60 });
  assert.deepEqual(b, a);
});

t("an unknown mode falls back to the default rather than throwing", () => {
  assert.equal(P.resolve("turbo", { durationSec: 30 }).mode, "normal");
  assert.equal(P.resolve(undefined, { durationSec: 30 }).mode, "normal");
});

console.log("\npacing — IDENTITY at normal (the no-regression contract)");

t("normal keeps the pre-pacing scene DENSITY (~one scene per 3.5s)", () => {
  const p = P.resolve("normal", { durationSec: 60 });
  assert.equal(p.multiplier, 1);
  // Density, not a literal. targetSec is re-derived from the scene COUNT so the
  // two always multiply out to the runtime (17 x 3.53 = 60.0, where 17 x 3.5
  // would be 59.5 — an advertised plan that does not add up to its own film).
  // The authored 3.5 from system_script.md is what the count is derived FROM, so
  // it survives as the density even though the derived length rounds off it.
  assert.equal(p.scene.count, Math.round(60 / P.SCENE_BASE_SEC));
  assert.ok(Math.abs(p.scene.targetSec - P.SCENE_BASE_SEC) < 0.1,
    `${p.scene.targetSec}s is not ~${P.SCENE_BASE_SEC}s`);
});

t("scene count x target always equals the runtime, at every mode and length", () => {
  // The invariant the density test above rests on, and the one that broke when
  // targetSec was re-derived only in the capped case: the scene count is clamped
  // at BOTH ends, and the floor of 2 bites on a 5s film.
  for (const d of [5, 8, 10, 15, 20, 30, 60, 120, 240, 300, 600]) {
    for (const m of Object.keys(P.MODES)) {
      const p = P.resolve(m, { durationSec: d });
      assert.ok(Math.abs(p.scene.count * p.scene.targetSec - d) / d < 0.02,
        `${m}@${d}s advertises ${p.scene.count} x ${p.scene.targetSec}s = ${(p.scene.count * p.scene.targetSec).toFixed(1)}s`);
    }
  }
});

t("normal keeps the pre-pacing VO tail (0.55s, pipeline.js VO_TAIL)", () => {
  assert.equal(P.resolve("normal", { durationSec: 60 }).vo.tailSec, 0.55);
});

t("normal keeps the pre-pacing storyboard split bar (8.5s, expandToCover)", () => {
  assert.equal(P.resolve("normal", { durationSec: 600 }).scene.storyboardPaceSec, 8.5);
});

t("normal keeps the pre-pacing speech rate (2.6 w/s, script.js WORDS_PER_SEC)", () => {
  assert.equal(P.resolve("normal", { durationSec: 60 }).speechRate, 2.6);
  assert.equal(P.BASE_SPEECH_RATE, 2.6);
});

t("scaleTiming at normal returns a table EQUAL to the shared one", () => {
  const scaled = P.scaleTiming(TIMING, P.resolve("normal", { durationSec: 60 }));
  assert.deepEqual(scaled, TIMING, "normal must not perturb a single motion value");
});

t("scaleTiming never mutates the shared table (two jobs render concurrently)", () => {
  const before = JSON.stringify(TIMING);
  P.scaleTiming(TIMING, P.resolve("very-fast", { durationSec: 60 }));
  assert.equal(JSON.stringify(TIMING), before, "the module-level TIMING was mutated");
});

t("EVERY prompt directive is EMPTY at normal (prompts stay byte-identical)", () => {
  const p = P.resolve("normal", { durationSec: 60 });
  // All three, together: audioDirection originally guarded only on `!pacing`,
  // so a default-pace film still had a "steady, 90-120 BPM" paragraph appended
  // to its audio prompt. Asserting them as a group is what stops the next
  // directive being added with the same omission.
  assert.equal(P.scriptDirective(p), "", "scriptDirective");
  assert.equal(P.shortDirective(p), "", "shortDirective");
  assert.equal(P.audioDirection(p), "", "audioDirection");
});

t("every directive is NON-empty at every other mode (they must actually do something)", () => {
  for (const m of Object.keys(P.MODES)) {
    if (m === P.DEFAULT_MODE) continue;
    const p = P.resolve(m, { durationSec: 60 });
    assert.ok(P.scriptDirective(p).length > 0, `${m} scriptDirective`);
    assert.ok(P.shortDirective(p).length > 0, `${m} shortDirective`);
    assert.ok(P.audioDirection(p).length > 0, `${m} audioDirection`);
  }
});

console.log("\npacing — the storyboard attachment cannot leak into a prompt");

t("setPaceOnStoryboard is readable in-process but invisible to JSON", () => {
  const p = P.resolve("fast", { durationSec: 30 });
  const sb = { title: "T", durationSec: 30, scenes: [{ id: "s1", duration: 5 }] };
  const before = JSON.stringify(sb);
  P.setPaceOnStoryboard(sb, p, P.tempoForPacing(p));
  // Readable by the composers that need it...
  assert.equal(sb.paceConfig.mode, "fast");
  assert.equal(P.tempoOf(sb).motion, P.tempoForPacing(p).motion);
  // ...and invisible to every serializer. services/composer.js dumps the whole
  // storyboard into the premium composition prompt, so a plain assignment sent
  // ~1.3KB of config to a model that has no use for it, on every job.
  assert.equal(JSON.stringify(sb), before, "the attachment changed the serialized storyboard");
  assert.ok(!Object.keys(sb).includes("paceConfig"));
  assert.ok(!("paceConfig" in JSON.parse(JSON.stringify(sb))));
});

t("setPaceOnStoryboard can re-attach (QA repair laps re-enter composition)", () => {
  const sb = { title: "T", scenes: [] };
  P.setPaceOnStoryboard(sb, P.resolve("fast", { durationSec: 30 }));
  assert.doesNotThrow(() => P.setPaceOnStoryboard(sb, P.resolve("very-fast", { durationSec: 30 })));
  assert.equal(sb.paceConfig.mode, "very-fast");
});

t("a naive spread DROPS the pace — which is why carryPace exists", () => {
  // Documents the hazard the hiding creates, so nobody "simplifies" carryPace
  // away later. The pipeline derives storyboards by spread on BOTH repair paths
  // (graph.js __qaIssuesToFix, pipeline.js __lintFeedback), and a dropped pace
  // there means the first lap of a paced film is paced and every retry is not.
  const p = P.resolve("very-fast", { durationSec: 30 });
  const sb = P.setPaceOnStoryboard({ title: "T", scenes: [] }, p, P.tempoForPacing(p));
  const naive = { ...sb, __qaIssuesToFix: ["x"] };
  assert.equal(naive.paceConfig, undefined, "spread unexpectedly kept it — re-check the hiding");
  assert.equal(P.tempoOf(naive).motion, 1, "a dropped pace silently reads as neutral");
});

t("carryPace restores the pace onto a derived storyboard", () => {
  const p = P.resolve("very-fast", { durationSec: 30 });
  const sb = P.setPaceOnStoryboard({ title: "T", scenes: [] }, p, P.tempoForPacing(p));
  const derived = P.carryPace(sb, { ...sb, __qaIssuesToFix: ["x"] });
  assert.equal(derived.paceConfig.mode, "very-fast");
  assert.equal(P.tempoOf(derived).motion, P.tempoOf(sb).motion);
  assert.ok(derived.__qaIssuesToFix, "the derived field survives");
  // and it is STILL hidden from serializers on the copy
  assert.ok(!JSON.stringify(derived).includes("paceConfig"));
});

t("carryPace is a no-op on an unpaced storyboard and tolerates nulls", () => {
  const plain = { title: "T", scenes: [] };
  const out = P.carryPace(plain, { ...plain });
  assert.equal(out.paceConfig, undefined);
  assert.equal(P.tempoOf(out).motion, 1);
  assert.doesNotThrow(() => P.carryPace(null, {}));
  assert.doesNotThrow(() => P.carryPace({}, null));
});

t("setPaceOnStoryboard tolerates a missing storyboard", () => {
  assert.doesNotThrow(() => P.setPaceOnStoryboard(null, P.resolve("fast", { durationSec: 30 })));
  assert.doesNotThrow(() => P.setPaceOnStoryboard(undefined, null, null));
});

t("resolve() never hands out a shared nested array from the mode table", () => {
  const a = P.resolve("fast", { durationSec: 60 });
  const b = P.resolve("fast", { durationSec: 60 });
  assert.notStrictEqual(a.audio.bpm, b.audio.bpm, "two jobs share one bpm array");
  assert.notStrictEqual(a.audio.bpm, P.MODES.fast.audio.bpm, "a job aliases the module table");
  assert.deepEqual(a.audio.bpm, P.MODES.fast.audio.bpm);
});

console.log("\npacing — word budget lands in the specified bands");

// THE BANDS MOVED, and it is worth knowing why before "fixing" them back.
//
// They used to be 140-165 / 130-150 / 100-120 / 80-100, taken from the brief's
// worked example. Those numbers came out of `duration x rate x density`, the
// model that had no term for what an utterance costs before its first word — so
// they describe films that cannot be made: 140 words across a 60s Normal film's
// 16 spoken lines needs 16 x 0.85s of onsets on top of 53.8s of speech, which is
// 67s of narration in a 60s film. Measured overshoot on 19 shipped reports was
// +12.2%, and that is where it came from.
//
// The bands below are what a 60s film can actually SAY at each mode. They are
// still derived, never tabulated — the test under this one proves it.
t("a 60s film hits the achievable word bands at every mode", () => {
  const band = { relaxed: [105, 125], normal: [95, 115], fast: [68, 88], "very-fast": [45, 65] };
  for (const [mode, [lo, hi]] of Object.entries(band)) {
    const w = P.resolve(mode, { durationSec: 60 }).wordBudget;
    assert.ok(w >= lo && w <= hi, `${mode}: ${w} words outside ${lo}-${hi}`);
  }
});

// THE INVARIANT THAT FAILED IN 27 OF 28 COMBINATIONS before the per-utterance
// term existed: the prompt handed the model a total budget its own per-scene
// ceiling could not add up to, so the model obeyed the ceiling (the concrete
// number in a table) and shipped as little as 45% of the stated budget. A very
// fast 90s film advertised 136 words behind a 3-words-a-scene ceiling over 39
// scenes and delivered 61, as 21 identical three-word lines.
//
// Nothing else in this suite catches it: the ceiling was checked against the
// validator, and the budget against the brief, but never against each other.
t("the per-scene ceiling can always ADD UP to the word budget", () => {
  for (const dur of [10, 15, 20, 30, 45, 60, 90, 120, 180, 240, 300, 420, 600]) {
    for (const mode of Object.keys(P.MODES)) {
      const p = P.resolve(mode, { durationSec: dur });
      const reachable = P.sceneWordCeiling(p, p.scene.targetSec) * p.narratedSceneCount;
      assert.ok(reachable >= p.wordBudget,
        `${mode} @ ${dur}s: ceiling reaches ${reachable} words but the budget states ${p.wordBudget}`);
    }
  }
});

t("the budget charges every spoken line for its onset and terminal fall", () => {
  const p = P.resolve("fast", { durationSec: 60 });
  const gross = 60 * p.narrationDensity * p.speechRate;             // the old model
  const overhead = p.narratedSceneCount * P.UTTERANCE_FIXED_SEC * p.speechRate;
  assert.equal(p.wordBudget, Math.round(gross - overhead));
  assert.ok(p.wordBudget < gross, "the fixed cost must actually come out of the budget");
  assert.ok(p.narratedSceneCount > 0 && p.narratedSceneCount <= p.scene.count);
});

t("the budget is derived, not tabulated — it scales with duration", () => {
  const a = P.resolve("fast", { durationSec: 30 }).wordBudget;
  const b = P.resolve("fast", { durationSec: 60 }).wordBudget;
  // Near-proportional rather than exactly so: the overhead term scales with the
  // NUMBER OF SPOKEN LINES, which is a rounded scene count, so doubling the
  // runtime does not double it to the word. A lookup table would not track at all.
  assert.ok(Math.abs(b - a * 2) <= Math.max(3, a * 0.1), `${a} -> ${b} does not scale with duration`);
});

t("the budget follows a MEASURED speech rate when one is supplied", () => {
  const est = P.resolve("fast", { durationSec: 60 });
  const measured = P.resolve("fast", { durationSec: 60, speechRate: 3.0 });
  assert.equal(measured.speechRateSource, "measured");
  assert.ok(measured.wordBudget > est.wordBudget, "a faster measured voice must buy more words");
  assert.equal(measured.wordBudget,
    Math.round((60 * est.narrationDensity - measured.narratedSceneCount * P.UTTERANCE_FIXED_SEC) * 3.0));
});

t("the budget is set by the AUTHORING language, not the voiceover language", () => {
  // The budget constrains the script the model WRITES, and that script is
  // English (SCRIPT_LANG) — translation to the voiceover language happens later.
  // Counting English words at Hindi's rate was wrong twice: those are not the
  // words that get spoken, and their count is not the translated count.
  const en = P.resolve("normal", { durationSec: 60, language: "en" });
  const de = P.resolve("normal", { durationSec: 60, language: "de" });
  assert.equal(de.wordBudget, en.wordBudget, "the dub language must not move the English budget");
  assert.equal(de.speechRateSource, "authoring");
  assert.equal(de.speechRate, P.SPEECH_RATE_BY_LANG[P.SCRIPT_LANG]);
  // ...but the VOICE's own rate is still carried, for the report to reason with.
  assert.equal(de.voiceSpeechRate, P.SPEECH_RATE_BY_LANG.de);
  assert.ok(de.voiceSpeechRate < en.voiceSpeechRate, "German is spoken slower in words/sec");
});

t("voiceover off zeroes the budget without breaking anything else", () => {
  const p = P.resolve("very-fast", { durationSec: 45, voiceover: false });
  assert.equal(p.wordBudget, 0);
  assert.equal(p.voiceover, false);
  assert.ok(p.scene.targetSec > 0 && p.scene.count >= 2, "cuts still have to work with no VO");
  assert.ok(P.shortDirective(p).includes("no voiceover"));
});

t("faster modes monotonically say less and cut more", () => {
  const order = ["relaxed", "normal", "fast", "very-fast"];
  const w = order.map((m) => P.resolve(m, { durationSec: 60 }).wordBudget);
  const n = order.map((m) => P.resolve(m, { durationSec: 60 }).scene.count);
  for (let i = 1; i < order.length; i++) {
    assert.ok(w[i] < w[i - 1], `${order[i]} must use fewer words than ${order[i - 1]}`);
    assert.ok(n[i] > n[i - 1], `${order[i]} must cut more than ${order[i - 1]}`);
  }
});

console.log("\npacing — readability floors are absolute (precedence rule 1)");

t("minReadableSec grows with length and stays inside its clamps", () => {
  assert.equal(P.minReadableSec(""), 0);
  assert.ok(P.minReadableSec("Go") >= 0.9, "short lines still get the recognition floor");
  assert.ok(P.minReadableSec("x".repeat(400)) <= 4.0, "long lines are capped");
  assert.ok(P.minReadableSec("a longer headline here") > P.minReadableSec("short"));
});

t("the floor is IDENTICAL at every pace — no mode may lower it", () => {
  const line = "Tax-ready in seconds, every single time";
  const seen = new Set(Object.keys(P.MODES).map((m) => {
    const p = P.resolve(m, { durationSec: 60 });
    return `${p.readability.charsPerSec}/${p.readability.minSec}/${P.minReadableSec(line)}`;
  }));
  assert.equal(seen.size, 1, "a mode changed the readability floor");
});

t("no mode's scene target can fall under the engine floor", () => {
  for (const m of Object.keys(P.MODES)) {
    for (const d of [5, 10, 15, 30, 60, 120, 240, 300, 600]) {
      const p = P.resolve(m, { durationSec: d });
      assert.ok(p.scene.targetSec >= P.SCENE_MIN_SEC, `${m}@${d}s -> ${p.scene.targetSec}s`);
      assert.ok(p.scene.targetSec <= P.SCENE_MAX_SEC, `${m}@${d}s -> ${p.scene.targetSec}s`);
      assert.ok(p.scene.beatTargetSec >= P.BEAT_FLOOR_SEC, `${m}@${d}s beat ${p.scene.beatTargetSec}s`);
    }
  }
});

t("checkReadability reports the shortfall, not just a boolean", () => {
  const long = "A considerably longer on-screen line that needs real time";
  const r = P.checkReadability([long], 1.0);
  assert.equal(r.ok, false);
  assert.ok(r.over > 0, "a failing check must say how much time is missing");
  assert.equal(P.checkReadability([long], 10).ok, true);
});

t("minSceneSec takes the MAX of concurrent lines, never the sum", () => {
  const a = "first line here", b = "second line here";
  const both = P.minSceneSec([a, b]);
  assert.equal(both, Math.max(P.minSceneSec([a]), P.minSceneSec([b])));
});

console.log("\npacing — motion scales differentially");

t("entrances and transitions get quicker; ambient and camera timing do not", () => {
  const s = P.scaleTiming(TIMING, P.resolve("very-fast", { durationSec: 60 }));
  assert.ok(s.textDur < TIMING.textDur, "text entrance must quicken");
  assert.ok(s.cardDur < TIMING.cardDur, "card entrance must quicken");
  assert.ok(s.transDur < TIMING.transDur, "transitions must quicken");
  assert.ok(s.textStagger < TIMING.textStagger, "word cadence must tighten");
  assert.equal(s.idleCycle, TIMING.idleCycle, "ambient drift must NOT scale — it is the contrast");
  assert.equal(s.sweepEvery, TIMING.sweepEvery, "light sweeps must NOT scale");
});

t("eases, distances and blurs are never touched (character, not tempo)", () => {
  const s = P.scaleTiming(TIMING, P.resolve("very-fast", { durationSec: 60 }));
  for (const k of ["textEase", "cardEase", "transEase", "camEase", "idleEase",
                   "textRise", "textBlur", "cardRise", "cardBlur", "idleY", "idleRot", "overshoot"]) {
    assert.equal(s[k], TIMING[k], `${k} must not change with pace`);
  }
});

t("camPush is a DISTANCE — it grows with pace instead of shrinking", () => {
  const s = P.scaleTiming(TIMING, P.resolve("very-fast", { durationSec: 60 }));
  assert.ok(s.camPush > TIMING.camPush, "a faster film should push further, not less far");
});

t("relaxed slows entrances rather than speeding them", () => {
  const s = P.scaleTiming(TIMING, P.resolve("relaxed", { durationSec: 60 }));
  assert.ok(s.textDur > TIMING.textDur);
  assert.ok(s.transDur > TIMING.transDur);
});

console.log("\npacing — long-form and edge cases");

t("long-form scenes stay deep instead of multiplying past the cap", () => {
  const p = P.resolve("normal", { durationSec: 600 });
  assert.ok(p.scene.count <= P.LONGFORM_SCENE_CAP, `${p.scene.count} scenes exceeds the cap`);
  assert.ok(p.scene.targetSec > 5, `600s film wants deep scenes, got ${p.scene.targetSec}s`);
});

t("a capped cut-rate is REPORTED, never silent", () => {
  const p = P.resolve("very-fast", { durationSec: 600 });
  assert.equal(p.scene.cutRateCapped, true, "600s very-fast must admit it could not add every cut");
  assert.ok(p.scene.count <= P.LONGFORM_SCENE_CAP);
  assert.equal(P.resolve("normal", { durationSec: 60 }).scene.cutRateCapped, false);
});

t("a very short film still produces at least two workable scenes", () => {
  for (const m of Object.keys(P.MODES)) {
    const p = P.resolve(m, { durationSec: 5 });
    assert.ok(p.scene.count >= 2, `${m}: ${p.scene.count} scenes`);
    assert.ok(p.scene.count * P.SCENE_MIN_SEC <= 5 + 0.01, `${m}: scenes cannot fit in 5s`);
  }
});

t("vertical cuts quicker than landscape at the same mode", () => {
  const v = P.resolve("fast", { durationSec: 60, orientation: "vertical" });
  const h = P.resolve("fast", { durationSec: 60, orientation: "horizontal" });
  assert.ok(v.scene.beatTargetSec < h.scene.beatTargetSec);
  assert.ok(v.scene.beatTargetSec >= P.BEAT_FLOOR_SEC);
});

t("VO quality floors are constant — a mode may not lower them", () => {
  const seen = new Set(Object.keys(P.MODES).map((m) => {
    const v = P.resolve(m, { durationSec: 60 }).vo;
    return `${v.tightenAbove}/${v.hardCapRatio}/${v.maxAtempo}`;
  }));
  assert.equal(seen.size, 1, "a mode changed how hard the voice may be pushed");
});

console.log("\npacing — measurement closes the loop");

t("observedSpeechRate reads the real rate back out of synthesized clips", () => {
  const clips = [
    { text: "one two three four five six", durationSec: 2.0 },
    { text: "seven eight nine ten eleven twelve", durationSec: 2.0 },
  ];
  assert.equal(P.observedSpeechRate(clips), 3.0);
});

t("observedSpeechRate refuses to guess from too little audio", () => {
  assert.equal(P.observedSpeechRate([]), null);
  assert.equal(P.observedSpeechRate([{ text: "two words", durationSec: 1 }]), null);
  assert.equal(P.observedSpeechRate([{ text: "", durationSec: 40 }]), null);
});

// THE CONFOUND observedSpeechRate CANNOT SEE. Both films below are spoken by
// the SAME voice — 2.5 w/s marginal, 0.85s of onset and fall per line. One says
// it in a few long lines, the other in many short ones, which is exactly what
// the pace dial changes. observedSpeechRate reports them as different voices;
// the two-parameter fit reports them as the same one, which is the truth.
//
// Measured across 15 shipped films, observedSpeechRate correlated with
// clips-per-word at r = -0.75 and read 1.18-2.06 w/s on this same voice. The
// report graded that against 2.6, failed 18 of 19 films, and told the reader to
// re-tune BASE_SPEECH_RATE — which would have cut every budget by a third.
t("the utterance fit separates the voice from the cutting rate", () => {
  const say = (n) => ({ text: Array.from({ length: n }, (_, i) => `w${i}`).join(" "), durationSec: n / 2.5 + 0.85 });
  const longLines  = [say(14), say(12), say(15), say(11), say(13), say(16)];
  const shortLines = [say(3), say(4), say(2), say(5), say(3), say(4), say(2), say(5)];

  const a = P.observedUtteranceCost(longLines);
  const b = P.observedUtteranceCost(shortLines);
  for (const f of [a, b]) {
    assert.ok(f, "a sample with real spread must produce a fit");
    assert.ok(Math.abs(f.rate - 2.5) < 0.05, `marginal rate ${f.rate} is not the 2.5 that generated it`);
    assert.ok(Math.abs(f.fixedSec - 0.85) < 0.05, `fixed cost ${f.fixedSec} is not the 0.85 that generated it`);
  }
  // ...and this is what the old single-number measure said about the same voice.
  const blendedA = P.observedSpeechRate(longLines);
  const blendedB = P.observedSpeechRate(shortLines);
  assert.ok(blendedA - blendedB > 0.5,
    `the blended rate must be the thing that moves with cutting (${blendedA} vs ${blendedB})`);
});

t("the fit refuses a sample that cannot separate the two terms", () => {
  const same = Array.from({ length: 12 }, () => ({ text: "one two three", durationSec: 2.4 }));
  assert.equal(P.observedUtteranceCost(same), null, "every line the same length fits a vertical line");
  assert.equal(P.observedUtteranceCost([]), null);
  assert.equal(P.observedUtteranceCost([{ text: "a b", durationSec: 1 }, { text: "a b c", durationSec: 2 }]), null);
});

// The film that motivated all of this: 21 lines of exactly three words. The fit
// must decline rather than blame the voice — which is what "fail-open" means for
// a check whose job is to tell you which constant to re-tune.
t("a film of identical short lines makes the calibration checks SKIP, not FAIL", () => {
  const clips = Array.from({ length: 21 }, (_, i) => ({ sceneId: `s${i}`, text: "agents take action", durationSec: 2.41 }));
  const script = { scenes: clips.map((c) => ({ id: c.sceneId, voiceover: c.text, duration: 2.4, onScreenText: [] })) };
  const rep = P.report({ pacing: P.resolve("very-fast", { durationSec: 90 }), script, voClips: clips, targetDurationSec: 90 });
  assert.equal(rep.checks.speechRate, null);
  assert.equal(rep.checks.utteranceCost, null);
  assert.ok(!rep.failed.includes("speechRate"));
  assert.equal(rep.observedMarginalRate, null);
  assert.ok(rep.observedSpeechRate > 0, "the blended figure is still reported, just not graded");
});

t("scriptWordCount counts only spoken words", () => {
  const script = { scenes: [
    { voiceover: "one two three", onScreenText: ["ignored entirely"] },
    { voiceover: "" },
    { voiceover: "four five" },
  ] };
  assert.equal(P.scriptWordCount(script), 5);
  assert.equal(P.scriptWordCount(null), 0);
});

console.log("\npacing — the prompt directive agrees with the validator");

t("the prompt's per-scene ceiling equals what the validator enforces", () => {
  const p = P.resolve("fast", { durationSec: 60 });
  for (const row of P.wordCeilingTable(p)) {
    assert.equal(row.maxWords, P.sceneWordCeiling(p, row.sceneSec),
      `prompt says ${row.maxWords} for ${row.sceneSec}s but the validator computes otherwise`);
  }
});

// THE DEFAULT-PACE TABLE, which lives in a markdown file and is therefore the
// one number in this system nothing was checking.
//
// At `normal` the pacing directive is deliberately empty, so system_script.md's
// own table is the ONLY per-scene ceiling a default-pace film ever sees — and it
// was written from the same words-per-second model that omitted what an
// utterance costs. Default-pace films were the worst overshooters in the shipped
// data (30s requested, 34.4 / 35.7 / 39.0s delivered), and this is where that
// came from: the prompt promised a 3s scene could hold ~7 words when it holds 6.
//
// Parsing the markdown rather than restating the numbers is the point. A copy
// here would drift from the file exactly the way the file drifted from the engine.
t("system_script.md's per-scene table matches the engine that grades it", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const md = fs.readFileSync(path.join(__dirname, "..", "src", "prompts", "system_script.md"), "utf8");
  const rows = [...md.matchAll(/^\s*\|\s*([\d.]+)s\s*\|\s*~(\d+)\s*\|/gm)].map((m) => [Number(m[1]), Number(m[2])]);
  assert.ok(rows.length >= 5, `expected the VO-fit table in system_script.md, found ${rows.length} rows`);

  const normal = P.resolve("normal", { durationSec: 60 });
  for (const [sceneSec, stated] of rows) {
    assert.equal(stated, P.sceneWordCeiling(normal, sceneSec),
      `system_script.md says ~${stated} words fit ${sceneSec}s; the engine computes ${P.sceneWordCeiling(normal, sceneSec)}`);
  }
  // ...and the prose must carry the fixed cost, or the table looks arbitrary.
  assert.ok(md.includes(`${P.UTTERANCE_FIXED_SEC}s`),
    "system_script.md must state the per-utterance cost its table is built from");
});

t("the directive states the real budget and scene count", () => {
  const p = P.resolve("very-fast", { durationSec: 60 });
  const d = P.scriptDirective(p);
  assert.ok(d.includes(`${p.wordBudget} words`), "budget missing from the prompt");
  assert.ok(d.includes(`${p.scene.count} scenes`), "scene count missing from the prompt");
  assert.ok(/VERY FAST/.test(d));
});

console.log("\npacing — runtime overshoot stays bounded (the monotone-stretch trap)");

// services/pipeline.js retimeScenesToVo grows a scene to contain its MEASURED
// narration plus VO_TAIL and can never shrink one, so every narrated scene whose
// line overruns its plan pushes the finished film past the requested runtime.
// The tail is paid PER NARRATED SCENE, so a mode that both adds scenes and keeps
// the script full compounds it. This projects that overshoot from a mode's own
// numbers, and pins it — retuning narrationDensity or voTailSec upward without
// noticing is exactly how a "faster" mode ends up delivering a LONGER film.
// The budget is spread evenly over the scenes, which is the honest bound: the
// tail is paid once PER SCENE, so counting every scene as narrated is the
// worst case for tail cost. (An earlier version of this model counted only
// `n * density` scenes as narrated while still spending the WHOLE budget on
// them — which concentrated the words and invented an overshoot the pipeline
// does not actually produce. Measured against three real generations, the model
// writes well UNDER budget and most scenes never grow at all, so treat these
// numbers as a pessimistic ceiling, not a prediction.)
function projectedOvershoot(mode, durationSec) {
  const p = P.resolve(mode, { durationSec });
  const n = p.scene.count;
  const voPerScene = (durationSec * p.narrationDensity) / n;
  const grown = Math.max(p.scene.minSec, p.scene.targetSec, voPerScene + p.vo.tailSec);
  return (n * grown) / durationSec - 1;
}

// The absolute ceiling. The default already runs long by design (agents/graph.js
// documents a 30s request delivering 33-34s once narration stretches the cut),
// so this is not "must be exact" — it is "must not be WILD".
const OVERSHOOT_CEILING = 0.12;
// How much worse than the inherited default a NEW mode may be. Relaxed is
// allowed a little: a longer tail is its whole character, and buying breathing
// room costs clock. Fast modes must be better, not merely no worse.
const OVERSHOOT_SLACK_VS_NORMAL = 0.02;

t("no mode projects a wild runtime overshoot", () => {
  for (const d of [15, 30, 60, 120, 300]) {
    for (const m of Object.keys(P.MODES)) {
      const o = projectedOvershoot(m, d);
      assert.ok(o <= OVERSHOOT_CEILING,
        `${m}@${d}s projects ${(o * 100).toFixed(1)}% over the requested runtime`);
    }
  }
});

t("no mode is meaningfully sloppier about runtime than the default", () => {
  for (const d of [15, 30, 60, 120, 300]) {
    const base = projectedOvershoot("normal", d);
    for (const m of Object.keys(P.MODES)) {
      const o = projectedOvershoot(m, d);
      assert.ok(o <= base + OVERSHOOT_SLACK_VS_NORMAL,
        `${m}@${d}s projects ${(o * 100).toFixed(1)}% over vs normal's ${(base * 100).toFixed(1)}% — `
        + "a mode this feature ADDS must not be sloppier about runtime than the behaviour it inherited");
    }
  }
});

t("the FASTER modes land closer to the requested runtime than the default", () => {
  // Relaxed is deliberately excluded — it trades clock for breathing room, and
  // the slack rule above is what bounds it. Fast and Very Fast have no such
  // excuse: shorter narration is the whole point, so they must be tighter.
  for (const d of [30, 60, 120]) {
    const base = projectedOvershoot("normal", d);
    for (const m of ["fast", "very-fast"]) {
      const o = projectedOvershoot(m, d);
      assert.ok(o <= base,
        `${m}@${d}s (${(o * 100).toFixed(1)}%) must not overshoot more than normal (${(base * 100).toFixed(1)}%)`);
    }
  }
});

console.log("\npacing — the renderer's own scene ceiling is respected");

t("a renderer cap that bites is applied AND named", () => {
  // services/pipeline.js sceneCapFor: 50 for omelette, a FilmKit skin's own
  // maxScenes (often 12-18) for film-*, else 72. Planning past it meant
  // foldScriptToRenderer merged the overflow afterwards — and merged scenes
  // SHARE ONE NARRATION CLIP, so the film was authored with lines the cut could
  // never give their own beat.
  const p = P.resolve("very-fast", { durationSec: 60, rendererSceneCap: 12 });
  assert.equal(p.scene.count, 12);
  assert.equal(p.scene.cutRateCapped, true);
  assert.equal(p.scene.cutRateCappedBy, "renderer");
  assert.equal(p.scene.rendererSceneCap, 12);
  assert.ok(Math.abs(p.scene.count * p.scene.targetSec - 60) < 1, "target must follow the capped count");
});

t("a renderer cap that does NOT bite changes nothing", () => {
  const free = P.resolve("very-fast", { durationSec: 60 });
  const roomy = P.resolve("very-fast", { durationSec: 60, rendererSceneCap: 200 });
  assert.equal(roomy.scene.count, free.scene.count);
  assert.equal(roomy.scene.cutRateCapped, false);
  assert.equal(roomy.scene.cutRateCappedBy, null);
});

t("omitting the cap keeps the pre-cap behaviour exactly", () => {
  for (const m of Object.keys(P.MODES)) {
    for (const d of [30, 60, 600]) {
      const a = P.resolve(m, { durationSec: d });
      const b = P.resolve(m, { durationSec: d, rendererSceneCap: null });
      assert.deepEqual(b, a, `${m}@${d}s`);
    }
  }
});

t("the ceiling that bit is identified correctly in each case", () => {
  // renderer, when the pack is the tightest bound
  assert.equal(P.resolve("fast", { durationSec: 600, rendererSceneCap: 12 }).scene.cutRateCappedBy, "renderer");
  // the engine's own long-form scene ceiling, with a roomy renderer
  assert.equal(P.resolve("very-fast", { durationSec: 600, rendererSceneCap: 500 }).scene.cutRateCappedBy, "scene-ceiling");
  // and the minimum scene length on a film too short to hold the cuts
  const tiny = P.resolve("very-fast", { durationSec: 6 });
  if (tiny.scene.cutRateCapped) assert.equal(tiny.scene.cutRateCappedBy, "min-scene-length");
});

console.log("\npacing — the on-screen line budget maps onto the text director");

t("the text director's bullet cap is unchanged at the default", () => {
  // services/text_director.js uses maxOnScreenLines - 1 (the headline is always
  // there). Relaxed and normal must both land on 3, the cap it used before.
  for (const m of ["relaxed", "normal"]) {
    const p = P.resolve(m, { durationSec: 60 });
    assert.equal(p.text.maxOnScreenLines - 1, 3, `${m} must keep the pre-pacing bullet cap`);
  }
});

// THE SECOND DENSITY AXIS.
//
// This block replaces an assertion that `fast` and `very-fast` TIGHTEN the
// on-screen line cap to 2. That was the shipped behaviour and it is exactly the
// defect: pace was one dial driving both channels, so asking for a quicker film
// bought a thinner FRAME as well as a shorter script. Measured over 39 jobs in
// jobs.json, a very-fast film carried 3.39 on-screen words per scene against
// normal's 4.05 — the picture got emptier precisely where the narration had
// stopped carrying the film.
//
// The contract now: narration density FALLS with pace, visual density RISES, and
// readability is untouched because the extra elements are SHORTER, not extra
// lines of the same length (minSceneSec takes the max, never the sum).

console.log("\npacing — visual density is a SEPARATE axis that rises with pace");

t("the default film's on-screen budget is byte-identical to the pre-axis one", () => {
  const p = P.resolve("normal", { durationSec: 60 });
  assert.equal(p.text.maxOnScreenLines, 4, "normal still resolves 4 lines");
  assert.equal(p.text.elementsPerScene, 4);
  assert.equal(p.text.bulletsPerScene, 3);
  assert.equal(p.text.density, 1.0, "normal is the unit of visual density");
});

t("elements per frame RISE with pace while narration words FALL", () => {
  const modes = ["relaxed", "normal", "fast", "very-fast"];
  const got = modes.map((m) => P.resolve(m, { durationSec: 90 }));
  for (let i = 1; i < got.length; i++) {
    assert.ok(got[i].wordBudget < got[i - 1].wordBudget,
      `${modes[i]} must narrate less than ${modes[i - 1]} (${got[i].wordBudget} vs ${got[i - 1].wordBudget})`);
    assert.ok(got[i].text.elementsPerScene >= got[i - 1].text.elementsPerScene,
      `${modes[i]} must never show FEWER elements than ${modes[i - 1]}`);
  }
  assert.ok(got[3].text.elementsPerScene > got[1].text.elementsPerScene,
    "very-fast must be strictly denser per frame than normal");
});

t("the film-level visual copy budget rises as the word budget falls", () => {
  const fast = P.resolve("very-fast", { durationSec: 90 });
  const normal = P.resolve("normal", { durationSec: 90 });
  assert.ok(fast.wordBudget < normal.wordBudget, "narration shrinks");
  assert.ok(fast.text.charBudget > normal.text.charBudget,
    `the frame takes the information back (${fast.text.charBudget} vs ${normal.text.charBudget})`);
});

t("every element the capacity oracle allows is READABLE in its own scene", () => {
  // The oracle is the inverse of minReadableSec(): a line built to its ceiling
  // must never fail the floor. This is precedence rule 1 holding at every mode.
  for (const m of ["relaxed", "normal", "fast", "very-fast"]) {
    for (const dur of [15, 30, 60, 90, 300, 600]) {
      const p = P.resolve(m, { durationSec: dur });
      const sec = p.scene.targetSec;
      const cap = P.visualCapacity(p, sec);
      for (const [role, n] of Object.entries(cap.roles)) {
        const line = "x".repeat(n);
        const need = P.minReadableSec(line);
        assert.ok(need <= Math.max(sec, P.SCENE_MIN_SEC) + 1e-9,
          `${m}@${dur}s ${role}: a ${n}-char line needs ${need}s in a ${sec}s scene`);
      }
    }
  }
});

t("a denser frame never demands a longer scene (concurrent reading holds)", () => {
  // Six short elements must not cost more scene time than one of them, or the
  // whole density model is unsound.
  const p = P.resolve("very-fast", { durationSec: 90 });
  const cap = P.visualCapacity(p, p.scene.targetSec);
  const frame = [
    "x".repeat(cap.roles.kicker),
    "x".repeat(cap.roles.headline),
    "x".repeat(cap.roles.subtext),
    ...Array.from({ length: cap.bullets }, () => "x".repeat(cap.roles.bullet)),
  ];
  assert.equal(P.minSceneSec(frame), P.minSceneSec(["x".repeat(cap.roles.headline)]),
    "a full frame costs exactly what its LONGEST line costs");
  assert.ok(P.checkReadability(frame, p.scene.targetSec).ok,
    "a full very-fast frame is readable in its own scene");
});

t("fitVisualLine clips to the role ceiling on a word boundary", () => {
  const p = P.resolve("very-fast", { durationSec: 90 });
  const sec = p.scene.targetSec;
  const long = "LangGraph orchestrates reliable multi-step agents as directed graphs";
  const out = P.fitVisualLine(long, sec, "bullet", p);
  const cap = P.visualCapacity(p, sec);
  assert.ok(out.length <= cap.roles.bullet, `clipped to ${cap.roles.bullet}, got ${out.length}`);
  assert.ok(!/\s$/.test(out) && !out.endsWith("-"), "no dangling separator");
  assert.ok(long.startsWith(out.split(/\s+/)[0]), "keeps the head of the line");
  assert.equal(P.fitVisualLine("", sec, "bullet", p), "", "empty in, empty out");
  // A line already inside the ceiling is returned untouched.
  assert.equal(P.fitVisualLine("Agents act", sec, "headline", p), "Agents act");
});

t("the capacity oracle is safe with no pacing config at all", () => {
  const cap = P.visualCapacity(null, 3.5);
  assert.ok(cap.maxChars > 0 && cap.maxElements >= 2 && cap.roles.headline > 0);
  assert.equal(P.fitVisualLine("hello world", 3.5, "headline"), "hello world");
});

t("the visual directive names real numbers and never restates the voiceover", () => {
  for (const m of ["relaxed", "normal", "fast", "very-fast"]) {
    const p = P.resolve(m, { durationSec: 60 });
    const d = P.visualDirective(p);
    assert.ok(d.length > 0, `${m} must always brief the frame (unlike scriptDirective)`);
    assert.ok(d.includes(String(P.visualCapacity(p, p.scene.targetSec).roles.headline)),
      `${m} directive must carry its own headline ceiling`);
    assert.ok(/never restate the voiceover/i.test(d), `${m} must forbid echoing the VO`);
    assert.ok(P.visualDirective(p, { compact: true }).split("\n").length <= 2, "compact is one line");
  }
});

t("the faster script directive asks for MORE on-screen copy, not less", () => {
  for (const m of ["fast", "very-fast"]) {
    const d = P.scriptDirective(P.resolve(m, { durationSec: 60 }));
    assert.ok(/Write MORE `onScreenText`, not less/.test(d), `${m} must invert the old cap`);
    assert.ok(!/at most \d+ short lines per scene/.test(d), `${m} must not re-introduce a line cap`);
  }
});

console.log("\npacing — the legacy tempo tilt is preserved exactly");

// These pin the ORIGINAL services/pacing.js behaviour. tempoOf() is imported by
// services/film_stage.js:54 and its contract predates the mode engine; the mode
// engine was merged INTO this file rather than beside it, so these assertions
// are what prove the merge did not move anything that was already load-bearing.

t("tempoFor with narration on is exactly neutral", () => {
  const v = P.tempoFor({ narration: "on" });
  assert.equal(v.motion, 1); assert.equal(v.xfade, 1); assert.equal(v.camera, 1);
  assert.equal(v.label, "voice-led");
});

t("tempoFor with narration off returns the original NO_VO tilt", () => {
  const v = P.tempoFor({ narration: "off" });
  assert.equal(v.motion, 0.68);
  assert.equal(v.xfade, 0.62);
  assert.equal(v.camera, 1.35);
  assert.equal(v.narration, "off");
  assert.equal(v.label, "music-led");
});

t("a pack that opted out (energyBoost 0) still gets no tilt", () => {
  const v = P.tempoFor({ narration: "off", energyBoost: 0 });
  assert.equal(v.motion, 1); assert.equal(v.xfade, 1); assert.equal(v.camera, 1);
  assert.equal(v.label, "music-led (pack opted out)");
});

t("energyBoost 2 scales the tilt 1.25x and stays inside the original clamps", () => {
  const v = P.tempoFor({ narration: "off", energyBoost: 2 });
  assert.ok(Math.abs(v.motion - (1 - 0.32 * 1.25)) < 1e-9, `motion ${v.motion}`);
  assert.ok(Math.abs(v.xfade - (1 - 0.38 * 1.25)) < 1e-9, `xfade ${v.xfade}`);
  assert.ok(Math.abs(v.camera - (1 + 0.35 * 1.25)) < 1e-9, `camera ${v.camera}`);
  assert.ok(v.motion >= 0.5 && v.xfade >= 0.45 && v.camera <= 1.6);
});

t("tempoFor output always sits inside the ORIGINAL one-sided ranges", () => {
  // This is what makes widening the clamps provably behaviour-preserving.
  for (const narration of ["on", "off"]) {
    for (const energyBoost of [0, 1, 2, 3, NaN, undefined]) {
      const v = P.tempoFor({ narration, energyBoost });
      assert.ok(v.motion >= 0.5 && v.motion <= 1, `motion ${v.motion}`);
      assert.ok(v.xfade >= 0.45 && v.xfade <= 1, `xfade ${v.xfade}`);
      assert.ok(v.camera >= 1 && v.camera <= 1.6, `camera ${v.camera}`);
    }
  }
});

t("tempoOf returns NEUTRAL for a storyboard with no pacing (the old default)", () => {
  assert.deepEqual(P.tempoOf(null), P.NEUTRAL);
  assert.deepEqual(P.tempoOf({}), P.NEUTRAL);
  assert.deepEqual(P.tempoOf({ pacing: "nonsense" }), P.NEUTRAL);
  assert.equal(P.NEUTRAL.motion, 1);
  assert.equal(P.NEUTRAL.label, "voice-led");
});

t("tempoOf round-trips a tempoFor value unchanged", () => {
  const made = P.tempoFor({ narration: "off" });
  const read = P.tempoOf({ pacing: made });
  assert.equal(read.motion, made.motion);
  assert.equal(read.xfade, made.xfade);
  assert.equal(read.camera, made.camera);
  assert.equal(read.narration, "off");
});

t("the widened clamps let Relaxed express SLOWER, which the old ones could not", () => {
  const relaxed = P.tempoForPacing(P.resolve("relaxed", { durationSec: 60 }));
  assert.ok(relaxed.motion > 1, `relaxed must slow motion, got ${relaxed.motion}`);
  // The original clamp was [0.5, 1] — this value would have been pinned to 1.
  assert.ok(relaxed.motion <= P.TEMPO_BOUNDS.motion[1]);
  assert.equal(P.tempoOf({ pacing: relaxed }).motion, relaxed.motion, "tempoOf must not pin it back");
});

t("tempoForPacing at normal is identical to the plain tempoFor", () => {
  for (const narration of ["on", "off"]) {
    const a = P.tempoFor({ narration });
    const b = P.tempoForPacing(P.resolve("normal", { durationSec: 60 }), { narration });
    assert.equal(b.motion, a.motion); assert.equal(b.xfade, a.xfade); assert.equal(b.camera, a.camera);
  }
});

t("pace and narration-off COMPOSE — both reasons to move faster apply", () => {
  const p = P.resolve("fast", { durationSec: 60 });
  const voiced = P.tempoForPacing(p, { narration: "on" });
  const silent = P.tempoForPacing(p, { narration: "off" });
  assert.ok(silent.motion < voiced.motion, "no-VO on top of Fast must be quicker still");
  assert.ok(voiced.motion < 1, "Fast alone must already be quicker than neutral");
  assert.ok(silent.motion >= P.TEMPO_BOUNDS.motion[0], "but never past the strobe floor");
});

t("tempoForPacing never escapes its bounds at any mode or boost", () => {
  for (const m of Object.keys(P.MODES)) {
    for (const narration of ["on", "off"]) {
      for (const energyBoost of [0, 1, 2]) {
        const v = P.tempoForPacing(P.resolve(m, { durationSec: 60 }), { narration, energyBoost });
        for (const k of ["motion", "xfade", "camera"]) {
          const [lo, hi] = P.TEMPO_BOUNDS[k];
          assert.ok(v[k] >= lo && v[k] <= hi, `${m}/${narration}/${energyBoost} ${k}=${v[k]} outside [${lo},${hi}]`);
        }
      }
    }
  }
});

console.log(`\n${passed} assertion group(s) passed${process.exitCode ? " — WITH FAILURES" : ""}\n`);
