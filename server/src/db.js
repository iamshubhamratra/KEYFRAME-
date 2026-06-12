// In-memory job store with atomic JSON persistence.
// No native deps — works on any Node version EB might pick for us.
// Scale target: up to a few thousand jobs retained, trivially fast.

const fs = require("node:fs");
const path = require("node:path");
const config = require("./config");

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

// Crash recovery: orphaned jobs at boot cannot finish.
let recovered = 0;
for (const j of jobs.values()) {
  if (j.status === "queued" || j.status === "running") {
    j.status = "failed";
    j.error = j.error || "server restarted while job was in-flight";
    j.finished_at = Date.now();
    recovered++;
  }
}
if (recovered > 0) {
  console.log(`[db] recovered ${recovered} orphaned job(s) at boot`);
  persist();
}

function shape(j) {
  if (!j) return null;
  return {
    jobId: j.id,
    kind: j.kind || "generate",
    status: j.status,
    progress: j.progress,
    videoUrl: j.video_url,
    error: j.error,
    orientation: j.orientation,
    quality: j.quality,
    width: j.width,
    height: j.height,
    fps: j.fps,
    duration: j.duration,
    framePack: j.frame_pack || null,
    createdAt: j.created_at,
    startedAt: j.started_at,
    finishedAt: j.finished_at,
    durationMs: j.finished_at && j.started_at ? j.finished_at - j.started_at : null,
    usedFallback: j.used_fallback === 1,
    finalAttempt: j.final_attempt || null,
    usage: j.usage || null,
    stageTimings: j.stage_timings || null,
    brief: j.brief || null,
    script: j.script || null,
    scriptWarnings: j.script_warnings || null,
    assets: j.assets || null,
    captions: j.captions || null,
    srtUrl: j.srt_url || null,
    qa: j.qa || null,
  };
}

module.exports = {
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
      captions_enabled: job.captionsEnabled === false ? 0 : 1,
      upload_path: job.uploadPath || null,
      intent: job.intent || null,
      autopilot: job.autopilot ? 1 : 0,
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
    if (framePack) j.frame_pack = framePack;
    if (usage) j.usage = usage;
    if (stageTimings) j.stage_timings = { ...(j.stage_timings || {}), ...stageTimings };
    scheduleWrite();
  },

  // User approved (possibly edited) script: store it and requeue.
  markApproved(id, { script }) {
    const j = jobs.get(id); if (!j) return;
    j.script = script;
    j.status = "queued";
    j.progress = "approved";
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

  get(id) { return shape(jobs.get(id)); },
  getRaw(id) { return jobs.get(id) || null; },

  // Recent jobs, newest first (gallery). Lightweight shape — no script/brief.
  listRecent({ limit = 30, status } = {}) {
    const all = [...jobs.values()]
      .filter((j) => !status || j.status === status)
      .sort((a, b) => b.created_at - a.created_at)
      .slice(0, limit);
    return all.map((j) => ({
      jobId: j.id,
      kind: j.kind || "generate",
      status: j.status,
      title: (j.script && j.script.title) || (j.prompt || "").slice(0, 80) || null,
      videoUrl: j.video_url,
      framePack: j.frame_pack || null,
      duration: j.duration,
      orientation: j.orientation,
      createdAt: j.created_at,
    }));
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
    scheduleWrite();
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
    scheduleWrite();
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
