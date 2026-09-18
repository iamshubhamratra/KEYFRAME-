// VIDEO EDIT CONTENT ANALYSIS — ve_content: the editor's understanding of the talk (ANALYSIS.md §7).
//
// WHY THIS EXISTS. Every creative decision downstream — which sentences get B-roll and what it should show, where
// the face must stay on screen, the hook guard, the CTA card, emphasis punch-ins, music mood, filler and retake
// verdicts — reads this one document. It is produced by one text-only LLM call (never video, never audio) over
// the structured transcript plus light shot facts, with three hard guarantees:
//   1. GROUNDING. The model may only cite sentence ids that exist; unknown ids are dropped item by item, emphasis
//      words must occur in the cited sentence, verdicts must refer to candidates we actually asked about, segments
//      are made consecutive and cover every sentence, CTA sentences are always faceRequired. The schema's repair
//      re-ask (ai/llm.js) fires only when nothing at all is grounded.
//   2. FAIL-OPEN. An outage, a 402, an open breaker, the cost cap or two unparseable replies produce the
//      deterministic analysis (director/heuristic.deterministicContent: lexical hook/CTA/faceRequired, TF-IDF
//      keywords; visualSupport left null so B-roll slots use their own salience heuristic) with notice
//      AI_ANALYSIS_UNAVAILABLE — never a failed stage.
//   3. MODERATION HOLD. Before any text leaves the machine, services/prompt_moderation.screen runs over ~3000-word
//      chunks of the transcript; a tier-1 hit parks the project in NEEDS_ATTENTION CONTENT_REVIEW (never silently
//      dropped, never sent to the model).
//
// CONTRACT:
//   analyzeContent({ transcript, words, video, faces, projectSettings, settings, project, durationSec, signal, tracker, onCost,
//                    onNotice, chat, callJson, auth, fetchImpl, cacheDir, model, spentUsd, now })
//     -> { content, source:'ai'|'deterministic'|'no_transcript', model, costUsd, notices, fallbacks, engine, discoveries, dropped }
//     throws EditError CONTENT_REVIEW (resource, not retryable, actions ['delete']) · cancelled errors · bugs
//   buildContentInput({ transcript, words, video, faces, projectSettings, lang }) -> model input object
//   buildContentSchema(sentenceIds) · groundContent(raw, { sentences, words, fillerCandidates, retakeCandidates, durationSec })
//   deterministicFallback({ sentences, words, faces, lang }) · screenTranscript(sentences, { chunkWords=3000 }) -> { tier1, chunks }
//   contentReviewError(tier1) · discoveriesFor(content, sentences) · SYSTEM_PROMPT · STAGE · PROMPT_VERSION · CONTENT_REL

const { z } = require("zod");
const { EditError, isEditError } = require("../errors");
const faults = require("../faults");
const { getBreaker, nextUtcMidnight } = require("../providers/breaker");

const STAGE = "ve_content";
const PROMPT_VERSION = "ve-content-1";
const CONTENT_REL = "analysis/content.json";
const BREAKER = "openrouter_chat";
const EST_CALL_USD = 0.01;
const SEGMENT_TYPES = Object.freeze(["HOOK", "CONTEXT", "POINT", "EXAMPLE", "STORY", "DATA", "CTA", "OUTRO", "ASIDE"]);
const FACE_REASONS = Object.freeze(["sincere", "personal", "humor", "direct_address", "cta"]);
const CATEGORIES = Object.freeze(["tutorial", "explainer", "product", "testimonial", "story", "opinion", "announcement", "sales", "interview", "vlog", "other"]);
const PACES = Object.freeze(["slow", "medium", "fast"]);
const ABSTRACT_NOUNS = new Set([
  "success", "growth", "innovation", "idea", "ideas", "concept", "strategy", "value", "future", "change", "solution", "solutions",
  "results", "quality", "experience", "journey", "mindset", "opportunity", "potential", "vision", "mission", "progress", "impact",
  "efficiency", "productivity", "motivation", "inspiration", "happiness", "freedom", "power", "trust", "love", "time", "life",
]);

const SYSTEM_PROMPT = `You are a senior documentary editor and story producer. You are preparing the edit of a talking-to-camera video. You receive the transcript as numbered sentences with timings, the filler words and retakes our detector is unsure about, and a few facts about the shots. Your analysis drives every automatic editing decision: which sentences get B-roll and what it shows, where the speaker's face must stay on screen, the hook, the call to action, emphasis, music and sound design. Understand the talk the way a great editor does: what is actually being said, who it is for, where it builds, where it lands.

GROUNDING — these rules are strict:
- Cite sentences ONLY by the exact ids in the input (for example "s3"). Never invent ids, never write ranges like "s3-s5", never cite by quoting text.
- Every item must be supported by the sentence it cites. When nothing qualifies, return an empty array or null. Leaving something out is always better than guessing.
- An emphasis wordText must be one word copied exactly from that sentence.
- Add no facts that are not in the transcript.

FIELDS:
- summary: at most 2 sentences saying what the video says (not "the speaker talks about").
- category: tutorial | explainer | product | testimonial | story | opinion | announcement | sales | interview | vlog | other.
- audience: at most 12 words.
- tone: { mood: 1-3 words, energy: 0-1 (0.2 calm and reflective ... 0.9 hype), pace: slow | medium | fast }.
- topics: 1-6 distinct subjects in order of appearance: { id, label (at most 5 words), sentenceIds }.
- keywords: at most 12 terms a viewer would search for: { term, sentenceIds, salience 0-1 }.
- hook: { sentenceIds, strength 0-1 } — the opening sentence(s) meant to grab attention, normally within the first seconds. A question, a surprising number, a bold claim or a clear promise is strong (0.7-1); a greeting or throat-clearing is weak (0.1-0.3).
- cta: { sentenceIds, text } — the sentence(s) asking the viewer to act (subscribe, follow, visit, sign up, comment, buy, download, book, message...), text = the ask in at most 8 words; null when there is no ask.
- segments: the talk as consecutive, non-overlapping runs of sentences in order, covering every sentence: { id, type: HOOK | CONTEXT | POINT | EXAMPLE | STORY | DATA | CTA | OUTRO | ASIDE, sentenceIds, title (at most 6 words), importance 0-1 = how much the video loses if this part is cut }.
- visualSupport: one entry for EVERY sentence: { sentenceId, need 0-1, visualNouns, avoid }.
  need = how much a cutaway image or clip would help the viewer understand or feel that sentence. High (0.6-1) for concrete, depictable content: products, places, objects, actions, processes, numbers and data, examples. Low (0-0.3) for opinions, feelings, personal statements, greetings, transitions, and anything said straight to the viewer.
  visualNouns = at most 4 CONCRETE, FILMABLE stock-footage subjects of 1-3 words that a camera could actually shoot for this sentence ("delivery van", "hands typing on laptop", "busy city street"). Never abstractions ("success", "growth", "innovation"), never the speaker, never logos, brand names or on-screen text.
  avoid = at most 4 things a stock clip must NOT show for this sentence (a competitor's product, the wrong subject, cliché handshake), may be empty.
- faceRequired: { sentenceId, reason } for sentences where cutting away from the speaker's face would hurt the video: sincere or vulnerable statements ("sincere"), personal experience or first-person feeling ("personal"), jokes and playful asides ("humor"), speaking directly to the viewer — "you", questions to the audience, "let me show you" ("direct_address"), and every call-to-action sentence ("cta").
- emphasis: { sentenceId, wordText } — at most one word per sentence that the speaker stresses or that carries the key idea (a number, a superlative, the payoff word); only where it matters.
- fillerVerdicts: for each filler candidate in the input { wordIndex, isFiller } — true when the word is verbal padding that can be cut without changing meaning, false when it carries meaning there.
- retakeVerdicts: for each retake pair in the input { a, b, keep } — keep = the id of the better take (complete, clearer, more confident; usually the later one).
- music: { mood: at most 3 words such as "warm acoustic" or "upbeat electronic", energy 0-1 }.
- sfxOpportunities: { sentenceId, kind } — at most one per 15 seconds, only on clear visual beats (a reveal, a list item, a number, a before/after); kind at most 3 words (whoosh, pop, riser, ding).

LANGUAGE: write summary, audience, topic labels, segment titles and cta.text in the transcript's language. Write visualNouns and avoid in English (stock libraries are searched in English).

Return ONLY the JSON object with all of these keys.`;

const isPlain = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const r3 = (x) => Math.round(x * 1000) / 1000;
const r8 = (x) => Math.round(x * 1e8) / 1e8;
const clamp01 = (v, d) => { const n = num(v); return n == null ? d : Math.max(0, Math.min(1, n)); };
const str = (v, max) => (typeof v === "string" && v.trim() ? v.trim().replace(/\s+/g, " ").slice(0, max) : null);
const normWord = (s) => String(s || "").toLowerCase().normalize("NFKC").replace(/[\p{P}\p{S}]+/gu, "").trim();

// ---------------------------------------------------------------- input
function majority(values) {
  const counts = new Map();
  for (const v of values) if (v != null) counts.set(v, (counts.get(v) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || (String(a[0]) < String(b[0]) ? -1 : 1)).map((e) => e[0])[0] ?? null;
}

function buildContentInput({ transcript, words = [], video = null, faces = null, projectSettings = {}, lang = "en" } = {}) {
  const sentences = (isPlain(transcript) && Array.isArray(transcript.sentences) ? transcript.sentences : []).map((s) => ({
    id: s.id, start: r3(Number(s.start) || 0), end: r3(Number(s.end) || 0), text: String(s.text || "").slice(0, 600),
    pauseAfter: r3(Number(s.pauseAfter) || 0), fillerCount: Number(s.fillerCount) || 0,
  }));
  const wordList = Array.isArray(words) ? words : [];
  const fillerCandidates = (isPlain(transcript) && Array.isArray(transcript.fillerCandidates) ? transcript.fillerCandidates : [])
    .filter((f) => isPlain(f) && f.kind === "discourse" && Number.isInteger(f.i))
    .slice(0, 60)
    .map((f) => ({ wordIndex: f.i, text: String(f.text || "").slice(0, 40), sentenceId: (wordList[f.i] && wordList[f.i].sentenceId) || null }));
  const retakeCandidates = (isPlain(transcript) && Array.isArray(transcript.retakeCandidates) ? transcript.retakeCandidates : [])
    .filter((r) => isPlain(r) && r.a && r.b)
    .slice(0, 20)
    .map((r) => ({ a: r.a, b: r.b, suggestedKeep: r.keep || null }));
  const frames = isPlain(faces) && Array.isArray(faces.frames) ? faces.frames : [];
  const scenes = (isPlain(video) && Array.isArray(video.scenes) ? video.scenes : []).slice(0, 40).map((sc) => {
    const inside = frames.filter((f) => f && !f.missing && f.t >= sc.start && f.t < sc.end);
    const screen = inside.find((f) => typeof f.screenContent === "string" && f.screenContent);
    const vis = inside.map((f) => f.speakerVisible).filter((v) => typeof v === "boolean");
    return {
      start: r3(sc.start), end: r3(sc.end), shotType: majority(inside.map((f) => f.shotType)),
      speakerVisible: vis.length ? vis.filter(Boolean).length * 2 >= vis.length : null,
      screenContent: screen ? String(screen.screenContent).slice(0, 120) : null,
    };
  });
  const user = {};
  const ps = isPlain(projectSettings) ? projectSettings : {};
  if (typeof ps.goals === "string" && ps.goals.trim()) user.goals = ps.goals.trim().slice(0, 500);
  if (isPlain(ps.brand) && typeof ps.brand.name === "string" && ps.brand.name.trim()) user.brand = { name: ps.brand.name.trim().slice(0, 80) };
  return { lang, sentences, fillerCandidates, retakeCandidates, scenes, user };
}

// ---------------------------------------------------------------- schema
function buildContentSchema(sentenceIds) {
  const ids = new Set(sentenceIds);
  const list = z.array(z.unknown()).catch([]);
  return z.object({
    summary: z.unknown().optional(), category: z.unknown().optional(), audience: z.unknown().optional(), tone: z.unknown().optional(),
    topics: list, keywords: list, hook: z.unknown().optional(), cta: z.unknown().optional(),
    segments: z.array(z.unknown()),
    visualSupport: z.array(z.unknown()),
    faceRequired: list, emphasis: list, fillerVerdicts: list, retakeVerdicts: list,
    music: z.unknown().optional(), sfxOpportunities: list,
  }).passthrough().superRefine((v, ctx) => {
    if (!ids.size) return;
    const cites = (arr, key) => arr.some((x) => isPlain(x) && (key === "sentenceIds"
      ? Array.isArray(x.sentenceIds) && x.sentenceIds.some((id) => ids.has(String(id)))
      : ids.has(String(x.sentenceId))));
    if (!cites(v.segments, "sentenceIds")) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["segments"], message: `segments must cite sentence ids from the input (${[...ids].slice(0, 3).join(", ")}, …)` });
    }
    if (v.visualSupport.length && !cites(v.visualSupport, "sentenceId")) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["visualSupport"], message: "visualSupport items must use sentenceId values from the input" });
    }
  });
}

// ---------------------------------------------------------------- grounding
function groundContent(raw, { sentences = [], words = [], fillerCandidates = [], retakeCandidates = [], durationSec = null } = {}) {
  const r = isPlain(raw) ? raw : {};
  const order = new Map(sentences.map((s, k) => [s.id, k]));
  const byId = new Map(sentences.map((s) => [s.id, s]));
  const dropped = { ids: 0, items: 0 };
  const canon = (v) => {
    const s = String(v == null ? "" : v).trim();
    if (order.has(s)) return s;
    const lower = s.toLowerCase();
    if (order.has(lower)) return lower;
    return null;
  };
  const keepIds = (arr) => {
    const out = [];
    for (const v of Array.isArray(arr) ? arr : (arr != null ? [arr] : [])) {
      const id = canon(v);
      if (!id) { dropped.ids++; continue; }
      if (!out.includes(id)) out.push(id);
    }
    return out.sort((a, b) => order.get(a) - order.get(b));
  };
  const D = num(durationSec) || (sentences.length ? Number(sentences[sentences.length - 1].end) || 0 : 0);

  const tone = isPlain(r.tone) ? r.tone : {};
  const out = {
    summary: str(r.summary, 400) || "",
    category: CATEGORIES.includes(String(r.category || "").toLowerCase()) ? String(r.category).toLowerCase() : "other",
    audience: str(r.audience, 120) || "",
    tone: { mood: str(tone.mood, 40) || "neutral", energy: clamp01(tone.energy, 0.5), pace: PACES.includes(tone.pace) ? tone.pace : "medium" },
  };

  out.topics = [];
  for (const t of Array.isArray(r.topics) ? r.topics : []) {
    const label = isPlain(t) ? str(t.label, 60) : null;
    const sids = isPlain(t) ? keepIds(t.sentenceIds) : [];
    if (!label || !sids.length) { dropped.items++; continue; }
    if (out.topics.length < 8) out.topics.push({ id: `t${out.topics.length + 1}`, label, sentenceIds: sids });
  }

  const seenTerms = new Set();
  out.keywords = [];
  for (const k of Array.isArray(r.keywords) ? r.keywords : []) {
    const term = isPlain(k) ? str(k.term, 40) : null;
    const sids = isPlain(k) ? keepIds(k.sentenceIds) : [];
    if (!term || !sids.length || seenTerms.has(term.toLowerCase())) { dropped.items++; continue; }
    seenTerms.add(term.toLowerCase());
    if (out.keywords.length < 15) out.keywords.push({ term, sentenceIds: sids, salience: clamp01(k.salience, 0.5) });
  }

  const hookWindow = Math.max(12, (sentences[0] ? Number(sentences[0].start) || 0 : 0) + 12);
  const hook = isPlain(r.hook) ? r.hook : null;
  const hookIds = hook ? keepIds(hook.sentenceIds).filter((id) => Number(byId.get(id).start) < hookWindow) : [];
  out.hook = hookIds.length ? { sentenceIds: hookIds, strength: clamp01(hook.strength, 0.5) } : null;

  const cta = isPlain(r.cta) ? r.cta : null;
  const ctaIds = cta ? keepIds(cta.sentenceIds) : [];
  out.cta = ctaIds.length ? { sentenceIds: ctaIds, text: str(cta.text, 80) || str(byId.get(ctaIds[0]).text, 80) || "" } : null;

  // segments: consecutive, non-overlapping, covering every sentence
  const claimed = new Map();
  const rawSegs = [];
  for (const s of Array.isArray(r.segments) ? r.segments : []) {
    if (!isPlain(s)) { dropped.items++; continue; }
    const sids = keepIds(s.sentenceIds).filter((id) => !claimed.has(id));
    if (!sids.length) { dropped.items++; continue; }
    const type = SEGMENT_TYPES.includes(String(s.type || "").toUpperCase()) ? String(s.type).toUpperCase() : "POINT";
    const seg = { type, sentenceIds: sids, title: str(s.title, 48) || "", importance: clamp01(s.importance, 0.5) };
    for (const id of sids) claimed.set(id, seg);
    rawSegs.push(seg);
  }
  const segments = [];
  let current = null;
  for (const s of sentences) {
    const seg = claimed.get(s.id);
    if (seg) {
      if (current && current.src === seg) current.sentenceIds.push(s.id);
      else { current = { src: seg, type: seg.type, sentenceIds: [s.id], title: seg.title, importance: seg.importance }; segments.push(current); }
    } else if (current) {
      current.sentenceIds.push(s.id);
    } else {
      current = { src: null, type: "CONTEXT", sentenceIds: [s.id], title: "", importance: 0.5 };
      segments.push(current);
    }
  }
  out.segments = segments.map((s, k) => ({ id: `seg${k + 1}`, type: s.type, sentenceIds: s.sentenceIds, title: s.title, importance: s.importance }));

  const vsMap = new Map();
  for (const v of Array.isArray(r.visualSupport) ? r.visualSupport : []) {
    const id = isPlain(v) ? canon(v.sentenceId) : null;
    if (!id) { dropped.ids++; continue; }
    const need = clamp01(v.need, 0);
    if (vsMap.has(id) && vsMap.get(id).need >= need) continue;
    const nouns = [];
    for (const n of Array.isArray(v.visualNouns) ? v.visualNouns : []) {
      const t = str(n, 40);
      if (!t) continue;
      const wordsIn = t.split(" ");
      if (wordsIn.length > 5 || (wordsIn.length === 1 && ABSTRACT_NOUNS.has(t.toLowerCase()))) { dropped.items++; continue; }
      if (!nouns.some((x) => x.toLowerCase() === t.toLowerCase())) nouns.push(t);
      if (nouns.length >= 4) break;
    }
    const avoid = (Array.isArray(v.avoid) ? v.avoid : []).map((a) => str(a, 60)).filter(Boolean).slice(0, 4);
    vsMap.set(id, { sentenceId: id, need: r3(need), visualNouns: nouns, avoid });
  }
  out.visualSupport = [...vsMap.values()].sort((a, b) => order.get(a.sentenceId) - order.get(b.sentenceId));

  const fr = new Map();
  for (const f of Array.isArray(r.faceRequired) ? r.faceRequired : []) {
    const id = isPlain(f) ? canon(f.sentenceId) : null;
    const reason = isPlain(f) ? String(f.reason || "").toLowerCase().replace(/[\s-]+/g, "_") : "";
    if (!id || !FACE_REASONS.includes(reason)) { dropped.items++; continue; }
    if (!fr.has(id)) fr.set(id, reason);
  }
  for (const id of ctaIds) fr.set(id, "cta");
  out.faceRequired = [...fr.entries()].sort((a, b) => order.get(a[0]) - order.get(b[0])).map(([sentenceId, reason]) => ({ sentenceId, reason }));

  const wordList = Array.isArray(words) ? words : [];
  const emph = new Map();
  for (const e of Array.isArray(r.emphasis) ? r.emphasis : []) {
    const id = isPlain(e) ? canon(e.sentenceId) : null;
    const want = isPlain(e) ? normWord(e.wordText) : "";
    if (!id || !want || want.includes(" ") || emph.has(id)) { dropped.items++; continue; }
    const s = byId.get(id);
    let found = null;
    if (Number.isInteger(s.w0) && Number.isInteger(s.w1) && wordList.length) {
      for (let i = s.w0; i <= s.w1 && i < wordList.length; i++) {
        if (wordList[i] && normWord(wordList[i].text) === want) { found = String(wordList[i].text).trim(); break; }
      }
    } else {
      const tok = String(s.text || "").split(/\s+/).find((w) => normWord(w) === want);
      if (tok) found = tok.replace(/^[\p{P}]+|[\p{P}]+$/gu, "");
    }
    if (!found) { dropped.items++; continue; }
    emph.set(id, { sentenceId: id, wordText: found });
  }
  out.emphasis = [...emph.values()].sort((a, b) => order.get(a.sentenceId) - order.get(b.sentenceId));

  const fillerIdx = new Set((Array.isArray(fillerCandidates) ? fillerCandidates : []).map((f) => (isPlain(f) ? (Number.isInteger(f.wordIndex) ? f.wordIndex : f.i) : null)).filter(Number.isInteger));
  const fv = new Map();
  for (const v of Array.isArray(r.fillerVerdicts) ? r.fillerVerdicts : []) {
    const wi = isPlain(v) ? Number(v.wordIndex) : NaN;
    if (!Number.isInteger(wi) || !fillerIdx.has(wi) || typeof v.isFiller !== "boolean" || fv.has(wi)) { dropped.items++; continue; }
    fv.set(wi, { wordIndex: wi, isFiller: v.isFiller });
  }
  out.fillerVerdicts = [...fv.values()].sort((a, b) => a.wordIndex - b.wordIndex);

  const pairs = (Array.isArray(retakeCandidates) ? retakeCandidates : []).filter((p) => isPlain(p) && p.a && p.b);
  out.retakeVerdicts = [];
  for (const v of Array.isArray(r.retakeVerdicts) ? r.retakeVerdicts : []) {
    if (!isPlain(v)) { dropped.items++; continue; }
    const p = pairs.find((x) => (x.a === v.a && x.b === v.b) || (x.a === v.b && x.b === v.a));
    if (!p || (v.keep !== p.a && v.keep !== p.b) || out.retakeVerdicts.some((x) => x.a === p.a && x.b === p.b)) { dropped.items++; continue; }
    out.retakeVerdicts.push({ a: p.a, b: p.b, keep: v.keep });
  }

  const music = isPlain(r.music) ? r.music : {};
  out.music = { mood: str(music.mood, 40) || out.tone.mood, energy: clamp01(music.energy, out.tone.energy) };

  const maxSfx = Math.max(1, Math.ceil(D / 15));
  const sfx = new Map();
  for (const s of Array.isArray(r.sfxOpportunities) ? r.sfxOpportunities : []) {
    const id = isPlain(s) ? canon(s.sentenceId) : null;
    const kind = isPlain(s) ? str(s.kind, 24) : null;
    if (!id || !kind || sfx.has(id)) { dropped.items++; continue; }
    sfx.set(id, { sentenceId: id, kind: kind.toLowerCase() });
  }
  out.sfxOpportunities = [...sfx.values()].sort((a, b) => order.get(a.sentenceId) - order.get(b.sentenceId)).slice(0, maxSfx);

  return { content: out, dropped };
}

// ---------------------------------------------------------------- fallback
function deterministicFallback({ sentences = [], words = [], faces = null, lang = "en" } = {}) {
  let base = null;
  try {
    base = require("../director/heuristic").deterministicContent({ sentences, words, faces, lang });
  } catch {
    base = null;
  }
  const ids = sentences.map((s) => s.id);
  const content = isPlain(base) ? { ...base } : {
    summary: "", category: "other", audience: "", tone: { mood: "neutral", energy: 0.5, pace: "medium" }, topics: [], keywords: [],
    hook: null, cta: null,
    segments: ids.length ? [{ id: "hs1", type: "POINT", sentenceIds: ids, title: "", importance: 0.5 }] : [],
    faceRequired: [], emphasis: [], fillerVerdicts: [], retakeVerdicts: [], music: { mood: "neutral", energy: 0.5 }, sfxOpportunities: [],
  };
  delete content.faceTrack;
  // B-roll slots fall back to their own TF-IDF salience only when visualSupport is not an array.
  content.visualSupport = null;
  content.deterministic = true;
  return content;
}

// ---------------------------------------------------------------- moderation
function screenTranscript(sentences, { chunkWords = 3000, screen = null } = {}) {
  const fn = typeof screen === "function" ? screen : require("../../services/prompt_moderation").screen;
  const chunks = [];
  let cur = [];
  let count = 0;
  for (const s of Array.isArray(sentences) ? sentences : []) {
    const text = String((s && s.text) || "");
    const n = text.split(/\s+/).filter(Boolean).length;
    if (cur.length && count + n > chunkWords) {
      chunks.push(cur);
      cur = [cur[cur.length - 1]];   // one sentence of overlap: a co-occurrence rule can straddle a chunk boundary
      count = String(cur[0].text || "").split(/\s+/).filter(Boolean).length;
    }
    cur.push(s);
    count += n;
  }
  if (cur.length) chunks.push(cur);
  for (let k = 0; k < chunks.length; k++) {
    let r = null;
    try { r = fn(chunks[k].map((s) => String(s.text || "")).join(" ")); } catch { r = null; }
    if (r && r.tier1) return { tier1: { rule: String(r.tier1.rule || "").slice(0, 60), category: String(r.tier1.category || "").slice(0, 60) }, chunks: chunks.length, chunk: k };
  }
  return { tier1: null, chunks: chunks.length };
}

function contentReviewError(tier1) {
  return new EditError("CONTENT_REVIEW", {
    status: 422, errorClass: "resource", retryable: false, stage: "ANALYZING_CONTENT",
    userMessage: "This video needs a content review before it can be edited with AI.",
    detail: `moderation tier1 rule=${tier1 && tier1.rule}`,
    extra: { retryable: false, actions: ["delete"], rule: tier1 && tier1.rule, category: tier1 && tier1.category },
  });
}

// ---------------------------------------------------------------- discoveries
function discoveriesFor(content, sentences) {
  const byId = new Map((sentences || []).map((s) => [s.id, s]));
  const face = new Set(((content && content.faceRequired) || []).map((f) => f.sentenceId));
  const topics = content && Array.isArray(content.topics) && content.topics.length
    ? content.topics.map((t) => t.label)
    : ((content && content.keywords) || []).slice(0, 5).map((k) => k.term);
  const hookId = content && content.hook && content.hook.sentenceIds[0];
  const hook = hookId && byId.get(hookId) ? String(byId.get(hookId).text || "").slice(0, 200) : null;
  const brollMoments = Array.isArray(content && content.visualSupport)
    ? content.visualSupport.filter((v) => v.need >= 0.45 && !face.has(v.sentenceId)).length
    : 0;
  const out = { topics: topics.filter((x) => typeof x === "string" && x).slice(0, 12), brollMoments };
  if (hook) out.hook = hook;
  return out;
}

// ---------------------------------------------------------------- stage entry
function capOf(settings, project) {
  const p = isPlain(project) ? project : {};
  const cost = isPlain(p.cost) ? p.cost : {};
  const caps = settings && isPlain(settings.caps) ? settings.caps : {};
  return num(p.settings && p.settings.maxCostUsd) || (num(cost.capUsd) > 0 ? num(cost.capUsd) : null) || num(caps.maxUsdPerProject);
}

async function analyzeContent(opts = {}) {
  const {
    transcript = null, words = [], video = null, faces = null, projectSettings = {}, settings = null, project = null, signal = null,
    tracker = null, onCost = null, onNotice = null, chat = null, auth = null, fetchImpl = null, cacheDir = null, spentUsd = null,
    now = Date.now,
  } = opts;
  const callJson = typeof opts.callJson === "function" ? opts.callJson : require("../ai/llm").callJson;
  const lang = String((transcript && transcript.language) || (projectSettings && projectSettings.language !== "auto" && projectSettings.language) || "en").slice(0, 5);
  const sentences = isPlain(transcript) && Array.isArray(transcript.sentences) ? transcript.sentences : [];
  const wordList = Array.isArray(words) && words.length ? words : (isPlain(transcript) && Array.isArray(transcript.words) ? transcript.words : []);
  const durationSec = num(opts.durationSec) || (sentences.length ? Number(sentences[sentences.length - 1].end) : 0);
  const notices = [];
  const fallbacks = [];
  const notice = (code, severity, message) => {
    if (notices.some((n) => n.code === code)) return;
    const n = { code, severity, stage: "ANALYZING_CONTENT", message };
    notices.push(n);
    if (typeof onNotice === "function") { try { onNotice(n); } catch { /* observer */ } }
  };
  const wrap = (content, extra) => ({
    content: { schemaVersion: 1, lang, promptVersion: PROMPT_VERSION, ...content, source: extra.source, model: extra.model || null },
    notices, fallbacks, discoveries: discoveriesFor(content, sentences), costUsd: r8(extra.costUsd || 0), dropped: extra.dropped || null,
    source: extra.source, model: extra.model || null, engine: extra.source === "ai" ? "llm" : extra.source,
  });

  if (!sentences.length) {
    const content = deterministicFallback({ sentences: [], words: [], faces, lang });
    return wrap(content, { source: "no_transcript" });
  }

  const mod = screenTranscript(sentences, { screen: opts.screen });
  if (mod.tier1) throw contentReviewError(mod.tier1);

  const input = buildContentInput({ transcript, words: wordList, video, faces, projectSettings, lang });
  let costUsd = 0;
  const fallback = (why, err) => {
    notice("AI_ANALYSIS_UNAVAILABLE", "warn", "AI analysis unavailable; a basic edit will be made.");
    fallbacks.push(`content_${why}`.slice(0, 40));
    const content = deterministicFallback({ sentences, words: wordList, faces, lang });
    return wrap(content, { source: "deterministic", costUsd, error: err });
  };

  const breaker = getBreaker(BREAKER, { now });
  const cap = capOf(settings, project);
  const spent = spentUsd != null && Number.isFinite(Number(spentUsd)) ? Number(spentUsd) : num(project && project.cost && project.cost.spentUsd) || 0;
  if (cap != null && cap > 0 && spent + EST_CALL_USD > cap + 1e-9) return fallback("cost_cap");
  if (!breaker.canRequest()) return fallback("breaker");
  const stageModelsEarly = settings && settings.providers && settings.providers.llm && isPlain(settings.providers.llm.stageModels) ? settings.providers.llm.stageModels : {};
  const modelKey = opts.model !== undefined ? (opts.model || "default") : (stageModelsEarly.ve_content || "default");
  const modelBreaker = getBreaker(`${BREAKER}:${modelKey}`, { now });
  if (!modelBreaker.canRequest()) return fallback("breaker");

  let baseChat = typeof chat === "function" ? chat : null;
  if (!baseChat && settings && settings.providerBaseOverride && settings.providerBaseOverride.openrouter) {
    baseChat = require("../ai/openrouter_stt").createDirectChat({ settings, auth, fetchImpl });
  }
  const shaping = faults.faultFor("llm", { settings, project });
  const chatImpl = shaping && shaping.mode === "invalid_json"
    ? async (o) => ({ ...(await (baseChat || require("../../services/openrouter").chat)(o)), text: "Here is my analysis of the talk." })
    : baseChat;
  const stageModels = settings && settings.providers && settings.providers.llm && isPlain(settings.providers.llm.stageModels) ? settings.providers.llm.stageModels : {};
  const model = opts.model !== undefined ? opts.model : (typeof stageModels.ve_content === "string" && stageModels.ve_content ? stageModels.ve_content : null);

  let res;
  try {
    await faults.maybeFail("llm", { settings, project, signal, stage: "ANALYZING_CONTENT" });
    res = await callJson({
      stage: STAGE, system: SYSTEM_PROMPT,
      user: `Transcript language: ${lang}. Video duration: ${r3(durationSec)} s.\nINPUT:\n${JSON.stringify(input)}`,
      schema: buildContentSchema(sentences.map((s) => s.id)),
      model, temperature: 0, tracker, signal, promptVersion: PROMPT_VERSION, cacheDir, chat: chatImpl || undefined, now,
      onCost: (entry) => {
        costUsd += Number(entry && entry.costUsd) || 0;
        if (typeof onCost === "function") { try { onCost({ ...entry, stage: STAGE }); } catch { /* observer */ } }
      },
      onNotice: (n) => notice(n.code, "info", "A fallback AI model was used for content analysis."),
    });
    breaker.recordSuccess();
    modelBreaker.recordSuccess();
  } catch (e) {
    const cls = isEditError(e) ? e.errorClass : "provider";
    if (cls === "cancelled" || (signal && signal.aborted)) throw e;
    if (cls === "bug") throw e;
    if (isEditError(e) && e.extra && Number(e.extra.costUsd) > 0 && !costUsd) costUsd = Number(e.extra.costUsd);
    if (cls === "budget") breaker.recordFailure("budget", { untilMs: nextUtcMidnight(now()) });
    else if (cls === "config") breaker.recordFailure("config");
    else if (cls === "transient") modelBreaker.recordFailure("transient");
    return fallback(isEditError(e) ? String(e.code).toLowerCase() : "error", e);
  }
  const grounded = groundContent(res.value, {
    sentences, words: wordList, fillerCandidates: input.fillerCandidates, retakeCandidates: input.retakeCandidates, durationSec,
  });
  return wrap(grounded.content, { source: "ai", model: res.model, costUsd, dropped: grounded.dropped });
}

module.exports = {
  analyzeContent, buildContentInput, buildContentSchema, groundContent, deterministicFallback, screenTranscript, contentReviewError,
  discoveriesFor, SYSTEM_PROMPT, STAGE, PROMPT_VERSION, CONTENT_REL, SEGMENT_TYPES, FACE_REASONS,
};
