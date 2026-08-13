// asset_sources tests — the retrieval layer that had NO coverage at all.
//
//   node scripts/test-asset-sources.js          # unit: waterfall, ranking, dedup, shapes
//   node scripts/test-asset-sources.js --live   # + one real search per configured provider
//
// WHY THIS FILE EXISTS. `acquire()` is the single entrypoint for every fetched asset in the
// product (four call sites: graph.js, creative_director.js, pipeline.js, project_pipeline.js)
// and nothing tested it — not the 7-stage waterfall, not the 90-char query cap, not the
// "keep them if filtering would leave nothing" release valve, and not the cross-provider
// deduper. scripts/test-pixabay.js covers services/pixabay only, which is one rung of one stage.
//
// Everything here is OFFLINE: the network, ffmpeg and the fetch cache are stubbed by
// monkey-patching the module objects that index.js holds (it calls `util.download(...)` and
// `localDb.search(...)` as property lookups at call time, so replacing the property is enough).
// That is what makes the waterfall's ORDER testable without a single byte crossing the wire.

const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

let pass = 0, fail = 0;
function t(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { console.log(`  ✓ ${name}`); pass++; })
    .catch((e) => { console.log(`  ✗ ${name}\n      ${e.message}`); fail++; });
}

const util = require("../src/services/asset_sources/util");
const localDb = require("../src/services/asset_sources/local_db");
const sources = require("../src/services/asset_sources");
const { acquire } = sources;

// EVERY registered provider must appear here. A provider missing from this map keeps its
// REAL `search` and `available`, so the "offline" suite quietly makes live network calls —
// which is exactly what happened when unsplash was added: the tests hit the API, spent the
// hourly budget, and failed non-deterministically because a real provider out-scored the
// stubs. If a new provider is registered in asset_sources/index.js, add it here too.
const PROVIDER_MODULES = {
  pixabay: require("../src/services/asset_sources/pixabay_api"),
  pexels: require("../src/services/asset_sources/pexels"),
  unsplash: require("../src/services/asset_sources/unsplash"),
  openverse: require("../src/services/asset_sources/openverse"),
  pixabay_scrape: require("../src/services/asset_sources/pixabay_scrape"),
};

const TMP = path.join(os.tmpdir(), "keyframe-test-asset-sources");
fs.mkdirSync(TMP, { recursive: true });
const out = (n = "a.jpg") => path.join(TMP, n);

// ---- stub scaffolding -------------------------------------------------------------------
const REAL = {
  download: util.download, validateMedia: util.validateMedia, validateImage: util.validateImage,
  validateClip: util.validateClip, reencode: util.reencodeForHyperframes,
  search: localDb.search, materialize: localDb.materialize, register: localDb.register,
  providers: Object.fromEntries(Object.entries(PROVIDER_MODULES).map(([k, m]) => [k, { search: m.search, available: m.available }])),
};
function restore() {
  util.download = REAL.download; util.validateMedia = REAL.validateMedia;
  util.validateImage = REAL.validateImage; util.validateClip = REAL.validateClip;
  util.reencodeForHyperframes = REAL.reencode;
  localDb.search = REAL.search; localDb.materialize = REAL.materialize; localDb.register = REAL.register;
  for (const [k, m] of Object.entries(PROVIDER_MODULES)) { m.search = REAL.providers[k].search; m.available = REAL.providers[k].available; }
}

// A crisp, information-rich measurement — what validateImage returns for a good stock photo.
// Sharpness sits well inside the "crisp" half of the photo band (soft 120 / crisp 900) so a
// well-matched candidate clears the 80 bar on the measured pass; tests that need a MISS make
// the candidate miss on relevance or shape, which is what a real bad pick actually fails on.
const GOOD_META = { width: 1600, height: 900, ratio: 1.778, hasAlpha: false, dhash: "0f1e2d3c4b5a6978", stdev: 45, dominantColor: "#204060", sharpness: 800 };
// A candidate that will clear the default 80 bar: it says exactly what was searched for.
const onTopic = (url) => cand({ url, title: "analytics dashboard", w: 1920, h: 1080 });
const QUERY = "analytics dashboard";

// Neutralise the network, the filesystem probes and the fetch cache. Individual tests
// override the pieces they are actually about.
function stubAll({ validateImage } = {}) {
  util.download = async (url, outPath) => { fs.mkdirSync(path.dirname(outPath), { recursive: true }); fs.writeFileSync(outPath, `bytes:${url}`); return outPath; };
  util.validateMedia = async () => true;
  util.validateImage = validateImage || (async () => ({ ok: true, reason: null, meta: { ...GOOD_META } }));
  util.validateClip = async () => ({ ok: true, reason: null, meta: { ...GOOD_META, durationSec: 8, fps: 30, bitrateKbps: 2500, codec: "h264" } });
  util.reencodeForHyperframes = async () => {};
  localDb.search = () => [];
  localDb.register = async () => {};
  localDb.materialize = () => ({ source: "cache:pixabay", license: "Pixabay License", sourceUrl: "https://pixabay.com/x", width: 1600, height: 900 });
  // Every provider silent unless a test says otherwise; `available` forced true so the
  // walk's ORDER is what is under test, not whichever keys happen to be configured.
  for (const m of Object.values(PROVIDER_MODULES)) { m.search = async () => []; m.available = () => true; }
}

const cand = (o = {}) => ({
  url: o.url || "https://cdn.example/photo.jpg",
  width: o.w ?? 1920, height: o.h ?? 1080,
  title: o.title || "", tags: o.tags || "",
  license: o.license || "Test License", sourceUrl: o.sourceUrl || "https://example/page",
});

(async () => {
  // ---------------------------------------------------------------- query hygiene
  console.log("\nquery hygiene");
  await t("collapses whitespace and hard-caps the query at 90 chars", async () => {
    stubAll();
    const seen = [];
    PROVIDER_MODULES.pixabay.search = async ({ query }) => { seen.push(query); return []; };
    const messy = `  analytics   dashboard\n\tinterface  ${"x".repeat(200)}  `;
    await acquire({ query: messy, type: "image", outputPath: out() });
    assert.ok(seen.length, "provider was never asked");
    assert.ok(seen[0].length <= 90, `query was ${seen[0].length} chars, cap is 90`);
    assert.ok(!/\s\s/.test(seen[0]), "whitespace was not collapsed");
    assert.ok(seen[0].startsWith("analytics dashboard interface"), `unexpected query: ${seen[0]}`);
  });

  await t("query variants that normalize to the same string are asked once", async () => {
    stubAll();
    const seen = [];
    PROVIDER_MODULES.pixabay.search = async ({ query }) => { seen.push(query); return []; };
    await acquire({ query: "data charts", fallbackQueries: ["data   charts", " data charts "], type: "image", outputPath: out() });
    assert.strictEqual(seen.length, 1, `asked ${seen.length} times for one distinct query`);
  });

  // ---------------------------------------------------------------- ranking
  console.log("\nranking");
  await t("a candidate whose text matches the query outranks one that does not", () => {
    const ranked = util.rankCandidates("analytics dashboard", [
      cand({ url: "https://x/off.jpg", title: "a dog on a beach" }),
      cand({ url: "https://x/hit.jpg", title: "analytics dashboard with charts" }),
    ]);
    assert.strictEqual(ranked[0].url, "https://x/hit.jpg");
  });

  await t("RELEASE VALVE: when every candidate is under the resolution floor they are kept", () => {
    const tiny = [cand({ url: "https://x/a.jpg", w: 400, h: 300 }), cand({ url: "https://x/b.jpg", w: 320, h: 240 })];
    const ranked = util.rankCandidates("anything", tiny);
    assert.strictEqual(ranked.length, 2, "a filled scene beats an empty one — these must survive");
  });

  await t("the resolution floor still applies when something clears it", () => {
    const mixed = [cand({ url: "https://x/small.jpg", w: 400, h: 300 }), cand({ url: "https://x/big.jpg", w: 1920, h: 1080 })];
    const ranked = util.rankCandidates("anything", mixed);
    assert.strictEqual(ranked.length, 1);
    assert.strictEqual(ranked[0].url, "https://x/big.jpg");
  });

  await t("unknown dimensions are exempt from the floor, never punished as zero", () => {
    const unknown = [cand({ url: "https://x/u.jpg", w: 0, h: 0 }), cand({ url: "https://x/big.jpg", w: 1920, h: 1080 })];
    const ranked = util.rankCandidates("anything", unknown);
    assert.strictEqual(ranked.length, 2, "openverse/pixabay_scrape return null dimensions and must stay eligible");
  });

  await t("candidates without a url are dropped", () => {
    const ranked = util.rankCandidates("q", [{ width: 1920, height: 1080 }, cand()]);
    assert.strictEqual(ranked.length, 1);
  });

  await t("aspect fit breaks a relevance tie toward the target shape", () => {
    const portrait = cand({ url: "https://x/tall.jpg", w: 1080, h: 1920, title: "analytics dashboard" });
    const landscape = cand({ url: "https://x/wide.jpg", w: 1920, h: 1080, title: "analytics dashboard" });
    const forTall = util.rankCandidates("analytics dashboard", [landscape, portrait], null, 9 / 16);
    const forWide = util.rankCandidates("analytics dashboard", [portrait, landscape], null, 16 / 9);
    assert.strictEqual(forTall[0].url, "https://x/tall.jpg", "9:16 target should prefer the tall frame");
    assert.strictEqual(forWide[0].url, "https://x/wide.jpg", "16:9 target should prefer the wide frame");
  });

  // ---------------------------------------------------------------- waterfall order
  console.log("\nwaterfall order");
  await t("a GOOD fetch-cache hit short-circuits every provider", async () => {
    stubAll();
    let asked = 0;
    for (const m of Object.values(PROVIDER_MODULES)) m.search = async () => { asked++; return [onTopic("https://x/p.jpg")]; };
    localDb.search = () => [{ id: "cached-1", query: QUERY, source: "pixabay", stdev: 45, sharpness: 800 }];
    localDb.materialize = () => ({ source: "cache:pixabay", license: "L", width: 1920, height: 1080, ratio: 1.778, dhash: "aa", dominantColor: "#204060" });
    const r = await acquire({ query: QUERY, type: "image", outputPath: out("cache.jpg") });
    assert.ok(r, "cache hit returned nothing");
    assert.strictEqual(r.fromCache, true);
    assert.strictEqual(asked, 0, "a cache hit that clears the bar must still be the fast path");
  });

  await t("A CACHE HIT THAT MISSES THE BAR IS NOT A FREE PASS", async () => {
    stubAll();
    let asked = 0;
    // The cache holds a SQUARE image; the want is a 16:9 hero. Before this, hits[0] was
    // returned unconditionally — no ranking, no aspect check, no score — and the film got
    // the square one instantly. Observed live on a real run of this very feature.
    localDb.search = () => [{ id: "cached-sq", query: "something else entirely", source: "pixabay" }];
    localDb.materialize = () => ({ source: "cache:pixabay", license: "L", width: 1280, height: 1280, ratio: 1, dhash: "bb" });
    PROVIDER_MODULES.pexels.search = async () => { asked++; return [onTopic("https://x/fresh.jpg")]; };
    const r = await acquire({ query: QUERY, type: "image", outputPath: out("cache2.jpg"), targetRatio: 16 / 9 });
    assert.ok(asked > 0, "the providers must be consulted when the cached candidate misses the bar");
    assert.strictEqual(r.fromCache, false, "the fresh, better-matched picture must win");
    assert.strictEqual(r.provider, "pexels");
  });

  await t("curatedOnly refuses web stock AND the cache", async () => {
    stubAll();
    let asked = 0;
    for (const m of Object.values(PROVIDER_MODULES)) m.search = async () => { asked++; return [cand()]; };
    localDb.search = () => [{ id: "cached-1" }];
    const r = await acquire({ query: "team meeting", type: "image", outputPath: out("c2.jpg"), curatedOnly: true });
    assert.strictEqual(r, null);
    assert.strictEqual(asked, 0);
  });

  await t("EVERY provider is asked CONCURRENTLY for the same query", async () => {
    stubAll();
    const asked = [];
    let inFlight = 0, maxInFlight = 0;
    for (const [nm, m] of Object.entries(PROVIDER_MODULES)) {
      if (nm === "pixabay_scrape") continue;             // last-resort, tested separately
      m.search = async () => {
        asked.push(nm); inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 15));
        inFlight--;
        return [cand({ url: `https://x/${nm}.jpg` })];
      };
    }
    await acquire({ query: "startup office", type: "image", outputPath: out("p.jpg") });
    assert.ok(asked.length >= 3, `only ${asked.length} provider(s) asked — the fan-out did not fan out`);
    assert.ok(maxInFlight > 1, "providers ran one after another; they must overlap");
  });

  await t("the BEST pooled candidate wins, not whoever answered first", async () => {
    stubAll();
    // pixabay is first in the order and answers with something off-topic; pexels answers
    // with the picture the scene actually asked for. Sequentially, pixabay won by position.
    PROVIDER_MODULES.pixabay.search = async () => [cand({ url: "https://x/pix.jpg", title: "a golden retriever on a beach" })];
    PROVIDER_MODULES.pexels.search = async () => [cand({ url: "https://x/pex.jpg", title: "an analytics dashboard with charts" })];
    const r = await acquire({ query: "analytics dashboard", type: "image", outputPath: out("best.jpg") });
    assert.strictEqual(r.provider, "pexels", "the on-topic candidate must win regardless of provider order");
    assert.ok(r.poolSize >= 2, `the pool should hold both candidates, got ${r.poolSize}`);
  });

  await t("A LAST-RESORT PROVIDER STAYS OUT of the fan-out until the pool is empty", async () => {
    stubAll();
    let scrapeCalls = 0;
    PROVIDER_MODULES.pixabay_scrape.search = async () => { scrapeCalls++; return [cand({ url: "https://x/scrape.jpg" })]; };
    PROVIDER_MODULES.pexels.search = async () => [cand({ url: "https://x/pex.jpg" })];
    await acquire({ query: "startup office", type: "image", outputPath: out("lr1.jpg") });
    assert.strictEqual(scrapeCalls, 0, "the scraper launches a browser per search — it must not join a concurrent fan-out");

    // ...and IS reached when nothing else answered.
    for (const [nm, m] of Object.entries(PROVIDER_MODULES)) if (nm !== "pixabay_scrape") m.search = async () => [];
    const r = await acquire({ query: "startup office", type: "image", outputPath: out("lr2.jpg") });
    assert.strictEqual(scrapeCalls, 1, "the last resort must still be a resort");
    assert.strictEqual(r.provider, "pixabay_scrape");
  });

  await t("the same picture from two providers is pooled once", async () => {
    stubAll();
    PROVIDER_MODULES.pixabay.search = async () => [cand({ url: "https://cdn.shared/same.jpg", title: "office" })];
    PROVIDER_MODULES.pexels.search = async () => [cand({ url: "https://cdn.shared/same.jpg?auto=compress", title: "office" })];
    PROVIDER_MODULES.openverse.search = async () => [cand({ url: "https://cdn.other/different.jpg", title: "office" })];
    const r = await acquire({ query: "office", type: "image", outputPath: out("dedup.jpg") });
    assert.strictEqual(r.poolSize, 2, `the identical url should collapse to one entry, pool was ${r.poolSize}`);
  });

  await t("ONE PROVIDER FAILING MUST NOT END THE SEARCH", async () => {
    stubAll();
    PROVIDER_MODULES.pixabay.search = async () => { throw new Error("HTTP 429 rate limited"); };
    PROVIDER_MODULES.pexels.search = async () => [cand({ url: "https://x/pex.jpg" })];
    const r = await acquire({ query: "startup office", type: "image", outputPath: out("f.jpg") });
    assert.ok(r, "a throwing provider took the whole acquire down");
    assert.strictEqual(r.source, "pexels");
  });

  await t("an empty provider falls through to the next one", async () => {
    stubAll();
    PROVIDER_MODULES.pixabay.search = async () => [];
    PROVIDER_MODULES.pexels.search = async () => [cand({ url: "https://x/pex.jpg" })];
    const r = await acquire({ query: "startup office", type: "image", outputPath: out("e.jpg") });
    assert.strictEqual(r.source, "pexels");
  });

  await t("a candidate rejected by validateImage falls through to the next candidate", async () => {
    let n = 0;
    stubAll({
      validateImage: async () => {
        n++;
        return n === 1
          ? { ok: false, reason: "low-information image (stdev 1.2)", meta: { ...GOOD_META, stdev: 1.2 } }
          : { ok: true, reason: null, meta: { ...GOOD_META } };
      },
    });
    PROVIDER_MODULES.pixabay.search = async () => [
      cand({ url: "https://x/flat.jpg", title: "match" }),
      cand({ url: "https://x/real.jpg", title: "match" }),
    ];
    const r = await acquire({ query: "match", type: "image", outputPath: out("r.jpg") });
    assert.ok(r, "the ladder gave up instead of trying candidate 2");
    assert.strictEqual(n, 2, "the second candidate was never validated");
  });

  await t("no provider anywhere yields anything -> null, not a throw", async () => {
    stubAll();
    const r = await acquire({ query: "nothing at all", type: "image", outputPath: out("n.jpg") });
    assert.strictEqual(r, null);
  });

  // ---------------------------------------------------------------- return shapes
  console.log("\nreturn shapes");
  await t("a provider hit carries path/source/license/dimensions and fromCache=false", async () => {
    stubAll();
    PROVIDER_MODULES.pixabay.search = async () => [cand({ url: "https://x/a.jpg", license: "Pixabay License", sourceUrl: "https://pixabay.com/photos/a-1/" })];
    const r = await acquire({ query: "office", type: "image", outputPath: out("s.jpg") });
    for (const k of ["path", "query", "source", "license", "sourceUrl", "width", "height", "ratio", "dhash", "sharpness", "stdev"]) {
      assert.ok(k in r, `missing "${k}" on the provider return shape`);
    }
    assert.strictEqual(r.fromCache, false);
    assert.strictEqual(r.width, GOOD_META.width, "measured dimensions must win over the provider's declared ones");
  });

  await t("a cache hit is as well-described as a fresh download", async () => {
    stubAll();
    localDb.search = () => [{ id: "cached-1", query: QUERY, source: "pixabay", stdev: 45, sharpness: 800 }];
    localDb.materialize = () => ({ source: "cache:pixabay", license: "L", width: 1920, height: 1080, ratio: 1.778, dhash: "aa", dominantColor: "#204060" });
    const r = await acquire({ query: QUERY, type: "image", outputPath: out("s2.jpg") });
    assert.strictEqual(r.fromCache, true);
    for (const k of ["path", "query", "source", "width", "height"]) assert.ok(k in r, `missing "${k}" on the cache return shape`);
  });

  // ---------------------------------------------------------------- score survival
  console.log("\nscore survival");
  await t("rankCandidates annotates each candidate instead of discarding its score", () => {
    const ranked = util.rankCandidates("analytics dashboard", [
      cand({ url: "https://x/hit.jpg", title: "analytics dashboard charts", w: 1920, h: 1080 }),
      cand({ url: "https://x/off.jpg", title: "a dog on a beach", w: 1920, h: 1080 }),
    ], null, 16 / 9);
    for (const c of ranked) {
      assert.ok(Number.isFinite(c.__score), "every candidate needs a __score");
      assert.ok(c.__score >= 0 && c.__score <= 100, `__score must be 0..100, got ${c.__score}`);
      for (const axis of ["relevance", "quality", "sceneCompat", "aspect", "subject", "brand", "uniqueness"]) {
        assert.ok(c.__parts && axis in c.__parts, `__parts must break the score down by "${axis}"`);
      }
      assert.strictEqual(c.__poolSize, 2);
    }
    assert.strictEqual(ranked[0].__rank, 1);
    assert.ok(ranked[0].__score > ranked[1].__score, "the on-topic candidate must score higher");
    assert.ok(ranked[0].url, "must still be a bare candidate — callers read c.url");
  });

  await t("a provider hit carries provider + retrievalScore + retrievalParts", async () => {
    stubAll();
    PROVIDER_MODULES.pexels.search = async () => [cand({ url: "https://x/a.jpg", title: "analytics dashboard" })];
    const r = await acquire({ query: "analytics dashboard", type: "image", outputPath: out("pv.jpg") });
    assert.strictEqual(r.provider, "pexels");
    assert.ok(Number.isFinite(r.retrievalScore), "retrievalScore must reach the caller");
    assert.ok(r.retrievalParts, "retrievalParts must reach the caller");
    assert.strictEqual(r.candidateRank, 1);
    assert.strictEqual(r.poolSize, 1);
  });

  await t("provider is distinct from source, and survives a cache hit", async () => {
    stubAll();
    localDb.search = () => [{ id: "c1", query: QUERY, source: "pexels", stdev: 45, sharpness: 800 }];
    localDb.materialize = () => ({ source: "cache:pexels", license: "Pexels License", width: 1920, height: 1080, ratio: 1.778, dhash: "aa" });
    const r = await acquire({ query: QUERY, type: "image", outputPath: out("cp.jpg") });
    assert.strictEqual(r.source, "cache:pexels", "source stays tier-bearing and unchanged");
    assert.strictEqual(r.provider, "pexels", "provider must name who supplied the pixels");
  });

  await t("a cache hit is scored against THIS want, not replayed from its original query", async () => {
    stubAll();
    // The entry claims a great score from whatever it was originally fetched for. That score
    // is not transferable: the same picture is a different answer to a different question.
    localDb.search = () => [{ id: "c1", query: "a golden retriever on a beach", source: "pixabay", retrievalScore: 99 }];
    localDb.materialize = () => ({ source: "cache:pixabay", license: "L", width: 1920, height: 1080, ratio: 1.778 });
    PROVIDER_MODULES.pexels.search = async () => [onTopic("https://x/fresh.jpg")];
    const r = await acquire({ query: QUERY, type: "image", outputPath: out("cs.jpg") });
    assert.notStrictEqual(r.retrievalScore, 99, "a stale score from another query must not be replayed");
    assert.strictEqual(r.provider, "pexels", "the genuinely on-topic picture must win");
  });

  await t("the score and the footage facts are handed to the cache on write", async () => {
    stubAll();
    let registered = null;
    localDb.register = async (rec) => { registered = rec; };
    PROVIDER_MODULES.pexels.search = async () => [onTopic("https://x/a.jpg")];
    await acquire({ query: QUERY, type: "image", outputPath: out("cw.jpg") });
    assert.ok(registered, "register was never called");
    assert.ok(Number.isFinite(registered.retrievalScore), "the cache must store the score it was given");
  });

  // ---------------------------------------------------------------- the threshold
  console.log("\nthe selection bar");
  await t("a candidate that clears the bar is taken immediately", async () => {
    stubAll();
    PROVIDER_MODULES.pexels.search = async () => [onTopic("https://x/good.jpg")];
    const r = await acquire({ query: QUERY, type: "image", outputPath: out("bar1.jpg") });
    assert.ok(r.retrievalScore >= 80, `expected >=80, got ${r.retrievalScore}`);
    assert.ok(!r.thresholdMissed, "a clearing candidate must not be flagged as a compromise");
  });

  await t("NOTHING GOOD ENOUGH STILL SHIPS A PICTURE, flagged as a compromise", async () => {
    stubAll();
    // Every candidate is off-topic, so none can reach 80 — the film must still get an image.
    for (const m of Object.values(PROVIDER_MODULES)) {
      m.search = async () => [cand({ url: "https://x/off.jpg", title: "a golden retriever on a beach" })];
    }
    const r = await acquire({ query: QUERY, type: "image", outputPath: out("bar2.jpg") });
    assert.ok(r, "returning null here ships a blank scene and hard-fails preflight");
    assert.strictEqual(r.thresholdMissed, true, "the compromise must be recorded, not hidden");
    assert.strictEqual(r.bar, 80);
    assert.ok(r.retrievalScore < 80);
    assert.ok(fs.existsSync(r.path), "the best-available file must actually be restored on disk");
  });

  await t("a decorative box accepts what a hero box would reject", async () => {
    stubAll();
    const mid = () => [cand({ url: "https://x/mid.jpg", title: "dashboard", w: 1920, h: 1080 })];
    for (const m of Object.values(PROVIDER_MODULES)) m.search = mid;
    const hero = await acquire({ query: QUERY, type: "image", outputPath: out("bar3.jpg"), requirement: { priority: "critical" } });
    const decor = await acquire({ query: QUERY, type: "image", outputPath: out("bar4.jpg"), requirement: { priority: "low" } });
    assert.strictEqual(hero.bar, 80);
    assert.ok(!decor.thresholdMissed, "the same picture should satisfy a decorative slot");
    assert.ok(hero.thresholdMissed, "and fall short of a hero slot");
  });

  await t("REFINEMENT SHORTENS, NEVER LENGTHENS — the 90-char cap is never approached", async () => {
    stubAll();
    const asked = [];
    for (const m of Object.values(PROVIDER_MODULES)) {
      m.search = async ({ query }) => { asked.push(query); return [cand({ url: "https://x/off.jpg", title: "unrelated seascape" })]; };
    }
    const long = "camera slowly pans across a modern analytics dashboard interface";
    await acquire({ query: long, type: "image", outputPath: out("ref.jpg") });
    assert.ok(asked.length > 1, "a failing want must trigger at least one refinement lap");
    for (const q of asked) {
      assert.ok(q.length <= 90, `query grew past the cap: ${q.length} chars`);
      assert.ok(q.length <= long.length, `refinement LENGTHENED the query: "${q}"`);
    }
  });

  // ---------------------------------------------------------------- cross-provider dedup
  console.log("\ncross-provider dedup");
  const fileWith = (name, bytes) => { const p = path.join(TMP, name); fs.writeFileSync(p, bytes); return p; };

  await t("byte-identical files from two providers are caught as exact duplicates", async () => {
    const d = util.makeImageDeduper();
    const a = fileWith("dup-a.bin", "IDENTICAL PICTURE BYTES");
    const b = fileWith("dup-b.bin", "IDENTICAL PICTURE BYTES");
    assert.strictEqual(await d.check(a, "1111111111111111"), null, "first sighting is not a duplicate");
    assert.strictEqual(await d.check(b, "2222222222222222"), "exact", "same bytes from another provider must be caught");
  });

  await t("a visually-identical re-encode is caught perceptually", async () => {
    const d = util.makeImageDeduper();
    await d.check(fileWith("p-a.bin", "A"), "0f1e2d3c4b5a6978");
    // One bit different — far inside the hamming<=10 threshold.
    assert.strictEqual(await d.check(fileWith("p-b.bin", "B"), "0f1e2d3c4b5a6979"), "perceptual");
  });

  await t("a genuinely different picture is not flagged", async () => {
    const d = util.makeImageDeduper();
    await d.check(fileWith("q-a.bin", "A"), "0000000000000000");
    assert.strictEqual(await d.check(fileWith("q-b.bin", "B"), "ffffffffffffffff"), null);
  });

  await t("seeding decides collisions: an added asset beats a later checked one", async () => {
    const d = util.makeImageDeduper();
    const owned = fileWith("own.bin", "THE USER OWN UPLOAD");
    const stock = fileWith("stock.bin", "THE USER OWN UPLOAD");
    await d.add(owned, "0f1e2d3c4b5a6978");           // tier-first seeding, as graph.js does
    assert.strictEqual(await d.check(stock, "0f1e2d3c4b5a6978"), "exact", "the stock copy must lose to the seeded upload");
  });

  restore();

  // ---------------------------------------------------------------- live
  if (process.argv.includes("--live")) {
    console.log("\nlive (network)");
    const config = require("../src/config");
    for (const name of (config.assetProviders?.order || [])) {
      const mod = PROVIDER_MODULES[name];
      if (!mod) { console.log(`  - ${name}: not registered, skipped`); continue; }
      if (mod.available && !mod.available()) { console.log(`  - ${name}: no key, skipped`); continue; }
      await t(`${name} returns usable image candidates`, async () => {
        const r = await mod.search({ query: "analytics dashboard", type: "image", orientation: "horizontal", limit: 5 });
        assert.ok(Array.isArray(r), "search must resolve an array");
        assert.ok(r.length > 0, "no candidates returned");
        assert.ok(r.every((c) => /^https?:/.test(c.url)), "every candidate needs a downloadable http(s) url");
      });
    }
  }

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { restore(); console.error(e); process.exit(1); });
