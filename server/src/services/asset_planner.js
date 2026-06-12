// LLM call: given storyboard + flags, plan which Pixabay images/videos to
// fetch, and when to show them. Returns a sanitized plan. Any failure just
// returns an empty plan — pipeline will skip visuals gracefully.

const fs = require("node:fs");
const path = require("node:path");
const openrouter = require("./openrouter");

const SYSTEM = fs.readFileSync(
  path.join(__dirname, "..", "prompts", "system_assets.md"),
  "utf8"
);

const STYLES = new Set(["fullscreen", "background", "inset"]);

function parseJsonLenient(text) {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(t);
}

function buildUser(storyboard, flags) {
  return [
    "Storyboard:",
    JSON.stringify({
      title: storyboard.title,
      durationSec: storyboard.durationSec,
      orientation: storyboard.orientation,
      scenes: storyboard.scenes,
    }, null, 2),
    "",
    `Flags: images=${!!flags.images}, video=${!!flags.video}`,
    `Duration: ${storyboard.durationSec}s, orientation: ${storyboard.orientation}`,
    "",
    "Plan visual assets. Return ONLY JSON.",
  ].join("\n");
}

function sanitizeAsset(a, duration, sceneIds) {
  if (!a || typeof a !== "object") return null;
  const query = String(a.query || "").trim().slice(0, 80);
  if (!query) return null;
  const startSec = Number(a.startSec);
  const durationSec = Number(a.durationSec);
  if (!Number.isFinite(startSec) || startSec < 0 || startSec >= duration) return null;
  if (!Number.isFinite(durationSec) || durationSec <= 0) return null;
  const clampedDuration = Math.min(durationSec, duration - startSec);
  const style = STYLES.has(a.style) ? a.style : "fullscreen";
  const sceneId = sceneIds.has(a.sceneId) ? a.sceneId : null;
  return {
    query,
    sceneId,
    startSec: Math.round(startSec * 10) / 10,
    durationSec: Math.round(clampedDuration * 10) / 10,
    style,
    alt: String(a.alt || query).slice(0, 100),
  };
}

function sanitize(plan, storyboard, flags) {
  const duration = storyboard.durationSec;
  const sceneIds = new Set((storyboard.scenes || []).map((s) => s.id));
  const out = {};

  if (flags.images && Array.isArray(plan.images)) {
    const images = [];
    for (const a of plan.images.slice(0, 5)) {
      const s = sanitizeAsset(a, duration, sceneIds);
      if (s) images.push(s);
    }
    if (images.length) out.images = images;
  }

  if (flags.video && Array.isArray(plan.videos)) {
    const videos = [];
    // Hard cap at 1 video — 2+ concurrent videos blow the render budget
    // on our Chromium-based pipeline (per observed 480s+ renders).
    for (const a of plan.videos.slice(0, 1)) {
      const s = sanitizeAsset(a, duration, sceneIds);
      if (s) videos.push(s);
    }
    if (videos.length) out.videos = videos;
  }

  return out;
}

async function planAssets(storyboard, flags) {
  if (!flags.images && !flags.video) return { plan: {}, tokensIn: 0, tokensOut: 0 };

  let tokensIn = 0, tokensOut = 0;
  let lastErr;

  for (let i = 0; i < 2; i++) {
    try {
      const { text, tokensIn: tIn, tokensOut: tOut } = await openrouter.chat({
        system: SYSTEM,
        user: buildUser(storyboard, flags),
        jsonMode: true,
        temperature: 0.5,
        stage: "assetPlanner",
      });
      tokensIn += tIn; tokensOut += tOut;
      const raw = parseJsonLenient(text);
      const plan = sanitize(raw, storyboard, flags);
      return { plan, tokensIn, tokensOut };
    } catch (e) {
      lastErr = e;
    }
  }

  console.warn(`[asset_planner] LLM failed: ${lastErr?.message}. Skipping assets.`);
  return { plan: {}, tokensIn, tokensOut, error: lastErr?.message };
}

module.exports = { planAssets };
