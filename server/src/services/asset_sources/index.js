// Asset acquisition orchestrator.
//
// Order of attack for every request (the user's DB-first rule):
//   1. LOCAL DATABASE — previously fetched assets, keyword-matched
//   2. External providers in configured order, primary query then fallbacks
//   3. null (caller degrades gracefully)
//
// Every successful external download is validated (ffprobe) and registered
// into the local database so the next project hits the cache instead.

const fs = require("node:fs");
const config = require("../../config");
const localDb = require("./local_db");
const curated = require("./curated_library");
const iconify = require("./iconify");
const util = require("./util");
const pixabayBridge = require("../pixabay_bridge");
const { subjectQuery } = require("./query_terms");

// Local curated library is OFF by default now (user preference: source assets
// from Pixabay, not the local packs — the curated set was serving off-topic
// clip-art). Set USE_CURATED_LIBRARY=1 to re-enable it.
const USE_CURATED = process.env.USE_CURATED_LIBRARY === "1";

// Pixabay-only mode (PIXABAY_ONLY=1): every asset must provably come from
// Pixabay. Drops the non-Pixabay image providers (openverse, pexels), the
// iconify SVG fallback, and any cached asset whose source isn't Pixabay. The
// Pixabay official API + site-scraper + vector bridge remain. Pairs with the
// audio_sources.js switch that drops the Freesound/Internet-Archive fallbacks.
const PIXABAY_ONLY = process.env.PIXABAY_ONLY === "1";
// A cached asset counts as Pixabay when its source is "pixabay" or
// "pixabay_scrape" (local_db stores the raw provider name).
const PIXABAY_SOURCE_RE = /^pixabay/;
// Cache entries written by the image gap-filler (asset_gap_fill.js).
const GENERATED_SOURCE_RE = /^generated$/;

const PROVIDERS = {
  pixabay: require("./pixabay_api"),
  openverse: require("./openverse"),
  pexels: require("./pexels"),
  pixabay_scrape: require("./pixabay_scrape"),
};

const DEFAULT_ORDER = ["pixabay", "openverse", "pexels", "pixabay_scrape"];

function providersFor(type) {
  const order = config.assetProviders?.order || DEFAULT_ORDER;
  return order
    .filter((n) => !PIXABAY_ONLY || n === "pixabay" || n === "pixabay_scrape")
    .map((n) => PROVIDERS[n])
    .filter((p) => p && p.types.includes(type) && (p.available ? p.available() : true));
}

// Can ANY configured provider serve this asset type right now? (Callers use
// this to downgrade, e.g. a video need to a still image when no video
// provider has a key.)
function hasProviderFor(type) {
  return providersFor(type).length > 0;
}

// Acquire one asset. Returns { path, query, source, license, sourceUrl,
// width, height, fromCache, libraryId } or null.
//
// `kindPref` ("photo" | "illustration" | "vector") biases the curated library
// toward the right asset shape for the need's role. `excludeIds` (Set) skips
// curated entries already used in this video so a film never reuses a file.
// `curatedOnly` (CURATED_ONLY_IMAGES override) forbids web stock AND the
// web-stock cache: the need is served by the curated library or not at all.
async function acquire({ query, fallbackQueries = [], type, orientation, outputPath, tracker, kindPref, excludeIds, curatedOnly = false, iconColor, iconStyle, styleKeywords, vectorPrefer, subject = null }) {
  const queries = [query, ...fallbackQueries].filter(Boolean);

  // 0 — the curated local library (user's pre-loaded packs), stills only.
  // Highest priority: hand-picked, license-clean, offline. The file keeps its
  // real extension (svg/png/jpg), so we return the actual written path.
  // Gated OFF by default (USE_CURATED_LIBRARY=1 to restore) — see USE_CURATED.
  if (USE_CURATED && type === "image") {
    for (const q of queries) {
      const hits = curated.search({ query: q, type, limit: 8, kindPref, excludeIds });
      if (hits.length) {
        // Variety: sample among the top relevant matches instead of always
        // returning hits[0]. Always picking the single best hit is the #1 reason
        // "every video uses the same images" — the same query (e.g. "shopping",
        // "headphones") deterministically resolved to the identical file across
        // every generation. Sampling the strongest few keeps relevance while
        // giving each video (and each regenerate) a fresh look. excludeIds (passed
        // through to search) still prevents reusing a file already used this video.
        const pool = hits.slice(0, Math.min(hits.length, 4));
        const pick = pool[Math.floor(Math.random() * pool.length)];
        const meta = curated.materialize(pick, outputPath);
        if (tracker) tracker.addExternal("asset_library_hit");
        return { path: meta.path, query: q, fromCache: true, libraryId: pick.id, ...meta };
      }
    }
  }

  // VECTORS / ICONS — use BOTH Iconify AND Pixabay. Each vector slot tries one
  // source, then falls back to the other, so a single miss never leaves a slot
  // empty. The caller alternates `vectorPrefer` per slot ("iconify"/"pixabay")
  // so a video ends up with a real MIX of Pixabay vector art AND Iconify icons
  // instead of every slot coming from whichever source happens to answer first.

  // Pixabay bridge vectors: direct public CDN previews (~1280px PNG) — a normal
  // raster download + lenient validation (no alpha requirement, opaque vector
  // illustrations still qualify). Fail-soft on empty/error/slow.
  async function tryPixabayVectors() {
    if (!pixabayBridge.enabled()) return null;
    for (const q of queries) {
      // Clean to concrete subject nouns first — a raw scene query full of
      // camera/motion words ("camera pans rapidly crisp") returns off-topic
      // vectors. No noun survives -> skip the fetch for this query.
      const sq = subjectQuery(q);
      if (!sq) { console.log(`[assets] vector query "${q}" -> no concrete subject noun, skipping pixabay-bridge`); continue; }
      let cands = [];
      try { cands = await pixabayBridge.searchVectors(sq, { limit: 12 }); }
      catch (e) { console.warn(`[assets] pixabay-bridge vector search error for "${sq}": ${e.message}`); }
      const ranked = util.rankCandidates(sq, cands, styleKeywords);
      for (const c of ranked.slice(0, 4)) {
        try {
          await util.download(c.url, outputPath);
          if (!(await util.validateMedia(outputPath, type))) { try { fs.unlinkSync(outputPath); } catch { /* noop */ } continue; }
          const v = await util.validateImage(outputPath, {}); // lenient: valid + not-flat
          if (!v.ok) { try { fs.unlinkSync(outputPath); } catch { /* noop */ } continue; }
          if (tracker) tracker.addExternal("pixabay_bridge_vector");
          console.log(`[assets] "${q}" (vector) <- pixabay-bridge ${c.id} (${v.meta.width}x${v.meta.height})`);
          return {
            path: outputPath, query: q, fromCache: false, source: "pixabay",
            license: c.license, sourceUrl: c.sourceUrl,
            width: v.meta.width, height: v.meta.height, ratio: v.meta.ratio,
            hasAlpha: v.meta.hasAlpha, dhash: v.meta.dhash, dominantColor: v.meta.dominantColor,
          };
        } catch (e) { console.warn(`[assets] pixabay-bridge vector candidate failed for "${q}": ${e.message}`); }
      }
    }
    return null;
  }

  // Iconify: keyless, open-licensed SVG icons recolored to the pack accent.
  // SVG-native (writes an .svg directly, no ffprobe gate). Skipped under the
  // image-wide PIXABAY_ONLY (iconify is not Pixabay) — vector roles then rely on
  // Pixabay only. NOT gated by the audio-only AUDIO_PIXABAY_ONLY.
  async function tryIconify() {
    if (PIXABAY_ONLY) return null;
    for (const q of queries) {
      let icon = null;
      try { icon = await iconify.fetchIcon({ query: q, color: iconColor, iconStyle, outputPath }); }
      catch (e) { console.warn(`[assets] iconify error for "${q}": ${e.message}`); }
      if (icon) {
        if (tracker) tracker.addExternal("iconify_fetch");
        console.log(`[assets] "${q}" (icon) <- iconify ${icon.iconId}`);
        return {
          path: icon.path, query: q, fromCache: false, source: "iconify",
          license: "Open source (Iconify — per-set license)",
          sourceUrl: "https://icon-sets.iconify.design/", width: 128, height: 128,
        };
      }
    }
    return null;
  }

  if (type === "image" && kindPref === "vector") {
    // Alternate which source leads per slot (caller passes vectorPrefer); each
    // still falls back to the other so a miss never empties the slot.
    const order = vectorPrefer === "iconify" ? [tryIconify, tryPixabayVectors] : [tryPixabayVectors, tryIconify];
    for (const attempt of order) {
      const hit = await attempt();
      if (hit) return hit;
    }
  }

  // Operator override (CURATED_ONLY_IMAGES): with web stock forced off, a photo
  // need is satisfied ONLY by the curated library above (or the real website
  // screenshots the caller pins separately). If curated found nothing, return
  // null so the scene stays asset-free rather than pulling random/off-brand
  // stock — including the web-stock fetch cache, which is prior web downloads.
  if (curatedOnly) {
    console.log(`[assets] "${query}" (${type}) — curated-only, no curated hit; skipping web stock + cache`);
    return null;
  }

  // 1 — our fetch cache. Under PIXABAY_ONLY, restrict cache hits to entries that
  // were originally sourced from Pixabay, so a pre-existing openverse/pexels/
  // iconify asset can't leak back in through the cache.
  for (const q of queries) {
    // AI-generated fills are cached under source "generated" and are reachable
    // ONLY by the gap-filler that made them — otherwise a job with image
    // generation switched off would still be served AI imagery from the cache.
    const hits = localDb.search({
      query: q, type, orientation, subject,
      sourceRe: PIXABAY_ONLY ? PIXABAY_SOURCE_RE : null,
      excludeSourceRe: GENERATED_SOURCE_RE,
    });
    if (hits.length) {
      const meta = localDb.materialize(hits[0], outputPath);
      if (tracker) tracker.addExternal("asset_cache_hit");
      return { path: outputPath, query: q, fromCache: true, ...meta };
    }
  }

  // 2 — external providers.
  for (const q of queries) {
    for (const provider of providersFor(type)) {
      let candidates = [];
      try {
        if (tracker) tracker.addExternal(`${provider.name}_search`);
        // Pull a deeper page for images so ranking has real choice — the top
        // "popular" hit is often only loosely on-topic.
        candidates = await provider.search({ query: q, type, orientation, limit: type === "image" ? 20 : 8 });
      } catch (e) {
        console.warn(`[assets] ${provider.name} search failed for "${q}": ${e.message}`);
        continue;
      }

      // Rank by keyword relevance + resolution + pack-style match so a loosely-
      // matched, low-res, or off-style hit never wins just because it came back
      // first; try the best few.
      const ranked = util.rankCandidates(q, candidates, styleKeywords);
      for (const c of ranked.slice(0, 5)) {
        try {
          await util.download(c.url, outputPath);
          const ok = await util.validateMedia(outputPath, type);
          if (!ok) {
            try { fs.unlinkSync(outputPath); } catch { /* noop */ }
            continue;
          }
          // Image quality gate: reject solid-colour/near-flat placeholders and
          // opaque rasters standing in for a transparent icon/vector role, and
          // capture the REAL dimensions/ratio/alpha + a perceptual dHash for
          // downstream fitting and near-duplicate detection.
          let imageMeta = null;
          if (type === "image") {
            const v = await util.validateImage(outputPath, { kindPref });
            if (!v.ok) {
              console.warn(`[assets] rejected "${q}" from ${provider.name}: ${v.reason}`);
              try { fs.unlinkSync(outputPath); } catch { /* noop */ }
              continue;
            }
            imageMeta = v.meta;
          } else if (type === "video") {
            // Video used to skip this gate entirely: a clip passed validateMedia
            // (over 5KB, one decodable stream) and nothing else — no resolution
            // floor, no length floor, and no perceptual hash, which made video
            // the only asset type with NO duplicate detection at all. The meta
            // captured here also gives clips real width/height/ratio for
            // downstream fitting, which they never carried before.
            const v = await util.validateClip(outputPath);
            if (!v.ok) {
              console.warn(`[assets] rejected clip "${q}" from ${provider.name}: ${v.reason}`);
              try { fs.unlinkSync(outputPath); } catch { /* noop */ }
              continue;
            }
            imageMeta = v.meta;
          }
          if (type === "video") await util.reencodeForHyperframes(outputPath);
          localDb.register({
            filePath: outputPath, query: q, type, orientation,
            source: provider.name, license: c.license, sourceUrl: c.sourceUrl,
            width: (imageMeta && imageMeta.width) || c.width, height: (imageMeta && imageMeta.height) || c.height,
          });
          console.log(`[assets] "${q}" (${type}) <- ${provider.name} (${(imageMeta && imageMeta.width) || c.width || "?"}x${(imageMeta && imageMeta.height) || c.height || "?"})`);
          return {
            path: outputPath, query: q, fromCache: false,
            source: provider.name, license: c.license, sourceUrl: c.sourceUrl,
            width: (imageMeta && imageMeta.width) || c.width,
            height: (imageMeta && imageMeta.height) || c.height,
            ratio: imageMeta ? imageMeta.ratio : null,
            hasAlpha: imageMeta ? imageMeta.hasAlpha : undefined,
            dhash: imageMeta ? imageMeta.dhash : undefined,
            dominantColor: imageMeta ? imageMeta.dominantColor : undefined,
          };
        } catch (e) {
          console.warn(`[assets] ${provider.name} candidate failed for "${q}": ${e.message}`);
        }
      }
    }
  }

  console.warn(`[assets] no asset found for "${query}" (${type}) after ${queries.length} query variant(s)`);
  return null;
}

module.exports = {
  acquire, hasProviderFor, localDb,
  makeImageDeduper: util.makeImageDeduper,
  validateImage: util.validateImage,
};
