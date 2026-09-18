// JOB MODEL — every film job (single-shot generate + script-checkpoint project),
// held in memory with atomic JSON persistence to jobs.json.
// No native deps — works on any Node version EB might pick for us.
// Scale target: up to a few thousand jobs retained, trivially fast.
//
// Records are stored and returned RAW (snake_case, as persisted). Turning one into
// the API's JSON is views/job.js's job, so the pipeline and the HTTP layer read the
// same record and only the controllers present it.

const fs = require("node:fs");
const path = require("node:path");
const config = require("../config");

const DB_FILE = config.paths.dbFile;
const TMP_FILE = DB_FILE + ".tmp";

fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });

/** @type {Map<string, object>} */
const jobs = new Map();

function load() {
  try {
    const raw = fs.readFileSync(DB_FILE, "utf8");
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) {
      for (const j of arr) if (j && j.id) jobs.set(j.id, j);
    }
  } catch (e) {
    if (e.code !== "ENOENT") {
      console.warn(`[db] could not load ${DB_FILE}: ${e.message}. Starting fresh.`);
    }
  }
}

let writeTimer = null;
function scheduleWrite() {
  if (writeTimer) return;
  writeTimer = setTimeout(() => { writeTimer = null; persist(); }, 100);
  writeTimer.unref?.();
}

function persist() {
  try {
    const arr = Array.from(jobs.values());
    fs.writeFileSync(TMP_FILE, JSON.stringify(arr), "utf8");
    fs.renameSync(TMP_FILE, DB_FILE);
  } catch (e) {
    console.error(`[db] persist failed: ${e.message}`);
  }
}

// ---- bootstrap ----
load();

// Crash recovery: orphaned jobs at boot are RE-QUEUED (once) instead of
// failed — under the `node --watch` dev loop any source-file save restarts
// the server, and failing every in-flight take made that loop brutal
// ("TAKE FAILED — start over"). server.js drains takeOrphanedTasks() into the
// queue once the pipelines are wired:
//   - generate-kind: replays the persisted `task` (flags included).
//   - project-kind: runIntake/runProduction are replayable from the job
//     record itself (intent/upload for intake, approved script for
//     production) — the recovery entry carries which phase was in flight.
//     Jobs sitting at approval are not queued/running, so untouched.
// Requeue guard: the point is to stop a job that CRASHES the server in a
// loop, not to punish an active dev session. A crash-loop re-orphans the same
// job within seconds; `node --watch` restarts from file saves arrive minutes
// apart while a take runs for ~10. So: allow up to MAX_REQUEUES as long as
// the previous requeue was over REQUEUE_COOLDOWN_MS ago — rapid re-orphaning
// (the crash signature) still fails after the first retry.
const MAX_REQUEUES = 8;
const REQUEUE_COOLDOWN_MS = 25_000; // crash-loops re-orphan in ~5-10s; dev saves arrive slower
const orphanedTasks = [];
let recovered = 0;
let requeued = 0;
const INTAKE_STAGES = new Set(["ingest", "brief", "script"]);
for (const j of jobs.values()) {
  if (j.status !== "queued" && j.status !== "running") continue;
  const kind = j.kind || "generate";
  let entry = null;
  const count = j.requeue_count || 0;
  const calmEnough = count === 0 || (Date.now() - (j.last_requeue_at || 0)) > REQUEUE_COOLDOWN_MS;
  if (count < MAX_REQUEUES && calmEnough) {
    if (kind === "generate" && j.task) {
      entry = { kind: "generate", task: j.task };
    } else if (kind === "project") {
      // Production is only replayable once a script was approved & persisted.
      const phase = (!j.progress || INTAKE_STAGES.has(j.progress)) ? "intake" : (j.script ? "production" : "intake");
      entry = { kind: "project", jobId: j.id, phase };
    }
  }
  if (entry) {
    j.status = "queued";
    j.progress = null;
    j.started_at = null;
    j.requeue_count = (j.requeue_count || 0) + 1;
    j.last_requeue_at = Date.now();
    orphanedTasks.push(entry);
    requeued++;
  } else {
    j.status = "failed";
    j.error = j.error || "server restarted while job was in-flight";
    j.finished_at = Date.now();
    recovered++;
  }
}
if (recovered > 0 || requeued > 0) {
  console.log(`[db] boot recovery: ${requeued} orphaned job(s) requeued, ${recovered} failed`);
  persist();
}

module.exports = {
  // One-shot drain of the boot-requeued generate tasks (see recovery above).
  takeOrphanedTasks() {
    return orphanedTasks.splice(0, orphanedTasks.length);
  },

  insert(job) {
    const rec = {
      id: job.id,
      kind: job.kind || "generate",
      prompt: job.prompt,
      duration: job.duration,
      orientation: job.orientation,
      quality: job.quality,
      width: job.width,
      height: job.height,
      fps: job.fps,
      frame_pack: job.framePack || null,
      // 1 = the user explicitly picked this pack in the gallery ("auto" arrives
      // as null). The composition agent pins user-picked packs to the
      // deterministic scene-kit so the film actually looks like the template.
      frame_pack_user: job.framePack ? 1 : 0,
      status: "queued",
      progress: null,
      video_url: null,
      error: null,
      used_fallback: 0,
      llm_tokens_in: 0,
      llm_tokens_out: 0,
      created_at: job.created_at,
      started_at: null,
      finished_at: null,
      client_ip: job.client_ip,
      voice_style: job.voiceStyle || null,
      // Subtitles are OPT-IN: off unless the request explicitly asks for them.
      captions_enabled: (job.captions === true || job.captionsEnabled === true) ? 1 : 0,
      // Full multi-language caption settings (subtitle language, voiceover
      // language, on-screen video-text language, SRT/VTT export). The boolean
      // above stays the legacy switch; this carries the three independent
      // language axes the Language Director resolves into one plan.
      captions_config: job.captionsConfig || null,
      voiceover_enabled: job.voiceoverEnabled === false ? 0 : 1,
      brand_palette: job.brandPalette || null,
      upload_path: job.uploadPath || null,
      user_assets: job.userAssets || null,
      // Full pipeline task (flags included) so a boot-orphaned generate job
      // can be requeued faithfully instead of failed. null for other kinds.
      task: job.task || null,
      requeue_count: 0,
      intent: job.intent || null,
      autopilot: job.autopilot ? 1 : 0,
      render3d: job.render3d ? 1 : 0, // Three.js/WebGL composer (project pipeline reads job.render3d)
      // Per-video finish: "premium" = LLM composer (scene-kit fallback),
      // "standard" = deterministic scene-kit, null = server default.
      compose_mode: job.composeMode === "premium" || job.composeMode === "standard" ? job.composeMode : null,
      // How densely the film is told ("relaxed"|"normal"|"fast"|"veryFast" —
      // see services/pacing.js). The routes have already validated it against
      // config.pacing. Rows written before the feature carry no pace at all;
      // pacing.resolve() reads a missing one as `normal`, which is exactly what
      // those films were made at, so nothing is backfilled or migrated.
      pace: job.pace || null,
      brief: null,
      script: null,
      script_warnings: null,
    };
    jobs.set(job.id, rec);
    scheduleWrite();
  },

  // ---- project (script-checkpoint) lifecycle ----

  // Intake finished: brief + draft script ready, pipeline paused for review.
  markScriptReview(id, { brief, script, warnings, framePack, usage, stageTimings }) {
    const j = jobs.get(id); if (!j) return;
    j.status = "script_review";
    j.progress = "script_review";
    j.brief = brief;
    j.script = script;
    j.script_warnings = warnings || [];
    // The brief's suggestedFramePack fills the AUTO case only. An EXPLICIT
    // user selection (frame_pack set at insert) must never be overwritten —
    // when the LLM's suggestion deviated, the user's chosen template was
    // silently replaced before production ever read it.
    if (framePack && !j.frame_pack) j.frame_pack = framePack;
    if (usage) j.usage = usage;
    if (stageTimings) j.stage_timings = { ...(j.stage_timings || {}), ...stageTimings };
    scheduleWrite();
  },

  // Record the pack the pipeline resolved for an "auto" job (so the UI /
  // gallery filters show the real pack, not null).
  setFramePack(id, framePack) {
    const j = jobs.get(id); if (!j || !framePack) return;
    j.frame_pack = framePack;
    scheduleWrite();
  },

  // User approved (possibly edited) script: store it and requeue.
  markApproved(id, { script }) {
    const j = jobs.get(id); if (!j) return;
    j.script = script;
    j.status = "queued";
    j.progress = "approved";
    // Flush SYNCHRONOUSLY: this transition gates whether boot recovery can
    // resume production. A --watch restart inside the 100ms debounce window
    // reloaded the job as script_review and silently dropped the approval
    // (observed live) — the queued production died with the process.
    persist();
  },

  // Art Director report (the accent-only brand skin applied to the composition).
  setBrandReview(id, review) {
    const j = jobs.get(id); if (!j) return;
    j.brand_review = review || null;
    scheduleWrite();
  },

  // The user-upload manifest (logo + product images), written at create and
  // refined by intake classification. markRequeued does NOT clear it, so a
  // regenerate keeps the uploads.
  setUserAssets(id, manifest) {
    const j = jobs.get(id); if (!j) return;
    j.user_assets = Array.isArray(manifest) ? manifest : null;
    scheduleWrite();
  },

  // Visual Layout Director report (kept/demoted asset counts, hero scale, montage
  // budget, per-scene composition score). Surfaced to the UI via the job view.
  setLayoutReview(id, review) {
    const j = jobs.get(id); if (!j) return;
    j.layout_review = review || null;
    scheduleWrite();
  },

  // Text Director report (how many text slots were mined/injected per film).
  setTextReview(id, review) {
    const j = jobs.get(id); if (!j) return;
    j.text_review = review || null;
    scheduleWrite();
  },

  // Template Director report (which authored template scene each beat was cast
  // as, how many carry media, and any unsourced numbers the fact guard dropped).
  setTemplateReview(id, review) {
    const j = jobs.get(id); if (!j) return;
    j.template_review = review || null;
    scheduleWrite();
  },

  // Audio degradation notes (silent-shipping must never be silent to the user).
  setAudioNotes(id, notes) {
    const j = jobs.get(id); if (!j) return;
    j.audio_notes = Array.isArray(notes) && notes.length ? notes : null;
    scheduleWrite();
  },

  // Asset manifest (with license/source for attribution in the UI).
  setAssets(id, assets) {
    const j = jobs.get(id); if (!j) return;
    j.assets = assets || [];
    scheduleWrite();
  },

  // QA agent verdict.
  setQa(id, qa) {
    const j = jobs.get(id); if (!j) return;
    j.qa = qa || null;
    scheduleWrite();
  },

  // Creative Director report (asset verdicts, screenshot rankings, audio notes).
  setCreativeReview(id, report) {
    const j = jobs.get(id); if (!j) return;
    j.creative_review = report || null;
    scheduleWrite();
  },

  // Quality Director report — the aggregated, cross-dimension quality summary
  // (contrast fixes, audio loudness, screenshot QA, asset/template scores, QA
  // verdict) assembled at delivery. See services/quality_report.js.
  setQualityReport(id, report) {
    const j = jobs.get(id); if (!j) return;
    j.quality_report = report || null;
    scheduleWrite();
  },

  // Delivery probe — what ffprobe found in the file we actually handed over
  // (resolution, duration, fps, audio presence) plus any mismatch against what
  // was requested. Every other check in the pipeline runs on the PLAN; this is
  // the only one that runs on the artifact. See services/video_probe.js.
  setDeliveryProbe(id, probe) {
    const j = jobs.get(id); if (!j) return;
    j.delivery_probe = probe || null;
    scheduleWrite();
  },

  // Deterministic soundtrack validation (services/audio_report.js) — cue-to-scene
  // mapping, duplicate effects, voice protection, loudness. Feeds delivery_quality.
  setAudioReport(id, report) {
    const j = jobs.get(id); if (!j) return;
    j.audio_report = report || null;
    scheduleWrite();
  },

  // Pre-render validation gate report (services/preflight.js) — self-heal count,
  // per-scene visual coverage, and the warnings delivery_quality reads.
  setValidationReport(id, report) {
    const j = jobs.get(id); if (!j) return;
    j.validation_report = report || null;
    scheduleWrite();
  },

  // Pacing report (services/pacing.js, written by the graph) — what the chosen
  // pace TARGETED (scene seconds, cut seconds, word budget) against what the
  // finished film actually delivered, plus every clamp the engine had to apply.
  // Pace is the one feature whose failure is invisible in the artifact — a film
  // that ignored "fast" is still a valid film — so the numbers are recorded.
  setPacingReport(id, report) {
    const j = jobs.get(id); if (!j) return;
    j.pacing_report = report || null;
    scheduleWrite();
  },

  // Localization Director report — how much of the storyboard's on-screen text
  // was verified as translated into the video-text language, and what fell back.
  setLocalization(id, report) {
    const j = jobs.get(id); if (!j) return;
    j.localization = report || null;
    scheduleWrite();
  },

  // Pre-render language QA — was the script font actually embedded (else tofu),
  // and how much English leaked into the on-screen DOM text. Disclosure only.
  setLanguageQa(id, report) {
    const j = jobs.get(id); if (!j) return;
    j.language_qa = report || null;
    scheduleWrite();
  },

  // The resolved language plan (the three axes + font/direction/glossary).
  setLanguagePlan(id, plan) {
    const j = jobs.get(id); if (!j) return;
    j.language_plan = plan || null;
    scheduleWrite();
  },

  // The job record exactly as stored, or null. views/job.js presents it for the API.
  getRaw(id) {
    return jobs.get(id) || null;
  },

  // Caption cues + exported .srt URL.
  setCaptions(id, { cues, srtUrl }) {
    const j = jobs.get(id); if (!j) return;
    j.captions = cues || [];
    j.srt_url = srtUrl || null;
    scheduleWrite();
  },

  // Regenerate: requeue intake, optionally discarding the stored brief.
  markRequeued(id, { clearBrief = false, progress = "regenerate" } = {}) {
    const j = jobs.get(id); if (!j) return;
    j.status = "queued";
    j.progress = progress;
    j.script = null;
    j.error = null;
    if (clearBrief) j.brief = null;
    scheduleWrite();
  },

  // Recent job records, newest first, optionally filtered by status.
  listRecent({ limit = 30, status } = {}) {
    return [...jobs.values()]
      .filter((j) => !status || j.status === status)
      .sort((a, b) => b.created_at - a.created_at)
      .slice(0, limit);
  },

  markStarted(id) {
    const j = jobs.get(id); if (!j) return;
    j.status = "running";
    j.started_at = Date.now();
    scheduleWrite();
  },

  setProgress(id, progress) {
    const j = jobs.get(id); if (!j) return;
    j.progress = progress;
    scheduleWrite();
  },

  markDone(id, { videoUrl, usedFallback, tokensIn, tokensOut, usage, stageTimings, finalAttempt }) {
    const j = jobs.get(id); if (!j) return;
    j.status = "done";
    j.progress = "finalizing";
    j.video_url = videoUrl;
    j.finished_at = Date.now();
    j.used_fallback = usedFallback ? 1 : 0;
    j.llm_tokens_in = tokensIn || 0;
    j.llm_tokens_out = tokensOut || 0;
    if (usage)        j.usage         = usage;
    if (stageTimings) j.stage_timings = stageTimings;
    if (finalAttempt) j.final_attempt = finalAttempt;
    persist(); // terminal transition — flush so a restart can't resurrect the job
  },

  markFailed(id, errorMsg, tokensIn = 0, tokensOut = 0, usage, stageTimings) {
    const j = jobs.get(id); if (!j) return;
    j.status = "failed";
    j.error = String(errorMsg).slice(0, 2000);
    j.finished_at = Date.now();
    j.llm_tokens_in = tokensIn;
    j.llm_tokens_out = tokensOut;
    if (usage)        j.usage         = usage;
    if (stageTimings) j.stage_timings = stageTimings;
    persist(); // terminal transition — flush so a restart can't resurrect the job
  },

  countJobsSince(sinceMs) {
    let n = 0;
    for (const j of jobs.values()) if (j.created_at > sinceMs) n++;
    return n;
  },

  queueDepth() {
    let n = 0;
    for (const j of jobs.values()) {
      if (j.status === "queued" || j.status === "running") n++;
    }
    return n;
  },

  activeCount() {
    let n = 0;
    for (const j of jobs.values()) if (j.status === "running") n++;
    return n;
  },

  queuePosition(id) {
    const me = jobs.get(id);
    if (!me || me.status !== "queued") return null;
    let pos = 1;
    for (const j of jobs.values()) {
      if (j.status === "queued" && j.created_at < me.created_at) pos++;
    }
    return pos;
  },

  close() {
    if (writeTimer) { clearTimeout(writeTimer); writeTimer = null; }
    persist();
  },
};
