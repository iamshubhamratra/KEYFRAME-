// Tests for the Screenshot Intelligence System.
//   1) The deterministic intake filter (blank drop, keep-strongest dedup, fail-open).
//   2) db.setScreenshotReview two-pass shallow-merge (intake base + CD demotions).
//   3) The CD verdict-apply force-demote for popup/loading/broken WEBSITE screenshots,
//      driven through the REAL reviewAndCurate with a stubbed vision response.
//
// Pure-ish: fabricates its own images with ffmpeg, stubs the one network call.
// Exit 1 on any failure (gates CI) — same contract as test-asset-priority.js.
//
// Run: node server/scripts/test-screenshot-intake.js   (npm run test:screenshot-intake)

process.env.CREATIVE_DIRECTOR_CLIP = "0"; // keep the local CLIP model out of the test

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const { filterScreenshots } = require("../src/services/screenshot_intake");
const db = require("../src/db");
const openrouter = require("../src/services/openrouter");
const { reviewAndCurate } = require("../src/services/creative_director");

const verbose = process.argv.includes("--verbose") || process.argv.includes("-v");
let failed = 0, passed = 0;
function check(name, fn) { return Promise.resolve().then(fn).then(() => { passed++; if (verbose) console.log(`  ✓ ${name}`); }).catch((e) => { failed++; console.log(`  ✗ ${name}\n      ${String((e && e.message) || e)}`); }); }
function ok(cond, msg) { if (!cond) throw new Error(msg || "expected truthy"); }
function eq(a, b, msg) { if (a !== b) throw new Error(`${msg || "not equal"}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); }
function section(s) { console.log(`\n▐ ${s}`); }

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "kf-ssi-"));
function mk(name, spec) { const p = path.join(TMP, name); execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", spec, "-frames:v", "1", p]); return p; }

(async () => {
  // -------------------------------------------------- 1) intake filter
  section("screenshot_intake — blank drop · keep-strongest dedup · fail-open");
  const blank = mk("blank.png", "color=c=black:s=1366x900");
  const hero = mk("hero.png", "testsrc=s=1366x900:d=1");
  const dup = path.join(TMP, "dup.png"); fs.copyFileSync(hero, dup);          // exact dup of hero
  const distinct = mk("distinct.png", "testsrc2=s=1366x900:d=1");

  await check("drops blank + duplicate, keeps hero + distinct, preserves order", async () => {
    const { keptShots, review } = await filterScreenshots({ shots: [hero, blank, dup, distinct] });
    const names = keptShots.map((s) => path.basename(s.path));
    eq(review.captured, 4, "captured");
    eq(review.kept, 2, "kept");
    ok(names.includes("hero.png") && names.includes("distinct.png"), "hero+distinct kept");
    ok(!names.includes("blank.png"), "blank dropped");
    ok(!names.includes("dup.png"), "duplicate dropped");
    eq(names[0], "hero.png", "original order preserved (hero first)");
    ok(review.dropped.some((d) => d.reason === "blank"), "blank reason");
    ok(review.dropped.some((d) => d.reason === "duplicate"), "duplicate reason");
  });
  await check("keep-STRONGEST: when a dup pair differs in detail, the busier one survives", async () => {
    // A blurred (low-detail) copy of hero + hero itself: the sharp one must win.
    const soft = path.join(TMP, "soft.png");
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", hero, "-vf", "boxblur=10:2", "-frames:v", "1", soft]);
    const { keptShots } = await filterScreenshots({ shots: [soft, hero] });
    // They may or may not be within Hamming<=10; if deduped, the sharp hero must be the keeper.
    if (keptShots.length === 1) eq(path.basename(keptShots[0].path), "hero.png", "sharp shot kept over blurred");
  });
  await check("fail-open: empty list and missing files never throw and keep unknowns", async () => {
    const empty = await filterScreenshots({ shots: [] });
    eq(empty.keptShots.length, 0, "empty");
    const missing = await filterScreenshots({ shots: [path.join(TMP, "nope.png")] });
    eq(missing.keptShots.length, 1, "a missing/unprobeable file is KEPT (unknown != bad)");
  });

  // -------------------------------------------------- 2) db merge
  section("db.setScreenshotReview — two-pass shallow-merge");
  await check("intake base then CD {demoted} coalesce into one field, arrays coerced", () => {
    const id = "ssitest_merge";
    db.insert({ id, kind: "project", created_at: Date.now() });
    db.setScreenshotReview(id, { captured: 3, kept: 2, dropped: [{ path: "b.png", reason: "blank" }], suppressed: [], notes: ["n"] });
    db.setScreenshotReview(id, { demoted: [{ path: "s.png", reason: "popup", coveragePct: 40 }] });
    const r = db.get(id).screenshotReview;
    eq(r.captured, 3, "base captured survives the merge");
    eq(r.kept, 2, "base kept survives");
    eq(r.dropped.length, 1, "base dropped survives");
    eq(r.demoted.length, 1, "CD demoted merged in");
    eq(r.demoted[0].reason, "popup", "demote reason");
  });

  // -------------------------------------------------- 3) CD force-demote (real path)
  section("creative_director — popup/loading/broken WEBSITE shots force-demoted (real reviewAndCurate)");
  // Stub the ONE network call: vision (user is an array with image_url) returns our
  // canned verdict; the advisory audio call (user is a string) returns benign JSON.
  const realChat = openrouter.chat;
  function stubVerdict(v) {
    openrouter.chat = async ({ user }) => {
      const text = Array.isArray(user) ? JSON.stringify({ verdicts: [v] }) : "{}";
      return { text, tokensIn: 1, tokensOut: 1 };
    };
  }
  const jobDir = path.join(TMP, "job"); fs.mkdirSync(path.join(jobDir, "assets", "images"), { recursive: true });
  const shotAbs = path.join(jobDir, "assets", "images", "site_0.png");
  fs.copyFileSync(hero, shotAbs);
  const websiteAsset = () => ({ path: "assets/images/site_0.png", type: "image", source: "website", sceneId: "s1", alt: "REAL website screenshot", width: 1366, height: 900, ratio: 1.518 });
  const storyboard = { scenes: [{ id: "s1", start: 0, duration: 4, purpose: "feature", visualDirection: "the product dashboard" }] };
  const script = { scenes: storyboard.scenes };

  async function runCD(id, verdict) {
    db.insert({ id, kind: "project", created_at: Date.now() });
    // Re-stage the fixture for EVERY run: a rejected shot is unlinked from disk by the
    // director (that is the point of the reject band), and the three cases share one
    // path — so without this, case 1's rejection starved cases 2 and 3 of a file and
    // they failed with "undefined" for reasons that had nothing to do with what they test.
    fs.copyFileSync(hero, shotAbs);
    stubVerdict(verdict);
    const assets = await reviewAndCurate({ jobId: id, storyboard, script, subject: "a dev tool", framePack: null, assets: [websiteAsset()], tracker: null, jobDir, orientation: "horizontal" });
    return assets.find((a) => a.source === "website");
  }
  const goodScores = { relevance: 90, visualQuality: 90, brandCompat: 80, storytelling: 85, motionPotential: 70, templateCompat: 85 };

  // The director has TWO popup bands (config.screenshotIntelligence): above
  // popupDemotePct (15) the shot drops to background B-roll; above popupRejectPct (35)
  // it leaves the wire entirely, because no slot or treatment rescues a frame a third
  // covered by someone else's UI. Both bands are asserted.
  await check("popupCoverage 25 (demote band) → __layoutDemoted + disclosed", async () => {
    const a = await runCD("ssi_popup", { n: 1, decision: "approve", scores: goodScores, prominence: "hero", assignScene: "s1", sectionType: "dashboard", sees: "dashboard", popupCoverage: 25, completeness: "ok", obstruction: "newsletter" });
    eq(a.__layoutDemoted, true, "demoted");
    eq(a.visionOk, false, "not prominent");
    const r = db.get("ssi_popup").screenshotReview;
    ok(r && r.demoted.some((d) => d.reason === "popup" && d.coveragePct === 25), "popup demotion disclosed");
  });
  await check("popupCoverage 40 (reject band) → removed from the wire + disclosed", async () => {
    const a = await runCD("ssi_popup_bad", { n: 1, decision: "approve", scores: goodScores, prominence: "hero", assignScene: "s1", sectionType: "dashboard", sees: "dashboard", popupCoverage: 40, completeness: "ok", obstruction: "consent" });
    ok(!a, "an unusable capture must not survive to the composer");
    const r = db.get("ssi_popup_bad").screenshotReview;
    ok(r && r.demoted.some((d) => d.action === "rejected" && d.coveragePct === 40), "popup rejection disclosed");
  });
  await check("completeness 'loading' → __layoutDemoted regardless of coverage", async () => {
    const a = await runCD("ssi_loading", { n: 1, decision: "approve", scores: goodScores, prominence: "hero", assignScene: "s1", sectionType: "dashboard", sees: "skeleton", popupCoverage: 0, completeness: "loading", obstruction: "none" });
    eq(a.__layoutDemoted, true, "loading demoted");
    const r = db.get("ssi_loading").screenshotReview;
    ok(r && r.demoted.some((d) => d.reason === "loading"), "loading disclosed");
  });
  await check("clean shot (coverage 3, completeness ok) → NOT demoted, stays prominent", async () => {
    const a = await runCD("ssi_clean", { n: 1, decision: "approve", scores: goodScores, prominence: "hero", assignScene: "s1", sectionType: "dashboard", sees: "clean dashboard", popupCoverage: 3, completeness: "ok", obstruction: "none" });
    ok(!a.__layoutDemoted, "clean shot not demoted");
    eq(a.visionOk, true, "clean shot stays prominent");
    ok(!db.get("ssi_clean").screenshotReview, "no screenshot review written for a clean shot");
  });
  openrouter.chat = realChat;

  console.log(`\n${failed ? "✗" : "✓"} screenshot-intake: ${passed} passed, ${failed} failed`);
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* noop */ }
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
