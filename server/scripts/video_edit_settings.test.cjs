// Unit tests for video_edit/settings.js, settings_schema.js, errors.js, ids.js and events.js.
// Run: node scripts/video_edit_settings.test.cjs
//
// Load-bearing: a bad config value or a dangerous storage directory DISABLES the feature with a
// reason instead of crashing boot; fault injection and provider base overrides are off in
// production; client settings are stripped to the schema; error bodies never carry internals; and
// the event trail on disk never contains anything but ids, types, stages, statuses and codes.

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { createHarness, mkTmp, makeSettings, installFetchTripwire } = require("./lib/video_edit_test_utils.cjs");
const S = require("../src/video_edit/settings");
const { normalizeSettings, DEFAULT_SETTINGS } = require("../src/video_edit/settings_schema");
const { EditError, isEditError, toErrorBody } = require("../src/video_edit/errors");
const ids = require("../src/video_edit/ids");
const { createEventBus } = require("../src/video_edit/events");
const { createStore } = require("../src/video_edit/store");

const { t, section, run } = createHarness();
const restoreFetch = installFetchTripwire();
const tmp = mkTmp("ve-settings-");
const root = tmp.dir;
const cfg = (videoEdit) => ({ paths: { root, jobsDir: path.join(root, "jobs"), uploadsDir: path.join(root, "uploads"), videosDir: path.join(root, "public", "videos") }, ...(videoEdit !== undefined ? { videoEdit } : {}) });
const resolve = (opts = {}) => S.resolveSettings({ config: cfg(opts.videoEdit), env: { NODE_ENV: "test", ...(opts.env || {}) }, cpus: opts.cpus || 4 });

section("settings — defaults & env");

t("defaults resolve against the root with no videoEdit block", () => {
  const s = resolve();
  assert.equal(s.enabled, true);
  assert.equal(s.disabledReason, null);
  assert.equal(s.paths.dir, path.join(root, "edits"));
  assert.equal(s.paths.indexFile, path.join(root, "video-edits.json"));
  assert.equal(s.paths.stagingDir, path.join(root, "edits", "_staging"));
  assert.equal(s.paths.runtimeDir, path.join(root, "edits", "_runtime"));
  assert.equal(s.limits.maxUploadMb, 500);
  assert.equal(s.limits.maxDurationSec, 300);
  assert.equal(s.limits.perUser.maxBytes, 3 * 1024 ** 3);
  assert.equal(s.limits.rates.maxStreamsPerUser, 3);
  assert.equal(s.retention.projectTtlDays, 30);
  assert.equal(s.caps.maxUsdPerProject, 0.5);
  assert.deepEqual(s.providers.stt.order, ["openrouter", "kie", "islands"]);
  assert.equal(s.providers.stt.kieModel, "elevenlabs/speech-to-text");
  assert.equal(s.concurrency, 1);
  assert.ok(Object.isFrozen(s) && Object.isFrozen(s.limits.perUser) && Object.isFrozen(s.providers.stt.order));
});

t("heavySlots auto = max(1, floor(cpus/2)); explicit value wins", () => {
  assert.equal(resolve({ cpus: 5 }).heavySlots, 2);
  assert.equal(resolve({ cpus: 1 }).heavySlots, 1);
  assert.equal(resolve({ cpus: 8, videoEdit: { heavySlots: 3 } }).heavySlots, 3);
});

t("VIDEO_EDIT_* env overrides apply", () => {
  const s = resolve({ env: {
    VIDEO_EDIT_DIR: "custom/edits", VIDEO_EDIT_INDEX: path.join(root, "idx", "e.json"), VIDEO_EDIT_MAX_UPLOAD_MB: "100",
    VIDEO_EDIT_MAX_DURATION_SEC: "600", VIDEO_EDIT_CONCURRENCY: "2", VIDEO_EDIT_STT_MODEL: "stt/x", VIDEO_EDIT_VISION_MODEL: "vis/y",
    VIDEO_EDIT_FAULTS: "disk:full", VIDEO_EDIT_BUDGET_SCALE: "2.5",
  } });
  assert.equal(s.enabled, true, s.disabledReason);
  assert.equal(s.paths.dir, path.join(root, "custom", "edits"));
  assert.equal(s.paths.indexFile, path.join(root, "idx", "e.json"));
  assert.equal(s.limits.maxUploadMb, 100);
  assert.equal(s.limits.maxDurationSec, 600);
  assert.equal(s.concurrency, 2);
  assert.equal(s.providers.stt.openrouterModel, "stt/x");
  assert.equal(s.providers.vision.model, "vis/y");
  assert.equal(s.faults.global, "disk:full");
  assert.equal(s.budgetScale, 2.5);
  assert.equal(resolve({ env: { VIDEO_EDIT_ENABLED: "0" } }).disabledReason, "DISABLED_BY_CONFIG");
});

t("invalid values disable the feature with a reason instead of throwing", () => {
  let s = resolve({ env: { VIDEO_EDIT_MAX_UPLOAD_MB: "lots" } });
  assert.equal(s.enabled, false);
  assert.equal(s.disabledReason, "INVALID_ENV_VIDEO_EDIT_MAX_UPLOAD_MB");
  s = resolve({ env: { VIDEO_EDIT_MAX_DURATION_SEC: "601" } });
  assert.equal(s.enabled, false, "hard ceiling 600 s");
  s = resolve({ videoEdit: { limits: { maxFps: -1, perUser: { maxProjects: 2.5 } } } });
  assert.equal(s.enabled, false);
  assert.ok(s.invalid.includes("INVALID_limits.maxFps") && s.invalid.includes("INVALID_limits.perUser.maxProjects"), s.invalid.join());
  s = resolve({ videoEdit: "yes" });
  assert.equal(s.disabledReason, "INVALID_VIDEO_EDIT_BLOCK");
  s = resolve({ videoEdit: { limits: { minDurationSec: 30, maxDurationSec: 20 } } });
  assert.equal(s.enabled, false);
  assert.deepEqual(S.validateWhenPresent({ caps: { dailyUsdCap: "x" } }), ["INVALID_caps.dailyUsdCap"]);
  assert.deepEqual(S.validateWhenPresent(undefined), []);
});

t("a present, valid videoEdit block overrides only what it names", () => {
  const s = resolve({ videoEdit: { limits: { maxUploadMb: 800, perUser: { maxRunning: 2 } }, caps: { maxUsdPerProject: 1 }, providers: { stt: { order: ["kie", "openrouter"] }, llm: { stageModels: { ve_director: "m/d" } } } } });
  assert.equal(s.enabled, true, s.disabledReason);
  assert.equal(s.limits.maxUploadMb, 800);
  assert.equal(s.limits.maxDurationSec, 300);
  assert.equal(s.limits.perUser.maxRunning, 2);
  assert.equal(s.limits.perUser.maxQueued, 2);
  assert.equal(s.caps.maxUsdPerProject, 1);
  assert.deepEqual(s.providers.stt.order, ["kie", "openrouter"]);
  assert.equal(s.providers.llm.stageModels.ve_director, "m/d");
  assert.equal(s.providers.llm.stageModels.ve_qa, null);
});

section("settings — placement, faults, overrides");

t("storage dir inside public / videos / jobs / uploads, or containing the root, disables the feature", () => {
  assert.equal(resolve({ env: { VIDEO_EDIT_DIR: "public/edits" } }).disabledReason, "DIR_INSIDE_PUBLIC");
  assert.equal(resolve({ env: { VIDEO_EDIT_DIR: path.join(root, "jobs", "x") } }).disabledReason, "DIR_INSIDE_JOBS");
  assert.equal(resolve({ env: { VIDEO_EDIT_DIR: "uploads" } }).disabledReason, "DIR_INSIDE_UPLOADS");
  assert.equal(resolve({ env: { VIDEO_EDIT_DIR: "." } }).disabledReason, "DIR_CONTAINS_ROOT");
  assert.equal(resolve({ env: { VIDEO_EDIT_DIR: path.dirname(root) } }).disabledReason, "DIR_CONTAINS_ROOT");
  assert.equal(resolve({ env: { VIDEO_EDIT_INDEX: "public/video-edits.json" } }).disabledReason, "INDEX_INSIDE_PUBLIC");
  if (process.platform === "win32") {
    assert.equal(resolve({ env: { VIDEO_EDIT_DIR: path.join(root.toUpperCase(), "PUBLIC", "e") } }).enabled, false, "case-variant still refused");
  }
});

t("faults allowed outside production; in production only with VIDEO_EDIT_FAULTS_ALLOW=1 or config allow", () => {
  assert.equal(resolve().faults.allow, true);
  assert.equal(resolve({ env: { NODE_ENV: "production" } }).faults.allow, false);
  assert.equal(resolve({ env: { NODE_ENV: "production", VIDEO_EDIT_FAULTS_ALLOW: "1" } }).faults.allow, true);
  assert.equal(resolve({ env: { NODE_ENV: "production" }, videoEdit: { faults: { allow: true } } }).faults.allow, true);
});

t("provider base overrides are honoured only outside production", () => {
  const env = { VIDEO_EDIT_OPENROUTER_BASE: "http://127.0.0.1:9/or", VIDEO_EDIT_KIE_BASE: "http://127.0.0.1:9/kie" };
  assert.deepEqual({ ...resolve({ env }).providerBaseOverride }, { openrouter: env.VIDEO_EDIT_OPENROUTER_BASE, kie: env.VIDEO_EDIT_KIE_BASE });
  assert.deepEqual({ ...resolve({ env: { ...env, NODE_ENV: "production" } }).providerBaseOverride }, { openrouter: null, kie: null });
});

t("getSettings memoizes; reloadSettings swaps injected sources", () => {
  const a = S.reloadSettings({ config: cfg({ concurrency: 3 }), env: { NODE_ENV: "test" }, cpus: 2 });
  assert.equal(a.concurrency, 3);
  assert.strictEqual(S.getSettings(), a);
  const b = S.reloadSettings({ config: cfg(), env: { NODE_ENV: "test" }, cpus: 2 });
  assert.notStrictEqual(b, a);
  assert.equal(b.concurrency, 1);
  assert.equal(makeSettings(root).paths.dir, path.join(root, "edits"), "test helper resolves the same way");
});

section("settings_schema");

t("empty input → full defaults; partial input deep-merges; unknown keys stripped", () => {
  const r = normalizeSettings({});
  assert.equal(r.ok, true, r.errors.join());
  assert.deepEqual(JSON.parse(JSON.stringify(r.value)), JSON.parse(JSON.stringify(DEFAULT_SETTINGS)));
  const p = normalizeSettings({ captions: { styleId: "clean" }, broll: { intensity: "high" }, hacker: true, output: { aspect: "9:16", evil: 1 } });
  assert.equal(p.ok, true, p.errors.join());
  assert.equal(p.value.captions.styleId, "clean");
  assert.equal(p.value.captions.maxWordsPerLine, 3, "sibling default kept");
  assert.equal(p.value.broll.intensity, "high");
  assert.equal(p.value.hacker, undefined);
  assert.equal(p.value.output.evil, undefined);
});

t("invalid values report dotted paths; JSON strings accepted; bad JSON rejected", () => {
  const r = normalizeSettings({ captions: { maxWordsPerLine: 7 }, language: "xx", brand: { palette: { primary: "red", source: "manual" } } });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.startsWith("captions.maxWordsPerLine")), r.errors.join());
  assert.ok(r.errors.some((e) => e.startsWith("language")));
  assert.ok(r.errors.some((e) => e.startsWith("brand.palette.primary")));
  assert.equal(normalizeSettings('{"removeFillers":"aggressive"}').value.removeFillers, "aggressive");
  assert.deepEqual(normalizeSettings("{nope").errors, ["settings: not valid JSON"]);
  assert.equal(normalizeSettings([1, 2]).ok, false);
});

t("debugFaults only when allowed; maxCostUsd capped; prototype keys ignored; palette nullable", () => {
  assert.equal(normalizeSettings({ debugFaults: "disk:full" }).value.debugFaults, undefined);
  assert.equal(normalizeSettings({ debugFaults: "disk:full" }, { allowDebugFaults: true }).value.debugFaults, "disk:full");
  assert.equal(normalizeSettings({ maxCostUsd: 2 }, { maxUsdCap: 0.5 }).ok, false);
  assert.equal(normalizeSettings({ maxCostUsd: 0.25 }, { maxUsdCap: 0.5 }).value.maxCostUsd, 0.25);
  const polluted = normalizeSettings(JSON.parse('{"__proto__":{"polluted":true},"music":{"enabled":false}}'));
  assert.equal(polluted.ok, true);
  assert.equal({}.polluted, undefined);
  assert.equal(polluted.value.music.enabled, false);
  const withPalette = normalizeSettings({ brand: { palette: { primary: "#112233", source: "manual" } } });
  assert.equal(withPalette.value.brand.palette.primary, "#112233");
  assert.equal(withPalette.value.brand.logo.placement, "tr");
  assert.equal(normalizeSettings({ brand: { palette: null } }).value.brand.palette, null);
  assert.equal(normalizeSettings({ consent: { thirdPartyAi: true, termsVersion: "2026-09" } }).value.consent.thirdPartyAi, true);
});

section("errors & ids");

t("EditError defaults, class validation, detail capping", () => {
  const e = new EditError("PROC_EXIT", { detail: "x".repeat(2000), errorClass: "nonsense" });
  assert.ok(isEditError(e) && e instanceof Error);
  assert.equal(e.status, 500);
  assert.equal(e.errorClass, "bug");
  assert.equal(e.retryable, false);
  assert.equal(e.detail.length, 600);
  assert.equal(e.message, "A processing step failed.");
  assert.equal(isEditError(new Error("x")), false);
  assert.equal(isEditError(null), false);
});

t("toErrorBody carries code, safe message, retryable, requestId, extra as details — never detail or stack", () => {
  const e = new EditError("MEDIA_REJECTED", { status: 422, errorClass: "input", detail: "C:\\secret\\path.mp4 stderr", extra: { reason: "DURATION_TOO_LONG" } });
  const body = toErrorBody(e, "req_1");
  assert.deepEqual(body, { error: "MEDIA_REJECTED", message: "Not a supported video.", retryable: false, requestId: "req_1", details: { reason: "DURATION_TOO_LONG" } });
  assert.ok(!JSON.stringify(body).includes("secret"));
  const internal = toErrorBody(new Error("ENOENT C:\\Users\\me\\file"), "req_2");
  assert.deepEqual(internal, { error: "INTERNAL", message: "Something went wrong.", retryable: false, requestId: "req_2" });
  assert.equal(toErrorBody(new EditError("RATE_LIMITED", { status: 429, retryable: true })).retryable, true);
});

t("ids have the documented shapes and do not collide", () => {
  const set = new Set();
  for (let i = 0; i < 2000; i++) {
    const id = ids.newProjectId();
    assert.ok(ids.isProjectId(id), id);
    set.add(id);
  }
  assert.equal(set.size, 2000);
  assert.match(ids.newId("cut"), /^cut_[0-9a-z]{8}$/);
  assert.match(ids.newRunId(), /^run_[0-9a-z]{8}$/);
  assert.match(ids.newRenderId(), /^rd_[0-9a-z]{8}$/);
  for (const bad of ["ve_ABCDEFGHIJKLMNOP", "ve_123", "xx_0123456789abcdef", "ve_0123456789abcdef ", null, 7]) assert.equal(ids.isProjectId(bad), false);
  assert.throws(() => ids.newId("../x"));
});

section("events");

t("publish/subscribe: monotonic seq, seq in data, unsubscribe, throwing listener isolated", () => {
  const settings = makeSettings(path.join(root, "ev1"));
  const store = createStore({ settings, log: { info() {}, warn() {}, error() {} } });
  store.init();
  const { id } = store.createProject({ ownerId: "u1" });
  const bus = createEventBus({ store, settings });
  const got = [];
  bus.subscribe(id, () => { throw new Error("bad listener"); });
  const off = bus.subscribe(id, (e) => got.push(e));
  assert.equal(bus.listenerCount(id), 2);
  const s1 = bus.publish(id, "stage", { stage: "VALIDATING", status: "running" });
  const s2 = bus.publish(id, "discovery", { words: 10 });
  assert.equal(s2, s1 + 1);
  assert.deepEqual(got.map((e) => [e.seq, e.type, e.data.seq]), [[s1, "stage", s1], [s2, "discovery", s2]]);
  off(); off();
  assert.equal(bus.listenerCount(id), 1);
  bus.publish(id, "stage", {});
  assert.equal(got.length, 2);
  assert.equal(bus.publish("not-an-id", "stage", {}), 0);
  store.close();
});

t("the on-disk trail is sanitized, progress-throttled, resumes seq, and rotates once at 5 MB", () => {
  const settings = makeSettings(path.join(root, "ev2"));
  const store = createStore({ settings, log: { info() {}, warn() {}, error() {} } });
  store.init();
  const { id } = store.createProject({ ownerId: "u1" });
  const bus = createEventBus({ store, settings });
  bus.publish(id, "discovery", { hook: "my secret transcript words", file: "C:\\Users\\me\\clip.mp4", stage: "TRANSCRIBING", code: "TIMING_APPROX", status: "running" });
  bus.publish(id, "stage", { stage: "not a stage!", code: "lower case", status: "x y" });
  for (let i = 0; i < 10; i++) bus.publish(id, "progress", { stage: "COMPRESSING", pct: i });
  const logFile = path.join(store.projectDir(id), "logs", "events.jsonl");
  const text = fs.readFileSync(logFile, "utf8");
  assert.ok(!text.includes("secret") && !text.includes("clip.mp4") && !text.includes("Users"), text);
  const lines = text.trim().split("\n").map((l) => JSON.parse(l));
  assert.deepEqual(Object.keys(lines[0]).sort(), ["code", "seq", "stage", "status", "t", "type"]);
  assert.deepEqual(Object.keys(lines[1]).sort(), ["seq", "t", "type"]);
  assert.equal(lines.filter((l) => l.type === "progress").length, 1, "progress logged at most once per 5 s");

  const lastLogged = lines[lines.length - 1].seq;
  const lastPublished = 12;                          // 1 discovery + 1 stage + 10 progress
  assert.ok(lastLogged < lastPublished, "throttled progress is not in the trail");
  const bus2 = createEventBus({ store, settings });
  assert.ok(bus2.publish(id, "stage", {}) > lastPublished, "seq resumes above everything already published, not just what was logged");

  fs.writeFileSync(logFile, `${"x".repeat(5 * 1024 * 1024 - 10)}\n`);
  const bus3 = createEventBus({ store, settings });
  bus3.publish(id, "stage", { stage: "RENDERING" });
  assert.ok(fs.existsSync(`${logFile}.1`));
  assert.ok(fs.statSync(logFile).size < 1024);

  const gone = ids.newProjectId();
  assert.ok(bus3.publish(gone, "stage", {}) > 0);
  assert.equal(fs.existsSync(path.join(settings.paths.dir, gone)), false, "never creates a dir for an unknown project");
  store.close();
});

run().finally(() => { restoreFetch(); tmp.cleanup(); });
