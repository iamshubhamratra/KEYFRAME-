// JOB VIEW — how a stored job record (models/job.js, snake_case) is presented as
// API JSON. The full view backs GET /api/projects/:id, /api/jobs/:id and the SSE
// streams; the summary backs the gallery list.

const fs = require("node:fs");
const path = require("node:path");
const config = require("../config");
const { assessDelivery } = require("../services/delivery_quality");

// A finished job keeps its video_url in the record forever, but the janitor
// deletes the rendered .mp4 after its retention window. The gallery renders a
// <video> for every project the API advertises a videoUrl for — so stale rows
// pointing at deleted files turned the whole wall into 404s. Only surface a
// videoUrl when the file is still on disk (cheap: stat, memoized by mtime-free
// path). Never deletes anything; just stops advertising dead links.
const _videoExistsCache = new Map(); // videoUrl -> { at, ok }
function videoUrlIfExists(videoUrl) {
  if (!videoUrl || typeof videoUrl !== "string") return null;
  const cached = _videoExistsCache.get(videoUrl);
  const now = Date.now();
  if (cached && now - cached.at < 30_000) return cached.ok ? videoUrl : null;
  let ok = false;
  try {
    // videoUrl is a public-relative path like "/videos/<id>.mp4".
    const rel = videoUrl.replace(/^\/+/, "");
    ok = fs.existsSync(path.join(config.paths.root, "public", rel));
  } catch { ok = false; }
  _videoExistsCache.set(videoUrl, { at: now, ok });
  return ok ? videoUrl : null;
}

function present(j) {
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
    voiceoverEnabled: j.voiceover_enabled !== 0,
    brandPalette: j.brand_palette || null,
    userAssets: Array.isArray(j.user_assets) ? j.user_assets.map((u) => ({
      id: u.id, role: u.role, path: u.path, originalName: u.originalName,
      assetType: u.assetType || null, classified: u.classified === true,
      sees: u.sees || null, quality: u.quality == null ? null : u.quality,
    })) : null,
    createdAt: j.created_at,
    startedAt: j.started_at,
    finishedAt: j.finished_at,
    durationMs: j.finished_at && j.started_at ? j.finished_at - j.started_at : null,
    usedFallback: j.used_fallback === 1,
    finalAttempt: j.final_attempt || null,
    composeMode: j.compose_mode || null,
    pace: j.pace || null, // null on pre-pacing rows — consumers resolve that to `normal`
    audioNotes: j.audio_notes || null,
    usage: j.usage || null,
    stageTimings: j.stage_timings || null,
    brief: j.brief || null,
    script: j.script || null,
    scriptWarnings: j.script_warnings || null,
    assets: j.assets || null,
    captions: j.captions || null,
    srtUrl: j.srt_url || null,
    qa: j.qa || null,
    creativeReview: j.creative_review || null,
    qualityReport: j.quality_report || null,
    deliveryProbe: j.delivery_probe || null,
    // ONE honest verdict on the finished film, assembled from signals the
    // pipeline already produced (QA's frame review, empty-scene counts, the
    // delivery probe, audio, fallback). Every one of these was already being
    // DETECTED and RECORDED before delivery and then shipped silently — nothing
    // turned them into something the person watching the result could see.
    // Policy is deliver-and-flag: the film is still handed over, but the job says
    // what is wrong with it. Computed on read (pure, fail-open).
    deliveryQuality: (() => {
      if (j.status !== "done") return null;
      try { return assessDelivery(j); } catch { return null; }
    })(),
  };
}

// Gallery card: lightweight — no script/brief.
function presentSummary(j) {
  return {
    jobId: j.id,
    kind: j.kind || "generate",
    status: j.status,
    title: (j.script && j.script.title) || (j.prompt || "").slice(0, 80) || null,
    videoUrl: videoUrlIfExists(j.video_url),
    framePack: j.frame_pack || null,
    duration: j.duration,
    orientation: j.orientation,
    createdAt: j.created_at,
  };
}

module.exports = { present, presentSummary };
