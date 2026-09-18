// VIDEO EDIT B-ROLL SEARCH CACHE — 24 h shared cache of normalized stock search pages.
//
// WHY THIS EXISTS. The same visual nouns ("laptop", "city traffic") recur across projects, retries
// and intensity changes, and stock quotas are tiny (Pixabay's terms also ask API users to cache for
// 24 h). A cached page costs zero requests and zero quota. Entries hold MAPPED items (RawAsset) under
// a mapper version, never raw provider JSON and never the query text itself (only its hash is the
// key), in `<sharedDir>/asset-search/<sha1>.json`, written atomically. Empty results expire sooner
// (a provider hiccup that returned nothing should not blank a query for a day). The directory is
// kept under a byte and entry cap by an LRU sweep (recency = last hit in this process, else mtime).
//
// CONTRACT:
//   createSearchCache({ dir, ttlMs, emptyTtlMs, maxBytes, maxEntries, sweepEvery, now })
//     keyOf({ provider, kind, query, orientation, page, perPage, v, variant? }) -> sha1 hex
//       `variant` = hash of everything else that shapes the mapped items (licence allow-list, category,
//       video/image type, query locale): a narrowed licence policy must never be served from an old page.
//     get(parts) -> value | null       set(parts, value, { empty }) -> boolean
//     sweep() -> { removed, entries, bytes }   stats() -> { hits, misses, writes, sweeps }
//   cacheForSettings(settings, cfg) -> process-wide cache for settings.paths.sharedDir (null when absent)
//   resetCaches()   (tests)

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const fsx = require("../fsx");

const KEY_RE = /^[0-9a-f]{40}$/;
const TMP_MAX_AGE_MS = 60 * 60 * 1000;

function keyOf({ provider, kind, query, orientation, page = 1, perPage = null, v = 1, variant = null } = {}) {
  const canon = [
    `v${v}`, String(provider || "").toLowerCase(), String(kind || "").toLowerCase(),
    String(query || "").trim().toLowerCase().replace(/\s+/g, " "), String(orientation || "any").toLowerCase(),
    String(Number(page) || 1), String(Number(perPage) || 0),
    ...(variant ? [String(variant)] : []),
  ].join("");
  return crypto.createHash("sha1").update(canon).digest("hex");
}

function createSearchCache({
  dir, ttlMs = 24 * 60 * 60 * 1000, emptyTtlMs = 60 * 60 * 1000, maxBytes = 64 * 1024 * 1024,
  maxEntries = 5000, sweepEvery = 50, now = Date.now,
} = {}) {
  if (typeof dir !== "string" || !dir) throw new TypeError("search_cache: dir is required");
  const counters = { hits: 0, misses: 0, writes: 0, sweeps: 0 };
  const accessed = new Map(); // key -> last hit time (this process)
  let writesSinceSweep = 0;
  let swept = false;

  const fileFor = (key) => path.join(dir, `${key}.json`);

  function get(parts) {
    const key = keyOf(parts);
    const file = fileFor(key);
    const r = fsx.readJsonSafe(file);
    if (!r.ok || !r.value || typeof r.value !== "object" || r.value.key !== key || !("value" in r.value)) {
      counters.misses++;
      return null;
    }
    const expiresAt = Number(r.value.expiresAt) || 0;
    if (now() >= expiresAt) {
      counters.misses++;
      try { fs.unlinkSync(file); } catch { /* best effort */ }
      accessed.delete(key);
      return null;
    }
    counters.hits++;
    accessed.set(key, now());
    return r.value.value;
  }

  function set(parts, value, { empty = false } = {}) {
    const key = keyOf(parts);
    const at = now();
    try {
      fsx.ensureDir(dir);
      if (!swept) { swept = true; sweep(); }
      fsx.writeJsonAtomic(fileFor(key), {
        v: 1, key, provider: String(parts.provider || ""), kind: String(parts.kind || ""),
        orientation: parts.orientation || null, page: Number(parts.page) || 1, perPage: Number(parts.perPage) || null,
        createdAt: at, expiresAt: at + (empty ? Math.min(emptyTtlMs, ttlMs) : ttlMs), value,
      });
      accessed.set(key, at);
      counters.writes++;
      if (++writesSinceSweep >= Math.max(1, sweepEvery)) { writesSinceSweep = 0; sweep(); }
      return true;
    } catch {
      return false; // a cache write must never fail a search
    }
  }

  function sweep() {
    counters.sweeps++;
    let names;
    try { names = fs.readdirSync(dir); } catch { return { removed: 0, entries: 0, bytes: 0 }; }
    const t = now();
    const live = [];
    let removed = 0;
    for (const n of names) {
      const file = path.join(dir, n);
      let st;
      try { st = fs.statSync(file); } catch { continue; }
      if (!st.isFile()) continue;
      if (n.endsWith(".tmp")) {
        if (t - st.mtimeMs > TMP_MAX_AGE_MS) { try { fs.unlinkSync(file); removed++; } catch { /* noop */ } }
        continue;
      }
      const key = n.replace(/\.json$/, "");
      if (!n.endsWith(".json") || !KEY_RE.test(key)) continue;
      if (t - st.mtimeMs >= ttlMs) { try { fs.unlinkSync(file); removed++; accessed.delete(key); } catch { /* noop */ } continue; }
      live.push({ file, key, size: st.size, used: Math.max(st.mtimeMs, accessed.get(key) || 0) });
    }
    let bytes = live.reduce((a, e) => a + e.size, 0);
    live.sort((a, b) => a.used - b.used); // least recently used first
    while (live.length && (live.length > maxEntries || bytes > maxBytes)) {
      const e = live.shift();
      try { fs.unlinkSync(e.file); removed++; bytes -= e.size; accessed.delete(e.key); } catch { bytes -= e.size; }
    }
    return { removed, entries: live.length, bytes };
  }

  return { dir, keyOf, get, set, sweep, stats: () => ({ ...counters }) };
}

const caches = new Map();

function cacheForSettings(settings, cfg = {}) {
  const shared = settings && settings.paths && settings.paths.sharedDir;
  if (typeof shared !== "string" || !shared) return null;
  const dir = path.join(shared, "asset-search");
  let c = caches.get(dir);
  if (!c) {
    c = createSearchCache({ dir, ...(cfg || {}) });
    caches.set(dir, c);
  }
  return c;
}

function resetCaches() { caches.clear(); }

module.exports = { createSearchCache, cacheForSettings, keyOf, resetCaches };
