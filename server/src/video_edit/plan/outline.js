// VIDEO EDIT PLAN OUTLINE — the user's tree of an edit (EDIT_PLAN.md §7).
//
// WHY THIS EXISTS. The editor sidebar, the API (`GET /:id/plan` summary) and revision summaries all
// show the same "what did the AI do" view: A-roll segments by type, the caption/B-roll/effects/
// music/SFX/branding/transition tracks on the OUTPUT timeline, and a one-line summary (✓ CAPTIONS
// ✓ 4 B-ROLL ✓ 12 FILLERS REMOVED …). Computing it in three places drifts; computing it from anything
// but a resolved plan lies. So it is one pure function over a resolved plan. Tombstoned B-roll
// (status 'removed') is left out of the tracks; everything else is listed with its enabled flag.
//
// CONTRACT:
//   outline(plan) -> { duration, aRoll:[{ id, type, outIn, outOut, label, effects:[kind] }],
//     tracks:{ captions:{ enabled, styleId, cueCount }, broll:[{ id, ordinal, outIn, outOut, layout, status }],
//              effects:[{ id, kind, outIn, outOut, enabled }], music:{ enabled, title, outIn, outOut }|null,
//              sfx:[{ id, cue, outAt, enabled }], branding:{ logo, palette }, transitions:[{ id, kind, outAt }] },
//     summary:{ captions, brollCount, punchIns, jumpCuts, fillersRemoved, silenceRemovedSec, music, logo, hookTitle } }
//   Cut suppression by the timeline rules (min_cut / min_keep adjustments) is honoured in the counts.

const T = require("./timeline");

const r3 = (x) => Math.round(x * 1000) / 1000;
const spanOf = (el) => (el && el.resolved ? { outIn: el.resolved.outIn, outOut: el.resolved.outOut } : { outIn: null, outOut: null });
const visible = (el) => !el.resolved || !el.resolved.collapsed;

function unionSec(intervals) {
  const sorted = intervals.slice().sort((a, b) => a[0] - b[0]);
  let total = 0, curA = null, curB = null;
  for (const [a, b] of sorted) {
    if (curB == null || a > curB) { if (curB != null) total += curB - curA; curA = a; curB = b; }
    else curB = Math.max(curB, b);
  }
  if (curB != null) total += curB - curA;
  return total;
}

function outline(plan) {
  const p = plan || {};
  const timeline = p.timeline || { pieces: [], outDurationSec: 0 };
  const settings = p.settings || {};
  const fxOn = settings.effectsEnabled !== false;
  const effects = p.effects || [];
  const suppressed = new Set(((p.provenance && p.provenance.rhythm && p.provenance.rhythm.adjustments) || [])
    .filter((a) => T.TIMELINE_RULES.includes(a.rule) && a.action === "disabled").map((a) => a.elementId));
  const liveCut = (c) => T.isEffective(c, settings) && !suppressed.has(c.id);

  const aRoll = ((p.aRoll && p.aRoll.segments) || []).map((s) => {
    const span = spanOf(s);
    const kinds = new Set();
    if (s.resolved && !s.resolved.collapsed) {
      for (const e of effects) {
        if (!e.enabled || !e.resolved || e.resolved.collapsed) continue;
        if (e.resolved.outIn < s.resolved.outOut && e.resolved.outOut > s.resolved.outIn) kinds.add(e.kind);
      }
    }
    return { id: s.id, type: s.type, outIn: span.outIn, outOut: span.outOut, label: s.label, effects: [...kinds].sort() };
  });

  const cues = (p.captions && p.captions.cues) || [];
  const captions = { enabled: !!(p.captions && p.captions.enabled), styleId: p.captions ? p.captions.styleId : null, cueCount: cues.filter((c) => !c.hidden).length };

  const broll = (p.broll || []).filter((b) => b.status !== "removed").map((b) => {
    const span = spanOf(b);
    return { id: b.id, ordinal: b.ordinal, outIn: span.outIn, outOut: span.outOut, layout: b.layout, status: b.status };
  });

  const effectTrack = effects.map((e) => ({ id: e.id, kind: e.kind, ...spanOf(e), enabled: !!e.enabled }));

  const music = p.music ? {
    enabled: !!p.music.enabled,
    title: p.music.track ? (p.music.track.title || p.music.track.query || null) : null,
    outIn: 0,
    outOut: timeline.outDurationSec,
  } : null;

  const sfx = (p.sfx || []).map((s) => ({ id: s.id, cue: s.cue, outAt: s.resolved ? s.resolved.outAt : null, enabled: !!s.enabled }));

  const byId = new Map();
  for (const el of [...((p.aRoll && p.aRoll.segments) || []), ...(p.broll || []), ...(p.graphics || []), ...effects, ...cues]) byId.set(el.id, el);
  const transitions = (p.transitions || []).map((t) => {
    let outAt = null;
    if (t.at && Number.isFinite(t.at.outAt)) outAt = t.at.outAt;
    else if (t.at && byId.has(t.at.elementId)) { const el = byId.get(t.at.elementId); outAt = el.resolved ? el.resolved.outOut : null; }
    return { id: t.id, kind: t.kind, outAt };
  });

  const branding = { logo: !!(p.branding && p.branding.logo && p.branding.logo.show !== "none"), palette: p.branding ? p.branding.palette : null };

  // summary
  const pieces = (timeline.pieces || []).filter((x) => x.kind !== "hold").slice().sort((a, b) => a.srcIn - b.srcIn);
  let jumpCuts = 0;
  for (let i = 1; i < pieces.length; i++) if (pieces[i].srcIn - pieces[i - 1].srcOut > 1e-6) jumpCuts++;
  const silence = (p.cuts || []).filter((c) => c.kind === "SILENCE" && liveCut(c))
    .map((c) => [T.quantizeIn(c.srcIn) / T.FPS, T.quantizeOut(c.srcOut) / T.FPS]).filter(([a, b]) => b > a);

  const summary = {
    captions: captions.enabled && captions.cueCount > 0,
    brollCount: (p.broll || []).filter((b) => (b.status === "ok" || b.status === "pending") && visible(b)).length,
    punchIns: fxOn ? effects.filter((e) => e.kind === "PUNCH_IN" && e.enabled && visible(e)).length : 0,
    jumpCuts,
    fillersRemoved: (p.cuts || []).filter((c) => c.kind === "FILLER" && liveCut(c)).length,
    silenceRemovedSec: Math.round(unionSec(silence) * 100) / 100,
    music: !!(p.music && p.music.enabled && p.music.track),
    logo: branding.logo,
    hookTitle: (p.graphics || []).some((g) => g.kind === "HOOK_TITLE" && g.enabled && visible(g)),
  };

  return {
    duration: r3(timeline.outDurationSec || 0),
    aRoll,
    tracks: { captions, broll, effects: effectTrack, music, sfx, branding, transitions },
    summary,
  };
}

module.exports = { outline };
