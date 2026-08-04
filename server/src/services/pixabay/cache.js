// TTL cache for Pixabay SEARCH RESULTS.
//
// Distinct from asset_sources/local_db.js, and both are wanted:
//   local_db  — permanent store of DOWNLOADED FILES, keyword-matched, survives restarts.
//               Answers "do we already own a picture for this idea?"
//   this      — short-lived store of SEARCH RESPONSES. Answers "did we just ask Pixabay
//               this exact question?" and spares the API across the burst of near-identical
//               queries a single film issues.
//
// In-process and bounded. The interface is deliberately the async subset Redis exposes
// (get/set/del/clear returning promises) so swapping the backing store later is a
// constructor change, not a call-site change.

const { cacheTtlMs, cacheMaxEntries } = require("./config");

/** @type {Map<string, {value: any, expires: number}>} */
const store = new Map();
const stats = { hits: 0, misses: 0, evictions: 0, expired: 0 };

/** Stable key: param ORDER must not create two entries for one question. */
function keyFor(namespace, params) {
  const flat = Object.entries(params || {})
    .filter(([, v]) => v != null && v !== "")
    .map(([k, v]) => `${k}=${String(v).toLowerCase()}`)
    .sort()
    .join("&");
  return `${namespace}|${flat}`;
}

async function get(key) {
  const hit = store.get(key);
  if (!hit) { stats.misses++; return null; }
  if (Date.now() > hit.expires) {
    store.delete(key);
    stats.expired++; stats.misses++;
    return null;
  }
  // Refresh LRU position — a query asked repeatedly through a job should not be the one
  // evicted by an unrelated burst.
  store.delete(key); store.set(key, hit);
  stats.hits++;
  return hit.value;
}

async function set(key, value, ttlMs) {
  if (store.size >= cacheMaxEntries()) {
    // Map preserves insertion order, so the first key is the least recently used.
    const oldest = store.keys().next().value;
    if (oldest !== undefined) { store.delete(oldest); stats.evictions++; }
  }
  store.set(key, { value, expires: Date.now() + (Number(ttlMs) || cacheTtlMs()) });
  return value;
}

const del = async (key) => store.delete(key);
const clear = async () => { store.clear(); };

function getStats() {
  const total = stats.hits + stats.misses;
  return { ...stats, size: store.size, hitRate: total ? Math.round((stats.hits / total) * 100) : 0 };
}

module.exports = { keyFor, get, set, del, clear, getStats, __test: { store, stats } };
