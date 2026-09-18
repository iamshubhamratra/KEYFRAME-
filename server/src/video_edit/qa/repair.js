// VIDEO EDIT QA REPAIR — findings → plan ops (plan/ops.js payloads) and render-level actions (ENGINE.md §7 "Category → repair op").
//
// WHY THIS EXISTS. QA that only reports ships the defect anyway. Each lap turns what QA found into the
// SAME ops a person would send from the editor (so a repair is an ordinary, undoable revision with
// `createdBy:'qa-repair'`), plus the few fixes that are not plan changes at all (force re-encode a chunk,
// re-run post-processing, remux-trim). The mapping is TOTAL — every QaCategory has an entry, enforced by a
// test — so a new category can never silently fall out of the loop; "report only" is an explicit entry.
// Ops are chosen conservatively: user-locked items are never touched, one op per element per lap, caption
// rebuild ranges merged, and (when the caller passes the transcript) every op is dry-run through
// plan/ops.applyOps one at a time so a single stale op cannot abort the lead's atomic batch.
//
// CONTRACT:
//   REPAIRS { [QaCategory]: { label, plan(finding, rctx) -> { ops?, actions?, skip? } } }   (total over QA_CATEGORIES)
//   repairLabel(category, finding?) -> string   (the `repairOp` shown on report issues)
//   planRepairs(report, plan, ctx) -> { ops, renderActions, planned:[{ category, elementId, repairOp }], skipped:[{ category, elementId, reason }] }
//     report: a lap report (qa/index.runQa) — uses report.issues (with `data`), report.visionUnverified.
//     ctx: { words?, sentences?, faces?, content?, mezz?, candidates?:{[brollId]:AssetRef[]}, previous?:lapReport,
//            now?, layoutKinds?:{[id]:kind}, minSeverity?='minor', validate?=true (needs ctx.words) }
//     ops are plan/ops.js payloads ({ type, ...payload }); apply them with applyOps(plan, ops, { ...ctx, author:'qa-repair' })
//     (caption.rebuildFromWords is rejected unless author === 'qa-repair').
//     renderActions: [{ action:'rerender', level:'chunks'|'composite'|'post'|'remux', ranges:[[outIn,outOut]], ...extra }]
//       chunks  — force re-encode the A-roll chunks covering `ranges` (full:true = every chunk)
//       composite — rebuild overlays (elementIds, cardFallback:'ass' = draw these cards with the ASS fallback)
//       post    — re-run POST_PROCESSING (gainDb?, rebuildVoice?)
//       remux   — stream-copy remux trimmed to `trimToSec`
//   Vision-driven findings are ignored when report.visionUnverified (ENGINE.md §7).

const { STYLE_PRESETS } = require("../captions/styles");
const { bandsFor } = require("../captions/place");
const T = require("../plan/timeline");
const C = require("./common");

const { isPlain, r3 } = C;
const BOXED_STYLE = "minimal_lower";
const MAX_REBUILD_RANGES = 10;

const eligible = (x) => isPlain(x) && !x.locked;
const byId = (list, id) => (Array.isArray(list) ? list.find((x) => x && x.id === id) : null) || null;
const isCueId = (id) => /^c_[A-Za-z0-9_:-]{1,48}$/.test(String(id || ""));
const flipV = (corner) => `${corner[0] === "t" ? "b" : "t"}${corner[1]}`;

function kindOf(id, rctx) {
  if (!id) return null;
  if (rctx.layoutKinds && rctx.layoutKinds[id]) return rctx.layoutKinds[id];
  if (isCueId(id)) return "caption";
  if (/^br_/.test(id)) return "broll";
  if (/^gfx_/.test(id)) return "card";
  if (/^seg_/.test(id)) return "segment";
  if (/logo/i.test(id)) return "logo";
  return null;
}

function rangeOf(f, pad = 0.5) {
  const d = f.data || {};
  if (Array.isArray(d.range) && d.range.length === 2) return [d.range];
  if (Array.isArray(d.ranges) && d.ranges.length) return d.ranges.filter((r) => Array.isArray(r) && r.length === 2);
  if (Number.isFinite(f.atSec)) return [[Math.max(0, f.atSec - pad), f.atSec + pad]];
  return [];
}

function samePrevious(rctx, f, tol = 1.0) {
  const prev = rctx.previous && Array.isArray(rctx.previous.issues) ? rctx.previous.issues : [];
  return prev.some((p) => p && p.category === f.category && ((f.elementId && p.elementId === f.elementId)
    || (Number.isFinite(p.atSec) && Number.isFinite(f.atSec) && Math.abs(p.atSec - f.atSec) <= tol)));
}

// ---- caption helpers ------------------------------------------------------------------------------------
function cueOf(plan, id) { return byId(plan.captions && plan.captions.cues, id); }

function altCaptionY(plan, f) {
  const bands = bandsFor(plan.output && plan.output.aspect);
  const d = f.data || {};
  const cue = f.elementId ? cueOf(plan, f.elementId) : null;
  const curY = Number.isFinite(d.captionY) ? d.captionY : cue && cue.pos && Number.isFinite(cue.pos.y) ? cue.pos.y : bands.bottom.y;
  const atBottom = curY > 0.45;
  if (Number.isFinite(d.faceCy)) return d.faceCy < 0.5 ? bands.bottom.y : bands.top.y;
  return atBottom ? bands.top.y : bands.bottom.y;
}

function moveCaption(plan, f, y) {
  if (isCueId(f.elementId) && cueOf(plan, f.elementId)) return { ops: [{ type: "caption.setPosition", cueId: f.elementId, y: r3(y) }] };
  return { ops: [{ type: "captions.setPosition", y: r3(y) }] };
}

// ---- B-roll helpers -------------------------------------------------------------------------------------
function candidatesFor(item, rctx) {
  const extra = rctx.candidates && Array.isArray(rctx.candidates[item.id]) ? rctx.candidates[item.id] : [];
  const seen = new Set();
  const out = [];
  for (const c of [...(item.topCandidates || []), ...extra]) {
    if (!isPlain(c) || typeof c.assetId !== "string" || seen.has(c.assetId)) continue;
    seen.add(c.assetId);
    out.push(c);
  }
  return out;
}

function nextBestUnused(plan, item, rctx, avoidIssue) {
  const used = new Set(), usedHash = new Set();
  for (const b of plan.broll || []) {
    if (!b || b.status === "removed" || !b.chosen) continue;
    used.add(b.chosen.assetId);
    if (b.chosen.dhash) usedHash.add(b.chosen.dhash);
  }
  const seen = new Set(Array.isArray(item.seenCandidates) ? item.seenCandidates : []);
  const slot = item.resolved ? item.resolved.outOut - item.resolved.outIn : 0;
  const total = (c) => Number(c.scores && c.scores.total) || 0;
  return candidatesFor(item, rctx)
    .filter((c) => !used.has(c.assetId) && !seen.has(c.assetId) && !(c.dhash && usedHash.has(c.dhash)))
    .filter((c) => !(avoidIssue && c.scores && Array.isArray(c.scores.issues) && c.scores.issues.includes(avoidIssue)))
    .filter((c) => c.type === "image" || !Number.isFinite(c.durationSec) || c.durationSec - (Number(c.trimInSec) || 0) >= slot - 1e-3)
    .sort((a, b) => (b.path ? 1 : 0) - (a.path ? 1 : 0) || total(b) - total(a))[0] || null;
}

function replaceOrRemove(avoidIssue) {
  return (f, rctx) => {
    const item = byId(rctx.plan.broll, f.elementId);
    if (!item || item.status === "removed") return { skip: "no_broll" };
    if (!eligible(item)) return { skip: "locked" };
    const next = nextBestUnused(rctx.plan, item, rctx, avoidIssue);
    if (next) return { ops: [{ type: "broll.replace", id: item.id, candidateId: next.assetId }] };
    return { ops: [{ type: "broll.remove", id: item.id }] };
  };
}

// ---- card helpers ---------------------------------------------------------------------------------------
function cardRepair(f, rctx) {
  const g = byId(rctx.plan.graphics, f.elementId);
  if (!g) return { skip: "no_card" };
  if (samePrevious(rctx, f) && eligible(g)) return { ops: [{ type: "graphic.toggle", id: g.id, enabled: false }] };
  const r = g.resolved ? [[g.resolved.outIn, g.resolved.outOut]] : rangeOf(f);
  return { actions: [{ action: "rerender", level: "composite", ranges: r, elementIds: [g.id], cardFallback: "ass" }] };
}

// ---- overlay moves --------------------------------------------------------------------------------------
function moveOverlay(f, rctx) {
  const plan = rctx.plan;
  const d = f.data || {};
  const kind = d.kind || kindOf(f.elementId, rctx);
  const otherTop = d.otherBox ? d.otherBox.y + d.otherBox.h / 2 < 0.5 : null;
  if (kind === "logo") {
    const logo = plan.branding && plan.branding.logo;
    if (!logo) return { skip: "no_logo" };
    const cur = logo.placement || "tr";
    let placement = otherTop == null ? flipV(cur) : `${otherTop ? "b" : "t"}${cur[1]}`;
    if (placement === cur) placement = flipV(cur);
    const payload = { type: "branding.setLogoPlacement", placement, scale: logo.scale, opacity: logo.opacity };
    if (f.category === "TEXT_OFFSCREEN") {
      payload.placement = cur;
      payload.scale = r3(Math.max(0.08, logo.scale * 0.8));
      payload.marginPct = r3(Math.min(0.08, Math.max(0.06, (logo.marginPct || 0.04) + 0.02)));
    }
    return { ops: [payload] };
  }
  if (kind === "pip" || kind === "broll") {
    const item = byId(plan.broll, f.elementId);
    if (!item || item.status === "removed") return { skip: "no_broll" };
    if (!eligible(item)) return { skip: "locked" };
    if (item.layout !== "PIP") return f.category === "OVERLAY_COLLISION" ? { skip: "not_pip" } : { skip: "full_frame" };
    const cur = (item.layoutParams && item.layoutParams.corner) || "tr";
    const scale = Number(item.layoutParams && item.layoutParams.scale) || 0.4;
    if (f.category === "TEXT_OFFSCREEN") return { ops: [{ type: "broll.setLayout", id: item.id, layout: "PIP", corner: cur, scale: r3(Math.max(0.3, scale - 0.1)) }] };
    let corner = otherTop == null ? flipV(cur) : `${otherTop ? "b" : "t"}${cur[1]}`;
    if (corner === cur) corner = flipV(cur);
    return { ops: [{ type: "broll.setLayout", id: item.id, layout: "PIP", corner, scale }] };
  }
  if (kind === "caption") {
    if (f.category === "TEXT_OFFSCREEN") {
      const bands = bandsFor(plan.output && plan.output.aspect);
      const y = d.box && d.box.y + d.box.h / 2 < 0.5 ? bands.top.y : bands.bottom.y;
      return moveCaption(plan, f, y);
    }
    return moveCaption(plan, f, altCaptionY(plan, { ...f, data: { ...d, captionY: d.box ? d.box.y : undefined, faceCy: d.otherBox ? d.otherBox.y + d.otherBox.h / 2 : undefined } }));
  }
  if (kind === "card") {
    // No op moves a card between regions (gap vs ENGINE.md §7): move the other element when it can move,
    // else switch an AI card off.
    if (d.otherId && d.otherKind && d.otherKind !== "card") return moveOverlay({ ...f, elementId: d.otherId, data: { kind: d.otherKind, otherBox: d.box } }, rctx);
    const g = byId(plan.graphics, f.elementId);
    if (g && eligible(g) && g.origin !== "user" && !g.userModified) return { ops: [{ type: "graphic.toggle", id: g.id, enabled: false }] };
    return { skip: "card_region_unsupported" };
  }
  return { skip: "unknown_element" };
}

// ---- cuts -----------------------------------------------------------------------------------------------
function nudgeNearestCut(f, rctx) {
  const plan = rctx.plan;
  if (!plan.timeline || !Array.isArray(plan.timeline.pieces) || !Number.isFinite(f.atSec)) return null;
  const map = T.buildTimeMap(plan.timeline.pieces);
  let best = null;
  for (const c of plan.cuts || []) {
    if (!c || !T.isEffective(c, plan.settings || {}) || c.locked || !isPlain(c.raw)) continue;
    const at = map.srcToOutStart(c.srcOut);
    const dist = Math.abs(at - f.atSec);
    if (dist <= 1.5 && (!best || dist < best.dist)) best = { c, dist };
  }
  if (!best) return null;
  const c = best.c;
  const padStart = r3((c.srcIn - c.raw.srcIn) - C.FRAME_SEC), padEnd = r3((c.raw.srcOut - c.srcOut) - C.FRAME_SEC);
  if (Math.abs(padStart) > 0.3 || Math.abs(padEnd) > 0.3) return null;
  return { type: "cut.adjust", cutId: c.id, padStart, padEnd };
}

function reencodeThenNudge(f, rctx) {
  if (samePrevious(rctx, f)) {
    const op = nudgeNearestCut(f, rctx);
    if (op) return { ops: [op] };
  }
  return { actions: [{ action: "rerender", level: "chunks", ranges: rangeOf(f) }] };
}

// ---- the total mapping ----------------------------------------------------------------------------------
const reportOnly = (label) => ({ label, plan: () => ({ skip: "report_only" }) });

const REPAIRS = Object.freeze({
  CAPTION_UNREADABLE: {
    label: "captions.setStyle",
    plan(f, rctx) {
      const plan = rctx.plan;
      const styleId = (plan.captions && plan.captions.styleId) || (plan.settings && plan.settings.captionStyle) || "bold_pop";
      const mwl = Number(plan.settings && plan.settings.maxWordsPerLine) || 3;
      const reason = f.data && f.data.reason;
      if (reason === "reading_speed") return { skip: "report_only" };
      const preset = STYLE_PRESETS[styleId];
      const boxed = !!(preset && preset.box && preset.box.enabled);
      if (reason === "lines" || boxed) {
        return mwl > 1 ? { ops: [{ type: "captions.setStyle", styleId, maxWordsPerLine: mwl - 1 }] } : { skip: "already_minimal" };
      }
      // ENGINE.md §7 asks for `captions.setStyle{box:true}`; the op has no box flag, so switch to the boxed preset.
      return { ops: [{ type: "captions.setStyle", styleId: BOXED_STYLE }] };
    },
  },
  CAPTION_MISMATCH: { label: "caption.rebuildFromWords", plan: (f) => ({ ops: rangeOf(f).map((range) => ({ type: "caption.rebuildFromWords", range })) }) },
  CAPTION_TIMING: { label: "caption.rebuildFromWords", plan: (f) => ({ ops: rangeOf(f).map((range) => ({ type: "caption.rebuildFromWords", range })) }) },
  CAPTION_COVERS_FACE: { label: "caption.setPosition", plan: (f, rctx) => moveCaption(rctx.plan, f, altCaptionY(rctx.plan, f)) },
  OVERLAY_COLLISION: { label: "move overlay", plan: moveOverlay },
  TEXT_OFFSCREEN: { label: "move into safe area", plan: moveOverlay },
  BROLL_OFF_TOPIC: { label: "broll.replace|broll.remove", plan: replaceOrRemove("offtopic") },
  BROLL_LOW_QUALITY: { label: "broll.replace|broll.remove", plan: replaceOrRemove("low_quality") },
  BROLL_WATERMARK: { label: "broll.replace|broll.remove", plan: replaceOrRemove("watermark") },
  COVERAGE: {
    label: "broll.remove|broll.setLayout",
    plan(f, rctx) {
      const item = byId(rctx.plan.broll, f.elementId);
      if (!item || item.status === "removed") return { skip: "no_broll" };
      if (!eligible(item)) return { skip: "locked" };
      if (f.data && f.data.action === "pip") return { ops: [{ type: "broll.setLayout", id: item.id, layout: "PIP" }] };
      return { ops: [{ type: "broll.remove", id: item.id }] };
    },
  },
  SPEAKER_CROPPED: {
    label: "framing.reset",
    plan(f, rctx) {
      const segs = (rctx.plan.aRoll && rctx.plan.aRoll.segments) || [];
      const seg = byId(segs, f.elementId || (f.data && f.data.segmentId));
      if (!seg) return { skip: "no_segment" };
      if (seg.framing && (seg.framing.userCrop || seg.framing.mode !== "auto")) return { ops: [{ type: "framing.reset", segmentId: seg.id }] };
      return { actions: [{ action: "rerender", level: "chunks", ranges: seg.resolved ? [[seg.resolved.outIn, seg.resolved.outOut]] : rangeOf(f) }] };
    },
  },
  CLIPPED_WORD: {
    label: "cut.adjust",
    plan(f, rctx) {
      const d = f.data || {};
      const cut = byId(rctx.plan.cuts, d.cutId);
      if (!cut) return { skip: "no_cut" };
      if (cut.locked) return { skip: "locked" };
      if (d.toggle) return { ops: [{ type: "cut.toggle", cutId: cut.id, enabled: false }] };
      return { ops: [{ type: "cut.adjust", cutId: cut.id, padStart: d.padStart, padEnd: d.padEnd }] };
    },
  },
  AWKWARD_CUT: {
    label: "cut.toggle",
    plan(f, rctx) {
      const cut = byId(rctx.plan.cuts, f.data && f.data.cutId);
      if (!cut) return { skip: "no_cut" };
      if (cut.locked) return { skip: "locked" };
      return { ops: [{ type: "cut.toggle", cutId: cut.id, enabled: false }] };
    },
  },
  BLACK_OR_BLANK_FRAME: { label: "rerender chunks → cut.adjust", plan: reencodeThenNudge },
  FREEZE: { label: "rerender chunks → cut.adjust", plan: reencodeThenNudge },
  CARD_RENDER_BROKEN: { label: "ASS card fallback → graphic.toggle", plan: cardRepair },
  ASSET_BROKEN: {
    label: "broll.replace|broll.remove",
    plan(f, rctx) {
      const kind = (f.data && f.data.kind) || kindOf(f.elementId, rctx);
      if (kind === "broll" || kind === "pip") return replaceOrRemove(null)(f, rctx);
      if (kind === "card") return cardRepair(f, rctx);
      if (kind === "overlays") return { actions: [{ action: "rerender", level: "composite", ranges: [], full: true }] };
      if (kind === "logo" && rctx.plan.branding && rctx.plan.branding.logo) return { ops: [{ type: "branding.removeLogo" }] };
      return { skip: "unknown_asset" };
    },
  },
  LOUDNESS: {
    label: "rerender post",
    plan(f) {
      const d = f.data || {};
      const extra = d.reason === "no_audio" || d.reason === "silent" ? { rebuildVoice: true } : Number.isFinite(d.gainDb) ? { gainDb: d.gainDb } : { limiter: true };
      return { actions: [{ action: "rerender", level: "post", ranges: [], ...extra }] };
    },
  },
  SILENCE: { label: "rerender post", plan: (f) => ({ actions: [{ action: "rerender", level: "post", ranges: rangeOf(f), rebuildVoice: true }] }) },
  EFFECT_DENSITY: {
    label: "effect.toggle|transition.set|sfx.toggle",
    plan(f) {
      const ops = [];
      for (const x of (f.data && f.data.disable) || []) {
        if (x.op === "effect") ops.push({ type: "effect.toggle", id: x.id, enabled: false });
        else if (x.op === "transition") ops.push({ type: "transition.set", id: x.id, kind: "CUT" });
        else if (x.op === "sfx") ops.push({ type: "sfx.toggle", id: x.id, enabled: false });
      }
      return ops.length ? { ops } : { skip: "nothing_eligible" };
    },
  },
  DURATION_MISMATCH: {
    label: "rerender remux → chunks",
    plan(f, rctx) {
      const d = f.data || {};
      const D = Number.isFinite(d.expectedSec) ? d.expectedSec : null;
      if (!samePrevious(rctx, f, 1e9) && Number(d.driftFrames) > 0 && D) return { actions: [{ action: "rerender", level: "remux", ranges: [], trimToSec: D }] };
      return { actions: [{ action: "rerender", level: "chunks", ranges: D ? [[0, D]] : [], full: true }] };
    },
  },
  AV_OFFSET: { label: "rerender post (voice stem)", plan: (f) => ({ actions: [{ action: "rerender", level: "post", ranges: [], rebuildVoice: true, avOffsetMs: f.data && f.data.ms }] }) },
  EXPOSURE_OR_COLOR_JUMP: reportOnly("report only"),
  LOGO_PROBLEM: reportOnly("report only"),
  OTHER: reportOnly("report only"),
});

function repairLabel(category) {
  const r = REPAIRS[category];
  return r ? r.label : "report only";
}

// ---- merge + validate -----------------------------------------------------------------------------------
function opKey(op) {
  if (op.type === "caption.rebuildFromWords") return null;
  if (op.type === "captions.setStyle" || op.type === "captions.setPosition" || op.type.startsWith("branding.")) return op.type;
  return `${op.type.split(".")[0]}|${op.id || op.cutId || op.cueId || op.segmentId || ""}`;
}

function mergeActions(actions) {
  const byLevel = new Map();
  for (const a of actions) {
    const cur = byLevel.get(a.level);
    if (!cur) { byLevel.set(a.level, { ...a, ranges: [...(a.ranges || [])] }); continue; }
    cur.ranges.push(...(a.ranges || []));
    for (const [k, v] of Object.entries(a)) {
      if (k === "ranges" || k === "action" || k === "level") continue;
      if (Array.isArray(v)) cur[k] = [...new Set([...(cur[k] || []), ...v])];
      else if (cur[k] === undefined || v === true) cur[k] = v;
    }
  }
  return [...byLevel.values()].map((a) => ({ ...a, ranges: C.mergeRanges(a.ranges, 0.25).map((r) => [r3(r[0]), r3(r[1])]) }));
}

function dryRun(plan, ops, ctx, skipped) {
  const { applyOps } = require("../plan/ops");
  let draft = plan;
  const kept = [];
  const actx = { ...ctx, author: "qa-repair", now: Number.isFinite(ctx.now) ? ctx.now : 0 };
  ops.forEach((op, k) => {
    try {
      draft = applyOps(draft, [op], { ...actx, batchId: `qa-dry-${k}` }).plan;
      kept.push(op);
    } catch (e) {
      if (!(e && e.code === "INVALID_OP")) throw e;
      skipped.push({ category: op.__category, elementId: op.__elementId, reason: `invalid_op: ${String((e.extra && e.extra.reason) || e.detail || "").slice(0, 120)}` });
    }
  });
  return kept;
}

function planRepairs(report, plan, ctx = {}) {
  const minRank = C.SEVERITY_RANK[ctx.minSeverity || "minor"];
  const rctx = { ...ctx, plan };
  const issues = (report && Array.isArray(report.issues) ? report.issues : [])
    .filter((f) => f && C.SEVERITY_RANK[f.severity] <= minRank)
    .filter((f) => !(f.source === "vision" && report.visionUnverified));
  const ops = [], actions = [], planned = [], skipped = [];
  const keys = new Set();
  const rebuild = [];
  for (const f of C.sortFindings(issues)) {
    const r = REPAIRS[f.category];
    let out;
    try { out = r ? r.plan(f, rctx) : { skip: "unmapped" }; }
    catch (e) { out = { skip: `planner_error: ${String(e && e.message).slice(0, 80)}` }; }
    if (out.skip && !(out.ops && out.ops.length) && !(out.actions && out.actions.length)) {
      skipped.push({ category: f.category, elementId: f.elementId, reason: out.skip });
      continue;
    }
    let used = false;
    for (const op of out.ops || []) {
      if (op.type === "caption.rebuildFromWords") { rebuild.push(op.range); used = true; continue; }
      const k = opKey(op);
      if (k && keys.has(k)) continue;
      if (k) keys.add(k);
      ops.push(Object.defineProperties({ ...op }, { __category: { value: f.category }, __elementId: { value: f.elementId } }));
      used = true;
    }
    for (const a of out.actions || []) { actions.push(a); used = true; }
    if (used) planned.push({ category: f.category, elementId: f.elementId, repairOp: (out.ops && out.ops[0] && out.ops[0].type) || (out.actions && out.actions[0] && `rerender:${out.actions[0].level}`) });
    else skipped.push({ category: f.category, elementId: f.elementId, reason: "duplicate" });
  }
  for (const range of C.mergeRanges(rebuild, 0.5).slice(0, MAX_REBUILD_RANGES)) {
    ops.push(Object.defineProperties({ type: "caption.rebuildFromWords", range: [r3(range[0]), r3(range[1])] }, { __category: { value: "CAPTION_TIMING" }, __elementId: { value: null } }));
  }
  const validate = ctx.validate !== false && Array.isArray(ctx.words) && ctx.words.length > 0;
  const finalOps = validate ? dryRun(plan, ops, ctx, skipped) : ops;
  return { ops: finalOps.map((op) => ({ ...op })), renderActions: mergeActions(actions), planned, skipped };
}

module.exports = { REPAIRS, repairLabel, planRepairs, nextBestUnused, mergeActions, BOXED_STYLE };
