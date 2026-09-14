#!/usr/bin/env node
// ASSET RELEVANCE GUARDS — run: npm run test:assets
//
// Every case here is a REAL failure observed from the live provider, not a
// hypothetical. The complaint these guard against is "the assets don't match the
// script": the retrieval layer was returning reasonable candidates and the
// ranker was choosing the wrong one, because relevance was exact-token equality
// and resolution was worth a third of the verdict.
//
// The headline case: for "team collaborating on a project timeline" the scraper
// offered both "team collaboration together" and "team woman dog human portrait".
// Each matched exactly one token ("team") — "collaborating" is not the string
// "collaboration" — so they tied at 0.396 and the DOG won on arrival order.

const assert = require("node:assert");
const { scoreCandidate, rankCandidates } = require("../src/services/asset_sources/util");
const pixabay = require("../src/services/asset_sources/pixabay_api");

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log(`  ok    ${name}`); }
  catch (e) { fail++; console.log(`  FAIL  ${name}\n        ${e.message}`); }
}
const cand = (tags, width = 1280, height = 854) => ({ tags, width, height, url: `https://x/${tags.replace(/\s+/g, "-")}.jpg` });
const best = (query, cands) => rankCandidates(query, cands)[0];
const scoreOf = (query, c) => scoreCandidate(query, c).score;

// ------------------------------------------------------------ the real failure
const TIMELINE = "team collaborating on a project timeline";
test("the relevant photo beats the dog photo (the reported bug)", () => {
  const dog = cand("team woman dog human portrait");
  const real = cand("team collaboration together");
  assert.ok(scoreOf(TIMELINE, real) > scoreOf(TIMELINE, dog),
    `dog ${scoreOf(TIMELINE, dog).toFixed(3)} >= real ${scoreOf(TIMELINE, real).toFixed(3)}`);
  assert.strictEqual(best(TIMELINE, [dog, real, cand("kitten cat pet animal", 1920, 1280)]).tags, "team collaboration together");
});
test("the dog does not merely tie — it loses clearly", () => {
  const margin = scoreOf(TIMELINE, cand("team collaboration together")) - scoreOf(TIMELINE, cand("team woman dog human portrait"));
  assert.ok(margin > 0.15, `margin only ${margin.toFixed(3)}`);
});

// ------------------------------------------- the query the PIPELINE actually sends
// The cases above use a 4-token query. Production did not: the live orchestrator
// glued the film's topic anchor AND the pack's photo modifier onto every search
// ("<subject> <scene need> bold graphic pop art"), and ranked against that same
// string. Relevance is a ratio over the whole query, so one matched word was
// worth ~0.09 of a 13-token string instead of ~0.20 of the need — enough for the
// pack's own style words to pick the winner. These guard the property the
// pipeline has now: the scene's need is what a candidate is judged against.
test("a padded query dilutes relevance; the scene's need does not", () => {
  const need = "team collaborating on a project timeline";
  const anchored = `project tracker software for teams ${need} bold graphic pop art`;
  const right = cand("team collaboration together");
  // The same candidate, the same picture — only the string it is judged against
  // differs. Padding the query with the anchor and the pack's style words spreads
  // the ratio over words the candidate was never going to carry, so a genuinely
  // good match scores roughly half as well and ties become common.
  assert.ok(scoreOf(need, right) >= scoreOf(anchored, right) * 1.5,
    `need ${scoreOf(need, right).toFixed(3)} vs padded ${scoreOf(anchored, right).toFixed(3)}`);
});
test("the film's subject breaks a tie between two equally on-need candidates", () => {
  const need = "hands typing at a desk";
  const subject = "note-taking software that organizes itself";
  // Both carry every word of the need, so relevance cannot separate them. Only
  // one is about the film. The subject is SCORED rather than searched for, which
  // is dead weight unless the subject is kept out of the ranked query — that is
  // what rankQuery guarantees.
  const onTopic = cand("hands typing desk notes software");
  const generic = cand("hands typing desk sunset beach");
  const s = (c) => scoreCandidate(need, c, null, subject).score;
  assert.ok(s(onTopic) > s(generic), `${s(onTopic).toFixed(3)} !> ${s(generic).toFixed(3)}`);
  assert.ok(scoreCandidate(need, onTopic, null, subject).subjectAffinity > 0,
    "subjectAffinity is dead — the subject must not already be inside the ranked query");
});

// ------------------------------------------------------------------- stemming
test("a word form counts as a match (collaborating ~ collaboration)", () => {
  assert.ok(scoreCandidate("collaborating", cand("collaboration")).relevance === 1);
  assert.ok(scoreCandidate("planning a launch", cand("plan launch")).relevance === 1);
  assert.ok(scoreCandidate("teams shipping", cand("team ship")).relevance === 1);
});
test("a prefix is only a match when it is nearly the whole word", () => {
  // "auto" must NOT satisfy "automatic" — a gearstick photo scored as a hit for
  // "automatic expense tracking" before this rule.
  assert.strictEqual(scoreCandidate("automatic", cand("auto")).relevance, 0);
  assert.strictEqual(scoreCandidate("cardboard", cand("car")).relevance, 0);
  assert.strictEqual(scoreCandidate("teamwork", cand("team")).relevance, 1);
});

// ---------------------------------------------------------------- distractors
test("an unrequested subject is penalised", () => {
  const plain = cand("office meeting people");
  const withDog = cand("office meeting people dog puppy");
  assert.ok(scoreOf("office meeting", plain) > scoreOf("office meeting", withDog));
});
test("but a film that ASKS for the subject still gets it", () => {
  // The penalty is for a candidate dragging in a subject nobody wanted, never for
  // the subject existing — a dog-food ad must still be able to show a dog.
  const dog = cand("dog puppy pet happy");
  const notDog = cand("office desk chair");
  assert.ok(scoreOf("a happy dog eating", dog) > scoreOf("a happy dog eating", notDog),
    "a dog query must still rank dogs first");
});
test("word-sense noise ranks below a real match", () => {
  const q = "automatic expense tracking for freelancers";
  const real = cand("expense receipt accounting finance", 1200, 800);
  for (const noise of ["railway rail track railroad", "the way night light car track", "gearstick car vehicle auto fast"]) {
    assert.ok(scoreOf(q, real) > scoreOf(q, cand(noise)), `"${noise}" outranked the real match`);
  }
});

// ------------------------------------------------------------------- quality
test("resolution cannot buy relevance", () => {
  // A 1920px image of nothing related used to score 0.350 against a 1280px exact
  // match's 0.396 — near parity, and a win as soon as the match was smaller.
  const bigIrrelevant = cand("kitten cat pet animal", 1920, 1280);
  const smallRelevant = cand("team collaboration together", 1100, 733);
  assert.ok(scoreOf(TIMELINE, smallRelevant) > scoreOf(TIMELINE, bigIrrelevant) * 2,
    `small relevant ${scoreOf(TIMELINE, smallRelevant).toFixed(3)} vs big irrelevant ${scoreOf(TIMELINE, bigIrrelevant).toFixed(3)}`);
});
test("between two equally relevant candidates the sharper one still wins", () => {
  const sharp = cand("team collaboration together", 1920, 1280);
  const soft = cand("team collaboration together", 1000, 667);
  assert.ok(scoreOf(TIMELINE, sharp) > scoreOf(TIMELINE, soft));
});

// -------------------------------------------------------------- known-good behaviour
test("an unlabelled candidate still outranks a labelled mismatch", () => {
  // Deliberate pre-existing rule: no keywords is UNKNOWN relevance, not zero.
  const unlabelled = { url: "https://x/a.jpg", width: 1280, height: 854 };
  const mismatch = cand("kitten cat pet animal");
  assert.ok(scoreOf(TIMELINE, unlabelled) > scoreOf(TIMELINE, mismatch));
});
test("an empty query does not crash or zero everything", () => {
  assert.ok(scoreCandidate("", cand("anything at all")).score > 0);
  assert.ok(scoreCandidate(null, cand("anything at all")).score > 0);
});
test("rankCandidates drops soft images unless that would leave nothing", () => {
  const soft = cand("team collaboration together", 320, 200);
  assert.strictEqual(rankCandidates(TIMELINE, [soft]).length, 1, "a soft image is better than an empty scene");
  const sharp = cand("team collaboration together", 1600, 900);
  assert.strictEqual(rankCandidates(TIMELINE, [soft, sharp])[0].width, 1600);
});
test("style keywords still bias toward on-brand imagery", () => {
  const neon = cand("city street neon night");
  const plain = cand("city street building");
  const withStyle = (c) => scoreCandidate("a city street", c, ["neon"]).score;
  assert.ok(withStyle(neon) > withStyle(plain));
});

// ---------------------------------------- the resolution the ranker is scoring
// Pixabay reports the photographer's MASTER dimensions and serves a capped file.
// Measured live on 2026-09-07: reported 5400x3375 / 2592x1769 / 5868x4004,
// downloaded 1280x800 / 1280x874 / 1280x873 — and a standard key gets no
// fullHDURL, so every image is the 1280 rung. Scoring the master pinned the
// quality term at 1.0 for every candidate, which is the same as not having one.
const hit = (imageWidth, imageHeight, { fullHD = false } = {}) => ({
  imageWidth, imageHeight,
  largeImageURL: "https://pixabay.com/get/large.jpg",
  webformatURL: "https://pixabay.com/get/web_640.jpg",
  ...(fullHD ? { fullHDURL: "https://pixabay.com/get/fullhd.jpg" } : {}),
});
const delivered = (h) => {
  const url = h.fullHDURL || h.largeImageURL || h.webformatURL;
  return pixabay.deliveredDims(h.imageWidth, h.imageHeight, pixabay.capFor(h, url));
};
test("a 5400px master is reported at the 1280px size we actually download", () => {
  assert.deepStrictEqual(delivered(hit(5400, 3375)), { width: 1280, height: 800 });
  assert.deepStrictEqual(delivered(hit(2592, 1769)), { width: 1280, height: 874 });
  assert.deepStrictEqual(delivered(hit(5868, 4004)), { width: 1280, height: 873 });
});
test("a fullHD-capable account is reported at 1920, not at the master", () => {
  assert.deepStrictEqual(delivered(hit(5400, 3375, { fullHD: true })), { width: 1920, height: 1200 });
});
test("the cap never upscales a master smaller than it", () => {
  assert.deepStrictEqual(delivered(hit(900, 600)), { width: 900, height: 600 });
});
test("a portrait master is capped on its LONG edge", () => {
  assert.deepStrictEqual(delivered(hit(2000, 4000)), { width: 640, height: 1280 });
});
test("delivered dims make the quality term discriminate again", () => {
  // Both masters clear 1920, so on the REPORTED numbers both scored quality 1.0
  // and the term ordered nothing. On delivered numbers the 1000px master arrives
  // genuinely softer than one that fills the 1280 cap, and now ranks below it.
  const q = (d) => scoreCandidate("team collaboration", { tags: "team collaboration", ...d }).score;
  assert.ok(q(delivered(hit(5400, 3375))) > q(delivered(hit(1000, 625))),
    "the file that fills the cap must outrank the one that cannot");
  assert.strictEqual(q({ width: 5400, height: 3375 }), q({ width: 2592, height: 1769 }),
    "sanity: on the master numbers every stock hit tied");
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
