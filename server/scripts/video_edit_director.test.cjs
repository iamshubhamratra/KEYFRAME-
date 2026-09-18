// Tests for the AI Video Edit director phase: director/{lexicon,opportunities,heuristic,director,rhythm,framing,build_plan}.
// Run: node scripts/video_edit_director.test.cjs   (offline; fetch tripwire; the LLM chat is injected; < 60 s)
//
// Load-bearing assertions:
//  - RHYTHM INVARIANTS for every brollIntensity × effects combination, on the 45 s fixture and a tiled ~89 s copy (so
//    "any 60 s window" is a real constraint), with both heuristic opportunities and an over-complete director list:
//    coverage, items per 60 s window, min gaps, face after FULL, start/end on face, durations, SFX caps/spacing/no
//    repeated cue, graphics caps, punch-in caps/spacing, protected moments never covered. The checker is written
//    independently of rhythm.js (its own window / union arithmetic), so the engine cannot grade itself.
//  - ACCOUNTABILITY: every opportunity is placed or has a logged adjustment (EDIT_PLAN.md §6 "every rejection logged").
//  - FALLBACK: a director failure never fails the build; provenance.director.fallback = true; cancellation propagates.
//  - DETERMINISM: identical inputs -> identical sha256Json; inputs never mutated.
//  - PINS: locked/user B-roll survives "Regenerate with AI" and consumes budget; tombstones are never resurrected.
// Fixtures: scripts/fixtures/video_edit/talking_head_45s.*.json (shared with video_edit_plan_core.test.cjs).

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { createHarness, installFetchTripwire } = require("./lib/video_edit_test_utils.cjs");
const { sha256Json } = require("../src/video_edit/fsx");
const { isEditError, EditError } = require("../src/video_edit/errors");
const S = require("../src/video_edit/plan/schema");
const T = require("../src/video_edit/plan/timeline");
const { outline } = require("../src/video_edit/plan/outline");
const { callJson } = require("../src/video_edit/ai/llm");
const Lx = require("../src/video_edit/director/lexicon");
const Op = require("../src/video_edit/director/opportunities");
const H = require("../src/video_edit/director/heuristic");
const Dir = require("../src/video_edit/director/director");
const Rh = require("../src/video_edit/director/rhythm");
const Fr = require("../src/video_edit/director/framing");
const BP = require("../src/video_edit/director/build_plan");

const { t, section, run } = createHarness();
const restoreFetch = installFetchTripwire();

// ---------------------------------------------------------------- fixtures
const FIX = path.join(__dirname, "fixtures", "video_edit");
const load = (n) => JSON.parse(fs.readFileSync(path.join(FIX, `talking_head_45s.${n}.json`), "utf8"));
const SOURCE = load("source");
const WORDS = load("transcript.words").words;
const TRANSCRIPT = load("transcript");
const FACES = load("faces");
const CONTENT = load("content");
const AUDIO = load("audio");
const NOW = 1757800000000;
const { projectId: PROJECT_ID, fps: _fps, ...SOURCE_FIELDS } = SOURCE;
const clone = (v) => JSON.parse(JSON.stringify(v));
const r3 = (x) => Math.round(x * 1000) / 1000;

const sentence = (id, sentences = TRANSCRIPT.sentences) => sentences.find((s) => s.id === id);
function wi(sid, text) {
  const s = sentence(sid);
  for (let i = s.w0; i <= s.w1; i++) if (WORDS[i].text === text) return i;
  throw new Error(`word '${text}' not in ${sid}`);
}

const FX45 = {
  source: SOURCE_FIELDS, words: WORDS, sentences: TRANSCRIPT.sentences, transcriptMeta: TRANSCRIPT, audio: AUDIO, faces: FACES, content: CONTENT,
};

// The 45 s talking head repeated `copies` times back to back (ids, indices and times shifted), so rhythm windows of
// 60 s are exercised on a real timeline. Only the first copy keeps the hook, only the last copy keeps the CTA.
function tileFixture(copies) {
  const D = SOURCE.durationSec, N = WORDS.length, K = TRANSCRIPT.sentences.length;
  const sid = (id, c) => `s${Number(id.slice(1)) + K * c}`;
  const words = [], sentences = [], fillerCandidates = [], repeatCandidates = [], silences = [], keyframes = [];
  const content = { ...clone(CONTENT), segments: [], faceRequired: [], emphasis: [], visualSupport: [], sfxOpportunities: [] };
  for (let c = 0; c < copies; c++) {
    const off = D * c;
    for (const w of WORDS) words.push({ ...w, i: w.i + N * c, start: r3(w.start + off), end: r3(w.end + off), sentenceId: sid(w.sentenceId, c) });
    for (const s of TRANSCRIPT.sentences) sentences.push({ ...s, id: sid(s.id, c), w0: s.w0 + N * c, w1: s.w1 + N * c, start: r3(s.start + off), end: r3(s.end + off) });
    for (const f of TRANSCRIPT.fillerCandidates) fillerCandidates.push({ ...f, i: f.i + N * c });
    for (const rc of TRANSCRIPT.repeatCandidates) repeatCandidates.push({ ...rc, w0: rc.w0 + N * c, w1: rc.w1 + N * c, keptW0: rc.keptW0 + N * c });
    for (const s of AUDIO.silences) silences.push({ ...s, start: r3(s.start + off), end: r3(s.end + off) });
    for (const k of FACES.keyframes) keyframes.push({ ...k, t: r3(k.t + off) });
    for (const cs of CONTENT.segments) {
      let type = cs.type;
      if ((type === "HOOK" && c > 0) || (type === "CTA" && c < copies - 1)) type = "POINT";
      content.segments.push({ ...cs, id: `${cs.id}_${c}`, type, sentenceIds: cs.sentenceIds.map((id) => sid(id, c)) });
    }
    for (const f of CONTENT.faceRequired) if (f.reason !== "cta" || c === copies - 1) content.faceRequired.push({ ...f, sentenceId: sid(f.sentenceId, c) });
    for (const e of CONTENT.emphasis) content.emphasis.push({ ...e, sentenceId: sid(e.sentenceId, c) });
    for (const v of CONTENT.visualSupport) content.visualSupport.push({ ...v, sentenceId: sid(v.sentenceId, c) });
  }
  content.cta = { ...CONTENT.cta, sentenceIds: CONTENT.cta.sentenceIds.map((id) => sid(id, copies - 1)) };
  return {
    source: { ...SOURCE_FIELDS, durationSec: r3(D * copies) }, words, sentences,
    transcriptMeta: { language: "en", sentences, fillerCandidates, repeatCandidates, retakeCandidates: [] },
    audio: { ...AUDIO, silences }, faces: { ...FACES, keyframes }, content,
  };
}
const FX89 = tileFixture(2);

function ctxFor(fx, extra = {}) {
  return {
    projectId: PROJECT_ID, source: fx.source, output: { aspect: "9:16" }, settings: {}, words: fx.words, sentences: fx.sentences,
    transcriptMeta: fx.transcriptMeta, audio: fx.audio, faces: fx.faces, content: fx.content, now: NOW, ...extra,
  };
}

// An over-complete director list: every sentence offers B-roll, two punch kinds, a card and three SFX, plus transitions.
function overComplete(fx) {
  const last = fx.sentences[fx.sentences.length - 1];
  const o = {
    source: "ai", brollOpportunities: [], punchIns: [], graphics: [], sfx: [], transitions: [],
    music: { include: true, mood: "upbeat", query: "upbeat pop", energy: 0.62, reason: "tone" },
    hookTitle: { text: "Stop wasting 3 hours a day", sentenceId: fx.sentences[0].id }, ctaCard: { text: "Follow for more", sentenceId: last.id },
  };
  fx.sentences.forEach((s, k) => {
    o.brollOpportunities.push({ sentenceId: s.id, wordAnchor: null, priority: r3(0.95 - (k % 5) * 0.1), layoutPreference: k % 4 === 3 ? "PIP" : "FULL",
      mediaPreference: "video", queries: ["office desk laptop", "person typing keyboard"], reason: "synthetic" });
    const w = Math.min(s.w1, s.w0 + 1);
    o.punchIns.push({ sentenceId: s.id, wordText: fx.words[w].text, w, w1: w, kind: "PUNCH_IN", priority: 0.8, reason: "synthetic" });
    o.punchIns.push({ sentenceId: s.id, wordText: fx.words[s.w1].text, w: s.w1, w1: s.w1, kind: "ZOOM_EMPHASIS", priority: 0.7, reason: "synthetic" });
    o.graphics.push({ kind: k % 2 ? "KEYWORD" : "STAT", sentenceId: s.id, title: `Point ${k + 1}`, value: String(k + 1), priority: 0.6, reason: "synthetic" });
    o.sfx.push({ anchor: "broll_in", ref: s.id, cue: k % 2 ? "swoosh" : "whoosh", priority: 0.7, reason: "synthetic" });
    o.sfx.push({ anchor: "punch_in", ref: s.id, cue: "pop", priority: 0.6, reason: "synthetic" });
    o.sfx.push({ anchor: "graphic_in", ref: s.id, cue: "ding", priority: 0.5, reason: "synthetic" });
    o.transitions.push({ afterSentenceId: s.id, kind: k % 2 ? "FLASH" : "DIP_BLACK", reason: "synthetic" });
  });
  return o;
}

// ---------------------------------------------------------------- independent rhythm checker
function windowMax(times, win = 60) {
  const s = times.slice().sort((a, b) => a - b);
  let best = 0;
  for (let i = 0; i < s.length; i++) best = Math.max(best, s.filter((x) => x >= s[i] - 1e-9 && x < s[i] + win - 1e-9).length);
  return best;
}
function unionSec(spans) {
  const pts = [];
  for (const [a, b] of spans) { pts.push([a, 1], [b, -1]); }
  pts.sort((x, y) => x[0] - y[0] || y[1] - x[1]);
  let depth = 0, total = 0, from = 0;
  for (const [x, d] of pts) { if (depth === 0 && d === 1) from = x; depth += d; if (depth === 0 && d === -1) total += x - from; }
  return total;
}
const overlapSec = (a, b) => Math.max(0, Math.min(a.outOut, b.outOut) - Math.max(a.outIn, b.outIn));

function sentenceOutSpan(plan, fx, id) {
  const map = T.buildTimeMap(plan.timeline.pieces);
  const s = sentence(id, fx.sentences);
  const kept = [];
  for (let i = s.w0; i <= s.w1; i++) { const r = map.resolveAnchor({ kind: "words", w0: i, w1: i }, fx.words); if (!r.collapsed) kept.push(r); }
  return kept.length ? { outIn: kept[0].outIn, outOut: kept[kept.length - 1].outOut } : null;
}

function checkRhythm(plan, fx, content, label) {
  const B = Rh.RHYTHM_DEFAULTS.broll[plan.settings.brollIntensity];
  const E = Rh.RHYTHM_DEFAULTS.effects[plan.settings.effects];
  const outDur = plan.timeline.outDurationSec;
  const msg = (m) => `${label}: ${m}`;
  const faceIds = (content.faceRequired || []).map((f) => f.sentenceId);
  const ctaIds = content.cta ? content.cta.sentenceIds : [];
  const protectedSpans = [...faceIds, ...ctaIds].map((id) => ({ id, span: sentenceOutSpan(plan, fx, id) })).filter((x) => x.span);
  const inGuard = (t0) => t0 < B.hookGuard - 1e-9 || t0 > outDur - 2 + 1e-9;

  // B-roll
  const items = plan.broll.filter((b) => (b.status === "pending" || b.status === "ok") && !b.resolved.collapsed)
    .sort((a, b) => a.resolved.outIn - b.resolved.outIn);
  const cov = unionSec(items.map((b) => [b.resolved.outIn, b.resolved.outOut])) / outDur;
  assert.ok(cov <= B.maxCoverage + 1e-6, msg(`coverage ${cov.toFixed(3)} > ${B.maxCoverage}`));
  assert.ok(windowMax(items.map((b) => b.resolved.outIn)) <= B.maxPer60, msg("B-roll items per 60 s window"));
  let run = 1, runStart = items.length ? items[0].resolved.outIn : 0;
  items.forEach((b, k) => {
    const d = b.resolved.outOut - b.resolved.outIn;
    if (b.origin !== "user") assert.ok(d >= B.minDur - 1e-3 && d <= B.maxDur + 1e-3, msg(`${b.id} duration ${d.toFixed(3)}`));
    for (const p of protectedSpans) assert.ok(overlapSec(b.resolved, p.span) < 1e-6, msg(`${b.id} covers protected sentence ${p.id}`));
    if (b.origin !== "user") assert.ok(b.resolved.outIn >= B.hookGuard - 1e-6, msg(`${b.id} inside the hook guard`));
    if (k === 0) return;
    const a = items[k - 1];
    const gap = b.resolved.outIn - a.resolved.outOut;
    const b2b = B.backToBackFull.allowed && a.layout === "FULL" && b.layout === "FULL" && gap < B.minFaceAfterFull;
    assert.ok(gap >= B.minGap - 1e-6 || b2b, msg(`gap ${gap.toFixed(3)} between ${a.id} and ${b.id}`));
    if (b2b) {
      run++;
      assert.ok(run <= B.backToBackFull.maxRun && b.resolved.outOut - runStart <= B.backToBackFull.maxRunSec + 1e-6, msg("back-to-back FULL run too long"));
    } else { run = 1; runStart = b.resolved.outIn; }
  });
  if (items.length) {
    assert.ok(items[0].resolved.outIn > 0, msg("video must start on the face"));
    assert.ok(items[items.length - 1].resolved.outOut <= outDur - 2 + 1e-6, msg("video must end on the face"));
  }
  const fulls = items.filter((b) => b.layout === "FULL");
  fulls.forEach((f, k) => {
    const next = fulls[k + 1];
    const room = (next ? next.resolved.outIn : outDur) - f.resolved.outOut;
    const b2b = next && B.backToBackFull.allowed && room < B.minFaceAfterFull;
    assert.ok(room >= B.minFaceAfterFull - 1e-6 || b2b, msg(`face after FULL ${f.id}: ${room.toFixed(3)} s`));
  });

  // graphics
  const live = plan.graphics.filter((g) => g.enabled && !g.resolved.collapsed);
  const capped = live.filter((g) => ["KEYWORD", "STAT", "LOWER_THIRD"].includes(g.kind));
  assert.ok(windowMax(capped.map((g) => g.resolved.outIn)) <= E.graphicsPer60, msg("graphics per 60 s"));
  assert.ok(live.filter((g) => g.kind === "HOOK_TITLE").length <= 1 && live.filter((g) => g.kind === "CTA").length <= 1, msg("hook/CTA cards ≤ 1 each"));
  for (const g of capped) {
    assert.ok(!inGuard(g.resolved.outIn) && g.resolved.outOut <= outDur - 2 + 0.6, msg(`${g.id} in hook guard or tail`));
    for (const p of protectedSpans) assert.ok(overlapSec(g.resolved, p.span) < 1e-6, msg(`${g.id} covers protected ${p.id}`));
    for (const f of fulls) assert.ok(overlapSec(g.resolved, f.resolved) < 1e-6, msg(`${g.id} overlaps FULL B-roll ${f.id}`));
  }
  for (let k = 1; k < live.length; k++) {
    const sorted = live.slice().sort((a, b) => a.resolved.outIn - b.resolved.outIn);
    assert.ok(sorted[k].resolved.outIn >= sorted[k - 1].resolved.outOut - 1e-6, msg("graphics overlap each other"));
  }

  // effects
  const auto = plan.effects.filter((e) => e.enabled && e.origin !== "user");
  const punches = auto.filter((e) => e.kind === "PUNCH_IN").map((e) => e.resolved.outIn);
  const zooms = auto.filter((e) => e.kind === "ZOOM_EMPHASIS").map((e) => e.resolved.outIn);
  assert.ok(windowMax(punches) <= E.punchPer60, msg("punch-ins per 60 s"));
  const emph = [...punches, ...zooms].sort((a, b) => a - b);
  for (let k = 1; k < emph.length; k++) assert.ok(emph[k] - emph[k - 1] >= E.punchSpacing - 1e-6, msg(`punch spacing ${emph[k] - emph[k - 1]}`));
  if (!E.zoomEmphasis) assert.equal(zooms.length, 0, msg("ZOOM_EMPHASIS is off at subtle"));
  else assert.ok(windowMax(zooms) <= E.zoomEmphasis.per60, msg("ZOOM_EMPHASIS per 60 s"));
  for (const z of auto.filter((e) => e.kind === "ZOOM_EMPHASIS")) assert.ok(z.durationSec >= 0.6 - 1e-9 && z.durationSec <= 1.2 + 1e-9 && z.toZoom - z.fromZoom <= 0.12 + 1e-9, msg("ZOOM_EMPHASIS shape"));
  assert.ok(auto.filter((e) => e.kind === "FREEZE").length <= (E.freeze ? E.freeze.maxPerVideo : 0), msg("FREEZE count"));
  assert.equal(auto.filter((e) => e.kind === "SPEED").length, 0, msg("SPEED is never auto-selected"));

  // SFX
  const sfx = plan.sfx.filter((s) => s.enabled && s.origin !== "user").sort((a, b) => a.resolved.outAt - b.resolved.outAt);
  assert.ok(windowMax(sfx.map((s) => s.resolved.outAt)) <= E.sfx.per60, msg("SFX per 60 s"));
  sfx.forEach((s, k) => {
    assert.ok(s.volume >= E.sfx.volume[0] - 1e-9 && s.volume <= E.sfx.volume[1] + 1e-9, msg(`SFX volume ${s.volume}`));
    assert.ok(!inGuard(s.resolved.outAt), msg(`SFX ${s.id} in hook guard or tail`));
    for (const p of protectedSpans) assert.ok(!(s.resolved.outAt >= p.span.outIn - 1e-9 && s.resolved.outAt < p.span.outOut), msg(`SFX ${s.id} on protected ${p.id}`));
    if (k > 0) {
      assert.ok(s.resolved.outAt - sfx[k - 1].resolved.outAt >= E.sfx.spacing - 1e-6, msg("SFX spacing"));
      assert.notEqual(s.cue, sfx[k - 1].cue, msg("identical consecutive SFX cues"));
    }
  });

  // transitions
  const tr = plan.transitions.filter((x) => x.enabled && x.kind !== "CUT");
  assert.ok(tr.length <= E.transitions.max, msg("non-cut transitions cap"));
  const trTimes = tr.map((x) => plan.aRoll.segments.find((sg) => sg.id === x.at.elementId).resolved.outOut).sort((a, b) => a - b);
  for (let k = 1; k < trTimes.length; k++) assert.ok(trTimes[k] - trTimes[k - 1] >= E.transitions.spacing - 1e-6, msg("transition spacing"));
  return { items, sfx, capped, punches };
}

function assertValid(plan, words, label) {
  const r = S.parsePlan(plan, { wordCount: words.length });
  assert.ok(r.ok, `${label}: ${JSON.stringify(r.issues.slice(0, 5))}`);
}

// ======================================================================== lexicon / queries
section("director/lexicon + opportunities — text rules");

t("CTA patterns match in all eight languages and bare 'follow' mid-sentence is not a CTA", () => {
  const yes = [["en", "If this helped, follow for more tips and share it with a friend."], ["en", "Subscribe for part two"],
    ["es", "Sígueme para más consejos"], ["fr", "Abonnez-vous pour la suite"], ["de", "Folgt mir für mehr Tipps"], ["pt", "Siga para mais dicas"],
    ["hi", "चैनल को सब्सक्राइब करें"], ["ar", "اشترك في القناة"], ["ja", "チャンネル登録してね"]];
  for (const [lang, text] of yes) assert.ok(Lx.ctaMatch(text, lang), `${lang}: ${text}`);
  assert.equal(Lx.ctaMatch("I follow one simple rule every day.", "en"), null);
  assert.equal(Lx.ctaMatch("The rest of the day, notifications stay off.", "en"), null);
  assert.equal(Lx.langCode("pt-BR"), "pt");
  assert.equal(Lx.langCode("xx"), "en");
});

t("queries keep concrete subjects only: camera words stripped, logos dropped, acronym whitelist kept", () => {
  assert.equal(Op.cleanQuery("cinematic slow motion shot of city skyline"), "city skyline");
  assert.equal(Op.cleanQuery("camera pans over a laptop"), "laptop");
  assert.equal(Op.cleanQuery("5G tower at night"), "5G tower night");
  assert.equal(Op.cleanQuery("AI robot arm"), "AI robot arm");
  assert.equal(Op.cleanQuery("UX designer with SEO dashboard"), "UX designer SEO dashboard");
  assert.equal(Op.cleanQuery("Nike logo on a shoe"), "");
  assert.equal(Op.cleanQuery("café con leche", "es"), "café leche");
  assert.ok(Op.cleanQuery("one two three four five six seven eight nine ten words here").split(" ").length <= 5);
  assert.deepEqual(Op.cleanQueries(["Laptop", "laptop", "zoom", "desk"]), ["laptop", "desk"]);
});

t("fuzzy phrase matching resolves verbatim-ish text inside a sentence only", () => {
  const s10 = sentence("s10"), s8 = sentence("s8"), s1 = sentence("s1");
  assert.deepEqual(Lx.matchPhrase(WORDS, s10.w0, s10.w1, "google calender", "en"), { w0: wi("s10", "Google"), w1: wi("s10", "Calendar"), score: Lx.matchPhrase(WORDS, s10.w0, s10.w1, "google calender", "en").score });
  assert.equal(Lx.matchPhrase(WORDS, s8.w0, s8.w1, "two weeks earlier", "en").w0, wi("s8", "two"));
  assert.deepEqual([Lx.matchPhrase(WORDS, s1.w0, s1.w1, "three hours", "en").w0, Lx.matchPhrase(WORDS, s1.w0, s1.w1, "three hours", "en").w1], [wi("s1", "3"), wi("s1", "hours")]);
  assert.equal(Lx.matchPhrase(WORDS, s1.w0, s1.w1, "banana", "en"), null);
  assert.equal(Lx.matchPhrase(WORDS, s1.w0, s1.w1, "Calendar", "en"), null, "never matches outside the sentence");
  const ja = [{ i: 0, text: "チャンネル" }, { i: 1, text: "登録" }, { i: 2, text: "して" }, { i: 3, text: "ね" }];
  assert.deepEqual([Lx.matchPhrase(ja, 0, 3, "チャンネル登録", "ja").w0, Lx.matchPhrase(ja, 0, 3, "チャンネル登録", "ja").w1], [0, 1]);
});

t("titles are condensed at word boundaries and never end on a function word", () => {
  assert.equal(Op.condenseTitle("Shipped two weeks early and it was amazing"), "Shipped two weeks early");
  assert.equal(Op.condenseTitle("follow for more tips."), "Follow for more tips");
  assert.ok(Op.condenseTitle("x".repeat(80)).length <= 32);
});

// ======================================================================== heuristic
section("director/heuristic — rules without an LLM");

const HEUR = H.heuristicOpportunities({ content: null, sentences: TRANSCRIPT.sentences, words: WORDS, faces: FACES, settings: {}, lang: "en" });

t("hook, CTA card, STAT, punch-ins, music and whoosh follow the §6 heuristic", () => {
  assert.equal(HEUR.source, "heuristic");
  assert.deepEqual(HEUR.hookTitle, { text: "Most people waste 3 hours a day", sentenceId: "s1" });
  assert.equal(HEUR.ctaCard.sentenceId, "s12");
  assert.match(HEUR.ctaCard.text, /^Follow for more/);
  const stats = HEUR.graphics.filter((g) => g.kind === "STAT").map((g) => [g.sentenceId, g.title, g.value]);
  assert.deepEqual(stats, [["s1", "3 hours", "3"], ["s8", "2 weeks", "2"]]);
  assert.ok(!HEUR.graphics.some((g) => g.sentenceId === "s5" && g.kind === "STAT"), "10 AM is a time of day, not a stat");
  const punch = new Map(HEUR.punchIns.map((p) => [p.sentenceId, p]));
  assert.equal(punch.get("s1").wordText, "Most", "superlative outranks the number");
  assert.equal(punch.get("s8").w, wi("s8", "two"));
  assert.ok(!punch.has("s2") && !punch.has("s7"), "no emphasis word, no punch-in");
  assert.deepEqual([HEUR.music.mood, HEUR.music.query, HEUR.music.include], ["energetic", "energetic background", true]);
  assert.ok(HEUR.sfx.every((s) => s.cue === "whoosh" && s.anchor === "broll_in"));
  const fullSentences = new Set(HEUR.brollOpportunities.filter((b) => b.layoutPreference === "FULL").map((b) => b.sentenceId));
  assert.deepEqual(new Set(HEUR.sfx.map((s) => s.ref)), fullSentences);
});

t("B-roll opportunities: salient nouns, concrete 2–4 queries, never on CTA or personal sentences", () => {
  const profiles = new Map(H.analyzeSentences({ sentences: TRANSCRIPT.sentences, words: WORDS, lang: "en" }).map((p) => [p.id, p]));
  assert.ok(HEUR.brollOpportunities.length >= 4, `only ${HEUR.brollOpportunities.length} opportunities`);
  for (const b of HEUR.brollOpportunities) {
    assert.ok(profiles.get(b.sentenceId).salient.length >= 1, `${b.sentenceId} has no salient noun`);
    assert.ok(b.queries.length >= 2 && b.queries.length <= 4 && b.queries.every((q) => q.split(" ").length <= 5 && !/zoom|pan|shot|cinematic|logo/i.test(q)));
    assert.ok(b.priority >= 0 && b.priority <= 1);
    assert.notEqual(b.sentenceId, "s12");
  }
  const s10 = HEUR.brollOpportunities.find((b) => b.sentenceId === "s10");
  assert.ok(s10 && s10.queries.includes("google calendar"), JSON.stringify(s10));
  const personal = H.heuristicOpportunities({ content: null, words: [
    { i: 0, text: "Honestly", start: 0.5, end: 0.9 }, { i: 1, text: "I", start: 1.0, end: 1.1 }, { i: 2, text: "was", start: 1.2, end: 1.4 },
    { i: 3, text: "so", start: 1.5, end: 1.6 }, { i: 4, text: "scared", start: 1.7, end: 2.1 }, { i: 5, text: "of", start: 2.2, end: 2.3 }, { i: 6, text: "airplanes.", start: 2.4, end: 3.0 },
  ], sentences: [{ id: "p1", w0: 0, w1: 6, start: 0.5, end: 3.0, text: "Honestly I was so scared of airplanes." }], faces: null, lang: "en" });
  assert.equal(personal.brollOpportunities.length, 0, "first-person emotional sentence keeps the face");
});

t("deterministic content: hook first, CTA last, every sentence in exactly one segment, CTA face-required", () => {
  const dc = H.deterministicContent({ sentences: TRANSCRIPT.sentences, words: WORDS, faces: FACES, lang: "en" });
  assert.equal(dc.deterministic, true);
  assert.deepEqual(dc.hook, { sentenceIds: ["s1"], strength: 0.6 });
  assert.deepEqual(dc.cta.sentenceIds, ["s12"]);
  assert.equal(dc.segments[0].type, "HOOK");
  assert.equal(dc.segments[dc.segments.length - 1].type, "CTA");
  assert.deepEqual(dc.segments.flatMap((s) => s.sentenceIds), TRANSCRIPT.sentences.map((s) => s.id));
  assert.ok(dc.faceRequired.some((f) => f.sentenceId === "s12" && f.reason === "cta"));
  assert.ok(!dc.faceRequired.some((f) => f.sentenceId === "s4"), "stutter 'I, I' does not make s4 personal");
  assert.equal(H.categoryFor("people waste hours on email"), "generic", "'ai' inside 'email' is not the AI category");
  assert.equal(H.categoryFor("our AI chatbot answers customers"), "ai");
});

t("heuristic output is deterministic and does not mutate its inputs", () => {
  const w = clone(WORDS), s = clone(TRANSCRIPT.sentences);
  const a = H.heuristicOpportunities({ content: CONTENT, sentences: s, words: w, faces: FACES, lang: "en" });
  const b = H.heuristicOpportunities({ content: clone(CONTENT), sentences: clone(s), words: clone(w), faces: clone(FACES), lang: "en" });
  assert.equal(sha256Json(a), sha256Json(b));
  assert.deepEqual(w, WORDS);
  assert.ok(!a.brollOpportunities.some((x) => ["s2", "s11", "s12"].includes(x.sentenceId)), "content faceRequired is respected");
  assert.throws(() => H.heuristicOpportunities({ sentences: [{ id: "x", w0: 5, w1: 999, start: 0, end: 1 }], words: WORDS }), (e) => isEditError(e) && e.code === "INVALID_DIRECTOR_INPUT");
});

// ======================================================================== framing
section("director/framing — dead zone, eased moves, headroom, assumed faces");

t("assumed or missing faces give one static centre-weighted keyframe", () => {
  const mezz = { w: 1080, h: 1920 };
  for (const faces of [null, { mode: "assumed", keyframes: [] }]) {
    const [f] = Fr.framingForSegments([{ srcIn: 1, srcOut: 9 }], faces, { aspect: "9:16", mezz });
    assert.equal(f.mode, "static");
    assert.equal(f.keyframes.length, 1);
    assert.deepEqual([f.keyframes[0].src, f.keyframes[0].cx, f.keyframes[0].zoom, f.locked], [1, 0.5, 1, false]);
    assert.ok(f.keyframes[0].cy > 0.3 && f.keyframes[0].cy < 0.5);
  }
  assert.equal(Fr.faceBoxAt(null, 3).assumed, true);
  assert.throws(() => Fr.framingForSegments([{ srcIn: 0, srcOut: 1 }], null, { aspect: "9:16" }), (e) => isEditError(e));
});

t("the slowly drifting fixture face stays inside the dead zone; a real jump eases over 0.5 s once", () => {
  const drift = Fr.framingForSegments([{ srcIn: 0, srcOut: 44 }], FACES, { aspect: "9:16", mezz: { w: 1080, h: 1920 } })[0];
  assert.equal(drift.mode, "static");
  const mezz = { w: 1920, h: 1080 };
  const faces = { mode: "tracked", absent: [], keyframes: [
    { t: 0, cx: 0.3, cy: 0.4, h: 0.3 }, { t: 2, cx: 0.305, cy: 0.4, h: 0.3 }, { t: 4, cx: 0.31, cy: 0.41, h: 0.3 },
    { t: 6, cx: 0.62, cy: 0.41, h: 0.3 }, { t: 6.2, cx: 0.63, cy: 0.41, h: 0.3 }, { t: 9, cx: 0.635, cy: 0.41, h: 0.3 },
  ] };
  const f = Fr.framingForSegments([{ srcIn: 0, srcOut: 10 }], faces, { aspect: "9:16", mezz })[0];
  assert.equal(f.mode, "follow");
  assert.deepEqual(f.keyframes.map((k) => [k.src, k.cx]), [[0, 0.3], [6, 0.3], [6.5, 0.62]]);
  const jitter = { mode: "tracked", absent: [], keyframes: Array.from({ length: 20 }, (_, k) => ({ t: k * 0.5, cx: 0.5 + (k % 2 ? 0.03 : -0.03), cy: 0.4, h: 0.3 })) };
  assert.equal(Fr.framingForSegments([{ srcIn: 0, srcOut: 10 }], jitter, { aspect: "9:16", mezz: { w: 1080, h: 1920 } })[0].keyframes.length, 1);
  const locked = { framing: { mode: "static", zoomBase: 1.2, keyframes: [{ src: 0, cx: 0.1, cy: 0.2, zoom: 1.2 }], locked: true }, srcIn: 0, srcOut: 5 };
  assert.deepEqual(Fr.framingForSegments([locked], faces, { aspect: "9:16", mezz })[0], locked.framing);
  const absent = { ...faces, absent: [{ start: 5, end: 8 }] };
  assert.equal(Fr.faceBoxAt(absent, 6).absent, true);
  assert.equal(Fr.faceBoxAt(FACES, 10, { mezz: { w: 1080, h: 1920 } }).assumed, false);
});

t("headroom: the renderer formula keeps ≥ 8 % of the crop height above the face", () => {
  const mezz = { w: 1080, h: 1920 };
  const face = { cx: 0.5, cy: 0.5, h: 0.3 };
  const c = Fr.framingTarget(face, { aspect: "16:9", mezz });
  const cropH = mezz.w / (16 / 9);
  const y = c.cy * mezz.h - T.FACE_Y_TARGET["16:9"] * cropH;
  const faceTop = (face.cy - face.h / 2) * mezz.h;
  assert.ok(faceTop - y >= Fr.HEADROOM * cropH - 1e-3, `headroom ${(faceTop - y) / cropH}`);
  assert.ok(c.cy < face.cy, "the framing point moves up to make room");
});

// ======================================================================== director (LLM)
section("director/director — ve_director with an injected model");

const REALISTIC_REPLY = {
  brollOpportunities: [
    { sentenceId: "s10", wordAnchor: { fromText: "google calender", toText: "meetings" }, priority: 1.4, layoutPreference: "full", mediaPreference: "VIDEO",
      queries: ["calendar app on laptop screen", "cinematic slow motion zoom on google logo", "time blocks planner"], reason: "shows the method" },
    { sentenceId: "s10", wordAnchor: null, priority: 0.5, layoutPreference: "FULL", queries: ["calendar app on laptop screen", "planner"], reason: "duplicate" },
    { sentenceId: "s10", wordAnchor: { fromText: "Google Calendar", toText: "meetings." }, priority: 0.6, layoutPreference: "FULL", queries: ["weekly planner", "desk calendar"], reason: "same anchor again" },
    { sentenceId: "s99", priority: 0.9, layoutPreference: "FULL", queries: ["office", "desk"], reason: "unknown sentence" },
    { sentenceId: "s6", wordAnchor: { fromText: "notifications", toText: "off" }, priority: 0.7, layoutPreference: "PIP", mediaPreference: "either", queries: ["phone face down table", "silent phone"], reason: "notifications off" },
    { sentenceId: "s4", priority: 0.66, queries: ["zoom", "drone shot"], reason: "only camera words" },
  ],
  punchIns: [
    { sentenceId: "s8", wordText: "two weeks earlier", kind: "PUNCH_IN", priority: 0.8, reason: "result" },
    { sentenceId: "s4", wordText: "banana", priority: 0.5, reason: "hallucinated" },
    { sentenceId: "s1", wordText: "3 hours", kind: "zoom_emphasis", priority: -2, reason: "number" },
    { sentenceId: "s404", wordText: "twice", priority: 0.9 },
  ],
  graphics: [
    { kind: "STAT", sentenceId: "s8", title: "Shipped two weeks early and it was amazing", value: "2", priority: 0.7, reason: "result stat" },
    { kind: "BANNER", sentenceId: "s8", title: "unknown kind", priority: 0.9 },
  ],
  sfx: [{ anchor: "broll_in", ref: "s10", cue: "whoosh", priority: 0.6, reason: "entry" }, { anchor: "broll_in", ref: "br_77", cue: "whoosh", priority: 0.6 }, { anchor: "punch_in", ref: "s8", cue: "kaboom", priority: 0.5 }],
  music: { include: true, mood: "Upbeat", query: "upbeat acoustic pop background music", energy: 0.65, reason: "tone" },
  transitions: [{ afterSentenceId: "s8", kind: "DIP_BLACK", reason: "topic change" }, { afterSentenceId: "s77", kind: "FLASH" }],
  hookTitle: { text: "The 3-hour email trap", sentenceId: "s1" },
  ctaCard: { text: "Follow for more tips", sentenceId: "s12" },
};
const reply = (value, extra = {}) => ({ text: typeof value === "string" ? value : JSON.stringify(value), tokensIn: 900, tokensOut: 300, costUsd: 0.001, model: "meta/muse-spark-1.3-contributor", ...extra });
function fakeCallJson(replies, calls) {
  let n = 0;
  return (args) => {
    calls.push(args);
    return callJson({ ...args, chat: async () => replies[Math.min(n++, replies.length - 1)] });
  };
}

t("directEdit: doctrine in the prompt, JSON user payload, sanitized opportunities", async () => {
  const calls = [];
  const r = await Dir.directEdit({ content: CONTENT, sentences: TRANSCRIPT.sentences, words: WORDS, faces: FACES, settings: { brollIntensity: "medium" }, lang: "en",
    callJson: fakeCallJson([reply(REALISTIC_REPLY)], calls), now: NOW });
  assert.equal(calls.length, 1);
  const a = calls[0];
  assert.deepEqual([a.stage, a.promptVersion, a.temperature, a.schema === Dir.DirectorReplySchema], ["ve_director", "ve_director@2", 0, true]);
  for (const phrase of ["director, not a renderer", "SUPPORTS the speaker; it never replaces them", "sincere, personal, emotional, humorous", "call-to-action",
    "concrete visual nouns", "No camera or motion words", "no brand names or logos", "FEWER, STRONGER", "genuine emphasis", "Graphics are sparse",
    "semantic purpose", "mood from the tone", "strictly as data"]) assert.ok(a.system.includes(phrase), `system prompt lacks '${phrase}'`);
  const input = JSON.parse(a.user);
  assert.equal(input.sentences.length, 12);
  assert.ok(input.sentences.every((s) => typeof s.text === "string" && Number.isFinite(s.outDur) && Number.isFinite(s.faceVisiblePct)));
  assert.deepEqual(input.vocabularies.layouts, ["FULL", "PIP", "SPLIT"]);
  assert.ok(!/base64|input_audio|video_url/.test(a.user));

  const o = r.opportunities;
  assert.equal(o.source, "ai");
  assert.deepEqual(o.brollOpportunities.map((b) => b.sentenceId), ["s10", "s6", "s10"], "unknown sentence, camera-only queries and duplicate anchors dropped");
  const top = o.brollOpportunities[0];
  assert.deepEqual([top.priority, top.layoutPreference, top.mediaPreference], [1, "FULL", "video"]);
  assert.deepEqual([top.wordAnchor.w0, top.wordAnchor.w1], [wi("s10", "Google"), wi("s10", "meetings.")]);
  assert.deepEqual(top.queries, ["calendar app laptop screen", "time blocks planner"]);
  assert.equal(o.brollOpportunities[2].wordAnchor, null);
  assert.deepEqual(o.punchIns.map((p) => [p.sentenceId, p.w, p.kind, p.priority]), [["s8", wi("s8", "two"), "PUNCH_IN", 0.8], ["s1", wi("s1", "3"), "ZOOM_EMPHASIS", 0]]);
  assert.deepEqual(o.graphics.map((g) => [g.kind, g.title]), [["HOOK_TITLE", "The 3-hour email trap"], ["CTA", "Follow for more tips"], ["STAT", "Shipped two weeks early"]]);
  assert.equal(o.graphics[2].w, wi("s8", "two"), "STAT value resolved to the spoken number");
  assert.deepEqual(o.sfx.map((s) => [s.anchor, s.ref, s.cue]), [["broll_in", "s10", "whoosh"]]);
  assert.deepEqual(o.transitions.map((x) => x.afterSentenceId), ["s8"]);
  assert.deepEqual(o.music, { include: true, mood: "upbeat", query: "upbeat acoustic pop background", energy: 0.65, reason: "tone" });
  assert.ok(o.brollOpportunities.every((b) => /^opp_b\d{3}$/.test(b.id)));
  assert.deepEqual([r.report.unknownSentence, r.report.unresolvedWord, r.report.weakQueries, r.report.unknownRef], [3, 1, 1, 1], "s99 B-roll, s404 punch-in, s77 transition");
  assert.ok(r.report.clampedPriority >= 2);
  assert.deepEqual([r.provenance.model, r.provenance.costUsd, r.provenance.fallback, r.provenance.attempts, r.provenance.promptHash], ["meta/muse-spark-1.3-contributor", 0.001, false, 1, Dir.PROMPT_HASH]);
  assert.ok(S.OpportunitiesSchema.safeParse(Op.toPlanOpportunities(o)).success, "plan.opportunities shape");
});

t("an invalid first reply gets exactly one repair re-ask", async () => {
  const calls = [];
  const r = await Dir.directEdit({ sentences: TRANSCRIPT.sentences, words: WORDS, callJson: fakeCallJson([reply({ brollOpportunities: [] }), reply(REALISTIC_REPLY)], calls) });
  assert.equal(r.provenance.attempts, 2);
  assert.ok(r.opportunities.brollOpportunities.length > 0);
  await assert.rejects(Dir.directEdit({ sentences: TRANSCRIPT.sentences, words: WORDS, callJson: fakeCallJson([reply("not json")], []) }), (e) => e.code === "LLM_INVALID_JSON");
});

// ======================================================================== rhythm
section("director/rhythm — deterministic selection");

t("RHYTHM_DEFAULTS mirror both EDIT_PLAN §6 tables", () => {
  const B = Rh.RHYTHM_DEFAULTS.broll, E = Rh.RHYTHM_DEFAULTS.effects;
  const pick = (o, keys) => keys.map((k) => o[k]);
  const bk = ["maxCoverage", "maxPer60", "minGap", "minDur", "maxDur", "hookGuard", "threshold", "minFaceAfterFull"];
  assert.deepEqual(pick(B.low, bk), [0.12, 2, 8, 1.8, 4.0, 2.5, 0.7, 3.0]);
  assert.deepEqual(pick(B.medium, bk), [0.25, 4, 5, 1.5, 4.5, 2.0, 0.55, 2.0]);
  assert.deepEqual(pick(B.high, bk), [0.4, 7, 3, 1.2, 5.0, 1.5, 0.4, 1.5]);
  assert.deepEqual([B.low.backToBackFull.allowed, B.medium.backToBackFull.allowed, B.high.backToBackFull.allowed, B.high.backToBackFull.maxRun, B.high.backToBackFull.maxRunSec], [false, false, true, 2, 8]);
  assert.deepEqual([E.subtle.jumpCutZ1, E.subtle.punchPer60, E.subtle.punchSpacing, E.subtle.zoomEmphasis, E.subtle.freeze, E.subtle.speed], [1.1, 2, 10, null, null, null]);
  assert.deepEqual([E.dynamic.jumpCutZ1, E.dynamic.punchPer60, E.dynamic.punchSpacing, E.dynamic.zoomEmphasis.per60, E.dynamic.zoomEmphasis.minSec, E.dynamic.zoomEmphasis.maxSec, E.dynamic.zoomEmphasis.maxDeltaZ], [1.2, 5, 5, 2, 0.6, 1.2, 0.12]);
  assert.deepEqual([E.dynamic.freeze.maxPerVideo, E.dynamic.freeze.minSec, E.dynamic.freeze.maxSec, E.dynamic.speed.min, E.dynamic.speed.max], [1, 0.4, 0.6, 0.8, 1.5]);
  assert.deepEqual([E.subtle.transitions, E.dynamic.transitions], [{ max: 1, spacing: 20 }, { max: 3, spacing: 12 }]);
  assert.deepEqual([E.subtle.sfx, E.dynamic.sfx], [{ per60: 2, spacing: 6, volume: [0.2, 0.3] }, { per60: 5, spacing: 3, volume: [0.25, 0.4] }]);
  assert.deepEqual([E.subtle.graphicsPer60, E.dynamic.graphicsPer60], [1, 2]);
  assert.ok(Object.isFrozen(B.low) && Object.isFrozen(E.dynamic.sfx.volume));
  assert.equal(Rh.maxInWindow([0, 10, 59.9, 60, 61], 60), 4, "the window starting at 10 s holds 10, 59.9, 60 and 61");
  assert.equal(Rh.maxInWindow([0, 60, 120], 60), 1, "windows are half-open");
  assert.equal(windowMax([0, 10, 59.9, 60, 61]), Rh.maxInWindow([0, 10, 59.9, 60, 61], 60), "engine and checker agree");
});

const MATRIX = [];
for (const brollIntensity of ["low", "medium", "high"]) for (const effects of ["subtle", "dynamic"]) MATRIX.push({ brollIntensity, effects });

for (const [fxName, fx] of [["45 s", FX45], ["89 s tiled", FX89]]) {
  t(`rhythm invariants hold for all intensities × effects (${fxName}; over-complete director list and heuristic)`, async () => {
    const over = overComplete(fx);
    const counts = {};
    for (const settings of MATRIX) {
      for (const [src, opportunities] of [["over", over], ["heuristic", null]]) {
        const label = `${fxName}/${settings.brollIntensity}/${settings.effects}/${src}`;
        const plan = await BP.buildInitialPlan(ctxFor(fx, { settings, opportunities }));
        assertValid(plan, fx.words, label);
        const got = checkRhythm(plan, fx, fx.content, label);
        counts[label] = got.items.length;
        if (src === "over") {
          // accountability: every opportunity placed or logged
          const adj = plan.provenance.rhythm.adjustments.filter((a) => a.action === "dropped");
          const dropped = (p) => adj.filter((a) => a.elementId.startsWith(p)).length;
          const finalized = Op.finalizeOpportunities(over, { sentences: fx.sentences, source: "ai" });
          assert.equal(plan.broll.length + dropped("opp_b"), finalized.brollOpportunities.length, `${label}: B-roll accounting`);
          assert.equal(plan.effects.filter((e) => e.kind === "PUNCH_IN" || e.kind === "ZOOM_EMPHASIS").length + dropped("opp_p"), finalized.punchIns.length, `${label}: punch accounting`);
          assert.equal(plan.graphics.length + dropped("opp_g"), finalized.graphics.length, `${label}: graphics accounting`);
          assert.equal(plan.sfx.length + dropped("opp_s"), finalized.sfx.length, `${label}: SFX accounting`);
          assert.equal(plan.transitions.length + dropped("opp_t"), finalized.transitions.length, `${label}: transition accounting`);
          assert.ok(plan.provenance.rhythm.adjustments.every((a) => a.rule.length <= 40 && S.ENUMS.adjustmentAction.includes(a.action)));
          assert.equal(plan.graphics.filter((g) => g.kind === "HOOK_TITLE").length, 1, `${label}: hook title placed`);
          assert.equal(plan.graphics.filter((g) => g.kind === "CTA").length, 1, `${label}: CTA card placed`);
          if (settings.effects === "dynamic") assert.equal(plan.effects.filter((e) => e.kind === "FREEZE").length, 1, `${label}: freeze before the CTA`);
        }
      }
    }
    for (const src of ["over", "heuristic"]) {
      for (const eff of ["subtle", "dynamic"]) {
        const [lo, me, hi] = ["low", "medium", "high"].map((i) => counts[`${fxName}/${i}/${eff}/${src}`]);
        assert.ok(lo <= me && me <= hi, `${fxName}/${eff}/${src}: B-roll counts not monotone ${lo}/${me}/${hi}`);
      }
    }
    const [loO, hiO] = [counts[`${fxName}/low/subtle/over`], counts[`${fxName}/high/subtle/over`]];
    assert.ok(hiO > loO, `${fxName}: high intensity should place more B-roll than low (${loO} vs ${hiO})`);
  });
}

t("60 s windows bind on the tiled video: medium never exceeds 4 B-roll starts in any window", async () => {
  const plan = await BP.buildInitialPlan(ctxFor(FX89, { settings: { brollIntensity: "medium" }, opportunities: overComplete(FX89) }));
  const starts = plan.broll.map((b) => b.resolved.outIn);
  assert.ok(plan.timeline.outDurationSec > 70, `tiled output ${plan.timeline.outDurationSec}`);
  assert.ok(windowMax(starts) <= 4);
  assert.ok(plan.provenance.rhythm.adjustments.some((a) => ["window_cap", "coverage", "min_gap"].includes(a.rule)), "a cap was actually exercised");
});

t("disabled SFX / music settings, shaky spans and face-absent spans are honoured", async () => {
  const over = overComplete(FX45);
  const quiet = await BP.buildInitialPlan(ctxFor(FX45, { settings: { sfxEnabled: false, musicEnabled: false }, opportunities: over }));
  assert.equal(quiet.sfx.length, 0);
  assert.equal(quiet.music, null);
  assert.ok(quiet.provenance.rhythm.adjustments.some((a) => a.rule === "sfx_disabled") && quiet.provenance.rhythm.adjustments.some((a) => a.rule === "music_disabled"));
  const base = await BP.buildInitialPlan(ctxFor(FX45, { opportunities: over }));
  const firstPunch = base.effects.find((e) => e.kind === "PUNCH_IN");
  const srcAt = firstPunch.anchor.srcIn;
  const shaky = await BP.buildInitialPlan(ctxFor(FX45, { opportunities: over, shaky: [{ start: srcAt - 0.2, end: srcAt + 0.2 }] }));
  assert.ok(!shaky.effects.some((e) => e.kind === "PUNCH_IN" && Math.abs(e.anchor.srcIn - srcAt) < 0.2), "punch-in inside a shaky span");
  assert.ok(shaky.provenance.rhythm.adjustments.some((a) => a.rule === "shaky"));
  const b0 = base.broll[0];
  const absentFaces = { ...FACES, absent: [{ start: b0.anchor.srcIn - 0.5, end: b0.anchor.srcOut + 0.5 }] };
  const absent = await BP.buildInitialPlan(ctxFor(FX45, { opportunities: over, faces: absentFaces }));
  assert.ok(!absent.broll.some((b) => b.anchor.srcOut > absentFaces.absent[0].start && b.anchor.srcIn < absentFaces.absent[0].end), "B-roll over a face-absent span");
  assert.ok(absent.provenance.rhythm.adjustments.some((a) => a.rule === "face_absent"));
});

t("layout adapts to the aspect: SPLIT becomes FULL on 1:1; PIP corners stay away from the face", async () => {
  const over = overComplete(FX45);
  over.brollOpportunities.forEach((b) => { b.layoutPreference = "SPLIT"; });
  const square = await BP.buildInitialPlan(ctxFor(FX45, { output: { aspect: "1:1" }, opportunities: over, settings: { brollIntensity: "high" } }));
  assertValid(square, WORDS, "1:1");
  assert.ok(square.broll.length > 0 && square.broll.every((b) => b.layout === "FULL"));
  over.brollOpportunities.forEach((b) => { b.layoutPreference = "PIP"; });
  const pip = await BP.buildInitialPlan(ctxFor(FX45, { opportunities: over, settings: { brollIntensity: "high" } }));
  assert.ok(pip.broll.length > 0 && pip.broll.every((b) => b.layout === "PIP" && b.layoutParams.scale === 0.4));
  for (const b of pip.broll) {
    const face = T.faceAt(FACES, WORDS[b.evidence.wordRange[0]].start);
    assert.equal(b.layoutParams.corner, face.cx >= 0.5 ? "tl" : "tr", `${b.id}: PIP corner on the face side (face cx ${face.cx})`);
  }
  const wide = await BP.buildInitialPlan(ctxFor(FX45, { output: { aspect: "16:9" }, faces: { mode: "assumed", keyframes: [], absent: [] } }));
  assertValid(wide, WORDS, "16:9 assumed faces");
  assert.ok(wide.aRoll.segments.every((s) => s.framing.mode === "static" && s.framing.keyframes.length === 1));
});

// ======================================================================== build_plan
section("director/build_plan — revision 1, fallback, determinism, pins");

t("heuristic path (no content, no LLM): valid plan with captions, filler + silence cuts and safe B-roll", async () => {
  const plan = await BP.buildInitialPlan(ctxFor(FX45, { content: null }));
  assertValid(plan, WORDS, "heuristic");
  assert.deepEqual([plan.revision, plan.parentRevision, plan.createdBy, plan.createdAt], [1, null, "heuristic", NOW]);
  assert.deepEqual(plan.provenance.director, { model: null, stage: "ve_director", promptHash: null, costUsd: 0, fallback: true });
  assert.ok(plan.captions.enabled && plan.captions.cues.length > 20);
  const o = outline(plan);
  assert.equal(o.summary.fillersRemoved, 5, "five pure fillers under 'light'");
  assert.ok(o.summary.silenceRemovedSec > 1.5, `silence ${o.summary.silenceRemovedSec}`);
  assert.ok(plan.cuts.some((c) => c.kind === "SILENCE" && c.controlledBy === "removeSilence") && plan.cuts.some((c) => c.kind === "FILLER" && c.controlledBy === "removeFillers"));
  assert.ok(plan.broll.length >= 1, "at least one B-roll item");
  const dc = H.deterministicContent({ sentences: TRANSCRIPT.sentences, words: WORDS, faces: FACES, lang: "en" });
  const profiles = new Map(H.analyzeSentences({ sentences: TRANSCRIPT.sentences, words: WORDS, lang: "en" }).map((p) => [p.id, p]));
  for (const b of plan.broll) {
    assert.equal(b.status, "pending");
    assert.equal(b.origin, "heuristic");
    assert.ok(profiles.get(b.sentenceId).salient.length >= 1, `${b.sentenceId} is not a salient sentence`);
    assert.ok(b.queries.length >= 2 && b.segmentId && /^br_\d{3}$/.test(b.id));
  }
  checkRhythm(plan, FX45, dc, "heuristic default");
  assert.deepEqual(plan.aRoll.segments.flatMap((s) => s.sentenceIds), TRANSCRIPT.sentences.map((s) => s.id));
  assert.equal(plan.aRoll.segments[0].type, "HOOK");
  assert.equal(plan.aRoll.segments[plan.aRoll.segments.length - 1].type, "CTA");
  assert.ok(plan.opportunities.broll.length >= plan.broll.length && plan.music.track.query === "energetic background");
  assert.ok(plan.sfx.every((s) => s.cue === "whoosh" && plan.broll.find((b) => b.id === s.anchor.elementId).layout === "FULL"));
});

t("director path: an injected model drives createdBy 'director' with provenance and a valid plan", async () => {
  const notices = [];
  const plan = await BP.buildInitialPlan(ctxFor(FX45, { director: { callJson: fakeCallJson([reply(REALISTIC_REPLY)], []) }, onNotice: (n) => notices.push(n) }));
  assertValid(plan, WORDS, "director");
  assert.equal(plan.createdBy, "director");
  assert.deepEqual(plan.provenance.director, { model: "meta/muse-spark-1.3-contributor", stage: "ve_director", promptHash: Dir.PROMPT_HASH, costUsd: 0.001, fallback: false });
  assert.equal(notices.length, 0);
  assert.ok(plan.broll.some((b) => b.sentenceId === "s10" && b.origin === "ai" && b.queries[0].text === "calendar app laptop screen"));
  assert.ok(plan.graphics.some((g) => g.kind === "HOOK_TITLE" && g.text.title === "The 3-hour email trap"));
  checkRhythm(plan, FX45, CONTENT, "director default");
});

t("LLM failure falls back to the heuristic director (fallback true, notice, cost kept); cancellation is re-thrown", async () => {
  for (const err of [
    new EditError("LLM_INVALID_JSON", { errorClass: "provider", retryable: true, extra: { costUsd: 0.002 } }),
    new EditError("LLM_CALL_FAILED", { errorClass: "transient", retryable: true }),
    new Error("socket hang up"),
  ]) {
    const notices = [];
    const plan = await BP.buildInitialPlan(ctxFor(FX45, { director: { callJson: async () => { throw err; } }, onNotice: (n) => notices.push(n) }));
    assertValid(plan, WORDS, `fallback ${err.code || err.message}`);
    assert.equal(plan.createdBy, "heuristic");
    assert.equal(plan.provenance.director.fallback, true);
    assert.equal(plan.provenance.director.costUsd, err.extra ? 0.002 : 0);
    assert.deepEqual(notices, [{ code: "HEURISTIC_DIRECTOR", stage: "ve_director", reason: err.code || "LLM_CALL_FAILED" }]);
    assert.ok(plan.captions.cues.length > 0 && plan.cuts.length > 0);
    checkRhythm(plan, FX45, CONTENT, "fallback");
  }
  const bad = await BP.buildInitialPlan(ctxFor(FX45, { director: { callJson: fakeCallJson([reply("{\"nope\":1}")], []) } }));
  assert.equal(bad.provenance.director.fallback, true, "zod-invalid after repair also falls back");
  await assert.rejects(BP.buildInitialPlan(ctxFor(FX45, { director: { callJson: async () => { throw new EditError("LLM_ABORTED", { errorClass: "cancelled" }); } } })),
    (e) => e.code === "LLM_ABORTED");
});

t("determinism: identical inputs give identical sha256Json; inputs are never mutated; `now` only stamps createdAt", async () => {
  const ctx = ctxFor(FX45, { opportunities: overComplete(FX45), settings: { effects: "dynamic" } });
  const before = sha256Json(ctx);
  const a = await BP.buildInitialPlan(ctx);
  const b = await BP.buildInitialPlan(clone(ctx));
  assert.equal(sha256Json(ctx), before, "inputs mutated");
  assert.equal(sha256Json(a), sha256Json(b));
  const h1 = await BP.buildInitialPlan(ctxFor(FX45, { content: null }));
  const h2 = await BP.buildInitialPlan(ctxFor(clone(FX45), { content: null }));
  assert.equal(sha256Json(h1), sha256Json(h2));
  const d1 = await BP.buildInitialPlan(ctxFor(FX45, { director: { callJson: fakeCallJson([reply(REALISTIC_REPLY)], []) } }));
  const d2 = await BP.buildInitialPlan(ctxFor(FX45, { director: { callJson: fakeCallJson([reply(REALISTIC_REPLY)], []) } }));
  assert.equal(sha256Json(d1), sha256Json(d2));
  const later = await BP.buildInitialPlan({ ...ctx, now: NOW + 5000 });
  assert.equal(later.createdAt, NOW + 5000);
  assert.equal(sha256Json({ ...later, createdAt: 0 }), sha256Json({ ...a, createdAt: 0 }));
});

t("locked user B-roll survives redirect, consumes the budget, and tombstones are never resurrected", async () => {
  const over = overComplete(FX45);
  const first = await BP.buildInitialPlan(ctxFor(FX45, { settings: { brollIntensity: "low" }, opportunities: over }));
  assert.ok(first.broll.length >= 1);
  const pinned = clone(first);
  const tombstone = pinned.broll[0];
  tombstone.status = "removed";
  tombstone.userModified = true;
  const s8 = sentence("s8");
  const userItem = {
    id: "br_user0001", ordinal: 50, anchor: { kind: "words", w0: wi("s8", "shipped"), w1: s8.w1 }, resolved: null, sentenceId: "s8", segmentId: null,
    layout: "FULL", layoutParams: {}, intent: "illustrate", queries: [{ text: "team celebrating", kind: "user" }], reason: "user added", chosen: null,
    candidateSetId: null, topCandidates: [], judge: "ok", status: "pending", origin: "user", locked: true, userModified: true,
  };
  pinned.broll = [...pinned.broll.filter((b) => b.origin === "user" || b.status === "removed"), userItem];
  const next = await BP.redirect(pinned, { words: WORDS, sentences: TRANSCRIPT.sentences, faces: FACES, content: CONTENT, opportunities: over, now: NOW + 1 });
  assertValid(next, WORDS, "redirect");
  assert.deepEqual([next.revision, next.parentRevision, next.createdAt], [2, 1, NOW + 1]);
  const keptUser = next.broll.find((b) => b.id === "br_user0001");
  assert.ok(keptUser, "user item kept");
  assert.deepEqual({ ...keptUser, resolved: null }, userItem);
  const keptTomb = next.broll.find((b) => b.id === tombstone.id);
  assert.equal(keptTomb.status, "removed");
  const live = next.broll.filter((b) => b.status === "pending" || b.status === "ok");
  assert.ok(live.length <= Rh.RHYTHM_DEFAULTS.broll.low.maxPer60, `budget exceeded: ${live.length}`);
  assert.ok(!live.some((b) => b.origin !== "user" && b.sentenceId === tombstone.sentenceId), "tombstoned sentence re-filled");
  assert.ok(next.provenance.rhythm.adjustments.some((a) => a.rule === "tombstoned"));
  assert.ok(live.filter((b) => b.origin !== "user").every((b) => b.ordinal > 50), "ordinals are never reused");
  checkRhythm(next, FX45, CONTENT, "redirect low");
  const unpinned = await BP.redirect(pinned, { words: WORDS, sentences: TRANSCRIPT.sentences, faces: FACES, content: CONTENT, opportunities: over, now: NOW + 2 }, { keepLocked: false });
  assert.ok(!unpinned.broll.some((b) => b.id === "br_user0001"), "keepLocked:false drops pins");
  assert.ok(unpinned.broll.some((b) => b.id === tombstone.id && b.status === "removed"), "…but keeps tombstones");
});

t("detectCuts: fixture detections, pace, filler verdicts, retakes and transcript-less silences", () => {
  const settings = { ...S.DEFAULT_PLAN_SETTINGS };
  const cuts = BP.detectCuts({ words: WORDS, transcriptMeta: TRANSCRIPT, audio: AUDIO, settings, source: SOURCE_FIELDS });
  const count = (k) => cuts.filter((c) => c.kind === k).length;
  assert.deepEqual([count("FILLER"), count("REPEAT"), count("FALSE_START"), count("SILENCE")], [6, 2, 1, 3]);
  assert.equal(new Set(cuts.map((c) => c.id)).size, cuts.length);
  assert.ok(cuts.every((c) => S.CutSchema.safeParse(c).success));
  assert.equal(cuts.find((c) => c.kind === "FILLER" && c.wordRange[0] === 63).fillerKind, "discourse");
  assert.equal(BP.detectCuts({ words: WORDS, transcriptMeta: TRANSCRIPT, audio: AUDIO, settings: { ...settings, silencePace: "fast" }, source: SOURCE_FIELDS }).filter((c) => c.kind === "SILENCE").length, 4);
  const verdict = BP.detectCuts({ words: WORDS, transcriptMeta: TRANSCRIPT, audio: AUDIO, settings, content: { fillerVerdicts: [{ wordIndex: 63, isFiller: false }] }, source: SOURCE_FIELDS });
  assert.ok(!verdict.some((c) => c.kind === "FILLER" && c.wordRange[0] === 63));
  const retake = BP.detectCuts({ words: WORDS, transcriptMeta: { ...TRANSCRIPT, fillerCandidates: [], repeatCandidates: [], retakeCandidates: [{ a: "s3", b: "s4", keep: "b" }] }, audio: AUDIO, settings, source: SOURCE_FIELDS });
  const rc = retake.find((c) => c.kind === "RETAKE");
  assert.ok(rc && rc.wordRange[0] === 20 && rc.srcOut < WORDS[sentence("s4").w0].start);
  const noWords = BP.detectCuts({ words: [], audio: AUDIO, settings, source: SOURCE_FIELDS });
  assert.deepEqual(noWords.map((c) => c.kind), ["SILENCE", "SILENCE", "SILENCE"]);
});

t("no transcript (continue_without_transcript): silence cuts from audio, captions off, still a valid plan", async () => {
  const plan = await BP.buildInitialPlan(ctxFor(FX45, { words: [], sentences: [], transcriptMeta: {}, content: null }));
  assertValid(plan, [], "no transcript");
  assert.equal(plan.captions.enabled, false);
  assert.deepEqual([plan.captions.cues.length, plan.broll.length, plan.aRoll.segments.length], [0, 0, 0]);
  assert.deepEqual(plan.cuts.map((c) => c.kind), ["SILENCE", "SILENCE", "SILENCE"]);
  assert.ok(plan.timeline.outDurationSec < SOURCE.durationSec - 2);
  assert.equal(plan.provenance.director.fallback, true);
});

t("captions track follows settings; content emphasis marks caption words; invalid input is rejected", async () => {
  const plan = await BP.buildInitialPlan(ctxFor(FX45, { settings: { captionStyle: "clean", maxWordsPerLine: 2, captionsEnabled: false } }));
  assertValid(plan, WORDS, "captions");
  assert.deepEqual([plan.captions.enabled, plan.captions.styleId, plan.settings.maxWordsPerLine, plan.captions.highlight], [false, "clean", 2, "none"]);
  assert.ok(plan.captions.overrides.emphasis[`w${wi("s1", "3")}`] && plan.captions.overrides.emphasis[`w${wi("s1", "hours")}`]);
  const hoursCue = plan.captions.cues.find((c) => c.words.some((w) => w.key === `w${wi("s1", "hours")}`));
  assert.ok(hoursCue.words.find((w) => w.key === `w${wi("s1", "hours")}`).emphasis);
  await assert.rejects(BP.buildInitialPlan({ ...ctxFor(FX45), now: undefined }), (e) => isEditError(e) && e.code === "INVALID_PLAN_INPUT");
  await assert.rejects(BP.buildInitialPlan(ctxFor(FX45, { sentences: [{ id: "s1", w0: 0, w1: 999, start: 0, end: 1 }] })), (e) => e.code === "INVALID_PLAN_INPUT");
  await assert.rejects(BP.redirect({ schema: "nope" }, { words: WORDS, sentences: TRANSCRIPT.sentences, now: NOW }), (e) => e.code === "INVALID_PLAN_INPUT");
});

// ======================================================================== review regressions (Phase 4a)
section("review regressions — director, build_plan, re-plan");

const { applyOps } = require("../src/video_edit/plan/ops");
const SLOT_TMPL = load("plan").broll[0].chosen;
const OPS_CTX = { words: WORDS, sentences: TRANSCRIPT.sentences, faces: FACES, content: CONTENT, mezz: { w: SOURCE.width, h: SOURCE.height }, now: NOW + 100 };
const setIntensity = (plan, value, batchId, extra = {}) => applyOps(plan, [{ type: "settings.set", key: "brollIntensity", value }], { ...OPS_CTX, batchId, ...extra });

t("limits are UTF-16 units cut on grapheme boundaries: an emoji title or card never fails the build", async () => {
  const title = "Stop wasting 3 hours every day \u{1F525}";
  assert.deepEqual([[...title].length, title.length], [32, 33]);
  const c = Op.condenseTitle(title);
  assert.ok(c.length <= 32 && !/[\uD800-\uDBFF]$/.test(c), c);
  assert.equal(Op.truncate("ab\u{1F525}cd", 3), "ab");
  assert.equal(Op.truncate("\u{1F468}‍\u{1F469}‍\u{1F467} family", 5), "", "a ZWJ family emoji is kept whole or not at all");
  assert.ok(Op.condenseTitle("\u{1F525}".repeat(40)).length <= 32);
  const opps = { ...overComplete(FX45), hookTitle: { text: title, sentenceId: "s1" } };
  opps.graphics[0] = { ...opps.graphics[0], title: "Shipped \u{1F680} two weeks early \u{1F389}\u{1F389}\u{1F389}", value: "2 \u{1F680}".repeat(12), reason: "\u{1F525}".repeat(90) };
  const injected = await BP.buildInitialPlan(ctxFor(FX45, { opportunities: opps }));
  assertValid(injected, WORDS, "emoji opportunities");
  assert.equal(injected.createdBy, "director", "no fallback was needed");
  const r = clone(REALISTIC_REPLY);
  r.hookTitle = { text: title, sentenceId: "s1" };
  r.graphics[0].title = "Shipped \u{1F680} two weeks early \u{1F389}\u{1F389}\u{1F389}\u{1F389}";
  const viaDirector = await BP.buildInitialPlan(ctxFor(FX45, { director: { callJson: fakeCallJson([reply(r)], []) } }));
  assertValid(viaDirector, WORDS, "emoji director reply");
  assert.equal(viaDirector.provenance.director.fallback, false);
  assert.ok(viaDirector.graphics.every((g) => g.text.title.length <= 32));
});

t("AI opportunities that still yield an invalid plan are rebuilt once from the heuristic; a heuristic failure throws", async () => {
  const orig = Op.toPlanOpportunities;
  const breakTitle = (onlyAi) => (opps, o) => { const out = orig(opps, o); if ((!onlyAi || opps.source === "ai") && out.graphics.length) out.graphics[0].title = "x".repeat(40); return out; };
  try {
    Op.toPlanOpportunities = breakTitle(true);
    const notices = [];
    const plan = await BP.buildInitialPlan(ctxFor(FX45, { opportunities: overComplete(FX45), directorProvenance: { model: "m", costUsd: 0.002 }, onNotice: (n) => notices.push(n) }));
    assertValid(plan, WORDS, "rebuilt");
    assert.deepEqual([plan.createdBy, plan.provenance.director.fallback, plan.provenance.director.costUsd], ["heuristic", true, 0.002]);
    assert.deepEqual(notices, [{ code: "HEURISTIC_DIRECTOR", stage: "ve_director", reason: "PLAN_BUILD_INVALID" }]);
    Op.toPlanOpportunities = breakTitle(false);
    await assert.rejects(BP.buildInitialPlan(ctxFor(FX45, { content: null })), (e) => e.code === "PLAN_BUILD_INVALID" && e.errorClass === "bug");
  } finally { Op.toPlanOpportunities = orig; }
});

function hindiFixture() {
  const text = [["मैंने", "नई", "गाड़ी", "खरीदी।"], ["सड़क", "पर", "गाड़ी", "बहुत", "तेज़", "चलती", "है।"], ["दुकान", "में", "किताबें", "और", "पानी", "की", "बोतल", "मिलती", "है।"], ["सब्सक्राइब", "करें।"]];
  const words = [], sentences = [];
  let tt = 0.5;
  text.forEach((ws, k) => {
    const w0 = words.length;
    for (const x of ws) { words.push({ i: words.length, text: x, start: r3(tt), end: r3(tt + 0.35), conf: 0.95, sentenceId: `s${k + 1}` }); tt += 0.45; }
    sentences.push({ id: `s${k + 1}`, w0, w1: words.length - 1, start: words[w0].start, end: words[words.length - 1].end, text: ws.join(" ") });
    tt += 0.8;
  });
  return { words, sentences };
}

t("non-Latin transcripts: combining marks stay in words; B-roll queries are English visual nouns or nothing", () => {
  assert.equal(Op.cleanQuery("गाड़ी सड़क", "hi"), "गाड़ी सड़क");
  assert.equal(Op.cleanQuery("पानी की बोतल", "hi"), "पानी बोतल");
  assert.equal(Lx.normWord("है।"), "है");
  assert.ok(Lx.isStopword("है", "hi") && !Lx.isNounLike("मिलती", "hi") && !Lx.isNounLike("मैंने", "hi"));
  const { words, sentences } = hindiFixture();
  assert.equal(H.heuristicOpportunities({ sentences, words, lang: "hi", settings: {} }).brollOpportunities.length, 0, "no source-language stock queries");
  const content = { visualSupport: [
    { sentenceId: "s2", need: 0.8, visualNouns: ["car on road", "traffic street", "गाड़ी"] },
    { sentenceId: "s3", need: 0.7, visualNouns: ["book shop shelves", "water bottle"] },
  ] };
  const withNouns = H.heuristicOpportunities({ content, sentences, words, lang: "hi", settings: {} });
  assert.ok(withNouns.brollOpportunities.length >= 1);
  for (const b of withNouns.brollOpportunities) assert.ok(b.queries.length >= 2 && b.queries.every((q) => /^[\x20-\x7E]+$/.test(q)), JSON.stringify(b.queries));
  assert.ok(Dir.SYSTEM_PROMPT.includes("Write every query in English"));
  assert.equal(Dir.buildDirectorInput({ sentences, words, lang: "hi" }).brollAvailability, null);
});

t("repeated takes: only the dropped words are cut when other words lie between the takes", () => {
  const mk = (arr) => {
    const W = [], Ss = [];
    let tt = 0.2;
    arr.forEach((ws, k) => {
      const w0 = W.length;
      ws.forEach((x) => { const filler = /^um,?$/i.test(x); W.push({ i: W.length, text: x, start: r3(tt), end: r3(tt + 0.3), conf: 0.95, sentenceId: `s${k + 1}`, isFiller: filler }); tt += 0.35; });
      Ss.push({ id: `s${k + 1}`, w0, w1: W.length - 1, start: W[w0].start, end: W[W.length - 1].end, text: ws.join(" ") });
      tt += 0.5;
    });
    return { W, S: Ss, D: r3(tt + 0.5) };
  };
  const removed = (W, c) => W.filter((w) => (w.start + w.end) / 2 > c.srcIn && (w.start + w.end) / 2 < c.srcOut).map((w) => w.i);
  const far = mk([["Focus", "is", "the", "whole", "game."], ["Here", "is", "why", "it", "matters", "so", "much."], ["Focus", "is", "the", "whole", "game."]]);
  for (const [keep, expect] of [["b", [0, 1, 2, 3, 4]], ["a", [12, 13, 14, 15, 16]]]) {
    const cuts = BP.detectCuts({ words: far.W, transcriptMeta: { sentences: far.S, retakeCandidates: [{ a: "s1", b: "s3", keep }] }, settings: { silencePace: "natural" }, source: { durationSec: far.D } });
    const rt = cuts.find((c) => c.kind === "RETAKE");
    assert.deepEqual([removed(far.W, rt), rt.wordRange], [expect, [expect[0], expect[expect.length - 1]]], `keep ${keep}`);
  }
  const near = mk([["Focus", "is", "key."], ["Focus", "is", "the", "key."]]);
  const adj = BP.detectCuts({ words: near.W, transcriptMeta: { sentences: near.S, retakeCandidates: [{ a: "s1", b: "s2", keep: "b" }] }, settings: {}, source: { durationSec: near.D } }).find((c) => c.kind === "RETAKE");
  assert.equal(adj.srcOut, r3(near.W[3].start - 0.06), "adjacent takes still cut up to the kept take");
  const fs1 = mk([["I", "was", "going", "I", "went", "home."]]);
  const blocked = BP.detectCuts({ words: fs1.W, transcriptMeta: { sentences: fs1.S, repeatCandidates: [{ kind: "FALSE_START", w0: 0, w1: 1, keptW0: 3 }] }, settings: {}, source: { durationSec: fs1.D } }).find((c) => c.kind === "FALSE_START");
  assert.deepEqual([removed(fs1.W, blocked), blocked.wordRange], [[0, 1], [0, 1]], "a spoken word between fragment and take is kept");
  const fs2 = mk([["I", "was", "um,", "I", "went", "home."]]);
  const through = BP.detectCuts({ words: fs2.W, transcriptMeta: { sentences: fs2.S, repeatCandidates: [{ kind: "FALSE_START", w0: 0, w1: 1, keptW0: 3 }] }, settings: {}, source: { durationSec: fs2.D } }).find((c) => c.kind === "FALSE_START");
  assert.deepEqual([removed(fs2.W, through), through.wordRange], [[0, 1, 2], [0, 2]], "a filler between them goes with the fragment");
});

const slotFor = (sid, k, accepted = true) => {
  const best = { ...SLOT_TMPL, assetId: `ast_slot${k}a`, providerId: `9${k}1`, path: `assets/broll/ast_slot${k}a.mp4`, dhash: null };
  const second = { ...SLOT_TMPL, assetId: `ast_slot${k}b`, providerId: `9${k}2`, path: null, dhash: null };
  return { slotId: `sl_${sid}`, sentenceId: sid, accepted, acceptedByIntensity: { low: accepted, medium: accepted, high: accepted }, judge: "ok",
    judgeReason: null, mediaPreference: "video", mediaTypes: ["video"], bestTotal: 0.7, best: accepted ? best : null, top: accepted ? [best, second] : [] };
};
const SLOTS = [slotFor("s4", 1), slotFor("s6", 2), slotFor("s9", 3), slotFor("s10", 4), slotFor("s7", 5, false)];
const SLOT_ASSET = Object.fromEntries(SLOTS.filter((s) => s.best).map((s) => [s.sentenceId, s.best.assetId]));

t("scored B-roll slots: availability to the director, only accepted sentences become items, items carry the slot's assets", async () => {
  for (const brollIntensity of ["medium", "high"]) {
    const plan = await BP.buildInitialPlan(ctxFor(FX45, { settings: { brollIntensity }, opportunities: overComplete(FX45), brollSlots: { slots: SLOTS } }));
    assertValid(plan, WORDS, `slots ${brollIntensity}`);
    assert.ok(plan.broll.length >= 1, `no B-roll at ${brollIntensity}`);
    for (const b of plan.broll) {
      assert.deepEqual([b.chosen && b.chosen.assetId, b.status, b.candidateSetId, b.topCandidates.length, b.judge], [SLOT_ASSET[b.sentenceId], "ok", `sl_${b.sentenceId}`, 2, "ok"], b.id);
    }
    assert.ok(plan.provenance.rhythm.adjustments.some((a) => a.rule === "no_accepted_candidate"));
    for (const o of plan.opportunities.broll) assert.equal(o.candidatesPrefetched, !!SLOT_ASSET[o.sentenceId], o.sentenceId);
    checkRhythm(plan, FX45, CONTENT, `slots ${brollIntensity}`);
  }
  const calls = [];
  await BP.buildInitialPlan(ctxFor(FX45, { brollSlots: SLOTS, director: { callJson: fakeCallJson([reply(REALISTIC_REPLY)], calls) } }));
  assert.deepEqual(JSON.parse(calls[0].user).brollAvailability.map((a) => a.sentenceId).sort(), Object.keys(SLOT_ASSET).sort());
  const none = await BP.buildInitialPlan(ctxFor(FX45, { opportunities: overComplete(FX45) }));
  assert.ok(none.broll.length && none.broll.every((b) => b.status === "pending" && b.chosen === null), "no slot information: nothing filtered or attached");
  const low = await BP.buildInitialPlan(ctxFor(FX45, { settings: { brollIntensity: "low" }, opportunities: overComplete(FX45), brollSlots: SLOTS }));
  const high = setIntensity(low, "high", "slot-high", { brollSlots: SLOTS });
  const added = high.plan.broll.filter((b) => !low.broll.some((x) => x.id === b.id));
  assert.ok(added.length >= 1, "high adds B-roll");
  assert.ok(added.every((b) => b.status === "ok" && b.chosen.assetId === SLOT_ASSET[b.sentenceId]), JSON.stringify(added.map((b) => [b.sentenceId, b.status])));
  assert.deepEqual(high.costEvents, [], "prefetched slots: an intensity change never fetches");
});

t("B-roll intensity round trip restores the retrieved clip of a dropped AI item without another fetch", async () => {
  const med = await BP.buildInitialPlan(ctxFor(FX45, { settings: { brollIntensity: "medium" }, opportunities: overComplete(FX45) }));
  med.broll.forEach((b, k) => { b.chosen = { ...SLOT_TMPL, assetId: `ast_got${k}`, providerId: `77${k}`, path: `assets/broll/ast_got${k}.mp4` }; b.topCandidates = [b.chosen]; b.status = "ok"; });
  const lo = setIntensity(med, "low", "rt-1");
  const dropped = med.broll.filter((b) => !lo.plan.broll.some((x) => x.id === b.id));
  assert.ok(dropped.length >= 1, "low drops B-roll");
  assert.ok(dropped.every((d) => lo.plan.opportunities.broll.some((o) => o.retrieved && o.retrieved.chosen.assetId === d.chosen.assetId)), "retrieval parked on the opportunity");
  const back = setIntensity(lo.plan, "medium", "rt-2");
  for (const d of dropped) {
    const again = back.plan.broll.find((b) => b.sentenceId === d.sentenceId);
    assert.ok(again && again.status === "ok" && again.chosen.assetId === d.chosen.assetId, `${d.sentenceId}: ${JSON.stringify(again && [again.status, again.chosen])}`);
  }
  assert.deepEqual(back.costEvents, []);
  assert.ok(!back.plan.opportunities.broll.some((o) => o.retrieved), "parked results are consumed");
  const lo2 = setIntensity(back.plan, "low", "rt-3");
  assert.deepEqual(lo2.plan.broll.map((b) => b.sentenceId).sort(), lo.plan.broll.map((b) => b.sentenceId).sort(), "re-planned items stay re-plannable");
});

t("muting SFX never lets a re-plan or a regenerate delete the AI sound effects", async () => {
  const base = await BP.buildInitialPlan(ctxFor(FX45, { opportunities: overComplete(FX45) }));
  assert.ok(base.sfx.length >= 1);
  const control = setIntensity(base, "high", "mute-0").plan;
  const muted = applyOps(base, [{ type: "sfx.muteAll", muted: true }], { ...OPS_CTX, batchId: "mute-1" }).plan;
  const replanned = setIntensity(muted, "high", "mute-2").plan;
  assert.deepEqual(replanned.sfx.map((s) => [s.id, s.cue]), control.sfx.map((s) => [s.id, s.cue]));
  const unmuted = applyOps(replanned, [{ type: "sfx.muteAll", muted: false }], { ...OPS_CTX, batchId: "mute-3" }).plan;
  assert.deepEqual([unmuted.settings.sfxEnabled, unmuted.sfx.length], [true, control.sfx.length]);
  const regenerated = await BP.redirect(muted, { words: WORDS, sentences: TRANSCRIPT.sentences, faces: FACES, content: CONTENT, opportunities: overComplete(FX45), now: NOW + 3 });
  assertValid(regenerated, WORDS, "redirect while muted");
  assert.deepEqual([regenerated.settings.sfxEnabled, regenerated.sfx.length], [false, base.sfx.length]);
});

run().then(() => { restoreFetch(); });
