// EDIT MODEL — the pure half of the AI Video Edit client (no DOM, no React, no import.meta).
//
// The server's Edit Plan is the single source of truth (docs/ai-video-edit/EDIT_PLAN.md). This
// module mirrors just enough of it for the editor to feel instant and stay honest:
//   · timeline math (§3 steps 1–4): effective cuts → kept ranges → pieces → TimeMap, so a cut
//     toggle re-projects captions, B-roll and effects onto the new output time before the server
//     answers, and a preview swap can keep the playhead on the same source moment (mapTime);
//   · outline(plan) + summarize(outline): the AI EDIT SUMMARY chips (§7);
//   · retimeCaption: the §5 caption re-timing algorithm, so an edited caption keeps its words'
//     timing locally exactly as the server will;
//   · OP_META / validateOp / applyOpLocal: which ops may be applied optimistically, how they
//     coalesce, what they cost, and the local apply itself.
// Everything returns new objects; inputs are never mutated. Server responses always win: the
// editor replays pending optimistic ops on top of each plan it fetches.
//
// Word indices: a transcript word's `i` IS its srcWordIndex. Cue words carry `i` (null for user
// insertions) and `key` ("w<i>" or an insertion key).

import { NO_SPACE_LANGUAGES } from "./brand.js";

// ---------------------------------------------------------------- time
export const FPS = 30;
export const FRAME = 1 / FPS;
const EPS = 1e-6;

export const round3 = (t) => Math.round(Number(t) * 1000) / 1000;
export const snap = (t) => round3(Math.round(Number(t) * FPS) / FPS);
const ceilFrame = (t) => round3(Math.ceil(Number(t) * FPS - EPS) / FPS);
const floorFrame = (t) => round3(Math.floor(Number(t) * FPS + EPS) / FPS);
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export const MIN_REMOVE = Object.freeze({ SILENCE: 0.25, JUMP_CUT: 0.25, FILLER: 0.15 });
export const MIN_KEEP = 0.35;
export const MIN_DUR = Object.freeze({ word: 2 * FRAME, effect: 2 * FRAME, cue: 2 * FRAME, broll: 0.4, graphic: 0.4, segment: 2 * FRAME });
export const AUTO_UPDATE_MAX_SEC = 45;

export const dbToGain = (db) => round3(Math.pow(10, Number(db) / 20));
export const gainToDb = (g) => (Number(g) > 0 ? Math.round(20 * Math.log10(Number(g)) * 10) / 10 : -60);

// ---------------------------------------------------------------- lookups
const arr = (v) => (Array.isArray(v) ? v : []);

export function wordAt(words, i) {
  const list = arr(words);
  if (!Number.isInteger(i) || i < 0) return null;
  const direct = list[i];
  if (direct && (direct.i === undefined || direct.i === i)) return direct;
  return list.find((w) => w && w.i === i) || null;
}

// Every selectable thing in a plan, by UI kind.
export function findItem(plan, kind, id) {
  if (!plan) return null;
  switch (kind) {
    case "segment": return arr(plan.aRoll?.segments).find((s) => s.id === id) || null;
    case "cut": return arr(plan.cuts).find((c) => c.id === id) || null;
    case "caption": return arr(plan.captions?.cues).find((c) => c.id === id) || null;
    case "broll": return arr(plan.broll).find((b) => b.id === id) || null;
    case "effect": return arr(plan.effects).find((e) => e.id === id) || null;
    case "graphic": return arr(plan.graphics).find((g) => g.id === id) || null;
    case "transition": return arr(plan.transitions).find((t) => t.id === id) || null;
    case "sfx": return arr(plan.sfx).find((s) => s.id === id) || null;
    case "music": return plan.music || null;
    case "logo": return plan.branding?.logo || null;
    default: return null;
  }
}

// Which UI kind an element id belongs to (ids carry their prefix).
export function kindOfId(plan, id) {
  if (!id) return null;
  if (id === "music") return "music";
  if (id === "logo") return "logo";
  for (const kind of ["segment", "cut", "caption", "broll", "effect", "graphic", "transition", "sfx"]) {
    if (findItem(plan, kind, id)) return kind;
  }
  return null;
}

// ---------------------------------------------------------------- cuts
export function effectiveCut(cut, settings = {}) {
  if (!cut) return false;
  if (cut.userToggled) return !!cut.enabled;
  if (!cut.enabled) return false;
  switch (cut.controlledBy) {
    case "removeSilence": return settings.removeSilence !== false;
    case "removeFillers": return settings.removeFillers !== "off";
    case "autoJumpCuts": return settings.autoJumpCuts !== false;
    default: return true;
  }
}

function headTail(plan, ctx) {
  const D = Number(plan?.source?.durationSec) || 0;
  const words = arr(ctx?.words).filter((w) => w && Number.isFinite(w.start));
  if (words.length) {
    const first = words.reduce((a, w) => (w.start < a.start ? w : a), words[0]);
    const last = words.reduce((a, w) => (w.end > a.end ? w : a), words[0]);
    return [round3(Math.max(0, first.start - 0.15)), round3(Math.min(D || last.end + 0.15, last.end + 0.15))];
  }
  const pieces = arr(plan?.timeline?.pieces);
  if (pieces.length) return [pieces[0].srcIn, pieces[pieces.length - 1].srcOut];
  return [0, D];
}

// §3 steps 1–3. Returns { pieces, outDurationSec, activeCutIds, disabledCutIds, head, tail }.
export function buildPieces(plan, ctx = {}) {
  const settings = plan?.settings || {};
  const [head, tail] = headTail(plan, ctx);
  const words = arr(ctx.words);
  const disabled = new Set();
  let merged = [];
  let kept = [];

  for (let iter = 0; iter < 50; iter++) {
    const cuts = arr(plan?.cuts)
      .filter((c) => effectiveCut(c, settings) && !disabled.has(c.id))
      .map((c) => ({ ids: [c.id], kinds: [c.kind], srcIn: Math.max(head, ceilFrame(c.srcIn)), srcOut: Math.min(tail, floorFrame(c.srcOut)) }))
      .filter((c) => c.srcOut - c.srcIn >= (MIN_REMOVE[c.kinds[0]] ?? 2 * FRAME) - EPS)
      .sort((a, b) => a.srcIn - b.srcIn);

    merged = [];
    for (const c of cuts) {
      const prev = merged[merged.length - 1];
      if (prev && c.srcIn - prev.srcOut < 2 * FRAME - EPS) {
        prev.srcOut = Math.max(prev.srcOut, c.srcOut);
        prev.ids.push(...c.ids);
        prev.kinds.push(...c.kinds);
      } else {
        merged.push({ ...c, ids: [...c.ids], kinds: [...c.kinds] });
      }
    }

    kept = [];
    let cursor = head;
    for (let k = 0; k < merged.length; k++) {
      if (merged[k].srcIn > cursor + EPS) kept.push({ srcIn: cursor, srcOut: merged[k].srcIn, before: k - 1, after: k });
      cursor = Math.max(cursor, merged[k].srcOut);
    }
    if (tail > cursor + EPS) kept.push({ srcIn: cursor, srcOut: tail, before: merged.length - 1, after: -1 });

    let restart = false;
    const absorbed = new Set();
    for (let r = 0; r < kept.length; r++) {
      const range = kept[r];
      if (range.srcOut - range.srcIn >= MIN_KEEP - EPS) continue;
      const hasWords = words.some((w) => w && (w.start + w.end) / 2 >= range.srcIn && (w.start + w.end) / 2 < range.srcOut);
      if (!hasWords) { absorbed.add(r); continue; }
      const before = merged[range.before];
      const after = merged[range.after];
      const victim = !before ? after : !after ? before
        : (before.srcOut - before.srcIn) <= (after.srcOut - after.srcIn) ? before : after;
      if (victim) {
        for (const id of victim.ids) disabled.add(id);
        restart = true;
        break;
      }
    }
    if (!restart) {
      kept = kept.filter((_, r) => !absorbed.has(r));
      break;
    }
  }

  // FREEZE → hold pieces, SPEED → rate pieces (src anchors only on the client).
  const holds = arr(plan?.effects).filter((e) => e.kind === "FREEZE" && e.enabled !== false && Number.isFinite(e.atSrc));
  const speeds = arr(plan?.effects).filter((e) => e.kind === "SPEED" && e.enabled !== false && e.anchor?.kind === "src");
  const pieces = [];
  let out = 0;
  const push = (srcIn, srcOut, kind = "play", rate = 1, holdSec = 0) => {
    const len = kind === "hold" ? holdSec : (srcOut - srcIn) / rate;
    if (len <= EPS) return;
    const outIn = round3(out);
    out += len;
    pieces.push({ id: `p_${pieces.length}`, srcIn: round3(srcIn), srcOut: round3(srcOut), outIn, outOut: round3(out), kind, rate, chunkKey: `${round3(srcIn)}:${round3(srcOut)}:${kind}:${rate}` });
  };
  for (const range of kept) {
    const bounds = [range.srcIn];
    for (const s of speeds) {
      if (s.anchor.srcIn > range.srcIn && s.anchor.srcIn < range.srcOut) bounds.push(s.anchor.srcIn);
      if (s.anchor.srcOut > range.srcIn && s.anchor.srcOut < range.srcOut) bounds.push(s.anchor.srcOut);
    }
    for (const h of holds) if (h.atSrc > range.srcIn && h.atSrc < range.srcOut) bounds.push(h.atSrc);
    bounds.push(range.srcOut);
    const uniq = [...new Set(bounds.map(round3))].sort((a, b) => a - b);
    for (let b = 0; b < uniq.length - 1; b++) {
      const a0 = uniq[b], a1 = uniq[b + 1];
      const hold = holds.find((h) => Math.abs(round3(h.atSrc) - a0) < EPS);
      if (hold && b > 0) push(a0, a0, "hold", 1, clamp(Number(hold.holdSec) || 0.4, 0.2, 0.8));
      const speed = speeds.find((s) => a0 >= s.anchor.srcIn - EPS && a1 <= s.anchor.srcOut + EPS);
      push(a0, a1, speed ? "speed" : "play", speed ? clamp(Number(speed.rate) || 1, 0.5, 2) : 1);
    }
  }

  const activeCutIds = merged.flatMap((m) => m.ids);
  return { pieces, outDurationSec: round3(out), activeCutIds, disabledCutIds: [...disabled], head, tail, merged };
}

// ---------------------------------------------------------------- TimeMap
export function createTimeMap(pieces) {
  const list = arr(pieces).slice().sort((a, b) => a.outIn - b.outIn);
  const bySrc = list.filter((p) => p.kind !== "hold" && p.srcOut > p.srcIn);
  const outDuration = list.length ? list[list.length - 1].outOut : 0;

  const lastSrcAtOrBefore = (t) => {
    let lo = 0, hi = bySrc.length - 1, ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (bySrc[mid].srcIn <= t + EPS) { ans = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return ans;
  };
  const project = (p, t) => p.outIn + (t - p.srcIn) / (p.rate || 1);

  function srcToOutStart(t) {
    if (!bySrc.length) return 0;
    const k = lastSrcAtOrBefore(t);
    if (k === -1) return bySrc[0].outIn;
    const p = bySrc[k];
    if (t < p.srcOut - EPS) return round3(project(p, t));
    const next = bySrc[k + 1];
    return next ? next.outIn : round3(p.outOut);
  }
  function srcToOutEnd(t) {
    if (!bySrc.length) return 0;
    const k = lastSrcAtOrBefore(t);
    if (k === -1) return 0;
    const p = bySrc[k];
    if (t <= p.srcOut + EPS) {
      if (t <= p.srcIn + EPS) {
        const prev = bySrc[k - 1];
        return prev ? prev.outOut : p.outIn;
      }
      return round3(Math.min(project(p, t), p.outOut));
    }
    return p.outOut;
  }
  function outToSrc(o) {
    if (!list.length) return 0;
    if (o <= 0) return list[0].srcIn;
    let lo = 0, hi = list.length - 1, ans = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid].outIn <= o + EPS) { ans = mid; lo = mid + 1; } else hi = mid - 1;
    }
    const p = list[ans];
    if (o >= p.outOut) return p.srcOut;
    if (p.kind === "hold") return p.srcIn;
    return round3(p.srcIn + (o - p.outIn) * (p.rate || 1));
  }
  return { pieces: list, outDuration, srcToOutStart, srcToOutEnd, outToSrc };
}

export function asTimeMap(x) {
  if (!x) return createTimeMap([]);
  if (typeof x.srcToOutStart === "function") return x;
  if (Array.isArray(x)) return createTimeMap(x);
  if (Array.isArray(x.timeline?.pieces)) return createTimeMap(x.timeline.pieces);
  if (Array.isArray(x.pieces)) return createTimeMap(x.pieces);
  return createTimeMap([]);
}

// Old output time → the same source moment → new output time (snaps forward if now cut).
export function mapTime(timeMapOld, timeMapNew, t) {
  const oldTm = asTimeMap(timeMapOld);
  const newTm = asTimeMap(timeMapNew);
  const src = oldTm.outToSrc(Math.max(0, Number(t) || 0));
  return clamp(newTm.srcToOutStart(src), 0, newTm.outDuration);
}

// ---------------------------------------------------------------- resolution
function anchorSrc(anchor, words, item) {
  if (!anchor) return null;
  if (anchor.kind === "src") return { srcIn: anchor.srcIn, srcOut: anchor.srcOut };
  if (anchor.kind === "words") {
    const w0 = wordAt(words, anchor.w0), w1 = wordAt(words, anchor.w1);
    if (!w0 || !w1) return null;
    const off = item?.timingOffsets || {};
    return { srcIn: w0.start + (Number(off.offsetIn) || 0), srcOut: w1.end + (Number(off.offsetOut) || 0) };
  }
  return null;
}

export function resolveAnchor(anchor, timeMap, words, minDur = 2 * FRAME, prevResolved = null, item = null) {
  if (anchor?.kind === "out") {
    const outIn = round3(anchor.outIn), outOut = round3(Math.max(anchor.outIn, anchor.outOut));
    return { outIn, outOut, collapsed: outOut - outIn < minDur - EPS };
  }
  const src = anchorSrc(anchor, words, item);
  if (!src) return prevResolved || null;
  const outIn = timeMap.srcToOutStart(src.srcIn);
  const outOut = Math.max(outIn, timeMap.srcToOutEnd(src.srcOut));
  return { outIn: round3(outIn), outOut: round3(outOut), collapsed: outOut - outIn < minDur - EPS };
}

function hashString(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

const CAPTION_MAX_LINES = Object.freeze({ bold_pop: 1, clean: 2, karaoke_blob: 2, single_word: 1, minimal_lower: 2, brand_bar: 2 });

export function breakLines(texts, { styleId = "clean", maxWordsPerLine = 3, lang = "en" } = {}) {
  const joiner = NO_SPACE_LANGUAGES.includes(String(lang).split(/[-_]/)[0]) ? "" : " ";
  const list = arr(texts).filter((t) => t !== "");
  if (!list.length) return [];
  const maxLines = CAPTION_MAX_LINES[styleId] || 2;
  const perLine = Math.max(Number(maxWordsPerLine) || 1, Math.ceil(list.length / maxLines));
  const lines = [];
  for (let k = 0; k < list.length; k += perLine) lines.push(list.slice(k, k + perLine).join(joiner));
  return lines;
}

function resolveCue(cue, tm, lang) {
  const words = arr(cue.words).map((w) => {
    const outStart = tm.srcToOutStart(w.srcStart);
    const outEnd = Math.max(outStart, tm.srcToOutEnd(w.srcEnd));
    const collapsed = outEnd - outStart < 0.001;
    return { ...w, outStart: round3(outStart), outEnd: round3(outEnd), collapsed };
  });
  const visible = words.filter((w) => !w.collapsed);
  const resolved = visible.length
    ? { outIn: visible[0].outStart, outOut: visible[visible.length - 1].outEnd, collapsed: visible[visible.length - 1].outEnd - visible[0].outStart < MIN_DUR.cue - EPS }
    : { outIn: words[0]?.outStart ?? 0, outOut: words[0]?.outStart ?? 0, collapsed: true };
  const joiner = NO_SPACE_LANGUAGES.includes(String(lang).split(/[-_]/)[0]) ? "" : " ";
  return { ...cue, words, resolved, text: visible.length ? visible.map((w) => w.text).join(joiner) : cue.text };
}

// Recompute timeline + every `resolved` from anchors (EDIT_PLAN.md §4, client subset).
export function resolvePlanLocal(plan, ctx = {}) {
  if (!plan) return plan;
  const words = arr(ctx.words);
  const built = buildPieces(plan, ctx);
  const tm = createTimeMap(built.pieces);
  const lang = plan.captions?.language || plan.source?.language || "en";
  const next = {
    ...plan,
    timeline: { pieces: built.pieces, outDurationSec: built.outDurationSec, mapHash: hashString(built.pieces.map((p) => p.chunkKey).join("|")) },
  };
  const re = (item, minDur) => ({ ...item, resolved: resolveAnchor(item.anchor, tm, words, minDur, item.resolved, item) || item.resolved });

  if (plan.aRoll) next.aRoll = { ...plan.aRoll, segments: arr(plan.aRoll.segments).map((s) => re(s, MIN_DUR.segment)) };
  next.broll = arr(plan.broll).map((b) => re(b, MIN_DUR.broll));
  next.effects = arr(plan.effects).map((e) => re(e, MIN_DUR.effect));
  next.graphics = arr(plan.graphics).map((g) => re(g, MIN_DUR.graphic));
  if (plan.captions) next.captions = { ...plan.captions, cues: arr(plan.captions.cues).map((c) => resolveCue(c, tm, lang)) };

  const elementRange = (id) => {
    for (const kind of ["broll", "graphic", "effect", "segment"]) {
      const it = findItem(next, kind, id);
      if (it?.resolved) return it.resolved;
    }
    return null;
  };
  next.sfx = arr(plan.sfx).map((s) => {
    const r = s.anchor?.elementId ? elementRange(s.anchor.elementId) : null;
    if (!r) return s;
    const at = (s.anchor.edge === "out" ? r.outOut : r.outIn) + (Number(s.anchor.offsetSec) || 0);
    return { ...s, resolved: { outAt: round3(clamp(at, 0, built.outDurationSec)) } };
  });
  next.transitions = arr(plan.transitions).map((t) => {
    if (t.at?.elementId) {
      const r = elementRange(t.at.elementId);
      return r ? { ...t, resolved: { outAt: r.outOut } } : t;
    }
    return t;
  });
  return next;
}

export function planTimeMap(plan) {
  return createTimeMap(arr(plan?.timeline?.pieces));
}

export function outDuration(plan) {
  return Number(plan?.timeline?.outDurationSec) || planTimeMap(plan).outDuration || 0;
}

// ---------------------------------------------------------------- ranges & items
export function itemRange(plan, kind, item) {
  if (!item) return null;
  const dur = outDuration(plan);
  switch (kind) {
    case "cut": {
      const tm = planTimeMap(plan);
      const at = tm.srcToOutStart(item.srcIn);
      return { outIn: at, outOut: at, collapsed: false };
    }
    case "sfx": {
      const at = item.resolved?.outAt ?? 0;
      return { outIn: at, outOut: Math.min(dur, at + 0.4), collapsed: false };
    }
    case "transition": {
      const at = item.resolved?.outAt ?? item.at?.outAt ?? 0;
      return { outIn: at, outOut: at, collapsed: false };
    }
    case "music":
    case "logo":
      return { outIn: 0, outOut: dur, collapsed: false };
    default:
      return item.resolved || null;
  }
}

const isShown = (kind, it) => {
  if (!it) return false;
  if (it.resolved?.collapsed) return false;
  if (kind === "broll") return it.status !== "removed";
  if (kind === "caption") return !it.hidden;
  return true;
};

// Items whose output span contains t (removed / collapsed items excluded).
export function itemsAt(plan, t) {
  if (!plan) return [];
  const hits = [];
  const add = (kind, list) => {
    for (const it of arr(list)) {
      if (!isShown(kind, it)) continue;
      const r = itemRange(plan, kind, it);
      if (r && t >= r.outIn - EPS && t < r.outOut + EPS) hits.push({ kind, id: it.id, outIn: r.outIn, outOut: r.outOut, item: it });
    }
  };
  add("segment", plan.aRoll?.segments);
  add("broll", plan.broll);
  add("effect", arr(plan.effects).filter((e) => e.enabled !== false));
  add("graphic", arr(plan.graphics).filter((g) => g.enabled !== false));
  add("caption", plan.captions?.enabled === false ? [] : plan.captions?.cues);
  add("sfx", arr(plan.sfx).filter((s) => s.enabled !== false));
  return hits;
}

const KIND_ORDER = { segment: 0, broll: 1, graphic: 2, effect: 3, caption: 4, sfx: 5, cut: 6 };

// Ordered selectable items for [ / ] navigation.
export function listItems(plan, { kinds = ["broll", "graphic", "effect", "caption", "sfx", "cut"] } = {}) {
  if (!plan) return [];
  const out = [];
  const lists = { broll: plan.broll, graphic: plan.graphics, effect: plan.effects, caption: plan.captions?.cues, sfx: plan.sfx, cut: plan.cuts, segment: plan.aRoll?.segments };
  for (const kind of kinds) {
    for (const it of arr(lists[kind])) {
      const r = itemRange(plan, kind, it);
      if (!r || (r.collapsed && kind !== "cut")) continue;
      out.push({ kind, id: it.id, outIn: r.outIn, outOut: r.outOut });
    }
  }
  return out.sort((a, b) => a.outIn - b.outIn || KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
}

export function neighborItem(plan, selection, dir = 1, t = 0) {
  const list = listItems(plan);
  if (!list.length) return null;
  const idx = selection ? list.findIndex((x) => x.kind === selection.kind && x.id === selection.id) : -1;
  if (idx === -1) {
    if (dir > 0) return list.find((x) => x.outIn > t + EPS) || list[0];
    return [...list].reverse().find((x) => x.outIn < t - EPS) || list[list.length - 1];
  }
  const next = idx + (dir > 0 ? 1 : -1);
  return list[clamp(next, 0, list.length - 1)];
}

// Transcript words the item is anchored to, as inclusive srcWordIndex range [w0, w1] or null.
export function anchoredWords(plan, kind, item) {
  if (!item) return null;
  if (kind === "caption") {
    const idx = arr(item.words).map((w) => w.i).filter(Number.isInteger);
    if (idx.length) return [Math.min(...idx), Math.max(...idx)];
  }
  if (item.anchor?.kind === "words") return [item.anchor.w0, item.anchor.w1];
  if (Array.isArray(item.wordRange)) return [item.wordRange[0], item.wordRange[1]];
  if (Array.isArray(item.evidence?.wordRange)) return [item.evidence.wordRange[0], item.evidence.wordRange[1]];
  if (kind === "sfx" && item.anchor?.elementId) {
    const k = kindOfId(plan, item.anchor.elementId);
    return k ? anchoredWords(plan, k, findItem(plan, k, item.anchor.elementId)) : null;
  }
  return null;
}

// Per-word output projection, aligned by transcript index: [{ i, outStart, outEnd, cut }].
export function projectWords(plan, words) {
  const tm = planTimeMap(plan);
  const built = buildPieces(plan, { words });
  const active = arr(plan?.cuts).filter((c) => built.activeCutIds.includes(c.id));
  return arr(words).map((w) => {
    const mid = (w.start + w.end) / 2;
    const inCut = active.some((c) => mid >= c.srcIn - EPS && mid <= c.srcOut + EPS);
    const outStart = tm.srcToOutStart(w.start);
    const outEnd = Math.max(outStart, tm.srcToOutEnd(w.end));
    return { i: w.i ?? null, outStart: round3(outStart), outEnd: round3(outEnd), cut: inCut || outEnd - outStart < 0.001 };
  });
}

// The spoken word at output time t, or null (binary search over kept words).
export function wordAtOut(projectedOrPlan, wordsOrT, maybeT) {
  const projected = maybeT === undefined ? projectedOrPlan : projectWords(projectedOrPlan, wordsOrT);
  const t = maybeT === undefined ? wordsOrT : maybeT;
  const kept = arr(projected).filter((p) => p && !p.cut);
  let lo = 0, hi = kept.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (kept[mid].outStart <= t + EPS) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  if (ans === -1) return null;
  const w = kept[ans];
  return t <= w.outEnd + 0.12 ? w : null;
}

export function cutForWord(plan, i, words) {
  const w = wordAt(words, i);
  if (!w || !plan) return null;
  const built = buildPieces(plan, { words });
  const mid = (w.start + w.end) / 2;
  const hit = arr(plan.cuts).filter((c) => mid >= c.srcIn - EPS && mid <= c.srcOut + EPS);
  return hit.find((c) => built.activeCutIds.includes(c.id)) || null;
}

export function cueForWord(plan, i) {
  return arr(plan?.captions?.cues).find((c) => arr(c.words).some((w) => w.i === i)) || null;
}

// ---------------------------------------------------------------- outline & summary
export function outline(plan, ctx = {}) {
  if (!plan) return null;
  const dur = outDuration(plan);
  const built = buildPieces(plan, ctx);
  const active = new Set(built.activeCutIds);
  const activeCuts = arr(plan.cuts).filter((c) => active.has(c.id));
  const enabled = (x) => x.enabled !== false && !x.resolved?.collapsed;
  const effects = arr(plan.effects);
  const segmentEffects = (s) => effects
    .filter((e) => enabled(e) && e.resolved && s.resolved && e.resolved.outIn >= s.resolved.outIn - EPS && e.resolved.outIn < s.resolved.outOut)
    .map((e) => e.kind);
  const cues = arr(plan.captions?.cues).filter((c) => !c.hidden && !c.resolved?.collapsed);
  const logo = plan.branding?.logo;
  const silence = activeCuts
    .filter((c) => c.kind === "SILENCE")
    .reduce((sum, c) => sum + Math.max(0, Math.min(built.tail, floorFrame(c.srcOut)) - Math.max(built.head, ceilFrame(c.srcIn))), 0);

  return {
    duration: dur,
    aRoll: arr(plan.aRoll?.segments).map((s) => ({ id: s.id, type: s.type, outIn: s.resolved?.outIn ?? 0, outOut: s.resolved?.outOut ?? 0, label: s.label, effects: segmentEffects(s) })),
    tracks: {
      captions: { enabled: plan.captions?.enabled !== false, styleId: plan.captions?.styleId || null, cueCount: cues.length },
      broll: arr(plan.broll).map((b) => ({ id: b.id, ordinal: b.ordinal, outIn: b.resolved?.outIn ?? 0, outOut: b.resolved?.outOut ?? 0, layout: b.layout, status: b.status })),
      effects: effects.map((e) => ({ id: e.id, kind: e.kind, outIn: e.resolved?.outIn ?? 0, outOut: e.resolved?.outOut ?? 0, enabled: e.enabled !== false })),
      music: plan.music ? { enabled: plan.music.enabled !== false, title: plan.music.track?.title || null, outIn: 0, outOut: dur } : null,
      sfx: arr(plan.sfx).map((s) => ({ id: s.id, cue: s.cue, outAt: s.resolved?.outAt ?? 0, enabled: s.enabled !== false })),
      branding: { logo: !!logo && logo.show !== "none", palette: plan.branding?.palette || null },
      transitions: arr(plan.transitions).map((t) => ({ id: t.id, kind: t.kind, outAt: t.resolved?.outAt ?? t.at?.outAt ?? 0 })),
    },
    summary: {
      captions: plan.captions?.enabled !== false && cues.length > 0,
      brollCount: arr(plan.broll).filter((b) => (b.status === "ok" || b.status === "pending") && !b.resolved?.collapsed).length,
      punchIns: effects.filter((e) => (e.kind === "PUNCH_IN" || e.kind === "ZOOM_EMPHASIS") && enabled(e)).length,
      jumpCuts: effects.filter((e) => e.kind === "JUMP_ZOOM" && enabled(e)).length,
      fillersRemoved: activeCuts.filter((c) => c.kind === "FILLER").length,
      silenceRemovedSec: Math.round(silence * 10) / 10,
      music: !!plan.music && plan.music.enabled !== false && plan.settings?.musicEnabled !== false,
      logo: !!logo && logo.show !== "none",
      hookTitle: arr(plan.graphics).some((g) => g.kind === "HOOK_TITLE" && enabled(g)),
    },
  };
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// AI EDIT SUMMARY chips from outline.summary. Each: { key, panel, on, glyph, text, label }.
export function summarize(outlineValue, { qaCount = 0 } = {}) {
  const s = outlineValue?.summary;
  if (!s) return [];
  const chip = (key, panel, on, onText, offText) => ({ key, panel, on: !!on, glyph: on ? "✓" : "○", text: on ? onText : offText, label: `${on ? "✓" : "○"} ${on ? onText : offText}` });
  const chips = [
    chip("captions", "captions", s.captions, "CAPTIONS", "CAPTIONS OFF"),
    chip("broll", "broll", s.brollCount > 0, plural(s.brollCount, "B-ROLL", "B-ROLLS"), "NO B-ROLL"),
    chip("punchIns", "effects", s.punchIns > 0, plural(s.punchIns, "PUNCH-IN", "PUNCH-INS"), "NO PUNCH-INS"),
    chip("jumpCuts", "effects", s.jumpCuts > 0, plural(s.jumpCuts, "JUMP CUT", "JUMP CUTS"), "NO JUMP CUTS"),
    chip("fillers", "transcript", s.fillersRemoved > 0, `${plural(s.fillersRemoved, "FILLER", "FILLERS")} OUT`, "FILLERS KEPT"),
    chip("silence", "transcript", s.silenceRemovedSec > 0, `${Math.round(s.silenceRemovedSec)}S SILENCE OUT`, "SILENCE KEPT"),
    chip("music", "audio", s.music, "MUSIC", "MUSIC OFF"),
    chip("logo", "branding", s.logo, "LOGO", "NO LOGO"),
    chip("hookTitle", "effects", s.hookTitle, "HOOK TITLE", "NO HOOK TITLE"),
  ];
  if (qaCount > 0) chips.push({ key: "qa", panel: null, on: false, glyph: "⚠", text: String(qaCount), label: `⚠ ${qaCount}`, warn: true });
  return chips;
}

// ---------------------------------------------------------------- caption re-timing (§5)
const JOINER_RE = /^[-‐‑'’/._@&+]+$/u;
const segmenterCache = new Map();
function getSegmenter(lang) {
  if (typeof Intl === "undefined" || typeof Intl.Segmenter !== "function") return null;
  const key = lang || "und";
  if (!segmenterCache.has(key)) {
    try { segmenterCache.set(key, new Intl.Segmenter(lang || undefined, { granularity: "word" })); }
    catch { segmenterCache.set(key, new Intl.Segmenter(undefined, { granularity: "word" })); }
  }
  return segmenterCache.get(key);
}

function rawSegments(text, lang) {
  const seg = getSegmenter(lang);
  if (seg) return [...seg.segment(text)].map((s) => ({ s: s.segment, word: !!s.isWordLike || /[\p{L}\p{N}]/u.test(s.segment) && !/^\s+$/u.test(s.segment) }));
  const out = [];
  for (const m of text.matchAll(/(\s+)|([\p{L}\p{N}]+(?:['’][\p{L}]+)*)|([^\s\p{L}\p{N}]+)/gu)) {
    out.push({ s: m[0], word: !!m[2] });
  }
  return out;
}

export const normToken = (t) => String(t ?? "").normalize("NFKC").toLowerCase().replace(/[\p{P}\s]/gu, "");

// Display tokens: word-like runs with trailing punctuation attached to the previous token,
// leading punctuation (“ ¿) attached to the next, joiners (sign-ups, 3/4) kept inside one token.
export function tokenize(text, lang = "en") {
  const s = String(text ?? "").normalize("NFC").trim();
  if (!s) return [];
  const segs = rawSegments(s, lang);
  const tokens = [];
  let sawSpace = true;
  let lastJoinable = false;
  let lead = "";
  for (let k = 0; k < segs.length; k++) {
    const { s: piece, word } = segs[k];
    if (/^\s+$/u.test(piece)) { sawSpace = true; lastJoinable = false; continue; }
    if (word) {
      if (tokens.length && !sawSpace && lastJoinable) tokens[tokens.length - 1] += lead + piece;
      else tokens.push(lead + piece);
      lead = "";
      sawSpace = false;
      lastJoinable = false;
      continue;
    }
    const nextIsWordNoSpace = segs[k + 1] && segs[k + 1].word;
    if (tokens.length && !sawSpace) {
      tokens[tokens.length - 1] += piece;
      lastJoinable = JOINER_RE.test(piece) && !!nextIsWordNoSpace;
    } else if (nextIsWordNoSpace) {
      lead += piece;
    } else if (tokens.length) {
      tokens[tokens.length - 1] += ` ${piece}`;
      lastJoinable = false;
      sawSpace = false;
    } else {
      lead += piece;
    }
  }
  if (lead) {
    if (tokens.length) tokens[tokens.length - 1] += lead;
    else tokens.push(lead);
  }
  return tokens;
}

function lcsOps(a, b) {
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const ops = [];
  let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) { ops.push({ op: "eq", a: i++, b: j++ }); }
    else if (j < m && (i >= n || dp[i][j + 1] > dp[i + 1][j])) { ops.push({ op: "ins", b: j++ }); }
    else { ops.push({ op: "del", a: i++ }); }
  }
  return ops;
}

// Split [start, end] across tokens proportional to character length, each ≥ minEach when it fits.
function splitSpan(start, end, texts, minEach = 0.08) {
  const n = texts.length;
  const total = Math.max(0, end - start);
  const chars = texts.map((t) => Math.max(1, [...normToken(t) || t].length));
  let durs;
  if (total >= minEach * n - EPS) {
    durs = new Array(n).fill(0);
    const fixed = new Set();
    for (let pass = 0; pass <= n; pass++) {
      const freeChars = chars.reduce((s, c, k) => (fixed.has(k) ? s : s + c), 0);
      const freeTotal = total - fixed.size * minEach;
      let changed = false;
      for (let k = 0; k < n; k++) {
        if (fixed.has(k)) { durs[k] = minEach; continue; }
        durs[k] = freeChars > 0 ? (freeTotal * chars[k]) / freeChars : freeTotal / (n - fixed.size);
        if (durs[k] < minEach - EPS) { fixed.add(k); changed = true; }
      }
      if (!changed) break;
    }
  } else {
    const sumChars = chars.reduce((s, c) => s + c, 0);
    durs = chars.map((c) => (total * c) / sumChars);
  }
  const out = [];
  let t = start;
  for (let k = 0; k < n; k++) {
    const s0 = t;
    t = k === n - 1 ? end : t + durs[k];
    out.push([s0, t]);
  }
  return out;
}

// retimeCaption(cue, newText, ctx) → { ok:true, text, lines, words, overrides, srcStart, srcEnd, changed }
//                                   | { ok:false, code, reason }
// ctx: { lang, words? (transcript, for override pruning), prevEnd?, nextStart?, styleId?, maxWordsPerLine?, takenKeys? }
export function retimeCaption(cue, newText, ctx = {}) {
  const lang = ctx.lang || "en";
  const oldWords = arr(cue?.words).filter((w) => !w.collapsed);
  const text = String(newText ?? "").trim();
  if (!oldWords.length) return { ok: false, code: "EMPTY_CUE", reason: "This caption has no words left to edit." };
  if (!text) return { ok: false, code: "ALL_DELETED", reason: "Nothing left — use Hide caption instead." };
  if ([...text].length > 120) return { ok: false, code: "TOO_LONG", reason: "Captions can be up to 120 characters." };
  const tokens = tokenize(text, lang);
  const norms = tokens.map(normToken);
  if (!tokens.length || norms.every((n) => n === "")) return { ok: false, code: "PUNCTUATION_ONLY", reason: "A caption needs at least one word." };
  if (tokens.length > oldWords.length * 2 + 4) return { ok: false, code: "TOO_MANY_WORDS", reason: `That's too many new words for this moment — keep it under ${oldWords.length * 2 + 5}.` };

  const winStart = Math.max(oldWords[0].srcStart, Number.isFinite(ctx.prevEnd) ? ctx.prevEnd : -Infinity);
  const winEnd = Math.min(oldWords[oldWords.length - 1].srcEnd, Number.isFinite(ctx.nextStart) ? ctx.nextStart : Infinity);
  const oldNorms = oldWords.map((w) => normToken(w.text));
  const ops = lcsOps(oldNorms, norms);

  // Mutable timing copies of the old words (borrowing may move a neighbour's edge).
  const timing = oldWords.map((w) => ({ srcStart: w.srcStart, srcEnd: w.srcEnd }));
  const placed = [];
  const hidden = [];
  const removedInsertionKeys = [];
  const wordText = {};
  const insertions = [];
  const taken = new Set(arr(ctx.takenKeys));
  for (const w of oldWords) if (w.key) taken.add(w.key);
  const firstSourceIdx = oldWords.find((w) => Number.isInteger(w.i))?.i;
  const cueStartAfter = Number.isInteger(cue?.anchor?.w0) ? cue.anchor.w0 - 1 : (Number.isInteger(firstSourceIdx) ? firstSourceIdx - 1 : -1);

  const afterIndexOf = (entry) => (entry ? (Number.isInteger(entry.i) ? entry.i : entry.afterWordIndex) : cueStartAfter);
  const nextOrder = (after) => insertions.filter((x) => x.afterWordIndex === after).length + 1;
  const newKey = (after, order) => {
    let o = order;
    let key = `x${after}_${o}`;
    while (taken.has(key)) { o += 1; key = `x${after}_${o}`; }
    taken.add(key);
    return key;
  };
  const originalText = (w) => (Number.isInteger(w.i) && ctx.words ? wordAt(ctx.words, w.i)?.text : null);

  const placeSource = (oldIdx, tokenIdx, kind, span) => {
    const w = oldWords[oldIdx];
    const t = tokens[tokenIdx];
    const entry = {
      key: w.key || (Number.isInteger(w.i) ? `w${w.i}` : `x${cueStartAfter}_1`),
      i: Number.isInteger(w.i) ? w.i : null,
      afterWordIndex: Number.isInteger(w.i) ? undefined : w.afterWordIndex,
      text: t,
      srcStart: span ? span[0] : timing[oldIdx].srcStart,
      srcEnd: span ? span[1] : timing[oldIdx].srcEnd,
      emphasis: !!w.emphasis,
      conf: w.conf ?? null,
      kind,
      oldIdx,
    };
    if (entry.i !== null) {
      const orig = originalText(w);
      if (orig == null ? t !== w.text || kind !== "equal" : t !== orig) wordText[entry.i] = t;
    } else {
      insertions.push({ key: entry.key, afterWordIndex: entry.afterWordIndex ?? cueStartAfter, order: w.order ?? nextOrder(entry.afterWordIndex ?? cueStartAfter), text: t, srcStart: entry.srcStart, srcEnd: entry.srcEnd });
    }
    placed.push(entry);
    return entry;
  };
  const placeInsertion = (tokenIdx, span) => {
    const prev = placed[placed.length - 1];
    const after = afterIndexOf(prev);
    const order = nextOrder(after);
    const key = newKey(after, order);
    const entry = { key, i: null, afterWordIndex: after, text: tokens[tokenIdx], srcStart: span[0], srcEnd: span[1], emphasis: false, conf: null, kind: "insert" };
    insertions.push({ key, afterWordIndex: after, order, text: entry.text, srcStart: span[0], srcEnd: span[1] });
    placed.push(entry);
    return entry;
  };
  const drop = (oldIdx) => {
    const w = oldWords[oldIdx];
    if (Number.isInteger(w.i)) hidden.push(w.i);
    else if (w.key) removedInsertionKeys.push(w.key);
  };

  let k = 0;
  while (k < ops.length) {
    if (ops[k].op === "eq") { placeSource(ops[k].a, ops[k].b, "equal"); k++; continue; }
    const dels = [], ins = [];
    while (k < ops.length && ops[k].op !== "eq") {
      if (ops[k].op === "del") dels.push(ops[k].a); else ins.push(ops[k].b);
      k++;
    }
    const nextEq = ops[k] && ops[k].op === "eq" ? ops[k].a : null;

    if (dels.length && ins.length) {
      if (dels.length === ins.length) {
        dels.forEach((a, n) => placeSource(a, ins[n], "sub"));
      } else {
        const spanStart = timing[dels[0]].srcStart;
        const spanEnd = timing[dels[dels.length - 1]].srcEnd;
        const spans = splitSpan(spanStart, spanEnd, ins.map((b) => tokens[b]));
        placeSource(dels[0], ins[0], "sub", spans[0]);
        for (let d = 1; d < dels.length; d++) drop(dels[d]);
        for (let n = 1; n < ins.length; n++) placeInsertion(ins[n], spans[n]);
      }
    } else if (dels.length) {
      for (const a of dels) drop(a);
    } else if (ins.length) {
      const prev = placed[placed.length - 1] || null;
      const next = nextEq !== null ? timing[nextEq] : null;
      const need = 0.08 * ins.length;
      let regionStart = prev ? prev.srcEnd : winStart;
      let regionEnd = next ? next.srcStart : winEnd;
      const gap = regionEnd - regionStart;
      if (gap < need - EPS) {
        const cap = (x) => (x ? Math.max(0, (x.srcEnd - x.srcStart) - Math.max(0.6 * (x.srcEnd - x.srcStart), 0.08)) : 0);
        const prevMax = cap(prev), nextMax = cap(next);
        const deficit = need - Math.max(0, gap);
        let takePrev = Math.min(prevMax, deficit / 2);
        let takeNext = Math.min(nextMax, deficit / 2);
        let rest = deficit - takePrev - takeNext;
        if (rest > EPS) { const more = Math.min(prevMax - takePrev, rest); takePrev += more; rest -= more; }
        if (rest > EPS) { const more = Math.min(nextMax - takeNext, rest); takeNext += more; rest -= more; }
        if (rest <= EPS) {
          if (prev) prev.srcEnd -= takePrev;
          if (next) next.srcStart += takeNext;
          regionStart -= takePrev;
          regionEnd += takeNext;
        } else {
          const prevMid = prev ? (prev.srcStart + prev.srcEnd) / 2 : winStart;
          const nextMid = next ? (next.srcStart + next.srcEnd) / 2 : winEnd;
          if (prev) prev.srcEnd = prevMid;
          if (next) next.srcStart = nextMid;
          regionStart = prevMid;
          regionEnd = nextMid;
        }
      }
      const spans = splitSpan(regionStart, regionEnd, ins.map((b) => tokens[b]));
      ins.forEach((b, n) => placeInsertion(b, spans[n]));
    }
  }

  if (!placed.length) return { ok: false, code: "ALL_DELETED", reason: "Nothing left — use Hide caption instead." };

  // Step 7: monotonic, inside the window, never overlapping.
  let cursor = winStart;
  for (const e of placed) {
    e.srcStart = Math.max(e.srcStart, cursor);
    e.srcEnd = Math.min(Math.max(e.srcEnd, e.srcStart), winEnd);
    e.srcStart = Math.min(e.srcStart, e.srcEnd);
    cursor = e.srcEnd;
  }
  let limit = winEnd;
  for (let p = placed.length - 1; p >= 0; p--) {
    const e = placed[p];
    e.srcEnd = Math.min(e.srcEnd, limit);
    e.srcStart = Math.max(winStart, Math.min(e.srcStart, e.srcEnd));
    limit = e.srcStart;
  }
  let prevEnd = -Infinity;
  for (const e of placed) {
    e.srcStart = Math.max(round3(e.srcStart), prevEnd === -Infinity ? round3(winStart) : prevEnd);
    e.srcEnd = Math.max(e.srcStart, round3(e.srcEnd));
    prevEnd = e.srcEnd;
  }
  for (const ins of insertions) {
    const e = placed.find((x) => x.key === ins.key);
    if (e) { ins.srcStart = e.srcStart; ins.srcEnd = e.srcEnd; }
  }

  const joiner = NO_SPACE_LANGUAGES.includes(String(lang).split(/[-_]/)[0]) ? "" : " ";
  const outWords = placed.map((e) => ({ key: e.key, i: e.i, text: e.text, srcStart: e.srcStart, srcEnd: e.srcEnd, emphasis: e.emphasis, conf: e.conf, kind: e.kind, ...(e.i === null ? { afterWordIndex: e.afterWordIndex } : {}) }));
  const joined = outWords.map((w) => w.text).join(joiner);
  const changed = joined !== arr(cue.words).filter((w) => !w.collapsed).map((w) => w.text).join(joiner) || hidden.length > 0 || removedInsertionKeys.length > 0;
  return {
    ok: true,
    text: joined,
    lines: breakLines(outWords.map((w) => w.text), { styleId: ctx.styleId, maxWordsPerLine: ctx.maxWordsPerLine, lang }),
    words: outWords,
    overrides: { wordText, insertions, hiddenWords: hidden, removedInsertionKeys },
    srcStart: outWords[0].srcStart,
    srcEnd: outWords[outWords.length - 1].srcEnd,
    changed,
  };
}

// ---------------------------------------------------------------- ops metadata
// level: NONE | AUDIO | COMPOSITE | BASE | SHIFT (EDIT_PLAN.md §5). costHint: free | fetch | ai.
const M = (label, optimistic, level, extra = {}) => Object.freeze({ label, optimistic, level, costHint: "free", coalesceKey: null, ...extra });

export const OP_META = Object.freeze({
  "captions.setEnabled": M("Toggle captions", true, "COMPOSITE"),
  "caption.editText": M("Edit caption", true, "COMPOSITE"),
  "caption.hide": M("Hide caption", true, "COMPOSITE"),
  "caption.show": M("Show caption", true, "COMPOSITE"),
  "caption.setEmphasis": M("Emphasize word", true, "COMPOSITE"),
  "caption.setPosition": M("Move caption", true, "COMPOSITE", { coalesceKey: "caption.setPosition:{cueId}" }),
  "caption.rebuildFromWords": M("Rebuild captions", false, "COMPOSITE"),
  "captions.setStyle": M("Change caption style", true, "COMPOSITE"),
  "captions.setPosition": M("Move all captions", true, "COMPOSITE", { coalesceKey: "captions.setPosition" }),
  "captions.setLanguage": M("Change caption language", false, "COMPOSITE", { costHint: "ai" }),
  "cut.toggle": M("Toggle cut", true, "SHIFT"),
  "cut.adjust": M("Adjust cut", true, "SHIFT", { coalesceKey: "cut.adjust:{cutId}" }),
  "cut.add": M("Cut words", false, "SHIFT"),
  "cuts.restoreAll": M("Restore original", true, "SHIFT"),
  "settings.set": M("Change setting", true, "SHIFT"),
  "broll.replace": M("Replace B-roll", false, "COMPOSITE", { costHint: "fetch" }),
  "broll.regenerate": M("Regenerate B-roll", false, "COMPOSITE", { costHint: "fetch" }),
  "broll.remove": M("Remove B-roll", true, "COMPOSITE"),
  "broll.restore": M("Restore B-roll", true, "COMPOSITE"),
  "broll.setLayout": M("Change B-roll layout", true, "COMPOSITE"),
  "broll.setTiming": M("Retime B-roll", true, "COMPOSITE"),
  "broll.add": M("Add B-roll", false, "COMPOSITE", { costHint: "fetch" }),
  "broll.setLocked": M("Lock B-roll", true, "NONE"),
  "effect.toggle": M("Toggle effect", true, "BASE"),
  "effect.adjust": M("Adjust effect", true, "BASE", { coalesceKey: "effect.adjust:{id}" }),
  "transition.set": M("Change transition", true, "COMPOSITE"),
  "graphic.editText": M("Edit graphic text", true, "COMPOSITE"),
  "graphic.toggle": M("Toggle graphic", true, "COMPOSITE"),
  "music.change": M("Change music", false, "AUDIO", { costHint: "fetch" }),
  "music.remove": M("Remove music", true, "AUDIO"),
  "music.restore": M("Restore music", true, "AUDIO"),
  "music.setVolume": M("Music volume", true, "AUDIO", { coalesceKey: "music.setVolume" }),
  "music.setDucking": M("Music ducking", true, "AUDIO", { coalesceKey: "music.setDucking" }),
  "sfx.toggle": M("Toggle sound effect", true, "AUDIO"),
  "sfx.setVolume": M("Sound effect volume", true, "AUDIO", { coalesceKey: "sfx.setVolume:{id}" }),
  "sfx.muteAll": M("Mute all sound effects", true, "AUDIO"),
  "branding.setLogo": M("Set logo", false, "COMPOSITE"),
  "branding.removeLogo": M("Remove logo", true, "COMPOSITE"),
  "branding.setLogoPlacement": M("Move logo", true, "COMPOSITE", { coalesceKey: "branding.setLogoPlacement" }),
  "branding.setPalette": M("Change brand colours", true, "COMPOSITE"),
  "framing.adjust": M("Reframe shot", true, "BASE", { coalesceKey: "framing.adjust:{segmentId}" }),
  "framing.reset": M("Reset framing", true, "BASE"),
  "output.setAspect": M("Change format", false, "BASE"),
  "edit.setTitle": M("Rename edit", true, "NONE", { coalesceKey: "edit.setTitle" }),
});

export const OP_TYPES = Object.freeze(Object.keys(OP_META));

const SETTINGS_KEYS = Object.freeze({
  removeSilence: { type: "bool", level: "SHIFT", optimistic: true, label: "Remove silence" },
  silencePace: { type: ["natural", "fast", "extra_fast"], level: "SHIFT", optimistic: true, label: "Silence pace" },
  removeFillers: { type: ["off", "light", "aggressive"], level: "SHIFT", optimistic: true, label: "Remove fillers" },
  autoJumpCuts: { type: "bool", level: "SHIFT", optimistic: true, label: "Auto jump cuts" },
  punchInOnJumpCuts: { type: "bool", level: "BASE", optimistic: true, label: "Punch-in on jump cuts" },
  brollIntensity: { type: ["low", "medium", "high"], level: "COMPOSITE", optimistic: false, label: "B-roll amount", costHint: "fetch" },
  effectsEnabled: { type: "bool", level: "BASE", optimistic: true, label: "All effects" },
  effects: { type: ["subtle", "dynamic"], level: "BASE", optimistic: false, label: "Effects intensity" },
});
export const SETTINGS_SET_KEYS = Object.freeze(Object.keys(SETTINGS_KEYS));

// Meta for one concrete op (settings.set varies by key).
export function opMeta(op) {
  const base = OP_META[op?.type];
  if (!base) return null;
  if (op.type === "settings.set") {
    const k = SETTINGS_KEYS[op.key];
    if (!k) return { ...base, optimistic: false };
    return { ...base, label: k.label, level: k.level, optimistic: k.optimistic, costHint: k.costHint || "free" };
  }
  if (op.type === "captions.setLanguage") {
    return { ...base, costHint: op.language === "auto" ? "free" : "ai" };
  }
  if (op.type === "broll.regenerate") return { ...base, costHint: op.query ? "fetch" : "free" };
  if (op.type === "music.change") return { ...base, costHint: op.candidateId ? "free" : "fetch" };
  return base;
}

export function coalesceKeyFor(op) {
  const meta = OP_META[op?.type];
  if (!meta?.coalesceKey) return null;
  return meta.coalesceKey.replace(/\{(\w+)\}/g, (_, f) => String(op[f] ?? ""));
}

const ordinalOf = (plan, id) => findItem(plan, "broll", id)?.ordinal;
const EFFECT_NAMES = { PUNCH_IN: "punch-in", PUNCH_OUT: "punch-out", JUMP_ZOOM: "jump zoom", ZOOM_EMPHASIS: "zoom", REFRAME: "reframe", FREEZE: "freeze", SPEED: "speed ramp" };
const CUT_NAMES = { SILENCE: "silence", FILLER: "filler", REPEAT: "repeat", FALSE_START: "false start", RETAKE: "retake", JUMP_CUT: "jump cut", USER: "cut" };
const GRAPHIC_NAMES = { HOOK_TITLE: "hook title", KEYWORD: "keyword", STAT: "stat", LOWER_THIRD: "lower third", CTA: "call to action", LOGO_OUTRO: "logo outro" };

// Human label for undo/redo and toasts: "Remove B-roll #3", "Restore silence cut".
export function opLabel(op, plan) {
  const meta = opMeta(op);
  if (!meta) return "Change";
  switch (op.type) {
    case "broll.remove": case "broll.restore": case "broll.replace": case "broll.regenerate": case "broll.setLayout": case "broll.setTiming": {
      const n = ordinalOf(plan, op.id);
      return n != null ? `${meta.label} #${n}` : meta.label;
    }
    case "broll.setLocked": return `${op.locked ? "Lock" : "Unlock"} B-roll${ordinalOf(plan, op.id) != null ? ` #${ordinalOf(plan, op.id)}` : ""}`;
    case "cut.toggle": {
      const c = findItem(plan, "cut", op.cutId);
      return `${op.enabled ? "Cut" : "Restore"} ${CUT_NAMES[c?.kind] || "cut"}`;
    }
    case "captions.setEnabled": return op.enabled ? "Turn captions on" : "Turn captions off";
    case "effect.toggle": {
      const e = findItem(plan, "effect", op.id);
      return `Turn ${op.enabled ? "on" : "off"} ${EFFECT_NAMES[e?.kind] || "effect"}`;
    }
    case "graphic.toggle": {
      const g = findItem(plan, "graphic", op.id);
      return `Turn ${op.enabled ? "on" : "off"} ${GRAPHIC_NAMES[g?.kind] || "graphic"}`;
    }
    case "sfx.toggle": {
      const s = findItem(plan, "sfx", op.id);
      return `Turn ${op.enabled ? "on" : "off"} ${s?.cue || "sound effect"}`;
    }
    case "sfx.muteAll": return op.muted ? "Mute all sound effects" : "Unmute sound effects";
    case "settings.set": return `${meta.label}: ${typeof op.value === "boolean" ? (op.value ? "on" : "off") : String(op.value).replace(/_/g, " ")}`;
    default: return meta.label;
  }
}

// Element ids an op touches (for PENDING RENDER pills and 409 re-validation).
export function opTargets(op) {
  if (!op) return [];
  const t = op.type || "";
  if (op.id) return [op.id];
  if (op.cutId) return [op.cutId];
  if (op.cueId) return [op.cueId];
  if (op.segmentId) return [op.segmentId];
  if (t.startsWith("music.")) return ["music"];
  if (t.startsWith("branding.")) return ["logo"];
  if (t.startsWith("captions.")) return ["captions"];
  if (t === "cuts.restoreAll" || t === "cut.add") return ["cuts"];
  if (t === "sfx.muteAll") return ["sfx"];
  if (t === "settings.set") return [`settings.${op.key}`];
  if (t === "output.setAspect") return ["output"];
  if (t === "edit.setTitle") return ["title"];
  return [];
}

// ---------------------------------------------------------------- validation
const fail = (reason, field = null) => ({ ok: false, reason, field });
const OK = Object.freeze({ ok: true });
const inRange = (v, lo, hi) => typeof v === "number" && Number.isFinite(v) && v >= lo - EPS && v <= hi + EPS;
const isBool = (v) => typeof v === "boolean";
const HEX = /^#[0-9a-fA-F]{6}$/;
const GRAPHIC_LIMITS = { HOOK_TITLE: { title: 60 }, LOWER_THIRD: { title: 40, subtitle: 50 }, KEYWORD: { title: 48, subtitle: 48 }, STAT: { title: 48, subtitle: 48, value: 48 }, CTA: { title: 60, subtitle: 60 }, LOGO_OUTRO: { title: 48 } };

export function validateOp(op, plan, ctx = {}) {
  if (!op || typeof op !== "object" || !OP_META[op.type]) return fail("Unknown change.", "type");
  if (!plan) return fail("The edit isn't loaded yet.");
  const words = ctx.words;
  const need = (kind, id, field) => (findItem(plan, kind, id) ? null : fail("That item no longer exists in this edit.", field));

  switch (op.type) {
    case "captions.setEnabled": return isBool(op.enabled) ? OK : fail("enabled must be true or false", "enabled");
    case "caption.editText": {
      const cue = findItem(plan, "caption", op.cueId);
      if (!cue) return fail("That caption no longer exists in this edit.", "cueId");
      if (typeof op.text !== "string") return fail("Caption text is required.", "text");
      const r = retimeCaption(cue, op.text, { lang: plan.captions?.language || plan.source?.language, words });
      return r.ok ? OK : fail(r.reason, "text");
    }
    case "caption.hide": {
      const cue = findItem(plan, "caption", op.cueId);
      if (!cue) return fail("That caption no longer exists in this edit.", "cueId");
      return cue.hidden ? fail("That caption is already hidden.") : OK;
    }
    case "caption.show": {
      const cue = findItem(plan, "caption", op.cueId);
      if (!cue) return fail("That caption no longer exists in this edit.", "cueId");
      return cue.hidden ? OK : fail("That caption is already showing.");
    }
    case "caption.setEmphasis": {
      const cue = findItem(plan, "caption", op.cueId);
      if (!cue) return fail("That caption no longer exists in this edit.", "cueId");
      if (!arr(cue.words).some((w) => w.key === op.wordKey)) return fail("That word isn't in this caption.", "wordKey");
      return isBool(op.emphasis) ? OK : fail("emphasis must be true or false", "emphasis");
    }
    case "caption.setPosition":
      return need("caption", op.cueId, "cueId") || (op.y === null || inRange(op.y, 0, 1) ? OK : fail("Position must be between top and bottom.", "y"));
    case "caption.rebuildFromWords":
      return Array.isArray(op.range) && op.range.length === 2 && op.range[0] <= op.range[1] ? OK : fail("range must be [outIn, outOut]", "range");
    case "captions.setStyle":
      if (!CAPTION_MAX_LINES[op.styleId]) return fail("Unknown caption style.", "styleId");
      return op.maxWordsPerLine === undefined || [1, 2, 3].includes(op.maxWordsPerLine) ? OK : fail("Words per line must be 1, 2 or 3.", "maxWordsPerLine");
    case "captions.setPosition": return inRange(op.y, 0, 1) ? OK : fail("Position must be between top and bottom.", "y");
    case "captions.setLanguage":
      return op.language === "auto" || /^[a-z]{2}$/.test(String(op.language)) ? OK : fail("Unknown language.", "language");
    case "cut.toggle": {
      const c = findItem(plan, "cut", op.cutId);
      if (!c) return fail("That cut no longer exists in this edit.", "cutId");
      return isBool(op.enabled) ? OK : fail("enabled must be true or false", "enabled");
    }
    case "cut.adjust": {
      const c = findItem(plan, "cut", op.cutId);
      if (!c) return fail("That cut no longer exists in this edit.", "cutId");
      if (!inRange(op.padStart ?? 0, -0.3, 0.3)) return fail("Start nudge must be within ±0.3 s.", "padStart");
      if (!inRange(op.padEnd ?? 0, -0.3, 0.3)) return fail("End nudge must be within ±0.3 s.", "padEnd");
      const base = c.raw || c;
      const srcIn = base.srcIn + (op.padStart ?? 0), srcOut = base.srcOut + (op.padEnd ?? 0);
      if (srcOut - srcIn < 2 * FRAME) return fail("The cut would be empty.");
      if (Array.isArray(words)) {
        const [w0, w1] = Array.isArray(c.wordRange) ? c.wordRange : [Infinity, -Infinity];
        const crosses = words.some((w) => (w.i < w0 || w.i > w1) && (w.start + w.end) / 2 > srcIn && (w.start + w.end) / 2 < srcOut);
        if (crosses) return fail("That would cut into a word you're keeping.");
      }
      return OK;
    }
    case "cut.add": {
      const D = Number(plan.source?.durationSec) || Infinity;
      let srcIn = op.srcIn, srcOut = op.srcOut;
      if (Number.isInteger(op.w0) && Number.isInteger(op.w1)) {
        if (op.w1 < op.w0) return fail("Pick the words in order.");
        const a = wordAt(words, op.w0), b = wordAt(words, op.w1);
        if (words && (!a || !b)) return fail("Those words aren't in the transcript.");
        if (a && b) { srcIn = a.start; srcOut = b.end; }
      } else if (!(Number.isFinite(srcIn) && Number.isFinite(srcOut) && srcOut > srcIn)) {
        return fail("Pick words or a time range to cut.");
      }
      if (Number.isFinite(srcIn) && Number.isFinite(srcOut)) {
        if (srcOut - srcIn > 60) return fail("A single cut can be at most 60 seconds.");
        if (srcIn <= 0.2 && srcOut >= D - 0.2) return fail("You can't cut the whole take.");
      }
      return OK;
    }
    case "cuts.restoreAll":
      return op.kind === undefined || CUT_NAMES[op.kind] ? OK : fail("Unknown cut kind.", "kind");
    case "settings.set": {
      const spec = SETTINGS_KEYS[op.key];
      if (!spec) return fail("Unknown setting.", "key");
      if (spec.type === "bool") return isBool(op.value) ? OK : fail("value must be true or false", "value");
      return spec.type.includes(op.value) ? OK : fail("Unknown value.", "value");
    }
    case "broll.replace": {
      const b = findItem(plan, "broll", op.id);
      if (!b) return fail("That B-roll no longer exists in this edit.", "id");
      if (b.status === "removed") return fail("Restore this B-roll before replacing it.");
      return op.candidateId || op.assetId ? OK : fail("Pick a clip.", "candidateId");
    }
    case "broll.regenerate": {
      const b = findItem(plan, "broll", op.id);
      if (!b) return fail("That B-roll no longer exists in this edit.", "id");
      if (op.query !== undefined && (typeof op.query !== "string" || op.query.trim().length < 2 || op.query.trim().length > 80)) return fail("Search terms must be 2–80 characters.", "query");
      return OK;
    }
    case "broll.remove": {
      const b = findItem(plan, "broll", op.id);
      if (!b) return fail("That B-roll no longer exists in this edit.", "id");
      return b.status === "removed" ? fail("That B-roll is already removed.") : OK;
    }
    case "broll.restore": {
      const b = findItem(plan, "broll", op.id);
      if (!b) return fail("That B-roll no longer exists in this edit.", "id");
      return b.status === "removed" ? OK : fail("That B-roll isn't removed.");
    }
    case "broll.setLayout": {
      const b = findItem(plan, "broll", op.id);
      if (!b) return fail("That B-roll no longer exists in this edit.", "id");
      if (!["FULL", "PIP", "SPLIT"].includes(op.layout)) return fail("Unknown layout.", "layout");
      if (op.layout === "SPLIT" && plan.output?.aspect === "1:1") return fail("Split screen needs 9:16 or 16:9.", "layout");
      if (op.corner !== undefined && !["tl", "tr", "bl", "br"].includes(op.corner)) return fail("Unknown corner.", "corner");
      if (op.scale !== undefined && !inRange(op.scale, 0.3, 0.55)) return fail("Picture-in-picture size must be 30–55 %.", "scale");
      return OK;
    }
    case "broll.setTiming": {
      const b = findItem(plan, "broll", op.id);
      if (!b) return fail("That B-roll no longer exists in this edit.", "id");
      if (!Number.isInteger(op.w0) || !Number.isInteger(op.w1) || op.w1 < op.w0) return fail("Pick the words in order.");
      if (Array.isArray(words)) {
        const a = wordAt(words, op.w0), z = wordAt(words, op.w1);
        if (!a || !z) return fail("Those words aren't in the transcript.");
        const len = (z.end + (op.offsetOut || 0)) - (a.start + (op.offsetIn || 0));
        if (len < 1 - EPS || len > 8 + EPS) return fail("B-roll must last between 1 and 8 seconds.");
        const s0 = a.start + (op.offsetIn || 0), s1 = z.end + (op.offsetOut || 0);
        const overlap = arr(plan.broll).some((o) => {
          if (o.id === b.id || o.status === "removed" || o.anchor?.kind !== "words") return false;
          const oa = wordAt(words, o.anchor.w0), oz = wordAt(words, o.anchor.w1);
          return oa && oz && s0 < oz.end && s1 > oa.start;
        });
        if (overlap) return fail("That overlaps another B-roll.");
      }
      return OK;
    }
    case "broll.add":
      return typeof op.sentenceId === "string" && op.sentenceId ? OK : fail("Pick a line for the B-roll.", "sentenceId");
    case "broll.setLocked": return need("broll", op.id, "id") || (isBool(op.locked) ? OK : fail("locked must be true or false", "locked"));
    case "effect.toggle": return need("effect", op.id, "id") || (isBool(op.enabled) ? OK : fail("enabled must be true or false", "enabled"));
    case "effect.adjust": {
      if (!findItem(plan, "effect", op.id)) return fail("That effect no longer exists in this edit.", "id");
      if (op.zoom !== undefined && !inRange(op.zoom, 1.05, 1.4)) return fail("Zoom must be between 1.05× and 1.40×.", "zoom");
      if ((op.w0 !== undefined || op.w1 !== undefined) && Array.isArray(words)) {
        const a = wordAt(words, op.w0), z = wordAt(words, op.w1);
        if (!a || !z || z.end - a.start < 0.4 - EPS) return fail("An effect needs at least 0.4 s.");
      }
      return OK;
    }
    case "transition.set":
      return need("transition", op.id, "id") || (["CUT", "DIP_BLACK", "DIP_WHITE", "FLASH", "CROSSFADE"].includes(op.kind) ? OK : fail("Unknown transition.", "kind"));
    case "graphic.editText": {
      const g = findItem(plan, "graphic", op.id);
      if (!g) return fail("That graphic no longer exists in this edit.", "id");
      const lim = GRAPHIC_LIMITS[g.kind] || { title: 60, subtitle: 60, value: 48 };
      for (const f of ["title", "subtitle", "value"]) {
        if (op[f] === undefined) continue;
        if (typeof op[f] !== "string") return fail(`${f} must be text`, f);
        if (lim[f] === undefined) return fail(`This graphic has no ${f}.`, f);
        if ([...op[f]].length > lim[f]) return fail(`Keep it to ${lim[f]} characters.`, f);
      }
      if (op.title !== undefined && !op.title.trim()) return fail("The title can't be empty — turn the graphic off instead.", "title");
      return OK;
    }
    case "graphic.toggle": return need("graphic", op.id, "id") || (isBool(op.enabled) ? OK : fail("enabled must be true or false", "enabled"));
    case "music.change":
      if (!plan.music && !op.query && !op.mood && !op.candidateId) return fail("Pick a track.");
      return op.candidateId || (typeof op.query === "string" && op.query.trim()) || (typeof op.mood === "string" && op.mood.trim()) ? OK : fail("Pick a track or a mood.");
    case "music.remove":
      if (!plan.music) return fail("There's no music to remove.");
      return plan.music.enabled === false ? fail("The music is already off.") : OK;
    case "music.restore":
      if (!plan.music) return fail("There's no music to restore.");
      return plan.music.enabled === false ? OK : fail("The music is already on.");
    case "music.setVolume":
      if (!plan.music) return fail("There's no music.");
      return inRange(op.volumeDb, -30, 0) ? OK : fail("Volume must be between −30 dB and 0 dB.", "volumeDb");
    case "music.setDucking":
      if (!plan.music) return fail("There's no music.");
      if (!isBool(op.enabled)) return fail("enabled must be true or false", "enabled");
      return op.depthDb === undefined || inRange(op.depthDb, -24, -3) ? OK : fail("Ducking depth must be between −24 dB and −3 dB.", "depthDb");
    case "sfx.toggle": return need("sfx", op.id, "id") || (isBool(op.enabled) ? OK : fail("enabled must be true or false", "enabled"));
    case "sfx.setVolume": return need("sfx", op.id, "id") || (inRange(op.volumeDb, -30, 6) ? OK : fail("Volume must be between −30 dB and +6 dB.", "volumeDb"));
    case "sfx.muteAll": return isBool(op.muted) ? OK : fail("muted must be true or false", "muted");
    case "branding.setLogo": return typeof op.assetId === "string" && op.assetId ? OK : fail("Upload a logo first.", "assetId");
    case "branding.removeLogo": return plan.branding?.logo ? OK : fail("There's no logo to remove.");
    case "branding.setLogoPlacement":
      if (!plan.branding?.logo) return fail("Add a logo first.");
      if (op.placement !== undefined && !["tl", "tr", "bl", "br"].includes(op.placement)) return fail("Unknown corner.", "placement");
      if (op.scale !== undefined && !inRange(op.scale, 0.08, 0.2)) return fail("Logo size must be 8–20 %.", "scale");
      if (op.opacity !== undefined && !inRange(op.opacity, 0.6, 1)) return fail("Logo opacity must be 60–100 %.", "opacity");
      return OK;
    case "branding.setPalette":
      if (!HEX.test(String(op.primary))) return fail("Colours must be #RRGGBB.", "primary");
      return op.accent === undefined || op.accent === null || HEX.test(String(op.accent)) ? OK : fail("Colours must be #RRGGBB.", "accent");
    case "framing.adjust":
      if (!findItem(plan, "segment", op.segmentId)) return fail("That shot no longer exists in this edit.", "segmentId");
      if (!inRange(op.offsetX ?? 0, -1, 1) || !inRange(op.offsetY ?? 0, -1, 1)) return fail("Offsets must be within the frame.", "offsetX");
      return inRange(op.zoom ?? 1, 1, 2) ? OK : fail("Zoom must be between 1× and 2×.", "zoom");
    case "framing.reset": return need("segment", op.segmentId, "segmentId") || OK;
    case "output.setAspect":
      if (!["9:16", "16:9", "1:1"].includes(op.aspect)) return fail("Unknown format.", "aspect");
      return op.aspect === plan.output?.aspect ? fail("The edit is already in that format.", "aspect") : OK;
    case "edit.setTitle": {
      const t = typeof op.title === "string" ? op.title.trim() : "";
      return t.length >= 1 && t.length <= 80 ? OK : fail("Titles must be 1–80 characters.", "title");
    }
    default: return fail("Unknown change.", "type");
  }
}

// ---------------------------------------------------------------- local apply
const touch = (it) => (it && it.origin !== "user" ? { ...it, userModified: true } : { ...it });
const mapById = (list, id, fn) => arr(list).map((x) => (x.id === id ? fn(x) : x));
const RESOLVE_TYPES = new Set(["cut.toggle", "cut.adjust", "cuts.restoreAll", "settings.set", "broll.setTiming", "effect.adjust", "effect.toggle", "caption.editText"]);

// applyOpLocal(plan, op, ctx) → { ok, plan, reason? }. Only ops whose meta is optimistic change the
// plan; others return the plan unchanged with ok:true (the server's answer brings them in).
export function applyOpLocal(plan, op, ctx = {}) {
  const meta = opMeta(op);
  if (!plan || !meta) return { ok: false, plan, reason: "Unknown change." };
  if (!meta.optimistic) return { ok: true, plan, skipped: true };
  const v = validateOp(op, plan, ctx);
  if (!v.ok) return { ok: false, plan, reason: v.reason };

  let p = plan;
  switch (op.type) {
    case "captions.setEnabled":
      p = { ...p, captions: { ...p.captions, enabled: op.enabled }, settings: { ...p.settings, captionsEnabled: op.enabled } };
      break;
    case "caption.editText": {
      const cue = findItem(p, "caption", op.cueId);
      const lang = p.captions?.language || p.source?.language || "en";
      const cues = arr(p.captions?.cues);
      const idx = cues.findIndex((c) => c.id === op.cueId);
      const prevCue = cues[idx - 1], nextCue = cues[idx + 1];
      const lastWord = (c) => arr(c?.words).filter((w) => !w.collapsed).slice(-1)[0];
      const firstWord = (c) => arr(c?.words).find((w) => !w.collapsed);
      const takenKeys = cues.flatMap((c) => arr(c.words).map((w) => w.key));
      const r = retimeCaption(cue, op.text, {
        lang, words: ctx.words, styleId: p.captions?.styleId, maxWordsPerLine: p.settings?.maxWordsPerLine,
        prevEnd: lastWord(prevCue)?.srcEnd, nextStart: firstWord(nextCue)?.srcStart, takenKeys,
      });
      if (!r.ok) return { ok: false, plan, reason: r.reason };
      const ov = p.captions?.overrides || {};
      const cueKeys = new Set(arr(cue.words).map((w) => w.key));
      const insertions = arr(ov.insertions).filter((x) => !cueKeys.has(x.key) && !r.overrides.removedInsertionKeys.includes(x.key)).concat(r.overrides.insertions);
      const wordText = { ...(ov.wordText || {}) };
      for (const w of arr(cue.words)) if (Number.isInteger(w.i)) delete wordText[w.i];
      Object.assign(wordText, r.overrides.wordText);
      const hiddenWords = [...new Set([...arr(ov.hiddenWords), ...r.overrides.hiddenWords])].sort((a, b) => a - b);
      const collapsedKept = arr(cue.words).filter((w) => w.collapsed);
      const words = [...r.words, ...collapsedKept].sort((a, b) => a.srcStart - b.srcStart).map((w) => ({ ...w, emphasis: !!(ov.emphasis && ov.emphasis[w.key]) || !!w.emphasis }));
      const nextCueObj = { ...cue, words, text: r.text, lines: r.lines, edited: true };
      p = { ...p, captions: { ...p.captions, userEdited: true, overrides: { ...ov, wordText, insertions, hiddenWords }, cues: cues.map((c) => (c.id === op.cueId ? nextCueObj : c)) } };
      break;
    }
    case "caption.hide":
    case "caption.show": {
      const hidden = op.type === "caption.hide";
      const ov = p.captions?.overrides || {};
      const set = new Set(arr(ov.hiddenCues));
      if (hidden) set.add(op.cueId); else set.delete(op.cueId);
      p = { ...p, captions: { ...p.captions, userEdited: true, overrides: { ...ov, hiddenCues: [...set] }, cues: mapById(p.captions.cues, op.cueId, (c) => ({ ...c, hidden })) } };
      break;
    }
    case "caption.setEmphasis": {
      const ov = p.captions?.overrides || {};
      const emphasis = { ...(ov.emphasis || {}), [op.wordKey]: op.emphasis };
      p = { ...p, captions: { ...p.captions, userEdited: true, overrides: { ...ov, emphasis }, cues: mapById(p.captions.cues, op.cueId, (c) => ({ ...c, edited: true, words: arr(c.words).map((w) => (w.key === op.wordKey ? { ...w, emphasis: op.emphasis } : w)) })) } };
      break;
    }
    case "caption.setPosition": {
      const ov = p.captions?.overrides || {};
      const cueY = { ...(ov.cueY || {}) };
      if (op.y === null) delete cueY[op.cueId]; else cueY[op.cueId] = clamp(op.y, 0, 1);
      p = { ...p, captions: { ...p.captions, userEdited: true, overrides: { ...ov, cueY } } };
      break;
    }
    case "captions.setStyle": {
      const maxWordsPerLine = op.maxWordsPerLine ?? p.settings?.maxWordsPerLine ?? 2;
      const lang = p.captions?.language || "en";
      p = {
        ...p,
        settings: { ...p.settings, captionStyle: op.styleId, maxWordsPerLine },
        captions: { ...p.captions, styleId: op.styleId, cues: arr(p.captions?.cues).map((c) => ({ ...c, lines: breakLines(arr(c.words).filter((w) => !w.collapsed).map((w) => w.text), { styleId: op.styleId, maxWordsPerLine, lang }) })) },
      };
      break;
    }
    case "captions.setPosition":
      p = { ...p, captions: { ...p.captions, position: { ...(p.captions?.position || {}), yOverride: clamp(op.y, 0, 1) } } };
      break;
    case "cut.toggle":
      p = { ...p, cuts: mapById(p.cuts, op.cutId, (c) => ({ ...c, enabled: op.enabled, userToggled: true })) };
      break;
    case "cut.adjust":
      p = {
        ...p,
        cuts: mapById(p.cuts, op.cutId, (c) => {
          const base = c.raw || { srcIn: c.srcIn, srcOut: c.srcOut };
          return { ...c, raw: base, srcIn: round3(base.srcIn + (op.padStart ?? 0)), srcOut: round3(base.srcOut + (op.padEnd ?? 0)), snap: { ...(c.snap || {}), method: "none", padIn: op.padStart ?? 0, padOut: op.padEnd ?? 0 }, userToggled: true, enabled: true };
        }),
      };
      break;
    case "cuts.restoreAll":
      p = { ...p, cuts: arr(p.cuts).map((c) => (op.kind === undefined || c.kind === op.kind ? { ...c, enabled: false, userToggled: true } : c)) };
      break;
    case "settings.set":
      p = { ...p, settings: { ...p.settings, [op.key]: op.value } };
      break;
    case "broll.remove":
      p = { ...p, broll: mapById(p.broll, op.id, (b) => ({ ...touch(b), status: "removed", statusBeforeRemove: b.status })) };
      break;
    case "broll.restore":
      p = { ...p, broll: mapById(p.broll, op.id, (b) => ({ ...touch(b), status: b.statusBeforeRemove || (b.chosen ? "ok" : "missing") })) };
      break;
    case "broll.setLayout":
      p = { ...p, broll: mapById(p.broll, op.id, (b) => ({ ...touch(b), layout: op.layout, layoutParams: { ...(b.layoutParams || {}), ...(op.corner !== undefined ? { corner: op.corner } : {}), ...(op.scale !== undefined ? { scale: op.scale } : {}) } })) };
      break;
    case "broll.setTiming":
      p = { ...p, broll: mapById(p.broll, op.id, (b) => ({ ...touch(b), anchor: { kind: "words", w0: op.w0, w1: op.w1 }, timingOffsets: { offsetIn: op.offsetIn || 0, offsetOut: op.offsetOut || 0 } })) };
      break;
    case "broll.setLocked":
      p = { ...p, broll: mapById(p.broll, op.id, (b) => ({ ...b, locked: op.locked })) };
      break;
    case "effect.toggle":
      p = { ...p, effects: mapById(p.effects, op.id, (e) => ({ ...touch(e), enabled: op.enabled })) };
      break;
    case "effect.adjust":
      p = { ...p, effects: mapById(p.effects, op.id, (e) => ({ ...touch(e), ...(op.zoom !== undefined ? { zoom: op.zoom } : {}), ...(Number.isInteger(op.w0) && Number.isInteger(op.w1) ? { anchor: { kind: "words", w0: op.w0, w1: op.w1 } } : {}) })) };
      break;
    case "transition.set":
      p = { ...p, transitions: mapById(p.transitions, op.id, (t) => ({ ...touch(t), kind: op.kind })) };
      break;
    case "graphic.editText":
      p = { ...p, graphics: mapById(p.graphics, op.id, (g) => ({ ...touch(g), text: { ...(g.text || {}), ...(op.title !== undefined ? { title: op.title } : {}), ...(op.subtitle !== undefined ? { subtitle: op.subtitle } : {}), ...(op.value !== undefined ? { value: op.value } : {}) }, render: { ...(g.render || {}), status: "pending" } })) };
      break;
    case "graphic.toggle":
      p = { ...p, graphics: mapById(p.graphics, op.id, (g) => ({ ...touch(g), enabled: op.enabled })) };
      break;
    case "music.remove":
    case "music.restore":
      p = { ...p, music: { ...touch(p.music), enabled: op.type === "music.restore" }, settings: { ...p.settings, musicEnabled: op.type === "music.restore" } };
      break;
    case "music.setVolume":
      p = { ...p, music: { ...touch(p.music), volume: dbToGain(op.volumeDb) } };
      break;
    case "music.setDucking":
      p = { ...p, music: { ...touch(p.music), duck: { ...(p.music.duck || {}), enabled: op.enabled, ...(op.depthDb !== undefined ? { depthDb: op.depthDb } : {}) } } };
      break;
    case "sfx.toggle":
      p = { ...p, sfx: mapById(p.sfx, op.id, (s) => ({ ...touch(s), enabled: op.enabled })) };
      break;
    case "sfx.setVolume":
      p = { ...p, sfx: mapById(p.sfx, op.id, (s) => ({ ...touch(s), volume: dbToGain(op.volumeDb) })) };
      break;
    case "sfx.muteAll":
      p = { ...p, settings: { ...p.settings, sfxEnabled: !op.muted } };
      break;
    case "branding.removeLogo":
      p = { ...p, branding: { ...p.branding, logo: null } };
      break;
    case "branding.setLogoPlacement":
      p = { ...p, branding: { ...p.branding, logo: { ...p.branding.logo, ...(op.placement !== undefined ? { placement: op.placement } : {}), ...(op.scale !== undefined ? { scale: op.scale } : {}), ...(op.opacity !== undefined ? { opacity: op.opacity } : {}) } } };
      break;
    case "branding.setPalette":
      p = { ...p, branding: { ...p.branding, palette: { ...(p.branding?.palette || {}), primary: op.primary.toLowerCase(), ...(op.accent ? { accent: op.accent.toLowerCase() } : {}), source: "user" } }, settings: { ...p.settings, brandColors: [op.primary.toLowerCase(), ...(op.accent ? [op.accent.toLowerCase()] : [])] } };
      break;
    case "framing.adjust":
      p = { ...p, aRoll: { ...p.aRoll, segments: mapById(p.aRoll.segments, op.segmentId, (s) => ({ ...s, framing: { ...(s.framing || {}), mode: "static", locked: true, userCrop: { cx: round3(0.5 + (op.offsetX ?? 0) / 2), cy: round3(0.5 + (op.offsetY ?? 0) / 2), zoom: op.zoom ?? 1 } } })) } };
      break;
    case "framing.reset":
      p = { ...p, aRoll: { ...p.aRoll, segments: mapById(p.aRoll.segments, op.segmentId, (s) => { const framing = { ...(s.framing || {}), mode: "auto", locked: false }; delete framing.userCrop; return { ...s, framing }; }) } };
      break;
    case "edit.setTitle":
      p = { ...p, title: op.title.trim() };
      break;
    default:
      return { ok: true, plan, skipped: true };
  }
  if (RESOLVE_TYPES.has(op.type)) p = resolvePlanLocal(p, ctx);
  return { ok: true, plan: p };
}

export function applyOpsLocal(plan, ops, ctx = {}) {
  let p = plan;
  const failed = [];
  for (const op of arr(ops)) {
    const r = applyOpLocal(p, op, ctx);
    if (r.ok) p = r.plan; else failed.push({ op, reason: r.reason });
  }
  return { plan: p, failed };
}

// ---------------------------------------------------------------- dirty ranges & estimates
const LEVEL_RANK = { NONE: 0, AUDIO: 1, COMPOSITE: 2, BASE: 3, SHIFT: 4 };
export const maxLevel = (a, b) => ((LEVEL_RANK[a] ?? 0) >= (LEVEL_RANK[b] ?? 0) ? a : b);

// Client estimate of what an op invalidates: { level, ranges:[[outIn,outOut]] } (server's answer wins).
export function dirtyEstimate(op, plan) {
  const meta = opMeta(op);
  const dur = outDuration(plan);
  if (!meta || !plan) return { level: "NONE", ranges: [] };
  const all = [[0, dur]];
  const range = (kind, id) => {
    const it = findItem(plan, kind, id);
    const r = itemRange(plan, kind, it);
    return r ? [[r.outIn, Math.max(r.outOut, Math.min(dur, r.outIn + 0.1))]] : all;
  };
  switch (op.type) {
    case "caption.editText": case "caption.hide": case "caption.show": case "caption.setEmphasis": case "caption.setPosition":
      return { level: meta.level, ranges: range("caption", op.cueId) };
    case "broll.remove": case "broll.restore": case "broll.setLayout": case "broll.replace": case "broll.regenerate": case "broll.setTiming":
      return { level: op.type === "broll.setLayout" && op.layout === "SPLIT" ? "BASE" : meta.level, ranges: range("broll", op.id) };
    case "effect.toggle": case "effect.adjust": return { level: meta.level, ranges: range("effect", op.id) };
    case "graphic.editText": case "graphic.toggle": return { level: meta.level, ranges: range("graphic", op.id) };
    case "framing.adjust": case "framing.reset": return { level: meta.level, ranges: range("segment", op.segmentId) };
    case "cut.toggle": case "cut.adjust": {
      const r = range("cut", op.cutId)[0];
      return { level: "SHIFT", ranges: [[r[0], dur]] };
    }
    case "broll.setLocked": case "edit.setTitle": return { level: "NONE", ranges: [] };
    default: return { level: meta.level, ranges: meta.level === "NONE" ? [] : all };
  }
}

export function mergeRanges(ranges) {
  const list = arr(ranges).filter((r) => Array.isArray(r) && r.length === 2).map(([a, b]) => [Math.min(a, b), Math.max(a, b)]).sort((x, y) => x[0] - y[0]);
  const out = [];
  for (const r of list) {
    const last = out[out.length - 1];
    if (last && r[0] <= last[1] + 0.05) last[1] = Math.max(last[1], r[1]);
    else out.push([r[0], r[1]]);
  }
  return out;
}

// Seconds a preview update will roughly take for these invalidations ([{level, ranges}]).
export function estimatePreviewSec(dirty, plan, { aspectChange = false } = {}) {
  const list = arr(dirty);
  if (aspectChange) return 70;
  if (!list.length) return 0;
  const dur = outDuration(plan) || 30;
  let level = "NONE";
  for (const d of list) level = maxLevel(level, d.level);
  const covered = mergeRanges(list.flatMap((d) => d.ranges || [])).reduce((s, [a, b]) => s + (b - a), 0);
  const frac = Math.min(1, covered / dur);
  const est = { NONE: 0, AUDIO: 5, COMPOSITE: 8 + 12 * frac, BASE: 12 + 30 * frac, SHIFT: 15 + 25 * frac }[level] ?? 20;
  return Math.round(est);
}

export const isAudioOnly = (dirty) => arr(dirty).length > 0 && arr(dirty).every((d) => d.level === "AUDIO" || d.level === "NONE");
