// PIXABAY SERVICE — the single gateway for every Pixabay interaction.
//
//   searchImages · searchVideos · searchMusic · searchSoundEffects · searchAssets
//
// Nothing outside this module should know a Pixabay endpoint, parameter name or payload
// shape. Consumers pass keywords and constraints and receive ranked, normalized Assets.
//
// PIPELINE, per query:
//   cache → client (rate-limited, de-duplicated, retried) → mapper → validator → ranking
//
// TWO TRANSPORTS, one façade. Stills and footage come from the official REST API; MUSIC and
// SFX do not exist there at all and come from the local headless-Chrome bridge. Callers are
// not asked to care — `searchMusic` looks like `searchImages`. When the bridge is down the
// audio calls return an empty result with `error` set, exactly as a dry search would, so a
// caller's fallback path is the same either way.
//
// FAIL-SOFT: these functions do not throw. A total failure returns `{ assets: [], error }`.
// The pipeline's job is to degrade, not to abort — but the reason is always carried, because
// an invalid API key and a genuinely empty catalogue need opposite fixes and looked
// identical for a long time in this codebase.

const { ENDPOINTS, hasKey, cacheTtlMs, minImageWidth } = require("./config");
const client = require("./client");
const cache = require("./cache");
const mapper = require("./mapper");
const validator = require("./validator");
const ranking = require("./ranking");
const bridge = require("../pixabay_bridge");

/** @typedef {import('./types').Asset} Asset */
/** @typedef {import('./types').SearchOptions} SearchOptions */
/** @typedef {import('./types').SearchResult} SearchResult */

const log = (...a) => console.log("[pixabay:service]", ...a);

// Deterministic keyword choice. Variety across jobs, reproducibility within one — the same
// contract audio_profile.pickMusicKeywords uses, and for the same reason: a re-render of one
// job must not silently change its media.
function seededPick(list, n, seed) {
  if (!seed) return list.slice(0, n);
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  const pool = list.slice();
  const out = [];
  while (pool.length && out.length < n) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    out.push(pool.splice(h % pool.length, 1)[0]);
  }
  return out;
}

function keywordsOf(opts) {
  const raw = Array.isArray(opts.keywords) ? opts.keywords : [opts.keywords];
  const list = raw.map((k) => String(k || "").trim()).filter(Boolean);
  if (!list.length) return [];
  return opts.pick > 0 ? seededPick(list, Math.min(opts.pick, list.length), opts.seed) : list;
}

/** One REST query → mapped assets. Cache-aware. */
async function queryRest(type, query, opts) {
  const params = type === "video"
    ? { q: query, video_type: "all", per_page: opts.perPage || 20, page: opts.page || 1,
        safesearch: opts.safeSearch !== false, category: opts.category, lang: opts.language,
        orientation: opts.orientation && opts.orientation !== "all" ? opts.orientation : undefined }
    : { q: query, image_type: opts.imageType || "all", per_page: opts.perPage || 20, page: opts.page || 1,
        safesearch: opts.safeSearch !== false, category: opts.category, lang: opts.language,
        min_width: opts.minWidth || minImageWidth(),
        orientation: opts.orientation && opts.orientation !== "all" ? opts.orientation : undefined };

  const ck = cache.keyFor(`rest:${type}`, params);
  if (!opts.noCache) {
    const hit = await cache.get(ck);
    if (hit) { log(`cache HIT ${type} "${query}"`); return { assets: mapper.mapMany(hit, type), cached: true }; }
  }
  const body = await client.getJson(ENDPOINTS[type === "video" ? "video" : "image"], params);
  if (!opts.noCache) await cache.set(ck, body, cacheTtlMs());
  return { assets: mapper.mapMany(body, type), cached: false };
}

/** One bridge query → a single mapped audio asset (the bridge returns one at a time). */
async function queryBridge(type, query, opts) {
  const category = type === "sfx" ? "sound-effects" : "music";
  const ck = cache.keyFor(`bridge:${category}`, { q: query, i: opts.page || 0 });
  if (!opts.noCache) {
    const hit = await cache.get(ck);
    if (hit) { log(`cache HIT ${category} "${query}"`); return { assets: [mapper.mapAudio(hit, type)], cached: true }; }
  }
  const url = await bridge.firstAudioUrl(query, category, { index: opts.page || 0 });
  if (!url) return { assets: [], cached: false };
  const payload = { mp3Url: url, query, pageTitle: query };
  if (!opts.noCache) await cache.set(ck, payload, cacheTtlMs());
  return { assets: [mapper.mapAudio(payload, type)], cached: false };
}

/**
 * Core search. Merges every keyword's results, de-dupes by id, validates, ranks, truncates.
 * @param {import('./types').AssetType} type
 * @param {SearchOptions} opts
 * @returns {Promise<SearchResult>}
 */
async function search(type, opts = {}) {
  const t0 = Date.now();
  const queries = keywordsOf(opts);
  const out = { assets: [], queries, cached: false, elapsedMs: 0, error: null };
  if (!queries.length) { out.error = "no keywords supplied"; out.elapsedMs = Date.now() - t0; return out; }

  const isAudio = type === "music" || type === "sfx";
  if (!isAudio && !hasKey()) {
    out.error = "no Pixabay API key configured";
    out.elapsedMs = Date.now() - t0;
    log(`${type} search skipped — ${out.error}`);
    return out;
  }

  // Keywords run in PARALLEL; the client's limiter and dedup make that safe, and a serial
  // ladder would multiply latency by the keyword count for no benefit.
  const runner = isAudio ? queryBridge : queryRest;
  const settled = await Promise.all(queries.map((q) =>
    runner(type, q, opts).then((r) => ({ q, ...r })).catch((e) => ({ q, assets: [], cached: false, err: e }))
  ));

  const failures = settled.filter((s) => s.err);
  const byId = new Map();
  for (const s of settled) for (const a of s.assets) if (!byId.has(a.id)) byId.set(a.id, a);

  const { kept, rejected } = validator.partition([...byId.values()], {
    minWidth: opts.minWidth, minHeight: opts.minHeight, orientation: opts.orientation,
  });
  const ranked = ranking.rank(kept, {
    query: queries.join(" "), orientation: opts.orientation,
    minWidth: opts.minWidth, durationSec: opts.durationSec,
  });

  out.assets = ranked.slice(0, opts.limit || 10);
  out.cached = settled.length > 0 && settled.every((s) => s.cached);
  out.elapsedMs = Date.now() - t0;
  // Only a TOTAL failure is an error — a partial one still returned usable assets.
  if (failures.length === settled.length && settled.length) out.error = failures[0].err.message;

  log(`${type} [${queries.join(" | ")}] → ${byId.size} raw, ${rejected.length} rejected, ` +
      `${out.assets.length} returned${out.assets[0] ? ` (top ${out.assets[0].score})` : ""}, ` +
      `${out.cached ? "cached" : "live"}, ${out.elapsedMs}ms` +
      `${failures.length ? ` — ${failures.length}/${settled.length} queries failed` : ""}`);
  if (rejected.length && !out.assets.length) log(`  all rejected: ${rejected.slice(0, 4).map((r) => r.reason).join("; ")}`);
  return out;
}

/** @param {SearchOptions} o @returns {Promise<SearchResult>} */ const searchImages = (o) => search("image", o);
/** @param {SearchOptions} o @returns {Promise<SearchResult>} */ const searchVideos = (o) => search("video", o);
/** @param {SearchOptions} o @returns {Promise<SearchResult>} */ const searchMusic = (o) => search("music", o);
/** @param {SearchOptions} o @returns {Promise<SearchResult>} */ const searchSoundEffects = (o) => search("sfx", o);

/**
 * Mixed search across several types. Results are ranked on ONE comparable 0..100 scale, so
 * the merged list is meaningfully ordered rather than concatenated.
 * @param {SearchOptions & {types?: import('./types').AssetType[]}} opts
 * @returns {Promise<SearchResult>}
 */
async function searchAssets(opts = {}) {
  const types = opts.types && opts.types.length ? opts.types : ["image"];
  const parts = await Promise.all(types.map((t) => search(t, opts)));
  const assets = ranking.rank(parts.flatMap((p) => p.assets), {
    query: (parts[0] && parts[0].queries.join(" ")) || "", orientation: opts.orientation,
    minWidth: opts.minWidth, durationSec: opts.durationSec,
  });
  return {
    assets: assets.slice(0, opts.limit || 10),
    queries: [...new Set(parts.flatMap((p) => p.queries))],
    cached: parts.every((p) => p.cached),
    elapsedMs: Math.max(...parts.map((p) => p.elapsedMs), 0),
    error: parts.every((p) => p.error) ? parts[0].error : null,
  };
}

module.exports = {
  searchImages, searchVideos, searchMusic, searchSoundEffects, searchAssets,
  // Diagnostics — `probeKey` is the one that answers "is the configured key real?", which
  // `hasKey()` cannot: a present-but-invalid key passes every local check and fails only at
  // the API. That gap silently starved this pipeline's asset supply.
  probeKey: client.probeKey,
  hasKey,
  cacheStats: cache.getStats,
  clearCache: cache.clear,
  __test: { seededPick, keywordsOf, search },
};
