// Unit tests for video_edit/retention.js (ENGINE.md §4.12–4.13).
// Run: node scripts/video_edit_retention.test.cjs
//
// Load-bearing: retention deletes only what the rules allow and only from idle projects —
// never an active or DELETING project, never a plan, mezzanine or export; the original is removed
// only after its mezzanine verifies; and deletion follows the exact sequence DELETING persisted →
// run aborted → streams closed → index drop → trash → rm, so a crash at any point resumes.

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { createHarness, mkTmp, makeSettings, installFetchTripwire, silentLog } = require("./lib/video_edit_test_utils.cjs");

const tmp = mkTmp("ve-retention-");
process.env.VIDEO_EDIT_DIR = path.join(tmp.dir, "_guard", "edits");
process.env.VIDEO_EDIT_INDEX = path.join(tmp.dir, "_guard", "video-edits.json");

const { createStore } = require("../src/video_edit/store");
const { createQueue } = require("../src/video_edit/engine/queue");
const { createRunner } = require("../src/video_edit/engine/runner");
const { createRetention, startRetention, sweepStaging } = require("../src/video_edit/retention");
const fsx = require("../src/video_edit/fsx");

const { t, section, run } = createHarness();
const restoreFetch = installFetchTripwire();
const WIN = process.platform === "win32";
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const T0 = Date.UTC(2026, 8, 1, 12, 0, 0);
let clock = T0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cleanups = [];

function env(name, { runner = null, closeStreams, ownerExists, freeDiskMb } = {}) {
  const settings = makeSettings(path.join(tmp.dir, name));
  const store = createStore({ settings, now: () => clock, log: silentLog });
  store.init();
  const logs = [];
  const log = { info: (m) => logs.push(m), warn: (m) => logs.push(m), error: (m) => logs.push(m) };
  const retention = createRetention({
    store, settings, runner, now: () => clock, log, closeStreams, ownerExists, freeDiskMb: freeDiskMb || (() => 999999),
  });
  cleanups.push(async () => store.close());
  return { settings, store, retention, logs };
}

const SEEDS = ["work/frames/f1.jpg", "work/chunks/c1.mp3", "render/cache/base/x.bin", "qa/rd_aaaaaaaa/lap0/frames/a.jpg",
  "qa/rd_aaaaaaaa/lap0/checks.json", "work/mezz.mp4", "work/proxy540.mp4", "render/out/rd_aaaaaaaa.mp4"];
const INTERMEDIATES = ["work/frames", "work/chunks", "render/cache", "qa/rd_aaaaaaaa/lap0/frames"];
const KEEPERS = ["qa/rd_aaaaaaaa/lap0/checks.json", "work/mezz.mp4", "work/proxy540.mp4", "render/out/rd_aaaaaaaa.mp4", "plan/revisions/r000001.json", "source/original.bin"];

let seq = 0;
async function project(e, status, { ownerId = "owner-1" } = {}) {
  const { store } = e;
  const p = store.createProject({ ownerId, settings: {}, consent: { thirdPartyAi: true, termsVersion: "2026-09" } });
  seq++;
  const staged = path.join(store.settings.paths.stagingDir, `fixture-${seq}.upload`);
  fs.writeFileSync(staged, Buffer.alloc(4096, seq % 250));
  await store.attachSource(p.id, { stagedPath: staged, sha256: crypto.createHash("sha256").update(`fx-${seq}`).digest("hex"), sizeBytes: 4096, demuxer: "mov", probe: { durationSec: 5 }, displayName: "clip.mp4" });
  for (const rel of SEEDS) {
    const f = store.abs(p.id, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, Buffer.alloc(rel.endsWith(".mp4") ? 20000 : 500, 3));
  }
  await store.saveRevision(p.id, { schema: "kf.edit_plan", version: 1 }, { author: "director" });
  const path_ = {
    QUEUED: [], PROCESSING: ["PROCESSING"], READY: ["PROCESSING", "READY"], COMPLETED: ["PROCESSING", "RENDERING", "COMPLETED"],
    FAILED: ["PROCESSING", "FAILED"], NEEDS_ATTENTION: ["PROCESSING", "NEEDS_ATTENTION"], CANCELLED: ["CANCELLED"],
  }[status];
  for (const s of path_) await store.setStatus(p.id, s, { reason: s === "FAILED" ? "UNDECODABLE" : null });
  return store.get(p.id);
}

const has = (e, id, rel) => fs.existsSync(path.join(e.settings.paths.dir, id, rel));
const sameMembers = (a, b, msg) => assert.deepEqual([...a].sort(), [...b].sort(), msg);

// ---------------------------------------------------------------------------------------------
section("retention — sweep rules");

t("READY/COMPLETED: intermediates purged only after 72 h idle; mezzanine, plan, exports and source kept", async () => {
  clock = T0;
  const e = env("idle");
  const ready = await project(e, "READY");
  const done = await project(e, "COMPLETED");
  clock = T0 + 71 * HOUR;
  let r = await e.retention.sweepOnce();
  assert.deepEqual(r.intermediatesPurged, []);
  assert.ok(has(e, ready.id, "work/frames/f1.jpg"));
  clock = T0 + 73 * HOUR;
  r = await e.retention.sweepOnce();
  sameMembers(r.intermediatesPurged, [ready.id, done.id]);
  for (const id of [ready.id, done.id]) {
    for (const rel of INTERMEDIATES) assert.equal(has(e, id, rel), false, `${rel} purged`);
    for (const rel of KEEPERS) assert.equal(has(e, id, rel), true, `${rel} kept`);
  }
  const doc = e.store.get(ready.id);
  assert.equal(doc.retention.intermediatesPurgedAt, clock);
  assert.ok(doc.storage.bytes > 0);
  assert.ok(e.store.loadRevision(ready.id, 1), "plan revision still loads");
  r = await e.retention.sweepOnce();
  assert.deepEqual(r.intermediatesPurged, [], "nothing left to purge");
});

t("READY past the TTL (30 d after the last open) is deleted; a recent open postpones it", async () => {
  clock = T0;
  const e = env("ttl");
  const stale = await project(e, "READY");
  const opened = await project(e, "READY");
  clock = T0 + 29 * DAY;
  await e.store.update(opened.id, (d) => { d.lastOpenedAt = clock; });
  clock = T0 + 31 * DAY;
  const r = await e.retention.sweepOnce();
  assert.deepEqual(r.deleted, [stale.id]);
  assert.equal(e.store.get(stale.id), null);
  assert.equal(fs.existsSync(path.join(e.settings.paths.dir, stale.id)), false);
  assert.equal(e.store.get(opened.id).status, "READY");
});

t("FAILED: source and work deleted at once, the record kept 7 days, then the project is deleted", async () => {
  clock = T0;
  const e = env("failed");
  const f = await project(e, "FAILED");
  clock = T0 + 60 * 1000;
  let r = await e.retention.sweepOnce();
  assert.deepEqual(r.failedPurged, [f.id]);
  assert.equal(has(e, f.id, "source/original.bin"), false);
  assert.deepEqual(fs.readdirSync(path.join(e.settings.paths.dir, f.id, "work")), []);
  assert.equal(has(e, f.id, "project.json"), true);
  assert.equal(has(e, f.id, "plan/revisions/r000001.json"), true);
  r = await e.retention.sweepOnce();
  assert.deepEqual(r.failedPurged, [], "idempotent");
  clock = T0 + 7 * DAY + 1;
  r = await e.retention.sweepOnce();
  assert.deepEqual(r.deleted, [f.id]);
  assert.equal(e.store.get(f.id), null);
});

t("FAILED for a non-media reason, or after a mezzanine was made, keeps source and mezzanine (I6); only caches go", async () => {
  clock = T0;
  const e = env("failed-keep");
  const missing = await project(e, "PROCESSING");
  await e.store.setStatus(missing.id, "FAILED", { reason: { code: "SOURCE_MISSING", retryable: false } });
  const normalized = await project(e, "PROCESSING");
  await e.store.update(normalized.id, (d) => { d.source.mezzanine = { path: "work/mezz.mp4" }; });
  await e.store.setStatus(normalized.id, "FAILED", { reason: "MEDIA_REJECTED" });
  const rejected = await project(e, "FAILED");   // UNDECODABLE, never normalized: purged as before
  clock = T0 + 60 * 1000;
  const r = await e.retention.sweepOnce();
  sameMembers(r.failedPurged, [missing.id, normalized.id, rejected.id]);
  for (const id of [missing.id, normalized.id]) {
    for (const rel of ["source/original.bin", "work/mezz.mp4", "work/proxy540.mp4", "plan/revisions/r000001.json"]) assert.equal(has(e, id, rel), true, `${rel} kept`);
    for (const rel of ["work/frames", "work/chunks", "render/cache"]) assert.equal(has(e, id, rel), false, `${rel} purged`);
  }
  assert.equal(has(e, rejected.id, "source/original.bin"), false);
  assert.equal(has(e, rejected.id, "work/mezz.mp4"), false);
});

t("each sweep re-measures storage.bytes when it drifted, so quotas count derived media", async () => {
  clock = T0;
  const e = env("storage");
  const p = await project(e, "READY");
  const busy = await project(e, "PROCESSING");
  for (const id of [p.id, busy.id]) fs.writeFileSync(e.store.abs(id, "work/voice48k.wav"), Buffer.alloc(3 * 1024 * 1024));
  assert.ok(e.store.get(p.id).storage.bytes < 1024 * 1024);
  let r = await e.retention.sweepOnce();
  assert.deepEqual(r.storageRefreshed, [p.id], "active projects are left to the runner");
  const bytes = e.store.get(p.id).storage.bytes;
  assert.ok(bytes >= 3 * 1024 * 1024, `storage.bytes ${bytes}`);
  // Writing the new figure into project.json changes the directory size by a few bytes.
  assert.ok(Math.abs(bytes - fsx.dirSizeBytes(e.store.projectDir(p.id))) < 1024, `${bytes} vs ${fsx.dirSizeBytes(e.store.projectDir(p.id))}`);
  assert.ok(e.store.userStorageBytes("owner-1") >= bytes);
  r = await e.retention.sweepOnce();
  assert.deepEqual(r.storageRefreshed, [], "no write when nothing drifted");
});

t("NEEDS_ATTENTION/CANCELLED: kept whole 7 days, then caches purged, deleted at 30 days", async () => {
  clock = T0;
  const e = env("parked");
  const n = await project(e, "NEEDS_ATTENTION");
  const c = await project(e, "CANCELLED");
  clock = T0 + 6 * DAY;
  let r = await e.retention.sweepOnce();
  assert.deepEqual(r.intermediatesPurged, []);
  clock = T0 + 7 * DAY + HOUR;
  r = await e.retention.sweepOnce();
  sameMembers(r.intermediatesPurged, [n.id, c.id]);
  for (const id of [n.id, c.id]) {
    assert.equal(has(e, id, "work/frames"), false);
    assert.equal(has(e, id, "source/original.bin"), true);
    assert.equal(has(e, id, "work/mezz.mp4"), true);
  }
  clock = T0 + 31 * DAY;
  r = await e.retention.sweepOnce();
  sameMembers(r.deleted, [n.id, c.id]);
});

t("active, runner-active and DELETING projects are never touched", async () => {
  clock = T0;
  const busy = new Set();
  const e = env("active", { runner: { isActive: (id) => busy.has(id), abort: async () => false } });
  const q = await project(e, "QUEUED");
  const pr = await project(e, "PROCESSING");
  const running = await project(e, "READY");
  busy.add(running.id);
  clock = T0 + 90 * DAY;
  const r = await e.retention.sweepOnce();
  assert.deepEqual(r.deleted, []);
  assert.deepEqual(r.intermediatesPurged, []);
  for (const p of [q, pr, running]) assert.ok(has(e, p.id, "work/frames/f1.jpg"), p.status);
});

t("the original is deleted after originalDeleteAfter only when the mezzanine verifies", async () => {
  clock = T0;
  const e = env("original");
  const good = await project(e, "READY");
  const bad = await project(e, "READY");
  for (const p of [good, bad]) {
    const abs = e.store.abs(p.id, "work/mezz.mp4");
    const size = fs.statSync(abs).size;
    const partial = await fsx.partialSha(abs);
    const full = await fsx.sha256File(abs);
    await e.store.update(p.id, (d) => {
      d.stages.COMPRESSING = { status: "done", outputs: { mezz: { path: "work/mezz.mp4", size, sha256: partial, hashKind: "partial" } } };
      d.source.mezzanine = { path: "work/mezz.mp4", sha256: full, width: 320, height: 240, fps: 30 };
      d.source.originalDeleteAfter = T0 + 7 * DAY;
    });
  }
  fs.writeFileSync(e.store.abs(bad.id, "work/mezz.mp4"), Buffer.alloc(100, 9));   // damaged after it was recorded
  clock = T0 + 6 * DAY;
  let r = await e.retention.sweepOnce();
  assert.deepEqual(r.originalsDeleted, []);
  clock = T0 + 7 * DAY + HOUR;
  r = await e.retention.sweepOnce();
  assert.deepEqual(r.originalsDeleted, [good.id]);
  assert.equal(has(e, good.id, "source/original.bin"), false);
  assert.equal(e.store.get(good.id).source.originalDeletedAt, clock);
  assert.equal(has(e, bad.id, "source/original.bin"), true, "an unverified mezzanine keeps the original");
  assert.equal(e.store.get(bad.id).source.mezzanineVerifyFailedAt, clock);
  assert.ok(e.logs.some((l) => /ALERT mezzanine-unverified/.test(l)));
  r = await e.retention.sweepOnce();
  assert.deepEqual(r.originalsDeleted, []);
});

t("owner missing → deleted after 7 days, but only when the owner store can answer", async () => {
  clock = T0;
  const answers = { "owner-gone": false, "owner-unknown": null };
  const e = env("owner", { ownerExists: async (id) => answers[id] });
  const gone = await project(e, "READY", { ownerId: "owner-gone" });
  const unknown = await project(e, "READY", { ownerId: "owner-unknown" });
  let r = await e.retention.sweepOnce();
  assert.deepEqual(r.ownerMissing, [gone.id]);
  assert.equal(e.store.get(gone.id).retention.ownerMissingSince, T0);
  clock = T0 + 7 * DAY + 1;
  r = await e.retention.sweepOnce();
  assert.deepEqual(r.deleted, [gone.id]);
  assert.ok(e.store.get(unknown.id), "an unreadable owner store never deletes");
});

t("disk below the floor purges idle intermediates oldest-open first until relieved", async () => {
  clock = T0;
  const readings = [100, 5000];
  const e = env("disk", { freeDiskMb: () => (readings.length > 1 ? readings.shift() : readings[0]) });
  const older = await project(e, "READY");
  const newer = await project(e, "READY");
  await e.store.update(newer.id, (d) => { d.lastOpenedAt = T0 + HOUR; });
  clock = T0 + 2 * HOUR;
  const r = await e.retention.sweepOnce();
  assert.equal(r.diskPressure, true);
  assert.deepEqual(r.intermediatesPurged, [older.id]);
  assert.equal(has(e, older.id, "work/frames"), false);
  assert.equal(has(e, newer.id, "work/frames/f1.jpg"), true);
  assert.ok(e.logs.some((l) => /ALERT disk-low/.test(l)));
});

t("staging files older than 1 h are swept; trash entries are removed", async () => {
  clock = T0;
  const e = env("staging");
  const P = e.settings.paths;
  const mt = (f, at) => fs.utimesSync(f, at / 1000, at / 1000);
  fs.writeFileSync(path.join(P.stagingDir, "old.upload"), "x");
  mt(path.join(P.stagingDir, "old.upload"), T0 - 2 * HOUR);
  fs.writeFileSync(path.join(P.stagingDir, "fresh.upload"), "x");
  mt(path.join(P.stagingDir, "fresh.upload"), T0 - 10 * 60 * 1000);
  fs.mkdirSync(path.join(P.trashDir, `ve_${"2".repeat(16)}.1767225600000`, "work"), { recursive: true });
  fs.writeFileSync(path.join(P.trashDir, `ve_${"2".repeat(16)}.1767225600000`, "work", "a.bin"), "x");
  const r = await e.retention.sweepOnce();
  assert.equal(r.stagingSwept, 1);
  assert.equal(r.trashRemoved, 1);
  assert.equal(fs.existsSync(path.join(P.stagingDir, "old.upload")), false);
  assert.equal(fs.existsSync(path.join(P.stagingDir, "fresh.upload")), true);
  assert.deepEqual(fs.readdirSync(P.trashDir), []);
  assert.equal(sweepStaging(path.join(tmp.dir, "no-such-dir"), T0), 0);
});

// ---------------------------------------------------------------------------------------------
section("retention — deletion");

t("deleteProjectData: DELETING persisted → run aborted → streams closed → index drop → trash → removed", async () => {
  clock = T0;
  const steps = [];
  let e;
  const runner = {
    isActive: () => false,
    abort: async (id, opts) => {
      const onDisk = JSON.parse(fs.readFileSync(path.join(e.settings.paths.dir, id, "project.json"), "utf8"));
      steps.push(["abort", onDisk.status, !!e.store.get(id), opts.reason]);
      return true;
    },
  };
  e = env("delete", { runner, closeStreams: (id) => { steps.push(["close", !!e.store.get(id)]); return 2; } });
  const p = await project(e, "READY");
  const runIdBefore = e.store.get(p.id).runId;
  const r = await e.retention.deleteProjectData(p.id);
  assert.deepEqual(steps, [["abort", "DELETING", true, "DELETING"], ["close", true]]);
  assert.equal(r.deleting, true);
  assert.equal(r.aborted, true);
  assert.equal(r.streamsClosed, 2);
  assert.equal(r.dropped, true);
  assert.ok(typeof r.trashed === "string" && r.trashed.startsWith(e.settings.paths.trashDir));
  assert.equal(r.removed, true);
  assert.equal(e.store.get(p.id), null);
  assert.equal(fs.existsSync(path.join(e.settings.paths.dir, p.id)), false);
  assert.deepEqual(fs.readdirSync(e.settings.paths.trashDir), []);
  assert.ok(!(p.id in JSON.parse(fs.readFileSync(e.settings.paths.indexFile, "utf8")).projects));
  assert.equal(runIdBefore, null);
  const again = await e.retention.deleteProjectData(p.id);
  assert.equal(again.dropped, false);
  assert.equal(again.trashed, null);
});

t("deleting a project with a running pipeline aborts the run and removes everything", async () => {
  clock = Date.now();
  const settings = makeSettings(path.join(tmp.dir, "delete-live"));
  const store = createStore({ settings, log: silentLog });
  store.init();
  const queue = createQueue({ settings, getTemplateActiveCount: () => 0, pollMs: 20 });
  let started = false;
  const handler = {
    name: "VALIDATING", inputHash: () => "x", budgetMs: () => 60000,
    run: (ctx) => new Promise((_, reject) => { started = true; ctx.signal.addEventListener("abort", () => reject(ctx.signal.reason), { once: true }); }),
  };
  const runner = createRunner({ store, queue, settings, handlers: [handler], log: silentLog, abortGraceMs: 1000 });
  cleanups.push(async () => { await runner.stopAll({ timeoutMs: 1000 }); store.close(); });
  const retention = createRetention({ store, settings, runner, log: silentLog });
  const p = store.createProject({ ownerId: "owner-1", settings: {}, consent: { thirdPartyAi: true } });
  const h = await runner.enqueuePipeline(p.id);
  for (let i = 0; i < 200 && !started; i++) await sleep(10);
  assert.equal(started, true);
  const t0 = Date.now();
  const r = await retention.deleteProjectData(p.id);
  assert.ok(Date.now() - t0 < 3000, `delete took ${Date.now() - t0}ms`);
  assert.equal(r.aborted, true);
  assert.equal(r.removed, true);
  assert.equal(runner.isActive(p.id), false);
  assert.equal((await h.done).aborted, true);
  assert.equal(store.get(p.id), null);
  assert.equal(fs.existsSync(path.join(settings.paths.dir, p.id)), false);
});

t("a project directory that cannot be moved yet is retried by the next sweep", async () => {
  clock = T0;
  const e = env("locked");
  const p = await project(e, "READY");
  const lockedFile = path.join(e.settings.paths.dir, p.id, "work", "locked.bin");
  const fd = fs.openSync(lockedFile, "w");
  let r;
  try { r = await e.retention.deleteProjectData(p.id); }
  finally { if (!(r && r.trashed)) fs.closeSync(fd); }
  if (r.trashed) {
    // This platform renames directories with open handles inside; nothing to retry.
    fs.closeSync(fd);
    assert.ok(!WIN || r.trashed, "rename succeeded");
    return;
  }
  assert.deepEqual(e.retention.pendingMoves(), [p.id]);
  assert.equal(e.store.get(p.id), null, "already gone from the index");
  assert.ok(fs.existsSync(path.join(e.settings.paths.dir, p.id)));
  const s = await e.retention.sweepOnce();
  assert.deepEqual(s.deleted, [p.id]);
  assert.equal(fs.existsSync(path.join(e.settings.paths.dir, p.id)), false);
});

t("startRetention sweeps on an unref'd timer; stop() clears it", async () => {
  clock = T0;
  const settings = makeSettings(path.join(tmp.dir, "started"));
  const store = createStore({ settings, now: () => clock, log: silentLog });
  store.init();
  cleanups.push(async () => store.close());
  const old = path.join(settings.paths.stagingDir, "old.upload");
  fs.writeFileSync(old, "x");
  fs.utimesSync(old, (T0 - 2 * HOUR) / 1000, (T0 - 2 * HOUR) / 1000);
  const stop = startRetention({ store, settings, now: () => clock, intervalMs: 60000, initialDelayMs: 10, log: silentLog });
  assert.equal(typeof stop.sweepOnce, "function");
  assert.equal(typeof stop.deleteProjectData, "function");
  for (let i = 0; i < 100 && fs.existsSync(old); i++) await sleep(20);
  stop();
  assert.equal(fs.existsSync(old), false, "the first sweep ran");
});

run().finally(async () => {
  for (const fn of cleanups) { try { await fn(); } catch { /* noop */ } }
  await sleep(50);
  restoreFetch();
  tmp.cleanup();
});
