// Unit tests for the Edit Plan core: plan/schema, plan/timeline, plan/resolve, plan/outline,
// captions/{styles,group,place}, ai/llm (callJson) and ai/llm_guard.
// Run: node scripts/video_edit_plan_core.test.cjs   (offline; fetch tripwire; < 10 s)
//
// Load-bearing assertions:
//  - TIMELINE INVARIANTS on 500 randomized cut sets: pieces monotonic, contiguous, non-overlapping with
//    cuts, outDuration = Σ lengths, time maps monotonic, words inside cuts collapse, minRemove / merge
//    rules hold. Every output time in the product hangs off these.
//  - DETERMINISM: resolvePlan twice (and on a clone) is byte-identical canonical JSON, and never mutates
//    its input. Render caching and undo depend on it.
//  - CUE ID STABILITY: toggling an early cut does not rename later cues, so per-cue user edits survive.
//  - LLM: exactly one repair re-ask, top-level arrays rejected, cache hits are free, model fallback noticed.
// Fixtures: scripts/fixtures/video_edit/talking_head_45s.*.json (synthetic ~45 s talking head with fillers,
// repeats, a false start, 3 long pauses, hook + CTA, a drifting face track and content analysis).

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { z } = require("zod");
const { createHarness, mkTmp, installFetchTripwire } = require("./lib/video_edit_test_utils.cjs");
const { sha256Json } = require("../src/video_edit/fsx");
const { isEditError } = require("../src/video_edit/errors");
const S = require("../src/video_edit/plan/schema");
const T = require("../src/video_edit/plan/timeline");
const { resolvePlan } = require("../src/video_edit/plan/resolve");
const { outline } = require("../src/video_edit/plan/outline");
const Styles = require("../src/video_edit/captions/styles");
const G = require("../src/video_edit/captions/group");
const Place = require("../src/video_edit/captions/place");
const { callJson } = require("../src/video_edit/ai/llm");
const { assertPayload } = require("../src/video_edit/ai/llm_guard");

const { t, section, run } = createHarness();
const restoreFetch = installFetchTripwire();
const tmp = mkTmp("ve-plan-core-");

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
const MEZZ = { w: SOURCE.width, h: SOURCE.height };

const sentence = (id) => TRANSCRIPT.sentences.find((s) => s.id === id);
function wi(sid, text, nth = 0) {
  const s = sentence(sid);
  let c = 0;
  for (let i = s.w0; i <= s.w1; i++) if (WORDS[i].text === text && c++ === nth) return i;
  throw new Error(`word '${text}' not in ${sid}`);
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function synthEnvelope(words, { durationSec, floorDb, speechDb, hop = 0.01 }) {
  const n = Math.ceil(durationSec / hop) + 1;
  const env = new Float32Array(n);
  for (let i = 0; i < n; i++) env[i] = floorDb + 1.5 * Math.sin(i * 1.3);
  const ramp = 0.03;
  for (const w of words) {
    const i0 = Math.max(0, Math.floor((w.start - ramp) / hop)), i1 = Math.min(n - 1, Math.ceil((w.end + ramp) / hop));
    for (let i = i0; i <= i1; i++) {
      const tc = (i + 0.5) * hop;
      const d = tc < w.start ? w.start - tc : tc > w.end ? tc - w.end : 0;
      const v = d === 0 ? speechDb + 2 * Math.sin(i * 0.7) : floorDb + (speechDb - floorDb) * Math.max(0, 1 - d / ramp);
      env[i] = Math.max(env[i], v);
    }
  }
  return env;
}
const ENV = synthEnvelope(WORDS, { durationSec: SOURCE.durationSec, floorDb: AUDIO.floorDb, speechDb: AUDIO.speechDb });

const { projectId: PROJECT_ID, fps: _fps, ...SOURCE_FIELDS } = SOURCE;
const BASE_EMPTY = S.emptyPlan({ projectId: PROJECT_ID, source: SOURCE_FIELDS, output: { aspect: "9:16" }, now: NOW });
const clone = (v) => JSON.parse(JSON.stringify(v));

function detectCuts(settings) {
  const cuts = [];
  let n = 0;
  const id = () => `cut_${String(++n).padStart(4, "0")}`;
  for (let k = 0; k + 1 < WORDS.length; k++) {
    const g = T.gapCut(WORDS[k], WORDS[k + 1], ENV, { floorDb: AUDIO.floorDb, pace: settings.silencePace });
    if (!g) continue;
    cuts.push({ id: id(), kind: "SILENCE", srcIn: g.srcIn, srcOut: g.srcOut, raw: g.raw, snap: g.snap, wordRange: null, confidence: 0.9,
      controlledBy: "removeSilence", enabled: true, userToggled: false, reason: `pause ${g.gapSec}s`, origin: "heuristic", locked: false });
  }
  for (const f of TRANSCRIPT.fillerCandidates) {
    const r = T.fillerCut(WORDS[f.i], ENV, { floorDb: AUDIO.floorDb, speechDb: AUDIO.speechDb, prevWord: WORDS[f.i - 1], nextWord: WORDS[f.i + 1] });
    assert.ok(r.cut, `fixture filler ${f.text} should be cuttable (veto ${r.veto})`);
    cuts.push({ id: id(), kind: "FILLER", srcIn: r.cut.srcIn, srcOut: r.cut.srcOut, raw: r.cut.raw, snap: r.cut.snap, wordRange: r.cut.wordRange,
      confidence: r.cut.confidence, controlledBy: "removeFillers", fillerKind: f.kind, enabled: true, userToggled: false,
      reason: `filler ${f.text}`, origin: "heuristic", locked: false });
  }
  for (const rc of TRANSCRIPT.repeatCandidates) {
    const fc = T.fragmentCut(WORDS[rc.w0], WORDS[rc.keptW0], { prevWord: WORDS[rc.w0 - 1] });
    assert.ok(fc, "fixture repeat should be cuttable");
    cuts.push({ id: id(), kind: rc.kind, srcIn: fc.srcIn, srcOut: fc.srcOut, raw: fc.raw, snap: fc.snap, wordRange: [rc.w0, rc.w1], confidence: 0.8,
      controlledBy: null, enabled: true, userToggled: false, reason: rc.kind.toLowerCase(), origin: "heuristic", locked: false });
  }
  return cuts;
}

const ASSET = {
  assetId: "ast_pexels0001", provider: "pexels", providerId: "123456", type: "video", path: "assets/broll/ast_pexels0001.mp4",
  thumbPath: "broll/thumbs/ast_pexels0001.jpg", sourceUrl: "https://www.pexels.com/video/123456/", license: "Pexels License",
  attribution: "Video by A. Creator", width: 1080, height: 1920, durationSec: 8.2, trimInSec: 0.5, dhash: "f0e1d2c3b4a59687",
  tags: ["team", "office"],
  scores: { lexical: 0.6, judgeRelevance: 8, judgeQuality: 7, issues: [], resolution: 1, aspect: 1, composition: 0.6, brand: 0.5, duration: 1, diversity: 1, total: 0.71 },
};

const sentAnchor = (sid) => ({ kind: "words", w0: sentence(sid).w0, w1: sentence(sid).w1 });
const TYPE_MAP = { HOOK: "HOOK", CTA: "CTA" };
const INTENT_MAP = { HOOK: "hook_grab", CTA: "cta", STORY: "story", EXAMPLE: "proof", POINT: "explain" };

function buildFixturePlan({ settings = {}, elements = true } = {}) {
  const plan = clone(BASE_EMPTY);
  Object.assign(plan.settings, settings);
  plan.cuts = detectCuts(plan.settings);
  if (!elements) return plan;
  plan.aRoll.segments = CONTENT.segments.map((cs, k) => ({
    id: `seg_${k + 1}`, type: TYPE_MAP[cs.type] || "TALKING_HEAD",
    anchor: { kind: "words", w0: sentence(cs.sentenceIds[0]).w0, w1: sentence(cs.sentenceIds[cs.sentenceIds.length - 1]).w1 },
    resolved: null, sentenceIds: cs.sentenceIds, importance: cs.importance, editingIntent: INTENT_MAP[cs.type] || "explain",
    faceRequired: CONTENT.faceRequired.some((f) => cs.sentenceIds.includes(f.sentenceId)),
    framing: { mode: "auto", zoomBase: 1, keyframes: [], locked: false }, label: cs.title, reason: `content segment ${cs.id}`, origin: "ai", locked: false,
  }));
  plan.broll = [
    { id: "br_0001", ordinal: 1, anchor: sentAnchor("s6"), resolved: null, sentenceId: "s6", segmentId: "seg_3", layout: "FULL", layoutParams: {},
      intent: "illustrate", queries: [{ text: "phone face down", kind: "visual_noun" }, { text: "notifications off", kind: "scene" }],
      reason: "visual need 0.65", chosen: null, candidateSetId: null, topCandidates: [], judge: "ok", status: "pending", origin: "ai", locked: false, userModified: false },
    { id: "br_0002", ordinal: 2, anchor: sentAnchor("s8"), resolved: null, sentenceId: "s8", segmentId: "seg_4", layout: "PIP", layoutParams: { corner: "tr", scale: 0.4 },
      intent: "context", queries: [{ text: "team celebrating", kind: "visual_noun" }], reason: "visual need 0.8", reasonCode: "VISUAL_NEED",
      evidence: { sentenceId: "s8", wordRange: [sentence("s8").w0, sentence("s8").w1], quote: "We shipped the project two weeks early." },
      chosen: ASSET, candidateSetId: "cs_br_0002", topCandidates: [ASSET], judge: "ok", status: "ok", origin: "ai", locked: false, userModified: false },
  ];
  const fx = (id, extra) => ({ id, resolved: null, enabled: true, reason: "fixture", origin: "ai", locked: false, userModified: false, ...extra });
  plan.effects = [
    fx("fx_0001", { kind: "PUNCH_IN", anchor: { kind: "words", w0: wi("s1", "3"), w1: wi("s1", "hours") }, zoom: 1.12, center: "face" }),
    fx("fx_0002", { kind: "PUNCH_OUT", anchor: { kind: "words", w0: sentence("s1").w1, w1: sentence("s1").w1 }, toZoom: 1 }),
    fx("fx_0003", { kind: "JUMP_ZOOM", anchor: { kind: "src", srcIn: 10, srcOut: 12 }, zoom: 1.1, offsetX: 0, lowRes: false, origin: "heuristic" }),
    fx("fx_0004", { kind: "ZOOM_EMPHASIS", anchor: { kind: "words", w0: wi("s11", "freedom."), w1: wi("s11", "freedom.") }, fromZoom: 1, toZoom: 1.1, durationSec: 0.6, ease: "smoothstep", enabled: false }),
    fx("fx_0005", { kind: "REFRAME", anchor: sentAnchor("s10"), cx: 0.52, cy: 0.4, zoom: 1.05 }),
    fx("fx_0006", { kind: "FREEZE", anchor: sentAnchor("s12"), atSrc: sentence("s11").end, holdSec: 0.5, enabled: false }),
    fx("fx_0007", { kind: "SPEED", anchor: { kind: "src", srcIn: 1, srcOut: 2 }, rate: 1.5, target: "broll", enabled: false }),
    fx("fx_0008", { kind: "PUNCH_IN", anchor: { kind: "words", w0: wi("s2", "Um,"), w1: wi("s2", "Um,") }, zoom: 1.1, center: { cx: 0.5, cy: 0.4 } }),
  ];
  plan.graphics = [
    { id: "gfx_0001", kind: "HOOK_TITLE", anchor: sentAnchor("s1"), resolved: null, text: { title: "Stop losing 3 hours a day" }, templateId: "hook_title",
      variables: { accent: "#ffd400" }, region: "top", renderer: "hyperframes", fallback: "ass", render: { cardHash: null, path: null, status: "pending" },
      enabled: true, reason: "hook strength 0.82", origin: "ai", locked: false, userModified: false },
    { id: "gfx_0002", kind: "CTA", anchor: sentAnchor("s12"), resolved: null, text: { title: "Follow for more", subtitle: "New tips every week" }, templateId: "cta",
      variables: {}, region: "center", renderer: "ass", fallback: "ass", render: { cardHash: null, path: null, status: "fallback" },
      enabled: true, reason: "CTA sentence", origin: "ai", locked: false, userModified: false },
  ];
  plan.transitions = [{ id: "tr_0001", kind: "DIP_BLACK", at: { joint: "after", elementId: "seg_4" }, durationSec: 0.2, enabled: true, reason: "topic boundary", origin: "ai", locked: false }];
  plan.music = {
    enabled: true,
    track: { assetId: "ast_music001", path: "assets/music/ast_music001.mp3", provider: "pixabay_bridge", title: "Bright Morning", query: "upbeat background", mood: "upbeat", license: "Pixabay Content License", durationSec: 120 },
    candidates: [], volume: 0.1, envelope: [{ anchor: { kind: "words", w0: 0, w1: 0 }, volume: 0.14 }], duck: { enabled: true, depthDb: -9 },
    startOffsetSec: 0, fadeInSec: 0.5, fadeOutSec: 1.5, reason: "upbeat energy 0.62", origin: "ai", locked: false,
  };
  plan.sfx = [{ id: "sfx_0001", cue: "whoosh", path: "assets/sfx/whoosh.mp3", anchor: { elementId: "br_0001", edge: "in", offsetSec: -0.1 }, resolved: null,
    volume: 0.25, license: "CC0", attribution: null, enabled: true, reason: "B-roll entry", origin: "ai", locked: false }];
  plan.opportunities = {
    broll: [{ id: "opp_b0001", sentenceId: "s10", wordAnchor: { w0: wi("s10", "Google"), w1: wi("s10", "Calendar") }, priority: 0.75, layoutPreference: "FULL",
      mediaPreference: "video", queries: ["calendar app", "time blocks"], reason: "visual need", candidatesPrefetched: false }],
    effects: [{ id: "opp_e0001", sentenceId: "s4", w: wi("s4", "twice"), kind: "PUNCH_IN", priority: 0.6, reason: "emphasis" }],
    graphics: [{ id: "opp_g0001", kind: "STAT", sentenceId: "s8", title: "2 weeks early", value: "2", priority: 0.5, reason: "number + unit" }],
    sfx: [{ id: "opp_s0001", anchor: "broll_in", ref: "br_0001", cue: "whoosh", priority: 0.5, reason: "B-roll entry" }],
  };
  plan.branding.logo = { assetId: "ast_logo0001", path: "assets/logo.png", placement: "tr", scale: 0.12, opacity: 0.9, marginPct: 0.04, show: "always" };
  plan.branding.palette = { primary: "#146eb4", accent: "#ff9900", text: "#ffffff", onAccent: "#14130e", source: "user" };
  plan.provenance.director = { model: "meta/muse-spark-1.3-contributor", stage: "ve_director", promptHash: "ab12", costUsd: 0.003, fallback: false };
  plan.qa = { revision: 0, findings: [{ severity: "minor", category: "EFFECT_DENSITY", detail: "fixture" }] };
  return plan;
}

const CTX = { words: WORDS, sentences: TRANSCRIPT.sentences, faces: FACES, mezz: MEZZ, now: NOW };
const RESOLVED = resolvePlan(buildFixturePlan(), CTX);
const identityOutWords = (words) => words.map((w) => ({ key: `w${w.i}`, i: w.i, text: w.text, srcStart: w.start, srcEnd: w.end, outStart: w.start, outEnd: w.end, emphasis: false, conf: w.conf, sentenceId: w.sentenceId }));
const cueWithKey = (cues, key) => cues.find((c) => c.words.some((w) => w.key === key));

// ======================================================================== schema
section("plan/schema — contract");

t("emptyPlan is a valid revision-0 plan with the contract constants", () => {
  assert.equal(S.PLAN_SCHEMA_ID, "keyframe.edit_plan");
  assert.equal(S.PLAN_SCHEMA_VERSION, 1);
  const r = S.parsePlan(BASE_EMPTY, { wordCount: WORDS.length });
  assert.ok(r.ok, JSON.stringify(r.issues));
  assert.equal(BASE_EMPTY.output.width, 1080);
  assert.equal(BASE_EMPTY.output.height, 1920);
  assert.equal(BASE_EMPTY.branding.recolorFootage, false);
  assert.equal(BASE_EMPTY.captions.highlight, "color");
  assert.throws(() => S.emptyPlan({ projectId: PROJECT_ID, source: SOURCE_FIELDS, output: { aspect: "9:16" } }), (e) => isEditError(e) && e.code === "INVALID_PLAN");
});

t("a full plan (every element kind) is accepted before and after resolvePlan", () => {
  const raw = buildFixturePlan();
  const before = S.parsePlan(raw, { wordCount: WORDS.length });
  assert.ok(before.ok, JSON.stringify(before.issues.slice(0, 5)));
  const after = S.parsePlan(RESOLVED, { wordCount: WORDS.length });
  assert.ok(after.ok, JSON.stringify(after.issues.slice(0, 5)));
  assert.ok(RESOLVED.timeline.pieces.length > 5);
  assert.ok(RESOLVED.captions.cues.length > 10);
});

t("planSettingsFromProject maps project settings onto the plan keys", () => {
  const s = S.planSettingsFromProject({
    captions: { enabled: false, styleId: "clean", maxWordsPerLine: 2, language: "es" }, brand: { palette: { primary: "#AA0000", secondary: "#00AA00", source: "manual" } },
    music: { enabled: false }, sfx: { enabled: true }, broll: { intensity: "high" }, effects: { intensity: "dynamic", autoJumpCuts: false },
    removeFillers: "aggressive", removeSilence: { enabled: true, pace: "fast" },
  });
  assert.ok(S.PlanSettingsSchema.safeParse(s).success);
  assert.deepEqual([s.captionStyle, s.captionLanguage, s.maxWordsPerLine, s.captionsEnabled], ["clean", "es", 2, false]);
  assert.deepEqual(s.brandColors, ["#aa0000", "#00aa00"]);
  assert.deepEqual([s.brollIntensity, s.effects, s.autoJumpCuts, s.removeFillers, s.silencePace, s.musicEnabled], ["high", "dynamic", false, "aggressive", "fast", false]);
});

const VIOLATIONS = [
  ["duplicate id across the plan", (p) => { p.graphics[1].id = p.graphics[0].id; }, "duplicate id"],
  ["id with the wrong prefix", (p) => { p.broll[0].id = "fx_wrong01"; }, "broll.0.id"],
  ["words anchor w1 < w0", (p) => { p.effects[0].anchor = { kind: "words", w0: 10, w1: 5 }; }, "w1 must be >= w0"],
  ["words anchor outside the transcript", (p) => { p.effects[0].anchor = { kind: "words", w0: 3, w1: WORDS.length + 4 }; }, "outside the transcript"],
  ["src anchor past the source", (p) => { p.effects[2].anchor = { kind: "src", srcIn: 10, srcOut: SOURCE.durationSec + 5 }; }, "past the source duration"],
  ["cut srcOut <= srcIn", (p) => { p.cuts[0].srcOut = p.cuts[0].srcIn; }, "srcOut must be > srcIn"],
  ["recolorFootage true", (p) => { p.branding.recolorFootage = true; }, "branding.recolorFootage"],
  ["odd output width", (p) => { p.output.width = 1081; p.output.height = 1922; }, "width must be even"],
  ["output not matching aspect", (p) => { p.output.aspect = "1:1"; }, "does not match aspect"],
  ["transition to an unknown element", (p) => { p.transitions[0].at.elementId = "seg_999"; }, "unknown element"],
  ["sfx anchored to an unknown element", (p) => { p.sfx[0].anchor.elementId = "br_9999"; }, "unknown element"],
  ["B-roll in an unknown segment", (p) => { p.broll[0].segmentId = "seg_404"; }, "unknown segment"],
  ["non-contiguous pieces", (p) => { p.timeline.pieces[2].outIn += 0.1; }, "contiguous"],
  ["outDurationSec mismatch", (p) => { p.timeline.outDurationSec += 1; }, "outDurationSec"],
  ["duplicate B-roll ordinal", (p) => { p.broll[1].ordinal = p.broll[0].ordinal; }, "duplicate ordinal"],
  ["AI graphic title over 32 chars", (p) => { p.graphics[0].text.title = "This title is far too long for AI"; }, "longer than 32"],
  ["PUNCH_IN zoom out of range", (p) => { p.effects[0].zoom = 1.5; }, "effects.0.zoom"],
  ["invalid palette hex", (p) => { p.branding.palette.accent = "orange"; }, "branding.palette.accent"],
  ["duplicate insertion key", (p) => { const ins = { key: "ins_a", afterWordIndex: 1, order: 0, text: "hey", srcStart: 1, srcEnd: 1.1 }; p.captions.overrides.insertions = [ins, { ...ins }]; }, "duplicate insertion key"],
  ["insertion key that looks like a word key", (p) => { p.captions.overrides.insertions = [{ key: "w12", afterWordIndex: 1, order: 0, text: "hey", srcStart: 1, srcEnd: 1.1 }]; }, "insertions.0.key"],
  ["parentRevision >= revision", (p) => { p.revision = 2; p.parentRevision = 2; }, "parentRevision"],
  ["unknown key (strict objects)", (p) => { p.cuts[0].srcin = 1; }, "cuts.0"],
  ["malformed project id", (p) => { p.projectId = "ve_UPPER"; }, "projectId"],
  ["hold piece with srcIn != srcOut", (p) => { p.timeline.pieces[0].kind = "hold"; }, "hold pieces"],
];

for (const [name, mutate, needle] of VIOLATIONS) {
  t(`rejects: ${name}`, () => {
    const p = clone(RESOLVED);
    mutate(p);
    const r = S.parsePlan(p, { wordCount: WORDS.length });
    assert.equal(r.ok, false, "expected rejection");
    assert.ok(r.issues.some((i) => i.path.includes(needle) || i.message.includes(needle)), `no issue mentions '${needle}': ${JSON.stringify(r.issues.slice(0, 4))}`);
  });
}

t("user-edited graphics may use the op limits (≤ 60 for HOOK_TITLE)", () => {
  const p = clone(RESOLVED);
  p.graphics[0].text.title = "This title is far too long for AI but fine for a user";
  p.graphics[0].userModified = true;
  assert.ok(S.parsePlan(p).ok);
});

// ======================================================================== timeline
section("plan/timeline — cuts, ranges, pieces");

t("frame quantization helpers snap to the 30 fps grid", () => {
  assert.equal(T.quantizeIn(1.2), 36);
  assert.equal(T.quantizeIn(1.2001), 36, "within ms rounding of a frame boundary = on the boundary");
  assert.equal(T.quantizeIn(1.201), 37);
  assert.equal(T.quantizeOut(1.2), 36);
  assert.equal(T.quantizeOut(1.2333), 37, "0.01 frame before frame 37 is frame 37 (ms rounding)");
  assert.equal(T.quantizeOut(1.23), 36);
  assert.equal(T.frameToSec(37), 1.233333);
  assert.equal(T.snapToFrame(0.051), 0.066667);
});

t("settingEnabled: removeFillers gates pure vs discourse fillers; silence/jump-cut switches", () => {
  const pure = { controlledBy: "removeFillers", fillerKind: "pure", enabled: true };
  const disc = { controlledBy: "removeFillers", fillerKind: "discourse", enabled: true };
  assert.equal(T.isEffective(pure, { removeFillers: "off" }), false);
  assert.equal(T.isEffective(pure, { removeFillers: "light" }), true);
  assert.equal(T.isEffective(disc, { removeFillers: "light" }), false);
  assert.equal(T.isEffective(disc, { removeFillers: "aggressive" }), true);
  assert.equal(T.isEffective({ controlledBy: "removeSilence", enabled: true }, { removeSilence: false }), false);
  assert.equal(T.isEffective({ controlledBy: "autoJumpCuts", enabled: true }, { autoJumpCuts: true }), true);
  assert.equal(T.isEffective({ controlledBy: null, enabled: false }, {}), false);
});

function mkPlan(cuts, settings = {}) {
  const p = clone(BASE_EMPTY);
  Object.assign(p.settings, settings);
  p.cuts = cuts.map((c, k) => ({ id: c.id || `cut_t${k}`, kind: c.kind || "SILENCE", srcIn: c.srcIn, srcOut: c.srcOut, raw: { srcIn: c.srcIn, srcOut: c.srcOut },
    snap: { method: "none", padIn: 0, padOut: 0 }, wordRange: null, confidence: 1, controlledBy: c.controlledBy === undefined ? null : c.controlledBy,
    fillerKind: c.fillerKind, enabled: c.enabled !== false, userToggled: false, reason: "t", origin: "user", locked: false }));
  return p;
}

t("cuts closer than 2 frames merge; 2+ frames apart stay separate", () => {
  const merged = T.effectiveCuts(mkPlan([{ srcIn: 10, srcOut: 11 }, { srcIn: 11.03, srcOut: 12 }]));
  assert.equal(merged.cuts.length, 1);
  assert.deepEqual(merged.cuts[0].ids, ["cut_t0", "cut_t1"]);
  const apart = T.effectiveCuts(mkPlan([{ srcIn: 10, srcOut: 11 }, { srcIn: 11.07, srcOut: 12 }]));
  assert.equal(apart.cuts.length, 2);
});

t("minRemove: short SILENCE/FILLER dropped (min_cut) unless merged into a bigger group", () => {
  const r = T.effectiveCuts(mkPlan([
    { id: "cut_sil", kind: "SILENCE", srcIn: 5, srcOut: 5.2 },
    { id: "cut_fok", kind: "FILLER", srcIn: 8, srcOut: 8.2 },
    { id: "cut_fsm", kind: "FILLER", srcIn: 12, srcOut: 12.1 },
    { id: "cut_fm1", kind: "FILLER", srcIn: 20, srcOut: 20.1 },
    { id: "cut_fm2", kind: "SILENCE", srcIn: 20.1, srcOut: 20.7 },
  ]));
  assert.deepEqual(r.adjustments.map((a) => a.elementId).sort(), ["cut_fsm", "cut_sil"]);
  assert.ok(r.adjustments.every((a) => a.rule === "min_cut" && a.action === "disabled"));
  assert.ok(r.cuts.some((g) => g.ids.includes("cut_fok")));
  assert.ok(r.cuts.some((g) => g.ids.includes("cut_fm1") && g.ids.includes("cut_fm2")));
});

t("minKeep: a wordless sliver is absorbed; a short piece with a word disables the shorter adjacent cut", () => {
  // wordless sliver between two silences inside the long pause after s5
  const lp = TRANSCRIPT.longPauses[0];
  const a = T.keptRanges(mkPlan([{ srcIn: lp.start + 0.05, srcOut: lp.start + 0.5 }, { srcIn: lp.start + 0.7, srcOut: lp.end - 0.05 }]), { words: WORDS });
  assert.ok(!a.ranges.some((r) => r.srcIn > lp.start && r.srcOut < lp.end), "sliver must be absorbed");
  // word "twice" isolated by two cuts leaving < 0.35 s around it
  const w = WORDS[wi("s4", "twice")];
  const b = T.keptRanges(mkPlan([
    { id: "cut_left", srcIn: w.start - 0.6, srcOut: w.start - 0.02 },
    { id: "cut_right", srcIn: w.end + 0.02, srcOut: w.end + 0.3 },
  ]), { words: WORDS });
  assert.deepEqual(b.adjustments, [{ elementId: "cut_right", rule: "min_keep", action: "disabled" }]);
  assert.ok(b.ranges.some((r) => r.srcIn <= w.start && r.srcOut >= w.end && r.srcOut - r.srcIn >= 0.35));
});

t("timeline invariants hold on 500 randomized cut sets", () => {
  const D = SOURCE.durationSec;
  const KINDS = ["SILENCE", "FILLER", "REPEAT", "FALSE_START", "RETAKE", "JUMP_CUT", "USER"];
  const CTRL = [null, "removeSilence", "removeFillers", "autoJumpCuts"];
  const mids = WORDS.map((w) => (w.start + w.end) / 2);
  let totalPieces = 0, collapsedChecked = 0;
  for (let seed = 1; seed <= 500; seed++) {
    const rand = mulberry32(seed);
    const pick = (arr) => arr[Math.floor(rand() * arr.length)];
    const cuts = [];
    const n = 1 + Math.floor(rand() * 24);
    for (let k = 0; k < n; k++) {
      let srcIn, srcOut;
      if (rand() < 0.5) {
        const w0 = Math.floor(rand() * WORDS.length), w1 = Math.min(WORDS.length - 1, w0 + Math.floor(rand() * 4));
        srcIn = Math.max(0, WORDS[w0].start - rand() * 0.1); srcOut = Math.min(D, WORDS[w1].end + rand() * 0.1);
      } else {
        srcIn = rand() * D; srcOut = Math.min(D, srcIn + 0.01 + rand() * 1.5);
      }
      if (!(srcOut > srcIn)) continue;
      cuts.push({ id: `cut_r${k}`, kind: pick(KINDS), srcIn, srcOut, controlledBy: pick(CTRL), fillerKind: rand() < 0.3 ? "discourse" : "pure", enabled: rand() < 0.85 });
    }
    const settings = { ...BASE_EMPTY.settings, removeSilence: rand() < 0.8, removeFillers: pick(["off", "light", "aggressive"]), autoJumpCuts: rand() < 0.7 };
    const plan = mkPlan(cuts, settings);
    const built = T.buildPieces(plan, { words: WORDS, settings });
    const map = T.buildTimeMap(built.pieces);
    const P = built.pieces;
    totalPieces += P.length;
    let sum = 0;
    P.forEach((p, i) => {
      assert.ok(p.srcOut > p.srcIn && p.outOut > p.outIn, `seed ${seed}: empty piece`);
      assert.ok(Math.abs(p.srcIn * 30 - Math.round(p.srcIn * 30)) < 1e-3, `seed ${seed}: off-grid piece`);
      if (i === 0) assert.equal(p.outIn, 0);
      else {
        assert.ok(Math.abs(p.outIn - P[i - 1].outOut) < 1e-9, `seed ${seed}: non-contiguous`);
        assert.ok(p.srcIn >= P[i - 1].srcOut - 1e-9, `seed ${seed}: overlapping pieces`);
      }
      sum += p.outOut - p.outIn;
      for (const g of built.cuts) assert.ok(!(p.srcIn < g.srcOut - 1e-9 && p.srcOut > g.srcIn + 1e-9), `seed ${seed}: piece overlaps a cut`);
      if (P.length > 1 && p.srcOut - p.srcIn < T.MIN_KEEP_SEC - 1e-9) {
        assert.ok(mids.some((m) => m >= p.srcIn && m < p.srcOut), `seed ${seed}: wordless piece shorter than minKeep`);
      }
    });
    assert.ok(Math.abs(sum - built.outDurationSec) < 1e-6, `seed ${seed}: outDuration != Σ lengths`);
    built.cuts.forEach((g, i) => {
      const min = Math.min(...g.kinds.map((k) => (T.MIN_REMOVE_SEC[k] != null ? T.MIN_REMOVE_SEC[k] : 2 / 30)));
      assert.ok((g.outF - g.inF) / 30 >= min - 1e-9, `seed ${seed}: group below minRemove`);
      if (i > 0) assert.ok(g.inF - built.cuts[i - 1].outF >= T.MERGE_GAP_FRAMES, `seed ${seed}: unmerged neighbours`);
    });
    const cutIds = new Set(cuts.map((c) => c.id));
    assert.ok(built.adjustments.every((a) => cutIds.has(a.elementId)));
    let ps = -1, pe = -1;
    for (let tt = 0; tt <= D + 1e-9; tt += 0.05) {
      const s = map.srcToOutStart(tt), e = map.srcToOutEnd(tt);
      assert.ok(s >= ps - 1e-9 && e >= pe - 1e-9, `seed ${seed}: non-monotonic map at ${tt}`);
      assert.ok(e <= s + 1e-9, `seed ${seed}: srcToOutEnd > srcToOutStart at ${tt}`);
      ps = s; pe = e;
    }
    for (const w of WORDS) {
      const r = map.resolveAnchor({ kind: "words", w0: w.i, w1: w.i }, WORDS);
      if (built.cuts.some((g) => w.start >= g.srcIn - 1e-9 && w.end <= g.srcOut + 1e-9)) { assert.ok(r.collapsed, `seed ${seed}: cut word ${w.i} not collapsed`); collapsedChecked++; }
      if (P.some((p) => w.start >= p.srcIn && w.end <= p.srcOut)) assert.ok(Math.abs(r.outOut - r.outIn - (w.end - w.start)) < 1e-5, `seed ${seed}: kept word ${w.i} changed duration`);
    }
  }
  assert.ok(totalPieces > 1000 && collapsedChecked > 500, `weak coverage: ${totalPieces} pieces, ${collapsedChecked} collapsed words`);
});

t("time map: inside a cut, starts map to the next piece and ends to the previous one; outToSrc inverts", () => {
  const built = T.buildPieces(RESOLVED, { words: WORDS });
  const map = T.buildTimeMap(built.pieces);
  const g = built.cuts[1];
  const mid = (g.srcIn + g.srcOut) / 2;
  const next = built.pieces.find((p) => p.srcIn >= g.srcOut - 1e-9);
  const prev = [...built.pieces].reverse().find((p) => p.srcOut <= g.srcIn + 1e-9);
  assert.equal(map.srcToOutStart(mid), next.outIn);
  assert.equal(map.srcToOutEnd(mid), prev.outOut);
  const p = built.pieces[3];
  const o = (p.outIn + p.outOut) / 2;
  assert.ok(Math.abs(map.srcToOutStart(map.outToSrc(o)) - o) < 1e-5);
  const br = map.resolveAnchor({ kind: "src", srcIn: g.srcIn + 0.01, srcOut: g.srcOut - 0.01 }, WORDS, { minDur: 0.4 });
  assert.equal(br.collapsed, true);
});

t("FREEZE inserts a hold piece and SPEED shortens non-speech A-roll; chunk keys ignore outIn", () => {
  const lp = TRANSCRIPT.longPauses[1];
  const atSrc = WORDS[40].end;
  const plan = mkPlan([], { removeSilence: false });
  plan.effects = [
    { id: "fx_frz", kind: "FREEZE", anchor: { kind: "src", srcIn: atSrc, srcOut: atSrc }, atSrc, holdSec: 0.5, enabled: true },
    { id: "fx_spd", kind: "SPEED", anchor: { kind: "src", srcIn: lp.start + 0.1, srcOut: lp.end - 0.1 }, rate: 2, target: "aroll_nonspeech", enabled: true },
  ];
  const built = T.buildPieces(plan, { words: WORDS });
  const hold = built.pieces.find((p) => p.kind === "hold");
  const speed = built.pieces.find((p) => p.kind === "speed");
  assert.ok(hold && speed);
  assert.equal(hold.srcIn, hold.srcOut);
  assert.equal(hold.srcIn, T.snapToFrame(atSrc));
  assert.ok(Math.abs(hold.outOut - hold.outIn - 0.5) < 1e-6);
  const lenF = Math.round((speed.srcOut - speed.srcIn) * 30);
  assert.ok(Math.abs((speed.outOut - speed.outIn) * 30 - Math.round(lenF / 2)) < 1e-4);
  const map = T.buildTimeMap(built.pieces);
  assert.equal(map.srcToOutEnd(hold.srcIn), hold.outIn);
  assert.equal(map.srcToOutStart(hold.srcIn), hold.outOut);
  const noFx = T.buildPieces({ ...plan, effects: [] }, { words: WORDS });
  const kept = noFx.pieces.reduce((s, p) => s + (p.outOut - p.outIn), 0);
  assert.ok(Math.abs(built.outDurationSec - (kept + 0.5 - (speed.srcOut - speed.srcIn - (speed.outOut - speed.outIn)))) < 1e-5);
  assert.ok(S.PieceSchema.array().safeParse(built.pieces).success);
  // chunk keys: disabling the first cut shifts outIn of later pieces but not their keys
  const base = buildFixturePlan({ elements: false });
  const toggled = clone(base);
  toggled.cuts.find((c) => c.kind === "FILLER").enabled = false;
  const k1 = T.buildPieces(base, { words: WORDS }).pieces, k2 = T.buildPieces(toggled, { words: WORDS }).pieces;
  const last1 = k1[k1.length - 1], last2 = k2[k2.length - 1];
  assert.equal(last1.srcIn, last2.srcIn);
  assert.notEqual(last1.outIn, last2.outIn);
  assert.equal(last1.chunkKey, last2.chunkKey);
});

// ======================================================================== RMS helpers
section("plan/timeline — RMS envelope helpers");

t("envStats: floor from non-speech frames, speech from in-word frames", () => {
  const s = T.envStats(ENV, WORDS);
  assert.ok(Math.abs(s.floorDb - AUDIO.floorDb) < 2.5, `floor ${s.floorDb}`);
  assert.ok(Math.abs(s.speechDb - AUDIO.speechDb) < 2.5, `speech ${s.speechDb}`);
});

t("refineWordEdges extends voiced ends ≤150 ms, clamps to neighbours, snaps approx edges to dips", () => {
  const env = new Float32Array(300).fill(-55);
  for (let i = 100; i < 145; i++) env[i] = -20;               // voiced 1.00–1.45
  const words = [{ i: 0, text: "hello", start: 1.0, end: 1.2 }, { i: 1, text: "there", start: 1.6, end: 1.9 }];
  const out = T.refineWordEdges(words, env, { floorDb: -55, speechDb: -20 });
  assert.equal(out[0].end, 1.35);                              // capped at +150 ms
  assert.equal(words[0].end, 1.2, "input not mutated");
  const clamped = T.refineWordEdges([words[0], { ...words[1], start: 1.3 }], env, { floorDb: -55, speechDb: -20 });
  assert.equal(clamped[0].end, 1.3);                           // never past the next word
  const dipEnv = new Float32Array(300).fill(-20);
  dipEnv[96] = -50;                                            // dip at 0.965 s
  const snapped = T.refineWordEdges([{ i: 0, text: "x", start: 1.0, end: 1.5 }], dipEnv, { floorDb: -55, speechDb: -20, approx: true });
  assert.equal(snapped[0].start, 0.965);
});

t("gapCut keeps each pace's keepGap and only cuts gaps above its threshold", () => {
  const k = TRANSCRIPT.longPauses[0].afterWord;
  const A = WORDS[k], B = WORDS[k + 1];
  for (const [pace, cfg] of Object.entries(T.PACE)) {
    const c = T.gapCut(A, B, ENV, { floorDb: AUDIO.floorDb, pace });
    assert.ok(c, pace);
    assert.ok(c.srcIn >= A.end + 0.04 && c.srcOut <= B.start - 0.04, `${pace}: cut leaves the gap`);
    const keptSilence = (c.srcIn - A.end) + (B.start - c.srcOut);
    assert.ok(keptSilence >= cfg.keepGap - 1e-9, `${pace}: kept ${keptSilence}`);
    assert.equal(c.snap.method, "rms_gap");
  }
  const short = { start: A.end + 0.3, end: A.end + 0.6, text: "x" };
  assert.equal(T.gapCut(A, short, ENV, { floorDb: AUDIO.floorDb, pace: "natural" }), null);
  assert.ok(T.gapCut(A, { ...short, start: A.end + 0.4 }, ENV, { floorDb: AUDIO.floorDb, pace: "fast" }));
  // a breath right after the word pushes the cut start past it
  const breath = new Float32Array(ENV);
  for (let i = Math.ceil((A.end + 0.04) / 0.01); i < Math.ceil((A.end + 0.15) / 0.01); i++) breath[i] = AUDIO.speechDb;
  const withBreath = T.gapCut(A, B, breath, { floorDb: AUDIO.floorDb, pace: "natural" });
  assert.ok(withBreath.srcIn >= A.end + 0.15 + 0.1 - 1e-9, `cut starts in the breath: ${withBreath.srcIn}`);
  assert.throws(() => T.gapCut(A, B, ENV, { floorDb: -54, pace: "warp" }), (e) => isEditError(e));
});

t("fillerCut pads the word, clamps to neighbours and vetoes coarticulation / low confidence / missing dips", () => {
  const f = TRANSCRIPT.fillerCandidates[0];
  const w = WORDS[f.i], prev = WORDS[f.i - 1], next = WORDS[f.i + 1];
  const ok = T.fillerCut(w, ENV, { floorDb: AUDIO.floorDb, speechDb: AUDIO.speechDb, prevWord: prev, nextWord: next });
  assert.equal(ok.veto, null);
  assert.equal(ok.cut.srcIn, Math.max(prev.end, Math.round((w.start - 0.03) * 1000) / 1000));
  assert.equal(ok.cut.srcOut, Math.min(next.start, Math.round((w.end + 0.05) * 1000) / 1000));
  const loud = new Float32Array(ENV);
  for (let i = Math.floor((w.start - 0.06) / 0.01); i < Math.ceil((w.end + 0.06) / 0.01); i++) loud[i] = AUDIO.speechDb;
  assert.equal(T.fillerCut(w, loud, { floorDb: AUDIO.floorDb, speechDb: AUDIO.speechDb, prevWord: prev, nextWord: next }).veto, "coarticulated");
  assert.equal(T.fillerCut({ ...w, conf: 0.4 }, ENV, { floorDb: AUDIO.floorDb, speechDb: AUDIO.speechDb }).veto, "low_conf");
  const flat = new Float32Array(ENV.length).fill(AUDIO.speechDb - 8);
  assert.equal(T.fillerCut(w, flat, { floorDb: AUDIO.floorDb, speechDb: AUDIO.speechDb, approx: true }).veto, "no_dip");
  const merged = T.fillerCut(w, ENV, { floorDb: AUDIO.floorDb, speechDb: AUDIO.speechDb, prevWord: { end: w.start - 1 }, adjacentCuts: [{ srcIn: w.start - 0.6, srcOut: w.start - 0.05 }] });
  assert.equal(merged.cut.srcIn, Math.round((w.start - 0.6) * 1000) / 1000);
});

// ======================================================================== jump-cut framing
section("plan/timeline — jump-cut framing");

const JC_PIECES = (() => {
  const spans = [[0, 2, "play"], [2.5, 4, "play"], [4.05, 6, "play"], [6.5, 8, "play"], [8, 8, "hold"], [8, 10, "play"], [11, 12, "play"]];
  let o = 0;
  return spans.map(([a, b, kind], i) => {
    const len = kind === "hold" ? 0.5 : b - a;
    const p = { id: `pc_${i}_${kind[0]}`, srcIn: a, srcOut: b, outIn: o, outOut: o + len, kind, rate: 1, chunkKey: "x" };
    o += len;
    return p;
  });
})();

t("changes framing only at jump joints (≥0.12 s removed, play↔play, no scene change); continuity joints keep it", () => {
  const out = { w: 1080, h: 1920 };
  const key = (f) => `${f.z}|${f.offsetX}|${f.offsetY}`;
  const subtle = T.jumpCutFraming(JC_PIECES, FACES, { effects: "subtle", aspect: "9:16", mezz: MEZZ, output: out });
  assert.deepEqual(subtle.map((f) => f.z), [1, 1.1, 1.1, 1, 1, 1, 1.1]);
  assert.deepEqual(subtle.map((f) => f.offsetX), [0, 0, 0, 0, 0, 0, -0.04], "rarer joint colours use the ±4 % offset variants");
  assert.deepEqual(subtle.map((f) => f.shot), [0, 1, 1, 2, 2, 2, 3], "0.05 s removal and the hold piece are continuity joints");
  for (const [a, b] of [[0, 1], [2, 3], [5, 6]]) assert.notEqual(key(subtle[a]), key(subtle[b]), `jump joint ${a}|${b} changes framing`);
  for (const [a, b] of [[1, 2], [3, 4], [4, 5]]) assert.equal(key(subtle[a]), key(subtle[b]), `continuity joint ${a}|${b} keeps framing`);
  const dynamic = T.jumpCutFraming(JC_PIECES, FACES, { effects: "dynamic", aspect: "9:16", mezz: MEZZ, output: out });
  assert.deepEqual(dynamic.map((f) => f.z), [1, 1.2, 1.2, 1, 1, 1, 1.2]);
  const scene = T.jumpCutFraming(JC_PIECES, FACES, { effects: "subtle", aspect: "9:16", mezz: MEZZ, output: out, scenes: [10.5] });
  assert.equal(key(scene[6]), key(scene[5]), "a scene change in the removed span is not a jump joint");
  const covered = T.jumpCutFraming(JC_PIECES, FACES, { effects: "subtle", aspect: "9:16", mezz: MEZZ, output: out, fullBrollRanges: [{ outIn: 1.5, outOut: 2.5 }] });
  assert.deepEqual(covered, subtle, "B-roll coverage no longer changes A-roll framing (cache locality across broll ops)");
  for (const f of subtle) {
    assert.ok(f.crop.x >= 0 && f.crop.y >= 0 && f.crop.x + f.crop.w <= MEZZ.w && f.crop.y + f.crop.h <= MEZZ.h, "crop inside mezz");
    assert.ok(f.crop.w % 2 === 0 && f.crop.h % 2 === 0);
    const faceTop = (f.cy - 0.14) * MEZZ.h;
    assert.ok(f.crop.y === 0 || faceTop - f.crop.y >= 0.08 * f.crop.h - 1, "headroom ≥ 8 % of crop height");
  }
});

t("caps Z1 by the 2.0× upscale limit and falls back to ±4 % offsets with lowRes", () => {
  const capped = T.jumpCutFraming(JC_PIECES, FACES, { effects: "dynamic", aspect: "16:9", mezz: MEZZ, output: { w: 1920, h: 1080 } });
  assert.equal(capped[1].z, 1.12);
  assert.ok(capped.every((f) => f.upscale <= 2.0 + 1e-9 && !f.lowRes));
  const low = T.jumpCutFraming(JC_PIECES, FACES, { effects: "dynamic", aspect: "9:16", mezz: { w: 540, h: 960 }, output: { w: 1080, h: 1920 } });
  assert.ok(low.every((f) => f.lowRes && f.z === 1));
  assert.deepEqual(low.map((f) => f.offsetX), [-0.04, 0.04, 0.04, -0.04, -0.04, -0.04, 0]);
  assert.throws(() => T.jumpCutFraming(JC_PIECES, FACES, { aspect: "9:16", output: { w: 1080, h: 1920 } }), (e) => isEditError(e));
});

// ======================================================================== resolve
section("plan/resolve — derivation");

t("resolvePlan is deterministic and never mutates its input", () => {
  const input = buildFixturePlan();
  const before = sha256Json(input);
  const a = resolvePlan(input, CTX);
  const b = resolvePlan(clone(input), { ...CTX, words: clone(WORDS), faces: clone(FACES) });
  assert.equal(sha256Json(input), before, "input mutated");
  assert.equal(sha256Json(a), sha256Json(b));
  assert.equal(sha256Json(resolvePlan(a, CTX)), sha256Json(a), "re-resolving a resolved plan is a fixed point");
  assert.match(a.timeline.mapHash, /^[0-9a-f]{64}$/);
});

t("timeline, resolved spans and collapse flags are derived for every anchored element", () => {
  const p = RESOLVED;
  const last = p.timeline.pieces[p.timeline.pieces.length - 1];
  assert.equal(p.timeline.outDurationSec, last.outOut);
  assert.ok(p.timeline.outDurationSec < SOURCE.durationSec - 3, "fillers + pauses + head/tail removed");
  for (const el of [...p.aRoll.segments, ...p.broll, ...p.graphics, ...p.effects, ...p.captions.cues]) assert.ok(el.resolved, el.id);
  assert.equal(p.effects.find((e) => e.id === "fx_0008").resolved.collapsed, true, "punch-in on a removed filler collapses");
  assert.equal(p.effects.find((e) => e.id === "fx_0001").resolved.collapsed, false);
  const sfx = p.sfx[0], br = p.broll[0];
  assert.ok(Math.abs(sfx.resolved.outAt - (br.resolved.outIn - 0.1)) < 1e-6);
  assert.equal(sfx.resolved.collapsed, false);
  assert.ok(p.provenance.rhythm.adjustments.every((a) => T.TIMELINE_RULES.includes(a.rule)));
  const keys = new Set(p.timeline.pieces.map((x) => x.chunkKey));
  assert.equal(keys.size, p.timeline.pieces.length, "chunk keys unique per piece");
});

t("caption cues drop effective-cut words and follow the filler setting", () => {
  const keysIn = (plan) => new Set(plan.captions.cues.flatMap((c) => c.words.map((w) => w.key)));
  const light = keysIn(RESOLVED);
  for (const f of TRANSCRIPT.fillerCandidates) assert.equal(light.has(`w${f.i}`), f.kind === "discourse", `${f.text} under light`);
  for (const rc of TRANSCRIPT.repeatCandidates) assert.equal(light.has(`w${rc.w0}`), false, "repeat fragment removed");
  const off = keysIn(resolvePlan(buildFixturePlan({ settings: { removeFillers: "off" } }), CTX));
  for (const f of TRANSCRIPT.fillerCandidates) assert.ok(off.has(`w${f.i}`));
  const aggressive = keysIn(resolvePlan(buildFixturePlan({ settings: { removeFillers: "aggressive" } }), CTX));
  for (const f of TRANSCRIPT.fillerCandidates) assert.equal(aggressive.has(`w${f.i}`), false);
  const cues = RESOLVED.captions.cues;
  for (let k = 1; k < cues.length; k++) assert.ok(cues[k].resolved.outIn >= cues[k - 1].resolved.outOut - 1e-9, "cues never overlap");
  assert.ok(cues.every((c) => c.pos && c.pos.an === 2 && c.pos.y === 0.72), "face track stays above the default band");
});

t("caption overrides: hiddenWords, wordText, insertions, emphasis, hiddenCues and cueY", () => {
  const plan = buildFixturePlan();
  const iTwice = wi("s4", "twice"), iInbox = wi("s4", "inbox"), iActually = wi("s7", "actually"), iFreedom = wi("s11", "freedom.");
  const tw = WORDS[iTwice];
  plan.captions.overrides = {
    wordText: { [iInbox]: "INBOX" },
    insertions: [{ key: "ins_a1", afterWordIndex: iTwice, order: 0, text: "(!)", srcStart: tw.end, srcEnd: tw.end + 0.04 }],
    hiddenWords: [iActually], hiddenCues: [], cueY: {}, emphasis: { [`w${iFreedom}`]: true },
  };
  const r1 = resolvePlan(plan, CTX);
  const cues = r1.captions.cues;
  assert.ok(!cueWithKey(cues, `w${iActually}`), "hidden word removed");
  const inboxCue = cueWithKey(cues, `w${iInbox}`);
  assert.ok(inboxCue.text.includes("INBOX") && inboxCue.edited);
  const seq = cues.flatMap((c) => c.words);
  const pos = seq.findIndex((w) => w.key === "ins_a1");
  assert.ok(pos > 0, "insertion captioned");
  assert.equal(seq[pos - 1].key, `w${iTwice}`, "insertion follows its anchor word in reading order");
  assert.equal(seq[pos].i, null);
  assert.ok(cueWithKey(cues, "ins_a1").edited);
  assert.equal(cueWithKey(cues, `w${iFreedom}`).words.find((w) => w.key === `w${iFreedom}`).emphasis, true);
  assert.ok(S.parsePlan(r1, { wordCount: WORDS.length }).ok);

  const googleCue = cueWithKey(cues, `w${wi("s10", "Google")}`);
  plan.captions.overrides.hiddenCues = [googleCue.id];
  plan.captions.overrides.cueY = { [inboxCue.id]: 0.97 };
  const r2 = resolvePlan(plan, CTX);
  assert.equal(r2.captions.cues.find((c) => c.id === googleCue.id).hidden, true);
  assert.deepEqual(r2.captions.cues.find((c) => c.id === inboxCue.id).pos, { x: 0.5, y: 0.8, an: 2 });
});

t("cue ids after an early cut toggle are unchanged (user edits stay attached)", () => {
  const base = buildFixturePlan();
  const toggled = clone(base);
  const s2Filler = toggled.cuts.find((c) => c.kind === "FILLER" && c.wordRange[0] === wi("s2", "Um,"));
  s2Filler.enabled = false;
  s2Filler.userToggled = true;
  const a = resolvePlan(base, CTX).captions.cues, b = resolvePlan(toggled, CTX).captions.cues;
  const from = sentence("s4").w0;
  const later = (cues) => cues.filter((c) => c.anchor.w0 >= from).map((c) => [c.id, c.text]);
  assert.ok(later(a).length > 8);
  assert.deepEqual(later(b), later(a));
  assert.ok(b.some((c) => c.words.some((w) => w.key === `w${wi("s2", "Um,")}`)), "restored filler is captioned again");
  const shift = b[b.length - 1].resolved.outIn - a[a.length - 1].resolved.outIn;
  assert.ok(shift > 0.2, "later cues moved on the output timeline");
});

t("approx timing with low confidence forces highlight none and proportional cues", () => {
  const plan = buildFixturePlan();
  plan.source.timing = "approx";
  const lowWords = WORDS.map((w) => ({ ...w, conf: 0.35 }));
  const r = resolvePlan(plan, { ...CTX, words: lowWords });
  assert.equal(r.captions.highlight, "none");
  assert.ok(r.captions.cues.every((c) => c.timingMode === "proportional"));
});

// ======================================================================== outline
section("plan/outline");

t("outline summary counts match the fixture", () => {
  const o = outline(RESOLVED);
  assert.equal(o.duration, Math.round(RESOLVED.timeline.outDurationSec * 1000) / 1000);
  assert.equal(o.summary.fillersRemoved, 5, "5 pure fillers under 'light'");
  assert.equal(o.summary.brollCount, 2);
  assert.equal(o.summary.punchIns, 1, "the punch-in on a removed filler is collapsed");
  assert.equal(o.summary.jumpCuts, RESOLVED.timeline.pieces.length - 1);
  assert.ok(o.summary.silenceRemovedSec > 1.5, `silence ${o.summary.silenceRemovedSec}`);
  assert.deepEqual([o.summary.captions, o.summary.music, o.summary.logo, o.summary.hookTitle], [true, true, true, true]);
  assert.equal(o.tracks.captions.cueCount, RESOLVED.captions.cues.length);
  assert.equal(o.aRoll.length, 6);
  assert.ok(o.aRoll[0].effects.includes("PUNCH_IN"));
  assert.equal(o.tracks.transitions[0].outAt, RESOLVED.aRoll.segments[3].resolved.outOut);
  assert.equal(o.tracks.sfx[0].outAt, RESOLVED.sfx[0].resolved.outAt);
  assert.equal(o.tracks.music.title, "Bright Morning");
  assert.equal(o.tracks.broll[1].layout, "PIP");
});

t("outline follows settings: fillers off, aggressive, silence off, effects off, tombstones", () => {
  const off = outline(resolvePlan(buildFixturePlan({ settings: { removeFillers: "off", removeSilence: false, effectsEnabled: false } }), CTX));
  assert.equal(off.summary.fillersRemoved, 0);
  assert.equal(off.summary.silenceRemovedSec, 0);
  assert.equal(off.summary.punchIns, 0);
  assert.equal(outline(resolvePlan(buildFixturePlan({ settings: { removeFillers: "aggressive" } }), CTX)).summary.fillersRemoved, 6);
  const p = clone(RESOLVED);
  p.broll[0].status = "removed";
  const o = outline(p);
  assert.equal(o.summary.brollCount, 1);
  assert.equal(o.tracks.broll.length, 1);
});

// ======================================================================== styles
section("captions/styles");

t("six presets resolve per aspect, scale with output and swap script fonts", () => {
  assert.deepEqual([...Styles.STYLE_IDS].sort(), ["bold_pop", "brand_bar", "clean", "karaoke_blob", "minimal_lower", "single_word"]);
  for (const id of Styles.STYLE_IDS) {
    for (const aspect of ["9:16", "16:9", "1:1"]) {
      const s = Styles.resolveStyle(id, { aspect });
      assert.ok(s.font.sizePx > 0 && s.maxCharsPerLine > 0 && s.maxLines >= 1 && s.font.ttf.endsWith(".ttf"), `${id} ${aspect}`);
    }
  }
  assert.equal(Styles.resolveStyle("bold_pop", { aspect: "9:16" }).font.sizePx, 76);
  assert.equal(Styles.resolveStyle("bold_pop", { aspect: "9:16", output: { width: 540, height: 960 } }).font.sizePx, 38);
  assert.equal(Styles.resolveStyle("bold_pop", { lang: "hi" }).font.family, "Noto Sans Devanagari");
  const ar = Styles.resolveStyle("clean", { lang: "ar" });
  assert.deepEqual([ar.font.family, ar.font.direction, ar.readingCps], ["Noto Sans Arabic", "rtl", 15]);
  const ja = Styles.resolveStyle("bold_pop", { lang: "ja" });
  assert.deepEqual([ja.font.family, ja.font.uppercase, ja.readingCps], ["Noto Sans JP", false, 8]);
  assert.equal(Styles.resolveStyle("clean", { lang: "en" }).readingCps, 20);
  assert.throws(() => Styles.resolveStyle("comic_sans"), (e) => isEditError(e) && e.code === "INVALID_STYLE");
});

t("brand highlight is pushed to ≥ 3:1 against what it is drawn on", () => {
  const { ratio } = require("../src/services/brand_kit");
  const dark = { primary: "#1a1a40", accent: "#1a1a40", text: "#ffffff", onAccent: "#ffffff", source: "user" };
  const pop = Styles.resolveStyle("bold_pop", { brand: dark });
  assert.ok(ratio(pop.colors.highlight, pop.colors.outline) >= 3, pop.colors.highlight);
  const blob = Styles.resolveStyle("karaoke_blob", { brand: { ...dark, accent: "#ffee88" } });
  assert.ok(ratio(blob.colors.highlight, "#ffffff") >= 3, blob.colors.highlight);
  const bar = Styles.resolveStyle("brand_bar", { brand: { ...dark, primary: "#ffcc00", accent: "#ffcc00" } });
  assert.ok(ratio(bar.colors.box, "#ffffff") >= 4.5 && ratio(bar.colors.highlight, bar.colors.box) >= 3);
  assert.equal(Styles.resolveStyle("bold_pop", {}).colors.highlight, Styles.DEFAULT_HIGHLIGHT);
});

// ======================================================================== group
section("captions/group");

const ATOMIC_PAIRS = [["s1", "3", "hours"], ["s5", "10", "AM"], ["s5", "4", "PM."], ["s8", "two", "weeks"], ["s10", "Google", "Calendar"]];

t("line limits hold for every style: lines, words per line, chars per line, measured width", () => {
  const ow = identityOutWords(WORDS);
  for (const id of Styles.STYLE_IDS) {
    for (const aspect of ["9:16", "16:9", "1:1"]) {
      const style = Styles.resolveStyle(id, { aspect });
      const output = S.outputDims(aspect);
      const cues = G.buildCues(ow, style, output, "en", { maxWordsPerLine: 3 });
      assert.equal(cues.reduce((n, c) => n + c.words.length, 0), WORDS.length, `${id}: every word captioned once`);
      for (const c of cues) {
        assert.ok(c.lines.length <= style.maxLines, `${id} ${aspect}: ${c.lines.length} lines`);
        for (const line of c.lines) {
          const words = line.split(" ").length;
          const single = c.words.length <= 2 && c.lines.length === 1;
          assert.ok(words <= Math.min(3, style.maxWordsPerLine) || single, `${id} ${aspect}: '${line}' has ${words} words`);
          assert.ok(line.length <= style.maxCharsPerLine || line.split(" ").length <= 2, `${id} ${aspect}: '${line}' too long`);
          assert.ok(G.measureText(line, style, "en") <= output.width * 0.88 + 1e-6 || words <= 2, `${id} ${aspect}: '${line}' too wide`);
        }
        assert.match(c.id, /^c_\d+$/);
        assert.ok(S.CueSchema.safeParse(c).success);
      }
    }
  }
});

t("number+unit and capitalized names are never split across lines or cues", () => {
  const ow = identityOutWords(WORDS);
  for (const id of Styles.STYLE_IDS) {
    const style = Styles.resolveStyle(id, { aspect: "9:16" });
    const cues = G.buildCues(ow, style, { width: 1080, height: 1920 }, "en", { maxWordsPerLine: 1 });
    for (const [sid, a, b] of ATOMIC_PAIRS) {
      const ia = wi(sid, a);
      const cue = cueWithKey(cues, `w${ia}`);
      assert.ok(cue.words.some((w) => w.key === `w${ia + 1}`), `${id}: '${a} ${b}' split across cues`);
      assert.ok(cue.lines.some((l) => l.includes(`${a} ${b}`)), `${id}: '${a} ${b}' split across lines`);
    }
  }
});

t("cues break at sentence ends, stay ≤ 2.5 s in words mode and last ≥ 0.5 s without overlapping", () => {
  const style = Styles.resolveStyle("clean", { aspect: "9:16" });
  const cues = G.buildCues(identityOutWords(WORDS), style, { width: 1080, height: 1920 }, "en", { maxWordsPerLine: 3 });
  for (let k = 0; k < cues.length; k++) {
    const c = cues[k];
    const sids = new Set(c.words.map((w) => WORDS[w.i].sentenceId));
    assert.equal(sids.size, 1, `cue ${c.id} spans sentences`);
    const spoken = c.words[c.words.length - 1].outEnd - c.words[0].outStart;
    assert.ok(spoken <= 2.5 + 1e-9 || c.words.length <= 2, `cue ${c.id} spoken ${spoken}s`);
    const next = cues[k + 1];
    if (next) assert.ok(c.resolved.outOut <= next.resolved.outIn + 1e-9);
    const room = next ? next.resolved.outIn - c.resolved.outIn : Infinity;
    assert.ok(c.resolved.outOut - c.resolved.outIn >= Math.min(0.5, room) - 1e-6, `cue ${c.id} too short`);
    assert.ok(c.resolved.outOut >= c.words[c.words.length - 1].outEnd - 1e-9);
  }
});

t("reading speed above the cap splits cues (20 cps en, 8 cps ja)", () => {
  const fast = [];
  let tt = 0;
  for (let k = 0; k < 10; k++) { fast.push({ key: `w${k}`, i: k, text: "extraordinarily", outStart: tt, outEnd: tt + 0.22, srcStart: tt, srcEnd: tt + 0.22, conf: 0.95, sentenceId: "sx" }); tt += 0.24; }
  fast[fast.length - 1].text = "extraordinarily.";
  const style = Styles.resolveStyle("minimal_lower", { aspect: "16:9" });
  const cues = G.buildCues(fast, style, { width: 1920, height: 1080 }, "en", { maxWordsPerLine: 3 });
  const unsplit = G.buildCues(fast, style, { width: 1920, height: 1080 }, "en", { maxWordsPerLine: 3, readingCps: 1000 });
  assert.ok(cues.length > unsplit.length, `${cues.length} vs ${unsplit.length}`);
  for (const c of cues) {
    const cps = G.charCount(c.text, "en") / (c.resolved.outOut - c.resolved.outIn);
    assert.ok(cps <= 20 + 1e-6 || c.words.length === 1, `cue '${c.text}' at ${cps.toFixed(1)} cps`);
  }
  // 15 characters in ~1.1 s ≈ 14 cps, above the 8 cps Japanese cap
  const jaWords = ["今日", "は", "とても", "大事な", "話", "を", "します。"].map((text, k) => ({ key: `w${k}`, i: k, text, outStart: k * 0.16, outEnd: k * 0.16 + 0.15, srcStart: k * 0.16, srcEnd: k * 0.16 + 0.15, conf: 0.95, sentenceId: "j1" }));
  const jaStyle = Styles.resolveStyle("clean", { lang: "ja" });
  const ja = G.buildCues(jaWords, jaStyle, { width: 1080, height: 1920 }, "ja", { maxWordsPerLine: 3 });
  const jaUnsplit = G.buildCues(jaWords, jaStyle, { width: 1080, height: 1920 }, "ja", { maxWordsPerLine: 3, readingCps: 1000 });
  assert.ok(ja.length > jaUnsplit.length, `ja cues ${ja.length} vs ${jaUnsplit.length}`);
  for (const c of ja) {
    const cps = G.charCount(c.text, "ja") / (c.resolved.outOut - c.resolved.outIn);
    assert.ok(cps <= 8 + 1e-6 || c.words.length === 1, `ja cue '${c.text}' at ${cps.toFixed(1)} cps`);
  }
  assert.ok(ja.every((c) => !c.text.includes(" ")), "no spaces joined into Japanese text");
});

t("cue ids are stable when an earlier sentence is removed and times shift", () => {
  const style = Styles.resolveStyle("bold_pop", { aspect: "9:16" });
  const all = identityOutWords(WORDS);
  const s2 = sentence("s2");
  const shift = s2.end - s2.start + 0.5;
  const cut = all.filter((w) => w.sentenceId !== "s2").map((w) => (w.i > s2.w1 ? { ...w, outStart: w.outStart - shift, outEnd: w.outEnd - shift } : w));
  const a = G.buildCues(all, style, { width: 1080, height: 1920 }, "en", { maxWordsPerLine: 3 });
  const b = G.buildCues(cut, style, { width: 1080, height: 1920 }, "en", { maxWordsPerLine: 3 });
  const tail = (cues) => cues.filter((c) => c.anchor.w0 > s2.w1).map((c) => `${c.id}|${c.text}`);
  assert.deepEqual(tail(b), tail(a));
  assert.ok(!b.some((c) => c.words.some((w) => w.i >= s2.w0 && w.i <= s2.w1)));
});

t("approx timing with low mean confidence yields proportional cues", () => {
  const style = Styles.resolveStyle("clean", { aspect: "9:16" });
  const low = identityOutWords(WORDS.slice(0, 20)).map((w) => ({ ...w, conf: 0.3 }));
  assert.ok(G.buildCues(low, style, { width: 1080, height: 1920 }, "en", { timing: "approx" }).every((c) => c.timingMode === "proportional"));
  assert.ok(G.buildCues(low, style, { width: 1080, height: 1920 }, "en", { timing: "word" }).every((c) => c.timingMode === "words"));
});

// ======================================================================== place
section("captions/place");

const PLACE_STYLE = Styles.resolveStyle("bold_pop", { aspect: "9:16" });
const OUT_916 = { width: 1080, height: 1920 };
const mkCue = (k, start, dur = 0.5, text = "NOTIFICATIONS OFF") => ({ id: `c_${k}`, anchor: { kind: "words", w0: k, w1: k }, resolved: { outIn: start, outOut: start + dur, collapsed: false },
  text, lines: [text], words: [], timingMode: "words", pos: null, hidden: false, edited: false });

t("default bottom band; a face in the band moves the cue to the top band", () => {
  const cues = [mkCue(0, 0), mkCue(1, 1)];
  const none = Place.placeCues(cues, { style: PLACE_STYLE, output: OUT_916 });
  assert.ok(none.every((c) => c.pos.an === 2 && c.pos.y === 0.72));
  const lowFace = [{ t: 0, cx: 0.5, cy: 0.66, h: 0.2 }];
  const moved = Place.placeCues(cues, { style: PLACE_STYLE, output: OUT_916, faceTrackOut: lowFace });
  assert.ok(moved.every((c) => c.pos.an === 8 && c.pos.y === 0.14));
  const unmoved = Place.placeCues(cues, { style: PLACE_STYLE, output: OUT_916, faceTrackOut: lowFace, faceAvoid: false });
  assert.ok(unmoved.every((c) => c.pos.an === 2));
  assert.equal(cues[0].pos, null, "input cues not mutated");
});

t("hysteresis: at most one position change per 4 s for moderate face overlap", () => {
  const cues = [], track = [];
  for (let k = 0; k < 20; k++) {
    const t0 = k * 1.2;
    cues.push(mkCue(k, t0));
    const low = k % 2 === 0;
    for (const dt of [-0.05, 0.6]) track.push({ t: t0 + dt, cx: 0.5, cy: low ? 0.66 : 0.35, h: 0.12 });
  }
  const placed = Place.placeCues(cues, { style: PLACE_STYLE, output: OUT_916, faceTrackOut: track });
  const changes = [];
  for (let k = 1; k < placed.length; k++) if (placed[k].pos.an !== placed[k - 1].pos.an) changes.push(placed[k].resolved.outIn);
  assert.ok(changes.length >= 2, `expected some changes, got ${changes.length}`);
  for (let k = 1; k < changes.length; k++) assert.ok(changes[k] - changes[k - 1] >= 4 - 1e-9, `changes ${changes.join(", ")}`);
});

t("a severe face overlap forces a change inside the hysteresis window", () => {
  const cues = [mkCue(0, 0), mkCue(1, 1.2), mkCue(2, 2.4)];
  const track = [
    { t: -0.05, cx: 0.5, cy: 0.66, h: 0.3 }, { t: 0.6, cx: 0.5, cy: 0.66, h: 0.3 },
    { t: 1.15, cx: 0.5, cy: 0.3, h: 0.2 }, { t: 1.8, cx: 0.5, cy: 0.3, h: 0.2 },
    { t: 2.35, cx: 0.5, cy: 0.66, h: 0.3 }, { t: 3.0, cx: 0.5, cy: 0.66, h: 0.3 },
  ];
  const placed = Place.placeCues(cues, { style: PLACE_STYLE, output: OUT_916, faceTrackOut: track });
  assert.deepEqual(placed.map((c) => c.pos.an), [8, 2, 8]);
});

t("SPLIT sits on the seam, FULL B-roll keeps the default band, overrides clamp to the safe band", () => {
  const cues = [mkCue(0, 0), mkCue(1, 1)];
  const lowFace = [{ t: 0, cx: 0.5, cy: 0.66, h: 0.3 }];
  const split = Place.placeCues(cues, { style: PLACE_STYLE, output: OUT_916, splitRanges: [{ outIn: 0, outOut: 5 }], faceTrackOut: lowFace });
  assert.ok(split.every((c) => c.pos.an === 5 && c.pos.y === 0.5));
  const full = Place.placeCues(cues, { style: PLACE_STYLE, output: OUT_916, fullBrollRanges: [{ outIn: 0, outOut: 5 }], faceTrackOut: lowFace });
  assert.ok(full.every((c) => c.pos.an === 2 && c.pos.y === 0.72));
  const pinned = Place.placeCues(cues, { style: PLACE_STYLE, output: OUT_916, cueY: { c_0: 0.95 }, yOverride: 0.02 });
  assert.deepEqual(pinned[0].pos, { x: 0.5, y: 0.8, an: 2 });
  assert.deepEqual(pinned[1].pos, { x: 0.5, y: 0.14, an: 8 });
  const top = Place.placeCues(cues, { style: PLACE_STYLE, output: OUT_916, policy: "top" });
  assert.ok(top.every((c) => c.pos.an === 8));
  const land = Place.placeCues(cues, { style: Styles.resolveStyle("clean", { aspect: "16:9" }), output: { width: 1920, height: 1080 } });
  assert.ok(land.every((c) => c.pos.y === 0.9));
});

t("a graphic in the caption band pushes cues to the other band", () => {
  const cues = [mkCue(0, 0), mkCue(1, 1)];
  const placed = Place.placeCues(cues, { style: PLACE_STYLE, output: OUT_916, overlays: [{ outIn: 0, outOut: 3, box: { x: 0.05, y: 0.62, w: 0.9, h: 0.22 } }] });
  assert.ok(placed.every((c) => c.pos.an === 8));
});

// ======================================================================== ai/llm
section("ai/llm — callJson");

const ItemsSchema = z.object({ items: z.array(z.object({ id: z.string(), score: z.number().min(0).max(1) })).min(1) });
function fakeChat(replies) {
  const calls = [];
  const fn = async (args) => {
    calls.push(JSON.parse(JSON.stringify({ ...args, signal: undefined })));
    const r = replies[Math.min(calls.length - 1, replies.length - 1)];
    if (r instanceof Error) throw r;
    return typeof r === "function" ? r(args) : r;
  };
  fn.calls = calls;
  return fn;
}
const reply = (text, extra = {}) => ({ text, tokensIn: 120, tokensOut: 40, costUsd: 0.0002, model: "meta/muse-spark-1.3-contributor", ...extra });
const tracker = () => ({ entries: [], addLlm(e) { this.entries.push(e); } });
const GOOD = JSON.stringify({ items: [{ id: "A", score: 0.8 }] });

t("success on the first reply: value, json mode, tracker mapping", async () => {
  const chat = fakeChat([reply(GOOD)]);
  const tr = tracker();
  const costs = [];
  const r = await callJson({ stage: "ve_director", system: "sys", user: "hello", schema: ItemsSchema, chat, tracker: tr, onCost: (c) => costs.push(c) });
  assert.deepEqual(r.value, { items: [{ id: "A", score: 0.8 }] });
  assert.deepEqual([r.cached, r.modelFallback, r.attempts, r.tokensIn, r.tokensOut], [false, false, 1, 120, 40]);
  assert.equal(chat.calls.length, 1);
  assert.equal(chat.calls[0].jsonMode, true);
  assert.equal(chat.calls[0].temperature, 0);
  assert.deepEqual(tr.entries, [{ inputTokens: 120, outputTokens: 40, stage: "ve_director", costUsd: 0.0002 }]);
  assert.equal(costs[0].attempt, 1);
});

t("lenient parse accepts fences and trailing junk", async () => {
  const chat = fakeChat([reply("```json\n" + GOOD + "\n``` hope this helps {")]);
  const r = await callJson({ stage: "ve_content", system: "s", user: "u", schema: ItemsSchema, chat });
  assert.equal(r.value.items[0].id, "A");
});

t("one repair re-ask with the validation issues (string user) succeeds", async () => {
  const chat = fakeChat([reply(JSON.stringify({ items: [{ id: "A", score: 7 }] })), reply(GOOD)]);
  const tr = tracker();
  const r = await callJson({ stage: "ve_director", system: "s", user: "rank these", schema: ItemsSchema, chat, tracker: tr });
  assert.equal(r.attempts, 2);
  assert.equal(chat.calls.length, 2);
  const u = chat.calls[1].user;
  assert.ok(u.startsWith("rank these\n\nYour previous reply failed validation: items.0.score"), u);
  assert.ok(u.endsWith("Return ONLY the corrected JSON object."));
  assert.equal(tr.entries.length, 2);
  assert.ok(Math.abs(r.costUsd - 0.0004) < 1e-12 && r.tokensIn === 240);
});

t("repair for array user content pushes an extra text part", async () => {
  const user = [{ type: "text", text: "FRAME A" }, { type: "image_url", image_url: { url: "data:image/jpeg;base64,AAAA" } }];
  const chat = fakeChat([reply("not json at all"), reply(GOOD)]);
  await callJson({ stage: "ve_faces", system: "s", user, schema: ItemsSchema, chat });
  const u2 = chat.calls[1].user;
  assert.equal(u2.length, 3);
  assert.deepEqual(u2.slice(0, 2), user);
  assert.equal(u2[2].type, "text");
  assert.match(u2[2].text, /^Your previous reply failed validation: .*Return ONLY the corrected JSON object\.$/s);
  assert.equal(user.length, 2, "caller's array not mutated");
});

t("two invalid replies throw LLM_INVALID_JSON after exactly one repair", async () => {
  const chat = fakeChat([reply("{\"items\":[]}"), reply("{\"items\":[]}"), reply(GOOD)]);
  await assert.rejects(callJson({ stage: "ve_qa", system: "s", user: "u", schema: ItemsSchema, chat }), (e) => {
    assert.ok(isEditError(e));
    assert.deepEqual([e.code, e.errorClass, e.retryable, e.stage], ["LLM_INVALID_JSON", "provider", true, "ve_qa"]);
    assert.match(e.detail, /items/);
    return true;
  });
  assert.equal(chat.calls.length, 2);
});

t("a top-level array is rejected (object envelope required) and repaired", async () => {
  const chat = fakeChat([reply(JSON.stringify([{ id: "A", score: 0.8 }])), reply(GOOD)]);
  const r = await callJson({ stage: "ve_faces", system: "s", user: "u", schema: ItemsSchema, chat });
  assert.equal(r.attempts, 2);
  assert.match(chat.calls[1].user, /top-level JSON array/);
  const always = fakeChat([reply("[1,2]")]);
  await assert.rejects(callJson({ stage: "ve_faces", system: "s", user: "u", schema: z.object({}).passthrough(), chat: always }), (e) => e.code === "LLM_INVALID_JSON");
});

t("cache: the second identical call is a free hit; a new promptVersion misses", async () => {
  const cacheDir = path.join(tmp.dir, "llm-cache");
  const chat = fakeChat([reply(GOOD)]);
  const args = { stage: "ve_content", system: "s", user: "same input", schema: ItemsSchema, chat, cacheDir, promptVersion: "v1", model: "meta/muse-spark-1.3-contributor", now: () => NOW };
  const first = await callJson(args);
  const second = await callJson(args);
  assert.equal(chat.calls.length, 1);
  assert.deepEqual([first.cached, second.cached, second.costUsd, second.tokensIn], [false, true, 0, 0]);
  assert.deepEqual(second.value, first.value);
  const files = fs.readdirSync(cacheDir).filter((f) => f.endsWith(".json"));
  assert.equal(files.length, 1);
  assert.match(files[0], /^[0-9a-f]{64}\.json$/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(cacheDir, files[0]), "utf8")).createdAt, NOW);
  await callJson({ ...args, promptVersion: "v2" });
  assert.equal(chat.calls.length, 2);
});

t("model fallback is surfaced as a MODEL_FALLBACK notice", async () => {
  const chat = fakeChat([reply(GOOD, { model: "google/gemini-3.5-flash-lite" })]);
  const notices = [];
  const r = await callJson({ stage: "ve_broll_judge", system: "s", user: "u", schema: ItemsSchema, chat, model: "google/gemini-3.5-flash", onNotice: (n) => notices.push(n) });
  assert.equal(r.modelFallback, true);
  assert.equal(r.model, "google/gemini-3.5-flash-lite");
  assert.deepEqual(r.notices, [{ code: "MODEL_FALLBACK", stage: "ve_broll_judge", requested: "google/gemini-3.5-flash", used: "google/gemini-3.5-flash-lite" }]);
  assert.deepEqual(notices, r.notices);
  const same = await callJson({ stage: "ve_broll_judge", system: "s", user: "u", schema: ItemsSchema, chat: fakeChat([reply(GOOD, { model: "google/gemini-3.5-flash" })]), model: "google/gemini-3.5-flash" });
  assert.equal(same.modelFallback, false);
});

t("provider errors are classified; aborts are cancelled; bad requests are bugs", async () => {
  const err = (status, message = "boom") => Object.assign(new Error(message), { status });
  const cases = [[err(429), "transient", true], [err(503), "transient", true], [err(402), "budget", false], [err(401), "config", false], [new Error("Connection error."), "transient", true], [err(418), "provider", false]];
  for (const [e, cls, retryable] of cases) {
    await assert.rejects(callJson({ stage: "ve_content", system: "s", user: "u", schema: ItemsSchema, chat: fakeChat([e]) }), (x) => x.code === "LLM_CALL_FAILED" && x.errorClass === cls && x.retryable === retryable);
  }
  const ac = new AbortController();
  ac.abort();
  const chat = fakeChat([reply(GOOD)]);
  await assert.rejects(callJson({ stage: "ve_content", system: "s", user: "u", schema: ItemsSchema, chat, signal: ac.signal }), (x) => x.code === "LLM_ABORTED" && x.errorClass === "cancelled");
  assert.equal(chat.calls.length, 0);
  await assert.rejects(callJson({ stage: "ve_content", system: "s", user: "u", chat }), (x) => x.code === "LLM_BAD_REQUEST");
  await assert.rejects(callJson({ system: "s", user: "u", schema: ItemsSchema, chat }), (x) => x.code === "LLM_BAD_REQUEST");
});

// ======================================================================== ai/llm_guard
section("ai/llm_guard — payload policy");

const img = (bytes = 100, mime = "image/jpeg") => ({ type: "image_url", image_url: { url: `data:${mime};base64,${"A".repeat(bytes)}` } });

t("accepts text, ≤ 8 images and audio parts (incl. KIE audio data URIs inside image_url)", () => {
  assert.deepEqual(assertPayload("plain text"), { images: 0, audioParts: 0, textParts: 1, base64Bytes: 0 });
  const r = assertPayload([{ type: "text", text: "x" }, ...Array.from({ length: 7 }, () => img(1000)),
    { type: "input_audio", input_audio: { data: "B".repeat(500), format: "wav" } }, img(700, "audio/wav"), { type: "image_url", image_url: { url: "https://images.pexels.com/photos/1/a.jpg" } }]);
  assert.deepEqual(r, { images: 8, audioParts: 2, textParts: 1, base64Bytes: 8200 });
  assert.equal(assertPayload(Array.from({ length: 8 }, () => img(10))).images, 8, "exactly 8 images is allowed");
});

t("rejects video, too many images, oversize payloads and unknown part types", () => {
  const code = (fn) => { try { fn(); } catch (e) { assert.ok(isEditError(e)); assert.equal(e.errorClass, "bug"); return e.code; } return null; };
  assert.equal(code(() => assertPayload([img(10, "video/mp4")])), "LLM_PAYLOAD_VIDEO");
  assert.equal(code(() => assertPayload([{ type: "image_url", image_url: { url: "https://cdn.example.com/clip.mp4" } }])), "LLM_PAYLOAD_VIDEO");
  assert.equal(code(() => assertPayload([{ type: "file", file: { file_data: "x" } }])), "LLM_PAYLOAD_VIDEO");
  assert.equal(code(() => assertPayload([{ type: "video_url", video_url: { url: "x" } }])), "LLM_PAYLOAD_VIDEO");
  assert.equal(code(() => assertPayload(Array.from({ length: 9 }, () => img(10)))), "LLM_PAYLOAD_TOO_MANY_IMAGES");
  assert.equal(code(() => assertPayload([img(1.6e6)])), "LLM_PAYLOAD_TOO_LARGE");
  assert.equal(code(() => assertPayload([img(900), img(900)], { maxTotalBase64Bytes: 1500 })), "LLM_PAYLOAD_TOO_LARGE");
  assert.equal(code(() => assertPayload([img(10, "application/pdf")])), "LLM_PAYLOAD_INVALID");
  assert.equal(code(() => assertPayload([{ type: "image_url", image_url: { url: "http://insecure.example/a.jpg" } }])), "LLM_PAYLOAD_INVALID");
  assert.equal(code(() => assertPayload([{ type: "mystery" }])), "LLM_PAYLOAD_INVALID");
  assert.equal(code(() => assertPayload({ not: "an array" })), "LLM_PAYLOAD_INVALID");
});

t("callJson enforces the guard before any provider call", async () => {
  const chat = fakeChat([reply(GOOD)]);
  await assert.rejects(callJson({ stage: "ve_qa", system: "s", user: [img(10, "video/webm")], schema: ItemsSchema, chat }), (e) => e.code === "LLM_PAYLOAD_VIDEO");
  assert.equal(chat.calls.length, 0);
});

// ======================================================================== review regressions (Phase 4a)
section("review regressions — timeline, captions, placement, styles");

t("quantization keeps every on-grid time on its frame (r6 and ms grids); on-grid cuts keep their frames", () => {
  for (let f = 0; f <= 18000; f++) {
    for (const tt of [T.frameToSec(f), Math.round((f / 30) * 1000) / 1000]) {
      if (T.quantizeIn(tt) !== f || T.quantizeOut(tt) !== f) assert.fail(`frame ${f} (${tt}s) -> in ${T.quantizeIn(tt)} out ${T.quantizeOut(tt)}`);
    }
  }
  const snapped = T.effectiveCuts(mkPlan([{ id: "cut_a", kind: "USER", srcIn: T.snapToFrame(2 / 30), srcOut: T.snapToFrame(10 / 30) }]));
  assert.deepEqual(snapped.cuts.map((g) => [g.inF, g.outF]), [[2, 10]]);
  const sil = T.effectiveCuts(mkPlan([{ id: "cut_s", kind: "SILENCE", srcIn: 1.067, srcOut: 1.333, controlledBy: "removeSilence" }], { removeSilence: true }));
  assert.deepEqual([sil.cuts.length, sil.adjustments.length], [1, 0], "8 frames = 0.267 s is above the 0.25 s minimum");
});

const SHORT_WORDS = [
  { i: 0, text: "I", start: 0.5, end: 0.54, conf: 0.99, sentenceId: "s1" },
  { i: 1, text: "think", start: 0.56, end: 0.9, conf: 0.99, sentenceId: "s1" },
  { i: 2, text: "a", start: 0.92, end: 0.95, conf: 0.99, sentenceId: "s1" },
  { i: 3, text: "lot", start: 0.97, end: 1.3, conf: 0.99, sentenceId: "s1" },
  { i: 4, text: "of", start: 1.3, end: 1.3, conf: 0.99, sentenceId: "s1" },
  { i: 5, text: "people.", start: 1.32, end: 1.8, conf: 0.99, sentenceId: "s1" },
];
const captionKeys = (p) => p.captions.cues.flatMap((c) => c.words.map((w) => w.key));

t("uncut words shorter than 2 frames and zero-length ties stay captioned; only cut words leave the captions", () => {
  const plain = resolvePlan(mkPlan([]), { words: SHORT_WORDS });
  assert.deepEqual(captionKeys(plain), ["w0", "w1", "w2", "w3", "w4", "w5"]);
  assert.ok(S.parsePlan(plain, { wordCount: SHORT_WORDS.length }).ok);
  const cut = resolvePlan(mkPlan([{ id: "cut_x", kind: "USER", srcIn: 0.9, srcOut: 0.967 }]), { words: SHORT_WORDS });
  assert.deepEqual(captionKeys(cut), ["w0", "w1", "w3", "w4", "w5"], "the 30 ms word under the cut is removed, nothing else");
  const sped = mkPlan([]);
  sped.effects = [{ id: "fx_spd", kind: "SPEED", anchor: { kind: "src", srcIn: 0.9, srcOut: 1.31 }, rate: 2, target: "aroll_nonspeech", enabled: true }];
  const fast = resolvePlan(sped, { words: SHORT_WORDS });
  assert.ok(fast.timeline.pieces.some((p) => p.kind === "speed"));
  assert.deepEqual(captionKeys(fast), ["w0", "w1", "w2", "w3", "w4", "w5"], "a 2x SPEED piece does not drop short words");
  for (const w of fast.captions.cues.flatMap((c) => c.words)) assert.ok(w.outEnd >= w.outStart);
});

t("source cues keep the spoken language's grouping, font and placement while a translation is selected", () => {
  const sig = (p) => p.captions.cues.map((c) => [c.id, c.text, c.pos.y, c.pos.an]);
  for (const lang of ["ja", "hi", "ar"]) {
    const p = buildFixturePlan();
    p.captions.language = lang;
    assert.deepEqual(sig(resolvePlan(p, CTX)), sig(RESOLVED), lang);
  }
});

t("hidden-cue words and word-keyed positions follow their words through every style and words-per-line", () => {
  const target = RESOLVED.captions.cues.find((c) => c.words.length >= 3);
  const pinCue = RESOLVED.captions.cues.find((c) => c.words.length >= 2 && c.id !== target.id && c.anchor.w0 > target.anchor.w1 + 5);
  const hiddenKeys = new Set(target.words.map((w) => w.key));
  const pinKeys = new Set(pinCue.words.map((w) => w.key));
  const base = buildFixturePlan();
  base.captions.overrides.hiddenCueWords = [...hiddenKeys];
  base.captions.overrides.cueYWords = Object.fromEntries([...pinKeys].map((k) => [k, 0.3]));
  assert.ok(S.parsePlan(resolvePlan(base, CTX), { wordCount: WORDS.length }).ok);
  for (const styleId of Styles.STYLE_IDS) {
    for (const mwpl of [1, 2, 3]) {
      const p = clone(base);
      p.captions.styleId = styleId;
      p.settings.maxWordsPerLine = mwpl;
      const r = resolvePlan(p, CTX);
      let seen = 0;
      for (const c of r.captions.cues) {
        const inHidden = c.words.filter((w) => hiddenKeys.has(w.key)).length;
        seen += inHidden;
        assert.equal(c.hidden, inHidden > 0, `${styleId}/${mwpl}: ${c.id} hidden=${c.hidden}`);
        if (inHidden) assert.equal(inHidden, c.words.length, `${styleId}/${mwpl}: ${c.id} mixes hidden and visible words`);
        if (c.words.some((w) => pinKeys.has(w.key))) assert.deepEqual([c.pos.y, c.pos.an], [0.3, 8], `${styleId}/${mwpl}: ${c.id} lost its position`);
      }
      assert.equal(seen, hiddenKeys.size);
    }
  }
});

t("cues never end past the output and never overlap when STT words overlap", () => {
  const a = resolvePlan(mkPlan([]), { words: [
    { i: 0, text: "Follow", start: 0.5, end: 0.9, conf: 1, sentenceId: "s1" }, { i: 1, text: "me.", start: 1.4, end: 1.6, conf: 1, sentenceId: "s2" },
  ] });
  const last = a.captions.cues[a.captions.cues.length - 1];
  assert.ok(a.captions.cues.every((c) => c.resolved.outOut <= a.timeline.outDurationSec + 1e-9), JSON.stringify(a.captions.cues.map((c) => c.resolved)));
  assert.ok(last.resolved.outOut - last.resolved.outIn >= 0.5 - 1e-6, "still ≥ 0.5 s, extended backwards");
  assert.ok(last.resolved.outIn >= a.captions.cues[0].resolved.outOut - 1e-9);
  const b = resolvePlan(mkPlan([]), { words: [
    { i: 0, text: "We", start: 0.5, end: 0.7, conf: 1, sentenceId: "s1" }, { i: 1, text: "shipped.", start: 0.72, end: 1.3, conf: 1, sentenceId: "s1" },
    { i: 2, text: "Nobody", start: 1.2, end: 1.6, conf: 1, sentenceId: "s2" }, { i: 3, text: "noticed.", start: 1.62, end: 2.2, conf: 1, sentenceId: "s2" },
  ] });
  assert.equal(b.captions.cues.length, 2);
  assert.ok(b.captions.cues[1].resolved.outIn >= b.captions.cues[0].resolved.outOut - 1e-9, JSON.stringify(b.captions.cues.map((c) => c.resolved)));
  assert.ok(S.parsePlan(b, { wordCount: 4 }).ok);
});

t("after a SPLIT ends, captions leave the seam at once instead of holding it over the face", () => {
  const face = [{ t: 0, cx: 0.5, cy: 0.46, h: 0.3 }, { t: 60, cx: 0.5, cy: 0.46, h: 0.3 }];
  const cues = [mkCue(0, 6, 1, "HERE IS THE THING"), mkCue(1, 10, 1, "WE SHIPPED IT"), mkCue(2, 11.2, 1, "TWO WEEKS EARLY"), mkCue(3, 12.4, 1, "AND NOBODY"), mkCue(4, 13.6, 0.8, "NOTICED")];
  const placed = Place.placeCues(cues, { style: PLACE_STYLE, output: OUT_916, faceTrackOut: face, splitRanges: [{ outIn: 9.5, outOut: 11.05 }] });
  assert.deepEqual(placed.map((c) => [c.pos.y, c.pos.an]), [[0.72, 2], [0.5, 5], [0.72, 2], [0.72, 2], [0.72, 2]]);
  const fw = (0.3 * 0.8 * OUT_916.height) / OUT_916.width;
  const faceBox = { x: 0.5 - fw / 2, y: 0.31, w: fw, h: 0.3 };
  for (const c of placed.slice(2)) assert.ok(Place.overlapFrac(Place.cueBox(c, PLACE_STYLE, OUT_916, c.pos, "en"), faceBox) <= Place.FACE_OVERLAP_MOVE);
});

t("a white or near-white brand accent never makes the text highlight invisible", () => {
  const { ratio } = require("../src/services/brand_kit");
  const pal = (primary, accent) => ({ primary, accent, text: "#ffffff", onAccent: "#000000", source: "user" });
  for (const accent of ["#ffffff", "#fafafa", "#f0f0f0"]) {
    const pop = Styles.resolveStyle("bold_pop", { brand: pal(accent, accent) });
    assert.deepEqual([pop.colors.highlight, pop.colors.emphasis], [Styles.DEFAULT_HIGHLIGHT, Styles.DEFAULT_HIGHLIGHT], accent);
    assert.ok(pop.brand.adjusted.some((a) => a.reason === "highlight vs text"));
    assert.equal(Styles.resolveStyle("single_word", { brand: pal(accent, accent) }).colors.emphasis, Styles.DEFAULT_HIGHLIGHT);
  }
  const blue = Styles.resolveStyle("bold_pop", { brand: pal("#2255dd", "#fafafa") });
  assert.notEqual(blue.colors.highlight, Styles.DEFAULT_HIGHLIGHT, "a distinct brand primary is preferred");
  assert.ok(ratio(blue.colors.highlight, "#000000") >= 3 && ratio(blue.colors.highlight, "#ffffff") < 21);
  const pastel = Styles.resolveStyle("bold_pop", { brand: pal("#ffee88", "#ffee88") });
  assert.ok(!pastel.brand.adjusted.some((a) => /vs text/.test(a.reason)), "a saturated pastel is a visible colour and is kept");
});

run().then(() => { restoreFetch(); tmp.cleanup(); });
