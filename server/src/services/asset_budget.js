// Duration-adaptive asset BUDGET — the single authority for "how many assets a film
// should collect". Pure, deterministic, no I/O; safe to call from any asset path.
//
// WHY THIS EXISTS: every asset cap in the pipeline used to be a fixed literal (8 vectors
// / 12 photos / 2 video in graph.js, 6 in project_pipeline, 14 in asset_planner), tuned by
// hand on short ~12-15s test films. A 120s film therefore got the SAME stock ceiling as a
// 15s one, so its extra scenes starved. This module scales the STOCK budget with runtime,
// matching the product target table:
//
//     30s → 8-15   |   60s → 20-35   |   90s → 35-50   |   120s → 50-70   (total assets)
//
// DESIGN DECISIONS (confirmed with the product owner, 2026-07-25):
//   • SOFT TARGET, not a hard cap — the Creative Director + Visual Layout Director curate
//     the collected pool down to what actually reads well; this sizes the CANDIDATE pool.
//   • VIDEO STAYS FIXED (1-2) regardless of duration — 2+ concurrent videos blow the
//     Chromium render budget (observed 480s+ renders); only photos/vectors scale.
//   • `total` is the STOCK budget (photo + vector + video). User uploads, website
//     screenshots, and harvested brand assets are OWNED material — they are additive pins
//     and are NEVER reduced below today's baselines to hit a number (tier-100 assets are
//     sacred). maxUploads therefore floors at 6 (today's value) and only grows.
//   • A per-SCENE floor (2 candidates/scene) sits under the per-second target so a
//     scene-rich short film still gives every scene something to work with.

// A stock photo/vector budget of `total`, split so photos lead and video stays low.
function computeAssetBudget({ durationSec, sceneCount = 0, hasUploads = false, videoOk = true } = {}) {
  const d = Math.max(5, Number(durationSec) || 12);
  const sc = Math.max(0, Number(sceneCount) || 0);

  // ~0.5 assets/second hits the midpoint of every target-table row; the per-scene floor
  // keeps scene-rich films from starving; clamp to the table's outer bounds [8, 70].
  const perSecond = Math.round(d * 0.5);      // 30→15, 60→30, 90→45, 120→60
  const perSceneFloor = sc * 2;               // ≥2 stock candidates per scene
  const total = Math.min(70, Math.max(8, perSecond, perSceneFloor));

  // Video is a render-budget guard, not a density knob: at most 1 (with uploads) or 2.
  const maxVideos = videoOk ? Math.min(hasUploads ? 1 : 2, Math.max(1, Math.round(total * 0.06))) : 0;
  const maxVectors = Math.round(total * 0.35);
  const maxPhotos = Math.max(0, total - maxVideos - maxVectors);

  return {
    total,
    maxPhotos,
    maxVectors,
    maxVideos,
    // OWNED pins — scale UP with duration, never below today's fixed baselines
    // (uploads were fixed 6; screenshots 2/3; brand 2/4). Never drop user material.
    maxUploads:     Math.min(12, Math.max(6, Math.round(total * 0.20))),
    maxScreenshots: hasUploads ? 2 : Math.min(5, Math.max(3, Math.round(d / 40) + 2)),
    maxBrand:       hasUploads ? 2 : Math.min(6, Math.max(4, Math.round(total * 0.12))),
    // Creative Director levers — the CD net-new fetch ceiling scales so a bigger candidate
    // pool isn't bottlenecked at the old fixed 3. maxPerScene stays a fixed CLUTTER guard.
    // (Wired into creative_director.js in a later phase; exported now for consumers.)
    cdMaxTopUp:     Math.min(12, Math.max(3, Math.round(d / 20))),
    cdMaxPerScene:  2,
  };
}

module.exports = { computeAssetBudget };
