// VIDEO EDIT RHYTHM ENGINE — opportunities -> timed plan elements under the rhythm rules (EDIT_PLAN.md §6).
//
// WHY THIS EXISTS. A talking-head edit dies from excess long before it dies from restraint: B-roll every
// two seconds hides the person the viewer came for, stacked punch-ins feel like a seizure, a whoosh on
// every cut is noise. Those limits are product decisions (the RHYTHM_DEFAULTS tables), and they must hold
// identically whoever authored the opportunities (LLM, heuristic, a re-plan after an intensity change) and
// whatever the user already pinned. So selection is a deterministic greedy pass on the OUTPUT timeline:
// opportunities sorted by priority desc then out-time asc; protected moments (hook guard, faceRequired
// sentences, the CTA, the last 2 s, screen content, face-absent spans, shaky spans) never covered;
// coverage, per-60-s window caps, minimum gaps, face-after-FULL and start/end-on-face checked against
// everything already accepted — locked / user / user-modified elements first, so they consume budget —
// and EVERY rejection, shortening or move logged to provenance.rhythm.adjustments so the editor can say
// why a suggestion is missing. New elements are anchored on the SOURCE timeline (src anchors), so a cut
// toggled later moves them with their words, and receive deterministic ids that never reuse an id the
// plan has ever held.
//
// Ordering (documented deviation from the §6 step list): HOOK_TITLE / CTA / LOGO_OUTRO cards are placed
// before B-roll, because B-roll must not overlap graphic regions and those cards are structural; KEYWORD
// / STAT / LOWER_THIRD after B-roll, because they need ≥ 2.5 s without FULL B-roll. Hook title and CTA card
// are exempt from the hook-guard / CTA / tail protections they exist to decorate. JUMP_ZOOM is not emitted
// (resolvePlan derives jump-cut framing into chunk keys); SPEED is never auto-selected. Selection runs on
// the pre-FREEZE timeline, and a FREEZE is only placed where no B-roll covers it.
//
// CONTRACT (pure; no Date.now / Math.random):
//   RULES_VERSION 'rhythm@1' · RHYTHM_DEFAULTS (frozen tables: broll[low|medium|high], effects[subtle|dynamic], common)
//   selectEdits({ plan, opportunities, words, sentences, content, faces, settings=plan.settings, now, shaky=[], keep='locked' })
//     -> { broll, effects, graphics, sfx, transitions, music, adjustments:[{ elementId, rule, action }] }
//     plan: cuts + aRoll.segments (+ existing elements; kept when origin 'user' || locked || userModified || status 'removed')
//     keep: 'locked' (default) | 'none' (only tombstones survive — "regenerate without keeping pins")
//     content: ANALYSIS.md §7 shape (hook, cta, faceRequired, emphasis) or null (segments are used instead)
//     shaky: [{ start, end }] source ranges with no punch-ins
//     brollSlots: analysis/broll_scored.json slots (or null = retrieval not run): B-roll opportunities on sentences
//       without a slot accepted at this intensity are dropped ('no_accepted_candidate'); new items attach the slot's
//       best unused candidate + ranking (director/slots.js), status 'ok' when the asset is downloaded.
//   maxInWindow(times, windowSec) · unionLength(spans) — exported for tests / QA

const T = require("../plan/timeline");
const { EditError } = require("../errors");
const { collectIds } = require("../plan/schema");
const L = require("./lexicon");
const O = require("./opportunities");
const { normalizeSlots, slotAccepted, attachFromSlot } = require("./slots");

const RULES_VERSION = "rhythm@1";
const FPS = T.FPS;

const deepFreeze = (o) => { if (o && typeof o === "object" && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(deepFreeze); } return o; };

const RHYTHM_DEFAULTS = deepFreeze({
  broll: {
    low: { maxCoverage: 0.12, maxPer60: 2, minGap: 8, minDur: 1.8, maxDur: 4.0, hookGuard: 2.5, threshold: 0.7, minFaceAfterFull: 3.0, backToBackFull: { allowed: false, maxRun: 1, maxRunSec: 0 } },
    medium: { maxCoverage: 0.25, maxPer60: 4, minGap: 5, minDur: 1.5, maxDur: 4.5, hookGuard: 2.0, threshold: 0.55, minFaceAfterFull: 2.0, backToBackFull: { allowed: false, maxRun: 1, maxRunSec: 0 } },
    high: { maxCoverage: 0.4, maxPer60: 7, minGap: 3, minDur: 1.2, maxDur: 5.0, hookGuard: 1.5, threshold: 0.4, minFaceAfterFull: 1.5, backToBackFull: { allowed: true, maxRun: 2, maxRunSec: 8 } },
  },
  effects: {
    subtle: {
      jumpCutZ1: 1.1, punchZoom: 1.15, punchPer60: 2, punchSpacing: 10, zoomEmphasis: null, freeze: null, speed: null,
      transitions: { max: 1, spacing: 20 }, sfx: { per60: 2, spacing: 6, volume: [0.2, 0.3] }, graphicsPer60: 1,
      captions: { highlight: "color", entry: "fade", emphasisScale: 1.0 },
    },
    dynamic: {
      jumpCutZ1: 1.2, punchZoom: 1.25, punchPer60: 5, punchSpacing: 5, zoomEmphasis: { per60: 2, minSec: 0.6, maxSec: 1.2, maxDeltaZ: 0.12 },
      freeze: { maxPerVideo: 1, minSec: 0.4, maxSec: 0.6 }, speed: { min: 0.8, max: 1.5, targets: ["aroll_nonspeech", "broll"] },
      transitions: { max: 3, spacing: 12 }, sfx: { per60: 5, spacing: 3, volume: [0.25, 0.4] }, graphicsPer60: 2,
      captions: { highlight: "color", entry: "pop", emphasisScale: 1.12 },
    },
  },
  common: {
    windowSec: 60, tailGuardSec: 2.0, padInSec: 0.1, padOutSec: 0.15, jointExtendSec: 0.4, jointBonus: 0.1, anchorOverlapSec: 0.5,
    punchOutMinJointSec: 0.4, punchOutMaxSec: 4, punchOutDefaultSec: 3, punchOutMarkSec: 0.1, zoomEmphasisDeltaZ: 0.1,
    sfxFillerJointSec: 0.3, sfxLeadSec: { whoosh: -0.1, swoosh: -0.1, riser: -0.6 },
    keywordSec: 2.5, hookTitleWindowSec: 3, hookTitleMaxSec: 2.5, hookStrengthMin: 0.5, cardMinSec: 1.0, ctaTailSec: 0.3,
    transitionMinPauseSec: 0.3, transitionSec: { DIP_BLACK: 0.2, FLASH: 0.12, CROSSFADE: 0.4, ZOOM_IN: 0.35, WHIP_LEFT: 0.3, WHIP_RIGHT: 0.3, SLIDE_UP: 0.35 }, overlayMinSec: 0.4, pipScale: 0.4,
    music: { calm: 0.08, energetic: 0.12, calmBelow: 0.4, energeticFrom: 0.7, min: 0.06, max: 0.16, lift: 0.04, faceRequired: 0.06, duckDb: -9, fadeInSec: 0.5, fadeOutSec: 1.5 },
  },
});

const r3 = (x) => Math.round(x * 1000) / 1000;
const r6 = (x) => Math.round(x * 1e6) / 1e6;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const cmpStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const EPS = 1e-6;

function invalid(detail) {
  return new EditError("INVALID_RHYTHM_INPUT", { status: 422, errorClass: "input", detail });
}

function maxInWindow(times, windowSec = 60) {
  const t = (times || []).filter(Number.isFinite).slice().sort((a, b) => a - b);
  let best = 0;
  for (let i = 0, j = 0; i < t.length; i++) {
    while (t[i] - t[j] >= windowSec - 1e-9) j++;
    best = Math.max(best, i - j + 1);
  }
  return best;
}

function unionLength(spans) {
  const s = (spans || []).map((x) => [x.outIn, x.outOut]).filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0]);
  let total = 0, a = null, b = null;
  for (const [x, y] of s) {
    if (b == null || x > b) { if (b != null) total += b - a; a = x; b = y; } else b = Math.max(b, y);
  }
  if (b != null) total += b - a;
  return total;
}

const overlaps = (a, b) => Math.min(a.outOut, b.outOut) - Math.max(a.outIn, b.outIn) > EPS;

// Largest sub-interval of `span` outside every block, preferring the one that keeps most of `anchor`.
function fitFree(span, blocks, anchor, { minDur, maxDur, outDur }) {
  const hits = blocks.filter((b) => overlaps(b, span)).sort((a, b) => a.outIn - b.outIn || a.outOut - b.outOut);
  if (!hits.length) return { best: { outIn: span.outIn, outOut: span.outOut }, rule: null };
  let rule = null, most = -1;
  for (const b of hits) {
    const ov = Math.min(b.outOut, span.outOut) - Math.max(b.outIn, span.outIn);
    if (ov > most + 1e-9) { most = ov; rule = b.rule; }
  }
  const free = [];
  let cur = span.outIn;
  for (const b of hits) {
    if (b.outIn > cur + EPS) free.push({ outIn: cur, outOut: Math.min(b.outIn, span.outOut) });
    cur = Math.max(cur, b.outOut);
    if (cur >= span.outOut) break;
  }
  if (cur < span.outOut - EPS) free.push({ outIn: cur, outOut: span.outOut });
  let best = null, key = null;
  for (const f of free) {
    const k = [Math.max(0, Math.min(f.outOut, anchor.outOut) - Math.max(f.outIn, anchor.outIn)), f.outOut - f.outIn];
    if (!best || k[0] > key[0] + 1e-9 || (Math.abs(k[0] - key[0]) <= 1e-9 && k[1] > key[1] + 1e-9)) { best = { ...f }; key = k; }
  }
  if (best && best.outOut - best.outIn < minDur - 1e-9) {
    // too short after clipping the start: try to grow forward up to the next block, within maxDur
    const nextBlock = Math.min(outDur, ...blocks.filter((b) => b.outIn >= best.outOut - EPS).map((b) => b.outIn));
    const end = Math.min(best.outIn + Math.max(minDur, Math.min(maxDur, best.outOut - best.outIn)), nextBlock);
    if (end - best.outIn >= minDur - 1e-9) best.outOut = end;
  }
  return { best, rule };
}

function selectEdits(ctx = {}) {
  const { plan, opportunities = null, words, sentences, content = null, faces = null, shaky = [], keep = "locked", brollSlots = null } = ctx;
  const slots = normalizeSlots(brollSlots);
  if (!plan || !plan.source || !plan.settings || !plan.output || !plan.captions) throw invalid("selectEdits: a plan is required");
  if (!Array.isArray(words) || !Array.isArray(sentences)) throw invalid("selectEdits: words and sentences arrays are required");
  const settings = ctx.settings || plan.settings;
  const opps = opportunities || O.emptyOpportunities();
  const B = RHYTHM_DEFAULTS.broll[settings.brollIntensity] || RHYTHM_DEFAULTS.broll.medium;
  const E = RHYTHM_DEFAULTS.effects[settings.effects] || RHYTHM_DEFAULTS.effects.subtle;
  const C = RHYTHM_DEFAULTS.common;
  const origin = opps.source === "ai" ? "ai" : "heuristic";
  const aspect = plan.output.aspect;
  const lang = L.langCode(plan.source.language);
  const D = plan.source.durationSec;

  const adjustments = [];
  const log = (elementId, rule, action = "dropped") => adjustments.push({ elementId: String(elementId).slice(0, 48), rule, action });

  // ------------------------------------------------------------ kept elements (placed first, consume budget)
  const pinned = (el) => el.origin === "user" || el.locked === true || el.userModified === true;
  const tomb = (el) => el.status === "removed" || (el.enabled === false && el.userModified === true);
  const keepEl = (el) => (keep === "none" ? tomb(el) : pinned(el) || tomb(el));
  const keptBroll = (plan.broll || []).filter(keepEl);
  const keptEffects = (plan.effects || []).filter(keepEl);
  const keptGraphics = (plan.graphics || []).filter(keepEl);
  const keptTransitions = keep === "none" ? [] : (plan.transitions || []).filter((t) => t.origin === "user" || t.locked === true);
  const keptSfx = keep === "none" ? [] : (plan.sfx || []).filter((s) => s.origin === "user" || s.locked === true);
  const keptMusic = keep !== "none" && plan.music && (plan.music.locked === true || plan.music.origin === "user") ? plan.music : null;

  // ------------------------------------------------------------ timeline
  const built = T.buildPieces(plan, { words, settings, effects: keptEffects });
  const map = T.buildTimeMap(built.pieces);
  const outDur = built.outDurationSec;
  const pieces = built.pieces;

  const used = new Set(collectIds(plan).map((x) => x.id));
  const counters = {};
  const mint = (prefix) => {
    let n = counters[prefix] || 0, id;
    do { n++; id = `${prefix}_${String(n).padStart(3, "0")}`; } while (used.has(id));
    counters[prefix] = n;
    used.add(id);
    return id;
  };
  let nextOrdinal = Math.max(0, ...(plan.broll || []).map((b) => (Number.isInteger(b.ordinal) ? b.ordinal : 0))) + 1;

  const wordCache = new Map();
  const wordOut = (i) => {
    if (!wordCache.has(i)) wordCache.set(i, words[i] ? map.resolveAnchor({ kind: "words", w0: i, w1: i }, words, { minDur: 2 / FPS }) : { outIn: 0, outOut: 0, collapsed: true });
    return wordCache.get(i);
  };
  const keptWords = (w0, w1) => { const r = []; for (let i = w0; i <= w1; i++) if (!wordOut(i).collapsed) r.push(i); return r; };
  const sentById = new Map(sentences.map((s) => [s.id, s]));
  const sentOrder = new Map(sentences.map((s, k) => [s.id, k]));
  const sentSpan = (s) => {
    if (!s) return null;
    const kw = keptWords(s.w0, s.w1);
    return kw.length ? { outIn: wordOut(kw[0]).outIn, outOut: wordOut(kw[kw.length - 1]).outOut, first: kw[0], last: kw[kw.length - 1] } : null;
  };
  const toSrcAnchor = (a, b) => ({ kind: "src", srcIn: map.outToSrc(a), srcOut: map.outToSrc(b) });
  const resolveSrc = (anchor, minDur) => map.resolveSrcSpan(anchor.srcIn, anchor.srcOut, { minDur });
  const spanOfEl = (el, minDur) => map.resolveAnchor(el.anchor, words, { minDur });
  const segments = (plan.aRoll && plan.aRoll.segments) || [];
  const segmentOf = (sid) => { const seg = segments.find((sg) => sg.sentenceIds.includes(sid)); return seg ? seg.id : null; };

  // ------------------------------------------------------------ content signals
  const faceReq = new Set();
  const ctaIds = new Set();
  const hookIds = new Set();
  let hookStrength = 0;
  if (content) {
    for (const f of content.faceRequired || []) if (f && sentById.has(f.sentenceId)) faceReq.add(f.sentenceId);
    if (content.cta) for (const id of content.cta.sentenceIds || []) if (sentById.has(id)) ctaIds.add(id);
    if (content.hook) { for (const id of content.hook.sentenceIds || []) if (sentById.has(id)) hookIds.add(id); hookStrength = Number(content.hook.strength) || 0; }
  } else {
    for (const seg of segments) if (seg.faceRequired) seg.sentenceIds.forEach((id) => faceReq.add(id));
    for (const seg of segments) if (seg.type === "HOOK") seg.sentenceIds.forEach((id) => hookIds.add(id));
    hookStrength = hookIds.size && opps.hookTitle ? C.hookStrengthMin : 0;
  }
  for (const seg of segments) if (seg.type === "CTA") seg.sentenceIds.forEach((id) => { if (sentById.has(id)) ctaIds.add(id); });
  const emphasisWords = new Map();
  for (const e of (content && content.emphasis) || []) {
    const s = e && sentById.get(e.sentenceId);
    const m = s ? L.matchPhrase(words, s.w0, s.w1, e.wordText, lang) : null;
    if (m) for (let i = m.w0; i <= m.w1; i++) emphasisWords.set(i, true);
  }

  // ------------------------------------------------------------ protected moments
  const R = (span, rule) => ({ outIn: span.outIn, outOut: span.outOut, rule });
  const sentRanges = (ids, rule) => [...ids].map((id) => sentSpan(sentById.get(id))).filter(Boolean).map((sp) => R(sp, rule));
  const srcRanges = (list, rule) => (Array.isArray(list) ? list : [])
    .filter((r) => r && Number.isFinite(r.start) && Number.isFinite(r.end) && r.end > r.start)
    .map((r) => map.resolveSrcSpan(r.start, r.end)).filter((r) => !r.collapsed).map((r) => R(r, rule));
  const prot = {
    hook: [R({ outIn: 0, outOut: B.hookGuard }, "protected_hook")],
    face: sentRanges(faceReq, "protected_face_required"),
    cta: [...sentRanges(ctaIds, "protected_cta"),
      ...segments.filter((sg) => sg.type === "CTA").map((sg) => spanOfEl(sg, 2 / FPS)).filter((r) => !r.collapsed).map((r) => R(r, "protected_cta"))],
    tail: [R({ outIn: Math.max(0, outDur - C.tailGuardSec), outOut: outDur + 1 }, "protected_tail")],
    screen: segments.filter((sg) => sg.type === "SCREEN_CONTENT").map((sg) => spanOfEl(sg, 2 / FPS)).filter((r) => !r.collapsed).map((r) => R(r, "protected_screen")),
    absent: faces && faces.mode !== "assumed" ? srcRanges(faces.absent, "face_absent") : [],
    shaky: srcRanges(shaky, "shaky"),
  };
  const overlayBlocks = () => [...prot.hook, ...prot.face, ...prot.cta, ...prot.tail, ...prot.screen];

  // joints (hard cuts that remove source time)
  const joints = [];
  for (let i = 0; i + 1 < pieces.length; i++) {
    const a = pieces[i], b = pieces[i + 1];
    if (b.srcIn - a.srcOut <= EPS) continue;
    const filler = built.cuts.some((g) => g.kinds.includes("FILLER") && g.srcIn >= a.srcOut - EPS && g.srcOut <= b.srcIn + EPS);
    joints.push({ t: a.outOut, removedSec: r6(b.srcIn - a.srcOut), filler });
  }

  // ------------------------------------------------------------ accepted state
  const liveBroll = (b) => b.status === "pending" || b.status === "ok";
  const accB = keptBroll.filter(liveBroll).map((el) => ({ el, ...spanOfEl(el, C.overlayMinSec), layout: el.layout, kept: true, sentenceId: el.sentenceId }))
    .filter((x) => !x.collapsed);
  const usedAssets = new Set(keptBroll.filter(liveBroll).map((b) => b.chosen && b.chosen.assetId).filter(Boolean));
  const accG = keptGraphics.filter((g) => g.enabled).map((el) => ({ el, ...spanOfEl(el, C.overlayMinSec), kind: el.kind, kept: true, sentenceId: el.evidence ? el.evidence.sentenceId : null }))
    .filter((x) => !x.collapsed);
  const region = plan.captions.position && plan.captions.position.policy === "top" ? "bottom" : "top";
  const tombGraphic = (kind, sid) => keptGraphics.some((g) => tomb(g) && g.kind === kind && (sid == null || (g.evidence && g.evidence.sentenceId === sid)));

  const makeGraphic = (opp, outIn, outOut) => {
    const anchor = toSrcAnchor(outIn, outOut);
    const resolved = resolveSrc(anchor, C.overlayMinSec);
    const text = { title: opp.title };
    if (opp.subtitle) text.subtitle = opp.subtitle;
    if (opp.value) text.value = opp.value;
    const el = {
      id: mint("gfx"), kind: opp.kind, anchor, resolved, text, templateId: opp.kind.toLowerCase(), variables: {}, region,
      renderer: "hyperframes", fallback: "ass", render: { cardHash: null, path: null, status: "pending" }, enabled: true,
      reason: O.truncate(opp.reason || `${opp.kind.toLowerCase()} card`, 160), reasonCode: `GRAPHIC_${opp.kind}`, evidence: { sentenceId: opp.sentenceId },
      origin, locked: false, userModified: false,
    };
    accG.push({ el, outIn: resolved.outIn, outOut: resolved.outOut, kind: opp.kind, kept: false, sentenceId: opp.sentenceId });
    return el;
  };
  const byPriority = (list, timeOf) => list.map((o) => ({ o, t: timeOf(o) }))
    .sort((a, b) => b.o.priority - a.o.priority || (a.t == null ? Infinity : a.t) - (b.t == null ? Infinity : b.t) || cmpStr(a.o.id, b.o.id))
    .map((x) => x.o);
  const oppTime = (o) => { const sp = sentSpan(sentById.get(o.sentenceId)); return sp ? sp.outIn : null; };
  const gOpps = byPriority(opps.graphics || [], oppTime);

  // ------------------------------------------------------------ structural cards: HOOK_TITLE, CTA, LOGO_OUTRO
  for (const opp of gOpps.filter((g) => g.kind === "HOOK_TITLE")) {
    if (accG.some((g) => g.kind === "HOOK_TITLE")) { log(opp.id, "kept_user"); continue; }
    if (tombGraphic("HOOK_TITLE")) { log(opp.id, "tombstoned"); continue; }
    if (hookStrength < C.hookStrengthMin - 1e-9) { log(opp.id, "hook_strength"); continue; }
    const sp = sentSpan(sentById.get(opp.sentenceId));
    if (!sp) { log(opp.id, "collapsed"); continue; }
    if (sp.outIn >= C.hookTitleWindowSec - 1e-9) { log(opp.id, "hook_window"); continue; }
    let end = Math.min(sp.outOut, sp.outIn + C.hookTitleMaxSec);
    if (end - sp.outIn < C.cardMinSec) end = Math.min(outDur, sp.outIn + C.cardMinSec);
    const span = { outIn: sp.outIn, outOut: end };
    if (accG.some((g) => overlaps(g, span))) { log(opp.id, "overlap"); continue; }
    makeGraphic(opp, span.outIn, span.outOut);
  }
  for (const opp of gOpps.filter((g) => g.kind === "CTA")) {
    if (accG.some((g) => g.kind === "CTA")) { log(opp.id, "kept_user"); continue; }
    if (tombGraphic("CTA")) { log(opp.id, "tombstoned"); continue; }
    if (!ctaIds.size) { log(opp.id, "no_cta"); continue; }
    if (!ctaIds.has(opp.sentenceId)) { log(opp.id, "not_cta_sentence"); continue; }
    const sp = sentSpan(sentById.get(opp.sentenceId));
    if (!sp) { log(opp.id, "collapsed"); continue; }
    let end = Math.min(outDur, sp.outOut + C.ctaTailSec);
    if (end - sp.outIn < C.cardMinSec) end = Math.min(outDur, sp.outIn + C.cardMinSec);
    const span = { outIn: sp.outIn, outOut: end };
    if (end - sp.outIn < C.overlayMinSec) { log(opp.id, "duration"); continue; }
    if (accG.some((g) => overlaps(g, span))) { log(opp.id, "overlap"); continue; }
    makeGraphic(opp, span.outIn, span.outOut);
  }
  for (const opp of gOpps.filter((g) => g.kind === "LOGO_OUTRO")) {
    if (!plan.branding || !plan.branding.logo) { log(opp.id, "no_logo"); continue; }
    if (accG.some((g) => g.kind === "LOGO_OUTRO") || tombGraphic("LOGO_OUTRO")) { log(opp.id, "kept_user"); continue; }
    const span = { outIn: Math.max(0, outDur - C.tailGuardSec), outOut: outDur };
    if (accG.some((g) => overlaps(g, span))) { log(opp.id, "overlap"); continue; }
    makeGraphic(opp, span.outIn, span.outOut);
  }

  // ------------------------------------------------------------ B-roll
  const tombSentences = new Set(keptBroll.filter((b) => b.status === "removed" && b.sentenceId).map((b) => b.sentenceId));
  const stemSet = (texts) => {
    const s = new Set();
    for (const q of texts) for (const t of L.tokenize(q, lang)) { s.add(L.stem(t.norm, lang)); if ([...t.norm].length >= 4) s.add(`p:${[...t.norm].slice(0, 4).join("")}`); }
    return s;
  };
  const densest = (kw, keys) => {
    let best = null;
    for (let a = 0; a < kw.length; a++) {
      const t0 = wordOut(kw[a]).outIn - C.padInSec;
      let b = a, hits = 0;
      for (let k = a; k < kw.length; k++) {
        if (wordOut(kw[k]).outOut + C.padOutSec - t0 > B.maxDur + 1e-9 && k > a) break;
        b = k;
        if (keys.has(kw[k])) hits++;
      }
      if (!best || hits > best.hits) best = { a, b, hits };
    }
    return { first: kw[best.a], last: kw[best.b] };
  };

  const cands = [];
  for (const opp of opps.brollOpportunities || []) {
    const s = sentById.get(opp.sentenceId);
    if (!s) { log(opp.id, "unknown_sentence"); continue; }
    if (tombSentences.has(s.id)) { log(opp.id, "tombstoned"); continue; }
    if (slots && !slotAccepted(slots.get(s.id), settings.brollIntensity)) { log(opp.id, "no_accepted_candidate"); continue; }
    const a0 = opp.wordAnchor ? opp.wordAnchor.w0 : s.w0, a1 = opp.wordAnchor ? opp.wordAnchor.w1 : s.w1;
    const kw = keptWords(a0, a1);
    if (!kw.length) { log(opp.id, "collapsed"); continue; }
    let first = kw[0], last = kw[kw.length - 1];
    if (wordOut(last).outOut - wordOut(first).outIn + C.padInSec + C.padOutSec > B.maxDur + 1e-9) {
      const stems = stemSet(opp.queries || []);
      const keys = new Set(kw.filter((i) => {
        if (emphasisWords.has(i)) return true;
        const n = L.normWord(words[i].text);
        return stems.has(L.stem(n, lang)) || ([...n].length >= 4 && stems.has(`p:${[...n].slice(0, 4).join("")}`));
      }));
      ({ first, last } = densest(kw, keys));
    }
    const wordsIn = wordOut(first).outIn, wordsOut = wordOut(last).outOut;
    const start = Math.max(0, wordsIn - C.padInSec);
    let end = Math.min(outDur, wordsOut + C.padOutSec);
    const j = joints.find((jt) => jt.t >= end - 1e-9 && jt.t - end <= C.jointExtendSec + 1e-9);
    if (j) end = j.t;
    const coversJoint = joints.some((jt) => jt.t > start + EPS && jt.t < end - EPS);
    cands.push({ opp, s, first, last, wordsIn, wordsOut, start, end, priority: r3(opp.priority + (coversJoint ? C.jointBonus : 0)) });
  }
  cands.sort((a, b) => b.priority - a.priority || a.start - b.start || cmpStr(a.opp.id, b.opp.id));

  const gapViolation = (cand) => {
    const all = [...accB, cand].sort((a, b) => a.outIn - b.outIn);
    for (let k = 0; k + 1 < all.length; k++) {
      const a = all[k], b = all[k + 1];
      if (a !== cand && b !== cand) continue;
      const gap = b.outIn - a.outOut;
      if (gap >= B.minGap - 1e-9) continue;
      const b2b = B.backToBackFull.allowed && a.layout === "FULL" && b.layout === "FULL" && gap < B.minFaceAfterFull - 1e-9;
      if (!b2b) return a.layout === "FULL" && gap < B.minFaceAfterFull - 1e-9 ? "face_after_full" : "min_gap";
    }
    if (B.backToBackFull.allowed) {
      let run = [all[0]];
      const runs = [];
      for (let k = 1; k < all.length; k++) {
        const prev = all[k - 1], cur = all[k];
        if (prev.layout === "FULL" && cur.layout === "FULL" && cur.outIn - prev.outOut < B.minFaceAfterFull - 1e-9) run.push(cur);
        else { runs.push(run); run = [cur]; }
      }
      runs.push(run);
      const mine = runs.find((rn) => rn.includes(cand));
      if (mine && mine.length > 1 && (mine.length > B.backToBackFull.maxRun || mine[mine.length - 1].outOut - mine[0].outIn > B.backToBackFull.maxRunSec + 1e-9)) return "back_to_back";
    }
    return null;
  };

  for (const c of cands) {
    const { opp, s } = c;
    if (c.priority < B.threshold - 1e-9) { log(opp.id, "priority_threshold"); continue; }
    let start = c.start, end = c.end, adjusted = null;
    if (end - start > B.maxDur + 1e-9) { end = start + B.maxDur; adjusted = "shortened"; }
    if (end - start < B.minDur - 1e-9) {
      end = Math.min(outDur, start + B.minDur);
      if (end - start < B.minDur - 1e-9) start = Math.max(0, end - B.minDur);
      adjusted = "moved";
    }
    const blocks = [...overlayBlocks(), ...prot.absent, ...accG.map((g) => ({ outIn: g.outIn, outOut: g.outOut, rule: "graphic_overlap" }))];
    const fit = fitFree({ outIn: start, outOut: end }, blocks, { outIn: c.wordsIn, outOut: c.wordsOut }, { minDur: B.minDur, maxDur: B.maxDur, outDur });
    if (!fit.best || fit.best.outOut - fit.best.outIn < B.minDur - 1e-9 || blocks.some((b) => overlaps(b, fit.best))) { log(opp.id, fit.rule || "duration"); continue; }
    if (Math.abs(fit.best.outIn - start) > EPS || Math.abs(fit.best.outOut - end) > EPS) adjusted = adjusted || "moved";
    start = fit.best.outIn; end = fit.best.outOut;
    if (accB.some((o) => overlaps(o, { outIn: start, outOut: end }))) { log(opp.id, "overlap"); continue; }
    const allowed = B.maxCoverage * outDur - unionLength(accB);
    if (allowed < end - start - 1e-9) {
      if (allowed >= B.minDur - 1e-9) { end = start + allowed; adjusted = "shortened"; } else { log(opp.id, "coverage"); continue; }
    }
    // clipping and growing must never slide a visual off the words it illustrates onto a neighbour
    const anchorOverlap = Math.max(0, Math.min(end, c.wordsOut) - Math.max(start, c.wordsIn));
    if (anchorOverlap < Math.min(C.anchorOverlapSec, 0.5 * (c.wordsOut - c.wordsIn)) - 1e-9) { log(opp.id, fit.rule || "anchor_lost"); continue; }
    if (maxInWindow([...accB.map((o) => o.outIn), start], C.windowSec) > B.maxPer60) { log(opp.id, "window_cap"); continue; }
    let layout = opp.layoutPreference;
    if (layout === "SPLIT" && aspect === "1:1") { layout = "FULL"; adjusted = adjusted || "moved"; }
    const cand = { outIn: start, outOut: end, layout };
    const gapRule = gapViolation(cand);
    if (gapRule) { log(opp.id, gapRule); continue; }
    const faceTail = layout === "FULL" ? Math.max(C.tailGuardSec, B.minFaceAfterFull) : C.tailGuardSec;
    if (end > outDur - faceTail + 1e-9) { log(opp.id, "end_on_face"); continue; }
    if (start < B.hookGuard - 1e-9) { log(opp.id, "start_on_face"); continue; }

    const anchor = toSrcAnchor(start, end);
    const resolved = resolveSrc(anchor, C.overlayMinSec);
    if (resolved.collapsed) { log(opp.id, "collapsed"); continue; }
    const face = T.faceAt(faces, words[c.first].start);
    const layoutParams = layout === "PIP" ? { corner: face.cx >= 0.5 ? "tl" : "tr", scale: C.pipScale } : layout === "SPLIT" && aspect === "9:16" ? { splitSide: "top" } : {};
    const el = {
      id: mint("br"), ordinal: nextOrdinal++, anchor, resolved, sentenceId: s.id, segmentId: segmentOf(s.id), layout, layoutParams,
      intent: layout === "PIP" ? "context" : "illustrate",
      queries: opp.queries.slice(0, 8).map((q) => ({ text: O.truncate(q, 80), kind: q.split(/\s+/).length >= 3 ? "scene" : "visual_noun" })),
      reason: O.truncate(opp.reason || "B-roll opportunity", 160), reasonCode: "BROLL_OPPORTUNITY",
      evidence: { sentenceId: s.id, wordRange: [c.first, c.last], quote: O.truncate(words.slice(c.first, c.last + 1).map((w) => w.text).join(" "), 80) },
      chosen: null, candidateSetId: null, topCandidates: [], judge: "ok", status: "pending", origin, locked: false, userModified: false,
    };
    if (slots && attachFromSlot(el, slots.get(s.id), usedAssets)) usedAssets.add(el.chosen.assetId);
    if (adjusted) log(el.id, "rhythm_fit", adjusted);
    accB.push({ el, outIn: resolved.outIn, outOut: resolved.outOut, layout, kept: false, sentenceId: s.id });
  }

  // ------------------------------------------------------------ punch-ins / ZOOM_EMPHASIS / FREEZE
  const fxOut = keptEffects.slice();
  const emph = keptEffects.filter((e) => (e.kind === "PUNCH_IN" || e.kind === "ZOOM_EMPHASIS") && e.enabled && !tomb(e))
    .map((e) => ({ kind: e.kind, t: spanOfEl(e, 2 / FPS).outIn }));
  const tombTimes = keptEffects.filter((e) => tomb(e) && (e.kind === "PUNCH_IN" || e.kind === "ZOOM_EMPHASIS")).map((e) => spanOfEl(e, 2 / FPS).outIn);
  const fullAt = (t) => accB.some((b) => b.layout === "FULL" && t >= b.outIn - EPS && t < b.outOut);
  const punchBySentence = new Map();
  const pOpps = byPriority((opps.punchIns || []).filter((o) => Number.isInteger(o.w)), (o) => (words[o.w] ? wordOut(o.w).outIn : null));
  for (const o of pOpps) {
    const r = wordOut(o.w);
    if (!words[o.w] || r.collapsed) { log(o.id, "collapsed"); continue; }
    const t = r.outIn;
    if (o.kind === "ZOOM_EMPHASIS" && !E.zoomEmphasis) { log(o.id, "effects_level"); continue; }
    if (tombTimes.some((x) => Math.abs(x - t) < 0.2)) { log(o.id, "tombstoned"); continue; }
    if (prot.shaky.some((p) => t >= p.outIn - EPS && t < p.outOut)) { log(o.id, "shaky"); continue; }
    if (fullAt(t)) { log(o.id, "under_full_broll"); continue; }
    if (emph.some((e) => Math.abs(e.t - t) < E.punchSpacing - 1e-9)) { log(o.id, "spacing"); continue; }
    const cap = o.kind === "ZOOM_EMPHASIS" ? E.zoomEmphasis.per60 : E.punchPer60;
    if (maxInWindow([...emph.filter((e) => e.kind === o.kind).map((e) => e.t), t], C.windowSec) > cap) { log(o.id, "window_cap"); continue; }
    const evidence = { sentenceId: o.sentenceId, wordRange: [o.w, Number.isInteger(o.w1) ? o.w1 : o.w] };
    const reason = O.truncate(o.reason || "emphasis", 160);
    if (o.kind === "PUNCH_IN") {
      const nj = joints.find((jt) => jt.t > t + C.punchOutMinJointSec + 1e-9 && jt.t <= t + C.punchOutMaxSec + 1e-9);
      const end = nj ? nj.t : Math.min(outDur, t + C.punchOutDefaultSec);
      if (end - t < C.overlayMinSec - 1e-9) { log(o.id, "duration"); continue; }
      const anchor = toSrcAnchor(t, end);
      const id = mint("fx");
      fxOut.push({ id, kind: "PUNCH_IN", anchor, resolved: resolveSrc(anchor, 2 / FPS), zoom: E.punchZoom, center: "face", enabled: true, reason, reasonCode: "EMPHASIS", evidence, origin, locked: false, userModified: false });
      if (end < outDur - C.punchOutMarkSec - 2 / FPS) {
        const outAnchor = toSrcAnchor(end, end + C.punchOutMarkSec);
        fxOut.push({ id: mint("fx"), kind: "PUNCH_OUT", anchor: outAnchor, resolved: resolveSrc(outAnchor, 2 / FPS), toZoom: 1, enabled: true, reason: "return to the base framing", reasonCode: "EMPHASIS_END", evidence, origin, locked: false, userModified: false });
      }
      if (!punchBySentence.has(o.sentenceId)) punchBySentence.set(o.sentenceId, { id, t });
    } else {
      const Z = E.zoomEmphasis;
      const end = Math.min(outDur, t + clamp(r.outOut - r.outIn, Z.minSec, Z.maxSec));
      if (end - t < Z.minSec - 1e-9) { log(o.id, "duration"); continue; }
      const anchor = toSrcAnchor(t, end);
      const id = mint("fx");
      fxOut.push({ id, kind: "ZOOM_EMPHASIS", anchor, resolved: resolveSrc(anchor, 2 / FPS), fromZoom: 1, toZoom: r3(1 + Math.min(Z.maxDeltaZ, C.zoomEmphasisDeltaZ)),
        durationSec: r3(end - t), ease: "smoothstep", enabled: true, reason, reasonCode: "EMPHASIS", evidence, origin, locked: false, userModified: false });
      if (!punchBySentence.has(o.sentenceId)) punchBySentence.set(o.sentenceId, { id, t });
    }
    emph.push({ kind: o.kind, t });
  }

  if (E.freeze && ctaIds.size && !keptEffects.some((e) => e.kind === "FREEZE")) {
    const cta = sentences.filter((s) => ctaIds.has(s.id)).sort((a, b) => sentOrder.get(a.id) - sentOrder.get(b.id))[0];
    const kw = keptWords(cta.w0, cta.w1);
    let k = cta.w0 - 1;
    while (k >= 0 && wordOut(k).collapsed) k--;
    if (!kw.length || k < 0) log("freeze", "collapsed");
    else {
      const prevW = words[k], nextW = words[kw[0]];
      const atSrc = r6(Math.min(prevW.end + 0.05, (prevW.end + nextW.start) / 2));
      const tOut = map.srcToOutStart(atSrc);
      if (nextW.start - prevW.end < C.transitionMinPauseSec - 1e-9) log("freeze", "short_pause");
      else if (accB.some((b) => tOut > b.outIn - EPS && tOut < b.outOut + EPS)) log("freeze", "under_broll");
      else {
        const anchor = { kind: "words", w0: kw[0], w1: kw[kw.length - 1] };
        fxOut.push({ id: mint("fx"), kind: "FREEZE", anchor, resolved: map.resolveAnchor(anchor, words, { minDur: 2 / FPS }), atSrc,
          holdSec: r3((E.freeze.minSec + E.freeze.maxSec) / 2), enabled: true, reason: "short hold before the call to action", reasonCode: "FREEZE_BEFORE_CTA",
          evidence: { sentenceId: cta.id }, origin, locked: false, userModified: false });
      }
    }
  }

  // ------------------------------------------------------------ KEYWORD / STAT / LOWER_THIRD
  const capKinds = new Set(["KEYWORD", "STAT", "LOWER_THIRD"]);
  for (const opp of gOpps.filter((g) => capKinds.has(g.kind))) {
    if (tombGraphic(opp.kind, opp.sentenceId)) { log(opp.id, "tombstoned"); continue; }
    const s = sentById.get(opp.sentenceId);
    const sp = sentSpan(s);
    const w = Number.isInteger(opp.w) && !wordOut(opp.w).collapsed ? opp.w : sp ? sp.first : null;
    if (w == null) { log(opp.id, "collapsed"); continue; }
    const start = Math.max(0, wordOut(w).outIn - C.padInSec);
    const span = { outIn: start, outOut: start + C.keywordSec };
    if (span.outOut > outDur + EPS) { log(opp.id, "protected_tail"); continue; }
    const block = overlayBlocks().find((p) => overlaps(p, span));
    if (block) { log(opp.id, block.rule); continue; }
    if (accB.some((b) => b.layout === "FULL" && overlaps(b, span))) { log(opp.id, "needs_clear_time"); continue; }
    if (accG.some((g) => overlaps(g, span))) { log(opp.id, "overlap"); continue; }
    if (maxInWindow([...accG.filter((g) => capKinds.has(g.kind)).map((g) => g.outIn), start], C.windowSec) > E.graphicsPer60) { log(opp.id, "window_cap"); continue; }
    makeGraphic(opp, span.outIn, span.outOut);
  }

  // ------------------------------------------------------------ transitions
  const trOut = keptTransitions.slice();
  const segSpan = (seg) => spanOfEl(seg, 2 / FPS);
  const segById = new Map(segments.map((sg) => [sg.id, sg]));
  const nonCut = keptTransitions.filter((t) => t.kind !== "CUT" && t.enabled)
    .map((t) => (t.at && Number.isFinite(t.at.outAt) ? t.at.outAt : t.at && segById.has(t.at.elementId) ? segSpan(segById.get(t.at.elementId)).outOut : null))
    .filter(Number.isFinite);
  const transitionBySentence = new Map();
  for (const opp of opps.transitions || []) {
    const idx = segments.findIndex((sg) => sg.sentenceIds[sg.sentenceIds.length - 1] === opp.afterSentenceId);
    if (idx < 0 || idx >= segments.length - 1) { log(opp.id, "not_boundary"); continue; }
    const seg = segments[idx], nextSeg = segments[idx + 1];
    const a = sentSpan(sentById.get(opp.afterSentenceId)), b = sentSpan(sentById.get(nextSeg.sentenceIds[0]));
    if (!a || !b) { log(opp.id, "collapsed"); continue; }
    if (b.outIn - a.outOut < C.transitionMinPauseSec - 1e-9) { log(opp.id, "short_pause"); continue; }
    const jt = segSpan(seg).outOut;
    if (accB.some((x) => x.layout === "FULL" && jt > x.outIn - EPS && jt < x.outOut + EPS)) { log(opp.id, "under_full_broll"); continue; }
    if (nonCut.length >= E.transitions.max) { log(opp.id, "transition_cap"); continue; }
    if (nonCut.some((x) => Math.abs(x - jt) < E.transitions.spacing - 1e-9)) { log(opp.id, "spacing"); continue; }
    const el = { id: mint("tr"), kind: opp.kind, at: { joint: "after", elementId: seg.id }, durationSec: C.transitionSec[opp.kind] || 0.2, enabled: true,
      reason: O.truncate(opp.reason || "topic change", 160), reasonCode: "TOPIC_CHANGE", origin, locked: false };
    trOut.push(el);
    nonCut.push(jt);
    transitionBySentence.set(opp.afterSentenceId, { id: nextSeg.id, t: segSpan(nextSeg).outIn });
  }

  // ------------------------------------------------------------ SFX
  const spanById = new Map();
  for (const sg of segments) spanById.set(sg.id, segSpan(sg));
  for (const x of accB) spanById.set(x.el.id, { outIn: x.outIn, outOut: x.outOut });
  for (const x of accG) spanById.set(x.el.id, { outIn: x.outIn, outOut: x.outOut });
  for (const e of fxOut) spanById.set(e.id, e.resolved || spanOfEl(e, 2 / FPS));
  const sfxOut = [];
  const accS = [];
  for (const sx of keptSfx) {
    const sp = spanById.get(sx.anchor.elementId);
    if (!sp && !/^c_/.test(sx.anchor.elementId)) { log(sx.id, "anchor_removed"); continue; }
    sfxOut.push(sx);
    if (sp && sx.enabled) accS.push({ cue: sx.cue, outAt: clamp((sx.anchor.edge === "out" ? sp.outOut : sp.outIn) + sx.anchor.offsetSec, 0, outDur) });
  }
  const eventFor = (o) => {
    if (o.anchor === "broll_in") {
      const x = accB.filter((b) => !b.kept && b.sentenceId === o.ref).sort((a, b) => a.outIn - b.outIn)[0];
      return x ? { id: x.el.id, t: x.outIn, layout: x.layout } : null;
    }
    if (o.anchor === "graphic_in") {
      const x = accG.filter((g) => !g.kept && g.sentenceId === o.ref).sort((a, b) => a.outIn - b.outIn)[0];
      return x ? { id: x.el.id, t: x.outIn } : null;
    }
    if (o.anchor === "punch_in") return punchBySentence.get(o.ref) || null;
    if (o.anchor === "section_change") return transitionBySentence.get(o.ref) || null;
    return null;
  };
  if (settings.sfxEnabled === false) {
    for (const o of opps.sfx || []) log(o.id, "sfx_disabled");
  } else {
    const sOpps = byPriority(opps.sfx || [], (o) => { const ev = eventFor(o); return ev ? ev.t : null; });
    for (const o of sOpps) {
      const ev = eventFor(o);
      if (!ev) { log(o.id, "no_event"); continue; }
      if (origin === "heuristic" && o.anchor === "broll_in" && ev.layout !== "FULL") { log(o.id, "layout"); continue; }
      const offset = C.sfxLeadSec[o.cue] != null ? C.sfxLeadSec[o.cue] : 0;
      const outAt = r6(clamp(ev.t + offset, 0, outDur));
      const block = [...prot.hook, ...prot.face, ...prot.cta, ...prot.tail].find((p) => outAt >= p.outIn - 1e-9 && outAt < p.outOut);
      if (block) { log(o.id, block.rule); continue; }
      if (joints.some((jt) => jt.filler && Math.abs(jt.t - outAt) < C.sfxFillerJointSec - 1e-9)) { log(o.id, "filler_joint"); continue; }
      if (accS.some((x) => Math.abs(x.outAt - outAt) < E.sfx.spacing - 1e-9)) { log(o.id, "spacing"); continue; }
      if (maxInWindow([...accS.map((x) => x.outAt), outAt], C.windowSec) > E.sfx.per60) { log(o.id, "window_cap"); continue; }
      const sorted = accS.slice().sort((a, b) => a.outAt - b.outAt);
      const prev = sorted.filter((x) => x.outAt <= outAt).pop();
      const next = sorted.find((x) => x.outAt > outAt);
      if ((prev && prev.cue === o.cue) || (next && next.cue === o.cue)) { log(o.id, "same_cue"); continue; }
      sfxOut.push({
        id: mint("sfx"), cue: o.cue, path: null, anchor: { elementId: ev.id, edge: "in", offsetSec: offset }, resolved: { outAt, collapsed: false },
        volume: r3((E.sfx.volume[0] + E.sfx.volume[1]) / 2), license: "pending", attribution: null, enabled: true,
        reason: O.truncate(o.reason || `${o.cue} on ${o.anchor.replace("_", " ")}`, 160), reasonCode: `SFX_${o.anchor.toUpperCase()}`, origin, locked: false,
      });
      accS.push({ cue: o.cue, outAt });
    }
  }

  // ------------------------------------------------------------ music
  let music = keptMusic ? JSON.parse(JSON.stringify(keptMusic)) : null;
  const m = opps.music;
  if (!keptMusic) {
    if (settings.musicEnabled === false) { if (m && m.include) log("music", "music_disabled"); }
    else if (!m || !m.include) { if (m) log("music", "not_included"); }
    else {
      const M = C.music;
      const e = clamp(Number(m.energy) || 0, 0, 1);
      let v = e < M.calmBelow ? M.calm : e >= M.energeticFrom ? M.energetic : M.calm + ((e - M.calmBelow) / (M.energeticFrom - M.calmBelow)) * (M.energetic - M.calm);
      v = r3(clamp(v, M.min, M.max));
      const envelope = [];
      const firstWord = words.find((w) => w && Number.isFinite(w.start));
      if (firstWord && firstWord.start > 0.01) envelope.push({ anchor: { kind: "src", srcIn: 0, srcOut: r6(firstWord.start) }, volume: r3(v + M.lift) });
      for (const s of sentences) if (faceReq.has(s.id)) envelope.push({ anchor: { kind: "words", w0: s.w0, w1: s.w1 }, volume: M.faceRequired });
      const ctaLast = sentences.filter((s) => ctaIds.has(s.id)).pop();
      if (ctaLast && words[ctaLast.w1] && D - words[ctaLast.w1].end > 0.01) {
        envelope.push({ anchor: { kind: "src", srcIn: r6(words[ctaLast.w1].end), srcOut: r6(D) }, volume: r3(v + M.lift) });
      }
      music = {
        enabled: true,
        track: { assetId: null, path: null, provider: "pixabay_bridge", query: O.truncate(m.query || `${m.mood} background`, 80), mood: O.truncate(m.mood || "calm", 40), license: "pending", durationSec: 0 },
        candidates: [], volume: v, envelope: envelope.slice(0, 24), duck: { enabled: true, depthDb: M.duckDb },
        startOffsetSec: 0, fadeInSec: M.fadeInSec, fadeOutSec: M.fadeOutSec,
        reason: O.truncate(m.reason || `music mood ${m.mood}`, 160), reasonCode: "MUSIC_MOOD", origin, locked: false,
      };
    }
  }

  const timeOf = (el) => (el.resolved ? el.resolved.outIn : spanOfEl(el, 2 / FPS).outIn);
  const byTime = (a, b) => timeOf(a) - timeOf(b) || cmpStr(a.id, b.id);
  return {
    broll: [...keptBroll, ...accB.filter((x) => !x.kept).map((x) => x.el)].sort((a, b) => a.ordinal - b.ordinal || cmpStr(a.id, b.id)),
    effects: fxOut.sort(byTime),
    graphics: [...keptGraphics, ...accG.filter((x) => !x.kept).map((x) => x.el)].sort(byTime),
    sfx: sfxOut.sort((a, b) => ((a.resolved && a.resolved.outAt) || 0) - ((b.resolved && b.resolved.outAt) || 0) || cmpStr(a.id, b.id)),
    transitions: trOut.sort((a, b) => cmpStr(a.id, b.id)),
    music,
    adjustments,
  };
}

module.exports = { RULES_VERSION, RHYTHM_DEFAULTS, selectEdits, maxInWindow, unionLength, fitFree };
