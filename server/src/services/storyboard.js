// Pass 1: prompt + duration + orientation -> storyboard JSON.
// Validates structure and timing; retries LLM on validation failure.

const fs = require("node:fs");
const path = require("node:path");
const config = require("../config");
const openrouter = require("./openrouter");

const SYSTEM = fs.readFileSync(
  path.join(__dirname, "..", "prompts", "system_storyboard.md"),
  "utf8"
);

// Official HyperFrames pacing + beat-direction guides (local skills install)
// appended once; cached for the process lifetime.
const { getStoryboardSkills } = require("./skills");
let systemWithSkills = null;
async function getSystem() {
  if (systemWithSkills) return systemWithSkills;
  const skills = await getStoryboardSkills().catch(() => "");
  systemWithSkills = skills
    ? `${SYSTEM}\n\n---\n\n# Reference: HyperFrames pacing & beat direction\n\nOfficial guides — apply them when pacing scenes and writing beats[].\n\n${skills}`
    : SYSTEM;
  return systemWithSkills;
}

const ASPECT_BY_ORIENTATION = {
  horizontal: "16:9",
  vertical: "9:16",
  square: "1:1",
};

function buildUser({ prompt, duration, orientation, framePack }) {
  return [
    `User prompt: ${prompt}`,
    `Target duration: ${duration} seconds`,
    `Orientation: ${orientation}`,
    `Aspect ratio: ${ASPECT_BY_ORIENTATION[orientation]}`,
    framePack && framePack !== "auto"
      ? `Visual design system: "${framePack}". Design every scene's layout, visualMotif, and emphasis to suit THIS system's aesthetic — pick scene archetypes and motifs that show off its signature look. Keep adjacent scenes visually distinct (vary layout + animation + motif).`
      : "",
    "",
    "Produce the storyboard JSON now.",
  ].filter(Boolean).join("\n");
}

const { extractFirstJsonObject: parseJsonLenient } = require("./json_lenient");

const round2 = (n) => Math.round(n * 100) / 100;
const clampDur = (n) => Math.min(15, Math.max(2, n));

// Deterministically repair scene timing so the LLM is never retried for
// arithmetic it routinely gets slightly wrong: starts that don't equal the
// cumulative sum of prior durations, and durations that don't total the target.
// We clamp each duration to [2,15], rescale them to hit `duration` exactly,
// absorb residual rounding drift into a scene that can take it, then recompute
// gapless starts. A storyboard that was already correct passes through
// unchanged. Only timing is touched — content/kind/animation are left for
// validate() to flag and (if wrong) drive a real retry.
function normalizeTimeline(sb, duration) {
  if (!sb || !Array.isArray(sb.scenes) || !sb.scenes.length) return;
  const scenes = sb.scenes.filter(
    (s) => s && typeof s.duration === "number" && Number.isFinite(s.duration)
  );
  if (!scenes.length) return;

  for (const s of scenes) s.duration = clampDur(s.duration);

  let sum = scenes.reduce((a, s) => a + s.duration, 0);
  if (sum > 0 && Math.abs(sum - duration) > 0.01) {
    const scale = duration / sum;
    for (const s of scenes) s.duration = clampDur(s.duration * scale);
  }

  for (const s of scenes) s.duration = round2(s.duration);
  // Distribute any leftover drift (from clamping/rounding) across scenes that
  // have slack, so the total lands on `duration` without violating [2,15].
  let drift = round2(duration - scenes.reduce((a, s) => a + s.duration, 0));
  for (let guard = 0; Math.abs(drift) >= 0.01 && guard < scenes.length * 2; guard++) {
    const s = scenes.find((sc) =>
      drift > 0 ? sc.duration + drift <= 15 || sc.duration < 15
                : sc.duration + drift >= 2  || sc.duration > 2
    );
    if (!s) break;
    const next = clampDur(round2(s.duration + drift));
    drift = round2(drift - (next - s.duration));
    s.duration = next;
  }

  let cursor = 0;
  for (const s of scenes) {
    s.start = round2(cursor);
    cursor = round2(cursor + s.duration);
  }
  // durationSec is authoritative-from-request; align it so it never mis-trips
  // validate() once the scenes sum correctly.
  sb.durationSec = duration;
}

function validate(storyboard, { duration, orientation }) {
  const errs = [];
  const sb = storyboard;
  if (!sb || typeof sb !== "object") return ["storyboard is not an object"];

  if (typeof sb.title !== "string" || !sb.title.trim()) errs.push("missing title");
  if (sb.durationSec !== duration) errs.push(`durationSec ${sb.durationSec} != requested ${duration}`);
  if (sb.orientation !== orientation) errs.push(`orientation mismatch: ${sb.orientation} != ${orientation}`);
  if (!Array.isArray(sb.scenes) || sb.scenes.length < 2) errs.push("scenes must be an array of >=2");
  if (!sb.palette?.background || !sb.palette?.text) errs.push("palette missing background/text");

  if (Array.isArray(sb.scenes)) {
    let cursor = 0;
    sb.scenes.forEach((s, i) => {
      if (typeof s.start !== "number" || typeof s.duration !== "number") {
        errs.push(`scene[${i}] start/duration must be numbers`);
        return;
      }
      // Tolerant compare: cursor accumulates via += and drifts in floating
      // point (e.g. 6.8 -> 6.800000000000001), so a strict !== rejects valid
      // storyboards. Sub-frame tolerance is plenty.
      if (Math.abs(s.start - cursor) > 0.05) errs.push(`scene[${i}] start ${s.start} should be ${Math.round(cursor * 100) / 100}`);
      if (s.duration < 2 || s.duration > 15) errs.push(`scene[${i}] duration ${s.duration} out of [2,15]`);
      if (!s.kind) errs.push(`scene[${i}] missing kind`);
      if (!s.animation) errs.push(`scene[${i}] missing animation`);
      // Beats are optional but, when present, sanitized rather than rejected:
      // keep only well-formed beats inside the scene's own time window.
      if (Array.isArray(s.beats)) {
        s.beats = s.beats
          .filter((b) => b && typeof b.at === "number" && b.at >= 0 && b.at < s.duration && typeof b.action === "string")
          .slice(0, 5)
          .map((b) => ({
            at: Math.round(b.at * 100) / 100,
            action: b.action.slice(0, 160),
            easing: typeof b.easing === "string" ? b.easing.slice(0, 40) : "power2.out",
          }));
      }
      cursor = Math.round((cursor + s.duration) * 1000) / 1000;
    });
    if (Math.abs(cursor - duration) > 0.01) {
      errs.push(`scene durations sum to ${cursor}, expected ${duration}`);
    }
    if (!["title", "hook"].includes(sb.scenes[0]?.kind)) errs.push("first scene kind must be 'title' or 'hook'");
  }
  return errs;
}

async function generateStoryboard({ prompt, duration, orientation, framePack }) {
  const user = buildUser({ prompt, duration, orientation, framePack });
  const maxTries = (config.llm.storyboardMaxRetries || 2) + 1;

  let totalIn = 0, totalOut = 0;
  let lastErrors = [];
  let lastParseError = null;
  let augmentedUser = user;

  const system = await getSystem();
  for (let i = 1; i <= maxTries; i++) {
    const { text, tokensIn, tokensOut } = await openrouter.chat({
      system,
      user: augmentedUser,
      jsonMode: true,
      stage: "storyboard",
    });
    totalIn += tokensIn;
    totalOut += tokensOut;

    let storyboard;
    try {
      storyboard = parseJsonLenient(text);
    } catch (e) {
      lastParseError = e.message;
      augmentedUser = `${user}\n\nPrevious attempt returned invalid JSON: ${e.message}\nReturn ONLY the JSON object.`;
      continue;
    }

    // Repair mechanical timing drift before validating, so the model is only
    // ever retried for genuine content problems — not arithmetic.
    normalizeTimeline(storyboard, duration);
    const errs = validate(storyboard, { duration, orientation });
    if (errs.length === 0) {
      return { storyboard, tokensIn: totalIn, tokensOut: totalOut };
    }
    lastErrors = errs;
    augmentedUser = `${user}\n\nPrevious attempt had these validation errors — fix them and try again:\n${errs.map(e => `- ${e}`).join("\n")}`;
  }

  const err = new Error(
    `storyboard generation failed after ${maxTries} attempts: ${lastErrors.join("; ") || lastParseError || "unknown"}`
  );
  err.tokensIn = totalIn;
  err.tokensOut = totalOut;
  throw err;
}

module.exports = { generateStoryboard, normalizeTimeline, validate };
