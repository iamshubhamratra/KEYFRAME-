// Pixabay service tests. Pure/offline by default; add --live to also hit the real API.
//
//   node scripts/test-pixabay.js          # unit: mapping, validation, ranking, cache, retry
//   node scripts/test-pixabay.js --live   # + a real search and a key probe
//
// The offline half stubs `fetch`, so retry/backoff/dedup/rate-limit are testable without
// network flakiness deciding whether the suite passes.

const assert = require("node:assert");

let pass = 0, fail = 0;
function t(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { console.log(`  ✓ ${name}`); pass++; })
    .catch((e) => { console.log(`  ✗ ${name}\n      ${e.message}`); fail++; });
}

const mapper = require("../src/services/pixabay/mapper");
const validator = require("../src/services/pixabay/validator");
const ranking = require("../src/services/pixabay/ranking");
const cache = require("../src/services/pixabay/cache");
const pixabay = require("../src/services/pixabay");

const imgHit = (o = {}) => ({
  id: o.id || 101, tags: o.tags || "office, laptop, startup",
  fullHDURL: o.url || "https://cdn.pixabay.com/x_1920.jpg",
  largeImageURL: "https://cdn.pixabay.com/x_1280.jpg",
  previewURL: "https://cdn.pixabay.com/x_150.jpg",
  imageWidth: o.w ?? 1920, imageHeight: o.h ?? 1280,
  downloads: o.downloads ?? 5000, likes: o.likes ?? 100, views: o.views ?? 20000,
  pageURL: "https://pixabay.com/photos/x-101/",
});

(async () => {
  console.log("\nmapping");
  await t("image maps to the normalized Asset and prefers fullHD", () => {
    const a = mapper.mapImage(imgHit());
    assert.strictEqual(a.provider, "pixabay");
    assert.strictEqual(a.type, "image");
    assert.ok(a.url.includes("1920"), "should prefer fullHDURL");
    assert.strictEqual(a.width, 1920);
    assert.deepStrictEqual(a.tags, ["office", "laptop", "startup"]);
    assert.strictEqual(a.duration, null, "stills must carry null duration, not undefined");
  });
  await t("video picks the largest rendition by declared width", () => {
    const a = mapper.mapVideo({
      id: 7, tags: "team", duration: 12,
      videos: { tiny: { url: "t.mp4", width: 640 }, large: { url: "l.mp4", width: 1920 }, medium: { url: "m.mp4", width: 1280 } },
    });
    assert.strictEqual(a.url, "l.mp4");
    assert.strictEqual(a.width, 1920);
    assert.strictEqual(a.duration, 12);
  });
  await t("bridge audio payload maps into the same envelope", () => {
    const a = mapper.mapAudio({ mp3Url: "https://cdn.pixabay.com/audio/abc123.mp3", pageTitle: "Corporate" }, "music");
    assert.strictEqual(a.type, "music");
    assert.strictEqual(a.provider, "pixabay");
    assert.ok(a.url.endsWith(".mp3"));
  });

  console.log("\nvalidation");
  await t("rejects a non-http url", () => {
    assert.strictEqual(validator.validate(mapper.mapImage(imgHit({ url: "data:image/png;base64,AAA" }))).ok, false);
  });
  await t("rejects an undersized image with a stated reason", () => {
    const v = validator.validate(mapper.mapImage(imgHit({ w: 320, h: 200 })));
    assert.strictEqual(v.ok, false);
    assert.match(v.reason, /width 320/);
  });
  await t("unknown dimensions are NOT rejected", () => {
    const a = mapper.mapImage(imgHit()); a.width = null; a.height = null;
    assert.strictEqual(validator.validate(a).ok, true);
  });
  await t("a decisive orientation mismatch is rejected, a near-square is not", () => {
    const wide = mapper.mapImage(imgHit({ w: 1920, h: 1080 }));
    const squarish = mapper.mapImage(imgHit({ w: 1200, h: 1100 }));
    assert.strictEqual(validator.validate(wide, { orientation: "vertical" }).ok, false);
    assert.strictEqual(validator.validate(squarish, { orientation: "vertical" }).ok, true);
  });
  await t("an sfx longer than 30s is a bed, not a cue", () => {
    const a = mapper.mapAudio({ mp3Url: "https://x/y.mp3", pageTitle: "hum" }, "sfx");
    a.duration = 45;
    assert.strictEqual(validator.validate(a).ok, false);
  });

  console.log("\nranking");
  await t("tag relevance outranks raw popularity", () => {
    const relevant = mapper.mapImage(imgHit({ id: 1, tags: "startup, office", downloads: 100 }));
    const popular  = mapper.mapImage(imgHit({ id: 2, tags: "sunset, beach", downloads: 900000, likes: 50000 }));
    const [top] = ranking.rank([popular, relevant], { query: "startup office" });
    assert.strictEqual(top.id, "1", "the on-topic asset must win");
  });
  await t("portrait target prefers a portrait asset", () => {
    const port = mapper.mapImage(imgHit({ id: 1, w: 1080, h: 1920 }));
    const land = mapper.mapImage(imgHit({ id: 2, w: 1920, h: 1080 }));
    const [top] = ranking.rank([land, port], { query: "office", orientation: "vertical" });
    assert.strictEqual(top.id, "1");
  });
  await t("music covering the film beats a shorter track", () => {
    const long = mapper.mapAudio({ mp3Url: "https://x/a.mp3", pageTitle: "corporate" }, "music"); long.duration = 90;
    const short = mapper.mapAudio({ mp3Url: "https://x/b.mp3", pageTitle: "corporate" }, "music"); short.duration = 12;
    const [top] = ranking.rank([short, long], { query: "corporate", durationSec: 60 });
    assert.strictEqual(top.duration, 90);
  });
  await t("scores are absolute 0..100, so a floor means the same on every query", () => {
    const a = ranking.rank([mapper.mapImage(imgHit())], { query: "office laptop" })[0];
    assert.ok(a.score >= 0 && a.score <= 100, `got ${a.score}`);
  });

  console.log("\ncache");
  await t("key is order-independent", () => {
    assert.strictEqual(cache.keyFor("x", { a: 1, b: 2 }), cache.keyFor("x", { b: 2, a: 1 }));
  });
  await t("stores, hits, and expires", async () => {
    await cache.clear();
    const k = cache.keyFor("t", { q: "office" });
    await cache.set(k, { hits: [1] }, 50);
    assert.ok(await cache.get(k), "should hit before TTL");
    await new Promise((r) => setTimeout(r, 70));
    assert.strictEqual(await cache.get(k), null, "should miss after TTL");
  });

  console.log("\nclient: retry, dedup, rate limit");
  const client = require("../src/services/pixabay/client");
  const realFetch = global.fetch;
  const ok = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => "" });

  await t("a 400 is NOT retried (bad key or bad params — retrying wastes the budget)", async () => {
    let calls = 0;
    global.fetch = async () => { calls++; return { ok: false, status: 400, text: async () => "[ERROR 400] Invalid API key." }; };
    await assert.rejects(() => client.getJson("https://pixabay.com/api/", { q: "x1" }), /Invalid API key/);
    assert.strictEqual(calls, 1, `expected 1 call, got ${calls}`);
  });
  await t("a 5xx IS retried and can succeed", async () => {
    let calls = 0;
    global.fetch = async () => {
      calls++;
      return calls < 3 ? { ok: false, status: 503, text: async () => "busy" } : ok({ hits: [imgHit()] });
    };
    const body = await client.getJson("https://pixabay.com/api/", { q: "x2" });
    assert.strictEqual(body.hits.length, 1);
    assert.strictEqual(calls, 3);
  });
  await t("identical concurrent queries share ONE request", async () => {
    let calls = 0;
    global.fetch = async () => { calls++; await new Promise((r) => setTimeout(r, 30)); return ok({ hits: [] }); };
    await Promise.all([
      client.getJson("https://pixabay.com/api/", { q: "dedupe" }),
      client.getJson("https://pixabay.com/api/", { q: "dedupe" }),
      client.getJson("https://pixabay.com/api/", { q: "dedupe" }),
    ]);
    assert.strictEqual(calls, 1, `expected 1 upstream call, got ${calls}`);
  });
  await t("the key never appears in a thrown message", async () => {
    global.fetch = async () => { throw new Error("fetch failed"); };
    const err = await client.getJson("https://pixabay.com/api/", { q: "x3" }).catch((e) => e);
    assert.ok(!/key=[A-Za-z0-9-]{10,}/.test(err.message), "error text must not leak the key");
  });
  global.fetch = realFetch;

  console.log("\nservice");
  await t("no keywords yields a stated error, never a throw", async () => {
    const r = await pixabay.searchImages({ keywords: [] });
    assert.deepStrictEqual(r.assets, []);
    assert.match(r.error, /no keywords/);
  });
  await t("seeded keyword pick is deterministic and varies by seed", () => {
    const list = ["a", "b", "c", "d", "e"];
    const p = (seed) => pixabay.__test.seededPick(list, 2, seed).join();
    assert.strictEqual(p("job1"), p("job1"), "same seed must repeat");
    assert.notStrictEqual(p("job1"), p("job2"), "different seeds should differ");
  });

  if (process.argv.includes("--live")) {
    console.log("\nlive (network)");
    await t("probeKey reports a usable key", async () => {
      const p = await pixabay.probeKey();
      assert.ok(p.ok, `key probe failed: ${p.reason}`);
    });
    await t("a real multi-keyword search returns ranked assets", async () => {
      const r = await pixabay.searchImages({ keywords: ["startup office", "team laptop"], orientation: "vertical", limit: 6 });
      assert.ok(r.assets.length > 0, `no assets: ${r.error || "empty"}`);
      assert.ok(r.assets[0].score >= r.assets[r.assets.length - 1].score, "must be sorted best-first");
      assert.ok(r.assets.every((a) => /^https?:/.test(a.url)));
    });
    await t("the second identical search is served from cache", async () => {
      await pixabay.clearCache();
      await pixabay.searchImages({ keywords: ["coding desk"], limit: 3 });
      const second = await pixabay.searchImages({ keywords: ["coding desk"], limit: 3 });
      assert.strictEqual(second.cached, true);
    });
  }

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
