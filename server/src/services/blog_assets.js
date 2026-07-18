// Blog-image assets — the post's OWN pictures, pinned to scenes.
//
// The blog ingest (ingest/blog.js) downloads the article's big inline images
// (cover first). At production time this module turns them into first-class
// owner-content assets pinned to the scenes that showcase content — the same
// treatment website screenshots get, because nothing a stock provider returns
// is more on-topic than the images the author put in the post.
//
// source:"blog" (NOT "website"): downstream trust gates accept it explicitly,
// while scene_kit's classifyAsset keeps its normal photo/diagram heuristics
// instead of force-fitting everything like a tall page screenshot.

const fs = require("node:fs");
const path = require("node:path");

// Pin up to `cap` blog images onto showcase scenes that aren't already claimed
// (by topic screenshots / landing pins). Returns [] when the job carries no
// blog images — callers need no blog-awareness beyond this one call.
function blogImageAssets({ job, script, jobDir, skipSceneIds = new Set(), cap = 3 }) {
  const imgs = (Array.isArray(job.blog_images) ? job.blog_images : [])
    .filter((im) => { try { return im && im.path && fs.existsSync(im.path); } catch { return false; } });
  if (!imgs.length || !script || !Array.isArray(script.scenes)) return [];

  const skip = new Set([...skipSceneIds].map(String));
  const showcase = script.scenes.filter((s) => ["feature", "proof", "how", "context"].includes(String(s.purpose || "")) && !skip.has(String(s.id)));
  const fallback = script.scenes.slice(1, -1).filter((s) => !skip.has(String(s.id)));
  const targets = (showcase.length ? showcase : fallback).slice(0, cap);
  if (!targets.length) return [];

  fs.mkdirSync(path.join(jobDir, "assets", "images"), { recursive: true });
  const title = job.blog_title || "the blog post";

  return imgs.slice(0, targets.length).map((im, i) => {
    const relPath = `assets/images/blog_${i}${path.extname(im.path) || ".jpg"}`;
    fs.copyFileSync(im.path, path.join(jobDir, relPath));
    const scene = targets[i];
    return {
      path: relPath, type: "image",
      sceneId: scene.id, startSec: scene.start, durationSec: scene.duration,
      style: "inset",
      width: im.width, height: im.height,
      ratio: im.width && im.height ? im.width / im.height : undefined,
      alt: `REAL image from the blog post "${title}"${im.alt ? ` — ${im.alt}` : (i === 0 ? " — cover image" : "")}`,
      license: "owner content", sourceUrl: job.blog_url || null, source: "blog", fromCache: false,
    };
  });
}

module.exports = { blogImageAssets };
