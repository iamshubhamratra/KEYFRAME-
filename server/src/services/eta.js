// ETA heuristics. Calibrated from observed data:
//   30s vertical 1080x1920 on t3.medium (2 vCPU Xeon) = 547s total.
// Subtract LLM+pipeline overhead → pure render ≈ ~17s of wall clock per 1s
// of vertical video output on 2 vCPU. Scales ~linearly with cores down
// to a floor (diminishing returns past 4-8 vCPU).

// Wall seconds per 1 second of video output at draft quality, 1080p, 4 vCPU.
// Calibrated to observed ~540s for 20s vertical 1080x1920 video on t3.xlarge.
const BASE_SPS_AT_1080P = {
  horizontal: 6,   // 1920x1080
  vertical:  10,   // 1080x1920 (more pixels per frame)
  square:     7,   // 1080x1080
};

const LLM_OVERHEAD_SEC      = 30;
const PIPELINE_OVERHEAD_SEC = 15;

// Render time scales roughly with pixel count. 720p has ~44% the pixels of
// 1080p, so renders ~44% as fast (in the best case). 480p has ~20%.
const PIXEL_FACTOR_BY_QUALITY = {
  "480p":  0.22,
  "720p":  0.44,
  "1080p": 1.00,
};

function cpuFactor(cpus) {
  return Math.max(0.5, 4 / Math.max(1, cpus));
}

function renderQualityMultiplier(renderQuality) {
  return renderQuality === "default" ? 2.0 : 1.0;
}

function estimateRenderSec({ duration, orientation, resolutionQuality, renderQuality, cpus }) {
  const spsBase  = BASE_SPS_AT_1080P[orientation] || 8;
  const pxFactor = PIXEL_FACTOR_BY_QUALITY[resolutionQuality] ?? 1.0;
  const renderOnly = duration * spsBase * pxFactor * renderQualityMultiplier(renderQuality) * cpuFactor(cpus);
  return Math.round(renderOnly + LLM_OVERHEAD_SEC + PIPELINE_OVERHEAD_SEC);
}

/**
 * Estimate wall-clock wait time before this job starts rendering + how long
 * its own render takes, given queue state.
 *
 * jobsAhead = activeRenders + jobsQueuedBeforeThisOne
 */
function estimateEta({ duration, orientation, quality, cpus, jobsAhead, concurrency }) {
  const renderSec = estimateRenderSec({ duration, orientation, quality, cpus });
  if (jobsAhead < concurrency) {
    // Free capacity — render starts essentially immediately.
    return { renderSec, waitSec: 0, totalSec: renderSec };
  }
  // All slots busy. Count waves of `concurrency` jobs that must clear before mine.
  const jobsToClear = jobsAhead - concurrency + 1;
  const waves = Math.ceil(jobsToClear / concurrency);
  const waitSec = waves * renderSec;
  return { renderSec, waitSec, totalSec: waitSec + renderSec };
}

/**
 * Remaining seconds for a job that has already started rendering.
 */
function estimateRemainingSec({ duration, orientation, quality, cpus, startedAtMs }) {
  const totalRender = estimateRenderSec({ duration, orientation, quality, cpus });
  if (!startedAtMs) return totalRender;
  const elapsed = Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000));
  return Math.max(0, totalRender - elapsed);
}

module.exports = { estimateEta, estimateRenderSec, estimateRemainingSec };
