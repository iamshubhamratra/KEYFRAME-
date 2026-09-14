// The local asset database — checked FIRST before any external provider.
// Every asset successfully downloaded from an external source is registered
// here, so over time the studio serves more and more assets from disk with
// zero network calls (and zero rate-limit/Cloudflare exposure).
//
// Layout: <root>/asset_cache/index.json + asset_cache/files/<id>.<ext>
// Index entry: { id, query, words[], type, orientation, source, license,
//                sourceUrl, width, height, file, bytes, addedAt, hits }

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const config = require("../../config");

const CACHE_DIR = path.resolve(config.paths.root, "asset_cache");
const FILES_DIR = path.join(CACHE_DIR, "files");
const INDEX_FILE = path.join(CACHE_DIR, "index.json");

let index = null;

function load() {
  if (index) return index;
  try {
    index = JSON.parse(fs.readFileSync(INDEX_FILE, "utf8"));
    if (!Array.isArray(index)) index = [];
  } catch {
    index = [];
  }
  return index;
}

let writeTimer = null;
function persist() {
  if (writeTimer) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    try {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
      const tmp = INDEX_FILE + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(index), "utf8");
      fs.renameSync(tmp, INDEX_FILE);
    } catch (e) {
      console.warn(`[asset_db] persist failed: ${e.message}`);
    }
  }, 200);
  writeTimer.unref?.();
}

function tokenize(q) {
  return [...new Set(String(q).toLowerCase().match(/[a-z0-9]{3,}/g) || [])];
}

// Score = word overlap between the search query and the stored query/words.
// Requires ≥60% of the search words to match so "red sports car" doesn't
// return a cached "red apple".
// `sourceRe` (optional RegExp) restricts hits to entries whose original
// provider `source` matches — used by PIXABAY_ONLY to keep the cache Pixabay-only.
function search({ query, type, orientation, limit = 3, sourceRe = null, excludeSourceRe = null, subject = null }) {
  const idx = load();
  const want = tokenize(query);
  if (!want.length) return [];
  // THE CACHE IS KEYED BY QUERY TEXT, NOT BY WHAT THE IMAGE SHOWS. 60% token
  // overlap alone let an off-topic download be served back forever: a film about
  // a standup-replacement app was handed a cached photo whose stored query was
  // "still hard push-in" (CLIP relevance 0.09) because the direction words
  // overlapped. When the caller knows the SUBJECT, at least one of its words must
  // appear in the entry — a cache hit has to be about the topic, not merely
  // spelled like the query.
  const subjWords = subject ? tokenize(subject) : [];
  // …AND THE QUERY SIDE OF THE RATIO NEEDS THE SAME CAP THE ENTRY SIDE ALREADY HAS
  // (see entryWeight below). 60% of a 3-word query is 2 words; 60% of the 9-13 word
  // strings this pipeline actually searches with — "urban rooftop garden and growers
  // seedling sprouts tray soil closeup macro" — is 6-8, and a second film on the same
  // topic never repeats 8 words unless it repeats the whole scene. Measured on the
  // live 685-entry cache: 480 entries had never been reused once, 516MB of
  // already-paid-for downloads idle. Capping the denominator at 4 leaves every short
  // query EXACTLY as strict as it was (the "red sports car" vs "red apple" case above
  // is 3 tokens, so nothing changes there) and asks a long one for 3 real word
  // matches instead of an unreachable 8. The entry-weight gate is what keeps that
  // honest — do not relax it to compensate.
  const wantWeight = Math.min(want.length, 4);

  const scored = [];
  for (const e of idx) {
    if (type && e.type !== type) continue;
    if (orientation && e.orientation && e.orientation !== orientation && e.orientation !== "all") continue;
    if (sourceRe && !sourceRe.test(e.source || "")) continue;
    if (excludeSourceRe && excludeSourceRe.test(e.source || "")) continue;
    if (!fs.existsSync(e.file)) continue;
    const overlap = want.filter((w) => e.words.includes(w)).length;
    // Entries written since register() stopped storing the padded string keep the
    // film's topic in `subjWords` rather than glued into `words`, so ask both: the
    // topic an asset was FETCHED for is the honest place to test topicality, and the
    // 685 legacy entries (all padded) still answer through `words`.
    if (subjWords.length && !subjWords.some((w) => e.words.includes(w) || (e.subjWords || []).includes(w))) continue;
    if (overlap / wantWeight < 0.6) continue;
    // …AND THE MATCH HAS TO MEAN SOMETHING TO THE ENTRY TOO. The ratio above is
    // computed over the SEARCH query's words only, so it says nothing about how
    // much of the stored entry is unrelated — and this pipeline stores LONG
    // composed queries (subject + need + pack style). Measured live: the query
    // "mobile shopping app" was served a photo cached under "airport departures
    // board and mobile travel app airport terminal gate boarding sign yellow
    // night airport terminal signage cinematic" — two generic words, "mobile"
    // and "app", out of twenty, cleared 2/3 = 0.67 and an AIRPORT TERMINAL shot
    // shipped for a shopping beat. The subject guard above does not catch it
    // either: it only asks that ONE subject word appear somewhere in those
    // twenty. So require the overlap to cover a real share of the entry as well,
    // measured against its first few words so a long stored query cannot dilute
    // its way to a match.
    const entryWeight = Math.min(e.words.length, 8);
    if (!entryWeight || overlap / entryWeight < 0.4) continue;
    scored.push({ score: overlap / want.length, entry: e });
  }
  scored.sort((a, b) => b.score - a.score || b.entry.hits - a.entry.hits);
  return scored.slice(0, limit).map((s) => s.entry);
}

// Copy a cached asset to the requested output path. Returns metadata.
function materialize(entry, outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.copyFileSync(entry.file, outputPath);
  entry.hits = (entry.hits || 0) + 1;
  persist();
  console.log(`[asset_db] cache HIT "${entry.query}" (${entry.type}, ${entry.source}) -> ${path.basename(outputPath)}`);
  return { license: entry.license, sourceUrl: entry.sourceUrl, source: `cache:${entry.source}`, width: entry.width, height: entry.height };
}

// Register a freshly downloaded asset: copy into the cache and index it.
//
// `rankQuery` is the SCENE'S OWN need; `query` is the string we searched with, which
// for every anchored caller is the film's topic prefixed onto that need. Indexing the
// padded string buried the entry: 396 of 685 entries carry 8+ words, so entryWeight
// pinned at its cap of 8 and the search had to land 4 of them before the entry was
// even considered. Stored under the 4-6 word need it was actually fetched for, the
// same entry needs 2 — and the topic it belongs to survives in `subjWords`, where the
// topicality guard reads it without padding the match denominator.
function register({ filePath, query, rankQuery, subject, type, orientation, source, license, sourceUrl, width, height }) {
  try {
    const idx = load();
    fs.mkdirSync(FILES_DIR, { recursive: true });
    const id = crypto.createHash("sha1").update(fs.readFileSync(filePath)).digest("hex").slice(0, 16);
    if (idx.some((e) => e.id === id)) return; // identical bytes already cached
    const ext = path.extname(filePath) || (type === "video" ? ".mp4" : ".jpg");
    const dest = path.join(FILES_DIR, `${id}${ext}`);
    fs.copyFileSync(filePath, dest);
    const indexed = String(rankQuery || "").trim() || query;
    idx.push({
      id, query: indexed, words: tokenize(indexed), type, orientation: orientation || "all",
      subjWords: subject ? tokenize(subject) : undefined,
      source, license: license || "unknown", sourceUrl: sourceUrl || null,
      width: width || null, height: height || null,
      file: dest, bytes: fs.statSync(dest).size, addedAt: Date.now(), hits: 0,
    });
    persist();
    console.log(`[asset_db] cached "${indexed}" (${type}, ${source}, ${id})`);
  } catch (e) {
    console.warn(`[asset_db] register failed: ${e.message}`);
  }
}

function stats() {
  const idx = load();
  return { count: idx.length, bytes: idx.reduce((s, e) => s + (e.bytes || 0), 0) };
}

// Keep the cache under maxBytes: evict least-used (fewest hits), oldest first.
function prune(maxBytes) {
  const idx = load();
  let total = idx.reduce((s, e) => s + (e.bytes || 0), 0);
  if (total <= maxBytes) return 0;
  const victims = [...idx].sort((a, b) => (a.hits || 0) - (b.hits || 0) || a.addedAt - b.addedAt);
  let removed = 0;
  for (const v of victims) {
    if (total <= maxBytes) break;
    try { fs.unlinkSync(v.file); } catch { /* already gone */ }
    const i = idx.indexOf(v);
    if (i >= 0) idx.splice(i, 1);
    total -= v.bytes || 0;
    removed++;
  }
  if (removed) {
    persist();
    console.log(`[asset_db] pruned ${removed} asset(s); cache now ${(total / 1048576).toFixed(0)} MB`);
  }
  return removed;
}

module.exports = { search, materialize, register, stats, prune, CACHE_DIR };
