// User assets — the "User Asset Priority Agent"'s deterministic half.
//
// The user's own uploads (logo + product images) enter the job at create time as a
// manifest on `job.user_assets` (routes/projects.js writes it; files live in
// jobs/<id>/uploads/). This module turns that manifest into first-class PINNED
// assets — tier 100, ahead of everything the pipeline fetches — for BOTH
// orchestrators (agents/graph.js and project_pipeline.js), so the two production
// paths cannot drift the way the brand-skin dispatch once did.
//
// Phase 2 adds the vision half here (probeUserAssets/classifyUserAssets at intake);
// pinning already reads the classification when present and degrades gracefully
// when it is not (an unclassified upload is treated as a product screenshot — the
// reason most users upload anything).
//
// FAIL-OPEN, like every director: a missing file (the janitor may have swept a
// stale job's uploads), a failed probe, or an empty manifest all degrade to
// "pin what exists, skip what doesn't" — never a throw that kills a render.

const fs = require("node:fs");
const path = require("node:path");
const config = require("../config");
const openrouter = require("./openrouter");
const { ffprobeImage, imageDHashStats, pixFmtHasAlpha } = require("./asset_sources/util");
// main exports thumbBase64 from asset_vision, not media. The trap if this is
// wrong: a destructured require of a missing property SUCCEEDS, and the failure
// surfaces later as "thumbBase64 is not a function" inside classifyUserAssets'
// try/catch — which swallows it, so vision classification silently never runs.
const { thumbBase64 } = require("./asset_vision");
const { extractFirstJsonObject } = require("./json_lenient");
const { isLogo } = require("./asset_priority");

// assetType values the Phase-2 classifier emits. Screenshot-like uploads target
// showcase scenes (feature/how/proof) for device-frame hero treatment; photo-like
// ones read better on context/proof scenes. Unclassified defaults to screenshot-like.
const SCREENSHOT_TYPES = new Set(["dashboard", "mobile-app", "ui-design", "mockup", "website-screenshot"]);
const PHOTO_TYPES = new Set(["product-photo", "team", "marketing", "illustration"]);

function isScreenshotLike(u) {
  const t = String((u && u.assetType) || "").toLowerCase();
  if (PHOTO_TYPES.has(t)) return false;
  return true; // screenshot types AND unclassified/other → showcase treatment
}

// The manifest entries whose files still exist on disk. Paths in the manifest are
// jobDir-relative ("uploads/u1.png") — the same convention every asset carries.
function liveUserAssets(job, jobDir) {
  const manifest = Array.isArray(job && job.user_assets) ? job.user_assets : [];
  return manifest.filter((u) => {
    if (!u || !u.path) return false;
    try { return fs.existsSync(path.join(jobDir, u.path)); } catch { return false; }
  });
}

// Showcase scene targeting — the graph's proven rule (including the short-script
// fallback: slice(1,-1) is EMPTY on 2-scene scripts, which once silently dropped
// every real screenshot).
// Now the SHARED implementation (services/scene_role) — this rule lived in four files
// as a copy-pasted exact-string match on `purpose`, so a script that said "benefit"
// instead of "feature" matched nothing and the user's own uploads were pinned
// somewhere other than the scenes meant to showcase them.
const { showcaseTargets } = require("./scene_role");

// The pinned-asset record for one upload, mirroring the website-screenshot shape
// (graph.js/project_pipeline.js) so everything downstream — CD, layout director,
// composers, coverage — reads it with zero new plumbing. `source:"upload"` +
// `priorityTier:100` are what the trust predicates and tier-first rankings key on.
function assetFromUpload(u, scene, dim) {
  const ratio = dim && dim.width && dim.height ? Math.round((dim.width / dim.height) * 1000) / 1000 : (u.ratio || undefined);
  const framed = ratio && ratio < 0.9 ? "phone" : "browser";
  const what = u.assetType && u.assetType !== "other" ? u.assetType.replace(/-/g, " ") : "product image";
  return {
    path: u.path, type: "image",
    sceneId: scene ? scene.id : null,
    startSec: scene ? scene.start : 0,
    durationSec: scene ? scene.duration : 0,
    style: "inset",
    width: dim ? dim.width : u.width, height: dim ? dim.height : u.height, ratio,
    hasAlpha: u.hasAlpha === true ? true : undefined,
    alt: `THE USER'S OWN uploaded ${what}${u.sees ? ` (${u.sees})` : ""} — premium ${isScreenshotLike(u) ? `${framed}-frame hero` : "feature"} treatment`,
    license: "owner content", sourceUrl: null,
    source: "upload", priorityTier: 100, uploadId: u.id,
    // Which scene-kit pool this upload belongs in. partitionAssets/classify sniff
    // alt text for FETCHED assets; an upload's alt is our own sentence, so the
    // routing is explicit: screenshot-like → device-framed hero pool, photo-like
    // (product/team/marketing shots) → photo pool (no browser chrome on a person).
    kindHint: isScreenshotLike(u) ? "screenshot" : "photo",
    fromCache: false,
  };
}

// Pin the user's uploads to scenes. Returns { pinned, logoAsset, usedSceneIds }:
//   pinned       — tier-100 assets, screenshot-like uploads first, round-robin over
//                  the showcase targets (multiple per scene is fine: the montage and
//                  the CD's per-scene cap sort that out downstream, tier-first).
//   logoAsset    — the logo as a role:"logo" asset pinned to the LAST scene (the CTA
//                  lockup home). It never enters generic pools — composers detect it
//                  via asset_priority.isLogo. The alt keeps fallback.js's
//                  /\b(logo|wordmark|brand)\b/i outro working unchanged.
//   usedSceneIds — scenes that now own an upload (callers keep stock backgrounds
//                  from competing there, same as website-screenshot pinning).
async function pinUserAssets({ job, script, jobDir, maxPins = 6 }) {
  const live = liveUserAssets(job, jobDir);
  if (!live.length) return { pinned: [], logoAsset: null, usedSceneIds: new Set() };

  const logoEntry = live.find((u) => isLogo(u)) || null;
  const images = live.filter((u) => !isLogo(u));
  // Screenshot-like uploads lead (they earn the hero frames); photo-like follow.
  const ordered = [...images.filter(isScreenshotLike), ...images.filter((u) => !isScreenshotLike(u))].slice(0, maxPins);

  const targets = showcaseTargets(script);
  const scenes = Array.isArray(script && script.scenes) ? script.scenes : [];

  const pinned = await Promise.all(ordered.map(async (u, i) => {
    // Probe real pixel dimensions at pin time (ffprobe — no native dep) unless the
    // Phase-2 intake probe already filled them; aspect drives phone/browser framing.
    const abs = path.join(jobDir, u.path);
    const dim = (u.width && u.height)
      ? { width: u.width, height: u.height }
      : await ffprobeImage(abs).catch(() => null);
    return assetFromUpload(u, targets[i % Math.max(1, targets.length)] || null, dim);
  }));

  let logoAsset = null;
  if (logoEntry) {
    const last = scenes[scenes.length - 1] || null;
    const abs = path.join(jobDir, logoEntry.path);
    const dim = (logoEntry.width && logoEntry.height)
      ? { width: logoEntry.width, height: logoEntry.height }
      : /\.svg$/i.test(logoEntry.path) ? null : await ffprobeImage(abs).catch(() => null);
    // Measure the mark's INK so the composer can tell whether it will read on the pack's
    // ground — an uploaded logo is just as likely to be a dark mark meant for a light
    // site, and it vanishes the same way on a dark template. See services/logo_render.js.
    // Fail-open: no measurement ⇒ the logo renders exactly as before.
    let ink = null;
    try { ink = await require("./logo_render").measureLogoInk(abs); } catch { ink = null; }
    if (ink) console.log(`[user_assets] logo ink: lum=${ink.lum.toFixed(3)} ${ink.mono ? "monochrome" : "colour"} (${ink.source})`);
    logoAsset = {
      ...assetFromUpload(logoEntry, last, dim),
      role: "logo",
      style: "inset",
      ink,
      // SVG logos carry alpha by definition; the probe can't see it.
      hasAlpha: /\.svg$/i.test(logoEntry.path) ? true : logoEntry.hasAlpha === true ? true : undefined,
      alt: "the user's own brand logo — brand chip and CTA lockup only, never a full-frame image",
    };
  }

  const usedSceneIds = new Set(pinned.map((a) => a.sceneId).filter(Boolean));
  console.log(`[user_assets] pinned ${pinned.length} upload(s)${logoAsset ? " + logo" : ""} (${live.length} in manifest)`);
  return { pinned, logoAsset, usedSceneIds };
}

// ---------------------------------------------------------------- intake half
// The "User Asset Priority Agent"'s classification pass, run ONCE at intake —
// BEFORE the brief/script — so the script model can plan showcase scenes around
// what the user actually gave us. Probe (ffprobe, deterministic) + one batched
// vision call (the creative director's chunk pattern). Everything fails open to
// deterministic defaults with classified:false, so intake never blocks on it.

const ASSET_TYPES = ["dashboard", "mobile-app", "ui-design", "mockup", "website-screenshot", "product-photo", "team", "marketing", "illustration", "other"];
const CHUNK = 6;

const CLASSIFY_SYSTEM = [
  "You classify a user's OWN uploaded brand images for a product-video pipeline. These are the user's own materials — never judge them as stock; never reject.",
  `For EACH numbered image return: {"n": <number>, "assetType": one of ${JSON.stringify(ASSET_TYPES)}, "quality": 0-100 (sharpness/composition/production value), "storytelling": 0-100 (how much product story one scene of it can carry), "sees": "3-6 words describing what it shows"}.`,
  'assetType guide: "dashboard" = desktop product UI/analytics; "mobile-app" = phone-shaped UI; "ui-design" = design file/wireframe; "mockup" = product shown inside a device/scene mockup; "website-screenshot" = a captured web page; "product-photo" = a physical product; "team" = people; "marketing" = banner/ad/graphic with copy; "illustration" = drawn/flat art.',
  'Reply STRICT JSON: {"verdicts": [...]} with exactly one entry per image.',
].join("\n");

// Deterministic fallback classification — shape-based, no pixels judged. Used when
// the vision call fails or is disabled; classified stays false so a later intake
// lap may retry.
function defaultClassification(u) {
  const r = Number(u.ratio) || (u.width && u.height ? u.width / u.height : 0);
  if (r && r < 0.9) return "mobile-app";
  if (u.hasAlpha && (u.bytes || 0) < 200 * 1024) return "illustration";
  return "other";
}

// Fill width/height/ratio/hasAlpha/dhash on every manifest entry (parallel ffprobe;
// SVG skips the probe — vector, alpha by definition). Mutates + returns the manifest.
async function probeUserAssets({ jobDir, manifest }) {
  await Promise.all((manifest || []).map(async (u) => {
    if (!u || !u.path || u.width) return;
    const abs = path.join(jobDir, u.path);
    if (/\.svg$/i.test(u.path)) { u.hasAlpha = true; return; }
    try {
      const dim = await ffprobeImage(abs);
      if (dim) {
        u.width = dim.width; u.height = dim.height;
        u.ratio = dim.width && dim.height ? Math.round((dim.width / dim.height) * 1000) / 1000 : undefined;
        u.hasAlpha = pixFmtHasAlpha(dim.pixFmt) || undefined;
      }
      const stats = await imageDHashStats(abs).catch(() => null);
      if (stats && stats.dhash) u.dhash = stats.dhash;
    } catch { /* fail-open: unprobed entries still pin (pin-time probe covers them) */ }
  }));
  return manifest;
}

// One batched vision pass over the non-logo, non-SVG uploads. The logo needs no
// model (the user DECLARED it — that's the whole point of the dedicated slot).
async function classifyUserAssets({ jobDir, manifest, subject, tracker, signal }) {
  const list = (manifest || []).filter((u) => u && u.path && !isLogo(u) && !/\.svg$/i.test(u.path) && u.classified !== true);
  for (const u of (manifest || [])) {
    if (isLogo(u) && u.classified !== true) { u.assetType = "logo"; u.classified = true; }
  }
  if (!list.length) return manifest;

  // Vision review shares the creative director's switch: an operator who turned
  // vision review off gets the deterministic shape-based defaults instead.
  if (config.creativeDirector && config.creativeDirector.enabled === false) {
    for (const u of list) { u.assetType = u.assetType || defaultClassification(u); }
    return manifest;
  }

  try {
    for (let base = 0; base < list.length; base += CHUNK) {
      const chunk = list.slice(base, base + CHUNK);
      const thumbs = await Promise.all(chunk.map((u) => thumbBase64(path.join(jobDir, u.path), false).catch(() => null)));
      const usable = thumbs.map((b, i) => ({ b, i })).filter((x) => x.b);
      if (!usable.length) continue;
      const content = [{ type: "text", text: `PRODUCT/SUBJECT: "${subject || "(unspecified)"}". Classify the ${usable.length} image(s) below, numbered 1..${usable.length}.` }];
      usable.forEach((x, n) => {
        const u = chunk[x.i];
        content.push({ type: "text", text: `Image ${n + 1} (file: "${u.originalName || u.path}"${u.width ? `, ${u.width}x${u.height}` : ""}):` });
        content.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${x.b}` } });
      });
      const { text, tokensIn, tokensOut, costUsd } = await openrouter.chat({
        // KIE-first: no explicit `model` (that would disable KIE entirely — see
        // openrouter.js kieEnabled). config.js maps the user_assets stage onto the
        // Creative Director's model, so the OpenRouter fallback stays on flash-lite.
        system: CLASSIFY_SYSTEM, user: content, jsonMode: true, stage: "user_assets",
        temperature: 0, signal,
      });
      if (tracker) tracker.addLlm({ inputTokens: tokensIn, outputTokens: tokensOut, stage: "user_assets", costUsd });
      const parsed = extractFirstJsonObject(text);
      const verdicts = Array.isArray(parsed && parsed.verdicts) ? parsed.verdicts : [];
      // Key by the model's `n`, fall back to array position (the CD's proven fix:
      // one mis-numbered verdict must not void the whole chunk).
      const byN = new Map();
      verdicts.forEach((v, i) => { const n = Number(v && v.n); byN.set(Number.isFinite(n) ? n : i + 1, v); });
      usable.forEach((x, n) => {
        const v = byN.get(n + 1);
        const u = chunk[x.i];
        if (!v) { u.assetType = u.assetType || defaultClassification(u); return; }
        u.assetType = ASSET_TYPES.includes(String(v.assetType)) ? String(v.assetType) : defaultClassification(u);
        const clamp01 = (x2) => Math.max(0, Math.min(100, Math.round(Number(x2) || 0)));
        u.quality = clamp01(v.quality);
        u.storytelling = clamp01(v.storytelling);
        u.sees = String(v.sees || "").slice(0, 60) || undefined;
        u.classified = true;
      });
    }
    console.log(`[user_assets] classified ${list.filter((u) => u.classified).length}/${list.length} upload(s)`);
  } catch (e) {
    console.warn(`[user_assets] classification failed (${String((e && e.message) || e).slice(0, 120)}) — shape-based defaults`);
    for (const u of list) { u.assetType = u.assetType || defaultClassification(u); }
  }
  return manifest;
}

// The plain-language inventory the SCRIPT model plans showcase scenes around
// ("2 dashboard screenshots, 1 product photo; brand logo provided").
function inventoryForScript(manifest) {
  const imgs = (manifest || []).filter((u) => u && !isLogo(u));
  if (!imgs.length && !(manifest || []).some(isLogo)) return "";
  const counts = {};
  for (const u of imgs) {
    const t = (u.assetType || "image").replace(/-/g, " ");
    counts[t] = (counts[t] || 0) + 1;
  }
  const parts = Object.entries(counts).map(([t, n]) => `${n} ${t}${n > 1 ? "s" : ""}`);
  const logo = (manifest || []).some(isLogo) ? "brand logo provided" : "";
  return [parts.join(", "), logo].filter(Boolean).join("; ");
}

// The intake entry point: probe, classify, persist-ready manifest. Fail-open at
// every layer — the worst case is an unclassified manifest that still pins fine.
async function prepareUserAssets({ job, jobDir, subject, tracker, signal }) {
  const manifest = Array.isArray(job && job.user_assets) ? job.user_assets : [];
  if (!manifest.length) return null;
  await probeUserAssets({ jobDir, manifest });
  await classifyUserAssets({ jobDir, manifest, subject, tracker, signal });
  return manifest;
}

module.exports = {
  pinUserAssets, liveUserAssets, showcaseTargets, isScreenshotLike,
  probeUserAssets, classifyUserAssets, prepareUserAssets, inventoryForScript,
  SCREENSHOT_TYPES, PHOTO_TYPES, ASSET_TYPES,
};
