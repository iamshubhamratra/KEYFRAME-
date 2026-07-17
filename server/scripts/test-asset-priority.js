// Unit tests for the User Priority Assets system — the tier math (asset_priority),
// the coverage engine (asset_coverage), the pinning + classification routing
// (user_assets), and the scene-kit no-op law. Pure functions where possible; the
// scene-kit checks build real compositions (no browser, no DB).
//
// Usage:  node server/scripts/test-asset-priority.js [--verbose]
// Exit code 1 on any failure (gates CI) — same contract as test-brand-kit.js.

const path = require("node:path");
const fs = require("node:fs");
const { tierFor, rankKey, isTrustedProminent, isLogo, isOwned } = require("../src/services/asset_priority");
const { coverageFromUsed, coverageFromHtml, shouldRepair } = require("../src/services/asset_coverage");
const { isScreenshotLike } = require("../src/services/user_assets");
const sceneKit = require("../src/services/scene_kit");

const verbose = process.argv.includes("--verbose") || process.argv.includes("-v");
let failed = 0, passed = 0;
function check(name, fn) {
  try { fn(); passed++; if (verbose) console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}\n      ${String((e && e.message) || e)}`); }
}
function ok(cond, msg) { if (!cond) throw new Error(msg || "expected truthy"); }
function eq(a, b, msg) { if (a !== b) throw new Error(`${msg || "not equal"}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); }
function section(s) { console.log(`\n▐ ${s}`); }

// ---------------------------------------------------------------- tiers
section("asset_priority — tiers & rank");
const UP = { source: "upload" }, WEB = { source: "website" }, LIB = { source: "library:nimbus" }, ICO = { source: "iconify" }, STK = { source: "pixabay" }, CACHE = { source: "cache:pixabay" };

check("tierFor: upload 100 > website 80 > curated 60 > stock 40", () => {
  eq(tierFor(UP), 100, "upload"); eq(tierFor(WEB), 80, "website");
  eq(tierFor(LIB), 60, "library"); eq(tierFor(ICO), 60, "iconify");
  eq(tierFor(STK), 40, "stock"); eq(tierFor(CACHE), 40, "cache-stock");
  eq(tierFor(null), 40, "null → stock floor");
});
check("rankKey: a max-scored stock can NEVER outrank a zero-scored upload", () => {
  ok(rankKey(UP, 0) > rankKey(STK, 1000), "upload@0 must beat stock@1000");
  ok(rankKey(WEB, 0) > rankKey(STK, 999), "website@0 must beat stock@999");
});
check("rankKey: within a tier, quality still orders", () => {
  ok(rankKey(UP, 90) > rankKey(UP, 10), "higher score wins inside a tier");
});
check("isTrustedProminent: upload + website + library + visionOk; not raw stock", () => {
  ok(isTrustedProminent(UP), "upload"); ok(isTrustedProminent(WEB), "website");
  ok(isTrustedProminent(LIB), "library"); ok(isTrustedProminent({ source: "pixabay", visionOk: true }), "vision-approved stock");
  ok(!isTrustedProminent(STK), "raw stock is NOT prominent");
});
check("isOwned: upload + website only", () => {
  ok(isOwned(UP) && isOwned(WEB), "uploads/site owned"); ok(!isOwned(LIB) && !isOwned(STK), "curated/stock not owned");
});
check("isLogo: role-driven", () => {
  ok(isLogo({ role: "logo" }), "logo role"); ok(!isLogo({ role: "asset" }), "asset role"); ok(!isLogo({}), "no role");
});

// ---------------------------------------------------------------- routing
section("user_assets — screenshot vs photo routing");
check("isScreenshotLike: UI types are screenshots, photos aren't, unknown defaults screenshot", () => {
  ok(isScreenshotLike({ assetType: "dashboard" }), "dashboard");
  ok(isScreenshotLike({ assetType: "mobile-app" }), "mobile-app");
  ok(!isScreenshotLike({ assetType: "product-photo" }), "product-photo");
  ok(!isScreenshotLike({ assetType: "team" }), "team");
  ok(isScreenshotLike({}), "unclassified → screenshot (most uploads are)");
});

// ---------------------------------------------------------------- coverage
section("asset_coverage — the disclosure");
const covAssets = [
  { path: "uploads/logo.png", source: "upload", role: "logo", uploadId: "logo" },
  { path: "uploads/u1.png", source: "upload", uploadId: "u1", kindHint: "screenshot" },
  { path: "uploads/u2.png", source: "upload", uploadId: "u2", kindHint: "screenshot" },
  { path: "uploads/u3.png", source: "upload", uploadId: "u3", kindHint: "photo" },
  { path: "assets/images/0.jpg", source: "pixabay" },
];
check("coverageFromUsed: counts uploads only, logo reported separately", () => {
  const c = coverageFromUsed({ assets: covAssets, usedAssets: [
    { path: "uploads/u1.png", via: "hero" }, { path: "uploads/u2.png", via: "montage" }, { path: "uploads/logo.png", via: "logo" },
  ], logoPlacements: ["opening", "cta"] });
  eq(c.uploadedAssets, 3, "3 upload IMAGES (logo excluded)");
  eq(c.assetsUsed, 2, "2 shown");
  eq(c.usagePercentage, 67, "67%");
  eq(c.logoUsed, true, "logo used"); eq(c.logoPlacements.length, 2, "2 placements");
  ok(c.notes.length >= 1, "discloses the 1 unused upload");
});
check("coverageFromHtml: path-presence scan", () => {
  const c = coverageFromHtml({ assets: covAssets, indexHtml: '<img src="uploads/u1.png"><img src="uploads/logo.png">' });
  eq(c.assetsUsed, 1, "u1 shown"); eq(c.logoUsed, true, "logo shown");
});
check("shouldRepair: fires below 60% or on an unplaced logo, never without uploads", () => {
  ok(shouldRepair({ assets: covAssets, coverage: { uploadedAssets: 3, assetsUsed: 1, usagePercentage: 33, logoUsed: true } }), "33% → repair");
  ok(shouldRepair({ assets: covAssets, coverage: { uploadedAssets: 3, assetsUsed: 3, usagePercentage: 100, logoUsed: false } }), "unplaced logo → repair");
  ok(!shouldRepair({ assets: covAssets, coverage: { uploadedAssets: 3, assetsUsed: 3, usagePercentage: 100, logoUsed: true } }), "100% + logo → no repair");
  ok(!shouldRepair({ assets: [{ source: "pixabay" }], coverage: { uploadedAssets: 0, usagePercentage: 0 } }), "no uploads → never repair");
});

// ---------------------------------------------------------------- scene-kit weave
section("scene_kit — uploads lead, logo at key moments, no-op holds");
const SB = { title: "Test", durationSec: 12, scenes: [
  { id: "s1", start: 0, duration: 3, purpose: "hook", kind: "hook", headline: "Ship faster", emphasis: "faster" },
  { id: "s2", start: 3, duration: 3, purpose: "feature", kind: "text", headline: "One dashboard" },
  { id: "s3", start: 6, duration: 3, purpose: "proof", kind: "text", headline: "Real results" },
  { id: "s4", start: 9, duration: 3, purpose: "cta", kind: "cta", headline: "Start today", subtext: "app.co" },
] };
const DIMS = { width: 1280, height: 720, fps: 30 };

check("no-op law: null skin + no assets renders deterministically", () => {
  const a = sceneKit.buildComposition({ storyboard: SB, dims: DIMS, framePack: "blockframe", assets: [], seedKey: "k" });
  const b = sceneKit.buildComposition({ storyboard: SB, dims: DIMS, framePack: "blockframe", assets: [], seedKey: "k" });
  eq(a.indexHtml, b.indexHtml, "same inputs → same bytes");
  eq(a.usedAssets.length, 0, "nothing woven"); eq(a.logoPlacements.length, 0, "no logo");
});
check("logo renders at open + CTA (2 references), never a persistent watermark", () => {
  const assets = [{ path: "uploads/logo.png", type: "image", role: "logo", source: "upload", uploadId: "logo", hasAlpha: true, alt: "brand logo" }];
  const c = sceneKit.buildComposition({ storyboard: SB, dims: DIMS, framePack: "blockframe", assets, seedKey: "k" });
  eq((c.indexHtml.match(/uploads\/logo\.png/g) || []).length, 2, "exactly 2 logo refs (open + cta)");
  eq(c.logoPlacements.join(","), "opening,cta", "placements reported");
  ok(c.usedAssets.some((u) => u.via === "logo"), "logo tracked in usedAssets");
});
check("an uploaded screenshot is woven as a prominent asset", () => {
  const assets = [{ path: "uploads/u1.png", type: "image", source: "upload", uploadId: "u1", kindHint: "screenshot", sceneId: "s2", width: 1600, height: 1000, ratio: 1.6, alt: "THE USER'S OWN uploaded dashboard" }];
  const c = sceneKit.buildComposition({ storyboard: SB, dims: DIMS, framePack: "blockframe", assets, seedKey: "k" });
  ok(c.indexHtml.includes("uploads/u1.png"), "upload appears in the film");
  ok(c.usedAssets.some((u) => u.path === "uploads/u1.png" && u.via !== "unused"), "upload tracked as used");
});
check("logo is excluded from the generic pools (never a montage tile)", () => {
  // A logo + 3 stock photos: the montage must not contain the logo path in a tile role.
  const assets = [
    { path: "uploads/logo.png", type: "image", role: "logo", source: "upload", uploadId: "logo", alt: "brand logo" },
    { path: "assets/images/0.jpg", type: "image", source: "website", sceneId: "s2", alt: "screenshot", width: 1600, height: 1000, ratio: 1.6 },
  ];
  const c = sceneKit.buildComposition({ storyboard: SB, dims: DIMS, framePack: "blockframe", assets, seedKey: "k" });
  const logoUses = c.usedAssets.filter((u) => u.path === "uploads/logo.png");
  ok(logoUses.every((u) => u.via === "logo"), "logo only ever appears via the logo slot");
});

console.log(`\n${failed ? "✗" : "✓"} asset-priority: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

// keep fs/path referenced (harness parity); noop
void fs; void path;
