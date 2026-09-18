// Unit tests for the Edit Plan ops engine: plan/ops.js (+ ops_captions / ops_cuts / ops_broll / ops_misc),
// plan/replan.js and plan/revisions.js.
// Run: node scripts/video_edit_ops.test.cjs   (offline; fetch tripwire; temp store; < 30 s)
//
// Load-bearing assertions:
//  - EVERY OP TYPE has a happy path and a validation failure (the table is checked against OP_TYPES).
//  - ATOMICITY: a batch whose second op is invalid changes nothing; the error names the failing index.
//  - OWNERSHIP: tombstones stay in the plan and restore; user ops set userModified / userToggled; re-plans never
//    touch locked, user or removed items and never resurrect removed ones.
//  - INVALIDATION: the per-op level table of EDIT_PLAN §5 and batch max-level + merged ranges.
//  - PROVENANCE: one { opId, at, type, elementIds, batchId } per op, deterministic.
//  - REVISIONS: 409 on a stale head, batchId replay, undo/redo create revisions equal to the target content.
// Fixtures: scripts/fixtures/video_edit/talking_head_45s.*.json (plan.json = full unresolved plan, every element kind).

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { createHarness, mkTmp, makeSettings, installFetchTripwire, silentLog } = require("./lib/video_edit_test_utils.cjs");
const { sha256Json } = require("../src/video_edit/fsx");
const { isEditError } = require("../src/video_edit/errors");
const { resolvePlan } = require("../src/video_edit/plan/resolve");
const { parsePlan } = require("../src/video_edit/plan/schema");
const { outline } = require("../src/video_edit/plan/outline");
const { applyOps, OP_TYPES } = require("../src/video_edit/plan/ops");
const { replanForSettings, isEligible } = require("../src/video_edit/plan/replan");
const Rev = require("../src/video_edit/plan/revisions");
const { createStore } = require("../src/video_edit/store");

const { t, section, run } = createHarness();
const restoreFetch = installFetchTripwire();
const tmp = mkTmp("ve-ops-");

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
const idx = (text, sid) => { const s = TRANSCRIPT.sentences.find((x) => x.id === sid); for (let i = s.w0; i <= s.w1; i++) if (WORDS[i].text === text) return i; throw new Error(`${text} not in ${sid}`); };

const CTX = {
  words: WORDS, sentences: TRANSCRIPT.sentences, faces: FACES, content: CONTENT, mezz: { w: SOURCE.width, h: SOURCE.height },
  now: NOW, batchId: "batch-1", selectEdits: null,
  assets: { ast_logo0002: { kind: "logo", path: "assets/logo2.png" }, ast_logolong: { kind: "logo", path: `assets/${"a".repeat(600)}.png` } },
};
const P = resolvePlan(PLAN_RAW, CTX);
const P_HASH = sha256Json(P);
const apply = (ops, extra = {}, plan = P) => applyOps(plan, ops, { ...CTX, ...extra });
const I_INBOX = idx("inbox", "s4");
const CUE = P.captions.cues.find((c) => c.words.some((w) => w.key === `w${I_INBOX}`));
const cueById = (plan, id) => plan.captions.cues.find((c) => c.id === id);
const byId = (arr, id) => arr.find((x) => x.id === id);

function rejects(ops, { index = 0, needle, extra = {}, plan = P }) {
  let err = null;
  try { apply(ops, extra, plan); } catch (e) { err = e; }
  assert.ok(err, `expected INVALID_OP for ${JSON.stringify(ops).slice(0, 160)}`);
  assert.ok(isEditError(err) && err.code === "INVALID_OP" && err.status === 422, err && err.stack);
  assert.equal(err.extra.index, index, `index for ${JSON.stringify(ops).slice(0, 120)}: ${err.extra.reason}`);
  if (needle) assert.ok(err.extra.reason.includes(needle), `reason '${err.extra.reason}' lacks '${needle}'`);
  return err;
}

t("fixture plan resolves and validates", () => {
  assert.ok(parsePlan(P, { wordCount: WORDS.length }).ok);
  assert.ok(CUE && P.cuts.length === 12 && P.broll.length === 3);
});

// ======================================================================== every op type
section("plan/ops — every op type (happy path + validation failure)");

const CASES = [
  { type: "captions.setEnabled", ops: [{ type: "captions.setEnabled", enabled: false }], level: "COMPOSITE",
    check: (r) => assert.deepEqual([r.plan.captions.enabled, r.plan.settings.captionsEnabled], [false, false]),
    bad: [{ type: "captions.setEnabled", enabled: "no" }], needle: "enabled" },
  { type: "caption.editText", ops: [{ type: "caption.editText", cueId: CUE.id, text: `${CUE.text} today` }], level: "COMPOSITE",
    check: (r) => { assert.ok(r.plan.captions.cues.some((c) => c.text.includes("today"))); assert.equal(r.plan.captions.userEdited, true); assert.equal(r.plan.captions.overrides.insertions.length, 1); },
    bad: [{ type: "caption.editText", cueId: "c_99999", text: "x" }], needle: "does not exist" },
  { type: "caption.hide", ops: [{ type: "caption.hide", cueId: CUE.id }], level: "COMPOSITE",
    check: (r) => assert.equal(cueById(r.plan, CUE.id).hidden, true), bad: [{ type: "caption.hide", cueId: "not a cue" }], needle: "cueId" },
  { type: "caption.show", ops: [{ type: "caption.hide", cueId: CUE.id }, { type: "caption.show", cueId: CUE.id }], level: "COMPOSITE",
    check: (r) => { assert.equal(cueById(r.plan, CUE.id).hidden, false); assert.deepEqual(r.plan.captions.overrides.hiddenCues, []); },
    bad: [{ type: "caption.show", cueId: "c_77777" }], needle: "does not exist" },
  { type: "caption.setEmphasis", ops: [{ type: "caption.setEmphasis", cueId: CUE.id, wordKey: `w${I_INBOX}`, emphasis: true }], level: "COMPOSITE",
    check: (r) => assert.equal(cueById(r.plan, CUE.id).words.find((w) => w.key === `w${I_INBOX}`).emphasis, true),
    bad: [{ type: "caption.setEmphasis", cueId: CUE.id, wordKey: "w0", emphasis: true }], needle: "is not in caption" },
  { type: "caption.setPosition", ops: [{ type: "caption.setPosition", cueId: CUE.id, y: 0.3 }], level: "COMPOSITE",
    check: (r) => assert.deepEqual(cueById(r.plan, CUE.id).pos, { x: 0.5, y: 0.3, an: 8 }),
    bad: [{ type: "caption.setPosition", cueId: CUE.id, y: 1.5 }], needle: "y" },
  { type: "caption.rebuildFromWords", level: "COMPOSITE", extra: { author: "qa-repair" },
    ops: [{ type: "caption.editText", cueId: CUE.id, text: CUE.text.replace("inbox", "INBOX") }, { type: "caption.rebuildFromWords", range: [CUE.resolved.outIn, CUE.resolved.outOut] }],
    check: (r) => { assert.deepEqual(r.plan.captions.overrides.wordText, {}); assert.ok(cueById(r.plan, CUE.id).text.includes("inbox")); },
    bad: [{ type: "caption.rebuildFromWords", range: [0, 5] }], needle: "reserved for QA repair" },
  { type: "captions.setStyle", ops: [{ type: "captions.setStyle", styleId: "clean", maxWordsPerLine: 2 }], level: "COMPOSITE",
    check: (r) => assert.deepEqual([r.plan.captions.styleId, r.plan.captions.highlight, r.plan.settings.maxWordsPerLine, r.plan.settings.captionStyle], ["clean", "none", 2, "clean"]),
    bad: [{ type: "captions.setStyle", styleId: "comic_sans" }], needle: "unknown caption style" },
  { type: "captions.setPosition", ops: [{ type: "captions.setPosition", y: 0.02 }], level: "COMPOSITE",
    check: (r) => { assert.equal(r.plan.captions.position.yOverride, 0.14); assert.ok(r.warnings.some((w) => w.code === "CLAMPED_TO_SAFE_BAND")); },
    bad: [{ type: "captions.setPosition", y: "top" }], needle: "y" },
  { type: "captions.setLanguage", ops: [{ type: "captions.setLanguage", language: "es" }], level: "COMPOSITE",
    check: (r) => {
      assert.deepEqual([r.plan.captions.language, r.plan.settings.captionLanguage], ["es", "es"]);
      assert.deepEqual(r.costEvents.map((c) => [c.code, c.job, c.net]), [["NEEDS_AI", "translate_captions", "ai"]]);
      assert.equal(apply([{ type: "captions.setLanguage", language: "auto" }]).costEvents.length, 0, "spoken language needs no AI");
    },
    bad: [{ type: "captions.setLanguage", language: "xx" }], needle: "not supported" },
  { type: "cut.toggle", ops: [{ type: "cut.toggle", cutId: "cut_0004", enabled: false }], level: "SHIFT",
    check: (r) => {
      const c = byId(r.plan.cuts, "cut_0004");
      assert.deepEqual([c.enabled, c.userToggled, c.controlledBy], [false, true, null]);
      assert.ok(r.plan.captions.cues.some((q) => q.words.some((w) => w.key === "w12")), "restored filler captioned");
      assert.ok(r.plan.timeline.outDurationSec > P.timeline.outDurationSec);
    },
    bad: [{ type: "cut.toggle", cutId: "cut_nope", enabled: true }], needle: "does not exist" },
  { type: "cut.adjust", ops: [{ type: "cut.adjust", cutId: "cut_0001", padStart: 0.2, padEnd: 0.2 }], level: "SHIFT",
    check: (r) => { const c = byId(r.plan.cuts, "cut_0001"), raw = byId(P.cuts, "cut_0001").raw; assert.deepEqual([c.srcIn, c.srcOut], [Math.round((raw.srcIn + 0.2) * 1000) / 1000, Math.round((raw.srcOut - 0.2) * 1000) / 1000]); },
    bad: [{ type: "cut.adjust", cutId: "cut_0011", padStart: 0, padEnd: -0.3 }], needle: "cross the middle" },
  { type: "cut.add", ops: [{ type: "cut.add", w0: idx("only", "s4"), w1: idx("only", "s4") }], level: "SHIFT",
    check: (r) => {
      const c = r.plan.cuts[r.plan.cuts.length - 1];
      assert.deepEqual([c.kind, c.origin, c.userToggled, c.wordRange], ["USER", "user", true, [idx("only", "s4"), idx("only", "s4")]]);
      assert.match(c.id, /^cut_u[0-9a-f]{10}$/);
      assert.ok(!r.plan.captions.cues.some((q) => q.words.some((w) => w.key === `w${idx("only", "s4")}`)));
      const s12 = TRANSCRIPT.sentences.find((s) => s.id === "s12");
      assert.ok(apply([{ type: "cut.add", w0: s12.w0 + 1, w1: s12.w0 + 2, force: true }]).plan.cuts.length === 13, "force unlocks a protected sentence");
    },
    bad: [{ type: "cut.add", w0: idx("follow", "s12"), w1: idx("follow", "s12") }], needle: "protected" },
  { type: "cuts.restoreAll", ops: [{ type: "cuts.restoreAll", kind: "FILLER" }], level: "SHIFT",
    check: (r) => { const f = r.plan.cuts.filter((c) => c.kind === "FILLER"); assert.ok(f.length === 6 && f.every((c) => !c.enabled && c.userToggled)); assert.ok(r.plan.cuts.filter((c) => c.kind === "SILENCE").every((c) => c.enabled)); },
    bad: [{ type: "cuts.restoreAll", kind: "NOPE" }], needle: "kind" },
  { type: "settings.set", ops: [{ type: "settings.set", key: "removeSilence", value: false }], level: "SHIFT",
    check: (r) => {
      assert.equal(r.plan.settings.removeSilence, false);
      assert.ok(r.plan.timeline.outDurationSec > P.timeline.outDurationSec + 1);
      const w = r.warnings.find((x) => x.code === "REPLANNED");
      assert.deepEqual([w.engine, w.added, w.removed], ["fallback", 0, 0], "a pacing change never trims B-roll in the fallback");
    },
    bad: [{ type: "settings.set", key: "removeSilence", value: "yes" }], needle: "invalid value" },
  { type: "broll.replace", ops: [{ type: "broll.replace", id: "br_0001", candidateId: "ast_pexels0002" }], level: "COMPOSITE",
    check: (r) => {
      const b = byId(r.plan.broll, "br_0001");
      assert.deepEqual([b.chosen.assetId, b.status, b.userModified], ["ast_pexels0002", "ok", true]);
      const pend = apply([{ type: "broll.replace", id: "br_0001", candidateId: "pexels:123453" }]);
      assert.equal(byId(pend.plan.broll, "br_0001").status, "pending");
      assert.deepEqual(pend.costEvents.map((c) => [c.code, c.assetId]), [["NEEDS_FETCH", "ast_pexels0003"]]);
    },
    bad: [{ type: "broll.replace", id: "br_0001", candidateId: "ast_pexels0004" }], needle: "shorter than" },
  { type: "broll.regenerate", ops: [{ type: "broll.regenerate", id: "br_0001" }], level: "COMPOSITE",
    check: (r) => {
      const b = byId(r.plan.broll, "br_0001");
      assert.deepEqual([b.chosen.assetId, b.status], ["ast_pexels0003", "pending"], "next best unused stored candidate");
      assert.deepEqual(r.costEvents.map((c) => c.code), ["NEEDS_FETCH"]);
      const q = apply([{ type: "broll.regenerate", id: "br_0001", query: "phone on desk" }]);
      assert.deepEqual(byId(q.plan.broll, "br_0001").queries[0], { text: "phone on desk", kind: "user" });
      assert.deepEqual(q.costEvents.map((c) => c.code), ["NEEDS_FETCH", "NEEDS_AI"]);
    },
    bad: [{ type: "broll.regenerate", id: "br_0001", query: "x" }], needle: "query" },
  { type: "broll.remove", ops: [{ type: "broll.remove", id: "br_0001" }], level: "COMPOSITE",
    check: (r) => { const b = byId(r.plan.broll, "br_0001"); assert.deepEqual([b.status, b.userModified], ["removed", true]); assert.equal(outline(r.plan).tracks.broll.length, 2); },
    bad: [{ type: "broll.remove", id: "br_0001" }, { type: "broll.remove", id: "br_0001" }], badIndex: 1, needle: "already removed" },
  { type: "broll.restore", ops: [{ type: "broll.remove", id: "br_0001" }, { type: "broll.restore", id: "br_0001" }], level: "COMPOSITE",
    check: (r) => assert.equal(byId(r.plan.broll, "br_0001").status, "ok"),
    bad: [{ type: "broll.restore", id: "br_0001" }], needle: "is not removed" },
  { type: "broll.setLayout", ops: [{ type: "broll.setLayout", id: "br_0001", layout: "PIP", corner: "tl" }], level: "COMPOSITE",
    check: (r) => {
      assert.deepEqual(byId(r.plan.broll, "br_0001").layoutParams, { corner: "tl", scale: 0.4 });
      const s1 = TRANSCRIPT.sentences.find((s) => s.id === "s1");
      const moved = apply([{ type: "broll.setTiming", id: "br_0002", w0: s1.w0, w1: s1.w1 }, { type: "broll.setLayout", id: "br_0002", layout: "PIP", corner: "tr" }]);
      assert.equal(byId(moved.plan.broll, "br_0002").layoutParams.corner, "br", "PIP moved off the hook title");
      assert.ok(moved.warnings.some((w) => w.code === "PIP_MOVED"));
    },
    bad: [{ type: "output.setAspect", aspect: "1:1" }, { type: "broll.setLayout", id: "br_0001", layout: "SPLIT" }], badIndex: 1, needle: "SPLIT is only available" },
  { type: "broll.setTiming", ops: [{ type: "broll.setTiming", id: "br_0001", w0: 55, w1: 60 }], level: "COMPOSITE",
    check: (r) => { const b = byId(r.plan.broll, "br_0001"); assert.deepEqual([b.anchor, b.userModified], [{ kind: "words", w0: 55, w1: 60 }, true]); },
    bad: [{ type: "broll.setTiming", id: "br_0001", w0: 77, w1: 80 }], needle: "overlaps B-roll #2" },
  { type: "broll.add", ops: [{ type: "broll.add", sentenceId: "s5" }], level: "COMPOSITE",
    check: (r) => {
      const b = r.plan.broll[r.plan.broll.length - 1];
      assert.deepEqual([b.origin, b.status, b.ordinal, b.userModified, b.queries[0].text], ["user", "pending", 4, true, "wall clock"]);
      assert.deepEqual(r.costEvents.map((c) => [c.code, c.prefetched]), [["NEEDS_FETCH", false]]);
      assert.equal(apply([{ type: "broll.add", sentenceId: "s11", force: true }]).plan.broll.length, 4);
    },
    bad: [{ type: "broll.add", sentenceId: "s11" }], needle: "keeps the speaker on screen" },
  { type: "broll.setLocked", ops: [{ type: "broll.setLocked", id: "br_0001", locked: true }], level: "NONE",
    check: (r) => { const b = byId(r.plan.broll, "br_0001"); assert.deepEqual([b.locked, b.userModified], [true, false]); },
    bad: [{ type: "broll.setLocked", id: "br_nope", locked: true }], needle: "does not exist" },
  { type: "effect.toggle", ops: [{ type: "effect.toggle", id: "fx_0001", enabled: false }], level: "BASE",
    check: (r) => { const e = byId(r.plan.effects, "fx_0001"); assert.deepEqual([e.enabled, e.userModified], [false, true]); },
    bad: [{ type: "effect.toggle", id: "fx_nope", enabled: false }], needle: "does not exist" },
  { type: "effect.adjust", ops: [{ type: "effect.adjust", id: "fx_0001", zoom: 1.2, w0: idx("waste", "s1"), w1: idx("hours", "s1") }], level: "BASE",
    check: (r) => {
      const e = byId(r.plan.effects, "fx_0001");
      assert.deepEqual([e.zoom, e.anchor.w0, e.userModified], [1.2, idx("waste", "s1"), true]);
      const clamped = apply([{ type: "effect.adjust", id: "fx_0001", zoom: 1.4 }]);
      assert.equal(byId(clamped.plan.effects, "fx_0001").zoom, 1.35);
      assert.ok(clamped.warnings.some((w) => w.code === "ZOOM_CLAMPED"));
    },
    bad: [{ type: "effect.adjust", id: "fx_0006", zoom: 1.2 }], needle: "has no zoom" },
  { type: "transition.set", ops: [{ type: "transition.set", id: "tr_0001", kind: "CROSSFADE" }], level: "BASE",
    check: (r) => assert.equal(byId(r.plan.transitions, "tr_0001").kind, "CROSSFADE"),
    bad: [{ type: "transition.set", id: "tr_0002", kind: "CROSSFADE" }], needle: "kept pause" },
  { type: "graphic.editText", ops: [{ type: "graphic.editText", id: "gfx_0001", title: "Stop losing three whole hours every day to email" }], level: "COMPOSITE",
    check: (r) => { const g = byId(r.plan.graphics, "gfx_0001"); assert.deepEqual([g.userModified, g.render.status, g.render.cardHash], [true, "pending", null]); assert.equal(g.text.title.length, 48); },
    bad: [{ type: "graphic.editText", id: "gfx_0001", title: "x".repeat(61) }], needle: "title" },
  { type: "graphic.toggle", ops: [{ type: "graphic.toggle", id: "gfx_0002", enabled: false }], level: "COMPOSITE",
    check: (r) => assert.equal(byId(r.plan.graphics, "gfx_0002").enabled, false),
    bad: [{ type: "graphic.toggle", id: "gfx_0002" }], needle: "enabled" },
  { type: "music.change", ops: [{ type: "music.change", candidateId: "ast_music002" }], level: "AUDIO",
    check: (r) => {
      assert.equal(r.plan.music.track.assetId, "ast_music002");
      assert.ok(r.plan.music.candidates.some((c) => c.assetId === "ast_music001"));
      const q = apply([{ type: "music.change", query: "calm piano" }]);
      // the request travels as a pending track (query + mood), fetched at render time; the old track stays a candidate
      assert.deepEqual([q.plan.music.track.query, q.plan.music.track.path, q.plan.music.track.license], ["calm piano", null, "pending"]);
      assert.ok(q.plan.music.candidates.some((c) => c.assetId === "ast_music001"));
      assert.deepEqual(q.costEvents.map((c) => [c.code, c.query]), [["NEEDS_FETCH", "calm piano"]]);
    },
    bad: [{ type: "music.change", candidateId: "nope" }], needle: "does not exist" },
  { type: "music.remove", ops: [{ type: "music.remove" }], level: "AUDIO",
    check: (r) => assert.deepEqual([r.plan.music.enabled, r.plan.settings.musicEnabled], [false, false]),
    bad: [{ type: "music.remove" }], needle: "no music", badPlan: { ...clone(P), music: null } },
  { type: "music.restore", ops: [{ type: "music.remove" }, { type: "music.restore" }], level: "AUDIO",
    check: (r) => assert.equal(r.plan.music.enabled, true),
    bad: [{ type: "music.restore", extra: 1 }], needle: "Unrecognized key" },
  { type: "music.setVolume", ops: [{ type: "music.setVolume", volumeDb: -6 }], level: "AUDIO",
    check: (r) => { assert.equal(r.plan.music.volume, Math.round(0.06 * Math.pow(0.16 / 0.06, 24 / 30) * 1e4) / 1e4); assert.equal(apply([{ type: "music.setVolume", volumeDb: -30 }]).plan.music.volume, 0.06); },
    bad: [{ type: "music.setVolume", volumeDb: 3 }], needle: "volumeDb" },
  { type: "music.setDucking", ops: [{ type: "music.setDucking", enabled: false, depthDb: -12 }], level: "AUDIO",
    check: (r) => assert.deepEqual(r.plan.music.duck, { enabled: false, depthDb: -12 }),
    bad: [{ type: "music.setDucking", enabled: true, depthDb: -30 }], needle: "depthDb" },
  { type: "sfx.toggle", ops: [{ type: "sfx.toggle", id: "sfx_0001", enabled: false }], level: "AUDIO",
    check: (r) => assert.equal(byId(r.plan.sfx, "sfx_0001").enabled, false),
    bad: [{ type: "sfx.toggle", id: "sfx_nope", enabled: false }], needle: "does not exist" },
  { type: "sfx.setVolume", ops: [{ type: "sfx.setVolume", id: "sfx_0001", volumeDb: 0 }], level: "AUDIO",
    check: (r) => assert.equal(byId(r.plan.sfx, "sfx_0001").volume, 0.25),
    bad: [{ type: "sfx.setVolume", id: "sfx_0001", volumeDb: 10 }], needle: "volumeDb" },
  { type: "sfx.muteAll", ops: [{ type: "sfx.muteAll", muted: true }], level: "AUDIO",
    check: (r) => { assert.equal(r.plan.settings.sfxEnabled, false); assert.ok(r.plan.sfx.every((s) => s.enabled)); },
    bad: [{ type: "sfx.muteAll", muted: 1 }], needle: "muted" },
  { type: "branding.setLogo", ops: [{ type: "branding.setLogo", assetId: "ast_logo0002" }], level: "COMPOSITE",
    check: (r) => assert.deepEqual([r.plan.branding.logo.assetId, r.plan.branding.logo.placement], ["ast_logo0002", "tr"]),
    bad: [{ type: "branding.setLogo", assetId: "ast_unknown1" }], needle: "not an uploaded logo" },
  { type: "branding.removeLogo", ops: [{ type: "branding.removeLogo" }], level: "COMPOSITE",
    check: (r) => assert.equal(r.plan.branding.logo, null),
    bad: [{ type: "branding.removeLogo" }, { type: "branding.removeLogo" }], badIndex: 1, needle: "no logo" },
  { type: "branding.setLogoPlacement", ops: [{ type: "branding.setLogoPlacement", placement: "bl", scale: 0.1, opacity: 0.8 }], level: "COMPOSITE",
    check: (r) => assert.deepEqual([r.plan.branding.logo.placement, r.plan.branding.logo.scale, r.plan.branding.logo.opacity], ["bl", 0.1, 0.8]),
    bad: [{ type: "branding.setLogoPlacement", placement: "bl", scale: 0.5, opacity: 0.8 }], needle: "scale" },
  { type: "branding.setPalette", ops: [{ type: "branding.setPalette", primary: "#112233" }], level: "COMPOSITE",
    check: (r) => {
      assert.deepEqual([r.plan.branding.palette.primary, r.plan.branding.palette.accent, r.plan.settings.brandColors], ["#112233", "#112233", ["#112233"]]);
      assert.ok(r.plan.graphics.every((g) => g.render.status === "pending"), "cards re-render");
    },
    bad: [{ type: "branding.setPalette", primary: "#12345" }], needle: "primary" },
  { type: "framing.adjust", ops: [{ type: "framing.adjust", segmentId: "seg_2", offsetX: 0.1, offsetY: 0, zoom: 1.1 }], level: "BASE",
    check: (r) => {
      const s = byId(r.plan.aRoll.segments, "seg_2");
      assert.deepEqual([s.framing.mode, s.framing.locked, s.framing.userCrop.zoom], ["static", true, 1.1]);
      assert.ok(!r.warnings.some((w) => w.code === "FACE_OUTSIDE_CROP"));
      assert.ok(apply([{ type: "framing.adjust", segmentId: "seg_2", offsetX: 1, offsetY: 1, zoom: 2 }]).warnings.some((w) => w.code === "FACE_OUTSIDE_CROP"));
    },
    bad: [{ type: "framing.adjust", segmentId: "seg_2", offsetX: 0, offsetY: 0, zoom: 3 }], needle: "zoom" },
  { type: "framing.reset", ops: [{ type: "framing.adjust", segmentId: "seg_2", offsetX: 0.1, offsetY: 0, zoom: 1.1 }, { type: "framing.reset", segmentId: "seg_2" }], level: "BASE",
    check: (r) => { const s = byId(r.plan.aRoll.segments, "seg_2"); assert.deepEqual([s.framing.mode, s.framing.locked, s.framing.userCrop], ["auto", false, undefined]); },
    bad: [{ type: "framing.reset", segmentId: "seg_99" }], needle: "does not exist" },
  { type: "output.setAspect", ops: [{ type: "output.setAspect", aspect: "16:9" }], level: "BASE",
    check: (r) => assert.deepEqual([r.plan.output.width, r.plan.output.height, r.plan.output.aspect], [1920, 1080, "16:9"]),
    bad: [{ type: "output.setAspect", aspect: "9:16" }], needle: "already" },
  { type: "edit.setTitle", ops: [{ type: "edit.setTitle", title: "  My inbox edit " }], level: "NONE",
    check: (r) => { assert.deepEqual(r.projectPatch, { title: "My inbox edit" }); assert.deepEqual(r.invalidates, { level: "NONE", ranges: [] }); },
    bad: [{ type: "edit.setTitle", title: "" }], needle: "title" },
];

t("the case table covers every registered op type", () => {
  const covered = new Set(CASES.map((c) => c.type));
  assert.deepEqual(OP_TYPES.filter((ty) => !covered.has(ty)), []);
  assert.equal(OP_TYPES.length, 44);
});

for (const c of CASES) {
  t(`${c.type}: applies, validates and invalidates at ${c.level}`, () => {
    const r = apply(c.ops, c.extra || {}, c.plan || P);
    assert.ok(parsePlan(r.plan, { wordCount: WORDS.length }).ok);
    assert.equal(r.invalidates.level, c.level, `level for ${c.type}`);
    assert.equal(r.applied, c.ops.length);
    c.check(r);
    rejects(c.bad, { index: c.badIndex || 0, needle: c.needle, plan: c.badPlan || c.plan || P, extra: c.extra && c.type !== "caption.rebuildFromWords" ? c.extra : {} });
  });
}

// ======================================================================== batch semantics
section("plan/ops — batch semantics");

t("atomic: a batch whose second op is invalid changes nothing and names index 1", () => {
  rejects([{ type: "broll.remove", id: "br_0001" }, { type: "cut.toggle", cutId: "cut_nope", enabled: true }], { index: 1, needle: "does not exist" });
  rejects([{ type: "cut.toggle", cutId: "cut_0004", enabled: false }, { type: "caption.hide", cueId: "c_99999" }], { index: 1 });
  assert.equal(sha256Json(P), P_HASH, "input plan untouched");
});

t("envelope and batch limits: unknown types, mixed envelopes, > 100 ops, missing now", () => {
  rejects([{ type: "broll.teleport", id: "br_0001" }], { needle: "unknown op type" });
  rejects([{ type: "caption.hide", payload: { cueId: CUE.id }, cueId: CUE.id }], { needle: "not both" });
  assert.deepEqual(apply([{ type: "caption.hide", payload: { cueId: CUE.id } }]).plan.captions.overrides.hiddenCueWords, CUE.words.map((w) => w.key).sort(), "{type, payload} form works");
  rejects(Array.from({ length: 101 }, () => ({ type: "music.setVolume", volumeDb: -6 })), { index: 100, needle: "at most 100" });
  rejects([], { index: -1 });
  assert.throws(() => applyOps(P, [{ type: "music.remove" }], { ...CTX, now: undefined }), (e) => e.code === "OPS_CONTEXT" && e.status === 500);
});

t("a plan-level validation failure is attributed to the op that caused it", () => {
  const e = rejects([{ type: "captions.setEnabled", enabled: false }, { type: "branding.setLogo", assetId: "ast_logolong" }], { index: 1, needle: "branding.logo.path" });
  assert.ok(Array.isArray(e.extra.issues));
});

t("ops read the derived view of the evolving draft (style change then edit of a re-chunked cue)", () => {
  const styled = apply([{ type: "captions.setStyle", styleId: "single_word" }]).plan;
  const target = styled.captions.cues.find((c) => c.words.some((w) => w.key === `w${I_INBOX}`));
  assert.ok(!P.captions.cues.some((c) => c.id === target.id && c.words.length === target.words.length));
  const r = apply([{ type: "captions.setStyle", styleId: "single_word" }, { type: "caption.editText", cueId: target.id, text: "INBOXES" }]);
  assert.equal(r.plan.captions.overrides.wordText[String(I_INBOX)], "INBOXES");
});

t("deterministic: same input → byte-identical result; a different batchId only changes op/element ids", () => {
  const ops = [{ type: "cut.add", w0: idx("only", "s4"), w1: idx("only", "s4") }, { type: "caption.hide", cueId: CUE.id }];
  const a = apply(ops), b = apply(clone(ops));
  assert.equal(sha256Json(a.plan), sha256Json(b.plan));
  assert.deepEqual(a.invalidates, b.invalidates);
  const c = apply(ops, { batchId: "batch-2" });
  assert.notEqual(c.plan.provenance.ops[0].opId, a.plan.provenance.ops[0].opId);
  assert.notEqual(c.plan.cuts[12].id, a.plan.cuts[12].id);
});

// ======================================================================== ownership
section("plan/ops — tombstones and ownership");

t("broll.remove tombstones (item stays), restore brings it back, outline follows", () => {
  const removed = apply([{ type: "broll.remove", id: "br_0002" }]).plan;
  assert.equal(removed.broll.length, 3);
  assert.equal(byId(removed.broll, "br_0002").status, "removed");
  assert.equal(outline(removed).summary.brollCount, outline(P).summary.brollCount - 1);
  const restored = applyOps(removed, [{ type: "broll.restore", id: "br_0002" }], CTX).plan;
  assert.equal(byId(restored.broll, "br_0002").status, "ok");
  assert.equal(outline(restored).summary.brollCount, outline(P).summary.brollCount);
  const pending = applyOps(apply([{ type: "broll.remove", id: "br_0003" }]).plan, [{ type: "broll.restore", id: "br_0003" }], CTX);
  assert.deepEqual([byId(pending.plan.broll, "br_0003").status, pending.costEvents[0].code], ["pending", "NEEDS_FETCH"]);
});

t("user ops mark ownership: userModified, userToggled; setLocked does not mark userModified", () => {
  const r = apply([
    { type: "broll.replace", id: "br_0001", candidateId: "ast_pexels0002" }, { type: "effect.toggle", id: "fx_0008", enabled: false },
    { type: "graphic.toggle", id: "gfx_0002", enabled: false }, { type: "broll.setLocked", id: "br_0002", locked: true },
  ]).plan;
  assert.deepEqual([byId(r.broll, "br_0001").userModified, byId(r.effects, "fx_0008").userModified, byId(r.graphics, "gfx_0002").userModified], [true, true, true]);
  assert.deepEqual([byId(r.broll, "br_0002").userModified, byId(r.broll, "br_0002").locked], [false, true]);
  assert.equal(isEligible(byId(r.broll, "br_0002"), new Set()), false);
});

t("userToggled cuts keep their state when the pacing setting flips", () => {
  const on = apply([{ type: "cut.toggle", cutId: "cut_0004", enabled: true }, { type: "settings.set", key: "removeFillers", value: "off" }]).plan;
  assert.ok(!on.captions.cues.some((c) => c.words.some((w) => w.key === "w12")), "user-kept cut still removes its filler");
  assert.ok(on.captions.cues.some((c) => c.words.some((w) => w.key === "w45")), "other fillers return with the setting off");
});

// ======================================================================== re-plan
section("plan/replan — re-plan rule");

function stubBroll(id, sid, extra = {}) {
  const s = TRANSCRIPT.sentences.find((x) => x.id === sid);
  return { ...clone(byId(P.broll, "br_0003")), id, ordinal: 99, anchor: { kind: "words", w0: s.w0, w1: s.w1 }, resolved: null, sentenceId: sid, segmentId: null,
    status: "pending", locked: true, origin: "ai", userModified: false, ...extra };
}

t("never touches locked / user / removed items, never resurrects removed ones, keeps refs of protected SFX", () => {
  const u1 = apply([
    { type: "broll.remove", id: "br_0002" }, { type: "effect.toggle", id: "fx_0008", enabled: false }, { type: "sfx.toggle", id: "sfx_0002", enabled: false },
  ]).plan;
  const calls = [];
  const selectEdits = (args) => {
    calls.push(args);
    const { plan } = args;
    return {
      broll: [
        { ...clone(byId(plan.broll, "br_0002")), status: "ok", userModified: false },
        { ...clone(byId(plan.broll, "br_0002")), id: "br_again02", status: "pending", userModified: false },
        { ...clone(byId(plan.broll, "br_0003")), layout: "PIP", layoutParams: { corner: "tr", scale: 0.4 } },
        stubBroll("br_new0010", "s10"), stubBroll("br_new0005", "s5"),
      ],
      effects: [
        clone(byId(plan.effects, "fx_0001")), { ...clone(byId(plan.effects, "fx_0008")), id: "fx_again08", enabled: true, userModified: false },
        { ...clone(byId(plan.effects, "fx_0002")), id: "fx_po0002", anchor: { kind: "words", w0: 10, w1: 11 } },
        { ...clone(byId(plan.effects, "fx_0008")), id: "fx_near08", anchor: { kind: "words", w0: 41, w1: 42 }, enabled: true, userModified: false },
      ],
      graphics: [],
      adjustments: [{ elementId: "br_0001", rule: "max_items", action: "dropped" }],
      music: null,
    };
  };
  const r = applyOps(u1, [{ type: "settings.set", key: "brollIntensity", value: "high" }], { ...CTX, selectEdits });
  const p = r.plan;
  assert.equal(calls.length, 1);
  assert.equal(calls[0].settings.brollIntensity, "high");
  assert.ok(calls[0].plan.timeline.pieces.length > 0, "rhythm receives a resolved plan");
  // protected items untouched
  const strip = (el) => { const { resolved, ...rest } = el; return rest; };
  assert.deepEqual(strip(byId(p.broll, "br_0002")), strip(byId(u1.broll, "br_0002")), "removed B-roll untouched");
  assert.deepEqual(strip(byId(p.broll, "br_0003")), strip(byId(u1.broll, "br_0003")), "locked B-roll untouched");
  assert.deepEqual(strip(byId(p.effects, "fx_0008")), strip(byId(u1.effects, "fx_0008")), "user-modified effect untouched");
  assert.ok(!byId(p.broll, "br_again02") && !byId(p.effects, "fx_again08"), "tombstoned identities are never resurrected");
  assert.equal(p.broll.filter((b) => b.anchor.w0 === byId(u1.broll, "br_0002").anchor.w0).length, 1);
  // eligible items were dropped / added
  assert.ok(!byId(p.broll, "br_0001") && !byId(p.sfx, "sfx_0001"), "eligible B-roll dropped and its eligible SFX cascaded");
  assert.ok(byId(p.graphics, "gfx_0001") && byId(p.sfx, "sfx_0002"), "a protected SFX keeps the graphic it hangs on");
  assert.ok(!byId(p.graphics, "gfx_0002"), "eligible graphic dropped");
  const added = ["br_new0010", "br_new0005"].map((id) => byId(p.broll, id));
  assert.deepEqual(added.map((b) => [b.ordinal, b.locked, b.userModified, b.origin]), [[4, false, false, "ai"], [5, false, false, "ai"]]);
  const w = r.warnings.find((x) => x.code === "REPLANNED");
  assert.deepEqual([w.engine, w.added], ["rhythm", 2]);
  assert.ok(w.keptUserChanges >= 3, `kept ${w.keptUserChanges}`);
  assert.deepEqual(r.costEvents.map((c) => [c.elementId, c.prefetched, c.net]), [["br_new0010", true, "none"], ["br_new0005", false, "fetch"]]);
  assert.ok(p.provenance.rhythm.adjustments.some((a) => a.rule === "max_items"));
  assert.equal(r.invalidates.level, "COMPOSITE");
  assert.deepEqual(p.music, u1.music, "a null music proposal never removes the AI music bed");
  assert.ok(byId(p.effects, "fx_0002") && !byId(p.effects, "fx_po0002"), "an overlapping proposal keeps the existing eligible item (no id churn)");
  assert.ok(!r.warnings.find((x) => x.code === "REPLANNED") || !byId(p.effects, "fx_near08"), "an overlapping proposal never duplicates a protected item");
  assert.ok(!byId(p.effects, "fx_near08"));
});

t("fallback without a rhythm engine only drops eligible items above the caps and never adds", () => {
  const r = replanForSettings(P, { brollIntensity: "low" }, { ...CTX, selectEdits: null });
  assert.equal(r.report.engine, "fallback");
  assert.equal(r.report.added, 0);
  assert.deepEqual(r.report.removedIds.sort(), ["br_0001", "br_0002", "sfx_0001"]);
  assert.ok(byId(r.plan.broll, "br_0003"), "locked B-roll kept");
  assert.ok(r.plan.provenance.rhythm.adjustments.some((a) => a.rule === "broll_cap"));
  const dyn = clone(P);
  dyn.settings.effects = "dynamic";
  byId(dyn.effects, "fx_0004").enabled = true;
  const sub = replanForSettings(dyn, { effects: "subtle" }, { ...CTX, selectEdits: null });
  assert.ok(sub.report.removedIds.includes("fx_0004"), "ZOOM_EMPHASIS is dynamic-only");
  assert.ok(byId(sub.plan.broll, "br_0001"), "an effects change never trims B-roll");
  assert.throws(() => replanForSettings(P, { brollIntensity: "extreme" }, CTX), (e) => e.code === "INVALID_SETTINGS" && e.status === 422);
});

t("integration: the real director/rhythm engine (when present) keeps protections and yields valid plans", () => {
  const { loadSelectEdits } = require("../src/video_edit/plan/replan");
  if (!loadSelectEdits({})) { console.log("       (director/rhythm.js not present — skipped)"); return; }
  const u1 = apply([{ type: "broll.remove", id: "br_0002" }, { type: "effect.toggle", id: "fx_0008", enabled: false }]).plan;
  const src = (a) => (a.kind === "words" ? [WORDS[a.w0].start, WORDS[a.w1].end] : a.kind === "src" ? [a.srcIn, a.srcOut] : null);
  const removedSpan = src(byId(u1.broll, "br_0002").anchor);
  for (const [key, value] of [["brollIntensity", "high"], ["brollIntensity", "low"], ["effects", "dynamic"], ["removeSilence", false]]) {
    const r = applyOps(u1, [{ type: "settings.set", key, value }], { ...CTX, selectEdits: undefined });
    const p = r.plan;
    assert.equal(r.warnings.find((w) => w.code === "REPLANNED").engine, "rhythm", key);
    assert.equal(byId(p.broll, "br_0002").status, "removed", `${key}: tombstone kept`);
    for (const b of p.broll.filter((x) => x.id !== "br_0002" && x.status !== "removed")) {
      const s = src(b.anchor);
      const inter = s ? Math.max(0, Math.min(s[1], removedSpan[1]) - Math.max(s[0], removedSpan[0])) : 0;
      assert.ok(inter < 0.5 * Math.min(s[1] - s[0], removedSpan[1] - removedSpan[0]), `${key}: ${b.id} resurrects the removed B-roll`);
    }
    assert.equal(byId(p.broll, "br_0003").locked, true, `${key}: locked kept`);
    assert.deepEqual([byId(p.effects, "fx_0008").enabled, byId(p.effects, "fx_0008").userModified], [false, true], `${key}: user change kept`);
    assert.deepEqual(p.music, u1.music, `${key}: music untouched`);
    const again = applyOps(p, [{ type: "settings.set", key, value: key === "removeSilence" ? true : value }], { ...CTX, selectEdits: undefined });
    const back = key === "removeSilence" ? applyOps(again.plan, [{ type: "settings.set", key, value }], { ...CTX, selectEdits: undefined }) : null;
    if (key !== "removeSilence") assert.equal(again.warnings.find((w) => w.code === "NOOP") ? "noop" : "changed", "noop", `${key}: re-setting the same value is a no-op`);
    const second = replanForSettings(p, { [key]: value }, { ...CTX, selectEdits: undefined });
    assert.deepEqual([second.report.addedIds, second.report.removedIds], [[], []], `${key}: a second re-plan with the same setting churns nothing`);
    const ids = (x) => ["broll", "effects", "graphics", "sfx", "transitions"].map((k) => x[k].map((e) => e.id).join(",")).join("|");
    assert.equal(ids(second.plan), ids(p), `${key}: element ids stable`);
    if (back) assert.ok(parsePlan(back.plan, { wordCount: WORDS.length }).ok, `${key}: toggling back stays valid`);
  }
});

// ======================================================================== invalidation
section("plan/ops — invalidation levels and ranges");

t("per-op levels follow the §5 table (variants)", () => {
  const lv = (ops) => apply(ops).invalidates.level;
  assert.equal(lv([{ type: "broll.setLayout", id: "br_0001", layout: "SPLIT" }]), "BASE", "SPLIT is A-roll level");
  assert.equal(lv([{ type: "effect.toggle", id: "fx_0006", enabled: true }]), "SHIFT", "FREEZE changes duration");
  assert.equal(lv([{ type: "effect.toggle", id: "fx_0007", enabled: true }]), "COMPOSITE", "B-roll SPEED is overlay level");
  assert.equal(lv([{ type: "transition.set", id: "tr_0002", kind: "FLASH" }]), "COMPOSITE");
  assert.equal(lv([{ type: "settings.set", key: "effects", value: "dynamic" }]), "BASE");
  assert.equal(lv([{ type: "settings.set", key: "brollIntensity", value: "high" }]), "COMPOSITE");
  assert.equal(lv([{ type: "settings.set", key: "punchInOnJumpCuts", value: false }]), "SHIFT");
  assert.equal(lv([{ type: "settings.set", key: "removeSilence", value: true }]), "NONE", "no-op setting");
  const frz = apply([{ type: "effect.toggle", id: "fx_0006", enabled: true }]);
  assert.ok(Math.abs(frz.plan.timeline.outDurationSec - P.timeline.outDurationSec - 0.5) < 0.04);
});

t("ranges: cue span for caption ops, cut position → end for SHIFT, max level + merged ranges for a batch", () => {
  const hide = apply([{ type: "caption.hide", cueId: CUE.id }]).invalidates;
  const r3 = (x) => Math.round(x * 1000) / 1000;
  assert.deepEqual(hide, { level: "COMPOSITE", ranges: [[r3(CUE.resolved.outIn), r3(CUE.resolved.outOut)]] });
  const cut = apply([{ type: "cut.toggle", cutId: "cut_0003", enabled: false }]);
  const oldCut = byId(P.cuts, "cut_0003");
  assert.equal(cut.invalidates.ranges.length, 1);
  assert.ok(Math.abs(cut.invalidates.ranges[0][0] - P.timeline.pieces.find((pc) => pc.srcIn >= oldCut.srcOut - 0.05).outIn) < 0.05);
  assert.equal(cut.invalidates.ranges[0][1], r3(cut.plan.timeline.outDurationSec));
  const batch = apply([{ type: "music.setVolume", volumeDb: -6 }, { type: "caption.hide", cueId: CUE.id }, { type: "broll.remove", id: "br_0002" }]).invalidates;
  assert.equal(batch.level, "COMPOSITE");
  for (let k = 1; k < batch.ranges.length; k++) assert.ok(batch.ranges[k][0] > batch.ranges[k - 1][1], "merged ranges are disjoint and sorted");
  const brSpan = byId(P.broll, "br_0002").resolved;
  const narrow = apply([{ type: "caption.hide", cueId: CUE.id }, { type: "broll.remove", id: "br_0002" }]).invalidates;
  assert.deepEqual(narrow.ranges, [[r3(CUE.resolved.outIn), r3(CUE.resolved.outOut)], [r3(brSpan.outIn), r3(brSpan.outOut)]]);
  assert.deepEqual(apply([{ type: "broll.setLocked", id: "br_0001", locked: true }, { type: "edit.setTitle", title: "x" }]).invalidates, { level: "NONE", ranges: [] });
  assert.equal(apply([{ type: "caption.hide", cueId: CUE.id }, { type: "cut.toggle", cutId: "cut_0004", enabled: false }]).invalidates.level, "SHIFT");
});

// ======================================================================== provenance
section("plan/ops — provenance");

t("one provenance entry per op with opId, at = ctx.now, type, elementIds and batchId", () => {
  const r = apply([{ type: "caption.hide", cueId: CUE.id }, { type: "broll.remove", id: "br_0001" }, { type: "sfx.muteAll", muted: true }], { batchId: "b-prov" });
  const ops = r.plan.provenance.ops;
  assert.equal(ops.length, P.provenance.ops.length + 3);
  assert.deepEqual(ops.slice(-3).map((o) => [o.type, o.at, o.batchId, o.elementIds]), [
    ["caption.hide", NOW, "b-prov", [CUE.id]], ["broll.remove", NOW, "b-prov", ["br_0001"]], ["sfx.muteAll", NOW, "b-prov", []],
  ]);
  for (const o of ops.slice(-3)) assert.match(o.opId, /^op_[0-9a-f]{12}$/);
  assert.equal(new Set(ops.map((o) => o.opId)).size, ops.length);
  const again = applyOps(r.plan, [{ type: "sfx.muteAll", muted: false }], { ...CTX, now: NOW + 5, batchId: null });
  assert.deepEqual(again.plan.provenance.ops.slice(-1).map((o) => [o.at, o.batchId]), [[NOW + 5, null]]);
});

// ======================================================================== caption editing end to end
section("plan/ops — caption.editText end to end");

t("edits survive resolve, keep later cue ids and reject all-deleted / punctuation / oversize text", () => {
  const r = apply([{ type: "caption.editText", cueId: CUE.id, text: CUE.text.replace("inbox", "e-mail inbox") }]);
  const seq = r.plan.captions.cues.flatMap((c) => c.words);
  const at = seq.findIndex((w) => w.key === `w${I_INBOX}`);
  assert.ok(at > 0 && seq[at - 1].text === "e-mail" && seq[at - 1].i === null, "inserted word captioned right before 'inbox'");
  const later = (plan) => plan.captions.cues.filter((c) => c.anchor.w0 > CUE.anchor.w1 + 12).map((c) => c.id);
  assert.deepEqual(later(r.plan), later(P));
  rejects([{ type: "caption.editText", cueId: CUE.id, text: "   " }], { needle: "use caption.hide" });
  rejects([{ type: "caption.editText", cueId: CUE.id, text: "?!…" }], { needle: "punctuation only" });
  rejects([{ type: "caption.editText", cueId: CUE.id, text: Array.from({ length: 2 * CUE.words.length + 5 }, () => "go").join(" ") }], { needle: "at most" });
  const round = applyOps(apply([{ type: "caption.editText", cueId: CUE.id, text: CUE.text.replace("inbox", "INBOX") }]).plan,
    [{ type: "caption.editText", cueId: CUE.id, text: CUE.text }], CTX).plan;
  assert.deepEqual(round.captions.overrides.wordText, {}, "reverting to the transcript text drops the override");
});

// ======================================================================== revisions
section("plan/revisions — commit, conflicts, replay, undo/redo");

const stamps = (plan) => { const { revision, parentRevision, createdAt, createdBy, ...rest } = plan; return sha256Json(rest); };

t("commit, 409 on a stale head, batchId replay, undo/redo equal to target content, history labels", async () => {
  let clock = NOW;
  const settings = makeSettings(tmp.dir);
  const store = createStore({ settings, now: () => clock, log: silentLog });
  store.init();
  const { id } = store.createProject({ ownerId: "user-1" });
  try {
    const r1 = await Rev.commitRevision({ store, projectId: id, plan: P, author: "director", summary: "AI edit", expectedRevision: 0, now: NOW });
    assert.deepEqual([r1.revision, r1.replayed], [1, false]);
    const doc1 = store.loadRevision(id, 1);
    assert.deepEqual([doc1.plan.revision, doc1.plan.parentRevision, doc1.plan.createdBy, doc1.plan.createdAt], [1, null, "director", NOW]);
    assert.deepEqual(Rev.historyView(store.get(id)), { canUndo: false, canRedo: false, undoLabel: null, redoLabel: null });

    const edit = applyOps(doc1.plan, [{ type: "broll.remove", id: "br_0001" }], { ...CTX, batchId: "b-1" });
    clock += 1000;
    const r2 = await Rev.commitRevision({ store, projectId: id, plan: edit.plan, summary: "Remove B-roll #1", opsCount: 1, expectedRevision: 1, batchId: "b-1", response: { applied: 1 }, now: clock });
    assert.equal(r2.revision, 2);
    assert.deepEqual(Rev.historyView(store.get(id)), { canUndo: true, canRedo: false, undoLabel: "Remove B-roll #1", redoLabel: null });

    const replay = await Rev.commitRevision({ store, projectId: id, plan: edit.plan, expectedRevision: 1, batchId: "b-1", now: clock });
    assert.deepEqual([replay.revision, replay.hash, replay.replayed, replay.response], [2, r2.hash, true, { applied: 1 }]);
    assert.equal(store.get(id).plan.headRevision, 2, "replay wrote nothing");

    await assert.rejects(Rev.commitRevision({ store, projectId: id, plan: edit.plan, expectedRevision: 1, batchId: "b-2", now: clock }),
      (e) => e.code === "REVISION_CONFLICT" && e.status === 409 && e.extra.headRevision === 2);

    const u = await Rev.undo({ store, projectId: id, expectedRevision: 2, batchId: "u-1", now: clock + 1 });
    assert.deepEqual([u.revision, u.label, u.invalidates.level], [3, "Remove B-roll #1", "COMPOSITE"]);
    const doc3 = store.loadRevision(id, 3);
    assert.equal(stamps(doc3.plan), stamps(doc1.plan), "undo content equals r1");
    assert.deepEqual([doc3.plan.parentRevision, store.get(id).plan.revisions[2].summary], [2, "Undo: Remove B-roll #1"]);
    assert.deepEqual(Rev.historyView(store.get(id)), { canUndo: false, canRedo: true, undoLabel: null, redoLabel: "Remove B-roll #1" });
    await assert.rejects(Rev.undo({ store, projectId: id, expectedRevision: 3, now: clock }), (e) => e.code === "NOTHING_TO_UNDO" && e.status === 409);
    const uReplay = await Rev.undo({ store, projectId: id, expectedRevision: 1, batchId: "u-1", now: clock });
    assert.deepEqual([uReplay.revision, uReplay.replayed], [3, true]);

    const rd = await Rev.redo({ store, projectId: id, expectedRevision: 3, now: clock + 2 });
    assert.equal(rd.revision, 4);
    assert.equal(stamps(store.loadRevision(id, 4).plan), stamps(store.loadRevision(id, 2).plan), "redo content equals r2");
    assert.deepEqual(Rev.historyView(store.get(id)), { canUndo: true, canRedo: false, undoLabel: "Remove B-roll #1", redoLabel: null });

    await Rev.undo({ store, projectId: id, expectedRevision: 4, now: clock + 3 });
    assert.equal(Rev.historyView(store.get(id)).canRedo, true);
    const head = store.loadRevision(id, 5).plan;
    const e2 = applyOps(head, [{ type: "music.setVolume", volumeDb: -3 }], CTX);
    const r6 = await Rev.commitRevision({ store, projectId: id, plan: e2.plan, summary: "Music volume", expectedRevision: 5, now: clock + 4 });
    assert.equal(r6.revision, 6);
    assert.deepEqual(Rev.historyView(store.get(id)), { canUndo: true, canRedo: false, undoLabel: "Music volume", redoLabel: null }, "a new edit clears redo");
    assert.equal(store.get(id).plan.revisions.length, 6);
    for (let rev = 1; rev <= 6; rev++) assert.ok(store.loadRevision(id, rev), `r${rev} readable and hash-verified`);
    await assert.rejects(Rev.commitRevision({ store, projectId: id, plan: { ...clone(head), cuts: "nope" }, expectedRevision: 6, now: clock }), (e) => e.code === "INVALID_PLAN" && e.status === 422);
  } finally { store.close(); }
});

t("diffLevels helpers: ops merge, plan estimate, composition stub throws NOT_IMPLEMENTED", () => {
  assert.deepEqual(Rev.diffLevelsFromOps([{ level: "AUDIO", ranges: [[0, 1]] }, { level: "COMPOSITE", ranges: [[0.5, 2], [5, 6]] }]), { level: "COMPOSITE", ranges: [[0, 2], [5, 6]] });
  assert.deepEqual(Rev.diffLevelsFromOps([]), { level: "NONE", ranges: [] });
  assert.equal(Rev.diffLevelsFromPlans(P, clone(P)).level, "NONE");
  assert.equal(Rev.diffLevelsFromPlans(P, apply([{ type: "music.setVolume", volumeDb: -3 }]).plan).level, "AUDIO");
  assert.equal(Rev.diffLevelsFromPlans(P, apply([{ type: "caption.hide", cueId: CUE.id }]).plan).level, "COMPOSITE");
  assert.equal(Rev.diffLevelsFromPlans(P, apply([{ type: "framing.adjust", segmentId: "seg_2", offsetX: 0.1, offsetY: 0, zoom: 1.1 }]).plan).level, "BASE");
  assert.equal(Rev.diffLevelsFromPlans(P, apply([{ type: "cut.toggle", cutId: "cut_0004", enabled: false }]).plan).level, "SHIFT");
  assert.throws(() => Rev.diffLevelsFromCompositions({}, {}), (e) => isEditError(e) && e.code === "NOT_IMPLEMENTED" && e.status === 501);
});

// ======================================================================== review regressions (Phase 4a)
section("review regressions — ops");

t("hidden captions and per-cue positions survive style, words-per-line and cut changes", () => {
  const multi = P.captions.cues.find((c) => c.words.length >= 3);
  const keys = new Set(multi.words.map((w) => w.key));
  const hid = apply([{ type: "caption.hide", cueId: multi.id }]).plan;
  assert.deepEqual(hid.captions.overrides.hiddenCueWords, [...keys].sort());
  assert.ok(apply([{ type: "caption.hide", cueId: multi.id }], {}, hid).warnings.some((w) => w.code === "NOOP"), "hiding a hidden cue is a no-op");
  for (const [styleId, maxWordsPerLine] of [["clean", 3], ["single_word", 1], ["minimal_lower", 2], ["karaoke_blob", 2], ["bold_pop", 3]]) {
    const r = applyOps(hid, [{ type: "captions.setStyle", styleId, maxWordsPerLine }], CTX).plan;
    const visibleHidden = r.captions.cues.filter((c) => !c.hidden).flatMap((c) => c.words).filter((w) => keys.has(w.key)).length;
    const hiddenOthers = r.captions.cues.filter((c) => c.hidden).flatMap((c) => c.words).filter((w) => !keys.has(w.key)).length;
    assert.deepEqual([visibleHidden, hiddenOthers], [0, 0], styleId);
  }
  const single = applyOps(hid, [{ type: "captions.setStyle", styleId: "single_word" }], CTX).plan;
  const piece = single.captions.cues.find((c) => c.hidden);
  const shown = applyOps(single, [{ type: "caption.show", cueId: piece.id }], CTX).plan;
  assert.equal(cueById(shown, piece.id).hidden, false);
  assert.equal(shown.captions.cues.filter((c) => c.hidden).length, single.captions.cues.filter((c) => c.hidden).length - 1, "show un-hides exactly that piece");

  const restored = apply([{ type: "cut.toggle", cutId: "cut_0004", enabled: false }]).plan;
  const um = restored.captions.cues.find((c) => c.words[0] && c.words[0].key === "w12");
  const umKeys = new Set(um.words.map((w) => w.key));
  const hid2 = applyOps(restored, [{ type: "caption.hide", cueId: um.id }], CTX).plan;
  const back = applyOps(hid2, [{ type: "cut.toggle", cutId: "cut_0004", enabled: true }], CTX).plan;
  assert.equal(back.captions.cues.filter((c) => !c.hidden).flatMap((c) => c.words).filter((w) => umKeys.has(w.key)).length, 0, "re-cutting the filler re-exposes nothing");

  const pinned = apply([{ type: "caption.setPosition", cueId: CUE.id, y: 0.3 }]).plan;
  const styled = applyOps(pinned, [{ type: "captions.setStyle", styleId: "single_word" }], CTX).plan;
  const moved = styled.captions.cues.filter((c) => c.words.some((w) => CUE.words.some((x) => x.key === w.key)));
  assert.ok(moved.length > 1 && moved.every((c) => c.pos.y === 0.3 && c.pos.an === 8), JSON.stringify(moved.map((c) => c.pos)));
  const cleared = applyOps(pinned, [{ type: "caption.setPosition", cueId: CUE.id, y: null }], CTX).plan;
  assert.deepEqual(cueById(cleared, CUE.id).pos, cueById(P, CUE.id).pos);
});

t("a word typed next to a removed filler is captioned; a word that cannot play is reported", () => {
  const { emptyPlan } = require("../src/video_edit/plan/schema");
  const { projectId, fps: _f, ...src } = SOURCE;
  const mk = (cuts) => { const p = emptyPlan({ projectId, source: { ...src, durationSec: 4 }, output: { aspect: "9:16" }, now: 1 }); p.settings.autoJumpCuts = false; p.cuts = cuts; return p; };
  const cut = (id, a, b, extra = {}) => ({ id, kind: "USER", srcIn: a, srcOut: b, raw: { srcIn: a, srcOut: b }, snap: { method: "none", padIn: 0, padOut: 0 }, wordRange: null,
    confidence: 1, controlledBy: null, enabled: true, userToggled: true, reason: "t", origin: "user", locked: false, ...extra });
  const words = [
    { i: 0, text: "We", start: 0.5, end: 0.71, conf: 0.99, sentenceId: "s1" }, { i: 1, text: "shipped", start: 0.74, end: 1.21, conf: 0.99, sentenceId: "s1" },
    { i: 2, text: "um,", start: 1.225, end: 1.52, conf: 0.99, sentenceId: "s1" }, { i: 3, text: "early.", start: 1.6, end: 2.1, conf: 0.99, sentenceId: "s1" },
  ];
  const filler = cut("cut_0001", 1.21, 1.57, { kind: "FILLER", controlledBy: "removeFillers", fillerKind: "pure", userToggled: false, wordRange: [2, 2], origin: "heuristic" });
  const ctx = { words, now: NOW, batchId: "ins" };
  const p = resolvePlan(mk([filler]), ctx);
  const r = applyOps(p, [{ type: "caption.editText", cueId: p.captions.cues[0].id, text: "We shipped it" }], ctx);
  assert.equal(r.plan.captions.cues[0].text, "We shipped it");
  const it = r.plan.captions.cues[0].words.find((w) => w.text === "it");
  assert.ok(it.outEnd - it.outStart >= 0.08 - 1e-6, JSON.stringify(it));
  assert.deepEqual(r.warnings, []);

  const w2 = [
    { i: 0, text: "Keep", start: 0.5, end: 0.9, conf: 0.99, sentenceId: "s1" }, { i: 1, text: "going.", start: 1.0, end: 1.3, conf: 0.99, sentenceId: "s1" },
    { i: 2, text: "Next.", start: 2.2, end: 2.6, conf: 0.99, sentenceId: "s2" },
  ];
  const ctx2 = { words: w2, now: NOW, batchId: "ins2" };
  const p2 = resolvePlan(mk([cut("cut_0002", 1.2, 1.9)]), ctx2);
  const r2 = applyOps(p2, [{ type: "caption.editText", cueId: p2.captions.cues[0].id, text: "Keep going now." }], ctx2);
  assert.ok(r2.warnings.some((w) => w.code === "CAPTION_WORD_CUT" && w.text === "now."), JSON.stringify(r2.warnings));
});

t("broll.regenerate walks the stored ranking once, then asks for a new search", () => {
  let plan = P;
  const seq = [];
  for (let k = 0; k < 4; k++) {
    const r = applyOps(plan, [{ type: "broll.regenerate", id: "br_0001" }], { ...CTX, batchId: `rg${k}` });
    plan = r.plan;
    const b = byId(plan.broll, "br_0001");
    seq.push([b.chosen && b.chosen.assetId, b.status, r.costEvents.map((c) => c.job).join(",")]);
  }
  assert.deepEqual(seq, [
    ["ast_pexels0003", "pending", "download_broll"], ["ast_pexels0004", "ok", ""],
    ["ast_pexels0004", "pending", "search_broll,broll_judge"], ["ast_pexels0004", "pending", "search_broll,broll_judge"],
  ]);
  assert.deepEqual(byId(plan.broll, "br_0001").seenCandidates, ["ast_pexels0001", "ast_pexels0003", "ast_pexels0004"]);
  assert.ok(parsePlan(plan, { wordCount: WORDS.length }).ok);
});

t("volume sliders are monotonic and distinct over their whole range", () => {
  const music = [-30, -20, -12, -9, -6, -3, 0].map((volumeDb) => apply([{ type: "music.setVolume", volumeDb }]));
  const mv = music.map((r) => r.plan.music.volume);
  for (let k = 1; k < mv.length; k++) assert.ok(mv[k] > mv[k - 1], `music ${mv.join(", ")}`);
  assert.deepEqual([mv[0], mv[mv.length - 1]], [0.06, 0.16]);
  const sfx = [-30, -20, -10, -4, 0, 3, 6].map((volumeDb) => apply([{ type: "sfx.setVolume", id: "sfx_0001", volumeDb }]));
  const sv = sfx.map((r) => byId(r.plan.sfx, "sfx_0001").volume);
  for (let k = 1; k < sv.length; k++) assert.ok(sv[k] > sv[k - 1], `sfx ${sv.join(", ")}`);
  assert.deepEqual([sv[0], sv[4], sv[6]], [0.15, 0.25, 0.45]);
  assert.ok([...music, ...sfx].every((r) => !r.warnings.some((w) => w.code === "VOLUME_CLAMPED")));
});

t("an op that changes the timeline geometry invalidates SHIFT whatever its table level (effectsEnabled with a FREEZE)", () => {
  const frz = apply([{ type: "effect.toggle", id: "fx_0006", enabled: true }]).plan;
  const hold = frz.timeline.pieces.find((p) => p.kind === "hold");
  assert.ok(hold, "fixture FREEZE inserts a hold piece");
  const off = applyOps(frz, [{ type: "settings.set", key: "effectsEnabled", value: false }], CTX);
  assert.ok(off.plan.timeline.outDurationSec < frz.timeline.outDurationSec - 0.4);
  assert.equal(off.invalidates.level, "SHIFT");
  const end = Math.round(frz.timeline.outDurationSec * 1000) / 1000;
  assert.ok(off.invalidates.ranges.some(([a, b]) => a <= hold.outIn + 1e-3 && b >= end - 1e-3), JSON.stringify(off.invalidates));
  assert.equal(apply([{ type: "effect.toggle", id: "fx_0001", enabled: false }]).invalidates.level, "BASE", "no geometry change keeps the table level");
});

run().then(() => { restoreFetch(); tmp.cleanup(); });
