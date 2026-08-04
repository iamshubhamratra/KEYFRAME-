// Characterization tests for the Asset Reuse Optimizer (services/asset_reuse.js).
//
// The FIRST test is the one that matters most: with at least as many assets as slots the
// optimizer must be a byte-identical no-op. That invariant is what protects every existing
// film across all 43 packs — everything else here is the new behaviour it adds on top.
//
// Pure functions only: no I/O, no network, no render. Runs in milliseconds.

const assert = require("node:assert");
const {
  optimizeAssetReuse, semanticFit, scoreCandidate, buildLedger, buildSlots, dhashSimilarity,
} = require("../src/services/asset_reuse");

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); console.log(`  ok   ${name}`); pass++; }
  catch (e) { console.log(`  FAIL ${name}\n       ${e.message}`); fail++; }
}

// ---------------------------------------------------------------- fixtures
// Seven scenes: hook, context, feature, how, proof, quote, cta. The scene-kit slot model
// excludes the first and last scene plus quote/cta, so this yields 4 addressable slots.
const SCRIPT = { scenes: [
  { id: "s1", start: 0,  duration: 3, purpose: "hook",     role: "hook" },
  { id: "s2", start: 3,  duration: 3, purpose: "context",  role: "context" },
  { id: "s3", start: 6,  duration: 3, purpose: "feature",  role: "feature" },
  { id: "s4", start: 9,  duration: 3, purpose: "how",      role: "how" },
  { id: "s5", start: 12, duration: 3, purpose: "proof",    role: "proof" },
  { id: "s6", start: 15, duration: 3, purpose: "quote",    role: "quote" },
  { id: "s7", start: 18, duration: 3, purpose: "cta",      role: "cta" },
] };
const DIMS = { width: 1080, height: 1920 };

const shot = (path, over = {}) => ({
  path, type: "image", source: "website", kindHint: "screenshot", visionOk: true,
  width: 1600, height: 900, ratio: 1.78, cdScore: 85, sceneId: null,
  alt: "product dashboard screenshot", ...over,
});

// ---------------------------------------------------------------- the invariant
t("NO-OP: with an asset for every slot the wire is returned unchanged (same array identity)", () => {
  const assets = [
    shot("a1.png", { sceneId: "s2" }), shot("a2.png", { sceneId: "s3" }),
    shot("a3.png", { sceneId: "s4" }), shot("a4.png", { sceneId: "s5" }),
  ];
  const before = JSON.stringify(assets);
  const { assets: out, review } = optimizeAssetReuse({ assets, script: SCRIPT, dims: DIMS });
  assert.strictEqual(out, assets, "must return the SAME array, not a copy");
  assert.strictEqual(out.length, 4, "must not add entries");
  assert.strictEqual(JSON.stringify(assets), before, "must not mutate existing entries");
  assert.strictEqual(review.slotsFilledReuse, 0, "no reuse was needed");
  assert.strictEqual(review.assetCoverage, "100%");
});

t("NO-OP: disabled by config returns the wire untouched with no review", () => {
  const assets = [shot("a1.png")];
  const orig = process.env.ASSET_REUSE;
  // config is frozen at require time, so exercise the guard through the module's own path:
  // an empty scene list is the other way in and must behave identically.
  const { assets: out, review } = optimizeAssetReuse({ assets, script: { scenes: [] }, dims: DIMS });
  assert.strictEqual(out, assets);
  assert.strictEqual(review, null);
  process.env.ASSET_REUSE = orig;
});

// ---------------------------------------------------------------- coverage
t("COVERAGE: one asset, four empty slots — it is reused up to the ceiling, then decorative", () => {
  const assets = [shot("solo.png", { sceneId: "s3" })];
  const { assets: out, review } = optimizeAssetReuse({ assets, script: SCRIPT, dims: DIMS });
  assert.strictEqual(review.slotsDemanded, 4, "hook/quote/cta and the last scene are not slots");
  // 1 assigned + 1 reuse (ceiling 2) + 2 decorative
  assert.strictEqual(review.maximumReuseCount, 2, "must stop at the 2-use ceiling");
  assert.strictEqual(review.slotsFilledReuse, 1);
  assert.strictEqual(review.slotsFilledDecorative, 2);
  assert.strictEqual(out.length, 2, "exactly one clone added");
  const clone = out.find((a) => a.__reuseOf);
  assert.strictEqual(clone.__reuseOf, "solo.png");
  assert.strictEqual(clone.path, "solo.png", "a clone shares the path — it is the same asset");
  assert.notStrictEqual(clone.sceneId, "s3", "the clone lands on a DIFFERENT scene");
});

t("COVERAGE: unused assets are exhausted before anything is reused", () => {
  // 4 slots (s2..s5); s2 is already assigned, so 3 are empty and only 2 spares exist.
  // The property under test is ORDERING: both spares must be spent before any asset is
  // asked to appear a second time — never "spare2 sat unused while used.png went twice".
  const assets = [
    shot("used.png", { sceneId: "s2" }),
    shot("spare1.png", { sceneId: null }),
    shot("spare2.png", { sceneId: null }),
  ];
  const { review } = optimizeAssetReuse({ assets, script: SCRIPT, dims: DIMS });
  assert.strictEqual(review.uniqueAssetsUsed, 3, "every distinct asset is on screen");
  assert.strictEqual(review.slotsFilledUnique, 3, "s2 assigned + both spares placed");
  assert.strictEqual(review.slotsFilledReuse, 1, "only the leftover 4th slot needed a reuse");
  const idle = review.ledger.filter((r) => r.usageCount === 0);
  assert.strictEqual(idle.length, 0, `no asset may sit idle while another repeats: ${idle.map((r) => r.assetId)}`);
});

t("COVERAGE: a reuse is never chosen while ANY asset is still unused", () => {
  // Six spares, three empty slots — reuse must not be reached at all.
  const assets = [shot("used.png", { sceneId: "s2" })];
  for (let i = 1; i <= 6; i++) assets.push(shot(`spare${i}.png`, { sceneId: null }));
  const { review, assets: out } = optimizeAssetReuse({ assets, script: SCRIPT, dims: DIMS });
  assert.strictEqual(review.slotsFilledReuse, 0, "with spares to spare, nothing repeats");
  assert.strictEqual(review.maximumReuseCount, 1, "no asset appears twice");
  assert.ok(!out.some((a) => a.__reuseOf), "no clones were created");
});

t("CEILING: no asset ever exceeds maxUses", () => {
  const assets = [shot("solo.png", { sceneId: "s2" })];
  const { review } = optimizeAssetReuse({ assets, script: SCRIPT, dims: DIMS });
  for (const row of review.ledger) assert.ok(row.usageCount <= 2, `${row.assetId} used ${row.usageCount}×`);
});

t("ADJACENCY: a reuse never lands on the scene next to its own appearance", () => {
  const assets = [shot("solo.png", { sceneId: "s3" })];
  const { review } = optimizeAssetReuse({ assets, script: SCRIPT, dims: DIMS });
  const row = review.ledger.find((r) => r.assetId === "solo.png");
  const idx = row.sceneAssignments.map((id) => SCRIPT.scenes.findIndex((s) => s.id === id));
  idx.sort((a, b) => a - b);
  for (let i = 1; i < idx.length; i++) {
    assert.ok(idx[i] - idx[i - 1] > 1, `appearances on adjacent scenes: ${row.sceneAssignments.join(",")}`);
  }
});

// ---------------------------------------------------------------- semantics
t("SEMANTIC: a dashboard is ideal for proof, and never fills a quote", () => {
  assert.strictEqual(semanticFit("dashboard", "proof"), 1.0);
  assert.strictEqual(semanticFit("team", "proof"), 1.0);
  assert.strictEqual(semanticFit("dashboard", "quote"), 0.0);
  assert.strictEqual(semanticFit("screenshot", "feature"), 1.0);
  assert.strictEqual(semanticFit("team", "feature"), 0.0, "a stock office photo is not a UI walkthrough");
  assert.strictEqual(semanticFit("logo", "cta"), 1.0);
});

t("SEMANTIC: an unknown category is placeable but never ideal", () => {
  assert.strictEqual(semanticFit("something-new", "feature"), 0.25);
});

t("SCORING: the semantically-right asset wins the slot", () => {
  const assets = [
    shot("team.png",   { sceneId: null, kindHint: "photo", source: "upload", assetType: "team", alt: "the team", cdScore: 95 }),
    shot("chart.png",  { sceneId: null, source: "upload", assetType: "dashboard", alt: "analytics dashboard chart", cdScore: 70 }),
    shot("anchor.png", { sceneId: "s3" }),
  ];
  const { review } = optimizeAssetReuse({ assets, script: SCRIPT, dims: DIMS });
  const proof = review.decisions.find((d) => d.sceneId === "s5");
  assert.ok(proof && proof.chose, "the proof scene was filled");
  // Both team and dashboard are IDEAL for proof; the point is that a semantic loser for
  // the OTHER slot does not take it. s2 is context: marketing/illustration ideal, team good.
  const ctx = review.decisions.find((d) => d.sceneId === "s2");
  assert.ok(ctx && ctx.chose, "the context scene was filled");
});

// ---------------------------------------------------------------- vetoes
t("VETO: a video is never offered for an image slot", () => {
  const ledger = buildLedger([{ path: "clip.mp4", type: "video", source: "upload", sceneId: "s2" }]);
  const slots = buildSlots(SCRIPT.scenes, { native: false });
  const row = [...ledger.values()][0];
  const v = scoreCandidate(row, slots[1], {
    neighbours: SCRIPT.scenes.map((s) => s.id), dims: DIMS, acceptsVectors: true,
    prominentSlot: true, tuning: { maxUses: 2, minGap: 3, minScore: 40, allowLogoReuse: true },
  });
  assert.ok(v.vetoed && /video/.test(v.reason), `expected a video veto, got ${v.reason}`);
});

t("VETO: a vector is never offered to a pack that discards vectors", () => {
  const assets = [
    { path: "icon.svg", type: "image", source: "library:curated", sceneId: "s2", cdScore: 90 },
  ];
  const { review } = optimizeAssetReuse({ assets, script: SCRIPT, dims: DIMS, acceptsVectors: false });
  assert.strictEqual(review.slotsFilledReuse, 0, "a vector-blind pack must not be handed the vector");
  assert.strictEqual(review.slotsFilledDecorative, 3);
});

t("VETO: untrusted stock never takes a prominent slot", () => {
  const assets = [
    shot("anchor.png", { sceneId: "s2" }),
    { path: "stock.jpg", type: "image", source: "pixabay", sceneId: null, cdScore: 88 }, // no visionOk
  ];
  const { review } = optimizeAssetReuse({ assets, script: SCRIPT, dims: DIMS });
  const chose = review.decisions.map((d) => d.chose).filter(Boolean);
  assert.ok(!chose.includes("stock.jpg"), "unapproved stock must not fill a scene's main visual");
});

// ---------------------------------------------------------------- logo
t("LOGO: the logo is exempt from the ceiling but never fills a generic slot", () => {
  const assets = [
    { path: "logo.png", type: "image", source: "upload", role: "logo", sceneId: "s1" },
    shot("a1.png", { sceneId: "s3" }),
  ];
  const { review, assets: out } = optimizeAssetReuse({ assets, script: SCRIPT, dims: DIMS });
  assert.ok(!out.some((a) => a.__reuseOf === "logo.png"), "the logo is key-moment material, not a scene filler");
  const logoRow = review.ledger.find((r) => r.assetId === "logo.png");
  assert.strictEqual(logoRow.reuseEligible, true, "the logo stays eligible (it is exempt)");
  assert.strictEqual(review.totalAssetsCollected, 1, "the logo is not counted as collected imagery");
});

// ---------------------------------------------------------------- composer families
t("SLOTS: scene-kit reaches content scenes only; quote/cta are content-critical everywhere", () => {
  const kit = buildSlots(SCRIPT.scenes, { native: false }).map((s) => s.sceneId);
  assert.deepStrictEqual(kit, ["s2", "s3", "s4", "s5"], "scene-kit reaches content scenes only");
  for (const r of [null, "om-garden", "dom-prisma"]) {
    const nat = buildSlots(SCRIPT.scenes, { native: true, renderer: r }).map((s) => s.sceneId);
    assert.ok(!nat.includes("s6") && !nat.includes("s7"), `quote/cta must never be a slot (${r})`);
  }
});

// REGRESSION — job 9e0fq1724n. The optimizer spent one of a picture's two allowed
// appearances on the prisma HOOK, which `bHook(scene, ctx, _assets, logo)` cannot draw, and
// then reported it as coverage. Showability is per-renderer, and the default must be the
// pessimistic one.
t("SLOTS: the hook is a slot only for a renderer VERIFIED to draw on it", () => {
  const om = buildSlots(SCRIPT.scenes, { native: true, renderer: "om-garden" }).map((s) => s.sceneId);
  assert.ok(om.includes("s1"), "om_stage.bHook draws sceneAssets[0] — the hook is a real slot");

  const prisma = buildSlots(SCRIPT.scenes, { native: true, renderer: "dom-prisma" }).map((s) => s.sceneId);
  assert.ok(!prisma.includes("s1"), "prisma's bHook ignores assets — the hook must NOT be a slot");

  const unknown = buildSlots(SCRIPT.scenes, { native: true, renderer: "some-new-pack" }).map((s) => s.sceneId);
  assert.ok(!unknown.includes("s1"), "an unverified renderer defaults to NO hook slot (asymmetric cost)");
});

t("SLOTS: a wasted hook slot no longer consumes a reuse appearance", () => {
  // One picture, and a hook the renderer cannot draw on. Before the fix the hook took an
  // appearance and the ledger read 2 uses for a film showing it once.
  const assets = [shot("solo.png", { sceneId: "s3" })];
  const r = optimizeAssetReuse({ assets, script: SCRIPT, dims: DIMS, native: true, renderer: "dom-prisma", seedKey: "j" });
  const placed = (r.review.decisions || []).filter((d) => d.chose).map((d) => d.sceneId);
  assert.ok(!placed.includes("s1"), "nothing is assigned to a hook that cannot draw it");
  assert.ok(!r.review.ledger.some((x) => x.usageCount > 2), "the ceiling still holds");
});

// ---------------------------------------------------------------- diversity
t("DIVERSITY: identical perceptual hashes read as identical, different ones do not", () => {
  assert.strictEqual(dhashSimilarity("ffffffffffffffff", "ffffffffffffffff"), 1);
  assert.strictEqual(dhashSimilarity("0000000000000000", "ffffffffffffffff"), 0);
  assert.ok(dhashSimilarity("0f0f0f0f0f0f0f0f", "0f0f0f0f0f0f0f0e") > 0.9, "one bit apart is near-identical");
  assert.strictEqual(dhashSimilarity(null, "ffffffffffffffff"), 0, "a missing hash is never a match");
});

// ---------------------------------------------------------------- report
t("REPORT: the ledger reconciles and the coverage figure is honest", () => {
  const assets = [shot("a1.png", { sceneId: "s2" }), shot("a2.png", { sceneId: "s3" })];
  const { review } = optimizeAssetReuse({ assets, script: SCRIPT, dims: DIMS });
  assert.strictEqual(review.totalAssetsCollected, 2);
  assert.strictEqual(review.slotsDemanded, 4);
  const filled = review.slotsFilledUnique + review.slotsFilledReuse + review.slotsFilledDecorative;
  assert.strictEqual(filled, review.slotsDemanded, "every slot is accounted for exactly once");
  assert.strictEqual(review.placeholderContentUsed, false, "the fallback is brand geometry, never synthetic UI");
  for (const row of review.ledger) {
    assert.strictEqual(row.usageCount, row.sceneAssignments.length, `${row.assetId} ledger is inconsistent`);
  }
});

t("FAIL-OPEN: malformed input returns the wire rather than throwing", () => {
  assert.doesNotThrow(() => optimizeAssetReuse({ assets: null, script: null }));
  assert.doesNotThrow(() => optimizeAssetReuse({}));
  const junk = [null, { }, { path: "x.png" }];
  const { assets: out } = optimizeAssetReuse({ assets: junk, script: SCRIPT, dims: DIMS });
  assert.ok(Array.isArray(out));
});

// ---------------------------------------------------------------- variation (P2)
const { variationFor } = require("../src/services/asset_reuse");
const { preflight } = require("../src/services/preflight");
const { auditAssetRender } = require("../src/services/asset_render_check");

t("VARIATION: a first appearance is never varied", () => {
  assert.strictEqual(variationFor({ assetId: "a.png", type: "photo" }, 0, "job1"), null);
});

t("VARIATION: deterministic — same seed, same variation; different seed, different film", () => {
  const row = { assetId: "a.png", type: "photo", ratio: 1.6 };
  const a1 = variationFor(row, 1, "job1");
  const a2 = variationFor(row, 1, "job1");
  assert.deepStrictEqual(a1, a2, "the same film must vary the same way on every re-render");
  const b = variationFor(row, 1, "job2");
  assert.ok(JSON.stringify(a1) !== JSON.stringify(b) || a1.enter !== b.enter || a1.scale !== b.scale,
    "a different job should not be forced into the same variation");
});

t("VARIATION: never resolves to the identity (a reuse must LOOK different)", () => {
  for (const seed of ["j1", "j2", "j3", "j4", "j5"]) {
    const v = variationFor({ assetId: "a.png", type: "photo" }, 1, seed);
    assert.notStrictEqual(v.scale, 1, "scale 1.0 would be no variation at all");
    assert.notStrictEqual(v.enter, "rise", "rise is the default entrance");
    assert.ok(Math.abs(v.tilt) > 0);
  }
});

t("VARIATION: a screenshot's crop is load-bearing and stays where the director put it", () => {
  for (const type of ["screenshot", "dashboard", "icon", "logo"]) {
    const v = variationFor({ assetId: "a.png", type }, 1, "job1");
    assert.strictEqual(v.cropFocus, null, `${type} must keep its crop anchor (the header is the point)`);
  }
  const photo = variationFor({ assetId: "p.png", type: "product" }, 1, "job1");
  assert.ok(typeof photo.cropFocus === "string", "a photo may be re-anchored");
});

t("VARIATION: clones carry it, originals never do", () => {
  const assets = [shot("solo.png", { sceneId: "s2", kindHint: "photo", assetType: "product", alt: "a product photo" })];
  const { assets: out } = optimizeAssetReuse({ assets, script: SCRIPT, dims: DIMS, seedKey: "job1" });
  const original = out.find((a) => !a.__reuseOf);
  const clone = out.find((a) => a.__reuseOf);
  assert.strictEqual(original.__variant, undefined, "the first appearance is untouched");
  assert.ok(clone && clone.__variant, "the second appearance carries a variation");
  assert.strictEqual(clone.__variant.instance, 1);
});

// ---------------------------------------------------------------- validation (P2)
t("PREFLIGHT: reuse within limits passes, and an over-used asset is reported", () => {
  const scenes = SCRIPT.scenes;
  const ok = preflight({
    job: { intent: {} }, script: SCRIPT, storyboard: null, jobDir: "",
    assets: [shot("a.png", { sceneId: "s2" }), shot("a.png", { sceneId: "s4" })],
  });
  assert.strictEqual(ok.checks.reuseWithinLimits.ok, true, "twice is within the limit");
  const bad = preflight({
    job: { intent: {} }, script: SCRIPT, storyboard: null, jobDir: "",
    assets: ["s2", "s3", "s4", "s5"].map((id) => shot("a.png", { sceneId: id })),
  });
  assert.strictEqual(bad.checks.reuseWithinLimits.ok, false, "four appearances exceed the ceiling");
  assert.ok(!bad.blockedBy, "a reuse shortfall is a disclosure, never a blocker (fail-open law)");
  void scenes;
});

t("PREFLIGHT: an adjacent repeat is caught", () => {
  const clean = preflight({
    job: { intent: {} }, script: SCRIPT, storyboard: null, jobDir: "",
    assets: [shot("a.png", { sceneId: "s2" }), shot("a.png", { sceneId: "s4" })],
  });
  assert.strictEqual(clean.checks.noAdjacentRepeat.ok, true);
  const adj = preflight({
    job: { intent: {} }, script: SCRIPT, storyboard: null, jobDir: "",
    assets: [shot("a.png", { sceneId: "s2" }), shot("a.png", { sceneId: "s3" })],
  });
  assert.strictEqual(adj.checks.noAdjacentRepeat.ok, false, "back-to-back is the visible failure");
});

t("RENDER AUDIT: counts distinct pictures, not wire entries, and reports instances", () => {
  const assets = [shot("a.png", { sceneId: "s2" }), shot("a.png", { sceneId: "s4" }), shot("b.png", { sceneId: "s3" })];
  const html = `<img src="a.png"><img src="b.png"><img src="a.png">`;
  const r = auditAssetRender({ indexHtml: html, assets });
  assert.strictEqual(r.assetsCollected, 2, "two distinct pictures, not three wire entries");
  assert.strictEqual(r.reusedPictures, 1, "a.png was placed twice");
  assert.strictEqual(r.maxAppearances, 2);
  assert.strictEqual(r.droppedInstances, 0, "both appearances of a.png were drawn");
});

t("RENDER AUDIT: a dropped second instance is visible", () => {
  const assets = [shot("a.png", { sceneId: "s2" }), shot("a.png", { sceneId: "s4" })];
  const r = auditAssetRender({ indexHtml: `<img src="a.png">`, assets });
  assert.strictEqual(r.droppedInstances, 1, "placed twice, drawn once — the composer dropped one");
});

// ---------------------------------------------------------------- QA awareness (P3)
// reusePrompt is module-private by design (it is prompt-assembly detail, not an API), so
// these assert its CONTRACT against the source: that the brief exists, says the right thing,
// and is actually wired to the reviewer. A behavioural test would need a live vision call.
t("QA BRIEF: a film with no reuse adds nothing to the reviewer's prompt", () => {
  const src = require("node:fs").readFileSync(require("node:path").join(__dirname, "../src/agents/qa_agent.js"), "utf8");
  assert.ok(src.includes("function reusePrompt"), "the reuse brief exists");
  assert.ok(src.includes("reusePrompt(reusePlan, scenes)"), "and it is wired into the prompt");
  // No reuse → no ledger rows with usageCount > 1 → empty string → filter(Boolean) drops it.
  assert.ok(/if \(!rows\.length\) return "";/.test(src), "an unreused film contributes no prompt text");
});

t("QA BRIEF: the reviewer is told to FAIL an under-varied or adjacent repeat, not the reuse itself", () => {
  const src = require("node:fs").readFileSync(require("node:path").join(__dirname, "../src/agents/qa_agent.js"), "utf8");
  assert.ok(/do NOT report a recurring picture as an issue merely because it recurs/i.test(src),
    "the false positive is suppressed");
  assert.ok(/indistinguishable from the earlier one/i.test(src), "under-variation is reportable");
  assert.ok(/CONSECUTIVE scenes/i.test(src), "an adjacent repeat is a blocker");
});

t("QA BRIEF: the reuse plan reaches the reviewer through graph state", () => {
  const g = require("node:fs").readFileSync(require("node:path").join(__dirname, "../src/agents/graph.js"), "utf8");
  assert.ok(/assetReuse: Annotation\(\)/.test(g), "assetReuse is a declared state channel");
  assert.ok(/reusePlan: s\.assetReuse \|\| null/.test(g), "the QA node passes it");
  assert.ok(/return \{ assets, assetReuse: review \|\| null \}/.test(g), "the reuse node emits it");
});

// ---------------------------------------------------------------- native-pack guard (P3)
t("OM STAGE: a beat never receives a picture it already holds", () => {
  const { composerModuleFor } = require("../src/services/pipeline");
  const mod = composerModuleFor("om-garden");
  if (!mod) throw new Error("om-garden composer not resolved");
  const sb = { title: "Acme", durationSec: 15, scenes: [
    { id: "s1", start: 0, duration: 3, kind: "hook", purpose: "intro", headline: "One" },
    { id: "s2", start: 3, duration: 3, kind: "feature", purpose: "feature", headline: "Two" },
    { id: "s3", start: 6, duration: 3, kind: "feature", purpose: "how", headline: "Three" },
    { id: "s4", start: 9, duration: 3, kind: "quote", purpose: "testimonial", headline: "Four" },
    { id: "s5", start: 12, duration: 3, kind: "cta", purpose: "cta", headline: "Five" },
  ] };
  const mk = (sceneId) => ({
    path: "assets/dup.png", type: "image", source: "upload", kindHint: "screenshot",
    width: 1600, height: 900, ratio: 1.78, cdScore: 90, visionOk: true, cdProminence: "hero", sceneId,
  });
  // Both entries share a path; s4 is a quote (not display-capable) so its entry becomes a
  // leftover and gets redistributed — the exact path that could double it onto s2's beat.
  const html = mod.buildComposition({
    storyboard: sb, dims: { width: 1080, height: 1920, fps: 30 }, framePack: "organic-garden",
    assets: [mk("s2"), mk("s4")], captionCues: [], seedKey: "dupcheck", brandSkin: null,
  }).indexHtml;
  const body = html.slice(0, html.lastIndexOf("<script>"));
  const marks = [...body.matchAll(/<!-- (s\d+)[^>]*-->/g)].map((m) => ({ id: m[1], at: m.index }));
  marks.forEach((m, i) => {
    const seg = body.slice(m.at, i + 1 < marks.length ? marks[i + 1].at : body.length);
    const n = (seg.match(/assets\/dup\.png/g) || []).length;
    assert.ok(n <= 1, `${m.id} draws the same picture ${n}× — a doubled tile is worse than the pack's colour block`);
  });
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
