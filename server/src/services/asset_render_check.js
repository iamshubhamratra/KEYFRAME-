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
//     missingAssignments, invalidPaths, templateSupportsAssets, findings, renderStatus }
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

// How MANY times a path is drawn. Presence alone stopped being the whole answer once the
// Asset Reuse Optimizer could put one picture on several scenes: a clone and its original
// share a path, so both satisfy pathInHtml even if the composer drew the picture once.
// Counting occurrences is what separates "reused as designed" from "the second instance
// was silently dropped".
function countInHtml(html, p) {
  if (!html || !p) return 0;
  let n = 0, i = 0;
  for (;;) {
    const at = html.indexOf(p, i);
    if (at === -1) return n;
    n++; i = at + p.length;
  }
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

    // A template SUPPORTS assets when it can put one on screen — not when it writes
    // the tag itself. The bundled-template engine (191 of the 228 packs, every
    // long-form one among them) hands each picture to its runtime as a JSON slot value
    // ("shot":"assets/images/site_3.png") and builds the <img> in the browser, so its
    // composed HTML contains no `<img` at all. Measured over the 30 most recent real
    // jobs: 24 of them — every bundled-template film — returned FAIL_NO_IMG_SUPPORT
    // while actually drawing 1-17 distinct pictures, and that verdict short-circuits
    // every finding below it, so this audit has never once reported on the packs that
    // render most of the catalogue. A path the audit itself matched in the HTML is
    // proof the template took the picture. (When nothing matched AND there is no
    // <img, the two causes are indistinguishable from here, so the older, stricter
    // label still stands.)
    const templateSupportsAssets = /<img\b/i.test(indexHtml) || rendered.length > 0;
    // DISTINCT PICTURES, not wire entries. The Asset Reuse Optimizer can place one picture
    // on several scenes as several entries sharing a path, so an entry count would report a
    // 2-picture film as having collected 4. Identical to the old value before reuse, where
    // every entry is already a distinct path.
    const uniqueShotPaths = [...new Set(shots.map((a) => a.path))];
    const assetsCollected = new Set(list.map((a) => a.path)).size;
    const assetsSelected = uniqueShotPaths.length;    // usable (non-logo) PICTURES available to place
    const renderedShotPaths = uniqueShotPaths.filter((p) => pathInHtml(indexHtml, p));
    const assetsRendered = renderedShotPaths.length + (logoRendered ? 1 : 0);
    const placement = auditScenePlacement(indexHtml, assets); // per-scene spread (RC-3 detector)

    // PER-INSTANCE AUDIT — how many times each picture is actually drawn, and whether that
    // matches how many times it was placed on the wire. A picture placed on two scenes but
    // drawn once means the second instance was dropped; drawn more often than placed means
    // a composer duplicated it on its own.
    const placedPerPath = new Map();
    for (const a of shots) placedPerPath.set(a.path, (placedPerPath.get(a.path) || 0) + 1);
    const instances = uniqueShotPaths.map((p) => ({
      path: p,
      placed: placedPerPath.get(p) || 0,
      drawn: countInHtml(indexHtml, p),
    }));
    const reusedPlaced = instances.filter((x) => x.placed > 1);
    const droppedInstances = instances.filter((x) => x.drawn < x.placed).length;
    const maxDrawn = instances.reduce((m, x) => Math.max(m, x.drawn), 0);

    // WHAT THE VIEWER ACTUALLY SEES. Every check above is satisfied by ONE picture
    // reaching the DOM, which is how the two commonest complaints ("off-topic /
    // barely any pictures") were audited as PASS. Both measured on real jobs:
    //   job 9bytvxqh7c (bauhaus-riot, 30s) — 3 of 8 scenes carry a picture and 3 of
    //     its 6 collected pictures are never drawn → PASS.
    //   job ivkd2869v4 (poster-pop, 30s) — 6 pictures spread over 16 slots, one of
    //     them on 4 of those slots, 6 of 13 scenes bare → PASS.
    const drawSlots = instances.reduce((n, x) => n + x.drawn, 0);
    const distinctDrawn = renderedShotPaths.length;
    const topDrawn = maxDrawn > 0 ? instances.find((x) => x.drawn === maxDrawn) : null;
    const findings = [];
    // COVERAGE. The routers alternate media beats deliberately — family_bright's
    // route() was rewritten to lift films off "the ~3/8 media floor" — so a film that
    // shows a picture on fewer than every other scene is under the cadence its own
    // engine aims for. Judged only when the scene segmenter recognised the markup
    // (sceneCount 0 = it did not: the bundled engine emits no id="sN", so its films
    // are answered by the repetition finding below instead) and when there were at
    // least 2 pictures to spread — one picture over ten scenes is a pool problem.
    if (placement.sceneCount >= 4 && assetsSelected >= 2
      && placement.scenesWithAsset * 2 < placement.sceneCount) {
      findings.push({
        code: "SCENES_WITHOUT_PICTURE",
        message: `${placement.sceneCount - placement.scenesWithAsset} of ${placement.sceneCount} scene(s) carry no picture `
          + `(${assetsSelected} collected, ${distinctDrawn} drawn)`,
      });
    }
    // REPETITION. On a film that spends its pool properly every picture is drawn
    // once: measured exactly 1.00 draws per picture on genesis (7 of 8 drawn),
    // bauhaus-riot (3), editorial-quiet (2) and dark-premium (2). The starved films
    // put ONE picture on a quarter or more of all picture slots — safelight at 300s
    // drew 4 of 16 collected with the top one on 28 of 80 slots, hive-mind at 600s
    // drew 4 of 22 with the top on 52 of 80. A quarter-share also catches "few
    // pictures, evenly spread" for nothing: at 4 or fewer distinct pictures the top
    // one is always ≥25%. The ≥3 floor keeps a two-slot film out of it, and it clears
    // the bundled engine's floor of 2 (it writes the same path into a beat's `shot`
    // AND `image` slot, so every one of its films measures ~2 draws a picture).
    if (topDrawn && maxDrawn >= 3 && maxDrawn * 4 >= drawSlots) {
      findings.push({
        code: "PICTURE_REPEATS",
        message: `${topDrawn.path} drawn ${maxDrawn}x of ${drawSlots} picture slot(s); `
          + `only ${distinctDrawn} distinct picture(s) on screen of ${assetsSelected} collected`,
      });
    }

    // Verdict — the loud signal. Only meaningful when assets were actually available.
    let renderStatus;
    if (assetsCollected === 0) renderStatus = "NO_ASSETS";               // nothing to place (prompt-only)
    else if (!templateSupportsAssets) renderStatus = "FAIL_NO_IMG_SUPPORT"; // no <img AND no path matched
    else if (assetsSelected > 0 && shotsRendered.length === 0) renderStatus = "FAIL_TEXT_ONLY"; // the P0
    else if (invalidPaths > 0) renderStatus = "FAIL_BROKEN_PATHS";
    else if (assetsSelected >= 2 && shotsRendered.length < 2) renderStatus = "WARN_SPARSE";
    // A film the viewer would call empty or repetitive is not a PASS. WARN_, not
    // FAIL_, on purpose: isAssetRenderFailure() stays the "assets existed and the
    // film shows none/broken" signal, and nothing gates on these.
    else if (findings.length) renderStatus = `WARN_${findings[0].code}`;
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
      // Reuse disclosure — present on every audit; all zeros on a film with no reuse.
      reusedPictures: reusedPlaced.length,
      maxAppearances: maxDrawn,
      droppedInstances,
      instances,
      // Named, counted reasons the verdict is not PASS — read them, not just the status.
      findings,
      renderStatus,
    };
  } catch (e) {
    // Fail-open: a validation error must never touch a render.
    return { assetsCollected: 0, assetsSelected: 0, assetsAssigned: 0, assetsRendered: 0, shotsRendered: 0, logoRendered: false, missingAssignments: 0, invalidPaths: 0, templateSupportsAssets: false, findings: [], renderStatus: "AUDIT_ERROR", error: String((e && e.message) || e).slice(0, 160) };
  }
}

// True when the report is a genuine failure worth shouting about (assets existed but the
// film shows none / broken). Every WARN_ (SPARSE, SCENES_WITHOUT_PICTURE, PICTURE_REPEATS)
// and NO_ASSETS/PASS are not failures — read `findings` for those.
function isAssetRenderFailure(report) {
  return !!report && /^FAIL_/.test(String(report.renderStatus || ""));
}

module.exports = { auditAssetRender, isAssetRenderFailure, pathInHtml };
