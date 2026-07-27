// Portrait-template asset-render validation + debug report.
//
// THE PROBLEM THIS GUARDS: a native portrait composer can silently produce a text-only
// video when collected assets (screenshots / images / logos) never make it onto the
// screen — the asset is embedded nowhere, or is assigned to a scene whose archetype
// ignores it. This module reconciles the assets a composer RECEIVED against what its
// composed index.html actually RENDERS (real <img src> references), and emits a debug
// report in the exact shape the pipeline discloses:
//
//   { assetsCollected, assetsSelected, assetsAssigned, assetsRendered,
//     missingAssignments, invalidPaths, templateSupportsAssets, renderStatus }
//
// FAIL-OPEN (THE LAW): this NEVER throws and NEVER blocks a render. It is pure disclosure
// — a loud, structured diagnostic so a text-only regression is caught and surfaced instead
// of shipped silently. The pipeline logs it and persists it; it does not gate flow.

const fs = require("node:fs");
const path = require("node:path");
const { isLogo } = require("./asset_priority");

// A composer renders an asset by emitting its jobDir-relative `path` inside an
// <img src="…"> (all native composers do). We detect the path as a substring of the
// composed HTML — robust to quoting/attribute order. Escaped for a literal regex probe.
function pathInHtml(html, p) {
  if (!html || !p) return false;
  // Direct substring is enough (paths are unique tokens like assets/images/0.jpg); the
  // src attribute always contains the literal path.
  return html.indexOf(p) !== -1;
}

// Scene-level placement audit. Native composers emit each scene as a direct-child
// `<div class="clip … " id="sN" …>` in timeline order (backdrop first, then s1..sN, then
// grain/caps). We segment the HTML by the scene-id markers and count how many SCENE clips
// actually contain a real asset <img> — the metric that catches "assets all crammed onto
// one showcase scene while the stat/quote/feature scenes render synthetic graphics"
// (RC-3), which the whole-document `shotsRendered` count cannot see.
//   → { sceneCount, scenesWithAsset, contentScenesWithoutAsset }
function auditScenePlacement(indexHtml, assets) {
  const html = String(indexHtml || "");
  const shots = (Array.isArray(assets) ? assets : []).filter((a) => a && a.path && !isLogo(a));
  if (!shots.length) return { sceneCount: 0, scenesWithAsset: 0, contentScenesWithoutAsset: 0 };
  // Scene clip openings: id="s<number>" on a .clip element (backdrop/caps/grain use other ids).
  const rx = /id="(s\d+)"/g;
  const marks = [];
  let m;
  while ((m = rx.exec(html))) marks.push({ id: m[1], idx: m.index });
  if (!marks.length) return { sceneCount: 0, scenesWithAsset: 0, contentScenesWithoutAsset: 0 };
  // Everything after the last scene start belongs to that scene up to the grain/caps overlays.
  const tail = (() => {
    const g = html.indexOf('id="kf-grain"'); const c = html.indexOf('id="caps"');
    const ends = [g, c].filter((x) => x > marks[marks.length - 1].idx);
    return ends.length ? Math.min(...ends) : html.length;
  })();
  let scenesWithAsset = 0;
  for (let i = 0; i < marks.length; i++) {
    const start = marks[i].idx;
    const end = i + 1 < marks.length ? marks[i + 1].idx : tail;
    const seg = html.slice(start, end);
    if (shots.some((a) => seg.indexOf(a.path) !== -1)) scenesWithAsset++;
  }
  return { sceneCount: marks.length, scenesWithAsset, contentScenesWithoutAsset: Math.max(0, marks.length - scenesWithAsset) };
}

// Reconcile assets-in vs assets-rendered for one composed film.
//   indexHtml — the composer's output HTML string
//   assets    — the array buildComposition RECEIVED (post CD + VLD)
//   jobDir    — optional; when given, checks each rendered asset's file actually EXISTS
function auditAssetRender({ indexHtml = "", assets = [], jobDir = null } = {}) {
  try {
    const list = Array.isArray(assets) ? assets.filter((a) => a && a.path) : [];
    const shots = list.filter((a) => !isLogo(a));
    const logos = list.filter((a) => isLogo(a));

    const rendered = list.filter((a) => pathInHtml(indexHtml, a.path));
    const shotsRendered = rendered.filter((a) => !isLogo(a));
    const logoRendered = rendered.some((a) => isLogo(a));

    // Assigned = the CD bound the asset to a scene (sceneId) OR it's the logo (key moment).
    const assigned = list.filter((a) => a.sceneId != null || isLogo(a));
    // Missing assignments = assets the CD ASSIGNED to a scene that the composer did NOT render.
    const missingAssignments = assigned.filter((a) => !isLogo(a) && !pathInHtml(indexHtml, a.path)).length;

    // Invalid paths = rendered assets whose file is missing on disk (broken <img>).
    let invalidPaths = 0;
    if (jobDir) {
      for (const a of rendered) {
        try { if (!fs.existsSync(path.join(jobDir, a.path))) invalidPaths++; } catch { /* ignore */ }
      }
    }

    const templateSupportsAssets = /<img\b/i.test(indexHtml);
    const assetsCollected = list.length;
    const assetsSelected = shots.length;              // usable (non-logo) shots available to place
    const assetsRendered = shotsRendered.length + (logoRendered ? 1 : 0);
    const placement = auditScenePlacement(indexHtml, assets); // per-scene spread (RC-3 detector)

    // Verdict — the loud signal. Only meaningful when assets were actually available.
    let renderStatus;
    if (assetsCollected === 0) renderStatus = "NO_ASSETS";               // nothing to place (prompt-only)
    else if (!templateSupportsAssets) renderStatus = "FAIL_NO_IMG_SUPPORT"; // composer emitted zero <img>
    else if (assetsSelected > 0 && shotsRendered.length === 0) renderStatus = "FAIL_TEXT_ONLY"; // the P0
    else if (invalidPaths > 0) renderStatus = "FAIL_BROKEN_PATHS";
    else if (assetsSelected >= 2 && shotsRendered.length < 2) renderStatus = "WARN_SPARSE";
    else renderStatus = "PASS";

    return {
      assetsCollected,
      assetsSelected,
      assetsAssigned: assigned.length,
      assetsRendered,
      shotsRendered: shotsRendered.length,
      logoRendered,
      missingAssignments,
      invalidPaths,
      templateSupportsAssets,
      sceneCount: placement.sceneCount,
      scenesWithAsset: placement.scenesWithAsset,
      renderStatus,
    };
  } catch (e) {
    // Fail-open: a validation error must never touch a render.
    return { assetsCollected: 0, assetsSelected: 0, assetsAssigned: 0, assetsRendered: 0, shotsRendered: 0, logoRendered: false, missingAssignments: 0, invalidPaths: 0, templateSupportsAssets: false, renderStatus: "AUDIT_ERROR", error: String((e && e.message) || e).slice(0, 160) };
  }
}

// True when the report is a genuine failure worth shouting about (assets existed but the
// film shows none / broken). WARN_SPARSE and NO_ASSETS/PASS are not failures.
function isAssetRenderFailure(report) {
  return !!report && /^FAIL_/.test(String(report.renderStatus || ""));
}

module.exports = { auditAssetRender, isAssetRenderFailure, pathInHtml };
