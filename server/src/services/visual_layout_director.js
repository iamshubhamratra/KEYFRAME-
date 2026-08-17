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
const { isLogo, tierFor } = require("./asset_priority");
const config = require("../config");
const { planLayout } = require("./layout_planner");

const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function vld() {
  return config.visualLayoutDirector || { enabled: true };
}

// Per-video PROMINENT budgets. Raised 3/6/6 → 5/10/10 (user: "the amount of
// assets, vectors and screenshots is very less") — the weakest overflow is
// still demoted to background B-roll so a flood of weak stock can't cheapen
// the film, but a rich pool now actually SURFACES instead of being buried.
const BUDGET = { screenshot: 5, photo: 10, vector: 10 };
// Montage tile budget (scene_kit supports up to 8 per grid). 4 → 6.
const MONTAGE_MAX = 6;

// Classify an asset into the same buckets scene_kit.partitionAssets uses, so the
// budgets line up with the pools the weaving actually draws from.
function classify(a) {
  if (!a || !a.path) return null;
  // Logos are role material, not pool material; an upload routes by our own
  // kindHint, never by sniffing the alt sentence we wrote ourselves.
  if (isLogo(a)) return null;
  if (a.source === "upload") return a.kindHint === "photo" ? "photo" : "screenshot";
  if (a.type === "video" || /\.(mp4|webm|mov)($|\?)/i.test(a.path)) return "video";
  const s = `${a.source || ""} ${a.style || ""} ${a.alt || ""}`.toLowerCase();
  if (a.source === "website" || /screenshot|webpage|web page|landing|\bsite\b/.test(s)) return "screenshot";
  if (/\.svg($|\?)/i.test(a.path) || /vector|illustration|icon|line.?art|graphic/.test(s)) return "vector";
  return "photo";
}

// The CD's blended importance for ranking (score + CLIP pixel-relevance) — the same
// rankScore the CD uses internally, so the Director agrees with itself on "best".
const importance = (a) => num(a && a.cdScore, 0) + (typeof (a && a.clipRelevance) === "number" ? a.clipRelevance * 30 : 0);

// Is this asset currently eligible for a PROMINENT slot? (Owned screenshots, curated
// picks, and CD-approved stock — the same trust the kit's prominentOk gate applies.)
function isProminent(a) {
  return !!a && (a.source === "upload" || a.source === "website"
    || String(a.source || "").startsWith("library:")
    || a.visionOk === true
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
    let demoted = 0;
    // Tier-first ONLY when the job has uploads (same guard as the CD's rankScore):
    // unconditional tiering would reorder upload-free website jobs — a render
    // change on the no-feature path.
    const hasUploads = list.some((a) => a && a.source === "upload");
    const rankT = (a) => (hasUploads ? tierFor(a) * 1000 : 0) + importance(a);
    for (const kind of Object.keys(byKind)) {
      const pool = byKind[kind].sort((x, y) => rankT(y) - rankT(x));
      pool.slice(BUDGET[kind]).forEach((a) => {
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
    const shots = Math.min(byKind.screenshot.length, BUDGET.screenshot);
    layoutPlan.__heroScale = shots <= 1 ? 0.60 : shots === 2 ? 0.56 : 0.54;
    layoutPlan.__montageMax = MONTAGE_MAX;

    // 3) PER-SCENE composition report (telemetry, not consumed by the render). A
    //    rough deterministic quality read: penalize scenes that would still be dense.
    const scenes = (storyboard && Array.isArray(storyboard.scenes) && storyboard.scenes.length
      ? storyboard.scenes
      : (script && Array.isArray(script.scenes) ? script.scenes : []));
    const prominentTotal = byKind.screenshot.slice(0, BUDGET.screenshot).length
      + byKind.photo.slice(0, BUDGET.photo).length;
    const sceneReports = scenes.map((sc, i) => {
      const id = sc && sc.id != null ? sc.id : `s${i + 1}`;
      const arch = (layoutPlan[id] && layoutPlan[id].archetype) || "text";
      return { sceneId: id, archetype: arch, heroScale: layoutPlan.__heroScale };
    });
    const review = {
      keptScreenshots: Math.min(byKind.screenshot.length, BUDGET.screenshot),
      keptPhotos: Math.min(byKind.photo.length, BUDGET.photo),
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
