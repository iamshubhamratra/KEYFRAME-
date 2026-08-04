// Visual Layout Director — the composition authority between the Creative Director
// and Asset Placement. The Creative Director already decides WHICH assets are good
// (6-dimension scores, prominence, scene assignment). The Visual Layout Director
// decides how they are PRESENTED: how many appear prominently, how big the hero is,
// how tightly a montage is packed, and where each image is cropped — so every frame
// reads like it was laid out by a senior product designer (Apple / Linear / Framer),
// not auto-assembled.
//
// It is the promotion of the old pure-JS layout_planner: it still types each scene's
// base archetype (planLayout), and now ALSO emits the visual-composition spec that
// scene_kit honors — an accent-only set of size/count/crop knobs, plus a per-scene
// composition score for the Premiere UI.
//
// DETERMINISTIC + REUSES CD SCORES: no second vision pass. It ranks by the CD's
// `cdScore` (+ CLIP `clipRelevance`) and re-levels prominence via the SAME machinery
// scene_kit already respects (`visionOk` gates prominent slots; demoted assets fall
// to scrimmed B-roll, never wasted). So "keep the best few, show them big" is
// achieved by demoting the weak ones to background — no asset is discarded.
//
// FAIL-OPEN (mirrors creative_director / audio_director): any error returns the
// assets unchanged with an archetype-only plan, so it can never starve or block a
// render.

const db = require("../db");
const config = require("../config");
const { planLayout } = require("./layout_planner");
const { isTrustedProminent, isLogo, rankKey, WEBSITE_BRAND_SOURCE, WEBSITE_ASSET_SOURCE } = require("./asset_priority");

const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function vld() {
  return config.visualLayoutDirector || { enabled: true };
}

// Per-video PROMINENT budgets — "quality over quantity". Beyond these, the weakest
// assets of a type are demoted to background B-roll (still atmospheric, never a
// prominent tile), which is what kills the "12 tiny screenshots" collage and lets
// the survivors be shown large.
const BUDGET = { screenshot: 3, photo: 6, vector: 6 };
// Fewer, larger montage tiles read far better than a dense 6-up grid.
const MONTAGE_MAX = 4;

// Classify an asset into the same buckets scene_kit.partitionAssets uses, so the
// budgets line up with the pools the weaving actually draws from.
function classify(a) {
  if (!a || !a.path) return null;
  // The logo never competes for a layout budget — scene_kit routes it to its own
  // key-moment treatment, so the Director has no presentation decision to make.
  if (isLogo(a)) return null;
  if (a.type === "video" || /\.(mp4|webm|mov)($|\?)/i.test(a.path)) return "video";
  // Uploads route by their explicit kindHint (mirrors scene_kit.partitionAssets —
  // their alt is our own sentence, not a sniffable search query).
  if (a.source === "upload") return a.kindHint === "photo" ? "photo" : "screenshot";
  // Harvested brand assets route by their EXPLICIT kindHint (our own classification),
  // so a bare logo/cutout SVG is a vector, not forced into a browser/phone frame.
  if (a.source === WEBSITE_BRAND_SOURCE || a.source === WEBSITE_ASSET_SOURCE) {
    return a.kindHint === "vector" ? "vector" : a.kindHint === "screenshot" ? "screenshot" : "photo";
  }
  const s = `${a.source || ""} ${a.style || ""} ${a.alt || ""}`.toLowerCase();
  if (a.source === "website" || /screenshot|webpage|web page|landing|\bsite\b/.test(s)) return "screenshot";
  if (/\.svg($|\?)/i.test(a.path) || /vector|illustration|icon|line.?art|graphic/.test(s)) return "vector";
  return "photo";
}

// TIER-FIRST importance: the tier (upload > website > curated > stock) is the
// ×1000 major key via asset_priority.rankKey, the CD's blended quality score the
// minor — so a presentation budget can trim the user's WEAKEST uploads against
// each other, but a stock photo can never demote a user upload out of a slot.
const importance = (a) => rankKey(a, num(a && a.cdScore, 0) + (typeof (a && a.clipRelevance) === "number" ? a.clipRelevance * 30 : 0));

// Is this asset currently eligible for a PROMINENT slot? (Owned screenshots, curated
// picks, and CD-approved stock — the same trust the kit's prominentOk gate applies.)
function isProminent(a) {
  return !!a && (isTrustedProminent(a)
    || a.cdProminence === "hero" || a.cdProminence === "support");
}

// Content-aware crop focus (deterministic, no vision): where a cover-fit image is
// anchored so its important content survives the crop. Dashboards / UI captures keep
// their header + top content (nav is above the fold); mobile shots keep the top;
// photos stay centered on their subject. scene_kit reads `asset.cropFocus`.
function cropFocusFor(a, kind) {
  const ratio = num(a && a.ratio, 0) || (a && a.width && a.height ? a.width / a.height : 0);
  if (kind === "screenshot") {
    // Wide dashboard (keep the header) OR tall mobile (keep the status bar/top).
    if (!ratio || ratio >= 1.4 || ratio <= 0.9) return "top center";
    return "center center";
  }
  return "center center"; // photos: subject is usually centered
}

// The device chrome a screenshot should render in: a portrait capture is a mobile
// app shot → phone body; anything else → browser frame. scene_kit reads
// `asset.container` and draws the matching mockup (archPhoneHero vs archScreenshotHero).
function deviceKind(a) {
  const ratio = num(a && a.ratio, 0) || (a && a.width && a.height ? a.width / a.height : 0);
  return (ratio && ratio < 0.9) ? "phone" : "browser";
}

// A human-readable container label for the UI/telemetry.
function containerFor(kind, a) {
  if (kind === "screenshot") return deviceKind(a) === "phone" ? "Phone Mockup" : "Dashboard Showcase";
  if (kind === "vector") return "Brand Container";
  return "Media Frame";
}

// ---------------------------------------------------------------- distribution
//
// SPREAD BEFORE STACKING — the single highest-impact layout decision, and it was missing.
//
// The Creative Director assigns each asset the scene where it best supports the story,
// judging assets one at a time. Nothing ever looked at the RESULT as a distribution, so
// several assets routinely landed on the same scene while other scenes got none. Measured
// across the recent 9:16 films:
//
//   755o2m8g21  6 assets → s1,s1,s1,s2,s5,s9   3 scenes covered of 9   layout score 41
//   48vb7svz9s  6 assets → s1,s1,s2,s5,s8,s8   4 of 8                  score 58
//   8qcod42pjf  8 assets → s4,s2,s3,s5,s1,s6,s2,s7  7 of 7             score 90
//
// The best and worst films differ by DISTRIBUTION, not by how many assets were collected.
// A film with six visuals and nine scenes should cover six scenes; leaving six scenes as
// bare template panels is the "empty scenes / only 2-3 images / excessive empty space"
// complaint, and it is arithmetic rather than taste.
//
// So: every scene gets ONE asset before any scene gets TWO. The surplus moved is always
// the LOWEST-ranked asset on an over-subscribed scene, so a scene keeps its strongest
// visual and the hero never moves. `maxPerScene` (the CD's prominence cap) is unchanged —
// this decides WHERE assets sit, not how prominent they are.
function spreadAcrossScenes(assets, scenes, { isLogo: isLogoFn = isLogo } = {}) {
  const list = Array.isArray(assets) ? assets : [];
  const sceneIds = (scenes || []).map((s, i) => (s && s.id != null ? String(s.id) : `s${i + 1}`));
  if (sceneIds.length < 2) return { moved: 0, moves: [] };

  // The logo is key-moment material (open + CTA), not a scene filler — never relocate it.
  const placeable = list.filter((a) => a && a.path && !isLogoFn(a) && a.sceneId != null);
  const byScene = new Map();
  for (const a of placeable) {
    const k = String(a.sceneId);
    if (!byScene.has(k)) byScene.set(k, []);
    byScene.get(k).push(a);
  }
  const uncovered = sceneIds.filter((id) => !byScene.has(id) || !byScene.get(id).length);
  if (!uncovered.length) return { moved: 0, moves: [] };

  // Surplus = everything beyond the first asset on each over-subscribed scene, weakest
  // first, so the strongest visual stays where the director put it.
  const surplus = [];
  for (const [, arr] of byScene) {
    if (arr.length <= 1) continue;
    const ranked = arr.slice().sort((x, y) => importance(y) - importance(x));
    surplus.push(...ranked.slice(1));
  }
  if (!surplus.length) return { moved: 0, moves: [] };
  surplus.sort((x, y) => importance(x) - importance(y));   // weakest moves first

  // Fill the uncovered scenes NEAREST the asset's current home first: a visual that was
  // meant for scene 2 belongs on scene 3 rather than scene 9 — moving it across the film
  // would break the story beat it was chosen for.
  const idxOf = (id) => sceneIds.indexOf(String(id));
  const moves = [];
  const open = uncovered.slice();
  for (const a of surplus) {
    if (!open.length) break;
    const from = idxOf(a.sceneId);
    let bestI = 0, bestD = Infinity;
    open.forEach((id, i) => {
      const d = Math.abs(idxOf(id) - from);
      if (d < bestD) { bestD = d; bestI = i; }
    });
    const to = open.splice(bestI, 1)[0];
    const scene = (scenes || [])[idxOf(to)];
    moves.push({ path: a.path, from: String(a.sceneId), to });
    a.sceneId = scene && scene.id != null ? scene.id : to;
    // Timing rides with the scene, or the asset animates in a window it no longer occupies.
    if (scene) {
      if (scene.start != null) a.startSec = scene.start;
      if (scene.duration != null) a.durationSec = scene.duration;
    }
  }
  return { moved: moves.length, moves };
}

// ---------------------------------------------------------------- main
// Returns { assets, layoutPlan, review }. `assets` is the SAME array with prominence
// re-leveled (weak overflow demoted to background) and `cropFocus` annotated.
// `layoutPlan` carries the per-scene archetype PLUS reserved globals scene_kit reads:
//   __heroScale  — target width fraction for the screenshot hero (bigger = more read)
//   __montageMax — max tiles in the montage (fewer = larger/cleaner)
function directLayout({ storyboard, script, assets, framePack, dims } = {}) {
  const layoutPlan = planLayout({ storyboard, script });
  const list = Array.isArray(assets) ? assets : [];
  if (!vld().enabled || !list.length) {
    return { assets: list, layoutPlan, review: null };
  }

  try {
    // 1) REDUCTION — per type, keep the top-BUDGET prominent assets; demote the rest
    //    to background (the kit routes them to scrimmed B-roll). Owned + curated +
    //    CD-approved only; unverified stock is left as-is (it was never prominent).
    const byKind = { screenshot: [], photo: [], vector: [] };
    for (const a of list) {
      const k = classify(a);
      if (k && byKind[k] && isProminent(a)) byKind[k].push(a);
      // Annotate crop focus on every image (harmless on contain-fit slots).
      if (k === "screenshot" || k === "photo") a.cropFocus = cropFocusFor(a, k);
      // Tag the device chrome so the kit renders a phone mockup for portrait
      // (mobile) screenshots instead of a browser frame.
      if (k === "screenshot") a.container = deviceKind(a);
    }
    // DYNAMIC budgets: when the user uploaded their own material, the budgets
    // grow to fit it — "show the best 3 big" was tuned for scraped screenshots;
    // a user who uploaded 6 dashboards uploaded 6 because they want 6 shown.
    // Stock never benefits: the overflow the wider budget admits is tier-ranked,
    // so extra slots fill with uploads first (importance is tier-first).
    const uploadedShots = byKind.screenshot.filter((a) => a.source === "upload").length;
    const uploadedPhotos = byKind.photo.filter((a) => a.source === "upload").length;
    const uploadCount = uploadedShots + uploadedPhotos;
    const budget = {
      screenshot: clamp(Math.max(BUDGET.screenshot, uploadedShots), BUDGET.screenshot, 6),
      photo: clamp(BUDGET.photo + uploadedPhotos, BUDGET.photo, 9),
      vector: BUDGET.vector,
    };
    let demoted = 0;
    for (const kind of Object.keys(byKind)) {
      const pool = byKind[kind].sort((x, y) => importance(y) - importance(x));
      pool.slice(budget[kind]).forEach((a) => {
        // Never delete — demote so it can still be atmospheric B-roll.
        a.visionOk = false;
        a.cdProminence = "background";
        a.__layoutDemoted = true;
        demoted++;
      });
    }

    // 2) SIZING — enlarge the hero. With few prominent screenshots surviving, the
    //    single hero should occupy meaningful space (readable), so scale up from the
    //    kit's default 0.52. One survivor → biggest; a couple → slightly smaller.
    const shots = Math.min(byKind.screenshot.length, budget.screenshot);
    layoutPlan.__heroScale = shots <= 1 ? 0.60 : shots === 2 ? 0.56 : 0.54;
    // A 5+ upload set earns a fuller montage (6 tiles); otherwise the calmer 4.
    layoutPlan.__montageMax = uploadCount >= 5 ? 6 : MONTAGE_MAX;
    // ASPECT-AWARE: record the canvas mode from `dims` (previously destructured but
    // unused) so the composer + future portrait budgets can adapt. Portrait/square heroes
    // are FULL-WIDTH (responsive.heroBox), so __heroScale above is a LANDSCAPE side-panel
    // lever — the scene-kit already gates it to landscape, so this is honest metadata, not
    // a behavior change. Lazy require (matches pack_style) avoids a load-order cycle.
    const { aspectMode } = require("./responsive");
    layoutPlan.__aspect = (dims && dims.width && dims.height) ? aspectMode(dims.width, dims.height) : "landscape";
    // In portrait/square the montage stacks vertically, so keep it calmer (fewer, larger
    // tiles) than a wide grid — cap at 4 unless a big upload set justifies more.
    if (layoutPlan.__aspect !== "landscape") layoutPlan.__montageMax = Math.min(layoutPlan.__montageMax, uploadCount >= 5 ? 5 : 4);

    const scenes = (storyboard && Array.isArray(storyboard.scenes) && storyboard.scenes.length
      ? storyboard.scenes
      : (script && Array.isArray(script.scenes) ? script.scenes : []));

    // 2b) DISTRIBUTION — every scene gets one asset before any scene gets two. Runs
    //     before the per-scene report below so the report describes the film as it will
    //     actually be composed. See spreadAcrossScenes for the measurements behind this.
    const spread = spreadAcrossScenes(list, scenes);
    if (spread.moved) {
      console.log(`[visual_layout_director] spread ${spread.moved} asset(s) onto empty scenes: `
        + spread.moves.map((m) => `${m.from}→${m.to}`).join(", "));
    }

    // 3) PER-SCENE composition report (telemetry, not consumed by the render). A
    //    rough deterministic quality read: penalize scenes that would still be dense.
    const prominentTotal = byKind.screenshot.slice(0, budget.screenshot).length
      + byKind.photo.slice(0, budget.photo).length;
    // PER-SCENE COVERAGE, not a decoration. The old report repeated the same
    // __heroScale on every row as though a per-scene decision had been made — in
    // portrait it isn't even read (see below). What a reader actually needs is
    // whether THIS scene has a visual, so the empty ones are visible here rather
    // than only after the render.
    const assignedTo = new Map();
    for (const a of list) {
      if (!a || a.sceneId == null || isLogo(a)) continue;
      if (!assignedTo.has(a.sceneId)) assignedTo.set(a.sceneId, []);
      assignedTo.get(a.sceneId).push(a);
    }
    const sceneReports = scenes.map((sc, i) => {
      const id = sc && sc.id != null ? sc.id : `s${i + 1}`;
      const arch = (layoutPlan[id] && layoutPlan[id].archetype) || "text";
      const mine = assignedTo.get(id) || [];
      const prominent = mine.filter(isProminent).length;
      return { sceneId: id, archetype: arch, assets: mine.length, prominent };
    });
    const emptyScenes = sceneReports.filter((r) => r.assets === 0).length;

    // COMPOSITION SCORE, from what the layout actually is. The old
    // `100 - demoted*2` only moved when assets were demoted, so it read 100 on a film
    // with three empty scenes — it measured this function's own activity, not the
    // composition. Score the things a viewer would notice: scenes with nothing in
    // them, scenes carrying a visual, and whether the prominent set is big enough to
    // carry the runtime.
    const sceneCount = sceneReports.length || 1;
    const covered = sceneCount - emptyScenes;
    const coverage = covered / sceneCount;                        // 0..1
    const depth = clamp(prominentTotal / Math.max(2, Math.ceil(sceneCount / 2)), 0, 1);
    const compositionQuality = Math.round(clamp(coverage * 70 + depth * 30, 0, 100));

    const review = {
      keptScreenshots: Math.min(byKind.screenshot.length, budget.screenshot),
      keptPhotos: Math.min(byKind.photo.length, budget.photo),
      uploadedKept: Math.min(uploadedShots, budget.screenshot) + Math.min(uploadedPhotos, budget.photo),
      demoted,
      // Reported ONLY where it is honoured. responsive.heroBox makes portrait/square
      // heroes full-width, so the kit reads __heroScale on landscape alone — surfacing
      // it on a 9:16 job advertised a decision nobody made.
      heroScale: layoutPlan.__aspect === "landscape" ? layoutPlan.__heroScale : null,
      montageMax: layoutPlan.__montageMax,
      aspect: layoutPlan.__aspect,
      prominentTotal,
      emptyScenes,
      redistributed: spread.moved,
      redistribution: spread.moves.slice(0, 12),
      scenes: sceneReports,
      score: { compositionQuality, coverage: Math.round(coverage * 100), source: "deterministic" },
    };
    console.log(`[visual_layout_director] kept ${review.keptScreenshots} screenshot(s)/${review.keptPhotos} photo(s), demoted ${demoted}, hero=${layoutPlan.__heroScale}, montage≤${layoutPlan.__montageMax}, aspect=${layoutPlan.__aspect}`);
    return { assets: list, layoutPlan, review };
  } catch (e) {
    console.warn(`[visual_layout_director] failed (${String((e && e.message) || e).slice(0, 140)}) — archetype-only plan`);
    return { assets: list, layoutPlan, review: null };
  }
}

module.exports = { directLayout };
