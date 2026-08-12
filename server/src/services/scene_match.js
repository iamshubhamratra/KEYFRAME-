// WHICH PICTURE BELONGS ON THIS BEAT — one implementation, every renderer.
//
// The complaint this exists for: "it is getting random screenshots and random
// assets". Measured on shipped films, the cause was the same everywhere and had
// nothing to do with the pictures being bad — it was that NOTHING compared a
// picture to the words it would play under. Each renderer sorted the pool once,
// film-globally (screenshot-ness, the director's prominence verdict, its score,
// its CLIP relevance to the FILM'S subject) and then popped items off that one
// list. Ties fall back to arrival order, and on a website job every capture is
// written `site_0.png`…`site_5.png` with a boilerplate alt, so everything tied.
//
// Everything scored here is data the pipeline already produced and threw away:
//   sees                 the vision pass's literal description of the image
//   sectionType          which part of the site it was captured from
//   query / alt          what it was fetched for
//   pageUrl / sourceUrl  the page it came from
//   clipSceneRelevance   the Creative Director's per-scene CLIP score (new)
//
// Kept dependency-free on purpose: 24 composers require this, and any one of
// them pulling in config/db through a helper would be a boot-order hazard.

// Words that appear in EVERY caption on a website job — matching on them scores
// every asset identically and the ranking collapses back to pool order.
const STOP = new Set([
  "the", "a", "an", "and", "or", "for", "with", "your", "our", "this", "that", "page",
  "of", "to", "in", "on", "it", "is", "are", "you", "we", "all", "every",
  "real", "website", "screenshot", "image", "photo", "product", "present", "styled",
  "browser", "frame", "hero", "treatment", "matches", "scene", "topic", "unpinned",
  // Prepositions and filler that carry no subject. Leaving "from" out of this
  // list was enough to score a decorative gradient onto a beat: its alt text
  // read "testimonials from Zoom", the narration said "from", and that single
  // word was the whole match.
  "from", "into", "onto", "over", "under", "after", "before", "than", "then",
  "its", "their", "them", "they", "was", "were", "been", "being", "have", "has",
  "had", "will", "would", "can", "could", "should", "more", "most", "just", "also",
]);

const wordsOf = (s) => String(s || "").toLowerCase().match(/[a-z0-9]{3,}/g) || [];

// A scene's own list copy, however this storyboard spells it.
function sceneList(sc, n = 4) {
  const first = [sc && sc.chips, sc && sc.bullets, sc && sc.onScreenText, sc && sc.items]
    .find((x) => Array.isArray(x) && x.length) || [];
  return first.slice(0, n).map(String);
}

// WHAT THE BEAT IS ABOUT. The narration was the field missing everywhere: a
// headline is 2-4 words ("SHARED CONTEXT") while the voiceover carries the
// subject in full ("One workspace for your entire product development process").
function sceneWords(sc) {
  if (!sc) return new Set();
  return new Set([
    ...wordsOf(sc.headline), ...wordsOf(sc.title), ...wordsOf(sc.subtext),
    ...wordsOf(sc.voiceover), ...wordsOf(sc.kicker), ...wordsOf(sc.emphasis),
    ...wordsOf(sc.body), ...sceneList(sc).flatMap(wordsOf),
  ].filter((w) => !STOP.has(w)));
}

// WHAT THE PICTURE ACTUALLY SHOWS, weighted by how much each source is worth.
const FIELDS = [["sees", 1.6], ["alt", 1.2], ["query", 1.2], ["sectionType", 1.0], ["url", 0.9], ["file", 0.7]];
function assetWords(a) {
  const src = {
    sees: a && a.sees,
    alt: a && a.alt,
    query: a && (a.query || a.searchQuery),
    sectionType: a && a.sectionType,
    url: String((a && (a.pageUrl || a.sourceUrl)) || "").replace(/https?:\/\/[^/]+/, "").replace(/[/_-]+/g, " "),
    file: String((a && a.path) || "").split("/").pop().replace(/^page_\d+_/, "").replace(/\.\w+$/, ""),
  };
  const m = new Map();
  for (const [k, w] of FIELDS) {
    for (const t of wordsOf(src[k])) { if (!STOP.has(t) && (m.get(t) || 0) < w) m.set(t, w); }
  }
  return m;
}

// A beat's PURPOSE says which part of a site belongs on it — the proof beat wants
// the logo wall, the close wants the sign-up, the opener wants the hero. Word
// overlap cannot make that link: a testimonial capture rarely repeats the
// narrator's nouns.
const SECTION_FOR = {
  hook: /hero|home|landing/i, title: /hero|home|landing/i,
  context: /hero|features|about/i, problem: /hero|features|about/i,
  pain: /hero|features|about/i,
  feature: /features|product|how|solution/i, demo: /features|product|how/i,
  benefit: /features|product|solution/i,
  how: /features|product|how|docs/i,
  proof: /testimonial|logos|customers|social|stats/i,
  testimonial: /testimonial|logos|customers|social/i,
  stat: /stats|testimonial|logos|customers/i, chart: /stats|pricing/i,
  pricing: /pricing|plans/i,
  cta: /cta|signup|sign-up|footer|pricing/i, close: /cta|signup|footer/i,
};

// `used` (array or Set) is the repeat penalty — a fresh, weaker asset beats
// showing the same capture a third time, which is how one screenshot ended up on
// six of fourteen beats in a shipped film. `last` never repeats back-to-back.
function matchScore(sc, a, { used = null, last = null } = {}) {
  if (!sc || !a) return 0;
  const terms = sceneWords(sc);
  let score = 0;
  if (terms.size) for (const [t, w] of assetWords(a)) if (terms.has(t)) score += w;
  const want = SECTION_FOR[String(sc.purpose || sc.kind || "").toLowerCase()];
  if (want && want.test(String(a.sectionType || ""))) score += 1.5;
  // The per-scene CLIP score is the only signal computed against THIS line, so it
  // outranks the film-wide one when present.
  if (typeof a.clipSceneRelevance === "number") score += a.clipSceneRelevance * 1.2;
  else if (typeof a.clipRelevance === "number") score += a.clipRelevance * 0.8;
  // THE DIRECTOR ALREADY SAID NO. `visionOk:false` / prominence "background" is
  // the vision pass's verdict that the picture is weak or off-subject — usually a
  // decorative page gradient. Without this it can still win a thin pool on a
  // couple of stray word matches: measured, an orange gradient banner ("BANK
  // OFFER REFRESHED") beating real captures for the beat about 200 million users.
  if (a.visionOk === false) score -= 1.5;
  else if (a.cdProminence === "background") score -= 1;
  if (used && (Array.isArray(used) ? used.includes(a) : used.has(a))) score -= 2.5;
  if (last && a === last) score -= 1.5;
  return score;
}

// Best on-topic candidate, or null when nothing is even loosely about this beat
// (the caller then falls back to whatever order it used before, so this can only
// improve on the previous choice — never starve a slot).
function pickForScene(pool, sc, { pred = null, used = null, last = null, skip = null, min = 0.001 } = {}) {
  let best = null, bestScore = min;
  for (const a of (Array.isArray(pool) ? pool : [])) {
    if (!a) continue;
    if (skip && (Array.isArray(skip) ? skip.includes(a) : skip.has(a))) continue;
    if (pred && !pred(a)) continue;
    const s = matchScore(sc, a, { used, last });
    if (s > bestScore) { bestScore = s; best = a; }
  }
  return best;
}

module.exports = { STOP, wordsOf, sceneWords, assetWords, matchScore, pickForScene, SECTION_FOR };
