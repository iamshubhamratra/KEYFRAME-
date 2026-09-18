// VIDEO EDIT RE-PLAN — change intensity / effects / pacing without undoing the user's work
// (EDIT_PLAN.md §5 "Re-plan rule", §1 origin & ownership).
//
// WHY THIS EXISTS. "B-roll Medium → High" must add AI B-roll, and "Subtle → Dynamic" must add punch-ins,
// with no LLM call (the director's opportunities are over-complete and pre-ranked) — but a re-plan that
// moves a clip the user swapped, re-adds a clip the user removed, or drops a clip the user locked
// destroys trust in every later edit. So re-planning is a MERGE: the deterministic rhythm engine
// proposes complete tracks for the new settings; only eligible items (origin !== 'user', !locked,
// !userModified, status !== 'removed', and never touched by a user op per provenance.ops — which
// covers SFX / transitions / music that have no userModified field) may be added or dropped; any
// proposal that matches a protected or tombstoned item by id or by identity (kind + anchor) is
// ignored, so removed items are never resurrected.
//
// CONTRACT:
//   replanForSettings(plan, settingsPatch, ctx) -> { plan, report, warnings, costEvents }
//     settingsPatch: Partial<plan.settings> (zod-validated) · ctx: { now, words, sentences?, content?, faces?,
//     mezz?, scenes?, emphasis?, envelope?, selectEdits? }
//     selectEdits = ctx.selectEdits || require('../director/rhythm').selectEdits (lazy; absent -> trim-only fallback)
//       called as selectEdits({ plan, opportunities, words, sentences, content, faces, settings, now })
//       -> { broll, effects, graphics, sfx, transitions, music, adjustments } (a missing track = not re-planned)
//     opportunities = ctx.opportunities (director shape) || toDirectorOpportunities(plan, words): plan.opportunities
//       {broll, effects, graphics, sfx} mapped to {brollOpportunities, punchIns, graphics, sfx}, transitions / hookTitle /
//       ctaCard rebuilt from the plan's existing elements, music:null (a re-plan never re-picks music).
//     Identity: same id, same kind + anchor, or same kind (any layout for B-roll) overlapping ≥ 50 % of the shorter
//     source span — so a proposal near a protected item is ignored and a proposal near an eligible item keeps it.
//     A null music proposal never removes music.
//     report: { engine:'rhythm'|'fallback', added, removed, keptUserChanges, addedIds, removedIds, musicChanged }
//     warnings: [{ code:'REPLANNED', added, removed, keptUserChanges, engine, settings:[keys] }]
//     costEvents: NEEDS_FETCH for every added pending B-roll (prefetched flag from its opportunity; download_broll when it
//       already has a chosen asset without a file).
//     selectEdits runs with settings.sfxEnabled forced true (the flag is a render-time mute) and ctx.brollSlots
//     (analysis/broll_scored.json slots, director/slots.js): items attach the slot's candidates, status 'ok' when downloaded.
//     A dropped eligible B-roll with a chosen asset parks { chosen, topCandidates, candidateSetId, judge } on its
//     sentence's opportunity (`retrieved`); a later re-plan adding B-roll on that sentence restores it (no refetch).
//     provenance.ops of settings.set never count as user touches (U.touchedIdsFromProvenance).
//   The fallback (no rhythm engine) only DROPS eligible items above the RHYTHM_DEFAULTS caps (B-roll coverage
//   / items per 60 s; subtle: no ZOOM_EMPHASIS/FREEZE/SPEED, punch-ins per 60 s + spacing); it never adds.
//   isEligible(el, touched) · identityKey(track, el) · mergeProposal(plan, proposal, touched) · fallbackProposal(plan, touched)

const { EditError } = require("../errors");
const { resolvePlan } = require("./resolve");
const { PlanSettingsSchema, collectIds } = require("./schema");
const T = require("./timeline");
const U = require("./ops_util");

const ELEMENT_TRACKS = Object.freeze(["broll", "effects", "graphics"]);
const REF_TRACKS = Object.freeze(["transitions", "sfx"]);
const PREFIX = Object.freeze({ broll: "br", effects: "fx", graphics: "gfx", transitions: "tr", sfx: "sfx" });
const HAS_USER_MODIFIED = Object.freeze({ broll: true, effects: true, graphics: true, transitions: false, sfx: false });

const BROLL_CAPS = Object.freeze({ low: { coverage: 0.12, per60: 2 }, medium: { coverage: 0.25, per60: 4 }, high: { coverage: 0.4, per60: 7 } });
const PUNCH_CAPS = Object.freeze({ subtle: { per60: 2, spacing: 10 }, dynamic: { per60: 5, spacing: 5 } });

function isEligible(el, touched) {
  return !!el && el.origin !== "user" && !el.locked && !el.userModified && el.status !== "removed" && !(touched && touched.has(el.id));
}

function anchorKey(a) {
  if (!a) return "none";
  if (a.kind === "words") return `w${a.w0}-${a.w1}`;
  if (a.kind === "src") return `s${Math.round(a.srcIn * 10)}-${Math.round(a.srcOut * 10)}`;
  return `o${Math.round(a.outIn * 10)}-${Math.round(a.outOut * 10)}`;
}

function identityKey(track, el) {
  if (track === "broll") return `broll|${anchorKey(el.anchor)}`;
  if (track === "effects" || track === "graphics") return `${track}|${el.kind}|${anchorKey(el.anchor)}`;
  if (track === "sfx") return `sfx|${el.cue}|${el.anchor && el.anchor.elementId}|${el.anchor && el.anchor.edge}`;
  if (track === "transitions") return `tr|${el.at && el.at.elementId != null ? el.at.elementId : `o${Math.round(((el.at && el.at.outAt) || 0) * 10)}`}`;
  return `${track}|${el.id}`;
}

function loadSelectEdits(ctx) {
  if (typeof ctx.selectEdits === "function") return ctx.selectEdits;
  if (ctx.selectEdits === null) return null;
  try {
    const m = require("../director/rhythm");
    return m && typeof m.selectEdits === "function" ? m.selectEdits : null;
  } catch (e) {
    const first = String(e && e.message).split("\n")[0];
    if (e && e.code === "MODULE_NOT_FOUND" && first.includes("director/rhythm")) return null;
    throw e;
  }
}

function remapRefs(el, remap) {
  if (el.anchor && typeof el.anchor.elementId === "string" && remap.has(el.anchor.elementId)) el.anchor.elementId = remap.get(el.anchor.elementId);
  if (el.at && typeof el.at.elementId === "string" && remap.has(el.at.elementId)) el.at.elementId = remap.get(el.at.elementId);
  return el;
}

const refOf = (el) => (el.anchor && el.anchor.elementId) || (el.at && el.at.elementId) || null;

function srcSpan(el, words) {
  const a = el && el.anchor;
  if (!a || !a.kind || a.kind === "out") return null;
  const s = T.anchorToSrc(a, words || []);
  return s && s[1] > s[0] ? s : null;
}

// Same element "family" covering the same moment: kind must match (B-roll: any layout), ≥ 50 % of the shorter span.
function overlapsSame(track, x, y, words) {
  if (!ELEMENT_TRACKS.includes(track)) return false;
  if (track !== "broll" && x.kind !== y.kind) return false;
  const a = srcSpan(x, words), b = srcSpan(y, words);
  if (!a || !b) return false;
  const inter = Math.max(0, Math.min(a[1], b[1]) - Math.max(a[0], b[0]));
  return inter > 0 && inter >= 0.5 * Math.min(a[1] - a[0], b[1] - b[0]) - 1e-9;
}

// plan.opportunities (EDIT_PLAN §2 shape) -> director Opportunities (director/opportunities.js shape) for rhythm.
function toDirectorOpportunities(plan, words = []) {
  const o = plan.opportunities || {};
  const sentenceOfEl = (el) => {
    const a = el.anchor;
    if (a && a.kind === "words" && words[a.w0] && words[a.w0].sentenceId != null) return words[a.w0].sentenceId;
    return null;
  };
  const graphics = [...(o.graphics || [])];
  const card = (kind) => {
    const g = (plan.graphics || []).find((x) => x.kind === kind && x.status !== "removed");
    const sid = g ? sentenceOfEl(g) : null;
    if (!g || !sid) return null;
    if (!graphics.some((x) => x.kind === kind && x.sentenceId === sid)) {
      graphics.push({ id: `opp_${g.id}`.slice(0, 44), kind, sentenceId: sid, title: g.text.title.slice(0, 32), priority: kind === "HOOK_TITLE" ? 0.9 : 0.8, reason: g.reason });
    }
    return { text: g.text.title.slice(0, 32), sentenceId: sid };
  };
  const segs = (plan.aRoll && plan.aRoll.segments) || [];
  const transitions = (plan.transitions || []).filter((t) => t.kind !== "CUT" && t.at && t.at.elementId).map((t) => {
    const seg = segs.find((s) => s.id === t.at.elementId);
    return seg && seg.sentenceIds.length ? { id: `opp_${t.id}`.slice(0, 44), afterSentenceId: seg.sentenceIds[seg.sentenceIds.length - 1], kind: t.kind, reason: t.reason } : null;
  }).filter(Boolean);
  const hookTitle = card("HOOK_TITLE");
  const ctaCard = card("CTA");
  return {
    source: plan.provenance && plan.provenance.director && plan.provenance.director.fallback ? "heuristic" : "ai",
    brollOpportunities: [...(o.broll || [])], punchIns: [...(o.effects || [])], graphics, sfx: [...(o.sfx || [])],
    music: null, transitions, hookTitle, ctaCard,
  };
}

function mergeProposal(plan, proposal, touched, words = []) {
  const next = U.clone(plan);
  const prop = proposal || {};
  const allIds = new Set(collectIds(next).map((x) => x.id));
  const remap = new Map();
  const report = { addedIds: [], removedIds: [], keptUserChanges: 0, musicChanged: false };
  const pendingDrops = new Map();

  const mergeTrack = (track) => {
    const proposed = Array.isArray(prop[track]) ? prop[track] : null;
    if (!proposed) return;
    const current = next[track];
    const prot = current.filter((el) => !isEligible(el, touched));
    const elig = current.filter((el) => isEligible(el, touched));
    report.keptUserChanges += prot.filter((el) => el.origin === "user" || el.locked || el.userModified || el.status === "removed" || touched.has(el.id)).length;
    const protById = new Map(prot.map((el) => [el.id, el]));
    const protByKey = new Map(prot.map((el) => [identityKey(track, el), el]));
    const eligById = new Map(elig.map((el) => [el.id, el]));
    const eligByKey = new Map(elig.map((el) => [identityKey(track, el), el]));
    const matched = new Set();
    const additions = [];
    const addedKeys = new Set();
    for (const cand of proposed) {
      if (!cand || typeof cand !== "object") continue;
      const c = remapRefs(U.clone(cand), remap);
      const key = identityKey(track, c);
      if (protById.has(c.id)) { remap.set(cand.id, c.id); continue; }
      if (protByKey.has(key)) { remap.set(cand.id, protByKey.get(key).id); continue; }
      const protNear = prot.find((el) => overlapsSame(track, el, c, words));
      if (protNear) { remap.set(cand.id, protNear.id); continue; }
      const hit = eligById.get(c.id) || eligByKey.get(key) || elig.find((el) => !matched.has(el.id) && overlapsSame(track, el, c, words));
      if (hit) { matched.add(hit.id); remap.set(cand.id, hit.id); continue; }
      if (addedKeys.has(key)) continue;
      let id = typeof c.id === "string" && new RegExp(`^${PREFIX[track]}_[A-Za-z0-9_-]{1,40}$`).test(c.id) ? c.id : null;
      for (let n = 0; !id || allIds.has(id); n++) id = `${PREFIX[track]}_rp${U.hashHex(`${key}|${n}`, 10)}`;
      remap.set(cand.id, id);
      c.id = id;
      allIds.add(id);
      if (c.origin === "user" || !c.origin) c.origin = "ai";
      c.locked = false;
      if (HAS_USER_MODIFIED[track]) c.userModified = false;
      addedKeys.add(key);
      additions.push(c);
    }
    pendingDrops.set(track, { drops: elig.filter((el) => !matched.has(el.id)), additions });
  };

  for (const track of ELEMENT_TRACKS) mergeTrack(track);
  // Protected SFX / transitions keep the element they hang on.
  const protectedRefs = new Set();
  for (const track of REF_TRACKS) for (const el of next[track]) if (!isEligible(el, touched) && refOf(el)) protectedRefs.add(refOf(el));
  for (const track of ELEMENT_TRACKS) {
    const pd = pendingDrops.get(track);
    if (!pd) continue;
    const drops = pd.drops.filter((el) => !protectedRefs.has(el.id));
    const dropIds = new Set(drops.map((el) => el.id));
    if (track === "broll") {
      // A dropped AI item's retrieval result is parked on its sentence's opportunity and restored when a later
      // proposal re-adds B-roll there, so Medium → Low → Medium shows the same clip without another fetch.
      const opps = next.opportunities && Array.isArray(next.opportunities.broll) ? next.opportunities.broll : [];
      for (const b of drops) {
        if (!b.chosen || !b.sentenceId) continue;
        const o = opps.filter((x) => x.sentenceId === b.sentenceId).sort((x, y) => y.priority - x.priority || (x.id < y.id ? -1 : 1))[0];
        if (o && !o.retrieved) {
          o.retrieved = { chosen: U.clone(b.chosen), topCandidates: U.clone(b.topCandidates || []).slice(0, 8), candidateSetId: b.candidateSetId == null ? null : b.candidateSetId, judge: b.judge === "ok" ? "ok" : "unavailable" };
        }
      }
      const used = new Set(next.broll.filter((b) => !dropIds.has(b.id) && b.chosen && b.status !== "removed").map((b) => b.chosen.assetId));
      let ord = next.broll.reduce((m, b) => Math.max(m, b.ordinal), 0);
      for (const b of pd.additions) {
        b.ordinal = ++ord;
        const o = b.sentenceId ? opps.find((x) => x.sentenceId === b.sentenceId && x.retrieved && !used.has(x.retrieved.chosen.assetId)) : null;
        if (o) {
          Object.assign(b, { chosen: o.retrieved.chosen, topCandidates: o.retrieved.topCandidates, candidateSetId: o.retrieved.candidateSetId, judge: o.retrieved.judge });
          b.status = b.chosen.path ? "ok" : "pending";
          delete o.retrieved;
        } else if (!b.status) b.status = "pending";
        if (b.chosen) used.add(b.chosen.assetId);
      }
    }
    next[track] = [...next[track].filter((el) => !dropIds.has(el.id)), ...pd.additions];
    report.removedIds.push(...dropIds);
    report.addedIds.push(...pd.additions.map((el) => el.id));
  }
  for (const track of REF_TRACKS) {
    mergeTrack(track);
    const pd = pendingDrops.get(track);
    if (pd) {
      const dropIds = new Set(pd.drops.map((el) => el.id));
      next[track] = [...next[track].filter((el) => !dropIds.has(el.id)), ...pd.additions];
      report.removedIds.push(...dropIds);
      report.addedIds.push(...pd.additions.map((el) => el.id));
    }
    // cascade: eligible references to elements that no longer exist
    const live = new Set(collectIds(next).map((x) => x.id));
    const orphans = next[track].filter((el) => refOf(el) && !live.has(refOf(el)) && isEligible(el, touched));
    if (orphans.length) {
      const ids = new Set(orphans.map((el) => el.id));
      next[track] = next[track].filter((el) => !ids.has(el.id));
      report.removedIds.push(...ids);
      report.addedIds = report.addedIds.filter((id) => !ids.has(id));
    }
  }

  // A re-plan may swap an eligible AI music bed for a proposed one but never removes music: a null proposal
  // means "no opinion" (music is not driven by intensity / effects / pacing).
  if (prop.music && typeof prop.music === "object") {
    const cur = next.music;
    const eligible = cur == null || (cur.origin !== "user" && !cur.locked && !touched.has("music"));
    if (eligible && JSON.stringify(cur) !== JSON.stringify(prop.music)) {
      next.music = U.clone(prop.music);
      report.musicChanged = true;
    }
  }
  if (Array.isArray(prop.adjustments)) {
    const keep = next.provenance.rhythm.adjustments.filter((a) => T.TIMELINE_RULES.includes(a.rule));
    // Adjustments name proposal ids; map them to the plan ids they were merged into so provenance never
    // points at an id that does not exist (and a repeated re-plan is byte-identical).
    next.provenance.rhythm.adjustments = [...keep, ...prop.adjustments
      .filter((a) => a && typeof a.elementId === "string" && typeof a.rule === "string")
      .map((a) => (remap.has(a.elementId) ? { ...a, elementId: remap.get(a.elementId) } : a))];
  }
  if (Array.isArray(prop.appendAdjustments)) next.provenance.rhythm.adjustments.push(...prop.appendAdjustments);
  return { plan: next, report };
}

function priorityFor(plan, track, el) {
  const opps = plan.opportunities || {};
  if (track === "broll") {
    const ps = (opps.broll || []).filter((o) => o.sentenceId === el.sentenceId).map((o) => o.priority);
    return ps.length ? Math.max(...ps) : 0.5;
  }
  const a = el.anchor;
  const ps = (opps.effects || []).filter((o) => a && a.kind === "words" && o.w >= a.w0 && o.w <= a.w1).map((o) => o.priority);
  return ps.length ? Math.max(...ps) : 0.5;
}

function fallbackProposal(plan, touched) {
  const s = plan.settings;
  const dur = plan.timeline.outDurationSec || 0;
  const adjustments = [];
  const span = (el) => (el.resolved && !el.resolved.collapsed ? el.resolved : null);
  const byPriority = (track) => (a, b) => priorityFor(plan, track, b) - priorityFor(plan, track, a) || (span(a) ? span(a).outIn : 0) - (span(b) ? span(b).outIn : 0);

  const bc = BROLL_CAPS[s.brollIntensity] || BROLL_CAPS.medium;
  const maxItems = Math.max(1, Math.floor((bc.per60 * dur) / 60 + 1e-9));
  const live = (b) => b.status !== "removed" && b.status !== "missing" && span(b);
  let count = 0, cover = 0;
  const keepB = new Set();
  for (const b of plan.broll.filter((x) => live(x) && !isEligible(x, touched))) { count++; cover += span(b).outOut - span(b).outIn; keepB.add(b.id); }
  for (const b of plan.broll.filter((x) => live(x) && isEligible(x, touched)).sort(byPriority("broll"))) {
    const d = span(b).outOut - span(b).outIn;
    if (count + 1 <= maxItems && cover + d <= bc.coverage * dur + 1e-9) { count++; cover += d; keepB.add(b.id); }
    else adjustments.push({ elementId: b.id, rule: "broll_cap", action: "dropped" });
  }
  const broll = plan.broll.filter((b) => !isEligible(b, touched) || !live(b) || keepB.has(b.id));

  const fxOn = s.effectsEnabled !== false;
  const pc = PUNCH_CAPS[s.effects] || PUNCH_CAPS.subtle;
  const maxPunch = Math.max(1, Math.floor((pc.per60 * dur) / 60 + 1e-9));
  const accepted = plan.effects.filter((e) => e.kind === "PUNCH_IN" && !isEligible(e, touched) && e.enabled && span(e)).map((e) => span(e).outIn);
  const effects = [];
  const eligiblePunches = new Set(plan.effects.filter((e) => e.kind === "PUNCH_IN" && isEligible(e, touched) && e.enabled && span(e)).sort(byPriority("effects"))
    .filter((e) => {
      const t = span(e).outIn;
      const ok = fxOn && accepted.length < maxPunch && accepted.every((x) => Math.abs(x - t) >= pc.spacing - 1e-9);
      if (ok) accepted.push(t);
      return ok;
    }).map((e) => e.id));
  for (const e of plan.effects) {
    if (!isEligible(e, touched)) { effects.push(e); continue; }
    const subtleBanned = s.effects !== "dynamic" && ["ZOOM_EMPHASIS", "FREEZE", "SPEED"].includes(e.kind) && e.enabled;
    const punchDropped = e.kind === "PUNCH_IN" && e.enabled && span(e) && !eligiblePunches.has(e.id);
    if (subtleBanned || punchDropped) adjustments.push({ elementId: e.id, rule: subtleBanned ? "effects_level" : "punch_in_cap", action: "dropped" });
    else effects.push(e);
  }
  return { broll, effects, appendAdjustments: adjustments };
}

function replanForSettings(plan, settingsPatch, ctx = {}) {
  if (!plan || !plan.settings) throw new EditError("INVALID_PLAN", { status: 500, errorClass: "bug", detail: "replanForSettings: plan required" });
  if (!Number.isFinite(ctx.now)) throw new EditError("OPS_CONTEXT", { status: 500, errorClass: "bug", detail: "replanForSettings: ctx.now required" });
  const parsed = PlanSettingsSchema.partial().strict().safeParse(settingsPatch || {});
  if (!parsed.success) throw new EditError("INVALID_SETTINGS", { status: 422, errorClass: "input", detail: parsed.error.issues.map((i) => i.message).join("; "), extra: { reason: "invalid settings patch" } });
  const rctx = { words: ctx.words, sentences: ctx.sentences, envelope: ctx.envelope, faces: ctx.faces, mezz: ctx.mezz, scenes: ctx.scenes, emphasis: ctx.emphasis, now: ctx.now };
  const base = U.clone(plan);
  Object.assign(base.settings, parsed.data);
  const resolved = resolvePlan(base, rctx);
  const touched = U.touchedIdsFromProvenance(resolved);
  const selectEdits = loadSelectEdits(ctx);
  const engine = selectEdits ? "rhythm" : "fallback";
  // The fallback only enforces the caps of the setting that changed (a pacing toggle never trims B-roll).
  const onlyChanged = (prop, keys) => {
    const broll = keys.includes("brollIntensity"), fx = keys.includes("effects") || keys.includes("effectsEnabled");
    return {
      ...(broll ? { broll: prop.broll } : {}), ...(fx ? { effects: prop.effects } : {}),
      appendAdjustments: prop.appendAdjustments.filter((a) => (a.rule === "broll_cap" ? broll : fx)),
    };
  };
  const opportunities = ctx.opportunities || toDirectorOpportunities(resolved, ctx.words);
  // settings.sfxEnabled is a render-time mute (sfx.muteAll): selection runs as if unmuted, or a re-plan while
  // muted would propose no SFX and the merge would delete every AI sound effect for good.
  const selectionSettings = { ...resolved.settings, sfxEnabled: true };
  const proposal = selectEdits
    ? selectEdits({ plan: resolved, opportunities, words: ctx.words, sentences: ctx.sentences, content: ctx.content, faces: ctx.faces, settings: selectionSettings, now: ctx.now, brollSlots: ctx.brollSlots })
    : onlyChanged(fallbackProposal(resolved, touched), Object.keys(parsed.data));
  const merged = mergeProposal(resolved, proposal, touched, ctx.words);
  const final = resolvePlan(merged.plan, rctx);

  const added = new Set(merged.report.addedIds);
  const costEvents = final.broll.filter((b) => added.has(b.id) && b.status === "pending").map((b) => {
    const opp = (final.opportunities.broll || []).find((o) => o.sentenceId === b.sentenceId);
    const prefetched = !!(opp && opp.candidatesPrefetched);
    if (b.chosen) return { code: "NEEDS_FETCH", job: "download_broll", elementId: b.id, assetId: b.chosen.assetId, prefetched, net: "fetch" };
    return { code: "NEEDS_FETCH", job: "search_broll", elementId: b.id, prefetched, net: prefetched ? "none" : "fetch" };
  });
  const report = {
    engine, added: merged.report.addedIds.length, removed: merged.report.removedIds.length, keptUserChanges: merged.report.keptUserChanges,
    addedIds: merged.report.addedIds, removedIds: merged.report.removedIds, musicChanged: merged.report.musicChanged,
  };
  const warnings = [{ code: "REPLANNED", added: report.added, removed: report.removed, keptUserChanges: report.keptUserChanges, engine, settings: Object.keys(parsed.data) }];
  return { plan: final, report, warnings, costEvents };
}

module.exports = { replanForSettings, isEligible, identityKey, mergeProposal, fallbackProposal, loadSelectEdits, toDirectorOpportunities };
