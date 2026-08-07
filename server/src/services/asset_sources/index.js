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
async function acquire({ query, fallbackQueries = [], type, orientation, outputPath, tracker, kindPref, excludeIds, curatedOnly = false, iconColor, iconStyle, styleKeywords, targetRatio }) {
  // Query hygiene: collapse whitespace and hard-cap length. Stock APIs (Pixabay)
  // reject queries over ~100 chars with HTTP 400 — an over-long concatenated
  // query (anchor + direction + pack style) silently returned ZERO assets and
  // left whole scenes empty. Normalizing here fixes it for every provider path.
  const normQuery = (q) => String(q || "").replace(/\s+/g, " ").trim().slice(0, 90);
  const queries = [...new Set([query, ...fallbackQueries].map(normQuery).filter(Boolean))];

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

  // 0.4 — Pixabay bridge VECTORS (user preference: real Pixabay vector art before
  // iconify). The bridge returns direct public CDN previews (~1280px PNG), so this
  // is a normal raster download + validation. Fail-soft: on empty/error/slow it
  // falls through to iconify below. Validated leniently (no alpha requirement) so
  // a clean opaque vector illustration still qualifies for a vector slot.
  if (type === "image" && kindPref === "vector" && pixabayBridge.enabled()) {
    for (const q of queries) {
      // Clean the query to concrete subject nouns first — a raw scene query full
      // of camera/motion words ("camera pans rapidly crisp") returns off-topic
      // vectors (tooth/syringe). No noun survives -> skip the fetch entirely.
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
            // sharpness + stdev are measured by validateImage on this very line and were
            // dropped here — the same "computed one line before its consumer" loss the
            // comment beside dhash/dominantColor in graph.assetSearchAgent describes having
            // already fixed once. services/asset_quality grades every asset on them.
            sharpness: v.meta.sharpness, stdev: v.meta.stdev,
          };
        } catch (e) { console.warn(`[assets] pixabay-bridge vector candidate failed for "${q}": ${e.message}`); }
      }
    }
  }

  // 0.5 — Iconify: keyless, open-licensed SVG icons for vector/icon roles, after
  // the curated library and before web stock. Clean line/solid art recolored to
  // the pack accent — the reliable icon supply the pixabay-vector path never was.
  // SVG-native: writes an .svg directly (no ffprobe gate); the composer already
  // places .svg assets.
  if (type === "image" && kindPref === "vector") {
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

  // 1 — our fetch cache.
  for (const q of queries) {
    const hits = localDb.search({ query: q, type, orientation });
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

      // Rank by keyword relevance + resolution + pack-style match + aspect fit so
      // a loosely-matched, low-res, off-style, or wrong-shape hit never wins just
      // because it came back first; try the best few.
      const tRatio = type === "image"
        ? (targetRatio || (orientation === "vertical" ? 9 / 16 : orientation === "square" ? 1 : 16 / 9))
        : undefined;
      const ranked = util.rankCandidates(q, candidates, styleKeywords, tRatio);
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
          }
          // VIDEO, MEASURED BEFORE THE RE-ENCODE AND REJECTED HERE — both halves matter.
          //
          // BEFORE: `reencodeForHyperframes` forces `-r 30 -crf 23 -an`. Anything probed after
          // it describes OUR transcode, not the clip the provider offered: every clip reads
          // exactly 30fps whatever it really was, and its bitrate is a property of our encoder
          // setting. Measuring here is the only place the source facts still exist.
          //
          // HERE: this is inside the provider/candidate ladder, so a rejected clip falls
          // through to `continue` and the NEXT candidate is tried — exactly as a rejected image
          // has always done. Rejecting later (after acquire returned) would delete the file
          // with nothing left to retry, and the scene would simply lose its visual.
          let clipMeta = null;
          if (type === "video") {
            const v = await util.validateClip(outputPath);
            if (!v.ok) {
              console.warn(`[assets] rejected clip "${q}" from ${provider.name}: ${v.reason}`);
              try { fs.unlinkSync(outputPath); } catch { /* noop */ }
              continue;
            }
            clipMeta = v.meta;
            await util.reencodeForHyperframes(outputPath);
          }
          // Awaited: `register` became async (streamed hash + async copy) and its
          // check-then-push must complete before this lane returns, or two lanes racing on the
          // same bytes can both append to the shared index.
          await localDb.register({
            filePath: outputPath, query: q, type, orientation,
            source: provider.name, license: c.license, sourceUrl: c.sourceUrl,
            width: (imageMeta && imageMeta.width) || c.width, height: (imageMeta && imageMeta.height) || c.height,
            // Persist what validateImage already measured, so a cache hit is as
            // well-described as this download was (see local_db.materialize).
            ratio: imageMeta ? imageMeta.ratio : undefined,
            hasAlpha: imageMeta ? imageMeta.hasAlpha : undefined,
            dhash: imageMeta ? imageMeta.dhash : undefined,
            dominantColor: imageMeta ? imageMeta.dominantColor : undefined,
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
            // The pixel-quality evidence validateImage already measured. Carrying it costs
            // nothing (the ffmpeg passes have run) and saves asset_prep from re-measuring
            // every stock asset it receives.
            sharpness: imageMeta ? imageMeta.sharpness : undefined,
            stdev: imageMeta ? imageMeta.stdev : undefined,
            // The SOURCE clip's facts, measured above before the re-encode normalised them
            // away. Without these asset_quality has nothing to grade footage on.
            ...(clipMeta ? {
              width: clipMeta.width || c.width, height: clipMeta.height || c.height,
              ratio: clipMeta.ratio, dhash: clipMeta.dhash, stdev: clipMeta.stdev,
              clipDurationSec: clipMeta.durationSec, fps: clipMeta.fps,
              bitrateKbps: clipMeta.bitrateKbps, codec: clipMeta.codec,
            } : {}),
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
  ffprobeImage: util.ffprobeImage,
};
