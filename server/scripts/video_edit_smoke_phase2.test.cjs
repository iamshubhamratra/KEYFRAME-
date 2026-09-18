// End-to-end, in-process smoke test for AI Video Edit Phase 2 (upload → READY, cancel, retry, restart).
// Run: node scripts/video_edit_smoke_phase2.test.cjs
//
// WHY THIS EXISTS. Every Phase-2 module has its own unit suite with stubs on the far side of its seams.
// This one wires the REAL pieces together the way server.js will: an express app with
// videoEdit.buildRouter (only auth is injected), the real store / event bus / queue in a temp dir, and the
// REAL runner with the REAL media handlers (probe_strict + normalize → ffprobe/ffmpeg). Load-bearing:
//   - a multipart upload of a lavfi clip is admitted and walks VALIDATING → COMPRESSING to READY with
//     PIPELINE_PARTIAL, leaving a CFR-30 yuv420p mezzanine with audio, a 540p proxy, both wavs and a poster
//     that the media route serves (and nobody else can fetch);
//   - an HTTP cancel stops the pipeline both inside a stage's fault-injected wait (SSE sees it) and inside a
//     live ffmpeg encode (the ffmpeg tree is dead), keeping the VALIDATING checkpoint;
//   - retry resumes from that checkpoint;
//   - per-project debugFaults reach the real handlers (probe:timeout in VALIDATING, normalize:exit1 in
//     COMPRESSING) and exhaust the transient attempts into NEEDS_ATTENTION with retry offered;
//   - SSE `discovery` events get the same whitelist as GET /:id;
//   - a "restart" — a new store + queue + runner over the same directory, with crash residue (a stage left
//     `running`, a half-written temp output, a foreign pid entry) — is recovered and resumed to READY, and
//     a pid whose image is not ffmpeg is never killed;
//   - delete on the restarted server removes everything; logs never carry paths or filenames.
// Offline: loopback HTTP only, fetch tripwire, everything under os.tmpdir(), removed at the end.

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
const { spawn, spawnSync } = require("node:child_process");
const { createHarness, mkTmp, makeSettings, makeFixture, installFetchTripwire, isAlive } = require("./lib/video_edit_test_utils.cjs");

const tmp = mkTmp("ve-smoke2-");
process.env.VIDEO_EDIT_DIR = path.join(tmp.dir, "_guard", "edits");
process.env.VIDEO_EDIT_INDEX = path.join(tmp.dir, "_guard", "video-edits.json");

const SERVER_ROOT = path.resolve(__dirname, "..");
const DEFAULT_PIDS = path.join(SERVER_ROOT, "edits", "_runtime", "pids.json");
const mtimeOr = (f) => { try { return fs.statSync(f).mtimeMs; } catch { return null; } };
const strayBefore = {
  edits: fs.existsSync(path.join(SERVER_ROOT, "edits")),
  index: fs.existsSync(path.join(SERVER_ROOT, "video-edits.json")),
  pidsMtime: mtimeOr(DEFAULT_PIDS),
};

const express = require("express");
const videoEdit = require("../src/video_edit");
const fsx = require("../src/video_edit/fsx");
const { createStore } = require("../src/video_edit/store");
const { createEventBus } = require("../src/video_edit/events");
const { createQueue } = require("../src/video_edit/engine/queue");
const { createRunner } = require("../src/video_edit/engine/runner");
const { recover } = require("../src/video_edit/recovery");

const { t, section, run } = createHarness();
const restoreFetch = installFetchTripwire();
const noop = () => {};

// ---- fixtures: users, env, captured logs ---------------------------------------------------------
const USERS = new Set(["user-a", "user-b", "user-c", "user-d", "user-e", "user-f"]);
const readUserId = (req) => {
  const m = /(?:^|;\s*)ve_smoke_user=([^;]+)/.exec(String(req.headers.cookie || ""));
  return m ? decodeURIComponent(m[1]) : null;
};
const findUserById = (id) => (USERS.has(id) ? { id } : null);
const as = (user) => ({ cookie: `ve_smoke_user=${encodeURIComponent(user)}` });
const ENV = Object.freeze({ NODE_ENV: "test", OPENROUTER_API_KEY: "smoke-test-key", SECRET_KEY: "smoke-test-secret" });
const CONSENT = { consent: { thirdPartyAi: true, termsVersion: "2026-09" } };
const UPLOAD_NAME = "C:/Users/victim/smoke clip.mp4";
const TERMINAL = new Set(["READY", "NEEDS_ATTENTION", "FAILED", "CANCELLED"]);

const logLines = [];
const capture = (m) => { logLines.push(String(m)); };
const capLog = { info: capture, warn: capture, error: capture, log: capture };

const settings = makeSettings(path.join(tmp.dir, "root"));
const FX = path.join(tmp.dir, "fx");
fs.mkdirSync(FX, { recursive: true });

const servers = [];
const children = [];
const P = {};         // project ids by scenario
const timings = {};   // ms
let fixtures = null;
let rt1 = null;
let rt2 = null;

// ---- runtime: the same wiring server.js gets, over one directory --------------------------------
async function startRuntime(label) {
  const store = createStore({ settings, log: capLog });
  store.init();
  const events = createEventBus({ store, settings });
  // Template queue read-only peek injected: the default requires db.js, which loads config + server/.env.
  const queue = createQueue({ settings, getTemplateActiveCount: () => 0, pollMs: 50 });
  // Explicit Phase-2 stages only (media/probe_strict + media/normalize). The default registry also
  // carries the analysis stages, which call paid providers — this suite must stay offline.
  const runner = createRunner({ store, queue, events, settings, log: capLog, handlers: [require("../src/video_edit/engine/handlers/phase2").register] });
  const router = videoEdit.buildRouter({
    settings, store, events, queue, runner, readUserId, findUserById, env: ENV, log: capLog, statfsFreeMb: () => 500000,
  });
  assert(!router.videoEdit || !router.videoEdit.disabled, `router disabled: ${router.videoEdit && router.videoEdit.reason}`);
  const app = express();
  app.use("/api/video-edits", videoEdit.jsonBodyParser({ log: capLog }));   // API.md §1 step 2
  app.use(express.json({ limit: "64kb" }));
  app.use("/api/video-edits", router);
  app.use("/api/video-edits", videoEdit.errorHandler({ log: capLog }));
  const server = http.createServer(app);
  servers.push(server);
  const port = await new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));
  return { label, store, events, queue, runner, router, server, port };
}

function closeServer(server) {
  return new Promise((resolve) => {
    try { server.closeAllConnections(); } catch { /* noop */ }
    server.close(() => resolve());
  });
}

// ---- HTTP helpers --------------------------------------------------------------------------------
function request(port, { method = "GET", path: p, headers = {}, body = null, timeoutMs = 60000 }) {
  return new Promise((resolve, reject) => {
    const h = { ...headers };
    if (body != null && h["content-length"] === undefined) h["content-length"] = body.length;
    const req = http.request({ host: "127.0.0.1", port, method, path: p, headers: h, agent: false }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("error", noop);
      res.on("end", () => {
        const buf = Buffer.concat(chunks);
        let json = null;
        try { json = JSON.parse(buf.toString("utf8")); } catch { json = null; }
        resolve({ status: res.statusCode, headers: res.headers, buf, text: buf.toString("utf8"), json });
      });
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error("request timeout")));
    req.on("error", reject);
    if (body != null) req.write(body);
    req.end();
  });
}

function api(rt, method, p, { user = null, headers = {}, json } = {}) {
  const h = { ...(user ? as(user) : {}), ...headers };
  let body = null;
  if (json !== undefined) { body = Buffer.from(JSON.stringify(json)); h["content-type"] = "application/json"; }
  return request(rt.port, { method, path: `/api/video-edits${p}`, headers: h, body });
}

function multipart(parts) {
  const boundary = `----vesmoke${crypto.randomBytes(8).toString("hex")}`;
  const bufs = [];
  for (const part of parts) {
    let head = `--${boundary}\r\nContent-Disposition: form-data; name="${part.name}"`;
    if (part.filename !== undefined) head += `; filename="${part.filename}"\r\nContent-Type: ${part.contentType || "application/octet-stream"}`;
    bufs.push(Buffer.from(`${head}\r\n\r\n`), Buffer.isBuffer(part.data) ? part.data : Buffer.from(String(part.data)), Buffer.from("\r\n"));
  }
  bufs.push(Buffer.from(`--${boundary}--\r\n`));
  return { body: Buffer.concat(bufs), contentType: `multipart/form-data; boundary=${boundary}` };
}

function postCreate(rt, user, { file, clientRequestId, settings: s }) {
  const form = multipart([
    { name: "settings", data: JSON.stringify(s) },
    { name: "clientRequestId", data: clientRequestId },
    { name: "video", filename: UPLOAD_NAME, contentType: "video/mp4", data: fs.readFileSync(file) },
  ]);
  return request(rt.port, { method: "POST", path: "/api/video-edits/", headers: { ...as(user), "content-type": form.contentType }, body: form.body });
}

function openSse(port, pathname, headers = {}) {
  return new Promise((resolve, reject) => {
    const state = { status: null, events: [], closed: false, req: null };
    const req = http.get({ host: "127.0.0.1", port, path: pathname, headers, agent: false }, (res) => {
      state.status = res.statusCode;
      res.on("error", noop);
      res.setEncoding("utf8");
      let buf = "";
      res.on("data", (chunk) => {
        buf += chunk;
        let i;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const frame = buf.slice(0, i);
          buf = buf.slice(i + 2);
          let type = "message";
          const data = [];
          for (const line of frame.split("\n")) {
            if (line.startsWith("event: ")) type = line.slice(7);
            else if (line.startsWith("data: ")) data.push(line.slice(6));
          }
          if (data.length) { let parsed = null; try { parsed = JSON.parse(data.join("\n")); } catch { /* noop */ } state.events.push({ type, data: parsed }); }
        }
      });
      res.on("close", () => { state.closed = true; });
      resolve(state);
    });
    state.req = req;
    req.on("error", () => { state.closed = true; if (state.status == null) reject(new Error("sse request failed")); });
  });
}

async function waitFor(fn, { timeoutMs = 10000, label = "condition", everyMs = 50 } = {}) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > timeoutMs) throw new Error(`timed out after ${timeoutMs} ms waiting for ${label}`);
    await new Promise((r) => setTimeout(r, everyMs));
  }
}

async function pollUntilTerminal(rt, user, id, { timeoutMs = 120000 } = {}) {
  const samples = [];
  const final = await waitFor(async () => {
    const r = await api(rt, "GET", `/${id}/progress`, { user });
    assert.strictEqual(r.status, 200, r.text.slice(0, 200));
    samples.push(r.json);
    return TERMINAL.has(r.json.status) ? r.json : null;
  }, { timeoutMs, everyMs: 200, label: `terminal status of ${id}` });
  return { final, samples };
}

const stageStatus = (rt, id, stage) => {
  const p = rt.store.get(id);
  return p && p.stages && p.stages[stage] ? p.stages[stage].status : null;
};

// ---- media assertions ----------------------------------------------------------------------------
function ffprobe(file, args) {
  const r = spawnSync("ffprobe", ["-v", "error", ...args, "-of", "json", file], { encoding: "utf8", windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`ffprobe failed: ${String(r.stderr).slice(-200)}`);
  return JSON.parse(r.stdout);
}

function assertMezzanine(file, { durationSec, width, height }) {
  const info = ffprobe(file, ["-show_streams", "-show_format"]);
  const v = info.streams.find((s) => s.codec_type === "video");
  const a = info.streams.find((s) => s.codec_type === "audio");
  assert(v && a, "mezzanine has a video and an audio stream");
  assert.deepStrictEqual([v.codec_name, v.pix_fmt, v.width, v.height, v.r_frame_rate, v.avg_frame_rate], ["h264", "yuv420p", width, height, "30/1", "30/1"]);
  assert.deepStrictEqual([a.codec_name, a.sample_rate, a.channels], ["aac", "48000", 2]);
  assert(Math.abs(Number(info.format.duration) - durationSec) < 0.15, `duration ${info.format.duration}`);
  const tagKeys = Object.keys((info.format && info.format.tags) || {});
  assert(tagKeys.every((k) => ["major_brand", "minor_version", "compatible_brands", "encoder"].includes(k)), `unexpected tags ${tagKeys}`);
  // CFR: every video frame is exactly 1/30 s after the previous one.
  const pk = ffprobe(file, ["-select_streams", "v:0", "-show_entries", "packet=pts_time"]);
  const pts = pk.packets.map((p) => Number(p.pts_time)).filter(Number.isFinite).sort((x, y) => x - y);
  const expected = Math.round(durationSec * 30);
  assert(Math.abs(pts.length - expected) <= 2, `expected ~${expected} frames, got ${pts.length}`);
  for (let i = 1; i < pts.length; i++) assert(Math.abs(pts[i] - pts[i - 1] - 1 / 30) < 0.002, `non-CFR step at frame ${i}: ${pts[i] - pts[i - 1]}`);
}

function assertWorkOutputs(dir, { durationSec, width, height }) {
  const w = (rel) => path.join(dir, ...rel.split("/"));
  assertMezzanine(w("work/mezz.mp4"), { durationSec, width, height });
  const proxy = ffprobe(w("work/proxy540.mp4"), ["-show_streams"]).streams;
  const pv = proxy.find((s) => s.codec_type === "video");
  assert.strictEqual(Math.min(pv.width, pv.height), 540, `proxy ${pv.width}x${pv.height}`);
  assert(proxy.some((s) => s.codec_type === "audio"), "proxy keeps audio");
  const poster = fs.readFileSync(w("work/poster.jpg"));
  assert(poster.length > 1000 && poster[0] === 0xff && poster[1] === 0xd8 && poster[2] === 0xff, "poster is a JPEG");
  for (const [rel, rate] of [["work/voice48k.wav", "48000"], ["work/audio16k.wav", "16000"]]) {
    const s = ffprobe(w(rel), ["-show_streams"]).streams[0];
    assert.deepStrictEqual([s.codec_name, s.sample_rate, s.channels], ["pcm_s16le", rate, 1], rel);
  }
}

function tmpFiles(dir) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.tmp(\.|$)/i.test(e.name)) out.push(path.relative(dir, full));
    }
  };
  walk(dir);
  return out;
}

function assertNoLeaks(view) {
  const s = JSON.stringify(view);
  for (const needle of [path.basename(tmp.dir), "original.bin", "work/", "source/", "run_", "smoke-test-key"]) {
    assert(!s.includes(needle), `view leaks "${needle}"`);
  }
}

const livePids = () => {
  const r = fsx.readJsonSafe(path.join(settings.paths.runtimeDir, "pids.json"));
  return r.ok && Array.isArray(r.value.pids) ? r.value.pids : [];
};

// =================================================================================================
section("setup");

t("lavfi fixtures (1280x720 + aac) and the app on the real runtime; health says enabled", async () => {
  fixtures = {
    a25: makeFixture(path.join(FX, "a25.mp4"), { seconds: 4, size: "1280x720", fps: 25 }),
    c30: makeFixture(path.join(FX, "c30.mp4"), { seconds: 4, size: "1280x720", fps: 30 }),
    long25: makeFixture(path.join(FX, "long25.mp4"), { seconds: 30, size: "1280x720", fps: 25 }),
  };
  rt1 = await startRuntime("boot-1");
  const h = await api(rt1, "GET", "/health", { user: "user-a" });
  assert.strictEqual(h.status, 200);
  assert.strictEqual(h.json.enabled, true, JSON.stringify(h.json));
  assert.strictEqual(h.json.ffmpeg.ok, true);
  assert.deepStrictEqual((await api(rt1, "GET", "/health")).json, { enabled: true }, "anonymous health carries no details");
});

// =================================================================================================
section("upload → READY (real VALIDATING + COMPRESSING)");

t("4 s 1280x720 upload → 201 → READY with PIPELINE_PARTIAL; CFR-30 yuv420p mezzanine with audio, proxy, wavs, poster", async () => {
  assert(rt1 && fixtures, "depends on setup");
  const t0 = Date.now();
  const r = await postCreate(rt1, "user-a", { file: fixtures.a25, clientRequestId: "smoke-a", settings: { ...CONSENT, title: "Smoke A" } });
  assert.strictEqual(r.status, 201, r.text.slice(0, 300));
  timings.admitMs = Date.now() - t0;
  const id = r.json.project.id;
  P.a = id;
  assert.match(id, /^ve_[0-9a-z]{16}$/);

  const { final, samples } = await pollUntilTerminal(rt1, "user-a", id);
  timings.uploadToReadyMs = Date.now() - t0;
  assert.strictEqual(final.status, "READY", JSON.stringify(rt1.store.get(id).statusReason));
  assert(samples.some((s) => s.status === "PROCESSING" || s.status === "QUEUED"), "progress was observable before READY");
  const running = samples.filter((s) => s.status === "PROCESSING");
  for (let i = 1; i < running.length; i++) {
    assert(running[i].overallPct + 0.05 >= running[i - 1].overallPct, `overallPct went backwards: ${running[i - 1].overallPct} → ${running[i].overallPct}`);
  }

  const view = await api(rt1, "GET", `/${id}`, { user: "user-a" });
  assert.strictEqual(view.status, 200);
  const v = view.json;
  assert.strictEqual(v.stages.VALIDATING.status, "done");
  assert.strictEqual(v.stages.COMPRESSING.status, "done");
  assert.strictEqual(v.stages.COMPRESSING.engine, "ffmpeg", "a 25 fps source is re-encoded, not stream-copied");
  assert(v.notices.some((n) => n.code === "PIPELINE_PARTIAL"), JSON.stringify(v.notices));
  assert.strictEqual(v.statusReason, null);
  assert.strictEqual(v.posterUrl, `/api/video-edits/${id}/media/poster`);
  assert.deepStrictEqual([v.source.width, v.source.height, v.source.displayName, v.source.hasAudio], [1280, 720, "smoke clip.mp4", true]);
  assert(Math.abs(v.discoveries.durationSec - 4) < 0.2 && v.discoveries.posterReady === true, JSON.stringify(v.discoveries));
  assert(v.allowedActions.includes("delete"));
  assertNoLeaks(v);

  const p = rt1.store.get(id);
  const mz = p.source.mezzanine;
  assert.deepStrictEqual([mz.path, mz.width, mz.height, mz.fps], ["work/mezz.mp4", 1280, 720, 30]);
  assert.match(mz.sha256, /^[0-9a-f]{64}$/);
  assert(p.source.originalDeleteAfter > Date.now() + 6 * 24 * 3600 * 1000, "original deletion clock started (7 d)");
  assert.deepStrictEqual(Object.keys(p.stages.COMPRESSING.outputs).sort(), ["audio16k", "mezz", "poster", "proxy", "voice48k"]);
  const dir = rt1.store.projectDir(id);
  assertWorkOutputs(dir, { durationSec: 4, width: 1280, height: 720 });
  assert.deepStrictEqual(tmpFiles(dir), [], "no *.tmp.* left behind");
  assert.deepStrictEqual(livePids(), [], "every ffmpeg/ffprobe child left the pid registry");

  const poster = await api(rt1, "GET", `/${id}/media/poster`, { user: "user-a" });
  assert.strictEqual(poster.status, 200, poster.text.slice(0, 200));
  assert.match(poster.headers["content-type"], /image\/jpeg/);
  assert(poster.buf.equals(fs.readFileSync(path.join(dir, "work", "poster.jpg"))));
  const proxy = await api(rt1, "GET", `/${id}/media/source-proxy`, { user: "user-a", headers: { range: "bytes=0-1023" } });
  assert.strictEqual(proxy.status, 206);
  assert.strictEqual(proxy.buf.length, 1024);
  assert.strictEqual((await api(rt1, "GET", `/${id}/media/poster`, { user: "user-b" })).status, 404, "another user cannot fetch it");

  const trail = fs.readFileSync(path.join(dir, "logs", "events.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  assert(trail.some((l) => l.type === "stage" && l.stage === "COMPRESSING" && l.status === "done"));
  assert(trail.some((l) => l.type === "done" && l.status === "READY"));
  for (const l of trail) assert(Object.keys(l).every((k) => ["t", "seq", "type", "stage", "status", "code"].includes(k)), JSON.stringify(l));
});

// =================================================================================================
section("cancel and retry over HTTP");

t("cancel inside COMPRESSING (slow:COMPRESSING:5) → CANCELLED fast, VALIDATING checkpoint kept, SSE sees interrupted + done", async () => {
  assert(rt1 && fixtures, "depends on setup");
  const r = await postCreate(rt1, "user-b", { file: fixtures.a25, clientRequestId: "smoke-b", settings: { ...CONSENT, debugFaults: "slow:COMPRESSING:5" } });
  assert.strictEqual(r.status, 201, r.text.slice(0, 300));
  const id = r.json.project.id;
  P.b = id;
  const sse = await openSse(rt1.port, `/api/video-edits/${id}/events`, as("user-b"));
  try {
    assert.strictEqual(sse.status, 200);
    await waitFor(() => stageStatus(rt1, id, "COMPRESSING") === "running", { timeoutMs: 60000, label: "COMPRESSING running" });
    assert.strictEqual(rt1.store.get(id).progress.stage, "COMPRESSING");

    // A handler that publishes a non-whitelisted discovery must not leak it through the stream.
    rt1.events.publish(id, "discovery", { stage: "VALIDATING", discoveries: { durationSec: 4.5, secretPath: tmp.dir, hook: "hello" } });
    const disc = await waitFor(() => sse.events.find((e) => e.type === "discovery" && e.data && e.data.discoveries && e.data.discoveries.durationSec === 4.5), { timeoutMs: 5000, label: "SSE discovery" });
    assert.deepStrictEqual(disc.data.discoveries, { durationSec: 4.5, hook: "hello" });
    assert.strictEqual(disc.data.stage, "VALIDATING");

    const tc = Date.now();
    const c = await api(rt1, "POST", `/${id}/cancel`, { user: "user-b", json: { target: "pipeline" } });
    assert.strictEqual(c.status, 202, c.text);
    assert.deepStrictEqual(c.json, { cancelling: true });
    const { final } = await pollUntilTerminal(rt1, "user-b", id, { timeoutMs: 15000 });
    timings.cancelInStageMs = Date.now() - tc;
    assert.strictEqual(final.status, "CANCELLED");
    assert(timings.cancelInStageMs < 5000, `cancel took ${timings.cancelInStageMs} ms`);

    const p = rt1.store.get(id);
    assert.strictEqual(p.statusReason.code, "CANCELLED");
    assert.strictEqual(p.stages.VALIDATING.status, "done", "checkpoint kept");
    assert.strictEqual(p.stages.COMPRESSING.status, "interrupted");
    assert.strictEqual(rt1.runner.isActive(id), false);
    const dir = rt1.store.projectDir(id);
    assert(!fs.existsSync(path.join(dir, "work", "mezz.mp4")));
    assert.deepStrictEqual(tmpFiles(dir), []);

    await waitFor(() => sse.events.some((e) => e.type === "done" && e.data && e.data.status === "CANCELLED"), { timeoutMs: 5000, label: "SSE done CANCELLED" });
    assert.strictEqual(sse.events[0].type, "snapshot");
    assert.strictEqual(sse.events[0].data.id, id);
    assertNoLeaks(sse.events[0].data);
    assert(sse.events.some((e) => e.type === "stage" && e.data.stage === "COMPRESSING" && e.data.status === "interrupted"), sse.events.map((e) => e.type).join(","));
    const seqs = sse.events.slice(1).map((e) => e.data.seq);
    assert(seqs.every((s, i) => Number.isInteger(s) && (i === 0 || s > seqs[i - 1])), `seq not increasing: ${seqs}`);
    for (const e of sse.events.filter((x) => x.type === "discovery")) {
      assert(Object.keys(e.data.discoveries).every((k) => ["durationSec", "width", "height", "fps", "orientation", "posterReady", "hook"].includes(k)), JSON.stringify(e.data));
    }

    const again = await api(rt1, "POST", `/${id}/cancel`, { user: "user-b", json: {} });
    assert.strictEqual(again.status, 409);
    assert.strictEqual(again.json.error, "NOTHING_TO_CANCEL");
    const v = (await api(rt1, "GET", `/${id}`, { user: "user-b" })).json;
    assert(v.allowedActions.includes("retry"), JSON.stringify(v.allowedActions));
  } finally {
    sse.req.destroy();
  }
});

t("retry (resume) from CANCELLED → 202 fromStage COMPRESSING → READY without re-running VALIDATING", async () => {
  const id = P.b;
  assert(id, "depends on the cancel test");
  const validated = rt1.store.get(id).stages.VALIDATING;
  const t0 = Date.now();
  const r = await api(rt1, "POST", `/${id}/retry`, { user: "user-b", json: { mode: "resume" } });
  assert.strictEqual(r.status, 202, r.text);
  assert.deepStrictEqual(r.json, { fromStage: "COMPRESSING" });
  const { final } = await pollUntilTerminal(rt1, "user-b", id);
  timings.retryToReadyMs = Date.now() - t0;
  assert.strictEqual(final.status, "READY", JSON.stringify(rt1.store.get(id).statusReason));
  const p = rt1.store.get(id);
  assert.strictEqual(p.stages.VALIDATING.finishedAt, validated.finishedAt, "VALIDATING checkpoint reused");
  assert.strictEqual(p.stages.COMPRESSING.status, "done");
  assertMezzanine(path.join(rt1.store.projectDir(id), "work", "mezz.mp4"), { durationSec: 4, width: 1280, height: 720 });
});

t("cancel during a live ffmpeg encode kills the ffmpeg tree and parks the project CANCELLED", async () => {
  assert(rt1 && fixtures, "depends on setup");
  const r = await postCreate(rt1, "user-d", { file: fixtures.long25, clientRequestId: "smoke-d", settings: CONSENT });
  assert.strictEqual(r.status, 201, r.text.slice(0, 300));
  const id = r.json.project.id;
  P.d = id;
  const encoding = await waitFor(() => {
    if (stageStatus(rt1, id, "COMPRESSING") !== "running") return null;
    const list = livePids().filter((e) => e.label === "normalize-mezz" && isAlive(e.pid));
    return list.length ? list : null;
  }, { timeoutMs: 60000, everyMs: 25, label: "normalize-mezz ffmpeg running" });
  const pids = encoding.map((e) => e.pid);

  const tc = Date.now();
  const c = await api(rt1, "POST", `/${id}/cancel`, { user: "user-d", json: {} });
  assert.strictEqual(c.status, 202, c.text);
  const { final } = await pollUntilTerminal(rt1, "user-d", id, { timeoutMs: 20000 });
  timings.cancelLiveFfmpegMs = Date.now() - tc;
  assert.strictEqual(final.status, "CANCELLED", JSON.stringify(rt1.store.get(id).statusReason));
  await waitFor(() => pids.every((pid) => !isAlive(pid)), { timeoutMs: 5000, label: "ffmpeg children dead" });
  assert(timings.cancelLiveFfmpegMs < 5000, `cancel took ${timings.cancelLiveFfmpegMs} ms`);
  const p = rt1.store.get(id);
  assert.strictEqual(p.stages.VALIDATING.status, "done");
  assert.strictEqual(p.stages.COMPRESSING.status, "interrupted");
  const dir = rt1.store.projectDir(id);
  assert(!fs.existsSync(path.join(dir, "work", "mezz.mp4")), "no mezzanine from a killed encode");
  assert.deepStrictEqual(tmpFiles(dir), [], "the killed run's temp outputs were removed");
  assert(!livePids().some((e) => pids.includes(e.pid)), "killed pids left the registry");
});

t("per-project debugFaults reach the real handlers: probe:timeout (3 attempts) / normalize:exit1 (2 attempts) → NEEDS_ATTENTION with retry", async () => {
  assert(rt1 && fixtures, "depends on setup");
  const cases = [
    { token: "probe:timeout", user: "user-e", stage: "VALIDATING", code: "MEDIA_REJECTED", attempts: 3 },
    { token: "normalize:exit1", user: "user-f", stage: "COMPRESSING", code: "PROC_EXIT", attempts: 2 },   // ENGINE.md §6: one tolerant retry
  ];
  const t0 = Date.now();
  for (const c of cases) {
    // Admission probes with no project, so only global faults apply there; the upload is admitted.
    const r = await postCreate(rt1, c.user, { file: fixtures.c30, clientRequestId: `smoke-fault-${c.user}`, settings: { ...CONSENT, debugFaults: c.token } });
    assert.strictEqual(r.status, 201, `${c.token}: ${r.text.slice(0, 300)}`);
    c.id = r.json.project.id;
    P[c.user] = c.id;
  }
  for (const c of cases) {
    const { final } = await pollUntilTerminal(rt1, c.user, c.id, { timeoutMs: 60000 });
    const p = rt1.store.get(c.id);
    assert.strictEqual(final.status, "NEEDS_ATTENTION", `${c.token}: ${final.status} ${JSON.stringify(p.statusReason)}`);
    assert.deepStrictEqual([p.statusReason.code, p.statusReason.stage, p.statusReason.retryable], [c.code, c.stage, true], JSON.stringify(p.statusReason));
    assert(p.statusReason.actions.includes("retry"), JSON.stringify(p.statusReason.actions));
    assert.deepStrictEqual([p.stages[c.stage].status, p.stages[c.stage].attempts], ["failed", c.attempts], `${c.token}: transient class retried to the stage's attempt cap`);
    assert(p.errors.some((e) => e.code === c.code && e.stage === c.stage), JSON.stringify(p.errors));
    assert.deepStrictEqual(tmpFiles(rt1.store.projectDir(c.id)), []);
    const v = (await api(rt1, "GET", `/${c.id}`, { user: c.user })).json;
    assert.deepStrictEqual(v.allowedActions, ["retry", "delete"]);
    assertNoLeaks(v);
  }
  timings.faultsToNeedsAttentionMs = Date.now() - t0;
});

// =================================================================================================
section("restart: new store + queue + runner over the same directory");

t("a project left PROCESSING with crash residue is recovered, resumed from checkpoints and reaches READY", async () => {
  assert(rt1 && fixtures, "depends on setup");
  const r = await postCreate(rt1, "user-c", { file: fixtures.c30, clientRequestId: "smoke-c", settings: { ...CONSENT, debugFaults: "slow:COMPRESSING:3" } });
  assert.strictEqual(r.status, 201, r.text.slice(0, 300));
  const id = r.json.project.id;
  P.c = id;
  await waitFor(() => stageStatus(rt1, id, "COMPRESSING") === "running", { timeoutMs: 60000, label: "COMPRESSING running" });
  const validatedAt = rt1.store.get(id).stages.VALIDATING.finishedAt;

  // "Crash": the first process's engine stops without changing any status, then its store closes.
  const stopped = await rt1.runner.stopAll({ timeoutMs: 10000 });
  assert.strictEqual(stopped.timedOut, false);
  await closeServer(rt1.server);
  rt1.store.close();
  const dir = path.join(settings.paths.dir, id);
  const file = path.join(dir, "project.json");
  const onDisk = fsx.readJsonSafe(file);
  assert(onDisk.ok, "project.json readable after shutdown");
  assert.strictEqual(onDisk.value.status, "PROCESSING", "shutdown must not rewrite the status");

  // Residue of a hard kill: the `interrupted` mark never landed, a half-written output and a stale pid entry remain.
  onDisk.value.stages.COMPRESSING.status = "running";
  fsx.writeJsonAtomic(file, onDisk.value);
  const residue = path.join(dir, "work", "mezz.mp4.tmp.run_deadbeef.mp4");
  fs.writeFileSync(residue, crypto.randomBytes(4096));
  const sleeper = spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], { stdio: "ignore", windowsHide: true });
  children.push(sleeper);
  await waitFor(() => sleeper.pid && isAlive(sleeper.pid), { label: "sleeper process" });
  const pidFile = path.join(settings.paths.runtimeDir, "pids.json");
  fsx.writeJsonAtomic(pidFile, { schemaVersion: 1, ownerPid: 1, pids: [{ pid: sleeper.pid, label: "normalize-mezz", cmd: "ffmpeg", startedAt: Date.now() - 5000, ownerPid: 1 }] });

  const t0 = Date.now();
  rt2 = await startRuntime("boot-2");
  const report = await recover({ store: rt2.store, runner: rt2.runner, settings, log: capLog });
  timings.recoveryMs = Date.now() - t0;
  assert.deepStrictEqual(report.requeued, [id], JSON.stringify(report));
  assert.deepStrictEqual(report.interrupted, [id]);
  assert.deepStrictEqual(report.restartLoop, []);
  assert.strictEqual(report.errors, 0, JSON.stringify(report));
  assert(report.tmpRemoved >= 1, "temp residue removed");
  assert(!fs.existsSync(residue));
  assert.deepStrictEqual(report.pidsKilled, [], "a pid whose image is not ffmpeg/ffprobe is never killed");
  assert(isAlive(sleeper.pid), "the non-ffmpeg process survived recovery");

  const { final } = await pollUntilTerminal(rt2, "user-c", id);
  timings.restartToReadyMs = Date.now() - t0;
  assert.strictEqual(final.status, "READY", JSON.stringify(rt2.store.get(id).statusReason));
  const p = rt2.store.get(id);
  assert.strictEqual(p.stages.VALIDATING.finishedAt, validatedAt, "VALIDATING checkpoint reused after restart");
  assert.strictEqual(p.stages.COMPRESSING.status, "done");
  assert.strictEqual(p.stages.COMPRESSING.engine, "ffmpeg-copy", "a 30 fps h264 source takes the stream-copy path");
  assert.strictEqual(p.recovery.count, 0, "crash-loop counter reset after a clean finish");
  assert(p.notices.some((n) => n.code === "PIPELINE_PARTIAL"));
  assertWorkOutputs(dir, { durationSec: 4, width: 1280, height: 720 });
  assert.deepStrictEqual(tmpFiles(dir), []);

  for (const [pid, status] of [[P.a, "READY"], [P.b, "READY"], [P.d, "CANCELLED"], [P["user-e"], "NEEDS_ATTENTION"], [P["user-f"], "NEEDS_ATTENTION"]]) {
    if (pid) assert.strictEqual(rt2.store.get(pid).status, status, `${pid} unchanged by recovery`);
  }
  sleeper.kill();
});

t("delete on the restarted server → 202, 404 afterwards, directory and trash emptied", async () => {
  const id = P.a;
  assert(rt2 && id, "depends on earlier tests");
  const r = await api(rt2, "POST", `/${id}/delete`, { user: "user-a", json: { confirm: id } });
  assert.strictEqual(r.status, 202, r.text);
  assert.strictEqual((await api(rt2, "GET", `/${id}`, { user: "user-a" })).status, 404);
  await waitFor(() => !fs.existsSync(path.join(settings.paths.dir, id)), { timeoutMs: 15000, label: "project dir removed" });
  await waitFor(() => fs.readdirSync(settings.paths.trashDir).length === 0, { timeoutMs: 15000, label: "trash emptied" });
});

// =================================================================================================
section("hygiene");

t("logs carry ids and codes only (no temp paths, filenames or keys); nothing written under server/", async () => {
  assert(logLines.some((l) => l.includes("[video-edit] pipeline READY")), "engine logs were captured");
  const needles = [tmp.dir, tmp.dir.replace(/\\/g, "/"), path.basename(tmp.dir), "smoke clip", "victim", "smoke-test-key"].map((n) => n.toLowerCase());
  const leaks = logLines.filter((l) => needles.some((n) => l.toLowerCase().includes(n)));
  assert.deepStrictEqual(leaks, []);
  assert.strictEqual(fs.existsSync(path.join(SERVER_ROOT, "video-edits.json")), strayBefore.index, "server/video-edits.json");
  assert.strictEqual(fs.existsSync(path.join(SERVER_ROOT, "edits")), strayBefore.edits, "server/edits");
  assert.strictEqual(mtimeOr(DEFAULT_PIDS), strayBefore.pidsMtime, "server/edits/_runtime/pids.json untouched");
});

// =================================================================================================
(async () => {
  let result;
  try {
    result = await run();
    console.log(`smoke timings (ms): ${JSON.stringify(timings)}`);
  } finally {
    for (const rt of [rt1, rt2]) {
      if (!rt) continue;
      try { await rt.runner.stopAll({ timeoutMs: 5000 }); } catch { /* noop */ }
      try { rt.store.close(); } catch { /* noop */ }
    }
    for (const server of servers) await closeServer(server);
    for (const c of children) { try { c.kill(); } catch { /* noop */ } }
    restoreFetch();
    await new Promise((r) => setTimeout(r, 300));
    tmp.cleanup();
    if (fs.existsSync(tmp.dir)) { console.error("  FAIL temp dir left behind"); process.exitCode = 1; }
  }
  if (result && result.failed) process.exitCode = 1;
})();
