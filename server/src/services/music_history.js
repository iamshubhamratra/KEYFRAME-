// MUSIC HISTORY — what this studio has already shipped, so the next film does not ship it
// again.
//
// THE GAP THIS FILLS. Before this, nothing in the pipeline remembered a single track it had
// ever used — no table, no cache, no field on the job. Selection was therefore memoryless:
// two jobs whose queries overlapped drew from the same ranked pool and, with the same
// scores, made the same choice. Widening the query ladder and the search window (P1) made
// that rare rather than routine; only a ledger makes it deliberate.
//
// TWO JOBS DEEP:
//
//   1. RECENCY PENALTY, NOT A BAN. A recently-used track is pushed down the ranking, never
//      removed. A thin catalogue must still yield a bed — "prefer something fresh whenever
//      one exists" is the actual requirement, and an exclusion list turns a thin genre into
//      a hard failure.
//   2. RE-RENDER REPRODUCTION. The ledger records the JOB that used each track, so a
//      re-render of job X finds X's own entry and pins it. That is what lets variety come
//      from history without breaking the rule that re-rendering a job reproduces its film.
//      A job's own entry is therefore never a penalty against itself — it is a pin.
//
// Storage is a small JSON file (same shape as services/pixabay/cache.js), not a db table:
// db.js is a JSON job store with no schema, and this is machine-local operational state,
// not job data.

const fs = require("node:fs");
const path = require("node:path");
const config = require("../config");

// Alongside the vocabulary audit's cache, in the server's own .cache dir (gitignored).
const FILE = path.join(config.paths.root || path.resolve(__dirname, "..", ".."), ".cache", "music-history.json");
const CAP = 200;

// Penalty by how many entries back the track was last seen. Same-pack repetition is the
// most audible (two films on one template are the ones a viewer compares), so it is scored
// hardest; cross-pack repetition still matters because the library is one product.
const SAME_PACK_RECENT = 5,  SAME_PACK_PENALTY = 40;
const ANY_PACK_RECENT  = 5,  ANY_PACK_PENALTY  = 25;
const ANY_PACK_WARM    = 20, ANY_PACK_WARM_PENALTY = 10;

let cache = null;

function read() {
  if (cache) return cache;
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, "utf8"));
    cache = Array.isArray(raw) ? raw : [];
  } catch { cache = []; }
  return cache;
}

function write() {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(cache.slice(0, CAP), null, 0));
  } catch (e) {
    // Never fail a render over the ledger — losing variety is survivable, losing the film
    // is not.
    console.warn(`[music_history] could not persist: ${e.message}`);
  }
}

/** Stable identity for a track across providers. */
function trackKey(provider, id) {
  return `${provider || "?"}:${String(id || "").trim()}`;
}

/**
 * penaltiesFor({ pack, jobId }) → { penalty(key) → number, pinned: string|null, size }
 *
 * Read ONCE per job and reused for the whole selection, so every candidate is judged
 * against the same snapshot of history.
 */
function penaltiesFor({ pack = "", jobId = "" } = {}) {
  const list = read();
  const byKey = new Map();
  let pinned = null;

  list.forEach((row, i) => {
    if (!row || !row.key) return;
    // The job's own prior choice is a PIN, never a penalty — see the header.
    if (jobId && row.jobId === jobId) { if (!pinned) pinned = row; return; }
    const samePack = pack && row.pack === pack;
    let p = 0;
    if (samePack && i < SAME_PACK_RECENT) p = SAME_PACK_PENALTY;
    else if (i < ANY_PACK_RECENT) p = ANY_PACK_PENALTY;
    else if (i < ANY_PACK_WARM) p = ANY_PACK_WARM_PENALTY;
    if (p > (byKey.get(row.key) || 0)) byKey.set(row.key, p);
  });

  return {
    penalty: (key) => byKey.get(key) || 0,
    /** Keys carrying ANY penalty — used by providers that cannot rank (Pixabay). */
    recent: new Set(byKey.keys()),
    pinned,
    size: list.length,
  };
}

/** Record a shipped track. Idempotent per job: a re-render replaces its own row. */
function record({ key, provider, pack = "", jobId = "", query = "" }) {
  if (!key) return;
  const list = read();
  const at = list.findIndex((r) => r && jobId && r.jobId === jobId);
  const row = { key, provider: provider || null, pack, jobId, query, usedAt: Date.now() };
  if (at >= 0) list.splice(at, 1);
  list.unshift(row);
  cache = list.slice(0, CAP);
  write();
}

/** Test seam / operator view. */
function all() { return read().slice(); }
function reset() { cache = []; try { fs.unlinkSync(FILE); } catch {} }

module.exports = {
  trackKey, penaltiesFor, record, all, reset, FILE,
  __test: { SAME_PACK_PENALTY, ANY_PACK_PENALTY, ANY_PACK_WARM_PENALTY, CAP },
};
