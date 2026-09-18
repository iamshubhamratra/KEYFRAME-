// Unit tests for video_edit/recovery.js (ENGINE.md §3.6).
// Run: node scripts/video_edit_recovery.test.cjs
//
// Load-bearing: after a simulated crash, a fresh store + runner see every status repaired —
// QUEUED re-enqueued, PROCESSING interrupted-then-resumed from its checkpoints (no finished stage
// re-runs), RENDERING returned to READY/COMPLETED with its render flagged, DELETING finished,
// crash loops parked as RESTART_LOOP — plus orphan dirs trashed, stale staging swept, stray
// `*.tmp.*` removed, and only genuine ffmpeg/ffprobe orphans killed. The template queue
// (jobs.json, db.takeOrphanedTasks) is never touched.

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { createHarness, mkTmp, makeSettings, installFetchTripwire, silentLog, isAlive } = require("./lib/video_edit_test_utils.cjs");

const tmp = mkTmp("ve-recovery-");
process.env.VIDEO_EDIT_DIR = path.join(tmp.dir, "_guard", "edits");
process.env.VIDEO_EDIT_INDEX = path.join(tmp.dir, "_guard", "video-edits.json");

const JOBS_JSON = path.join(__dirname, "..", "jobs.json");
const jobsMtimeBefore = fs.existsSync(JOBS_JSON) ? fs.statSync(JOBS_JSON).mtimeMs : null;

const { createStore } = require("../src/video_edit/store");
const { createQueue } = require("../src/video_edit/engine/queue");
const { createRunner } = require("../src/video_edit/engine/runner");
const { createRegistry, runStage } = require("../src/video_edit/engine/stages");
const { recover, removeTmpFiles } = require("../src/video_edit/recovery");
const proc = require("../src/video_edit/engine/proc");
const { isEditError } = require("../src/video_edit/errors");

const { t, section, run } = createHarness();
const restoreFetch = installFetchTripwire();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const HOUR_MS = 60 * 60 * 1000;
const ENDLESS = ["-re", "-f", "lavfi", "-i", "testsrc2=size=160x120:rate=15", "-f", "null", "-"];
const cleanups = [];

let seq = 0;
async function newProject(store, { settings: ps = {} } = {}) {
  const p = store.createProject({ ownerId: "owner-1", settings: ps, consent: { thirdPartyAi: true, termsVersion: "2026-09" } });
  seq++;
  const staged = path.join(store.settings.paths.stagingDir, `fixture-${seq}.upload`);
  fs.writeFileSync(staged, Buffer.alloc(2048, seq % 250));
  await store.attachSource(p.id, {
    stagedPath: staged, sha256: crypto.createHash("sha256").update(`fx-${seq}`).digest("hex"), sizeBytes: 2048, demuxer: "mov",
    probe: { durationSec: 6, video: { width: 320, height: 240, fps: 30 }, audio: { codec: "aac" } }, displayName: "clip.mp4",
  });
  return store.get(p.id);
}

function stub(name, calls, { deps, heavy = false } = {}) {
  return {
    name, version: 1, deps, heavy,
    inputHash: (ctx) => ({ up: ctx.upstream() }),
    budgetMs: () => 30000,
    async run(ctx) {
      const key = `${ctx.projectId}:${name}`;
      calls[key] = (calls[key] || 0) + 1;
      const rel = `analysis/stub_${name.toLowerCase()}.json`;
      await ctx.writeJson(rel, { stage: name, up: ctx.upstream() });
      return { outputs: { main: { path: rel } }, engine: "stub" };
    },
  };
}

async function waitFor(fn, { timeoutMs = 10000, label = "condition" } = {}) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > timeoutMs) throw new Error(`timed out waiting for ${label}`);
    await sleep(20);
  }
}

const sameMembers = (a, b, msg) => assert.deepEqual([...a].sort(), [...b].sort(), msg);
const ago = (file, ms) => { const s = (Date.now() - ms) / 1000; fs.utimesSync(file, s, s); };
const diskDoc = (store, id) => fs.readFileSync(path.join(store.projectDir(id), "project.json"), "utf8");

// ---------------------------------------------------------------------------------------------
section("recovery — status × checkpoint → action");

t("boot recovery repairs every status and resumes interrupted pipelines from their checkpoints", async () => {
  const calls = {};
  const handlers = [stub("VALIDATING", calls), stub("COMPRESSING", calls, { heavy: true })];
  const settings = makeSettings(path.join(tmp.dir, "boot"));
  const P = settings.paths;

  // ---- the previous process ----
  const s1 = createStore({ settings, log: silentLog });
  s1.init();
  const queued = await newProject(s1);

  const proc1 = await newProject(s1);
  await s1.setStatus(proc1.id, "PROCESSING");
  await runStage(createRegistry().registerStage(stub("VALIDATING", calls)), { store: s1, projectId: proc1.id, runId: null, log: silentLog });
  await s1.setStage(proc1.id, "COMPRESSING", { status: "running", startedAt: Date.now() });
  await s1.setStage(proc1.id, "TRANSCRIBING", { status: "pending", providerTasks: [{ provider: "kie", taskId: "task_abc", chunk: 0, createdAt: Date.now() }] });
  const dir1 = s1.projectDir(proc1.id);
  fs.writeFileSync(path.join(dir1, "work", "mezz.mp4.tmp.run_dead0001.mp4"), "half");
  fs.writeFileSync(path.join(dir1, "analysis", "content.json.4242.7.tmp"), "{");
  fs.writeFileSync(path.join(dir1, "work", "keep.bin"), "real");

  const proc2 = await newProject(s1);
  await s1.setStatus(proc2.id, "PROCESSING");
  await s1.update(proc2.id, (d) => { d.recovery = { count: 2, lastAt: Date.now() - 60 * 1000 }; });

  const loopCount = await newProject(s1);
  await s1.setStatus(loopCount.id, "PROCESSING");
  await s1.update(loopCount.id, (d) => { d.recovery = { count: 8, lastAt: Date.now() - HOUR_MS }; });

  const loopRecent = await newProject(s1);
  await s1.setStatus(loopRecent.id, "PROCESSING");
  await s1.update(loopRecent.id, (d) => { d.recovery = { count: 1, lastAt: Date.now() - 5000 }; });

  const rend = await newProject(s1);
  await s1.setStatus(rend.id, "PROCESSING");
  await s1.setStatus(rend.id, "RENDERING");
  await s1.update(rend.id, (d) => { d.renders = [{ id: "rd_aaaaaaaa", kind: "preview", planRev: 1, status: "running" }]; });

  const rendDone = await newProject(s1);
  await s1.setStatus(rendDone.id, "PROCESSING");
  await s1.setStatus(rendDone.id, "RENDERING");
  await s1.update(rendDone.id, (d) => {
    d.exports.currentId = "rd_bbbbbbbb";
    d.renders = [{ id: "rd_bbbbbbbb", kind: "export", planRev: 1, status: "done" }, { id: "rd_cccccccc", kind: "export", planRev: 2, status: "running" }];
  });

  const del = await newProject(s1);
  await s1.beginDelete(del.id);

  const ready = await newProject(s1);
  await s1.setStatus(ready.id, "PROCESSING");
  await s1.setStatus(ready.id, "READY");
  const failed = await newProject(s1);
  await s1.setStatus(failed.id, "PROCESSING");
  await s1.setStatus(failed.id, "FAILED", { reason: "UNDECODABLE" });
  const needs = await newProject(s1);
  await s1.setStatus(needs.id, "PROCESSING");
  await s1.setStatus(needs.id, "NEEDS_ATTENTION", { reason: { code: "STT_FAILED", retryable: true } });
  const cancelled = await newProject(s1);
  await s1.setStatus(cancelled.id, "CANCELLED");
  s1.close();
  const untouched = [ready, failed, needs, cancelled].map((p) => [p.id, diskDoc(s1, p.id)]);
  const vCallsBefore = calls[`${proc1.id}:VALIDATING`];
  assert.equal(vCallsBefore, 1);

  // ---- debris a crash leaves behind ----
  const oldOrphan = `ve_${"0".repeat(16)}`;
  const freshOrphan = `ve_${"1".repeat(16)}`;
  fs.mkdirSync(path.join(P.dir, oldOrphan, "source"), { recursive: true });
  ago(path.join(P.dir, oldOrphan, "source"), 2 * HOUR_MS);
  ago(path.join(P.dir, oldOrphan), 2 * HOUR_MS);
  fs.mkdirSync(path.join(P.dir, freshOrphan));
  fs.mkdirSync(path.join(P.dir, "notes"));
  ago(path.join(P.dir, "notes"), 2 * HOUR_MS);
  fs.writeFileSync(path.join(P.stagingDir, "old.upload"), "x");
  ago(path.join(P.stagingDir, "old.upload"), 2 * HOUR_MS);
  fs.writeFileSync(path.join(P.stagingDir, "fresh.upload"), "x");
  const pidFile = path.join(P.runtimeDir, "pids.json");
  fs.writeFileSync(pidFile, JSON.stringify({
    schemaVersion: 1, ownerPid: 1,
    pids: [{ pid: 111111, ownerPid: 1, cmd: "ffmpeg" }, { pid: 222222, ownerPid: 1, cmd: "ffmpeg" }, { pid: process.pid, ownerPid: 1 }, { pid: 333333, ownerPid: process.pid }],
  }));

  // ---- the new process ----
  const s2 = createStore({ settings, log: silentLog });
  const q2 = createQueue({ settings, getTemplateActiveCount: () => 0, pollMs: 20 });
  q2.pause();                                        // observe the repaired state before anything runs
  const runner = createRunner({ store: s2, queue: q2, settings, handlers, log: silentLog, retryBackoffMs: [5, 5] });
  cleanups.push(async () => { await runner.stopAll({ timeoutMs: 2000 }); s2.close(); });
  const probed = [];
  const killed = [];
  const report = await recover({
    store: s2, runner, settings, log: silentLog,
    isFfmpegPid: async (pid) => { probed.push(pid); return pid === 111111; },
    killPid: async (pid) => { killed.push(pid); return true; },
  });

  sameMembers(report.requeued, [queued.id, proc1.id, proc2.id], "requeued");
  sameMembers(report.interrupted, [proc1.id, proc2.id, loopCount.id, loopRecent.id, rend.id, rendDone.id], "interrupted");
  sameMembers(report.restartLoop, [loopCount.id, loopRecent.id], "restartLoop");
  assert.deepEqual(report.deletionsResumed, [del.id]);
  assert.deepEqual(report.trashed, [oldOrphan]);
  assert.deepEqual(report.pidsKilled, [111111]);
  assert.deepEqual(killed, [111111]);
  sameMembers(probed, [111111, 222222], "never probes our own pid or this process's children");
  // Only EXPORTS are re-requested; an interrupted preview is marked interrupted and the editor asks for a fresh one.
  sameMembers(report.rendersRequeued, [rendDone.id]);
  assert.equal(s2.get(rend.id).renders[0].status, "interrupted");
  assert.equal(report.stagingSwept, 1);
  assert.equal(report.tmpRemoved, 2);
  assert.equal(report.errors, 0);

  const d1 = s2.get(proc1.id);
  assert.equal(d1.status, "QUEUED");
  assert.equal(d1.lastTransition.actor, "recovery");
  assert.equal(d1.stages.VALIDATING.status, "done");
  assert.equal(d1.stages.COMPRESSING.status, "interrupted");
  assert.equal(d1.recovery.count, 1);
  assert.deepEqual(d1.stages.TRANSCRIBING.providerTasks.map((x) => x.taskId), ["task_abc"], "KIE tasks kept for re-polling");
  assert.equal(fs.existsSync(path.join(dir1, "work", "mezz.mp4.tmp.run_dead0001.mp4")), false);
  assert.equal(fs.existsSync(path.join(dir1, "analysis", "content.json.4242.7.tmp")), false);
  assert.equal(fs.existsSync(path.join(dir1, "work", "keep.bin")), true);
  assert.equal(s2.get(proc2.id).recovery.count, 3);

  for (const id of [loopCount.id, loopRecent.id]) {
    const d = s2.get(id);
    assert.equal(d.status, "NEEDS_ATTENTION");
    assert.equal(d.statusReason.code, "RESTART_LOOP");
    assert.equal(d.statusReason.retryable, true);
    assert.ok(d.statusReason.actions.includes("retry"));
  }
  const dr = s2.get(rend.id);
  assert.equal(dr.status, "READY");
  assert.equal(dr.renders[0].status, "interrupted");
  assert.equal(dr.renders[0].requeue, true);
  const dd = s2.get(rendDone.id);
  assert.equal(dd.status, "COMPLETED");
  assert.equal(dd.renders[0].status, "done");
  assert.equal(dd.renders[1].status, "interrupted");

  assert.equal(s2.get(del.id), null);
  assert.equal(fs.existsSync(path.join(P.dir, del.id)), false);
  assert.ok(!fs.readdirSync(P.trashDir).some((n) => n.startsWith(del.id)), "deleted project removed from trash too");
  assert.ok(!(del.id in JSON.parse(fs.readFileSync(P.indexFile, "utf8")).projects));

  for (const [id, before] of untouched) assert.equal(diskDoc(s2, id), before, `project ${id} must be untouched`);
  assert.equal(fs.existsSync(path.join(P.dir, oldOrphan)), false);
  assert.ok(fs.readdirSync(P.trashDir).some((n) => n.startsWith(oldOrphan)));
  assert.equal(fs.existsSync(path.join(P.dir, freshOrphan)), true, "a young orphan may still be mid-create");
  assert.equal(fs.existsSync(path.join(P.dir, "notes")), true, "non-project dirs are not ours");
  assert.equal(fs.existsSync(path.join(P.stagingDir, "old.upload")), false);
  assert.equal(fs.existsSync(path.join(P.stagingDir, "fresh.upload")), true);
  assert.deepEqual(proc.readPidRegistry(pidFile).map((x) => x.pid), [333333]);

  // ---- resume ----
  q2.start();
  await waitFor(() => [queued.id, proc1.id, proc2.id].every((id) => s2.get(id).status === "READY"), { timeoutMs: 15000, label: "resumed pipelines READY" });
  assert.equal(calls[`${proc1.id}:VALIDATING`], vCallsBefore, "a finished checkpoint is not re-run after a crash");
  assert.equal(calls[`${proc1.id}:COMPRESSING`], 1, "the interrupted stage is re-run");
  assert.equal(s2.get(proc1.id).recovery.count, 0, "a completed run clears the crash counter");
  assert.equal(s2.get(loopCount.id).status, "NEEDS_ATTENTION", "parked projects are not enqueued");
});

t("crash-loop guard: interrupted again within 25 s of the last recovery → RESTART_LOOP; later → resumed", async () => {
  const settings = makeSettings(path.join(tmp.dir, "loop"));
  const store = createStore({ settings, log: silentLog });
  store.init();
  cleanups.push(async () => store.close());
  const a = await newProject(store);
  const b = await newProject(store);
  for (const p of [a, b]) await store.setStatus(p.id, "PROCESSING");
  const t0 = Date.now();
  let r = await recover({ store, runner: null, settings, log: silentLog, now: () => t0, isFfmpegPid: async () => false });
  sameMembers(r.interrupted, [a.id, b.id]);
  assert.deepEqual(r.restartLoop, []);
  for (const p of [a, b]) {
    assert.equal(store.get(p.id).status, "QUEUED");
    assert.deepEqual(store.get(p.id).recovery, { count: 1, lastAt: t0 });
    await store.setStatus(p.id, "PROCESSING");       // …and the process died again
  }
  await store.update(b.id, (d) => { d.recovery.lastAt = t0 - 30 * 1000; });
  r = await recover({ store, runner: null, settings, log: silentLog, now: () => t0 + 5000, isFfmpegPid: async () => false });
  assert.deepEqual(r.restartLoop, [a.id]);
  assert.equal(store.get(a.id).statusReason.code, "RESTART_LOOP");
  assert.equal(store.get(b.id).status, "QUEUED");
  assert.equal(store.get(b.id).recovery.count, 2);
});

t("a QUEUED project cancelled while recovery runs is not resurrected (notRequeued, not an error)", async () => {
  const calls = {};
  const settings = makeSettings(path.join(tmp.dir, "cancel-during"));
  const store = createStore({ settings, log: silentLog });
  store.init();
  const queue = createQueue({ settings, getTemplateActiveCount: () => 0, pollMs: 20 });
  const runner = createRunner({ store, queue, settings, handlers: [stub("VALIDATING", calls)], log: silentLog, retryBackoffMs: [5, 5] });
  cleanups.push(async () => { await runner.stopAll({ timeoutMs: 2000 }); store.close(); });
  const a = await newProject(store);
  const b = await newProject(store);
  const gone = await newProject(store);
  await store.beginDelete(gone.id);
  const report = await recover({
    store, runner, settings, log: silentLog, isFfmpegPid: async () => false,
    // Resumed deletions run after QUEUED ids are collected and before they are enqueued: the user cancels here.
    deleteProject: async (id) => { assert.equal(id, gone.id); await runner.cancel(a.id); return { removed: true }; },
  });
  assert.deepEqual(report.deletionsResumed, [gone.id]);
  assert.deepEqual(report.requeued, [b.id]);
  assert.deepEqual(report.notRequeued, [a.id]);
  assert.equal(report.errors, 0);
  await waitFor(() => store.get(b.id).status === "READY", { label: "b READY" });
  await sleep(80);
  assert.equal(store.get(a.id).status, "CANCELLED");
  assert.equal(calls[`${a.id}:VALIDATING`], undefined, "the cancelled project never ran");
});

t("removeTmpFiles deletes only *.tmp / *.tmp.* files", () => {
  const dir = path.join(tmp.dir, "tmpfiles");
  fs.mkdirSync(path.join(dir, "a", "b"), { recursive: true });
  const names = ["x.mp4.tmp.run_1.mp4", "project.json.12.3.tmp", "a/b/c.json.tmp", "keep.mp4", "template.json", "a/tmp.txt", "a/b/attempt.bin"];
  for (const n of names) fs.writeFileSync(path.join(dir, n), "1");
  assert.equal(removeTmpFiles(dir), 3);
  for (const n of ["keep.mp4", "template.json", "a/tmp.txt", "a/b/attempt.bin"]) assert.ok(fs.existsSync(path.join(dir, n)), n);
});

t("recovery does nothing when the feature is disabled", async () => {
  const settings = makeSettings(path.join(tmp.dir, "disabled"), { videoEdit: { enabled: false } });
  const store = createStore({ settings, log: silentLog });
  const r = await recover({ store, runner: null, settings, log: silentLog });
  assert.equal(r.disabled, true);
  assert.equal(fs.existsSync(settings.paths.dir), false);
});

// ---------------------------------------------------------------------------------------------
section("recovery — orphaned child processes (real)");

t("the default probe kills a real orphaned ffmpeg and never a non-ffmpeg process", async () => {
  const settings = makeSettings(path.join(tmp.dir, "pids"));
  const store = createStore({ settings, log: silentLog });
  store.init();
  cleanups.push(async () => store.close());
  const side = path.join(tmp.dir, "side-pids.json");
  const nodeAc = new AbortController();
  const ff = proc.ffmpeg(ENDLESS, { pidFile: side, timeoutMs: 60000, label: "orphan-ffmpeg" }).catch((err) => err);
  const nd = proc.runProcess(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], { pidFile: side, timeoutMs: 60000, label: "orphan-node", signal: nodeAc.signal }).catch((err) => err);
  const pidOf = (label) => (proc.readPidRegistry(side).find((x) => x.label === label) || {}).pid;
  const ffPid = await waitFor(() => pidOf("orphan-ffmpeg"), { label: "ffmpeg pid", timeoutMs: 15000 });
  const ndPid = await waitFor(() => pidOf("orphan-node"), { label: "node pid", timeoutMs: 15000 });
  await sleep(400);
  assert.ok(isAlive(ffPid) && isAlive(ndPid));
  fs.writeFileSync(path.join(settings.paths.runtimeDir, "pids.json"), JSON.stringify({
    schemaVersion: 1, ownerPid: 1, pids: [{ pid: ffPid, ownerPid: 1 }, { pid: ndPid, ownerPid: 1 }],
  }));

  const t0 = Date.now();
  const report = await recover({ store, runner: null, settings, log: silentLog });
  assert.deepEqual(report.pidsKilled, [ffPid]);
  await waitFor(() => !isAlive(ffPid), { timeoutMs: 5000, label: "orphan ffmpeg death" });
  assert.ok(Date.now() - t0 < 15000);
  assert.equal(isAlive(ndPid), true, "a live non-ffmpeg process with a registered pid is never killed");
  const ffErr = await ff;
  assert.ok(isEditError(ffErr) && ffErr.code === "PROC_EXIT", `ffmpeg ended with ${ffErr && ffErr.code}`);
  nodeAc.abort();
  const ndErr = await nd;
  assert.equal(ndErr.code, "PROC_ABORTED");
  assert.deepEqual(proc.readPidRegistry(path.join(settings.paths.runtimeDir, "pids.json")), []);
});

// ---------------------------------------------------------------------------------------------
section("recovery — template queue isolation");

t("jobs.json is untouched and no engine module reaches the template queue's orphan drain", () => {
  // Code only: header comments may name the drain precisely to say it is never used.
  const src = (rel) => fs.readFileSync(path.join(__dirname, "..", "src", "video_edit", rel), "utf8")
    .split(/\r?\n/).filter((l) => !/^\s*\/\//.test(l)).join("\n");
  for (const rel of ["recovery.js", "retention.js", "engine/runner.js", "engine/stages.js", "engine/queue.js", "engine/handlers/phase2.js"]) {
    assert.ok(!/takeOrphanedTasks/.test(src(rel)), `${rel} mentions takeOrphanedTasks`);
  }
  for (const rel of ["recovery.js", "retention.js", "engine/runner.js", "engine/stages.js", "engine/handlers/phase2.js"]) {
    assert.ok(!/require\(\s*["'][./]*\/?db["']\s*\)/.test(src(rel)), `${rel} requires db.js`);
  }
  if (jobsMtimeBefore != null) assert.equal(fs.statSync(JOBS_JSON).mtimeMs, jobsMtimeBefore, "jobs.json was modified");
});

run().finally(async () => {
  for (const fn of cleanups) { try { await fn(); } catch { /* noop */ } }
  await sleep(100);
  restoreFetch();
  tmp.cleanup();
});
