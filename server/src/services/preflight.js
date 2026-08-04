// PRE-RENDER PREFLIGHT — the validation gate, rebuilt.
//
// WHY: the gate this replaces reported `ok: true` on the audited film. All six of
// its checks passed while the film being approved had three screenshots with a
// consent banner across them, five of nine assets that the chosen composer would
// discard unrendered, three scenes that rendered an empty grey panel, and a "brand
// palette" that was literally grey. It passed because of what it asked:
//
//   assetsCollected      "9 usable visual asset(s) collected"   — counted files, not usable ones
//   brandExtracted       "brand palette resolved"               — true of #0a0a0a + #ffffff
//   enoughForDuration    "9 visual(s) for 7 scene(s)"           — a total, never a per-scene check
//   scenesAssigned       "5 scene(s) have an assigned asset"    — 5 of 7 passes; ok:true anyway
//
// Every one of those is a proxy for the thing that matters, and each proxy was
// satisfied by a film that failed the real question. So the checks here ask the
// real question directly, and each one names what would be wrong with the FILM —
// not with the data structures — when it fails.
//
// SEVERITY. `fail` blocks the render (the user gets an honest error instead of a
// bad video); `warn` is disclosed on the job and shown in Premiere. The house
// fail-open law still holds for quality shortfalls: only genuinely unrecoverable
// states block. What changed is that "unrecoverable" now includes "the user gave us
// their website and every capture of it is unusable", which used to ship.

const fs = require("node:fs");
const path = require("node:path");
const config = require("../config");
const { isLogo } = require("./asset_priority");
const { isChromatic } = require("./brand_kit");

const FAIL = "fail", WARN = "warn", PASS = "pass";

function check(id, level, ok, detail, fix) {
  return { id, ok: !!ok, level: ok ? PASS : level, detail, fix: ok ? null : (fix || null) };
}

/**
 * @param {object}  args
 * @param {object}  args.job            the job row (user_assets, website_screenshots, screenshot_review…)
 * @param {object[]} args.assets        the asset wire as composition will receive it
 * @param {object}  args.script         the approved script
 * @param {object}  args.storyboard     the built storyboard (scene copy lives here)
 * @param {object}  args.brandSkin      the Art Director's skin (null = unbranded)
 * @param {string}  args.jobDir
 * @param {boolean} args.acceptsVectors whether the chosen pack can render a vector
 * @param {boolean} args.hardFail       promote the blocking checks (config.validationGate.hardFail)
 */
function preflight({ job, assets = [], script = null, storyboard = null, brandSkin = null, jobDir = "", acceptsVectors = true, hardFail = true } = {}) {
  const checks = [];
  const list = Array.isArray(assets) ? assets : [];

  // ---- self-heal: drop assets whose file vanished (a broken <img> in the render).
  const fileOk = (a) => { try { return !a || !a.path || !jobDir || fs.existsSync(path.join(jobDir, a.path)); } catch { return true; } };
  const healed = list.filter(fileOk);
  const selfHealed = list.length - healed.length;

  const isVector = (a) => /\.svg($|\?)/i.test(String(a.path || ""));
  const visual = healed.filter((a) => a && a.path && !isLogo(a) && a.type !== "audio");
  // RENDERABLE is the honest denominator: an asset the chosen composer will actually
  // put on screen. A vector handed to a pack whose composer opens with
  // `if (/\.svg/.test(path)) return false` is a file on disk and nothing more —
  // counting it as a "collected visual" is what let 5 dead assets read as coverage.
  const renderable = visual.filter((a) => acceptsVectors || !isVector(a));
  const deadAssets = visual.length - renderable.length;

  const scenes = (script && Array.isArray(script.scenes) && script.scenes.length)
    ? script.scenes
    : (storyboard && Array.isArray(storyboard.scenes) ? storyboard.scenes : []);
  const sceneCount = scenes.length;

  // ---- 1) SCREENSHOTS ------------------------------------------------------
  const sr = job && job.screenshot_review;
  const websiteAsked = !!(job && job.intent && job.intent.websiteUrl);
  if (websiteAsked) {
    const captured = sr ? Number(sr.captured) || 0 : 0;
    const kept = (job.website_screenshots || []).length;
    const obstructed = sr && Array.isArray(sr.dropped) ? sr.dropped.filter((d) => d.reason === "obstructed").length : 0;
    const authWall = sr && Array.isArray(sr.suppressed) && sr.suppressed.includes("auth-wall");
    checks.push(check(
      "screenshotsUsable", FAIL,
      kept > 0 || authWall || captured === 0,
      kept > 0
        ? `${kept} of ${captured || kept} capture(s) passed the quality gate${obstructed ? ` (${obstructed} rejected as overlay-obstructed)` : ""}`
        : authWall
          ? "the site is behind a sign-in wall — no product screens to capture"
          : `all ${captured} capture(s) were rejected${obstructed ? ` (${obstructed} obstructed by page overlays)` : ""}`,
      "The consent/modal overlay on this site could not be dismissed. Re-run the project — capture retries dismissal — or supply product screenshots as uploads."
    ));
  }

  // ---- 2) BRAND: logo ------------------------------------------------------
  const logoAsset = healed.find((a) => a && a.path && isLogo(a));
  const uploadedLogo = (job.user_assets || []).some((u) => u && u.role === "logo");
  checks.push(check(
    "brandLogo", WARN,
    !!logoAsset,
    logoAsset
      ? `logo present (${logoAsset.source === "upload" ? "uploaded" : "harvested from the site"}) and available to the CTA / key moments`
      : uploadedLogo
        ? "a logo was uploaded but did not survive asset collection"
        : "no brand logo — the film falls back to the template's generic mark",
    "Upload a logo, or enable the website harvester (WEBSITE_HARVESTER=1) so the site's own mark is collected."
  ));

  // ---- 3) BRAND: colour ----------------------------------------------------
  const accents = (brandSkin && Array.isArray(brandSkin.accents)) ? brandSkin.accents : [];
  const chromatic = accents.length ? isChromatic(accents) : false;
  checks.push(check(
    "brandColour", WARN,
    !!brandSkin && chromatic,
    !brandSkin
      ? "unbranded — the template keeps its own designed accents"
      : chromatic
        ? `brand accents applied: ${accents.join(", ")}`
        : `the resolved palette (${accents.join(", ") || "none"}) carries no colour — the film will read greyscale`,
    "Pick a brand colour on the create screen, or supply a website whose palette can be extracted."
  ));

  // ---- 4) ASSETS: every scene covered -------------------------------------
  const assignedScenes = new Set(renderable.map((a) => a.sceneId).filter((x) => x != null));
  const uncovered = scenes.filter((s) => !assignedScenes.has(s.id)).map((s) => s.id);
  checks.push(check(
    "everySceneHasVisual", WARN,
    sceneCount > 0 && uncovered.length === 0,
    uncovered.length === 0
      ? `all ${sceneCount} scene(s) have a renderable visual assigned`
      : `${uncovered.length} of ${sceneCount} scene(s) have NO renderable visual (${uncovered.join(", ")}) — these will render as empty template panels`,
    "Widen the asset budget, add a website URL with real product screens, or upload product images."
  ));

  // ---- 5) ASSETS: nothing fetched that the template cannot show ------------
  checks.push(check(
    "noDeadAssets", WARN,
    deadAssets === 0,
    deadAssets === 0
      ? "every collected asset is renderable by the chosen template"
      : `${deadAssets} collected asset(s) are vectors the chosen template cannot render and will discard`,
    "The pack renders photographic assets only; the planner should not be requesting vectors for it."
  ));

  // ---- 5b) REUSE: within limits, and never on adjacent scenes ---------------
  // Derived from the WIRE, not from the optimizer's own report. preflight's whole premise
  // is that a check must ask the real question directly (see the header): a report claiming
  // "max 2 uses" is the claim, and the wire is the fact. All-zero on a film with no reuse.
  {
    const perPath = new Map();
    for (const a of renderable) {
      if (!a.path || a.sceneId == null) continue;
      if (!perPath.has(a.path)) perPath.set(a.path, []);
      perPath.get(a.path).push(String(a.sceneId));
    }
    const maxUses = Number(config.assetReuse?.maxUses) || 2;
    const over = [...perPath.entries()].filter(([, ids]) => ids.length > maxUses);
    checks.push(check(
      "reuseWithinLimits", WARN,
      over.length === 0,
      over.length === 0
        ? `no asset appears more than ${maxUses}×`
        : `${over.length} asset(s) exceed the ${maxUses}-appearance limit (${over.map(([p, ids]) => `${p}×${ids.length}`).join(", ")})`,
      "Lower assetReuse.maxUses, or collect more visuals so the optimizer has alternatives."
    ));

    const idx = (id) => scenes.findIndex((s) => String(s.id) === id);
    const adjacent = [...perPath.entries()].filter(([, ids]) => {
      const ns = ids.map(idx).filter((i) => i >= 0).sort((x, y) => x - y);
      return ns.some((n, i) => i > 0 && n - ns[i - 1] === 1);
    });
    checks.push(check(
      "noAdjacentRepeat", WARN,
      adjacent.length === 0,
      adjacent.length === 0
        ? "no asset repeats on consecutive scenes"
        : `${adjacent.length} asset(s) appear on back-to-back scenes (${adjacent.map(([p]) => p).join(", ")}) — the most visible form of repetition`,
      "The reuse optimizer vetoes this; a composer may have re-homed the asset after assignment."
    ));
  }

  // ---- 6) TEXT: every scene says something ---------------------------------
  const sbScenes = (storyboard && Array.isArray(storyboard.scenes)) ? storyboard.scenes : [];
  const copyFor = (s, i) => {
    const sb = sbScenes[i] || {};
    const ost = [].concat(s.onScreenText || [], sb.onScreenText || []).filter(Boolean);
    return String(sb.headline || s.headline || ost[0] || "").trim();
  };
  const textless = scenes.map((s, i) => ({ id: s.id, copy: copyFor(s, i) })).filter((x) => !x.copy);
  checks.push(check(
    "everySceneHasText", WARN,
    textless.length === 0,
    textless.length === 0
      ? `all ${sceneCount} scene(s) carry on-screen copy`
      : `${textless.length} scene(s) have no on-screen text (${textless.map((x) => x.id).join(", ")})`,
    "Edit the script in the Script Room to add a headline for these scenes."
  ));

  // ---- 7) FILE INTEGRITY ---------------------------------------------------
  checks.push(check(
    "noBrokenPaths", WARN,
    selfHealed === 0,
    selfHealed === 0 ? "all asset files present" : `dropped ${selfHealed} asset(s) whose file was missing (self-healed)`,
    null
  ));

  // ---- 8) THE ONE UNRECOVERABLE STATE -------------------------------------
  // The user supplied their OWN material and none of it survived, with no stock to
  // stand in. A film that silently drops the user's product is worse than an error.
  const userSupplied = (job.user_assets || []).some((u) => u && u.role !== "logo")
    || (job.website_screenshots || []).length > 0
    || websiteAsked;
  checks.push(check(
    "userMaterialSurvived", FAIL,
    !userSupplied || renderable.length > 0,
    userSupplied
      ? (renderable.length ? `${renderable.length} usable visual(s) on the wire` : "you supplied material but NO usable visual survived collection")
      : "no user material supplied",
    "Regenerate, add a website URL with real product screens, or check the stock provider keys."
  ));

  const failed = checks.filter((c) => !c.ok && c.level === FAIL);
  const warned = checks.filter((c) => !c.ok && c.level === WARN);
  const ok = !hardFail || failed.length === 0;

  return {
    ok,
    blockedBy: hardFail && failed.length ? failed[0].id : null,
    selfHealed,
    healedAssets: healed,
    summary: `${checks.filter((c) => c.ok).length}/${checks.length} checks passed` +
      (failed.length ? ` · ${failed.length} BLOCKING` : "") +
      (warned.length ? ` · ${warned.length} warning(s)` : ""),
    failures: failed.map((c) => ({ id: c.id, detail: c.detail, fix: c.fix })),
    warnings: warned.map((c) => ({ id: c.id, detail: c.detail, fix: c.fix })),
    checks: Object.fromEntries(checks.map((c) => [c.id, { ok: c.ok, level: c.level, detail: c.detail }])),
  };
}

module.exports = { preflight };
