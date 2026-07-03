// Vision relevance gate for fetched web stock. Off-topic stock (a Pisa-tower
// photo landing in a dog film because the query said "landmark moment") is the
// single biggest visual killer — a scene carried by the design system's own
// vectors beats a scene anchored on an irrelevant photo every time.
//
// One cheap flash-vision call per fetched web asset: "does this plausibly
// serve a film about <subject>?" Curated-library picks, real website
// screenshots, and vectors/icons are trusted and never gated.
//
// FAIL-OPEN by design: any failure (LLM budget exhausted, ffmpeg missing,
// timeout, parse error) keeps the asset — the gate must never make a video
// WORSE by starving it of assets when providers are down.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const openrouter = require("./openrouter");
const { extractFirstJsonObject } = require("./json_lenient");

function ff(args) {
  return new Promise((resolve) => {
    const p = spawn("ffmpeg", args, { windowsHide: true });
    p.on("error", () => resolve(false));
    p.on("exit", (code) => resolve(code === 0));
  });
}

// Small JPEG thumbnail (≤384px wide) of an image, or of a frame ~1s into a
// video — keeps the vision call cheap regardless of source size.
async function thumbBase64(absPath, isVideo) {
  const tmp = path.join(os.tmpdir(), `kf-gate-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`);
  const args = isVideo
    ? ["-y", "-v", "error", "-ss", "1", "-i", absPath, "-frames:v", "1", "-vf", "scale=384:-2", "-q:v", "6", tmp]
    : ["-y", "-v", "error", "-i", absPath, "-frames:v", "1", "-vf", "scale=384:-2", "-q:v", "6", tmp];
  const ok = await ff(args);
  if (!ok || !fs.existsSync(tmp)) return null;
  try {
    const b64 = fs.readFileSync(tmp).toString("base64");
    return b64.length > 200 ? b64 : null;
  } finally {
    try { fs.unlinkSync(tmp); } catch { /* noop */ }
  }
}

// -> { keep: boolean, sees: string|null }. keep=true on ANY failure.
async function checkAssetRelevance({ absPath, type, subject, query, tracker, signal }) {
  try {
    const b64 = await thumbBase64(absPath, type === "video");
    if (!b64) return { keep: true, sees: null };

    const user = [
      {
        type: "text",
        text:
          `A stock library returned this ${type === "video" ? "video (one frame shown)" : "image"} for a film whose subject is: "${subject}". ` +
          `The search query was: "${query}".\n` +
          `Question: would a film director accept this asset in that film — does it show the subject itself, or a directly related setting, object, or mood? ` +
          `Unrelated buildings/landmarks, maps, diagrams of something else, or random objects are NOT acceptable.\n` +
          `Reply STRICT JSON: {"usable": true|false, "sees": "<3-6 words: what the image actually shows>"}`,
      },
      { type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } },
    ];

    const { text, tokensIn, tokensOut } = await openrouter.chat({
      system: "You are a strict stock-footage librarian. Reply with strict JSON only.",
      user,
      jsonMode: true,
      stage: "vision",
      temperature: 0,
      signal,
    });
    if (tracker) tracker.addLlm({ inputTokens: tokensIn, outputTokens: tokensOut, stage: "vision" });

    const v = extractFirstJsonObject(text);
    return { keep: v.usable !== false, sees: typeof v.sees === "string" ? v.sees : null };
  } catch (e) {
    // Budget-dead providers, network, ffmpeg — all land here. Keep the asset.
    return { keep: true, sees: null, skipped: String(e?.message || e).slice(0, 120) };
  }
}

module.exports = { checkAssetRelevance };
