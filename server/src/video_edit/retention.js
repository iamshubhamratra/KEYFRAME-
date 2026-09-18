// VIDEO EDIT RETENTION — what an edit project keeps on disk, for how long, and how it is deleted.
//
// WHY THIS EXISTS. Edit projects hold users' raw footage plus gigabytes of derived media on a
// server with a 20 GB edits budget. Nothing else sweeps them (the template janitor only knows
// jobs/ and uploads/), and deletion on Windows fails whenever a media stream or antivirus holds a
// handle. So this module owns both sides (ENGINE.md §4.12–4.13):
//   - sweepOnce(): FAILED(input) for a media rejection (MEDIA_REJECTED / UNSUPPORTED_MEDIA / UNDECODABLE)
//     with no mezzanine → source + work purged now; any other FAILED keeps source + mezzanine and loses
//     only intermediates; the record is kept failedKeepDays ·
//     NEEDS_ATTENTION / CANCELLED → kept whole failedKeepDays, then caches purged, deleted at the TTL ·
//     READY / COMPLETED → frames/chunks/render cache/QA frames purged idleIntermediatesHours after the
//     last open, deleted at the TTL · the original deleted originalDeleteDays after a VERIFIED mezzanine ·
//     owner missing → deleted after failedKeepDays only when an ownerExists() probe can answer ·
//     free disk below the floor → idle intermediates purged oldest first · `_staging` files > 1 h ·
//     `_trash` removal retried (ALERT after 24 h).
//     Never touched: active or DELETING projects, corrupt records, plans, mezzanine, exports (I6).
//     Every idle project's `storage.bytes` is re-measured when it drifted ≥ 1 MB, so quotas see real disk use.
//   - deleteProjectData(id): persist DELETING → rotate runId + abort the run (kills children, stops
//     polling) → close open media streams (injectable hook) → drop from the index (sync) → rename the
//     directory into `_trash` → rm with retries. A crash anywhere in between resumes at boot, because
//     DELETING is persisted first and recovery finishes it.
//
// CONTRACT:
//   createRetention({ store, settings, runner, now, log, closeStreams, ownerExists, freeDiskMb, abortWaitMs })
//     -> { sweepOnce(nowMs) -> Promise<report>, deleteProjectData(projectId) -> Promise<report>,
//          start({ intervalMs=600000, initialDelayMs }) -> stop(), setCloseStreams(fn) }
//   startRetention({ store, settings, now, intervalMs=600000, runner, closeStreams, … }) -> stop()
//      (stop.sweepOnce / stop.deleteProjectData / stop.instance for callers that need them)
//   sweepOnce(nowMs) · deleteProjectData(projectId) · setCloseStreams(fn)   module-level, on the started
//      instance (or a default one on the real store/settings)
//   sweepStaging(dir, nowMs, maxAgeMs=1h) -> removed count

const fs = require("node:fs");
const path = require("node:path");
const fsx = require("./fsx");
const ids = require("./ids");
const { EditError, isEditError } = require("./errors");
const { ACTIVE_STATUSES } = require("./constants");

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const DEFAULT_INTERVAL_MS = 10 * 60 * 1000;
const STAGING_MAX_AGE_MS = HOUR_MS;
const TRASH_ALERT_AGE_MS = DAY_MS;
const INTERMEDIATE_DIRS = Object.freeze(["work/frames", "work/chunks", "render/cache"]);
const MEDIA_REJECTION_CODES = Object.freeze(["MEDIA_REJECTED", "UNSUPPORTED_MEDIA", "UNDECODABLE"]);
const STORAGE_REFRESH_MIN_DELTA = 1024 * 1024;

const isPlain = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const numOr = (v, d) => (Number.isFinite(Number(v)) && v !== null && v !== "" ? Number(v) : d);

function sweepStaging(dir, nowMs = Date.now(), maxAgeMs = STAGING_MAX_AGE_MS) {
  let names = [];
  try { names = fs.readdirSync(dir); } catch { return 0; }
  let removed = 0;
  for (const name of names) {
    const full = path.join(dir, name);
    let st;
    try { st = fs.lstatSync(full); } catch { continue; }
    if (nowMs - st.mtimeMs <= maxAgeMs) continue;
    try { fs.rmSync(full, { recursive: true, force: true, maxRetries: 2, retryDelay: 50 }); removed++; } catch { /* next sweep */ }
  }
  return removed;
}

function createRetention({
  store, settings, runner = null, now = Date.now, log = console, closeStreams = null, ownerExists = null,
  freeDiskMb = fsx.statfsFreeMb, abortWaitMs = 10 * 1000,
} = {}) {
  if (!store) throw new TypeError("video_edit/retention: store is required");
  const cfg = settings || store.settings;
  let closeStreamsFn = typeof closeStreams === "function" ? closeStreams : () => 0;
  const pendingMoves = new Set();
  const alertedTrash = new Set();
  let sweeping = null;

  const say = (level, msg) => { try { (log && (log[level] || log.log) || console.log).call(log, msg); } catch { /* noop */ } };
  const R = () => cfg.retention || {};
  const allProjects = () => { try { return store.allProjects(); } catch { return []; } };

  function isBusy(p) {
    return ACTIVE_STATUSES.includes(p.status) || p.status === "DELETING" || !!p.storeCorrupt
      || !!(runner && typeof runner.isActive === "function" && runner.isActive(p.id));
  }
  const lastOpenOf = (p) => numOr(p.lastOpenedAt, 0) || numOr(p.updatedAt, 0) || numOr(p.createdAt, 0);
  const statusAtOf = (p) => numOr(p.lastTransition && p.lastTransition.at, 0) || numOr(p.updatedAt, 0) || numOr(p.createdAt, 0);

  function safeAbs(id, rel) { try { return store.abs(id, rel); } catch { return null; } }

  async function removePath(abs) {
    if (!abs || !fs.existsSync(abs)) return 0;
    const bytes = fsx.dirSizeBytes(abs);
    const ok = await fsx.rmWithRetry(abs, { attempts: 3 });
    return ok ? Math.max(bytes, 1) : 0;
  }

  function qaFrameDirs(id) {
    const qa = safeAbs(id, "qa");
    const out = [];
    let renders = [];
    try { renders = fs.readdirSync(qa, { withFileTypes: true }); } catch { return out; }
    for (const r of renders) {
      if (!r.isDirectory()) continue;
      let laps = [];
      try { laps = fs.readdirSync(path.join(qa, r.name), { withFileTypes: true }); } catch { continue; }
      for (const l of laps) if (l.isDirectory()) out.push(`qa/${r.name}/${l.name}/frames`);
    }
    return out;
  }

  async function purgeIntermediates(p) {
    let freed = 0;
    for (const rel of [...INTERMEDIATE_DIRS, ...qaFrameDirs(p.id)]) freed += await removePath(safeAbs(p.id, rel));
    return freed;
  }

  // Only a rejected upload is worthless. A project that failed for any other reason — or whose media was
  // already normalized once — keeps its source and mezzanine (I6); only regenerable caches go.
  async function purgeFailed(p) {
    const code = p.statusReason && p.statusReason.code;
    const hasMezz = !!(isPlain(p.source) && isPlain(p.source.mezzanine) && p.source.mezzanine.path);
    if (!MEDIA_REJECTION_CODES.includes(code) || hasMezz) return purgeIntermediates(p);
    let freed = await removePath(safeAbs(p.id, "source/original.bin"));
    const work = safeAbs(p.id, "work");
    if (work && fs.existsSync(work)) {
      freed += await removePath(work);
      try { fsx.ensureDir(work); } catch { /* noop */ }
    }
    return freed;
  }

  async function markRetention(id, patch, extra) {
    try {
      await store.update(id, (d) => {
        d.retention = { ...(isPlain(d.retention) ? d.retention : {}), ...patch };
        if (typeof extra === "function") extra(d);
        let bytes = null;
        try { bytes = fsx.dirSizeBytes(store.projectDir(id)); } catch { bytes = null; }
        if (bytes != null) d.storage = { ...(isPlain(d.storage) ? d.storage : {}), bytes };
      });
      return true;
    } catch (e) {
      say("warn", `[video-edit] retention write failed project=${id} code=${(e && e.code) || "INTERNAL"}`);
      return false;
    }
  }

  async function verifyMezzanine(p) {
    const mz = p.source && p.source.mezzanine;
    const abs = mz ? safeAbs(p.id, mz.path) : null;
    if (!abs) return false;
    let st;
    try { st = fs.statSync(abs); } catch { return false; }
    if (!st.isFile() || st.size <= 0) return false;
    const rec = p.stages && p.stages.COMPRESSING && p.stages.COMPRESSING.outputs && p.stages.COMPRESSING.outputs.mezz;
    if (rec && typeof rec.sha256 === "string" && Number.isFinite(rec.size)) {
      if (rec.size !== st.size) return false;
      const sha = rec.hashKind === "full" ? await fsx.sha256File(abs) : await fsx.partialSha(abs);
      if (sha !== rec.sha256) return false;
    }
    if (typeof mz.sha256 === "string" && mz.sha256) {
      const partial = await fsx.partialSha(abs);
      if (partial !== mz.sha256 && (await fsx.sha256File(abs)) !== mz.sha256) return false;
    }
    return true;
  }

  async function maybeDeleteOriginal(p, nowMs, report) {
    const src = p.source;
    if (!isPlain(src) || src.originalDeletedAt || src.mezzanineVerifyFailedAt || !isPlain(src.mezzanine)) return;
    if (!(numOr(src.originalDeleteAfter, 0) > 0) || nowMs < src.originalDeleteAfter) return;
    if (!(p.stages && p.stages.COMPRESSING && p.stages.COMPRESSING.status === "done")) return;
    const orig = safeAbs(p.id, "source/original.bin");
    if (!orig) return;
    if (fs.existsSync(orig)) {
      if (!(await verifyMezzanine(p))) {
        say("error", `[video-edit] ALERT mezzanine-unverified project=${p.id}`);
        await markRetention(p.id, {}, (d) => { if (isPlain(d.source)) d.source.mezzanineVerifyFailedAt = nowMs; });
        return;
      }
      if (runner && typeof runner.isActive === "function" && runner.isActive(p.id)) return;
      await fsx.rmWithRetry(orig, { attempts: 3 });
      if (fs.existsSync(orig)) return;
    }
    await markRetention(p.id, {}, (d) => { if (isPlain(d.source)) d.source.originalDeletedAt = nowMs; });
    report.originalsDeleted.push(p.id);
  }

  async function removeProject(id, report, why) {
    try {
      const r = await deleteProjectData(id, { actor: "retention" });
      if (r.dropped || r.trashed) report.deleted.push(id);
      say("info", `[video-edit] retention deleted project=${id} reason=${why}`);
    } catch (e) {
      report.errors++;
      say("warn", `[video-edit] retention delete failed project=${id} code=${(e && e.code) || "INTERNAL"}`);
    }
  }

  async function refreshStorage(p, report) {
    let bytes = null;
    try { bytes = fsx.dirSizeBytes(store.projectDir(p.id)); } catch { return; }
    if (!Number.isFinite(bytes) || Math.abs(bytes - numOr(p.storage && p.storage.bytes, 0)) < STORAGE_REFRESH_MIN_DELTA) return;
    try {
      await store.update(p.id, (d) => { d.storage = { ...(isPlain(d.storage) ? d.storage : {}), bytes }; });
      report.storageRefreshed.push(p.id);
    } catch (e) {
      say("warn", `[video-edit] retention storage refresh failed project=${p.id} code=${(e && e.code) || "INTERNAL"}`);
    }
  }

  async function sweepProject(p, nowMs, report) {
    if (isBusy(p)) return;
    await refreshStorage(p, report);
    const r = R();
    const lastOpen = lastOpenOf(p) || nowMs;
    const statusAt = statusAtOf(p) || nowMs;
    const deleteAt = Math.max(numOr(p.retention && p.retention.deleteAfter, 0), lastOpen + numOr(r.projectTtlDays, 30) * DAY_MS);
    const keepMs = numOr(r.failedKeepDays, 7) * DAY_MS;

    if (typeof ownerExists === "function" && p.ownerId) {
      let exists = null;
      try { exists = await ownerExists(p.ownerId); } catch { exists = null; }
      const since = numOr(p.retention && p.retention.ownerMissingSince, 0);
      if (exists === false) {
        if (!since) { await markRetention(p.id, { ownerMissingSince: nowMs }); report.ownerMissing.push(p.id); }
        else if (nowMs - since >= keepMs) { await removeProject(p.id, report, "OWNER_MISSING"); return; }
      } else if (exists === true && since) {
        await markRetention(p.id, { ownerMissingSince: null });
      }
    }

    switch (p.status) {
      case "FAILED": {
        if (nowMs - statusAt >= keepMs) { await removeProject(p.id, report, "FAILED_EXPIRED"); return; }
        if (!(p.retention && p.retention.failedPurgedAt)) {
          await purgeFailed(p);
          await markRetention(p.id, { failedPurgedAt: nowMs });
          report.failedPurged.push(p.id);
        }
        return;
      }
      case "NEEDS_ATTENTION":
      case "CANCELLED": {
        if (nowMs >= deleteAt) { await removeProject(p.id, report, "TTL"); return; }
        if (nowMs - statusAt >= keepMs && (await purgeIntermediates(p)) > 0) {
          await markRetention(p.id, { intermediatesPurgedAt: nowMs });
          report.intermediatesPurged.push(p.id);
        }
        await maybeDeleteOriginal(p, nowMs, report);
        return;
      }
      case "READY":
      case "COMPLETED": {
        if (nowMs >= deleteAt) { await removeProject(p.id, report, "TTL"); return; }
        if (nowMs - lastOpen >= numOr(r.idleIntermediatesHours, 72) * HOUR_MS && (await purgeIntermediates(p)) > 0) {
          await markRetention(p.id, { intermediatesPurgedAt: nowMs });
          report.intermediatesPurged.push(p.id);
        }
        await maybeDeleteOriginal(p, nowMs, report);
        return;
      }
      default:
    }
  }

  async function relieveDiskPressure(nowMs, report) {
    const floor = numOr(cfg.limits && cfg.limits.global && cfg.limits.global.minFreeDiskMb, 0);
    let free = null;
    try { free = freeDiskMb(cfg.paths.dir); } catch { free = null; }
    report.freeMb = free;
    if (free == null || free >= floor) return;
    report.diskPressure = true;
    say("error", `[video-edit] ALERT disk-low freeMb=${free} floorMb=${floor}`);
    const candidates = allProjects().filter((p) => !isBusy(p)).sort((a, b) => lastOpenOf(a) - lastOpenOf(b));
    for (const p of candidates) {
      if ((await purgeIntermediates(p)) > 0) {
        await markRetention(p.id, { intermediatesPurgedAt: nowMs });
        if (!report.intermediatesPurged.includes(p.id)) report.intermediatesPurged.push(p.id);
      }
      try { free = freeDiskMb(cfg.paths.dir); } catch { free = null; }
      report.freeMb = free;
      if (free == null || free >= floor) break;
    }
  }

  async function sweepTrash(nowMs, report) {
    let names = [];
    try { names = fs.readdirSync(cfg.paths.trashDir); } catch { return; }
    for (const name of names) {
      const full = path.join(cfg.paths.trashDir, name);
      if (await fsx.rmWithRetry(full, { attempts: 3 })) { report.trashRemoved++; alertedTrash.delete(name); continue; }
      report.trashPending++;
      const m = /\.(\d{13})(?:-\d+)?$/.exec(name);
      let at = m ? Number(m[1]) : 0;
      if (!at) { try { at = fs.statSync(full).mtimeMs; } catch { at = nowMs; } }
      if (nowMs - at > TRASH_ALERT_AGE_MS && !alertedTrash.has(name)) {
        alertedTrash.add(name);
        say("error", `[video-edit] ALERT trash-stuck entry=${name.slice(0, 40)} ageH=${Math.round((nowMs - at) / HOUR_MS)}`);
      }
    }
  }

  function sweepOnce(nowMs = now()) {
    if (sweeping) return sweeping;
    sweeping = (async () => {
      const report = {
        at: nowMs, scanned: 0, intermediatesPurged: [], originalsDeleted: [], failedPurged: [], deleted: [], ownerMissing: [], storageRefreshed: [],
        stagingSwept: 0, trashRemoved: 0, trashPending: 0, diskPressure: false, freeMb: null, errors: 0,
      };
      for (const id of [...pendingMoves]) {
        pendingMoves.delete(id);
        await removeProject(id, report, "RETRY_MOVE");
      }
      for (const p of allProjects()) {
        report.scanned++;
        try { await sweepProject(p, nowMs, report); }
        catch (e) { report.errors++; say("warn", `[video-edit] retention sweep failed project=${p.id} code=${(e && e.code) || "INTERNAL"}`); }
      }
      try { await relieveDiskPressure(nowMs, report); } catch { report.errors++; }
      report.stagingSwept = sweepStaging(cfg.paths.stagingDir, nowMs, STAGING_MAX_AGE_MS);
      await sweepTrash(nowMs, report);
      const acted = report.intermediatesPurged.length + report.originalsDeleted.length + report.failedPurged.length
        + report.deleted.length + report.stagingSwept + report.trashRemoved;
      if (acted || report.errors || report.diskPressure) {
        say("info", `[video-edit] retention swept scanned=${report.scanned} purged=${report.intermediatesPurged.length} originals=${report.originalsDeleted.length} failedPurged=${report.failedPurged.length} deleted=${report.deleted.length} staging=${report.stagingSwept} trash=${report.trashRemoved} pending=${report.trashPending} errors=${report.errors}`);
      }
      return report;
    })().finally(() => { sweeping = null; });
    return sweeping;
  }

  async function deleteProjectData(projectId, { actor = "user" } = {}) {
    if (!ids.isProjectId(projectId)) throw new EditError("NOT_FOUND", { status: 404, errorClass: "input" });
    const dir = path.join(cfg.paths.dir, projectId);
    const report = { projectId, deleting: false, aborted: false, streamsClosed: 0, dropped: false, trashed: null, removed: false };
    const project = store.get(projectId);
    if (project) {
      if (project.status !== "DELETING") await store.beginDelete(projectId, { actor });
      report.deleting = true;
      try { await store.update(projectId, (d) => { d.runId = ids.newRunId(); }, { allowCorrupt: true }); }
      catch { /* corrupt or already gone: nothing can write to it anyway */ }
      if (runner && typeof runner.abort === "function") {
        try { report.aborted = await runner.abort(projectId, { reason: "DELETING", waitMs: abortWaitMs }); } catch { /* best effort */ }
      }
    }
    try { report.streamsClosed = numOr(await closeStreamsFn(projectId), 0); } catch { /* best effort */ }
    report.dropped = !!store.dropFromIndex(projectId);
    if (fs.existsSync(dir)) {
      try { report.trashed = fsx.moveToTrash(dir, cfg.paths.trashDir); }
      catch (e) {
        pendingMoves.add(projectId);
        say("warn", `[video-edit] delete move deferred project=${projectId} code=${(e && e.code) || "INTERNAL"}`);
        return report;
      }
    }
    if (report.trashed) report.removed = await fsx.rmWithRetry(report.trashed, { attempts: 5 });
    say("info", `[video-edit] project deleted project=${projectId} removed=${report.removed} streams=${report.streamsClosed}`);
    return report;
  }

  function start({ intervalMs = DEFAULT_INTERVAL_MS, initialDelayMs } = {}) {
    const run = () => { sweepOnce().catch((e) => say("error", `[video-edit] retention sweep crashed code=${(e && e.code) || "INTERNAL"}`)); };
    const first = setTimeout(run, Math.max(0, numOr(initialDelayMs, Math.min(intervalMs, 30 * 1000))));
    const every = setInterval(run, Math.max(1000, intervalMs));
    first.unref();
    every.unref();
    return () => { clearTimeout(first); clearInterval(every); };
  }

  return {
    sweepOnce, deleteProjectData, start,
    setCloseStreams: (fn) => { if (typeof fn === "function") closeStreamsFn = fn; },
    pendingMoves: () => [...pendingMoves],
  };
}

// ---- module-level API (the started instance) -----------------------------------------------------
let current = null;
let defaultCloseStreams = null;

function instance() {
  if (!current) {
    current = createRetention({
      store: require("./store").getStore(), settings: require("./settings").getSettings(), closeStreams: defaultCloseStreams,
    });
  }
  return current;
}

function startRetention(opts = {}) {
  const inst = createRetention({ closeStreams: defaultCloseStreams, ...opts });
  current = inst;
  const stopTimers = inst.start({ intervalMs: opts.intervalMs, initialDelayMs: opts.initialDelayMs });
  const stop = () => { stopTimers(); };
  stop.sweepOnce = inst.sweepOnce;
  stop.deleteProjectData = inst.deleteProjectData;
  stop.instance = inst;
  return stop;
}

function setCloseStreams(fn) {
  if (typeof fn !== "function") return;
  defaultCloseStreams = fn;
  if (current) current.setCloseStreams(fn);
}

module.exports = {
  createRetention, startRetention, sweepStaging, setCloseStreams,
  sweepOnce: (nowMs) => instance().sweepOnce(nowMs),
  deleteProjectData: (projectId) => instance().deleteProjectData(projectId),
  INTERMEDIATE_DIRS,
};
