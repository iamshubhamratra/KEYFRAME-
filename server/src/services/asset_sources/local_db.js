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
function search({ query, type, orientation, limit = 3 }) {
  const idx = load();
  const want = tokenize(query);
  if (!want.length) return [];

  const scored = [];
  for (const e of idx) {
    if (type && e.type !== type) continue;
    if (orientation && e.orientation && e.orientation !== orientation && e.orientation !== "all") continue;
    if (!fs.existsSync(e.file)) continue;
    const overlap = want.filter((w) => e.words.includes(w)).length;
    if (overlap / want.length >= 0.6) scored.push({ score: overlap / want.length, entry: e });
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
  // A cache hit must describe the asset as fully as a fresh download does. It used to
  // return license/url/source/width/height only, so a cached image reached the wire
  // with no `ratio` (the Visual Layout Director's phone-vs-browser routing and crop
  // focus both key off it and silently defaulted), no dhash, and no dominantColor —
  // and it skips validateImage, so nothing recomputed them. The fields are cheap to
  // store; entries cached before this change simply return undefined, exactly as before.
  return {
    license: entry.license, sourceUrl: entry.sourceUrl, source: `cache:${entry.source}`,
    width: entry.width, height: entry.height,
    ratio: entry.ratio != null ? entry.ratio
      : (entry.width && entry.height ? Math.round((entry.width / entry.height) * 1000) / 1000 : undefined),
    hasAlpha: entry.hasAlpha, dhash: entry.dhash, dominantColor: entry.dominantColor,
  };
}

// Register a freshly downloaded asset: copy into the cache and index it.
function register({ filePath, query, type, orientation, source, license, sourceUrl, width, height, ratio, hasAlpha, dhash, dominantColor }) {
  try {
    const idx = load();
    fs.mkdirSync(FILES_DIR, { recursive: true });
    const id = crypto.createHash("sha1").update(fs.readFileSync(filePath)).digest("hex").slice(0, 16);
    if (idx.some((e) => e.id === id)) return; // identical bytes already cached
    const ext = path.extname(filePath) || (type === "video" ? ".mp4" : ".jpg");
    const dest = path.join(FILES_DIR, `${id}${ext}`);
    fs.copyFileSync(filePath, dest);
    idx.push({
      id, query, words: tokenize(query), type, orientation: orientation || "all",
      source, license: license || "unknown", sourceUrl: sourceUrl || null,
      width: width || null, height: height || null,
      // Measured once at download time so a later cache hit doesn't have to re-probe
      // (and, today, simply went without). All optional — a caller that has no meta
      // stores nulls and the cache behaves exactly as it did.
      ratio: ratio != null ? ratio : null,
      hasAlpha: hasAlpha != null ? hasAlpha : null,
      dhash: dhash || null,
      dominantColor: dominantColor || null,
      file: dest, bytes: fs.statSync(dest).size, addedAt: Date.now(), hits: 0,
    });
    persist();
    console.log(`[asset_db] cached "${query}" (${type}, ${source}, ${id})`);
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
