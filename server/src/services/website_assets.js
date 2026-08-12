// Website-image assets — the SITE's own pictures (hero graphics, product shots,
// illustrations), downloaded during ingest (ingest/website.js -> job.website_images)
// and pinned to showcase scenes. A site's real imagery is more on-brand than any
// stock photo — the same rationale as blog images and screenshots.
//
// source:"website-image" (NOT "website"): "website" is force-classified as a
// device-framed SCREENSHOT by scene_kit.classifyAsset; these are regular photos,
// so they get a distinct source (still trusted — not in STOCK_SOURCES, so the
// Creative Director never deletes them). The alt is kept clear of screenshot
// trigger words (site/screenshot/ui/dashboard/webpage/landing) so classifyAsset
// treats them as PHOTOS (contain), not shots.

const fs = require("node:fs");
const { isShowcase } = require("./scene_role");
const path = require("node:path");

function websiteImageAssets({ job, script, jobDir, skipSceneIds = new Set(), cap = 5 }) {
  const imgs = (Array.isArray(job.website_images) ? job.website_images : [])
    .filter((im) => { try { return im && im.path && fs.existsSync(im.path); } catch { return false; } });
  if (!imgs.length || !script || !Array.isArray(script.scenes)) return [];

  const skip = new Set([...skipSceneIds].map(String));
  const total = script.scenes.length;
  const showcase = script.scenes.filter((s, i) => isShowcase(s, { index: i, total }) && !skip.has(String(s.id)));
  const fallback = script.scenes.slice(1, -1).filter((s) => !skip.has(String(s.id)));
  const targets = (showcase.length ? showcase : fallback).slice(0, cap);
  if (!targets.length) return [];

  fs.mkdirSync(path.join(jobDir, "assets", "images"), { recursive: true });
  const brand = job.website_title || "the brand";

  return imgs.slice(0, targets.length).map((im, i) => {
    const relPath = `assets/images/siteimg_${i}${path.extname(im.path) || ".jpg"}`;
    fs.copyFileSync(im.path, path.join(jobDir, relPath));
    const scene = targets[i];
    return {
      path: relPath, type: "image",
      sceneId: scene.id, startSec: scene.start, durationSec: scene.duration,
      style: "inset",
      width: im.width, height: im.height,
      ratio: im.width && im.height ? im.width / im.height : undefined,
      alt: `Brand image from ${brand}${im.alt ? ` — ${im.alt}` : ""}`,
      license: "owner content", sourceUrl: job.intent?.websiteUrl || job.website_url || null,
      source: "website-image", fromCache: false,
    };
  });
}

// The site's LOGO as a first-class asset. template_engine already hunts for one
// (isLogo -> kind "logo" / alt containing "logo" / a logo.<ext> path) and hands it
// to whichever scene type the pack's wantsLogo() names — usually the CTA. Until
// now nothing produced it, so that slot always fell back to a generic tile.
//
// Deliberately NOT given a sceneId: the engine claims the logo out of the pool
// itself and places it where the pack wants it. `fit:"contain"` because cropping
// a brand mark is never acceptable.
function websiteLogoAsset({ job, jobDir }) {
  const lg = job.website_logo;
  if (!lg || !lg.path) return null;
  try { if (!fs.existsSync(lg.path)) return null; } catch { return null; }

  const ext = path.extname(lg.path) || ".png";
  const relPath = `assets/images/logo${ext}`;
  try {
    fs.mkdirSync(path.join(jobDir, "assets", "images"), { recursive: true });
    fs.copyFileSync(lg.path, path.join(jobDir, relPath));
  } catch { return null; }

  const brand = job.website_title || "the brand";
  return {
    path: relPath, type: "image",
    kind: "logo", fit: "contain",
    width: lg.width || undefined, height: lg.height || undefined,
    ratio: lg.width && lg.height ? lg.width / lg.height : undefined,
    alt: `${brand} logo`,
    license: "owner content", sourceUrl: job.intent?.websiteUrl || job.website_url || null,
    source: "website-logo", fromCache: false,
    visionOk: true, // owner content: trusted for prominent placement without a vision verdict
  };
}

module.exports = { websiteImageAssets, websiteLogoAsset };
