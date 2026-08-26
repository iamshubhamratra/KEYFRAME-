// Related-website screenshots — for a BLOG-driven film, captures the sites the
// article itself links out to (a tool it reviews, a dataset it cites, a
// competitor it names) and pins them to the scene whose copy best matches why
// the article mentioned that link. This is the piece that was entirely
// missing: ingest/blog.js only ever fetched images FROM the post; nothing
// looked at where the post pointed.
//
// FAIL-SOFT by design, same contract as screenshot_director.js: no PeekShot
// key, no external links found, every capture erroring out — all return []
// and the film renders exactly as it would have without this module.

const fs = require("node:fs");
const path = require("node:path");
const peekshot = require("./peekshot");
const { isShowcase } = require("./scene_role");

const STOPWORDS = new Set(["the", "a", "an", "and", "or", "but", "for", "with", "your", "you", "our", "we",
  "it", "is", "are", "to", "of", "in", "on", "at", "by", "that", "this", "how", "why", "what", "now", "get",
  "one", "all", "more", "less", "very", "just", "so", "no", "not", "from", "as", "be", "than", "into", "if"]);

function tokens(s) {
  return (String(s || "").toLowerCase().match(/[a-z][a-z'-]{3,}/g) || []).filter((w) => !STOPWORDS.has(w));
}

function sceneText(scene) {
  return [scene.purpose, scene.voiceover, scene.visualDirection, ...(scene.onScreenText || [])].join(" ");
}

// Best-scoring scene for a link's surrounding sentence, among scenes not
// already claimed. Falls back to null (caller skips the link) rather than
// dumping an unrelated screenshot on a random scene.
function bestScene(link, scenes, claimed) {
  const want = new Set(tokens(`${link.context} ${link.text} ${link.host.split(".")[0]}`));
  if (!want.size) return null;
  let best = null, bestScore = 0;
  for (const scene of scenes) {
    if (claimed.has(String(scene.id))) continue;
    const have = tokens(sceneText(scene));
    let score = 0;
    for (const w of have) if (want.has(w)) score++;
    if (score > bestScore) { bestScore = score; best = scene; }
  }
  return bestScore > 0 ? best : null;
}

/**
 * @param {object} o
 * @param {object} o.job    the job record — reads job.blog_external_links
 * @param {object} o.script the approved production script (scenes[])
 * @param {string} o.jobDir
 * @param {object} o.tracker
 * @param {Set}    o.skipSceneIds scenes already claimed by other asset sources
 * @param {number} o.cap    max distinct external sites to capture
 */
async function relatedSiteScreenshots({ job, script, jobDir, tracker, skipSceneIds = new Set(), cap = 3 }) {
  const links = Array.isArray(job.blog_external_links) ? job.blog_external_links : [];
  if (!links.length || !script || !Array.isArray(script.scenes)) return [];
  if (!peekshot.enabled()) return [];

  const total = script.scenes.length;
  const candidateScenes = script.scenes.filter((s, i) => isShowcase(s, { index: i, total }));
  const pool = candidateScenes.length ? candidateScenes : script.scenes.slice(1, -1);

  const claimed = new Set([...skipSceneIds].map(String));
  const picks = [];
  for (const link of links) {
    if (picks.length >= cap) break;
    const scene = bestScene(link, pool, claimed);
    if (!scene) continue;
    claimed.add(String(scene.id));
    picks.push({ link, scene });
  }
  if (!picks.length) return [];

  fs.mkdirSync(path.join(jobDir, "assets", "images"), { recursive: true });

  const results = await Promise.allSettled(picks.map(async ({ link, scene }, i) => {
    const relPath = `assets/images/related_${i}.png`;
    const outPath = path.join(jobDir, relPath);
    const shot = await peekshot.capture({ url: link.href, outPath, retina: true, delay: 3, timeoutMs: 180_000 });
    if (tracker) tracker.addExternal("peekshot_related_site");
    return {
      path: relPath, type: "image",
      sceneId: scene.id, startSec: scene.start, durationSec: scene.duration,
      style: "inset",
      width: shot.width, height: shot.height, ratio: shot.ratio,
      alt: `REAL screenshot of ${link.host} — the site the article links to for "${link.text || link.context.slice(0, 60)}"`,
      license: "third-party site (fair-use editorial reference)", sourceUrl: link.href, source: "related-website",
      fromCache: false,
    };
  }));

  const assets = results.filter((r) => r.status === "fulfilled").map((r) => r.value);
  const failed = results.length - assets.length;
  if (failed) console.warn(`[project] related-site screenshots: ${failed}/${results.length} capture(s) failed`);
  if (assets.length) console.log(`[project] related-site screenshots: ${assets.length} captured (${picks.map((p) => p.link.host).join(", ")})`);
  return assets;
}

module.exports = { relatedSiteScreenshots };
