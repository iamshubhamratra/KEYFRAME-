// AUDIO DIRECTOR — the creative + technical call on the FINAL audio, run AFTER the
// planner drafts and BEFORE anything is fetched or mixed.
//
// Unlike the old review agent (which only rated the audio after the fact), this
// agent ACTS: it decides whether a music bed and/or SFX are actually needed,
// curates the best-fitting bed + the handful of SFX that land on real moments, and
// sets VOICE-AWARE levels so nothing competes with the narration. The volumes it
// returns are the STARTING point; audio_mix then enforces the hierarchy hard (music
// + SFX ducked under the voice, master limiter). The voiceover script is never
// touched — only music + soundEffects.
//
// Fail-open: any error (LLM hiccup, bad JSON) returns the planner's plan unchanged,
// so the director can only ever improve the audio, never block a job.

const fs = require("node:fs");
const path = require("node:path");
const openrouter = require("./openrouter");
const { extractFirstJsonObject: parseJsonLenient } = require("./json_lenient");

const SYSTEM = fs.readFileSync(
  path.join(__dirname, "..", "prompts", "system_audio_director.md"),
  "utf8",
);

function clampNum(v, lo, hi, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
}

function buildUser({ storyboard, plan, brief, hasVoice, duration }) {
  const scenes = (storyboard.scenes || []).map((s, i) => ({
    index: i, kind: s.kind, headline: s.headline, subtext: s.subtext, emphasis: s.emphasis,
    durationSec: Number(s.duration) || null,
  }));
  const draft = {
    music: plan.music ? { query: plan.music.query, mood: plan.music.mood || null, volume: plan.music.volume } : null,
    soundEffects: Array.isArray(plan.soundEffects)
      ? plan.soundEffects.map((s) => ({ query: s.query, startSec: s.startSec, volume: s.volume, label: s.label || null }))
      : [],
  };
  return [
    `voiceoverPresent: ${!!hasVoice}`,
    brief ? `Brief: ${JSON.stringify({ tone: brief.tone, goal: brief.goal, audience: brief.audience })}` : "",
    `Title: ${storyboard.title || "(untitled)"}`,
    `Duration: ${duration}s`,
    "",
    "Storyboard scenes:",
    JSON.stringify(scenes, null, 1),
    "",
    "Planner DRAFT audio (refine/curate this):",
    JSON.stringify(draft, null, 1),
    "",
    "Return the final audio-direction JSON.",
  ].filter(Boolean).join("\n");
}

// Merge the director's decision onto the planner's plan. VO-aware clamping is the
// safety net if the model returns out-of-range levels.
function applyDecision(plan, decision, { hasVoice, duration, sceneCount = 0 }) {
  const out = { ...plan };
  const volLo = hasVoice ? 0.06 : 0.12, volHi = hasVoice ? 0.16 : 0.32, volDef = hasVoice ? 0.11 : 0.22;

  // --- music ---
  const m = decision && decision.music;
  if (m && m.include === false) {
    delete out.music;
  } else if (m && (m.query || plan.music)) {
    const query = String(m.query || plan.music?.query || m.mood || "").trim().slice(0, 80);
    if (query) {
      out.music = {
        query,
        mood: String(m.mood || plan.music?.mood || "").trim(),
        volume: clampNum(m.volume, volLo, volHi, plan.music?.volume ?? volDef),
      };
    }
  }

  // --- per-scene bed automation --- (scene-INDEXED; the pipeline converts to
  // seconds at mix time, after VO retiming has fixed the real scene starts)
  delete out.musicEnvelope;
  if (out.music && decision && Array.isArray(decision.musicEnvelope)) {
    const seen = new Set();
    const env = [];
    for (const p of decision.musicEnvelope.slice(0, 12)) {
      const scene = Number(p && p.scene);
      if (!Number.isInteger(scene) || scene < 0 || (sceneCount && scene >= sceneCount) || seen.has(scene)) continue;
      seen.add(scene);
      env.push({ scene, volume: clampNum(p.volume, volLo, volHi, out.music.volume) });
    }
    env.sort((a, b) => a.scene - b.scene);
    // A single point is just a flat bed — only keep an envelope that actually moves.
    if (env.length >= 2) out.musicEnvelope = env;
  }

  // --- ambient texture --- (rare; hard-capped so it can never become a second bed)
  delete out.ambient;
  const amb = decision && decision.ambient;
  if (amb && amb.include === true) {
    const query = String(amb.query || "").trim().slice(0, 60);
    if (query) {
      out.ambient = { query, volume: clampNum(amb.volume, 0.03, hasVoice ? 0.07 : 0.1, 0.05) };
    }
  }

  // --- sfx --- (director owns the curated list; empty array = intentionally none)
  if (decision && Array.isArray(decision.soundEffects)) {
    const sfxHi = hasVoice ? 0.5 : 0.6;
    const sfx = [];
    for (const s of decision.soundEffects.slice(0, 5)) {
      const query = String(s.query || "").trim().slice(0, 60);
      const startSec = Number(s.startSec);
      if (!query || !Number.isFinite(startSec) || startSec < 0 || startSec >= duration) continue;
      sfx.push({
        query,
        startSec: Math.round(startSec * 10) / 10,
        volume: clampNum(s.volume, 0.15, sfxHi, hasVoice ? 0.4 : 0.5),
        label: String(s.label || "").slice(0, 60),
      });
    }
    if (sfx.length) out.soundEffects = sfx; else delete out.soundEffects;
  }

  return out;
}

// Direct the audio. Returns { plan, decision } — plan is the curated plan to fetch
// + mix; decision is the raw judgment (for logging). Never throws.
async function directAudio({ storyboard, plan, brief = null, hasVoice = false, duration, tracker = null }) {
  const dur = Number(duration) || storyboard.durationSec || 0;
  // Nothing to direct (no music/sfx drafted, or audio disabled) → pass through.
  const hasDraftMusic = !!(plan && plan.music);
  const hasDraftSfx = !!(plan && Array.isArray(plan.soundEffects) && plan.soundEffects.length);
  if (!plan || (!hasDraftMusic && !hasDraftSfx)) return { plan, decision: null };

  try {
    const { text, tokensIn, tokensOut } = await openrouter.chat({
      system: SYSTEM,
      user: buildUser({ storyboard, plan, brief, hasVoice, duration: dur }),
      jsonMode: true,
      temperature: 0.4,
      stage: "audioDirector",
    });
    if (tracker && typeof tracker.addLlm === "function") {
      tracker.addLlm({ inputTokens: tokensIn, outputTokens: tokensOut, stage: "audioDirector" });
    }
    const decision = parseJsonLenient(text);
    if (!decision || typeof decision !== "object") return { plan, decision: null };
    const curated = applyDecision(plan, decision, {
      hasVoice, duration: dur, sceneCount: (storyboard.scenes || []).length,
    });
    return { plan: curated, decision };
  } catch (e) {
    console.warn(`[audio-director] failed, keeping planner draft: ${String(e && e.message).slice(0, 140)}`);
    return { plan, decision: null };
  }
}

function summarizeDecision(plan, decision) {
  const env = Array.isArray(plan.musicEnvelope) && plan.musicEnvelope.length
    ? `+env[${plan.musicEnvelope.map((p) => `s${p.scene}:${p.volume}`).join(",")}]` : "";
  const amb = plan.ambient ? ` | ambient "${plan.ambient.query}"@${plan.ambient.volume}` : "";
  const music = plan.music ? `music "${plan.music.query}"@${plan.music.volume}${env}${amb}` : "no-music";
  const sfx = Array.isArray(plan.soundEffects) && plan.soundEffects.length
    ? `${plan.soundEffects.length} sfx [${plan.soundEffects.map((s) => `${s.query}@${s.startSec}s`).join(", ")}]`
    : "no-sfx";
  const why = decision && decision.reason ? ` — ${String(decision.reason).slice(0, 120)}` : "";
  return `${music} | ${sfx}${why}`;
}

module.exports = { directAudio, summarizeDecision, applyDecision };
