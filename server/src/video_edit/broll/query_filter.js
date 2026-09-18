// VIDEO EDIT B-ROLL QUERY FILTER — reduce a visual-noun query to what a stock search can use.
//
// WHY THIS EXISTS. Queries come from the content analysis / director ("AI robot arm moving
// smoothly", "people walking between tall buildings"). `asset_sources/query_terms.subjectQuery` strips
// camera direction and filler words, but it only keeps lowercase words of three or more letters — "AI",
// "VR", "5G", "B2B" vanish and "AI chip" becomes "chip", a stock search for the wrong subject — and it
// keeps prepositions, gerunds and plain adjectives. Pixabay matches EVERY query term (AND), so
// "person walking through busy" (the old 4-term cut of "person slowly walking through busy city street")
// came back empty there and off-topic on Openverse, while "city street" returned hundreds of on-topic hits.
// This wrapper, per token: restores whitelisted acronyms (defaults.queryWhitelist) uppercase, runs
// subjectQuery, drops manner adverbs; then over the phrase: drops prepositions, and drops plain
// adjectives and gerund verbs while at least two other terms remain; and when still over the cap keeps
// the HEAD noun (the phrase's last term) plus the leading terms. A query that reduces to nothing is
// skipped by the caller.
//
// CONTRACT:
//   cleanQuery(text, { whitelist, maxTerms=3, maxChars=80 }) -> string ('' = skip)
//   headQuery(cleaned) -> the broader head-noun form ('busy city street' → 'city street'; '' when < 3 terms)
//   prepareQueries(queries, { whitelist, max=3, maxChars }) -> [{ text, kind, source }]
//     queries: string[] | [{ text, kind }]; deduped by cleaned text (case-insensitive), empty dropped.
//   PREPOSITIONS · ADJECTIVES · MANNER · ING_NOUNS · whitelistSet(list)

const { subjectQuery } = require("../../services/asset_sources/query_terms");
const { RETRIEVAL_DEFAULTS } = require("./defaults");

const TOKEN_RE = /[A-Za-z0-9][A-Za-z0-9-]*/g;
const MAX_TERMS = 3;

const PREPOSITIONS = new Set([
  "through", "between", "under", "over", "into", "onto", "behind", "near", "inside", "outside", "beside", "besides", "across",
  "along", "above", "below", "beneath", "underneath", "toward", "towards", "among", "amongst", "around", "past", "within",
  "without", "upon", "off", "out", "down", "from", "about", "against", "next", "while", "during", "before", "after", "via",
  "like", "near", "nearby", "throughout", "atop", "amid", "beyond",
]);
// Plain descriptive adjectives: never the subject, and on an AND-matching provider every one halves the hits.
const ADJECTIVES = new Set([
  "tall", "short", "busy", "crowded", "empty", "old", "young", "elderly", "happy", "sad", "angry", "beautiful", "pretty",
  "large", "little", "long", "high", "low", "full", "open", "closed", "sunny", "rainy", "cloudy", "snowy", "foggy", "cold",
  "hot", "warm", "wet", "dry", "fresh", "clean", "dirty", "new", "shiny", "colorful", "colourful", "blurry", "blurred",
  "golden", "red", "blue", "green", "yellow", "orange", "purple", "pink", "white", "black", "grey", "gray", "brown",
  "professional", "casual", "serious", "focused", "confident", "stressed", "tired", "excited", "cheerful", "several",
  "many", "various", "different", "local", "urban", "rural", "outdoor", "indoor", "daily", "typical", "generic",
  "abstract", "digital", "virtual", "futuristic", "vintage", "cozy", "quiet", "noisy", "peaceful", "huge", "giant",
]);
const MANNER = new Set(["slowly", "steadily", "softly", "gradually", "suddenly", "carefully", "happily", "busily", "calmly",
  "gracefully", "briskly", "lazily", "peacefully", "quietly", "loudly", "neatly", "closely", "finally", "really", "actually",
  "basically", "literally", "constantly", "continuously", "repeatedly", "beautifully", "slightly", "barely", "nearly",
  "together", "alone", "away", "outside", "indoors", "outdoors", "very"]);
// -ing words that ARE subjects (things, places, activities a camera films) — never dropped as gerund verbs.
const ING_NOUNS = new Set([
  "building", "ceiling", "painting", "clothing", "meeting", "wedding", "morning", "evening", "ring", "king", "spring", "string",
  "thing", "wing", "swing", "parking", "housing", "lighting", "sibling", "pudding", "stuffing", "landing", "railing", "dumpling",
  "earring", "offspring", "shipping", "packaging", "awning", "bedding", "frosting", "icing", "filling", "seating", "flooring",
  "roofing", "siding", "wiring", "plumbing", "boxing", "camping", "hiking", "cycling", "skiing", "surfing", "jogging", "dancing",
  "cooking", "farming", "mining", "recycling", "gardening", "shopping", "banking", "trading", "coding", "programming",
  "printing", "welding", "manufacturing", "engineering", "training", "teaching", "nursing", "streaming", "gaming", "sailing",
  "climbing", "fishing", "knitting", "baking", "yoga", "ceiling", "sewing", "logging", "scaffolding", "carving", "drawing",
  "sibling", "icing", "dining", "lightning", "stocking", "pudding", "sporting", "bowling", "skating", "wrestling", "racing",
]);

function whitelistSet(list) {
  return new Set((Array.isArray(list) ? list : RETRIEVAL_DEFAULTS.queryWhitelist).map((w) => String(w).toUpperCase()));
}

function canonicalAcronym(upper) {
  if (upper === "SAAS") return "SaaS";
  if (upper === "IOT") return "IoT";
  return upper;
}

const isGerund = (w) => w.length > 5 && /ing$/.test(w) && !ING_NOUNS.has(w);

// Remove words matching `pred` from the front of the phrase while more than `keepAtLeast` terms remain.
function dropWhere(terms, pred, keepAtLeast) {
  const out = [...terms];
  for (let i = 0; i < out.length && out.length > keepAtLeast;) {
    if (!out[i].acronym && pred(out[i].k)) out.splice(i, 1);
    else i++;
  }
  return out;
}

function cleanQuery(text, { whitelist, maxTerms = MAX_TERMS, maxChars = RETRIEVAL_DEFAULTS.maxQueryChars } = {}) {
  const wl = whitelist instanceof Set ? whitelist : whitelistSet(whitelist);
  const cap = Math.max(1, Math.floor(maxTerms) || MAX_TERMS);
  const tokens = String(text == null ? "" : text).normalize("NFKC").match(TOKEN_RE) || [];
  let terms = [];
  const seen = new Set();
  for (const tok of tokens) {
    const upper = tok.toUpperCase();
    let term = null;
    let acronym = false;
    if (wl.has(upper)) { term = canonicalAcronym(upper); acronym = true; } else {
      const s = subjectQuery(tok);
      if (s && !MANNER.has(s)) term = s;
    }
    if (!term) continue;
    const k = term.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    terms.push({ term, k, acronym });
  }
  terms = dropWhere(terms, (k) => PREPOSITIONS.has(k), 1);
  terms = dropWhere(terms, (k) => ADJECTIVES.has(k), 2);
  terms = dropWhere(terms, isGerund, 2);
  if (terms.length > cap) terms = cap === 1 ? [terms[terms.length - 1]] : [...terms.slice(0, cap - 1), terms[terms.length - 1]];
  let q = terms.map((t) => t.term).join(" ");
  if (q.length > maxChars) {
    q = q.slice(0, maxChars);
    const sp = q.lastIndexOf(" ");
    if (sp > 0) q = q.slice(0, sp);
  }
  return q.trim();
}

function headQuery(cleaned) {
  const terms = String(cleaned || "").split(" ").filter(Boolean);
  return terms.length >= 3 ? terms.slice(-2).join(" ") : "";
}

function prepareQueries(queries, { whitelist, max = RETRIEVAL_DEFAULTS.maxQueriesPerSlot, maxChars } = {}) {
  const wl = whitelistSet(whitelist);
  const out = [];
  const seen = new Set();
  for (const q of Array.isArray(queries) ? queries : []) {
    const source = typeof q === "string" ? q : (q && typeof q.text === "string" ? q.text : "");
    const kind = q && typeof q === "object" && typeof q.kind === "string" ? q.kind : "visual_noun";
    const text = cleanQuery(source, { whitelist: wl, maxChars });
    if (!text) continue;
    const k = text.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ text, kind, source: source.slice(0, 120) });
    if (out.length >= max) break;
  }
  return out;
}

module.exports = { cleanQuery, headQuery, prepareQueries, whitelistSet, PREPOSITIONS, ADJECTIVES, MANNER, ING_NOUNS };
