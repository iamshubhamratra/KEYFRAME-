#!/usr/bin/env node
// Scope gate guards — services/prompt_scope.js, and the capability catalog its
// out-of-scope answer is built from (services/keyframe_capabilities.js).
//
// The gate decides, on submit and before a job row exists, whether a request is
// something KEYFRAME can make. Its mistakes are not symmetric, and neither are these
// tests: a wrongly REFUSED video request sends a paying person away, a wrongly
// ACCEPTED off-topic one costs one wrong film. So what is pinned here is the set of
// invariants that keep refusals rare and honest:
//   - code decides what code can decide, with no model call and no bill;
//   - no coercion can manufacture a refusal the model did not make with confidence;
//   - every failure — transport, malformed reply, budget, cancelled request — comes
//     back SUPPORTED, and inside the budget;
//   - an out-of-scope answer explains itself from the LIVE catalog, not from copy.
//
// OFFLINE BY DEFAULT: no network, no API key, no server, no jobs.json. It never
// requires db.js (boot recovery rewrites jobs.json at require time), server.js or the
// routes. The transport is injected through analyzeScope({ chat }), and openrouter.chat
// is replaced by a tripwire for the whole offline run — because the gate FAILS OPEN, a
// path that silently reached the real provider would otherwise pass as SUPPORTED and
// bill for it. The tripwire counts, and the offline run fails if it was ever touched.
//
//   node scripts/prompt_scope.test.cjs          offline guards only
//   node scripts/prompt_scope.test.cjs --llm    also runs every fixture case through the
//                                               REAL analyzeScope (costs money)

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const LIVE = process.argv.includes("--llm");

const FIX = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "prompt_scope_cases.json"), "utf8"));
const SYSTEM_MD = fs.readFileSync(path.join(__dirname, "..", "src", "prompts", "system_prompt_scope.md"), "utf8");

// The tripwire goes in before the gate is used. analyzeScope reads `openrouter.chat` at
// call time (`chat || openrouter.chat`), so the swap is seen without re-requiring it.
const openrouter = require("../src/services/openrouter");
const REAL_CHAT = openrouter.chat;
let strayProviderCalls = 0;
openrouter.chat = async () => {
  strayProviderCalls++;
  throw new Error("tripwire: the real provider was called during an offline test");
};

const config = require("../src/config");
const {
  analyzeScope, coerce, forClient, reduce, logDecision, looksLikeNonsense, mergeClarification,
  asksForGeneratedImagery,
  SCHEMA_VERSION, STATUSES, MODEL_STATUSES, REFUSAL_MIN_CONFIDENCE, POLICY_CATEGORIES, POLICY_MIN_CONFIDENCE,
} = require("../src/services/prompt_scope");
const capabilities = require("../src/services/keyframe_capabilities");
const moderation = require("../src/services/prompt_moderation");
const lex = require("../src/services/template_lexicon");
const captionLang = require("../src/services/caption_lang");
const frameRegistry = require("../src/services/frame_registry");

// CHANGED, NOT WEAKENED: the model may now say DISALLOWED, but only under the named content
// policy (POLICY_CATEGORIES, at POLICY_MIN_CONFIDENCE). Every other route to DISALLOWED from
// a model reply is still downgraded; the walls are asserted in the coerce group below.
const POLICY = Object.keys(POLICY_CATEGORIES);

let passed = 0;
function t(name, fn) {
  try { fn(); passed++; console.log("  ok    " + name); }
  catch (e) { console.error("  FAIL  " + name + "\n        " + e.message); process.exitCode = 1; }
}
async function ta(name, fn) {
  try { await fn(); passed++; console.log("  ok    " + name); }
  catch (e) { console.error("  FAIL  " + name + "\n        " + e.message); process.exitCode = 1; }
}
function group(title) { console.log("\n" + title); }

const sorted = (xs) => [...xs].sort();

// ---------------------------------------------------------------- transports

// A transport that must never be reached. Throwing is not enough on its own — the gate
// fails open, so a throw becomes SUPPORTED — which is why every caller asserts .calls.
function tripwire() {
  const fn = async (args) => {
    fn.calls.push(args);
    throw new Error("tripwire: a model was called on a path that must not call one");
  };
  fn.calls = [];
  return fn;
}

// A transport that answers from a script. Each entry is a reply object (sent as JSON),
// a raw string (sent verbatim), an Error (thrown) or a function of the call's args.
// The last entry repeats.
function scripted(...replies) {
  const fn = async (args) => {
    fn.calls.push(args);
    const r = replies[Math.min(fn.calls.length, replies.length) - 1];
    if (r instanceof Error) throw r;
    if (typeof r === "function") return r(args);
    return { text: typeof r === "string" ? r : JSON.stringify(r), tokensIn: 120, tokensOut: 30, costUsd: 0.0002 };
  };
  fn.calls = [];
  return fn;
}

// Replies in the exact shape the system prompt asks for.
const REPLY = {
  supported: {
    status: "SUPPORTED", confidence: 0.93, requestedDeliverable: "a promotional video for a bakery",
    videoIntent: "A short promotional video for a neighbourhood bakery's new sourdough.",
    videoType: "Promotional and marketing videos",
    reason: "You want a promotional video for your bakery, which KEYFRAME can make.",
    clarificationQuestion: null, unsupportedParts: [],
  },
  outOfScope: {
    status: "OUT_OF_SCOPE", confidence: 0.95, requestedDeliverable: "backend source code",
    videoIntent: null, videoType: null,
    reason: "You asked for backend code for an online store, which is software rather than a video.",
    clarificationQuestion: null, unsupportedParts: [],
  },
  clarify: {
    status: "NEEDS_CLARIFICATION", confidence: 0.8, requestedDeliverable: "unclear",
    videoIntent: null, videoType: null,
    reason: "Your message doesn't say what the video should be about yet.",
    clarificationQuestion: "What is the fundraiser raising money for?", unsupportedParts: [],
  },
};

// Every field every consumer reads, in every status. The routes, the client and the
// job record all trust this shape without re-checking it.
function assertValidScope(s, where) {
  const w = (m) => `${where}: ${m}`;
  assert.ok(s && typeof s === "object", w("no scope"));
  assert.strictEqual(s.v, SCHEMA_VERSION, w("schema version"));
  assert.ok(STATUSES.includes(s.status), w(`unknown status ${s.status}`));
  assert.strictEqual(s.isSupported, s.status === "SUPPORTED", w("isSupported disagrees with status"));
  assert.ok(typeof s.confidence === "number" && s.confidence >= 0 && s.confidence <= 1, w(`confidence ${s.confidence}`));
  assert.strictEqual(typeof s.reason, "string", w("reason is not a string"));
  assert.ok(typeof s.userMessage === "string" && s.userMessage.trim(), w("empty userMessage"));
  assert.ok(Array.isArray(s.unsupportedParts), w("unsupportedParts is not an array"));
  assert.strictEqual(s.guidance !== null, s.status === "OUT_OF_SCOPE", w("guidance must be present exactly when OUT_OF_SCOPE"));
  assert.strictEqual(typeof s.clarificationQuestion === "string" && s.clarificationQuestion.length > 0,
    s.status === "NEEDS_CLARIFICATION", w("a question must be present exactly when NEEDS_CLARIFICATION"));
  assert.ok(s.usage && typeof s.usage === "object", w("usage"));
  assert.ok(Array.isArray(s.coercions), w("coercions"));
  assert.strictEqual(typeof s.via, "string", w("via"));
  assert.ok(Number.isFinite(s.ms) && s.ms >= 0, w("ms"));
  if (s.status === "OUT_OF_SCOPE") {
    assert.strictEqual(s.videoIntent, null, w("a refusal carried a videoIntent"));
    assert.strictEqual(s.videoType, null, w("a refusal carried a videoType"));
    assert.deepStrictEqual(s.unsupportedParts, [], w("a refusal carried unsupportedParts"));
  }
}

// The request a create route sends the gate: the answer merged into the prompt by the SAME
// mergeClarification both routes call. This used to be a hand-written copy of the route's
// merge, which is exactly how the matrix could drift from production; the function now
// lives in prompt_scope.js, so the live matrix sends what production sends.
function requestFor(c) {
  const clar = c.clarification || null;
  return { prompt: mergeClarification(c.prompt, clar), sources: c.sources || {}, preferences: {}, clarification: clar };
}

// Tier 1 as the gate applies it: each distinct text on its own, never joined.
const tier1In = (...texts) => [...new Set(texts.filter(Boolean))].map((x) => moderation.screen(x).tier1).find(Boolean) || null;

// "10 minutes" -> 600, "5 seconds" -> 5. NaN for anything else.
function secondsIn(phrase) {
  const m = /^([\d.]+) (second|minute)s?$/.exec(String(phrase).trim());
  return m ? Number(m[1]) * (m[2] === "minute" ? 60 : 1) : NaN;
}

async function within(ms, promise, what) {
  let timer;
  const watchdog = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} did not return within ${ms}ms`)), ms);
  });
  try { return await Promise.race([promise, watchdog]); } finally { clearTimeout(timer); }
}

// config is frozen at the top level only; config.llm is an ordinary object, so the
// budget can be lowered for one test without touching config.json.
async function withBudget(ms, fn) {
  const had = Object.prototype.hasOwnProperty.call(config.llm, "scopeBudgetMs");
  const before = config.llm.scopeBudgetMs;
  config.llm.scopeBudgetMs = ms;
  assert.strictEqual(config.llm.scopeBudgetMs, ms, "config.llm is frozen, so the budget cannot be lowered in memory");
  try { return await fn(); } finally {
    if (had) config.llm.scopeBudgetMs = before; else delete config.llm.scopeBudgetMs;
  }
}

// ---------------------------------------------------------------- contract
group("contract — four statuses, and only three of them are the model's");

t("STATUSES is exactly SUPPORTED | NEEDS_CLARIFICATION | OUT_OF_SCOPE | DISALLOWED", () => {
  assert.deepStrictEqual(sorted(STATUSES), sorted(["SUPPORTED", "NEEDS_CLARIFICATION", "OUT_OF_SCOPE", "DISALLOWED"]));
});

t("REFUSAL_MIN_CONFIDENCE is a real threshold strictly inside (0, 1)", () => {
  assert.ok(REFUSAL_MIN_CONFIDENCE > 0 && REFUSAL_MIN_CONFIDENCE < 1, String(REFUSAL_MIN_CONFIDENCE));
});

const OUTPUT_BLOCK = ((SYSTEM_MD.split(/^## Output/m)[1] || "").match(/```\r?\n([\s\S]*?)```/) || [])[1] || "";

t("the system prompt offers the model exactly MODEL_STATUSES (DISALLOWED only for the content policy)", () => {
  const line = (OUTPUT_BLOCK.match(/"status":\s*"([^"]+)"/) || [])[1] || "";
  assert.ok(line, "could not read the status line of the output block");
  assert.deepStrictEqual(sorted(line.split("|").map((s) => s.trim())), sorted(MODEL_STATUSES));
  const cats = (OUTPUT_BLOCK.match(/"policyCategory":\s*"<[^:]*:\s*([^—"]+)/) || [])[1] || "";
  assert.deepStrictEqual(sorted(cats.split("|").map((x) => x.trim()).filter(Boolean)), sorted(POLICY),
    `the prompt offers policy categories "${cats}", the gate accepts ${POLICY.join(", ")}`);
});

// THE ZOD-STRIP TRAP from the prompt's side: a key the prompt asks for that coerce()
// never reads is generated, billed and thrown away; a key coerce() reads that the
// prompt never asks for is always its default.
t("the system prompt's output block asks for exactly the fields coerce() returns", () => {
  const keys = [...OUTPUT_BLOCK.matchAll(/^ {2}"([A-Za-z]+)":/gm)].map((m) => m[1]);
  assert.ok(keys.length, "could not read the output block");
  assert.deepStrictEqual(sorted(keys), sorted(Object.keys(coerce({ status: "SUPPORTED" }).scope)));
});

const WORKED = [...SYSTEM_MD.matchAll(/Input prompt: `([^`]+)`\s*```json\r?\n([\s\S]*?)```/g)]
  .map(([, prompt, json]) => ({ prompt, json }));

t("every worked example is a valid reply: same status, zero coercions, a real catalog videoType", () => {
  assert.ok(WORKED.length >= 4, `expected at least 4 worked examples, found ${WORKED.length}`);
  const labels = capabilities.catalog().videoTypes.map((v) => v.label);
  for (const { prompt, json } of WORKED) {
    const raw = JSON.parse(json);
    assert.ok(MODEL_STATUSES.includes(raw.status), `example "${prompt}" is ${raw.status}`);
    if (raw.status === "DISALLOWED") {
      assert.ok(POLICY.includes(raw.policyCategory), `DISALLOWED example "${prompt}" names no policy category`);
      assert.ok(raw.confidence >= POLICY_MIN_CONFIDENCE, `DISALLOWED example "${prompt}" is below the policy floor`);
    }
    const r = coerce(raw, {});
    assert.strictEqual(r.scope.status, raw.status, `example "${prompt}" changed status`);
    assert.deepStrictEqual(r.coercions, [], `example "${prompt}" coerced: ${r.coercions.join(" | ")}`);
    if (raw.videoType) assert.ok(labels.includes(raw.videoType), `example "${prompt}" names videoType "${raw.videoType}", which the catalog does not list`);
  }
});

// ---------------------------------------------------------------- nonsense
group("looksLikeNonsense — only what is unmistakably not language");

const NONSENSE = ["asdfghjkl qwertyuiop", "sdfghjkl zxcvbnm", "aaaaaaaaaaaaaaaa", "zzzzzzzzzzzz",
  "!!!??? ### ***", "1234567890 0987654321", "🎬🎬🎬🎬🎬", "............"];
const NON_LATIN = {
  hindi: "मेरी बेकरी के लिए एक छोटा प्रचार वीडियो बनाओ",
  japanese: "私たちのカフェの新メニューを紹介する短い動画を作ってください",
  arabic: "أريد فيديو ترويجي قصير لمخبزنا الجديد في دبي",
};
const SLANG = ["yo fam gimme sumthin lit fr fr", "wat i want is like a vidio 4 my shop", "bruh lemme get a promo for ma barbershop"];
// Real subjects the old pronounceability rules called nonsense — each one reproduced: German
// compounds (the seven-consonant rule; German ships), names with umlauts (the /[a-z]+/
// tokeniser cut "wünsch" into "w" + "nsch") and acronyms (the no-vowel rule). Each was asked
// "I couldn't make sense of that" from code, and each had its subject deleted from the stored
// job when the person answered.
const REAL_SUBJECTS = [
  "Rechtsschutzversicherung", "Durchschnitt", "Kunstschmiede", "Geschichtsschreibung", "Deutschschweiz",
  "Dr. Wünsch GmbH", "Höchst GmbH",
  "HTTP vs HTTPS", "HTML vs XHTML", "HTTP/2 vs HTTP/3",
];

t("keyboard mash, a repeated character and symbol-only input are nonsense", () => {
  for (const s of NONSENSE) assert.strictEqual(looksLikeNonsense(s), true, JSON.stringify(s));
});

t("Hindi, Japanese and Arabic are never judged nonsense — a Latin word list cannot read them", () => {
  for (const [lang, s] of Object.entries(NON_LATIN)) assert.strictEqual(looksLikeNonsense(s), false, lang);
});

t("slang, typos and text-speak are not nonsense", () => {
  for (const s of SLANG) assert.strictEqual(looksLikeNonsense(s), false, JSON.stringify(s));
});

// A one-word prompt that is a real place or brand with a long consonant cluster used to be
// read as keyboard mash, so the person got "I couldn't make sense of that" for a real subject.
t("one-word real names with long consonant clusters are not nonsense", () => {
  for (const s of ["Knightsbridge", "Strengths", "Schwarzkopf", "Nightscape"]) {
    assert.strictEqual(looksLikeNonsense(s), false, s);
  }
});

t("German compounds, names with umlauts and acronyms are not nonsense", () => {
  for (const s of REAL_SUBJECTS) assert.strictEqual(looksLikeNonsense(s), false, s);
});

// The tokeniser is Unicode, and input is NFC-normalised first: a decomposed "u" + U+0308
// must read as the one letter the person typed, not re-open the "w" + "nsch" split.
t("a decomposed (NFD) umlaut tokenises as one letter", () => {
  const nfd = "Dr. Wünsch GmbH";
  assert.notStrictEqual(nfd, "Dr. Wünsch GmbH", "the fixture is not actually decomposed");
  assert.strictEqual(looksLikeNonsense(nfd), false);
  assert.strictEqual(looksLikeNonsense("Höchst GmbH"), false);
});

// A keyboard row counts only when it is the WHOLE token. As a substring rule it would flag
// ordinary words: German "Mehrwert" holds w-e-r-t, English "strewn" holds t-r-e-w.
t("a keyboard-row run inside a real word is not junk — only a token that IS the run", () => {
  for (const s of ["Mehrwertsteuer einfach erklärt", "Bewertung", "strewn", "Wertpapiere"]) {
    assert.strictEqual(looksLikeNonsense(s), false, s);
  }
});

t("text must be ENTIRELY junk: one real word beside the mash sends it to the model", () => {
  for (const s of ["asdfghjkl Rechtsschutzversicherung", "qwerty HTTP", "zzzzzzzz bakery", "!!! asdf Höchst"]) {
    assert.strictEqual(looksLikeNonsense(s), false, s);
  }
});

t("tokens under three letters are not judged: mash with short fragments and symbols is still junk", () => {
  for (const s of ["asdf jk qwerty", "hjkl ;; sdfgh", "aaaa!!! zxcvb ok", "poiuy 42 lkjhg"]) {
    assert.strictEqual(looksLikeNonsense(s), true, s);
  }
  for (const s of ["ab cd ef gh", "a b c d e f"]) assert.strictEqual(looksLikeNonsense(s), false, `${s}: nothing to judge is not junk`);
});

t("three repeated letters are language (Schifffahrt); a non-Latin sentence holding a repeat is never judged", () => {
  assert.strictEqual(looksLikeNonsense("Schifffahrt museum"), false);
  assert.strictEqual(looksLikeNonsense("すごーーーーい動画をつくってください"), false);
});

t("empty and non-string input reads as nonsense without throwing", () => {
  for (const x of [null, undefined, "", "   ", 0]) assert.strictEqual(looksLikeNonsense(x), true, String(x));
});

// ---------------------------------------------------------------- merge
group("mergeClarification — the answer joins the person's words, and replaces only junk");

const ANSWER = "Ein 30-Sekunden-Erklärvideo für kleine Handwerksbetriebe.";

t("a real subject is KEPT, with the answer after it — never replaced", () => {
  for (const s of [...REAL_SUBJECTS, ...SLANG, ...Object.values(NON_LATIN)]) {
    const merged = mergeClarification(s, { question: "What is it about?", answer: ANSWER });
    assert.strictEqual(merged, `${s}\n\n${ANSWER}`, `${s}: the subject was dropped from the merged prompt`);
  }
});

t("unmistakable junk is REPLACED by the answer, so mash never opens the brief", () => {
  for (const s of NONSENSE) assert.strictEqual(mergeClarification(s, { answer: ANSWER }), ANSWER, s);
});

t("no original, no clarification, or a blank answer", () => {
  assert.strictEqual(mergeClarification("", { answer: ANSWER }), ANSWER);
  assert.strictEqual(mergeClarification(undefined, { answer: ` ${ANSWER} ` }), ANSWER);
  assert.strictEqual(mergeClarification("  a promo for my bakery  ", null), "a promo for my bakery");
  assert.strictEqual(mergeClarification("a promo for my bakery", { answer: "   " }), "a promo for my bakery");
});

// ---------------------------------------------------------------- coercion
group("coerce — every rule fails toward the person's video");

const T = REFUSAL_MIN_CONFIDENCE;

t("an unrecognised status becomes SUPPORTED, with a note", () => {
  for (const status of ["REFUSED", "maybe", "", "UNSUPPORTED"]) {
    const r = coerce({ status, confidence: 0.99 });
    assert.strictEqual(r.scope.status, "SUPPORTED", status);
    assert.ok(r.coercions.some((c) => /unrecognised status/.test(c)), `${status}: ${r.coercions.join(" | ")}`);
  }
});

t("status spelling is normalised: case, spaces and hyphens", () => {
  assert.strictEqual(coerce({ status: "out of scope", confidence: 0.9 }).scope.status, "OUT_OF_SCOPE");
  assert.strictEqual(coerce({ status: "Out-Of-Scope", confidence: 0.9 }).scope.status, "OUT_OF_SCOPE");
  assert.strictEqual(coerce({ status: " needs clarification ", clarificationQuestion: "What about?" }).scope.status, "NEEDS_CLARIFICATION");
});

// CHANGED, NOT WEAKENED: this used to assert that no model DISALLOWED ever stands. The owner set
// a content policy, so a model may now refuse, but ONLY inside these walls, each asserted here.
t("a model DISALLOWED without a content-policy category is downgraded to SUPPORTED", () => {
  for (const [status, policyCategory] of [["DISALLOWED", undefined], ["disallowed", null], ["DISALLOWED", ""],
    ["DISALLOWED", "violence"], ["DISALLOWED", "spam"], ["DISALLOWED", "other"], ["DISALLOWED", 42], ["DISALLOWED", {}]]) {
    const r = coerce({ status, confidence: 1, reason: "no", policyCategory });
    assert.strictEqual(r.scope.status, "SUPPORTED", `${status}/${String(policyCategory)}`);
    assert.strictEqual(r.scope.policyCategory, null);
    assert.ok(r.coercions.some((c) => /without a content-policy category/.test(c)), r.coercions.join(" | "));
  }
});

t("a confident content-policy refusal stands, with the product's own sentence and nothing the model wrote", () => {
  const MODEL_TEXT = "MODEL-WRITTEN DETAIL THAT MUST NEVER REACH THE PERSON";
  for (const cat of POLICY) {
    const r = coerce({ status: "DISALLOWED", confidence: 0.9, policyCategory: cat, reason: MODEL_TEXT,
      requestedDeliverable: MODEL_TEXT, videoIntent: MODEL_TEXT, videoType: "Promotional and marketing videos",
      clarificationQuestion: MODEL_TEXT, unsupportedParts: [MODEL_TEXT] });
    assert.strictEqual(r.scope.status, "DISALLOWED", cat);
    assert.strictEqual(r.scope.policyCategory, cat);
    assert.strictEqual(r.scope.reason, POLICY_CATEGORIES[cat], `${cat}: the refusal sentence is not the product's`);
    assert.ok(!JSON.stringify(r.scope).includes(MODEL_TEXT), `${cat}: model-written text survived into the decision`);
    assert.strictEqual(r.scope.videoIntent, null);
    assert.strictEqual(r.scope.videoType, null);
    assert.strictEqual(r.scope.clarificationQuestion, null);
    assert.deepStrictEqual(r.scope.unsupportedParts, []);
  }
});

t(`a hesitant content-policy refusal (below ${POLICY_MIN_CONFIDENCE}) makes the video`, () => {
  for (const cat of POLICY) for (const confidence of [0, 0.5, POLICY_MIN_CONFIDENCE - 0.01, "0.7", undefined]) {
    const r = coerce({ status: "DISALLOWED", confidence, policyCategory: cat });
    assert.strictEqual(r.scope.status, "SUPPORTED", `${cat}@${String(confidence)}`);
    assert.ok(r.coercions.some((c) => /below .* confidence/.test(c)), r.coercions.join(" | "));
  }
  assert.strictEqual(coerce({ status: "DISALLOWED", confidence: POLICY_MIN_CONFIDENCE, policyCategory: POLICY[0] }).scope.status,
    "DISALLOWED", "the floor is inclusive");
});

t("policy categories are read tolerantly: case, spaces and underscores", () => {
  for (const [raw, want] of [["Sexual Explicit", "sexual-explicit"], ["graphic_gore", "graphic-gore"], [" HATE ", "hate"]]) {
    assert.strictEqual(coerce({ status: "DISALLOWED", confidence: 0.95, policyCategory: raw }).scope.policyCategory, want, raw);
  }
});

t("a policy refusal after a clarification is not softened by the one-question rules", () => {
  const r = coerce({ status: "DISALLOWED", confidence: 0.9, policyCategory: "hate", videoIntent: "anything" }, { clarificationGiven: true });
  assert.strictEqual(r.scope.status, "DISALLOWED");
});

t("the content-policy invariant over a cross-product: DISALLOWED iff a named category at the floor", () => {
  const cats = [...POLICY, "SEXUAL EXPLICIT", "violence", "", null, undefined, 7];
  const confs = [undefined, null, 0, 0.5, POLICY_MIN_CONFIDENCE - 0.001, POLICY_MIN_CONFIDENCE, 0.9, 1, 80, 95, "0.9", "abc"];
  const named = (c) => typeof c === "string" && POLICY.includes(c.trim().toLowerCase().replace(/[\s_]+/g, "-"));
  const atFloor = (c) => {
    const n = typeof c === "number" ? c : (typeof c === "string" && c.trim() ? Number(c) : NaN);
    return Number.isFinite(n) && ((n >= POLICY_MIN_CONFIDENCE && n <= 1) || (n > 1 && n <= 100 && n / 100 >= POLICY_MIN_CONFIDENCE));
  };
  let checked = 0;
  for (const status of ["DISALLOWED", "disallowed", "SUPPORTED", "OUT_OF_SCOPE"]) for (const policyCategory of cats)
    for (const confidence of confs) for (const clarificationGiven of [false, true]) {
      const r = coerce({ status, confidence, policyCategory }, { clarificationGiven });
      const want = /^disallowed$/i.test(status) && named(policyCategory) && atFloor(confidence);
      assert.strictEqual(r.scope.status === "DISALLOWED", want, `${status}/${String(policyCategory)}/${String(confidence)} -> ${r.scope.status}`);
      checked++;
    }
  assert.ok(checked > 700, `only ${checked} shapes`);
});

t(`OUT_OF_SCOPE below ${T} becomes one question — or SUPPORTED once a question was already answered`, () => {
  const asked = coerce({ ...REPLY.outOfScope, confidence: T - 0.01 }, { clarificationGiven: false });
  assert.strictEqual(asked.scope.status, "NEEDS_CLARIFICATION");
  assert.ok(asked.scope.clarificationQuestion, "a downgraded refusal must still ask something");
  const answered = coerce({ ...REPLY.outOfScope, confidence: T - 0.01 }, { clarificationGiven: true });
  assert.strictEqual(answered.scope.status, "SUPPORTED");
  assert.strictEqual(answered.scope.clarificationQuestion, null);
});

t(`OUT_OF_SCOPE at exactly ${T} or above stands — including after a clarification`, () => {
  for (const confidence of [T, 0.8, 1]) {
    assert.strictEqual(coerce({ ...REPLY.outOfScope, confidence }).scope.status, "OUT_OF_SCOPE", String(confidence));
    assert.strictEqual(coerce({ ...REPLY.outOfScope, confidence }, { clarificationGiven: true }).scope.status, "OUT_OF_SCOPE", `${confidence} after an answer`);
  }
});

t("a refusal with missing, null or unparseable confidence is treated as unsure", () => {
  for (const confidence of [undefined, null, "", "very", NaN, true, {}]) {
    const raw = { ...REPLY.outOfScope, confidence };
    if (confidence === undefined) delete raw.confidence;
    assert.strictEqual(coerce(raw).scope.status, "NEEDS_CLARIFICATION", String(confidence));
  }
});

// A percentage-scale confidence used to be CLAMPED to 1: an unsure 45 became a
// certain refusal. This is the regression guard for that.
t("a percentage-scale confidence is read as a percentage, never clamped into certainty", () => {
  const unsure = coerce({ ...REPLY.outOfScope, confidence: 45 });
  assert.strictEqual(unsure.scope.status, "NEEDS_CLARIFICATION");
  assert.strictEqual(unsure.scope.confidence, 0.45);
  assert.ok(unsure.coercions.some((c) => /percentage/.test(c)), unsure.coercions.join(" | "));
  assert.strictEqual(coerce({ ...REPLY.outOfScope, confidence: 95 }).scope.status, "OUT_OF_SCOPE");
  assert.strictEqual(coerce({ ...REPLY.outOfScope, confidence: "0.9" }).scope.confidence, 0.9);
  const absurd = coerce({ ...REPLY.outOfScope, confidence: 250 });
  assert.strictEqual(absurd.scope.status, "NEEDS_CLARIFICATION", "an out-of-range confidence refused");
});

// CHANGED, NOT WEAKENED. This test used to assert that REPLY.clarify after a clarification
// becomes SUPPORTED — and REPLY.clarify carries videoIntent: null. That assertion was the
// defect: "idk" or "whatever" as the answer created a job with no subject and ran the whole
// pipeline. The one-question rule is unchanged (no second question, ever); what changed is
// which way the exchange ends when the answer named nothing.
const SUBJECTLESS = /^Your answer still doesn't say what the video should be about\.$/;

t("NEEDS_CLARIFICATION after a clarification, with a described video: SUPPORTED — never a second question", () => {
  const r = coerce({ ...REPLY.clarify, videoIntent: "A 45-second invitation to the animal shelter's charity walk." }, { clarificationGiven: true });
  assert.strictEqual(r.scope.status, "SUPPORTED");
  assert.strictEqual(r.scope.clarificationQuestion, null);
  assert.strictEqual(r.scope.videoIntent, "A 45-second invitation to the animal shelter's charity walk.");
  assert.ok(r.coercions.some((c) => /at most one question/.test(c)), r.coercions.join(" | "));
});

t("NEEDS_CLARIFICATION after a clarification, with NO described video: OUT_OF_SCOPE with the subjectless reason — never a second question, never a job", () => {
  const nullProto = Object.create(null);
  for (const videoIntent of [undefined, null, "", "   ", "null", "None", "N/A", "unclear.", "unknown", "-", "?", 42, nullProto, ["a video"]]) {
    const raw = { ...REPLY.clarify, videoIntent };
    if (videoIntent === undefined) delete raw.videoIntent;
    const r = coerce(raw, { clarificationGiven: true });
    const tag = (() => { try { return String(JSON.stringify(videoIntent)); } catch { return typeof videoIntent; } })();
    assert.strictEqual(r.scope.status, "OUT_OF_SCOPE", `${tag} -> ${r.scope.status}`);
    assert.ok(SUBJECTLESS.test(r.scope.reason), `${tag}: reason ${r.scope.reason}`);
    assert.strictEqual(r.scope.clarificationQuestion, null, `${tag}: a second question`);
    assert.strictEqual(r.scope.videoIntent, null, tag);
    assert.ok(r.coercions.some((c) => /no described video -> OUT_OF_SCOPE/.test(c)), `${tag}: ${r.coercions.join(" | ")}`);
  }
});

t("before any clarification, NEEDS_CLARIFICATION stays a question whatever videoIntent says", () => {
  for (const videoIntent of [null, "", "A video about the fundraiser."]) {
    const r = coerce({ ...REPLY.clarify, videoIntent }, { clarificationGiven: false });
    assert.strictEqual(r.scope.status, "NEEDS_CLARIFICATION", String(videoIntent));
    assert.strictEqual(r.scope.clarificationQuestion, REPLY.clarify.clarificationQuestion);
  }
});

// The refusal floor is deliberately NOT subject to the rule above: an OUT_OF_SCOPE reply
// carries videoIntent null by contract, so requiring one would turn every hesitant refusal
// after an answer into a real refusal.
t("a low-confidence refusal after a clarification is still SUPPORTED, videoIntent or not", () => {
  for (const videoIntent of [null, "A video about the board report."]) {
    const r = coerce({ ...REPLY.outOfScope, confidence: T - 0.1, videoIntent }, { clarificationGiven: true });
    assert.strictEqual(r.scope.status, "SUPPORTED", String(videoIntent));
  }
});

t("NEEDS_CLARIFICATION with no question gets the generic one", () => {
  for (const q of [undefined, null, "", "   "]) {
    const r = coerce({ status: "NEEDS_CLARIFICATION", confidence: 0.9, clarificationQuestion: q });
    assert.ok(typeof r.scope.clarificationQuestion === "string" && /\?$/.test(r.scope.clarificationQuestion), String(q));
    assert.ok(r.coercions.some((c) => /generic question/.test(c)), r.coercions.join(" | "));
  }
});

t("OUT_OF_SCOPE never carries a film, a type, sub-requests or a question — even when the model sends them", () => {
  const r = coerce({ ...REPLY.outOfScope, videoIntent: "a video about coding", videoType: "Educational and informational videos",
    unsupportedParts: ["write the code"], clarificationQuestion: "Did you mean a video?" });
  assert.strictEqual(r.scope.status, "OUT_OF_SCOPE");
  assert.strictEqual(r.scope.videoIntent, null);
  assert.strictEqual(r.scope.videoType, null);
  assert.deepStrictEqual(r.scope.unsupportedParts, []);
  assert.strictEqual(r.scope.clarificationQuestion, null);
});

t("a refusal with no reason still explains itself, from the deliverable when it has one", () => {
  const withDeliverable = coerce({ status: "OUT_OF_SCOPE", confidence: 0.9, requestedDeliverable: "a spreadsheet" });
  assert.ok(/a spreadsheet/.test(withDeliverable.scope.reason), withDeliverable.scope.reason);
  assert.ok(coerce({ status: "OUT_OF_SCOPE", confidence: 0.9 }).scope.reason.length > 10);
});

t("NEEDS_CLARIFICATION carries no film; SUPPORTED carries no question", () => {
  const q = coerce({ ...REPLY.clarify, videoIntent: "x", videoType: "Social media videos", unsupportedParts: ["y"] });
  assert.strictEqual(q.scope.videoIntent, null);
  assert.strictEqual(q.scope.videoType, null);
  assert.deepStrictEqual(q.scope.unsupportedParts, []);
  const s = coerce({ ...REPLY.supported, clarificationQuestion: "Anything else?" });
  assert.strictEqual(s.scope.clarificationQuestion, null);
});

t("videoType must be a kind the catalog lists: unknown dropped, labels and keys canonicalised", () => {
  const unknown = coerce({ ...REPLY.supported, videoType: "AI generated movie" });
  assert.strictEqual(unknown.scope.videoType, null);
  assert.ok(unknown.coercions.some((c) => /not in the catalog/.test(c)), unknown.coercions.join(" | "));
  assert.strictEqual(coerce({ ...REPLY.supported, videoType: "social media videos" }).scope.videoType, "Social media videos");
  assert.strictEqual(coerce({ ...REPLY.supported, videoType: "documentary" }).scope.videoType, "Documentary-style explainers");
});

t("unsupportedParts: at most 3, each bounded, blanks dropped, a lone string is one part", () => {
  const r = coerce({ ...REPLY.supported, unsupportedParts: ["a", "", "   ", "b".repeat(500), "c", "d"] });
  assert.deepStrictEqual(r.scope.unsupportedParts.length, 3);
  assert.ok(r.scope.unsupportedParts.every((p) => p.length > 0 && p.length <= 140));
  assert.deepStrictEqual(coerce({ ...REPLY.supported, unsupportedParts: "write the newsletter" }).scope.unsupportedParts, ["write the newsletter"]);
});

t("coerce never throws on a hostile or malformed value, and never yields DISALLOWED", () => {
  const cyclic = { status: "SUPPORTED" }; cyclic.self = cyclic;
  const cyclicStatus = {}; cyclicStatus.self = cyclicStatus;
  const nullProto = Object.create(null);
  const throwing = Object.defineProperty({}, "status", { get() { throw new Error("hostile getter"); } });
  const hostile = [
    [{ status: "NEEDS_CLARIFICATION" }, null], [{ status: "OUT_OF_SCOPE", confidence: 0.1 }, null],
    [{ status: 10n }], [{ status: cyclicStatus }], [{ status: Symbol("s") }], [{ status: nullProto }],
    [{ status: "SUPPORTED", confidence: Symbol("c") }], [{ status: "SUPPORTED", confidence: 10n }],
    [{ status: "SUPPORTED", reason: nullProto, videoIntent: nullProto, videoType: nullProto }],
    [{ status: "SUPPORTED", unsupportedParts: [nullProto, Symbol("p"), 42, null] }],
    [{ status: "OUT_OF_SCOPE", confidence: 0.9, requestedDeliverable: nullProto }],
    [throwing], [cyclic], [{}], [null], [undefined], ["a bare string"], [42], [true], [[]],
    [{ status: "SUPPORTED" }, "not an object"], [{ status: "NEEDS_CLARIFICATION" }, throwing],
  ];
  for (const [raw, ctx] of hostile) {
    let r;
    const label = (() => { try { return String(JSON.stringify(raw)).slice(0, 60); } catch { return "<unprintable>"; } })();
    assert.doesNotThrow(() => { r = coerce(raw, ctx); }, label);
    assert.ok(MODEL_STATUSES.includes(r.scope.status), `${label} -> ${r.scope.status}`);
    assert.strictEqual(typeof r.scope.reason, "string", label);
    assert.ok(Array.isArray(r.scope.unsupportedParts) && Array.isArray(r.coercions), label);
    assert.ok(!/\[object Object\]/.test(JSON.stringify(r.scope)), `${label} leaked "[object Object]" into the decision`);
  }
});

// The load-bearing property, checked over the whole cross-product rather than a few
// hand-picked shapes. There are exactly TWO ways to a refusal, and each is kept when it
// applies:
//   1. the model says OUT_OF_SCOPE with a confidence at or above the threshold;
//   2. the one question was already answered, the model still says NEEDS_CLARIFICATION,
//      and it describes no video — the answer named nothing to make.
// CHANGED, NOT WEAKENED: this used to allow only (1), because a second question was always
// forced to SUPPORTED — the subjectless-job defect. Every other shape, including a guessed
// (low-confidence) refusal after an answer, still can never refuse.
t("no reply shape yields OUT_OF_SCOPE except a confident refusal, or a subjectless answer to the one question", () => {
  const statuses = ["OUT_OF_SCOPE", "out of scope", "OUT-OF-SCOPE", "SUPPORTED", "NEEDS_CLARIFICATION", "needs clarification",
    "DISALLOWED", "REFUSED", "", null, undefined, 42, {}];
  const confidences = [undefined, null, "", "abc", NaN, -1, 0, 0.3, 0.59, 0.5999, 0.6, 0.61, 0.9, 1, 1.5,
    45, 59, 60, 95, 100, 101, 1e9, "0.95", "0.2", "95", Infinity, true, {}];
  const extras = [{}, { videoIntent: "x", unsupportedParts: ["y"], clarificationQuestion: "q?", reason: "" },
    { videoIntent: "unclear", reason: "still unclear" }, { videoIntent: "   " }];
  const said = (s, want) => typeof s === "string" && s.trim().toUpperCase().replace(/[\s-]+/g, "_") === want;
  const confident = (c) => {
    const n = typeof c === "number" ? c : (typeof c === "string" && c.trim() ? Number(c) : NaN);
    return Number.isFinite(n) && ((n >= T && n <= 1) || (n > 1 && n <= 100 && n / 100 >= T));
  };
  // Written out independently of the implementation: letters, and not a placeholder.
  const described = (v) => typeof v === "string" && /\p{L}/u.test(v) && !/^(unclear|null|none|n\/a|unknown)$/i.test(v.trim());
  let checked = 0, subjectless = 0;
  for (const status of statuses) for (const confidence of confidences) for (const extra of extras) for (const clarificationGiven of [false, true]) {
    const raw = { ...extra, status, confidence };
    const r = coerce(raw, { clarificationGiven });
    const confidentRefusal = said(status, "OUT_OF_SCOPE") && confident(confidence);
    const subjectlessAnswer = said(status, "NEEDS_CLARIFICATION") && clarificationGiven && !described(extra.videoIntent);
    const tag = `status=${String(status)} confidence=${String(confidence)} videoIntent=${JSON.stringify(extra.videoIntent)} clarified=${clarificationGiven}`;
    assert.notStrictEqual(r.scope.status, "DISALLOWED", tag);
    assert.strictEqual(r.scope.status === "OUT_OF_SCOPE", confidentRefusal || subjectlessAnswer, `${tag} -> ${r.scope.status}`);
    if (confidentRefusal) assert.ok(r.scope.confidence >= T, `${tag}: refusal at ${r.scope.confidence}`);
    if (subjectlessAnswer) { subjectless++; assert.ok(SUBJECTLESS.test(r.scope.reason), `${tag}: reason ${r.scope.reason}`); }
    if (clarificationGiven) assert.notStrictEqual(r.scope.status, "NEEDS_CLARIFICATION", `${tag}: a second question`);
    checked++;
  }
  assert.ok(checked > 2000, `only ${checked} shapes checked`);
  assert.ok(subjectless > 0, "the cross-product never exercised the subjectless-answer rule");
});

// ---------------------------------------------------------------- catalog
group("capability catalog — the out-of-scope answer is read from the app, not written as copy");

t("formatDuration is exact — never rounds a cap into a longer promise", () => {
  const f = capabilities.formatDuration;
  assert.strictEqual(f(5), "5 seconds");
  assert.strictEqual(f(1), "1 second");
  assert.strictEqual(f(60), "1 minute");
  assert.strictEqual(f(600), "10 minutes");
  assert.strictEqual(f(90), "90 seconds", "90s used to render as '2 minutes'");
  assert.strictEqual(f(150), "150 seconds", "150s used to render as '3 minutes'");
  for (const s of [1, 5, 30, 59, 60, 61, 90, 120, 150, 600, 3600]) assert.strictEqual(secondsIn(f(s)), s, `round trip ${s}`);
});

t("every canCreate label maps to a template_lexicon CONTENT_TYPES key", () => {
  const byLabel = new Map(capabilities.catalog().videoTypes.map((v) => [v.label, v.key]));
  const g = capabilities.outOfScopeGuidance({ reason: "r" });
  assert.ok(g.canCreate.length >= 4, `only ${g.canCreate.length} kinds offered`);
  for (const { label } of g.canCreate) {
    const key = byLabel.get(label);
    assert.ok(key, `"${label}" is not a catalog video type`);
    assert.ok(Object.prototype.hasOwnProperty.call(lex.CONTENT_TYPES, key), `"${label}" -> "${key}", which the lexicon does not define`);
  }
});

t("every hand-written label is keyed by a content type the lexicon still defines (no silent dead rows)", () => {
  const dead = capabilities.VIDEO_TYPE_LABELS.map(([k]) => k).filter((k) => !Object.prototype.hasOwnProperty.call(lex.CONTENT_TYPES, k));
  assert.deepStrictEqual(dead, [], "labels for content types the lexicon no longer has: " + dead.join(", "));
});

t("video kinds are formats, never topics", () => {
  const keys = capabilities.catalog().videoTypes.map((v) => v.key);
  for (const topic of ["finance", "technology", "ecommerce"]) assert.ok(!keys.includes(topic), `${topic} is offered as a kind of film`);
});

t("the steps state the real template count, language count and duration range", () => {
  capabilities._resetCacheForTests();
  const packs = frameRegistry.listPacks().length;
  const langs = captionLang.listLanguages().length;
  assert.ok(packs > 0, "frame_registry found no packs — this assertion would be vacuous");
  const steps = capabilities.outOfScopeGuidance({ reason: "r" }).steps.join("\n");
  assert.ok(steps.includes(`one of its ${packs} templates`), `template count ${packs} missing:\n${steps}`);
  assert.ok(steps.includes(`in any of ${langs} languages`), `language count ${langs} missing:\n${steps}`);
  // The steps state the CEILING only: the create screen's slider starts above config's
  // API minimum, so a stated minimum would be false for the person reading it.
  const range = /Choose the length \(up to (.+?)\)/.exec(steps);
  assert.ok(range, "no duration ceiling in the steps");
  assert.strictEqual(secondsIn(range[1]), config.server.maxDurationSec, `max "${range[1]}" vs config ${config.server.maxDurationSec}s`);
  for (const key of Object.keys(config.orientations)) {
    const o = capabilities.catalog().output.orientations.find((x) => x.key === key);
    assert.ok(o && steps.includes(o.label), `orientation ${key} missing from the steps`);
  }
});

// WHERE THE STEPS WILL BE FOLLOWED FROM. POST /api/generate takes a prompt and flags only,
// and pipeline.runJob renders straight through; its refusals used to carry the create
// screen's steps — paste a website, upload a video, pick one of 8 languages, review the
// script, switch on Autopilot — none of which that endpoint has a field for.
t("the create screen is the default surface, and an unknown surface falls back to it", () => {
  assert.deepStrictEqual(capabilities.SURFACES, ["create-screen", "api-generate"]);
  const create = capabilities.outOfScopeGuidance({ reason: "r", surface: "create-screen" });
  for (const surface of [undefined, null, "", "nope", "API-GENERATE"]) {
    assert.deepStrictEqual(capabilities.outOfScopeGuidance({ reason: "r", surface }), create, String(surface));
  }
  const steps = create.steps.join("\n");
  for (const promise of ["website link", "reference video", "languages", "Review and edit the script", "Autopilot"]) {
    assert.ok(steps.includes(promise), `the create screen's steps lost "${promise}"`);
  }
});

t("api-generate steps promise nothing POST /api/generate lacks: no links, uploads, languages, script review, Autopilot or captions", () => {
  const g = capabilities.outOfScopeGuidance({ reason: "You asked for code.", surface: "api-generate" });
  const steps = g.steps.join("\n");
  const promise = /website|blog|article|upload|reference video|logo|languages?\b|Autopilot|review and edit|caption|subtitle|\bsrt\b|in order if the order matters/i.exec(steps);
  assert.strictEqual(promise, null, `the api-generate steps promise "${promise && promise[0]}":\n${steps}`);
  assert.ok(/no script review step/.test(steps), `the steps do not say this endpoint renders without a review:\n${steps}`);
  // Everything else about the answer is the same: the reason, the framing, the kinds of film.
  const create = capabilities.outOfScopeGuidance({ reason: "You asked for code." });
  for (const k of ["headline", "reason", "framing", "canCreate"]) assert.deepStrictEqual(g[k], create[k], k);
});

t("api-generate steps state the endpoint's real limits and name its real fields", () => {
  capabilities._resetCacheForTests();
  const c = capabilities.catalog();
  const steps = capabilities.outOfScopeGuidance({ reason: "r", surface: "api-generate" }).steps.join("\n");
  const { min, max } = capabilities.GENERATE_PROMPT_CHARS;
  assert.ok(steps.includes(`a prompt of ${min} to ${max} characters`), `prompt bounds ${min}-${max} missing:\n${steps}`);
  // No create-screen slider stands in front of an API caller, so config's minimum IS what it may send.
  const range = /duration, which this endpoint requires: (.+?) to (.+?)\./.exec(steps);
  assert.ok(range, `no duration range:\n${steps}`);
  assert.strictEqual(secondsIn(range[1]), config.server.minDurationSec, `min "${range[1]}"`);
  assert.strictEqual(secondsIn(range[2]), config.server.maxDurationSec, `max "${range[2]}"`);
  for (const key of Object.keys(config.orientations)) assert.ok(steps.includes(key), `orientation value ${key}`);
  for (const q of Object.keys(config.qualities)) assert.ok(steps.includes(q), `quality ${q}`);
  for (const f of config.allowedFps) assert.ok(steps.includes(String(f)), `fps ${f}`);
  for (const mode of c.pace.modes) assert.ok(steps.includes(mode), `pace ${mode}`);
  assert.ok(steps.includes(`one of its ${frameRegistry.listPacks().length} templates`), "template count is not the registry's");
  for (const field of ["tts: true", "voice", "music: true", "sound_effect: true", "images: true", "video: true", "framePack", "statusUrl"]) {
    assert.ok(steps.includes(field), `field "${field}" missing:\n${steps}`);
  }
});

t("the model's capability summary carries the same live numbers", () => {
  const m = capabilities.forModel();
  assert.ok(m.output.includes(`${config.server.minDurationSec}-${config.server.maxDurationSec} seconds`), m.output);
  assert.ok(m.builtFrom.some((b) => b.includes(`${frameRegistry.listPacks().length}`)), m.builtFrom.join(" | "));
  for (const l of captionLang.listLanguages()) assert.ok(m.builtFrom.join(" ").includes(l.name), `language ${l.name} missing`);
  assert.deepStrictEqual(m.cannot, capabilities.CANNOT);
});

t("the catalog never offers AI image or video generation — and says plainly that it cannot", () => {
  const c = capabilities.catalog();
  const m = capabilities.forModel();
  const g = capabilities.outOfScopeGuidance({ reason: "r" });
  const api = capabilities.outOfScopeGuidance({ reason: "r", surface: "api-generate" });
  const offered = [
    ...c.videoTypes.flatMap((v) => [v.label, v.detail]), ...c.imagery,
    m.makes, ...m.videoKinds, ...m.builtFrom, m.inputs, ...m.imagery, m.output,
    g.headline, g.framing, ...g.canCreate.flatMap((x) => [x.label, x.detail]), ...g.steps, ...api.steps,
  ].join("\n")
    // KEYFRAME's own description of itself — template-based video generation — is the
    // product, not an AI-imagery claim.
    .replace(/template-based video generation/gi, "");
  const claim = /\bAI\b|generat(e|es|ed|ing|ion|ive)\b|text-to-(image|video)|photoreal|deepfake|avatar|lip-?sync/i.exec(offered);
  assert.strictEqual(claim, null, `a capability list offers "${claim && claim[0]}"`);
  const cannot = c.cannot.join("\n");
  assert.ok(/AI images/i.test(cannot) && /AI video/i.test(cannot), "the cannot list no longer names AI images/video");
  assert.ok(/avatar/i.test(cannot), "the cannot list no longer names talking avatars");
});

t("guidanceText renders the reason, every kind and every step, numbered", () => {
  const g = capabilities.outOfScopeGuidance({ reason: "You asked for a spreadsheet, which isn't a video." });
  const text = capabilities.guidanceText(g);
  assert.ok(text.startsWith("You asked for a spreadsheet, which isn't a video."), text.slice(0, 80));
  for (const k of g.canCreate) assert.ok(text.includes(k.label), k.label);
  g.steps.forEach((s, i) => assert.ok(text.includes(`${i + 1}. ${s}`), `step ${i + 1}`));
  assert.strictEqual(capabilities.guidanceText(null), "");
});

t("guidance without a reason still leads with a sentence", () => {
  for (const reason of [undefined, "", "   "]) assert.ok(capabilities.outOfScopeGuidance({ reason }).reason.length > 10, String(reason));
  assert.ok(capabilities.outOfScopeGuidance().reason.length > 10, "no argument");
});

t("catalog() is cached within its TTL and re-read after a reset", () => {
  capabilities._resetCacheForTests();
  const a = capabilities.catalog();
  assert.strictEqual(capabilities.catalog(), a, "a second read within the TTL rescanned");
  capabilities._resetCacheForTests();
  const b = capabilities.catalog();
  assert.notStrictEqual(b, a);
  assert.deepStrictEqual(b, a);
  assert.notStrictEqual(capabilities.catalog({ now: Date.now() + 61 * 1000 }), b, "an expired cache was served");
});

// ---------------------------------------------------------------- fixture shape
group(`fixture — the ${FIX.cases.length}-case matrix is well-formed`);

t("every case has an id, a category, a string prompt and exactly one of status / statusIn", () => {
  const ids = new Set();
  for (const c of FIX.cases) {
    assert.ok(c.id && !ids.has(c.id), `missing or duplicate id ${c.id}`);
    ids.add(c.id);
    assert.ok(c.category, `${c.id}: no category`);
    assert.strictEqual(typeof c.prompt, "string", `${c.id}: prompt`);
    const e = c.expect || {};
    assert.ok(!!e.status !== !!e.statusIn, `${c.id}: needs exactly one of status / statusIn`);
    for (const s of e.statusIn || [e.status]) assert.ok(STATUSES.includes(s), `${c.id}: unknown status ${s}`);
    if (e.statusIn) assert.ok(e.statusIn.length >= 2, `${c.id}: a one-entry statusIn is a status`);
    if (e.unsupportedPartsNonEmpty) assert.strictEqual(e.status, "SUPPORTED", `${c.id}: unsupportedParts only exist on SUPPORTED`);
  }
});

t("all 15 numbered categories and every required edge case are present", () => {
  const numbered = new Set(FIX.cases.map((c) => (/^(\d+)\. /.exec(c.category) || [])[1]).filter(Boolean).map(Number));
  for (let i = 1; i <= 15; i++) assert.ok(numbered.has(i), `category ${i} missing`);
  const cats = FIX.cases.map((c) => c.category.toLowerCase()).join("\n");
  for (const edge of ["multiple objectives", "very detailed", "ambiguous", "explainer-style question", "own footage",
    "talking avatar", "non-english", "url-only", "url plus a coding", "tier-1", "answered clarification",
    "answered clarification with no subject"]) {
    assert.ok(cats.includes(edge), `edge case "${edge}" missing`);
  }
});

t("no case copies a worked example from system_prompt_scope.md", () => {
  const norm = (s) => String(s).toLowerCase().replace(/\s+/g, " ").trim();
  const worked = new Set(WORKED.map((w) => norm(w.prompt)));
  const copied = FIX.cases.filter((c) => worked.has(norm(c.prompt))).map((c) => c.id);
  assert.deepStrictEqual(copied, [], "cases that measure recall, not judgement: " + copied.join(", "));
});

// CHANGED, NOT WEAKENED: DISALLOWED now has two routes, and each fixture case must exercise
// exactly one. A tier-1 case is decided in code (noModelCall); a content-policy case must NOT
// trip tier 1 — otherwise the live matrix would "prove" the policy by measuring the word
// rules instead of the model. And tier-1 content may still never appear in a case that
// expects anything but DISALLOWED.
t("tier-1 content appears only in DISALLOWED cases decided in code; policy cases reach the model untouched by tier 1", () => {
  let tier1Cases = 0, policyCases = 0;
  for (const c of FIX.cases) {
    const req = requestFor(c);
    // Per text, as the gate screens — this check used to join them, the same seam bug.
    const tier1 = !!tier1In(req.prompt, c.clarification && c.clarification.answer);
    if (c.expect.status !== "DISALLOWED") {
      assert.strictEqual(tier1, false, `${c.id}: tier-1 content in a case expecting ${c.expect.status || c.expect.statusIn}`);
      continue;
    }
    if (c.expect.noModelCall) {
      assert.strictEqual(tier1, true, `${c.id}: a DISALLOWED case decided in code carries no tier-1 content`);
      tier1Cases++;
    } else {
      assert.strictEqual(tier1, false, `${c.id}: a content-policy case trips tier 1, so the model is never measured`);
      policyCases++;
    }
  }
  assert.ok(tier1Cases > 0, "the matrix has no tier-1 case");
  assert.ok(policyCases >= Object.keys(POLICY_CATEGORIES).length, `only ${policyCases} content-policy case(s) for ${Object.keys(POLICY_CATEGORIES).length} categories`);
});

t("every prompt is legal input to /api/projects: at most 4000 characters, and 10+ when given", () => {
  for (const c of FIX.cases) {
    const n = requestFor(c).prompt.length;
    assert.ok(n <= 4000, `${c.id} is ${n} chars`);
    if (n) assert.ok(n >= 10, `${c.id} is ${n} chars — under the route's floor, so no route could send it`);
  }
});

// ---------------------------------------------------------------- async sections
(async () => {
  group("deterministic paths — decided in code, with NO model call");

  const TIER1 = FIX.cases.find((c) => c.expect.status === "DISALLOWED").prompt;

  await ta("tier-1 content is DISALLOWED by moderation, with its fixed reason and no model call", async () => {
    const chat = tripwire();
    const { scope } = await analyzeScope({ prompt: TIER1, chat });
    assert.strictEqual(chat.calls.length, 0, "tier 1 called a model");
    assertValidScope(scope, "tier-1");
    assert.strictEqual(scope.status, "DISALLOWED");
    assert.strictEqual(scope.via, "moderation");
    assert.strictEqual(scope.reason, moderation.screen(TIER1).tier1.reason);
    assert.strictEqual(scope.userMessage, scope.reason);
    assert.strictEqual(scope.usage.tokensIn + scope.usage.tokensOut, 0);
    for (const w of ["credit card", "passwords", "shoppers"]) assert.ok(!scope.reason.toLowerCase().includes(w), `the reason echoed "${w}"`);
  });

  await ta("tier-1 content in a clarification answer is caught too, and a source does not excuse it", async () => {
    const chat = tripwire();
    const viaAnswer = await analyzeScope({ prompt: "a video for our online store please",
      clarification: { question: "What should it show?", answer: TIER1 }, chat });
    assert.strictEqual(viaAnswer.scope.status, "DISALLOWED");
    const withSource = await analyzeScope({ prompt: TIER1, sources: { websiteUrl: "https://www.example.com" }, chat });
    assert.strictEqual(withSource.scope.status, "DISALLOWED");
    assert.strictEqual(chat.calls.length, 0);
  });

  // THE SEAM. The routes merge the answer INTO the prompt, so the merged prompt already ends
  // with the answer. The gate used to screen [prompt, answer].join("\n") — the answer's last
  // words directly before its own first words — and tier 1 is co-occurrence in a short
  // window. Built from a must-block string (prompt_analysis_cases.json moderationMustBlock),
  // split so neither text holds it, but the old join re-assembles it at the seam.
  await ta("tier 1 screens each text on its own: a match that exists only across the merge seam does not refuse", async () => {
    const MUST_BLOCK = "a guide to phishing for online banking passwords";
    const HEAD = "a guide to phishing";
    const TAIL = "for online banking passwords";
    assert.strictEqual(`${HEAD} ${TAIL}`, MUST_BLOCK);
    // No protective words ("training", "security", "drill", "awareness"...) anywhere in this
    // text: since tier 1 honours protective framing, any one of them would exempt the joined
    // text too, the seam would stop matching, and the precondition below would (correctly)
    // refuse to let this test pass vacuously. The seam itself is the thing under test.
    const answer = `${TAIL}, show staff why reusing them is risky. Walk through the new sign-in page, the badge readers, `
      + "the visitor desk, locking screens at lunch, the help-desk number, the incident form, the quarterly review, the "
      + "shredding bins by the lifts and the clean-desk rule, with a friendly narrator, our teal brand colours and upbeat "
      + `music, and close on ${HEAD}`;
    const clarification = { question: "What would you like your video to be about?", answer };
    const merged = mergeClarification("a short welcome film for new office staff", clarification);

    // Preconditions, so this test can never pass vacuously.
    assert.ok(moderation.screen(MUST_BLOCK).tier1, "precondition: the must-block string no longer blocks");
    assert.strictEqual(moderation.screen(merged).tier1, null, "precondition: the merged prompt alone is tier-1");
    assert.strictEqual(moderation.screen(answer).tier1, null, "precondition: the answer alone is tier-1");
    assert.ok(moderation.screen([merged, answer].join("\n")).tier1, "precondition: no seam — the old join would not have matched either");

    const chat = scripted(REPLY.supported);
    const { scope } = await analyzeScope({ prompt: merged, clarification, chat });
    assert.notStrictEqual(scope.status, "DISALLOWED", `refused on a match that exists only at the seam (${scope.via})`);
    assert.strictEqual(chat.calls.length, 1, "the gate never asked the model");
    assert.strictEqual(scope.status, "SUPPORTED");
  });

  await ta("empty and whitespace-only prompts are NEEDS_CLARIFICATION with no model call", async () => {
    const chat = tripwire();
    for (const prompt of [undefined, null, "", "   \n\t "]) {
      const { scope } = await analyzeScope({ prompt, chat });
      assertValidScope(scope, JSON.stringify(prompt));
      assert.strictEqual(scope.status, "NEEDS_CLARIFICATION", JSON.stringify(prompt));
      assert.strictEqual(scope.via, "heuristic");
      assert.ok(scope.userMessage.includes(scope.clarificationQuestion));
    }
    assert.strictEqual(chat.calls.length, 0);
    const bare = await analyzeScope();
    assertValidScope(bare.scope, "no argument");
  });

  await ta("a website, article or reference video with no prompt is SUPPORTED with no model call", async () => {
    const chat = tripwire();
    for (const sources of [{ websiteUrl: "https://www.example.com" }, { blogUrl: "https://blog.example.com/post" }, { referenceVideo: true }]) {
      const { scope } = await analyzeScope({ prompt: "", sources, chat });
      assertValidScope(scope, JSON.stringify(sources));
      assert.strictEqual(scope.status, "SUPPORTED");
      assert.strictEqual(scope.via, "input-mode");
      assert.strictEqual(scope.guidance, null);
    }
    assert.strictEqual(chat.calls.length, 0);
  });

  await ta("uploaded images alone are not a source: asked, not refused, with no model call", async () => {
    const chat = tripwire();
    const { scope } = await analyzeScope({ prompt: "", sources: { uploadedImages: true }, chat });
    assert.strictEqual(scope.status, "NEEDS_CLARIFICATION");
    assert.strictEqual(chat.calls.length, 0);
  });

  await ta("keyboard mash, a repeated character and symbol-only input are asked about in code", async () => {
    const chat = tripwire();
    for (const prompt of NONSENSE) {
      const { scope } = await analyzeScope({ prompt, chat });
      assertValidScope(scope, prompt);
      assert.strictEqual(scope.status, "NEEDS_CLARIFICATION", prompt);
      assert.strictEqual(scope.via, "heuristic", prompt);
    }
    assert.strictEqual(chat.calls.length, 0, `nonsense reached the model ${chat.calls.length} time(s)`);
  });

  await ta("Hindi, Japanese, Arabic and slang are NOT decided in code — the model is asked", async () => {
    for (const prompt of [...Object.values(NON_LATIN), ...SLANG]) {
      const chat = scripted(REPLY.supported);
      const { scope } = await analyzeScope({ prompt, chat });
      assert.strictEqual(chat.calls.length, 1, `"${prompt}" was not sent to the model`);
      assert.strictEqual(scope.status, "SUPPORTED", prompt);
      assert.ok(/^model/.test(scope.via), scope.via);
    }
  });

  await ta("German compounds, names with umlauts and acronyms reach the model — never asked about from code", async () => {
    for (const prompt of REAL_SUBJECTS) {
      const chat = scripted(REPLY.supported);
      const { scope } = await analyzeScope({ prompt, chat });
      assert.strictEqual(chat.calls.length, 1, `"${prompt}" was decided in code`);
      assert.ok(/^model/.test(scope.via), `${prompt}: ${scope.via}`);
      assert.strictEqual(scope.status, "SUPPORTED", prompt);
    }
  });

  // The other half of defect 1: a person whose real subject was asked about retyped it as the
  // answer. The merge replaced the "nonsense" prompt with the answer, the answer read as
  // nonsense too, and the exchange ended OUT_OF_SCOPE — from code, for a supported request.
  await ta("a real subject retyped as the answer reaches the model, and the merged prompt keeps it", async () => {
    for (const subject of REAL_SUBJECTS) {
      const clarification = { question: "What would you like your video to be about?", answer: subject };
      const request = { prompt: mergeClarification(subject, clarification), clarification };
      assert.strictEqual(request.prompt, `${subject}\n\n${subject}`, `${subject}: the merge dropped the original`);
      const chat = scripted(REPLY.supported);
      const { scope } = await analyzeScope({ ...request, chat });
      assert.strictEqual(chat.calls.length, 1, `${subject}: decided in code (${scope.via})`);
      assert.strictEqual(JSON.parse(chat.calls[0].user).prompt, request.prompt);
      assert.strictEqual(scope.status, "SUPPORTED", `${subject} -> ${scope.status} (${scope.via})`);
    }
  });

  await ta("nonsense beside a source, or answered by a real clarification, is left to the model", async () => {
    const withSource = scripted(REPLY.supported);
    await analyzeScope({ prompt: "asdfghjkl qwertyuiop", sources: { websiteUrl: "https://www.example.com" }, chat: withSource });
    assert.strictEqual(withSource.calls.length, 1, "nonsense beside a source was decided in code");
    const answered = scripted(REPLY.supported);
    const { scope } = await analyzeScope({ prompt: "asdfghjkl qwertyuiop",
      clarification: { question: "What is it about?", answer: "a promo for my bakery's sourdough" }, chat: answered });
    assert.strictEqual(answered.calls.length, 1, "a real answer was re-asked in code");
    assert.strictEqual(scope.status, "SUPPORTED");
  });

  // AT MOST ONE QUESTION holds on the code path, not just in coerce(). The heuristic
  // branch decides before coerce() runs, so it used to ask the unreadable-prompt question
  // again for every unreadable answer — a loop with no exit. After one answer the
  // exchange must END, and end helpfully: out of scope WITH the how-to guidance.
  await ta("an unreadable answer to the unreadable-prompt question ends the exchange — no second question", async () => {
    const chat = tripwire();
    const first = (await analyzeScope({ prompt: "asdfghjkl qwertyuiop", chat })).scope;
    assert.strictEqual(first.status, "NEEDS_CLARIFICATION", "round 1 should ask");
    const second = (await analyzeScope({
      prompt: "hjkl sdfgh",
      clarification: { question: first.clarificationQuestion, answer: "qwerty asdf" },
      chat,
    })).scope;
    assertValidScope(second, "round 2");
    assert.notStrictEqual(second.status, "NEEDS_CLARIFICATION", "a second question was asked");
    assert.strictEqual(second.status, "OUT_OF_SCOPE");
    assert.ok(second.guidance && second.guidance.steps.length, "the end of the exchange carries no how-to guidance");
    assert.strictEqual(second.clarificationQuestion, null);
    assert.strictEqual(chat.calls.length, 0, "decided in code, so no model call");
  });

  await ta("every noModelCall fixture case is decided in code, with its expected status", async () => {
    for (const c of FIX.cases.filter((x) => x.expect.noModelCall)) {
      const chat = tripwire();
      const { scope } = await analyzeScope({ ...requestFor(c), chat });
      assert.strictEqual(chat.calls.length, 0, `${c.id} called a model`);
      assertValidScope(scope, c.id);
      assert.strictEqual(scope.status, c.expect.status, `${c.id} -> ${scope.status}`);
    }
  });

  // Otherwise the live matrix would pass by measuring a heuristic, not the model.
  await ta("every other fixture case genuinely reaches the model", async () => {
    for (const c of FIX.cases.filter((x) => !x.expect.noModelCall)) {
      const chat = scripted(REPLY.supported);
      await analyzeScope({ ...requestFor(c), chat });
      assert.strictEqual(chat.calls.length, 1, `${c.id} never reached the model`);
    }
  });

  // -------------------------------------------------------------- model path
  group("the model path — what the gate sends, and how it reads the reply");

  await ta("the request: stage scope, JSON mode, pinned temperature, a signal, the scope prompt and the live catalog", async () => {
    const chat = scripted(REPLY.supported);
    const clarification = { question: "What is it for?", answer: "our bakery's new sourdough loaf" };
    const preferences = { duration: 30, orientation: "vertical", pace: "fast" };
    await analyzeScope({ prompt: "something for the bakery\n\nour bakery's new sourdough loaf",
      sources: { websiteUrl: "https://www.example.com/private-path?token=abc", uploadedImages: true },
      preferences, clarification, chat });
    const [call] = chat.calls;
    assert.strictEqual(call.stage, "scope");
    assert.strictEqual(call.jsonMode, true);
    assert.strictEqual(call.temperature, 0.1);
    assert.ok(call.signal instanceof AbortSignal, "no AbortSignal handed to the transport");
    assert.strictEqual(call.system, SYSTEM_MD);
    const payload = JSON.parse(call.user);
    assert.deepStrictEqual(payload.capabilities, capabilities.forModel());
    assert.deepStrictEqual(payload.preferences, preferences);
    assert.deepStrictEqual(payload.clarification, clarification);
    // The provider learns THAT a source exists, never what it is.
    assert.deepStrictEqual(payload.sources, { websiteUrl: true, blogUrl: false, referenceVideo: false, uploadedImages: true });
    assert.ok(!call.user.includes("example.com") && !call.user.includes("token=abc"), "a source URL reached the provider");
  });

  await ta("OUT_OF_SCOPE: guidance and userMessage are built from the live catalog, led by the model's reason", async () => {
    capabilities._resetCacheForTests();
    const chat = scripted(REPLY.outOfScope);
    const { scope } = await analyzeScope({ prompt: "Write backend code for my online store in Django please.", chat });
    assertValidScope(scope, "out of scope");
    assert.strictEqual(scope.status, "OUT_OF_SCOPE");
    assert.strictEqual(scope.isSupported, false);
    assert.strictEqual(scope.via, "model (attempt 1)");
    assert.deepStrictEqual(scope.usage, { tokensIn: 120, tokensOut: 30, costUsd: 0.0002 });
    const g = scope.guidance;
    for (const k of ["headline", "reason", "framing", "canCreate", "steps"]) assert.ok(g[k], `guidance.${k} missing`);
    assert.strictEqual(g.reason, REPLY.outOfScope.reason);
    assert.strictEqual(scope.userMessage, capabilities.guidanceText(g));
    assert.ok(scope.userMessage.startsWith(REPLY.outOfScope.reason), scope.userMessage.slice(0, 120));
    const text = g.steps.join("\n");
    assert.ok(text.includes(`one of its ${frameRegistry.listPacks().length} templates`), "template count is not the registry's");
    assert.ok(text.includes(`in any of ${captionLang.listLanguages().length} languages`), "language count is not caption_lang's");
    const range = /Choose the length \(up to (.+?)\)/.exec(text) || [];
    assert.strictEqual(secondsIn(range[1]), config.server.maxDurationSec, `max duration "${range[1]}" is not config's`);
    // Never a rewritten film.
    assert.strictEqual(scope.videoIntent, null);
  });

  await ta("SUPPORTED: no guidance, and the message is the reason", async () => {
    const { scope } = await analyzeScope({ prompt: "A promo video for our bakery's new sourdough", chat: scripted(REPLY.supported) });
    assertValidScope(scope, "supported");
    assert.strictEqual(scope.status, "SUPPORTED");
    assert.strictEqual(scope.guidance, null);
    assert.strictEqual(scope.userMessage, REPLY.supported.reason);
    assert.strictEqual(scope.videoType, "Promotional and marketing videos");
  });

  await ta("SUPPORTED with sub-requests: every part reaches the message, as clean sentences", async () => {
    const chat = scripted({ ...REPLY.supported, reason: "You want an explainer for your meal-kit service",
      unsupportedParts: ["write the email newsletter.", "post it to Instagram"] });
    const { scope } = await analyzeScope({ prompt: "an explainer for our meal kits and also write the newsletter", chat });
    assertValidScope(scope, "parts");
    assert.strictEqual(scope.status, "SUPPORTED");
    for (const p of ["write the email newsletter", "post it to Instagram"]) assert.ok(scope.userMessage.includes(p), `"${p}" missing from: ${scope.userMessage}`);
    assert.ok(!/\.\./.test(scope.userMessage), `doubled full stop: ${scope.userMessage}`);
    assert.ok(/service\. KEYFRAME will make the video/.test(scope.userMessage), `reason not ended as a sentence: ${scope.userMessage}`);
  });

  await ta("NEEDS_CLARIFICATION: the one question reaches the message; no guidance", async () => {
    const { scope } = await analyzeScope({ prompt: "something for our fundraiser", chat: scripted(REPLY.clarify) });
    assertValidScope(scope, "clarify");
    assert.strictEqual(scope.status, "NEEDS_CLARIFICATION");
    assert.ok(scope.userMessage.endsWith(REPLY.clarify.clarificationQuestion), scope.userMessage);
    assert.strictEqual(scope.guidance, null);
  });

  // CHANGED, NOT WEAKENED. This used to send REPLY.clarify (videoIntent: null) after an
  // answer and assert SUPPORTED — the subjectless-job defect, asserted as correct. No second
  // question is still the invariant; the answer now decides which way the exchange ends.
  await ta("a second question after an answer is never asked — end to end, both endings", async () => {
    const clarification = { question: "What is it for?", answer: "it's for the animal shelter" };
    const described = await analyzeScope({ prompt: "something for our fundraiser\n\nit's for the animal shelter", clarification,
      chat: scripted({ ...REPLY.clarify, videoIntent: "A fundraiser video for an animal shelter." }) });
    assertValidScope(described.scope, "described");
    assert.strictEqual(described.scope.status, "SUPPORTED");
    assert.strictEqual(described.scope.videoIntent, "A fundraiser video for an animal shelter.");

    const idk = { question: "What would you like your video to be about?", answer: "idk, whatever you think" };
    const { scope } = await analyzeScope({ prompt: mergeClarification("can you make something for us?", idk), clarification: idk,
      chat: scripted(REPLY.clarify) });
    assertValidScope(scope, "subjectless");
    assert.strictEqual(scope.status, "OUT_OF_SCOPE", `"idk" became ${scope.status} — a job about nothing`);
    assert.strictEqual(scope.clarificationQuestion, null, "a second question was asked");
    assert.ok(SUBJECTLESS.test(scope.reason), scope.reason);
    assert.ok(scope.guidance && scope.guidance.steps.length, "the end of the exchange carries no how-to guidance");
    assert.ok(scope.userMessage.startsWith(scope.reason), scope.userMessage.slice(0, 120));
  });

  await ta("the surface reaches the guidance on every refusal path: model, subjectless answer and unreadable answer", async () => {
    const api = (reason) => capabilities.outOfScopeGuidance({ reason, surface: "api-generate" });
    const create = (reason) => capabilities.outOfScopeGuidance({ reason });
    const refusal = await analyzeScope({ prompt: "Write backend code for my online store in Django please.",
      surface: "api-generate", chat: scripted(REPLY.outOfScope) });
    assert.deepStrictEqual(refusal.scope.guidance, api(REPLY.outOfScope.reason), "model refusal");
    assert.strictEqual(refusal.scope.userMessage, capabilities.guidanceText(api(REPLY.outOfScope.reason)));

    const idk = { question: "q?", answer: "idk" };
    const subjectless = await analyzeScope({ prompt: "can you make something for us?\n\nidk", clarification: idk,
      surface: "api-generate", chat: scripted(REPLY.clarify) });
    assert.deepStrictEqual(subjectless.scope.guidance, api(subjectless.scope.reason), "subjectless answer");

    const chat = tripwire();
    const unreadable = await analyzeScope({ prompt: "hjkl sdfgh", clarification: { question: "q?", answer: "qwerty asdf" },
      surface: "api-generate", chat });
    assert.strictEqual(unreadable.scope.status, "OUT_OF_SCOPE");
    assert.deepStrictEqual(unreadable.scope.guidance, api(unreadable.scope.reason), "unreadable answer");
    assert.strictEqual(chat.calls.length, 0);

    const byDefault = await analyzeScope({ prompt: "Write backend code for my online store in Django please.", chat: scripted(REPLY.outOfScope) });
    assert.deepStrictEqual(byDefault.scope.guidance, create(REPLY.outOfScope.reason), "no surface is the create screen");
    assert.notDeepStrictEqual(api("r").steps, create("r").steps, "the two surfaces' steps are identical — the test proves nothing");
  });

  // Each of these used to fail the schema twice and fall open to SUPPORTED: a clear
  // refusal of a coding request became a job.
  await ta("readable near-miss replies need no repair lap, and a refusal in one still stands", async () => {
    const shapes = [
      ["confidence as a string", { ...REPLY.outOfScope, confidence: "0.95" }, "OUT_OF_SCOPE"],
      ["confidence null", { ...REPLY.clarify, confidence: null }, "NEEDS_CLARIFICATION"],
      ["unsupportedParts as one string", { ...REPLY.supported, unsupportedParts: "write the newsletter" }, "SUPPORTED"],
      ["fenced JSON", "```json\n" + JSON.stringify(REPLY.outOfScope) + "\n```", "OUT_OF_SCOPE"],
      ["trailing prose", JSON.stringify(REPLY.outOfScope) + "\nHope that helps!", "OUT_OF_SCOPE"],
    ];
    for (const [name, reply, status] of shapes) {
      const chat = scripted(reply);
      const { scope } = await analyzeScope({ prompt: "Write backend code for my online store in Django please.", chat });
      assert.strictEqual(chat.calls.length, 1, `${name}: spent a repair lap`);
      assert.strictEqual(scope.status, status, `${name} -> ${scope.status} (${scope.via})`);
    }
  });

  await ta("a malformed first reply gets ONE repair lap that says why, and usage adds both attempts", async () => {
    const chat = scripted("I think this is a video request!", REPLY.supported);
    const { scope } = await analyzeScope({ prompt: "A promo video for our bakery's new sourdough", chat });
    assert.strictEqual(chat.calls.length, 2);
    assert.ok(/not valid JSON/.test(chat.calls[1].user), "the repair lap did not say what was wrong");
    assert.strictEqual(scope.via, "model (attempt 2)");
    assert.strictEqual(scope.usage.tokensIn, 240);
    assert.strictEqual(scope.usage.tokensOut, 60);
  });

  // -------------------------------------------------------------- fail-open
  group("fail-open — every failure is SUPPORTED, and inside the budget");

  await ta("a transport that throws: SUPPORTED via fallback, confidence 0, no second call", async () => {
    const chat = scripted(new Error("503 upstream unavailable"));
    const { scope } = await analyzeScope({ prompt: "Write me a Python backend for an e-commerce website.", chat });
    assertValidScope(scope, "throws");
    assert.strictEqual(scope.status, "SUPPORTED");
    assert.strictEqual(scope.confidence, 0);
    assert.ok(/^fallback \(503/.test(scope.via), scope.via);
    assert.strictEqual(chat.calls.length, 1, "openrouter already retried; the gate must not multiply that");
  });

  await ta("malformed JSON twice: SUPPORTED via fallback after exactly two calls", async () => {
    const chat = scripted("not json at all", "{ still: not json");
    const { scope } = await analyzeScope({ prompt: "Write me a Python backend for an e-commerce website.", chat });
    assertValidScope(scope, "malformed");
    assert.strictEqual(scope.status, "SUPPORTED");
    assert.ok(/^fallback/.test(scope.via), scope.via);
    assert.strictEqual(chat.calls.length, 2);
    assert.strictEqual(scope.usage.tokensIn, 240, "the discarded attempts' tokens were not recorded");
  });

  await ta("the wrong shape twice (no status) and an empty transport result both fall open", async () => {
    const wrong = scripted({ verdict: "OUT_OF_SCOPE" });
    const a = await analyzeScope({ prompt: "Write me a Python backend for an e-commerce website.", chat: wrong });
    assert.strictEqual(a.scope.status, "SUPPORTED");
    assert.strictEqual(wrong.calls.length, 2);
    const empty = async () => undefined;
    const b = await analyzeScope({ prompt: "Write me a Python backend for an e-commerce website.", chat: empty });
    assertValidScope(b.scope, "undefined result");
    assert.strictEqual(b.scope.status, "SUPPORTED");
  });

  const BUDGET = 3000;

  await ta(`a transport that never answers but honours the signal: SUPPORTED within a ${BUDGET}ms budget`, async () => {
    await withBudget(BUDGET, async () => {
      let sawAbort = false;
      const hang = ({ signal }) => new Promise((_, reject) => {
        signal.addEventListener("abort", () => { sawAbort = true; reject(signal.reason || new Error("aborted")); }, { once: true });
      });
      const t0 = Date.now();
      const { scope } = await within(BUDGET + 2500, analyzeScope({ prompt: "Write me a Python backend for an e-commerce website.", chat: hang }), "the gate");
      const dt = Date.now() - t0;
      assertValidScope(scope, "hang");
      assert.strictEqual(scope.status, "SUPPORTED");
      assert.ok(/^fallback \(.*budget/.test(scope.via), scope.via);
      assert.ok(dt >= BUDGET - 100, `returned after ${dt}ms — early, so the budget was not what stopped it`);
      assert.ok(dt < BUDGET + 1000, `took ${dt}ms against a ${BUDGET}ms budget`);
      assert.ok(sawAbort, "the signal handed to the transport never fired");
    });
  });

  // Before the gate raced the transport against its own budget, this hung forever: the
  // budget was only as hard as the transport's willingness to look at the signal.
  await ta(`a transport that never answers and IGNORES the signal still cannot hold the gate past ${BUDGET}ms`, async () => {
    await withBudget(BUDGET, async () => {
      const deaf = () => new Promise(() => {});
      const t0 = Date.now();
      const { scope } = await within(BUDGET + 2500, analyzeScope({ prompt: "Write me a Python backend for an e-commerce website.", chat: deaf }), "the gate");
      const dt = Date.now() - t0;
      assert.strictEqual(scope.status, "SUPPORTED");
      assert.ok(dt < BUDGET + 1000, `took ${dt}ms against a ${BUDGET}ms budget`);
    });
  });

  // ------------------------------------------- the one thing fail-open still refuses
  group("fail-open's one exception — a request KEYFRAME cannot render at all");

  // The incident this exists for: a real customer asked twice, four days apart, for the
  // woman in a photo to run a hand through her hair. The model refused the first (it said
  // "auf dem Bild"); the second blew the budget and the gate fell through to yes,
  // and a template pipeline rendered something nobody asked for.
  const PHOTO_ANIMATION = "Die frau soll mit einer Hand durch Ihre Haare fahren.";
  const ORDINARY = "a promo video for our coffee subscription";

  await ta("a photo-animation request whose model call dies is refused, not waved through", async () => {
    const chat = scripted(new Error("503 upstream unavailable"));
    const { scope } = await analyzeScope({ prompt: PHOTO_ANIMATION, chat });
    assertValidScope(scope, "imagery fallback");
    assert.strictEqual(scope.status, "OUT_OF_SCOPE");
    assert.ok(/^fallback-refused \(503/.test(scope.via), scope.via);
    assert.ok(scope.guidance, "a refusal must carry the capability guidance");
    assert.ok(/animat/i.test(scope.userMessage), scope.userMessage);
  });

  await ta("the same failure on an ordinary request still falls open to SUPPORTED", async () => {
    const chat = scripted(new Error("503 upstream unavailable"));
    const { scope } = await analyzeScope({ prompt: ORDINARY, chat });
    assert.strictEqual(scope.status, "SUPPORTED", "the screen must not widen into a general refusal");
    assert.ok(/^fallback \(503/.test(scope.via), scope.via);
  });

  await ta("a budget overrun refuses it too — the exact shape of the incident", async () => {
    await withBudget(BUDGET, async () => {
      const deaf = () => new Promise(() => {});
      const { scope } = await within(BUDGET + 2500, analyzeScope({ prompt: PHOTO_ANIMATION, chat: deaf }), "the gate");
      assertValidScope(scope, "imagery budget");
      assert.strictEqual(scope.status, "OUT_OF_SCOPE");
      assert.ok(/budget/.test(scope.via), scope.via);
    });
  });

  await ta("the screen never runs when the model DID answer — the model's yes stands", async () => {
    const chat = scripted({ status: "SUPPORTED", confidence: 0.9, requestedDeliverable: "an explainer" });
    const { scope } = await analyzeScope({ prompt: PHOTO_ANIMATION, chat });
    assert.strictEqual(scope.status, "SUPPORTED", "a healthy model answer must not be second-guessed by a word list");
    assert.ok(/^model/.test(scope.via), scope.via);
  });

  await ta("a cancelled request is not refused — nobody is listening", async () => {
    const ac = new AbortController();
    ac.abort();
    const { scope } = await analyzeScope({ prompt: PHOTO_ANIMATION, signal: ac.signal, chat: scripted(new Error("aborted")) });
    assert.strictEqual(scope.status, "SUPPORTED");
    assert.strictEqual(scope.via, "cancelled");
  });

  // The unit table. MUST-FIRE is the class the degraded path may refuse; MUST-NOT is
  // ordinary KEYFRAME work that sits closest to it — stills, logos and animated titles are
  // what this product is FOR, so a word list that cannot tell them apart is worse than none.
  await t("asksForGeneratedImagery — fires on generated imagery and nothing adjacent to it", () => {
    const MUST_FIRE = [
      "Die Frau auf dem Bild soll enimal mit der rechten Hand durch ihre Haare gehen.",
      PHOTO_ANIMATION,
      "animate this photo of my grandmother so she smiles",
      "bring the attached picture to life",
      "make her move in the photo I attached",
      "Create a short realistic cinematic video using the uploaded image as the exact starting appearance of the character. The character must remain the same person throughout.",
      "a photorealistic video of our CEO walking through the factory",
      "Continuation of the same handheld vertical shot. The camera pans slowly right.",
      "upload 1 to 3 clear photos of yourself for identity mapping",
      "a talking head avatar of me presenting the quarterly results",
    ];
    const MUST_NOT = [
      "animate our logo over a dark background",
      'Animiere den Text "CS-3"',
      "a promo using our product photos, with animated titles",
      "use the images from our website as the backdrop for the explainer",
      "a slideshow of our team photos with names appearing one by one",
      "a real estate promo built from the listing photos",
      "a before and after video using the attached images of the renovation",
      "Bilder von unserem Team sollen im Video erscheinen",
      "a 30 second ad where the woman walks into the cafe and orders coffee",
      "our founder should smile as the logo lands at the end of the promo",
      "eine Frau geht durch den Laden — Werbespot für unser Geschäft",
      "una mujer camina por la playa, video promocional de 20 segundos",
      "a video for our photo studio — show the portraits we shoot",
      "a documentary style video about portrait photography in the 1920s",
      ORDINARY,
      "explain how photosynthesis works for secondary school students",
      "Happy man explaining benefits of gym",
      "a person going to jungle sees a lion.",
    ];
    for (const p of MUST_FIRE) {
      const hit = asksForGeneratedImagery(p);
      assert.ok(hit, `should have fired: ${JSON.stringify(p.slice(0, 70))}`);
      assert.ok(hit.reason && hit.requestedDeliverable, "a refusal needs both a reason and a deliverable");
    }
    for (const p of MUST_NOT) {
      assert.strictEqual(asksForGeneratedImagery(p), null, `false positive: ${JSON.stringify(p.slice(0, 70))}`);
    }
    assert.strictEqual(asksForGeneratedImagery(""), null);
    assert.strictEqual(asksForGeneratedImagery(null), null);
    assert.strictEqual(asksForGeneratedImagery(undefined), null);
  });

  // -------------------------------------------------------------- cancellation
  group("cancellation — the person closed the tab");

  await ta("an external signal that is already aborted: a valid scope, fast, with no model call", async () => {
    const ac = new AbortController();
    ac.abort(new Error("client went away"));
    const chat = tripwire();
    const t0 = Date.now();
    const { scope } = await within(2000, analyzeScope({ prompt: "Write me a Python backend for an e-commerce website.", signal: ac.signal, chat }), "the gate");
    assert.ok(Date.now() - t0 < 500, `took ${Date.now() - t0}ms`);
    assertValidScope(scope, "pre-aborted");
    assert.strictEqual(scope.via, "cancelled");
    assert.strictEqual(chat.calls.length, 0);
  });

  await ta("an external signal that fires mid-call: the gate returns promptly, not at the budget", async () => {
    const ac = new AbortController();
    const hang = ({ signal }) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
    setTimeout(() => ac.abort(new Error("client went away")), 150);
    const t0 = Date.now();
    const { scope } = await within(3000, analyzeScope({ prompt: "Write me a Python backend for an e-commerce website.", signal: ac.signal, chat: hang }), "the gate");
    assert.ok(Date.now() - t0 < 1000, `took ${Date.now() - t0}ms`);
    assertValidScope(scope, "mid-call abort");
    assert.strictEqual(scope.via, "cancelled");
  });

  // -------------------------------------------------------------- projections
  group("projections — what reaches the client, what is stored on the job");

  const { scope: FULL } = await analyzeScope({ prompt: "Write backend code for my online store in Django please.",
    chat: scripted({ ...REPLY.outOfScope, confidence: 95 }) });

  await ta("forClient publishes the decision and the guidance — never usage, coercions or timings", async () => {
    assert.ok(FULL.coercions.length && FULL.usage.tokensIn, "the fixture scope should carry usage and a coercion");
    const c = forClient(FULL);
    assert.deepStrictEqual(sorted(Object.keys(c)), sorted(["status", "isSupported", "confidence", "reason", "userMessage",
      "requestedDeliverable", "videoIntent", "videoType", "clarificationQuestion", "unsupportedParts", "guidance"]));
    for (const k of ["usage", "coercions", "via", "ms", "v"]) assert.ok(!(k in c), `${k} reached the client`);
    assert.deepStrictEqual(c.guidance, FULL.guidance);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(c)), c, "not JSON-safe");
  });

  await ta("reduce stores the audit trail, and not the rendered message or guidance", async () => {
    const r = reduce(FULL);
    assert.deepStrictEqual(sorted(Object.keys(r)), sorted(["v", "status", "confidence", "requestedDeliverable", "videoIntent",
      "videoType", "reason", "unsupportedParts", "policyCategory", "via", "ms", "usage", "coercions"]));
    assert.ok(!("guidance" in r) && !("userMessage" in r), "rendered copy stored on the job");
  });

  await ta("forClient and reduce tolerate null; logDecision never throws", async () => {
    assert.strictEqual(forClient(null), null);
    assert.strictEqual(reduce(null), null);
    const { log, warn } = console;
    console.log = () => {}; console.warn = () => {};
    try {
      for (const s of [FULL, null, undefined, {}, { status: "SUPPORTED" }]) assert.doesNotThrow(() => logDecision(s, { route: "test" }));
    } finally { console.log = log; console.warn = warn; }
  });

  await ta("no offline test reached the real provider", async () => {
    assert.strictEqual(strayProviderCalls, 0, `${strayProviderCalls} offline call(s) fell through to openrouter`);
  });

  // -------------------------------------------------------------- optional live
  if (!LIVE) {
    console.log(`\n${passed} assertion group(s) passed (offline; pass --llm to also run the ${FIX.cases.length}-case matrix against the model)`);
    return;
  }

  group(`LIVE — ${FIX.cases.length} fixture cases through the real analyzeScope (costs money)`);
  let liveCalls = 0;
  openrouter.chat = async (args) => { liveCalls++; return REAL_CHAT(args); };

  let ran = 0, matched = 0;
  const failures = [];
  for (const c of FIX.cases) {
    const e = c.expect;
    const before = liveCalls;
    let scope = null, threw = null;
    try { ({ scope } = await analyzeScope(requestFor(c))); } catch (err) { threw = err; }
    ran++;
    const calls = liveCalls - before;
    const problems = [];
    if (threw) problems.push(`analyzeScope threw (it must never): ${threw.message}`);
    else {
      try { assertValidScope(scope, c.id); } catch (err) { problems.push(err.message); }
      if (e.status && scope.status !== e.status) problems.push(`expected ${e.status}`);
      if (e.statusIn && !e.statusIn.includes(scope.status)) problems.push(`expected one of ${e.statusIn.join(" / ")}`);
      if (e.unsupportedPartsNonEmpty && !(scope.unsupportedParts || []).length) problems.push("expected unsupportedParts to name the non-video sub-request");
      if (e.noModelCall && calls !== 0) problems.push(`made ${calls} model call(s) on a path code must decide`);
      // A live pass that never reached the model proves nothing about the model.
      if (!e.noModelCall && !/^model/.test(scope.via)) problems.push(`the model was not exercised (${scope.via})`);
    }
    const head = threw ? `${c.id} -> THREW`
      : `${c.id} -> ${scope.status} (confidence ${scope.confidence}, ${scope.ms}ms, ${scope.via}, ${calls} call${calls === 1 ? "" : "s"})`;
    if (problems.length) {
      process.exitCode = 1;
      failures.push(c.id);
      console.error("  FAIL  " + head + "\n        " + problems.join("; "));
    } else {
      matched++; passed++;
      console.log("  ok    " + head);
    }
    if (scope) {
      console.log(`        reason: ${scope.reason}`);
      if (scope.clarificationQuestion) console.log(`        question: ${scope.clarificationQuestion}`);
      if (scope.unsupportedParts.length) console.log(`        unsupportedParts: ${scope.unsupportedParts.join(" | ")}`);
      if (scope.coercions.length) console.log(`        coercions: ${scope.coercions.join(" | ")}`);
    }
  }
  openrouter.chat = REAL_CHAT;

  // NO SILENT CAPS: a run cut short must never read as a pass.
  if (ran !== FIX.cases.length) {
    process.exitCode = 1;
    console.error(`  FAIL  live run covered only ${ran}/${FIX.cases.length} cases`);
  }
  console.log(`\n${passed} assertion group(s) passed (${ran}/${FIX.cases.length} live cases ran, ${matched} matched${failures.length ? `; failed: ${failures.join(", ")}` : ""})`);
})().catch((e) => { console.error("test run failed: " + (e && e.stack || e)); process.exitCode = 1; });
