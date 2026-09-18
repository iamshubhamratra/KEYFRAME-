// VIDEO EDIT PLAN RESOLUTION — derive every output-timeline value of a plan (EDIT_PLAN.md §4).
//
// WHY THIS EXISTS. A plan stores intent on the SOURCE timeline (cuts, word anchors, overrides); the
// renderer, the editor and QA need OUTPUT times, pieces, caption cues and positions. Those must be
// re-derived after every op batch and before every composition from the same inputs in the same
// way, or two renders of one revision disagree and cached chunks are reused for the wrong frames.
// resolvePlan is that single derivation: pure, input never mutated, and byte-identical canonical
// JSON for identical inputs (tested). It never stamps a time and never mints an id.
//
// CONTRACT:
//   resolvePlan(plan, { words, sentences?, envelope?, faces?, mezz?:{w,h}, scenes?, emphasis?, now? }) -> plan
//     - timeline.pieces / outDurationSec / mapHash (sha256 of piece geometry); chunkKey includes the
//       jump-cut framing slice ({ z, offsetX, offsetY, crop }, ranked over plan.cuts for toggle locality) when
//       autoJumpCuts && punchInOnJumpCuts.
//     - resolved {outIn,outOut,collapsed} for aRoll segments, effects, cues (2 frames), B-roll and
//       graphics (0.4 s); sfx.resolved {outAt, collapsed} from the anchored element's edge + offset.
//     - provenance.rhythm.adjustments: previous min_cut/min_keep entries replaced by this derivation.
//     - captions.cues = buildCues(words whose source midpoint plays ∖ hiddenWords ∪ insertions (same midpoint test),
//       with wordText / emphasis overrides; grouped, styled and placed in captions.sourceLanguage) → hidden when every
//       word is in hiddenCueWords (or legacy hiddenCues by id) → placeCues (faces, graphics/PIP overlays, SPLIT seam,
//       cueYWords by the cue's first pinned word, legacy cueY by id). Cues never end past outDurationSec.
//       captions.highlight forced 'none' when timing is approx and mean word conf < 0.5.
//   words: transcript words [{ i, text, start, end, conf, sentenceId? }] with words[k].i === k.
//   `sentences`, `envelope` and `now` are accepted for call-site symmetry with the timeline helpers and
//   are not needed here (cut edges were refined at detection time; no timestamps are written).

const { needsFit, fitPlacement } = require("../render/profiles");   // fit geometry shared with the renderer
const { EditError } = require("../errors");
const { sha256Json } = require("../fsx");
const T = require("./timeline");
const { resolveStyle } = require("../captions/styles");
const { buildCues } = require("../captions/group");
const { placeCues } = require("../captions/place");

const MIN_DUR_SHORT = 2 / T.FPS;
const MIN_DUR_OVERLAY = 0.4;
const REGION_BOXES = Object.freeze({
  top: Object.freeze({ x: 0.05, y: 0.06, w: 0.9, h: 0.22 }),
  center: Object.freeze({ x: 0.05, y: 0.36, w: 0.9, h: 0.28 }),
  bottom: Object.freeze({ x: 0.05, y: 0.7, w: 0.9, h: 0.22 }),
});

const r6 = (x) => Math.round(x * 1e6) / 1e6;
const clone = (v) => JSON.parse(JSON.stringify(v));
const live = (b) => b.status !== "removed" && b.status !== "missing";

function invalid(detail) {
  return new EditError("INVALID_PLAN", { status: 422, errorClass: "input", detail });
}

function faceTrackToOut(faces, map, mezz, output, aspect, background = "none") {
  if (!faces || faces.mode === "assumed" || !Array.isArray(faces.keyframes) || !faces.keyframes.length) return null;
  const W = mezz.w, H = mezz.h;
  if (needsFit(mezz, aspect, background)) {
    // The whole frame is fitted over a blurred fill (render/compose): no crop, a uniform scale and a centring offset.
    const fp = fitPlacement(mezz, { w: output.width, h: output.height });
    const absentF = Array.isArray(faces.absent) ? faces.absent : [];
    const out = new Map();
    for (const kf of faces.keyframes) {
      if (!kf || !Number.isFinite(kf.t) || absentF.some((r) => kf.t >= r.start && kf.t < r.end)) continue;
      const t = map.srcToOutStart(kf.t);
      out.set(t, {
        t, cx: r6((kf.cx * W * fp.s + fp.x) / output.width), cy: r6((kf.cy * H * fp.s + fp.y) / output.height),
        h: r6((kf.h * H * fp.s) / output.height), w: r6((kf.h * H * 0.8 * fp.s) / output.width),
      });
    }
    return [...out.values()].sort((a, b) => a.t - b.t);
  }
  const A = output.width / output.height;
  const bw = Math.min(W, H * A);
  const geom = { W, H, bw, bh: bw / A };
  const yTarget = T.FACE_Y_TARGET[aspect] != null ? T.FACE_Y_TARGET[aspect] : 0.4;
  const absent = Array.isArray(faces.absent) ? faces.absent : [];
  const byT = new Map();
  for (const kf of faces.keyframes) {
    if (!kf || !Number.isFinite(kf.t) || absent.some((r) => kf.t >= r.start && kf.t < r.end)) continue;
    const crop = T.cropFor(geom, 1, kf, 0, yTarget);
    const t = map.srcToOutStart(kf.t);
    byT.set(t, {
      t,
      cx: r6((kf.cx * W - crop.x) / crop.w),
      cy: r6((kf.cy * H - crop.y) / crop.h),
      h: r6((kf.h * H) / crop.h),
      w: r6((kf.h * H * 0.8) / crop.w),
    });
  }
  return [...byT.values()].sort((a, b) => a.t - b.t);
}

function pipBox(b, output) {
  const s = b.layoutParams && b.layoutParams.scale ? b.layoutParams.scale : 0.4;
  const w = s, h = Math.min(0.9, (s * output.width) / output.height * (9 / 16));
  const corner = (b.layoutParams && b.layoutParams.corner) || "tr";
  const m = 0.04;
  return { x: corner.endsWith("l") ? m : 1 - m - w, y: corner.startsWith("t") ? m : 1 - m - h, w, h };
}

// A word (or insertion) is captioned when its source midpoint plays in the output — the same test the cut
// rules use — never by its output length: STT routinely emits 30–60 ms function words ("a", "I") and
// zero-length ties that no cut removed.
function deriveOutWords(plan, words, map, emphasisKeys) {
  const ov = plan.captions.overrides;
  const hidden = new Set(ov.hiddenWords || []);
  const cueHidden = new Set(ov.hiddenCueWords || []);
  const wordText = ov.wordText || {};
  const emphasis = ov.emphasis || {};
  const out = [];
  const span = (start, end) => {
    const outStart = map.srcToOutStart(start);
    return { outStart, outEnd: Math.max(outStart, map.srcToOutEnd(end)) };
  };
  words.forEach((w, idx) => {
    const i = Number.isInteger(w.i) ? w.i : idx;
    if (hidden.has(i)) return;
    const edited = Object.prototype.hasOwnProperty.call(wordText, String(i));
    const text = edited ? wordText[String(i)] : w.text;
    if (typeof text !== "string" || !text.trim()) return;
    if (!Number.isFinite(w.start) || !Number.isFinite(w.end) || !map.keptAt((w.start + w.end) / 2)) return;
    const key = `w${i}`;
    out.push({
      order: [i, 0, 0], key, i, text,
      srcStart: w.start, srcEnd: w.end, ...span(w.start, w.end),
      emphasis: Object.prototype.hasOwnProperty.call(emphasis, key) ? !!emphasis[key] : (emphasisKeys.has(key) || w.emphasis === true),
      conf: Number.isFinite(w.conf) ? w.conf : 1,
      sentenceId: w.sentenceId == null ? null : w.sentenceId,
      edited, cueHidden: cueHidden.has(key),
    });
  });
  for (const ins of ov.insertions || []) {
    if (!map.keptAt((ins.srcStart + ins.srcEnd) / 2)) continue;
    const anchorWord = words[Math.max(0, ins.afterWordIndex)] || null;
    out.push({
      order: [ins.afterWordIndex, 1, ins.order], key: ins.key, i: null, anchorIndex: Math.max(0, ins.afterWordIndex), text: ins.text,
      srcStart: ins.srcStart, srcEnd: ins.srcEnd, ...span(ins.srcStart, ins.srcEnd),
      emphasis: Object.prototype.hasOwnProperty.call(emphasis, ins.key) ? !!emphasis[ins.key] : false,
      conf: 1,
      sentenceId: anchorWord && anchorWord.sentenceId != null ? anchorWord.sentenceId : null,
      edited: true, cueHidden: cueHidden.has(ins.key),
    });
  }
  out.sort((a, b) => a.order[0] - b.order[0] || a.order[1] - b.order[1] || a.order[2] - b.order[2] || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return out;
}

function resolvePlan(plan, ctx = {}) {
  if (!plan || typeof plan !== "object" || !plan.source || !plan.settings || !plan.captions || !plan.output) {
    throw invalid("resolvePlan: a plan with source, output, settings and captions is required");
  }
  const words = Array.isArray(ctx.words) ? ctx.words : [];
  const next = clone(plan);
  const settings = next.settings;
  const output = next.output;
  const aspect = output.aspect;

  // 1. cuts -> pieces -> time map
  const built = T.buildPieces(next, { words, settings });
  const map = T.buildTimeMap(built.pieces);
  const resolveEl = (el, minDur) => { el.resolved = map.resolveAnchor(el.anchor, words, { minDur }); };

  // 2. anchored elements
  next.aRoll.segments.forEach((s) => resolveEl(s, MIN_DUR_SHORT));
  next.broll.forEach((b) => resolveEl(b, MIN_DUR_OVERLAY));
  next.graphics.forEach((g) => resolveEl(g, MIN_DUR_OVERLAY));
  next.effects.forEach((e) => resolveEl(e, MIN_DUR_SHORT));

  const brollRanges = (layout) => next.broll
    .filter((b) => b.layout === layout && live(b) && b.resolved && !b.resolved.collapsed)
    .map((b) => ({ outIn: b.resolved.outIn, outOut: b.resolved.outOut }));
  const fullBrollRanges = brollRanges("FULL");
  const splitRanges = brollRanges("SPLIT");

  // 3. timeline (+ jump-cut framing slice in the chunk keys)
  const mezz = ctx.mezz && ctx.mezz.w > 0 && ctx.mezz.h > 0 ? { w: ctx.mezz.w, h: ctx.mezz.h } : { w: next.source.width, h: next.source.height };
  let pieces = built.pieces;
  if (settings.autoJumpCuts && settings.punchInOnJumpCuts && pieces.length) {
    const framing = T.jumpCutFraming(pieces, ctx.faces || null, {
      effects: settings.effects, aspect, mezz, output: { w: output.width, h: output.height },
      scenes: Array.isArray(ctx.scenes) ? ctx.scenes : [], cuts: next.cuts,
    });
    pieces = pieces.map((p, i) => ({ ...p, chunkKey: T.chunkKeyFor(p, { z: framing[i].z, offsetX: framing[i].offsetX, offsetY: framing[i].offsetY, crop: framing[i].crop }) }));
  }
  next.timeline = {
    pieces,
    outDurationSec: built.outDurationSec,
    mapHash: sha256Json(pieces.map((p) => [p.srcIn, p.srcOut, p.outIn, p.outOut, p.kind, p.rate])),
  };
  const kept = (next.provenance.rhythm.adjustments || []).filter((a) => !T.TIMELINE_RULES.includes(a.rule));
  next.provenance.rhythm.adjustments = [...kept, ...built.adjustments];

  // 4. captions
  const cap = next.captions;
  const emphasisKeys = new Set((Array.isArray(ctx.emphasis) ? ctx.emphasis : []).map((e) => (Number.isInteger(e) ? `w${e}` : String(e))));
  const outWords = deriveOutWords(next, words, map, emphasisKeys);
  // captions.cues are the SOURCE-language cues (shown while a translation is pending or failed): grouping,
  // font, reading speed and placement follow the spoken language; translations[lang].cues carry the target.
  const lang = cap.sourceLanguage || next.source.language || "en";
  const style = resolveStyle(cap.styleId, { brand: next.branding && next.branding.palette, brandColors: settings.brandColors, lang, aspect, output });
  const cues = buildCues(outWords, style, output, lang, { maxWordsPerLine: settings.maxWordsPerLine, timing: next.source.timing, outDurationSec: built.outDurationSec });
  const editedKeys = new Set(outWords.filter((w) => w.edited).map((w) => w.key));
  // Hidden cues and per-cue positions are stored per WORD (hiddenCueWords / cueYWords) so they follow the words
  // through re-chunking (style, words-per-line, cut toggles); hidden words always form their own cues.
  // hiddenCues / cueY by cue id are still honoured for plans written before the word-keyed forms.
  const hiddenCues = new Set(cap.overrides.hiddenCues || []);
  const hiddenKeys = new Set(cap.overrides.hiddenCueWords || []);
  const yByWord = cap.overrides.cueYWords || {};
  const cueY = { ...(cap.overrides.cueY || {}) };
  for (const c of cues) {
    c.hidden = hiddenCues.has(c.id) || (c.words.length > 0 && c.words.every((w) => hiddenKeys.has(w.key)));
    c.edited = c.words.some((w) => editedKeys.has(w.key));
    const pinned = c.words.find((w) => Object.prototype.hasOwnProperty.call(yByWord, w.key));
    if (pinned) cueY[c.id] = yByWord[pinned.key];
  }
  const overlays = [
    ...next.graphics.filter((g) => g.enabled && g.resolved && !g.resolved.collapsed)
      .map((g) => ({ outIn: g.resolved.outIn, outOut: g.resolved.outOut, box: REGION_BOXES[g.region] })),
    ...next.broll.filter((b) => b.layout === "PIP" && live(b) && b.resolved && !b.resolved.collapsed)
      .map((b) => ({ outIn: b.resolved.outIn, outOut: b.resolved.outOut, box: pipBox(b, output) })),
  ];
  cap.cues = placeCues(cues, {
    faceTrackOut: faceTrackToOut(ctx.faces, map, mezz, output, aspect, output.background),
    overlays, style, output, splitRanges, fullBrollRanges,
    policy: cap.position.policy, faceAvoid: cap.position.faceAvoid, yOverride: cap.position.yOverride,
    cueY, lang,
  });
  if (next.source.timing === "approx" && outWords.length) {
    const meanConf = outWords.reduce((s, w) => s + w.conf, 0) / outWords.length;
    if (meanConf < 0.5) cap.highlight = "none";
  }

  // 5. sfx follow the element they are anchored to
  const byId = new Map();
  for (const el of [...next.aRoll.segments, ...next.broll, ...next.graphics, ...next.effects, ...cap.cues]) byId.set(el.id, el);
  for (const s of next.sfx) {
    const el = byId.get(s.anchor.elementId);
    if (!el || !el.resolved) { s.resolved = { outAt: 0, collapsed: true }; continue; }
    const edgeAt = s.anchor.edge === "out" ? el.resolved.outOut : el.resolved.outIn;
    s.resolved = { outAt: r6(Math.min(next.timeline.outDurationSec, Math.max(0, edgeAt + s.anchor.offsetSec))), collapsed: !!el.resolved.collapsed };
  }
  return next;
}

module.exports = { resolvePlan, deriveOutWords, faceTrackToOut, REGION_BOXES };
