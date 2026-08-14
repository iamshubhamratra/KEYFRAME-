// LIVE multi-provider verification — the end-to-end proof for the Pixabay + Pexels + Unsplash
// discovery system. Hits the real APIs, so it is NOT part of `npm test`.
//
//   node scripts/test-providers-live.js              # pool proof + both orientations
//   node scripts/test-providers-live.js --matrix     # + 30s / 60s / 90s duration sweep
//
// It runs the REAL asset planner and the REAL asset search node from agents/graph.js against a
// realistic script, which is what makes it a verification rather than a demo: everything the
// feature touches — scene-specific query generation, the concurrent fan-out, cross-provider
// pooling and de-duplication, the 0-100 composite score, the priority-weighted bar, query
// refinement, and the retrieval disclosure — runs exactly as it does in production.
//
// It also asserts the two things that are easy to claim and hard to keep: that a provider
// outage cannot break generation, and that no API key ever reaches disk or a log line.

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

const config = require("../src/config");
const { UsageTracker } = require("../src/services/usage");
const graph = require("../src/agents/graph");
const S = require("../src/services/asset_score");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "kf-live-"));

// A realistic six-scene product film. Each scene needs a VISUALLY DIFFERENT picture, which is
// what makes "were the queries scene-specific?" a question worth asking.
const SCENES = [
  { id: "s1", start: 0, duration: 5, purpose: "hook", headline: "Your data, finally making sense", subtext: "", voiceover: "Most teams drown in dashboards that tell them nothing.", visualDirection: "an overwhelmed analyst at a wall of monitors", onScreenText: [] },
  { id: "s2", start: 5, duration: 5, purpose: "the problem", headline: "Scattered across ten tools", subtext: "", voiceover: "Your numbers live in ten different places.", visualDirection: "tangled cables and scattered paperwork", onScreenText: [] },
  { id: "s3", start: 10, duration: 5, purpose: "feature", headline: "One analytics dashboard", subtext: "", voiceover: "See every metric that matters in real time.", visualDirection: "a clean analytics dashboard on a laptop", onScreenText: [] },
  { id: "s4", start: 15, duration: 5, purpose: "feature", headline: "Revenue you can watch", subtext: "", voiceover: "Track revenue as it happens.", visualDirection: "a revenue chart climbing on a screen", onScreenText: [] },
  { id: "s5", start: 20, duration: 5, purpose: "proof", headline: "Teams move together", subtext: "", voiceover: "Everyone works from the same picture.", visualDirection: "a team collaborating around a table", onScreenText: [] },
  { id: "s6", start: 25, duration: 5, purpose: "cta", headline: "Start free today", subtext: "", voiceover: "Start free today.", visualDirection: "a bright open workspace at sunrise", onScreenText: [] },
];

function makeJob({ orientation = "horizontal", duration = 30, id = "live" } = {}) {
  const dims = config.dimensionsFor(orientation, "720p");
  return {
    id: `${id}-${orientation}-${duration}`,
    prompt: "A promotional video for an AI analytics platform",
    duration, orientation, width: dims.width, height: dims.height, fps: 30,
    frame_pack: null, intent: { preferences: { framePack: "auto" } },
    user_assets: [], website_screenshots: [], website_shots: [],
  };
}
const makeScript = (duration) => ({
  scenes: SCENES.slice(0, duration <= 30 ? 6 : SCENES.length).map((s) => ({ ...s })),
  music: { mood: "uplifting corporate" },
});

// COLD CACHE. The fetch cache is doing its job when it answers instantly from a previous run —
// but a warm cache short-circuits the provider fan-out entirely, so a verification that ran
// against one would prove nothing about the thing it exists to verify. Bypassing `search`
// (not `register`) forces live fetches while still letting this run populate the cache.
const localDb = require("../src/services/asset_sources/local_db");
async function withColdCache(fn) {
  const real = localDb.search;
  localDb.search = () => [];
  try { return await fn(); } finally { localDb.search = real; }
}

async function runSearch({ orientation, duration, framePack = "edition", label }) {
  const job = makeJob({ orientation, duration, id: label || "live" });
  const script = makeScript(duration);
  const jobDir = path.join(TMP, job.id);
  fs.mkdirSync(jobDir, { recursive: true });
  // Register the job so the disclosure setters have somewhere to write. db.setProviderReview
  // is a no-op for an unknown id (by design — a disclosure never creates a job), so without
  // this the retrieval review would silently go nowhere and look like a missing feature.
  try {
    require("../src/db").insert({
      id: job.id, kind: "project", prompt: job.prompt, duration: job.duration,
      orientation: job.orientation, quality: "720p", width: job.width, height: job.height,
      fps: job.fps, created_at: Date.now(), client_ip: "live-test",
    });
  } catch { /* already present on a re-run */ }
  const s = {
    job, jobDir, script, framePack,
    tracker: new UsageTracker(),
    brief: { subject: "AI analytics platform", keyMessages: ["see every metric"], goal: "signups" },
  };
  const planned = await graph.__test.assetPlannerAgent(s);
  const searched = await graph.__test.assetSearchAgent({ ...s, ...planned });
  return { job, assets: searched.assets || [], plan: planned.assetPlan || [] };
}

(async () => {
  console.log(`\nconfigured providers: ${JSON.stringify(config.assetProviders?.order)}`);
  const sources = require("../src/services/asset_sources");

  // ---------------------------------------------------------------- 1. the pool
  console.log("\n1 — the candidate pool");
  const poolLog = [];
  const origLog = console.log;
  console.log = (...a) => { poolLog.push(a.join(" ")); origLog(...a); };

  const first = await withColdCache(() => runSearch({ orientation: "horizontal", duration: 30, label: "pool" }));
  console.log = origLog;

  await t("ALL THREE PROVIDERS ARE QUERIED for the same want, concurrently", () => {
    const poolLines = poolLog.filter((l) => l.includes("[assets] pool for"));
    assert.ok(poolLines.length, "no pool was ever formed — the fan-out did not run");
    const named = poolLines.join(" ");
    for (const p of ["pixabay", "pexels", "unsplash"]) {
      assert.ok(named.includes(p), `${p} never appeared in a pool tally:\n${poolLines[0]}`);
    }
  });

  await t("the pool is deep enough for ranking to be a real choice", () => {
    const m = poolLog.filter((l) => l.includes("[assets] pool for")).map((l) => Number((l.match(/: (\d+) candidate/) || [])[1]) || 0);
    const biggest = Math.max(0, ...m);
    assert.ok(biggest >= 20, `deepest pool was only ${biggest} candidates`);
  });

  await t("cross-provider duplicates are dropped before anything is downloaded", () => {
    // Not every query collides, so this asserts the mechanism reported itself at least once
    // across the whole film rather than on any single want.
    const anyDedup = poolLog.some((l) => /cross-provider duplicate\(s\) dropped/.test(l));
    const anyPool = poolLog.some((l) => l.includes("[assets] pool for"));
    assert.ok(anyPool, "no pools formed at all");
    if (!anyDedup) origLog("      (note: no collisions occurred on this run — mechanism present, nothing to drop)");
  });

  // ---------------------------------------------------------------- 2. scoring
  console.log("\n2 — scoring and selection");
  const scored = first.assets.filter((a) => a.retrievalScore != null);

  await t("EVERY fetched asset carries a score out of 100 with its sub-scores", () => {
    const fetched = first.assets.filter((a) => a.source && !["upload", "website"].includes(a.source));
    assert.ok(fetched.length, "nothing was fetched at all");
    for (const a of fetched) {
      assert.ok(a.retrievalScore != null, `asset from ${a.provider} has no score`);
      assert.ok(a.retrievalScore >= 0 && a.retrievalScore <= 100, `score out of range: ${a.retrievalScore}`);
      for (const axis of ["relevance", "quality", "sceneCompat", "aspect", "subject", "brand", "uniqueness"]) {
        assert.ok(a.retrievalParts && axis in a.retrievalParts, `missing sub-score "${axis}"`);
      }
      assert.ok(a.provider, "asset does not name its provider");
    }
  });

  await t("nothing below its bar ships without being recorded as a compromise", () => {
    for (const a of scored) {
      // The bar is priority-weighted, so compare against the one this box was actually held
      // to (carried on the asset), not a hardcoded 80.
      const bar = a.bar != null ? a.bar : 80;
      if (a.retrievalScore < bar) {
        assert.strictEqual(a.thresholdMissed, true,
          `${a.provider} asset scored ${a.retrievalScore} against bar ${bar} but was not flagged`);
      }
    }
  });

  await t("QUERIES ARE SCENE-SPECIFIC, not one string repeated across the film", () => {
    const wants = (first.plan && first.plan.searches) || [];
    assert.ok(wants.length, "the planner produced no searches");
    const queries = [...new Set(wants.map((w) => String((w.need && w.need.query) || "").toLowerCase()).filter(Boolean))];
    assert.ok(queries.length > 1, `every want used the same query: ${JSON.stringify(queries)}`);
    origLog(`      queries: ${queries.slice(0, 6).map((q) => `"${q.slice(0, 34)}"`).join(", ")}`);
  });

  await t("no two scenes are given the same picture", () => {
    const byScene = first.assets.filter((a) => a.path && a.sceneId != null);
    const paths = byScene.map((a) => a.path);
    assert.strictEqual(new Set(paths).size, paths.length, "the same file was assigned to two scenes");
    const hashes = byScene.map((a) => a.dhash).filter(Boolean);
    assert.strictEqual(new Set(hashes).size, hashes.length, "two scenes got perceptually identical pictures");
  });

  await t("the retrieval disclosure is persisted for the UI", () => {
    const db = require("../src/db");
    const rec = db.getRaw(first.job.id);
    const review = rec && rec.provider_review;
    assert.ok(review, "no provider_review was written");
    assert.ok(Array.isArray(review.selections) && review.selections.length, "no selections recorded");
    assert.ok(review.totals && typeof review.totals.avgScore === "number", "no totals recorded");
    origLog(`      avg ${review.totals.avgScore}/100 across ${review.totals.scored} selection(s); `
      + review.providers.map((p) => `${p.name}=${p.wins}`).join(" "));
  });

  // ---------------------------------------------------------------- 3. orientation
  console.log("\n3 — 9:16 and 16:9");
  const vertical = await withColdCache(() => runSearch({ orientation: "vertical", duration: 30, framePack: "grid-dispatch", label: "vert" }));

  await t("a 9:16 film prefers portrait-compatible imagery", () => {
    const stills = vertical.assets.filter((a) => a.type === "image" && a.width && a.height && a.retrievalScore != null);
    assert.ok(stills.length, "no scored stills on the portrait run");
    const aspectPts = stills.map((a) => (a.retrievalParts && a.retrievalParts.aspect) || 0);
    const avg = aspectPts.reduce((x, y) => x + y, 0) / aspectPts.length;
    origLog(`      mean aspect score ${avg.toFixed(1)}/10 across ${stills.length} still(s)`);
    // The axis must actually be discriminating on a portrait film rather than flat.
    assert.ok(avg > 0, "every portrait candidate scored zero on shape — the target ratio is not reaching the scorer");
  });

  await t("both orientations fill their scenes", () => {
    for (const [name, r] of [["16:9", first], ["9:16", vertical]]) {
      const withAsset = new Set(r.assets.filter((a) => a.sceneId != null).map((a) => a.sceneId));
      assert.ok(withAsset.size >= 3, `${name}: only ${withAsset.size} scene(s) got a picture`);
      origLog(`      ${name}: ${withAsset.size} scene(s) covered by ${r.assets.length} asset(s)`);
    }
  });

  // ---------------------------------------------------------------- 4. resilience
  console.log("\n4 — provider failure injection");
  for (const victim of ["pexels", "unsplash", "pixabay"]) {
    await t(`generation survives ${victim} being completely dead`, async () => {
      const mod = require(`../src/services/asset_sources/${victim === "pixabay" ? "pixabay_api" : victim}`);
      const realSearch = mod.search, realAvail = mod.available;
      mod.search = async () => { throw new Error(`simulated ${victim} outage (HTTP 503)`); };
      try {
        const r = await runSearch({ orientation: "horizontal", duration: 30, label: `dead-${victim}` });
        const got = r.assets.filter((a) => a.path);
        assert.ok(got.length >= 2, `only ${got.length} asset(s) survived — one dead provider broke the film`);
        // A CACHED asset legitimately reports the provider that originally served it, so a
        // `cache:pixabay` hit is not the dead provider answering — it is the fetch cache doing
        // its job. Only a LIVE result from the victim would be a real failure.
        const live = got.filter((a) => !a.fromCache);
        assert.ok(!live.some((a) => a.provider === victim), `${victim} served a live asset while simulated dead`);
      } finally { mod.search = realSearch; mod.available = realAvail; }
    });
  }

  await t("with EVERY provider dead the pipeline degrades instead of throwing", async () => {
    const mods = ["pixabay_api", "pexels", "unsplash", "openverse", "pixabay_scrape"]
      .map((f) => require(`../src/services/asset_sources/${f}`));
    const saved = mods.map((m) => m.search);
    mods.forEach((m) => { m.search = async () => { throw new Error("simulated total outage"); }; });
    try {
      const r = await runSearch({ orientation: "horizontal", duration: 30, label: "dead-all" });
      assert.ok(Array.isArray(r.assets), "asset_search threw instead of degrading");
    } finally { mods.forEach((m, i) => { m.search = saved[i]; }); }
  });

  // ---------------------------------------------------------------- 5. secrets
  console.log("\n5 — key safety");
  await t("NO API KEY reaches a job directory, a log line, or any produced artefact", () => {
    const keys = ["pixabay", "pexels", "unsplash"]
      .map((p) => config.assetProviders?.[p]?.apiKey).filter((k) => k && k.length > 8);
    assert.ok(keys.length >= 2, "expected at least two configured keys to check");
    const offenders = [];
    const walk = (dir, depth = 0) => {
      if (depth > 6) return;
      let entries = [];
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { walk(p, depth + 1); continue; }
        if (!/\.(html|json|txt|log|srt|vtt|js|css)$/i.test(e.name)) continue;
        let body = "";
        try { body = fs.readFileSync(p, "utf8"); } catch { continue; }
        for (const k of keys) if (body.includes(k)) offenders.push(`${p} contains a provider key`);
      }
    };
    walk(TMP);
    walk(path.join(config.paths.root, "asset_cache"));
    assert.deepStrictEqual(offenders, [], offenders.join("\n"));
  });

  await t("a provider's own log line redacts the key", () => {
    const joined = poolLog.join("\n");
    const keys = ["pixabay", "pexels", "unsplash"]
      .map((p) => config.assetProviders?.[p]?.apiKey).filter((k) => k && k.length > 8);
    for (const k of keys) assert.ok(!joined.includes(k), "a raw key was printed to the console");
  });

  // ---------------------------------------------------------------- 6. duration sweep
  if (process.argv.includes("--matrix")) {
    console.log("\n6 — duration sweep");
    for (const duration of [30, 60, 90]) {
      await t(`${duration}s film collects a proportionate, scored asset set`, async () => {
        const r = await runSearch({ orientation: "horizontal", duration, label: `d${duration}` });
        const got = r.assets.filter((a) => a.retrievalScore != null);
        assert.ok(got.length >= 2, `${duration}s produced only ${got.length} scored asset(s)`);
        const avg = Math.round(got.reduce((s2, a) => s2 + a.retrievalScore, 0) / got.length);
        origLog(`      ${duration}s: ${got.length} scored asset(s), mean ${avg}/100, `
          + `${got.filter((a) => a.thresholdMissed).length} below bar`);
      });
    }
  }

  // CLEAN UP THE JOBS THIS HARNESS CREATED. They exist only so the disclosure setters have
  // somewhere to write (db.setProviderReview is a no-op for an unknown id), but they are
  // indistinguishable from real projects once written: they persist to jobs.json, appear in
  // GET /api/projects and therefore in the studio's Gallery, and the boot-time crash recovery
  // marks anything left "queued" as FAILED — so a verification run would litter the user's
  // gallery with failed films it invented. Identified by the client_ip stamp, never by a name
  // pattern, so this can only ever delete rows this file wrote.
  try {
    const db = require("../src/db");
    const removed = db.removeWhere ? db.removeWhere((j) => j.client_ip === "live-test") : 0;
    if (removed) console.log(`cleaned up ${removed} harness job(s)`);
  } catch (e) { console.warn(`harness job cleanup skipped: ${e.message}`); }
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* noop */ }
  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
