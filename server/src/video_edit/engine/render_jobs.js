// VIDEO EDIT RENDER JOBS — queue, records, dedup, cancellation and QA laps for preview/export renders (API.md §2,
// ENGINE.md §5–§7).
//
// WHY THIS EXISTS. A render is not a pipeline stage: the user asks for many of them (every edit refreshes the
// preview, export at the end), each one renders ONE plan revision, and several can exist per project. So renders get
// their own records (project.renders[], newest last), their own runIds for fencing, and their own cancel registry —
// while sharing the pipeline's single job lane (priority 1, ahead of new analyses) and heavy-CPU slots.
// Rules the editor depends on:
//   - identical (planHash, kind, profile) already done with files on disk → 200 cached, no work;
//     identical one queued/running → that same renderId;
//   - a newer PREVIEW request supersedes older queued/running previews (they are cancelled — the user only ever
//     looks at the latest); exports are never superseded by previews;
//   - an export moves the project READY/COMPLETED → RENDERING → COMPLETED (or back where it came from on failure,
//     NEEDS_ATTENTION only when there has never been a successful export); a preview never changes project status;
//   - exports.currentId moves only to a render whose QA has no integrity blocker (ENGINE.md §7), and a later edit
//     marks it stale (editing/handlers does that).
// The pipeline's automatic first render (settings.autoRender) runs INLINE inside the pipeline job via `runInline`,
// reporting PREPARING_RENDER … QUALITY_CHECK as pipeline stages so the analysis screen ticks them off; only there is
// QA allowed to repair the PLAN (it is the AI's own first draft, and a qa-repair revision there costs the user no
// undo history). User-requested renders get render-level repairs only (re-render / re-mix), and plan-level findings
// are reported with their suggested fix.
//
// CONTRACT:
//   createRenderJobs({ store, queue, events, settings, log, now, pidFile, render?, qa?, maxQaLaps?, renderDeps?, qaOptions? }) -> {
//     request(projectId, { kind, planRevision, profile }) -> Promise<{ renderId, queuePosition, cached }>
//        409 REVISION_CONFLICT extra { headRevision } (planRevision > head) · 409 NOT_READY (no plan / status) ·
//        422 INVALID_PROFILE
//     runInline(projectId, { runId, signal, progress, markStage }) -> Promise<{ renderId, status, qa }|null>
//     cancel(projectId, { renderId? }) -> Promise<{ cancelled, renderId }>   (NOTHING_TO_CANCEL 409)
//     isActive(projectId) · activeIds() · stopAll({ timeoutMs }) · recordView(record)
//   }
//   render: { renderRevision } (tests inject) · qa: { runQa, planRepairs, pickBestLap } | null (qa/index.js when present)

const fs = require("node:fs");
const path = require("node:path");
const ids = require("../ids");
const P = require("../render/profiles");
const { EditError, isEditError } = require("../errors");
const { STAGE_WEIGHTS } = require("./progress");

const RENDER_STAGES = Object.freeze(["PREPARING_RENDER", "RENDERING", "POST_PROCESSING", "QUALITY_CHECK"]);
const RENDER_WEIGHT = RENDER_STAGES.reduce((a, s) => a + (STAGE_WEIGHTS[s] || 0), 0);
const MAX_RECORDS = 60;
const EVENT_MIN_MS = 400;
const isPlain = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const round1 = (x) => Math.round(x * 10) / 10;

function loadQa(log) {
  try {
    const qa = require("../qa");
    return qa && typeof qa.runQa === "function" ? qa : null;
  } catch (e) {
    if (e && e.code === "MODULE_NOT_FOUND" && /[\\/]qa([\\/]index)?(\.js)?'/.test(String(e.message))) return null;
    try { (log.error || log.log).call(log, `[video-edit] qa module failed to load: ${e && e.message}`); } catch { /* noop */ }
    return null;
  }
}

function createRenderJobs({ store, queue, events, settings, log = console, now = Date.now, pidFile, render, qa, maxQaLaps = 2, renderDeps = {}, qaOptions = {} } = {}) {
  if (!store || !queue) throw new TypeError("video_edit/render_jobs: store and queue are required");
  const R = render || require("../render/render");
  const RENDERER_VERSION = require("../render/render").RENDERER_VERSION;
  const QA = qa === undefined ? loadQa(log) : qa;
  const bus = events && typeof events.publish === "function" ? events : { publish: () => 0 };
  const jobs = new Map();          // renderId -> { projectId, ac, state, kind, promise }
  const chains = new Map();        // projectId -> tail promise: renders of one project never overlap (ledger, status)
  function serial(projectId, fn) {
    const prev = chains.get(projectId) || Promise.resolve();
    const run = prev.catch(() => {}).then(fn);
    const tail = run.catch(() => {});
    chains.set(projectId, tail);
    tail.then(() => { if (chains.get(projectId) === tail) chains.delete(projectId); });
    return run;
  }
  let stopping = false;
  const say = (level, msg) => { try { (log[level] || log.log || console.log).call(log, msg); } catch { /* noop */ } };
  const publish = (id, type, data) => { try { bus.publish(id, type, data); } catch { /* noop */ } };

  function recordView(r) {
    if (!isPlain(r)) return null;
    return {
      renderId: r.id, kind: r.kind, profile: r.profile, planRevision: r.planRev, status: r.status, pct: r.pct || 0, etaSec: r.etaSec ?? null,
      stage: r.stage || null, queuePosition: r.queuePosition ?? null, compositionHash: r.compositionHash || null,
      durationSec: r.durationSec || null, width: r.width || null, height: r.height || null, fps: 30,
      createdAt: r.createdAt || null, finishedAt: r.finishedAt || null, error: r.error || null,
    };
  }

  // ---- records ---------------------------------------------------------------------------------
  async function patchRecord(projectId, renderId, patch, { runId = null } = {}) {
    let out = null;
    await store.update(projectId, (d) => {
      const list = Array.isArray(d.renders) ? d.renders : [];
      const r = list.find((x) => x && x.id === renderId);
      if (!r) return;
      if (runId && r.runId !== runId) return;          // a superseded run never writes
      Object.assign(r, typeof patch === "function" ? patch(r, d) || {} : patch);
      out = { ...r };
    });
    return out;
  }

  async function pushRecord(projectId, rec) {
    const evicted = [];
    let kept = [];
    await store.update(projectId, (d) => {
      const list = Array.isArray(d.renders) ? d.renders : [];
      list.push(rec);
      const keep = new Set([d.exports && d.exports.currentId, ...((d.exports && d.exports.history) || [])].filter(Boolean));
      const evictable = (r) => r && r.id !== rec.id && !keep.has(r.id) && r.status !== "queued" && r.status !== "running";
      while (list.length > MAX_RECORDS) {
        let i = list.findIndex((r) => evictable(r) && r.hidden);          // internal QA laps first
        if (i < 0) i = list.findIndex((r) => evictable(r) && r.kind === "preview");
        if (i < 0) i = list.findIndex(evictable);
        if (i < 0) break;
        evicted.push(list.splice(i, 1)[0]);
      }
      d.renders = list;
      kept = list;
    });
    if (evicted.length) pruneFiles(projectId, evicted, kept);
  }

  function pruneFiles(projectId, evicted, kept) {
    const inUse = new Set();
    for (const r of kept) for (const v of Object.values(isPlain(r.files) ? r.files : {})) if (typeof v === "string") inUse.add(v);
    for (const r of evicted) {
      for (const v of Object.values(isPlain(r.files) ? r.files : {})) {
        if (typeof v !== "string" || inUse.has(v) || !/^render\/(out|layout|comp)\//.test(v)) continue;
        try { fs.rmSync(store.abs(projectId, v), { force: true }); } catch { /* best effort */ }
      }
      if (!kept.some((k) => k.shippedRenderId === r.id)) { try { fs.rmSync(store.abs(projectId, `qa/${r.id}`), { recursive: true, force: true }); } catch { /* best effort */ } }
    }
  }

  function emitRender(projectId, rec, force = false) {
    if (!rec) return;
    const j = jobs.get(rec.id);
    const t = now();
    if (!force && j && t - (j.lastEventAt || 0) < EVENT_MIN_MS) return;
    if (j) j.lastEventAt = t;
    publish(projectId, "render", recordView(rec));
  }

  function planHead(p) { return isPlain(p.plan) && Number.isInteger(p.plan.headRevision) ? p.plan.headRevision : 0; }
  function revisionHash(p, rev) {
    const r = isPlain(p.plan) && Array.isArray(p.plan.revisions) ? p.plan.revisions.find((x) => x && x.rev === rev) : null;
    return r && typeof r.hash === "string" ? r.hash : null;
  }
  function filesOk(projectId, rec) {
    try { return !!(rec.files && rec.files.mp4 && fs.statSync(store.abs(projectId, rec.files.mp4)).size > 0); } catch { return false; }
  }

  // ---- request ---------------------------------------------------------------------------------
  // Two identical requests racing (double click, two tabs) share one render: the key is claimed synchronously.
  const requesting = new Map();
  function request(projectId, opts = {}) {
    const key = `${projectId}|${opts.kind || "preview"}|${opts.profile || ""}|${opts.planRevision == null ? "head" : opts.planRevision}`;
    if (requesting.has(key)) return requesting.get(key);
    const p = requestNow(projectId, opts).finally(() => requesting.delete(key));
    requesting.set(key, p);
    return p;
  }

  async function requestNow(projectId, { kind = "preview", planRevision = null, profile = null } = {}) {
    if (stopping) throw new EditError("EDITS_DISABLED", { status: 503, errorClass: "config", retryable: true, extra: { reason: "SHUTTING_DOWN" } });
    if (!P.KINDS.includes(kind)) throw new EditError("VALIDATION_FAILED", { status: 422, errorClass: "input", extra: { field: "kind" } });
    const project = store.get(projectId);
    if (!project) throw new EditError("NOT_FOUND", { status: 404, errorClass: "input" });
    const head = planHead(project);
    if (!(head > 0)) throw new EditError("NOT_READY", { status: 409, errorClass: "input", retryable: true, extra: { reason: "NO_PLAN", status: project.status } });
    if (!["READY", "RENDERING", "COMPLETED", "NEEDS_ATTENTION"].includes(project.status)) {
      throw new EditError("NOT_READY", { status: 409, errorClass: "input", retryable: true, extra: { reason: "STATUS", status: project.status } });
    }
    const rev = Number.isInteger(planRevision) ? planRevision : head;
    if (rev > head || rev < 1) throw new EditError("REVISION_CONFLICT", { status: 409, errorClass: "input", extra: { headRevision: head } });
    const prof = profile || P.defaultProfileFor(kind, project.settings);
    P.getProfile(prof);
    if (kind === "preview" && prof !== "preview540") throw new EditError("INVALID_PROFILE", { status: 422, errorClass: "input", extra: { profile: prof } });
    if (kind === "export" && prof === "preview540") throw new EditError("INVALID_PROFILE", { status: 422, errorClass: "input", extra: { profile: prof } });
    const planHash = revisionHash(project, rev);

    const renders = Array.isArray(project.renders) ? project.renders : [];
    const same = renders.filter((r) => r && !r.hidden && r.kind === kind && r.profile === prof && ((planHash && r.planHash === planHash) || r.planRev === rev));
    // a render made by an older renderer is not "identical": the same plan would come out differently now
    const done = same.filter((r) => r.status === "done" && r.renderer === RENDERER_VERSION && filesOk(projectId, r)).pop();
    if (done) return { renderId: done.id, queuePosition: 0, cached: true };
    const active = same.find((r) => (r.status === "queued" || r.status === "running") && jobs.has(r.id));
    if (active) return { renderId: active.id, queuePosition: active.queuePosition ?? 0, cached: false };

    if (kind === "preview") {
      for (const r of renders) {
        if (r && r.kind === "preview" && (r.status === "queued" || r.status === "running") && jobs.has(r.id)) {
          cancelJob(projectId, r.id, "SUPERSEDED").catch(() => {});
        }
      }
    }

    const renderId = ids.newRenderId();
    const runId = ids.newRunId();
    await pushRecord(projectId, { id: renderId, kind, profile: prof, planRev: rev, planHash, renderer: RENDERER_VERSION, status: "queued", pct: 0, runId, createdAt: now(), stage: null, segments: null, qa: null, error: null });
    const job = { projectId, renderId, runId, kind, ac: new AbortController(), state: "queued", lastEventAt: 0 };
    jobs.set(renderId, job);
    emitRender(projectId, { id: renderId, kind, profile: prof, planRev: rev, status: "queued", pct: 0 }, true);
    job.promise = queue.add(() => serial(projectId, () => runJob(job, { revision: rev, profile: prof })), { priority: 1, label: `${projectId}:${renderId}` })
      .catch((e) => {
        if (!(isEditError(e) && e.code === "QUEUE_CLEARED")) say("error", `[video-edit] render crashed project=${projectId} render=${renderId} code=${(e && e.code) || "INTERNAL"}`);
      })
      .finally(() => { jobs.delete(renderId); });
    let queuePosition = 0;
    try { queuePosition = typeof queue.position === "function" ? queue.position(`${projectId}:${renderId}`) || 0 : 0; } catch { /* noop */ }
    say("info", `[video-edit] render queued project=${projectId} render=${renderId} kind=${kind} profile=${prof} rev=${rev}`);
    return { renderId, queuePosition, cached: false };
  }

  // ---- execution -------------------------------------------------------------------------------
  function progressReporter(job, extra = null) {
    let lastStage = null;
    const stagePct = new Map();
    return (stage, pct, message, meta = {}) => {
      if (!RENDER_STAGES.includes(stage)) return;
      if (Number.isFinite(pct)) stagePct.set(stage, Math.max(0, Math.min(100, pct)));
      let acc = 0;
      for (const s of RENDER_STAGES) {
        const w = STAGE_WEIGHTS[s] || 0;
        const idx = RENDER_STAGES.indexOf(s), cur = RENDER_STAGES.indexOf(stage);
        if (idx < cur) acc += w;
        else if (idx === cur) acc += w * ((stagePct.get(s) || 0) / 100);
      }
      const overall = round1((acc / RENDER_WEIGHT) * 100);
      if (typeof extra === "function") { try { extra(stage, pct, message, meta); } catch { /* noop */ } }
      if (!job) return;
      const force = stage !== lastStage || !!meta.finished;
      lastStage = stage;
      job.pct = overall;
      job.stage = stage;
      const t = now();
      if (!force && t - (job.lastWriteAt || 0) < 1000) { emitRender(job.projectId, { id: job.renderId, kind: job.kind, profile: job.profile, planRev: job.revision, status: "running", pct: overall, stage }); return; }
      job.lastWriteAt = t;
      patchRecord(job.projectId, job.renderId, { pct: overall, stage }, { runId: job.runId })
        .then((rec) => emitRender(job.projectId, rec, force))
        .catch(() => {});
    };
  }

  async function execute({ projectId, renderId, runId, kind, revision, profile, signal, progress, allowPlanRepair = false }) {
    const renderOnce = (rev, rid, rrun, prog = progress) => R.renderRevision({ store, projectId, renderId: rid, revision: rev, profileName: profile, kind, signal, runId: rrun, pidFile, queue, log, settings, progress: prog, deps: renderDeps });
    const RS = ["PREPARING_RENDER", "RENDERING", "POST_PROCESSING"];
    const lapProgress = (lo, hi) => (stage, pct) => {
      const i = RS.indexOf(stage);
      if (i < 0) return;
      const local = (i * 100 + (Number.isFinite(pct) ? pct : 0)) / RS.length;
      progress("QUALITY_CHECK", Math.round(lo + ((hi - lo) * local) / 100), "Fixing what the check found");
    };
    const committed = new Set();
    const result = await renderOnce(revision, renderId, runId);
    if (!QA) return { result, qa: null };

    // QA laps (ENGINE.md §7): check → repair (plan ops only for the AI's own first draft, render actions always) →
    // re-render → check; the best lap ships and its report is the render's QA.
    progress("QUALITY_CHECK", 0, "Checking the cut", { started: true });
    const projectDir = store.projectDir(projectId);
    const lapsN = Math.max(1, Math.min(maxQaLaps, typeof QA.maxRepairLaps === "function"
      ? QA.maxRepairLaps({ cpus: settings && settings.cpus, durationSec: result.durationSec }) : maxQaLaps));
    const laps = [];
    let current = { result, revision, renderId, changedRanges: [] };
    let qaCost = 0;
    for (let lap = 0; lap < lapsN; lap++) {
      const project = store.get(projectId);
      const res = current.result;
      const notes = res.notes || [];
      let report;
      try {
        report = await QA.runQa({
          projectDir, renderId: current.renderId, lap,
          files: { mp4: res.files.mp4, audioReport: res.files.audioReport, layout: res.files.layout, voice: res.voiceRel },
          plan: res.plan, planHash: res.planHash, words: res.context.words, faces: res.context.faces, mezz: res.context.mezz,
          timing: res.plan.source && res.plan.source.timing, language: res.plan.source && res.plan.source.language,
          previous: laps.length ? laps[laps.length - 1] : null, changedRanges: current.changedRanges,
          renderInfo: {
            overlaysDropped: notes.some((n) => n.code === "RENDER_OVERLAYS_DROPPED"),
            missingAssets: notes.filter((n) => /_(UNAVAILABLE|MISSING|CONFORM_FAILED)$/.test(n.code) && n.elementId)
              .map((n) => ({ elementId: n.elementId, kind: n.code.startsWith("BROLL") ? "broll" : n.code.startsWith("SFX") ? "sfx" : "card" })),
          },
          settings, project, signal, pidFile, cacheDir: store.abs(projectId, "analysis/llm-cache"),
          withHeavy: (fn) => (queue && typeof queue.heavy === "function" ? queue.heavy(fn, { signal, label: `qa:${projectId}` }) : fn({})),
          onCost: (e) => { qaCost += Number(e && typeof e === "object" ? e.costUsd : e) || 0; },
          ...qaOptions,
        });
      } catch (e) {
        if (signal && signal.aborted) throw e;
        say("warn", `[video-edit] qa failed project=${projectId} render=${current.renderId} code=${(e && e.code) || "INTERNAL"} detail=${String((e && e.message) || "").slice(0, 160)}`);
        break;
      }
      laps.push({ ...report, lap, renderId: current.renderId, planRevision: current.revision, result: res });
      progress("QUALITY_CHECK", Math.min(95, Math.round(((lap + 1) * 100) / (lapsN + 1))), "Checking the cut");
      if (lap + 1 >= lapsN) break;
      if (!(report.counts && (report.counts.blockers > 0 || report.counts.majors > 0))) break;
      let repairs = null;
      try {
        const ctx = require("../editing/context").createContextLoader({ store, maxEntries: 1 }).load(project, { plan: res.plan, ops: [] });
        repairs = QA.planRepairs(report, res.plan, { ...ctx, now: now(), previous: laps.length > 1 ? laps[laps.length - 2] : null, allowPlan: allowPlanRepair });
      } catch (e) { say("warn", `[video-edit] qa repair planning failed project=${projectId} code=${(e && e.code) || "INTERNAL"}`); }
      const ops = repairs && Array.isArray(repairs.ops) && allowPlanRepair ? repairs.ops : [];
      const actions = repairs && Array.isArray(repairs.renderActions) ? repairs.renderActions : [];
      if (typeof QA.shouldContinue === "function") {
        const d = QA.shouldContinue(laps, { maxLaps: lapsN, opsPlanned: ops.length + actions.length, budgetOk: true });
        if (!d.continue) break;
      } else if (!ops.length && !actions.length) break;
      let nextRev = current.revision;
      let changedRanges = [];
      if (ops.length) {
        try { const c = await commitRepair(projectId, current.revision, ops); nextRev = c.revision; changedRanges = c.ranges; committed.add(c.revision); }
        catch (e) { say("warn", `[video-edit] qa repair not applied project=${projectId} code=${(e && e.code) || "INTERNAL"}`); if (!actions.length) break; }
      }
      if (actions.length) invalidateForActions(projectId, actions, res);
      const rid = ids.newRenderId();
      await pushRecord(projectId, { id: rid, kind, profile, planRev: nextRev, planHash: revisionHash(store.get(projectId), nextRev), renderer: RENDERER_VERSION, status: "running", pct: 0, runId, createdAt: now(), stage: "RENDERING", qaLapOf: renderId, hidden: true });
      const lo = Math.round(((lap + 1) * 100) / (lapsN + 1)), hi = Math.round(((lap + 1.8) * 100) / (lapsN + 1));
      progress("QUALITY_CHECK", lo, "Fixing what the check found");
      try {
        const again = await renderOnce(nextRev, rid, runId, lapProgress(lo, hi));
        await patchRecord(projectId, rid, { status: "done", pct: 100, finishedAt: now(), ...recordFields(again) });
        current = { result: again, revision: nextRev, renderId: rid, changedRanges };
      } catch (e) {
        const aborted = !!(signal && signal.aborted);
        await patchRecord(projectId, rid, aborted ? { status: "cancelled", finishedAt: now() } : { status: "failed", finishedAt: now(), error: { code: (e && e.code) || "RENDER_FAILED", message: "The repair render failed." } }).catch(() => {});
        if (aborted) throw e;
        break;
      }
    }
    if (qaCost > 0) {
      await store.update(projectId, (d) => {
        d.cost = isPlain(d.cost) ? d.cost : { estimateUsd: 0, capUsd: 0, spentUsd: 0, byStage: {} };
        d.cost.spentUsd = Math.round(((Number(d.cost.spentUsd) || 0) + qaCost) * 1e8) / 1e8;
        d.cost.byStage = isPlain(d.cost.byStage) ? d.cost.byStage : {};
        d.cost.byStage.QUALITY_CHECK = Math.round(((Number(d.cost.byStage.QUALITY_CHECK) || 0) + qaCost) * 1e8) / 1e8;
      }).catch(() => {});
    }
    if (!laps.length) { progress("QUALITY_CHECK", 100, null, { finished: true }); return { result, qa: null }; }
    const final = QA.finalReport(laps);
    const shipped = laps.find((l) => l.lap === final.shippedLap) || laps[laps.length - 1];
    // An earlier lap shipped after a plan repair: append a 'restore' revision so the plan head matches what shipped.
    let restoredRevision = null;
    const headNow = planHead(store.get(projectId));
    if (allowPlanRepair && committed.has(headNow) && shipped.planRevision !== headNow) {
      try { restoredRevision = await restoreTo(projectId, shipped.planRevision); }
      catch (e) { say("warn", `[video-edit] qa restore failed project=${projectId} code=${(e && e.code) || "INTERNAL"}`); }
    }
    const qaReport = { ...final, restoredRevision, shippedRenderId: shipped.renderId !== renderId ? shipped.renderId : null, planRevision: shipped.planRevision, costUsd: qaCost };
    try {
      for (const rid of new Set([renderId, shipped.renderId])) {
        const dir = store.abs(projectId, `qa/${rid}`);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, "report.json"), JSON.stringify(qaReport, null, 1));
      }
    } catch { /* the report file is an enhancement */ }
    progress("QUALITY_CHECK", 100, null, { finished: true });
    return { result: shipped.result, qa: qaReport };
  }

  async function restoreTo(projectId, targetRev) {
    const Rev = require("../plan/revisions");
    const head = planHead(store.get(projectId));
    const doc = store.loadRevision(projectId, targetRev);
    const c = await Rev.commitRevision({ store, projectId, plan: doc.plan, author: "restore", summary: "Kept the better automatic version", opsCount: 0, expectedRevision: head, now: now() });
    publish(projectId, "plan", { headRevision: c.revision, headHash: c.hash, author: "restore" });
    return c.revision;
  }

  async function commitRepair(projectId, revision, ops) {
    const { applyOps } = require("../plan/ops");
    const Rev = require("../plan/revisions");
    const { createContextLoader } = require("../editing/context");
    const project = store.get(projectId);
    const head = planHead(project);
    if (head !== revision) throw new EditError("REVISION_CONFLICT", { status: 409, errorClass: "input", extra: { headRevision: head } });
    const doc = store.loadRevision(projectId, revision);
    const ctx = createContextLoader({ store, maxEntries: 1 }).load(project, { plan: doc.plan, ops });
    const out = applyOps(doc.plan, ops, { ...ctx, now: now(), author: "qa-repair" });
    const c = await Rev.commitRevision({ store, projectId, plan: out.plan, author: "qa-repair", summary: "Automatic quality fixes", opsCount: ops.length, expectedRevision: head, now: now() });
    publish(projectId, "plan", { headRevision: c.revision, headHash: c.hash, author: "qa-repair" });
    return { revision: c.revision, ranges: out.invalidates && Array.isArray(out.invalidates.ranges) ? out.invalidates.ranges : [] };
  }

  function invalidateForActions(projectId, actions, result) {
    // Render-level repairs force the affected cache levels to rebuild on the next lap.
    const dir = store.projectDir(projectId);
    for (const a of actions) {
      try {
        if (a.level === "chunks" && result.comp) {
          for (const c of result.comp.base.chunks) fs.rmSync(path.join(dir, "render/cache/aroll", `${c.key}.mp4`), { force: true });
          fs.rmSync(path.join(dir, "render/cache/base", `${result.comp.base.key}.mp4`), { force: true });
        }
        if (a.level === "post" && result.voiceRel) fs.rmSync(path.join(dir, result.voiceRel), { force: true });
      } catch { /* best effort */ }
    }
  }

  function recordFields(result) {
    return {
      compositionHash: result.compositionHash, durationSec: result.durationSec, width: result.width, height: result.height,
      file: result.files.mp4, files: result.files, segments: result.segments, bytes: result.bytes,
      notes: (result.notes || []).slice(0, 30), credits: (result.credits || []).slice(0, 40), audio: result.audio ? {
        integratedLufs: result.audio.integratedLufs ?? result.audio.lufs ?? null, truePeakDb: result.audio.truePeakDbtp ?? result.audio.truePeakDb ?? null,
      } : null,
    };
  }

  function qaSummary(qa) {
    if (!qa) return null;
    return { verdict: qa.verdict, score: qa.score, headline: qa.headline || null, counts: qa.counts || null, unverified: !!qa.unverified, visionUnverified: !!qa.visionUnverified, shippedLap: qa.shippedLap ?? 0 };
  }

  function integrityBlocked(qa) {
    return !!(qa && Array.isArray(qa.issues) && qa.issues.some((i) => i && i.severity === "blocker" && i.class === "I"));
  }

  async function runJob(job, { revision, profile }) {
    const { projectId, renderId, runId, kind } = job;
    job.revision = revision; job.profile = profile;
    if (job.ac.signal.aborted) return;
    const p0 = store.get(projectId);
    if (!p0) return;
    job.state = "running";
    const prevStatus = p0.status;
    const started = now();
    await patchRecord(projectId, renderId, { status: "running", startedAt: started, pct: 0 }, { runId }).then((rec) => emitRender(projectId, rec, true));
    if (kind === "export") {
      try {
        if (prevStatus === "NEEDS_ATTENTION" && p0.statusReason && p0.statusReason.code === "QA_INTEGRITY") await store.setStatus(projectId, "READY", { actor: "engine", reason: "export_retry" });
        const s = store.get(projectId).status;
        if (s === "READY" || s === "COMPLETED") await store.setStatus(projectId, "RENDERING", { actor: "engine", reason: "export" });
      } catch { /* status is informative */ }
    }
    const progress = progressReporter(job);
    try {
      const { result, qa: report } = await execute({ projectId, renderId, runId, kind, revision, profile, signal: job.ac.signal, progress });
      const blocked = integrityBlocked(report);
      const rec = await patchRecord(projectId, renderId, { status: "done", pct: 100, stage: null, finishedAt: now(), ...recordFields(result), qa: qaSummary(report), shippedRenderId: (report && report.shippedRenderId) || null }, { runId });
      await store.update(projectId, (d) => {
        if (kind === "export") {
          if (!blocked) {
            d.exports = { ...(isPlain(d.exports) ? d.exports : {}), currentId: renderId, stale: planHead(d) !== revision, history: [...((d.exports && d.exports.history) || []), renderId].slice(-20) };
          }
          d.qaSummary = qaSummary(report);
          if (d.status === "RENDERING") {
            d.status = blocked ? (d.exports && d.exports.currentId ? "COMPLETED" : "NEEDS_ATTENTION") : "COMPLETED";
            if (d.status === "NEEDS_ATTENTION") d.statusReason = { code: "QA_INTEGRITY", message: "The export failed its checks. Your edit is saved.", retryable: true, stage: "QUALITY_CHECK", actions: ["retry", "edit"] };
          }
        } else if (!d.qaSummary) d.qaSummary = qaSummary(report);
      }, { actor: "engine" });
      emitRender(projectId, rec, true);
      if (report) publish(projectId, "qa", { renderId, verdict: report.verdict, score: report.score });
      say("info", `[video-edit] render done project=${projectId} render=${renderId} kind=${kind} ms=${now() - started} qa=${report ? report.verdict : "-"}`);
    } catch (e) {
      const cancelledRun = job.ac.signal.aborted;
      const code = cancelledRun ? (isEditError(job.ac.signal.reason) ? job.ac.signal.reason.code : "CANCELLED") : (e && e.code) || "RENDER_FAILED";
      const status = cancelledRun ? "cancelled" : "failed";
      const rec = await patchRecord(projectId, renderId, { status, stage: null, finishedAt: now(), error: cancelledRun ? null : { code, message: "The render stopped before the file was finished. Your edit is safe." } }, { runId }).catch(() => null);
      if (kind === "export") {
        await store.update(projectId, (d) => {
          if (d.status !== "RENDERING") return;
          const hadExport = !!(d.exports && d.exports.currentId);
          d.status = hadExport ? "COMPLETED" : "READY";   // a failed or cancelled export never parks the edit
        }, { actor: "engine" }).catch(() => {});
        if (!cancelledRun) await store.addNotice(projectId, { code: "EXPORT_FAILED", severity: "warn", stage: "RENDERING", message: "The export failed; your edit is saved. Try again." }).catch(() => {});
      }
      emitRender(projectId, rec || { id: renderId, kind, status, planRev: revision, profile }, true);
      say(cancelledRun ? "info" : "warn", `[video-edit] render ${status} project=${projectId} render=${renderId} code=${code}`);
    }
  }

  // Inline auto-render inside the pipeline job (the AI's first draft).
  async function runInline(projectId, { signal, progress, markStage } = {}) {
    const project = store.get(projectId);
    if (!project) return null;
    const head = planHead(project);
    if (!(head > 0)) return null;
    const renderId = ids.newRenderId();
    const runId = ids.newRunId();
    const profile = "preview540";
    await pushRecord(projectId, { id: renderId, kind: "preview", profile, planRev: head, planHash: revisionHash(project, head), renderer: RENDERER_VERSION, status: "running", pct: 0, runId, createdAt: now(), startedAt: now(), auto: true });
    const job = { projectId, renderId, runId, kind: "preview", ac: new AbortController(), state: "running", lastEventAt: 0, revision: head, profile };
    const onAbort = () => job.ac.abort(signal.reason);
    if (signal) { if (signal.aborted) job.ac.abort(signal.reason); else signal.addEventListener("abort", onAbort, { once: true }); }
    jobs.set(renderId, job);
    const seen = new Set();
    const finished = new Set();
    const prog = progressReporter(job, (stage, pct, message, meta) => {
      if (typeof markStage === "function" && !seen.has(stage)) { seen.add(stage); markStage(stage, "running"); }
      if (typeof progress === "function") progress(stage, pct, message, meta);
      if (meta && meta.finished && typeof markStage === "function" && !finished.has(stage)) { finished.add(stage); markStage(stage, "done"); }
    });
    const closeStages = (status) => { if (typeof markStage === "function") for (const s of seen) if (!finished.has(s)) { finished.add(s); markStage(s, status); } };
    try {
      const { result, qa: report } = await serial(projectId, () => execute({ projectId, renderId, runId, kind: "preview", revision: head, profile, signal: job.ac.signal, progress: prog, allowPlanRepair: true }));
      const shippedRev = (report && report.restoredRevision) || result.revision || head;
      const rec = await patchRecord(projectId, renderId, { status: "done", pct: 100, stage: null, finishedAt: now(), ...recordFields(result), planRev: shippedRev, planHash: revisionHash(store.get(projectId), shippedRev), qa: qaSummary(report) }, { runId });
      await store.update(projectId, (d) => { d.qaSummary = qaSummary(report); });
      emitRender(projectId, rec, true);
      if (report) publish(projectId, "qa", { renderId, verdict: report.verdict, score: report.score });
      return { renderId, status: "done", qa: report };
    } catch (e) {
      if (job.ac.signal.aborted) {
        await patchRecord(projectId, renderId, { status: "cancelled", stage: null, finishedAt: now() }).catch(() => {});
        closeStages("interrupted");
        // Only the pipeline's own cancel is a pipeline cancel; a render-only cancel leaves the edit READY without a preview.
        if (signal && signal.aborted) throw e;
        return { renderId, status: "cancelled" };
      }
      closeStages("failed");
      await patchRecord(projectId, renderId, { status: "failed", stage: null, finishedAt: now(), error: { code: (e && e.code) || "RENDER_FAILED", message: "The first preview could not be rendered. Your edit is saved." } }).catch(() => {});
      say("warn", `[video-edit] auto render failed project=${projectId} code=${(e && e.code) || "INTERNAL"} detail=${String((e && e.detail) || (e && e.message) || "").slice(0, 200)}`);
      return { renderId, status: "failed", error: e };
    } finally {
      jobs.delete(renderId);
      if (signal) signal.removeEventListener("abort", onAbort);
    }
  }

  async function cancelJob(projectId, renderId, reason = "CANCELLED") {
    const job = jobs.get(renderId);
    if (!job || job.projectId !== projectId) throw new EditError("NOTHING_TO_CANCEL", { status: 409, errorClass: "input" });
    job.ac.abort(new EditError(reason, { status: 409, errorClass: "cancelled" }));
    if (job.state === "queued") {
      await patchRecord(projectId, renderId, { status: "cancelled", finishedAt: now() }).then((rec) => emitRender(projectId, rec, true)).catch(() => {});
    }
    return { cancelled: true, renderId };
  }

  async function cancel(projectId, { renderId = null } = {}) {
    if (renderId) return cancelJob(projectId, renderId);
    const mine = [...jobs.values()].filter((j) => j.projectId === projectId);
    if (!mine.length) throw new EditError("NOTHING_TO_CANCEL", { status: 409, errorClass: "input" });
    const running = mine.find((j) => j.state === "running") || mine[0];
    return cancelJob(projectId, running.renderId);
  }

  async function abortProject(projectId, { waitMs = 10000 } = {}) {
    const mine = [...jobs.values()].filter((j) => j.projectId === projectId);
    for (const j of mine) j.ac.abort(new EditError("ABORTED", { status: 409, errorClass: "cancelled" }));
    const waits = mine.map((j) => j.promise).filter(Boolean);
    if (!waits.length) return mine.length > 0;
    let timer;
    await Promise.race([Promise.allSettled(waits), new Promise((r) => { timer = setTimeout(r, waitMs); if (timer.unref) timer.unref(); })]);
    clearTimeout(timer);
    return true;
  }

  async function stopAll({ timeoutMs = 10000 } = {}) {
    stopping = true;
    const all = [...jobs.values()];
    for (const j of all) j.ac.abort(new EditError("SHUTDOWN", { status: 503, errorClass: "cancelled", retryable: true }));
    let timer;
    await Promise.race([Promise.allSettled(all.map((j) => j.promise).filter(Boolean)), new Promise((r) => { timer = setTimeout(r, timeoutMs); if (timer.unref) timer.unref(); })]);
    clearTimeout(timer);
    return { stopped: all.length };
  }

  // An edit whose latest preview (of its current head) was made by an older renderer gets a fresh preview when it
  // is opened, so renderer fixes reach existing edits without the person having to change anything. Only when the
  // edit is idle and that preview is the newest one; the queued record it creates stops a second trigger.
  function refreshStalePreview(projectId) {
    try {
      if (stopping) return false;
      const project = store.get(projectId);
      if (!project || !["READY", "COMPLETED"].includes(project.status)) return false;
      const head = planHead(project);
      if (!(head > 0)) return false;
      if ([...jobs.values()].some((j) => j.projectId === projectId)) return false;
      const previews = (Array.isArray(project.renders) ? project.renders : []).filter((r) => r && !r.hidden && r.kind === "preview");
      const latest = previews[previews.length - 1];
      if (!latest || latest.status !== "done" || latest.renderer === RENDERER_VERSION || latest.planRev !== head) return false;
      request(projectId, { kind: "preview" }).catch((e) => say("warn", `[video-edit] preview refresh not queued project=${projectId} code=${(e && e.code) || "INTERNAL"}`));
      say("info", `[video-edit] preview refresh queued project=${projectId} (renderer ${latest.renderer || "legacy"} -> ${RENDERER_VERSION})`);
      return true;
    } catch { return false; }
  }

  return {
    request, runInline, cancel, abortProject, stopAll, recordView, refreshStalePreview,
    isActive: (projectId) => [...jobs.values()].some((j) => j.projectId === projectId),
    activeIds: () => [...new Set([...jobs.values()].map((j) => j.projectId))],
    hasQa: () => !!QA,
  };
}

module.exports = { createRenderJobs, RENDER_STAGES };
