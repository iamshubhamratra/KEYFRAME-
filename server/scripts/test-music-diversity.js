#!/usr/bin/env node
// MUSIC DIVERSITY — the regression tests for "every music-only video sounds the same".
//
// All offline: these assert the SHAPE of what the pipeline asks for, which is where the
// defect lived. Whether a given term returns tracks is a different invariant, gated live by
// scripts/audit-music-vocabulary.js.
//
// The defect, for the record: musicCandidatesFor led with the pack's keywords joined into
// one phrase ("driving electronic dark techno pulse clinical"). Providers AND-match, so 19
// of the 20 packs measured returned ZERO tracks for their own lead query; every film then
// fell through to a shared two-word widening and a deterministic first page. Test 1 below
// is the one that would have caught it.

const assert = require("node:assert");
const profileSvc = require("../src/services/audio_profile");
const vocab = require("../src/services/music_vocabulary");
const registry = require("../src/services/frame_registry");

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ok  ${name}`); }
  catch (e) { failed++; console.log(`  FAIL ${name}\n       ${e.message}`); }
}

const packs = registry.listPacks();
const profiled = packs.filter((p) => profileSvc.profileFor(p).source === "manifest");
const ladderFor = (pack, jobId, narration = "off") =>
  profileSvc.musicCandidatesFor({
    framePack: pack, jobId, narration,
    profile: profileSvc.profileFor(pack),
    scriptMusic: { mood: "confident", query: "product launch" },
  }).candidates;

console.log("music diversity\n");

// ---------------------------------------------------------------- 1. THE REGRESSION
test("no template query exceeds 2 terms (the AND-match trap)", () => {
  const bad = [];
  for (const pack of profiled) {
    for (const q of ladderFor(pack, "seed-1")) {
      // The script's own subject query is passed through verbatim by design and is not a
      // template query, so it is exempt; everything else must be askable.
      if (q === "confident product launch") continue;
      if (q.split(/\s+/).length > 2) bad.push(`${pack}: "${q}"`);
    }
  }
  assert.strictEqual(bad.length, 0, `${bad.length} over-long quer(ies): ${bad.slice(0, 5).join(" · ")}`);
});

test("every profiled pack produces a non-empty ladder", () => {
  const empty = profiled.filter((p) => ladderFor(p, "seed-1").length === 0);
  assert.strictEqual(empty.length, 0, `empty for: ${empty.join(", ")}`);
});

test("every profiled pack leads with at least one genre term", () => {
  const bad = profiled.filter((p) => !vocab.partition(profileSvc.profileFor(p)).genre.length);
  assert.strictEqual(bad.length, 0, `no genre terms: ${bad.join(", ")}`);
});

// ---------------------------------------------------------------- 2. VARIETY
test("20 jobs on one pack produce >= 8 distinct lead queries", () => {
  for (const pack of ["hacker", "hype-wave", "edition", "paper-tales"]) {
    const leads = new Set();
    for (let i = 0; i < 20; i++) leads.add(ladderFor(pack, `job-${i}`)[0]);
    assert.ok(leads.size >= 8, `${pack}: only ${leads.size} distinct lead(s) across 20 jobs`);
  }
});

test("two different jobs on one pack rarely ask identically", () => {
  for (const pack of profiled.slice(0, 25)) {
    const a = ladderFor(pack, "job-alpha").join("|");
    const b = ladderFor(pack, "job-beta").join("|");
    assert.notStrictEqual(a, b, `${pack} asks identically for two different jobs`);
  }
});

// ---------------------------------------------------------------- 3. DISTINCTNESS
test("templates of different character never ask the same way", () => {
  // Deliberately NOT "no two packs share a genre term" — edition and paper-tales are both
  // genuinely acoustic, and forbidding the overlap would misdescribe the library. What must
  // not happen is two packs of different character issuing the SAME ladder, because that is
  // what makes two films indistinguishable.
  const chars = ["hacker", "edition", "hype-wave", "paper-tales", "deep", "synthwave-sunset", "grid-dispatch"];
  for (let i = 0; i < chars.length; i++) {
    for (let j = i + 1; j < chars.length; j++) {
      const a = ladderFor(chars[i], "same-job");
      const b = ladderFor(chars[j], "same-job");
      assert.notDeepStrictEqual(a, b, `${chars[i]} and ${chars[j]} ask identically`);
      const shared = a.filter((q) => b.includes(q) && q !== "confident product launch");
      assert.ok(shared.length <= 2, `${chars[i]} / ${chars[j]} share ${shared.length} queries: ${shared.join(", ")}`);
    }
  }
});

test("the library as a whole spans many genres", () => {
  const all = new Set();
  for (const p of profiled) for (const g of vocab.partition(profileSvc.profileFor(p)).genre) all.add(g);
  assert.ok(all.size >= 25, `only ${all.size} distinct genre terms across ${profiled.length} packs`);
});

// ---------------------------------------------------------------- 3b. ARCHETYPES (P3)
test("every pack belongs to an archetype", () => {
  const orphan = profiled.filter((p) => !profileSvc.profileFor(p).archetype);
  assert.strictEqual(orphan.length, 0, `no archetype: ${orphan.join(", ")}`);
});

test("the keyword pool is at least 10 deep on every pack", () => {
  const thin = profiled
    .map((p) => [p, profileSvc.profileFor(p).musicKeywords.length])
    .filter(([, n]) => n < 10);
  assert.strictEqual(thin.length, 0, `thin pools: ${thin.map(([p, n]) => `${p}(${n})`).join(", ")}`);
});

test("an archetype widens colour but NEVER contributes genre", () => {
  // The load-bearing guarantee of P3. If archetypes leaked into style[], the fifteen
  // luxury packs would start leading queries with the same genre and converge — the exact
  // failure this whole document exists to fix, reintroduced from the other direction.
  const byArch = new Map();
  for (const p of profiled) {
    const pr = profileSvc.profileFor(p);
    if (!byArch.has(pr.archetype)) byArch.set(pr.archetype, []);
    byArch.get(pr.archetype).push([p, vocab.partition(pr).genre.join("|")]);
  }
  for (const [arch, members] of byArch) {
    if (members.length < 2) continue;
    const distinct = new Set(members.map(([, g]) => g));
    assert.ok(
      distinct.size > 1,
      `every pack in archetype "${arch}" declares identical genres — the archetype leaked into style[]`
    );
  }
});

test("packs sharing an archetype still ask differently", () => {
  const byArch = new Map();
  for (const p of profiled) {
    const a = profileSvc.profileFor(p).archetype;
    if (!byArch.has(a)) byArch.set(a, []);
    byArch.get(a).push(p);
  }
  for (const [arch, members] of byArch) {
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const a = ladderFor(members[i], "same-job");
        const b = ladderFor(members[j], "same-job");
        assert.notDeepStrictEqual(a, b, `${members[i]} and ${members[j]} (both ${arch}) ask identically`);
      }
    }
  }
});

// ---------------------------------------------------------------- 4. DETERMINISM
test("the same job asks the same way twice (re-render stability)", () => {
  for (const pack of profiled.slice(0, 20)) {
    assert.deepStrictEqual(ladderFor(pack, "fixed-job"), ladderFor(pack, "fixed-job"), pack);
  }
});

test("narration off reaches the pack's driving end", () => {
  // Keywords are authored calmest-first, so the no-VO ladder must draw colour terms the
  // narrated ladder does not. Checked across the library rather than on one pack, because
  // a pack with energyBoost 0 deliberately does not tilt.
  let tilted = 0;
  for (const pack of profiled) {
    const p = profileSvc.profileFor(pack);
    if (p.noVo.energyBoost === 0) continue;
    const on = new Set(ladderFor(pack, "j", "on"));
    const off = ladderFor(pack, "j", "off");
    if (off.some((q) => !on.has(q))) tilted++;
  }
  assert.ok(tilted >= profiled.length * 0.5, `only ${tilted}/${profiled.length} packs tilt with narration off`);
});

// ---------------------------------------------------------------- 5. VOCABULARY HYGIENE
test("genre compounds survive as phrases (hip hop, future bass)", () => {
  const g = vocab.partition(profileSvc.profileFor("hype-wave")).genre;
  assert.ok(g.some((t) => t.includes(" ")), `hype-wave genre terms lost their compound: ${g.join(", ")}`);
});

test("no term is a stopword or a fragment", () => {
  for (const pack of profiled) {
    for (const t of vocab.termsForProfile(profileSvc.profileFor(pack))) {
      for (const w of t.split(" ")) {
        assert.ok(w.length >= 3, `${pack}: fragment "${w}" in "${t}"`);
        assert.ok(!vocab.STOPWORDS.has(w), `${pack}: stopword "${w}" in "${t}"`);
      }
    }
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
