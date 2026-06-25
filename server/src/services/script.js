// Stage 3: Creative Brief -> detailed production script (the USER-EDITABLE
// checkpoint). Also exports validateScript() so the approve endpoint can
// re-validate a user-edited script with the same rules, plus normalizeScript()
// which re-derives scene starts so edits to durations stay consistent.

const fs = require("node:fs");
const path = require("node:path");
const { z } = require("zod");
const config = require("../config");
const openrouter = require("./openrouter");

const SYSTEM = fs.readFileSync(
  path.join(__dirname, "..", "prompts", "system_script.md"),
  "utf8"
);

const AssetNeedSchema = z.object({
  type: z.enum(["image", "video", "icon"]),
  query: z.string().min(2).max(80),
  role: z.enum(["background", "inset", "texture"]),
});

const SceneSchema = z.object({
  id: z.string().min(1).max(12),
  start: z.number().min(0),
  duration: z.number().min(1).max(12),
  purpose: z.string().min(2).max(24),
  voiceover: z.string().max(400),
  onScreenText: z.array(z.string().min(1).max(80)).max(4).default([]),
  visualDirection: z.string().min(5).max(500),
  assetNeeds: z.array(AssetNeedSchema).max(3).default([]),
  sfx: z.array(z.string().min(1).max(40)).max(2).default([]),
  musicCue: z.string().min(2).max(20),
});

const ScriptSchema = z.object({
  title: z.string().min(2).max(120),
  scenes: z.array(SceneSchema).min(2).max(24),
  music: z.object({
    mood: z.string().min(2).max(200),
    query: z.string().min(2).max(80),
  }),
  voice: z.object({
    style: z.string().min(2).max(300),
    pace: z.string().min(2).max(40),
  }),
});

// Words a voice can comfortably speak per second.
const WORDS_PER_SEC = 2.6;
// Allow this much VO overrun before flagging (vo_fit tightens later anyway).
const VO_TOLERANCE = 1.35;

function wordCount(s) { return (s.trim().match(/\S+/g) || []).length; }

// Re-derive starts from durations (sequential, gapless) and round to 0.1s.
// Lets the editor change durations / reorder / delete scenes without having
// to keep `start` fields consistent by hand.
function normalizeScript(script, { targetDuration } = {}) {
  const s = JSON.parse(JSON.stringify(script));
  // Cap scene count first (schema allows max 24) so timing/total below is
  // computed over the kept scenes only.
  if (Array.isArray(s.scenes) && s.scenes.length > 24) s.scenes = s.scenes.slice(0, 24);
  let t = 0;
  s.scenes.forEach((scene, i) => {
    scene.id = scene.id || `s${i + 1}`;
    scene.duration = Math.round(scene.duration * 10) / 10;
    scene.start = Math.round(t * 10) / 10;
    t += scene.duration;
    // Clamp per-scene arrays to the schema caps so a minor overflow (e.g. the
    // model emits 5 onScreenText lines) is TRIMMED here rather than throwing a
    // hard schema rejection that fails the whole script.
    if (Array.isArray(scene.onScreenText)) scene.onScreenText = scene.onScreenText.slice(0, 4);
    if (Array.isArray(scene.assetNeeds)) scene.assetNeeds = scene.assetNeeds.slice(0, 3);
    if (Array.isArray(scene.sfx)) scene.sfx = scene.sfx.slice(0, 2);
  });

  // Snap total to the target duration. Absorb drift into the last scene first,
  // then spill into earlier scenes if it can't take it all within [1,15], so the
  // total always lands on target instead of failing validation. Starts are then
  // recomputed since redistribution can change non-last durations.
  if (targetDuration && s.scenes.length) {
    const r1 = (n) => Math.round(n * 10) / 10;
    let drift = r1(targetDuration - t);
    for (let guard = 0; Math.abs(drift) >= 0.05 && guard < s.scenes.length * 2; guard++) {
      let moved = false;
      for (let i = s.scenes.length - 1; i >= 0 && Math.abs(drift) >= 0.05; i--) {
        const sc = s.scenes[i];
        const newDur = Math.min(15, Math.max(1, r1(sc.duration + drift)));
        const applied = r1(newDur - sc.duration);
        if (applied !== 0) { sc.duration = newDur; drift = r1(drift - applied); moved = true; }
      }
      if (!moved) break;
    }
    let c = 0;
    for (const sc of s.scenes) { sc.start = r1(c); c = r1(c + sc.duration); }
  }
  return s;
}

// Structural + editorial validation. Returns { ok, errors, warnings }.
// `errors` block production; `warnings` (VO pace) are surfaced to the editor.
function validateScript(script, { targetDuration } = {}) {
  const errors = [];
  const warnings = [];

  const parsed = ScriptSchema.safeParse(script);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      warnings,
    };
  }

  const s = parsed.data;
  let expectedStart = 0;
  const ids = new Set();
  for (const scene of s.scenes) {
    if (ids.has(scene.id)) errors.push(`duplicate scene id ${scene.id}`);
    ids.add(scene.id);
    if (Math.abs(scene.start - expectedStart) > 0.05) {
      errors.push(`scene ${scene.id}: start ${scene.start} != expected ${expectedStart.toFixed(1)} (scenes must be sequential and gapless)`);
    }
    expectedStart = Math.round((expectedStart + scene.duration) * 10) / 10;

    const words = wordCount(scene.voiceover);
    const capacity = scene.duration * WORDS_PER_SEC;
    if (words > capacity * VO_TOLERANCE) {
      warnings.push(`scene ${scene.id}: VO is ${words} words but ~${Math.floor(capacity)} fit in ${scene.duration}s — will be tightened or feel rushed`);
    }
  }

  const total = Math.round(expectedStart * 10) / 10;
  if (targetDuration && Math.abs(total - targetDuration) > 0.2) {
    errors.push(`scene durations sum to ${total}s; expected ${targetDuration}s`);
  }

  return { ok: errors.length === 0, errors, warnings };
}

const { extractFirstJsonObject: parseLenient } = require("./json_lenient");

async function generateScript({ brief, signal }) {
  const targetDuration = brief.suggestedDuration;
  const user = [
    "Creative Brief:",
    JSON.stringify(brief, null, 2),
    "",
    `Target total duration: ${targetDuration} seconds exactly.`,
    "Write the production script JSON now.",
  ].join("\n");

  let totalIn = 0, totalOut = 0;
  let lastErr = "";
  let userMsg = user;

  // The default script model (gemini-2.5-flash) occasionally "lazy stops" and
  // returns a truncated JSON object. openrouter.chat now retries+falls back on
  // that, but as belt-and-suspenders the 2nd attempt escalates to a model that
  // reliably emits the full script (verified: gemini-2.5-pro returns it whole).
  const ESCALATION_MODEL = config.llm.scriptEscalationModel || "google/gemini-2.5-pro";

  for (let attempt = 1; attempt <= 2; attempt++) {
    const { text, tokensIn, tokensOut } = await openrouter.chat({
      system: SYSTEM,
      user: userMsg,
      jsonMode: true,
      stage: "script",
      temperature: 0.7,
      signal,
      ...(attempt === 2 ? { model: ESCALATION_MODEL } : {}),
    });
    totalIn += tokensIn;
    totalOut += tokensOut;

    try {
      const raw = normalizeScript(parseLenient(text), { targetDuration });
      const check = validateScript(raw, { targetDuration });
      if (!check.ok) throw new Error(check.errors.join("; "));
      console.log(`[script] ok on attempt ${attempt} (${raw.scenes.length} scenes, ${targetDuration}s, ${check.warnings.length} pace warning(s))`);
      return { script: raw, warnings: check.warnings, tokensIn: totalIn, tokensOut: totalOut };
    } catch (e) {
      lastErr = e.message;
      console.warn(`[script] attempt ${attempt} invalid: ${lastErr.slice(0, 300)}`);
      userMsg = `${user}\n\nYour previous reply failed validation:\n${lastErr.slice(0, 800)}\nReturn ONLY the corrected JSON object.`;
    }
  }

  throw new Error(`script generation failed after 2 attempts: ${lastErr.slice(0, 500)}`);
}

module.exports = { generateScript, validateScript, normalizeScript, ScriptSchema };
