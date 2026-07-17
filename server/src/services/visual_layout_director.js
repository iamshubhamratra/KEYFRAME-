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
const { isTrustedProminent, isLogo, rankKey } = require("./asset_priority");

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

    // 3) PER-SCENE composition report (telemetry, not consumed by the render). A
    //    rough deterministic quality read: penalize scenes that would still be dense.
    const scenes = (storyboard && Array.isArray(storyboard.scenes) && storyboard.scenes.length
      ? storyboard.scenes
      : (script && Array.isArray(script.scenes) ? script.scenes : []));
    const prominentTotal = byKind.screenshot.slice(0, budget.screenshot).length
      + byKind.photo.slice(0, budget.photo).length;
    const sceneReports = scenes.map((sc, i) => {
      const id = sc && sc.id != null ? sc.id : `s${i + 1}`;
      const arch = (layoutPlan[id] && layoutPlan[id].archetype) || "text";
      return { sceneId: id, archetype: arch, heroScale: layoutPlan.__heroScale };
    });
    const review = {
      keptScreenshots: Math.min(byKind.screenshot.length, budget.screenshot),
      keptPhotos: Math.min(byKind.photo.length, budget.photo),
      uploadedKept: Math.min(uploadedShots, budget.screenshot) + Math.min(uploadedPhotos, budget.photo),
      demoted,
      heroScale: layoutPlan.__heroScale,
      montageMax: layoutPlan.__montageMax,
      prominentTotal,
      scenes: sceneReports,
      score: { compositionQuality: clamp(100 - demoted * 2, 60, 100), source: "deterministic" },
    };
    console.log(`[visual_layout_director] kept ${review.keptScreenshots} screenshot(s)/${review.keptPhotos} photo(s), demoted ${demoted}, hero=${layoutPlan.__heroScale}, montage≤${layoutPlan.__montageMax}`);
    return { assets: list, layoutPlan, review };
  } catch (e) {
    console.warn(`[visual_layout_director] failed (${String((e && e.message) || e).slice(0, 140)}) — archetype-only plan`);
    return { assets: list, layoutPlan, review: null };
  }
}

module.exports = { directLayout };
