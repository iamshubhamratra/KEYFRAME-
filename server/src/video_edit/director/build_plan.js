// VIDEO EDIT PLAN BUILDER — analysis artifacts -> Edit Plan revision 1, and "Regenerate with AI" (EDIT_PLAN.md §6).
//
// WHY THIS EXISTS. BUILDING_EDIT_PLAN is where every analysis stage meets: transcript words and
// sentences, filler / repeat / false-start / retake detections, the RMS envelope, the face track, the
// content analysis and the director's opportunities. The order matters and is fixed here once —
// segments from the content analysis -> cuts from the detections (timeline.js, each with its
// controlledBy switch) -> director opportunities (or the heuristic) -> rhythm selection -> B-roll items
// pending retrieval -> caption track from settings -> music / SFX -> branding -> resolvePlan -> parsePlan.
// A plan that fails parsePlan is never returned (our bug, errorClass 'bug'), and an LLM failure is never
// an edit failure: any director error except cancellation falls back to the heuristic director with
// provenance.director.fallback = true (ENGINE.md §6 "BUILDING_EDIT_PLAN"). Same inputs -> byte-identical
// plan: ids are deterministic and `now` is only createdAt.
//
// CONTRACT:
//   buildInitialPlan(ctx) -> Promise<EditPlan> (revision 1, createdBy 'director' | 'heuristic')
//     ctx = { projectId, source, output:{aspect,…}, settings (plan settings), words, sentences, transcriptMeta, audio, faces,
//             content|null, opportunities|null, now,
//             envelope?:Float32Array (RMS dB per 10 ms), mezz?:{w,h}, scenes?, shaky?:[{start,end}], branding?:{ logo?, palette?, font? },
//             captionPosition?:'auto'|'top'|'center'|'bottom', directorProvenance?, onNotice?,
//             director?:{ callJson, tracker, signal, cacheDir, model, onNotice, onCost } }
//     opportunities given -> used as-is (finalized); else director.callJson given -> directEdit, heuristic on failure;
//     else heuristic. Notice { code:'HEURISTIC_DIRECTOR', stage, reason } on fallback after a director error, and
//     (reason 'PLAN_BUILD_INVALID') when AI opportunities still produce a plan that fails parsePlan: rebuilt once from
//     the heuristic director; a failing heuristic plan throws PLAN_BUILD_INVALID.
//     ctx.brollSlots? = analysis/broll_scored.json `slots` (or the whole file): director input gets brollAvailability,
//     B-roll opportunities without an accepted slot are not turned into items, items attach the slot's chosen /
//     topCandidates (status 'ok' when downloaded), plan.opportunities.broll[].candidatesPrefetched is set. Absent -> all
//     B-roll starts 'pending' (retrieval not run).
//   redirect(plan, ctx, { keepLocked=true }) -> Promise<EditPlan> (revision + 1; cuts, segments, captions, branding kept;
//     locked / user / user-modified elements and tombstones kept; AI elements re-selected; ctx.brollSlots as above;
//     selection ignores the settings.sfxEnabled mute, which is render-time)
//   detectCuts({ words, transcriptMeta, audio, envelope, settings, content, source }) -> Cut[]
//     REPEAT / FALSE_START / RETAKE cut from the dropped take to the kept take only when nothing but fillers lies
//     between them; otherwise only the dropped words are cut (wordRange = the words actually removed).
//   sentenceFacts({ plan, words, sentences, faces }) -> sentences + { outIn, outDur, faceVisiblePct, shotType, screenContent }
//   buildSegments({ content, sentences, words, faces, aspect, mezz, origin }) -> ARollSegment[]
//   sanitizeContent(content, sentences) -> content with unknown sentence ids removed | null
//   Errors: INVALID_PLAN_INPUT (input, 422) · INVALID_PLAN (from emptyPlan) · PLAN_BUILD_INVALID (bug) · LLM_ABORTED (re-thrown)

const { EditError } = require("../errors");
const { emptyPlan, parsePlan, PLAN_SCHEMA_ID } = require("../plan/schema");
const T = require("../plan/timeline");
const { resolvePlan } = require("../plan/resolve");
const L = require("./lexicon");
const O = require("./opportunities");
const { selectEdits, RULES_VERSION } = require("./rhythm");
const { heuristicOpportunities, deterministicContent, faceVisiblePct } = require("./heuristic");
const { directEdit, STAGE } = require("./director");
const { framingForSegments } = require("./framing");
const { normalizeSlots, slotAvailability } = require("./slots");

const r3 = (x) => Math.round(x * 1000) / 1000;
const r6 = (x) => Math.round(x * 1e6) / 1e6;
const pad3 = (n) => String(n).padStart(3, "0");
const clamp01 = (v, d) => { const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : d; };
const clone = (v) => JSON.parse(JSON.stringify(v));
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

const SEGMENT_TYPE = Object.freeze({ HOOK: "HOOK", CTA: "CTA", DATA: "EMPHASIS" });
const SEGMENT_INTENT = Object.freeze({
  HOOK: "hook_grab", CTA: "cta", OUTRO: "cta", STORY: "story", EXAMPLE: "proof", DATA: "proof", POINT: "explain", CONTEXT: "explain", ASIDE: "aside",
});
const DEFAULT_LABEL = Object.freeze({ HOOK: "Hook", CTA: "Call to action", EMPHASIS: "Key point", SCREEN_CONTENT: "Screen", TALKING_HEAD: "Talking head" });

function invalid(detail) {
  return new EditError("INVALID_PLAN_INPUT", { status: 422, errorClass: "input", detail });
}

function assertTranscript(words, sentences) {
  if (!Array.isArray(words) || !Array.isArray(sentences)) throw invalid("words and sentences arrays are required");
  words.forEach((w, k) => {
    if (!w || !Number.isFinite(w.start) || !Number.isFinite(w.end) || w.end < w.start) throw invalid(`word ${k} needs start <= end`);
    if (w.i !== undefined && w.i !== k) throw invalid(`word ${k} has i=${w.i}; words[k].i must equal k`);
  });
  const ids = new Set();
  for (const s of sentences) {
    if (!s || typeof s.id !== "string" || ids.has(s.id)) throw invalid("sentences need unique string ids");
    ids.add(s.id);
    if (!Number.isInteger(s.w0) || !Number.isInteger(s.w1) || s.w0 < 0 || s.w1 < s.w0 || s.w1 >= words.length) throw invalid(`sentence ${s.id} has an invalid word range`);
  }
}

// ---------------------------------------------------------------- content
function sanitizeContent(content, sentences) {
  if (!content || typeof content !== "object" || Array.isArray(content)) return null;
  const ids = new Set(sentences.map((s) => s.id));
  const keepIds = (arr) => (Array.isArray(arr) ? arr : []).filter((id) => ids.has(id));
  const bySentence = (arr) => (Array.isArray(arr) ? arr : []).filter((x) => x && ids.has(x.sentenceId));
  const out = { ...content };
  out.hook = content.hook && keepIds(content.hook.sentenceIds).length ? { sentenceIds: keepIds(content.hook.sentenceIds), strength: clamp01(content.hook.strength, 0) } : null;
  out.cta = content.cta && keepIds(content.cta.sentenceIds).length ? { sentenceIds: keepIds(content.cta.sentenceIds), text: String(content.cta.text || "") } : null;
  out.segments = (Array.isArray(content.segments) ? content.segments : []).map((s) => ({ ...s, sentenceIds: keepIds(s && s.sentenceIds) })).filter((s) => s.sentenceIds.length);
  out.visualSupport = bySentence(content.visualSupport);
  out.faceRequired = bySentence(content.faceRequired);
  out.emphasis = bySentence(content.emphasis);
  out.sfxOpportunities = bySentence(content.sfxOpportunities);
  out.keywords = (Array.isArray(content.keywords) ? content.keywords : []).map((k) => ({ ...k, sentenceIds: keepIds(k && k.sentenceIds) }));
  out.fillerVerdicts = Array.isArray(content.fillerVerdicts) ? content.fillerVerdicts : [];
  out.retakeVerdicts = Array.isArray(content.retakeVerdicts) ? content.retakeVerdicts : [];
  return out;
}

// ---------------------------------------------------------------- cuts
function detectCuts({ words = [], transcriptMeta = {}, audio = null, envelope = null, settings = {}, content = null, source = {} } = {}) {
  const meta = transcriptMeta || {};
  const env = envelope && envelope.length ? envelope : null;
  const D = Number(source.durationSec);
  const approx = (source.timing || meta.timing) === "approx";
  const pace = T.PACE[settings.silencePace] ? settings.silencePace : "natural";
  let floorDb = audio && Number.isFinite(audio.floorDb) ? audio.floorDb : null;
  let speechDb = audio && Number.isFinite(audio.speechDb) ? audio.speechDb : null;
  if (env && words.length && (floorDb == null || speechDb == null)) {
    const st = T.envStats(env, words);
    if (floorDb == null) floorDb = st.floorDb;
    if (speechDb == null) speechDb = st.speechDb;
  }
  const n = { s: 0, f: 0, r: 0, t: 0 };
  const id = (k) => `cut_${k}${pad3(++n[k])}`;
  const valid = (c) => c && Number.isFinite(c.srcIn) && Number.isFinite(c.srcOut) && c.srcOut > c.srcIn && c.srcIn >= 0 && (!Number.isFinite(D) || c.srcOut <= D + 1e-3);
  const cuts = [];

  // silences
  const silences = [];
  if (words.length) {
    for (let k = 0; k + 1 < words.length; k++) {
      const g = T.gapCut(words[k], words[k + 1], env, { floorDb, pace });
      if (!valid(g)) continue;
      const cut = { id: id("s"), kind: "SILENCE", srcIn: g.srcIn, srcOut: g.srcOut, raw: g.raw, snap: g.snap, wordRange: null, confidence: env ? 0.9 : 0.75,
        controlledBy: "removeSilence", enabled: true, userToggled: false, reason: `pause ${r3(g.gapSec)} s`, origin: "heuristic", locked: false };
      cuts.push(cut);
      silences.push(cut);
    }
  } else if (audio && Array.isArray(audio.silences)) {
    const P = T.PACE[pace];
    for (const s of audio.silences) {
      if (!s || !(s.end - s.start >= P.minGap - 1e-9)) continue;
      const cut = { id: id("s"), kind: "SILENCE", srcIn: r3(s.start + P.keepGap / 2), srcOut: r3(s.end - P.keepGap / 2), raw: { srcIn: r3(s.start), srcOut: r3(s.end) },
        snap: { method: "rms_gap", padIn: r3(P.keepGap / 2), padOut: r3(P.keepGap / 2) }, wordRange: null, confidence: 0.7,
        controlledBy: "removeSilence", enabled: true, userToggled: false, reason: `silence ${r3(s.end - s.start)} s`, origin: "heuristic", locked: false };
      if (valid(cut)) { cuts.push(cut); silences.push(cut); }
    }
  }

  // fillers
  const verdicts = new Map((content && Array.isArray(content.fillerVerdicts) ? content.fillerVerdicts : []).filter((v) => v && Number.isInteger(v.wordIndex)).map((v) => [v.wordIndex, v.isFiller === true]));
  const candidates = Array.isArray(meta.fillerCandidates)
    ? meta.fillerCandidates
    : words.filter((w) => w.isFiller).map((w, k) => ({ i: Number.isInteger(w.i) ? w.i : k, text: w.text, kind: w.fillerKind || "pure" }));
  const seenFiller = new Set();
  for (const f of candidates) {
    if (!f || !Number.isInteger(f.i) || !words[f.i] || seenFiller.has(f.i)) continue;
    seenFiller.add(f.i);
    if (verdicts.get(f.i) === false) continue;
    const w = words[f.i];
    const adjacentCuts = silences.filter((c) => c.srcOut >= w.start - 0.3 && c.srcIn <= w.end + 0.3);
    const r = T.fillerCut(w, env, { floorDb, speechDb, prevWord: words[f.i - 1] || null, nextWord: words[f.i + 1] || null, approx, adjacentCuts });
    if (!r.cut || !valid(r.cut)) continue;
    const kind = f.kind === "discourse" || w.fillerKind === "discourse" ? "discourse" : "pure";
    cuts.push({ id: id("f"), kind: "FILLER", srcIn: r.cut.srcIn, srcOut: r.cut.srcOut, raw: r.cut.raw, snap: r.cut.snap, wordRange: r.cut.wordRange || [f.i, f.i],
      confidence: r.cut.confidence, controlledBy: "removeFillers", fillerKind: kind, enabled: true, userToggled: false,
      reason: O.truncate(`${kind} filler "${L.normWord(w.text)}"`, 160), origin: "heuristic", locked: false });
  }

  // repeats, false starts and retakes: the dropped take runs up to the kept take only when nothing but fillers
  // lies between them; otherwise (a restatement 20 s later) only the dropped words are cut, never the sentences
  // in between.
  const fillerIdx = new Set([...candidates.map((f) => f && f.i), ...words.map((w, k) => (w && w.isFiller ? k : null))].filter(Number.isInteger));
  const takeCut = (dropW0, dropW1, keptW0) => {
    if (keptW0 != null && words[keptW0] && keptW0 > dropW0) {
      let clear = true;
      for (let i = dropW1 + 1; i < keptW0; i++) if (!fillerIdx.has(i)) { clear = false; break; }
      if (clear) {
        const fc = T.fragmentCut(words[dropW0], words[keptW0], { prevWord: words[dropW0 - 1] || null });
        return fc ? { cut: { srcIn: fc.srcIn, srcOut: fc.srcOut, raw: fc.raw, snap: fc.snap }, wordRange: [dropW0, Math.max(dropW1, keptW0 - 1)] } : null;
      }
    }
    const prev = words[dropW0 - 1], next = words[dropW1 + 1];
    const srcIn = r3(Math.max(prev ? prev.end : 0, words[dropW0].start - 0.03));
    const srcOut = r3(next ? Math.min(next.start, Math.max(words[dropW1].end, next.start - 0.06)) : words[dropW1].end + 0.05);
    return { cut: { srcIn, srcOut, raw: { srcIn: r3(words[dropW0].start), srcOut: r3(words[dropW1].end) }, snap: { method: "word_edge", padIn: r3(words[dropW0].start - srcIn), padOut: r3(Math.max(0, srcOut - words[dropW1].end)) } }, wordRange: [dropW0, dropW1] };
  };
  for (const rc of Array.isArray(meta.repeatCandidates) ? meta.repeatCandidates : []) {
    if (!rc || !["REPEAT", "FALSE_START"].includes(rc.kind) || !words[rc.w0] || !words[rc.keptW0] || rc.keptW0 <= rc.w0) continue;
    const w1 = Number.isInteger(rc.w1) ? Math.max(rc.w0, Math.min(rc.w1, rc.keptW0 - 1)) : rc.w0;
    const tc = takeCut(rc.w0, w1, rc.keptW0);
    const cut = tc && { id: id("r"), kind: rc.kind, ...tc.cut, wordRange: tc.wordRange, confidence: 0.8,
      controlledBy: null, enabled: true, userToggled: false, reason: rc.kind === "REPEAT" ? "repeated words" : "false start", origin: "heuristic", locked: false };
    if (valid(cut)) cuts.push(cut);
  }

  // retakes: { w0, w1, keptW0 } like a repeat, or { a, b, keep } sentence ids (ve_content retakeVerdicts win)
  const sentences = Array.isArray(meta.sentences) ? meta.sentences : [];
  const sById = new Map(sentences.map((s) => [s.id, s]));
  const retakeVerdicts = content && Array.isArray(content.retakeVerdicts) ? content.retakeVerdicts : [];
  for (const rt of Array.isArray(meta.retakeCandidates) ? meta.retakeCandidates : []) {
    if (!rt) continue;
    let dropW0 = null, dropW1 = null, keptW0 = null;
    if (Number.isInteger(rt.w0) && Number.isInteger(rt.keptW0)) { dropW0 = rt.w0; dropW1 = Number.isInteger(rt.w1) ? rt.w1 : rt.w0; keptW0 = rt.keptW0; }
    else if (sById.has(rt.a) && sById.has(rt.b)) {
      const v = retakeVerdicts.find((x) => x && x.a === rt.a && x.b === rt.b);
      const keep = v && (v.keep === "a" || v.keep === "b") ? v.keep : rt.keep === "a" ? "a" : "b";
      const drop = sById.get(keep === "a" ? rt.b : rt.a);
      dropW0 = drop.w0; dropW1 = drop.w1;
      keptW0 = keep === "a" ? null : sById.get(rt.b).w0;
    }
    if (dropW0 == null || !words[dropW0] || !words[dropW1] || dropW1 < dropW0) continue;
    const tc = takeCut(dropW0, keptW0 != null && keptW0 > dropW0 ? Math.min(dropW1, keptW0 - 1) : dropW1, keptW0);
    const full = tc && { id: id("t"), kind: "RETAKE", ...tc.cut, wordRange: tc.wordRange, confidence: 0.7, controlledBy: null, enabled: true, userToggled: false,
      reason: "earlier take of a repeated sentence", origin: "heuristic", locked: false };
    if (valid(full)) cuts.push(full);
  }

  return cuts.sort((a, b) => a.srcIn - b.srcIn || a.srcOut - b.srcOut || (a.id < b.id ? -1 : 1));
}

// ---------------------------------------------------------------- sentences on the (cut) output timeline
function frameSemantics(faces, a, b) {
  const frames = faces && Array.isArray(faces.frames) ? faces.frames.filter((f) => f && Number.isFinite(f.t) && f.t >= a && f.t < b) : [];
  const counts = new Map();
  for (const f of frames) if (typeof f.shotType === "string") counts.set(f.shotType, (counts.get(f.shotType) || 0) + 1);
  const shotType = [...counts.entries()].sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1)).map((x) => x[0])[0] || null;
  const sc = frames.find((f) => typeof f.screenContent === "string" && f.screenContent.trim());
  return { shotType, screenContent: sc ? String(sc.screenContent).slice(0, 120) : null };
}

function sentenceFacts({ plan, words, sentences, faces = null }) {
  const built = T.buildPieces(plan, { words, settings: plan.settings, effects: [] });
  const map = T.buildTimeMap(built.pieces);
  return sentences.map((s) => {
    const r = map.resolveAnchor({ kind: "words", w0: s.w0, w1: s.w1 }, words);
    const start = Number.isFinite(s.start) ? s.start : words[s.w0].start;
    const end = Number.isFinite(s.end) ? s.end : words[s.w1].end;
    const sem = frameSemantics(faces, start, end);
    return { ...s, start, end, outIn: r.outIn, outDur: r.collapsed ? 0 : r6(r.outOut - r.outIn), faceVisiblePct: faceVisiblePct(faces, { start, end }), shotType: sem.shotType, screenContent: sem.screenContent };
  });
}

// ---------------------------------------------------------------- A-roll segments
function buildSegments({ content, sentences, words, faces = null, aspect, mezz, origin = "heuristic" }) {
  const segOf = new Map();
  for (const cs of (content && content.segments) || []) for (const id of cs.sentenceIds || []) if (!segOf.has(id)) segOf.set(id, cs);
  const faceReq = new Set(((content && content.faceRequired) || []).map((f) => f.sentenceId));
  const ctaIds = new Set(content && content.cta ? content.cta.sentenceIds : []);
  const runs = [];
  for (const s of sentences) {
    const cs = segOf.get(s.id) || null;
    const last = runs[runs.length - 1];
    if (last && last.cs === cs) last.sentences.push(s);
    else runs.push({ cs, sentences: [s] });
  }
  const segments = runs.map((run, k) => {
    const first = run.sentences[0], lastS = run.sentences[run.sentences.length - 1];
    const csType = run.cs ? String(run.cs.type || "").toUpperCase() : "";
    let type = SEGMENT_TYPE[csType] || (csType === "OUTRO" && run.sentences.some((s) => ctaIds.has(s.id)) ? "CTA" : "TALKING_HEAD");
    if (type === "TALKING_HEAD" && run.sentences.filter((s) => s.screenContent).length * 2 > run.sentences.length) type = "SCREEN_CONTENT";
    const intent = type === "EMPHASIS" ? "emphasis" : type === "SCREEN_CONTENT" ? "explain" : SEGMENT_INTENT[csType] || "explain";
    return {
      id: `seg_${pad3(k + 1)}`, type, anchor: { kind: "words", w0: first.w0, w1: lastS.w1 }, resolved: null,
      sentenceIds: run.sentences.map((s) => s.id).slice(0, 200), importance: r3(clamp01(run.cs && run.cs.importance, 0.5)),
      editingIntent: intent, faceRequired: run.sentences.some((s) => faceReq.has(s.id) || ctaIds.has(s.id)), framing: null,
      label: O.truncate(run.cs && run.cs.title ? run.cs.title : DEFAULT_LABEL[type], 80) || DEFAULT_LABEL[type],
      reason: run.cs ? `content segment ${csType.toLowerCase() || "untyped"}` : "sentences outside any content segment",
      origin, locked: false,
    };
  });
  const framings = framingForSegments(segments.map((sg) => ({ srcIn: words[sg.anchor.w0].start, srcOut: words[sg.anchor.w1].end })), faces, { aspect, mezz });
  segments.forEach((sg, k) => { sg.framing = framings[k]; });
  return segments;
}

// ---------------------------------------------------------------- opportunities
function heuristicChoice({ content, facts, words, faces, settings, lang, costUsd = 0 }) {
  return {
    opportunities: heuristicOpportunities({ content, sentences: facts, words, faces, settings, lang }),
    director: { model: null, stage: STAGE, promptHash: null, costUsd: r6(costUsd), fallback: true },
  };
}

async function chooseOpportunities({ ctx, content, facts, words, faces, settings, lang }) {
  const heuristic = (costUsd = 0) => heuristicChoice({ content, facts, words, faces, settings, lang, costUsd });
  if (ctx.opportunities && typeof ctx.opportunities === "object") {
    const source = ctx.opportunities.source === "ai" ? "ai" : "heuristic";
    const prov = ctx.directorProvenance || {};
    return {
      opportunities: O.finalizeOpportunities(ctx.opportunities, { sentences: facts, source, lang }),
      director: { model: prov.model || null, stage: STAGE, promptHash: prov.promptHash || null, costUsd: Number(prov.costUsd) || 0, fallback: source !== "ai" },
    };
  }
  const cfg = ctx.director;
  if (cfg && typeof cfg.callJson === "function") {
    try {
      const slots = normalizeSlots(ctx.brollSlots);
      const r = await directEdit({ ...cfg, content, sentences: facts, words, faces, settings, lang, now: ctx.now, brollAvailability: slots ? slotAvailability(slots, settings.brollIntensity) : null });
      return { opportunities: r.opportunities, director: { model: r.provenance.model, stage: STAGE, promptHash: r.provenance.promptHash, costUsd: r.provenance.costUsd, fallback: false } };
    } catch (e) {
      if (e && (e.errorClass === "cancelled" || e.code === "LLM_ABORTED" || e.name === "AbortError")) throw e;
      const notice = { code: "HEURISTIC_DIRECTOR", stage: STAGE, reason: e && e.code ? String(e.code) : "LLM_CALL_FAILED" };
      for (const fn of [ctx.onNotice, cfg.onNotice]) if (typeof fn === "function") fn(notice);
      return heuristic(e && e.extra && Number(e.extra.costUsd) ? Number(e.extra.costUsd) : 0);
    }
  }
  return heuristic();
}

// ---------------------------------------------------------------- assembly
function applyBranding(plan, branding) {
  if (!branding || typeof branding !== "object") return;
  if (branding.logo && typeof branding.logo === "object") {
    const l = branding.logo;
    plan.branding.logo = {
      assetId: l.assetId, path: l.path, placement: ["tl", "tr", "bl", "br"].includes(l.placement) ? l.placement : "tr",
      scale: Math.max(0.08, Math.min(0.2, Number(l.scale) || 0.12)), opacity: Math.max(0.6, Math.min(1, Number(l.opacity) || 0.9)),
      marginPct: Math.max(0.03, Math.min(0.08, Number(l.marginPct) || 0.04)), show: ["always", "intro_outro", "none"].includes(l.show) ? l.show : "always",
    };
  }
  const p = branding.palette;
  if (p && HEX_RE.test(p.primary || "")) {
    plan.branding.palette = {
      primary: p.primary.toLowerCase(), accent: HEX_RE.test(p.accent || "") ? p.accent.toLowerCase() : p.primary.toLowerCase(),
      text: HEX_RE.test(p.text || "") ? p.text.toLowerCase() : "#ffffff", onAccent: HEX_RE.test(p.onAccent || "") ? p.onAccent.toLowerCase() : "#14130e",
      source: ["user", "logo", "default"].includes(p.source) ? p.source : "user",
    };
  }
  if (branding.font && typeof branding.font === "object") plan.branding.font = { ...plan.branding.font, ...branding.font };
}

function assemble(plan, { chosen, content, words, sentences, facts, faces, mezz, scenes, shaky, now, keep, initial, brollSlots = null, selectionSettings = null }) {
  const { opportunities, director } = chosen;
  const lang = L.langCode(plan.source.language);
  plan.createdBy = opportunities.source === "ai" ? "director" : "heuristic";
  plan.opportunities = O.toPlanOpportunities(opportunities, { brollSlots });

  if (initial) {
    const byId = new Map(sentences.map((s) => [s.id, s]));
    for (const e of (content && content.emphasis) || []) {
      const s = byId.get(e.sentenceId);
      const m = s ? L.matchPhrase(words, s.w0, s.w1, e.wordText, lang) : null;
      if (m) for (let i = m.w0; i <= m.w1; i++) plan.captions.overrides.emphasis[`w${i}`] = true;
    }
  }

  const sel = selectEdits({ plan, opportunities, words, sentences: facts, content, faces, settings: selectionSettings || plan.settings, now, shaky, keep, brollSlots });
  plan.broll = sel.broll;
  plan.effects = sel.effects;
  plan.graphics = sel.graphics;
  plan.sfx = sel.sfx;
  plan.transitions = sel.transitions;
  plan.music = sel.music;
  plan.provenance = {
    director,
    rhythm: { rulesVersion: RULES_VERSION, adjustments: sel.adjustments },
    ops: plan.provenance && Array.isArray(plan.provenance.ops) ? plan.provenance.ops : [],
  };

  const resolved = resolvePlan(plan, { words, sentences, faces, mezz, scenes: Array.isArray(scenes) ? scenes : [], now });
  const parsed = parsePlan(resolved, { wordCount: words.length });
  if (!parsed.ok) {
    throw new EditError("PLAN_BUILD_INVALID", {
      status: 500, errorClass: "bug", detail: parsed.issues.slice(0, 8).map((i) => `${i.path}: ${i.message}`).join("; "),
      extra: { issues: parsed.issues.slice(0, 20) },
    });
  }
  return parsed.plan;
}

async function buildInitialPlan(ctx = {}) {
  const { projectId, source, output, settings, words, sentences, transcriptMeta = {}, audio = null, faces = null, content = null, now } = ctx;
  if (!Number.isFinite(now) || now < 0) throw invalid("buildInitialPlan: `now` (ms epoch) is required");
  assertTranscript(words, sentences);
  const plan = emptyPlan({ projectId, source, output, settings, now, createdBy: "system" });
  plan.revision = 1;
  plan.parentRevision = null;
  const lang = L.langCode(plan.source.language);
  const mezz = ctx.mezz && ctx.mezz.w > 0 && ctx.mezz.h > 0 ? { w: ctx.mezz.w, h: ctx.mezz.h } : { w: plan.source.width, h: plan.source.height };
  applyBranding(plan, ctx.branding);
  if (["auto", "top", "center", "bottom"].includes(ctx.captionPosition)) plan.captions.position.policy = ctx.captionPosition;
  // continue_without_transcript (ANALYSIS.md §4.2): nothing to caption, silence cuts only
  if (!words.length) plan.captions.enabled = false;

  plan.cuts = detectCuts({ words, transcriptMeta: { ...(transcriptMeta || {}), sentences }, audio, envelope: ctx.envelope, settings: plan.settings, content, source: plan.source });
  const facts = sentenceFacts({ plan, words, sentences, faces });
  const cleanContent = sanitizeContent(content, sentences);
  const effContent = cleanContent || deterministicContent({ sentences: facts, words, faces, lang });
  plan.aRoll.segments = buildSegments({ content: effContent, sentences: facts, words, faces, aspect: plan.output.aspect, mezz, origin: cleanContent ? "ai" : "heuristic" });

  const chosen = await chooseOpportunities({ ctx, content: cleanContent, facts, words, faces, settings: plan.settings, lang });
  const retry = () => heuristicChoice({ content: cleanContent, facts, words, faces, settings: plan.settings, lang, costUsd: chosen.director.costUsd });
  return assembleWithFallback(plan, ctx, chosen, retry, { content: effContent, words, sentences, facts, faces, mezz, scenes: ctx.scenes, shaky: ctx.shaky, now, keep: "locked", initial: true, brollSlots: ctx.brollSlots });
}

// An AI-authored opportunity list that still yields an invalid plan (a limit the sanitizer missed) must not fail
// BUILDING_EDIT_PLAN: rebuild once from the heuristic director. A heuristic plan that fails is our bug and throws.
function assembleWithFallback(plan, ctx, chosen, heuristicRetry, args) {
  const pristine = clone(plan);
  try {
    return assemble(plan, { ...args, chosen });
  } catch (e) {
    if (!(e && e.code === "PLAN_BUILD_INVALID") || chosen.director.fallback) throw e;
    const notice = { code: "HEURISTIC_DIRECTOR", stage: STAGE, reason: "PLAN_BUILD_INVALID" };
    for (const fn of [ctx.onNotice, ctx.director && ctx.director.onNotice]) if (typeof fn === "function") fn(notice);
    return assemble(pristine, { ...args, chosen: heuristicRetry() });
  }
}

async function redirect(plan, ctx = {}, { keepLocked = true } = {}) {
  if (!plan || plan.schema !== PLAN_SCHEMA_ID || !Number.isInteger(plan.revision)) throw invalid("redirect: an Edit Plan is required");
  const { words, sentences, faces = null, content = null, now } = ctx;
  if (!Number.isFinite(now) || now < 0) throw invalid("redirect: `now` (ms epoch) is required");
  assertTranscript(words, sentences);
  const base = clone(plan);
  const lang = L.langCode(base.source.language);
  const mezz = ctx.mezz && ctx.mezz.w > 0 && ctx.mezz.h > 0 ? { w: ctx.mezz.w, h: ctx.mezz.h } : { w: base.source.width, h: base.source.height };
  const facts = sentenceFacts({ plan: base, words, sentences, faces });
  const cleanContent = sanitizeContent(content, sentences);
  const effContent = cleanContent || deterministicContent({ sentences: facts, words, faces, lang });
  const chosen = await chooseOpportunities({ ctx, content: cleanContent, facts, words, faces, settings: base.settings, lang });
  base.revision = plan.revision + 1;
  base.parentRevision = plan.revision;
  base.createdAt = now;
  base.qa = null;
  const retry = () => heuristicChoice({ content: cleanContent, facts, words, faces, settings: base.settings, lang, costUsd: chosen.director.costUsd });
  // settings.sfxEnabled is a render-time mute: regenerating while muted must not delete the AI sound effects
  const selectionSettings = { ...base.settings, sfxEnabled: true };
  return assembleWithFallback(base, ctx, chosen, retry, { content: effContent, words, sentences, facts, faces, mezz, scenes: ctx.scenes, shaky: ctx.shaky, now, keep: keepLocked ? "locked" : "none", initial: false, brollSlots: ctx.brollSlots, selectionSettings });
}

module.exports = { buildInitialPlan, redirect, detectCuts, sentenceFacts, buildSegments, sanitizeContent, chooseOpportunities };
