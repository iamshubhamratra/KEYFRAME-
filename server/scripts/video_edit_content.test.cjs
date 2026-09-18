// Tests for AI Video Edit content analysis: analysis/content.js (ve_content).
// Run: node scripts/video_edit_content.test.cjs
//
// Load-bearing: the model only ever sees transcript text + shot facts; its reply is GROUNDED item by item
// (unknown sentence ids dropped, emphasis words must occur in the cited sentence, verdicts only for candidates
// we asked about, segments consecutive and covering every sentence, CTA sentences always faceRequired, abstract
// "visual nouns" removed); a reply that grounds nothing is repaired once by ai/llm.js; every LLM failure — outage,
// 402, open breaker, cost cap, invalid JSON, fault tokens — yields the deterministic analysis with
// AI_ANALYSIS_UNAVAILABLE instead of a failed stage; cancellation and our own bugs still throw; and a tier-1
// moderation hit parks the project with CONTENT_REVIEW before any text is sent. Offline: callJson / chat are
// injected, fetch is a tripwire.

const assert = require("node:assert");
const path = require("node:path");
const { createHarness, mkTmp, makeSettings, installFetchTripwire } = require("./lib/video_edit_test_utils.cjs");

const tmp = mkTmp("ve-content-");
process.env.VIDEO_EDIT_DIR = path.join(tmp.dir, "_guard", "edits");
process.env.VIDEO_EDIT_INDEX = path.join(tmp.dir, "_guard", "video-edits.json");

const content = require("../src/video_edit/analysis/content");
const { EditError, isEditError } = require("../src/video_edit/errors");
const { getBreaker, resetBreakers } = require("../src/video_edit/providers/breaker");
const { actionsFor } = require("../src/video_edit/engine/runner");

const { t, section, run } = createHarness();
const restoreFetch = installFetchTripwire();
const settings = makeSettings(path.join(tmp.dir, "root"));

// ---- a hand-built structured transcript (analysis/transcript.json shape) -------------------------
const TEXTS = [
  [0.2, "Did you know most delivery vans drive empty half the time?"],
  [4.0, "So, we built a routing app that fixes exactly that."],
  [8.0, "Um our drivers now finish their routes two hours earlier."],
  [12.5, "Honestly, I cried when I saw the first results."],
  [17.0, "Follow us and try the app free today."],
];
function buildTranscript() {
  const words = [];
  const sentences = [];
  TEXTS.forEach(([t0, text], k) => {
    const toks = text.split(" ");
    const w0 = words.length;
    toks.forEach((tok, j) => words.push({ i: words.length, text: tok, start: +(t0 + j * 0.35).toFixed(3), end: +(t0 + j * 0.35 + 0.3).toFixed(3), sentenceId: `s${k + 1}`, isFiller: tok === "Um" }));
    const w1 = words.length - 1;
    sentences.push({ id: `s${k + 1}`, w0, w1, start: words[w0].start, end: words[w1].end, text, pauseAfter: 0.5, fillerCount: toks.includes("Um") ? 1 : 0 });
  });
  const soIdx = words.findIndex((w) => w.text === "So,");
  const umIdx = words.findIndex((w) => w.text === "Um");
  return {
    language: "en", sentences, words,
    fillerCandidates: [{ i: soIdx, w0: soIdx, w1: soIdx, text: "So,", kind: "discourse" }, { i: umIdx, w0: umIdx, w1: umIdx, text: "Um", kind: "pure" }],
    retakeCandidates: [{ kind: "RETAKE", a: "s2", b: "s3", keep: "s3" }],
    repeatCandidates: [], ctaCandidates: [{ sentenceId: "s5", pattern: "follow" }],
  };
}
const TR = buildTranscript();
const SO = TR.fillerCandidates[0].i;
const D = 20;

const VIDEO = { durationSec: D, scenes: [{ start: 0, end: 10 }, { start: 10, end: D }] };
const FACES = {
  mode: "tracked",
  frames: [
    { t: 1, shotType: "medium", speakerVisible: true, screenContent: null }, { t: 5, shotType: "medium", speakerVisible: true, screenContent: null },
    { t: 7, shotType: "closeup", speakerVisible: true, screenContent: null }, { t: 12, shotType: "wide", speakerVisible: false, screenContent: "route map on a laptop" },
    { t: 15, shotType: "wide", speakerVisible: false, screenContent: null },
  ],
};

function goodReply() {
  return {
    summary: "Most delivery vans run half empty; a routing app cut routes by two hours.",
    category: "product", audience: "logistics managers", tone: { mood: "confident", energy: 0.7, pace: "medium" },
    topics: [{ id: "t1", label: "Empty delivery vans", sentenceIds: ["s1"] }, { id: "t2", label: "Routing app results", sentenceIds: ["s2", "s3"] }],
    keywords: [{ term: "delivery vans", sentenceIds: ["s1"], salience: 0.9 }, { term: "routing app", sentenceIds: ["s2"], salience: 0.8 }],
    hook: { sentenceIds: ["s1"], strength: 0.8 },
    cta: { sentenceIds: ["s5"], text: "Follow us and try the app" },
    segments: [
      { id: "a", type: "HOOK", sentenceIds: ["s1"], title: "Empty vans", importance: 0.9 },
      { id: "b", type: "POINT", sentenceIds: ["s2", "s3"], title: "The app", importance: 0.8 },
      { id: "c", type: "STORY", sentenceIds: ["s4"], title: "First results", importance: 0.6 },
      { id: "d", type: "CTA", sentenceIds: ["s5"], title: "Try it", importance: 0.7 },
    ],
    visualSupport: [
      { sentenceId: "s1", need: 0.8, visualNouns: ["empty delivery van", "van driving on highway"], avoid: ["brand logos"] },
      { sentenceId: "s2", need: 0.6, visualNouns: ["route map on phone"], avoid: [] },
      { sentenceId: "s3", need: 0.7, visualNouns: ["delivery driver unloading boxes"], avoid: [] },
      { sentenceId: "s4", need: 0.2, visualNouns: [], avoid: [] },
      { sentenceId: "s5", need: 0.1, visualNouns: [], avoid: [] },
    ],
    faceRequired: [{ sentenceId: "s4", reason: "personal" }, { sentenceId: "s5", reason: "cta" }],
    emphasis: [{ sentenceId: "s3", wordText: "two" }],
    fillerVerdicts: [{ wordIndex: SO, isFiller: true }],
    retakeVerdicts: [{ a: "s2", b: "s3", keep: "s3" }],
    music: { mood: "upbeat electronic", energy: 0.65 },
    sfxOpportunities: [{ sentenceId: "s3", kind: "ding" }],
  };
}

function fakeCallJson(impl) {
  const calls = [];
  const fn = async (opts) => {
    calls.push(opts);
    return impl(opts, calls.length);
  };
  fn.calls = calls;
  return fn;
}
const ok = (value, costUsd = 0.004) => (opts) => {
  if (typeof opts.onCost === "function") opts.onCost({ stage: opts.stage, costUsd, model: "house/model" });
  const parsed = opts.schema.safeParse(value);
  if (!parsed.success) throw new Error(`fake reply failed the real schema: ${parsed.error.message}`);
  return { value: parsed.data, model: "house/model", costUsd, tokensIn: 1, tokensOut: 1, cached: false, modelFallback: false, attempts: 1, notices: [] };
};

function analyze(extra = {}) {
  return content.analyzeContent({
    transcript: TR, words: TR.words, video: VIDEO, faces: FACES, projectSettings: { goals: "Get logistics managers to try the app" },
    settings, project: { settings: {}, cost: { spentUsd: 0 } }, durationSec: D, screen: () => ({ tier1: null, hints: [] }), ...extra,
  });
}

async function rejects(promise, code) {
  try { await promise; } catch (e) {
    assert.ok(isEditError(e), `expected EditError ${code}, got ${e && e.stack}`);
    assert.equal(e.code, code);
    return e;
  }
  throw new Error(`expected rejection with ${code}`);
}

// ------------------------------------------------------------------------------------------------
section("input + prompt");

t("buildContentInput: sentences, discourse filler candidates only, retake pairs, scene semantics, user goals", () => {
  const input = content.buildContentInput({ transcript: TR, words: TR.words, video: VIDEO, faces: FACES, projectSettings: { goals: "Sell the app", brand: { name: "Routely" } }, lang: "en" });
  assert.deepEqual(input.sentences.map((s) => s.id), ["s1", "s2", "s3", "s4", "s5"]);
  assert.deepEqual(Object.keys(input.sentences[0]).sort(), ["end", "fillerCount", "id", "pauseAfter", "start", "text"]);
  assert.deepEqual(input.fillerCandidates, [{ wordIndex: SO, text: "So,", sentenceId: "s2" }]);
  assert.deepEqual(input.retakeCandidates, [{ a: "s2", b: "s3", suggestedKeep: "s3" }]);
  assert.deepEqual(input.scenes, [
    { start: 0, end: 10, shotType: "medium", speakerVisible: true, screenContent: null },
    { start: 10, end: 20, shotType: "wide", speakerVisible: false, screenContent: "route map on a laptop" },
  ]);
  assert.deepEqual(input.user, { goals: "Sell the app", brand: { name: "Routely" } });
  const json = JSON.stringify(input);
  assert.ok(!/base64|input_audio|image_url/.test(json), "text only");
});

t("the system prompt carries the grounding rules and the editorial definitions downstream code relies on", () => {
  const p = content.SYSTEM_PROMPT;
  for (const needle of ["exact ids", "Never invent ids", "empty array", "CONCRETE, FILMABLE", "never the speaker", "sincere", "personal", "humor", "direct_address", "\"cta\"", "in English", "HOOK | CONTEXT | POINT | EXAMPLE | STORY | DATA | CTA | OUTRO | ASIDE", "one entry for EVERY sentence"]) {
    assert.ok(p.includes(needle), `prompt lacks: ${needle}`);
  }
});

section("grounding");

t("unknown ids, ungrounded words, stray verdicts and abstract nouns are dropped; segments are made consecutive and complete", () => {
  const raw = {
    summary: "x".repeat(900), category: "Product", tone: { mood: "upbeat", energy: 1.4, pace: "sprint" },
    topics: [{ label: "Empty vans", sentenceIds: ["s1", "s99"] }, { label: "Ghost", sentenceIds: ["s42"] }, { label: "", sentenceIds: ["s2"] }],
    keywords: [{ term: "delivery vans", sentenceIds: ["s1"], salience: 0.9 }, { term: "Delivery Vans", sentenceIds: ["s1"] }, { term: "nothing", sentenceIds: [] }],
    hook: { sentenceIds: ["s1", "s5"], strength: 2 },
    cta: { sentenceIds: ["s5", "s5-s6"], text: "" },
    segments: [{ type: "hook", sentenceIds: ["s1"] }, { type: "POINT", sentenceIds: ["s2", "s3", "s1"] }, { type: "weird", sentenceIds: ["s4"] }, { type: "OUTRO", sentenceIds: ["s77"] }],
    visualSupport: [
      { sentenceId: "s3", need: 0.8, visualNouns: ["delivery van", "success", "truck driver on road", "a b c d e f", "Delivery Van", "hands on steering wheel", "map"], avoid: ["logos"] },
      { sentenceId: "S2", need: 0.3, visualNouns: ["phone app map"] },
      { sentenceId: "s3", need: 0.2, visualNouns: ["worse"] },
      { sentenceId: "s77", need: 1, visualNouns: ["x"] },
    ],
    faceRequired: [{ sentenceId: "s4", reason: "Personal" }, { sentenceId: "s2", reason: "because" }, { sentenceId: "s9", reason: "humor" }, { sentenceId: "s1", reason: "direct address" }],
    emphasis: [{ sentenceId: "s3", wordText: "hours" }, { sentenceId: "s1", wordText: "teleport" }, { sentenceId: "s3", wordText: "two" }, { sentenceId: "s2", wordText: "routing app" }],
    fillerVerdicts: [{ wordIndex: SO, isFiller: true }, { wordIndex: 3, isFiller: true }, { wordIndex: SO, isFiller: false }],
    retakeVerdicts: [{ a: "s3", b: "s2", keep: "s3" }, { a: "s1", b: "s4", keep: "s1" }, { a: "s2", b: "s3", keep: "s9" }],
    music: { energy: "loud" },
    sfxOpportunities: [{ sentenceId: "s1", kind: "Whoosh" }, { sentenceId: "s2", kind: "pop" }, { sentenceId: "s3", kind: "ding" }, { sentenceId: "s88", kind: "pop" }],
  };
  const input = content.buildContentInput({ transcript: TR, words: TR.words, lang: "en" });
  const { content: c, dropped } = content.groundContent(raw, { sentences: TR.sentences, words: TR.words, fillerCandidates: input.fillerCandidates, retakeCandidates: input.retakeCandidates, durationSec: D });
  assert.equal(c.summary.length, 400);
  assert.equal(c.category, "product");
  assert.deepEqual(c.tone, { mood: "upbeat", energy: 1, pace: "medium" });
  assert.deepEqual(c.topics, [{ id: "t1", label: "Empty vans", sentenceIds: ["s1"] }]);
  assert.deepEqual(c.keywords.map((k) => k.term), ["delivery vans"]);
  assert.deepEqual(c.hook, { sentenceIds: ["s1"], strength: 1 }, "s5 starts at 17 s — not a hook");
  assert.deepEqual(c.cta.sentenceIds, ["s5"]);
  assert.ok(c.cta.text.startsWith("Follow us"), "empty cta text falls back to the sentence");
  assert.deepEqual(c.segments.map((s) => [s.type, s.sentenceIds]), [["HOOK", ["s1"]], ["POINT", ["s2", "s3"]], ["POINT", ["s4", "s5"]]]);
  assert.deepEqual(c.segments.map((s) => s.id), ["seg1", "seg2", "seg3"]);
  assert.deepEqual(c.visualSupport, [
    { sentenceId: "s2", need: 0.3, visualNouns: ["phone app map"], avoid: [] },
    { sentenceId: "s3", need: 0.8, visualNouns: ["delivery van", "truck driver on road", "hands on steering wheel", "map"], avoid: ["logos"] },
  ]);
  assert.deepEqual(c.faceRequired, [{ sentenceId: "s1", reason: "direct_address" }, { sentenceId: "s4", reason: "personal" }, { sentenceId: "s5", reason: "cta" }]);
  assert.deepEqual(c.emphasis, [{ sentenceId: "s3", wordText: "hours" }]);
  assert.deepEqual(c.fillerVerdicts, [{ wordIndex: SO, isFiller: true }]);
  assert.deepEqual(c.retakeVerdicts, [{ a: "s2", b: "s3", keep: "s3" }]);
  assert.deepEqual(c.music, { mood: "upbeat", energy: 1 });
  assert.deepEqual(c.sfxOpportunities, [{ sentenceId: "s1", kind: "whoosh" }, { sentenceId: "s2", kind: "pop" }], "≤ 1 per 15 s");
  assert.ok(dropped.ids >= 5 && dropped.items >= 8, JSON.stringify(dropped));
});

t("the schema repairs a reply whose segments or visualSupport cite no real sentence id", () => {
  const schema = content.buildContentSchema(["s1", "s2"]);
  assert.equal(schema.safeParse({ segments: [{ sentenceIds: ["sentence 1"] }], visualSupport: [] }).success, false);
  assert.equal(schema.safeParse({ segments: [{ sentenceIds: ["s2"] }], visualSupport: [{ sentenceId: 1 }] }).success, false);
  assert.equal(schema.safeParse({ segments: [{ sentenceIds: ["s2", "s9"] }], visualSupport: [{ sentenceId: "s1" }], topics: "junk" }).success, true);
  assert.equal(schema.safeParse([{ segments: [] }]).success, false, "object envelope only");
});

section("analyzeContent");

t("happy path: one text-only call, grounded content, discoveries and cost", async () => {
  resetBreakers();
  const cj = fakeCallJson(ok(goodReply()));
  let booked = 0;
  const r = await analyze({ callJson: cj, onCost: (e) => { booked += e.costUsd; } });
  assert.equal(cj.calls.length, 1);
  const call = cj.calls[0];
  assert.equal(call.stage, "ve_content");
  assert.equal(call.temperature, 0);
  assert.equal(call.promptVersion, content.PROMPT_VERSION);
  assert.equal(typeof call.user, "string");
  assert.ok(call.user.includes("\"id\":\"s3\"") && call.user.includes("Get logistics managers to try the app"));
  assert.equal(r.source, "ai");
  assert.equal(r.content.source, "ai");
  assert.equal(r.content.schemaVersion, 1);
  assert.equal(r.content.lang, "en");
  assert.equal(r.content.model, "house/model");
  assert.deepEqual(r.content.segments.map((s) => s.type), ["HOOK", "POINT", "STORY", "CTA"]);
  assert.equal(r.content.visualSupport.length, 5);
  assert.deepEqual(r.content.faceRequired.map((f) => f.sentenceId), ["s4", "s5"]);
  assert.deepEqual(r.discoveries.topics, ["Empty delivery vans", "Routing app results"]);
  assert.ok(r.discoveries.hook.startsWith("Did you know"));
  assert.equal(r.discoveries.brollMoments, 3);
  assert.ok(Math.abs(r.costUsd - 0.004) < 1e-9 && Math.abs(booked - 0.004) < 1e-9);
  assert.deepEqual(r.notices, []);
});

t("with the real callJson: a reply citing no sentence ids is repaired once, then accepted", async () => {
  resetBreakers();
  const users = [];
  const chat = async (o) => {
    users.push(o.user);
    const reply = users.length === 1 ? { ...goodReply(), segments: [{ type: "POINT", sentenceIds: ["sentence one"] }] } : goodReply();
    return { text: JSON.stringify(reply), model: "house/model", tokensIn: 10, tokensOut: 10, costUsd: 0.001 };
  };
  const r = await analyze({ chat, model: "house/model" });
  assert.equal(users.length, 2);
  assert.ok(/failed validation/.test(users[1]));
  assert.equal(r.source, "ai");
  assert.ok(Math.abs(r.costUsd - 0.002) < 1e-9, "both paid calls booked");
});

t("LLM outage → deterministic analysis + AI_ANALYSIS_UNAVAILABLE; the model breaker records it", async () => {
  resetBreakers();
  const cj = fakeCallJson(() => { throw new EditError("LLM_CALL_FAILED", { errorClass: "transient", retryable: true }); });
  const r = await analyze({ callJson: cj });
  assert.equal(r.source, "deterministic");
  assert.equal(r.content.deterministic, true);
  assert.equal(r.content.visualSupport, null, "B-roll slots fall back to their own salience");
  assert.ok(Array.isArray(r.content.segments) && r.content.segments.length >= 1);
  assert.ok(r.content.cta && r.content.cta.sentenceIds.includes("s5"), "lexical CTA");
  assert.ok(r.content.faceRequired.some((f) => f.sentenceId === "s5"));
  assert.deepEqual(r.notices.map((n) => [n.code, n.severity]), [["AI_ANALYSIS_UNAVAILABLE", "warn"]]);
  assert.deepEqual(r.fallbacks, ["content_llm_call_failed"]);
  assert.equal(getBreaker("openrouter_chat").state().state, "closed");
  assert.equal(getBreaker("openrouter_chat:default").state().failures, 1);
});

t("llm:error and llm:invalid_json fault tokens reach the fallback through the real code path", async () => {
  resetBreakers();
  const cj = fakeCallJson(ok(goodReply()));
  const r1 = await analyze({ callJson: cj, project: { settings: { debugFaults: "llm:error" }, cost: { spentUsd: 0 } } });
  assert.equal(r1.source, "deterministic");
  assert.equal(cj.calls.length, 0);
  let chats = 0;
  const chat = async () => { chats++; return { text: JSON.stringify(goodReply()), model: "house/model", tokensIn: 1, tokensOut: 1, costUsd: 0.001 }; };
  const r2 = await analyze({ chat, model: "house/model", project: { settings: { debugFaults: "llm:invalid_json" }, cost: { spentUsd: 0 } } });
  assert.equal(chats, 2, "reply corrupted, one repair re-ask, then fallback");
  assert.equal(r2.source, "deterministic");
  assert.ok(Math.abs(r2.costUsd - 0.002) < 1e-9, "the failed attempts are still booked");
});

t("402 opens the provider breaker; the next analysis falls back with zero calls; cost cap too", async () => {
  resetBreakers();
  const cj = fakeCallJson(() => { throw new EditError("LLM_CALL_FAILED", { errorClass: "budget" }); });
  const r = await analyze({ callJson: cj });
  assert.equal(r.source, "deterministic");
  assert.equal(getBreaker("openrouter_chat").state().state, "open");
  const cj2 = fakeCallJson(ok(goodReply()));
  const r2 = await analyze({ callJson: cj2 });
  assert.deepEqual([r2.source, cj2.calls.length, r2.fallbacks[0]], ["deterministic", 0, "content_breaker"]);
  resetBreakers();
  const r3 = await analyze({ callJson: cj2, project: { settings: { maxCostUsd: 0.2 }, cost: { spentUsd: 0.2 } } });
  assert.deepEqual([r3.source, cj2.calls.length, r3.fallbacks[0]], ["deterministic", 0, "content_cost_cap"]);
});

t("cancellation and our own bugs are not swallowed by the fallback", async () => {
  resetBreakers();
  await rejects(analyze({ callJson: fakeCallJson(() => { throw new EditError("LLM_ABORTED", { errorClass: "cancelled" }); }) }), "LLM_ABORTED");
  await rejects(analyze({ callJson: fakeCallJson(() => { throw new EditError("LLM_BAD_REQUEST", { errorClass: "bug" }); }) }), "LLM_BAD_REQUEST");
});

t("no transcript (continue without transcript) → empty deterministic content, zero calls, no notice", async () => {
  resetBreakers();
  const cj = fakeCallJson(ok(goodReply()));
  const r = await analyze({ callJson: cj, transcript: null, words: [] });
  assert.equal(r.source, "no_transcript");
  assert.equal(cj.calls.length, 0);
  assert.deepEqual(r.content.segments, []);
  assert.equal(r.content.visualSupport, null);
  assert.deepEqual(r.notices, []);
});

section("moderation");

t("a tier-1 hit throws CONTENT_REVIEW before any text is sent; the project parks with only 'delete'", async () => {
  resetBreakers();
  const cj = fakeCallJson(ok(goodReply()));
  let screened = 0;
  const screen = (text) => { screened++; return text.includes("Honestly") ? { tier1: { rule: "t1_rule", category: "cat" }, hints: [] } : { tier1: null, hints: [] }; };
  const err = await rejects(analyze({ callJson: cj, screen }), "CONTENT_REVIEW");
  assert.equal(cj.calls.length, 0);
  assert.equal(screened, 1);
  assert.equal(err.errorClass, "resource", "runner → NEEDS_ATTENTION, not FAILED");
  assert.equal(err.retryable, false);
  assert.equal(err.extra.retryable, false);
  assert.deepEqual(actionsFor(err, false), ["delete"]);
  assert.ok(!/Honestly|cried/.test(`${err.message} ${err.detail} ${JSON.stringify(err.extra)}`), "no transcript text in the error");
});

t("screenTranscript: ~3000-word chunks with one sentence of overlap; the real screen passes ordinary speech", () => {
  const long = Array.from({ length: 70 }, (_, k) => ({ id: `s${k + 1}`, text: Array.from({ length: 100 }, () => "delivery").join(" ") }));
  const seen = [];
  const r = content.screenTranscript(long, { screen: (text) => { seen.push(text.split(" ").length); return { tier1: null }; } });
  assert.equal(r.tier1, null);
  assert.equal(r.chunks, 3);
  assert.ok(seen.every((n) => n <= 3100), JSON.stringify(seen));
  assert.equal(content.screenTranscript(TR.sentences).tier1, null);
});

section("isolation");

t("no network was touched", () => {
  assert.ok(true);
});

(async () => {
  try {
    await run();
  } finally {
    restoreFetch();
    tmp.cleanup();
  }
})();
