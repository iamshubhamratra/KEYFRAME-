// Dev watcher: restart server.js when src/ or server.js actually CHANGES.
//
// Why not `node --watch-path`? On Windows, libuv's directory watcher also fires
// on last-access-time updates (FILE_NOTIFY_CHANGE_LAST_ACCESS), and this repo's
// server lazy-requires its own modules at runtime — merely READING src/ made
// node --watch restart in storms, killing in-flight render jobs. This script
// stats each event's file and only restarts when mtime/size really changed.
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const SRC_DIR = path.join(ROOT, "src");
const ENTRY = path.join(ROOT, "server.js");
const DEBOUNCE_MS = 300;

// abs path -> "mtimeMs:size" — the identity of a file's last seen content.
const seen = new Map();
const sig = (st) => `${st.mtimeMs}:${st.size}`;

function seed(p) {
  const st = fs.statSync(p);
  if (st.isDirectory()) {
    for (const e of fs.readdirSync(p)) seed(path.join(p, e));
  } else {
    seen.set(p, sig(st));
  }
}
seed(SRC_DIR);
seed(ENTRY);

let child = null;
let restartQueued = false;
let timer = null;

function spawnServer() {
  child = spawn(process.execPath, ["server.js"], { cwd: ROOT, stdio: "inherit" });
  child.on("exit", (code) => {
    child = null;
    if (restartQueued) {
      restartQueued = false;
      spawnServer();
    } else {
      console.log(`[dev-watch] server exited (code ${code}) — waiting for a file change`);
    }
  });
}

// A restart KILLS every in-flight render (boot recovery fails project jobs
// outright — a user-visible loss). Before restarting, check the job store; if
// anything is queued/running, DEFER and re-check until the queue drains. All
// further changes during the wait collapse into the one pending restart.
const JOBS_FILE = path.join(ROOT, "jobs.json");
const ACTIVE = new Set(["queued", "running", "approved"]);
const RECHECK_MS = 10_000;
const MAX_DEFER_MS = 20 * 60_000; // safety ceiling: never defer forever

function activeJobCount() {
  try {
    const arr = JSON.parse(fs.readFileSync(JOBS_FILE, "utf8"));
    return Array.isArray(arr) ? arr.filter((j) => j && ACTIVE.has(j.status)).length : 0;
  } catch {
    return 0; // unreadable/missing store — don't block the restart
  }
}

let deferTimer = null;
let deferSince = 0;
let pendingReason = null;

function restart(reason) {
  pendingReason = reason;
  const active = activeJobCount();
  if (active > 0 && Date.now() - (deferSince || Date.now()) < MAX_DEFER_MS) {
    if (!deferSince) {
      deferSince = Date.now();
      console.log(`[dev-watch] ${reason} changed, but ${active} job(s) in-flight — deferring restart until the queue drains`);
    }
    clearTimeout(deferTimer);
    deferTimer = setTimeout(() => restart(pendingReason), RECHECK_MS);
    return;
  }
  if (deferSince) {
    console.log(`[dev-watch] queue idle after ${Math.round((Date.now() - deferSince) / 1000)}s — applying deferred restart`);
  }
  deferSince = 0;
  clearTimeout(deferTimer);
  console.log(`[dev-watch] ${pendingReason} changed — restarting server.js`);
  pendingReason = null;
  if (child) {
    restartQueued = true;
    child.kill();
  } else {
    spawnServer();
  }
}

function onEvent(absPath) {
  let cur = null;
  try {
    const st = fs.statSync(absPath);
    if (st.isDirectory()) return;
    cur = sig(st);
  } catch {
    // deleted — fall through with cur = null
  }
  const prev = seen.get(absPath) ?? null;
  if (cur === prev) return; // access-time-only or duplicate event — ignore
  if (cur == null) seen.delete(absPath);
  else seen.set(absPath, cur);
  clearTimeout(timer);
  timer = setTimeout(() => restart(path.relative(ROOT, absPath)), DEBOUNCE_MS);
}

fs.watch(SRC_DIR, { recursive: true }, (_ev, f) => {
  if (f) onEvent(path.resolve(SRC_DIR, f));
});
fs.watch(ENTRY, () => onEvent(ENTRY));

for (const s of ["SIGINT", "SIGTERM"]) {
  process.on(s, () => {
    if (child) child.kill();
    process.exit(0);
  });
}

console.log(`[dev-watch] watching src/ + server.js (content changes only)`);
spawnServer();
