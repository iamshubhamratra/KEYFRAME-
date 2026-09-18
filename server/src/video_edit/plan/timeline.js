// VIDEO EDIT TIMELINE MATH — source cuts -> output pieces -> time map (EDIT_PLAN.md §3).
//
// WHY THIS EXISTS. Speech-anchored elements live on the SOURCE timeline and every output time is
// derived, so toggling one cut never re-runs analysis and never moves a user's B-roll off its
// words. That only works if the derivation is exact, pure and deterministic: the same cuts must
// always yield the same frame-quantized pieces (render chunk keys, voice-stem sample boundaries and
// caption times all hang off them), and the rules that keep edits watchable — minimum removal,
// minimum kept piece, no cut inside a word, keep a natural breath in every silence — must apply
// identically in the server, the QA pass and the editor's mirror. Integer frames are used
// internally; seconds are only produced at the edges (rounded to 1e-6).
//
// CONTRACT (all pure; no Date.now / Math.random):
//   isEffective(cut, settings) · settingEnabled(controlledBy, settings, cut)
//   effectiveCuts(plan, settings=plan.settings, { disabled:Set }) -> { cuts:[Group], adjustments }
//       Group = { ids, kinds, inF, outF, srcIn, srcOut }   (quantized inward, merged when gap < 2 frames,
//       minRemove per merged group: SILENCE/JUMP_CUT 0.25 s, FILLER 0.15 s, others 2 frames)
//   keptRanges(plan, { words, settings }) -> { ranges:[{inF,outF,srcIn,srcOut}], cuts, adjustments }
//   buildPieces(plan, { words, settings, effects, framingFor }) -> { pieces, outDurationSec, cuts, adjustments }
//   chunkKeyFor(piece, framingSlice) -> sha1 hex (excludes outIn)
//   buildTimeMap(pieces) -> { pieces, outDurationSec, srcToOutStart, srcToOutEnd, outToSrc, keptAt(srcT) -> boolean,
//                             resolveAnchor(anchor, words, { minDur }), resolveSrcSpan(a, b, { minDur }) }
//   quantizeIn / quantizeOut treat a time within 0.02 frame of a boundary as on it (ms-rounded plan times).
//   envStats(env, words, { hop }) -> { floorDb, speechDb }
//   refineWordEdges(words, env, { floorDb, speechDb, approx, hop }) -> words (new objects)
//   gapCut(wordA, wordB, env, { floorDb, pace, hop }) -> cut fields | null
//   fillerCut(word, env, { floorDb, speechDb, prevWord, nextWord, approx, adjacentCuts, hop }) -> { cut|null, veto }
//   fragmentCut(fragmentFirstWord, keptTakeFirstWord, { prevWord }) -> cut fields | null
//   jumpCutFraming(pieces, faces, { effects, aspect, mezz:{w,h}, output:{w,h}, scenes, cuts })
//       -> [{ pieceId, z, cx, cy, offsetX, offsetY, variant, shot, lowRes, upscale, crop:{x,y,w,h}, moves }]
//       CACHE LOCALITY (supersedes EDIT_PLAN §3.11's joint-by-joint Z0/Z1 flip, which re-framed — and re-keyed — every
//       piece after a toggled cut): pieces joined by continuity joints (hold/speed, < 0.12 s removed, scene change in the
//       removed span) form a shot; a shot's variant is jointColour(rank(own start), rank(next shot's start)) where ranks
//       are taken among every cut edge of the plan (`cuts`, enabled or not), so toggling a cut changes the framing — and
//       chunk key — only of the pieces touching that joint, and adjacent shots ALWAYS get different variants
//       (Z0 / Z1 / Z1 ± 4 % offsets; lowRes: offsets only). FULL B-roll coverage no longer affects A-roll framing
//       (`fullBrollRanges` is ignored), so B-roll ops never invalidate A-roll chunks. Without `cuts` the ranks come from
//       the shot starts alone (still a valid alternation, not toggle-stable).
//   quantize helpers: toFrame, quantizeIn, quantizeOut, frameToSec, snapToFrame, roundMs
// Adjustments `{ elementId, rule:'min_cut'|'min_keep', action:'disabled' }` report cuts the rules
// suppressed. The cut's own `enabled` flag is NOT mutated: the suppression is re-derived on every
// resolve, so it lifts by itself once a neighbouring edit makes the cut viable again.

const crypto = require("node:crypto");
const { EditError } = require("../errors");
const { canonicalJson } = require("../fsx");

const FPS = 30;
const FRAME_SEC = 1 / FPS;
const MERGE_GAP_FRAMES = 2;
const MIN_KEEP_SEC = 0.35;
const MIN_REMOVE_SEC = Object.freeze({ SILENCE: 0.25, JUMP_CUT: 0.25, FILLER: 0.15 });
const DEFAULT_MIN_REMOVE_SEC = 2 / FPS;
const HEAD_PAD_SEC = 0.15;
const TAIL_PAD_SEC = 0.15;
const MAX_MIN_KEEP_ITERATIONS = 50;
const ENV_HOP_SEC = 0.01;
const TIMELINE_RULES = Object.freeze(["min_cut", "min_keep"]);
const PACE = Object.freeze({
  natural: Object.freeze({ keepGap: 0.2, minGap: 0.6 }),
  fast: Object.freeze({ keepGap: 0.14, minGap: 0.35 }),
  extra_fast: Object.freeze({ keepGap: 0.1, minGap: 0.2 }),
});
const JUMP_ZOOM = Object.freeze({ subtle: 1.1, dynamic: 1.2 });
const FACE_Y_TARGET = Object.freeze({ "9:16": 0.38, "1:1": 0.42, "16:9": 0.4 });
const DEFAULT_FACE = Object.freeze({ cx: 0.5, cy: 0.4, h: 0.3 });

const r6 = (x) => Math.round(x * 1e6) / 1e6;
const roundMs = (x) => Math.round(x * 1000) / 1000;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const cmpStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// Plan times are ms-rounded (EDIT_PLAN §1: up to 0.015 frame off the grid) and derived times r6-rounded, so a
// time within 0.02 frame (0.67 ms) of a frame boundary IS that boundary. A smaller tolerance moved every
// third on-grid cut edge one frame inward on each side.
const QUANT_EPS_FRAMES = 0.02;
function toFrame(t) { return Math.round(t * FPS); }
function quantizeIn(t) { return Math.ceil(t * FPS - QUANT_EPS_FRAMES); }
function quantizeOut(t) { return Math.floor(t * FPS + QUANT_EPS_FRAMES); }
function frameToSec(f) { return r6(f / FPS); }
function snapToFrame(t) { return frameToSec(toFrame(t)); }

function invalid(detail) {
  return new EditError("INVALID_TIMELINE_INPUT", { status: 422, errorClass: "input", detail });
}

// ---------------------------------------------------------------- effective cuts
function settingEnabled(controlledBy, settings, cut) {
  const s = settings || {};
  if (controlledBy == null) return true;
  if (controlledBy === "removeSilence") return s.removeSilence === true;
  if (controlledBy === "autoJumpCuts") return s.autoJumpCuts === true;
  if (controlledBy === "removeFillers") {
    if (!s.removeFillers || s.removeFillers === "off") return false;
    if (cut && cut.fillerKind === "discourse") return s.removeFillers === "aggressive";
    return true;
  }
  return false;
}

function isEffective(cut, settings) {
  return !!cut && cut.enabled === true && settingEnabled(cut.controlledBy, settings, cut);
}

function minRemoveSec(kinds) {
  let m = Infinity;
  for (const k of kinds) m = Math.min(m, MIN_REMOVE_SEC[k] != null ? MIN_REMOVE_SEC[k] : DEFAULT_MIN_REMOVE_SEC);
  return Number.isFinite(m) ? m : DEFAULT_MIN_REMOVE_SEC;
}

function sourceFrames(plan) {
  const D = Number(plan && plan.source && plan.source.durationSec);
  if (!Number.isFinite(D) || D <= 0) throw invalid("plan.source.durationSec must be > 0");
  return quantizeOut(D);
}

function effectiveCuts(plan, settings = plan && plan.settings, { disabled = null } = {}) {
  const Dmax = sourceFrames(plan);
  const records = [];
  for (const c of (plan.cuts || [])) {
    if (!isEffective(c, settings)) continue;
    if (disabled && disabled.has(c.id)) continue;
    const inF = Math.max(0, quantizeIn(c.srcIn));
    const outF = Math.min(Dmax, quantizeOut(c.srcOut));
    if (outF <= inF) continue;
    records.push({ id: c.id, kind: c.kind, inF, outF });
  }
  records.sort((a, b) => a.inF - b.inF || a.outF - b.outF || cmpStr(a.id, b.id));

  const merged = [];
  for (const r of records) {
    const last = merged[merged.length - 1];
    if (last && r.inF - last.outF < MERGE_GAP_FRAMES) {
      last.outF = Math.max(last.outF, r.outF);
      last.ids.push(r.id);
      last.kinds.add(r.kind);
    } else {
      merged.push({ inF: r.inF, outF: r.outF, ids: [r.id], kinds: new Set([r.kind]) });
    }
  }

  const cuts = [];
  const adjustments = [];
  for (const g of merged) {
    const kinds = [...g.kinds].sort();
    const ids = [...g.ids].sort();
    if ((g.outF - g.inF) / FPS < minRemoveSec(kinds) - 1e-9) {
      for (const id of ids) adjustments.push({ elementId: id, rule: "min_cut", action: "disabled" });
      continue;
    }
    cuts.push({ ids, kinds, inF: g.inF, outF: g.outF, srcIn: frameToSec(g.inF), srcOut: frameToSec(g.outF) });
  }
  return { cuts, adjustments };
}

// ---------------------------------------------------------------- kept ranges
function wordMidFrames(words) {
  return (words || [])
    .filter((w) => w && Number.isFinite(w.start) && Number.isFinite(w.end))
    .map((w) => ((w.start + w.end) / 2) * FPS)
    .sort((a, b) => a - b);
}

function hasMidIn(mids, inF, outF) {
  let lo = 0, hi = mids.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (mids[m] < inF) lo = m + 1; else hi = m; }
  return lo < mids.length && mids[lo] < outF;
}

function complement(headF, tailF, cuts) {
  const ranges = [];
  let cursor = headF;
  for (const g of cuts) {
    if (g.outF <= cursor) continue;
    if (g.inF >= tailF) break;
    if (g.inF > cursor) ranges.push({ inF: cursor, outF: g.inF });
    cursor = Math.max(cursor, g.outF);
  }
  if (cursor < tailF) ranges.push({ inF: cursor, outF: tailF });
  return ranges;
}

function keptRanges(plan, { words = [], settings = plan && plan.settings } = {}) {
  const Dmax = sourceFrames(plan);
  const D = plan.source.durationSec;
  const valid = (words || []).filter((w) => w && Number.isFinite(w.start) && Number.isFinite(w.end));
  let headF = 0, tailF = Dmax;
  if (valid.length) {
    let first = Infinity, last = -Infinity;
    for (const w of valid) { first = Math.min(first, w.start); last = Math.max(last, w.end); }
    headF = clamp(quantizeOut(Math.max(0, first - HEAD_PAD_SEC)), 0, Dmax);
    tailF = clamp(quantizeIn(Math.min(D, last + TAIL_PAD_SEC)), headF, Dmax);
  }
  const mids = wordMidFrames(valid);
  const minKeepF = MIN_KEEP_SEC * FPS;
  const disabled = new Set();
  const keepAdjust = [];
  let result = null;

  for (let iter = 0; iter < MAX_MIN_KEEP_ITERATIONS; iter++) {
    const eff = effectiveCuts(plan, settings, { disabled });
    const cuts = eff.cuts;
    let ranges = complement(headF, tailF, cuts);
    let violation = null;
    if (ranges.length > 1) {
      const kept = [];
      for (const r of ranges) {
        const short = r.outF - r.inF < minKeepF - 1e-9;
        if (!short) { kept.push(r); continue; }
        if (!hasMidIn(mids, r.inF, r.outF)) continue;              // wordless sliver: absorbed into the cuts
        kept.push(r);
        if (!violation) violation = r;
      }
      if (kept.length) ranges = kept;
    }
    result = { ranges, cuts, adjustments: eff.adjustments };
    if (!violation) break;

    const left = cuts.find((g) => g.outF === violation.inF) || null;
    const right = cuts.find((g) => g.inF === violation.outF) || null;
    let victim = null;
    if (left && right) victim = (left.outF - left.inF) < (right.outF - right.inF) ? left : right;
    else victim = left || right;
    if (!victim) break;
    for (const id of victim.ids) { disabled.add(id); keepAdjust.push({ elementId: id, rule: "min_keep", action: "disabled" }); }
  }

  const adjustments = [...result.adjustments, ...keepAdjust]
    .sort((a, b) => cmpStr(a.elementId, b.elementId) || cmpStr(a.rule, b.rule));
  return {
    ranges: result.ranges.map((r) => ({ inF: r.inF, outF: r.outF, srcIn: frameToSec(r.inF), srcOut: frameToSec(r.outF) })),
    cuts: result.cuts,
    adjustments,
  };
}

// ---------------------------------------------------------------- pieces
function anchorToSrc(anchor, words) {
  if (!anchor) return null;
  if (anchor.kind === "src") return [anchor.srcIn, anchor.srcOut];
  if (anchor.kind === "words") {
    const a = words && words[anchor.w0], b = words && words[anchor.w1];
    return a && b ? [a.start, b.end] : null;
  }
  return null;
}

function chunkKeyFor(piece, framingSlice = null) {
  const body = canonicalJson({
    srcIn: toFrame(piece.srcIn), srcOut: toFrame(piece.srcOut), kind: piece.kind, rate: piece.rate,
    holdF: piece.kind === "hold" ? toFrame(piece.outOut - piece.outIn) : 0, framing: framingSlice,
  });
  return crypto.createHash("sha1").update(body).digest("hex");
}

function buildPieces(plan, { words = [], settings = plan && plan.settings, effects = plan && plan.effects, framingFor = null } = {}) {
  const kept = keptRanges(plan, { words, settings });
  const fxOn = !settings || settings.effectsEnabled !== false;
  const live = (fxOn ? (effects || []) : []).filter((e) => e && e.enabled === true);

  const speeds = [];
  for (const e of live) {
    if (e.kind !== "SPEED" || e.target !== "aroll_nonspeech") continue;
    const span = anchorToSrc(e.anchor, words);
    if (!span) continue;
    const inF = quantizeIn(span[0]), outF = quantizeOut(span[1]);
    if (outF > inF) speeds.push({ id: e.id, inF, outF, rate: e.rate });
  }
  speeds.sort((a, b) => a.inF - b.inF || cmpStr(a.id, b.id));
  const freezes = [];
  const freezeFrames = new Set();
  for (const e of [...live].sort((a, b) => cmpStr(a.id, b.id))) {
    if (e.kind !== "FREEZE") continue;
    const atF = toFrame(e.atSrc);
    if (freezeFrames.has(atF)) continue;
    freezeFrames.add(atF);
    freezes.push({ id: e.id, atF, holdF: Math.max(1, toFrame(e.holdSec)) });
  }

  const specs = [];
  for (const r of kept.ranges) {
    const splits = new Set([r.inF, r.outF]);
    for (const s of speeds) { if (s.inF > r.inF && s.inF < r.outF) splits.add(s.inF); if (s.outF > r.inF && s.outF < r.outF) splits.add(s.outF); }
    const rangeFreezes = freezes.filter((f) => f.atF >= r.inF && f.atF <= r.outF);
    for (const f of rangeFreezes) splits.add(f.atF);
    const points = [...splits].sort((a, b) => a - b);
    const holdAt = new Map(rangeFreezes.map((f) => [f.atF, f]));
    if (holdAt.has(r.inF)) specs.push({ kind: "hold", inF: r.inF, outF: r.inF, rate: 1, outLenF: holdAt.get(r.inF).holdF });
    for (let k = 0; k + 1 < points.length; k++) {
      const a = points[k], b = points[k + 1];
      if (b <= a) continue;
      const sp = speeds.find((s) => s.inF <= a && s.outF >= b);
      if (sp) specs.push({ kind: "speed", inF: a, outF: b, rate: sp.rate, outLenF: Math.max(1, Math.round((b - a) / sp.rate)) });
      else specs.push({ kind: "play", inF: a, outF: b, rate: 1, outLenF: b - a });
      if (holdAt.has(b) && b !== r.inF) specs.push({ kind: "hold", inF: b, outF: b, rate: 1, outLenF: holdAt.get(b).holdF });
    }
  }

  let outF = 0;
  const pieces = specs.map((s) => {
    const p = {
      id: `pc_${s.inF}_${s.kind === "hold" ? "h" : s.kind === "speed" ? "s" : "p"}`,
      srcIn: frameToSec(s.inF),
      srcOut: frameToSec(s.outF),
      outIn: frameToSec(outF),
      outOut: frameToSec(outF + s.outLenF),
      kind: s.kind,
      rate: s.rate,
      chunkKey: "",
    };
    outF += s.outLenF;
    p.chunkKey = chunkKeyFor(p, typeof framingFor === "function" ? framingFor(p) : null);
    return p;
  });
  return { pieces, outDurationSec: frameToSec(outF), cuts: kept.cuts, adjustments: kept.adjustments, ranges: kept.ranges };
}

// ---------------------------------------------------------------- time map
function buildTimeMap(pieces) {
  const P = (pieces || []).slice().sort((a, b) => a.outIn - b.outIn);
  const mov = P.filter((p) => p.kind !== "hold");
  const outDurationSec = P.length ? P[P.length - 1].outOut : 0;

  const mapInside = (p, t) => {
    const srcLen = p.srcOut - p.srcIn, outLen = p.outOut - p.outIn;
    if (srcLen <= 0) return p.outIn;
    return clamp(p.outIn + ((t - p.srcIn) * outLen) / srcLen, p.outIn, p.outOut);
  };
  // index of the last moving piece with srcIn <= t (strict: srcIn < t)
  const lastStartingAtOrBefore = (t, strict) => {
    let lo = 0, hi = mov.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      const ok = strict ? mov[m].srcIn < t - 1e-9 : mov[m].srcIn <= t + 1e-9;
      if (ok) lo = m + 1; else hi = m;
    }
    return lo - 1;
  };

  function srcToOutStart(t) {
    const i = lastStartingAtOrBefore(t, false);
    if (i >= 0 && t < mov[i].srcOut - 1e-9) return r6(mapInside(mov[i], t));
    const next = mov[i + 1];
    return r6(next ? next.outIn : outDurationSec);
  }
  function srcToOutEnd(t) {
    const i = lastStartingAtOrBefore(t, true);
    if (i < 0) return 0;
    if (t <= mov[i].srcOut + 1e-9) return r6(mapInside(mov[i], t));
    return r6(mov[i].outOut);
  }
  function outToSrc(o) {
    if (!P.length) return 0;
    let lo = 0, hi = P.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (P[m].outIn <= o + 1e-9) lo = m + 1; else hi = m; }
    const p = P[Math.max(0, lo - 1)];
    if (o >= p.outOut) return r6(p.srcOut);
    if (p.kind === "hold") return r6(p.srcIn);
    const outLen = p.outOut - p.outIn;
    return r6(p.srcIn + (Math.max(0, o - p.outIn) * (p.srcOut - p.srcIn)) / (outLen || 1));
  }
  // true when source time t plays in the output (inside a play/speed piece; a hold piece is not source time)
  function keptAt(t) {
    const i = lastStartingAtOrBefore(t, false);
    return i >= 0 && t < mov[i].srcOut - 1e-9;
  }
  function resolveSrcSpan(a, b, { minDur = 2 / FPS } = {}) {
    const outIn = srcToOutStart(a);
    const outOut = Math.max(outIn, srcToOutEnd(b));
    return { outIn, outOut: r6(outOut), collapsed: outOut - outIn < minDur - 1e-9 };
  }
  function resolveAnchor(anchor, words, { minDur = 2 / FPS } = {}) {
    if (!anchor) return { outIn: 0, outOut: 0, collapsed: true };
    if (anchor.kind === "out") {
      const outIn = r6(clamp(anchor.outIn, 0, outDurationSec));
      const outOut = r6(clamp(anchor.outOut, outIn, outDurationSec));
      return { outIn, outOut, collapsed: outOut - outIn < minDur - 1e-9 };
    }
    const span = anchorToSrc(anchor, words);
    if (!span) return { outIn: 0, outOut: 0, collapsed: true };
    return resolveSrcSpan(span[0], span[1], { minDur });
  }
  return { pieces: P, outDurationSec, srcToOutStart, srcToOutEnd, outToSrc, keptAt, resolveAnchor, resolveSrcSpan };
}

// ---------------------------------------------------------------- RMS envelope helpers
const envIndex = (t, hop) => Math.floor(t / hop + 1e-9);

function percentile(values, p) {
  if (!values.length) return null;
  const a = Float64Array.from(values).sort();
  const idx = clamp(Math.round((a.length - 1) * p), 0, a.length - 1);
  return a[idx];
}

function envStats(env, words, { hop = ENV_HOP_SEC } = {}) {
  if (!env || !env.length) throw invalid("envStats: empty envelope");
  const inWord = new Uint8Array(env.length);
  for (const w of words || []) {
    for (let i = Math.max(0, envIndex(w.start, hop)); i <= Math.min(env.length - 1, envIndex(w.end, hop)); i++) inWord[i] = 1;
  }
  const non = [], sp = [];
  for (let i = 0; i < env.length; i++) (inWord[i] ? sp : non).push(env[i]);
  const all = Array.from(env);
  return {
    floorDb: roundMs(percentile(non.length ? non : all, 0.1)),
    speechDb: roundMs(percentile(sp.length ? sp : all, sp.length ? 0.5 : 0.6)),
  };
}

// A dip is a local minimum at least 4 dB below the loudest frame within ±80 ms (ANALYSIS.md §4.4).
// Flat plateaus are not dips — every frame of a constant run is "≤ its neighbours".
const DIP_DEPTH_DB = 4;
const DIP_NEIGHBOURHOOD_SEC = 0.08;
function isDip(env, i, hop) {
  if (i <= 0 || i >= env.length - 1 || env[i] > env[i - 1] || env[i] > env[i + 1]) return false;
  const r = Math.max(1, Math.round(DIP_NEIGHBOURHOOD_SEC / hop));
  let peak = -Infinity;
  for (let k = Math.max(0, i - r); k <= Math.min(env.length - 1, i + r); k++) peak = Math.max(peak, env[k]);
  return peak - env[i] >= DIP_DEPTH_DB;
}

function snapDip(env, t, win, hop) {
  const i0 = envIndex(t, hop);
  let best = -1;
  for (let i = Math.max(1, envIndex(t - win, hop)); i <= Math.min(env.length - 2, envIndex(t + win, hop)); i++) {
    if (!isDip(env, i, hop)) continue;
    if (best < 0) { best = i; continue; }
    const d = Math.abs(i - i0), bd = Math.abs(best - i0);
    if (d < bd || (d === bd && env[i] < env[best])) best = i;
  }
  return best < 0 ? t : (best + 0.5) * hop;
}

function refineWordEdges(words, env, { floorDb, speechDb, approx = false, hop = ENV_HOP_SEC } = {}) {
  const src = words || [];
  if (!env || !env.length || !Number.isFinite(floorDb)) return src.map((w) => ({ ...w }));
  const thr = floorDb + 10;
  const out = src.map((w) => ({ ...w }));
  for (let k = 0; k < out.length; k++) {
    const w = src[k];
    const prevEnd = k > 0 ? out[k - 1].end : 0;
    const nextStart = k + 1 < src.length ? src[k + 1].start : Infinity;
    let s = w.start, e = w.end;
    if (approx) {
      s = snapDip(env, w.start, 0.08, hop);
      e = snapDip(env, w.end, 0.08, hop);
    } else {
      for (let i = envIndex(w.end, hop); i < env.length && (i + 1) * hop <= w.end + 0.15 + 1e-9 && env[i] > thr; i++) e = Math.max(e, (i + 1) * hop);
      for (let j = envIndex(w.start, hop) - 1; j >= 0 && j * hop >= w.start - 0.12 - 1e-9 && env[j] > thr; j--) s = Math.min(s, j * hop);
    }
    s = Math.max(s, prevEnd);
    e = Math.min(e, nextStart);
    if (e <= s) { s = Math.max(w.start, prevEnd); e = Math.max(s, Math.min(w.end, nextStart)); }
    out[k].start = roundMs(s);
    out[k].end = roundMs(e);
  }
  return out;
}

function gapCut(wordA, wordB, env, { floorDb, pace = "natural", hop = ENV_HOP_SEC } = {}) {
  const P = PACE[pace];
  if (!P) throw invalid(`gapCut: unknown pace '${pace}'`);
  if (!wordA || !wordB) throw invalid("gapCut: two words are required");
  const endA = wordA.end, startB = wordB.start;
  const gap = startB - endA;
  if (gap < P.minGap - 1e-9) return null;

  const hasEnv = env && env.length && Number.isFinite(floorDb);
  const thr = hasEnv ? floorDb + 6 : Infinity;
  const quiet = (i) => !hasEnv || (i >= 0 && i + 2 < env.length && env[i] < thr && env[i + 1] < thr && env[i + 2] < thr);

  const loA = endA + 0.04, hiA = endA + 0.2;
  const hiB = startB - 0.04, loB = startB - 0.15;
  let a = null;
  for (let i = Math.ceil(loA / hop - 1e-9); i * hop <= hiB + 1e-9; i++) { if (quiet(i)) { a = i * hop; break; } }
  a = clamp(a == null ? hiA : a, loA, hiA);
  let b = null;
  for (let i = Math.floor(hiB / hop + 1e-9) - 1; i - 2 >= 0 && (i - 2) * hop >= loA - 1e-9; i--) { if (quiet(i - 2)) { b = (i + 1) * hop; break; } }
  if (b == null && !hasEnv) b = hiB;
  b = clamp(b == null ? loB : b, loB, hiB);

  const srcIn = roundMs(a + P.keepGap / 2);
  const srcOut = roundMs(b - P.keepGap / 2);
  if (srcOut - srcIn < 2 / FPS - 1e-9) return null;
  return {
    kind: "SILENCE",
    srcIn, srcOut,
    raw: { srcIn: roundMs(endA), srcOut: roundMs(startB) },
    snap: { method: "rms_gap", padIn: roundMs(srcIn - endA), padOut: roundMs(startB - srcOut) },
    keepGap: P.keepGap,
    gapSec: roundMs(gap),
  };
}

function meanRange(env, i0, i1) {
  let sum = 0, n = 0;
  for (let i = Math.max(0, i0); i < Math.min(env.length, i1); i++) { sum += env[i]; n++; }
  return n ? sum / n : null;
}

function hasDipNear(env, t, { speechDb, win = 0.08, hop }) {
  for (let i = Math.max(1, envIndex(t - win, hop)); i <= Math.min(env.length - 2, envIndex(t + win, hop)); i++) {
    if (isDip(env, i, hop) && env[i] < speechDb - 3) return true;
  }
  return false;
}

function fillerCut(word, env, ctx = {}) {
  const { floorDb, speechDb, prevWord = null, nextWord = null, approx = false, adjacentCuts = [], hop = ENV_HOP_SEC, minConf = 0.6 } = ctx;
  if (!word || !Number.isFinite(word.start) || !Number.isFinite(word.end)) throw invalid("fillerCut: word with start/end required");
  const conf = Number.isFinite(word.conf) ? word.conf : 1;
  if (conf < minConf) return { cut: null, veto: "low_conf" };
  const hasEnv = env && env.length && Number.isFinite(speechDb);
  if (hasEnv) {
    const left = meanRange(env, Math.floor((word.start - 0.04) / hop + 1e-9), Math.floor(word.start / hop + 1e-9));
    const right = meanRange(env, Math.ceil(word.end / hop - 1e-9), Math.ceil((word.end + 0.04) / hop - 1e-9));
    if (left != null && right != null && left > speechDb - 6 && right > speechDb - 6) return { cut: null, veto: "coarticulated" };
    if (approx && !(hasDipNear(env, word.start, { speechDb, hop }) && hasDipNear(env, word.end, { speechDb, hop }))) {
      return { cut: null, veto: "no_dip" };
    }
  } else if (approx) {
    return { cut: null, veto: "no_dip" };
  }
  let lo = Math.max(prevWord ? prevWord.end : 0, word.start - 0.03);
  let hi = nextWord ? Math.min(nextWord.start, word.end + 0.05) : word.end + 0.05;
  for (const c of adjacentCuts || []) {
    if (!c) continue;
    if (c.srcOut >= lo - 2 / FPS && c.srcIn < lo) lo = Math.max(prevWord ? prevWord.end : 0, Math.min(lo, c.srcIn));
    if (c.srcIn <= hi + 2 / FPS && c.srcOut > hi) hi = nextWord ? Math.min(nextWord.start, Math.max(hi, c.srcOut)) : Math.max(hi, c.srcOut);
  }
  lo = roundMs(lo); hi = roundMs(hi);
  if (hi <= lo) return { cut: null, veto: "no_room" };
  return {
    cut: {
      kind: "FILLER",
      srcIn: lo, srcOut: hi,
      raw: { srcIn: roundMs(word.start), srcOut: roundMs(word.end) },
      snap: { method: approx ? "island_edge" : "word_edge", padIn: roundMs(word.start - lo), padOut: roundMs(hi - word.end) },
      wordRange: Number.isInteger(word.i) ? [word.i, word.i] : null,
      confidence: Math.round(conf * 1000) / 1000,
    },
    veto: null,
  };
}

function fragmentCut(fragmentFirst, keptFirst, { prevWord = null } = {}) {
  if (!fragmentFirst || !keptFirst) throw invalid("fragmentCut: fragment and kept-take words required");
  const srcIn = roundMs(Math.max(prevWord ? prevWord.end : 0, fragmentFirst.start - 0.03, 0));
  const srcOut = roundMs(keptFirst.start - 0.06);
  if (srcOut - srcIn < 2 / FPS) return null;
  return {
    srcIn, srcOut,
    raw: { srcIn: roundMs(fragmentFirst.start), srcOut: roundMs(keptFirst.start) },
    snap: { method: "word_edge", padIn: roundMs(fragmentFirst.start - srcIn), padOut: 0.06 },
  };
}

// ---------------------------------------------------------------- jump-cut framing
function faceAt(faces, t) {
  if (!faces || faces.mode === "assumed" || !Array.isArray(faces.keyframes) || !faces.keyframes.length) return { ...DEFAULT_FACE };
  for (const r of faces.absent || []) { if (t >= r.start && t < r.end) return { ...DEFAULT_FACE }; }
  const K = faces.keyframes;
  if (t <= K[0].t) return { cx: K[0].cx, cy: K[0].cy, h: K[0].h };
  const last = K[K.length - 1];
  if (t >= last.t) return { cx: last.cx, cy: last.cy, h: last.h };
  let lo = 0, hi = K.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (K[m].t <= t) lo = m; else hi = m; }
  const a = K[lo], b = K[hi], u = (t - a.t) / ((b.t - a.t) || 1);
  return { cx: a.cx + (b.cx - a.cx) * u, cy: a.cy + (b.cy - a.cy) * u, h: a.h + (b.h - a.h) * u };
}

const even = (v) => Math.max(2, Math.floor(v / 2) * 2);

function cropFor(geom, z, face, offsetX, yTarget, offsetY = 0) {
  const { W, H, bw, bh } = geom;
  const w = Math.min(even(bw / z), even(W));
  const h = Math.min(even(bh / z), even(H));
  const x = clamp(Math.round(face.cx * W - w / 2 + offsetX * W), 0, W - w);
  let y = clamp(Math.round(face.cy * H - yTarget * h + offsetY * H), 0, H - h);
  const faceTop = (face.cy - face.h / 2) * H;
  if (faceTop - y < 0.08 * h) y = clamp(Math.round(faceTop - 0.08 * h), 0, H - h);
  return { x, y, w, h };
}

// Framing variants [zoomLevel (0 = Z0, 1 = Z1), offsetX steps, offsetY steps] in units of JUMP_OFFSET, indexed by the
// joint colour below. Index 0/1 alternate Z0/Z1 on consecutive joints (the ruler sequence 0,1,0,2,0,1,0,3 of
// consecutive ranks), so the look stays "zoom in, zoom out"; the ±4 % offset variants carry the rarer colours.
const JUMP_OFFSET = 0.04;
const FRAMING_VARIANTS = Object.freeze([
  [0, 0, 0], [1, 0, 0], [1, -1, 0], [1, 1, 0], [1, 0, -1], [1, 0, 1], [1, -1, -1], [1, 1, 1],
].map(Object.freeze));
const LOWRES_VARIANTS = Object.freeze([
  [0, -1, 0], [0, 1, 0], [0, 0, 0], [0, -2, 0], [0, 2, 0], [0, -1, -1], [0, 1, 1], [0, 0, -1],
].map(Object.freeze));

// Highest differing bit of x < y. For ranks a < b < c, jointColour(a,b) !== jointColour(b,c): at that bit a has 0 and b
// has 1, while at jointColour(b,c) b has 0 — so the two indices can never coincide.
const jointColour = (x, y) => 31 - Math.clz32((x ^ y) >>> 0);

function jumpCutFraming(pieces, faces, opts = {}) {
  const { effects = "subtle", aspect, mezz, output, scenes = [], cuts = null, minRemovedSec = 0.12, upscaleCap = 2.0 } = opts;
  if (!mezz || !(mezz.w > 0) || !(mezz.h > 0)) throw invalid("jumpCutFraming: mezz {w,h} required");
  if (!output || !(output.w > 0) || !(output.h > 0)) throw invalid("jumpCutFraming: output {w,h} required");
  const A = output.w / output.h;
  const W = mezz.w, H = mezz.h;
  const bw = Math.min(W, H * A), bh = bw / A;
  const geom = { W, H, bw, bh };
  const zMax = (upscaleCap * bh) / output.h;
  const z1Nominal = JUMP_ZOOM[effects] || JUMP_ZOOM.subtle;
  const z1 = Math.min(z1Nominal, Math.floor(zMax * 100 + 1e-9) / 100);
  const lowRes = z1 < 1.05 - 1e-9;
  const yTarget = FACE_Y_TARGET[aspect] != null ? FACE_Y_TARGET[aspect] : 0.4;
  const sceneTimes = (scenes || []).map((s) => (typeof s === "number" ? s : s && s.start)).filter(Number.isFinite).sort((a, b) => a - b);
  const sceneBetween = (a, b) => sceneTimes.some((t) => t > a + 1e-9 && t <= b + 1e-9);
  const palette = lowRes ? LOWRES_VARIANTS : FRAMING_VARIANTS;

  const list = (pieces || []).slice().sort((a, b) => a.outIn - b.outIn);

  // 1. shots: pieces joined by a continuity joint (hold/speed involved, < minRemovedSec removed, scene change in the
  //    removed span) share one framing — there is no jump to hide.
  const shotOf = new Array(list.length);
  const shotStarts = [];
  for (let i = 0; i < list.length; i++) {
    const p = list[i], prev = list[i - 1];
    const jump = i > 0 && prev.kind === "play" && p.kind === "play" && p.srcIn - prev.srcOut >= minRemovedSec - 1e-9 && !sceneBetween(prev.srcOut, p.srcIn);
    if (i === 0 || jump) shotStarts.push(i);
    shotOf[i] = shotStarts.length - 1;
  }

  // 2. stable keys: a shot starts where a cut group ends, i.e. on some cut's quantized srcOut. Ranking shot starts
  //    among EVERY cut edge of the plan (enabled or not) gives keys that toggling a cut never renumbers.
  const keyFrames = shotStarts.map((i) => toFrame(list[i].srcIn));
  const space = new Set(keyFrames);
  for (const c of Array.isArray(cuts) ? cuts : []) if (c && Number.isFinite(c.srcOut)) space.add(quantizeOut(c.srcOut));
  const sorted = [...space].sort((a, b) => a - b);
  const rankOf = new Map(sorted.map((f, k) => [f, k]));

  // 3. a shot's variant depends only on its own start and the NEXT shot's start (both unchanged unless the toggled
  //    joint touches the shot), and differs from both neighbours by construction.
  const variantOfShot = [];
  for (let s = 0; s < shotStarts.length; s++) {
    const a = rankOf.get(keyFrames[s]);
    const b = s + 1 < shotStarts.length ? rankOf.get(keyFrames[s + 1]) : sorted.length;
    let v = jointColour(a, b);
    if (v >= palette.length) {   // > 256 cut edges: fold, then step off the previous shot's variant (rare, local)
      v = 4 + ((v - 4) % 4);
      if (s > 0 && v === variantOfShot[s - 1]) v = 4 + ((v - 3) % 4);
    }
    variantOfShot.push(v);
  }

  const out = [];
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    const variant = variantOfShot[shotOf[i]];
    const [level, dx, dy] = palette[variant];
    const face = faceAt(faces, p.srcIn);
    const z = level === 1 && !lowRes ? z1 : 1;
    const offsetX = r6(dx * JUMP_OFFSET);
    const offsetY = r6(dy * JUMP_OFFSET);
    const crop = cropFor(geom, z, face, offsetX, yTarget, offsetY);
    const moves = [];
    if (faces && faces.mode !== "assumed" && Array.isArray(faces.keyframes) && p.kind !== "hold") {
      let cur = face;
      for (const kf of faces.keyframes) {
        if (kf.t <= p.srcIn || kf.t >= p.srcOut) continue;
        const dx = Math.abs(kf.cx - cur.cx) * W, dy = Math.abs(kf.cy - cur.cy) * H;
        if (dx > 0.12 * crop.w || dy > 0.08 * crop.h) {
          moves.push({ src: r6(kf.t), cx: r6(kf.cx), cy: r6(kf.cy), easeSec: 0.5 });
          cur = kf;
        }
      }
    }
    out.push({
      pieceId: p.id, z: r6(z), cx: r6(face.cx), cy: r6(face.cy), offsetX, offsetY, variant, shot: shotOf[i], lowRes,
      upscale: Math.round(((output.h * z) / bh) * 1000) / 1000, crop, moves,
    });
  }
  return out;
}

module.exports = {
  FPS, FRAME_SEC, MIN_KEEP_SEC, MIN_REMOVE_SEC, MERGE_GAP_FRAMES, PACE, JUMP_ZOOM, FACE_Y_TARGET, TIMELINE_RULES, ENV_HOP_SEC,
  toFrame, quantizeIn, quantizeOut, frameToSec, snapToFrame, roundMs,
  settingEnabled, isEffective, effectiveCuts, keptRanges, buildPieces, chunkKeyFor, buildTimeMap, anchorToSrc,
  envStats, refineWordEdges, gapCut, fillerCut, fragmentCut, jumpCutFraming, faceAt, cropFor,
};
