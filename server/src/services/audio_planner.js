// LLM call to plan audio layers for a video. Only asks for layers whose
// flag is enabled. Output is a JSON object describing TTS, music, and SFX.

const fs = require("node:fs");
const path = require("node:path");
const openrouter = require("./openrouter");

const SYSTEM = fs.readFileSync(
  path.join(__dirname, "..", "prompts", "system_audio.md"),
  "utf8"
);

const VALID_VOICES = new Set([
  "alloy", "ash", "ballad", "coral", "echo",
  "fable", "nova", "onyx", "sage", "shimmer", "verse",
]);

function randomVoice() {
  const arr = [...VALID_VOICES];
  return arr[Math.floor(Math.random() * arr.length)];
}

function parseJsonLenient(text) {
  const trimmed = text.trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  return JSON.parse(trimmed);
}

function buildUser(storyboard, flags) {
  const lines = [
    "Storyboard:",
    JSON.stringify({
      title: storyboard.title,
      durationSec: storyboard.durationSec,
      orientation: storyboard.orientation,
      scenes: storyboard.scenes,
    }, null, 2),
    "",
    `Flags:`,
    `  tts: ${!!flags.tts}`,
    `  music: ${!!flags.music}`,
    `  soundEffect: ${!!flags.soundEffect}`,
    flags.voice ? `  voice preference: ${flags.voice}` : `  voice preference: (none — pick one matching the mood)`,
    "",
    `Video duration: ${storyboard.durationSec} seconds.`,
    "",
    "Return the audio plan JSON. Only include keys for enabled flags.",
  ];
  return lines.join("\n");
}

function sanitize(plan, { tts, music, soundEffect, voice, duration }) {
  const out = {};

  if (tts && plan.tts) {
    const script = String(plan.tts.script || "").trim()
      .replace(/\[.*?\]/g, "")       // strip any "[pause]" markers
      .replace(/\s+/g, " ");
    if (script.length > 0) {
      const chosenVoice = (voice && VALID_VOICES.has(voice))
        ? voice
        : (VALID_VOICES.has(plan.tts.voice) ? plan.tts.voice : randomVoice());
      out.tts = {
        script,
        voice: chosenVoice,
        instructions: String(plan.tts.instructions || "").trim().slice(0, 400) || undefined,
      };
    }
  }

  if (music && plan.music) {
    const query = String(plan.music.query || plan.music.mood || "").trim().slice(0, 80);
    if (query) {
      out.music = {
        query,
        mood: String(plan.music.mood || "").trim(),
        volume: clampNum(plan.music.volume, 0.05, 0.5, 0.15),
      };
    }
  }

  if (soundEffect && Array.isArray(plan.soundEffects)) {
    const sfx = [];
    for (const s of plan.soundEffects.slice(0, 5)) {
      const query = String(s.query || "").trim().slice(0, 60);
      const startSec = Number(s.startSec);
      if (!query || !Number.isFinite(startSec) || startSec < 0 || startSec >= duration) continue;
      sfx.push({
        query,
        startSec: Math.round(startSec * 10) / 10,
        volume: clampNum(s.volume, 0.1, 1.0, 0.5),
        label: String(s.label || "").slice(0, 60),
      });
    }
    if (sfx.length) out.soundEffects = sfx;
  }

  return out;
}

function clampNum(v, lo, hi, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
}

async function planAudio(storyboard, flags) {
  const duration = storyboard.durationSec;
  const tries = 2;
  let lastErr, tokensIn = 0, tokensOut = 0;

  for (let i = 0; i < tries; i++) {
    try {
      const { text, tokensIn: tIn, tokensOut: tOut } = await openrouter.chat({
        system: SYSTEM,
        user: buildUser(storyboard, flags),
        jsonMode: true,
        temperature: 0.6,
        stage: "audioPlanner",
      });
      tokensIn += tIn; tokensOut += tOut;
      const raw = parseJsonLenient(text);
      const plan = sanitize(raw, { ...flags, duration });
      return { plan, tokensIn, tokensOut };
    } catch (e) {
      lastErr = e;
    }
  }
  // Total LLM failure — return empty plan (pipeline will skip audio entirely).
  return {
    plan: {},
    tokensIn, tokensOut,
    error: lastErr?.message || "audio plan failed",
  };
}

module.exports = { planAudio, randomVoice, VALID_VOICES };
