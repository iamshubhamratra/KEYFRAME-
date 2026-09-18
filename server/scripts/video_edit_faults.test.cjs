// Unit tests for video_edit/faults.js and providers/breaker.js.
// Run: node scripts/video_edit_faults.test.cjs
//
// Load-bearing: in production WITHOUT VIDEO_EDIT_FAULTS_ALLOW=1 every token — global or per
// project — is inert, so a client-supplied debugFaults string can never break a real edit.

const assert = require("node:assert");
const { createHarness, mkTmp, makeSettings, installFetchTripwire } = require("./lib/video_edit_test_utils.cjs");
const F = require("../src/video_edit/faults");
const { isEditError } = require("../src/video_edit/errors");
const { getBreaker, resetBreakers, nextUtcMidnight } = require("../src/video_edit/providers/breaker");

const { t, section, run } = createHarness();
const restoreFetch = installFetchTripwire();
const tmp = mkTmp("ve-faults-");

async function rejectsWith(promise, code, check) {
  try { await promise; } catch (e) {
    assert.ok(isEditError(e), `expected EditError, got ${e && e.message}`);
    assert.equal(e.code, code);
    if (check) check(e);
    return e;
  }
  throw new Error(`expected rejection with ${code}`);
}

section("faults — grammar");

t("parses every documented token family", () => {
  const m = F.parseFaults("or_stt:429:30, kie_stt:slow:2.5,islands:approx_drift:120,vision:invalid_json,llm:budget,budget:cap:0.1,assets:keyRejected,render:chunk:3,card,disk:full,crash:TRANSCRIBING,slow:COMPRESSING:1.5,probe:timeout,normalize:exit1");
  assert.deepEqual(m.invalid, []);
  assert.deepEqual(m.get("or_stt"), { mode: "429", arg: 30 });
  assert.deepEqual(m.get("kie_stt"), { mode: "slow", arg: 2.5 });
  assert.deepEqual(m.get("islands"), { mode: "approx_drift", arg: 120 });
  assert.deepEqual(m.get("budget"), { mode: "cap", arg: 0.1 });
  assert.deepEqual(m.get("render"), { mode: "chunk", arg: 3 });
  assert.deepEqual(m.get("card"), { mode: "fail", arg: null });
  assert.deepEqual(m.get("disk"), { mode: "full", arg: null });
  assert.deepEqual(m.get("crash:TRANSCRIBING"), { mode: "crash", arg: "TRANSCRIBING" });
  assert.deepEqual(m.get("slow:COMPRESSING"), { mode: "slow", arg: 1.5 });
  assert.deepEqual(m.get("probe"), { mode: "timeout", arg: null });
  assert.deepEqual(m.get("normalize"), { mode: "exit1", arg: null });
  assert.equal(m.size, 14);
});

t("drops malformed tokens and reports them", () => {
  const m = F.parseFaults("or_stt:418,kie_stt:slow,render:chunk:x,crash:NOPE,slow:RENDERING,unknown:thing,disk,or_stt:429:1:2,,  ");
  assert.equal(m.size, 0);
  assert.equal(m.invalid.length, 8);
});

t("optional 429 retryAfter and empty / non-string input", () => {
  assert.deepEqual(F.parseFaults("or_stt:429").get("or_stt"), { mode: "429", arg: null });
  assert.equal(F.parseFaults("").size, 0);
  assert.equal(F.parseFaults(null).size, 0);
  assert.equal(F.parseFaults(42).size, 0);
});

t("last token for an area wins", () => {
  assert.deepEqual(F.parseFaults("or_stt:402,or_stt:500").get("or_stt"), { mode: "500", arg: null });
});

section("faults — allow rules");

t("production without allow → inactive (global and per-project)", () => {
  const s = makeSettings(tmp.dir, { env: { NODE_ENV: "production", VIDEO_EDIT_FAULTS: "disk:full" } });
  assert.equal(s.faults.allow, false);
  assert.equal(F.faultsAllowed(s), false);
  const project = { settings: { debugFaults: "probe:timeout" } };
  assert.equal(F.activeFaults({ settings: s, project }).size, 0);
});

t("production with VIDEO_EDIT_FAULTS_ALLOW=1 → active", () => {
  const s = makeSettings(tmp.dir, { env: { NODE_ENV: "production", VIDEO_EDIT_FAULTS_ALLOW: "1", VIDEO_EDIT_FAULTS: "disk:full" } });
  assert.equal(F.faultsAllowed(s), true);
  assert.ok(F.activeFaults({ settings: s }).has("disk"));
});

t("non-production is allowed by default; project tokens overlay global", () => {
  const s = makeSettings(tmp.dir, { env: { NODE_ENV: "development", VIDEO_EDIT_FAULTS: "or_stt:402,disk:full" } });
  const active = F.activeFaults({ settings: s, project: { settings: { debugFaults: "or_stt:500" } } });
  assert.deepEqual(active.get("or_stt"), { mode: "500", arg: null });
  assert.ok(active.has("disk"));
  assert.ok(F.activeFaults({ settings: s, project: { debugFaults: "card" } }).has("card"), "top-level debugFaults also read");
});

t("production maybeFail is a no-op even with tokens", async () => {
  const s = makeSettings(tmp.dir, { env: { NODE_ENV: "production", VIDEO_EDIT_FAULTS: "probe:timeout,disk:full,crash:VALIDATING" } });
  await F.maybeFail("probe", { settings: s });
  await F.maybeFail("disk", { settings: s });
  await F.maybeFail("crash:VALIDATING", { settings: s });
});

section("faults — maybeFail outcomes");

const dev = (tokens) => makeSettings(tmp.dir, { env: { NODE_ENV: "development", VIDEO_EDIT_FAULTS: tokens } });

t("probe:timeout → PROC_TIMEOUT (transient, retryable)", async () => {
  await rejectsWith(F.maybeFail("probe", { settings: dev("probe:timeout") }), "PROC_TIMEOUT", (e) => {
    assert.equal(e.errorClass, "transient"); assert.equal(e.retryable, true); assert.equal(e.stage, "VALIDATING");
  });
});

t("normalize:exit1 → PROC_EXIT with exitCode 1", async () => {
  await rejectsWith(F.maybeFail("normalize", { settings: dev("normalize:exit1") }), "PROC_EXIT", (e) => assert.equal(e.extra.exitCode, 1));
});

t("disk:full → INSUFFICIENT_STORAGE 507 resource", async () => {
  await rejectsWith(F.maybeFail("disk", { settings: dev("disk:full") }), "INSUFFICIENT_STORAGE", (e) => {
    assert.equal(e.status, 507); assert.equal(e.errorClass, "resource");
  });
});

t("crash:<STAGE> throws FAULT_CRASH only at that stage", async () => {
  const s = dev("crash:TRANSCRIBING");
  await F.maybeFail("crash:COMPRESSING", { settings: s });
  await rejectsWith(F.maybeFail("crash:TRANSCRIBING", { settings: s }), "FAULT_CRASH", (e) => assert.equal(e.stage, "TRANSCRIBING"));
});

t("slow:<STAGE>:<s> sleeps, and an abort signal cuts it short", async () => {
  const s = dev("slow:RENDERING:0.2");
  const t0 = Date.now();
  await F.maybeFail("slow:RENDERING", { settings: s });
  assert.ok(Date.now() - t0 >= 180, "slept");
  const ac = new AbortController();
  const s2 = dev("slow:RENDERING:30");
  setTimeout(() => ac.abort(), 50);
  const t1 = Date.now();
  await rejectsWith(F.maybeFail("slow:RENDERING", { settings: s2, signal: ac.signal }), "PROC_ABORTED");
  assert.ok(Date.now() - t1 < 2000);
});

t("provider tokens map to the error class the real failure carries", async () => {
  await rejectsWith(F.maybeFail("or_stt", { settings: dev("or_stt:429:12") }), "PROVIDER_RATE_LIMITED", (e) => {
    assert.equal(e.errorClass, "transient"); assert.equal(e.extra.retryAfterSec, 12); assert.equal(e.extra.provider, "openrouter");
  });
  await rejectsWith(F.maybeFail("or_stt", { settings: dev("or_stt:402") }), "PROVIDER_PAYMENT_REQUIRED", (e) => assert.equal(e.errorClass, "budget"));
  await rejectsWith(F.maybeFail("or_stt", { settings: dev("or_stt:401") }), "PROVIDER_AUTH", (e) => assert.equal(e.errorClass, "config"));
  await rejectsWith(F.maybeFail("or_stt", { settings: dev("or_stt:timeout") }), "PROVIDER_TIMEOUT");
  await rejectsWith(F.maybeFail("kie_stt", { settings: dev("kie_stt:create_fail") }), "PROVIDER_CREATE_FAILED", (e) => assert.equal(e.errorClass, "provider"));
  await rejectsWith(F.maybeFail("llm", { settings: dev("llm:budget") }), "AI_BUDGET_EXHAUSTED");
  await rejectsWith(F.maybeFail("assets", { settings: dev("assets:keyRejected") }), "PROVIDER_AUTH");
  await rejectsWith(F.maybeFail("card", { settings: dev("card") }), "CARD_RENDER_FAILED");
});

t("data-shaping tokens do not throw; faultFor exposes them", async () => {
  const s = dev("or_stt:drop_fillers,vision:hallucinated_ids,budget:low,assets:empty");
  await F.maybeFail("or_stt", { settings: s });
  await F.maybeFail("vision", { settings: s });
  await F.maybeFail("budget", { settings: s });
  await F.maybeFail("assets", { settings: s });
  assert.deepEqual(F.faultFor("or_stt", { settings: s }), { mode: "drop_fillers", arg: null });
  assert.equal(F.faultFor("disk", { settings: s }), null);
});

t("render:chunk:<n> throws only for that chunk; render:hang waits for abort", async () => {
  const s = dev("render:chunk:2");
  await F.maybeFail("render", { settings: s, chunk: 1 });
  await rejectsWith(F.maybeFail("render", { settings: s, chunk: 2 }), "PROC_EXIT");
  const ac = new AbortController();
  setTimeout(() => ac.abort(), 30);
  await rejectsWith(F.maybeFail("render", { settings: dev("render:hang"), signal: ac.signal }), "PROC_ABORTED");
});

section("breaker");

t("config failures open for an hour, then half-open allows exactly one probe", () => {
  resetBreakers();
  let clock = 1_000_000;
  const b = getBreaker("openrouter", { now: () => clock });
  assert.equal(b.canRequest(), true);
  b.recordFailure("config");
  assert.equal(b.state().state, "open");
  assert.equal(b.canRequest(), false);
  clock += 60 * 60 * 1000;
  assert.equal(b.state().state, "half-open");
  assert.equal(b.canRequest(), true, "one probe");
  assert.equal(b.canRequest(), false, "only one probe");
  b.recordSuccess();
  assert.equal(b.state().state, "closed");
  assert.equal(b.canRequest(), true);
});

t("transient failures trip after 3 in a row with backoff; Retry-After honoured ≤60 s", () => {
  resetBreakers();
  let clock = 0;
  const b = getBreaker("kie", { now: () => clock });
  b.recordFailure("transient"); b.recordFailure("transient");
  assert.equal(b.state().state, "closed");
  b.recordFailure("transient");
  assert.equal(b.state().state, "open");
  const first = b.state().openUntil;
  clock = first;
  assert.equal(b.canRequest(), true);
  b.recordFailure("transient");            // failed probe re-opens longer
  assert.ok(b.state().openUntil - clock > first, "backoff grows");

  resetBreakers();
  clock = 0;
  const c = getBreaker("kie", { now: () => clock });
  c.recordFailure("transient", { retryAfterSec: 600 });
  assert.equal(c.state().openUntil, 60 * 1000, "Retry-After capped at 60 s");
});

t("budget honours untilMs (UTC midnight); input/bug/cancelled never trip", () => {
  resetBreakers();
  let clock = Date.UTC(2026, 8, 14, 10, 0, 0);
  const b = getBreaker("openrouter", { now: () => clock });
  for (let i = 0; i < 10; i++) { b.recordFailure("input"); b.recordFailure("bug"); b.recordFailure("cancelled"); }
  assert.equal(b.state().state, "closed");
  b.recordFailure("budget", { untilMs: nextUtcMidnight(clock) });
  assert.equal(b.state().openUntil, Date.UTC(2026, 8, 15));
  assert.equal(getBreaker("openrouter"), b, "process-wide singleton per name");
});

run().finally(() => { restoreFetch(); resetBreakers(); tmp.cleanup(); });
