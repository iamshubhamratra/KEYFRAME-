// Unit tests for cancellation in video_edit/engine/runner.js (ENGINE.md §5.5).
// Run: node scripts/video_edit_cancel.test.cjs
//
// Load-bearing: cancelling a stage that is running a real, endless ffmpeg kills the child (and its
// tree) in under 5 s, removes the stage's temp output and leaves the project CANCELLED with its
// earlier checkpoints intact; a queued job that is cancelled never runs; a run that ignores its
// abort signal is overruled at the hard deadline — status forced, runId rotated — and every write
// it attempts afterwards is rejected by the store.

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { createHarness, mkTmp, makeSettings, installFetchTripwire, silentLog, isAlive } = require("./lib/video_edit_test_utils.cjs");

const tmp = mkTmp("ve-cancel-");
process.env.VIDEO_EDIT_DIR = path.join(tmp.dir, "_guard", "edits");
process.env.VIDEO_EDIT_INDEX = path.join(tmp.dir, "_guard", "video-edits.json");

const { createStore } = require("../src/video_edit/store");
const { createEventBus } = require("../src/video_edit/events");
const { createQueue } = require("../src/video_edit/engine/queue");
const { createRunner } = require("../src/video_edit/engine/runner");
const proc = require("../src/video_edit/engine/proc");
const { isEditError } = require("../src/video_edit/errors");

const { t, section, run } = createHarness();
const restoreFetch = installFetchTripwire();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ENDLESS = ["-re", "-f", "lavfi", "-i", "testsrc2=size=320x240:rate=30", "-f", "null", "-"];
const opened = [];

function env(name, { handlers, templateActive = () => 0, runnerOpts = {} } = {}) {
  const root = path.join(tmp.dir, name);
  const settings = makeSettings(root);
  const store = createStore({ settings, log: silentLog });
  store.init();
  const captured = [];
  const bus = createEventBus({ store, settings });
  const events = { publish: (id, type, data) => { captured.push({ id, type, data }); return bus.publish(id, type, data); }, subscribe: bus.subscribe };
  const queue = createQueue({ settings, getTemplateActiveCount: () => templateActive(), pollMs: 20 });
  const runner = createRunner({ store, queue, events, settings, handlers, log: silentLog, retryBackoffMs: [5, 10], abortGraceMs: 1500, ...runnerOpts });
  const e = { root, settings, store, events, captured, queue, runner };
  opened.push(e);
  return e;
}

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

function stub(name, calls, { deps, heavy = false, body } = {}) {
  return {
    name, version: 1, deps, heavy,
    inputHash: (ctx) => ({ up: ctx.upstream() }),
    budgetMs: () => 120000,
    async run(ctx) {
      const key = `${ctx.projectId}:${name}`;
      calls[key] = (calls[key] || 0) + 1;
      calls[name] = (calls[name] || 0) + 1;
      if (body) { const r = await body(ctx, calls[key]); if (r !== undefined) return r; }
      const rel = `analysis/stub_${name.toLowerCase()}.json`;
      await ctx.writeJson(rel, { stage: name, up: ctx.upstream() });
      return { outputs: { main: { path: rel } }, engine: "stub" };
    },
  };
}

function untilAborted(signal) {
  return new Promise((_, reject) => {
    if (signal.aborted) return reject(signal.reason);
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
}

async function waitFor(fn, { timeoutMs = 10000, label = "condition" } = {}) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > timeoutMs) throw new Error(`timed out waiting for ${label}`);
    await sleep(15);
  }
}

async function rejects(p, code) {
  try { await (typeof p === "function" ? p() : p); } catch (e) {
    assert.ok(isEditError(e), `expected EditError ${code}, got ${e && e.stack}`);
    assert.equal(e.code, code, `expected ${code}, got ${e.code}`);
    return e;
  }
  throw new Error(`expected rejection with ${code}`);
}

const stageStatus = (store, id, stage) => { const r = store.get(id).stages[stage]; return r ? r.status : null; };

// ---------------------------------------------------------------------------------------------
section("cancel — running work");

t("cancelling a stage running a real endless ffmpeg kills it in < 5 s; project CANCELLED, checkpoints kept, temp removed", async () => {
  const calls = {};
  let endless = true;
  const compress = stub("COMPRESSING", calls, {
    heavy: true,
    body: async (ctx) => {
      if (!endless) return undefined;
      const tmpAbs = ctx.abs(`work/mezz.mp4.tmp.${ctx.runId}.mp4`);
      fs.mkdirSync(path.dirname(tmpAbs), { recursive: true });
      fs.writeFileSync(tmpAbs, "partial");
      try {
        await proc.ffmpeg(ENDLESS, { signal: ctx.signal, timeoutMs: 120000, pidFile: ctx.pidFile, label: `cancel-${ctx.projectId.slice(-6)}` });
      } finally {
        try { fs.unlinkSync(tmpAbs); } catch { /* already gone */ }
      }
      return undefined;
    },
  });
  const e = env("ffmpeg", { handlers: [stub("VALIDATING", calls), compress] });
  const p = await newProject(e.store);
  const h = await e.runner.enqueuePipeline(p.id);
  const pidFile = path.join(e.settings.paths.runtimeDir, "pids.json");
  const label = `cancel-${p.id.slice(-6)}`;
  const pid = await waitFor(() => (proc.readPidRegistry(pidFile).find((x) => x.label === label) || {}).pid, { label: "ffmpeg pid", timeoutMs: 15000 });
  await sleep(400);
  assert.equal(isAlive(pid), true, "ffmpeg is running");
  const tmpAbs = e.store.abs(p.id, `work/mezz.mp4.tmp.${h.runId}.mp4`);
  assert.ok(fs.existsSync(tmpAbs));

  const t0 = Date.now();
  const r = await e.runner.cancel(p.id);
  assert.deepEqual(r, { cancelled: true, forced: false, wasQueued: false });
  await waitFor(() => !isAlive(pid), { timeoutMs: 5000, label: "ffmpeg death" });
  const took = Date.now() - t0;
  assert.ok(took < 5000, `cancel → dead child took ${took}ms`);

  const doc = e.store.get(p.id);
  assert.equal(doc.status, "CANCELLED");
  assert.equal(doc.statusReason.code, "CANCELLED");
  assert.equal(doc.statusReason.retryable, true);
  assert.equal(doc.stages.VALIDATING.status, "done", "earlier checkpoint kept");
  assert.equal(doc.stages.COMPRESSING.status, "interrupted");
  assert.notEqual(doc.runId, h.runId, "runId rotated");
  assert.equal(fs.existsSync(tmpAbs), false, "stage temp output removed");
  assert.ok(!proc.readPidRegistry(pidFile).some((x) => x.pid === pid), "pid registry cleaned");
  assert.equal((await h.done).aborted, true);
  assert.equal(e.runner.isActive(p.id), false);
  assert.ok(e.captured.some((x) => x.id === p.id && x.type === "done" && x.data.status === "CANCELLED"));
  assert.ok(e.captured.some((x) => x.id === p.id && x.type === "stage" && x.data.stage === "COMPRESSING" && x.data.status === "interrupted"));

  endless = false;
  const again = await e.runner.retry(p.id, { mode: "resume" });
  assert.equal(again.fromStage, "COMPRESSING");
  assert.equal((await again.done).status, "READY");
  assert.equal(calls[`${p.id}:VALIDATING`], 1, "resume after cancel skips the kept checkpoint");
  assert.equal(calls[`${p.id}:COMPRESSING`], 2);
});

t("cancelling a stage that waits for a heavy slot releases the waiter; the handler never runs", async () => {
  const calls = {};
  const e = env("slot-wait", { handlers: [stub("VALIDATING", calls), stub("COMPRESSING", calls, { heavy: true })], templateActive: () => 1 });
  const p = await newProject(e.store);
  const h = await e.runner.enqueuePipeline(p.id);
  await waitFor(() => e.queue.heavyWaiting() === 1, { label: "heavy waiter" });
  const t0 = Date.now();
  await e.runner.cancel(p.id);
  assert.ok(Date.now() - t0 < 1500, `took ${Date.now() - t0}ms`);
  assert.equal(e.queue.heavyWaiting(), 0);
  assert.equal(calls.COMPRESSING, undefined);
  assert.equal(e.store.get(p.id).status, "CANCELLED");
  assert.equal(stageStatus(e.store, p.id, "COMPRESSING"), "interrupted");
  await h.done;
});

// ---------------------------------------------------------------------------------------------
section("cancel — queued work and fencing");

t("a queued job that is cancelled is CANCELLED at once and skipped when it reaches the front", async () => {
  const calls = {};
  const e = env("queued", { handlers: [stub("VALIDATING", calls, { body: async (ctx) => { if (ctx.project.settings.hold) await untilAborted(ctx.signal); } })] });
  const a = await newProject(e.store, { settings: { hold: true } });
  const b = await newProject(e.store);
  const ha = await e.runner.enqueuePipeline(a.id);
  await waitFor(() => stageStatus(e.store, a.id, "VALIDATING") === "running", { label: "A running" });
  const hb = await e.runner.enqueuePipeline(b.id);
  assert.equal(e.store.get(b.id).status, "QUEUED");

  const rb = await e.runner.cancel(b.id);
  assert.deepEqual(rb, { cancelled: true, forced: false, wasQueued: true });
  assert.equal(e.store.get(b.id).status, "CANCELLED");
  assert.equal(e.runner.isActive(b.id), false);

  await e.runner.cancel(a.id);
  assert.equal((await ha.done).aborted, true);
  const bRes = await hb.done;
  assert.equal(bRes.skipped, true);
  assert.equal(calls[`${b.id}:VALIDATING`], undefined, "the cancelled queued job never ran");
  const bDoc = e.store.get(b.id);
  assert.equal(bDoc.status, "CANCELLED");
  assert.deepEqual(bDoc.stages, {});
  assert.equal(e.store.get(a.id).status, "CANCELLED");
});

t("a run that ignores cancellation is overruled at the deadline and its late writes are fenced", async () => {
  const calls = {};
  const e = env("late", {
    handlers: [stub("VALIDATING", calls, { body: async (ctx) => { if (ctx.project.settings.stubborn) await sleep(1200); } })],
    runnerOpts: { cancelDeadlineMs: 300, abortGraceMs: 4000 },
  });
  const p = await newProject(e.store, { settings: { stubborn: true } });
  const h = await e.runner.enqueuePipeline(p.id);
  await waitFor(() => stageStatus(e.store, p.id, "VALIDATING") === "running", { label: "running" });

  const t0 = Date.now();
  const r = await e.runner.cancel(p.id);
  assert.equal(r.forced, true);
  assert.ok(Date.now() - t0 < 1500, `deadline took ${Date.now() - t0}ms`);
  let doc = e.store.get(p.id);
  assert.equal(doc.status, "CANCELLED");
  assert.notEqual(doc.runId, h.runId);
  assert.equal(doc.stages.VALIDATING.status, "interrupted");
  assert.equal(e.runner.isActive(p.id), false, "the project is free for a new run even though the old one is stuck");

  const res = await h.done;           // settles once the stubborn handler returns and tries to record
  assert.equal(res.aborted, true);
  doc = e.store.get(p.id);
  assert.equal(doc.status, "CANCELLED");
  assert.equal(doc.stages.VALIDATING.status, "interrupted", "the late 'done' checkpoint was rejected");
  assert.ok(e.runner.stats().fencedWrites >= 1);

  await rejects(e.store.setStage(p.id, "VALIDATING", { status: "done" }, { runId: h.runId }), "STALE_RUN");
  await rejects(e.store.update(p.id, (d) => { d.title = "late"; }, { runId: h.runId }), "STALE_RUN");
  await rejects(e.store.setStatus(p.id, "QUEUED", { runId: h.runId, actor: "retry" }), "STALE_RUN");
});

t("nothing to cancel → NOTHING_TO_CANCEL; a QUEUED project that was never enqueued is cancelled directly", async () => {
  const e = env("nothing", { handlers: [stub("VALIDATING", {})] });
  const p = await newProject(e.store);
  assert.deepEqual(await e.runner.cancel(p.id), { cancelled: true, forced: false, wasQueued: true });
  assert.equal(e.store.get(p.id).status, "CANCELLED");
  await rejects(e.runner.cancel(p.id), "NOTHING_TO_CANCEL");
  await rejects(e.runner.cancel(p.id, { target: "render" }), "NOTHING_TO_CANCEL");
  const q = await newProject(e.store);
  assert.equal((await (await e.runner.enqueuePipeline(q.id)).done).status, "READY");
  await rejects(e.runner.cancel(q.id), "NOTHING_TO_CANCEL");
});

run().finally(async () => {
  for (const e of opened) {
    try { await e.runner.stopAll({ timeoutMs: 3000 }); } catch { /* noop */ }
    try { e.store.close(); } catch { /* noop */ }
  }
  await sleep(100);
  restoreFetch();
  tmp.cleanup();
});
