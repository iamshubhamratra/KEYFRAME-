// Characterization tests for the template-aware asset preparation pipeline:
//   services/template_media.js  — what a template says it can show
//   services/asset_quality.js   — how good each collected asset actually is
//   services/crop_engine.js     — where a cover-fit box should be anchored
//   services/asset_reuse.js     — the quality promotion pass that uses all three
//
// THE INVARIANT THAT MATTERS MOST, and the first thing asserted: with no media contract,
// no quality scores and no crop analysis, every one of these must be a NO-OP. That is what
// protects the 46 existing packs — the whole system is additive, and a pack that has not
// been authored yet must render exactly as it did before.
//
// Pure functions and a handful of fixture images. No network, no LLM, no render.

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const tm = require("../src/services/template_media");
const aq = require("../src/services/asset_quality");
const ce = require("../src/services/crop_engine");
const { optimizeAssetReuse, buildSlots } = require("../src/services/asset_reuse");

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { const r = fn(); if (r && typeof r.then === "function") return r.then(
    () => { console.log(`  ok   ${name}`); pass++; },
    (e) => { console.log(`  FAIL ${name}\n       ${e.message}`); fail++; });
    console.log(`  ok   ${name}`); pass++;
  } catch (e) { console.log(`  FAIL ${name}\n       ${e.message}`); fail++; }
  return undefined;
};

// ---------------------------------------------------------------- fixtures
const SCENES = [
  { id: "s1", start: 0,  duration: 3, purpose: "hook",    role: "hook" },
  { id: "s2", start: 3,  duration: 3, purpose: "context", role: "context" },
  { id: "s3", start: 6,  duration: 3, purpose: "feature", role: "feature" },
  { id: "s4", start: 9,  duration: 3, purpose: "how",     role: "how" },
  { id: "s5", start: 12, duration: 3, purpose: "proof",   role: "proof" },
  { id: "s6", start: 15, duration: 3, purpose: "quote",   role: "quote" },
  { id: "s7", start: 18, duration: 3, purpose: "cta",     role: "cta" },
];
// A LONG-FORM PACK NEEDS A LONG-FORM SCRIPT. The seven-beat fixture above is a 21-second short,
// and the twenty-seven five-minute packs pin their slots at scene 13 and scene 39 — so against a
// short script BOTH are correctly dropped ("a slot pinned past the end of a short script is
// dropped, not clamped", asserted below), the authored block empties, and the plan degrades to
// derived. That is the resolver behaving exactly as specified; it is the FIXTURE that was wrong
// to hand a five-minute template a twenty-one-second film.
const LONGFORM_SCENES = Array.from({ length: 40 }, (_, i) => ({
  id: `l${i + 1}`, start: i * 7.5, duration: 7.5,
  purpose: SCENES[i % SCENES.length].purpose, role: SCENES[i % SCENES.length].role,
}));
const scenesFor = (pack) =>
  (require("../src/services/frame_manifest").packForm(pack).kind === "longform" ? LONGFORM_SCENES : SCENES);

const PORTRAIT = { width: 1080, height: 1920 };
const LANDSCAPE = { width: 1920, height: 1080 };

const asset = (over = {}) => ({
  path: "assets/images/x.jpg", type: "image", source: "pixabay", visionOk: true,
  width: 1600, height: 900, ratio: 1.78, alt: "a product photo",
  sharpness: 900, stdev: 30, bpp: 0.8, dominantColor: "#3A5F8A", ...over,
});

console.log("\n-- template_media ------------------------------------------------");

t("DERIVED: a pack with no media block still yields a usable plan", () => {
  // All 46 shipped packs now carry an authored block (scripts/apply-media-profiles.js), so
  // the derived path has to be constructed deliberately — it is the path a NEWLY ADDED pack
  // takes before anyone has authored it, and it must keep working forever.
  const plan = tm.resolveMediaPlan({ pack: "unauthored-pack", scenes: SCENES, dims: PORTRAIT, manifest: { renderer: "" } });
  assert.equal(plan.source, "derived", "an unauthored pack must derive, not invent an authored plan");
  assert.ok(plan.slotCount > 0, "a derived plan must still name some slots");
  assert.ok(plan.placeholders.every((p) => p.width > 0 && p.height > 0), "every slot needs real geometry");
  assert.ok(plan.aspects.length > 0, "the crop engine needs at least one aspect to analyse");
  assert.equal(plan.criticalCount, 1, "and a derived plan still names a most-important slot");
});

t("SHIPPED: every installed pack resolves to a usable plan with exactly one hero", () => {
  const registry = require("../src/services/frame_registry");
  const packs = registry.listPacks();
  assert.ok(packs.length >= 40, `expected the full pack library, saw ${packs.length}`);
  for (const pack of packs) {
    const plan = tm.resolveMediaPlan({ pack, scenes: scenesFor(pack), dims: PORTRAIT });
    // `hybrid` is legitimate: a pack whose only picture box sits on a content-critical beat
    // declares a real APPETITE but no usable slot geometry, so the quota is authored and the
    // boxes are derived. bauhaus-riot, bloom-fable and prisma-bloc are in that state.
    assert.ok(["authored", "hybrid"].includes(plan.source), `${pack}: unexpected plan source ${plan.source}`);
    assert.ok(plan.slotCount > 0, `${pack}: declares no slot at all`);
    assert.equal(plan.criticalCount, 1, `${pack}: a film has exactly one most-important picture, saw ${plan.criticalCount}`);
    // A pack whose every plate is contain-fit (bauhaus-riot letterboxes all of them) genuinely
    // has nothing to crop, so an empty aspect list is correct there — asset_prep falls back to
    // the generic shapes. What must never happen is a pack with cover slots and no aspects.
    const covers = plan.placeholders.filter((p) => p.objectFit === "cover").length;
    assert.equal(plan.aspects.length > 0, covers > 0,
      `${pack}: ${covers} cover slot(s) but ${plan.aspects.length} crop aspect(s)`);
  }
});

t("EXACTLY ONE HERO: a pack declaring several critical slots keeps only the earliest", () => {
  const media = { slotsByRole: {
    hook: { count: 1, width: 1000, height: 800, priority: "critical", objectFit: "cover" },
    feature: { count: 2, width: 900, height: 700, priority: "critical", objectFit: "cover" },
  } };
  const plan = tm.resolveMediaPlan({ pack: "fake", scenes: SCENES, dims: LANDSCAPE, manifest: { renderer: "om-garden", media } });
  assert.equal(plan.criticalCount, 1, "three declared criticals must collapse to one");
  const crit = plan.placeholders.find((p) => p.priority === "critical");
  assert.equal(crit.sceneIndex, Math.min(...plan.placeholders.map((p) => p.sceneIndex)), "and it must be the earliest");
  assert.ok(plan.placeholders.filter((p) => p.priority === "high").length >= 2, "the others fall back to high, not lower");
});

t("DERIVED: never claims a slot on a scene the renderer cannot draw on", () => {
  // prisma-bloc's hook renders the brand mark only — asset_reuse.SHOWABLE_BY_RENDERER
  // documents that om_stage.bHook draws sceneAssets[0] while prisma's takes `_assets`.
  const plan = tm.resolveMediaPlan({ pack: "prisma-bloc", scenes: SCENES, dims: PORTRAIT });
  assert.ok(!plan.placeholders.some((p) => p.sceneIndex === 0),
    "a hook slot on a renderer that draws no picture there would report coverage the film does not have");
  // om-garden IS verified to draw on its hook, so it may claim one.
  const om = tm.resolveMediaPlan({ pack: "organic-garden", scenes: SCENES, dims: PORTRAIT });
  assert.ok(om.placeholders.some((p) => p.sceneIndex === 0),
    "om_stage draws on its hook, so the plan should use it");
});

t("DERIVED: content-critical scenes never become asset slots", () => {
  const plan = tm.resolveMediaPlan({ pack: "organic-garden", scenes: SCENES, dims: PORTRAIT });
  const roles = new Set(plan.placeholders.map((p) => p.role));
  assert.ok(!roles.has("quote"), "a quote scene's content is the WORDS — an image there deletes it");
  assert.ok(!roles.has("cta"), "a CTA's content is the call to action");
});

t("EVERY PLAN HAS A MOST-IMPORTANT SLOT", () => {
  for (const pack of ["edition", "prisma-bloc", "organic-garden", "showcase"]) {
    const plan = tm.resolveMediaPlan({ pack, scenes: SCENES, dims: PORTRAIT });
    assert.equal(plan.criticalCount >= 1, true,
      `${pack}: with no critical slot the ranker has nothing to protect and "best asset in the best slot" is unenforceable`);
  }
});

t("AUTHORED: a declared block beats the derivation, and round-robins over its role's scenes", () => {
  const media = {
    requiredAssets: { screenshots: 8, productImages: 3, logos: 1 },
    placeholders: [
      { id: "hero", role: "feature", width: 1600, height: 900, priority: "critical", objectFit: "cover", kind: "screenshots" },
      { id: "panel-2", role: "feature", width: 800, height: 600, priority: "high", objectFit: "cover" },
      { id: "mark", role: "feature", width: 400, height: 160, priority: "low", objectFit: "contain", kind: "logos" },
    ],
    slotsByRole: { proof: { count: 2, width: 700, height: 700, priority: "medium", objectFit: "cover" } },
  };
  const plan = tm.resolveMediaPlan({ pack: "fake", scenes: SCENES, dims: LANDSCAPE, manifest: { renderer: "showcase", media } });
  assert.equal(plan.source, "authored");
  assert.equal(plan.requiredAssets.screenshots, 8, "an authored quota must win over the counted one");
  assert.equal(plan.placeholders.filter((p) => p.role === "proof").length, 2, "slotsByRole instantiates per scene of that role");
  assert.ok(plan.placeholders.some((p) => p.id === "hero" && p.priority === "critical"));
  // Only ONE feature scene exists in the fixture, so all three fixed feature slots land on it.
  const featureSlots = plan.placeholders.filter((p) => p.sceneId === "s3");
  assert.equal(featureSlots.length, 3, "three declared feature panels on the one feature scene");
});

t("AUTHORED: a slot pinned past the end of a short script is dropped, not clamped", () => {
  const media = { placeholders: [
    { id: "p1", sceneIndex: 0, width: 100, height: 100, priority: "high", objectFit: "cover" },
    { id: "p9", sceneIndex: 40, width: 100, height: 100, priority: "high", objectFit: "cover" },
  ] };
  const plan = tm.resolveMediaPlan({ pack: "fake", scenes: SCENES, dims: LANDSCAPE, manifest: { renderer: "showcase", media } });
  assert.ok(!plan.placeholders.some((p) => p.id === "p9"), "a phantom slot would be reported as an empty placeholder forever");
  assert.ok(plan.placeholders.some((p) => p.id === "p1"));
});

t("AUTHORED: a malformed media block degrades to a derived plan rather than throwing", () => {
  const plan = tm.resolveMediaPlan({
    pack: "fake", scenes: SCENES, dims: PORTRAIT,
    manifest: { renderer: "om-garden", media: { placeholders: [{ id: "bad", width: "wide", height: -3 }] } },
  });
  assert.ok(["derived", "hybrid"].includes(plan.source), "a typo in one pack must never cost a film its assets");
  assert.ok(plan.slotCount > 0);
});

t("BUDGET: a hungry template RAISES the duration floor", () => {
  const floor = { total: 8, maxPhotos: 5, maxVectors: 2, maxVideos: 1, maxScreenshots: 3 };
  // Ten fixed panels, all on scenes this script actually has.
  const media = {
    requiredAssets: { screenshots: 10 },
    placeholders: Array.from({ length: 10 }, (_, i) => ({
      id: `panel-${i + 1}`, sceneIndex: 1 + (i % 5), width: 1200, height: 800,
      priority: i === 0 ? "critical" : "high", objectFit: "cover", kind: "screenshots",
    })),
    oversample: 1.8,
  };
  const plan = tm.resolveMediaPlan({ pack: "fake", scenes: SCENES, dims: LANDSCAPE, manifest: { renderer: "showcase", media } });
  assert.equal(plan.slotCount, 10);
  const target = tm.collectionTargetFor(plan, floor);
  assert.ok(target.total > floor.total, `a ten-panel template must outgrow an 8-asset duration budget (got ${target.total})`);
  assert.ok(target.maxScreenshots >= 10, "and be allowed to collect ten screenshots");
  assert.ok(target.__raisedBy > 0, "the raise must be disclosed, not silent");
});

t("BUDGET: a sparse template CAPS a generous duration floor", () => {
  // The other half of the same complaint. A template that places a handful of pictures has
  // no use for sixty candidates: the surplus is downloaded, probed, scored, cropped and
  // discarded, all of it on the render's critical path.
  const sparse = tm.resolveMediaPlan({ pack: "fetch", scenes: SCENES.slice(0, 3), dims: LANDSCAPE });
  const target = tm.collectionTargetFor(sparse, { total: 60, maxPhotos: 40, maxVectors: 15, maxVideos: 2 });
  assert.ok(target.total < 60, `a ${sparse.slotCount}-slot template should not chase 60 candidates (got ${target.total})`);
  assert.ok(target.__raisedBy < 0, "the cap must be disclosed too");
  // ...but never so tight that the ranker has nothing to reject.
  assert.ok(target.total >= sparse.slotCount, "every slot still needs at least one candidate");
});

t("PIN SUPPRESSION: a scene stops asking for stock when its SLOTS are full, not at its first pin", () => {
  // The binding constraint on "not enough images". showcaseTargets returns every substance
  // scene, so pins claim nearly all of them; under the old boolean rule one pin silenced a
  // scene entirely. Audited job ahtquvd86o shipped 9 assets of which exactly ONE was stock
  // while its own budget said maxPhotos = 9.
  const slots = new Map([["s2", 2], ["s3", 2], ["s5", 1]]);
  const one = new Map([["s2", 1], ["s3", 1], ["s5", 1]]);
  assert.equal(tm.sceneIsSatisfied("s2", { pins: one, slots }), false, "1 pin into 2 slots still wants a second picture");
  assert.equal(tm.sceneIsSatisfied("s5", { pins: one, slots }), true, "1 pin into 1 slot is full");
  assert.equal(tm.sceneIsSatisfied("s9", { pins: one, slots }), false, "an unpinned scene is never satisfied");

  const two = new Map([["s2", 2]]);
  assert.equal(tm.sceneIsSatisfied("s2", { pins: two, slots }), true, "2 pins into 2 slots is full");

  // NO PLAN ⇒ the historical boolean, exactly. This is what protects a pack with no contract.
  const empty = new Map();
  assert.equal(tm.sceneIsSatisfied("s2", { pins: one, slots: empty }), true, "with no slot data any pin satisfies, as before");
  assert.equal(tm.sceneIsSatisfied("s9", { pins: one, slots: empty }), false);
});

t("PIN SUPPRESSION: slotsPerScene counts real slots and ignores logo lockups", () => {
  const plan = tm.resolveMediaPlan({ pack: "organic-garden", scenes: SCENES, dims: PORTRAIT });
  const per = tm.slotsPerScene(plan);
  assert.ok(per.size > 0, "a plan must yield per-scene counts");
  const total = [...per.values()].reduce((a, b) => a + b, 0);
  const nonLogo = plan.placeholders.filter((p) => p.kind !== "logos").length;
  assert.equal(total, nonLogo, "every non-logo slot is counted exactly once");
  assert.ok([...per.values()].some((n) => n >= 2), "a multi-slot scene must be visible as such");
});

t("CAPTURE TARGET: the collector asks the template BEFORE the browser opens", () => {
  // The capture cap was a literal `3` in ingest/website.js, chosen before any template could
  // declare an appetite. Measured on a real razorpay.com ingest: the page offered EIGHT
  // candidate sections and three were allowed, while `drive` declares it can place 13.
  const pinned = tm.captureTarget({ framePack: "drive", cap: 6 });
  assert.ok(pinned.target > 3, `a hungry pinned pack must raise the target, got ${pinned.target}`);
  assert.ok(pinned.target <= 6, "and stay under the cap");
  assert.match(pinned.source, /drive/, "the reason must name the pack");

  // A SPARSE pinned pack must not drag capture below the historical floor: screenshots are
  // tier-80 owned material and the floor is what every pack got before this existed.
  const sparse = tm.captureTarget({ framePack: "fetch", cap: 6 });
  assert.equal(sparse.target, 3, `a sparse pack must not capture less than the floor, got ${sparse.target}`);

  // "auto" cannot know the pack — the frame selector has not run — so it captures for the
  // hungriest installed one. Erring high is right: an unused capture costs one scroll and one
  // PNG; a missing one cannot be recovered without relaunching Chrome mid-production.
  const auto = tm.captureTarget({ framePack: "auto", cap: 6 });
  assert.ok(auto.target >= 3 && auto.target <= 6);
  assert.match(auto.source, /hungriest/, "and it must say so");

  // Unknown pack and a dead registry both degrade to the floor, never to zero.
  assert.equal(tm.captureTarget({ framePack: "no-such-pack", cap: 6 }).target, 3);
  assert.equal(tm.screenshotAppetite("no-such-pack"), 0);
});

console.log("\n-- asset_quality -------------------------------------------------");

t("SCORING: a crisp, large, information-rich image outranks a soft, small, flat one", () => {
  const good = aq.scoreAsset(asset({ sharpness: 2900, stdev: 40, width: 2400, height: 1600, bpp: 1.1 }));
  const poor = aq.scoreAsset(asset({ sharpness: 60, stdev: 9, width: 420, height: 260, bpp: 0.15 }));
  assert.ok(good.score > poor.score + 20, `expected a wide gap, got ${good.score} vs ${poor.score}`);
  assert.ok(["hero", "high"].includes(good.grade), `crisp large image graded ${good.grade}`);
  assert.ok(["low", "reject"].includes(poor.grade), `soft tiny image graded ${poor.grade}`);
});

t("SCORING: an UNMEASURED asset is neutral, never penalised", () => {
  // "We could not measure this" must not read as "this is bad" — that would systematically
  // demote every asset arriving by a path that skips the fetch-time probe.
  const unknown = aq.scoreAsset({ path: "a.jpg", source: "pixabay" });
  assert.ok(unknown.score >= 40 && unknown.score <= 75, `unmeasured scored ${unknown.score}; expected a neutral band`);
  assert.ok(!["reject"].includes(unknown.grade));
});

t("REGRESSION: an absent slot must not read as a one-pixel slot", () => {
  // Number(null) === 0 and 0 is finite, so the obvious `num(slot && slot.areaShare, 0.33)`
  // returned 0 — making every slot 1px and every resolution score a perfect 20/20. Caught by
  // the first end-to-end run ("into ~1px slot (x2217.57)").
  const noSlot = aq.scoreAsset(asset({ width: 320, height: 200 }), { frame: PORTRAIT });
  assert.ok(noSlot.parts.resolution < 20,
    `a 320x200 image cannot be a perfect resolution match for a 1080x1920 frame (got ${noSlot.parts.resolution}/20)`);
});

t("SCORING: resolution is judged against the SLOT, not in the abstract", () => {
  const a = asset({ width: 800, height: 500 });
  const big = aq.scoreAsset(a, { slot: { areaShare: 0.8 }, frame: PORTRAIT });
  const small = aq.scoreAsset(a, { slot: { areaShare: 0.05 }, frame: PORTRAIT });
  assert.ok(small.parts.resolution > big.parts.resolution,
    "the same image is ample for a thumbnail and starved for a full-bleed hero");
});

t("TIER FLOOR: owned material is never rejected on pixel evidence alone", () => {
  // Worst case on every axis at once, which is what it takes to drive an owned asset under
  // the floor: the editorial component alone floors at 0.75 for owned material, so a merely
  // soft upload lands at `low` on its own and the floor never has to fire. It has to be
  // genuinely broken — unusable pixels AND rejected by the vision gate — before the tier
  // guarantee is the thing doing the work.
  const wreck = { source: "upload", sharpness: 5, stdev: 6, width: 180, height: 120, bpp: 0.05,
    dominantColor: "#ffffff", subjectFocus: 0.25, visionOk: false, cdScore: 4 };
  const badUpload = aq.scoreAsset(asset(wreck));
  assert.notEqual(badUpload.grade, "reject", "the user chose it; the most we may do is rank it below their better material");
  assert.ok(badUpload.vetoes.some((v) => /tier floor/.test(v)), "and the floor must be disclosed, not silent");

  const badStock = aq.scoreAsset(asset({ ...wreck, source: "pixabay" }));
  assert.equal(badStock.grade, "reject", "identical pixels from stock get no such protection");

  // And a merely-soft upload should NOT need the floor — it should stand on its own score.
  const soft = aq.scoreAsset(asset({ source: "upload", sharpness: 20, stdev: 7, width: 300, height: 200, bpp: 0.1 }));
  assert.notEqual(soft.grade, "reject");
  assert.equal((soft.vetoes || []).some((v) => /tier floor/.test(v)), false,
    "the floor is a backstop, not a routine crutch");
});

t("A LOGO IS A MARK, NOT A PHOTOGRAPH", () => {
  const logo = aq.scoreAsset({ path: "l.svg", role: "logo", source: "upload", sharpness: 0, stdev: 2 });
  assert.equal(logo.grade, "high", "grading a clean wordmark against photographic sharpness would demote every one of them");
});

t("TIER STILL OUTRANKS QUALITY WITHIN A NORMAL SLOT", () => {
  const upload = asset({ source: "upload", qualityScore: 45, qualityGrade: "medium" });
  const stock = asset({ source: "pixabay", qualityScore: 95, qualityGrade: "hero" });
  const order = [stock, upload].sort((x, y) => aq.compareForSlot(x, y, "high"));
  assert.equal(order[0].source, "upload", "the house law: 40*1000 + 100 < 100*1000 + 0");
});

t("...BUT A CRITICAL SLOT REFUSES A BROKEN PICTURE, WHATEVER ITS TIER", () => {
  const upload = asset({ source: "upload", qualityScore: 10, qualityGrade: "reject" });
  const stock = asset({ source: "pixabay", qualityScore: 80, qualityGrade: "high" });
  const order = [upload, stock].sort((x, y) => aq.compareForSlot(x, y, "critical"));
  assert.equal(order[0].source, "pixabay", "a hero showing a broken image is worse than a hero showing decent stock");
});

t("FLOORS: a critical slot demands a higher grade than a low one", () => {
  const medium = asset({ qualityGrade: "medium" });
  assert.equal(aq.meetsFloor(medium, "critical"), false);
  assert.equal(aq.meetsFloor(medium, "medium"), true);
});

t("scoreAssets annotates in place and never throws on junk", () => {
  const list = [asset(), { path: "b.jpg" }, null, { nopath: true }];
  const hist = aq.scoreAssets(list, { frame: PORTRAIT });
  assert.ok(list[0].qualityScore > 0 && list[0].qualityGrade);
  assert.equal(Object.values(hist).reduce((a, b) => a + b, 0) >= 2, true);
});

console.log("\n-- crop_engine ---------------------------------------------------");

t("ELIGIBILITY: vectors, videos and logos are skipped", () => {
  assert.equal(ce.isCroppable({ path: "a/icon.svg" }), false, "a vector is placed contain-fit and never cropped");
  assert.equal(ce.isCroppable({ path: "a/clip.mp4" }), false);
  assert.equal(ce.isCroppable({ path: "a/x.png", role: "logo" }), false, "cropping a wordmark is never acceptable");
  assert.equal(ce.isCroppable({ path: "a/photo.jpg" }), true);
});

t("CONTRACT: the output is a CSS object-position string", () => {
  assert.equal(ce.toObjectPosition({ x: 0.632, y: 0.281 }), "63% 28%");
  assert.equal(ce.toObjectPosition({ x: -5, y: 9 }), "0% 100%", "must clamp into the legal range");
  assert.equal(ce.toObjectPosition(null), null);
});

t("NO-OP WITHOUT ANALYSIS: focusFor returns the caller's own art direction", () => {
  // This is the invariant that keeps 46 packs rendering byte-identically until the engine
  // has actually looked at something. Proven independently by the golden composer suite.
  assert.equal(ce.focusFor({ path: "a.jpg" }, 400, 300, "center top"), "center top");
  assert.equal(ce.focusFor({ path: "a.jpg" }, 400, 300, null), "center center");
  assert.equal(ce.focusFor(null, 0, 0, "top center"), "top center");
});

t("PRECEDENCE: content truth outranks a generic call-site literal", () => {
  const a = { path: "a.jpg", cropFocus: "63% 28%" };
  assert.equal(ce.focusFor(a, 0, 0, "center top"), "63% 28%");
  assert.equal(ce.focusFor(a, 0, 0, "center top", { force: true }), "center top", "an explicit force still wins");
});

t("PER-PLACEHOLDER: the nearest analysed aspect is the one used", () => {
  const a = { path: "a.jpg", cropFocus: "50% 50%", cropFocusByAspect: { "0.75": "20% 80%", "1.78": "70% 30%" } };
  assert.equal(ce.focusFor(a, 1600, 900, null), "70% 30%", "a 16:9 box must get the 1.78 analysis");
  assert.equal(ce.focusFor(a, 600, 800, null), "20% 80%", "a 3:4 box must get the 0.75 analysis");
});

t("HEURISTIC: the original ratio rule is preserved exactly as the last resort", () => {
  assert.equal(ce.heuristicFocus({ ratio: 1.6 }, "screenshot"), "top center");
  assert.equal(ce.heuristicFocus({ ratio: 0.5 }, "screenshot"), "top center");
  assert.equal(ce.heuristicFocus({ ratio: 1.0 }, "screenshot"), "center center");
  assert.equal(ce.heuristicFocus({ ratio: 1.6 }, "photo"), "center center");
});

t("READING ORDER: a tall page capture is pulled back toward its top, in proportion to what the crop discards", () => {
  const measured = { x: 0.5, y: 0.72 };
  const geom = { kind: "screenshot", imgW: 1170, imgH: 2532 };
  const wide = ce.applyReadingOrderPrior(measured, { ...geom, aspect: 1.78 });
  const square = ce.applyReadingOrderPrior(measured, { ...geom, aspect: 1.0 });
  assert.ok(wide.y < square.y, "the wider the box, the more height is thrown away, the harder the prior must pull");
  assert.ok(wide.y < measured.y && square.y < measured.y, "both must move up from the measured point");
  // A photograph is left alone: its subject is wherever saliency found it.
  const photo = ce.applyReadingOrderPrior(measured, { kind: "photo", imgW: 1170, imgH: 2532, aspect: 1.78 });
  assert.equal(photo.y, measured.y);
  // A box NARROWER than the image discards width, not height — no vertical prior applies.
  const tallBox = ce.applyReadingOrderPrior(measured, { kind: "screenshot", imgW: 2732, imgH: 1800, aspect: 0.75 });
  assert.equal(tallBox.y, measured.y);
});

t("SUBJECT CONCENTRATION: a clustered energy map scores above a uniform one", () => {
  const N = 32;
  const uniform = new Float64Array(N * N).fill(1);
  const clustered = new Float64Array(N * N).fill(0.01);
  for (let y = 4; y < 12; y++) for (let x = 4; x < 12; x++) clustered[y * N + x] = 50;
  const u = ce.concentrationOf(uniform, N);
  const c = ce.concentrationOf(clustered, N);
  assert.ok(c > u, `clustered ${c} must beat uniform ${u}`);
  assert.ok(u > 0.2 && u < 0.35, `a uniform map should sit near the 0.25 baseline, got ${u}`);
});

console.log("\n-- placement (asset_reuse) ---------------------------------------");

t("SLOTS: a media plan replaces the one-per-scene approximation and carries priority", () => {
  const plan = tm.resolveMediaPlan({ pack: "organic-garden", scenes: SCENES, dims: PORTRAIT });
  const slots = buildSlots(SCENES, { native: true, renderer: "om-garden", mediaPlan: plan, dims: PORTRAIT });
  assert.ok(slots.length > 0);
  assert.ok(slots.every((s) => s.priority), "every slot must know how much it matters");
  assert.ok(slots.some((s) => s.priority === "critical"));
  assert.ok(slots.every((s) => s.targetRatio > 0), "and its real shape, so aspect scoring stops being a guess");
});

t("SLOTS: with no plan, the legacy per-scene rule is unchanged", () => {
  const withPlan = buildSlots(SCENES, { native: true, renderer: "om-garden", mediaPlan: null, dims: PORTRAIT });
  assert.ok(withPlan.length > 0);
  assert.ok(withPlan.every((s) => s.priority), "legacy slots still get a priority so the ranker has a target");
  assert.equal(withPlan[0].priority, "critical", "the earliest addressable scene is the first picture a viewer sees");
});

t("PROMOTION: the best picture reaches the critical slot, and the weak one takes its place", () => {
  const plan = tm.resolveMediaPlan({ pack: "organic-garden", scenes: SCENES, dims: PORTRAIT });
  const crit = plan.placeholders.find((p) => p.priority === "critical");
  const others = plan.placeholders.filter((p) => p.priority !== "critical");
  assert.ok(crit && others.length >= 2, "fixture needs a critical slot and two others");

  const weak = asset({ path: "a/weak.jpg", sceneId: crit.sceneId, qualityScore: 35, qualityGrade: "low", cdProminence: "support" });
  const great = asset({ path: "a/great.jpg", sceneId: others[1].sceneId, qualityScore: 92, qualityGrade: "hero", cdProminence: "support" });
  const mid = asset({ path: "a/mid.jpg", sceneId: others[0].sceneId, qualityScore: 58, qualityGrade: "medium", cdProminence: "support" });

  const { review } = optimizeAssetReuse({
    assets: [weak, great, mid], script: { scenes: SCENES }, framePack: "organic-garden",
    dims: PORTRAIT, native: true, renderer: "om-garden", acceptsVectors: false, seedKey: "t", mediaPlan: plan,
  });
  assert.equal(great.sceneId, crit.sceneId, "the hero-grade picture must end up in the critical slot");
  assert.notEqual(weak.sceneId, crit.sceneId, "and the weak one must not stay there");
  assert.ok(review.qualityPromotions >= 1, "the swap must be disclosed");
});

t("PROMOTION: takes the BEST donor, not the first one it happens to iterate past", () => {
  // The obvious loop takes the first acceptable swap, and the first end-to-end run duly
  // promoted a `medium` (55) into the hero while a `hero` (88) stayed in a support tile.
  const plan = tm.resolveMediaPlan({ pack: "organic-garden", scenes: SCENES, dims: PORTRAIT });
  const crit = plan.placeholders.find((p) => p.priority === "critical");
  const others = plan.placeholders.filter((p) => p.priority !== "critical");
  const weak = asset({ path: "a/weak.jpg", sceneId: crit.sceneId, qualityScore: 30, qualityGrade: "low" });
  const mid = asset({ path: "a/mid.jpg", sceneId: others[0].sceneId, qualityScore: 55, qualityGrade: "medium" });
  const best = asset({ path: "a/best.jpg", sceneId: others[1].sceneId, qualityScore: 95, qualityGrade: "hero" });
  optimizeAssetReuse({
    assets: [weak, mid, best], script: { scenes: SCENES }, framePack: "organic-garden",
    dims: PORTRAIT, native: true, renderer: "om-garden", acceptsVectors: false, seedKey: "t", mediaPlan: plan,
  });
  assert.equal(best.sceneId, crit.sceneId, "the 95 belongs in the hero, not the 55");
});

t("PROMOTION: conserves coverage exactly — a swap never empties a scene", () => {
  const plan = tm.resolveMediaPlan({ pack: "organic-garden", scenes: SCENES, dims: PORTRAIT });
  const crit = plan.placeholders.find((p) => p.priority === "critical");
  const others = plan.placeholders.filter((p) => p.priority !== "critical");
  const list = [
    asset({ path: "a/1.jpg", sceneId: crit.sceneId, qualityScore: 30, qualityGrade: "low" }),
    asset({ path: "a/2.jpg", sceneId: others[0].sceneId, qualityScore: 90, qualityGrade: "hero" }),
  ];
  const before = new Set(list.map((a) => String(a.sceneId)));
  optimizeAssetReuse({
    assets: list, script: { scenes: SCENES }, framePack: "organic-garden",
    dims: PORTRAIT, native: true, renderer: "om-garden", acceptsVectors: false, seedKey: "t", mediaPlan: plan,
  });
  const after = new Set(list.map((a) => String(a.sceneId)));
  assert.deepEqual([...after].sort(), [...before].sort(), "the same scenes must be covered before and after");
});

t("PROMOTION: never demotes owned material for stock, unless the critical slot is broken", () => {
  const plan = tm.resolveMediaPlan({ pack: "organic-garden", scenes: SCENES, dims: PORTRAIT });
  const crit = plan.placeholders.find((p) => p.priority === "critical");
  const others = plan.placeholders.filter((p) => p.priority !== "critical");

  // A merely-mediocre upload in the hero stays put, even against excellent stock.
  const upload = asset({ path: "a/u.jpg", source: "upload", sceneId: crit.sceneId, qualityScore: 50, qualityGrade: "medium" });
  const stock = asset({ path: "a/s.jpg", source: "pixabay", sceneId: others[0].sceneId, qualityScore: 95, qualityGrade: "hero" });
  optimizeAssetReuse({
    assets: [upload, stock], script: { scenes: SCENES }, framePack: "organic-garden",
    dims: PORTRAIT, native: true, renderer: "om-garden", acceptsVectors: false, seedKey: "t", mediaPlan: plan,
  });
  assert.equal(upload.sceneId, crit.sceneId, "the user's own material owns the hero");

  // A BROKEN upload in the hero is the one bounded exception.
  const broken = asset({ path: "a/b.jpg", source: "upload", sceneId: crit.sceneId, qualityScore: 8, qualityGrade: "reject" });
  const decent = asset({ path: "a/d.jpg", source: "pixabay", sceneId: others[0].sceneId, qualityScore: 80, qualityGrade: "high" });
  optimizeAssetReuse({
    assets: [broken, decent], script: { scenes: SCENES }, framePack: "organic-garden",
    dims: PORTRAIT, native: true, renderer: "om-garden", acceptsVectors: false, seedKey: "t", mediaPlan: plan,
  });
  assert.equal(decent.sceneId, crit.sceneId, "a hero showing a rejected picture is worse than one showing decent stock");
});

t("PROMOTION: a film whose assets are all alike is left completely alone", () => {
  const plan = tm.resolveMediaPlan({ pack: "organic-garden", scenes: SCENES, dims: PORTRAIT });
  const slots = plan.placeholders.slice(0, 3);
  const list = slots.map((p, i) => asset({ path: `a/${i}.jpg`, sceneId: p.sceneId, qualityScore: 70, qualityGrade: "high" }));
  const before = list.map((a) => String(a.sceneId));
  const { review } = optimizeAssetReuse({
    assets: list, script: { scenes: SCENES }, framePack: "organic-garden",
    dims: PORTRAIT, native: true, renderer: "om-garden", acceptsVectors: false, seedKey: "t", mediaPlan: plan,
  });
  assert.deepEqual(list.map((a) => String(a.sceneId)), before, "equal pictures must not churn the director's intent");
  assert.equal(review.qualityPromotions, 0);
});

console.log("\n-- preflight -----------------------------------------------------");

t("GATE: an empty critical slot is reported, and only an AUTHORED plan blocks on it", () => {
  const { preflight } = require("../src/services/preflight");
  const plan = tm.resolveMediaPlan({ pack: "organic-garden", scenes: SCENES, dims: PORTRAIT });
  assert.equal(plan.source, "authored", "fixture assumes the shipped pack carries a contract");
  const job = { user_assets: [], website_screenshots: [], intent: {} };

  const blocked = preflight({ job, assets: [], script: { scenes: SCENES }, mediaPlan: plan, hardFail: true });
  assert.equal(blocked.checks.criticalPlaceholdersFilled.ok, false, "an empty hero must be visible to the gate");
  assert.equal(blocked.checks.criticalPlaceholdersFilled.level, "fail",
    "an AUTHORED plan is the pack telling us what it draws — an empty hero there is a real defect");

  // A DERIVED plan is an approximation of a layout nobody has confirmed, so its slot list is
  // a floor and a miss is a warning rather than a blocked render.
  const derived = { ...plan, source: "derived" };
  const warned = preflight({ job, assets: [], script: { scenes: SCENES }, mediaPlan: derived, hardFail: true });
  assert.equal(warned.checks.criticalPlaceholdersFilled.level, "warn", "a derived plan warns, never blocks");
});

t("GATE: a rejected asset sitting in a critical slot is called out by name", () => {
  const { preflight } = require("../src/services/preflight");
  const plan = tm.resolveMediaPlan({ pack: "organic-garden", scenes: SCENES, dims: PORTRAIT });
  const crit = plan.placeholders.find((p) => p.priority === "critical");
  const bad = asset({ path: "a/bad.jpg", sceneId: crit.sceneId, qualityGrade: "reject" });
  const r = preflight({
    job: { user_assets: [], website_screenshots: [], intent: {} },
    assets: [bad], script: { scenes: SCENES }, mediaPlan: plan, hardFail: true,
  });
  assert.equal(r.checks.criticalSlotQuality.ok, false);
  assert.ok(r.checks.criticalSlotQuality.detail.includes(crit.id));
});

t("GATE: with no media plan, not one of the new checks appears", () => {
  const { preflight } = require("../src/services/preflight");
  const r = preflight({
    job: { user_assets: [], website_screenshots: [], intent: {} },
    assets: [asset()], script: { scenes: SCENES }, mediaPlan: null, hardFail: true,
  });
  assert.equal(r.checks.criticalPlaceholdersFilled, undefined, "the gate must be exactly as it was for an unauthored pack");
  assert.equal(r.checks.placeholdersFilled, undefined);
});

// ---------------------------------------------------------------- pixels
// The only tests that touch real files. Skipped (not failed) when no fixture is present,
// so a fresh checkout with a swept jobs/ directory still runs the suite.
const FIXTURES = (() => {
  const root = path.resolve(__dirname, "..", "jobs");
  const out = [];
  const walk = (d, depth) => {
    if (depth > 3) return;
    let entries = [];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p, depth + 1);
      else if (/\.(png|jpg|jpeg|webp)$/i.test(e.name) && out.length < 3) out.push(p);
    }
  };
  walk(root, 0);
  return out;
})();

(async () => {
  console.log("\n-- crop_engine (pixels) ------------------------------------------");
  if (!FIXTURES.length) {
    console.log("  skip  no fixture images under jobs/ — pixel tests skipped");
  } else {
    await t("ANALYSIS: a real image yields a real focal point, and the second pass is cached", async () => {
      ce.__resetMemo();
      const f = FIXTURES[0];
      const r1 = await ce.analyzeImage(f, { aspects: [1.0, 1.78], kind: "photo" });
      assert.ok(r1.focus && /^\d+% \d+%$/.test(r1.focus), `expected an object-position string, got ${r1.focus}`);
      assert.ok(Object.keys(r1.byAspect).length >= 1, "at least one aspect must resolve");
      assert.ok(r1.subjectFocus == null || (r1.subjectFocus > 0 && r1.subjectFocus <= 1));

      // CACHE, asserted by WORK DONE rather than by wall-clock. Comparing two elapsed times is
      // a flake generator: the disk cache survives between runs, so the "cold" pass is only
      // cold the very first time this suite ever executes, and after that both numbers are
      // sub-100ms noise where either can win. `freshCount` says exactly how many aspects were
      // actually analysed, which is the thing the test means.
      const r2 = await ce.analyzeImage(f, { aspects: [1.0, 1.78], kind: "photo" });
      assert.equal(r2.focus, r1.focus, "the same pixels must always give the same answer");
      assert.deepEqual(r2.byAspect, r1.byAspect, "and the same per-aspect answers");
      assert.equal(r2.freshCount, 0, `the second pass must analyse nothing, it analysed ${r2.freshCount}`);
    });

    await t("ANNOTATION: assets are annotated in place, and skips are counted honestly", async () => {
      const list = [
        { path: path.relative(path.resolve(__dirname, ".."), FIXTURES[0]).split(path.sep).join("/") },
        { path: "nope/vector.svg" },
        { path: "nope/clip.mp4" },
      ];
      const report = await ce.annotateAssets(list, { jobDir: path.resolve(__dirname, ".."), aspects: [1.33] });
      assert.equal(report.skipped, 2, "a vector and a video are not croppable");
      assert.ok(list[0].cropFocus, "the raster must come back annotated");
      assert.ok(list[0].cropFocusSource);
      assert.equal(list[1].cropFocus, undefined, "a skipped asset must not be touched at all");
    });
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
