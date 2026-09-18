// VIDEO EDIT BOOT RECOVERY — put every edit project back into a state the engine can own.
//
// WHY THIS EXISTS. dev-watch restarts the server on every save, deploys restart it, and crashes
// happen mid-ffmpeg. After any of those, project.json can say PROCESSING for a run that no longer
// exists, a half-written `*.tmp.*` file can sit next to a real output, an orphaned ffmpeg can still
// be burning both cores, a deletion can be half done, and a project that crashes the process on
// every boot would crash it forever. This runs once from `videoEdit.start()` (ENGINE.md §3.6) and
// answers each of those — without ever touching the template job queue (`db.takeOrphanedTasks()`),
// whose boot drain is a different subsystem with a different record format.
//   1. dirs exist; the feature is enabled (settings refuse unsafe placement)
//   2. index loaded/rebuilt; `ve_*` dirs without project.json older than 1 h → `_trash`
//   3. pids in `_runtime/pids.json` from a previous process are killed ONLY if alive and still an
//      ffmpeg/ffprobe image (a recycled pid belonging to anything else is never killed)
//   4. DELETING → deletion resumed · QUEUED → enqueued · PROCESSING/RENDERING → `*.tmp.*` removed,
//      running stage/render marked `interrupted`, runId rotated; crash-loop guard (count ≥ 8, or a
//      previous recovery < 25 s ago) → NEEDS_ATTENTION RESTART_LOOP; else PROCESSING → QUEUED and
//      resumed from checkpoints, RENDERING → READY/COMPLETED with the render flagged for re-queue
//   5. KIE `providerTasks` are left in place: the TRANSCRIBING handler re-polls them on resume
//   6. `_staging` files older than 1 h swept
//
// CONTRACT:
//   recover({ store, runner, settings, killPid, isFfmpegPid, now, log, deleteProject, renders }) -> Promise<report>
//     renders: engine/render_jobs — interrupted exports are re-requested; interrupted previews (also on idle READY /
//     COMPLETED projects) are only marked 'interrupted' (the editor asks for a fresh preview).
//   report = { requeued:[id], interrupted:[id], restartLoop:[id], deletionsResumed:[id], trashed:[id],
//              pidsKilled:[pid], stagingSwept, tmpRemoved, rendersRequeued:[id], notRequeued:[id], errors, disabled }
//   notRequeued: projects that stopped being QUEUED while recovery ran (e.g. the user cancelled) — skipped, not errors.
//   defaultIsFfmpegPid(pid) -> Promise<boolean> · defaultKillPid(pid) -> Promise<boolean> · removeTmpFiles(dir) -> count

const fs = require("node:fs");
const path = require("node:path");
const fsx = require("./fsx");
const ids = require("./ids");
const { runProcess, readPidRegistry } = require("./engine/proc");
const { sweepStaging, createRetention } = require("./retention");

const HOUR_MS = 60 * 60 * 1000;
const LOOP_MAX_COUNT = 8;
const LOOP_WINDOW_MS = 25 * 1000;
const TMP_RE = /\.tmp(\.|$)/i;

const isPlain = (v) => !!v && typeof v === "object" && !Array.isArray(v);

async function defaultIsFfmpegPid(pid) {
  if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) return false;
  if (process.platform === "win32") {
    try {
      const r = await runProcess("tasklist", ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"], { timeoutMs: 10000, pidFile: null, label: "tasklist" });
      const line = r.stdout.split(/\r?\n/).find((l) => l.includes(`"${pid}"`));
      const image = line ? ((/^\s*"([^"]+)"/.exec(line) || [])[1] || "") : "";
      return /^(ffmpeg|ffprobe)(\.exe)?$/i.test(image);
    } catch { return false; }
  }
  if (process.platform === "linux") {
    try {
      const comm = fs.readFileSync(`/proc/${pid}/comm`, "utf8").trim();
      return comm === "ffmpeg" || comm === "ffprobe";
    } catch { return false; }
  }
  try {
    const r = await runProcess("ps", ["-p", String(pid), "-o", "comm="], { timeoutMs: 10000, pidFile: null, label: "ps" });
    return /(^|\/)(ffmpeg|ffprobe)$/.test(r.stdout.trim());
  } catch { return false; }
}

async function defaultKillPid(pid) {
  if (process.platform === "win32") {
    await runProcess("taskkill", ["/pid", String(pid), "/T", "/F"], { timeoutMs: 10000, pidFile: null, label: "taskkill" });
    return true;
  }
  process.kill(pid, "SIGKILL");
  return true;
}

// Half-written outputs (`mezz.mp4.tmp.<runId>.mp4`, `project.json.<pid>.<n>.tmp`) are never valid.
function removeTmpFiles(dir) {
  let removed = 0;
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    let entries = [];
    try { entries = fs.readdirSync(cur, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (e.isSymbolicLink()) continue;
      const full = path.join(cur, e.name);
      if (e.isDirectory()) { stack.push(full); continue; }
      if (e.isFile() && TMP_RE.test(e.name)) {
        try { fs.unlinkSync(full); removed++; } catch { /* locked: the next boot tries again */ }
      }
    }
  }
  return removed;
}

async function recover({
  store, runner, settings, killPid = defaultKillPid, isFfmpegPid = defaultIsFfmpegPid, now = Date.now, log = console,
  deleteProject = null, renders = null,
} = {}) {
  if (!store) throw new TypeError("video_edit/recovery: store is required");
  const cfg = settings || store.settings;
  const say = (level, msg) => { try { (log && (log[level] || log.log) || console.log).call(log, msg); } catch { /* noop */ } };
  const report = {
    requeued: [], interrupted: [], restartLoop: [], deletionsResumed: [], trashed: [], pidsKilled: [],
    stagingSwept: 0, tmpRemoved: 0, rendersRequeued: [], notRequeued: [], errors: 0, disabled: false,
  };
  if (!cfg || !cfg.enabled) {
    report.disabled = true;
    say("warn", `[video-edit] recovery skipped: feature disabled (${(cfg && cfg.disabledReason) || "NO_SETTINGS"})`);
    return report;
  }
  const P = cfg.paths;

  // 1. directories
  for (const d of [P.dir, P.stagingDir, P.trashDir, P.sharedDir, P.metricsDir, P.runtimeDir]) {
    try { fsx.ensureDir(d); } catch { report.errors++; }
  }

  // 2. index + orphan project dirs
  store.init();
  const nowMs = now();
  let names = [];
  try { names = fs.readdirSync(P.dir, { withFileTypes: true }); } catch { names = []; }
  for (const d of names) {
    if (!d.isDirectory() || !ids.isProjectId(d.name) || store.get(d.name)) continue;
    const full = path.join(P.dir, d.name);
    if (fs.existsSync(path.join(full, "project.json")) || fs.existsSync(path.join(full, "project.json.bak"))) continue;
    let st;
    try { st = fs.statSync(full); } catch { continue; }
    if (nowMs - st.mtimeMs <= HOUR_MS) continue;   // may still be mid-create
    try { fsx.moveToTrash(full, P.trashDir); report.trashed.push(d.name); }
    catch { report.errors++; }
  }

  // 3. orphaned ffmpeg / ffprobe children of a previous process
  const pidFile = path.join(P.runtimeDir, "pids.json");
  const keep = [];
  for (const e of readPidRegistry(pidFile)) {
    if (!isPlain(e) || !Number.isInteger(e.pid) || e.pid <= 0 || e.pid === process.pid) continue;
    if (e.ownerPid === process.pid) { keep.push(e); continue; }
    let ours = false;
    try { ours = !!(await isFfmpegPid(e.pid)); } catch { ours = false; }
    if (!ours) continue;
    try { await killPid(e.pid); report.pidsKilled.push(e.pid); }
    catch { report.errors++; }
  }
  try { fsx.writeJsonAtomic(pidFile, { schemaVersion: 1, ownerPid: process.pid, pids: keep }); } catch { report.errors++; }

  // Interrupted exports are asked for again (a new render id; the cache makes finished chunks free).
  async function requeueExport(projectId, rec) {
    report.rendersRequeued.push(projectId);
    if (!renders || typeof renders.request !== "function") return;
    try { await renders.request(projectId, { kind: "export", planRevision: rec.planRev, profile: rec.profile }); }
    catch { report.errors++; }
  }

  // 4. per project
  const toEnqueue = [];
  const toDelete = [];
  for (const p of store.allProjects()) {
    try {
      if (p.status === "DELETING") { toDelete.push(p.id); continue; }
      if (p.status === "QUEUED") { toEnqueue.push(p.id); continue; }
      if (p.status !== "PROCESSING" && p.status !== "RENDERING") {
        // Previews render on idle (READY / COMPLETED / NEEDS_ATTENTION) projects: a render left queued/running by the
        // previous process is marked interrupted (the editor re-requests its preview); an export is re-queued.
        const stale = (Array.isArray(p.renders) ? p.renders : []).filter((r) => isPlain(r) && (r.status === "running" || r.status === "queued"));
        if (!stale.length) continue;
        await store.update(p.id, (d) => {
          for (const r of Array.isArray(d.renders) ? d.renders : []) {
            if (isPlain(r) && (r.status === "running" || r.status === "queued")) { r.status = "interrupted"; r.finishedAt = now(); }
          }
        });
        report.tmpRemoved += removeTmpFiles(store.projectDir(p.id));
        const exp = stale.filter((r) => r.kind === "export" && !r.hidden).pop();
        if (exp) await requeueExport(p.id, exp);
        continue;
      }

      report.tmpRemoved += removeTmpFiles(store.projectDir(p.id));
      const rec = isPlain(p.recovery) ? p.recovery : {};
      const count = Number(rec.count) || 0;
      const lastAt = Number(rec.lastAt) || 0;
      const at = now();
      const loop = count >= LOOP_MAX_COUNT || (count > 0 && at - lastAt < LOOP_WINDOW_MS);
      let interruptedStage = null;
      let interruptedRender = null;
      await store.update(p.id, (d) => {
        for (const [name, r] of Object.entries(isPlain(d.stages) ? d.stages : {})) {
          if (isPlain(r) && r.status === "running") { r.status = "interrupted"; r.finishedAt = at; interruptedStage = interruptedStage || name; }
        }
        for (const r of Array.isArray(d.renders) ? d.renders : []) {
          if (isPlain(r) && (r.status === "running" || r.status === "queued")) { r.status = "interrupted"; r.requeue = true; interruptedRender = interruptedRender || r; }
        }
        d.recovery = { count: count + 1, lastAt: at };
        d.runId = ids.newRunId();   // a zombie writer from the previous process is fenced out
      });
      report.interrupted.push(p.id);

      if (loop) {
        await store.setStatus(p.id, "NEEDS_ATTENTION", {
          actor: "recovery",
          reason: {
            code: "RESTART_LOOP", message: "Processing kept stopping unexpectedly.", retryable: true,
            stage: interruptedStage || (p.progress && p.progress.stage) || null, actions: ["retry", "delete"],
          },
        });
        report.restartLoop.push(p.id);
        say("error", `[video-edit] ALERT restart-loop project=${p.id} count=${count + 1}`);
        continue;
      }
      if (p.status === "PROCESSING") {
        await store.setStatus(p.id, "QUEUED", { actor: "recovery", reason: "recovery" });
        toEnqueue.push(p.id);
      } else {
        const next = p.exports && p.exports.currentId ? "COMPLETED" : "READY";
        await store.setStatus(p.id, next, { actor: "recovery", reason: "recovery" });
        if (interruptedRender && interruptedRender.kind === "export" && !interruptedRender.hidden) await requeueExport(p.id, interruptedRender);
      }
    } catch (e) {
      report.errors++;
      say("error", `[video-edit] recovery failed project=${p.id} code=${(e && e.code) || "INTERNAL"}`);
    }
  }

  const del = typeof deleteProject === "function"
    ? deleteProject
    : (() => { const r = createRetention({ store, settings: cfg, runner, now, log }); return (id) => r.deleteProjectData(id, { actor: "recovery" }); })();
  for (const id of toDelete) {
    try { await del(id); report.deletionsResumed.push(id); }
    catch (e) { report.errors++; say("error", `[video-edit] recovery delete failed project=${id} code=${(e && e.code) || "INTERNAL"}`); }
  }

  if (runner && typeof runner.enqueuePipeline === "function") {
    for (const id of toEnqueue) {
      // toEnqueue was collected before the pid checks and deletions above; a cancel may have landed since.
      const cur = store.get(id);
      if (!cur || cur.status !== "QUEUED") { report.notRequeued.push(id); continue; }
      try { await runner.enqueuePipeline(id, { resume: true }); report.requeued.push(id); }
      catch (e) {
        if (e && e.code === "ILLEGAL_TRANSITION") { report.notRequeued.push(id); continue; }
        report.errors++;
        say("error", `[video-edit] recovery enqueue failed project=${id} code=${(e && e.code) || "INTERNAL"}`);
      }
    }
  }

  // 6. staging
  report.stagingSwept = sweepStaging(P.stagingDir, now(), HOUR_MS);

  say("info", `[video-edit] recovery done requeued=${report.requeued.length} interrupted=${report.interrupted.length} restartLoop=${report.restartLoop.length} deletions=${report.deletionsResumed.length} trashed=${report.trashed.length} pidsKilled=${report.pidsKilled.length} staging=${report.stagingSwept} tmp=${report.tmpRemoved} errors=${report.errors}`);
  return report;
}

module.exports = { recover, defaultIsFfmpegPid, defaultKillPid, removeTmpFiles, LOOP_MAX_COUNT, LOOP_WINDOW_MS };
