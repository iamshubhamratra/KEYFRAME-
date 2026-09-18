// Unit tests for video_edit/broll retrieval: raw provider mappers, token buckets, search cache, query
// filter and searchSlot / searchStock.
// Run: node scripts/video_edit_broll_search.test.cjs
//      VIDEO_EDIT_BROLL_LIVE=1 node scripts/video_edit_broll_search.test.cjs   (adds ~5 free stock API calls)
//
// Load-bearing: mappers keep every rendition, duration, strip pictures and credits; only commercial-safe
// Openverse licences survive; 401 → config breaker, 429 → breaker honouring Retry-After and the next
// provider's results are used; everything down → an EMPTY slot with notices, never a throw; a cached
// page costs zero requests; acronyms like "AI" survive query cleaning. Offline: every request goes to
// an injected fake fetch serving recorded-shape fixtures, and the global fetch is a tripwire.

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { createHarness, mkTmp, makeSettings, installFetchTripwire } = require("./lib/video_edit_test_utils.cjs");

const tmp = mkTmp("ve-broll-search-");
process.env.VIDEO_EDIT_DIR = path.join(tmp.dir, "_guard", "edits");
process.env.VIDEO_EDIT_INDEX = path.join(tmp.dir, "_guard", "video-edits.json");

const LIVE = process.env.VIDEO_EDIT_BROLL_LIVE === "1";
const realFetch = globalThis.fetch;

const pexels = require("../src/video_edit/broll/providers/pexels_raw");
const pixabay = require("../src/video_edit/broll/providers/pixabay_raw");
const openverse = require("../src/video_edit/broll/providers/openverse_raw");
const { createTokenBucket, getLimiter, resetLimiters } = require("../src/video_edit/broll/rate_limit");
const { createSearchCache, resetCaches } = require("../src/video_edit/broll/search_cache");
const { cleanQuery, prepareQueries } = require("../src/video_edit/broll/query_filter");
const { resolveRetrievalSettings } = require("../src/video_edit/broll/defaults");
const { searchSlot, searchStock, searchSlots, orientationForAspect, coverLoss } = require("../src/video_edit/broll/search");
const { getBreaker, resetBreakers } = require("../src/video_edit/providers/breaker");
const { subjectQuery } = require("../src/services/asset_sources/query_terms");
const { isEditError } = require("../src/video_edit/errors");

const { t, section, run } = createHarness();
// AbortSignal.timeout timers are unref'd; with a fake fetch that only settles on abort nothing else would
// keep the loop alive and the process would exit mid-test with exit code 0.
const keepAlive = setInterval(() => {}, 1000);
const restoreFetch = installFetchTripwire();
const tripwire = globalThis.fetch;
let globalFetchCalls = 0;
globalThis.fetch = (...args) => { globalFetchCalls++; return tripwire(...args); };

const KEYS = Object.freeze({ pexels: "test-pexels-key", pixabay: "test-pixabay-key" });
const FX_DIR = path.join(__dirname, "fixtures", "video_edit_broll");
// Retrieval fixtures carry a `search_` prefix: the scoring tests share this directory and own the bare names.
const FX = (name) => JSON.parse(fs.readFileSync(path.join(FX_DIR, `search_${name}`), "utf8"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function json(obj, { status = 200, headers = {} } = {}) {
  return new Response(typeof obj === "string" ? obj : JSON.stringify(obj), { status, headers: { "content-type": "application/json", ...headers } });
}

function routeKey(u) {
  if (u.hostname === "api.pexels.com") return u.pathname.startsWith("/videos") ? "pexels_video" : "pexels_image";
  if (u.hostname === "pixabay.com") return u.pathname.startsWith("/api/videos") ? "pixabay_video" : "pixabay_image";
  if (u.hostname === "api.openverse.org") return "openverse_image";
  return "unknown";
}

const FIXTURE_FOR = {
  pexels_video: "pexels_videos.json", pexels_image: "pexels_photos.json",
  pixabay_video: "pixabay_videos.json", pixabay_image: "pixabay_images.json", openverse_image: "openverse_images.json",
};

function fakeFetch(handler) {
  const calls = [];
  const fn = async (url, init = {}) => {
    const u = new URL(url);
    calls.push({ url: u, route: routeKey(u), headers: init.headers || {}, signal: init.signal });
    return handler(u, init, calls);
  };
  fn.calls = calls;
  fn.count = (needle) => calls.filter((c) => c.url.hostname.includes(needle)).length;
  fn.of = (route) => calls.filter((c) => c.route === route);
  return fn;
}

function stdRoutes(overrides = {}) {
  return fakeFetch((u, init) => {
    const key = routeKey(u);
    if (overrides[key]) return overrides[key](u, init);
    if (!FIXTURE_FOR[key]) return json({ error: "no route" }, { status: 404 });
    return json(FX(FIXTURE_FOR[key]));
  });
}

const hangingFetch = () => fakeFetch((u, init) => new Promise((_, reject) => {
  init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
}));

let envSeq = 0;
function env(name) {
  resetBreakers();
  resetLimiters();
  resetCaches();
  const root = path.join(tmp.dir, `${name}-${++envSeq}`);
  const settings = makeSettings(root);
  return { root, settings, projectDir: path.join(root, "proj") };
}

async function rejects(p, code, cls) {
  try { await (typeof p === "function" ? p() : p); } catch (e) {
    assert.ok(isEditError(e), `expected EditError ${code}, got ${e && e.stack}`);
    assert.equal(e.code, code, `expected ${code}, got ${e.code}`);
    if (cls) assert.equal(e.errorClass, cls, `expected class ${cls}, got ${e.errorClass}`);
    return e;
  }
  throw new Error(`expected rejection with ${code}`);
}

const pictureNr = (u) => Number(/preview-(\d+)/.exec(u)[1]);

// ---------------------------------------------------------------------------------------------
section("providers — mapper fidelity (recorded-shape fixtures)");

t("pexels videos: mp4 renditions sorted by size, HLS / stream-only dropped, ordered pictures + 25/50/75 strip, credits", async () => {
  const f = stdRoutes();
  const r = await pexels.search({ query: "laptop", kind: "video", orientation: "portrait", perPage: 15, page: 1, fetch: f, apiKey: "k-pex" });
  assert.equal(r.items.length, 2);
  assert.deepEqual(r.rejected, { malformed: 1 }, "the stream-only video has no mp4 rendition");
  assert.equal(r.total, 3);
  const v = r.items[0];
  assert.equal(v.provider, "pexels");
  assert.equal(v.providerId, "3129671");
  assert.equal(v.key, "pexels:3129671");
  assert.equal(v.type, "video");
  assert.deepEqual(v.renditions.map((x) => [x.width, x.height]), [[360, 640], [540, 960], [1080, 1920], [2160, 3840]]);
  assert.ok(v.renditions.every((x) => x.fileType === "video/mp4" && x.url.startsWith("https://videos.pexels.com/")));
  assert.deepEqual([v.renditions[2].quality, v.renditions[2].fps, v.renditions[2].sizeBytes], ["hd", 25, 9823412]);
  assert.deepEqual([v.width, v.height, v.durationSec, v.fps], [1080, 1920, 14, 25]);
  assert.deepEqual(v.pictures.map(pictureNr), [0, 1, 2, 3, 4], "pictures ordered by nr");
  assert.deepEqual(v.strip.map(pictureNr), [1, 2, 3]);
  assert.deepEqual(r.items[1].strip.map(pictureNr), [0, 1, 2], "three pictures give three distinct strip frames");
  assert.ok(v.thumbnail.startsWith("https://images.pexels.com/videos/3129671/"));
  assert.equal(v.thumbs.length, 6, "thumbs = poster + every video picture (ANALYSIS.md §8)");
  assert.equal(v.thumbs[0], v.thumbnail);
  assert.equal(v.text, "woman typing on a laptop", "the page slug is the only text Pexels gives a video");
  assert.equal(v.pageUrl, "https://www.pexels.com/video/woman-typing-on-a-laptop-3129671/");
  assert.deepEqual(v.author, { name: "Cottonbro Studio", url: "https://www.pexels.com/@cottonbro" });
  assert.deepEqual([v.license, v.licenseCode, v.attributionRequired], ["Pexels License", "pexels", false]);
  assert.equal(v.attribution, "Video by Cottonbro Studio on Pexels");
  assert.deepEqual(r.items.map((x) => x.rank), [1, 2]);
  assert.ok(r.items[1].fps > 29.9 && r.items[1].fps < 30);

  const req = f.calls[0];
  assert.equal(req.url.pathname, "/videos/search");
  assert.deepEqual(["query", "orientation", "per_page", "page"].map((k) => req.url.searchParams.get(k)), ["laptop", "portrait", "15", "1"]);
  assert.equal(req.headers.Authorization, "k-pex");

  const p2 = await pexels.search({ query: "laptop", kind: "video", perPage: 15, page: 2, fetch: stdRoutes(), apiKey: "k-pex" });
  assert.deepEqual(p2.items.map((x) => x.rank), [16, 17], "rank continues across pages");
});

t("pexels photos: computed rendition sizes, alt text, avg colour, photographer credit", async () => {
  const f = stdRoutes();
  const r = await pexels.search({ query: "laptop", kind: "image", orientation: "landscape", fetch: f, apiKey: "k-pex" });
  assert.equal(f.calls[0].url.pathname, "/v1/search");
  assert.equal(f.calls[0].url.searchParams.get("orientation"), "landscape");
  const [a, b] = r.items;
  assert.equal(a.type, "image");
  assert.deepEqual(a.renditions.map((x) => [x.quality, x.width, x.height]), [
    ["small", 87, 130], ["medium", 233, 350], ["large", 433, 650], ["large2x", 867, 1300], ["original", 4000, 6000],
  ]);
  assert.deepEqual(b.renditions.find((x) => x.quality === "large").width, 940);
  assert.equal(a.alt, "Woman Using Laptop");
  assert.ok(a.text.includes("woman using laptop"));
  assert.equal(a.avgColor, "#8A8A88");
  assert.equal(a.attribution, "Photo by Christina Morillo on Pexels");
  assert.equal(a.author.url, "https://www.pexels.com/@divinetechygirl");
  assert.equal(a.durationSec, null);
  assert.ok(a.thumbnail.includes("h=350"), "contact-sheet thumbnail is the 350 px rendition");
});

t("pixabay videos: every rendition with its thumbnail, empty 'large' skipped, tags, duration, uploader credit, no orientation param", async () => {
  const f = stdRoutes();
  const r = await pixabay.search({ query: "laptop", kind: "video", orientation: "portrait", perPage: 20, fetch: f, apiKey: "k-pix" });
  const req = f.calls[0].url;
  assert.equal(req.pathname, "/api/videos/");
  assert.deepEqual(["key", "q", "per_page", "page", "safesearch", "video_type"].map((k) => req.searchParams.get(k)), ["k-pix", "laptop", "20", "1", "true", "film"]);
  assert.equal(req.searchParams.has("orientation"), false, "Pixabay has no video orientation filter");
  const [a, b] = r.items;
  assert.deepEqual(a.renditions.map((x) => [x.quality, x.width, x.height]), [["tiny", 640, 360], ["small", 960, 540], ["medium", 1280, 720], ["large", 1920, 1080]]);
  assert.ok(a.renditions.every((x) => x.thumbnail && x.thumbnail.endsWith(".jpg") && x.sizeBytes > 0));
  assert.ok(a.thumbnail.endsWith("_medium.jpg"));
  assert.deepEqual(a.tags, ["flowers", "yellow", "blossom"]);
  // pixabay_raw CONTRACT: `text` = page-slug words NOT already in the tags (counting them twice made every
  // Pixabay tag hit look perfect in BM25-lite).
  assert.equal(a.text, "", "the 'id-125' slug adds nothing");
  assert.deepEqual([a.width, a.height, a.durationSec], [1920, 1080, 12]);
  assert.equal(a.attribution, "Video by Coverr-Free-Footage from Pixabay");
  assert.equal(a.author.url, "https://pixabay.com/users/Coverr-Free-Footage-1281706/");
  assert.equal(a.license, "Pixabay Content License");
  assert.equal(a.previewUrl, a.renditions[0].url);
  assert.deepEqual(a.strip, null);
  assert.equal(b.renditions.length, 3, "an empty large rendition is not a rendition");
  assert.deepEqual([b.width, b.height, b.durationSec], [1080, 1920, 9]);
  assert.equal(b.text, "", "a slug made of the tags adds nothing either");
  const extra = pixabay.mapVideo({ id: 7, tags: "laptop, desk", pageURL: "https://pixabay.com/videos/laptop-desk-morning-coffee-7/",
    videos: { tiny: { url: "https://cdn.pixabay.com/v/7_tiny.mp4", width: 640, height: 360, size: 10, thumbnail: "https://cdn.pixabay.com/v/7_tiny.jpg" } } });
  assert.equal(extra.text, "morning coffee", "only slug words beyond the tags");
  assert.equal(b.author.url, "https://pixabay.com/users/Mikes%20Photography-7654321/");
});

t("pixabay images: preview / webformat / large / fullHD renditions with real dimensions, photo type + orientation", async () => {
  const f = stdRoutes();
  const r = await pixabay.search({ query: "office", kind: "image", orientation: "portrait", fetch: f, apiKey: "k-pix" });
  const req = f.calls[0].url;
  assert.equal(req.pathname, "/api/");
  assert.deepEqual([req.searchParams.get("image_type"), req.searchParams.get("orientation")], ["photo", "vertical"]);
  const [a, b] = r.items;
  assert.deepEqual(a.renditions.map((x) => [x.quality, x.width, x.height, x.fileType]), [
    ["preview", 150, 99, "image/jpeg"], ["webformat", 640, 426, "image/jpeg"], ["large", 1280, 853, "image/jpeg"],
  ]);
  assert.deepEqual(b.renditions.map((x) => [x.quality, x.width, x.height, x.fileType]), [
    ["preview", 100, 150, "image/png"], ["webformat", 427, 640, "image/png"], ["large", 853, 1280, "image/png"], ["fullhd", 1280, 1920, "image/png"],
  ]);
  assert.equal(a.attribution, "Image by Pexels from Pixabay");
  assert.deepEqual([a.width, a.height], [5184, 3456]);
  assert.ok(a.thumbnail.endsWith("_640.jpg"));
});

t("openverse: only CC0 / PDM / CC BY / CC BY-SA survive — NC, ND, NC-SA and mature are rejected; attribution kept", async () => {
  const f = stdRoutes();
  // ANALYSIS.md §1/§8: Openverse searches `license=cc0,by` by default; BY-SA and PDM are operator opt-ins
  // (openverse_raw CONTRACT: DEFAULT_LICENSES, COMMERCIAL_SAFE is the ceiling).
  const d = await openverse.search({ query: "laptop", orientation: "landscape", perPage: 50, fetch: f });
  const req = f.calls[0].url;
  assert.deepEqual(["page_size", "license", "category", "mature", "aspect_ratio"].map((k) => req.searchParams.get(k)), ["20", "cc0,by", "photograph", "false", null],
    "category + aspect_ratio together returned zero live results, so a category request leaves orientation to ranking");
  assert.equal(new URL(openverse.buildRequest({ query: "x", orientation: "landscape", category: null }).url).searchParams.get("aspect_ratio"), "wide");
  assert.deepEqual(d.items.map((x) => x.providerId.slice(-1)), ["1", "2"]);
  assert.deepEqual(d.rejected, { license: 5, mature: 1, malformed: 0 }, "by-sa and pdm are not allowed by default");
  // Operator opt-in up to the commercial-safe ceiling; NC / ND stay out even when asked for.
  const r = await openverse.search({ query: "laptop", orientation: "landscape", perPage: 50, fetch: f, licenses: ["cc0", "pdm", "by", "by-sa", "by-nc"] });
  assert.equal(f.calls[1].url.searchParams.get("license"), "cc0,pdm,by,by-sa");
  assert.deepEqual(r.items.map((x) => x.providerId.slice(-1)), ["1", "2", "3", "4"]);
  assert.deepEqual(r.rejected, { license: 3, mature: 1, malformed: 0 });
  const [by, cc0, bysa, pdm] = r.items;
  assert.deepEqual([bysa.shareAlike, pdm.clearance, by.shareAlike, by.clearance], [true, "label", false, "license"]);
  assert.deepEqual([by.license, by.licenseCode, by.licenseUrl, by.attributionRequired], ["CC BY 2.0", "by", "https://creativecommons.org/licenses/by/2.0/", true]);
  assert.ok(by.attribution.startsWith("\"Laptop on desk\" by Jane Doe is licensed under CC BY 2.0"));
  assert.deepEqual(by.author, { name: "Jane Doe", url: "https://www.flickr.com/photos/janedoe" });
  assert.deepEqual(by.tags, ["laptop", "desk"]);
  assert.deepEqual(by.renditions.map((x) => [x.quality, x.width, x.height]), [["thumbnail", null, null], ["original", 1024, 683]]);
  assert.deepEqual([by.source, by.pageUrl], ["flickr", "https://www.flickr.com/photos/janedoe/5121234567/"]);
  assert.deepEqual([cc0.license, cc0.attributionRequired, cc0.width], ["CC0 1.0", false, null]);
  assert.equal(cc0.attribution, "\"Office workspace\" is marked with CC0 1.0.");
  assert.deepEqual([bysa.license, bysa.attributionRequired], ["CC BY-SA 4.0", true]);
  assert.deepEqual([pdm.license, pdm.renditions[1].fileType], ["Public Domain Mark 1.0", "image/png"]);
  for (const [code, ok] of [["by-nc", false], ["by-nd", false], ["by-nc-sa", false], ["sampling+", false], ["cc0", true], ["by", true], ["BY-SA", false], ["pdm", false]]) {
    assert.equal(openverse.licenseAllowed(code), ok, `default ${code}`);
  }
  for (const [code, ok] of [["by-nc", false], ["by-nd", false], ["by-nc-sa", false], ["sampling+", false], ["cc0", true], ["BY-SA", true], ["pdm", true]]) {
    assert.equal(openverse.licenseAllowed(code, openverse.COMMERCIAL_SAFE), ok, `opt-in ${code}`);
  }
});

t("orientation follows the output aspect for every provider; cover loss ranks misfits", () => {
  const cases = [["9:16", "portrait", "vertical", "tall"], ["16:9", "landscape", "horizontal", "wide"], ["1:1", "square", "all", "square"]];
  for (const [aspect, pex, pixImg, ov] of cases) {
    const o = orientationForAspect(aspect);
    assert.equal(o, pex, aspect);
    assert.equal(new URL(pexels.buildRequest({ query: "x", kind: "video", orientation: o }).url).searchParams.get("orientation"), pex);
    assert.equal(new URL(pexels.buildRequest({ query: "x", kind: "image", orientation: o }).url).searchParams.get("orientation"), pex);
    assert.equal(new URL(pixabay.buildRequest({ query: "x", kind: "image", orientation: o }).url).searchParams.get("orientation"), pixImg);
    assert.equal(new URL(pixabay.buildRequest({ query: "x", kind: "video", orientation: o }).url).searchParams.has("orientation"), false);
    assert.equal(new URL(openverse.buildRequest({ query: "x", orientation: o, category: null }).url).searchParams.get("aspect_ratio"), ov);
    assert.equal(new URL(openverse.buildRequest({ query: "x", orientation: o }).url).searchParams.has("aspect_ratio"), false);
  }
  assert.equal(orientationForAspect(null), null);
  assert.equal(orientationForAspect("4:5"), "portrait");
  assert.ok(coverLoss(1920, 1080, 9 / 16) > 0.6);
  assert.equal(coverLoss(1080, 1920, 9 / 16), 0);
  assert.equal(coverLoss(null, 1080, 1), null);
});

t("errors are classified: 401 config · 429 transient + Retry-After · 5xx transient · bad key 400 config · other 400 input · timeout · abort · network", async () => {
  const status = (code, body = "", headers = {}) => fakeFetch(() => new Response(body, { status: code, headers }));
  await rejects(pexels.search({ query: "x", fetch: status(401), apiKey: "k" }), "STOCK_AUTH", "config");
  await rejects(pexels.search({ query: "x", fetch: status(403), apiKey: "k" }), "STOCK_AUTH", "config");
  const e429 = await rejects(pexels.search({ query: "x", fetch: status(429, "{}", { "Retry-After": "30" }), apiKey: "k" }), "STOCK_RATE_LIMITED", "transient");
  assert.deepEqual([e429.extra.retryAfterSec, e429.extra.httpStatus, e429.extra.provider], [30, 429, "pexels"]);
  const reset = Math.floor(Date.now() / 1000) + 120;
  const eReset = await rejects(pexels.search({ query: "x", fetch: status(429, "{}", { "X-Ratelimit-Remaining": "0", "X-Ratelimit-Reset": String(reset) }), apiKey: "k" }), "STOCK_RATE_LIMITED");
  assert.ok(eReset.extra.retryAfterSec >= 118 && eReset.extra.retryAfterSec <= 121, `reset-derived retryAfter ${eReset.extra.retryAfterSec}`);
  await rejects(pixabay.search({ query: "x", fetch: status(503), apiKey: "k2secret" }), "STOCK_HTTP", "transient");
  const badKey = await rejects(pixabay.search({ query: "x", fetch: status(400, "[ERROR 400] Invalid API key. Note: This value is case-sensitive."), apiKey: "k2secret" }), "STOCK_AUTH", "config");
  assert.ok(!JSON.stringify({ m: badKey.message, d: badKey.detail, x: badKey.extra }).includes("k2secret"), "a key never rides in an error");
  await rejects(pixabay.search({ query: "x", fetch: status(400, "[ERROR 400] \"q\" exceeds the maximum length of 100 characters."), apiKey: "k" }), "STOCK_BAD_QUERY", "input");
  await rejects(openverse.search({ query: "x", fetch: status(200, "<html>oops</html>") }), "STOCK_BAD_RESPONSE", "provider");
  await rejects(openverse.search({ query: "x", fetch: hangingFetch(), timeoutMs: 40 }), "STOCK_TIMEOUT", "transient");
  const ac = new AbortController();
  const pending = openverse.search({ query: "x", fetch: hangingFetch(), signal: ac.signal, timeoutMs: 5000 });
  setTimeout(() => ac.abort(), 10);
  await rejects(pending, "CANCELLED", "cancelled");
  await rejects(openverse.search({ query: "x", fetch: fakeFetch(() => { throw new TypeError("fetch failed"); }) }), "STOCK_NETWORK", "transient");
  await rejects(pexels.search({ query: "x", fetch: status(200, "{}") }), "STOCK_UNCONFIGURED", "config");
});

// ---------------------------------------------------------------------------------------------
section("rate limiter — process-wide token buckets");

t("FIFO order, spacing once the burst is spent, concurrency cap, process-wide instances", async () => {
  const b = createTokenBucket({ name: "fifo", capacity: 2, windowMs: 200 });
  const t0 = Date.now();
  const order = [];
  await Promise.all([1, 2, 3, 4].map((i) => b.acquire().then((rel) => { order.push([i, Date.now() - t0]); rel(); })));
  assert.deepEqual(order.map((o) => o[0]), [1, 2, 3, 4]);
  assert.ok(order[1][1] < 60, `burst served at once (${order[1][1]}ms)`);
  assert.ok(order[2][1] >= 80, `third waits for a refill (${order[2][1]}ms)`);
  assert.ok(order[3][1] >= 170, `fourth waits for another (${order[3][1]}ms)`);

  const c = createTokenBucket({ name: "conc", capacity: 10, windowMs: 1000, concurrency: 1 });
  const relA = await c.acquire();
  let bIn = false;
  const pb = c.acquire().then((rel) => { bIn = true; return rel; });
  await sleep(20);
  assert.equal(bIn, false);
  assert.deepEqual([c.state().waiting, c.state().active], [1, 1]);
  relA();
  relA(); // idempotent
  (await pb)();
  assert.equal(bIn, true);
  assert.equal(c.state().active, 0);

  // rate_limit CONTRACT: one process-wide bucket per name; a changed capacity/window/concurrency reconfigures it
  // in place (tokens clamped to the new capacity); a call without cfg leaves it as is.
  const x = getLimiter("stock_x", { capacity: 3 });
  assert.strictEqual(x, getLimiter("stock_x", { capacity: 99 }));
  assert.equal(getLimiter("stock_x").capacity, 99, "a changed configuration reconfigures the shared bucket");
  getLimiter("stock_x", { capacity: 2 });
  assert.ok(x.state().tokens <= 2 && x.capacity === 2, "tokens clamped to the new capacity");
});

t("an aborted waiter leaves the line, maxWaitMs gives up, penalize pauses the bucket", async () => {
  const b = createTokenBucket({ name: "abort", capacity: 1, windowMs: 300 });
  (await b.acquire())();
  const served = [];
  const ac = new AbortController();
  const p2 = b.acquire({ signal: ac.signal }).then(() => served.push(2), (e) => served.push(`x2:${e.code}`));
  const p3 = b.acquire().then((rel) => { served.push(3); rel(); });
  assert.equal(b.state().waiting, 2);
  ac.abort();
  await p2;
  assert.deepEqual(served, ["x2:CANCELLED"]);
  assert.equal(b.state().waiting, 1);
  await p3;
  assert.deepEqual(served, ["x2:CANCELLED", 3]);
  await rejects(b.acquire({ signal: AbortSignal.abort() }), "CANCELLED", "cancelled");

  const starved = createTokenBucket({ name: "starved", capacity: 1, windowMs: 60000 });
  (await starved.acquire())();
  const w = await rejects(starved.acquire({ maxWaitMs: 30 }), "RATE_LIMIT_WAIT", "transient");
  assert.equal(w.extra.provider, "starved");
  assert.equal(starved.state().waiting, 0);

  const paused = createTokenBucket({ name: "paused", capacity: 5, windowMs: 1000 });
  paused.penalize(Date.now() + 120);
  const t0 = Date.now();
  (await paused.acquire())();
  assert.ok(Date.now() - t0 >= 100, `penalized bucket waited ${Date.now() - t0}ms`);
});

// ---------------------------------------------------------------------------------------------
section("search cache — 24 h shared pages");

t("keys ignore case/spacing, hits within TTL, empty pages expire sooner, no query text on disk", () => {
  const dir = path.join(tmp.dir, "cache-ttl");
  let clock = Date.now();
  const c = createSearchCache({ dir, now: () => clock, ttlMs: 1000, emptyTtlMs: 100 });
  const parts = { provider: "pexels", kind: "video", query: "City Traffic", orientation: "portrait", page: 1, perPage: 15 };
  assert.equal(c.get(parts), null);
  assert.equal(c.set(parts, { items: [{ key: "pexels:1" }] }), true);
  assert.deepEqual(c.get({ ...parts, query: "  city   traffic " }), { items: [{ key: "pexels:1" }] });
  assert.equal(c.get({ ...parts, page: 2 }), null);
  assert.equal(c.get({ ...parts, orientation: "landscape" }), null);
  assert.equal(c.get({ ...parts, provider: "pixabay" }), null);
  const files = fs.readdirSync(dir).filter((n) => n.endsWith(".json"));
  assert.equal(files.length, 1);
  assert.match(files[0], /^[0-9a-f]{40}\.json$/);
  assert.ok(!fs.readFileSync(path.join(dir, files[0]), "utf8").toLowerCase().includes("traffic"), "only the hash of the query is stored");
  const empty = { ...parts, query: "nothing here" };
  c.set(empty, { items: [] }, { empty: true });
  clock += 150;
  assert.equal(c.get(empty), null, "empty page expired after emptyTtl");
  assert.ok(c.get(parts), "non-empty page still fresh");
  clock += 1000;
  assert.equal(c.get(parts), null, "expired after ttl");
  assert.ok(c.stats().hits >= 2 && c.stats().misses >= 5);
});

t("LRU sweep keeps the entry cap, evicting the least recently used entry first", () => {
  const dir = path.join(tmp.dir, "cache-lru");
  let clock = Date.now();
  const c = createSearchCache({ dir, maxEntries: 3, sweepEvery: 1, now: () => (clock += 1000) });
  const p = (q) => ({ provider: "pixabay", kind: "image", query: q, orientation: "square", page: 1, perPage: 20 });
  c.set(p("a"), { items: ["a"] });
  c.set(p("b"), { items: ["b"] });
  c.set(p("c"), { items: ["c"] });
  assert.ok(c.get(p("a")), "touch a");
  c.set(p("d"), { items: ["d"] });
  assert.equal(fs.readdirSync(dir).filter((n) => n.endsWith(".json")).length, 3);
  assert.equal(c.get(p("b")), null, "b was least recently used");
  for (const q of ["a", "c", "d"]) assert.ok(c.get(p(q)), q);
});

// ---------------------------------------------------------------------------------------------
section("query filter");

t("subjectQuery keeps whitelisted acronyms (AI, 5G, B2B, SaaS), strips direction words, ignores ambiguous 'it'", () => {
  assert.equal(subjectQuery("AI chip"), "chip", "why the wrapper exists");
  assert.equal(cleanQuery("AI robot arm moving smoothly"), "AI robot arm");
  assert.equal(cleanQuery("ai chip factory"), "AI chip factory");
  assert.equal(cleanQuery("5G tower at night"), "5G tower night");
  assert.equal(cleanQuery("b2b saas dashboard"), "B2B SaaS dashboard");
  assert.equal(cleanQuery("camera pans quickly"), "");
  assert.equal(cleanQuery("put it on the desk"), "put desk");
  // query_filter CONTRACT: maxTerms=3 — over the cap, the leading terms plus the HEAD noun (last term).
  assert.equal(cleanQuery("vr headset VR headset gaming arcade"), "VR headset arcade");
  assert.equal(cleanQuery("vr headset VR headset gaming arcade", { maxTerms: 4 }), "VR headset gaming arcade");
  const qs = prepareQueries(["AI chip", { text: "ai CHIP", kind: "scene" }, "", "camera zoom", { text: "server rack", kind: "scene" }, "cloud data", "extra words"], { max: 3 });
  assert.deepEqual(qs.map((q) => [q.text, q.kind]), [["AI chip", "visual_noun"], ["server rack", "scene"], ["cloud data", "visual_noun"]]);
});

t("settings overrides: settings.broll / settings.videoEdit.broll overlay defaults; bad types ignored", () => {
  const s = resolveRetrievalSettings({ broll: { maxRawPerSlot: 10, perPage: { pexels: "lots" }, providers: { video: ["pixabay", "openverse", "bogus"] } } });
  assert.equal(s.maxRawPerSlot, 10);
  assert.equal(s.perPage.pexels, 15);
  assert.deepEqual(s.providers.video, ["pixabay"], "openverse has no video; unknown providers dropped");
  assert.equal(resolveRetrievalSettings({ videoEdit: { broll: { allowImages: false } } }).allowImages, false);
  // ANALYSIS.md §8: Pexels token bucket 180/h, Pixabay 90/60 s (10 % under the provider limits).
  assert.equal(resolveRetrievalSettings(null).rateLimits.pexels.capacity, 180);
  assert.equal(resolveRetrievalSettings(null).rateLimits.pixabay.capacity, 90);
});

// ---------------------------------------------------------------------------------------------
section("searchSlot — SEARCHING_BROLL retrieval");

t("slot search: queries cleaned (AI kept), providers merged, deduped across queries, fitting orientation first, written to analysis/broll_raw", async () => {
  const e = env("slot");
  const f = stdRoutes();
  const tracker = { ext: {}, addExternal(n) { this.ext[n] = (this.ext[n] || 0) + 1; } };
  const res = await searchSlot({
    slot: { slotId: "sl_s3", sentenceId: "s3", queries: ["AI robot arm moving smoothly", "laptop typing", "camera pans quickly", "laptop typing"], mediaPreference: "video" },
    output: { aspect: "9:16" }, settings: e.settings, fetch: f, keys: KEYS, projectDir: e.projectDir, tracker,
  });
  assert.deepEqual(res.queries.map((q) => q.text), ["AI robot arm", "laptop typing"]);
  assert.deepEqual(res.items.map((x) => x.key), ["pexels:3129671", "pixabay:190424", "pixabay:125", "pexels:856973"], "fitting portrait items first, round-robin order kept");
  assert.deepEqual(res.items.map((x) => x.orientationMatch), [true, true, false, false]);
  assert.deepEqual(res.items.map((x) => x.searchRank), [1, 2, 3, 4]);
  assert.deepEqual(res.items[0].queries, ["AI robot arm", "laptop typing"], "a duplicate records every query that found it");
  assert.deepEqual(res.counts, { raw: 8, duplicates: 4, unique: 4, orientationMismatch: 2, kept: 4 });
  assert.deepEqual([res.providers.pexels.status, res.providers.pexels.calls, res.providers.pixabay.status], ["ok", 2, "ok"]);
  assert.equal(res.providers.openverse, undefined, "no image fallback when video exists");
  assert.deepEqual([res.fallbackUsed, res.kinds, res.notices], [false, ["video"], []]);
  assert.deepEqual(res.stats, { fetches: 4, cacheHits: 0 });
  assert.deepEqual(tracker.ext, { pexels_search: 2, pixabay_search: 2 });
  assert.ok(f.of("pexels_video").every((c) => c.url.searchParams.get("orientation") === "portrait" && c.headers.Authorization === KEYS.pexels));
  assert.ok(f.of("pixabay_video").every((c) => !c.url.searchParams.has("orientation") && c.url.searchParams.get("key") === KEYS.pixabay));
  assert.deepEqual(f.of("pexels_video").map((c) => c.url.searchParams.get("query")), ["AI robot arm", "laptop typing"]);
  assert.equal(res.path, "analysis/broll_raw/sl_s3.json");
  const onDisk = JSON.parse(fs.readFileSync(path.join(e.projectDir, "analysis", "broll_raw", "sl_s3.json"), "utf8"));
  assert.deepEqual([onDisk.slotId, onDisk.sentenceId, onDisk.items.length, onDisk.output.orientation], ["sl_s3", "s3", 4, "portrait"]);
  assert.ok(!JSON.stringify(onDisk).includes(KEYS.pixabay), "no key is persisted");
});

t("429 + Retry-After opens the Pexels breaker; Pixabay's results are used and later queries skip Pexels", async () => {
  const e = env("429");
  const f = stdRoutes({ pexels_video: () => json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": "30" } }) });
  const res = await searchSlot({
    slot: { slotId: "sl_a", queries: ["laptop", "office desk", "robot"], mediaPreference: "video" },
    output: { aspect: "16:9" }, settings: e.settings, fetch: f, keys: KEYS, cache: false,
  });
  assert.equal(f.count("pexels"), 1, "the breaker spared Pexels for the next queries");
  assert.equal(f.count("pixabay"), 3);
  const st = getBreaker("stock_pexels").state();
  assert.equal(st.state, "open");
  assert.ok(st.openUntil - Date.now() > 25000 && st.openUntil - Date.now() <= 30500, `open for Retry-After (${st.openUntil - Date.now()}ms)`);
  assert.ok(getLimiter("stock_pexels").state().pausedUntil > Date.now() + 20000, "the bucket is paused too");
  assert.deepEqual(res.items.map((x) => x.key), ["pixabay:125", "pixabay:190424"]);
  assert.deepEqual([res.providers.pexels.status, res.providers.pexels.errors[0].code], ["error", "STOCK_RATE_LIMITED"]);
  const codes = res.notices.map((n) => `${n.code}:${n.provider}`);
  assert.deepEqual(codes, ["BROLL_PROVIDER_UNAVAILABLE:pexels"]);
});

t("Pexels 401 opens the config breaker for an hour; the slot and the next slot still get Pixabay items", async () => {
  const e = env("401");
  const f = stdRoutes({ pexels_video: () => json({ error: "Unauthorized" }, { status: 401 }) });
  const common = { output: { aspect: "9:16" }, settings: e.settings, fetch: f, keys: KEYS, cache: false };
  const res = await searchSlot({ ...common, slot: { slotId: "sl_a", queries: ["laptop", "desk"], mediaPreference: "video" } });
  assert.equal(f.count("pexels"), 1);
  const st = getBreaker("stock_pexels").state();
  assert.equal(st.state, "open");
  assert.ok(st.openUntil - Date.now() > 59 * 60 * 1000, "config errors open for an hour");
  assert.equal(res.providers.pexels.status, "key_rejected");
  assert.deepEqual(res.notices.map((n) => [n.code, n.severity, n.provider]), [["BROLL_PROVIDER_REJECTED", "warn", "pexels"]]);
  assert.ok(!res.notices[0].message.includes(KEYS.pexels));
  assert.equal(res.items.length, 2);
  const res2 = await searchSlot({ ...common, slot: { slotId: "sl_b", queries: ["office"], mediaPreference: "video" } });
  assert.equal(f.count("pexels"), 1, "the next slot never asks Pexels");
  assert.equal(res2.providers.pexels.status, "breaker_open");
  assert.equal(res2.items.length, 2);
});

t("every provider down → empty slot with notices after the image fallback (Openverse tried), never a throw", async () => {
  const e = env("down");
  const f = fakeFetch(() => json({ error: "unavailable" }, { status: 503 }));
  const res = await searchSlot({
    slot: { slotId: "sl_down", sentenceId: "s9", queries: ["laptop"], mediaPreference: "video" },
    output: { aspect: "9:16" }, settings: e.settings, fetch: f, keys: KEYS, cache: false, projectDir: e.projectDir,
  });
  assert.deepEqual(res.items, []);
  assert.deepEqual([res.fallbackUsed, res.kinds], [true, ["video", "image"]]);
  assert.deepEqual([f.count("pexels"), f.count("pixabay"), f.count("openverse")], [2, 2, 1]);
  const codes = res.notices.map((n) => `${n.code}:${n.provider}`);
  assert.deepEqual(codes, [
    "BROLL_PROVIDER_UNAVAILABLE:pexels", "BROLL_PROVIDER_UNAVAILABLE:pixabay", "BROLL_PROVIDER_UNAVAILABLE:openverse", "BROLL_SEARCH_UNAVAILABLE:null",
  ]);
  assert.ok(fs.existsSync(path.join(e.projectDir, "analysis", "broll_raw", "sl_down.json")));

  const net = fakeFetch(() => { throw new TypeError("fetch failed"); });
  const res2 = await searchSlot({ slot: { slotId: "sl_net", queries: ["desk"] }, output: { aspect: "1:1" }, settings: e.settings, fetch: net, keys: KEYS, cache: false });
  assert.deepEqual(res2.items, []);
  assert.ok(res2.notices.some((n) => n.code === "BROLL_SEARCH_UNAVAILABLE"));
});

t("image fallback: a video slot with no video uses Pexels → Pixabay → Openverse images; without keys Openverse still answers", async () => {
  const e = env("fallback");
  const f = stdRoutes({ pexels_video: () => json({ videos: [], total_results: 0 }), pixabay_video: () => json({ hits: [], totalHits: 0 }) });
  const res = await searchSlot({ slot: { slotId: "sl_img", queries: ["laptop"], mediaPreference: "video" }, output: { aspect: "9:16" }, settings: e.settings, fetch: f, keys: KEYS, cache: false });
  assert.equal(res.fallbackUsed, true);
  // 2 Pexels + 2 Pixabay photos + the 2 Openverse results under the default cc0,by licences (ANALYSIS.md §8).
  assert.ok(res.items.length === 6 && res.items.every((x) => x.type === "image"));
  assert.deepEqual([...new Set(res.items.map((x) => x.provider))].sort(), ["openverse", "pexels", "pixabay"]);
  assert.deepEqual(res.notices, [], "empty video results are not an outage");

  const e2 = env("nokeys");
  const f2 = stdRoutes();
  const res2 = await searchSlot({ slot: { slotId: "sl_nk", queries: ["laptop"], mediaPreference: "video" }, output: { aspect: "16:9" }, settings: e2.settings, fetch: f2, keys: {}, cache: false });
  assert.deepEqual([f2.count("pexels"), f2.count("pixabay"), f2.count("openverse")], [0, 0, 1]);
  assert.deepEqual([res2.providers.pexels.status, res2.providers.pixabay.status, res2.providers.openverse.status], ["unconfigured", "unconfigured", "ok"]);
  assert.equal(res2.items.length, 2, "Openverse's cc0 + by results");
  assert.deepEqual(res2.notices.map((n) => `${n.code}:${n.provider}`), ["BROLL_PROVIDER_UNCONFIGURED:pexels", "BROLL_PROVIDER_UNCONFIGURED:pixabay"]);
  assert.equal(getBreaker("stock_pexels").state().state, "closed", "a missing key is not a provider failure");

  const e3 = env("noimages");
  const f3 = stdRoutes({ pexels_video: () => json({ videos: [] }), pixabay_video: () => json({ hits: [] }) });
  const res3 = await searchSlot({ slot: { slotId: "sl_ni", queries: ["laptop"], mediaPreference: "video" }, output: { aspect: "9:16" }, settings: { ...e3.settings, broll: { allowImages: false } }, fetch: f3, keys: KEYS, cache: false });
  assert.deepEqual([res3.fallbackUsed, res3.items.length, f3.count("openverse")], [false, 0, 0]);
});

t("cache hit avoids fetch: a repeated slot makes zero requests (even from a fresh process cache); another orientation misses", async () => {
  const e = env("cache");
  const f = stdRoutes();
  const opts = { slot: { slotId: "sl_c", queries: ["laptop"], mediaPreference: "video" }, output: { aspect: "9:16" }, settings: e.settings, fetch: f, keys: KEYS };
  const r1 = await searchSlot(opts);
  assert.equal(f.calls.length, 2);
  resetCaches();
  const r2 = await searchSlot(opts);
  assert.equal(f.calls.length, 2, "served from disk");
  assert.deepEqual(r2.stats, { fetches: 0, cacheHits: 2 });
  assert.deepEqual([r2.providers.pexels.cacheHits, r2.providers.pexels.calls, r2.providers.pexels.status], [1, 0, "ok"]);
  assert.deepEqual(r2.items.map((x) => x.key), r1.items.map((x) => x.key));
  await searchSlot({ ...opts, output: { aspect: "16:9" } });
  assert.equal(f.calls.length, 4);
  const cacheDir = path.join(e.settings.paths.sharedDir, "asset-search");
  assert.equal(fs.readdirSync(cacheDir).filter((n) => n.endsWith(".json")).length, 4);
});

t("rate limits: a starved bucket skips the provider (rate_limited, breaker untouched); remaining 0 pauses the bucket", async () => {
  const e = env("rl");
  const settings = { ...e.settings, broll: { rateLimits: { pexels: { capacity: 1, windowMs: 3600000 } }, rateLimitMaxWaitMs: 30 } };
  (await getLimiter("stock_pexels", { capacity: 1, windowMs: 3600000 }).acquire())();
  const f = stdRoutes();
  const res = await searchSlot({ slot: { slotId: "sl_rl", queries: ["laptop"] }, output: { aspect: "9:16" }, settings, fetch: f, keys: KEYS, cache: false });
  assert.equal(f.count("pexels"), 0);
  assert.equal(res.providers.pexels.status, "rate_limited");
  assert.deepEqual(getBreaker("stock_pexels").state(), { state: "closed", openUntil: null, failures: 0 });
  assert.equal(res.items.length, 2, "Pixabay still answered");
  assert.deepEqual(res.notices.map((n) => `${n.code}:${n.provider}`), ["BROLL_PROVIDER_UNAVAILABLE:pexels"]);

  const e2 = env("rl-headers");
  const resetSec = Math.floor(Date.now() / 1000) + 600;
  const f2 = stdRoutes({ pexels_video: () => json(FX("pexels_videos.json"), { headers: { "X-Ratelimit-Limit": "200", "X-Ratelimit-Remaining": "0", "X-Ratelimit-Reset": String(resetSec) } }) });
  const res2 = await searchSlot({ slot: { slotId: "sl_rh", queries: ["laptop"] }, output: { aspect: "9:16" }, settings: e2.settings, fetch: f2, keys: KEYS, cache: false });
  assert.equal(res2.providers.pexels.status, "ok");
  const paused = getLimiter("stock_pexels").state().pausedUntil;
  assert.ok(Math.abs(paused - resetSec * 1000) < 1500, "paused until the provider's reset");
});

t("fault injection: assets:keyRejected trips the config breaker via the real path; assets:empty yields nothing without a failure", async () => {
  const e = env("faults");
  const f = stdRoutes();
  const res = await searchSlot({
    slot: { slotId: "sl_f", queries: ["laptop"] }, output: { aspect: "9:16" }, fetch: f, keys: KEYS, cache: false,
    settings: { ...e.settings, faults: { allow: true, global: "assets:keyRejected" } },
  });
  assert.equal(f.calls.length, 0);
  assert.deepEqual(res.items, []);
  assert.equal(res.providers.pexels.status, "key_rejected", "the breaker it opened does not hide the rejection");
  assert.equal(getBreaker("stock_pexels").state().state, "open");
  assert.ok(res.notices.some((n) => n.code === "BROLL_PROVIDER_REJECTED" && n.provider === "pexels"));

  const e2 = env("faults-empty");
  const f2 = stdRoutes();
  const res2 = await searchSlot({
    slot: { slotId: "sl_fe", queries: ["laptop"] }, output: { aspect: "9:16" }, fetch: f2, keys: KEYS,
    settings: { ...e2.settings, faults: { allow: true, global: "assets:empty" } },
  });
  assert.deepEqual([f2.calls.length, res2.items.length, res2.notices.length], [0, 0, 0]);
  assert.equal(getBreaker("stock_pexels").state().state, "closed");
  assert.ok(!fs.existsSync(path.join(e2.settings.paths.sharedDir, "asset-search")) || fs.readdirSync(path.join(e2.settings.paths.sharedDir, "asset-search")).length === 0, "injected empties are never cached");
});

t("slot validation, no usable queries, cap, and cancellation (which is not a provider failure)", async () => {
  const e = env("edge");
  await rejects(searchSlot({ slot: { slotId: "../escape", queries: ["laptop"] }, settings: e.settings }), "BROLL_SLOT_INVALID", "bug");
  await rejects(searchSlot({ settings: e.settings }), "BROLL_SLOT_INVALID");
  const f = stdRoutes();
  const none = await searchSlot({ slot: { slotId: "sl_q", queries: ["camera pans quickly", "the and for"] }, settings: e.settings, fetch: f, keys: KEYS, cache: false });
  assert.deepEqual([none.items.length, none.skipped, f.calls.length, none.notices.length], [0, "NO_QUERIES", 0, 0]);

  const capped = await searchSlot({ slot: { slotId: "sl_cap", queries: ["laptop"] }, output: { aspect: "9:16" }, settings: { ...e.settings, broll: { maxRawPerSlot: 3 } }, fetch: f, keys: KEYS, cache: false });
  assert.deepEqual([capped.items.length, capped.counts.unique, capped.counts.kept], [3, 4, 3]);

  const ac = new AbortController();
  const hang = hangingFetch();
  const pending = searchSlot({ slot: { slotId: "sl_x", queries: ["laptop", "desk"] }, settings: e.settings, fetch: hang, keys: KEYS, cache: false, signal: ac.signal });
  setTimeout(() => ac.abort(), 20);
  await rejects(pending, "CANCELLED", "cancelled");
  assert.equal(hang.calls.length, 2, "the second query never started");
  for (const p of ["stock_pexels", "stock_pixabay"]) assert.deepEqual(getBreaker(p).state(), { state: "closed", openUntil: null, failures: 0 }, p);
  await rejects(searchSlot({ slot: { slotId: "sl_y", queries: ["laptop"] }, settings: e.settings, signal: AbortSignal.abort() }), "CANCELLED");
});

t("searchSlots runs several slots and merges notices once per provider", async () => {
  const e = env("slots");
  const f = stdRoutes({ pexels_video: () => json({}, { status: 500 }) });
  const out = await searchSlots({
    slots: [{ slotId: "sl_1", queries: ["laptop"] }, { slotId: "sl_2", queries: ["desk"] }, { slotId: "sl_3", queries: ["robot"] }],
    concurrency: 2, output: { aspect: "9:16" }, settings: e.settings, fetch: f, keys: KEYS, cache: false,
  });
  assert.equal(out.results.length, 3);
  assert.ok(out.results.every((r) => r.items.length === 2));
  assert.deepEqual(out.notices.map((n) => `${n.code}:${n.provider}`), ["BROLL_PROVIDER_UNAVAILABLE:pexels"]);
  assert.equal(out.stats.fetches, f.calls.length);
});

// ---------------------------------------------------------------------------------------------
section("searchStock — the editor's search action");

t("same path: cleaned query, page forwarded, kind either, no file; bad input → VALIDATION_FAILED", async () => {
  const e = env("stock");
  const f = stdRoutes();
  const r = await searchStock({ query: "  AI  chip factory  ", kind: "video", output: { aspect: "16:9" }, page: 2, settings: e.settings, fetch: f, keys: KEYS, cache: false });
  assert.equal(r.query, "AI chip factory");
  assert.equal(r.page, 2);
  const pexCall = f.of("pexels_video")[0].url;
  assert.deepEqual([pexCall.searchParams.get("page"), pexCall.searchParams.get("orientation"), pexCall.searchParams.get("query")], ["2", "landscape", "AI chip factory"]);
  assert.equal(f.of("pixabay_video")[0].url.searchParams.get("page"), "2");
  const ranks = (p) => r.items.filter((x) => x.provider === p).map((x) => x.rank).sort((a, b) => a - b);
  assert.deepEqual(ranks("pexels"), [16, 17], "provider rank continues across pages (order follows orientation fit)");
  assert.deepEqual(ranks("pixabay"), [21, 22]);
  assert.equal(r.items[r.items.length - 1].orientationMatch, false, "the portrait clip ranks last on 16:9");
  assert.equal(r.path, undefined);
  assert.ok(!fs.existsSync(path.join(e.root, "proj")));

  const either = await searchStock({ query: "laptop", kind: "either", output: { aspect: "9:16" }, settings: e.settings, fetch: f, keys: KEYS, cache: false });
  assert.deepEqual([...new Set(either.items.map((x) => x.type))].sort(), ["image", "video"]);
  assert.equal(f.count("openverse"), 1);

  const raw = await searchStock({ query: "the and for", kind: "image", settings: e.settings, fetch: f, keys: KEYS, cache: false });
  assert.equal(raw.query, "the and for", "a user query that cleans to nothing is searched as typed");

  await rejects(searchStock({ query: "a", settings: e.settings }), "VALIDATION_FAILED", "input");
  await rejects(searchStock({ query: "x".repeat(81), settings: e.settings }), "VALIDATION_FAILED", "input");
  await rejects(searchStock({ query: "laptop", kind: "gif", settings: e.settings }), "VALIDATION_FAILED", "input");
});

if (LIVE) {
  section("live (VIDEO_EDIT_BROLL_LIVE=1) — real provider response shapes; stock APIs are free");
  t("live: each provider's real response maps to RawAsset", async () => {
    const config = require("../src/config"); // keys only; never printed
    const ap = config.assetProviders || {};
    const keys = { pexels: (ap.pexels && ap.pexels.apiKey) || "", pixabay: (ap.pixabay && ap.pixabay.apiKey) || (config.audio && config.audio.pixabayKey) || "" };
    const cases = [[pexels, "video", keys.pexels], [pexels, "image", keys.pexels], [pixabay, "video", keys.pixabay], [pixabay, "image", keys.pixabay], [openverse, "image", null]];
    for (const [mod, kind, key] of cases) {
      if (mod.needsKey && !key) { console.log(`    skip ${mod.name} ${kind}: no key configured`); continue; }
      const r = await mod.search({ query: "laptop", kind, orientation: "portrait", perPage: 3, fetch: realFetch, apiKey: key, timeoutMs: 20000 });
      assert.ok(r.items.length > 0, `${mod.name} ${kind} returned items`);
      const it = r.items[0];
      assert.ok(it.renditions.length > 0 && it.renditions.every((x) => x.url.startsWith("https://")), `${mod.name} ${kind} renditions`);
      assert.ok(it.license && it.pageUrl && it.attribution, `${mod.name} ${kind} credits`);
      if (kind === "video") assert.ok(it.durationSec > 0, `${mod.name} duration`);
      if (mod.name === "pexels" && kind === "video") assert.ok(it.pictures.length >= 3 && it.strip.length === 3, "pexels video pictures");
      console.log(`    live ${mod.name} ${kind}: items=${r.items.length} rejected=${JSON.stringify(r.rejected)} renditions=${it.renditions.length} ` +
        `dims=${it.width}x${it.height} dur=${it.durationSec} pictures=${it.pictures.length} tags=${it.tags.length} text=${it.text ? "yes" : "no"} ` +
        `license="${it.license}" rateRemaining=${r.rateLimit ? r.rateLimit.remaining : "n/a"}`);
    }
  });
}

t("no request ever reached the global fetch", () => {
  assert.equal(globalFetchCalls, 0);
});

run().finally(() => {
  clearInterval(keepAlive);
  restoreFetch();
  tmp.cleanup();
});
