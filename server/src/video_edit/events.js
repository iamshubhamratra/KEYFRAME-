// VIDEO EDIT EVENT BUS — per-project live events for SSE, plus a sanitized on-disk trail.
//
// WHY THIS EXISTS. The analysis screen streams stage changes, discoveries and render progress
// over SSE (API.md §5). Several browser tabs can watch one project, the engine publishes from
// many modules, and a reconnecting client needs a monotonically increasing `seq` to discard
// duplicates — including across a server restart, so the counter resumes from the last event
// written to logs/events.jsonl. That log is a support trail, so it is SANITIZED: only the event
// type, stage, status and error code (each matched against a strict pattern) — never transcript
// text, filenames, provider payloads or keys. It is capped at 5 MB and rotated once.
//
// CONTRACT:
//   createEventBus({ store, settings }) -> { publish(projectId, type, data) -> seq,
//                                            subscribe(projectId, fn) -> unsubscribe, listenerCount(projectId) }
//   listeners receive { seq, type, t, data } where data carries the same `seq`.
//   getEventBus() singleton (real store + settings).
// Fail-open: a listener that throws or a log write that fails never breaks publish().

const fs = require("node:fs");
const path = require("node:path");
const ids = require("./ids");

const LOG_CAP_BYTES = 5 * 1024 * 1024;
const PROGRESS_LOG_EVERY_MS = 5000;
const TAIL_BYTES = 4096;
// Progress events are throttled out of the trail, so the last LOGGED seq can trail the last
// PUBLISHED one by however many progress events fit in one throttle window (≤2/s → ~10). Resuming
// with a wide gap keeps seq strictly increasing across a restart without logging every event.
const RESUME_GAP = 100000;

const isPlain = (v) => !!v && typeof v === "object" && !Array.isArray(v);

function sanitizeLine(t, seq, type, data) {
  const line = { t, seq, type: /^[a-z_]{1,32}$/.test(type) ? type : "other" };
  if (typeof data.stage === "string" && /^[A-Z][A-Z0-9_]{1,40}$/.test(data.stage)) line.stage = data.stage;
  if (typeof data.status === "string" && /^[A-Za-z_]{2,32}$/.test(data.status)) line.status = data.status;
  if (typeof data.code === "string" && /^[A-Z][A-Z0-9_]{1,63}$/.test(data.code)) line.code = data.code;
  return line;
}

function createEventBus({ store = null, settings = null } = {}) {
  const listeners = new Map();
  const seqs = new Map();
  const sizes = new Map();
  const lastProgressLog = new Map();

  function dirOf(id) {
    if (store && typeof store.projectDir === "function") return store.projectDir(id);
    if (settings && settings.paths) return path.join(settings.paths.dir, id);
    return null;
  }

  function logFile(id) {
    const d = dirOf(id);
    return d ? path.join(d, "logs", "events.jsonl") : null;
  }

  // Resume the counter from the last line on disk so a restart never sends seq backwards.
  function initialSeq(id) {
    const file = logFile(id);
    if (!file) return 0;
    let fd = null;
    try {
      fd = fs.openSync(file, "r");
      const { size } = fs.fstatSync(fd);
      const n = Math.min(TAIL_BYTES, size);
      const buf = Buffer.alloc(n);
      fs.readSync(fd, buf, 0, n, size - n);
      const lines = buf.toString("utf8").split("\n").filter(Boolean).reverse();
      for (const l of lines) {
        try { const j = JSON.parse(l); if (Number.isInteger(j.seq)) return j.seq + RESUME_GAP; } catch { /* partial line */ }
      }
    } catch { /* no log yet */ }
    finally { if (fd != null) { try { fs.closeSync(fd); } catch { /* noop */ } } }
    return 0;
  }

  function appendLog(id, line) {
    const file = logFile(id);
    if (!file) return;
    try {
      const pdir = path.dirname(path.dirname(file));
      if (!fs.existsSync(pdir)) return;              // deleted / trashed project: nothing to trail
      fs.mkdirSync(path.dirname(file), { recursive: true });
      let size = sizes.get(id);
      if (size === undefined) { try { size = fs.statSync(file).size; } catch { size = 0; } }
      const text = `${JSON.stringify(line)}\n`;
      if (size + text.length > LOG_CAP_BYTES) {
        try { fs.renameSync(file, `${file}.1`); } catch { /* keep appending to the old one */ }
        size = 0;
      }
      fs.appendFileSync(file, text);
      sizes.set(id, size + Buffer.byteLength(text));
    } catch { /* fail-open */ }
  }

  function publish(projectId, type, data = {}) {
    if (!ids.isProjectId(projectId) || typeof type !== "string" || !type) return 0;
    const seq = (seqs.has(projectId) ? seqs.get(projectId) : initialSeq(projectId)) + 1;
    seqs.set(projectId, seq);
    const t = Date.now();
    const payload = { ...(isPlain(data) ? data : {}), seq };
    const evt = { seq, type, t, data: payload };
    const set = listeners.get(projectId);
    if (set) {
      for (const fn of [...set]) {
        try { fn(evt); } catch { /* one broken listener must not starve the others */ }
      }
    }
    let log = true;
    if (type === "progress") {
      const last = lastProgressLog.get(projectId) || 0;
      log = t - last >= PROGRESS_LOG_EVERY_MS;
      if (log) lastProgressLog.set(projectId, t);
    }
    if (log) appendLog(projectId, sanitizeLine(t, seq, type, payload));
    return seq;
  }

  function subscribe(projectId, fn) {
    if (!ids.isProjectId(projectId) || typeof fn !== "function") return () => {};
    let set = listeners.get(projectId);
    if (!set) { set = new Set(); listeners.set(projectId, set); }
    set.add(fn);
    let done = false;
    return () => {
      if (done) return;
      done = true;
      const s = listeners.get(projectId);
      if (!s) return;
      s.delete(fn);
      if (!s.size) listeners.delete(projectId);
    };
  }

  function listenerCount(projectId) {
    const s = listeners.get(projectId);
    return s ? s.size : 0;
  }

  return { publish, subscribe, listenerCount };
}

let singleton = null;
function getEventBus() {
  if (!singleton) {
    const { getSettings } = require("./settings");
    const { getStore } = require("./store");
    singleton = createEventBus({ store: getStore(), settings: getSettings() });
  }
  return singleton;
}

module.exports = { createEventBus, getEventBus, sanitizeLine };
