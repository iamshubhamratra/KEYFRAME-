#!/usr/bin/env node
// AUDIT MUSIC VOCABULARY — does every word a template searches with actually exist in the
// music catalogue?
//
// THE DEFECT THIS EXISTS TO CATCH. Template audio profiles were authored as evocative
// PHRASES ("dark techno pulse", "understated tension", "reflective strings"). The provider
// AND-matches every term in a query, so a phrase only returns something when one upload
// carries all of its words. Measured on 2026-08-05: 19 of the 20 packs sampled returned
// ZERO tracks for their own lead query. The template contributed nothing to the search, the
// pipeline widened to a two-word generic fallback shared by many packs, and that is why
// music-only films sounded alike.
//
// The fix (audio_profile.musicCandidatesFor) asks in TERMS, widest-first, and pools. That
// only works if the terms themselves resolve. This script is the gate on that invariant:
// every single term in every pack must return at least MIN_HITS tracks, or CI fails.
//
//   node scripts/audit-music-vocabulary.js            # audit, non-zero exit on any dead term
//   node scripts/audit-music-vocabulary.js --report   # print full per-pack table
//   node scripts/audit-music-vocabulary.js --refresh  # ignore the cache, re-query everything
//
// Results are cached in .cache/music-vocab.json so re-runs (and CI) cost no API calls.
// The provider rate-limits aggressively, so live queries are throttled and the cache is
// written incrementally — an interrupted run keeps everything it already learned.

const fs = require("node:fs");
const path = require("node:path");

const config = require("../src/config");
const profileSvc = require("../src/services/audio_profile");
const registry = require("../src/services/frame_registry");
const { termsForProfile, STOPWORDS } = require("../src/services/music_vocabulary");

const CACHE = path.resolve(__dirname, "..", ".cache", "music-vocab.json");
const MIN_HITS = 3;             // fewer than this and there is no room to vary the pick
const THIN_HITS = 12;           // enough to exist, not enough to rotate through
const THROTTLE_MS = 1200;       // provider allows ~60/min on token auth
const REPORT = process.argv.includes("--report");
const REFRESH = process.argv.includes("--refresh");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadCache() {
  if (REFRESH) return {};
  try { return JSON.parse(fs.readFileSync(CACHE, "utf8")); } catch { return {}; }
}
function saveCache(c) {
  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  fs.writeFileSync(CACHE, JSON.stringify(c, null, 2));
}

// How many MUSIC tracks match this single term. `count` is the provider's own total, so one
// request answers "is there a catalogue behind this word" without paging anything.
async function countTracks(term, token) {
  const url = new URL("https://freesound.org/apiv2/search/text/");
  url.searchParams.set("query", term);
  url.searchParams.set("fields", "id");
  url.searchParams.set("page_size", "1");
  url.searchParams.set("filter", "duration:[20 TO 180] tag:music");
  try {
    const r = await fetch(url.toString(), {
      headers: { Authorization: `Token ${token}` },
      signal: AbortSignal.timeout(20_000),
    });
    if (r.status === 429) return { count: null, err: "rate-limited" };
    if (!r.ok) return { count: null, err: `HTTP ${r.status}` };
    const j = await r.json();
    return { count: Number(j.count) || 0, err: null };
  } catch (e) {
    return { count: null, err: e.message };
  }
}

(async () => {
  const token = config.audio && config.audio.freesoundToken;
  if (!token) {
    console.log("[music-vocab] no Freesound token configured — SKIPPED (not a failure)");
    process.exit(0);
  }

  const packs = registry.listPacks();
  const cache = loadCache();

  // Collect every distinct term across every pack, so a word shared by ten packs is
  // queried once.
  const byPack = new Map();
  const allTerms = new Set();
  for (const name of packs) {
    const p = profileSvc.profileFor(name);
    if (p.source !== "manifest") continue;
    const terms = termsForProfile(p);
    byPack.set(name, terms);
    for (const t of terms) allTerms.add(t);
  }

  const todo = [...allTerms].filter((t) => !(t in cache));
  if (todo.length) {
    console.log(`[music-vocab] ${allTerms.size} distinct term(s) across ${byPack.size} pack(s); ${todo.length} not cached`);
    let i = 0, ratelimited = false;
    for (const term of todo) {
      const { count, err } = await countTracks(term, token);
      if (err === "rate-limited") { ratelimited = true; console.log(`[music-vocab] rate-limited after ${i} query(s) — keeping what we have`); break; }
      if (count != null) cache[term] = count;
      i++;
      if (i % 10 === 0) { saveCache(cache); process.stdout.write(`  …${i}/${todo.length}\r`); }
      await sleep(THROTTLE_MS);
    }
    saveCache(cache);
    if (ratelimited) console.log(`[music-vocab] re-run to finish the remaining ${todo.length - i} term(s); cached results are reused`);
  } else {
    console.log(`[music-vocab] all ${allTerms.size} term(s) cached`);
  }

  // ---- verdict -------------------------------------------------------------
  const dead = [], thin = [], unknown = [];
  for (const [pack, terms] of byPack) {
    const rows = terms.map((t) => ({ t, n: t in cache ? cache[t] : null }));
    for (const r of rows) {
      if (r.n === null) unknown.push({ pack, ...r });
      else if (r.n < MIN_HITS) dead.push({ pack, ...r });
      else if (r.n < THIN_HITS) thin.push({ pack, ...r });
    }
    if (REPORT) {
      const known = rows.filter((r) => r.n !== null);
      const best = known.length ? Math.max(...known.map((r) => r.n)) : 0;
      console.log(`\n${pack}  (best term ${best})`);
      console.log("  " + rows.map((r) => `${r.t}:${r.n === null ? "?" : r.n}`).join("  "));
    }
    // A pack whose every term is dead cannot produce a template-steered search at all.
    const known = rows.filter((r) => r.n !== null);
    if (known.length && known.every((r) => r.n < MIN_HITS)) {
      dead.push({ pack, t: "(EVERY TERM DEAD)", n: 0 });
    }
  }

  const deadTerms = [...new Set(dead.map((d) => d.t))].sort();
  console.log(`\n================ MUSIC VOCABULARY ================`);
  console.log(`packs audited     : ${byPack.size}`);
  console.log(`distinct terms    : ${allTerms.size}`);
  console.log(`unresolved (no data): ${unknown.length}`);
  console.log(`THIN  (< ${THIN_HITS} tracks): ${thin.length}`);
  console.log(`DEAD  (< ${MIN_HITS} tracks): ${dead.length}`);

  if (thin.length && REPORT) {
    console.log(`\nthin terms:`);
    for (const t of [...new Set(thin.map((x) => x.t))].sort()) console.log(`  ${t} (${cache[t]})`);
  }
  if (dead.length) {
    console.log(`\nDEAD TERMS — these contribute nothing to a search:`);
    for (const t of deadTerms) {
      const packs = dead.filter((d) => d.t === t).map((d) => d.pack);
      console.log(`  ${t.padEnd(22)} ${String(cache[t] ?? 0).padStart(4)} track(s)   used by: ${packs.slice(0, 6).join(", ")}${packs.length > 6 ? ` +${packs.length - 6}` : ""}`);
    }
    // TWO TABLES AUTHOR THESE PROFILES, and naming only one sends the reader to a file that
    // does not contain the word they were told to replace. apply-audio-profiles.js holds the
    // original packs and READS the FilmKit family's own table; a dead term in a film-* pack is
    // fixed in _metadata.json, and applied from there by `npm run audio:profiles`.
    console.log(`\nFAIL — replace these where the pack is authored, then run \`npm run audio:profiles\` and re-run:`);
    console.log(`  · original packs      scripts/apply-audio-profiles.js (the PROFILES table)`);
    console.log(`  · FilmKit packs       src/services/film_skins/_metadata.json (audio.style / audio.musicKeywords)`);
    console.log(`  A term must resolve to >= ${MIN_HITS} tracks. style[] entries are emitted as the PHRASE *and* its`);
    console.log(`  component words, so a compound like "upright bass" must itself resolve — prefer a single tagged word.`);
    process.exit(1);
  }

  console.log(`\nPASS — every term in every pack resolves to at least ${MIN_HITS} tracks.`);
  if (unknown.length) console.log(`(${unknown.length} term(s) still unqueried — re-run to complete the audit.)`);
})();

module.exports = { MIN_HITS, THIN_HITS };
