#!/usr/bin/env node
// MUSIC HISTORY — the variety ledger.
//
// Two properties are in tension and both must hold:
//   · ACROSS jobs, a recently-shipped track must lose to a comparable fresh one;
//   · WITHIN a job, a re-render must reproduce the film it produced the first time.
// The ledger resolves them by treating a job's OWN prior entry as a pin rather than a
// penalty. These tests pin that resolution down.
//
// Offline: the ledger is pure state, no provider involved. The ranking arithmetic is
// checked against audio_sources.scoreTrack directly.

const assert = require("node:assert");
const fs = require("node:fs");

const history = require("../src/services/music_history");
const { __test: { scoreTrack } } = require("../src/services/audio_sources");

let passed = 0, failed = 0;
function test(name, fn) {
  history.reset();
  try { fn(); passed++; console.log(`  ok  ${name}`); }
  catch (e) { failed++; console.log(`  FAIL ${name}\n       ${e.message}`); }
}

const K = history.trackKey;
console.log("music history (variety ledger)\n");

// ---------------------------------------------------------------- identity
test("track keys are stable and provider-scoped", () => {
  assert.strictEqual(K("freesound", 123), "freesound:123");
  assert.notStrictEqual(K("freesound", 1), K("pixabay", 1));
});

// ---------------------------------------------------------------- penalties
test("a track just shipped on THIS pack is penalised hardest", () => {
  history.record({ key: K("freesound", 1), provider: "freesound", pack: "edition", jobId: "j1" });
  const h = history.penaltiesFor({ pack: "edition", jobId: "j2" });
  assert.strictEqual(h.penalty(K("freesound", 1)), 40);
});

test("the same track on ANOTHER pack is penalised, but less", () => {
  history.record({ key: K("freesound", 1), provider: "freesound", pack: "edition", jobId: "j1" });
  const h = history.penaltiesFor({ pack: "hype-wave", jobId: "j2" });
  assert.strictEqual(h.penalty(K("freesound", 1)), 25);
});

test("penalties decay with depth, and vanish beyond the warm window", () => {
  for (let i = 0; i < 25; i++) {
    history.record({ key: K("freesound", i), provider: "freesound", pack: "p", jobId: `j${i}` });
  }
  const h = history.penaltiesFor({ pack: "other", jobId: "new" });
  // newest first: index 0 is track 24
  assert.strictEqual(h.penalty(K("freesound", 24)), 25, "newest");
  assert.strictEqual(h.penalty(K("freesound", 20)), 25, "still inside the recent window");
  assert.strictEqual(h.penalty(K("freesound", 10)), 10, "warm");
  assert.strictEqual(h.penalty(K("freesound", 0)), 0, "old enough to reuse");
});

test("an unseen track is never penalised", () => {
  history.record({ key: K("freesound", 1), provider: "freesound", pack: "p", jobId: "j1" });
  const h = history.penaltiesFor({ pack: "p", jobId: "j2" });
  assert.strictEqual(h.penalty(K("freesound", 999)), 0);
});

// ---------------------------------------------------------------- the actual outcome
test("a penalty flips the ranking between two comparable tracks", () => {
  // Same duration, same tags, same popularity — identical on every metadata signal, so
  // only the ledger can separate them. This is the case the whole feature exists for.
  const a = { id: 1, duration: 60, tags: ["techno"], avg_rating: 4, num_downloads: 100 };
  const b = { id: 2, duration: 60, tags: ["techno"], avg_rating: 4, num_downloads: 100 };
  const opts = { filmSec: 30, style: ["techno"] };
  assert.strictEqual(scoreTrack(a, opts), scoreTrack(b, opts), "precondition: identical scores");

  history.record({ key: K("freesound", 1), provider: "freesound", pack: "edition", jobId: "j1" });
  const h = history.penaltiesFor({ pack: "edition", jobId: "j2" });
  const sa = scoreTrack(a, opts) - h.penalty(K("freesound", a.id));
  const sb = scoreTrack(b, opts) - h.penalty(K("freesound", b.id));
  assert.ok(sb > sa, `the fresh track must win: fresh ${sb} vs used ${sa}`);
});

test("a penalty cannot veto — a much better used track still wins", () => {
  // Used, but covers the film; fresh, but only half its length and will loop audibly.
  const used  = { id: 1, duration: 120, tags: ["techno"], avg_rating: 5, num_downloads: 5000 };
  const fresh = { id: 2, duration: 15,  tags: [],         avg_rating: 0, num_downloads: 0 };
  const opts = { filmSec: 30, style: ["techno"] };
  history.record({ key: K("freesound", 1), provider: "freesound", pack: "edition", jobId: "j1" });
  const h = history.penaltiesFor({ pack: "edition", jobId: "j2" });
  const su = scoreTrack(used, opts) - h.penalty(K("freesound", 1));
  const sf = scoreTrack(fresh, opts) - h.penalty(K("freesound", 2));
  assert.ok(su > sf, `quality must still beat novelty: used ${su} vs fresh ${sf}`);
});

// ---------------------------------------------------------------- re-render
test("a job's own entry is a PIN, not a penalty", () => {
  history.record({ key: K("freesound", 7), provider: "freesound", pack: "edition", jobId: "job-x", query: "techno" });
  const h = history.penaltiesFor({ pack: "edition", jobId: "job-x" });
  assert.ok(h.pinned, "the job must find its own previous track");
  assert.strictEqual(h.pinned.key, K("freesound", 7));
  assert.strictEqual(h.penalty(K("freesound", 7)), 0, "a job must never be penalised for its own choice");
});

test("another job sees that same track as recent", () => {
  history.record({ key: K("freesound", 7), provider: "freesound", pack: "edition", jobId: "job-x" });
  const h = history.penaltiesFor({ pack: "edition", jobId: "job-y" });
  assert.strictEqual(h.pinned, null);
  assert.strictEqual(h.penalty(K("freesound", 7)), 40);
});

test("re-recording a job replaces its row instead of duplicating it", () => {
  history.record({ key: K("freesound", 1), provider: "freesound", pack: "p", jobId: "job-x" });
  history.record({ key: K("freesound", 2), provider: "freesound", pack: "p", jobId: "job-x" });
  const rows = history.all().filter((r) => r.jobId === "job-x");
  assert.strictEqual(rows.length, 1, `expected 1 row for job-x, saw ${rows.length}`);
  assert.strictEqual(rows[0].key, K("freesound", 2));
});

// ---------------------------------------------------------------- providers without metadata
test("the recent set names every penalised track, for providers that cannot rank", () => {
  history.record({ key: K("pixabay", "https://cdn/x.mp3"), provider: "pixabay", pack: "p", jobId: "j1" });
  const h = history.penaltiesFor({ pack: "p", jobId: "j2" });
  assert.ok(h.recent.has(K("pixabay", "https://cdn/x.mp3")), "Pixabay steps past what is in `recent`");
});

// ---------------------------------------------------------------- housekeeping
test("the ledger is capped and keeps the newest entries", () => {
  const CAP = history.__test.CAP;
  for (let i = 0; i < CAP + 40; i++) {
    history.record({ key: K("freesound", i), provider: "freesound", pack: "p", jobId: `j${i}` });
  }
  const all = history.all();
  assert.ok(all.length <= CAP, `ledger grew to ${all.length}, cap is ${CAP}`);
  assert.strictEqual(all[0].key, K("freesound", CAP + 39), "newest entry must survive");
});

test("a corrupt ledger degrades to empty instead of throwing", () => {
  fs.mkdirSync(require("node:path").dirname(history.FILE), { recursive: true });
  fs.writeFileSync(history.FILE, "{ not json");
  history.reset();
  fs.writeFileSync(history.FILE, "{ not json");
  const h = history.penaltiesFor({ pack: "p", jobId: "j" });
  assert.strictEqual(h.size, 0);
  assert.strictEqual(h.penalty("anything"), 0);
});

history.reset();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
