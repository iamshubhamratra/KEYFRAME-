// MUSIC VOCABULARY — turning a template's audio identity into queries a provider can answer.
//
// THE DEFECT THIS REPLACES. musicCandidatesFor used to lead with the pack's keywords joined
// into one phrase:
//
//     [...keywords, mood].join(" ")   ->   "driving electronic dark techno pulse clinical"
//
// Providers AND-match every term, so that phrase only returns something if a single upload
// carries all six words. Measured 2026-08-05 against the live catalogue: 19 of the 20 packs
// sampled returned ZERO tracks for their own lead query, and `"dark techno pulse neural
// tech"` matched 0 uploads while `"techno"` alone matched 473. The template therefore
// contributed NOTHING to the search; the pipeline fell through to a two-word generic
// fallback shared across many packs, and that is why music-only films sounded alike.
//
// The rule here is: ASK IN TERMS, WIDEST FIRST, AND POOL. A term that resolves to a real
// catalogue is worth more than a phrase that resolves to nothing, and the pack's identity
// is preserved by WHICH terms are asked and by the ranking that follows — not by cramming
// the identity into one unanswerable string.
//
// Pure + deterministic. Rotation is seeded (never Math.random) so a re-render reproduces.
//
// scripts/audit-music-vocabulary.js gates the invariant this module depends on: every term
// it can emit must resolve to a real catalogue. Keep the two in step — that script imports
// termsForProfile from here precisely so the audit checks what the search actually asks.

// Structural words, plus modifiers that name a FEELING rather than anything a catalogue is
// tagged with. Dropping them is what turns "high energy hype" into "hype" (a real tag)
// instead of a three-word phrase that matches nothing. Genre words are never in this list.
const STOPWORDS = new Set([
  "a", "an", "and", "the", "of", "with", "for", "in", "on", "to", "no",
  "very", "more", "most", "less", "quite", "sort", "kind", "type", "style", "sound", "music",
  "feel", "feeling", "vibe", "mood", "tone",
  // NOT GENRE TAGS, measured. scripts/audit-music-vocabulary.js counts every term this module can
  // emit against the live catalogue: for reel, `electronic` matches 2375 tracks and `beat` 1675, but
  // `hook` matches NINE and `social` nineteen. They describe a song's STRUCTURE and a distribution
  // CHANNEL, not a sound, so no library tags with them — and worse, they get paired: job 1ntmvaft5g
  // searched "hop hook", which is unanswerable, so the template's turn was wasted and the film fell
  // through to the script's own subject query. This module's own header already warned that "hip hop
  // hook is a query with no results behind it"; these words are why it happened anyway.
  "hook", "social", "viral", "trending", "background", "backing", "track", "song", "loop",
]);

const words = (s) => String(s || "").toLowerCase().match(/[a-z][a-z'-]*/g) || [];

/** Split a possibly-multiword vocabulary entry into usable single terms. */
function split(entry) {
  return words(entry).filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

/**
 * Style entries → genre terms, COMPOUNDS KEPT WHOLE.
 *
 * Genre names are frequently two words that mean nothing apart: "hip hop" split into "hip"
 * and "hop" produces "hop driving", which is not a thing anyone tagged an upload with.
 * A multiword style entry is therefore emitted as the phrase FIRST (it is a genre name and
 * catalogues are tagged with it), with its component words kept after as a widening step
 * for the cases where the compound is descriptive rather than canonical ("ambient tech").
 */
function styleTerms(style) {
  const out = [];
  for (const entry of style || []) {
    const w = split(entry);
    if (w.length > 1) out.push(w.join(" "));
    for (const t of w) out.push(t);
  }
  return out;
}

/**
 * termsForProfile(profile) → every distinct single term this pack can search with.
 *
 * This is the exact set the audit checks, so the audit and the search can never drift.
 * Genre terms (from `style[]`) come first because they are what a catalogue is actually
 * tagged with; colour terms (from `musicKeywords`) follow.
 */
function termsForProfile(profile) {
  const p = profile || {};
  const out = [];
  const seen = new Set();
  const push = (t) => { if (t && !seen.has(t)) { seen.add(t); out.push(t); } };
  for (const t of styleTerms(p.style)) push(t);
  for (const k of p.musicKeywords || []) for (const t of split(k)) push(t);
  return out;
}

/**
 * Genre terms vs colour terms.
 *
 *   genre  — from `style[]`. What the catalogue is TAGGED with ("techno", "ambient",
 *            "folk"). These are the terms that reliably return a deep pool.
 *   colour — from `musicKeywords`, minus anything already a genre. Adjectives and
 *            imagery ("driving", "nocturnal", "storybook"). Some are real tags, some are
 *            thin; they narrow a genre rather than standing alone.
 *
 * musicKeywords are authored CALMEST FIRST (see scripts/apply-audio-profiles.js), so the
 * tail of `colour` is the pack's driving end — which is what narration-off reaches for.
 */
function partition(profile) {
  const p = profile || {};
  const genre = [], colour = [];
  const gSeen = new Set();
  for (const t of styleTerms(p.style)) if (!gSeen.has(t)) { gSeen.add(t); genre.push(t); }
  // Every word that appears anywhere in a genre term is already represented; a colour term
  // that repeats one ("electronic" in both style and keywords) would only pair a word with
  // itself.
  const gWords = new Set(genre.flatMap((t) => t.split(" ")));
  const cSeen = new Set();
  for (const k of p.musicKeywords || []) {
    for (const t of split(k)) if (!gWords.has(t) && !cSeen.has(t)) { cSeen.add(t); colour.push(t); }
  }
  return { genre, colour };
}

// ---------------------------------------------------------------- seeded rotation
function hash32(s) {
  let h = 2166136261;
  const str = String(s || "");
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffled(list, seedKey) {
  const rnd = mulberry32(hash32(seedKey));
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * queryLadder({ profile, seedKey, narration, scriptQuery, max })
 *   → ordered queries, widest-useful-first.
 *
 * Shape of the ladder, and why:
 *
 *   1. GENRE + COLOUR pairs   "techno driving"    — specific enough to carry the pack's
 *                                                   identity, short enough to resolve
 *   2. GENRE singles          "techno"            — the deep pool; this is what guarantees
 *                                                   the search is never empty
 *   3. COLOUR singles         "driving"           — flavour, thinner catalogues
 *   4. the script's subject query                 — LAST among the steering queries, so a
 *                                                   subject word can never outrank the genre
 *
 * Every entry is a query the pool draws from; fetchMusic ranks ACROSS the whole pool, so
 * a later entry contributing a better track still wins. The ladder decides what the pool
 * is made of, not what is chosen from it.
 *
 * With narration off the colour terms are drawn from the DRIVING end of the pack's
 * vocabulary (keywords are authored calmest-first) — the "nudge within character" rule:
 * a storybook pack asks for its most driving acoustic bed, it does not become future bass.
 */
function queryLadder({ profile, seedKey = "kf", narration = "on", scriptQuery = "", max = 8 } = {}) {
  const { genre, colour } = partition(profile);
  if (!genre.length && !colour.length) return scriptQuery ? [scriptQuery] : [];

  const hot = narration === "off" && (profile?.noVo?.energyBoost ?? 1) > 0 && colour.length > 2;
  // The driving half when there is no voice; the whole list otherwise. Shuffled so two jobs
  // on one template ask differently, seeded so one job always asks the same way.
  const colourPool = hot ? colour.slice(Math.floor(colour.length / 2)) : colour;
  const g = shuffled(genre, `${seedKey}|g`);
  const c = shuffled(colourPool, `${seedKey}|c`);
  const cAll = shuffled(colour, `${seedKey}|c2`);

  // Template queries are collected first, then assembled around a RESERVED slot for the
  // film's own subject. Without the reservation a pack with a rich vocabulary fills the cap
  // and the subject query is sliced off entirely — the film stops contributing to its own
  // soundtrack, which is the opposite failure to the one this module fixes.
  const tmpl = [];
  const push = (q) => { const t = String(q || "").trim(); if (t && !tmpl.includes(t)) tmpl.push(t); };

  // 1. pairs — the pack's identity, in a form a provider can answer.
  //
  // TWO TERMS IS THE CEILING, and it is the whole point of this module: a third term is
  // another AND clause, and three-clause queries are what returned nothing. A compound
  // genre ("hip hop", "ambient tech") already spends both slots, so it is asked alone
  // rather than paired — "hip hop hook" is a query with no results behind it.
  const singleGenre = g.filter((t) => !t.includes(" "));
  const compoundGenre = g.filter((t) => t.includes(" "));
  const tier1 = [...compoundGenre];
  for (let i = 0; i < Math.min(3, singleGenre.length); i++) {
    if (c[i]) tier1.push(`${singleGenre[i]} ${c[i]}`);
  }
  // Shuffled rather than ordered: pinning the compound to the front would make it the lead
  // query on every job for a pack that has one, which is the same one-track-forever failure
  // in a smaller form. Seeded, so one job still reproduces.
  for (const q of shuffled(tier1, `${seedKey}|t1`).slice(0, 3)) push(q);
  // 2. genre singles — the guaranteed floor
  for (const t of g.slice(0, 3)) push(t);
  // 3. colour singles — flavour
  for (const t of c.slice(0, 2)) push(t);
  // 4. remaining vocabulary, if the ladder is still short
  for (const t of cAll) { if (tmpl.length >= max) break; push(t); }

  // ASSEMBLE. The subject query sits after the pack's strongest queries and before its
  // tail: late enough that a subject word can never outrank the template's genre, early
  // enough that the film's own topic still reaches the provider.
  const AHEAD = 4;
  if (!scriptQuery) return tmpl.slice(0, max);
  const head = tmpl.slice(0, AHEAD);
  const tail = tmpl.slice(AHEAD);
  return [...head, scriptQuery, ...tail].slice(0, max);
}

module.exports = { termsForProfile, partition, queryLadder, split, STOPWORDS };
module.exports.__test = { hash32, mulberry32, shuffled };
