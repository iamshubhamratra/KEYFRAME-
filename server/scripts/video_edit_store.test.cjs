// Unit tests for video_edit/store.js (+ the fsx primitives it rests on).
// Run: node scripts/video_edit_store.test.cjs
//
// Load-bearing: status changes follow the TRANSITIONS table (with actor guards); project.json is
// only ever replaced atomically and a torn file falls back to .bak, then to a STORE_CORRUPT stub
// that never deletes evidence; the index is a rebuildable cache; a stale runId can never write;
// every mutation of one project is serialized; revisions are immutable and hash-verified; and no
// relative path can escape a project directory.

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { createHarness, mkTmp, makeSettings, installFetchTripwire } = require("./lib/video_edit_test_utils.cjs");
const { createStore, canTransition, TRANSITIONS, STATUSES, ACTIVE_STATUSES, STAGES } = require("../src/video_edit/store");
const fsx = require("../src/video_edit/fsx");
const { isEditError } = require("../src/video_edit/errors");

const { t, section, run } = createHarness();
const restoreFetch = installFetchTripwire();
const tmp = mkTmp("ve-store-");
const WIN = process.platform === "win32";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let clock = Date.UTC(2026, 8, 14, 12, 0, 0);
const logLines = [];
const log = { info: (m) => logLines.push(m), warn: (m) => logLines.push(m), error: (m) => logLines.push(m) };
const open = [];

function freshStore(name) {
  const settings = makeSettings(path.join(tmp.dir, name));
  const store = createStore({ settings, now: () => clock, log });
  open.push(store);
  store.init();
  return { settings, store };
}
function reopen(settings) {
  const store = createStore({ settings, now: () => clock, log });
  open.push(store);
  return { store, report: store.init() };
}
const pjson = (store, id) => path.join(store.projectDir(id), "project.json");
const readDisk = (store, id) => JSON.parse(fs.readFileSync(pjson(store, id), "utf8"));

async function rejects(p, code) {
  try { await (typeof p === "function" ? p() : p); } catch (e) {
    assert.ok(isEditError(e), `expected EditError ${code}, got ${e && e.stack}`);
    assert.equal(e.code, code, `expected ${code}, got ${e.code}`);
    return e;
  }
  throw new Error(`expected ${code}`);
}
function throwsCode(fn, code) {
  try { fn(); } catch (e) { assert.ok(isEditError(e), String(e)); assert.equal(e.code, code); return e; }
  throw new Error(`expected ${code}`);
}

section("store — create & read");

t("createProject writes a QUEUED project, its dirs, and a synchronous index entry", () => {
  const { store, settings } = freshStore("create");
  const p = store.createProject({ ownerId: "u1", clientRequestId: "req-1", settings: { title: "Hello" }, consent: { thirdPartyAi: true, termsVersion: "2026-09" } });
  assert.match(p.id, /^ve_[0-9a-z]{16}$/);
  assert.equal(p.status, "QUEUED");
  assert.equal(p.mode, "AI_VIDEO_EDIT");
  assert.equal(p.title, "Hello");
  assert.equal(p.cost.capUsd, 0.5);
  assert.equal(p.consent.thirdPartyAi, true);
  assert.equal(p.createdAt, clock);
  for (const sub of ["source", "work", "analysis", "assets", "plan/revisions", "render", "qa", "logs"]) {
    assert.ok(fs.existsSync(path.join(store.projectDir(p.id), sub)), sub);
  }
  assert.equal(readDisk(store, p.id).status, "QUEUED");
  const idx = JSON.parse(fs.readFileSync(settings.paths.indexFile, "utf8"));
  assert.equal(idx.projects[p.id].status, "QUEUED");
  assert.equal(idx.projects[p.id].ownerId, "u1");
  for (const d of ["stagingDir", "trashDir", "sharedDir", "metricsDir", "runtimeDir"]) assert.ok(fs.existsSync(settings.paths[d]), d);
});

t("get returns a deep clone; unknown / malformed ids return null", () => {
  const { store } = freshStore("clone");
  const p = store.createProject({ ownerId: "u1" });
  const a = store.get(p.id);
  a.status = "READY"; a.progress.stage = "X";
  assert.equal(store.get(p.id).status, "QUEUED");
  assert.equal(store.get(p.id).progress.stage, null);
  assert.equal(store.get("ve_0000000000000000"), null);
  assert.equal(store.get("../etc"), null);
  assert.throws(() => store.createProject({}), /VALIDATION|ownerId|settings/i);
});

section("store — transitions & actors");

t("canTransition matches the TRANSITIONS table for every pair (unguarded tokens)", () => {
  for (const from of STATUSES) {
    for (const to of STATUSES) {
      const expected = TRANSITIONS[from].includes(to);
      assert.equal(canTransition(from, to, { actor: "recovery", reason: "retry" }), expected, `${from}→${to}`);
    }
  }
  assert.deepEqual(TRANSITIONS.DELETING, []);
  assert.deepEqual(TRANSITIONS.FAILED, ["DELETING"]);
});

t("guarded edges require the right actor or reason", () => {
  assert.equal(canTransition("PROCESSING", "QUEUED", { actor: "engine" }), false);
  assert.equal(canTransition("PROCESSING", "QUEUED", { actor: "user", reason: "retry" }), false);
  assert.equal(canTransition("PROCESSING", "QUEUED", { actor: "recovery" }), true);
  assert.equal(canTransition("READY", "QUEUED", { actor: "engine" }), false);
  assert.equal(canTransition("READY", "QUEUED", { actor: "user", reason: "retry" }), true);
  assert.equal(canTransition("READY", "QUEUED", { actor: "user", reason: { code: "reanalyze" } }), true);
  assert.equal(canTransition("COMPLETED", "QUEUED", { actor: "user" }), false);
  assert.equal(canTransition("PROCESSING", "READY", { actor: "engine" }), true);
});

t("setStatus walks a legal lifecycle, records reasons, and rejects illegal moves with 409", async () => {
  const { store } = freshStore("lifecycle");
  const { id } = store.createProject({ ownerId: "u1" });
  await rejects(store.setStatus(id, "READY"), "ILLEGAL_TRANSITION");
  await rejects(store.setStatus(id, "BOGUS"), "ILLEGAL_TRANSITION");
  await store.setStatus(id, "PROCESSING");
  await rejects(store.setStatus(id, "QUEUED", { actor: "engine" }), "ILLEGAL_TRANSITION");
  let p = await store.setStatus(id, "READY");
  assert.equal(p.statusReason, null);
  p = await store.setStatus(id, "QUEUED", { actor: "user", reason: "retry" });
  assert.equal(p.lastTransition.reason, "retry");
  await store.setStatus(id, "PROCESSING");
  p = await store.setStatus(id, "NEEDS_ATTENTION", { reason: { code: "STT_FAILED", message: "Transcription services unavailable", retryable: true, stage: "TRANSCRIBING", actions: ["retry", "continue_without_captions"] } });
  assert.deepEqual(p.statusReason, { code: "STT_FAILED", message: "Transcription services unavailable", retryable: true, stage: "TRANSCRIBING", actions: ["retry", "continue_without_captions"] });
  const same = await store.setStatus(id, "NEEDS_ATTENTION");
  assert.equal(same.updatedAt, p.updatedAt, "same status is a no-op");
  const e = await rejects(store.setStatus(id, "COMPLETED"), "ILLEGAL_TRANSITION");
  assert.equal(e.status, 409);
  assert.equal(readDisk(store, id).status, "NEEDS_ATTENTION", "illegal attempt changed nothing on disk");
});

t("update() cannot bypass the table or rewrite immutable fields", async () => {
  const { store } = freshStore("bypass");
  const p0 = store.createProject({ ownerId: "u1" });
  await rejects(store.update(p0.id, (d) => { d.status = "COMPLETED"; }), "ILLEGAL_TRANSITION");
  const p = await store.update(p0.id, (d) => { d.id = "ve_ffffffffffffffff"; d.ownerId = "evil"; d.createdAt = 1; d.mode = "X"; d.title = "ok"; });
  assert.equal(p.id, p0.id); assert.equal(p.ownerId, "u1"); assert.equal(p.createdAt, p0.createdAt); assert.equal(p.mode, "AI_VIDEO_EDIT");
  assert.equal(p.title, "ok");
  await rejects(store.update("ve_0000000000000000", () => {}), "NOT_FOUND");
});

section("store — atomic writes, .bak recovery, STORE_CORRUPT");

t("status changes keep a .bak of the previous version and leave no tmp files", async () => {
  const { store } = freshStore("bak");
  const { id } = store.createProject({ ownerId: "u1" });
  await store.update(id, (d) => { d.title = "no status change"; });
  assert.ok(!fs.existsSync(`${pjson(store, id)}.bak`), "plain updates do not rotate .bak");
  await store.setStatus(id, "PROCESSING");
  const bak = JSON.parse(fs.readFileSync(`${pjson(store, id)}.bak`, "utf8"));
  assert.equal(bak.status, "QUEUED");
  assert.equal(readDisk(store, id).status, "PROCESSING");
  const leftovers = fs.readdirSync(store.projectDir(id)).filter((f) => f.endsWith(".tmp"));
  assert.deepEqual(leftovers, []);
});

t("writeJsonAtomic never clobbers an existing tmp name and readJsonSafe reports its source", () => {
  const dir = path.join(tmp.dir, "fsx-atomic");
  fsx.ensureDir(dir);
  const file = path.join(dir, "x.json");
  fsx.writeJsonAtomic(file, { v: 1 });
  fsx.writeJsonAtomic(file, { v: 2 }, { backup: true });
  assert.deepEqual(fsx.readJsonSafe(file), { ok: true, value: { v: 2 }, from: "primary", error: null });
  fs.writeFileSync(file, "{torn");
  assert.deepEqual(fsx.readJsonSafe(file), { ok: true, value: { v: 1 }, from: "backup", error: null });
  fs.writeFileSync(`${file}.bak`, "");
  assert.equal(fsx.readJsonSafe(file).error, "CORRUPT");
  assert.equal(fsx.readJsonSafe(path.join(dir, "missing.json")).error, "ENOENT");
});

t("a torn project.json is restored from .bak at load (corrupt copy kept)", async () => {
  const { store, settings } = freshStore("restore");
  const { id } = store.createProject({ ownerId: "u1" });
  await store.setStatus(id, "PROCESSING");          // .bak = QUEUED version
  store.close();
  fs.writeFileSync(pjson(store, id), '{"schemaVersion":1,"id":"ve_');
  const { store: s2 } = reopen(settings);
  const p = s2.get(id);
  assert.equal(p.status, "QUEUED", "served from .bak");
  assert.equal(readDisk(s2, id).status, "QUEUED", "primary repaired");
  assert.ok(fs.readdirSync(s2.projectDir(id)).some((f) => f.startsWith("project.json.corrupt-")), "evidence kept");
  assert.ok(logLines.some((l) => /restored from backup/.test(l) && l.includes(id)));
});

t("both copies unreadable → NEEDS_ATTENTION STORE_CORRUPT stub; files untouched; only delete allowed", async () => {
  const { store, settings } = freshStore("corrupt");
  const { id } = store.createProject({ ownerId: "owner-7", clientRequestId: "abc" });
  await store.setStatus(id, "PROCESSING");
  store.close();
  fs.writeFileSync(pjson(store, id), "garbage-primary");
  fs.writeFileSync(`${pjson(store, id)}.bak`, "garbage-backup");
  const { store: s2, report } = reopen(settings);
  assert.deepEqual(report.corrupt, [id]);
  const p = s2.get(id);
  assert.equal(p.status, "NEEDS_ATTENTION");
  assert.equal(p.statusReason.code, "STORE_CORRUPT");
  assert.equal(p.ownerId, "owner-7", "owner recovered from the index hint so the owner can still see and delete it");
  assert.equal(s2.list({ ownerId: "owner-7" }).projects.length, 1);
  assert.equal(fs.readFileSync(pjson(s2, id), "utf8"), "garbage-primary", "never overwritten at load");
  await rejects(s2.update(id, (d) => { d.title = "x"; }), "STORE_CORRUPT");
  await rejects(s2.setStatus(id, "QUEUED", { actor: "recovery" }), "STORE_CORRUPT");
  const del = await s2.beginDelete(id);
  assert.equal(del.status, "DELETING");
  const files = fs.readdirSync(s2.projectDir(id));
  assert.ok(files.some((f) => /^project\.json\.corrupt-/.test(f)) && files.some((f) => /^project\.json\.bak\.corrupt-/.test(f)), files.join(","));
  const kept = files.find((f) => /^project\.json\.corrupt-/.test(f));
  assert.equal(fs.readFileSync(path.join(s2.projectDir(id), kept), "utf8"), "garbage-primary");
});

t("a failed write keeps the change in memory, logs ALERT store-write, and flush() persists it later", async () => {
  const { store } = freshStore("writefail");
  const { id } = store.createProject({ ownerId: "u1" });
  const file = pjson(store, id);
  fs.rmSync(file);
  fs.mkdirSync(file);                               // obstacle: rename onto a directory fails
  const before = logLines.length;
  const p = await store.update(id, (d) => { d.title = "kept in memory"; });
  assert.equal(p.title, "kept in memory");
  assert.equal(store.get(id).title, "kept in memory");
  assert.ok(logLines.slice(before).some((l) => l.includes("ALERT store-write") && l.includes(id)));
  fs.rmdirSync(file);
  store.flush();
  assert.equal(readDisk(store, id).title, "kept in memory");
});

section("store — index cache");

t("index missing, corrupt, or mismatched → rebuilt from project dirs (tmp-only and foreign dirs ignored)", () => {
  const { store, settings } = freshStore("rebuild");
  const a = store.createProject({ ownerId: "u1" });
  clock += 1000;
  const b = store.createProject({ ownerId: "u2" });
  store.close();

  fs.rmSync(settings.paths.indexFile);
  let r = reopen(settings);
  assert.equal(r.report.rebuilt, true);
  assert.equal(r.store.list({}).projects.length, 2);
  r.store.close();

  fs.writeFileSync(settings.paths.indexFile, "{");
  r = reopen(settings);
  assert.equal(r.report.rebuilt, true);
  assert.deepEqual(r.store.list({}).projects.map((p) => p.id).sort(), [a.id, b.id].sort());
  r.store.close();

  const idx = JSON.parse(fs.readFileSync(settings.paths.indexFile, "utf8"));
  idx.projects.ve_zzzzzzzzzzzzzzzz = { id: "ve_zzzzzzzzzzzzzzzz", status: "QUEUED", ownerId: "ghost" };
  fs.writeFileSync(settings.paths.indexFile, JSON.stringify(idx));
  const orphan = path.join(settings.paths.dir, "ve_yyyyyyyyyyyyyyyy");
  fs.mkdirSync(orphan, { recursive: true });
  fs.writeFileSync(path.join(orphan, "project.json.123.9.tmp"), "{}");
  fs.mkdirSync(path.join(settings.paths.dir, "not_a_project"), { recursive: true });
  r = reopen(settings);
  assert.equal(r.report.rebuilt, true);
  assert.equal(r.store.get("ve_zzzzzzzzzzzzzzzz"), null, "ghost dropped");
  assert.equal(r.store.get("ve_yyyyyyyyyyyyyyyy"), null, "tmp-only dir is not a project");
  const onDisk = JSON.parse(fs.readFileSync(settings.paths.indexFile, "utf8"));
  assert.deepEqual(Object.keys(onDisk.projects).sort(), [a.id, b.id].sort());
  r.store.close();

  const clean = reopen(settings);
  assert.equal(clean.report.rebuilt, false, "a consistent index is trusted");
});

t("status mismatch between index and project.json is repaired; dev-watch reading stays exact", async () => {
  const { store, settings } = freshStore("devwatch");
  const { id } = store.createProject({ ownerId: "u1" });
  await store.setStatus(id, "PROCESSING");
  const devWatchCount = () => Object.values(JSON.parse(fs.readFileSync(settings.paths.indexFile, "utf8")).projects || {})
    .filter((p) => p && new Set(ACTIVE_STATUSES).has(p.status)).length;
  assert.equal(devWatchCount(), 1, "index flushed synchronously on entering an active status");
  await store.setStatus(id, "READY");
  assert.equal(devWatchCount(), 0, "…and on leaving it");
  store.close();
  const idx = JSON.parse(fs.readFileSync(settings.paths.indexFile, "utf8"));
  idx.projects[id].status = "RENDERING";
  fs.writeFileSync(settings.paths.indexFile, JSON.stringify(idx));
  const r = reopen(settings);
  assert.equal(r.report.rebuilt, true);
  assert.equal(devWatchCount(), 0);
  assert.equal(r.store.activeCount(), 0);
});

section("store — list, owner filter, cursor, idempotency");

t("list is owner-scoped, newest first, cursor-paged without gaps or duplicates", async () => {
  const { store } = freshStore("list");
  const mine = [];
  for (let i = 0; i < 5; i++) { clock += 1000; mine.push(store.createProject({ ownerId: "A" }).id); }
  const tie = store.createProject({ ownerId: "A" }).id;         // same createdAt as the previous one
  mine.push(tie);
  for (let i = 0; i < 2; i++) { clock += 1000; store.createProject({ ownerId: "B" }); }

  const seen = [];
  let cursor = null;
  let pages = 0;
  do {
    const page = store.list({ ownerId: "A", limit: 2, cursor });
    for (const p of page.projects) { assert.equal(p.ownerId, "A"); seen.push(p); }
    cursor = page.nextCursor;
    pages++;
  } while (cursor && pages < 10);
  assert.equal(seen.length, 6);
  assert.equal(new Set(seen.map((p) => p.id)).size, 6, "no duplicates across pages");
  for (let i = 1; i < seen.length; i++) assert.ok(seen[i - 1].createdAt >= seen[i].createdAt, "newest first");
  assert.deepEqual(seen.map((p) => p.id).sort(), mine.sort());
  assert.equal(store.list({ ownerId: "B" }).projects.length, 2);
  assert.equal(store.list({ ownerId: "nobody" }).projects.length, 0);
  assert.equal(store.list({ ownerId: "A", limit: 500 }).projects.length, 6, "limit capped at 50 but all 6 fit");

  await store.setStatus(mine[0], "PROCESSING");
  assert.deepEqual(store.list({ ownerId: "A", status: "PROCESSING" }).projects.map((p) => p.id), [mine[0]]);
  assert.equal(store.list({ ownerId: "A", status: ["PROCESSING", "QUEUED"] }).projects.length, 6);
  await store.beginDelete(mine[1]);
  assert.equal(store.list({ ownerId: "A" }).projects.length, 5, "DELETING is never listed");
  throwsCode(() => store.list({ ownerId: "A", cursor: "not-a-cursor" }), "VALIDATION_FAILED");
});

t("findByClientRequestId: same owner within 24 h only, never a deleting project", async () => {
  const { store } = freshStore("idem");
  const p = store.createProject({ ownerId: "A", clientRequestId: "req_1" });
  assert.equal(store.findByClientRequestId("A", "req_1").id, p.id);
  assert.equal(store.findByClientRequestId("B", "req_1"), null, "other owner");
  assert.equal(store.findByClientRequestId("A", "req_2"), null);
  assert.equal(store.findByClientRequestId("A", null), null);
  clock += 25 * 60 * 60 * 1000;
  assert.equal(store.findByClientRequestId("A", "req_1"), null, "older than 24 h");
  assert.equal(store.findByClientRequestId("A", "req_1", 48 * 60 * 60 * 1000).id, p.id);
  await store.beginDelete(p.id);
  assert.equal(store.findByClientRequestId("A", "req_1", 48 * 60 * 60 * 1000), null);
  assert.throws(() => store.createProject({ ownerId: "A", clientRequestId: "bad id!" }));
});

section("store — runId fencing & mutex");

t("a stale runId is rejected with STALE_RUN on every mutation path", async () => {
  const { store } = freshStore("fence");
  const { id } = store.createProject({ ownerId: "u1" });
  await store.update(id, (d) => { d.runId = "run_aaaaaaaa"; });
  await rejects(store.update(id, (d) => { d.title = "late"; }, { runId: "run_bbbbbbbb" }), "STALE_RUN");
  await rejects(store.setStatus(id, "PROCESSING", { runId: "run_bbbbbbbb" }), "STALE_RUN");
  await rejects(store.setStage(id, "VALIDATING", { status: "done" }, { runId: "run_bbbbbbbb" }), "STALE_RUN");
  await rejects(store.saveRevision(id, { a: 1 }, { runId: "run_bbbbbbbb" }), "STALE_RUN");
  await rejects(store.addNotice(id, { code: "X" }, { runId: "run_bbbbbbbb" }), "STALE_RUN");
  assert.equal(store.get(id).title, null);
  const ok = await store.setStatus(id, "PROCESSING", { runId: "run_aaaaaaaa" });
  assert.equal(ok.status, "PROCESSING");
  // A run replaced while the stale writer was waiting for the lock is still fenced.
  const slow = store.withLock(id, async () => { await sleep(50); await store.update(id, (d) => { d.runId = "run_cccccccc"; }); });
  const late = store.update(id, (d) => { d.title = "stale"; }, { runId: "run_aaaaaaaa" });
  await slow;
  await rejects(late, "STALE_RUN");
  assert.equal(store.get(id).title, null);
});

t("concurrent mutations of one project are serialized (no lost updates, no overlap)", async () => {
  const { store } = freshStore("mutex");
  const { id } = store.createProject({ ownerId: "u1" });
  await store.update(id, (d) => { d.discoveries = { n: 0 }; });
  let inside = 0;
  let maxInside = 0;
  const order = [];
  await Promise.all(Array.from({ length: 20 }, (_, i) => store.update(id, async (d) => {
    inside++; maxInside = Math.max(maxInside, inside);
    order.push(i);
    await sleep(Math.floor(Math.random() * 5));
    d.discoveries.n += 1;
    inside--;
  })));
  assert.equal(store.get(id).discoveries.n, 20);
  assert.equal(maxInside, 1);
  assert.deepEqual(order, Array.from({ length: 20 }, (_, i) => i), "FIFO");
  assert.equal(readDisk(store, id).discoveries.n, 20);
});

t("withLock is re-entrant, and a lock on one project never blocks another", async () => {
  const { store } = freshStore("reentrant");
  const a = store.createProject({ ownerId: "u1" }).id;
  const b = store.createProject({ ownerId: "u1" }).id;
  const nested = store.withLock(a, async () => store.update(a, (d) => { d.title = "nested"; }));
  const timeout = sleep(2000).then(() => "deadlock");
  assert.notEqual(await Promise.race([nested, timeout]), "deadlock");
  assert.equal(store.get(a).title, "nested");

  const events = [];
  const longA = store.withLock(a, async () => { await sleep(200); events.push("A done"); });
  await sleep(10);
  await store.update(b, (d) => { d.title = "B"; });
  events.push("B done");
  await longA;
  assert.deepEqual(events, ["B done", "A done"]);
});

t("progress lives in memory, is flushed ≤1/s, and survives a concurrent update", async () => {
  const { store } = freshStore("progress");
  const { id } = store.createProject({ ownerId: "u1" });
  const pending = store.update(id, async (d) => { await sleep(30); d.title = "during"; });
  store.setProgress(id, { stage: "TRANSCRIBING", stagePct: 42, overallPct: 31, message: "x".repeat(500), bogus: 1 });
  await pending;
  const p = store.get(id);
  assert.equal(p.progress.stage, "TRANSCRIBING", "update did not clobber in-flight progress");
  assert.equal(p.progress.message.length, 200);
  assert.equal(p.progress.bogus, undefined);
  store.setProgress(id, { stagePct: 50 });
  assert.notEqual(readDisk(store, id).progress.stagePct, 50, "not written synchronously");
  await sleep(1200);
  assert.equal(readDisk(store, id).progress.stagePct, 50, "flushed within ~1 s");
  store.setProgress(id, { stagePct: 60 });
  store.flush();
  assert.equal(readDisk(store, id).progress.stagePct, 60);
  assert.equal(store.setProgress("ve_0000000000000000", { stagePct: 1 }), null);
});

section("store — revisions");

t("saveRevision writes immutable, hash-addressed revisions and moves the head in project.json", async () => {
  const { store } = freshStore("revisions");
  const { id } = store.createProject({ ownerId: "u1" });
  const plan1 = { schema: "kf.edit_plan", cuts: [{ id: "cut_1", srcIn: 1.2 }], b: 2, a: 1 };
  const r1 = await store.saveRevision(id, plan1, { author: "director", summary: "first", opsCount: 0 });
  assert.deepEqual(r1, { rev: 1, hash: fsx.sha256Json(plan1) });
  assert.equal(fsx.sha256Json({ a: 1, b: 2, cuts: [{ srcIn: 1.2, id: "cut_1" }], schema: "kf.edit_plan" }), r1.hash, "canonical: key order irrelevant");
  assert.ok(fs.existsSync(path.join(store.projectDir(id), "plan", "revisions", "r000001.json")));
  const plan2 = { ...plan1, cuts: [] };
  const r2 = await store.saveRevision(id, plan2, { author: "user", opsCount: 1 });
  assert.equal(r2.rev, 2);
  const p = store.get(id);
  assert.equal(p.plan.headRevision, 2);
  assert.equal(p.plan.headHash, r2.hash);
  assert.deepEqual(p.plan.revisions.map((r) => [r.rev, r.parent, r.author]), [[1, null, "director"], [2, 1, "user"]]);
  assert.equal(JSON.parse(fs.readFileSync(`${pjson(store, id)}.bak`, "utf8")).plan.headRevision, 1, ".bak on head move");

  const loaded = store.loadRevision(id, 1);
  assert.deepEqual(loaded.plan, plan1);
  loaded.plan.cuts.push("mutated");
  assert.deepEqual(store.loadRevision(id, 1).plan, plan1, "loaded copies are independent");
  assert.equal(store.loadRevision(id, 99), null);
  plan1.cuts.push("caller mutation after save");
  assert.equal(store.loadRevision(id, 1).hash, r1.hash, "saved revision unaffected by later caller mutation");

  const file = path.join(store.projectDir(id), "plan", "revisions", "r000002.json");
  const doc = JSON.parse(fs.readFileSync(file, "utf8"));
  doc.plan.cuts = [{ id: "tampered" }];
  fs.writeFileSync(file, JSON.stringify(doc));
  throwsCode(() => store.loadRevision(id, 2), "REVISION_CORRUPT");
});

section("store — attachSource, stages, notices, errors, counters, deletion");

t("attachSource moves the staged upload in, writes probe.json without tags, sanitizes the name", async () => {
  const { store, settings } = freshStore("attach");
  const { id } = store.createProject({ ownerId: "u1" });
  const staged = path.join(settings.paths.stagingDir, "abc.upload");
  fs.writeFileSync(staged, Buffer.alloc(4096, 7));
  const probe = { durationSec: 12.5, video: { codec: "h264", width: 1920, height: 1080, tags: { location: "+37.7/-122.4" } }, audio: { codec: "aac", channels: 2, sampleRate: 48000 }, ignoredStreams: [{ type: "data", codec: "tmcd" }], tags: { title: "secret" } };
  const p = await store.attachSource(id, { stagedPath: staged, sha256: "f".repeat(64), sizeBytes: 4096, demuxer: "mov", probe, displayName: "C:\\Users\\me\\Videos\\my\u202Eclip\u0007 final.mp4" });
  assert.ok(!fs.existsSync(staged));
  const original = path.join(store.projectDir(id), "source", "original.bin");
  assert.equal(fs.statSync(original).size, 4096);
  const probeDisk = fs.readFileSync(path.join(store.projectDir(id), "source", "probe.json"), "utf8");
  assert.ok(!probeDisk.includes("tags") && !probeDisk.includes("secret") && !probeDisk.includes("37.7"));
  assert.equal(p.source.displayName, "myclip final.mp4");
  assert.equal(p.source.durationSec, 12.5);
  assert.equal(p.source.video.codec, "h264");
  assert.equal(p.source.demuxer, "mov");
  assert.equal(p.storage.bytes, 4096);
  assert.equal(store.userStorageBytes("u1"), 4096);
  await rejects(store.attachSource(id, { stagedPath: path.join(settings.paths.stagingDir, "gone.upload") }), "SOURCE_MISSING");
});

t("setStage fills defaults; addNotice dedupes; addError is a ring of 20; setDiscoveries merges", async () => {
  const { store } = freshStore("records");
  const { id } = store.createProject({ ownerId: "u1" });
  let p = await store.setStage(id, "VALIDATING", { status: "running", attempts: 1 });
  assert.equal(p.stages.VALIDATING.status, "running");
  assert.deepEqual(p.stages.VALIDATING.outputs, {});
  assert.equal(p.stages.VALIDATING.stageVersion, 1);
  p = await store.setStage(id, "VALIDATING", { status: "done" });
  assert.equal(p.stages.VALIDATING.attempts, 1, "patches merge");
  await rejects(store.setStage(id, "bad name", {}), "VALIDATION_FAILED");
  assert.ok(STAGES.includes("VALIDATING"));

  await store.addNotice(id, { code: "TIMING_APPROX", severity: "warn", stage: "TRANSCRIBING", message: "a" });
  p = await store.addNotice(id, { code: "TIMING_APPROX", severity: "warn", stage: "TRANSCRIBING", message: "b" });
  assert.equal(p.notices.length, 1);
  assert.equal(p.notices[0].message, "b");

  const { EditError } = require("../src/video_edit/errors");
  for (let i = 0; i < 25; i++) await store.addError(id, new EditError(`E_${i}`, { errorClass: "provider", stage: "TRANSCRIBING", detail: "x".repeat(900) }));
  p = await store.addError(id, new Error("plain failure"));
  assert.equal(p.errors.length, 20);
  assert.equal(p.errors[0].code, "E_6");
  assert.equal(p.errors[19].code, "INTERNAL");
  assert.equal(p.errors[18].detail.length, 500);
  assert.equal(p.errors[18].class, "provider");

  await store.setDiscoveries(id, { language: "en" });
  p = await store.setDiscoveries(id, { words: 120 });
  assert.deepEqual(p.discoveries, { language: "en", words: 120 });
});

t("counters: active, per-user running/queued, creates-per-day survives deletion", async () => {
  const { store } = freshStore("counters");
  const start = clock;
  const a = store.createProject({ ownerId: "A" }).id;
  const b = store.createProject({ ownerId: "A" }).id;
  store.createProject({ ownerId: "B" });
  await store.setStatus(a, "PROCESSING");
  assert.equal(store.activeCount(), 3);
  assert.deepEqual(store.userActiveCounts("A"), { running: 1, queued: 1 });
  assert.deepEqual(store.userActiveCounts("B"), { running: 0, queued: 1 });
  assert.equal(store.countCreatesSince({ ownerId: "A", sinceMs: start }), 2);
  assert.equal(store.countCreatesSince({ sinceMs: start }), 3);
  await store.beginDelete(b);
  store.dropFromIndex(b);
  assert.equal(store.countCreatesSince({ ownerId: "A", sinceMs: start }), 2, "deleting does not refund the daily quota");
  assert.equal(store.get(b), null);
  assert.equal(store.countCreatesSince({ ownerId: "A", sinceMs: clock + 1 }), 0);
});

t("beginDelete → dropFromIndex → purge removes the project everywhere", async () => {
  const { store, settings } = freshStore("delete");
  const { id } = store.createProject({ ownerId: "u1" });
  await store.setStatus(id, "PROCESSING");
  const p = await store.beginDelete(id);
  assert.equal(p.status, "DELETING");
  let idx = JSON.parse(fs.readFileSync(settings.paths.indexFile, "utf8"));
  assert.equal(idx.projects[id].status, "DELETING");
  await rejects(store.setStatus(id, "QUEUED", { actor: "recovery" }), "ILLEGAL_TRANSITION");
  const res = await store.purge(id);
  assert.equal(res.removed, true);
  assert.ok(!fs.existsSync(path.join(settings.paths.dir, id)));
  idx = JSON.parse(fs.readFileSync(settings.paths.indexFile, "utf8"));
  assert.equal(idx.projects[id], undefined);
  assert.equal(store.get(id), null);
  assert.equal(fs.readdirSync(settings.paths.trashDir).length, 0);
});

section("fsx — resolveInside");

t("rejects '..', absolute, drive-relative, UNC and NUL; accepts nested relative paths", () => {
  const root = fsx.ensureDir(path.join(tmp.dir, "contain", "ve_root"));
  for (const bad of ["..", "../x", "a/../../x", "a\\..\\..\\x", "..\\ve_other", "a/..", "/etc/passwd", "\\Windows", "C:\\Windows\\win.ini", "c:foo", "\\\\server\\share\\x", "a\0b", "", "."]) {
    throwsCode(() => fsx.resolveInside(root, bad), "PATH_ESCAPE");
  }
  const ok = fsx.resolveInside(root, "work/chunks/c1.wav");
  assert.equal(ok, path.join(root, "work", "chunks", "c1.wav"));
  assert.ok(fsx.resolveInside(root, "analysis\\stt\\chunk-1.json").startsWith(root));
});

t("case-variant and sibling-prefix paths are judged by separator-bounded, platform-correct comparison", () => {
  const root = WIN ? "C:\\Edits\\ve_abc" : "/edits/ve_abc";
  assert.equal(fsx.isInsidePath(root, WIN ? "C:\\Edits\\ve_abcdef\\x" : "/edits/ve_abcdef/x"), false, "sibling sharing a string prefix");
  assert.equal(fsx.isInsidePath(root, WIN ? "C:\\Edits\\ve_abc\\x" : "/edits/ve_abc/x"), true);
  if (WIN) {
    assert.equal(fsx.isInsidePath(root, "c:\\EDITS\\VE_ABC\\work"), true, "NTFS is case-insensitive");
    assert.equal(fsx.isInsidePath(root, "c:\\EDITS\\VE_ABCD\\work"), false, "case-variant sibling prefix");
  } else {
    assert.equal(fsx.isInsidePath(root, "/EDITS/VE_ABC/work"), false, "POSIX is case-sensitive");
  }
});

t("a symlink / junction inside the project that points outside is rejected", () => {
  const base = path.join(tmp.dir, "links");
  const root = fsx.ensureDir(path.join(base, "ve_root"));
  const outside = fsx.ensureDir(path.join(base, "VE_ROOT-outside"));
  fs.writeFileSync(path.join(outside, "secret.txt"), "x");
  const link = path.join(root, "assets");
  try { fs.symlinkSync(outside, link, WIN ? "junction" : "dir"); }
  catch (e) { console.log(`       (skipped: cannot create link: ${e.code})`); return; }
  throwsCode(() => fsx.resolveInside(root, "assets/secret.txt"), "PATH_ESCAPE");
  throwsCode(() => fsx.resolveInside(root, "assets"), "PATH_ESCAPE");
  const fileLinkTarget = path.join(outside, "secret.txt");
  try {
    fs.symlinkSync(fileLinkTarget, path.join(root, "probe.json"), "file");
    throwsCode(() => fsx.resolveInside(root, "probe.json"), "PATH_ESCAPE");
  } catch (e) { if (!isEditError(e) && e.code !== "EPERM") throw e; }
});

t("store.abs and projectDir enforce containment and id shape", () => {
  const { store } = freshStore("abs");
  const { id } = store.createProject({ ownerId: "u1" });
  assert.equal(store.abs(id, "work/mezz.mp4"), path.join(store.projectDir(id), "work", "mezz.mp4"));
  throwsCode(() => store.abs(id, "../ve_0000000000000000/project.json"), "PATH_ESCAPE");
  throwsCode(() => store.projectDir("ve_../../x"), "NOT_FOUND");
  throwsCode(() => store.projectDir("VE_0000000000000000"), "NOT_FOUND");
});

run().finally(() => {
  for (const s of open) { try { s.close(); } catch { /* noop */ } }
  restoreFetch();
  tmp.cleanup();
});
