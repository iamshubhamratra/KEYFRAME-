// Unit tests for video_edit/engine/stages.js (checkpoint runner) and engine/handlers/phase2.js.
// Run: node scripts/video_edit_checkpoints.test.cjs
//
// Load-bearing: a stage whose inputs and outputs are unchanged is never run again (so a resume
// makes zero handler / provider calls); a forced re-run invalidates that stage and everything
// downstream of it and nothing upstream; transient errors get ≤3 attempts, everything else one;
// a budget overrun aborts the handler's signal and fails with STAGE_TIMEOUT; a stale runId can
// never record a stage; and the phase-2 handlers turn a probed, normalized source into READY.

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { createHarness, mkTmp, makeSettings, installFetchTripwire, silentLog } = require("./lib/video_edit_test_utils.cjs");

const tmp = mkTmp("ve-ckpt-");
// Any accidental getSettings() (e.g. proc.js default pid registry) must stay inside the temp dir.
process.env.VIDEO_EDIT_DIR = path.join(tmp.dir, "_guard", "edits");
process.env.VIDEO_EDIT_INDEX = path.join(tmp.dir, "_guard", "video-edits.json");

const { createStore } = require("../src/video_edit/store");
const { createEventBus } = require("../src/video_edit/events");
const { createQueue } = require("../src/video_edit/engine/queue");
const { createRunner } = require("../src/video_edit/engine/runner");
const { createRegistry, runStage, computeInputHash } = require("../src/video_edit/engine/stages");
const phase2 = require("../src/video_edit/engine/handlers/phase2");
const fsx = require("../src/video_edit/fsx");
const { EditError, isEditError } = require("../src/video_edit/errors");

const { t, section, run } = createHarness();
const restoreFetch = installFetchTripwire();
const MB = 1024 * 1024;
const DAY_MS = 24 * 60 * 60 * 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const opened = [];

function env(name, { handlers, envVars, videoEdit, now, runnerOpts = {} } = {}) {
  const root = path.join(tmp.dir, name);
  const settings = makeSettings(root, { env: envVars, videoEdit });
  assert.ok(settings.enabled, `settings disabled: ${settings.disabledReason}`);
  const store = createStore({ settings, log: silentLog });
  store.init();
  const captured = [];
  const bus = createEventBus({ store, settings });
  const events = { publish: (id, type, data) => { captured.push({ id, type, data }); return bus.publish(id, type, data); }, subscribe: bus.subscribe };
  const queue = createQueue({ settings, getTemplateActiveCount: () => 0, pollMs: 20 });
  const runner = handlers ? createRunner({ store, queue, events, settings, handlers, log: silentLog, retryBackoffMs: [5, 10], abortGraceMs: 1500, now, ...runnerOpts }) : null;
  const e = { root, settings, store, events, captured, queue, runner };
  opened.push(e);
  return e;
}

let seq = 0;
async function newProject(store, { settings: ps = {}, probe, ownerId = "owner-1", sizeBytes = 4096 } = {}) {
  const p = store.createProject({ ownerId, settings: ps, consent: { thirdPartyAi: true, termsVersion: "2026-09" } });
  seq++;
  const staged = path.join(store.settings.paths.stagingDir, `fixture-${seq}.upload`);
  fs.writeFileSync(staged, Buffer.alloc(sizeBytes, seq % 250));
  await store.attachSource(p.id, {
    stagedPath: staged, sha256: crypto.createHash("sha256").update(`fixture-${seq}`).digest("hex"), sizeBytes, demuxer: "mov",
    probe: probe || { durationSec: 4, video: { width: 320, height: 240, fps: 30 }, audio: { codec: "aac", channels: 2, sampleRate: 48000 } },
    displayName: "clip.mp4",
  });
  return store.get(p.id);
}

// A stub stage: counts calls per project, fingerprints its upstream outputs + a per-stage knob, and
// writes a JSON output that embeds both (so a changed input produces a changed output).
function stub(name, calls, { deps, heavy = false, budgetMs = 30000, body } = {}) {
  return {
    name, version: 1, deps, heavy,
    inputHash: (ctx) => ({ up: ctx.upstream(), knob: (ctx.project.settings || {})[`knob_${name}`] ?? null }),
    budgetMs: () => budgetMs,
    async run(ctx) {
      const key = `${ctx.projectId}:${name}`;
      calls[key] = (calls[key] || 0) + 1;
      calls[name] = (calls[name] || 0) + 1;
      if (body) { const r = await body(ctx, calls[key]); if (r !== undefined) return r; }
      const rel = `analysis/stub_${name.toLowerCase()}.json`;
      await ctx.writeJson(rel, { stage: name, knob: (ctx.project.settings || {})[`knob_${name}`] ?? null, up: ctx.upstream() });
      return { outputs: { main: { path: rel } }, engine: "stub" };
    },
  };
}

const ctxFor = (e, id, extra = {}) => ({
  store: e.store, events: e.events, settings: e.settings, projectId: id, runId: e.store.get(id).runId,
  log: silentLog, retryBackoffMs: [5, 5], abortGraceMs: 300, ...extra,
});

const stageEvents = (e, id, stage) => e.captured
  .filter((x) => x.id === id && x.type === "stage" && x.data.stage === stage)
  .map((x) => x.data.status + (x.data.cached ? ":cached" : ""));

function untilAborted(signal) {
  return new Promise((_, reject) => {
    if (signal.aborted) return reject(signal.reason);
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
}

async function rejects(p, code) {
  try { await (typeof p === "function" ? p() : p); } catch (e) {
    assert.ok(isEditError(e), `expected EditError ${code}, got ${e && e.stack}`);
    assert.equal(e.code, code, `expected ${code}, got ${e.code} (${e.detail})`);
    return e;
  }
  throw new Error(`expected rejection with ${code}`);
}

// ---------------------------------------------------------------------------------------------
section("checkpoints — input hashing");

t("computeInputHash is deterministic, key-order independent, and sensitive to stage, version and inputs", async () => {
  const e = env("hash");
  const p = await newProject(e.store);
  const reg = createRegistry();
  const def = (name, version, fn) => reg.registerStage({ name, version, inputHash: fn, run: async () => ({}) });
  const ctx = { project: e.store.get(p.id) };
  const h1 = await computeInputHash(def("VALIDATING", 1, (c) => ({ b: 2, a: c.project.source.sha256 })), ctx);
  assert.match(h1, /^[0-9a-f]{64}$/);
  assert.equal(await computeInputHash(def("VALIDATING", 1, (c) => ({ b: 2, a: c.project.source.sha256 })), { project: e.store.get(p.id) }), h1);
  assert.equal(await computeInputHash(def("VALIDATING", 1, (c) => ({ a: c.project.source.sha256, b: 2 })), ctx), h1, "key order must not matter");
  assert.notEqual(await computeInputHash(def("VALIDATING", 2, (c) => ({ a: c.project.source.sha256, b: 2 })), ctx), h1, "version bump");
  assert.notEqual(await computeInputHash(def("VALIDATING", 1, (c) => ({ a: c.project.source.sha256, b: 3 })), ctx), h1, "input change");
  assert.notEqual(await computeInputHash(def("COMPRESSING", 1, (c) => ({ a: c.project.source.sha256, b: 2 })), ctx), h1, "stage name");
  const bad = def("VALIDATING", 1, () => { throw new Error("boom"); });
  await rejects(computeInputHash(bad, ctx), "STAGE_INPUT_HASH_FAILED");
});

// ---------------------------------------------------------------------------------------------
section("checkpoints — run, skip, re-run");

t("runStage runs a handler, hashes its outputs and records a done checkpoint with stage events", async () => {
  const e = env("run");
  const p = await newProject(e.store);
  const calls = {};
  const def = createRegistry().registerStage(stub("VALIDATING", calls));
  const r = await runStage(def, ctxFor(e, p.id));
  assert.equal(r.status, "done");
  const rec = e.store.get(p.id).stages.VALIDATING;
  assert.equal(rec.status, "done");
  assert.equal(rec.attempts, 1);
  assert.equal(rec.engine, "stub");
  assert.match(rec.inputHash, /^[0-9a-f]{64}$/);
  const out = rec.outputs.main;
  assert.equal(out.path, "analysis/stub_validating.json");
  const abs = e.store.abs(p.id, out.path);
  assert.equal(out.size, fs.statSync(abs).size);
  assert.equal(out.sha256, await fsx.sha256File(abs));
  assert.equal(out.hashKind, "full");
  assert.ok(rec.finishedAt >= rec.startedAt);
  assert.deepEqual(stageEvents(e, p.id, "VALIDATING"), ["running", "done"]);
});

t("skip on match; a tampered, deleted or re-keyed output re-runs; force always re-runs", async () => {
  const e = env("skip");
  const p = await newProject(e.store);
  const calls = {};
  const def = createRegistry().registerStage(stub("VALIDATING", calls));
  const key = `${p.id}:VALIDATING`;
  await runStage(def, ctxFor(e, p.id));
  const again = await runStage(def, ctxFor(e, p.id));
  assert.equal(again.status, "cached");
  assert.equal(calls[key], 1);
  assert.deepEqual(stageEvents(e, p.id, "VALIDATING"), ["running", "done", "done:cached"]);

  const file = e.store.abs(p.id, "analysis/stub_validating.json");
  const buf = fs.readFileSync(file);
  buf[3] = buf[3] === 0x61 ? 0x62 : 0x61;           // same size, different bytes
  fs.writeFileSync(file, buf);
  assert.equal((await runStage(def, ctxFor(e, p.id))).status, "done");
  assert.equal(calls[key], 2);

  fs.unlinkSync(file);
  assert.equal((await runStage(def, ctxFor(e, p.id))).status, "done");
  assert.equal(calls[key], 3);

  await e.store.update(p.id, (d) => { d.settings.knob_VALIDATING = "changed"; });
  assert.equal((await runStage(def, ctxFor(e, p.id))).status, "done");
  assert.equal(calls[key], 4);
  assert.equal((await runStage(def, ctxFor(e, p.id))).status, "cached");

  assert.equal((await runStage(def, ctxFor(e, p.id, { force: true }))).status, "done");
  assert.equal(calls[key], 5);
});

t("media outputs are fingerprinted by size + first/last 1 MB (partialSha)", async () => {
  const e = env("media");
  const p = await newProject(e.store);
  const calls = {};
  const rel = "work/big.bin";
  const def = createRegistry().registerStage(stub("COMPRESSING", calls, {
    deps: [],
    body: async (ctx) => {
      const f = ctx.abs(rel);
      fs.mkdirSync(path.dirname(f), { recursive: true });
      if (!fs.existsSync(f)) fs.writeFileSync(f, Buffer.alloc(3 * MB, 7));
      return { outputs: { media: { path: rel } }, engine: "stub" };
    },
  }));
  const key = `${p.id}:COMPRESSING`;
  await runStage(def, ctxFor(e, p.id));
  const rec = e.store.get(p.id).stages.COMPRESSING.outputs.media;
  const abs = e.store.abs(p.id, rel);
  assert.equal(rec.hashKind, "partial");
  assert.equal(rec.sha256, await fsx.partialSha(abs));
  assert.equal((await runStage(def, ctxFor(e, p.id))).status, "cached");

  const poke = (offset) => { const fd = fs.openSync(abs, "r+"); fs.writeSync(fd, Buffer.from([9]), 0, 1, offset); fs.closeSync(fd); };
  poke(Math.floor(1.5 * MB));                        // middle MB: outside the fingerprint by contract
  assert.equal((await runStage(def, ctxFor(e, p.id))).status, "cached");
  poke(3 * MB - 1);                                  // last MB
  assert.equal((await runStage(def, ctxFor(e, p.id))).status, "done");
  assert.equal(calls[key], 2);
  fs.appendFileSync(abs, Buffer.from([1]));          // size change
  assert.equal((await runStage(def, ctxFor(e, p.id))).status, "done");
  assert.equal(calls[key], 3);
});

t("a stage whose skip() answers truthy is recorded as skipped without running", async () => {
  const e = env("skipfn");
  const p = await newProject(e.store);
  const calls = {};
  const def = createRegistry().registerStage({ ...stub("TRANSCRIBING", calls, { deps: [] }), skip: () => "continue_without_transcript" });
  const r = await runStage(def, ctxFor(e, p.id));
  assert.equal(r.status, "skipped");
  assert.equal(calls.TRANSCRIBING, undefined);
  const rec = e.store.get(p.id).stages.TRANSCRIBING;
  assert.equal(rec.status, "skipped");
  assert.deepEqual(rec.fallbacks, ["continue_without_transcript"]);
});

t("force re-run invalidates that stage and everything downstream only; resume re-runs nothing", async () => {
  const calls = {};
  const e = env("force", { handlers: [stub("VALIDATING", calls), stub("COMPRESSING", calls), stub("EXTRACTING_AUDIO", calls), stub("ANALYZING_VIDEO", calls)] });
  const p = await newProject(e.store);
  const count = () => ["VALIDATING", "COMPRESSING", "EXTRACTING_AUDIO", "ANALYZING_VIDEO"].map((s) => calls[`${p.id}:${s}`] || 0);

  assert.equal((await (await e.runner.enqueuePipeline(p.id)).done).status, "READY");
  assert.deepEqual(count(), [1, 1, 1, 1]);

  let r = await e.runner.retry(p.id, { mode: "force", stage: "EXTRACTING_AUDIO" });
  assert.equal(r.fromStage, "EXTRACTING_AUDIO");
  assert.equal((await r.done).status, "READY");
  assert.deepEqual(count(), [1, 1, 2, 1], "only EXTRACTING_AUDIO re-ran");

  r = await e.runner.retry(p.id, { mode: "force", stage: "COMPRESSING" });
  assert.equal((await r.done).status, "READY");
  assert.deepEqual(count(), [1, 2, 3, 2], "COMPRESSING and both branches below it re-ran; VALIDATING did not");

  r = await e.runner.retry(p.id, { mode: "resume" });
  assert.equal((await r.done).status, "READY");
  assert.deepEqual(count(), [1, 2, 3, 2], "resume with unchanged inputs makes zero handler calls");

  await e.store.update(p.id, (d) => { d.settings.knob_ANALYZING_VIDEO = 1; });
  assert.equal((await (await e.runner.retry(p.id, { mode: "resume" })).done).status, "READY");
  assert.deepEqual(count(), [1, 2, 3, 3], "an input change re-runs only the stage it feeds");

  await e.store.update(p.id, (d) => { d.settings.knob_COMPRESSING = 1; });
  assert.equal((await (await e.runner.retry(p.id, { mode: "resume" })).done).status, "READY");
  assert.deepEqual(count(), [1, 3, 4, 4], "a changed upstream output cascades downstream, never upstream");
});

// ---------------------------------------------------------------------------------------------
section("checkpoints — attempts, budgets, fencing, faults");

t("transient errors are retried up to 3 attempts; the stage records the attempt count", async () => {
  const e = env("transient");
  const p = await newProject(e.store);
  const calls = {};
  const def = createRegistry().registerStage(stub("VALIDATING", calls, {
    body: (ctx, n) => { if (n < 3) throw new EditError("PROVIDER_HTTP", { errorClass: "transient", retryable: true }); },
  }));
  const r = await runStage(def, ctxFor(e, p.id));
  assert.equal(r.status, "done");
  assert.equal(r.record.attempts, 3);
  assert.deepEqual(stageEvents(e, p.id, "VALIDATING"), ["running", "retrying", "retrying", "done"]);
});

t("a transient error that never clears fails after 3 attempts; other classes fail after 1", async () => {
  const e = env("exhaust");
  const calls = {};
  const cases = [
    [new EditError("PROVIDER_HTTP", { errorClass: "transient", retryable: true }), "PROVIDER_HTTP", 3],
    [new EditError("STT_FAILED", { errorClass: "provider" }), "STT_FAILED", 1],
    [new Error("kaboom"), "STAGE_CRASHED", 1],
  ];
  for (const [thrown, code, attempts] of cases) {
    const p = await newProject(e.store);
    const def = createRegistry().registerStage(stub("VALIDATING", calls, { body: () => { throw thrown; } }));
    const err = await rejects(runStage(def, ctxFor(e, p.id)), code);
    assert.equal(err.stage, "VALIDATING");
    const doc = e.store.get(p.id);
    assert.equal(doc.stages.VALIDATING.status, "failed");
    assert.equal(doc.stages.VALIDATING.attempts, attempts, code);
    assert.equal(doc.stages.VALIDATING.error.code, code);
    assert.equal(calls[`${p.id}:VALIDATING`], attempts);
    assert.equal(doc.errors[doc.errors.length - 1].code, code);
    assert.equal(stageEvents(e, p.id, "VALIDATING").pop(), "failed");
  }
});

t("budget timeout aborts the handler's signal and fails the stage with STAGE_TIMEOUT", async () => {
  const e = env("budget");
  const p = await newProject(e.store);
  let sawAbort = false;
  const def = createRegistry().registerStage(stub("VALIDATING", {}, {
    budgetMs: 150,
    body: (ctx) => untilAborted(ctx.signal).catch((reason) => { sawAbort = true; throw reason; }),
  }));
  const t0 = Date.now();
  const err = await rejects(runStage(def, ctxFor(e, p.id)), "STAGE_TIMEOUT");
  assert.ok(Date.now() - t0 < 2000, `took ${Date.now() - t0}ms`);
  assert.equal(sawAbort, true);
  assert.equal(err.errorClass, "resource");
  assert.equal(err.extra.budgetMs, 150);
  assert.equal(e.store.get(p.id).stages.VALIDATING.status, "failed");
  assert.equal(e.store.get(p.id).stages.VALIDATING.attempts, 1, "a timeout is not auto-retried");
});

t("a handler that ignores its signal is abandoned after the grace period", async () => {
  const e = env("grace");
  const p = await newProject(e.store);
  const def = createRegistry().registerStage(stub("VALIDATING", {}, { budgetMs: 100, body: () => new Promise(() => {}) }));
  const t0 = Date.now();
  await rejects(runStage(def, ctxFor(e, p.id, { abortGraceMs: 150 })), "STAGE_TIMEOUT");
  assert.ok(Date.now() - t0 < 1500, `took ${Date.now() - t0}ms`);
});

t("VIDEO_EDIT_BUDGET_SCALE scales every stage budget", async () => {
  const e = env("scale", { envVars: { VIDEO_EDIT_BUDGET_SCALE: "0.25" } });
  assert.equal(e.settings.budgetScale, 0.25);
  const p = await newProject(e.store);
  const def = createRegistry().registerStage(stub("VALIDATING", {}, {
    budgetMs: 2000,
    body: (ctx) => new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, 1500);
      ctx.signal.addEventListener("abort", () => { clearTimeout(timer); reject(ctx.signal.reason); }, { once: true });
    }),
  }));
  const t0 = Date.now();
  const err = await rejects(runStage(def, ctxFor(e, p.id)), "STAGE_TIMEOUT");
  assert.equal(err.extra.budgetMs, 500);
  assert.ok(Date.now() - t0 < 1400, `took ${Date.now() - t0}ms`);
});

t("a stale runId can neither start nor record a stage (fencing)", async () => {
  const e = env("fence");
  const p = await newProject(e.store);
  await e.store.update(p.id, (d) => { d.runId = "run_current1"; });
  const calls = {};
  const def = createRegistry().registerStage(stub("VALIDATING", calls));
  await rejects(runStage(def, ctxFor(e, p.id, { runId: "run_oldrun01" })), "STALE_RUN");
  assert.equal(calls.VALIDATING, undefined);
  assert.equal(e.store.get(p.id).stages.VALIDATING, undefined);
});

t("crash:<STAGE> and disk:full faults fail the stage through the real error path", async () => {
  const e = env("faults");
  const def = createRegistry().registerStage(stub("VALIDATING", {}));
  const p1 = await newProject(e.store, { settings: { debugFaults: "crash:VALIDATING" } });
  const crash = await rejects(runStage(def, ctxFor(e, p1.id)), "FAULT_CRASH");
  assert.equal(crash.errorClass, "bug");
  assert.equal(e.store.get(p1.id).stages.VALIDATING.status, "failed");
  const p2 = await newProject(e.store, { settings: { debugFaults: "disk:full" } });
  const disk = await rejects(runStage(def, ctxFor(e, p2.id)), "INSUFFICIENT_STORAGE");
  assert.equal(disk.errorClass, "resource");
  assert.equal(e.store.get(p2.id).stages.VALIDATING.attempts, 1);
});

// ---------------------------------------------------------------------------------------------
section("phase-2 handlers (stub media)");

const PORTRAIT_PROBE = {
  durationSec: 12.5,
  video: { codec: "hevc", width: 1920, height: 1080, displayWidth: 1080, displayHeight: 1920, rotation: 90, fps: 29.97 },
  audio: { codec: "aac", channels: 2, sampleRate: 48000 },
};

function stubMedia(calls, { policy, probeImpl } = {}) {
  return {
    probeStrict: async (file, opts) => {
      calls.probe = (calls.probe || 0) + 1;
      calls.probeArgs = { file, opts };
      return probeImpl ? probeImpl(calls.probe) : PORTRAIT_PROBE;
    },
    applyPolicy: (probe, limits) => {
      calls.policy = (calls.policy || 0) + 1;
      calls.limits = limits;
      return policy || { ok: true, reason: null, warnings: ["LOW_RESOLUTION"] };
    },
    normalizeSource: async (args) => {
      calls.normalize = (calls.normalize || 0) + 1;
      calls.normalizeArgs = args;
      const write = (rel, fill, size) => {
        const f = path.join(args.projectDir, rel);
        fs.mkdirSync(path.dirname(f), { recursive: true });
        fs.writeFileSync(f, Buffer.alloc(size, fill));
        return f;
      };
      args.onProgress(50);
      const mezzAbs = write("work/mezz.mp4", 1, 64000);
      write("work/proxy540.mp4", 2, 32000);
      write("work/voice48k.wav", 3, 16000);
      write("work/audio16k.wav", 4, 8000);
      write("work/poster.jpg", 5, 2000);
      return {
        copied: false,
        mezz: { path: mezzAbs, sha256: await fsx.sha256File(mezzAbs), width: 1080, height: 1920, fps: 30, durationSec: 12.5 },
        proxy: { path: "work/proxy540.mp4" }, voice48k: { path: "work/voice48k.wav" }, audio16k: { path: "work/audio16k.wav" },
        poster: { path: "work/poster.jpg" },
      };
    },
  };
}

t("VALIDATING + COMPRESSING take a project to READY with facts, mezzanine and PIPELINE_PARTIAL", async () => {
  const calls = {};
  const clock = Date.UTC(2026, 8, 14, 12, 0, 0);
  const e = env("phase2", { handlers: [(reg) => phase2.register(reg, { media: stubMedia(calls) })], now: () => clock });
  const p = await newProject(e.store, { probe: PORTRAIT_PROBE });
  const h = await e.runner.enqueuePipeline(p.id);
  const res = await h.done;
  assert.equal(res.status, "READY");
  assert.equal(res.partial, true);

  const doc = e.store.get(p.id);
  assert.equal(doc.status, "READY");
  assert.ok(doc.notices.some((n) => n.code === "PIPELINE_PARTIAL" && n.severity === "info"));
  assert.ok(doc.notices.some((n) => n.code === "LOW_RESOLUTION" && n.severity === "warn" && n.stage === "VALIDATING"));
  assert.deepEqual(
    { durationSec: doc.discoveries.durationSec, width: doc.discoveries.width, height: doc.discoveries.height, fps: doc.discoveries.fps, orientation: doc.discoveries.orientation, posterReady: doc.discoveries.posterReady },
    { durationSec: 12.5, width: 1080, height: 1920, fps: 29.97, orientation: "portrait", posterReady: true },
  );
  assert.equal(calls.probeArgs.file, e.store.abs(p.id, "source/original.bin"));
  assert.equal(calls.probeArgs.opts.demuxer, "mov");
  assert.equal(calls.probeArgs.opts.timeoutMs, 20000);
  assert.deepEqual(calls.limits, e.settings.limits);
  const validation = JSON.parse(fs.readFileSync(e.store.abs(p.id, "analysis/validation.json"), "utf8"));
  assert.equal(validation.orientation, "portrait");

  assert.equal(doc.source.mezzanine.path, "work/mezz.mp4");
  assert.deepEqual([doc.source.mezzanine.width, doc.source.mezzanine.height, doc.source.mezzanine.fps], [1080, 1920, 30]);
  assert.match(doc.source.mezzanine.sha256, /^[0-9a-f]{64}$/);
  assert.equal(doc.source.originalDeleteAfter, clock + 7 * DAY_MS);

  const comp = doc.stages.COMPRESSING;
  assert.equal(comp.status, "done");
  assert.equal(comp.engine, "ffmpeg");
  assert.deepEqual(Object.keys(comp.outputs).sort(), ["audio16k", "mezz", "poster", "proxy", "voice48k"]);
  assert.ok(Object.values(comp.outputs).every((o) => o.hashKind === "partial"));
  const a = calls.normalizeArgs;
  assert.equal(a.sourceRel, "source/original.bin");
  assert.equal(a.projectDir, e.store.projectDir(p.id));
  assert.equal(a.runId, doc.runId);
  assert.equal(a.demuxer, "mov");
  assert.ok(a.signal instanceof AbortSignal);
  assert.deepEqual(a.probe.video.displayWidth, 1080, "normalize receives the stored probe");
  assert.equal(doc.progress.overallPct, 14, "VALIDATING 2 + COMPRESSING 12 of 100");
  const derived = 4096 + 64000 + 32000 + 16000 + 8000 + 2000;
  assert.ok(doc.storage.bytes >= derived, `storage.bytes ${doc.storage.bytes} must count the derived media (≥ ${derived}), not only the upload`);
  assert.equal(e.store.userStorageBytes("owner-1"), doc.storage.bytes, "quotas read the refreshed figure");

  const again = await e.runner.retry(p.id, { mode: "resume" });
  assert.equal((await again.done).status, "READY");
  assert.equal(calls.probe, 1, "resume makes zero probe calls");
  assert.equal(calls.normalize, 1, "resume makes zero normalize calls");
});

t("policy rejection fails the project as input (not retryable) and never normalizes", async () => {
  const calls = {};
  const e = env("reject", { handlers: [(reg) => phase2.register(reg, { media: stubMedia(calls, { policy: { ok: false, reason: "DURATION_TOO_LONG", warnings: [] } }) })] });
  const p = await newProject(e.store);
  assert.equal((await (await e.runner.enqueuePipeline(p.id)).done).status, "FAILED");
  const doc = e.store.get(p.id);
  assert.equal(doc.statusReason.code, "MEDIA_REJECTED");
  assert.equal(doc.statusReason.retryable, false);
  assert.equal(doc.statusReason.stage, "VALIDATING");
  assert.deepEqual(doc.statusReason.actions, ["delete"]);
  assert.equal(doc.stages.VALIDATING.status, "failed");
  assert.equal(calls.normalize, undefined);
  await rejects(e.runner.retry(p.id, { mode: "resume" }), "NOT_RETRYABLE");
});

t("VALIDATING's inputHash tracks the source fingerprint, demuxer and limits", async () => {
  const e = env("vhash");
  const p = await newProject(e.store);
  const def = createRegistry().registerStage(phase2.stages({ media: stubMedia({}) })[0]);
  const settingsB = makeSettings(path.join(tmp.dir, "vhash-b"), { videoEdit: { limits: { maxDurationSec: 200 } } });
  const project = e.store.get(p.id);
  const base = await computeInputHash(def, { project, settings: e.settings });
  assert.equal(await computeInputHash(def, { project: e.store.get(p.id), settings: e.settings }), base);
  assert.notEqual(await computeInputHash(def, { project, settings: settingsB }), base, "limits");
  assert.notEqual(await computeInputHash(def, { project: { ...project, source: { ...project.source, sha256: "f".repeat(64) } }, settings: e.settings }), base, "source");
  assert.notEqual(await computeInputHash(def, { project: { ...project, source: { ...project.source, demuxer: "matroska" } }, settings: e.settings }), base, "demuxer");
  const L = e.settings.limits;
  const quotasOnly = { ...e.settings, limits: { ...L, maxUploadMb: L.maxUploadMb + 1, perUser: { ...L.perUser, maxProjects: L.perUser.maxProjects + 1 }, rates: { ...L.rates, opsPerMin: L.rates.opsPerMin + 1 }, global: { ...L.global, createsPerDay: L.global.createsPerDay + 1 } } };
  assert.equal(await computeInputHash(def, { project, settings: quotasOnly }), base, "quotas, rates and global caps are not media policy");
});

function runnerWith(e, media, limits) {
  const r = createRunner({
    store: e.store, queue: e.queue, events: e.events, settings: { ...e.settings, limits }, handlers: [(reg) => phase2.register(reg, { media })],
    log: silentLog, retryBackoffMs: [5, 10], abortGraceMs: 1500,
  });
  opened.push({ runner: r, store: { close() {} } });
  return r;
}

t("VALIDATING is deterministic: a quota change re-runs nothing; a media-limit change re-validates without re-encoding", async () => {
  const calls = {};
  const media = stubMedia(calls);
  const e = env("vdet", { handlers: [(reg) => phase2.register(reg, { media })] });
  const p = await newProject(e.store);
  assert.equal((await (await e.runner.enqueuePipeline(p.id)).done).status, "READY");
  const validationFile = e.store.abs(p.id, "analysis/validation.json");
  const first = fs.readFileSync(validationFile, "utf8");
  assert.ok(!/validatedAt|limitsHash/.test(first), `validation.json must hold no volatile fields: ${first}`);
  const L = e.settings.limits;

  const quotas = runnerWith(e, media, { ...L, perUser: { ...L.perUser, maxProjects: L.perUser.maxProjects + 1 }, rates: { ...L.rates, opsPerMin: L.rates.opsPerMin + 1 } });
  assert.equal((await (await quotas.retry(p.id, { mode: "resume" })).done).status, "READY");
  assert.deepEqual([calls.probe, calls.normalize], [1, 1], "a quota tweak re-validates and re-encodes nothing");

  const policy = runnerWith(e, media, { ...L, maxDurationSec: L.maxDurationSec - 1 });
  assert.equal((await (await policy.retry(p.id, { mode: "resume" })).done).status, "READY");
  assert.deepEqual([calls.probe, calls.normalize], [2, 1], "a media-limit change re-validates, and the same verdict keeps COMPRESSING cached");
  assert.equal(fs.readFileSync(validationFile, "utf8"), first, "same verdict → same bytes");
});

t("COMPRESSING gets 2 attempts (one tolerant retry), never 3", async () => {
  const calls = {};
  const tolerant = [];
  const media = {
    ...stubMedia(calls),
    normalizeSource: async (args) => { tolerant.push(args.tolerant); throw new EditError("PROC_EXIT", { errorClass: "transient", retryable: true, stage: "COMPRESSING" }); },
  };
  assert.equal(createRegistry().registerStage(phase2.stages({ media })[1]).maxAttempts, 2);
  const e = env("comp-attempts", { handlers: [(reg) => phase2.register(reg, { media })] });
  const p = await newProject(e.store);
  assert.equal((await (await e.runner.enqueuePipeline(p.id)).done).status, "NEEDS_ATTENTION");
  const doc = e.store.get(p.id);
  assert.deepEqual([doc.stages.COMPRESSING.status, doc.stages.COMPRESSING.attempts], ["failed", 2]);
  assert.deepEqual(tolerant, [false, true], "the second (last) attempt is the tolerant one");
});

t("original gone after COMPRESSING: limits changes resume from pinned checkpoints; a lost mezzanine parks as resource and retention keeps work/", async () => {
  const { createRetention } = require("../src/video_edit/retention");
  const calls = {};
  const media = stubMedia(calls);
  const e = env("orig-deleted", { handlers: [(reg) => phase2.register(reg, { media })] });
  const L = e.settings.limits;
  const changed = runnerWith(e, media, { ...L, maxDurationSec: L.maxDurationSec - 1, perUser: { ...L.perUser, maxProjects: L.perUser.maxProjects + 1 } });

  // (a) retention's 7-day deletion: file gone AND originalDeletedAt recorded.
  const p = await newProject(e.store);
  assert.equal((await (await e.runner.enqueuePipeline(p.id)).done).status, "READY");
  fs.unlinkSync(e.store.abs(p.id, "source/original.bin"));
  await e.store.update(p.id, (d) => { d.source.originalDeletedAt = Date.now(); });
  // (b) a crash between retention's unlink and its originalDeletedAt write: file gone, mezzanine recorded.
  const q = await newProject(e.store);
  assert.equal((await (await e.runner.enqueuePipeline(q.id)).done).status, "READY");
  fs.unlinkSync(e.store.abs(q.id, "source/original.bin"));
  const [probes, normalizes] = [calls.probe, calls.normalize];
  for (const id of [p.id, q.id]) {
    const r = await changed.retry(id, { mode: "resume" });
    assert.equal((await r.done).status, "READY", JSON.stringify(e.store.get(id).statusReason));
  }
  assert.deepEqual([calls.probe, calls.normalize], [probes, normalizes], "pinned checkpoints reused despite changed VALIDATING inputs");

  // (c) the mezzanine is lost too: nothing can rebuild it. Resource-class, not input → never FAILED.
  fs.unlinkSync(e.store.abs(p.id, "work/mezz.mp4"));
  const res = await (await changed.retry(p.id, { mode: "resume" })).done;
  assert.equal(res.status, "NEEDS_ATTENTION");
  const doc = e.store.get(p.id);
  assert.deepEqual([doc.statusReason.code, doc.statusReason.retryable, doc.statusReason.actions], ["SOURCE_MISSING", false, ["delete"]]);
  assert.equal(calls.normalize, normalizes);
  const retention = createRetention({ store: e.store, settings: e.settings, runner: changed, log: silentLog, freeDiskMb: () => 999999 });
  const swept = await retention.sweepOnce();
  assert.deepEqual(swept.failedPurged, []);
  for (const rel of ["work/proxy540.mp4", "work/voice48k.wav", "analysis/validation.json"]) assert.ok(fs.existsSync(e.store.abs(p.id, rel)), `${rel} kept`);
  await rejects(changed.retry(p.id, { mode: "resume" }), "NOT_RETRYABLE");

  // (d) resume with the original deleted and no COMPRESSING checkpoint at all → refused up front.
  const z = await newProject(e.store);
  await e.store.update(z.id, (d) => { d.source.originalDeletedAt = Date.now(); });
  await e.store.setStatus(z.id, "CANCELLED");
  const refused = await rejects(changed.retry(z.id, { mode: "resume" }), "NOT_RETRYABLE");
  assert.equal(refused.extra.reason, "ORIGINAL_DELETED");
});

t("a probe timeout is retried (transient); a vanished original fails as input", async () => {
  const calls = {};
  const media = stubMedia(calls, {
    probeImpl: (n) => { if (n === 1) throw new EditError("PROC_TIMEOUT", { errorClass: "transient", retryable: true }); return PORTRAIT_PROBE; },
  });
  const e = env("probe-retry", { handlers: [(reg) => phase2.register(reg, { media })] });
  const p = await newProject(e.store);
  assert.equal((await (await e.runner.enqueuePipeline(p.id)).done).status, "READY");
  assert.equal(e.store.get(p.id).stages.VALIDATING.attempts, 2);

  const q = await newProject(e.store);
  fs.unlinkSync(e.store.abs(q.id, "source/original.bin"));
  assert.equal((await (await e.runner.enqueuePipeline(q.id)).done).status, "FAILED");
  assert.equal(e.store.get(q.id).statusReason.code, "SOURCE_MISSING");
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
