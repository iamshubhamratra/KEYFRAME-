// Unit tests for video_edit/engine/runner.js and engine/queue.js.
// Run: node scripts/video_edit_runner.test.cjs
//
// Load-bearing: a pipeline claims its project with a fresh runId and walks QUEUED → PROCESSING →
// READY (with PIPELINE_PARTIAL while later phases are unregistered); independent branches run
// side by side; every error class lands on the right parked status with actions; retries resume
// from checkpoints; heavy stages wait for CPU slots shared with template renders (and run anyway,
// deprioritized, after the max wait); shutdown never rewrites statuses.

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { createHarness, mkTmp, makeSettings, installFetchTripwire, silentLog } = require("./lib/video_edit_test_utils.cjs");

const tmp = mkTmp("ve-runner-");
process.env.VIDEO_EDIT_DIR = path.join(tmp.dir, "_guard", "edits");
process.env.VIDEO_EDIT_INDEX = path.join(tmp.dir, "_guard", "video-edits.json");

const { createStore } = require("../src/video_edit/store");
const { createEventBus } = require("../src/video_edit/events");
const { createQueue } = require("../src/video_edit/engine/queue");
const { createRunner } = require("../src/video_edit/engine/runner");
const { EditError, isEditError } = require("../src/video_edit/errors");

const { t, section, run } = createHarness();
const restoreFetch = installFetchTripwire();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const opened = [];

function env(name, { handlers, templateActive = () => 0, runnerOpts = {} } = {}) {
  const root = path.join(tmp.dir, name);
  const settings = makeSettings(root);
  const store = createStore({ settings, log: silentLog });
  store.init();
  const captured = [];
  const bus = createEventBus({ store, settings });
  const events = {
    publish: (id, type, data) => { const seq = bus.publish(id, type, data); captured.push({ id, type, data, seq }); return seq; },
    subscribe: bus.subscribe,
  };
  const queue = createQueue({ settings, getTemplateActiveCount: () => templateActive(), pollMs: 20 });
  const runner = handlers ? createRunner({ store, queue, events, settings, handlers, log: silentLog, retryBackoffMs: [5, 10], abortGraceMs: 1500, ...runnerOpts }) : null;
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
    probe: { durationSec: 6, video: { width: 640, height: 360, fps: 30 }, audio: { codec: "aac" } }, displayName: "clip.mp4",
  });
  return store.get(p.id);
}

function stub(name, calls, { deps, heavy = false, body } = {}) {
  return {
    name, version: 1, deps, heavy,
    inputHash: (ctx) => ({ up: ctx.upstream() }),
    budgetMs: () => 30000,
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

// ---------------------------------------------------------------------------------------------
section("runner — outcomes");

t("happy path: QUEUED → PROCESSING → READY with PIPELINE_PARTIAL, events and progress", async () => {
  const calls = {};
  const seenStatus = [];
  let e;
  const validating = stub("VALIDATING", calls, { body: (ctx) => { seenStatus.push(e.store.get(ctx.projectId).status); } });
  e = env("happy", { handlers: [validating, stub("COMPRESSING", calls, { heavy: true })] });
  const p = await newProject(e.store);
  const h = await e.runner.enqueuePipeline(p.id);
  assert.match(h.runId, /^run_[0-9a-z]{8}$/);
  assert.equal((await e.runner.enqueuePipeline(p.id)).runId, h.runId, "enqueue is idempotent while active");
  assert.equal(e.runner.isActive(p.id), true);
  assert.deepEqual(e.runner.activeIds(), [p.id]);

  const res = await h.done;
  assert.deepEqual(res, { status: "READY", partial: true });
  assert.deepEqual(seenStatus, ["PROCESSING"]);
  const doc = e.store.get(p.id);
  assert.equal(doc.status, "READY");
  assert.equal(doc.runId, h.runId);
  assert.deepEqual([doc.lastTransition.from, doc.lastTransition.to], ["PROCESSING", "READY"]);
  assert.equal(doc.statusReason, null);
  const partial = doc.notices.find((n) => n.code === "PIPELINE_PARTIAL");
  assert.ok(partial && partial.severity === "info");
  assert.equal(doc.stages.VALIDATING.status, "done");
  assert.equal(doc.stages.COMPRESSING.status, "done");
  assert.equal(doc.progress.overallPct, 14);
  assert.equal(doc.progress.message, "Ready");
  assert.equal(doc.recovery.count, 0);
  assert.equal(e.runner.isActive(p.id), false);

  const mine = e.captured.filter((x) => x.id === p.id);
  const stageSeq = mine.filter((x) => x.type === "stage").map((x) => `${x.data.stage}:${x.data.status}`);
  assert.deepEqual(stageSeq, ["VALIDATING:running", "VALIDATING:done", "COMPRESSING:running", "COMPRESSING:done"]);
  assert.ok(mine.some((x) => x.type === "progress" && x.data.stage === "COMPRESSING"));
  assert.deepEqual(mine.filter((x) => x.type === "done").map((x) => x.data.status), ["READY"]);
  const seqs = mine.map((x) => x.seq);
  assert.ok(seqs.every((s) => Number.isInteger(s) && s > 0), "every event carries a seq");
  for (let i = 1; i < seqs.length; i++) assert.ok(seqs[i] > seqs[i - 1], "seq strictly increasing");

  const trail = fs.readFileSync(path.join(e.store.projectDir(p.id), "logs", "events.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.ok(trail.some((l) => l.type === "done" && l.status === "READY"));
  assert.ok(trail.every((l) => !("message" in l) && !("data" in l)), "the on-disk trail is sanitized");
});

t("independent branches run in parallel (ANALYZING_VIDEO beside EXTRACTING_AUDIO → TRANSCRIBING)", async () => {
  const calls = {};
  const spans = {};
  const timed = (ctx) => (async () => { spans[ctx.stage] = { start: Date.now() }; await sleep(300); spans[ctx.stage].end = Date.now(); })();
  const e = env("parallel", {
    handlers: [stub("VALIDATING", calls), stub("COMPRESSING", calls), stub("EXTRACTING_AUDIO", calls, { body: timed }),
      stub("ANALYZING_VIDEO", calls, { body: timed }), stub("TRANSCRIBING", calls)],
  });
  const p = await newProject(e.store);
  assert.equal((await (await e.runner.enqueuePipeline(p.id)).done).status, "READY");
  const a = spans.EXTRACTING_AUDIO, v = spans.ANALYZING_VIDEO;
  assert.ok(a.start < v.end && v.start < a.end, `branches did not overlap: ${JSON.stringify(spans)}`);
  assert.equal(calls.TRANSCRIBING, 1);
  const doc = e.store.get(p.id);
  assert.ok(doc.stages.TRANSCRIBING.startedAt >= doc.stages.EXTRACTING_AUDIO.finishedAt, "dependency order kept");
});

t("error classes map to parked statuses with statusReason.actions; running siblings still finish", async () => {
  const calls = {};
  const failing = stub("EXTRACTING_AUDIO", calls, {
    body: (ctx) => { const f = ctx.project.settings.failWith; throw new EditError(f.code, { errorClass: f.cls, retryable: f.cls !== "input" }); },
  });
  const slowSibling = stub("ANALYZING_VIDEO", calls, { body: () => sleep(150) });
  const e = env("classes", { handlers: [stub("VALIDATING", calls), stub("COMPRESSING", calls), failing, slowSibling, stub("TRANSCRIBING", calls)] });
  const cases = [
    ["provider", "STT_FAILED", "NEEDS_ATTENTION", ["retry", "continue_without_transcript", "delete"]],
    ["resource", "INSUFFICIENT_STORAGE", "NEEDS_ATTENTION", ["retry", "delete"]],
    ["config", "MEDIA_MODULE_MISSING", "NEEDS_ATTENTION", ["retry", "delete"]],
    ["budget", "COST_CAP_REACHED", "NEEDS_ATTENTION", ["retry", "continue_without_transcript", "delete"]],
    ["bug", "STAGE_CRASHED", "NEEDS_ATTENTION", ["retry", "delete"]],
    ["input", "UNDECODABLE", "FAILED", ["delete"]],
  ];
  for (const [cls, code, status, actions] of cases) {
    const p = await newProject(e.store, { settings: { failWith: { cls, code } } });
    const res = await (await e.runner.enqueuePipeline(p.id)).done;
    assert.equal(res.status, status, `${cls} → ${res.status}`);
    const doc = e.store.get(p.id);
    assert.equal(doc.status, status);
    assert.equal(doc.statusReason.code, code);
    assert.equal(doc.statusReason.stage, "EXTRACTING_AUDIO");
    assert.equal(doc.statusReason.retryable, cls !== "input");
    assert.deepEqual(doc.statusReason.actions, actions);
    assert.equal(doc.stages.ANALYZING_VIDEO.status, "done", "the parallel sibling finished and kept its checkpoint");
    assert.equal(calls[`${p.id}:TRANSCRIBING`], undefined, "nothing downstream of the failure started");
    assert.ok(e.captured.some((x) => x.id === p.id && x.type === "done" && x.data.status === status && x.data.code === code));
  }
});

t("exhausted transient retries park the project; retry resumes from the checkpoint", async () => {
  const calls = {};
  let flaky = true;
  const e = env("flaky", {
    handlers: [stub("VALIDATING", calls), stub("COMPRESSING", calls, { body: () => { if (flaky) throw new EditError("PROC_EXIT", { errorClass: "transient", retryable: true }); } })],
  });
  const p = await newProject(e.store);
  assert.equal((await (await e.runner.enqueuePipeline(p.id)).done).status, "NEEDS_ATTENTION");
  let doc = e.store.get(p.id);
  assert.equal(doc.statusReason.code, "PROC_EXIT");
  assert.equal(doc.stages.COMPRESSING.attempts, 3);
  flaky = false;
  const r = await e.runner.retry(p.id, { mode: "resume" });
  assert.equal(r.fromStage, "COMPRESSING");
  assert.equal((await r.done).status, "READY");
  doc = e.store.get(p.id);
  assert.equal(calls[`${p.id}:VALIDATING`], 1);
  assert.equal(calls[`${p.id}:COMPRESSING`], 4);
  assert.equal(doc.statusReason, null);
});

t("retry guards: FAILED → NOT_RETRYABLE, running → ILLEGAL_TRANSITION, bad stage/mode → VALIDATION_FAILED", async () => {
  const calls = {};
  let hold = null;
  const e = env("guards", { handlers: [stub("VALIDATING", calls, { body: async (ctx) => { if (ctx.project.settings.hold) await untilAborted(ctx.signal); } })] });
  const p = await newProject(e.store, { settings: { hold: true } });
  hold = await e.runner.enqueuePipeline(p.id);
  await waitFor(() => e.store.get(p.id).stages.VALIDATING && e.store.get(p.id).stages.VALIDATING.status === "running", { label: "running" });
  await rejects(e.runner.retry(p.id, { mode: "resume" }), "ILLEGAL_TRANSITION");
  await e.runner.cancel(p.id);
  await hold.done;
  await rejects(e.runner.retry(p.id, { mode: "sideways" }), "VALIDATION_FAILED");
  await rejects(e.runner.retry(p.id, { mode: "force", stage: "RENDERING" }), "VALIDATION_FAILED");
  await rejects(e.runner.retry(p.id, { mode: "resume", continueWithout: "everything" }), "VALIDATION_FAILED");

  const f = await newProject(e.store);
  await e.store.setStatus(f.id, "PROCESSING");
  await e.store.setStatus(f.id, "FAILED", { reason: "UNDECODABLE" });
  await rejects(e.runner.retry(f.id, { mode: "resume" }), "NOT_RETRYABLE");
  await rejects(e.runner.enqueuePipeline(f.id), "ILLEGAL_TRANSITION");

  const n = await newProject(e.store);
  await e.store.setStatus(n.id, "PROCESSING");
  await e.store.setStatus(n.id, "NEEDS_ATTENTION", { reason: { code: "STORE_CORRUPT", retryable: false } });
  await rejects(e.runner.retry(n.id, { mode: "resume" }), "NOT_RETRYABLE");
  await rejects(e.runner.retry("ve_0000000000000000", { mode: "resume" }), "NOT_FOUND");
});

t("enqueuePipeline claims only QUEUED: a cancel that landed first wins; other statuses need allowFrom", async () => {
  const calls = {};
  const e = env("claim", { handlers: [stub("VALIDATING", calls)] });
  const p = await newProject(e.store);
  const c = await e.runner.cancel(p.id);   // QUEUED with no runner entry (e.g. during boot recovery)
  assert.equal(c.wasQueued, true);
  assert.equal(e.store.get(p.id).status, "CANCELLED");
  const err = await rejects(e.runner.enqueuePipeline(p.id, { resume: true }), "ILLEGAL_TRANSITION");
  assert.equal(err.extra.from, "CANCELLED");
  await sleep(80);
  assert.equal(e.store.get(p.id).status, "CANCELLED", "the cancel is not undone");
  assert.equal(calls.VALIDATING, undefined);
  assert.equal(e.runner.isActive(p.id), false);

  const r = await newProject(e.store);
  assert.equal((await (await e.runner.enqueuePipeline(r.id)).done).status, "READY");
  await rejects(e.runner.enqueuePipeline(r.id), "ILLEGAL_TRANSITION");
  assert.equal((await (await e.runner.enqueuePipeline(r.id, { allowFrom: ["READY"] })).done).status, "READY", "an explicit allowFrom still re-queues");
  assert.equal((await (await e.runner.retry(p.id, { mode: "resume" })).done).status, "READY", "retry vets and re-queues on its own");
});

t("continueWithout is persisted on the project and handed to every stage", async () => {
  const seen = [];
  const e = env("continue", { handlers: [stub("VALIDATING", {}, { body: (ctx) => { seen.push([...ctx.continueWithout]); } })] });
  const p = await newProject(e.store);
  assert.equal((await (await e.runner.enqueuePipeline(p.id)).done).status, "READY");
  const r = await e.runner.retry(p.id, { mode: "force", continueWithout: "transcript" });
  await r.done;
  assert.deepEqual(seen, [[], ["transcript"]]);
  assert.deepEqual(e.store.get(p.id).runOptions.continueWithout, ["transcript"]);
});

t("a broken stage graph is contained as NEEDS_ATTENTION, never an unhandled rejection", async () => {
  const e = env("cycle", { handlers: [stub("VALIDATING", {}, { deps: ["COMPRESSING"] }), stub("COMPRESSING", {}, { deps: ["VALIDATING"] })] });
  const p = await newProject(e.store);
  assert.equal((await (await e.runner.enqueuePipeline(p.id)).done).status, "NEEDS_ATTENTION");
  assert.equal(e.store.get(p.id).statusReason.code, "STAGE_GRAPH_CYCLE");
});

// ---------------------------------------------------------------------------------------------
section("queue — lanes and heavy slots");

t("add() honours priority, reports position, and clear() rejects jobs that never started", async () => {
  const q = createQueue({ settings: { concurrency: 1, heavySlots: 1 }, getTemplateActiveCount: () => 0 });
  let release;
  const gate = new Promise((r) => { release = r; });
  const order = [];
  const first = q.add(async () => { order.push("first"); await gate; });
  const low = q.add(async () => { order.push("low"); }, { priority: 0, label: "low" });
  const high = q.add(async () => { order.push("high"); }, { priority: 1, label: "high" });
  await sleep(10);
  assert.equal(q.active(), 1);
  assert.equal(q.depth(), 2);
  assert.equal(q.position("high"), 1);
  assert.equal(q.position("low"), 2);
  release();
  await Promise.all([first, low, high]);
  assert.deepEqual(order, ["first", "high", "low"]);

  let release2;
  const gate2 = new Promise((r) => { release2 = r; });
  const running = q.add(() => gate2);
  const doomed = q.add(async () => "never", { label: "doomed" });
  await sleep(10);
  q.clear();
  await rejects(doomed, "QUEUE_CLEARED");
  release2();
  await running;
  assert.equal(q.depth(), 0);
});

t("heavy() waits while template renders + heavy stages fill the slots, then serves waiters FIFO", async () => {
  let templateActive = 1;
  const q = createQueue({ settings: { concurrency: 2, heavySlots: 1 }, getTemplateActiveCount: () => templateActive, pollMs: 20 });
  const waits = [];
  const ran = [];
  const a = q.heavy(async (slot) => { ran.push(["a", slot, q.heavyRunning()]); await sleep(60); }, { label: "a", onWait: (i) => waits.push(["a", i]) });
  const b = q.heavy(async (slot) => { ran.push(["b", slot, q.heavyRunning()]); }, { label: "b", onWait: (i) => waits.push(["b", i]) });
  await sleep(120);
  assert.equal(ran.length, 0, "nothing runs while the template render holds the only slot");
  assert.equal(q.heavyWaiting(), 2);
  assert.deepEqual(waits.map(([n, i]) => [n, i.templateActive, i.heavySlots, i.position]), [["a", 1, 1, 1], ["b", 1, 1, 2]]);
  templateActive = 0;
  await Promise.all([a, b]);
  assert.deepEqual(ran.map((r) => r[0]), ["a", "b"]);
  assert.equal(ran[0][1].lowPriority, false);
  assert.ok(ran[0][1].waitedMs > 0);
  assert.equal(ran[0][2], 1);
  assert.equal(q.heavyRunning(), 0);
  assert.equal(q.heavyWaiting(), 0);
});

t("heavy() runs anyway at low priority after the max wait; an aborted waiter leaves the line", async () => {
  let clock = 1e6;
  const q = createQueue({ settings: { concurrency: 1, heavySlots: 1 }, getTemplateActiveCount: () => 5, now: () => clock, heavyMaxWaitMs: 600000, pollMs: 15 });
  const ac = new AbortController();
  const doomed = q.heavy(async () => "never", { signal: ac.signal });
  let slotSeen = null;
  const forced = q.heavy(async (slot) => { slotSeen = slot; return "ran"; });
  await sleep(50);
  assert.equal(q.heavyWaiting(), 2);
  ac.abort();
  await rejects(doomed, "CANCELLED");
  assert.equal(q.heavyWaiting(), 1);
  clock += 600000;
  assert.equal(await forced, "ran");
  assert.equal(slotSeen.lowPriority, true);
  assert.equal(slotSeen.threads, 2);
  assert.ok(slotSeen.waitedMs >= 600000);
  await rejects(q.heavy(async () => 1, { signal: AbortSignal.abort() }), "CANCELLED");
});

t("a pipeline's heavy stage waits for render capacity with a fake template activeCount", async () => {
  let templateActive = 1;
  const calls = {};
  const e = env("slots", { handlers: [stub("VALIDATING", calls), stub("COMPRESSING", calls, { heavy: true })], templateActive: () => templateActive });
  const p = await newProject(e.store);
  const h = await e.runner.enqueuePipeline(p.id);
  await waitFor(() => e.queue.heavyWaiting() === 1, { label: "heavy waiter" });
  await sleep(80);
  assert.equal(calls.COMPRESSING, undefined);
  const doc = e.store.get(p.id);
  assert.equal(doc.status, "PROCESSING");
  assert.equal(doc.progress.stage, "COMPRESSING");
  assert.equal(doc.progress.message, "Waiting for render capacity");
  assert.ok(e.captured.some((x) => x.id === p.id && x.type === "progress" && x.data.message === "Waiting for render capacity"));
  templateActive = 0;
  assert.equal((await h.done).status, "READY");
  assert.equal(calls.COMPRESSING, 1);
});

t("one pipeline at a time: the second project waits with a queue position", async () => {
  const calls = {};
  let release;
  const gate = new Promise((r) => { release = r; });
  const e = env("lane", { handlers: [stub("VALIDATING", calls, { body: async (ctx) => { if (ctx.project.settings.hold) await gate; } })] });
  const a = await newProject(e.store, { settings: { hold: true } });
  const b = await newProject(e.store);
  const ha = await e.runner.enqueuePipeline(a.id);
  await waitFor(() => calls[`${a.id}:VALIDATING`] === 1, { label: "A running" });
  const hb = await e.runner.enqueuePipeline(b.id);
  const bq = e.store.get(b.id);
  assert.equal(bq.status, "QUEUED");
  assert.equal(bq.progress.queuePosition, 1);
  assert.equal(hb.queuePosition, 1);
  assert.ok(e.captured.some((x) => x.id === b.id && x.type === "progress" && x.data.queuePosition === 1));
  release();
  assert.equal((await ha.done).status, "READY");
  assert.equal((await hb.done).status, "READY");
  assert.equal(e.store.get(b.id).progress.queuePosition, null);
});

t("stopAll aborts running work without rewriting statuses and refuses new work", async () => {
  const calls = {};
  const e = env("stop", { handlers: [stub("VALIDATING", calls, { body: (ctx) => untilAborted(ctx.signal) })] });
  const a = await newProject(e.store);
  const b = await newProject(e.store);
  const c = await newProject(e.store);
  const ha = await e.runner.enqueuePipeline(a.id);
  const hb = await e.runner.enqueuePipeline(b.id);
  await waitFor(() => calls[`${a.id}:VALIDATING`] === 1, { label: "A running" });
  const r = await e.runner.stopAll({ timeoutMs: 3000 });
  assert.deepEqual(r, { stopped: 2, timedOut: false });
  assert.equal(e.store.get(a.id).status, "PROCESSING", "boot recovery resumes it");
  assert.equal(e.store.get(a.id).stages.VALIDATING.status, "interrupted");
  assert.equal(e.store.get(b.id).status, "QUEUED");
  assert.equal((await ha.done).aborted, true);
  assert.equal((await hb.done).reason, "QUEUE_CLEARED");
  assert.deepEqual(e.runner.activeIds(), []);
  await rejects(e.runner.enqueuePipeline(c.id), "EDITS_DISABLED");
});

run().finally(async () => {
  for (const e of opened) {
    try { if (e.runner) await e.runner.stopAll({ timeoutMs: 2000 }); } catch { /* noop */ }
    try { e.store.close(); } catch { /* noop */ }
  }
  await sleep(50);
  restoreFetch();
  tmp.cleanup();
});
