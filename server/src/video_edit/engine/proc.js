// VIDEO EDIT PROCESS RUNNER — every ffmpeg / ffprobe child of the edit engine goes through here.
//
// WHY THIS EXISTS. An edit runs dozens of long ffmpeg children on a 2-core host that also renders
// template jobs. A child that hangs (a stalled decode, a corrupt upload, a filter graph that never
// ends) must be killed with its whole tree, a cancel must stop it within seconds, and a server
// restart must be able to find and kill children the previous process left behind. So every
// spawn here has: a hard timeout, an optional stall watchdog (no output for `stallMs`), abort-signal
// cancellation, killTree on Windows (spawn_compat), a capped stdout, a rolling stderr tail for
// diagnostics, and an entry in `_runtime/pids.json` for boot recovery (ENGINE.md §3.6, §5.2, §5.5).
// The promise settles only after the child has actually exited, so callers can clean up temp files
// without fighting Windows file locks.
//
// CONTRACT:
//   runProcess(cmd, args, { cwd, timeoutMs, stallMs, signal, onProgress, onStdoutLine, maxStdoutBytes=2e6,
//              captureStdout=true, lowPriority=false, label, pidFile, fault }) -> Promise<{ code, stdout, stderr, durationMs }>
//     throws EditError PROC_TIMEOUT | PROC_STALL | PROC_ABORTED | PROC_EXIT (detail = last 600 chars of stderr) | PROC_SPAWN
//     onProgress(chunk) receives raw stdout chunks; `fault` = { point, settings, project } runs faults.maybeFail first.
//     captureStdout=false streams stdout to the callbacks only: nothing is accumulated (result.stdout is "") and the
//     maxStdoutBytes cap does not apply, so an endless `-progress` feed cannot kill a long encode.
//   ffmpeg(args, opts)       prepends -hide_banner -nostdin -loglevel error (unless -loglevel/-v given); with
//                            opts.onProgress(pct, info) adds -progress pipe:1 -nostats -stats_period 0.5 and parses
//                            against opts.expectedDurationSec (stdout is then NOT captured unless opts.captureStdout);
//                            stall watchdog defaults to 60 s when progress is on.
//   ffprobeJson(args, opts)  -> parsed JSON (EditError PROC_BAD_OUTPUT when stdout is not JSON)
//   toolVersions()           -> Promise<{ ffmpeg, ffprobe }> cached
//   readPidRegistry(file) / pidRegistryFile()

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnCompat, killTree } = require("../../services/spawn_compat");
const { EditError } = require("../errors");
const fsx = require("../fsx");
const { createProgressParser } = require("./progress");

const STDERR_KEEP = 64 * 1024;
const LINE_BUF_KEEP = 64 * 1024;
const EXIT_WAIT_AFTER_KILL_MS = 5000;
const DEFAULT_FFMPEG_STALL_MS = 60 * 1000;

const FFMPEG_BIN = () => process.env.VIDEO_EDIT_FFMPEG || "ffmpeg";
const FFPROBE_BIN = () => process.env.VIDEO_EDIT_FFPROBE || "ffprobe";

// ---- pid registry --------------------------------------------------------------------------
const registries = new Map(); // file -> Map<pid, entry>

function pidRegistryFile() {
  try {
    const { getSettings } = require("../settings");
    return path.join(getSettings().paths.runtimeDir, "pids.json");
  } catch { return null; }
}

function readPidRegistry(file) {
  const r = fsx.readJsonSafe(file);
  return r.ok && r.value && Array.isArray(r.value.pids) ? r.value.pids : [];
}

function writeRegistry(file) {
  const map = registries.get(file);
  try {
    fsx.ensureDir(path.dirname(file));
    fsx.writeJsonAtomic(file, { schemaVersion: 1, ownerPid: process.pid, pids: map ? [...map.values()] : [] });
  } catch { /* fail-open: the registry only helps boot recovery */ }
}

function registerPid(file, entry) {
  if (!file || !entry.pid) return;
  if (!registries.has(file)) {
    // Keep entries a previous process left behind until recovery handles them.
    const map = new Map();
    for (const e of readPidRegistry(file)) if (e && Number.isInteger(e.pid)) map.set(e.pid, e);
    registries.set(file, map);
  }
  registries.get(file).set(entry.pid, entry);
  writeRegistry(file);
}

function unregisterPid(file, pid) {
  const map = file && registries.get(file);
  if (!map || !map.delete(pid)) return;
  writeRegistry(file);
}

// ---- runner --------------------------------------------------------------------------------
function procError(code, { detail = null, stage = null, extra = null } = {}) {
  const cls = {
    PROC_TIMEOUT: ["transient", true, 504], PROC_STALL: ["transient", true, 504], PROC_ABORTED: ["cancelled", false, 409],
    PROC_EXIT: ["transient", true, 500], PROC_SPAWN: ["config", false, 503], PROC_BAD_OUTPUT: ["transient", true, 500],
  }[code] || ["bug", false, 500];
  return new EditError(code, { status: cls[2], errorClass: cls[0], retryable: cls[1], stage, detail, extra });
}

async function runProcess(cmd, args = [], opts = {}) {
  const {
    cwd, timeoutMs, stallMs, signal, onProgress, onStdoutLine, maxStdoutBytes = 2e6, captureStdout = true,
    lowPriority = false, label = null, pidFile, fault = null, stage = null, env,
  } = opts;
  if (fault && fault.point) {
    await require("../faults").maybeFail(fault.point, { settings: fault.settings, project: fault.project, signal, chunk: fault.chunk, stage });
  }
  if (signal && signal.aborted) throw procError("PROC_ABORTED", { stage, detail: "aborted before spawn" });

  const registryFile = pidFile === undefined ? pidRegistryFile() : pidFile;
  const started = Date.now();

  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawnCompat(cmd, args.map(String), { cwd, env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    } catch (e) {
      reject(procError("PROC_SPAWN", { stage, detail: e && e.code ? e.code : "spawn failed" }));
      return;
    }

    let stdout = "";
    let stdoutBytes = 0;
    let stderr = "";
    let lineBuf = "";
    let lastActivity = Date.now();
    let failure = null;      // set once we decide to kill
    let settled = false;
    let timeoutTimer = null, stallTimer = null, exitWaitTimer = null;

    const cleanup = () => {
      clearTimeout(timeoutTimer); clearInterval(stallTimer); clearTimeout(exitWaitTimer);
      if (signal) signal.removeEventListener("abort", onAbort);
      if (child.pid) unregisterPid(registryFile, child.pid);
    };
    const settle = (fn, v) => { if (settled) return; settled = true; cleanup(); fn(v); };

    const kill = (err) => {
      if (failure) return;
      failure = err;
      killTree(child);
      // If the exit event never arrives (taskkill blocked), settle anyway.
      exitWaitTimer = setTimeout(() => settle(reject, failure), EXIT_WAIT_AFTER_KILL_MS);
      exitWaitTimer.unref();
    };
    const onAbort = () => kill(procError("PROC_ABORTED", { stage, detail: "aborted" }));

    if (child.pid) {
      registerPid(registryFile, { pid: child.pid, label: label ? String(label).slice(0, 40) : null, cmd: path.basename(String(cmd)).slice(0, 40), startedAt: started, ownerPid: process.pid });
      if (lowPriority) { try { os.setPriority(child.pid, 10); } catch { /* not permitted — run at normal priority */ } }
    }

    child.stdout.on("data", (d) => {
      lastActivity = Date.now();
      if (captureStdout) {
        stdoutBytes += d.length;
        if (stdoutBytes > maxStdoutBytes) {
          kill(procError("PROC_EXIT", { stage, detail: "stdout limit exceeded", extra: { reason: "STDOUT_LIMIT" } }));
          return;
        }
      }
      const s = d.toString("utf8");
      if (captureStdout) stdout += s;
      if (onProgress) { try { onProgress(s); } catch { /* progress is an enhancement */ } }
      if (onStdoutLine) {
        lineBuf += s;
        const lines = lineBuf.split(/\r?\n/);
        lineBuf = lines.pop();
        if (lineBuf.length > LINE_BUF_KEEP) lineBuf = lineBuf.slice(-LINE_BUF_KEEP);   // a newline-free flood stays bounded
        for (const l of lines) { try { onStdoutLine(l); } catch { /* noop */ } }
      }
    });
    child.stderr.on("data", (d) => {
      lastActivity = Date.now();
      stderr += d.toString("utf8");
      if (stderr.length > STDERR_KEEP) stderr = stderr.slice(-STDERR_KEEP);
    });

    child.on("error", (e) => {
      settle(reject, failure || procError("PROC_SPAWN", { stage, detail: e && e.code ? e.code : "spawn error" }));
    });
    child.on("close", (code, sig) => {
      if (onStdoutLine && lineBuf) { try { onStdoutLine(lineBuf); } catch { /* noop */ } }
      const durationMs = Date.now() - started;
      if (failure) return settle(reject, failure);
      if (code !== 0) {
        return settle(reject, procError("PROC_EXIT", { stage, detail: stderr.slice(-600), extra: { exitCode: code, signal: sig || null } }));
      }
      settle(resolve, { code, stdout, stderr, durationMs });
    });

    if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
      timeoutTimer = setTimeout(() => kill(procError("PROC_TIMEOUT", { stage, detail: `timeout ${timeoutMs}ms` })), timeoutMs);
    }
    if (Number.isFinite(stallMs) && stallMs > 0) {
      stallTimer = setInterval(() => {
        if (Date.now() - lastActivity >= stallMs) kill(procError("PROC_STALL", { stage, detail: `no output for ${stallMs}ms` }));
      }, Math.max(50, Math.min(1000, Math.floor(stallMs / 4))));
    }
    if (signal) {
      signal.addEventListener("abort", onAbort, { once: true });
      if (signal.aborted) onAbort();
    }
  });
}

function hasFlag(args, ...flags) { return args.some((a) => flags.includes(String(a))); }

function ffmpeg(args = [], opts = {}) {
  const head = ["-hide_banner", "-nostdin"];
  if (!hasFlag(args, "-loglevel", "-v")) head.push("-loglevel", "error");
  const userProgress = typeof opts.onProgress === "function" ? opts.onProgress : null;
  let onProgress;
  if (userProgress) {
    head.push("-progress", "pipe:1", "-nostats", "-stats_period", "0.5");
    onProgress = createProgressParser(opts.expectedDurationSec, userProgress);
  }
  const stallMs = opts.stallMs !== undefined ? opts.stallMs : (userProgress ? DEFAULT_FFMPEG_STALL_MS : undefined);
  // -progress writes ~400 B/s for the whole run; the parser consumes it, so keeping (and capping) it would
  // kill any encode longer than maxStdoutBytes / 400 s. Callers that need stdout say so explicitly.
  const captureStdout = opts.captureStdout !== undefined ? !!opts.captureStdout : !userProgress;
  return runProcess(FFMPEG_BIN(), [...head, ...args], { ...opts, onProgress, stallMs, captureStdout, label: opts.label || "ffmpeg" });
}

async function ffprobeJson(args = [], opts = {}) {
  const head = hasFlag(args, "-loglevel", "-v") ? ["-hide_banner"] : ["-hide_banner", "-v", "error"];
  const r = await runProcess(FFPROBE_BIN(), [...head, ...args], { ...opts, label: opts.label || "ffprobe" });
  try { return JSON.parse(r.stdout); }
  catch { throw procError("PROC_BAD_OUTPUT", { stage: opts.stage || null, detail: "ffprobe output is not JSON" }); }
}

let versionsPromise = null;
let versionsAt = 0;
function toolVersions() {
  const stale = versionsPromise && Date.now() - versionsAt > 60 * 1000;
  if (versionsPromise && !stale) return versionsPromise;
  if (versionsPromise && stale) {
    // Only failures expire; a found tool stays cached for the life of the process.
    return versionsPromise.then((v) => (v.ffmpeg && v.ffprobe ? v : refresh()));
  }
  return refresh();

  function refresh() {
    versionsAt = Date.now();
    const one = async (bin) => {
      try {
        const r = await runProcess(bin, ["-version"], { timeoutMs: 10000, pidFile: null, label: "version" });
        const m = /version\s+(\S+)/i.exec(r.stdout.split(/\r?\n/)[0] || "");
        return m ? m[1] : null;
      } catch { return null; }
    };
    versionsPromise = Promise.all([one(FFMPEG_BIN()), one(FFPROBE_BIN())]).then(([a, b]) => ({ ffmpeg: a, ffprobe: b }));
    return versionsPromise;
  }
}

module.exports = { runProcess, ffmpeg, ffprobeJson, toolVersions, readPidRegistry, pidRegistryFile };
