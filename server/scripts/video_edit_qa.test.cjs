// Tests for AI Video Edit QA + auto-repair, pure half (src/video_edit/qa/*): deterministic plan/layout checks,
// pure media-check evaluators, scan-log parsing, the category → repair mapping (totality + ladders + dry-run
// through plan/ops.applyOps), score / verdict / best-lap ledger, and the vision pass with an injected caller.
// Offline: fetch + http/https tripwire, no media (ffmpeg is faked where vision would extract frames).
// Run: node scripts/video_edit_qa.test.cjs

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { createHarness, mkTmp, installFetchTripwire } = require("./lib/video_edit_test_utils.cjs");
const { resolvePlan } = require("../src/video_edit/plan/resolve");
const { applyOps } = require("../src/video_edit/plan/ops");
const T = require("../src/video_edit/plan/timeline");
const { EditError } = require("../src/video_edit/errors");
const { resetBreakers } = require("../src/video_edit/providers/breaker");
const C = require("../src/video_edit/qa/common");
const Q = require("../src/video_edit/qa/checks");
const R = require("../src/video_edit/qa/repair");
const V = require("../src/video_edit/qa/verdict");
const VIS = require("../src/video_edit/qa/vision");
const QA = require("../src/video_edit/qa");

const { t, section, run } = createHarness();
const restoreFetch = installFetchTripwire();
const tmp = mkTmp("ve-qa-");

// ---------------------------------------------------------------- fixtures
const FIX = path.join(__dirname, "fixtures", "video_edit");
const load = (n) => JSON.parse(fs.readFileSync(path.join(FIX, `talking_head_45s.${n}.json`), "utf8"));
const SOURCE = load("source");
const WORDS = load("transcript.words").words;
const TRANSCRIPT = load("transcript");
const FACES = load("faces");
const CONTENT = load("content");
const PLAN_RAW = load("plan");
const NOW = 1757800100000;
const clone = (v) => JSON.parse(JSON.stringify(v));
const CTX = { words: WORDS, sentences: TRANSCRIPT.sentences, faces: FACES, content: CONTENT, mezz: { w: SOURCE.width, h: SOURCE.height }, now: NOW };
const P = resolvePlan(PLAN_RAW, CTX);
const D = P.timeline.outDurationSec;
const cats = (list) => list.map((f) => f.category);
const base = (plan, extra = {}) => ({ plan, words: WORDS, faces: FACES, mezz: CTX.mezz, ...extra });
const reportOf = (issues, extra = {}) => ({ issues, visionUnverified: false, ...extra });

// Output time where the A-roll is visible (no B-roll), a cue shown there, and its face-free / face-covering boxes.
const brollRanges = P.broll.filter((b) => b.status !== "removed").map((b) => [b.resolved.outIn, b.resolved.outOut]);
const inBroll = (x) => brollRanges.some((r) => x >= r[0] - 0.5 && x <= r[1] + 0.5);
const AROLL_CUE = P.captions.cues.find((c) => !c.hidden && c.resolved.outIn > 4 && !inBroll(c.resolved.outIn) && !inBroll(c.resolved.outOut));
const FULL_CROP = { pieceId: "all", outIn: 0, outOut: D, x: 0, y: 0, w: 1080, h: 1920 };
function layoutWith(elements, crops = [FULL_CROP]) {
  return { elements, crops, output: { w: 1080, h: 1920 }, durationFrames: Math.round(D * 30) };
}

function jpegStubProc() {
  return {
    ffmpeg: async (args) => { fs.writeFileSync(args[args.length - 1], Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])); return { code: 0, stdout: "", stderr: "" }; },
  };
}
const okBudget = async () => ({ remaining: 10 });

// ======================================================================== common
section("qa/common — vocabulary");

t("QA_CATEGORIES matches ENGINE.md §7 (26 categories, visual ones first)", () => {
  assert.strictEqual(C.QA_CATEGORIES.length, 26);
  assert.deepStrictEqual(VIS.QaCategory.options, [...C.QA_CATEGORIES]);
  assert.strictEqual(VIS.VISUAL_CATEGORIES[VIS.VISUAL_CATEGORIES.length - 1], "OTHER");
  assert.throws(() => C.makeFinding({ severity: "major", category: "NOPE", area: "x", detail: "d" }));
  assert.throws(() => C.makeFinding({ severity: "fatal", category: "OTHER", area: "x", detail: "d" }));
  const f = C.makeFinding({ severity: "minor", category: "OTHER", area: "x", atSec: 1.23456, detail: "d".repeat(400) });
  assert.strictEqual(f.class, "Q");
  assert.strictEqual(f.atSec, 1.235);
  assert.ok(f.detail.length <= 240);
});

// ======================================================================== plan checks
section("qa/checks — plan checks on the fixture plan");

t("the fixture plan is clean without a layout (layout checks reported unverified)", () => {
  const r = Q.runPlanChecks(base(P));
  assert.deepStrictEqual(cats(r.findings), []);
  assert.deepStrictEqual(r.unverified, ["layout"]);
  assert.strictEqual(r.signals.captionCoverage, 1);
  assert.ok(r.signals.brollCoverage > 0 && r.signals.brollCoverage < 0.6);
  assert.ok(r.signals.faceCoveredRatio >= 0 && r.signals.faceCoveredRatio < 0.5);
});

function clippedPlan() {
  const raw = clone(PLAN_RAW);
  const effective = P.cuts.filter((c) => c.kind === "SILENCE" && T.isEffective(c, P.settings));
  for (const c of effective) {
    const w = WORDS.filter((x) => x.end <= c.srcIn + 1e-6).pop();
    if (!w || w.end - w.start < 0.2) continue;
    const cut = raw.cuts.find((x) => x.id === c.id);
    cut.srcIn = Math.round((w.end - 0.08) * 1000) / 1000;
    cut.raw.srcIn = cut.srcIn;
    return { plan: resolvePlan(raw, CTX), cutId: c.id, word: w };
  }
  throw new Error("no silence cut after a long word");
}

t("CLIPPED_WORD: a cut edge inside a word is a Q blocker naming the cut; the repair clears it", () => {
  const { plan, cutId, word } = clippedPlan();
  const found = Q.checkCutsInsideWords(Q.buildContext(base(plan)));
  assert.strictEqual(found.length, 1);
  const f = found[0];
  assert.strictEqual(f.category, "CLIPPED_WORD");
  assert.strictEqual(f.severity, "blocker");
  assert.strictEqual(f.class, "Q");
  assert.strictEqual(f.elementId, cutId);
  assert.strictEqual(f.data.cutId, cutId);
  assert.strictEqual(f.data.toggle, false);
  // word mostly kept → the cut shrinks to start 60 ms after the word
  const cut = plan.cuts.find((c) => c.id === cutId);
  assert.ok(Math.abs(cut.raw.srcIn + f.data.padStart - (word.end + 0.06)) < 0.002);

  const rep = QA.planRepairs(reportOf(found), plan, { ...CTX });
  assert.deepStrictEqual(rep.ops.map((o) => o.type), ["cut.adjust"]);
  const next = applyOps(plan, rep.ops, { ...CTX, author: "qa-repair", batchId: "qa-1" }).plan;
  assert.deepStrictEqual(Q.checkCutsInsideWords(Q.buildContext(base(next))), []);
});

t("CLIPPED_WORD ignores an inaudible sliver of a word the cut removes (retake pre-roll), not a longer remainder", () => {
  const { cutId, word } = clippedPlan();
  const withEdge = (offset) => {
    const raw = clone(PLAN_RAW);
    const cut = raw.cuts.find((x) => x.id === cutId);
    cut.srcIn = Math.round((word.start + offset) * 1000) / 1000;   // the cut now removes most of `word`
    cut.raw.srcIn = cut.srcIn;
    return Q.checkCutsInsideWords(Q.buildContext(base(resolvePlan(raw, CTX))));
  };
  assert.deepStrictEqual(withEdge(0.06), [], "60 ms left of a removed word is the retake pre-roll, not a clipped word");
  assert.strictEqual(withEdge(0.15).length, 1, "150 ms of it would be heard");
});

t("CLIPPED_WORD margin widens to 120 ms under approx timing", () => {
  const { plan } = clippedPlan();
  const approx = Q.checkCutsInsideWords(Q.buildContext(base(plan, { timing: "approx" })));
  assert.strictEqual(approx.length, 0, "an edge 80 ms from the word end is inside the 120 ms approx margin");
});

function shortPiecePlan() {
  const raw = clone(PLAN_RAW);
  raw.settings.autoJumpCuts = false;
  raw.settings.punchInOnJumpCuts = false;
  const covered = (i) => P.cuts.some((c) => c.wordRange && i >= c.wordRange[0] - 1 && i <= c.wordRange[1] + 1);
  for (let k = 20; k < WORDS.length - 20; k++) {
    if ([k - 2, k - 1, k, k + 1, k + 2].some(covered)) continue;
    const a = WORDS[k - 1], w = WORDS[k], b = WORDS[k + 1];
    const cutA = { srcIn: Math.round((WORDS[k - 2].start - 0.03) * 1000) / 1000, srcOut: Math.round(((a.end + w.start) / 2) * 1000) / 1000 };
    const cutB = { srcIn: Math.round(((w.end + b.start) / 2) * 1000) / 1000, srcOut: Math.round((WORDS[k + 2].end + 0.03) * 1000) / 1000 };
    const len = cutB.srcIn - cutA.srcOut;
    if (len < 0.4 || len > 0.55) continue;
    const mk = (id, r) => ({ id, kind: "USER", srcIn: r.srcIn, srcOut: r.srcOut, raw: { ...r }, snap: { method: "none", padIn: 0, padOut: 0 },
      wordRange: null, confidence: 1, controlledBy: null, enabled: true, userToggled: true, reason: "test", origin: "user", locked: false });
    raw.cuts.push(mk("cut_qa000a", cutA), mk("cut_qa000b", cutB));
    return { plan: resolvePlan(raw, CTX), cutA };
  }
  throw new Error("no word suitable for a short piece");
}

t("AWKWARD_CUT: a kept fragment < 0.6 s is major; the repair disables the shorter neighbour cut", () => {
  const { plan, cutA } = shortPiecePlan();
  const piece = plan.timeline.pieces.find((p) => Math.abs(p.srcIn - cutA.srcOut) < 0.05);
  const found = Q.checkShortPieces(Q.buildContext(base(plan))).filter((f) => Math.abs(f.atSec - piece.outIn) < 0.01);
  assert.strictEqual(found.length, 1);
  assert.strictEqual(found[0].category, "AWKWARD_CUT");
  assert.strictEqual(found[0].severity, "major");
  assert.ok(["cut_qa000a", "cut_qa000b"].includes(found[0].data.cutId));
  const rep = QA.planRepairs(reportOf(found), plan, { ...CTX });
  assert.deepStrictEqual(rep.ops, [{ type: "cut.toggle", cutId: found[0].data.cutId, enabled: false }]);
  const next = applyOps(plan, rep.ops, { ...CTX, author: "qa-repair", batchId: "qa-2" }).plan;
  assert.ok(!Q.checkShortPieces(Q.buildContext(base(next))).some((f) => Math.abs(f.atSec - found[0].atSec) < 0.05));
});

t("CAPTION_TIMING: a cue leading its first word by 0.5 s is major and repaired by caption.rebuildFromWords", () => {
  const plan = clone(P);
  const cue = plan.captions.cues.find((c) => c.id === AROLL_CUE.id);
  cue.resolved.outIn = Math.max(0, cue.words[0].outStart - 0.5);
  const r = Q.checkCaptions(Q.buildContext(base(plan)));
  const f = r.findings.find((x) => x.category === "CAPTION_TIMING" && x.elementId === cue.id);
  assert.ok(f && f.severity === "major");
  const rep = QA.planRepairs(reportOf([f]), P, { ...CTX });
  assert.strictEqual(rep.ops.length, 1);
  assert.strictEqual(rep.ops[0].type, "caption.rebuildFromWords");
  assert.ok(rep.ops[0].range[0] <= cue.resolved.outIn + 1e-3 && rep.ops[0].range[1] >= cue.resolved.outOut - 1e-3);
  assert.throws(() => applyOps(P, rep.ops, { ...CTX, batchId: "user" }), /reserved for QA repair|INVALID_OP|could not be applied/);
});

t("CAPTION_TIMING: approx timing tolerates a 0.2 s lag the word timing does not", () => {
  const plan = clone(P);
  const cue = plan.captions.cues.find((c) => c.id === AROLL_CUE.id);
  cue.resolved.outIn = cue.words[0].outStart + 0.2;
  assert.ok(Q.checkCaptions(Q.buildContext(base(plan))).findings.some((x) => x.category === "CAPTION_TIMING"));
  assert.ok(!Q.checkCaptions(Q.buildContext(base(plan, { timing: "approx" }))).findings.some((x) => x.category === "CAPTION_TIMING"));
});

t("coverage: dropping cues below 98 % of kept non-filler words is a CAPTION_MISMATCH major with rebuild ranges", () => {
  const plan = clone(P);
  plan.captions.cues = plan.captions.cues.filter((c, k) => k % 10 !== 3);
  const r = Q.checkCaptions(Q.buildContext(base(plan)));
  assert.ok(r.coverage < 0.98);
  const f = r.findings.find((x) => x.category === "CAPTION_MISMATCH" && x.data.reason === "coverage");
  assert.ok(f && f.severity === "major" && f.data.ranges.length >= 1);
});

t("removed fillers never shown: a cut filler word inside a cue is a CAPTION_MISMATCH", () => {
  const plan = clone(P);
  const filler = P.cuts.find((c) => c.kind === "FILLER" && c.wordRange && T.isEffective(c, P.settings));
  const w = WORDS[filler.wordRange[0]];
  const cue = plan.captions.cues.find((c) => c.id === AROLL_CUE.id);
  cue.words.push({ key: `w${w.i}`, i: w.i, text: w.text, srcStart: w.start, srcEnd: w.end, outStart: cue.resolved.outOut, outEnd: cue.resolved.outOut, emphasis: false, conf: 1 });
  const f = Q.checkCaptions(Q.buildContext(base(plan))).findings.find((x) => x.data && x.data.reason === "removed_words");
  assert.ok(f && f.category === "CAPTION_MISMATCH");
});

t("reading speed / lines: 3 lines is a minor CAPTION_UNREADABLE → maxWordsPerLine − 1; speed alone is report-only", () => {
  const plan = clone(P);
  const cue = plan.captions.cues.find((c) => c.id === AROLL_CUE.id);
  cue.lines = ["a", "b", "c"];
  const f = Q.checkCaptions(Q.buildContext(base(plan))).findings.find((x) => x.category === "CAPTION_UNREADABLE");
  assert.ok(f && f.severity === "minor" && f.data.reason === "lines");
  const rep = QA.planRepairs(reportOf([f]), P, { ...CTX });
  assert.deepStrictEqual(rep.ops, [{ type: "captions.setStyle", styleId: P.captions.styleId, maxWordsPerLine: 2 }]);
  const speed = R.REPAIRS.CAPTION_UNREADABLE.plan({ ...f, data: { reason: "reading_speed" } }, { plan: P });
  assert.strictEqual(speed.skip, "report_only");
  const vis = R.REPAIRS.CAPTION_UNREADABLE.plan({ ...f, data: null, source: "vision" }, { plan: P });
  assert.deepStrictEqual(vis.ops, [{ type: "captions.setStyle", styleId: R.BOXED_STYLE }]);
});

t("reading speed limit is per script (ja 8 cps)", () => {
  const plan = clone(P);
  const rate = (c) => c.text.replace(/s+/g, "").length / (c.resolved.outOut - c.resolved.outIn);
  const cue = plan.captions.cues.find((c) => !c.hidden && c.words.length > 1 && c.resolved.outOut - c.resolved.outIn >= 0.5 && rate(c) > 9 && rate(c) < 18);
  assert.ok(cue, "a multi-word cue at 9–18 cps");
  const en = Q.checkCaptions(Q.buildContext(base(plan))).findings.filter((x) => x.elementId === cue.id && x.category === "CAPTION_UNREADABLE");
  const ja = Q.checkCaptions(Q.buildContext(base(plan, { language: "ja" }))).findings.filter((x) => x.elementId === cue.id && x.category === "CAPTION_UNREADABLE");
  assert.strictEqual(en.length, 0);
  assert.strictEqual(ja.length, 1);
});

section("qa/checks — layout checks");

t("caption ∩ face > 10 % is major and repaired by caption.setPosition to the other band", () => {
  const c = AROLL_CUE;
  const layout = layoutWith([{ id: c.id, kind: "caption", outIn: c.resolved.outIn, outOut: c.resolved.outOut, box: { x: 240, y: 600, w: 600, h: 160 } }]);
  const pc = Q.buildContext(base(P, { layout }));
  const f = Q.checkCaptionFace(pc);
  assert.strictEqual(f.length, 1);
  assert.strictEqual(f[0].category, "CAPTION_COVERS_FACE");
  assert.strictEqual(f[0].severity, "major");
  const rep = QA.planRepairs(reportOf(f), P, { ...CTX });
  assert.deepStrictEqual(rep.ops, [{ type: "caption.setPosition", cueId: c.id, y: 0.72 }]);
  // an assumed face track caps it at minor
  const assumed = Q.checkCaptionFace(Q.buildContext(base(P, { layout, faces: { mode: "assumed", keyframes: [] } })));
  assert.ok(assumed.every((x) => x.severity === "minor"));
});

t("a caption clear of the face and inside the safe band yields nothing", () => {
  const c = AROLL_CUE;
  const layout = layoutWith([{ id: c.id, kind: "caption", outIn: c.resolved.outIn, outOut: c.resolved.outOut, box: { x: 140, y: 1250, w: 800, h: 130 } }]);
  const r = Q.runPlanChecks(base(P, { layout }));
  assert.deepStrictEqual(cats(r.findings), []);
  assert.deepStrictEqual(r.unverified, []);
});

t("safe areas: 9:16 bottom 20 % is TEXT_OFFSCREEN major; off-frame logo too", () => {
  const c = AROLL_CUE;
  const layout = layoutWith([
    { id: c.id, kind: "caption", outIn: c.resolved.outIn, outOut: c.resolved.outOut, box: { x: 140, y: 1600, w: 800, h: 130 } },
    { id: "logo", kind: "logo", outIn: 0, outOut: D, box: { x: 1000, y: 40, w: 130, h: 130 } },
  ]);
  const f = Q.checkSafeAreas(Q.buildContext(base(P, { layout })));
  assert.deepStrictEqual(f.map((x) => [x.category, x.elementId]), [["TEXT_OFFSCREEN", c.id], ["TEXT_OFFSCREEN", "logo"]]);
  const rep = QA.planRepairs(reportOf(f), P, { ...CTX, layoutKinds: { logo: "logo" } });
  assert.deepStrictEqual(rep.ops.map((o) => o.type).sort(), ["branding.setLogoPlacement", "caption.setPosition"]);
});

t("collisions: logo over a PIP is OVERLAY_COLLISION on the logo → branding.setLogoPlacement flips it down", () => {
  const b = P.broll.find((x) => x.status !== "removed");
  const layout = layoutWith([
    { id: "logo", kind: "logo", outIn: 0, outOut: D, box: { x: 880, y: 80, w: 130, h: 130 } },
    { id: b.id, kind: "pip", outIn: b.resolved.outIn, outOut: b.resolved.outOut, box: { x: 600, y: 60, w: 420, h: 520 } },
  ]);
  const f = Q.checkCollisions(Q.buildContext(base(P, { layout })));
  assert.strictEqual(f.length, 1);
  assert.strictEqual(f[0].elementId, "logo");
  const rep = QA.planRepairs(reportOf(f), P, { ...CTX, layoutKinds: { logo: "logo" } });
  assert.deepStrictEqual(rep.ops, [{ type: "branding.setLogoPlacement", placement: "br", scale: 0.12, opacity: 0.9 }]);
});

t("face inside crop < 95 % of samples is SPEAKER_CROPPED major", () => {
  const layout = layoutWith([], [{ pieceId: "all", outIn: 0, outOut: D, x: 0, y: 1000, w: 1080, h: 920 }]);
  const f = Q.checkFaceInCrop(Q.buildContext(base(P, { layout })));
  assert.strictEqual(f.length, 1);
  assert.strictEqual(f[0].category, "SPEAKER_CROPPED");
  assert.ok(f[0].data.ratio < 0.95);
  assert.deepStrictEqual(Q.checkFaceInCrop(Q.buildContext(base(P, { layout: layoutWith([]) }))), []);
});

section("qa/checks — B-roll, effects, assets");

t("B-roll coverage > 60 %, face covered > 50 % of speech and a cutaway in the first 2 s are three COVERAGE majors", () => {
  const plan = clone(P);
  const live = plan.broll.filter((b) => b.status !== "removed");
  live[0].resolved = { outIn: 0.5, outOut: D * 0.8, collapsed: false };
  live[0].layout = "FULL";
  const r = Q.checkBrollCoverage(Q.buildContext(base(plan)));
  assert.deepStrictEqual(r.findings.map((f) => f.data.reason), ["coverage", "face_covered", "speaker_first"]);
  assert.ok(r.brollCoverage > 0.6 && r.faceCoveredRatio > 0.5);
  const pip = QA.planRepairs(reportOf([r.findings[2]]), plan, { validate: false });
  assert.deepStrictEqual(pip.ops, [{ type: "broll.setLayout", id: live[0].id, layout: "PIP" }]);
});

t("effect density: 5 zooms in 10 s is a minor EFFECT_DENSITY disabling the 2 excess AI zooms", () => {
  const plan = clone(P);
  const proto = plan.effects.find((e) => e.kind === "PUNCH_IN");
  plan.effects = plan.effects.filter((e) => !["PUNCH_IN", "PUNCH_OUT", "ZOOM_EMPHASIS"].includes(e.kind));
  for (let k = 0; k < 5; k++) plan.effects.push({ ...clone(proto), id: `fx_dens${k}`, resolved: { outIn: 20 + k, outOut: 20.6 + k, collapsed: false } });
  plan.transitions = [];
  plan.sfx = [];
  const f = Q.checkEffectDensity(Q.buildContext(base(plan)));
  assert.strictEqual(f.length, 1);
  assert.strictEqual(f[0].severity, "minor");
  assert.deepStrictEqual(f[0].data.disable.map((x) => x.id), ["fx_dens3", "fx_dens4"]);
  const rep = QA.planRepairs(reportOf(f), plan, { validate: false });
  assert.deepStrictEqual(rep.ops, [{ type: "effect.toggle", id: "fx_dens3", enabled: false }, { type: "effect.toggle", id: "fx_dens4", enabled: false }]);
});

t("assets: missing B-roll / failed card / missing chunk / dropped overlays", () => {
  const plan = clone(P);
  plan.broll.find((b) => b.status !== "removed").status = "missing";
  plan.graphics[0].render.status = "failed";
  const pc = Q.buildContext(base(plan, { renderInfo: { missingChunks: [{ outIn: 3, outOut: 9 }], overlaysDropped: true } }));
  const f = Q.checkAssets(pc);
  assert.deepStrictEqual(f.map((x) => [x.category, x.class, x.severity]), [
    ["ASSET_BROKEN", "Q", "blocker"], ["CARD_RENDER_BROKEN", "Q", "blocker"], ["BLACK_OR_BLANK_FRAME", "I", "blocker"], ["ASSET_BROKEN", "Q", "blocker"],
  ]);
});

t("assets: an 'ok' B-roll whose file is gone is ASSET_BROKEN when projectDir is known", () => {
  const f = Q.checkAssets(Q.buildContext(base(P, { projectDir: tmp.dir })));
  assert.ok(f.some((x) => x.category === "ASSET_BROKEN"));
  assert.ok(f.some((x) => x.category === "CARD_RENDER_BROKEN"));
});

section("qa/checks — media evaluators (pure)");

const PROBE_OK = {
  ok: true, format: { format_name: "mov,mp4,m4a,3gp,3g2,mj2" }, durationSec: 10,
  video: { codec_name: "h264", pix_fmt: "yuv420p", sample_aspect_ratio: "1:1", width: 1080, height: 1920, avg_frame_rate: "30/1", r_frame_rate: "30/1" },
  audio: { codec_name: "aac" },
};

t("container: exact h264 yuv420p 1:1 30 fps at output size passes; each deviation is an I blocker", () => {
  assert.deepStrictEqual(Q.checkContainer(PROBE_OK, { width: 1080, height: 1920 }), []);
  const bad = { ...PROBE_OK, video: { ...PROBE_OK.video, codec_name: "hevc", pix_fmt: "yuv444p", sample_aspect_ratio: "4:3", width: 720, avg_frame_rate: "25/1", r_frame_rate: "25/1" } };
  const f = Q.checkContainer(bad, { width: 1080, height: 1920 });
  assert.strictEqual(f.length, 5);
  assert.ok(f.every((x) => x.class === "I" && x.severity === "blocker"));
  assert.strictEqual(Q.checkContainer({ ok: false }, {}).length, 1);
});

t("duration: ±2 frames ok · ≤ 0.5 s major · more is an I blocker", () => {
  assert.deepStrictEqual(Q.checkDuration(10 + 2 / 30, 10).findings, []);
  const m = Q.checkDuration(10 + 5 / 30, 10);
  assert.strictEqual(m.driftFrames, 5);
  assert.deepStrictEqual(m.findings.map((f) => [f.severity, f.class]), [["major", "Q"]]);
  const b = Q.checkDuration(9, 10);
  assert.deepStrictEqual(b.findings.map((f) => [f.severity, f.class]), [["blocker", "I"]]);
});

t("loudness: −14 ±1.5 LU and TP ≤ −1 dBTP; silent / no audio are I blockers", () => {
  assert.deepStrictEqual(Q.checkLoudness({ integratedLufs: -13.7, truePeakDbtp: -1.4 }), []);
  assert.deepStrictEqual(Q.checkLoudness({ integratedLufs: -18, truePeakDbtp: -3 }).map((f) => f.data.reason), ["integrated"]);
  assert.strictEqual(Q.checkLoudness({ integratedLufs: -18 })[0].data.gainDb, 4);
  assert.deepStrictEqual(Q.checkLoudness({ integratedLufs: -14, truePeakDbtp: -0.3 }).map((f) => f.data.reason), ["true_peak"]);
  assert.deepStrictEqual(Q.checkLoudness({ integratedLufs: -70 }).map((f) => [f.class, f.severity]), [["I", "blocker"]]);
  assert.deepStrictEqual(Q.checkLoudness({ hasAudio: false }).map((f) => f.data.reason), ["no_audio"]);
});

t("A/V offset: > 1 frame major; low-correlation measurements are ignored", () => {
  assert.deepStrictEqual(Q.checkAvOffset({ ms: 20, envelopeCorr: 0.9 }), []);
  assert.strictEqual(Q.checkAvOffset({ ms: -50, envelopeCorr: 0.9 })[0].category, "AV_OFFSET");
  assert.deepStrictEqual(Q.checkAvOffset({ ms: 80, envelopeCorr: 0.1 }), []);
  assert.deepStrictEqual(Q.checkAvOffset(null), []);
});

t("parseScanLog: black / freeze / silence pairs, unterminated ranges run to the end, decode errors counted", () => {
  const log = [
    "[blackdetect @ 0x1] black_start:1.2 black_end:2.7 black_duration:1.5",
    "[freezedetect @ 0x2] lavfi.freezedetect.freeze_start: 4.0",
    "[freezedetect @ 0x2] lavfi.freezedetect.freeze_duration: 3.0",
    "[freezedetect @ 0x2] lavfi.freezedetect.freeze_end: 7.0",
    "[silencedetect @ 0x3] silence_start: 8.5",
    "[h264 @ 0x4] error while decoding MB 1 2",
  ].join("\n");
  const s = Q.parseScanLog(log, 10);
  assert.deepStrictEqual(s.black, [{ start: 1.2, end: 2.7 }]);
  assert.deepStrictEqual(s.freeze, [{ start: 4, end: 7 }]);
  assert.deepStrictEqual(s.silence, [{ start: 8.5, end: 10 }]);
  assert.strictEqual(s.decodeErrors, 1);
});

t("checkScans excludes planned dips, holds and full-screen B-roll; silence counts only over expected speech", () => {
  const pc = Q.buildContext(base(P));
  const dip = P.transitions.find((x) => x.kind === "DIP_BLACK");
  const seg = P.aRoll.segments.find((s) => s.id === dip.at.elementId);
  const dipAt = seg.resolved.outOut;
  const b = P.broll.find((x) => x.status !== "removed" && x.layout === "FULL");
  const speech = C.mergeRanges(pc.speech.map((s) => [s.outStart, s.outEnd]));
  const scan = {
    black: [{ start: dipAt - 0.1, end: dipAt + 0.15 }, { start: 5, end: 6.5 }],
    freeze: [{ start: b.resolved.outIn, end: b.resolved.outOut }, { start: 7, end: 10 }],
    silence: [{ start: speech[1][0], end: speech[1][0] + 2.2 }],
    decodeErrors: 0,
  };
  const f = Q.checkScans(scan, pc);
  assert.deepStrictEqual(f.map((x) => [x.category, x.severity, x.class]), [
    ["BLACK_OR_BLANK_FRAME", "blocker", "I"], ["FREEZE", "blocker", "I"], ["SILENCE", "major", "Q"],
  ]);
  const shortBlack = Q.checkScans({ black: [{ start: 5, end: 5.6 }], freeze: [], silence: [], decodeErrors: 0 }, pc);
  assert.deepStrictEqual(shortBlack.map((x) => [x.severity, x.class]), [["major", "Q"]]);
});

// ======================================================================== repair
section("qa/repair — mapping");

t("the category → repair mapping is total and never throws on a bare finding", () => {
  assert.deepStrictEqual(Object.keys(R.REPAIRS).sort(), [...C.QA_CATEGORIES].sort());
  for (const cat of C.QA_CATEGORIES) {
    const entry = R.REPAIRS[cat];
    assert.ok(typeof entry.label === "string" && entry.label, cat);
    assert.strictEqual(typeof entry.plan, "function", cat);
    const out = entry.plan(C.makeFinding({ severity: "major", category: cat, area: "x", atSec: 3, detail: "d" }), { plan: P });
    assert.ok(out && (out.skip || (out.ops && out.ops.length) || (out.actions && out.actions.length)), `${cat} returned nothing`);
  }
  for (const cat of ["EXPOSURE_OR_COLOR_JUMP", "LOGO_PROBLEM", "OTHER"]) assert.strictEqual(R.REPAIRS[cat].plan({}, { plan: P }).skip, "report_only");
});

function brollFinding(item, category) {
  return C.makeFinding({ severity: "major", category, area: "broll", atSec: item.resolved.outIn, elementId: item.id, detail: "d", source: "vision" });
}

t("B-roll: replace with the next best unused candidate (skipping ones with the flagged issue), else remove; locked untouched", () => {
  const plan = clone(P);
  const item = plan.broll.find((b) => b.status !== "removed");
  const mkCand = (id, total, issues = [], p = true) => ({ ...clone(item.chosen), assetId: id, providerId: id, dhash: null, path: p ? `assets/broll/${id}.mp4` : null, scores: { ...item.chosen.scores, total, issues } });
  item.topCandidates = [clone(item.chosen), mkCand("ast_candwm01", 0.95, ["watermark"]), mkCand("ast_candok02", 0.7), mkCand("ast_candok03", 0.8, [], false)];
  const f = brollFinding(item, "BROLL_WATERMARK");
  assert.deepStrictEqual(R.REPAIRS.BROLL_WATERMARK.plan(f, { plan }).ops, [{ type: "broll.replace", id: item.id, candidateId: "ast_candok02" }]);
  assert.deepStrictEqual(R.REPAIRS.BROLL_OFF_TOPIC.plan(f, { plan }).ops, [{ type: "broll.replace", id: item.id, candidateId: "ast_candwm01" }]);
  item.topCandidates = [clone(item.chosen)];
  assert.deepStrictEqual(R.REPAIRS.BROLL_LOW_QUALITY.plan(f, { plan }).ops, [{ type: "broll.remove", id: item.id }]);
  item.locked = true;
  assert.strictEqual(R.REPAIRS.BROLL_LOW_QUALITY.plan(f, { plan }).skip, "locked");
});

t("replace/remove ops dry-run through applyOps (invalid ops are dropped, not batched)", () => {
  const item = P.broll.find((b) => b.status !== "removed");
  const good = brollFinding(item, "BROLL_LOW_QUALITY");
  const short = P.cuts.find((c) => c.raw.srcOut - c.raw.srcIn < 0.5);
  const ghost = C.makeFinding({ severity: "major", category: "CLIPPED_WORD", area: "cuts", atSec: 1, elementId: short.id, detail: "d", data: { cutId: short.id, padStart: 0.3, padEnd: 0.3 } });
  const rep = QA.planRepairs(reportOf([good, ghost]), P, { ...CTX });
  assert.ok(rep.ops.every((o) => o.type !== "cut.adjust"), "the impossible cut.adjust was dropped");
  assert.ok(rep.skipped.some((s) => /^invalid_op/.test(s.reason)));
  applyOps(P, rep.ops, { ...CTX, author: "qa-repair", batchId: "qa-3" });
});

t("ladders: black/freeze re-encode first then nudge a cut; card ASS fallback then off; duration remux then full re-encode", () => {
  const black = C.makeFinding({ severity: "blocker", cls: "I", category: "BLACK_OR_BLANK_FRAME", area: "video", atSec: P.timeline.pieces[1].outIn, detail: "d", data: { ranges: [[3.7, 4.2]] } });
  assert.deepStrictEqual(R.REPAIRS.BLACK_OR_BLANK_FRAME.plan(black, { plan: P }).actions, [{ action: "rerender", level: "chunks", ranges: [[3.7, 4.2]] }]);
  const second = R.REPAIRS.BLACK_OR_BLANK_FRAME.plan(black, { plan: P, previous: { issues: [black] } });
  assert.strictEqual(second.ops[0].type, "cut.adjust");

  const g = P.graphics[0];
  const card = C.makeFinding({ severity: "blocker", category: "CARD_RENDER_BROKEN", area: "cards", atSec: 1, elementId: g.id, detail: "d" });
  assert.strictEqual(R.REPAIRS.CARD_RENDER_BROKEN.plan(card, { plan: P }).actions[0].cardFallback, "ass");
  assert.deepStrictEqual(R.REPAIRS.CARD_RENDER_BROKEN.plan(card, { plan: P, previous: { issues: [card] } }).ops, [{ type: "graphic.toggle", id: g.id, enabled: false }]);

  const dur = Q.checkDuration(D + 0.3, D).findings[0];
  assert.strictEqual(R.REPAIRS.DURATION_MISMATCH.plan(dur, { plan: P }).actions[0].level, "remux");
  assert.strictEqual(R.REPAIRS.DURATION_MISMATCH.plan(dur, { plan: P, previous: { issues: [dur] } }).actions[0].level, "chunks");
  const short = Q.checkDuration(D - 1, D).findings[0];
  assert.strictEqual(R.REPAIRS.DURATION_MISMATCH.plan(short, { plan: P }).actions[0].full, true);
});

t("audio categories map to POST_PROCESSING actions; actions merge per level", () => {
  const loud = Q.checkLoudness({ integratedLufs: -17 })[0];
  const av = Q.checkAvOffset({ ms: 60, envelopeCorr: 0.9 })[0];
  const sil = C.makeFinding({ severity: "major", category: "SILENCE", area: "audio", atSec: 4, detail: "d", data: { ranges: [[4, 6.5]] } });
  const rep = QA.planRepairs(reportOf([loud, av, sil]), P, { validate: false });
  assert.strictEqual(rep.ops.length, 0);
  assert.strictEqual(rep.renderActions.length, 1);
  const a = rep.renderActions[0];
  assert.strictEqual(a.level, "post");
  assert.strictEqual(a.gainDb, 3);
  assert.strictEqual(a.rebuildVoice, true);
  assert.deepStrictEqual(a.ranges, [[4, 6.5]]);
});

t("vision findings are not repaired when the vision verdict is unverified; minSeverity filters", () => {
  const item = P.broll.find((b) => b.status !== "removed");
  const f = brollFinding(item, "BROLL_OFF_TOPIC");
  assert.strictEqual(QA.planRepairs(reportOf([f], { visionUnverified: true }), P, { validate: false }).ops.length, 0);
  assert.strictEqual(QA.planRepairs(reportOf([f]), P, { validate: false }).ops.length, 1);
  const minor = C.makeFinding({ severity: "minor", category: "AWKWARD_CUT", area: "cuts", atSec: 1, detail: "d", data: { cutId: P.cuts[0].id } });
  assert.strictEqual(QA.planRepairs(reportOf([minor]), P, { validate: false, minSeverity: "major" }).ops.length, 0);
});

// ======================================================================== verdict
section("qa/verdict — score, verdict, laps");

const mk = (severity, cls = "Q") => ({ severity, class: cls });
t("score formula 100 − 30·I − 15·Q − 6·major − 2·minor (clamped)", () => {
  const s = V.scoreFindings([mk("blocker", "I"), mk("blocker"), mk("major"), mk("minor"), mk("minor")]);
  assert.strictEqual(s.score, 100 - 30 - 15 - 6 - 4);
  assert.deepStrictEqual(s.counts, { blockers: 2, majors: 1, minors: 2 });
  assert.strictEqual(V.scoreFindings(Array(20).fill(mk("blocker"))).score, 0);
});

t("verdict rules: blocked · weak · review · clean", () => {
  assert.strictEqual(V.verdictFor({ score: 95, iBlockers: 1 }), "blocked");
  assert.strictEqual(V.verdictFor({ score: 70, qBlockers: 2 }), "weak");
  assert.strictEqual(V.verdictFor({ score: 45 }), "weak");
  assert.strictEqual(V.verdictFor({ score: 85, qBlockers: 1 }), "review");
  assert.strictEqual(V.verdictFor({ score: 94, majors: 1 }), "review");
  assert.strictEqual(V.verdictFor({ score: 78 }), "review");
  assert.strictEqual(V.verdictFor({ score: 96 }), "clean");
});

t("best lap: no I blocker > fewer Q blockers > higher score > later lap", () => {
  const L = (lap, score, iBlockers = 0, qBlockers = 0) => ({ lap, score, iBlockers, qBlockers });
  assert.strictEqual(V.pickBestLap([L(0, 95, 1), L(1, 40)]).lap, 1);
  assert.strictEqual(V.pickBestLap([L(0, 60, 0, 0), L(1, 85, 0, 1)]).lap, 0);
  assert.strictEqual(V.pickBestLap([L(0, 80), L(1, 70)]).lap, 0);
  assert.strictEqual(V.pickBestLap([L(0, 80), L(1, 80)]).lap, 1);
  assert.strictEqual(V.pickBestLap([]), null);
});

t("shouldContinue / shouldPromote / maxRepairLaps", () => {
  const L = (lap, score, blockers = 0, majors = 1) => ({ lap, score, counts: { blockers, majors, minors: 0 } });
  assert.deepStrictEqual(V.shouldContinue([L(0, 100, 0, 0)], { opsPlanned: 3 }), { continue: false, reason: "clean" });
  assert.strictEqual(V.shouldContinue([L(0, 80)], { opsPlanned: 0 }).reason, "no_repairs");
  assert.strictEqual(V.shouldContinue([L(0, 80)], { opsPlanned: 2 }).continue, true);
  assert.strictEqual(V.shouldContinue([L(0, 80)], { opsPlanned: 2, budgetOk: false }).reason, "budget");
  assert.strictEqual(V.shouldContinue([L(0, 80), L(1, 70), L(2, 75)], { opsPlanned: 2, maxLaps: 5 }).reason, "no_improvement");
  assert.strictEqual(V.shouldContinue([L(0, 80), L(1, 85), L(2, 88)], { opsPlanned: 2, maxLaps: 2 }).reason, "max_laps");
  assert.strictEqual(V.shouldPromote({ iBlockers: 1, score: 99 }, null), false);
  assert.strictEqual(V.shouldPromote({ iBlockers: 0, score: 70, planHash: "a" }, { score: 80, planHash: "a" }), false);
  assert.strictEqual(V.shouldPromote({ iBlockers: 0, score: 70, planHash: "b" }, { score: 80, planHash: "a" }), true);
  assert.strictEqual(V.maxRepairLaps({ cpus: 2, durationSec: 120 }), 1);
  assert.strictEqual(V.maxRepairLaps({ cpus: 2, durationSec: 60 }), 2);
  assert.strictEqual(V.maxRepairLaps({ cpus: 8, durationSec: 600 }), 2);
});

t("finalReport: ENGINE.md §7 shape, ships the best lap, asks for a restore when an earlier lap wins", () => {
  const issue = { ...C.makeFinding({ severity: "major", category: "SILENCE", area: "audio", atSec: 2, detail: "d" }), repairOp: "rerender post" };
  const lap0 = { lap: 0, renderId: "r0", planRevision: 3, planHash: "h0", verdict: "review", score: 94, counts: { blockers: 0, majors: 1, minors: 0 }, iBlockers: 0, qBlockers: 0, issues: [issue], signals: { sttTiming: "word" }, unverified: false, visionUnverified: false };
  const lap1 = { ...lap0, lap: 1, renderId: "r1", planRevision: 4, score: 70, verdict: "review", counts: { blockers: 1, majors: 1, minors: 0 }, qBlockers: 1 };
  const r = V.finalReport([lap0, lap1]);
  assert.deepStrictEqual(Object.keys(r).sort(), ["counts", "headline", "issues", "laps", "restoreRevision", "score", "shippedLap", "signals", "unverified", "verdict", "visionUnverified"].sort());
  assert.strictEqual(r.shippedLap, 0);
  assert.strictEqual(r.restoreRevision, 3);
  assert.deepStrictEqual(Object.keys(r.issues[0]).sort(), ["area", "atSec", "category", "class", "detail", "elementId", "fix", "repairOp", "severity"]);
  assert.strictEqual(r.laps.length, 2);
  assert.strictEqual(V.finalReport([lap0]).restoreRevision, null);
});

// ======================================================================== vision
section("qa/vision — frames, verdict parsing, fallbacks");

function visionLayout() {
  const b = P.broll.find((x) => x.status !== "removed");
  return layoutWith([
    { id: AROLL_CUE.id, kind: "caption", outIn: AROLL_CUE.resolved.outIn, outOut: AROLL_CUE.resolved.outOut, box: { x: 140, y: 1250, w: 800, h: 130 } },
    { id: b.id, kind: "broll", outIn: b.resolved.outIn, outOut: b.resolved.outOut, box: { x: 0, y: 0, w: 1080, h: 1920 } },
    { id: P.graphics[0].id, kind: "card", outIn: P.graphics[0].resolved.outIn, outOut: P.graphics[0].resolved.outOut, box: { x: 60, y: 260, w: 960, h: 380 } },
    { id: "logo", kind: "logo", outIn: 0, outOut: D, box: { x: 900, y: 260, w: 120, h: 120 } },
  ]);
}

t("lap 0 picks ≤ 8 time-ordered informative frames with per-frame expectations", () => {
  const pc = Q.buildContext(base(P, { layout: visionLayout() }));
  const frames = VIS.selectFrames(pc, { lap: 0 });
  assert.ok(frames.length >= 4 && frames.length <= 8);
  assert.deepStrictEqual(frames.map((f) => f.i), frames.map((_, k) => k));
  for (let k = 1; k < frames.length; k++) assert.ok(frames[k].atSec - frames[k - 1].atSec >= 0.4);
  const reasons = new Set(frames.map((f) => f.reason));
  for (const r of ["broll", "card", "caption_face", "logo"]) assert.ok(reasons.has(r), r);
  const f = frames.find((x) => x.reason === "broll");
  assert.strictEqual(f.segmentType, "broll_full");
  assert.strictEqual(f.orientation, "9:16");
  assert.strictEqual(f.language, "en");
  assert.ok(frames.some((x) => typeof x.expectedCaption === "string" && x.expectedCaption.length));
  assert.ok(frames.every((x) => Array.isArray(x.overlays)));
});

t("later laps pick ≤ 4 frames inside the changed windows", () => {
  const pc = Q.buildContext(base(P, { layout: visionLayout() }));
  const frames = VIS.selectFrames(pc, { lap: 1, changedRanges: [[2, 3], [10, 11], [20, 21], [25, 26], [30, 31]] });
  assert.strictEqual(frames.length, 4);
  assert.ok(frames.every((f) => [[2, 3], [10, 11], [20, 21], [25, 26], [30, 31]].some((r) => f.atSec >= r[0] && f.atSec <= r[1])));
});

t("VisionVerdict is exactly the §7 schema", () => {
  const ok = VIS.VisionVerdict.safeParse({ pass: false, score: 6, issues: [{ frameIndex: 0, atSec: 1, category: "BROLL_WATERMARK", severity: "major", evidence: "logo in corner" }] });
  assert.ok(ok.success);
  assert.ok(!VIS.VisionVerdict.safeParse({ pass: true, score: 11, issues: [] }).success);
  assert.ok(!VIS.VisionVerdict.safeParse({ pass: true, score: 5, issues: [{ frameIndex: 0, atSec: 1, category: "UGLY", severity: "major", evidence: "x" }] }).success);
  assert.ok(!VIS.VisionVerdict.safeParse({ pass: true, score: 5, issues: Array(13).fill(ok.data.issues[0]) }).success);
});

t("interpretVerdict: unknown ids re-resolve by time or drop, audio categories drop, CAPTION_MISMATCH capped for hi", () => {
  const pc = Q.buildContext(base(P, { layout: visionLayout() }));
  const frames = VIS.selectFrames(pc, { lap: 0 });
  const cap = frames.find((f) => f.reason === "caption_face" && f.expectedCaption);
  const aroll = frames.find((f) => f.segmentType === "aroll" && !P.broll.some((b) => b.status !== "removed" && f.atSec >= b.resolved.outIn && f.atSec < b.resolved.outOut));
  const verdict = {
    pass: false, score: 5, issues: [
      { frameIndex: cap.i, atSec: cap.atSec, category: "CAPTION_MISMATCH", severity: "major", elementId: "c_bogus", evidence: "text differs" },
      { frameIndex: aroll.i, atSec: aroll.atSec, category: "BROLL_WATERMARK", severity: "major", elementId: "br_ghost", evidence: "watermark" },
      { frameIndex: cap.i, atSec: cap.atSec, category: "LOUDNESS", severity: "major", evidence: "too loud" },
      { frameIndex: 99, atSec: cap.atSec + 0.1, category: "EXPOSURE_OR_COLOR_JUMP", severity: "minor", evidence: "darker" },
    ],
  };
  const out = VIS.interpretVerdict(verdict, frames, pc);
  assert.deepStrictEqual(out.map((f) => f.category), ["CAPTION_MISMATCH", "EXPOSURE_OR_COLOR_JUMP"]);
  assert.ok(/^c_/.test(out[0].elementId) && out[0].elementId !== "c_bogus");
  assert.strictEqual(out[0].data.reResolved, true);
  assert.strictEqual(out[0].severity, "major");
  assert.strictEqual(out[1].atSec, cap.atSec);
  assert.ok(out.every((f) => f.source === "vision" && f.class === "Q"));
  const hi = VIS.interpretVerdict(verdict, frames, Q.buildContext(base(P, { layout: visionLayout(), language: "hi" })));
  assert.strictEqual(hi[0].severity, "minor");
});

async function visionRun(extra = {}) {
  resetBreakers();
  const projectDir = fs.mkdtempSync(path.join(tmp.dir, "p-"));
  const pc = Q.buildContext(base(P, { layout: visionLayout() }));
  return VIS.runVision({ pc, file: path.join(projectDir, "none.mp4"), projectDir, renderId: "r1", settings: null, project: { settings: { privacy: { allowCloudVision: true } } },
    checkBudget: okBudget, deps: { proc: jpegStubProc() }, ...extra });
}

t("skips with zero calls: no consent · breaker open · budget low · cost cap", async () => {
  let calls = 0;
  const callVision = async () => { calls++; throw new Error("must not be called"); };
  const a = await visionRun({ callVision, project: { settings: { privacy: { allowCloudVision: false } } } });
  assert.deepStrictEqual([a.status, a.reason, a.visionUnverified], ["skipped", "privacy", true]);
  const b = await visionRun({ callVision, deps: { proc: jpegStubProc(), breaker: { state: () => ({ state: "open" }), canRequest: () => false } } });
  assert.strictEqual(b.reason, "breaker_open");
  const c = await visionRun({ callVision, checkBudget: async () => ({ remaining: 0.05 }) });
  assert.strictEqual(c.reason, "budget_low");
  const d = await visionRun({ callVision, project: { settings: { privacy: { allowCloudVision: true }, maxCostUsd: 0.1 }, cost: { spentUsd: 0.099 } } });
  assert.strictEqual(d.reason, "cost_cap");
  assert.strictEqual(calls, 0);
});

t("ok path: one ve_qa call with ≤ 8 images; findings mapped from the verdict", async () => {
  const seen = [];
  const callVision = async (o) => {
    seen.push(o);
    return { value: { pass: true, score: 8, issues: [{ frameIndex: 0, atSec: 0, category: "LOGO_PROBLEM", severity: "minor", evidence: "logo slightly soft" }] }, model: "m", costUsd: 0.002, modelFallback: false };
  };
  const r = await visionRun({ callVision });
  assert.strictEqual(r.status, "ok");
  assert.strictEqual(r.visionUnverified, false);
  assert.strictEqual(seen.length, 1);
  assert.strictEqual(seen[0].stage, "ve_qa");
  assert.strictEqual(seen[0].schema, VIS.VisionVerdict);
  const images = seen[0].user.filter((p) => p.type === "image_url");
  assert.ok(images.length >= 1 && images.length <= 8);
  assert.ok(seen[0].user.some((p) => p.type === "text" && /"segmentType"/.test(p.text)));
  assert.deepStrictEqual(r.findings.map((f) => f.category), ["LOGO_PROBLEM"]);
});

t("parse failure on both models → failed + visionUnverified; an escalation success is ok", async () => {
  const invalid = () => new EditError("LLM_INVALID_JSON", { errorClass: "provider", retryable: true, extra: { costUsd: 0.001 } });
  let n = 0;
  const bad = await visionRun({ callVision: async () => { n++; throw invalid(); } });
  assert.deepStrictEqual([bad.status, bad.visionUnverified, n], ["failed", true, 2]);
  assert.deepStrictEqual(bad.findings, []);
  let m = 0;
  const esc = await visionRun({ callVision: async (o) => { m++; if (m === 1) throw invalid(); return { value: { pass: true, score: 9, issues: [] }, model: o.model, costUsd: 0 }; } });
  assert.deepStrictEqual([esc.status, esc.visionUnverified, m], ["ok", false, 2]);
});

t("the real callJson path works offline with an injected chat (lenient parse + schema)", async () => {
  const chat = async () => ({ text: `sure: {"pass":false,"score":4,"issues":[{"frameIndex":0,"atSec":0.1,"category":"BLACK_OR_BLANK_FRAME","severity":"blocker","evidence":"frame is black"}]} trailing`, model: "google/gemini-3.5-flash-lite", costUsd: 0.001, tokensIn: 10, tokensOut: 10 });
  const r = await visionRun({ chat });
  assert.strictEqual(r.status, "ok");
  assert.deepStrictEqual(r.findings.map((f) => [f.category, f.severity, f.class]), [["BLACK_OR_BLANK_FRAME", "blocker", "Q"]]);
});

t("a provider failure opens nothing silently: transient error → failed, cancellation propagates", async () => {
  const r = await visionRun({ callVision: async () => { throw new EditError("LLM_CALL_FAILED", { errorClass: "transient" }); } });
  assert.deepStrictEqual([r.status, r.visionUnverified], ["failed", true]);
  const ac = new AbortController();
  ac.abort();
  await assert.rejects(visionRun({ signal: ac.signal, callVision: async () => ({ value: { pass: true, score: 9, issues: [] } }) }), (e) => e.errorClass === "cancelled");
});

t("later laps carry forward vision findings outside the re-checked windows", async () => {
  const prevIssue = { ...C.makeFinding({ severity: "minor", category: "LOGO_PROBLEM", area: "logo", atSec: 30, detail: "soft", source: "vision" }) };
  const r = await visionRun({ lap: 1, changedRanges: [[2, 3]], previous: { issues: [prevIssue], visionUnverified: false },
    callVision: async () => ({ value: { pass: true, score: 9, issues: [] }, model: "m", costUsd: 0 }) });
  assert.strictEqual(r.frames.length, 1);
  assert.deepStrictEqual(r.carried.map((f) => [f.category, f.atSec, f.data.carried]), [["LOGO_PROBLEM", 30, true]]);
});

(async () => {
  await run();
  restoreFetch();
  tmp.cleanup();
})();
