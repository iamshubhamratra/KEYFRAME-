#!/usr/bin/env node
// Route-level guards for the SCOPE GATE — POST /api/projects and POST /api/generate,
// mounted the way server.js mounts them and driven over real HTTP.
//
// prompt_scope.test.cjs pins the gate as a FUNCTION. What it cannot see is the part that
// costs money when it is wrong: whether the ROUTES obey the decision. A gate that answers
// OUT_OF_SCOPE correctly and a route that inserts the job anyway is exactly the failure
// the product owner rejected — a coding request that becomes a row, a queue slot, a brief,
// a script and a render. So every assertion here is about side effects, counted from
// OUTSIDE the handler:
//   - the HTTP status and the client projection of the decision;
//   - the job store's row count, before and after each request;
//   - the enqueue spies — the pipeline's only way in;
//   - every model stage the process asked for, recorded by a stub standing in for
//     openrouter.chat: a refused request may reach "scope" and nothing else, and an
//     accepted one reaches only "scope" at route time;
//   - the uploads directory, for a refused multipart request;
//   - the stored prompt after a clarification — the person's subject must survive the
//     answer, and an answer that names nothing must not become a job;
//   - for each route, that a refusal's "how to create a video" steps describe THAT route,
//     and that every limit and field /api/generate's steps name is one the route enforces;
//   - and, once a request IS accepted, that normalisation happens inside the pipeline
//     (generateBrief -> "analysis" -> "brief") with no client step in between — the
//     manual Refine click this replaced — including a user-written storyline's order lock.
//
// Both routes are driven over the SAME representative matrix of fixture cases.
//
// ISOLATION, AND WHY IT IS ORDERED THE WAY IT IS. db.js loads its store at require time
// and REWRITES it when boot recovery finds orphaned jobs; multer writes uploads before any
// handler runs; the create route stages user images into jobs/<id>/. Pointed at the real
// server/jobs.json, merely requiring the routes could rewrite a developer's job history.
// So, before db.js or a route is required:
//   1. server/jobs.json is hashed, and hashed again at the end — the run fails if it moved;
//   2. global fetch becomes a tripwire, so a provider, stock library or TTS call that
//      slipped past the model stub fails loudly instead of billing;
//   3. config is loaded and its paths are redirected into a fresh temp dir. config.js
//      freezes only its TOP level, so config.paths and config.server are ordinary objects
//      and no config.js change is needed — and a hard guard aborts the run, before db.js
//      can open anything, if that ever stops being true;
//   4. openrouter.chat is replaced on the cached module object. prompt_scope, prompt_analysis
//      and brief all read `openrouter.chat` at call time, so every one of them reaches the
//      recorder without being re-required.
//
// OFFLINE: no network, no provider, no dev server. It listens on an ephemeral port on
// 127.0.0.1 and never talks to :8080 or :5173. The temp store is removed at the end.
//
//   node scripts/scope_routes.test.cjs
//   KEEP_TMP=1 node scripts/scope_routes.test.cjs     keep the temp store for inspection

const assert = require("node:assert");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { once } = require("node:events");

const SERVER_ROOT = path.resolve(__dirname, "..");
const REAL_DB = path.join(SERVER_ROOT, "jobs.json");

// ---------------------------------------------------------------- 1. the store we must not touch

function sha256(file) {
  try { return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"); }
  catch (e) { return e && e.code === "ENOENT" ? "<absent>" : `<unreadable: ${e && e.code}>`; }
}
const HASH_BEFORE = sha256(REAL_DB);

// ---------------------------------------------------------------- 2. no network

// Installed before any server module loads, so nothing can have captured the real one.
// The test's own requests go through REAL_FETCH directly; everything else is refused and
// counted. Refusing is not enough on its own — the gate fails OPEN, so a thrown transport
// becomes SUPPORTED — which is why the ledger at the end asserts the count is zero.
const REAL_FETCH = globalThis.fetch;
const outbound = [];
globalThis.fetch = async function fetchTripwire(input) {
  const url = typeof input === "string" ? input : (input && input.url) || String(input);
  outbound.push(String(url).slice(0, 160));
  throw new Error(`tripwire: outbound fetch during an offline route test (${String(url).slice(0, 80)})`);
};

// ---------------------------------------------------------------- 3. the temp store

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "keyframe-scope-routes-"));
const TMP_PATHS = {
  dbFile: path.join(TMP, "jobs.json"),
  jobsDir: path.join(TMP, "jobs"),
  uploadsDir: path.join(TMP, "uploads"),
  videosDir: path.join(TMP, "videos"),
};
// multer's diskStorage takes a destination FUNCTION here, and with a function multer does
// not create the directory — so it has to exist before the first multipart request.
for (const d of [TMP_PATHS.jobsDir, TMP_PATHS.uploadsDir, TMP_PATHS.videosDir]) fs.mkdirSync(d, { recursive: true });

function removeTmp() {
  if (process.env.KEEP_TMP) return;
  // Only ever the directory this run created.
  if (path.basename(TMP).startsWith("keyframe-scope-routes-")) {
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* the OS temp janitor collects it */ }
  }
}
// Also on EXIT, not only in the run's finally: a module that throws while loading, or any
// process.exit() before the run starts, would otherwise leave the temp store behind. rmSync
// is synchronous, which is the only kind of work an 'exit' listener gets to finish.
process.on("exit", removeTmp);

// A redirect that did not take must stop the run BEFORE db.js is required — a failed
// assertion that lets execution continue would open the real store.
function abort(why) {
  console.error(`ABORT  ${why}`);
  removeTmp();
  process.exit(1);
}

const isLoaded = (rel) => Object.prototype.hasOwnProperty.call(require.cache, path.join(SERVER_ROOT, rel));

let config;
try { config = require("../src/config"); } catch (e) { abort(`config did not load: ${e.message}`); }
for (const rel of ["src/db.js", "src/routes/projects.js", "src/routes/generate.js"]) {
  if (isLoaded(rel)) abort(`${rel} was loaded by config.js, before the store could be redirected`);
}
const ORIGINAL_PATHS = { ...config.paths };
try { Object.assign(config.paths, TMP_PATHS); }
catch (e) { abort(`config.paths cannot be redirected in memory (${e.message}) — refusing to open the real store`); }
for (const [k, v] of Object.entries(TMP_PATHS)) {
  if (config.paths[k] !== v) abort(`config.paths.${k} did not take the temp path — refusing to open the real store`);
}
// The create routers build their rate limiter from this value at buildRouter() time, and
// this run sends more creates from 127.0.0.1 than a production hour allows. The daily cap
// is lifted for the same reason: a store that starts empty makes it irrelevant, but a
// deployment with a tiny cap must not turn this into a 429 test.
config.server.rateLimitPerHourPerIp = 1e6;
config.server.dailyJobCap = 1e6;
if (config.server.rateLimitPerHourPerIp !== 1e6 || config.server.dailyJobCap !== 1e6) {
  abort("config.server is frozen — the rate limiter would turn the matrix into 429s");
}

// ---------------------------------------------------------------- 4. the model

const OPENROUTER_ID = require.resolve("../src/services/openrouter");
require(OPENROUTER_ID);
const REAL_CHAT = require.cache[OPENROUTER_ID].exports.chat;

const STUB_USAGE = { tokensIn: 100, tokensOut: 20, costUsd: 0 };
const llm = { calls: [], handlers: {}, unscripted: [] };

// Every stage sends a JSON user message; a repair lap appends a sentence after it.
function readPayload(user) {
  const s = String(user || "");
  const cut = s.search(/\n\nYour previous reply/);
  try { return JSON.parse(cut >= 0 ? s.slice(0, cut) : s); } catch { return null; }
}

// Records the stage FIRST, before deciding anything — a call that fails is still a call
// the process tried to pay for. A stage with no handler is refused and noted: nothing past
// the gate is scripted during the route phase, so any "analysis", "brief", "script", asset
// or TTS stage reached from a create request shows up here as well as in the per-request
// stage list.
async function recordingChat(args = {}) {
  const rec = { stage: String(args.stage || "<none>"), payload: readPayload(args.user) };
  llm.calls.push(rec);
  const handler = llm.handlers[rec.stage];
  if (!handler) {
    llm.unscripted.push(rec.stage);
    throw new Error(`stub: stage "${rec.stage}" is not scripted`);
  }
  const reply = await handler(rec);
  if (reply instanceof Error) throw reply;
  return { text: typeof reply === "string" ? reply : JSON.stringify(reply), ...STUB_USAGE };
}
require.cache[OPENROUTER_ID].exports.chat = recordingChat;

// ---------------------------------------------------------------- server modules (isolated from here on)

const express = require("express");
const db = require("../src/db");
const projectsRoutes = require("../src/routes/projects");
const generateRoutes = require("../src/routes/generate");
const { generateBrief } = require("../src/services/brief");
const promptScope = require("../src/services/prompt_scope");
const capabilities = require("../src/services/keyframe_capabilities");
const moderation = require("../src/services/prompt_moderation");
const frameRegistry = require("../src/services/frame_registry");
const logger = require("../src/services/logger");

const FIX = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "prompt_scope_cases.json"), "utf8"));
const CASES = new Map(FIX.cases.map((c) => [c.id, c]));
function fixture(id) {
  const c = CASES.get(id);
  if (!c) throw new Error(`fixture case "${id}" is missing from prompt_scope_cases.json`);
  return c;
}

let passed = 0;
let failed = 0;
async function ta(name, fn) {
  try { await fn(); passed++; console.log("  ok    " + name); }
  catch (e) {
    failed++; process.exitCode = 1;
    console.error("  FAIL  " + name + "\n        " + String(e && e.message).split("\n").join("\n        "));
  }
}
function group(title) { console.log("\n" + title); }

// ---------------------------------------------------------------- scripted model replies

const typeLabel = (key) => (capabilities.catalog().videoTypes.find((t) => t.key === key) || {}).label || null;

const supportedReply = (o) => ({ status: "SUPPORTED", confidence: 0.92, clarificationQuestion: null, unsupportedParts: [], ...o });
const refusalReply = (o) => ({ status: "OUT_OF_SCOPE", confidence: 0.95, videoIntent: null, videoType: null, clarificationQuestion: null, unsupportedParts: [], ...o });
const questionReply = (o) => ({ status: "NEEDS_CLARIFICATION", confidence: 0.8, requestedDeliverable: "unclear", videoIntent: null, videoType: null, unsupportedParts: [], ...o });

// What a well-behaved scope model answers for each fixture prompt. This file does not
// measure the model — prompt_scope.test.cjs --llm does — it measures what the ROUTES do
// with each kind of answer, so each reply agrees with the fixture's expectation (asserted
// per case, so a fixture edit cannot silently desynchronise the two).
const REPLIES = {
  "saas-explainer": supportedReply({
    requestedDeliverable: "a 30-second promotional video for a SaaS product",
    videoIntent: "A 30-second promo showing how a SaaS product saves businesses time.",
    videoType: typeLabel("saas"),
    reason: "You want a promotional video for your software, which KEYFRAME can make.",
  }),
  "storyline-community-garden": supportedReply({
    requestedDeliverable: "a five-scene storytelling video",
    videoIntent: "A five-scene story of neighbours bringing an overgrown community garden back to life.",
    videoType: typeLabel("storytelling"),
    reason: "You wrote a scene-by-scene story for a video, which KEYFRAME can make in your order.",
  }),
  "poorly-written-car-wash": supportedReply({
    requestedDeliverable: "a promotional video for a car wash",
    videoIntent: "A promo for a car wash offering cheap interior and exterior cleaning, open on Sundays.",
    videoType: typeLabel("marketing"),
    reason: "You want a promo video for your car wash, which KEYFRAME can make.",
  }),
  "multi-objective-newsletter": supportedReply({
    requestedDeliverable: "a 60-second explainer video and an email newsletter",
    videoIntent: "A 60-second explainer for a meal-kit delivery service.",
    videoType: typeLabel("product-demo"),
    reason: "You want an explainer video for your meal-kit service, which KEYFRAME can make.",
    unsupportedParts: ["write the email newsletter announcing it to subscribers"],
  }),
  "coding-python-backend": refusalReply({
    requestedDeliverable: "backend source code",
    reason: "You asked for a Python backend for an online store, which is software rather than a video.",
  }),
  "essay-blog-post": refusalReply({
    requestedDeliverable: "a 1,500-word blog post",
    reason: "You asked for a written blog post, which is a text document rather than a video.",
  }),
  "question-live-weather": refusalReply({
    requestedDeliverable: "a weather forecast",
    reason: "You asked for tomorrow's weather in Mumbai, which is live information rather than a video.",
  }),
  "technical-database-migration": refusalReply({
    requestedDeliverable: "a database migration",
    reason: "You asked for a MySQL-to-PostgreSQL migration, which is a technical task rather than a video.",
  }),
  "technical-background-removal": refusalReply({
    requestedDeliverable: "edited transparent PNG files",
    reason: "You asked for background removal on product photos, which is image editing rather than a video.",
  }),
  "edit-own-wedding-footage": refusalReply({
    requestedDeliverable: "an edited highlight film from your own footage",
    reason: "You asked to cut and colour-grade footage you filmed, which KEYFRAME doesn't do.",
  }),
  "talking-avatar-selfie": refusalReply({
    requestedDeliverable: "a lip-synced talking avatar",
    reason: "You asked for a talking avatar of yourself lip-syncing a recording, which KEYFRAME doesn't make.",
  }),
  "url-plus-coding": refusalReply({
    requestedDeliverable: "React and Tailwind source code",
    reason: "You asked for code to clone a website's homepage, which is software rather than a video.",
  }),
};

// prompt as the gate sends it to the model -> { reply, onCall }
const SCRIPT = new Map();
function script(prompt, reply) {
  if (SCRIPT.has(prompt)) throw new Error(`two scripted replies for one prompt: ${prompt.slice(0, 60)}`);
  SCRIPT.set(prompt, { reply, onCall: null });
}

llm.handlers.scope = (rec) => {
  const prompt = rec.payload && rec.payload.prompt;
  const entry = SCRIPT.get(prompt);
  if (!entry) {
    llm.unscripted.push(`scope for ${JSON.stringify(String(prompt).slice(0, 60))}`);
    return new Error("stub: no scope reply scripted for this prompt");
  }
  if (entry.onCall) entry.onCall(rec);
  return entry.reply;
};

// ---------------------------------------------------------------- scripted normaliser + brief

const REFINED = "A 30-second promotional video for a SaaS product that saves businesses time: open on a small team "
  + "buried in manual admin, show the product automating the busywork in three quick beats, and close on the hours "
  + "won back with a clear call to start a free trial.";

function analysisReply() {
  return {
    classification: "REFINABLE",
    confidence: 0.84,
    quality: { score: 58, missing: ["audience", "brand-info"] },
    analyzedPrompt: "A short promo for a SaaS product whose main benefit is saving businesses time.",
    refinedPrompt: REFINED,
    improvements: [{ what: "Gave the promo a before-and-after arc", why: "A time-saving claim lands when the viewer first sees the time being lost." }],
    narrative: { orderLocked: false, source: "derived", beats: [] },
    signals: { contentTypes: ["saas", "marketing"], industries: [], vibes: [], tones: [], visualStyles: [], typographyStyles: [], animationStyles: [], category: "saas" },
    facts: [{ text: "Saves businesses time", kind: "callout", priority: 4, source: "prompt" }],
    inferred: [{ field: "audience", value: "small-business owners", why: "The prompt names businesses as the beneficiary." }],
    safety: { verdict: "allow", category: null, reason: null },
  };
}

// Echoes the first template the ranking shortlisted, as a model that read the list would.
function briefReply(payload) {
  const first = payload && Array.isArray(payload.candidateFramePacks) ? payload.candidateFramePacks[0] : null;
  return {
    improvedPrompt: REFINED,
    subject: "small business team using a software dashboard",
    audience: "Owners and operations leads at small and mid-sized businesses",
    tone: "confident, clear, friendly",
    goal: "Get viewers to start a free trial",
    keyMessages: ["Manual admin eats hours every week", "The product automates the busywork", "Win back time for the work that matters"],
    mustIncludeFacts: [],
    brandColors: [],
    suggestedFramePack: (first && first.name) || frameRegistry.listPacks()[0] || "auto",
    suggestedDuration: 30,
    musicMood: "upbeat modern corporate",
    voProfile: "warm, confident narrator",
  };
}

// ---------------------------------------------------------------- HTTP harness

const spies = { intake: [], production: [], generate: [] };
const routeErrors = [];
// `http` counts every status the harness received, independently of the assertion helpers,
// so the ledger can prove each 202 and each 422 went through the full check.
const state = { accepted: [], refused: 0, http: {}, projectIds: {}, question: null, mashQuestion: null };

// A 1x1 PNG — enough for multer's MIME filter; a refused request never probes it.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAMAASsJTYQAAAAASUVORK5CYII=", "base64");

// Keeps the run readable, and lets each request's decision log line be checked. errors
// stay on the real console so a server-side failure is never hidden.
async function quietly(fn) {
  const lines = [];
  const saved = { log: console.log, warn: console.warn, info: console.info };
  const sink = (...a) => { lines.push(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ")); };
  console.log = sink; console.warn = sink; console.info = sink;
  try { return { value: await fn(), lines }; } finally { Object.assign(console, saved); }
}

let BASE = "";

// One request, with every side effect it could have had counted around it. Requests run
// strictly one at a time, so a slice of each ledger is exactly this request's share.
async function send(route, { json, form } = {}) {
  const before = {
    calls: llm.calls.length, rows: db.countJobsSince(0),
    intake: spies.intake.length, production: spies.production.length, generate: spies.generate.length,
  };
  const init = form
    ? { method: "POST", body: form }
    : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(json) };
  const { value: res, lines } = await quietly(async () => {
    const r = await REAL_FETCH(BASE + route, init);
    return { status: r.status, text: await r.text() };
  });
  state.http[res.status] = (state.http[res.status] || 0) + 1;
  let body;
  try { body = JSON.parse(res.text); } catch { body = res.text; }
  const calls = llm.calls.slice(before.calls);
  return {
    status: res.status, body, lines, calls,
    stages: calls.map((c) => c.stage),
    rowDelta: db.countJobsSince(0) - before.rows,
    intake: spies.intake.slice(before.intake),
    production: spies.production.slice(before.production),
    generated: spies.generate.slice(before.generate),
  };
}

const show = (r) => `HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 240)}`;
const CLIENT_KEYS = Object.keys(promptScope.forClient({})).sort();
const REDUCED_KEYS = Object.keys(promptScope.reduce({})).sort();
// Which "how to create a video" steps each route's refusals must carry.
const SURFACE_OF = { projects: "create-screen", generate: "api-generate" };
const SUBJECTLESS_REASON = "Your answer still doesn't say what the video should be about.";

// A realistic prompt of EXACTLY n characters, for the length boundaries. The routes trim, so
// the last character is never whitespace.
function promptOfLength(n, opening) {
  const lines = [
    "Open on a cluttered kitchen-table office and a stiff back at the end of a long day.",
    "Introduce the desk rising smoothly at the press of a button, with a soft click as it locks.",
    "Show the three height presets, the wireless charging pad and the gentle posture nudge in the app.",
    "Cut to a stat card that reads 'Stand two hours more per day' over warm oak and off-white.",
    "Add a short quote from Priya, a freelance illustrator, about finishing her work without the ache.",
    "Close on the logo and 'Pre-order now: ships in March, twenty percent off for early backers'.",
  ];
  let s = opening;
  for (let i = 0; s.length < n; i++) s += ` ${lines[i % lines.length]}`;
  s = s.slice(0, n);
  if (/\s$/.test(s)) s = `${s.slice(0, n - 1)}.`;
  assert.strictEqual(s.length, n, `promptOfLength built ${s.length}, not ${n}`);
  assert.strictEqual(s.trim(), s, "promptOfLength left whitespace at an edge");
  return s;
}

// logDecision is one line per decision; whether it is visible depends on LOG_LEVEL (read
// by the logger at load, possibly from server/.env), so the check follows the level.
function assertDecisionLogged(r, status, route, where) {
  const level = logger.level();
  const visible = status === "SUPPORTED" ? ["debug", "info"].includes(level) : ["debug", "info", "warn"].includes(level);
  if (!visible) return;
  const hits = r.lines.filter((l) => /\bscope (SUPPORTED|NEEDS_CLARIFICATION|OUT_OF_SCOPE|DISALLOWED)\b/.test(l));
  assert.strictEqual(hits.length, 1, `${where}: expected exactly one scope decision log line, saw ${hits.length}`);
  assert.ok(hits[0].includes(`scope ${status}`) && hits[0].includes(`"route":"${route}"`), `${where}: decision log line: ${hits[0].slice(0, 200)}`);
}

// A refusal of any kind: the right 422, the client projection, and NOTHING else happened.
function assertRefused(r, { route, expected, modelCalled, reply, where }) {
  assert.strictEqual(r.status, 422, `${where}: ${show(r)}`);
  assert.ok(r.body && typeof r.body === "object", `${where}: no JSON body`);
  assert.deepStrictEqual(Object.keys(r.body).sort(), ["error", "scope"], `${where}: 422 body keys`);
  const s = r.body.scope;
  assert.strictEqual(s.status, expected, `${where}: scope.status ${s.status}`);
  assert.deepStrictEqual(Object.keys(s).sort(), CLIENT_KEYS, `${where}: the 422 scope is not the forClient projection`);
  for (const k of ["usage", "coercions", "via", "ms", "v"]) assert.ok(!(k in s), `${where}: ${k} reached the client`);
  assert.strictEqual(s.isSupported, false, `${where}: isSupported`);
  assert.ok(typeof s.userMessage === "string" && s.userMessage.trim(), `${where}: empty userMessage`);
  assert.strictEqual(r.body.error, s.userMessage, `${where}: body.error is not the scope's userMessage`);
  assert.strictEqual(s.guidance != null, expected === "OUT_OF_SCOPE", `${where}: guidance must exist exactly when OUT_OF_SCOPE (status ${expected}, guidance ${JSON.stringify(s.guidance)})`);

  if (expected === "OUT_OF_SCOPE") {
    assert.strictEqual(s.videoIntent, null, `${where}: a refusal carried a rewritten film`);
    assert.strictEqual(s.videoType, null, `${where}: a refusal carried a video type`);
    for (const k of ["headline", "reason", "framing"]) assert.ok(typeof s.guidance[k] === "string" && s.guidance[k], `${where}: guidance.${k}`);
    assert.ok(s.guidance.canCreate.length > 0 && s.guidance.steps.length > 0, `${where}: guidance lists nothing to make or no steps`);
    assert.strictEqual(s.guidance.reason, reply.reason, `${where}: guidance does not lead with the gate's reason`);
    // Generated from the live capability catalog — the same call, the same numbers — and
    // written for THIS endpoint. /api/generate has no link or upload fields, no languages
    // and no script review; its refusals used to carry the create screen's steps anyway.
    const surface = SURFACE_OF[route];
    assert.ok(surface, `${where}: no surface for route ${route}`);
    assert.deepStrictEqual(s.guidance, capabilities.outOfScopeGuidance({ reason: reply.reason, surface }), `${where}: guidance is not the catalog's ${surface} guidance`);
    // Checked directly too, not only through the catalog call above: a catalog that ignored
    // `surface` would compute the same wrong steps on both sides of that comparison.
    if (route === "generate") {
      assert.ok(!/website link|upload a reference video|languages|Autopilot/.test(s.guidance.steps.join("\n")),
        `${where}: /api/generate's refusal carries the create screen's steps: ${s.guidance.steps.join(" | ").slice(0, 200)}`);
    }
    assert.strictEqual(s.userMessage, capabilities.guidanceText(s.guidance), `${where}: userMessage is not the rendered guidance`);
  }
  if (expected === "NEEDS_CLARIFICATION") {
    assert.ok(typeof s.clarificationQuestion === "string" && s.clarificationQuestion.trim(), `${where}: no question`);
    assert.ok(s.userMessage.includes(s.clarificationQuestion), `${where}: the question is not in the message`);
    assert.strictEqual(s.videoIntent, null, `${where}: a question carried a film`);
  }
  if (expected === "DISALLOWED") {
    assert.strictEqual(s.clarificationQuestion, null, `${where}: a disallowed request was asked a question`);
    assert.strictEqual(s.videoIntent, null, `${where}: a disallowed request carried a film`);
  }

  assert.strictEqual(r.rowDelta, 0, `${where}: a refused request created ${r.rowDelta} row(s)`);
  assert.deepStrictEqual(r.intake, [], `${where}: enqueueIntake was called for a refused request`);
  assert.deepStrictEqual(r.production, [], `${where}: enqueueProduction was called for a refused request`);
  assert.deepStrictEqual(r.generated, [], `${where}: the generate queue was called for a refused request`);
  const wantStages = modelCalled ? ["scope"] : [];
  assert.deepStrictEqual(r.stages, wantStages, `${where}: model stages ${JSON.stringify(r.stages)} — a refused request may reach ${modelCalled ? '"scope" only' : "no model at all"}`);
  assertDecisionLogged(r, expected, route, where);
  state.refused++;
}

// An acceptance: 202, exactly one row carrying the decision, exactly one enqueue, and no
// model stage but the gate's at route time. Returns the job id.
function assertAccepted(r, { route, modelCalled, reply, prompt, where }) {
  assert.strictEqual(r.status, 202, `${where}: ${show(r)}`);
  const id = route === "projects" ? r.body.projectId : r.body.jobId;
  assert.ok(/^[0-9a-z]{10}$/.test(String(id)), `${where}: no job id in ${show(r)}`);

  assert.deepStrictEqual(r.body.scope, {
    status: "SUPPORTED",
    videoIntent: reply ? reply.videoIntent : null,
    unsupportedParts: reply ? reply.unsupportedParts : [],
  }, `${where}: 202 scope summary`);

  assert.strictEqual(r.rowDelta, 1, `${where}: expected exactly one new row, got ${r.rowDelta}`);
  if (route === "projects") {
    assert.deepStrictEqual(r.intake.map((x) => x.id), [id], `${where}: enqueueIntake calls ${JSON.stringify(r.intake)}`);
    assert.deepStrictEqual(r.generated, [], `${where}: the generate queue was called by /api/projects`);
  } else {
    assert.deepStrictEqual(r.generated.map((t) => t.jobId), [id], `${where}: enqueue calls ${JSON.stringify(r.generated.map((t) => t.jobId))}`);
    assert.deepStrictEqual(r.intake, [], `${where}: enqueueIntake was called by /api/generate`);
  }
  assert.deepStrictEqual(r.production, [], `${where}: enqueueProduction was called at create`);
  assert.deepStrictEqual(r.stages, modelCalled ? ["scope"] : [],
    `${where}: model stages at route time ${JSON.stringify(r.stages)} — normalisation, brief, script, assets and TTS belong to the pipeline`);

  const row = db.getRaw(id);
  assert.ok(row, `${where}: the 202 names a job the store does not have`);
  assert.strictEqual(row.status, "queued", `${where}: row status ${row.status}`);
  assert.strictEqual(row.prompt, prompt, `${where}: stored prompt ${JSON.stringify(row.prompt).slice(0, 120)}`);
  const ps = row.prompt_scope;
  assert.ok(ps && typeof ps === "object", `${where}: the row carries no prompt_scope`);
  assert.deepStrictEqual(Object.keys(ps).sort(), REDUCED_KEYS, `${where}: prompt_scope is not the reduce() shape`);
  assert.strictEqual(ps.status, "SUPPORTED", `${where}: prompt_scope.status ${ps.status}`);
  assert.strictEqual(ps.videoIntent, r.body.scope.videoIntent, `${where}: stored videoIntent differs from the 202`);
  assert.deepStrictEqual(ps.unsupportedParts, r.body.scope.unsupportedParts, `${where}: stored unsupportedParts differ from the 202`);
  assert.strictEqual(ps.videoType, reply ? reply.videoType : null, `${where}: stored videoType`);
  assert.strictEqual(ps.via, modelCalled ? "model (attempt 1)" : "input-mode", `${where}: stored via ${ps.via}`);
  assert.strictEqual(ps.usage.tokensIn, modelCalled ? STUB_USAGE.tokensIn : 0, `${where}: stored usage is not this request's gate call`);
  // Kept OFF the brief model's input and off the crash-recovery replay, by design.
  if (row.intent) assert.ok(!("promptScope" in row.intent) && !("scope" in row.intent), `${where}: the verdict leaked into intent`);
  if (row.task) assert.ok(!("promptScope" in row.task) && !("scope" in row.task), `${where}: the verdict leaked into the replayable task`);
  // The unauthenticated GET projection: the reading, never confidence or cost.
  assert.deepStrictEqual(db.get(id).scope, {
    status: "SUPPORTED", videoIntent: ps.videoIntent || null, videoType: ps.videoType || null, unsupportedParts: ps.unsupportedParts,
  }, `${where}: GET projection of the decision`);

  assertDecisionLogged(r, "SUPPORTED", route, where);
  state.accepted.push(id);
  return id;
}

// ---------------------------------------------------------------- run

(async () => {
  let server = null;
  try {
    const app = express();
    app.use(express.json({ limit: "64kb" })); // server.js's limit
    app.use("/api", generateRoutes.buildRouter({ enqueue: (task) => { spies.generate.push(task); } }));
    app.use("/api", projectsRoutes.buildRouter({
      enqueueIntake: (id, opts) => { spies.intake.push({ id, opts }); },
      enqueueProduction: (id) => { spies.production.push(id); },
    }));
    // A route that throws must fail the ledger, not vanish into express's default handler.
    app.use((err, _req, res, _next) => {
      routeErrors.push(String(err && err.stack || err).slice(0, 400));
      if (!res.headersSent) res.status(500).json({ error: "route threw" });
    });
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    BASE = `http://127.0.0.1:${server.address().port}/api`;

    for (const [id, reply] of Object.entries(REPLIES)) script(fixture(id).prompt, reply);

    // -------------------------------------------------------------- isolation
    group("isolation — a temp store, a recording model, no network");

    await ta("the redirected store was server/jobs.json, and every path now points into the temp dir", async () => {
      assert.strictEqual(path.resolve(ORIGINAL_PATHS.dbFile), path.resolve(REAL_DB), "config.paths.dbFile was not server/jobs.json — the hash guard would watch the wrong file");
      for (const [k, v] of Object.entries(TMP_PATHS)) assert.strictEqual(config.paths[k], v, k);
    });

    await ta("db.js opened the temp store: it starts empty", async () => {
      assert.strictEqual(db.countJobsSince(0), 0, "the store db.js loaded is not empty — it is not the temp store");
    });

    await ta("openrouter.chat on the cached module is the recorder; global fetch is the tripwire", async () => {
      assert.strictEqual(require.cache[OPENROUTER_ID].exports.chat, recordingChat);
      assert.notStrictEqual(REAL_CHAT, recordingChat);
      assert.notStrictEqual(globalThis.fetch, REAL_FETCH);
    });

    // -------------------------------------------------------------- the matrix
    group("POST /api/projects — the fixture matrix");

    const MATRIX = [
      ["saas-explainer", "SaaS promo"],
      ["storyline-community-garden", "user-written scene-by-scene storyline"],
      ["poorly-written-car-wash", "poorly written but valid"],
      ["multi-objective-newsletter", "multiple objectives (a video plus a non-video sub-ask)"],
      ["url-only", "URL only, no prompt"],
      ["coding-python-backend", "coding request"],
      ["essay-blog-post", "essay / blog post as text"],
      ["question-live-weather", "general live-data question"],
      ["technical-database-migration", "unsupported technical task"],
      ["edit-own-wedding-footage", "editing the user's own footage"],
      ["talking-avatar-selfie", "talking avatar"],
      ["url-plus-coding", "URL plus a coding instruction"],
      ["keyboard-mash", "nonsense"],
      ["tier1-credential-theft", "tier-1 disallowed"],
    ];

    for (const [id, label] of MATRIX) {
      const c = fixture(id);
      const expected = c.expect.status;
      const modelCalled = !c.expect.noModelCall;
      await ta(`${label} [${id}] -> ${expected === "SUPPORTED" ? 202 : 422} ${expected}${modelCalled ? "" : " (decided in code)"}`, async () => {
        assert.ok(expected, `${id}: the fixture has no exact expected status`);
        const reply = REPLIES[id] || null;
        assert.strictEqual(!!reply, modelCalled, `${id}: a scripted reply must exist exactly when the fixture says the model decides`);
        if (reply) assert.strictEqual(reply.status, expected, `${id}: the scripted reply disagrees with the fixture`);

        const r = await send("/projects", { json: { prompt: c.prompt, ...(c.sources || {}) } });
        if (expected === "SUPPORTED") {
          const jobId = assertAccepted(r, { route: "projects", modelCalled, reply, prompt: c.prompt, where: id });
          const row = db.getRaw(jobId);
          state.projectIds[id] = jobId; // the normalisation group runs generateBrief on these stored jobs
          if (c.expect.unsupportedPartsNonEmpty) {
            assert.ok(r.body.scope.unsupportedParts.length > 0, `${id}: the 202 did not name the non-video sub-ask`);
            assert.ok(row.prompt_scope.unsupportedParts.length > 0, `${id}: the row did not keep the non-video sub-ask`);
          }
          if (c.sources && c.sources.websiteUrl) assert.strictEqual(row.intent.websiteUrl, c.sources.websiteUrl, `${id}: websiteUrl`);
        } else {
          assertRefused(r, { route: "projects", expected, modelCalled, reply, where: id });
          if (expected === "DISALLOWED") {
            assert.strictEqual(r.body.error, moderation.screen(c.prompt).tier1.reason, `${id}: the refusal is not the tier-1 reason`);
          }
        }
      });
    }

    // -------------------------------------------------------------- clarification
    // -------------------------------------------------------------- content policy
    // The model may refuse under the owner's content policy (prompt_scope.js POLICY_CATEGORIES).
    // What the ROUTES must do with that refusal is exactly what they do with a tier-1 one: a
    // 422, no row, no enqueue, no stage past the gate — and the person reads the product's
    // own sentence, never anything the model wrote. The prompts here are neutral placeholders:
    // this file scripts the model, it does not measure it (prompt_scope.test.cjs --llm does).
    group("content policy — a confident policy refusal is a 422 carrying the product's sentence");

    const { POLICY_CATEGORIES } = require(path.join(SERVER_ROOT, "src", "services", "prompt_scope"));
    for (const [i, category] of Object.keys(POLICY_CATEGORIES).entries()) {
      for (const route of ["projects", "generate"]) {
        const prompt = `policy placeholder request number ${i + 1} for the ${route} route`;
        const MODEL_TEXT = "MODEL-WRITTEN DETAIL THAT MUST NEVER REACH THE PERSON";
        script(prompt, {
          status: "DISALLOWED", confidence: 0.93, policyCategory: category, reason: MODEL_TEXT,
          requestedDeliverable: MODEL_TEXT, videoIntent: null, videoType: null, clarificationQuestion: null, unsupportedParts: [],
        });
        await ta(`${route}: ${category} -> 422 DISALLOWED with no row, no enqueue`, async () => {
          const r = await send(`/${route}`, { json: { prompt, ...(route === "generate" ? { duration: 20 } : {}) } });
          assertRefused(r, { route, expected: "DISALLOWED", modelCalled: true, reply: null, where: `${route}/${category}` });
          assert.strictEqual(r.body.error, POLICY_CATEGORIES[category], `${route}/${category}: the refusal is not the product's sentence`);
          assert.ok(!JSON.stringify(r.body).includes(MODEL_TEXT), `${route}/${category}: model-written text reached the client`);
        });
      }
    }

    group("clarification — one question, one answer, then the video");

    const CLAR = fixture("clarification-answered");
    const CLAR_MERGED = `${CLAR.prompt}\n\n${CLAR.clarification.answer}`;
    script(CLAR.prompt, questionReply({
      clarificationQuestion: CLAR.clarification.question,
      reason: "Your message doesn't say what the video should be about yet.",
    }));
    script(CLAR_MERGED, supportedReply({
      requestedDeliverable: "a 45-second event invitation video",
      videoIntent: "A 45-second invitation to an animal shelter's charity walk on 12 October, with a sign-up link.",
      videoType: typeLabel("event"),
      reason: "You want an invitation video for your charity walk, which KEYFRAME can make.",
    }));

    const MASH = fixture("keyboard-mash").prompt;
    const MASH_ANSWER = "A 20-second promo for our bakery's new sourdough loaf, warm and friendly.";
    const MASH_REPLY = supportedReply({
      requestedDeliverable: "a 20-second promotional video for a bakery",
      videoIntent: "A 20-second promo for a bakery's new sourdough loaf.",
      videoType: typeLabel("marketing"),
      reason: "You want a promo video for your bakery, which KEYFRAME can make.",
    });
    script(MASH_ANSWER, MASH_REPLY);

    await ta("preconditions: the fixture's vague prompt is words (appended to), the mash is nonsense (replaced)", async () => {
      assert.strictEqual(promptScope.looksLikeNonsense(CLAR.prompt), false);
      assert.strictEqual(promptScope.looksLikeNonsense(MASH), true);
      assert.ok(CLAR_MERGED.length <= 4000);
    });

    await ta("round 1: a vague request gets ONE question — 422, no row, no enqueue, only the scope stage", async () => {
      const r = await send("/projects", { json: { prompt: CLAR.prompt } });
      assertRefused(r, { route: "projects", expected: "NEEDS_CLARIFICATION", modelCalled: true, where: "clarify round 1" });
      assert.strictEqual(r.body.scope.clarificationQuestion, CLAR.clarification.question);
      state.question = r.body.scope.clarificationQuestion;
    });

    await ta("round 2: the same request plus clarification {question, answer} -> 202; the gate and the row read prompt + answer", async () => {
      assert.ok(state.question, "round 1 produced no question");
      const clarification = { question: state.question, answer: CLAR.clarification.answer };
      const r = await send("/projects", { json: { prompt: CLAR.prompt, clarification } });
      const id = assertAccepted(r, { route: "projects", modelCalled: true, reply: SCRIPT.get(CLAR_MERGED).reply, prompt: CLAR_MERGED, where: "clarify round 2" });
      const [call] = r.calls;
      assert.strictEqual(call.payload.prompt, CLAR_MERGED, "the gate did not read the merged prompt");
      assert.deepStrictEqual(call.payload.clarification, clarification, "the clarification never reached analyzeScope");
      const row = db.getRaw(id);
      assert.ok(row.prompt.includes(CLAR.clarification.answer), "the stored prompt lost the answer");
      assert.ok(row.prompt.startsWith(CLAR.prompt), "the stored prompt lost the original words");
      assert.strictEqual(row.intent.prompt, CLAR_MERGED, "intent.prompt (what the brief reads) is not the merged prompt");
    });

    await ta("nonsense round 1: asked in code — 422 NEEDS_CLARIFICATION with no model call and no row", async () => {
      const r = await send("/projects", { json: { prompt: MASH } });
      assertRefused(r, { route: "projects", expected: "NEEDS_CLARIFICATION", modelCalled: false, where: "nonsense round 1" });
      state.mashQuestion = r.body.scope.clarificationQuestion;
    });

    // Over multipart, as the web client sends it: FormData stringifies the object.
    await ta("nonsense round 2 (multipart, clarification as a JSON string): the answer REPLACES the mash -> 202", async () => {
      const form = new FormData();
      form.append("prompt", MASH);
      form.append("clarification", JSON.stringify({ question: state.mashQuestion || "What is it about?", answer: MASH_ANSWER }));
      const r = await send("/projects", { form });
      const id = assertAccepted(r, { route: "projects", modelCalled: true, reply: MASH_REPLY, prompt: MASH_ANSWER, where: "nonsense round 2" });
      assert.strictEqual(r.calls[0].payload.prompt, MASH_ANSWER, "the gate was shown the mash, not the answer");
      assert.strictEqual(r.calls[0].payload.clarification.answer, MASH_ANSWER);
      const row = db.getRaw(id);
      assert.ok(!row.prompt.includes("asdfghjkl") && !row.intent.prompt.includes("asdfghjkl"), "the keyboard mash survived into the job");
    });

    // THE SUBJECT SURVIVES THE ANSWER. A real subject the old nonsense heuristic misread —
    // a German compound, an acronym — had the answer REPLACE it, so the stored job never
    // mentioned what the person asked about. The answers below deliberately do not repeat
    // the subject: only the merge can keep it in the job.
    const DE_SUBJECT = "Rechtsschutzversicherung";
    const DE_ANSWER = "Ein 30-Sekunden-Erklärvideo für kleine Handwerksbetriebe: warum sie sich lohnt und was sie kostet.";
    const DE_MERGED = `${DE_SUBJECT}\n\n${DE_ANSWER}`;
    const DE_REPLY = supportedReply({
      requestedDeliverable: "a 30-second explainer about legal expenses insurance",
      videoIntent: "A 30-second explainer on why legal expenses insurance pays off for small trades businesses.",
      videoType: typeLabel("education"),
      reason: "You want an explainer about legal expenses insurance, which KEYFRAME can make.",
    });
    script(DE_MERGED, DE_REPLY);

    const HTTP_SUBJECT = "HTTP/2 vs HTTP/3";
    const HTTP_ANSWER = "A 60-second explainer for web developers on what actually changed and when to switch.";
    const HTTP_MERGED = `${HTTP_SUBJECT}\n\n${HTTP_ANSWER}`;
    const HTTP_REPLY = supportedReply({
      requestedDeliverable: "a 60-second explainer comparing two protocol versions",
      videoIntent: "A 60-second developer explainer on the differences between HTTP/2 and HTTP/3.",
      videoType: typeLabel("education"),
      reason: "You want a developer explainer comparing HTTP/2 and HTTP/3, which KEYFRAME can make.",
    });
    script(HTTP_MERGED, HTTP_REPLY);

    const NAME = "Dr. Wünsch GmbH";
    const NAME_MERGED = `${NAME}\n\n${NAME}`;
    const NAME_REPLY = supportedReply({
      requestedDeliverable: "a company video",
      videoIntent: "A short company video for Dr. Wünsch GmbH.",
      videoType: typeLabel("brand-promotion"),
      reason: "You want a video about Dr. Wünsch GmbH, which KEYFRAME can make.",
    });
    script(NAME_MERGED, NAME_REPLY);

    // "idk" as the answer: the model still cannot say what to make and still may not ask.
    const IDK_ANSWER = "idk, whatever you think";
    const IDK_MERGED = `${CLAR.prompt}\n\n${IDK_ANSWER}`;
    script(IDK_MERGED, questionReply({
      clarificationQuestion: "What is the fundraiser for?",
      reason: "Your answer doesn't say what the video should be about yet.",
    }));

    await ta("preconditions: the real subjects are not nonsense, and no answer repeats its subject", async () => {
      for (const s of [DE_SUBJECT, HTTP_SUBJECT, NAME]) assert.strictEqual(promptScope.looksLikeNonsense(s), false, s);
      assert.ok(!DE_ANSWER.includes(DE_SUBJECT) && !HTTP_ANSWER.includes("HTTP"), "an answer repeats the subject — the test could pass without the merge keeping it");
    });

    await ta(`/api/projects: "${DE_SUBJECT}" + an answer -> 202, and the stored prompt still contains "${DE_SUBJECT}"`, async () => {
      const clarification = { question: "What would you like your video to be about?", answer: DE_ANSWER };
      const r = await send("/projects", { json: { prompt: DE_SUBJECT, clarification } });
      const id = assertAccepted(r, { route: "projects", modelCalled: true, reply: DE_REPLY, prompt: DE_MERGED, where: "German compound + answer" });
      const row = db.getRaw(id);
      assert.ok(row.prompt.includes(DE_SUBJECT) && row.intent.prompt.includes(DE_SUBJECT), `the subject was dropped from the job: ${JSON.stringify(row.prompt)}`);
      assert.ok(row.prompt.includes(DE_ANSWER), "the answer was dropped from the job");
      assert.strictEqual(r.calls[0].payload.prompt, DE_MERGED, "the gate was not shown the subject");
    });

    await ta(`/api/generate: "${HTTP_SUBJECT}" + an answer -> 202, and the stored prompt and task still contain the subject`, async () => {
      const clarification = { question: "What would you like your video to be about?", answer: HTTP_ANSWER };
      const r = await send("/generate", { json: { prompt: HTTP_SUBJECT, duration: 60, clarification } });
      const id = assertAccepted(r, { route: "generate", modelCalled: true, reply: HTTP_REPLY, prompt: HTTP_MERGED, where: "acronym + answer" });
      assert.ok(db.getRaw(id).task.prompt.includes(HTTP_SUBJECT), "the replayable task lost the subject");
    });

    await ta(`a real subject retyped as the answer ("${NAME}") -> 202, not an OUT_OF_SCOPE decided in code`, async () => {
      const clarification = { question: "What would you like your video to be about?", answer: NAME };
      const r = await send("/projects", { json: { prompt: NAME, clarification } });
      assertAccepted(r, { route: "projects", modelCalled: true, reply: NAME_REPLY, prompt: NAME_MERGED, where: "retyped subject" });
    });

    for (const route of ["projects", "generate"]) {
      await ta(`/api/${route}: "idk" as the answer -> 422 OUT_OF_SCOPE with ${SURFACE_OF[route]} guidance; no second question, no job`, async () => {
        const clarification = { question: CLAR.clarification.question, answer: IDK_ANSWER };
        const r = await send(`/${route}`, { json: { prompt: CLAR.prompt, duration: 30, clarification } });
        assertRefused(r, { route, expected: "OUT_OF_SCOPE", modelCalled: true, reply: { reason: SUBJECTLESS_REASON }, where: `${route} subjectless answer` });
        assert.strictEqual(r.body.scope.clarificationQuestion, null, "a second question was asked");
        assert.strictEqual(r.calls[0].payload.prompt, IDK_MERGED);
      });
    }

    // -------------------------------------------------------------- 400s
    group("request-shape errors stay 400 and never reach the gate");

    const SAAS = fixture("saas-explainer");

    await ta("a clarification that is not a JSON object -> 400; no scope call, no row, no enqueue", async () => {
      const r = await send("/projects", { json: { prompt: SAAS.prompt, clarification: "not json" } });
      assert.strictEqual(r.status, 400, show(r));
      assert.ok((r.body.details || []).includes("clarification must be a JSON object { question, answer }"), show(r));
      assert.deepStrictEqual(r.stages, []);
      assert.strictEqual(r.rowDelta, 0);
      assert.deepStrictEqual(r.intake, []);
    });

    // THE EMPTY PROMPT AT THE ROUTE. prompt_scope's fixture has an "empty-prompt" case the gate
    // answers with a question, but its note says no route can send it — this is where that
    // claim is held to account: a create with nothing to make is a request-shape error, and it
    // must not reach the gate, the store or the queue.
    for (const [label, prompt] of [["empty", ""], ["whitespace-only", "   \n\t  "], ["absent", undefined]]) {
      await ta(`/api/projects with an ${label} prompt and no source -> 400; no scope call, no row, no enqueue`, async () => {
        const r = await send("/projects", { json: prompt === undefined ? { duration: 30 } : { prompt, duration: 30 } });
        assert.strictEqual(r.status, 400, show(r));
        assert.ok((r.body.details || []).includes("provide at least one of: prompt, websiteUrl, blogUrl, referenceVideo"), show(r));
        assert.deepStrictEqual(r.stages, [], "an empty create reached a model");
        assert.strictEqual(r.rowDelta, 0);
        assert.deepStrictEqual(r.intake, []);
      });
      await ta(`/api/generate with an ${label} prompt -> 400; no scope call, no row, no enqueue`, async () => {
        const r = await send("/generate", { json: prompt === undefined ? { duration: 30 } : { prompt, duration: 30 } });
        assert.strictEqual(r.status, 400, show(r));
        const want = prompt === undefined ? "prompt must be a string" : `prompt must be at least ${capabilities.GENERATE_PROMPT_CHARS.min} characters`;
        assert.ok((r.body.details || []).includes(want), `expected "${want}": ${show(r)}`);
        assert.deepStrictEqual(r.stages, [], "an empty create reached a model");
        assert.strictEqual(r.rowDelta, 0);
        assert.deepStrictEqual(r.generated, []);
      });
    }

    // A long, detailed, perfectly ordinary request. Nothing between the validator's
    // 4000-character cap and the insert may truncate it, reject it or skip the gate.
    const LONG_PROMPT = promptOfLength(3000, "A 90-second horizontal launch film for LumaDesk, a height-adjustable standing desk for remote workers.");
    const LONG_REPLY = supportedReply({
      requestedDeliverable: "a 90-second launch video for a standing desk",
      videoIntent: "A 90-second launch film for the LumaDesk standing desk.",
      videoType: typeLabel("launch"),
      reason: "You want a launch video for your standing desk, which KEYFRAME can make.",
    });
    script(LONG_PROMPT, LONG_REPLY);

    await ta("/api/projects: a 3000-character supported prompt -> 202, stored byte for byte, one scope call", async () => {
      assert.strictEqual(LONG_PROMPT.length, 3000);
      const r = await send("/projects", { json: { prompt: LONG_PROMPT, duration: 90 } });
      const id = assertAccepted(r, { route: "projects", modelCalled: true, reply: LONG_REPLY, prompt: LONG_PROMPT, where: "3000-character prompt" });
      assert.strictEqual(r.calls[0].payload.prompt, LONG_PROMPT, "the gate read a truncated prompt");
      assert.strictEqual(db.getRaw(id).intent.prompt.length, 3000);
    });

    await ta("prompt + answer over the 4000-character cap -> 400; no scope call, no row, no enqueue", async () => {
      const answer = "x ".repeat(2000);
      assert.ok(`${SAAS.prompt}\n\n${answer.trim()}`.length > 4000);
      const r = await send("/projects", { json: { prompt: SAAS.prompt, clarification: { question: "q?", answer } } });
      assert.strictEqual(r.status, 400, show(r));
      assert.ok((r.body.details || []).includes("prompt and clarification together must be at most 4000 characters"), show(r));
      assert.deepStrictEqual(r.stages, []);
      assert.strictEqual(r.rowDelta, 0);
      assert.deepStrictEqual(r.intake, []);
    });

    // -------------------------------------------------------------- multipart
    group("multipart — a refused upload leaves nothing behind");

    await ta("OUT_OF_SCOPE with a PNG in \"assets\": 422, and the file multer wrote is gone from disk", async () => {
      const c = fixture("technical-background-removal");
      const entry = SCRIPT.get(c.prompt);
      const seen = [];
      // Listed WHILE the gate decides: multer has written the file by then, so this is
      // the proof there was something to clean up — an empty directory afterwards alone
      // would also pass if the upload had never landed.
      entry.onCall = () => {
        for (const f of fs.readdirSync(TMP_PATHS.uploadsDir)) {
          const p = path.join(TMP_PATHS.uploadsDir, f);
          seen.push({ p, bytes: fs.statSync(p).size });
        }
      };
      const uploadsBefore = fs.readdirSync(TMP_PATHS.uploadsDir);
      const jobsBefore = fs.readdirSync(TMP_PATHS.jobsDir);
      const form = new FormData();
      form.append("prompt", c.prompt);
      form.append("assets", new Blob([PNG], { type: "image/png" }), "product-01.png");
      let r;
      try { r = await send("/projects", { form }); } finally { entry.onCall = null; }

      assertRefused(r, { route: "projects", expected: "OUT_OF_SCOPE", modelCalled: true, reply: entry.reply, where: "multipart" });
      assert.strictEqual(r.calls[0].payload.sources.uploadedImages, true, "the gate was not told about the upload");
      const fresh = seen.filter((s) => !uploadsBefore.includes(path.basename(s.p)));
      assert.strictEqual(fresh.length, 1, `expected one staged upload while the gate decided, saw ${JSON.stringify(seen)}`);
      assert.ok(fresh[0].p.endsWith(".png"), fresh[0].p);
      assert.strictEqual(fresh[0].bytes, PNG.length, "the staged file is not the uploaded PNG");
      assert.strictEqual(fs.existsSync(fresh[0].p), false, `the refused request's upload is still on disk: ${fresh[0].p}`);
      assert.deepStrictEqual(fs.readdirSync(TMP_PATHS.uploadsDir), uploadsBefore, "the uploads directory changed");
      assert.deepStrictEqual(fs.readdirSync(TMP_PATHS.jobsDir), jobsBefore, "a refused request staged files into a job directory");
    });

    // -------------------------------------------------------------- /api/generate
    group("POST /api/generate — the same gate, over the same matrix");

    // Every row of the /api/projects matrix again, on the other create route. This half used
    // to be two hand-picked requests (one refusal, one acceptance), which could not see a
    // decision kind — a question, a tier-1 refusal, a sub-ask on an accepted video — that one
    // route honoured and the other did not. Differences are the endpoint's, not the gate's:
    // no source fields (a URL-only request has no prompt, which this route requires), a
    // mandatory duration, and a refusal's steps written for this endpoint (assertRefused).
    for (const [id, label] of MATRIX) {
      const c = fixture(id);
      const expected = c.expect.status;
      const modelCalled = !c.expect.noModelCall;
      const noPrompt = !c.prompt;
      await ta(`${label} [${id}] -> ${noPrompt ? "400 (this route takes no source)" : `${expected === "SUPPORTED" ? 202 : 422} ${expected}`}`, async () => {
        const reply = REPLIES[id] || null;
        const r = await send("/generate", { json: { prompt: c.prompt, duration: 30 } });
        if (noPrompt) {
          assert.strictEqual(r.status, 400, show(r));
          assert.deepStrictEqual(r.stages, [], `${id}: a promptless request reached the gate`);
          assert.strictEqual(r.rowDelta, 0);
          assert.deepStrictEqual(r.generated, []);
          return;
        }
        if (expected === "SUPPORTED") {
          const jobId = assertAccepted(r, { route: "generate", modelCalled, reply, prompt: c.prompt, where: `generate ${id}` });
          const [task] = r.generated;
          assert.strictEqual(task.jobId, jobId);
          assert.strictEqual(task.prompt, c.prompt);
          assert.deepStrictEqual(db.getRaw(jobId).task, task, `${id}: the stored replay task is not the enqueued one`);
          if (c.expect.unsupportedPartsNonEmpty) assert.ok(r.body.scope.unsupportedParts.length > 0, `${id}: the 202 did not name the non-video sub-ask`);
        } else {
          assertRefused(r, { route: "generate", expected, modelCalled, reply, where: `generate ${id}` });
          if (expected === "DISALLOWED") {
            assert.strictEqual(r.body.error, moderation.screen(c.prompt).tier1.reason, `${id}: the refusal is not the tier-1 reason`);
          }
        }
      });
    }

    // THE STEPS ARE A CONTRACT WITH THIS ENDPOINT. A refusal from /api/generate tells the caller
    // exactly what to send; each claim is checked here against what the route actually does.
    // Read inside each test, not at group level: a throw out here would skip every check after
    // it, the jobs.json hash comparison included.
    const apiSteps = () => capabilities.outOfScopeGuidance({ reason: "r", surface: "api-generate" }).steps.join("\n");

    await ta("the steps' prompt bounds are the route's: the maximum -> 202, one over and one under -> 400 before the gate", async () => {
      const { min: API_MIN, max: API_MAX } = capabilities.GENERATE_PROMPT_CHARS;
      const API_STEPS = apiSteps();
      const API_MAX_PROMPT = promptOfLength(API_MAX, "A launch film for LumaDesk, a standing desk for remote workers and small studios.");
      const API_MAX_REPLY = supportedReply({
        requestedDeliverable: "a launch video for a standing desk",
        videoIntent: "A launch film for the LumaDesk standing desk.",
        videoType: typeLabel("launch"),
        reason: "You want a launch video for your standing desk, which KEYFRAME can make.",
      });
      script(API_MAX_PROMPT, API_MAX_REPLY);
      assert.ok(API_STEPS.includes(`a prompt of ${API_MIN} to ${API_MAX} characters`), API_STEPS);
      const ok = await send("/generate", { json: { prompt: API_MAX_PROMPT, duration: 30 } });
      assertAccepted(ok, { route: "generate", modelCalled: true, reply: API_MAX_REPLY, prompt: API_MAX_PROMPT, where: `${API_MAX}-character prompt` });
      for (const [n, msg] of [[API_MAX + 1, `prompt must be at most ${API_MAX} characters`], [API_MIN - 1, `prompt must be at least ${API_MIN} characters`]]) {
        const r = await send("/generate", { json: { prompt: promptOfLength(n, "A launch film"), duration: 30 } });
        assert.strictEqual(r.status, 400, `${n} chars: ${show(r)}`);
        assert.ok((r.body.details || []).includes(msg), `${n} chars: ${show(r)}`);
        assert.deepStrictEqual(r.stages, [], `${n} chars reached the gate`);
      }
    });

    await ta("the steps say duration is required and give config's range — and the route agrees at both ends", async () => {
      const API_STEPS = apiSteps();
      assert.ok(API_STEPS.includes("duration, which this endpoint requires"), API_STEPS);
      const missing = await send("/generate", { json: { prompt: SAAS.prompt } });
      assert.strictEqual(missing.status, 400, show(missing));
      assert.ok((missing.body.details || []).includes("duration must be a number"), show(missing));
      for (const d of [config.server.minDurationSec - 1, config.server.maxDurationSec + 1]) {
        const r = await send("/generate", { json: { prompt: SAAS.prompt, duration: d } });
        assert.strictEqual(r.status, 400, `duration ${d}: ${show(r)}`);
        assert.deepStrictEqual(r.stages, []);
      }
    });

    await ta("every field the steps name is one the route accepts and carries onto the replayable task", async () => {
      const API_STEPS = apiSteps();
      const { VALID_VOICES } = require("../src/services/audio_planner");
      const voice = [...VALID_VOICES][0];
      const framePack = frameRegistry.listPacks()[0];
      const body = {
        prompt: SAAS.prompt, duration: config.server.minDurationSec,
        orientation: "vertical", quality: Object.keys(config.qualities)[0], fps: config.allowedFps[0],
        tts: true, voice, music: true, sound_effect: true, images: true, video: true, framePack, pace: "fast",
      };
      for (const k of ["tts: true", "voice", "music: true", "sound_effect: true", "images: true", "video: true", "framePack", "pace", "orientation", "quality", "fps"]) {
        assert.ok(API_STEPS.includes(k), `the steps do not name "${k}"`);
      }
      const r = await send("/generate", { json: body });
      const id = assertAccepted(r, { route: "generate", modelCalled: true, reply: REPLIES[SAAS.id], prompt: SAAS.prompt, where: "every named field" });
      const { task } = db.getRaw(id);
      assert.deepStrictEqual(
        { tts: task.tts, voice: task.voice, music: task.music, soundEffect: task.soundEffect, images: task.images, video: task.video,
          framePack: task.framePack, pace: task.pace, orientation: task.orientation, quality: task.quality, fps: task.fps, duration: task.duration },
        { tts: true, voice, music: true, soundEffect: true, images: true, video: true,
          framePack, pace: "fast", orientation: "vertical", quality: body.quality, fps: body.fps, duration: body.duration },
        "a field the steps promise did not reach the task runJob replays",
      );
    });

    // -------------------------------------------------------------- automatic normalisation
    group("automatic normalisation — inside the pipeline, with no client step");

    llm.handlers.analysis = () => analysisReply();
    llm.handlers.brief = (rec) => briefReply(rec.payload);

    await ta("generateBrief on the accepted SaaS job's STORED intent: stages analysis -> brief, and brief.analysis is attached", async () => {
      assert.ok(state.projectIds["saas-explainer"], "the SaaS project was not created above");
      const job = db.getRaw(state.projectIds["saas-explainer"]);
      assert.strictEqual(job.status, "queued");
      assert.strictEqual(job.brief, null);
      assert.ok(job.intent && !job.intent.analysis, "the stored intent already carries an analysis — the client did the pipeline's work");

      const before = llm.calls.length;
      const { value: out } = await quietly(() => generateBrief({ intent: job.intent }));
      const calls = llm.calls.slice(before);
      assert.deepStrictEqual(calls.map((c) => c.stage), ["analysis", "brief"], `stages ${JSON.stringify(calls.map((c) => c.stage))}`);
      assert.strictEqual(calls[0].payload.prompt, job.intent.prompt, "the normaliser did not read the job's prompt");
      assert.ok(calls[1].payload.analysis, "the brief model was not shown the analysis");
      assert.strictEqual(calls[1].payload.analysis.refinedPrompt, REFINED, "the brief model was not handed the normalised prompt");

      const a = out.brief.analysis;
      assert.ok(a && typeof a === "object", "brief.analysis is not attached");
      assert.strictEqual(a.classification, "REFINABLE");
      assert.strictEqual(a.originalPrompt, job.intent.prompt);
      assert.strictEqual(a.refinedPrompt, REFINED);
      assert.strictEqual(a.safety.verdict, "allow");
      assert.ok(frameRegistry.resolvePack(out.brief.suggestedFramePack), `unresolvable pack ${out.brief.suggestedFramePack}`);
      assert.deepStrictEqual(out.analysisUsage, STUB_USAGE, "the normaliser's usage was not reported");
    });

    // A PERSON WHO WROTE THE SCENES GETS THEIR ORDER. The accepted storyline job, normalised
    // automatically: the stubbed analysis reads it as STRUCTURED_STORY with an order lock,
    // and the lock and the beats must reach brief.analysis and the brief model intact. The
    // beats arrive shuffled in the reply (each with its correct index), so a pipeline that
    // kept array order instead of the person's order would fail here.
    await ta("a scene-by-scene storyline job: STRUCTURED_STORY, orderLocked, and the beats in the person's order through to the brief", async () => {
      const id = state.projectIds["storyline-community-garden"];
      assert.ok(id, "the storyline project was not created above");
      const job = db.getRaw(id);
      const scenes = job.intent.prompt.split(/\s*Scene \d+:\s*/).filter(Boolean);
      assert.strictEqual(scenes.length, 5, `the fixture storyline no longer has five scenes: ${JSON.stringify(scenes)}`);
      const beats = scenes.map((beat, i) => ({ index: i + 1, beat }));
      const story = {
        ...analysisReply(),
        classification: "STRUCTURED_STORY",
        refinedPrompt: job.intent.prompt,
        improvements: [],
        narrative: { orderLocked: true, source: "user-authored", beats: [beats[3], beats[0], beats[4], beats[2], beats[1]] },
        signals: { ...analysisReply().signals, contentTypes: ["storytelling"], category: "storytelling" },
      };
      llm.handlers.analysis = () => story;
      const before = llm.calls.length;
      try {
        const { value: out } = await quietly(() => generateBrief({ intent: job.intent }));
        const calls = llm.calls.slice(before);
        assert.deepStrictEqual(calls.map((c) => c.stage), ["analysis", "brief"], `stages ${JSON.stringify(calls.map((c) => c.stage))}`);
        assert.strictEqual(calls[0].payload.prompt, job.intent.prompt, "the normaliser did not read the stored storyline");

        const a = out.brief.analysis;
        assert.strictEqual(a.classification, "STRUCTURED_STORY", `classification ${a.classification}`);
        assert.strictEqual(a.narrative.orderLocked, true, "the order lock did not survive into brief.analysis");
        assert.strictEqual(a.narrative.source, "user-authored");
        assert.deepStrictEqual(a.narrative.beats.map((b) => b.beat), scenes, "brief.analysis beats are not in the person's order");
        assert.deepStrictEqual(a.narrative.beats.map((b) => b.index), [1, 2, 3, 4, 5]);
        assert.strictEqual(a.originalPrompt, job.intent.prompt);

        const shown = calls[1].payload.analysis;
        assert.strictEqual(shown.orderLocked, true, "the brief model was not told the order is locked");
        assert.deepStrictEqual(shown.beats.map((b) => b.beat), scenes, "the brief model was shown the beats out of order");
      } finally {
        llm.handlers.analysis = () => analysisReply();
      }
    });

    await ta("a poorly written job: normalised to REFINABLE, the person's words kept byte for byte as originalPrompt", async () => {
      const id = state.projectIds["poorly-written-car-wash"];
      assert.ok(id, "the car-wash project was not created above");
      const job = db.getRaw(id);
      const tidy = "A short promotional video for a local car wash offering thorough interior and exterior cleaning at low prices, "
        + "open on Sundays too, ending with a clear invitation to drive in this weekend.";
      llm.handlers.analysis = () => ({
        ...analysisReply(),
        classification: "REFINABLE",
        quality: { score: 34, missing: ["audience", "tone", "visual-direction"] },
        analyzedPrompt: "A promo for a cheap car wash that cleans inside and out and opens on Sundays.",
        refinedPrompt: tidy,
        improvements: [{ what: "Rewrote the request as a clear brief", why: "Spelling and run-ons made the offer hard to read." }],
        signals: { ...analysisReply().signals, contentTypes: ["marketing"], category: "marketing" },
      });
      const before = llm.calls.length;
      try {
        const { value: out } = await quietly(() => generateBrief({ intent: job.intent }));
        const calls = llm.calls.slice(before);
        assert.deepStrictEqual(calls.map((c) => c.stage), ["analysis", "brief"]);
        assert.strictEqual(calls[0].payload.prompt, fixture("poorly-written-car-wash").prompt, "the normaliser was not shown the person's own words");
        const a = out.brief.analysis;
        assert.strictEqual(a.classification, "REFINABLE", `classification ${a.classification}`);
        assert.strictEqual(a.originalPrompt, fixture("poorly-written-car-wash").prompt, "originalPrompt is not the person's words byte for byte");
        assert.strictEqual(a.refinedPrompt, tidy);
        assert.strictEqual(a.narrative.orderLocked, false);
        assert.strictEqual(calls[1].payload.analysis.refinedPrompt, tidy, "the brief model was not handed the normalised prompt");
      } finally {
        llm.handlers.analysis = () => analysisReply();
      }
    });

    // -------------------------------------------------------------- defence in depth
    group("defence in depth — a DISALLOWED analysis never becomes a brief");

    await ta("tier-1 content that bypassed the gate (admin-style intent): generateBrief throws the tier-1 reason, with no model call", async () => {
      const TIER1 = fixture("tier1-credential-theft").prompt;
      const reason = moderation.screen(TIER1).tier1.reason;
      const before = llm.calls.length;
      await assert.rejects(
        quietly(() => generateBrief({ intent: { prompt: TIER1, preferences: { duration: 30, orientation: "horizontal", framePack: "auto" } } })),
        (e) => { assert.strictEqual(e.message, reason); return true; },
      );
      assert.deepStrictEqual(llm.calls.slice(before).map((c) => c.stage), [], "a disallowed request reached a model");
    });

    await ta("an intent carrying a DISALLOWED analysis: generateBrief throws its reason before the brief model", async () => {
      const before = llm.calls.length;
      await assert.rejects(
        quietly(() => generateBrief({ intent: {
          prompt: "A promo for our bakery's new sourdough loaf",
          analysis: { classification: "DISALLOWED", safety: { verdict: "block", reason: "Blocked by tier-1 moderation (route test)." } },
          preferences: { duration: 30, orientation: "horizontal", framePack: "auto" },
        } })),
        (e) => { assert.strictEqual(e.message, "Blocked by tier-1 moderation (route test)."); return true; },
      );
      assert.deepStrictEqual(llm.calls.slice(before).map((c) => c.stage), []);
    });

    await ta("a MODEL that says DISALLOWED cannot trip it: coerced to REFINABLE, the brief is built", async () => {
      llm.handlers.analysis = () => ({ ...analysisReply(), classification: "DISALLOWED", safety: { verdict: "block", category: "x", reason: "no" } });
      const before = llm.calls.length;
      try {
        const { value: out } = await quietly(() => generateBrief({ intent: { prompt: SAAS.prompt, preferences: { duration: 30, orientation: "horizontal", framePack: "auto" } } }));
        assert.deepStrictEqual(llm.calls.slice(before).map((c) => c.stage), ["analysis", "brief"]);
        assert.strictEqual(out.brief.analysis.classification, "REFINABLE");
        assert.strictEqual(out.brief.analysis.safety.verdict, "review");
      } finally {
        llm.handlers.analysis = () => analysisReply();
      }
    });

    // -------------------------------------------------------------- ledger
    group("ledger — no stray spend, no stray writes");

    await ta("no outbound network, no unscripted model stage, no route error, no production enqueue", async () => {
      assert.deepStrictEqual(outbound, [], "outbound fetch attempted");
      assert.deepStrictEqual(llm.unscripted, [], "a model stage nobody scripted was requested");
      assert.deepStrictEqual(routeErrors, [], "a route threw");
      assert.deepStrictEqual(spies.production, [], "enqueueProduction was called");
    });

    await ta(`every 202 (${state.http[202] || 0}) and every 422 (${state.http[422] || 0}) the harness saw went through the full check; no 500`, async () => {
      assert.strictEqual(state.accepted.length, state.http[202] || 0, "a 202 escaped assertAccepted");
      assert.strictEqual(state.refused, state.http[422] || 0, "a 422 escaped assertRefused");
      assert.ok(state.accepted.length > 0 && state.refused > 0, "the run exercised no acceptance or no refusal");
      assert.ok(!state.http[500], `${state.http[500]} request(s) answered 500`);
    });

    await ta(`the temp store holds exactly the ${state.accepted.length} accepted jobs, each with a SUPPORTED prompt_scope`, async () => {
      db.close(); // flush synchronously, and cancel the debounced write before the temp dir goes
      const stored = JSON.parse(fs.readFileSync(TMP_PATHS.dbFile, "utf8"));
      assert.deepStrictEqual(stored.map((j) => j.id).sort(), [...state.accepted].sort());
      for (const j of stored) assert.strictEqual(j.prompt_scope && j.prompt_scope.status, "SUPPORTED", j.id);
    });

    const HASH_AFTER = sha256(REAL_DB);
    console.log(`        server/jobs.json sha256 before: ${HASH_BEFORE}`);
    console.log(`        server/jobs.json sha256 after:  ${HASH_AFTER}`);
    await ta("server/jobs.json is byte-identical to before the run", async () => {
      let leaked = [];
      try {
        const real = fs.readFileSync(REAL_DB, "utf8");
        leaked = state.accepted.filter((id) => real.includes(`"${id}"`));
      } catch { /* absent or unreadable: the hash comparison speaks for itself */ }
      assert.deepStrictEqual(leaked, [], "this run's job ids are in the real store");
      assert.strictEqual(HASH_AFTER, HASH_BEFORE,
        "jobs.json changed during the run, and none of this run's job ids are in it — another writer (the dev server?) touched it");
    });
  } catch (e) {
    failed++; process.exitCode = 1;
    console.error("test run failed: " + (e && e.stack || e));
  } finally {
    require.cache[OPENROUTER_ID].exports.chat = REAL_CHAT;
    globalThis.fetch = REAL_FETCH;
    if (server) {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
    removeTmp();
    console.log(`\n${passed} assertion group(s) passed, ${failed} failed${process.env.KEEP_TMP ? ` (temp store kept at ${TMP})` : ""}`);
  }
})();
