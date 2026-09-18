// Tests for AI Video Edit speech-to-text: ai/openrouter_stt.js, ai/kie_jobs.js and analysis/stt/*.
// Run: node scripts/video_edit_stt.test.cjs
//
// Load-bearing: a transcript is accepted only when it validates against the audio, and every provider
// failure mode verified live (ANALYSIS.md §1) — verbose_json 400, deepgram's empty billed 200, KIE's
// HTTP-200/code-500 and endless `waiting`, chat models renaming island ids, 402 / 401 / 429 — lands on
// the next engine or on a loud STT_FAILED with retry / continue-without-transcript actions, never on an
// empty transcript. Everything runs offline against scripts/lib/mock_ai_providers.cjs with a fetch
// tripwire; the real 38 s speech fixture supplies the audio energy.

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { createHarness, mkTmp, makeSettings } = require("./lib/video_edit_test_utils.cjs");
const { startMockProviders, mp3DurationSec } = require("./lib/mock_ai_providers.cjs");
const FX = require("./video_edit_fixtures.js");
const stt = require("../src/video_edit/ai/openrouter_stt");
const kie = require("../src/video_edit/ai/kie_jobs");
const chain = require("../src/video_edit/analysis/stt/chain");
const chunker = require("../src/video_edit/analysis/stt/chunker");
const merge = require("../src/video_edit/analysis/stt/merge");
const islandChat = require("../src/video_edit/analysis/stt/island_chat");
const disfluency = require("../src/video_edit/analysis/stt/disfluency");
const kieScribe = require("../src/video_edit/analysis/stt/kie_scribe");
const proc = require("../src/video_edit/engine/proc");
const { actionsFor } = require("../src/video_edit/engine/runner");
const { getBreaker, resetBreakers, nextUtcMidnight } = require("../src/video_edit/providers/breaker");
const { isEditError } = require("../src/video_edit/errors");

const { t, section, run } = createHarness();
const tmp = mkTmp("ve-stt-");
const AUTH = { apiKey: "test-key-not-a-secret" };
const MAI = "microsoft/mai-transcribe-2";
const TURBO = "openai/whisper-large-v3-turbo";
const DEEPGRAM = "deepgram/nova-3";
const MUSE = "meta/muse-spark-1.3-contributor";
const GEMINI = "google/gemini-3.5-flash";

const probe = FX.probeFixtures();
let mock, guard, wav, envelope, audioDoc, truth, projSeq = 0;

async function rejects(promise, code, check) {
  try { await promise; } catch (e) {
    assert.ok(isEditError(e), `expected EditError ${code}, got ${e && e.stack}`);
    assert.equal(e.code, code, `expected ${code}, got ${e.code} (${e.detail})`);
    if (check) check(e);
    return e;
  }
  throw new Error(`expected rejection with ${code}`);
}

function fresh() {
  mock.reset();
  resetBreakers();
  stt.resetBudgetCache();
}

function settingsFor(videoEdit = {}, env = {}) {
  return makeSettings(path.join(tmp.dir, "root"), {
    env: { VIDEO_EDIT_OPENROUTER_BASE: mock.openrouterBase, VIDEO_EDIT_KIE_BASE: mock.kieBase, ...env },
    videoEdit,
  });
}

function newProject() {
  return FX.makeProject(tmp.dir, { wav: probe.wav, name: `p${++projSeq}` });
}

function opts(settings, extra = {}) {
  const { projectDir } = extra.project || newProject();
  return {
    projectDir, settings, audio: audioDoc, envelope, durationSec: wav.durationSec, auth: AUTH, kieAuth: AUTH, pidFile: null,
    ...extra, project: extra.projectRecord || null,
  };
}

const sumCost = () => mock.calls.filter((c) => c.status === 200 && typeof c.cost === "number").reduce((a, c) => a + c.cost, 0);
const near = (a, b, eps = 1e-7) => Math.abs(a - b) <= eps;   // costs are rounded to 1e-8 USD
const norms = (words) => words.map((w) => merge.normText(w.text));

section("fixtures");

t("the real speech fixture is present (test-fixtures/video_edit/probe)", () => {
  assert.ok(probe, `missing ${FX.PROBE_DIR}/speech.wav — copy the probe sample there`);
  assert.equal(wav.sampleRate, 16000);
  assert.ok(wav.durationSec > 37 && wav.durationSec < 39);
  assert.ok(audioDoc.islands.length >= 6, `islands ${audioDoc.islands.length}`);
  assert.ok(truth.words.some((w) => w.filler && merge.normText(w.text) === "um"));
});

section("ai/openrouter_stt");

t("mai happy path: exact request shape, words normalized, ISO language, usage.cost", async () => {
  fresh();
  const settings = settingsFor();
  const r = await stt.transcribe({ model: MAI, audioPath: probe.mp3, settings, auth: AUTH, speechRatio: 0.8 });
  const call = mock.calls.find((c) => c.route === "stt");
  assert.equal(call.model, MAI);
  assert.equal(call.responseFormat, "verbose_json");
  assert.equal(call.format, "mp3");
  assert.equal(call.language, null, "mai gets no language unless forced");
  assert.equal(r.language, "en");
  assert.equal(r.words.length, truth.words.length, "mai keeps every filler and repeat");
  assert.ok(r.words.every((w) => w.text === w.text.trim() && w.end - w.start >= 0.02 - 1e-9));
  assert.ok(near(r.costUsd, call.cost) && r.costUsd > 0 && r.costKnown);
  assert.ok(r.segments.length === 1);
});

t("whisper-1 / turbo quirks: leading spaces trimmed, zero-length words clamped to 20 ms, language names → ISO", async () => {
  fresh();
  const settings = settingsFor();
  const one = await stt.transcribe({ model: "openai/whisper-1", audioPath: probe.mp3, settings, auth: AUTH });
  assert.equal(one.languageRaw, "english");
  assert.equal(one.language, "en");
  assert.ok(one.words.every((w) => w.end - w.start >= 0.02 - 1e-9), "zero-length words clamped");
  const turbo = await stt.transcribe({ model: TURBO, audioPath: probe.mp3, settings, auth: AUTH });
  assert.ok(turbo.words.length && turbo.words.every((w) => !/^\s/.test(w.text)));
  assert.ok(!norms(turbo.words).includes("um"), "turbo drops fillers (mock mirrors the live finding)");
  assert.equal(stt.normalizeLanguage("multi"), null);
  assert.equal(stt.normalizeLanguage("Spanish"), "es");
});

t("HTTP errors are classified for the breaker (400/401/402/429/5xx, empty transcript)", async () => {
  fresh();
  const settings = settingsFor();
  const call = (model, extra = {}) => stt.transcribe({ model, audioPath: probe.mp3, settings, auth: AUTH, ...extra });
  await rejects(call("openai/gpt-4o-mini-transcribe"), "STT_MODEL_UNSUPPORTED", (e) => {
    assert.equal(e.errorClass, "config"); assert.equal(e.extra.scope, "model"); assert.equal(e.extra.httpStatus, 400);
  });
  mock.enqueue("stt", { status: 401, json: { error: { message: "No auth", code: 401 } } });
  await rejects(call(MAI), "STT_AUTH", (e) => { assert.equal(e.errorClass, "config"); assert.equal(e.extra.scope, "provider"); });
  mock.enqueue("stt", { status: 402, json: { error: { message: "Insufficient credits", code: 402 } } });
  await rejects(call(MAI), "STT_PAYMENT_REQUIRED", (e) => { assert.equal(e.errorClass, "budget"); assert.equal(e.extra.scope, "provider"); });
  mock.enqueue("stt", { status: 429, headers: { "Retry-After": "7" }, json: { error: { message: "slow down", code: 429 } } });
  await rejects(call(MAI), "STT_RATE_LIMITED", (e) => { assert.equal(e.errorClass, "transient"); assert.equal(e.extra.retryAfterSec, 7); });
  mock.enqueue("stt", { status: 429, headers: { "Retry-After": "600" }, json: {} });
  await rejects(call(MAI), "STT_RATE_LIMITED", (e) => assert.equal(e.extra.retryAfterSec, 60, "Retry-After capped at 60 s"));
  mock.enqueue("stt", { status: 503, json: { error: { message: "upstream", code: 503 } } });
  await rejects(call(MAI), "STT_HTTP", (e) => assert.equal(e.errorClass, "transient"));
  mock.enqueue("stt", { status: 200, json: { text: "", words: [], usage: { seconds: 39, cost: 0.0027 } } });
  await rejects(call(DEEPGRAM, { speechRatio: 0.7 }), "EMPTY_TRANSCRIPT", (e) => {
    assert.equal(e.errorClass, "provider"); assert.equal(e.extra.costUsd, 0.0027, "billed empty reply still carries its cost");
  });
  mock.enqueue("stt", { status: 200, text: "<html>gateway</html>" });
  await rejects(call(MAI), "STT_BAD_RESPONSE", (e) => assert.equal(e.errorClass, "provider"));
});

t("deepgram without language returns an empty 200 for non-English speech (mock mirrors live)", async () => {
  fresh();
  mock.setTruth({ ...truth, language: "es" });
  try {
    const r = await stt.transcribe({ model: DEEPGRAM, audioPath: probe.mp3, settings: settingsFor(), auth: AUTH });
    assert.deepEqual(r.words, []);
    assert.ok(r.costUsd > 0, "and it is billed");
    const withLang = await stt.transcribe({ model: DEEPGRAM, audioPath: probe.mp3, settings: settingsFor(), auth: AUTH, language: "multi" });
    assert.ok(withLang.words.length > 10);
  } finally { mock.setTruth(truth); }
});

t("checkBudget takes the larger of per-key remaining and account balance, caches, honours budget:low", async () => {
  fresh();
  mock.setBudget({ limitRemaining: 0.01, totalCredits: 20, totalUsage: 5 });
  const b = await stt.checkBudget({ settings: settingsFor(), auth: AUTH });
  assert.equal(b.remaining, 15);
  mock.setBudget({ limitRemaining: 0.01, totalCredits: 0, totalUsage: 0 });
  assert.equal((await stt.checkBudget({ settings: settingsFor(), auth: AUTH })).remaining, 15, "cached for 60 s");
  assert.equal(mock.count({ route: "key" }), 1);
  const low = await stt.checkBudget({ settings: settingsFor({}, { VIDEO_EDIT_FAULTS: "budget:low" }), auth: AUTH });
  assert.equal(low.remaining, 0.1);
});

section("ai/kie_jobs");

t("upload → createTask → poll to success; resultJson parsed defensively (spacing / audio_event dropped)", async () => {
  fresh();
  const settings = settingsFor();
  mock.setKie({ mode: "success", waitPolls: 2 });
  const url = await kie.uploadFile(probe.mp3, { fileName: "c0.mp3", settings, auth: AUTH });
  assert.ok(url.startsWith(mock.baseUrl));
  const { taskId } = await kie.createTask({ model: "elevenlabs/speech-to-text", input: { audio_url: url, tag_audio_events: true }, settings, auth: AUTH });
  const states = [];
  const r = await kie.pollTask(taskId, { pollMs: 10, stallMs: 5000, maxWaitMs: 5000, settings, auth: AUTH, onState: (s) => states.push(s) });
  assert.deepEqual(states, ["waiting", "success"]);
  assert.ok(near(r.costUsd, 2.2 * kie.KIE_CREDIT_USD));
  const parsed = kieScribe.extractScribeWords(r.result);
  assert.equal(parsed.language, "en", "ISO-639-3 eng → en");
  assert.equal(parsed.words.length, truth.words.length);
  assert.ok(!parsed.words.some((w) => w.text === "(breath)" || w.text === ""));
});

t("createTask HTTP 200 with body code 500 → KIE_CREATE_FAILED (provider)", async () => {
  fresh();
  mock.setKie({ mode: "create500" });
  await rejects(kie.createTask({ model: "elevenlabs/speech-to-text", input: { audio_url: "https://x/y.mp3" }, settings: settingsFor(), auth: AUTH }), "KIE_CREATE_FAILED", (e) => {
    assert.equal(e.errorClass, "provider"); assert.equal(e.extra.bodyCode, 500);
  });
});

t("stall → KIE_STALL, fail state → KIE_FAIL with failMsg, poll errors tolerated, max wait → KIE_TIMEOUT", async () => {
  fresh();
  const settings = settingsFor();
  const create = async () => (await kie.createTask({ model: "elevenlabs/speech-to-text", input: { audio_url: "https://x/y.mp3" }, settings, auth: AUTH })).taskId;
  mock.setKie({ mode: "stall" });
  await rejects(kie.pollTask(await create(), { pollMs: 10, stallMs: 120, maxWaitMs: 5000, settings, auth: AUTH }), "KIE_STALL");
  mock.setKie({ mode: "fail", waitPolls: 1 });
  await rejects(kie.pollTask(await create(), { pollMs: 10, stallMs: 5000, maxWaitMs: 5000, settings, auth: AUTH }), "KIE_FAIL", (e) => {
    assert.match(e.detail, /upstream API service timed out/); assert.equal(e.extra.failCode, "500");
  });
  mock.setKie({ mode: "success", waitPolls: 0 });
  const id = await create();
  mock.enqueue("kie:record", { status: 502, text: "bad gateway", times: 2 });
  const ok = await kie.pollTask(id, { pollMs: 10, stallMs: 5000, maxWaitMs: 5000, settings, auth: AUTH });
  assert.equal(ok.state, "success");
  mock.setKie({ mode: "generating" });
  await rejects(kie.pollTask(await create(), { pollMs: 10, stallMs: 50, maxWaitMs: 150, settings, auth: AUTH }), "KIE_TIMEOUT", () => {});
});

t("parseResultJson / extractScribeWords accept every plausible shape", () => {
  assert.equal(kie.parseResultJson(""), null);
  assert.equal(kie.parseResultJson("not json"), null);
  assert.deepEqual(kie.parseResultJson({ a: 1 }), { a: 1 });
  assert.deepEqual(kie.parseResultJson(JSON.stringify(JSON.stringify({ words: [] }))), { words: [] });
  const shapes = [
    { results: { words: [{ word: "hola", start_time: 0.1, end_time: 0.4 }] }, languageCode: "spa" },
    { transcript: { words: [{ text: "hola", start: 0.1, end: 0.4, type: "word" }, { text: " ", start: 0.4, end: 0.5, type: "spacing" }] }, language_code: "es" },
    { resultObject: { words: [{ text: "hola", start: 0.1, end: 0.4 }], language_code: "spa" } },
  ];
  for (const s of shapes) {
    const r = kieScribe.extractScribeWords(s);
    assert.deepEqual(r.words, [{ text: "hola", start: 0.1, end: 0.4 }]);
    assert.equal(r.language, "es");
  }
});

section("chunker · merge · validation");

t("planChunks: one chunk ≤ chunkMaxSec; longer audio cut at silence midpoints, never inside an island", () => {
  assert.deepEqual(chunker.planChunks({ durationSec: 538, targetSec: 240, maxSec: 540 }), [{ index: 0, start: 0, end: 538 }]);
  const long = chunker.planChunks({ durationSec: 1000, silences: [{ start: 230, end: 232 }, { start: 250, end: 256 }, { start: 470, end: 471 }], targetSec: 240, maxSec: 540 });
  assert.equal(long[0].end, 253, "longest silence in [210, 270] → its midpoint");
  assert.ok(long.every((c) => c.end - c.start <= 540 + 1e-6));
  assert.equal(long[long.length - 1].end, 1000);
  const plan = chunker.planChunks({ durationSec: wav.durationSec, islands: audioDoc.islands, silences: audioDoc.silences, envelope, targetSec: 12, maxSec: 20 });
  assert.ok(plan.length >= 2);
  for (let k = 1; k < plan.length; k++) {
    const cut = plan[k].start;
    assert.equal(plan[k - 1].end, cut, "disjoint and contiguous");
    assert.ok(!audioDoc.islands.some((i) => cut > i.start + 1e-6 && cut < i.end - 1e-6), `cut ${cut} inside an island`);
  }
});

t("encodeChunk: ffmpeg via engine/proc → work/chunks/c<n>.mp3, mp3 16 kHz mono ≈ 48 kbps, exact span", async () => {
  const { projectDir } = newProject();
  const out = await chunker.encodeChunk({ projectDir, chunk: { index: 3, start: 5, end: 15 }, pidFile: null });
  assert.equal(out.rel, "work/chunks/c3.mp3");
  const info = await proc.ffprobeJson(["-show_streams", "-of", "json", out.abs], { pidFile: null, timeoutMs: 20000 });
  const a = info.streams[0];
  assert.equal(a.codec_name, "mp3");
  assert.equal(Number(a.sample_rate), 16000);
  assert.equal(a.channels, 1);
  assert.ok(Math.abs(Number(a.bit_rate) - 48000) <= 8000, `bit_rate ${a.bit_rate}`);
  assert.ok(Math.abs(mp3DurationSec(fs.readFileSync(out.abs)) - 10) < 0.15);
  assert.deepEqual(fs.readdirSync(path.join(projectDir, "work", "chunks")), ["c3.mp3"], "no temp file left behind");
});

t("validateTranscript: monotonic, ≥ 60 % island coverage, ≤ 3 % out of range, ≤ 25 chars/s", () => {
  const islands = [{ start: 0, end: 4 }];
  const words = [0, 1, 2, 3].map((s) => ({ text: "word", start: s, end: s + 0.8 }));
  assert.equal(chain.validateTranscript(words, { chunkDur: 5, islands }).ok, true);
  assert.equal(chain.validateTranscript([words[2], words[0], words[1], words[3]], { chunkDur: 5, islands }).reason, "NON_MONOTONIC");
  assert.equal(chain.validateTranscript(words.slice(0, 1), { chunkDur: 5, islands }).reason, "LOW_COVERAGE");
  assert.equal(chain.validateTranscript([...words, { text: "late", start: 9, end: 9.5 }], { chunkDur: 5, islands }).reason, "OUT_OF_RANGE");
  assert.equal(chain.validateTranscript([{ text: "x".repeat(120), start: 0, end: 4 }], { chunkDur: 5, islands }).reason, "TOO_FAST");
  assert.equal(chain.validateTranscript([], { chunkDur: 5, islands }).reason, "EMPTY");
  assert.equal(chain.validateTranscript([], { chunkDur: 5, islands: [] }).ok, true, "a silent chunk may be empty");
  assert.equal(chain.validateTranscript([], { chunkDur: 5, islands: null }).ok, false, "unknown speech: empty is a failure");
});

t("merge: chunk offsets, trimming, punctuation attach, spaced tokens split, ≥ 40 ms, conf, language votes", () => {
  const m = merge.mergeChunks([
    { index: 1, start: 10, end: 20, engine: "islands", timing: "approx", language: "en", words: [{ text: "later", start: 1, end: 1.5, conf: 0.4 }, { text: "gone", start: 12, end: 12.4 }] },
    { index: 0, start: 0, end: 10, engine: "mai", timing: "word", language: "en", words: [
      { text: "Hello", start: 0.5, end: 0.9 }, { text: ",", start: 0.9, end: 0.9 }, { text: "New York", start: 1.0, end: 1.6 }, { text: "a", start: 2, end: 2.01 },
    ] },
  ]);
  assert.deepEqual(m.words.map((w) => w.text), ["Hello,", "New", "York", "a", "later"]);
  assert.equal(m.words[4].start, 11, "chunk offset added");
  assert.ok(m.words[3].end - m.words[3].start >= 0.04 - 1e-9);
  assert.equal(m.words[0].conf, 0.95);
  assert.equal(m.words[4].conf, 0.4);
  assert.equal(m.timing, "approx");
  assert.deepEqual(m.engines, ["mai", "islands"]);
  assert.equal(m.language, "en");
  const fin = merge.finalizeWords(m.words);
  assert.deepEqual(fin.map((w) => w.i), [0, 1, 2, 3, 4]);
  assert.equal(fin[0].norm, "hello");
});

section("island chat");

t("island schema: letter ids, every requested id present, unknown / duplicate ids rejected", () => {
  assert.deepEqual([0, 1, 25, 26, 27, 701, 702].map(islandChat.letterId), ["A", "B", "Z", "AA", "AB", "ZZ", "AAA"]);
  const schema = islandChat.buildIslandSchema(["A", "B"]);
  const isl = (id) => ({ id, speech: true, words: [{ w: "hi" }], conf: 0.9 });
  assert.equal(schema.safeParse({ islands: [isl("A"), isl("B")] }).success, true);
  const missing = schema.safeParse({ islands: [isl("A")] });
  assert.equal(missing.success, false);
  assert.match(JSON.stringify(missing.error.issues), /missing island ids B/);
  assert.equal(schema.safeParse({ islands: [isl("A"), isl("i100:00")] }).success, false);
  assert.equal(schema.safeParse({ islands: [isl("A"), isl("A")] }).success, false);
  assert.deepEqual(islandChat.audioPart("kie:gemini-3.6-flash", "QUJD").type, "image_url");
  assert.match(islandChat.audioPart("kie:gemini-3.6-flash", "QUJD").image_url.url, /^data:audio\/wav;base64,QUJD$/);
  assert.equal(islandChat.audioPart(MUSE, "QUJD").type, "input_audio");
});

t("renamed ids → one repair re-ask → escalation to the escalation model; words aligned inside islands", async () => {
  fresh();
  const settings = settingsFor();
  const { projectDir, wavAbs } = newProject();
  mock.setChatModel(MUSE, { badIdsTimes: 2 });
  const islands = audioDoc.islands.filter((i) => i.end <= 16);
  const res = await islandChat.transcribeIslands({
    islands, wavAbs, settings, chat: stt.createDirectChat({ settings, auth: AUTH }),
    envelope, floorDb: audioDoc.floorDb, speechDb: audioDoc.speechDb, languageHint: "en",
  });
  const chats = mock.calls.filter((c) => c.route === "chat");
  assert.equal(chats[0].model, MUSE); assert.ok(chats[0].badIds);
  assert.equal(chats[1].model, MUSE); assert.ok(chats[1].repair && chats[1].badIds, "exactly one repair re-ask");
  assert.equal(chats[2].model, GEMINI); assert.ok(!chats[2].badIds);
  assert.ok(chats[0].islandIds.every((id) => /^[A-Z]+$/.test(id)));
  assert.ok(chats[0].audioPartTypes.every((x) => x === "input_audio"));
  assert.equal(res.escalations, 1);
  assert.ok(res.models.includes(GEMINI));
  const words = res.islands.flatMap((i) => i.words);
  assert.ok(words.length >= 20, `words ${words.length}`);
  for (const i of res.islands) for (const w of i.words) assert.ok(w.start >= i.start - 1e-6 && w.end <= i.end + 1e-6 && w.end >= w.start);
  assert.ok(near(res.costUsd, sumCost()), "chat usage.cost summed");
  assert.equal(fs.existsSync(path.join(projectDir, "work", "islands")), false, "clips are extracted in memory");
});

t("kie: island model sends audio as image_url data URIs", async () => {
  fresh();
  const settings = settingsFor({ providers: { islands: { model: "kie:gemini-3.6-flash" } } });
  const { projectDir, wavAbs } = newProject();
  await islandChat.transcribeIslands({
    islands: audioDoc.islands.slice(0, 2), wavAbs, settings,
    chat: stt.createDirectChat({ settings, auth: AUTH }), envelope, floorDb: audioDoc.floorDb,
  });
  const c = mock.calls.find((x) => x.route === "chat");
  assert.equal(c.model, "kie:gemini-3.6-flash");
  assert.ok(c.audioPartTypes.length === 2 && c.audioPartTypes.every((x) => x === "image_url"));
});

section("disfluency recovery");

t("an uncovered voiced region gets its filler back (inserted, conf 0.7, spanning the region)", async () => {
  fresh();
  const settings = settingsFor();
  const { projectDir, wavAbs } = newProject();
  const noFillers = truth.words.filter((w) => !w.filler).map((w, k) => ({ ...w, chunk: 0, engine: "whisper_turbo", i: k }));
  const regions = disfluency.findUncoveredVoiced(noFillers, envelope, { floorDb: audioDoc.floorDb });
  const umRegion = regions.find((r) => r.start < 5.24 && r.end > 4.06);
  assert.ok(umRegion, `no region near the first "um": ${JSON.stringify(regions)}`);
  const res = await disfluency.recoverDisfluencies({
    words: noFillers, envelope, floorDb: audioDoc.floorDb, speechDb: audioDoc.speechDb, durationSec: wav.durationSec, wavAbs,
    settings, chat: stt.createDirectChat({ settings, auth: AUTH }), languageHint: "en",
  });
  assert.equal(res.failed, false);
  const um = res.inserted.find((w) => merge.normText(w.text) === "um" && w.start >= umRegion.start - 1e-6 && w.end <= umRegion.end + 1e-6);
  assert.ok(um, `inserted: ${JSON.stringify(res.inserted)}`);
  assert.equal(um.conf, 0.7);
  assert.ok(um.isFiller && um.inserted);
  assert.ok(!res.inserted.some((w) => !w.isFiller && noFillers.some((n) => merge.normText(n.text) === merge.normText(w.text) && Math.abs(n.start - w.start) < 0.5)), "never a copy of a neighbour");
  assert.ok(res.words.length === noFillers.length + res.inserted.length);
});

t("untrusted boundaries: a word that swallowed a pause starts after it", () => {
  const rms = new Float32Array(300).fill(-20);
  for (let i = 100; i < 130; i++) rms[i] = -70;
  const out = disfluency.splitFoldedWords([{ text: "So", start: 0.8, end: 1.8 }], { rms, hop: 0.01 }, { floorDb: -70, isUntrusted: () => true });
  assert.equal(out[0].start, 1.3);
  assert.equal(disfluency.splitFoldedWords([{ text: "So", start: 0.8, end: 1.8 }], { rms, hop: 0.01 }, { floorDb: -70, isUntrusted: () => false })[0].start, 0.8);
});

section("chain");

t("default order: mai accepted, KIE disabled by default (zero KIE requests), checkpoint + cost + transcript doc", async () => {
  fresh();
  const settings = settingsFor();
  assert.equal(settings.providers.stt.kieEnabled, false);
  assert.deepEqual(chain.engineOrder(chain.sttSettings(settings)), ["mai", "whisper_turbo", "deepgram", "islands"]);
  const tracked = [];
  const costs = [];
  const o = opts(settings, { tracker: { addLlm: (e) => tracked.push(e) }, onCost: (e) => costs.push(e) });
  const r = await chain.transcribeProject(o);
  assert.deepEqual(r.engines, ["mai"]);
  assert.equal(r.timing, "word");
  assert.equal(r.language, "en");
  assert.equal(r.languageSource, "detected");
  assert.equal(mock.count({ route: "kie:upload" }) + mock.count({ route: "kie:create" }) + mock.count({ route: "kie:record" }), 0);
  assert.ok(r.words.length >= truth.words.length);
  assert.ok(norms(r.words).includes("um") && norms(r.words).includes("uh"));
  r.words.forEach((w, k) => { assert.equal(w.i, k); if (k) assert.ok(w.start >= r.words[k - 1].start); });
  assert.ok(near(r.costUsd, sumCost()), `cost ${r.costUsd} vs mock ${sumCost()}`);
  assert.ok(near(costs.reduce((a, c) => a + c.costUsd, 0), r.costUsd));
  assert.ok(tracked.some((e) => e.stage === "ve_stt" && e.costUsd > 0));
  const cp = JSON.parse(fs.readFileSync(path.join(o.projectDir, "analysis", "stt", "chunk-0.json"), "utf8"));
  assert.equal(cp.engine, "mai");
  assert.equal(cp.model, MAI);
  const doc = chain.transcriptDoc(r);
  assert.deepEqual(Object.keys(doc).sort(), ["engines", "language", "languageSource", "schemaVersion", "timing", "words"]);
  assert.ok(r.discoveries.words === r.words.length && r.discoveries.wpm > 60);
});

t("verbose_json 400 → next engine (whisper_turbo) → disfluency recovery restores the dropped fillers", async () => {
  fresh();
  const settings = settingsFor({ providers: { stt: { maiModel: "openai/gpt-4o-mini-transcribe" } } });
  const o = opts(settings);
  const r = await chain.transcribeProject(o);
  assert.deepEqual(r.engines, ["whisper_turbo"]);
  assert.equal(r.chunks[0].attempts[0].code, "STT_MODEL_UNSUPPORTED");
  assert.ok(r.fallbacks.includes("stt:c0:mai>whisper_turbo"));
  assert.equal(getBreaker("openrouter_stt:openai/gpt-4o-mini-transcribe").state().state, "open", "model breaker (config)");
  assert.equal(getBreaker("openrouter_stt").state().state, "closed", "the provider stays usable");
  assert.ok(r.disfluency.ran && r.disfluency.inserted >= 1, JSON.stringify(r.disfluency));
  assert.ok(r.words.some((w) => w.inserted && w.norm === "um"));
  assert.ok(!r.notices.some((n) => n.code === "FILLERS_LIMITED"));
});

t("deepgram always gets a language ('multi' when unknown); an empty billed reply fails validation → islands (approx)", async () => {
  fresh();
  const settings = settingsFor({ providers: { stt: { order: ["deepgram", "islands"] } } });
  const ok = await chain.transcribeProject({ ...opts(settings), recoverFillers: false });
  assert.deepEqual(ok.engines, ["deepgram"]);
  assert.equal(mock.calls.find((c) => c.route === "stt").language, "multi");

  fresh();
  mock.enqueue(`stt:${DEEPGRAM}`, { status: 200, json: { text: "", usage: { seconds: 38.1, cost: 0.0027 }, duration: 38.1, segments: [{ id: 0, start: 0, end: 38.1, text: "" }], words: [] } });
  const r = await chain.transcribeProject({ ...opts(settings), recoverFillers: false });
  assert.deepEqual(r.engines, ["islands"]);
  assert.equal(r.timing, "approx");
  assert.equal(r.chunks[0].attempts[0].code, "EMPTY_TRANSCRIPT");
  assert.ok(r.notices.some((n) => n.code === "TIMING_APPROX"));
  assert.ok(near(r.costUsd, sumCost()) && r.costUsd >= 0.0027, "billed empty reply counted");
  assert.ok(r.words.length >= truth.words.length * 0.8, `islands words ${r.words.length}`);
});

t("KIE (enabled) stall → islands; taskId persisted before polling, pending record removed", async () => {
  fresh();
  const settings = settingsFor({ providers: { stt: { order: ["kie", "islands"], kieEnabled: true, kiePollMs: 20, kieStallMs: 200, kieMaxWaitMs: 3000 } } });
  const tasks = [];
  const o = opts(settings, { onProviderTask: (x) => { tasks.push({ ...x, createCallsAtPersist: mock.count({ route: "kie:create" }), pollsAtPersist: mock.count({ route: "kie:record" }) }); } });
  const r = await chain.transcribeProject({ ...o, recoverFillers: false });
  assert.deepEqual(r.engines, ["islands"]);
  assert.equal(r.chunks[0].attempts[0].code, "KIE_STALL");
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].taskId, mock.calls.find((c) => c.route === "kie:create").taskId);
  assert.equal(tasks[0].pollsAtPersist, 0, "persisted before the first poll");
  assert.equal(fs.existsSync(path.join(o.projectDir, "analysis", "stt", "chunk-0.kie.json")), false);
  assert.ok(mock.count({ route: "chat" }) >= 1);
});

t("a persisted KIE task is re-polled on resume, never re-created", async () => {
  fresh();
  const settings = settingsFor({ providers: { stt: { order: ["kie"], kieEnabled: true, kiePollMs: 20, kieStallMs: 2000, kieMaxWaitMs: 3000 } } });
  mock.setKie({ mode: "success", waitPolls: 1 });
  const project = newProject();
  const url = await kie.uploadFile(probe.mp3, { settings, auth: AUTH });
  const { taskId } = await kie.createTask({ model: "elevenlabs/speech-to-text", input: { audio_url: url }, settings, auth: AUTH });
  const planned = chain.planFor({ durationSec: wav.durationSec, audio: audioDoc, envelope, settings });
  fs.writeFileSync(path.join(project.projectDir, "analysis", "stt", "chunk-0.kie.json"), JSON.stringify({
    schemaVersion: 1, provider: "kie", model: "elevenlabs/speech-to-text", taskId, chunk: 0, start: planned[0].start, end: planned[0].end, createdAt: Date.now(),
  }));
  const before = { up: mock.count({ route: "kie:upload" }), create: mock.count({ route: "kie:create" }) };
  const r = await chain.transcribeProject({ ...opts(settings, { project }), recoverFillers: false });
  assert.deepEqual(r.engines, ["kie"]);
  assert.equal(mock.count({ route: "kie:create" }), before.create, "no second task");
  assert.equal(mock.count({ route: "kie:upload" }), before.up, "no second upload");
  assert.ok(near(r.costUsd, 2.2 * kie.KIE_CREDIT_USD));
});

t("per-chunk checkpoints: a retry re-transcribes only the missing chunk", async () => {
  fresh();
  const settings = settingsFor({ providers: { stt: { order: ["mai"], chunkTargetSec: 12, chunkMaxSec: 20 } } });
  const plan = chain.planFor({ durationSec: wav.durationSec, audio: audioDoc, envelope, settings });
  assert.ok(plan.length >= 3, `plan ${JSON.stringify(plan)}`);
  const badDur = plan[1].end - plan[1].start;
  mock.useChunkPlan(plan);
  mock.enqueue(`stt:${MAI}`, (ctx) => (Math.abs(ctx.durationSec - badDur) < Math.abs(ctx.durationSec - (plan[0].end - plan[0].start)) - 1e-6
    && Math.abs(ctx.durationSec - badDur) < Math.abs(ctx.durationSec - (plan[2].end - plan[2].start)) - 1e-6
    ? { status: 503, json: { error: { message: "upstream", code: 503 } } } : undefined));
  const project = newProject();
  const err = await rejects(chain.transcribeProject({ ...opts(settings, { project }), recoverFillers: false }), "STT_FAILED", (e) => {
    assert.equal(e.errorClass, "provider");
    assert.equal(e.retryable, true);
    assert.deepEqual(e.extra.actions, ["retry", "continue_without_transcript"]);
    assert.equal(e.extra.chunk, 1);
  });
  assert.deepEqual(actionsFor(err, false), ["retry", "continue_without_transcript"]);
  const cps = fs.readdirSync(path.join(project.projectDir, "analysis", "stt")).sort();
  assert.ok(cps.includes("chunk-0.json") && !cps.includes("chunk-1.json") && cps.includes(`chunk-${plan.length - 1}.json`), cps.join());
  assert.equal(mock.count({ route: "stt" }), plan.length);

  mock.reset();
  resetBreakers();
  mock.useChunkPlan(plan);
  const r = await chain.transcribeProject({ ...opts(settings, { project }), recoverFillers: false });
  assert.equal(mock.count({ route: "stt" }), 1, "only chunk 1 was transcribed again");
  assert.equal(r.chunks.length, plan.length);
  assert.ok(r.words[0].start < 1 && r.words[r.words.length - 1].end > 35, "chunk offsets restored");
  assert.ok(r.words.some((w) => w.chunk === 1));
});

t("402 opens the OpenRouter breaker until the next UTC midnight and skips every OpenRouter engine", async () => {
  fresh();
  const T = Date.parse("2026-09-14T10:00:00Z");
  const now = () => T;
  const settings = settingsFor();
  mock.enqueue("stt", { status: 402, json: { error: { message: "Insufficient credits", code: 402 } } });
  const e1 = await rejects(chain.transcribeProject({ ...opts(settings), now }), "STT_FAILED");
  const b = getBreaker("openrouter_stt").state();
  assert.equal(b.state, "open");
  assert.equal(b.openUntil, nextUtcMidnight(T));
  assert.equal(mock.count({ route: "stt" }), 1, "whisper and deepgram never called");
  assert.equal(mock.count({ route: "chat" }), 0, "island chat on the same key skipped too");
  assert.deepEqual(e1.extra.attempts.map((a) => a.engine), ["mai", "whisper_turbo", "deepgram", "islands"]);
  await rejects(chain.transcribeProject({ ...opts(settings), now: () => T + 3600 * 1000 }), "STT_FAILED", (e) => {
    assert.ok(e.extra.attempts.slice(0, 3).every((a) => a.code === "BREAKER_OPEN"));
  });
  assert.equal(mock.count({ route: "stt" }), 1, "still skipped an hour later");
});

t("401 opens the provider breaker for 1 h (config) → enabled KIE takes over", async () => {
  fresh();
  const T = Date.parse("2026-09-14T10:00:00Z");
  const settings = settingsFor({ providers: { stt: { kieEnabled: true, kiePollMs: 20, kieStallMs: 2000, kieMaxWaitMs: 3000 } } });
  mock.setKie({ mode: "success", waitPolls: 1 });
  mock.enqueue("stt", { status: 401, json: { error: { message: "User not found", code: 401 } } });
  const r = await chain.transcribeProject({ ...opts(settings), now: () => T, recoverFillers: false });
  assert.deepEqual(r.engines, ["kie"]);
  assert.equal(mock.count({ route: "stt" }), 1);
  assert.equal(mock.count({ route: "kie:create" }), 1);
  const b = getBreaker("openrouter_stt").state();
  assert.equal(b.state, "open");
  assert.equal(b.openUntil, T + 60 * 60 * 1000);
});

t("429 Retry-After opens only that model for Retry-After seconds, then one half-open probe", async () => {
  fresh();
  let T = Date.parse("2026-09-14T10:00:00Z");
  const now = () => T;
  const settings = settingsFor();
  mock.enqueue(`stt:${MAI}`, { status: 429, headers: { "Retry-After": "7" }, json: { error: { message: "rate limited", code: 429 } } });
  const r1 = await chain.transcribeProject({ ...opts(settings), now, recoverFillers: false });
  assert.deepEqual(r1.engines, ["whisper_turbo"]);
  assert.equal(getBreaker(`openrouter_stt:${MAI}`).state().openUntil, T + 7000);
  T += 3000;
  const r2 = await chain.transcribeProject({ ...opts(settings), now, recoverFillers: false });
  assert.deepEqual(r2.engines, ["whisper_turbo"]);
  assert.equal(mock.count({ route: "stt", model: MAI }), 1, "mai skipped inside the Retry-After window");
  T += 5000;
  const r3 = await chain.transcribeProject({ ...opts(settings), now, recoverFillers: false });
  assert.deepEqual(r3.engines, ["mai"]);
  assert.equal(mock.count({ route: "stt", model: MAI }), 2, "probe after the window");
  assert.equal(getBreaker(`openrouter_stt:${MAI}`).state().state, "closed");
});

section("fault tokens → failure-matrix outcomes");

t("or_stt:500 → every OpenRouter engine fails (no HTTP sent) → islands, timing approx", async () => {
  fresh();
  const settings = settingsFor({}, { VIDEO_EDIT_FAULTS: "or_stt:500" });
  const r = await chain.transcribeProject({ ...opts(settings), recoverFillers: false });
  assert.deepEqual(r.engines, ["islands"]);
  assert.equal(mock.count({ route: "stt" }), 0);
  assert.deepEqual(r.chunks[0].attempts.map((a) => a.code), ["PROVIDER_HTTP", "PROVIDER_HTTP", "PROVIDER_HTTP"]);
  assert.equal(r.timing, "approx");
});

t("or_stt:drop_fillers → mai transcript without fillers → recovery inserts them", async () => {
  fresh();
  const settings = settingsFor({}, { VIDEO_EDIT_FAULTS: "or_stt:drop_fillers" });
  const r = await chain.transcribeProject(opts(settings));
  assert.deepEqual(r.engines, ["mai"]);
  assert.ok(r.words.filter((w) => w.inserted && w.isFiller).length >= 1, JSON.stringify(r.disfluency));
});

t("or_stt:no_words → EMPTY_TRANSCRIPT ×3 → islands", async () => {
  fresh();
  const settings = settingsFor({}, { VIDEO_EDIT_FAULTS: "or_stt:no_words" });
  const r = await chain.transcribeProject({ ...opts(settings), recoverFillers: false });
  assert.deepEqual(r.engines, ["islands"]);
  assert.deepEqual(r.chunks[0].attempts.map((a) => a.code), ["EMPTY_TRANSCRIPT", "EMPTY_TRANSCRIPT", "EMPTY_TRANSCRIPT"]);
});

t("kie_stt:create_fail → islands (upload happened, no task created)", async () => {
  fresh();
  const settings = settingsFor({ providers: { stt: { order: ["kie", "islands"], kieEnabled: true, kiePollMs: 20 } } }, { VIDEO_EDIT_FAULTS: "kie_stt:create_fail" });
  const r = await chain.transcribeProject({ ...opts(settings), recoverFillers: false });
  assert.deepEqual(r.engines, ["islands"]);
  assert.equal(r.chunks[0].attempts[0].code, "PROVIDER_CREATE_FAILED");
  assert.equal(mock.count({ route: "kie:create" }), 0);
});

t("or_stt:401 + islands:error → NEEDS_ATTENTION-shaped STT_FAILED with retry / continue_without_transcript", async () => {
  fresh();
  const settings = settingsFor({}, { VIDEO_EDIT_FAULTS: "or_stt:401,islands:error" });
  await rejects(chain.transcribeProject({ ...opts(settings), recoverFillers: false }), "STT_FAILED", (e) => {
    assert.equal(e.errorClass, "provider");
    assert.deepEqual(actionsFor(e, false), ["retry", "continue_without_transcript"]);
    assert.equal(e.stage, "TRANSCRIBING");
  });
  assert.equal(mock.count({ route: "stt" }) + mock.count({ route: "chat" }), 0);
});

t("islands:invalid_json → primary replies corrupted → escalation model transcribes", async () => {
  fresh();
  const settings = settingsFor({ providers: { stt: { order: ["islands"] } } }, { VIDEO_EDIT_FAULTS: "islands:invalid_json" });
  const r = await chain.transcribeProject({ ...opts(settings), recoverFillers: false });
  assert.deepEqual(r.engines, ["islands"]);
  assert.ok(mock.count({ route: "chat", model: GEMINI }) >= 1);
  assert.ok(r.words.length > 20);
});

t("budget:low → OpenRouter + island chat skipped until midnight → enabled KIE", async () => {
  fresh();
  mock.setKie({ mode: "success", waitPolls: 0 });
  const settings = settingsFor({ providers: { stt: { kieEnabled: true, kiePollMs: 20 } } }, { VIDEO_EDIT_FAULTS: "budget:low" });
  const r = await chain.transcribeProject({ ...opts(settings), recoverFillers: false });
  assert.deepEqual(r.engines, ["kie"]);
  assert.equal(mock.count({ route: "stt" }), 0);
  assert.equal(getBreaker("openrouter_chat").state().state, "open");
});

t("budget:cap → COST_CAP_REACHED (budget) before the next paid call", async () => {
  fresh();
  const settings = settingsFor({ providers: { stt: { order: ["mai"], chunkTargetSec: 12, chunkMaxSec: 20, concurrency: 1 } } }, { VIDEO_EDIT_FAULTS: "budget:cap:0.0001" });
  mock.useChunkPlan(chain.planFor({ durationSec: wav.durationSec, audio: audioDoc, envelope, settings }));
  await rejects(chain.transcribeProject({ ...opts(settings), recoverFillers: false }), "COST_CAP_REACHED", (e) => {
    assert.equal(e.errorClass, "budget");
    assert.deepEqual(e.extra.actions, ["retry", "continue_without_transcript"]);
  });
  assert.equal(mock.count({ route: "stt" }), 1, "stopped after the first paid call");
});

t("cancellation aborts without STT_FAILED and without writing a checkpoint", async () => {
  fresh();
  const settings = settingsFor();
  const ac = new AbortController();
  mock.enqueue(`stt:${MAI}`, () => { ac.abort(); return undefined; });
  const o = opts(settings, { signal: ac.signal });
  let err = null;
  try { await chain.transcribeProject({ ...o, recoverFillers: false }); } catch (e) { err = e; }
  assert.ok(err && isEditError(err) && err.errorClass === "cancelled", `got ${err && err.code}`);
  assert.equal(fs.existsSync(path.join(o.projectDir, "analysis", "stt", "chunk-0.json")), false);
});

section("isolation");

t("no request ever left for a non-mock host; every provider call carried auth", () => {
  assert.deepEqual(guard.blocked, []);
  assert.equal(mock.state.unauthorized, 0);
});

(async () => {
  let exit = 0;
  try {
    mock = await startMockProviders();
    guard = FX.installMockOnlyFetch(mock.baseUrl);
    if (probe) {
      wav = FX.readWav16(probe.wav);
      ({ envelope, audioDoc } = FX.analyzeSpeech(wav));
      truth = FX.truthFromGroundTruth(probe.groundTruth.en);
      mock.setTruth(truth);
      mock.setPcm(fs.readFileSync(probe.wav));
    }
    const { failed } = await run();
    exit = failed ? 1 : 0;
  } catch (e) {
    console.error(e);
    exit = 1;
  } finally {
    if (guard) guard.restore();
    if (mock) await mock.close();
    tmp.cleanup();
    process.exitCode = exit || process.exitCode || 0;
  }
})();
