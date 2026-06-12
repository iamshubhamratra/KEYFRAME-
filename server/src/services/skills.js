// Loader for HyperFrames "skills" — markdown documentation the framework
// team maintains at github.com/heygen-com/hyperframes/skills.
//
// LOCAL-FIRST: `npx skills add heygen-com/hyperframes` installs the full
// skill tree into <repo>/.agents/skills (richer than the remote subset —
// palettes, beat direction, captions/narration guides, transition catalog).
// We read from there when present; GitHub raw is the fallback so a deploy
// without the local install still works. Cached in memory either way; a
// missing doc yields "" and the pipeline runs on our own prompts.

const fs = require("node:fs");
const path = require("node:path");
const config = require("../config");

const REPO = "heygen-com/hyperframes";
const RAW_BASE = `https://raw.githubusercontent.com/${REPO}/main`;

// Skill file paths (repo-relative; local files strip the leading "skills/").
const SKILL_FILES = {
  // Core composition guide — always included for composer.
  main:         "skills/hyperframes/SKILL.md",
  houseStyle:   "skills/hyperframes/house-style.md",
  visualStyles: "skills/hyperframes/visual-styles.md",
  patterns:     "skills/hyperframes/patterns.md",

  // Deeper references — selectively included to keep context budget sane.
  motion:       "skills/hyperframes/references/motion-principles.md",
  typography:   "skills/hyperframes/references/typography.md",
  cssPatterns:  "skills/hyperframes/references/css-patterns.md",
  transitions:  "skills/hyperframes/references/transitions.md",

  // Only available from the local install (not fetched remotely before).
  beatDirection: "skills/hyperframes/references/beat-direction.md",
  captionsRef:   "skills/hyperframes/references/captions.md",
  narration:     "skills/hyperframes/references/narration.md",
  videoComposition: "skills/hyperframes/references/video-composition.md",
  transitionCatalog: "skills/hyperframes/references/transitions/catalog.md",

  // GSAP primer.
  gsap:         "skills/gsap/SKILL.md",
};

function localSkillsRoot() {
  for (const c of [
    path.resolve(config.paths.root, "..", ".agents", "skills"),
    path.resolve(config.paths.root, ".agents", "skills"),
  ]) {
    try { if (fs.statSync(c).isDirectory()) return c; } catch { /* keep looking */ }
  }
  return null;
}
const LOCAL_ROOT = localSkillsRoot();

const cache = new Map(); // path -> string content (or "" on failure)
let warmupPromise = null;

function log(...args) { console.log("[skills]", ...args); }

async function fetchOne(relPath) {
  if (cache.has(relPath)) return cache.get(relPath);

  // 1 — local install (npx skills add heygen-com/hyperframes).
  if (LOCAL_ROOT) {
    const localPath = path.join(LOCAL_ROOT, relPath.replace(/^skills\//, ""));
    try {
      const text = fs.readFileSync(localPath, "utf8");
      cache.set(relPath, text);
      return text;
    } catch { /* fall through to GitHub */ }
  }

  // 2 — GitHub raw fallback.
  const url = `${RAW_BASE}/${relPath}`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    const resp = await fetch(url, {
      headers: { "User-Agent": "video-gen/1.0" },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!resp.ok) {
      log(`fetch ${relPath}: HTTP ${resp.status}`);
      cache.set(relPath, "");
      return "";
    }
    const text = await resp.text();
    cache.set(relPath, text);
    return text;
  } catch (e) {
    log(`fetch ${relPath} failed: ${e.message}`);
    cache.set(relPath, "");
    return "";
  }
}

function joinDocs(entries) {
  const out = [];
  for (const [path, content] of entries) {
    if (!content) continue;
    out.push(`# ${path}\n\n${content}`);
  }
  return out.join("\n\n---\n\n");
}

/**
 * Fetch all listed skills in parallel. Returns concatenated markdown with
 * file-path headers. Safe to call repeatedly — cached after first run.
 */
async function getSkillBundle(keys) {
  const paths = keys.map((k) => SKILL_FILES[k]).filter(Boolean);
  const contents = await Promise.all(paths.map(fetchOne));
  return joinDocs(paths.map((p, i) => [p, contents[i]]));
}

/**
 * Skills bundle for the composer stage. Core subset only — keeps input
 * tokens manageable (~8k tokens) so MiniMax M3 responds in reasonable time.
 * The wider set (transitions, typography, css-patterns, visual-styles) is
 * reserved for explicit opt-in via getFullComposerSkills().
 */
async function getComposerSkills() {
  // Just SKILL.md (the core guide). Keeping skill context small
  // (~5k tokens) so composer LLM calls return in 30-40 s not 70 s.
  // Our own system_composer.md covers house-style + GSAP patterns.
  return await getSkillBundle(["main"]);
}

/**
 * Full skill bundle — all 9 docs, ~20k tokens. Used only when the LLM has
 * been observed producing boring output and we want to force-feed more
 * reference. Not the default because it slows composer calls significantly.
 */
async function getFullComposerSkills() {
  return await getSkillBundle([
    "main", "houseStyle", "visualStyles", "patterns",
    "motion", "typography", "cssPatterns", "transitions", "gsap",
  ]);
}

/**
 * Smaller bundle for the storyboard stage — pacing + the official beat
 * direction guide (drives our scenes' beats[] contract). ~10 KB, free to
 * load now that skills are read from disk.
 */
async function getStoryboardSkills() {
  return await getSkillBundle(["patterns", "motion", "beatDirection"]);
}

/**
 * Kick off skill fetches in the background at server start. Non-blocking;
 * if fetches complete by the time a user request hits the composer, it's
 * an instant cache hit. If not, the composer waits a few seconds.
 */
function warmUp() {
  if (warmupPromise) return warmupPromise;
  log(LOCAL_ROOT ? `using local skills install: ${LOCAL_ROOT}` : "no local skills install; fetching from GitHub");
  log("warming skill cache in background");
  warmupPromise = getComposerSkills().then((txt) => {
    log(`skill cache warm (${txt.length} bytes)`);
    return txt;
  }).catch((e) => {
    log(`warm-up failed: ${e.message}`);
    return "";
  });
  return warmupPromise;
}

module.exports = {
  SKILL_FILES,
  getSkillBundle,
  getComposerSkills,
  getStoryboardSkills,
  warmUp,
};
