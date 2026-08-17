#!/usr/bin/env node
// BATCH TEMPLATE GENERATION — the regression guard.
//
// A batch run costs real model calls and real renders, so the things that must be right BEFORE
// spending any of that are proven here with neither: the diversity metric, the plan normaliser,
// the ledger's arithmetic, cancellation, and the naming rule.
//
// What this deliberately does NOT do is run a batch. That needs an LLM and a render farm; what it
// proves instead is that every decision the orchestrator makes from their output is correct.
//
//   node scripts/test-template-batch.js

const fingerprint = require("../src/templates/fingerprint");
const strategy = require("../src/templates/strategy");
const batchStore = require("../src/templates/batch_store");
const batch = require("../src/templates/batch");
const store = require("../src/templates/store");
const paths = require("../src/templates/paths");
const testRender = require("../src/templates/test_render");

let failures = 0, checks = 0;
function ok(cond, label, detail) {
  checks++;
  if (cond) { console.log(`  ok   ${label}`); return true; }
  failures++;
  console.error(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  return false;
}
function section(t) { console.log(`\n${t}`); }

// A minimal design, and the mutations that make it differ along ONE dimension at a time.
const BASE = {
  display: "Unbounded", body: "Manrope", em: 0.55, titleLine: 1.02,
  titlePreset: "rise", itemPreset: "pop",
  palette: { deep: "#0a0f2c", cyan: "#4fd6ff", paper: "#f4f2ff", ink: "#080a1c" },
  accents: ["cyan"], groundKey: "deep", inkKey: "ink", paperKey: "paper", dark: true,
  ground: { kind: "linear", from: "cyan", to: "deep", angle: 165 },
  look: {
    hook: { bg: "deep", fg: "paper", hi: "cyan", world: true, top: 900, size: 132 },
    statement: { bg: "deep", fg: "paper", hi: "cyan", world: false, top: 620, size: 168 },
    feature: { bg: "paper", fg: "ink", hi: "cyan", world: false, top: 260, size: 108, card: { v: "glow", r: 26 }, chips: { v: "pill" } },
    montage: { bg: "deep", fg: "paper", hi: "cyan", world: false, top: 280, size: 104, tile: { v: "tile", r: 22 } },
    stats: { bg: "deep", fg: "paper", hi: "cyan", world: true, top: 400, size: 104 },
    cta: { bg: "deep", fg: "paper", hi: "cyan", world: true, top: 910, size: 124 },
    app: { bg: "deep", fg: "paper", hi: "cyan", world: false, top: 400, size: 104 },
  },
  cams: ["drop", "pushL", "zoomIn", "pushU", "pushR", "zoomOut"], camMul: 3, camOff: 2,
  mag: { x: 1, y: 0.55, rot: 0.7, skew: 0, zin: 0.42, zout: 0.34, inn: 0.24, out: 0.82, slide: 0.24, driftZ: 0.045 },
  ambient: 1.4, energy: 1.05, badge: "circle", icon: { shape: "bolt", stroke: true },
  world: { layers: [{ kind: "glow" }, { kind: "stars" }] },
  variants: { feature: "Typing", stats: "Ring" },
};
const clone = (o) => JSON.parse(JSON.stringify(o));

function main() {
  // ---------------------------------------------------------------- 1. the metric
  section("fingerprint — diversity is measured, and the measurement discriminates");
  const a = fingerprint.fingerprint(BASE, { slug: "a", name: "A" });
  ok(fingerprint.compare(a, a).similarity === 100, "a design is 100% similar to itself");

  // Colour-only change: EXACTLY the failure mode this exists to catch. It must stay similar.
  const recolored = clone(BASE);
  recolored.palette = { deep: "#2c0a0f", cyan: "#ffb84f", paper: "#fff8f2", ink: "#1c0a08" };
  const recol = fingerprint.compare(a, fingerprint.fingerprint(recolored, { slug: "b", name: "B" }));
  ok(recol.similarity >= 80, "the same layout in different colours is still ~the same template", `${recol.similarity}%`);

  // A genuinely different design: other faces, other entrances, other cameras, other backdrop,
  // light ground, different composition and picture geometry.
  const different = clone(BASE);
  different.display = "Archivo Black"; different.body = "Inter"; different.em = 0.8; different.titleLine = 1.3;
  different.titlePreset = "typewriter"; different.itemPreset = "mask";
  different.cams = ["drift", "orbit", "tilt", "pushD", "zoomOut", "drop"];
  different.dark = false; different.ground = { kind: "flat" };
  different.palette = { paper: "#faf7f0", ink: "#141414", red: "#d92b2b", grey: "#8a8a8a" };
  different.world = { layers: [{ kind: "grid" }] };
  different.variants = { montage: "Scroll" };
  different.boxes = { feature: { w: 0.5, h: 0.42 }, montage: { h: 0.1 }, statement: { h: 0.35 } };
  for (const [k, v] of Object.entries(different.look)) v.top = Math.max(120, 1900 - v.top);
  const diff = fingerprint.compare(a, fingerprint.fingerprint(different, { slug: "c", name: "C" }));
  ok(diff.similarity < recol.similarity - 15, "a genuinely different design scores far lower", `${diff.similarity}% vs ${recol.similarity}%`);
  ok(diff.dimensions.typography < 50 && diff.dimensions.camera < 50, "and the per-dimension report names WHY", JSON.stringify(diff.dimensions));

  // ---------------------------------------------------------------- 2. calibration
  section("fingerprint — the threshold is calibrated against the library it protects");
  const lib = fingerprint.loadLibrary();
  ok(lib.length > 50, "the installed library is fingerprinted", `${lib.length} packs`);
  ok(lib.some((x) => x.source === "skin") && lib.some((x) => x.source === "manifest"),
    "including hand-written packs, coarsely, so they cannot be duplicated unnoticed");
  ok(fingerprint.uniquenessScore(100) === 0, "an identical design scores 0");
  ok(fingerprint.uniquenessScore(fingerprint.BASELINE_SIMILARITY) === 100, "a design as distinct as the median shipped pair scores 100");
  const shipped = lib.filter((x) => x.source === "skin");
  const rejected = shipped.filter((x) => fingerprint.scoreAgainst(x, { peers: [] }).uniqueness < batch.MIN_UNIQUENESS);
  // The gate must reject SOME of the library (or it is measuring nothing) and not MOST of it (or
  // it would refuse every template this feature exists to produce). qa.js's brand.contrast is the
  // cautionary tale: it refused 8 of 12 shipped packs and had to be demoted to a warning.
  ok(rejected.length > 0 && rejected.length < shipped.length * 0.35,
    `the ${batch.MIN_UNIQUENESS} floor rejects the library's near-siblings and keeps the rest`,
    `${rejected.length} of ${shipped.length}`);

  // ---------------------------------------------------------------- 3. the plan
  section("strategy — a short or malformed plan is repaired, never repeated");
  const cfg = { style: "modern", category: "Technology", animation: "high" };
  const short = strategy.normalise({ directions: [{ name: "Prism Motion", brief: "x" }] }, 5, cfg);
  ok(short.length === 5, "a plan that came back short is filled to the requested count", String(short.length));
  ok(new Set(short.map((d) => d.name)).size === 5, "and every direction still has a distinct name");
  ok(short.slice(1).every((d) => d.synthesised), "the filled ones are marked as synthesised, not passed off as art direction");
  const presets = new Set(short.map((d) => d.structure.titlePreset));
  ok(presets.size >= 3, "the filler rotates the engine's vocabularies rather than repeating one", `${presets.size} distinct presets`);
  const dupes = strategy.normalise({ directions: [{ name: "A" }, { name: "a" }, { name: "B" }] }, 3, cfg);
  ok(new Set(dupes.map((d) => d.name.toLowerCase())).size === 3, "a plan that repeats a name is de-duplicated");
  const junk = strategy.normalise({ directions: [{ name: "X", structure: { titlePreset: "nonsense", cameras: ["bogus"], ground: "plaid" } }] }, 1, cfg);
  ok(strategy.PRESETS.includes(junk[0].structure.titlePreset) && strategy.GROUNDS.includes(junk[0].structure.ground) && junk[0].structure.cameras.length === 0,
    "and vocabulary the engine does not have is dropped rather than passed through");

  // ---------------------------------------------------------------- 4. the brief
  section("strategy — every template gets its own prompt, and a rejection explains itself");
  const d0 = short[0], d1 = short[1];
  const b0 = strategy.briefFor({ direction: d0, config: cfg });
  const b1 = strategy.briefFor({ direction: d1, config: cfg });
  ok(b0 !== b1, "two directions produce two different prompts");
  ok(b0.includes(d0.name) && b0.includes(d0.structure.titlePreset), "the brief carries the direction's name and its structural commitments");
  const withRejection = strategy.briefFor({
    direction: d0, config: cfg,
    rejection: { similarity: 91, nearest: { name: "Star Watch" }, notes: ["camera 94% like \"Star Watch\"", "typography 88% like \"Star Watch\""] },
  });
  ok(withRejection.includes("Star Watch") && withRejection.includes("camera"),
    "a rejected attempt is re-briefed with the exact dimensions that collided");

  // ---------------------------------------------------------------- 5. the ledger
  section("batch store — the tally is derived, cancellation is cooperative");
  const b = batchStore.create({ count: 4, config: { orientation: "portrait" }, createdBy: "guard@test" });
  ok(b.items.length === 4 && b.items.every((i) => i.state === batchStore.ITEM.WAITING),
    "every requested template exists in the ledger before anything runs");
  batchStore.updateItem(b.id, 1, { state: batchStore.ITEM.PUBLISHED, qaScore: 94, uniqueness: 88 });
  batchStore.updateItem(b.id, 2, { state: batchStore.ITEM.PUBLISHED, qaScore: 90, uniqueness: 92 });
  batchStore.updateItem(b.id, 3, { state: batchStore.ITEM.REJECTED, uniqueness: 61 });
  batchStore.updateItem(b.id, 4, { state: batchStore.ITEM.FAILED, qaScore: 68 });
  const t = batchStore.tally(batchStore.get(b.id));
  ok(t.published === 2 && t.rejected === 1 && t.failed === 1, "published, rejected and failed are counted separately", JSON.stringify(t));
  ok(t.avgQuality === 84 && t.avgUniqueness === 80, "averages come from what was actually measured", `${t.avgQuality}/${t.avgUniqueness}`);
  ok(batchStore.finalStatusFor(batchStore.get(b.id)) === batchStore.STATUS.PARTIAL_SUCCESS,
    "a run that published some and lost some is PARTIAL_SUCCESS, not COMPLETED");
  ok(batchStore.shape(batchStore.get(b.id)).progressPct === 100, "progress counts finished items, whatever their verdict");

  const b2 = batchStore.create({ count: 3, config: {}, createdBy: "guard@test" });
  batchStore.updateItem(b2.id, 1, { state: batchStore.ITEM.PUBLISHED, qaScore: 91 });
  batchStore.requestCancel(b2.id);
  ok(batchStore.get(b2.id).cancelRequested === true, "cancel is a flag the orchestrator reads between steps");
  ok(batchStore.finalStatusFor(batchStore.get(b2.id)) === batchStore.STATUS.CANCELLED, "a cancelled run reports CANCELLED");
  ok(batchStore.tally(batchStore.get(b2.id)).published === 1, "and what it already published stays published");

  // A batch that met its count is COMPLETED — the only path to it.
  const b3 = batchStore.create({ count: 2, config: {}, createdBy: "guard@test" });
  batchStore.updateItem(b3.id, 1, { state: batchStore.ITEM.PUBLISHED, qaScore: 95 });
  batchStore.updateItem(b3.id, 2, { state: batchStore.ITEM.PUBLISHED, qaScore: 93 });
  ok(batchStore.finalStatusFor(batchStore.get(b3.id)) === batchStore.STATUS.COMPLETED, "only a full count is COMPLETED");

  // CRASH RECOVERY, AND THE HAZARD IT CREATES. An interrupted batch must not stay "running"
  // forever — but this module is loaded by every CLI script in the repo, and a sweep at load
  // would have one of them CANCEL a batch the SERVER is actively running. So a load-time sweep is
  // age-gated (a live batch is touched continuously) and only the server forces a full one at boot.
  batchStore.update(b3.id, { status: batchStore.STATUS.GENERATING, completedAt: null });
  batchStore.recoverInterrupted();
  ok(batchStore.get(b3.id).status === batchStore.STATUS.GENERATING,
    "loading the store does NOT cancel a batch that is still being worked on");
  // Scoped to this fixture. A global force sweep from a CLI process would cancel whatever the
  // SERVER is running — which this guard did exactly once, to a live batch, before it took `ids`.
  batchStore.recoverInterrupted({ force: true, ids: [b3.id] });
  ok(batchStore.get(b3.id).status === batchStore.STATUS.CANCELLED,
    "and the server's boot-time sweep does land it in CANCELLED");

  const store2 = require("../src/templates/store");
  ok(typeof store2.recoverInterrupted === "function", "the template store exposes the same recovery");
  const live = store2.create({ slug: "zzz-batch-guard-live", name: "ZZZ", prompt: "x", orientation: "portrait" });
  store2.transition(live.id, require("../src/templates/lifecycle").STATUS.GENERATING);
  store2.recoverInterrupted();
  ok(store2.get(live.id).status === "GENERATING", "and a freshly-started generation survives a CLI process loading the store");
  store2.recoverInterrupted({ force: true, ids: [live.id] });
  ok(store2.get(live.id).status === "FAILED", "while a boot-time sweep marks it FAILED so it can be retried");
  store2.get(live.id).status = "DRAFT";
  store2.remove(live.id);

  // ---------------------------------------------------------------- 6. naming
  section("naming — real names, and never a collision with an installed pack");
  const s1 = batch.slugFor("Prism Motion", 1);
  ok(s1 === "prism-motion" || s1.startsWith("prism-motion"), "a direction name becomes its slug", s1);
  ok(paths.slugError(s1) == null, "and the slug passes the path rules");
  const taken = batch.slugFor("Star Watch", 2);
  ok(taken !== "star-watch", "a name that collides with an installed pack is suffixed, never reused", taken);
  ok(paths.slugError(batch.slugFor("!!!", 7)) == null, "an unusable name still yields a legal slug", batch.slugFor("!!!", 7));

  // ---------------------------------------------------------------- 6b. test scenario
  //
  // The first real batch run failed here: prompt-only supplies no imagery, so a template with a
  // critical picture slot fails pre-render validation every time — three full pipeline runs spent
  // proving that a template which wants pictures does not work without any.
  section("test scenario — a template is tested with the kind of job it was designed for");
  ok(batch.scenarioFor({ assetRequirements: { requiredAssetCount: 4 } }, {}) === "website",
    "a template that declares picture slots is tested with the asset-rich scenario");
  ok(batch.scenarioFor({ assetRequirements: { requiredAssetCount: 0 } }, {}) === "prompt-only",
    "a purely typographic template is tested prompt-only");
  ok(batch.scenarioFor({ assetRequirements: null }, {}) === "prompt-only",
    "a template that declares nothing falls back to prompt-only");
  ok(batch.scenarioFor({ assetRequirements: { requiredAssetCount: 4 } }, { testScenario: "long-copy" }) === "long-copy",
    "and an explicit choice from the admin still wins");
  // The route must leave the field UNSET when the admin named nothing. Defaulting it there makes
  // every template look like an explicit prompt-only pick and silently disables the chooser.
  const routeSrc = require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "src", "routes", "admin_templates.js"), "utf8");
  ok(!/testScenario:\s*b\.testScenario\s*\?\s*String\(b\.testScenario\)\s*:\s*"prompt-only"/.test(routeSrc),
    "the route does not default testScenario, which would defeat the chooser");

  // ---------------------------------------------------------------- 6c. reading a test back
  //
  // BOTH BUGS HERE WERE FOUND BY RUNNING A REAL BATCH, AND NEITHER WAS VISIBLE TO ANY OTHER TEST.
  //
  //   1. db.get() returns a SHAPED job (camelCase), not the raw row. Reading `video_url` gave
  //      undefined for every job, so a render that took 124 seconds and delivered a video was
  //      reported as "empty" — and the publish gate that requires a passing test could never be
  //      satisfied by anything at all.
  //   2. On a retry, waiting on "the newest test with a verdict" returns the PREVIOUS attempt's
  //      result while the new one is still queued. Attempts 2 and 3 each "finished" in 15 seconds
  //      re-reporting attempt 1's failure.
  //
  // The fixture is the shaped job, so a rename in db.js's shape() breaks this and not a customer.
  section("test outcomes — a delivered render is read as delivered, and a retry waits for itself");
  {
    const db = require("../src/db");
    const realGet = db.get;
    const jobs = {
      "job-done": { status: "done", videoUrl: "/videos/job-done.mp4", framePack: "zzz", progress: "complete" },
      "job-empty": { status: "done", videoUrl: null, framePack: "zzz" },
      "job-failed": { status: "failed", videoUrl: null, error: "render died", framePack: "zzz" },
      "job-running": { status: "running", videoUrl: null, framePack: "zzz" },
    };
    db.get = (id) => jobs[id] || null;
    try {
      const rec = { slug: "zzz", tests: [{ projectId: "job-done", at: 2 }] };
      const r = testRender.refreshTests(rec);
      ok(r.tests[0].state === "done" && r.tests[0].videoUrl === "/videos/job-done.mp4",
        "a job that delivered a video reads as done", JSON.stringify(r.tests[0].state));
      ok(testRender.passingTestFor(rec) != null, "and satisfies the publish gate");
      ok(testRender.refreshTests({ slug: "zzz", tests: [{ projectId: "job-empty" }] }).tests[0].state === "empty",
        "a job that finished with no video reads as empty");
      ok(testRender.refreshTests({ slug: "zzz", tests: [{ projectId: "job-failed" }] }).tests[0].state === "failed",
        "a failed job reads as failed");
      ok(testRender.refreshTests({ slug: "zzz", tests: [{ projectId: "job-gone" }] }).tests[0].state === "gone",
        "a job whose record is gone is not counted as a failure");
      ok(testRender.passingTestFor({ slug: "other", tests: [{ projectId: "job-done" }] }) == null,
        "a pass on ANOTHER pack does not count for this one");

      // The retry shape: a fresh render still queued, in front of an older failed one.
      const retrying = { slug: "zzz", tests: [{ projectId: "job-running" }, { projectId: "job-failed" }] };
      const t2 = testRender.refreshTests(retrying);
      ok(t2.lastTest.state === "failed", "`lastTest` still reports the newest test that HAS a verdict");
      ok(t2.tests.find((x) => x.projectId === "job-running").state === "running",
        "so a waiter must poll its OWN job id, which is still running");
    } finally { db.get = realGet; }
  }

  // ---------------------------------------------------------------- 7. thresholds
  section("thresholds — an unattended run holds a higher bar than a human clicking publish");
  ok(batch.MIN_QUALITY >= 85, "the batch quality floor is at least 85", String(batch.MIN_QUALITY));
  ok(batch.MAX_ATTEMPTS >= 2 && batch.MAX_ATTEMPTS <= 4, "retries are bounded", String(batch.MAX_ATTEMPTS));
  ok(batch.MIN_UNIQUENESS >= 70, "the uniqueness floor is meaningful", String(batch.MIN_UNIQUENESS));

  // cleanup the ledger rows this guard created
  const keep = new Set([b.id, b2.id, b3.id]);
  const raw = require("node:fs");
  try {
    const all = JSON.parse(raw.readFileSync(batchStore.FILE, "utf8"));
    all.batches = (all.batches || []).filter((x) => !keep.has(x.id));
    raw.writeFileSync(batchStore.FILE, JSON.stringify(all, null, 2), "utf8");
  } catch { /* nothing written yet */ }
  section("cleanup");
  ok(true, "the guard's ledger rows were removed");

  console.log(`\n${failures ? "FAILED" : "PASSED"} — ${checks - failures}/${checks} checks`);
  process.exit(failures ? 1 : 0);
}

try { main(); } catch (e) {
  console.error(`harness error: ${e && e.stack ? e.stack : e}`);
  process.exit(1);
}
