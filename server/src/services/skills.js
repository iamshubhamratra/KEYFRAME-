// Loader for HyperFrames "skills" — markdown documentation the framework
// team maintains at github.com/heygen-com/hyperframes/skills. These are
// intended for agent integration (Claude Code via `npx skills add`) but
// work equally well as LLM context for any model.
//
// We fetch from GitHub raw URLs on first use, cache in memory, and surface
// a selected subset for each pipeline stage. If fetching fails the caller
// gets an empty string — the pipeline still runs with just our own prompts.

const REPO = "heygen-com/hyperframes";
const RAW_BASE = `https://raw.githubusercontent.com/${REPO}/main`;

// Skill file paths (verified against the repo).
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

  // GSAP primer.
  gsap:         "skills/gsap/SKILL.md",
};

const cache = new Map(); // path -> string content (or "" on failure)
let warmupPromise = null;

function log(...args) { console.log("[skills]", ...args); }

async function fetchOne(relPath) {
  if (cache.has(relPath)) return cache.get(relPath);
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
 * Smaller bundle for the storyboard stage — only the motion + patterns
 * guides that help with scene pacing decisions. ~8 KB.
 */
async function getStoryboardSkills() {
  return await getSkillBundle(["patterns", "motion", "houseStyle"]);
}

/**
 * Kick off skill fetches in the background at server start. Non-blocking;
 * if fetches complete by the time a user request hits the composer, it's
 * an instant cache hit. If not, the composer waits a few seconds.
 */
function warmUp() {
  if (warmupPromise) return warmupPromise;
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
