// Unit tests for video_edit/broll scoring: slots, BM25-lite, technical fit, prior, dHash, contact sheet,
// judge, score and the phase-5 stage handlers.
// Run: node scripts/video_edit_broll_score.test.cjs
//      VIDEO_EDIT_BROLL_SHEET_OUT=<dir> node scripts/video_edit_broll_score.test.cjs   (keeps generated contact sheets)
//
// Load-bearing: a slot never lands on a faceRequired / CTA / hook-guard sentence and the slot count is the HIGH
// item budget + 30 %; the prior drops clips that cannot survive the export; near-identical thumbnails collapse
// to one; the judge sees ≤ 640 px lettered sheets, ≤ 3 per call, and its letters map back to the right clip even
// after a repair or an escalation; totals and thresholds follow ANALYSIS.md §8 (unsafe excluded, lexical-only
// never at LOW); two slots never share a clip; every candidate written is a schema-valid AssetRef.
// Offline: stock + thumbnail requests go to an injected fake fetch (recorded-shape fixtures in
// fixtures/video_edit_broll + ffmpeg lavfi pictures), the judge is a fake callJson or the real ai/llm.callJson
// over a fake chat, and the global fetch is a tripwire.

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { createHarness, mkTmp, makeSettings, installFetchTripwire, silentLog } = require("./lib/video_edit_test_utils.cjs");

const tmp = mkTmp("ve-broll-score-");
process.env.VIDEO_EDIT_DIR = path.join(tmp.dir, "_guard", "edits");
process.env.VIDEO_EDIT_INDEX = path.join(tmp.dir, "_guard", "video-edits.json");
const SHEET_OUT = process.env.VIDEO_EDIT_BROLL_SHEET_OUT || null;

const { buildSlots, capFor, cleanQuery: slotQuery } = require("../src/video_edit/broll/slots");
const { lexicalScores } = require("../src/video_edit/broll/lexical");
const { technicalFit } = require("../src/video_edit/broll/technical");
const { rankPrior } = require("../src/video_edit/broll/prior");
const { hashImages, dedupeByHash, hamming } = require("../src/video_edit/broll/dhash");
const { downloadThumb, frameUrls, buildContactSheet } = require("../src/video_edit/broll/contact_sheet");
const { judgeSlots, assignLetters, JUDGE_STAGE } = require("../src/video_edit/broll/judge");
const score = require("../src/video_edit/broll/score");
const { normalizeCandidate } = require("../src/video_edit/broll/common");
const pexels = require("../src/video_edit/broll/providers/pexels_raw");
const pixabay = require("../src/video_edit/broll/providers/pixabay_raw");
const openverse = require("../src/video_edit/broll/providers/openverse_raw");
const phase5 = require("../src/video_edit/engine/handlers/phase5");
const { createRegistry } = require("../src/video_edit/engine/stages");
const llm = require("../src/video_edit/ai/llm");
const { assertPayload } = require("../src/video_edit/ai/llm_guard");
const { AssetRefSchema } = require("../src/video_edit/plan/schema");
const { EditError, isEditError } = require("../src/video_edit/errors");
const { resetBreakers } = require("../src/video_edit/providers/breaker");
const { resetLimiters } = require("../src/video_edit/broll/rate_limit");
const { DEFAULT_SETTINGS } = require("../src/video_edit/settings_schema");
const fsx = require("../src/video_edit/fsx");
const util = require("../src/services/asset_sources/util");

const { t, section, run } = createHarness();
const keepAlive = setInterval(() => {}, 1000);
const restoreFetch = installFetchTripwire();
const tripwire = globalThis.fetch;
let globalFetchCalls = 0;
globalThis.fetch = (...args) => { globalFetchCalls++; return tripwire(...args); };

const FX = path.join(__dirname, "fixtures");
const fx = (name) => JSON.parse(fs.readFileSync(path.join(FX, "video_edit", `talking_head_45s.${name}.json`), "utf8"));
const bx = (name) => JSON.parse(fs.readFileSync(path.join(FX, "video_edit_broll", name), "utf8"));
const clone = (v) => JSON.parse(JSON.stringify(v));
const near = (a, b, eps = 1e-3) => assert.ok(Math.abs(a - b) <= eps, `expected ${a} ≈ ${b}`);
const KEYS = Object.freeze({ pexels: "test-pexels-key", pixabay: "test-pixabay-key" });
const LITE = "google/gemini-3.5-flash-lite";
const FLASH = "google/gemini-3.5-flash";
let seq = 0;
const scratch = (name) => { const d = path.join(tmp.dir, `${name}-${++seq}`); fs.mkdirSync(d, { recursive: true }); return d; };

async function rejects(p, check) {
  try { await (typeof p === "function" ? p() : p); } catch (e) { check(e); return e; }
  throw new Error("expected a rejection");
}

// ---- generated pictures (ffmpeg lavfi) -------------------------------------------------------------
const PIC = path.join(tmp.dir, "pics");
fs.mkdirSync(PIC, { recursive: true });
function ff(args) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostdin", "-loglevel", "error", "-y", ...args], { windowsHide: true, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${String(r.stderr).slice(-400)}`);
}
const SOURCES = ["testsrc2=s=320x180:r=1", "mandelbrot=s=320x180:r=1", "smptebars=s=320x180:r=1", "sierpinski=s=320x180:r=1:seed=3",
  "rgbtestsrc=s=320x180:r=1", "cellauto=s=320x180:r=1:rule=110:random_seed=5"];
const TRANSFORMS = [["n", "null"], ["h", "hflip"], ["v", "vflip"], ["x", "negate"]];
let POOL = null;
const P = {};
async function pictures() {
  if (POOL) return POOL;
  const graph = [];
  const outs = [];
  SOURCES.forEach((_, i) => {
    graph.push(`[${i}:v]split=${TRANSFORMS.length}${TRANSFORMS.map(([k]) => `[s${i}${k}]`).join("")}`);
    for (const [k, f] of TRANSFORMS) {
      graph.push(`[s${i}${k}]${f}[o${i}${k}]`);
      outs.push("-map", `[o${i}${k}]`, "-frames:v", "1", "-q:v", "3", path.join(PIC, `p${i}${k}.jpg`));
    }
  });
  ff([...SOURCES.flatMap((s) => ["-f", "lavfi", "-i", s]), "-filter_complex", graph.join(";"), ...outs]);
  P.near = path.join(PIC, "near.jpg");
  ff(["-f", "lavfi", "-i", SOURCES[0], "-vf", "eq=brightness=0.04:contrast=1.04", "-frames:v", "1", "-q:v", "3", P.near]);
  P.png = path.join(PIC, "base.png");
  ff(["-f", "lavfi", "-i", SOURCES[0], "-frames:v", "1", P.png]);
  P.grey = path.join(PIC, "grey.jpg");
  ff(["-f", "lavfi", "-i", "color=c=0x808080:s=320x180:r=1", "-frames:v", "1", "-q:v", "3", P.grey]);
  P.wide = path.join(PIC, "wide.jpg");
  ff(["-f", "lavfi", "-i", "testsrc2=s=800x400:r=1", "-frames:v", "1", "-q:v", "3", P.wide]);
  P.bad = path.join(PIC, "bad.jpg");
  fs.writeFileSync(P.bad, Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), Buffer.from("definitely not a jpeg body ".repeat(20))]));
  P.text = path.join(PIC, "text.jpg");
  fs.writeFileSync(P.text, "hello, I am a text file");
  P.base = path.join(PIC, "p0n.jpg");
  P.mandel = path.join(PIC, "p1n.jpg");
  const files = fs.readdirSync(PIC).filter((f) => /^p\d[nhvx]\.jpg$/.test(f)).sort().map((f) => path.join(PIC, f));
  const hs = await hashImages(files, { workDir: scratch("pool"), pidFile: null });
  POOL = [];
  for (const h of hs) if (h.dhash && h.stdev >= 5 && POOL.every((p) => hamming(p.dhash, h.dhash) > 12)) POOL.push(h);
  return POOL;
}

// ---- fake network ----------------------------------------------------------------------------------
const FIXTURE_FOR = {
  pexels_video: "pexels_videos.json", pexels_image: "pexels_photos.json",
  pixabay_video: "pixabay_videos.json", pixabay_image: "pixabay_images.json", openverse_image: "openverse_images.json",
};
function routeKey(u) {
  if (u.hostname === "api.pexels.com") return u.pathname.startsWith("/videos") ? "pexels_video" : "pexels_image";
  if (u.hostname === "pixabay.com" && u.pathname.startsWith("/api")) return u.pathname.startsWith("/api/videos") ? "pixabay_video" : "pixabay_image";
  if (u.hostname === "api.openverse.org" && !/\/thumb\/?$/.test(u.pathname)) return "openverse_image";
  return "thumb";
}
const jsonResponse = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });
const imageResponse = (buf, type = "image/jpeg", extra = {}) => new Response(buf, { status: 200, headers: { "content-type": type, "content-length": String(buf.length), ...extra } });

// Stock API → bare-name fixtures; thumbnails → pool pictures (URLs with the same alias share one picture).
function fakeFetch({ alias = () => null } = {}) {
  const calls = [];
  const assigned = new Map();
  const fn = async (url, init = {}) => {
    const u = new URL(url);
    calls.push(u.toString());
    if (init.signal && init.signal.aborted) throw init.signal.reason || new Error("aborted");
    const route = routeKey(u);
    if (route !== "thumb") return FIXTURE_FOR[route] ? jsonResponse(bx(FIXTURE_FOR[route])) : jsonResponse({ error: "no route" }, 404);
    const group = alias(u.toString()) || u.toString();
    if (!assigned.has(group)) assigned.set(group, POOL[assigned.size % POOL.length].file);
    return imageResponse(fs.readFileSync(assigned.get(group)));
  };
  fn.calls = calls;
  fn.thumbs = () => calls.filter((c) => routeKey(new URL(c)) === "thumb").length;
  return fn;
}

const rawPexelsVideos = () => bx("pexels_videos.json").videos.map((v, i) => pexels.mapVideo(v, { rank: i + 1 })).filter(Boolean);
const rawPixabayVideos = () => bx("pixabay_videos.json").hits.map((h, i) => pixabay.mapVideo(h, { rank: i + 1 })).filter(Boolean);
const rawPexelsPhotos = () => bx("pexels_photos.json").photos.map((p, i) => pexels.mapPhoto(p, { rank: i + 1 })).filter(Boolean);
const rawPixabayImages = () => bx("pixabay_images.json").hits.map((h, i) => pixabay.mapImage(h, { rank: i + 1 })).filter(Boolean);
const rawOpenverse = () => bx("openverse_images.json").results.map((r, i) => openverse.mapImage(r, { rank: i + 1 }).item).filter(Boolean);

// ---- fake judge --------------------------------------------------------------------------------------
function batchOf(user) {
  return (Array.isArray(user) ? user : []).filter((p) => p.type === "text" && /^SLOT /.test(p.text)).map((p) => ({
    slotId: /^SLOT (\S+)/.exec(p.text)[1],
    letters: [...((/Letters on this sheet: (.*)$/m.exec(p.text) || [])[1] || "").matchAll(/\b([A-Z]{1,2}) \((?:video|photo)/g)].map((m) => m[1]),
  }));
}
const rating = (id, over = {}) => ({ id, relevance: 8, literalMatch: true, quality: 7, issues: [], composition: 7, bestLayout: "FULL", ...over });
const replyFor = (batch, rate = () => ({})) => ({ slots: batch.map((s) => ({ slotId: s.slotId, cands: s.letters.map((id) => rating(id, rate(s.slotId, id))) })) });

function fakeJudge(rate = () => ({}), { costUsd = 0.0006, fail = null } = {}) {
  const calls = [];
  const fn = async (opts) => {
    calls.push(opts);
    if (fail) throw fail(opts, calls.length);
    const parsed = opts.schema.safeParse(replyFor(batchOf(opts.user), rate));
    if (!parsed.success) throw new EditError("LLM_INVALID_JSON", { errorClass: "provider", retryable: true, extra: { costUsd } });
    return { value: parsed.data, model: opts.model, costUsd, tokensIn: 900, tokensOut: 120, cached: false };
  };
  fn.calls = calls;
  return fn;
}
const spyBreaker = (open = true) => {
  const b = { failures: [], successes: 0, canRequest: () => open, recordFailure: (c) => { b.failures.push(c); }, recordSuccess: () => { b.successes++; } };
  return b;
};

let SHEET8 = null;
async function sheet8() {
  if (SHEET8) return SHEET8;
  await pictures();
  const cells = "ABCDEFGH".split("").map((letter, i) => ({
    letter, frames: i < 5 ? [POOL[i % POOL.length].file, POOL[(i + 1) % POOL.length].file, POOL[(i + 2) % POOL.length].file] : [POOL[i % POOL.length].file],
  }));
  const dir = scratch("sheet8");
  const r = await buildContactSheet({ cells, outFile: path.join(dir, "sheet8.jpg"), workDir: path.join(dir, "work"), pidFile: null });
  SHEET8 = r.file;
  return SHEET8;
}

// ---- slot fixtures ----------------------------------------------------------------------------------
function sentence(id, start, end, text, pauseAfter = 0.1, w0 = 0) {
  return { id, w0, w1: w0 + 4, start, end, text, pauseAfter, fillerCount: 0 };
}

// =====================================================================================================
section("slots — which sentences get a stock search");

t("fixture content: need ≥ .45, not faceRequired / CTA, ranked need × importance, ≤ 3 cleaned queries", async () => {
  const r = buildSlots({ content: fx("content"), transcript: fx("transcript"), words: fx("transcript.words").words, settings: clone(DEFAULT_SETTINGS) });
  assert.equal(r.source, "content");
  assert.deepEqual(r.slots.map((s) => s.slotId), ["sl_s8", "sl_s10", "sl_s4", "sl_s6", "sl_s5"]);
  assert.deepEqual(r.slots.map((s) => s.rank), [0, 1, 2, 3, 4]);
  for (let i = 1; i < r.slots.length; i++) assert.ok(r.slots[i - 1].priority >= r.slots[i].priority);
  const s8 = r.slots[0];
  near(s8.priority, 0.8 * 0.75, 1e-4);
  assert.equal(s8.w0, 77);
  assert.equal(s8.w1, 83);
  assert.ok(s8.outDurEstimate > 1 && s8.outDurEstimate < 2.2, `outDurEstimate ${s8.outDurEstimate}`);
  for (const s of r.slots) {
    assert.ok(s.queries.length >= 1 && s.queries.length <= 3);
    assert.ok(s.need >= 0.45);
    assert.equal(s.mediaPreference, "video");
  }
  // ANALYSIS.md §8: queries are "≤ 3 from visualNouns" — the content keyword "calendar" is judge context only
  // (slots.js: keywords never become stock queries), and two noun queries need no head-noun broadening.
  const s10 = r.slots.find((s) => s.slotId === "sl_s10");
  assert.deepEqual(s10.queries, ["calendar app", "time blocks"]);
  assert.ok(s10.keywords.includes("calendar"), "the keyword still travels to the judge");
  assert.deepEqual(r.slots.find((s) => s.slotId === "sl_s8").avoid, ["stock handshake"]);
  const why = Object.fromEntries(r.excluded.map((e) => [e.sentenceId, e.reason]));
  assert.equal(why.s1, "low_need"); // need .40
  assert.equal(why.s12, "low_need");
  assert.equal(r.cap, capFor(r.outputDurationSec));
});

t("faceRequired, CTA and the hook guard exclude a sentence whatever its need", async () => {
  const sents = [
    sentence("h1", 0.0, 2.4, "Robots now build most cars in the world.", 0.1, 0),
    sentence("h2", 2.5, 6.0, "Factories use robot arms for welding car doors.", 0.2, 5),
    sentence("f1", 6.2, 9.0, "Honestly I was scared I would lose my job.", 0.2, 10),
    sentence("c1", 9.2, 12.0, "Follow for more robot facts every week.", 0.0, 15),
    sentence("c2", 12.0, 15.0, "Grab the checklist from the link.", 0.0, 20),
  ];
  const content = {
    visualSupport: sents.map((s) => ({ sentenceId: s.id, need: 0.9, visualNouns: ["robot arm"], avoid: [] })),
    faceRequired: [{ sentenceId: "f1", reason: "personal" }, { sentenceId: "c1", reason: "cta" }],
    cta: { sentenceIds: ["c1"], text: "follow" },
    segments: [{ id: "g1", type: "POINT", sentenceIds: ["h1", "h2", "f1"], title: "x", importance: 0.8 }, { id: "g2", type: "CTA", sentenceIds: ["c2"], title: "y", importance: 0.5 }],
    keywords: [],
  };
  const r = buildSlots({ content, sentences: sents, settings: clone(DEFAULT_SETTINGS) });
  const why = Object.fromEntries(r.excluded.map((e) => [e.sentenceId, e.reason]));
  assert.deepEqual(r.slots.map((s) => s.sentenceId), ["h2"]);
  assert.equal(why.h1, "hook_guard"); // 2.4 s sentence leaves 0.9 s after the 1.5 s guard (< 1.2 s min item)
  assert.equal(why.f1, "face_required");
  assert.equal(why.c1, "face_required");
  assert.equal(why.c2, "cta"); // CTA segment
  // A sentence that merely STARTS inside the guard but runs past it still qualifies.
  const long = buildSlots({ content, sentences: [{ ...sents[0], end: 4.0 }, sents[1]], settings: clone(DEFAULT_SETTINGS) });
  assert.deepEqual(long.slots.map((s) => s.sentenceId), ["h1", "h2"]);
  // CTA from transcript detection alone.
  const det = buildSlots({ content: { ...content, cta: null, segments: [], faceRequired: [] }, transcript: { sentences: sents, ctaCandidates: [{ sentenceId: "h2" }] }, settings: clone(DEFAULT_SETTINGS) });
  assert.equal(Object.fromEntries(det.excluded.map((e) => [e.sentenceId, e.reason])).h2, "cta");
});

t("cap = ceil(HIGH items/60 s × output minutes × 1.3); the lowest priorities are dropped as 'cap'", async () => {
  assert.deepEqual([0, 10, 45, 60, 120].map((d) => capFor(d)), [1, 2, 7, 10, 19]);
  const sents = [];
  const vs = [];
  for (let i = 0; i < 30; i++) {
    sents.push(sentence(`s${i}`, i * 2, i * 2 + 1.9, `Robot arm number ${i} welds a car door.`, 0.1, i * 6));
    vs.push({ sentenceId: `s${i}`, need: 0.5 + i * 0.01, visualNouns: ["robot arm"], avoid: [] });
  }
  const r = buildSlots({ content: { visualSupport: vs, segments: [], faceRequired: [], keywords: [] }, sentences: sents, settings: clone(DEFAULT_SETTINGS) });
  near(r.outputDurationSec, 60, 1e-6);
  assert.equal(r.cap, 10);
  assert.equal(r.slots.length, 10);
  assert.deepEqual(r.slots.map((s) => s.sentenceId), Array.from({ length: 10 }, (_, k) => `s${29 - k}`));
  assert.equal(r.excluded.filter((e) => e.reason === "cap").length, 19);
  assert.equal(r.excluded.filter((e) => e.reason === "hook_guard").length, 1); // s0: 0–1.9 s
  const shorter = buildSlots({ content: { visualSupport: vs, segments: [], faceRequired: [], keywords: [] }, sentences: sents, settings: clone(DEFAULT_SETTINGS), output: { durationSec: 45 } });
  assert.equal(shorter.slots.length, 7);
});

t("queries: subjectQuery-filtered, acronyms kept, ≤ 3; image-friendly nouns allow stills unless images are off", async () => {
  assert.equal(slotQuery("camera slowly pans over AI robot arm"), "AI robot arm");
  assert.equal(slotQuery("5G tower at dusk"), "5G tower dusk");
  assert.equal(slotQuery("reunión de equipo", { lang: "es" }), "reunión equipo");
  assert.equal(slotQuery("会議室", { lang: "ja" }), "会議室");
  assert.equal(slotQuery("zoom in slowly"), "");
  const sents = [sentence("a", 3, 7, "Our AI robot arm cut defects by forty percent this year.")];
  const content = {
    visualSupport: [{ sentenceId: "a", need: 0.8, visualNouns: ["camera slowly pans over AI robot arm", "the robot arm", "5G tower", "bar chart"], avoid: [] }],
    segments: [], faceRequired: [], keywords: [{ term: "defects", sentenceIds: ["a"], salience: 0.5 }],
  };
  const r = buildSlots({ content, sentences: sents, settings: clone(DEFAULT_SETTINGS) });
  assert.deepEqual(r.slots[0].queries, ["AI robot arm", "robot arm", "5G tower"]);
  assert.equal(r.slots[0].mediaPreference, "either");
  const noImages = buildSlots({ content, sentences: sents, settings: { ...clone(DEFAULT_SETTINGS), broll: { enabled: true, intensity: "medium", allowImages: false } } });
  assert.equal(noImages.slots[0].mediaPreference, "video");
  const off = buildSlots({ content, sentences: sents, settings: { ...clone(DEFAULT_SETTINGS), broll: { enabled: false, intensity: "medium", allowImages: true } } });
  assert.equal(off.slots.length, 0);
  assert.deepEqual(off.excluded, [{ sentenceId: "a", reason: "disabled" }]);
  const junk = buildSlots({ content: { ...content, visualSupport: [{ sentenceId: "a", need: 0.8, visualNouns: ["slow zoom shot"], avoid: [] }], keywords: [] }, sentences: sents, settings: clone(DEFAULT_SETTINGS) });
  assert.deepEqual(junk.excluded, [{ sentenceId: "a", reason: "no_query" }]);
});

t("no content analysis → TF-IDF salience stands in for need, lexicon CTA and first-person faceRequired", async () => {
  const r = buildSlots({ content: null, transcript: fx("transcript"), words: fx("transcript.words").words, settings: clone(DEFAULT_SETTINGS) });
  assert.equal(r.source, "heuristic");
  assert.ok(r.slots.length >= 3);
  const why = Object.fromEntries(r.excluded.map((e) => [e.sentenceId, e.reason]));
  assert.equal(why.s12, "cta");
  assert.equal(why.s4, "face_required"); // "I, I check my inbox" — first person
  for (const s of r.slots) {
    assert.ok(s.need >= 0.45 && s.need <= 1);
    assert.ok(s.queries.length >= 1);
  }
});

// =====================================================================================================
section("lexical, technical and prior");

t("BM25-lite: full tag match > partial title match > unrelated slug; no text is unscored (null), not zero", async () => {
  const cands = [
    { tags: ["calendar", "planner", "schedule"] },
    { title: "Calendar on a desk" },
    { text: "woman typing on laptop" },
    {},
  ];
  const s = lexicalScores({ candidates: cands, queries: ["calendar planner"], sentenceKeywords: ["calendar", "meetings"] });
  assert.ok(s[0].lexical > s[1].lexical, JSON.stringify(s));
  assert.ok(s[1].lexical > s[2].lexical, JSON.stringify(s));
  assert.equal(s[2].lexical, 0);
  assert.equal(s[3].lexical, null);
  assert.ok(s[0].lexQuery >= 0.8);
  // lexical.js CONTRACT: relevance is measured against the SLOT's queries only — the query that fetched the
  // candidate is display/debug and never scored (a clip always matches its own query).
  const own = lexicalScores({ candidates: [{ tags: ["beach"], query: "beach" }], queries: ["calendar"] });
  assert.equal(own[0].lexQuery, 0);
});

t("stemming-lite en/es/fr/de/pt; hi/ar/ja queries score only against same-script (provider-translated) tags", async () => {
  const one = (lang, query, cand) => lexicalScores({ candidates: [cand, { title: "zzz unrelated" }], queries: [query], lang })[0].lexical;
  assert.ok(one("en", "phone notifications", { tags: ["notification", "phone"] }) > 0.8);
  assert.ok(one("es", "reuniones", { title: "Reunión de equipo" }) > 0.5);
  assert.ok(one("fr", "journaux", { title: "journal du matin" }) > 0.5);
  assert.ok(one("de", "Häuser", { title: "Haus am Meer" }) > 0.5);
  assert.ok(one("pt", "notificações", { title: "notificação no celular" }) > 0.5);
  const ja = lexicalScores({ candidates: [{ tags: ["calendar"] }, { tags: ["calendar"], localizedTags: ["カレンダー", "予定"] }], queries: ["カレンダー"], lang: "ja" });
  assert.equal(ja[0].lexical, null); // English-only tags: unknown, not irrelevant
  assert.ok(ja[1].lexical > 0.8);
  const hi = lexicalScores({ candidates: [{ tags: ["office"] }], queries: ["कार्यालय"], lang: "hi" });
  assert.equal(hi[0].lexical, null);
});

t("technical: low-res upscale, extreme aspect, short clip, flat thumbnail; stills get zoom headroom", async () => {
  const out = { width: 1080, height: 1920 };
  const v = (w, h, dur = 10) => ({ type: "video", width: w, height: h, durationSec: dur });
  const good = technicalFit({ candidate: v(2160, 3840), output: out, needSec: 3 });
  assert.equal(good.pass, true);
  assert.equal(good.layout, "FULL");
  assert.equal(good.tech, 1);

  const lowres = technicalFit({ candidate: v(540, 960), output: out, needSec: 3 });
  assert.equal(lowres.layouts.FULL.pass, false);
  assert.ok(lowres.layouts.FULL.reasons.includes("upscale"));
  assert.ok(lowres.layouts.FULL.upscale >= 2);
  assert.equal(lowres.pass, false); // PIP fails aspect, SPLIT fails upscale
  assert.ok(lowres.reasons.includes("upscale") || lowres.reasons.includes("aspect"));

  const wide = technicalFit({ candidate: v(5040, 2160), output: out, needSec: 3 });
  assert.equal(wide.layouts.FULL.pass, false);
  assert.ok(wide.layouts.FULL.reasons.includes("aspect"));
  assert.equal(wide.layouts.FULL.aspect, 0);
  assert.equal(wide.pass, true); // still usable picture-in-picture
  assert.equal(wide.layout, "PIP");
  assert.ok(wide.tech < good.tech + 1e-9);

  const short = technicalFit({ candidate: v(2160, 3840, 2), output: out, needSec: 3 });
  assert.equal(short.pass, false);
  assert.ok(short.reasons.includes("short"));
  near(short.duration, (2 / 3.5) ** 2, 1e-3);

  const flat = technicalFit({ candidate: v(2160, 3840), output: out, needSec: 3, stdev: 1.5 });
  assert.equal(flat.pass, false);
  assert.ok(flat.reasons.includes("low_information"));
  assert.equal(flat.grey, 0);

  const still = technicalFit({ candidate: { type: "image", width: 1080, height: 1920 }, output: out, needSec: 3 });
  assert.equal(still.pass, true);
  near(still.upscale, 1.08, 1e-3);
  assert.ok(still.resolution < 1);
  assert.equal(still.duration, 0.9);
});

t("prior = .55·lexical + .15·1/(1+.15·rank) + .30·tech; technical failures dropped with reasons; top ≤ 8", async () => {
  const raw = [];
  for (let i = 0; i < 12; i++) {
    raw.push({ provider: "pexels", providerId: String(1000 + i), type: "video", width: 2160, height: 3840, durationSec: i === 3 ? 1 : 12,
      tags: i % 2 ? ["robot", "arm", "factory"] : ["beach"], rank: i + 1 });
  }
  const slot = { slotId: "sl_x", queries: ["robot arm"], keywords: ["factory"], clipNeedSec: 3 };
  const r = rankPrior({ slot, candidates: raw, output: { width: 1080, height: 1920 } });
  assert.equal(r.top.length, 8);
  assert.equal(r.ranked.length, 11);
  assert.deepEqual(r.dropped, [{ key: "pexels:1003", reasons: ["short"] }]);
  for (const e of r.ranked) {
    const lex = e.lexical.lexical == null ? 0.25 : e.lexical.lexical;
    near(e.prior, 0.55 * lex + 0.15 * (1 / (1 + 0.15 * e.candidate.rank)) + 0.30 * e.technical.tech, 2e-4);
  }
  for (let i = 1; i < r.ranked.length; i++) assert.ok(r.ranked[i - 1].prior >= r.ranked[i].prior);
  assert.ok(r.top.slice(0, 5).every((e) => e.candidate.tags.includes("robot")), "tag matches outrank the provider's own order");
});

// =====================================================================================================
section("dHash de-dup and contact sheet");

t("dHash: one ffmpeg run, near-identical ≤ 8, different pictures far apart, flat grey stdev < 5, bad files cost only their own hash", async () => {
  await pictures();
  assert.ok(POOL.length >= 8, `pool of distinct pictures too small: ${POOL.length}`);
  const files = [P.base, P.near, P.png, P.mandel, P.grey, P.bad, P.text];
  const hs = await hashImages(files, { workDir: scratch("dh"), pidFile: null });
  const [base, nearH, png, mandel, grey, bad, text] = hs;
  assert.ok(base.dhash && nearH.dhash && png.dhash && mandel.dhash && grey.dhash);
  assert.ok(hamming(base.dhash, nearH.dhash) <= 8, `near ${hamming(base.dhash, nearH.dhash)}`);
  assert.ok(hamming(base.dhash, png.dhash) <= 8, `png ${hamming(base.dhash, png.dhash)}`);
  assert.ok(hamming(base.dhash, mandel.dhash) > 10, `mandel ${hamming(base.dhash, mandel.dhash)}`);
  assert.ok(grey.stdev < 5 && base.stdev > 5);
  assert.match(base.color, /^#[0-9A-F]{6}$/);
  assert.equal(bad.dhash, null);
  assert.equal(text.dhash, null);
  // Same 9×8 area-scaled dHash as services/asset_sources/util, so hashes stay comparable.
  const u = await util.imageDHashStats(P.base);
  assert.ok(hamming(u.dhash, base.dhash) <= 2, `util ${u.dhash} vs ${base.dhash}`);
});

t("dedupeByHash keeps the higher prior of a near-duplicate pair", async () => {
  const hs = await hashImages([P.base, P.near, P.mandel], { workDir: scratch("dd"), pidFile: null });
  const items = [
    { key: "a", dhash: hs[0].dhash, prior: 0.4 },
    { key: "a2", dhash: hs[1].dhash, prior: 0.7 },
    { key: "b", dhash: hs[2].dhash, prior: 0.5 },
  ];
  const { kept, removed } = dedupeByHash(items, { maxDistance: 8 });
  assert.deepEqual(kept.map((x) => x.key), ["a2", "b"]);
  assert.equal(removed.length, 1);
  assert.equal(removed[0].item.key, "a");
  assert.equal(removed[0].dupOf, "a2");
});

t("downloadThumb: https only, content-type allow-list, byte cap, magic sniff, HTTP errors, cancellation", async () => {
  await pictures();
  const dir = scratch("dl");
  const jpg = fs.readFileSync(P.base);
  const png = fs.readFileSync(P.png);
  const html = Buffer.from("<html><body>blocked</body></html>");
  const route = {
    "https://x.test/ok.jpg": () => imageResponse(jpg),
    "https://x.test/ok.png": () => imageResponse(png, "image/png"),
    "https://x.test/404.jpg": () => new Response("nope", { status: 404 }),
    "https://x.test/html.jpg": () => new Response(html, { status: 200, headers: { "content-type": "text/html" } }),
    "https://x.test/lies.jpg": () => imageResponse(html),
    "https://x.test/big.jpg": () => imageResponse(jpg, "image/jpeg", { "content-length": String(5 * 1024 * 1024) }),
    "https://x.test/stream.jpg": () => new Response(new ReadableStream({
      pull(c) { c.enqueue(new Uint8Array(64 * 1024)); },
    }), { status: 200, headers: { "content-type": "image/jpeg" } }),
  };
  let calls = 0;
  const fetchImpl = async (url, init) => { calls++; return route[url](init); };
  const dl = (url, extra = {}) => downloadThumb({ url, dest: path.join(dir, `t${++seq}`), fetch: fetchImpl, maxBytes: 256 * 1024, ...extra });
  assert.equal((await dl("http://x.test/ok.jpg")).reason, "bad_url");
  assert.equal(calls, 0);
  const ok = await dl("https://x.test/ok.jpg");
  assert.equal(ok.ok, true);
  assert.equal(ok.kind, "jpeg");
  assert.ok(ok.file.endsWith(".jpg") && fs.existsSync(ok.file));
  assert.equal(ok.width, 320);
  assert.ok((await dl("https://x.test/ok.png")).file.endsWith(".png"));
  assert.equal((await dl("https://x.test/404.jpg")).reason, "http_404");
  assert.equal((await dl("https://x.test/html.jpg")).reason, "content_type");
  assert.equal((await dl("https://x.test/lies.jpg")).reason, "magic");
  assert.equal((await dl("https://x.test/big.jpg")).reason, "too_large");
  assert.equal((await dl("https://x.test/stream.jpg")).reason, "too_large");
  const ac = new AbortController();
  ac.abort();
  await rejects(() => dl("https://x.test/ok.jpg", { signal: ac.signal }), (e) => assert.equal(e.errorClass, "cancelled"));
});

t("frameUrls: video strips at 25/50/75 % of the provider pictures; stills use their thumbnail", async () => {
  const pv = normalizeCandidate(rawPexelsVideos()[0]);
  const urls = frameUrls(pv);
  assert.equal(urls.length, 3);
  assert.deepEqual(urls.map((u) => Number(/preview-(\d+)/.exec(u)[1])), [1, 2, 3]);
  const px = normalizeCandidate(rawPixabayVideos()[0]);
  assert.equal(frameUrls(px).length, 1);
  const photo = normalizeCandidate(rawPexelsPhotos()[0]);
  assert.deepEqual(frameUrls(photo), [photo.thumbs[0]]);
});

t("contact sheet: ≤ 8 lettered cells in a ≤ 640 px JPEG grid; bad requests are loud", async () => {
  const file = await sheet8();
  const buf = fs.readFileSync(file);
  assert.deepEqual(util.imageDimsFromBuffer(buf), { width: 640, height: 640 });
  assert.ok(buf.length < 400 * 1024, `sheet ${buf.length} bytes`);
  if (SHEET_OUT) { fs.mkdirSync(SHEET_OUT, { recursive: true }); fs.copyFileSync(file, path.join(SHEET_OUT, "broll_sheet8.jpg")); }
  const dir = scratch("sheets");
  const three = await buildContactSheet({
    cells: [{ letter: "A", frames: [POOL[0].file, POOL[1].file, POOL[2].file] }, { letter: "B", frames: [POOL[3].file] }, { letter: "C", frames: [P.png] }],
    outFile: path.join(dir, "three.jpg"), workDir: path.join(dir, "w"), pidFile: null,
  });
  assert.deepEqual([three.width, three.height], [640, 320]);
  assert.deepEqual(util.imageDimsFromBuffer(fs.readFileSync(three.file)), { width: 640, height: 320 });
  if (SHEET_OUT) fs.copyFileSync(three.file, path.join(SHEET_OUT, "broll_sheet3.jpg"));
  const one = await buildContactSheet({ cells: [{ letter: "A", frames: [POOL[0].file] }], outFile: path.join(dir, "one.jpg"), workDir: path.join(dir, "w"), pidFile: null });
  assert.deepEqual([one.width, one.height], [320, 160]);
  // Three sheets fit one judge call under llm_guard.
  const uri = `data:image/jpeg;base64,${buf.toString("base64")}`;
  assert.equal(assertPayload([1, 2, 3].flatMap(() => [{ type: "text", text: "SLOT" }, { type: "image_url", image_url: { url: uri } }])).images, 3);
  const nine = "ABCDEFGHI".split("").map((letter) => ({ letter, frames: [POOL[0].file] }));
  await rejects(() => buildContactSheet({ cells: nine, outFile: path.join(dir, "x.jpg"), workDir: dir, pidFile: null }), (e) => assert.equal(e.code, "BROLL_SHEET_INVALID"));
  await rejects(() => buildContactSheet({ cells: [{ letter: "A", frames: [P.base] }, { letter: "A", frames: [P.base] }], outFile: path.join(dir, "x.jpg"), workDir: dir, pidFile: null }), (e) => assert.equal(e.code, "BROLL_SHEET_INVALID"));
  await rejects(() => buildContactSheet({ cells: [{ letter: "A", frames: [P.text] }], outFile: path.join(dir, "x.jpg"), workDir: dir, pidFile: null }), (e) => assert.equal(e.code, "BROLL_SHEET_INVALID"));
  await rejects(() => buildContactSheet({ cells: [{ letter: "A", frames: [P.base] }], outFile: path.join(dir, "x.jpg"), workDir: dir, fontDir: dir, pidFile: null }), (e) => {
    assert.equal(e.code, "BROLL_SHEET_FONT_MISSING");
    assert.equal(e.errorClass, "config");
  });
});

// =====================================================================================================
section("judge — ve_broll_judge");

const judgeItems = (n = 8) => Array.from({ length: n }, (_, i) => ({ key: `pexels:${100 + i}`, type: i < 5 ? "video" : "image", durationSec: i < 5 ? 6 : null }));

t("letters are a deterministic per-slot shuffle and map back to the right candidate keys", async () => {
  resetBreakers();
  const file = await sheet8();
  const items = judgeItems();
  const a1 = assignLetters("sl_a", items).map((l) => l.key);
  assert.deepEqual(assignLetters("sl_a", items).map((l) => l.key), a1);
  assert.notDeepEqual(assignLetters("sl_b", items).map((l) => l.key), a1);
  assert.deepEqual(assignLetters("sl_a", items).map((l) => l.letter), "ABCDEFGH".split(""));
  const fake = fakeJudge((slotId, id) => ({ relevance: id.charCodeAt(0) - 64 }));
  const res = await judgeSlots({ slots: [{ slotId: "sl_a", sentenceText: "I check my inbox twice a day.", queries: ["inbox"], candidates: items, sheetFile: file }], callJson: fake });
  assert.equal(res.status, "ok");
  assert.equal(fake.calls.length, 1);
  for (const l of assignLetters("sl_a", items)) assert.equal(res.bySlot.sl_a.byKey[l.key].relevance, l.letter.charCodeAt(0) - 64);
  const call = fake.calls[0];
  assert.equal(call.stage, JUDGE_STAGE);
  assert.equal(call.temperature, 0);
  assert.equal(call.model, LITE);
  assert.equal(call.user.filter((p) => p.type === "image_url").length, 1);
  assert.ok(call.user[0].text.includes('Sentence: "I check my inbox twice a day."'));
  assert.ok(call.user[0].text.includes("A (video 6.0 s)") || call.user[0].text.includes("A (photo)"));
  assertPayload(call.user);
  near(res.costUsd, 0.0006, 1e-9);
});

t("≤ 3 slot sheets per call", async () => {
  resetBreakers();
  const file = await sheet8();
  const slots = Array.from({ length: 7 }, (_, i) => ({ slotId: `sl_${i}`, sentenceText: `sentence ${i}`, queries: ["q"], candidates: judgeItems(2), sheetFile: file }));
  const fake = fakeJudge();
  const res = await judgeSlots({ slots, callJson: fake });
  assert.equal(res.status, "ok");
  assert.deepEqual(fake.calls.map((c) => batchOf(c.user).length), [3, 3, 1]);
  for (const c of fake.calls) assert.ok(c.user.filter((p) => p.type === "image_url").length <= 3);
  assert.equal(Object.keys(res.bySlot).length, 7);
});

t("invalid letters → ONE repair re-ask through ai/llm.callJson, then success", async () => {
  resetBreakers();
  const file = await sheet8();
  const chatCalls = [];
  const chat = async (req) => {
    chatCalls.push(req);
    const good = replyFor(batchOf(req.user));
    if (chatCalls.length === 1) good.slots[0].cands = good.slots[0].cands.filter((c) => c.id !== "B").concat([rating("Z")]);
    return { text: JSON.stringify(good), model: req.model, costUsd: 0.0005, tokensIn: 800, tokensOut: 90 };
  };
  const res = await judgeSlots({
    slots: [{ slotId: "sl_r", sentenceText: "x", queries: ["q"], candidates: judgeItems(3), sheetFile: file }],
    callJson: (o) => llm.callJson({ ...o, chat }),
  });
  assert.equal(res.status, "ok");
  assert.equal(chatCalls.length, 2);
  const note = chatCalls[1].user[chatCalls[1].user.length - 1].text;
  assert.ok(note.includes("must rate exactly the letters A,B,C"), note);
  assert.ok(note.includes("missing B") && note.includes("unknown Z"), note);
  assert.equal(Object.keys(res.bySlot.sl_r.byKey).length, 3);
  near(res.costUsd, 0.001, 1e-9);
  assert.equal(chatCalls[0].stage, "ve_broll_judge");
});

t("still invalid after the repair → the escalation model once; both invalid → unavailable", async () => {
  resetBreakers();
  const file = await sheet8();
  const mk = (flashOk) => {
    const models = [];
    const chat = async (req) => {
      models.push(req.model);
      const good = replyFor(batchOf(req.user));
      if (req.model === FLASH && flashOk) return { text: JSON.stringify(good), model: req.model, costUsd: 0.004 };
      return { text: JSON.stringify([good]), model: req.model, costUsd: req.model === FLASH ? 0.004 : 0.0005 }; // top-level array
    };
    return { models, callJson: (o) => llm.callJson({ ...o, chat }) };
  };
  const slot = { slotId: "sl_e", sentenceText: "x", queries: ["q"], candidates: judgeItems(2), sheetFile: file };
  const a = mk(true);
  const ok = await judgeSlots({ slots: [slot], callJson: a.callJson });
  assert.deepEqual(a.models, [LITE, LITE, FLASH]);
  assert.equal(ok.status, "ok");
  assert.equal(ok.bySlot.sl_e.model, FLASH);
  assert.ok(ok.notices.some((n) => n.code === "JUDGE_ESCALATED"));
  near(ok.costUsd, 0.005, 1e-9);
  const b = mk(false);
  const bad = await judgeSlots({ slots: [slot], callJson: b.callJson });
  assert.deepEqual(b.models, [LITE, LITE, FLASH, FLASH]);
  assert.equal(bad.status, "unavailable");
  assert.equal(bad.bySlot.sl_e.reason, "invalid_json");
  near(bad.costUsd, 0.009, 1e-9);
});

t("no vision consent / caller veto / open breaker → zero calls; provider failure → unavailable + breaker; cancellation propagates", async () => {
  resetBreakers();
  const file = await sheet8();
  const slot = { slotId: "sl_p", sentenceText: "x", queries: ["q"], candidates: judgeItems(2), sheetFile: file };
  const fake = fakeJudge();
  const noConsent = await judgeSlots({ slots: [slot], callJson: fake, allowCloudVision: false });
  assert.equal(noConsent.bySlot.sl_p.reason, "no_vision_consent");
  const vetoed = await judgeSlots({ slots: [slot], callJson: fake, blockedReason: "cost_cap" });
  assert.equal(vetoed.bySlot.sl_p.reason, "cost_cap");
  const open = await judgeSlots({ slots: [slot], callJson: fake, breaker: spyBreaker(false) });
  assert.equal(open.bySlot.sl_p.reason, "breaker_open");
  assert.equal(fake.calls.length, 0);

  const br = spyBreaker(true);
  const failing = fakeJudge(undefined, { fail: () => new EditError("LLM_CALL_FAILED", { errorClass: "transient", retryable: true }) });
  const down = await judgeSlots({ slots: [slot], callJson: failing, breaker: br });
  assert.equal(down.status, "unavailable");
  assert.equal(down.bySlot.sl_p.reason, "call_failed_transient");
  assert.deepEqual(br.failures, ["transient"]);

  const oversized = await judgeSlots({ slots: [{ ...slot, sheetFile: P.wide }], callJson: fake });
  assert.equal(oversized.bySlot.sl_p.reason, "sheet_invalid");
  assert.equal(fake.calls.length, 0);

  const ac = new AbortController();
  const cancelling = fakeJudge(undefined, { fail: () => { ac.abort(); return new EditError("LLM_ABORTED", { errorClass: "cancelled" }); } });
  await rejects(() => judgeSlots({ slots: [slot], callJson: cancelling, signal: ac.signal }), (e) => assert.equal(e.errorClass, "cancelled"));
});

// =====================================================================================================
section("score — totals, thresholds, diversity, outputs");

t("total = .40·sem + .12·vis + .10·res + .10·aspect + .08·comp + .05·brand + .10·durFit + .05·div − .15/issue", async () => {
  const technical = { tech: 0.8, resolution: 1, aspect: 0.9, duration: 1 };
  const judge = { relevance: 8, quality: 6, composition: 7, issues: ["text"], bestLayout: "FULL" };
  const s = score.computeTotal({ lexical: 0.6, technical, judge, brand: 0.5, diversity: 0.8 });
  near(s.sem, 0.75, 1e-9);
  near(s.vis, 0.7, 1e-9);
  near(s.total, 0.4 * 0.75 + 0.12 * 0.7 + 0.1 * 1 + 0.1 * 0.9 + 0.08 * 0.7 + 0.05 * 0.5 + 0.1 * 1 + 0.05 * 0.8 - 0.15, 1e-4);
  const clean = score.computeTotal({ lexical: 0.6, technical, judge: { ...judge, issues: [] }, brand: 0.5, diversity: 0.8 });
  const two = score.computeTotal({ lexical: 0.6, technical, judge: { ...judge, issues: ["text", "watermark"] }, brand: 0.5, diversity: 0.8 });
  near(clean.total - two.total, 0.30, 1e-4);
  const blind = score.computeTotal({ lexical: 0.6, technical, judge: null, brand: null, diversity: 1 });
  near(blind.sem, 0.6, 1e-9);
  near(blind.vis, 0.8, 1e-9);
  near(blind.total, 0.4 * 0.6 + 0.12 * 0.8 + 0.1 + 0.09 + 0.08 * 0.6 + 0.05 * 0.5 + 0.1 + 0.05, 1e-4);
  assert.equal(score.computeTotal({ lexical: 1, technical, judge: { ...judge, relevance: 10, issues: ["unsafe"] } }).excluded, true);
  near(score.brandFit("#FF0000", ["#FF0000"]), 1, 1e-9);
  assert.equal(score.brandFit("#FF0000", []), null);
});

t("acceptance matrix: rel ≥ 6 && total ≥ .55 video / .50 image; unsafe and 'none' excluded; lexical-only never at LOW", async () => {
  const J = (relevance, over = {}) => ({ relevance, quality: 7, composition: 7, issues: [], bestLayout: "FULL", ...over });
  const acc = (type, judge, total, lexical = 0.9, tech = 0.9, excluded = false) => score.acceptance({ type, judge, total, lexical, tech, excluded });
  const all = { low: true, medium: true, high: true };
  const none = { low: false, medium: false, high: false };
  assert.deepEqual(acc("video", J(6), 0.55).byIntensity, all);
  assert.equal(acc("video", J(5.9), 0.9).reason, "relevance");
  assert.equal(acc("video", J(9), 0.549).reason, "total");
  assert.equal(acc("image", J(6), 0.50).accepted, true);
  assert.equal(acc("video", J(6), 0.50).accepted, false);
  assert.equal(acc("video", J(9, { bestLayout: "none" }), 0.9).reason, "judge_unusable");
  const unsafe = acc("video", J(10, { issues: ["unsafe"] }), 0.95, 1, 1, true);
  assert.equal(unsafe.accepted, false);
  assert.equal(unsafe.reason, "unsafe");
  assert.deepEqual(unsafe.byIntensity, none);
  const lex = acc("video", null, 0.3, 0.5, 0.6);
  assert.equal(lex.rule, "lexical_only");
  assert.deepEqual(lex.byIntensity, { low: false, medium: true, high: true });
  assert.equal(acc("video", null, 0.9, 0.49, 1).accepted, false);
  assert.equal(acc("video", null, 0.9, 1, 0.59).accepted, false);
  assert.equal(acc("video", null, 0.9, null, 1).accepted, false);
});

t("diversity: never reuse another slot's asset or near-duplicate picture, avoid a repeated author, media preference first", async () => {
  const e = (key, total, { type = "video", author = null, dhash = null, accepted = true } = {}) => ({ key, candidate: { type }, authorKey: author, dhash, scores: { total }, acc: { accepted, reason: accepted ? null : "total" } });
  const chosen = [{ key: "pexels:1", author: "pexels:alice", dhash: "ffffffffffffffff", tags: new Set() }];
  const scored = [
    e("pexels:1", 0.95, { author: "pexels:alice", dhash: "ffffffffffffffff" }),
    e("pixabay:2", 0.9, { author: "pixabay:bob", dhash: "fffffffffffffff0" }),
    e("pexels:3", 0.85, { author: "pexels:alice", dhash: "0f0f0f0f0f0f0f0f" }),
    e("pexels:4", 0.7, { author: "pexels:carol", dhash: "00000000000000ff" }),
  ];
  const r = score.selectBest(scored, { chosen });
  assert.equal(r.best.key, "pexels:4");
  assert.equal(r.blocked.get("pexels:1"), "used_by_other_slot");
  assert.equal(r.blocked.get("pixabay:2"), "near_duplicate_of_other_slot");
  assert.equal(r.blocked.get("pexels:3"), "same_author");
  assert.equal(score.selectBest(scored.slice(0, 3), { chosen }).best.key, "pexels:3"); // only a repeated author left
  const mixed = [e("pexels:9", 0.9, { type: "image", author: "pexels:dan" }), e("pexels:8", 0.6, { author: "pexels:alice" })];
  assert.equal(score.selectBest(mixed, { chosen, mediaPreference: "video" }).best.key, "pexels:8");
  assert.equal(score.selectBest(mixed, { chosen, mediaPreference: "either" }).best.key, "pexels:9");
  assert.equal(score.selectBest(mixed, { chosen, mediaPreference: "video", allowImages: false }).best.key, "pexels:8");

  const cand = normalizeCandidate({ provider: "pexels", providerId: "77", type: "video", width: 1080, height: 1920, durationSec: 8, tags: ["office", "laptop"] });
  const base = { key: cand.key, prior: 0.5, candidate: cand, lexical: { lexical: 0.6 }, technical: { tech: 0.9, resolution: 1, aspect: 1, duration: 1 } };
  const [free] = score.scoreEntries({ entries: [base], chosen: [] });
  const [dup] = score.scoreEntries({ entries: [base], chosen: [{ key: "x", tags: score.tagTokens(cand) }] });
  assert.equal(free.scores.diversity, 1);
  assert.equal(dup.scores.diversity, 0);
  near(free.scores.total - dup.scores.total, 0.05, 1e-3);
});

async function e2eSlots() {
  await pictures();
  const pv = rawPexelsVideos();
  const xv = rawPixabayVideos();
  const slots = [
    { slotId: "sl_s4", sentenceId: "s4", rank: 0, text: "I, I check my inbox only twice a day.", queries: ["inbox", "phone notifications"], keywords: ["inbox", "phone"], clipNeedSec: 2.2, mediaPreference: "video", avoid: [] },
    { slotId: "sl_s8", sentenceId: "s8", rank: 1, text: "We shipped the project two weeks early.", queries: ["team celebrating", "project board"], keywords: ["team", "project"], clipNeedSec: 2.1, mediaPreference: "either", avoid: ["stock handshake"] },
  ];
  const candidatesBySlot = {
    sl_s4: [...pv, ...xv, ...rawPixabayImages()],
    sl_s8: [...xv, ...pv.slice(0, 2), ...rawPexelsPhotos(), ...rawOpenverse()],
  };
  return { slots, candidatesBySlot };
}
const DUP_ALIAS = (u) => (/\/videos\/5926121\/pictures\/|41758-429396245/.test(u) ? "dup" : null);

t("scoreSlots end-to-end: ≤ 8 schema-valid AssetRefs per slot with scores, judge, licence, thumbnails; distinct bests; unsafe never chosen", async () => {
  resetBreakers();
  const { slots, candidatesBySlot } = await e2eSlots();
  const projectDir = scratch("proj-e2e");
  const fetchImpl = fakeFetch({ alias: DUP_ALIAS });
  const judge = fakeJudge((slotId, id) => (id === "A" ? { issues: ["unsafe"], relevance: 10 } : { relevance: 9 }));
  const res = await score.scoreSlots({
    slots, candidatesBySlot, projectDir, output: { aspect: "9:16", width: 1080, height: 1920 },
    projectSettings: clone(DEFAULT_SETTINGS), lang: "en", fetch: fetchImpl, callJson: judge, pidFile: null, log: silentLog,
  });
  assert.equal(judge.calls.length, 1); // both sheets in one call
  assert.equal(res.judge, "ok");
  near(res.costUsd, 0.0006, 1e-9);
  assert.ok(fetchImpl.thumbs() > 0);

  const summary = JSON.parse(fs.readFileSync(path.join(projectDir, score.SCORED_REL), "utf8"));
  assert.equal(summary.slots.length, 2);
  const bests = [];
  for (const s of summary.slots) {
    const file = JSON.parse(fs.readFileSync(path.join(projectDir, score.candidatesRel(s.slotId)), "utf8"));
    assert.equal(file.slotId, s.slotId);
    assert.equal(file.judge, "ok");
    assert.ok(file.candidates.length >= 1 && file.candidates.length <= 8);
    for (const ref of file.candidates) {
      const v = AssetRefSchema.safeParse(ref);
      assert.ok(v.success, JSON.stringify(v.error && v.error.issues));
      assert.ok(ref.license.length > 0);
      assert.ok(ref.thumbPath && fs.existsSync(path.join(projectDir, ref.thumbPath)), ref.thumbPath);
      assert.ok(ref.scores.judgeRelevance != null);
      assert.ok(file.details[ref.assetId].judge, "judge verdict kept per candidate");
      if (ref.provider === "pexels" && ref.type === "video") assert.match(ref.attribution, /^Video by .+ on Pexels$/);
    }
    assert.ok(file.sheet && fs.existsSync(path.join(projectDir, file.sheet.path)));
    assert.ok(file.sheet.width <= 640 && file.sheet.height <= 640);
    const unsafeId = file.sheet.letters.A;
    assert.equal(file.details[unsafeId].reason, "unsafe");
    assert.notEqual(file.bestAssetId, unsafeId);
    assert.ok(s.top.length <= 8);
    if (s.best) {
      assert.equal(s.accepted, true);
      assert.ok(AssetRefSchema.safeParse(s.best).success);
      bests.push(s.best);
    }
  }
  assert.equal(bests.length, 2, "both slots found an accepted clip");
  assert.notEqual(bests[0].assetId, bests[1].assetId);
  if (bests[0].dhash && bests[1].dhash) assert.ok(hamming(bests[0].dhash, bests[1].dhash) > 10);

  const s4 = JSON.parse(fs.readFileSync(path.join(projectDir, score.candidatesRel("sl_s4")), "utf8"));
  assert.ok(s4.dropped.some((d) => d.key === "pixabay:19627" && d.reasons.includes("short")), "2 s clip for a 2.2 s need is dropped");
  assert.ok(s4.dropped.some((d) => ["pexels:5926121", "pixabay:41758"].includes(d.key) && d.reasons.includes("near_duplicate")), JSON.stringify(s4.dropped));
  assert.equal(res.discoveries.brollMoments, 2);
  assert.ok(!res.notices.some((n) => n.code === "NO_BROLL_FOUND"));
  assert.ok(!fs.existsSync(path.join(projectDir, "work")) || fs.readdirSync(path.join(projectDir, "work")).length === 0, "temp work dir removed");
});

t("no vision consent → lexical + technical only, flagged 'unavailable', nothing accepted at LOW; NO_BROLL_FOUND", async () => {
  resetBreakers();
  const { slots, candidatesBySlot } = await e2eSlots();
  const projectDir = scratch("proj-blind");
  const judge = fakeJudge();
  const projectSettings = { ...clone(DEFAULT_SETTINGS), broll: { enabled: true, intensity: "low", allowImages: true }, privacy: { allowCloudVision: false } };
  const res = await score.scoreSlots({
    slots, candidatesBySlot, projectDir, output: { aspect: "9:16", width: 1080, height: 1920 },
    projectSettings, lang: "en", fetch: fakeFetch(), callJson: judge, pidFile: null,
  });
  assert.equal(judge.calls.length, 0);
  assert.equal(res.summary.judge, "unavailable");
  assert.equal(res.summary.judgeReason, "no_vision_consent");
  for (const s of res.summary.slots) {
    assert.equal(s.judge, "unavailable");
    assert.equal(s.accepted, false);
    assert.equal(s.acceptedByIntensity.low, false);
    for (const ref of s.top) assert.equal(ref.scores.judgeRelevance, null);
  }
  assert.ok(res.summary.slots.some((s) => s.acceptedByIntensity.medium), "lexical ≥ .5 && tech ≥ .6 still passes at medium");
  assert.ok(res.notices.some((n) => n.code === "NO_BROLL_FOUND"));
  assert.ok(res.notices.some((n) => n.code === "BROLL_JUDGE_UNAVAILABLE"));
  const file = JSON.parse(fs.readFileSync(path.join(projectDir, score.candidatesRel("sl_s4")), "utf8"));
  assert.equal(file.judge, "unavailable");
  assert.equal(file.judgeReason, "no_vision_consent");
});

// =====================================================================================================
section("phase-5 stage handlers");

function stageCtx(projectDir, project, settings) {
  return {
    project, projectId: project.id, projectDir, settings, runId: "run_test", signal: null, attempt: 1,
    log: silentLog, now: () => 1700000000000, tracker: null, pidFile: null, progress: () => {}, emit: () => 0,
    faults: { maybeFail: async () => {}, faultFor: () => null },
    abs: (rel) => fsx.resolveInside(projectDir, rel),
    readJson: (rel) => { const r = fsx.readJsonSafe(fsx.resolveInside(projectDir, rel)); return r.ok ? r.value : null; },
    writeJson: async (rel, obj) => { const f = fsx.resolveInside(projectDir, rel); fsx.ensureDir(path.dirname(f)); fsx.writeJsonAtomic(f, obj); return rel; },
  };
}
function projectFixture(projectDir, over = {}) {
  fs.mkdirSync(path.join(projectDir, "analysis"), { recursive: true });
  for (const [name, rel] of [["content", phase5.CONTENT_REL], ["transcript", phase5.TRANSCRIPT_REL], ["transcript.words", phase5.WORDS_REL]]) {
    fs.writeFileSync(path.join(projectDir, rel), JSON.stringify(fx(name)));
  }
  return {
    id: "ve_test000000000001",
    settings: { ...clone(DEFAULT_SETTINGS), output: { aspect: "9:16" } },
    source: { durationSec: 45, video: { width: 1080, height: 1920 } },
    stages: {
      TRANSCRIBING: { status: "done", outputs: { words: { path: phase5.WORDS_REL, sha256: "w1" } } },
      ANALYZING_CONTENT: { status: "done", outputs: { content: { path: phase5.CONTENT_REL, sha256: "c1" } } },
    },
    cost: { spentUsd: 0, capUsd: 0.5 },
    ...over,
  };
}

t("register(): both stages on the graph; output geometry and language helpers", async () => {
  const reg = phase5.register(createRegistry());
  assert.deepEqual(reg.listStages().map((d) => [d.name, [...d.deps]]), [["SEARCHING_BROLL", ["ANALYZING_CONTENT", "ANALYZING_VIDEO"]], ["SCORING_ASSETS", ["SEARCHING_BROLL"]]]);
  assert.deepEqual(phase5.outputGeometry({ settings: { output: { aspect: "9:16" }, exportProfile: "export1080" } }), { aspect: "9:16", width: 1080, height: 1920 });
  assert.deepEqual(phase5.outputGeometry({ settings: { output: { aspect: "9:16" }, exportProfile: "export720" } }), { aspect: "9:16", width: 720, height: 1280 });
  assert.deepEqual(phase5.outputGeometry({ settings: { output: { aspect: "source" } }, source: { mezzanine: { width: 1920, height: 1080 } } }), { aspect: "16:9", width: 1920, height: 1080 });
  assert.deepEqual(phase5.outputGeometry({ settings: { output: { aspect: "1:1" } } }), { aspect: "1:1", width: 1080, height: 1080 });
  assert.equal(phase5.languageOf({ settings: { language: "auto" } }, { language: "es" }, null), "es");
  assert.equal(phase5.languageOf({ settings: { language: "hi" } }, { language: "es" }, null), "hi");
  assert.equal(phase5.judgeBlockedReason({ project: { cost: { spentUsd: 0.5, capUsd: 0.5 } }, settings: {} }), "cost_cap");
  assert.equal(phase5.judgeBlockedReason({ project: { cost: { spentUsd: 0.1, capUsd: 0.5 } }, settings: {} }), null);
});

t("SEARCHING_BROLL → SCORING_ASSETS on a stage ctx: slots, raw hits, manifest, candidates, summary, outputs, cost", async () => {
  resetBreakers();
  resetLimiters();
  await pictures();
  const root = scratch("phase5");
  const projectDir = path.join(root, "ve_test000000000001");
  const project = projectFixture(projectDir);
  const settings = makeSettings(root);
  const fetchImpl = fakeFetch();
  const judge = fakeJudge();
  const [SEARCH, SCORE] = phase5.stages({ fetch: fetchImpl, callJson: judge, keys: KEYS, cache: false });
  const ctx = stageCtx(projectDir, project, settings);

  assert.deepEqual(SEARCH.inputHash(ctx), SEARCH.inputHash(ctx));
  assert.ok(SEARCH.budgetMs(ctx) >= 120000);
  const sr = await SEARCH.run(ctx);
  assert.deepEqual(Object.keys(sr.outputs), ["slots", "search"]);
  const slotsDoc = ctx.readJson(sr.outputs.slots.path);
  assert.deepEqual(slotsDoc.output, { aspect: "9:16", width: 1080, height: 1920 });
  assert.equal(slotsDoc.slots.length, 5);
  const manifest = ctx.readJson(sr.outputs.search.path);
  assert.equal(manifest.counts.slots, 5);
  for (const s of manifest.slots) {
    assert.ok(s.items > 0, `${s.slotId} found nothing`);
    assert.ok(fs.existsSync(path.join(projectDir, s.path)));
    assert.match(s.itemsHash, /^[0-9a-f]{64}$/);
  }
  assert.equal(sr.discoveries.brollSlots, 5);
  assert.equal(sr.engine, "stock");

  assert.ok(SCORE.budgetMs(ctx) > 60000);
  const sc = await SCORE.run(ctx);
  assert.ok(sc.outputs.scored);
  assert.equal(Object.keys(sc.outputs).filter((k) => /^cand_\d+$/.test(k)).length, 5);
  for (const o of Object.values(sc.outputs)) assert.ok(fs.existsSync(path.join(projectDir, o.path)), o.path);
  assert.equal(sc.engine, "judge");
  assert.deepEqual(sc.fallbacks, []);
  assert.equal(judge.calls.length, 2); // 5 slots → 3 + 2
  near(sc.costUsd, 0.0012, 1e-9);
  const summary = ctx.readJson(sc.outputs.scored.path);
  assert.equal(summary.slots.length, 5);
  const used = summary.slots.filter((s) => s.best).map((s) => s.best.assetId);
  assert.equal(new Set(used).size, used.length, "no clip chosen twice");
  assert.equal(sc.discoveries.brollMoments, summary.counts.accepted);
  for (const n of sc.notices) assert.ok(typeof n.code === "string" && n.severity);

  // Over the project cost cap: same stage, zero judge calls, lexical + technical only.
  const capped = stageCtx(projectDir, { ...project, cost: { spentUsd: 0.6, capUsd: 0.5 } }, settings);
  const judge2 = fakeJudge();
  const [, SCORE2] = phase5.stages({ fetch: fakeFetch(), callJson: judge2, keys: KEYS, cache: false });
  const sc2 = await SCORE2.run(capped);
  assert.equal(judge2.calls.length, 0);
  assert.equal(sc2.engine, "lexical");
  assert.deepEqual(sc2.fallbacks, ["judge_cost_cap"]);
  assert.equal(ctx.readJson(sc2.outputs.scored.path).judgeReason, "cost_cap");
});

t("SEARCHING_BROLL with no transcript or broll disabled: empty slot set, no provider calls, SCORING writes an empty summary", async () => {
  resetBreakers();
  const root = scratch("phase5-empty");
  const projectDir = path.join(root, "ve_test000000000002");
  const project = projectFixture(projectDir, {});
  project.settings.broll = { enabled: false, intensity: "medium", allowImages: true };
  const fetchImpl = fakeFetch();
  const [SEARCH, SCORE] = phase5.stages({ fetch: fetchImpl, callJson: fakeJudge(), keys: KEYS, cache: false });
  const ctx = stageCtx(projectDir, project, makeSettings(root));
  const sr = await SEARCH.run(ctx);
  assert.equal(sr.engine, "none");
  assert.equal(fetchImpl.calls.length, 0);
  const sc = await SCORE.run(ctx);
  assert.equal(sc.engine, "none");
  assert.deepEqual(sc.fallbacks, []);
  assert.equal(ctx.readJson(sc.outputs.scored.path).slots.length, 0);
  assert.ok(!sc.notices.some((n) => n.code === "NO_BROLL_FOUND"));
  fs.rmSync(path.join(projectDir, phase5.SLOTS_REL || "analysis/broll_slots.json"), { force: true });
  await rejects(() => SCORE.run(ctx), (e) => assert.equal(e.code, "BROLL_SLOTS_MISSING"));
});

t("offline: the global fetch was never called", async () => {
  assert.equal(globalFetchCalls, 0);
});

run().finally(() => {
  clearInterval(keepAlive);
  restoreFetch();
  tmp.cleanup();
});
