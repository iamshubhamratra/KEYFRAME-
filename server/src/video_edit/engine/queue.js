// VIDEO EDIT JOB QUEUE — one lane for edit pipelines, plus CPU slots shared with template renders.
//
// WHY THIS EXISTS. The host is a 2-core machine that already renders template films. An edit
// pipeline is mostly waiting on the network (STT, LLM, vision) but has a few ffmpeg-heavy stages
// (COMPRESSING, RENDERING, …) that would starve a template render if both ran flat out. So there
// are two gates (ENGINE.md §5.3):
//   1. A PQueue lane (`settings.concurrency`, renders priority 1 before pipelines 0) that bounds
//      how many edit jobs are in flight at all.
//   2. A heavy-CPU slot semaphore: an ffmpeg-heavy stage waits while
//      `templateActive + heavyRunning >= heavySlots`, reading the template queue's running count
//      read-only (db.activeCount()). Waiting forever would let a busy template queue starve edits,
//      so after `heavyMaxWaitMs` (600 s) the stage runs anyway, told to run at low priority with
//      capped threads. Network stages never take a slot.
// Waiters are served FIFO, re-checked on every release and on a poll (the template count changes
// outside this module). A waiter whose signal aborts leaves the line immediately.
//
// CONTRACT:
//   createQueue({ settings, getTemplateActiveCount = () => db.activeCount() (lazy, fail → 0), now,
//                 heavyMaxWaitMs = 600000, pollMs = 1000 }) -> {
//     add(fn, { priority=0, label }) -> Promise<fn result>   (fn receives { waitedMs }; clear() rejects
//                                                            not-yet-started jobs with QUEUE_CLEARED)
//     heavy(fn, { label, onWait, signal }) -> Promise<fn result>
//        fn receives { lowPriority, waitedMs, threads }; lowPriority:true (threads 2) after the max wait.
//        onWait({ templateActive, heavyRunning, heavySlots, position }) is called once when it must wait.
//        Aborted while waiting → EditError CANCELLED (class cancelled).
//     depth() · active() · heavyWaiting() · heavyRunning() · position(label) · pause() · start() · clear() · onIdle()
//   }

const { EditError } = require("../errors");

const DEFAULT_HEAVY_MAX_WAIT_MS = 600 * 1000;
const DEFAULT_POLL_MS = 1000;
const FORCED_THREADS = 2;

function loadPQueue() {
  const mod = require("p-queue");
  return mod.default || mod;
}

// Read-only peek at the template job queue. Required lazily: db.js loads config (and .env) and
// must never be pulled in by a module that only needs a number; any failure means "no template load".
function defaultTemplateActiveCount() {
  try { return require("../../db").activeCount(); } catch { return 0; }
}

function createQueue({
  settings,
  getTemplateActiveCount = defaultTemplateActiveCount,
  now = Date.now,
  heavyMaxWaitMs = DEFAULT_HEAVY_MAX_WAIT_MS,
  pollMs = DEFAULT_POLL_MS,
} = {}) {
  const PQueue = loadPQueue();
  const concurrency = Math.max(1, Number(settings && settings.concurrency) || 1);
  const heavySlots = Math.max(1, Number(settings && settings.heavySlots) || 1);
  const pq = new PQueue({ concurrency });
  const waiting = new Set();          // add() items not started yet (for clear() and position())
  let seq = 0;

  function add(fn, { priority = 0, label = null } = {}) {
    const item = { label, priority: Number(priority) || 0, seq: ++seq, enqueuedAt: now(), cleared: false };
    const promise = new Promise((resolve, reject) => { item.resolve = resolve; item.reject = reject; });
    waiting.add(item);
    pq.add(async () => {
      if (item.cleared) return;
      waiting.delete(item);
      try { item.resolve(await fn({ waitedMs: Math.max(0, now() - item.enqueuedAt) })); }
      catch (e) { item.reject(e); }
    }, { priority: item.priority }).catch(() => { /* the wrapper never throws; defensive */ });
    return promise;
  }

  function position(label) {
    const order = [...waiting].sort((a, b) => (b.priority - a.priority) || (a.seq - b.seq));
    const i = order.findIndex((x) => x.label === label);
    return i < 0 ? null : i + 1;
  }

  function clear() {
    pq.clear();
    for (const item of waiting) {
      item.cleared = true;
      item.reject(new EditError("QUEUE_CLEARED", { status: 503, errorClass: "cancelled", retryable: true }));
    }
    waiting.clear();
  }

  // ---- heavy-CPU slots ---------------------------------------------------------------------
  let running = 0;
  const waiters = [];
  let pollTimer = null;

  function templateActive() {
    try {
      const n = Number(getTemplateActiveCount());
      return Number.isFinite(n) && n > 0 ? n : 0;
    } catch { return 0; }
  }

  function grant(w, forced) {
    running++;
    if (w.signal) w.signal.removeEventListener("abort", w.onAbort);
    w.resolve({ lowPriority: forced, waitedMs: Math.max(0, now() - w.since), threads: forced ? FORCED_THREADS : null });
  }

  function pump() {
    while (waiters.length) {
      const head = waiters[0];
      if (templateActive() + running < heavySlots) { waiters.shift(); grant(head, false); continue; }
      if (now() - head.since >= heavyMaxWaitMs) { waiters.shift(); grant(head, true); continue; }
      break;
    }
    if (waiters.length && !pollTimer) {
      // Deliberately NOT unref'd: a stage waiting for a slot is real pending work.
      pollTimer = setInterval(pump, Math.max(10, pollMs));
    } else if (!waiters.length && pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function acquire({ label, onWait, signal }) {
    if (signal && signal.aborted) return Promise.reject(cancelled(label));
    if (!waiters.length && templateActive() + running < heavySlots) {
      running++;
      return Promise.resolve({ lowPriority: false, waitedMs: 0, threads: null });
    }
    return new Promise((resolve, reject) => {
      const w = { label, since: now(), resolve, signal, onAbort: null };
      w.onAbort = () => {
        const i = waiters.indexOf(w);
        if (i >= 0) waiters.splice(i, 1);
        reject(cancelled(label));
        pump();
      };
      if (signal) signal.addEventListener("abort", w.onAbort, { once: true });
      waiters.push(w);
      if (typeof onWait === "function") {
        try { onWait({ templateActive: templateActive(), heavyRunning: running, heavySlots, position: waiters.length }); }
        catch { /* progress is an enhancement */ }
      }
      pump();
    });
  }

  async function heavy(fn, { label = null, onWait = null, signal = null } = {}) {
    const slot = await acquire({ label, onWait, signal });
    try { return await fn(slot); }
    finally { running = Math.max(0, running - 1); pump(); }
  }

  function cancelled() {
    return new EditError("CANCELLED", { status: 409, errorClass: "cancelled", detail: "aborted while waiting for a heavy slot" });
  }

  return {
    add,
    heavy,
    position,
    clear,
    depth: () => pq.size,
    active: () => pq.pending,
    heavyWaiting: () => waiters.length,
    heavyRunning: () => running,
    heavySlots: () => heavySlots,
    pause: () => pq.pause(),
    start: () => pq.start(),
    onIdle: () => pq.onIdle(),
  };
}

module.exports = { createQueue, defaultTemplateActiveCount, DEFAULT_HEAVY_MAX_WAIT_MS };
