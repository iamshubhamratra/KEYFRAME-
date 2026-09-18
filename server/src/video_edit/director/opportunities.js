// VIDEO EDIT OPPORTUNITIES — the one normalised shape both directors hand to the rhythm engine.
//
// WHY THIS EXISTS. Opportunities come from two very different authors: the LLM director (free text,
// sentence ids it may have invented, priorities outside 0..1, queries full of camera words and brand
// logos) and the heuristic director (clean, but produced by lexical rules). The rhythm engine, the
// plan (`plan.opportunities`, re-used by intensity re-plans without another LLM call) and the retrieval
// stage must never care which author wrote a list. So both pass through finalizeOpportunities: unknown
// sentences dropped, priorities clamped, enums normalised, text truncated to the plan limits, queries
// cleaned (concrete subjects only, AI/5G/UX… kept), duplicates removed, a deterministic order
// (priority desc, then sentence order, then word) and deterministic ids (`opp_b001`, …).
//
// CONTRACT (pure):
//   LIMITS · QUERY_WHITELIST
//   cleanQuery(text, lang) -> string ('' when no concrete subject survives or the query asks for a logo)
//   cleanQueries(list, lang, { max=4 }) -> string[] (deduped, order kept)
//   condenseTitle(text, max=32) -> string (word boundary, trailing connector trimmed, first letter upper-cased)
//   emptyOpportunities(source) -> Opportunities
//   finalizeOpportunities(raw, { sentences, source:'ai'|'heuristic', lang }) -> Opportunities
//     Opportunities = { source,
//       brollOpportunities:[{ id, sentenceId, wordAnchor:{ fromText, toText, w0, w1 }|null, priority, layoutPreference,
//                             mediaPreference, queries:string[2..4], reason }],
//       punchIns:[{ id, sentenceId, wordText, w, w1, kind, priority, reason }],
//       graphics:[{ id, kind, sentenceId, title, subtitle?, value?, w:int|null, priority, reason }],
//       sfx:[{ id, anchor, ref, cue, priority, reason }],
//       music:{ include, mood, query, energy, reason } | null,
//       transitions:[{ id, afterSentenceId, kind, reason }],
//       hookTitle:{ text, sentenceId } | null, ctaCard:{ text, sentenceId } | null }
//     (EDIT_PLAN.md §6 keys, plus resolved word indices and ids). hookTitle / ctaCard are also listed in
//     `graphics` as HOOK_TITLE / CTA so plan.opportunities keeps them.
//   toPlanOpportunities(opps, { brollSlots }) -> plan.opportunities ({ broll, effects, graphics, sfx }, EDIT_PLAN §2 shapes);
//     candidatesPrefetched = the sentence has an accepted scored slot (director/slots.js)
//   truncate(text, max) / condenseTitle: `max` is UTF-16 code units (what zod counts), cut on grapheme boundaries.

const { subjectQuery, STOP: QUERY_STOP } = require("../../services/asset_sources/query_terms");
const { ENUMS } = require("../plan/schema");
const L = require("./lexicon");
const { normalizeSlots, slotPrefetched } = require("./slots");

const LIMITS = Object.freeze({
  broll: 60, punchIns: 60, graphics: 30, sfx: 60, transitions: 20,
  queries: 4, minQueries: 2, queryWords: 5, queryChars: 60, reason: 120, title: 32, subtitle: 48, value: 24,
  musicQueryWords: 4, mood: 40,
});
const QUERY_WHITELIST = Object.freeze(["AI", "VR", "AR", "5G", "UX", "UI", "SEO", "API", "CRM", "B2B"]);
const BANNED_QUERY_RE = /(?<![\p{L}\p{N}])(?:logo|logos|logotype|trademark|watermark|brandmark)(?![\p{L}\p{N}])/iu;
const ASCII_WORD_RE = /^[A-Za-z][A-Za-z'-]*$/;
const GRAPHIC_KINDS = ENUMS.graphicKind;
const SINGLETON_GRAPHICS = new Set(["HOOK_TITLE", "CTA", "LOGO_OUTRO"]);
// What the director may place at a topic change. Every other joint gets the edit's cut style (render/transitions.js).
const TRANSITION_KINDS = Object.freeze(["DIP_BLACK", "FLASH", "CROSSFADE", "ZOOM_IN", "WHIP_LEFT", "WHIP_RIGHT", "SLIDE_UP"]);
// a truncated title must not end on a function word ("Shipped two weeks early and it")
const TRAILING_CONNECTOR_RE = /\s+(?:and|or|but|so|the|a|an|to|of|for|with|on|in|at|it|is|was|that|this|my|your|our|their|y|et|und|e|o|de|la|le|el)$/iu;

const r3 = (x) => Math.round(x * 1000) / 1000;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const cmpStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const pad3 = (n) => String(n).padStart(3, "0");

// Limits are measured in UTF-16 code units — the unit zod `.max()` and the plan refinements count — and
// text is only ever cut between grapheme clusters, so an emoji or a Devanagari conjunct is kept whole or
// dropped whole (a 32-code-point title with an emoji is 33 units and used to fail parsePlan).
const GRAPHEMES = new Intl.Segmenter("en", { granularity: "grapheme" });
function clipUnits(s, max) {
  if (s.length <= max) return s;
  let out = "";
  for (const { segment } of GRAPHEMES.segment(s)) {
    if (out.length + segment.length > max) break;
    out += segment;
  }
  return out;
}

function truncate(text, max) {
  const s = String(text == null ? "" : text).replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  return clipUnits(s, max).trim();
}

function condenseTitle(text, max = LIMITS.title) {
  let s = String(text == null ? "" : text).replace(/\s+/g, " ").trim().replace(/[.,!?;:…。！？]+$/u, "");
  if (s.length > max) {
    const head = clipUnits(s, max + 1);
    const sp = head.lastIndexOf(" ");
    s = sp > max * 0.5 ? head.slice(0, sp) : clipUnits(s, max);
    for (let k = 0; k < 4; k++) {
      const next = s.replace(/[\s,;:–—-]+$/u, "").replace(TRAILING_CONNECTOR_RE, "");
      if (next === s) break;
      s = next;
    }
  }
  s = s.trim();
  if (!s) return s;
  const first = String.fromCodePoint(s.codePointAt(0));
  const upper = first.toLocaleUpperCase() + s.slice(first.length);
  return upper.length <= max ? upper : s;          // "ß" -> "SS" must not push the title over the limit
}

function cleanQuery(text, lang = "en") {
  const raw = String(text == null ? "" : text).normalize("NFKC").trim();
  if (!raw || BANNED_QUERY_RE.test(raw)) return "";
  const out = [];
  for (const tok of raw.split(/\s+/)) {
    // combining marks (\p{M}: Devanagari vowel signs, nukta, Arabic harakat) belong to the word
    const bare = tok.replace(/^[^\p{L}\p{M}\p{N}]+|[^\p{L}\p{M}\p{N}]+$/gu, "");
    if (!bare) continue;
    const upper = bare.toUpperCase();
    let keep = null;
    if (QUERY_WHITELIST.includes(upper)) keep = upper;
    else if (ASCII_WORD_RE.test(bare)) {
      const q = subjectQuery(bare);
      keep = q && !L.isStopword(q, "en") && !L.isStopword(q, lang) ? q : null;
    } else {
      const n = L.normWord(bare);
      keep = n && [...n].length >= 2 && /\p{L}/u.test(n) && !L.isStopword(n, lang) && !QUERY_STOP.has(n) ? n : null;
    }
    if (keep && !out.includes(keep)) out.push(keep);
    if (out.length >= LIMITS.queryWords) break;
  }
  return truncate(out.join(" "), LIMITS.queryChars);
}

function cleanQueries(list, lang = "en", { max = LIMITS.queries } = {}) {
  const out = [];
  const seen = new Set();
  for (const q of Array.isArray(list) ? list : []) {
    const c = cleanQuery(q, lang);
    const key = c.toLowerCase();
    if (!c || seen.has(key)) continue;
    seen.add(key);
    out.push(c);
    if (out.length >= max) break;
  }
  return out;
}

function emptyOpportunities(source = "heuristic") {
  return { source, brollOpportunities: [], punchIns: [], graphics: [], sfx: [], music: null, transitions: [], hookTitle: null, ctaCard: null };
}

function finalizeOpportunities(raw = {}, { sentences = [], source = "heuristic", lang = "en" } = {}) {
  const order = new Map();
  const byId = new Map();
  (sentences || []).forEach((s, k) => { if (s && typeof s.id === "string" && !order.has(s.id)) { order.set(s.id, k); byId.set(s.id, s); } });
  const known = (id) => typeof id === "string" && byId.has(id);
  const prio = (p) => { const n = Number(p); return Number.isFinite(n) ? r3(clamp(n, 0, 1)) : null; };
  const inSentence = (sid, w) => Number.isInteger(w) && w >= byId.get(sid).w0 && w <= byId.get(sid).w1;
  const reason = (r) => truncate(r, LIMITS.reason);
  const sortItems = (items, wOf) => items.sort((a, b) => (b.priority - a.priority)
    || (order.get(a.sentenceId) - order.get(b.sentenceId))
    || ((wOf(a) == null ? -1 : wOf(a)) - (wOf(b) == null ? -1 : wOf(b)))
    || cmpStr(a._key, b._key));
  const out = emptyOpportunities(source === "ai" ? "ai" : "heuristic");

  // B-roll
  const broll = [];
  for (const b of Array.isArray(raw.brollOpportunities) ? raw.brollOpportunities : []) {
    if (!b || !known(b.sentenceId)) continue;
    const priority = prio(b.priority);
    if (priority == null) continue;
    const queries = cleanQueries(b.queries, lang);
    if (queries.length < LIMITS.minQueries) continue;
    let wordAnchor = null;
    const wa = b.wordAnchor;
    if (wa && inSentence(b.sentenceId, wa.w0) && inSentence(b.sentenceId, wa.w1) && wa.w1 >= wa.w0) {
      wordAnchor = { fromText: truncate(wa.fromText || "", 80), toText: truncate(wa.toText || wa.fromText || "", 80), w0: wa.w0, w1: wa.w1 };
    }
    broll.push({
      sentenceId: b.sentenceId, wordAnchor, priority,
      layoutPreference: ENUMS.layout.includes(b.layoutPreference) ? b.layoutPreference : "FULL",
      mediaPreference: ENUMS.mediaPreference.includes(b.mediaPreference) ? b.mediaPreference : "either",
      queries, reason: reason(b.reason),
      _key: `${b.sentenceId}|${wordAnchor ? `${wordAnchor.w0}-${wordAnchor.w1}` : "all"}|${queries.join(",")}`,
    });
  }
  sortItems(broll, (x) => (x.wordAnchor ? x.wordAnchor.w0 : null));
  const brollSeen = new Set();
  for (const b of broll) {
    const key = `${b.sentenceId}|${b.wordAnchor ? `${b.wordAnchor.w0}-${b.wordAnchor.w1}` : "all"}`;
    if (brollSeen.has(key) || out.brollOpportunities.length >= LIMITS.broll) continue;
    brollSeen.add(key);
    const { _key, ...item } = b;
    out.brollOpportunities.push({ id: `opp_b${pad3(out.brollOpportunities.length + 1)}`, ...item });
  }

  // punch-ins
  const punches = [];
  for (const p of Array.isArray(raw.punchIns) ? raw.punchIns : []) {
    if (!p || !known(p.sentenceId) || !inSentence(p.sentenceId, p.w)) continue;
    const priority = prio(p.priority);
    if (priority == null) continue;
    const w1 = inSentence(p.sentenceId, p.w1) && p.w1 >= p.w ? p.w1 : p.w;
    punches.push({
      sentenceId: p.sentenceId, wordText: truncate(p.wordText || "", 60), w: p.w, w1,
      kind: ENUMS.effectOpportunityKind.includes(p.kind) ? p.kind : "PUNCH_IN", priority, reason: reason(p.reason), _key: `${p.w}|${p.kind}`,
    });
  }
  sortItems(punches, (x) => x.w);
  const punchSeen = new Set();
  for (const p of punches) {
    if (punchSeen.has(p.w) || out.punchIns.length >= LIMITS.punchIns) continue;
    punchSeen.add(p.w);
    const { _key, ...item } = p;
    out.punchIns.push({ id: `opp_p${pad3(out.punchIns.length + 1)}`, ...item });
  }

  // hook title / CTA card (also listed as graphics)
  const card = (c) => (c && known(c.sentenceId) && condenseTitle(c.text) ? { text: condenseTitle(c.text), sentenceId: c.sentenceId } : null);
  out.hookTitle = card(raw.hookTitle);
  out.ctaCard = card(raw.ctaCard);

  // graphics
  const graphics = [];
  const rawGraphics = Array.isArray(raw.graphics) ? raw.graphics.slice() : [];
  if (out.hookTitle) rawGraphics.push({ kind: "HOOK_TITLE", sentenceId: out.hookTitle.sentenceId, title: out.hookTitle.text, priority: 0.9, reason: "hook title" });
  if (out.ctaCard) rawGraphics.push({ kind: "CTA", sentenceId: out.ctaCard.sentenceId, title: out.ctaCard.text, priority: 0.8, reason: "call to action card" });
  for (const g of rawGraphics) {
    if (!g || !GRAPHIC_KINDS.includes(g.kind) || !known(g.sentenceId)) continue;
    const priority = prio(g.priority);
    const title = condenseTitle(g.title);
    if (priority == null || !title) continue;
    const item = { kind: g.kind, sentenceId: g.sentenceId, title, priority, reason: reason(g.reason), w: inSentence(g.sentenceId, g.w) ? g.w : null };
    const subtitle = g.subtitle == null ? "" : condenseTitle(g.subtitle, LIMITS.subtitle);
    if (subtitle) item.subtitle = subtitle;
    const value = g.value == null ? "" : truncate(String(g.value), LIMITS.value);
    if (value) item.value = value;
    item._key = `${g.kind}|${title}`;
    graphics.push(item);
  }
  sortItems(graphics, (x) => x.w);
  const gSeen = new Set();
  for (const g of graphics) {
    const key = SINGLETON_GRAPHICS.has(g.kind) ? g.kind : `${g.kind}|${g.sentenceId}`;
    if (gSeen.has(key) || out.graphics.length >= LIMITS.graphics) continue;
    gSeen.add(key);
    const { _key, ...item } = g;
    out.graphics.push({ id: `opp_g${pad3(out.graphics.length + 1)}`, ...item });
  }

  // sfx
  const sfx = [];
  for (const s of Array.isArray(raw.sfx) ? raw.sfx : []) {
    if (!s || !ENUMS.sfxAnchor.includes(s.anchor) || !ENUMS.sfxCue.includes(s.cue) || !known(s.ref)) continue;
    const priority = prio(s.priority);
    if (priority == null) continue;
    sfx.push({ anchor: s.anchor, ref: s.ref, cue: s.cue, priority, reason: reason(s.reason), sentenceId: s.ref, _key: `${s.anchor}|${s.cue}` });
  }
  sortItems(sfx, () => null);
  const sSeen = new Set();
  for (const s of sfx) {
    const key = `${s.anchor}|${s.ref}|${s.cue}`;
    if (sSeen.has(key) || out.sfx.length >= LIMITS.sfx) continue;
    sSeen.add(key);
    out.sfx.push({ id: `opp_s${pad3(out.sfx.length + 1)}`, anchor: s.anchor, ref: s.ref, cue: s.cue, priority: s.priority, reason: s.reason });
  }

  // transitions (sentence order)
  const tSeen = new Set();
  const transitions = (Array.isArray(raw.transitions) ? raw.transitions : [])
    .filter((t) => t && known(t.afterSentenceId) && TRANSITION_KINDS.includes(t.kind))
    .sort((a, b) => (order.get(a.afterSentenceId) - order.get(b.afterSentenceId)) || cmpStr(a.kind, b.kind));
  for (const t of transitions) {
    if (tSeen.has(t.afterSentenceId) || out.transitions.length >= LIMITS.transitions) continue;
    tSeen.add(t.afterSentenceId);
    out.transitions.push({ id: `opp_t${pad3(out.transitions.length + 1)}`, afterSentenceId: t.afterSentenceId, kind: t.kind, reason: reason(t.reason) });
  }

  // music
  const m = raw.music;
  if (m && typeof m === "object") {
    const energy = prio(m.energy);
    const mood = truncate(String(m.mood || "").toLowerCase().replace(/[^\p{L}\p{N} -]/gu, ""), LIMITS.mood) || "calm";
    const words = String(m.query || `${mood} background`).replace(/[^\p{L}\p{N} -]/gu, " ").trim().split(/\s+/).filter(Boolean).slice(0, LIMITS.musicQueryWords);
    out.music = {
      include: m.include !== false,
      mood,
      query: truncate(words.join(" ").toLowerCase(), 80) || `${mood} background`,
      energy: energy == null ? 0.5 : energy,
      reason: reason(m.reason),
    };
  }
  return out;
}

function toPlanOpportunities(opps, { brollSlots = null } = {}) {
  const o = opps || emptyOpportunities();
  const reason = (r) => truncate(r, 160);
  const slots = normalizeSlots(brollSlots);
  return {
    broll: (o.brollOpportunities || []).map((b) => {
      const item = { id: b.id, sentenceId: b.sentenceId, priority: b.priority, layoutPreference: b.layoutPreference,
        mediaPreference: b.mediaPreference, queries: b.queries.map((q) => truncate(q, LIMITS.queryChars)), reason: reason(b.reason),
        candidatesPrefetched: !!(slots && slotPrefetched(slots.get(b.sentenceId))) };
      if (b.wordAnchor) item.wordAnchor = { w0: b.wordAnchor.w0, w1: b.wordAnchor.w1 };
      return item;
    }),
    effects: (o.punchIns || []).map((p) => ({ id: p.id, sentenceId: p.sentenceId, w: p.w, kind: p.kind, priority: p.priority, reason: reason(p.reason) })),
    graphics: (o.graphics || []).map((g) => {
      const item = { id: g.id, kind: g.kind, sentenceId: g.sentenceId, title: g.title, priority: g.priority, reason: reason(g.reason) };
      if (g.subtitle) item.subtitle = g.subtitle;
      if (g.value) item.value = g.value;
      return item;
    }),
    sfx: (o.sfx || []).map((s) => ({ id: s.id, anchor: s.anchor, ref: s.ref, cue: s.cue, priority: s.priority, reason: reason(s.reason) })),
  };
}

module.exports = {
  LIMITS, QUERY_WHITELIST, TRANSITION_KINDS,
  cleanQuery, cleanQueries, condenseTitle, truncate, emptyOpportunities, finalizeOpportunities, toPlanOpportunities,
};
