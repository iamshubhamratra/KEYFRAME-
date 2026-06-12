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

function buildUser({ prompt, duration, orientation }) {
  return [
    `User prompt: ${prompt}`,
    `Target duration: ${duration} seconds`,
    `Orientation: ${orientation}`,
    `Aspect ratio: ${ASPECT_BY_ORIENTATION[orientation]}`,
    "",
    "Produce the storyboard JSON now.",
  ].join("\n");
}

const { extractFirstJsonObject: parseJsonLenient } = require("./json_lenient");

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
      if (s.start !== cursor) errs.push(`scene[${i}] start ${s.start} should be ${cursor}`);
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
      cursor += s.duration;
    });
    if (Math.abs(cursor - duration) > 0.01) {
      errs.push(`scene durations sum to ${cursor}, expected ${duration}`);
    }
    if (sb.scenes[0]?.kind !== "title") errs.push("first scene kind must be 'title'");
  }
  return errs;
}

async function generateStoryboard({ prompt, duration, orientation }) {
  const user = buildUser({ prompt, duration, orientation });
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

module.exports = { generateStoryboard };
