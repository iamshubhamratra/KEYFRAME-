// asset_score tests — the 0-100 retrieval scorer.
//
//   node scripts/test-asset-scoring.js
//
// The scorer decides which stock picture a scene gets, so every axis is calibrated
// independently and tested independently. Two properties matter more than any single
// number and are asserted throughout:
//
//   1. WEIGHTS ARE A CEILING. No axis can move the score by more than its stated weight,
//      so a director's enthusiasm (or a lucky tag match) can never promote a 200px artefact.
//   2. UNMEASURABLE IS NEUTRAL, NEVER ZERO. Providers that declare no dimensions and images
//      nothing has looked at yet must stay eligible on merit. Scoring ignorance as badness
//      is how a working provider gets quietly deleted from every pool.

const assert = require("node:assert");

let pass = 0, fail = 0;
function t(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { console.log(`  ✓ ${name}`); pass++; })
    .catch((e) => { console.log(`  ✗ ${name}\n      ${e.message}`); fail++; });
}

const S = require("../src/services/asset_score");
const { WEIGHTS, scoreCandidate, rescoreMeasured, barFor, gradeFor, explain } = S;

const cand = (o = {}) => ({
  url: o.url || "https://cdn.example/p.jpg",
  width: o.w ?? 1920, height: o.h ?? 1080,
  title: o.title || "", tags: o.tags || [], alt: o.alt || "",
  avgColor: o.avgColor || null,
});
// A crisp, information-rich measurement — the shape validateImage hands back.
const meta = (o = {}) => ({
  width: o.w ?? 1920, height: o.h ?? 1080,
  ratio: (o.w ?? 1920) / (o.h ?? 1080),
  hasAlpha: o.hasAlpha ?? false, vector: o.vector ?? false,
  dhash: o.dhash || "0f1e2d3c4b5a6978",
  stdev: o.stdev ?? 40, sharpness: o.sharpness ?? 700,
  dominantColor: o.dominantColor || "#3366AA",
});

(async () => {
  // ---------------------------------------------------------------- shape of the contract
  console.log("\nthe contract");
  await t("the seven weights sum to exactly 100", () => {
    assert.strictEqual(Object.values(WEIGHTS).reduce((a, b) => a + b, 0), 100);
    assert.deepStrictEqual(WEIGHTS, {
      relevance: 35, quality: 20, sceneCompat: 15, aspect: 10, subject: 10, brand: 5, uniqueness: 5,
    });
  });

  await t("a score is an integer in 0..100 with a part per axis", () => {
    const r = scoreCandidate({ query: "analytics dashboard", candidate: cand() });
    assert.ok(Number.isInteger(r.score) && r.score >= 0 && r.score <= 100, `bad score ${r.score}`);
    for (const k of Object.keys(WEIGHTS)) assert.ok(k in r.parts, `missing part "${k}"`);
    assert.strictEqual(r.reasons.length, 7, "every axis must state its reason");
    assert.strictEqual(r.measured, false);
  });

  await t("NO AXIS CAN EXCEED ITS WEIGHT, even with everything maxed", () => {
    const r = rescoreMeasured({
      query: "analytics dashboard",
      candidate: cand({ title: "analytics dashboard", tags: ["analytics", "dashboard"], avgColor: "#3366AA" }),
      meta: meta({ sharpness: 99999, stdev: 255, w: 8000, h: 4500 }),
      requirement: { priority: "critical", preferredAspect: 16 / 9, minWidth: 800, minHeight: 450 },
      targetRatio: 16 / 9, styleKeywords: ["analytics"], sceneText: "analytics dashboard",
      subjectTerms: ["dashboard"], brandColors: ["#3366AA"],
    });
    for (const [k, w] of Object.entries(WEIGHTS)) assert.ok(r.parts[k] <= w, `${k} = ${r.parts[k]} exceeds its weight ${w}`);
    assert.ok(r.score <= 100);
  });

  // ---------------------------------------------------------------- relevance
  console.log("\nrelevance (35)");
  await t("an on-topic description beats an off-topic one", () => {
    const hit = scoreCandidate({ query: "analytics dashboard", candidate: cand({ alt: "a web analytics dashboard with charts" }) });
    const miss = scoreCandidate({ query: "analytics dashboard", candidate: cand({ alt: "a golden retriever on a beach" }) });
    assert.ok(hit.parts.relevance > miss.parts.relevance, `${hit.parts.relevance} !> ${miss.parts.relevance}`);
    assert.strictEqual(hit.parts.relevance, WEIGHTS.relevance, "a full query match should take the full 35");
  });

  await t("THE SCRIPT STEERS THE PICTURE: scene words break a query tie", () => {
    const q = "revenue chart";
    const generic = cand({ alt: "a revenue chart on paper" });
    const onScript = cand({ alt: "a revenue chart dashboard tracking sales in real time" });
    const sceneText = "Track your revenue in real time";
    const a = scoreCandidate({ query: q, candidate: generic, sceneText });
    const b = scoreCandidate({ query: q, candidate: onScript, sceneText });
    assert.ok(b.parts.relevance > a.parts.relevance, "the candidate echoing the narration must win");
  });

  await t("a provider that returns no description is docked, not zeroed", () => {
    const r = scoreCandidate({ query: "analytics dashboard", candidate: cand({ alt: "", title: "", tags: [] }) });
    assert.ok(r.parts.relevance > 0, "pixabay_scrape returns no text and must stay eligible");
    assert.ok(r.parts.relevance < WEIGHTS.relevance * 0.5, "but it cannot score like a proven match");
  });

  // ---------------------------------------------------------------- quality
  console.log("\nquality (20)");
  await t("MEASURED PIXELS BEAT DECLARED ONES: a soft 4000px loses to a crisp 1600px", () => {
    const soft = rescoreMeasured({ query: "q", candidate: cand({ w: 4000, h: 2250 }), meta: meta({ w: 4000, h: 2250, sharpness: 60, stdev: 14 }) });
    const crisp = rescoreMeasured({ query: "q", candidate: cand({ w: 1600, h: 900 }), meta: meta({ w: 1600, h: 900, sharpness: 900, stdev: 45 }) });
    assert.ok(crisp.parts.quality > soft.parts.quality,
      `crisp ${crisp.parts.quality} !> soft ${soft.parts.quality} — this is the whole point of the measured pass`);
  });

  await t("undeclared dimensions score NEUTRAL, not near-worst", () => {
    const unknown = scoreCandidate({ query: "q", candidate: cand({ w: 0, h: 0 }) });
    const tiny = scoreCandidate({ query: "q", candidate: cand({ w: 300, h: 200 }) });
    assert.ok(unknown.parts.quality > tiny.parts.quality, "openverse/pixabay_scrape declare nothing and must not be punished for it");
  });

  await t("a screenshot is judged on the screenshot sharpness band, not the photo one", () => {
    const asPhoto = rescoreMeasured({ query: "q", candidate: cand(), meta: meta({ sharpness: 500 }), requirement: { kindPref: "photo" } });
    const asShot = rescoreMeasured({ query: "q", candidate: cand(), meta: meta({ sharpness: 500 }), requirement: { kindPref: "screenshot" } });
    assert.ok(asPhoto.parts.quality > asShot.parts.quality, "UI chrome needs a higher baseline than continuous tone");
  });

  // ---------------------------------------------------------------- aspect (the 9:16 axis)
  console.log("\naspect (10) — the 9:16 axis");
  await t("a landscape photo scores ZERO against a 9:16 slot", () => {
    const r = scoreCandidate({ query: "q", candidate: cand({ w: 1920, h: 1080 }), targetRatio: 9 / 16 });
    assert.strictEqual(r.parts.aspect, 0, "the old multiplier floored this at 62% and let sideways images win");
  });

  await t("a portrait photo takes the full 10 against a 9:16 slot", () => {
    const r = scoreCandidate({ query: "q", candidate: cand({ w: 1080, h: 1920 }), targetRatio: 9 / 16 });
    assert.strictEqual(r.parts.aspect, WEIGHTS.aspect);
  });

  await t("the box's own preferredAspect outranks the caller's frame default", () => {
    const r = scoreCandidate({
      query: "q", candidate: cand({ w: 1080, h: 1920 }),
      targetRatio: 16 / 9,                        // the frame is landscape...
      requirement: { preferredAspect: 9 / 16 },   // ...but THIS box is a tall panel
    });
    assert.strictEqual(r.parts.aspect, WEIGHTS.aspect, "the placeholder contract must win");
  });

  // ---------------------------------------------------------------- sceneCompat
  console.log("\nsceneCompat (15)");
  await t("an image under the box's resolution floor is penalised, not rejected", () => {
    const big = scoreCandidate({ query: "q", candidate: cand({ w: 1920, h: 1080 }), requirement: { minWidth: 1600, minHeight: 900, preferredAspect: 16 / 9 } });
    const small = scoreCandidate({ query: "q", candidate: cand({ w: 900, h: 506 }), requirement: { minWidth: 1600, minHeight: 900, preferredAspect: 16 / 9 } });
    assert.ok(big.parts.sceneCompat > small.parts.sceneCompat);
    assert.ok(small.parts.sceneCompat > 0, "a soft penalty — hard-rejecting here is how boxes end up empty");
  });

  await t("an opaque raster cannot satisfy a vector role once measured", () => {
    const opaque = rescoreMeasured({ query: "icon", candidate: cand(), meta: meta({ hasAlpha: false }), requirement: { kindPref: "vector" } });
    const alpha = rescoreMeasured({ query: "icon", candidate: cand(), meta: meta({ hasAlpha: true }), requirement: { kindPref: "vector" } });
    assert.ok(alpha.parts.sceneCompat > opaque.parts.sceneCompat);
  });

  await t("a want with no box contract scores neutral, not zero", () => {
    const r = scoreCandidate({ query: "q", candidate: cand() });
    assert.ok(r.parts.sceneCompat > 0 && r.parts.sceneCompat < WEIGHTS.sceneCompat);
  });

  // ---------------------------------------------------------------- subject
  console.log("\nsubject (10)");
  await t("the required subject being present is worth its full weight", () => {
    const has = scoreCandidate({ query: "q", candidate: cand({ alt: "an analytics dashboard" }), subjectTerms: ["dashboard"] });
    const hasnt = scoreCandidate({ query: "q", candidate: cand({ alt: "an office corridor" }), subjectTerms: ["dashboard"] });
    assert.strictEqual(has.parts.subject, WEIGHTS.subject);
    assert.strictEqual(hasnt.parts.subject, 0);
  });

  await t("no subject terms supplied scores neutral", () => {
    const r = scoreCandidate({ query: "q", candidate: cand({ alt: "anything" }) });
    assert.ok(r.parts.subject > 0 && r.parts.subject < WEIGHTS.subject);
  });

  // ---------------------------------------------------------------- brand
  console.log("\nbrand (5)");
  await t("a picture near the brand colour edges out one far from it", () => {
    const near = rescoreMeasured({ query: "q", candidate: cand(), meta: meta({ dominantColor: "#3366AA" }), brandColors: ["#3366AA"] });
    const far = rescoreMeasured({ query: "q", candidate: cand(), meta: meta({ dominantColor: "#CC3300" }), brandColors: ["#3366AA"] });
    assert.ok(near.parts.brand > far.parts.brand);
  });

  await t("brand is a TIEBREAKER — it cannot rescue an irrelevant picture", () => {
    const onBrandOffTopic = rescoreMeasured({
      query: "analytics dashboard", candidate: cand({ alt: "a red bicycle" }),
      meta: meta({ dominantColor: "#3366AA" }), brandColors: ["#3366AA"], styleKeywords: ["blue"],
    });
    const offBrandOnTopic = rescoreMeasured({
      query: "analytics dashboard", candidate: cand({ alt: "an analytics dashboard with charts" }),
      meta: meta({ dominantColor: "#CC3300" }), brandColors: ["#3366AA"],
    });
    assert.ok(offBrandOnTopic.score > onBrandOffTopic.score, "5 points must never outweigh 35");
  });

  // ---------------------------------------------------------------- uniqueness
  console.log("\nuniqueness (5)");
  await t("a url already used in this film scores zero", () => {
    const seen = { urls: new Set(["https://cdn.example/p.jpg"]), dhashes: [], providerWins: new Map() };
    const r = scoreCandidate({ query: "q", candidate: cand(), seen });
    assert.strictEqual(r.parts.uniqueness, 0);
  });

  await t("a perceptual near-duplicate of a chosen picture scores zero once measured", () => {
    const seen = { urls: new Set(), dhashes: ["0f1e2d3c4b5a6978"], providerWins: new Map() };
    const r = rescoreMeasured({ query: "q", candidate: cand(), meta: meta({ dhash: "0f1e2d3c4b5a6979" }), seen });
    assert.strictEqual(r.parts.uniqueness, 0);
  });

  await t("one provider dominating the film is nudged down, never banned", () => {
    const fresh = { urls: new Set(), dhashes: [], providerWins: new Map([["pexels", 0]]) };
    const heavy = { urls: new Set(), dhashes: [], providerWins: new Map([["pexels", 5]]) };
    const a = scoreCandidate({ query: "q", candidate: cand(), seen: fresh, provider: "pexels" });
    const b = scoreCandidate({ query: "q", candidate: cand(), seen: heavy, provider: "pexels" });
    assert.ok(a.parts.uniqueness > b.parts.uniqueness);
    assert.ok(b.parts.uniqueness > 0, "diversity is a nudge, not a ban — one good provider must still be usable");
  });

  // ---------------------------------------------------------------- the bar
  console.log("\nthe selection bar");
  await t("80 is the default and the bar for boxes that matter", () => {
    assert.strictEqual(barFor(null), 80, "a want with no box is held to the headline rule");
    assert.strictEqual(barFor({ priority: "critical" }), 80);
    assert.strictEqual(barFor({ priority: "high" }), 80);
  });

  await t("a decorative box is held lower, so texture slots do not starve", () => {
    assert.strictEqual(barFor({ priority: "medium" }), 70);
    assert.strictEqual(barFor({ priority: "low" }), 60);
  });

  await t("grades band as specified", () => {
    assert.strictEqual(gradeFor(94), "excellent");
    assert.strictEqual(gradeFor(83), "approved");
    assert.strictEqual(gradeFor(74), "backup");
    assert.strictEqual(gradeFor(61), "reject");
  });

  // ---------------------------------------------------------------- end to end
  console.log("\nend to end");
  await t("THE SPEC'S OWN EXAMPLE: the revenue dashboard beats the random office worker", () => {
    const ctx = {
      query: "revenue analytics dashboard",
      sceneText: "Track your revenue in real time",
      subjectTerms: ["dashboard", "revenue"],
      requirement: { priority: "high", preferredAspect: 16 / 9, minWidth: 1280, minHeight: 720, kindPref: "screenshot" },
      targetRatio: 16 / 9,
    };
    const good = rescoreMeasured({
      ...ctx,
      candidate: cand({ alt: "a revenue analytics dashboard showing real time sales charts", w: 1920, h: 1080 }),
      meta: meta({ sharpness: 1800, stdev: 46 }),
    });
    const bad = rescoreMeasured({
      ...ctx,
      candidate: cand({ alt: "an office worker walking with a water bottle", w: 1920, h: 1080 }),
      meta: meta({ sharpness: 1800, stdev: 46 }),
    });
    assert.ok(good.score >= 80, `the right picture must clear the bar, scored ${good.score}: ${good.reasons.join(" | ")}`);
    assert.ok(bad.score < 80, `the wrong picture must miss the bar, scored ${bad.score}`);
    assert.ok(good.score - bad.score >= 20, `the gap should be decisive, was ${good.score - bad.score}`);
  });

  await t("explain() renders a one-line audit trail", () => {
    const r = scoreCandidate({ query: "analytics dashboard", candidate: cand({ alt: "analytics dashboard" }) });
    const line = explain(r, { provider: "pexels", query: "analytics dashboard", poolSize: 42 });
    assert.match(line, /\/100/);
    assert.match(line, /pexels/);
    assert.match(line, /pool 42/);
  });

  await t("scoring is deterministic — the same inputs give the same score twice", () => {
    const args = { query: "analytics dashboard", candidate: cand({ alt: "analytics dashboard charts" }), targetRatio: 16 / 9 };
    assert.strictEqual(scoreCandidate(args).score, scoreCandidate(args).score);
  });

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
