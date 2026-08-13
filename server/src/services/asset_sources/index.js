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
const assetScore = require("../asset_score");
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
  unsplash: require("./unsplash"),
  pixabay_scrape: require("./pixabay_scrape"),
};

// Keyed + hardened providers first, then the keyless fallbacks, then the last-resort scraper.
// Since the fan-out below asks every provider for the same query CONCURRENTLY and ranks the
// merged pool, this order no longer decides who wins — only who is asked and how ties break.
const DEFAULT_ORDER = ["pixabay", "pexels", "unsplash", "openverse", "pixabay_scrape"];

// The provider names that mean "arbitrary web stock" — i.e. material the pipeline must treat
// with suspicion rather than as the user's own. EXPORTED because two other files each kept
// their own hardcoded copy (agents/graph.js and services/creative_director.js), and a
// provider missing from the creative_director copy is silently promoted to TRUSTED OWNER
// CONTENT: exempt from the quality floor and never deletable. That is the opposite of what a
// new stock provider needs.
const STOCK_PROVIDERS = Object.freeze(["pixabay", "openverse", "pexels", "unsplash", "pixabay_scrape"]);

// How many ranked candidates are worth ATTEMPTING before giving up on a query variant.
// This is a retry ladder for download/validation failures, not a shortlist: the pool has
// already decided the order, and each rung costs a real download plus four ffmpeg passes.
const LADDER_DEPTH = 5;

// How many REFINED query variants to try after the caller's own fallbacks are spent. Two,
// because each lap costs a full fan-out across every provider and the returns fall off a
// cliff: if "analytics dashboard" and its shortened forms found nothing above the bar, a
// third rewording is not the problem.
const MAX_REFINEMENT_LAPS = 2;

// The wall-clock ceiling for ONE acquire, across every rung, query variant and refinement lap.
// 90s is generous against the measured happy path (a pooled fetch + validate runs ~1-3s) and
// exists only to stop a pathological chain of slow providers from stalling a fetch lane.
const ACQUIRE_BUDGET_MS = Math.max(15_000, Number(config.assetProviders?.acquireBudgetMs) || 90_000);

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

// THE PROVENANCE ENVELOPE — every rung of the waterfall returns through this.
//
// acquire() has FIVE separate success returns (curated library, pixabay-bridge vectors,
// iconify, the fetch cache, and the provider ladder). A field added to only one of them
// silently does not exist for the other four, and this file's own history records that
// happening three times: `ratio`/`dhash`/`dominantColor` reached the wire from downloads
// but not from cache hits, and `sharpness`/`stdev` were measured one line above the return
// that dropped them. Routing every return through one function is what stops the fourth.
//
// `provider` is deliberately SEPARATE from `source`. asset_priority.tierFor() derives an
// asset's tier from `source` by exact- and prefix-match and displayRank multiplies it by
// 1e6, so `source` is load-bearing and must not be repurposed — and it cannot answer the
// question anyway: bridge vectors stamp source:"pixabay" (indistinguishable from an API
// hit) and a cache hit stamps "cache:pexels". `provider` names who actually supplied the
// pixels, which is what per-provider observability needs.
function withProvenance(result, { provider = null, candidate = null, bar = null } = {}) {
  const n = (v) => (Number.isFinite(v) ? v : null);
  return {
    ...result,
    provider,
    // The bar this want was held to, on EVERY return and not just the compromise path.
    // Without it a consumer cannot tell a medium box that legitimately cleared 70 from a
    // hero box that quietly missed 80 — both just look like "score 72".
    bar: n(bar),
    // Null, not zero: "nothing scored this" and "this scored zero" are different claims,
    // and the rungs that bypass ranking (curated, iconify, cache) genuinely have no score.
    retrievalScore: candidate ? n(candidate.__score) : null,
    retrievalParts: (candidate && candidate.__parts) || null,
    candidateRank: candidate ? n(candidate.__rank) : null,
    poolSize: candidate ? n(candidate.__poolSize) : null,
  };
}

// Acquire one asset. Returns { path, query, source, provider, license, sourceUrl,
// width, height, fromCache, retrievalScore, retrievalParts, libraryId } or null.
//
// `kindPref` ("photo" | "illustration" | "vector") biases the curated library
// toward the right asset shape for the need's role. `excludeIds` (Set) skips
// curated entries already used in this video so a film never reuses a file.
// `curatedOnly` (CURATED_ONLY_IMAGES override) forbids web stock AND the
// web-stock cache: the need is served by the curated library or not at all.
// `requirement` is the box contract from services/asset_requirements (priority, minWidth,
// minHeight, kindPref, preferredAspect...). It has always been computed per placeholder and
// almost entirely discarded — only `preferredAspect` ever reached this function. Passed as
// ONE optional object rather than six loose parameters, so the three call sites that have no
// box (creative_director, pipeline, project_pipeline) are unaffected and every field absent
// simply scores neutral.
async function acquire({ query, fallbackQueries = [], type, orientation, outputPath, tracker, kindPref, excludeIds, curatedOnly = false, iconColor, iconStyle, styleKeywords, targetRatio, requirement = null, sceneText = "", subjectTerms = null, brandColors = null, seen = null }) {
  // Query hygiene: collapse whitespace and hard-cap length. Stock APIs (Pixabay)
  // reject queries over ~100 chars with HTTP 400 — an over-long concatenated
  // query (anchor + direction + pack style) silently returned ZERO assets and
  // left whole scenes empty. Normalizing here fixes it for every provider path.
  const normQuery = (q) => String(q || "").replace(/\s+/g, " ").trim().slice(0, 90);
  const queries = [...new Set([query, ...fallbackQueries].map(normQuery).filter(Boolean))];

  // Everything the scorer needs beyond the candidate itself. Assembled once: it is identical
  // for every candidate of every query variant, and rebuilding it per candidate would be the
  // kind of quiet waste that only shows up at 60 candidates x 5 providers.
  const scoreCtx = { requirement, sceneText, subjectTerms, brandColors, seen };

  // THE BAR this want has to clear: 80 by default, relaxed only for boxes the template itself
  // calls decorative. See services/asset_score.barFor.
  const bar = assetScore.barFor(requirement);

  // BEST-SO-FAR. The single most important safety property of the whole threshold: we never
  // return null because nothing was good enough. Every filter in this layer is deliberately
  // fail-open — rankCandidates keeps sub-resolution candidates when they are all there is,
  // validateImage passes what it cannot measure — because a filled scene beats an empty one
  // and preflight hard-fails a film whose critical placeholders are empty.
  //
  // So a candidate that misses the bar is REMEMBERED, not discarded. Its file is stashed
  // beside the output path (the ladder reuses one filename, so the next download would
  // otherwise overwrite it) and restored at the end if nothing better ever appears.
  const stashPath = `${outputPath}.best`;
  let best = null;   // { score, record, provider, query, candidate, meta, rank, poolSize }
  const remember = (payload) => {
    if (best && best.score >= payload.score) return;
    try { fs.copyFileSync(outputPath, stashPath); } catch { return; }
    best = payload;
  };

  // An overall deadline, which acquire has never had. Its timeouts are scattered and
  // uncoordinated (download 60s idle, pixabay 20s x3 + backoff, pexels/openverse 20s,
  // iconify 12s, bridge 45s, the scraper's 45s goto + 20s challenge, validateMedia 20s,
  // reencode 120s), so the worst case for ONE asset was minutes. Adding providers and
  // refinement laps multiplies that directly, and a fetch lane that runs for minutes stalls
  // the whole film. Checked between rungs, never mid-download — killing a transfer to save
  // two seconds just wastes the bytes already paid for.
  const deadlineAt = Date.now() + ACQUIRE_BUDGET_MS;
  const outOfTime = () => Date.now() > deadlineAt;

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
        return withProvenance({ path: meta.path, query: q, fromCache: true, libraryId: pick.id, ...meta }, { provider: "library", bar });
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
          return withProvenance({
            path: outputPath, query: q, fromCache: false, source: "pixabay",
            license: c.license, sourceUrl: c.sourceUrl,
            width: v.meta.width, height: v.meta.height, ratio: v.meta.ratio,
            hasAlpha: v.meta.hasAlpha, dhash: v.meta.dhash, dominantColor: v.meta.dominantColor,
            // sharpness + stdev are measured by validateImage on this very line and were
            // dropped here — the same "computed one line before its consumer" loss the
            // comment beside dhash/dominantColor in graph.assetSearchAgent describes having
            // already fixed once. services/asset_quality grades every asset on them.
            sharpness: v.meta.sharpness, stdev: v.meta.stdev,
          }, { provider: "pixabay-bridge", candidate: c, bar });
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
        return withProvenance({
          path: icon.path, query: q, fromCache: false, source: "iconify",
          license: "Open source (Iconify — per-set license)",
          sourceUrl: "https://icon-sets.iconify.design/", width: 128, height: 128,
        }, { provider: "iconify", bar });
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
  //
  // THE CACHE MUST CLEAR THE SAME BAR AS A FRESH FETCH. This rung used to take `hits[0]`
  // unconditionally: no ranking, no targetRatio, no validateImage, no score. That made it a
  // free bypass around every quality decision downstream of it — measured on this very
  // change, a request for a 16:9 hero was served a cached 1280x1280 SQUARE image, instantly,
  // with nothing to object. Once a threshold exists, an unscored cache hit is strictly worse
  // than that: a cached 55 would beat a fresh 85 by arriving first.
  //
  // So a cache hit is now a CONTENDER. It is scored on the same seven axes; if it clears the
  // bar it still short-circuits the providers (that speed is the point of a cache), and if it
  // does not, it is remembered as best-so-far and the fan-out runs.
  for (const q of queries) {
    const hits = localDb.search({ query: q, type, orientation });
    if (hits.length) {
      const meta = localDb.materialize(hits[0], outputPath);
      if (tracker) tracker.addExternal("asset_cache_hit");
      const entry = hits[0];
      const cachedCandidate = {
        url: entry.sourceUrl || `cache:${entry.id}`,
        width: meta.width, height: meta.height,
        title: entry.query || "", alt: entry.query || "", tags: [],
        avgColor: meta.dominantColor || null,
        id: entry.id, provider: entry.source || null,
      };
      // Score on the MEASURED path when the entry carries measurements (they are stored at
      // download time now), so a cached asset is judged on the same evidence a fresh one is.
      const rec = assetScore.rescoreMeasured({
        ...scoreCtx, query: q, candidate: cachedCandidate, provider: entry.source || null,
        styleKeywords, targetRatio,
        meta: (meta.width || meta.dhash) ? {
          width: meta.width, height: meta.height, ratio: meta.ratio, hasAlpha: meta.hasAlpha,
          dhash: meta.dhash, dominantColor: meta.dominantColor,
          // Older entries stored neither; undefined scores neutral rather than badly.
          stdev: entry.stdev, sharpness: entry.sharpness,
        } : null,
      });
      if (rec.score < bar) {
        console.log(`[assets] cache hit for "${q}" scored ${rec.score}/100 (bar ${bar}) — keeping it as a fallback and searching for better`);
        remember({ score: rec.score, record: rec, provider: cachedCandidate.provider, query: q, candidate: cachedCandidate, meta, rank: null, poolSize: null, fromCache: true });
        continue;
      }
      console.log(`[assets] cache hit for "${q}" scored ${rec.score}/100 (bar ${bar}) — using it`);
      // The cached entry remembers who originally served it, so a cached Pexels photo
      // reports provider:"pexels" while source stays "cache:pexels" — per-provider
      // accounting stays correct across cache hits instead of collapsing into "cache".
      return withProvenance(
        { path: outputPath, query: q, fromCache: true, ...meta },
        { provider: String(meta.source || "").replace(/^cache:/, "") || null,
          // The score it just earned against THIS want, not the one it earned for whatever
          // query originally fetched it — the same picture is a different answer to a
          // different question.
          candidate: { __score: rec.score, __parts: rec.parts, __rank: null, __poolSize: null }, bar }
      );
    }
  }

  // 2 — external providers, FANNED OUT.
  //
  // This used to be `for (query) for (provider)` — strictly sequential, and query-major, so
  // every provider was exhausted on variant 1 before variant 2 was tried and the FIRST
  // provider to yield a downloadable file ended the search. A Pexels candidate was therefore
  // never once weighed against a Pixabay candidate: `rankCandidates` only ever saw one
  // provider's results at a time, so "best available" meant "best from whoever answered first".
  //
  // Now: every provider is asked for the same query CONCURRENTLY, their candidates are merged
  // into one pool, de-duplicated across providers, and ranked together — so the winner is the
  // best picture anyone had, not the best picture the highest-priority provider had.
  //
  // THE OUTER QUERY LOOP STAYS SEQUENTIAL ON PURPOSE. That is what keeps refinement cheap:
  // variant 2 is only paid for when variant 1 could not satisfy the bar.
  // QUERY REFINEMENT, appended lazily. `refinedQueries` is consumed only after the caller's
  // own variants are exhausted, so a want that is satisfied on the first try never pays for it.
  //
  // REFINEMENT SHORTENS OR REPLACES. IT NEVER LENGTHENS. That is not a style preference: the
  // query is hard-capped at 90 characters, and a previous change that PREPENDED a 38-character
  // topic anchor truncated every query in a film to the same prefix, so the provider returned
  // the same pictures for every scene, the deduper correctly dropped them as duplicates, and a
  // seven-fetch plan collapsed to two assets with five of seven scenes rendering blank.
  // `subjectQuery` strips camera and motion words down to concrete nouns, which is exactly the
  // right move and is currently wired only to the vector branch.
  const refined = [];
  for (const q of queries) {
    const s = subjectQuery(q);
    if (s && s !== q && !queries.includes(s) && !refined.includes(s)) refined.push(s);
    // Head nouns only — the shortest query that still names the subject.
    const head = String(q).split(/\s+/).filter(Boolean).slice(0, 2).join(" ");
    if (head && head !== q && !queries.includes(head) && !refined.includes(head)) refined.push(head);
  }
  const attemptQueries = [...queries, ...refined.slice(0, MAX_REFINEMENT_LAPS)];

  for (const q of attemptQueries) {
    if (outOfTime()) { console.warn(`[assets] budget spent for "${query}" — stopping the search`); break; }
    const isRefinement = !queries.includes(q);
    if (isRefinement) console.log(`[assets] nothing cleared ${bar}/100 yet — refining "${queries[0]}" -> "${q}"`);
    const all = providersFor(type);
    // A LAST-RESORT PROVIDER MUST NOT JOIN THE FAN-OUT. pixabay_scrape launches a full
    // puppeteer Chrome per search and waits out a Cloudflare interstitial; asking it in
    // parallel on every want would start a browser per want — a large regression bought for
    // candidates the API providers almost always render unnecessary. It is asked only when
    // the concurrent pool comes back empty, which is exactly the "last resort" it was
    // written to be.
    const fanout = all.filter((p) => !p.lastResort);
    const lastResort = all.filter((p) => p.lastResort);

    const gather = async (list) => {
      const settled = await Promise.allSettled(list.map(async (provider) => {
        if (tracker) tracker.addExternal(`${provider.name}_search`);
        // Pull a deeper page for images so ranking has real choice — the top "popular" hit
        // is often only loosely on-topic.
        const got = await provider.search({ query: q, type, orientation, limit: type === "image" ? 20 : 8 });
        // Stamp provenance on every candidate NOW, while we still know who returned it.
        // Once they are merged there is no other way to tell them apart.
        return (got || []).map((c) => Object.assign(c, { __provider: c.provider || provider.name }));
      }));
      const pool = [];
      const tally = [];
      settled.forEach((s, i) => {
        const nm = list[i].name;
        if (s.status === "fulfilled") { pool.push(...s.value); tally.push(`${nm} ${s.value.length}`); }
        else {
          // ONE PROVIDER FAILING IS NOT THE SEARCH FAILING. allSettled is the whole point:
          // a 429 from Unsplash or a dead Pixabay key costs its own candidates and nothing else.
          console.warn(`[assets] ${nm} search failed for "${q}": ${s.reason && s.reason.message ? s.reason.message : s.reason}`);
          tally.push(`${nm} ERR`);
        }
      });
      return { pool, tally };
    };

    let { pool, tally } = await gather(fanout);
    if (!pool.length && lastResort.length) {
      const r = await gather(lastResort);
      pool = r.pool; tally = tally.concat(r.tally);
    }
    if (!pool.length) continue;

    // CROSS-PROVIDER DE-DUPLICATION, before anything is downloaded. The film-level deduper
    // (util.makeImageDeduper) is byte- and perception-accurate but only runs AFTER a file
    // exists, so it can only delete a duplicate that has already cost a fetch. Catching the
    // obvious collisions here — the same provider id, or the identical URL from two
    // providers — means the pool holds distinct pictures before we start spending downloads
    // on it. Cheap and conservative: it is not trying to be the perceptual deduper, only to
    // stop the same row appearing twice.
    const seenKeys = new Set();
    const deduped = [];
    for (const c of pool) {
      const key = c.id ? `${c.__provider}:${c.id}` : String(c.url || "").split("?")[0].toLowerCase();
      if (!key || seenKeys.has(key)) continue;
      seenKeys.add(key);
      deduped.push(c);
    }
    const collisions = pool.length - deduped.length;
    console.log(`[assets] pool for "${q}" (${type}): ${deduped.length} candidate(s) from ${tally.join(", ")}`
      + (collisions ? ` — ${collisions} cross-provider duplicate(s) dropped` : ""));

    // The provider module for a pooled candidate, so per-provider hooks (Unsplash's
    // download-tracking obligation) still resolve after the results have been merged.
    const providerByName = new Map(all.map((p) => [p.name, p]));
    {
      const candidates = deduped;

      // ONE RANKING AUTHORITY over the MERGED pool (services/asset_score): relevance to the
      // query and to the scene's own words, measured-or-declared quality, fit to the box's
      // contract, shape, subject presence, brand affinity and uniqueness — seven axes
      // summing to 100, with every sub-score kept.
      //
      // tRatio was computed only for `type === "image"`, so footage got no aspect signal at
      // all even though callers have always passed one — a portrait film could be handed a
      // landscape clip with nothing objecting.
      const tRatio = targetRatio
        || (orientation === "vertical" ? 9 / 16 : orientation === "square" ? 1 : 16 / 9);
      const ranked = util.rankCandidates(q, candidates, styleKeywords, tRatio, scoreCtx);
      for (const c of ranked.slice(0, LADDER_DEPTH)) {
        const providerName = c.__provider || "unknown";
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
              console.warn(`[assets] rejected "${q}" from ${providerName}: ${v.reason}`);
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
              console.warn(`[assets] rejected clip "${q}" from ${providerName}: ${v.reason}`);
              try { fs.unlinkSync(outputPath); } catch { /* noop */ }
              continue;
            }
            clipMeta = v.meta;
            await util.reencodeForHyperframes(outputPath);
          }
          // THE MEASURED PASS. The pool was ranked on what the providers DECLARED; this is the
          // one candidate whose pixels we actually have, so it is re-scored on them —
          // sharpness and information instead of a resolution proxy, the real dominant colour
          // instead of the provider's average, a true perceptual hash instead of a URL check.
          // The four ffmpeg passes this reads have already run inside validateImage, so a
          // pixel-accurate score costs one download rather than twenty.
          const measured = assetScore.rescoreMeasured({
            ...scoreCtx, query: q, candidate: c, provider: providerName,
            styleKeywords, targetRatio: tRatio, meta: imageMeta || clipMeta || null,
          });
          c.__score = measured.score;
          c.__parts = measured.parts;
          c.__reasons = measured.reasons;

          if (measured.score < bar) {
            // NOT a rejection — a demotion. The file is stashed as best-so-far and the ladder
            // moves on; if nothing better is ever found it comes back at the end. Returning
            // null here instead would ship a blank scene, and preflight hard-fails a film
            // whose critical placeholders are empty.
            console.log(`[assets] "${q}" from ${providerName} measured ${measured.score}/100 (bar ${bar}) — holding as fallback, trying the next candidate`);
            remember({
              score: measured.score, record: measured, provider: providerName, query: q,
              candidate: c, meta: imageMeta, clipMeta, license: c.license, sourceUrl: c.sourceUrl,
              rank: c.__rank, poolSize: c.__poolSize, fromCache: false,
            });
            continue;
          }

          // Awaited: `register` became async (streamed hash + async copy) and its
          // check-then-push must complete before this lane returns, or two lanes racing on the
          // same bytes can both append to the shared index.
          await localDb.register({
            filePath: outputPath, query: q, type, orientation,
            source: providerName, license: c.license, sourceUrl: c.sourceUrl,
            width: (imageMeta && imageMeta.width) || c.width, height: (imageMeta && imageMeta.height) || c.height,
            // Persist what validateImage already measured, so a cache hit is as
            // well-described as this download was (see local_db.materialize).
            ratio: imageMeta ? imageMeta.ratio : undefined,
            hasAlpha: imageMeta ? imageMeta.hasAlpha : undefined,
            dhash: imageMeta ? imageMeta.dhash : undefined,
            dominantColor: imageMeta ? imageMeta.dominantColor : undefined,
            // The retrieval score travels INTO the cache with the file. Without it a cache
            // hit re-enters the pipeline unscored, and once a selection threshold exists an
            // unscored cache hit is a free bypass around it.
            retrievalScore: Number.isFinite(c.__score) ? c.__score : undefined,
            retrievalParts: c.__parts || undefined,
            // Footage facts the cache has always accepted and never stored, so a cached clip
            // reached asset_quality's video branch with nothing to grade.
            ...(clipMeta ? {
              durationSec: clipMeta.durationSec, fps: clipMeta.fps,
              bitrateKbps: clipMeta.bitrateKbps, codec: clipMeta.codec,
            } : {}),
          });
          // LICENCE OBLIGATION, not an optimisation. Unsplash's API Guidelines require a ping
          // to the photo's download endpoint when it is actually used, and "used" means right
          // here — the file is downloaded, validated and about to be returned. Optional on the
          // provider contract (nobody else defines it), fire-and-forget, and wrapped because a
          // tracking side effect must never be able to fail a fetch.
          try {
            const pm = providerByName.get(providerName);
            if (pm && typeof pm.notifyDownload === "function") pm.notifyDownload(c);
          }
          catch { /* tracking is best-effort */ }
          console.log(`[assets] "${q}" (${type}) <- ${providerName} (${(imageMeta && imageMeta.width) || c.width || "?"}x${(imageMeta && imageMeta.height) || c.height || "?"})`
            + (Number.isFinite(c.__score) ? ` score ${c.__score}/100, rank ${c.__rank}/${c.__poolSize}` : ""));
          return withProvenance({
            path: outputPath, query: q, fromCache: false,
            source: providerName, license: c.license, sourceUrl: c.sourceUrl,
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
          }, { provider: providerName, candidate: c, bar });
        } catch (e) {
          console.warn(`[assets] ${providerName} candidate failed for "${q}": ${e.message}`);
        }
      }
    }
  }

  // NOTHING CLEARED THE BAR — SHIP THE BEST THING WE SAW.
  //
  // This is the difference between a threshold that improves films and one that breaks them.
  // Returning null because the best candidate scored 76 against a bar of 80 does not produce
  // a better video; it produces a video with an empty panel, and preflight's
  // `criticalPlaceholdersFilled` turns that into a hard failure on an authored plan. The
  // spec's own rule is the one implemented here: use a lower-scoring fallback only when the
  // search has genuinely been exhausted, AND RECORD THAT IT HAPPENED — `thresholdMissed` is
  // what makes the compromise auditable instead of invisible.
  if (best) {
    try { fs.copyFileSync(stashPath, outputPath); fs.unlinkSync(stashPath); }
    catch (e) { console.warn(`[assets] could not restore the best-available candidate: ${e.message}`); return null; }
    console.warn(`[assets] "${query}" (${type}): nothing reached ${bar}/100 after ${attemptQueries.length} query variant(s)`
      + ` — delivering the best available, ${best.score}/100 from ${best.provider || "cache"}`);
    const m = best.meta || {};
    return withProvenance({
      path: outputPath, query: best.query, fromCache: best.fromCache === true,
      source: best.fromCache ? `cache:${best.provider}` : best.provider,
      license: best.license, sourceUrl: best.sourceUrl,
      width: m.width, height: m.height, ratio: m.ratio != null ? m.ratio : null,
      hasAlpha: m.hasAlpha, dhash: m.dhash, dominantColor: m.dominantColor,
      sharpness: m.sharpness, stdev: m.stdev,
      ...(best.clipMeta ? {
        width: best.clipMeta.width, height: best.clipMeta.height, ratio: best.clipMeta.ratio,
        dhash: best.clipMeta.dhash, stdev: best.clipMeta.stdev,
        clipDurationSec: best.clipMeta.durationSec, fps: best.clipMeta.fps,
        bitrateKbps: best.clipMeta.bitrateKbps, codec: best.clipMeta.codec,
      } : {}),
      // The honest part. A consumer can now tell "this is the picture we wanted" from
      // "this is the picture we settled for", which no previous version of this code could.
      thresholdMissed: true,
    }, {
      provider: best.provider,
      candidate: { __score: best.score, __parts: best.record.parts, __rank: best.rank, __poolSize: best.poolSize },
      // Must ride the META, not the result literal: withProvenance sets `bar` explicitly
      // after spreading the result, so a `bar` on the object gets overwritten with null.
      bar,
    });
  }

  console.warn(`[assets] no asset found for "${query}" (${type}) after ${attemptQueries.length} query variant(s)`);
  return null;
}

module.exports = {
  acquire, hasProviderFor, localDb, STOCK_PROVIDERS,
  makeImageDeduper: util.makeImageDeduper,
  validateImage: util.validateImage,
  ffprobeImage: util.ffprobeImage,
};
