// BATCH STORE — the record of one "generate N templates" run.
//
// Same debounced tmp+rename JSON idiom as templates/store.js and auth/store.js, and separate from
// the template store for the same reason that one is separate from db.js: a batch has its own
// lifecycle, its own crash-recovery rule, and its own shape, and folding it into the template rows
// would make "list templates" carry orchestration state nobody reading a template cares about.
//
// THE BATCH RECORD IS A LEDGER, NOT AN AUTHORITY. Whether a template exists, passed QA or is live
// is decided by the template store and the filesystem, exactly as before. This file records what
// the orchestrator decided and when, so a run can be watched, audited, resumed after a crash and
// explained afterwards.

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const config = require("../config");

const DIR = path.join(config.paths.root, "data");
const FILE = path.join(DIR, "template_batches.json");

const STATUS = Object.freeze({
  QUEUED: "QUEUED",
  PLANNING: "PLANNING",              // the design-strategy call
  GENERATING: "GENERATING",
  QUALITY_CHECK: "QUALITY_CHECK",
  PUBLISHING: "PUBLISHING",
  COMPLETED: "COMPLETED",            // every requested template published
  PARTIAL_SUCCESS: "PARTIAL_SUCCESS", // some published, some failed or rejected
  FAILED: "FAILED",                  // nothing published
  CANCELLED: "CANCELLED",
});

// Per-item states. `REJECTED` is deliberately distinct from `FAILED`: the template generated
// perfectly well and was refused for being too much like something that already exists, which is
// the system working, not breaking.
const ITEM = Object.freeze({
  WAITING: "WAITING",
  GENERATING: "GENERATING",
  TESTING: "TESTING",
  QUALITY_CHECK: "QUALITY_CHECK",
  PUBLISHING: "PUBLISHING",
  PUBLISHED: "PUBLISHED",
  REJECTED: "REJECTED",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
});

const TERMINAL = new Set([STATUS.COMPLETED, STATUS.PARTIAL_SUCCESS, STATUS.FAILED, STATUS.CANCELLED]);
const ITEM_TERMINAL = new Set([ITEM.PUBLISHED, ITEM.REJECTED, ITEM.FAILED, ITEM.CANCELLED]);

let state = { batches: [] };
try {
  const parsed = JSON.parse(fs.readFileSync(FILE, "utf8"));
  if (parsed && Array.isArray(parsed.batches)) state.batches = parsed.batches;
} catch { /* fresh store */ }

// CRASH RECOVERY. A batch is held by a promise in this process; if the process dies the row would
// otherwise sit in GENERATING forever and its templates would look perpetually in-flight. The
// honest landing place is CANCELLED — the work genuinely stopped — with every unfinished item
// marked so the admin can see exactly how far it got. Templates that were already published stay
// published: they are real, and nothing here touches the filesystem.
// Age-gated for the same reason templates/store.js is: this module is loaded by short-lived
// scripts as well as by the server, and an unconditional sweep would have one of them CANCEL a
// batch another process is actively running. A live batch writes progress continuously, so
// silence is the signal. server.js forces a full sweep at boot, where it is safe.
const STALE_MS = 30 * 60 * 1000;

function recoverInterrupted({ force = false, ids = null } = {}) {
  let n = 0;
  const now = Date.now();
  const only = ids ? new Set(ids) : null;      // the guard's scalpel: sweep these rows and no others
  for (const b of state.batches) {
    if (only && !only.has(b.id)) continue;
    if (TERMINAL.has(b.status)) continue;
    if (!force && now - Math.max(b.startedAt || 0, lastTouch(b)) < STALE_MS) continue;
    b.status = STATUS.CANCELLED;
    b.error = "interrupted by a server restart";
    b.completedAt = b.completedAt || Date.now();
    for (const it of b.items || []) {
      if (!ITEM_TERMINAL.has(it.state)) { it.state = ITEM.CANCELLED; it.error = it.error || "interrupted by a server restart"; }
    }
    n++;
  }
  if (n) {
    console.warn(`[template-batch] ${n} batch(es) were running at shutdown — marked CANCELLED`);
    flush();
  }
}

let writeTimer = null;
function persist() {
  if (writeTimer) return;
  writeTimer = setTimeout(() => { writeTimer = null; flush(); }, 50);
  if (writeTimer.unref) writeTimer.unref();
}

function flush() {
  try {
    fs.mkdirSync(DIR, { recursive: true });
    const tmp = `${FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2), "utf8");
    fs.renameSync(tmp, FILE);
    return true;
  } catch (e) {
    console.warn(`[template-batch] store write failed: ${e.message}`);
    return false;
  }
}

const byId = (id) => state.batches.find((b) => b.id === id) || null;

// The most recent moment anything happened in this batch — its heartbeat.
const lastTouch = (b) => Math.max(
  b.createdAt || 0,
  ...((b.items || []).map((i) => Math.max(i.startedAt || 0, i.finishedAt || 0))),
);

function create({ count, config: cfg, createdBy }) {
  const now = Date.now();
  const b = {
    id: crypto.randomUUID(),
    status: STATUS.QUEUED,
    requestedCount: count,
    // The configuration verbatim, so a batch is reproducible and auditable (§19).
    config: cfg || {},
    createdBy: createdBy || null,
    createdAt: now,
    startedAt: null,
    completedAt: null,
    // One entry per requested template, created up front so the progress UI can show the whole
    // run — including what has not started — from the first render.
    items: Array.from({ length: count }, (_, i) => ({
      index: i + 1,
      state: ITEM.WAITING,
      direction: null,          // filled by the strategy step
      name: null,
      slug: null,
      templateId: null,
      qaScore: null,
      uniqueness: null,
      similarTo: null,
      attempts: 0,
      error: null,
      startedAt: null,
      finishedAt: null,
    })),
    plan: null,
    planUsage: null,
    error: null,
    cancelRequested: false,
    progress: "Queued",
  };
  state.batches.push(b);
  flush();
  return b;
}

function get(id) { return byId(id); }

function list({ limit = 30 } = {}) {
  return state.batches.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, limit);
}

function update(id, patch = {}) {
  const b = byId(id);
  if (!b) return null;
  for (const [k, v] of Object.entries(patch)) {
    if (k === "id" || k === "createdAt" || k === "items") continue;
    b[k] = v;
  }
  persist();
  return b;
}

function updateItem(id, index, patch = {}) {
  const b = byId(id);
  if (!b) return null;
  const it = (b.items || []).find((x) => x.index === index);
  if (!it) return null;
  Object.assign(it, patch);
  persist();
  return it;
}

// Cancellation is a FLAG, not an interrupt. The orchestrator checks it between steps, so whatever
// is running — an LLM call, a render — finishes rather than being killed halfway and leaving a
// half-written pack directory behind. Templates already published stay published (§21).
function requestCancel(id) {
  const b = byId(id);
  if (!b) return null;
  if (TERMINAL.has(b.status)) return b;
  b.cancelRequested = true;
  b.progress = "Cancelling after the current step…";
  flush();
  return b;
}

// The counts the summary is made of, derived rather than incremented — a counter that is bumped in
// one place and read in another is how a batch ends up claiming nine published and showing eight.
function tally(b) {
  const items = (b && b.items) || [];
  const n = (s) => items.filter((x) => x.state === s).length;
  const scored = items.filter((x) => Number.isFinite(x.qaScore));
  const unique = items.filter((x) => Number.isFinite(x.uniqueness));
  const avg = (xs, k) => (xs.length ? Math.round(xs.reduce((a, x) => a + x[k], 0) / xs.length) : null);
  return {
    requested: b ? b.requestedCount : 0,
    published: n(ITEM.PUBLISHED),
    rejected: n(ITEM.REJECTED),
    failed: n(ITEM.FAILED),
    cancelled: n(ITEM.CANCELLED),
    inFlight: items.filter((x) => !ITEM_TERMINAL.has(x.state) && x.state !== ITEM.WAITING).length,
    waiting: n(ITEM.WAITING),
    finished: items.filter((x) => ITEM_TERMINAL.has(x.state)).length,
    avgQuality: avg(scored, "qaScore"),
    avgUniqueness: avg(unique, "uniqueness"),
  };
}

function shape(b) {
  if (!b) return null;
  const t = tally(b);
  return {
    ...b,
    tally: t,
    progressPct: b.requestedCount ? Math.round((t.finished / b.requestedCount) * 100) : 0,
    isTerminal: TERMINAL.has(b.status),
  };
}

// The final verdict, decided from what actually happened rather than from whether the loop ran to
// the end (§28: quantity is not the goal).
function finalStatusFor(b) {
  const t = tally(b);
  if (b.cancelRequested && t.published < b.requestedCount) return STATUS.CANCELLED;
  if (t.published === b.requestedCount) return STATUS.COMPLETED;
  if (t.published > 0) return STATUS.PARTIAL_SUCCESS;
  return STATUS.FAILED;
}

// Same reasoning as templates/store.js: a batch is held by a promise in this process, so anything
// still running when this file is first read was orphaned by a previous process.
recoverInterrupted();

module.exports = {
  FILE, STATUS, ITEM, TERMINAL, ITEM_TERMINAL,
  create, get, list, update, updateItem, requestCancel, tally, shape, finalStatusFor,
  recoverInterrupted, flush,
};
