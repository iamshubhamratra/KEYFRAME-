// Unit tests for music sourcing: does a short film get a REAL track, a DIFFERENT
// one per job, and does the synthesized floor stay inside ffmpeg's legal ranges?
// All three were live defects on short horizontal films:
//   1. every short shipped the same synthetic pad (over-specific query went dry)
//   2. the seed rotation was a no-op on a 1-result query
//   3. the "guaranteed" pad floor crashed ffmpeg on ~18% of epic-mood seeds,
//      shipping a SILENT film
// Offline: pure helpers only, no network, no ffmpeg.
// Run: node scripts/audio_music.test.cjs   (npm run test:music)
const assert = require("node:assert");
const { __test } = require("../src/services/audio_sources");
const { musicQueryCandidates, padParams, seedIndex } = __test;

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log("  ok  -", name); }
  catch (e) { fail++; console.log("  FAIL-", name, "\n       ", e.message); }
}

// ---------- the pad floor must never emit an illegal ffmpeg value ----------

test("tremolo stays >= 0.1 for every seed on every mood (ffmpeg's hard floor)", () => {
  // ffmpeg: "Value 0.090000 for parameter 'f' out of range [0.1 - 20000]".
  // Below the floor ffmpeg exits non-zero, generatePad returns null, and the
  // film ships with NO music at all.
  const moods = [
    "epic orchestral cinematic trailer", // trem 0.12 — the one that broke
    "upbeat energetic electro pop",
    "warm calm ambient",
  ];
  for (const q of moods) {
    for (let i = 0; i < 300; i++) {
      const s = padParams(q, `job_${i.toString(36)}_${q}`);
      assert.ok(s.trem >= 0.1, `trem ${s.trem} < 0.1 for "${q}" seed ${i}`);
      assert.ok(s.trem <= 20000, `trem ${s.trem} > 20000 for "${q}"`);
      assert.ok(s.lp >= 200 && s.lp <= 20000, `lowpass ${s.lp} out of range for "${q}"`);
      assert.ok(s.freqs.every((f) => f > 0), `non-positive sine freq for "${q}"`);
    }
  }
});

test("the epic bed specifically survives its worst seed", () => {
  // Regression pin: epic's base trem is 0.12 and the jitter reaches -0.03.
  let sawClamp = false;
  for (let i = 0; i < 500; i++) {
    const s = padParams("epic orchestral cinematic", `seed${i}`);
    assert.ok(s.trem >= 0.1);
    if (s.trem === 0.1) sawClamp = true;
  }
  assert.ok(sawClamp, "expected some seeds to actually hit the clamp");
});

test("an unseeded pad is still legal", () => {
  const s = padParams("epic orchestral cinematic");
  assert.ok(s.trem >= 0.1 && s.lp >= 200);
});

// ---------- query widening must stay musical ----------

test("widening follows the GENRE at the tail, not the foley at the head", () => {
  // The reported failure: this query went dry on every source, so the film
  // fell to the synthetic pad.
  const r = musicQueryCandidates("hand claps foot stomps rock energetic anthem");
  assert.equal(r.tail, "energetic anthem", "genre is the tail");
  assert.ok(r.candidates.includes("energetic anthem"), "genre tail is retried");
  assert.ok(
    !r.candidates.some((c) => /\bhand\b|\bclaps\b|\bstomps\b/.test(c) && c !== r.norm),
    `foley terms leaked into the widening ladder: ${JSON.stringify(r.candidates)}`
  );
  assert.ok(!r.candidates.includes("hand music"), "the nonsense head query is gone");
});

test("the ladder runs most-specific to broadest and ends on a musical catch-all", () => {
  const r = musicQueryCandidates("hand claps foot stomps rock energetic anthem");
  assert.equal(r.candidates[0], r.norm, "the full query is tried first");
  assert.equal(r.candidates[r.candidates.length - 1], "upbeat instrumental music");
  assert.ok(r.candidates.length >= 4, "enough rungs to build a rotatable pool");
});

test("head terms ARE used when the query names no genre at all", () => {
  const r = musicQueryCandidates("footsteps gravel doorway");
  assert.deepEqual(r.genres, [], "no genre words present");
  assert.ok(r.candidates.includes(r.core), "head is the only signal, so it is used");
});

test("repeated words are deduped before widening", () => {
  const r = musicQueryCandidates("epic orchestral synthwave epic orchestral synthwave hybrid");
  assert.equal(r.norm, "epic orchestral synthwave hybrid");
});

test("an empty query still yields a usable ladder", () => {
  const r = musicQueryCandidates("");
  assert.ok(r.candidates.length > 0);
  assert.ok(r.candidates.every((c) => typeof c === "string" && c.length));
});

test("candidates are unique (no wasted round-trips)", () => {
  for (const q of [
    "hand claps foot stomps rock energetic anthem",
    "upbeat corporate technology inspiring",
    "warm calm ambient piano",
    "epic epic epic",
  ]) {
    const c = musicQueryCandidates(q).candidates;
    assert.equal(new Set(c).size, c.length, `duplicate rung for "${q}"`);
  }
});

// ---------- seed rotation must actually spread ----------

test("seedIndex spreads across a pool instead of always picking #0", () => {
  const picks = new Set();
  for (let i = 0; i < 200; i++) picks.add(seedIndex(`job_${Math.random().toString(36).slice(2)}`, 30));
  assert.ok(picks.size > 20, `rotation collapsed: only ${picks.size} distinct starts of 30`);
});

test("seedIndex is stable for the same seed and in range", () => {
  assert.equal(seedIndex("job_abc", 30), seedIndex("job_abc", 30));
  for (let i = 0; i < 100; i++) {
    const n = seedIndex(`job_${i}`, 12);
    assert.ok(n >= 0 && n < 12, `index ${n} out of range`);
  }
});

test("seedIndex tolerates a missing seed and a zero-length pool", () => {
  // No seed means no variety signal, so a fixed in-range index is correct —
  // it must not go out of bounds or NaN. (padSpec separately treats an absent
  // seed as zero jitter, so an unseeded pad is the unjittered baseline.)
  const n = seedIndex(undefined, 8);
  assert.ok(Number.isInteger(n) && n >= 0 && n < 8, `out of range: ${n}`);
  assert.equal(seedIndex(undefined, 8), seedIndex("", 8), "deterministic without a seed");
  assert.equal(seedIndex("job_abc", 0), 0, "an empty pool cannot be indexed");
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
