// PeekShot capture-provider tests — OFFLINE. `fetch` is stubbed, so this spends no
// credits and needs no network or API key.
//
// A live smoke test (one real capture, one credit) is available separately:
//   node scripts/test-peekshot.js --live https://example.com
//
//   node scripts/test-peekshot.js          (npm run test:peekshot)

const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const config = require("../src/config");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "kf-ps-"));

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}\n      ${e.message}`); failed++; }
}

// ---- live smoke (opt-in) ----------------------------------------------------
if (process.argv.includes("--live")) {
  const url = process.argv[process.argv.indexOf("--live") + 1] || "https://example.com";
  (async () => {
    const ps = require("../src/services/ingest/peekshot");
    if (!ps.enabled()) { console.error("PEEKSHOT_API_KEY is not set — nothing to smoke-test"); process.exit(1); }
    console.log(`live capture of ${url} (costs 1 credit)…`);
    const shots = await ps.captureShots({ url, workDir: TMP, max: 1 });
    console.log(shots.length ? `ok → ${shots[0].path}` : "FAILED — no shot returned");
    process.exit(shots.length ? 0 : 1);
  })();
  return;
}

// ---- offline ----------------------------------------------------------------
// A 1x1 PNG is too small for the download guard, so pad past the 1KB floor.
const PNG = Buffer.concat([
  Buffer.from("89504e470d0a1a0a", "hex"),
  Buffer.alloc(2048, 7),
]);

// Drive the module's whole lifecycle through a scripted fetch: submit → poll(s) →
// download. Returns the call log so tests can assert on what was actually requested.
function stubFetch({ pollStates = ["IN_QUEUE", "COMPLETE"], imageUrl = "https://peekshot-v2.s3.ap-south-1.amazonaws.com/1/x.png", submitStatus = 201, imageBody = PNG } = {}) {
  const calls = [];
  let poll = 0;
  global.fetch = async (url, opts = {}) => {
    const u = String(url);
    calls.push({ url: u, method: opts.method || "GET", body: opts.body ? JSON.parse(opts.body) : null, headers: opts.headers || {} });
    const json = (obj, status = 200) => ({ ok: status < 400, status, text: async () => JSON.stringify(obj) });
    if (u.endsWith("/projects")) return json({ data: { projects: [{ id: 193, name: "Default" }] } });
    if (opts.method === "POST" && u.endsWith("/screenshots")) {
      if (submitStatus >= 400) return json({ message: "bad request" }, submitStatus);
      return json({ data: { requestId: 4242, creditRequired: 1 } }, submitStatus);
    }
    if (/\/screenshots\/\d+$/.test(u)) {
      const state = pollStates[Math.min(poll++, pollStates.length - 1)];
      return json({ data: { id: 4242, status: state, screenshotUrl: state === "COMPLETE" ? imageUrl : null, errorMessage: state === "FAILED" ? "capture crashed" : null } });
    }
    // image download
    return { ok: true, status: 200, arrayBuffer: async () => imageBody };
  };
  return calls;
}

(async () => {
  console.log("\nPeekShot capture provider (offline)\n");
  const realFetch = global.fetch;
  // Force a known config regardless of the developer's .env. NOTE: config is frozen at
  // the TOP level, so `config.peekshot = {…}` silently no-ops (and the timeout test then
  // waits the real 180s). The nested object is mutable — assign into it.
  Object.assign(config.peekshot, { apiKey: "test-key", projectId: "", enabled: true, pollMs: 1, captureTimeoutMs: 4000, delaySec: 1 });

  await test("submits the documented contract: POST + x-api-key + string options", async () => {
    const calls = stubFetch();
    const ps = require("../src/services/ingest/peekshot");
    await ps.captureShots({ url: "https://acme.test", workDir: path.join(TMP, "a"), max: 1 });
    const post = calls.find((c) => c.method === "POST");
    assert.ok(post, "no submit was made");
    assert.strictEqual(post.url, "https://api.peekshot.com/api/v1/screenshots");
    assert.strictEqual(post.headers["x-api-key"], "test-key", "the key must ride the x-api-key header");
    assert.strictEqual(post.body.url, "https://acme.test");
    for (const [k, v] of Object.entries(post.body)) assert.strictEqual(typeof v, "string", `${k} must be sent as a string (the API's parameter type)`);
  });

  await test("asks for the options that make this provider worth having", async () => {
    const calls = stubFetch();
    await require("../src/services/ingest/peekshot").captureShots({ url: "https://acme.test", workDir: path.join(TMP, "b"), max: 1 });
    const b = calls.find((c) => c.method === "POST").body;
    assert.strictEqual(b.block_cookie_banner, "true", "consent banners are the #1 capture defect in this pipeline");
    assert.strictEqual(b.block_ads, "true");
    assert.strictEqual(b.block_popups_by_heuristics, "true");
    assert.strictEqual(b.disable_animations, "true");
    assert.strictEqual(b.fresh, "true", "a rescue must never be served a cached capture from an unrelated request");
  });

  await test("resolves project_id from the account when none is configured", async () => {
    const calls = stubFetch();
    // The id is cached for the process lifetime (it cannot change mid-run), so an
    // earlier test already resolved it — clear the cache to observe the lookup.
    require("../src/services/ingest/peekshot").__resetProjectCache();
    await require("../src/services/ingest/peekshot").captureShots({ url: "https://acme.test", workDir: path.join(TMP, "c"), max: 1 });
    assert.ok(calls.some((c) => c.url.endsWith("/projects")), "should have looked the project up");
    assert.strictEqual(calls.find((c) => c.method === "POST").body.project_id, "193");
  });

  await test("polls until COMPLETE, then downloads the image to disk", async () => {
    stubFetch({ pollStates: ["PENDING", "IN_QUEUE", "IN_QUEUE", "COMPLETE"] });
    const dir = path.join(TMP, "d");
    const shots = await require("../src/services/ingest/peekshot").captureShots({ url: "https://acme.test", workDir: dir, max: 1 });
    assert.strictEqual(shots.length, 1);
    assert.ok(fs.existsSync(shots[0].path), "the image must land on disk");
    assert.ok(fs.statSync(shots[0].path).size > 1024);
  });

  await test("records are HONEST about what a hosted capture cannot know", async () => {
    stubFetch();
    const shots = await require("../src/services/ingest/peekshot").captureShots({ url: "https://acme.test", workDir: path.join(TMP, "e"), max: 1 });
    const s = shots[0];
    // `clean:true` would claim a DOM verdict we never formed; `false` would make the
    // intake gate hard-drop every hosted capture. Unknown is the only truthful value.
    assert.strictEqual(s.clean, null, "clean must be UNKNOWN, not asserted either way");
    assert.strictEqual(s.maxCoveragePct, null);
    assert.deepStrictEqual(s.obstructions, []);
    assert.strictEqual(s.source, "peekshot");
    assert.ok("kind" in s && "heading" in s, "must match the capture-record shape ingest/website.js emits");
  });

  await test("its records survive the intake gate (clean:null is kept, not dropped)", async () => {
    stubFetch();
    const shots = await require("../src/services/ingest/peekshot").captureShots({ url: "https://acme.test", workDir: path.join(TMP, "f"), max: 1 });
    const { filterScreenshots } = require("../src/services/screenshot_intake");
    const { keptShots, review } = await filterScreenshots({ shots });
    // The stub image is a synthetic blob, so the blank gate may drop it — what must NOT
    // happen is an "obstructed" hard-drop, which is reserved for a DOM-truth verdict.
    assert.ok(!review.dropped.some((d) => d.reason === "obstructed"),
      "a hosted capture must never be dropped as obstructed — we never measured obstruction");
    assert.ok(keptShots.length + review.dropped.length === 1, "the shot must be accounted for exactly once");
  });

  await test("a failed capture returns [] rather than throwing (a rescue can't fail the job)", async () => {
    stubFetch({ pollStates: ["FAILED"] });
    const shots = await require("../src/services/ingest/peekshot").captureShots({ url: "https://acme.test", workDir: path.join(TMP, "g"), max: 1 });
    assert.deepStrictEqual(shots, []);
  });

  await test("a submit error returns [] rather than throwing", async () => {
    stubFetch({ submitStatus: 402 });
    const shots = await require("../src/services/ingest/peekshot").captureShots({ url: "https://acme.test", workDir: path.join(TMP, "h"), max: 1 });
    assert.deepStrictEqual(shots, []);
  });

  await test("a capture that never completes gives up at the deadline", async () => {
    stubFetch({ pollStates: ["IN_QUEUE"] });
    const t0 = Date.now();
    const shots = await require("../src/services/ingest/peekshot").captureShots({ url: "https://acme.test", workDir: path.join(TMP, "i"), max: 1 });
    assert.deepStrictEqual(shots, []);
    assert.ok(Date.now() - t0 < 15_000, "must honour captureTimeoutMs rather than hang the intake");
  });

  await test("refuses to download an image from an unexpected host", async () => {
    stubFetch({ imageUrl: "http://169.254.169.254/latest/meta-data/" });
    const shots = await require("../src/services/ingest/peekshot").captureShots({ url: "https://acme.test", workDir: path.join(TMP, "j"), max: 1 });
    assert.deepStrictEqual(shots, [], "an off-host image url must not be fetched");
  });

  await test("disabled without a key — no network call at all", async () => {
    const calls = stubFetch();
    Object.assign(config.peekshot, { apiKey: "", enabled: false });
    const shots = await require("../src/services/ingest/peekshot").captureShots({ url: "https://acme.test", workDir: path.join(TMP, "k"), max: 1 });
    assert.deepStrictEqual(shots, []);
    assert.strictEqual(calls.length, 0, "a disabled provider must not touch the network");
  });

  global.fetch = realFetch;
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
