// Audio-review agent — judges the SELECTED audio (voiceover, music, SFX) against
// the video's inferred PURPOSE and EMOTION before it ships.
//
// It's a QA reviewer, not a planner: given the storyboard (purpose/emotional arc)
// and the audio plan the planner produced, it asks an LLM whether each layer fits
// — the right voice persona for the mood, music mood/energy that matches the
// intent, SFX that reinforce rather than distract — and returns per-layer ratings
// + concrete fixes. Fail-open: any error returns null so it never blocks a job.

const fs = require("node:fs");
const path = require("node:path");
const openrouter = require("./openrouter");
const { extractFirstJsonObject: parseJsonLenient } = require("./json_lenient");

const SYSTEM = fs.readFileSync(
  path.join(__dirname, "..", "prompts", "system_audio_review.md"),
  "utf8",
);

// Compact the storyboard + selected audio into a review brief. Only the fields
// that carry purpose/emotion (title, per-scene headline/subtext/emphasis) and the
// actual audio choices are sent, to keep the prompt small.
function buildUser({ storyboard, plan, brief, videoOk }) {
  const scenes = (storyboard.scenes || []).map((s) => ({
    headline: s.headline, subtext: s.subtext, emphasis: s.emphasis, kind: s.kind,
  }));
  const audio = {
    voiceover: plan.tts
      ? { script: plan.tts.script, voice: plan.tts.voice, instructions: plan.tts.instructions || null }
      : null,
    music: plan.music ? { query: plan.music.query, mood: plan.music.mood || null, volume: plan.music.volume } : null,
    sfx: Array.isArray(plan.soundEffects)
      ? plan.soundEffects.map((s) => ({ query: s.query, at: s.startSec, label: s.label || null }))
      : [],
  };
  return [
    `Video status: ${videoOk ? "rendered OK" : "render failed/partial"}`,
    brief ? `Brief: ${JSON.stringify({ tone: brief.tone, goal: brief.goal, audience: brief.audience })}` : "",
    `Title: ${storyboard.title || "(untitled)"}`,
    `Duration: ${storyboard.durationSec || "?"}s`,
    "",
    "Storyboard scenes:",
    JSON.stringify(scenes, null, 1),
    "",
    "SELECTED audio to review:",
    JSON.stringify(audio, null, 1),
    "",
    "Return the review JSON.",
  ].filter(Boolean).join("\n");
}

// Review one video's audio. Returns the parsed review object, or null on failure.
async function reviewAudio({ storyboard, plan, brief = null, videoOk = true }) {
  if (!storyboard || !plan) return null;
  // Nothing was selected → nothing to review.
  if (!plan.tts && !plan.music && !(plan.soundEffects && plan.soundEffects.length)) return null;
  try {
    const { text } = await openrouter.chat({
      system: SYSTEM,
      user: buildUser({ storyboard, plan, brief, videoOk }),
      jsonMode: true,
      temperature: 0.3,
      stage: "audioReview",
    });
    const review = parseJsonLenient(text);
    return review && typeof review === "object" ? review : null;
  } catch (e) {
    console.warn(`[audio-review] failed: ${String(e && e.message).slice(0, 140)}`);
    return null;
  }
}

// One-line log summary of a review (for the pipeline log).
function summarizeReview(r) {
  if (!r) return "(no review)";
  const rate = (x) => (x && x.rating != null ? `${x.rating}/5` : "n/a");
  const flags = Array.isArray(r.flags) && r.flags.length ? ` ⚑ ${r.flags.join("; ")}` : "";
  return `purpose="${r.purpose || "?"}" emotion="${r.emotion || "?"}" | VO ${rate(r.voiceover)} music ${rate(r.music)} sfx ${rate(r.sfx)} | overall ${rate(r.overall)}${flags}`;
}

module.exports = { reviewAudio, summarizeReview };
