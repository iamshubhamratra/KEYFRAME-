// VIDEO EDIT B-ROLL RATE LIMITS — process-wide token buckets per stock provider.
//
// WHY THIS EXISTS. Stock keys are shared by every edit project AND the template pipeline, and the
// providers' quotas are small (Pexels 200/h, Pixabay 100/60 s, Openverse anonymous bursts). Several
// projects searching at once would otherwise burn an hour of Pexels quota in seconds and every
// project would then eat 429s. A bucket per provider, shared by the whole process, spaces requests;
// waiters are served strictly FIFO, can be aborted (cancel) and give up after `maxWaitMs` so a
// starved provider is skipped instead of eating the stage budget. A 429 or an exhausted-quota header
// `penalize()`s the bucket until the provider says it resets.
//
// CONTRACT:
//   createTokenBucket({ name, capacity, windowMs, concurrency=Infinity, now=Date.now })
//     .acquire({ signal, maxWaitMs }) -> Promise<release()>   (release is idempotent)
//        rejects EditError CANCELLED (cancelled) on abort, RATE_LIMIT_WAIT (transient) after maxWaitMs
//     .penalize(untilMs) · .state() -> { tokens, waiting, active, pausedUntil }
//   getLimiter(name, cfg) -> bucket (process-wide; a changed capacity/window/concurrency reconfigures it in place)
//   bucket.reconfigure({ capacity, windowMs, concurrency }) -> tokens clamped to the new capacity
//   withLimiter(name, cfg, fn, { signal, maxWaitMs }) -> fn() result (token + concurrency slot held)
//   resetLimiters()   (tests)

const { EditError } = require("../errors");

function createTokenBucket({ name = "bucket", capacity = 1, windowMs = 1000, concurrency = Infinity, now = Date.now } = {}) {
  let cap = Math.max(1, Number(capacity) || 1);
  let win = Math.max(1, Number(windowMs) || 1000);
  let maxActive = Number.isFinite(concurrency) && concurrency > 0 ? Math.floor(concurrency) : Infinity;
  let perTokenMs = win / cap;
  let tokens = cap;
  let last = now();
  let active = 0;
  let pausedUntil = 0;
  let timer = null;
  const queue = [];

  function refill() {
    const t = now();
    if (t > last) {
      tokens = Math.min(cap, tokens + (t - last) / perTokenMs);
      last = t;
    }
  }

  function arm(ms) {
    if (timer) return;
    // Not unref'd: a timer is only armed while someone waits, and that wait is real pending work.
    timer = setTimeout(() => { timer = null; pump(); }, Math.max(1, Math.ceil(ms)));
  }

  function pump() {
    refill();
    while (queue.length) {
      const t = now();
      if (t < pausedUntil) { arm(pausedUntil - t); return; }
      if (active >= maxActive) return; // a release pumps again
      if (tokens < 1) { arm((1 - tokens) * perTokenMs); return; }
      const w = queue.shift();
      tokens -= 1;
      active += 1;
      w.settle();
      let released = false;
      w.resolve(() => {
        if (released) return;
        released = true;
        active = Math.max(0, active - 1);
        if (queue.length) pump();
      });
    }
  }

  function acquire({ signal = null, maxWaitMs = null } = {}) {
    return new Promise((resolve, reject) => {
      if (signal && signal.aborted) {
        reject(new EditError("CANCELLED", { status: 409, errorClass: "cancelled", detail: `${name} wait aborted` }));
        return;
      }
      const w = { resolve, reject, settle: () => {} };
      let waitTimer = null;
      const onAbort = () => {
        remove();
        reject(new EditError("CANCELLED", { status: 409, errorClass: "cancelled", detail: `${name} wait aborted` }));
      };
      const remove = () => {
        const i = queue.indexOf(w);
        if (i >= 0) queue.splice(i, 1);
        w.settle();
        // Nobody left waiting: drop the refill timer (on a 1 h bucket it would pin the process for an hour).
        if (!queue.length && timer) { clearTimeout(timer); timer = null; }
      };
      w.settle = () => {
        if (waitTimer) { clearTimeout(waitTimer); waitTimer = null; }
        if (signal) signal.removeEventListener("abort", onAbort);
      };
      if (signal) signal.addEventListener("abort", onAbort, { once: true });
      if (Number.isFinite(maxWaitMs) && maxWaitMs >= 0) {
        waitTimer = setTimeout(() => {
          remove();
          reject(new EditError("RATE_LIMIT_WAIT", {
            status: 429, errorClass: "transient", retryable: true, detail: `${name} bucket wait > ${maxWaitMs}ms`,
            extra: { provider: name, waitedMs: maxWaitMs },
          }));
        }, maxWaitMs);
      }
      queue.push(w);
      pump();
    });
  }

  function penalize(untilMs) {
    if (!Number.isFinite(untilMs)) return;
    if (untilMs > pausedUntil) pausedUntil = untilMs;
    if (timer) { clearTimeout(timer); timer = null; }
    pump();
  }

  function state() {
    refill();
    return { name, tokens: Math.floor(tokens * 1000) / 1000, waiting: queue.length, active, pausedUntil, capacity: cap, windowMs: win, concurrency: maxActive };
  }

  function reconfigure({ capacity: c, windowMs: w, concurrency: k } = {}) {
    refill();
    if (Number(c) > 0) cap = Math.max(1, Number(c));
    if (Number(w) > 0) win = Math.max(1, Number(w));
    if (k !== undefined) maxActive = Number.isFinite(k) && k > 0 ? Math.floor(k) : Infinity;
    perTokenMs = win / cap;
    tokens = Math.min(tokens, cap);
    api.capacity = cap; api.windowMs = win; api.concurrency = maxActive;
    if (timer) { clearTimeout(timer); timer = null; }
    pump();
  }

  const api = { name, acquire, penalize, state, reconfigure, capacity: cap, windowMs: win, concurrency: maxActive };
  return api;
}

const limiters = new Map();

function getLimiter(name, cfg = {}) {
  const key = String(name || "default");
  let b = limiters.get(key);
  if (!b) {
    b = createTokenBucket({ name: key, ...(cfg || {}) });
    limiters.set(key, b);
  } else if (cfg && typeof cfg === "object") {
    const conc = Number.isFinite(cfg.concurrency) && cfg.concurrency > 0 ? Math.floor(cfg.concurrency) : (cfg.concurrency === undefined ? b.concurrency : Infinity);
    const capN = Number(cfg.capacity) > 0 ? Math.max(1, Number(cfg.capacity)) : b.capacity;
    const winN = Number(cfg.windowMs) > 0 ? Math.max(1, Number(cfg.windowMs)) : b.windowMs;
    if (capN !== b.capacity || winN !== b.windowMs || conc !== b.concurrency) b.reconfigure({ capacity: capN, windowMs: winN, concurrency: conc });
  }
  return b;
}

async function withLimiter(name, cfg, fn, { signal = null, maxWaitMs = null } = {}) {
  const release = await getLimiter(name, cfg).acquire({ signal, maxWaitMs });
  try { return await fn(); } finally { release(); }
}

function resetLimiters() { limiters.clear(); }

module.exports = { createTokenBucket, getLimiter, withLimiter, resetLimiters };
