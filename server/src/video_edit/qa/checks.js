// VIDEO EDIT QA CHECKS — the deterministic half of QUALITY_CHECK (ENGINE.md §7 "Deterministic checks").
//
// WHY THIS EXISTS. Every defect a viewer notices first — a clipped word, a caption on the speaker's mouth,
// a black flash, a silent stretch, a file that is 2 frames short — can be measured without a model, for
// free, on every lap. The vision pass only adds what numbers cannot see. So this module measures the
// render against the plan it came from and turns every deviation into a finding the repair planner can act
// on. It is split in two on purpose:
//   - PLAN/LAYOUT checks are pure (plan revision + transcript words + face track + the renderer's layout
//     file): cut-inside-word, short pieces, caption timing/coverage/fillers/reading speed/lines, safe
//     areas, caption ∩ face, face inside crop, element collisions, B-roll coverage, effect density, assets.
//     They are unit-tested on synthetic plans with no media at all.
//   - MEDIA checks read the delivered mp4: one ffprobe (container, codec, SAR, dims, fps, duration), ONE
//     ffmpeg decode pass running blackdetect + freezedetect + silencedetect together (planned dips, holds,
//     stills, cards and pauses are excluded afterwards, in pure code), loudness / true peak from the audio
//     report mixFinal wrote (re-measured with ebur128 only when the report is missing — RENDER.md §8 says
//     mix()'s own numbers are stale), and the A/V offset from the same report (computeAvOffset fallback).
// Every ffmpeg child goes through engine/proc.js with the caller's abort signal.
//
// CONTRACT:
//   buildContext({ plan, words, faces, layout, timing, language, mezz, projectDir, renderInfo }) -> pc (internal view)
//   runPlanChecks(input) -> { findings, signals:{ brollCoverage, faceCoveredRatio, captionCoverage }, unverified:[checkName] }
//     input = buildContext's argument. Individual checks (each (pc) -> finding[]): checkCutsInsideWords,
//     checkShortPieces, checkCaptions, checkSafeAreas, checkCaptionFace, checkFaceInCrop, checkCollisions,
//     checkBrollCoverage, checkEffectDensity, checkAssets.
//   probeMedia(file, { signal, cwd }) -> { ok, format, video, audio, durationSec }
//   checkContainer(probe, { width, height }) -> finding[]            (pure)
//   checkDuration(actualSec, expectedSec) -> { findings, driftFrames }   (pure)
//   checkLoudness({ hasAudio, integratedLufs, truePeakDbtp }) -> finding[]   (pure)
//   checkAvOffset(avOffset) -> finding[]                            (pure; null → [])
//   scanMedia(file, { signal, hasAudio, durationSec, cwd, pidFile, lowPriority, threads, timeoutMs }) -> scan
//   parseScanLog(stderr, durationSec) -> { black:[{start,end}], freeze:[{start,end}], silence:[{start,end}], decodeErrors }
//   checkScans(scan, pc) -> finding[]                                (pure)
//   runMediaChecks({ file, audioReport, voicePath, pc, signal, cwd, withHeavy, deps }) -> { findings, signals, unverified }
//   LIMITS · SAFE_AREAS
//   Findings follow qa/common.makeFinding. `data` carries what repair.js needs (cut ids and pads, ranges, ids).

const fs = require("node:fs");
const path = require("node:path");
const T = require("../plan/timeline");
const { charCount } = require("../captions/group");
const { isEditError } = require("../errors");
const C = require("./common");

const { makeFinding: F, r3, clamp, isPlain, overlapSec, mergeRanges, FRAME_SEC } = C;

const LIMITS = Object.freeze({
  durationOkFrames: 2, durationMajorSec: 0.5,
  lufsTarget: -14, lufsTolerance: 1.5, lufsFloor: -40, truePeakMax: -1.0,
  silenceNoiseDb: -50, silenceMinSec: 2, silenceSpeechOverlapSec: 0.5,
  blackMinSec: 0.25, blackPixTh: 0.10, blackBlockerSec: 1,
  freezeNoiseDb: -60, freezeMinSec: 1.5, freezeBlockerSec: 2,
  wordMarginSec: 0.03, wordMarginApproxSec: 0.12, repairPadSec: 0.06, repairPadApproxSec: 0.12,
  removedSliverSec: 0.1,   // audible remainder of a word a cut removes
  minKeepSec: 0.6, minKeepJumpSec: 0.35,
  captionLeadSec: 0.25, captionLagSec: 0.10, captionApproxSec: 0.25, captionEndSlackSec: 0.05, minCueSec: 0.5,
  captionCoverage: 0.98, readingCps: 20, readingCpsHiAr: 15, readingCpsJa: 8, maxLines: 2,
  captionFaceFrac: 0.10, faceInCropRatio: 0.95, faceSampleSec: 0.5,
  collisionSec: 0.1, collisionAreaFrac: 0.02,
  brollCoverageMax: 0.6, faceCoveredMax: 0.5, speakerFirstSec: 2,
  densityWindowSec: 10, maxZooms: 3, maxTransitions: 2, maxSfx: 3,
  avOffsetMaxMs: 1000 / 30, avMinCorr: 0.3,
  perCheckFindings: 3,
});

// Fraction of the output frame kept clear of platform UI (ENGINE.md §7).
const { SAFE_AREAS } = require("../render/profiles");   // one table for card placement and this check

const ZOOM_KINDS = new Set(["PUNCH_IN", "PUNCH_OUT", "ZOOM_EMPHASIS"]);
const FILLER_RE = /^(?:u+m+|u+h+m*|e+r+m*|a+h+|h+m+|mm+)$/i;
const TEXT_KINDS = new Set(["caption", "card"]);
const COLLIDING_KINDS = new Set(["caption", "card", "logo", "pip"]);
const num = (v) => { if (v == null || v === "") return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
const fmt = (s) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}.${String(Math.floor((s % 1) * 10))}` : "?");

// Keep at most `max` findings of one sub-check; the last kept one says how many more there were.
function capped(list, max = LIMITS.perCheckFindings) {
  if (list.length <= max) return list;
  const kept = list.slice(0, max);
  const last = kept[max - 1];
  kept[max - 1] = { ...last, detail: `${last.detail} (+${list.length - max} more like this)`.slice(0, 240), data: { ...(last.data || {}), more: list.length - max } };
  return kept;
}

// ---- context --------------------------------------------------------------------------------------
function normBox(b, W, H) {
  if (!isPlain(b)) return null;
  const x = num(b.x), y = num(b.y), w = num(b.w), h = num(b.h);
  if (x == null || y == null || w == null || h == null || w <= 0 || h <= 0 || !(W > 0) || !(H > 0)) return null;
  return { x: x / W, y: y / H, w: w / W, h: h / H };
}

function interArea(a, b) {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return ix * iy;
}

function buildContext({ plan, words = [], faces = null, layout = null, timing = null, language = null, mezz = null, projectDir = null, renderInfo = null } = {}) {
  if (!isPlain(plan) || !isPlain(plan.timeline) || !Array.isArray(plan.timeline.pieces)) throw new Error("qa: plan with timeline.pieces required");
  const pieces = plan.timeline.pieces.slice().sort((a, b) => a.outIn - b.outIn);
  const map = T.buildTimeMap(pieces);
  const W = num(layout && layout.output && layout.output.w) || num(plan.output && plan.output.width) || 0;
  const H = num(layout && layout.output && layout.output.h) || num(plan.output && plan.output.height) || 0;
  const outDur = num(layout && layout.durationFrames) != null ? layout.durationFrames / C.FPS : (num(plan.timeline.outDurationSec) || map.outDurationSec || 0);
  const tmode = timing || (plan.source && plan.source.timing) || "word";
  const lang = String(language || (plan.captions && plan.captions.language) || (plan.source && plan.source.language) || "en").toLowerCase().split("-")[0];
  const ws = Array.isArray(words) ? words : [];
  const elements = (layout && Array.isArray(layout.elements) ? layout.elements : [])
    .filter((e) => isPlain(e) && num(e.outIn) != null && num(e.outOut) != null)
    .map((e) => ({ id: String(e.id || ""), kind: String(e.kind || ""), outIn: Number(e.outIn), outOut: Number(e.outOut), box: normBox(e.box, W, H), px: e.box || null }));
  const crops = (layout && Array.isArray(layout.crops) ? layout.crops : [])
    .filter((c) => isPlain(c) && num(c.outIn) != null && num(c.outOut) != null && num(c.w) > 0 && num(c.h) > 0)
    .sort((a, b) => a.outIn - b.outIn);

  // Ranges where the A-roll is not visible: full-frame B-roll / cards (layout first, plan fallback).
  let fullCover = elements.filter((e) => (e.kind === "broll" || e.kind === "card") && e.box && e.box.w * e.box.h >= 0.9).map((e) => [e.outIn, e.outOut]);
  if (!layout) {
    fullCover = (plan.broll || []).filter((b) => liveBroll(b) && b.layout === "FULL").map((b) => [b.resolved.outIn, b.resolved.outOut]);
  }
  fullCover = mergeRanges(fullCover);

  // Output spans of kept words (speech the viewer should hear and read).
  const speech = [];
  for (const w of ws) {
    if (!isPlain(w) || num(w.start) == null || num(w.end) == null) continue;
    const mid = (w.start + w.end) / 2;
    if (!map.keptAt(mid)) continue;
    speech.push({ w, outStart: map.srcToOutStart(w.start), outEnd: map.srcToOutEnd(w.end) });
  }
  const mezzW = num(mezz && mezz.w) || num(plan.source && plan.source.width) || 0;
  const mezzH = num(mezz && mezz.h) || num(plan.source && plan.source.height) || 0;
  return {
    plan, words: ws, faces: isPlain(faces) ? faces : null, layout: isPlain(layout) ? layout : null, map, pieces, W, H, outDur,
    timing: tmode, approx: tmode === "approx", lang, elements, crops, fullCover, speech, mezzW, mezzH,
    projectDir, renderInfo: isPlain(renderInfo) ? renderInfo : null, aspect: (plan.output && plan.output.aspect) || "9:16",
  };
}

function liveBroll(b) {
  return isPlain(b) && b.status !== "removed" && b.status !== "missing" && isPlain(b.resolved) && !b.resolved.collapsed && b.resolved.outOut > b.resolved.outIn;
}

const covered = (ranges, t) => ranges.some((r) => t >= r[0] - 1e-6 && t < r[1] - 1e-6);
function coveredSec(ranges, a, b) { return ranges.reduce((s, r) => s + overlapSec(a, b, r[0], r[1]), 0); }
function cropAt(pc, t) { return pc.crops.find((c) => t >= c.outIn - 1e-6 && t < c.outOut - 1e-6) || null; }

// Face box in mezzanine px at output time t: the renderer's faceBox wins, else the smoothed face track.
function faceMezzAt(pc, t, crop) {
  if (crop && isPlain(crop.faceBox) && num(crop.faceBox.w) > 0) return { box: { ...crop.faceBox }, assumed: false };
  if (!(pc.mezzW > 0 && pc.mezzH > 0)) return null;
  const tracked = !!(pc.faces && pc.faces.mode === "tracked");
  const f = T.faceAt(pc.faces, pc.map.outToSrc(t));
  if (tracked && (pc.faces.absent || []).some((r) => { const s = pc.map.outToSrc(t); return s >= r.start && s < r.end; })) return null;
  const fh = f.h * pc.mezzH, fw = fh * 0.8;
  return { box: { x: f.cx * pc.mezzW - fw / 2, y: f.cy * pc.mezzH - fh / 2, w: fw, h: fh }, assumed: !tracked };
}

function faceOutAt(pc, t) {
  const crop = cropAt(pc, t);
  if (!crop) return null;
  const fm = faceMezzAt(pc, t, crop);
  if (!fm) return null;
  const sx = 1 / crop.w, sy = 1 / crop.h;
  const b = fm.box;
  return { box: { x: (b.x - crop.x) * sx, y: (b.y - crop.y) * sy, w: b.w * sx, h: b.h * sy }, assumed: fm.assumed };
}

function effectiveCuts(pc) {
  const s = pc.plan.settings || {};
  return (pc.plan.cuts || []).filter((c) => isPlain(c) && T.isEffective(c, s));
}

function nearestCut(cuts, t, field, tol = 0.1) {
  let best = null;
  for (const c of cuts) {
    const d = Math.abs(c[field] - t);
    if (d <= tol && (!best || d < best.d)) best = { c, d };
  }
  return best ? best.c : null;
}

function segmentAt(pc, t) {
  const segs = (pc.plan.aRoll && pc.plan.aRoll.segments) || [];
  return segs.find((s) => s.resolved && t >= s.resolved.outIn - 1e-6 && t < s.resolved.outOut + 1e-6) || null;
}

// ---- plan / layout checks ---------------------------------------------------------------------------
function joints(pc) {
  const mov = pc.pieces.filter((p) => p.kind !== "hold");
  const out = [];
  mov.forEach((p, i) => {
    if (i === 0) out.push({ t: p.srcIn, side: "start", head: true });
    const next = mov[i + 1];
    if (next && next.srcIn - p.srcOut > FRAME_SEC / 2) {
      out.push({ t: p.srcOut, side: "end" });
      out.push({ t: next.srcIn, side: "start" });
    }
    if (!next) out.push({ t: p.srcOut, side: "end", tail: true });
  });
  return out;
}

function checkCutsInsideWords(pc) {
  const m = pc.approx ? LIMITS.wordMarginApproxSec : LIMITS.wordMarginSec;
  const pad = pc.approx ? LIMITS.repairPadApproxSec : LIMITS.repairPadSec;
  const cuts = effectiveCuts(pc);
  const list = [];
  const seen = new Set();
  for (const j of joints(pc)) {
    for (const w of pc.words) {
      if (!isPlain(w) || !(w.start + m < j.t && j.t < w.end - m)) continue;
      const key = `${w.i}|${j.side}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const mid = (w.start + w.end) / 2;
      // A word the cut REMOVES (its midpoint does not play) may keep a sliver at the joint: the timeline keeps
      // ~60 ms before a retake's kept word on purpose (STT gives a stutter and its retake touching timestamps, so the
      // true boundary is unknown and clipping the kept onset is worse). Only a sliver long enough to be heard counts.
      if (!pc.map.keptAt(mid)) {
        const sliver = j.side === "start" ? w.end - j.t : j.t - w.start;
        if (sliver <= LIMITS.removedSliverSec) continue;
      }
      // side 'end': a kept piece ends at t → the cut starts there (edge 'in'); side 'start': the cut ends there.
      const cut = j.head || j.tail ? null : j.side === "end" ? nearestCut(cuts, j.t, "srcIn") : nearestCut(cuts, j.t, "srcOut");
      let data = null;
      if (cut && isPlain(cut.raw)) {
        let srcIn = cut.srcIn, srcOut = cut.srcOut;
        if (j.side === "end") srcIn = mid >= j.t ? w.start - pad : w.end + pad;   // word mostly removed → extend, else keep it whole
        else srcOut = mid < j.t ? w.end + pad : w.start - pad;
        const padStart = r3(srcIn - cut.raw.srcIn), padEnd = r3(cut.raw.srcOut - srcOut);
        const ok = Math.abs(padStart) <= 0.3 && Math.abs(padEnd) <= 0.3 && srcOut - srcIn >= 2 * FRAME_SEC;
        data = { cutId: cut.id, padStart, padEnd, toggle: !ok, wordIndex: Number.isInteger(w.i) ? w.i : null };
      }
      const at = j.side === "end" ? pc.map.srcToOutEnd(j.t) : pc.map.srcToOutStart(j.t);
      list.push(F({
        severity: "blocker", cls: "Q", category: "CLIPPED_WORD", area: "cuts", atSec: at, elementId: cut ? cut.id : null,
        detail: `A cut at ${fmt(at)} falls inside a word (${Math.round(Math.min(j.t - w.start, w.end - j.t) * 1000)} ms from its edge).`,
        fix: "Move the cut edge off the word.", data,
      }));
    }
  }
  return capped(list);
}

function keptRuns(pc) {
  const mov = pc.pieces.filter((p) => p.kind !== "hold");
  const runs = [];
  for (const p of mov) {
    const last = runs[runs.length - 1];
    if (last && p.srcIn - last.srcOut <= FRAME_SEC / 2) { last.srcOut = p.srcOut; last.outOut = Math.max(last.outOut, p.outOut); }
    else runs.push({ srcIn: p.srcIn, srcOut: p.srcOut, outIn: p.outIn, outOut: p.outOut });
  }
  // holds extend the run they sit in
  for (const h of pc.pieces.filter((p) => p.kind === "hold")) {
    const r = runs.find((x) => h.srcIn >= x.srcIn - 1e-6 && h.srcIn <= x.srcOut + 1e-6);
    if (r) { r.outIn = Math.min(r.outIn, h.outIn); r.outOut = Math.max(r.outOut, h.outOut); }
  }
  return runs;
}

function checkShortPieces(pc) {
  const s = pc.plan.settings || {};
  const jumpStyle = !!s.autoJumpCuts || s.silencePace === "fast" || s.silencePace === "extra_fast";
  const thr = jumpStyle ? LIMITS.minKeepJumpSec : LIMITS.minKeepSec;
  const cuts = effectiveCuts(pc);
  const runs = keptRuns(pc);
  const list = [];
  runs.forEach((r, k) => {
    const len = r.outOut - r.outIn;
    if (runs.length < 2 || len >= thr - 1e-6) return;
    const before = k > 0 ? nearestCut(cuts, r.srcIn, "srcOut") : null;
    const after = k + 1 < runs.length ? nearestCut(cuts, r.srcOut, "srcIn") : null;
    const cand = [before, after].filter(Boolean).sort((a, b) => (a.srcOut - a.srcIn) - (b.srcOut - b.srcIn));
    list.push(F({
      severity: "major", category: "AWKWARD_CUT", area: "cuts", atSec: r.outIn, elementId: cand[0] ? cand[0].id : null,
      detail: `A ${Math.round(len * 1000)} ms fragment at ${fmt(r.outIn)} is shorter than ${thr} s.`,
      fix: "Merge the fragment with its neighbour.", data: cand[0] ? { cutId: cand[0].id } : null,
    }));
  });
  return capped(list);
}

function captionsOn(plan) {
  return !!(plan.captions && plan.captions.enabled !== false && (!plan.settings || plan.settings.captionsEnabled !== false));
}
function visibleCues(plan) {
  return ((plan.captions && plan.captions.cues) || [])
    .filter((c) => isPlain(c) && !c.hidden && isPlain(c.resolved) && !c.resolved.collapsed && Array.isArray(c.words) && c.words.length)
    .slice().sort((a, b) => a.resolved.outIn - b.resolved.outIn);
}
function readingCps(lang) {
  if (lang === "ja") return LIMITS.readingCpsJa;
  if (lang === "hi" || lang === "ar") return LIMITS.readingCpsHiAr;
  return LIMITS.readingCps;
}

function checkCaptions(pc) {
  const plan = pc.plan;
  if (!captionsOn(plan)) return { findings: [], coverage: null };
  const cues = visibleCues(plan);
  const timing = [], mismatch = [], unreadable = [];
  const lead = pc.approx ? LIMITS.captionApproxSec : LIMITS.captionLeadSec;
  const lag = pc.approx ? LIMITS.captionApproxSec : LIMITS.captionLagSec;
  const cps = readingCps(pc.lang);
  cues.forEach((c, k) => {
    const a = c.resolved.outIn, b = c.resolved.outOut;
    const w0 = c.words[0], w1 = c.words[c.words.length - 1];
    const next = cues[k + 1];
    const problems = [];
    if (c.timingMode !== "proportional" && num(w0.outStart) != null && num(w1.outEnd) != null) {
      if (w0.outStart - a > lead + 1e-3) problems.push(`appears ${Math.round((w0.outStart - a) * 1000)} ms before its first word`);
      if (a - w0.outStart > lag + 1e-3) problems.push(`appears ${Math.round((a - w0.outStart) * 1000)} ms after its first word`);
      if (b < w1.outEnd - LIMITS.captionEndSlackSec - 1e-3) problems.push("ends before its last word");
    }
    if (next && next.resolved.outIn < b - FRAME_SEC / 2) problems.push("overlaps the next caption");
    const room = next ? next.resolved.outIn - a : Infinity;
    if (b - a < LIMITS.minCueSec - FRAME_SEC / 2 && room >= LIMITS.minCueSec) problems.push(`is on screen only ${Math.round((b - a) * 1000)} ms`);
    if (problems.length) {
      timing.push(F({
        severity: "major", category: "CAPTION_TIMING", area: "captions", atSec: a, elementId: c.id,
        detail: `Caption at ${fmt(a)} ${problems.join("; ")}.`, fix: "Rebuild the caption from word timings.", data: { range: [r3(a), r3(b)] },
      }));
    }
    const dur = Math.max(b - a, Math.min(LIMITS.minCueSec, room));
    const rate = charCount(c.text || c.words.map((w) => w.text).join(" "), pc.lang) / Math.max(dur, 1e-3);
    if (rate > cps + 0.5 && c.words.length > 1) {   // a one-word cue cannot be split any further
      unreadable.push(F({ severity: "minor", category: "CAPTION_UNREADABLE", area: "captions", atSec: a, elementId: c.id,
        detail: `Caption at ${fmt(a)} needs ${Math.round(rate)} characters/s (limit ${cps}).`, fix: "Show fewer words per caption.", data: { reason: "reading_speed" } }));
    }
    if (Array.isArray(c.lines) && c.lines.length > LIMITS.maxLines) {
      unreadable.push(F({ severity: "minor", category: "CAPTION_UNREADABLE", area: "captions", atSec: a, elementId: c.id,
        detail: `Caption at ${fmt(a)} has ${c.lines.length} lines (limit ${LIMITS.maxLines}).`, fix: "Show fewer words per line.", data: { reason: "lines" } }));
    }
  });

  // Coverage of kept non-filler words, and removed fillers never shown.
  const ov = (plan.captions && plan.captions.overrides) || {};
  const userHidden = new Set(Array.isArray(ov.hiddenWords) ? ov.hiddenWords : []);
  for (const c of (plan.captions.cues || [])) if (c && c.hidden) for (const w of c.words || []) if (Number.isInteger(w.i)) userHidden.add(w.i);
  const shown = new Map();
  for (const c of cues) for (const w of c.words) if (Number.isInteger(w.i)) shown.set(w.i, c);
  const needed = pc.speech.filter(({ w }) => Number.isInteger(w.i) && !userHidden.has(w.i) && !(w.isFiller === true || (w.isFiller == null && FILLER_RE.test(String(w.text || "").replace(/[^\p{L}]/gu, "")))));
  const missing = needed.filter(({ w }) => !shown.has(w.i));
  const coverage = needed.length ? (needed.length - missing.length) / needed.length : 1;
  if (needed.length && coverage < LIMITS.captionCoverage) {
    const ranges = mergeRanges(missing.map((m) => [m.outStart, m.outEnd]), 1.0).slice(0, 8).map((r) => [r3(Math.max(0, r[0] - 0.2)), r3(r[1] + 0.2)]);
    mismatch.push(F({ severity: "major", category: "CAPTION_MISMATCH", area: "captions", atSec: missing[0].outStart,
      detail: `Captions show ${Math.round(coverage * 1000) / 10} % of the kept spoken words (need ${LIMITS.captionCoverage * 100} %).`,
      fix: "Rebuild the captions from word timings.", data: { ranges, reason: "coverage" } }));
  }
  const shownRemoved = [];
  for (const c of cues) {
    for (const w of c.words) {
      const src = Number.isInteger(w.i) ? pc.words[w.i] : null;
      const s = src ? src.start : num(w.srcStart), e = src ? src.end : num(w.srcEnd);
      if (s == null || e == null || pc.map.keptAt((s + e) / 2)) continue;
      shownRemoved.push({ c, w });
    }
  }
  if (shownRemoved.length) {
    const c = shownRemoved[0].c;
    mismatch.push(F({ severity: "major", category: "CAPTION_MISMATCH", area: "captions", atSec: c.resolved.outIn, elementId: c.id,
      detail: `${shownRemoved.length} word${shownRemoved.length === 1 ? "" : "s"} removed from the audio still appear in captions.`,
      fix: "Rebuild the captions from word timings.", data: { ranges: mergeRanges(shownRemoved.map((x) => [x.c.resolved.outIn, x.c.resolved.outOut])).slice(0, 8), reason: "removed_words" } }));
  }
  return { findings: [...capped(timing), ...mismatch, ...capped(unreadable)], coverage: needed.length ? Math.round(coverage * 10000) / 10000 : null };
}

function checkSafeAreas(pc) {
  const safe = SAFE_AREAS[pc.aspect] || SAFE_AREAS["16:9"];
  const eps = 0.005;
  const list = [];
  for (const e of pc.elements) {
    if (!e.box || e.kind === "broll" || e.kind === "dip") continue;
    const b = e.box;
    let bad = null;
    if (b.x < -eps || b.y < -eps || b.x + b.w > 1 + eps || b.y + b.h > 1 + eps) bad = "extends past the frame";
    else if (TEXT_KINDS.has(e.kind)) {
      if (b.y < safe.top - eps) bad = `enters the top ${Math.round(safe.top * 100)} % platform area`;
      else if (b.y + b.h > 1 - safe.bottom + eps) bad = `enters the bottom ${Math.round(safe.bottom * 100)} % platform area`;
      else if (b.x < safe.side - eps || b.x + b.w > 1 - safe.side + eps) bad = `enters the ${Math.round(safe.side * 100)} % side margin`;
    }
    if (!bad) continue;
    list.push(F({ severity: "major", category: "TEXT_OFFSCREEN", area: e.kind === "caption" ? "captions" : e.kind, atSec: e.outIn, elementId: e.id,
      detail: `The ${e.kind} at ${fmt(e.outIn)} ${bad}.`, fix: e.kind === "caption" ? "Move the caption into the safe band." : "Move it inside the safe area.",
      data: { kind: e.kind, box: e.box } }));
  }
  return capped(list, 4);
}

function checkCaptionFace(pc) {
  if (!captionsOn(pc.plan) || !pc.crops.length) return [];
  const list = [];
  for (const e of pc.elements) {
    if (e.kind !== "caption" || !e.box) continue;
    let worst = 0, worstT = null, assumed = false;
    for (const t of [e.outIn + 0.05, (e.outIn + e.outOut) / 2, e.outOut - 0.05]) {
      if (t < e.outIn || t >= e.outOut || covered(pc.fullCover, t)) continue;
      const f = faceOutAt(pc, t);
      if (!f) continue;
      const frac = interArea(e.box, f.box) / (e.box.w * e.box.h);
      if (frac > worst) { worst = frac; worstT = t; assumed = f.assumed; }
    }
    if (worst > LIMITS.captionFaceFrac) {
      const f = faceOutAt(pc, worstT);
      list.push(F({ severity: assumed ? "minor" : "major", category: "CAPTION_COVERS_FACE", area: "captions", atSec: worstT, elementId: e.id,
        detail: `The caption at ${fmt(worstT)} covers ${Math.round(worst * 100)} % of its box with the speaker's face${assumed ? " (face position assumed)" : ""}.`,
        fix: "Move the caption away from the face.", data: { faceCy: f ? r3(f.box.y + f.box.h / 2) : null, captionY: r3(e.box.y) } }));
    }
  }
  return capped(list);
}

function checkFaceInCrop(pc) {
  if (!pc.crops.length) return [];
  const tracked = pc.faces && pc.faces.mode === "tracked";
  if (!tracked && !pc.crops.some((c) => isPlain(c.faceBox))) return [];
  let samples = 0, inside = 0, firstBad = null;
  for (let t = 0.1; t < pc.outDur; t += LIMITS.faceSampleSec) {
    if (covered(pc.fullCover, t)) continue;
    const crop = cropAt(pc, t);
    if (!crop) continue;
    const fm = faceMezzAt(pc, t, crop);
    if (!fm || fm.assumed) continue;
    samples++;
    const b = fm.box, tolX = 0.02 * crop.w, tolY = 0.02 * crop.h;
    const ok = b.x >= crop.x - tolX && b.y >= crop.y - tolY && b.x + b.w <= crop.x + crop.w + tolX && b.y + b.h <= crop.y + crop.h + tolY;
    if (ok) inside++;
    else if (firstBad == null) firstBad = t;
  }
  if (!samples || inside / samples >= LIMITS.faceInCropRatio) return [];
  const seg = segmentAt(pc, firstBad);
  return [F({ severity: "major", category: "SPEAKER_CROPPED", area: "framing", atSec: firstBad, elementId: seg ? seg.id : null,
    detail: `The speaker's face is inside the crop in only ${Math.round((inside / samples) * 100)} % of sampled frames (need ${LIMITS.faceInCropRatio * 100} %).`,
    fix: "Re-frame from the face track.", data: { ratio: r3(inside / samples), segmentId: seg ? seg.id : null } })];
}

function checkCollisions(pc) {
  const els = pc.elements.filter((e) => e.box && COLLIDING_KINDS.has(e.kind));
  const list = [];
  for (let i = 0; i < els.length; i++) {
    for (let j = i + 1; j < els.length; j++) {
      const a = els[i], b = els[j];
      if (a.kind === "caption" && b.kind === "caption") continue;
      const dt = overlapSec(a.outIn, a.outOut, b.outIn, b.outOut);
      if (dt <= LIMITS.collisionSec) continue;
      const area = interArea(a.box, b.box);
      if (area <= LIMITS.collisionAreaFrac * Math.min(a.box.w * a.box.h, b.box.w * b.box.h)) continue;
      // The element to move: a caption yields to nothing; the logo moves before a PIP, a PIP before a card.
      const order = { logo: 0, pip: 1, caption: 2, card: 3 };
      const [mover, other] = order[a.kind] <= order[b.kind] ? [a, b] : [b, a];
      const at = Math.max(a.outIn, b.outIn);
      list.push(F({ severity: "major", category: "OVERLAY_COLLISION", area: mover.kind, atSec: at, elementId: mover.id,
        detail: `The ${mover.kind} and the ${other.kind} overlap on screen for ${Math.round(dt * 10) / 10} s from ${fmt(at)}.`,
        fix: `Move the ${mover.kind}.`, data: { kind: mover.kind, otherId: other.id, otherKind: other.kind, box: mover.box, otherBox: other.box } }));
    }
  }
  return capped(list, 4);
}

function brollScore(b) { return num(b && b.chosen && b.chosen.scores && b.chosen.scores.total) || 0; }

function checkBrollCoverage(pc) {
  const live = (pc.plan.broll || []).filter(liveBroll);
  const covering = live.filter((b) => b.layout === "FULL" || b.layout === "SPLIT");
  const full = live.filter((b) => b.layout === "FULL");
  const findings = [];
  const D = pc.outDur || 0;
  const covRanges = mergeRanges(covering.map((b) => [b.resolved.outIn, b.resolved.outOut]));
  const coverage = D > 0 ? covRanges.reduce((s, r) => s + (r[1] - r[0]), 0) / D : 0;
  const eligible = (b) => !b.locked && b.origin !== "user" && !b.userModified;
  if (coverage > LIMITS.brollCoverageMax + 1e-6) {
    const victim = covering.filter(eligible).sort((a, b) => brollScore(a) - brollScore(b))[0] || null;
    findings.push(F({ severity: "major", category: "COVERAGE", area: "broll", atSec: victim ? victim.resolved.outIn : 0, elementId: victim ? victim.id : null,
      detail: `B-roll covers ${Math.round(coverage * 100)} % of the video (limit ${LIMITS.brollCoverageMax * 100} %).`,
      fix: "Remove the weakest B-roll.", data: { reason: "coverage", action: "remove" } }));
  }
  const speechRanges = mergeRanges(pc.speech.map((s) => [s.outStart, s.outEnd]), 0.3);
  const speechSec = speechRanges.reduce((s, r) => s + (r[1] - r[0]), 0);
  const fullRanges = mergeRanges(full.map((b) => [b.resolved.outIn, b.resolved.outOut]));
  const coveredSpeech = speechRanges.reduce((s, r) => s + coveredSec(fullRanges, r[0], r[1]), 0);
  const faceCovered = speechSec > 0 ? coveredSpeech / speechSec : 0;
  if (faceCovered > LIMITS.faceCoveredMax + 1e-6) {
    const victim = full.filter(eligible).sort((a, b) => (b.resolved.outOut - b.resolved.outIn) - (a.resolved.outOut - a.resolved.outIn))[0] || null;
    findings.push(F({ severity: "major", category: "COVERAGE", area: "broll", atSec: victim ? victim.resolved.outIn : 0, elementId: victim ? victim.id : null,
      detail: `Full-screen B-roll hides the speaker for ${Math.round(faceCovered * 100)} % of the speech (limit ${LIMITS.faceCoveredMax * 100} %).`,
      fix: "Turn the longest cutaway into picture-in-picture.", data: { reason: "face_covered", action: "pip" } }));
  }
  const early = full.find((b) => b.resolved.outIn < LIMITS.speakerFirstSec - 1e-6);
  if (early) {
    findings.push(F({ severity: "major", category: "COVERAGE", area: "broll", atSec: early.resolved.outIn, elementId: early.id,
      detail: `A full-screen B-roll starts at ${fmt(early.resolved.outIn)}, before the speaker has been on screen for ${LIMITS.speakerFirstSec} s.`,
      fix: "Show the speaker first: make this B-roll picture-in-picture.", data: { reason: "speaker_first", action: "pip" } }));
  }
  return { findings, brollCoverage: r3(coverage), faceCoveredRatio: speechSec > 0 ? r3(faceCovered) : null };
}

function checkEffectDensity(pc) {
  const plan = pc.plan;
  const s = plan.settings || {};
  const segs = (plan.aRoll && plan.aRoll.segments) || [];
  const eligible = (x) => x.origin !== "user" && !x.locked && !x.userModified;
  const groups = [
    { kind: "zoom", cap: LIMITS.maxZooms, items: (plan.effects || []).filter((e) => e && e.enabled !== false && ZOOM_KINDS.has(e.kind) && e.resolved && !e.resolved.collapsed)
      .map((e) => ({ id: e.id, t: e.resolved.outIn, el: e, op: "effect" })) },
    { kind: "transition", cap: LIMITS.maxTransitions, items: (plan.transitions || []).filter((x) => x && x.enabled !== false && x.kind !== "CUT").map((x) => {
      let t = x.at && Number.isFinite(x.at.outAt) ? x.at.outAt : null;
      const seg = x.at && x.at.elementId ? segs.find((sg) => sg.id === x.at.elementId) : null;
      if (seg && seg.resolved) t = seg.resolved.outOut;
      return { id: x.id, t, el: x, op: "transition" };
    }).filter((x) => Number.isFinite(x.t)) },
    { kind: "sfx", cap: LIMITS.maxSfx, items: s.sfxEnabled === false ? [] : (plan.sfx || []).filter((x) => x && x.enabled !== false && x.resolved && !x.resolved.collapsed && Number.isFinite(x.resolved.outAt))
      .map((x) => ({ id: x.id, t: x.resolved.outAt, el: x, op: "sfx" })) },
  ];
  const list = [];
  for (const g of groups) {
    const items = g.items.slice().sort((a, b) => a.t - b.t);
    const kept = [];
    const excess = [];
    for (const it of items) {
      const inWin = kept.filter((k) => it.t - k.t < LIMITS.densityWindowSec).length;
      if (inWin >= g.cap && eligible(it.el)) excess.push(it);
      else kept.push(it);
    }
    const over = excess.length || items.some((it, k) => items.filter((o, m) => m >= k && o.t - it.t < LIMITS.densityWindowSec).length > g.cap);
    if (!over) continue;
    const at = excess.length ? excess[0].t : items[0].t;
    list.push(F({ severity: "minor", category: "EFFECT_DENSITY", area: "effects", atSec: at, elementId: excess.length ? excess[0].id : null,
      detail: `More than ${g.cap} ${g.kind === "zoom" ? "zooms" : g.kind === "sfx" ? "sound effects" : "transitions"} in 10 s around ${fmt(at)}.`,
      fix: "Disable the lowest-priority ones.", data: { kind: g.kind, disable: excess.map((x) => ({ id: x.id, op: x.op })) } }));
  }
  return list;
}

function fileMissing(pc, rel) {
  if (!pc.projectDir || typeof rel !== "string" || !rel) return false;
  try {
    const abs = path.isAbsolute(rel) ? rel : path.resolve(pc.projectDir, rel);
    return !fs.existsSync(abs);
  } catch { return false; }
}

function checkAssets(pc) {
  const list = [];
  for (const b of pc.plan.broll || []) {
    if (!isPlain(b) || b.status === "removed" || !isPlain(b.resolved) || b.resolved.collapsed) continue;
    const broken = b.status === "missing" || (b.status === "ok" && (!b.chosen || fileMissing(pc, b.chosen.path)));
    if (!broken) continue;
    list.push(F({ severity: "blocker", category: "ASSET_BROKEN", area: "broll", atSec: b.resolved.outIn, elementId: b.id,
      detail: `B-roll #${b.ordinal} at ${fmt(b.resolved.outIn)} has no usable media.`, fix: "Replace it with the next candidate or remove it.", data: { kind: "broll" } }));
  }
  for (const g of pc.plan.graphics || []) {
    if (!isPlain(g) || g.enabled === false || !isPlain(g.resolved) || g.resolved.collapsed) continue;
    const r = g.render || {};
    const broken = r.status === "failed" || (r.status === "ok" && g.renderer === "hyperframes" && fileMissing(pc, r.path));
    if (!broken) continue;
    list.push(F({ severity: "blocker", category: "CARD_RENDER_BROKEN", area: "cards", atSec: g.resolved.outIn, elementId: g.id,
      detail: `The ${String(g.kind).toLowerCase().replace(/_/g, " ")} card at ${fmt(g.resolved.outIn)} did not render.`, fix: "Use the caption-style fallback or remove the card.", data: { kind: "card" } }));
  }
  const ri = pc.renderInfo;
  if (ri) {
    for (const m of Array.isArray(ri.missingAssets) ? ri.missingAssets : []) {
      if (!isPlain(m) || !m.elementId || list.some((f) => f.elementId === m.elementId)) continue;
      const kind = String(m.kind || "asset");
      list.push(F({ severity: "blocker", category: kind === "card" ? "CARD_RENDER_BROKEN" : "ASSET_BROKEN", area: kind, atSec: num(m.outIn), elementId: m.elementId,
        detail: `A ${kind} could not be rendered.`, fix: kind === "card" ? "Use the fallback card or remove it." : "Replace or remove it.", data: { kind } }));
    }
    for (const ch of Array.isArray(ri.missingChunks) ? ri.missingChunks : []) {
      if (!isPlain(ch)) continue;
      list.push(F({ severity: "blocker", cls: "I", category: "BLACK_OR_BLANK_FRAME", area: "render", atSec: num(ch.outIn),
        detail: `A section of the video at ${fmt(num(ch.outIn))} is missing from the render.`, fix: "Re-encode the missing chunk.",
        data: { ranges: [[num(ch.outIn) || 0, num(ch.outOut) || pc.outDur]], reason: "missing_chunk" } }));
    }
    if (ri.overlaysDropped) {
      list.push(F({ severity: "blocker", category: "ASSET_BROKEN", area: "render", atSec: 0,
        detail: "B-roll, cards and the logo were dropped to finish the render.", fix: "Re-render the overlays.", data: { kind: "overlays", reason: "overlays_dropped" } }));
    }
  }
  return list;
}

function runPlanChecks(input) {
  const pc = input && input.map && input.plan ? input : buildContext(input);
  const findings = [];
  const unverified = [];
  const run = (name, fn) => {
    try { const r = fn(pc); return r; }
    catch (e) { if (isEditError(e) && e.errorClass === "cancelled") throw e; unverified.push(name); return null; }
  };
  const push = (r) => { if (Array.isArray(r)) findings.push(...r); };
  push(run("cutsInsideWords", checkCutsInsideWords));
  push(run("shortPieces", checkShortPieces));
  const cap = run("captions", checkCaptions);
  if (cap) findings.push(...cap.findings);
  if (pc.layout) {
    push(run("safeAreas", checkSafeAreas));
    push(run("captionFace", checkCaptionFace));
    push(run("faceInCrop", checkFaceInCrop));
    push(run("collisions", checkCollisions));
  } else unverified.push("layout");
  const cov = run("brollCoverage", checkBrollCoverage);
  if (cov) findings.push(...cov.findings);
  push(run("effectDensity", checkEffectDensity));
  push(run("assets", checkAssets));
  return {
    findings,
    signals: { brollCoverage: cov ? cov.brollCoverage : null, faceCoveredRatio: cov ? cov.faceCoveredRatio : null, captionCoverage: cap ? cap.coverage : null },
    unverified,
  };
}

// ---- media checks -----------------------------------------------------------------------------------
function inputArgs(file) {
  return ["-protocol_whitelist", "file", "-i", `file:${String(file).split(path.sep).join("/")}`];
}

function ratio(s) {
  const m = /^(\d+)[/:](\d+)$/.exec(String(s || ""));
  if (!m) return null;
  const a = Number(m[1]), b = Number(m[2]);
  return b > 0 ? a / b : null;
}

async function probeMedia(file, { signal, cwd, deps = {} } = {}) {
  const proc = deps.proc || require("../engine/proc");
  try {
    const j = await proc.ffprobeJson(["-protocol_whitelist", "file", "-show_streams", "-show_format", "-of", "json", `file:${String(file).split(path.sep).join("/")}`],
      { signal, cwd, timeoutMs: 30000, label: "qa-probe" });
    const streams = Array.isArray(j.streams) ? j.streams : [];
    const video = streams.find((s) => s.codec_type === "video") || null;
    const audio = streams.find((s) => s.codec_type === "audio") || null;
    const durationSec = num(video && video.duration) || num(j.format && j.format.duration);
    return { ok: true, format: j.format || null, video, audio, durationSec };
  } catch (e) {
    if (isEditError(e) && e.errorClass === "cancelled") throw e;
    if (signal && signal.aborted) throw e;
    return { ok: false, format: null, video: null, audio: null, durationSec: null, error: isEditError(e) ? e.code : "PROBE_FAILED" };
  }
}

function checkContainer(probe, { width, height } = {}) {
  const I = (detail, fix) => F({ severity: "blocker", cls: "I", category: "OTHER", area: "container", atSec: 0, detail, fix, data: { reason: "container" } });
  if (!probe || !probe.ok || !probe.video) return [I("The exported file cannot be read as a video.", "Re-render the export.")];
  const v = probe.video;
  const out = [];
  const fmtName = String((probe.format && probe.format.format_name) || "");
  if (fmtName && !/mp4|mov/.test(fmtName)) out.push(I(`The container is ${fmtName.slice(0, 20)}, not MP4.`, "Re-mux as MP4."));
  if (v.codec_name !== "h264") out.push(I(`The video codec is ${String(v.codec_name).slice(0, 16)}, not H.264.`, "Re-encode as H.264."));
  if (v.pix_fmt !== "yuv420p") out.push(I(`The pixel format is ${String(v.pix_fmt).slice(0, 16)}, not yuv420p.`, "Re-encode as yuv420p."));
  const sar = String(v.sample_aspect_ratio || "1:1");
  if (!(sar === "1:1" || sar === "0:1" || sar === "N/A")) out.push(I(`The sample aspect ratio is ${sar.slice(0, 12)}, not 1:1.`, "Re-encode with square pixels."));
  if (width && height && (Number(v.width) !== Number(width) || Number(v.height) !== Number(height))) {
    out.push(I(`The video is ${v.width}x${v.height}, expected ${width}x${height}.`, "Re-render at the output size."));
  }
  const fps = ratio(v.avg_frame_rate) || ratio(v.r_frame_rate);
  if (!(fps && Math.abs(fps - C.FPS) < 0.01)) out.push(I(`The frame rate is ${fps ? Math.round(fps * 100) / 100 : "unknown"} fps, expected ${C.FPS}.`, "Re-encode at 30 fps."));
  return out;
}

function checkDuration(actualSec, expectedSec) {
  if (!Number.isFinite(actualSec) || !Number.isFinite(expectedSec) || expectedSec <= 0) return { findings: [], driftFrames: null };
  const drift = actualSec - expectedSec;
  const driftFrames = Math.round(drift * C.FPS);
  if (Math.abs(driftFrames) <= LIMITS.durationOkFrames) return { findings: [], driftFrames };
  const blocker = Math.abs(drift) > LIMITS.durationMajorSec + 1e-6;
  return {
    driftFrames,
    findings: [F({ severity: blocker ? "blocker" : "major", cls: blocker ? "I" : "Q", category: "DURATION_MISMATCH", area: "container", atSec: Math.min(actualSec, expectedSec),
      detail: `The export is ${Math.abs(driftFrames)} frame${Math.abs(driftFrames) === 1 ? "" : "s"} ${drift > 0 ? "longer" : "shorter"} than the edit.`,
      fix: blocker ? "Re-encode the export." : "Trim the export to the edit length.", data: { driftFrames, expectedSec: r3(expectedSec), actualSec: r3(actualSec) } })],
  };
}

function checkLoudness({ hasAudio = true, integratedLufs = null, truePeakDbtp = null } = {}) {
  if (!hasAudio) {
    return [F({ severity: "blocker", cls: "I", category: "LOUDNESS", area: "audio", atSec: 0, detail: "The export has no audio track.", fix: "Re-run the audio mix.", data: { reason: "no_audio" } })];
  }
  const I = num(integratedLufs);
  if (I == null || I <= LIMITS.lufsFloor) {
    return [F({ severity: "blocker", cls: "I", category: "LOUDNESS", area: "audio", atSec: 0,
      detail: `The export is ${I == null ? "silent" : `almost silent (${Math.round(I * 10) / 10} LUFS)`}.`, fix: "Re-run the audio mix.", data: { reason: "silent", integratedLufs: I } })];
  }
  const out = [];
  if (Math.abs(I - LIMITS.lufsTarget) > LIMITS.lufsTolerance + 1e-6) {
    out.push(F({ severity: "major", category: "LOUDNESS", area: "audio", atSec: 0,
      detail: `Loudness is ${Math.round(I * 10) / 10} LUFS (target ${LIMITS.lufsTarget} ± ${LIMITS.lufsTolerance}).`, fix: "Re-run post-processing with adjusted gain.",
      data: { reason: "integrated", integratedLufs: I, gainDb: r3(LIMITS.lufsTarget - I) } }));
  }
  const tp = num(truePeakDbtp);
  if (tp != null && tp > LIMITS.truePeakMax + 1e-6) {
    out.push(F({ severity: "major", category: "LOUDNESS", area: "audio", atSec: 0,
      detail: `True peak is ${Math.round(tp * 10) / 10} dBTP (limit ${LIMITS.truePeakMax}).`, fix: "Re-run post-processing with more limiting.",
      data: { reason: "true_peak", truePeakDbtp: tp } }));
  }
  return out;
}

function checkAvOffset(av) {
  if (!isPlain(av) || !Number.isFinite(Number(av.ms))) return [];
  const corr = num(av.envelopeCorr);
  if (corr != null && corr < LIMITS.avMinCorr) return [];
  const ms = Number(av.ms);
  if (Math.abs(ms) <= LIMITS.avOffsetMaxMs + 1e-6) return [];
  return [F({ severity: "major", category: "AV_OFFSET", area: "audio", atSec: 0,
    detail: `The voice is ${Math.abs(Math.round(ms))} ms ${ms > 0 ? "late" : "early"} against the picture (limit one frame).`, fix: "Rebuild the voice stem and re-mix.", data: { ms } })];
}

function parseScanLog(stderr, durationSec) {
  const text = String(stderr || "");
  const D = Number.isFinite(durationSec) ? durationSec : null;
  const black = [];
  for (const m of text.matchAll(/black_start:\s*(-?[\d.]+)\s+black_end:\s*(-?[\d.]+)/g)) black.push({ start: Number(m[1]), end: Number(m[2]) });
  const pair = (startRe, endRe) => {
    const events = [];
    for (const m of text.matchAll(startRe)) events.push({ at: m.index, kind: "s", t: Number(m[1]) });
    for (const m of text.matchAll(endRe)) events.push({ at: m.index, kind: "e", t: Number(m[1]) });
    events.sort((a, b) => a.at - b.at);
    const out = [];
    let open = null;
    for (const ev of events) {
      if (ev.kind === "s") open = ev.t;
      else if (open != null) { out.push({ start: Math.max(0, open), end: ev.t }); open = null; }
    }
    if (open != null) out.push({ start: Math.max(0, open), end: D != null ? D : open });
    return out;
  };
  const freeze = pair(/freeze_start:\s*(-?[\d.]+)/g, /freeze_end:\s*(-?[\d.]+)/g);
  const silence = pair(/silence_start:\s*(-?[\d.]+)/g, /silence_end:\s*(-?[\d.]+)/g);
  const decodeErrors = (text.match(/error while decoding|corrupt(?:ed)? (?:input|packet|frame)|invalid nal unit|missing picture in access unit/gi) || []).length;
  return { black: black.filter((r) => r.end > r.start), freeze: freeze.filter((r) => r.end > r.start), silence: silence.filter((r) => r.end > r.start), decodeErrors };
}

async function scanMedia(file, { signal, hasAudio = true, durationSec = null, cwd, pidFile, lowPriority = false, threads = null, timeoutMs, deps = {} } = {}) {
  const proc = deps.proc || require("../engine/proc");
  const v = `[0:v:0]scale=480:-2,blackdetect=d=${LIMITS.blackMinSec}:pix_th=${LIMITS.blackPixTh.toFixed(2)},freezedetect=n=${LIMITS.freezeNoiseDb}dB:d=${LIMITS.freezeMinSec}[vo]`;
  const a = hasAudio ? `;[0:a:0]silencedetect=n=${LIMITS.silenceNoiseDb}dB:d=${LIMITS.silenceMinSec}[ao]` : "";
  const args = ["-loglevel", "info", "-nostats", ...inputArgs(file), "-filter_complex", v + a, "-map", "[vo]"];
  if (hasAudio) args.push("-map", "[ao]");
  if (threads) args.push("-threads", String(threads));
  args.push("-f", "null", "-");
  const D = Number.isFinite(durationSec) ? durationSec : 60;
  const r = await proc.ffmpeg(args, { signal, cwd, pidFile, lowPriority, timeoutMs: timeoutMs || Math.max(60000, Math.round(D * 4000)), label: "qa-scan", stage: "QUALITY_CHECK" });
  return parseScanLog(r.stderr, durationSec);
}

// Parts of [a,b] not covered by `ranges` → longest uncovered piece length and its start.
function uncoveredLongest(a, b, ranges) {
  let best = { len: 0, at: a }, cur = a;
  for (const r of mergeRanges(ranges)) {
    if (r[1] <= cur || r[0] >= b) continue;
    if (r[0] > cur && r[0] - cur > best.len) best = { len: r[0] - cur, at: cur };
    cur = Math.max(cur, r[1]);
  }
  if (b > cur && b - cur > best.len) best = { len: b - cur, at: cur };
  return best;
}

function checkScans(scan, pc) {
  if (!scan) return [];
  const out = [];
  if (scan.decodeErrors > 0) {
    out.push(F({ severity: "blocker", cls: "I", category: "OTHER", area: "container", atSec: 0,
      detail: `The export has ${scan.decodeErrors} decode error${scan.decodeErrors === 1 ? "" : "s"}.`, fix: "Re-render the export.", data: { reason: "decode" } }));
  }
  const plan = pc ? pc.plan : null;
  // planned darkness: dip transitions and layout 'dip' elements (fades), ±0.1 s
  const dips = [];
  if (pc) {
    for (const e of pc.elements) if (e.kind === "dip") dips.push([e.outIn - 0.1, e.outOut + 0.1]);
    const segs = (plan.aRoll && plan.aRoll.segments) || [];
    for (const x of plan.transitions || []) {
      if (!x || x.enabled === false || !/^DIP_/.test(String(x.kind))) continue;
      let t = x.at && Number.isFinite(x.at.outAt) ? x.at.outAt : null;
      const seg = x.at && x.at.elementId ? segs.find((s) => s.id === x.at.elementId) : null;
      if (seg && seg.resolved) t = seg.resolved.outOut;
      if (Number.isFinite(t)) dips.push([t - (x.durationSec || 0.2) - 0.1, t + (x.durationSec || 0.2) + 0.1]);
    }
  }
  const blacks = [];
  for (const r of scan.black) {
    const u = uncoveredLongest(r.start, r.end, dips);
    if (u.len < LIMITS.blackMinSec - 1e-6) continue;
    const blocker = u.len > LIMITS.blackBlockerSec;
    blacks.push(F({ severity: blocker ? "blocker" : "major", cls: blocker ? "I" : "Q", category: "BLACK_OR_BLANK_FRAME", area: "video", atSec: u.at,
      detail: `${Math.round(u.len * 100) / 100} s of black frames at ${fmt(u.at)}.`, fix: "Re-encode the affected section.",
      data: { ranges: [[r3(u.at), r3(u.at + u.len)]] } }));
  }
  out.push(...capped(blacks));
  // planned stillness: holds (FREEZE effects), full-screen B-roll / cards / stills
  const still = [];
  if (pc) {
    for (const p of pc.pieces) if (p.kind === "hold") still.push([p.outIn - 0.05, p.outOut + 0.05]);
    still.push(...pc.fullCover);
    for (const e of pc.elements) if (e.kind === "card") still.push([e.outIn, e.outOut]);
    for (const b of plan.broll || []) if (liveBroll(b) && b.chosen && b.chosen.type === "image") still.push([b.resolved.outIn, b.resolved.outOut]);
  }
  const freezes = [];
  for (const r of scan.freeze) {
    const u = uncoveredLongest(r.start, r.end, still);
    if (u.len <= LIMITS.freezeBlockerSec) continue;
    freezes.push(F({ severity: "blocker", cls: "I", category: "FREEZE", area: "video", atSec: u.at,
      detail: `The picture freezes for ${Math.round(u.len * 10) / 10} s at ${fmt(u.at)}.`, fix: "Re-encode the affected section.",
      data: { ranges: [[r3(u.at), r3(u.at + u.len)]] } }));
  }
  out.push(...capped(freezes));
  // unplanned silence: silence where the plan expects speech
  if (pc && pc.speech.length) {
    const speech = mergeRanges(pc.speech.map((s) => [s.outStart, s.outEnd]));
    const sil = [];
    for (const r of scan.silence) {
      const inSpeech = coveredSec(speech, r.start, r.end);
      if (inSpeech < LIMITS.silenceSpeechOverlapSec) continue;
      sil.push(F({ severity: "major", category: "SILENCE", area: "audio", atSec: r.start,
        detail: `${Math.round((r.end - r.start) * 10) / 10} s of silence at ${fmt(r.start)} where the edit has speech.`, fix: "Re-run post-processing.",
        data: { ranges: [[r3(r.start), r3(r.end)]] } }));
    }
    out.push(...capped(sil));
  }
  return out;
}

async function runMediaChecks({ file, audioReport = null, voicePath = null, pc, signal, cwd, withHeavy = (fn) => fn({}), pidFile, deps = {} } = {}) {
  const findings = [];
  const unverified = [];
  const signals = { loudness: null, durationDriftFrames: null, avOffsetMs: null };
  const probe = await probeMedia(file, { signal, cwd, deps });
  findings.push(...checkContainer(probe, { width: pc && pc.W, height: pc && pc.H }));
  if (!probe.ok) return { findings, signals, unverified: ["media"] };

  const expected = pc ? pc.outDur : null;
  const dur = checkDuration(probe.durationSec, expected);
  findings.push(...dur.findings);
  signals.durationDriftFrames = dur.driftFrames;

  const hasAudio = !!probe.audio;
  try {
    const scan = await withHeavy((slot) => scanMedia(file, {
      signal, hasAudio, durationSec: probe.durationSec, cwd, pidFile, lowPriority: !!(slot && slot.lowPriority), threads: slot && slot.threads, deps,
    }));
    findings.push(...checkScans(scan, pc));
  } catch (e) {
    if ((signal && signal.aborted) || (isEditError(e) && e.errorClass === "cancelled")) throw e;
    unverified.push("scan");
    if (isEditError(e) && e.code === "PROC_EXIT") {
      findings.push(F({ severity: "blocker", cls: "I", category: "OTHER", area: "container", atSec: 0, detail: "The export could not be decoded end to end.", fix: "Re-render the export.", data: { reason: "decode" } }));
    }
  }

  // Loudness: the audio report's re-measured numbers; ebur128 fallback when it is missing.
  let loud = null;
  if (hasAudio && isPlain(audioReport) && Number.isFinite(Number(audioReport.integratedLufs))) {
    loud = { integratedLufs: Number(audioReport.integratedLufs), truePeakDbtp: num(audioReport.truePeakDbtp), lraLu: num(audioReport.lraLu), source: "report", postPass: audioReport.postPass ? !!audioReport.postPass.applied : null };
  } else if (hasAudio) {
    try {
      const V = deps.voice || require("../audio/voice");
      const m = await V.measureEbur128(file, { signal, cwd, timeoutMs: Math.max(60000, Math.round((probe.durationSec || 60) * 3000)) });
      loud = { integratedLufs: m.integratedLufs, truePeakDbtp: num(m.truePeakDbtp), lraLu: num(m.lraLu), source: "measured", postPass: null };
    } catch (e) {
      if ((signal && signal.aborted) || (isEditError(e) && e.errorClass === "cancelled")) throw e;
      loud = { integratedLufs: null, truePeakDbtp: null, lraLu: null, source: "unmeasured", postPass: null };
    }
  }
  findings.push(...checkLoudness({ hasAudio, integratedLufs: loud ? loud.integratedLufs : null, truePeakDbtp: loud ? loud.truePeakDbtp : null }));
  signals.loudness = loud;

  // A/V offset: from the report (mixFinal measures it); fallback computeAvOffset against the voice stem.
  let av = isPlain(audioReport) && isPlain(audioReport.avOffset) ? audioReport.avOffset : null;
  if (!av && hasAudio && voicePath && fs.existsSync(voicePath)) {
    try {
      const M = deps.mix || require("../audio/mix");
      av = await M.computeAvOffset({ voicePath, mixedPath: file, signal });
    } catch (e) {
      if ((signal && signal.aborted) || (isEditError(e) && e.errorClass === "cancelled")) throw e;
      unverified.push("avOffset");
    }
  } else if (!av) unverified.push("avOffset");
  findings.push(...checkAvOffset(av));
  signals.avOffsetMs = av && Number.isFinite(Number(av.ms)) ? Number(av.ms) : null;
  return { findings, signals, unverified, probe };
}

module.exports = {
  LIMITS, SAFE_AREAS, buildContext, runPlanChecks,
  checkCutsInsideWords, checkShortPieces, checkCaptions, checkSafeAreas, checkCaptionFace, checkFaceInCrop, checkCollisions,
  checkBrollCoverage, checkEffectDensity, checkAssets,
  probeMedia, checkContainer, checkDuration, checkLoudness, checkAvOffset, scanMedia, parseScanLog, checkScans, runMediaChecks,
  faceOutAt, visibleCues, captionsOn, liveBroll,
};
