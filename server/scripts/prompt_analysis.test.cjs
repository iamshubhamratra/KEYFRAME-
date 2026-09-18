#!/usr/bin/env node
// Stage 0 guards — prompt moderation, the analysis schema, its coercion rules, the
// deterministic floor, the tier-1 refusal that survives as defence in depth, and the
// two places the analysis reaches the script.
//
// Stage 0 is a NORMALISER. Scope is decided at submit by prompt_scope.js, so every
// request the analyser sees is already in scope; nothing here may teach it to refuse
// or to offer a different film. The only refusal left is the deterministic tier-1
// screen, which is asserted separately below.
//
// OFFLINE BY DEFAULT: no network, no API key, no server, and never the real jobs.json.
// It must not require project_pipeline or server.js. It DOES now load pipeline.js —
// the /api/generate storyboard seam has no other observable surface — and pipeline.js
// requires db.js, which runs boot recovery and can rewrite its store at require time.
// So the store is redirected into a temp dir before any server module loads, exactly
// as scope_routes.test.cjs does, and the real server/jobs.json is hashed before and
// after: the run fails if it moved. The deterministic-path tests replace
// openrouter.chat with a tripwire or a scripted stub, so a model call there is a test
// failure rather than a bill.
//
//   node scripts/prompt_analysis.test.cjs           offline guards only
//   node scripts/prompt_analysis.test.cjs --llm     also calls the real model once
//                                                   per corpus case (costs money)
//   KEEP_TMP=1 node scripts/prompt_analysis.test.cjs  keep the temp store for inspection

const assert = require("node:assert");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// ---------------------------------------------------------------- isolation
// FIRST, before a single server module is required. db.js reads config.paths.dbFile
// once, at require time, so a redirect after anything has loaded it is no redirect.

const SERVER_ROOT = path.resolve(__dirname, "..");
const REAL_DB = path.join(SERVER_ROOT, "jobs.json");
function sha256(file) {
  try { return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"); }
  catch (e) { return e && e.code === "ENOENT" ? "<absent>" : `<unreadable: ${e && e.code}>`; }
}
const HASH_BEFORE = sha256(REAL_DB);

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "keyframe-prompt-analysis-"));
const TMP_PATHS = {
  dbFile: path.join(TMP, "jobs.json"),
  jobsDir: path.join(TMP, "jobs"),
  uploadsDir: path.join(TMP, "uploads"),
  videosDir: path.join(TMP, "videos"),
};
function removeTmp() {
  if (process.env.KEEP_TMP) return;
  // Only ever the directory this run created.
  if (path.basename(TMP).startsWith("keyframe-prompt-analysis-")) {
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* the OS temp janitor collects it */ }
  }
}
// On EXIT as well as at the end: a module that throws while loading would otherwise
// leave the temp store behind. rmSync is synchronous, which is all 'exit' allows.
process.on("exit", removeTmp);
function abort(why) {
  console.error(`ABORT  ${why}`);
  removeTmp();
  process.exit(1);
}
{
  const isLoaded = (rel) => Object.prototype.hasOwnProperty.call(require.cache, path.join(SERVER_ROOT, rel));
  let config;
  try { config = require("../src/config"); } catch (e) { abort(`config did not load: ${e.message}`); }
  if (isLoaded("src/db.js")) abort("src/db.js was loaded by config.js, before the store could be redirected");
  try { Object.assign(config.paths, TMP_PATHS); }
  catch (e) { abort(`config.paths cannot be redirected in memory (${e.message}) — refusing to open the real store`); }
  for (const [k, v] of Object.entries(TMP_PATHS)) {
    if (config.paths[k] !== v) abort(`config.paths.${k} did not take the temp path — refusing to open the real store`);
  }
}

const moderation = require("../src/services/prompt_moderation");
const schema = require("../src/services/prompt_analysis_schema");
const { fallbackAnalysis } = require("../src/services/prompt_analysis_fallback");
const lex = require("../src/services/template_lexicon");
const {
  AnalysisSchema, coerce, reduce, forClient, minimalAnalysis, clipRefinedPrompt,
  QUALITY_DIMENSIONS, SCHEMA_VERSION, CLASSIFICATIONS, MODEL_CLASSIFICATIONS,
  REFINED_PROMPT_MAX, BEATS_MAX,
} = schema;

const FIX = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "prompt_analysis_cases.json"), "utf8"));
const SYSTEM_MD = fs.readFileSync(path.join(__dirname, "..", "src", "prompts", "system_prompt_analysis.md"), "utf8");

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

// Build a valid analysis from a partial, the way the real path does.
function build(partial, ctx = {}) {
  const parsed = AnalysisSchema.parse(Object.assign({ classification: "REFINABLE", refinedPrompt: "x" }, partial));
  return coerce(parsed, Object.assign({ originalPrompt: "x", now: 0 }, ctx));
}

const sorted = (xs) => [...xs].sort();

// A prompt of EXACTLY n characters, in sentences, with no digits, marker words or
// tier-1 terms: the sentence-boundary clip has real boundaries to find, a READY echo of
// it is a plausible reply, and nothing but its length is under test.
function longPrompt(n) {
  const sentence = "A neighbourhood bakery opens before dawn and bakes sourdough for the whole street. ";
  return sentence.repeat(Math.ceil(n / sentence.length) + 1).slice(0, n - 1) + ".";
}

// n MARKED scenes, one per line. The text of each avoids "beat N" / "step N", which the
// floor's splitter would read as a second marker inside the line.
function storyline(n) {
  return Array.from({ length: n }, (_, i) => `Scene ${i + 1}: market stall number ${i + 1} rolls up its shutter.`).join("\n");
}

// ---------------------------------------------------------------- moderation
group("moderation — the co-occurrence design");

t("every tier-1 rule requires TWO term classes (no single-word blocks, structurally)", () => {
  assert.ok(moderation.TIER1_RULES.length >= 4, "expected several rules");
  for (const r of moderation.TIER1_RULES) {
    assert.ok(r.a && r.a.size > 0, `rule ${r.id} has no 'a' class`);
    assert.ok(r.b && r.b.size > 0, `rule ${r.id} has no 'b' class`);
    assert.ok(Number.isFinite(r.window) && r.window > 0, `rule ${r.id} has no window`);
  }
});

t(`all ${FIX.moderationMustPass.length} benign keyword-heavy prompts clear tier 1`, () => {
  const bad = FIX.moderationMustPass.filter((p) => moderation.screen(p).tier1);
  assert.deepStrictEqual(bad, [], "wrongly refused: " + bad.join(" | "));
});

t(`all ${FIX.moderationMustBlock.length} unambiguous requests are stopped`, () => {
  const missed = FIX.moderationMustBlock.filter((p) => !moderation.screen(p).tier1);
  assert.deepStrictEqual(missed, [], "not stopped: " + missed.join(" | "));
});

t("screen() never throws and never returns a classification", () => {
  for (const x of [null, undefined, "", "   ", " ", 42, {}, [], "x".repeat(20000)]) {
    const r = moderation.screen(x);
    assert.ok(r && typeof r === "object", "no result for " + String(x).slice(0, 12));
    assert.strictEqual(r.classification, undefined, "moderation must not classify");
    assert.ok(Array.isArray(r.hints));
  }
});

t("a refusal reason never echoes the prompt back", () => {
  const p = "step by step guide to synthesize sarin nerve agent in a home lab";
  const r = moderation.screen(p);
  assert.ok(r.tier1, "expected a block");
  assert.ok(!r.tier1.reason.includes("sarin"), "reason echoed the matched term");
});

t("hints are evidence, not a verdict — a prevention prompt still surfaces its term", () => {
  const r = moderation.screen("suicide prevention hotline PSA for university students");
  assert.strictEqual(r.tier1, null);
  assert.ok(r.hints.some((h) => h.term === "suicide"), "expected a self-harm hint");
});

// ---------------------------------------------------------------- contract
group("contract — the normaliser answers in three classifications and no refusal fields");

t("MODEL_CLASSIFICATIONS is exactly READY | REFINABLE | STRUCTURED_STORY", () => {
  assert.deepStrictEqual(sorted(MODEL_CLASSIFICATIONS), ["READY", "REFINABLE", "STRUCTURED_STORY"]);
});

t("CLASSIFICATIONS is the model's three plus DISALLOWED, which only tier 1 can set", () => {
  assert.deepStrictEqual(sorted(CLASSIFICATIONS), sorted([...MODEL_CLASSIFICATIONS, "DISALLOWED"]));
});

// An allowlist, not a denylist: a field re-added to the contract has to be added here
// too, in the same reviewed diff as the schema and the system prompt.
const SCHEMA_KEYS = ["classification", "confidence", "quality", "analyzedPrompt", "refinedPrompt",
  "improvements", "narrative", "signals", "facts", "inferred", "safety"];

t("the schema's field set is exactly the normaliser contract", () => {
  assert.deepStrictEqual(sorted(Object.keys(AnalysisSchema.shape)), sorted(SCHEMA_KEYS));
});

// THE ZOD-STRIP TRAP, guarded from the prompt's side. A key the prompt asks for that
// the schema lacks is emitted, parsed, and silently thrown away; a key the schema
// carries that the prompt never asks for is always its default.
t("the system prompt's output block asks for exactly the fields the schema keeps", () => {
  const out = SYSTEM_MD.split("## Output")[1] || "";
  const block = (out.match(/```\r?\n([\s\S]*?)```/) || [])[1] || "";
  const keys = [...block.matchAll(/^ {2}"([A-Za-z]+)":/gm)].map((m) => m[1]);
  assert.ok(keys.length, "could not read the output block");
  assert.deepStrictEqual(sorted(keys), sorted(SCHEMA_KEYS));
});

t("the system prompt offers the model exactly MODEL_CLASSIFICATIONS, in the template and the list", () => {
  const line = (SYSTEM_MD.match(/"classification":\s*"([^"]+)"/) || [])[1] || "";
  assert.deepStrictEqual(sorted(line.split("|").map((s) => s.trim())), sorted(MODEL_CLASSIFICATIONS));
  const section = (SYSTEM_MD.split(/^## The three classifications/m)[1] || "").split(/^## /m)[0];
  const listed = [...section.matchAll(/^- \*\*([A-Z_]+)\*\*/gm)].map((m) => m[1]);
  assert.deepStrictEqual(sorted(listed), sorted(MODEL_CLASSIFICATIONS));
});

t("every worked example is a valid reply: parses, keeps every key, and coerces with zero coercions", () => {
  const examples = [...SYSTEM_MD.matchAll(/Input `prompt`: `([^`]+)`\s*```json\r?\n([\s\S]*?)```/g)];
  assert.ok(examples.length >= 2, `expected at least 2 full worked examples, found ${examples.length}`);
  for (const [, prompt, json] of examples) {
    const raw = JSON.parse(json);
    for (const k of Object.keys(raw)) assert.ok(SCHEMA_KEYS.includes(k), `example "${prompt}" carries "${k}", which zod would strip`);
    assert.ok(MODEL_CLASSIFICATIONS.includes(raw.classification), `example "${prompt}" is ${raw.classification}`);
    const r = coerce(AnalysisSchema.parse(raw), { originalPrompt: prompt, now: 0 });
    assert.strictEqual(r.analysis.classification, raw.classification, prompt);
    assert.deepStrictEqual(r.coercions, [], `example "${prompt}" coerced: ${r.coercions.join(" | ")}`);
  }
});

// The ceiling is the normaliser's whole knowledge of the product, and rule 7 tells it
// never to promise past it — so a ceiling that overstates the product is a promise
// made on every job. It said ".srt/.vtt" while nothing calls captions.writeVtt. Each
// checkable claim is held to the module that owns the fact, through the same catalog
// the scope gate's out-of-scope answer is built from, so the two cannot drift apart.
t("the capability ceiling claims only what the app does — read from keyframe_capabilities", () => {
  const caps = require("../src/services/keyframe_capabilities").catalog();
  const section = (SYSTEM_MD.split(/^## The capability ceiling[^\n]*$/m)[1] || "").split(/^## /m)[0].trim();
  const [can = "", pictures = ""] = section.split(/\r?\n\s*\r?\n/);
  assert.ok(/renders one MP4/.test(can), "could not read the capability paragraph");

  const offered = [...can.matchAll(/\.(srt|vtt|ssa|ass|sub|sbv|ttml|dfxp)\b/gi)].map((m) => m[1].toUpperCase());
  assert.ok(offered.length, "the capability paragraph no longer says which subtitle file is delivered");
  for (const f of offered) {
    assert.ok(caps.audio.subtitleFiles.includes(f),
      `the ceiling promises a .${f.toLowerCase()} file; the pipeline writes only ${caps.audio.subtitleFiles.join(", ")}`);
  }
  assert.ok(can.includes(`${caps.output.minDurationSec}-${caps.output.maxDurationSec} seconds`), "duration range disagrees with config.server");
  const ASPECT = { horizontal: "16:9", vertical: "9:16", square: "1:1" };
  assert.ok(can.includes(caps.output.orientations.map((o) => ASPECT[o.key] || o.key).join(" / ")), "orientations disagree with config.orientations");
  assert.ok(can.includes(caps.output.resolutions.join(" / ")), "resolutions disagree with config.qualities");
  assert.ok(can.includes(`${caps.output.fps.join(" / ")} fps`), "frame rates disagree with config.allowedFps");
  assert.ok(can.includes(`${caps.language.shipped.length} languages`), "language count disagrees with caption_lang");
  assert.ok(can.includes(caps.pace.modes.join(" / ")), "pace modes disagree with pacing");
  const templates = Number((can.match(/~(\d+) authored/) || [])[1]);
  assert.ok(caps.templates.count > 0 && Math.abs(templates - caps.templates.count) <= caps.templates.count * 0.1,
    `the ceiling claims ~${templates} design systems; frame_registry lists ${caps.templates.count}`);
  assert.ok(pictures.includes(`up to ${caps.inputs.maxImages} images`), "the upload image cap disagrees with the catalog");
});

// ---------------------------------------------------------------- coercion
group("coercion — every rule fails toward the user's own words");

t("classification is accepted as any string — a slightly-off label costs a note, not a repair lap", () => {
  assert.doesNotThrow(() => AnalysisSchema.parse({ classification: "structured story" }));
  const r = build({ classification: "structured story", narrative: { orderLocked: true, source: "user-authored",
    beats: [{ index: 1, beat: "a" }, { index: 2, beat: "b" }] } });
  assert.strictEqual(r.analysis.classification, "STRUCTURED_STORY");
  assert.ok(r.coercions.some((c) => /normalised to STRUCTURED_STORY/.test(c)), r.coercions.join(" | "));
});

t("an unrecognised classification becomes REFINABLE @ confidence 0, never a refusal", () => {
  const r = build({ classification: "NONSENSE", confidence: 0.9 });
  assert.strictEqual(r.analysis.classification, "REFINABLE");
  assert.strictEqual(r.analysis.confidence, 0);
  assert.ok(r.coercions.some((c) => /unrecognised -> REFINABLE @ confidence 0/.test(c)));
});

t("only the deterministic tier can block: a model-supplied block is downgraded", () => {
  const r = build({ safety: { verdict: "block" } });
  assert.strictEqual(r.analysis.safety.verdict, "review");
  assert.notStrictEqual(r.analysis.classification, "DISALLOWED");
});

t("DISALLOWED without a tier-1 match is downgraded", () => {
  const r = build({ classification: "DISALLOWED" });
  assert.strictEqual(r.analysis.classification, "REFINABLE");
  assert.strictEqual(r.analysis.safety.verdict, "review");
});

t("a tier-1 match forces DISALLOWED, clears the rewrite and carries the user-facing reason", () => {
  const r = build({ classification: "READY", refinedPrompt: "anything", improvements: [{ what: "w", why: "y" }] },
    { tier1: { rule: "r", category: "c", reason: "a plain user-facing sentence" }, originalPrompt: "my words" });
  assert.strictEqual(r.analysis.classification, "DISALLOWED");
  assert.strictEqual(r.analysis.safety.verdict, "block");
  assert.strictEqual(r.analysis.safety.reason, "a plain user-facing sentence");
  assert.strictEqual(r.analysis.refinedPrompt, "my words");
  assert.deepStrictEqual(r.analysis.improvements, []);
});

t("READY + an unexplained rewrite resets to the user's words", () => {
  const r = build({ classification: "READY", refinedPrompt: "a rewrite", improvements: [] }, { originalPrompt: "mine" });
  assert.strictEqual(r.analysis.refinedPrompt, "mine");
  assert.strictEqual(r.analysis.classification, "READY");
});

t("READY + an EXPLAINED rewrite becomes REFINABLE and keeps the rewrite", () => {
  const r = build({ classification: "READY", refinedPrompt: "a better rewrite", improvements: [{ what: "w", why: "y" }] },
    { originalPrompt: "mine" });
  assert.strictEqual(r.analysis.classification, "REFINABLE");
  assert.strictEqual(r.analysis.refinedPrompt, "a better rewrite");
});

t("an order lock needs at least two beats", () => {
  const r = build({ narrative: { orderLocked: true, source: "user-authored", beats: [{ index: 1, beat: "only one" }] } });
  assert.strictEqual(r.analysis.narrative.orderLocked, false);
});

t("beats are sorted and renumbered contiguously", () => {
  const r = build({ narrative: { orderLocked: true, source: "user-authored",
    beats: [{ index: 7, beat: "c" }, { index: 2, beat: "a" }, { index: 5, beat: "b" }] } });
  assert.deepStrictEqual(r.analysis.narrative.beats.map((b) => b.index), [1, 2, 3]);
  assert.deepStrictEqual(r.analysis.narrative.beats.map((b) => b.beat), ["a", "b", "c"]);
});

t("STRUCTURED_STORY without a surviving lock is downgraded", () => {
  const r = build({ classification: "STRUCTURED_STORY", narrative: { orderLocked: false, source: "derived", beats: [] } });
  assert.strictEqual(r.analysis.classification, "REFINABLE");
});

t("signal labels outside the lexicon are dropped, real ones canonicalised", () => {
  const r = build({ signals: { contentTypes: ["EDUCATION", "not-a-real-label"], vibes: ["cinematic"] } });
  assert.deepStrictEqual(r.analysis.signals.contentTypes, ["education"]);
  assert.deepStrictEqual(r.analysis.signals.vibes, ["cinematic"]);
  assert.ok(r.coercions.some((c) => /outside the lexicon/.test(c)));
});

t("every emitted signal label exists in template_lexicon.AXES", () => {
  const r = build({ signals: { contentTypes: ["education"], industries: ["ai"], vibes: ["premium"],
    tones: ["confident"], visualStyles: ["dark"], typographyStyles: ["serif"], animationStyles: ["kinetic"] } });
  for (const axis of schema.AXIS_KEYS) {
    for (const label of r.analysis.signals[axis]) {
      assert.ok(Object.keys(lex.AXES[axis]).includes(label), `${label} is not a ${axis} label`);
    }
  }
});

t("a fact cannot be sourced to a page that was never fetched", () => {
  const r = build({ facts: [
    { text: "from the site", kind: "fact", priority: 3, source: "website" },
    { text: "from the user", kind: "fact", priority: 3, source: "prompt" },
  ] }, { hasWebsite: false });
  assert.deepStrictEqual(r.analysis.facts.map((f) => f.text), ["from the user"]);
  assert.ok(r.coercions.some((c) => /provenance/.test(c)));
});

t("a fact IS kept when its source really was fetched", () => {
  const r = build({ facts: [{ text: "from the site", kind: "fact", priority: 3, source: "website" }] }, { hasWebsite: true });
  assert.strictEqual(r.analysis.facts.length, 1);
});

t("originalPrompt is code-owned: a model-supplied one is ignored", () => {
  const r = build({ originalPrompt: "the model tried to set this" }, { originalPrompt: "the real prompt" });
  assert.strictEqual(r.analysis.originalPrompt, "the real prompt");
  assert.strictEqual(r.analysis.v, SCHEMA_VERSION);
});

// coerce() is also the defensive layer for values zod would have rejected — it runs
// on the repair path and must never throw on a hostile object. These call it
// DIRECTLY, bypassing .parse(), which is the only way to exercise that.
t("quality and confidence are clamped, missing filtered to the enumerated dimensions", () => {
  const r = coerce({ classification: "REFINABLE", refinedPrompt: "x",
    quality: { score: 999, missing: ["audience", "not-a-dimension"] }, confidence: 7 },
  { originalPrompt: "x", now: 0 });
  assert.strictEqual(r.analysis.quality.score, 100);
  assert.strictEqual(r.analysis.confidence, 1);
  assert.deepStrictEqual(r.analysis.quality.missing, ["audience"]);
  for (const d of r.analysis.quality.missing) assert.ok(QUALITY_DIMENSIONS.includes(d));
});

t("coerce never throws on a hostile or malformed value, and always yields usable text", () => {
  const cyclic = { classification: "READY" }; cyclic.self = cyclic;
  const hostile = [
    {}, { classification: null }, { classification: 42 }, { classification: { nested: true } },
    { narrative: "not an object" }, { signals: 42 }, { facts: "nope" }, { improvements: null },
    { inferred: "no" }, { quality: "x" }, { narrative: { beats: "no" } }, { safety: null },
    { safety: "block", classification: "DISALLOWED" },
    { refinedPrompt: 12345 }, { refinedPrompt: Array.from({ length: 2000 }, () => "a") },
    // Longer than the contract: the truncation rule has to bring it inside.
    { refinedPrompt: longPrompt(REFINED_PROMPT_MAX + 700) },
    { narrative: { orderLocked: true, beats: Array.from({ length: 40 }, (_, i) => ({ index: i + 1, beat: "b" })) } },
    // Not objects at all — the repair path can hand over anything.
    null, undefined, "a bare string", 42, true, [], cyclic,
  ];
  for (const h of hostile) {
    let r;
    assert.doesNotThrow(() => { r = coerce(h, { originalPrompt: "p", now: 0 }); }, String(h && JSON.stringify(h === cyclic ? "cyclic" : h)).slice(0, 60));
    assert.ok(MODEL_CLASSIFICATIONS.includes(r.analysis.classification), `-> ${r.analysis.classification}`);
    assert.strictEqual(typeof r.analysis.refinedPrompt, "string");
    // CHANGED: this asserted `<= 1800`, the old schema bound, and so encoded the defect —
    // a bound below the longest prompt the routes accept. It now asserts the contract's
    // real bound, and the list above includes a value that actually exceeds it.
    assert.ok(r.analysis.refinedPrompt.length <= REFINED_PROMPT_MAX, "refinedPrompt escaped its bound");
    assert.ok(r.analysis.narrative.beats.length <= BEATS_MAX, "beats escaped the storage cap");
  }
  assert.doesNotThrow(() => coerce({ classification: "READY" }, null), "null ctx");
});

t("NO coercion can ever produce a refusal without a tier-1 match", () => {
  const shapes = [
    { classification: "READY", refinedPrompt: "z" }, { classification: "DISALLOWED" },
    { classification: "disallowed" }, { classification: "STRUCTURED_STORY" }, { safety: { verdict: "block" } },
    { refinedPrompt: "" }, { classification: "NOPE" }, { classification: null }, {},
  ];
  for (const s of shapes) {
    // Direct, so unparseable classifications are covered too — a model returning
    // garbage must never thereby cause a refusal.
    const r = coerce(Object.assign({ refinedPrompt: "x" }, s), { originalPrompt: "a harmless prompt", now: 0 });
    assert.ok(MODEL_CLASSIFICATIONS.includes(r.analysis.classification), `${JSON.stringify(s)} -> ${r.analysis.classification}`);
  }
});

// ---------------------------------------------------------------- legacy
// The only place the retired labels and fields may be named. They still arrive: jobs
// stored before scope moved upstream, a client that cached an analysis, a model
// primed on the old prompt.
group("legacy — what the analyser used to emit still normalises cleanly");

t("retired INCOMPLETE and UNSUITABLE labels normalise to REFINABLE, with a coercion note", () => {
  for (const label of ["INCOMPLETE", "UNSUITABLE", "unsuitable", " Incomplete "]) {
    assert.doesNotThrow(() => AnalysisSchema.parse({ classification: label }), `${label} cost a repair lap`);
    const r = build({ classification: label, confidence: 0.8 });
    assert.strictEqual(r.analysis.classification, "REFINABLE", label);
    // A retired label is a known meaning, not garbage: its confidence stands.
    assert.strictEqual(r.analysis.confidence, 0.8, label);
    assert.ok(r.coercions.some((c) => /^legacy classification (INCOMPLETE|UNSUITABLE) -> REFINABLE/.test(c)),
      `${label}: ${r.coercions.join(" | ")}`);
  }
});

t("a legacy analysis still parses, and its retired fields are neither stored nor published", () => {
  const legacy = {
    classification: "UNSUITABLE", refinedPrompt: "the user's words",
    unsuitableReason: "an old reason", alternatives: [{ label: "a", refinedPrompt: "another film", whyItFits: "w" }],
  };
  const { analysis } = coerce(AnalysisSchema.parse(legacy), { originalPrompt: "the user's words", now: 0 });
  assert.strictEqual(analysis.classification, "REFINABLE");
  for (const view of [analysis, reduce(analysis), forClient(reduce(analysis))]) {
    assert.ok(!("unsuitableReason" in view), "unsuitableReason survived");
    assert.ok(!("alternatives" in view), "alternatives survived");
  }
  // db.shape() hands forClient the STORED blob of an old job as-is, without coerce.
  const oldStored = { classification: "UNSUITABLE", originalPrompt: "p", refinedPrompt: "p", unsuitableReason: "r", alternatives: [] };
  const published = forClient(oldStored);
  assert.ok(!("unsuitableReason" in published) && !("alternatives" in published), "an old job's retired fields reached the wire");
});

// ---------------------------------------------------------------- the floor
group("the deterministic floor — an outage must never refuse");

t("the floor only ever emits REFINABLE or STRUCTURED_STORY", () => {
  for (const c of FIX.cases) {
    const a = fallbackAnalysis({ prompt: c.prompt, intent: {} });
    assert.ok(["REFINABLE", "STRUCTURED_STORY"].includes(a.classification), `${c.id} -> ${a.classification}`);
  }
});

t("the floor never emits review or block", () => {
  for (const c of FIX.cases) {
    assert.strictEqual(fallbackAnalysis({ prompt: c.prompt, intent: {} }).safety.verdict, "allow", c.id);
  }
});

t("the floor never rewrites the user's words", () => {
  for (const c of FIX.cases) {
    const a = fallbackAnalysis({ prompt: c.prompt, intent: {} });
    assert.strictEqual(a.refinedPrompt, c.prompt.trim(), c.id);
    assert.deepStrictEqual(a.improvements, [], c.id);
  }
});

t("the floor's output carries only contract fields and passes the schema AND coerce with zero coercions", () => {
  for (const c of FIX.cases) {
    const raw = fallbackAnalysis({ prompt: c.prompt, intent: {} });
    assert.deepStrictEqual(sorted(Object.keys(raw)), sorted(SCHEMA_KEYS), c.id);
    const r = coerce(AnalysisSchema.parse(raw), { originalPrompt: c.prompt.trim(), now: 0 });
    assert.deepStrictEqual(r.coercions, [], `${c.id} coerced: ${r.coercions.join(" | ")}`);
  }
});

// The floor catches MARKED sequences ("Scene 1:", "3)") — that is all a regex can
// honestly do. A prose sequence ("first… then… finally") is model-only, and a
// fixture that expects the regex to find one would be asserting a lie.
t("the floor detects a MARKED scene sequence without a model", () => {
  const marked = FIX.cases.filter((c) => c.expect && c.expect.floorDetects);
  assert.ok(marked.length, "no floorDetects case in the corpus");
  for (const c of marked) {
    const a = fallbackAnalysis({ prompt: c.prompt, intent: {} });
    assert.strictEqual(a.narrative.orderLocked, true, c.id);
    assert.ok(a.narrative.beats.length >= (c.expect.minBeats || 2),
      `${c.id}: ${a.narrative.beats.length} beats < ${c.expect.minBeats}`);
    assert.strictEqual(a.classification, "STRUCTURED_STORY", c.id);
  }
});

t("the floor does NOT invent an order lock it cannot see", () => {
  // A prose-sequenced prompt must fall through to REFINABLE rather than claiming a
  // lock it has not actually parsed — a false "your order, kept" is worse than none.
  const proseOnly = FIX.cases.filter((c) => c.expect && c.expect.orderLocked && !c.expect.floorDetects);
  for (const c of proseOnly) {
    const a = fallbackAnalysis({ prompt: c.prompt, intent: {} });
    assert.strictEqual(a.narrative.orderLocked, false, `${c.id} claimed a lock the regex cannot support`);
  }
});

t("the floor never throws", () => {
  for (const x of [null, undefined, "", "   ", "x".repeat(9000), "  "]) {
    assert.doesNotThrow(() => fallbackAnalysis({ prompt: x, intent: {} }), String(x).slice(0, 12));
  }
});

// ---------------------------------------------------------------- long prompts
// "Never throws" was tested on the floor FUNCTION, which never did throw — its OUTPUT
// failed the schema, and the parse of that output is what threw. So every guard here
// parses what the floor returns rather than only calling it.
group("long prompts — the contract holds at every length an entry point accepts");

// The bound is DERIVED from the routes, so it is checked against them. The route files
// are read as TEXT: requiring one loads multer, express and the create path for the
// sake of two numbers.
t("REFINED_PROMPT_MAX is the longest prompt any entry point accepts", () => {
  const caps = [];
  for (const rel of ["src/routes/projects.js", "src/routes/generate.js", "src/routes/admin_templates.js"]) {
    const src = fs.readFileSync(path.join(SERVER_ROOT, rel), "utf8");
    for (const m of src.matchAll(/prompt(?: and clarification together)? must be at most (\d+) characters/g)) caps.push(Number(m[1]));
  }
  assert.ok(caps.length >= 3, `found only ${caps.length} prompt cap(s) in the routes`);
  assert.strictEqual(REFINED_PROMPT_MAX, Math.max(...caps),
    `the routes accept prompts up to ${Math.max(...caps)} characters; the analysis contract holds ${REFINED_PROMPT_MAX}`);
});

t("a correct READY echo of the longest accepted prompt is a valid reply, not a repair lap", () => {
  const p = longPrompt(REFINED_PROMPT_MAX);
  let parsed;
  assert.doesNotThrow(() => { parsed = AnalysisSchema.parse({ classification: "READY", refinedPrompt: p }); },
    "a byte-for-byte READY echo failed the schema");
  const r = coerce(parsed, { originalPrompt: p, now: 0 });
  assert.strictEqual(r.analysis.classification, "READY");
  assert.strictEqual(r.analysis.refinedPrompt, p);
  assert.deepStrictEqual(r.coercions, [], r.coercions.join(" | "));
});

t("the floor's output parses at 3000, 4000 and past the bound: verbatim inside it, clipped at a sentence past it", () => {
  for (const n of [3000, REFINED_PROMPT_MAX, REFINED_PROMPT_MAX + 1500]) {
    const p = longPrompt(n);
    const raw = fallbackAnalysis({ prompt: p, intent: {} });
    let parsed;
    assert.doesNotThrow(() => { parsed = AnalysisSchema.parse(raw); }, `${n}: the floor's own output failed the schema`);
    const r = coerce(parsed, { originalPrompt: p, now: 0 });
    assert.deepStrictEqual(r.coercions, [], `${n} coerced: ${r.coercions.join(" | ")}`);
    if (n <= REFINED_PROMPT_MAX) {
      assert.strictEqual(r.analysis.refinedPrompt, p, `${n}: the floor rewrote the user's words`);
    } else {
      assert.ok(r.analysis.refinedPrompt.length <= REFINED_PROMPT_MAX, `${n}: not clipped`);
      assert.ok(p.startsWith(r.analysis.refinedPrompt), `${n}: the clip is not a prefix of the user's words`);
      assert.ok(r.analysis.refinedPrompt.endsWith("."), `${n}: the clip did not land on a sentence boundary`);
      assert.strictEqual(r.analysis.originalPrompt, p, `${n}: the stored original was clipped too`);
    }
  }
});

t("a READY whose words have to be clipped is no longer READY", () => {
  const p = longPrompt(REFINED_PROMPT_MAX + 800);
  const r = coerce({ classification: "READY", refinedPrompt: p }, { originalPrompt: p, now: 0 });
  assert.strictEqual(r.analysis.classification, "REFINABLE");
  assert.ok(r.analysis.refinedPrompt.length <= REFINED_PROMPT_MAX);
  assert.ok(r.coercions.some((c) => /READY whose words had to be clipped/.test(c)), r.coercions.join(" | "));
});

t("a floor fact is clipped to the schema's bound — a regex match is not a length guarantee", () => {
  const raw = fallbackAnalysis({ prompt: `Our growth last year was ${"9".repeat(450)}% and still climbing`, intent: {} });
  assert.ok(raw.facts.some((f) => f.kind === "metric"), "expected the metric regex to match");
  assert.doesNotThrow(() => AnalysisSchema.parse(raw), "a long metric match failed the schema");
});

t("the floor tolerates an ingest object of the wrong shape, and its output still parses", () => {
  const intent = { website: { title: 42, headings: "not a list", description: null }, blog: { excerpt: 7, headings: 3 } };
  let raw;
  assert.doesNotThrow(() => { raw = fallbackAnalysis({ prompt: "a promo for our coffee subscription", intent }); });
  assert.doesNotThrow(() => AnalysisSchema.parse(raw));
});

t("minimalAnalysis is a complete reading of the user's words that parses and that coerce leaves alone", () => {
  for (const p of ["a promo for our coffee subscription", longPrompt(REFINED_PROMPT_MAX + 900)]) {
    const ctx = { originalPrompt: p, scope: "full", now: 5 };
    const m = minimalAnalysis(ctx);
    assert.deepStrictEqual(sorted(Object.keys(m)), sorted(Object.keys(build({}).analysis)), "not the shape coerce produces");
    assert.strictEqual(m.classification, "REFINABLE");
    assert.strictEqual(m.originalPrompt, p);
    assert.strictEqual(m.refinedPrompt, clipRefinedPrompt(p));
    let parsed;
    assert.doesNotThrow(() => { parsed = AnalysisSchema.parse(m); }, "the last resort failed the schema");
    const r = coerce(parsed, ctx);
    assert.deepStrictEqual(r.coercions, [], r.coercions.join(" | "));
    assert.deepStrictEqual(reduce(r.analysis), reduce(m), "coerce changed the minimal analysis");
  }
});

t("minimalAnalysis keeps a tier-1 refusal a refusal", () => {
  const tier1 = { rule: "r", category: "c", reason: "A plain sentence a person can read." };
  const m = minimalAnalysis({ originalPrompt: "anything at all", tier1, now: 0 });
  assert.strictEqual(m.classification, "DISALLOWED");
  assert.strictEqual(m.safety.verdict, "block");
  assert.strictEqual(m.safety.reason, tier1.reason);
  assert.deepStrictEqual(m.improvements, []);
  const r = coerce(AnalysisSchema.parse(m), { originalPrompt: "anything at all", tier1, now: 0 });
  assert.strictEqual(r.analysis.classification, "DISALLOWED");
  assert.deepStrictEqual(r.analysis.safety, m.safety);
});

t("minimalAnalysis never throws, whatever it is handed", () => {
  const hostileText = { toString() { throw new Error("hostile toString"); } };
  const ctxs = [undefined, null, 42, "x", {}, { originalPrompt: Symbol("s") }, { originalPrompt: hostileText },
    { tier1: "yes" }, { now: "later" }, { originalPrompt: longPrompt(REFINED_PROMPT_MAX * 2) }];
  for (const ctx of ctxs) {
    let m;
    assert.doesNotThrow(() => { m = minimalAnalysis(ctx); }, String(typeof ctx));
    assert.doesNotThrow(() => AnalysisSchema.parse(m), "the last resort failed the schema");
  }
});

// ---------------------------------------------------------------- long storylines
// The lock is load-bearing: the script prompt is told "scene N IS beat N". A lock on the
// first 24 of 30 scenes therefore tells the script to drop six of them.
group(`long storylines — an order longer than ${BEATS_MAX} beats is released, never silently shortened`);

t(`the floor locks a storyline of exactly ${BEATS_MAX} marked scenes`, () => {
  const a = fallbackAnalysis({ prompt: storyline(BEATS_MAX), intent: {} });
  assert.strictEqual(a.narrative.orderLocked, true);
  assert.strictEqual(a.narrative.beats.length, BEATS_MAX);
  assert.strictEqual(a.classification, "STRUCTURED_STORY");
});

t(`the floor counts every marked scene, and past ${BEATS_MAX} releases the lock and stores the first ${BEATS_MAX}`, () => {
  const p = storyline(30);
  const a = fallbackAnalysis({ prompt: p, intent: {} });
  assert.strictEqual(a.narrative.orderLocked, false, "30 scenes kept an order lock on 24 of them");
  assert.strictEqual(a.narrative.source, "derived");
  assert.strictEqual(a.classification, "REFINABLE");
  assert.strictEqual(a.narrative.beats.length, BEATS_MAX, "stored beats are not capped");
  assert.ok(a.narrative.beats[0].beat.includes("number 1 ") && a.narrative.beats[BEATS_MAX - 1].beat.includes(`number ${BEATS_MAX} `),
    "the stored beats are not the first ones, in order");
  const r = coerce(AnalysisSchema.parse(a), { originalPrompt: p, now: 0 });
  assert.deepStrictEqual(r.coercions, [], r.coercions.join(" | "));
  assert.strictEqual(require("../src/services/script")._narrativeDirective({ analysis: reduce(r.analysis) }), "",
    "the script would still be ordered to film a prefix of the storyline");
});

t(`a model reply with more than ${BEATS_MAX} beats parses, and coerce releases the lock in place of a repair lap`, () => {
  // Listed in REVERSE, so a cap applied before the sort would keep the wrong 24.
  const beats = Array.from({ length: 30 }, (_, i) => ({ index: 30 - i, beat: `stall ${30 - i} opens` }));
  let parsed;
  assert.doesNotThrow(() => {
    parsed = AnalysisSchema.parse({ classification: "STRUCTURED_STORY", refinedPrompt: "x",
      narrative: { orderLocked: true, source: "user-authored", beats } });
  }, "30 beats failed the schema, so coerce's release rule is unreachable from the model");
  const r = coerce(parsed, { originalPrompt: "x", now: 0 });
  assert.strictEqual(r.analysis.narrative.orderLocked, false);
  assert.strictEqual(r.analysis.narrative.source, "derived");
  assert.strictEqual(r.analysis.classification, "REFINABLE");
  assert.deepStrictEqual(r.analysis.narrative.beats.map((b) => b.beat),
    Array.from({ length: BEATS_MAX }, (_, i) => `stall ${i + 1} opens`), "the stored beats are not the first 24 in the person's order");
  assert.deepStrictEqual(r.analysis.narrative.beats.map((b) => b.index), Array.from({ length: BEATS_MAX }, (_, i) => i + 1));
  assert.ok(r.coercions.some((c) => /more than 24/.test(c) && /lock released/.test(c)), r.coercions.join(" | "));
});

// ---------------------------------------------------------------- projections
group("projections — what is stored and what is published");

t("reduce stores exactly the normaliser's fields", () => {
  const stored = reduce(build({}).analysis);
  assert.deepStrictEqual(sorted(Object.keys(stored)), sorted(["v", "scope", "expiresAt", "override",
    "classification", "confidence", "quality", "originalPrompt", "analyzedPrompt", "refinedPrompt",
    "improvements", "narrative", "signals", "facts", "inferred", "safety"]));
});

t("forClient publishes exactly the prompt triad and the reading, nothing more", () => {
  const published = forClient(reduce(build({}).analysis));
  assert.deepStrictEqual(sorted(Object.keys(published)), sorted(["classification", "originalPrompt",
    "analyzedPrompt", "refinedPrompt", "improvements", "inferred", "orderLocked", "beatCount"]));
});

t("forClient never publishes the internal score, confidence or matcher signals", () => {
  const r = build({ quality: { score: 72 }, confidence: 0.9, signals: { vibes: ["premium"] } });
  const c = forClient(reduce(r.analysis));
  assert.strictEqual(c.quality, undefined, "quality reached the client");
  assert.strictEqual(c.confidence, undefined, "confidence reached the client");
  assert.strictEqual(c.signals, undefined, "signals reached the client");
  assert.strictEqual(c.facts, undefined, "facts reached the client");
});

t("forClient DOES publish the prompt triad — the whole point of the transport", () => {
  const r = build({ analyzedPrompt: "what we understood", refinedPrompt: "the refined one" }, { originalPrompt: "mine" });
  const c = forClient(reduce(r.analysis));
  assert.strictEqual(c.originalPrompt, "mine");
  assert.strictEqual(c.analyzedPrompt, "what we understood");
  assert.strictEqual(c.refinedPrompt, "the refined one");
  assert.ok(Array.isArray(c.improvements));
});

// CHANGED with the refinedPrompt bound: the worst case used 1800 characters, the old
// cap. It now uses the real cap, and an originalPrompt of the same length — the stored
// blob carries both, and a READY reply makes them equal.
t("the stored projection stays small enough for a per-job blob", () => {
  const r = build({
    refinedPrompt: "x".repeat(REFINED_PROMPT_MAX), analyzedPrompt: "y".repeat(400),
    improvements: Array.from({ length: 5 }, () => ({ what: "w".repeat(200), why: "z".repeat(300) })),
    narrative: { orderLocked: true, source: "user-authored",
      beats: Array.from({ length: BEATS_MAX }, (_, i) => ({ index: i + 1, beat: "b".repeat(400) })) },
    facts: Array.from({ length: 20 }, () => ({ text: "f".repeat(300), kind: "fact", priority: 3, source: "prompt" })),
  }, { originalPrompt: "o".repeat(REFINED_PROMPT_MAX) });
  const bytes = Buffer.byteLength(JSON.stringify(reduce(r.analysis)), "utf8");
  assert.ok(bytes < 32768, `worst-case stored analysis is ${bytes} bytes`);
});

t("forClient and reduce tolerate null", () => {
  assert.strictEqual(forClient(null), null);
  assert.strictEqual(reduce(null), null);
});

// ---------------------------------------------------------------- script seam
group("script seam — the order lock has to survive into the script prompt");

const script = require("../src/services/script");

t("scriptFacingBrief keeps every field a downstream consumer names", () => {
  const projected = script._scriptFacingBrief({
    improvedPrompt: "p", subject: "s", audience: "a", tone: "t", goal: "g",
    keyMessages: ["k"], mustIncludeFacts: ["f"], musicMood: "m", voProfile: "v", suggestedDuration: 30,
    templateSelection: { pack: "x", rejected: 99 }, pacing: { mode: "fast", wordBudget: 40 },
  });
  for (const k of ["improvedPrompt", "subject", "audience", "tone", "goal", "keyMessages",
    "mustIncludeFacts", "musicMood", "voProfile", "suggestedDuration"]) {
    assert.ok(k in projected, `${k} was dropped from the script's view of the brief`);
  }
});

t("scriptFacingBrief drops the template/pacing internals that were leaking in as creative direction", () => {
  const projected = script._scriptFacingBrief({ improvedPrompt: "p", templateSelection: { pack: "x", rejected: 99 }, pacing: { mode: "fast" } });
  assert.strictEqual(projected.templateSelection, undefined);
  assert.strictEqual(projected.pacing, undefined);
});

t("narrativeDirective is EMPTY without a lock — the default prompt stays byte-identical", () => {
  assert.strictEqual(script._narrativeDirective(null), "");
  assert.strictEqual(script._narrativeDirective({}), "");
  assert.strictEqual(script._narrativeDirective({ analysis: { narrative: { orderLocked: false, beats: [] } } }), "");
  assert.strictEqual(script._narrativeDirective({ analysis: { narrative: { orderLocked: true, beats: [{ index: 1, beat: "one" }] } } }), "");
});

t("narrativeDirective states the order and suspends the arc rule", () => {
  const d = script._narrativeDirective({ analysis: { narrative: { orderLocked: true, source: "user-authored",
    beats: [{ index: 1, beat: "wakes up", mustShow: "bed" }, { index: 2, beat: "checks phone" }, { index: 3, beat: "orders food" }] } } });
  assert.ok(d.includes("1. wakes up"), "beat 1 missing");
  assert.ok(d.includes("3. orders food"), "beat 3 missing");
  assert.ok(d.indexOf("1. wakes up") < d.indexOf("2. checks phone"), "beats are out of order");
  assert.ok(/Do not reorder/i.test(d), "does not forbid reordering");
  assert.ok(/REPLACES the Hook/i.test(d), "does not suspend the arc rule");
  assert.ok(d.includes("must show: bed"), "mustShow dropped");
});

// ---------------------------------------------------------------- storyboard seam
// POST /api/generate runs pipeline.runJob, which has NO script stage: the storyboard is
// written straight from enrichedStoryboardPrompt(brief, prompt), and system_storyboard.md
// imposes Hook -> ... -> CTA. So on that route the lock has to reach THIS prompt or it
// reaches nothing. Loaded here, after the store redirect at the top of the file,
// because pipeline.js requires db.js.
group("storyboard seam — on /api/generate the order lock has to reach the storyboard prompt");

const pipeline = require("../src/services/pipeline");

const SB_BRIEF = {
  improvedPrompt: "A short slice-of-life film about an ordinary morning.",
  audience: "social media viewers", tone: "warm", goal: "make mornings feel easy",
  keyMessages: ["mornings can be effortless"], mustIncludeFacts: ["breakfast arrives in 20 minutes"],
};
// What enrichedStoryboardPrompt has always produced for SB_BRIEF, written out BY HAND:
// the byte-identity half of the contract is pinned against a literal, not against the
// function's own output.
const SB_PROMPT = [
  "A short slice-of-life film about an ordinary morning.",
  "",
  "Audience: social media viewers",
  "Tone: warm",
  "Goal: make mornings feel easy",
  "Key messages (weave these across the scenes):",
  "- mornings can be effortless",
  "Must include:",
  "- breakfast arrives in 20 minutes",
].join("\n");

t("_enrichedStoryboardPrompt is byte-identical without a lock of at least two beats", () => {
  const f = pipeline._enrichedStoryboardPrompt;
  assert.strictEqual(typeof f, "function", "pipeline.js does not export _enrichedStoryboardPrompt");
  const unlocked = [
    undefined,
    null,
    { narrative: { orderLocked: false, source: "derived", beats: [] } },
    { narrative: { orderLocked: false, source: "derived", beats: [{ index: 1, beat: "a" }, { index: 2, beat: "b" }] } },
    { narrative: { orderLocked: true, source: "user-authored", beats: [{ index: 1, beat: "only one" }] } },
    { narrative: { orderLocked: true, source: "user-authored", beats: "not a list" } },
  ];
  for (const analysis of unlocked) {
    const brief = analysis === undefined ? SB_BRIEF : { ...SB_BRIEF, analysis };
    assert.strictEqual(f(brief, "the raw words"), SB_PROMPT, `changed the default prompt for ${JSON.stringify(analysis)}`);
  }
});

t("_enrichedStoryboardPrompt carries a locked order: every beat, in order, with the first-scene kind rule", () => {
  const f = pipeline._enrichedStoryboardPrompt;
  const story = FIX.cases.find((c) => c.id === "excellent-storyline").prompt;
  const analysis = reduce(coerce(AnalysisSchema.parse(fallbackAnalysis({ prompt: story, intent: {} })),
    { originalPrompt: story, now: 0 }).analysis);
  assert.strictEqual(analysis.narrative.orderLocked, true, "precondition: the fixture storyline is locked");
  const beats = analysis.narrative.beats;

  const out = f({ ...SB_BRIEF, analysis }, story);
  assert.ok(out.startsWith(`${SB_PROMPT}\n\nNARRATIVE DIRECTIVE`), "the directive is not appended after the unchanged default prompt");
  let at = -1;
  beats.forEach((b, i) => {
    const line = `${i + 1}. ${b.beat}`;
    const next = out.indexOf(line);
    assert.ok(next >= 0, `beat ${i + 1} is missing: ${line}`);
    assert.ok(next > at, `beat ${i + 1} is out of order`);
    at = next;
  });
  assert.ok(out.includes('kind "hook" or "title"'), "does not reconcile beat 1 with storyboard.js's first-scene kind rule");
  assert.ok(/REPLACES the Hook/.test(out), "does not suspend the storyboard's arc rule");
  assert.ok(/no beat is dropped/.test(out) && /no beat moves/.test(out) && /never share a scene/.test(out),
    "does not forbid dropping, reordering and merging beats");
  assert.ok(out.includes(`beat ${beats.length} closes it`), "does not say the last beat closes the film");

  const withShow = f({ ...SB_BRIEF, analysis: { narrative: { orderLocked: true, source: "user-authored",
    beats: [{ index: 1, beat: "wakes up", mustShow: "bed" }, { index: 2, beat: "checks phone", mustSay: "no alarms" }] } } }, "p");
  assert.ok(withShow.includes("1. wakes up (must show: bed)") && withShow.includes("2. checks phone (must say: no alarms)"),
    "mustShow / mustSay dropped");
});

// The directive tells the storyboard model that beat 1 keeps a hook|title kind BECAUSE
// storyboard.js rejects anything else. If that validation changes, the instruction is
// stale — so the claim is checked against the validator's own message.
t("the directive's first-scene rule is the one storyboard.js validates", () => {
  const src = fs.readFileSync(path.join(SERVER_ROOT, "src", "services", "storyboard.js"), "utf8");
  assert.ok(src.includes("first scene kind must be 'title' or 'hook'"),
    "storyboard.js no longer validates the first scene's kind as title|hook — update the storyboard directive in pipeline.js");
});

// ---------------------------------------------------------------- corpus shape
const CORPUS_SIZE = 15;
group(`corpus — the ${CORPUS_SIZE} in-scope categories are well-formed input`);

t("every corpus prompt is legal input to both create routes", () => {
  for (const c of FIX.cases) {
    const n = c.prompt.trim().length;
    assert.ok(n >= 10, `${c.id} is ${n} chars — under the 10-char floor`);
    assert.ok(n <= 2000, `${c.id} is ${n} chars — over /api/generate's 2000 cap`);
  }
});

t(`all ${CORPUS_SIZE} categories are represented`, () => {
  assert.strictEqual(FIX.cases.length, CORPUS_SIZE, `expected ${CORPUS_SIZE} categories, found ${FIX.cases.length}`);
  const ids = new Set(FIX.cases.map((c) => c.id));
  assert.strictEqual(ids.size, CORPUS_SIZE, "duplicate case ids");
});

// The normaliser corpus is what the submit-time gate lets through. A case tier 1 would
// stop could never reach the analyser, so it would be testing a path that does not exist.
t("the normaliser corpus holds only in-scope requests: no case trips tier 1", () => {
  const stopped = FIX.cases.filter((c) => moderation.screen(c.prompt).tier1).map((c) => c.id);
  assert.deepStrictEqual(stopped, [], "tier-1 content in the normaliser corpus: " + stopped.join(", "));
});

// ---------------------------------------------------------------- async sections
// The deterministic-path tests await real service calls, so they and the live run
// share one async tail; the summary line prints only after both have finished.
const openrouter = require("../src/services/openrouter");

// Replace the transport with a tripwire for the duration of fn. The analyser and
// the brief both read `openrouter.chat` at call time, so the swap is seen by both.
async function withoutModel(fn) {
  const real = openrouter.chat;
  let calls = 0;
  openrouter.chat = async () => { calls++; throw new Error("a model was called on a path that must not call one"); };
  try { await fn(); } finally { openrouter.chat = real; }
  return calls;
}

// The brief tests PIN a frame pack. On "auto", generateBrief reads the recent jobs
// through db.js, which this file must never load — so if the refusal ever regressed,
// an auto run would rewrite jobs.json before failing. Pinned, a regression goes
// straight to the brief model and trips the wire instead.
const PINNED = { framePack: "longshot-cinema" };

(async () => {
  group("tier 1 — defence in depth behind the submit-time gate, with no model");

  const T1 = FIX.tier1Analysis;
  const t1Reason = moderation.screen(T1.prompt).tier1 && moderation.screen(T1.prompt).tier1.reason;

  await ta("the tier-1 fixture really is tier-1 content", async () => {
    assert.ok(t1Reason, "tier1Analysis.prompt is not stopped by tier 1");
  });

  await ta("analyzePrompt returns DISALLOWED for tier-1 content from its deterministic path", async () => {
    const { analyzePrompt } = require("../src/services/prompt_analysis");
    let res;
    const calls = await withoutModel(async () => { res = await analyzePrompt({ prompt: T1.prompt, scope: "full" }); });
    assert.strictEqual(calls, 0, "the tier-1 path called a model");
    assert.strictEqual(res.via, "moderation");
    assert.strictEqual(res.tokensIn + res.tokensOut, 0);
    assert.strictEqual(res.analysis.classification, "DISALLOWED");
    assert.strictEqual(res.analysis.safety.verdict, "block");
    assert.strictEqual(res.analysis.safety.reason, t1Reason);
    for (const w of T1.mustNotEcho) {
      assert.ok(!res.analysis.safety.reason.toLowerCase().includes(w), `the reason echoed "${w}"`);
    }
  });

  await ta("generateBrief refuses tier-1 content with the user-facing reason, before any model call", async () => {
    const { generateBrief } = require("../src/services/brief");
    let err = null;
    const calls = await withoutModel(async () => {
      try { await generateBrief({ intent: { prompt: T1.prompt, preferences: PINNED } }); } catch (e) { err = e; }
    });
    assert.ok(err, "generateBrief built a brief for tier-1 content");
    assert.strictEqual(err.message, t1Reason);
    assert.strictEqual(calls, 0, "a model was called before the refusal");
  });

  await ta("generateBrief also refuses a DISALLOWED analysis the job already carries", async () => {
    const { generateBrief } = require("../src/services/brief");
    const tier1 = { rule: "r", category: "c", reason: "A plain sentence a person can read." };
    const carried = reduce(build({}, { originalPrompt: "a carried prompt", tier1 }).analysis);
    let err = null;
    const calls = await withoutModel(async () => {
      try { await generateBrief({ intent: { prompt: "a carried prompt", analysis: carried, preferences: PINNED } }); } catch (e) { err = e; }
    });
    assert.ok(err, "a carried DISALLOWED analysis still produced a brief");
    assert.strictEqual(err.message, tier1.reason);
    assert.strictEqual(calls, 0);

    // A stored refusal with no reason still refuses, in a sentence rather than an empty string.
    const bare = Object.assign({}, carried, { safety: { verdict: "block", category: null, reason: null } });
    err = null;
    await withoutModel(async () => {
      try { await generateBrief({ intent: { prompt: "a carried prompt", analysis: bare, preferences: PINNED } }); } catch (e) { err = e; }
    });
    assert.ok(err && err.message.length > 10, "a reasonless refusal produced no usable message");
  });

  // -------------------------------------------------------------- long prompts, end to end
  // The defect these pin: a prompt longer than the old 1800-character bound — legal on
  // every create route — made analyzePrompt THROW, in all three ways a model answer can
  // go, and generateBrief threw with it. Each case scripts the transport per stage and
  // asserts the function RESOLVES with an analysis the schema accepts.
  group("long prompts end to end — analyzePrompt resolves, and generateBrief builds on it");

  const { analyzePrompt } = require("../src/services/prompt_analysis");
  const { generateBrief } = require("../src/services/brief");

  // A per-stage scripted transport that records every stage it is asked for. An
  // unscripted stage throws, so a stage this test did not expect is a failure.
  function scriptedChat(handlers) {
    const calls = [];
    const chat = async (args = {}) => {
      const stage = String(args.stage || "<none>");
      calls.push(stage);
      if (!handlers[stage]) throw new Error(`stub: stage "${stage}" is not scripted`);
      const reply = await handlers[stage](args);
      return { text: typeof reply === "string" ? reply : JSON.stringify(reply), tokensIn: 10, tokensOut: 5, costUsd: 0 };
    };
    chat.calls = calls;
    return chat;
  }
  async function withChat(chat, fn) {
    const real = openrouter.chat;
    openrouter.chat = chat;
    try { await fn(); } finally { openrouter.chat = real; }
  }

  const BRIEF_REPLY = {
    improvedPrompt: "A warm film about a neighbourhood bakery that opens before dawn to bake sourdough for its street.",
    subject: "sourdough bakery at dawn",
    audience: "people who live nearby",
    tone: "warm, unhurried",
    goal: "bring neighbours in for a morning loaf",
    keyMessages: ["The bakery opens before dawn", "Sourdough for the whole street"],
    mustIncludeFacts: [],
    brandColors: [],
    suggestedFramePack: PINNED.framePack,
    suggestedDuration: 30,
    musicMood: "gentle acoustic morning",
    voProfile: "warm, friendly narrator",
  };

  const MODES = [
    { label: "the model is down", reply: () => { throw new Error("provider unavailable"); }, via: "fallback", analysisCalls: 1 },
    { label: "invalid JSON twice", reply: () => "this is not json {", via: "fallback", analysisCalls: 2 },
    { label: "a correct READY echo", reply: (p) => ({ classification: "READY", confidence: 0.9, refinedPrompt: p }), via: "model (attempt 1)", analysisCalls: 1 },
  ];

  for (const n of [3000, REFINED_PROMPT_MAX]) {
    const p = longPrompt(n);
    for (const mode of MODES) {
      await ta(`${n} chars, ${mode.label}: analyzePrompt resolves with a valid analysis of the user's words`, async () => {
        const chat = scriptedChat({ analysis: () => mode.reply(p) });
        let res, err = null;
        await withChat(chat, async () => { try { res = await analyzePrompt({ prompt: p, scope: "full", now: 0 }); } catch (e) { err = e; } });
        assert.strictEqual(err, null, `analyzePrompt threw: ${err && String(err.message).slice(0, 160)}`);
        assert.strictEqual(res.via, mode.via);
        assert.strictEqual(chat.calls.length, mode.analysisCalls, `stages called: ${chat.calls.join(", ")}`);
        assert.doesNotThrow(() => AnalysisSchema.parse(res.analysis), "resolved with an analysis the schema rejects");
        assert.ok(MODEL_CLASSIFICATIONS.includes(res.analysis.classification), `-> ${res.analysis.classification}`);
        assert.strictEqual(res.analysis.originalPrompt, p);
        assert.strictEqual(res.analysis.refinedPrompt, p, "the user's words did not survive");
        if (mode.via.startsWith("model")) assert.strictEqual(res.analysis.classification, "READY", "a correct READY echo was not kept");
      });

      await ta(`${n} chars, ${mode.label}: generateBrief does not throw and carries the analysis`, async () => {
        const chat = scriptedChat({ analysis: () => mode.reply(p), brief: () => BRIEF_REPLY });
        let out, err = null;
        await withChat(chat, async () => {
          try { out = await generateBrief({ intent: { prompt: p, preferences: PINNED } }); } catch (e) { err = e; }
        });
        assert.strictEqual(err, null, `generateBrief threw: ${err && String(err.message).slice(0, 160)}`);
        assert.ok(out && out.brief && out.brief.analysis, "the brief carries no analysis");
        assert.strictEqual(out.brief.analysis.originalPrompt, p);
        assert.deepStrictEqual([...new Set(chat.calls)], ["analysis", "brief"], `stages called: ${chat.calls.join(", ")}`);
      });
    }
  }

  await ta("tier-1 content longer than the old bound still refuses, instead of throwing", async () => {
    const p = `${T1.prompt}. ${longPrompt(REFINED_PROMPT_MAX + 1000)}`;
    assert.ok(moderation.screen(p).tier1, "precondition: the long prompt still trips tier 1");
    let res, err = null;
    const calls = await withoutModel(async () => { try { res = await analyzePrompt({ prompt: p, scope: "full" }); } catch (e) { err = e; } });
    assert.strictEqual(err, null, `analyzePrompt threw: ${err && String(err.message).slice(0, 160)}`);
    assert.strictEqual(calls, 0);
    assert.strictEqual(res.via, "moderation");
    assert.strictEqual(res.analysis.classification, "DISALLOWED");
    assert.strictEqual(res.analysis.safety.reason, t1Reason);
    assert.ok(res.analysis.refinedPrompt.length <= REFINED_PROMPT_MAX);
  });

  await ta("analyzePrompt never throws, whatever it is handed — and the last resort is reachable", async () => {
    const hostileText = { toString() { throw new Error("hostile toString"); } };
    const cyclic = {}; cyclic.self = cyclic;
    const trap = new Proxy({}, { get() { throw new Error("hostile getter"); } });
    const cases = [
      { label: "no options", opts: undefined },
      { label: "null options", opts: null },
      { label: "a Symbol prompt", opts: { prompt: Symbol("p") } },
      { label: "a prompt whose toString throws", opts: { prompt: hostileText } },
      { label: "website lists that are not lists", opts: { prompt: "a promo for our coffee subscription", intent: { website: { headings: 42, sitePages: 7 } } } },
      { label: "preferences JSON cannot serialise", opts: { prompt: "a promo for our coffee subscription", preferences: cyclic } },
      // Every read of the intent throws: the model message cannot be built and the floor
      // cannot read the ingest, so this lands on layer 3 — the minimal analysis.
      { label: "an intent whose every read throws", opts: { prompt: "a promo for our coffee subscription", intent: trap }, via: "fallback:minimal" },
      { label: "options whose every read throws", opts: trap },
    ];
    for (const c of cases) {
      let res, err = null;
      await withoutModel(async () => { try { res = await analyzePrompt(c.opts); } catch (e) { err = e; } });
      assert.strictEqual(err, null, `${c.label}: threw ${err && String(err.message).slice(0, 120)}`);
      assert.ok(res && res.analysis, `${c.label}: no analysis`);
      assert.doesNotThrow(() => AnalysisSchema.parse(res.analysis), `${c.label}: resolved with an invalid analysis`);
      assert.ok(MODEL_CLASSIFICATIONS.includes(res.analysis.classification), `${c.label}: -> ${res.analysis.classification}`);
      if (c.via) assert.strictEqual(res.via, c.via, c.label);
    }
    // A tier-1 match is decided before the intent is read, so hostile surroundings
    // cannot turn it into a film.
    let blocked;
    await withoutModel(async () => { blocked = await analyzePrompt({ prompt: T1.prompt, intent: trap, preferences: trap }); });
    assert.strictEqual(blocked.analysis.classification, "DISALLOWED");
  });

  await ta(`a model reading of a 30-scene storyline releases the lock on the FIRST reply — no repair lap, no prefix lock`, async () => {
    const p = storyline(30);
    const reply = {
      classification: "STRUCTURED_STORY", confidence: 0.9, refinedPrompt: p,
      narrative: { orderLocked: true, source: "user-authored",
        beats: Array.from({ length: 30 }, (_, i) => ({ index: i + 1, beat: `stall ${i + 1} opens` })) },
    };
    const chat = scriptedChat({ analysis: () => reply });
    let res;
    await withChat(chat, async () => { res = await analyzePrompt({ prompt: p, now: 0 }); });
    assert.strictEqual(res.via, "model (attempt 1)", `a faithful reading cost a repair lap and landed on ${res.via}`);
    assert.strictEqual(chat.calls.length, 1);
    assert.strictEqual(res.analysis.narrative.orderLocked, false, "the order lock survived on a prefix of the storyline");
    assert.strictEqual(res.analysis.narrative.source, "derived");
    assert.strictEqual(res.analysis.narrative.beats.length, BEATS_MAX);
    assert.strictEqual(res.analysis.classification, "REFINABLE");
  });

  // -------------------------------------------------------------- isolation, proven
  // After every offline test, and after db.js's debounced persist (100 ms) would have
  // fired had anything scheduled one. The live run below calls only analyzePrompt, which
  // never loads db.js.
  group("isolation — the real job store was never touched");

  await ta("db.js was loaded (by pipeline.js) against the temp store, and server/jobs.json is byte-identical", async () => {
    await new Promise((r) => setTimeout(r, 300));
    assert.ok(Object.prototype.hasOwnProperty.call(require.cache, path.join(SERVER_ROOT, "src", "db.js")),
      "db.js was never loaded, so this run did not exercise the redirect it claims to prove");
    assert.strictEqual(require("../src/config").paths.dbFile, TMP_PATHS.dbFile, "config.paths.dbFile is not the temp store");
    assert.strictEqual(sha256(REAL_DB), HASH_BEFORE, "server/jobs.json changed during the run");
  });

  // -------------------------------------------------------------- optional live
  if (process.argv.includes("--llm")) {
    group("LIVE — real model calls (costs money)");
    const { analyzePrompt } = require("../src/services/prompt_analysis");
    let ran = 0;
    for (const c of FIX.cases) {
      ran++;
      const { analysis, via } = await analyzePrompt({ prompt: c.prompt, scope: "prompt-only" });
      const e = c.expect || {};
      const label = `${c.id} -> ${analysis.classification} (${via}, score ${analysis.quality.score})`;
      let ok = true, why = "";
      // A live pass that never reached the model proves nothing about the model. A prefix
      // match, so the minimal last resort ("fallback:minimal") counts as not reaching it.
      if (String(via).startsWith("fallback")) { ok = false; why = `the model was not exercised (${via})`; }
      // Every case is in scope: a normaliser has no refusal to give.
      if (!MODEL_CLASSIFICATIONS.includes(analysis.classification)) { ok = false; why = `an in-scope request came back ${analysis.classification}`; }
      if (e.classification && analysis.classification !== e.classification) { ok = false; why = `expected ${e.classification}`; }
      if (e.orderLocked && !analysis.narrative.orderLocked) { ok = false; why = "order lock lost"; }
      if (e.minBeats && analysis.narrative.beats.length < e.minBeats) { ok = false; why = `only ${analysis.narrative.beats.length} beats`; }
      if (e.beatsKeepOrder) {
        // Each stem's FIRST beat must not come before the previous stem's first beat.
        let last = 0;
        for (const stem of e.beatsKeepOrder) {
          const at = analysis.narrative.beats.findIndex((b) => String(b.beat || "").toLowerCase().includes(stem));
          if (at < 0) { ok = false; why = `beat content "${stem}" lost`; break; }
          if (at < last) { ok = false; why = `beat order changed at "${stem}"`; break; }
          last = at;
        }
      }
      if (e.intentPreserved) {
        const hay = (analysis.refinedPrompt + " " + analysis.analyzedPrompt).toLowerCase();
        for (const w of e.intentPreserved) if (!hay.includes(w)) { ok = false; why = `intent word "${w}" lost`; }
      }
      if (ok) { passed++; console.log("  ok    " + label); }
      else { process.exitCode = 1; console.error("  FAIL  " + label + "\n        " + why); }
    }
    // NO SILENT CAPS. A run cut short by a timeout or a kill used to print nine
    // green lines and exit 0, which reads as "the corpus passed".
    if (ran !== FIX.cases.length) {
      process.exitCode = 1;
      console.error(`  FAIL  live run covered only ${ran}/${FIX.cases.length} cases`);
    }
    console.log(`\n${passed} assertion group(s) passed (${ran}/${FIX.cases.length} live cases)`);
  } else {
    console.log(`\n${passed} assertion group(s) passed (offline; pass --llm to also exercise the model)`);
  }
})().catch((e) => { console.error("test run failed: " + (e && e.stack || e)); process.exitCode = 1; });
